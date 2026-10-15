"""Tenant neutrality: the build target file, prefix/site propagation, the V9 allowlist and upstream provenance.

Fixtures use the Contoso default and a synthetic Fabrikam target only. Neutrality is checked as an allowlist
(only the build target's own site and prefix may appear), never as a list of client names.
"""
import difflib, hashlib, json, re, subprocess, sys, zipfile
from pathlib import Path
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'evidence'))
import build_target, model, validate, flows, wdl
import upstream_provenance as up

DEFAULT = {'site': 'https://contoso.sharepoint.com/sites/AICoE', 'work_id_prefix': 'AICOE'}
OTHER = {'site': 'https://fabrikam.sharepoint.com/sites/CorePilot', 'work_id_prefix': 'FBK'}
SP_HOST = re.compile(r'(?<![A-Za-z0-9-])([A-Za-z0-9-]+)\.sharepoint\.com', re.I)
SP_SITE = re.compile(r'https://[A-Za-z0-9-]+\.sharepoint\.com/(?:sites|teams)/[A-Za-z0-9_.-]+', re.I)


def build(tmp_path, target=None):
    out = tmp_path / 'out'
    cmd = [sys.executable, str(ROOT / 'generator/build.py'), '--review-unbound', '--out', str(out)]
    if target is not None:
        path = tmp_path / 'target.json'; path.write_text(json.dumps(target)); cmd += ['--target-file', str(path)]
    p = subprocess.run(cmd, text=True, capture_output=True)
    assert p.returncode == 0, p.stdout + p.stderr
    return out


def generated_texts(out):
    """Every generated text: loose output files and every member of every package."""
    for p in sorted(out.rglob('*')):
        if p.suffix == '.zip':
            with zipfile.ZipFile(p) as z:
                for n in z.namelist(): yield f'{p.name}!{n}', z.read(n).decode('utf-8')
        elif p.is_file():
            yield p.name, p.read_text()


def assert_names_only(out, target):
    host = target['site'].split('/')[2]
    hosts, sites = set(), set()
    for _, text in generated_texts(out):
        hosts |= {h.lower() + '.sharepoint.com' for h in SP_HOST.findall(text)}
        sites |= set(SP_SITE.findall(text))
    assert hosts == {host}, hosts
    assert sites == {target['site']}, sites
    with zipfile.ZipFile(out / 'AICoECoreIntegrity_3_0_0_1_REGISTRATION_CANDIDATE.zip') as z:
        script = z.read('Script.cs').decode(); assert z.read('Script.csx') == z.read('Script.cs')
        with zipfile.ZipFile(out / 'AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip') as flows_zip:
            solution = flows_zip.read('solution.xml').decode()
    prefix = target['work_id_prefix']
    assert set(re.findall(r'Regex\.IsMatch\(work,"\^([A-Za-z0-9]+)-', script)) == {prefix}
    assert set(re.findall(r'wid="([A-Za-z0-9]+)-"', script)) == {prefix}
    policy = hashlib.sha256(build_target.render_policy_yaml(target)).hexdigest()
    assert set(re.findall(r'cfg\["PolicySourceHash"\]=="([0-9a-f]{64})"', script)) == {policy}
    seed = {r['Key']: json.loads(r['Value']) for r in json.loads((out / 'definitions-seed.json').read_text())}
    assert seed['PolicySourceHash'] == policy
    evidence = json.loads((out / 'build-evidence.json').read_text())
    assert evidence['target'] == target
    assert evidence['policy'] == {'id': prefix + '-POLICY-1', 'sourceSha256': policy}
    assert evidence['binding']['scriptSha256'] == hashlib.sha256(script.encode()).hexdigest()
    return script, solution


def test_default_build_names_no_site_or_prefix_but_the_neutral_target(tmp_path):
    assert build_target.DEFAULT == DEFAULT and build_target.load(None) == DEFAULT
    script, solution = assert_names_only(build(tmp_path), DEFAULT)
    assert script.encode() == (ROOT / 'connector/Script.cs').read_bytes(), 'committed Script.cs must be the default rendering'
    assert 'Records bound to AICOE 3.4.0-rc2 schemas.' in solution


def test_target_file_drives_site_prefix_policy_script_and_binding(tmp_path):
    script, solution = assert_names_only(build(tmp_path, OTHER), OTHER)
    assert 'Records bound to FBK-AICOE 3.4.0-rc2 schemas.' in solution
    committed = (ROOT / 'connector/Script.cs').read_text()
    changed = [l for l in difflib.ndiff(committed.splitlines(), script.splitlines()) if l[:2] in ('- ', '+ ')]
    assert len(changed) == 6, 'only the WorkID pattern, WorkID creation and policy-hash lines may differ'
    out = tmp_path / 'out'
    with zipfile.ZipFile(out / 'AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY_literal-fallback.zip') as z:
        literal = z.read('Workflows/AICoE01CaseCommand-BBB2F816-2ABE-5216-8FC8-23452056573B.json').decode()
    assert OTHER['site'] in literal
    for name in ['AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip', 'AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY_literal-fallback.zip']:
        with zipfile.ZipFile(out / name) as z:
            guids = sorted(n.split('-', 1)[1][:-5].lower() for n in z.namelist() if n.startswith('Workflows/'))
        assert guids == sorted(wdl.WORKFLOW_IDS.values()), 'a target never changes the preserved workflow identities'


@pytest.mark.parametrize('bad', [
    {'site': DEFAULT['site']},
    {**DEFAULT, 'extra': 1},
    {**DEFAULT, 'site': 'http://contoso.sharepoint.com/sites/AICoE'},
    {**DEFAULT, 'site': 'https://contoso.example.com/sites/AICoE'},
    {**DEFAULT, 'site': 'https://contoso.sharepoint.com/sites/AICoE/'},
    {**DEFAULT, 'work_id_prefix': 'aicoe'},
    {**DEFAULT, 'work_id_prefix': 'AI-COE'},
    {**DEFAULT, 'work_id_prefix': ''},
    ['not', 'an', 'object'],
])
def test_target_file_is_strict(bad):
    with pytest.raises(ValueError):
        build_target.validate(bad)


def test_committed_script_and_policies_are_the_default_rendering():
    assert build_target.render_script(DEFAULT) == (ROOT / 'connector/Script.cs').read_bytes()
    yaml_bytes = (ROOT / 'upstream/routing-policy.yaml').read_bytes()
    json_bytes = (ROOT / 'contract/routing-policy.json').read_bytes()
    assert build_target.render_policy_yaml(DEFAULT) == yaml_bytes
    assert build_target.render_policy_json(DEFAULT) == json_bytes
    assert yaml.safe_load(yaml_bytes) == json.loads(json_bytes), 'contract JSON must transcribe the policy source'
    assert json.loads(json_bytes)['expression_language']['id'] == 'AICOE-POLICY-1'
    assert model.POLICY_SOURCE_HASH == hashlib.sha256(yaml_bytes).hexdigest()
    other = build_target.render_policy_yaml(OTHER)
    assert yaml.safe_load(other)['expression_language']['id'] == 'FBK-POLICY-1'
    assert json.loads(build_target.render_policy_json(OTHER))['expression_language']['id'] == 'FBK-POLICY-1'


def test_v9_allows_only_the_build_targets_own_site():
    for literal in (False, True):
        args = {'site': model.DEFAULT_SITE, 'mail': 'REPLACE-BEFORE-ENABLING.invalid', 'label': 'Pilot'} if literal else None
        d = flows.flow_00(literal=args).definition()
        assert not validate.validate(d, 'AI CoE 00 Provisioning', literal)
        for foreign in [OTHER['site'], 'https://contoso.sharepoint.com/sites/Other', 'fabrikam.sharepoint.com']:
            bad = json.loads(json.dumps(d)); bad['properties']['description'] = 'see ' + foreign
            assert any(e.startswith('V9') for e in validate.validate(bad, 'AI CoE 00 Provisioning', literal)), (literal, foreign)


def test_workflow_identities_are_pinned_not_derived_from_a_tenant_seed():
    assert len(set(wdl.WORKFLOW_IDS.values())) == 6
    assert {f().name: f().guid for f in flows.ALL_FLOWS} == wdl.WORKFLOW_IDS
    with pytest.raises(ValueError):
        wdl.Flow('AI CoE 99 Unknown', 'x', {})
    for name in ['wdl.py', 'flows.py', 'model.py', 'package.py', 'reference.py', 'validate.py']:
        assert 'uuid5' not in (ROOT / 'generator' / name).read_text()


def test_upstream_copies_are_recorded_neutral_renderings_with_historical_pins():
    pins = json.loads((ROOT / 'evidence/source-pins.json').read_text())
    entries = pins['files'] + [pins['policy']]
    assert len(pins['files']) == 7
    values = up.values(OTHER, redactions={r: 'Redacted ' + r for r in pins['redactions']})
    for pin in entries:
        data = (ROOT / 'upstream' / pin['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == pin['neutral']['sha256'] and len(data) == pin['neutral']['bytes'], pin['path']
        assert re.fullmatch(r'[0-9a-f]{64}', pin['sha256']), 'historical pin kept'
        assert (pin['sha256'] != pin['neutral']['sha256']) == bool(pin['edits']), pin['path']
        restored = up.restore(data.decode('utf-8'), pin['edits'], values)
        assert not up.PLACEHOLDER.search(restored), pin['path']
        assert up.neutralize(restored, pin['edits'], values) == data.decode('utf-8'), pin['path']
    assert pins['policy']['sha256'] == '51210529f823b1571e737c40f21a97921e498c60f8e132374171634138ccf736'


# Optional target field arb_owner_note: the Authority_ARB configuration note. Fictional text only.
NEUTRAL_NOTE = 'ARB owner principal (designated ARB owner path). Blank => gate cannot pass. ARB integration is NOT in MVP.'
NOTE = 'ARB owner principal (Fabrikam review board path). Blank => gate cannot pass. ARB integration is NOT in MVP.'


def texts_by_path(out):
    """Every generated text keyed by its path under out (ZIP members as 'zip!member')."""
    found = {}
    for p in sorted(out.rglob('*')):
        rel = p.relative_to(out).as_posix()
        if p.suffix == '.zip':
            with zipfile.ZipFile(p) as z:
                for n in z.namelist(): found[f'{rel}!{n}'] = z.read(n).decode('utf-8')
        elif p.is_file():
            found[rel] = p.read_text()
    return found


def seed_notes(out):
    return {r['Key']: r['Note'] for r in json.loads((out / 'definitions-seed.json').read_text())}


def test_arb_owner_note_is_optional_and_neutral_by_default():
    assert 'arb_owner_note' not in build_target.DEFAULT
    assert build_target.DEFAULT_ARB_OWNER_NOTE == NEUTRAL_NOTE
    assert build_target.arb_owner_note(DEFAULT) == NEUTRAL_NOTE and build_target.arb_owner_note(OTHER) == NEUTRAL_NOTE
    assert build_target.validate(OTHER) == OTHER, 'an absent note stays absent'
    assert build_target.validate({**OTHER, 'arb_owner_note': NOTE}) == {**OTHER, 'arb_owner_note': NOTE}
    assert build_target.arb_owner_note({**OTHER, 'arb_owner_note': NOTE}) == NOTE
    assert {k: n for k, _, _, _, n in model.seed_config()}['Authority_ARB'] == NEUTRAL_NOTE


@pytest.mark.parametrize('note', ['', '   ', 3, None, ['x'], 'two\nlines', 'tab\there', '@{concat(1)}', 'mail @ host', 'x' * 501])
def test_arb_owner_note_is_strict(note):
    with pytest.raises(ValueError):
        build_target.validate({**OTHER, 'arb_owner_note': note})


def test_target_arb_owner_note_replaces_only_the_authority_arb_note(tmp_path):
    noted_target = {**OTHER, 'arb_owner_note': NOTE}
    (tmp_path / 'plain').mkdir(); (tmp_path / 'noted').mkdir()
    plain, noted = build(tmp_path / 'plain', OTHER), build(tmp_path / 'noted', noted_target)
    assert_names_only(noted, noted_target)
    assert seed_notes(plain)['Authority_ARB'] == NEUTRAL_NOTE and seed_notes(noted)['Authority_ARB'] == NOTE
    a, b = texts_by_path(plain), texts_by_path(noted)
    assert a.keys() == b.keys()
    differing = sorted(k for k in a if a[k] != b[k])
    assert differing == sorted([
        'AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip!Workflows/AICoE00Provisioning-99538EE6-ADDE-5CAC-A8DC-78E2D9F2B417.json',
        'AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY_literal-fallback.zip!Workflows/AICoE00Provisioning-99538EE6-ADDE-5CAC-A8DC-78E2D9F2B417.json',
        'build-evidence.json', 'definitions-seed.json',
        'flow-definitions-literal-fallback/AICoE00Provisioning.json', 'flow-definitions/AICoE00Provisioning.json']), differing
    for k in differing:
        if k == 'build-evidence.json': continue  # records the target and the package hashes
        assert NEUTRAL_NOTE not in b[k] and b[k].count(NOTE) == 1, k
        assert b[k].replace(NOTE, NEUTRAL_NOTE) == a[k], f'{k}: only the Authority_ARB note may differ'


def test_redaction_r1_is_read_from_the_targets_arb_owner_note(tmp_path):
    pins = json.loads((ROOT / 'evidence/source-pins.json').read_text())
    pin = next(p for p in pins['files'] if p['path'] == 'model.py')
    neutral = (ROOT / 'upstream/model.py').read_text(encoding='utf-8')
    noted_target = {**OTHER, 'arb_owner_note': NOTE}
    found = up.redactions_from_target(pin['edits'], noted_target)
    assert found == {'R1': 'Fabrikam review board'}
    restored = up.restore(neutral, pin['edits'], up.values(noted_target, found))
    assert NOTE in restored and not up.PLACEHOLDER.search(restored)
    assert up.redactions_from_target(pin['edits'], OTHER) == {}, 'no note: R1 stays unresolved'
    assert up.redactions_from_target(pin['edits'], {**OTHER, 'arb_owner_note': 'Other wording.'}) == {}, 'never guessed'
    path = tmp_path / 'target.json'; path.write_text(json.dumps(noted_target))
    p = subprocess.run([sys.executable, str(ROOT / 'evidence/upstream_provenance.py'), '--target-file', str(path)], text=True, capture_output=True)
    reports = {r['path']: r for r in map(json.loads, p.stdout.splitlines())}
    assert reports['model.py']['unresolvedPlaceholders'] == [] and reports['model.py']['redactionsReadFromTarget'] == ['R1'], p.stdout + p.stderr
    assert p.returncode == 1, 'a fictional target cannot match the historical pins'
