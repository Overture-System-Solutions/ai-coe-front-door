"""Rename a built solution ZIP from the pilot names to a profile's names, and prove nothing else changed.

retarget() applies an ordered list of exact (old, new) text replacements to every text member and member name.
It refuses a replacement that matches nothing (a stale mapping) and one whose new text is already present (the
rename could not be undone exactly). undoes_to() applies the replacements backwards to the result and requires
the original package back: same members in the same order, same metadata, same bytes. So a retargeted package
differs from the checked pilot-named build only by the listed names.

leftovers() lists pilot, vendor and fixture names that must not remain in a tenant-neutral package. The front
door's own column and choice names that contain "Pilot" (AI CoE Pilot Intakes, PilotMeasure, Submitted - Pilot,
...) are part of its data contract and stay; so does the X-OSS-Flow-Run-ID header (the connector's contract).
"""
import re
import zipfile
from pathlib import Path

BINARY = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.dll')
KEPT_TOKENS = ('X-OSS-Flow-Run-ID',)
LEFTOVER_PATTERNS = [
    ('cwdd', re.compile('cwdd', re.I)),
    ('OSSCloudWave', re.compile('OSSCloudWave')),
    ('OSS CloudWave', re.compile('OSS CloudWave')),
    ('osscontact', re.compile('osscontact', re.I)),
    ('AI CoE Pilot', re.compile(r'AI CoE Pilot(?! Intakes)')),
    ('AICoEPilot', re.compile('AICoEPilot')),
    ('private pilot', re.compile('private pilot', re.I)),
    ('OSS', re.compile(r'\bOSS\b')),
    ('LOCAL FIXTURE', re.compile('LOCAL FIXTURE')),
    ('9d027c49', re.compile('9d027c49', re.I)),   # the pilot's (OSS's) Claude connector ID
]


def _binary(name):
    return name.lower().endswith(BINARY)


def _read(path):
    with zipfile.ZipFile(path) as archive:
        return [(info, archive.read(info)) for info in archive.infolist()]


def _apply(names, texts, mapping, check):
    """Apply mapping to member names and text members in place; check refuses unprovable or stale steps."""
    for old, new in mapping:
        found = sum(n.count(old) for n in names) + sum(t.count(old) for t in texts if t is not None)
        if check:
            if found == 0:
                raise ValueError('rename %r not found in the package' % old)
            # Count the new text only outside the old text's own occurrences (a new name can be part of the old one).
            already = sum(n.replace(old, '\x00').count(new) for n in names) + \
                sum(t.replace(old, '\x00').count(new) for t in texts if t is not None)
            if already:
                raise ValueError('rename %r -> %r: the new text is already in the package' % (old, new))
        names[:] = [n.replace(old, new) for n in names]
        texts[:] = [t.replace(old, new) if t is not None else None for t in texts]


def _split(members):
    names = [info.filename for info, _ in members]
    texts = [None if _binary(info.filename) else data.decode('utf-8') for info, data in members]
    return names, texts


def retarget(source, out, mapping):
    members = _read(source)
    for info, data in members:
        if _binary(info.filename):
            for old, _ in mapping:
                if old.encode('utf-8') in data:
                    raise ValueError('%s: %r inside a binary member' % (info.filename, old))
    names, texts = _split(members)
    _apply(names, texts, mapping, check=True)
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w') as archive:
        for (info, data), name, text in zip(members, names, texts):
            entry = zipfile.ZipInfo(name, info.date_time)
            entry.compress_type = info.compress_type
            entry.external_attr = info.external_attr
            entry.create_system = info.create_system
            archive.writestr(entry, data if text is None else text.encode('utf-8'))
    return out


def undoes_to(retargeted, original, mapping):
    """True when undoing mapping on the retargeted package gives back the original package exactly."""
    members = _read(retargeted)
    names, texts = _split(members)
    _apply(names, texts, [(new, old) for old, new in reversed(mapping)], check=False)
    undone = [((name, info.date_time, info.external_attr, info.compress_type),
               data if text is None else text.encode('utf-8'))
              for (info, data), name, text in zip(members, names, texts)]
    before = [((info.filename, info.date_time, info.external_attr, info.compress_type), data) for info, data in _read(original)]
    return undone == before


def leftovers(text):
    for token in KEPT_TOKENS:
        text = text.replace(token, '')
    return [label for label, pattern in LEFTOVER_PATTERNS if pattern.search(text)]


def package_leftovers(path):
    """Leftover names per member of a package (binary members skipped)."""
    found = {}
    for info, data in _read(path):
        hits = leftovers(info.filename) + ([] if _binary(info.filename) else leftovers(data.decode('utf-8')))
        if hits:
            found[info.filename] = sorted(set(hits))
    return found
