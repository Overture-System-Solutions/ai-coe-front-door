"""retarget.py: exact, ordered renames inside a solution ZIP, proven by undoing them."""
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

import retarget

TIME = (2026, 10, 15, 0, 0, 0)


def make(members, folder=None):
    folder = Path(folder or tempfile.mkdtemp(prefix='retarget-'))
    path = folder / 'in.zip'
    with zipfile.ZipFile(path, 'w') as archive:
        for name, data, attr in members:
            info = zipfile.ZipInfo(name, TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = attr
            archive.writestr(info, data)
    return path


def read(path):
    with zipfile.ZipFile(path) as archive:
        return [(i.filename, archive.read(i), i.date_time, i.external_attr, i.compress_type) for i in archive.infolist()]


SAMPLE = [
    ('solution.xml', '\ufeff<UniqueName>OldSolution</UniqueName><Ref>cwdd_oldref</Ref>'.encode('utf-8'), 0x20),
    ('Workflows/OldPrefix-ABC.json', b'{"connectionReferenceLogicalName": "cwdd_oldref", "x": "keep OldPrefixed words"}', 0x21),
    ('icon.Png', b'\x89PNG\r\n\x1a\nbinary', 0x20),
]
MAPPING = [('OldSolution', 'NewSolution'), ('cwdd_oldref', 'aicoe_newref'), ('Workflows/OldPrefix-', 'Workflows/New-')]


class Retarget(unittest.TestCase):
    def test_renames_text_and_member_names_and_keeps_metadata(self):
        source = make(SAMPLE)
        out = retarget.retarget(source, source.parent / 'out.zip', MAPPING)
        result = read(out)
        self.assertEqual([r[0] for r in result], ['solution.xml', 'Workflows/New-ABC.json', 'icon.Png'])
        self.assertEqual(result[0][1].decode('utf-8'), '\ufeff<UniqueName>NewSolution</UniqueName><Ref>aicoe_newref</Ref>')
        self.assertEqual(result[1][1], b'{"connectionReferenceLogicalName": "aicoe_newref", "x": "keep OldPrefixed words"}')
        self.assertEqual(result[2][1], SAMPLE[2][1])
        self.assertEqual([r[2:] for r in result], [(TIME, a, zipfile.ZIP_DEFLATED) for _, _, a in SAMPLE])

    def test_undoing_the_renames_gives_back_the_original_exactly(self):
        source = make(SAMPLE)
        out = retarget.retarget(source, source.parent / 'out.zip', MAPPING)
        self.assertTrue(retarget.undoes_to(out, source, MAPPING))
        self.assertFalse(retarget.undoes_to(out, source, MAPPING[:2]))

    def test_refuses_a_new_name_that_is_already_there(self):
        # Undoing would also rewrite the text that was there before, so the rename could not be proven.
        members = [('solution.xml', b'OldSolution and NewSolution', 0)]
        with self.assertRaisesRegex(ValueError, 'already'):
            retarget.retarget(make(members), Path(tempfile.mkdtemp()) / 'out.zip', MAPPING[:1])

    def test_a_new_name_inside_the_old_one_is_not_mistaken_for_one_already_there(self):
        members = [('customizations.xml', b'<JsonFileName>/Workflows/OldPrefixIntake-1.json</JsonFileName>', 0),
                   ('Workflows/OldPrefixIntake-1.json', b'{}', 0)]
        source = make(members)
        mapping = [('Workflows/OldPrefix', 'Workflows/Old')]
        out = retarget.retarget(source, source.parent / 'out.zip', mapping)
        self.assertEqual([r[0] for r in read(out)], ['customizations.xml', 'Workflows/OldIntake-1.json'])
        self.assertTrue(retarget.undoes_to(out, source, mapping))
        with self.assertRaisesRegex(ValueError, 'already'):
            retarget.retarget(make(members + [('x.json', b'Workflows/OldOther', 0)]), source.parent / 'out2.zip', mapping)

    def test_refuses_a_rename_that_matches_nothing(self):
        with self.assertRaisesRegex(ValueError, 'not found'):
            retarget.retarget(make(SAMPLE), Path(tempfile.mkdtemp()) / 'out.zip', MAPPING + [('Missing', 'Gone')])

    def test_refuses_old_text_inside_a_binary_member(self):
        members = SAMPLE[:2] + [('icon.Png', b'\x89PNG cwdd_oldref', 0)]
        with self.assertRaisesRegex(ValueError, 'binary'):
            retarget.retarget(make(members), Path(tempfile.mkdtemp()) / 'out.zip', MAPPING)

    def test_is_deterministic(self):
        source = make(SAMPLE)
        a = retarget.retarget(source, source.parent / 'a.zip', MAPPING)
        b = retarget.retarget(source, source.parent / 'b.zip', MAPPING)
        self.assertEqual(a.read_bytes(), b.read_bytes())


class Leftovers(unittest.TestCase):
    def test_reports_pilot_and_vendor_names_but_not_the_front_doors_own_words(self):
        text = ('AI CoE Pilot Intakes PilotMeasure "Submitted - Pilot" X-OSS-Flow-Run-ID '
                'cwdd_x OSSCloudWaveDemoPublisher AI CoE Pilot — Intake OSS Claude Intake Draft LOCAL FIXTURE ONLY')
        found = retarget.leftovers(text)
        self.assertEqual(found, ['cwdd', 'OSSCloudWave', 'AI CoE Pilot', 'OSS', 'LOCAL FIXTURE'])

    def test_a_clean_template_text_has_none(self):
        self.assertEqual(retarget.leftovers('AI CoE — Intake Processing; AI CoE Pilot Intakes; X-OSS-Flow-Run-ID; aicoe_x'), [])


if __name__ == '__main__':
    unittest.main()
