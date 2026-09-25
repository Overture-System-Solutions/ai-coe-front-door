#!/usr/bin/env python3
"""Verify exact OFF package bytes with real compiled code and explicit fake I/O only.
No authentication, tenant calls, Power Apps Checker uploads or model requests.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT.parents[1]
sys.path.insert(0,str(ROOT/'generator'))
from build import NAME,HELPER_NAME
from marketing_flow import command_flow
from marketing_package import semantics
from marketing_validate import validate,walk

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(command,log,env=None):
    result=subprocess.run(command,cwd=APP,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=300)
    log.write_text(result.stdout,encoding='utf-8')
    if result.returncode:raise RuntimeError('Verification failed: '+str(log))
    return result.stdout

def suite(folder,log,env=None):
    text=run([sys.executable,'-B','-m','unittest','discover','-s',str(folder),'-v'],log,env)
    count=re.search(r'^Ran (\d+) tests? in ',text,re.M)
    assert count and int(count[1])>0 and re.search(r'^OK\s*$',text,re.M),'Suite needs nonzero passing count without skips'
    return int(count[1])

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--phase',required=True)
    args=parser.parse_args();assert re.fullmatch(r'[a-zA-Z0-9_-]+',args.phase)
    evidence=ROOT/'evidence/integration'/args.phase;evidence.mkdir(parents=True,exist_ok=False)
    baseline=json.loads((ROOT/'evidence/baseline.json').read_text())['files']
    preserved={p:sha(APP/p)==h for p,h in baseline.items()}
    assert all(preserved.values()),'Protected baseline drift: '+str([p for p,v in preserved.items() if not v])
    flow=ROOT/'out'/NAME;helper=ROOT/'out'/HELPER_NAME;pac=ROOT/'out/pac-roundtrip/AICoEMarketingAutomation_1_0_0_0.zip'
    manifest=json.loads((ROOT/'out/build-manifest.json').read_text())
    for path in (flow,helper):assert path.is_file() and sha(path)==manifest['packages'][path.name]['sha256']
    assert not manifest['helperPackagingMissingFiles']
    graph=semantics(flow);assert graph==semantics(pac)
    expected=command_flow();definition=graph['workflows'][expected.guid]['definition'];assert definition==expected.definition()
    assert not validate(definition);assert graph['workflows'][expected.guid]['state']=='0'
    assert manifest['actionCount']==len(list(walk(expected.actions)))<=450
    assert manifest['boundary']['enabled'] is False and manifest['boundary']['registered'] is False
    for name,h in manifest['sourceHashes'].items():assert sha(ROOT/name)==h,'Source drift after package build: '+name
    pac_receipt=json.loads((ROOT/'evidence/flow/pac-verification.json').read_text())
    assert sha(pac)==pac_receipt['pacRoundtrip']['sha256'] and sha(flow)==pac_receipt['candidate']['sha256']
    assert all(c['exitCode']==0 for c in pac_receipt['commands'])
    extracted=evidence/'extracted-helper';extracted.mkdir()
    with zipfile.ZipFile(helper) as archive:
        assert all('/' not in n and '\\' not in n and n not in ('.','..') for n in archive.namelist())
        archive.extractall(extracted)
    script=extracted/'Script.cs';assert sha(script)==sha(ROOT/'connector/Script.cs')
    assert script.read_bytes()==(extracted/'Script.csx').read_bytes()
    local=extracted/'local';local.mkdir()
    for name in ['MarketingHarness.csproj','Harness.cs','ScriptDigest.g.cs']:
        shutil.copyfile(ROOT/'connector/local'/name,local/name)
    assert sha(script) in (local/'ScriptDigest.g.cs').read_text(),'Compiler digest must bind extracted script'
    # No package source/network dependency is required by this local shim.
    (extracted/'NuGet.Config').write_text('<configuration><packageSources><clear /></packageSources></configuration>\n')
    dotnet=Path('/home/far_cdx/.cache/oss-demo-dotnet/dotnet')
    env=dict(os.environ,DOTNET_ROOT=str(dotnet.parent),DOTNET_CLI_TELEMETRY_OPTOUT='1',PYTHONDONTWRITEBYTECODE='1')
    run([str(dotnet),'build',str(local/'MarketingHarness.csproj'),'-c','Release','--configfile',str(extracted/'NuGet.Config'),'-v','minimal'],evidence/'exact-script-build.log',env)
    dll=local/'bin/Release/net10.0/MarketingHarness.dll';assert dll.is_file()
    summary={}
    summary['flowTests']=suite(ROOT/'tests/flow',evidence/'flow.log',env)
    summary['helperTests']=suite(ROOT/'tests/helper',evidence/'helper.log',env)
    env.update(MARKETING_HELPER_DLL=str(dll),MARKETING_FLOW_ZIP=str(pac))
    summary['integrationTests']=suite(ROOT/'tests/integration',evidence/'integration.log',env)
    run([sys.executable,'-B',str(ROOT/'tests/integration/run_native.py'),'--dll',str(dll),'--flow-zip',str(pac),'--output',str(evidence/'all-operations.json')],evidence/'all-operations.log',env)
    vectors=json.loads((evidence/'all-operations.json').read_text());required=set(json.loads((ROOT/'evidence/baseline.json').read_text())['operations']['operations'])
    # Operation inventories may be strings or named descriptors; preserve the source values.
    actual={r['operation'] for r in vectors['results']}
    assert actual==required and vectors['count']==vectors['passed']==22
    crashes=json.loads((ROOT/'evidence/integration/crash-boundaries.json').read_text());assert crashes['count']>0 and all(c['pass'] for c in crashes['cases'])
    shutil.copyfile(ROOT/'evidence/integration/crash-boundaries.json',evidence/'crash-boundaries.json')
    provisioning=json.loads((APP/'evidence/provisioning/parent-verification/verification.json').read_text())
    pins=json.loads((APP/'evidence/provisioning/parent-verification/source-hashes.json').read_text())
    assert provisioning['allPassed'] and all(sha(APP/p)==h for p,h in pins.items())
    summary['provisioningGroupedChecks']=sum(r['summary']['checks'] for r in provisioning['results'] if r['name']!='surface')
    assert all(sha(APP/p)==h for p,h in baseline.items())
    assert sha(script)==sha(ROOT/'connector/Script.cs'),'Helper changed during final verification'
    receipt={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'LOCAL_STEPS_1_TO_4_ONLY','nativeAcceptance':False,'tenantActions':0,'liveModelCalls':0,'enabled':False,'registered':False,'bound':False,'counts':summary,'operationCount':len(actual),'referenceScenarios':vectors['count'],'crashBoundaries':crashes['count'],'protectedFiles':len(baseline),'preserved':True,'scriptSha256':sha(script),'exactPackageCompiledDllSha256':sha(dll),'flowActions':manifest['actionCount'],'packages':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in (flow,helper,pac)},'evidence':str(evidence.relative_to(APP)),'qualificationGates':'NATIVE_GATES.md','limits':['Exact production script compiled as C#7.3 using a local .NET10 ScriptBase shim, not the hosted compiler.','Actual packaged WDL executed by a bounded offline interpreter; external SharePoint and Claude are explicit fixtures.','Helper registration and metadata binding, native import/Save, permissions, provider and lifecycle acceptance remain unperformed.']}
    (evidence/'VERIFICATION.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))

if __name__=='__main__':main()
