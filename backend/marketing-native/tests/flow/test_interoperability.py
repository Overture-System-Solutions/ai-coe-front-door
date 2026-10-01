"""Generated-expression wire contracts, NOT execution of the C# helper or tenant."""
import json
import unittest
from types import SimpleNamespace
from test_flow import ROOT, generate, walk
from marketing_validate import evaluate


def engine():
    return SimpleNamespace(outputs={}, bodies={}, variables={}, parameters={}, items={},
                           runid='OFFLINE-RUN', sp=SimpleNamespace(now='2026-09-23T00:00:00Z'))


def resolve(value, e):
    if isinstance(value, str) and value.startswith('@'):
        return evaluate(value, e)
    if isinstance(value, dict):
        return {k: resolve(v, e) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(v, e) for v in value]
    return value


class Interoperability(unittest.TestCase):
    def setUp(self):
        self.actions = dict(walk(generate().actions))
        self.e = engine()
        self.vector = json.loads((ROOT / 'evidence/integration/node-reference-vectors.json').read_text())['cases'][0]['input']
        self.e.outputs['Cfg'] = self.vector['Config']
        self.e.variables.update({k: self.vector[k] for k in ['Row', 'Records', 'Sources']})
        self.e.variables['ProviderResponse'] = {}

    def test_flow_generated_times_use_milliseconds_for_helper_date_contract(self):
        self.e.sp.now = '2026-09-23T00:00:00.1234567Z'
        payload = json.loads(evaluate(self.actions['Initial_Plan']['inputs']['parameters']['body/Payload'], self.e))
        self.assertEqual(payload['Now'], '2026-09-23T00:00:00.123Z')
        self.assertEqual(evaluate(self.actions['CommandStart']['inputs'], self.e), payload['Now'])

    def test_common_payload_uses_seven_modes_and_null_until_actual_response(self):
        for stage in ['Initial', 'Before_Provider', 'Before_Publication']:
            for mode in ['Preflight', 'Plan']:
                action = self.actions[stage + '_' + mode]
                payload = json.loads(evaluate(action['inputs']['parameters']['body/Payload'], self.e))
                self.assertEqual(set(payload), {'Config','Row','Records','Sources','Now','RunId','ProviderResponse'})
                self.assertIsNone(payload['ProviderResponse'])
                self.assertEqual(payload['Row'], self.vector['Row'])
                self.assertEqual(payload['Records'], self.vector['Records'])
        retained = {'type':'message','role':'assistant','stop_reason':'end_turn','content':[{'type':'text','text':'OFFLINE VALUE'}]}
        self.e.variables['ProviderResponse'] = retained
        payload = json.loads(evaluate(self.actions['Build_Native_Plan']['inputs']['parameters']['body/Payload'], self.e))
        self.assertEqual(payload['ProviderResponse'], retained)

    def test_sharepoint_fields_are_objects_then_exactly_once_json_encoded(self):
        # Explicit wire fixtures prove expression types only, not helper outputs.
        fixtures = [
            ('Create_Record', 'Inspect_Record', {'Title':'hash','RecordKey':'command:uuid','TenantScope':'site','RecordJson':'{"a":1}','RecordHash':'hash'}),
            ('Create_Private_Projection', 'Build_Projection', {'Title':'uuid','RequestId':'uuid','VerifiedAuthorId':7,'ResultJson':'{"value":true}'})]
        for action, producer, fields in fixtures:
            self.e.bodies[producer] = {'Valid':True,'Fields':fields}
            body = evaluate(self.actions[action]['inputs']['parameters']['parameters/body'], self.e)
            self.assertIsInstance(body, str)
            self.assertEqual(json.loads(body), fields)
            if 'VerifiedAuthorId' in fields:
                self.assertIsInstance(json.loads(body)['VerifiedAuthorId'], int)

    def test_observation_fields_capture_both_sides_and_raw_etag(self):
        for stage in ['Initial', 'Before_Provider', 'Before_Publication']:
            self.e.items[stage + '_Sources'] = {'sourceId':'source:offline','versionOrETag':'"5"'}
            self.e.bodies[stage + '_Permission_Before'] = {'GetUserEffectivePermissions':{'Low':'33'}}
            self.e.bodies[stage + '_Permission_After'] = {'d':{'GetUserEffectivePermissions':{'Low':'1'}}}
            self.e.bodies[stage + '_Metadata_Before'] = {'ETag':'"5"'}
            self.e.bodies[stage + '_Metadata_After'] = {'d':{'ETag':'"6"'}}
            self.e.bodies[stage + '_Bytes'] = 'OFFLINE SOURCE BYTES'
            self.e.outputs[stage + '_Bytes'] = {'headers':{'etag':'"5"'}}
            observed = resolve(self.actions[stage + '_Observed_Source']['inputs']['value'], self.e)
            self.assertEqual(observed, {'sourceId':'source:offline','versionOrETag':'"5"','content':'OFFLINE SOURCE BYTES','contentETag':'"5"','permissionLowBefore':'33','permissionLowAfter':'1','metadataETagBefore':'"5"','metadataETagAfter':'"6"'})
            # Bad after-observations reach the helper unaltered, not replaced by
            # their good before-observations. Only the actual helper can refuse.
            self.assertEqual(self.actions[stage + '_Canonical_Reset']['runAfter'], {stage + '_Immutable':['Succeeded']})
            self.assertEqual(self.actions[stage + '_Plan']['runAfter'], {stage + '_Canonical_Complete':['Succeeded']})

    def test_retained_plan_replays_original_result_and_writes(self):
        plan = {'Valid':True,'NeedProvider':False,'FinalizeRequired':False,'Result':{'artifactId':'original','revisionId':'revision-1'},'Writes':[{'Key':'snapshot:original','Value':{'revisionId':'revision-1'},'ExpectedVersion':None}]}
        self.e.bodies['Retained_Native_Plan_Page'] = {'Rows':[{'RecordJson':json.dumps({'status':'prepared','fingerprint':'fp','plan':plan})}]}
        self.e.bodies['Initial_Preflight'] = {'Fingerprint':'fp'}
        self.assertIs(evaluate(self.actions['Same_Native_Intent']['inputs'], self.e), True)
        self.e.outputs['Plan'] = evaluate(self.actions['Plan']['inputs'], self.e)
        self.assertEqual(self.e.outputs['Plan'], plan)
        self.assertEqual(evaluate(self.actions['For_each_write']['foreach'], self.e), plan['Writes'])
        self.e.outputs['Finalized_Plan'] = plan
        self.e.bodies['Before_Publication_Plan'] = {**plan,'Result':{'artifactId':'different'}}
        with self.assertRaises(ValueError):
            evaluate(self.actions['Fresh_Result_Reauthorized']['inputs'], self.e)
        self.e.bodies['Before_Publication_Plan'] = plan
        self.assertIs(evaluate(self.actions['Fresh_Result_Reauthorized']['inputs'], self.e), True)

    def test_compact_lookup_checks_validity_and_page_completion(self):
        expression=self.actions['Find_Record_Complete']['inputs']
        for value in [{'Valid':False,'Rows':[],'Next':''},{'Valid':True,'Rows':[],'Next':'another-page'}]:
            self.e.bodies['Find_Record_Page']=value
            with self.assertRaises(ValueError):evaluate(expression,self.e)
        self.e.bodies['Find_Record_Page']={'Valid':True,'Rows':[],'Next':''}
        self.assertIs(evaluate(expression,self.e),True)

    def test_pagination_preserves_duplicates_and_refuses_limits_or_cycles(self):
        a = self.actions['Queue_Canonical_Append']
        self.assertEqual(a['type'], 'AppendToArrayVariable')
        self.e.items['Queue_Canonical_Items'] = {'Id':7,'RecordKey':'duplicate'}
        self.assertEqual(resolve(a['inputs']['value'], self.e), self.e.items['Queue_Canonical_Items'])
        self.e.variables.update(Next='same-page', SeenPages=['same-page'])
        for name in ['Queue_Canonical_Cycle', 'Queue_Canonical_Complete']:
            with self.assertRaises(ValueError):
                evaluate(self.actions[name]['inputs'], self.e)
        self.e.variables['Next'] = ''
        self.assertIs(evaluate(self.actions['Queue_Canonical_Complete']['inputs'], self.e), True)


if __name__ == '__main__':
    unittest.main()
