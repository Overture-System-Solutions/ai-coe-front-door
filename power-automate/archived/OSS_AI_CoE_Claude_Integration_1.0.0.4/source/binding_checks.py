"""Regression tests for the designer-projected custom-connector body bindings and Save-time
secure-data rules. These are local descriptor/reassembly checks against the delivered packages,
not an emulation of hosted Save. Run repack.py first so the delivered ZIPs exist.
"""
import copy
import json
import unittest
import zipfile
from jsonschema import Draft4Validator
import flow
import integration as contract
import package_connector as connector_packaging
import package_flow as packaging
import repack

HISTORY = repack.HISTORY  # packages from the removed 1.0.0.0-1.0.0.3 deliveries (source/history/)
API_NAME = repack.API_NAME
USER_TURN = "@string(outputs('Visible_answers'))"
POLICY = {'ParseJson': ['inputs'], 'OpenApiConnection': ['inputs', 'outputs']}
RESPONSES = ['Draft_response', 'Generation_failure', 'Incomplete_response', 'Invalid_answers_response',
             'Invalid_request_response', 'Oversize_response', 'Refusal_response']


def zip_json(path, predicate):
    with zipfile.ZipFile(path) as archive:
        name = next(n for n in archive.namelist() if predicate(n))
        return json.loads(archive.read(name).decode('utf-8-sig'))


def workflow_in(zip_path):
    return zip_json(zip_path, lambda n: n.startswith('Workflows/') and n.endswith('.json'))


def body_schema_in(connector_zip):
    spec = zip_json(connector_zip, lambda n: n.endswith('openapidefinition.json'))
    return next(p for p in spec['paths']['/messages']['post']['parameters'] if p['in'] == 'body')['schema']


def all_actions(document):
    found = {}

    def visit(actions):
        for name, value in actions.items():
            found[name] = value
            visit(value.get('actions', {}))
            visit(value.get('else', {}).get('actions', {}))
    visit(document['properties']['definition']['actions'])
    return found


def action(document, wanted):
    try:
        return all_actions(document)[wanted]
    except KeyError:
        raise AssertionError('Missing action: ' + wanted)


def secure_properties(item):
    return item.get('runtimeConfiguration', {}).get('secureData', {}).get('properties')


def with_outputs_secured(document, action_type):
    return sorted(n for n, a in all_actions(document).items() if a.get('type') == action_type and 'outputs' in (secure_properties(a) or []))


def apply_secure_data_policy(document):
    """Rewrite an older definition's secure-data settings to the current policy; nothing else changes."""
    document = copy.deepcopy(document)
    for value in all_actions(document).values():
        wanted = POLICY.get(value.get('type'))
        if wanted:
            value['runtimeConfiguration'] = {'secureData': {'properties': list(wanted)}}
        else:
            value.pop('runtimeConfiguration', None)
    trigger = document['properties']['definition']['triggers']['manual']
    trigger.get('runtimeConfiguration', {}).pop('secureData', None)
    return document


class DesignerBindingChecks(unittest.TestCase):
    def test_action_binds_exactly_the_connector_body_leaves_with_typed_literals(self):
        parameters = action(flow.definition(API_NAME), 'Claude_draft')['inputs']['parameters']
        leaves = set(contract.body_parameter_paths())
        self.assertEqual(set(parameters), leaves | {'anthropic-version'})
        self.assertNotIn('body', parameters, 'A whole-body expression is not a designer-visible binding')
        self.assertEqual(parameters['anthropic-version'], '2023-06-01')
        self.assertEqual(parameters['body/model'], 'claude-sonnet-5')
        self.assertEqual(parameters['body/system'], contract.INSTRUCTIONS)
        self.assertEqual(parameters['body/messages'], [{'role': 'user', 'content': USER_TURN}])
        self.assertIsInstance(parameters['body/max_tokens'], int); self.assertEqual(parameters['body/max_tokens'], 1600)
        self.assertIs(parameters['body/stream'], False)
        self.assertEqual(parameters['body/thinking/type'], 'disabled')
        self.assertEqual(parameters['body/output_config/format/type'], 'json_schema')
        self.assertEqual(parameters['body/output_config/format/schema'], contract.model_draft_schema())
        encoded = json.dumps(parameters)
        self.assertNotIn('@{', encoded, 'Interpolation would coerce structured values to strings')
        self.assertEqual(encoded.count('@'), 1, 'Only the user turn is an expression')
        # The projection rule matches the delivered connector, not just the in-memory spec.
        self.assertEqual(contract.body_parameter_paths(body_schema_in(repack.CONNECTOR_ZIP)), contract.body_parameter_paths())

    def test_bindings_reassemble_the_canonical_anthropic_request(self):
        parameters = action(flow.definition(API_NAME), 'Claude_draft')['inputs']['parameters']
        body = contract.reassemble_body(parameters)
        self.assertEqual(body, flow.claude_request())
        intended = contract.provider_request(contract.example_request())
        body['messages'][0]['content'] = intended['messages'][0]['content']
        self.assertEqual(body, intended)
        self.assertEqual(list(body), ['model', 'max_tokens', 'system', 'messages', 'stream', 'thinking', 'output_config'])
        Draft4Validator(contract.request_body_schema()).validate(body)
        Draft4Validator(body_schema_in(repack.CONNECTOR_ZIP)).validate(body)
        for key in ('tools', 'tool_choice', 'temperature', 'top_p', 'top_k', 'output_format'):
            self.assertNotIn(key, body)

    def test_previous_packages_reproduce_the_reported_defects(self):
        first = action(workflow_in(HISTORY / '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_0.zip'), 'Claude_draft')['inputs']
        self.assertEqual(first['parameters'].get('body'), "@outputs('Build_Claude_request')")
        self.assertNotIn('body/model', first['parameters'])
        second = action(workflow_in(HISTORY / '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_1.zip'), 'Claude_draft')['inputs']
        self.assertIn('body/tools', second['parameters']); self.assertIn('body/tool_choice/type', second['parameters'])
        self.assertEqual(second['host']['apiId'], '')
        old_schema = body_schema_in(HISTORY / '01_OSSCloudWaveClaudeDraftConnector_1_0_0_0.zip')
        self.assertIn('tools', old_schema['required']); self.assertIn('tool_choice', old_schema['required'])
        # Hosted Save rejections, in the order the flow service reported them:
        #   1.0.0.2  ParseJson 'Validate_request' secure outputs  (all versions up to 1.0.0.2 carried it)
        #   1.0.0.3  Response  'Invalid_request_response' secure outputs (all versions up to 1.0.0.3 carried it;
        #            the designer offers no Security settings for Response, so it could not be removed in the editor)
        parse_json = ['Validate_draft', 'Validate_provider', 'Validate_request']
        for folder, name in ((HISTORY, '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_0.zip'),
                             (HISTORY, '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_1.zip'),
                             (HISTORY, '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_2.zip')):
            document = workflow_in(folder / name)
            self.assertEqual(with_outputs_secured(document, 'ParseJson'), parse_json, name)
            self.assertEqual(with_outputs_secured(document, 'Response'), RESPONSES, name)
        third = workflow_in(HISTORY / '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_3.zip')
        self.assertEqual(with_outputs_secured(third, 'ParseJson'), [])
        self.assertEqual(with_outputs_secured(third, 'Response'), RESPONSES)
        current = flow.definition(API_NAME)
        self.assertEqual(with_outputs_secured(current, 'ParseJson'), [])
        self.assertEqual(with_outputs_secured(current, 'Response'), [])
        self.assertEqual(with_outputs_secured(current, 'Compose'), [])
        self.assertEqual(with_outputs_secured(current, 'OpenApiConnection'), ['Claude_draft'])
        self.assertEqual({n: secure_properties(a) for n, a in all_actions(current).items() if secure_properties(a)},
                         {'Validate_request': ['inputs'], 'Validate_provider': ['inputs'], 'Validate_draft': ['inputs'],
                          'Claude_draft': ['inputs', 'outputs']})

    def test_update_changes_only_secure_data_and_keeps_identities(self):
        self.assertEqual(connector_packaging.VERSION, '1.0.0.1')
        self.assertEqual(packaging.VERSION, '1.0.0.4')
        self.assertEqual(connector_packaging.SOLUTION_NAME, 'OSSCloudWaveClaudeDraftConnector')
        self.assertEqual(connector_packaging.CONNECTOR_ID, '9d027c49-6154-5783-9503-a0e9f0458709')
        self.assertEqual(packaging.SOLUTION_NAME, 'OSSCloudWaveClaudeDraftIntegration')
        self.assertEqual(packaging.FLOW_ID, 'd227a436-d15f-5533-92db-ff80887f0bd8')
        new = flow.definition(API_NAME)
        for folder, name in ((HISTORY, '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_3.zip'),
                             (HISTORY, '02_OSSCloudWaveClaudeDraftIntegration_1_0_0_2.zip')):
            previous = workflow_in(folder / name)
            self.assertNotEqual(new, previous)
            self.assertEqual(new, apply_secure_data_policy(previous), name + ': this update must change only secure-data settings')
        self.assertNotIn('secureData', new['properties']['definition']['triggers']['manual']['runtimeConfiguration'])

    def test_delivered_zips_match_generated_sources_and_baselines(self):
        with zipfile.ZipFile(repack.CONNECTOR_ZIP) as new, zipfile.ZipFile(repack.BASELINE_CONNECTOR) as base:
            self.assertEqual(new.namelist(), base.namelist())
            self.assertEqual(json.loads(new.read(repack.OPENAPI_MEMBER)), contract.connector_spec())
            solution = new.read('solution.xml').decode('utf-8-sig')
            self.assertIn('<Version>1.0.0.1</Version>', solution)
            self.assertEqual(solution.replace('<Version>1.0.0.1</Version>', '<Version>1.0.0.0</Version>'), base.read('solution.xml').decode('utf-8-sig'))
            for member in new.namelist():
                if member not in (repack.OPENAPI_MEMBER, 'solution.xml'):
                    self.assertEqual(new.read(member), base.read(member), member)
        # The connector did not change: the rebuilt ZIP is byte-identical to the copy delivered with 1.0.0.2 and 1.0.0.3 (source/history/).
        self.assertEqual(repack.sha256(repack.CONNECTOR_ZIP), repack.sha256(repack.PREVIOUS_CONNECTOR_ZIP))
        with zipfile.ZipFile(repack.FLOW_ZIP) as new, zipfile.ZipFile(repack.BASELINE_FLOW) as base:
            self.assertEqual(new.namelist(), base.namelist())
            document = json.loads(new.read(repack.WORKFLOW_MEMBER))
            self.assertEqual(document, flow.definition(API_NAME))
            solution = new.read('solution.xml').decode('utf-8-sig')
            self.assertIn('<Version>1.0.0.4</Version>', solution)
            self.assertEqual(solution.replace('<Version>1.0.0.4</Version>', '<Version>1.0.0.3</Version>'), base.read('solution.xml').decode('utf-8-sig'))
            customizations = new.read('customizations.xml').decode('utf-8-sig')
            self.assertIn('<IntroducedVersion>1.0.0.4</IntroducedVersion>', customizations)
            self.assertEqual(customizations.replace('<IntroducedVersion>1.0.0.4</IntroducedVersion>', '<IntroducedVersion>1.0.0.3</IntroducedVersion>'),
                             base.read('customizations.xml').decode('utf-8-sig'))
            self.assertIn('<StateCode>0</StateCode>', customizations); self.assertIn('<StatusCode>1</StatusCode>', customizations)
            self.assertIn('WorkflowId="{d227a436-d15f-5533-92db-ff80887f0bd8}"', customizations)
            self.assertEqual(new.read('[Content_Types].xml'), base.read('[Content_Types].xml'))
            encoded = json.dumps(document)
            self.assertEqual(document['properties']['connectionReferences']['claude_intake']['api']['name'], API_NAME)
            self.assertEqual(action(document, 'Claude_draft')['inputs']['host']['apiId'], '/providers/Microsoft.PowerApps/apis/' + API_NAME)
            self.assertEqual(encoded.count('"secureData"'), 4, 'exactly four secured actions: three ParseJson inputs, one connector call')
            for forbidden in ('sk-ant-', 'fixture', 'sig=', 'Bearer '):
                self.assertNotIn(forbidden, encoded)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DesignerBindingChecks)
    assert suite.countTestCases() == 5, 'Missing binding regression checks'
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)
