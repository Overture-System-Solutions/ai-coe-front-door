"""Tests of the explicitly fake SharePoint/WDL boundary used for native integration."""
import importlib.util, json, unittest, sys
from pathlib import Path
P=Path(__file__).parent
class Boundary(unittest.TestCase):
    def fixture(self):
        self.assertTrue((P/'native_harness.py').exists(),'Actual generated-WDL integration harness is missing')
        spec=importlib.util.spec_from_file_location('native_marketing_harness',P/'native_harness.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        vector=json.loads((P.parents[1]/'evidence/integration/node-reference-vectors.json').read_text())['cases'][0]
        return m,m.SharePointFixture(vector['input'])
    def test_write_then_exact_etag_and_schema_checks(self):
        m,f=self.fixture();url=f.base('canonical')
        fields=f.fields('test:one',{'offline':'value'})
        row=f.request('POST',url,fields,{})['body'];self.assertEqual(row['@odata.etag'],'"1"')
        with self.assertRaises(m.HttpFailure):f.request('POST',url,fields,{})
        target=url+'('+str(row['Id'])+')'
        with self.assertRaises(m.HttpFailure):f.request('POST',target,fields,{'IF-MATCH':'*','X-HTTP-Method':'MERGE'})
        changed=f.fields('test:one',{'offline':'changed'});f.request('POST',target,changed,{'IF-MATCH':'"1"','X-HTTP-Method':'MERGE'})
        self.assertEqual(f.request('GET',target,None,{})['body']['RecordJson'],changed['RecordJson'])
        with self.assertRaises(m.HttpFailure):f.request('POST',url,{**fields,'UnprovisionedColumn':True},{})
    def test_snapshot_paging_and_source_observations_are_real_boundary_operations(self):
        _,f=self.fixture();f.page_size=2
        p=f.request('GET',f.base('canonical')+'?$top=5000',None,{})['body']
        self.assertEqual(len(p['value']),2);self.assertTrue(p['odata.nextLink'])
        q=f.request('GET',p['odata.nextLink'],None,{})['body'];self.assertNotEqual(p['value'][0]['Id'],q['value'][0]['Id'])
        self.assertTrue(f.calls)
    def test_private_result_is_not_public_until_explicit_author_read_grant(self):
        _,f=self.fixture();url=f.base('result');fields={'Title':'test','RequestId':'test','VerifiedAuthorId':7,'ResultJson':'{}'}
        row=f.request('POST',url,fields,{})['body'];self.assertFalse(f.can_read(row['Id'],7))
        target=url+'('+str(row['Id'])+')';f.request('POST',target+'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)',None,{})
        f.request('POST',target+'/roleassignments/addroleassignment(principalid=7,roledefid=1073741826)',None,{})
        self.assertTrue(f.can_read(row['Id'],7));self.assertFalse(f.can_read(row['Id'],9))
        f.request('POST',target+'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)',None,{})
        self.assertTrue(f.can_read(row['Id'],7),'Breaking already-unique inheritance must not erase an existing grant in this fake')
    def test_generated_timestamp_format_evaluates_as_milliseconds(self):
        m,f=self.fixture();engine=type('State',(),{'sp':f})()
        value=m.Expression("@utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')",engine).run()
        self.assertRegex(value,r'\.\d{3}Z$')
    def test_actual_generated_flow_refuses_unqualified_configuration_before_external_actions(self):
        m,f=self.fixture();sys.path.insert(0,str(P.parents[1]/'generator'))
        import marketing_flow
        helper=lambda *args: self.fail('Disabled WDL must not reach the helper')
        engine=m.Engine(marketing_flow.command_flow().definition(),f,helper)
        with self.assertRaises(RuntimeError):engine.run()
        self.assertEqual(f.calls,[])
        self.assertEqual(engine.status['Configuration_Qualified'],'Failed')
if __name__=='__main__':unittest.main()
