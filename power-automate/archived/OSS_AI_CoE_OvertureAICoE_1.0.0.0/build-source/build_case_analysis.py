"""Build the Claude case-analysis flow for the Overture AI CoE site.

    python build-source/build_case_analysis.py

Builds 04_case_analysis/OvertureAICoEClaudeCaseAnalysis_1_0_0_0.zip next to this folder from the shared
case-analysis source (../OSS_AI_CoE_Claude_Case_Analysis_1.0.0.0/source): the OvertureAICoE site, Brian and Sam
as the only allowed callers, bound to OSS's existing Claude connector, packaged Off. Its own solution
name keeps it beside any earlier case-analysis solution in the OSS environment. Runs the source's 18
checks and writes VERIFICATION_04_case_analysis.json. --test-into <empty folder> builds there instead.

The idea-draft flow is not rebuilt: the live OSS flow (1.0.0.5, S779) has no site reference and
accepts any user in the tenant, so the OvertureAICoE page uses its trigger URL as is.
"""
import argparse
import hashlib
import json
import sys
import unittest
import zipfile
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DELIVERY = HERE.parent
ARTIFACTS = DELIVERY.parent
CASE_SOURCE = ARTIFACTS / 'OSS_AI_CoE_Claude_Case_Analysis_1.0.0.0' / 'source'

SITE = 'https://osscontact.sharepoint.com/sites/OvertureAICoE'
USERS = 'Brian.Frerichs@osscontact.com;samuel.conrad@osscontact.com'
OSS_API = 'shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6'
CASE_FOLDER = '04_case_analysis'
CASE_NAMES = {
    'SOLUTION_NAME': 'OvertureAICoEClaudeCaseAnalysis',
    'SOLUTION_DISPLAY_NAME': 'Overture AI CoE Claude Case Analysis',
    'FLOW_NAME': 'Overture AI CoE - Claude Case Analysis',
    'SHAREPOINT_REFERENCE_DISPLAY_NAME': 'Overture AI CoE Case Analysis SharePoint',
    'CLAUDE_REFERENCE_DISPLAY_NAME': 'Overture AI CoE Claude Case Analysis Connection',
}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_case_analysis(folder):
    sys.path.insert(0, str(CASE_SOURCE))
    import package as pkg
    import checks
    for key, value in CASE_NAMES.items():
        setattr(pkg, key, value)
    pkg.ZIP_NAME = pkg.SOLUTION_NAME + '_' + pkg.VERSION.replace('.', '_') + '.zip'
    out = Path(folder) / pkg.ZIP_NAME
    built = pkg.build(SITE, USERS, OSS_API, out)
    checks.SITE_URL, checks.ALLOWED_USER, checks.API_NAME, checks.ZIP = SITE, USERS, OSS_API, out
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(checks.CaseAnalysisChecks)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return out, built, result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--test-into', help='Build into this empty folder instead (dry run; not for import)')
    args = parser.parse_args()
    target = Path(args.test_into) if args.test_into else DELIVERY
    case, built, result = build_case_analysis(target / CASE_FOLDER)
    if not result.wasSuccessful():
        raise SystemExit('Case-analysis checks failed')
    with zipfile.ZipFile(case) as archive:
        text = b''.join(archive.read(name) for name in archive.namelist()).decode('utf-8', 'replace').lower()
    for marker in ('gocloudwave', 'parkplace', 'ossaicoedemo', 'cloudwavedashboarddemo', 'ai-coe-lab', 'sk-ant-'):
        if marker in text:
            raise SystemExit('Unexpected reference in the OvertureAICoE package: ' + marker)
    print('Case analysis OK:', case, sha256(case))
    if not args.test_into:
        report = {
            'status': 'LOCAL_CHECKS_PASS_IMPORT_AND_SAVE_PENDING',
            'verified_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'site_url': SITE, 'allowed_users': USERS,
            'connector_runtime_api_name': OSS_API,
            'connector_runtime_api_name_source': "OSS's existing Claude Intake Draft connector (the live idea draft uses it)",
            'case_analysis': {'zip': CASE_FOLDER + '/' + case.name, 'sha256': sha256(case), 'solution': built['solution'],
                              'flow_id': built['flow_id'], 'flow_name': built['flow_name'], 'checks_run': result.testsRun},
            'idea_draft': 'not rebuilt: the live OSS flow (1.0.0.5, S779) has no site reference and accepts any tenant user',
            'not_verified': 'Not imported, saved or run in OSS.'
        }
        (DELIVERY / 'VERIFICATION_04_case_analysis.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print('Wrote', DELIVERY / 'VERIFICATION_04_case_analysis.json')


if __name__ == '__main__':
    main()
