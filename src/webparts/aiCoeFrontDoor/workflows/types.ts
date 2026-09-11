import type { LucideIcon } from 'lucide-react';

/** Step kinds used by the five workflow definitions. */
export type StepType = 'text' | 'textarea' | 'select' | 'multiselect' | 'notice';

/** A single answer: free text, one choice, or the selected values of a multiselect. */
export type AnswerValue = string | string[] | undefined;

export interface IAnswers {
  [stepId: string]: AnswerValue;
}

export interface IStepOption {
  value: string;
  label: string;
  /** Selecting an exclusive option clears every other selection of a multiselect step. */
  exclusive?: boolean;
}

interface IStepBase {
  id: string;
  title: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Shows the "please don't include the information itself" reminder under the input. */
  showSafetyNotice?: boolean;
  /** Hides the step unless the predicate holds for the current answers. */
  showIf?: (answers: IAnswers) => boolean;
}

export interface IChoiceStep extends IStepBase {
  type: 'select' | 'multiselect';
  options: IStepOption[];
}

export interface ITextStep extends IStepBase {
  type: 'text' | 'textarea';
}

export interface INoticeStep extends IStepBase {
  type: 'notice';
  body: string;
}

export type IStep = IChoiceStep | ITextStep | INoticeStep;

export type WorkflowId = 'idea' | 'toolCheck' | 'teamUsage' | 'helpTraining' | 'feedback';

/** Workflow types accepted by the governance service; the tool check submits review requests under its own type. */
export type SubmissionWorkflowType = WorkflowId | 'toolCheck-review-request';

export interface IWorkflowDefinition {
  id: WorkflowId;
  title: string;
  homeDescription: string;
  icon: LucideIcon;
  resultIntro?: string;
  whatHappensNext?: string;
  workflowVersion?: string;
  steps: IStep[];
}

export type IWorkflowCatalog = { [id in WorkflowId]: IWorkflowDefinition };

export function isChoiceStep(step: IStep): step is IChoiceStep {
  return step.type === 'select' || step.type === 'multiselect';
}
