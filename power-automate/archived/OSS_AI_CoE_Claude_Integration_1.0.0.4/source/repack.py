"""Rebuild both delivered solution ZIPs from the previously delivered packages.

The original PAC workspace (source-admin-pac, final-import-bytes, assets) is not part of this
review snapshot. Microsoft's pack step copies the workflow JSON and connector files verbatim, so
each delivered ZIP is patched member-for-member: regenerated definition files replace the old
ones and the solution version is bumped; every other member is copied byte-for-byte. The build is
deterministic (baseline member timestamps are reused), so an unchanged connector rebuilds to the
byte-identical ZIP that was delivered before. Nothing is imported or activated, and no credential
is involved.
The earlier deliveries (1.0.0.0 to 1.0.0.3) were removed from power-automate on 2026-09-13; the
packages this rebuild patches are kept in source/history/ as baselines and regression fixtures.
"""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile
import flow
import integration as contract
import package_connector as connector_packaging
import package_flow as flow_packaging

ROOT = Path(__file__).resolve().parent
DELIVERY = ROOT.parent
ARTIFACTS = DELIVERY.parent
HISTORY = ROOT / "history"  # packages from the removed 1.0.0.0-1.0.0.3 deliveries: rebuild baselines and regression fixtures only
API_NAME = "shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6"
PREVIOUS_CONNECTOR_VERSION = "1.0.0.0"
PREVIOUS_FLOW_VERSION = "1.0.0.3"
BASELINE_CONNECTOR = HISTORY / "01_OSSCloudWaveClaudeDraftConnector_1_0_0_0.zip"
BASELINE_FLOW = HISTORY / "02_OSSCloudWaveClaudeDraftIntegration_1_0_0_3.zip"
PREVIOUS_CONNECTOR_ZIP = HISTORY / "01_OSSCloudWaveClaudeDraftConnector_1_0_0_1.zip"
CONNECTOR_ZIP = DELIVERY / ("01_OSSCloudWaveClaudeDraftConnector_" + connector_packaging.VERSION.replace(".", "_") + ".zip")
FLOW_ZIP = DELIVERY / ("02_OSSCloudWaveClaudeDraftIntegration_" + flow_packaging.VERSION.replace(".", "_") + ".zip")
OPENAPI_MEMBER = "Connector/" + connector_packaging.CONNECTOR_NAME + "_openapidefinition.json"
WORKFLOW_MEMBER = "Workflows/" + flow_packaging.FLOW_FILE


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2) + "\n").encode("utf-8")


def replace_once(data, old, new, label):
    if data.count(old) != 1:
        raise ValueError(f"{label}: expected exactly one occurrence of {old!r}")
    return data.replace(old, new)


def repack(baseline, target, replacements):
    """Copy every member of baseline into target, applying replacements by member name."""
    with zipfile.ZipFile(baseline) as source:
        infos = source.infolist()
        members = {info.filename: source.read(info) for info in infos}
    missing = sorted(set(replacements) - set(members))
    if missing:
        raise ValueError("Baseline is missing members: " + ", ".join(missing))
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output:
        for info in infos:
            data = members[info.filename]
            if info.filename in replacements:
                data = replacements[info.filename](data)
            entry = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = info.external_attr
            output.writestr(entry, data)
    return {"zip": str(target), "sha256": sha256(target), "members": len(infos)}


def version_tag(version):
    return ("<Version>" + version + "</Version>").encode("utf-8")


def introduced_tag(version):
    return ("<IntroducedVersion>" + version + "</IntroducedVersion>").encode("utf-8")


def build_connector():
    return repack(BASELINE_CONNECTOR, CONNECTOR_ZIP, {
        "solution.xml": lambda data: replace_once(data, version_tag(PREVIOUS_CONNECTOR_VERSION), version_tag(connector_packaging.VERSION), "solution.xml"),
        OPENAPI_MEMBER: lambda data: json_bytes(contract.connector_spec()),
    })


def build_flow(api_name):
    document = flow.definition(api_name)
    return repack(BASELINE_FLOW, FLOW_ZIP, {
        "solution.xml": lambda data: replace_once(data, version_tag(PREVIOUS_FLOW_VERSION), version_tag(flow_packaging.VERSION), "solution.xml"),
        "customizations.xml": lambda data: replace_once(data, introduced_tag(PREVIOUS_FLOW_VERSION), introduced_tag(flow_packaging.VERSION), "customizations.xml"),
        WORKFLOW_MEMBER: lambda data: json_bytes(document),
    })


def write_reference_files():
    """Derived, credential-free reference artifacts next to the ZIPs."""
    request = contract.provider_request(contract.example_request())
    (DELIVERY / "claude-request-body.json").write_bytes(json_bytes(request))
    bindings = {"anthropic-version": contract.API_VERSION}
    bindings.update(contract.action_body_parameters(flow.claude_request()))
    (DELIVERY / "ACTION_PARAMETER_BINDINGS.json").write_bytes(json_bytes(bindings))
    (DELIVERY / "synthetic-request.json").write_bytes(json_bytes(contract.example_request()))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-name", default=API_NAME)
    args = parser.parse_args()
    if "fixture" in args.api_name.lower():
        raise SystemExit("Fixture API names may not be used in deliverable packages")
    connector = build_connector()
    connector["identical_to_previously_delivered"] = PREVIOUS_CONNECTOR_ZIP.exists() and sha256(PREVIOUS_CONNECTOR_ZIP) == connector["sha256"]
    result = {"connector": connector, "flow": build_flow(args.api_name),
              "runtime_api_name": args.api_name, "flow_id": flow_packaging.FLOW_ID,
              "connector_id": connector_packaging.CONNECTOR_ID}
    write_reference_files()
    print(json.dumps(result, indent=2))
