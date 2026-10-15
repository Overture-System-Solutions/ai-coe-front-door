"""Build target: the Work ID prefix and site come from a target file; the repository default is neutral."""
import io
import json
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'generator'))
import build_target as T  # noqa: E402

OTHER = {'site': 'https://fabrikam.sharepoint.com/sites/Marketing', 'work_id_prefix': 'FABRIKAM'}


def changed_lines(a: bytes, b: bytes):
    x, y = a.decode().split('\n'), b.decode().split('\n')
    assert len(x) == len(y)
    return [(i, p, q) for i, (p, q) in enumerate(zip(x, y)) if p != q]


class TargetFile(unittest.TestCase):
    def test_neutral_default_matches_core_convention(self):
        self.assertEqual(T.DEFAULT, {'site': 'https://contoso.sharepoint.com/sites/AICoE', 'work_id_prefix': 'AICOE'})
        self.assertEqual(T.load(None), T.DEFAULT)

    def test_exact_keys_and_formats(self):
        for bad in [{}, {'site': T.DEFAULT['site']}, dict(T.DEFAULT, extra=1), dict(T.DEFAULT, site='https://contoso.sharepoint.com/sites/AICoE/'),
                    dict(T.DEFAULT, site='http://contoso.sharepoint.com/sites/AICoE'), dict(T.DEFAULT, site='https://contoso.example.com/sites/AICoE'),
                    dict(T.DEFAULT, work_id_prefix='aicoe'), dict(T.DEFAULT, work_id_prefix='A'), dict(T.DEFAULT, work_id_prefix='A' * 17),
                    dict(T.DEFAULT, work_id_prefix='AI-COE'), dict(T.DEFAULT, work_id_prefix='1AICOE'), dict(T.DEFAULT, work_id_prefix=7)]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                T.validate(bad)
        self.assertEqual(T.validate(dict(OTHER)), OTHER)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'target.json'
            path.write_text(json.dumps(OTHER))
            self.assertEqual(T.load(path), OTHER)


class Rendering(unittest.TestCase):
    def test_committed_sources_are_the_default_rendering(self):
        script = (ROOT / 'connector/Script.cs').read_bytes()
        self.assertEqual(T.render_script(T.DEFAULT), script)
        self.assertEqual(script, (ROOT / 'connector/Script.csx').read_bytes())
        self.assertEqual(T.render_controlled_inputs(T.DEFAULT), (ROOT / 'provisioning/controlled-inputs.schema.json').read_bytes())
        core = (ROOT / 'connector/parts/00_Core.cs').read_bytes()
        self.assertEqual(core.count(b'"^AICOE-[A-Z0-9][A-Z0-9_-]{2,79}$"'), 1)

    def test_other_target_changes_only_the_anchored_work_id_line_and_undoes_exactly(self):
        default = T.render_script(T.DEFAULT)
        other = T.render_script(OTHER)
        diff = changed_lines(default, other)
        self.assertEqual(len(diff), 1)
        self.assertIn('"^FABRIKAM-[A-Z0-9][A-Z0-9_-]{2,79}$"', diff[0][2])
        self.assertEqual(T.render_script(T.DEFAULT, data=other, source=OTHER), default)
        pattern = re.compile(r'^FABRIKAM-[A-Z0-9][A-Z0-9_-]{2,79}$')
        self.assertTrue(pattern.fullmatch('FABRIKAM-OFFLINE_TEST'))
        self.assertIsNone(pattern.fullmatch('AICOE-OFFLINE_TEST'))

    def test_controlled_inputs_pattern_follows_target(self):
        default = T.render_controlled_inputs(T.DEFAULT)
        other = T.render_controlled_inputs(OTHER)
        self.assertEqual(len(changed_lines(default, other)), 1)
        def patterns(data):
            found = []
            def visit(v):
                if isinstance(v, dict):
                    if 'pattern' in v: found.append(v['pattern'])
                    for x in v.values(): visit(x)
                elif isinstance(v, list):
                    for x in v: visit(x)
            visit(json.loads(data))
            return found
        self.assertIn('^FABRIKAM-[A-Z0-9_-]{2,124}$', patterns(other))
        self.assertIn('^AICOE-[A-Z0-9_-]{2,124}$', patterns(default))

    def test_missing_or_repeated_anchor_fails_closed(self):
        script = T.render_script(T.DEFAULT)
        anchor = b'Match(S(t),"^AICOE-[A-Z0-9][A-Z0-9_-]{2,79}$")'
        with self.assertRaises(ValueError):
            T.render_script(OTHER, data=script.replace(anchor, b'Match(S(t),"^X-$")'))
        with self.assertRaises(ValueError):
            T.render_script(OTHER, data=script + b'\n// ' + anchor)


class SiteAllowlist(unittest.TestCase):
    def test_only_the_targets_own_site_may_appear(self):
        own = {'a.json': b'{"siteUrl":"https://fabrikam.sharepoint.com/sites/Marketing"}', 'b.txt': b'no hosts at all'}
        self.assertEqual(T.site_violations(OTHER, own), [])
        for data in [b'https://contoso.sharepoint.com/sites/AICoE', b'https://fabrikam.sharepoint.com/sites/Other',
                     b'https://other.sharepoint.com', b'"https://FABRIKAM-my.sharepoint.com/personal/x"']:
            with self.subTest(data=data):
                self.assertTrue(T.site_violations(OTHER, {'x': data}))


class TargetBuild(unittest.TestCase):
    def test_target_build_renders_helper_only_and_keeps_flow_identical(self):
        import build
        with tempfile.TemporaryDirectory() as d:
            default_manifest = build.build(Path(d) / 'default', T.DEFAULT)
            other_manifest = build.build(Path(d) / 'other', OTHER)
            self.assertEqual(default_manifest['target'], {'site': T.DEFAULT['site'], 'workIdPrefix': 'AICOE'})
            self.assertEqual(other_manifest['target'], {'site': OTHER['site'], 'workIdPrefix': 'FABRIKAM'})
            flow_a = (Path(d) / 'default' / build.NAME).read_bytes()
            flow_b = (Path(d) / 'other' / build.NAME).read_bytes()
            self.assertEqual(flow_a, flow_b, 'The OFF flow solution is target-independent')
            with zipfile.ZipFile(io.BytesIO((Path(d) / 'other' / build.HELPER_NAME).read_bytes())) as z:
                self.assertEqual(z.read('Script.cs'), T.render_script(OTHER))
                self.assertEqual(z.read('Script.csx'), T.render_script(OTHER))
            self.assertEqual((Path(d) / 'other/provisioning/controlled-inputs.schema.json').read_bytes(), T.render_controlled_inputs(OTHER))

    def test_non_default_target_never_overwrites_committed_out(self):
        import build
        with self.assertRaises(ValueError):
            build.build(ROOT / 'out', OTHER)


class ReferenceVectors(unittest.TestCase):
    def test_reference_vectors_are_captured_for_the_default_target(self):
        # The helper tests run the vectors against the committed (default-target) script, so a recapture must keep
        # the default Work ID prefix.
        vectors = json.loads((ROOT / 'evidence/integration/node-reference-vectors.json').read_text())['cases']
        work = next(c for c in vectors if c['name'] == 'authorized work list')['expectedValue']
        self.assertTrue(work and all(w.startswith(T.DEFAULT['work_id_prefix'] + '-') for w in work))


if __name__ == '__main__':
    unittest.main()
