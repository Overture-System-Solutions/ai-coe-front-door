'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const load=require('./audit-source-loader.cjs');
const file=path.resolve(__dirname,'../src/webparts/aiCoeFrontDoor/services/serverDraftStore.ts');
const Store=fs.existsSync(file)?load('services/serverDraftStore.ts').ServerDraftStore:undefined;
const policy={qualified:true,qualificationReceiptRef:'RCPT-DRAFT-SYNTHETIC',retentionPolicyRef:'POLICY-RETENTION-SYNTHETIC',accessPolicyRef:'POLICY-ACCESS-SYNTHETIC',retentionDays:30,qualifiedUntil:'2099-01-01T00:00:00Z'};
function fixture(){
 const browser=new Map(), rows=new Map(), writes=[];let serial=0;
 const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>value,text:async()=>JSON.stringify(value)});
 const client={
  async get(url){
   const match=/items\((\d+)\)/.exec(url);
   if(match){const row=rows.get(Number(match[1]));return response(row?200:404,row||{});}
   const filter=new URL(url).searchParams.get('$filter')||'';
   const key=/Title eq '([^']+)'/.exec(filter)?.[1];
   return response(200,{value:[...rows.values()].filter(r=>r.Title===key)});
  },
  async post(url,config,options){
   writes.push({url,options});const body=JSON.parse(options.body);const match=/items\((\d+)\)/.exec(url);
   if(typeof body.ExpiresAt==='string')body.ExpiresAt=body.ExpiresAt.replace(/\.\d{3}Z$/,'Z');
   if(match){const row=rows.get(Number(match[1]));if(!row)return response(404,{});if(options.headers['IF-MATCH']!==row['@odata.etag'])return response(412,{});const n=Number(row['@odata.etag'].replace(/\D/g,''))+1;Object.assign(row,body,{'@odata.etag':`"${n}"`});return response(204,{});}
   const row={...body,Id:++serial,Author:{EMail:'audit@example.invalid'},'@odata.etag':'"1"'};rows.set(row.Id,row);return response(201,row);
  }
 };
 const storage={getItem:k=>browser.get(k)??null,setItem:(k,v)=>browser.set(k,v),removeItem:k=>browser.delete(k)};
 const context={siteUrl:'https://example.invalid/site',user:{email:'audit@example.invalid',displayName:'Synthetic tester'},client,configuration:{}};
 return {browser,rows,writes,storage,context};
}
test('business draft content is stored and recovered only from the server',async()=>{
 assert.equal(typeof Store,'function','Server-side business draft store is missing');
 const f=fixture();const options={listId:'11111111-1111-4111-8111-111111111111',references:f.storage,policy};
 const store=new Store(f.context,options);
 const draft={answers:{workToImprove:'BUSINESS_TEXT_MUST_NEVER_PERSIST_IN_BROWSER'}};
 assert.equal((await store.save('idea',draft)).ok,true);
 assert.ok([...f.rows.values()].some(r=>r.DraftJson===JSON.stringify(draft)));
 const row=[...f.rows.values()][0];assert.equal(row.RetentionPolicyRef,policy.retentionPolicyRef);assert.equal(row.AccessPolicyRef,policy.accessPolicyRef);
 assert.ok(Date.parse(row.ExpiresAt)>Date.now());
 assert.ok(!JSON.stringify([...f.browser]).includes('BUSINESS_TEXT_MUST_NEVER_PERSIST_IN_BROWSER'));
 const restarted=new Store(f.context,options);
 assert.deepEqual(await restarted.load('idea'),draft);
 assert.ok(f.writes.every(w=>w.url.includes("lists(guid'11111111-1111-4111-8111-111111111111')")));
});
test('business draft writes require current retention/access qualification, not just a list GUID',async()=>{
 for(const invalid of [undefined,{...policy,qualified:false},{...policy,qualifiedUntil:'2000-01-01T00:00:00Z'},{...policy,retentionPolicyRef:''}]){
  const f=fixture(),store=new Store(f.context,{listId:'11111111-1111-4111-8111-111111111111',references:f.storage,policy:invalid});
  assert.equal((await store.save('idea',{answers:{title:'Unqualified business draft'}})).ok,false);
  assert.equal(f.writes.length,0);
 }
});
const options=f=>({listId:'11111111-1111-4111-8111-111111111111',references:f.storage,policy});
test('an uncertain update cannot be silently erased by loading an older server draft',async()=>{
 const f=fixture(),store=new Store(f.context,options(f));assert.equal((await store.save('idea',{value:'old'})).ok,true);
 f.context.client.post=async()=>{throw new Error('Synthetic unknown outcome');};
 assert.equal((await store.save('idea',{value:'new'})).ok,false);
 const restart=new Store(f.context,options(f));
 await assert.rejects(()=>restart.load('idea'),/unconfirmed|unresolved/i);
 assert.equal(JSON.parse([...f.browser.values()][0]).pending,true);
});
test('stale ETags, foreign authors and duplicate keys never become successful draft saves',async()=>{
 const f=fixture(),first=new Store(f.context,options(f));await first.save('idea',{value:'v1'});
 const stale=new Store(f.context,options(f));await stale.load('idea');await first.save('idea',{value:'v2'});
 const before=f.writes.length;assert.equal((await stale.save('idea',{value:'wrong-v3'})).ok,false);assert.equal(f.writes.length,before);
 const row=[...f.rows.values()][0];row.Author.EMail='another@example.invalid';
 await assert.rejects(()=>new Store(f.context,options(f)).load('idea'),/identity|version/);
 assert.equal((await first.save('idea',{value:'foreign'})).ok,false);assert.equal(f.writes.length,before);
 row.Author.EMail='audit@example.invalid';f.rows.set(99,{...row,Id:99});
 await assert.rejects(()=>new Store(f.context,options(f)).load('idea'),/ambiguous/);
 assert.equal((await first.save('idea',{value:'duplicate'})).ok,false);assert.equal(f.writes.length,before);
});
test('an uncertain clear is not confused with an empty but uncleared draft',async()=>{
 const f=fixture(),store=new Store(f.context,options(f));await store.save('idea',{});
 f.context.client.post=async()=>{throw new Error('Synthetic unknown clear');};
 await assert.rejects(()=>store.clear('idea'));
 await assert.rejects(()=>new Store(f.context,options(f)).load('idea'),/unconfirmed|unresolved/i);
});
test('a lost create response recovers exactly once from server readback after restart',async()=>{
 const f=fixture(),post=f.context.client.post;f.context.client.post=async(...args)=>{await post(...args);throw new Error('Synthetic lost response');};
 const draft={value:'synthetic recovery'};assert.equal((await new Store(f.context,options(f)).save('idea',draft)).ok,false);
 const restart=new Store(f.context,options(f));assert.equal((await restart.save('idea',draft)).ok,true);assert.equal(f.writes.length,1);assert.equal(f.rows.size,1);
});
module.exports={fixture,policy};
