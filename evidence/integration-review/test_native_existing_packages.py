"""Read-only adaptation of test_packaging's rebuilding test.
The production builder is deliberately NOT invoked. Every remaining assertion
from test_review_build_has_current_bytes_no_reference_model_claims is executed
against the existing delivery bytes. This is not builder execution evidence.
"""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2] / 'backend/core-native'


def test_existing_review_packages_have_current_bytes_without_rebuilding():
    output = ROOT / 'out'
    evidence = json.loads((output / 'build-evidence.json').read_text())
    assert evidence['binding']['deployable'] is False
    assert 'golden' not in evidence
    assert len(evidence['packages']) == 3
    for filename, meta in evidence['packages'].items():
        payload = (output / filename).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == meta['sha256']
        with zipfile.ZipFile(output / filename) as archive:
            assert archive.testzip() is None
            if filename.startswith('AICoECoreAutomation_'):
                xml = archive.read('customizations.xml').decode()
                assert 'aicoe_coreintegrity' in xml
                assert 'shared_office365' not in xml
                assert xml.count('<StateCode>0</StateCode>') == 6
            else:
                assert archive.read('Script.cs') == (ROOT / 'connector/Script.cs').read_bytes()
