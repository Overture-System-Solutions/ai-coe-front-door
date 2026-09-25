'use strict';
// ALL identities, approval records, SharePoint responses and provider replies below are OFFLINE TEST FAKES.
const { load } = require('./helpers.cjs');
const { randomUUID } = require('node:crypto');
const { MarketingRuntime } = require('../server/runtime.cjs');
const { sha } = require('../server/sharepoint.cjs');
async function fixture(Runtime = MarketingRuntime, shared = load) {
  const { PersistentSyntheticArtifactStore, MemoryStorageBackend } = load('services/marketing/artifactStore');
  const store = new PersistentSyntheticArtifactStore(new MemoryStorageBackend()); store.mode = 'live';
  const config = { enabled: true, siteUrl: 'https://example.sharepoint.com/sites/marketing', canonicalListId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', requestListId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resultListId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', qualificationReceiptRef: 'QUAL-RUNTIME', readRoleDefinitionId: 1073741826, provider: { model: 'OFFLINE-FAKE-MODEL', qualificationReceiptRef: 'QUAL-PROVIDER' } };
  config.writerPrincipalId = 42;
  const now = () => new Date('2026-09-23T13:00:00Z');
  const { payloadHash } = load('content/actionEnvelope');
  const save = async (key, value) => { const before = await store.read(key); return store.write(key, JSON.stringify(value), before ? { expectedVersion: before.version } : { ifAbsent: true }); };
  for (const [ref, binding] of [['QUAL-RUNTIME', config], ['QUAL-PROVIDER', config.provider]]) await save(`qualification:${ref}`, { result: 'PASS', bindingHash: await payloadHash(binding), expiresAt: '2099-01-01T00:00:00Z' });
  const actors = { 7: 'author@example.invalid', 8: 'reviewer@example.invalid', 9: 'other@example.invalid' };
  for (const [id, actorId] of Object.entries(actors)) await save(`member:${id}`, { actorId, enabled: true, roles: ['employee', id === '8' ? 'marketingReviewer' : 'marketingParticipant'], workIds: ['CW-OFFLINE_TEST'], audience: 'Marketing team' });
  const entry = { id: 'SRC-BRAND-NOTES', versionOrETag: '"v1"', location: config.siteUrl + '/Approved/notes.txt', owner: 'Offline test owner', asOf: '2026-09-23', classification: 'Internal', audience: 'Marketing team', mayNotProve: 'Any real claim. This is invented offline test content.' };
  const text = 'Offline test only. Participants agreed to review the draft. Ownership has not been agreed.';
  const register = { registerId: 'REG-MARKETING', version: '1.0', approval: 'approved', asOf: '2026-09-23', entries: [entry] };
  const snapshotHash = await load('content/marketing/sourceGate').registerSnapshotHash(register), snapshotRef = 'snapshot:REG-MARKETING:1.0';
  const evidence = { receiptId: 'RCPT-REGISTER', registerId: register.registerId, registerVersion: register.version, snapshotHash, approvedByBindingRef: 'register-owner', approvedAt: '2026-09-23T12:00:00Z', expiresAt: '2099-01-01T00:00:00Z', source: 'authenticatedReadback' };
  await save('register:active', { register, snapshotRef, evidence, revoked: [] });
  await save('authority:register-owner', { bindingRef: 'register-owner', actorId: actors[8], scope: ['sourceRegister'], synthetic: false, revoked: false, tenantScope: config.siteUrl, expiresAt: '2099-01-01T00:00:00Z' });
  await save('receipt:RCPT-REGISTER', { receiptId: 'RCPT-REGISTER', operation: 'approveSourceRegister', actorId: actors[8], result: 'PASS', targetRef: snapshotRef, payloadHash: snapshotHash, readbackHash: snapshotHash });
  await save('source:SRC-BRAND-NOTES', { entry, actors: Object.values(actors), purposes: ['campaignBrief', 'contentPlan', 'meetingFollowThrough'], audiences: ['Marketing team'], contentHash: sha(text), revoked: false });
  await save('authority:reviewer', { bindingRef: 'reviewer', actorId: actors[8], label: 'Offline reviewer', scope: ['strategyVoice', 'copyChannel', 'meetingDecisionsActions', 'communicationsSend'], synthetic: false, revoked: false, tenantScope: config.siteUrl, expiresAt: '2099-01-01T00:00:00Z' });
  const requests = [], projections = [], calls = []; let providerCalls = 0, providerHook, spHook;
  const sp = { request: async (method, url, body, headers) => {
    calls.push({ method, url });
    const hooked = spHook ? await spHook(method, url, body, headers) : undefined; if (hooked) return hooked;
    if (url.includes(config.requestListId)) { const id = Number(/items\((\d+)\)/.exec(url)?.[1]); return { status: 200, body: requests.find(r => r.Id === id) }; }
    if (url.includes(config.resultListId)) {
      if (method === 'GET' && url.includes('RoleAssignments')) { const id = Number(/items\((\d+)\)/.exec(url)?.[1]); return { status: 200, body: { HasUniqueRoleAssignments: true, RoleAssignments: [{ PrincipalId: projections.find(r => r.Id === id).VerifiedAuthorId, RoleDefinitionBindings: [{ Id: 1073741826 }] }, { PrincipalId: 42, RoleDefinitionBindings: [{ Id: 1073741829 }] }] } }; }
      if (method === 'GET') { const id = /RequestId eq '([^']+)'/.exec(decodeURIComponent(url))?.[1]; return { status: 200, body: { value: projections.filter(r => r.RequestId === id) } }; }
      if (url.includes('roleassignments') || url.includes('breakroleinheritance')) return { status: 200, body: {} };
      const row = { Id: projections.length + 1, ...body }; projections.push(row); return { status: 201, body: row };
    }
    if (url.includes('getUserEffectivePermissions')) return { status: 200, body: { GetUserEffectivePermissions: { Low: '33' } } };
    if (url.endsWith('/$value')) return { status: 200, body: text, etag: '"v1"' };
    return { status: 200, body: { ETag: '"v1"' } };
  } };
  const invokeClaude = async wire => {
    providerCalls++;
    if (providerHook) { const value = await providerHook(wire); if (value) return value; }
    const request = JSON.parse(wire['body/messages'][0].content);
    const reply = await new (load('services/marketing/providers').SyntheticMarketingProvider)().draft(request);
    return { id: 'OFFLINE-FAKE-' + providerCalls, type: 'message', role: 'assistant', model: config.provider.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply.payload) }] };
  };
  const runtime = () => new Runtime({ config, sp, store, shared, invokeClaude, now });
  const enqueue = (operation, payload, authorId = 7) => { const row = { Id: requests.length + 1, Title: randomUUID(), Operation: operation, ProtocolVersion: 'marketing.v1', PayloadJson: JSON.stringify(payload), AuthorId: authorId, EditorId: authorId, Author: { Id: authorId, Email: actors[authorId], LoginName: 'i:0#.f|membership|' + actors[authorId] }, Created: now().toISOString(), Modified: now().toISOString() }; requests.push(row); return row; };
  return { config, sp, invokeClaude, store, save, requests, projections, calls, entry, register, evidence, actors, runtime, enqueue, providerCalls: () => providerCalls, setProviderHook: fn => { providerHook = fn; }, setSpHook: fn => { spHook = fn; }, run: async (op, p, id) => (await runtime().execute(enqueue(op, p, id).Id)).value };
}
module.exports = { fixture };
