"""Execute generated flow 00 against a fresh local REST/connector fixture."""
import copy, json
import pytest
import flows, model
from provisioning_harness import FreshSite
from wdl_harness import Engine


def run(site):
    engine=Engine(flows.flow_00(),site,None)
    engine.run()
    return engine


def test_fresh_provisioning_and_repeat_preserve_operator_state():
    site=FreshSite();run(site)
    assert site.existing==set(model.LISTS)
    for key,(_,_,_,columns) in model.LISTS.items():
        assert site.fields[key]=={'Title':'Text',**{n:t for n,t,_ in columns}}
    for key in model.LISTS:
        rows=[r for r in site.tables['Definitions'] if r['Title']=='ListId_'+key]
        assert len(rows)==1 and json.loads(rows[0]['Value'])==site.ids[key]
    slot=site.tables['Journal'][0]
    assert slot['Title']=='CORE_WRITER' and slot['State']=='IDLE'
    slot.update(State='ACTIVE',ActiveIntent='do-not-reset',ClaimToken='existing-run')
    config=next(r for r in site.tables['Definitions'] if r['Title']=='TenantLabel')
    config['Value']='"operator-value"'
    before=copy.deepcopy(site.tables);effects=site.effects.count('create-list:Definitions')
    run(site)
    assert site.tables['Journal']==before['Journal']
    assert site.tables['Definitions']==before['Definitions']
    assert site.effects.count('create-list:Definitions')==effects


def test_denied_discovery_never_creates_a_list():
    site=FreshSite();site.denied=True
    with pytest.raises(RuntimeError,match='403 simulated denied discovery'):run(site)
    assert not site.existing and not site.effects


def test_existing_field_type_drift_is_logged_not_silently_converted():
    site=FreshSite();run(site)
    site.fields['Cases']['WorkTitle']='Number'
    engine=run(site)
    assert site.fields['Cases']['WorkTitle']=='Number'
    assert engine.variables['Warnings']==1
    assert any('Field type drift:' in r['Message'] for r in site.tables['Log'])
