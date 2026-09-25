"""Actual generated WDL + exact compiled C#; external SharePoint is simulated."""
import copy, json
import pytest
import flows
from wdl_harness import Helper, Engine, SharePointFixture, Crash

@pytest.fixture(scope='module')
def helper():
    h=Helper()
    yield h
    h.p.terminate(); h.p.wait(timeout=10)

def run(sp,helper,fn=flows.flow_01):
    e=Engine(fn(),sp,helper);e.run();return e

def test_generated_create_persists_verified_response_and_read_grant(helper):
    sp=SharePointFixture(page_size=7);run(sp,helper)
    assert len(sp.tables['Cases'])==1
    assert len(sp.tables['Evidence'])==len(sp.tables['Outbox'])==4
    r=sp.tables['Results'][0];response=json.loads(r['ResponseJson'])
    assert r['Published'] is True and response['Created'] is True
    assert sp.grants[('Results',r['ID'])]=={99:5,7:2}
    receipt=json.loads(sp.tables['Receipts'][0]['RecordJson'])
    assert receipt['PayloadHash']==receipt['ReadbackHash']
    assert receipt['ReceiptID']==response['ReceiptID']==sp.tables['Events'][0]['ReceiptID']
    old=copy.deepcopy(sp.tables);run(sp,helper)
    assert {k:v for k,v in sp.tables.items() if k!='Log'}=={k:v for k,v in old.items() if k!='Log'}


def enqueue(sp,operation,work='',**fields):
    row=copy.deepcopy(sp.tables['Requests'][0]);row.pop('ID');row.pop('Id');row.pop('@odata.etag')
    key='intent-'+str(len(sp.tables['Requests'])+1).zfill(6)
    payload={'Context':{**json.loads(row['RequestJson'])['Context'],'IdempotencyKey':key},**fields}
    if work:payload['WorkID']=work
    row.update(Title=key,Operation=operation,WorkID=work,RequestJson=json.dumps(payload))
    return sp.insert('Requests',row,effect=False)


def test_crash_after_every_durable_boundary_resumes_without_duplicates(helper):
    baseline=SharePointFixture();run(baseline,helper)
    for boundary in range(1,len(baseline.effects)+1):
        sp=SharePointFixture();sp.crash_after=boundary
        with pytest.raises(Crash):run(sp,helper)
        sp.crash_after=None;sp.now='2026-09-23T12:16:00Z';run(sp,helper)
        assert len(sp.tables['Cases'])==1,(boundary,sp.effects)
        assert len(sp.tables['Evidence'])==4
        assert len(sp.tables['Receipts'])==len(sp.tables['Events'])==len(sp.tables['Results'])==1
        assert sp.tables['Results'][0]['Published'] is True
        assert json.loads(sp.tables['Results'][0]['ResponseJson'])['Created'] is True
        assert sp.tables['Journal'][0]['State']=='IDLE'


def test_generated_clarification_packets_conflict_and_rejection(helper):
    sp=SharePointFixture();run(sp,helper)
    wid=sp.tables['Cases'][0]['Title']
    enqueue(sp,'ListEvidencePackets',wid);run(sp,helper)
    packets=json.loads(sp.tables['Results'][-1]['ResponseJson'])['Packets'];assert len(packets)==4
    ep=packets[0]
    enqueue(sp,'SubmitEvidenceResponse',wid,EvidencePacketID=ep['EvidencePacketID'],ExpectedVersion=1,Response='Current source',KnownAssumedUnknown='KNOWN');run(sp,helper)
    assert json.loads(sp.tables['Results'][-1]['ResponseJson'])['PacketStatus']=='RETURNED'
    enqueue(sp,'CreateOrResumeWork',wid,ExpectedVersion=1,S1={'Title':'STALE'});run(sp,helper)
    assert json.loads(sp.tables['Results'][-1]['ResponseJson'])['ErrorClass']=='VERSION_CONFLICT'
    enqueue(sp,'CreateOrResumeWork',wid,ExpectedVersion=2,S1={'ProblemStatement':None});run(sp,helper)
    assert json.loads(sp.tables['Cases'][0]['RecordJson'])['State']=='CLARIFYING'
    assert all(r['Status']=='EXPIRED' for r in sp.tables['Evidence'])
    enqueue(sp,'GetWorkStatus','CW-NOT-FOUND');run(sp,helper)
    assert json.loads(sp.tables['Results'][-1]['ResponseJson'])['Result']=='DENIED'
    bad=enqueue(sp,'CreateOrResumeWork',S1={'Title':'X','SourceChannel':'TEST'})
    bad['RequestJson']='{"Context":null}'
    sp.tables['Requests'][-1]['RequestJson']=bad['RequestJson'];run(sp,helper)
    assert json.loads(sp.tables['Results'][-1]['ResponseJson'])['ErrorClass']=='VALIDATION_FAILED'


@pytest.mark.parametrize('defect',['authority','configuration','claim','canonical'])
def test_revocation_or_tampering_during_write_cannot_publish(helper,defect):
    sp=SharePointFixture()
    def hook(s,name):
        if not name.startswith('insert:Evidence:'):return
        s.hook=None
        if defect=='authority':s.insert('Authority',{'Title':'changed','RecordJson':'{}'},effect=False)
        if defect=='configuration':
            next(r for r in s.tables['Definitions'] if r['Title']=='NativeQualified')['Value']='false'
        if defect=='claim':s.tables['Journal'][0]['ClaimToken']='another-run'
        if defect=='canonical':s.tables['Evidence'][0]['RecordJson']='{}'
    sp.hook=hook
    with pytest.raises(RuntimeError):run(sp,helper)
    assert not any(r.get('Published') for r in sp.tables['Results'])


def test_background_graphs_page_schedule_single_writer_and_health(helper):
    sp=SharePointFixture(page_size=2);run(sp,helper)
    sp.now='2026-10-05T12:00:00Z'
    run(sp,helper,flows.flow_02)
    assert sp.tables['SystemRequests']
    original=copy.deepcopy(sp.tables['SystemRequests']);run(sp,helper,flows.flow_02)
    assert sp.tables['SystemRequests']==original
    run(sp,helper)
    assert all(r['LastReminderAt'] and r['EscalationAt'] for r in sp.tables['Evidence'])
    assert len(sp.tables['Outbox'])==12
    assert all(r['State']=='SUPPRESSED' for r in sp.tables['Outbox'])
    assert len(sp.tables['Results'])==1,'maintenance must never publish an employee result'
    run(sp,helper,flows.flow_04)
    e=run(sp,helper,flows.flow_05)
    assert e.bodies['Evaluate_Health']['Counts']['OverdueEvidence']==4
    assert e.bodies['Evaluate_Health']['Counts']['DisabledFlows']==5


def test_safe_hash_projection_readback_and_private_receipt(helper):
    sp=SharePointFixture();run(sp,helper)
    wid=sp.tables['Cases'][0]['Title']
    enqueue(sp,'CreateOrResumeWork',wid,ExpectedVersion=1,S1={'Title':'<script>alert(1)</script> [x](https://evil.invalid)'});run(sp,helper)
    run(sp,helper,flows.flow_03)
    assert len(sp.files)==1
    content=next(iter(sp.files.values()))
    assert '<script>' not in content and '[x](' not in content
    run(sp,helper)
    record=json.loads(sp.tables['Receipts'][-1]['RecordJson'])
    assert record['OperationClass']=='VERIFIED_PROJECTION'
    assert record['PayloadHash']==record['ReadbackHash']
    before=copy.deepcopy(sp.files);run(sp,helper,flows.flow_03);assert before==sp.files


def test_sharepoint_datetime_normalization_is_compared_semantically(helper):
    from test_connector import request,rows_from_plan
    plan=helper('Plan',request());data=rows_from_plan(plan)
    w=next(w for w in plan['Writes'] if w['List']=='Evidence')
    row=next(r for r in data['Evidence'] if r['Title']==w['Key'])
    row['DueAt']='2026-09-28T12:00:00Z'
    assert helper('VerifyRecord',{'Write':w,'Rows':[row]})['Valid'] is True
    row['DueAt']='2026-09-29T12:00:00Z'
    assert helper('VerifyRecord',{'Write':w,'Rows':[row]})['Valid'] is False


def test_background_recovers_missing_packets_suppresses_queued_and_reports_due_cases(helper):
    sp=SharePointFixture(page_size=2);run(sp,helper)
    sp.tables['Evidence'].pop();sp.tables['Outbox'].pop()
    run(sp,helper,flows.flow_02);run(sp,helper)
    assert len(sp.tables['Evidence'])==len(sp.tables['Outbox'])==4
    out=sp.tables['Outbox'][0];record=json.loads(out['RecordJson']);record['State']='QUEUED';out.update(State='QUEUED',RecordJson=json.dumps(record))
    run(sp,helper,flows.flow_04);run(sp,helper)
    assert sp.tables['Outbox'][0]['State']=='SUPPRESSED'
    case=sp.tables['Cases'][0];record=json.loads(case['RecordJson']);record['NextDate']='2026-09-22';case['RecordJson']=json.dumps(record)
    e=run(sp,helper,flows.flow_05)
    assert e.bodies['Evaluate_Health']['Warning'] is True
    assert e.bodies['Evaluate_Health']['Counts']['OverdueCases']==1
    assert e.bodies['Evaluate_Health']['Counts']['SilentEnabledFlows']==0
    next(r for r in sp.tables['Definitions'] if r['Title']=='FlowEnabled')['Value']=json.dumps({'01':True,'02':False,'03':False,'04':False,'05':False})
    sp.now='2026-09-25T12:00:00Z';e=run(sp,helper,flows.flow_05)
    assert e.bodies['Evaluate_Health']['Counts']['SilentEnabledFlows']==1
    run(sp,helper);e=run(sp,helper,flows.flow_05)
    assert e.bodies['Evaluate_Health']['Counts']['SilentEnabledFlows']==0


def test_interleaved_writers_reject_stale_claim_etag(helper):
    sp=SharePointFixture()
    first=Engine(flows.flow_01(),sp,helper);second=Engine(flows.flow_01(),sp,helper)
    names=list(first.flow.actions);boundary=names.index('If_Selected')
    for engine in (first,second):
        engine.block({n:engine.flow.actions[n] for n in names[:boundary]})
    first.block({n:first.flow.actions[n] for n in names[boundary:]})
    with pytest.raises(RuntimeError,match='412 ETag precondition'):
        second.block({n:second.flow.actions[n] for n in names[boundary:]})
    assert len(sp.tables['Cases'])==len(sp.tables['Results'])==len(sp.tables['Receipts'])==1
    assert sp.tables['Journal'][0]['State']=='IDLE'


def test_published_but_uncompleted_intent_repairs_missing_receipt(helper):
    sp=SharePointFixture()
    def interrupt(s,name):
        if name.startswith('cas:Results:') and s.tables['Results'][0]['Published']:
            s.tables['Receipts'].clear()
            raise Crash('published before journal completion, receipt unavailable')
    sp.hook=interrupt
    with pytest.raises(Crash):run(sp,helper)
    stored=sp.tables['Results'][0]['ResponseJson']
    sp.hook=None;sp.now='2026-09-23T12:16:00Z';run(sp,helper)
    assert sp.tables['Results'][0]['ResponseJson']==stored
    assert len(sp.tables['Cases'])==len(sp.tables['Receipts'])==len(sp.tables['Events'])==1
    assert sp.tables['Receipts'][0]['Title']==json.loads(stored)['ReceiptID']
    assert sp.tables['Journal'][0]['State']=='IDLE'


def test_other_author_cannot_read_existing_or_missing_work(helper):
    sp=SharePointFixture();run(sp,helper);wid=sp.tables['Cases'][0]['Title']
    next(r for r in sp.tables['Definitions'] if r['Title']=='UatPrincipals')['Value']=json.dumps(['alice@example.invalid','bob@example.invalid'])
    responses=[]
    for target in (wid,'CW-ABSENT'):
        enqueue(sp,'GetWorkStatus',target)
        sp.tables['Requests'][-1].update(AuthorId=8,Author={'Id':8,'EMail':'bob@example.invalid'})
        run(sp,helper);r=sp.tables['Results'][-1]
        response=json.loads(r['ResponseJson']);response.pop('ReceiptID');responses.append(response)
        assert sp.grants[('Results',r['ID'])]=={99:5,8:2}
    assert responses[0]==responses[1]
    assert responses[0]['Result']=='DENIED'

