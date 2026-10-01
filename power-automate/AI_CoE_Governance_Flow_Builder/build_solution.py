"""Build the AI CoE intake, triage and review solution for a target site.

    python build_solution.py --target ossaicoedemo
    python build_solution.py --target ai-coe-lab
    python build_solution.py --target overture-ai-coe
    python build_solution.py --target cloudwave-privatepilot

Input: the live OSS export OSSCloudWaveDashboardDemo 1.0.0.8 (baseline/, SHA-256 checked; registered in
the project home as S780). Each target's ZIP is written to its delivery folder.

The five flows keep their exported logic byte for byte except for these edits, made as exact text
replacements whose counts are asserted:
  - the SharePoint site;
  - every notification, approval and configured approver: the target's recipients;
  - the Decisions record stores whoever answered the approval, not a fixed address;
  - a new solution identity, workflow IDs and connection references, so a target never replaces
    another solution's flows;
  - optional wording changes a target declares (the CloudWave pilot drops the demo labels);
  - optionally, the front door's own lists in SharePoint Provisioning (front_door_lists.py), for a site
    that cannot run the front door's PnP installer;
  - every flow is packaged Off.
The publisher (OSSCloudWaveDemoPublisher, prefix cwdd) is kept: it is the one the Claude connector
package uses too. Nothing is imported or activated and no credential is involved.
"""
import argparse
import hashlib
import json
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import front_door_lists

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE.parent
BASELINE = HERE / 'baseline' / 'OSSCloudWaveDashboardDemo_1_0_0_8.zip'
BASELINE_SHA256 = '70e986266d63337e06d66229304a5caf54e4035c3e581208283d6979f407233f'
FIXED_TIME = (2026, 9, 27, 0, 0, 0)

OLD_SITE = 'https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo'
SAM = 'samuel.conrad@osscontact.com'
OLD_PAIR = 'samuel.conrad@osscontact.com;Brian.Frerichs@osscontact.com'
OLD_REFERENCES = {
    'cwdd_sharedsharepointonline': 'OSS Demo SharePoint',
    'cwdd_sharedoffice365': 'OSS Demo Office 365 Outlook',
    'cwdd_sharedapprovals': 'OSS Demo Approvals',
}
# The first response to the Basic approval decides; record who gave it.
RESPONDER = "@coalesce(first(outputs('Start_and_wait_for_approval')?['body/responses'])?['responder']?['email'],'')"


@dataclass(frozen=True)
class Target:
    key: str
    site: str
    recipients: str
    solution: str
    display: str
    description: str
    flow_prefix: str          # replaces "OSS Demo" in flow names
    file_prefix: str          # replaces "OSSDemo" in workflow file names
    references: dict          # old logical name -> (new logical name, new display name)
    out: Path
    version: str = '1.0.0.0'
    relabels: tuple = field(default_factory=tuple)   # (old, new, count) per workflow kind
    front_door_lists: bool = False   # SharePoint Provisioning also creates Program Measures and Outcome Records
    operators_group: str = 'AI CoE Operators'   # the site group given Full Control on the read-only approved tools


TARGETS = {
    'ossaicoedemo': Target(
        key='ossaicoedemo',
        site='https://osscontact.sharepoint.com/sites/OSSAICoEDemo',
        recipients='Brian.Frerichs@osscontact.com;samuel.conrad@osscontact.com',
        solution='OSSAICoEDemo',
        display='OSS AI CoE Demo',
        description=('OSS AI CoE demo core workflows for the front door on the OSSAICoEDemo site. Notifications and '
                     'approvals go to Brian Frerichs and Samuel Conrad. No AI-provider integration.'),
        flow_prefix='OSS AI CoE Demo',
        file_prefix='OSSAICoEDemo',
        references={
            'cwdd_sharedsharepointonline': ('cwdd_aicoedemosharepoint', 'OSS AI CoE Demo SharePoint'),
            'cwdd_sharedoffice365': ('cwdd_aicoedemooffice365', 'OSS AI CoE Demo Office 365 Outlook'),
            'cwdd_sharedapprovals': ('cwdd_aicoedemoapprovals', 'OSS AI CoE Demo Approvals'),
        },
        out=ARTIFACTS / 'archived' / 'OSS_AI_CoE_Demo_OSSAICoEDemo_1.0.0.0' / 'OSSAICoEDemo_1_0_0_0.zip',
    ),
    # The OSS rehearsal of the CloudWave private pilot: the pilot's configuration on the OSS AI-CoE-Lab site.
    'ai-coe-lab': Target(
        key='ai-coe-lab',
        site='https://osscontact.sharepoint.com/sites/AI-CoE-Lab',
        recipients='Brian.Frerichs@osscontact.com;samuel.conrad@osscontact.com',
        solution='AICoELab',
        display='AI CoE Lab',
        description=('AI CoE Lab intake, triage and review workflows for the AI-CoE-Lab site, the OSS rehearsal of '
                     'the CloudWave private pilot. Notifications and approvals go to Brian Frerichs and Samuel '
                     "Conrad. Provisioning also creates the front door's Program Measures, Outcome Records and User "
                     'Drafts lists. No AI-provider integration.'),
        flow_prefix='AI CoE Lab',
        file_prefix='AICoELab',
        references={
            'cwdd_sharedsharepointonline': ('cwdd_aicoelabsharepoint', 'AI CoE Lab SharePoint'),
            'cwdd_sharedoffice365': ('cwdd_aicoelaboffice365', 'AI CoE Lab Office 365 Outlook'),
            'cwdd_sharedapprovals': ('cwdd_aicoelabapprovals', 'AI CoE Lab Approvals'),
        },
        out=ARTIFACTS / 'OSS_AI_CoE_Lab_1.0.0.0' / '02_AICoELab_Workflows_1_0_0_0.zip',
        front_door_lists=True,
        relabels=(('IntakeProcessing', '[OSS DEMO] Submission received.', '[AI CoE Lab] Submission received.', 1),
                  ('IntakeProcessing', 'The synthetic case will move through triage and human review.',
                   'Your case will move through triage and human review.', 1)),
    ),
    # Overture's own AI CoE site in the OSS tenant: the lab's configuration, installed beside it.
    'overture-ai-coe': Target(
        key='overture-ai-coe',
        site='https://osscontact.sharepoint.com/sites/OvertureAICoE',
        recipients='Brian.Frerichs@osscontact.com;samuel.conrad@osscontact.com',
        solution='OvertureAICoE',
        display='Overture AI CoE',
        description=('Overture AI CoE intake, triage and review workflows for the OvertureAICoE site. Notifications '
                     'and approvals go to Brian Frerichs and Samuel Conrad. Provisioning also creates the front '
                     "door's Program Measures, Outcome Records, Approved Tools and User Drafts lists. No AI-provider "
                     'integration.'),
        flow_prefix='Overture AI CoE',
        file_prefix='OvertureAICoE',
        references={
            'cwdd_sharedsharepointonline': ('cwdd_overtureaicoesharepoint', 'Overture AI CoE SharePoint'),
            'cwdd_sharedoffice365': ('cwdd_overtureaicoeoffice365', 'Overture AI CoE Office 365 Outlook'),
            'cwdd_sharedapprovals': ('cwdd_overtureaicoeapprovals', 'Overture AI CoE Approvals'),
        },
        out=ARTIFACTS / 'current' / 'OvertureAICoE_1_0_0_2.zip',
        version='1.0.0.2',
        front_door_lists=True,
        relabels=(('IntakeProcessing', '[OSS DEMO] Submission received.', '[Overture AI CoE] Submission received.', 1),
                  ('IntakeProcessing', 'The synthetic case will move through triage and human review.',
                   'Your case will move through triage and human review.', 1)),
    ),
    'cloudwave-privatepilot': Target(
        key='cloudwave-privatepilot',
        site='https://parkplace.sharepoint.com/sites/AICoE-PrivatePilot',
        recipients='sconrad@gocloudwave.com;bfrerichs@gocloudwave.com;jmartens@gocloudwave.com',
        solution='AICoEPrivatePilot',
        display='AI CoE Private Pilot',
        description=('AI CoE private pilot intake, triage and review workflows for the AICoE-PrivatePilot site. '
                     'Notifications and approvals go to the named owners. Provisioning also creates the front '
                     "door's Program Measures, Outcome Records, Approved Tools and User Drafts lists. No AI-provider "
                     'integration.'),
        flow_prefix='AI CoE Pilot',
        file_prefix='AICoEPilot',
        references={
            'cwdd_sharedsharepointonline': ('cwdd_aicoepilotsharepoint', 'AI CoE Pilot SharePoint'),
            'cwdd_sharedoffice365': ('cwdd_aicoepilotoffice365', 'AI CoE Pilot Office 365 Outlook'),
            'cwdd_sharedapprovals': ('cwdd_aicoepilotapprovals', 'AI CoE Pilot Approvals'),
        },
        out=ARTIFACTS / 'current' / 'CloudWave_AICoE_PrivatePilot_1.0.0.0' / '02_AICoEPrivatePilot_Workflows_1_0_0_2.zip',
        version='1.0.0.2',
        front_door_lists=True,
        relabels=(('IntakeProcessing', '[OSS DEMO] Submission received.', '[AI CoE Pilot] Submission received.', 1),
                  ('IntakeProcessing', 'The synthetic case will move through triage and human review.',
                   'Your case will move through triage and human review.', 1)),
    ),
}


def recipient_edits(target):
    """Exact recipient edits per workflow kind, with how many times each must match."""
    to = target.recipients
    return {
        'SharePointProvisioning': [('"Value": "%s"' % SAM, '"Value": "%s"' % to, 2)],
        'WeeklyPortfolioControl': [('"inputs": "%s"' % SAM, '"inputs": "%s"' % to, 1),
                                   ('"emailMessage/To": "%s"' % SAM, '"emailMessage/To": "%s"' % to, 1)],
        'ReviewandDecision': [('"WebhookApprovalCreationInput/assignedTo": "%s"' % OLD_PAIR,
                               '"WebhookApprovalCreationInput/assignedTo": "%s"' % to, 1),
                              ('\\"ApproverEmail\\":\\"%s\\"' % SAM, '\\"ApproverEmail\\":\\"%s\\"' % RESPONDER, 2),
                              ('"emailMessage/To": "%s"' % SAM, '"emailMessage/To": "%s"' % to, 1)],
        'IntakeProcessing': [('"emailMessage/To": "%s"' % OLD_PAIR, '"emailMessage/To": "%s"' % to, 1)],
        'TriageandRouting': [('"inputs": "%s"' % SAM, '"inputs": "%s"' % to, 1),
                             ('"emailMessage/To": "%s"' % SAM, '"emailMessage/To": "%s"' % to, 1),
                             ('"ApproverEmail": "%s"' % SAM, '"ApproverEmail": "%s"' % to, 1)],
    }


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def replace(text, old, new, count, label):
    found = text.count(old)
    if found != count:
        raise ValueError('%s: expected %d of %r, found %d' % (label, count, old[:80], found))
    return text.replace(old, new)


def new_workflow_id(target, old_id):
    """Deterministic: the same site and exported ID always give the same new ID."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, target.site + '#{' + old_id.lower() + '}'))


def workflow_kind(name):
    return name.split('/')[-1].split('-')[0].replace('OSSDemo', '')


def old_workflow_id(name):
    return name[:-len('.json')].split('-', 1)[1]


def new_workflow_name(target, name, ids):
    old_id = old_workflow_id(name)
    return name.replace('Workflows/OSSDemo', 'Workflows/' + target.file_prefix).replace(old_id, ids[old_id].upper())


def edit_workflow(target, name, text):
    kind = workflow_kind(name)
    edits = recipient_edits(target)
    if kind not in edits:
        raise ValueError('Unexpected workflow ' + name)
    if text.count(OLD_SITE) == 0:
        raise ValueError(name + ': no site reference to move')
    text = text.replace(OLD_SITE, target.site)
    if 'CloudWaveDashboardDemo' in text:
        raise ValueError(name + ': a site reference was left behind')
    for old, (new, _) in target.references.items():
        text = text.replace('"%s"' % old, '"%s"' % new)
    for old, new, count in edits[kind]:
        text = replace(text, old, new, count, name)
    for relabel_kind, old, new, count in target.relabels:
        if relabel_kind == kind:
            text = replace(text, old, new, count, name + ' wording')
    if text.count(SAM) != text.count(target.recipients) and SAM in target.recipients:
        raise ValueError(name + ': an address outside the recipient list remains')
    if SAM not in target.recipients and SAM in text:
        raise ValueError(name + ': the old address remains')
    return text


def edit_customizations(target, text, ids):
    for old, new in ids.items():
        text = replace(text, '{%s}' % old.lower(), '{%s}' % new, 1, 'customizations workflow id')
        text = text.replace(old.upper(), new.upper())
    text = text.replace('/Workflows/OSSDemo', '/Workflows/' + target.file_prefix)
    text = replace(text, 'OSS Demo —', target.flow_prefix + ' —', 10, 'customizations names')
    text = text.replace('<StateCode>1</StateCode>', '<StateCode>0</StateCode>')
    text = text.replace('<StatusCode>2</StatusCode>', '<StatusCode>1</StatusCode>')
    text = replace(text, '<IntroducedVersion>1.0.0.7</IntroducedVersion>', '<IntroducedVersion>%s</IntroducedVersion>' % target.version, 5, 'introduced version')
    for old, (new, new_display) in target.references.items():
        text = replace(text, 'connectionreferencelogicalname="%s"' % old, 'connectionreferencelogicalname="%s"' % new, 1, 'reference ' + old)
        text = replace(text, '<connectionreferencedisplayname>%s</connectionreferencedisplayname>' % OLD_REFERENCES[old],
                       '<connectionreferencedisplayname>%s</connectionreferencedisplayname>' % new_display, 1, 'reference name ' + old)
    return text


def edit_solution(target, text, ids):
    text = replace(text, '<UniqueName>OSSCloudWaveDashboardDemo</UniqueName>', '<UniqueName>%s</UniqueName>' % target.solution, 1, 'solution name')
    text = replace(text, 'description="OSS CloudWave Dashboard Demo"', 'description="%s"' % target.display, 1, 'solution display name')
    start = text.index('<Description description="') + len('<Description description="')
    end = text.index('"', start)
    text = text[:start] + target.description + text[end:]
    text = replace(text, '<Version>1.0.0.8</Version>', '<Version>%s</Version>' % target.version, 1, 'version')
    for old, new in ids.items():
        text = replace(text, 'id="{%s}"' % old.lower(), 'id="{%s}"' % new, 1, 'root component')
    return text


def workflow_ids(target, names):
    return {old_workflow_id(name): new_workflow_id(target, old_workflow_id(name)) for name in names if name.startswith('Workflows/')}


def build(target, out=None):
    if sha256(BASELINE) != BASELINE_SHA256:
        raise ValueError('Baseline is not the registered live 1.0.0.8 export')
    with zipfile.ZipFile(BASELINE) as source:
        infos = source.infolist()
        members = {info.filename: source.read(info) for info in infos}
    ids = workflow_ids(target, members)
    outputs = []
    for info in infos:
        data = members[info.filename]
        name = info.filename
        if name.startswith('Workflows/'):
            text = edit_workflow(target, name, data.decode('utf-8'))
            if target.front_door_lists and workflow_kind(name) == 'SharePointProvisioning':
                text = front_door_lists.dump(front_door_lists.add_front_door_lists(json.loads(text), target.site, target.operators_group))
            data = text.encode('utf-8')
            name = new_workflow_name(target, name, ids)
        elif name == 'customizations.xml':
            data = edit_customizations(target, data.decode('utf-8'), ids).encode('utf-8')
        elif name == 'solution.xml':
            data = edit_solution(target, data.decode('utf-8'), ids).encode('utf-8')
        outputs.append((name, data, info))
    out = Path(out or target.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w') as archive:
        for name, data, info in outputs:
            entry = zipfile.ZipInfo(name, FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = info.external_attr
            archive.writestr(entry, data)
    return out, ids


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--target', required=True, choices=sorted(TARGETS))
    args = parser.parse_args()
    path, identifiers = build(TARGETS[args.target])
    print(path)
    print(sha256(path))
    for old, new in identifiers.items():
        print(old.lower(), '->', new)
