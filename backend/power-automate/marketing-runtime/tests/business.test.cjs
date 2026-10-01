'use strict';
const { test } = require('node:test');
const { assert, load, actor } = require('./helpers.cjs');
const crypto = require('node:crypto');
const requestListId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const resultListId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const session = { ...actor, tenantScope: 'https://example.sharepoint.com/sites/marketing' };
const binding = { siteUrl: session.tenantScope, requestListId, resultListId, qualificationReceiptRef: 'QUAL-OFFLINE-TEST', enabled: true };
function fakeHttp() {
  const calls = [], rows = [];
  return { calls, rows, request: async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'POST') { const p = JSON.parse(body.PayloadJson); const value = []; rows.push({ RequestId: body.Title, ResultJson: JSON.stringify({ protocol: 'marketing.v1', requestId: body.Title, operation: body.Operation, tenantScope: session.tenantScope, actorId: session.actorId, value, valueHash: crypto.createHash('sha256').update('[]').digest('hex') }) }); return { status: 201, body: { Id: 1 } }; }
    return { status: 200, body: { value: rows } };
  } };
}

test('business factory uses immutable ingress, no client authority and fresh read ids across restart', async () => {
  const mod = load('services/marketing/marketingServices');
  assert.equal(typeof mod.createBusinessMarketingServices, 'function', 'typed server-backed factory is missing');
  const http = fakeHttp();
  const first = mod.createBusinessMarketingServices({ binding, session, http });
  assert.equal(first.mode, 'live');
  await first.review.listArtifacts('CW-OFFLINE_TEST');
  await mod.createBusinessMarketingServices({ binding, session, http }).review.listArtifacts('CW-OFFLINE_TEST');
  const posts = http.calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 2); assert.notEqual(posts[0].body.Title, posts[1].body.Title);
  assert.ok(posts.every(c => !/actorId|tenantScope|authority|resolution|roles/.test(c.body.PayloadJson)));
  assert.ok(http.calls.every(c => !/localStorage|canonical/i.test(c.url)));
});
