"""Offline expression execution and action graph safety; not a hosted WDL engine."""
import copy
import json
from types import SimpleNamespace
import unittest
from test_flow import ROOT, generate, walk


def module():
    assert (ROOT / 'generator/marketing_validate.py').exists(), 'WDL reference/guard validator is missing'
    import marketing_validate
    return marketing_validate


class WdlSafety(unittest.TestCase):
    def test_symbols_and_native_graph_validate(self):
        v = module()
        f = generate()
        self.assertEqual(v.validate(f.definition()), [])
        damaged = copy.deepcopy(f.definition())
        damaged['properties']['definition']['actions']['Cfg']['runAfter'] = {'Ghost': ['Succeeded']}
        self.assertTrue(any('Ghost' in e for e in v.validate(damaged)))
        damaged = copy.deepcopy(f.definition())
        damaged['properties']['definition']['actions']['Connection_Writer']['runtimeConfiguration'] = {}
        self.assertTrue(any('secure' in e for e in v.validate(damaged)))
        damaged = copy.deepcopy(f.definition())
        damaged['properties']['definition']['actions']['Cfg']['inputs'] = "@outputs('MISSING')"
        self.assertTrue(any('MISSING' in e for e in v.validate(damaged)))

    def engine(self):
        return SimpleNamespace(outputs={}, bodies={}, variables={}, parameters={}, items={}, runid='OFFLINE-RUN', sp=SimpleNamespace(now='2026-09-23T00:00:00Z'))

    def test_wdl_source_guard_refuses_mask_and_version_before_bytes(self):
        v = module()
        action = dict(walk(generate().actions))['Initial_Before_Read_Allowed']
        engine = self.engine()
        engine.items['Initial_Sources'] = {'versionOrETag': '"5"'}
        engine.bodies['Initial_Metadata_Before'] = {'ETag': '"5"'}
        for permission, accepted in [('33', True), ('1', False), ('32', False), ('0', False)]:
            engine.bodies['Initial_Permission_Before'] = {'GetUserEffectivePermissions': {'Low': permission}}
            if accepted:
                self.assertIs(v.evaluate(action['inputs'], engine), True)
            else:
                with self.assertRaises((ValueError, TypeError)):
                    v.evaluate(action['inputs'], engine)
        engine.bodies['Initial_Permission_Before'] = {'GetUserEffectivePermissions': {'Low': '33'}}
        engine.bodies['Initial_Metadata_Before'] = {'ETag': '"6"'}
        with self.assertRaises(ValueError):
            v.evaluate(action['inputs'], engine)

    def test_wdl_unknown_provider_and_held_writer_refuse(self):
        v = module()
        actions = dict(walk(generate().actions))
        e = self.engine()
        for status in ['claimed', 'stale', 'expired']:
            e.bodies['Existing_Writer_Page'] = {'Rows': [{'RecordJson': json.dumps({'status': status})}]}
            with self.assertRaises(ValueError):
                v.evaluate(actions['No_Implicit_Lock_Takeover']['inputs'], e)
        for rows in [[], [{'RecordJson': '{"status":"idle"}'}]]:
            e.bodies['Existing_Writer_Page'] = {'Rows': rows}
            self.assertIs(v.evaluate(actions['No_Implicit_Lock_Takeover']['inputs'], e), True)
        e.bodies['Initial_Plan'] = {'ProviderWireHash': 'expected'}
        for status, wire_hash in [('pending', 'expected'), ('completed', 'wrong')]:
            e.bodies['Existing_Provider_Page'] = {'Rows': [{'RecordJson': json.dumps({'status': status, 'wireHash': wire_hash})}]}
            with self.assertRaises(ValueError):
                v.evaluate(actions['Unknown_Provider_Outcome_Held']['inputs'], e)

    def test_projected_provider_values_preserve_native_types(self):
        v = module()
        action = dict(walk(generate().actions))['Invoke_Claude']
        e = self.engine()
        wire = {'body/model': 'OFFLINE-QUALIFIED-MODEL', 'body/max_tokens': 1600, 'body/system': 'OFFLINE PROMPT',
                'body/messages': [{'role': 'user', 'content': 'OFFLINE SOURCE'}], 'body/stream': False,
                'body/thinking/type': 'disabled', 'body/output_config/format/type': 'json_schema',
                'body/output_config/format/schema': {'type': 'object', 'required': ['a']}}
        e.bodies['Before_Provider_Plan'] = {'ProviderWire': wire}
        params = action['inputs']['parameters']
        reassembled = {k: v.evaluate(x, e) if isinstance(x, str) and x.startswith('@') else x for k, x in params.items() if k.startswith('body/')}
        self.assertEqual(reassembled, wire)
        e.outputs['Cfg'] = {'enabled': True}
        e.variables = {'Row': {'Id': 1}, 'Records': [{'Id': 2}], 'Sources': [], 'ProviderResponse': {}}
        payload = v.evaluate(dict(walk(generate().actions))['Initial_Plan']['inputs']['parameters']['body/Payload'], e)
        self.assertIsInstance(payload, str)
        payload = json.loads(payload)
        self.assertEqual(payload['Records'], [{'Id': 2}])
        self.assertIsNone(payload['ProviderResponse'])
        self.assertEqual(payload['Row'], {'Id': 1})

    def test_writer_cannot_be_participant_and_foreign_acl_blocks_grant(self):
        v = module()
        actions = dict(walk(generate().actions))
        self.assertIn('Verified_Participant_Differs', actions)
        self.assertIn('Private_ACL_Only_Allowed', actions)
        e = self.engine()
        e.outputs['Cfg'] = {'writerPrincipalId': 99, 'readRoleDefinitionId': 1073741826}
        e.variables['Row'] = {'AuthorId': 99}
        with self.assertRaises(ValueError):
            v.evaluate(actions['Verified_Participant_Differs']['inputs'], e)
        e.variables['Row']['AuthorId'] = 7
        self.assertIs(v.evaluate(actions['Verified_Participant_Differs']['inputs'], e), True)
        e.bodies['Private_ACL_Readback'] = {'HasUniqueRoleAssignments': True}
        e.bodies['Private_ACL_Unexpected'] = [{'PrincipalId': 555}]
        with self.assertRaises(ValueError):
            v.evaluate(actions['Private_ACL_Only_Allowed']['inputs'], e)
        e.bodies['Private_ACL_Unexpected'] = []
        self.assertIs(v.evaluate(actions['Private_ACL_Only_Allowed']['inputs'], e), True)
        where = actions['Private_ACL_Unexpected']['inputs']['where']
        for principal, roles, rejected in [(99, [1073741829], False), (7, [1073741826], True), (7, [1073741829], True), (555, [1073741826], True)]:
            # Before fresh source authorization, even a former Author Read grant
            # makes this projection public; breakroleinheritance is not a revoke.
            e.items['item'] = {'PrincipalId': principal, 'RoleDefinitionBindings': [{'Id': x} for x in roles]}
            self.assertIs(v.evaluate(where, e), rejected)

    def test_request_rereads_normalize_rest_envelope_without_masking_edits(self):
        v = module()
        actions = dict(walk(generate().actions))
        e = self.engine()
        row = {'Id': 1, 'Title': 'OFFLINE-REQUEST', 'PayloadJson': '{}', 'AuthorId': 7}
        e.variables['Row'] = row
        for stage in ['Initial', 'Before_Provider', 'Before_Publication']:
            for returned in [row, {'d': row}]:
                e.bodies[stage + '_Request'] = returned
                self.assertIs(v.evaluate(actions[stage + '_Immutable']['inputs'], e), True)
            e.bodies[stage + '_Request'] = {'d': {**row, 'PayloadJson': '{"changed":true}'}}
            with self.assertRaises(ValueError):
                v.evaluate(actions[stage + '_Immutable']['inputs'], e)

    def test_durable_order_validator_rejects_early_dispatch_or_completion(self):
        v = module()
        original = generate().definition()
        for target, early in [('Invoke_Claude', 'Provider_Intent_Write'), ('Command_Completed_Write', 'Build_Projection'), ('Writer_Release_Write', 'Plan')]:
            broken = copy.deepcopy(original)
            actions = dict(walk(broken['properties']['definition']['actions']))
            actions[target]['runAfter'] = {early: ['Succeeded']}
            self.assertTrue(any('durable boundary' in error for error in v.validate(broken)), target)
        self.assertEqual(v.validate(original), [])


if __name__ == '__main__':
    unittest.main()
