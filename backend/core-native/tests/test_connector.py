"""Executes the exact custom-connector Script.cs locally, not a Python model."""
import copy, json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DOTNET='/home/far_cdx/.cache/oss-demo-dotnet/dotnet'
DLL=ROOT/'connector/local/bin/Release/net10.0/CoreHarness.dll'

def invoke(mode,payload):
    assert DLL.exists(), 'Production custom connector has not been compiled'
    p=subprocess.run([DOTNET,str(DLL)],input=json.dumps({'Mode':mode,'Payload':json.dumps(payload)}),text=True,capture_output=True)
    assert p.returncode==0,p.stderr
    return json.loads(p.stdout)

def request(op='CreateOrResumeWork', **updates):
    r={'Context':{'CorrelationID':'CORR-T1','IdempotencyKey':'intent-0001','ClientVersion':'1.0.0.17','TenantLabel':'TEST','TestRecord':True},'S1':{'Title':'Synthetic','SourceChannel':'TEST','ProblemStatement':'problem','DesiredOutcome':'outcome','Sponsor':'sponsor@example.invalid','AccountableOwner':'owner@example.invalid'}}
    if op!='CreateOrResumeWork':
        r.pop('S1'); r['WorkID']='CW-TEST-1'
    r.update(updates)
    return {'Row':{'ID':1,'Title':'intent-0001','ContractVersion':'v0.2.0','Operation':op,'WorkID':r.get('WorkID',''),'RequestJson':json.dumps(r),'TestRecord':True,'AuthorId':7,'Author':{'Id':7,'EMail':'alice@example.invalid'}},'Config':{'TenantLabel':'TEST','RuntimeMode':'UAT','UatSiteUrl':'https://test.invalid','SiteUrl':'https://test.invalid','UatPrincipals':['alice@example.invalid'],'NativeQualified':True,'SecurityQualified':True,'SendEnabled':False},'Now':'2026-09-23T12:00:00Z','Data':{'Cases':[],'Evidence':[],'Decisions':[],'Outbox':[],'Receipts':[],'Events':[],'Authority':[]},'Complete':True}

def test_strict_validation_author_identity_and_context():
    p=request(); r=invoke('Validate',p)
    assert r['Valid'] is True and r['Actor']=='alice@example.invalid'
    for key,value in [('bad',1),('WorkID',"CW-X' or 1 eq 1")]:
        q=copy.deepcopy(p); b=json.loads(q['Row']['RequestJson']); b[key]=value; q['Row']['RequestJson']=json.dumps(b)
        assert invoke('Validate',q)['Valid'] is False
    for mutate in ['spoof','context','boolean','empty_author']:
        q=copy.deepcopy(p); b=json.loads(q['Row']['RequestJson'])
        if mutate=='spoof': b['S1']['Requester']='victim@example.invalid'
        if mutate=='context': b['Context']['IdempotencyKey']='another-key'
        if mutate=='boolean': b['Context']['TestRecord']='false'
        if mutate=='empty_author': q['Row']['Author']['EMail']=''
        q['Row']['RequestJson']=json.dumps(b)
        assert invoke('Validate',q)['Valid'] is False,mutate


def rows_from_plan(plan, data=None):
    data=copy.deepcopy(data or request()['Data'])
    for i,w in enumerate(plan['Writes']):
        rows=data.setdefault(w['List'],[])
        old=next((r for r in rows if r['Title']==w['Key']),None)
        row={'ID':(old or {}).get('ID',i+1),'@odata.etag':'"1"',**w['Fields']}
        if old: rows.remove(old)
        rows.append(row)
    return data


def test_create_and_readiness_require_complete_s1_and_full_required_set():
    p=request(); body=json.loads(p['Row']['RequestJson']); body['S1'].pop('ProblemStatement'); p['Row']['RequestJson']=json.dumps(body)
    plan=invoke('Plan',p)
    assert 'Writes' in plan, 'F04/F05: no production planner enforces required evidence coverage'
    case=next(w['Record'] for w in plan['Writes'] if w['List']=='Cases')
    assert case['State']=='CLARIFYING' and case['Requester']=='alice@example.invalid'
    assert not [w for w in plan['Writes'] if w['List']=='Evidence']
    q=request('RequestDecisionReadiness',ExpectedVersion=case['Version']); r=json.loads(q['Row']['RequestJson']); r['WorkID']=case['WorkID']; q['Row']['WorkID']=case['WorkID']; q['Row']['RequestJson']=json.dumps(r); q['Data']=rows_from_plan(plan)
    ready=invoke('Plan',q)
    assert ready['Response']['DecisionReadinessState']=='NOT_READY'
    assert 'S1_COMPLETE' in ready['Response']['BlockingGates']
    assert 'S2_S5_COMPLETE_OR_NA' in ready['Response']['BlockingGates']
    assert not any(w['List']=='Decisions' and w['Record']['Status']=='READY_FOR_DECISION' for w in ready['Writes'])


def command(op, data, wid, **fields):
    p=request(op,**fields); b=json.loads(p['Row']['RequestJson']); b['WorkID']=wid; p['Row']['WorkID']=wid; p['Row']['RequestJson']=json.dumps(b); p['Data']=copy.deepcopy(data); return p


def test_clarification_and_evidence_journey_invalidate_versions():
    created=invoke('Plan',request()); data=rows_from_plan(created); c=next(w['Record'] for w in created['Writes'] if w['List']=='Cases'); wid=c['WorkID']
    assert len(data['Evidence'])==4, 'F12: packet + outbox issuance must be in durable write set'
    assert len(data['Outbox'])==4
    listed=invoke('Plan',command('ListEvidencePackets',data,wid))
    assert len(listed['Response']['Packets'])==4
    ep=listed['Response']['Packets'][0]
    submit=invoke('Plan',command('SubmitEvidenceResponse',data,wid,EvidencePacketID=ep['EvidencePacketID'],ExpectedVersion=ep['Version'],Response='Synthetic evidence',KnownAssumedUnknown='KNOWN'))
    assert submit['Response']['PacketStatus']=='RETURNED'
    packet=next(w['Record'] for w in submit['Writes'] if w['List']=='Evidence')
    assert packet['ValidationKind']=='NONE'
    data=rows_from_plan(submit,data)
    denied=invoke('Plan',command('ValidateEvidencePacket',data,wid,EvidencePacketID=ep['EvidencePacketID'],ExpectedVersion=packet['Version'],Disposition='VALIDATED',Assertion='I verified the synthetic source',SourceRefs=['source:test']))
    assert denied['Response']['Result']=='DENIED'
    c=json.loads(data['Cases'][0]['RecordJson'])
    # Seed prior ready decision explicitly as a test fixture to reproduce material-change invalidation.
    data['Decisions']=[{'ID':88,'Title':'DP-OLD','@odata.etag':'"1"','RecordJson':json.dumps({'DecisionPacketID':'DP-OLD','WorkID':wid,'Status':'READY_FOR_DECISION','Version':1,'TestRecord':True})}]
    resumed=invoke('Plan',command('CreateOrResumeWork',data,wid,ExpectedVersion=c['Version'],S1={'ProblemStatement':None,'Risks':[]}))
    assert resumed['Response']['Work']['WorkID']==wid
    assert resumed['Response']['Work']['State']=='CLARIFYING'
    assert all(w['Record']['Status']=='EXPIRED' for w in resumed['Writes'] if w['List']=='Evidence')
    assert next(w['Record'] for w in resumed['Writes'] if w['List']=='Decisions')['Status']=='INVALIDATED'
    assert next(w['Record'] for w in resumed['Writes'] if w['List']=='Cases')['ContentVersion']==2


def business(p):
    p=copy.deepcopy(p); b=json.loads(p['Row']['RequestJson']); b['Context']['TestRecord']=False; p['Row']['TestRecord']=False; p['Row']['RequestJson']=json.dumps(b); p['Config']['RuntimeMode']='BUSINESS'; return p


def grant(wid, role, **extra):
    r={'Principal':'alice@example.invalid','Role':role,'WorkID':wid,'CaseContentVersion':1,'Active':True,'Accepted':True,'TestRecord':False,'SourceRefs':['fixture:authority-source'],'ReceiptID':'RCPT-AUTH-FIXTURE','ExpiresAt':'2026-10-23T12:00:00Z',**extra}
    return {'ID':100,'Title':role+extra.get('EvidenceType',''),'@odata.etag':'"1"','RecordJson':json.dumps(r)}


def test_business_readiness_requires_human_complete_current_evidence_and_affirmative_policy():
    p=business(request()); b=json.loads(p['Row']['RequestJson']); b['S1']['DecisionRequested']='Approve bounded work'; p['Row']['RequestJson']=json.dumps(b)
    created=invoke('Plan',p); data=rows_from_plan(created); wid=created['Response']['Work']['WorkID']
    for er in list(data['Evidence']):
        ep=json.loads(er['RecordJson']); kind=ep['EvidenceType']; data['Authority'].append(grant(wid,'EVIDENCE_VALIDATOR',EvidenceType=kind))
        sub=invoke('Plan',business(command('SubmitEvidenceResponse',data,wid,EvidencePacketID=ep['EvidencePacketID'],ExpectedVersion=1,Response='Synthetic validated source details',KnownAssumedUnknown='KNOWN'))); data=rows_from_plan(sub,data)
        validated=invoke('Plan',business(command('ValidateEvidencePacket',data,wid,EvidencePacketID=ep['EvidencePacketID'],ExpectedVersion=2,Disposition='VALIDATED',Assertion='Human fixture validates current source and assumptions',SourceRefs=['fixture:source'])));
        assert validated['Response']['Result']=='PASS'; data=rows_from_plan(validated,data)
    facts={k:False for k in ['strategic','material_multi_authority','financial_commitment','material_investment_threshold_met','new_vendor','new_tool','production_architecture_change','security_exception','regulated_process','risk_threshold_met','contract_commitment']}
    facts.update(capability_approved=True,workflow_bounded=True,risk_within_delegation=True,delegated_authority_bound=True)
    data['Authority'] += [grant(wid,'ROUTING_FACTS',Facts=facts),grant(wid,'AUTHORITY_AI_COE_FAST_PATH')]
    c=json.loads(data['Cases'][0]['RecordJson']); ready=business(command('RequestDecisionReadiness',data,wid,ExpectedVersion=c['Version']))
    ready['Config'].update(PolicySourceHash='51210529f823b1571e737c40f21a97921e498c60f8e132374171634138ccf736',PolicyAcceptanceReceipt='RCPT-POLICY-FIXTURE',PolicyBindingVersion='fixture-1',PolicyAccepted=True)
    response=invoke('Plan',ready)
    assert response['Response']['DecisionReadinessState']=='READY',response
    assert response['Response']['Work']['Lane']=='AI_COE_FAST_PATH'
    for defect in ['missing','duplicate','wrong_work','stale','provisional','no_facts','revoked','unbound_policy','na_unjustified']:
        bad=copy.deepcopy(ready)
        if defect=='missing': bad['Data']['Evidence']=bad['Data']['Evidence'][:1]
        if defect=='duplicate': bad['Data']['Evidence'].append(copy.deepcopy(bad['Data']['Evidence'][0]))
        if defect in ['wrong_work','stale','provisional','na_unjustified']:
            r=json.loads(bad['Data']['Evidence'][0]['RecordJson'])
            if defect=='wrong_work': r['WorkID']='CW-OTHER'
            if defect=='stale': r['CaseContentVersion']=999
            if defect=='provisional': r['ValidationKind']='UAT_PROVISIONAL'
            if defect=='na_unjustified': r['Status']='NOT_APPLICABLE'; r['ValidatorAssertion']=''
            bad['Data']['Evidence'][0]['RecordJson']=json.dumps(r)
        if defect=='no_facts': bad['Data']['Authority']=[a for a in bad['Data']['Authority'] if a['Title']!='ROUTING_FACTS']
        if defect=='revoked': bad['Data']['Authority']=[]
        if defect=='unbound_policy': bad['Config']['PolicyAccepted']=False
        out=invoke('Plan',bad)
        assert out['Response']['DecisionReadinessState']=='NOT_READY',defect


def test_real_digest_readback_comparison_and_failure_receipt():
    import hashlib
    p=request(); plan=invoke('Plan',p); data=rows_from_plan(plan)
    assert 'PlanHash' in plan, 'F11: no integrity-bound durable plan'
    assert plan['PlanHash']!='0'*64
    write=plan['Writes'][0]; row=next(r for r in data[write['List']] if r['Title']==write['Key'])
    checked=invoke('InspectWrite',{'Write':write,'Rows':[row]})
    assert checked['Valid'] is True and checked['AlreadyApplied'] is True
    wrong=copy.deepcopy(row); wrong['RecordJson']='{}'
    assert invoke('VerifyRecord',{'Write':write,'Rows':[wrong]})['Valid'] is False
    wrong=copy.deepcopy(row); wrong['WorkID']='CW-WRONG'
    assert invoke('VerifyRecord',{'Write':write,'Rows':[wrong]})['Valid'] is False
    readbacks=[{'List':w['List'],'Key':w['Key'],'Rows':[next(r for r in data[w['List']] if r['Title']==w['Key'])]} for w in plan['Writes']]
    done=invoke('Finalize',{'Plan':plan,'Readbacks':readbacks})
    receipt=done['Receipt']['Record']
    assert receipt['PayloadHash']==receipt['ReadbackHash'] and len(receipt['ReadbackHash'])==64
    assert done['Event']['Record']['ReceiptID']==receipt['ReceiptID']==done['Response']['ReceiptID']
    assert invoke('Finalize',{'Plan':plan,'Readbacks':readbacks[:-1]})['Valid'] is False
    assert invoke('Digest',{'Value':{'b':2,'a':1}})['Hash']==hashlib.sha256(b'{"a":1,"b":2}').hexdigest()
