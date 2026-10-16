#!/usr/bin/env python3
"""Recompute evidence/final-handoff-check.json from the current handoff documents, packages and test receipt.

Run after the last edit of README.md / HANDOFF.md / evidence/RESUMPTION.md / evidence/IMPLEMENTATION_NOTES.md,
after pytest wrote evidence/final-tests.xml and after verify_delivery.py:

    python evidence/write_handoff_check.py

Records: the F01-F12 finding IDs of HANDOFF.md's disposition table; whether every current package
(out/*.zip, out/pac-roundtrip/*.zip) appears in HANDOFF.md's SHA-256 table with its exact size and hash; the
SHA-256 of the four handoff documents; the test totals of evidence/final-tests.xml; the SHA-256 of
connector/Script.cs. Writes the file in every case and exits 1 when a check fails.
"""
from __future__ import annotations
import hashlib, json, re, sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ["README.md", "HANDOFF.md", "evidence/RESUMPTION.md", "evidence/IMPLEMENTATION_NOTES.md"]
FINDINGS = [f"F{i:02d}" for i in range(1, 13)]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    handoff = (ROOT / "HANDOFF.md").read_text(encoding="utf-8")
    found = re.findall(r"^\| (F\d\d) \|", handoff, re.M)
    packages = sorted([*(ROOT / "out").glob("*.zip"), *(ROOT / "out/pac-roundtrip").glob("*.zip")])
    missing = [str(p.relative_to(ROOT)) for p in packages
               if f"| `{p.relative_to(ROOT).as_posix()}` | {p.stat().st_size} | `{sha(p)}` |" not in handoff]
    totals = {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
    root = ET.parse(ROOT / "evidence/final-tests.xml").getroot()
    for suite in ([root] if root.tag == "testsuite" else root.findall("testsuite")):
        for key in totals: totals[key] += int(suite.get(key, 0))
    check = {
        "findingIds": found,
        "allCurrentPackageHashesInHandoff": bool(packages) and not missing,
        "documentHashes": {name: sha(ROOT / name) for name in DOCS},
        "tests": totals,
        "scriptSha256": sha(ROOT / "connector/Script.cs"),
    }
    (ROOT / "evidence/final-handoff-check.json").write_text(json.dumps(check, indent=2) + "\n", encoding="utf-8")
    problems = []
    if found != FINDINGS: problems.append(f"finding table rows {found} != {FINDINGS}")
    if missing: problems.append(f"packages missing from HANDOFF.md SHA-256 table: {missing}")
    if not totals["tests"] or totals["failures"] or totals["errors"] or totals["skipped"]: problems.append(f"test receipt {totals}")
    print(json.dumps({**check, "packagesChecked": len(packages), "problems": problems}, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
