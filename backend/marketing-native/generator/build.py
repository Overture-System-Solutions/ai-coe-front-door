#!/usr/bin/env python3
"""Emit OFF review artifacts. Does not authenticate, import, call a model or invoke PAC."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
from collections import Counter
import marketing_flow as flow
from marketing_package import build_zip, deterministic_zip
from marketing_validate import validate, walk, PARSER_SHA256
import build_target

ROOT = flow.ROOT
NAME = 'AICoEMarketingAutomation_1_0_0_0_UNBOUND_REVIEW_ONLY.zip'
HELPER_NAME = 'AICoEMarketingIntegrity_1_0_0_0_REGISTRATION_CANDIDATE.zip'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def status():
    return {'scope': 'OFFLINE_REVIEW_ONLY', 'enabled': False, 'controllerQualified': False, 'securityQualified': False,
            'helperRuntimeApiName': flow.HELPER_API, 'registered': False, 'nativeExecuted': False,
            'status': 'BLOCKED_UNBOUND_UNQUALIFIED',
            'unperformed': ['helper native registration/Save and C# hosted limits', 'flow native designer Save/import',
                            'approved writer/controller commissioning', 'two-account list/item/source permission tests',
                            'actual Claude response/size/timeout/cost qualification', 'native crash/replay acceptance'],
            'prohibited': ['send', 'external publication', 'model invocation by local tooling', 'tenant actions by local tooling']}


def build(out, target=None):
    """Build for a target (build_target.DEFAULT if None). Only the default target may write the committed out/."""
    target = build_target.validate(dict(build_target.DEFAULT) if target is None else target)
    if target != build_target.DEFAULT and Path(out).resolve() == (ROOT / 'out').resolve():
        raise ValueError('A non-default target must be built --into a folder outside the committed out/')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    candidate = flow.command_flow()
    problems = validate(candidate.definition())
    if problems:
        raise ValueError(problems)
    payload = build_zip(candidate)
    (out / NAME).write_bytes(payload)
    folder = out / 'flow-definitions'
    folder.mkdir(exist_ok=True)
    definition_bytes = (json.dumps(candidate.definition(), indent=2) + '\n').encode()
    (folder / 'AICoEMarketing01Command.json').write_bytes(definition_bytes)
    records = list(walk(candidate.actions))
    refs = candidate.definition()['properties']['connectionReferences']
    packages = {NAME: {'sha256': sha(payload), 'bytes': len(payload), 'role': 'OFF_UNBOUND_FLOW_SOLUTION'}}
    # Registration material is separate, and missing material is never replaced by a stub.
    required = ['Script.cs', 'apiDefinition.swagger.json', 'apiProperties.json', 'deployment.json', 'README.md']
    missing = [name for name in required if not (ROOT / 'connector' / name).is_file()]
    if not missing:
        files = {name: (ROOT / 'connector' / name).read_bytes() for name in required}
        files['Script.cs'] = build_target.render_script(target)
        files['Script.csx'] = files['Script.cs']
        helper_payload = deterministic_zip(files)
        (out / HELPER_NAME).write_bytes(helper_payload)
        packages[HELPER_NAME] = {'sha256': sha(helper_payload), 'bytes': len(helper_payload), 'role': 'REGISTRATION_FILES_NOT_REGISTERED'}
    members = {}
    for package in packages:
        with zipfile.ZipFile(out / package) as archive:
            members.update({package + '/' + n: archive.read(n) for n in archive.namelist()})
    violations = build_target.site_violations(target, members)
    if violations:
        raise ValueError(violations)
    if target != build_target.DEFAULT:
        (out / 'provisioning').mkdir(exist_ok=True)
        (out / 'provisioning/controlled-inputs.schema.json').write_bytes(build_target.render_controlled_inputs(target))
    settings = {'EnvironmentVariables': [], 'ConnectionReferences': [
        {'LogicalName': r['connection']['connectionReferenceLogicalName'], 'ConnectionId': '', 'ConnectorId': '/providers/Microsoft.PowerApps/apis/' + r['api']['name']} for r in refs.values()]}
    (out / 'deployment-settings-template.json').write_text(json.dumps(settings, indent=2) + '\n')
    pins = []
    for donor, copy_name in [('generator/wdl.py', 'wdl.py'), ('generator/package.py', 'packing_donor.py'), ('tests/wdl_harness.py', 'wdl_parser_donor.py')]:
        original = ROOT.parent / 'core-native' / donor
        copy = ROOT / 'generator' / copy_name
        if original.read_bytes() != copy.read_bytes():
            raise ValueError('Source donor changed: ' + donor)
        pins.append({'original': str(original), 'copy': str(copy.relative_to(ROOT)), 'sha256': sha(copy.read_bytes())})
    pins.append({'original': str(ROOT.parent / 'power-automate/marketing-runtime/connector-binding.json'), 'sha256': sha((ROOT.parent / 'power-automate/marketing-runtime/connector-binding.json').read_bytes())})
    sources = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for category in ['generator', 'tests/flow'] for p in sorted((ROOT / category).glob('*.py'))}
    manifest = {'solution': 'AICoEMarketingAutomation', 'version': '1.0.0.0', 'publisherPrefix': 'aicoe',
                'target': {'site': target['site'], 'workIdPrefix': target['work_id_prefix']},
                'workflowId': candidate.guid, 'plannedHelperComponentId': flow.HELPER_ID,
                'helperIdIsNotRegisteredRuntimeApiName': True, 'flowCount': 1, 'flowState': 'OFF',
                'definitionSha256': sha(definition_bytes), 'actionCount': len(records),
                'actionTypes': dict(Counter(a['type'] for _, a in records)),
                'helperModes': sorted({a['inputs']['parameters']['body/Mode'] for _, a in records if a['type'] == 'OpenApiConnection' and a['inputs']['host']['operationId'] == 'Evaluate'}),
                'connectorOperations': sorted({a['inputs']['host']['operationId'] for _, a in records if a['type'] == 'OpenApiConnection'}),
                'packages': packages, 'helperPackagingMissingFiles': missing, 'sourcePins': pins, 'sourceHashes': sources,
                'validationErrors': problems, 'boundary': status(),
                'integrationGate': 'Parent must execute this exact packaged graph against the compiled helper and labeled local transports; these generator tests are not tenant evidence.'}
    (out / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (out / 'native-status.json').write_text(json.dumps(status(), indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-unbound', action='store_true', help='Explicitly emit only an OFF unbound local review candidate')
    parser.add_argument('--status', action='store_true', help='Read-only native readiness status; no file writes or calls')
    parser.add_argument('--target-file', type=Path, help='Local target JSON {site, work_id_prefix}; default is the neutral placeholder')
    parser.add_argument('--into', type=Path, help='Output folder (required for a non-default target; never the committed out/)')
    args = parser.parse_args()
    if args.status:
        print(json.dumps(status(), indent=2))
        return
    if not args.review_unbound:
        parser.error('Only --review-unbound packaging is implemented; no invented or implicitly qualified native binding')
    manifest = build(args.into or ROOT / 'out', build_target.load(args.target_file))
    print(json.dumps({k: manifest[k] for k in ['solution', 'workflowId', 'actionCount', 'helperModes', 'packages', 'helperPackagingMissingFiles']}, indent=2))


if __name__ == '__main__':
    main()
