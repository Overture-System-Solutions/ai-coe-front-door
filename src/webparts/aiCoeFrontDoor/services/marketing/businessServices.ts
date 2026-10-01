/** Public business facade. The backend owns storage, prompts, identity, policy and authority. */
import { manualRequestErrors } from '../../content/marketing/manualDraft';
import { parseCampaignBrief } from '../../content/marketing/campaignBrief';
import { parseContentPlan } from '../../content/marketing/contentPlan';
import { parseMeetingFollowThrough } from '../../content/marketing/meetingFollowThrough';
import { workId as validateWorkId } from '../../content/marketing/schema';
import type { IIssue } from '../../content/marketing/schema';
import { payloadHash } from '../../content/actionEnvelope';
import { ARTIFACT_STATES, parseEnvelope, parseReviewDecision } from '../../content/marketing/artifactEnvelope';
import type { ArtifactState, IMarketingReviewDecisionV1, IReviewRequestRecord } from '../../content/marketing/artifactEnvelope';
import type { IArtifactWithState, IAuthorityBinding } from './artifactRepository';
import type { DraftResult, IMarketingSession } from './marketingDraftService';
import type { RequestResult, ReviewResult } from './marketingReviewService';
import type { IMarketingServices } from './marketingServices';
import { DisabledLiveArtifactStore } from './artifactStore';
import { UnavailableLiveProvider } from './providers';
import type { IPermittedSourceExcerpt } from './providers';
import type { ISourceRegistry, RegisterReadResult } from './sourceRegistry';
import { isMarketingDraftOperation, IBusinessMarketingOptions, MarketingBoundaryError, object, SharePointMarketingTransport } from './businessTransport';
import type { MarketingOperation } from './businessTransport';

async function artifact(value: unknown, tenantScope: string): Promise<IArtifactWithState> {
  const raw = object(value), parsed = parseEnvelope(raw.envelope);
  if (parsed.value === undefined || parsed.value.tenantScope !== tenantScope || parsed.value.testRecord || parsed.value.providerProvenance.mode === 'synthetic' || await payloadHash(parsed.value.payload) !== parsed.value.payloadHash || ARTIFACT_STATES.indexOf(raw.state as never) < 0 || typeof raw.storeVersion !== 'string') throw new Error('Invalid business artifact.');
  const payload = (parsed.value.kind === 'campaignBrief' ? parseCampaignBrief : parsed.value.kind === 'contentPlan' ? parseContentPlan : parseMeetingFollowThrough)(parsed.value.payload);
  if (!payload.value || payload.value.workId !== parsed.value.workId) throw new Error('Invalid business artifact content.');
  return { envelope: parsed.value, state: raw.state as IArtifactWithState['state'], storeVersion: raw.storeVersion };
}
function decision(value: unknown): IMarketingReviewDecisionV1 {
  const parsed = parseReviewDecision(value);
  if (parsed.value === undefined) throw new Error('Invalid review decision.');
  return parsed.value;
}
function failed(value: unknown): boolean { const raw = object(value); return raw.kind === 'failed' && typeof raw.failure === 'string' && Array.isArray(raw.reasons) && raw.reasons.every(reason => typeof reason === 'string'); }
function requestRecord(value: unknown): IReviewRequestRecord {
  const raw = object(value), target = object(raw.target);
  if (typeof raw.requestId !== 'string' || typeof raw.requestedBy !== 'string' || !Number.isFinite(Date.parse(String(raw.requestedAt))) || typeof target.artifactId !== 'string' || !Number.isInteger(target.revision) || !/^[a-f0-9]{64}$/.test(String(target.payloadHash))) throw new Error('Invalid review request.');
  return value as IReviewRequestRecord;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('Invalid collection.'); return value; }
function manualProvenance(held: IArtifactWithState): void {
  const p = held.envelope.providerProvenance;
  if (p.mode !== 'manual' || p.provider !== 'human' || p.model !== 'none' || p.qualificationReceiptRef !== null) throw new Error('Invalid manual provenance.');
}
function certainFailure(value: unknown): boolean {
  return failed(value) && ['invalidManualInput', 'notAuthorized', 'registerUnavailable', 'registerNotQualified', 'prerequisiteNotAccepted', 'providerUnavailable', 'invalidProviderOutput', 'sourceOutsidePermittedSet', 'unauthorizedReviewer', 'authorityExpired', 'selfReview', 'notFound', 'staleVersion', 'noRequest', 'keyReuse'].includes(String(object(value).failure));
}

export function createBusinessMarketingServices(options: IBusinessMarketingOptions): IMarketingServices {
  const transport = new SharePointMarketingTransport(options);
  const provider = new UnavailableLiveProvider(); // Browser may not call a raw provider or submit authority.
  const invoke = (op: MarketingOperation, value: unknown): Promise<unknown> => transport.invoke(op, value);
  const inScope = (session: IMarketingSession): void => { if (session.actorId !== options.session.actorId || session.tenantScope !== options.session.tenantScope) throw new Error('Marketing session changed; recompose services.'); };
  const draftCall = async (session: IMarketingSession, op: MarketingOperation, payload: unknown): Promise<DraftResult> => {
    try {
      inScope(session);
      const value = await invoke(op, payload);
      if (failed(value)) {
        if (certainFailure(value)) await transport.acknowledge(value);
        else {
          await transport.releaseRecoveryEvaluation(value);
          return { ...value as Extract<DraftResult, { kind: 'failed' }>, intentKey: (await transport.pendingReference())?.id };
        }
        return value as DraftResult;
      }
      const raw = object(value), held = await artifact(raw, session.tenantScope);
      if (raw.kind !== 'saved' || held.envelope.createdBy !== session.actorId || !Array.isArray(raw.copyFindings) || !Array.isArray(raw.sourceGaps) || typeof raw.limitation !== 'string') throw new Error('Draft confirmation is invalid.');
      if (op === 'SaveManualMarketingDraftV1') {
        manualProvenance(held);
        const request = object(payload);
        if (held.envelope.workId !== request.workId || held.envelope.kind !== request.kind || (request.artifactId !== undefined && held.envelope.artifactId !== request.artifactId)) throw new Error('Manual result does not match the requested artifact.');
      }
      await transport.acknowledge(value);
      return { ...held, kind: 'saved', copyFindings: raw.copyFindings as string[], sourceGaps: raw.sourceGaps as string[], limitation: raw.limitation };
    } catch (error) { return { kind: 'failed', failure: 'uncertain', reasons: ['Server draft confirmation unavailable. No browser copy was saved.'], intentKey: error instanceof MarketingBoundaryError ? error.intentKey : undefined }; }
  };
  const reviewCall = async (op: MarketingOperation, payload: unknown): Promise<ReviewResult | RequestResult> => {
    try {
      const value = await invoke(op, payload);
      if (failed(value)) {
        if (certainFailure(value)) await transport.acknowledge(value);
        else {
          await transport.releaseRecoveryEvaluation(value);
          return { ...value as Extract<ReviewResult, { kind: 'failed' }>, intentKey: (await transport.pendingReference())?.id };
        }
        return value as ReviewResult;
      }
      const raw = object(value);
      if (raw.kind !== 'recorded' || ARTIFACT_STATES.indexOf(raw.state as never) < 0) throw new Error('Invalid review confirmation.');
      if (op === 'RequestReviewV1') {
        const request = requestRecord(raw.request);
        await transport.acknowledge(value);
        return { kind: 'recorded', state: raw.state as ArtifactState, request };
      }
      const d = decision(raw.decision), receipt = object(raw.receipt);
      if (!d.readbackVerified || receipt.receiptId !== d.receiptId || receipt.result !== 'PASS' || receipt.targetRef !== `decision:${d.reviewId}` || receipt.readbackHash !== d.contentHash || receipt.actorId !== d.actorId || typeof raw.replayed !== 'boolean') throw new Error('Review receipt mismatch.');
      await transport.acknowledge(value);
      return value as ReviewResult;
    } catch (error) { return { kind: 'failed', failure: 'uncertain', reasons: ['Server review confirmation unavailable. Retain its recovery reference.'], intentKey: error instanceof MarketingBoundaryError ? error.intentKey : undefined }; }
  };
  const registry: ISourceRegistry = {
    mode: 'business',
    readRegister: async (): Promise<RegisterReadResult> => {
      const value = await invoke('ReadSourceRegisterV1', {}), raw = object(value);
      if (raw.available === false && Array.isArray(raw.reasons)) return value as RegisterReadResult;
      const readback = object(raw.readback), register = object(readback.register);
      if (raw.available !== true || register.approval !== 'approved' || !Array.isArray(register.entries) || !Array.isArray(readback.revoked) || typeof readback.snapshotRef !== 'string') throw new Error('Invalid approved register projection.');
      return value as RegisterReadResult;
    },
    readExcerpt: async reference => {
      const value = await invoke('ReadSourceExcerptV1', { reference });
      if (value === null) return undefined;
      const raw = object(value);
      if (raw.sourceId !== reference.sourceId || raw.versionOrETag !== reference.versionOrETag || typeof raw.excerpt !== 'string' || typeof raw.locator !== 'string' || typeof raw.mayNotProve !== 'string') throw new Error('Source readback identity mismatch.');
      return value as IPermittedSourceExcerpt;
    }
  };
  return {
    mode: 'live', label: transport.label, liveReasons: transport.reasons,
    listWork: async () => {
      const values = array(await invoke('ListMarketingWorkV1', {})), issues: IIssue[] = [];
      values.forEach(value => validateWorkId(value, 'workId', issues));
      if (issues.length || values.length > 500 || new Set(values).size !== values.length) throw new Error('Invalid authorized work projection.');
      return values as string[];
    },
    saveManualDraft: async (session, request) => {
      const errors = manualRequestErrors(request);
      if (errors.length) return { kind: 'failed', failure: 'invalidManualInput', reasons: errors };
      return draftCall(session, 'SaveManualMarketingDraftV1', request);
    },
    recoverPending: async (repair: boolean = false) => {
      let intentKey: string | undefined;
      try {
        const pending = await transport.pendingReference();
        if (!pending) return { kind: 'none', message: 'No unresolved Marketing intent.' };
        intentKey = pending.id;
        const value = pending.recoveryId ? await transport.readResult(pending.recoveryId, 'RecoverMarketingIntentV1')
          : repair ? await transport.invoke('RecoverMarketingIntentV1', { intentKey: pending.id, kind: isMarketingDraftOperation(pending.operation) ? 'draft' : 'review' })
          : await transport.readResult(pending.id, pending.operation);
        const raw = object(value);
        if (failed(value)) {
          if (!certainFailure(value)) {
            await transport.releaseRecoveryEvaluation(value);
            return { kind: 'pending', message: 'The original outcome remains uncertain; reconcile it through the authorized operator without repeating the provider call.', intentKey };
          }
        } else if (isMarketingDraftOperation(pending.operation)) {
          const held = await artifact(raw, options.session.tenantScope);
          if (raw.kind !== 'saved' || held.envelope.createdBy !== options.session.actorId || !Array.isArray(raw.copyFindings) || !Array.isArray(raw.sourceGaps) || typeof raw.limitation !== 'string') throw new Error('Malformed draft recovery.');
          if (pending.operation === 'SaveManualMarketingDraftV1') manualProvenance(held);
        } else if (pending.operation === 'RequestReviewV1') {
          if (raw.kind !== 'recorded' || ARTIFACT_STATES.indexOf(raw.state as never) < 0 || requestRecord(raw.request).requestedBy !== options.session.actorId) throw new Error('Malformed review-request recovery.');
        } else {
          const d = decision(raw.decision), receipt = object(raw.receipt);
          if (raw.kind !== 'recorded' || ARTIFACT_STATES.indexOf(raw.state as never) < 0 || d.actorId !== options.session.actorId || !d.readbackVerified || receipt.receiptId !== d.receiptId || receipt.result !== 'PASS' || receipt.targetRef !== `decision:${d.reviewId}` || receipt.readbackHash !== d.contentHash || receipt.actorId !== d.actorId || typeof raw.replayed !== 'boolean') throw new Error('Malformed decision recovery.');
        }
        await transport.acknowledge(value);
        return { kind: 'recovered', message: 'The original Marketing result is confirmed. Reload the server records; no mutation was resubmitted.' };
      } catch { return { kind: 'pending', message: 'The original Marketing outcome could not be confirmed. Its opaque reference remains retained.', intentKey }; }
    },
    store: new DisabledLiveArtifactStore(), registry, provider,
    draft: {
      mode: 'business', provider,
      draftCampaignBrief: (session, request) => draftCall(session, 'DraftCampaignBriefV1', request),
      draftContentPlan: (session, request) => draftCall(session, 'DraftContentPlanV1', request),
      draftMeetingFollowThrough: (session, request) => draftCall(session, 'DraftMeetingFollowThroughV1', { ...request, notes: request.notes.map(note => ({ sourceId: note.sourceId, versionOrETag: note.versionOrETag, locator: note.locator })) }),
      reconcileAttempt: (session, intentKey) => draftCall(session, 'RecoverMarketingIntentV1', { intentKey, kind: 'draft' })
    },
    review: {
      mode: 'live',
      ensureSyntheticAuthorities: async () => undefined,
      assumeSyntheticReviewer: async () => ({ kind: 'failed', failure: 'unauthorizedReviewer', reasons: ['Reviewer impersonation is synthetic-only.'] }),
      authorities: async () => array(await invoke('ListAuthoritiesV1', {})).map(value => {
        const raw = object(value);
        if (raw.actorId !== options.session.actorId || raw.tenantScope !== options.session.tenantScope || raw.synthetic !== false || !Array.isArray(raw.scope) || typeof raw.bindingRef !== 'string' || !Number.isFinite(Date.parse(String(raw.expiresAt)))) throw new Error('Invalid authority projection.');
        return value as IAuthorityBinding;
      }),
      getArtifact: async (artifactId, revision) => { const value = await invoke('GetArtifactV1', { artifactId, revision }); return value === null ? undefined : artifact(value, options.session.tenantScope); },
      listArtifacts: async workId => Promise.all(array(await invoke('ListArtifactsV1', { workId })).map(value => artifact(value, options.session.tenantScope))),
      listOwnArtifacts: async (session, workId) => { inScope(session); return (await Promise.all(array(await invoke('ListArtifactsV1', { workId, own: true })).map(value => artifact(value, session.tenantScope)))).filter(item => item.envelope.createdBy === session.actorId); },
      requestReview: async (session, target, reviewKind) => { inScope(session); return reviewCall('RequestReviewV1', { target, reviewKind }) as Promise<RequestResult>; },
      recordReviewDecision: async (session, request) => { inScope(session); return reviewCall('RecordReviewDecisionV1', request) as Promise<ReviewResult>; },
      getReview: async reviewId => { const value = await invoke('GetReviewV1', { reviewId }); return value === null ? undefined : decision(value); },
      decisionsFor: async artifactId => array(await invoke('ListReviewDecisionsV1', { artifactId })).map(decision),
      requestsFor: async artifactId => array(await invoke('ListReviewRequestsV1', { artifactId })).map(requestRecord),
      reconcileAttempt: async intentKey => reviewCall('RecoverMarketingIntentV1', { intentKey, kind: 'review' }) as Promise<ReviewResult>
    }
  };
}
