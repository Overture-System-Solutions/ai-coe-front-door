'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'https://example.invalid'});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver'])global[key]=dom.window[key];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
global.requestAnimationFrame=dom.window.requestAnimationFrame=callback=>setTimeout(callback,0);
global.cancelAnimationFrame=dom.window.cancelAnimationFrame=clearTimeout;
const React=require('react');const {render,act,cleanup}=require('@testing-library/react');
const load=require('./audit-source-loader.cjs');const {SubmissionProvider,useSubmission}=load('context/SubmissionContext.tsx');
(async()=>{
 const attempt={workflowType:'feedback',payload:{text:'Synthetic persisted request'},intakeId:'OVT-AICOE-20260923-TEST1234'};let state;const ids=[];
 const governance={restoreSubmission:async()=>({attempt,result:{connected:false,state:'pending',intakeId:attempt.intakeId,message:'Synthetic pending record'}}),submitWorkflow:async(w,p,o)=>{ids.push(o.intakeId);return {connected:true,state:'saved',intakeId:o.intakeId,message:'Synthetic readback'};}};
 function Inspect(){state=useSubmission();return null;}
 await act(async()=>{render(React.createElement(SubmissionProvider,{governanceService:governance},React.createElement(Inspect)));});
 assert.equal(state.lastAttempt?.intakeId,attempt.intakeId);
 await act(async()=>state.retryLast());
 assert.deepEqual(ids,[attempt.intakeId]);
 console.log(JSON.stringify({test:'pending submission restores after remount and retries original identity',passed:true}));
 cleanup();dom.window.close();process.exit(0);
})().catch(e=>{console.error(e.stack);cleanup();dom.window.close();process.exit(1);});
