/**
 * The action envelope. The two properties worth having are that changed content cannot reuse an approved key, and
 * that an uncertain outcome cannot be retried.
 */
import {
  ACTION_CLASSES,
  RECONCILE_FIRST,
  SHA256_HEX,
  canonicalJson,
  classifyOutcome,
  idempotencyKey,
  isConsequential,
  mayRetry,
  payloadHash,
  readIdempotencyKey
} from './actionEnvelope';
import type { ActionClass, AttemptOutcome } from './actionEnvelope';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';

const SCOPE: string = 'https://example.sharepoint.com/sites/aicoe';
const WORK_ID: string = 'CW-OVT_AICOE_20260920_AB12CD34';

/**
 * The test environment offers no `crypto.subtle`, which is exactly the case the module fails closed on. A real
 * digest is installed here so the hashing tests exercise the production path rather than the refusal, and one case
 * below takes it away again to prove the refusal still happens.
 */
interface ICryptoHolder {
  crypto?: { subtle?: unknown };
}

const holder: ICryptoHolder = globalThis as ICryptoHolder;
const originalCrypto: { subtle?: unknown } | undefined = holder.crypto;

beforeAll((): void => {
  if (holder.crypto === undefined || holder.crypto.subtle === undefined) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
  }
  // jsdom supplies no TextEncoder either, and the module treats a missing one as another reason to fail closed.
  const encoderHolder: { TextEncoder?: unknown } = globalThis as { TextEncoder?: unknown };
  if (encoderHolder.TextEncoder === undefined) {
    Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder, configurable: true, writable: true });
  }
});

afterAll((): void => {
  Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true, writable: true });
});

describe('canonical serialization', () => {
  it('serializes two orderings of the same content identically, at every depth', () => {
    const a: unknown = { b: 1, a: { d: [1, { g: 2, f: 3 }], c: 'x' } };
    const b: unknown = { a: { c: 'x', d: [1, { f: 3, g: 2 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('keeps array order, which is content rather than presentation', () => {
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });
});

describe('payload hash', () => {
  it('is a sha-256 hex digest and is stable across key ordering', async () => {
    const first: string | undefined = await payloadHash({ message: 'hello', channels: ['email', 'teams'] });
    const second: string | undefined = await payloadHash({ channels: ['email', 'teams'], message: 'hello' });
    expect(typeof first).toBe('string');
    expect(SHA256_HEX.test(first as string)).toBe(true);
    expect(second).toBe(first);
  });

  it('changes when one character of the content changes', async () => {
    const before: string | undefined = await payloadHash({ message: 'hello' });
    const after: string | undefined = await payloadHash({ message: 'hellp' });
    expect(before).not.toBe(after);
  });

  it('fails closed with no digest rather than substituting a weaker hash', async () => {
    // A weak substitute here would silently stop detecting a changed payload, which is what the idempotency key
    // depends on, so the module refuses instead. Every caller reads undefined as "cannot proceed".
    const saved: { subtle?: unknown } | undefined = holder.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: undefined }, configurable: true, writable: true });
    try {
      expect(await payloadHash({ message: 'hello' })).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true, writable: true });
    }
  });
});

describe('idempotency key', () => {
  it('changes when the content changes, so edited content cannot ride an approved key', async () => {
    const approvedHash: string = (await payloadHash({ copy: 'Launch on Monday.' })) as string;
    const editedHash: string = (await payloadHash({ copy: 'Launch on Tuesday.' })) as string;
    const approved: string = idempotencyKey({ scope: SCOPE, workId: WORK_ID, actionClass: 'MESSAGE_SEND', payloadHash: approvedHash });
    const edited: string = idempotencyKey({ scope: SCOPE, workId: WORK_ID, actionClass: 'MESSAGE_SEND', payloadHash: editedHash });
    expect(edited).not.toBe(approved);
  });

  it('separates two sites, two records and two action classes', async () => {
    const hash: string = (await payloadHash({ copy: 'same' })) as string;
    const base = { scope: SCOPE, workId: WORK_ID, actionClass: 'MESSAGE_SEND' as ActionClass, payloadHash: hash };
    const key: string = idempotencyKey(base);
    expect(idempotencyKey({ ...base, scope: 'https://other.sharepoint.com/sites/aicoe' })).not.toBe(key);
    expect(idempotencyKey({ ...base, workId: 'CW-OVT_AICOE_20260920_ZZ99ZZ99' })).not.toBe(key);
    expect(idempotencyKey({ ...base, actionClass: 'CONTENT_PUBLISH' })).not.toBe(key);
  });

  it('repeats exactly for the same action on the same content, which is what makes a retry safe', async () => {
    const hash: string = (await payloadHash({ copy: 'same' })) as string;
    const input = { scope: SCOPE, workId: WORK_ID, actionClass: 'RECORD_WRITE' as ActionClass, payloadHash: hash };
    expect(idempotencyKey(input)).toBe(idempotencyKey(input));
  });

  it('reads a key back into its parts, and refuses one it did not mint', async () => {
    const hash: string = (await payloadHash({ copy: 'same' })) as string;
    const input = { scope: SCOPE, workId: WORK_ID, actionClass: 'REVIEW_DECISION' as ActionClass, payloadHash: hash };
    expect(readIdempotencyKey(idempotencyKey(input))).toEqual(input);
    const encoded: string = encodeURIComponent(SCOPE);
    for (const bad of ['', 'a:b:c', `${encoded}:${WORK_ID}:NOT_A_CLASS:${hash}`, `${encoded}:${WORK_ID}:RECORD_WRITE:nothex`, `:${WORK_ID}:RECORD_WRITE:${hash}`]) {
      expect({ bad, read: readIdempotencyKey(bad) }).toEqual({ bad, read: undefined });
    }
  });

  it('survives a scope that carries a colon, which every site URL does', async () => {
    // Without encoding the scope, "https://host/sites/x" would split the key into five parts and two different
    // sites could collapse onto one key. That is the one failure a key may never have.
    const hash: string = (await payloadHash({ copy: 'same' })) as string;
    const key: string = idempotencyKey({ scope: SCOPE, workId: WORK_ID, actionClass: 'RECORD_WRITE', payloadHash: hash });
    expect(key.split(':').length).toBe(4);
    expect(readIdempotencyKey(key)?.scope).toBe(SCOPE);
    const other: string = idempotencyKey({ scope: 'https://other.sharepoint.com/sites/aicoe', workId: WORK_ID, actionClass: 'RECORD_WRITE', payloadHash: hash });
    expect(other).not.toBe(key);
    expect(readIdempotencyKey(other)?.scope).toBe('https://other.sharepoint.com/sites/aicoe');
  });
});

describe('outcome classification and retry safety', () => {
  it('never calls an unread-back attempt succeeded', () => {
    expect(classifyOutcome({ reachedProvider: true, confirmedByReadback: false, refutedByReadback: false })).toBe('uncertain');
  });

  it('names the four classes', () => {
    expect(classifyOutcome({ reachedProvider: false, confirmedByReadback: false, refutedByReadback: false })).toBe('notAttempted');
    expect(classifyOutcome({ reachedProvider: true, confirmedByReadback: true, refutedByReadback: false })).toBe('succeeded');
    expect(classifyOutcome({ reachedProvider: true, confirmedByReadback: false, refutedByReadback: true })).toBe('failed');
    expect(classifyOutcome({ reachedProvider: true, confirmedByReadback: false, refutedByReadback: false })).toBe('uncertain');
  });

  it('refuses to retry an uncertain outcome, and allows the two that are known', () => {
    const retryable: AttemptOutcome[] = (['succeeded', 'failed', 'uncertain', 'notAttempted'] as AttemptOutcome[]).filter(mayRetry);
    expect(retryable).toEqual(['failed', 'notAttempted']);
    expect(mayRetry('uncertain')).toBe(false);
    expect(RECONCILE_FIRST.length).toBeGreaterThan(0);
  });
});

describe('consequential actions', () => {
  it('names every action that reaches outside the record store', () => {
    const consequential: ActionClass[] = ACTION_CLASSES.filter(isConsequential);
    expect(consequential).toEqual(['MESSAGE_SEND', 'CONTENT_PUBLISH', 'TASK_ASSIGN', 'CALENDAR_WRITE', 'CAMPAIGN_MUTATE']);
  });

  it('treats drafting, recording and deciding as not consequential', () => {
    expect(isConsequential('DRAFT_GENERATE')).toBe(false);
    expect(isConsequential('RECORD_WRITE')).toBe(false);
    expect(isConsequential('REVIEW_DECISION')).toBe(false);
  });
});
