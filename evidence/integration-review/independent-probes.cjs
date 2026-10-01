'use strict';
// Independent reproductions. Every identity, source and external reply is synthetic.
// Passing assertions below CONFIRM the named defects; they are not safety passes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname,'../..');
const load = require(path.join(root,'tests/audit-source-loader.cjs'));
const {ServerDraftStore} = load('services/serverDraftStore.ts');
const {fixture: marketingFixture} = require(path.join(root,'backend/power-automate/marketing-runtime/tests/runtime-fixture.cjs'));
const output=[];
const hashes={};
for(const relative of ['src/webparts/aiCoeFrontDoor/services/serverDraftStore.ts','src/webparts/aiCoeFrontDoor/services/core/nativeCoreWorkService.ts','src/webparts/aiCoeFrontDoor/services/marketing/marketingDraftService.ts','backend/power-automate/marketing-runtime/server/runtime.cjs','backend/power-automate/marketing-runtime/server/source-registry.cjs']) hashes[relative]=createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');
globalThis.fetch=async()=>{throw new Error('Live HTTP is forbidden in this review');};
function draftFixture(){
 const browser=new Map(),rows=new Map(),writes=[];let serial=0;
 const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(value)});
 const client={
  async get(url){const key=/Title eq '([^']+)'/.exec(decodeURIComponent(url))?.[1];return response(200,{value:[...rows.values()].filter(r=>r.Title===key)});},
  async post(url,config,options){
   writes.push({url,options});const body=JSON.parse(options.body),id=/items\((\d+)\)/.exec(url)?.[1];
   if(id){const row=rows.get(Number(id));if(options.headers['IF-MATCH']!==row['@odata.etag'])return response(412,{});Object.assign(row,body,{'@odata.etag':`"${Number(row['@odata.etag'].replace(/\D/g,''))+1}"`});return response(204,{});}
   const row={...body,Id:++serial,Author:{EMail:'audit@example.invalid'},'@odata.etag':'"1"'};rows.set(row.Id,row);return response(201,row);
  }
 };
 const references={getItem:k=>browser.get(k)??null,setItem:(k,v)=>browser.set(k,v),removeItem:k=>browser.delete(k)};
 const context={siteUrl:'https://example.invalid/site',user:{email:'audit@example.invalid',displayName:'Synthetic'},client,configuration:{}};
 const options={listId:'11111111-1111-4111-8111-111111111111',references,policy:{qualified:true,qualificationReceiptRef:'RCPT-DRAFT-SYNTHETIC',retentionPolicyRef:'POLICY-RETENTION-SYNTHETIC',accessPolicyRef:'POLICY-ACCESS-SYNTHETIC',retentionDays:30,qualifiedUntil:'2099-01-01T00:00:00Z'}};
 return {browser,rows,writes,context,options,ref:()=>JSON.parse([...browser.values()][0])};
}
function noBusinessInBrowser(f){assert.equal(JSON.stringify([...f.browser]).includes('BUSINESS-'),false);}
async function staleLoadRace(){
 const f=draftFixture(),store=new ServerDraftStore(f.context,f.options);
 assert.equal((await store.save('idea',{value:'BUSINESS-old'})).ok,true);
 const originalGet=f.context.client.get;
 let release,entered;const waiting=new Promise(r=>entered=r);let hold=true;
 f.context.client.get=async(...args)=>{const res=await originalGet(...args);if(hold){hold=false;const snapshot=await res.json();entered();await new Promise(r=>release=r);return {...res,json:async()=>snapshot};}return res;};
 const stale=store.load('idea');await waiting;
 f.context.client.post=async()=>{throw new Error('Synthetic lost response; application outcome unknown');};
 assert.equal((await store.save('idea',{value:'BUSINESS-new'})).ok,false);
 const unresolved=f.ref();assert.equal(unresolved.pending,true);
 release();const loaded=await stale;
 const after=f.ref();
 assert.deepEqual(loaded,{value:'BUSINESS-old'});
 assert.equal(after.pending,false);
 assert.notEqual(unresolved.digest,after.digest);
 assert.deepEqual(await new ServerDraftStore(f.context,f.options).load('idea'),{value:'BUSINESS-old'});
 noBusinessInBrowser(f);
 output.push({id:'DRAFT-RACE',verdict:'REPRODUCED',pendingBeforeStaleLoad:true,pendingAfterStaleLoad:false,restartReturnedOldDraft:true,browserBusinessText:false});
}
async function staleInstance(){
 const f=draftFixture(),first=new ServerDraftStore(f.context,f.options),second=new ServerDraftStore(f.context,f.options);
 await first.save('idea',{value:'BUSINESS-old'});await second.load('idea');
 const post=f.context.client.post;f.context.client.post=async()=>{throw new Error('Synthetic uncertain write');};
 assert.equal((await first.save('idea',{value:'BUSINESS-new'})).ok,false);assert.equal(f.ref().pending,true);
 f.context.client.post=post;
 assert.equal((await second.save('idea',{value:'BUSINESS-replacement'})).ok,true);
 assert.equal(f.ref().pending,false);assert.equal(f.writes.length,2);
 noBusinessInBrowser(f);
 output.push({id:'DRAFT-CACHED-REFERENCE',verdict:'REPRODUCED',secondInstanceIgnoredSharedPending:true,pendingAfterNewWrite:false,browserBusinessText:false});
}
function runtimeFor(base,packaged){
 const Runtime=packaged?require(path.join(__dirname,'marketing-exact-zip/server/runtime.cjs')).MarketingRuntime:require(path.join(root,'backend/power-automate/marketing-runtime/server/runtime.cjs')).MarketingRuntime;
 if(packaged)return class extends Runtime{constructor(o){super({...o,shared:undefined});}};
 const schemaFor=kind=>require(path.join(root,'src/webparts/aiCoeFrontDoor/content/marketing/schemas',{campaignBrief:'campaign-brief.v1.json',contentPlan:'content-plan.v1.json',meetingFollowThrough:'meeting-follow-through.v1.json'}[kind]));
 return class extends Runtime{constructor(o){super({...o,schemaFor});}};
}
async function replayRevokedSource(packaged){
 const f=await marketingFixture(runtimeFor(null,packaged));
 const payload={reference:{sourceId:f.entry.id,versionOrETag:f.entry.versionOrETag}};
 const row=f.enqueue('ReadSourceExcerptV1',payload),initial=await f.runtime().execute(row.Id);
 assert.equal(typeof initial.value.excerpt,'string');
 const source=JSON.parse((await f.store.read('source:'+f.entry.id)).value);
 await f.save('source:'+f.entry.id,{...source,revoked:true});
 const fresh=await f.run('ReadSourceExcerptV1',payload);assert.equal(fresh,null);
 const replay=(await f.runtime().execute(row.Id)).value;
 assert.equal(replay.excerpt,initial.value.excerpt);
 const beforeRecoveryProjections=f.projections.length;
 const recovered=await f.run('RecoverMarketingIntentV1',{intentKey:row.Title,kind:'draft'});
 assert.equal(recovered.excerpt,initial.value.excerpt);
 assert.equal(f.projections.length,beforeRecoveryProjections+1);
 assert.equal(JSON.parse(f.projections.at(-1).ResultJson).value.excerpt,initial.value.excerpt);
 output.push({id:'MARKETING-REVOKED-SOURCE-REPLAY',boundary:packaged?'exact-ZIP':'source',verdict:'REPRODUCED',freshReadRefused:true,oldCommandReplayReturnsExcerpt:true,recoveryNewProjectionReturnsExcerpt:true,providerCalls:f.providerCalls()});
}
async function lateSourceRevocation(packaged){
 const f=await marketingFixture(runtimeFor(null,packaged));let revoked=false,offered=0;
 f.setSpHook(async(method,url)=>{if(!revoked&&url.endsWith('/$value')){revoked=true;const source=JSON.parse((await f.store.read('source:'+f.entry.id)).value);await f.save('source:'+f.entry.id,{...source,revoked:true});}return undefined;});
 f.setProviderHook(async wire=>{const source=JSON.parse((await f.store.read('source:'+f.entry.id)).value);assert.equal(source.revoked,true);const request=JSON.parse(wire['body/messages'][0].content);offered=request.permittedSources.length;});
 const result=await f.run('DraftCampaignBriefV1',{workId:'CW-OFFLINE_TEST',objective:'Synthetic revocation probe',audienceContext:['Marketing team'],sourceIds:[f.entry.id]});
 assert.equal(revoked,true);assert.equal(f.providerCalls(),1);assert.equal(offered,1);assert.equal(result.state,'revalidationRequired');
 output.push({id:'MARKETING-LATE-REVOKED-SOURCE',boundary:packaged?'exact-ZIP':'source',verdict:'REPRODUCED',providerCalledAfterRevocation:true,sourceExcerptsOffered:offered,resultKind:result.kind,resultState:result.state});
}
(async()=>{
 const selected=process.argv[2]||'all';assert.ok(['all','draft','replay','late'].includes(selected));
 if(['all','draft'].includes(selected)){await staleLoadRace();await staleInstance();}
 for(const packaged of [false,true]){if(['all','replay'].includes(selected))await replayRevokedSource(packaged);if(['all','late'].includes(selected))await lateSourceRevocation(packaged);}
 const result={boundary:'Synthetic offline probes; passing assertions reproduce defects, not acceptance.',sourceHashes:hashes,observations:output};
 fs.writeFileSync(path.join(__dirname,selected==='all'?'independent-probes.json':`independent-probes-${selected}.json`),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
