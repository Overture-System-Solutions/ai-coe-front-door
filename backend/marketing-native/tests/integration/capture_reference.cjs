'use strict';
// This executes the real Node reference against explicit OFFLINE fixtures; it never calls a provider or tenant.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('../../../power-automate/marketing-runtime/tests/runtime-fixture.cjs');
const m=require('../../../power-automate/marketing-runtime/tests/manual-fixture.cjs');
const {load,ref}=require('../../../power-automate/marketing-runtime/tests/helpers.cjs');
const out=path.resolve(__dirname,'../../evidence/integration');
const hash=load('content/actionEnvelope').payloadHash;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 const f=await fixture();
 f.config.controllerQualified=true;f.config.securityQualified=true;
 await f.save('qualification:'+f.config.qualificationReceiptRef,{result:'PASS',bindingHash:await hash(f.config),expiresAt:'2099-01-01T00:00:00Z'});
 const cases=[];let number=0;
 const snapshot=async()=>Promise.all((await f.store.keys('')).sort().map(async(key,i)=>{
  const item=await f.store.read(key);return {Id:i+1,Title:sha(f.config.siteUrl+'\n'+key),RecordKey:key,TenantScope:f.config.siteUrl,RecordJson:item.value,RecordHash:sha(item.value),'@odata.etag':item.version};
 }));
 async function run(name,op,payload,author=7){
  const row=f.enqueue(op,payload,author);row.Title=`00000000-0000-4000-8000-${String(++number).padStart(12,'0')}`;
  const data=await snapshot(),source=JSON.parse((await f.store.read('source:'+f.entry.id)).value);
  const read=await f.sp.request('GET',f.config.siteUrl+'/_api/fake-source/$value');
  const input={Config:{...f.config},Row:JSON.parse(JSON.stringify(row)),Records:data,Now:'2026-09-23T13:00:00.000Z',RunId:'OFFLINE-NATIVE-RUN',Sources:[{sourceId:f.entry.id,versionOrETag:f.entry.versionOrETag,content:read.body,contentETag:read.etag,permissionLowBefore:'33',permissionLowAfter:'33',metadataETagBefore:f.entry.versionOrETag,metadataETagAfter:f.entry.versionOrETag}]};
  if(sha(read.body)!==source.contentHash)throw new Error('Fixture source hash differs.');
  const result=(await f.runtime().execute(row.Id)).value;
  cases.push({name,operation:op,input,expectedValue:result});return result;
 }
 const work=await run('authorized work list','ListMarketingWorkV1',{});
 if(JSON.stringify(work)!==JSON.stringify([m.workId]))throw new Error('Reference list failed.');
 const brief=await run('manual brief','SaveManualMarketingDraftV1',m.brief(f));
 if(brief.kind!=='saved')throw new Error(JSON.stringify(brief));
 await run('read brief','GetArtifactV1',{artifactId:brief.envelope.artifactId});
 await run('request brief review','RequestReviewV1',{target:ref(brief.envelope),reviewKind:'strategyVoice'});
 const held=await run('reviewer reads brief','GetArtifactV1',{artifactId:brief.envelope.artifactId},8);
 const accepted=await run('accept brief','RecordReviewDecisionV1',{target:ref(brief.envelope),reviewKind:'strategyVoice',outcome:'accept',comments:'Offline fixture decision only',expectedStoreVersion:held.storeVersion,idempotencyKey:'offline-decision-brief'},8);
 if(accepted.kind!=='recorded'||accepted.state!=='accepted')throw new Error('Reference approval did not complete.');
 const plan=await run('manual content plan','SaveManualMarketingDraftV1',m.plan(f,brief,accepted.receipt.receiptId));
 if(plan.kind!=='saved')throw new Error(JSON.stringify(plan));
 const follow=await run('manual follow-through','SaveManualMarketingDraftV1',m.follow(f,brief,plan));
 if(follow.kind!=='saved')throw new Error(JSON.stringify(follow));
 await run('list author artifacts','ListArtifactsV1',{workId:m.workId});
 await run('list own authorities','ListAuthoritiesV1',{},8);
 await run('list brief reviews','ListReviewDecisionsV1',{artifactId:brief.envelope.artifactId},8);
 await run('list brief requests','ListReviewRequestsV1',{artifactId:brief.envelope.artifactId},8);
 await run('get review','GetReviewV1',{reviewId:accepted.decision.reviewId},8);
 await run('read source register','ReadSourceRegisterV1',{});
 await run('read permitted source','ReadSourceExcerptV1',{reference:{sourceId:f.entry.id,versionOrETag:f.entry.versionOrETag}});
 const revised=await run('manual new brief revision','SaveManualMarketingDraftV1',{...m.brief(f),artifactId:brief.envelope.artifactId,expectedStoreVersion:brief.storeVersion});
 if(revised.kind!=='saved')throw new Error(JSON.stringify(revised));
 await run('stale parent invalidates content plan','GetArtifactV1',{artifactId:plan.envelope.artifactId});
 await run('reject stale manual revision','SaveManualMarketingDraftV1',{...m.brief(f),artifactId:brief.envelope.artifactId,expectedStoreVersion:brief.storeVersion});
 if(f.providerCalls()!==0)throw new Error('Manual reference called provider.');
 fs.mkdirSync(out,{recursive:true});const file=path.join(out,'node-reference-vectors.json');
 if(fs.existsSync(file))throw new Error('Existing captured vectors are immutable.');
 fs.writeFileSync(file,JSON.stringify({boundary:'OFFLINE_FIXTURE_REFERENCE_EXECUTION_NOT_NATIVE_ACCEPTANCE',providerCalls:0,cases},null,2)+'\n');
 console.log(JSON.stringify({file,cases:cases.length,operations:[...new Set(cases.map(c=>c.operation))].sort(),providerCalls:f.providerCalls()},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
