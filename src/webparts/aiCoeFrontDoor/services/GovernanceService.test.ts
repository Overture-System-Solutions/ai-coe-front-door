import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import {
  DECISIONS_LIST_TITLE,
  GovernanceService,
  INTAKES_LIST_TITLE,
  isGovernanceWorkflow,
  listItemsUrl,
  USE_CASES_LIST_TITLE,
  workflowLabel
} from './GovernanceService';
import type { IAdminDashboardData, IServiceContext, ISubmissionResult } from './types';

const FIXED_NOW: Date = new Date(Date.UTC(2026, 8, 11, 14, 30, 0));

function createHarness(): { store: InMemoryListStore; service: GovernanceService } {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE, DECISIONS_LIST_TITLE]);
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
      intakeId: 'OVT-AICOE-20260911-FIXEDSUF',
      itemId: 1,
      itemUrl: 'https://example.sharepoint.com/sites/demo/Lists/AICoEPilotIntakes/DispForm.aspx?ID=1',
      governanceItemId: undefined,
      governanceItemUrl: undefined,
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
        intakeId: 'OVT-AICOE-20260911-FIXEDSUF',
        message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 500: boom'
      });
      expect(errorSpy).toHaveBeenCalledWith('AI CoE submission failed', expect.any(Error));
      expect(posts(store)).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
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
        message: 'The dashboard could not load SharePoint data. AI CoE Decisions returned 403: Access denied'
      });
      expect(errorSpy).toHaveBeenCalledWith('AI CoE dashboard refresh failed', expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
