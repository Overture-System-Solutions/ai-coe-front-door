/**
 * Work identity: one record, one canonical id, and a mapping that never rewrites what a tenant already holds.
 *
 * The front door has always written its own record key, `OVT-AICOE-YYYYMMDD-XXXXXXXX`, into the `IntakeId` column
 * of the intake list and the `CoEID` column of the use-case list, and the companion flows read it. The canonical
 * contract of the engineering package is a different shape: `^CW-[A-Z0-9_-]{2,124}$` on `WorkRecord.WorkID`, with
 * `canonical_work_id_persists_end_to_end` and a migration that forces IDENTITY on the field. Two facts follow.
 *
 * First, existing rows keep their ids. The contract itself says `existing_work_ids: PRESERVE`, so this module maps
 * rather than renames: the tenant id stays the record key and the canonical id is derived from it, reversibly.
 * Nothing here ever writes a new value over an id a row already carries.
 *
 * Second, the derivation must be total and reversible, because the mapping is the only thing joining a front-door
 * row to a canonical record. `OVT-AICOE-20260920-AB12CD34` becomes `CW-OVT_AICOE_20260920_AB12CD34`: the prefix the
 * pattern demands, then the tenant id with its hyphens carried to underscores, which is information-preserving
 * because the tenant id's own alphabet is upper-case letters, digits and hyphens alone. Reading it back restores
 * the original exactly. A value that is not a front-door record key is refused rather than coerced, so a caller
 * cannot quietly mint a canonical id for something that has no record.
 *
 * The package's own namespace problem is recorded here and deliberately not solved: skill and workflow ids such as
 * `CW-INTAKE` satisfy the same regex as a Work ID, so the two namespaces are not machine-separable in the contract.
 * This module only ever produces ids carrying the front-door prefix, so what it mints cannot collide with a skill
 * id; it does not and cannot stop something else in the package from doing so.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The canonical pattern, copied from `WorkRecord.v2`: literal `CW-`, then 2 to 124 of A-Z, 0-9, underscore, hyphen. */
export const CANONICAL_WORK_ID: RegExp = /^CW-[A-Z0-9_-]{2,124}$/;

/** The shared pattern every non-Work identifier in the package uses. */
export const CANONICAL_ID: RegExp = /^[A-Z][A-Z0-9_-]{2,127}$/;

/** The record key the front door has always written: prefix, date, then eight upper-case base-36 characters. */
export const TENANT_RECORD_ID: RegExp = /^OVT-AICOE-\d{8}-[0-9A-Z]{8}$/;

const CANONICAL_PREFIX: string = 'CW-';

/**
 * The canonical Work ID for a front-door record key, or undefined when the value is not one. Undefined is the
 * answer for anything unrecognised: a caller that cannot name the record must not be handed an id that looks
 * canonical, because every foreign key in the contract points at one.
 */
export function toCanonicalWorkId(tenantRecordId: string): string | undefined {
  if (!TENANT_RECORD_ID.test(tenantRecordId)) {
    return undefined;
  }
  const canonical: string = CANONICAL_PREFIX + tenantRecordId.replace(/-/g, '_');
  return CANONICAL_WORK_ID.test(canonical) ? canonical : undefined;
}

/**
 * The front-door record key behind a canonical Work ID, or undefined when that id was not derived from one. A
 * canonical id minted elsewhere (a skill id, another system's record) reads back as undefined rather than as a
 * record key this tenant does not hold.
 */
export function toTenantRecordId(workId: string): string | undefined {
  if (!CANONICAL_WORK_ID.test(workId)) {
    return undefined;
  }
  const candidate: string = workId.slice(CANONICAL_PREFIX.length).replace(/_/g, '-');
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
