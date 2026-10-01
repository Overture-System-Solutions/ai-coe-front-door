/**
 * Binding A client: write one allowed request as a command row, then poll that same row until it completes.
 *
 * A poll never inserts a second command. A 409/unique-title collision is not a pass until `sameCommand` holds. An
 * inaccessible collision is denied. A timeout is not proof of absence. FLOW_FAILURE, RCPT-NONE, INCONCLUSIVE and
 * RECONCILIATION_REQUIRED are never read as "nothing was written."
 *
 * Replay follows v0.1.1 §7a: the stored response is returned as stored, including Created:true when that was the
 * original result. The recorded replay fixture that rewrites Created to false is recorded as a mismatch, not copied.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { sameCommand } from './commandKey';
import type { ICommandKey } from './commandKey';
import { observationOf } from './commandTransport';
import type { CommandObservation, ICommandRow, ICommandTransport, ISubmitOutcome } from './commandTransport';
import { isCoreError, parseRequest, parseResponse } from './coreContract';
import type { CoreOperation, CoreRequest, CoreResponse, ICoreError } from './coreContract';
import { NO_RECEIPT } from './coreContract';

export type CommandPhase = 'queued' | 'processing' | 'completed' | 'denied' | 'inconclusive';

export interface IPollClock {
  now: () => Date;
  wait: (ms: number) => Promise<void>;
  maxPolls: number;
  initialDelayMs: number;
}

export const INSTANT_CLOCK: IPollClock = {
  now: (): Date => new Date(),
  wait: async (): Promise<void> => undefined,
  maxPolls: 8,
  initialDelayMs: 0
};

export interface ICommandHandle {
  key: ICommandKey;
  operation: CoreOperation;
  /** Omitted when a native command is recovered using an opaque reference after reload. */
  request?: CoreRequest;
  row?: ICommandRow;
}

export interface ICommandObservation {
  phase: CommandPhase;
  observation: CommandObservation | 'denied' | 'inconclusive';
  observedAt: string;
  polls: number;
  handle: ICommandHandle;
  response?: CoreResponse;
  reason?: string;
}

export function isoNow(clock: IPollClock): string {
  return clock.now().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function asError(result: ICoreError['Result'], errorClass: string, message: string, retry: boolean): ICoreError {
  return { Result: result, ErrorClass: errorClass, Message: message, ReceiptID: NO_RECEIPT, RetryAllowed: retry };
}

function parseStored(operation: CoreOperation, row: ICommandRow): CoreResponse | undefined {
  if (row.responseJson.trim() === '') {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(row.responseJson);
  } catch {
    return asError('INCONCLUSIVE', 'FLOW_FAILURE', 'The stored response is not JSON; the write is unconfirmed.', true);
  }
  const check = parseResponse(operation, raw);
  return check.value ?? asError('INCONCLUSIVE', 'FLOW_FAILURE', 'The stored response did not validate against the operation schema.', true);
}

function phaseOf(row: ICommandRow): CommandPhase {
  if (row.result !== 'PENDING') {
    return 'completed';
  }
  return row.claimed ? 'processing' : 'queued';
}

/**
 * Submits one command and, when the row is still pending, polls that same Title until it completes, the poll bound
 * is reached, or the row becomes unreadable. Callers never mint a new key on a tick.
 */
export class CoreClient {
  public constructor(private readonly _transport: ICommandTransport, private readonly _clock: IPollClock = INSTANT_CLOCK) {}

  public async submit(handle: ICommandHandle): Promise<ICommandObservation> {
    const requestCheck = parseRequest(handle.operation, handle.request);
    if (!requestCheck.valid || requestCheck.value === undefined) {
      return {
        phase: 'denied',
        observation: 'denied',
        observedAt: isoNow(this._clock),
        polls: 0,
        handle,
        response: asError('FAIL', 'VALIDATION_FAILED', requestCheck.errors.join(' '), false),
        reason: 'The request did not validate; nothing was written.'
      };
    }
    const pending: Omit<ICommandRow, 'id'> = {
      title: handle.key.key,
      operation: handle.operation,
      workId: 'WorkID' in requestCheck.value && typeof requestCheck.value.WorkID === 'string' ? requestCheck.value.WorkID : null,
      requestJson: JSON.stringify(requestCheck.value),
      responseJson: '',
      result: 'PENDING',
      receiptId: '',
      correlationId: requestCheck.value.Context.CorrelationID,
      claimed: false,
      claimedAt: null,
      testRecord: requestCheck.value.Context.TestRecord === true,
      author: ''
    };
    const outcome: ISubmitOutcome = await this._transport.submit(pending);
    if (outcome.kind === 'denied') {
      return {
        phase: 'denied',
        observation: 'denied',
        observedAt: isoNow(this._clock),
        polls: 0,
        handle,
        response: asError('DENIED', 'NOT_AUTHORIZED', outcome.reason ?? 'The command list refused the write.', false),
        reason: outcome.reason
      };
    }
    if (outcome.kind === 'inconclusive' || outcome.row === undefined) {
      return {
        phase: 'inconclusive',
        observation: 'inconclusive',
        observedAt: isoNow(this._clock),
        polls: 0,
        handle,
        response: asError('INCONCLUSIVE', 'FLOW_FAILURE', outcome.reason ?? 'The write was not confirmed.', true),
        reason: 'A timeout or an unreadable collision is not proof of absence; this mutation will not be retried blindly.'
      };
    }
    if (outcome.kind === 'recovered') {
      const same = await sameCommand(handle.key, { title: outcome.row.title, operation: outcome.row.operation, requestJson: outcome.row.requestJson });
      if (!same.same) {
        return {
          phase: 'denied',
          observation: 'denied',
          observedAt: isoNow(this._clock),
          polls: 0,
          handle: { ...handle, row: outcome.row },
          response: asError('DENIED', 'IDEMPOTENCY_COLLISION', same.reason ?? 'A different command already holds this key.', false),
          reason: same.reason
        };
      }
      // §7a: return the stored body, including Created:true if that was the original result.
      return this._fromRow({ ...handle, row: outcome.row }, outcome.row, 0, 'Recovered the original command row (replay).');
    }
    return this.poll({ ...handle, row: outcome.row });
  }

  /** Re-reads the submitted command. Never writes. */
  public async poll(handle: ICommandHandle): Promise<ICommandObservation> {
    const title: string = handle.row?.title ?? handle.key.key;
    let last: ICommandRow | undefined = handle.row;
    for (let polls: number = 1; polls <= this._clock.maxPolls; polls += 1) {
      const row: ICommandRow | undefined = await this._transport.readByTitle(title);
      if (row === undefined) {
        return {
          phase: 'inconclusive',
          observation: 'inconclusive',
          observedAt: isoNow(this._clock),
          polls,
          handle,
          response: asError('INCONCLUSIVE', 'FLOW_FAILURE', 'The submitted command could not be read back.', true),
          reason: 'A missing read is not proof the command was never written.'
        };
      }
      last = row;
      if (row.result !== 'PENDING') {
        return this._fromRow({ ...handle, row }, row, polls);
      }
      if (polls < this._clock.maxPolls) {
        await this._clock.wait(this._clock.initialDelayMs * polls);
      }
    }
    const observation: CommandObservation = last === undefined ? 'inconclusive' : observationOf(last);
    return {
      phase: last === undefined ? 'inconclusive' : phaseOf(last),
      observation,
      observedAt: isoNow(this._clock),
      polls: this._clock.maxPolls,
      handle: { ...handle, row: last },
      reason: 'Polling bound reached while the command is still pending. A timeout is not proof of absence.'
    };
  }

  private _fromRow(handle: ICommandHandle, row: ICommandRow, polls: number, reason?: string): ICommandObservation {
    const response: CoreResponse | undefined = parseStored(handle.operation, row);
    if (response !== undefined && isCoreError(response) && (response.ErrorClass === 'FLOW_FAILURE' || response.ReceiptID === NO_RECEIPT)) {
      return {
        phase: 'completed',
        observation: 'completed',
        observedAt: isoNow(this._clock),
        polls,
        handle,
        response,
        reason: 'The flow reported failure or no receipt. That is not "nothing was written."'
      };
    }
    return {
      phase: 'completed',
      observation: 'completed',
      observedAt: isoNow(this._clock),
      polls,
      handle,
      response,
      reason
    };
  }
}
