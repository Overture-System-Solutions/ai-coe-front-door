import { payloadHash } from '../content/actionEnvelope';
import type { SubmissionPieceType, SubmissionWorkflowType } from '../workflows/types';
import type { IDraftStore } from './draftStorage';
import { DurableSubmissionService } from './durableSubmissionService';
import type { IAdminDashboardData, IGovernanceService, ISubmissionResult, ISubmitOptions } from './types';

const SLOT: string = 'submission_last';

/** Keeps each record as JSON text, as the server draft list does, so every read is a round trip. */
class JsonStore implements IDraftStore {
  public readonly rows: { [slot: string]: string } = {};

  public async save(workflowId: string, draft: unknown): Promise<{ ok: boolean }> {
    this.rows[workflowId] = JSON.stringify(draft);
    return { ok: true };
  }

  public async load<T>(workflowId: string): Promise<T | undefined> {
    const text: string | undefined = this.rows[workflowId];
    return text === undefined ? undefined : (JSON.parse(text) as T);
  }

  public async clear(workflowId: string): Promise<void> {
    delete this.rows[workflowId];
  }
}

/** Saves whatever it is sent (or, told to, accepts it without confirming it back) and remembers the type and reference of each call. */
class SavingGovernance implements IGovernanceService {
  public readonly calls: { workflowType: SubmissionPieceType; intakeId: string | undefined }[] = [];
  public confirms: boolean = true;

  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._saved(workflowType, options);
  }

  public async submitOutcome(payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._saved('outcome', options);
  }

  public getAdminDashboardData(): Promise<IAdminDashboardData> {
    return Promise.reject(new Error('Not used by these tests.'));
  }

  private async _saved(workflowType: SubmissionPieceType, options: ISubmitOptions | undefined): Promise<ISubmissionResult> {
    this.calls.push({ workflowType, intakeId: options?.intakeId });
    return this.confirms
      ? { connected: true, state: 'saved', intakeId: options?.intakeId, message: 'Saved.' }
      : { connected: false, state: 'pending', intakeId: options?.intakeId, message: 'Accepted, not read back.' };
  }
}

/** Every type a submission may carry, including the tool check's review request and the outcome record. */
const ALL_TYPES: SubmissionPieceType[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'toolCheck-review-request', 'outcome'];

function send(service: DurableSubmissionService, type: SubmissionPieceType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
  return type === 'outcome' ? service.submitOutcome(payload, options) : service.submitWorkflow(type, payload, options);
}

function phase(store: JsonStore): string | undefined {
  const text: string | undefined = store.rows[SLOT];
  return text === undefined ? undefined : (JSON.parse(text) as { phase: string }).phase;
}

describe('DurableSubmissionService', () => {
  it('records, submits and completes a tool check review request', async () => {
    const store: JsonStore = new JsonStore();
    const inner: SavingGovernance = new SavingGovernance();
    const result: ISubmissionResult = await new DurableSubmissionService(inner, store).submitWorkflow('toolCheck-review-request', { toolName: 'Example tool' });

    expect(result.connected).toBe(true);
    expect(result.state).toBe('saved');
    expect(inner.calls).toEqual([{ workflowType: 'toolCheck-review-request', intakeId: result.intakeId }]);
    expect(result.intakeId).toMatch(/^OVT-AICOE-\d{8}-[A-Z0-9]{8}$/);
    expect(phase(store)).toBe('completed');
  });

  it('keeps accepting other forms after a review request', async () => {
    const store: JsonStore = new JsonStore();
    const inner: SavingGovernance = new SavingGovernance();
    const service: DurableSubmissionService = new DurableSubmissionService(inner, store);
    await service.submitWorkflow('toolCheck-review-request', { toolName: 'Example tool' });

    const feedback: ISubmissionResult = await service.submitWorkflow('feedback', { summary: 'Example feedback' });

    expect(feedback.state).toBe('saved');
    expect(inner.calls.map((call) => call.workflowType)).toEqual(['toolCheck-review-request', 'feedback']);
  });

  it.each(ALL_TYPES)('saves a %s submission through its recovery record', async (type: SubmissionPieceType) => {
    const store: JsonStore = new JsonStore();
    const inner: SavingGovernance = new SavingGovernance();
    const result: ISubmissionResult = await send(new DurableSubmissionService(inner, store), type, { example: type });

    expect(result.state).toBe('saved');
    expect(inner.calls.map((call) => call.workflowType)).toEqual([type]);
    expect(phase(store)).toBe('completed');
  });

  it('recovers a review request left unconfirmed by the previous build and completes it on retry', async () => {
    const store: JsonStore = new JsonStore();
    const inner: SavingGovernance = new SavingGovernance();
    const payload: { toolName: string } = { toolName: 'Example tool' };
    const intakeId: string = 'OVT-AICOE-20260929-ABC12345';
    const digest: string | undefined = await payloadHash({ workflowType: 'toolCheck-review-request', payload });
    // What the previous build left behind: the intent was recorded, its readback refused the type, nothing was sent.
    await store.save(SLOT, { version: 1, phase: 'prepared', digest, attempt: { workflowType: 'toolCheck-review-request', payload, intakeId } });
    const service: DurableSubmissionService = new DurableSubmissionService(inner, store);

    const restored = await service.restoreSubmission();
    expect(restored?.attempt).toEqual({ workflowType: 'toolCheck-review-request', payload, intakeId });
    expect(restored?.result.state).toBe('pending');

    const retried: ISubmissionResult = await service.submitWorkflow('toolCheck-review-request', payload, { intakeId });
    expect(retried.state).toBe('saved');
    expect(inner.calls).toEqual([{ workflowType: 'toolCheck-review-request', intakeId }]);
    expect(phase(store)).toBe('completed');
  });

  it('refuses a different submission while an earlier attempt is unconfirmed, and says the result is about that attempt', async () => {
    const store: JsonStore = new JsonStore();
    const inner: SavingGovernance = new SavingGovernance();
    inner.confirms = false;
    const service: DurableSubmissionService = new DurableSubmissionService(inner, store);
    const earlier: ISubmissionResult = await service.submitWorkflow('helpTraining', { helpCategory: 'new' });
    expect(earlier.state).toBe('pending');
    expect(earlier.earlierAttempt).toBeUndefined();

    const refused: ISubmissionResult = await service.submitWorkflow('feedback', { summary: 'Example feedback' });

    expect(refused).toMatchObject({ connected: false, state: 'pending', intakeId: earlier.intakeId, earlierAttempt: true });
    expect(inner.calls.map((call) => call.workflowType)).toEqual(['helpTraining']);
    expect((await service.restoreSubmission())?.attempt).toEqual({ workflowType: 'helpTraining', payload: { helpCategory: 'new' }, intakeId: earlier.intakeId });
  });
});
