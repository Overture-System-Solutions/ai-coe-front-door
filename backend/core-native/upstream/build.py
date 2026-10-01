#!/usr/bin/env python3
"""Build AICoECoreAutomation 3.0.0.0: two solution zips, individual flow definitions, model + seed exports, evidence."""
from __future__ import annotations
import hashlib, json, subprocess, sys
from pathlib import Path

import model as M, flows, package, validate

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"; OUT.mkdir(exist_ok=True)
(OUT / "flow-definitions").mkdir(exist_ok=True); (OUT / "flow-definitions-literal-fallback").mkdir(exist_ok=True)
LIT = {"site": M.DEFAULT_SITE, "mail": "REPLACE-BEFORE-ENABLING.invalid", "label": "Pilot"}

evidence = {"solution": M.SOLUTION_UNIQUE, "version": M.SOLUTION_VERSION, "release_binding": M.RELEASE, "policy_version": M.POLICY_VERSION, "gates_version": M.GATES_VERSION, "flows": [], "packages": {}, "validation": {}}
for literal in (False, True):
    fl = [fn(literal=LIT if literal else None) for fn in flows.ALL_FLOWS]
    errs = {f.name: validate.validate(f.definition(), f.name, literal) for f in fl}
    assert not any(errs.values()), errs
    zip_bytes, files = package.build_zip(fl, literal)
    name = f"{M.SOLUTION_UNIQUE}_{M.SOLUTION_VERSION.replace('.', '_')}" + ("_literal-fallback" if literal else "") + ".zip"
    (OUT / name).write_bytes(zip_bytes)
    evidence["packages"][name] = {"sha256": hashlib.sha256(zip_bytes).hexdigest(), "bytes": len(zip_bytes), "members": sorted(files)}
    d = OUT / ("flow-definitions-literal-fallback" if literal else "flow-definitions")
    for f in fl:
        p = d / f"{package.safe_name(f.name)}.json"; p.write_text(json.dumps(f.definition(), indent=2) + "\n")
        if not literal:
            def count(acts):
                n = 0
                for a in acts.values():
                    n += 1
                    if "actions" in a: n += count(a["actions"])
                    if "else" in a: n += count(a["else"]["actions"])
                    if "cases" in a:
                        for c in a["cases"].values(): n += count(c["actions"])
                        n += count(a["default"]["actions"])
                return n
            evidence["flows"].append({"name": f.name, "workflow_id": f.guid, "trigger": f.trigger["type"] + (f" {f.trigger['recurrence']['interval']} {f.trigger['recurrence']['frequency']}" if f.trigger["type"] == "Recurrence" else " (manual)"),
                                      "actions": count(f.definition()["properties"]["definition"]["actions"]), "ships": "OFF (StateCode 0)", "connectors": ["SharePoint"] + (["Office 365 Outlook"] if f.uses_mail else []),
                                      "definition_sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
    evidence["validation"]["literal" if literal else "primary"] = {k: "PASS" for k in errs}

# model + seed exports for reviewers / PnP fallback
model_doc = {k: {"title": v[0], "template": v[1], "title_means": v[2], "columns": [{"name": c[0], "type": c[1], **{kk: vv for kk, vv in c[2].items()}} for c in v[3]]} for k, v in M.LISTS.items()}
(OUT / "data-model.json").write_text(json.dumps(model_doc, indent=1) + "\n")
(OUT / "definitions-seed.json").write_text(json.dumps([{"Key": k, "Value": v, "Category": c, "Provisional": p, "Note": n} for k, v, c, p, n in M.seed_config()] + [{"Key": "EmployeeStatusMap", "Value": json.dumps(M.EMPLOYEE_STATUS), "Category": "Policy", "Provisional": False, "Note": "State -> employee wording"}], indent=1) + "\n")
evidence["data_model"] = {"lists": len(M.LISTS), "columns": sum(len(v[3]) for v in M.LISTS.values()), "definitions_seed_keys": len(M.seed_config()) + 1, "environment_variables": [e[0] for e in M.ENV_VARS]}
# golden
subprocess.run([sys.executable, str(HERE / "reference.py")], check=True, env={"OUT": str(OUT), "PATH": "/usr/bin:/bin", "RC2_ROOT": str(HERE.parent / "rc2")}, capture_output=True)
g = json.loads((OUT / "golden-assertions.json").read_text())
evidence["golden"] = {"cases": len(g["cases"]), "pass": sum(1 for c in g["cases"] if c["result"] == "PASS"), "records": g["records"]}
evidence["not_claimed"] = ["import into any Power Platform environment", "any tenant list, row, permission or file", "runtime execution of any flow", "human UAT acceptance", "reconciliation with Brian's flows", "ARB integration", "any send/notification"]
(OUT / "build-evidence.json").write_text(json.dumps(evidence, indent=1) + "\n")
print(json.dumps({k: evidence[k] for k in ("packages", "data_model", "golden")}, indent=1))
for f in evidence["flows"]: print(f"  {f['name']:38s} {f['trigger']:22s} {f['actions']:4d} actions  {f['ships']}")
