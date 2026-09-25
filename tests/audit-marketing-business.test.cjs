'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const load=require('./audit-source-loader.cjs');
const {createBusinessMarketingServices}=load('services/marketing/businessServices.ts');
const session={actorId:'employee@example.invalid',tenantScope:'https://example.sharepoint.com/sites/marketing',resolution:{resolution:'resolved',roles:['employee','marketingParticipant']}};
const binding={enabled:true,siteUrl:session.tenantScope,requestListId:'11111111-1111-4111-8111-111111111111',resultListId:'22222222-2222-4222-8222-222222222222',qualificationReceiptRef:'QUAL-SYNTHETIC'};
function fixture(){const values=new Map(),posts=[];const references={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};const http={request:async(method,url,body)=>{if(method==='POST'){posts.push(body);return {status:201,body:{Id:posts.length}};}return {status:200,body:{value:[]}};}};return {values,posts,references,http};}
test('Marketing persists only an opaque pre-dispatch reference and never repeats an unknown mutation after reload',async()=>{
 const f=fixture(),options={binding,session,http:f.http,references:f.references,pollAttempts:1};
 const input={workId:'CW-SYNTHETIC_TEST',objective:'PRIVATE-SYNTHETIC-OBJECTIVE',audienceContext:['PRIVATE-SYNTHETIC-AUDIENCE'],sourceIds:['SRC-SYNTHETIC']};
 const first=await createBusinessMarketingServices(options).draft.draftCampaignBrief(session,input);assert.equal(first.kind,'failed');
 assert.equal(f.values.size,1);assert.ok(!JSON.stringify([...f.values]).includes('PRIVATE-SYNTHETIC'));
 const restarted=createBusinessMarketingServices(options);await restarted.draft.draftCampaignBrief(session,input);assert.equal(f.posts.length,1);
 await restarted.draft.draftCampaignBrief(session,{...input,objective:'Changed intent'});assert.equal(f.posts.length,1);
});
test('Marketing refuses a mutation if its opaque reference cannot be stored',async()=>{
 const f=fixture();f.references.setItem=()=>{throw new Error('Synthetic storage refusal');};
 await createBusinessMarketingServices({binding,session,http:f.http,references:f.references,pollAttempts:1}).draft.draftCampaignBrief(session,{workId:'CW-SYNTHETIC_TEST',objective:'Synthetic objective',audienceContext:[],sourceIds:[]});
 assert.equal(f.posts.length,0);
});
test('Marketing recovery after reload validates and acknowledges the original review-request result',async()=>{
 const {payloadHash}=load('content/actionEnvelope.ts');const f=fixture();let projection,hidden=true;
 const target={kind:'campaignBrief',artifactId:'BRIEF-SYNTHETIC',revision:1,payloadHash:'a'.repeat(64)};
 f.http.request=async(method,url,body)=>{
  if(method==='POST'){
   f.posts.push(body);const value={kind:'recorded',state:'reviewRequested',request:{requestId:'REQUEST-SYNTHETIC',requestedBy:session.actorId,requestedAt:'2026-09-23T12:00:00Z',target}};
   projection={RequestId:body.Title,ResultJson:JSON.stringify({protocol:'marketing.v1',requestId:body.Title,operation:body.Operation,actorId:session.actorId,tenantScope:session.tenantScope,value,valueHash:await payloadHash(value)})};return {status:201,body:{Id:1}};
  }return {status:200,body:{value:hidden?[]:[projection]}};
 };
 const options={binding,session,http:f.http,references:f.references,pollAttempts:1};
 await createBusinessMarketingServices(options).review.requestReview(session,target,'strategyVoice');assert.equal(f.values.size,1);
 hidden=false;const restarted=createBusinessMarketingServices(options),recovered=await restarted.recoverPending();
 assert.equal(recovered.kind,'recovered',JSON.stringify(recovered));assert.equal(f.posts.length,1);assert.equal(f.values.size,0);
 assert.equal((await restarted.recoverPending()).kind,'none');
});
test('an unknown Marketing recovery request also retains one original recovery ID',async()=>{
 const f=fixture(),options={binding,session,http:f.http,references:f.references,pollAttempts:1};
 const service=createBusinessMarketingServices(options);
 await service.draft.draftCampaignBrief(session,{workId:'CW-SYNTHETIC_TEST',objective:'Synthetic objective',audienceContext:[],sourceIds:[]});
 const key=JSON.parse([...f.values.values()][0]).id;
 await service.draft.reconcileAttempt(session,key);
 await createBusinessMarketingServices(options).draft.reconcileAttempt(session,key);
 assert.equal(f.posts.length,2,'One initial request and one recover request; an unknown recover is only polled.');
 const held=JSON.parse([...f.values.values()][0]);assert.equal(held.id,key);assert.equal(held.recoveryId,f.posts[1].Title);
});
