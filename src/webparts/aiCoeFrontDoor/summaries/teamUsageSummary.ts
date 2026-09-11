import type { IBranding } from '../branding/branding';
import { indexSteps } from '../services/toolPolicyEvaluator';
import { asStringArray, includes } from '../utils/collections';
import { formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition } from '../workflows/types';
import { matchingIndicators, NO_INDICATORS, NOT_SPECIFIED } from './types';
import type { IReviewIndicator, ISummaryField } from './types';

export type TeamUsageSummaryKey =
  | 'headline'
  | 'purpose'
  | 'usage'
  | 'informationHandling'
  | 'benefitNoted'
  | 'concernsNoted'
  | 'oversight'
  | 'requestedFollowUp';

export type ITeamUsageSummaryDraft = { [key in TeamUsageSummaryKey]: string };

export const TEAM_USAGE_SUMMARY_FIELDS: readonly ISummaryField<TeamUsageSummaryKey>[] = [
  { key: 'headline', label: 'Tool and team', multiline: false },
  { key: 'purpose', label: 'What it helps with', multiline: true },
  { key: 'usage', label: "How it's used", multiline: true },
  { key: 'informationHandling', label: 'Information involved', multiline: true },
  { key: 'benefitNoted', label: 'Benefit observed', multiline: true },
  { key: 'concernsNoted', label: 'Problems, limitations, or concerns', multiline: true },
  { key: 'oversight', label: "How it's reviewed", multiline: true },
  { key: 'requestedFollowUp', label: "What you'd like next", multiline: false }
];

const TEAM_USAGE_REVIEW_INDICATORS: readonly IReviewIndicator<IAnswers>[] = [
  {
    id: 'companyDataOrWorkflow',
    label: 'Company information or an ongoing business workflow is involved or unclear',
    test: (answers: IAnswers): boolean => answers.companyDataOrWorkflow === 'yes' || answers.companyDataOrWorkflow === 'unsure'
  },
  {
    id: 'sensitivePatientConfidential',
    label: 'Patient or other confidential information may be involved',
    test: (answers: IAnswers): boolean => {
      const categories: string[] = asStringArray(answers.sensitiveCategories);
      return includes(categories, 'patient') || includes(categories, 'otherConfidential');
    }
  },
  {
    id: 'sensitiveEmployeeCustomer',
    label: 'Employee or customer information may be involved',
    test: (answers: IAnswers): boolean => {
      const categories: string[] = asStringArray(answers.sensitiveCategories);
      return includes(categories, 'employee') || includes(categories, 'customer');
    }
  },
  {
    id: 'sensitiveUnsure',
    label: "It's unclear whether sensitive information is involved",
    test: (answers: IAnswers): boolean => includes(asStringArray(answers.sensitiveCategories), 'unsure')
  },
  {
    id: 'automatedAction',
    label: 'The tool can take actions in another system',
    test: (answers: IAnswers): boolean => answers.aiTakesAction === 'yes'
  },
  {
    id: 'noHumanReview',
    label: "The output isn't reviewed by a person before it's used",
    test: (answers: IAnswers): boolean => answers.humanReview === 'no'
  },
  {
    id: 'notCentrallySupported',
    label: 'This tool may not be centrally supported today',
    test: (answers: IAnswers): boolean => answers.sourceType === 'personal' || answers.sourceType === 'free'
  }
];

export function teamUsageReviewIndicators(answers: IAnswers): string[] {
  return matchingIndicators(TEAM_USAGE_REVIEW_INDICATORS, answers);
}

function labelOf(index: { [stepId: string]: IStep }, stepId: string, answers: IAnswers): string {
  const step: IStep | undefined = index[stepId];
  return (step ? formatAnswer(step, answers[stepId]) : '') || NOT_SPECIFIED;
}

export function buildTeamUsageSummaryDraft(definition: IWorkflowDefinition, answers: IAnswers): ITeamUsageSummaryDraft {
  const index: { [stepId: string]: IStep } = indexSteps(definition);
  const text = (value: unknown): string => (value ? String(value) : '');
  const information: string[] = [];
  if (answers.informationEntered) {
    information.push(text(answers.informationEntered));
  }
  if (answers.companyDataOrWorkflow === 'yes') {
    information.push('Company information or an ongoing business workflow is involved.');
  } else if (answers.companyDataOrWorkflow === 'no') {
    information.push('No company information or ongoing business workflow was reported.');
  } else {
    information.push('Company-information or business-workflow involvement is unclear.');
  }
  information.push(`Information categories: ${labelOf(index, 'sensitiveCategories', answers)}.`);
  if (answers.filesUploaded === 'yes') {
    information.push(`Files are uploaded${answers.fileTypeDetail ? ` (${text(answers.fileTypeDetail)})` : ''}.`);
  } else if (answers.filesUploaded === 'no') {
    information.push('No files are uploaded.');
  }

  const oversight: string[] = [`Output is reviewed by a person: ${labelOf(index, 'humanReview', answers)}.`];
  if (answers.aiTakesAction === 'yes') {
    oversight.push(`It can take actions in another system${answers.actionSystemDetail ? ` (${text(answers.actionSystemDetail)})` : ''}.`);
  } else if (answers.aiTakesAction === 'no') {
    oversight.push('It does not take actions in another system.');
  }

  return {
    headline: answers.toolName ? `${text(answers.toolName)} — ${text(answers.departmentOrWork) || 'team not specified'}` : 'Untitled tool disclosure',
    purpose: text(answers.toolPurpose) || NOT_SPECIFIED,
    usage: `${labelOf(index, 'usageScope', answers)}; ${labelOf(index, 'frequency', answers)}; ${labelOf(index, 'sourceType', answers)}.`,
    informationHandling: information.join(' '),
    benefitNoted: text(answers.benefitObserved) || NOT_SPECIFIED,
    concernsNoted: text(answers.concernsExperienced) || 'None noted.',
    oversight: oversight.join(' '),
    requestedFollowUp: labelOf(index, 'followUpPreference', answers)
  };
}

function followUpSentence(answers: IAnswers): string {
  switch (answers.followUpPreference) {
    case 'guidance':
      return "Since you'd like guidance on using it well, someone from the AI CoE may follow up with some pointers.";
    case 'training':
      return "Since you'd like training on this tool, someone from the AI CoE may follow up about that.";
    case 'alternative':
      return "Since you're interested in an approved alternative, someone from the AI CoE may follow up with options.";
    default:
      return "You didn't ask for anything further right now, and that's perfectly fine — thank you again for sharing this.";
  }
}

export function teamUsageWhatHappensNext(answers: IAnswers, branding: IBranding): string {
  const sensitive: boolean = asStringArray(answers.sensitiveCategories).some((category: string): boolean =>
    includes(['patient', 'employee', 'customer', 'otherConfidential', 'unsure'], category)
  );
  const takesAction: boolean = answers.aiTakesAction === 'yes';
  const companyData: boolean = answers.companyDataOrWorkflow === 'yes' || answers.companyDataOrWorkflow === 'unsure';
  const personalOrFree: boolean = answers.sourceType === 'personal' || answers.sourceType === 'free';
  const sentences: string[] = [`Thank you for helping ${branding.organizationLabel} understand real AI use and improve support.`];
  if (companyData && personalOrFree) {
    sentences.push(
      `Please pause entering company information into this personal or free tool. Submit the use through TESS with manager endorsement so ${branding.organizationLabel} can confirm an approved path.`
    );
  } else if (companyData || sensitive || takesAction) {
    sentences.push(
      "Since company information, a business workflow, sensitive information, or an automated action may be involved, please pause that part of the process until the required review is complete. Submit it through TESS with manager endorsement. Everything else you've shared is still helpful."
    );
  }
  sentences.push(followUpSentence(answers));
  return sentences.join(' ');
}

export interface ITeamUsageExportSource {
  summaryDraft: ITeamUsageSummaryDraft | undefined;
  answers: IAnswers;
}

export function buildTeamUsageExportText(
  definition: IWorkflowDefinition,
  source: ITeamUsageExportSource,
  branding: IBranding,
  now: Date = new Date()
): string {
  const indicators: string[] = teamUsageReviewIndicators(source.answers);
  const lines: string[] = [];
  lines.push(branding.exportHeader(definition.title));
  lines.push('AI CoE submission summary');
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  for (const field of TEAM_USAGE_SUMMARY_FIELDS) {
    lines.push(field.label);
    lines.push((source.summaryDraft && source.summaryDraft[field.key]) || NOT_SPECIFIED);
    lines.push('');
  }
  lines.push('Review indicators');
  lines.push(indicators.length ? indicators.map((indicator: string): string => `- ${indicator}`).join('\n') : NO_INDICATORS);
  lines.push('');
  lines.push(teamUsageWhatHappensNext(source.answers, branding));
  return lines.join('\n');
}
