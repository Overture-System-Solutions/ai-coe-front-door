"""3.0.0.1 native execution graph; derives identities/helpers from source-pinned wdl.py.
Only flow 01 writes case/evidence/decision/outbox state. Other flows enqueue private
maintenance or project verified immutable files. No invented WDL functions.
"""
from __future__ import annotations
import os, json
import model as M
from wdl import Flow, recurrence, q

HELPER_API='UNBOUND_CORE_INTEGRITY'
HELPER_LOGICAL='aicoe_coreintegrity'
HELPER_ID=None
HELPER_REF='aicoe_coreintegrity'
SECURE={'secureData':{'properties':['inputs','outputs']}}
HEADERS={'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata'}
TABLES=['Requests','Results','Journal','Cases','Evidence','Decisions','Outbox','Receipts','Events','Authority','SystemRequests','Log']

class NativeFlow(Flow):
    def definition(self):
        d=super().definition()
        d['properties']['connectionReferences']['core_integrity']={'runtimeSource':'embedded','connection':{'connectionReferenceLogicalName':HELPER_REF},'api':{'name':HELPER_API,'logicalName':HELPER_LOGICAL}}
        return d


def secure(a):
    a['runtimeConfiguration']={**a.get('runtimeConfiguration',{}),**SECURE}
    return a


def call(mode,payload):
    return secure({'type':'OpenApiConnection','inputs':{'host':{'connectionName':'core_integrity','operationId':'Evaluate','apiId':''},'parameters':{'body/Mode':mode,'body/Payload':payload},'authentication':"@parameters('$authentication')",'retryPolicy':{'type':'none'}}})


def body_expression(value):
    if isinstance(value,str) and value.startswith('@'): return value[1:]
    if isinstance(value,dict):
        expr="json('{}')"
        for key,val in value.items(): expr='setProperty('+expr+', '+q(key)+', '+body_expression(val)+')'
        return expr
    return 'json('+q(json.dumps(value,separators=(',',':')))+')'


def http(f,method,uri,body=None,etag=None):
    headers=dict(HEADERS)
    if etag is not None: headers.update({'IF-MATCH':etag,'X-HTTP-Method':'MERGE'})
    # HttpRequest's body parameter is a string. Evaluate members BEFORE serialization.
    if isinstance(body,dict): body='@string('+body_expression(body)+')'
    a=f.sp_http(method,uri,body,headers)
    a['inputs']['retryPolicy']={'type':'none'}
    return secure(a)


def add(f,block,last,name,a,after=None): return f.add(name,secure(a),into=block,last=last,run_after=after)


def invoke(f,b,l,name,mode,payload,check=True):
    add(f,b,l,name+'_Input',f.compose(payload))
    add(f,b,l,name,call(mode,f"@string(outputs('{name}_Input'))"))
    if check: add(f,b,l,name+'_Assert',f.compose(f"@if(equals(body('{name}')?['Valid'], true), true, int('CORE_{name}_FAILED_CLOSED'))"))


def list_uri(key): return "@concat('_api/web/lists(guid''', outputs('Cfg')?['ListId_"+key+"'], ''')/items')"


def item_uri(key,idexpr): return "@concat('_api/web/lists(guid''', outputs('Cfg')?['ListId_"+key+"'], ''')/items(', string("+idexpr+"), ')')"


def query_uri(key,keyexpr):
    return "@concat('_api/web/lists(guid''', outputs('Cfg')?['ListId_"+key+"'], ''')/items?$filter=Title eq ''', replace("+keyexpr+", '''', ''''''), '''&$top=2')"


def dynamic_query(w):
    return "@concat('_api/web/lists(guid''', outputs('Cfg')?[concat('ListId_', "+w+"?['List'])], ''')/items?$filter=Title eq ''', replace("+w+"?['Key'], '''', ''''''), '''&$top=2')"


def collect(f,b,l,label,uri):
    """Drain official REST nextLink, or fail the Until (never accept a cap as complete)."""
    add(f,b,l,label+'_ResetRows',f.set_var('Rows',[]))
    add(f,b,l,label+'_SetNext',f.set_var('Next',uri))
    loop,ll={},[None]
    add(f,loop,ll,label+'_GetPage',http(f,'GET',"@variables('Next')"))
    invoke(f,loop,ll,label+'_Page','Page',{'Page':f"@body('{label}_GetPage')",'SiteUrl':f._site()})
    add(f,loop,ll,label+'_AppendRows',f.compose(f"@union(variables('Rows'), body('{label}_Page')?['Rows'])"))
    add(f,loop,ll,label+'_SetRows',f.set_var('Rows',f"@outputs('{label}_AppendRows')"))
    add(f,loop,ll,label+'_Advance',f.set_var('Next',f"@body('{label}_Page')?['Next']"))
    add(f,b,l,label+'_Until',{'type':'Until','expression':"@equals(variables('Next'), '')",'limit':{'count':5000,'timeout':'PT1H'},'actions':loop})


def setup(f):
    for name,typ,value in [('Rows','array',[]),('Next','string',''),('Data','object',{}),('Prepared','object',{}),('Readbacks','array',[])]:
        f.add('Init_'+name,f.init_var(name,typ,value))
    collect(f,None,None,'Definitions',"_api/web/lists/getbytitle('AI CoE Definitions')/items?$top=200&$orderby=Id")
    invoke(f,None,None,'Parse_Config','Config',{'Rows':"@variables('Rows')",'SiteUrl':f._site()})
    f.add('Cfg',secure(f.compose("@body('Parse_Config')?['Config']")))
    f.add('Configuration_Qualified',secure(f.compose("@if(and(equals(outputs('Cfg')?['NativeQualified'], true), equals(outputs('Cfg')?['SecurityQualified'], true), equals(outputs('Cfg')?['SendEnabled'], false)), true, int('CORE_UNQUALIFIED'))")))
    loop,ll={},[None]
    uri="@concat('_api/web/lists(guid''', outputs('Cfg')?[concat('ListId_', items('For_each_table'))], ''')/items?$top=200&$orderby=Id', if(or(equals(items('For_each_table'), 'Requests'), equals(items('For_each_table'), 'SystemRequests')), '&$select=*,Author/Id,Author/EMail&$expand=Author', ''))"
    collect(f,loop,ll,'Snapshot',uri)
    add(f,loop,ll,'Next_Data',f.compose("@setProperty(variables('Data'), items('For_each_table'), variables('Rows'))"))
    add(f,loop,ll,'Store_Data',f.set_var('Data',"@outputs('Next_Data')"))
    f.add('Tables', f.compose(TABLES))
    f.add('For_each_table',f.foreach("@outputs('Tables')",loop))
    f.add('RunStart',f.compose('@utcNow()'))


def context(row="body('Pick_Command')?['Row']"):
    return {'Row':'@'+row,'Data':"@variables('Data')",'Config':"@outputs('Cfg')",'Now':"@outputs('RunStart')",'Complete':True}


def persist_record(f,b,l,label,w,mutable=False,proof=False):
    """Create-only or exact-ETag mutation; a retry reconciles actual content first."""
    add(f,b,l,'Find_'+label,http(f,'GET',dynamic_query(w)))
    inspect='Inspect_Write' if label=='Record' else 'Inspect_'+label
    invoke(f,b,l,inspect,'InspectWrite',{'Write':'@'+w,'Rows':f"@body('Find_{label}')?['value']"})
    change,cl={},[None]
    create_name='Create_'+label
    create_uri="@concat('_api/web/lists(guid''', outputs('Cfg')?[concat('ListId_', "+w+"?['List'])], ''')/items')"
    if mutable:
        update,ul={},[None]; insert,il={},[None]
        update_uri="@concat('_api/web/lists(guid''', outputs('Cfg')?[concat('ListId_', "+w+"?['List'])], ''')/items(', string("+w+"?['ItemID']), ')')"
        add(f,update,ul,'CAS_'+label,http(f,'POST',update_uri,'@'+w+"?['Fields']",'@'+w+"?['ExpectedETag']"))
        add(f,insert,il,create_name,http(f,'POST',create_uri,'@'+w+"?['Fields']"))
        add(f,change,cl,'If_'+label+'_Exists',f.condition({'greater':['@'+w+"?['ItemID']",0]},update,insert))
    else: add(f,change,cl,create_name,http(f,'POST',create_uri,'@'+w+"?['Fields']"))
    add(f,b,l,'If_'+label+'_NeedsWrite',f.condition({'equals':[f"@body('{inspect}')?['AlreadyApplied']",False]},change))
    add(f,b,l,'Readback_'+label,http(f,'GET',dynamic_query(w)))
    verify='Verify_Readback' if label=='Record' else 'Verify_'+label
    invoke(f,b,l,verify,'VerifyRecord',{'Write':'@'+w,'Rows':f"@body('Readback_{label}')?['value']"})
    if proof: add(f,b,l,'Remember_Readback',f.append_var('Readbacks',{'List':'@'+w+"?['List']",'Key':'@'+w+"?['Key']",'Rows':f"@body('Readback_{label}')?['value']"}))


def guard(f,b,l,label):
    add(f,b,l,label+'_Claim',http(f,'GET',item_uri('Journal',"body('Pick_Command')?['Slot']?['ID']")))
    invoke(f,b,l,label+'_Lease','Lease',{'Slot':"@body('"+label+"_Claim')",'Token':"@workflow()?['run']?['name']",'Now':'@utcNow()'})
    collect(f,b,l,label+'_Authority',list_uri('Authority'))
    add(f,b,l,label+'_Data',f.compose("@setProperty(variables('Data'), 'Authority', variables('Rows'))"))
    collect(f,b,l,label+'_Definitions',"_api/web/lists/getbytitle('AI CoE Definitions')/items?$top=200&$orderby=Id")
    invoke(f,b,l,label+'_Config','Config',{'Rows':"@variables('Rows')",'SiteUrl':f._site()})
    invoke(f,b,l,label+'_Recheck','Recheck',{'Plan':"@outputs('Plan')",'Data':"@outputs('"+label+"_Data')",'Config':"@body('"+label+"_Config')?['Config']",'Now':'@utcNow()'})


def safe_failure(f,anchor):
    f.add('Heartbeat',http(f,'POST',list_uri('Log'),{'Title':"@concat('LOG-',guid())",'Flow':f.name,'RunId':"@workflow()?['run']?['name']",'Level':'Succeeded','Message':'HEARTBEAT','LoggedAt':'@utcNow()'}),run_after={anchor:['Succeeded']})
    f.add('Failure_ContentFree',http(f,'POST',list_uri('Log'),{'Title':"@concat('LOG-',guid())",'Flow':f.name,'RunId':"@workflow()?['run']?['name']",'Level':'Error','Message':'Native operation interrupted. Existing intent retained. Inspect private journal; never resubmit under a new mutation key.','LoggedAt':'@utcNow()'}),run_after={anchor:['Failed','TimedOut']})


def flow_01(literal=None):
    f=NativeFlow('AI CoE 01 Case Command','3.0.0.1 sole canonical writer. Immutable Author-derived ingress; durable plans, recoverable same-intent lease, exact ETag CAS, content comparison, actual receipts, per-item result grants. No Send.',recurrence('Minute',5),literal=literal)
    setup(f)
    invoke(f,None,None,'Pick_Command','Pick',{'Data':"@variables('Data')",'Now':"@outputs('RunStart')"})
    txn,tl={},[None]
    add(f,txn,tl,'Claim_Writer_CAS',http(f,'POST',item_uri('Journal',"body('Pick_Command')?['Slot']?['ID']"),{'ActiveIntent':"@body('Pick_Command')?['JournalKey']",'State':'ACTIVE','ClaimToken':"@workflow()?['run']?['name']",'LeaseUntil':"@addMinutes(utcNow(), 15)"},"@body('Pick_Command')?['SlotETag']"))
    add(f,txn,tl,'Read_Claim',http(f,'GET',item_uri('Journal',"body('Pick_Command')?['Slot']?['ID']")))
    add(f,txn,tl,'Assert_Claim',f.compose("@if(equals(body('Read_Claim')?['ClaimToken'], workflow()?['run']?['name']), true, int('CLAIM_LOST'))"))
    fresh,fl={},[None]
    invoke(f,fresh,fl,'Validate_Ingress','Validate',context(),check=False)
    good,gl={},[None]; bad,bl={},[None]
    invoke(f,good,gl,'Build_Plan','Plan',context())
    add(f,good,gl,'Use_Valid_Plan',f.set_var('Prepared',"@body('Build_Plan')"))
    invoke(f,bad,bl,'Build_Invalid_Plan','InvalidPlan',context())
    add(f,bad,bl,'Use_Invalid_Plan',f.set_var('Prepared',"@body('Build_Invalid_Plan')"))
    add(f,fresh,fl,'If_Valid_Ingress',f.condition({'equals':["@body('Validate_Ingress')?['Valid']",True]},good,bad))
    add(f,fresh,fl,'Persist_Plan',http(f,'POST',list_uri('Journal'),{'Title':"@body('Pick_Command')?['JournalKey']",'State':'PREPARED','RequestItemID':"@body('Pick_Command')?['Row']?['ID']",'RequestHash':"@variables('Prepared')?['RequestHash']",'PlanJson':"@string(variables('Prepared'))",'PlanHash':"@variables('Prepared')?['PlanHash']"}))
    add(f,txn,tl,'If_No_Persisted_Plan',f.condition({'equals':["@empty(body('Pick_Command')?['Journal'])",True]},fresh))
    add(f,txn,tl,'Read_Persisted_Plan',http(f,'GET',query_uri('Journal',"body('Pick_Command')?['JournalKey']")))
    invoke(f,txn,tl,'Load_Persisted_Plan','LoadPlan',{'Journal':"@first(body('Read_Persisted_Plan')?['value'])",'Row':"@body('Pick_Command')?['Row']"})
    add(f,txn,tl,'Plan',f.compose("@body('Load_Persisted_Plan')?['Plan']"))
    # Persisted authority/configuration must still match. Recovery never replans a partially applied operation.
    invoke(f,txn,tl,'Recheck_Authority','Recheck',{'Plan':"@outputs('Plan')",'Data':"@variables('Data')",'Config':"@outputs('Cfg')",'Now':'@utcNow()'})
    wb,wl={},[None]
    guard(f,wb,wl,'Before_Write')
    persist_record(f,wb,wl,'Record',"items('For_each_write')",mutable=True,proof=True)
    add(f,txn,tl,'For_each_write',f.foreach("@outputs('Plan')?['Writes']",wb))
    guard(f,txn,tl,'Before_Receipt')
    projection,pl={},[None]
    add(f,projection,pl,'ReRead_Projection',http(f,'GET',"@concat('_api/web/GetFileByServerRelativeUrl(''', replace(outputs('Plan')?['ProjectionProof']?['Path'], '''', ''''''), ''')/$value')"))
    invoke(f,projection,pl,'Verify_Projection_Proof','VerifyProjection',{'Proof':"@outputs('Plan')?['ProjectionProof']",'Content':"@body('ReRead_Projection')"})
    add(f,txn,tl,'If_Projection_Proof',f.condition({'equals':["@outputs('Plan')?['Operation']",'RecordProjection']},projection))
    invoke(f,txn,tl,'Finalize_Compared','Finalize',{'Plan':"@outputs('Plan')",'Readbacks':"@variables('Readbacks')"})
    persist_record(f,txn,tl,'Receipt',"body('Finalize_Compared')?['Receipt']")
    persist_record(f,txn,tl,'Event',"body('Finalize_Compared')?['Event']")
    user_result,ur={},[None]
    # Result is inaccessible until the item's Author-derived read grant succeeds.
    invoke(f,user_result,ur,'Result_Descriptor','Result',{'Plan':"@outputs('Plan')",'Response':"@body('Finalize_Compared')?['Response']"})
    add(f,user_result,ur,'Find_Result',http(f,'GET',query_uri('Results',"outputs('Plan')?['Key']")))
    invoke(f,user_result,ur,'Inspect_Result','InspectWrite',{'Write':"@body('Result_Descriptor')?['Write']",'Rows':"@body('Find_Result')?['value']"})
    create,cl={},[None]
    add(f,create,cl,'Create_Result',http(f,'POST',list_uri('Results'),"@setProperty(body('Result_Descriptor')?['Write']?['Fields'], 'Published', false)"))
    add(f,user_result,ur,'If_Result_Missing',f.condition({'equals':["@body('Inspect_Result')?['AlreadyApplied']",False]},create))
    add(f,user_result,ur,'Read_Result',http(f,'GET',query_uri('Results',"outputs('Plan')?['Key']")))
    invoke(f,user_result,ur,'Verify_Result','VerifyRecord',{'Write':"@body('Result_Descriptor')?['Write']",'Rows':"@body('Read_Result')?['value']"})
    add(f,user_result,ur,'ResultID',f.compose("@first(body('Read_Result')?['value'])?['Id']"))
    # Numeric identities are fetched from SharePoint, not supplied by request JSON.
    add(f,user_result,ur,'Read_Role',http(f,'GET','_api/web/roledefinitions?$filter=RoleTypeKind eq 2&$select=Id,RoleTypeKind'))
    add(f,user_result,ur,'One_Read_Role',f.compose("@if(equals(length(body('Read_Role')?['value']), 1), true, int('READ_ROLE_UNBOUND'))"))
    result_base="concat('_api/web/lists(guid''', outputs('Cfg')?['ListId_Results'], ''')/items(', string(outputs('ResultID')), ')')"
    guard(f,user_result,ur,'Before_Grant')
    add(f,user_result,ur,'Break_Result_Inheritance',http(f,'POST',"@concat("+result_base+", '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')"))
    add(f,user_result,ur,'Grant_Result_Read',http(f,'POST',"@concat("+result_base+", '/roleassignments/addroleassignment(principalid=', string(outputs('Plan')?['AuthorID']), ',roledefid=', string(first(body('Read_Role')?['value'])?['Id']), ')')"))
    add(f,user_result,ur,'Read_Result_Grants',http(f,'GET',"@concat("+result_base+", '/roleassignments?$expand=Member,RoleDefinitionBindings')"))
    invoke(f,user_result,ur,'Verify_Result_Grant','VerifyGrant',{'Grants':"@body('Read_Result_Grants')?['value']",'AuthorID':"@outputs('Plan')?['AuthorID']",'ServicePrincipalID':"@outputs('Cfg')?['ServicePrincipalID']"})
    add(f,user_result,ur,'Result_Before_Publish',http(f,'GET',item_uri('Results',"outputs('ResultID')")))
    add(f,user_result,ur,'Publish_Result',http(f,'POST',item_uri('Results',"outputs('ResultID')"),{'Published':True},"@coalesce(body('Result_Before_Publish')?['@odata.etag'], body('Result_Before_Publish')?['odata.etag'])"))
    add(f,user_result,ur,'Published_Readback',http(f,'GET',item_uri('Results',"outputs('ResultID')")))
    add(f,user_result,ur,'Assert_Published',f.compose("@if(equals(body('Published_Readback')?['Published'], true), true, int('RESULT_NOT_PUBLISHED'))"))
    add(f,txn,tl,'If_User_Result',f.condition({'equals':["@outputs('Plan')?['RequestSource']",'Requests']},user_result))
    add(f,txn,tl,'Complete_Journal',http(f,'POST',item_uri('Journal',"first(body('Read_Persisted_Plan')?['value'])?['ID']"),{'State':'COMPLETED'},"@coalesce(first(body('Read_Persisted_Plan')?['value'])?['@odata.etag'], first(body('Read_Persisted_Plan')?['value'])?['odata.etag'])"))
    add(f,txn,tl,'Release_Writer_CAS',http(f,'POST',item_uri('Journal',"body('Pick_Command')?['Slot']?['ID']"),{'ActiveIntent':None,'LeaseUntil':None,'State':'IDLE','ClaimToken':None},"@coalesce(body('Read_Claim')?['@odata.etag'], body('Read_Claim')?['odata.etag'])"))
    f.add('If_Selected',f.condition({'equals':["@body('Pick_Command')?['Selected']",True]},txn))
    safe_failure(f,'If_Selected')
    return f


def scheduler(name,mode,minutes,literal=None):
    f=NativeFlow(name,'Private idempotent maintenance ingress; canonical state changes execute only in flow 01. Disabled until qualification.',recurrence('Minute',minutes),literal=literal)
    setup(f)
    invoke(f,None,None,'Maintenance_Requests','Schedule',{'Data':"@variables('Data')",'Config':"@outputs('Cfg')",'Now':"@outputs('RunStart')",'Mode':mode})
    qb,ql={},[None]
    persist_record(f,qb,ql,'Maintenance',"items('For_each_maintenance')")
    f.add('For_each_maintenance',f.foreach("@body('Maintenance_Requests')?['Writes']",qb))
    safe_failure(f,'For_each_maintenance')
    return f


def flow_02(literal=None): return scheduler('AI CoE 02 Evidence and Readiness','Evidence',15,literal)


def flow_04(literal=None): return scheduler('AI CoE 04 Notification Outbox','Suppress',15,literal)


def flow_03(literal=None):
    f=NativeFlow('AI CoE 03 Markdown Projector','Complete paginated snapshot; immutable hash-named safe Markdown in private library. No canonical case stamp or timestamp-only cursor.',recurrence('Minute',15),literal=literal)
    setup(f)
    f.add('Read_Library_Root',http(f,'GET',"@concat('_api/web/lists(guid''', outputs('Cfg')?['ListId_Packets'], ''')/RootFolder?$select=ServerRelativeUrl')"))
    invoke(f,None,None,'Projection_Manifest','Project',{'Data':"@variables('Data')",'Root':"@body('Read_Library_Root')?['ServerRelativeUrl']"})
    pb,pl={},[None]
    add(f,pb,pl,'Write_Projection',http(f,'POST',"@concat('_api/web/GetFolderByServerRelativeUrl(''', replace(body('Read_Library_Root')?['ServerRelativeUrl'], '''', ''''''), ''')/Files/add(url=''', items('For_each_projection')?['Name'], ''',overwrite=true)')","@items('For_each_projection')?['Content']"))
    add(f,pb,pl,'Read_Projection_Bytes',http(f,'GET',"@concat('_api/web/GetFileByServerRelativeUrl(''', replace(items('For_each_projection')?['Path'], '''', ''''''), ''')/$value')"))
    invoke(f,pb,pl,'Compare_Projection','ProjectionReadback',{'Projection':"@items('For_each_projection')",'Content':"@body('Read_Projection_Bytes')"})
    # Producer seals the observed file digest; the canonical writer owns the receipt.
    persist_record(f,pb,pl,'Projection_Intent',"body('Compare_Projection')?['Write']")
    f.add('For_each_projection',f.foreach("@body('Projection_Manifest')?['Files']",pb))
    safe_failure(f,'For_each_projection')
    return f


def flow_05(literal=None):
    f=NativeFlow('AI CoE 05 Health Monitor','Paginated health checks include overdue work and recoverable claims; intentionally disabled components do not alert. Content-free logs; no send.',recurrence('Day',1,hours=[9],minutes=[0]),literal=literal)
    setup(f)
    invoke(f,None,None,'Evaluate_Health','Health',{'Data':"@variables('Data')",'Config':"@outputs('Cfg')",'Now':"@outputs('RunStart')"})
    f.add('Write_Health',http(f,'POST',list_uri('Log'),{'Title':"@concat('LOG-',guid())",'Flow':f.name,'RunId':"@workflow()?['run']?['name']",'Level':"@if(body('Evaluate_Health')?['Warning'], 'Warning', 'Succeeded')",'Message':"@string(body('Evaluate_Health')?['Counts'])",'LoggedAt':'@utcNow()'}))
    safe_failure(f,'Write_Health')
    return f
