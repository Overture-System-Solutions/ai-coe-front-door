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
import { CANONICAL_ID, CANONICAL_WORK_ID, isSentinel } from '../workIdentity';
import type { Sentinel } from '../workIdentity';
import { SHA256_HEX } from '../actionEnvelope';
import type { ISourceRef } from './sourceRegister';

export interface IIssue {
  path: string;
  message: string;
}

export type Raw = { [key: string]: unknown };

/** A key that names a person, an allocation, a delivery or an executable instruction may appear nowhere in a Marketing artifact. */
export const FORBIDDEN_KEYS: readonly string[] = [
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
export const MAX_TEXT: number = 8000;
export const MAX_ITEMS: number = 200;

const ISO_DATE_TIME: RegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ISO_DAY: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_HREF: RegExp = /^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i;

export function isPlainObject(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function at(path: string, key: string | number): string {
  return typeof key === 'number' ? `${path}[${key}]` : path === '' ? key : `${path}.${key}`;
}

/**
 * An object with exactly the declared keys. Every required key must be present; an optional one may be absent; any
 * other key is refused by name, so a stray `email` cannot ride in beside a role.
 */
export function strictObject(value: unknown, path: string, issues: IIssue[], required: readonly string[], optional: readonly string[] = []): Raw | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'must be an object.' });
    return undefined;
  }
  const keys: string[] = Object.keys(value);
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

export function text(value: unknown, path: string, issues: IIssue[], options: { min?: number; max?: number } = {}): string | undefined {
  const min: number = options.min ?? 1;
  const max: number = options.max ?? MAX_TEXT;
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

export function textList(value: unknown, path: string, issues: IIssue[], options: { minItems?: number } = {}): string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be a list.' });
    return undefined;
  }
  if (value.length < (options.minItems ?? 0)) {
    issues.push({ path, message: `must carry at least ${options.minItems} entr${options.minItems === 1 ? 'y' : 'ies'}.` });
  }
  if (value.length > MAX_ITEMS) {
    issues.push({ path, message: `must carry at most ${MAX_ITEMS} entries.` });
  }
  const before: number = issues.length;
  const out: string[] = [];
  for (let index: number = 0; index < value.length; index += 1) {
    const item: string | undefined = text(value[index], at(path, index), issues);
    if (item !== undefined) {
      out.push(item);
    }
  }
  return issues.length === before ? out : undefined;
}

export function list<T>(value: unknown, path: string, issues: IIssue[], each: (item: unknown, itemPath: string) => T | undefined, options: { minItems?: number } = {}): T[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be a list.' });
    return undefined;
  }
  if (value.length < (options.minItems ?? 0)) {
    issues.push({ path, message: `must carry at least ${options.minItems} entr${options.minItems === 1 ? 'y' : 'ies'}.` });
  }
  if (value.length > MAX_ITEMS) {
    issues.push({ path, message: `must carry at most ${MAX_ITEMS} entries.` });
  }
  const before: number = issues.length;
  const out: T[] = [];
  for (let index: number = 0; index < value.length; index += 1) {
    const item: T | undefined = each(value[index], at(path, index));
    if (item !== undefined) {
      out.push(item);
    }
  }
  return issues.length === before ? out : undefined;
}

/** A UTC instant written as `YYYY-MM-DDTHH:MM:SS[.fff]Z` that also parses to that instant; `not-a-date` is refused. */
export function isoDateTime(value: unknown, path: string, issues: IIssue[]): string | undefined {
  if (typeof value !== 'string' || !ISO_DATE_TIME.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({ path, message: 'must be a UTC date-time such as 2026-09-22T10:00:00Z.' });
    return undefined;
  }
  return value;
}

export function isoDay(value: unknown, path: string, issues: IIssue[]): string | undefined {
  if (typeof value !== 'string' || !ISO_DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    issues.push({ path, message: 'must be a day such as 2026-09-22.' });
    return undefined;
  }
  return value;
}

export function integer(value: unknown, path: string, issues: IIssue[], options: { min?: number } = {}): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value || (options.min !== undefined && value < options.min)) {
    issues.push({ path, message: options.min === undefined ? 'must be a whole number.' : `must be a whole number of ${options.min} or more.` });
    return undefined;
  }
  return value;
}

export function literal<T extends string | number | boolean | null>(value: unknown, path: string, issues: IIssue[], expected: T): T | undefined {
  if (value !== expected) {
    issues.push({ path, message: `must be ${JSON.stringify(expected)}.` });
    return undefined;
  }
  return expected;
}

export function oneOf<T extends string>(value: unknown, path: string, issues: IIssue[], allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string' || allowed.indexOf(value as T) < 0) {
    issues.push({ path, message: `must be one of ${allowed.join(', ')}.` });
    return undefined;
  }
  return value as T;
}

export function boolean(value: unknown, path: string, issues: IIssue[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    issues.push({ path, message: 'must be true or false.' });
    return undefined;
  }
  return value;
}

/** The shared identifier shape of the canonical package: upper-case, 3 to 128 characters. */
export function canonicalId(value: unknown, path: string, issues: IIssue[]): string | undefined {
  if (typeof value !== 'string' || !CANONICAL_ID.test(value)) {
    issues.push({ path, message: 'must be an identifier of the form A-Z0-9_- (3 to 128 characters, upper-case first).' });
    return undefined;
  }
  return value;
}

export function workId(value: unknown, path: string, issues: IIssue[]): string | undefined {
  if (typeof value !== 'string' || !CANONICAL_WORK_ID.test(value)) {
    issues.push({ path, message: 'must be a canonical Work ID (CW-…).' });
    return undefined;
  }
  return value;
}

export function sha256(value: unknown, path: string, issues: IIssue[]): string | undefined {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
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
export function safeHrefOrNull(value: unknown, path: string, issues: IIssue[]): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || !HTTPS_HREF.test(value) || value.indexOf('@') >= 0) {
    issues.push({ path, message: 'must be an https link with a host and no credentials, or null.' });
    return undefined;
  }
  return value;
}

export function sentinel(value: unknown, path: string, issues: IIssue[]): Sentinel | undefined {
  if (!isSentinel(value)) {
    issues.push({ path, message: 'must be one of the canonical sentinels (UNKNOWN, NOT_APPLICABLE, AWAITING_SOURCE, AWAITING_VALIDATION, NOT_AUTHORIZED, NOT_TESTED).' });
    return undefined;
  }
  return value;
}

/** A citation: exactly a source id and the version cited. `{}` and a bare id are both refused. */
export function sourceRef(value: unknown, path: string, issues: IIssue[]): ISourceRef | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['sourceId', 'versionOrETag']);
  if (raw === undefined) {
    return undefined;
  }
  const sourceId: string | undefined = text(raw.sourceId, at(path, 'sourceId'), issues, { max: 256 });
  const versionOrETag: string | undefined = text(raw.versionOrETag, at(path, 'versionOrETag'), issues, { max: 256 });
  return sourceId === undefined || versionOrETag === undefined ? undefined : { sourceId, versionOrETag };
}

export function sourceRefs(value: unknown, path: string, issues: IIssue[], options: { minItems?: number } = {}): ISourceRef[] | undefined {
  const refs: ISourceRef[] | undefined = list(value, path, issues, (item: unknown, itemPath: string): ISourceRef | undefined => sourceRef(item, itemPath, issues), options);
  if (refs === undefined) {
    return undefined;
  }
  const seen: string[] = [];
  for (let index: number = 0; index < refs.length; index += 1) {
    const key: string = `${refs[index].sourceId}@${refs[index].versionOrETag}`;
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
export function forbidKeysDeep(value: unknown, path: string, issues: IIssue[]): void {
  if (Array.isArray(value)) {
    for (let index: number = 0; index < value.length; index += 1) {
      forbidKeysDeep(value[index], at(path, index), issues);
    }
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.indexOf(key.toLowerCase()) >= 0) {
      issues.push({ path: at(path, key), message: 'names a person, an allocation, a delivery or an instruction; the contract carries none of these.' });
      continue;
    }
    forbidKeysDeep(value[key], at(path, key), issues);
  }
}

/** True when the text carries the shapes an instruction to a model or a system usually arrives in. */
export function looksLikeInstruction(value: string): boolean {
  return /(^|\b)(ignore (all|any|previous|prior) (instructions|rules)|you are now|system prompt|assistant:|<\/?script|send (this|it|the) (to|now)|approve (this|it) (now|automatically))\b/i.test(value);
}

export function formatIssues(issues: readonly IIssue[]): string[] {
  return issues.map((issue: IIssue): string => (issue.path === '' ? issue.message : `${issue.path} ${issue.message}`));
}
