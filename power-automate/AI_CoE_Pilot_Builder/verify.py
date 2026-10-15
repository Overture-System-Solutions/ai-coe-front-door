"""Write the template's VERIFICATION.json: hashes, a fresh rebuild, every test suite and the PAC roundtrip.

    python power-automate/AI_CoE_Pilot_Builder/verify.py [--target-file targets/template.json]

Needs node and the front-door source (the parity test runs the front door's own TypeScript; AICOE_FRONT_DOOR
overrides where it is found) and Microsoft's PAC CLI (PAC_CLI overrides the path; DOTNET_ROOT if PAC needs it).
A missing tool fails the verification; nothing is skipped. Everything recorded is LOCAL evidence: a WDL emulation,
an in-memory SharePoint fake, the front door's TypeScript in Node and PAC offline. It is not a tenant import, a
designer Save, a live run or user acceptance.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_pilot  # noqa: E402
import profiles  # noqa: E402
import retarget  # noqa: E402
import target_file  # noqa: E402

copilot = build_pilot.copilot
PAC = Path(os.environ.get('PAC_CLI') or Path.home() / '.cache' / 'oss-demo-pac' / 'pac')
DOTNET = Path(os.environ.get('DOTNET_ROOT') or Path.home() / '.cache' / 'oss-demo-dotnet')
SUITES = {'pilot_builder': HERE / 'tests', 'copilot_submission': HERE / 'copilot_submission' / 'tests',
          'governance_builder': profiles.GOVERNANCE / 'test_builder.py'}
PARITY_FILES = ['src/webparts/aiCoeFrontDoor/services/GovernanceService.ts', 'src/webparts/aiCoeFrontDoor/services/flags.ts',
                'src/webparts/aiCoeFrontDoor/services/executivePriority.ts', 'src/webparts/aiCoeFrontDoor/services/intakeId.ts',
                'src/webparts/aiCoeFrontDoor/summaries/ideaSummary.ts', 'src/webparts/aiCoeFrontDoor/summaries/feedbackSummary.ts',
                'src/webparts/aiCoeFrontDoor/content/workflows/idea.ts', 'src/webparts/aiCoeFrontDoor/content/workflows/feedback.ts',
                'sharepoint/assets/intake-schema.xml']


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run_suite(path):
    with tempfile.TemporaryDirectory() as folder:
        report = Path(folder) / 'junit.xml'
        done = subprocess.run([sys.executable, '-B', '-m', 'pytest', '-q', '-p', 'no:cacheprovider', str(path), '--junitxml', str(report)],
                              capture_output=True, text=True, encoding='utf-8', cwd=str(Path(path).parent if Path(path).is_file() else path),
                              env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
        text = report.read_text(encoding='utf-8')
    totals = re.search(r'<testsuite [^>]*errors="(\d+)" failures="(\d+)" skipped="(\d+)" tests="(\d+)"', text)
    errors, failures, skipped, tests = (int(x) for x in totals.groups())
    return {'exit_code': done.returncode, 'tests': tests, 'failures': failures, 'errors': errors, 'skipped': skipped,
            'summary': done.stdout.strip().splitlines()[-1] if done.stdout.strip() else done.stderr.strip()[-300:]}


def pac_roundtrip(package):
    if not PAC.exists():
        return {'ok': False, 'error': 'PAC CLI not found at %s (set PAC_CLI)' % PAC}
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT='1')
    if DOTNET.exists():
        env.update(DOTNET_ROOT=str(DOTNET), PATH=str(DOTNET) + os.pathsep + os.environ['PATH'])
    with tempfile.TemporaryDirectory() as folder:
        work = Path(folder)
        steps = [['solution', 'unpack', '--zipfile', str(package), '--folder', str(work / 'unpacked'), '--packagetype', 'Unmanaged'],
                 ['solution', 'pack', '--folder', str(work / 'unpacked'), '--zipfile', str(work / 'repacked.zip'), '--packagetype', 'Unmanaged'],
                 ['solution', 'unpack', '--zipfile', str(work / 'repacked.zip'), '--folder', str(work / 'roundtrip'), '--packagetype', 'Unmanaged'],
                 ['solution', 'create-settings', '--solution-zip', str(package), '--settings-file', str(work / 'settings.json')]]
        log = []
        for step in steps:
            done = subprocess.run([str(PAC)] + step, capture_output=True, text=True, env=env)
            output = done.stdout + done.stderr
            log.append({'command': 'pac ' + ' '.join(step[:2]), 'exit_code': done.returncode,
                        'warnings_or_errors': [l.strip() for l in output.splitlines() if re.search(r'warn|error', l, re.I)]})
            if done.returncode != 0:
                return {'ok': False, 'steps': log}
        with zipfile.ZipFile(package) as archive:
            original = {Path(n).name: json.loads(archive.read(n).decode('utf-8-sig')) for n in archive.namelist() if n.startswith('Workflows/')}
        roundtrip = {p.name: json.loads(p.read_text(encoding='utf-8-sig')) for p in (work / 'roundtrip' / 'Workflows').glob('*.json')}
        settings = json.loads((work / 'settings.json').read_text(encoding='utf-8-sig'))
    return {'ok': all(s['exit_code'] == 0 and not s['warnings_or_errors'] for s in log), 'steps': log,
            'workflows': len(original), 'workflow_json_equal_after_roundtrip': original == roundtrip,
            'connection_references': [r['LogicalName'] for r in settings.get('ConnectionReferences', [])]}


def front_door_commit(folder):
    git = folder / '.git'
    head = git.read_text().split('gitdir:')[1].strip() if git.is_file() else str(git)
    git_dir = Path('/mnt/' + head[0].lower() + head[2:]) if re.match(r'^[A-Za-z]:/', head) and os.name != 'nt' else Path(head)
    ref = (git_dir / 'HEAD').read_text().strip()
    branch = ref.split('refs/heads/')[1] if ref.startswith('ref:') else None
    common = git_dir.parent.parent if git.is_file() else git_dir
    commit = ref if not branch else None
    if branch:
        loose = common / 'refs' / 'heads' / branch
        if loose.exists():
            commit = loose.read_text().strip()
        else:
            for line in (common / 'packed-refs').read_text().splitlines():
                if line.endswith('refs/heads/' + branch):
                    commit = line.split()[0]
    return {'branch': branch, 'commit': commit}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--target-file', type=Path, default=HERE / 'targets' / 'template.json')
    args = parser.parse_args(argv)
    target = target_file.load(args.target_file)
    folder = target.output_folder
    rebuilt = Path(tempfile.mkdtemp(prefix='pilot-verify-'))
    report = build_pilot.build(target, rebuilt)
    comparison = build_pilot.compare(rebuilt, folder)
    suites = {name: run_suite(path) for name, path in SUITES.items()}
    packages = {}
    for package in profiles.PACKAGES:
        path = folder / profiles.output_file(target, package)
        packages[package] = dict(report['packages'][package], sha256=sha256(path), bytes=path.stat().st_size,
                                 leftovers=retarget.package_leftovers(path) if target.profile != 'pilot' else {},
                                 foreign_values=build_pilot.foreign_values(path, target), pac_roundtrip=pac_roundtrip(path))
    front_door = copilot.find_front_door()
    record = {
        'what': 'AI CoE template packages 01-06 (tenant-neutral reference build; 01 is import-ready)',
        'written_at': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'status': ('locally checked; the reference packages 02-06 are not for import; tenant builds, import, designer '
                   'Save, agent tool configuration and live acceptance are separate and pending'),
        'target': {'file': str(Path(args.target_file).name), 'profile': target.profile, 'reference_build': target.reference_build,
                   'site': target.site, 'recipients': target.recipients, 'connector_api_name': target.connector_api_name},
        'publisher': {'unique_name': 'AICoETemplate', 'display_name': 'AI CoE Template', 'prefix': 'aicoe', 'option_value_prefix': 61413},
        'packages': packages,
        'other_files': {str(p.relative_to(folder)).replace('\\', '/'): sha256(p) for p in sorted(folder.rglob('*'))
                        if p.is_file() and p.suffix != '.zip' and p.name != 'VERIFICATION.json'},
        'builder_checks': report['checks'],
        'fresh_rebuild_matches_committed_files': all(r['same'] for r in comparison),
        'fresh_rebuild_identical_bytes': {r['file']: r['identical_bytes'] for r in comparison},
        'tests': suites,
        'interpreter': {'python': platform.python_version(), 'system': platform.system(), 'zlib': zlib.ZLIB_RUNTIME_VERSION},
        'parity_reference': ({'front_door': front_door.name, **front_door_commit(front_door),
                              'files': {f: sha256(front_door / f) for f in PARITY_FILES}} if front_door else None),
        'source': {str(p.relative_to(HERE.parent)).replace('\\', '/'): sha256(p)
                   for base in (HERE, profiles.GOVERNANCE) for p in sorted(base.rglob('*'))
                   if p.is_file() and p.suffix in ('.py', '.cjs', '.json', '.txt') and '__pycache__' not in p.parts},
        'limits': ['Flows ran in a local WDL emulation against an in-memory SharePoint fake; neither is Microsoft.',
                   'The 04 reference build is the archived packager in fixture mode; its 18 checks run only on a tenant (import) '
                   'build, as tests/test_build_pilot.py does for a sample tenant.',
                   "The connector's runtime name pattern for a tenant is inferred from OSS's connector; the target file takes the real one.",
                   'Compressed ZIP bytes depend on the zlib build; equality here is of members, metadata and content.',
                   'Copilot Studio tool configuration, Premium classification and every live acceptance step are unverified.'],
    }
    ok = (record['fresh_rebuild_matches_committed_files'] and front_door is not None
          and all(s['exit_code'] == 0 and not s['skipped'] and s['tests'] > 0 for s in suites.values())
          and all(p['pac_roundtrip'].get('ok') and not p['leftovers'] and not p['foreign_values'] for p in packages.values()))
    record['result'] = 'PASS' if ok else 'FAIL'
    out = folder / 'VERIFICATION.json'
    out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(out)
    print(json.dumps({'result': record['result'], 'tests': {k: v['summary'] for k, v in suites.items()},
                      'pac_ok': {k: v['pac_roundtrip'].get('ok') for k, v in packages.items()},
                      'rebuild_matches': record['fresh_rebuild_matches_committed_files']}, indent=2))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
