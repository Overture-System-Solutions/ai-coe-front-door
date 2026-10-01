"""Fault/recovery tests execute actual WDL and compiled C#, never a semantic stand-in.
All external effects are explicitly synthetic; these are not native tenant acceptance.
"""
import copy
import json
import os
import unittest
from pathlib import Path
from native_harness import ROOT, CompiledHelper, Crash, Engine, SharePointFixture, compact, sha
from run_native import compare_result,load_definition

DLL=Path(os.environ.get('MARKETING_HELPER_DLL',ROOT/'connector/local/bin/Release/net10.0/MarketingHarness.dll'))
CASES={c['name']:c for name in ['node-reference-vectors.json','node-ai-reference-vectors.json'] for c in json.loads((ROOT/'evidence/integration'/name).read_text())['cases']}

class Execution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper=CompiledHelper(DLL);cls.crash_observations=[]
    @classmethod
    def tearDownClass(cls):
        cls.helper.close()
        (ROOT/'evidence/integration/crash-boundaries.json').write_text(json.dumps({'scope':'FAKE_EXTERNALS_ACTUAL_WDL_COMPILED_CSHARP','count':len(cls.crash_observations),'cases':cls.crash_observations,'nativeAcceptance':False},indent=2)+'\n')
    def fixture(self,name='manual brief'):
        case=copy.deepcopy(CASES[name]);sp=SharePointFixture(case['input']);sp.provider_response=case['input'].get('ProviderResponse')
        return case,sp,self.engine(sp)
    def engine(self,sp):
        definition=load_definition();definition['properties']['definition']['actions']['Cfg']['inputs']=sp.config
        return Engine(definition,sp,self.helper)
    def mutate(self,sp,key,change):
        row=next(r for r in sp.tables['canonical'] if r['RecordKey']==key);value=json.loads(row['RecordJson']);change(value)
        row.update(sp.fields(key,value));row['@odata.etag']='"mutation"'
    def intercept(self,engine,when,change):
        original=engine.action;triggered=[False]
        def action(name,a):
            if name==when and not triggered[0]:triggered[0]=True;change(engine.sp)
            return original(name,a)
        engine.action=action
        return triggered
    def assert_private(self,sp):
        for result in sp.tables['result']:
            self.assertFalse(sp.can_read(result['Id'],sp.tables['request'][0]['AuthorId']))
    def test_complete_values_match_every_reference_operation(self):
        seen=set()
        for name,case in CASES.items():
            with self.subTest(name=name):
                case,sp,engine=self.fixture(name);engine.run();self.assertEqual(len(sp.tables['result']),1)
                result=sp.tables['result'][0];compare_result(json.loads(result['ResultJson'])['value'],case['expectedValue'],sp)
                self.assertTrue(sp.can_read(result['Id'],case['input']['Row']['AuthorId']))
                self.assertFalse(sp.can_read(result['Id'],8675309));seen.add(case['operation'])
                writer=next(json.loads(r['RecordJson']) for r in sp.tables['canonical'] if r['RecordKey']=='writer:marketing');self.assertEqual(writer['status'],'idle')
        self.assertEqual(len(seen),16)
    def test_before_provider_permission_and_membership_revocation_prevent_disclosure(self):
        for kind in ('permission','member'):
            with self.subTest(kind=kind):
                _,sp,engine=self.fixture('provider brief')
                def revoke(sp):
                    if kind=='permission':next(iter(sp.sources.values()))['permissionLowAfter']='0'
                    else:self.mutate(sp,'member:'+str(sp.tables['request'][0]['AuthorId']),lambda m:m.update(enabled=False))
                reached=self.intercept(engine,'Before_Provider_Preflight_Canonical_Reset',revoke)
                with self.assertRaises(RuntimeError):engine.run()
                self.assertTrue(reached[0]);self.assertEqual(sp.provider_calls,[]);self.assert_private(sp)
    def test_prepublication_revocation_and_malformed_readback_refuse(self):
        for kind in ('permission','member','readback'):
            with self.subTest(kind=kind):
                _,sp,engine=self.fixture()
                def revoke(sp):
                    if kind=='permission':next(iter(sp.sources.values()))['permissionLowAfter']='0'
                    elif kind=='member':self.mutate(sp,'member:'+str(sp.tables['request'][0]['AuthorId']),lambda m:m.update(enabled=False))
                    else:sp.tables['result'][0]['ResultJson']='{}'
                where='Before_Publication_Preflight_Canonical_Reset' if kind!='readback' else 'Private_Projection_Readback'
                reached=self.intercept(engine,where,revoke)
                with self.assertRaises(RuntimeError):engine.run()
                self.assertTrue(reached[0]);self.assert_private(sp)
    def test_source_permission_changed_during_bytes_prevents_provider(self):
        _,sp,engine=self.fixture('provider brief')
        def hook(name,sp):
            if name=='source-bytes':next(iter(sp.sources.values()))['permissionLowAfter']='0'
        sp.hook=hook
        with self.assertRaises(RuntimeError):engine.run()
        self.assertEqual(sp.provider_calls,[]);self.assert_private(sp)
    def test_existing_author_grant_is_not_erased_or_redeclared_private(self):
        _,sp,engine=self.fixture()
        def grant_existing(sp):
            result=sp.tables['result'][0];sp.grants[result['Id']]={sp.config['writerPrincipalId']:[1073741829],sp.tables['request'][0]['AuthorId']:[1073741826]}
        reached=self.intercept(engine,'Break_Projection_Inheritance',grant_existing)
        with self.assertRaises(RuntimeError):engine.run()
        self.assertTrue(reached[0]);self.assertEqual(engine.status['Private_ACL_Only_Allowed'],'Failed')
        self.assertNotEqual(engine.status.get('Grant_Author_Read'),'Succeeded')
    def test_actual_pagination_is_complete_not_deduplicated(self):
        case,sp,engine=self.fixture('read brief');sp.page_size=4;engine.run()
        self.assertTrue(any('$skiptoken=' in url for method,url in sp.calls))
        compare_result(json.loads(sp.tables['result'][0]['ResultJson'])['value'],case['expectedValue'],sp)
        _,sp,engine=self.fixture();sp.tables['canonical'].append(copy.deepcopy(sp.tables['canonical'][0]))
        with self.assertRaises(RuntimeError):engine.run()
        self.assert_private(sp)
    def test_real_etag_cas_conflict_does_not_overwrite_or_complete(self):
        _,sp,engine=self.fixture()
        def race(sp):
            row=next(r for r in sp.tables['canonical'] if r['RecordKey'].startswith('native-plan:'));row['@odata.etag']='"racer"'
        reached=self.intercept(engine,'CAS_Final_Native_Plan',race)
        with self.assertRaises(RuntimeError):engine.run()
        self.assertTrue(reached[0]);self.assertIn('412',engine.errors['CAS_Final_Native_Plan']);self.assert_private(sp)
    def test_abrupt_interruption_at_every_business_effect_never_duplicates_paid_calls(self):
        for name in ('manual brief','provider brief','accept brief'):
            case,baseline,engine=self.fixture(name);engine.run()
            for index in range(1,len(baseline.effects)+1):
                with self.subTest(name=name,boundary=index):
                    case,sp,engine=self.fixture(name);sp.crash_after=index
                    with self.assertRaises(Crash):engine.run()
                    effect=sp.effects[-1];calls=len(sp.provider_calls);sp.crash_after=None
                    restart=self.engine(sp)
                    try:restart.run()
                    except RuntimeError:pass
                    self.assertLessEqual(len(sp.provider_calls),1);self.assertEqual(len(sp.provider_calls),calls)
                    keys=[r['RecordKey'] for r in sp.tables['canonical']];self.assertEqual(len(keys),len(set(keys)))
                    self.assertLessEqual(len(sp.tables['result']),1)
                    for row in sp.tables['result']:
                        if sp.can_read(row['Id'],case['input']['Row']['AuthorId']):compare_result(json.loads(row['ResultJson'])['value'],case['expectedValue'],sp)
                    self.crash_observations.append({'scenario':name,'boundary':index,'effect':effect,'providerCalls':len(sp.provider_calls),'projectionCount':len(sp.tables['result']),'pass':True})
    def test_operator_reconciled_writer_can_resume_original_private_plan(self):
        case,sp,engine=self.fixture()
        def hook(name,fixture):
            if name.startswith('insert:canonical:') and any(r['RecordKey'].startswith('envelope:') for r in fixture.tables['canonical']):raise Crash('after durable envelope')
        sp.hook=hook
        with self.assertRaises(Crash):engine.run()
        sp.hook=None
        # Explicit offline operator mutation; production flow never steals a held claim.
        self.mutate(sp,'writer:marketing',lambda m:(m.clear(),m.update(status='idle',previousRequestId=case['input']['Row']['Title'])))
        self.engine(sp).run();self.assertEqual(len([r for r in sp.tables['canonical'] if r['RecordKey'].startswith('envelope:')]),1)
        compare_result(json.loads(sp.tables['result'][0]['ResultJson'])['value'],case['expectedValue'],sp)

    def test_operator_reconciled_partial_review_uses_same_durable_plan(self):
        case,sp,engine=self.fixture('accept brief')
        def hook(name,fixture):
            if name.startswith('insert:canonical:') and any(r['RecordKey']=='native-plan:'+case['input']['Row']['Title'] for r in fixture.tables['canonical']):
                raise Crash('retained review plan before all effects')
        sp.hook=hook
        with self.assertRaises(Crash):engine.run()
        sp.hook=None
        self.mutate(sp,'writer:marketing',lambda m:(m.clear(),m.update(status='idle',previousRequestId=case['input']['Row']['Title'])))
        self.engine(sp).run()
        compare_result(json.loads(sp.tables['result'][0]['ResultJson'])['value'],case['expectedValue'],sp)

    def test_review_authority_revoked_before_publication_holds_success(self):
        _,sp,engine=self.fixture('accept brief')
        reached=self.intercept(engine,'Before_Publication_Preflight_Canonical_Reset',lambda f:self.mutate(f,'authority:reviewer',lambda a:a.update(revoked=True)))
        with self.assertRaises(RuntimeError):engine.run()
        self.assertTrue(reached[0]);self.assert_private(sp)

if __name__=='__main__':unittest.main(verbosity=2)
