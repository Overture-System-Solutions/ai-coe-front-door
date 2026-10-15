"""What each profile calls things, and the exact renames from the pilot names to the template names.

Every package is first built with the pilot names and publisher (cwdd), the code path the first client pilot was
delivered from, and checked there. The "pilot" profile keeps that build as it is. The "aicoe" profile then renames
it with mapping() (retarget.py), and the rename is proven by undoing it.

Template names (approved 2026-10-15): publisher "AI CoE Template" (AICoETemplate, prefix aicoe); solutions
AICoEClaudeConnector, AICoEWorkflows, AICoEClaudeIdeaDraft, AICoEClaudeCaseAnalysis, AICoECopilotSubmission; flows
"AI CoE — Intake Processing" and so on; connector "AI CoE Claude Draft" (aicoe_claudedraft). The front door's own
list, column and choice names (AI CoE Pilot Intakes, PilotMeasure, Submitted - Pilot, ...) and the connector's
X-OSS-Flow-Run-ID header are contracts and keep their names.
"""
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
GOVERNANCE = HERE.parent / 'AI_CoE_Governance_Flow_Builder'
if str(GOVERNANCE) not in sys.path:
    sys.path.insert(0, str(GOVERNANCE))
import build_solution as governance  # noqa: E402

PACKAGES = ('connector', 'workflows', 'idea_draft', 'case_analysis', 'copilot_submission')
PILOT_FILES = {
    'connector': '01_ClaudeConnector_OSSCloudWaveClaudeDraftConnector_1_0_0_3.zip',
    'workflows': '02_AICoEPrivatePilot_Workflows_1_0_0_2.zip',
    'idea_draft': '03_AICoEPilot_ClaudeIdeaDraft_1_0_0_0.zip',
    'case_analysis': '04_case_analysis/AICoEPilotClaudeCaseAnalysis_1_0_0_1.zip',
    'copilot_submission': '06_copilot_submission/AICoEPilotCopilotSubmission_1_0_0_0.zip',
}
AICOE_FILES = {
    'connector': '01_AICoEClaudeConnector_1_0_0_0.zip',
    'workflows': '02_AICoEWorkflows_1_0_0_0.zip',
    'idea_draft': '03_AICoEClaudeIdeaDraft_1_0_0_0.zip',
    'case_analysis': '04_case_analysis/AICoEClaudeCaseAnalysis_1_0_0_0.zip',
    'copilot_submission': '06_copilot_submission/AICoECopilotSubmission_1_0_0_0.zip',
}
REFERENCE_SUFFIX = '_REFERENCE_NOT_FOR_IMPORT'
REFERENCE_LABEL = ' (reference build - not for import)'

# The connector the pilot flows are bound to while they are built; an aicoe build renames it to the target's.
INTERMEDIATE_API = 'shared_cwdd-5foss-20claude-20intake-20draft-5f0000000000000000'
PILOT_CONNECTOR_ID = '9d027c49-6154-5783-9503-a0e9f0458709'
AICOE_CONNECTOR_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, 'urn:aicoe-template:claude-draft-connector'))

PUBLISHER = [
    ('<UniqueName>OSSCloudWaveDemoPublisher</UniqueName>', '<UniqueName>AICoETemplate</UniqueName>'),
    ('description="OSS CloudWave Demo"', 'description="AI CoE Template"'),
    ('<CustomizationPrefix>cwdd</CustomizationPrefix>', '<CustomizationPrefix>aicoe</CustomizationPrefix>'),
    ('<CustomizationOptionValuePrefix>88001</CustomizationOptionValuePrefix>',
     '<CustomizationOptionValuePrefix>61413</CustomizationOptionValuePrefix>'),
]
CONNECTOR_IDENTITY = [
    ('cwdd_ossclaudeintakedraft', 'aicoe_claudedraft'),
    (PILOT_CONNECTOR_ID, AICOE_CONNECTOR_ID),
]


def governance_target(target, out):
    """The governance builder's Target for a tenant: its values, the pilot names (renamed later for aicoe)."""
    return governance.Target(
        key=target.key, site=target.site, recipients=target.recipients, solution='AICoEPrivatePilot',
        display='AI CoE Private Pilot', description=target.governance_description, flow_prefix='AI CoE Pilot',
        file_prefix='AICoEPilot',
        references={
            'cwdd_sharedsharepointonline': ('cwdd_aicoepilotsharepoint', 'AI CoE Pilot SharePoint'),
            'cwdd_sharedoffice365': ('cwdd_aicoepilotoffice365', 'AI CoE Pilot Office 365 Outlook'),
            'cwdd_sharedapprovals': ('cwdd_aicoepilotapprovals', 'AI CoE Pilot Approvals'),
        },
        out=Path(out), version='1.0.0.2', front_door_lists=True, strict_wording=True,
        relabels=(('IntakeProcessing', '[OSS DEMO] Submission received.', '[AI CoE Pilot] Submission received.', 1),
                  ('IntakeProcessing', 'The synthetic case will move through triage and human review.',
                   'Your case will move through triage and human review.', 1)))


def intermediate_api(target):
    return target.connector_api_name if target.profile == 'pilot' else INTERMEDIATE_API


def labelled(target, package):
    return target.reference_build and package != 'connector'


def output_file(target, package):
    if target.profile == 'pilot':
        return PILOT_FILES[package]
    name = AICOE_FILES[package]
    return name[:-len('.zip')] + REFERENCE_SUFFIX + '.zip' if labelled(target, package) else name


def mapping(target, package):
    """Ordered (old, new) renames for one package; empty for the pilot profile."""
    if target.profile == 'pilot':
        return []
    label = REFERENCE_LABEL if labelled(target, package) else ''
    api = [(INTERMEDIATE_API, target.connector_api_name)]
    if package == 'connector':
        return [('OSSCloudWaveClaudeDraftConnector', 'AICoEClaudeConnector'),
                ('OSS CloudWave Claude Draft Connector', 'AI CoE Claude Connector'),
                ('OSS Claude Intake Draft', 'AI CoE Claude Draft'),
                ('<Version>1.0.0.3</Version>', '<Version>1.0.0.0</Version>')] + CONNECTOR_IDENTITY + PUBLISHER
    if package == 'workflows':
        return [('AICoEPrivatePilot', 'AICoEWorkflows'),
                ('description="AI CoE Private Pilot"', 'description="AI CoE Workflows%s"' % label),
                # Anchored to the XML element: "AI CoE SharePoint provisioning is complete" is flow text.
                ('>AI CoE Pilot SharePoint<', '>AI CoE SharePoint<'),
                ('>AI CoE Pilot Office 365 Outlook<', '>AI CoE Office 365 Outlook<'),
                ('>AI CoE Pilot Approvals<', '>AI CoE Approvals<'),
                ('cwdd_aicoepilotsharepoint', 'aicoe_sharepoint'),
                ('cwdd_aicoepilotoffice365', 'aicoe_office365'),
                ('cwdd_aicoepilotapprovals', 'aicoe_approvals'),
                ('Workflows/AICoEPilot', 'Workflows/AICoE'),
                ('AI CoE Pilot — ', 'AI CoE — '),
                ('[AI CoE Pilot] Submission received.', '[AI CoE] Submission received.'),
                ('<Version>1.0.0.2</Version>', '<Version>1.0.0.0</Version>'),
                ('<IntroducedVersion>1.0.0.2</IntroducedVersion>', '<IntroducedVersion>1.0.0.0</IntroducedVersion>')] + PUBLISHER
    if package == 'idea_draft':
        return [('AICoEPilotClaudeIdeaDraft', 'AICoEClaudeIdeaDraft'),
                ('AI CoE Pilot Claude Idea Draft Connection', 'AI CoE Claude Idea Draft Connection'),
                ('description="AI CoE Pilot Claude Idea Draft"', 'description="AI CoE Claude Idea Draft%s"' % label),
                ('AI CoE Pilot - Claude Idea Draft', 'AI CoE - Claude Idea Draft'),
                ('Workflows/AICoEPilot-ClaudeIdeaDraft-', 'Workflows/AICoE-ClaudeIdeaDraft-'),
                ('Idea-draft generation for the AI CoE private pilot through', 'Idea-draft generation for the AI CoE through'),
                ('cwdd_aicoepilotclaudedraft', 'aicoe_claudeideadraft')] + api + CONNECTOR_IDENTITY + PUBLISHER
    if package == 'case_analysis':
        names = ([('LOCAL FIXTURE ONLY - NOT FOR IMPORT', 'AI CoE Claude Case Analysis' + label),
                  ('LOCAL FIXTURE ONLY - Claude Case Analysis', 'AI CoE - Claude Case Analysis')]
                 if target.reference_build else
                 [('description="AI CoE Pilot Claude Case Analysis"', 'description="AI CoE Claude Case Analysis"'),
                  ('AI CoE Pilot - Claude Case Analysis', 'AI CoE - Claude Case Analysis')])
        return ([('AICoEPilotClaudeCaseAnalysis', 'AICoEClaudeCaseAnalysis'),
                 ('AI CoE Pilot Claude Case Analysis Connection', 'AI CoE Claude Case Analysis Connection')] + names +
                [('AI CoE Pilot Case Analysis SharePoint', 'AI CoE Case Analysis SharePoint'),
                 ('cwdd_caseanalysissharepoint', 'aicoe_caseanalysissharepoint'),
                 ('cwdd_claudecaseanalysisconnection', 'aicoe_claudecaseanalysisconnection'),
                 ('<Version>1.0.0.1</Version>', '<Version>1.0.0.0</Version>')] + api + CONNECTOR_IDENTITY + PUBLISHER)
    if package == 'copilot_submission':
        return [('AICoEPilotCopilotSubmission', 'AICoECopilotSubmission'),
                ('description="AI CoE Pilot Copilot Submission"', 'description="AI CoE Copilot Submission%s"' % label),
                ('AI CoE Pilot Copilot SharePoint', 'AI CoE Copilot SharePoint'),
                ('cwdd_aicoepilotcopilotsharepoint', 'aicoe_copilotsharepoint'),
                ('Workflows/AICoEPilotCopilotSubmit', 'Workflows/AICoECopilotSubmit'),
                ('AI CoE Pilot — Copilot Submit', 'AI CoE — Copilot Submit')] + PUBLISHER
    raise KeyError(package)


def rename(target, package, text):
    """Apply a package's renames to one string (for documents and tests)."""
    for old, new in mapping(target, package):
        text = text.replace(old, new)
    return text
