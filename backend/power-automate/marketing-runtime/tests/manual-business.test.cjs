'use strict';
const { test } = require('node:test');
const { assert, load } = require('./helpers.cjs');
const { fixture } = require('./runtime-fixture.cjs');
const m = require('./manual-fixture.cjs');
async function browser() {
  const f = await fixture(), references = new Map(), posts = []; let hidden = false;
  const session = { actorId: f.actors[7], tenantScope: f.config.siteUrl, resolution: { resolution: 'resolved', roles: ['employee', 'marketingParticipant'] } };
  const options = { binding: f.config, session, pollAttempts: 1, references: { getItem: k => references.get(k) ?? null, setItem: (k,v) => references.set(k,v), removeItem: k => references.delete(k) }, http: { request: async (method,url,body) => {
    if (method === 'POST') { posts.push(body); const row = f.enqueue(body.Operation, JSON.parse(body.PayloadJson)); row.Title = body.Title; await f.runtime().execute(row.Id); return { status: 201, body: { Id: row.Id } }; }
    return hidden ? { status: 200, body: { value: [] } } : f.sp.request(method,url,body);
  } } };
  return { f, references, posts, session, options, hide: value => { hidden = value; }, services: () => load('services/marketing/businessServices').createBusinessMarketingServices(options) };
}
test('business facade work selector and manual save execute through the real dispatcher and guarded readback', async () => {
  const b = await browser(), services = b.services();
  assert.equal(typeof services.listWork, 'function'); assert.equal(typeof services.saveManualDraft, 'function');
  assert.deepEqual(await services.listWork(), [m.workId]);
  assert.equal(b.posts[0].Operation, 'ListMarketingWorkV1'); assert.equal(b.posts[0].PayloadJson, '{}');
  const saved = await services.saveManualDraft(b.session, m.brief(b.f));
  assert.equal(saved.kind, 'saved', JSON.stringify(saved)); assert.equal(saved.envelope.providerProvenance.mode, 'manual');
  assert.equal(b.references.size, 0); assert.equal(b.f.providerCalls(), 0);
  const before = b.posts.length;
  assert.equal((await services.saveManualDraft(b.session, { ...m.brief(b.f), payload: { ...m.brief(b.f).payload, createdBy: 'forged' } })).kind, 'failed');
  assert.equal(b.posts.length, before, 'Invalid manual payload must not dispatch or retain a mutation reference.');
});
test('manual mutation and recovery reuse original opaque IDs across reload and never repeat a write', async () => {
  const b = await browser(); b.hide(true);
  const input = m.brief(b.f);
  assert.equal((await b.services().saveManualDraft(b.session, input)).failure, 'uncertain');
  const held = JSON.parse([...b.references.values()][0]);
  assert.equal(held.operation, 'SaveManualMarketingDraftV1');
  assert.ok(!JSON.stringify([...b.references]).includes(input.payload.objective));
  await b.services().saveManualDraft(b.session, input); assert.equal(b.posts.length, 1);
  assert.equal((await b.services().recoverPending(false)).kind, 'pending'); assert.equal(b.posts.length, 1);
  await b.services().recoverPending(true); await b.services().recoverPending(true);
  assert.equal(b.posts.length, 2); assert.deepEqual(JSON.parse(b.posts[1].PayloadJson), { intentKey: held.id, kind: 'draft' });
  assert.equal(JSON.parse([...b.references.values()][0]).recoveryId, b.posts[1].Title);
  b.hide(false); assert.equal((await b.services().recoverPending(false)).kind, 'recovered');
  assert.equal(b.references.size, 0); assert.equal((await b.f.store.keys('envelope:')).length, 1); assert.equal(b.f.providerCalls(), 0);
});
test('manual facade retains its reference for hash-valid but wrong-provenance responses', async () => {
  const b = await browser(), request = b.options.http.request;
  b.options.http.request = async (...args) => {
    const r = await request(...args);
    if (args[0] === 'GET') for (const row of r.body.value ?? []) {
      const projected = JSON.parse(row.ResultJson);
      projected.value.envelope.providerProvenance = { ...projected.value.envelope.providerProvenance, mode: 'qualified', provider: 'forged', model: 'forged', qualificationReceiptRef: 'QUAL-FORGED' };
      projected.valueHash = await load('content/actionEnvelope').payloadHash(projected.value);
      row.ResultJson = JSON.stringify(projected);
    }
    return r;
  };
  assert.equal((await b.services().saveManualDraft(b.session, m.brief(b.f))).kind, 'failed');
  assert.equal(b.references.size, 1);
  assert.equal((await b.services().recoverPending(false)).kind, 'pending');
  assert.equal(b.references.size, 1);
});
module.exports = { browser };
