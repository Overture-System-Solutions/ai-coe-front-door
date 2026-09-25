#!/usr/bin/env python3
"""Offline verification of current source, rebuilt ZIPs and local PAC output.
Never imports to a tenant; SharePoint/runtime smoke uses explicitly local fixtures.
Run after compiling, pytest, build.py and the local PAC roundtrip.
"""
from pathlib import Path
import datetime as dt
import hashlib, json, sys, zipfile
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'generator'),str(ROOT/'tests')]
import flows, model, validate, package
from wdl_harness import Engine, Helper, SharePointFixture
from provisioning_harness import FreshSite


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def xml_semantic(node):
    return (node.tag,tuple(sorted(node.attrib.items())),(node.text or '').strip(),tuple(xml_semantic(c) for c in node))


def package_data(path):
    with zipfile.ZipFile(path) as z:
        xml=ET.fromstring(z.read('customizations.xml'))
        manifest=ET.fromstring(z.read('solution.xml')).find('SolutionManifest')
        wfs=xml.findall('./Workflows/Workflow')
        assert len(wfs)==6
        definitions={w.attrib['Name']:json.loads(z.read(w.findtext('JsonFileName').lstrip('/'))) for w in wfs}
        identities={w.attrib['Name']:w.attrib['WorkflowId'].strip('{}').lower() for w in wfs}
        roots={r.attrib['id'].strip('{}').lower() for r in manifest.findall('./RootComponents/RootComponent') if r.attrib['type']=='29'}
        assert roots==set(identities.values())
        envs={n:xml_semantic(ET.fromstring(z.read(n))) for n in z.namelist() if n.startswith('environmentvariabledefinitions/') and n.endswith('.xml')}
        connections={c.attrib['connectionreferencelogicalname']:c.findtext('connectorid') for c in xml.findall('./connectionreferences/connectionreference')}
        states={w.attrib['Name']:[w.findtext('StateCode'),w.findtext('StatusCode')] for w in wfs}
        return {'definitions':definitions,'identities':identities,'roots':sorted(roots),'envs':envs,'connections':connections,'states':states,'solution':manifest.findtext('UniqueName'),'version':manifest.findtext('Version')}


def main():
    build=json.loads((ROOT/'out/build-evidence.json').read_text())
    pins=json.loads((ROOT/'evidence/source-pins.json').read_text())
    source=Path(pins['source'])
    pin_results=[]
    for pin in pins['files']:
        copied=ROOT/'upstream'/pin['path'];original=source/pin['path']
        assert copied.stat().st_size==original.stat().st_size==pin['bytes']
        assert digest(copied)==digest(original)==pin['sha256']
        pin_results.append({**pin,'copyMatches':True,'originalMatches':True})
    assert len(pin_results)==7
    original_zip=source.parent/'AICoECoreAutomation_3_0_0_0.zip'
    original=package_data(original_zip)
    for path,sha in build['sourceHashes'].items():assert digest(ROOT/path)==sha,path
    packages={}
    for filename,meta in build['packages'].items():
        p=ROOT/'out'/filename
        assert digest(p)==meta['sha256'] and p.stat().st_size==meta['bytes']
        with zipfile.ZipFile(p) as z:
            assert set(z.namelist())==set(meta['members'])
            for name,m in meta['members'].items():assert hashlib.sha256(z.read(name)).hexdigest()==m['sha256']
            if filename.startswith('AICoECoreIntegrity_'):
                assert z.read('Script.cs')==z.read('Script.csx')==(ROOT/'connector/Script.cs').read_bytes()
        packages[str(p.relative_to(ROOT))]={'sha256':digest(p),'bytes':p.stat().st_size}
    assert len(packages)==3
    pac_results={}
    for flavor,literal in [('primary',False),('literal',True)]:
        suffix='_literal-fallback' if literal else ''
        candidate=ROOT/'out'/('AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY'+suffix+'.zip')
        roundtrip=ROOT/'out/pac-roundtrip'/f'{flavor}.zip'
        before=package_data(candidate);after=package_data(roundtrip)
        assert before==after,'PAC semantic change: '+flavor
        assert before['identities']==original['identities']
        assert before['solution']==original['solution']=='AICoECoreAutomation'
        assert before['version']=='3.0.0.1'
        assert all(v==['0','1'] for v in before['states'].values())
        assert len(before['envs'])==(0 if literal else 3)
        assert before['connections']=={'aicoe_coreintegrity':'/providers/Microsoft.PowerApps/apis/UNBOUND_CORE_INTEGRITY','aicoe_sharepointonline':'/providers/Microsoft.PowerApps/apis/shared_sharepointonline'}
        args={'site':model.DEFAULT_SITE,'mail':'REPLACE-BEFORE-ENABLING.invalid','label':'Pilot'} if literal else None
        for factory in flows.ALL_FLOWS:
            f=factory(literal=args);definition=before['definitions'][f.name]
            assert definition==f.definition(),f.name+' stale packaged definition'
            assert not validate.validate(definition,f.name,literal)
            assert 'SendEmail' not in json.dumps(definition)
            assert 'shared_office365' not in json.dumps(definition)
        settings=json.loads((ROOT/f'evidence/pac-final/{flavor}-settings.json').read_text())
        assert {c['LogicalName']:c['ConnectorId'] for c in settings['ConnectionReferences']}==before['connections']
        assert all(c['ConnectionId']=='' for c in settings['ConnectionReferences'])
        assert len(settings['EnvironmentVariables'])==(0 if literal else 3)
        for dirname in (flavor+'-unpacked',flavor+'-roundtrip'):
            files=list((ROOT/'evidence/pac-final'/dirname/'Workflows').glob('*.json'))
            assert len(files)==6
            assert sorted(json.dumps(json.loads(p.read_text()),sort_keys=True) for p in files)==sorted(json.dumps(d,sort_keys=True) for d in before['definitions'].values())
        packlog=(ROOT/f'evidence/pac-final/{flavor}-pack.log').read_text()
        warnings=[line.strip() for line in packlog.splitlines() if 'EnvironmentVariableDefinition-' in line]
        if not literal:
            control=(ROOT/'evidence/pac-final/control-pack.log').read_text()
            assert len(warnings)==3 and all(w in control for w in warnings)
        else:assert not warnings
        packages[str(roundtrip.relative_to(ROOT))]={'sha256':digest(roundtrip),'bytes':roundtrip.stat().st_size}
        pac_results[flavor]={'workflowCount':6,'jsonAndXmlSemanticsPreserved':True,'allFlowStatesOff':True,'connectionSettingsMatch':True,'environmentDefinitionsPreserved':len(before['envs']),'warnings':warnings}
    assert (ROOT/'evidence/pac-final/control-original-before.sha256').read_bytes()==(ROOT/'evidence/pac-final/control-original-after.sha256').read_bytes()
    seed={k:json.loads(v) for k,v,*_ in model.seed_config()}
    assert seed['SendEnabled'] is False and seed['NativeQualified'] is False and seed['SecurityQualified'] is False
    suites=ET.parse(ROOT/'evidence/final-tests.xml').getroot().findall('testsuite')
    tests={k:sum(int(s.attrib[k]) for s in suites) for k in ['tests','failures','errors','skipped']}
    assert tests['tests']>0 and tests['failures']==tests['errors']==tests['skipped']==0
    cases=[c for s in suites for c in s.findall('testcase')]
    assert len(cases)==tests['tests']
    helper=Helper()
    try:
        smoke=SharePointFixture(page_size=7)
        primary=package_data(ROOT/'out/AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip')
        def execute(name,site):
            class PackagedFlow:
                def definition(self):return primary['definitions'][name]
            flow=PackagedFlow();flow.actions=flow.definition()['properties']['definition']['actions']
            engine=Engine(flow,site,helper);engine.run();return engine
        names=[factory().name for factory in flows.ALL_FLOWS]
        fresh=FreshSite();execute(names[0],fresh);assert fresh.existing==set(model.LISTS)
        execute(names[1],smoke);create_boundaries=len(smoke.effects)
        assert smoke.tables['Results'][0]['Published'] is True
        for name in names[2:]:execute(name,smoke)
        smoke_result={'kind':'SIMULATED_EXTERNAL_SHAREPOINT_AND_LOCAL_WDL_ENGINE','packagedFlowCountExecuted':len(names),'names':names,'createDurableBoundariesCoveredByCrashRegression':create_boundaries,'publishedResult':True,'freshProvisionedListCount':len(fresh.existing)}
    finally:helper.p.terminate();helper.p.wait(timeout=10)
    sources={}
    for folder in ['generator','connector','tests','provisioning','contract']:
        for p in sorted((ROOT/folder).rglob('*')):
            if p.is_file() and not any(x in {'out','bin','obj','__pycache__','.pytest_cache'} for x in p.relative_to(ROOT/folder).parts):sources[str(p.relative_to(ROOT))]=digest(p)
    receipt={'verifiedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'OFFLINE_CANDIDATE_ONLY','solution':'AICoECoreAutomation','version':'3.0.0.1','transport':'v0.2.0','tests':tests,'testCases':[c.attrib['classname']+'.'+c.attrib['name'] for c in cases],'structuralDefinitionsPassed':12,'originalSourcePins':pin_results,'originalPackageSha256':digest(original_zip),'preservedWorkflowIdentities':original['identities'],'packages':packages,'pac':pac_results,'packagedSmoke':smoke_result,'compiledHelper':{'scriptSha256':digest(ROOT/'connector/Script.cs'),'dllSha256':digest(ROOT/'connector/local/bin/Release/net10.0/CoreHarness.dll'),'compiler':'dotnet 10.0.401; C# 7.3; local ScriptBase shim','compileLog':'evidence/final-compile.log'},'binding':build['binding'],'sourceSnapshot':sources,'notClaimed':build['not_claimed']}
    (ROOT/'evidence/final-verification.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'tests':tests,'pins':len(pin_results),'preservedIdentities':len(original['identities']),'pac':pac_results,'packagedSmoke':smoke_result,'packages':packages},indent=2))


if __name__=='__main__':main()
