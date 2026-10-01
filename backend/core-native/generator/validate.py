"""
Structural validator for the generated cloud flows (the 2.1 verification standard, re-applied):
  V1 every definition parses and every action has a type
  V2 action names unique across the whole definition
  V3 every runAfter key resolves to a sibling in the same block (or is empty for a block's first action)
  V4 every outputs()/body()/actionOutputs()/result()/actions() reference resolves to an action that exists;
     every items('X') / iterationIndexes resolves to an enclosing Foreach named X
  V5 every parameters('X') is a declared definition parameter
  V6 every list column written (item keys) or filtered/selected exists in the data model for that list
  V7 every outputs('Cfg')?['Key'] is a seeded Definitions key (or ListId_* / EmployeeStatusMap)
  V8 every flow with mutating loops has a failure handler (an action with runAfter on Failed)
  V9 no reference to the OSS lab tenant (osscontact) survives; no hard-coded parkplace URL in the primary package
  V10 no expression contains an obviously unbalanced parenthesis
"""
from __future__ import annotations
import json, re, sys

import model as M

REF_RE = re.compile(r"(outputs|body|actionOutputs|result|actions|items)\('([^']+)'\)")
PARAM_RE = re.compile(r"parameters\('([^']+)'\)")
CFG_RE = re.compile(r"outputs\('Cfg'\)\?\['([A-Za-z0-9_]+)'\]")
LIST_BY_CFG = re.compile(r"@outputs\('Cfg'\)\?\['ListId_([A-Za-z]+)'\]")
FILTER_FIELD_RE = re.compile(r"(?<![A-Za-z_'])([A-Za-z][A-Za-z0-9_]*)\s+(eq|ne|gt|lt|ge|le)\b")
TITLE_TO_KEY = {v[0]: k for k, v in M.LISTS.items()}
SYSTEM_COLS = {"Title", "ID", "Id", "Created", "Modified", "Author", "Editor", "Claims", "Email"}
SEED_KEYS = {k for k, *_ in M.seed_config()} | {f"ListId_{k}" for k in M.LISTS} | {"EmployeeStatusMap"}


def walk(actions: dict, ancestors: tuple = (), block_path: str = ""):
    """yield (name, action, ancestor_foreach_names, sibling_names, block_path)"""
    sibs = set(actions)
    for name, a in actions.items():
        yield name, a, ancestors, sibs, block_path
        anc = ancestors + ((name,) if a.get("type") == "Foreach" else ())
        if "actions" in a: yield from walk(a["actions"], anc, block_path + name + "/")
        if "else" in a: yield from walk(a["else"]["actions"], anc, block_path + name + "/else/")
        if "cases" in a:
            for c in a["cases"].values(): yield from walk(c["actions"], anc, block_path + name + "/" + str(c["case"]) + "/")
            yield from walk(a["default"]["actions"], anc, block_path + name + "/default/")


def strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, dict):
        for k, v in o.items(): yield k; yield from strings(v)
    elif isinstance(o, list):
        for v in o: yield from strings(v)


def columns_for(table_expr: str) -> set[str] | None:
    m = LIST_BY_CFG.match(table_expr or "")
    key = m.group(1) if m else TITLE_TO_KEY.get(table_expr)
    if key is None: return None
    return {c[0] for c in M.LISTS[key][3]} | SYSTEM_COLS


def validate(defn: dict, flow_name: str, literal: bool) -> list[str]:
    errs = []
    d = defn["properties"]["definition"]
    params = set(d["parameters"])
    all_actions = list(walk(d["actions"]))
    names = [n for n, *_ in all_actions]
    dup = {n for n in names if names.count(n) > 1}
    if dup: errs.append(f"V2 duplicate action names: {sorted(dup)}")
    name_set = set(names) | {"Trigger"}
    text = json.dumps(defn)
    for n, a, anc, sibs, path in all_actions:
        if "type" not in a: errs.append(f"V1 {path}{n} has no type")
        for k in a.get("runAfter", {}):
            if k not in sibs: errs.append(f"V3 {path}{n} runAfter '{k}' is not a sibling")
        for s in strings({k: v for k, v in a.items() if k not in ("runAfter", "actions", "else", "cases", "default")}):
            for fn, ref in REF_RE.findall(s):
                if fn == "items":
                    if ref not in anc: errs.append(f"V4 {path}{n}: items('{ref}') has no enclosing Foreach")
                elif ref not in name_set: errs.append(f"V4 {path}{n}: {fn}('{ref}') does not exist")
            for pr in PARAM_RE.findall(s):
                if pr not in params: errs.append(f"V5 {path}{n}: parameters('{pr}') not declared")
            for key in CFG_RE.findall(s):
                if key not in SEED_KEYS: errs.append(f"V7 {path}{n}: Cfg key '{key}' is not seeded")
            if s.count("(") != s.count(")") and s.startswith("@"): errs.append(f"V10 {path}{n}: unbalanced parentheses in expression: {s[:80]}")
        # V6 columns
        if a.get("type") == "OpenApiConnection":
            p = a["inputs"].get("parameters", {})
            cols = columns_for(p.get("table", ""))
            if cols is not None:
                for col in (p.get("item") or {}):
                    if col not in cols: errs.append(f"V6 {path}{n}: column '{col}' not in model for {p.get('table')}")
                for fld, _ in FILTER_FIELD_RE.findall(p.get("$filter", "") if isinstance(p.get("$filter"), str) else ""):
                    if fld not in cols and fld not in {"eq", "and", "or", "not", "null"}: errs.append(f"V6 {path}{n}: filter field '{fld}' not in model for {p.get('table')}")
    mutating = any(a.get("type") == "OpenApiConnection" and a["inputs"]["host"]["operationId"] in {"PostItem", "PatchItem", "HttpRequest"} for _, a, *_ in all_actions)
    has_handler = any(any("Failed" in v for v in a.get("runAfter", {}).values()) for _, a, *_ in all_actions)
    if mutating and not has_handler: errs.append("V8 mutating flow without a failure handler")
    if "osscontact" in text.lower(): errs.append("V9 lab tenant reference survives")
    if not literal and "parkplace.sharepoint.com" in text.replace(M.DEFAULT_SITE, ""): errs.append("V9 hard-coded site URL outside the env-var default")
    return errs


def main():
    import flows
    total = 0
    for literal in (False, True):
        lit = {"site": M.DEFAULT_SITE, "mail": "REPLACE-BEFORE-ENABLING.invalid", "label": "Pilot"} if literal else None
        for fn in flows.ALL_FLOWS:
            f = fn(literal=lit); e = validate(f.definition(), f.name, literal)
            total += len(e)
            tag = "literal " if literal else "primary "
            print(f"{'PASS' if not e else 'FAIL'} {tag}{f.name}" + ("" if not e else "\n   " + "\n   ".join(e[:12])))
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
