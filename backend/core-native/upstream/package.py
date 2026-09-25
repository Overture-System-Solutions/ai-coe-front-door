"""
Power Platform solution packager for AICoECoreAutomation 3.0.0.0 (unmanaged).
Emits the primary zip (environment-variable parameterised) and the _literal-fallback zip (identical flows with
site/alert/label literals and no environment-variable components) — the same hedge 2.1 shipped, because the
environment-variable component XML is the one element that cannot be verified against a real export here.
"""
from __future__ import annotations
import io, json, re, zipfile
from xml.sax.saxutils import escape

import model as M
from wdl import SP_REF, O365_REF

CRM_VERSION = "9.2.24084.185"


def safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", name)


def solution_xml(flows, literal: bool) -> str:
    roots = "\n".join(f'      <RootComponent type="29" id="{{{f.guid}}}" behavior="0" />' for f in flows)
    if not literal:
        roots += "\n" + "\n".join(f'      <RootComponent type="380" schemaName="{s}" behavior="0" />' for s, _, _ in M.ENV_VARS)
    # connection references are declared in customizations.xml only: their component type code (>=10000) is per-environment
    desc = ("AI CoE core automation for the idea-to-business-case MVP: command flow (UI<->flow contract v0.1.1), evidence & readiness, Markdown projector, "
            "notification outbox (ships off), health monitor, provisioning. Records bound to CW-AICOE 3.4.0-rc2 schemas. Every flow imports switched off."
            + (" LITERAL FALLBACK: no environment variables; site/alert/label are literals." if literal else ""))
    return f'''<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="{CRM_VERSION}" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>{M.SOLUTION_UNIQUE}</UniqueName>
    <LocalizedNames>
      <LocalizedName description="{escape(M.SOLUTION_DISPLAY)}" languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description="{escape(desc)}" languagecode="1033" />
    </Descriptions>
    <Version>{M.SOLUTION_VERSION}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>{M.PUBLISHER_UNIQUE}</UniqueName>
      <LocalizedNames>
        <LocalizedName description="{escape(M.PUBLISHER_DISPLAY)}" languagecode="1033" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>{M.PUBLISHER_PREFIX}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>10000</CustomizationOptionValuePrefix>
      <Addresses>
        <Address>
          <AddressNumber>1</AddressNumber>
          <AddressTypeCode>1</AddressTypeCode>
          <City xsi:nil="true"></City>
          <County xsi:nil="true"></County>
          <Country xsi:nil="true"></Country>
          <Fax xsi:nil="true"></Fax>
          <FreightTermsCode xsi:nil="true"></FreightTermsCode>
          <ImportSequenceNumber xsi:nil="true"></ImportSequenceNumber>
          <Latitude xsi:nil="true"></Latitude>
          <Line1 xsi:nil="true"></Line1>
          <Line2 xsi:nil="true"></Line2>
          <Line3 xsi:nil="true"></Line3>
          <Longitude xsi:nil="true"></Longitude>
          <Name xsi:nil="true"></Name>
          <PostalCode xsi:nil="true"></PostalCode>
          <PostOfficeBox xsi:nil="true"></PostOfficeBox>
          <PrimaryContactName xsi:nil="true"></PrimaryContactName>
          <ShippingMethodCode>1</ShippingMethodCode>
          <StateOrProvince xsi:nil="true"></StateOrProvince>
          <Telephone1 xsi:nil="true"></Telephone1>
          <Telephone2 xsi:nil="true"></Telephone2>
          <Telephone3 xsi:nil="true"></Telephone3>
          <TimeZoneRuleVersionNumber xsi:nil="true"></TimeZoneRuleVersionNumber>
          <UPSZone xsi:nil="true"></UPSZone>
          <UTCOffset xsi:nil="true"></UTCOffset>
          <UTCConversionTimeZoneCode xsi:nil="true"></UTCConversionTimeZoneCode>
        </Address>
      </Addresses>
    </Publisher>
    <RootComponents>
{roots}
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>
'''


def workflow_xml(f) -> str:
    return f'''    <Workflow WorkflowId="{{{f.guid}}}" Name="{escape(f.name)}">
      <JsonFileName>/Workflows/{safe_name(f.name)}-{f.guid.upper()}.json</JsonFileName>
      <Type>1</Type>
      <Subprocess>0</Subprocess>
      <Category>5</Category>
      <Mode>0</Mode>
      <Scope>4</Scope>
      <OnDemand>0</OnDemand>
      <TriggerOnCreate>0</TriggerOnCreate>
      <TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutodelete>0</AsyncAutodelete>
      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>0</StateCode>
      <StatusCode>1</StatusCode>
      <RunAs>1</RunAs>
      <IsTransacted>1</IsTransacted>
      <IntroducedVersion>{M.SOLUTION_VERSION}</IntroducedVersion>
      <IsCustomizable>1</IsCustomizable>
      <BusinessProcessType>0</BusinessProcessType>
      <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
      <PrimaryEntity>none</PrimaryEntity>
      <LocalizedNames>
        <LocalizedName languagecode="1033" description="{escape(f.name)}" />
      </LocalizedNames>
    </Workflow>'''


def connref_xml(logical: str, display: str, connector: str) -> str:
    return f'''    <connectionreference connectionreferencelogicalname="{logical}">
      <connectionreferencedisplayname>{escape(display)}</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/{connector}</connectorid>
      <iscustomizable>1</iscustomizable>
      <promptingbehavior>0</promptingbehavior>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </connectionreference>'''


def customizations_xml(flows) -> str:
    wf = "\n".join(workflow_xml(f) for f in flows)
    cr = connref_xml(SP_REF, "AI CoE SharePoint", "shared_sharepointonline") + "\n" + connref_xml(O365_REF, "AI CoE Office 365 Outlook", "shared_office365")
    return f'''<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities />
  <Roles />
  <Workflows>
{wf}
  </Workflows>
  <FieldSecurityProfiles />
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityDataProviders />
  <connectionreferences>
{cr}
  </connectionreferences>
  <Languages>
    <Language>1033</Language>
  </Languages>
</ImportExportXml>
'''


def envvar_xml(schema: str, default: str, desc: str) -> str:
    return f'''<?xml version="1.0" encoding="utf-8"?>
<environmentvariabledefinition schemaname="{schema}">
  <defaultvalue>{escape(default)}</defaultvalue>
  <description default="{escape(desc)}">
    <label description="{escape(desc)}" languagecode="1033" />
  </description>
  <displayname default="{schema}">
    <label description="{schema}" languagecode="1033" />
  </displayname>
  <introducedversion>{M.SOLUTION_VERSION}</introducedversion>
  <iscustomizable>1</iscustomizable>
  <isrequired>0</isrequired>
  <secretstore>0</secretstore>
  <statecode>0</statecode>
  <statuscode>1</statuscode>
  <type>100000000</type>
</environmentvariabledefinition>
'''


CONTENT_TYPES = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/octet-stream" />
  <Default Extension="json" ContentType="application/octet-stream" />
</Types>
'''


def build_zip(flows, literal: bool) -> tuple[bytes, dict[str, bytes]]:
    files: dict[str, bytes] = {}
    files["[Content_Types].xml"] = CONTENT_TYPES.encode()
    files["solution.xml"] = solution_xml(flows, literal).encode()
    files["customizations.xml"] = customizations_xml(flows).encode()
    for f in flows:
        files[f"Workflows/{safe_name(f.name)}-{f.guid.upper()}.json"] = (json.dumps(f.definition(), indent=2) + "\n").encode()
    if not literal:
        for schema, default, desc in M.ENV_VARS:
            files[f"environmentvariabledefinitions/{schema}/environmentvariabledefinition.xml"] = envvar_xml(schema, default, desc).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in sorted(files):
            zi = zipfile.ZipInfo(name, date_time=(2026, 9, 21, 12, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o644 << 16
            z.writestr(zi, files[name])
    return buf.getvalue(), files
