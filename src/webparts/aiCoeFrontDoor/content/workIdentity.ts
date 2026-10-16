/**
 * Work identity: one record, one canonical id, and a mapping that never rewrites what a tenant already holds.
 *
 * The front door has always written its own record key, `OVT-AICOE-YYYYMMDD-XXXXXXXX`, into the `IntakeId` column
 * of the intake list and the `CoEID` column of the use-case list, and the companion flows read it. The canonical
 * contract of the engineering package is a different shape: `^<PREFIX>-[A-Z0-9_-]{2,124}$` on `WorkRecord.WorkID`,
 * with `canonical_work_id_persists_end_to_end` and a migration that forces IDENTITY on the field. Two facts follow.
 *
 * First, existing rows keep their ids. The contract itself says `existing_work_ids: PRESERVE`, so this module maps
 * rather than renames: the tenant id stays the record key and the canonical id is derived from it, reversibly.
 * Nothing here ever writes a new value over an id a row already carries.
 *
 * Second, the derivation must be total and reversible, because the mapping is the only thing joining a front-door
 * row to a canonical record. `OVT-AICOE-20260920-AB12CD34` becomes `AICOE-OVT_AICOE_20260920_AB12CD34`: the prefix
 * the pattern demands, then the tenant id with its hyphens carried to underscores, which is information-preserving
 * because the tenant id's own alphabet is upper-case letters, digits and hyphens alone. Reading it back restores
 * the original exactly. A value that is not a front-door record key is refused rather than coerced, so a caller
 * cannot quietly mint a canonical id for something that has no record.
 *
 * The prefix is the tenant's (1.0.0.20). The CORE generator writes a target's `work_id_prefix` into its flows, and
 * the web part's "Work ID prefix" setting tells the front door the same value: blank means `AICOE`, the generator's
 * default; anything else must pass the generator's own rule (an upper-case letter, then 1 to 15 upper-case letters
 * or digits). The web part sets it once per render with `configureWorkIdPrefix`, before any service is built, and
 * every check and every minted id here reads it. A malformed setting is refused, not repaired: then no value is a
 * Work ID and none is minted, so a mistyped prefix cannot quietly move a page into another tenant's namespace. One
 * page holds one prefix, because the bundle and so this setting are shared by every instance on the page.
 *
 * The package's own namespace problem is recorded here and deliberately not solved: skill and workflow ids such as
 * `<PREFIX>-INTAKE` satisfy the same regex as a Work ID, so the two namespaces are not machine-separable in the
 * contract. This module only ever produces ids carrying the front-door record key, so what it mints cannot collide
 * with a skill id; it does not and cannot stop something else in the package from doing so.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The prefix when the page sets none: the CORE generator's default `work_id_prefix`. */
export const DEFAULT_WORK_ID_PREFIX: string = 'AICOE';

/** The CORE generator's rule for `work_id_prefix`: an upper-case letter, then 1 to 15 upper-case letters or digits. */
export const WORK_ID_PREFIX: RegExp = /^[A-Z][A-Z0-9]{1,15}$/;

/** What follows the prefix and its hyphen, copied from `WorkRecord.v2`: 2 to 124 of A-Z, 0-9, underscore, hyphen. */
const WORK_ID_BODY: RegExp = /^[A-Z0-9_-]{2,124}$/;

/** The shared pattern every non-Work identifier in the package uses. */
export const CANONICAL_ID: RegExp = /^[A-Z][A-Z0-9_-]{2,127}$/;

/** The record key the front door has always written: prefix, date, then eight upper-case base-36 characters. */
export const TENANT_RECORD_ID: RegExp = /^OVT-AICOE-\d{8}-[0-9A-Z]{8}$/;

/** The configured prefix; undefined while the page holds a malformed one (then nothing is a Work ID, nothing is minted). */
let configuredPrefix: string | undefined = DEFAULT_WORK_ID_PREFIX;

/** The prefix a setting names: the default when blank or absent, undefined when it breaks the generator's rule. */
export function parseWorkIdPrefix(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return DEFAULT_WORK_ID_PREFIX;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed: string = value.trim();
  if (trimmed === '') {
    return DEFAULT_WORK_ID_PREFIX;
  }
  return WORK_ID_PREFIX.test(trimmed) ? trimmed : undefined;
}

/** The property pane's message for a setting: empty when the prefix is usable. */
export function workIdPrefixProblem(value: unknown): string {
  return parseWorkIdPrefix(value) === undefined
    ? 'Use 2 to 16 upper-case letters or digits, starting with a letter, as the CORE target\'s work_id_prefix does. Leave blank for AICOE.'
    : '';
}

/** Sets the page's prefix from the web part setting and returns it (undefined when malformed: every Work ID is then refused). */
export function configureWorkIdPrefix(value: unknown): string | undefined {
  configuredPrefix = parseWorkIdPrefix(value);
  return configuredPrefix;
}

/** The page's prefix, or undefined while the setting is malformed. */
export function workIdPrefix(): string | undefined {
  return configuredPrefix;
}

const patterns: Map<string, RegExp> = new Map();

/**
 * The canonical pattern for a prefix (the page's by default): `^<PREFIX>-[A-Z0-9_-]{2,124}$`, as the generated contract
 * writes it. For a malformed prefix, a pattern that matches nothing.
 */
export function canonicalWorkIdPattern(prefix: string | undefined = configuredPrefix): RegExp {
  if (prefix === undefined || !WORK_ID_PREFIX.test(prefix)) {
    return /(?!)/;
  }
  let pattern: RegExp | undefined = patterns.get(prefix);
  if (pattern === undefined) {
    // The prefix passed WORK_ID_PREFIX above, so it holds upper-case letters and digits alone: no expression syntax.
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
    pattern = new RegExp(`^${prefix}-[A-Z0-9_-]{2,124}$`);
    patterns.set(prefix, pattern);
  }
  return pattern;
}

/** True when the value is a canonical Work ID under the page's prefix; an id under any other prefix is refused. */
export function isCanonicalWorkId(value: unknown): value is string {
  const prefix: string | undefined = configuredPrefix;
  return typeof value === 'string' && prefix !== undefined && value.indexOf(`${prefix}-`) === 0 && WORK_ID_BODY.test(value.slice(prefix.length + 1));
}

/** A Work ID under the page's prefix for a body (`LOCAL_0001`); throws while the prefix is malformed or the body is not one. */
export function mintWorkId(body: string): string {
  const workId: string = `${configuredPrefix ?? ''}-${body}`;
  if (!isCanonicalWorkId(workId)) {
    throw new Error('No Work ID can be minted: the Work ID prefix setting is malformed, or the id is not canonical.');
  }
  return workId;
}

/**
 * The canonical Work ID for a front-door record key, or undefined when the value is not one. Undefined is the
 * answer for anything unrecognised: a caller that cannot name the record must not be handed an id that looks
 * canonical, because every foreign key in the contract points at one.
 */
export function toCanonicalWorkId(tenantRecordId: string): string | undefined {
  if (!TENANT_RECORD_ID.test(tenantRecordId) || configuredPrefix === undefined) {
    return undefined;
  }
  const canonical: string = `${configuredPrefix}-${tenantRecordId.replace(/-/g, '_')}`;
  return isCanonicalWorkId(canonical) ? canonical : undefined;
}

/**
 * The front-door record key behind a canonical Work ID, or undefined when that id was not derived from one. A
 * canonical id minted elsewhere (a skill id, another system's record, another prefix) reads back as undefined rather
 * than as a record key this tenant does not hold.
 */
export function toTenantRecordId(workId: string): string | undefined {
  if (!isCanonicalWorkId(workId)) {
    return undefined;
  }
  const candidate: string = workId.slice((configuredPrefix as string).length + 1).replace(/_/g, '-');
  return TENANT_RECORD_ID.test(candidate) ? candidate : undefined;
}

/** True when the canonical id was derived from a front-door record key, so this tenant holds the row behind it. */
export function isFrontDoorWorkId(workId: string): boolean {
  return toTenantRecordId(workId) !== undefined;
}

/**
 * The seven work types of `WorkRecord.WorkType`. The front door mints only `IDEA` and `CASE` today; the rest are
 * declared so a record read back from a canonical store can be typed without widening the enum later.
 */
export type WorkType = 'IDEA' | 'CASE' | 'DECISION' | 'PROJECT' | 'IMPROVEMENT' | 'ADMIN_WORK' | 'STRATEGIC_CASE';

export const WORK_TYPES: readonly WorkType[] = ['IDEA', 'CASE', 'DECISION', 'PROJECT', 'IMPROVEMENT', 'ADMIN_WORK', 'STRATEGIC_CASE'];

/** The seven stages of `WorkRecord.Stage`. */
export type WorkStage = 'INTAKE' | 'EVIDENCE' | 'DECISION' | 'DELIVERY' | 'VALUE' | 'IMPROVEMENT' | 'CLOSED';

export const WORK_STAGES: readonly WorkStage[] = ['INTAKE', 'EVIDENCE', 'DECISION', 'DELIVERY', 'VALUE', 'IMPROVEMENT', 'CLOSED'];

/**
 * The sentinel vocabulary the contract reuses wherever a number or a fact might be unknown. It exists so a missing
 * value is never written as zero; the front door already refuses to turn a blank measure into 0 and this names the
 * same rule for every new record.
 */
export type Sentinel = 'UNKNOWN' | 'NOT_APPLICABLE' | 'AWAITING_SOURCE' | 'AWAITING_VALIDATION' | 'NOT_AUTHORIZED' | 'NOT_TESTED';

export const SENTINELS: readonly Sentinel[] = ['UNKNOWN', 'NOT_APPLICABLE', 'AWAITING_SOURCE', 'AWAITING_VALIDATION', 'NOT_AUTHORIZED', 'NOT_TESTED'];

export function isSentinel(value: unknown): value is Sentinel {
  return typeof value === 'string' && SENTINELS.filter((sentinel: Sentinel): boolean => sentinel === value).length > 0;
}
