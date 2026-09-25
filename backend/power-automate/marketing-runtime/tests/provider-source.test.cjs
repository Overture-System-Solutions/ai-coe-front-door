'use strict';
const { test } = require('node:test');
const { assert, path, load } = require('./helpers.cjs');
const fs = require('node:fs');

test('qualified provider uses frozen Claude wire shape and refuses truncation/tool/refusal', async () => {
  const filename = path.join(__dirname, '../server/provider.cjs');
  assert.ok(fs.existsSync(filename), 'server provider implementation missing');
  const { decodeProviderResponse, createClaudeProvider } = require(filename);
  const reply = { id: 'msg-test', type: 'message', role: 'assistant', model: 'qualified-model', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"schemaVersion":"1.0"}' }] };
  assert.deepEqual(decodeProviderResponse('claude', reply).payload, { schemaVersion: '1.0' });
  for (const bad of [{ ...reply, stop_reason: 'max_tokens' }, { ...reply, stop_details: { type: 'refusal' } }, { ...reply, content: [{ type: 'tool_use' }] }]) assert.throws(() => decodeProviderResponse('claude', bad));
  assert.throws(() => decodeProviderResponse('openai', { status: 'incomplete' }));
  let input;
  const p = createClaudeProvider({ model: 'qualified-model', qualificationReceiptRef: 'QUAL-PROVIDER', schemaFor: () => ({ type: 'object' }), invoke: async body => { input = body; return reply; } });
  const out = await p.draft({ operation: 'campaignBrief', artifactId: 'BRIEF-TEST', workId: 'CW-OFFLINE_TEST', permittedSources: [], inputs: {}, policy: {}, requestId: 'REQ-TEST' });
  assert.equal(input['body/stream'], false); assert.equal(input['body/thinking/type'], 'disabled'); assert.equal(input['body/max_tokens'], 1600);
  assert.equal(input['body/output_config/format/type'], 'json_schema'); assert.equal(out.qualificationReceiptRef, 'QUAL-PROVIDER');
});

test('server source retrieval pins permission, ETag and content hash instead of client text', async () => {
  const filename = path.join(__dirname, '../server/source-registry.cjs');
  assert.ok(fs.existsSync(filename), 'server source registry implementation missing');
  const { ServerSourceRegistry } = require(filename), { sha } = require('../server/sharepoint.cjs');
  const f = await require('./runtime-fixture.cjs').fixture();
  const entry = f.entry, store = f.store;
  const retained = JSON.parse((await store.read('source:' + entry.id)).value);
  await f.save('source:' + entry.id, { ...retained, contentHash: sha('retained approved text') });
  let changed = false;
  const sp = { request: async (method, url) => url.includes('getUserEffectivePermissions') ? { status: 200, body: { GetUserEffectivePermissions: { Low: '33' } } } : url.endsWith('/$value') ? { status: 200, body: 'retained approved text', etag: changed ? '"v2"' : '"v1"' } : { status: 200, body: { ETag: '"v1"' } } };
  const registry = new ServerSourceRegistry({ store, sp, shared: load, siteUrl: f.config.siteUrl, actorId: f.actors[7], loginName: 'i:0#.f|membership|' + f.actors[7], purpose: 'meetingFollowThrough', audience: 'Marketing team', now: () => new Date('2026-09-23T13:00:00Z') });
  const ref = { sourceId: entry.id, versionOrETag: entry.versionOrETag };
  assert.equal((await registry.readExcerpt(ref, entry)).excerpt, 'retained approved text');
  changed = true; assert.equal(await registry.readExcerpt(ref, entry), undefined);
});
