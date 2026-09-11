"""Extract S181 without executing it. Refuse overwrite and unsafe ZIP members."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import xml.etree.ElementTree as ET
import zipfile


def extract(package, output):
    data = package.read_bytes()
    with zipfile.ZipFile(package) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive CRC check failed")
        names = set()
        for member in archive.infolist():
            path = PurePosixPath(member.filename)
            if (path.is_absolute() or ".." in path.parts or "\\" in member.filename
                    or ":" in member.filename or not path.parts
                    or stat.S_ISLNK(member.external_attr >> 16)):
                raise ValueError("Unsafe ZIP member")
            if member.filename.casefold() in names:
                raise ValueError("Duplicate ZIP member")
            names.add(member.filename.casefold())
        manifest = ET.fromstring(archive.read("AppManifest.xml"))
        report = {
            "source_id": "S181",
            "package_name": package.name,
            "package_sha256": hashlib.sha256(data).hexdigest(),
            "package_bytes": len(data),
            "version": manifest.attrib["Version"],
            "product_id": manifest.attrib["ProductID"],
            "archive_entry_count": len(archive.infolist()),
            "files": [],
            "directories": [],
            "source_map_files": [],
            "original_source_candidates": [],
        }
        # mkdir without exist_ok prevents accidental destruction on repeat runs.
        output.mkdir(parents=True, exist_ok=False)
        for member in archive.infolist():
            target = output / "package" / member.filename
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                report["directories"].append(member.filename)
                continue
            content = archive.read(member)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            report["files"].append({"path": member.filename, "bytes": len(content),
                                    "sha256": hashlib.sha256(content).hexdigest()})
            if target.suffix == ".map":
                report["source_map_files"].append(member.filename)
            if target.suffix in (".ts", ".tsx", ".jsx", ".scss", ".sass"):
                report["original_source_candidates"].append(member.filename)
        report["file_count"] = len(report["files"])
        (output / "inventory.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": "EXTRACTED", "files": report["file_count"],
                          "version": report["version"], "package_sha256": report["package_sha256"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    extract(args.package, args.out)
