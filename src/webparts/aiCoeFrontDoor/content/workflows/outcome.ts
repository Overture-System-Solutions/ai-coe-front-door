/**
 * "Record a task outcome": the content-free record of how one AI task went (plan step 29b, decision 16).
 *
 * Every step is a choice from a fixed list, so the piece cannot collect a prompt, an answer or anything
 * else a person might type. What a walk records is the field set the references name - task type,
 * outcome, review state and correction category (`04_EMPLOYEE_10_MINUTE_QUICK_START.md` § Minute 9-10;
 * `03_MARKETING_FIRST_ACTIVATION_PLAYBOOK.md` § Week 2) - plus the availability the route showed, in the
 * five truth labels. The four outcome words and their meanings, and the six correction categories
 * (`08_MEASUREMENT_AND_SCALE_SCORECARD.md` § Core scorecard), are the references' own words; the three
 * review states are the plan's enumeration.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { CircleCheck } from '../../icons';
import { includes } from '../../utils/collections';
import type { IAnswers, IPieceWorkflowDefinition, IStepOption } from '../../workflows/types';
import { TRUTH_STATES } from '../truthStates';
import type { ITruthState } from '../truthStates';

/** The version written with every outcome row, so a later change to the questions is readable in the data. */
export const OUTCOME_WORKFLOW_VERSION: string = '1.0';

/** The steps, in order; the ids are the keys of the answers a walk hands the service. */
export const OUTCOME_STEP_IDS: readonly string[] = ['taskType', 'outcome', 'reviewState', 'correctionCategory', 'routeAvailability'];

/**
 * The kinds of task the record knows. Deliberately short and general: the point is to group outcomes,
 * never to learn what the task was about.
 */
export const OUTCOME_TASK_TYPES: readonly string[] = [
  'Drafting or writing',
  'Summarizing or shortening',
  'Planning or organizing',
  'Checking or comparing',
  'Another kind of task'
];

/** The four outcome words of the quick start. */
export const OUTCOME_VALUES: readonly string[] = ['Accepted', 'Corrected', 'Unavailable', 'Stopped'];

/** Their meanings, as the quick start writes them (MKT-16). */
export const OUTCOME_HELP: string =
  'Accepted: useful after review. Corrected: useful after a material correction. ' +
  'Unavailable: a needed source, capability or access route was missing. ' +
  'Stopped: the task was unsafe, unclear or outside the pilot.';

/** The three review states the plan enumerates (decision 16). */
export const REVIEW_STATES: readonly string[] = ['Reviewed by me', 'Reviewed by someone else', 'Not reviewed'];

/** The six correction categories the scorecard counts (MKT-53); the correction itself is never recorded. */
export const CORRECTION_CATEGORIES: readonly string[] = ['fact', 'source', 'audience', 'policy', 'brand', 'action boundary'];

/** What the route showed when the task was done: the five truth labels (MKT-59, MKT-13). */
export const ROUTE_AVAILABILITY: readonly string[] = TRUTH_STATES.map((state: ITruthState): string => state.label);

/** The columns one outcome row writes, in the order the service writes them. */
export const OUTCOME_COLUMNS: readonly string[] = [
  'Title',
  'OutcomeId',
  'RecordedAt',
  'TaskType',
  'Outcome',
  'ReviewState',
  'CorrectionCategory',
  'RouteAvailability',
  'WorkflowVersion'
];

/** The outcome that asks for a correction category; every other one records none. */
const CORRECTED: string = 'Corrected';

function options(values: readonly string[]): IStepOption[] {
  return values.map((value: string): IStepOption => ({ value, label: value }));
}

/**
 * The piece, built once: it reads nothing from the branding and nothing from the tenant, so there is
 * one definition for every site and a page view can render it without a catalog entry (`WorkflowId`
 * stays at the shipped five).
 */
export const OUTCOME_WORKFLOW: IPieceWorkflowDefinition = {
  id: 'outcome',
  title: 'Record a task outcome',
  homeDescription: 'Tell us how an AI task turned out.',
  icon: CircleCheck,
  resultIntro: 'Thanks for recording the outcome.',
  whatHappensNext:
    'Only the task type, outcome, review state, correction category and route availability are saved. Your prompt and the output are never stored.',
  workflowVersion: OUTCOME_WORKFLOW_VERSION,
  steps: [
    {
      id: 'taskType',
      type: 'select',
      title: 'What kind of task was it?',
      help: 'Pick the closest kind. Do not describe the task itself.',
      required: true,
      options: options(OUTCOME_TASK_TYPES)
    },
    {
      id: 'outcome',
      type: 'select',
      title: 'How did it turn out?',
      help: OUTCOME_HELP,
      required: true,
      options: options(OUTCOME_VALUES)
    },
    {
      id: 'reviewState',
      type: 'select',
      title: 'Was the result reviewed by a person?',
      help: 'A result nobody has read yet is not a useful outcome; say so plainly.',
      required: true,
      options: options(REVIEW_STATES)
    },
    {
      id: 'correctionCategory',
      type: 'select',
      title: 'What kind of correction did it need?',
      help: 'The category only. What was wrong, and what you changed, stays with you.',
      required: true,
      showIf: (answers: IAnswers): boolean => answers.outcome === CORRECTED,
      options: options(CORRECTION_CATEGORIES)
    },
    {
      id: 'routeAvailability',
      type: 'select',
      title: 'What did the page say about the tool or source you needed?',
      help: 'The status you were shown when you went to do the task.',
      required: true,
      options: options(ROUTE_AVAILABILITY)
    }
  ]
};

/** Whatever a piece, a draft or a caller hands the record; only the declared choices are read out of it. */
export interface IOutcomeAnswers {
  [stepId: string]: unknown;
}

/** One outcome row, as the service writes it: five choices and nothing else. */
export interface IOutcomeRecordFields {
  TaskType: string;
  Outcome: string;
  ReviewState: string;
  CorrectionCategory: string;
  RouteAvailability: string;
}

/** The answer of a step when it is one of the values that step offers, else the blank. */
function choice(answers: IOutcomeAnswers, stepId: string, allowed: readonly string[]): string {
  const value: unknown = answers[stepId];
  return typeof value === 'string' && includes(allowed, value) ? value : '';
}

/**
 * What one walk records. Anything that is not one of the offered choices is dropped rather than written,
 * so a payload built by hand, a stale draft or a later question cannot put text into the list; and a
 * correction category only survives behind a corrected outcome.
 */
export function outcomeRecordFields(answers: IOutcomeAnswers): IOutcomeRecordFields {
  const outcome: string = choice(answers, 'outcome', OUTCOME_VALUES);
  return {
    TaskType: choice(answers, 'taskType', OUTCOME_TASK_TYPES),
    Outcome: outcome,
    ReviewState: choice(answers, 'reviewState', REVIEW_STATES),
    CorrectionCategory: outcome === CORRECTED ? choice(answers, 'correctionCategory', CORRECTION_CATEGORIES) : '',
    RouteAvailability: choice(answers, 'routeAvailability', ROUTE_AVAILABILITY)
  };
}
