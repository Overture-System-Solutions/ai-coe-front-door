"""The Claude connector (01), idea draft (03) and case analysis (04) build for whatever site a target names."""
import json
import re
import tempfile
import unittest
import zipfile
from pathlib import Path

import claude_flows as cf

SITE = 'https://northwind.sharepoint.com/sites/AICoE'
USERS = 'ai-coe@northwind.com;ops@northwind.com'
API = 'shared_cwdd-5foss-20claude-20intake-20draft-5f0123456789abcdef'


def scratch():
    return Path(tempfile.mkdtemp(prefix='claude-flows-'))


class Connector(unittest.TestCase):
    def test_only_the_version_header_moves_and_the_build_is_repeatable(self):
        folder = scratch()
        first = cf.build_connector(folder / 'a.zip')
        cf.check_connector(first)
        self.assertEqual(first.read_bytes(), cf.build_connector(folder / 'b.zip').read_bytes())


class IdeaDraft(unittest.TestCase):
    def test_the_flow_id_and_member_follow_the_site(self):
        self.assertNotEqual(cf.draft_id(SITE), cf.draft_id('https://northwind.sharepoint.com/sites/Other'))
        self.assertEqual(cf.draft_id(SITE), cf.draft_id(SITE))
        self.assertIn(cf.draft_id(SITE).upper(), cf.draft_member_name(SITE))

    def test_builds_for_the_site_and_passes_its_checks(self):
        out = cf.build_idea_draft(API, scratch() / 'draft.zip', SITE)
        cf.check_idea_draft(API, out, SITE)
        with zipfile.ZipFile(out) as archive:
            self.assertIn(cf.draft_member_name(SITE), archive.namelist())

    def test_a_check_for_another_site_fails(self):
        out = cf.build_idea_draft(API, scratch() / 'draft.zip', SITE)
        with self.assertRaises(AssertionError):
            cf.check_idea_draft(API, out, 'https://northwind.sharepoint.com/sites/Other')


class CaseAnalysis(unittest.TestCase):
    def test_an_import_build_passes_the_packagers_checks(self):
        folder = scratch() / '04_case_analysis'
        connector = cf.build_connector(folder.parent / cf.CONNECTOR_ZIP_NAME)
        out, result = cf.build_case_analysis(SITE, USERS, API, folder, reference_connector=connector)
        self.assertTrue(result.wasSuccessful(), result.failures + result.errors)
        self.assertEqual(result.testsRun, 18)
        self.assertEqual(sorted(p.name for p in folder.iterdir()), sorted([out.name] + list(cf.CASE_REFERENCE_FILES)))

    def test_a_reference_build_is_the_packagers_labelled_fixture(self):
        folder = scratch() / '04_case_analysis'
        out, result = cf.build_case_analysis('https://contoso.sharepoint.com/sites/AICoE', 'ai-coe-reviewers@contoso.com',
                                             API, folder, fixture=True)
        self.assertIsNone(result)
        with zipfile.ZipFile(out) as archive:
            solution = archive.read('solution.xml').decode('utf-8-sig')
        self.assertIn('LOCAL FIXTURE ONLY - NOT FOR IMPORT', solution)
        self.assertEqual(sorted(p.name for p in folder.iterdir()), sorted([out.name] + list(cf.CASE_REFERENCE_FILES)))

    def test_an_import_build_refuses_placeholder_values(self):
        with self.assertRaisesRegex(ValueError, 'placeholder'):
            cf.build_case_analysis('https://contoso.sharepoint.com/sites/AICoE', USERS, API, scratch() / '04')


class Neutral(unittest.TestCase):
    def test_the_module_holds_no_tenant_values(self):
        # Allowlist: no site, no address, and no connector runtime name but OSS's own (the export's binding).
        text = Path(cf.__file__).read_text(encoding='utf-8')
        self.assertEqual(re.findall(r'https://[A-Za-z0-9-]+\.sharepoint\.com/sites/[A-Za-z0-9._-]+', text), [])
        self.assertEqual(re.findall(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", text), [])
        self.assertEqual(set(re.findall(r'shared_cwdd-5foss-20claude-20intake-20draft-5f[0-9a-f]{8,40}', text)), {cf.OSS_API})


if __name__ == '__main__':
    unittest.main()
