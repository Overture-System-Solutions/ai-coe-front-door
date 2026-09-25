"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ITEMS = exports.MAX_TEXT = exports.FORBIDDEN_KEYS = void 0;
exports.isPlainObject = isPlainObject;
exports.at = at;
exports.strictObject = strictObject;
exports.text = text;
exports.textList = textList;
exports.list = list;
exports.isoDateTime = isoDateTime;
exports.isoDay = isoDay;
exports.integer = integer;
exports.literal = literal;
exports.oneOf = oneOf;
exports.boolean = boolean;
exports.canonicalId = canonicalId;
exports.workId = workId;
exports.sha256 = sha256;
exports.safeHrefOrNull = safeHrefOrNull;
exports.sentinel = sentinel;
exports.sourceRef = sourceRef;
exports.sourceRefs = sourceRefs;
exports.forbidKeysDeep = forbidKeysDeep;
exports.looksLikeInstruction = looksLikeInstruction;
exports.formatIssues = formatIssues;
/**
 * Strict runtime validation for the Marketing contracts: the enforcement boundary the type annotations are not.
 *
 * A TypeScript interface stops nothing at run time. A provider answer, a stored row or a pasted object can carry an
 * `email` under a proposed owner, a `{}` where a citation should be, `not-a-date` in a timestamp, or a link that
 * runs script - and every one of those passed the first campaign validator, which checked shapes rather than
 * values. These helpers read one untrusted value at a time, refuse anything not in the contract (unknown keys,
 * ill-typed fields, unsafe links, identity and task fields), and say exactly where, so the composed validators of
 * the three operations are built from the same refusals.
 *
 * Every helper pushes issues rather than throwing, so a caller gets the whole list; every helper also returns the
 * narrowed value (or undefined) so the composed parsers can build a typed copy from what they actually accepted,
 * never from the raw object.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
const workIdentity_1 = require("../workIdentity");
const actionEnvelope_1 = require("../actionEnvelope");
/** A key that names a person, an allocation, a delivery or an executable instruction may appear nowhere in a Marketing artifact. */
exports.FORBIDDEN_KEYS = [
    'email',
    'mail',
    'upn',
    'userid',
    'loginname',
    'assignedto',
    'assignee',
    'assigneeid',
    'taskid',
    'recipient',
    'recipients',
    'to',
    'cc',
    'bcc',
    'send',
    'publish',
    'publishat',
    'sendat',
    'schedule',
    'calendarevent',
    'webhook',
    'callback',
    '__proto__',
    'constructor',
    'prototype'
];
/** The largest text any one field may carry; a provider that answers with a novel is refused, not stored. */
exports.MAX_TEXT = 8000;
exports.MAX_ITEMS = 200;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_HREF = /^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i;
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function at(path, key) {
    return typeof key === 'number' ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`;
}
/**
 * An object with exactly the declared keys. Every required key must be present; an optional one may be absent; any
 * other key is refused by name, so a stray `email` cannot ride in beside a role.
 */
function strictObject(value, path, issues, required, optional = []) {
    if (!isPlainObject(value)) {
        issues.push({ path, message: 'must be an object.' });
        return undefined;
    }
    const keys = Object.keys(value);
    for (const key of required) {
        if (keys.indexOf(key) < 0 || value[key] === undefined) {
            issues.push({ path: at(path, key), message: 'is required.' });
        }
    }
    for (const key of keys) {
        if (required.indexOf(key) < 0 && optional.indexOf(key) < 0) {
            issues.push({ path: at(path, key), message: 'is not part of this contract and is refused.' });
        }
    }
    return value;
}
function text(value, path, issues, options = {}) {
    const min = options.min ?? 1;
    const max = options.max ?? exports.MAX_TEXT;
    if (typeof value !== 'string') {
        issues.push({ path, message: 'must be text.' });
        return undefined;
    }
    if (value.trim().length < min) {
        issues.push({ path, message: min === 1 ? 'must not be blank.' : `must be at least ${min} characters.` });
        return undefined;
    }
    if (value.length > max) {
        issues.push({ path, message: `must be at most ${max} characters.` });
        return undefined;
    }
    return value;
}
function textList(value, path, issues, options = {}) {
    if (!Array.isArray(value)) {
        issues.push({ path, message: 'must be a list.' });
        return undefined;
    }
    if (value.length < (options.minItems ?? 0)) {
        issues.push({ path, message: `must carry at least ${options.minItems} entr${options.minItems === 1 ? 'y' : 'ies'}.` });
    }
    if (value.length > exports.MAX_ITEMS) {
        issues.push({ path, message: `must carry at most ${exports.MAX_ITEMS} entries.` });
    }
    const before = issues.length;
    const out = [];
    for (let index = 0; index < value.length; index += 1) {
        const item = text(value[index], at(path, index), issues);
        if (item !== undefined) {
            out.push(item);
        }
    }
    return issues.length === before ? out : undefined;
}
function list(value, path, issues, each, options = {}) {
    if (!Array.isArray(value)) {
        issues.push({ path, message: 'must be a list.' });
        return undefined;
    }
    if (value.length < (options.minItems ?? 0)) {
        issues.push({ path, message: `must carry at least ${options.minItems} entr${options.minItems === 1 ? 'y' : 'ies'}.` });
    }
    if (value.length > exports.MAX_ITEMS) {
        issues.push({ path, message: `must carry at most ${exports.MAX_ITEMS} entries.` });
    }
    const before = issues.length;
    const out = [];
    for (let index = 0; index < value.length; index += 1) {
        const item = each(value[index], at(path, index));
        if (item !== undefined) {
            out.push(item);
        }
    }
    return issues.length === before ? out : undefined;
}
/** A UTC instant written as `YYYY-MM-DDTHH:MM:SS[.fff]Z` that also parses to that instant; `not-a-date` is refused. */
function isoDateTime(value, path, issues) {
    if (typeof value !== 'string' || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
        issues.push({ path, message: 'must be a UTC date-time such as 2026-09-22T10:00:00Z.' });
        return undefined;
    }
    return value;
}
function isoDay(value, path, issues) {
    if (typeof value !== 'string' || !ISO_DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        issues.push({ path, message: 'must be a day such as 2026-09-22.' });
        return undefined;
    }
    return value;
}
function integer(value, path, issues, options = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value || (options.min !== undefined && value < options.min)) {
        issues.push({ path, message: options.min === undefined ? 'must be a whole number.' : `must be a whole number of ${options.min} or more.` });
        return undefined;
    }
    return value;
}
function literal(value, path, issues, expected) {
    if (value !== expected) {
        issues.push({ path, message: `must be ${JSON.stringify(expected)}.` });
        return undefined;
    }
    return expected;
}
function oneOf(value, path, issues, allowed) {
    if (typeof value !== 'string' || allowed.indexOf(value) < 0) {
        issues.push({ path, message: `must be one of ${allowed.join(', ')}.` });
        return undefined;
    }
    return value;
}
function boolean(value, path, issues) {
    if (typeof value !== 'boolean') {
        issues.push({ path, message: 'must be true or false.' });
        return undefined;
    }
    return value;
}
/** The shared identifier shape of the canonical package: upper-case, 3 to 128 characters. */
function canonicalId(value, path, issues) {
    if (typeof value !== 'string' || !workIdentity_1.CANONICAL_ID.test(value)) {
        issues.push({ path, message: 'must be an identifier of the form A-Z0-9_- (3 to 128 characters, upper-case first).' });
        return undefined;
    }
    return value;
}
function workId(value, path, issues) {
    if (typeof value !== 'string' || !workIdentity_1.CANONICAL_WORK_ID.test(value)) {
        issues.push({ path, message: 'must be a canonical Work ID (CW-…).' });
        return undefined;
    }
    return value;
}
function sha256(value, path, issues) {
    if (typeof value !== 'string' || !actionEnvelope_1.SHA256_HEX.test(value)) {
        issues.push({ path, message: 'must be a lower-case SHA-256 hex digest.' });
        return undefined;
    }
    if (/^0{64}$/.test(value)) {
        issues.push({ path, message: 'is an all-zero digest, which is a placeholder and never evidence.' });
        return undefined;
    }
    return value;
}
/** An https link with a host and no credentials, or null. `javascript:`, `data:` and `http:` are refused. */
function safeHrefOrNull(value, path, issues) {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string' || !HTTPS_HREF.test(value) || value.indexOf('@') >= 0) {
        issues.push({ path, message: 'must be an https link with a host and no credentials, or null.' });
        return undefined;
    }
    return value;
}
function sentinel(value, path, issues) {
    if (!(0, workIdentity_1.isSentinel)(value)) {
        issues.push({ path, message: 'must be one of the canonical sentinels (UNKNOWN, NOT_APPLICABLE, AWAITING_SOURCE, AWAITING_VALIDATION, NOT_AUTHORIZED, NOT_TESTED).' });
        return undefined;
    }
    return value;
}
/** A citation: exactly a source id and the version cited. `{}` and a bare id are both refused. */
function sourceRef(value, path, issues) {
    const raw = strictObject(value, path, issues, ['sourceId', 'versionOrETag']);
    if (raw === undefined) {
        return undefined;
    }
    const sourceId = text(raw.sourceId, at(path, 'sourceId'), issues, { max: 256 });
    const versionOrETag = text(raw.versionOrETag, at(path, 'versionOrETag'), issues, { max: 256 });
    return sourceId === undefined || versionOrETag === undefined ? undefined : { sourceId, versionOrETag };
}
function sourceRefs(value, path, issues, options = {}) {
    const refs = list(value, path, issues, (item, itemPath) => sourceRef(item, itemPath, issues), options);
    if (refs === undefined) {
        return undefined;
    }
    const seen = [];
    for (let index = 0; index < refs.length; index += 1) {
        const key = `${refs[index].sourceId}@${refs[index].versionOrETag}`;
        if (seen.indexOf(key) >= 0) {
            issues.push({ path: at(path, index), message: 'repeats an earlier citation.' });
        }
        seen.push(key);
    }
    return refs;
}
/**
 * Walks the whole value and refuses any key on the forbidden list, at any depth and in any case. This is what
 * stops `proposedOwners[0].email` or a `send: true` instruction reaching a stored record even when a later
 * contract forgets to declare that field's parent strictly.
 */
function forbidKeysDeep(value, path, issues) {
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            forbidKeysDeep(value[index], at(path, index), issues);
        }
        return;
    }
    if (!isPlainObject(value)) {
        return;
    }
    for (const key of Object.keys(value)) {
        if (exports.FORBIDDEN_KEYS.indexOf(key.toLowerCase()) >= 0) {
            issues.push({ path: at(path, key), message: 'names a person, an allocation, a delivery or an instruction; the contract carries none of these.' });
            continue;
        }
        forbidKeysDeep(value[key], at(path, key), issues);
    }
}
/** True when the text carries the shapes an instruction to a model or a system usually arrives in. */
function looksLikeInstruction(value) {
    return /(^|\b)(ignore (all|any|previous|prior) (instructions|rules)|you are now|system prompt|assistant:|<\/?script|send (this|it|the) (to|now)|approve (this|it) (now|automatically))\b/i.test(value);
}
function formatIssues(issues) {
    return issues.map((issue) => (issue.path === '' ? issue.message : `${issue.path} ${issue.message}`));
}
