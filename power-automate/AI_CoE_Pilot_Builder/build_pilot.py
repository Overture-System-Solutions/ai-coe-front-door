"""Build one tenant's AI CoE packages from its target file, check them, and compare them with a delivered set.

    python build_pilot.py --target-file targets/template.json --write-output-folder     # the committed template
    python build_pilot.py --target-file <tenant>.json --into <empty folder>             # a tenant's build
    python build_pilot.py --target-file <tenant>.json --into <folder> --compare-with <delivered folder>

Packages (import in this order):
  01  Claude connector            claude_flows.build_connector
  02  intake, triage, review,      ../AI_CoE_Governance_Flow_Builder (with the front door's lists)
      provisioning and digest
  03  Claude idea draft            claude_flows.build_idea_draft
  04  Claude case analysis         claude_flows.build_case_analysis (+ its five reference schema files)
  06  Copilot submission           copilot_submission/build_copilot_submission.py (+ the Concierge's Instructions)

Each is built with the pilot names and checked by its own builder's checks, then, for the "aicoe" profile, renamed
(retarget.py) and the rename undone to prove it changed nothing else. Every package must name only the target's own
SharePoint site and addresses, and an aicoe package no pilot, vendor or fixture name (retarget.leftovers).

Client target files live outside this repository (development/power-automate/local-targets/ in the project home).
Nothing here imports, saves or runs anything in a tenant, and no credential is involved. The front-door app (05)
is built from the front-door source, not here.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
for folder in (HERE, HERE / 'copilot_submission'):
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))

import claude_flows  # noqa: E402
import profiles  # noqa: E402
import retarget  # noqa: E402
import target_file  # noqa: E402
import build_copilot_submission as copilot  # noqa: E402

governance = profiles.governance
SITE_URL = re.compile(r'https://[A-Za-z0-9.-]+\.sharepoint\.com(?:/(?:sites|teams)/[A-Za-z0-9._-]+)?', re.I)
ADDRESS = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
CONCIERGE = '06_copilot_submission/CONCIERGE_INSTRUCTIONS.txt'


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def governance_checks():
    name = 'governance_checks'
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, profiles.GOVERNANCE / 'checks.py')
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


def run_suite(case):
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(case))
    failed = [str(test) for test, _ in result.failures + result.errors]
    return {'run': result.testsRun, 'failed': len(failed), 'skipped': len(result.skipped), 'failures': failed}


def foreign_values(path, target):
    """SharePoint sites/hosts and addresses in a package that are not the target's own."""
    found = []
    for name, text in _texts(path):
        for match in SITE_URL.finditer(text):
            value = match.group(0)
            if value.split('/')[2].lower() != target.site_host:
                value = value.split('/')[2].lower()
            elif value.lower() == target.site.lower() or value.count('/') == 2:
                continue
            if value not in found:
                found.append(value)
        for match in ADDRESS.finditer(text):
            if match.group(0).lower() not in target.addresses and match.group(0) not in found:
                found.append(match.group(0))
    return found


def _texts(path):
    import zipfile
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if not info.filename.lower().endswith(retarget.BINARY):
                yield info.filename, archive.read(info).decode('utf-8')


def build(target, folder):
    """Build, check and (for aicoe) rename all five packages into folder. Raises on any failed check."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='pilot-stage-'))
    api = profiles.intermediate_api(target)
    report = {'target_file': str(target.source), 'target': target.key, 'profile': target.profile,
              'reference_build': target.reference_build, 'site': target.site, 'packages': {}, 'checks': {}}
    built = {}
    try:
        built['connector'] = claude_flows.build_connector(stage / profiles.PILOT_FILES['connector'])
        claude_flows.check_connector(built['connector'])
        report['checks']['connector'] = True

        workflows = profiles.governance_target(target, stage / profiles.PILOT_FILES['workflows'])
        built['workflows'], _ = governance.build(workflows)
        checks = governance_checks()
        checks.TARGET = workflows
        report['checks']['governance'] = run_suite(checks.Checks)
        if report['checks']['governance']['failed']:
            raise RuntimeError('governance checks failed: %s' % report['checks']['governance']['failures'])

        built['idea_draft'] = claude_flows.build_idea_draft(api, stage / profiles.PILOT_FILES['idea_draft'], target.site)
        claude_flows.check_idea_draft(api, built['idea_draft'], target.site)
        report['checks']['idea_draft'] = True

        case_folder = stage / '04_case_analysis'
        built['case_analysis'], result = claude_flows.build_case_analysis(
            target.site, target.case_analysis_allowed_users, api, case_folder, fixture=target.reference_build,
            reference_connector=built['connector'])
        if result is None:
            report['checks']['case_analysis'] = 'not run: a reference build uses the packager fixture mode'
        else:
            failed = [str(test) for test, _ in result.failures + result.errors]
            report['checks']['case_analysis'] = {'run': result.testsRun, 'failed': len(failed), 'skipped': len(result.skipped),
                                                 'failures': failed}
            if failed or result.skipped:
                raise RuntimeError('case-analysis checks failed: %s' % failed)

        copilot.configure(target)
        built['copilot_submission'] = copilot.build(stage / '06_copilot_submission')

        for package in profiles.PACKAGES:
            name = profiles.output_file(target, package)
            destination = folder / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            renames = profiles.mapping(target, package)
            if renames:
                retarget.retarget(built[package], destination, renames)
                undone = retarget.undoes_to(destination, built[package], renames)
                if not undone:
                    raise RuntimeError('%s: undoing the renames did not give back the checked build' % package)
                leftovers = retarget.package_leftovers(destination)
            else:
                shutil.copyfile(built[package], destination)
                undone, leftovers = None, {}
            foreign = foreign_values(destination, target)
            report['packages'][package] = {'file': name, 'sha256': sha256(destination), 'bytes': destination.stat().st_size,
                                           'renames': len(renames), 'rename_undone_exactly': undone,
                                           'leftovers': leftovers, 'foreign_values': foreign}
            if leftovers or foreign:
                raise RuntimeError('%s: leftovers %s, foreign values %s' % (package, leftovers, foreign))

        for name in claude_flows.CASE_REFERENCE_FILES:
            shutil.copyfile(case_folder / name, folder / '04_case_analysis' / name)
        (folder / CONCIERGE).write_bytes(copilot.concierge_instructions().encode('utf-8'))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    return report


def built_files(folder):
    """The files build() writes, relative to folder."""
    folder = Path(folder)
    return sorted(str(p.relative_to(folder)).replace('\\', '/') for p in folder.rglob('*')
                  if p.is_file() and (p.suffix == '.zip' or p.parent.name == '04_case_analysis' or p.name == 'CONCIERGE_INSTRUCTIONS.txt'))


def compare(built_folder, other_folder):
    """Compare each built file with the file of the same name in other_folder.

    Packages are compared by what an import reads (governance.same_package); identical_bytes also reports whether
    the compressed bytes match (they do when both were written with the same zlib build). The Concierge's
    Instructions are matched with CONCIERGE_INSTRUCTIONS*.txt when the delivered copy carries a tenant suffix.
    """
    built_folder, other_folder = Path(built_folder), Path(other_folder)
    results = []
    for name in built_files(built_folder):
        mine, theirs = built_folder / name, other_folder / name
        if name == CONCIERGE and not theirs.exists():
            candidates = sorted(theirs.parent.glob('CONCIERGE_INSTRUCTIONS*.txt'))
            theirs = candidates[0] if len(candidates) == 1 else theirs
        if not theirs.exists():
            results.append({'file': name, 'same': False, 'identical_bytes': False, 'compared_with': None})
            continue
        identical = mine.read_bytes() == theirs.read_bytes()
        same = governance.same_package(mine, theirs) if name.endswith('.zip') else identical
        results.append({'file': name, 'same': same, 'identical_bytes': identical,
                        'compared_with': str(theirs.relative_to(other_folder)).replace('\\', '/')})
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--target-file', required=True, type=Path)
    where = parser.add_mutually_exclusive_group(required=True)
    where.add_argument('--into', type=Path, help='build into this folder')
    where.add_argument('--write-output-folder', action='store_true', help="build into the target file's output_folder")
    parser.add_argument('--compare-with', type=Path, help='compare the build with the files in this folder')
    args = parser.parse_args(argv)
    target = target_file.load(args.target_file)
    folder = target.output_folder if args.write_output_folder else args.into
    report = build(target, folder)
    print(json.dumps({'folder': str(folder), 'checks': report['checks'],
                      'packages': {k: {'file': v['file'], 'sha256': v['sha256'][:16], 'rename_undone_exactly': v['rename_undone_exactly']}
                                   for k, v in report['packages'].items()}}, indent=2))
    if args.compare_with:
        results = compare(folder, args.compare_with)
        for r in results:
            print('%-4s %-15s %s  <->  %s' % ('SAME' if r['same'] else 'DIFF', 'identical bytes' if r['identical_bytes'] else '',
                                             r['file'], r['compared_with']))
        if not all(r['same'] for r in results):
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
