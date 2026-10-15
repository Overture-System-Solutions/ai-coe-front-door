"""Behaviour of the packaged "Submit feedback" flow, executed locally from the built ZIP (fake SharePoint)."""
import re
import unittest

from fake_sharepoint import FakeSharePoint
from helpers import SIGNED_IN, payload, run

INTAKES = 'AI CoE Pilot Intakes'
REFERENCE = re.compile(r'^OVT-AICOE-20261009-[0-9A-Z]{8}$')

GOOD = {'serviceInvolved': 'idea', 'gotClearNextStep': 'clear', 'easeRating': 'easy',
        'positiveFeedback': 'The questions were easy.', 'frictionPoints': '', 'suggestedImprovement': 'More examples.',
        'followUpPermission': 'no'}


class SavedFeedback(unittest.TestCase):
    def test_new_feedback_is_written_read_back_and_reported_saved(self):
        runner, sp = run('feedback', GOOD)
        rows = sp.rows(INTAKES)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(runner.response['status'], 'saved')
        self.assertRegex(row['IntakeId'], REFERENCE)
        self.assertEqual(runner.response['reference'], row['IntakeId'])
        self.assertIn(row['IntakeId'], runner.response['message'])
        self.assertEqual(row['Title'], 'Front-door feedback — ' + row['IntakeId'])
        self.assertEqual(row['WorkflowType'], 'feedback')
        self.assertEqual(row['Status'], 'Submitted - Pilot')
        self.assertEqual(row['Priority'], 'Normal')
        self.assertIs(row['PilotOnly'], True)
        self.assertEqual(row['RequestorEmail'], SIGNED_IN['requestorEmail'])
        self.assertEqual(row['RequestorName'], SIGNED_IN['requestorName'])
        self.assertEqual(row['ToolName'], 'Sharing an idea for using AI')
        self.assertEqual(row['RoutingOutcome'], 'AI CoE service queue')
        self.assertNotIn('Use Cases', ' '.join(call[2] for call in sp.writes()))

    def test_option_labels_are_accepted_like_codes(self):
        _, sp = run('feedback', dict(GOOD, easeRating='Very easy', gotClearNextStep='somewhat clear'))
        record = payload(sp.rows(INTAKES)[0])
        self.assertEqual(record['easeRating'], 'Very easy')
        self.assertEqual(record['clarityRating'], 'Somewhat clear')
        self.assertEqual(record['originalAnswers']['easeRating'], 'veryEasy')

    def test_payload_records_the_copilot_channel_and_no_contact_without_permission(self):
        runner, sp = run('feedback', GOOD)
        record = payload(sp.rows(INTAKES)[0])
        self.assertEqual(record['channel'], {'name': 'AI CoE Concierge (Copilot)', 'conversationId': 'conv-001'})
        self.assertIsNone(record['contact'])
        self.assertEqual(record['followUpPermission'], 'No')
        self.assertEqual(record['frictionPoints'], 'Not specified')
        self.assertIn('will not contact you', runner.response['message'])

    def test_contact_is_the_signed_in_person_when_permitted(self):
        runner, sp = run('feedback', dict(GOOD, followUpPermission='Yes'))
        record = payload(sp.rows(INTAKES)[0])
        self.assertEqual(record['contact'], {'name': 'Casey Lee', 'email': 'casey.lee@contoso.com'})
        self.assertIn('may contact you', runner.response['message'])


class RefusedFeedback(unittest.TestCase):
    def assert_refused(self, values, fragment, signed_in=None):
        runner, sp = run('feedback', values, signed_in=signed_in)
        self.assertEqual(runner.response['status'], 'needs_changes')
        self.assertEqual(runner.response['reference'], '')
        self.assertIn(fragment, runner.response['message'])
        self.assertEqual(sp.writes(), [])
        return runner

    def test_unknown_option_is_refused_with_the_question(self):
        self.assert_refused(dict(GOOD, easeRating='fantastic'), 'How easy was the process')

    def test_missing_required_option_is_refused(self):
        self.assert_refused(dict(GOOD, followUpPermission=None), 'May the CoE contact you')

    def test_missing_signed_in_identity_points_at_the_tool_mapping(self):
        self.assert_refused(GOOD, 'input mapping', signed_in={'requestorEmail': '', 'requestorName': 'Casey', 'conversationId': 'c'})
        self.assert_refused(GOOD, 'input mapping', signed_in={'requestorEmail': 'not-an-email', 'requestorName': 'Casey', 'conversationId': 'c'})
        self.assert_refused(GOOD, 'input mapping', signed_in={'requestorEmail': 'a@b.com', 'requestorName': 'Casey', 'conversationId': ''})

    def test_overlong_text_is_refused(self):
        self.assert_refused(dict(GOOD, suggestedImprovement='x' * 1501), 'too long')


class RepeatsAndFailures(unittest.TestCase):
    def test_the_same_submission_in_the_same_conversation_is_not_written_twice(self):
        first, sp = run('feedback', GOOD)
        second, _ = run('feedback', GOOD, sp=sp)
        self.assertEqual(len(sp.rows(INTAKES)), 1)
        self.assertEqual(second.response['status'], 'already_saved')
        self.assertEqual(second.response['reference'], first.response['reference'])

    def test_different_answers_in_the_same_conversation_are_a_new_submission(self):
        _, sp = run('feedback', GOOD)
        run('feedback', dict(GOOD, easeRating='difficult'), sp=sp)
        self.assertEqual(len(sp.rows(INTAKES)), 2)

    def test_the_same_answers_in_another_conversation_are_a_new_submission(self):
        _, sp = run('feedback', GOOD)
        run('feedback', GOOD, sp=sp, signed_in=dict(SIGNED_IN, conversationId='conv-002'))
        self.assertEqual(len(sp.rows(INTAKES)), 2)

    def test_another_persons_identical_feedback_is_not_their_duplicate(self):
        _, sp = run('feedback', GOOD)
        runner, _ = run('feedback', GOOD, sp=sp, signed_in=dict(SIGNED_IN, requestorEmail='other@contoso.com'))
        self.assertEqual(runner.response['status'], 'saved')
        self.assertEqual(len(sp.rows(INTAKES)), 2)

    def test_a_failed_write_claims_nothing(self):
        sp = FakeSharePoint()
        sp.fail_post[INTAKES] = 503
        runner, _ = run('feedback', GOOD, sp=sp)
        self.assertEqual(runner.response['status'], 'failed')
        self.assertEqual(runner.response['reference'], '')
        self.assertEqual(sp.rows(INTAKES), [])

    def test_an_unconfirmed_write_is_reported_and_a_retry_does_not_duplicate_it(self):
        sp = FakeSharePoint()
        sp.hide_intake_reads = 1
        first, _ = run('feedback', GOOD, sp=sp)
        self.assertEqual(first.response['status'], 'not_confirmed')
        self.assertRegex(first.response['reference'], REFERENCE)
        second, _ = run('feedback', GOOD, sp=sp)
        self.assertEqual(second.response['status'], 'already_saved')
        self.assertEqual(second.response['reference'], first.response['reference'])
        self.assertEqual(len(sp.rows(INTAKES)), 1)

    def test_an_unreadable_earlier_lookup_writes_nothing(self):
        sp = FakeSharePoint()
        original = sp._read

        def refuse(title, item_id, options):
            return 500, {'odata.error': {'message': {'value': 'throttled'}}}
        sp._read = refuse
        runner, _ = run('feedback', GOOD, sp=sp)
        self.assertEqual(runner.response['status'], 'failed')
        self.assertEqual(sp.writes(), [])
        sp._read = original


if __name__ == '__main__':
    unittest.main()
