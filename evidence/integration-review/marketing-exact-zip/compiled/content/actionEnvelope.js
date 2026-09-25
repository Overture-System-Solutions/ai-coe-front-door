"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECONCILE_FIRST = exports.SHA256_HEX = exports.ACTION_CLASSES = void 0;
exports.isConsequential = isConsequential;
exports.canonicalJson = canonicalJson;
exports.payloadHash = payloadHash;
exports.idempotencyKey = idempotencyKey;
exports.readIdempotencyKey = readIdempotencyKey;
exports.classifyOutcome = classifyOutcome;
exports.mayRetry = mayRetry;
exports.ACTION_CLASSES = [
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
const CONSEQUENTIAL = ['MESSAGE_SEND', 'CONTENT_PUBLISH', 'TASK_ASSIGN', 'CALENDAR_WRITE', 'CAMPAIGN_MUTATE'];
function isConsequential(actionClass) {
    return CONSEQUENTIAL.filter((candidate) => candidate === actionClass).length > 0;
}
/** Sorts object keys at every depth so serialization is stable whatever order a caller built the object in. */
function canonical(value) {
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const source = value;
    const keys = Object.keys(source).sort();
    const target = {};
    for (let index = 0; index < keys.length; index += 1) {
        target[keys[index]] = canonical(source[keys[index]]);
    }
    return target;
}
/** The exact bytes that are hashed; exported so a test can prove two orderings serialize alike. */
function canonicalJson(payload) {
    return JSON.stringify(canonical(payload));
}
function toHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let index = 0; index < bytes.length; index += 1) {
        const part = bytes[index].toString(16);
        hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
}
function subtle() {
    const holder = globalThis;
    const found = holder.crypto === undefined ? undefined : holder.crypto.subtle;
    return found !== undefined && typeof found.digest === 'function' ? found : undefined;
}
/**
 * SHA-256 of the canonical serialization, lower-case hex, or undefined when the platform offers no digest. The
 * undefined answer is deliberate: every caller treats a missing hash as "cannot proceed", which is the safe
 * reading, rather than substituting a hash that would not detect a changed payload.
 */
async function payloadHash(payload) {
    const digest = subtle();
    if (digest === undefined) {
        return undefined;
    }
    try {
        const bytes = new TextEncoder().encode(canonicalJson(payload));
        return toHex(await digest.digest('SHA-256', bytes));
    }
    catch {
        return undefined;
    }
}
/** A SHA-256 hex digest, which is what every hash field of the canonical contract is shaped like. */
exports.SHA256_HEX = /^[0-9a-f]{64}$/;
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
function idempotencyKey(input) {
    return [encodeURIComponent(input.scope), input.workId, input.actionClass, input.payloadHash].join(':');
}
/** Splits a key back into its parts, or undefined when the value is not one this module minted. */
function readIdempotencyKey(key) {
    const parts = key.split(':');
    if (parts.length !== 4) {
        return undefined;
    }
    const actionClass = parts[2];
    const known = exports.ACTION_CLASSES.filter((candidate) => candidate === actionClass).length > 0;
    if (!known || parts[0] === '' || parts[1] === '' || !exports.SHA256_HEX.test(parts[3])) {
        return undefined;
    }
    let scope;
    try {
        scope = decodeURIComponent(parts[0]);
    }
    catch {
        return undefined;
    }
    return { scope, workId: parts[1], actionClass, payloadHash: parts[3] };
}
/**
 * The four outcome classes. The ordering of the checks is the safety property: nothing is called succeeded without
 * a readback, and anything that reached a provider without one is uncertain rather than failed, because calling it
 * failed invites a retry that would duplicate the effect.
 */
function classifyOutcome(attempt) {
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
function mayRetry(outcome) {
    return outcome === 'notAttempted' || outcome === 'failed';
}
/** Why a retry was refused, for a page to show instead of a button that would repeat an unknown effect. */
exports.RECONCILE_FIRST = 'This request reached the service but could not be confirmed. It is not safe to send it again until someone checks whether it already took effect.';
