import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'generator'))
import flows


def walk(actions):
    for name, action in actions.items():
        yield name, action
        yield from walk(action.get('actions', {}))
        yield from walk(action.get('else', {}).get('actions', {}))
        for case in action.get('cases', {}).values():
            yield from walk(case.get('actions', {}))
        yield from walk(action.get('default', {}).get('actions', {}))


def test_bootstrap_never_consults_definitions_before_all_lists_exist():
    f = flows.flow_00().definition()['properties']['definition']
    a = dict(walk(f['actions']))
    assert 'Bootstrap_Lists' in a, 'F01: bootstrap phase missing; first Log iteration reads absent Definitions'
    assert not any('Definitions' in str(x.get('inputs', {})) and x.get('inputs', {}).get('host', {}).get('operationId') == 'GetItems' for _, x in walk(a['Bootstrap_Lists']['actions']))
    assert a['Create_List']['runAfter'] == {}, 'creation belongs to successful absence branch, never failed GET'
    assert a['Get_List']['inputs']['parameters']['parameters/uri'].startswith('@concat(\'_api/web/lists?$filter=Title eq ')
    assert 'Find_ListId_Row' not in dict(walk(a['Scope_Lists']['actions']))


def test_ingress_has_no_result_columns_and_private_acl_apply_exists():
    import model
    assert 'Requests' in model.LISTS, 'F02: immutable ingress/result separation missing'
    cols = {x[0] for x in model.LISTS['Requests'][3]}
    assert cols == {'ContractVersion','Operation','WorkID','RequestJson','TestRecord'}
    assert 'Results' in model.LISTS and 'Journal' in model.LISTS
    text = str(flows.flow_00().definition())
    assert 'ReadSecurity\\\":2' not in text and 'WriteSecurity\\\":2' not in text
    acl = (ROOT/'provisioning/Set-CoreIsolation.ps1').read_text()
    assert 'AddListItems' in acl and 'BreakRoleInheritance' in acl
    assert 'RequestAuthorID' in (ROOT/'README.md').read_text()


def test_validation_runs_before_business_write_in_native_flow():
    actions=dict(walk(flows.flow_01().actions))
    assert 'Validate_Ingress' in actions, 'F03: native request is only parsed with LOOSE schema'
    assert actions['Validate_Ingress']['inputs']['parameters']['body/Mode']=='Validate'
    assert 'If_Valid_Ingress' in actions


def test_native_writer_persists_plan_then_cas_compares_before_result_grant():
    a=dict(walk(flows.flow_01().actions))
    for name in ['Claim_Writer_CAS','Persist_Plan','Load_Persisted_Plan','Inspect_Write','CAS_Record','Verify_Readback','Create_Receipt','Verify_Receipt','Create_Event','Verify_Event','Create_Result','Grant_Result_Read','Publish_Result','Release_Writer_CAS']:
        assert name in a, 'F07/F08/F09/F11 native durable boundary missing: '+name
    assert a['CAS_Record']['inputs']['parameters']['parameters/headers']['IF-MATCH']!="*"
    assert a['Grant_Result_Read']['inputs']['parameters']['parameters/uri'].find("AuthorID")>=0
    assert not any(x['inputs'].get('host',{}).get('operationId')=='PatchItem' for x in a.values() if isinstance(x.get('inputs'),dict))
    assert 'Until' in [x['type'] for x in a.values()]
    for fn in [flows.flow_02,flows.flow_03,flows.flow_04,flows.flow_05]:
        text=str(fn().definition())
        assert 'PatchItem' not in text, 'Background flow must not blindly mutate canonical cases'
        assert 'SendEmailV2' not in text

