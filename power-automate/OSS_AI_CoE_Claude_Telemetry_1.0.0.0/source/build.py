"""Build the Claude telemetry solution ZIPs from the delivered Claude draft ZIPs.

The PAC workspace that produced the earlier deliveries is not part of this snapshot, so the two
ZIPs delivered in OSS_AI_CoE_Claude_Integration_1.0.0.4 are the baselines: their XML members
are parsed, the identity fields are rewritten with ElementTree and serialized exactly the way the
packager wrote them (byte-identical round trip, proved by checks.py); the connector icon, policy
template and [Content_Types].xml members are copied verbatim; the JSON members are regenerated
from telemetry.py and flow.py. Member timestamps and attributes are pinned, so a rebuild is
byte-identical. Nothing is imported or activated, and no credential is involved.

    py -3 build.py                       connector ZIP + sidecars; flow ZIP only if VERIFICATION.json
                                         already records a runtime API name
    py -3 build.py --api-name shared_…   bind the flow to the connector's tenant-assigned API name
"""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
import flow
import telemetry as contract

ROOT = Path(__file__).resolve().parent
DELIVERY = ROOT.parent
ARTIFACTS = DELIVERY.parent
DONOR_DIR = ARTIFACTS / "OSS_AI_CoE_Claude_Integration_1.0.0.4"
DONOR_CONNECTOR = DONOR_DIR / "01_OSSCloudWaveClaudeDraftConnector_1_0_0_1.zip"
DONOR_FLOW = DONOR_DIR / "02_OSSCloudWaveClaudeDraftIntegration_1_0_0_4.zip"
DONOR_CONNECTOR_NAME = "cwdd_ossclaudeintakedraft"
DONOR_WORKFLOW_MEMBER = "Workflows/ClaudeIntakeDraft-D227A436-D15F-5533-92DB-FF80887F0BD8.json"

SLUG = "https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo/claude-telemetry/v1"
CONNECTOR_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, SLUG + "#connector"))
FLOW_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, SLUG + "#flow"))
VERSION = "1.0.0.0"
CONNECTOR_NAME = flow.CONNECTOR_LOGICAL_NAME
CONNECTOR_DISPLAY = "OSS Claude Telemetry"
CONNECTOR_DESCRIPTION = "Anthropic Admin API usage and cost reports using an Admin API key. Read-only; no Messages, no key or member administration."
CONNECTOR_SOLUTION = "OSSCloudWaveClaudeTelemetryConnector"
CONNECTOR_SOLUTION_DISPLAY = "OSS CloudWave Claude Telemetry Connector"
CONNECTOR_SOLUTION_DESCRIPTION = "Anthropic Admin API usage and cost report connector (read-only). Import before the Claude telemetry flow. The Claude draft connector, its flow and the demo flows are unchanged."
FLOW_SOLUTION = "OSSCloudWaveClaudeTelemetry"
FLOW_SOLUTION_DISPLAY = "OSS CloudWave Claude Telemetry"
FLOW_SOLUTION_DESCRIPTION = "Scheduled ingestion of Anthropic organization usage and cost into the AI Usage Daily list through the separate Claude telemetry connector, with a settable monthly spend alert. No case, approval or draft changes."
FLOW_NAME = "OSS Demo - Claude Telemetry"
FLOW_DESCRIPTION = "Upserts daily Anthropic usage and cost rows into AI Usage Daily every six hours and keeps a Cost incident in step with the ClaudeMonthlyBudgetUsd setting. Read-only against Anthropic; idempotent against SharePoint."
FLOW_FILE = "ClaudeTelemetry-" + FLOW_ID.upper() + ".json"
CONNECTION_DISPLAY = "OSS Claude Telemetry Connection"
SHAREPOINT_CONNECTION_DISPLAY = "OSS Demo SharePoint"
CONNECTOR_ZIP = DELIVERY / ("01_" + CONNECTOR_SOLUTION + "_" + VERSION.replace(".", "_") + ".zip")
FLOW_ZIP = DELIVERY / ("02_" + FLOW_SOLUTION + "_" + VERSION.replace(".", "_") + ".zip")
VERIFICATION = DELIVERY / "VERIFICATION.json"
EXPECTED_API_PREFIX = "shared_cwdd-5foss-20claude-20telemetry-5f"
FIXTURE_API_NAME = "shared_local_claude_telemetry_fixture_connector"

XSI = "http://www.w3.org/2001/XMLSchema-instance"
BOM = b"\xef\xbb\xbf"
DECLARATION = b'<?xml version="1.0" encoding="utf-8"?>'
ZIP_DATE_TIME = (2026, 9, 12, 0, 0, 0)
ZIP_EXTERNAL_ATTR = 0x81A40000


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2) + "\n").encode("utf-8")


def read_members(path):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        return infos, {info.filename: archive.read(info) for info in infos}


def parse_xml(data):
    return ET.fromstring(data[len(BOM):] if data.startswith(BOM) else data)


def serialize_like_pac(root, donor_bytes):
    """BOM, declaration, LF, two-space indent, no trailing newline; keeps an unused xmlns:xsi."""
    ET.register_namespace("xsi", XSI)
    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    start_tag = donor_bytes.split(b">", 2)[1]
    if b"xmlns:xsi=" in start_tag and "xmlns:xsi=" not in body:
        body = body.replace("<" + root.tag, "<" + root.tag + ' xmlns:xsi="' + XSI + '"', 1)
    return BOM + DECLARATION + b"\n" + body.encode("utf-8")


def connector_solution_xml(donor):
    root = parse_xml(donor)
    manifest = root.find("SolutionManifest")
    manifest.find("UniqueName").text = CONNECTOR_SOLUTION
    manifest.find("LocalizedNames/LocalizedName").set("description", CONNECTOR_SOLUTION_DISPLAY)
    manifest.find("Descriptions/Description").set("description", CONNECTOR_SOLUTION_DESCRIPTION)
    manifest.find("Version").text = VERSION
    components = manifest.find("RootComponents")
    components.clear()
    ET.SubElement(components, "RootComponent", type="372", id="{" + CONNECTOR_ID + "}", schemaName=CONNECTOR_NAME, behavior="0")
    return serialize_like_pac(root, donor)


def connector_customizations_xml(donor):
    root = parse_xml(donor)
    node = root.find("Connectors/Connector")
    node.find("connectorid").text = CONNECTOR_ID
    node.find("description").text = CONNECTOR_DESCRIPTION
    node.find("displayname").text = CONNECTOR_DISPLAY
    node.find("name").text = CONNECTOR_NAME
    for tag, suffix in (("openapidefinition", "openapidefinition.json"), ("connectionparameters", "connectionparameters.json"),
                        ("policytemplateinstances", "policytemplateinstances.json"), ("iconblob", "iconblob.Png")):
        node.find(tag).text = "/Connector/" + CONNECTOR_NAME + "_" + suffix
    return serialize_like_pac(root, donor)


def flow_solution_xml(donor):
    root = parse_xml(donor)
    manifest = root.find("SolutionManifest")
    manifest.find("UniqueName").text = FLOW_SOLUTION
    manifest.find("LocalizedNames/LocalizedName").set("description", FLOW_SOLUTION_DISPLAY)
    manifest.find("Descriptions/Description").set("description", FLOW_SOLUTION_DESCRIPTION)
    manifest.find("Version").text = VERSION
    components = manifest.find("RootComponents")
    components.clear()
    ET.SubElement(components, "RootComponent", type="29", id="{" + FLOW_ID + "}", behavior="0")
    return serialize_like_pac(root, donor)


def connection_reference(parent, logical_name, display_name, connector_path, custom_connector_id=None):
    reference = ET.SubElement(parent, "connectionreference", connectionreferencelogicalname=logical_name)
    ET.SubElement(reference, "connectionreferencedisplayname").text = display_name
    ET.SubElement(reference, "connectorid").text = connector_path
    if custom_connector_id is not None:
        ET.SubElement(ET.SubElement(reference, "customconnectorid"), "connectorid").text = custom_connector_id
    for key, value in (("iscustomizable", "1"), ("promptingbehavior", "0"), ("statecode", "0"), ("statuscode", "1")):
        ET.SubElement(reference, key).text = value


def flow_customizations_xml(donor, api_name):
    root = parse_xml(donor)
    workflow = root.find("Workflows/Workflow")
    workflow.set("WorkflowId", "{" + FLOW_ID + "}")
    workflow.set("Name", FLOW_NAME)
    workflow.set("Description", FLOW_DESCRIPTION)
    workflow.find("JsonFileName").text = "/Workflows/" + FLOW_FILE
    workflow.find("IntroducedVersion").text = VERSION
    if workflow.find("StateCode").text != "0" or workflow.find("StatusCode").text != "1":
        raise ValueError("The donor workflow is not packaged Off")
    workflow.find("LocalizedNames/LocalizedName").set("description", FLOW_NAME)
    workflow.find("Descriptions/Description").set("description", FLOW_DESCRIPTION)
    references = root.find("connectionreferences")
    references.clear()
    connection_reference(references, flow.CONNECTION_REFERENCE, CONNECTION_DISPLAY, "/providers/Microsoft.PowerApps/apis/" + api_name, CONNECTOR_ID)
    connection_reference(references, flow.SHAREPOINT_CONNECTION_REFERENCE, SHAREPOINT_CONNECTION_DISPLAY,
                         "/providers/Microsoft.PowerApps/apis/" + flow.SHAREPOINT_API_NAME)
    return serialize_like_pac(root, donor)


def write_zip(target, members):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as output:
        for name, data in members:
            entry = zipfile.ZipInfo(name, date_time=ZIP_DATE_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = ZIP_EXTERNAL_ATTR
            entry.create_system = 0
            output.writestr(entry, data)
    return {"zip": target.name, "sha256": sha256(target), "members": [name for name, _ in members]}


def connector_members():
    infos, donor = read_members(DONOR_CONNECTOR)
    prefix = "Connector/" + DONOR_CONNECTOR_NAME + "_"
    members = []
    for info in infos:
        name, data = info.filename, donor[info.filename]
        if name == "customizations.xml":
            data = connector_customizations_xml(data)
        elif name == "solution.xml":
            data = connector_solution_xml(data)
        elif name.endswith("_connectionparameters.json"):
            data = json_bytes(contract.connection_parameters())
        elif name.endswith("_openapidefinition.json"):
            data = json_bytes(contract.connector_spec())
        if name.startswith(prefix):
            name = "Connector/" + CONNECTOR_NAME + "_" + name[len(prefix):]
        members.append((name, data))
    return members


def flow_members(api_name):
    infos, donor = read_members(DONOR_FLOW)
    members = []
    for info in infos:
        name, data = info.filename, donor[info.filename]
        if name == "customizations.xml":
            data = flow_customizations_xml(data, api_name)
        elif name == "solution.xml":
            data = flow_solution_xml(data)
        elif name == DONOR_WORKFLOW_MEMBER:
            name, data = "Workflows/" + FLOW_FILE, json_bytes(flow.definition(api_name))
        members.append((name, data))
    return members


def build_connector(target=CONNECTOR_ZIP):
    return write_zip(target, connector_members())


def build_flow(api_name, target=FLOW_ZIP):
    return write_zip(target, flow_members(api_name))


def secure_data_map(document):
    result = {}

    def walk(actions):
        for name, action in actions.items():
            policy = action.get("runtimeConfiguration", {}).get("secureData", {}).get("properties")
            if policy:
                result[name] = policy
            for nested in (action.get("actions"), action.get("else", {}).get("actions")):
                if nested:
                    walk(nested)
    walk(document["properties"]["definition"]["actions"])
    return result


def connection_settings(api_name):
    return {"EnvironmentVariables": [], "ConnectionReferences": [
        {"LogicalName": flow.CONNECTION_REFERENCE, "ConnectionId": "", "ConnectorId": "/providers/Microsoft.PowerApps/apis/" + api_name},
        {"LogicalName": flow.SHAREPOINT_CONNECTION_REFERENCE, "ConnectionId": "", "ConnectorId": "/providers/Microsoft.PowerApps/apis/" + flow.SHAREPOINT_API_NAME}],
        "CopilotAgents": []}


def bindings():
    document = flow.definition(FIXTURE_API_NAME)
    actions = document["properties"]["definition"]["actions"]
    return {contract.OPERATION_IDS["usage"]: actions["Get_usage_current"]["inputs"]["parameters"],
            contract.OPERATION_IDS["cost"]: actions["Get_cost_current"]["inputs"]["parameters"]}


def verification_record(connector, flow_result, api_name, api_name_source, previous):
    document = flow.definition(api_name or FIXTURE_API_NAME)
    definition = document["properties"]["definition"]
    policy = secure_data_map(document)
    columns = sorted(set(flow.usage_row()) | set(flow.cost_row()))
    record = {
        "status": "FLOW_BOUND_LOCAL_CHECKS_PASS_LIVE_IMPORT_PENDING" if flow_result else "CONNECTOR_READY_FLOW_BINDING_PENDING",
        "verified_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "connector_zip": connector["zip"], "connector_zip_sha256": connector["sha256"], "connector_zip_members": connector["members"],
        "connector_solution": CONNECTOR_SOLUTION, "connector_solution_version": VERSION,
        "connector_logical_name": CONNECTOR_NAME, "connector_id": CONNECTOR_ID, "connector_reimport_required": True,
        "flow_zip": flow_result["zip"] if flow_result else None, "flow_zip_sha256": flow_result["sha256"] if flow_result else None,
        "flow_solution": FLOW_SOLUTION, "flow_solution_version": VERSION, "flow_id": FLOW_ID, "flow_name": FLOW_NAME,
        "connection_references": [flow.CONNECTION_REFERENCE, flow.SHAREPOINT_CONNECTION_REFERENCE],
        "runtime_api_name": api_name, "runtime_api_name_source": api_name_source, "flow_packaged_off": True,
        "trigger": {"frequency": "Hour", "interval": 6, "timeZone": "Eastern Standard Time", "concurrency_runs": 1},
        "window_rule": "two windows per report: first day of the previous UTC month to the first day of the current month, and the first day of the current month to utcNow(); one page of at most 31 daily buckets each; has_more stops the run",
        "foreach_concurrency_all_1": True,
        "secure_data_by_action": policy, "actions_with_secure_data": len(policy),
        "list_targets": {"site": contract.SITE, "usage_list": contract.USAGE_LIST, "usage_columns_written": columns,
                         "configuration_list": contract.CONFIGURATION_LIST, "budget_setting": contract.BUDGET_SETTING,
                         "incidents_list": contract.INCIDENTS_LIST, "incident_category": contract.INCIDENT_CATEGORY},
        "composite_key_formats": [contract.composite_key("cost", "YYYY-MM-DD"), contract.composite_key("completions", "YYYY-MM-DD", "<model>")],
        "amount_unit_conversion": "cents string / 100 -> USD dollars",
        "checks_py": previous.get("checks_py", "RUN py -3 checks.py"),
        "donor_zips": {DONOR_CONNECTOR.name: sha256(DONOR_CONNECTOR), DONOR_FLOW.name: sha256(DONOR_FLOW)},
        "pac_pack_unpack": "NOT_RUN_pac_not_installed",
        "designer_save_verified": False, "live_admin_api_call_verified": False, "list_rows_verified": False,
        "key_collected": False, "tenant_writes_performed": False,
        "build_command": "py -3 source/build.py" + (" --api-name " + api_name if api_name else ""),
        "accepted_at": previous.get("accepted_at"),
    }
    assert "$schema" in definition
    return record


def write_sidecars(api_name, connector, flow_result):
    (DELIVERY / "ACTION_PARAMETER_BINDINGS.json").write_bytes(json_bytes(bindings()))
    (DELIVERY / "sample-usage-report.json").write_bytes(json_bytes(contract.sample_usage_page()))
    (DELIVERY / "sample-cost-report.json").write_bytes(json_bytes(contract.sample_cost_page()))
    (DELIVERY / "expected-list-rows.json").write_bytes(json_bytes({
        "usage": contract.usage_rows(contract.sample_usage_page()), "cost": contract.cost_rows(contract.sample_cost_page()),
        "month_to_date_spend_usd": contract.month_to_date_spend(contract.sample_cost_page())}))
    if api_name:
        (DELIVERY / "CONNECTION_SETTINGS.json").write_bytes(json_bytes(connection_settings(api_name)))
    previous = json.loads(VERIFICATION.read_text(encoding="utf-8")) if VERIFICATION.exists() else {}
    source = "user-supplied connector page URL" if api_name else None
    VERIFICATION.write_bytes(json_bytes(verification_record(connector, flow_result, api_name, source, previous)))


def recorded_api_name():
    if VERIFICATION.exists():
        return json.loads(VERIFICATION.read_text(encoding="utf-8")).get("runtime_api_name")
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-name", default=None, help="runtime API name of the imported connector (shared_cwdd-5foss-20claude-20telemetry-5f...)")
    parser.add_argument("--out", type=Path, default=None, help="write the ZIPs elsewhere (fixture builds only)")
    parser.add_argument("--allow-fixture", action="store_true")
    args = parser.parse_args()
    api_name = args.api_name or recorded_api_name()
    if api_name is not None:
        if not re.fullmatch(r"shared_[A-Za-z0-9_-]+", api_name):
            raise SystemExit("The API name must look like shared_...; copy it from the connector page URL")
        if any(word in api_name.lower() for word in ("fixture", "placeholder")) and not (args.allow_fixture and args.out and args.out.resolve() != DELIVERY.resolve()):
            raise SystemExit("Fixture API names may not be used in deliverable packages")
        if not api_name.startswith(EXPECTED_API_PREFIX):
            print("warning: the API name does not start with " + EXPECTED_API_PREFIX + "; check it against the connector page URL")
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        connector = build_connector(args.out / CONNECTOR_ZIP.name)
        flow_result = build_flow(api_name, args.out / FLOW_ZIP.name) if api_name else None
    else:
        connector = build_connector()
        flow_result = build_flow(api_name) if api_name else None
        write_sidecars(api_name, connector, flow_result)
    print(json.dumps({"connector": connector, "flow": flow_result, "runtime_api_name": api_name,
                      "flow_id": FLOW_ID, "connector_id": CONNECTOR_ID}, indent=2))
