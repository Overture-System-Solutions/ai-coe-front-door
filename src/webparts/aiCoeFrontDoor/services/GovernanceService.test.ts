import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { CORRECTION_CATEGORIES, OUTCOME_COLUMNS, OUTCOME_WORKFLOW_VERSION } from '../content/workflows/outcome';
import {
  DECISIONS_LIST_TITLE,
  GovernanceService,
  INTAKES_LIST_TITLE,
  isGovernanceWorkflow,
  listItemsUrl,
  OUTCOME_RECORDS_LIST_TITLE,
  USE_CASES_LIST_TITLE,
  workflowLabel
} from './GovernanceService';
import { submissionState } from './types';
import type { IAdminDashboardData, IListClient, IListRequestOptions, IListResponse, IServiceContext, ISubmissionResult } from './types';

const FIXED_NOW: Date = new Date(Date.UTC(2026, 8, 11, 14, 30, 0));
const FIXED_ID: string = 'OVT-AICOE-20260911-FIXEDSUF';
const INTAKES_URL: string = "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items";
const USE_CASES_URL: string = "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Use Cases')/items";
const OUTCOMES_URL: string = "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Outcome Records')/items";

function filterUrl(itemsUrl: string, field: string, value: string): string {
  return `${itemsUrl}?$select=Id,${field},Modified&$filter=${encodeURIComponent(`${field} eq '${value}'`)}&$top=1`;
}

function gets(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET');
}

/** Runs `run` with `console.error` silenced (the service logs every failure and every unconfirmed readback). */
async function silenced<T>(run: (errorSpy: jest.SpyInstance) => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run(errorSpy);
  } finally {
    errorSpy.mockRestore();
  }
}

function createHarness(): { store: InMemoryListStore; service: GovernanceService } {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE, DECISIONS_LIST_TITLE, OUTCOME_RECORDS_LIST_TITLE]);
  const context: IServiceContext = {
    siteUrl: 'https://example.sharepoint.com/sites/demo/',
    user: { displayName: 'Pat Lee', email: 'pat@example.com' },
    client: createFakeListClient(store),
    configuration: 'v1-configuration'
  };
  const service: GovernanceService = new GovernanceService(context, (): Date => FIXED_NOW, (): string => 'OVT-AICOE-20260911-FIXEDSUF');
  return { store, service };
}

function posts(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.method === 'POST');
}

describe('list helpers', () => {
  it('builds the items endpoint and escapes apostrophes in titles', () => {
    expect(listItemsUrl('https://example.sharepoint.com/sites/demo/', "O'Brien List")).toBe(
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('O''Brien List')/items"
    );
  });

  it('labels workflow types and classifies governance routes', () => {
    expect(workflowLabel('idea')).toBe('AI idea');
    expect(workflowLabel('toolCheck')).toBe('Tool or task check');
    expect(workflowLabel('toolCheck-review-request')).toBe('CoE review request');
    expect(workflowLabel('teamUsage')).toBe('Existing team AI use');
    expect(workflowLabel('helpTraining')).toBe('Help or training');
    expect(workflowLabel('feedback')).toBe('Front-door feedback');
    expect(isGovernanceWorkflow('idea')).toBe(true);
    expect(isGovernanceWorkflow('toolCheck-review-request')).toBe(true);
    expect(isGovernanceWorkflow('teamUsage')).toBe(true);
    expect(isGovernanceWorkflow('toolCheck')).toBe(false);
    expect(isGovernanceWorkflow('helpTraining')).toBe(false);
    expect(isGovernanceWorkflow('feedback')).toBe(false);
  });
});

describe('GovernanceService.submitWorkflow', () => {
  it('writes a service-queue submission to the pilot intakes list only', async () => {
    const { store, service } = createHarness();
    const payload: object = { originalAnswers: { helpCategory: 'new', name: 'Sam', email: 'sam@example.com' } };
    const result: ISubmissionResult = await service.submitWorkflow('helpTraining', payload);

    const requests: IRecordedRequest[] = posts(store);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items");
    expect(requests[0].headers).toEqual({ Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' });
    expect(requests[0].body).toEqual({
      Title: 'Help or training — OVT-AICOE-20260911-FIXEDSUF',
      IntakeId: 'OVT-AICOE-20260911-FIXEDSUF',
      WorkflowType: 'helpTraining',
      PilotWorkflowVersion: '2.1',
      Status: 'Submitted - Pilot',
      Priority: 'Normal',
      RequestorName: 'Sam',
      RequestorEmail: 'sam@example.com',
      SubmittedAt: '2026-09-11T14:30:00.000Z',
      CompanyDataOrWorkflow: false,
      SensitiveOrRegulated: false,
      HumanReview: 'Not specified',
      ToolName: '',
      RoutingOutcome: 'AI CoE service queue',
      PayloadJson: JSON.stringify(payload),
      PilotOnly: true
    });
    expect(result).toEqual({
      connected: true,
      state: 'saved',
      intakeId: 'OVT-AICOE-20260911-FIXEDSUF',
      itemId: 1,
      itemUrl: 'https://example.sharepoint.com/sites/demo/Lists/AICoEPilotIntakes/DispForm.aspx?ID=1',
      governanceItemId: undefined,
      governanceItemUrl: undefined,
      savedAt: '2026-09-11T14:30:00.000Z',
      version: '2.1',
      message: 'Submission received and added to the AI CoE service queue.'
    });
  });

  it('also creates a use case for governance routes with the same identifier', async () => {
    const { store, service } = createHarness();
    const payload: object = {
      workflowVersion: '2.1',
      requestedBy: { name: 'Pat Lee', email: 'pat@example.com' },
      reviewIndicators: ['Employee or customer information may be involved'],
      confirmedSummary: { problemToSolve: 'Forms are checked by hand.', desiredOutcome: 'Faster checks', possibleMeasuresOfSuccess: 'Fewer corrections' },
      originalAnswers: {
        workToImprove: 'Reviewing forms',
        painPoints: 'Slow',
        informationCategories: ['customer'],
        aiAlreadyUsed: 'yes',
        aiToolName: 'Copilot',
        desiredOutcome: 'Faster checks',
        estimatedMonthlyCost: '12.5'
      }
    };
    const result: ISubmissionResult = await service.submitWorkflow('idea', payload);

    const requests: IRecordedRequest[] = posts(store);
    expect(requests.map((request: IRecordedRequest): string | undefined => request.list)).toEqual([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE]);
    const intake: { [field: string]: unknown } = requests[0].body as { [field: string]: unknown };
    expect(intake.Title).toBe('AI idea — OVT-AICOE-20260911-FIXEDSUF');
    expect(intake.Priority).toBe('High');
    expect(intake.CompanyDataOrWorkflow).toBe(true);
    expect(intake.SensitiveOrRegulated).toBe(true);
    expect(intake.ToolName).toBe('Copilot');
    expect(intake.RoutingOutcome).toBe('AI CoE governance review');
    expect(intake.PilotOnly).toBe(false);
    expect(requests[1].body).toEqual({
      Title: 'AI idea — OVT-AICOE-20260911-FIXEDSUF',
      CoEID: 'OVT-AICOE-20260911-FIXEDSUF',
      SubmitterEmail: 'pat@example.com',
      BusinessProblem: 'Forms are checked by hand.',
      BusinessOwnerEmail: 'pat@example.com',
      DataSensitivity: 'Restricted',
      ExternalUsers: false,
      AutonomousActions: false,
      EstimatedMonthlyCost: 12.5,
      Status: 'Submitted',
      IntakeProcessed: false,
      TriageComplete: false,
      ApprovalRequested: false,
      LastStatusChanged: '2026-09-11T14:30:00.000Z',
      PilotMeasure: 'Faster checks\n\nFewer corrections\n\nFaster checks'
    });
    expect(result.governanceItemId).toBe(2);
    expect(result.governanceItemUrl).toBe('https://example.sharepoint.com/sites/demo/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=2');
    expect(result.message).toBe('Submission received and queued for AI CoE intake and triage.');
  });

  it('falls back to the page user, the outcome routing and a default business problem', async () => {
    const { store, service } = createHarness();
    await service.submitWorkflow('toolCheck-review-request', { outcome: 'Please request a CoE review before proceeding', originalAnswers: { humanReview: 'always', toolName: 'Tool X' } });
    const [intake, useCase] = posts(store).map((request: IRecordedRequest): { [field: string]: unknown } => request.body as { [field: string]: unknown });
    expect(intake.RequestorName).toBe('Pat Lee');
    expect(intake.RequestorEmail).toBe('pat@example.com');
    expect(intake.HumanReview).toBe('always');
    expect(intake.ToolName).toBe('Tool X');
    expect(intake.RoutingOutcome).toBe('Please request a CoE review before proceeding');
    expect(intake.Priority).toBe('High');
    expect(useCase.BusinessProblem).toBe('Please request a CoE review before proceeding');
    expect(useCase.EstimatedMonthlyCost).toBe(0);
    expect(useCase.PilotMeasure).toBe('');
    await service.submitWorkflow('teamUsage', { originalAnswers: {} });
    expect((posts(store)[3].body as { [field: string]: unknown }).BusinessProblem).toBe('Existing team AI use submitted through the AI CoE Front Door.');
  });

  it('uses Unknown when no name is available anywhere', async () => {
    const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE]);
    const service: GovernanceService = new GovernanceService(
      { siteUrl: 'https://example.sharepoint.com', user: { displayName: '', email: '' }, client: createFakeListClient(store), configuration: undefined },
      (): Date => FIXED_NOW,
      (): string => 'OVT-AICOE-20260911-FIXEDSUF'
    );
    await service.submitWorkflow('feedback', {});
    const body: { [field: string]: unknown } = posts(store)[0].body as { [field: string]: unknown };
    expect(body.RequestorName).toBe('Unknown');
    expect(body.RequestorEmail).toBe('');
    expect(body.PayloadJson).toBe('{}');
  });

  it('truncates oversized payloads exactly as shipped', async () => {
    const { store, service } = createHarness();
    await service.submitWorkflow('feedback', { text: 'x'.repeat(70000) });
    const payloadJson: string = (posts(store)[0].body as { PayloadJson: string }).PayloadJson;
    expect(payloadJson).toHaveLength(59940 + '...[truncated]'.length);
    expect(payloadJson.slice(-14)).toBe('...[truncated]');
  });

  it('reports a failed write without throwing', async () => {
    const { store, service } = createHarness();
    store.fail(INTAKES_LIST_TITLE, 500, 'boom');
    const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const result: ISubmissionResult = await service.submitWorkflow('idea', { originalAnswers: {} });
      expect(result).toEqual({
        connected: false,
        state: 'failed',
        intakeId: 'OVT-AICOE-20260911-FIXEDSUF',
        message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 500: boom',
        failureClass: 'TRANSIENT',
        userMessage: 'Not available right now; try again.'
      });
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission failed', 'AI CoE Pilot Intakes returned 500 (TRANSIENT)');
      expect(posts(store)).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('classifies a refused write and keeps the response body out of the user message and the console', async () => {
    const { store, service } = createHarness();
    const body: string = '{"error":{"message":"Access denied. token=eyJabc"}}';
    store.fail(INTAKES_LIST_TITLE, 403, body);
    const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const result: ISubmissionResult = await service.submitWorkflow('feedback', { originalAnswers: {} });
      expect(result.connected).toBe(false);
      expect(result.failureClass).toBe('PERMISSION');
      expect(result.userMessage).toBe('Needs access.');
      expect(result.userMessage).not.toContain('token');
      expect(result.message).toBe(`SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 403: ${body}`);
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission failed', 'AI CoE Pilot Intakes returned 403 (PERMISSION)');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('classifies a missing list as a source failure and a rejected client as transient', async () => {
    const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const store: InMemoryListStore = new InMemoryListStore([]);
      const missing: GovernanceService = new GovernanceService(
        { siteUrl: 'https://example.sharepoint.com', user: { displayName: 'Pat', email: 'pat@example.com' }, client: createFakeListClient(store), configuration: undefined },
        (): Date => FIXED_NOW,
        (): string => 'OVT-AICOE-20260911-FIXEDSUF'
      );
      const notFound: ISubmissionResult = await missing.submitWorkflow('feedback', {});
      expect(notFound.failureClass).toBe('SOURCE');
      expect(notFound.userMessage).toBe('Not available on this site.');
      expect(notFound.message).toBe('SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 404: List not found');
      expect(errorSpy).toHaveBeenLastCalledWith('AI CoE submission failed', 'AI CoE Pilot Intakes returned 404 (SOURCE)');

      const offline: GovernanceService = new GovernanceService(
        {
          siteUrl: 'https://example.sharepoint.com',
          user: { displayName: 'Pat', email: 'pat@example.com' },
          client: { get: (): Promise<never> => Promise.reject(new Error('Failed to fetch')), post: (): Promise<never> => Promise.reject(new Error('Failed to fetch')) },
          configuration: undefined
        },
        (): Date => FIXED_NOW,
        (): string => 'OVT-AICOE-20260911-FIXEDSUF'
      );
      const network: ISubmissionResult = await offline.submitWorkflow('feedback', {});
      expect(network.failureClass).toBe('TRANSIENT');
      expect(network.userMessage).toBe('Not available right now; try again.');
      expect(network.message).toBe('SharePoint could not create the AI CoE record. Failed to fetch');
      expect(errorSpy).toHaveBeenLastCalledWith('AI CoE submission failed', 'TRANSIENT: Failed to fetch');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('carries no failure class on a successful write', async () => {
    const { service } = createHarness();
    const result: ISubmissionResult = await service.submitWorkflow('feedback', {});
    expect(result.connected).toBe(true);
    expect(result.failureClass).toBeUndefined();
    expect(result.userMessage).toBeUndefined();
  });
});

describe('GovernanceService.submitWorkflow readback and retry', () => {
  it('reads the intake row back after the POST and reports it saved with the time and version', async () => {
    const { store, service } = createHarness();
    const result: ISubmissionResult = await service.submitWorkflow('helpTraining', { originalAnswers: { helpCategory: 'new' } });

    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([
      `POST ${INTAKES_URL}`,
      `GET ${INTAKES_URL}(1)?$select=Id,IntakeId,Modified`
    ]);
    expect(gets(store)[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
    expect(result.state).toBe('saved');
    expect(result.connected).toBe(true);
    expect(result.savedAt).toBe('2026-09-11T14:30:00.000Z');
    expect(result.version).toBe('2.1');
    expect(result.failureClass).toBeUndefined();
    expect(submissionState(result)).toBe('saved');
  });

  it('takes the saved time from the row when the readback carries a Modified stamp', async () => {
    const { store, service } = createHarness();
    store.afterPost(INTAKES_LIST_TITLE, (item): void => {
      item.Modified = '2026-09-11T14:30:02.000Z';
    });
    const result: ISubmissionResult = await service.submitWorkflow('feedback', {});
    expect(result.state).toBe('saved');
    expect(result.savedAt).toBe('2026-09-11T14:30:02.000Z');
  });

  it('reports pending, not failed, when the POST was accepted but the readback fails', async () => {
    const { store, service } = createHarness();
    store.afterPost(INTAKES_LIST_TITLE, (): void => store.fail(INTAKES_LIST_TITLE, 500, 'gateway timeout secret=xyz'));
    const result: ISubmissionResult = await silenced(async (errorSpy: jest.SpyInstance): Promise<ISubmissionResult> => {
      const pending: ISubmissionResult = await service.submitWorkflow('helpTraining', { originalAnswers: {} });
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission not confirmed', 'AI CoE Pilot Intakes returned 500 (TRANSIENT)');
      return pending;
    });

    expect(result).toEqual({
      connected: false,
      state: 'pending',
      intakeId: FIXED_ID,
      itemId: 1,
      itemUrl: 'https://example.sharepoint.com/sites/demo/Lists/AICoEPilotIntakes/DispForm.aspx?ID=1',
      governanceItemId: undefined,
      governanceItemUrl: undefined,
      version: '2.1',
      message: `SharePoint accepted the AI CoE record ${FIXED_ID} but did not confirm it back.`,
      failureClass: 'INCONCLUSIVE',
      userMessage: 'Saved, not yet confirmed.'
    });
    expect(result.message).not.toContain('secret');
    expect(submissionState(result)).toBe('pending');
    expect(posts(store)).toHaveLength(1);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
  });

  it('reports pending when the row read back does not carry the identifier that was written', async () => {
    const { store, service } = createHarness();
    store.afterPost(INTAKES_LIST_TITLE, (item): void => {
      item.IntakeId = 'OVT-AICOE-20260911-SOMEBODY';
    });
    const result: ISubmissionResult = await silenced(async (errorSpy: jest.SpyInstance): Promise<ISubmissionResult> => {
      const pending: ISubmissionResult = await service.submitWorkflow('feedback', {});
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission not confirmed', 'AI CoE Pilot Intakes readback mismatch (INCONCLUSIVE)');
      return pending;
    });
    expect(result.state).toBe('pending');
    expect(result.failureClass).toBe('INCONCLUSIVE');
    expect(result.connected).toBe(false);
  });

  it('reuses the identifier on a retry, finds the row by IntakeId and posts nothing twice', async () => {
    const { store, service } = createHarness();
    store.afterPost(INTAKES_LIST_TITLE, (): void => store.fail(INTAKES_LIST_TITLE, 503, 'busy'));
    const pending: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitWorkflow('helpTraining', { originalAnswers: {} }));
    expect(pending.state).toBe('pending');
    store.requests.splice(0);
    // The list answers again.
    store.recover(INTAKES_LIST_TITLE);

    const retried: ISubmissionResult = await service.submitWorkflow('helpTraining', { originalAnswers: {} }, { intakeId: pending.intakeId });

    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([`GET ${filterUrl(INTAKES_URL, 'IntakeId', FIXED_ID)}`]);
    expect(posts(store)).toHaveLength(0);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
    expect(retried.state).toBe('saved');
    expect(retried.connected).toBe(true);
    expect(retried.intakeId).toBe(FIXED_ID);
    expect(retried.itemId).toBe(1);
    expect(retried.itemUrl).toBe('https://example.sharepoint.com/sites/demo/Lists/AICoEPilotIntakes/DispForm.aspx?ID=1');
    expect(retried.savedAt).toBe('2026-09-11T14:30:00.000Z');
    expect(retried.message).toBe('Submission received and added to the AI CoE service queue.');
  });

  it('posts the same body under the same identifier when the retry finds no row', async () => {
    const { store, service } = createHarness();
    store.fail(INTAKES_LIST_TITLE, 503, 'busy');
    const payload: object = { originalAnswers: { helpCategory: 'new', name: 'Sam', email: 'sam@example.com' } };
    const failed: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitWorkflow('helpTraining', payload));
    expect(failed.state).toBe('failed');
    const firstBody: unknown = posts(store)[0].body;
    store.recover(INTAKES_LIST_TITLE);
    store.requests.splice(0);

    const retried: ISubmissionResult = await service.submitWorkflow('helpTraining', payload, { intakeId: failed.intakeId });

    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([
      `GET ${filterUrl(INTAKES_URL, 'IntakeId', FIXED_ID)}`,
      `POST ${INTAKES_URL}`,
      `GET ${INTAKES_URL}(1)?$select=Id,IntakeId,Modified`
    ]);
    expect(posts(store)[0].body).toEqual(firstBody);
    expect(retried.state).toBe('saved');
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
  });

  it('never pre-reads on a first attempt, so the shipped request sequence gains only the readback', async () => {
    const { store, service } = createHarness();
    await service.submitWorkflow('idea', { originalAnswers: {} });
    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.list}`)).toEqual([
      'POST AI CoE Pilot Intakes',
      'POST AI CoE Use Cases',
      'GET AI CoE Pilot Intakes'
    ]);
  });

  it('completes a governance submission on retry: the intake row is found, only the missing use case is written', async () => {
    const { store, service } = createHarness();
    store.fail(USE_CASES_LIST_TITLE, 500, 'boom');
    const payload: object = { originalAnswers: { workToImprove: 'Reviewing forms' } };
    const failed: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitWorkflow('idea', payload));
    expect(failed.state).toBe('failed');
    expect(failed.failureClass).toBe('TRANSIENT');
    expect(failed.intakeId).toBe(FIXED_ID);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
    expect(store.items(USE_CASES_LIST_TITLE)).toHaveLength(0);
    store.recover(USE_CASES_LIST_TITLE);
    store.requests.splice(0);

    const retried: ISubmissionResult = await service.submitWorkflow('idea', payload, { intakeId: failed.intakeId });

    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([
      `GET ${filterUrl(INTAKES_URL, 'IntakeId', FIXED_ID)}`,
      `GET ${filterUrl(USE_CASES_URL, 'CoEID', FIXED_ID)}`,
      `POST ${USE_CASES_URL}`
    ]);
    expect(posts(store)).toHaveLength(1);
    expect(posts(store)[0].list).toBe(USE_CASES_LIST_TITLE);
    expect((posts(store)[0].body as { CoEID: string }).CoEID).toBe(FIXED_ID);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
    expect(store.items(USE_CASES_LIST_TITLE)).toHaveLength(1);
    expect(retried.state).toBe('saved');
    expect(retried.itemId).toBe(1);
    expect(retried.governanceItemId).toBe(2);
    expect(retried.governanceItemUrl).toBe('https://example.sharepoint.com/sites/demo/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=2');
    expect(retried.message).toBe('Submission received and queued for AI CoE intake and triage.');
  });

  it('skips both writes when a retry finds both rows', async () => {
    const { store, service } = createHarness();
    await service.submitWorkflow('idea', { originalAnswers: {} });
    store.requests.splice(0);
    const retried: ISubmissionResult = await service.submitWorkflow('idea', { originalAnswers: {} }, { intakeId: FIXED_ID });
    expect(posts(store)).toHaveLength(0);
    expect(retried.state).toBe('saved');
    expect(retried.governanceItemId).toBe(2);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
    expect(store.items(USE_CASES_LIST_TITLE)).toHaveLength(1);
  });

  it('classifies a refused write as failed with PERMISSION and a missing list as SOURCE, carrying the state', async () => {
    const { store, service } = createHarness();
    store.deny(INTAKES_LIST_TITLE, 403);
    const refused: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitWorkflow('feedback', {}));
    expect(refused).toEqual({
      connected: false,
      state: 'failed',
      intakeId: FIXED_ID,
      message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 403: Access denied',
      failureClass: 'PERMISSION',
      userMessage: 'Needs access.'
    });
    expect(submissionState(refused)).toBe('failed');

    const empty: InMemoryListStore = new InMemoryListStore([]);
    const missing: GovernanceService = new GovernanceService(
      { siteUrl: 'https://example.sharepoint.com', user: { displayName: 'Pat', email: 'pat@example.com' }, client: createFakeListClient(empty), configuration: undefined },
      (): Date => FIXED_NOW,
      (): string => FIXED_ID
    );
    const notFound: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => missing.submitWorkflow('feedback', {}));
    expect(notFound.state).toBe('failed');
    expect(notFound.failureClass).toBe('SOURCE');
  });

  it('reports a failed pre-read as failed rather than writing blind', async () => {
    const { store, service } = createHarness();
    await service.submitWorkflow('feedback', {});
    store.deny(INTAKES_LIST_TITLE, 403);
    store.requests.splice(0);
    const retried: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitWorkflow('feedback', {}, { intakeId: FIXED_ID }));
    expect(retried.state).toBe('failed');
    expect(retried.failureClass).toBe('PERMISSION');
    expect(posts(store)).toHaveLength(0);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
  });

  it('confirms through the identifier when the POST answer carries no Id', async () => {
    const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE]);
    const inner: IListClient = createFakeListClient(store);
    const service: GovernanceService = new GovernanceService(
      {
        siteUrl: 'https://example.sharepoint.com/sites/demo',
        user: { displayName: 'Pat', email: 'pat@example.com' },
        client: {
          get: inner.get,
          post: async (url: string, configuration: unknown, options: IListRequestOptions): Promise<IListResponse> => {
            await inner.post(url, configuration, options);
            return { ok: true, status: 201, text: async (): Promise<string> => '', json: async (): Promise<unknown> => ({}) };
          }
        },
        configuration: undefined
      },
      (): Date => FIXED_NOW,
      (): string => FIXED_ID
    );
    const result: ISubmissionResult = await service.submitWorkflow('feedback', {});
    expect(gets(store).map((request: IRecordedRequest): string => request.url)).toEqual([filterUrl("https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items", 'IntakeId', FIXED_ID)]);
    expect(result.state).toBe('saved');
    expect(result.itemId).toBe(1);
    expect(result.itemUrl).toBe('https://example.sharepoint.com/sites/demo/Lists/AICoEPilotIntakes/DispForm.aspx?ID=1');
  });
});

describe('GovernanceService.submitOutcome', () => {
  const ANSWERS: { [stepId: string]: string } = {
    taskType: 'Drafting or writing',
    outcome: 'Corrected',
    reviewState: 'Reviewed by me',
    correctionCategory: 'source',
    routeAvailability: 'Available now'
  };

  it('writes one row of choices to the outcome records list, with no email and no display name', async () => {
    const { store, service } = createHarness();
    const result: ISubmissionResult = await service.submitOutcome(ANSWERS);

    const requests: IRecordedRequest[] = posts(store);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(OUTCOMES_URL);
    expect(requests[0].headers).toEqual({ Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' });
    expect(requests[0].body).toEqual({
      Title: `Task outcome — ${FIXED_ID}`,
      OutcomeId: FIXED_ID,
      RecordedAt: '2026-09-11T14:30:00.000Z',
      TaskType: 'Drafting or writing',
      Outcome: 'Corrected',
      ReviewState: 'Reviewed by me',
      CorrectionCategory: 'source',
      RouteAvailability: 'Available now',
      WorkflowVersion: OUTCOME_WORKFLOW_VERSION
    });
    // The columns the list declares are the columns the record writes, in that order and no others.
    expect(Object.keys(requests[0].body as object)).toEqual(OUTCOME_COLUMNS.slice());
    // The row names no person: SharePoint's own Created By is the only trace, and only operators read it.
    const written: string = JSON.stringify(requests[0].body);
    expect(written).not.toContain('pat@example.com');
    expect(written).not.toContain('Pat Lee');
    expect(written.toLowerCase()).not.toContain('email');
    expect(result).toEqual({
      connected: true,
      state: 'saved',
      intakeId: FIXED_ID,
      itemId: 1,
      savedAt: '2026-09-11T14:30:00.000Z',
      version: OUTCOME_WORKFLOW_VERSION,
      message: 'Outcome recorded. No prompt or output text was saved.'
    });
  });

  it('reads the row back by its key before reporting it saved', async () => {
    const { store, service } = createHarness();
    await service.submitOutcome(ANSWERS);
    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([
      `POST ${OUTCOMES_URL}`,
      `GET ${OUTCOMES_URL}(1)?$select=Id,OutcomeId,Modified`
    ]);
    expect(gets(store)[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
  });

  it('writes nothing but declared choices, whatever the answers carry', async () => {
    const { store, service } = createHarness();
    await service.submitOutcome({
      taskType: 'The Q4 launch brief',
      outcome: 'Accepted',
      reviewState: 'Not reviewed',
      correctionCategory: CORRECTION_CATEGORIES[0],
      routeAvailability: 'Available now',
      notes: 'The model invented a customer name.'
    });
    const body: { [field: string]: unknown } = posts(store)[0].body as { [field: string]: unknown };
    expect(body.TaskType).toBe('');
    // An accepted outcome has no correction, so the category is not carried over from an earlier answer.
    expect(body.CorrectionCategory).toBe('');
    expect(JSON.stringify(body)).not.toContain('Q4');
    expect(JSON.stringify(body)).not.toContain('invented');
  });

  it('reports pending when the write was accepted but the readback fails, and keeps the body out of the message', async () => {
    const { store, service } = createHarness();
    store.afterPost(OUTCOME_RECORDS_LIST_TITLE, (): void => store.fail(OUTCOME_RECORDS_LIST_TITLE, 500, 'gateway timeout secret=xyz'));
    const result: ISubmissionResult = await silenced(async (errorSpy: jest.SpyInstance): Promise<ISubmissionResult> => {
      const pending: ISubmissionResult = await service.submitOutcome(ANSWERS);
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission not confirmed', 'AI CoE Outcome Records returned 500 (TRANSIENT)');
      return pending;
    });
    expect(result).toEqual({
      connected: false,
      state: 'pending',
      intakeId: FIXED_ID,
      itemId: 1,
      version: OUTCOME_WORKFLOW_VERSION,
      message: `SharePoint accepted the AI CoE record ${FIXED_ID} but did not confirm it back.`,
      failureClass: 'INCONCLUSIVE',
      userMessage: 'Saved, not yet confirmed.'
    });
    expect(result.message).not.toContain('secret');
    expect(store.items(OUTCOME_RECORDS_LIST_TITLE)).toHaveLength(1);
  });

  it('reports a refused write as failed with the class and no response body in the user message', async () => {
    const { store, service } = createHarness();
    store.deny(OUTCOME_RECORDS_LIST_TITLE, 403);
    const result: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitOutcome(ANSWERS));
    expect(result).toEqual({
      connected: false,
      state: 'failed',
      intakeId: FIXED_ID,
      message: 'SharePoint could not create the AI CoE record. AI CoE Outcome Records returned 403: Access denied',
      failureClass: 'PERMISSION',
      userMessage: 'Needs access.'
    });
    expect(store.items(OUTCOME_RECORDS_LIST_TITLE)).toHaveLength(0);
  });

  it('completes a pending record on retry under the same key instead of writing a second row', async () => {
    const { store, service } = createHarness();
    store.afterPost(OUTCOME_RECORDS_LIST_TITLE, (): void => store.fail(OUTCOME_RECORDS_LIST_TITLE, 503, 'busy'));
    const pending: ISubmissionResult = await silenced((): Promise<ISubmissionResult> => service.submitOutcome(ANSWERS));
    expect(pending.state).toBe('pending');
    store.recover(OUTCOME_RECORDS_LIST_TITLE);
    store.requests.splice(0);

    const retried: ISubmissionResult = await service.submitOutcome(ANSWERS, { intakeId: pending.intakeId });

    expect(store.requests.map((request: IRecordedRequest): string => `${request.method} ${request.url}`)).toEqual([
      `GET ${filterUrl(OUTCOMES_URL, 'OutcomeId', FIXED_ID)}`
    ]);
    expect(posts(store)).toHaveLength(0);
    expect(store.items(OUTCOME_RECORDS_LIST_TITLE)).toHaveLength(1);
    expect(retried.state).toBe('saved');
    expect(retried.intakeId).toBe(FIXED_ID);
  });

  it('reports pending when the row read back does not carry the key that was written', async () => {
    const { store, service } = createHarness();
    store.afterPost(OUTCOME_RECORDS_LIST_TITLE, (item): void => {
      item.OutcomeId = 'OVT-AICOE-20260911-SOMEBODY';
    });
    const result: ISubmissionResult = await silenced(async (errorSpy: jest.SpyInstance): Promise<ISubmissionResult> => {
      const pending: ISubmissionResult = await service.submitOutcome(ANSWERS);
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission not confirmed', 'AI CoE Outcome Records readback mismatch (INCONCLUSIVE)');
      return pending;
    });
    expect(result.state).toBe('pending');
    expect(result.failureClass).toBe('INCONCLUSIVE');
  });
});

describe('submissionState', () => {
  it('keeps the meaning of every shipped result: connected means saved, anything else failed', () => {
    expect(submissionState({ connected: true, message: 'ok' })).toBe('saved');
    expect(submissionState({ connected: false, message: 'no' })).toBe('failed');
    expect(submissionState({ connected: false, state: 'pending', message: 'later' })).toBe('pending');
    expect(submissionState({ connected: true, state: 'saved', message: 'ok' })).toBe('saved');
  });
});

describe('GovernanceService.getAdminDashboardData', () => {
  it('queries the three lists with the shipped select, order and top options', async () => {
    const { store, service } = createHarness();
    store.seed(INTAKES_LIST_TITLE, [{ Title: 'older', SubmittedAt: '2026-09-01T00:00:00.000Z', IntakeId: 'A' }, { Title: 'newer', SubmittedAt: '2026-09-10T00:00:00.000Z', IntakeId: 'B' }]);
    store.seed(USE_CASES_LIST_TITLE, [{ Title: 'case', CoEID: 'B', Created: '2026-09-10T00:00:00.000Z' }]);
    const data: IAdminDashboardData = await service.getAdminDashboardData();

    const urls: string[] = store.requests.map((request: IRecordedRequest): string => request.url);
    expect(urls).toEqual([
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items?$select=Id,Title,IntakeId,WorkflowType,PilotWorkflowVersion,Status,Priority,RequestorName,RequestorEmail,SubmittedAt,CompanyDataOrWorkflow,SensitiveOrRegulated,HumanReview,ToolName,RoutingOutcome,PayloadJson,PilotOnly,Created,Modified&$orderby=SubmittedAt%20desc&$top=200",
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Use Cases')/items?$select=Id,Title,CoEID,SubmitterEmail,BusinessProblem,BusinessOwnerEmail,DataSensitivity,ExternalUsers,AutonomousActions,EstimatedMonthlyCost,Status,RiskTier,ApproverEmail,ApprovalRequested,ApprovalOutcome,ApprovalComments,IntakeProcessed,TriageComplete,NextReviewDate,LastStatusChanged,PilotMeasure,Created,Modified&$orderby=Created%20desc&$top=200",
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Decisions')/items?$select=Id,Title,UseCaseID,Decision,ApproverEmail,DecisionDate,Comments,Created,Modified&$orderby=DecisionDate%20desc&$top=100"
    ]);
    expect(store.requests[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
    expect(data.connected).toBe(true);
    expect(data.message).toBe('SharePoint governance data refreshed.');
    expect(data.intakes.map((item) => item.Title)).toEqual(['newer', 'older']);
    expect(data.useCases).toHaveLength(1);
    expect(data.decisions).toEqual([]);
  });

  it('returns empty lists with a message when a query fails', async () => {
    const { store, service } = createHarness();
    store.fail(DECISIONS_LIST_TITLE, 403, 'Access denied');
    const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const data: IAdminDashboardData = await service.getAdminDashboardData();
      expect(data).toEqual({
        connected: false,
        intakes: [],
        useCases: [],
        decisions: [],
        message: 'The dashboard could not load SharePoint data. AI CoE Decisions returned 403: Access denied',
        failureClass: 'PERMISSION',
        userMessage: 'Needs access.'
      });
      expect(errorSpy).toHaveBeenCalledWith('AI CoE dashboard refresh failed', 'AI CoE Decisions returned 403 (PERMISSION)');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('classifies a missing list and a rejected client without exposing a body', async () => {
    const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const { store, service } = createHarness();
      store.fail(INTAKES_LIST_TITLE, 404, '{"error":"List does not exist at site"}');
      const missing: IAdminDashboardData = await service.getAdminDashboardData();
      expect(missing.connected).toBe(false);
      expect(missing.failureClass).toBe('SOURCE');
      expect(missing.userMessage).toBe('Not available on this site.');
      expect(errorSpy).toHaveBeenLastCalledWith('AI CoE dashboard refresh failed', 'AI CoE Pilot Intakes returned 404 (SOURCE)');

      const offline: GovernanceService = new GovernanceService({
        siteUrl: 'https://example.sharepoint.com',
        user: { displayName: 'Pat', email: 'pat@example.com' },
        client: { get: (): Promise<never> => Promise.reject(new Error('Failed to fetch')), post: (): Promise<never> => Promise.reject(new Error('Failed to fetch')) },
        configuration: undefined
      });
      const network: IAdminDashboardData = await offline.getAdminDashboardData();
      expect(network.failureClass).toBe('TRANSIENT');
      expect(network.userMessage).toBe('Not available right now; try again.');
      expect(network.message).toBe('The dashboard could not load SharePoint data. Failed to fetch');
      expect(errorSpy).toHaveBeenLastCalledWith('AI CoE dashboard refresh failed', 'TRANSIENT: Failed to fetch');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('carries no failure class when every list answered', async () => {
    const { service } = createHarness();
    const data: IAdminDashboardData = await service.getAdminDashboardData();
    expect(data.connected).toBe(true);
    expect(data.failureClass).toBeUndefined();
    expect(data.userMessage).toBeUndefined();
  });
});
