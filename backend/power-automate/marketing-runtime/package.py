"""Build and verify an explicitly NON-importable offline Marketing extension ZIP.
Run from WSL with Windows node.exe, or natively with node on PATH. No network calls.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
NODE = shutil.which('node.exe') or shutil.which('node')
if not NODE:
    raise SystemExit('Node 22+ is required; no dependency installation is performed.')
command = [NODE, 'backend/power-automate/marketing-runtime/build.cjs']
subprocess.run(command, cwd=ROOT, check=True)
candidate = HERE / 'out' / 'candidate'
manifest = json.loads((candidate / 'manifest.json').read_text(encoding='utf8'))
archive = HERE / 'out' / f"marketing-runtime-offline-{manifest['version']}.zip"
# Never replace an earlier snapshot without retaining its exact archive and receipt.
history = HERE / 'out' / 'historical'
history.mkdir(exist_ok=True)
for prior in (HERE / 'out').glob('marketing-runtime-offline-*.zip'):
    digest = hashlib.sha256(prior.read_bytes()).hexdigest()
    retained = history / f'{prior.stem}-{digest}.zip'
    if not retained.exists():
        shutil.copy2(prior, retained)
previous_receipt = HERE / 'out' / 'package-receipt.json'
if previous_receipt.exists():
    digest = hashlib.sha256(previous_receipt.read_bytes()).hexdigest()
    retained = history / f'package-receipt-{digest}.json'
    if not retained.exists():
        shutil.copy2(previous_receipt, retained)
entries = [item['path'] for item in manifest['files']] + ['manifest.json']
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
    for name in sorted(entries):
        package.write(candidate / name, name)
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert sorted(package.namelist()) == sorted(entries)
    for item in manifest['files']:
        assert hashlib.sha256(package.read(item['path'])).hexdigest() == item['sha256'], item['path']
    assert not any(name.lower().endswith('solution.xml') for name in package.namelist())
    verified = HERE / 'out' / 'verified-zip'
    verified.mkdir(parents=True, exist_ok=True)
    for name in entries:
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise RuntimeError('Unsafe package member')
        package.extract(name, verified)
# Exercise real compiled bytes recovered from the final ZIP, with EXPLICIT fake external boundaries.
win_path = str(verified)
if os.name != 'nt' and NODE.endswith('.exe'):
    win_path = subprocess.check_output(['wslpath', '-w', str(verified)], text=True).strip()
env = {**os.environ, 'MARKETING_PACKAGE_ROOT': win_path}
smoke = subprocess.run([NODE, '--test', 'backend/power-automate/marketing-runtime/tests/package.test.cjs', 'backend/power-automate/marketing-runtime/tests/source-disclosure.test.cjs'], cwd=ROOT, env=env, text=True, capture_output=True)
(HERE / 'out' / 'zip-smoke.tap').write_text(smoke.stdout + smoke.stderr, encoding='utf8')
if smoke.returncode:
    print(smoke.stdout, smoke.stderr)
    raise SystemExit(smoke.returncode)
receipt = {'kind': manifest['kind'], 'powerAutomateImportable': False, 'archive': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'zipMembers': len(entries), 'verifiedManifestFiles': len(manifest['files']), 'sourceInputs': len(manifest['inputs']), 'compiledZipSmokeExitCode': smoke.returncode, 'testBoundary': 'fake SharePoint/provider only; no tenant/model calls'}
(HERE / 'out' / 'package-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf8')
print(json.dumps(receipt, indent=2))
