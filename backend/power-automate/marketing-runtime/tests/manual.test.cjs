'use strict';
const { test } = require('node:test');
const { assert, load, ref } = require('./helpers.cjs');
const { fixture } = require('./runtime-fixture.cjs');

const workId = 'CW-OFFLINE_TEST';
const manualBrief = f => ({ workId, kind: 'campaignBrief', sourceIds: [f.entry.id], payload: {
  objective: 'Hand-authored offline example', audience: ['Marketing team'], painPoints: ['Unconfirmed ownership'],
  message: [{ text: 'Participants agreed to review the draft.', sources: [{ sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag }] }],
  channelPlan: ['Internal review only'], contentCalendar: [], evidenceGaps: ['Offline invented fixture'], reviewNeeds: ['Strategy and voice review']
} });

// External identities, memberships, SharePoint and approvals are explicitly OFFLINE fixtures.
test('manual brief uses the real source gate and immutable repository without any provider call', async () => {
  const f = await fixture();
  const b = await f.run('SaveManualMarketingDraftV1', manualBrief(f));
  assert.equal(b.kind, 'saved', JSON.stringify(b)); assert.equal(b.state, 'draft');
  assert.equal(b.envelope.providerProvenance.mode, 'manual');
  assert.equal(b.envelope.providerProvenance.provider, 'human');
  assert.equal(b.envelope.providerProvenance.model, 'none');
  assert.equal(b.envelope.providerProvenance.qualificationReceiptRef, null);
  assert.equal(b.envelope.createdBy, f.actors[7]); assert.equal(b.envelope.testRecord, false);
  assert.equal(b.envelope.payload.objective, manualBrief(f).payload.objective);
  assert.equal(b.envelope.sourcesUsed[0].sourceId, f.entry.id);
  const read = await f.run('GetArtifactV1', { artifactId: b.envelope.artifactId });
  assert.deepEqual(read.envelope, b.envelope);
  const receipt = JSON.parse((await f.store.read('receipt:' + b.envelope.receiptRefs[0])).value);
  assert.equal(receipt.result, 'PASS'); assert.equal(receipt.readbackHash, b.envelope.payloadHash);
  assert.equal(f.providerCalls(), 0);
});
test('manual revisions reject stale tokens even when distinct immutable SharePoint rows share an ETag', async () => {
  const f = await fixture(), read = f.store.read.bind(f.store);
  f.store.read = async key => { const r = await read(key); return r && key.startsWith('envelope:') ? { ...r, version: '\"1\"' } : r; };
  const b = await f.run('SaveManualMarketingDraftV1', manualBrief(f));
  const update = { ...manualBrief(f), artifactId: b.envelope.artifactId, expectedStoreVersion: b.storeVersion };
  const next = await f.run('SaveManualMarketingDraftV1', { ...update, payload: { ...update.payload, objective: 'Human revision two' } });
  assert.equal(next.kind, 'saved'); assert.equal(next.envelope.revision, 2);
  const stale = await f.run('SaveManualMarketingDraftV1', update);
  assert.equal(stale.failure, 'staleVersion', JSON.stringify(stale));
  assert.equal((await f.store.keys('envelope:')).length, 2);
});

test('manual content-plan and follow-through use verified accepted parents and every normal review kind', async () => {
  const f = await fixture(), m = require('./manual-fixture.cjs');
  const b = await f.run('SaveManualMarketingDraftV1', m.brief(f));
  const accepted = await m.accept(f, b, 'strategyVoice');
  const p = await f.run('SaveManualMarketingDraftV1', m.plan(f, b, accepted.receipt.receiptId));
  assert.equal(p.kind, 'saved', JSON.stringify(p)); assert.equal(p.state, 'draft');
  assert.deepEqual(p.envelope.parents, [ref(b.envelope)]);
  await m.accept(f, p, 'copyChannel');
  const follow = await f.run('SaveManualMarketingDraftV1', m.follow(f, b, p));
  assert.equal(follow.kind, 'saved', JSON.stringify(follow)); assert.equal(follow.state, 'draft');
  assert.equal((await m.accept(f, follow, 'meetingDecisionsActions')).state, 'reviewRequested');
  assert.equal((await m.accept(f, follow, 'communicationsSend')).state, 'accepted');
  const revised = await f.run('SaveManualMarketingDraftV1', { ...m.brief(f), artifactId: b.envelope.artifactId, expectedStoreVersion: b.storeVersion });
  assert.equal(revised.kind, 'saved'); assert.equal(revised.state, 'draft');
  assert.equal((await f.run('GetArtifactV1', { artifactId: p.envelope.artifactId })).state, 'revalidationRequired');
  const stale = await f.run('SaveManualMarketingDraftV1', m.plan(f, b, accepted.receipt.receiptId));
  assert.equal(stale.failure, 'prerequisiteNotAccepted');
  assert.equal(f.providerCalls(), 0);
});

test('authorized work selector reads only the current verified Author member workIds', async () => {
  const f = await fixture();
  const before = JSON.parse((await f.store.read('member:7')).value);
  await f.save('member:7', { ...before, workIds: ['CW-OFFLINE_TEST', 'CW-OFFLINE_TEST', 'CW-SECOND_TEST'] });
  await f.save('member:9', { ...before, actorId: f.actors[9], workIds: ['CW-PRIVATE_OTHER'] });
  assert.deepEqual(await f.run('ListMarketingWorkV1', {}), ['CW-OFFLINE_TEST', 'CW-SECOND_TEST']);
  assert.deepEqual(await f.run('ListMarketingWorkV1', {}, 9), ['CW-PRIVATE_OTHER']);
  await assert.rejects(f.run('ListMarketingWorkV1', { actorId: f.actors[9] }), /schema|authority/i);
  await f.save('member:7', { ...before, workIds: ['CW-OFFLINE_TEST', 'not canonical'] });
  await assert.rejects(f.run('ListMarketingWorkV1', {}), /work|canonical/i);
  await f.save('member:7', { ...before, enabled: false });
  await assert.rejects(f.run('ListMarketingWorkV1', {}), /membership/i);
  assert.equal(f.providerCalls(), 0);
});
