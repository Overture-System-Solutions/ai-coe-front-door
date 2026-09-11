import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import {
  buildTeamUsageExportText,
  buildTeamUsageSummaryDraft,
  TEAM_USAGE_SUMMARY_FIELDS,
  teamUsageReviewIndicators,
  teamUsageWhatHappensNext
} from './teamUsageSummary';
import type { ITeamUsageSummaryDraft } from './teamUsageSummary';

const teamUsage: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).teamUsage;

const answers: IAnswers = {
  toolName: 'Copilot',
  usageScope: 'smallTeam',
  departmentOrWork: 'Billing',
  toolPurpose: 'Drafting first responses.',
  frequency: 'daily',
  sourceType: 'free',
  informationEntered: 'General project notes.',
  companyDataOrWorkflow: 'yes',
  filesUploaded: 'yes',
  fileTypeDetail: 'spreadsheets',
  sensitiveCategories: ['customer'],
  benefitObserved: 'Saves time.',
  humanReview: 'sometimes',
  aiTakesAction: 'yes',
  actionSystemDetail: 'the scheduling system',
  followUpPreference: 'guidance'
};

describe('TEAM_USAGE_SUMMARY_FIELDS', () => {
  it('lists the eight fields in order', () => {
    expect(TEAM_USAGE_SUMMARY_FIELDS.map((field) => field.key)).toEqual([
      'headline', 'purpose', 'usage', 'informationHandling', 'benefitNoted', 'concernsNoted', 'oversight', 'requestedFollowUp'
    ]);
    expect(TEAM_USAGE_SUMMARY_FIELDS[0]).toEqual({ key: 'headline', label: 'Tool and team', multiline: false });
  });
});

describe('buildTeamUsageSummaryDraft', () => {
  it('composes the shipped sentences from the answers', () => {
    const draft: ITeamUsageSummaryDraft = buildTeamUsageSummaryDraft(teamUsage, answers);
    expect(draft).toEqual({
      headline: 'Copilot — Billing',
      purpose: 'Drafting first responses.',
      usage: 'A small team; Every day; Free to use.',
      informationHandling:
        'General project notes. Company information or an ongoing business workflow is involved. Information categories: Customer information. Files are uploaded (spreadsheets).',
      benefitNoted: 'Saves time.',
      concernsNoted: 'None noted.',
      oversight: 'Output is reviewed by a person: Sometimes. It can take actions in another system (the scheduling system).',
      requestedFollowUp: 'Guidance on using it well'
    });
  });

  it('handles the negative and unknown branches', () => {
    const draft: ITeamUsageSummaryDraft = buildTeamUsageSummaryDraft(teamUsage, {
      toolName: 'Copilot',
      companyDataOrWorkflow: 'no',
      filesUploaded: 'no',
      aiTakesAction: 'no',
      concernsExperienced: 'Gets facts wrong.'
    });
    expect(draft.headline).toBe('Copilot — team not specified');
    expect(draft.usage).toBe('Not specified; Not specified; Not specified.');
    expect(draft.informationHandling).toBe(
      'No company information or ongoing business workflow was reported. Information categories: Not specified. No files are uploaded.'
    );
    expect(draft.oversight).toBe('Output is reviewed by a person: Not specified. It does not take actions in another system.');
    expect(draft.concernsNoted).toBe('Gets facts wrong.');
    const unclear: ITeamUsageSummaryDraft = buildTeamUsageSummaryDraft(teamUsage, {});
    expect(unclear.headline).toBe('Untitled tool disclosure');
    expect(unclear.informationHandling).toBe('Company-information or business-workflow involvement is unclear. Information categories: Not specified.');
    expect(unclear.oversight).toBe('Output is reviewed by a person: Not specified.');
  });
});

describe('teamUsageReviewIndicators', () => {
  it('reports each shipped indicator label', () => {
    expect(teamUsageReviewIndicators(answers)).toEqual([
      'Company information or an ongoing business workflow is involved or unclear',
      'Employee or customer information may be involved',
      'The tool can take actions in another system',
      'This tool may not be centrally supported today'
    ]);
    expect(teamUsageReviewIndicators({ sensitiveCategories: ['patient', 'unsure'], humanReview: 'no', sourceType: 'company' })).toEqual([
      'Patient or other confidential information may be involved',
      "It's unclear whether sensitive information is involved",
      "The output isn't reviewed by a person before it's used"
    ]);
    expect(teamUsageReviewIndicators({})).toEqual([]);
  });
});

describe('teamUsageWhatHappensNext', () => {
  it('asks to pause company data in personal or free tools', () => {
    expect(teamUsageWhatHappensNext(answers, createBranding('Overture'))).toBe(
      'Thank you for helping Overture understand real AI use and improve support. Please pause entering company information into this personal or free tool. Submit the use through TESS with manager endorsement so Overture can confirm an approved path. Since you\'d like guidance on using it well, someone from the AI CoE may follow up with some pointers.'
    );
  });

  it('asks for a review when sensitive information or actions are involved with a supported tool', () => {
    expect(teamUsageWhatHappensNext({ ...answers, sourceType: 'company', followUpPreference: 'training' }, createBranding('Overture'))).toBe(
      "Thank you for helping Overture understand real AI use and improve support. Since company information, a business workflow, sensitive information, or an automated action may be involved, please pause that part of the process until the required review is complete. Submit it through TESS with manager endorsement. Everything else you've shared is still helpful. Since you'd like training on this tool, someone from the AI CoE may follow up about that."
    );
  });

  it('thanks the employee when nothing needs a pause', () => {
    expect(teamUsageWhatHappensNext({ followUpPreference: 'alternative' }, createBranding(''))).toBe(
      "Thank you for helping the organization understand real AI use and improve support. Since you're interested in an approved alternative, someone from the AI CoE may follow up with options."
    );
    expect(teamUsageWhatHappensNext({ followUpPreference: 'none' }, createBranding(''))).toBe(
      "Thank you for helping the organization understand real AI use and improve support. You didn't ask for anything further right now, and that's perfectly fine — thank you again for sharing this."
    );
  });
});

describe('buildTeamUsageExportText', () => {
  it('prints the fields, indicators and closing text', () => {
    const now: Date = new Date(2026, 8, 11, 10, 0);
    const text: string = buildTeamUsageExportText(teamUsage, { summaryDraft: buildTeamUsageSummaryDraft(teamUsage, answers), answers }, createBranding('Overture'), now);
    const lines: string[] = text.split('\n');
    expect(lines.slice(0, 4)).toEqual(['Overture AI CoE — My team is already using an AI tool', 'AI CoE submission summary', `Created: ${now.toLocaleString()}`, '']);
    expect(lines.slice(4, 7)).toEqual(['Tool and team', 'Copilot — Billing', '']);
    expect(lines[28]).toBe('Review indicators');
    expect(lines[29]).toBe('- Company information or an ongoing business workflow is involved or unclear');
    expect(lines[lines.length - 1]).toBe(teamUsageWhatHappensNext(answers, createBranding('Overture')));
  });
});
