import type { IBranding } from '../branding/branding';
import { createRecordId } from '../services/recordId';
import { indexSteps } from '../services/toolPolicyEvaluator';
import { formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition, WorkflowId } from '../workflows/types';
import { NOT_SPECIFIED } from './types';

export interface IResolution {
  resolutionStatus: string;
  clarityRating: string;
  confidenceInNextStep: string;
}

export type ClarityAnswer = 'clear' | 'somewhat' | 'notClear' | 'notApplicable';

export const RESOLUTION_BY_CLARITY: { [answer in ClarityAnswer]: IResolution } = {
  clear: { resolutionStatus: 'Reached a clear next step', clarityRating: 'Clear', confidenceInNextStep: 'High' },
  somewhat: { resolutionStatus: 'Partially reached a next step', clarityRating: 'Somewhat clear', confidenceInNextStep: 'Medium' },
  notClear: { resolutionStatus: 'Did not reach a clear next step', clarityRating: 'Not clear', confidenceInNextStep: 'Low' },
  notApplicable: { resolutionStatus: 'Not applicable', clarityRating: 'Not applicable', confidenceInNextStep: 'Not applicable' }
};

function resolutionFor(answers: IAnswers): IResolution {
  const answer: unknown = answers.gotClearNextStep;
  return (typeof answer === 'string' && (RESOLUTION_BY_CLARITY as { [key: string]: IResolution | undefined })[answer]) || RESOLUTION_BY_CLARITY.notApplicable;
}

export interface IFeedbackContact {
  name: string;
  email: string;
}

/** The confirmed feedback record as submitted to SharePoint; `contact` is null on the wire when not permitted. */
export interface IFeedbackRecord {
  recordId: string;
  createdAt: string;
  workflowId: WorkflowId;
  workflowVersion: string | undefined;
  workflowOrService: string;
  resolutionStatus: string;
  easeRating: string;
  clarityRating: string;
  confidenceInNextStep: string;
  positiveFeedback: string;
  frictionPoints: string;
  suggestedImprovement: string;
  suggestedThemes: string[];
  followUpPermission: 'Yes' | 'No';
  // eslint-disable-next-line @rushstack/no-new-null
  contact: IFeedbackContact | null;
  status: 'confirmed';
}

export function buildFeedbackRecord(
  definition: IWorkflowDefinition,
  answers: IAnswers,
  themes: string[],
  now: Date = new Date(),
  recordId: () => string = (): string => createRecordId('feedback')
): IFeedbackRecord {
  const index: { [stepId: string]: IStep } = indexSteps(definition);
  const resolution: IResolution = resolutionFor(answers);
  const text = (value: unknown): string => (value ? String(value) : '');
  const labelOf = (stepId: string): string => {
    const step: IStep | undefined = index[stepId];
    return (step ? formatAnswer(step, answers[stepId]) : '') || NOT_SPECIFIED;
  };
  const permitted: boolean = answers.followUpPermission === 'yes';
  return {
    recordId: recordId(),
    createdAt: now.toISOString(),
    workflowId: definition.id,
    workflowVersion: definition.workflowVersion,
    workflowOrService: labelOf('serviceInvolved'),
    resolutionStatus: resolution.resolutionStatus,
    easeRating: labelOf('easeRating'),
    clarityRating: resolution.clarityRating,
    confidenceInNextStep: resolution.confidenceInNextStep,
    positiveFeedback: text(answers.positiveFeedback) || NOT_SPECIFIED,
    frictionPoints: text(answers.frictionPoints) || NOT_SPECIFIED,
    suggestedImprovement: text(answers.suggestedImprovement) || NOT_SPECIFIED,
    suggestedThemes: themes,
    followUpPermission: permitted ? 'Yes' : 'No',
    contact: permitted ? { name: text(answers.contactName), email: text(answers.contactEmail) } : null,
    status: 'confirmed'
  };
}

export function feedbackWhatHappensNext(answers: IAnswers): string {
  const contactSentence: string =
    answers.followUpPermission === 'yes'
      ? " Since you said it's okay to reach out, they may contact you about it."
      : ' Since you asked not to be contacted, they will not contact you about this feedback.';
  return `Someone from the AI CoE team will read this feedback.${contactSentence} The feedback is recorded in the AI CoE service queue.`;
}

export interface IFeedbackExportSource {
  answers: IAnswers;
  themes: string[];
}

export function buildFeedbackExportText(
  definition: IWorkflowDefinition,
  source: IFeedbackExportSource,
  branding: IBranding,
  now: Date = new Date()
): string {
  const record: IFeedbackRecord = buildFeedbackRecord(definition, source.answers, source.themes, now);
  const lines: string[] = [];
  lines.push(branding.exportHeader(definition.title));
  lines.push('This feedback is connected to your organization account and is not anonymous.');
  lines.push('AI CoE submission summary');
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  lines.push(`Workflow or service involved: ${record.workflowOrService}`);
  lines.push(`Resolution status: ${record.resolutionStatus}`);
  lines.push(`Ease rating: ${record.easeRating}`);
  lines.push(`Clarity rating: ${record.clarityRating}`);
  lines.push(`Confidence in next step: ${record.confidenceInNextStep}`);
  lines.push('');
  lines.push('What helped:');
  lines.push(record.positiveFeedback);
  lines.push('');
  lines.push('What was confusing or difficult:');
  lines.push(record.frictionPoints);
  lines.push('');
  lines.push('Suggested improvement:');
  lines.push(record.suggestedImprovement);
  lines.push('');
  lines.push('Suggested themes (not a final classification):');
  lines.push(source.themes.length ? source.themes.map((theme: string): string => `- ${theme}`).join('\n') : 'None suggested.');
  lines.push('');
  lines.push(`May the CoE contact you about this? ${record.followUpPermission}`);
  if (record.contact && record.contact.name) {
    lines.push(`Contact: ${record.contact.name}${record.contact.email ? ` (${record.contact.email})` : ''}`);
  }
  lines.push('');
  lines.push(feedbackWhatHappensNext(source.answers));
  return lines.join('\n');
}
