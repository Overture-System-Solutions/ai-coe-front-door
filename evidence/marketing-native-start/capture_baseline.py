"""Capture the immutable local integration baseline and required operation inventory."""
from pathlib import Path
import datetime, hashlib, json
ROOT=Path(__file__).resolve().parents[2]
TARGET=ROOT/'backend/marketing-native/evidence'
TARGET.mkdir(parents=True,exist_ok=True)
old=json.loads((ROOT/'evidence/release-1.0.0.17/VERIFICATION.json').read_text())
files={}
for rel,h in old['runtimeTestInputs'].items():
    p=ROOT/rel;actual=hashlib.sha256(p.read_bytes()).hexdigest();assert actual==h,rel;files[rel]=h
for group in ['backend/core-native','backend/power-automate/marketing-runtime']:
    for p in (ROOT/group).rglob('*'):
        if p.is_file() and not any(x in {'bin','obj','__pycache__','.pytest_cache'} for x in p.parts) and 'out' not in p.relative_to(ROOT/group).parts:
            files[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
for rel in ['sharepoint/solution/overture-ai-coe-front-door.sppkg','backend/core-native/out/AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip','backend/power-automate/marketing-runtime/out/marketing-runtime-offline-0.1.1.zip']:
    files[rel]=hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()
operations=json.loads((ROOT/'backend/power-automate/marketing-runtime/operations.json').read_text())
assert len(operations['operations'])==16
record={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'purpose':'Preserve verified frontend/native CORE/Node candidate during Microsoft Marketing integration','files':files,'operations':operations,'nativeAcceptance':False}
out=TARGET/'baseline.json'
if out.exists():raise SystemExit('Baseline already exists; do not replace it.')
out.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'protectedFiles':len(files),'requiredOperations':len(operations['operations']),'path':str(out)},indent=2))
