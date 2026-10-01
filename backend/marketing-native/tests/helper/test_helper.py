"""Executes the exact generated C# through the local ScriptBase shim. Offline only."""
import copy, hashlib, json, os, pathlib, subprocess, unittest
ROOT = pathlib.Path(__file__).resolve().parents[2]
DOTNET = os.environ.get('DOTNET', '/home/far_cdx/.cache/oss-demo-dotnet/dotnet')
DLL = ROOT / 'connector/local/bin/Release/net10.0/MarketingHarness.dll'
VECTORS = json.loads((ROOT/'evidence/integration/node-reference-vectors.json').read_text())['cases']
def canonical(v): return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
def sha(v): return hashlib.sha256(v.encode()).hexdigest()
def evaluate(mode, payload):
    assert DLL.exists(), 'Missing executable Marketing helper; build connector/local first'
    p = subprocess.run([DOTNET, str(DLL)], input=json.dumps({'Mode':mode,'Payload':json.dumps(payload)}), text=True, capture_output=True, check=True)
    return json.loads(p.stdout)
def case(name): return copy.deepcopy(next(c for c in VECTORS if c['name']==name))
def change_record(p, key, mutate):
    r=next(r for r in p['Records'] if r['RecordKey']==key); v=json.loads(r['RecordJson']); mutate(v)
    r['RecordJson']=json.dumps(v,separators=(',',':'),ensure_ascii=False); r['RecordHash']=sha(r['RecordJson'])
class BasicTests(unittest.TestCase):
    def test_work_list_and_preflight(self):
        c=case('authorized work list'); p=c['input']
        out=evaluate('Plan',p); self.assertTrue(out.get('Valid'), out); self.assertEqual(out['Result'],c['expectedValue']); self.assertEqual(out['Writes'],[])
        pre=evaluate('Preflight',p); self.assertTrue(pre['Valid'],pre); self.assertEqual(pre['SourceRequests'],[])
        self.assertEqual(pre['Fingerprint'],sha(canonical({'operation':c['operation'],'payload':{},'actorId':p['Row']['Author']['Email'],'tenantScope':p['Config']['siteUrl']})))
    def test_fail_closed_identity_snapshot_and_qualification(self):
        for mutation in [lambda p:p['Config'].update(enabled=False),lambda p:p['Config'].update(controllerQualified=False), lambda p:p['Config'].update(securityQualified=False),lambda p:p['Row'].update(EditorId=9),lambda p:p['Records'].append(p['Records'][0]),lambda p:p['Records'][0].update(RecordHash='0'*64),lambda p:p['Row'].update(PayloadJson='{"roles":["marketingReviewer"]}')]:
            p=case('authorized work list')['input']; mutation(p); r=evaluate('Plan',p); self.assertEqual(set(r),{'Valid','Error'}); self.assertFalse(r['Valid'])
    def test_unknown_mode_refuses(self): self.assertFalse(evaluate('NotSupported',{})['Valid'])
class ManualAndModesTests(unittest.TestCase):
    def test_manual_brief_exact_envelope_and_readback_bound_version(self):
        c=case('manual brief'); out=evaluate('Plan',c['input']); self.assertTrue(out['Valid'],out)
        self.assertEqual(out['Result']['envelope'],c['expectedValue']['envelope'])
        self.assertIsNone(out['Result']['storeVersion'], 'No guessed ETag may be presented as a readback token')
        self.assertTrue(out['FinalizeRequired'])
        self.assertIn('envelope:', ' '.join(w['Key'] for w in out['Writes']))
    def test_reference_safe_reads(self):
        for name in ['read brief','reviewer reads brief','list own authorities','list brief reviews','list brief requests','get review','read source register','read permitted source']:
            c=case(name); out=evaluate('Plan',c['input']); self.assertTrue(out['Valid'],(name,out)); self.assertEqual(out['Result'],c['expectedValue'],name)
    def test_missing_source_after_read_refuses(self):
        for mutate in [lambda p:p.update(Sources=[]),lambda p:p['Sources'][0].update(permissionLowAfter='1'),lambda p:p['Sources'][0].update(contentETag='wrong'),lambda p:p['Sources'][0].update(content='changed')]:
            p=case('manual brief')['input'];mutate(p);self.assertFalse(evaluate('Plan',p)['Valid'])
    def test_storage_create_cas_and_verify(self):
        p=case('authorized work list')['input'];w={'Key':'writer:marketing','Value':{'status':'claimed','requestId':p['Row']['Title'],'token':p['RunId'],'claimedAt':p['Now']},'ExpectedVersion':None}; q={'Config':p['Config'],'Write':w,'Rows':[]}
        result=evaluate('InspectWrite',q);self.assertTrue(result['Valid'],result);self.assertFalse(result['AlreadyApplied'])
        q['Rows']=[dict(result['Fields'],Id=99,**{'@odata.etag':'"1"'})]
        self.assertTrue(evaluate('VerifyWrite',q)['Valid']);self.assertTrue(evaluate('InspectWrite',q)['AlreadyApplied'])
        q['Write']=dict(w,Value={'status':'idle','previousRequestId':p['Row']['Title']});self.assertFalse(evaluate('InspectWrite',q)['Valid'])
        q['Write']['ExpectedVersion']='"1"';self.assertTrue(evaluate('InspectWrite',q)['Valid'])
        q['Rows']=[];self.assertFalse(evaluate('InspectWrite',q)['Valid']);self.assertFalse(evaluate('VerifyWrite',q)['Valid'])
    def test_page_and_projection_acl(self):
        p=case('authorized work list')['input'];cfg=p['Config']
        r=evaluate('Page',{'Config':cfg,'Page':{'value':[{'Id':1}], '@odata.nextLink':cfg['siteUrl']+"/_api/web/lists(guid='"+cfg['canonicalListId']+"')/items?$skiptoken=Paged%3DTRUE"}});self.assertTrue(r['Valid'],r);self.assertTrue(r['Next'].startswith('_api/'))
        self.assertFalse(evaluate('Page',{'Config':cfg,'Page':{'value':[], '@odata.nextLink':'https://other.invalid/items'}})['Valid'])
        r=evaluate('Projection',{'Config':cfg,'Row':p['Row'],'Result':['CW-OFFLINE_TEST']});self.assertTrue(r['Valid'],r)
        q={'Config':cfg,'Row':p['Row'],'Projection':r['Projection'],'Rows':[dict(r['Fields'],Id=99)],'Permissions':{'HasUniqueRoleAssignments':True,'RoleAssignments':[{'PrincipalId':7,'RoleDefinitionBindings':[{'Id':1073741826}]},{'PrincipalId':42,'RoleDefinitionBindings':[{'Id':1073741829}]}]}}
        self.assertTrue(evaluate('VerifyProjection',q)['Valid']);q['Permissions']['RoleAssignments'].append({'PrincipalId':8,'RoleDefinitionBindings':[{'Id':1073741826}]});self.assertFalse(evaluate('VerifyProjection',q)['Valid'])
class ReviewAndParentTests(unittest.TestCase):
    def test_all_manual_reference_values(self):
        for c in VECTORS:
            with self.subTest(c=c['name']):
                out=evaluate('Plan',c['input']); self.assertTrue(out['Valid'],out)
                expected=copy.deepcopy(c['expectedValue'])
                if isinstance(expected,dict) and expected.get('kind')=='saved': expected['storeVersion']=None
                self.assertEqual(out['Result'],expected)
    def test_review_fails_without_current_authority(self):
        for mutate in [lambda p:change_record(p,'authority:reviewer',lambda a:a.update(expiresAt='2020-01-01T00:00:00Z')),lambda p:change_record(p,'authority:reviewer',lambda a:a.update(revoked=True))]:
            p=case('accept brief')['input'];mutate(p);r=evaluate('Plan',p);self.assertTrue(not r['Valid'] or r['Result'].get('kind')=='failed',r)
    def test_finalization_uses_actual_etag_and_preserves_original(self):
        p=case('manual brief')['input'];plan=evaluate('Plan',p);self.assertTrue(plan['Valid'],plan)
        def add(key,value,etag):
            text=json.dumps(value,separators=(',',':'),ensure_ascii=False); p['Records'].append({'Id':max(r['Id'] for r in p['Records'])+1,'Title':sha(p['Config']['siteUrl']+'\n'+key),'TenantScope':p['Config']['siteUrl'],'RecordKey':key,'RecordJson':text,'RecordHash':sha(text),'@odata.etag':etag})
        add('native-plan:'+p['Row']['Title'],{'status':'prepared','fingerprint':evaluate('Preflight',p)['Fingerprint'],'plan':plan},'plan-actual')
        self.assertFalse(evaluate('Projection',{'Config':p['Config'],'Row':p['Row'],'Result':plan['Result']})['Valid'])
        for w in plan['Writes']: add(w['Key'],w['Value'],'W/"actual-service-42"')
        p['Now']='2026-09-23T13:01:05.000Z';final=evaluate('Plan',p);self.assertTrue(final['Valid'],final);self.assertFalse(final['FinalizeRequired'])
        e=final['Result']['envelope'];key='envelope:'+e['artifactId']+':'+str(e['revision'])
        self.assertEqual(final['Result']['storeVersion'],sha(canonical({'key':key,'revision':e['revision'],'payloadHash':e['payloadHash'],'version':'W/"actual-service-42"'})))
        self.assertEqual(final['Result']['envelope'],plan['Result']['envelope'])
        self.assertTrue(evaluate('Projection',{'Config':p['Config'],'Row':p['Row'],'Result':final['Result']})['Valid'])
AI_VECTORS=json.loads((ROOT/'evidence/integration/node-ai-reference-vectors.json').read_text())['cases']
class ProviderRecoveryTests(unittest.TestCase):
    def test_all_ai_and_completed_recovery_reference_values(self):
        for c in AI_VECTORS:
            with self.subTest(c=c['name']):
                out=evaluate('Plan',c['input']); self.assertTrue(out['Valid'],out);expected=copy.deepcopy(c['expectedValue'])
                if c['operation'].startswith('Draft'):expected['storeVersion']=None
                self.assertEqual(out['Result'],expected)
    def test_provider_wire_and_truncation(self):
        p=copy.deepcopy(AI_VECTORS[0]['input']);p.pop('ProviderResponse');r=evaluate('Plan',p);self.assertTrue(r['Valid'],r);self.assertTrue(r['NeedProvider']);w=r['ProviderWire'];self.assertEqual(w['body/max_tokens'],1600);self.assertEqual(w['body/thinking/type'],'disabled');self.assertFalse(w['body/stream']);self.assertEqual(r['ProviderWireHash'],sha(canonical(w)))
        later=copy.deepcopy(p);later['Now']='2026-09-23T14:05:07.000Z';self.assertEqual(evaluate('Plan',later)['ProviderWireHash'],r['ProviderWireHash'])
        for mutate in [lambda r:r.update(stop_reason='max_tokens'),lambda r:r.update(stop_details={}),lambda r:r['content'].append({'type':'text','text':'{}'}),lambda r:r.update(role='user')]:
            p=copy.deepcopy(AI_VECTORS[0]['input']);mutate(p['ProviderResponse']);self.assertFalse(evaluate('Plan',p)['Valid'])
    def test_provider_output_identity_claim_and_delivery_refusals(self):
        for mutate in [lambda v:v.update(workId='CW-OTHER'),lambda v:v['message'][0].update(sources=[]),lambda v:v.update(send=True),lambda v:v['message'][0]['sources'][0].update(sourceId='UNKNOWN-SOURCE')]:
            p=copy.deepcopy(AI_VECTORS[0]['input']);raw=json.loads(p['ProviderResponse']['content'][0]['text']);mutate(raw);p['ProviderResponse']['content'][0]['text']=json.dumps(raw);self.assertFalse(evaluate('Plan',p)['Valid'])
    def test_recovery_is_not_cached_source_disclosure(self):
        p=case('read permitted source')['input'];key=p['Records'][0]['RecordKey']
        source_command=next(r for r in p['Records'] if r['RecordKey'].startswith('command:'));old=json.loads(source_command['RecordJson']);old['operation']='ReadSourceExcerptV1';old['payload']={'reference':{'sourceId':'SRC-BRAND-NOTES','versionOrETag':'"v1"'}};old['result']={'excerpt':'not allowed'};source_command['RecordJson']=json.dumps(old,separators=(',',':'));source_command['RecordHash']=sha(source_command['RecordJson']);p['Row']['Operation']='RecoverMarketingIntentV1';p['Row']['PayloadJson']=json.dumps({'intentKey':source_command['RecordKey'][8:],'kind':'draft'});self.assertFalse(evaluate('Plan',p)['Valid'])
class IntegrityHardeningTests(unittest.TestCase):
    def test_entire_snapshot_rejects_malformed_supported_record_families(self):
        base=case('read brief')['input']
        for prefix,mutate in [('member:',lambda v:v.update(roles=['owner'])),('authority:',lambda v:v.update(expiresAt='not-a-date')),('envelope:',lambda v:v.update(payloadHash='f'*64)),('command:',lambda v:v.update(status='bogus')),('source:',lambda v:v.update(contentHash='nohash')),('qualification:',lambda v:v.update(result='MAYBE'))]:
            p=copy.deepcopy(base);key=next(r['RecordKey'] for r in p['Records'] if r['RecordKey'].startswith(prefix));change_record(p,key,mutate);self.assertFalse(evaluate('Preflight',p)['Valid'],prefix)
    def test_unicode_hashes_are_node_json_stringify_bytes(self):
        p=copy.deepcopy(AI_VECTORS[0]['input']);p.pop('ProviderResponse');b=json.loads(p['Row']['PayloadJson']);b['objective']='Unicode '+chr(0x85)+chr(0x2028)+chr(0x2029)+' 🎯';p['Row']['PayloadJson']=json.dumps(b,ensure_ascii=False)
        r=evaluate('Preflight',p);self.assertTrue(r['Valid'],r);self.assertEqual(r['Fingerprint'],sha(canonical({'operation':p['Row']['Operation'],'payload':b,'actorId':p['Row']['Author']['Email'],'tenantScope':p['Config']['siteUrl']})))
        wire=evaluate('Plan',p);self.assertTrue(wire['Valid'],wire);self.assertEqual(wire['ProviderWireHash'],sha(canonical(wire['ProviderWire'])))
    def test_pending_provider_never_reissues_on_restart(self):
        p=copy.deepcopy(AI_VECTORS[0]['input']);p.pop('ProviderResponse');wire=evaluate('Plan',p)
        def add(key,value):
            text=json.dumps(value,separators=(',',':'));p['Records'].append({'Id':max(r['Id'] for r in p['Records'])+1,'Title':sha(p['Config']['siteUrl']+'\n'+key),'TenantScope':p['Config']['siteUrl'],'RecordKey':key,'RecordJson':text,'RecordHash':sha(text),'@odata.etag':'"1"'})
        add('provider:'+p['Row']['Title'],{'status':'pending','wireHash':wire['ProviderWireHash']});self.assertFalse(evaluate('Plan',p)['Valid'])
        add('writer:marketing',{'status':'claimed','requestId':p['Row']['Title'],'token':p['RunId'],'claimedAt':p['Now']});self.assertTrue(evaluate('Plan',p)['NeedProvider']);p['RunId']='different-run';self.assertFalse(evaluate('Plan',p)['Valid'])
    def test_preflight_includes_plan_sources_and_parent_sources(self):
        for c in AI_VECTORS[:3]:
            p=copy.deepcopy(c['input']);p.pop('Sources');r=evaluate('Preflight',p);self.assertTrue(r['Valid'],r);self.assertEqual(len(r['SourceRequests']),1);self.assertTrue(all(s[k].startswith('_api/') for s in r['SourceRequests'] for k in ('PermissionUri','MetadataUri','ContentUri')))
    def test_projection_cannot_bypass_operation_shape(self):
        p=case('authorized work list')['input'];p['Row']['Operation']='SendEmailV1';self.assertFalse(evaluate('Projection',{'Config':p['Config'],'Row':p['Row'],'Result':[]})['Valid'])
if __name__=='__main__': unittest.main(verbosity=2)
