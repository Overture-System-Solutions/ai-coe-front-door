"""Native OFF Marketing orchestration. Generator is local; deployed actions are WDL only."""
from __future__ import annotations
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
DONOR_SHA256 = 'e4a1bd55c5402dee025170551113010ae481580dd9372036b047bd9ba9e9df92'
assert hashlib.sha256((ROOT / 'generator/wdl.py').read_bytes()).hexdigest() == DONOR_SHA256
_spec = importlib.util.spec_from_file_location('marketing_pinned_wdl', ROOT / 'generator/wdl.py')
assert _spec is not None and _spec.loader is not None
_wdl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_wdl)
Flow, recurrence, q = _wdl.Flow, _wdl.recurrence, _wdl.q

HELPER_API = 'UNBOUND_MARKETING_INTEGRITY'
HELPER_LOGICAL = HELPER_REF = 'aicoe_marketingintegrity'
SP_REF = 'aicoe_marketing_sharepoint'
FLOW_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'aicoe/marketing/1.0.0.0/command'))
HELPER_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'aicoe/marketing/1.0.0.0/integrity'))
CONFIG = json.loads((ROOT.parent / 'power-automate/marketing-runtime/config.example.json').read_text())
CONFIG.update(controllerQualified=False, securityQualified=False)
SECURE = {'secureData': {'properties': ['inputs', 'outputs']}}


def secure(action):
    action['runtimeConfiguration'] = {**action.get('runtimeConfiguration', {}), **copy.deepcopy(SECURE)}
    return action


class MarketingFlow(Flow):
    def __init__(self):
        super().__init__('AI CoE Marketing 01 Command',
                         'OFF unbound review candidate; sole serialized Marketing writer; no sends.',
                         recurrence('Minute', 5), literal={'site': "@outputs('Cfg')?['siteUrl']"})
        self.guid = FLOW_ID

    def definition(self):
        definition = super().definition()
        props = definition['properties']
        props['state'] = 'Stopped'
        props['connectionReferences']['shared_sharepointonline']['connection']['connectionReferenceLogicalName'] = SP_REF
        props['connectionReferences']['marketing_integrity'] = {
            'runtimeSource': 'embedded',
            'connection': {'connectionReferenceLogicalName': HELPER_REF},
            'api': {'name': HELPER_API, 'logicalName': HELPER_LOGICAL}}
        props['connectionReferences']['marketing_claude'] = {
            'runtimeSource': 'embedded',
            'connection': {'connectionReferenceLogicalName': 'aicoe_marketingclaude'},
            'api': {'name': 'shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6', 'logicalName': 'cwdd_ossclaudeintakedraft'}}
        return definition


def add(f, block, last, name, action):
    return f.add(name, secure(action), into=block, last=last)


def assert_action(expression, code):
    return Flow.compose(f"@if({expression}, true, int('{code}'))")


def command_flow():
    f = MarketingFlow()
    f.add('Cfg', secure(f.compose(copy.deepcopy(CONFIG))))
    f.add('Configuration_Qualified', secure(assert_action(
        "and(equals(outputs('Cfg')?['enabled'], true), equals(outputs('Cfg')?['controllerQualified'], true), equals(outputs('Cfg')?['securityQualified'], true))",
        'MARKETING_UNQUALIFIED')))
    from marketing_actions import http, canonical, collect, base, SELECT_ROW
    from marketing_pipeline import process
    for name, typ, value in [('Rows', 'array', []), ('Next', 'string', ''), ('SeenPages', 'array', []),
                             ('Records', 'array', []), ('Sources', 'array', []), ('Row', 'object', {}),
                             ('ProviderResponse', 'object', {})]:
        f.add('Init_' + name, secure(f.init_var(name, typ, value)))
    f.add('Connection_Writer', http(f, 'GET', '_api/web/currentuser?$select=Id'))
    f.add('Verified_Writer_Connection', secure(assert_action(
        "equals(body('Connection_Writer')?['Id'], outputs('Cfg')?['writerPrincipalId'])", 'MARKETING_WRITER_CONNECTION_MISMATCH')))
    canonical(f, None, None, 'Queue_Canonical')
    f.add('Completed_Native_Commands', secure(f.filter("@variables('Records')", "@and(startsWith(item()?['RecordKey'], 'native-plan:'), equals(json(item()?['RecordJson'])?['status'], 'completed'))")))
    f.add('Completed_Request_Keys', secure(f.select("@body('Completed_Native_Commands')", "@replace(item()?['RecordKey'], 'native-plan:', '')")))
    collect(f, None, None, 'Queue', '@concat(' + base('request') + ', ' + q(SELECT_ROW + '&$top=5000&$orderby=Id') + ')')
    f.add('Pending_Requests', secure(f.filter("@variables('Rows')", "@not(contains(body('Completed_Request_Keys'), item()?['Title']))")))
    f.add('For_each_command', secure(f.foreach("@take(body('Pending_Requests'), 20)", process(f))))
    f.add('Run_Content_Free_Status', secure(f.compose({'status': 'queue_pass_finished', 'send': 'disabled'})))
    f.add('Failure_Content_Free', secure(f.compose({'status': 'HELD', 'code': 'MARKETING_NATIVE_INTERRUPTED', 'automaticRetry': False})), run_after={'For_each_command': ['Failed', 'TimedOut']})
    return f
