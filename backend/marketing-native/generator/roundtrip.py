#!/usr/bin/env python3
"""Local PAC unpack/pack/unpack/settings and exact semantic verification. NO tenant APIs."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from marketing_flow import ROOT, command_flow
from marketing_package import semantics
from marketing_validate import validate
from build import NAME


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--pac', type=Path, default=Path('/home/far_cdx/.cache/oss-demo-pac/pac'))
    p.add_argument('--dotnet-root', type=Path, default=Path('/home/far_cdx/.cache/oss-demo-dotnet'))
    args = p.parse_args()
    if not args.pac.is_file() or not (args.dotnet_root / 'dotnet').is_file():
        p.error('Supply the existing local PAC/.NET tool locations; no automatic installation or authentication')
    evidence = ROOT / 'evidence/flow/pac'
    evidence.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='verified-', dir=evidence))
    original = ROOT / 'out' / NAME
    target = ROOT / 'out/pac-roundtrip/AICoEMarketingAutomation_1_0_0_0.zip'
    target.parent.mkdir(exist_ok=True)
    env = dict(os.environ, DOTNET_ROOT=str(args.dotnet_root), DOTNET_CLI_TELEMETRY_OPTOUT='1')
    env['PATH'] = str(args.dotnet_root) + os.pathsep + env.get('PATH', '')
    commands = [
        ('help', ['help']),
        ('unpack', ['solution', 'unpack', '--zipfile', str(original), '--folder', str(run / 'unpacked'), '--packagetype', 'Unmanaged', '--log', str(run / 'unpack-detail.log')]),
        ('pack', ['solution', 'pack', '--folder', str(run / 'unpacked'), '--zipfile', str(target), '--packagetype', 'Unmanaged', '--log', str(run / 'pack-detail.log')]),
        ('roundtrip', ['solution', 'unpack', '--zipfile', str(target), '--folder', str(run / 'roundtrip'), '--packagetype', 'Unmanaged', '--log', str(run / 'roundtrip-detail.log')]),
        ('settings', ['solution', 'create-settings', '--solution-zip', str(target), '--settings-file', str(run / 'settings.json')])]
    executions = []
    for label, arguments in commands:
        result = subprocess.run([str(args.pac), *arguments], env=env, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
        (run / (label + '.log')).write_text(result.stdout)
        executions.append({'command': [str(args.pac), *arguments], 'exitCode': result.returncode, 'log': str((run / (label + '.log')).relative_to(ROOT))})
        if result.returncode:
            raise RuntimeError('Local PAC failed; inspect ' + str(run / (label + '.log')))
    before, after = semantics(original), semantics(target)
    assert before == after, 'PAC changed workflow/package semantics'
    generated = command_flow()
    wf = after['workflows'][generated.guid]
    assert wf['definition'] == generated.definition(), 'Final ZIP contains a stale WDL definition'
    assert len(after['workflows']) == 1 and wf['state'] == '0' and wf['status'] == '1'
    assert not validate(wf['definition'])
    assert after['roots'] == [('29', generated.guid)]
    settings = json.loads((run / 'settings.json').read_text())
    assert {x['LogicalName']: x['ConnectorId'] for x in settings['ConnectionReferences']} == {k: v['api'] for k, v in after['references'].items()}
    assert all(x['ConnectionId'] == '' for x in settings['ConnectionReferences'])
    manifest = json.loads((ROOT / 'out/build-manifest.json').read_text())
    assert digest(original) == manifest['packages'][NAME]['sha256']
    for name, source_hash in manifest['sourceHashes'].items():
        assert digest(ROOT / name) == source_hash, 'Build source changed: ' + name
    receipt = {'verifiedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'scope': 'OFFLINE_PAC_ARTIFACT_CHECK_ONLY',
               'definitionConnectionStateIdentitySemanticsPreserved': True, 'tenantActionsPerformed': False,
               'workflowId': generated.guid, 'flowState': 'OFF', 'helperApi': 'UNBOUND_MARKETING_INTEGRITY',
               'candidate': {'path': str(original), 'sha256': digest(original)},
               'pacRoundtrip': {'path': str(target), 'sha256': digest(target)}, 'commands': executions,
               'notClaimed': ['native designer Save/import/activation', 'helper hosted execution', 'tenant permissions or provider results']}
    (ROOT / 'evidence/flow/pac-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
