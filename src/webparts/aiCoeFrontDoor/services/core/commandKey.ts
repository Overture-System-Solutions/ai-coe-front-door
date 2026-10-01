/**
 * The command-key adapter, version 1: the one derivation of the `IdempotencyKey` a Binding A command carries as its
 * `Title`, and the rules for when a new key is minted.
 *
 * Why an adapter. The frontend's action envelope derives `<scope>:<workId>:<actionClass>:<payloadHash>`; the
 * contract's prose says `<WorkID or 'new'>:<operation>:<sha256(payload)[:16]>` with no caller scope. Neither is the
 * other, and neither says when a *read* gets a fresh key. A stable key for `GetWorkStatus` retrieves the original
 * response forever, because a completed command row is a historical record. So:
 *
 *   cmdk1:<scope8>:<caller8>:<operation>:<intent>:<workRef>:<digest16>
 *
 * - `scope8`, `caller8`: the first eight hex characters of SHA-256 over the tenant scope and the lower-cased caller,
 *   so two sites, or two people, can never share a key and a cross-user collision is a visible refusal, not a replay;
 * - `operation`: one of the five contract names;
 * - `intent`: `m` for a mutation (stable across retries of the same content), `r<n>` for the n-th read intent of
 *   this caller on this target (a refresh mints n+1; polling and retrying the same read keep n), `e<v>` for a
 *   readiness evaluation at input-version v (new evidence means a new v; a replay of v returns the earlier result);
 * - `workRef`: the canonical Work ID, or `new` for a create;
 * - `digest16`: the first sixteen hex characters of SHA-256 over the canonical **business** payload, with `Context`
 *   excluded so correlation ids and timestamps never change the key. A changed business payload is a new key, which
 *   is the property that stops changed content riding an earlier approval.
 *
 * Length: the SharePoint `Title` column holds 255 characters. With a 127-character Work ID the key is at most 205.
 * The contract requires at least 8. Both are checked, not assumed.
 *
 * Recorded as a contract amendment (`backend/core-compatibility/CONTRACT_AMENDMENT_v0.1.2-proposal.md`), not as an
 * unannounced client habit: the flow reads the key only as an opaque unique title, so the adapter is compatible
 * with 3.0.0.0 as generated.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { canonicalJson, payloadHash } from '../../content/actionEnvelope';
import type { CoreOperation } from './coreContract';
import { CORE_OPERATIONS } from './coreContract';

export const COMMAND_KEY_VERSION: string = 'cmdk1';
/** SharePoint single-line text limit; the Title column is one. */
export const SHAREPOINT_TITLE_MAX: number = 255;
export const CONTRACT_KEY_MIN: number = 8;

export type CommandIntent = { kind: 'mutation' } | { kind: 'read'; generation: number } | { kind: 'evaluation'; inputVersion: number };

export interface ICommandKeyInput {
  tenantScope: string;
  callerId: string;
  operation: CoreOperation;
  intent: CommandIntent;
  /** The canonical Work ID, or null for a create. */
  workId: string | null;
  /** The request without its Context: what the key digests. */
  businessPayload: unknown;
}

export interface ICommandKey {
  key: string;
  scope8: string;
  caller8: string;
  operation: CoreOperation;
  intent: CommandIntent;
  workRef: string;
  digest16: string;
  /** The full digest of the business payload, kept beside the key so a recovered row can be checked against it. */
  digest: string;
}

function intentToken(intent: CommandIntent): string {
  switch (intent.kind) {
    case 'mutation':
      return 'm';
    case 'read':
      return `r${intent.generation}`;
    case 'evaluation':
      return `e${intent.inputVersion}`;
    default: {
      const exhaustive: never = intent;
      throw new Error(`Unknown intent ${String(exhaustive)}`);
    }
  }
}

function parseIntent(token: string): CommandIntent | undefined {
  if (token === 'm') {
    return { kind: 'mutation' };
  }
  const read: RegExpExecArray | null = /^r(\d+)$/.exec(token);
  if (read !== null) {
    return { kind: 'read', generation: Number(read[1]) };
  }
  const evaluation: RegExpExecArray | null = /^e(\d+)$/.exec(token);
  if (evaluation !== null) {
    return { kind: 'evaluation', inputVersion: Number(evaluation[1]) };
  }
  return undefined;
}

/** The business payload a request digests: everything but `Context`, canonicalised. */
export function businessPayloadOf(request: { [key: string]: unknown }): unknown {
  const copy: { [key: string]: unknown } = { ...request };
  delete copy.Context;
  return copy;
}

/** The canonical bytes the digest covers, for a test or a receipt to show. */
export function businessPayloadText(request: { [key: string]: unknown }): string {
  return canonicalJson(businessPayloadOf(request));
}

/**
 * Derives the key, or undefined when the platform offers no digest (the caller must not proceed without one). The
 * intent kind must agree with the operation: a mutation intent on a read operation, or the reverse, is refused.
 */
export async function deriveCommandKey(input: ICommandKeyInput): Promise<ICommandKey | undefined> {
  const mutating: boolean = input.operation === 'CreateOrResumeWork' || input.operation === 'SubmitEvidenceResponse';
  const evaluating: boolean = input.operation === 'RequestDecisionReadiness';
  if ((mutating && input.intent.kind !== 'mutation') || (evaluating && input.intent.kind !== 'evaluation') || (!mutating && !evaluating && input.intent.kind !== 'read')) {
    throw new Error(`Intent ${input.intent.kind} does not fit operation ${input.operation}.`);
  }
  if (input.callerId.trim() === '' || input.tenantScope.trim() === '') {
    throw new Error('A command key needs an authenticated caller and a tenant scope.');
  }
  const [scope, caller, digest] = await Promise.all([payloadHash(input.tenantScope), payloadHash(input.callerId.trim().toLowerCase()), payloadHash(input.businessPayload)]);
  if (scope === undefined || caller === undefined || digest === undefined) {
    return undefined;
  }
  const scope8: string = scope.slice(0, 8);
  const caller8: string = caller.slice(0, 8);
  const digest16: string = digest.slice(0, 16);
  const workRef: string = input.workId ?? 'new';
  const key: string = [COMMAND_KEY_VERSION, scope8, caller8, input.operation, intentToken(input.intent), workRef, digest16].join(':');
  if (key.length > SHAREPOINT_TITLE_MAX) {
    throw new Error(`Command key of ${key.length} characters exceeds the ${SHAREPOINT_TITLE_MAX}-character Title limit.`);
  }
  if (key.length < CONTRACT_KEY_MIN) {
    throw new Error('Command key is shorter than the contract minimum.');
  }
  return { key, scope8, caller8, operation: input.operation, intent: input.intent, workRef, digest16, digest };
}

/** Splits a key this adapter minted, or undefined for anything else (another version, another format). */
export function readCommandKey(key: string): Omit<ICommandKey, 'digest'> | undefined {
  const parts: string[] = key.split(':');
  if (parts.length !== 7 || parts[0] !== COMMAND_KEY_VERSION) {
    return undefined;
  }
  const operation: CoreOperation = parts[3] as CoreOperation;
  const intent: CommandIntent | undefined = parseIntent(parts[4]);
  if (CORE_OPERATIONS.indexOf(operation) < 0 || intent === undefined || !/^[0-9a-f]{8}$/.test(parts[1]) || !/^[0-9a-f]{8}$/.test(parts[2]) || !/^[0-9a-f]{16}$/.test(parts[6]) || parts[5] === '') {
    return undefined;
  }
  return { key, scope8: parts[1], caller8: parts[2], operation, intent, workRef: parts[5], digest16: parts[6] };
}

/**
 * Whether a recovered row is the same command: same key, same operation column, and a stored request whose business
 * payload digests to the same value. A duplicate-key write error is not a pass until this holds.
 */
export async function sameCommand(expected: ICommandKey, row: { title: string; operation: string; requestJson: string }): Promise<{ same: boolean; reason?: string }> {
  if (row.title !== expected.key) {
    return { same: false, reason: 'The recovered row carries another key.' };
  }
  if (row.operation !== expected.operation) {
    return { same: false, reason: 'The recovered row carries another operation.' };
  }
  let stored: unknown;
  try {
    stored = JSON.parse(row.requestJson);
  } catch {
    return { same: false, reason: 'The recovered row\'s request is not JSON.' };
  }
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { same: false, reason: 'The recovered row\'s request is not an object.' };
  }
  const digest: string | undefined = await payloadHash(businessPayloadOf(stored as { [key: string]: unknown }));
  if (digest === undefined) {
    return { same: false, reason: 'No digest is available to compare the recovered row.' };
  }
  return digest === expected.digest ? { same: true } : { same: false, reason: 'The recovered row\'s business payload differs; the key collided with another intent.' };
}
