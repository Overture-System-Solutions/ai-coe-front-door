'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SharePointCanonicalStore, listUrl, collection, sha } = require('./sharepoint.cjs');
const { ServerSourceRegistry } = require('./source-registry.cjs');
const { createClaudeProvider } = require('./provider.cjs');
const fields = {
  ListMarketingWorkV1: [],
  SaveManualMarketingDraftV1: ['workId', 'kind', 'payload', 'sourceIds', 'artifactId', 'expectedStoreVersion'],
  DraftCampaignBriefV1: ['workId', 'objective', 'audienceContext', 'sourceIds', 'artifactId'],
  DraftContentPlanV1: ['workId', 'briefArtifactId', 'sourceIds', 'artifactId'],
  DraftMeetingFollowThroughV1: ['workId', 'briefArtifactId', 'sourceIds', 'artifactId', 'notes'],
  RequestReviewV1: ['target', 'reviewKind'], RecordReviewDecisionV1: ['target', 'reviewKind', 'outcome', 'comments', 'expectedStoreVersion', 'idempotencyKey'],
  RecoverMarketingIntentV1: ['intentKey', 'kind'], GetArtifactV1: ['artifactId', 'revision'], ListArtifactsV1: ['workId', 'own'],
  GetReviewV1: ['reviewId'], ListReviewDecisionsV1: ['artifactId'], ListReviewRequestsV1: ['artifactId'], ListAuthoritiesV1: [], ReadSourceRegisterV1: [], ReadSourceExcerptV1: ['reference']
};
function validatePayload(operation, payload, shared) {
  if (!fields[operation] || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(k => !fields[operation].includes(k))) throw new Error('Unknown operation or payload authority/schema field.');
  if (operation === 'SaveManualMarketingDraftV1') {
    const errors = shared('content/marketing/manualDraft').manualRequestErrors(payload);
    if (errors.length) throw new Error('Manual input schema rejected: ' + errors.join(' '));
  }
  const issues = [], schema = shared('content/marketing/schema');
  if (operation.startsWith('Draft') || operation === 'ListArtifactsV1') schema.workId(payload.workId, 'workId', issues);
  for (const key of ['artifactId', 'briefArtifactId', 'reviewId']) if (payload[key] !== undefined) schema.canonicalId(payload[key], key, issues);
  if (['GetArtifactV1', 'ListReviewDecisionsV1', 'ListReviewRequestsV1'].includes(operation) && !payload.artifactId) throw new Error('Artifact schema identity required.');
  if (operation === 'GetReviewV1' && !payload.reviewId) throw new Error('Review schema identity required.');
  if (operation.startsWith('Draft')) {
    if (!Array.isArray(payload.sourceIds) || payload.sourceIds.length > 50 || payload.sourceIds.some(id => typeof id !== 'string' || !id || id.length > 256)) throw new Error('Source schema invalid.');
    if (operation === 'DraftCampaignBriefV1' && (typeof payload.objective !== 'string' || !payload.objective.trim() || payload.objective.length > 8000 || !Array.isArray(payload.audienceContext) || payload.audienceContext.some(s => typeof s !== 'string' || s.length > 2000))) throw new Error('Brief schema invalid.');
    if (operation !== 'DraftCampaignBriefV1' && !payload.briefArtifactId) throw new Error('Brief parent schema required.');
    if (operation === 'DraftMeetingFollowThroughV1' && (!Array.isArray(payload.notes) || payload.notes.length < 1 || payload.notes.length > 30 || payload.notes.some(n => !n || Object.keys(n).some(k => !['sourceId', 'versionOrETag', 'locator'].includes(k)) || typeof n.sourceId !== 'string' || typeof n.versionOrETag !== 'string'))) throw new Error('Meeting sources must be references, not caller text.');
  }
  if (payload.revision !== undefined && (!Number.isSafeInteger(payload.revision) || payload.revision < 1)) throw new Error('Revision schema invalid.');
  if (operation === 'RequestReviewV1' || operation === 'RecordReviewDecisionV1') {
    shared('content/marketing/artifactTypes').parseArtifactRef(payload.target, 'target', issues);
    if (!['strategyVoice', 'copyChannel', 'meetingDecisionsActions', 'communicationsSend'].includes(payload.reviewKind)) throw new Error('Review kind schema invalid.');
  }
  if (operation === 'RecordReviewDecisionV1' && (!['accept', 'requestChanges', 'reject'].includes(payload.outcome) || typeof payload.comments !== 'string' || payload.comments.length > 8000 || typeof payload.expectedStoreVersion !== 'string' || typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.length < 8 || payload.idempotencyKey.length > 255)) throw new Error('Decision schema invalid.');
  if (operation === 'RecoverMarketingIntentV1' && (typeof payload.intentKey !== 'string' || payload.intentKey.length > 255 || !['draft', 'review'].includes(payload.kind))) throw new Error('Recovery schema invalid.');
  if (operation === 'ReadSourceExcerptV1') schema.sourceRef(payload.reference, 'reference', issues);
  if (issues.length) throw new Error('Marketing input schema rejected.');
  return payload;
}
class MarketingRuntime {
  constructor({ config, sp, store, shared, schemaFor, invokeClaude, now = () => new Date() }) {
    this.config = config; this.sp = sp; this.store = store ?? new SharePointCanonicalStore(sp, config);
    this.shared = shared ?? (name => require(path.join(__dirname, '../compiled', name + '.js')));
    this.invokeClaude = invokeClaude; this.now = now;
    this.schemaFor = schemaFor ?? (kind => require(path.join(__dirname, '../schemas', { campaignBrief: 'campaign-brief.v1.json', contentPlan: 'content-plan.v1.json', meetingFollowThrough: 'meeting-follow-through.v1.json' }[kind])));
    this.hash = this.shared('content/actionEnvelope').payloadHash;
  }
  async read(key) { const held = await this.store.read(key); return held ? { value: JSON.parse(held.value), version: held.version } : undefined; }
  async put(key, value, prior) {
    const text = JSON.stringify(value), write = await this.store.write(key, text, prior ? { expectedVersion: prior.version } : { ifAbsent: true });
    const after = await this.read(key);
    if (!write.ok || !after || await this.hash(after.value) !== await this.hash(value)) throw new Error('INCONCLUSIVE: canonical checkpoint did not read back.');
    return after;
  }
  async qualify(ref, bindingHash) {
    const held = await this.read(`qualification:${ref}`), q = held?.value;
    if (q?.result !== 'PASS' || q.bindingHash !== bindingHash || !Number.isFinite(Date.parse(q.expiresAt)) || Date.parse(q.expiresAt) <= this.now().getTime()) throw new Error('Server qualification missing, expired or wrong binding.');
  }
  async memberFor(row) {
    const member = (await this.read(`member:${row.AuthorId}`))?.value;
    if (member?.enabled !== true || member.actorId !== row.Author.Email || !Array.isArray(member.roles) || !member.roles.every(r => ['employee', 'marketingParticipant', 'marketingReviewer'].includes(r)) || !Array.isArray(member.workIds) || typeof member.audience !== 'string' || !member.audience.trim()) throw new Error('Verified Author lacks current Marketing membership.');
    const issues = [];
    if (member.workIds.length > 500) throw new Error('Authorized work projection exceeds its bound.');
    for (const id of member.workIds) this.shared('content/marketing/schema').workId(id, 'workIds', issues);
    if (issues.length) throw new Error('Membership contains an invalid canonical Work ID.');
    return member;
  }
  async authorizePayload(payload, session, member) {
    if (!payload) throw new Error('Original command authorization context unavailable.');
    const allowWork = id => { if (!member.workIds.includes(id)) throw new Error('Work access denied.'); };
    if (payload.workId) allowWork(payload.workId);
    const { ArtifactRepository } = this.shared('services/marketing/artifactRepository');
    const repository = new ArtifactRepository(this.store);
    const ids = [payload.artifactId, payload.briefArtifactId, payload.target?.artifactId].filter(Boolean);
    if (payload.kind && payload.payload) {
      const refs = value => { if (Array.isArray(value)) return value.forEach(refs); if (!value || typeof value !== 'object') return; if (typeof value.artifactId === 'string') ids.push(value.artifactId); Object.values(value).forEach(refs); };
      refs(payload.payload);
    }
    if (payload.reviewId) { const d = await repository.readDecision(payload.reviewId); if (d) ids.push(d.decision.target.artifactId); }
    for (const id of ids) {
      const e = await repository.latestRevision(id);
      if (!e || e.tenantScope !== session.tenantScope) throw new Error('Artifact not found in this tenant.');
      allowWork(e.workId);
      if (e.createdBy !== session.actorId && !member.roles.includes('marketingReviewer')) throw new Error('Artifact access denied.');
    }
  }
  async execute(itemId) {
    if (this.config.enabled !== true || !Number.isSafeInteger(itemId) || itemId < 1) throw new Error('Marketing runtime disabled or request reference invalid.');
    await this.qualify(this.config.qualificationReceiptRef, await this.hash(this.config));
    const response = await this.sp.request('GET', `${listUrl(this.config, 'requestListId')}(${itemId})?$select=Id,Title,Operation,ProtocolVersion,PayloadJson,Created,Modified,AuthorId,EditorId,Author/Id,Author/Email,Author/LoginName&$expand=Author`);
    const row = response.body?.d ?? response.body;
    if (response.status !== 200 || row?.Id !== itemId || row.ProtocolVersion !== 'marketing.v1' || !/^[0-9a-f-]{36}$/i.test(row.Title) || row.Author?.Id !== row.AuthorId || row.EditorId !== row.AuthorId || row.Created !== row.Modified || typeof row.Author.Email !== 'string' || !row.Author.Email || typeof row.PayloadJson !== 'string' || row.PayloadJson.length > 100000) throw new Error('Immutable request/Author could not be verified.');
    const payload = validatePayload(row.Operation, JSON.parse(row.PayloadJson), this.shared);
    const member = await this.memberFor(row);
    const session = { actorId: row.Author.Email, tenantScope: this.config.siteUrl, resolution: { resolution: 'resolved', roles: member.roles } };
    await this.authorizePayload(payload, session, member);
    const fingerprint = await this.hash({ operation: row.Operation, payload, actorId: session.actorId, tenantScope: session.tenantScope });
    let command = await this.read(`command:${row.Title}`);
    if (command && (command.value.fingerprint !== fingerprint || command.value.actorId !== session.actorId)) throw new Error('Request identity/payload changed.');
    if (command?.value.status === 'completed') {
      await this.authorizeDisclosure(row, row.Operation, payload, command.value.result, session, member);
      return this.publish(row, command.value.result);
    }
    // Cross-instance CAS claim. No automatic expired-lease takeover or blind retry of a paid call.
    const lock = await this.read('writer:marketing');
    if (lock && lock.value.status !== 'idle') throw new Error('INCONCLUSIVE: canonical writer claim needs explicit recovery.');
    const token = randomUUID();
    const claim = await this.put('writer:marketing', { status: 'claimed', requestId: row.Title, token, claimedAt: this.now().toISOString() }, lock);
    try {
      if (!command) command = await this.put(`command:${row.Title}`, { fingerprint, actorId: session.actorId, operation: row.Operation, payload, status: 'pending', startedAt: this.now().toISOString() });
      let result = await this.dispatch(row, payload, session, member, command.value);
      if ((await this.read(`provider:${row.Title}`))?.value.status === 'pending') result = this.providerUncertain(row.Title);
      await this.authorizePayload(payload, session, await this.memberFor(row));
      await this.authorizeDisclosure(row, row.Operation, payload, result, session, await this.memberFor(row));
      command = await this.put(`command:${row.Title}`, { ...command.value, status: 'completed', result }, command);
      return await this.publish(row, result);
    } finally {
      const current = await this.read('writer:marketing');
      if (current?.value.token === token) await this.put('writer:marketing', { status: 'idle', previousRequestId: row.Title }, current);
    }
  }
  providerUncertain(intentKey) { return { kind: 'failed', failure: 'uncertain', reasons: ['Provider outcome is unknown. Retain this reference; the operator must reconcile the original connector invocation, never retry it blindly.'], intentKey }; }
  registryFor(row, session, member, purpose) {
    return new ServerSourceRegistry({ store: this.store, sp: this.sp, shared: this.shared, siteUrl: this.config.siteUrl, actorId: session.actorId, loginName: row.Author.LoginName, purpose, audience: member.audience, now: this.now });
  }
  async authorizeDisclosure(row, operation, payload, value, session, member) {
    const denied = () => { throw new Error('Current source disclosure authorization failed; cached content cannot be republished.'); };
    if (operation === 'RecoverMarketingIntentV1' && (typeof value?.excerpt === 'string' || value?.available === true)) denied();
    if (operation === 'ListMarketingWorkV1' && await this.hash(value) !== await this.hash([...new Set(member.workIds)].sort())) denied();
    if (operation === 'ReadSourceExcerptV1' && value !== null) {
      const current = await this.registryFor(row, session, member, 'meetingFollowThrough').readExcerpt(payload.reference);
      if (!current || await this.hash(current) !== await this.hash(value)) denied();
    }
    if (operation === 'ReadSourceRegisterV1' && value?.available) {
      const registry = this.registryFor(row, session, member, 'meetingFollowThrough'), current = await registry.readRegister();
      if (!current.available || await this.hash(current) !== await this.hash(value)) denied();
      for (const entry of current.readback.register.entries) if (!await registry.readExcerpt({ sourceId: entry.id, versionOrETag: entry.versionOrETag })) denied();
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item?.envelope) {
        await this.authorizePayload({ artifactId: item.envelope.artifactId }, session, member);
        const registry = this.registryFor(row, session, member, item.envelope.kind);
        if (!await this.shared('services/marketing/sourceRegistry').validateEnvelopeSources(registry, item.envelope, this.now(), member.audience)) denied();
      }
    }
  }
  async authorizeProviderWire(row, session, wire) {
    const member = await this.memberFor(row), request = JSON.parse(wire['body/messages'][0].content);
    await this.authorizePayload({ workId: request.workId }, session, member);
    const capability = { campaignBrief: 'draftCampaignBrief', contentPlan: 'draftContentPlan', meetingFollowThrough: 'draftMeetingFollowThrough' }[request.operation];
    if (!this.shared('services/authorization').decide(capability, { resolution: 'resolved', roles: member.roles }).allowed) throw new Error('Current provider caller is not authorized.');
    const registry = this.registryFor(row, session, member, request.operation), register = await registry.readRegister();
    if (!register.available || request.registerId !== register.readback.register.registerId || request.registerVersion !== register.readback.register.version) throw new Error('Current source register cannot authorize provider disclosure.');
    const repository = new (this.shared('services/marketing/artifactRepository').ArtifactRepository)(this.store);
    for (const ref of [request.inputs.acceptedBrief, request.inputs.brief, request.inputs.contentPlan].filter(Boolean)) {
      const latest = await repository.latestRevision(ref.artifactId);
      if (!latest || latest.workId !== request.workId || latest.tenantScope !== session.tenantScope || latest.revision !== ref.revision || latest.payloadHash !== ref.payloadHash) throw new Error('Parent changed before provider disclosure.');
      await this.authorizePayload({ workId: request.workId, artifactId: ref.artifactId }, session, member);
      await this.authorizeDisclosure(row, 'GetArtifactV1', {}, { envelope: latest }, session, member);
    }
    for (const offered of [...request.permittedSources, ...(request.inputs.notes ?? [])]) {
      const current = await registry.readExcerpt(offered);
      if (!current || await this.hash(current) !== await this.hash(offered)) throw new Error('Source changed before provider disclosure.');
    }
    const current = await this.memberFor(row);
    if (await this.hash(current) !== await this.hash(member)) throw new Error('Membership changed before provider disclosure.');
  }
  async services(row, session, member, command) {
    const kind = { DraftCampaignBriefV1: 'campaignBrief', DraftContentPlanV1: 'contentPlan', DraftMeetingFollowThroughV1: 'meetingFollowThrough' }[row.Operation] ?? (row.Operation === 'SaveManualMarketingDraftV1' ? command.payload.kind : 'meetingFollowThrough');
    const registry = new ServerSourceRegistry({ store: this.store, sp: this.sp, shared: this.shared, siteUrl: this.config.siteUrl, actorId: session.actorId, loginName: row.Author.LoginName, purpose: kind, audience: member.audience, now: this.now });
    const { ArtifactRepository } = this.shared('services/marketing/artifactRepository');
    const { validateEnvelopeSources } = this.shared('services/marketing/sourceRegistry');
    const repository = new ArtifactRepository(this.store, async (envelope, now) => {
      const scoped = new ServerSourceRegistry({ store: this.store, sp: this.sp, shared: this.shared, siteUrl: this.config.siteUrl, actorId: session.actorId, loginName: row.Author.LoginName, purpose: envelope.kind, audience: member.audience, now: this.now });
      return validateEnvelopeSources(scoped, envelope, now, member.audience);
    });
    const snapshot = async () => { const r = await registry.readRegister(); return r.available ? this.shared('content/marketing/sourceGate').registerSnapshotHash(r.readback.register) : undefined; };
    let n = 0;
    const newId = prefix => `${prefix}-${sha(`${row.Title}:${prefix}:${++n}`).slice(0,24).toUpperCase()}`;
    const { MarketingReviewService } = this.shared('services/marketing/marketingReviewService');
    const review = new MarketingReviewService({ repository, now: this.now, newId, currentRegisterSnapshotHash: snapshot });
    const provider = createClaudeProvider({ model: this.config.provider?.model, qualificationReceiptRef: this.config.provider?.qualificationReceiptRef ?? '', schemaFor: this.schemaFor, invoke: async wire => {
      await this.qualify(this.config.provider.qualificationReceiptRef, await this.hash(this.config.provider));
      const key = `provider:${row.Title}`, previous = await this.read(key), wireHash = await this.hash(wire);
      if (previous) {
        if (previous.value.wireHash !== wireHash || previous.value.status !== 'completed') throw new Error('Provider attempt inconclusive; do not call again.');
        return previous.value.response;
      }
      const intent = await this.put(key, { status: 'pending', wireHash });
      if (typeof this.invokeClaude !== 'function') throw new Error('Qualified Claude connector invocation not bound.');
      await this.authorizeProviderWire(row, session, wire);
      const response = await this.invokeClaude(wire);
      await this.put(key, { status: 'completed', wireHash, response }, intent);
      return response;
    } });
    const { MarketingDraftService } = this.shared('services/marketing/marketingDraftService');
    const draft = new MarketingDraftService({ repository, registry, provider, audience: member.audience, now: this.now, newId, beforeManualCommit: async envelope => {
      const current = await this.memberFor(row);
      const capability = { campaignBrief: 'draftCampaignBrief', contentPlan: 'draftContentPlan', meetingFollowThrough: 'draftMeetingFollowThrough' }[envelope.kind];
      if (current.audience !== member.audience || !this.shared('services/authorization').decide(capability, { resolution: 'resolved', roles: current.roles }).allowed) throw new Error('Current member is not authorized to save this manual draft.');
      await this.authorizePayload({ workId: envelope.workId, ...(envelope.supersedes ? { artifactId: envelope.artifactId } : {}), kind: envelope.kind, payload: envelope.payload }, session, current);
    } });
    return { repository, review, draft, registry };
  }
  async dispatch(row, p, session, member, command) {
    const s = await this.services(row, session, member, command);
    const allowWork = workId => { if (!member.workIds.includes(workId)) throw new Error('Work access denied.'); };
    const target = async id => {
      const held = await s.review.getArtifact(id);
      if (!held || held.envelope.tenantScope !== session.tenantScope) throw new Error('Artifact not found in this tenant.');
      allowWork(held.envelope.workId);
      if (held.envelope.createdBy !== session.actorId && !member.roles.includes('marketingReviewer')) throw new Error('Artifact access denied.');
      return held;
    };
    if (p.workId) allowWork(p.workId);
    if (p.artifactId) await target(p.artifactId);
    if (p.briefArtifactId) await target(p.briefArtifactId);
    if (p.target) await target(p.target.artifactId);
    switch (row.Operation) {
      case 'SaveManualMarketingDraftV1': return s.draft.saveManualDraft(session, p);
      case 'ListMarketingWorkV1': return [...new Set(member.workIds)].sort();
      case 'DraftCampaignBriefV1': return s.draft.draftCampaignBrief(session, p);
      case 'DraftContentPlanV1': return s.draft.draftContentPlan(session, p);
      case 'DraftMeetingFollowThroughV1': return s.draft.draftMeetingFollowThrough(session, { ...p, notes: p.notes.map(n => ({ ...n, text: '' })) });
      case 'ListArtifactsV1': return (await s.review.listArtifacts(p.workId)).filter(x => x.envelope.tenantScope === session.tenantScope && (x.envelope.createdBy === session.actorId || (!p.own && member.roles.includes('marketingReviewer'))));
      case 'GetArtifactV1': return await s.review.getArtifact(p.artifactId, p.revision) ?? null;
      case 'RequestReviewV1': return s.review.requestReview(session, p.target, p.reviewKind);
      case 'RecordReviewDecisionV1': {
        const bindings = await s.repository.authorities();
        const binding = bindings.find(b => b.actorId === session.actorId && b.tenantScope === session.tenantScope && !b.synthetic && !b.revoked && b.scope.includes(p.reviewKind));
        return s.review.recordReviewDecision({ ...session, authorityBindingRef: binding?.bindingRef, synthetic: false }, { ...p, idempotencyKey: `review:${sha(session.tenantScope + '\n' + session.actorId + '\n' + p.idempotencyKey)}` });
      }
      case 'GetReviewV1': { const d = await s.review.getReview(p.reviewId); if (d) await target(d.target.artifactId); return d ?? null; }
      case 'ListReviewDecisionsV1': return s.review.decisionsFor(p.artifactId);
      case 'ListReviewRequestsV1': return s.review.requestsFor(p.artifactId);
      case 'ListAuthoritiesV1': return (await s.repository.authorities()).filter(b => b.actorId === session.actorId && b.tenantScope === session.tenantScope && !b.synthetic && !b.revoked);
      case 'ReadSourceRegisterV1': {
        const r = await s.registry.readRegister();
        if (!r.available) return r;
        // Do not disclose a partial register carrying a whole-register approval hash.
        for (const entry of r.readback.register.entries) if (!await s.registry.readExcerpt({ sourceId: entry.id, versionOrETag: entry.versionOrETag })) return { available: false, reasons: ['This register contains sources outside the current author/purpose/audience.'] };
        return r;
      }
      case 'ReadSourceExcerptV1': return await s.registry.readExcerpt(p.reference) ?? null;
      case 'RecoverMarketingIntentV1': {
        const old = await this.read(`command:${p.intentKey}`);
        if (old) {
          if (old.value.actorId !== session.actorId) throw new Error('Recovery access denied.');
          await this.authorizePayload(old.value.payload, session, member);
          if (!['DraftCampaignBriefV1', 'DraftContentPlanV1', 'DraftMeetingFollowThroughV1', 'SaveManualMarketingDraftV1', 'RequestReviewV1', 'RecordReviewDecisionV1'].includes(old.value.operation)) throw new Error('Recovery is restricted to original mutation intents, not cached source reads.');
          await this.authorizeDisclosure(row, old.value.operation, old.value.payload, old.value.result, session, member);
          if ((await this.read(`provider:${p.intentKey}`))?.value.status === 'pending') return this.providerUncertain(p.intentKey);
          if (old.value.status === 'completed') {
            if (old.value.result?.kind !== 'failed' || !old.value.result.intentKey) return old.value.result;
            p = { ...p, intentKey: old.value.result.intentKey };
          } else return { kind: 'failed', failure: 'uncertain', reasons: ['Original command still pending; operator recovery required.'], intentKey: p.intentKey };
        }
        const intent = await s.repository.readIntent(p.intentKey);
        if (intent?.intent.draftRecovery) { allowWork(intent.intent.draftRecovery.envelope.workId); return s.draft.reconcileAttempt(session, p.intentKey); }
        const id = intent?.intent.resultKey?.replace(/^decision:/, ''), d = id ? await s.review.getReview(id) : undefined;
        if (!d || d.actorId !== session.actorId) throw new Error('Recovery access denied.');
        await target(d.target.artifactId);
        return await s.review.reconcileAttempt(p.intentKey) ?? { kind: 'failed', failure: 'uncertain', reasons: ['Original intent has no confirmed decision.'], intentKey: p.intentKey };
      }
      default: throw new Error('Unknown versioned Marketing operation.');
    }
  }
  async publish(row, value) {
    if (!Number.isSafeInteger(this.config.writerPrincipalId) || this.config.writerPrincipalId < 1 || this.config.writerPrincipalId === row.AuthorId) throw new Error('Private projection writer identity is not qualified.');
    const result = { protocol: 'marketing.v1', requestId: row.Title, operation: row.Operation, tenantScope: this.config.siteUrl, actorId: row.Author.Email, value, valueHash: await this.hash(value) };
    const url = listUrl(this.config, 'resultListId');
    const query = `${url}?$filter=${encodeURIComponent(`RequestId eq '${row.Title}'`)}&$top=2`;
    let rows = collection(await this.sp.request('GET', query)).values.filter(r => r.RequestId === row.Title);
    if (rows.length > 1) throw new Error('Duplicate projection.');
    if (!rows.length) {
      const created = await this.sp.request('POST', url, { Title: row.Title, RequestId: row.Title, ResultJson: JSON.stringify(result), VerifiedAuthorId: row.AuthorId });
      if (![200, 201].includes(created.status)) throw new Error('INCONCLUSIVE: result projection not confirmed.');
      rows = [created.body?.d ?? created.body];
    }
    const projected = rows[0];
    if (!Number.isSafeInteger(projected.Id) || projected.VerifiedAuthorId !== row.AuthorId || await this.hash(JSON.parse(projected.ResultJson)) !== await this.hash(result)) throw new Error('Projection readback mismatch.');
    if (!Number.isSafeInteger(this.config.readRoleDefinitionId) || this.config.readRoleDefinitionId !== 1073741826) throw new Error('Only the SharePoint Read role is permitted for projections.');
    for (const operation of ['breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)', `roleassignments/addroleassignment(principalid=${row.AuthorId},roledefid=${this.config.readRoleDefinitionId})`]) {
      const acl = await this.sp.request('POST', `${url}(${projected.Id})/${operation}`);
      if (![200, 201, 204].includes(acl.status)) throw new Error('INCONCLUSIVE: private projection read grant unconfirmed.');
    }
    const aclRead = await this.sp.request('GET', `${url}(${projected.Id})?$select=HasUniqueRoleAssignments,RoleAssignments/PrincipalId,RoleAssignments/RoleDefinitionBindings/Id&$expand=RoleAssignments/RoleDefinitionBindings`);
    const aclBody = aclRead.body?.d ?? aclRead.body, assignments = aclBody?.RoleAssignments?.results ?? aclBody?.RoleAssignments;
    const roleIds = a => (a.RoleDefinitionBindings?.results ?? a.RoleDefinitionBindings ?? []).map(r => r.Id);
    if (aclRead.status !== 200 || aclBody?.HasUniqueRoleAssignments !== true || !Array.isArray(assignments) || !assignments.some(a => a.PrincipalId === row.AuthorId && roleIds(a).length === 1 && roleIds(a)[0] === this.config.readRoleDefinitionId) || assignments.some(a => a.PrincipalId !== this.config.writerPrincipalId && a.PrincipalId !== row.AuthorId) || assignments.some(a => a.PrincipalId === row.AuthorId && roleIds(a).some(r => r !== this.config.readRoleDefinitionId))) throw new Error('INCONCLUSIVE: private projection ACL grant did not read back.');
    const verify = collection(await this.sp.request('GET', query)).values.filter(r => r.RequestId === row.Title);
    if (verify.length !== 1 || verify[0].ResultJson !== projected.ResultJson) throw new Error('INCONCLUSIVE: projection missing after grant.');
    return result;
  }
}
module.exports = { MarketingRuntime, validatePayload, fields };
