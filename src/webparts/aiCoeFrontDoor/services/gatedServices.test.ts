/**
 * The capability-aware facades: the cases that matter are the refusals. A refused read must answer in the
 * service's own denied shape and never reach the underlying service; an allowed one must reach it exactly once.
 */
import { createFakeGovernanceService, createFakeProgramMeasuresService, createFakeUsageService, InMemoryDraftStore } from '../../../testing/fakeServices';
import type { IFakeGovernanceService, IFakeProgramMeasuresService, IFakeUsageMetricsService, IRecordedSubmission } from '../../../testing/fakeServices';
import { createTestFrontDoor } from '../../../testing/renderWithFrontDoor';
import { payloadHash } from '../content/actionEnvelope';
import type { RoleId } from '../content/roles';
import type { IFrontDoorServices } from '../context/FrontDoorContext';
import type { SubmissionWorkflowType } from '../workflows/types';
import type { ICaseAnalysisResult } from './caseAnalysisService';
import { DurableSubmissionService } from './durableSubmissionService';
import { EXECUTIVE_REVIEW_PRIORITY, readReviewPriority } from './executivePriority';
import { GATED_MESSAGE, gateGovernance, gateServices } from './gatedServices';
import type { IGatedServices } from './gatedServices';
import type { IProgramMeasuresResult } from './programMeasuresService';
import type { IRoleResolution } from './roleResolver';
import type { IAdminDashboardData, IGovernanceService, IRecoveredSubmission, ISubmissionResult, ISubmitOptions, IUsageMetricsResult } from './types';

function resolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles], resolution: 'resolved' };
}

function unresolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles], resolution: 'unresolved' };
}

interface IFakes {
  measures: IFakeProgramMeasuresService;
  usage: IFakeUsageMetricsService;
  governance: IFakeGovernanceService;
}

function build(resolution: IRoleResolution): IGatedServices & IFakes {
  const measures: IFakeProgramMeasuresService = createFakeProgramMeasuresService();
  const usage: IFakeUsageMetricsService = createFakeUsageService();
  const governance: IFakeGovernanceService = createFakeGovernanceService();
  const bundle: IFrontDoorServices = createTestFrontDoor({ programMeasures: measures, usage, governance }).value.services;
  return { ...gateServices(bundle, resolution), measures, usage, governance };
}

/** The list behind a real site's recovery record: it keeps the reference it is given and confirms only when told to. */
class ReviewList implements IGovernanceService {
  public readonly calls: IRecordedSubmission[] = [];
  public confirms: boolean = false;

  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    this.calls.push({ workflowType, payload, intakeId: options?.intakeId });
    return this.confirms
      ? { connected: true, state: 'saved', intakeId: options?.intakeId, message: 'Saved.' }
      : { connected: false, state: 'pending', intakeId: options?.intakeId, message: 'Accepted, not read back.' };
  }

  public submitOutcome(): Promise<ISubmissionResult> {
    return Promise.reject(new Error('Not used by these tests.'));
  }

  public getAdminDashboardData(): Promise<IAdminDashboardData> {
    return Promise.reject(new Error('Not used by these tests.'));
  }
}

interface ISite {
  list: ReviewList;
  store: InMemoryDraftStore;
  governance: DurableSubmissionService;
}

/** A real site's governance: the durable service over the list, its recovery record kept as JSON, as the drafts list keeps it. */
function durableSite(): ISite {
  const list: ReviewList = new ReviewList();
  const store: InMemoryDraftStore = new InMemoryDraftStore();
  return { list, store, governance: new DurableSubmissionService(list, store) };
}

function gate(service: IGovernanceService, resolution: IRoleResolution): IGovernanceService {
  return gateGovernance(service, resolution, { refused: {} });
}

const BUSINESS_CASE: { [key: string]: unknown } = { originalAnswers: { workToImprove: 'Weekly status reports' } };

describe('gated service facades', () => {
  it('refuses the measures read to an employee without calling the service, in the service\'s own denied shape', async () => {
    const gated: IGatedServices & IFakes = build(resolved());
    const result: IProgramMeasuresResult = await gated.services.programMeasures!.getMeasures();
    expect(gated.measures.calls).toBe(0);
    expect(result.state).toBe('unavailable');
    expect(result.failureClass).toBe('PERMISSION');
    expect(result.userMessage).toBe('Needs access.');
    expect(result.message).toBe(GATED_MESSAGE);
    expect(Object.keys(result.measures)).toEqual([]);
    expect(gated.counters.refused.readProgramMeasures).toBe(1);
  });

  it('refuses every protected read while the membership is unresolved, whatever roles it claims', async () => {
    const gated: IGatedServices & IFakes = build(unresolved('operator', 'leader'));
    await gated.services.programMeasures!.getMeasures();
    await gated.services.usage.getMetrics();
    await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(0);
    expect(gated.usage.calls).toBe(0);
    expect(gated.governance.dashboardCalls).toBe(0);
    expect(gated.counters.refused).toEqual({ readProgramMeasures: 1, readUsageTelemetry: 1, readAdminQueue: 1 });
  });

  it('lets a leader read the measures once and still refuses the operator surfaces', async () => {
    const gated: IGatedServices & IFakes = build(resolved('leader'));
    await gated.services.programMeasures!.getMeasures();
    const usage: IUsageMetricsResult = await gated.services.usage.getMetrics();
    const queue: IAdminDashboardData = await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(1);
    expect(gated.usage.calls).toBe(0);
    expect(gated.governance.dashboardCalls).toBe(0);
    expect(usage.connected).toBe(false);
    expect(usage.failureClass).toBe('PERMISSION');
    expect(queue.connected).toBe(false);
    expect(queue.intakes).toEqual([]);
  });

  it('passes every operator read through exactly once, untouched', async () => {
    const gated: IGatedServices & IFakes = build(resolved('operator'));
    await gated.services.programMeasures!.getMeasures();
    await gated.services.usage.getMetrics();
    const queue: IAdminDashboardData = await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(1);
    expect(gated.usage.calls).toBe(1);
    expect(gated.governance.dashboardCalls).toBe(1);
    expect(queue).toBe(gated.governance.dashboard);
    expect(gated.counters.refused).toEqual({});
  });

  it('leaves a person\'s own writes open, so an unconfirmed membership never blocks their own work', async () => {
    const gated: IGatedServices & IFakes = build(unresolved());
    await gated.services.governance.submitWorkflow('feedback', { a: 1 });
    await gated.services.governance.submitOutcome({ taskType: 'x' });
    expect(gated.governance.submissions).toHaveLength(2);
  });

  it('keeps an absent measures service absent rather than inventing one', () => {
    const bundle: IFrontDoorServices = createTestFrontDoor({}).value.services;
    expect(bundle.programMeasures).toBeUndefined();
    expect(gateServices(bundle, resolved('operator')).services.programMeasures).toBeUndefined();
  });

  it('never names a group, a role or a list in the refusal', async () => {
    const gated: IGatedServices & IFakes = build(resolved());
    const result: IUsageMetricsResult = await gated.services.usage.getMetrics();
    const text: string = `${result.message} ${result.userMessage ?? ''}`.toLowerCase();
    for (const word of ['operator', 'group', 'role', 'list']) {
      expect({ word, present: text.indexOf(word) >= 0 }).toEqual({ word, present: false });
    }
  });

  it('marks a confirmed leader business case for sooner review and strips the mark from anyone else', async () => {
    const payload: { [key: string]: unknown } = { originalAnswers: { workToImprove: 'x' } };
    const leader: IGatedServices & IFakes = build(resolved('leader'));
    await leader.services.governance.submitWorkflow('idea', payload);
    expect(readReviewPriority(leader.governance.submissions[0].payload)).toBeDefined();

    const forged: { [key: string]: unknown } = { ...payload, reviewPriority: { level: 'executive', reason: 'forged' } };
    for (const resolution of [resolved(), resolved('operator'), unresolved('leader')]) {
      const other: IGatedServices & IFakes = build(resolution);
      await other.services.governance.submitWorkflow('idea', forged);
      expect(readReviewPriority(other.governance.submissions[0].payload)).toBeUndefined();
    }

    const service: IGatedServices & IFakes = build(resolved('leader'));
    await service.services.governance.submitWorkflow('helpTraining', payload);
    expect(service.governance.submissions[0].payload).toBe(payload);
  });

  it('prepares a new submission as it will be sent, so the caller can keep that as the attempt', () => {
    const leader: IGovernanceService = gate(createFakeGovernanceService(), resolved('leader'));
    expect(readReviewPriority(leader.prepareSubmission?.('teamUsage', BUSINESS_CASE))).toEqual(EXECUTIVE_REVIEW_PRIORITY);
    expect(leader.prepareSubmission?.('helpTraining', BUSINESS_CASE)).toBe(BUSINESS_CASE);
    expect(leader.prepareSubmission?.('outcome', BUSINESS_CASE)).toBe(BUSINESS_CASE);

    const forged: { [key: string]: unknown } = { ...BUSINESS_CASE, reviewPriority: EXECUTIVE_REVIEW_PRIORITY };
    const employee: IGovernanceService = gate(createFakeGovernanceService(), resolved());
    expect(employee.prepareSubmission?.('idea', forged)).toEqual(BUSINESS_CASE);
  });

  it('keeps the recovery record of a real site within reach, and absent where the service keeps none', async () => {
    const site: ISite = durableSite();
    await gate(site.governance, resolved('leader')).submitWorkflow('idea', BUSINESS_CASE);

    // The durable service's own method, called on the service: the record it reads is the one it wrote.
    const restored: IRecoveredSubmission | undefined = await gate(site.governance, resolved()).restoreSubmission?.();
    expect(restored).toEqual(await site.governance.restoreSubmission());
    expect(restored?.attempt.intakeId).toBe(site.list.calls[0].intakeId);

    expect('restoreSubmission' in gate(createFakeGovernanceService(), resolved())).toBe(false);
  });

  it.each([
    ['before the membership has answered', unresolved('leader')],
    ['once the person has left the leaders group', resolved()]
  ])('confirms a leader\'s business case again %s, exactly as it was first sent', async (_when: string, now: IRoleResolution) => {
    const site: ISite = durableSite();
    const first: ISubmissionResult = await gate(site.governance, resolved('leader')).submitWorkflow('idea', BUSINESS_CASE);
    expect(first.state).toBe('pending');
    const recorded: IRecoveredSubmission | undefined = await site.governance.restoreSubmission();

    site.list.confirms = true;
    const retried: ISubmissionResult = await gate(site.governance, now).submitWorkflow('idea', recorded!.attempt.payload, { intakeId: recorded!.attempt.intakeId });

    expect(retried).toMatchObject({ state: 'saved', intakeId: first.intakeId });
    expect(retried.earlierAttempt).toBeUndefined();
    expect(readReviewPriority(site.list.calls[1].payload)).toEqual(EXECUTIVE_REVIEW_PRIORITY);
  });

  it('completes a business case recorded without the mark for someone who now leads, instead of refusing it for good', async () => {
    const site: ISite = durableSite();
    // What a build that never marked leaves behind: a leader's business case sent without the mark, not yet read back.
    const intakeId: string = 'OVT-AICOE-20260925-UNMARKED';
    const digest: string | undefined = await payloadHash({ workflowType: 'idea', payload: BUSINESS_CASE });
    await site.store.save('submission_last', { version: 1, phase: 'pending', digest, attempt: { workflowType: 'idea', payload: BUSINESS_CASE, intakeId } });

    site.list.confirms = true;
    const retried: ISubmissionResult = await gate(site.governance, resolved('leader')).submitWorkflow('idea', BUSINESS_CASE, { intakeId });

    expect(retried).toMatchObject({ state: 'saved', intakeId });
    expect(site.list.calls).toEqual([{ workflowType: 'idea', payload: BUSINESS_CASE, intakeId }]);
  });

  it('refuses the case analysis to an employee before a request is built, and lets a leader and an operator ask', async () => {
    const analyze: jest.Mock = jest.fn(async (): Promise<ICaseAnalysisResult> => ({
      analysis: undefined,
      caseCount: 0,
      truncated: false,
      asOf: '2026-09-25T00:00:00Z',
      provenance: { provider: 'anthropic', model: '', responseId: '', requestId: 'r', draftOnly: true, humanReviewRequired: true }
    }));
    const bundle = (resolution: IRoleResolution): IGatedServices =>
      gateServices({ ...createTestFrontDoor({ caseAnalysis: { analyze } }).value.services }, resolution);

    const employee: IGatedServices = bundle(resolved());
    await expect(employee.services.caseAnalysis!.analyze('q')).rejects.toMatchObject({ kind: 'not-permitted' });
    expect(analyze).not.toHaveBeenCalled();
    expect(employee.counters.refused.analyzeCasePortfolio).toBe(1);
    await expect(bundle(unresolved('leader')).services.caseAnalysis!.analyze('q')).rejects.toMatchObject({ kind: 'not-permitted' });
    expect(analyze).not.toHaveBeenCalled();

    await bundle(resolved('leader')).services.caseAnalysis!.analyze('q');
    await bundle(resolved('operator')).services.caseAnalysis!.analyze('q');
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(gateServices(createTestFrontDoor().value.services, resolved('leader')).services.caseAnalysis).toBeUndefined();
  });
});

