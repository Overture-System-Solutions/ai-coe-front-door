"""Deterministic isolated native solution packaging; no registration or tenant actions."""
from __future__ import annotations
import ast
import hashlib
import io
import json
from pathlib import Path
import re
from types import SimpleNamespace
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
import zipfile
from marketing_flow import ROOT

DONOR_SHA256 = 'bb39ae86413b684eba5f05b90b1c9876b20e5b5a28d74285e74e82bb8ac0a430'


def packing_primitives():
    """Extract only proven pure XML functions; never import donor runtime/model."""
    path = ROOT / 'generator/packing_donor.py'
    source = path.read_bytes()
    assert hashlib.sha256(source).hexdigest() == DONOR_SHA256
    names = {'solution_xml', 'workflow_xml', 'connref_xml', 'safe_name'}
    tree = ast.parse(source)
    keep = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    keep += [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'CRM_VERSION', 'CONTENT_TYPES'} for t in n.targets)]
    model = SimpleNamespace(SOLUTION_UNIQUE='AICoEMarketingAutomation', SOLUTION_VERSION='1.0.0.0',
                            SOLUTION_DISPLAY='AI CoE Marketing Automation', PUBLISHER_UNIQUE='AICoEMarketingPublisher',
                            PUBLISHER_DISPLAY='AI CoE Marketing', PUBLISHER_PREFIX='aicoe', ENV_VARS=[])
    ns = {'re': re, 'escape': escape, 'M': model}
    exec(compile(ast.Module(body=keep, type_ignores=[]), str(path), 'exec'), ns)
    return ns


def deterministic_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(files.items()):
            item = zipfile.ZipInfo(name, (2026, 9, 23, 12, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o644 << 16
            z.writestr(item, data)
    return buf.getvalue()


def build_zip(flow):
    p = packing_primitives()
    manifest = ET.fromstring(p['solution_xml']([flow], True))
    desc = manifest.find('./SolutionManifest/Descriptions/Description')
    desc.set('description', 'OFF unbound local review candidate. One serialized Marketing canonical writer; pure helper and existing Claude connector registered separately. No Send; native qualification pending.')
    connections = []
    for ref in flow.definition()['properties']['connectionReferences'].values():
        name = ref['connection']['connectionReferenceLogicalName']
        node = ET.fromstring(p['connref_xml'](name, name, ref['api']['name']))
        # This is an existing export-derived Claude Dataverse identity, not a guessed API ID.
        if name == 'aicoe_marketingclaude':
            custom = ET.SubElement(node, 'customconnectorid')
            ET.SubElement(custom, 'connectorid').text = '9d027c49-6154-5783-9503-a0e9f0458709'
        connections.append(node)
    custom = ET.Element('ImportExportXml', {'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'})
    for tag in ['Entities', 'Roles', 'Workflows', 'FieldSecurityProfiles', 'Templates', 'EntityMaps', 'EntityRelationships', 'OrganizationSettings', 'optionsets', 'CustomControls', 'EntityDataProviders', 'connectionreferences', 'Languages']:
        ET.SubElement(custom, tag)
    custom.find('Workflows').append(ET.fromstring(p['workflow_xml'](flow)))
    custom.find('connectionreferences').extend(connections)
    ET.SubElement(custom.find('Languages'), 'Language').text = '1033'
    files = {'[Content_Types].xml': p['CONTENT_TYPES'].encode(),
             'solution.xml': ET.tostring(manifest, encoding='utf-8', xml_declaration=True),
             'customizations.xml': ET.tostring(custom, encoding='utf-8', xml_declaration=True),
             f"Workflows/{p['safe_name'](flow.name)}-{flow.guid.upper()}.json": (json.dumps(flow.definition(), indent=2) + '\n').encode()}
    return deterministic_zip(files)


def semantics(path):
    with zipfile.ZipFile(path) as z:
        m = ET.fromstring(z.read('solution.xml')).find('SolutionManifest')
        x = ET.fromstring(z.read('customizations.xml'))
        w = x.findall('./Workflows/Workflow')
        refs = {r.attrib['connectionreferencelogicalname']: {'api': r.findtext('connectorid'), 'customId': r.findtext('customconnectorid/connectorid')} for r in x.findall('./connectionreferences/connectionreference')}
        return {'solution': m.findtext('UniqueName'), 'version': m.findtext('Version'),
                'publisher': m.findtext('Publisher/UniqueName'), 'prefix': m.findtext('Publisher/CustomizationPrefix'),
                'roots': sorted((r.attrib['type'], r.attrib.get('id', '').strip('{}').lower()) for r in m.findall('./RootComponents/RootComponent')),
                'references': refs, 'workflows': {f.attrib['WorkflowId'].strip('{}').lower(): {
                    'name': f.attrib['Name'], 'state': f.findtext('StateCode'), 'status': f.findtext('StatusCode'),
                    'definition': json.loads(z.read(f.findtext('JsonFileName').lstrip('/')))} for f in w}}
