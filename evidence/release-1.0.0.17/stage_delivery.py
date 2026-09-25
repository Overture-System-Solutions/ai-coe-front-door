"""Stage selected verified binaries, offline installer and receipts; no deployment."""
from pathlib import Path
import datetime, hashlib, json, shutil, zipfile
ROOT=Path(__file__).resolve().parents[2];PROJECT=ROOT.parents[1]
DEST=PROJECT/'deliverables/CloudWave_Local_Corrections_1.0.0.17_2026-09-23'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files={
'sharepoint/solution/overture-ai-coe-front-door.sppkg':'frontend/overture-ai-coe-front-door-1.0.0.17.sppkg',
'evidence/release-1.0.0.17/VERIFICATION.json':'verification/VERIFICATION.json',
'evidence/release-1.0.0.17/browser-results.json':'verification/browser-results.json',
'evidence/port-verification.json':'verification/port-verification.json',
'LIVE_BINDINGS_REQUIRED.md':'REMAINING_GATES.md',
'backend/core-native/evidence/final-verification.json':'verification/core-final-verification.json',
'backend/power-automate/marketing-runtime/out/package-receipt.json':'verification/marketing-package-receipt.json',
'evidence/marketing-final-extension/FINAL-RECEIPT.json':'verification/marketing-final-receipt.json'}
for name in ['AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip','AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY_literal-fallback.zip','AICoECoreIntegrity_3_0_0_1_REGISTRATION_CANDIDATE.zip']:
    files['backend/core-native/out/'+name]='core/'+name
files['backend/power-automate/marketing-runtime/out/marketing-runtime-offline-0.1.1.zip']='marketing/marketing-runtime-offline-0.1.1.zip'
for p in (ROOT/'sharepoint/pages/one-page').rglob('*'):
    if p.is_file():files[str(p.relative_to(ROOT))]='installer/'+str(p.relative_to(ROOT/'sharepoint/pages/one-page'))
for src,dst in files.items():
    source=ROOT/src;target=DEST/dst;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists() and sha(target)!=sha(source):raise RuntimeError('Existing delivery differs; review before replacing: '+str(target))
    shutil.copy2(source,target)
    assert sha(target)==sha(source)
manifest={'version':'1.0.0.17','scope':'LOCAL_REVIEW_BUNDLE_NOT_A_DEPLOYMENT_AUTHORIZATION','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[]}
for p in sorted(DEST.rglob('*')):
    if p.is_file() and p.name!='MANIFEST.json':manifest['files'].append({'path':str(p.relative_to(DEST)),'sha256':sha(p),'bytes':p.stat().st_size})
(DEST/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=DEST.with_name(DEST.name+'.zip')
if archive.exists():raise RuntimeError('Archive already exists; do not replace a delivered version silently.')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(DEST.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(DEST)))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist())==len(manifest['files'])+1
    for entry in manifest['files']:assert hashlib.sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
receipt={'directory':str(DEST),'archive':str(archive),'archiveSha256':sha(archive),'fileCount':len(manifest['files']),'archiveMembers':len(manifest['files'])+1,'byteVerified':True}
(Path(__file__).parent/'DELIVERY.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
