"""Build native PAC source for the flow after obtaining its real connector runtime name."""
from pathlib import Path
import argparse
import copy
import json
import uuid
import xml.etree.ElementTree as ET
from package_connector import ROOT, CONNECTOR_ID, CONNECTOR_NAME, write_xml
from flow import definition, CONNECTION_REFERENCE

SOLUTION_NAME = "OSSCloudWaveClaudeDraftIntegration"
VERSION = "1.0.0.4"  # Flow-only update: secureData kept only on the connector call and ParseJson inputs; connector stays 1.0.0.1.
FLOW_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo/claude-intake-draft/v1#flow"))
FLOW_NAME = "OSS Demo - Claude Intake Draft"
FLOW_FILE = "ClaudeIntakeDraft-" + FLOW_ID.upper() + ".json"


def build(output, api_name, fixture=False):
    document = definition(api_name)
    if "fixture" in api_name.lower() and not fixture:
        raise ValueError("Fixture API names may not be used in deliverable packages")
    output.mkdir(parents=True, exist_ok=False)
    (output / "Other").mkdir()
    (output / "Workflows").mkdir()
    baseline = ROOT.parent / "final-import-bytes"
    solution = ET.parse(baseline / "solution.xml")
    manifest = solution.getroot().find("SolutionManifest")
    manifest.find("UniqueName").text = SOLUTION_NAME
    manifest.find("Version").text = VERSION
    manifest.find("Managed").text = "0"
    title = "OSS CloudWave Claude Draft Integration" if not fixture else "LOCAL FIXTURE ONLY - NOT FOR IMPORT"
    manifest.find("LocalizedNames/LocalizedName").set("description", title)
    manifest.find("Descriptions/Description").set("description", "Authenticated idea draft generation through the separate Anthropic Claude connector. No case submission, approval or telemetry changes.")
    roots = manifest.find("RootComponents")
    roots.clear()
    ET.SubElement(roots, "RootComponent", type="29", id="{" + FLOW_ID + "}", behavior="0")
    write_xml(solution, output / "Other/Solution.xml")
    customizations = ET.parse(baseline / "customizations.xml")
    root = customizations.getroot()
    workflow = copy.deepcopy(root.find("Workflows/Workflow"))
    root.find("Workflows").clear()
    references = root.find("connectionreferences")
    references.clear()
    ref = ET.SubElement(references, "connectionreference", connectionreferencelogicalname=CONNECTION_REFERENCE)
    ET.SubElement(ref, "connectionreferencedisplayname").text = "OSS Claude Intake Draft Connection"
    ET.SubElement(ref, "connectorid").text = "/providers/Microsoft.PowerApps/apis/" + api_name
    lookup = ET.SubElement(ref, "customconnectorid")
    ET.SubElement(lookup, "connectorid").text = CONNECTOR_ID
    for key, value in (("iscustomizable", "1"), ("promptingbehavior", "0"), ("statecode", "0"), ("statuscode", "1")):
        ET.SubElement(ref, key).text = value
    write_xml(customizations, output / "Other/Customizations.xml")
    workflow.set("WorkflowId", "{" + FLOW_ID + "}")
    workflow.set("Name", FLOW_NAME if not fixture else "LOCAL FIXTURE ONLY - Claude Draft")
    workflow.set("Description", "Returns an AI-generated draft for human review. Never submits a case or makes a governance decision.")
    workflow.find("JsonFileName").text = "/Workflows/" + FLOW_FILE
    workflow.find("StateCode").text = "0"
    workflow.find("StatusCode").text = "1"
    workflow.find("IntroducedVersion").text = VERSION
    workflow.find("LocalizedNames/LocalizedName").set("description", workflow.get("Name"))
    workflow.find("Descriptions/Description").set("description", workflow.get("Description"))
    write_xml(ET.ElementTree(workflow), output / "Workflows" / (FLOW_FILE + ".data.xml"))
    (output / "Workflows" / FLOW_FILE).write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"solution": SOLUTION_NAME, "workflow_id": FLOW_ID, "connector_id": CONNECTOR_ID,
                      "connector_logical_name": CONNECTOR_NAME, "runtime_api_name": api_name,
                      "connection_reference": CONNECTION_REFERENCE, "flow_packaged_off": True,
                      "fixture_only": fixture, "pac_source": str(output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-name", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--fixture", action="store_true")
    args = parser.parse_args()
    build(args.out, args.api_name, args.fixture)
