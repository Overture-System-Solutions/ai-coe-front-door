"""Package the separately registered helper only after exact-source local compilation. Offline only.

Default: packages the committed connector/Script.cs (the rendering for the neutral default build target) with the
connector/local harness build and writes connector/<ZIP> plus evidence/helper/registration-manifest.json.
`--target-file F --into DIR`: renders Script.cs for that target (generator/build_target.py), compiles exactly those
bytes in DIR/helper-build and writes the ZIP and its registration-manifest.json into DIR. Committed files are never
overwritten by a target build.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'generator'))
import build_target  # noqa: E402

DOTNET = os.environ.get('DOTNET', '/home/far_cdx/.cache/oss-demo-dotnet/dotnet')
DLL = HERE / 'local/bin/Release/net10.0/MarketingHarness.dll'
FILES = ['Script.cs', 'Script.csx', 'apiDefinition.swagger.json', 'apiProperties.json', 'deployment.json', 'README.md']
NAME = 'AICoEMarketingIntegrity_1_0_0_0_REGISTRATION_CANDIDATE.zip'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def script_hash(dll):
    return subprocess.run([DOTNET, str(dll), '--script-hash'], check=True, text=True, capture_output=True, input='').stdout.strip()


def stage_helper(script, into):
    """Compile exactly `script` with the local ScriptBase shim in a new folder `into`; return the DLL path.
    No package sources are consulted. The DLL embeds its build folder path, so its hash is path-dependent."""
    into = Path(into)
    local = into / 'local'
    local.mkdir(parents=True, exist_ok=False)
    (into / 'Script.cs').write_bytes(script)
    for name in ['MarketingHarness.csproj', 'Harness.cs']:
        shutil.copyfile(HERE / 'local' / name, local / name)
    (local / 'ScriptDigest.g.cs').write_text('static class ScriptDigest { public const string Sha256 = "' + digest(script) + '"; }\n')
    (into / 'NuGet.Config').write_text('<configuration><packageSources><clear /></packageSources></configuration>\n')
    env = dict(os.environ, DOTNET_ROOT=str(Path(DOTNET).parent), DOTNET_CLI_TELEMETRY_OPTOUT='1')
    result = subprocess.run([DOTNET, 'build', str(local / 'MarketingHarness.csproj'), '-c', 'Release', '--configfile',
                             str(into / 'NuGet.Config'), '-v', 'minimal'], env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (into / 'build.log').write_text(result.stdout)
    if result.returncode:
        raise RuntimeError('Helper compilation failed; see ' + str(into / 'build.log'))
    dll = local / 'bin/Release/net10.0/MarketingHarness.dll'
    assert script_hash(dll) == digest(script), 'Compiled helper does not bind the staged script'
    return dll


def package(script, dll, output, manifest_path):
    compiled = script_hash(dll)
    assert compiled == digest(script), 'Stale harness: rebuild exact Script.cs before packaging'
    assert len(script) <= 1000000
    payloads = {name: (HERE / name).read_bytes() for name in FILES}
    payloads['Script.cs'] = payloads['Script.csx'] = script
    manifest = {
        'kind': 'UNBOUND_PRIVATE_CONNECTOR_REGISTRATION_CANDIDATE_NOT_SOLUTION_IMPORT',
        'boundary': 'LOCAL_CSHARP73_NET10_SCRIPTBASE_SHIM_ONLY_NOT_HOSTED_QUALIFICATION',
        'scriptSha256': compiled,
        'scriptBytes': len(script),
        'localDllSha256': digest(dll.read_bytes()),
        'members': {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in payloads.items()},
        'nativeAcceptance': False,
        'tenantWrites': False,
        'providerCalls': False,
    }
    payloads['registration-manifest.json'] = (json.dumps(manifest, indent=2)+'\n').encode()
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
    manifest['zipPath'] = str(output.relative_to(ROOT)) if output.resolve().is_relative_to(ROOT) else output.name
    manifest['zipReadbackVerified'] = True
    manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--target-file', type=Path, help='Local target JSON {site, work_id_prefix}')
    parser.add_argument('--into', type=Path, help='New output folder for a target build (outside backend/marketing-native)')
    args = parser.parse_args()
    if args.into is None:
        if args.target_file is not None:
            parser.error('--target-file needs --into; the committed connector/ package is the neutral default build')
        script = (HERE / 'Script.cs').read_bytes()
        assert script == build_target.render_script(build_target.DEFAULT) == (HERE / 'Script.csx').read_bytes()
        manifest = package(script, DLL, HERE / NAME, ROOT / 'evidence/helper/registration-manifest.json')
    else:
        if args.into.resolve().is_relative_to(ROOT):
            parser.error('--into must be outside backend/marketing-native')
        args.into.mkdir(parents=True, exist_ok=False)
        script = build_target.render_script(build_target.load(args.target_file))
        dll = stage_helper(script, args.into / 'helper-build')
        manifest = package(script, dll, args.into / NAME, args.into / 'registration-manifest.json')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
