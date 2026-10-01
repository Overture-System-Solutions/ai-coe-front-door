import { payloadHash } from '../content/actionEnvelope';
import type { SubmissionPieceType, SubmissionWorkflowType } from '../workflows/types';
import type { IDraftStore } from './draftStorage';
import { createIntakeId } from './intakeId';
import type { IAdminDashboardData, IGovernanceService, IRecoveredSubmission, ISubmissionResult, ISubmitOptions } from './types';

interface ISubmissionRecord {
  version: 1;
  phase: 'prepared' | 'pending' | 'completed';
  digest: string;
  attempt: IRecoveredSubmission['attempt'];
  result?: ISubmissionResult;
}

const SLOT: string = 'submission_last';
/**
 * Every type a recovery record may carry. Keyed by `SubmissionPieceType`, so a type the forms can submit and this
 * list lacks fails to compile, instead of refusing that record on readback and stopping every later submission.
 */
const WORKFLOW_TYPES: { [type in SubmissionPieceType]: true } = {
  idea: true,
  toolCheck: true,
  teamUsage: true,
  helpTraining: true,
  feedback: true,
  'toolCheck-review-request': true,
  outcome: true
};

function isWorkflowType(value: unknown): value is SubmissionPieceType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORKFLOW_TYPES, value);
}

/** Durable intent before legacy list mutations; production injects only a server-side draft store. */
export class DurableSubmissionService implements IGovernanceService {
  private _queue: Promise<unknown> = Promise.resolve();

  public constructor(private readonly _inner: IGovernanceService, private readonly _store: IDraftStore) {}

  public submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._enqueue(workflowType, payload, options);
  }

  public submitOutcome(payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._enqueue('outcome', payload, options);
  }

  public getAdminDashboardData(): Promise<IAdminDashboardData> {
    return this._inner.getAdminDashboardData();
  }

  public async restoreSubmission(): Promise<IRecoveredSubmission | undefined> {
    const record: ISubmissionRecord | undefined = await this._read();
    if (record === undefined || record.phase === 'completed') {
      return undefined;
    }
    return { attempt: record.attempt, result: record.result ?? this._pending(record.attempt.intakeId) };
  }

  private _enqueue(workflowType: SubmissionPieceType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    const run: Promise<ISubmissionResult> = this._queue.catch((): void => undefined).then((): Promise<ISubmissionResult> => this._submit(workflowType, payload, options));
    this._queue = run;
    return run;
  }

  private _pending(intakeId: string): ISubmissionResult {
    return { connected: false, state: 'pending', intakeId, message: 'An earlier server-stored attempt needs confirmation. Retry uses its original reference, not a new submission.' };
  }

  private async _read(): Promise<ISubmissionRecord | undefined> {
    const raw: unknown = await this._store.load<unknown>(SLOT);
    if (raw === undefined) {
      return undefined;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('The server submission intent is invalid.');
    }
    const record: ISubmissionRecord = raw as ISubmissionRecord;
    if (record.version !== 1 || ['prepared', 'pending', 'completed'].indexOf(record.phase) < 0 || typeof record.digest !== 'string' || !/^[0-9a-f]{64}$/.test(record.digest) || !record.attempt || !isWorkflowType(record.attempt.workflowType) || !/^OVT-AICOE-\d{8}-[A-Z0-9]{8}$/.test(record.attempt.intakeId)) {
      throw new Error('The server submission intent identity is invalid.');
    }
    if (await payloadHash({ workflowType: record.attempt.workflowType, payload: record.attempt.payload }) !== record.digest) {
      throw new Error('The server submission intent digest does not match.');
    }
    return record;
  }

  private async _submit(workflowType: SubmissionPieceType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    let record: ISubmissionRecord;
    try {
      const digest: string | undefined = await payloadHash({ workflowType, payload });
      if (digest === undefined) {
        throw new Error('Digest unavailable.');
      }
      const existing: ISubmissionRecord | undefined = await this._read();
      if (existing !== undefined && existing.phase !== 'completed') {
        if (existing.digest !== digest || (options?.intakeId !== undefined && existing.attempt.intakeId !== options.intakeId)) {
          return { ...this._pending(existing.attempt.intakeId), earlierAttempt: true, message: 'Confirm the earlier attempt before starting a different submission. Its saved content was not replaced.' };
        }
        record = existing;
      } else {
        const intakeId: string = options?.intakeId ?? createIntakeId();
        if (!/^OVT-AICOE-\d{8}-[A-Z0-9]{8}$/.test(intakeId)) {
          throw new Error('Invalid submission reference.');
        }
        record = { version: 1, phase: 'prepared', digest, attempt: { workflowType, payload, intakeId } };
        if (!(await this._store.save(SLOT, record)).ok) {
          throw new Error('Intent could not be recorded.');
        }
        const readback: ISubmissionRecord | undefined = await this._read();
        if (readback?.attempt.intakeId !== intakeId || readback.digest !== digest) {
          throw new Error('Intent did not read back.');
        }
      }
    } catch {
      return { connected: false, state: 'failed', message: 'The submission could not be saved to its server-side recovery record. Nothing was submitted; keep your answers and try again when storage is available.' };
    }
    let result: ISubmissionResult;
    try {
      const retry: ISubmitOptions = { intakeId: record.attempt.intakeId };
      result = workflowType === 'outcome' ? await this._inner.submitOutcome(payload, retry) : await this._inner.submitWorkflow(workflowType, payload, retry);
      if (result.intakeId !== undefined && result.intakeId !== record.attempt.intakeId) {
        return this._pending(record.attempt.intakeId);
      }
    } catch {
      return this._pending(record.attempt.intakeId);
    }
    const confirmed: ISubmissionResult = { ...result, intakeId: record.attempt.intakeId };
    const completed: ISubmissionRecord = { ...record, phase: result.connected && (result.state === undefined || result.state === 'saved') ? 'completed' : 'pending', result: confirmed };
    try {
      if (!(await this._store.save(SLOT, completed)).ok) {
        return this._pending(record.attempt.intakeId);
      }
      const readback: ISubmissionRecord | undefined = await this._read();
      if (readback?.phase !== completed.phase || readback.attempt.intakeId !== record.attempt.intakeId) {
        return this._pending(record.attempt.intakeId);
      }
    } catch {
      return this._pending(record.attempt.intakeId);
    }
    return confirmed;
  }
}
