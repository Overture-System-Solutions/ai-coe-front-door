'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const base = path.join(root, 'src/webparts/aiCoeFrontDoor');
const load = name => require(path.join(base, name + '.ts'));
const { createSyntheticMarketingServices } = load('services/marketing/marketingServices');
const { MemoryStorageBackend } = load('services/marketing/artifactStore');
const { FIXTURE_REGISTER, FIXTURE_MEETING_NOTES } = load('content/marketing/sourceRegister');
const actor = { actorId: 'regression-author (synthetic)', tenantScope: 'https://example.invalid/audit', resolution: { roles: ['employee', 'marketingParticipant'], resolution: 'resolved' } };
const workId = 'CW-SYNTHETIC_AUDIT';
const sourceIds = FIXTURE_REGISTER.entries.map(e => e.id);
const options = { now: () => new Date('2026-09-23T12:00:00Z') };
let intent = 0;
const setup = (backend = new MemoryStorageBackend()) => createSyntheticMarketingServices(backend, options);
const ref = e => ({ kind: e.kind, artifactId: e.artifactId, revision: e.revision, payloadHash: e.payloadHash });
async function brief(s, artifactId) { const r = await s.draft.draftCampaignBrief(actor, { workId, artifactId, objective: 'Explain the reviewed service (synthetic).', audienceContext: ['Team leads (synthetic)'], sourceIds }); assert.equal(r.kind, 'saved', JSON.stringify(r)); return r; }
async function request(s, b, kind = 'strategyVoice') { const r = await s.review.requestReview(actor, ref(b.envelope), kind); assert.equal(r.kind, 'recorded', JSON.stringify(r)); return r; }
async function decide(s, b, kind = 'strategyVoice', key = `regression:${++intent}`) { const binding = { strategyVoice: 'marketing', copyChannel: 'communications', communicationsSend: 'communications', meetingDecisionsActions: 'meeting' }[kind]; const reviewer = await s.review.assumeSyntheticReviewer(actor, `synthetic:${binding}-owner`); const held = await s.review.getArtifact(b.envelope.artifactId); return s.review.recordReviewDecision(reviewer, { target: ref(b.envelope), reviewKind: kind, outcome: 'accept', comments: 'Synthetic test only.', expectedStoreVersion: held.storeVersion, idempotencyKey: key }); }
async function accept(s, b, kind = 'strategyVoice') { await request(s, b, kind); const r = await decide(s, b, kind); assert.equal(r.kind, 'recorded', JSON.stringify(r)); assert.equal(r.state, 'accepted'); return r; }
module.exports = { fs, path, assert, root, load, actor, workId, sourceIds, options, setup, brief, request, decide, accept, ref, MemoryStorageBackend, FIXTURE_MEETING_NOTES };
