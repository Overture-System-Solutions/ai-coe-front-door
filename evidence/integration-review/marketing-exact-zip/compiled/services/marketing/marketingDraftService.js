"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketingDraftService = exports.DRAFT_LIMITATION = void 0;
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
const actionEnvelope_1 = require("../../content/actionEnvelope");
const campaignBrief_1 = require("../../content/marketing/campaignBrief");
const contentPlan_1 = require("../../content/marketing/contentPlan");
const copyPolicy_1 = require("../../content/marketing/copyPolicy");
const meetingFollowThrough_1 = require("../../content/marketing/meetingFollowThrough");
const schema_1 = require("../../content/marketing/schema");
const sourceGate_1 = require("../../content/marketing/sourceGate");
const authorization_1 = require("../authorization");
const artifactRepository_1 = require("./artifactRepository");
exports.DRAFT_LIMITATION = 'This draft was validated for shape, provenance and copy policy. A citation proves the source exists at the cited version; it does not prove the source supports the claim. A person reviews it before anything is accepted.';
const WORKFLOW_VERSION = 'marketing-first-activation-v1';
const POLICY_VERSION = 'copy-policy-local-baseline-v1';
let counter = 0;
function defaultNewId(prefix) {
    counter += 1;
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${String(counter).padStart(4, '0')}`;
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
function claimsOf(kind, payload) {
    switch (kind) {
        case 'campaignBrief':
            return payload.message;
        case 'contentPlan': {
            const plan = payload;
            const claims = [];
            for (const variant of plan.copyVariants) {
                claims.push(variant.headline);
                for (const claim of variant.body) {
                    claims.push(claim);
                }
            }
            return claims;
        }
        case 'meetingFollowThrough': {
            const follow = payload;
            const claims = [];
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
            const exhaustive = kind;
            throw new Error(`Unknown artifact kind ${String(exhaustive)}`);
        }
    }
}
/** Every source reference a payload carries, so the boundary can check them all against the permitted set. */
function citationsOf(kind, payload) {
    const found = [];
    const walk = (value) => {
        if (Array.isArray(value)) {
            for (const item of value) {
                walk(item);
            }
            return;
        }
        if (value === null || typeof value !== 'object') {
            return;
        }
        const record = value;
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
class MarketingDraftService {
    _repository;
    _registry;
    _provider;
    _now;
    _newId;
    _workflowVersion;
    _policyVersion;
    _audience;
    constructor(options) {
        this._repository = options.repository;
        this._registry = options.registry;
        this._provider = options.provider;
        this._now = options.now ?? (() => new Date());
        this._newId = options.newId ?? defaultNewId;
        this._workflowVersion = options.workflowVersion ?? WORKFLOW_VERSION;
        this._policyVersion = options.policyVersion ?? POLICY_VERSION;
        this._audience = options.audience ?? (options.registry.mode === 'synthetic' ? 'Local testing only' : '');
    }
    get mode() {
        return this._registry.mode;
    }
    get provider() {
        return this._provider;
    }
    async draftCampaignBrief(session, request) {
        return this._run(session, 'draftCampaignBrief', 'campaignBrief', request.workId, request.sourceIds, request.artifactId, async () => ({
            kind: 'campaignBrief',
            objective: request.objective,
            audienceContext: request.audienceContext
        }));
    }
    async draftContentPlan(session, request) {
        return this._run(session, 'draftContentPlan', 'contentPlan', request.workId, request.sourceIds, request.artifactId, async (readback, snapshotHash) => {
            const accepted = await this._acceptedBrief(request.workId, request.briefArtifactId, snapshotHash);
            if ('kind' in accepted && accepted.kind === 'failed') {
                return accepted;
            }
            const ref = accepted;
            const held = await this._repository.readEnvelope(ref.artifactId, ref.revision);
            const parsed = (0, campaignBrief_1.parseCampaignBrief)(held?.envelope.payload);
            if (parsed.value === undefined) {
                return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The accepted brief no longer parses as CampaignBrief.v1; it is quarantined and cannot be elaborated.'] };
            }
            return { kind: 'contentPlan', acceptedBrief: ref, acceptedBriefPayload: parsed.value };
        });
    }
    async draftMeetingFollowThrough(session, request) {
        return this._run(session, 'draftMeetingFollowThrough', 'meetingFollowThrough', request.workId, request.sourceIds, request.artifactId, async (readback) => {
            const brief = await this._repository.latestRevision(request.briefArtifactId);
            if (brief === undefined || brief.workId !== request.workId || brief.kind !== 'campaignBrief') {
                return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No campaign brief of this work was found to bind the packet to.'] };
            }
            const briefPayload = (0, campaignBrief_1.parseCampaignBrief)(brief.payload);
            if (briefPayload.value === undefined) {
                return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The current brief no longer parses as CampaignBrief.v1; it is quarantined.'] };
            }
            const plans = await this._repository.artifactsOf(request.workId, 'contentPlan');
            const plan = plans[plans.length - 1];
            // The notes are sources: each must be in the register at its version and free of instruction shapes.
            const notes = [];
            const gaps = [];
            for (const note of request.notes) {
                const entry = readback.register.entries.filter((candidate) => candidate.id === note.sourceId)[0];
                if (entry === undefined || entry.versionOrETag !== note.versionOrETag) {
                    gaps.push(`${note.sourceId} is not a permitted meeting source at the version given.`);
                    continue;
                }
                if (readback.revoked.indexOf(note.sourceId) >= 0) {
                    gaps.push(`${note.sourceId} was revoked; its notes were not read.`);
                    continue;
                }
                const retained = await this._registry.readExcerpt({ sourceId: note.sourceId, versionOrETag: note.versionOrETag }, entry);
                if (retained === undefined || (0, schema_1.looksLikeInstruction)(retained.excerpt)) {
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
                brief: (0, artifactRepository_1.artifactRefOf)(brief),
                briefPayload: briefPayload.value,
                contentPlan: plan === undefined ? null : (0, artifactRepository_1.artifactRefOf)(plan),
                notes
            };
        });
    }
    /** Gaps an input step recorded for the envelope of the run in progress; cleared on every run. */
    _pendingGaps = [];
    async _run(session, capability, kind, workId, sourceIds, existingArtifactId, inputs) {
        this._pendingGaps = [];
        const decision = (0, authorization_1.decide)(capability, session.resolution);
        if (!decision.allowed) {
            return { kind: 'failed', failure: 'notAuthorized', reasons: [decision.message] };
        }
        if (this._repository.store.unavailableReasons.length > 0) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: this._repository.store.unavailableReasons.slice() };
        }
        const read = await this._registry.readRegister();
        if (!read.available) {
            return { kind: 'failed', failure: 'registerUnavailable', reasons: read.reasons };
        }
        const readback = read.readback;
        const now = this._now();
        const qualification = await (0, sourceGate_1.qualifyRegister)(readback.register, { mode: this._registry.mode, now, evidence: readback.evidence });
        if (!qualification.usable || qualification.snapshotHash === undefined) {
            return { kind: 'failed', failure: 'registerNotQualified', reasons: qualification.reasons };
        }
        const snapshotHash = qualification.snapshotHash;
        const purpose = kind;
        const requested = sourceIds.map((id) => {
            const entry = readback.register.entries.filter((candidate) => candidate.id === id)[0];
            return { sourceId: id, versionOrETag: entry === undefined ? '' : entry.versionOrETag };
        });
        if (this._audience === '')
            return { kind: 'failed', failure: 'notAuthorized', reasons: ['No server-selected business audience is bound.'] };
        const access = (0, sourceGate_1.checkSourceSet)(readback.register, requested, { callerId: session.actorId, purpose, audience: this._audience, now, revoked: readback.revoked });
        const permitted = [];
        const sourceGaps = access.gaps.slice();
        for (const reference of access.usable) {
            const entry = readback.register.entries.filter((candidate) => candidate.id === reference.sourceId)[0];
            const excerpt = await this._registry.readExcerpt(reference, entry);
            if (excerpt === undefined) {
                sourceGaps.push(`${reference.sourceId} could not be read at the cited version.`);
                continue;
            }
            if ((0, schema_1.looksLikeInstruction)(excerpt.excerpt)) {
                sourceGaps.push(`${reference.sourceId} carries instruction-like text and was excluded; a source is evidence, not an instruction.`);
                continue;
            }
            permitted.push(excerpt);
        }
        const availability = this._provider.availability();
        const artifactId = existingArtifactId ?? this._newId(kind === 'campaignBrief' ? 'BRIEF' : kind === 'contentPlan' ? 'PLAN' : 'FOLLOWUP');
        const previous = existingArtifactId === undefined ? undefined : await this._repository.latestRevision(existingArtifactId);
        if (existingArtifactId !== undefined && (previous === undefined || previous.workId !== workId || previous.kind !== kind || previous.tenantScope !== session.tenantScope || previous.createdBy !== session.actorId)) {
            return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The artifact to redraft is not one of this work and kind.'] };
        }
        const built = await inputs(readback, snapshotHash);
        if ('failure' in built) {
            return built;
        }
        sourceGaps.push(...this._pendingGaps);
        const createdAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        if (!availability.available) {
            return {
                kind: 'failed',
                failure: 'providerUnavailable',
                reasons: availability.reasons,
                manualFallback: manualSkeleton(kind, artifactId, workId, readback.register, createdAt)
            };
        }
        const providerRequest = {
            requestId: this._newId('REQ'),
            operation: kind,
            workId,
            registerId: readback.register.registerId,
            registerVersion: readback.register.version,
            permittedSources: permitted,
            inputs: built,
            policy: { avoidedWords: copyPolicy_1.AVOIDED_WORDS, prohibitedClaims: copyPolicy_1.PROHIBITED_CLAIMS },
            artifactId,
            createdAt
        };
        let response;
        try {
            response = await this._provider.draft(providerRequest);
        }
        catch (error) {
            return { kind: 'failed', failure: 'providerUnavailable', reasons: [`The provider failed: ${describe(error)}`], manualFallback: manualSkeleton(kind, artifactId, workId, readback.register, createdAt) };
        }
        // The boundary: parse strictly, then check the facts the provider may not choose.
        const parsed = parseByKind(kind, response.payload);
        if (parsed.value === undefined) {
            return { kind: 'failed', failure: 'invalidProviderOutput', reasons: parsed.errors };
        }
        const payload = parsed.value;
        const identityErrors = [];
        if (payload.workId !== workId) {
            identityErrors.push('The provider named another Work ID.');
        }
        if (payload.registerId !== readback.register.registerId || payload.registerVersion !== readback.register.version) {
            identityErrors.push('The provider named another register or version.');
        }
        const ownId = kind === 'campaignBrief' ? payload.briefId : kind === 'contentPlan' ? payload.planId : payload.followThroughId;
        if (ownId !== artifactId) {
            identityErrors.push('The provider chose its own artifact id.');
        }
        if (payload.createdAt !== createdAt) {
            identityErrors.push('The provider wrote its own timestamp.');
        }
        if (identityErrors.length > 0) {
            return { kind: 'failed', failure: 'invalidProviderOutput', reasons: identityErrors };
        }
        const permittedKeys = permitted.map((source) => `${source.sourceId}@${source.versionOrETag}`);
        if (built.kind === 'meetingFollowThrough') {
            for (const note of built.notes) {
                permittedKeys.push(`${note.sourceId}@${note.versionOrETag}`);
            }
        }
        const outside = citationsOf(kind, payload)
            .map((reference) => `${reference.sourceId}@${reference.versionOrETag}`)
            .filter((key) => permittedKeys.indexOf(key) < 0);
        if (outside.length > 0) {
            return { kind: 'failed', failure: 'sourceOutsidePermittedSet', reasons: outside.map((key) => `The output cites ${key}, which is outside the permitted set of this run; a draft cannot approve a source.`) };
        }
        // The copy policy over every claim; findings are recorded, never a reason to call the copy true.
        const copyFindings = [];
        for (const claim of claimsOf(kind, payload)) {
            const findings = (0, copyPolicy_1.checkCopy)(claim.text, { cited: claim.sources.length > 0 }).findings;
            for (const finding of findings) {
                copyFindings.push(`“${finding.found}”: ${finding.note}`);
            }
        }
        const hash = await (0, actionEnvelope_1.payloadHash)(payload);
        if (hash === undefined) {
            return { kind: 'failed', failure: 'storeUnavailable', reasons: ['The platform offers no SHA-256 digest, so the revision cannot be hashed; nothing was saved.'] };
        }
        const revision = previous === undefined ? 1 : previous.revision + 1;
        const parents = [];
        if (built.kind === 'contentPlan') {
            parents.push({ kind: 'campaignBrief', artifactId: built.acceptedBrief.artifactId, revision: built.acceptedBrief.revision, payloadHash: built.acceptedBrief.payloadHash });
        }
        if (built.kind === 'meetingFollowThrough') {
            parents.push(built.brief);
            if (built.contentPlan !== null) {
                parents.push(built.contentPlan);
            }
        }
        const sourcesUsed = permitted
            .filter((source) => citationsOf(kind, payload).filter((reference) => reference.sourceId === source.sourceId).length > 0)
            .map((source) => ({ sourceId: source.sourceId, versionOrETag: source.versionOrETag, locator: source.locator }));
        if (built.kind === 'meetingFollowThrough') {
            for (const note of built.notes) {
                sourcesUsed.push({ sourceId: note.sourceId, versionOrETag: note.versionOrETag, locator: note.locator });
            }
        }
        const envelope = {
            envelopeVersion: '1.0',
            tenantScope: session.tenantScope,
            workId,
            artifactId,
            kind,
            schemaVersion: '1.0',
            revision,
            supersedes: previous === undefined ? null : (0, artifactRepository_1.artifactRefOf)(previous),
            parents,
            payload,
            payloadHash: hash,
            registerSnapshot: { registerId: readback.register.registerId, version: readback.register.version, snapshotHash, snapshotRef: readback.snapshotRef },
            sourcesUsed,
            workflowVersion: this._workflowVersion,
            policyVersion: this._policyVersion,
            providerProvenance: {
                mode: this._provider.mode,
                provider: this._provider.name,
                model: response.model,
                requestId: providerRequest.requestId,
                responseId: response.responseId,
                qualificationReceiptRef: this._provider.mode === 'qualified' ? response.qualificationReceiptRef ?? null : null
            },
            evidenceGaps: payload.evidenceGaps.concat(sourceGaps),
            knowledge: knowledgeOf(kind, payload),
            createdBy: session.actorId,
            createdAt,
            testRecord: this._repository.store.mode === 'synthetic',
            receiptRefs: []
        };
        const receiptId = this._newId('RCPT');
        envelope.receiptRefs = [receiptId];
        const intentKey = `saveRevision:${artifactId}:${revision}:${hash.slice(0, 16)}`;
        const receipt = { receiptId, operation: 'saveRevision', targetRef: `envelope:${artifactId}:${revision}`, payloadHash: hash, readbackHash: hash, result: 'PASS', observedAt: createdAt, actorId: session.actorId };
        const intent = { key: intentKey, operation: 'saveRevision', payloadDigest: hash, status: 'pending', startedAt: createdAt, resultKey: receipt.targetRef, draftRecovery: { envelope, receipt, snapshotText: (0, sourceGate_1.registerSnapshotText)(readback.register), copyFindings, sourceGaps } };
        const written = await this._repository.writeIntent(intent, { ifAbsent: true });
        if (!written.ok)
            return { kind: 'failed', failure: 'uncertain', reasons: ['The original draft intent could not be confirmed.'], intentKey };
        return this.reconcileAttempt(session, intentKey);
    }
    /** Recover from retained server/synthetic intent, never regenerate an uncertain draft. */
    async reconcileAttempt(session, intentKey) {
        const fail = () => ({ kind: 'failed', failure: 'uncertain', reasons: ['The draft, snapshot, receipt or completion has not read back exactly. Retain this recovery reference.'], intentKey });
        const held = await this._repository.readIntent(intentKey);
        const recovery = held?.intent.draftRecovery;
        if (held === undefined || recovery === undefined)
            return fail();
        const { envelope, receipt, snapshotText, copyFindings, sourceGaps } = recovery;
        if (envelope.tenantScope !== session.tenantScope || envelope.createdBy !== session.actorId || !(0, authorization_1.decide)('draftCampaignBrief', session.resolution).allowed)
            return { kind: 'failed', failure: 'notAuthorized', reasons: ['This draft belongs to another scope.'] };
        if (await (0, actionEnvelope_1.payloadHash)(envelope.payload) !== held.intent.payloadDigest || envelope.payloadHash !== held.intent.payloadDigest)
            return fail();
        const snapshotKey = `snapshot:${envelope.registerSnapshot.registerId}:${envelope.registerSnapshot.version}`;
        if (await this._repository.store.read(snapshotKey) === undefined && !(await this._repository.writeSnapshot(envelope.registerSnapshot.registerId, envelope.registerSnapshot.version, snapshotText)).ok)
            return fail();
        if ((await this._repository.store.read(snapshotKey))?.value !== snapshotText)
            return fail();
        if (await this._repository.readEnvelope(envelope.artifactId, envelope.revision) === undefined && !(await this._repository.writeEnvelope(envelope)).ok)
            return fail();
        const after = await this._repository.readEnvelope(envelope.artifactId, envelope.revision);
        if (after === undefined || await (0, actionEnvelope_1.payloadHash)(after.envelope) !== await (0, actionEnvelope_1.payloadHash)(envelope))
            return fail();
        if (await this._repository.readReceipt(receipt.receiptId) === undefined && !(await this._repository.writeReceipt(receipt)).ok)
            return fail();
        if (await (0, actionEnvelope_1.payloadHash)(await this._repository.readReceipt(receipt.receiptId)) !== await (0, actionEnvelope_1.payloadHash)(receipt))
            return fail();
        const completed = { ...held.intent, status: 'completed' };
        if (!(await this._repository.writeIntent(completed, { expectedVersion: held.storeVersion })).ok)
            return fail();
        if (await (0, actionEnvelope_1.payloadHash)((await this._repository.readIntent(intentKey))?.intent) !== await (0, actionEnvelope_1.payloadHash)(completed))
            return fail();
        return this._saved(envelope, after.storeVersion, envelope.registerSnapshot.snapshotHash, copyFindings, sourceGaps);
    }
    async _saved(envelope, storeVersion, snapshotHash, copyFindings, sourceGaps) {
        const state = await this._repository.stateOf(envelope, snapshotHash, this._now());
        return { kind: 'saved', envelope, state, storeVersion, copyFindings, sourceGaps, limitation: exports.DRAFT_LIMITATION };
    }
    /** The exact accepted revision of a brief, read back with its acceptance receipt; anything else is refused. */
    async _acceptedBrief(workId, artifactId, snapshotHash) {
        const latest = await this._repository.latestRevision(artifactId);
        if (latest === undefined || latest.workId !== workId || latest.kind !== 'campaignBrief') {
            return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No campaign brief of this work with that id was found.'] };
        }
        const state = await this._repository.stateOf(latest, snapshotHash, this._now());
        if (state !== 'accepted') {
            return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: [`The brief's current revision ${latest.revision} reads as ${state}, not accepted; a content plan starts only from an accepted brief.`] };
        }
        const decisions = await this._repository.decisionsFor(artifactId);
        const acceptance = decisions
            .filter((decision) => decision.target.revision === latest.revision && decision.contentHash === latest.payloadHash && decision.outcome === 'accept' && decision.readbackVerified)
            .sort((left, right) => (left.decidedAt < right.decidedAt ? 1 : -1))[0];
        if (acceptance === undefined) {
            return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['No read-back acceptance decision was found for the current brief revision.'] };
        }
        const receipt = await this._repository.readReceipt(acceptance.receiptId);
        if (receipt === undefined || receipt.result !== 'PASS') {
            return { kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['The acceptance receipt could not be read back.'] };
        }
        return { kind: 'campaignBrief', artifactId: latest.artifactId, revision: latest.revision, payloadHash: latest.payloadHash, acceptanceReceiptId: acceptance.receiptId };
    }
}
exports.MarketingDraftService = MarketingDraftService;
function parseByKind(kind, payload) {
    switch (kind) {
        case 'campaignBrief':
            return (0, campaignBrief_1.parseCampaignBrief)(payload);
        case 'contentPlan':
            return (0, contentPlan_1.parseContentPlan)(payload);
        case 'meetingFollowThrough':
            return (0, meetingFollowThrough_1.parseMeetingFollowThrough)(payload);
        default: {
            const exhaustive = kind;
            throw new Error(`Unknown artifact kind ${String(exhaustive)}`);
        }
    }
}
/** Known/assumed/unknown from the claims: cited claims are known-by-source, sentinel claims are unknown. Nothing is assumed silently. */
function knowledgeOf(kind, payload) {
    const known = [];
    const unknown = [];
    for (const claim of claimsOf(kind, payload)) {
        if (claim.sources.length > 0) {
            known.push(claim.text);
        }
        else {
            unknown.push(`${claim.text} (${claim.unknown ?? 'UNKNOWN'})`);
        }
    }
    return { known, assumed: [], unknown };
}
/** A draft-only skeleton for a person to complete when no provider is available; every fact is marked unknown. */
function manualSkeleton(kind, artifactId, workId, register, createdAt) {
    const base = { schemaVersion: '1.0', workId, registerId: register.registerId, registerVersion: register.version, createdAt, evidenceGaps: ['Drafted by hand without a provider; every claim needs a source or a sentinel.'], reviewNeeds: ['Strategy and voice: Marketing owner (role; identity unbound)'] };
    if (kind === 'campaignBrief') {
        return { ...base, briefId: artifactId, objective: '', audience: [], painPoints: [], message: [{ text: '', sources: [], unknown: 'UNKNOWN' }], channelPlan: [], contentCalendar: [] };
    }
    return { ...base, [kind === 'contentPlan' ? 'planId' : 'followThroughId']: artifactId, note: 'Complete the required groups by hand; the validator lists what is missing.' };
}
