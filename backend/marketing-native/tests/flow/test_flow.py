"""Offline generated-WDL contract tests; never invoke a Microsoft tenant."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / 'generator'
sys.path.insert(0, str(GENERATOR))


def generate():
    assert (GENERATOR / 'marketing_flow.py').is_file(), 'Native WDL generator has not been implemented'
    import marketing_flow
    return marketing_flow.command_flow()


def walk(actions):
    for name, action in actions.items():
        yield name, action
        yield from walk(action.get('actions', {}))
        yield from walk(action.get('else', {}).get('actions', {}))
        for case in action.get('cases', {}).values():
            yield from walk(case.get('actions', {}))


class NativeDefinition(unittest.TestCase):
    def test_unqualified_candidate_stops_before_connectors(self):
        f = generate()
        d = f.definition()
        self.assertEqual(f.name, 'AI CoE Marketing 01 Command')
        self.assertEqual(d['properties']['state'], 'Stopped')
        trigger = d['properties']['definition']['triggers']['Trigger']
        self.assertEqual(trigger['type'], 'Recurrence')
        self.assertEqual(trigger['runtimeConfiguration']['concurrency']['runs'], 1)
        config = f.actions['Cfg']['inputs']
        for field in ['enabled', 'controllerQualified', 'securityQualified']:
            self.assertIs(config[field], False)
        self.assertIsNone(config['writerPrincipalId'])
        self.assertIn('Configuration_Qualified', f.actions)
        self.assertNotIn('SendEmail', json.dumps(d))
        refs = d['properties']['connectionReferences']
        self.assertEqual(refs['marketing_integrity']['api']['name'], 'UNBOUND_MARKETING_INTEGRITY')
        self.assertEqual(refs['marketing_integrity']['api']['logicalName'], 'aicoe_marketingintegrity')
        self.assertNotIn('shared_office365', refs)

    def test_real_source_acquisition_and_dispatch_boundary(self):
        f = generate()
        actions = dict(walk(f.actions))
        self.assertIn('Before_Provider_Sources', actions)
        for stage in ['Initial', 'Before_Provider', 'Before_Publication']:
            loop = actions[stage + '_Sources']
            self.assertEqual(loop['runtimeConfiguration']['concurrency']['repetitions'], 1)
            body = loop['actions']
            names = list(body)
            expected = [stage + '_' + x for x in ['Permission_Before', 'Metadata_Before', 'Before_Read_Allowed', 'Bytes', 'Metadata_After', 'Permission_After', 'Observed_Source']]
            self.assertEqual(names, expected)
            for name in [n for n in expected[:-1] if not n.endswith('Before_Read_Allowed')]:
                self.assertEqual(body[name]['inputs']['host']['operationId'], 'HttpRequest')
            self.assertIn(stage + '_Canonical_Until', actions)
            self.assertIn(stage + '_Request', actions)
        provider = actions['Invoke_Claude']['inputs']
        self.assertEqual(provider['host']['operationId'], 'GenerateIntakeDraft')
        self.assertEqual(provider['parameters']['body/max_tokens'], 1600)
        self.assertIs(provider['parameters']['body/stream'], False)
        self.assertEqual(provider['parameters']['body/thinking/type'], 'disabled')
        self.assertEqual(provider['parameters']['anthropic-version'], '2023-06-01')
        binding = json.loads((ROOT.parent / 'power-automate/marketing-runtime/connector-binding.json').read_text())
        self.assertEqual(set(provider['parameters']) - {'anthropic-version'}, set(binding['claudeWire']['parameters']))
        self.assertEqual(provider['retryPolicy'], {'type': 'none'})
        self.assertIn('Readback_Provider_Intent', actions)
        self.assertIn('Readback_Provider_Response', actions)
        self.assertIn('Unknown_Provider_Outcome_Held', actions)
        self.assertEqual(actions['Unknown_Provider_Outcome_Held']['type'], 'Compose')
        self.assertIn('Original_Request_Unchanged', actions)

    def test_native_limits_privacy_and_real_bindings(self):
        f = generate()
        actions = list(walk(f.actions))
        self.assertLessEqual(len(actions), 450, 'Leave space below the native 500-action ceiling')
        refs = f.definition()['properties']['connectionReferences']
        for name, a in actions:
            self.assertEqual(set(a['runtimeConfiguration']['secureData']['properties']), {'inputs', 'outputs'}, name)
            if a['type'] == 'Foreach':
                self.assertEqual(a['runtimeConfiguration']['concurrency']['repetitions'], 1)
            if a['type'] == 'OpenApiConnection':
                i = a['inputs']
                self.assertEqual(i['retryPolicy'], {'type': 'none'}, name)
                self.assertIn(i['host']['connectionName'], refs, name)
                self.assertIn(i['host']['operationId'], {'HttpRequest', 'Evaluate', 'GenerateIntakeDraft'})
                self.assertNotEqual(i.get('parameters', {}).get('parameters/headers', {}).get('IF-MATCH'), '*')
        self.assertEqual(len(dict(actions)), len(actions), 'Action names must be unique')
        used_modes = {a['inputs']['parameters']['body/Mode'] for _, a in actions if a['type'] == 'OpenApiConnection' and a['inputs']['host']['operationId'] == 'Evaluate'}
        self.assertEqual(used_modes, {'Preflight', 'Plan', 'InspectWrite', 'VerifyWrite', 'Page', 'Projection', 'VerifyProjection'})


if __name__ == '__main__':
    unittest.main()
