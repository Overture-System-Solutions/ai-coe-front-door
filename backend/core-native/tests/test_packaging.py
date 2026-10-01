import json, re, zipfile, subprocess, sys, hashlib
from pathlib import Path
import pytest
import flows, package
ROOT=Path(__file__).resolve().parents[1]


def test_native_provisioning_seeds_writer_slot():
    from test_flows import walk
    actions=dict(walk(flows.flow_00().actions))
    assert any(a.get('inputs',{}).get('parameters',{}).get('item',{}).get('Title')=='CORE_WRITER' for a in actions.values() if a['type']=='OpenApiConnection'), 'Fresh provisioning has no durable writer slot'


def test_flow_helper_binding_must_be_explicit_and_separately_qualified(tmp_path):
    import binding
    with pytest.raises(ValueError):binding.load(None,review=False)
    with pytest.raises(ValueError):binding.validate({'runtimeApiName':'UNBOUND_CORE_INTEGRITY'})
    with pytest.raises(ValueError):binding.validate({'runtimeApiName':'shared_abc/../bad'})
    assert binding.load(None,review=True)['deployable'] is False


def test_helper_descriptor_projects_exact_wdl_arguments_and_code():
    spec=json.loads((ROOT/'connector/apiDefinition.swagger.json').read_text())
    props=json.loads((ROOT/'connector/apiProperties.json').read_text())
    operation=spec['paths']['/evaluate']['post']
    assert operation['operationId']=='Evaluate'
    assert set(operation['parameters'][0]['schema']['required'])=={'Mode','Payload'}
    assert props['properties']['scriptOperations']==['Evaluate']
    assert 'Context.SendAsync(' not in (ROOT/'connector/Script.cs').read_text()
    assert 'read-own/edit-own' not in flows.flow_00().description


def test_review_build_has_current_bytes_no_reference_model_claims(tmp_path):
    p=subprocess.run([sys.executable,str(ROOT/'generator/build.py'),'--review-unbound','--out',str(tmp_path)],text=True,capture_output=True)
    assert p.returncode==0,p.stdout+p.stderr
    evidence=json.loads((tmp_path/'build-evidence.json').read_text())
    assert evidence['binding']['deployable'] is False
    assert 'golden' not in evidence
    assert len(evidence['packages'])==3
    for filename,meta in evidence['packages'].items():
        payload=(tmp_path/filename).read_bytes();assert hashlib.sha256(payload).hexdigest()==meta['sha256']
        with zipfile.ZipFile(tmp_path/filename) as z:
            if filename.startswith('AICoECoreAutomation_'):
                xml=z.read('customizations.xml').decode()
                assert 'aicoe_coreintegrity' in xml
                assert 'shared_office365' not in xml
                assert xml.count('<StateCode>0</StateCode>')==6
            else:
                assert z.read('Script.cs')==(ROOT/'connector/Script.cs').read_bytes()
