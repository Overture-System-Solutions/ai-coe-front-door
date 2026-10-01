'use strict';
const { test } = require('node:test');
const { assert } = require('./helpers.cjs');
const { fixture } = require('./runtime-fixture.cjs');
const m = require('./manual-fixture.cjs');
for (const [label, mutate] of Object.entries({
  malformed: r => ({ ...r, payload: { objective: 'Incomplete' } }),
  wrongKind: r => ({ ...r, kind: 'contentPlan' }),
  wrongWork: r => ({ ...r, workId: 'CW-NOT_ALLOWED' }),
  metadata: r => ({ ...r, payload: { ...r.payload, workId: 'CW-FORGED' } }),
  state: r => ({ ...r, payload: { ...r.payload, state: 'accepted' } }),
  identity: r => ({ ...r, payload: { ...r.payload, createdBy: 'forged' } }),
  permissions: r => ({ ...r, payload: { ...r.payload, permissions: ['owner'] } }),
  provenance: r => ({ ...r, payload: { ...r.payload, providerProvenance: { mode: 'qualified' } } }),
  receipt: r => ({ ...r, payload: { ...r.payload, receiptRefs: ['FORGED'] } }),
  pin: r => ({ ...r, payload: { ...r.payload, message: [{ text: 'Unverified', sources: [{ sourceId: r.sourceIds[0], versionOrETag: 'wrong' }] }] } })
})) test(`manual ${label} input cannot create an artifact`, async () => {
  const f = await fixture(); let result;
  try { result = await f.run('SaveManualMarketingDraftV1', mutate(m.brief(f))); } catch (error) { result = { kind: 'failed' }; }
  assert.equal(result.kind, 'failed', JSON.stringify(result)); assert.equal((await f.store.keys('envelope:')).length, 0); assert.equal(f.providerCalls(), 0);
});
test('manual revisions require own artifact, same work/kind and explicit current version', async () => {
  const f = await fixture(), b = await f.run('SaveManualMarketingDraftV1', m.brief(f));
  const revise = { ...m.brief(f), artifactId: b.envelope.artifactId, expectedStoreVersion: b.storeVersion };
  await assert.rejects(f.run('SaveManualMarketingDraftV1', { ...revise, expectedStoreVersion: undefined }), /version|schema/i);
  await assert.rejects(f.run('SaveManualMarketingDraftV1', revise, 9), /access/i);
  assert.equal((await f.run('SaveManualMarketingDraftV1', revise, 8)).kind, 'failed', 'Reviewer cannot revise another author content.');
  assert.equal((await f.run('SaveManualMarketingDraftV1', { ...revise, kind: 'contentPlan' })).kind, 'failed');
  const member = JSON.parse((await f.store.read('member:7')).value);
  await f.save('member:7', { ...member, workIds: [m.workId, 'CW-SECOND_WORK'] });
  assert.equal((await f.run('SaveManualMarketingDraftV1', { ...revise, workId: 'CW-SECOND_WORK' })).kind, 'failed');
  assert.equal((await f.store.keys('envelope:')).length, 1);
});
test('manual recovery refuses newly revoked sources rather than completing a pending revision', async () => {
  const f = await fixture(), original = f.store.write.bind(f.store); let blocked = true;
  f.store.write = async (key,value,options) => blocked && key.startsWith('envelope:') ? { ok: false, uncertain: true } : original(key,value,options);
  const failed = await f.run('SaveManualMarketingDraftV1', m.brief(f)); assert.equal(failed.failure, 'uncertain');
  blocked = false;
  const source = JSON.parse((await f.store.read('source:' + f.entry.id)).value);
  await f.save('source:' + f.entry.id, { ...source, revoked: true });
  const recovered = await f.run('RecoverMarketingIntentV1', { kind: 'draft', intentKey: f.requests[0].Title });
  assert.equal(recovered.kind, 'failed', JSON.stringify(recovered));
  assert.equal((await f.store.keys('envelope:')).length, 0); assert.equal(f.providerCalls(), 0);
});
test('manual commit rechecks member enablement after the durable intent boundary', async () => {
  const f = await fixture(), original = f.store.write.bind(f.store);
  f.store.write = async (key,value,options) => { const result = await original(key,value,options); if (key.startsWith('intent:saveRevision:')) { const member = JSON.parse((await f.store.read('member:7')).value); await f.save('member:7', { ...member, enabled: false }); } return result; };
  await assert.rejects(f.run('SaveManualMarketingDraftV1', m.brief(f)), /membership|authorized/i);
  assert.equal((await f.store.keys('envelope:')).length, 0);
});
