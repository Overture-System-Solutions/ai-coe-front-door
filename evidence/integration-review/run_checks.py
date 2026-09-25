"""Preserve candidate bytes while re-executing offline checks.
All outputs go under evidence/integration-review; no build/PAC/live operation.
"""
from pathlib import Path
import ast
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CORE = ROOT / 'backend/core-native'
MARKETING = ROOT / 'backend/power-automate/marketing-runtime'
PY = '/home/far_cdx/.hermes/hermes-agent/venv/bin/python'
NODE = '/mnt/c/Program Files/nodejs/node.exe'
ENV = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTEST_DISABLE_PLUGIN_AUTOLOAD='1', DOTNET_ROOT='/home/far_cdx/.cache/oss-demo-dotnet', DOTNET_CLI_HOME=str(HERE/'dotnet-home'), NUGET_PACKAGES=str(HERE/'nuget-packages'), NUGET_HTTP_CACHE_PATH=str(HERE/'nuget-http-cache'), DOTNET_CLI_TELEMETRY_OPTOUT='1', DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true', TMPDIR=str(HERE/'tmp'))
for directory in ['dotnet-home','nuget-packages','nuget-http-cache','tmp']:
    (HERE/directory).mkdir(exist_ok=True)
os.environ.update(ENV)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stamp(path):
    return {'bytes':path.stat().st_size,'sha256':digest(path)}


def run(name, args, env=None):
    process = subprocess.run(args,cwd=ROOT,env=env or ENV,text=True,capture_output=True)
    (HERE/(name+'.log')).write_text(process.stdout+process.stderr)
    receipt = {'exitCode':process.returncode,'command':args,'log':name+'.log'}
    (HERE/(name+'-run.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt),flush=True)
    if process.returncode:
        print(process.stdout+process.stderr)
        raise RuntimeError(name+' failed')
    return process.stdout


def prepare():
    receipt = json.loads((CORE/'evidence/final-verification.json').read_text())
    protected = [CORE/'evidence/final-verification.json',CORE/'evidence/final-tests.xml',CORE/'out/build-evidence.json',MARKETING/'out/package-receipt.json',MARKETING/'out/candidate/manifest.json',MARKETING/'out/marketing-runtime-offline-0.1.0.zip',MARKETING/'out/zip-smoke.tap']
    packages = []
    for relative, expected in receipt['packages'].items():
        path = CORE/relative
        observed = stamp(path)
        assert observed == expected, str(path)
        with zipfile.ZipFile(path) as archive: assert archive.testzip() is None
        packages.append({'path':str(path.relative_to(ROOT)),**observed,'matchesFinalReceipt':True})
        protected.append(path)
    helper = CORE/'connector/local/bin/Release/net10.0/CoreHarness.dll'
    assert digest(helper) == receipt['compiledHelper']['dllSha256']
    protected.append(helper)
    archive = MARKETING/'out/marketing-runtime-offline-0.1.0.zip'
    marketing_receipt = json.loads((MARKETING/'out/package-receipt.json').read_text())
    assert digest(archive) == marketing_receipt['sha256']
    destination = HERE/'marketing-exact-zip'
    destination.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        manifest = json.loads(z.read('manifest.json'))
        assert set(z.namelist()) == {f['path'] for f in manifest['files']} | {'manifest.json'}
        for name in z.namelist():
            assert not Path(name).is_absolute() and '..' not in Path(name).parts and '\\' not in name
        for item in manifest['files']:
            assert hashlib.sha256(z.read(item['path'])).hexdigest() == item['sha256']
        for item in manifest['inputs']:
            assert digest(ROOT/item['path']) == item['sha256'], item['path']
        z.extractall(destination)
    result = {'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'nativePackages':packages,'marketing':{'path':str(archive.relative_to(ROOT)),**stamp(archive),'members':len(z.namelist()),'manifestFiles':len(manifest['files']),'sourceInputs':len(manifest['inputs']),'sourceInputsMatch':True},'compiledHelper':stamp(helper)}
    (HERE/'package-integrity.json').write_text(json.dumps(result,indent=2)+'\n')
    (HERE/'protected-before.json').write_text(json.dumps({str(p.relative_to(ROOT)):stamp(p) for p in protected},indent=2)+'\n')
    print(json.dumps(result,indent=2))


def native():
    args = [PY,'-B','-m','pytest',str(CORE/'tests'),str(HERE/'test_native_existing_packages.py'),'-q','--capture=sys','-p','no:cacheprovider','-k','not test_review_build_has_current_bytes_no_reference_model_claims','--junitxml='+str(HERE/'native-tests.xml'),'--basetemp='+str(HERE/'pytest-tmp')]
    run('native-tests',args)
    suites=ET.parse(HERE/'native-tests.xml').getroot().findall('testsuite')
    counts={key:sum(int(s.attrib[key]) for s in suites) for key in ['tests','failures','errors','skipped']}
    assert counts=={'tests':30,'failures':0,'errors':0,'skipped':0},counts
    counts.update(originalTestsExecuted=29,originalBuildTestDeselected=1,existingBytePackagingReplacement=1,noRebuild=True)
    (HERE/'native-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
    print(json.dumps(counts))


def delivery():
    # Execute the inspected verifier without its release-receipt overwrite.
    # Only its output expression is redirected to this evidence directory.
    source = CORE/'evidence/verify_delivery.py'
    tree = ast.parse(source.read_text(),filename=str(source))
    changed = 0
    for node in ast.walk(tree):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr=='write_text':
            assert node.lineno==132, 'Verifier changed; inspect before adapting'
            node.func.value=ast.Call(func=ast.Name(id='Path',ctx=ast.Load()),args=[ast.Constant(str(HERE/'native-delivery-receipt.json'))],keywords=[])
            changed+=1
    assert changed==1
    # Use this run's fresh test receipt, never present inherited test totals as fresh.
    for node in ast.walk(tree):
        if isinstance(node,ast.Constant) and node.value=='evidence/final-tests.xml':
            node.value=str(HERE/'native-tests.xml')
    ast.fix_missing_locations(tree)
    (HERE/'verifier-adaptation.json').write_text(json.dumps({'original':str(source.relative_to(ROOT)),'sha256':digest(source),'changes':['redirect sole write_text at line 132 to evidence/integration-review/native-delivery-receipt.json','read fresh evidence/integration-review/native-tests.xml instead of historical final-tests.xml'],'allVerificationLogicPreserved':True},indent=2)+'\n')
    import contextlib
    with (HERE/'native-delivery.log').open('w') as output,contextlib.redirect_stdout(output):
        exec(compile(tree,str(source),'exec'),{'__name__':'__main__','__file__':str(source)})
    print('Native existing-byte verifier and six packaged fixture flows passed')


def marketing():
    path = subprocess.check_output(['wslpath','-w',str(HERE/'marketing-exact-zip')],text=True).strip()
    env = dict(ENV,MARKETING_PACKAGE_ROOT=path)
    tests=sorted(str(p.relative_to(ROOT)) for p in (MARKETING/'tests').glob('*.test.cjs'))
    run('marketing-source',[NODE,'--test',*tests],env)
    run('marketing-zip-smoke',[NODE,'--test','backend/power-automate/marketing-runtime/tests/package.test.cjs'],env)


def client():
    run('client-drafts',[NODE,'--test','tests/audit-native-client.test.cjs','tests/audit-server-drafts.test.cjs'])


def preservation():
    before=json.loads((HERE/'protected-before.json').read_text())
    after={name:stamp(ROOT/name) for name in before}
    result={'files':len(before),'allUnchanged':before==after,'changed':[name for name in before if before[name]!=after[name]]}
    (HERE/'preservation.json').write_text(json.dumps(result,indent=2)+'\n')
    assert result['allUnchanged'],result
    print(json.dumps(result))


if __name__=='__main__':
    {'prepare':prepare,'native':native,'delivery':delivery,'marketing':marketing,'client':client,'preservation':preservation}[sys.argv[1]]()
