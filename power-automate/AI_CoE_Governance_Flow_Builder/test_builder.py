"""Tests for the builder itself (checks.py checks a built package)."""
import io
import sys
import unittest
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_solution as b  # noqa: E402
import checks  # noqa: E402

OSS_HOST = 'osscontact.sharepoint.com'


def package(members, level):
    data = io.BytesIO()
    with zipfile.ZipFile(data, 'w') as archive:
        for name, text in members:
            entry = zipfile.ZipInfo(name, b.FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, text, compresslevel=level)
    return data.getvalue()


class Builder(unittest.TestCase):
    def test_inline_targets_are_oss_sites_only(self):
        # Client tenants are built from their own local target files (AI_CoE_Pilot_Builder), never declared here.
        for key, target in b.TARGETS.items():
            with self.subTest(target=key):
                self.assertEqual(target.site.split('/')[2], OSS_HOST)
                self.assertTrue(all(a.lower().endswith('@osscontact.com') for a in target.recipients.split(';')))

    def test_same_package_ignores_how_the_bytes_were_compressed(self):
        members = [('solution.xml', 'x' * 400 + 'y' * 50), ('Workflows/A.json', '{"a": 1}' * 40)]
        fast, small = package(members, 1), package(members, 9)
        self.assertNotEqual(fast, small)
        self.assertTrue(b.same_package(io.BytesIO(fast), io.BytesIO(small)))

    def test_same_package_still_sees_any_content_name_or_order_change(self):
        members = [('solution.xml', 'abc'), ('Workflows/A.json', '{}')]
        base = io.BytesIO(package(members, 6))
        for changed in ([('solution.xml', 'abd'), ('Workflows/A.json', '{}')],
                        [('solution.xml', 'abc'), ('Workflows/B.json', '{}')],
                        [('Workflows/A.json', '{}'), ('solution.xml', 'abc')],
                        [('solution.xml', 'abc')]):
            with self.subTest(changed=changed):
                self.assertFalse(b.same_package(base, io.BytesIO(package(changed, 6))))


class ForeignValues(unittest.TestCase):
    def setUp(self):
        self.t = b.TARGETS['overture-ai-coe']

    def test_the_targets_own_site_and_recipients_pass(self):
        text = '{"dataset": "%s", "To": "%s"}' % (self.t.site, self.t.recipients)
        self.assertEqual(checks.foreign_values(text, self.t), [])

    def test_another_site_host_or_address_is_reported(self):
        text = '{"dataset": "https://elsewhere.sharepoint.com/sites/X", "To": "someone@elsewhere.com"}'
        self.assertEqual(checks.foreign_values(text, self.t), ['elsewhere.sharepoint.com', 'someone@elsewhere.com'])

    def test_another_site_on_the_same_host_is_reported(self):
        text = '{"dataset": "https://%s/sites/SomethingElse"}' % OSS_HOST
        self.assertEqual(checks.foreign_values(text, self.t), ['https://%s/sites/SomethingElse' % OSS_HOST])


if __name__ == '__main__':
    unittest.main()
