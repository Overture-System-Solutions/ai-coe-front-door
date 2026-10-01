'use strict';
const { test } = require('node:test');
const { assert, load, path, root, ref } = require('./helpers.cjs');
const { fixture } = require('./runtime-fixture.cjs');
const { MarketingRuntime } = require('../server/runtime.cjs');
const schemaFor = kind => require(path.join(root, 'src/webparts/aiCoeFrontDoor/content/marketing/schemas', { campaignBrief: 'campaign-brief.v1.json', contentPlan: 'content-plan.v1.json', meetingFollowThrough: 'meeting-follow-through.v1.json' }[kind]));
class Runtime extends MarketingRuntime { constructor(options) { super({ ...options, schemaFor }); } }
const draft = async f => f.run('DraftCampaignBriefV1', { workId: 'CW-OFFLINE_TEST', objective: 'Review the invented offline example', audienceContext: ['Marketing team'], sourceIds: [f.entry.id] });

test('dispatcher drafts with real server source/provider adapters at a fake external boundary', async () => {
  const f = await fixture(Runtime); const result = await draft(f);
  assert.equal(result.kind, 'saved', JSON.stringify(result));
  assert.equal(result.state, 'draft');
  assert.deepEqual(result.envelope.sourcesUsed.map(s => s.sourceId), [f.entry.id]);
  assert.equal(result.envelope.providerProvenance.qualificationReceiptRef, 'QUAL-PROVIDER');
  assert.equal(f.providerCalls(), 1);
  assert.equal((await f.runtime().execute(f.requests[0].Id)).value.envelope.artifactId, result.envelope.artifactId);
  assert.equal(f.providerCalls(), 1, 'completed retry must not invoke provider again');
});
test('all three dispatcher journeys retain parent/review/source lineage; revocation removes acceptance', async () => {
  const f = await fixture(Runtime), b = await draft(f);
  const accept = async (artifact, kind) => {
    const req = await f.run('RequestReviewV1', { target: ref(artifact.envelope), reviewKind: kind });
    assert.equal(req.kind, 'recorded', JSON.stringify(req));
    const held = await f.run('GetArtifactV1', { artifactId: artifact.envelope.artifactId }, 8);
    const r = await f.run('RecordReviewDecisionV1', { target: ref(artifact.envelope), reviewKind: kind, outcome: 'accept', comments: 'Offline acceptance exercise only', expectedStoreVersion: held.storeVersion, idempotencyKey: require('node:crypto').randomUUID() }, 8);
    assert.equal(r.kind, 'recorded', JSON.stringify(r)); return r;
  };
  assert.equal((await accept(b, 'strategyVoice')).state, 'accepted');
  const plan = await f.run('DraftContentPlanV1', { workId: 'CW-OFFLINE_TEST', briefArtifactId: b.envelope.artifactId, sourceIds: [f.entry.id] });
  assert.equal(plan.kind, 'saved', JSON.stringify(plan)); assert.equal((await accept(plan, 'copyChannel')).state, 'accepted');
  const meeting = await f.run('DraftMeetingFollowThroughV1', { workId: 'CW-OFFLINE_TEST', briefArtifactId: b.envelope.artifactId, sourceIds: [f.entry.id], notes: [{ sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag }] });
  assert.equal(meeting.kind, 'saved', JSON.stringify(meeting));
  for (const kind of load('content/marketing/artifactEnvelope').requiredReviewKinds(meeting.envelope)) await accept(meeting, kind);
  assert.equal((await f.run('GetArtifactV1', { artifactId: meeting.envelope.artifactId })).state, 'accepted');
  const source = JSON.parse((await f.store.read('source:' + f.entry.id)).value); await f.save('source:' + f.entry.id, { ...source, revoked: true });
  for (const item of [b, plan, meeting]) {
    const repository = new (load('services/marketing/artifactRepository').ArtifactRepository)(f.store, async () => false);
    assert.equal(await repository.stateOf(item.envelope, item.envelope.registerSnapshot.snapshotHash, new Date('2026-09-23T13:00:00Z')), 'revalidationRequired');
    await assert.rejects(f.run('GetArtifactV1', { artifactId: item.envelope.artifactId }), /source disclosure/i, 'A state label cannot authorize redisclosing revoked source-derived content.');
  }
  assert.equal(f.providerCalls(), 3);
});

test('completed command replay and recovery recheck current Author work membership', async () => {
  const f = await fixture(Runtime), b = await draft(f), row = f.requests[0];
  assert.equal(b.kind, 'saved');
  const member = JSON.parse((await f.store.read('member:7')).value); await f.save('member:7', { ...member, workIds: [] });
  await assert.rejects(f.runtime().execute(row.Id), /work access denied/i);
  await assert.rejects(f.run('RecoverMarketingIntentV1', { intentKey: row.Title, kind: 'draft' }), /work access denied/i);
});
test('source endpoint refuses revoked register references and malformed approval expiry', async () => {
  const f = await fixture(Runtime);
  const input = { reference: { sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag } };
  assert.equal(typeof (await f.run('ReadSourceExcerptV1', input)).excerpt, 'string');
  const register = JSON.parse((await f.store.read('register:active')).value);
  await f.save('register:active', { ...register, revoked: [f.entry.id] });
  assert.equal(await f.run('ReadSourceExcerptV1', input), null);
  await f.save('register:active', { ...register, evidence: { ...register.evidence, expiresAt: null } });
  assert.equal((await f.run('ReadSourceRegisterV1', {})).available, false);
});
test('lost provider outcome stays uncertain and never invokes a second model attempt', async () => {
  const f = await fixture(Runtime); f.setProviderHook(async () => { throw new Error('simulated lost response'); });
  const first = await draft(f); assert.equal(first.failure, 'uncertain'); assert.equal(first.intentKey, f.requests[0].Title);
  const recovered = await f.run('RecoverMarketingIntentV1', { intentKey: first.intentKey, kind: 'draft' });
  assert.equal(recovered.failure, 'uncertain'); assert.equal(f.providerCalls(), 1);
});

test('durable draft receipt outage recovers the same draft without provider replay', async () => {
  const f = await fixture(Runtime), original = f.store.write.bind(f.store); let blocked = true;
  f.store.write = async (key, value, options) => blocked && key.startsWith('receipt:RCPT-') ? { ok: false, uncertain: true } : original(key, value, options);
  const failed = await draft(f); assert.equal(failed.failure, 'uncertain');
  blocked = false;
  const recovered = await f.run('RecoverMarketingIntentV1', { intentKey: f.requests[0].Title, kind: 'draft' });
  assert.equal(recovered.kind, 'saved', JSON.stringify(recovered)); assert.equal(f.providerCalls(), 1);
  assert.equal((await f.store.keys('envelope:')).length, 1);
});

test('dispatcher blocks altered ingress, cross-author recovery, wrong review kind and permission-denied sources', async () => {
  const f = await fixture(Runtime), b = await draft(f);
  const row = f.enqueue('ListArtifactsV1', { workId: 'CW-OFFLINE_TEST' }); row.EditorId = 8;
  await assert.rejects(f.runtime().execute(row.Id), /immutable/i);
  await assert.rejects(f.run('RecoverMarketingIntentV1', { intentKey: f.requests[0].Title, kind: 'draft' }, 9), /denied/i);
  assert.equal((await f.run('RequestReviewV1', { target: ref(b.envelope), reviewKind: 'communicationsSend' })).failure, 'unauthorizedReviewer');
  f.setSpHook(async (method, url) => url.includes('getUserEffectivePermissions') ? { status: 403, body: {} } : undefined);
  assert.equal(await f.run('ReadSourceExcerptV1', { reference: { sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag } }), null);
});
test('result publication requires readback of private Author-only ACLs', async () => {
  const f = await fixture(Runtime);
  f.setSpHook(async (method, url) => method === 'GET' && url.includes('RoleAssignments') ? { status: 200, body: { HasUniqueRoleAssignments: false, RoleAssignments: [] } } : undefined);
  await assert.rejects(f.run('ListArtifactsV1', { workId: 'CW-OFFLINE_TEST' }), /projection.*grant|ACL/i);
});
module.exports = { Runtime, draft };
