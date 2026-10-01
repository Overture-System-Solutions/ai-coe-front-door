"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SOURCE_FRESHNESS_DAYS = exports.PROVENANCE_LIMITATION = void 0;
exports.registerSnapshotHash = registerSnapshotHash;
exports.registerSnapshotText = registerSnapshotText;
exports.parseApprovalEvidence = parseApprovalEvidence;
exports.qualifyRegister = qualifyRegister;
exports.checkSourceAccess = checkSourceAccess;
exports.checkSourceSet = checkSourceSet;
/**
 * The source gate: whether a register, and each source in it, may back a Marketing run for this caller, now.
 *
 * `isUsableForBusinessContent` is a boolean about a label. This is the composed check the boolean was mistaken for.
 * A register may back business content only when: it is labelled approved and carries no fixture marker anywhere;
 * an approval receipt exists that was read back from an authenticated store (never authored by the browser), names
 * this register at this version, binds the exact snapshot hash of its rows, and has not expired; and every row a run
 * cites is present at the cited version, resolvable, current, permitted for the run's audience and purpose, and not
 * revoked. In synthetic mode the fixture register is allowed and everything about it says so; a fixture relabelled
 * as approved is refused in both modes, because its rows still carry the marker.
 *
 * What a pass means. A citation that passes here proves provenance: the source exists, is approved, is the version
 * cited and may be shown to this audience. It does not prove the source supports the claim. That stays with the
 * reviewer, and every result says so.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
const actionEnvelope_1 = require("../actionEnvelope");
const sourceRegister_1 = require("./sourceRegister");
const schema_1 = require("./schema");
exports.PROVENANCE_LIMITATION = 'A source that passes this gate exists, is approved at the cited version and may be shown to this audience. That is provenance, not proof that it supports the claim made from it.';
/** Default freshness for a source row: older than this since `asOf` and the row must be reconfirmed before use. */
exports.DEFAULT_SOURCE_FRESHNESS_DAYS = 180;
const DAY_MS = 86400000;
/** Sorted rows, canonical JSON, SHA-256: what an approval receipt binds. */
async function registerSnapshotHash(register) {
    const rows = register.entries.slice().sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    return (0, actionEnvelope_1.payloadHash)({ registerId: register.registerId, version: register.version, rows });
}
/** The bytes the snapshot hash covers, for a test or a receipt to show. */
function registerSnapshotText(register) {
    const rows = register.entries.slice().sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    return (0, actionEnvelope_1.canonicalJson)({ registerId: register.registerId, version: register.version, rows });
}
function parseApprovalEvidence(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, ['receiptId', 'registerId', 'registerVersion', 'snapshotHash', 'approvedByBindingRef', 'approvedAt', 'expiresAt', 'source']);
    if (raw === undefined) {
        return { errors: issues.map((issue) => `${issue.path} ${issue.message}`) };
    }
    const receiptId = (0, schema_1.canonicalId)(raw.receiptId, 'receiptId', issues);
    const registerId = (0, schema_1.text)(raw.registerId, 'registerId', issues, { max: 256 });
    const registerVersion = (0, schema_1.text)(raw.registerVersion, 'registerVersion', issues, { max: 256 });
    const snapshotHash = (0, schema_1.sha256)(raw.snapshotHash, 'snapshotHash', issues);
    const approvedByBindingRef = (0, schema_1.text)(raw.approvedByBindingRef, 'approvedByBindingRef', issues, { max: 256 });
    const approvedAt = (0, schema_1.isoDateTime)(raw.approvedAt, 'approvedAt', issues);
    const expiresAt = (0, schema_1.isoDateTime)(raw.expiresAt, 'expiresAt', issues);
    const source = raw.source === 'authenticatedReadback' || raw.source === 'syntheticFixture' ? raw.source : undefined;
    if (source === undefined) {
        issues.push({ path: 'source', message: 'must be authenticatedReadback or syntheticFixture.' });
    }
    if (issues.length > 0 || receiptId === undefined || registerId === undefined || registerVersion === undefined || snapshotHash === undefined || approvedByBindingRef === undefined || approvedAt === undefined || expiresAt === undefined || source === undefined) {
        return { errors: issues.map((issue) => `${issue.path} ${issue.message}`) };
    }
    return { evidence: { receiptId, registerId, registerVersion, snapshotHash, approvedByBindingRef, approvedAt, expiresAt, source }, errors: [] };
}
/**
 * Whether the register as a whole may back a run in this mode. Fails closed on every missing fact: no digest, no
 * receipt, a receipt for another version, a stale receipt, a changed row, a fixture marker in business mode, or a
 * business label on a fixture in synthetic mode.
 */
async function qualifyRegister(register, options) {
    const reasons = [];
    const snapshotHash = await registerSnapshotHash(register);
    if (snapshotHash === undefined) {
        reasons.push('The platform offers no SHA-256 digest, so the register snapshot cannot be bound; the run stays closed.');
    }
    const fixture = (0, sourceRegister_1.carriesFixtureMarker)(register);
    if (options.mode === 'synthetic') {
        if (!fixture) {
            reasons.push('Synthetic mode reads only a register marked as a fixture; a business register may not be exercised as if it were one.');
        }
        if (register.approval !== 'syntheticFixture') {
            reasons.push(`The register is marked as a fixture in its rows but labelled ${register.approval}; a fixture relabelled as approved is refused.`);
        }
    }
    else {
        if (fixture) {
            reasons.push('The register carries a fixture marker in its id, version or rows; a fixture cannot back business content whatever its label says.');
        }
        if (register.approval !== 'approved') {
            reasons.push(`The register is labelled ${register.approval}, not approved.`);
        }
        const evidence = options.evidence;
        if (evidence === undefined) {
            reasons.push('No approval receipt was read back for this register; a label in the register is not approval.');
        }
        else {
            if (evidence.source !== 'authenticatedReadback') {
                reasons.push('The approval receipt did not come from an authenticated readback.');
            }
            if (evidence.registerId !== register.registerId || evidence.registerVersion !== register.version) {
                reasons.push('The approval receipt names another register or another version.');
            }
            if (snapshotHash !== undefined && evidence.snapshotHash !== snapshotHash) {
                reasons.push('The rows changed since the approval receipt was recorded (snapshot hash differs).');
            }
            if (Date.parse(evidence.expiresAt) <= options.now.getTime()) {
                reasons.push('The approval receipt has expired.');
            }
            if (Date.parse(evidence.approvedAt) > options.now.getTime()) {
                reasons.push('The approval receipt is dated in the future.');
            }
        }
        for (const entry of register.entries) {
            if (!/^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(entry.location)) {
                reasons.push(`${entry.id} has no resolvable https location.`);
            }
        }
    }
    const freshness = options.freshnessDays ?? exports.DEFAULT_SOURCE_FRESHNESS_DAYS;
    const dayIssues = [];
    const asOf = (0, schema_1.isoDay)(register.asOf, 'asOf', dayIssues);
    if (asOf === undefined) {
        reasons.push('The register carries no valid as-of day.');
    }
    else if (options.now.getTime() - Date.parse(`${asOf}T00:00:00Z`) > freshness * DAY_MS) {
        reasons.push(`The register was last confirmed on ${asOf}, more than ${freshness} days ago.`);
    }
    return { usable: reasons.length === 0, mode: options.mode, snapshotHash, reasons, limitation: exports.PROVENANCE_LIMITATION };
}
/**
 * One citation against the register for this caller and purpose. Every refusal names the source, never the row's
 * content, so a denial does not leak what the caller may not read.
 */
function checkSourceAccess(register, reference, context) {
    const entry = register.entries.filter((candidate) => candidate.id === reference.sourceId)[0];
    if (entry === undefined) {
        return { ok: false, sourceId: reference.sourceId, reason: 'is not in the register, so nothing may be cited from it.' };
    }
    if (entry.versionOrETag !== reference.versionOrETag) {
        return { ok: false, sourceId: reference.sourceId, reason: 'has changed since it was approved, so the earlier version cannot be cited.' };
    }
    if (context.revoked.indexOf(entry.id) >= 0) {
        return { ok: false, sourceId: reference.sourceId, reason: 'was revoked by its owner after the snapshot was taken.' };
    }
    if (context.callerId.trim() === '') {
        return { ok: false, sourceId: reference.sourceId, reason: 'cannot be read: the caller is not authenticated.' };
    }
    const dayIssues = [];
    const asOf = (0, schema_1.isoDay)(entry.asOf, 'asOf', dayIssues);
    const freshness = context.freshnessDays ?? exports.DEFAULT_SOURCE_FRESHNESS_DAYS;
    if (asOf === undefined || context.now.getTime() - Date.parse(`${asOf}T00:00:00Z`) > freshness * DAY_MS) {
        return { ok: false, sourceId: reference.sourceId, reason: 'is stale: its as-of day is missing or older than the freshness window.' };
    }
    if (!audiencePermits(entry.audience, context.audience)) {
        return { ok: false, sourceId: reference.sourceId, reason: 'may not be shown to this audience.' };
    }
    if (/restricted|confidential/i.test(entry.classification) && context.purpose !== 'meetingFollowThrough') {
        return { ok: false, sourceId: reference.sourceId, reason: 'is classified above what a campaign artifact may carry.' };
    }
    return { ok: true, sourceId: reference.sourceId, entry };
}
/** A row's audience permits the run's audience when it names everyone, names it, or is the fixture's local-testing audience for a local run. */
function audiencePermits(rowAudience, runAudience) {
    const row = rowAudience.trim().toLowerCase();
    const run = runAudience.trim().toLowerCase();
    if (row === '' || row === 'all staff' || row === 'everyone' || row === 'internal') {
        return true;
    }
    return row === run || row.split(/[;,]/).map((part) => part.trim()).indexOf(run) >= 0;
}
/** Every citation of a run at once; a repeated reference is checked once. */
function checkSourceSet(register, references, context) {
    const usable = [];
    const gaps = [];
    const seen = [];
    for (const reference of references) {
        if (seen.indexOf(reference.sourceId) >= 0) {
            continue;
        }
        seen.push(reference.sourceId);
        const outcome = checkSourceAccess(register, reference, context);
        if (outcome.ok && outcome.entry !== undefined) {
            usable.push({ sourceId: outcome.entry.id, versionOrETag: outcome.entry.versionOrETag });
        }
        else {
            gaps.push(`${outcome.sourceId} ${outcome.reason ?? 'was refused.'}`);
        }
    }
    return { usable, gaps };
}
