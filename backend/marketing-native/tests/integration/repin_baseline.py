#!/usr/bin/env python3
"""Re-pin evidence/baseline.json after reviewed, intentional changes to protected files made outside this lane.

The baseline protects the frontend, CORE and Node files from accidental change by Marketing work; verify_release.py
refuses any drift. Run this only after the owning lane's change is reviewed, with a reason. It records the count of
re-pinned files and every path that no longer exists; the previous pins remain in git history.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT.parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reason', required=True)
    args = parser.parse_args()
    path = ROOT / 'evidence/baseline.json'
    data = json.loads(path.read_text())
    changed, removed = [], []
    for rel, old in list(data['files'].items()):
        file = APP / rel
        if not file.is_file():
            removed.append(rel)
            del data['files'][rel]
            continue
        new = hashlib.sha256(file.read_bytes()).hexdigest()
        if new != old:
            changed.append(rel)
            data['files'][rel] = new
    data.setdefault('repins', []).append({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'reason': args.reason,
                                          'repinnedFiles': len(changed), 'removedFiles': removed,
                                          'previousPins': 'git history of backend/marketing-native/evidence/baseline.json'})
    path.write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps({'repinnedFiles': len(changed), 'removedFiles': removed, 'protectedFiles': len(data['files'])}, indent=2))


if __name__ == '__main__':
    main()
