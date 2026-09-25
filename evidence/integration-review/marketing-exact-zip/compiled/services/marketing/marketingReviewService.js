"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketingReviewService = exports.SYNTHETIC_AUTHORITIES = void 0;
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
const actionEnvelope_1 = require("../../content/actionEnvelope");
const artifactEnvelope_1 = require("../../content/marketing/artifactEnvelope");
const authorization_1 = require("../authorization");
/** The fictional reviewers the synthetic store seeds. Roles with the synthetic marker, never a real person (decision 2). */
exports.SYNTHETIC_AUTHORITIES = [
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
const POLICY_VERSION = 'copy-policy-local-baseline-v1';
let counter = 0;
function defaultNewId(prefix) {
    counter += 1;
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(counter).padStart(4, '0')}`;
}
function stamp(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
class MarketingReviewService {
    _repository;
    _now;
    _newId;
    _policyVersion;
    _snapshot;
    _seeded = false;
    constructor(options) {
        this._repository = options.repository;
        this._now = options.now ?? (() => new Date());
        this._newId = options.newId ?? defaultNewId;
        this._policyVersion = options.policyVersion ?? POLICY_VERSION;
        this._snapshot = options.currentRegisterSnapshotHash;
    }
    get mode() {
        return this._repository.store.mode;
    }
    /** Seeds the fictional bindings into a synthetic store once; a live store is never seeded. */
    async ensureSyntheticAuthorities() {
        if (this._seeded || this._repository.store.mode !== 'synthetic') {
            return;
        }
        for (const binding of exports.SYNTHETIC_AUTHORITIES) {
            const held = await this._repository.readAuthority(binding.bindingRef);
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
    async assumeSyntheticReviewer(base, bindingRef) {
        if (this._repository.store.mode !== 'synthetic') {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['Assuming a reviewer identity is available in the synthetic store only.'] };
        }
        await this.ensureSyntheticAuthorities();
        const binding = await this._repository.readAuthority(bindingRef);
        if (binding === undefined || !binding.synthetic) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['No synthetic authority with that reference exists.'] };
        }
        return { actorId: binding.actorId, tenantScope: base.tenantScope, resolution: { roles: ['employee', 'marketingReviewer'], resolution: 'resolved' }, authorityBindingRef: binding.bindingRef, synthetic: true };
    }
    async authorities() {
        await this.ensureSyntheticAuthorities();
        return this._repository.authorities();
    }
    async getArtifact(artifactId, revision) {
        const envelope = revision === undefined ? await this._repository.latestRevision(artifactId) : (await this._repository.readEnvelope(artifactId, revision))?.envelope;
        if (envelope === undefined) {
            return undefined;
        }
        const held = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
        if (held === undefined) {
            return undefined;
        }
        return { envelope: held.envelope, state: await this._state(held.envelope), storeVersion: held.storeVersion };
    }
    /** The artifacts of one work, latest revision each, with their derived states. */
    async listArtifacts(workId) {
        const envelopes = await this._repository.artifactsOf(workId);
        const out = [];
        for (const envelope of envelopes) {
            const held = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
            if (held !== undefined) {
                out.push({ envelope: held.envelope, state: await this._state(held.envelope), storeVersion: held.storeVersion });
            }
        }
        return out;
    }
    /** The artifacts a person may see: those they created (own work), in this slice. */
    async listOwnArtifacts(session, workId) {
        return (await this.listArtifacts(workId)).filter((item) => item.envelope.createdBy === session.actorId);
    }
    async requestReview(session, target, reviewKind) {
        if (this._repository.store.unavailableReasons.length > 0) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
        }
        const held = await this._repository.readEnvelope(target.artifactId, target.revision);
        if (held === undefined || held.envelope.payloadHash !== target.payloadHash) {
            return { kind: 'failed', failure: 'notFound', reasons: ['No artifact revision with that id, revision and content exists.'] };
        }
        if ((0, artifactEnvelope_1.requiredReviewKinds)(held.envelope).indexOf(reviewKind) < 0) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['This review kind cannot accept this artifact.'] };
        }
        if (held.envelope.createdBy !== session.actorId || held.envelope.tenantScope !== session.tenantScope || !(0, authorization_1.decide)('draftCampaignBrief', session.resolution).allowed) {
            return { kind: 'failed', failure: 'notAuthorized', reasons: ['Only the person who saved a revision may send it for review.'] };
        }
        const state = await this._state(held.envelope);
        if (state !== 'draft' && state !== 'changesRequested' && state !== 'reviewRequested') {
            return { kind: 'failed', failure: 'staleVersion', reasons: [`The revision reads as ${state}; only a draft can be sent for review.`] };
        }
        const request = { requestId: this._newId('RVQ'), target, reviewKind, requestedBy: session.actorId, requestedAt: stamp(this._now()) };
        const written = await this._repository.writeRequest(request);
        if (!written.ok) {
            return { kind: 'failed', failure: 'uncertain', reasons: [written.reason ?? 'The request could not be confirmed.'] };
        }
        return { kind: 'recorded', request, state: await this._state(held.envelope) };
    }
    async recordReviewDecision(session, request) {
        if (this._repository.store.unavailableReasons.length > 0) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
        }
        const capability = (0, authorization_1.decide)('decideMarketingReview', session.resolution);
        if (!capability.allowed) {
            return { kind: 'failed', failure: 'notAuthorized', reasons: [capability.message] };
        }
        // The authority: bound to this actor, covering this review kind, not expired.
        if (session.authorityBindingRef === undefined) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['No reviewer authority is bound to this session; the real Marketing owner and copy/channel approver remain unbound.'] };
        }
        const binding = await this._repository.readAuthority(session.authorityBindingRef);
        if (binding === undefined || binding.actorId !== session.actorId || binding.revoked === true || (binding.tenantScope !== undefined && binding.tenantScope !== session.tenantScope)) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['The authority binding does not name the signed-in reviewer.'] };
        }
        if (binding.synthetic && this._repository.store.mode !== 'synthetic') {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['A synthetic binding cannot decide in a live store.'] };
        }
        const now = this._now();
        if (!Number.isFinite(Date.parse(binding.expiresAt)) || Date.parse(binding.expiresAt) <= now.getTime()) {
            return { kind: 'failed', failure: 'authorityExpired', reasons: ['The reviewer\'s authority has expired.'] };
        }
        if (binding.scope.indexOf(request.reviewKind) < 0) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: [`The reviewer's authority covers ${binding.scope.join(', ')}, not ${request.reviewKind}.`] };
        }
        // The target: exactly this revision and content, current, with a review requested.
        const held = await this._repository.readEnvelope(request.target.artifactId, request.target.revision);
        if (held === undefined) {
            return { kind: 'failed', failure: 'notFound', reasons: ['No artifact revision with that id and revision exists.'] };
        }
        if ((0, artifactEnvelope_1.requiredReviewKinds)(held.envelope).indexOf(request.reviewKind) < 0) {
            return { kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['This review kind cannot accept this artifact.'] };
        }
        if (held.envelope.payloadHash !== request.target.payloadHash || held.envelope.kind !== request.target.kind) {
            return { kind: 'failed', failure: 'staleVersion', reasons: ['The content hash differs from the stored revision; re-read before deciding.'] };
        }
        if (held.storeVersion !== request.expectedStoreVersion) {
            return { kind: 'failed', failure: 'staleVersion', reasons: ['The record changed since it was read (store version mismatch); re-read before deciding.'] };
        }
        const latest = await this._repository.latestRevision(request.target.artifactId);
        if (latest !== undefined && latest.revision !== request.target.revision) {
            return { kind: 'failed', failure: 'staleVersion', reasons: [`Revision ${request.target.revision} is superseded by revision ${latest.revision}; a late review cannot accept an older revision.`] };
        }
        if (held.envelope.tenantScope !== session.tenantScope)
            return { kind: 'failed', failure: 'notAuthorized', reasons: ['The artifact belongs to another tenant.'] };
        if (held.envelope.createdBy === session.actorId) {
            return { kind: 'failed', failure: 'selfReview', reasons: ['The person who saved a revision may not decide its review.'] };
        }
        const requests = await this._repository.requestsFor(request.target.artifactId);
        const requested = requests.filter((candidate) => candidate.target.revision === request.target.revision && candidate.reviewKind === request.reviewKind).length > 0;
        if (!requested) {
            return { kind: 'failed', failure: 'noRequest', reasons: ['No review of this kind was requested for this revision.'] };
        }
        const snapshotHash = await this._snapshot();
        if (snapshotHash === undefined) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: ['The current register snapshot could not be read; a decision must bind it.'] };
        }
        if (snapshotHash !== held.envelope.registerSnapshot.snapshotHash || !await this._repository.currentSources(held.envelope, now)) {
            return { kind: 'failed', failure: 'staleVersion', reasons: ['The current source approval, access, version or revocation state no longer permits this revision.'] };
        }
        // Idempotency: the same key with the same payload returns the earlier decision; a different payload is refused.
        const digest = await (0, actionEnvelope_1.payloadHash)({ target: request.target, reviewKind: request.reviewKind, outcome: request.outcome, comments: request.comments, actor: session.actorId });
        if (digest === undefined) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: ['No SHA-256 digest is available; the decision cannot be keyed.'] };
        }
        const intent = await this._repository.readIntent(request.idempotencyKey);
        if (intent !== undefined) {
            if (intent.intent.payloadDigest !== digest) {
                return { kind: 'failed', failure: 'keyReuse', reasons: ['This idempotency key was already used for a different decision; a new intent needs a new key.'] };
            }
            if (intent.intent.status === 'completed' && intent.intent.resultKey !== undefined) {
                const reviewId = intent.intent.resultKey.replace(/^decision:/, '');
                const earlier = await this._repository.readDecision(reviewId);
                const receipt = earlier === undefined ? undefined : await this._repository.readReceipt(earlier.decision.receiptId);
                if (earlier !== undefined && receipt !== undefined) {
                    return { kind: 'recorded', decision: earlier.decision, receipt, state: await this._state(held.envelope), replayed: true };
                }
            }
            // Pending or unreadable: reconcile rather than write a second decision.
            const reconciled = await this.reconcileAttempt(request.idempotencyKey);
            if (reconciled !== undefined) {
                return reconciled;
            }
            return { kind: 'failed', failure: 'uncertain', reasons: ['An earlier attempt with this key is pending and could not be reconciled; do not retry blind.'], intentKey: request.idempotencyKey };
        }
        const reviewId = this._newId('RVW');
        const receiptId = this._newId('RCPT');
        const decidedAt = stamp(now);
        const decision = {
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
        const check = (0, artifactEnvelope_1.parseReviewDecision)(decision);
        if (check.value === undefined) {
            return { kind: 'failed', failure: 'uncertain', reasons: check.errors };
        }
        const intentWrite = await this._repository.writeIntent({ key: request.idempotencyKey, operation: 'recordDecision', payloadDigest: digest, status: 'pending', resultKey: `decision:${reviewId}`, startedAt: decidedAt }, { ifAbsent: true });
        if (!intentWrite.ok) {
            return { kind: 'failed', failure: 'uncertain', reasons: [intentWrite.reason ?? 'The intent could not be recorded.'], intentKey: request.idempotencyKey };
        }
        const written = await this._repository.writeDecision(decision, { ifAbsent: true });
        if (!written.ok) {
            return { kind: 'failed', failure: 'uncertain', reasons: [written.reason ?? 'The decision could not be confirmed.'], intentKey: request.idempotencyKey };
        }
        return this._verify(decision, digest, held.envelope);
    }
    /** Reads a written decision back, marks it verified, writes its receipt and completes the intent. */
    async _verify(decision, digest, envelope) {
        const readback = await this._repository.readDecision(decision.reviewId);
        if (readback === undefined || (0, actionEnvelope_1.canonicalJson)({ ...readback.decision, readbackVerified: false }) !== (0, actionEnvelope_1.canonicalJson)({ ...decision, readbackVerified: false })) {
            return { kind: 'failed', failure: 'uncertain', reasons: ['The decision did not read back as written.'], intentKey: decision.idempotencyKey };
        }
        if (!await this._repository.currentAuthority(decision, envelope, this._now()) || !await this._repository.currentSources(envelope, this._now()) || ['superseded', 'revalidationRequired'].indexOf(await this._state(envelope)) >= 0) {
            return { kind: 'failed', failure: 'staleVersion', reasons: ['Authority, sources or parent revisions changed before verification.'], intentKey: decision.idempotencyKey };
        }
        const receipt = {
            receiptId: decision.receiptId,
            operation: 'recordDecision',
            targetRef: `decision:${decision.reviewId}`,
            payloadHash: digest,
            readbackHash: decision.contentHash,
            result: 'PASS',
            observedAt: stamp(this._now()),
            actorId: decision.actorId
        };
        const oldReceipt = await this._repository.readReceipt(receipt.receiptId);
        const receiptWrite = oldReceipt === undefined ? await this._repository.writeReceipt(receipt) : { ok: true };
        const savedReceipt = await this._repository.readReceipt(receipt.receiptId);
        if (!receiptWrite.ok || savedReceipt === undefined || (0, actionEnvelope_1.canonicalJson)({ ...savedReceipt, observedAt: receipt.observedAt }) !== (0, actionEnvelope_1.canonicalJson)(receipt)) {
            return { kind: 'failed', failure: 'uncertain', reasons: ['The receipt did not read back as written.'], intentKey: decision.idempotencyKey };
        }
        const intent = await this._repository.readIntent(decision.idempotencyKey);
        if (intent === undefined || intent.intent.payloadDigest !== digest) {
            return { kind: 'failed', failure: 'uncertain', reasons: ['The original intent is unavailable.'], intentKey: decision.idempotencyKey };
        }
        const completed = { ...intent.intent, status: 'completed' };
        const completion = await this._repository.writeIntent(completed, { expectedVersion: intent.storeVersion });
        const after = await this._repository.readIntent(decision.idempotencyKey);
        if (!completion.ok || after === undefined || (0, actionEnvelope_1.canonicalJson)(after.intent) !== (0, actionEnvelope_1.canonicalJson)(completed)) {
            return { kind: 'failed', failure: 'uncertain', reasons: ['The completion record did not read back.'], intentKey: decision.idempotencyKey };
        }
        const verified = { ...readback.decision, readbackVerified: true };
        const confirm = await this._repository.writeDecision(verified, { expectedVersion: readback.storeVersion });
        const final = await this._repository.readDecision(decision.reviewId);
        if (!confirm.ok || final === undefined || (0, actionEnvelope_1.canonicalJson)(final.decision) !== (0, actionEnvelope_1.canonicalJson)(verified)) {
            return { kind: 'failed', failure: 'uncertain', reasons: ['The verified decision did not read back.'], intentKey: decision.idempotencyKey };
        }
        return { kind: 'recorded', decision: verified, receipt, state: await this._state(envelope), replayed: false };
    }
    async getReview(reviewId) {
        return (await this._repository.readDecision(reviewId))?.decision;
    }
    async decisionsFor(artifactId) {
        return this._repository.decisionsFor(artifactId);
    }
    async requestsFor(artifactId) {
        return this._repository.requestsFor(artifactId);
    }
    /**
     * Reconciles an attempt whose outcome was lost: if the decision the intent named exists, it is verified and
     * returned; if it does not, the intent is still pending and the caller may retry with the same key. Nothing is
     * written twice.
     */
    async reconcileAttempt(intentKey) {
        const intent = await this._repository.readIntent(intentKey);
        if (intent === undefined || intent.intent.operation !== 'recordDecision' || intent.intent.resultKey === undefined) {
            return undefined;
        }
        const reviewId = intent.intent.resultKey.replace(/^decision:/, '');
        const held = await this._repository.readDecision(reviewId);
        if (held === undefined) {
            return undefined;
        }
        const envelope = await this._repository.readEnvelope(held.decision.target.artifactId, held.decision.target.revision);
        if (envelope === undefined) {
            return undefined;
        }
        return this._verify(held.decision, intent.intent.payloadDigest, envelope.envelope);
    }
    async _state(envelope) {
        const snapshot = await this._snapshot();
        return this._repository.stateOf(envelope, snapshot ?? '', this._now());
    }
}
exports.MarketingReviewService = MarketingReviewService;
