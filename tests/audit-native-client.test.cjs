'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./audit-source-loader.cjs');
const {parseResponse}=load('services/core/coreContract.ts');
const work={WorkID:'CW-TEST01',Title:'Synthetic case',Stage:'INTAKE',State:'CLARIFYING',EmployeeStatus:'Need one answer',Lane:null,NextAction:'Complete S1',NextOwner:null,NextDate:null,Version:1,LastValidatedAt:null,OpenEvidenceGaps:['S1_SPONSOR'],DuplicateStatus:'NOT_CHECKED'};
test('v0.2.0 preserves an unvalidated null time without weakening v0.1.1',()=>{
 const response={Result:'PASS',ReceiptID:'RCPT-TEST01',Work:work};
 assert.equal(parseResponse('GetWorkStatus',response).valid,false);
 const native=parseResponse('GetWorkStatus',response,'v0.2.0');
 assert.equal(native.valid,true,native.errors.join('; '));
 assert.equal(native.value.Work.LastValidatedAt,null);
});
const requestListId='11111111-1111-4111-8111-111111111111';
const resultListId='22222222-2222-4222-8222-222222222222';
const session={actorId:'employee@example.invalid',tenantScope:'https://example.invalid/sites/pilot'};
function fixture(){
 const refs=new Map(),posts=[],results=new Map();let current={...work},readCount=0;
 const references={getItem:k=>refs.get(k)||null,setItem:(k,v)=>refs.set(k,v),removeItem:k=>refs.delete(k)};
 const response=body=>({ok:true,status:200,json:async()=>body});
 const client={
  post:async(url,config,options)=>{
   assert.ok(url.includes(requestListId),'Only immutable request ingress accepts client writes.');
   const row=JSON.parse(options.body),body=JSON.parse(row.RequestJson);posts.push(row);
   assert.deepEqual(Object.keys(row).sort(),['ContractVersion','Operation','RequestJson','TestRecord','Title','WorkID'].sort());
   assert.equal(row.ContractVersion,'v0.2.0');assert.equal(row.Title,body.Context.IdempotencyKey);
   let value={Result:'PASS',ReceiptID:'RCPT-TEST'+posts.length,Work:{...current}};
   if(row.Operation==='CreateOrResumeWork'){
    if(body.WorkID){assert.equal(body.ExpectedVersion,current.Version);current={...current,Version:current.Version+1,Title:body.S1.Title??current.Title};value.Work={...current};}
    value.Created=!body.WorkID;value.ClarificationRequired=[];
   }
   if(row.Operation==='ListMyWork')value={Result:'PASS',ReceiptID:value.ReceiptID,Items:[{...current}]};
   if(row.Operation==='ListEvidencePackets')value.Packets=[{EvidencePacketID:'EVP-TEST01',WorkID:current.WorkID,EvidenceType:'S2',Questions:['Synthetic question'],AssignedRole:'SME',AssignedPerson:session.actorId,Status:'AWAITING_RESPONSE',Applicability:'REQUIRED',Version:7,CaseContentVersion:1,Response:null,KnownAssumedUnknown:'UNKNOWN'}];
   if(row.Operation==='SubmitEvidenceResponse'){assert.equal(body.ExpectedVersion,7);value.PacketStatus='RETURNED';}
   if(row.Operation==='ValidateEvidencePacket'){assert.equal(body.ExpectedVersion,7);assert.ok(!('actorId' in body));value.PacketStatus='VALIDATED';}
   if(row.Operation==='RequestDecisionReadiness'){assert.equal(body.ExpectedVersion,current.Version);Object.assign(value,{DecisionReadinessState:'NOT_READY',BlockingGates:['HUMAN_VALIDATION'],DecisionPacketID:null});}
   results.set(row.Title,{Title:row.Title,ContractVersion:'v0.2.0',Operation:row.Operation,Published:true,Result:value.Result,ReceiptID:value.ReceiptID,ResponseJson:JSON.stringify(value),RequestItemID:posts.length,RequestAuthorID:13});
   return response({Id:posts.length});
  },
  get:async url=>{if(url.includes('/currentuser?'))return response({Id:13,Email:session.actorId});assert.ok(url.includes(resultListId),'Browser must not read canonical/request lists.');readCount++;const title=decodeURIComponent(url).match(/Title eq '([^']+)'/)[1];return response({value:results.has(title)?[results.get(title)]:[]});}
 };
 const context={siteUrl:session.tenantScope,user:{email:session.actorId,displayName:'Synthetic employee'},client,configuration:{}};
 const binding={contractVersion:'v0.2.0',requestListId,resultListId,tenantLabel:'SYNTHETIC',qualified:true,qualificationReceiptRef:'RCPT-QUALIFICATION',testRecord:true};
 return {context,binding,references,refs,posts,results,setWork:value=>{current={...current,...value}},reads:()=>readCount};
}
test('native create/read/clarification/readiness uses split ingress and fresh validated versions',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 const first=await service.createOrResume(session,{s1:{Title:'Synthetic case',SourceChannel:'FRONT_DOOR',ProblemStatement:'Synthetic confidential draft'}});
 assert.equal(first.kind,'ok',JSON.stringify(first));assert.equal(first.work.lastValidatedAt,null);
 f.setWork({Version:2,State:'EVIDENCE_BUILDING'});
 const refreshed=await service.getStatus(session,first.work.workId);assert.equal(refreshed.work.version,2);
 const all=await service.listMine(session);assert.equal(all.observation.response.Items.length,1);
 const resumed=await service.createOrResume(session,{workId:first.work.workId,s1:{Title:'Corrected synthetic case',SourceChannel:'FRONT_DOOR'}});
 assert.equal(resumed.work.workId,first.work.workId);assert.equal(resumed.work.version,3);
 const ready=await service.requestReadiness(session,first.work.workId);assert.equal(ready.observation.response.DecisionReadinessState,'NOT_READY');
 assert.equal(new Set(f.posts.map(row=>row.Title)).size,5);assert.equal(f.reads(),5);
 assert.ok(!JSON.stringify([...f.refs]).includes('Synthetic confidential draft'));
});
test('native evidence reads actual packet identities and submits the observed packet version',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 const packets=await service.listPackets(session,work.WorkID);
 assert.deepEqual(packets.unboundReasons,[]);assert.equal(packets.packets[0].currentVersion,7);
 const result=await service.submitEvidence(session,{workId:work.WorkID,evidencePacketId:'EVP-TEST01',response:'Synthetic source-bound evidence',knownAssumedUnknown:'KNOWN'});
 assert.equal(result.kind,'ok',JSON.stringify(result));assert.equal(result.observation.response.PacketStatus,'RETURNED');
 assert.equal(f.posts.length,2);assert.ok(!JSON.stringify([...f.refs]).includes('source-bound evidence'));
});
test('unknown create survives reload and recovers without another POST or browser business text',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const get=f.context.client.get,post=f.context.client.post;let hidden=true;
 f.context.client.get=async(...args)=>hidden&&!args[0].includes('/currentuser?')?{ok:true,status:200,json:async()=>({value:[]})}:get(...args);
 f.context.client.post=async(...args)=>{await post(...args);throw new Error('Synthetic lost response');};
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 const pending=await service.createOrResume(session,{s1:{Title:'Synthetic case',SourceChannel:'FRONT_DOOR',ProblemStatement:'PRIVATE-SYNTHETIC-DRAFT'}});
 assert.equal(pending.kind,'failed');assert.equal(pending.observation.phase,'queued');
 assert.ok(!JSON.stringify([...f.refs]).includes('PRIVATE-SYNTHETIC-DRAFT'));assert.equal(f.posts.length,1);
 const restarted=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 await restarted.getStatus(session,work.WorkID);assert.equal(f.posts.length,1,'A different intent cannot bypass unresolved create.');
 hidden=false;const recovered=await restarted.recoverPending(session);
 assert.equal(recovered.kind,'ok');assert.equal(recovered.created,true);assert.equal(recovered.work.workId,work.WorkID);
 assert.equal(recovered.observation.handle.request,undefined,'Recovery must not fabricate a discarded request body.');
 assert.equal(f.posts.length,1);assert.equal(f.refs.size,0);
});
test('human evidence validation uses current packet version and leaves authority to server',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 await service.listPackets(session,work.WorkID);
 const result=await service.validateEvidence(session,{workId:work.WorkID,evidencePacketId:'EVP-TEST01',disposition:'VALIDATED',assertion:'Synthetic reviewer checked supporting evidence.',sourceRefs:['SRC-TEST01']});
 assert.equal(result.kind,'ok',JSON.stringify(result));assert.equal(result.observation.response.PacketStatus,'VALIDATED');
 assert.equal(result.observation.handle.operation,'ValidateEvidencePacket');
});
test('a terminal-looking inconclusive body cannot discard the original mutation intent',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();const post=f.context.client.post;
 f.context.client.post=async(...args)=>{const result=await post(...args);const row=[...f.results.values()].at(-1);row.Result='INCONCLUSIVE';row.ResponseJson=JSON.stringify({Result:'INCONCLUSIVE',ReceiptID:row.ReceiptID,ErrorClass:'FLOW_FAILURE',Message:'Synthetic interrupted write',RetryAllowed:true});return result;};
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 const input={s1:{Title:'Synthetic case',SourceChannel:'FRONT_DOOR'}};
 assert.equal((await service.createOrResume(session,input)).kind,'failed');
 assert.equal(f.refs.size,1);await service.createOrResume(session,input);assert.equal(f.posts.length,1);
});
test('material clarification invalidates the previously observed packet version',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 await service.listPackets(session,work.WorkID);
 await service.createOrResume(session,{workId:work.WorkID,s1:{Title:'Changed synthetic case',SourceChannel:'FRONT_DOOR'}});
 const before=f.posts.length;const stale=await service.submitEvidence(session,{workId:work.WorkID,evidencePacketId:'EVP-TEST01',response:'Stale evidence',knownAssumedUnknown:'KNOWN'});
 assert.equal(stale.kind,'disabled');assert.equal(f.posts.length,before);
});
test('current native caller and result request-author identity are verified, not just payload scope',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');
 const f=fixture(),get=f.context.client.get;f.context.client.get=async url=>url.includes('/currentuser?')?{ok:true,status:200,json:async()=>({Id:14,Email:'other@example.invalid'})}:get(url);
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});
 assert.equal((await service.createOrResume(session,{s1:{Title:'Synthetic case',SourceChannel:'FRONT_DOOR'}})).kind,'disabled');assert.equal(f.posts.length,0);
 const g=fixture(),post=g.context.client.post;g.context.client.post=async(...args)=>{const value=await post(...args);[...g.results.values()].at(-1).RequestAuthorID=14;return value;};
 const denied=await new NativeCoreWorkService(g.context,{binding:g.binding,references:g.references}).getStatus(session,work.WorkID);
 assert.notEqual(denied.kind,'ok');assert.equal(g.refs.size,1);
});
test('native clarification transmits a strict partial S1 patch for explicitly edited fields',async()=>{
 const {NativeCoreWorkService}=load('services/core/nativeCoreWorkService.ts');const f=fixture();
 const service=new NativeCoreWorkService(f.context,{binding:f.binding,references:f.references});await service.getStatus(session,work.WorkID);
 const updated=await service.createOrResume(session,{workId:work.WorkID,s1:{Title:work.Title,SourceChannel:'FRONT_DOOR',Sponsor:'Updated sponsor'},changedFields:['Sponsor']});
 assert.equal(updated.kind,'ok',JSON.stringify(updated));
 assert.deepEqual(JSON.parse(f.posts[1].RequestJson).S1,{Sponsor:'Updated sponsor'});
});
