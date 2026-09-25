'use strict';
const { test } = require('node:test');
const { assert, path, load } = require('./helpers.cjs');
const fs = require('node:fs');
const crypto = require('node:crypto');

test('executable dispatcher derives identity from request Author and rejects payload authority', async () => {
  const filename = path.join(__dirname, '../server/runtime.cjs');
  assert.ok(fs.existsSync(filename), 'executable dispatcher missing');
  const { MarketingRuntime } = require(filename);
  const { PersistentSyntheticArtifactStore, MemoryStorageBackend } = load('services/marketing/artifactStore');
  const store = new PersistentSyntheticArtifactStore(new MemoryStorageBackend());
  store.mode = 'live';
  const cfg = { enabled: true, siteUrl: 'https://example.sharepoint.com/sites/marketing', requestListId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', resultListId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', qualificationReceiptRef: 'QUAL-RUNTIME', readRoleDefinitionId: 1073741826, audience: 'Internal' };
  cfg.writerPrincipalId = 42;
  const { payloadHash } = load('content/actionEnvelope');
  await store.write('qualification:QUAL-RUNTIME', JSON.stringify({ result: 'PASS', bindingHash: await payloadHash(cfg), expiresAt: '2099-01-01T00:00:00Z' }));
  await store.write('member:7', JSON.stringify({ actorId: 'verified@example.invalid', enabled: true, roles: ['employee', 'marketingParticipant'], workIds: ['CW-OFFLINE_TEST'], audience: 'Internal' }));
  const request = { Id: 1, Title: crypto.randomUUID(), Operation: 'ListArtifactsV1', ProtocolVersion: 'marketing.v1', PayloadJson: JSON.stringify({ workId: 'CW-OFFLINE_TEST' }), AuthorId: 7, EditorId: 7, Author: { Id: 7, Email: 'verified@example.invalid', LoginName: 'i:0#.f|membership|verified@example.invalid' }, Created: '2026-09-23T12:00:00Z', Modified: '2026-09-23T12:00:00Z' };
  const published = [], sp = { request: async (method, url, body) => {
    if (url.includes(cfg.requestListId)) return { status: 200, body: request };
    if (method === 'GET' && url.includes('RoleAssignments')) return { status: 200, body: { HasUniqueRoleAssignments: true, RoleAssignments: [{ PrincipalId: 7, RoleDefinitionBindings: [{ Id: 1073741826 }] }] } };
    if (method === 'GET') return { status: 200, body: { value: published } };
    if (url.includes('roleassignments') || url.includes('breakroleinheritance')) return { status: 200, body: {} };
    const row = { Id: 1, ...body }; published.push(row); return { status: 201, body: row };
  } };
  const runtime = new MarketingRuntime({ config: cfg, store, sp, shared: load, now: () => new Date('2026-09-23T13:00:00Z') });
  const result = await runtime.execute(1);
  assert.deepEqual(result.value, []); assert.equal(result.actorId, request.Author.Email);
  assert.equal(published.length, 1);
  request.Title = crypto.randomUUID(); request.PayloadJson = JSON.stringify({ workId: 'CW-OFFLINE_TEST', actorId: 'administrator', resolution: { roles: ['marketingReviewer'] } });
  await assert.rejects(runtime.execute(1), /unknown|authority|schema/i);
  assert.equal(published.length, 1);
});
