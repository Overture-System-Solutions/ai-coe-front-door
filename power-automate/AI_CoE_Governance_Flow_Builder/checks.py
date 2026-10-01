"""Offline checks for a built target.

    python checks.py --target cloudwave-privatepilot [--write-verification]

The central check re-derives each flow from the live 1.0.0.8 export at the JSON level, applying only
the intended changes (site, recipients, responder, connection references, declared wording), and
requires the packaged flow to equal it exactly. Anything else that changed fails.
"""
import argparse
import copy
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import build_solution as b
import front_door_lists as fdl

EXPECTED_FLOWS = {'SharePointProvisioning', 'WeeklyPortfolioControl', 'ReviewandDecision', 'IntakeProcessing', 'TriageandRouting'}
TARGET = None


def members(path):
    with zipfile.ZipFile(path) as archive:
        return {info.filename: archive.read(info) for info in archive.infolist()}


def expected_flow(target, kind, old_document):
    """The exported flow with only the intended edits, applied independently of the text build."""
    def walk(value, key=None):
        if isinstance(value, dict):
            out = {}
            for k, v in value.items():
                if k == 'connectionReferenceLogicalName' and v in target.references:
                    out[k] = target.references[v][0]
                else:
                    out[k] = walk(v, k)
            return out
        if isinstance(value, list):
            return [walk(item, key) for item in value]
        if isinstance(value, str):
            value = value.replace(b.OLD_SITE, target.site)
            if value in (b.SAM, b.OLD_PAIR):
                return target.recipients
            if key == 'parameters/body' and '"ApproverEmail":"%s"' % b.SAM in value:
                value = value.replace('"ApproverEmail":"%s"' % b.SAM, '"ApproverEmail":"%s"' % b.RESPONDER)
            for relabel_kind, old, new, _ in target.relabels:
                if relabel_kind == kind:
                    value = value.replace(old, new)
            return value
        return value
    return walk(copy.deepcopy(old_document))


class Checks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = TARGET
        cls.old = members(b.BASELINE)
        cls.new = members(cls.t.out)
        cls.ids = b.workflow_ids(cls.t, cls.old)

    def test_baseline_is_the_registered_live_export(self):
        self.assertEqual(b.sha256(b.BASELINE), b.BASELINE_SHA256)

    def test_members(self):
        self.assertEqual(len(self.new), len(self.old))
        flows = {name.split('/')[1].split('-')[0].replace(self.t.file_prefix, '') for name in self.new if name.startswith('Workflows/')}
        self.assertEqual(flows, EXPECTED_FLOWS)
        self.assertEqual(self.new['[Content_Types].xml'], self.old['[Content_Types].xml'])

    def test_flows_differ_from_the_export_only_by_the_intended_edits(self):
        for old_name, data in self.old.items():
            if not old_name.startswith('Workflows/'):
                continue
            new_name = b.new_workflow_name(self.t, old_name, self.ids)
            with self.subTest(flow=new_name):
                self.assertIn(new_name, self.new)
                kind = b.workflow_kind(old_name)
                expected = expected_flow(self.t, kind, json.loads(data.decode('utf-8')))
                if self.t.front_door_lists and kind == 'SharePointProvisioning':
                    expected = fdl.add_front_door_lists(expected, self.t.site, self.t.operators_group)
                self.assertEqual(json.loads(self.new[new_name].decode('utf-8')), expected)

    def test_provisioning_creates_the_front_door_lists_when_the_target_asks(self):
        name = [n for n in self.new if n.startswith('Workflows/') and 'SharePointProvisioning' in n][0]
        document = json.loads(self.new[name].decode('utf-8'))
        actions = document['properties']['definition']['actions']
        titles = [entry['title'] for entry in actions['List_definitions']['inputs']]
        per_list = actions['For_each_list']['actions']
        schema = per_list['For_each_field']['actions']['If_field_exists']['else']['actions']['Create_field']['inputs']['parameters']['parameters/body']['parameters']['SchemaXml']
        if not self.t.front_door_lists:
            self.assertEqual(len(titles), 9)
            self.assertFalse([step for _, step, _, _, _ in fdl.SETTINGS if step in per_list])
            self.assertNotIn(fdl.READ_ONLY_STEP, per_list)
            self.assertTrue(schema.startswith('@concat('))
            return
        self.assertEqual(titles[9:], ['AI CoE Program Measures', 'AI CoE Outcome Records', 'AI CoE Approved Tools', fdl.DRAFTS_TITLE])
        # The snapshot is the front door's own pages.json declaration, when its source is beside this builder.
        if fdl.PAGES_JSON.exists():
            pages = json.loads(fdl.PAGES_JSON.read_text(encoding='utf-8'))['lists']
            self.assertEqual(fdl.snapshot(), [{k: entry[k] for k in ('title', 'description', 'fields', 'security', 'fullControlGroups', 'hideFromDefaultView') if k in entry} for entry in pages])
        definitions = {entry['title']: entry for entry in actions['List_definitions']['inputs']}
        for declared in fdl.snapshot():
            definition = definitions[declared['title']]
            self.assertEqual([f['internalName'] for f in definition['fields']], [f['name'] for f in declared['fields']])
            self.assertEqual(definition.get('itemLevelSecurity', False), declared.get('security') == 'ownItems')
            self.assertEqual(definition.get(fdl.READ_ONLY_FLAG, False), declared.get('security') == 'readOnly')
            self.assertEqual(definition.get('fullControlGroup'), self.t.operators_group if declared.get('security') == 'readOnly' else None)
            self.assertNotIn('noAttachmentsOrVersions', definition)
            self.assertNotIn('indexTitle', definition)
            for field, source in zip(definition['fields'], declared['fields']):
                with self.subTest(field=source['name']):
                    xml = ET.fromstring(field['schemaXml'])
                    self.assertEqual((xml.get('Type'), xml.get('Name'), xml.get('StaticName')), (source['type'], source['name'], source['name']))
                    self.assertEqual(xml.get('Required'), 'TRUE' if source.get('required') else 'FALSE')
                    self.assertEqual(xml.get('Indexed') == 'TRUE', bool(source.get('indexed') or source.get('unique')))
                    self.assertEqual(xml.get('EnforceUniqueValues') == 'TRUE', bool(source.get('unique')))
                    if source['type'] == 'Choice':
                        self.assertEqual([c.text for c in xml.findall('CHOICES/CHOICE')], source['choices'])
        # The drafts list: the installer's columns and field XML, Title indexed, no attachments or versions, own items.
        drafts = definitions[fdl.DRAFTS_TITLE]
        self.assertEqual((drafts['noAttachmentsOrVersions'], drafts['indexTitle'], drafts['itemLevelSecurity']), (True, True, True))
        if fdl.DRAFT_INSTALLER.exists():
            installer = fdl.DRAFT_INSTALLER.read_text(encoding='utf-8')
            declared = re.search(r"\$schema=\[ordered\]@\{([^}]*)\}", installer).group(1)
            columns = [tuple(part.split('=')) for part in declared.split(';')]
            self.assertEqual([(n, "'%s'" % k) for n, k, _ in fdl.DRAFTS], [(n, k) for n, k in columns if n != 'Title'])
            self.assertIn("$extra=if($name -eq 'DraftJson'){' RichText=\"FALSE\" AppendOnly=\"FALSE\" NumLines=\"6\"'}elseif($name -eq 'ExpiresAt'){' Format=\"DateTime\"'}else{''}", installer)
            self.assertIn("""$xml='<Field Type="'+$schema[$name]+'" Name="'+$name+'" StaticName="'+$name+'" DisplayName="'+$name+'" Required="FALSE" EnforceUniqueValues="FALSE"'+$extra+' />'""", installer)
        for field in drafts['fields']:
            xml = ET.fromstring(field['schemaXml'])
            self.assertEqual((xml.get('Required'), xml.get('EnforceUniqueValues')), ('FALSE', 'FALSE'))
        self.assertEqual(ET.fromstring([f for f in drafts['fields'] if f['internalName'] == 'ExpiresAt'][0]['schemaXml']).get('Format'), 'DateTime')
        # The nine exported lists keep the field schema the export built; only a field's own schema overrides it.
        self.assertTrue(schema.startswith("@if(empty(items('For_each_field')?['schemaXml']), concat('<Field Type=\"'"))
        self.assertTrue(schema.endswith(", items('For_each_field')?['schemaXml'])"))
        for entry in actions['List_definitions']['inputs'][:9]:
            self.assertFalse(any('schemaXml' in f for f in entry['fields']), entry['title'])
            for flag, _, _, _, _ in fdl.SETTINGS:
                self.assertNotIn(flag, entry)
            self.assertNotIn(fdl.READ_ONLY_FLAG, entry)
        # The three settings run in the installer's order after the fields, each only when its flag is set.
        after = 'For_each_field'
        for flag, step, inner, uri, body in fdl.SETTINGS:
            action = per_list[step]
            self.assertEqual(action['runAfter'], {after: ['Succeeded']})
            self.assertEqual(action['expression'], "@equals(items('For_each_list')?['%s'], true)" % flag)
            merge = action['actions'][inner]['inputs']['parameters']
            self.assertEqual((merge['dataset'], merge['parameters/uri'], merge['parameters/body']), (self.t.site, uri, body))
            self.assertEqual(merge['parameters/headers']['X-HTTP-Method'], 'MERGE')
            after = step
        self.assertEqual(list(per_list)[-4:], [step for _, step, _, _, _ in fdl.SETTINGS] + [fdl.READ_ONLY_STEP])
        # The approved tools (readOnly): after the three settings, only when the list asks; in the installer's order.
        tools = definitions['AI CoE Approved Tools']
        self.assertEqual((tools[fdl.READ_ONLY_FLAG], tools['fullControlGroup']), (True, self.t.operators_group))
        self.assertNotIn('itemLevelSecurity', tools)
        self.assertIn('EnforceUniqueValues="TRUE"', [f for f in tools['fields'] if f['internalName'] == 'ToolId'][0]['schemaXml'])
        step = per_list[fdl.READ_ONLY_STEP]
        self.assertEqual(step['runAfter'], {fdl.SETTINGS[-1][1]: ['Succeeded']})
        self.assertEqual(step['expression'], "@equals(items('For_each_list')?['readOnlyItems'], true)")
        inner = step['actions']
        self.assertEqual(list(inner), ['Read_list_inheritance', 'If_list_inherits', 'Find_operators_group', 'Find_full_control', 'If_operators_group', 'Set_read_only_items'])
        self.assertEqual([inner[n]['runAfter'] for n in list(inner)[1:]], [{'Read_list_inheritance': ['Succeeded']}, {'If_list_inherits': ['Succeeded']}, {'Find_operators_group': ['Succeeded']}, {'Find_full_control': ['Succeeded']}, {'If_operators_group': ['Succeeded']}])
        uri = lambda action: action['inputs']['parameters']['parameters/uri']
        self.assertEqual(uri(inner['Read_list_inheritance']), fdl.READ_ONLY_INHERITANCE_URI)
        self.assertIn('HasUniqueRoleAssignments', inner['If_list_inherits']['expression'])
        self.assertEqual(uri(inner['If_list_inherits']['actions']['Break_list_inheritance']), fdl.BREAK_URI)
        self.assertIn('copyRoleAssignments=true', fdl.BREAK_URI)
        self.assertIn("['fullControlGroup']", uri(inner['Find_operators_group']))
        self.assertEqual(uri(inner['Find_full_control']), '_api/web/roledefinitions/getbytype(5)?$select=Id')
        grant = inner['If_operators_group']['actions']['Grant_operators_full_control']
        self.assertIn("body('Find_operators_group')", uri(grant))
        self.assertIn("body('Find_full_control')", uri(grant))
        self.assertEqual(inner['If_operators_group']['else'], {'actions': {}})
        flags = inner['Set_read_only_items']['inputs']['parameters']
        self.assertEqual((flags['parameters/uri'], flags['parameters/body'], flags['parameters/headers']['X-HTTP-Method']),
                         (fdl.LIST_URI, {'__metadata': {'type': 'SP.List'}, 'ReadSecurity': 1, 'WriteSecurity': 4}, 'MERGE'))
        for action in [inner['Read_list_inheritance'], inner['Find_operators_group'], inner['Find_full_control'], grant, inner['Set_read_only_items'], inner['If_list_inherits']['actions']['Break_list_inheritance']]:
            self.assertEqual(action['inputs']['parameters']['dataset'], self.t.site)

    def test_site_recipients_responder_and_wording(self):
        for name, data in self.new.items():
            if not name.startswith('Workflows/'):
                continue
            text = data.decode('utf-8')
            with self.subTest(flow=name):
                self.assertNotIn('CloudWaveDashboardDemo', text)
                self.assertGreater(text.count(self.t.site), 0)
                self.assertEqual(text.count('sharepoint.com/sites/'), text.count(self.t.site))
                self.assertNotIn(b.OLD_PAIR, text)
                for old in self.t.references:
                    self.assertNotIn('"%s"' % old, text)
                for _, old, _, _ in self.t.relabels:
                    self.assertNotIn(old, text)
                if self.t.key == 'cloudwave-privatepilot':
                    self.assertNotIn('osscontact', text.lower())
                    self.assertNotIn('DEMO', text.upper())
                    self.assertNotIn('SYNTHETIC', text.upper())
                if self.t.key in ('ai-coe-lab', 'overture-ai-coe'):
                    self.assertNotIn('gocloudwave', text.lower())
                    self.assertNotIn('parkplace', text.lower())
                    self.assertNotIn('DEMO', text.upper())
                    self.assertNotIn('SYNTHETIC', text.upper())

                def walk(value):
                    if isinstance(value, dict):
                        for k, v in value.items():
                            if k in ('emailMessage/To', 'WebhookApprovalCreationInput/assignedTo'):
                                self.assertEqual(v, self.t.recipients)
                            walk(v)
                    elif isinstance(value, list):
                        for item in value:
                            walk(item)
                walk(json.loads(text))
                if 'ReviewandDecision' in name:
                    self.assertEqual(text.count(b.RESPONDER), 2)
                    self.assertIn('"Start_and_wait_for_approval"', text)

    def test_solution_identity_and_new_ids(self):
        manifest = ET.fromstring(self.new['solution.xml']).find('SolutionManifest')
        self.assertEqual(manifest.findtext('UniqueName'), self.t.solution)
        self.assertEqual(manifest.findtext('Version'), self.t.version)
        self.assertEqual(manifest.findtext('Managed'), '0')
        self.assertEqual(manifest.find('Publisher').findtext('UniqueName'), 'OSSCloudWaveDemoPublisher')
        self.assertEqual(manifest.find('Publisher').findtext('CustomizationPrefix'), 'cwdd')
        roots = {rc.get('id').strip('{}') for rc in manifest.findall('RootComponents/RootComponent')}
        self.assertEqual(roots, set(self.ids.values()))
        self.assertFalse(roots & {old.lower() for old in self.ids})
        customizations = ET.fromstring(self.new['customizations.xml'])
        workflows = customizations.findall('Workflows/Workflow')
        self.assertEqual({w.get('WorkflowId').strip('{}') for w in workflows}, roots)
        for workflow in workflows:
            with self.subTest(workflow=workflow.get('Name')):
                self.assertTrue(workflow.get('Name').startswith(self.t.flow_prefix + ' — '))
                self.assertEqual((workflow.findtext('StateCode'), workflow.findtext('StatusCode')), ('0', '1'))
                self.assertEqual(workflow.findtext('IntroducedVersion'), self.t.version)
                self.assertIn(workflow.findtext('JsonFileName').lstrip('/'), self.new)
        references = {c.get('connectionreferencelogicalname'): c.findtext('connectionreferencedisplayname')
                      for c in customizations.findall('.//connectionreference')}
        self.assertEqual(references, {new: display for new, display in self.t.references.values()})
        for name, data in self.new.items():
            if name.startswith('Workflows/'):
                used = {ref['connection']['connectionReferenceLogicalName'] for ref in json.loads(data)['properties']['connectionReferences'].values()}
                self.assertTrue(used <= set(references), name)

    def test_no_credentials(self):
        for name, data in self.new.items():
            text = data.decode('utf-8', 'replace').lower()
            for marker in ('sk-ant-', 'password', 'client_secret', 'bearer '):
                self.assertNotIn(marker, text, name)

    def test_deterministic_build(self):
        with tempfile.TemporaryDirectory() as folder:
            again, _ = b.build(self.t, Path(folder) / 'again.zip')
            self.assertEqual(again.read_bytes(), self.t.out.read_bytes())


def write_verification(target, result):
    report = {
        'status': 'LOCAL_CHECKS_PASS_IMPORT_AND_SAVE_PENDING' if result.wasSuccessful() else 'LOCAL_CHECKS_FAIL',
        'verified_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'target': target.key,
        'zip': target.out.name, 'zip_sha256': b.sha256(target.out), 'zip_bytes': target.out.stat().st_size,
        'solution': target.solution, 'version': target.version, 'display_name': target.display,
        'baseline': 'OSSCloudWaveDashboardDemo 1.0.0.8 live OSS export (project home source S780)',
        'baseline_sha256': b.BASELINE_SHA256,
        'site_url': target.site, 'replaces_site_url': b.OLD_SITE,
        'recipients': target.recipients, 'decision_approver_email': b.RESPONDER,
        'wording_changes': [{'flow': kind, 'from': old, 'to': new} for kind, old, new, _ in target.relabels],
        'workflow_ids': {old.lower(): new for old, new in b.workflow_ids(target, members(b.BASELINE)).items()},
        'connection_references': {new: display for new, display in target.references.values()},
        'flows_packaged_off': True,
        'tests': {'run': result.testsRun, 'failed': len(result.failures) + len(result.errors), 'skipped': len(result.skipped)},
        'build_command': 'python build_solution.py --target ' + target.key,
        'not_verified': 'Not imported, saved, run or tested against SharePoint, Outlook or Approvals.'
    }
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', required=True, choices=sorted(b.TARGETS))
    parser.add_argument('--write-verification', action='store_true')
    args = parser.parse_args()
    TARGET = b.TARGETS[args.target]
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Checks)
    outcome = unittest.TextTestRunner(verbosity=1).run(suite)
    if args.write_verification:
        name = 'VERIFICATION.json' if TARGET.key == 'ossaicoedemo' else 'VERIFICATION_02_workflows.json'
        # A package written straight into current/ (beside other exports) gets its own name there.
        if TARGET.out.parent.name == 'current':
            name = 'VERIFICATION_' + TARGET.out.stem + '.json'
        path = TARGET.out.parent / name
        path.write_text(json.dumps(write_verification(TARGET, outcome), indent=2) + '\n', encoding='utf-8')
        print('Wrote', path)
    sys.exit(0 if outcome.wasSuccessful() else 1)
