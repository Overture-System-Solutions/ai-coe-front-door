"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARTIFACT_STATE_LABEL = exports.ARTIFACT_STATES = exports.REVIEW_DECISION_VERSION = exports.ENVELOPE_VERSION = void 0;
exports.parseEnvelope = parseEnvelope;
exports.parseReviewDecision = parseReviewDecision;
exports.requiredReviewKinds = requiredReviewKinds;
exports.deriveState = deriveState;
/**
 * The durable envelope around a Marketing artifact, and the durable record of a review decision.
 *
 * A payload's schema version is not an artifact revision, and a React reducer is not persistence (review finding
 * FD03, 2026-09-22). This module names what the service writes around each of the three payloads so a revision can
 * be read back exactly: which work it belongs to, which revision it is and which it supersedes, which parents it
 * was drafted from, which register snapshot and which sources it used, how it was produced, what state the service
 * derived for it, and who decided what about which exact content. Nothing here is produced by a model.
 *
 * States are derived, never asserted. `deriveState` computes the artifact's state from its durable revisions and
 * the decisions recorded against them; a payload saying `state: 'accepted'` is refused by the parser. Acceptance
 * binds the exact revision and content hash; a later revision, a changed register snapshot or an expired authority
 * makes dependent acceptance `revalidationRequired` without touching the earlier record.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
const artifactTypes_1 = require("./artifactTypes");
const artifactTypes_2 = require("./artifactTypes");
const schema_1 = require("./schema");
exports.ENVELOPE_VERSION = '1.0';
exports.REVIEW_DECISION_VERSION = '1.0';
exports.ARTIFACT_STATES = ['draft', 'reviewRequested', 'changesRequested', 'accepted', 'rejected', 'superseded', 'revalidationRequired'];
const ENVELOPE_KEYS = [
    'envelopeVersion',
    'tenantScope',
    'workId',
    'artifactId',
    'kind',
    'schemaVersion',
    'revision',
    'supersedes',
    'parents',
    'payload',
    'payloadHash',
    'registerSnapshot',
    'sourcesUsed',
    'workflowVersion',
    'policyVersion',
    'providerProvenance',
    'evidenceGaps',
    'knowledge',
    'createdBy',
    'createdAt',
    'testRecord',
    'receiptRefs'
];
const DECISION_KEYS = [
    'decisionVersion',
    'reviewId',
    'workId',
    'target',
    'reviewKind',
    'outcome',
    'comments',
    'expectedArtifactRevision',
    'expectedStoreVersion',
    'registerSnapshotHash',
    'contentHash',
    'policyVersion',
    'authorityBindingRef',
    'authorityScope',
    'authorityExpiresAt',
    'actorId',
    'decidedAt',
    'idempotencyKey',
    'receiptId',
    'readbackVerified'
];
function parseProvenance(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['mode', 'provider', 'model', 'requestId', 'responseId', 'qualificationReceiptRef']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const mode = (0, schema_1.oneOf)(raw.mode, (0, schema_1.at)(path, 'mode'), issues, ['synthetic', 'qualified', 'manual']);
    const provider = (0, schema_1.text)(raw.provider, (0, schema_1.at)(path, 'provider'), issues, { max: 200 });
    const model = (0, schema_1.text)(raw.model, (0, schema_1.at)(path, 'model'), issues, { max: 200 });
    const requestId = (0, schema_1.text)(raw.requestId, (0, schema_1.at)(path, 'requestId'), issues, { max: 256 });
    const responseId = (0, schema_1.text)(raw.responseId, (0, schema_1.at)(path, 'responseId'), issues, { max: 256 });
    const qualificationReceiptRef = raw.qualificationReceiptRef === null ? null : (0, schema_1.canonicalId)(raw.qualificationReceiptRef, (0, schema_1.at)(path, 'qualificationReceiptRef'), issues);
    if (mode === 'qualified' && qualificationReceiptRef === null) {
        issues.push({ path: (0, schema_1.at)(path, 'qualificationReceiptRef'), message: 'is null while the mode claims a qualified provider; qualification needs a receipt.' });
    }
    if (mode !== 'qualified' && qualificationReceiptRef !== null && qualificationReceiptRef !== undefined) {
        issues.push({ path: (0, schema_1.at)(path, 'qualificationReceiptRef'), message: 'names a qualification receipt for a run that was not a qualified provider run.' });
    }
    if (issues.length !== before || mode === undefined || provider === undefined || model === undefined || requestId === undefined || responseId === undefined || qualificationReceiptRef === undefined) {
        return undefined;
    }
    return { mode, provider, model, requestId, responseId, qualificationReceiptRef };
}
function parseSnapshotRef(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['registerId', 'version', 'snapshotHash', 'snapshotRef']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const registerId = (0, schema_1.text)(raw.registerId, (0, schema_1.at)(path, 'registerId'), issues, { max: 256 });
    const version = (0, schema_1.text)(raw.version, (0, schema_1.at)(path, 'version'), issues, { max: 256 });
    const snapshotHash = (0, schema_1.sha256)(raw.snapshotHash, (0, schema_1.at)(path, 'snapshotHash'), issues);
    const snapshotRef = (0, schema_1.text)(raw.snapshotRef, (0, schema_1.at)(path, 'snapshotRef'), issues, { max: 512 });
    return issues.length !== before || registerId === undefined || version === undefined || snapshotHash === undefined || snapshotRef === undefined ? undefined : { registerId, version, snapshotHash, snapshotRef };
}
function parseSourceUsed(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['sourceId', 'versionOrETag', 'locator']);
    if (raw === undefined) {
        return undefined;
    }
    const ref = (0, schema_1.sourceRef)({ sourceId: raw.sourceId, versionOrETag: raw.versionOrETag }, path, issues);
    const locator = (0, schema_1.text)(raw.locator, (0, schema_1.at)(path, 'locator'), issues, { max: 400 });
    return ref === undefined || locator === undefined ? undefined : { sourceId: ref.sourceId, versionOrETag: ref.versionOrETag, locator };
}
function parseKnowledge(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['known', 'assumed', 'unknown']);
    if (raw === undefined) {
        return undefined;
    }
    const known = (0, schema_1.textList)(raw.known, (0, schema_1.at)(path, 'known'), issues);
    const assumed = (0, schema_1.textList)(raw.assumed, (0, schema_1.at)(path, 'assumed'), issues);
    const unknown = (0, schema_1.textList)(raw.unknown, (0, schema_1.at)(path, 'unknown'), issues);
    return known === undefined || assumed === undefined || unknown === undefined ? undefined : { known, assumed, unknown };
}
/** Reads a stored envelope strictly. The payload is kept opaque here: the kind's own parser reads it. */
function parseEnvelope(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, ENVELOPE_KEYS);
    if (raw === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    // The payload is scanned by its own parser; everything around it is scanned here.
    const around = { ...raw };
    delete around.payload;
    (0, schema_1.forbidKeysDeep)(around, '', issues);
    (0, schema_1.literal)(raw.envelopeVersion, 'envelopeVersion', issues, exports.ENVELOPE_VERSION);
    const tenantScope = (0, schema_1.text)(raw.tenantScope, 'tenantScope', issues, { max: 512 });
    const work = (0, schema_1.workId)(raw.workId, 'workId', issues);
    const artifactId = (0, schema_1.canonicalId)(raw.artifactId, 'artifactId', issues);
    const kind = (0, schema_1.oneOf)(raw.kind, 'kind', issues, artifactTypes_1.ARTIFACT_KINDS);
    const schemaVersion = (0, schema_1.text)(raw.schemaVersion, 'schemaVersion', issues, { max: 16 });
    const revision = (0, schema_1.integer)(raw.revision, 'revision', issues, { min: 1 });
    const supersedes = raw.supersedes === null ? null : (0, artifactTypes_1.parseArtifactRef)(raw.supersedes, 'supersedes', issues);
    const parents = (0, schema_1.list)(raw.parents, 'parents', issues, (item, itemPath) => (0, artifactTypes_1.parseArtifactRef)(item, itemPath, issues));
    const payloadHash = (0, schema_1.sha256)(raw.payloadHash, 'payloadHash', issues);
    const registerSnapshot = parseSnapshotRef(raw.registerSnapshot, 'registerSnapshot', issues);
    const sourcesUsed = (0, schema_1.list)(raw.sourcesUsed, 'sourcesUsed', issues, (item, itemPath) => parseSourceUsed(item, itemPath, issues));
    const workflowVersion = (0, schema_1.text)(raw.workflowVersion, 'workflowVersion', issues, { max: 64 });
    const policyVersion = (0, schema_1.text)(raw.policyVersion, 'policyVersion', issues, { max: 64 });
    const providerProvenance = parseProvenance(raw.providerProvenance, 'providerProvenance', issues);
    const evidenceGaps = (0, schema_1.textList)(raw.evidenceGaps, 'evidenceGaps', issues);
    const knowledge = parseKnowledge(raw.knowledge, 'knowledge', issues);
    const createdBy = (0, schema_1.text)(raw.createdBy, 'createdBy', issues, { max: 256 });
    const createdAt = (0, schema_1.isoDateTime)(raw.createdAt, 'createdAt', issues);
    const testRecord = (0, schema_1.boolean)(raw.testRecord, 'testRecord', issues);
    const receiptRefs = (0, schema_1.textList)(raw.receiptRefs, 'receiptRefs', issues);
    if (raw.payload === undefined || raw.payload === null || typeof raw.payload !== 'object') {
        issues.push({ path: 'payload', message: 'must be the artifact object.' });
    }
    if (supersedes !== null && supersedes !== undefined && revision !== undefined && supersedes.revision !== revision - 1) {
        issues.push({ path: 'supersedes.revision', message: 'must be exactly the previous revision.' });
    }
    if (supersedes !== null && supersedes !== undefined && artifactId !== undefined && (supersedes.artifactId !== artifactId || supersedes.kind !== kind)) {
        issues.push({ path: 'supersedes', message: 'must name an earlier revision of this same artifact.' });
    }
    if (revision === 1 && supersedes !== null) {
        issues.push({ path: 'supersedes', message: 'must be null on the first revision.' });
    }
    if (issues.length > 0 || tenantScope === undefined || work === undefined || artifactId === undefined || kind === undefined || schemaVersion === undefined || revision === undefined || supersedes === undefined || parents === undefined || payloadHash === undefined || registerSnapshot === undefined || sourcesUsed === undefined || workflowVersion === undefined || policyVersion === undefined || providerProvenance === undefined || evidenceGaps === undefined || knowledge === undefined || createdBy === undefined || createdAt === undefined || testRecord === undefined || receiptRefs === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    return {
        valid: true,
        errors: [],
        value: {
            envelopeVersion: exports.ENVELOPE_VERSION,
            tenantScope,
            workId: work,
            artifactId,
            kind,
            schemaVersion,
            revision,
            supersedes,
            parents,
            payload: raw.payload,
            payloadHash,
            registerSnapshot,
            sourcesUsed,
            workflowVersion,
            policyVersion,
            providerProvenance,
            evidenceGaps,
            knowledge,
            createdBy,
            createdAt,
            testRecord,
            receiptRefs
        }
    };
}
function parseReviewDecision(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, DECISION_KEYS);
    if (raw === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    (0, schema_1.forbidKeysDeep)(raw, '', issues);
    (0, schema_1.literal)(raw.decisionVersion, 'decisionVersion', issues, exports.REVIEW_DECISION_VERSION);
    const reviewId = (0, schema_1.canonicalId)(raw.reviewId, 'reviewId', issues);
    const work = (0, schema_1.workId)(raw.workId, 'workId', issues);
    const target = (0, artifactTypes_1.parseArtifactRef)(raw.target, 'target', issues);
    const reviewKind = (0, schema_1.oneOf)(raw.reviewKind, 'reviewKind', issues, artifactTypes_2.REVIEW_KINDS);
    const outcome = (0, schema_1.oneOf)(raw.outcome, 'outcome', issues, ['accept', 'requestChanges', 'reject']);
    const comments = (0, schema_1.text)(raw.comments, 'comments', issues, { min: 0 });
    const expectedArtifactRevision = (0, schema_1.integer)(raw.expectedArtifactRevision, 'expectedArtifactRevision', issues, { min: 1 });
    const expectedStoreVersion = (0, schema_1.text)(raw.expectedStoreVersion, 'expectedStoreVersion', issues, { max: 128 });
    const registerSnapshotHash = (0, schema_1.sha256)(raw.registerSnapshotHash, 'registerSnapshotHash', issues);
    const contentHash = (0, schema_1.sha256)(raw.contentHash, 'contentHash', issues);
    const policyVersion = (0, schema_1.text)(raw.policyVersion, 'policyVersion', issues, { max: 64 });
    const authorityBindingRef = (0, schema_1.text)(raw.authorityBindingRef, 'authorityBindingRef', issues, { max: 256 });
    const authorityScope = (0, schema_1.list)(raw.authorityScope, 'authorityScope', issues, (item, itemPath) => (0, schema_1.oneOf)(item, itemPath, issues, artifactTypes_2.REVIEW_KINDS), { minItems: 1 });
    const authorityExpiresAt = (0, schema_1.isoDateTime)(raw.authorityExpiresAt, 'authorityExpiresAt', issues);
    const actorId = (0, schema_1.text)(raw.actorId, 'actorId', issues, { max: 256 });
    const decidedAt = (0, schema_1.isoDateTime)(raw.decidedAt, 'decidedAt', issues);
    const idempotencyKey = (0, schema_1.text)(raw.idempotencyKey, 'idempotencyKey', issues, { min: 8, max: 255 });
    const receiptId = (0, schema_1.canonicalId)(raw.receiptId, 'receiptId', issues);
    const readbackVerified = (0, schema_1.boolean)(raw.readbackVerified, 'readbackVerified', issues);
    if (target !== undefined && contentHash !== undefined && target.payloadHash !== contentHash) {
        issues.push({ path: 'contentHash', message: 'differs from the target revision\'s payload hash; a decision binds exactly one content.' });
    }
    if (target !== undefined && expectedArtifactRevision !== undefined && target.revision !== expectedArtifactRevision) {
        issues.push({ path: 'expectedArtifactRevision', message: 'differs from the target revision.' });
    }
    if (reviewKind !== undefined && authorityScope !== undefined && authorityScope.indexOf(reviewKind) < 0) {
        issues.push({ path: 'authorityScope', message: `does not include ${reviewKind}; the reviewer decided outside their bound authority.` });
    }
    if (issues.length > 0 || reviewId === undefined || work === undefined || target === undefined || reviewKind === undefined || outcome === undefined || comments === undefined || expectedArtifactRevision === undefined || expectedStoreVersion === undefined || registerSnapshotHash === undefined || contentHash === undefined || policyVersion === undefined || authorityBindingRef === undefined || authorityScope === undefined || authorityExpiresAt === undefined || actorId === undefined || decidedAt === undefined || idempotencyKey === undefined || receiptId === undefined || readbackVerified === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    return {
        valid: true,
        errors: [],
        value: {
            decisionVersion: exports.REVIEW_DECISION_VERSION,
            reviewId,
            workId: work,
            target,
            reviewKind,
            outcome,
            comments,
            expectedArtifactRevision,
            expectedStoreVersion,
            registerSnapshotHash,
            contentHash,
            policyVersion,
            authorityBindingRef,
            authorityScope,
            authorityExpiresAt,
            actorId,
            decidedAt,
            idempotencyKey,
            receiptId,
            readbackVerified
        }
    };
}
/**
 * The state of one revision, derived from durable records alone.
 *
 * A later revision supersedes this one. Otherwise the latest decision on exactly this revision and content decides:
 * reject, changes requested, or accepted - and an acceptance is `revalidationRequired` once the register snapshot
 * it was decided under, or the authority it was decided with, no longer holds. A pending request reads as review
 * requested; with nothing recorded the revision is a draft.
 */
function requiredReviewKinds(envelope) {
    const required = envelope.kind === 'campaignBrief' ? ['strategyVoice'] : envelope.kind === 'contentPlan' ? ['copyChannel'] : ['meetingDecisionsActions'];
    const payload = envelope.payload;
    if (envelope.kind === 'meetingFollowThrough' && (payload.communicationsDrafts?.length ?? 0) > 0)
        required.push('communicationsSend');
    for (const requirement of payload.approvalRequirements ?? []) {
        if (artifactTypes_2.REVIEW_KINDS.indexOf(requirement.reviewKind) >= 0 && required.indexOf(requirement.reviewKind) < 0)
            required.push(requirement.reviewKind);
    }
    return required;
}
function deriveState(inputs) {
    const { envelope } = inputs;
    const later = inputs.revisions.filter((candidate) => candidate.artifactId === envelope.artifactId && candidate.revision > envelope.revision).length > 0;
    if (later) {
        return 'superseded';
    }
    const own = inputs.decisions
        .filter((decision) => decision.target.artifactId === envelope.artifactId && decision.target.revision === envelope.revision && decision.contentHash === envelope.payloadHash && decision.readbackVerified)
        .sort((left, right) => (left.decidedAt < right.decidedAt ? -1 : left.decidedAt > right.decidedAt ? 1 : 0));
    const required = requiredReviewKinds(envelope);
    const latestByKind = required.map(kind => own.filter(decision => decision.reviewKind === kind).pop());
    if (latestByKind.some(decision => decision?.outcome === 'reject'))
        return 'rejected';
    if (latestByKind.some(decision => decision?.outcome === 'requestChanges'))
        return 'changesRequested';
    if (latestByKind.some(decision => decision !== undefined && (decision.registerSnapshotHash !== inputs.currentRegisterSnapshotHash || !Number.isFinite(Date.parse(decision.authorityExpiresAt)) || Date.parse(decision.authorityExpiresAt) <= inputs.now.getTime())))
        return 'revalidationRequired';
    if (latestByKind.every(decision => decision?.outcome === 'accept'))
        return 'accepted';
    const requested = inputs.requests.filter((request) => request.target.artifactId === envelope.artifactId && request.target.revision === envelope.revision).length > 0;
    return requested ? 'reviewRequested' : 'draft';
}
/** The plain wording for each state. */
exports.ARTIFACT_STATE_LABEL = {
    draft: 'Draft',
    reviewRequested: 'Waiting for review',
    changesRequested: 'Changes requested',
    accepted: 'Accepted',
    rejected: 'Rejected',
    superseded: 'Superseded',
    revalidationRequired: 'Needs revalidation'
};
