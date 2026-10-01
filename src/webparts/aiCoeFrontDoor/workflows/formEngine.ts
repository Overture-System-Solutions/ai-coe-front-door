import type { IBranding } from '../branding/branding';
import type { ISubmissionResult } from '../services/types';
import { isChoiceStep } from './types';
import type { AnswerValue, IAnswers, IFieldStep, IPieceWorkflowDefinition, IStep } from './types';

function shows(step: IStep, answers: IAnswers): boolean {
  return step.showIf === undefined || step.showIf(answers);
}

/** Steps whose `showIf` predicate (if any) holds for the current answers, in definition order. */
export function visibleSteps(definition: IPieceWorkflowDefinition, answers: IAnswers): IStep[] {
  return definition.steps.filter((step: IStep): boolean => shows(step, answers));
}

/** The fields of a group that show for the current answers. */
export function groupFields(step: IStep, answers: IAnswers): IFieldStep[] {
  return step.type === 'group' ? step.fields.filter((field: IFieldStep): boolean => shows(field, answers)) : [];
}

/**
 * The steps as questions to list (1.0.0.18): each group is replaced by its showing fields, each marked with the group
 * to return to when it is edited; every other step is kept as it is.
 */
export function expandSteps(steps: readonly IStep[], answers: IAnswers): IStep[] {
  const expanded: IStep[] = [];
  for (const step of steps) {
    if (step.type === 'group') {
      for (const field of groupFields(step, answers)) {
        expanded.push({ ...field, parentId: step.id });
      }
    } else {
      expanded.push(step);
    }
  }
  return expanded;
}

/** Every question answered on the visible steps, groups expanded and notices left out. */
export function answerSteps(definition: IPieceWorkflowDefinition, answers: IAnswers): IStep[] {
  return expandSteps(visibleSteps(definition, answers), answers).filter((step: IStep): boolean => step.type !== 'notice');
}

/** The closing sentence of a summary; the shipped build appended nothing else for the step types in use. */
export function whatHappensNextText(definition: IPieceWorkflowDefinition, _answers: IAnswers): string | undefined {
  return definition.whatHappensNext;
}

/** Validation message for a required step without a usable answer; undefined when the step is fine. */
export function validateStep(step: IStep | undefined, answers: IAnswers): string | undefined {
  if (step !== undefined && step.type === 'group') {
    // A group asks every showing field; the first one still missing is named, so the message says which.
    for (const field of groupFields(step, answers)) {
      const message: string | undefined = validateStep(field, answers);
      if (message !== undefined) {
        return `${field.title} ${message}`;
      }
    }
    return undefined;
  }
  if (step === undefined || step.type === 'notice' || !step.required) {
    return undefined;
  }
  const value: AnswerValue = answers[step.id];
  switch (step.type) {
    case 'select':
      return value ? undefined : 'Please pick one option so we can keep going.';
    case 'multiselect':
      return Array.isArray(value) && value.length !== 0 ? undefined : 'Please pick at least one option so we can keep going.';
    case 'text':
      return value && String(value).trim() ? undefined : 'Please fill in this box before continuing.';
    case 'textarea':
      return value && String(value).trim() ? undefined : 'Please add a few words before continuing. Even a short sentence is fine.';
    default:
      return undefined;
  }
}

/** Display text for an answer: option labels for choices (joined with ", "), the text itself otherwise. */
export function formatAnswer(step: IStep, value: AnswerValue): string {
  if (value === undefined || value === '') {
    return '';
  }
  if (!isChoiceStep(step)) {
    return String(value);
  }
  if (step.type === 'select') {
    const option = step.options.filter((candidate) => candidate.value === value)[0];
    return option ? option.label : String(value);
  }
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }
  return value
    .map((item: string): string => {
      const option = step.options.filter((candidate) => candidate.value === item)[0];
      return option ? option.label : item;
    })
    .join(', ');
}

/** Plain-text summary offered for download by the generic workflows. */
export function buildGenericExportText(
  definition: IPieceWorkflowDefinition,
  answers: IAnswers,
  steps: IStep[],
  branding: IBranding,
  now: Date = new Date()
): string {
  const lines: string[] = [];
  lines.push(branding.exportHeader(definition.title));
  lines.push('AI CoE submission summary');
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  for (const step of expandSteps(steps, answers)) {
    if (step.type !== 'notice') {
      const value: string = formatAnswer(step, answers[step.id]);
      if (value) {
        lines.push(step.title);
        lines.push(value);
        lines.push('');
      }
    }
  }
  lines.push(whatHappensNextText(definition, answers) ?? '');
  return lines.join('\n');
}

export type GenericPhase = 'form' | 'review' | 'submitting' | 'result';

export interface ISessionBase<TPhase extends string, TReturn extends string> {
  answers: IAnswers;
  currentStepId: string | undefined;
  phase: TPhase;
  editReturnTarget: TReturn | undefined;
  errors: { [stepId: string]: string | undefined };
  notice: string | undefined;
}

export interface IGenericSession extends ISessionBase<GenericPhase, 'review'> {
  result: ISubmissionResult | undefined;
}

/** Fields every draft persisted to localStorage carries; the generic workflows store nothing else. */
export interface IStoredDraftBase {
  answers?: IAnswers;
  currentStepId?: string;
  phase?: string;
}

export type IGenericDraft = IStoredDraftBase;

export const RESUME_NOTICE: string = 'Picking up where you left off.';

/** The saved step when it is still visible for the answers, otherwise the first visible step. */
export function resumeStepId(definition: IPieceWorkflowDefinition, answers: IAnswers, requested: string | undefined): string | undefined {
  const steps: IStep[] = visibleSteps(definition, answers);
  if (requested !== undefined && steps.some((step: IStep): boolean => step.id === requested)) {
    return requested;
  }
  return steps[0]?.id;
}

export function createGenericSession(definition: IPieceWorkflowDefinition, draft: IGenericDraft | undefined): IGenericSession {
  const answers: IAnswers = draft?.answers ?? {};
  return {
    answers,
    currentStepId: resumeStepId(definition, answers, draft?.currentStepId),
    phase: draft?.phase === 'review' ? 'review' : 'form',
    editReturnTarget: undefined,
    errors: {},
    result: undefined,
    notice: draft ? RESUME_NOTICE : undefined
  };
}

export type BaseSessionAction<TPhase extends string, TReturn extends string> =
  | { type: 'ANSWER'; stepId: string; value: AnswerValue }
  | { type: 'SET_ERROR'; stepId: string; message: string }
  | { type: 'GOTO'; stepId: string | undefined; phase?: TPhase; editReturnTarget?: TReturn }
  | { type: 'SET_PHASE'; phase: TPhase }
  | { type: 'SET_NOTICE'; text: string | undefined };

/**
 * Handles the five actions every workflow shares. Returns undefined for other actions so each
 * workflow reducer can extend it.
 */
export function reduceBaseAction<TPhase extends string, TReturn extends string, TState extends ISessionBase<TPhase, TReturn>>(
  state: TState,
  action: BaseSessionAction<TPhase, TReturn>
): TState | undefined {
  switch (action.type) {
    case 'ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.stepId]: action.value },
        errors: { ...state.errors, [action.stepId]: undefined },
        notice: undefined
      };
    case 'SET_ERROR':
      return { ...state, errors: { ...state.errors, [action.stepId]: action.message } };
    case 'GOTO':
      return {
        ...state,
        currentStepId: action.stepId,
        phase: action.phase ?? state.phase,
        editReturnTarget: action.editReturnTarget,
        notice: undefined
      };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_NOTICE':
      return { ...state, notice: action.text };
    default:
      return undefined;
  }
}

export type GenericSessionAction =
  | BaseSessionAction<GenericPhase, 'review'>
  | { type: 'SET_RESULT'; result: ISubmissionResult }
  | { type: 'RESET'; session: IGenericSession };

export function genericReducer(state: IGenericSession, action: GenericSessionAction): IGenericSession {
  switch (action.type) {
    case 'SET_RESULT':
      return { ...state, result: action.result, phase: 'result' };
    case 'RESET':
      return action.session;
    default:
      return reduceBaseAction<GenericPhase, 'review', IGenericSession>(state, action) ?? state;
  }
}
