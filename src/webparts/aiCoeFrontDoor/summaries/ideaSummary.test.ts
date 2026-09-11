import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import {
  buildIdeaExportText,
  buildIdeaSummaryDraft,
  IDEA_SUMMARY_FIELDS,
  ideaReviewIndicators,
  ideaWhatHappensNext,
  truncateText
} from './ideaSummary';
import type { IIdeaSummaryDraft } from './ideaSummary';

const idea: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).idea;

const answers: IAnswers = {
  workToImprove: 'Reviewing incoming referral forms for missing information',
  painPoints: 'Each form is checked by hand.',
  peopleInvolved: 'Intake coordinators',
  frequency: 'daily',
  timeSpent: 'hours',
  systemsInvolved: 'A scheduling system and a shared spreadsheet',
  informationCategories: ['internal', 'customer'],
  aiAlreadyUsed: 'yes',
  aiToolName: 'Copilot',
  desiredOutcome: 'Forms get checked faster.',
  successMeasure: 'Fewer forms sent back.'
};

describe('IDEA_SUMMARY_FIELDS', () => {
  it('lists the twelve summary fields in order', () => {
    expect(IDEA_SUMMARY_FIELDS.map((field) => field.key)).toEqual([
      'title', 'problemToSolve', 'currentProcess', 'peopleAffected', 'frequencyAndEffort', 'systemsInvolved',
      'informationCategories', 'currentAiActivity', 'desiredOutcome', 'possibleMeasuresOfSuccess', 'openQuestions', 'suggestedNextStep'
    ]);
    expect(IDEA_SUMMARY_FIELDS[0]).toEqual({ key: 'title', label: 'Suggested use-case title', multiline: false });
    expect(IDEA_SUMMARY_FIELDS[4].label).toBe('Frequency and estimated effort');
  });
});

describe('truncateText', () => {
  it('trims and shortens with an ellipsis', () => {
    expect(truncateText(undefined, 5)).toBe('');
    expect(truncateText('  abc  ', 5)).toBe('abc');
    expect(truncateText('abcdefgh', 5)).toBe('abcd…');
    expect(truncateText('abcd efgh', 6)).toBe('abcd…');
  });
});

describe('buildIdeaSummaryDraft', () => {
  it('follows the answers without AI assistance', () => {
    const draft: IIdeaSummaryDraft = buildIdeaSummaryDraft(idea, answers);
    expect(draft).toEqual({
      title: 'Reviewing incoming referral forms for missing information',
      problemToSolve: 'Each form is checked by hand.',
      currentProcess: 'Reviewing incoming referral forms for missing information',
      peopleAffected: 'Intake coordinators',
      frequencyAndEffort: 'Every day; A few hours',
      systemsInvolved: 'A scheduling system and a shared spreadsheet',
      informationCategories: 'Internal business information, Customer information',
      currentAiActivity: 'Yes — Copilot',
      desiredOutcome: 'Forms get checked faster.',
      possibleMeasuresOfSuccess: 'Fewer forms sent back.',
      openQuestions: 'This draft was created without AI assistance, so it closely follows the original answers.',
      suggestedNextStep: 'An AI CoE team member will review this idea.'
    });
  });

  it('uses placeholders and truncates long titles', () => {
    const draft: IIdeaSummaryDraft = buildIdeaSummaryDraft(idea, { workToImprove: 'x'.repeat(80), aiAlreadyUsed: 'no' });
    expect(draft.title).toBe(`${'x'.repeat(69)}…`);
    expect(draft.problemToSolve).toBe('Not specified');
    expect(draft.frequencyAndEffort).toBe('Not specified; Not specified');
    expect(draft.informationCategories).toBe('Not specified');
    expect(draft.currentAiActivity).toBe('No');
    expect(buildIdeaSummaryDraft(idea, {}).title).toBe('Untitled idea');
    expect(buildIdeaSummaryDraft(idea, {}).currentAiActivity).toBe('Not specified');
    expect(buildIdeaSummaryDraft(idea, { aiAlreadyUsed: 'yes' }).currentAiActivity).toBe('Yes');
  });
});

describe('ideaReviewIndicators', () => {
  it('reports each shipped indicator label', () => {
    expect(ideaReviewIndicators(answers)).toEqual([
      'Employee or customer information may be involved',
      'An AI tool may already be in use for this work',
      'Multiple systems may need to be connected'
    ]);
    expect(ideaReviewIndicators({ informationCategories: ['patient'], systemsInvolved: 'CRM' })).toEqual([
      'Patient or other confidential information may be involved'
    ]);
    expect(ideaReviewIndicators({ informationCategories: ['unsure'], desiredOutcome: 'Auto-approve the routine ones' })).toEqual([
      'The employee is unsure about the information involved',
      'Automated decisions or actions may be involved'
    ]);
    expect(ideaReviewIndicators({ systemsInvolved: 'CRM; Excel' })).toEqual(['Multiple systems may need to be connected']);
    expect(ideaReviewIndicators({})).toEqual([]);
  });
});

describe('ideaWhatHappensNext', () => {
  it('adds the closer-look sentence when indicators exist', () => {
    expect(ideaWhatHappensNext(idea, answers)).toBe(
      `${idea.whatHappensNext} Since some review indicators were noted, it may also need a closer look before moving forward.`
    );
    expect(ideaWhatHappensNext(idea, {})).toBe(idea.whatHappensNext);
  });
});

describe('buildIdeaExportText', () => {
  it('prints every field, the indicators and the closing sentence', () => {
    const now: Date = new Date(2026, 8, 11, 10, 0);
    const text: string = buildIdeaExportText(idea, { summaryDraft: buildIdeaSummaryDraft(idea, answers), answers }, createBranding('Overture'), now);
    const lines: string[] = text.split('\n');
    expect(lines.slice(0, 4)).toEqual(['Overture AI CoE — I have an idea for using AI', 'AI CoE submission summary', `Created: ${now.toLocaleString()}`, '']);
    expect(lines.slice(4, 7)).toEqual(['Suggested use-case title', 'Reviewing incoming referral forms for missing information', '']);
    expect(lines.slice(37, 40)).toEqual(['Suggested next step', 'An AI CoE team member will review this idea.', '']);
    expect(lines[40]).toBe('Review indicators');
    expect(lines.slice(41, 44)).toEqual([
      '- Employee or customer information may be involved',
      '- An AI tool may already be in use for this work',
      '- Multiple systems may need to be connected'
    ]);
    expect(lines[44]).toBe('');
    expect(lines[45]).toBe(ideaWhatHappensNext(idea, answers));
    expect(lines).toHaveLength(46);
  });

  it('uses placeholders without a draft and notes missing indicators', () => {
    const text: string = buildIdeaExportText(idea, { summaryDraft: undefined, answers: {} }, createBranding(''), new Date(2026, 0, 1));
    expect(text.split('\n')[0]).toBe('AI CoE — I have an idea for using AI');
    expect(text).toContain('Suggested use-case title\nNot specified');
    expect(text).toContain('Review indicators\nNone noted based on the answers given.');
  });
});
