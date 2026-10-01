import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { PROGRAM_MEASURES_LIST_TITLE } from './lists';
import { MEASURES_SELECT, MEASURES_TOP, measuresUrl, ProgramMeasuresService } from './programMeasuresService';
import type { IProgramMeasure, IProgramMeasuresResult } from './programMeasuresService';
import type { IListClient, IListResponse, IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const MEASURES_URL: string = `${SITE}/_api/web/lists/getbytitle('AI CoE Program Measures')/items`;

function contextFor(client: IListClient): IServiceContext {
  return { siteUrl: SITE, user: { displayName: 'Ada Example', email: 'ada@contoso.com' }, client, configuration: 'v1' };
}

function createHarness(): { store: InMemoryListStore; service: ProgramMeasuresService } {
  const store: InMemoryListStore = new InMemoryListStore([PROGRAM_MEASURES_LIST_TITLE]);
  return { store, service: new ProgramMeasuresService(contextFor(createFakeListClient(store))) };
}

/** Runs `run` with `console.error` silenced (the service logs every refused read, status only). */
async function silenced<T>(run: (errorSpy: jest.SpyInstance) => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run(errorSpy);
  } finally {
    errorSpy.mockRestore();
  }
}

function seedRows(store: InMemoryListStore): void {
  store.seed(PROGRAM_MEASURES_LIST_TITLE, [
    {
      Title: 'Useful safe completion rate',
      MeasureId: 'useful-safe-completion-rate',
      Value: 0.62,
      Unit: '%',
      State: 'MEASURED',
      PeriodStart: '2026-04-01T00:00:00Z',
      PeriodEnd: '2026-06-30T00:00:00Z',
      EvidenceRef: 'EV-2026-Q2',
      EvidenceNote: 'Read from the quarterly review pack.',
      CohortSize: 48
    },
    {
      Title: 'Median time to a useful outcome',
      MeasureId: 'median-time-to-useful-outcome',
      Value: null,
      Unit: 'minutes',
      State: 'PENDING_BASELINE',
      EvidenceNote: 'The first period is not complete.',
      CohortSize: 0
    },
    { Title: 'Repeat-use useful completion rate', MeasureId: 'repeat-use-useful-completion-rate', State: 'Made up', Value: 0.9 }
  ]);
}

describe('measures url', () => {
  it('projects the declared columns of the measures list and asks for one page of rows', () => {
    expect(measuresUrl(SITE)).toBe(
      `${MEASURES_URL}?$select=Id,Title,MeasureId,Value,Unit,State,PeriodStart,PeriodEnd,EvidenceRef,EvidenceNote,CohortSize&$top=100`
    );
    expect(MEASURES_SELECT).toBe('Id,Title,MeasureId,Value,Unit,State,PeriodStart,PeriodEnd,EvidenceRef,EvidenceNote,CohortSize');
    expect(MEASURES_TOP).toBe(100);
    expect(measuresUrl(`${SITE}/`)).toBe(measuresUrl(SITE));
  });
});

describe('ProgramMeasuresService', () => {
  it('reads the measures once and keys them by their measure id', async () => {
    const { store, service } = createHarness();
    seedRows(store);
    const result: IProgramMeasuresResult = await service.getMeasures();
    expect(result.state).toBe('ok');
    expect(result.failureClass).toBeUndefined();
    const measured: IProgramMeasure = result.measures['useful-safe-completion-rate'];
    expect(measured).toEqual({
      id: 'useful-safe-completion-rate',
      title: 'Useful safe completion rate',
      state: 'MEASURED',
      value: 0.62,
      unit: '%',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      evidenceRef: 'EV-2026-Q2',
      evidenceNote: 'Read from the quarterly review pack.',
      cohortSize: 48
    });
    // A row with no value keeps none: a blank never arrives as zero, and a zero cohort is a zero, not a blank.
    expect(result.measures['median-time-to-useful-outcome']).toEqual({
      id: 'median-time-to-useful-outcome',
      title: 'Median time to a useful outcome',
      state: 'PENDING_BASELINE',
      unit: 'minutes',
      evidenceNote: 'The first period is not complete.',
      cohortSize: 0
    });
    const gets: IRecordedRequest[] = store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toBe(measuresUrl(SITE));
    expect(gets[0].list).toBe(PROGRAM_MEASURES_LIST_TITLE);
    expect(gets[0].query).toEqual({ $select: MEASURES_SELECT, $top: '100' });
    expect(gets[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
  });

  it('reads a state it does not know as not available, never as a number', async () => {
    const { store, service } = createHarness();
    seedRows(store);
    const result: IProgramMeasuresResult = await service.getMeasures();
    // The row claims a value; without a state the front door knows, the page can say nothing about it.
    expect(result.measures['repeat-use-useful-completion-rate'].state).toBe('NOT_AVAILABLE');
    expect(result.measures['repeat-use-useful-completion-rate'].value).toBe(0.9);
    store.seed(PROGRAM_MEASURES_LIST_TITLE, [{ MeasureId: 'blank-state', Value: 1, State: '' }, { MeasureId: 'no-state', Value: 1 }]);
    const again: IProgramMeasuresResult = await service.getMeasures();
    expect(again.measures['blank-state'].state).toBe('NOT_AVAILABLE');
    expect(again.measures['no-state'].state).toBe('NOT_AVAILABLE');
  });

  it('drops a row with no measure id and keeps the first of two that share one', async () => {
    const { store, service } = createHarness();
    store.seed(PROGRAM_MEASURES_LIST_TITLE, [
      { Title: 'Nameless', State: 'MEASURED', Value: 3 },
      { MeasureId: 'twice', Title: 'First', State: 'MEASURED', Value: 1 },
      { MeasureId: 'twice', Title: 'Second', State: 'MEASURED', Value: 2 }
    ]);
    const result: IProgramMeasuresResult = await service.getMeasures();
    expect(Object.keys(result.measures)).toEqual(['twice']);
    // The list enforces a unique measure id; if a site ever holds two, the first row read is the one shown.
    expect(result.measures.twice.title).toBe('First');
  });

  it('reports a list that is not on the site as unavailable, with no measures at all', async () => {
    await silenced(async (errorSpy: jest.SpyInstance): Promise<void> => {
      const store: InMemoryListStore = new InMemoryListStore([]);
      const service: ProgramMeasuresService = new ProgramMeasuresService(contextFor(createFakeListClient(store)));
      const result: IProgramMeasuresResult = await service.getMeasures();
      expect(result).toEqual({
        state: 'unavailable',
        measures: {},
        message: 'The measures list could not be read: AI CoE Program Measures answered 404.',
        failureClass: 'SOURCE',
        userMessage: 'Not available on this site.'
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0].join(' '))).not.toContain('List not found');
    });
  });

  it('reports a refused or broken read as unavailable with its class, without the body', async () => {
    await silenced(async (): Promise<void> => {
      const { store, service } = createHarness();
      seedRows(store);
      store.deny(PROGRAM_MEASURES_LIST_TITLE);
      const denied: IProgramMeasuresResult = await service.getMeasures();
      expect(denied.state).toBe('unavailable');
      expect(denied.measures).toEqual({});
      expect(denied.failureClass).toBe('PERMISSION');
      expect(denied.userMessage).toBe('Needs access.');
      expect(JSON.stringify(denied)).not.toContain('Access denied');
      store.fail(PROGRAM_MEASURES_LIST_TITLE, 500, 'boom');
      const broken: IProgramMeasuresResult = await service.getMeasures();
      expect(broken.state).toBe('unavailable');
      expect(broken.failureClass).toBe('TRANSIENT');
    });
  });

  it('never throws when the client fails or answers nonsense', async () => {
    await silenced(async (): Promise<void> => {
      const failing: IListClient = {
        get: (): Promise<never> => Promise.reject(new Error('network down')),
        post: (): Promise<never> => Promise.reject(new Error('unexpected'))
      };
      const result: IProgramMeasuresResult = await new ProgramMeasuresService(contextFor(failing)).getMeasures();
      expect(result).toEqual({
        state: 'unavailable',
        measures: {},
        message: 'The measures list could not be read: network down',
        failureClass: 'TRANSIENT',
        userMessage: 'Not available right now; try again.'
      });
      const nonsense: IListClient = {
        get: (): Promise<IListResponse> => Promise.resolve({ ok: true, status: 200, text: (): Promise<string> => Promise.resolve('[]'), json: (): Promise<unknown> => Promise.resolve([]) }),
        post: (): Promise<never> => Promise.reject(new Error('unexpected'))
      };
      const odd: IProgramMeasuresResult = await new ProgramMeasuresService(contextFor(nonsense)).getMeasures();
      expect(odd.state).toBe('ok');
      expect(odd.measures).toEqual({});
    });
  });
});
