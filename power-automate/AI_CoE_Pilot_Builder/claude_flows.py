"""The Claude connector (01), idea draft (03) and case analysis (04) for one target site.

Called by build_pilot.py, which reads the tenant's target file. Built from OSS's live exports in baseline/:
  01  connector 1.0.0.2 (S778) with the anthropic-version header moved out of the operation's parameters into a
      Set HTTP header policy (anthropic-version: 2023-06-01, override, on Request). No flow carries the value; the
      connector sends it exactly once. Same connector ID and name, so it imports as an update of 1.0.0.2.
  03  the live OSS idea-draft flow (1.0.0.5, S779) as a flow-only solution: the bundled connector is dropped (it
      is imported separately as 01), the flow and its connection reference are bound to the target's connector
      runtime name, names become "AI CoE Pilot", packaged Off. Its logic and its "any user in my tenant" trigger
      are unchanged.
  04  the case-analysis flow for the target site (the archived OSS packager in
      ../archived/OSS_AI_CoE_Claude_Case_Analysis_1.0.0.0/source), allowed users the target's callers, bound to the
      same connector, without anthropic-version on its Claude action; its 18 checks run against connector 1.0.0.3.
      A reference build uses the packager's fixture mode, which labels the package NOT FOR IMPORT.
These are the "pilot" names and publisher (cwdd); the "aicoe" profile renames them afterwards (retarget.py).
The connector's runtime name is assigned per environment when 01 is imported, so 03 and 04 can only be bound
once it exists: copy it from the imported connector's page address into the target file.
"""
import hashlib
import importlib.util
import json
import re
import sys
import unittest
import uuid
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE.parent
CASE_SOURCE = ARTIFACTS / 'archived' / 'OSS_AI_CoE_Claude_Case_Analysis_1.0.0.0' / 'source'

API_PATTERN = r'shared_cwdd-5foss-20claude-20intake-20draft-5f[0-9a-f]{8,40}'
OSS_API = 'shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6'
CUSTOM_CONNECTOR_ID = '9d027c49-6154-5783-9503-a0e9f0458709'
CONNECTOR_BASELINE = HERE / 'baseline' / '01_ClaudeConnector_OSSCloudWaveClaudeDraftConnector_1_0_0_2.zip'
CONNECTOR_BASELINE_SHA256 = '635d273010c7f27714d94e2474b057baf16431f7bdecc4d3be679b7be7057f19'
CONNECTOR_VERSION = '1.0.0.3'
CONNECTOR_ZIP_NAME = '01_ClaudeConnector_OSSCloudWaveClaudeDraftConnector_1_0_0_3.zip'
CONNECTOR_PREFIX = 'Connector/cwdd_ossclaudeintakedraft_'
API_VERSION = '2023-06-01'
VERSION_HEADER_POLICY = [{
    'templateId': 'setheader',
    'title': 'anthropic-version',
    'parameters': {
        'x-ms-apimTemplateParameter.name': 'anthropic-version',
        'x-ms-apimTemplateParameter.value': API_VERSION,
        'x-ms-apimTemplateParameter.existsAction': 'override',
        'x-ms-apimTemplate-policySection': 'Request',
    },
}]
CASE_VERSION = '1.0.0.1'
CASE_REFERENCE_FILES = ('request.schema.json', 'analysis.schema.json', 'response.schema.json', 'synthetic-request.json',
                        'claude-request-body.json')
DRAFT_BASELINE = HERE / 'baseline' / 'OSSCloudWaveClaudeDraftIntegration_1_0_0_5.zip'
DRAFT_BASELINE_SHA256 = '4eba02a2f9fa8923bce5fed719efd4602f103ee809e2630859663813da09954d'
DRAFT_OLD_ID = 'd227a436-d15f-5533-92db-ff80887f0bd8'
DRAFT_ZIP_NAME = '03_AICoEPilot_ClaudeIdeaDraft_1_0_0_0.zip'
DRAFT_FLOW_NAME = 'AI CoE Pilot - Claude Idea Draft'
DRAFT_REFERENCE = 'cwdd_aicoepilotclaudedraft'
DRAFT_REFERENCE_DISPLAY = 'AI CoE Pilot Claude Idea Draft Connection'
CASE_FOLDER = '04_case_analysis'
CASE_NAMES = {
    'SOLUTION_NAME': 'AICoEPilotClaudeCaseAnalysis',
    'SOLUTION_DISPLAY_NAME': 'AI CoE Pilot Claude Case Analysis',
    'FLOW_NAME': 'AI CoE Pilot - Claude Case Analysis',
    'SHAREPOINT_REFERENCE_DISPLAY_NAME': 'AI CoE Pilot Case Analysis SharePoint',
    'CLAUDE_REFERENCE_DISPLAY_NAME': 'AI CoE Pilot Claude Case Analysis Connection',
}
FIXED_TIME = (2026, 9, 28, 0, 0, 0)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def replace(text, old, new, count, label):
    found = text.count(old)
    if found != count:
        raise ValueError('%s: expected %d of %r, found %d' % (label, count, old[:80], found))
    return text.replace(old, new)


def without_version_parameter(spec):
    operation = spec['paths']['/messages']['post']
    kept = [p for p in operation['parameters'] if p.get('name') != 'anthropic-version']
    if len(kept) != len(operation['parameters']) - 1:
        raise ValueError('connector: expected exactly one anthropic-version parameter')
    operation['parameters'] = kept
    return spec


def build_connector(out):
    """Connector 1.0.0.2 with anthropic-version sent by a policy instead of a declared parameter."""
    if sha256(CONNECTOR_BASELINE) != CONNECTOR_BASELINE_SHA256:
        raise ValueError('Connector baseline is not the registered 1.0.0.2 export (S778)')
    with zipfile.ZipFile(CONNECTOR_BASELINE) as source:
        infos = source.infolist()
        members = {info.filename: source.read(info) for info in infos}
    outputs = []
    for info in infos:
        name, data = info.filename, members[info.filename]
        if name == CONNECTOR_PREFIX + 'openapidefinition.json':
            text = data.decode('utf-8')
            spec = json.loads(text)
            if json.dumps(spec, indent=2) + '\n' != text:
                raise ValueError('connector: OpenAPI file is not in the expected two-space layout')
            data = (json.dumps(without_version_parameter(spec), indent=2) + '\n').encode('utf-8')
        elif name == CONNECTOR_PREFIX + 'policytemplateinstances.json':
            if data != b'[]':
                raise ValueError('connector: expected no policies in 1.0.0.2')
            data = json.dumps(VERSION_HEADER_POLICY, separators=(',', ':')).encode('utf-8')
        elif name == 'solution.xml':
            text = data.decode('utf-8')
            text = replace(text, '<Version>1.0.0.2</Version>', '<Version>%s</Version>' % CONNECTOR_VERSION, 1, 'connector version')
            data = text.encode('utf-8')
        outputs.append((name, data, info))
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w') as archive:
        for name, data, info in outputs:
            entry = zipfile.ZipInfo(name, FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = info.external_attr
            archive.writestr(entry, data)
    return out


def check_connector(out):
    """Only the version header moved: parameter gone, policy added, solution version bumped."""
    with zipfile.ZipFile(CONNECTOR_BASELINE) as source:
        old = {i.filename: source.read(i) for i in source.infolist()}
    with zipfile.ZipFile(out) as built:
        assert built.testzip() is None
        new = {i.filename: built.read(i) for i in built.infolist()}
    assert list(new) == list(old), sorted(new)
    changed = sorted(n for n in new if new[n] != old[n])
    assert changed == sorted([CONNECTOR_PREFIX + 'openapidefinition.json', CONNECTOR_PREFIX + 'policytemplateinstances.json',
                              'solution.xml']), changed
    old_spec = json.loads(old[CONNECTOR_PREFIX + 'openapidefinition.json'].decode('utf-8'))
    new_spec = json.loads(new[CONNECTOR_PREFIX + 'openapidefinition.json'].decode('utf-8'))
    assert new_spec == without_version_parameter(old_spec), 'the OpenAPI definition changed beyond the version header'
    assert 'anthropic-version' not in json.dumps(new_spec)
    assert new_spec['securityDefinitions'] == {'api_key': {'type': 'apiKey', 'in': 'header', 'name': 'x-api-key'}}
    assert json.loads(new[CONNECTOR_PREFIX + 'policytemplateinstances.json'].decode('utf-8')) == VERSION_HEADER_POLICY
    assert new['solution.xml'].decode('utf-8') == old['solution.xml'].decode('utf-8').replace(
        '<Version>1.0.0.2</Version>', '<Version>%s</Version>' % CONNECTOR_VERSION)
    root = ET.fromstring(new['customizations.xml'])
    assert root.findtext('Connectors/Connector/connectorid') == CUSTOM_CONNECTOR_ID
    assert root.findtext('Connectors/Connector/name') == 'cwdd_ossclaudeintakedraft'
    for name, data in new.items():
        if not name.endswith('.Png'):
            text = data.decode('utf-8', 'replace')
            assert 'sk-ant-' not in text and 'osscontact' not in text.lower(), name


def draft_id(site):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, site + '/claude-idea-draft/v1#flow'))


def draft_member_name(site):
    return 'Workflows/AICoEPilot-ClaudeIdeaDraft-' + draft_id(site).upper() + '.json'


def build_idea_draft(api, out, site):
    if sha256(DRAFT_BASELINE) != DRAFT_BASELINE_SHA256:
        raise ValueError('Idea-draft baseline is not the registered live 1.0.0.5 export')
    with zipfile.ZipFile(DRAFT_BASELINE) as source:
        infos = source.infolist()
        members = {info.filename: source.read(info) for info in infos}
    outputs = []
    for info in infos:
        name, data = info.filename, members[info.filename]
        if name.startswith('Connector/'):
            continue  # the connector is imported separately (01)
        if name.startswith('Workflows/'):
            text = data.decode('utf-8')
            text = replace(text, OSS_API, api, 2, 'flow api name')
            text = replace(text, '"cwdd_claudeintakedraftconnection"', '"%s"' % DRAFT_REFERENCE, 1, 'flow reference')
            name, data = draft_member_name(site), text.encode('utf-8')
        elif name == 'customizations.xml':
            text = data.decode('utf-8')
            text, removed = re.subn(r'\s*<Connectors>.*?</Connectors>', '', text, flags=re.S)
            if removed != 1:
                raise ValueError('customizations: expected one Connectors block')
            text = replace(text, '{%s}' % DRAFT_OLD_ID, '{%s}' % draft_id(site), 1, 'workflow id')
            text = replace(text, '/Workflows/OSSDemo-ClaudeIntakeDraft-%s.json' % DRAFT_OLD_ID.upper(), '/' + draft_member_name(site), 1, 'json file')
            text = replace(text, 'OSS Demo - Claude Intake Draft', DRAFT_FLOW_NAME, 2, 'flow name')
            text = replace(text, '<StateCode>1</StateCode>', '<StateCode>0</StateCode>', 1, 'state')
            text = replace(text, '<StatusCode>2</StatusCode>', '<StatusCode>1</StatusCode>', 1, 'status')
            text = replace(text, 'connectionreferencelogicalname="cwdd_claudeintakedraftconnection"',
                           'connectionreferencelogicalname="%s"' % DRAFT_REFERENCE, 1, 'reference')
            text = replace(text, '>OSS Claude Intake Draft Connection<', '>%s<' % DRAFT_REFERENCE_DISPLAY, 1, 'reference name')
            text = replace(text, '<connectorid>/providers/Microsoft.PowerApps/apis/%s</connectorid>' % OSS_API,
                           '<connectorid>/providers/Microsoft.PowerApps/apis/%s</connectorid>' % api, 1, 'reference connector')
            data = text.encode('utf-8')
        elif name == 'solution.xml':
            text = data.decode('utf-8')
            text = replace(text, '<UniqueName>OSSCloudWaveClaudeDraftIntegration</UniqueName>', '<UniqueName>AICoEPilotClaudeIdeaDraft</UniqueName>', 1, 'solution')
            text = replace(text, 'description="OSS CloudWave Claude Draft Integration"', 'description="AI CoE Pilot Claude Idea Draft"', 1, 'display')
            text = replace(text, 'description="Authenticated idea draft generation through the separate Anthropic Claude connector. No case submission, approval or telemetry changes."',
                           'description="Idea-draft generation for the AI CoE private pilot through the separately imported Claude connector. Drafts only: no case submission, approval or telemetry changes."', 1, 'description')
            text = replace(text, '<Version>1.0.0.5</Version>', '<Version>1.0.0.0</Version>', 1, 'version')
            text = replace(text, 'id="{%s}"' % DRAFT_OLD_ID, 'id="{%s}"' % draft_id(site), 1, 'root workflow')
            text, removed = re.subn(r'\s*<RootComponent type="372"[^>]*/>', '', text)
            if removed != 1:
                raise ValueError('solution: expected one connector root component')
            data = text.encode('utf-8')
        outputs.append((name, data, info))
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w') as archive:
        for name, data, info in outputs:
            entry = zipfile.ZipInfo(name, FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = info.external_attr
            archive.writestr(entry, data)
    return out


def check_idea_draft(api, out, site):
    """The packaged flow must equal the live export with only the connector binding renamed."""
    with zipfile.ZipFile(DRAFT_BASELINE) as source:
        old = {i.filename: source.read(i) for i in source.infolist()}
    with zipfile.ZipFile(out) as built:
        new = {i.filename: built.read(i) for i in built.infolist()}
    assert not [n for n in new if n.startswith('Connector/')], 'connector files must not be packaged'
    assert set(new) == {'customizations.xml', 'solution.xml', '[Content_Types].xml', draft_member_name(site)}, sorted(new)
    old_flow = json.loads(old[[n for n in old if n.startswith('Workflows/')][0]].decode('utf-8'))

    def rebind(value, key=None):
        if isinstance(value, dict):
            return {k: (DRAFT_REFERENCE if k == 'connectionReferenceLogicalName' and v == 'cwdd_claudeintakedraftconnection' else rebind(v, k)) for k, v in value.items()}
        if isinstance(value, list):
            return [rebind(v, key) for v in value]
        return value.replace(OSS_API, api) if isinstance(value, str) else value
    new_flow = json.loads(new[draft_member_name(site)].decode('utf-8'))
    assert new_flow == rebind(old_flow), 'the idea-draft flow changed beyond its connector binding'
    assert new_flow['properties']['definition']['triggers']['manual']['inputs']['triggerAuthenticationType'] == 'Tenant'
    solution = ET.fromstring(new['solution.xml']).find('SolutionManifest')
    assert solution.findtext('UniqueName') == 'AICoEPilotClaudeIdeaDraft' and solution.findtext('Version') == '1.0.0.0'
    assert [(r.get('type'), r.get('id')) for r in solution.find('RootComponents')] == [('29', '{%s}' % draft_id(site))]
    root = ET.fromstring(new['customizations.xml'])
    assert root.find('Connectors') is None
    workflow = root.find('Workflows/Workflow')
    assert workflow.get('WorkflowId') == '{%s}' % draft_id(site) and workflow.get('Name') == DRAFT_FLOW_NAME
    assert (workflow.findtext('StateCode'), workflow.findtext('StatusCode')) == ('0', '1')
    assert workflow.findtext('JsonFileName') == '/' + draft_member_name(site)
    reference = root.find('connectionreferences/connectionreference')
    assert reference.get('connectionreferencelogicalname') == DRAFT_REFERENCE
    assert reference.findtext('connectorid') == '/providers/Microsoft.PowerApps/apis/' + api
    assert reference.findtext('customconnectorid/connectorid') == CUSTOM_CONNECTOR_ID
    for name, data in new.items():
        text = data.decode('utf-8', 'replace')
        assert (api == OSS_API or OSS_API not in text) and 'osscontact' not in text.lower() and 'sk-ant-' not in text, name


def _load(name, path):
    """Import a module from a file under its own name (the packager's checks.py would clash with others)."""
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def case_packager():
    if str(CASE_SOURCE) not in sys.path:
        sys.path.insert(0, str(CASE_SOURCE))
    import package as pkg
    return pkg


def build_case_analysis(site, users, api, folder, fixture=False, reference_connector=None):
    """Build 04 with the archived packager. An import build runs its 18 checks against reference_connector (01).

    A reference (fixture) build allows placeholder values, is labelled NOT FOR IMPORT by the packager and has
    no check run: the packager's checks require deliverable values. Returns (zip path, unittest result or None).
    """
    pkg = case_packager()
    for key, value in CASE_NAMES.items():
        setattr(pkg, key, value)
    pkg.VERSION = CASE_VERSION
    pkg.flow.SEND_API_VERSION = False  # connector 1.0.0.3 sends the header
    pkg.ZIP_NAME = pkg.SOLUTION_NAME + '_' + pkg.VERSION.replace('.', '_') + '.zip'
    folder = Path(folder)
    out = folder / pkg.ZIP_NAME
    pkg.build(site, users, api, out, fixture=fixture)
    if fixture:
        for name, value in pkg.reference_documents().items():
            (folder / name).write_bytes(pkg.json_bytes(value))
        return out, None
    checks = _load('case_analysis_checks', CASE_SOURCE / 'checks.py')
    checks.SITE_URL, checks.ALLOWED_USER, checks.API_NAME, checks.ZIP = site, users, api, out
    checks.REFERENCE_CONNECTOR_ZIP = Path(reference_connector) if reference_connector else folder.parent / CONNECTOR_ZIP_NAME
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(checks.CaseAnalysisChecks)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return out, result
