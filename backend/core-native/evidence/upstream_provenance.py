#!/usr/bin/env python3
"""Provenance of the neutral upstream copies (seven original generator modules + the routing-policy source).

The original upstream bytes named a client tenant: its SharePoint site and host, its WorkID prefix, and staff names
in one configuration note. The repository keeps neutral copies instead. evidence/source-pins.json keeps, per file,
the original's historical SHA-256 and size, the neutral copy's SHA-256 and size, and the exact line edits:

    {"line": <1-based line in the neutral copy>, "neutral": <that line>, "original": <original line template | null>}

"original": null marks a line the neutralization inserted. Templates hold only placeholders, never client values:
{{target.site}} target site, {{target.host}} its host, {{target.tenant}} the host's first label, {{target.prefix}}
WorkID prefix, {{target.prefix_lower}} its lower case, {{redacted:R<n>}} a span whose original text is not recorded in
this repository.

Restoring an original therefore needs the client's local target file (outside the repository) and, for redacted
spans, the original text. A redacted span is read, in order of precedence, from --redaction R1=TEXT, from an original
copy (--original-dir), or from the target file itself: R1 (the staff names in the Authority_ARB note) is read from the
target's optional "arb_owner_note" when that note fits the recorded template. Nothing is ever guessed.

    python evidence/upstream_provenance.py --target-file <local target.json> [--original-dir DIR] [--out DIR]

Prints, per file, whether the restored bytes match the historical SHA-256 pin. Never writes into the repository.
"""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER = re.compile(r"\{\{(target\.(?:site|host|tenant|prefix|prefix_lower)|redacted:R\d+)\}\}")
REDACTED = re.compile(r"\{\{redacted:(R\d+)\}\}")


def values(target: dict, redactions: dict | None = None) -> dict:
    site, prefix = target["site"], target["work_id_prefix"]
    host = site.split("/")[2]
    out = {"target.site": site, "target.host": host, "target.tenant": host.split(".")[0],
           "target.prefix": prefix, "target.prefix_lower": prefix.lower()}
    out.update({"redacted:" + k: v for k, v in (redactions or {}).items()})
    return out


def fill(template: str, vals: dict) -> str:
    return PLACEHOLDER.sub(lambda m: vals.get(m.group(1), m.group(0)), template)


def _edits_by_line(edits) -> dict:
    by_line = {e["line"]: e for e in edits}
    if len(by_line) != len(edits): raise ValueError("duplicate edit line")
    return by_line


def restore(neutral_text: str, edits, vals: dict) -> str:
    """Original text from the neutral copy (unresolved placeholders stay visible as {{name}})."""
    by_line = _edits_by_line(edits)
    out = []
    for i, line in enumerate(neutral_text.split("\n"), 1):
        e = by_line.get(i)
        if e is None: out.append(line); continue
        if line != e["neutral"]: raise ValueError(f"line {i} is not the recorded neutral line")
        if e["original"] is not None: out.append(fill(e["original"], vals))
    return "\n".join(out)


def neutralize(original_text: str, edits, vals: dict) -> str:
    """Inverse of restore(): the neutral copy from an original text and the same values."""
    by_line = _edits_by_line(edits)
    src = original_text.split("\n")
    inserted = sum(1 for e in edits if e["original"] is None)
    out, j = [], 0
    for i in range(1, len(src) + inserted + 1):
        e = by_line.get(i)
        if e is not None and e["original"] is None: out.append(e["neutral"]); continue
        if j >= len(src): raise ValueError("original text shorter than recorded")
        if e is not None:
            if src[j] != fill(e["original"], vals): raise ValueError(f"original line {j + 1} does not match its template")
            out.append(e["neutral"])
        else:
            out.append(src[j])
        j += 1
    if j != len(src): raise ValueError("original text longer than recorded")
    return "\n".join(out)


def redactions_from_original(original_text: str, edits, vals: dict) -> dict:
    """Read redacted spans from an original copy by matching each template (other placeholders filled)."""
    found = {}
    src = original_text.split("\n")
    offset = 0  # original line index = neutral line - 1 - inserted lines before it
    for e in sorted(edits, key=lambda x: x["line"]):
        if e["original"] is None: offset += 1; continue
        if not REDACTED.search(e["original"]): continue
        pieces = []
        texts, names = REDACTED.split(e["original"])[0::2], REDACTED.findall(e["original"])
        for k, text in enumerate(texts):
            if text: pieces.append(re.escape(fill(text, vals)))
            if k < len(names): pieces.append(f"(?P<{names[k]}>.+?)")
        m = re.fullmatch("".join(pieces), src[e["line"] - 1 - offset])
        if not m: raise ValueError(f"redacted line {e['line']} does not match the original copy")
        found.update(m.groupdict())
    return found


def redactions_from_target(edits, target: dict, vals: dict | None = None) -> dict:
    """Redacted spans of lines the target renders: a neutral line holding the neutral Authority_ARB note is rendered
    with the target's arb_owner_note, then matched against the line's original template. {} when the target has no
    note or its note does not fit the template."""
    import build_target
    note = target.get("arb_owner_note")
    if note is None: return {}
    vals = vals or values(target)
    found = {}
    for e in edits:
        if e["original"] is None or not REDACTED.search(e["original"]) or build_target.DEFAULT_ARB_OWNER_NOTE not in e["neutral"]:
            continue
        pieces = []
        texts, names = REDACTED.split(e["original"])[0::2], REDACTED.findall(e["original"])
        for k, text in enumerate(texts):
            if text: pieces.append(re.escape(fill(text, vals)))
            if k < len(names): pieces.append(f"(?P<{names[k]}>.+?)")
        m = re.fullmatch("".join(pieces), e["neutral"].replace(build_target.DEFAULT_ARB_OWNER_NOTE, note))
        if m: found.update(m.groupdict())
    return found


def entries(pins: dict):
    return [*pins["files"], pins["policy"]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-file", type=Path, required=True)
    ap.add_argument("--redaction", action="append", default=[], help="R<n>=TEXT")
    ap.add_argument("--original-dir", type=Path, help="directory with original copies (redacted spans are read from it)")
    ap.add_argument("--out", type=Path, help="write restored files here (must be outside the repository)")
    args = ap.parse_args()
    sys.path.insert(0, str(ROOT / "generator"))
    import build_target
    target = build_target.load(args.target_file)
    pins = json.loads((ROOT / "evidence/source-pins.json").read_text())
    given = dict(x.split("=", 1) for x in args.redaction)  # {"R1": text}
    if args.out:
        if ROOT.resolve() in [args.out.resolve(), *args.out.resolve().parents]: ap.error("--out must be outside the repository")
        args.out.mkdir(parents=True, exist_ok=True)
    ok = True
    for pin in entries(pins):
        neutral = (ROOT / "upstream" / pin["path"]).read_bytes()
        assert hashlib.sha256(neutral).hexdigest() == pin["neutral"]["sha256"], pin["path"] + " neutral copy changed"
        from_target = redactions_from_target(pin["edits"], target, values(target, given))
        found = {}
        source = None
        if args.original_dir and (args.original_dir / pin["path"]).exists():
            source = (args.original_dir / pin["path"]).read_text(encoding="utf-8")
            found = redactions_from_original(source, pin["edits"], values(target, given))
        vals = values(target, {**from_target, **found, **given})
        restored = restore(neutral.decode("utf-8"), pin["edits"], vals).encode("utf-8")
        digest = hashlib.sha256(restored).hexdigest()
        missing = sorted(set(PLACEHOLDER.findall(restored.decode("utf-8"))))
        match = digest == pin["sha256"] and len(restored) == pin["bytes"]
        ok &= match
        report = {"path": pin["path"], "edits": len(pin["edits"]), "restoredSha256": digest, "historicalSha256": pin["sha256"],
                  "matchesHistoricalPin": match, "unresolvedPlaceholders": missing,
                  "redactionsReadFromOriginalCopy": sorted(set(found) - set(given)),
                  "redactionsReadFromTarget": sorted(set(from_target) - set(found) - set(given))}
        if source is not None: report["originalCopyMatchesPin"] = hashlib.sha256(source.encode("utf-8")).hexdigest() == pin["sha256"]
        print(json.dumps(report))
        if args.out: (args.out / pin["path"]).write_bytes(restored)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
