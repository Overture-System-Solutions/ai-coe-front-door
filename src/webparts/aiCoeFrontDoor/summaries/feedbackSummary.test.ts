import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import { buildFeedbackExportText, buildFeedbackRecord, feedbackWhatHappensNext, RESOLUTION_BY_CLARITY } from './feedbackSummary';
import type { IFeedbackRecord } from './feedbackSummary';

const feedback: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).feedback;
const fixedNow: Date = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));

const answers: IAnswers = {
  serviceInvolved: 'toolCheck',
  gotClearNextStep: 'somewhat',
  easeRating: 'easy',
  positiveFeedback: 'Clear questions.',
  frictionPoints: 'Too many steps.',
  followUpPermission: 'yes',
  contactName: 'Pat',
  contactEmail: 'pat@example.com'
};

describe('RESOLUTION_BY_CLARITY', () => {
  it('maps the four clarity answers', () => {
    expect(RESOLUTION_BY_CLARITY.clear).toEqual({ resolutionStatus: 'Reached a clear next step', clarityRating: 'Clear', confidenceInNextStep: 'High' });
    expect(RESOLUTION_BY_CLARITY.notApplicable.confidenceInNextStep).toBe('Not applicable');
  });
});

describe('buildFeedbackRecord', () => {
  it('captures the confirmed feedback', () => {
    const record: IFeedbackRecord = buildFeedbackRecord(feedback, answers, ['Onboarding'], fixedNow, (): string => 'feedback-fixed');
    expect(record).toEqual({
      recordId: 'feedback-fixed',
      createdAt: '2026-09-11T12:00:00.000Z',
      workflowId: 'feedback',
      workflowVersion: '2.0',
      workflowOrService: 'Checking if a tool or task is okay',
      resolutionStatus: 'Partially reached a next step',
      easeRating: 'Easy',
      clarityRating: 'Somewhat clear',
      confidenceInNextStep: 'Medium',
      positiveFeedback: 'Clear questions.',
      frictionPoints: 'Too many steps.',
      suggestedImprovement: 'Not specified',
      suggestedThemes: ['Onboarding'],
      followUpPermission: 'Yes',
      contact: { name: 'Pat', email: 'pat@example.com' },
      status: 'confirmed'
    });
  });

  it('uses placeholders and a null contact without permission', () => {
    const record: IFeedbackRecord = buildFeedbackRecord(feedback, { followUpPermission: 'no' }, [], fixedNow, (): string => 'x');
    expect(record.workflowOrService).toBe('Not specified');
    expect(record.resolutionStatus).toBe('Not applicable');
    expect(record.followUpPermission).toBe('No');
    expect(record.contact).toBeNull();
  });
});

describe('feedbackWhatHappensNext', () => {
  it('differs by contact permission', () => {
    expect(feedbackWhatHappensNext({ followUpPermission: 'yes' })).toBe(
      "Someone from the AI CoE team will read this feedback. Since you said it's okay to reach out, they may contact you about it. The feedback is recorded in the AI CoE service queue."
    );
    expect(feedbackWhatHappensNext({})).toBe(
      'Someone from the AI CoE team will read this feedback. Since you asked not to be contacted, they will not contact you about this feedback. The feedback is recorded in the AI CoE service queue.'
    );
  });
});

describe('buildFeedbackExportText', () => {
  it('reproduces the shipped layout', () => {
    const now: Date = new Date(2026, 8, 11, 10, 0);
    const text: string = buildFeedbackExportText(feedback, { answers, themes: ['Onboarding', 'Speed'] }, createBranding('Overture'), now);
    expect(text.split('\n')).toEqual([
      'Overture AI CoE — I want to give the AI CoE feedback',
      'This feedback is connected to your organization account and is not anonymous.',
      'AI CoE submission summary',
      `Created: ${now.toLocaleString()}`,
      '',
      'Workflow or service involved: Checking if a tool or task is okay',
      'Resolution status: Partially reached a next step',
      'Ease rating: Easy',
      'Clarity rating: Somewhat clear',
      'Confidence in next step: Medium',
      '',
      'What helped:',
      'Clear questions.',
      '',
      'What was confusing or difficult:',
      'Too many steps.',
      '',
      'Suggested improvement:',
      'Not specified',
      '',
      'Suggested themes (not a final classification):',
      '- Onboarding',
      '- Speed',
      '',
      'May the CoE contact you about this? Yes',
      'Contact: Pat (pat@example.com)',
      '',
      feedbackWhatHappensNext(answers)
    ]);
  });

  it('omits the contact line and lists no themes when absent', () => {
    const text: string = buildFeedbackExportText(feedback, { answers: { followUpPermission: 'no' }, themes: [] }, createBranding(''), new Date(2026, 0, 1));
    expect(text.split('\n')[0]).toBe('AI CoE — I want to give the AI CoE feedback');
    expect(text).toContain('Suggested themes (not a final classification):\nNone suggested.');
    expect(text).toContain('May the CoE contact you about this? No\n\n');
    expect(text).not.toContain('Contact:');
  });
});
