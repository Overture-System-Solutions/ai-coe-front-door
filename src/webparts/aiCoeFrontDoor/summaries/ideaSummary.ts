import type { IBranding } from '../branding/branding';
import { indexSteps } from '../services/toolPolicyEvaluator';
import { asStringArray, includes } from '../utils/collections';
import { formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition } from '../workflows/types';
import { matchingIndicators, NO_INDICATORS, NOT_SPECIFIED } from './types';
import type { IReviewIndicator, ISummaryField } from './types';

export type IdeaSummaryKey =
  | 'title'
  | 'problemToSolve'
  | 'currentProcess'
  | 'peopleAffected'
  | 'frequencyAndEffort'
  | 'systemsInvolved'
  | 'informationCategories'
  | 'currentAiActivity'
  | 'desiredOutcome'
  | 'possibleMeasuresOfSuccess'
  | 'openQuestions'
  | 'suggestedNextStep';

export type IIdeaSummaryDraft = { [key in IdeaSummaryKey]: string };

export const IDEA_SUMMARY_FIELDS: readonly ISummaryField<IdeaSummaryKey>[] = [
  { key: 'title', label: 'Suggested use-case title', multiline: false },
  { key: 'problemToSolve', label: 'Problem to solve', multiline: true },
  { key: 'currentProcess', label: 'Current process', multiline: true },
  { key: 'peopleAffected', label: 'People affected', multiline: true },
  { key: 'frequencyAndEffort', label: 'Frequency and estimated effort', multiline: true },
  { key: 'systemsInvolved', label: 'Systems involved', multiline: true },
  { key: 'informationCategories', label: 'Information categories', multiline: true },
  { key: 'currentAiActivity', label: 'Current AI activity', multiline: true },
  { key: 'desiredOutcome', label: 'Desired outcome', multiline: true },
  { key: 'possibleMeasuresOfSuccess', label: 'Possible measures of success', multiline: true },
  { key: 'openQuestions', label: 'Open questions', multiline: true },
  { key: 'suggestedNextStep', label: 'Suggested next step', multiline: true }
];

const AUTOMATION_PHRASES: readonly string[] = [
  'automatically decide',
  'auto-approve',
  'automatically approve',
  'without a person',
  'without human review',
  'no human review',
  'automatically reject',
  'automatically send'
];

const IDEA_REVIEW_INDICATORS: readonly IReviewIndicator<IAnswers>[] = [
  {
    id: 'sensitivePatient',
    label: 'Patient or other confidential information may be involved',
    test: (answers: IAnswers): boolean => {
      const categories: string[] = asStringArray(answers.informationCategories);
      return includes(categories, 'patient') || includes(categories, 'otherConfidential');
    }
  },
  {
    id: 'sensitiveEmployeeCustomer',
    label: 'Employee or customer information may be involved',
    test: (answers: IAnswers): boolean => {
      const categories: string[] = asStringArray(answers.informationCategories);
      return includes(categories, 'employee') || includes(categories, 'customer');
    }
  },
  {
    id: 'unsureInformation',
    label: 'The employee is unsure about the information involved',
    test: (answers: IAnswers): boolean => includes(asStringArray(answers.informationCategories), 'unsure')
  },
  {
    id: 'externalAiInUse',
    label: 'An AI tool may already be in use for this work',
    test: (answers: IAnswers): boolean => answers.aiAlreadyUsed === 'yes'
  },
  {
    id: 'multipleSystems',
    label: 'Multiple systems may need to be connected',
    test: (answers: IAnswers): boolean => {
      const systems: string = String(answers.systemsInvolved || '').toLowerCase();
      return !!systems.trim() && [',', ' and ', ';', '/', '+'].some((separator: string): boolean => systems.indexOf(separator) >= 0);
    }
  },
  {
    id: 'automatedDecisions',
    label: 'Automated decisions or actions may be involved',
    test: (answers: IAnswers): boolean => {
      const text: string = `${answers.desiredOutcome || ''} ${answers.painPoints || ''} ${answers.workToImprove || ''}`.toLowerCase();
      return AUTOMATION_PHRASES.some((phrase: string): boolean => text.indexOf(phrase) >= 0);
    }
  }
];

export function ideaReviewIndicators(answers: IAnswers): string[] {
  return matchingIndicators(IDEA_REVIEW_INDICATORS, answers);
}

export function ideaWhatHappensNext(definition: IWorkflowDefinition, answers: IAnswers): string {
  const base: string = definition.whatHappensNext ?? '';
  return ideaReviewIndicators(answers).length > 0
    ? `${base} Since some review indicators were noted, it may also need a closer look before moving forward.`
    : base;
}

export function truncateText(value: unknown, maxLength: number): string {
  if (!value) {
    return '';
  }
  const text: string = String(value).trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function labelOf(index: { [stepId: string]: IStep }, stepId: string, answers: IAnswers): string {
  const step: IStep | undefined = index[stepId];
  return (step ? formatAnswer(step, answers[stepId]) : '') || NOT_SPECIFIED;
}

/** Deterministic draft that closely follows the answers (the shipped build never called a model). */
export function buildIdeaSummaryDraft(definition: IWorkflowDefinition, answers: IAnswers): IIdeaSummaryDraft {
  const index: { [stepId: string]: IStep } = indexSteps(definition);
  const text = (value: unknown): string => (value ? String(value) : '');
  return {
    title: answers.workToImprove ? truncateText(answers.workToImprove, 70) : 'Untitled idea',
    problemToSolve: text(answers.painPoints) || NOT_SPECIFIED,
    currentProcess: text(answers.workToImprove) || NOT_SPECIFIED,
    peopleAffected: text(answers.peopleInvolved) || NOT_SPECIFIED,
    frequencyAndEffort: `${labelOf(index, 'frequency', answers)}; ${labelOf(index, 'timeSpent', answers)}`,
    systemsInvolved: text(answers.systemsInvolved) || NOT_SPECIFIED,
    informationCategories: labelOf(index, 'informationCategories', answers),
    currentAiActivity:
      answers.aiAlreadyUsed === 'yes'
        ? `Yes${answers.aiToolName ? ` — ${String(answers.aiToolName)}` : ''}`
        : labelOf(index, 'aiAlreadyUsed', answers),
    desiredOutcome: text(answers.desiredOutcome) || NOT_SPECIFIED,
    possibleMeasuresOfSuccess: text(answers.successMeasure) || NOT_SPECIFIED,
    openQuestions: 'This draft was created without AI assistance, so it closely follows the original answers.',
    suggestedNextStep: 'An AI CoE team member will review this idea.'
  };
}

export interface IIdeaExportSource {
  summaryDraft: IIdeaSummaryDraft | undefined;
  answers: IAnswers;
}

export function buildIdeaExportText(
  definition: IWorkflowDefinition,
  source: IIdeaExportSource,
  branding: IBranding,
  now: Date = new Date()
): string {
  const indicators: string[] = ideaReviewIndicators(source.answers);
  const lines: string[] = [];
  lines.push(branding.exportHeader(definition.title));
  lines.push('AI CoE submission summary');
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  for (const field of IDEA_SUMMARY_FIELDS) {
    lines.push(field.label);
    lines.push((source.summaryDraft && source.summaryDraft[field.key]) || NOT_SPECIFIED);
    lines.push('');
  }
  lines.push('Review indicators');
  lines.push(indicators.length ? indicators.map((indicator: string): string => `- ${indicator}`).join('\n') : NO_INDICATORS);
  lines.push('');
  lines.push(ideaWhatHappensNext(definition, source.answers));
  return lines.join('\n');
}
