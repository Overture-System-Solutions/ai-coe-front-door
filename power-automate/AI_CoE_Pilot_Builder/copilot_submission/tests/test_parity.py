"""Parity: the rows the packaged flow writes equal the rows the front door's own code would write for the same answers.

The front door's TypeScript (summary, review indicators, leader mark, GovernanceService) runs in Node from the
read-only front-door source; the flow runs in the local WDL emulation. Both sides use in-memory fakes, so this is
logic parity, not tenant evidence. Differences that are by design are removed explicitly and nothing else:
  - the per-attempt ids submissionId / recordId;
  - the flow's added payload keys: channel (both kinds) and originalAnswers (feedback only; the front door's feedback
    record has no originalAnswers, and adding them changes no column - checked here by comparing every column).
"""
import json
import shutil
import subprocess
import unittest

import build_copilot_submission as builder
from fake_sharepoint import FRONT_DOOR, FakeSharePoint
from helpers import FRIDAY, SIGNED_IN, THURSDAY, run

import datetime as dt

SATURDAY = dt.datetime(2026, 10, 10, 23, 59, 59, 999000, tzinfo=dt.timezone.utc)
NODE = shutil.which('node')
REFERENCE = builder.HERE / 'parity' / 'reference.cjs'

IDEA = {
    'workToImprove': 'Reviewing incoming referral forms for missing information.',
    'painPoints': 'Each form is checked by hand.', 'peopleInvolved': 'Intake coordinators.', 'frequency': 'daily',
    'timeSpent': 'hours', 'systemsInvolved': '', 'informationUsed': '', 'informationCategories': 'public', 'aiAlreadyUsed': 'no',
    'desiredOutcome': 'Forms get checked faster.', 'successMeasure': '', 'hasDeadlineSponsor': 'no', 'anythingElse': '',
}
FEEDBACK = {'serviceInvolved': 'idea', 'gotClearNextStep': 'clear', 'easeRating': 'easy', 'positiveFeedback': '',
            'frictionPoints': '', 'suggestedImprovement': '', 'followUpPermission': 'no'}
# Copied from summaries/ideaSummary.ts on purpose (not from the builder), so a phrase dropped from the flow is still tested.
FRONT_DOOR_AUTOMATION_PHRASES = ['automatically decide', 'auto-approve', 'automatically approve', 'without a person',
                                 'without human review', 'no human review', 'automatically reject', 'automatically send']

CASES = [
    ('idea-plain', 'idea', IDEA, False, FRIDAY),
    ('idea-internal-labels', 'idea', dict(IDEA, informationCategories='Internal business information; Public information',
                                          frequency='A few times a month', timeSpent='It varies a lot'), False, FRIDAY),
    ('idea-sensitive-everything', 'idea', dict(
        IDEA, informationCategories='customer, otherConfidential, employee, patient', systemsInvolved='EHR + billing/claims',
        aiAlreadyUsed='Yes', aiToolName='ChatGPT Team', successMeasure='Fewer returned forms.', hasDeadlineSponsor='yes',
        deadlineSponsorDetail='Q1 project sponsored by Operations.', anythingElse='Pilot first.',
        painPoints='We want it to auto-approve simple forms without human review.'), False, FRIDAY),
    ('idea-unsure-alone', 'idea', dict(IDEA, informationCategories='I am not sure', aiAlreadyUsed='Not sure',
                                       hasDeadlineSponsor='not sure'), False, FRIDAY),
    ('idea-long-unicode-title', 'idea', dict(
        IDEA, workToImprove='Révision des formulaires — every single incoming referral form, checked before scheduling anyone at all',
        systemsInvolved='One system only'), False, FRIDAY),
    ('idea-leader-thursday', 'idea', IDEA, True, THURSDAY),
    ('idea-leader-saturday-night', 'idea', dict(IDEA, informationCategories='internal'), True, SATURDAY),
    ('idea-automation-upper-case', 'idea', dict(
        IDEA, painPoints='Could it AUTOMATICALLY DECIDE eligibility, with no human review?'), False, FRIDAY),
    ('idea-automation-actions', 'idea', dict(
        IDEA, desiredOutcome='It would automatically send reminders and automatically reject incomplete forms.',
        workToImprove='Approvals that run without a person and automatically approve small refunds.'), False, FRIDAY),
    ('idea-automation-near-miss', 'idea', dict(
        IDEA, desiredOutcome='Automatic sending of reminders after a person checks them.'), False, FRIDAY),
] + [
    # one automation phrase per case, in a different answer and letter case each time, so dropping any phrase shows
    ('idea-automation-%d' % index, 'idea', dict(IDEA, **{field: 'Please let it %s here.' % (phrase.upper() if index % 2 else phrase)}),
     False, FRIDAY)
    for index, (phrase, field) in enumerate(zip(FRONT_DOOR_AUTOMATION_PHRASES, ['desiredOutcome', 'painPoints', 'workToImprove'] * 3))
] + [
    ('feedback-no-contact', 'feedback', FEEDBACK, False, FRIDAY),
    ('feedback-contact-labels', 'feedback', dict(
        FEEDBACK, serviceInvolved='Getting help or training', gotClearNextStep='No, not clear', easeRating='Very difficult',
        positiveFeedback='Friendly.', frictionPoints='Too many questions.', suggestedImprovement='Shorter forms.',
        followUpPermission='Yes'), False, FRIDAY),
    ('feedback-not-applicable', 'feedback', dict(FEEDBACK, serviceInvolved='general', gotClearNextStep='notApplicable',
                                                 easeRating='okay'), False, FRIDAY),
]


def iso(moment):
    return moment.strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (moment.microsecond // 1000)


def flow_side():
    results = {}
    for case_id, kind, values, leader, now in CASES:
        sp = FakeSharePoint()
        if leader:
            sp.groups['AI CoE Leaders'] = [{'Email': SIGNED_IN['requestorEmail'], 'UserPrincipalName': ''}]
        runner, _ = run(kind, values, sp=sp, now=now)
        assert runner.response['status'] == 'saved', (case_id, runner.response, runner.errors)
        posts = [{'list': call[2].split("'")[1], 'body': call[3]} for call in sp.writes()]
        results[case_id] = {'kind': kind, 'leader': leader, 'now': iso(now), 'posts': posts,
                            'answers': json.loads(posts[0]['body']['PayloadJson'])['originalAnswers'],
                            'reference': posts[0]['body']['IntakeId']}
    return results


def reference_side(flow):
    cases = [{'id': case_id, 'kind': item['kind'], 'answers': item['answers'], 'leader': item['leader'], 'now': item['now'],
              'intakeId': item['reference'], 'user': {'name': SIGNED_IN['requestorName'], 'email': SIGNED_IN['requestorEmail']}}
             for case_id, item in flow.items()]
    # UTF-8 both ways: the rows carry em dashes, and Windows would otherwise decode with its ANSI code page.
    done = subprocess.run([NODE, str(REFERENCE), str(FRONT_DOOR), builder.SITE], input=json.dumps(cases), capture_output=True,
                          text=True, encoding='utf-8', timeout=120)
    if done.returncode != 0:
        raise AssertionError('reference run failed: %s' % done.stderr[-2000:])
    return json.loads(done.stdout)


def comparable_payload(text, kind, side):
    payload = json.loads(text)
    payload.pop('submissionId', None)
    payload.pop('recordId', None)
    if side == 'flow':
        payload.pop('channel')
        if kind == 'feedback':
            payload.pop('originalAnswers')
    return payload


class Parity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if NODE is None or FRONT_DOOR is None or not (FRONT_DOOR / 'node_modules' / 'typescript').exists():
            raise AssertionError('parity needs node and the front-door source with its node_modules (not skipped on purpose)')
        cls.flow = flow_side()
        cls.reference = reference_side(cls.flow)
        cls.by_id = {item['id']: item for item in cls.reference['cases']}

    def test_every_case_ran_on_both_sides(self):
        self.assertEqual(sorted(self.by_id), sorted(self.flow))
        self.assertEqual(len(self.flow), len(CASES))
        for case_id, item in self.by_id.items():
            self.assertEqual(item['state'], 'saved', case_id)

    def test_rows_match_column_for_column(self):
        compared = 0
        for case_id, flow in self.flow.items():
            reference = self.by_id[case_id]
            with self.subTest(case=case_id):
                self.assertEqual([p['list'] for p in flow['posts']], [p['list'] for p in reference['posts']])
                for mine, theirs in zip(flow['posts'], reference['posts']):
                    mine_body, their_body = dict(mine['body']), dict(theirs['body'])
                    if 'PayloadJson' in mine_body:
                        self.assertEqual(comparable_payload(mine_body.pop('PayloadJson'), flow['kind'], 'flow'),
                                         comparable_payload(their_body.pop('PayloadJson'), flow['kind'], 'reference'))
                    self.assertEqual(mine_body, their_body)
                    compared += 1
        self.assertEqual(compared, 39)   # 18 ideas x 2 rows + 3 feedback x 1 row

    def test_questions_and_options_are_the_front_doors(self):
        steps = {kind: {s['id']: s for s in self.reference['definitions'][kind]} for kind in ('idea', 'feedback')}
        for kind, options in (('feedback', builder.FEEDBACK_OPTIONS), ('idea', builder.IDEA_OPTIONS)):
            for field, (title, choices) in options.items():
                self.assertEqual(title, steps[kind][field]['title'], field)
                self.assertEqual([list(c) for c in choices], steps[kind][field]['options'], field)
        for field, title in builder.FEEDBACK_TEXTS.items():
            self.assertEqual(title, steps['feedback'][field]['title'])
        for field, (title, required) in builder.IDEA_TEXTS.items():
            self.assertEqual(title, steps['idea'][field]['title'])
            self.assertEqual(required or field == 'deadlineSponsorDetail', steps['idea'][field]['required'], field)

    def test_every_front_door_question_is_covered(self):
        covered = {'idea': set(builder.IDEA_OPTIONS) | set(builder.IDEA_TEXTS) | {'aiToolName'},
                   'feedback': set(builder.FEEDBACK_OPTIONS) | set(builder.FEEDBACK_TEXTS)}
        by_signed_in = {'feedback': {'contactName', 'contactEmail'}, 'idea': set()}
        for kind in ('idea', 'feedback'):
            asked = {s['id'] for s in self.reference['definitions'][kind] if s['type'] != 'notice'}
            self.assertEqual(asked - covered[kind] - by_signed_in[kind], set(), kind)


if __name__ == '__main__':
    unittest.main()
