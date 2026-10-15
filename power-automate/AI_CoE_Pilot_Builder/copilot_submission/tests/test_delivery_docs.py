"""The delivery documents match the package: names a person has to find in the tenant are spelled exactly."""
import unittest

import build_copilot_submission as builder
import profiles
from helpers import final_name

START_HERE = (builder.DELIVERY / 'START_HERE.txt').read_text(encoding='utf-8')
INSTRUCTIONS = (builder.OUT_FOLDER / 'CONCIERGE_INSTRUCTIONS.txt').read_text(encoding='utf-8')
TOOL_NAMES = ['Submit AI CoE feedback', 'Submit AI CoE idea']


class DeliveryDocuments(unittest.TestCase):
    def test_flow_and_connection_names_are_the_packaged_ones(self):
        for flow in builder.FLOWS.values():
            self.assertIn('"%s"' % final_name(flow['name']), START_HERE)
        self.assertIn('"%s"' % final_name(builder.CONNECTION_REFERENCE_DISPLAY), START_HERE)
        self.assertIn(profiles.output_file(builder.TARGET, 'copilot_submission').split('/')[-1], START_HERE)

    def test_bound_inputs_are_named_with_their_system_variables(self):
        for (name, title, description), variable in zip(builder.BOUND_INPUTS, ['System.User.Email', 'System.User.DisplayName',
                                                                                'System.Conversation.Id']):
            self.assertIn(variable, description)
            line = [l for l in START_HERE.splitlines() if l.strip().startswith(title)]
            self.assertEqual(len(line), 1, title)
            self.assertIn(variable, line[0])

    def test_instructions_are_the_template_rendered_for_the_target(self):
        self.assertEqual(INSTRUCTIONS, builder.concierge_instructions())
        self.assertLess(len(INSTRUCTIONS), 8000)
        for tool in TOOL_NAMES:
            self.assertIn(tool, INSTRUCTIONS)
            self.assertIn(tool, START_HERE)
        self.assertIn(builder.SITE, INSTRUCTIONS.splitlines()[0])
        self.assertIn("%s's AI CoE SharePoint site" % builder.ORGANIZATION, INSTRUCTIONS.splitlines()[0])
        for status in ('saved', 'already_saved', 'needs_changes', 'not_confirmed', 'incomplete', 'failed'):
            self.assertIn(status, INSTRUCTIONS)
        self.assertNotIn('osscontact', INSTRUCTIONS)
        self.assertNotIn('Overture', INSTRUCTIONS)

    def test_the_template_text_names_no_tenant(self):
        template = builder.CONCIERGE_TEMPLATE.read_text(encoding='utf-8')
        self.assertEqual(template.count('{organization}'), 1)
        self.assertEqual(template.count('{site}'), 1)
        self.assertNotIn('sharepoint.com', template)


if __name__ == '__main__':
    unittest.main()
