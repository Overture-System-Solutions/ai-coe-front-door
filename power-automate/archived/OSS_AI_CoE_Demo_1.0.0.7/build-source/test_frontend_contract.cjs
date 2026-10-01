// Offline contract test: executes the actual 1.0.0.7 service with an in-memory HTTP fixture.
// No Microsoft/provider endpoint is contacted and no live operation is certified.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const acorn=require('./tooling/node_modules/acorn'),ts=require('./tooling/node_modules/tslib');
const root=__dirname,source=fs.readFileSync(path.join(root,'evidence/front-door-1.0.0.7.js'),'utf8');
const ast=acorn.parse(source,{ecmaVersion:'latest'});let initializer;
function walk(x){if(!x||typeof x!=='object')return;if(x.type==='VariableDeclarator'&&x.id.name==='Wt')initializer=x.init;for(const [k,v]of Object.entries(x)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}}
walk(ast);assert(initializer,'Actual front-door governance service missing');
const context=vm.createContext({a:ts.__awaiter,i:ts.__generator,r:ts.__spreadArray,Kt:{SPHttpClient:{configurations:{v1:{}}}},console:{error:()=>{}},Date,Math,JSON,Number,String,Array,Object,Promise});
const Service=vm.runInContext('('+source.slice(initializer.start,initializer.end)+')',context,{timeout:1000});
const site='https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo',email='samuel.conrad@osscontact.com';
const schema=JSON.parse(fs.readFileSync(path.join(root,'evidence/provisioned-schema.json'),'utf8'));
async function test(kind,governance){
 const requests=[];let id=0;
 const spHttpClient={post:async(url,configuration,request)=>{requests.push({url,body:JSON.parse(request.body)});return {ok:true,status:201,json:async()=>({Id:++id})}},get:async()=>{throw Error('Unexpected GET in submission test')}};
 const svc=new Service({pageContext:{web:{absoluteUrl:site},user:{email,displayName:'Sam — synthetic fixture'}},spHttpClient});
 const result=await svc.submitWorkflow(kind,{originalAnswers:{name:'Sam — synthetic fixture',email,workToImprove:'Prepare a synthetic weekly update',painPoints:'Manual copy/paste in a made-up example',informationCategories:['public'],companyDataOrWorkflow:'no',externalUsers:'no',autonomousActions:'no',estimatedMonthlyCost:0,desiredOutcome:'A reviewed draft'},confirmedSummary:{problemToSolve:'Synthetic manual copy/paste example',desiredOutcome:'A reviewed draft'}});
 assert(result.connected);assert.strictEqual(requests.length,governance?2:1);
 assert(requests.every(r=>r.url.startsWith(site+'/_api/')));
 const intake=requests[0].body;assert(intake.IntakeId.startsWith('OVT-AICOE-'));
 if(governance){
  const core=requests[1].body;assert(requests[1].url.includes("getbytitle('AI CoE Use Cases')"));
  assert.strictEqual(core.CoEID,intake.IntakeId);assert.strictEqual(core.Status,'Submitted');assert.strictEqual(core.IntakeProcessed,false);
  assert(core.BusinessProblem&&core.BusinessOwnerEmail&&core.DataSensitivity);
  for(const key of Object.keys(core))assert(schema['AI CoE Use Cases'].includes(key),'Missing provisioned field '+key);
  assert(result.governanceItemId);
 }
 return {workflow:kind,postedLists:requests.map(r=>r.url),recordCount:requests.length,sharesIntakeId:!governance||requests[1].body.CoEID===intake.IntakeId};
}
(async()=>{
 const results=[];for(const [kind,g]of [['idea',true],['toolCheck-review-request',true],['teamUsage',true],['helpTraining',false],['feedback',false]])results.push(await test(kind,g));
 const reads=[];const svc=new Service({});svc.getListItems=async(name,fields,order,top)=>{reads.push({name,fields:fields.split(','),order,top});return []};await svc.getAdminDashboardData();
 for(const q of reads)if(q.name!=='AI CoE Pilot Intakes')for(const field of q.fields)assert(schema[q.name].includes(field),'Unprovisioned admin field '+q.name+'/'+field);
 const evidence={status:'PASS',testBoundary:'Actual packaged JavaScript; HTTP responses are explicit local fixtures, not live APIs.',submissionCases:results,dashboardQueries:reads};
 fs.writeFileSync(path.join(root,'evidence/frontend-contract-test.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
