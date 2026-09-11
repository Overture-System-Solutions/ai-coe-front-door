"""Recovery tooling tests; no SharePoint/OpenAI calls."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "original/overture-ai-coe-front-door.sppkg"
SHA256 = "97e5e1e3ff5e6c68188ae9d395ac5763dd8e8342a2b514416e51581d714f6500"

class ExtractionTests(unittest.TestCase):
    def extract(self, package, output):
        return subprocess.run([sys.executable, str(ROOT / "scripts/extract.py"),
                               "--package", str(package), "--out", str(output)],
                              capture_output=True, text=True)

    def test_every_archive_member_is_preserved_byte_for_byte(self):
        self.assertTrue((ROOT / "scripts/extract.py").is_file(), "Extraction tool not implemented")
        self.assertEqual(hashlib.sha256(PACKAGE.read_bytes()).hexdigest(), SHA256)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "recovered"
            result = self.extract(PACKAGE, output)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((output / "inventory.json").read_text())
            with zipfile.ZipFile(PACKAGE) as archive:
                expected = [m for m in archive.infolist() if not m.is_dir()]
                self.assertEqual(len(report["files"]), len(expected))
                for member in expected:
                    self.assertEqual((output / "package" / member.filename).read_bytes(), archive.read(member))
            self.assertEqual(report["package_sha256"], SHA256)
            self.assertEqual(report["version"], "1.0.0.7")
            self.assertEqual(report["source_map_files"], [])

if __name__ == "__main__":
    unittest.main(verbosity=2)
