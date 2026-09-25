"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SENTINELS = exports.WORK_STAGES = exports.WORK_TYPES = exports.TENANT_RECORD_ID = exports.CANONICAL_ID = exports.CANONICAL_WORK_ID = void 0;
exports.toCanonicalWorkId = toCanonicalWorkId;
exports.toTenantRecordId = toTenantRecordId;
exports.isFrontDoorWorkId = isFrontDoorWorkId;
exports.isSentinel = isSentinel;
/** The canonical pattern, copied from `WorkRecord.v2`: literal `CW-`, then 2 to 124 of A-Z, 0-9, underscore, hyphen. */
exports.CANONICAL_WORK_ID = /^CW-[A-Z0-9_-]{2,124}$/;
/** The shared pattern every non-Work identifier in the package uses. */
exports.CANONICAL_ID = /^[A-Z][A-Z0-9_-]{2,127}$/;
/** The record key the front door has always written: prefix, date, then eight upper-case base-36 characters. */
exports.TENANT_RECORD_ID = /^OVT-AICOE-\d{8}-[0-9A-Z]{8}$/;
const CANONICAL_PREFIX = 'CW-';
/**
 * The canonical Work ID for a front-door record key, or undefined when the value is not one. Undefined is the
 * answer for anything unrecognised: a caller that cannot name the record must not be handed an id that looks
 * canonical, because every foreign key in the contract points at one.
 */
function toCanonicalWorkId(tenantRecordId) {
    if (!exports.TENANT_RECORD_ID.test(tenantRecordId)) {
        return undefined;
    }
    const canonical = CANONICAL_PREFIX + tenantRecordId.replace(/-/g, '_');
    return exports.CANONICAL_WORK_ID.test(canonical) ? canonical : undefined;
}
/**
 * The front-door record key behind a canonical Work ID, or undefined when that id was not derived from one. A
 * canonical id minted elsewhere (a skill id, another system's record) reads back as undefined rather than as a
 * record key this tenant does not hold.
 */
function toTenantRecordId(workId) {
    if (!exports.CANONICAL_WORK_ID.test(workId)) {
        return undefined;
    }
    const candidate = workId.slice(CANONICAL_PREFIX.length).replace(/_/g, '-');
    return exports.TENANT_RECORD_ID.test(candidate) ? candidate : undefined;
}
/** True when the canonical id was derived from a front-door record key, so this tenant holds the row behind it. */
function isFrontDoorWorkId(workId) {
    return toTenantRecordId(workId) !== undefined;
}
exports.WORK_TYPES = ['IDEA', 'CASE', 'DECISION', 'PROJECT', 'IMPROVEMENT', 'ADMIN_WORK', 'STRATEGIC_CASE'];
exports.WORK_STAGES = ['INTAKE', 'EVIDENCE', 'DECISION', 'DELIVERY', 'VALUE', 'IMPROVEMENT', 'CLOSED'];
exports.SENTINELS = ['UNKNOWN', 'NOT_APPLICABLE', 'AWAITING_SOURCE', 'AWAITING_VALIDATION', 'NOT_AUTHORIZED', 'NOT_TESTED'];
function isSentinel(value) {
    return typeof value === 'string' && exports.SENTINELS.filter((sentinel) => sentinel === value).length > 0;
}
