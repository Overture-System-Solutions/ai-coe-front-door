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
import { ARTIFACT_KINDS, parseArtifactRef } from './artifactTypes';
import type { ArtifactKind, IArtifactRef, ReviewKind } from './artifactTypes';
import { REVIEW_KINDS } from './artifactTypes';
import { at, boolean, canonicalId, forbidKeysDeep, formatIssues, integer, isoDateTime, list, literal, oneOf, sha256, sourceRef, strictObject, text, textList, workId } from './schema';
import type { IIssue, Raw } from './schema';
import type { IParseResult } from './campaignBrief';
import type { ISourceRef } from './sourceRegister';

export const ENVELOPE_VERSION: string = '1.0';
export const REVIEW_DECISION_VERSION: string = '1.0';

export type ArtifactState = 'draft' | 'reviewRequested' | 'changesRequested' | 'accepted' | 'rejected' | 'superseded' | 'revalidationRequired';
export const ARTIFACT_STATES: readonly ArtifactState[] = ['draft', 'reviewRequested', 'changesRequested', 'accepted', 'rejected', 'superseded', 'revalidationRequired'];

/** How the payload was produced. `synthetic` can never be asserted as `qualified` by input JSON: the service sets it. */
export type ProvenanceMode = 'synthetic' | 'qualified' | 'manual';

export interface IProviderProvenance {
  mode: ProvenanceMode;
  provider: string;
  model: string;
  requestId: string;
  responseId: string;
  /** The receipt qualifying a live provider for business data; null for synthetic and manual runs. */
  qualificationReceiptRef: string | null;
}

export interface IRegisterSnapshotRef {
  registerId: string;
  version: string;
  snapshotHash: string;
  /** Where the retained snapshot lives (a store key or a receipt reference), so a reviewer can open exactly what was read. */
  snapshotRef: string;
}

export interface ISourceUsed extends ISourceRef {
  /** The precise locator into the source that was actually read. */
  locator: string;
}

export interface IKnowledge {
  known: string[];
  assumed: string[];
  unknown: string[];
}

export interface IMarketingArtifactEnvelopeV1 {
  envelopeVersion: string;
  tenantScope: string;
  workId: string;
  artifactId: string;
  kind: ArtifactKind;
  schemaVersion: string;
  revision: number;
  supersedes: IArtifactRef | null;
  parents: IArtifactRef[];
  payload: unknown;
  payloadHash: string;
  registerSnapshot: IRegisterSnapshotRef;
  sourcesUsed: ISourceUsed[];
  workflowVersion: string;
  policyVersion: string;
  providerProvenance: IProviderProvenance;
  evidenceGaps: string[];
  knowledge: IKnowledge;
  /** From the trusted session, never from the payload. */
  createdBy: string;
  createdAt: string;
  /** True for every record the synthetic store writes; a live store writes it from the tenant's test scope. */
  testRecord: boolean;
  receiptRefs: string[];
}

export type ReviewOutcome = 'accept' | 'requestChanges' | 'reject';

export interface IMarketingReviewDecisionV1 {
  decisionVersion: string;
  reviewId: string;
  workId: string;
  target: IArtifactRef;
  reviewKind: ReviewKind;
  outcome: ReviewOutcome;
  comments: string;
  expectedArtifactRevision: number;
  expectedStoreVersion: string;
  registerSnapshotHash: string;
  /** The exact payload hash decided on; the same as `target.payloadHash`, repeated so a decision reads alone. */
  contentHash: string;
  policyVersion: string;
  authorityBindingRef: string;
  authorityScope: ReviewKind[];
  authorityExpiresAt: string;
  /** From the authenticated review session, never from supplied claims. */
  actorId: string;
  decidedAt: string;
  idempotencyKey: string;
  receiptId: string;
  readbackVerified: boolean;
}

const ENVELOPE_KEYS: readonly string[] = [
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

const DECISION_KEYS: readonly string[] = [
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

function parseProvenance(value: unknown, path: string, issues: IIssue[]): IProviderProvenance | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['mode', 'provider', 'model', 'requestId', 'responseId', 'qualificationReceiptRef']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const mode: ProvenanceMode | undefined = oneOf(raw.mode, at(path, 'mode'), issues, ['synthetic', 'qualified', 'manual']);
  const provider: string | undefined = text(raw.provider, at(path, 'provider'), issues, { max: 200 });
  const model: string | undefined = text(raw.model, at(path, 'model'), issues, { max: 200 });
  const requestId: string | undefined = text(raw.requestId, at(path, 'requestId'), issues, { max: 256 });
  const responseId: string | undefined = text(raw.responseId, at(path, 'responseId'), issues, { max: 256 });
  const qualificationReceiptRef: string | null | undefined = raw.qualificationReceiptRef === null ? null : canonicalId(raw.qualificationReceiptRef, at(path, 'qualificationReceiptRef'), issues);
  if (mode === 'qualified' && qualificationReceiptRef === null) {
    issues.push({ path: at(path, 'qualificationReceiptRef'), message: 'is null while the mode claims a qualified provider; qualification needs a receipt.' });
  }
  if (mode !== 'qualified' && qualificationReceiptRef !== null && qualificationReceiptRef !== undefined) {
    issues.push({ path: at(path, 'qualificationReceiptRef'), message: 'names a qualification receipt for a run that was not a qualified provider run.' });
  }
  if (issues.length !== before || mode === undefined || provider === undefined || model === undefined || requestId === undefined || responseId === undefined || qualificationReceiptRef === undefined) {
    return undefined;
  }
  return { mode, provider, model, requestId, responseId, qualificationReceiptRef };
}

function parseSnapshotRef(value: unknown, path: string, issues: IIssue[]): IRegisterSnapshotRef | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['registerId', 'version', 'snapshotHash', 'snapshotRef']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const registerId: string | undefined = text(raw.registerId, at(path, 'registerId'), issues, { max: 256 });
  const version: string | undefined = text(raw.version, at(path, 'version'), issues, { max: 256 });
  const snapshotHash: string | undefined = sha256(raw.snapshotHash, at(path, 'snapshotHash'), issues);
  const snapshotRef: string | undefined = text(raw.snapshotRef, at(path, 'snapshotRef'), issues, { max: 512 });
  return issues.length !== before || registerId === undefined || version === undefined || snapshotHash === undefined || snapshotRef === undefined ? undefined : { registerId, version, snapshotHash, snapshotRef };
}

function parseSourceUsed(value: unknown, path: string, issues: IIssue[]): ISourceUsed | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['sourceId', 'versionOrETag', 'locator']);
  if (raw === undefined) {
    return undefined;
  }
  const ref: ISourceRef | undefined = sourceRef({ sourceId: raw.sourceId, versionOrETag: raw.versionOrETag }, path, issues);
  const locator: string | undefined = text(raw.locator, at(path, 'locator'), issues, { max: 400 });
  return ref === undefined || locator === undefined ? undefined : { sourceId: ref.sourceId, versionOrETag: ref.versionOrETag, locator };
}

function parseKnowledge(value: unknown, path: string, issues: IIssue[]): IKnowledge | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['known', 'assumed', 'unknown']);
  if (raw === undefined) {
    return undefined;
  }
  const known: string[] | undefined = textList(raw.known, at(path, 'known'), issues);
  const assumed: string[] | undefined = textList(raw.assumed, at(path, 'assumed'), issues);
  const unknown: string[] | undefined = textList(raw.unknown, at(path, 'unknown'), issues);
  return known === undefined || assumed === undefined || unknown === undefined ? undefined : { known, assumed, unknown };
}

/** Reads a stored envelope strictly. The payload is kept opaque here: the kind's own parser reads it. */
export function parseEnvelope(value: unknown): IParseResult<IMarketingArtifactEnvelopeV1> {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, ENVELOPE_KEYS);
  if (raw === undefined) {
    return { valid: false, errors: formatIssues(issues) };
  }
  // The payload is scanned by its own parser; everything around it is scanned here.
  const around: Raw = { ...raw };
  delete around.payload;
  forbidKeysDeep(around, '', issues);
  literal(raw.envelopeVersion, 'envelopeVersion', issues, ENVELOPE_VERSION);
  const tenantScope: string | undefined = text(raw.tenantScope, 'tenantScope', issues, { max: 512 });
  const work: string | undefined = workId(raw.workId, 'workId', issues);
  const artifactId: string | undefined = canonicalId(raw.artifactId, 'artifactId', issues);
  const kind: ArtifactKind | undefined = oneOf(raw.kind, 'kind', issues, ARTIFACT_KINDS);
  const schemaVersion: string | undefined = text(raw.schemaVersion, 'schemaVersion', issues, { max: 16 });
  const revision: number | undefined = integer(raw.revision, 'revision', issues, { min: 1 });
  const supersedes: IArtifactRef | null | undefined = raw.supersedes === null ? null : parseArtifactRef(raw.supersedes, 'supersedes', issues);
  const parents: IArtifactRef[] | undefined = list(raw.parents, 'parents', issues, (item: unknown, itemPath: string): IArtifactRef | undefined => parseArtifactRef(item, itemPath, issues));
  const payloadHash: string | undefined = sha256(raw.payloadHash, 'payloadHash', issues);
  const registerSnapshot: IRegisterSnapshotRef | undefined = parseSnapshotRef(raw.registerSnapshot, 'registerSnapshot', issues);
  const sourcesUsed: ISourceUsed[] | undefined = list(raw.sourcesUsed, 'sourcesUsed', issues, (item: unknown, itemPath: string): ISourceUsed | undefined => parseSourceUsed(item, itemPath, issues));
  const workflowVersion: string | undefined = text(raw.workflowVersion, 'workflowVersion', issues, { max: 64 });
  const policyVersion: string | undefined = text(raw.policyVersion, 'policyVersion', issues, { max: 64 });
  const providerProvenance: IProviderProvenance | undefined = parseProvenance(raw.providerProvenance, 'providerProvenance', issues);
  const evidenceGaps: string[] | undefined = textList(raw.evidenceGaps, 'evidenceGaps', issues);
  const knowledge: IKnowledge | undefined = parseKnowledge(raw.knowledge, 'knowledge', issues);
  const createdBy: string | undefined = text(raw.createdBy, 'createdBy', issues, { max: 256 });
  const createdAt: string | undefined = isoDateTime(raw.createdAt, 'createdAt', issues);
  const testRecord: boolean | undefined = boolean(raw.testRecord, 'testRecord', issues);
  const receiptRefs: string[] | undefined = textList(raw.receiptRefs, 'receiptRefs', issues);
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
    return { valid: false, errors: formatIssues(issues) };
  }
  return {
    valid: true,
    errors: [],
    value: {
      envelopeVersion: ENVELOPE_VERSION,
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

export function parseReviewDecision(value: unknown): IParseResult<IMarketingReviewDecisionV1> {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, DECISION_KEYS);
  if (raw === undefined) {
    return { valid: false, errors: formatIssues(issues) };
  }
  forbidKeysDeep(raw, '', issues);
  literal(raw.decisionVersion, 'decisionVersion', issues, REVIEW_DECISION_VERSION);
  const reviewId: string | undefined = canonicalId(raw.reviewId, 'reviewId', issues);
  const work: string | undefined = workId(raw.workId, 'workId', issues);
  const target: IArtifactRef | undefined = parseArtifactRef(raw.target, 'target', issues);
  const reviewKind: ReviewKind | undefined = oneOf(raw.reviewKind, 'reviewKind', issues, REVIEW_KINDS);
  const outcome: ReviewOutcome | undefined = oneOf(raw.outcome, 'outcome', issues, ['accept', 'requestChanges', 'reject']);
  const comments: string | undefined = text(raw.comments, 'comments', issues, { min: 0 });
  const expectedArtifactRevision: number | undefined = integer(raw.expectedArtifactRevision, 'expectedArtifactRevision', issues, { min: 1 });
  const expectedStoreVersion: string | undefined = text(raw.expectedStoreVersion, 'expectedStoreVersion', issues, { max: 128 });
  const registerSnapshotHash: string | undefined = sha256(raw.registerSnapshotHash, 'registerSnapshotHash', issues);
  const contentHash: string | undefined = sha256(raw.contentHash, 'contentHash', issues);
  const policyVersion: string | undefined = text(raw.policyVersion, 'policyVersion', issues, { max: 64 });
  const authorityBindingRef: string | undefined = text(raw.authorityBindingRef, 'authorityBindingRef', issues, { max: 256 });
  const authorityScope: ReviewKind[] | undefined = list(raw.authorityScope, 'authorityScope', issues, (item: unknown, itemPath: string): ReviewKind | undefined => oneOf(item, itemPath, issues, REVIEW_KINDS), { minItems: 1 });
  const authorityExpiresAt: string | undefined = isoDateTime(raw.authorityExpiresAt, 'authorityExpiresAt', issues);
  const actorId: string | undefined = text(raw.actorId, 'actorId', issues, { max: 256 });
  const decidedAt: string | undefined = isoDateTime(raw.decidedAt, 'decidedAt', issues);
  const idempotencyKey: string | undefined = text(raw.idempotencyKey, 'idempotencyKey', issues, { min: 8, max: 255 });
  const receiptId: string | undefined = canonicalId(raw.receiptId, 'receiptId', issues);
  const readbackVerified: boolean | undefined = boolean(raw.readbackVerified, 'readbackVerified', issues);
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
    return { valid: false, errors: formatIssues(issues) };
  }
  return {
    valid: true,
    errors: [],
    value: {
      decisionVersion: REVIEW_DECISION_VERSION,
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

export interface IReviewRequestRecord {
  requestId: string;
  target: IArtifactRef;
  reviewKind: ReviewKind;
  requestedBy: string;
  requestedAt: string;
}

export interface IStateInputs {
  envelope: IMarketingArtifactEnvelopeV1;
  /** Every revision of the same artifact the store holds, so a later one can supersede this. */
  revisions: readonly IMarketingArtifactEnvelopeV1[];
  requests: readonly IReviewRequestRecord[];
  decisions: readonly IMarketingReviewDecisionV1[];
  /** The register snapshot hash currently in force for this work; a changed snapshot invalidates acceptance. */
  currentRegisterSnapshotHash: string;
  now: Date;
}

/**
 * The state of one revision, derived from durable records alone.
 *
 * A later revision supersedes this one. Otherwise the latest decision on exactly this revision and content decides:
 * reject, changes requested, or accepted - and an acceptance is `revalidationRequired` once the register snapshot
 * it was decided under, or the authority it was decided with, no longer holds. A pending request reads as review
 * requested; with nothing recorded the revision is a draft.
 */
export function deriveState(inputs: IStateInputs): ArtifactState {
  const { envelope } = inputs;
  const later: boolean = inputs.revisions.filter((candidate: IMarketingArtifactEnvelopeV1): boolean => candidate.artifactId === envelope.artifactId && candidate.revision > envelope.revision).length > 0;
  if (later) {
    return 'superseded';
  }
  const own: IMarketingReviewDecisionV1[] = inputs.decisions
    .filter(
      (decision: IMarketingReviewDecisionV1): boolean =>
        decision.target.artifactId === envelope.artifactId && decision.target.revision === envelope.revision && decision.contentHash === envelope.payloadHash && decision.readbackVerified
    )
    .sort((left: IMarketingReviewDecisionV1, right: IMarketingReviewDecisionV1): number => (left.decidedAt < right.decidedAt ? -1 : left.decidedAt > right.decidedAt ? 1 : 0));
  const latest: IMarketingReviewDecisionV1 | undefined = own[own.length - 1];
  if (latest !== undefined) {
    if (latest.outcome === 'reject') {
      return 'rejected';
    }
    if (latest.outcome === 'requestChanges') {
      return 'changesRequested';
    }
    const stale: boolean = latest.registerSnapshotHash !== inputs.currentRegisterSnapshotHash || Date.parse(latest.authorityExpiresAt) <= inputs.now.getTime();
    return stale ? 'revalidationRequired' : 'accepted';
  }
  const requested: boolean = inputs.requests.filter((request: IReviewRequestRecord): boolean => request.target.artifactId === envelope.artifactId && request.target.revision === envelope.revision).length > 0;
  return requested ? 'reviewRequested' : 'draft';
}

/** The plain wording for each state. */
export const ARTIFACT_STATE_LABEL: { [state in ArtifactState]: string } = {
  draft: 'Draft',
  reviewRequested: 'Waiting for review',
  changesRequested: 'Changes requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
  revalidationRequired: 'Needs revalidation'
};
