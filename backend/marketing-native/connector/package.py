"""Package the separately registered helper only after exact-source local compilation. Offline only."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DOTNET = os.environ.get('DOTNET', '/home/far_cdx/.cache/oss-demo-dotnet/dotnet')
DLL = HERE / 'local/bin/Release/net10.0/MarketingHarness.dll'
FILES = ['Script.cs', 'Script.csx', 'apiDefinition.swagger.json', 'apiProperties.json', 'deployment.json', 'README.md']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    script = (HERE / 'Script.cs').read_bytes()
    compiled = subprocess.run([DOTNET, str(DLL), '--script-hash'], check=True, text=True, capture_output=True).stdout.strip()
    assert compiled == digest(script), 'Stale harness: rebuild exact Script.cs before packaging'
    assert len(script) <= 1000000
    assert script == (HERE / 'Script.csx').read_bytes()
    payloads = {name: (HERE / name).read_bytes() for name in FILES}
    manifest = {
        'kind': 'UNBOUND_PRIVATE_CONNECTOR_REGISTRATION_CANDIDATE_NOT_SOLUTION_IMPORT',
        'boundary': 'LOCAL_CSHARP73_NET10_SCRIPTBASE_SHIM_ONLY_NOT_HOSTED_QUALIFICATION',
        'scriptSha256': compiled,
        'scriptBytes': len(script),
        'localDllSha256': digest(DLL.read_bytes()),
        'members': {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in payloads.items()},
        'nativeAcceptance': False,
        'tenantWrites': False,
        'providerCalls': False,
    }
    payloads['registration-manifest.json'] = (json.dumps(manifest, indent=2)+'\n').encode()
    output = HERE / 'AICoEMarketingIntegrity_1_0_0_0_REGISTRATION_CANDIDATE.zip'
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payloads.items()):
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(item, data)
    with zipfile.ZipFile(output) as archive:
        assert len(archive.namelist()) == len(payloads)
        for name, data in payloads.items():
            assert archive.read(name) == data, name
    manifest['zipSha256'] = digest(output.read_bytes())
    manifest['zipBytes'] = output.stat().st_size
    manifest['zipPath'] = str(output.relative_to(ROOT))
    manifest['zipReadbackVerified'] = True
    (ROOT/'evidence/helper/registration-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
