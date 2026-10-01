"""Verify the final local candidate, protected originals and exact package bytes.
This script reads tenant-free artifacts only. It does not rebuild or deploy anything.
"""
from pathlib import Path
import datetime, hashlib, json, re, subprocess, zipfile
from xml.etree import ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
PROJECT=ROOT.parents[1]
OUT=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
base=json.loads((PROJECT/'evidence/implementation-2026-09-23/baseline.json').read_text())
source=Path(base['source']); changed=[]
for item in base['files']:
    p=source/item['path']
    if not p.is_file() or sha(p)!=item['sha256']:changed.append(item['path'])
assert not changed,changed
win=subprocess.check_output(['wslpath','-w',str(source)],text=True).strip()
status=subprocess.check_output(['git.exe','-C',win,'status','--short','--branch'],text=True).strip()
assert status==base['original_status'],'Original worktree status changed; do not restore automatically.'
log=(OUT/'final-production.log').read_text(errors='replace')
rows=re.findall(r'\[test:jest\] (PASS|FAIL) (.+?) \(duration: [^,]+, (\d+) passed, (\d+) failed\)',log)
assert rows and all(x[0]=='PASS' and int(x[3])==0 for x in rows)
assert 'Error:' not in log
suite={'suites':len(rows),'passed':sum(int(x[2]) for x in rows),'failed':sum(int(x[3]) for x in rows),'source':'final-production.log'}
def tap(p):
    t=p.read_text();v={k:int(re.findall(r'^# '+k+r' (\d+)\s*$',t,re.M)[-1]) for k in ['tests','pass','fail','cancelled','skipped']}
    assert v['tests']>0 and v['tests']==v['pass'] and not any(v[k] for k in ['fail','cancelled','skipped'])
    return v
nodes=tap(OUT/'final-node.tap');zip_tests=tap(ROOT/'evidence/parent-marketing-exact-zip.tap')
suites=ET.parse(ROOT/'evidence/parent-native-complete.xml').getroot().findall('testsuite')
native={k:sum(int(s.attrib.get(k,0)) for s in suites) for k in ['tests','failures','errors','skipped']}
assert native['tests']>0 and not any(native[k] for k in ['failures','errors','skipped'])
browser=json.loads((OUT/'browser-results.json').read_text())
assert browser['pass'] and not browser['externalRequests'] and not browser['pageErrors']
for p,h in browser['bundleCandidates'].items():assert sha(ROOT/p)==h
assert len(browser['roles'])==7 and all(x['mobileNoAppOverflow'] for x in browser['roles'])
package=json.loads((ROOT/'evidence/port-verification.json').read_text())
assert not package['failures'] and package['package']['version']=='1.0.0.17'
assert sha(ROOT/package['package']['path'])==package['package']['sha256']
with zipfile.ZipFile(ROOT/package['package']['path']) as z:
    for b in package['bundle']['files']:
        assert hashlib.sha256(z.read(b['name'])).hexdigest()==b['sha256']
        if 'ai-coe-front-door-web-part_' in b['name']:
            assert b['sha256'] in browser['bundleCandidates'].values()
core=json.loads((ROOT/'backend/core-native/evidence/final-verification.json').read_text())
for rel,item in core['packages'].items():assert sha(ROOT/'backend/core-native'/rel)==item['sha256'],rel
for rel,h in core['sourceSnapshot'].items():assert sha(ROOT/'backend/core-native'/rel)==h,rel
marketing=ROOT/'backend/power-automate/marketing-runtime'
receipt=json.loads((marketing/'out/package-receipt.json').read_text())
zip_path=marketing/'out/marketing-runtime-offline-0.1.1.zip'
final=json.loads((ROOT/'evidence/marketing-final-extension/FINAL-RECEIPT.json').read_text())
assert sha(zip_path)==final['package']['sha256']
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    manifest=json.loads(z.read('manifest.json'))
    for item in manifest['files']:
        assert hashlib.sha256(z.read(item['path'])).hexdigest()==item['sha256']
        assert sha(marketing/'out/verified-zip'/item['path'])==item['sha256']
    assert len(z.namelist())==final['package']['zipMembers']
for row in final['currentSources']:
    assert sha(ROOT/row['path'])==row['sha256'],row['path']
script_checks={}
for filename in ['parent-provisioning-final-pwsh7.log','parent-draft-provisioning-final-pwsh7.log']:
    r=json.loads((ROOT/'evidence'/filename).read_text().strip());assert r['status']=='PASS'
    script_checks[filename]={'checks':r['checks'],'scope':r['scope']}
# Bind this receipt to authored runtime/test inputs, not generated outputs or historical copies.
inputs={}
for folder in ['src','config','sharepoint/pages/one-page','tests','scripts','preview']:
    for p in sorted((ROOT/folder).rglob('*')):
        if p.is_file() and not any(n in {'__pycache__','node_modules'} for n in p.parts):inputs[str(p.relative_to(ROOT))]=sha(p)
report={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'LOCAL_CORRECTION_CANDIDATE_VERIFIED','version':'1.0.0.17','branch':'fix/coe-audit-server-drafts','production':suite,'nodeChecks':nodes,'nativeCore':native,'marketingExactZip':zip_tests,'installerChecks':script_checks,'browser':{'roles':len(browser['roles']),'journeys':browser['journeys'],'externalRequests':0,'pageErrors':0,'mobileWidth':390,'webLocksAvailable':browser['webLocksAvailable']},'package':package['package'],'marketingPackage':final['package'],'corePackages':core['packages'],'originalPreservation':{'files':len(base['files']),'changed':changed,'gitStatusUnchanged':True},'lintWarningLines':len(re.findall(r'^.*\[build:lint\].* - \(',log,re.M)),'runtimeTestInputs':inputs,'remaining':['Approved-Microsoft Marketing execution/trigger/connector integration remains implementation work; Node package is not a native Power Automate import.','End-to-end association of preserved legacy intake IDs with CORE work and native business permissions/retention/provider/reviewer commissioning remain unaccepted.','Monday.com setup/integration is not implemented.','No tenant actions, model calls, external sends, commits or pushes occurred.']}
(OUT/'VERIFICATION.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['runtimeTestInputs','package','corePackages','marketingPackage']},indent=2))
