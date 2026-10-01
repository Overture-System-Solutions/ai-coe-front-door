'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const load = require('./audit-source-loader.cjs');
const {createSyntheticCoreWorkService} = load('services/core/coreWorkService.ts');
const {MemoryStorageBackend} = load('services/marketing/artifactStore.ts');
const session = {actorId:'audit@example.invalid',tenantScope:'https://example.invalid/synthetic'};
const s1 = {Title:'Synthetic work',SourceChannel:'FRONT_DOOR',ProblemStatement:'Manual copying.',DesiredOutcome:'Reviewed result.',Requester:session.actorId,Sponsor:'Synthetic sponsor',DataClassification:'INTERNAL'};
function ok(result) {assert.equal(result.kind,'ok',JSON.stringify(result));return result;}
test('a new status read after restart cannot replay a historical completed read',async()=>{
 const backend=new MemoryStorageBackend();
 const first=createSyntheticCoreWorkService(session.actorId,{backend});
 const work=ok(await first.createOrResume(session,{s1})).work;
 const before=ok(await first.getStatus(session,work.workId));
 const packet=(await first.listPackets(session,work.workId)).packets[0];
 const update=ok(await first.submitEvidence(session,{workId:work.workId,evidencePacketId:packet.packetId,response:'Synthetic facts.',knownAssumedUnknown:'KNOWN'}));
 const restarted=createSyntheticCoreWorkService(session.actorId,{backend});
 const after=ok(await restarted.getStatus(session,work.workId));
 assert.equal(after.work.version,update.work.version);
 assert.notEqual(after.observation.handle.key.key,before.observation.handle.key.key);
});

test('clarification updates the same canonical work and clears completed S1 gaps',async()=>{
 const service=createSyntheticCoreWorkService(session.actorId);
 const incomplete={...s1}; delete incomplete.ProblemStatement; delete incomplete.Sponsor;
 const created=ok(await service.createOrResume(session,{s1:incomplete}));
 const resumed=ok(await service.createOrResume(session,{workId:created.work.workId,s1}));
 assert.equal(resumed.work.workId,created.work.workId);
 assert.equal(resumed.work.state,'READY_FOR_TRIAGE');
 assert.deepEqual(resumed.work.openEvidenceGaps,[]);
 assert.equal(resumed.work.version,created.work.version+1);
});

test('material S1 edits invalidate returned evidence and cached readiness',async()=>{
 const service=createSyntheticCoreWorkService(session.actorId);
 const work=ok(await service.createOrResume(session,{s1})).work;
 for (const packet of (await service.listPackets(session,work.workId)).packets) {
  ok(await service.submitEvidence(session,{workId:work.workId,evidencePacketId:packet.packetId,response:'Synthetic facts.',knownAssumedUnknown:'KNOWN'}));
 }
 const ready=ok(await service.requestReadiness(session,work.workId));
 assert.equal(ready.work.state,'READY_FOR_ARB');
 ok(await service.createOrResume(session,{workId:work.workId,s1:{...s1,ProblemStatement:'Different scope requiring revalidation.'}}));
 const after=ok(await service.requestReadiness(session,work.workId));
 assert.equal(after.work.state,'NOT_DECISION_READY');
 assert.notEqual(after.observation.handle.key.key,ready.observation.handle.key.key);
 assert.ok((await service.listPackets(session,work.workId)).packets.every(p=>p.status==='OPEN'));
});
