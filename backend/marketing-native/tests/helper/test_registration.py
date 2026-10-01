"""Registration files are separate from the unbound flow solution and never register themselves."""
import hashlib
import json
import re
import unittest
from test_helper import ROOT, case, evaluate

class RegistrationTests(unittest.TestCase):
    def test_openapi_and_properties_exact_wire(self):
        swagger=json.loads((ROOT/'connector/apiDefinition.swagger.json').read_text())
        self.assertEqual(swagger['swagger'],'2.0');self.assertEqual(swagger['host'],'unused.invalid')
        operation=swagger['paths']['/evaluate']['post'];self.assertEqual(operation['operationId'],'Evaluate')
        parameter=operation['parameters'][0];self.assertEqual((parameter['in'],parameter['name']),('body','body'))
        schema=parameter['schema'];self.assertEqual(set(schema['required']),{'Mode','Payload'})
        self.assertEqual(schema['properties']['Payload']['type'],'string')
        self.assertEqual(set(schema['properties']['Mode']['enum']),{'Preflight','Plan','InspectWrite','VerifyWrite','Page','Projection','VerifyProjection'})
        output=operation['responses']['200']['schema'];self.assertEqual(output['required'],['Valid'])
        for k,t in {'Valid':'boolean','Error':'string','FinalizeRequired':'boolean','Fields':'object','Projection':'object','Writes':'array','Rows':'array','Next':'string','ProviderWire':'object','NeedProvider':'boolean','AlreadyApplied':'boolean','ItemId':'integer'}.items():self.assertEqual(output['properties'][k]['type'],t)
        p=case('authorized work list')['input']
        for mode in ['Preflight','Plan']:
            result=evaluate(mode,p);self.assertTrue(result['Valid'],result);self.assertLessEqual(set(result),set(output['properties']))
        properties=json.loads((ROOT/'connector/apiProperties.json').read_text())['properties'];self.assertEqual(properties['scriptOperations'],['Evaluate']);self.assertEqual(properties['connectionParameters'],{})

    def test_compiled_script_hash_matches_final_source(self):
        from test_helper import DOTNET, DLL
        import subprocess
        expected=hashlib.sha256((ROOT/'connector/Script.cs').read_bytes()).hexdigest()
        actual=subprocess.run([DOTNET,str(DLL),'--script-hash'],input='',text=True,capture_output=True,check=True).stdout.strip()
        self.assertEqual(actual,expected,'Reassemble and compile after every authored-part change; do not test a stale DLL.')

    def test_exact_script_alias_hash_size_and_supported_namespace_surface(self):
        script=(ROOT/'connector/Script.cs').read_bytes();self.assertEqual(script,(ROOT/'connector/Script.csx').read_bytes());self.assertLessEqual(len(script),1000000)
        manifest=json.loads((ROOT/'evidence/helper/source-manifest.json').read_text());self.assertEqual(manifest['sha256'],hashlib.sha256(script).hexdigest());self.assertEqual(manifest['scriptBytes'],len(script))
        allowed={'System','System.Linq','System.Collections.Generic','System.Net','System.Net.Http','System.Security.Cryptography','System.Text','System.Text.RegularExpressions','System.Threading.Tasks','Newtonsoft.Json','Newtonsoft.Json.Linq'}
        self.assertLessEqual(set(re.findall(r'^using ([\w.]+);',script.decode(),re.M)),allowed)
        for forbidden in ['System.Globalization','SendAsync(', 'new HttpClient(', 'System.Diagnostics','System.Reflection']:
            self.assertNotIn(forbidden,script.decode())

if __name__=='__main__':unittest.main(verbosity=2)
