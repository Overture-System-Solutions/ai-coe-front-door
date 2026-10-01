#!/usr/bin/env python3
"""Copy an already verified local candidate into the established delivery home.
This does not build, register, bind, import or activate any tenant component.
"""
import hashlib,json,shutil,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
APP=ROOT.parents[1]
PROJECT=APP.parents[1]
DEST=PROJECT/'development/power-automate/OSS_AI_CoE_Marketing_Native_1.0.0.0'
EVIDENCE=ROOT/'evidence/integration/final-exact-package-v2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
receipt=json.loads((EVIDENCE/'VERIFICATION.json').read_text())
assert receipt['scope']=='LOCAL_STEPS_1_TO_4_ONLY' and not receipt['nativeAcceptance'] and receipt['preserved']
assert receipt['referenceScenarios']==22 and receipt['operationCount']==16
assert sha(ROOT/'connector/Script.cs')==receipt['scriptSha256']
assert not DEST.exists(),'Delivery already exists; preserve it and select a reviewed new version.'
DEST.mkdir(parents=True)

def copy(source,target):
    target=DEST/target;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);assert sha(source)==sha(target)

for name,metadata in receipt['packages'].items():
    source=ROOT/'out'/name
    if not source.is_file():source=ROOT/'out/pac-roundtrip'/name;target='pac-roundtrip/'+name
    else:target=name
    assert sha(source)==metadata['sha256'];copy(source,target)
for name in ['START_HERE.md','ROLLBACK.md','NATIVE_GATES.md','IMPLEMENTATION_CONTRACT.md','FINALIZATION_AMENDMENT.md','connector-binding.template.json']:
    copy(ROOT/name,name)
copy(EVIDENCE/'VERIFICATION.json','VERIFICATION.json')
copy(ROOT/'out/build-manifest.json','evidence/build-manifest.json')
copy(ROOT/'out/native-status.json','evidence/native-status.json')
copy(ROOT/'out/deployment-settings-template.json','deployment-settings-template.json')
for name in ['Script.cs','Script.csx','README.md','apiDefinition.swagger.json','apiProperties.json','deployment.json']:
    copy(ROOT/'connector'/name,'connector/'+name)
for file in sorted((ROOT/'provisioning').rglob('*')):
    if file.is_file() and file.suffix in {'.ps1','.json','.md'}:copy(file,'provisioning/'+file.relative_to(ROOT/'provisioning').as_posix())
for file in sorted(EVIDENCE.glob('*')):
    if file.is_file():copy(file,'evidence/final/'+file.name)
copy(ROOT/'evidence/flow/pac-verification.json','evidence/pac-verification.json')
for file in sorted((APP/'evidence/provisioning/parent-verification').glob('*')):
    if file.is_file():copy(file,'evidence/provisioning/'+file.name)
# Source snapshot is for the existing verified project; preserved donor/reference dependencies stay in that project.
source_pins={}
with zipfile.ZipFile(DEST/'NATIVE_SOURCE_SNAPSHOT.zip','x',zipfile.ZIP_DEFLATED) as archive:
    for folder in ['connector/parts','connector/local','generator','tests']:
        for file in sorted((ROOT/folder).rglob('*')):
            if not file.is_file() or any(p in {'bin','obj','__pycache__'} for p in file.parts):continue
            if file.suffix not in {'.cs','.csproj','.py','.cjs','.json','.md'}:continue
            name=file.relative_to(ROOT).as_posix();archive.write(file,name);source_pins[name]=sha(file)
    for name in ['connector/build.py','connector/package.py','evidence/integration/node-reference-vectors.json','evidence/integration/node-ai-reference-vectors.json']:
        archive.write(ROOT/name,name);source_pins[name]=sha(ROOT/name)
    archive.writestr('SNAPSHOT_MANIFEST.json',json.dumps(source_pins,indent=2)+'\n')
with zipfile.ZipFile(DEST/'NATIVE_SOURCE_SNAPSHOT.zip') as archive:
    assert all(hashlib.sha256(archive.read(n)).hexdigest()==h for n,h in source_pins.items())
manifest={p.relative_to(DEST).as_posix():{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(DEST.rglob('*')) if p.is_file()}
(DEST/'DELIVERY_MANIFEST.json').write_text(json.dumps({'status':'LOCAL_VERIFIED_OFF_UNBOUND','files':manifest,'nativeAcceptance':False},indent=2)+'\n')
bundle=DEST.parent/(DEST.name+'_LOCAL_REVIEW_BUNDLE.zip')
with zipfile.ZipFile(bundle,'x',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(DEST.rglob('*')):
        if file.is_file():archive.write(file,file.relative_to(DEST).as_posix())
with zipfile.ZipFile(bundle) as archive:
    assert len(archive.namelist())==len(manifest)+1
    assert all(hashlib.sha256(archive.read(n)).hexdigest()==metadata['sha256'] for n,metadata in manifest.items())
record={'directory':str(DEST),'bundle':str(bundle),'bundleSha256':sha(bundle),'bundleBytes':bundle.stat().st_size,'members':len(manifest)+1,'readbackVerified':True,'nativeAcceptance':False}
(ROOT/'evidence/integration/DELIVERY.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
