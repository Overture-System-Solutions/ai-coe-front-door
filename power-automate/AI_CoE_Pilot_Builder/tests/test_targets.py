"""A target file holds one tenant's values; everything else (names, publisher) comes from its profile."""
import json
import tempfile
import unittest
from pathlib import Path

import target_file as targets

HERE = Path(__file__).resolve().parent
BUILDER = HERE.parent
TEMPLATE = BUILDER / 'targets' / 'template.json'


def write(values):
    folder = Path(tempfile.mkdtemp(prefix='pilot-target-'))
    path = folder / 'tenant.json'
    path.write_text(json.dumps(values), encoding='utf-8')
    return path


def tenant(**changes):
    values = {
        'key': 'example-tenant', 'profile': 'aicoe', 'reference_build': False, 'organization': 'Northwind',
        'site': 'https://northwind.sharepoint.com/sites/AICoE',
        'recipients': 'ai-coe@northwind.com;ops@northwind.com',
        'case_analysis_allowed_users': 'ai-coe@northwind.com',
        'connector_api_name': 'shared_aicoe-5fai-20coe-20claude-20draft-5f0123456789abcdef',
        'governance_description': 'AI CoE intake, triage and review workflows for the AICoE site.',
        'copilot_submission_description': 'Flows the AI CoE Concierge agent calls.',
        'output_folder': 'out',
    }
    values.update(changes)
    return {k: v for k, v in values.items() if v is not ...}


class TemplateTarget(unittest.TestCase):
    def test_the_committed_template_is_a_neutral_reference_build(self):
        target = targets.load(TEMPLATE)
        self.assertEqual((target.key, target.profile, target.reference_build), ('template', 'aicoe', True))
        self.assertEqual(target.organization, 'Contoso')
        self.assertEqual(target.site, 'https://contoso.sharepoint.com/sites/AICoE')
        self.assertEqual(target.recipients, 'ai-coe-reviewers@contoso.com')
        self.assertEqual(target.case_analysis_allowed_users, 'ai-coe-reviewers@contoso.com')
        self.assertEqual(target.output_folder, (BUILDER.parent / 'current' / 'AICoE_Template_1.0.0.0').resolve())

    def test_a_reference_build_gets_the_placeholder_connector_name(self):
        target = targets.load(TEMPLATE)
        self.assertIsNone(json.loads(TEMPLATE.read_text(encoding='utf-8'))['connector_api_name'])
        self.assertEqual(target.connector_api_name, 'shared_aicoe-5fai-20coe-20claude-20draft-5f0000000000000000')


class Validation(unittest.TestCase):
    def test_a_complete_tenant_loads_and_resolves_its_output_folder(self):
        path = write(tenant())
        target = targets.load(path)
        self.assertEqual(target.output_folder, (path.parent / 'out').resolve())
        self.assertFalse(target.reference_build)

    def test_unknown_or_missing_keys_are_refused(self):
        with self.assertRaisesRegex(ValueError, 'unknown'):
            targets.load(write(tenant(sites='https://northwind.sharepoint.com/sites/AICoE')))
        with self.assertRaisesRegex(ValueError, 'missing'):
            targets.load(write(tenant(organization=...)))

    def test_site_must_be_one_sharepoint_site(self):
        for bad in ('http://northwind.sharepoint.com/sites/AICoE', 'https://northwind.example.com/sites/AICoE',
                    'https://northwind.sharepoint.com/sites/AICoE/', 'https://northwind.sharepoint.com/AICoE'):
            with self.subTest(site=bad), self.assertRaisesRegex(ValueError, 'site'):
                targets.load(write(tenant(site=bad)))

    def test_recipients_and_users_are_semicolon_separated_addresses(self):
        for field in ('recipients', 'case_analysis_allowed_users'):
            for bad in ('', 'ai-coe@northwind.com,ops@northwind.com', 'not-an-address', 'a@northwind.com; b@northwind.com'):
                with self.subTest(field=field, value=bad), self.assertRaisesRegex(ValueError, field):
                    targets.load(write(tenant(**{field: bad})))

    def test_profile_must_be_known(self):
        with self.assertRaisesRegex(ValueError, 'profile'):
            targets.load(write(tenant(profile='contoso')))

    def test_connector_name_must_match_the_profile(self):
        with self.assertRaisesRegex(ValueError, 'connector_api_name'):
            targets.load(write(tenant(connector_api_name='shared_cwdd-5foss-20claude-20intake-20draft-5f0123456789abcdef')))
        pilot = targets.load(write(tenant(profile='pilot', connector_api_name='shared_cwdd-5foss-20claude-20intake-20draft-5f0123456789abcdef')))
        self.assertEqual(pilot.profile, 'pilot')
        with self.assertRaisesRegex(ValueError, 'connector_api_name'):
            targets.load(write(tenant(profile='pilot')))

    def test_an_import_build_needs_its_real_connector_name(self):
        with self.assertRaisesRegex(ValueError, 'connector_api_name'):
            targets.load(write(tenant(connector_api_name=None)))

    def test_an_import_build_refuses_the_template_placeholders(self):
        for field, value in (('site', 'https://contoso.sharepoint.com/sites/AICoE'), ('recipients', 'ai-coe-reviewers@contoso.com'),
                             ('case_analysis_allowed_users', 'someone@example.com'),
                             ('connector_api_name', 'shared_aicoe-5fai-20coe-20claude-20draft-5f0000000000000000')):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'placeholder'):
                targets.load(write(tenant(**{field: value})))

    def test_a_reference_build_may_not_carry_a_connector_name(self):
        with self.assertRaisesRegex(ValueError, 'reference'):
            targets.load(write(tenant(reference_build=True)))


if __name__ == '__main__':
    unittest.main()
