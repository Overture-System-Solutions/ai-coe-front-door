import type { LucideIcon } from 'lucide-react';

/** Step kinds used by the workflow definitions; `group` (1.0.0.18) is one screen holding a few related questions. */
export type StepType = 'text' | 'textarea' | 'select' | 'multiselect' | 'notice' | 'group';

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
  /** Set on a group's field when the group is expanded for listing: the step to return to when it is edited. */
  parentId?: string;
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

/** A question that can sit inside a group, or a notice that shows under one. */
export type IFieldStep = IChoiceStep | ITextStep | INoticeStep;

/**
 * One screen holding two or three closely related questions (1.0.0.18). Each field keeps its own id, so its answer is
 * stored under the same key as when it was a step of its own; a field may carry its own `showIf` as a follow-up.
 */
export interface IGroupStep extends IStepBase {
  type: 'group';
  fields: IFieldStep[];
}

export type IStep = IChoiceStep | ITextStep | INoticeStep | IGroupStep;

export type WorkflowId = 'idea' | 'toolCheck' | 'teamUsage' | 'helpTraining' | 'feedback';

/**
 * A piece that walks someone through steps: the five shipped workflows, plus the outcome record, which
 * exists in page views only. `WorkflowId` stays five, so the legacy landing page, the workflow catalog and
 * the governance labels are untouched by it (decision 16).
 */
export type PieceWorkflowId = WorkflowId | 'outcome';

/**
 * Workflow types accepted by the governance service; the tool check submits review requests under its own type.
 * The outcome record writes its own list through its own method, so it joins this union with that method, not here.
 */
export type SubmissionWorkflowType = WorkflowId | 'toolCheck-review-request';

/**
 * What a page-view piece may submit: the shipped types, plus the outcome record, which the submission
 * context routes to `submitOutcome` and its own list (decision 16). The shipped callers pass a
 * `SubmissionWorkflowType` and are untouched by it.
 */
export type SubmissionPieceType = SubmissionWorkflowType | 'outcome';

/**
 * A piece that walks through steps: the five shipped workflow definitions and the outcome record. The
 * step renderer, the form engine, the review page and the header read this shape, so the outcome record
 * needs no entry in `IWorkflowCatalog` and the legacy landing page keeps its five.
 */
export interface IPieceWorkflowDefinition {
  id: PieceWorkflowId;
  title: string;
  homeDescription: string;
  icon: LucideIcon;
  resultIntro?: string;
  whatHappensNext?: string;
  workflowVersion?: string;
  steps: IStep[];
  /** The tool check of the tabbed view picks its tool from the approved-tools register (1.0.0.18). */
  approvedToolList?: true;
  /** Answers worked out from others before guidance and submission (the register's view of a picked tool, 1.0.0.18). */
  deriveAnswers?: (answers: IAnswers) => IAnswers;
}

/** One of the five shipped workflows: the same shape, with the catalog's own narrower id. */
export interface IWorkflowDefinition extends IPieceWorkflowDefinition {
  id: WorkflowId;
}

export type IWorkflowCatalog = { [id in WorkflowId]: IWorkflowDefinition };

export function isChoiceStep(step: IStep): step is IChoiceStep {
  return step.type === 'select' || step.type === 'multiselect';
}
