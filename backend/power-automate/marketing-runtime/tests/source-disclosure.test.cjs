'use strict';
// Safety regressions derived from independent IR-01/IR-02 probes; all external boundaries are offline fakes.
const { test } = require('node:test');
const { assert, path, root } = require('./helpers.cjs');
const { fixture } = require('./runtime-fixture.cjs');
const packageRoot = process.env.MARKETING_PACKAGE_ROOT;
const { MarketingRuntime } = require(packageRoot ? path.join(packageRoot, 'server/runtime.cjs') : '../server/runtime.cjs');
class Runtime extends MarketingRuntime { constructor(o) { super({ ...o, ...(packageRoot ? { shared: undefined } : { schemaFor: kind => require(path.join(root, 'src/webparts/aiCoeFrontDoor/content/marketing/schemas', { campaignBrief: 'campaign-brief.v1.json', contentPlan: 'content-plan.v1.json', meetingFollowThrough: 'meeting-follow-through.v1.json' }[kind])) }) }); } }
for (const boundary of ['sourceRecord', 'registerRevoked', 'registerApproval', 'permission', 'audience', 'version']) test(`IR-01 completed source replay and new recovery refuse current ${boundary} revocation`, async () => {
  const f = await fixture(Runtime), payload = { reference: { sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag } };
  const row = f.enqueue('ReadSourceExcerptV1', payload);
  assert.equal(typeof (await f.runtime().execute(row.Id)).value.excerpt, 'string');
  const source = JSON.parse((await f.store.read('source:' + f.entry.id)).value), register = JSON.parse((await f.store.read('register:active')).value);
  if (boundary === 'sourceRecord') await f.save('source:' + f.entry.id, { ...source, revoked: true });
  if (boundary === 'registerRevoked') await f.save('register:active', { ...register, revoked: [f.entry.id] });
  if (boundary === 'registerApproval') await f.save('register:active', { ...register, evidence: { ...register.evidence, expiresAt: null } });
  if (boundary === 'permission') f.setSpHook(async (method,url) => url.includes('getUserEffectivePermissions') ? { status: 403, body: {} } : undefined);
  if (boundary === 'audience') { const member = JSON.parse((await f.store.read('member:7')).value); await f.save('member:7', { ...member, audience: 'Another audience' }); }
  if (boundary === 'version') await f.save('source:' + f.entry.id, { ...source, entry: { ...source.entry, versionOrETag: 'changed' } });
  assert.equal(await f.run('ReadSourceExcerptV1', payload), null);
  const count = f.projections.length;
  await assert.rejects(f.runtime().execute(row.Id), /source|disclos|revalid/i);
  await assert.rejects(f.run('RecoverMarketingIntentV1', { intentKey: row.Title, kind: 'draft' }), /source|disclos|recover/i);
  assert.equal(f.projections.length, count); assert.equal(f.providerCalls(), 0);
});
test('IR-02 source revoked during byte retrieval is never offered to the provider', async () => {
  const f = await fixture(Runtime); let revoked = false;
  f.setSpHook(async (method,url) => { if (!revoked && url.endsWith('/$value')) { revoked = true; const source = JSON.parse((await f.store.read('source:' + f.entry.id)).value); await f.save('source:' + f.entry.id, { ...source, revoked: true }); } });
  const result = await f.run('DraftCampaignBriefV1', { workId: 'CW-OFFLINE_TEST', objective: 'Offline security regression', audienceContext: ['Marketing team'], sourceIds: [f.entry.id] });
  assert.equal(revoked, true); assert.equal(f.providerCalls(), 0); assert.equal(result.kind, 'failed'); assert.equal((await f.store.keys('envelope:')).length, 0);
});
test('IR-02 provider-intent boundary refreshes source access before invoking the connector', async () => {
  const f = await fixture(Runtime), write = f.store.write.bind(f.store);
  f.store.write = async (key,value,options) => { const r = await write(key,value,options); if (key.startsWith('provider:')) { const source = JSON.parse((await f.store.read('source:' + f.entry.id)).value); await f.save('source:' + f.entry.id, { ...source, revoked: true }); } return r; };
  await f.run('DraftCampaignBriefV1', { workId: 'CW-OFFLINE_TEST', objective: 'Offline late security regression', audienceContext: ['Marketing team'], sourceIds: [f.entry.id] });
  assert.equal(f.providerCalls(), 0); assert.equal((await f.store.keys('envelope:')).length, 0);
});
