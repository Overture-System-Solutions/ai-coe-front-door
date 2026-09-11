import { asStringArray, includes } from '../utils/collections';

export interface IRecord {
  [key: string]: unknown;
}

export type DataSensitivity = 'Restricted' | 'Confidential' | 'Internal';

/** Risk flags derived from a submission; written to the intake and use-case list items. */
export interface ISubmissionFlags {
  companyDataOrWorkflow: boolean;
  sensitiveOrRegulated: boolean;
  externalUsers: boolean;
  autonomousActions: boolean;
  requiresReview: boolean;
  dataSensitivity: DataSensitivity;
}

const SENSITIVE_CATEGORIES: readonly string[] = ['patient', 'employee', 'customer', 'otherConfidential', 'regulated', 'unsure'];
const AFFIRMATIVE: readonly string[] = ['yes', 'unsure'];

function affirmative(value: unknown): boolean {
  return includes(AFFIRMATIVE, String(value || ''));
}

/**
 * Classifies a submission exactly as package 1.0.0.7 did: `payload` is the workflow payload
 * (review indicators, outcome) and `answers` the original answers.
 */
export function evaluateFlags(payload: IRecord, answers: IRecord): ISubmissionFlags {
  const categories: string[] = asStringArray(answers.sensitiveCategories).concat(asStringArray(answers.informationCategories));
  const sensitiveOrRegulated: boolean = categories.some((category: string): boolean => includes(SENSITIVE_CATEGORIES, category));
  const companyDataOrWorkflow: boolean =
    affirmative(answers.companyDataOrWorkflow) ||
    categories.some((category: string): boolean => category !== 'public' && category !== 'none');
  const externalUsers: boolean = affirmative(answers.outputSharedExternally || answers.externalUsers);
  const autonomousActions: boolean = affirmative(answers.aiTakesAction || answers.autonomousActions);
  const reviewIndicators: unknown[] = Array.isArray(payload.reviewIndicators) ? payload.reviewIndicators : [];
  const requiresReview: boolean =
    companyDataOrWorkflow ||
    sensitiveOrRegulated ||
    externalUsers ||
    autonomousActions ||
    reviewIndicators.length > 0 ||
    String(payload.outcome || '').toLowerCase().indexOf('review') >= 0;
  return {
    companyDataOrWorkflow,
    sensitiveOrRegulated,
    externalUsers,
    autonomousActions,
    requiresReview,
    dataSensitivity: sensitiveOrRegulated ? 'Restricted' : companyDataOrWorkflow ? 'Confidential' : 'Internal'
  };
}
