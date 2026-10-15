"""profiles.py: what each profile calls things, and the exact renames from the pilot names to the template names."""
import tempfile
import unittest
from pathlib import Path

import profiles
import target_file

BUILDER = Path(__file__).resolve().parent.parent
TEMPLATE = target_file.load(BUILDER / 'targets' / 'template.json')


def import_build():
    path = Path(tempfile.mkdtemp(prefix='profile-')) / 'tenant.json'
    path.write_text(TEMPLATE.source.read_text(encoding='utf-8')
                    .replace('"reference_build": true', '"reference_build": false')
                    .replace('"connector_api_name": null', '"connector_api_name": "shared_aicoe-5fai-20coe-20claude-20draft-5f0123456789abcdef"')
                    .replace('contoso', 'northwind'), encoding='utf-8')
    return target_file.load(path)


class Files(unittest.TestCase):
    def test_template_reference_files_are_labelled_except_the_connector(self):
        self.assertEqual([profiles.output_file(TEMPLATE, p) for p in profiles.PACKAGES], [
            '01_AICoEClaudeConnector_1_0_0_0.zip',
            '02_AICoEWorkflows_1_0_0_0_REFERENCE_NOT_FOR_IMPORT.zip',
            '03_AICoEClaudeIdeaDraft_1_0_0_0_REFERENCE_NOT_FOR_IMPORT.zip',
            '04_case_analysis/AICoEClaudeCaseAnalysis_1_0_0_0_REFERENCE_NOT_FOR_IMPORT.zip',
            '06_copilot_submission/AICoECopilotSubmission_1_0_0_0_REFERENCE_NOT_FOR_IMPORT.zip'])

    def test_an_import_build_is_not_labelled(self):
        self.assertEqual(profiles.output_file(import_build(), 'workflows'), '02_AICoEWorkflows_1_0_0_0.zip')

    def test_the_pilot_profile_keeps_the_delivered_file_names(self):
        self.assertEqual(profiles.PILOT_FILES['workflows'], '02_AICoEPrivatePilot_Workflows_1_0_0_2.zip')
        self.assertEqual(profiles.PILOT_FILES['connector'], '01_ClaudeConnector_OSSCloudWaveClaudeDraftConnector_1_0_0_3.zip')


class Renames(unittest.TestCase):
    def test_the_approved_template_names(self):
        t = import_build()
        cases = [
            ('connector', 'OSSCloudWaveClaudeDraftConnector', 'AICoEClaudeConnector'),
            ('connector', 'OSS Claude Intake Draft', 'AI CoE Claude Draft'),
            ('connector', 'cwdd_ossclaudeintakedraft', 'aicoe_claudedraft'),
            ('workflows', 'AICoEPrivatePilot', 'AICoEWorkflows'),
            ('workflows', 'description="AI CoE Private Pilot"', 'description="AI CoE Workflows"'),
            ('workflows', 'AI CoE Pilot — Intake Processing', 'AI CoE — Intake Processing'),
            ('workflows', '[AI CoE Pilot] Submission received.', '[AI CoE] Submission received.'),
            ('workflows', 'cwdd_aicoepilotsharepoint', 'aicoe_sharepoint'),
            ('idea_draft', 'AICoEPilotClaudeIdeaDraft', 'AICoEClaudeIdeaDraft'),
            ('idea_draft', 'AI CoE Pilot - Claude Idea Draft', 'AI CoE - Claude Idea Draft'),
            ('case_analysis', 'AICoEPilotClaudeCaseAnalysis', 'AICoEClaudeCaseAnalysis'),
            ('case_analysis', 'AI CoE Pilot - Claude Case Analysis', 'AI CoE - Claude Case Analysis'),
            ('copilot_submission', 'AICoEPilotCopilotSubmission', 'AICoECopilotSubmission'),
            ('copilot_submission', 'AI CoE Pilot — Copilot Submit Idea', 'AI CoE — Copilot Submit Idea'),
            ('copilot_submission', '<UniqueName>OSSCloudWaveDemoPublisher</UniqueName>', '<UniqueName>AICoETemplate</UniqueName>'),
            ('copilot_submission', '<CustomizationPrefix>cwdd</CustomizationPrefix>', '<CustomizationPrefix>aicoe</CustomizationPrefix>'),
        ]
        for package, old, new in cases:
            with self.subTest(old=old):
                self.assertEqual(profiles.rename(t, package, old), new)

    def test_the_front_doors_own_list_and_column_names_are_not_renamed(self):
        t = import_build()
        for package in profiles.PACKAGES:
            for text in ('AI CoE Pilot Intakes', 'PilotMeasure', 'Submitted - Pilot', 'X-OSS-Flow-Run-ID'):
                self.assertEqual(profiles.rename(t, package, text), text)

    def test_a_reference_build_labels_the_solution_display_name(self):
        self.assertEqual(profiles.rename(TEMPLATE, 'workflows', 'description="AI CoE Private Pilot"'),
                         'description="AI CoE Workflows (reference build - not for import)"')
        self.assertEqual(profiles.rename(TEMPLATE, 'case_analysis', 'LOCAL FIXTURE ONLY - NOT FOR IMPORT'),
                         'AI CoE Claude Case Analysis (reference build - not for import)')
        self.assertEqual(profiles.rename(TEMPLATE, 'connector', 'OSS CloudWave Claude Draft Connector'), 'AI CoE Claude Connector')

    def test_flows_bind_to_the_targets_connector(self):
        t = import_build()
        self.assertEqual(profiles.rename(t, 'idea_draft', profiles.INTERMEDIATE_API), t.connector_api_name)
        self.assertEqual(profiles.rename(t, 'case_analysis', profiles.PILOT_CONNECTOR_ID), profiles.AICOE_CONNECTOR_ID)
        self.assertEqual(profiles.rename(t, 'connector', profiles.PILOT_CONNECTOR_ID), profiles.AICOE_CONNECTOR_ID)

    def test_the_pilot_profile_renames_nothing(self):
        pilot = target_file.load(TEMPLATE.source)  # profile is read from the file; build a pilot copy below
        path = Path(tempfile.mkdtemp(prefix='profile-')) / 'pilot.json'
        path.write_text(pilot.source.read_text(encoding='utf-8').replace('"aicoe"', '"pilot"'), encoding='utf-8')
        pilot = target_file.load(path)
        for package in profiles.PACKAGES:
            self.assertEqual(profiles.mapping(pilot, package), [])
            self.assertEqual(profiles.output_file(pilot, package), profiles.PILOT_FILES[package])


class Governance(unittest.TestCase):
    def test_the_governance_target_takes_the_tenant_values_and_the_pilot_names(self):
        t = import_build()
        g = profiles.governance_target(t, Path('x.zip'))
        self.assertEqual((g.site, g.recipients, g.description), (t.site, t.recipients, t.governance_description))
        self.assertEqual((g.solution, g.flow_prefix, g.version, g.front_door_lists, g.strict_wording),
                         ('AICoEPrivatePilot', 'AI CoE Pilot', '1.0.0.2', True, True))


if __name__ == '__main__':
    unittest.main()
