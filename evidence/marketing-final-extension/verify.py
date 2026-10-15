"""Offline verification; Windows Node; no native tenant/model/build calls."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUNTIME = ROOT / 'backend/power-automate/marketing-runtime'
NODE = shutil.which('node.exe')
assert NODE, 'Windows Node is required.'
def run(name, args):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
    (HERE / name).write_text(result.stdout + result.stderr, encoding='utf8')
    if result.returncode:
        print(result.stdout, result.stderr)
        raise SystemExit(result.returncode)
    return result.stdout

def counts(text):
    out = {name: int(re.search(r'^# '+name+r' (\d+)$', text, re.M).group(1)) for name in ['tests','pass','fail','skipped','cancelled']}
    assert out['tests'] == out['pass'] and out['tests'] > 0 and not any(out[k] for k in ['fail','skipped','cancelled'])
    return out

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
# Earlier archives 0.1.0 and 0.1.1 left the tip with the tenant-neutral repository (2026-10-15): their compiled code
# carried the former client-specific Work ID format. Git history keeps them at commit d7cd658, same paths.
REMOVED = [{'name': 'marketing-runtime-offline-0.1.0.zip', 'sha256': 'fd7a8ade1ff49d0dc5a36bb3318d2e0e5e25d74cf015db91b04fd9fd80b5da48'},
           {'name': 'marketing-runtime-offline-0.1.1.zip', 'sha256': 'b9fb673be4cdca98193883855716329255d45a30db92ed4bf2c16534374075da'}]
for item in REMOVED: assert not (RUNTIME / 'out' / item['name']).exists(), item['name']
tests = sorted(str(p.relative_to(ROOT)) for p in (RUNTIME / 'tests').glob('*.test.cjs'))
source = run('source-suite.tap', [NODE, '--test', *tests])
parent = run('parent-recovery.tap', [NODE, '--test', 'tests/audit-marketing-business.test.cjs'])
typed = run('typecheck.txt', [NODE, 'evidence/marketing-final-extension/typecheck.cjs'])
receipt = {'capturedAt':dt.datetime.now(dt.timezone.utc).isoformat(), 'boundary':'real local source/runtime; explicitly fake SharePoint/provider only', 'testsExitCode':0, 'typecheckExitCode':0, **counts(source), 'parentRecovery':counts(parent), 'typecheck':json.loads(typed), 'historicalArchives':{'removedFromTip':REMOVED,'why':'tenant-neutral repository 2026-10-15','history':'git commit d7cd658, backend/power-automate/marketing-runtime/out/'}}
(RUNTIME / 'evidence/source-suite.tap').write_text(source, encoding='utf8')
(RUNTIME / 'evidence/typecheck.txt').write_text(typed, encoding='utf8')
(RUNTIME / 'evidence/test-results.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
run('package-execution.txt', ['python3', 'backend/power-automate/marketing-runtime/package.py'])
package = json.loads((RUNTIME / 'out/package-receipt.json').read_text())
manifest = json.loads((RUNTIME / 'out/verified-zip/manifest.json').read_text())
for item in manifest['inputs']: assert sha(ROOT / item['path']) == item['sha256'], item['path']
assert sha(RUNTIME / 'out'/package['archive']) == package['sha256']
smoke = counts((RUNTIME/'out/zip-smoke.tap').read_text())
current = sorted(set([ROOT/i['path'] for i in manifest['inputs']] + list((RUNTIME/'tests').glob('*.cjs')) + [ROOT/'src/webparts/aiCoeFrontDoor/services/marketing/marketingServices.ts', RUNTIME/'build.cjs', RUNTIME/'package.py', HERE/'typecheck.cjs', HERE/'verify.py']))
receipt.update({'package':package, 'exactZipTests':smoke, 'currentSources':[{'path':str(p.relative_to(ROOT)), 'sha256':sha(p)} for p in current], 'nativeBinding':'UNBOUND: approved existing Node-capable canonical-writer host/trigger/connector bridge and native commissioning still required', 'sourceInputParity':True, 'previousArchivesInHistoryOnly':True})
(HERE/'FINAL-RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in receipt.items() if k!='currentSources'},indent=2))
