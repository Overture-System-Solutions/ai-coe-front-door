import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { INTAKES_LIST_TITLE } from './GovernanceService';
import { MY_WORK_SELECT, MY_WORK_TOP, myWorkUrl, MyWorkService } from './myWorkService';
import type { IMyWorkResult } from './myWorkService';
import type { IListClient, IListResponse, IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const INTAKES_URL: string = `${SITE}/_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items`;

function contextFor(client: IListClient, email: string = 'ada@contoso.com'): IServiceContext {
  return { siteUrl: SITE, user: { displayName: 'Ada Example', email }, client, configuration: 'v1' };
}

function createHarness(email?: string): { store: InMemoryListStore; service: MyWorkService } {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE]);
  return { store, service: new MyWorkService(contextFor(createFakeListClient(store), email)) };
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
  store.seed(INTAKES_LIST_TITLE, [
    { Title: 'AI idea — OVT-AICOE-20260901-AAAAAAAA', IntakeId: 'OVT-AICOE-20260901-AAAAAAAA', WorkflowType: 'idea', Status: 'Submitted - Pilot', RequestorEmail: 'ada@contoso.com', SubmittedAt: '2026-09-01T10:00:00Z', Modified: '2026-09-02T08:00:00Z', PayloadJson: '{"secret":"never selected"}' },
    { Title: 'Help or training — OVT-AICOE-20260905-BBBBBBBB', IntakeId: 'OVT-AICOE-20260905-BBBBBBBB', WorkflowType: 'helpTraining', Status: 'In Review - Pilot', RequestorEmail: 'ada@contoso.com', SubmittedAt: '2026-09-05T10:00:00Z', Modified: '2026-09-05T10:00:00Z' },
    { Title: 'AI idea — OVT-AICOE-20260903-CCCCCCCC', IntakeId: 'OVT-AICOE-20260903-CCCCCCCC', WorkflowType: 'idea', Status: 'Submitted - Pilot', RequestorEmail: 'grace@contoso.com', SubmittedAt: '2026-09-03T10:00:00Z', Modified: '2026-09-03T10:00:00Z' }
  ]);
}

describe('my work url', () => {
  it('filters the intake list by the requestor email, projects the receipt columns and asks for the newest twenty', () => {
    expect(myWorkUrl(SITE, 'ada@contoso.com')).toBe(
      `${INTAKES_URL}?$filter=${encodeURIComponent("RequestorEmail eq 'ada@contoso.com'")}&$select=Id,Title,IntakeId,WorkflowType,Status,SubmittedAt,Modified&$orderby=SubmittedAt%20desc&$top=20`
    );
    expect(MY_WORK_SELECT).toBe('Id,Title,IntakeId,WorkflowType,Status,SubmittedAt,Modified');
    expect(MY_WORK_TOP).toBe(20);
  });

  it('doubles apostrophes in the email so the filter stays one clause', () => {
    expect(myWorkUrl(`${SITE}/`, "o'neil@contoso.com")).toContain(`$filter=${encodeURIComponent("RequestorEmail eq 'o''neil@contoso.com'")}&`);
  });
});

describe('MyWorkService', () => {
  it('reads the requests of the signed-in person once, newest first, with the workflow named', async () => {
    const { store, service } = createHarness();
    seedRows(store);
    const result: IMyWorkResult = await service.getMine();
    expect(result.state).toBe('ok');
    expect(result.failureClass).toBeUndefined();
    expect(result.items).toEqual([
      { id: 2, title: 'Help or training — OVT-AICOE-20260905-BBBBBBBB', reference: 'OVT-AICOE-20260905-BBBBBBBB', workflowType: 'helpTraining', workflowLabel: 'Help or training', status: 'In Review - Pilot', submittedAt: '2026-09-05T10:00:00Z', modified: '2026-09-05T10:00:00Z' },
      { id: 1, title: 'AI idea — OVT-AICOE-20260901-AAAAAAAA', reference: 'OVT-AICOE-20260901-AAAAAAAA', workflowType: 'idea', workflowLabel: 'AI idea', status: 'Submitted - Pilot', submittedAt: '2026-09-01T10:00:00Z', modified: '2026-09-02T08:00:00Z' }
    ]);
    const gets: IRecordedRequest[] = store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toBe(myWorkUrl(SITE, 'ada@contoso.com'));
    expect(gets[0].list).toBe(INTAKES_LIST_TITLE);
    expect(gets[0].query).toEqual({
      $filter: "RequestorEmail eq 'ada@contoso.com'",
      $select: 'Id,Title,IntakeId,WorkflowType,Status,SubmittedAt,Modified',
      $orderby: 'SubmittedAt desc',
      $top: '20'
    });
    expect(gets[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
    // The payload column is never asked for, so a row's answers never travel with the status.
    expect(JSON.stringify(result)).not.toContain('never selected');
  });

  it("matches an email with an apostrophe after doubling it", async () => {
    const { store, service } = createHarness("o'neil@contoso.com");
    store.seed(INTAKES_LIST_TITLE, [{ IntakeId: 'OVT-AICOE-20260901-DDDDDDDD', WorkflowType: 'feedback', Status: 'Closed - Pilot', RequestorEmail: "O'Neil@contoso.com", SubmittedAt: '2026-09-01T10:00:00Z' }]);
    const result: IMyWorkResult = await service.getMine();
    expect(result.state).toBe('ok');
    // The in-memory store compares the filter value exactly, as the server compares text columns without case folding here.
    expect(result.items).toEqual([]);
    store.seed(INTAKES_LIST_TITLE, [{ IntakeId: 'OVT-AICOE-20260902-EEEEEEEE', WorkflowType: 'feedback', Status: 'Closed - Pilot', RequestorEmail: "o'neil@contoso.com", SubmittedAt: '2026-09-02T10:00:00Z' }]);
    const again: IMyWorkResult = await service.getMine();
    expect(again.items.map((item): string => item.reference)).toEqual(['OVT-AICOE-20260902-EEEEEEEE']);
    expect(again.items[0].workflowLabel).toBe('Front-door feedback');
    expect(store.requests[1].query.$filter).toBe("RequestorEmail eq 'o''neil@contoso.com'");
  });

  it('keeps an unknown workflow type as its own label and tolerates missing columns', async () => {
    const { store, service } = createHarness();
    store.seed(INTAKES_LIST_TITLE, [{ IntakeId: 'OVT-AICOE-20260901-FFFFFFFF', WorkflowType: 'outcome', RequestorEmail: 'ada@contoso.com' }]);
    const result: IMyWorkResult = await service.getMine();
    expect(result.items).toEqual([{ id: 1, title: '', reference: 'OVT-AICOE-20260901-FFFFFFFF', workflowType: 'outcome', workflowLabel: 'outcome', status: '' }]);
  });

  it('sees only the rows item-level security leaves visible', async () => {
    const { store, service } = createHarness();
    seedRows(store);
    store.trimTo('ada@contoso.com');
    const result: IMyWorkResult = await service.getMine();
    expect(result.items.map((item): string => item.reference)).toEqual(['OVT-AICOE-20260905-BBBBBBBB', 'OVT-AICOE-20260901-AAAAAAAA']);
    expect(JSON.stringify(result)).not.toContain('CCCCCCCC');
  });

  it('reports a refused read as denied, without the body', async () => {
    await silenced(async (errorSpy: jest.SpyInstance): Promise<void> => {
      const { store, service } = createHarness();
      seedRows(store);
      store.deny(INTAKES_LIST_TITLE);
      const result: IMyWorkResult = await service.getMine();
      expect(result).toEqual({ state: 'denied', items: [], message: 'The request list could not be read: AI CoE Pilot Intakes answered 403.', failureClass: 'PERMISSION', userMessage: 'Needs access.' });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0].join(' '))).not.toContain('Access denied');
      store.deny(INTAKES_LIST_TITLE, 401);
      expect((await service.getMine()).state).toBe('denied');
    });
  });

  it('reports a missing list or a server failure as unavailable with its class', async () => {
    await silenced(async (): Promise<void> => {
      const { store, service } = createHarness();
      store.fail(INTAKES_LIST_TITLE, 404, 'List not found');
      const missing: IMyWorkResult = await service.getMine();
      expect(missing).toEqual({ state: 'unavailable', items: [], message: 'The request list could not be read: AI CoE Pilot Intakes answered 404.', failureClass: 'SOURCE', userMessage: 'Not available on this site.' });
      store.fail(INTAKES_LIST_TITLE, 500, 'boom');
      const broken: IMyWorkResult = await service.getMine();
      expect(broken.state).toBe('unavailable');
      expect(broken.failureClass).toBe('TRANSIENT');
      expect(broken.items).toEqual([]);
    });
  });

  it('never throws when the client fails or answers nonsense', async () => {
    await silenced(async (): Promise<void> => {
      const failing: IListClient = {
        get: (): Promise<never> => Promise.reject(new Error('network down')),
        post: (): Promise<never> => Promise.reject(new Error('unexpected'))
      };
      const result: IMyWorkResult = await new MyWorkService(contextFor(failing)).getMine();
      expect(result).toEqual({ state: 'unavailable', items: [], message: 'The request list could not be read: network down', failureClass: 'TRANSIENT', userMessage: 'Not available right now; try again.' });
      const nonsense: IListClient = {
        get: (): Promise<IListResponse> => Promise.resolve({ ok: true, status: 200, text: (): Promise<string> => Promise.resolve('[]'), json: (): Promise<unknown> => Promise.resolve([]) }),
        post: (): Promise<never> => Promise.reject(new Error('unexpected'))
      };
      const odd: IMyWorkResult = await new MyWorkService(contextFor(nonsense)).getMine();
      expect(odd.state).toBe('ok');
      expect(odd.items).toEqual([]);
    });
  });

  it('reads nothing for an account without an email and says why', async () => {
    const { store, service } = createHarness('  ');
    const result: IMyWorkResult = await service.getMine();
    expect(result.state).toBe('unavailable');
    expect(result.items).toEqual([]);
    expect(result.failureClass).toBe('IMPLEMENTATION');
    expect(store.requests).toHaveLength(0);
  });
});
