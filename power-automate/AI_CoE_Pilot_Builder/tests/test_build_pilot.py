"""build_pilot.py end to end: a tenant's target file in, five checked packages out."""
import functools
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import build_pilot
import profiles
import retarget
import target_file

BUILDER = Path(__file__).resolve().parent.parent
TEMPLATE_FILE = BUILDER / 'targets' / 'template.json'


def tenant_file(profile='aicoe', reference=False):
    text = TEMPLATE_FILE.read_text(encoding='utf-8').replace('contoso', 'northwind')
    if not reference:
        api = ('shared_aicoe-5fai-20coe-20claude-20draft-5f0123456789abcdef' if profile == 'aicoe'
               else 'shared_cwdd-5foss-20claude-20intake-20draft-5f0123456789abcdef')
        text = text.replace('"reference_build": true', '"reference_build": false').replace(
            '"connector_api_name": null', '"connector_api_name": "%s"' % api)
    text = text.replace('"profile": "aicoe"', '"profile": "%s"' % profile)
    path = Path(tempfile.mkdtemp(prefix='pilot-target-')) / 'tenant.json'
    path.write_text(text, encoding='utf-8')
    return path


@functools.lru_cache(maxsize=None)
def built(path, label):
    folder = Path(tempfile.mkdtemp(prefix='pilot-build-%s-' % label))
    return build_pilot.build(target_file.load(path), folder), folder


class Template(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report, cls.folder = built(TEMPLATE_FILE, 'template')
        cls.target = target_file.load(TEMPLATE_FILE)

    def test_every_package_is_written_under_its_template_name(self):
        for package in profiles.PACKAGES:
            self.assertTrue((self.folder / profiles.output_file(self.target, package)).is_file(), package)
        self.assertEqual(sorted(p.name for p in (self.folder / '04_case_analysis').glob('*.json')),
                         sorted(build_pilot.claude_flows.CASE_REFERENCE_FILES))
        self.assertTrue((self.folder / '06_copilot_submission' / 'CONCIERGE_INSTRUCTIONS.txt').is_file())

    def test_each_rename_is_undone_exactly_and_leaves_no_pilot_or_vendor_name(self):
        for package in profiles.PACKAGES:
            entry = self.report['packages'][package]
            self.assertTrue(entry['rename_undone_exactly'], package)
            self.assertEqual(entry['leftovers'], {}, package)
            self.assertEqual(entry['foreign_values'], [], package)

    def test_the_checks_of_each_builder_ran(self):
        checks = self.report['checks']
        self.assertEqual(checks['governance']['failed'], 0)
        self.assertGreater(checks['governance']['run'], 0)
        self.assertEqual(checks['case_analysis'], 'not run: a reference build uses the packager fixture mode')
        self.assertTrue(checks['connector'] and checks['idea_draft'])

    def test_the_build_is_repeatable(self):
        again = Path(tempfile.mkdtemp(prefix='pilot-build-again-'))
        build_pilot.build(self.target, again)
        for package in profiles.PACKAGES:
            name = profiles.output_file(self.target, package)
            self.assertEqual((self.folder / name).read_bytes(), (again / name).read_bytes(), package)

    def test_the_committed_template_is_this_build(self):
        result = build_pilot.compare(self.folder, self.target.output_folder)
        self.assertEqual([r for r in result if not r['same']], [])
        self.assertEqual(len(result), len(profiles.PACKAGES) + len(build_pilot.claude_flows.CASE_REFERENCE_FILES) + 1)

    def test_the_reference_packages_are_labelled_and_the_connector_is_not(self):
        for package in profiles.PACKAGES:
            with zipfile.ZipFile(self.folder / profiles.output_file(self.target, package)) as archive:
                solution = archive.read('solution.xml').decode('utf-8-sig')
            self.assertEqual(profiles.REFERENCE_LABEL in solution, package != 'connector', package)
            self.assertIn('<UniqueName>AICoETemplate</UniqueName>', solution)


class ImportBuild(unittest.TestCase):
    def test_a_tenants_import_build_is_unlabelled_and_runs_every_check(self):
        report, folder = built(tenant_file(), 'import')
        self.assertEqual(report['checks']['case_analysis']['run'], 18)
        self.assertEqual(report['checks']['case_analysis']['failed'], 0)
        target = target_file.load(report['target_file'])
        for package in profiles.PACKAGES:
            name = profiles.output_file(target, package)
            self.assertNotIn(profiles.REFERENCE_SUFFIX, name)
            with zipfile.ZipFile(folder / name) as archive:
                text = ''.join(archive.read(n).decode('utf-8', 'replace') for n in archive.namelist() if not n.endswith('.Png'))
            self.assertNotIn('reference build', text)
            if package in ('idea_draft', 'case_analysis'):
                self.assertIn(target.connector_api_name, text)
                self.assertNotIn(profiles.INTERMEDIATE_API, text)

    def test_a_pilot_profile_build_keeps_the_pilot_names(self):
        report, folder = built(tenant_file(profile='pilot'), 'pilot')
        for package in profiles.PACKAGES:
            self.assertTrue((folder / profiles.PILOT_FILES[package]).is_file(), package)
            self.assertIsNone(report['packages'][package]['rename_undone_exactly'])


class Compare(unittest.TestCase):
    def test_reports_a_package_whose_content_differs(self):
        _, folder = built(TEMPLATE_FILE, 'template')
        other = Path(tempfile.mkdtemp(prefix='pilot-compare-'))
        target = target_file.load(TEMPLATE_FILE)
        build_pilot.build(target, other)
        name = profiles.output_file(target, 'copilot_submission')
        changed = other / (name + '.tmp')
        retarget.retarget(other / name, changed, [('AI CoE Copilot SharePoint', 'Something Else')])
        changed.replace(other / name)
        result = {r['file']: r['same'] for r in build_pilot.compare(folder, other)}
        self.assertFalse(result[name])
        self.assertTrue(result[profiles.output_file(target, 'workflows')])


if __name__ == '__main__':
    unittest.main()
