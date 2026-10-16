"""Build target: the SharePoint site and the WorkID prefix a CORE build is bound to.

A build reads them from a local target JSON file (`build.py --target-file PATH`) holding
{"site": "https://<host>.sharepoint.com/sites/<name>", "work_id_prefix": "<A-Z0-9, 2-16 chars>"} and, optionally,
"arb_owner_note": the Note text of the Authority_ARB configuration row (who owns the ARB authority path); without it
the neutral DEFAULT_ARB_OWNER_NOTE is used. No other key is accepted.
Without a file the neutral placeholder target DEFAULT is used. Real target files stay outside this repository.

The committed connector/Script.cs, upstream/routing-policy.yaml and contract/routing-policy.json are the renderings
for DEFAULT. Another target re-renders only the anchored sites listed below; every anchor must occur exactly once
or the build fails closed. The routing-policy id is '<prefix>-POLICY-1', and the PolicySourceHash bound into the
connector and the configuration seed is the SHA-256 of the rendered policy YAML.
"""
from __future__ import annotations
import hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = {"site": "https://contoso.sharepoint.com/sites/AICoE", "work_id_prefix": "AICOE"}
SITE_RE = re.compile(r"https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.sharepoint\.com/sites/[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?")
PREFIX_RE = re.compile(r"[A-Z][A-Z0-9]{1,15}")
DEFAULT_ARB_OWNER_NOTE = "ARB owner principal (designated ARB owner path). Blank => gate cannot pass. ARB integration is NOT in MVP."
# One printable line; no '@' (a flow string starting with '@' or holding '@{' would become a Power Automate expression).
NOTE_RE = re.compile(r"[^\x00-\x1f\x7f@]{1,500}")
SCRIPT = ROOT / "connector" / "Script.cs"
POLICY_YAML = ROOT / "upstream" / "routing-policy.yaml"
POLICY_JSON = ROOT / "contract" / "routing-policy.json"

# Anchored substitution sites. @PREFIX@ = work_id_prefix, @POLICY@ = SHA-256 of the rendered policy YAML.
SCRIPT_SITES = [
    'Regex.IsMatch(work,"^@PREFIX@-[A-Za-z0-9_-]+$")',   # WorkID accepted on requests
    'wid="@PREFIX@-"+Hash(',                              # WorkID created by the connector
    '(string)cfg["PolicySourceHash"]=="@POLICY@"',        # routing-policy source binding
]
POLICY_YAML_SITES = ["\n  id: @PREFIX@-POLICY-1\n"]
POLICY_JSON_SITES = ['\n    "id": "@PREFIX@-POLICY-1",\n']


def validate(value) -> dict:
    if not isinstance(value, dict) or not {"site", "work_id_prefix"} <= set(value) <= {"site", "work_id_prefix", "arb_owner_note"}:
        raise ValueError("A target file must hold the keys 'site' and 'work_id_prefix' and optionally 'arb_owner_note', nothing else")
    site, prefix = value["site"], value["work_id_prefix"]
    if not isinstance(site, str) or not SITE_RE.fullmatch(site):
        raise ValueError("site must be https://<host>.sharepoint.com/sites/<name> with no trailing slash")
    if not isinstance(prefix, str) or not PREFIX_RE.fullmatch(prefix):
        raise ValueError("work_id_prefix must be 2-16 upper-case letters/digits starting with a letter")
    out = {"site": site, "work_id_prefix": prefix}
    if "arb_owner_note" in value:
        note = value["arb_owner_note"]
        if not isinstance(note, str) or not note.strip() or not NOTE_RE.fullmatch(note):
            raise ValueError("arb_owner_note must be one non-blank line of at most 500 printable characters without '@'")
        out["arb_owner_note"] = note
    return out


def arb_owner_note(target: dict) -> str:
    """Note text of the Authority_ARB configuration row: the target's arb_owner_note, else the neutral default."""
    return target.get("arb_owner_note", DEFAULT_ARB_OWNER_NOTE)


def load(path=None) -> dict:
    if path is None:
        return dict(DEFAULT)
    return validate(json.loads(Path(path).read_text(encoding="utf-8")))


def host(target: dict) -> str:
    return target["site"].split("/")[2]


def policy_id(target: dict) -> str:
    return f"{target['work_id_prefix']}-POLICY-1"


def _fill(template: str, prefix: str, policy: str = "") -> bytes:
    return template.replace("@PREFIX@", prefix).replace("@POLICY@", policy).encode("utf-8")


def _render(data: bytes, sites, target: dict, policy_default: str = "", policy_target: str = "") -> bytes:
    for template in sites:
        old = _fill(template, DEFAULT["work_id_prefix"], policy_default)
        if data.count(old) != 1:
            raise ValueError(f"substitution anchor not found exactly once: {template}")
        data = data.replace(old, _fill(template, target["work_id_prefix"], policy_target))
    return data


def render_policy_yaml(target: dict) -> bytes:
    return _render(POLICY_YAML.read_bytes(), POLICY_YAML_SITES, validate(target))


def render_policy_json(target: dict) -> bytes:
    return _render(POLICY_JSON.read_bytes(), POLICY_JSON_SITES, validate(target))


def policy_sha256(target: dict) -> str:
    return hashlib.sha256(render_policy_yaml(target)).hexdigest()


def render_script(target: dict) -> bytes:
    """Exact connector Script.cs bytes for the target (the committed file for DEFAULT)."""
    return _render(SCRIPT.read_bytes(), SCRIPT_SITES, validate(target), policy_sha256(DEFAULT), policy_sha256(target))
