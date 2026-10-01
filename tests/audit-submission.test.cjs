'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const load=require('./audit-source-loader.cjs');
const file=path.resolve(__dirname,'../src/webparts/aiCoeFrontDoor/services/durableSubmissionService.ts');
const Service=fs.existsSync(file)?load('services/durableSubmissionService.ts').DurableSubmissionService:undefined;
test('a submission intent is stored server-side before a write and is recovered after restart',async()=>{
 assert.equal(typeof Service,'function','Durable server-side submission recovery is missing');
 const server=new Map();const calls=[];
 const store={save:async(k,v)=>{server.set(k,JSON.parse(JSON.stringify(v)));return {ok:true};},load:async k=>server.get(k),clear:async k=>server.delete(k)};
 const raw={submitWorkflow:async(type,payload,options)=>{assert.ok(server.has('submission_last'));calls.push(options.intakeId);return {connected:false,state:'pending',intakeId:options.intakeId,message:'Synthetic uncertain readback.'};},submitOutcome:async()=>{throw new Error('Not this scenario');},getAdminDashboardData:async()=>({connected:false,intakes:[],useCases:[],decisions:[],message:'fixture'})};
 const first=new Service(raw,store);
 const initial=await first.submitWorkflow('feedback',{text:'Synthetic business draft'});
 const restarted=new Service(raw,store);
 const restored=await restarted.restoreSubmission();
 assert.equal(restored.attempt.intakeId,initial.intakeId);
 const replay=await restarted.submitWorkflow('feedback',{text:'Synthetic business draft'});
 assert.equal(replay.intakeId,initial.intakeId);
 assert.deepEqual(calls,[initial.intakeId,initial.intakeId]);
});
