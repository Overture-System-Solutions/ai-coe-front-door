"""Build target: the SharePoint site and the Work ID prefix a Marketing build is bound to.

Same target file and rules as backend/core-native/generator/build_target.py: a local JSON file holding exactly
{"site": "https://<host>.sharepoint.com/sites/<name>", "work_id_prefix": "<A-Z0-9, 2-16 chars>"}.
Without a file the neutral placeholder target DEFAULT is used. Real target files stay outside this repository.

The committed connector/parts/00_Core.cs (and the assembled connector/Script.cs and Script.csx) and
provisioning/controlled-inputs.schema.json are the renderings for DEFAULT. Another target re-renders only the anchored
sites below; every anchor must occur exactly once or the build fails closed.
- Prefix: the canonical Work ID pattern the helper accepts and the pattern operator member records must use.
- Site: an allowlist. Neither package may name a SharePoint host or site other than the target's own.
Workflow, helper and connection identities never depend on the target.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = {"site": "https://contoso.sharepoint.com/sites/AICoE", "work_id_prefix": "AICOE"}
SITE_RE = re.compile(r"https://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.sharepoint\.com/sites/[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?")
PREFIX_RE = re.compile(r"[A-Z][A-Z0-9]{1,15}")
SCRIPT = ROOT / "connector" / "Script.cs"
CONTROLLED_INPUTS = ROOT / "provisioning" / "controlled-inputs.schema.json"
SHAREPOINT_URL = re.compile(rb"https?://([A-Za-z0-9.-]*\.sharepoint\.com)(/sites/[A-Za-z0-9_.-]+)?", re.I)

# Anchored substitution sites. @PREFIX@ = work_id_prefix.
SCRIPT_SITES = ['Match(S(t),"^@PREFIX@-[A-Z0-9][A-Z0-9_-]{2,79}$")']        # Work ID accepted by the helper
CONTROLLED_INPUT_SITES = ['"pattern": "^@PREFIX@-[A-Z0-9_-]{2,124}$"']     # Work IDs on operator member records


def validate(value) -> dict:
    if not isinstance(value, dict) or set(value) != {"site", "work_id_prefix"}:
        raise ValueError("A target file must hold exactly the keys 'site' and 'work_id_prefix'")
    site, prefix = value["site"], value["work_id_prefix"]
    if not isinstance(site, str) or not SITE_RE.fullmatch(site):
        raise ValueError("site must be https://<host>.sharepoint.com/sites/<name> with no trailing slash")
    if not isinstance(prefix, str) or not PREFIX_RE.fullmatch(prefix):
        raise ValueError("work_id_prefix must be 2-16 upper-case letters/digits starting with a letter")
    return {"site": site, "work_id_prefix": prefix}


def load(path=None) -> dict:
    if path is None:
        return dict(DEFAULT)
    return validate(json.loads(Path(path).read_text(encoding="utf-8")))


def host(target: dict) -> str:
    return target["site"].split("/")[2]


def _render(data: bytes, sites, target: dict, source: dict) -> bytes:
    target, source = validate(target), validate(source)
    for template in sites:
        old = template.replace("@PREFIX@", source["work_id_prefix"]).encode("utf-8")
        if data.count(old) != 1:
            raise ValueError(f"substitution anchor not found exactly once: {template}")
        data = data.replace(old, template.replace("@PREFIX@", target["work_id_prefix"]).encode("utf-8"))
    return data


def render_script(target: dict, data: bytes | None = None, source: dict = DEFAULT) -> bytes:
    """Exact helper Script.cs bytes for the target (the committed file for DEFAULT). `data` renders other bytes,
    e.g. a script extracted from a package, that are the rendering for `source`."""
    return _render(SCRIPT.read_bytes() if data is None else data, SCRIPT_SITES, target, source)


def render_controlled_inputs(target: dict) -> bytes:
    return _render(CONTROLLED_INPUTS.read_bytes(), CONTROLLED_INPUT_SITES, target, DEFAULT)


def site_violations(target: dict, payloads: dict) -> list:
    """Allowlist: every SharePoint URL in the payloads must be the target's own host and, if a site path is named,
    the target's own site."""
    target = validate(target)
    own_host, own_site = host(target).lower(), target["site"].lower()
    problems = []
    for name, data in payloads.items():
        for match in SHAREPOINT_URL.finditer(data):
            url_host = match.group(1).decode().lower()
            url = match.group(0).decode().lower()
            if url_host != own_host or (match.group(2) and url.split("://", 1)[1] != own_site.split("://", 1)[1]):
                problems.append(f"{name}: {match.group(0).decode()} is not the target site")
    return problems
