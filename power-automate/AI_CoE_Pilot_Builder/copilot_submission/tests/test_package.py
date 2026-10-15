"""Checks on the solution ZIP itself: layout, identities, connector use, trigger/response shape and expression syntax."""
import hashlib
import json
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import build_copilot_submission as builder
import profiles
import wdl
from helpers import built_zip, delivered, final_name, final_zip

OTHER_PACKAGES = ['workflows', 'idea_draft', 'case_analysis']
GUID = re.compile(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')


def members(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        return {info.filename: archive.read(info) for info in archive.infolist()}


def walk_strings(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item)
    elif isinstance(value, str):
        yield value


def function_names(node):
    if node[0] == 'call':
        yield node[1]
        for arg in node[2]:
            yield from function_names(arg)
    elif node[0] == 'index':
        yield from function_names(node[1])
        yield from function_names(node[2])


class Layout(unittest.TestCase):
    def setUp(self):
        self.files = members(built_zip())
        self.workflows = {name: json.loads(data.decode('utf-8')) for name, data in self.files.items() if name.startswith('Workflows/')}

    def test_members(self):
        self.assertEqual(sorted(self.files), sorted(['customizations.xml', 'solution.xml', '[Content_Types].xml',
                                                      builder.workflow_file('feedback'), builder.workflow_file('idea')]))
        with zipfile.ZipFile(delivered('workflows')) as site_workflows:
            self.assertEqual(self.files['[Content_Types].xml'], site_workflows.read('[Content_Types].xml'))

    def test_solution_manifest_uses_the_same_publisher_as_the_sites_workflows(self):
        root = ET.fromstring(self.files['solution.xml'])
        manifest = root.find('SolutionManifest')
        self.assertEqual(manifest.findtext('UniqueName'), 'AICoEPilotCopilotSubmission')
        self.assertEqual(manifest.findtext('Version'), '1.0.0.0')
        self.assertEqual(manifest.findtext('Managed'), '0')
        # The delivered 06 (profile names applied) has the publisher the site's delivered 02 has.
        with zipfile.ZipFile(final_zip()) as ours, zipfile.ZipFile(delivered('workflows')) as site_workflows:
            mine = ET.fromstring(ours.read('solution.xml').decode('utf-8-sig')).find('SolutionManifest/Publisher')
            theirs = ET.fromstring(site_workflows.read('solution.xml').decode('utf-8-sig')).find('SolutionManifest/Publisher')
        self.assertEqual(ET.tostring(mine).split(), ET.tostring(theirs).split())
        roots = sorted((r.get('type'), r.get('id')) for r in manifest.iter('RootComponent'))
        self.assertEqual(roots, sorted(('29', '{%s}' % builder.flow_id(k)) for k in ('feedback', 'idea')))

    def test_workflows_are_cloud_flows_packaged_off(self):
        root = ET.fromstring(self.files['customizations.xml'])
        flows = list(root.iter('Workflow'))
        self.assertEqual(len(flows), 2)
        for flow in flows:
            self.assertEqual(flow.findtext('Category'), '5')
            self.assertEqual(flow.findtext('ModernFlowType'), '0')
            self.assertEqual((flow.findtext('StateCode'), flow.findtext('StatusCode')), ('0', '1'))
            self.assertIn(flow.findtext('JsonFileName').lstrip('/'), self.files)
            self.assertIn(flow.get('WorkflowId').strip('{}').upper(), flow.findtext('JsonFileName'))
        references = list(root.iter('connectionreference'))
        self.assertEqual([(r.get('connectionreferencelogicalname'), r.findtext('connectorid')) for r in references],
                         [('cwdd_aicoepilotcopilotsharepoint', '/providers/Microsoft.PowerApps/apis/shared_sharepointonline')])

    def test_identities_do_not_collide_with_the_sites_other_packages(self):
        ours = {builder.flow_id('feedback'), builder.flow_id('idea')}
        theirs, references = set(), set()
        for package in OTHER_PACKAGES:
            for name, data in members(delivered(package)).items():
                text = data.decode('utf-8-sig', 'replace')
                if name == 'customizations.xml':
                    theirs |= {m.lower() for m in re.findall(r'WorkflowId="\{([^}]+)\}"', text)}
                    references |= set(re.findall(r'connectionreferencelogicalname="([^"]+)"', text))
        self.assertTrue(theirs)
        self.assertEqual(ours & theirs, set())
        self.assertTrue(references)
        self.assertNotIn(final_name(builder.CONNECTION_REFERENCE), references)

    def test_only_the_sharepoint_connector_through_its_reference(self):
        for name, document in self.workflows.items():
            refs = document['properties']['connectionReferences']
            self.assertEqual(refs, {'shared_sharepointonline': {
                'runtimeSource': 'embedded', 'connection': {'connectionReferenceLogicalName': builder.CONNECTION_REFERENCE},
                'api': {'name': 'shared_sharepointonline'}}})
            for action_name, action in wdl.iter_actions(document['properties']['definition']['actions']):
                self.assertIn(action['type'], {'InitializeVariable', 'SetVariable', 'Compose', 'Query', 'Select', 'If', 'Scope',
                                               'OpenApiConnection', 'Response'}, action_name)
                if action['type'] == 'OpenApiConnection':
                    host, parameters = action['inputs']['host'], action['inputs']['parameters']
                    self.assertEqual(host, {'apiId': '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
                                            'operationId': 'HttpRequest', 'connectionName': 'shared_sharepointonline'})
                    self.assertEqual(parameters['dataset'], builder.SITE)
                    self.assertIn(parameters['parameters/method'], ('GET', 'POST'))

    def test_trigger_is_when_an_agent_calls_the_flow(self):
        for kind in ('feedback', 'idea'):
            document = self.workflows[builder.workflow_file(kind)]
            triggers = document['properties']['definition']['triggers']
            self.assertEqual(list(triggers), ['manual'])
            trigger = triggers['manual']
            self.assertEqual((trigger['type'], trigger['kind']), ('Request', 'Skills'))
            schema = trigger['inputs']['schema']
            keys = list(schema['properties'])
            self.assertEqual(keys, ['text'] + ['text_%d' % i for i in range(1, len(keys))])
            self.assertEqual([p['title'] for p in schema['properties'].values()], [i['title'] for i in builder.INPUTS[kind]])
            self.assertEqual(len({p['title'] for p in schema['properties'].values()}), len(keys))
            self.assertTrue(set(schema['required']) <= set(keys))
            self.assertEqual([p['title'] for k, p in schema['properties'].items()][:3],
                             ['Signed-in user email', 'Signed-in user name', 'Conversation ID'])
            for item in schema['properties'].values():
                self.assertEqual(item['type'], 'string')
                self.assertTrue(item['description'])

    def test_exactly_one_response_to_the_agent_after_everything(self):
        for kind in ('feedback', 'idea'):
            actions = self.workflows[builder.workflow_file(kind)]['properties']['definition']['actions']
            responses = [(n, a) for n, a in wdl.iter_actions(actions) if a['type'] == 'Response']
            self.assertEqual(len(responses), 1)
            name, response = responses[0]
            self.assertIn(name, actions)   # top level, so nothing inside Submit can skip it
            self.assertEqual(response['kind'], 'Skills')
            self.assertEqual(sorted(response['inputs']['schema']['properties']), ['message', 'reference', 'status'])
            self.assertEqual(sorted(response['inputs']['body']), ['message', 'reference', 'status'])
            self.assertEqual(actions['Message']['runAfter'], {'Submit': ['Succeeded', 'Failed', 'Skipped', 'TimedOut']})

    def test_every_expression_parses_and_uses_known_functions(self):
        known = set(wdl.PURE) | {'triggerBody', 'variables', 'outputs', 'body', 'actions', 'item', 'guid', 'utcNow'}
        expressions = 0
        for document in self.workflows.values():
            definition = document['properties']['definition']
            for text in list(walk_strings(definition['actions'])) + list(walk_strings(definition['triggers'])):
                for body in wdl.expression_bodies(text):
                    node = wdl.parse(body)
                    self.assertEqual(set(function_names(node)) - known, set(), body[:80])
                    expressions += 1
        self.assertGreater(expressions, 150)

    def test_run_after_names_are_siblings_and_action_count_is_small(self):
        for document in self.workflows.values():
            actions = document['properties']['definition']['actions']
            all_actions = list(wdl.iter_actions(actions))
            self.assertLess(len(all_actions), 120)

            def check(container):
                for name, action in container.items():
                    for dependency in action.get('runAfter', {}):
                        self.assertIn(dependency, container, name)
                    check(action.get('actions', {}))
                    check(action.get('else', {}).get('actions', {}))
            check(actions)


class Builds(unittest.TestCase):
    def test_build_is_deterministic(self):
        first = hashlib.sha256(Path(built_zip()).read_bytes()).hexdigest()
        again = builder.build(Path(tempfile.mkdtemp(prefix='copilot-submission-again-')))
        self.assertEqual(first, hashlib.sha256(again.read_bytes()).hexdigest())

    def test_delivered_zip_is_this_build(self):
        # Same members, metadata and content; compressed bytes depend on the zlib build (see build_pilot.py).
        path = delivered('copilot_submission')
        self.assertTrue(path.exists(), 'not delivered yet: run build_pilot.py')
        self.assertTrue(profiles.governance.same_package(path, final_zip()))


if __name__ == '__main__':
    unittest.main()
