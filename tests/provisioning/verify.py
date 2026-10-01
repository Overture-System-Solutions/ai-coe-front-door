"""Run only local Windows PowerShell tests, capture real output and source hashes.
Never connects to a tenant. Run from WSL with the existing Windows-owned pwsh.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--phase", required=True)
parser.add_argument("--independent", default="", help="Optional independent case or all")
parser.add_argument("--only-independent", action="store_true")
parser.add_argument("--publish", action="store_true", help="Create final local evidence pointers; no tenant action")
args = parser.parse_args()
if not args.phase or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for c in args.phase):
    parser.error("phase must be a filename-safe identifier")
folder = ROOT / "evidence/provisioning" / args.phase
folder.mkdir(parents=True, exist_ok=False)
paths = sorted((ROOT / "backend/marketing-native/provisioning").rglob("*")) + sorted((ROOT / "tests/provisioning").rglob("*"))
paths += [ROOT / "backend/power-automate/marketing-runtime/provisioning.json"]
hashes = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file() and "__pycache__" not in p.parts}
(folder / "source-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")
pwsh = "/mnt/c/Program Files/PowerShell/7/pwsh.exe"
cases = [] if args.only_independent else [
    ("provisioning", "Run-ProvisioningTests.ps1", ["-Case", "all"]),
    ("bootstrap", "Run-BootstrapTests.ps1", []),
    ("surface", "Check-NativeSurface.ps1", []),
]
if args.independent:
    cases.append(("independent", "Run-IndependentTests.ps1", ["-Case", args.independent]))
results = []
for label, filename, extra in cases:
    path = str(ROOT / "tests/provisioning" / filename)
    win_path = subprocess.check_output(["wslpath", "-w", path], text=True).strip()
    cmd = [pwsh, "-NoProfile", "-NonInteractive", "-File", win_path] + extra
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    clock = time.monotonic()
    try:
        proc = subprocess.run(cmd, cwd="/home/far_cdx", text=True, capture_output=True, timeout=150)
        output, errors, code = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired as exc:
        output = exc.stdout or b""
        errors = exc.stderr or b""
        output = output.decode(errors="replace") if isinstance(output, bytes) else output
        errors = errors.decode(errors="replace") if isinstance(errors, bytes) else errors
        errors += "\nHARNESS: bounded subprocess timed out; not a passing run.\n"
        code = -1
    (folder / f"{label}.stdout.log").write_text(output, encoding="utf-8")
    (folder / f"{label}.stderr.log").write_text(errors, encoding="utf-8")
    summaries = []
    for line in output.splitlines():
        try:
            data = json.loads(line)
            if isinstance(data, dict) and "status" in data:
                summaries.append(data)
        except json.JSONDecodeError:
            pass
    success = code == 0 and len(summaries) == 1 and summaries[0]["status"] == "PASS"
    if success and label != "surface":
        summary = summaries[0]
        success = isinstance(summary.get("checks"), int) and summary["checks"] > 0
        if "cases" in summary:
            success = success and summary["checks"] == len(summary["cases"]) and len({c["name"] for c in summary["cases"]}) == summary["checks"] and all(c["status"] == "PASS" for c in summary["cases"])
    result = {"name": label, "command": cmd, "startedAt": started, "durationSeconds": round(time.monotonic() - clock, 3), "exitCode": code, "passed": success, "summary": summaries[0] if len(summaries) == 1 else None}
    results.append(result)
    print(json.dumps(result))
    if not success:
        print(output)
        print(errors)
unchanged = all(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest for path, digest in hashes.items())
source_key = "backend/power-automate/marketing-runtime/provisioning.json"
copy_key = "backend/marketing-native/provisioning/marketing.v1.lists.json"
schema_match = hashes[source_key] == hashes[copy_key] == "690903876bf650bacaf33436620cf99ef26386a8c44748e9b31cae4df3ad6b25"
schema = json.loads((ROOT / source_key).read_text(encoding="utf-8"))
schema_check = {"byteIdenticalPreservedDescriptor": schema_match, "sha256": hashes[source_key], "listCount": len(schema["lists"]), "declaredFieldCount": sum(len(item["fields"]) for item in schema["lists"])}
report = {"kind": "marketing-provisioning-local-verification.v1", "phase": args.phase, "scope": "Offline process-local fake PnP; local installed command metadata only", "nativeCalls": 0, "tenantApplied": False, "qualified": False, "enabled": False, "sourceHashes": "source-hashes.json", "sourceFileCount": len(hashes), "sourcesUnchangedDuringTests": unchanged, "schema": schema_check, "results": results, "allPassed": bool(results) and all(x["passed"] for x in results) and unchanged and schema_match}
(folder / "verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
if args.publish:
    if not report["allPassed"] or args.only_independent or args.independent != "all" or len(results) != 4:
        raise SystemExit("Refused publishing incomplete/failed local verification")
    report["logsDirectory"] = str(folder.relative_to(ROOT / "evidence/provisioning"))
    report["behaviorCounts"] = {r["name"]: r["summary"]["checks"] for r in results if r["name"] != "surface"}
    report["behaviorCheckExecutions"] = sum(report["behaviorCounts"].values())
    report["countMeaning"] = "Passing grouped behavior-check executions; overlapping scenarios are not unique defects. Metadata surface checks are separate."
    report["nativeGates"] = {name: "UNQUALIFIED / NOT PERFORMED" for name in ["delegatedAuthentication", "controllerAndWriterAuthority", "nativeListsAndACL", "ordinaryBusinessPersonas", "hostedFlowAndHelper", "providerExecution", "approvedSourceAndPolicyRecords", "historicalProjectionRevocation", "retentionLifecycle"]}
    for name, value in [("verification.json", report), ("source-hashes.json", hashes)]:
        with (ROOT / "evidence/provisioning" / name).open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")
    print(json.dumps({"publishedLocalEvidence": True, "counts": report["behaviorCounts"], "behaviorCheckExecutions": report["behaviorCheckExecutions"], "sourceFileCount": len(hashes), "schema": schema_check, "qualified": False}))
sys.exit(0 if report["allPassed"] else 1)
