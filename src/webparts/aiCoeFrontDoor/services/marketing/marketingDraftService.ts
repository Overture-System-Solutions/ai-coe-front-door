/**
 * The three Marketing drafting operations: campaign brief, content plan, meeting follow-through.
 *
 * Each operation runs the same boundary in the same order. The caller's capability is decided first. The register
 * the run may read is qualified for the mode (synthetic or business) with its approval receipt, snapshot hash and
 * freshness. Every source the run will offer the provider is checked for this caller, purpose and audience, and its
 * excerpt is scanned for instruction shapes; a source that fails is a gap, never a citation. The provider (synthetic
 * here; the live one is unbound) returns an untrusted payload, which is parsed against the operation's strict schema;
 * a payload that names another work, another register, a source outside the permitted set or an identity field is
 * refused and nothing is saved. What passes is wrapped in an envelope with its hash, snapshot, sources, provenance
 * and gaps, written through the repository with readback, and returned with its derived state.
 *
 * Prerequisites are read back, not remembered. A content plan drafts only from the exact accepted brief revision the
 * review service reads back as accepted; a follow-through binds the current packet the same way. React state is
 * never a prerequisite.
 *
 * Nothing here sends, publishes, assigns, schedules or changes a campaign. The one write is a draft revision.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { payloadHash } from '../../content/actionEnvelope';
import type { ArtifactState, IMarketingArtifactEnvelopeV1, IMarketingReviewDecisionV1, ISourceUsed } from '../../content/marketing/artifactEnvelope';
import { parseAcceptedBriefRef, parseArtifactRef } from '../../content/marketing/artifactTypes';
import type { IIssue } from '../../content/marketing/schema';
import type { ArtifactKind, IAcceptedBriefRef, IArtifactRef } from '../../content/marketing/artifactTypes';
import { parseCampaignBrief } from '../../content/marketing/campaignBrief';
import type { ICampaignBriefV1, IClaim, IParseResult } from '../../content/marketing/campaignBrief';
import { parseContentPlan } from '../../content/marketing/contentPlan';
import type { IContentPlanV1 } from '../../content/marketing/contentPlan';
import { AVOIDED_WORDS, checkCopy, PROHIBITED_CLAIMS } from '../../content/marketing/copyPolicy';
import type { ICopyFinding } from '../../content/marketing/copyPolicy';
import { parseMeetingFollowThrough } from '../../content/marketing/meetingFollowThrough';
import type { IMeetingFollowThroughV1 } from '../../content/marketing/meetingFollowThrough';
import { manualRequestErrors } from '../../content/marketing/manualDraft';
import type { IManualMarketingDraftRequest } from '../../content/marketing/manualDraft';
import { looksLikeInstruction } from '../../content/marketing/schema';
import { checkSourceSet, qualifyRegister, registerSnapshotText } from '../../content/marketing/sourceGate';
import type { IRegisterQualification, ISourceSetOutcome } from '../../content/marketing/sourceGate';
import type { ISourceEntry, ISourceRef, ISourceRegister } from '../../content/marketing/sourceRegister';
import { decide } from '../authorization';
import type { Capability, IDecision } from '../authorization';
import type { IRoleResolution } from '../roleResolver';
import { ArtifactRepository, artifactRefOf } from './artifactRepository';
import type { IIntentRecord, IReceipt } from './artifactRepository';
import type { IWriteOutcome } from './artifactStore';
import type { DraftInputs, IMarketingProvider, IPermittedSourceExcerpt, IProviderRequest, IProviderResponse, ProviderAvailability } from './providers';
import type { IRegisterReadback, ISourceRegistry, RegisterReadResult } from './sourceRegistry';

/** The signed-in session as the host resolves it. The payload never supplies any of this. */
export interface IMarketingSession {
  actorId: string;
  tenantScope: string;
  resolution: IRoleResolution;
}

export interface IDraftBriefRequest {
  workId: string;
  objective: string;
  audienceContext: string[];
  /** The register entries the run may offer the provider; every citation must come from this set. */
  sourceIds: string[];
  /** Redrafting an existing artifact after changes were requested; absent for a new artifact. */
  artifactId?: string;
}

export interface IDraftPlanRequest {
  workId: string;
  briefArtifactId: string;
  sourceIds: string[];
  artifactId?: string;
}

export interface IMeetingNote {
  sourceId: string;
  versionOrETag: string;
  locator: string;
  text: string;
}

export interface IDraftFollowThroughRequest {
  workId: string;
  briefArtifactId: string;
  /** The permitted notes for this run; the service checks each as a source and scans it for instruction shapes. */
  notes: IMeetingNote[];
  sourceIds: string[];
  artifactId?: string;
}

export type DraftFailureKind =
  | 'notAuthorized'
  | 'invalidManualInput'
  | 'staleVersion'
  | 'registerUnavailable'
  | 'registerNotQualified'
  | 'prerequisiteNotAccepted'
  | 'providerUnavailable'
  | 'invalidProviderOutput'
  | 'sourceOutsidePermittedSet'
  | 'storeUnavailable'
  | 'uncertain';

export interface IDraftSaved {
  kind: 'saved';
  envelope: IMarketingArtifactEnvelopeV1;
  state: ArtifactState;
  storeVersion: string;
  /** The copy-policy findings recorded as review needs; a clean list is not proof of anything. */
  copyFindings: string[];
  /** Sources the run offered the provider that were refused, with why. */
  sourceGaps: string[];
  limitation: string;
}

export interface IDraftFailed {
  kind: 'failed';
  failure: DraftFailureKind;
  reasons: string[];
  /** For a provider outage: a manual draft-only skeleton the person may complete; provenance says `manual`. */
  manualFallback?: unknown;
  /** For an uncertain write: the intent key to reconcile instead of retrying. */
  intentKey?: string;
}

export type DraftResult = IDraftSaved | IDraftFailed;

export interface IDraftServiceOptions {
  repository: ArtifactRepository;
  registry: ISourceRegistry;
  provider: IMarketingProvider;
  now?: () => Date;
  /** Stable ids for tests; the default mints from the clock and a counter. */
  newId?: (prefix: string) => string;
  workflowVersion?: string;
  policyVersion?: string;
  /** Server-selected audience; synthetic defaults cannot authorize a business audience. */
  audience?: string;
  /** Recheck current server membership immediately before a manual durable write/recovery. */
  beforeManualCommit?: (envelope: IMarketingArtifactEnvelopeV1) => Promise<void>;
}

export const DRAFT_LIMITATION: string =
  'This draft was validated for shape, provenance and copy policy. A citation proves the source exists at the cited version; it does not prove the source supports the claim. A person reviews it before anything is accepted.';

const WORKFLOW_VERSION: string = 'marketing-first-activation-v1';
const POLICY_VERSION: string = 'copy-policy-local-baseline-v1';

let counter: number = 0;

function defaultNewId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(counter).padStart(4, '0')}`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function claimsOf(kind: ArtifactKind, payload: ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1): IClaim[] {
  switch (kind) {
    case 'campaignBrief':
      return (payload as ICampaignBriefV1).message;
    case 'contentPlan': {
      const plan: IContentPlanV1 = payload as IContentPlanV1;
      const claims: IClaim[] = [];
      for (const variant of plan.copyVariants) {
        claims.push(variant.headline);
        for (const claim of variant.body) {
          claims.push(claim);
        }
      }
      return claims;
    }
    case 'meetingFollowThrough': {
      const follow: IMeetingFollowThroughV1 = payload as IMeetingFollowThroughV1;
      const claims: IClaim[] = [];
      for (const draft of follow.communicationsDrafts) {
        claims.push(draft.subject);
        for (const claim of draft.body) {
          claims.push(claim);
        }
      }
      for (const decision of follow.decisions) {
        claims.push(decision.statement);
      }
      return claims;
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown artifact kind ${String(exhaustive)}`);
    }
  }
}

/** Every source reference a payload carries, so the boundary can check them all against the permitted set. */
function citationsOf(kind: ArtifactKind, payload: ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1): ISourceRef[] {
  const found: ISourceRef[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    const record: { [key: string]: unknown } = value as { [key: string]: unknown };
    if (typeof record.sourceId === 'string' && typeof record.versionOrETag === 'string' && Object.keys(record).length === 2) {
      found.push({ sourceId: record.sourceId, versionOrETag: record.versionOrETag });
      return;
    }
    for (const key of Object.keys(record)) {
      walk(record[key]);
    }
  };
  walk(payload);
  return found;
}

export class MarketingDraftService {
  private readonly _repository: ArtifactRepository;
  private readonly _registry: ISourceRegistry;
  private readonly _provider: IMarketingProvider;
  private readonly _now: () => Date;
  private readonly _newId: (prefix: string) => string;
  private readonly _workflowVersion: string;
  private readonly _policyVersion: string;
  private readonly _audience: string;
  private readonly _beforeManualCommit?: (envelope: IMarketingArtifactEnvelopeV1) => Promise<void>;

  public constructor(options: IDraftServiceOptions) {
    this._repository = options.repository;
    this._registry = options.registry;
    this._provider = options.provider;
    this._now = options.now ?? ((): Date => new Date());
    this._newId = options.newId ?? defaultNewId;
    this._workflowVersion = options.workflowVersion ?? WORKFLOW_VERSION;
    this._policyVersion = options.policyVersion ?? POLICY_VERSION;
    this._audience = options.audience ?? (options.registry.mode === 'synthetic' ? 'Local testing only' : '');
    this._beforeManualCommit = options.beforeManualCommit;
  }

  public get mode(): 'synthetic' | 'business' {
    return this._registry.mode;
  }

  public get provider(): IMarketingProvider {
    return this._provider;
  }

  public async saveManualDraft(session: IMarketingSession, request: IManualMarketingDraftRequest): Promise<DraftResult> {
    const errors = manualRequestErrors(request);
    if (errors.length) return { kind: 'failed', failure: 'invalidManualInput', reasons: errors };
    const capability = request.kind === 'campaignBrief' ? 'draftCampaignBrief' : request.kind === 'contentPlan' ? 'draftContentPlan' : 'draftMeetingFollowThrough';
    return this._run(session, capability, request.kind, request.workId, request.sourceIds, request.artifactId,
      (readback, hash) => this._manualInputs(session, request, hash), request);
  }

  public async draftCampaignBrief(session: IMarketingSession, request: IDraftBriefRequest): Promise<DraftResult> {
    return this._run(session, 'draftCampaignBrief', 'campaignBrief', request.workId, request.sourceIds, request.artifactId, async (): Promise<DraftInputs | IDraftFailed> => ({
      kind: 'campaignBrief',
      objective: request.objective,
      audienceContext: request.audienceContext
    }));
  }

  public async draftContentPlan(session: IMarketingSession, request: IDraftPlanRequest): Promise<DraftResult> {
    return this._run(session, 'draftContentPlan', 'contentPlan', request.workId, request.sourceIds, request.artifactId, async (readback: IRegisterReadback, snapshotHash: string): Promise<DraftInputs | IDraftFailed> => {
      const accepted: IAcceptedBriefRef | IDraftFailed = await this._acceptedBrief(request.workId, request.briefArtifactId, snapshotHash);
      if ('kind' in accepted && accepted.kind === 'failed') {
        return accepted;
      }
      const ref: IAcceptedBriefRef = accepted as IAcceptedBriefRef;
      const held: { envelope: IMarketingArtifactEnvelopeV1 } | undefined = await this._repository.readEnvelope(ref.artifactId, ref.revision);
      const parsed: IParseResult<ICampaignBriefV1> = parseCampaignBrief(held?.envelope.payload);
      if (parsed.value === undefined) {
        return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The accepted brief no longer parses as CampaignBrief.v1; it is quarantined and cannot be elaborated.'] };
      }
      return { kind: 'contentPlan', acceptedBrief: ref, acceptedBriefPayload: parsed.value };
    });
  }

  public async draftMeetingFollowThrough(session: IMarketingSession, request: IDraftFollowThroughRequest): Promise<DraftResult> {
    return this._run(session, 'draftMeetingFollowThrough', 'meetingFollowThrough', request.workId, request.sourceIds, request.artifactId, async (readback: IRegisterReadback): Promise<DraftInputs | IDraftFailed> => {
      const brief: IMarketingArtifactEnvelopeV1 | undefined = await this._repository.latestRevision(request.briefArtifactId);
      if (brief === undefined || brief.workId !== request.workId || brief.kind !== 'campaignBrief') {
        return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No campaign brief of this work was found to bind the packet to.'] };
      }
      const briefPayload: IParseResult<ICampaignBriefV1> = parseCampaignBrief(brief.payload);
      if (briefPayload.value === undefined) {
        return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The current brief no longer parses as CampaignBrief.v1; it is quarantined.'] };
      }
      const plans: IMarketingArtifactEnvelopeV1[] = await this._repository.artifactsOf(request.workId, 'contentPlan');
      const plan: IMarketingArtifactEnvelopeV1 | undefined = plans[plans.length - 1];
      // The notes are sources: each must be in the register at its version and free of instruction shapes.
      const notes: IPermittedSourceExcerpt[] = [];
      const gaps: string[] = [];
      for (const note of request.notes) {
        const entry: ISourceEntry | undefined = readback.register.entries.filter((candidate: ISourceEntry): boolean => candidate.id === note.sourceId)[0];
        if (entry === undefined || entry.versionOrETag !== note.versionOrETag) {
          gaps.push(`${note.sourceId} is not a permitted meeting source at the version given.`);
          continue;
        }
        if (readback.revoked.indexOf(note.sourceId) >= 0) {
          gaps.push(`${note.sourceId} was revoked; its notes were not read.`);
          continue;
        }
        const retained = await this._registry.readExcerpt({ sourceId: note.sourceId, versionOrETag: note.versionOrETag }, entry);
        if (retained === undefined || looksLikeInstruction(retained.excerpt)) {
          gaps.push(`${note.sourceId} carries instruction-like text and was excluded; notes are evidence, not instructions.`);
          continue;
        }
        notes.push(retained);
      }
      if (notes.length === 0) {
        return { kind: 'failed', failure: 'sourceOutsidePermittedSet', reasons: gaps.length > 0 ? gaps : ['No permitted meeting notes were supplied.'] };
      }
      this._pendingGaps = gaps;
      return {
        kind: 'meetingFollowThrough',
        brief: artifactRefOf(brief),
        briefPayload: briefPayload.value,
        contentPlan: plan === undefined ? null : artifactRefOf(plan),
        notes
      };
    });
  }

  private async _manualInputs(session: IMarketingSession, request: IManualMarketingDraftRequest, snapshotHash: string): Promise<DraftInputs | IDraftFailed> {
    const fail = (): IDraftFailed => ({ kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['Manual content must bind the exact current accepted brief and current source-valid packet.'] });
    if (request.kind === 'campaignBrief') return { kind: 'campaignBrief', objective: '', audienceContext: [] };
    const raw = request.payload as { [key: string]: unknown }, issues: IIssue[] = [];
    const packet = raw.campaignPacket as { brief?: unknown; contentPlan?: unknown } | undefined;
    const parent = request.kind === 'contentPlan' ? parseAcceptedBriefRef(raw.acceptedBrief, 'acceptedBrief', issues)
      : parseArtifactRef(packet?.brief, 'campaignPacket.brief', issues, 'campaignBrief');
    if (!parent || issues.length) return fail();
    const accepted = await this._acceptedBrief(request.workId, parent.artifactId, snapshotHash);
    if ('failure' in accepted || parent.revision !== accepted.revision || parent.payloadHash !== accepted.payloadHash) return fail();
    if (request.kind === 'contentPlan' && (parent as IAcceptedBriefRef).acceptanceReceiptId !== accepted.acceptanceReceiptId) return fail();
    const held = await this._repository.readEnvelope(parent.artifactId, parent.revision), brief = parseCampaignBrief(held?.envelope.payload).value;
    if (!brief || held?.envelope.tenantScope !== session.tenantScope) return fail();
    if (request.kind === 'contentPlan') return { kind: 'contentPlan', acceptedBrief: accepted, acceptedBriefPayload: brief };
    let plan: IArtifactRef | null = null;
    if (packet?.contentPlan !== null) {
      plan = parseArtifactRef(packet?.contentPlan, 'campaignPacket.contentPlan', issues, 'contentPlan') ?? null;
      if (!plan || issues.length) return fail();
      const latest = await this._repository.latestRevision(plan.artifactId);
      if (!latest || latest.workId !== request.workId || latest.tenantScope !== session.tenantScope || latest.kind !== plan.kind || latest.revision !== plan.revision || latest.payloadHash !== plan.payloadHash
        || ['superseded', 'revalidationRequired'].includes(await this._repository.stateOf(latest, snapshotHash, this._now()))) return fail();
    }
    // Meeting citations are checked by the same permitted-source pipeline, not caller-supplied note text.
    return { kind: 'meetingFollowThrough', brief: artifactRefOf(held.envelope), briefPayload: brief, contentPlan: plan, notes: [] };
  }

  /** Gaps an input step recorded for the envelope of the run in progress; cleared on every run. */
  private _pendingGaps: string[] = [];

  private async _run(
    session: IMarketingSession,
    capability: Capability,
    kind: ArtifactKind,
    workId: string,
    sourceIds: string[],
    existingArtifactId: string | undefined,
    inputs: (readback: IRegisterReadback, snapshotHash: string) => Promise<DraftInputs | IDraftFailed>,
    manual?: IManualMarketingDraftRequest
  ): Promise<DraftResult> {
    this._pendingGaps = [];
    const decision: IDecision = decide(capability, session.resolution);
    if (!decision.allowed) {
      return { kind: 'failed', failure: 'notAuthorized', reasons: [decision.message] };
    }
    if (this._repository.store.unavailableReasons.length > 0) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
    }
    const read: RegisterReadResult = await this._registry.readRegister();
    if (!read.available) {
      return { kind: 'failed', failure: 'registerUnavailable', reasons: read.reasons };
    }
    const readback: IRegisterReadback = read.readback;
    const now: Date = this._now();
    const qualification: IRegisterQualification = await qualifyRegister(readback.register, { mode: this._registry.mode, now, evidence: readback.evidence });
    if (!qualification.usable || qualification.snapshotHash === undefined) {
      return { kind: 'failed', failure: 'registerNotQualified', reasons: qualification.reasons };
    }
    const snapshotHash: string = qualification.snapshotHash;
    const purpose: 'campaignBrief' | 'contentPlan' | 'meetingFollowThrough' = kind;
    const requested: ISourceRef[] = sourceIds.map((id: string): ISourceRef => {
      const entry: ISourceEntry | undefined = readback.register.entries.filter((candidate: ISourceEntry): boolean => candidate.id === id)[0];
      return { sourceId: id, versionOrETag: entry === undefined ? '' : entry.versionOrETag };
    });
    if (this._audience === '') return { kind: 'failed', failure: 'notAuthorized', reasons: ['No server-selected business audience is bound.'] };
    const access: ISourceSetOutcome = checkSourceSet(readback.register, requested, { callerId: session.actorId, purpose, audience: this._audience, now, revoked: readback.revoked });
    const permitted: IPermittedSourceExcerpt[] = [];
    const sourceGaps: string[] = access.gaps.slice();
    for (const reference of access.usable) {
      const entry: ISourceEntry = readback.register.entries.filter((candidate: ISourceEntry): boolean => candidate.id === reference.sourceId)[0];
      const excerpt: IPermittedSourceExcerpt | undefined = await this._registry.readExcerpt(reference, entry);
      if (excerpt === undefined) {
        sourceGaps.push(`${reference.sourceId} could not be read at the cited version.`);
        continue;
      }
      if (looksLikeInstruction(excerpt.excerpt)) {
        sourceGaps.push(`${reference.sourceId} carries instruction-like text and was excluded; a source is evidence, not an instruction.`);
        continue;
      }
      permitted.push(excerpt);
    }
    const availability: ProviderAvailability = manual ? { available: true } : this._provider.availability();
    if ((manual || this.mode === 'business') && sourceGaps.length) return { kind: 'failed', failure: 'sourceOutsidePermittedSet', reasons: sourceGaps };
    const artifactId: string = existingArtifactId ?? this._newId(kind === 'campaignBrief' ? 'BRIEF' : kind === 'contentPlan' ? 'PLAN' : 'FOLLOWUP');
    const previous: IMarketingArtifactEnvelopeV1 | undefined = existingArtifactId === undefined ? undefined : await this._repository.latestRevision(existingArtifactId);
    if (existingArtifactId !== undefined && (previous === undefined || previous.workId !== workId || previous.kind !== kind || previous.tenantScope !== session.tenantScope || previous.createdBy !== session.actorId)) {
      return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The artifact to redraft is not one of this work and kind.'] };
    }
    if (manual && previous) {
      const held = await this._repository.readEnvelope(previous.artifactId, previous.revision);
      if (held?.storeVersion !== manual.expectedStoreVersion) return { kind: 'failed', failure: 'staleVersion', reasons: ['The artifact changed. Reload its current revision before editing.'] };
    }
    const built: DraftInputs | IDraftFailed = await inputs(readback, snapshotHash);
    if ('failure' in built) {
      return built;
    }
    sourceGaps.push(...this._pendingGaps);
    const createdAt: string = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (!availability.available) {
      return {
        kind: 'failed',
        failure: 'providerUnavailable',
        reasons: availability.reasons,
        manualFallback: manualSkeleton(kind, artifactId, workId, readback.register, createdAt)
      };
    }
    const providerRequest: IProviderRequest = {
      requestId: this._newId('REQ'),
      operation: kind,
      workId,
      registerId: readback.register.registerId,
      registerVersion: readback.register.version,
      permittedSources: permitted,
      inputs: built,
      policy: { avoidedWords: AVOIDED_WORDS, prohibitedClaims: PROHIBITED_CLAIMS },
      artifactId,
      createdAt
    };
    let response: IProviderResponse;
    try {
      response = manual ? { model: 'none', responseId: this._newId('MANUAL'), payload: { ...(manual.payload as { [key: string]: unknown }), schemaVersion: '1.0', workId, registerId: readback.register.registerId, registerVersion: readback.register.version, createdAt, [kind === 'campaignBrief' ? 'briefId' : kind === 'contentPlan' ? 'planId' : 'followThroughId']: artifactId } } : await this._provider.draft(providerRequest);
    } catch (error) {
      return { kind: 'failed', failure: 'providerUnavailable', reasons: [`The provider failed: ${describe(error)}`], manualFallback: manualSkeleton(kind, artifactId, workId, readback.register, createdAt) };
    }
    // The boundary: parse strictly, then check the facts the provider may not choose.
    const parsed: IParseResult<ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1> = parseByKind(kind, response.payload);
    if (parsed.value === undefined) {
      return { kind: 'failed', failure: 'invalidProviderOutput', reasons: parsed.errors };
    }
    const payload: ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1 = parsed.value;
    const identityErrors: string[] = [];
    if (payload.workId !== workId) {
      identityErrors.push('The provider named another Work ID.');
    }
    if (payload.registerId !== readback.register.registerId || payload.registerVersion !== readback.register.version) {
      identityErrors.push('The provider named another register or version.');
    }
    const ownId: string = kind === 'campaignBrief' ? (payload as ICampaignBriefV1).briefId : kind === 'contentPlan' ? (payload as IContentPlanV1).planId : (payload as IMeetingFollowThroughV1).followThroughId;
    if (ownId !== artifactId) {
      identityErrors.push('The provider chose its own artifact id.');
    }
    if (payload.createdAt !== createdAt) {
      identityErrors.push('The provider wrote its own timestamp.');
    }
    if (identityErrors.length > 0) {
      return { kind: 'failed', failure: 'invalidProviderOutput', reasons: identityErrors };
    }
    const permittedKeys: string[] = permitted.map((source: IPermittedSourceExcerpt): string => `${source.sourceId}@${source.versionOrETag}`);
    if (built.kind === 'meetingFollowThrough') {
      for (const note of built.notes) {
        permittedKeys.push(`${note.sourceId}@${note.versionOrETag}`);
      }
    }
    const outside: string[] = citationsOf(kind, payload)
      .map((reference: ISourceRef): string => `${reference.sourceId}@${reference.versionOrETag}`)
      .filter((key: string): boolean => permittedKeys.indexOf(key) < 0);
    if (outside.length > 0) {
      return { kind: 'failed', failure: 'sourceOutsidePermittedSet', reasons: outside.map((key: string): string => `The output cites ${key}, which is outside the permitted set of this run; a draft cannot approve a source.`) };
    }
    // The copy policy over every claim; findings are recorded, never a reason to call the copy true.
    const copyFindings: string[] = [];
    for (const claim of claimsOf(kind, payload)) {
      const findings: ICopyFinding[] = checkCopy(claim.text, { cited: claim.sources.length > 0 }).findings;
      for (const finding of findings) {
        copyFindings.push(`“${finding.found}”: ${finding.note}`);
      }
    }
    const hash: string | undefined = await payloadHash(payload);
    if (hash === undefined) {
      return { kind: 'failed', failure: 'storeUnavailable', reasons: ['The platform offers no SHA-256 digest, so the revision cannot be hashed; nothing was saved.'] };
    }
    const revision: number = previous === undefined ? 1 : previous.revision + 1;
    const parents: IArtifactRef[] = [];
    if (built.kind === 'contentPlan') {
      parents.push({ kind: 'campaignBrief', artifactId: built.acceptedBrief.artifactId, revision: built.acceptedBrief.revision, payloadHash: built.acceptedBrief.payloadHash });
    }
    if (built.kind === 'meetingFollowThrough') {
      parents.push(built.brief);
      if (built.contentPlan !== null) {
        parents.push(built.contentPlan);
      }
    }
    const sourcesUsed: ISourceUsed[] = permitted
      .filter((source: IPermittedSourceExcerpt): boolean => citationsOf(kind, payload).filter((reference: ISourceRef): boolean => reference.sourceId === source.sourceId).length > 0)
      .map((source: IPermittedSourceExcerpt): ISourceUsed => ({ sourceId: source.sourceId, versionOrETag: source.versionOrETag, locator: source.locator }));
    if (built.kind === 'meetingFollowThrough') {
      for (const note of built.notes) {
        sourcesUsed.push({ sourceId: note.sourceId, versionOrETag: note.versionOrETag, locator: note.locator });
      }
    }
    const envelope: IMarketingArtifactEnvelopeV1 = {
      envelopeVersion: '1.0',
      tenantScope: session.tenantScope,
      workId,
      artifactId,
      kind,
      schemaVersion: '1.0',
      revision,
      supersedes: previous === undefined ? null : artifactRefOf(previous),
      parents,
      payload,
      payloadHash: hash,
      registerSnapshot: { registerId: readback.register.registerId, version: readback.register.version, snapshotHash, snapshotRef: readback.snapshotRef },
      sourcesUsed,
      workflowVersion: this._workflowVersion,
      policyVersion: this._policyVersion,
      providerProvenance: {
        mode: manual ? 'manual' : this._provider.mode,
        provider: manual ? 'human' : this._provider.name,
        model: response.model,
        requestId: providerRequest.requestId,
        responseId: response.responseId,
        qualificationReceiptRef: !manual && this._provider.mode === 'qualified' ? response.qualificationReceiptRef ?? null : null
      },
      evidenceGaps: payload.evidenceGaps.concat(sourceGaps),
      knowledge: knowledgeOf(kind, payload),
      createdBy: session.actorId,
      createdAt,
      testRecord: this._repository.store.mode === 'synthetic',
      receiptRefs: []
    };
    const receiptId: string = this._newId('RCPT');
    envelope.receiptRefs = [receiptId];
    const intentKey: string = `saveRevision:${artifactId}:${revision}:${hash.slice(0, 16)}`;
    const receipt: IReceipt = { receiptId, operation: 'saveRevision', targetRef: `envelope:${artifactId}:${revision}`, payloadHash: hash, readbackHash: hash, result: 'PASS', observedAt: createdAt, actorId: session.actorId };
    const intent: IIntentRecord = { key: intentKey, operation: 'saveRevision', payloadDigest: hash, status: 'pending', startedAt: createdAt, resultKey: receipt.targetRef, draftRecovery: { envelope, receipt, snapshotText: registerSnapshotText(readback.register), copyFindings, sourceGaps, ...(manual?.expectedStoreVersion ? { expectedStoreVersion: manual.expectedStoreVersion } : {}) } };
    const written = await this._repository.writeIntent(intent, { ifAbsent: true });
    if (!written.ok) return { kind: 'failed', failure: 'uncertain', reasons: ['The original draft intent could not be confirmed.'], intentKey };
    return this.reconcileAttempt(session, intentKey);
  }

  /** Recover from retained server/synthetic intent, never regenerate an uncertain draft. */
  public async reconcileAttempt(session: IMarketingSession, intentKey: string): Promise<DraftResult> {
    const fail = (): IDraftFailed => ({ kind: 'failed', failure: 'uncertain', reasons: ['The draft, snapshot, receipt or completion has not read back exactly. Retain this recovery reference.'], intentKey });
    const held = await this._repository.readIntent(intentKey);
    const recovery = held?.intent.draftRecovery;
    if (held === undefined || recovery === undefined) return fail();
    const { envelope, receipt, snapshotText, copyFindings, sourceGaps } = recovery;
    if (envelope.tenantScope !== session.tenantScope || envelope.createdBy !== session.actorId || !decide('draftCampaignBrief', session.resolution).allowed) return { kind: 'failed', failure: 'notAuthorized', reasons: ['This draft belongs to another scope.'] };
    if (await payloadHash(envelope.payload) !== held.intent.payloadDigest || envelope.payloadHash !== held.intent.payloadDigest) return fail();
    if (envelope.providerProvenance.mode === 'manual') {
      await this._beforeManualCommit?.(envelope);
      const latest = await this._repository.latestRevision(envelope.artifactId);
      if (latest && !(latest.revision === envelope.revision && latest.payloadHash === envelope.payloadHash)
        && (!envelope.supersedes || latest.revision !== envelope.supersedes.revision || latest.payloadHash !== envelope.supersedes.payloadHash)) return fail();
      if (envelope.supersedes) {
        const prior = await this._repository.readEnvelope(envelope.artifactId, envelope.supersedes.revision);
        if (prior?.storeVersion !== recovery.expectedStoreVersion) return fail();
      }
      if (!await this._repository.currentSources(envelope, this._now())
        || ['superseded', 'revalidationRequired'].includes(await this._repository.stateOf(envelope, envelope.registerSnapshot.snapshotHash, this._now()))) return fail();
    }
    const snapshotKey = `snapshot:${envelope.registerSnapshot.registerId}:${envelope.registerSnapshot.version}`;
    if (await this._repository.store.read(snapshotKey) === undefined && !(await this._repository.writeSnapshot(envelope.registerSnapshot.registerId, envelope.registerSnapshot.version, snapshotText)).ok) return fail();
    if ((await this._repository.store.read(snapshotKey))?.value !== snapshotText) return fail();
    if (await this._repository.readEnvelope(envelope.artifactId, envelope.revision) === undefined && !(await this._repository.writeEnvelope(envelope)).ok) return fail();
    const after = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
    if (after === undefined || await payloadHash(after.envelope) !== await payloadHash(envelope)) return fail();
    if (await this._repository.readReceipt(receipt.receiptId) === undefined && !(await this._repository.writeReceipt(receipt)).ok) return fail();
    if (await payloadHash(await this._repository.readReceipt(receipt.receiptId)) !== await payloadHash(receipt)) return fail();
    const completed: IIntentRecord = { ...held.intent, status: 'completed' };
    if (!(await this._repository.writeIntent(completed, { expectedVersion: held.storeVersion })).ok) return fail();
    if (await payloadHash((await this._repository.readIntent(intentKey))?.intent) !== await payloadHash(completed)) return fail();
    return this._saved(envelope, after.storeVersion, envelope.registerSnapshot.snapshotHash, copyFindings, sourceGaps);
  }

  private async _saved(envelope: IMarketingArtifactEnvelopeV1, storeVersion: string, snapshotHash: string, copyFindings: string[], sourceGaps: string[]): Promise<IDraftSaved> {
    const state: ArtifactState = await this._repository.stateOf(envelope, snapshotHash, this._now());
    return { kind: 'saved', envelope, state, storeVersion, copyFindings, sourceGaps, limitation: DRAFT_LIMITATION };
  }

  /** The exact accepted revision of a brief, read back with its acceptance receipt; anything else is refused. */
  private async _acceptedBrief(workId: string, artifactId: string, snapshotHash: string): Promise<IAcceptedBriefRef | IDraftFailed> {
    const latest: IMarketingArtifactEnvelopeV1 | undefined = await this._repository.latestRevision(artifactId);
    if (latest === undefined || latest.workId !== workId || latest.kind !== 'campaignBrief') {
      return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No campaign brief of this work with that id was found.'] };
    }
    const state: ArtifactState = await this._repository.stateOf(latest, snapshotHash, this._now());
    if (state !== 'accepted') {
      return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: [`The brief's current revision ${latest.revision} reads as ${state}, not accepted; a content plan starts only from an accepted brief.`] };
    }
    const decisions: IMarketingReviewDecisionV1[] = await this._repository.decisionsFor(artifactId);
    const acceptance: IMarketingReviewDecisionV1 | undefined = decisions
      .filter(
        (decision: IMarketingReviewDecisionV1): boolean =>
          decision.target.revision === latest.revision && decision.contentHash === latest.payloadHash && decision.outcome === 'accept' && decision.readbackVerified
      )
      .sort((left: IMarketingReviewDecisionV1, right: IMarketingReviewDecisionV1): number => (left.decidedAt < right.decidedAt ? 1 : -1))[0];
    if (acceptance === undefined) {
      return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No read-back acceptance decision was found for the current brief revision.'] };
    }
    const receipt: IReceipt | undefined = await this._repository.readReceipt(acceptance.receiptId);
    if (receipt === undefined || receipt.result !== 'PASS') {
      return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The acceptance receipt could not be read back.'] };
    }
    return { kind: 'campaignBrief', artifactId: latest.artifactId, revision: latest.revision, payloadHash: latest.payloadHash, acceptanceReceiptId: acceptance.receiptId };
  }
}

function parseByKind(kind: ArtifactKind, payload: unknown): IParseResult<ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1> {
  switch (kind) {
    case 'campaignBrief':
      return parseCampaignBrief(payload);
    case 'contentPlan':
      return parseContentPlan(payload);
    case 'meetingFollowThrough':
      return parseMeetingFollowThrough(payload);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown artifact kind ${String(exhaustive)}`);
    }
  }
}

/** Known/assumed/unknown from the claims: cited claims are known-by-source, sentinel claims are unknown. Nothing is assumed silently. */
function knowledgeOf(kind: ArtifactKind, payload: ICampaignBriefV1 | IContentPlanV1 | IMeetingFollowThroughV1): { known: string[]; assumed: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const claim of claimsOf(kind, payload)) {
    if (claim.sources.length > 0) {
      known.push(claim.text);
    } else {
      unknown.push(`${claim.text} (${claim.unknown ?? 'UNKNOWN'})`);
    }
  }
  return { known, assumed: [], unknown };
}

/** A draft-only skeleton for a person to complete when no provider is available; every fact is marked unknown. */
function manualSkeleton(kind: ArtifactKind, artifactId: string, workId: string, register: ISourceRegister, createdAt: string): unknown {
  const base: { [key: string]: unknown } = { schemaVersion: '1.0', workId, registerId: register.registerId, registerVersion: register.version, createdAt, evidenceGaps: ['Drafted by hand without a provider; every claim needs a source or a sentinel.'], reviewNeeds: ['Strategy and voice: Marketing owner (role; identity unbound)'] };
  if (kind === 'campaignBrief') {
    return { ...base, briefId: artifactId, objective: '', audience: [], painPoints: [], message: [{ text: '', sources: [], unknown: 'UNKNOWN' }], channelPlan: [], contentCalendar: [] };
  }
  return { ...base, [kind === 'contentPlan' ? 'planId' : 'followThroughId']: artifactId, note: 'Complete the required groups by hand; the validator lists what is missing.' };
}
