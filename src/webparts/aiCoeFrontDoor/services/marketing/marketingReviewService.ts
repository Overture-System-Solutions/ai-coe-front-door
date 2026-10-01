/**
 * Review orchestration for Marketing artifacts: request a review, record a decision within a bound authority, read
 * the durable result back, reconcile an attempt whose outcome was lost.
 *
 * The rules this service holds, each of which the 2026-09-22 review found missing from the demonstration:
 *
 * A decision is a durable record about exactly one content. It binds the artifact id, the revision, the payload
 * hash, the register snapshot and the authority it was made under. It is written, read back, and only then marked
 * verified; the artifact's state is derived from verified decisions alone.
 *
 * A reviewer is an authenticated identity within a bound authority. The session names the actor; the store names
 * which authorities that actor holds, over which review kinds, until when. A decision outside that scope, after
 * expiry, by the person who drafted the artifact, or by a session with no binding is refused. In synthetic mode the
 * store seeds fictional, labelled bindings and the page may assume one of them explicitly; in live mode there is no
 * such switch and no binding until configuration records one for a real person.
 *
 * Stale means refused. A decision on a superseded revision, on a different hash, or against a store version that
 * moved is refused with `staleVersion`; the reviewer re-reads and decides again on what is current.
 *
 * Same intent, same result. A retry with the same idempotency key and the same payload returns the decision already
 * recorded; the same key with a different payload is refused. An attempt whose write was not confirmed is left
 * pending and reconciled from its intent record, never repeated blind.
 *
 * Nothing here sends, publishes, assigns, schedules or changes a campaign. An acceptance is permission for nothing
 * beyond drafting the next artifact from it.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { payloadHash } from '../../content/actionEnvelope';
import type { ArtifactState, IMarketingArtifactEnvelopeV1, IMarketingReviewDecisionV1, IReviewRequestRecord, ReviewOutcome } from '../../content/marketing/artifactEnvelope';
import { parseReviewDecision } from '../../content/marketing/artifactEnvelope';
import type { IArtifactRef, ReviewKind } from '../../content/marketing/artifactTypes';
import type { IParseResult } from '../../content/marketing/campaignBrief';
import { decide } from '../authorization';
import type { IDecision } from '../authorization';
import { ArtifactRepository } from './artifactRepository';
import type { IArtifactWithState, IAuthorityBinding, IIntentRecord, IReceipt } from './artifactRepository';
import type { IWriteOutcome } from './artifactStore';
import type { IMarketingSession } from './marketingDraftService';

/** A review session: the actor and the authority binding they act under. `synthetic` marks an assumed fictional reviewer. */
export interface IReviewSession extends IMarketingSession {
  authorityBindingRef?: string;
  synthetic: boolean;
}

export interface IDecisionRequest {
  target: IArtifactRef;
  reviewKind: ReviewKind;
  outcome: ReviewOutcome;
  comments: string;
  /** The store version of the target as the reviewer read it; a moved version is refused. */
  expectedStoreVersion: string;
  idempotencyKey: string;
}

export type ReviewFailureKind = 'notAuthorized' | 'unauthorizedReviewer' | 'authorityExpired' | 'selfReview' | 'notFound' | 'staleVersion' | 'noRequest' | 'keyReuse' | 'storeUnavailable' | 'uncertain';

export interface IReviewRecorded {
  kind: 'recorded';
  decision: IMarketingReviewDecisionV1;
  receipt: IReceipt;
  state: ArtifactState;
  /** True when this call returned an earlier decision for the same key and payload instead of writing a second one. */
  replayed: boolean;
}

export interface IReviewFailed {
  kind: 'failed';
  failure: ReviewFailureKind;
  reasons: string[];
  intentKey?: string;
}

export type ReviewResult = IReviewRecorded | IReviewFailed;

export interface IRequestRecorded {
  kind: 'recorded';
  request: IReviewRequestRecord;
  state: ArtifactState;
}

export type RequestResult = IRequestRecorded | IReviewFailed;

export interface IReviewServiceOptions {
  repository: ArtifactRepository;
  now?: () => Date;
  newId?: (prefix: string) => string;
  policyVersion?: string;
  /** The register snapshot hash currently in force, so a changed register invalidates acceptance. */
  currentRegisterSnapshotHash: () => Promise<string | undefined>;
}

/** The fictional reviewers the synthetic store seeds. Roles with the synthetic marker, never a real person (decision 2). */
export const SYNTHETIC_AUTHORITIES: readonly IAuthorityBinding[] = [
  {
    bindingRef: 'synthetic:marketing-owner',
    actorId: 'fictional-marketing-owner (synthetic)',
    label: 'Fictional Marketing Owner (synthetic)',
    scope: ['strategyVoice'],
    expiresAt: '2099-01-01T00:00:00Z',
    synthetic: true
  },
  {
    bindingRef: 'synthetic:communications-owner',
    actorId: 'fictional-communications-owner (synthetic)',
    label: 'Fictional Communications Owner (synthetic)',
    scope: ['copyChannel', 'communicationsSend'],
    expiresAt: '2099-01-01T00:00:00Z',
    synthetic: true
  },
  {
    bindingRef: 'synthetic:meeting-owner',
    actorId: 'fictional-meeting-owner (synthetic)',
    label: 'Fictional Meeting Owner (synthetic)',
    scope: ['meetingDecisionsActions'],
    expiresAt: '2099-01-01T00:00:00Z',
    synthetic: true
  }
];

const POLICY_VERSION: string = 'copy-policy-local-baseline-v1';

let counter: number = 0;

function defaultNewId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(counter).padStart(4, '0')}`;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export class MarketingReviewService {
  private readonly _repository: ArtifactRepository;
  private readonly _now: () => Date;
  private readonly _newId: (prefix: string) => string;
  private readonly _policyVersion: string;
  private readonly _snapshot: () => Promise<string | undefined>;
  private _seeded: boolean = false;

  public constructor(options: IReviewServiceOptions) {
    this._repository = options.repository;
    this._now = options.now ?? ((): Date => new Date());
    this._newId = options.newId ?? defaultNewId;
    this._policyVersion = options.policyVersion ?? POLICY_VERSION;
    this._snapshot = options.currentRegisterSnapshotHash;
  }

  public get mode(): 'synthetic' | 'live' {
    return this._repository.store.mode;
  }

  /** Seeds the fictional bindings into a synthetic store once; a live store is never seeded. */
  public async ensureSyntheticAuthorities(): Promise<void> {
    if (this._seeded || this._repository.store.mode !== 'synthetic') {
      return;
    }
    for (const binding of SYNTHETIC_AUTHORITIES) {
      const held: IAuthorityBinding | undefined = await this._repository.readAuthority(binding.bindingRef);
      if (held === undefined) {
        await this._repository.writeAuthority(binding);
      }
    }
    this._seeded = true;
  }

  /**
   * A session acting as one of the fictional reviewers. Synthetic mode only: a live store refuses, because a real
   * reviewer is the signed-in person with a binding recorded by configuration, never an assumed identity.
   */
  public async assumeSyntheticReviewer(base: IMarketingSession, bindingRef: string): Promise<IReviewSession | IReviewFailed> {
    if (this._repository.store.mode !== 'synthetic') {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['Assuming a reviewer identity is available in the synthetic store only.'] };
    }
    await this.ensureSyntheticAuthorities();
    const binding: IAuthorityBinding | undefined = await this._repository.readAuthority(bindingRef);
    if (binding === undefined || !binding.synthetic) {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['No synthetic authority with that reference exists.'] };
    }
    return { actorId: binding.actorId, tenantScope: base.tenantScope, resolution: { roles: ['employee', 'marketingReviewer'], resolution: 'resolved' }, authorityBindingRef: binding.bindingRef, synthetic: true };
  }

  public async authorities(): Promise<IAuthorityBinding[]> {
    await this.ensureSyntheticAuthorities();
    return this._repository.authorities();
  }

  public async getArtifact(artifactId: string, revision?: number): Promise<IArtifactWithState | undefined> {
    const envelope: IMarketingArtifactEnvelopeV1 | undefined = revision === undefined ? await this._repository.latestRevision(artifactId) : (await this._repository.readEnvelope(artifactId, revision))?.envelope;
    if (envelope === undefined) {
      return undefined;
    }
    const held: { envelope: IMarketingArtifactEnvelopeV1; storeVersion: string } | undefined = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
    if (held === undefined) {
      return undefined;
    }
    return { envelope: held.envelope, state: await this._state(held.envelope), storeVersion: held.storeVersion };
  }

  /** The artifacts of one work, latest revision each, with their derived states. */
  public async listArtifacts(workId: string): Promise<IArtifactWithState[]> {
    const envelopes: IMarketingArtifactEnvelopeV1[] = await this._repository.artifactsOf(workId);
    const out: IArtifactWithState[] = [];
    for (const envelope of envelopes) {
      const held: { envelope: IMarketingArtifactEnvelopeV1; storeVersion: string } | undefined = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
      if (held !== undefined) {
        out.push({ envelope: held.envelope, state: await this._state(held.envelope), storeVersion: held.storeVersion });
      }
    }
    return out;
  }

  /** The artifacts a person may see: those they created (own work), in this slice. */
  public async listOwnArtifacts(session: IMarketingSession, workId: string): Promise<IArtifactWithState[]> {
    return (await this.listArtifacts(workId)).filter((item: IArtifactWithState): boolean => item.envelope.createdBy === session.actorId);
  }

  public async requestReview(session: IMarketingSession, target: IArtifactRef, reviewKind: ReviewKind): Promise<RequestResult> {
    if (this._repository.store.unavailableReasons.length > 0) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
    }
    const held: { envelope: IMarketingArtifactEnvelopeV1; storeVersion: string } | undefined = await this._repository.readEnvelope(target.artifactId, target.revision);
    if (held === undefined || held.envelope.payloadHash !== target.payloadHash) {
      return { kind: 'failed', failure: 'notFound', reasons: ['No artifact revision with that id, revision and content exists.'] };
    }
    if (held.envelope.createdBy !== session.actorId) {
      return { kind: 'failed', failure: 'notAuthorized', reasons: ['Only the person who saved a revision may send it for review.'] };
    }
    const state: ArtifactState = await this._state(held.envelope);
    if (state !== 'draft' && state !== 'changesRequested') {
      return { kind: 'failed', failure: 'staleVersion', reasons: [`The revision reads as ${state}; only a draft can be sent for review.`] };
    }
    const request: IReviewRequestRecord = { requestId: this._newId('RVQ'), target, reviewKind, requestedBy: session.actorId, requestedAt: stamp(this._now()) };
    const written: IWriteOutcome = await this._repository.writeRequest(request);
    if (!written.ok) {
      return { kind: 'failed', failure: 'uncertain', reasons: [written.reason ?? 'The request could not be confirmed.'] };
    }
    return { kind: 'recorded', request, state: await this._state(held.envelope) };
  }

  public async recordReviewDecision(session: IReviewSession, request: IDecisionRequest): Promise<ReviewResult> {
    if (this._repository.store.unavailableReasons.length > 0) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
    }
    const capability: IDecision = decide('decideMarketingReview', session.resolution);
    if (!capability.allowed) {
      return { kind: 'failed', failure: 'notAuthorized', reasons: [capability.message] };
    }
    // The authority: bound to this actor, covering this review kind, not expired.
    if (session.authorityBindingRef === undefined) {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['No reviewer authority is bound to this session; the real Marketing owner and copy/channel approver remain unbound.'] };
    }
    const binding: IAuthorityBinding | undefined = await this._repository.readAuthority(session.authorityBindingRef);
    if (binding === undefined || binding.actorId !== session.actorId) {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['The authority binding does not name the signed-in reviewer.'] };
    }
    if (binding.synthetic && this._repository.store.mode !== 'synthetic') {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['A synthetic binding cannot decide in a live store.'] };
    }
    const now: Date = this._now();
    if (Date.parse(binding.expiresAt) <= now.getTime()) {
      return { kind: 'failed', failure: 'authorityExpired', reasons: ['The reviewer\'s authority has expired.'] };
    }
    if (binding.scope.indexOf(request.reviewKind) < 0) {
      return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: [`The reviewer's authority covers ${binding.scope.join(', ')}, not ${request.reviewKind}.`] };
    }
    // The target: exactly this revision and content, current, with a review requested.
    const held: { envelope: IMarketingArtifactEnvelopeV1; storeVersion: string } | undefined = await this._repository.readEnvelope(request.target.artifactId, request.target.revision);
    if (held === undefined) {
      return { kind: 'failed', failure: 'notFound', reasons: ['No artifact revision with that id and revision exists.'] };
    }
    if (held.envelope.payloadHash !== request.target.payloadHash) {
      return { kind: 'failed', failure: 'staleVersion', reasons: ['The content hash differs from the stored revision; re-read before deciding.'] };
    }
    if (held.storeVersion !== request.expectedStoreVersion) {
      return { kind: 'failed', failure: 'staleVersion', reasons: ['The record changed since it was read (store version mismatch); re-read before deciding.'] };
    }
    const latest: IMarketingArtifactEnvelopeV1 | undefined = await this._repository.latestRevision(request.target.artifactId);
    if (latest !== undefined && latest.revision !== request.target.revision) {
      return { kind: 'failed', failure: 'staleVersion', reasons: [`Revision ${request.target.revision} is superseded by revision ${latest.revision}; a late review cannot accept an older revision.`] };
    }
    if (held.envelope.createdBy === session.actorId) {
      return { kind: 'failed', failure: 'selfReview', reasons: ['The person who saved a revision may not decide its review.'] };
    }
    const requests: IReviewRequestRecord[] = await this._repository.requestsFor(request.target.artifactId);
    const requested: boolean = requests.filter((candidate: IReviewRequestRecord): boolean => candidate.target.revision === request.target.revision && candidate.reviewKind === request.reviewKind).length > 0;
    if (!requested) {
      return { kind: 'failed', failure: 'noRequest', reasons: ['No review of this kind was requested for this revision.'] };
    }
    const snapshotHash: string | undefined = await this._snapshot();
    if (snapshotHash === undefined) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: ['The current register snapshot could not be read; a decision must bind it.'] };
    }
    // Idempotency: the same key with the same payload returns the earlier decision; a different payload is refused.
    const digest: string | undefined = await payloadHash({ target: request.target, reviewKind: request.reviewKind, outcome: request.outcome, comments: request.comments, actor: session.actorId });
    if (digest === undefined) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: ['No SHA-256 digest is available; the decision cannot be keyed.'] };
    }
    const intent: { intent: IIntentRecord; storeVersion: string } | undefined = await this._repository.readIntent(request.idempotencyKey);
    if (intent !== undefined) {
      if (intent.intent.payloadDigest !== digest) {
        return { kind: 'failed', failure: 'keyReuse', reasons: ['This idempotency key was already used for a different decision; a new intent needs a new key.'] };
      }
      if (intent.intent.status === 'completed' && intent.intent.resultKey !== undefined) {
        const reviewId: string = intent.intent.resultKey.replace(/^decision:/, '');
        const earlier: { decision: IMarketingReviewDecisionV1 } | undefined = await this._repository.readDecision(reviewId);
        const receipt: IReceipt | undefined = earlier === undefined ? undefined : await this._repository.readReceipt(earlier.decision.receiptId);
        if (earlier !== undefined && receipt !== undefined) {
          return { kind: 'recorded', decision: earlier.decision, receipt, state: await this._state(held.envelope), replayed: true };
        }
      }
      // Pending or unreadable: reconcile rather than write a second decision.
      const reconciled: ReviewResult | undefined = await this.reconcileAttempt(request.idempotencyKey);
      if (reconciled !== undefined) {
        return reconciled;
      }
      return { kind: 'failed', failure: 'uncertain', reasons: ['An earlier attempt with this key is pending and could not be reconciled; do not retry blind.'], intentKey: request.idempotencyKey };
    }
    const reviewId: string = this._newId('RVW');
    const receiptId: string = this._newId('RCPT');
    const decidedAt: string = stamp(now);
    const decision: IMarketingReviewDecisionV1 = {
      decisionVersion: '1.0',
      reviewId,
      workId: held.envelope.workId,
      target: request.target,
      reviewKind: request.reviewKind,
      outcome: request.outcome,
      comments: request.comments,
      expectedArtifactRevision: request.target.revision,
      expectedStoreVersion: request.expectedStoreVersion,
      registerSnapshotHash: snapshotHash,
      contentHash: request.target.payloadHash,
      policyVersion: this._policyVersion,
      authorityBindingRef: binding.bindingRef,
      authorityScope: binding.scope,
      authorityExpiresAt: binding.expiresAt,
      actorId: session.actorId,
      decidedAt,
      idempotencyKey: request.idempotencyKey,
      receiptId,
      readbackVerified: false
    };
    const check: IParseResult<IMarketingReviewDecisionV1> = parseReviewDecision(decision);
    if (check.value === undefined) {
      return { kind: 'failed', failure: 'uncertain', reasons: check.errors };
    }
    const intentWrite: IWriteOutcome = await this._repository.writeIntent({ key: request.idempotencyKey, operation: 'recordDecision', payloadDigest: digest, status: 'pending', resultKey: `decision:${reviewId}`, startedAt: decidedAt }, { ifAbsent: true });
    if (!intentWrite.ok) {
      return { kind: 'failed', failure: 'uncertain', reasons: [intentWrite.reason ?? 'The intent could not be recorded.'], intentKey: request.idempotencyKey };
    }
    const written: IWriteOutcome = await this._repository.writeDecision(decision, { ifAbsent: true });
    if (!written.ok) {
      return { kind: 'failed', failure: 'uncertain', reasons: [written.reason ?? 'The decision could not be confirmed.'], intentKey: request.idempotencyKey };
    }
    return this._verify(decision, digest, held.envelope);
  }

  /** Reads a written decision back, marks it verified, writes its receipt and completes the intent. */
  private async _verify(decision: IMarketingReviewDecisionV1, digest: string, envelope: IMarketingArtifactEnvelopeV1): Promise<ReviewResult> {
    const readback: { decision: IMarketingReviewDecisionV1; storeVersion: string } | undefined = await this._repository.readDecision(decision.reviewId);
    if (readback === undefined || readback.decision.contentHash !== decision.contentHash || readback.decision.outcome !== decision.outcome) {
      return { kind: 'failed', failure: 'uncertain', reasons: ['The decision did not read back as written.'], intentKey: decision.idempotencyKey };
    }
    const verified: IMarketingReviewDecisionV1 = { ...readback.decision, readbackVerified: true };
    const confirm: IWriteOutcome = await this._repository.writeDecision(verified, { expectedVersion: readback.storeVersion });
    if (!confirm.ok) {
      return { kind: 'failed', failure: 'uncertain', reasons: [confirm.reason ?? 'The verified decision could not be written.'], intentKey: decision.idempotencyKey };
    }
    const receipt: IReceipt = {
      receiptId: decision.receiptId,
      operation: 'recordDecision',
      targetRef: `decision:${decision.reviewId}`,
      payloadHash: digest,
      readbackHash: decision.contentHash,
      result: 'PASS',
      observedAt: stamp(this._now()),
      actorId: decision.actorId
    };
    await this._repository.writeReceipt(receipt);
    await this._repository.writeIntent({ key: decision.idempotencyKey, operation: 'recordDecision', payloadDigest: digest, status: 'completed', resultKey: `decision:${decision.reviewId}`, startedAt: decision.decidedAt });
    return { kind: 'recorded', decision: verified, receipt, state: await this._state(envelope), replayed: false };
  }

  public async getReview(reviewId: string): Promise<IMarketingReviewDecisionV1 | undefined> {
    return (await this._repository.readDecision(reviewId))?.decision;
  }

  public async decisionsFor(artifactId: string): Promise<IMarketingReviewDecisionV1[]> {
    return this._repository.decisionsFor(artifactId);
  }

  public async requestsFor(artifactId: string): Promise<IReviewRequestRecord[]> {
    return this._repository.requestsFor(artifactId);
  }

  /**
   * Reconciles an attempt whose outcome was lost: if the decision the intent named exists, it is verified and
   * returned; if it does not, the intent is still pending and the caller may retry with the same key. Nothing is
   * written twice.
   */
  public async reconcileAttempt(intentKey: string): Promise<ReviewResult | undefined> {
    const intent: { intent: IIntentRecord; storeVersion: string } | undefined = await this._repository.readIntent(intentKey);
    if (intent === undefined || intent.intent.operation !== 'recordDecision' || intent.intent.resultKey === undefined) {
      return undefined;
    }
    const reviewId: string = intent.intent.resultKey.replace(/^decision:/, '');
    const held: { decision: IMarketingReviewDecisionV1; storeVersion: string } | undefined = await this._repository.readDecision(reviewId);
    if (held === undefined) {
      return undefined;
    }
    const envelope: { envelope: IMarketingArtifactEnvelopeV1 } | undefined = await this._repository.readEnvelope(held.decision.target.artifactId, held.decision.target.revision);
    if (envelope === undefined) {
      return undefined;
    }
    if (held.decision.readbackVerified) {
      const receipt: IReceipt | undefined = await this._repository.readReceipt(held.decision.receiptId);
      return receipt === undefined ? undefined : { kind: 'recorded', decision: held.decision, receipt, state: await this._state(envelope.envelope), replayed: true };
    }
    return this._verify(held.decision, intent.intent.payloadDigest, envelope.envelope);
  }

  private async _state(envelope: IMarketingArtifactEnvelopeV1): Promise<ArtifactState> {
    const snapshot: string | undefined = await this._snapshot();
    return this._repository.stateOf(envelope, snapshot ?? '', this._now());
  }
}
