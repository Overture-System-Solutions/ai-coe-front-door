"""Create a connector-only native PAC source tree from the supplied export's shape."""
from pathlib import Path
import argparse
import json
import shutil
import uuid
import xml.etree.ElementTree as ET
from integration import connector_spec, connection_parameters

ROOT = Path(__file__).resolve().parent
CONNECTOR_NAME = "cwdd_ossclaudeintakedraft"
CONNECTOR_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo/claude-intake-draft/v1#connector"))
SOLUTION_NAME = "OSSCloudWaveClaudeDraftConnector"
VERSION = "1.0.0.1"  # Connector schema update: tools/tool_choice removed from the body contract.


def write_xml(tree, target):
    ET.indent(tree)
    tree.write(target, encoding="utf-8", xml_declaration=True)


def build(output):
    output.mkdir(parents=True, exist_ok=False)
    (output / "Other").mkdir()
    (output / "Connectors").mkdir()
    baseline = ROOT / "source-admin-pac"
    solution = ET.parse(baseline / "Other/Solution.xml")
    manifest = solution.getroot().find("SolutionManifest")
    manifest.find("UniqueName").text = SOLUTION_NAME
    manifest.find("Version").text = VERSION
    manifest.find("Managed").text = "0"
    manifest.find("LocalizedNames/LocalizedName").set("description", "OSS CloudWave Claude Draft Connector")
    description = manifest.find("Descriptions")
    description.clear()
    ET.SubElement(description, "Description", languagecode="1033", description="Anthropic Claude Messages connector for draft generation only. Import before the Claude draft flow. Existing provider and telemetry connectors are unchanged.")
    components = manifest.find("RootComponents")
    components.clear()
    ET.SubElement(components, "RootComponent", type="372", id="{" + CONNECTOR_ID + "}", schemaName=CONNECTOR_NAME, behavior="0")
    write_xml(solution, output / "Other/Solution.xml")
    shutil.copy2(baseline / "Other/Customizations.xml", output / "Other/Customizations.xml")
    connector = ET.parse(baseline / "Connectors/aicoe_ossopenaiadmin.xml")
    node = connector.getroot()
    node.find("connectorid").text = CONNECTOR_ID
    node.find("name").text = CONNECTOR_NAME
    node.find("displayname").text = "OSS Claude Intake Draft"
    node.find("description").text = "Anthropic Messages API draft generation using a Claude API key. No organization administration, case creation, or approval operations."
    node.find("iconbrandcolor").text = "#D97757"
    for tag, suffix in (("openapidefinition", "openapidefinition.json"), ("connectionparameters", "connectionparameters.json"),
                        ("policytemplateinstances", "policytemplateinstances.json"), ("iconblob", "iconblob.Png")):
        node.find(tag).text = "/Connector/" + CONNECTOR_NAME + "_" + suffix
    write_xml(connector, output / "Connectors" / (CONNECTOR_NAME + ".xml"))
    for suffix, data in (("openapidefinition.json", connector_spec()), ("connectionparameters.json", connection_parameters()),
                         ("policytemplateinstances.json", [])):
        (output / "Connectors" / (CONNECTOR_NAME + "_" + suffix)).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    shutil.copy2(ROOT / "assets/claude-draft.png", output / "Connectors" / (CONNECTOR_NAME + "_iconblob.Png"))
    print(json.dumps({"solution": SOLUTION_NAME, "connector_name": CONNECTOR_NAME, "connector_id": CONNECTOR_ID,
                      "version": VERSION, "pac_source": str(output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "connector-pac")
    build(parser.parse_args().out)
