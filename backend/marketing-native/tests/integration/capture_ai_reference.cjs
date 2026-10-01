'use strict';
// Real reference runtime; the provider and SharePoint are explicitly offline fixtures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('../../../power-automate/marketing-runtime/tests/runtime-fixture.cjs');
const m=require('../../../power-automate/marketing-runtime/tests/manual-fixture.cjs');
const {load,root}=require('../../../power-automate/marketing-runtime/tests/helpers.cjs');
const {MarketingRuntime}=require('../../../power-automate/marketing-runtime/server/runtime.cjs');
class SourceRuntime extends MarketingRuntime {
 constructor(options){super({...options,schemaFor:kind=>require(path.join(root,'src/webparts/aiCoeFrontDoor/content/marketing/schemas',({campaignBrief:'campaign-brief.v1.json',contentPlan:'content-plan.v1.json',meetingFollowThrough:'meeting-follow-through.v1.json'})[kind]))});}
}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hash=load('content/actionEnvelope').payloadHash;
async function main(){
 const f=await fixture(SourceRuntime),cases=[];let count=100,observedResponse;
 f.config.controllerQualified=true;f.config.securityQualified=true;
 await f.save('qualification:'+f.config.qualificationReceiptRef,{result:'PASS',bindingHash:await hash(f.config),expiresAt:'2099-01-01T00:00:00Z'});
 f.setProviderHook(async wire=>{
  const request=JSON.parse(wire['body/messages'][0].content),reply=await new (load('services/marketing/providers').SyntheticMarketingProvider)().draft(request);
  observedResponse={id:'OFFLINE-PROVIDER-'+count,type:'message',role:'assistant',model:f.config.provider.model,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(reply.payload)}]};
  return observedResponse;
 });
 async function run(name,op,payload){
  observedResponse=undefined;
  const row=f.enqueue(op,payload);row.Title=`00000000-0000-4000-8000-${String(++count).padStart(12,'0')}`;
  const records=await Promise.all((await f.store.keys('')).sort().map(async(key,i)=>{const r=await f.store.read(key);return {Id:i+1,Title:sha(f.config.siteUrl+'\n'+key),RecordKey:key,TenantScope:f.config.siteUrl,RecordJson:r.value,RecordHash:sha(r.value),'@odata.etag':r.version};}));
  const bytes=await f.sp.request('GET',f.config.siteUrl+'/_api/fake-source/$value');
  const input={Config:{...f.config},Row:JSON.parse(JSON.stringify(row)),Records:records,Now:'2026-09-23T13:00:00.000Z',RunId:'OFFLINE-NATIVE-RUN',Sources:[{sourceId:f.entry.id,versionOrETag:f.entry.versionOrETag,content:bytes.body,contentETag:bytes.etag,permissionLowBefore:'33',permissionLowAfter:'33',metadataETagBefore:f.entry.versionOrETag,metadataETagAfter:f.entry.versionOrETag}]};
  const value=(await f.runtime().execute(row.Id)).value;
  if(observedResponse)input.ProviderResponse=observedResponse;
  cases.push({name,operation:op,input,expectedValue:value});return {value,row};
 }
 const b=await run('provider brief','DraftCampaignBriefV1',{workId:m.workId,objective:'Explicitly fictional automated workflow',audienceContext:['Marketing team'],sourceIds:[f.entry.id]});
 if(b.value.kind!=='saved')throw new Error(JSON.stringify(b.value));
 await m.accept(f,b.value,'strategyVoice');
 const p=await run('provider content plan','DraftContentPlanV1',{workId:m.workId,briefArtifactId:b.value.envelope.artifactId,sourceIds:[f.entry.id]});
 if(p.value.kind!=='saved')throw new Error(JSON.stringify(p.value));
 const follow=await run('provider meeting follow-through','DraftMeetingFollowThroughV1',{workId:m.workId,briefArtifactId:b.value.envelope.artifactId,sourceIds:[f.entry.id],notes:[{sourceId:f.entry.id,versionOrETag:f.entry.versionOrETag,locator:f.entry.location}]});
 if(follow.value.kind!=='saved')throw new Error(JSON.stringify(follow.value));
 const recovered=await run('same original completed intent','RecoverMarketingIntentV1',{intentKey:b.row.Title,kind:'draft'});
 if(JSON.stringify(recovered.value)!==JSON.stringify(b.value))throw new Error('Reference recovery changed the original result.');
 const out=path.resolve(__dirname,'../../evidence/integration/node-ai-reference-vectors.json');
 if(fs.existsSync(out))throw new Error('Existing captured vectors are immutable.');
 fs.writeFileSync(out,JSON.stringify({boundary:'OFFLINE_SYNTHETIC_PROVIDER_AND_SHAREPOINT_REAL_REFERENCE_RUNTIME',simulatedProviderCalls:f.providerCalls(),cases},null,2)+'\n');
 console.log(JSON.stringify({file:out,cases:cases.length,operations:[...new Set(cases.map(c=>c.operation))],simulatedProviderCalls:f.providerCalls()},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
