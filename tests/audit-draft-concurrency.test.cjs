'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const load=require('./audit-source-loader.cjs');
const envelope=load('content/actionEnvelope.ts');
// Real SHA-256, synchronous before Promise resolution, makes the scheduling probe deterministic.
envelope.payloadHash=async value=>crypto.createHash('sha256').update(envelope.canonicalJson(value)).digest('hex');
const {ServerDraftStore}=load('services/serverDraftStore.ts');
function fixture(){
 const browser=new Map(),rows=new Map(),writes=[];let serial=0;
 const reply=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(value)});
 const client={get:async url=>{const key=/Title eq '([^']+)'/.exec(decodeURIComponent(url))?.[1];return reply(200,{value:[...rows.values()].filter(r=>r.Title===key).map(r=>structuredClone(r))});},post:async(url,config,options)=>{writes.push(options);const body=JSON.parse(options.body),id=/items\((\d+)\)/.exec(url)?.[1];if(id){const row=rows.get(Number(id));if(options.headers['IF-MATCH']!==row['@odata.etag'])return reply(412,{});Object.assign(row,body,{'@odata.etag':`"${Number(row['@odata.etag'].replace(/\D/g,''))+1}"`});return reply(204,{});}const row={...body,Id:++serial,Author:{EMail:'audit@example.invalid'},'@odata.etag':'"1"'};rows.set(row.Id,row);return reply(201,row);}};
 const references={getItem:k=>browser.get(k)||null,setItem:(k,v)=>browser.set(k,v),removeItem:k=>browser.delete(k)};
 const context={siteUrl:'https://example.invalid/site',user:{email:'audit@example.invalid',displayName:'Synthetic'},client,configuration:{}};
 const options={listId:'11111111-1111-4111-8111-111111111111',references,policy:{qualified:true,qualificationReceiptRef:'RCPT-SYNTHETIC',retentionPolicyRef:'POLICY-RETENTION',accessPolicyRef:'POLICY-ACCESS',retentionDays:30,qualifiedUntil:'2099-01-01T00:00:00Z'}};
 return {browser,rows,writes,context,options,ref:()=>JSON.parse([...browser.values()][0])};
}
test('a delayed draft load is serialized before the newer write and cannot erase its pending intent',{timeout:3000},async()=>{
 const f=fixture(),store=new ServerDraftStore(f.context,f.options);assert.equal((await store.save('idea',{value:'BUSINESS-old'})).ok,true);
 const get=f.context.client.get;let release,entered,hold=true;const waiting=new Promise(r=>entered=r);
 f.context.client.get=async(...args)=>{const result=await get(...args);if(hold){hold=false;entered();await new Promise(r=>release=r);}return result;};
 const stale=store.load('idea');await waiting;
 f.context.client.post=async()=>{throw new Error('Synthetic unknown write');};
 const write=store.save('idea',{value:'BUSINESS-new'});
 await new Promise(setImmediate);const beforeRelease=f.ref();release();
 await stale;assert.equal((await write).ok,false);
 assert.equal(beforeRelease.pending,false,'A write must not overtake an earlier load.');
 assert.equal(f.ref().pending,true);
 await assert.rejects(()=>new ServerDraftStore(f.context,f.options).load('idea'),/unconfirmed|unresolved/);
 assert.ok(!JSON.stringify([...f.browser]).includes('BUSINESS-'));
});
test('a second draft instance respects the latest shared pending reference despite its old local cache',async()=>{
 const f=fixture(),first=new ServerDraftStore(f.context,f.options),second=new ServerDraftStore(f.context,f.options);
 await first.save('idea',{value:'BUSINESS-old'});await second.load('idea');
 const post=f.context.client.post;f.context.client.post=async()=>{throw new Error('Synthetic uncertain write');};
 assert.equal((await first.save('idea',{value:'BUSINESS-new'})).ok,false);const pending=f.ref(),before=f.writes.length;
 f.context.client.post=post;
 assert.equal((await second.save('idea',{value:'BUSINESS-replacement'})).ok,false);
 assert.deepEqual(f.ref(),pending);assert.equal(f.writes.length,before);
 assert.ok(!JSON.stringify([...f.browser]).includes('BUSINESS-'));
});
test('browser draft operations require and use an opaque cross-tab lock',async()=>{
 const before=global.window;try {
  global.window={navigator:{}};const blocked=fixture();
  assert.equal((await new ServerDraftStore(blocked.context,blocked.options).save('idea',{value:'BUSINESS-blocked'})).ok,false);assert.equal(blocked.writes.length,0);
  const names=[];global.window={navigator:{locks:{request:async(name,run)=>{names.push(name);return run();}}}};
  const f=fixture(),store=new ServerDraftStore(f.context,f.options);assert.equal((await store.save('idea',{value:'BUSINESS-safe'})).ok,true);await store.load('idea');
  assert.equal(names.length,2);assert.equal(new Set(names).size,1);assert.ok(!names[0].includes('audit@'));assert.ok(!JSON.stringify(names).includes('BUSINESS'));
 }finally {if(before===undefined)delete global.window;else global.window=before;}
});
test('draft recovery references are isolated by the bound list as well as actor/site/workflow',async()=>{
 const f=fixture(),first=new ServerDraftStore(f.context,f.options),post=f.context.client.post;
 f.context.client.post=async()=>{throw new Error('Synthetic unknown old-list write');};await first.save('idea',{value:'BUSINESS-old-list'});
 const prior=f.ref();assert.equal(prior.pending,true);f.context.client.post=post;
 const second=new ServerDraftStore(f.context,{...f.options,listId:'22222222-2222-4222-8222-222222222222'});
 assert.equal((await second.save('idea',{value:'BUSINESS-new-list'})).ok,true);assert.equal(f.browser.size,2);assert.deepEqual(f.ref(),prior);
});
test('recovering identical draft text still requires the intended retention-expiry readback',async()=>{
 const f=fixture(),store=new ServerDraftStore(f.context,f.options),now=Date.now,base=now();
 try {
  Date.now=()=>base;await store.save('idea',{value:'BUSINESS-same'});
  Date.now=()=>base+86400000;f.context.client.post=async()=>{throw new Error('Synthetic unknown expiry update');};
  assert.equal((await store.save('idea',{value:'BUSINESS-same'})).ok,false);
  assert.equal((await new ServerDraftStore(f.context,f.options).save('idea',{value:'BUSINESS-same'})).ok,false);
  assert.equal(f.ref().pending,true);
 }finally{Date.now=now;}
});
