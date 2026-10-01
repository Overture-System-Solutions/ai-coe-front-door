/**
 * The action envelope: what must be true before anything with an outside effect is attempted, and how a retry is
 * made safe. The canonical package names nine things a mutating action needs and then leaves the one that decides
 * retry safety undefined - `IdempotencyKey` is required on three record types but typed only as a non-empty
 * string, with no derivation, no scope, no window and no storage contract. This module defines it, because an
 * undefined idempotency rule is the difference between a safe retry and a second message sent to a customer.
 *
 * The derivation. A key is `<scope>:<workId>:<actionClass>:<payloadHash>`. Scope is the tenant surface the action
 * runs against, so the same draft in two sites cannot collide. The work id ties the action to its record. The
 * action class distinguishes two different things done to one record. The payload hash closes the loop: change one
 * character of what is being sent and the key changes, so the new content is a new action rather than a repeat of
 * the approved one. That last property is what stops changed content riding an old approval.
 *
 * The hash. SHA-256 over a canonical serialization: object keys sorted at every depth, so two payloads that differ
 * only in key order hash alike and a retry of the same content is recognised as the same content. When the platform
 * offers no digest the module fails closed and returns undefined rather than falling back to a weak hash, because
 * a weak hash here silently re-enables duplicate sends.
 *
 * The rule that matters most. A provider answering "sent" is not proof it was sent, and a request that ended in
 * doubt must be reconciled before it is retried, never simply repeated. `classifyOutcome` names the four cases and
 * `mayRetry` refuses the uncertain one, so a caller cannot loop on an unknown external effect.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/**
 * The action classes this front door can originate. The canonical package carries fourteen; these are the ones
 * reachable from the consolidated view, and each is listed so a new one cannot be added without a decision about
 * the authority it needs.
 */
export type ActionClass =
  | 'RECORD_WRITE'
  | 'DRAFT_GENERATE'
  | 'REVIEW_DECISION'
  | 'MESSAGE_SEND'
  | 'CONTENT_PUBLISH'
  | 'TASK_ASSIGN'
  | 'CALENDAR_WRITE'
  | 'CAMPAIGN_MUTATE';

export const ACTION_CLASSES: readonly ActionClass[] = [
  'RECORD_WRITE',
  'DRAFT_GENERATE',
  'REVIEW_DECISION',
  'MESSAGE_SEND',
  'CONTENT_PUBLISH',
  'TASK_ASSIGN',
  'CALENDAR_WRITE',
  'CAMPAIGN_MUTATE'
];

/**
 * The classes that reach outside the record store and therefore may never be attempted from this bundle. They are
 * declared so the envelope can refuse them by name: the front door drafts and records, and the sending, publishing,
 * assigning and scheduling stay behind their own authority in a flow a person authorises.
 */
const CONSEQUENTIAL: readonly ActionClass[] = ['MESSAGE_SEND', 'CONTENT_PUBLISH', 'TASK_ASSIGN', 'CALENDAR_WRITE', 'CAMPAIGN_MUTATE'];

export function isConsequential(actionClass: ActionClass): boolean {
  return CONSEQUENTIAL.filter((candidate: ActionClass): boolean => candidate === actionClass).length > 0;
}

/** Sorts object keys at every depth so serialization is stable whatever order a caller built the object in. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const source: { [key: string]: unknown } = value as { [key: string]: unknown };
  const keys: string[] = Object.keys(source).sort();
  const target: { [key: string]: unknown } = {};
  for (let index: number = 0; index < keys.length; index += 1) {
    target[keys[index]] = canonical(source[keys[index]]);
  }
  return target;
}

/** The exact bytes that are hashed; exported so a test can prove two orderings serialize alike. */
export function canonicalJson(payload: unknown): string {
  return JSON.stringify(canonical(payload));
}

function toHex(buffer: ArrayBuffer): string {
  const bytes: Uint8Array = new Uint8Array(buffer);
  let hex: string = '';
  for (let index: number = 0; index < bytes.length; index += 1) {
    const part: string = bytes[index].toString(16);
    hex += part.length === 1 ? '0' + part : part;
  }
  return hex;
}

interface ISubtle {
  digest(algorithm: string, data: ArrayBufferView): PromiseLike<ArrayBuffer>;
}

function subtle(): ISubtle | undefined {
  const holder: { crypto?: { subtle?: ISubtle } } = globalThis as { crypto?: { subtle?: ISubtle } };
  const found: ISubtle | undefined = holder.crypto === undefined ? undefined : holder.crypto.subtle;
  return found !== undefined && typeof found.digest === 'function' ? found : undefined;
}

/**
 * SHA-256 of the canonical serialization, lower-case hex, or undefined when the platform offers no digest. The
 * undefined answer is deliberate: every caller treats a missing hash as "cannot proceed", which is the safe
 * reading, rather than substituting a hash that would not detect a changed payload.
 */
export async function payloadHash(payload: unknown): Promise<string | undefined> {
  const digest: ISubtle | undefined = subtle();
  if (digest === undefined) {
    return undefined;
  }
  try {
    const bytes: Uint8Array = new TextEncoder().encode(canonicalJson(payload));
    return toHex(await digest.digest('SHA-256', bytes));
  } catch {
    return undefined;
  }
}

/** A SHA-256 hex digest, which is what every hash field of the canonical contract is shaped like. */
export const SHA256_HEX: RegExp = /^[0-9a-f]{64}$/;

export interface IIdempotencyInput {
  /** The tenant surface the action runs against, so one draft in two sites cannot share a key. */
  scope: string;
  /** The canonical Work ID the action belongs to. */
  workId: string;
  actionClass: ActionClass;
  /** The hash of exactly what is being sent. */
  payloadHash: string;
}

/**
 * The key. Any change to the content changes the hash and therefore the key, which is the property that stops a
 * changed draft being accepted as a repeat of the one that was approved.
 *
 * The scope is percent-encoded because it is the one free-form part and in practice it is a site URL, which
 * carries a colon of its own. Without encoding, `https://host/sites/x` would split into two parts and the key
 * could not be read back - and two different scopes could produce one key, which is the one thing a key must
 * never do. The other three parts cannot contain the separator: a Work ID is `CW-` plus an upper-case alphabet,
 * the action class is an enum, the hash is hex.
 */
export function idempotencyKey(input: IIdempotencyInput): string {
  return [encodeURIComponent(input.scope), input.workId, input.actionClass, input.payloadHash].join(':');
}

/** Splits a key back into its parts, or undefined when the value is not one this module minted. */
export function readIdempotencyKey(key: string): IIdempotencyInput | undefined {
  const parts: string[] = key.split(':');
  if (parts.length !== 4) {
    return undefined;
  }
  const actionClass: ActionClass = parts[2] as ActionClass;
  const known: boolean = ACTION_CLASSES.filter((candidate: ActionClass): boolean => candidate === actionClass).length > 0;
  if (!known || parts[0] === '' || parts[1] === '' || !SHA256_HEX.test(parts[3])) {
    return undefined;
  }
  let scope: string;
  try {
    scope = decodeURIComponent(parts[0]);
  } catch {
    return undefined;
  }
  return { scope, workId: parts[1], actionClass, payloadHash: parts[3] };
}

/**
 * What happened to an attempt, as the recovery contract requires it to be distinguished. `succeeded` and `failed`
 * are only ever claimed on a native readback; a provider's own success message is not one, so a call that returned
 * happily but could not be read back is `uncertain`, not `succeeded`.
 */
export type AttemptOutcome = 'succeeded' | 'failed' | 'uncertain' | 'notAttempted';

export interface IAttempt {
  /** True when the action definitely never left this bundle, so nothing outside can have happened. */
  reachedProvider: boolean;
  /** True when the record store was read afterwards and the effect was confirmed there. */
  confirmedByReadback: boolean;
  /** True when the readback ran and positively showed the effect absent. */
  refutedByReadback: boolean;
}

/**
 * The four outcome classes. The ordering of the checks is the safety property: nothing is called succeeded without
 * a readback, and anything that reached a provider without one is uncertain rather than failed, because calling it
 * failed invites a retry that would duplicate the effect.
 */
export function classifyOutcome(attempt: IAttempt): AttemptOutcome {
  if (!attempt.reachedProvider) {
    return 'notAttempted';
  }
  if (attempt.confirmedByReadback) {
    return 'succeeded';
  }
  if (attempt.refutedByReadback) {
    return 'failed';
  }
  return 'uncertain';
}

/**
 * Whether the caller may retry. An uncertain outcome must be reconciled first and never simply repeated, which is
 * the contract's own rule: an uncertain external side effect requires reconciliation before retry.
 */
export function mayRetry(outcome: AttemptOutcome): boolean {
  return outcome === 'notAttempted' || outcome === 'failed';
}

/** Why a retry was refused, for a page to show instead of a button that would repeat an unknown effect. */
export const RECONCILE_FIRST: string =
  'This request reached the service but could not be confirmed. It is not safe to send it again until someone checks whether it already took effect.';
