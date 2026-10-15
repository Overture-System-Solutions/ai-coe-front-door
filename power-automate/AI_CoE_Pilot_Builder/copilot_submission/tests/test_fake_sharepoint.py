"""Guards on the fake SharePoint itself, so a fake that silently accepts everything cannot make the flow tests pass."""
import unittest

from fake_sharepoint import FakeSharePoint, SITE

HOST = {'apiId': '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', 'operationId': 'HttpRequest',
        'connectionName': 'shared_sharepointonline'}
HEADERS = {'Accept': 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata'}


def post(sp, title, body):
    return sp('Test', HOST, {'dataset': SITE, 'parameters/method': 'POST', 'parameters/headers': HEADERS,
                             'parameters/uri': "_api/web/lists/getbytitle('%s')/items" % title, 'parameters/body': body})


class FakeSchemas(unittest.TestCase):
    def test_intake_schema_is_the_front_door_package_schema(self):
        schema = FakeSharePoint().schemas['AI CoE Pilot Intakes']
        for column in ('IntakeId', 'WorkflowType', 'RequestorEmail', 'SubmittedAt', 'PayloadJson', 'PilotOnly', 'Priority'):
            self.assertIn(column, schema)
        self.assertEqual(schema['ToolName']['max'], 255)
        self.assertIn('Submitted - Pilot', schema['Status']['choices'])
        self.assertEqual(set(schema['Priority']['choices']) >= {'High', 'Normal'}, True)

    def test_use_case_schema_comes_from_provisioning(self):
        schema = FakeSharePoint().schemas['AI CoE Use Cases']
        self.assertEqual(schema['NextReviewDate']['kind'], 'DateTime')
        self.assertEqual(schema['IntakeProcessed']['kind'], 'Boolean')
        self.assertEqual(schema['EstimatedMonthlyCost']['kind'], 'Number')

    def test_unknown_columns_wrong_types_and_long_text_are_refused(self):
        sp = FakeSharePoint()
        self.assertEqual(post(sp, 'AI CoE Use Cases', {'NoSuchColumn': 'x'})[0], 400)
        self.assertEqual(post(sp, 'AI CoE Use Cases', {'IntakeProcessed': 'false'})[0], 400)
        self.assertEqual(post(sp, 'AI CoE Use Cases', {'Title': 'x' * 256})[0], 400)
        self.assertEqual(post(sp, 'AI CoE Pilot Intakes', {'Title': 'only a title'})[0], 400)


if __name__ == '__main__':
    unittest.main()
