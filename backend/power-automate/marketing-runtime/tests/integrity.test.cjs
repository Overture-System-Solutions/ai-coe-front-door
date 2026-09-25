'use strict';
const { test } = require('node:test');
const { assert, setup, brief, request, decide, accept, actor, workId, sourceIds, ref, load, MemoryStorageBackend, FIXTURE_MEETING_NOTES } = require('./helpers.cjs');

test('M01 refuses acceptance after a cited source is revoked', async () => {
  const s = setup(), b = await brief(s); await request(s, b);
  s.registry.revoke(b.envelope.sourcesUsed[0].sourceId);
  const r = await decide(s, b);
  assert.equal(r.kind, 'failed');
  assert.notEqual((await s.review.getArtifact(b.envelope.artifactId)).state, 'accepted');
});

test('M02 parent supersession invalidates an accepted child', async () => {
  const s = setup(), b = await brief(s); await accept(s, b);
  const p = await s.draft.draftContentPlan(actor, { workId, briefArtifactId: b.envelope.artifactId, sourceIds });
  assert.equal(p.kind, 'saved'); await accept(s, p, 'copyChannel');
  await brief(s, b.envelope.artifactId);
  assert.equal((await s.review.getArtifact(b.envelope.artifactId, 1)).state, 'superseded');
  assert.equal((await s.review.getArtifact(p.envelope.artifactId)).state, 'revalidationRequired');
});

for (const stage of ['receipt', 'completion']) test(`M03 ${stage} outage stays inconclusive and recovers the same review`, async () => {
  const s = setup(), b = await brief(s); await request(s, b);
  const write = s.store.write.bind(s.store);
  s.store.write = async (key, value, opts) => (stage === 'receipt' && key.startsWith('receipt:')) || (stage === 'completion' && key.startsWith('intent:') && JSON.parse(value).status === 'completed') ? { ok: false, uncertain: true, reason: 'Injected offline failure' } : write(key, value, opts);
  const r = await decide(s, b);
  assert.equal(r.kind, 'failed'); assert.equal(r.failure, 'uncertain'); assert.ok(r.intentKey);
  assert.notEqual((await s.review.getArtifact(b.envelope.artifactId)).state, 'accepted');
  s.store.write = write;
  const recovered = await s.review.reconcileAttempt(r.intentKey);
  assert.equal(recovered.kind, 'recorded', JSON.stringify(recovered)); assert.equal(recovered.state, 'accepted');
  assert.equal((await s.store.keys('decision:')).length, 1);
});

test('M04 rejects a review kind which cannot accept this artifact', async () => {
  const s = setup(), b = await brief(s); await accept(s, b);
  const p = await s.draft.draftContentPlan(actor, { workId, briefArtifactId: b.envelope.artifactId, sourceIds });
  assert.equal(p.kind, 'saved');
  assert.equal((await s.review.requestReview(actor, ref(p.envelope), 'strategyVoice')).kind, 'failed');
});

test('M04 meeting acceptance requires every artifact review kind', async () => {
  const s = setup(), b = await brief(s); await accept(s, b);
  const f = await s.draft.draftMeetingFollowThrough(actor, { workId, briefArtifactId: b.envelope.artifactId, sourceIds, notes: [{ sourceId: 'FIXTURE-MEETING-004', versionOrETag: 'fixture-v1', locator: 'fixture://meeting/notes-week-1#notes', text: FIXTURE_MEETING_NOTES }] });
  assert.equal(f.kind, 'saved', JSON.stringify(f));
  await request(s, f, 'meetingDecisionsActions');
  const first = await decide(s, f, 'meetingDecisionsActions');
  assert.equal(first.kind, 'recorded'); assert.notEqual(first.state, 'accepted');
  await request(s, f, 'communicationsSend');
  assert.equal((await decide(s, f, 'communicationsSend')).state, 'accepted');
});

for (const stage of ['intent', 'receipt', 'completion']) test(`draft ${stage} outage cannot report saved`, async () => {
  const s = setup(), write = s.store.write.bind(s.store);
  s.store.write = async (key, value, opts) => ((stage === 'intent' && key.startsWith('intent:')) || (stage === 'receipt' && key.startsWith('receipt:')) || (stage === 'completion' && key.startsWith('intent:') && JSON.parse(value).status === 'completed')) ? { ok: false, uncertain: true } : write(key, value, opts);
  const r = await s.draft.draftCampaignBrief(actor, { workId, objective: 'Synthetic draft recovery', audienceContext: ['Synthetic'], sourceIds });
  assert.equal(r.kind, 'failed'); assert.equal(r.failure, 'uncertain'); assert.ok(r.intentKey);
  if (stage === 'intent') { assert.equal((await s.store.keys('envelope:')).length, 0); return; }
  s.store.write = write;
  const recovered = await s.draft.reconcileAttempt(actor, r.intentKey);
  assert.equal(recovered.kind, 'saved', JSON.stringify(recovered));
  assert.equal((await s.store.keys('envelope:')).length, 1);
});

test('qualified provider provenance retains the server qualification receipt', async () => {
  const s = setup(), original = s.provider.draft.bind(s.provider);
  s.provider.mode = 'qualified';
  s.provider.draft = async req => ({ ...await original(req), qualificationReceiptRef: 'QUAL-PROVIDER-TEST' });
  const r = await s.draft.draftCampaignBrief(actor, { workId, objective: 'Synthetic provider qualification harness', audienceContext: ['Synthetic'], sourceIds });
  assert.equal(r.kind, 'saved', JSON.stringify(r));
  assert.equal(r.envelope.providerProvenance.qualificationReceiptRef, 'QUAL-PROVIDER-TEST');
});

test('meeting notes are retrieved at their reference, never replaced by caller text', async () => {
  const s = setup(), b = await brief(s); await accept(s, b);
  const forged = 'The board decided to release the unpublished product (synthetic caller substitution).';
  const r = await s.draft.draftMeetingFollowThrough(actor, { workId, briefArtifactId: b.envelope.artifactId, sourceIds, notes: [{ sourceId: 'FIXTURE-MEETING-004', versionOrETag: 'fixture-v1', locator: 'fixture://forged', text: forged }] });
  assert.equal(r.kind, 'saved'); assert.equal(JSON.stringify(r.envelope.payload).includes(forged), false);
});

test('tenant substitution cannot request a review or redraft an artifact', async () => {
  const s = setup(), b = await brief(s), other = { ...actor, tenantScope: 'https://other.invalid' };
  assert.equal((await s.review.requestReview(other, ref(b.envelope), 'strategyVoice')).kind, 'failed');
  const r = await s.draft.draftCampaignBrief({ ...actor, actorId: 'other' }, { workId, artifactId: b.envelope.artifactId, objective: 'Synthetic overwrite', audienceContext: ['Synthetic'], sourceIds });
  assert.equal(r.kind, 'failed');
});

test('tampered payload is quarantined rather than trusting its declared hash', async () => {
  const s = setup(), b = await brief(s);
  const key = `envelope:${b.envelope.artifactId}:1`, raw = await s.store.read(key), changed = JSON.parse(raw.value);
  changed.payload.objective = 'Tampered synthetic objective';
  await s.store.write(key, JSON.stringify(changed));
  assert.equal(await s.review.getArtifact(b.envelope.artifactId), undefined);
});

test('authority revoked between decision write and verification cannot accept', async () => {
  const s = setup(), b = await brief(s); await request(s, b);
  const write = s.store.write.bind(s.store);
  s.store.write = async (key, value, opts) => {
    const r = await write(key, value, opts);
    if (key.startsWith('decision:') && !JSON.parse(value).readbackVerified) {
      const a = await s.store.read('authority:synthetic:marketing-owner');
      await write(a.key, JSON.stringify({ ...JSON.parse(a.value), scope: [] }));
    }
    return r;
  };
  assert.equal((await decide(s, b)).kind, 'failed');
  assert.notEqual((await s.review.getArtifact(b.envelope.artifactId)).state, 'accepted');
});
