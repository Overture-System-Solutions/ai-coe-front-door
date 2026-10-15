"""Behaviour of the packaged "Submit idea" flow, executed locally from the built ZIP (fake SharePoint)."""
import unittest

from fake_sharepoint import FakeSharePoint
from helpers import FRIDAY, SIGNED_IN, THURSDAY, payload, run

INTAKES = 'AI CoE Pilot Intakes'
USE_CASES = 'AI CoE Use Cases'

IDEA = {
    'workToImprove': 'Reviewing incoming referral forms for missing information.',
    'painPoints': 'Each form is checked by hand.',
    'peopleInvolved': 'Intake coordinators.',
    'frequency': 'daily',
    'timeSpent': 'hours',
    'systemsInvolved': '',
    'informationUsed': 'Form completeness only.',
    'informationCategories': 'public',
    'aiAlreadyUsed': 'no',
    'desiredOutcome': 'Forms get checked faster.',
    'successMeasure': '',
    'hasDeadlineSponsor': 'no',
    'anythingElse': '',
}


def rows(sp):
    return sp.rows(INTAKES), sp.rows(USE_CASES)


class SavedIdea(unittest.TestCase):
    def test_low_risk_idea_writes_intake_and_use_case_rows(self):
        runner, sp = run('idea', IDEA)
        intakes, cases = rows(sp)
        self.assertEqual((len(intakes), len(cases)), (1, 1))
        intake, case = intakes[0], cases[0]
        self.assertEqual(runner.response['status'], 'saved')
        self.assertEqual(runner.response['reference'], intake['IntakeId'])
        self.assertEqual(intake['Title'], 'AI idea — ' + intake['IntakeId'])
        self.assertEqual((intake['WorkflowType'], intake['PilotWorkflowVersion'], intake['PilotOnly']), ('idea', '2.1', False))
        self.assertEqual((intake['Priority'], intake['RoutingOutcome']), ('Normal', 'AI CoE service queue'))
        self.assertEqual((intake['CompanyDataOrWorkflow'], intake['SensitiveOrRegulated']), (False, False))
        self.assertEqual(case['CoEID'], intake['IntakeId'])
        self.assertEqual(case['Title'], intake['Title'])
        self.assertEqual((case['Status'], case['IntakeProcessed'], case['TriageComplete'], case['ApprovalRequested']),
                         ('Submitted', False, False, False))
        self.assertEqual((case['SubmitterEmail'], case['BusinessOwnerEmail']), (SIGNED_IN['requestorEmail'],) * 2)
        self.assertEqual(case['BusinessProblem'], IDEA['painPoints'])
        self.assertEqual(case['DataSensitivity'], 'Internal')
        self.assertEqual(case['PilotMeasure'], 'Forms get checked faster.\n\nNot specified\n\nForms get checked faster.')
        self.assertNotIn('NextReviewDate', case)
        self.assertIn('intake and triage', runner.response['message'])
        self.assertNotIn('closer look', runner.response['message'])

    def test_payload_carries_answers_summary_indicators_and_channel(self):
        _, sp = run('idea', IDEA)
        record = payload(sp.rows(INTAKES)[0])
        self.assertEqual(record['workflowId'], 'idea')
        self.assertEqual(record['originalAnswers']['informationCategories'], ['public'])
        self.assertEqual(record['confirmedSummary']['frequencyAndEffort'], 'Every day; A few hours')
        self.assertEqual(record['confirmedSummary']['informationCategories'], 'Public information')
        self.assertEqual(record['reviewIndicators'], [])
        self.assertEqual(record['channel']['conversationId'], 'conv-001')
        self.assertNotIn('reviewPriority', record)

    def test_internal_information_needs_review(self):
        runner, sp = run('idea', dict(IDEA, informationCategories='Public information, internal'))
        intake, case = sp.rows(INTAKES)[0], sp.rows(USE_CASES)[0]
        self.assertEqual((intake['Priority'], intake['RoutingOutcome']), ('High', 'AI CoE governance review'))
        self.assertIs(intake['CompanyDataOrWorkflow'], True)
        self.assertEqual(case['DataSensitivity'], 'Confidential')
        self.assertEqual(payload(intake)['originalAnswers']['informationCategories'], ['public', 'internal'])

    def test_patient_information_is_restricted_with_indicators(self):
        runner, sp = run('idea', dict(IDEA, informationCategories='patient; employee', systemsInvolved='EHR and a spreadsheet',
                                      desiredOutcome='The tool could automatically send reminders.'))
        intake, case = sp.rows(INTAKES)[0], sp.rows(USE_CASES)[0]
        self.assertIs(intake['SensitiveOrRegulated'], True)
        self.assertEqual(case['DataSensitivity'], 'Restricted')
        self.assertEqual(payload(intake)['reviewIndicators'], [
            'Patient or other confidential information may be involved',
            'Employee or customer information may be involved',
            'Multiple systems may need to be connected',
            'Automated decisions or actions may be involved'])
        self.assertEqual(payload(intake)['originalAnswers']['informationCategories'], ['employee', 'patient'])
        self.assertIn('closer look', runner.response['message'])

    def test_tool_in_use_is_recorded_and_hidden_answers_are_dropped(self):
        _, sp = run('idea', dict(IDEA, aiAlreadyUsed='Yes', aiToolName='ChatGPT'))
        intake = sp.rows(INTAKES)[0]
        self.assertEqual(intake['ToolName'], 'ChatGPT')
        self.assertEqual(payload(intake)['confirmedSummary']['currentAiActivity'], 'Yes — ChatGPT')
        self.assertIn('An AI tool may already be in use for this work', payload(intake)['reviewIndicators'])
        _, sp = run('idea', dict(IDEA, aiAlreadyUsed='no', aiToolName='Stale', deadlineSponsorDetail='Stale too'))
        answers = payload(sp.rows(INTAKES)[0])['originalAnswers']
        self.assertEqual((answers['aiToolName'], answers['deadlineSponsorDetail']), ('', ''))
        self.assertEqual(sp.rows(INTAKES)[0]['ToolName'], '')

    def test_long_title_is_shortened_like_the_front_door(self):
        work = 'Reviewing every single incoming referral form for missing information before scheduling anyone'
        _, sp = run('idea', dict(IDEA, workToImprove=work))
        title = payload(sp.rows(INTAKES)[0])['confirmedSummary']['title']
        self.assertEqual(title, work[:69].strip() + '…')


class LeaderPriority(unittest.TestCase):
    def leader_site(self):
        sp = FakeSharePoint()
        sp.groups['AI CoE Leaders'] = [{'Email': 'CASEY.LEE@contoso.com', 'UserPrincipalName': 'casey.lee@contoso.com'}]
        return sp

    def test_a_leaders_idea_is_marked_and_given_a_review_date_two_working_days_later(self):
        _, sp = run('idea', IDEA, sp=self.leader_site(), now=THURSDAY)
        intake, case = sp.rows(INTAKES)[0], sp.rows(USE_CASES)[0]
        self.assertEqual(intake['Priority'], 'High')
        self.assertEqual(payload(intake)['reviewPriority'],
                         {'level': 'executive', 'reason': 'Submitted by a member of the leaders group; reviewed sooner.'})
        self.assertEqual(case['NextReviewDate'], '2026-10-12T14:03:12.345Z')

    def test_friday_moves_to_tuesday(self):
        _, sp = run('idea', IDEA, sp=self.leader_site(), now=FRIDAY)
        self.assertEqual(sp.rows(USE_CASES)[0]['NextReviewDate'], '2026-10-13T14:03:12.345Z')

    def test_a_missing_leaders_group_never_marks(self):
        runner, sp = run('idea', IDEA)
        self.assertEqual(runner.response['status'], 'saved')
        self.assertEqual(sp.rows(INTAKES)[0]['Priority'], 'Normal')


class RefusedIdea(unittest.TestCase):
    def assert_refused(self, values, fragment):
        runner, sp = run('idea', values)
        self.assertEqual(runner.response['status'], 'needs_changes')
        self.assertIn(fragment, runner.response['message'])
        self.assertEqual(sp.writes(), [])

    def test_required_answers(self):
        self.assert_refused(dict(IDEA, painPoints=''), 'What makes this work slow')
        self.assert_refused(dict(IDEA, frequency='hourly'), 'How often does it happen')

    def test_information_kinds(self):
        self.assert_refused(dict(IDEA, informationCategories=''), 'What kind of information')
        self.assert_refused(dict(IDEA, informationCategories='public, gossip'), 'What kind of information')
        self.assert_refused(dict(IDEA, informationCategories='unsure, public'), 'not sure')

    def test_conditional_answers(self):
        self.assert_refused(dict(IDEA, aiAlreadyUsed='yes', aiToolName=''), 'What tool or tools')
        self.assert_refused(dict(IDEA, aiAlreadyUsed='yes', aiToolName='x' * 256), 'What tool or tools')
        self.assert_refused(dict(IDEA, hasDeadlineSponsor='yes'), 'deadline, sponsor, or project')

    def test_long_answers(self):
        self.assert_refused(dict(IDEA, anythingElse='x' * 1501), 'too long')


class RepeatsAndRepairs(unittest.TestCase):
    def test_repeat_returns_the_earlier_record(self):
        first, sp = run('idea', IDEA)
        second, _ = run('idea', IDEA, sp=sp)
        self.assertEqual(second.response['status'], 'already_saved')
        self.assertEqual(second.response['reference'], first.response['reference'])
        self.assertEqual([len(r) for r in rows(sp)], [1, 1])

    def test_a_missing_use_case_is_reported_and_finished_on_retry(self):
        sp = FakeSharePoint()
        sp.fail_post[USE_CASES] = 500
        first, _ = run('idea', IDEA, sp=sp)
        self.assertEqual(first.response['status'], 'incomplete')
        self.assertEqual([len(r) for r in rows(sp)], [1, 0])
        second, _ = run('idea', IDEA, sp=sp)
        self.assertEqual(second.response['status'], 'already_saved')
        self.assertEqual([len(r) for r in rows(sp)], [1, 1])
        self.assertEqual(sp.rows(USE_CASES)[0]['CoEID'], first.response['reference'])
        self.assertEqual(sp.rows(USE_CASES)[0]['LastStatusChanged'], sp.rows(INTAKES)[0]['SubmittedAt'][:19] + 'Z')

    def test_a_retried_leader_repair_keeps_the_original_mark(self):
        sp = FakeSharePoint()
        sp.groups['AI CoE Leaders'] = [{'Email': 'casey.lee@contoso.com', 'UserPrincipalName': ''}]
        sp.fail_post[USE_CASES] = 500
        run('idea', IDEA, sp=sp, now=THURSDAY)
        sp.groups.clear()
        run('idea', IDEA, sp=sp, now=FRIDAY)
        self.assertEqual(sp.rows(USE_CASES)[0]['NextReviewDate'], '2026-10-12T14:03:12.000Z')


if __name__ == '__main__':
    unittest.main()
