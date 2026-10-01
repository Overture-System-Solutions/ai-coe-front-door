/**
 * The content-free outcome record (plan step 29b, decision 16). Two things are proved here:
 *
 * - the definition asks for choices and nothing else, with the vocabularies the references fix
 *   (MKT-16 for the four outcomes and their meanings, MKT-53 for the six correction categories,
 *   MKT-59 with MKT-13 for route availability) and the plan's own three review states;
 * - a walk through the rendered piece records only that field set: the walk answers every step by
 *   clicking an option, so a step that were a text or a textarea would fail it rather than quietly
 *   collect prose, and what the piece hands the service carries no free text at all.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeGovernanceService } from '../../../../testing/fakeServices';
import type { IFakeGovernanceService, IRecordedSubmission } from '../../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult } from '../../../../testing/renderWithFrontDoor';
import { PageViewShell } from '../../components/PageViewShell';
import { TRUTH_STATES } from '../truthStates';
import type { ITruthState } from '../truthStates';
import { isChoiceStep } from '../../workflows/types';
import type { IAnswers, IChoiceStep, IStep, IStepOption } from '../../workflows/types';
import {
  CORRECTION_CATEGORIES,
  OUTCOME_HELP,
  OUTCOME_STEP_IDS,
  OUTCOME_TASK_TYPES,
  OUTCOME_VALUES,
  OUTCOME_WORKFLOW,
  OUTCOME_WORKFLOW_VERSION,
  outcomeRecordFields,
  REVIEW_STATES,
  ROUTE_AVAILABILITY
} from './outcome';
import type { IOutcomeRecordFields } from './outcome';

jest.setTimeout(20000);

function step(id: string): IStep {
  const found: IStep | undefined = OUTCOME_WORKFLOW.steps.filter((candidate: IStep): boolean => candidate.id === id)[0];
  if (found === undefined) {
    throw new Error(`The outcome workflow has no step "${id}".`);
  }
  return found;
}

function choices(id: string): string[] {
  const candidate: IStep = step(id);
  if (!isChoiceStep(candidate)) {
    throw new Error(`Step "${id}" is not a choice step.`);
  }
  return (candidate as IChoiceStep).options.map((option: IStepOption): string => option.value);
}

function visible(answers: IAnswers): IStep[] {
  return OUTCOME_WORKFLOW.steps.filter((candidate: IStep): boolean => candidate.showIf === undefined || candidate.showIf(answers));
}

/**
 * Answers the piece as a person would: every step is answered by clicking one of its option buttons.
 * A step of any other kind has no option group, so the walk fails there instead of typing into it.
 */
async function walk(root: HTMLElement, chosen: { [stepId: string]: string }): Promise<IAnswers> {
  const answers: IAnswers = {};
  for (let index: number = 0; ; index++) {
    const steps: IStep[] = visible(answers);
    if (index >= steps.length) {
      break;
    }
    const current: IStep = steps[index];
    if (current.type !== 'select') {
      throw new Error(`Step "${current.id}" is a ${current.type} step; the outcome record asks for choices only.`);
    }
    const value: string = chosen[current.id];
    const option: IStepOption | undefined = (current as IChoiceStep).options.filter((candidate: IStepOption): boolean => candidate.value === value)[0];
    if (option === undefined) {
      throw new Error(`Step "${current.id}" has no option "${value}".`);
    }
    const group: HTMLElement = await within(root).findByRole('group', { name: current.title });
    fireEvent.click(within(group).getByRole('button', { name: option.label }));
    answers[current.id] = value;
    fireEvent.click(within(root).getByRole('button', { name: /^(Continue|Review my answers)$/ }));
  }
  return answers;
}

interface IRun {
  governance: IFakeGovernanceService;
  root: HTMLElement;
  answers: IAnswers;
}

/** Renders the outcome piece in its page view, walks it and confirms. */
async function record(chosen: { [stepId: string]: string }): Promise<IRun> {
  const governance: IFakeGovernanceService = createFakeGovernanceService();
  const harness: FrontDoorRenderResult = renderWithFrontDoor(
    React.createElement(PageViewShell, { settings: { view: 'outcome', layout: 'wide', pages: {} } }),
    { governance, pageView: true }
  );
  const root: HTMLElement = harness.container;
  await screen.findByRole('heading', { level: 2, name: OUTCOME_WORKFLOW.steps[0].title });
  const answers: IAnswers = await walk(root, chosen);
  fireEvent.click(within(root).getByRole('button', { name: 'Confirm' }));
  await waitFor((): void => expect(governance.submissions.length).toBeGreaterThan(0));
  return { governance, root, answers };
}

const ACCEPTED: { [stepId: string]: string } = {
  taskType: OUTCOME_TASK_TYPES[0],
  outcome: 'Accepted',
  reviewState: 'Reviewed by me',
  routeAvailability: 'Available now'
};

const CORRECTED: { [stepId: string]: string } = {
  taskType: OUTCOME_TASK_TYPES[1],
  outcome: 'Corrected',
  reviewState: 'Reviewed by someone else',
  correctionCategory: 'source',
  routeAvailability: 'Draft only'
};

describe('the outcome record asks for choices only', () => {
  it('is five select steps, each required, with at least two options and no free-text step', () => {
    expect(OUTCOME_WORKFLOW.id).toBe('outcome');
    expect(OUTCOME_WORKFLOW.title).toBe('Record a task outcome');
    expect(OUTCOME_WORKFLOW.workflowVersion).toBe(OUTCOME_WORKFLOW_VERSION);
    expect(OUTCOME_WORKFLOW.steps.map((candidate: IStep): string => candidate.id)).toEqual(OUTCOME_STEP_IDS.slice());
    for (const candidate of OUTCOME_WORKFLOW.steps) {
      expect({ id: candidate.id, type: candidate.type }).toEqual({ id: candidate.id, type: 'select' });
      expect(candidate.required).toBe(true);
      expect(isChoiceStep(candidate) && candidate.options.length).toBeGreaterThan(1);
      // No step invites the task itself, the prompt or the answer: nothing here holds a free-text hint.
      expect(candidate.placeholder).toBeUndefined();
    }
  });

  it('offers the four outcome words of the quick start with their meanings as help (MKT-16)', () => {
    expect(OUTCOME_VALUES).toEqual(['Accepted', 'Corrected', 'Unavailable', 'Stopped']);
    expect(choices('outcome')).toEqual(OUTCOME_VALUES.slice());
    expect(step('outcome').help).toBe(OUTCOME_HELP);
    for (const meaning of [
      'Accepted: useful after review.',
      'Corrected: useful after a material correction.',
      'Unavailable: a needed source, capability or access route was missing.',
      'Stopped: the task was unsafe, unclear or outside the pilot.'
    ]) {
      expect(OUTCOME_HELP).toContain(meaning);
    }
  });

  it('offers the three review states the plan enumerates (decision 16)', () => {
    expect(REVIEW_STATES).toEqual(['Reviewed by me', 'Reviewed by someone else', 'Not reviewed']);
    expect(choices('reviewState')).toEqual(REVIEW_STATES.slice());
  });

  it('asks for a correction category only after a corrected outcome, from the six of the scorecard (MKT-53)', () => {
    expect(CORRECTION_CATEGORIES).toEqual(['fact', 'source', 'audience', 'policy', 'brand', 'action boundary']);
    expect(choices('correctionCategory')).toEqual(CORRECTION_CATEGORIES.slice());
    expect(visible({ outcome: 'Corrected' }).map((candidate: IStep): string => candidate.id)).toContain('correctionCategory');
    for (const outcome of ['Accepted', 'Unavailable', 'Stopped', '']) {
      expect(visible({ outcome }).map((candidate: IStep): string => candidate.id)).not.toContain('correctionCategory');
    }
  });

  it('asks what the route showed, in the five truth labels (MKT-59, MKT-13)', () => {
    expect(ROUTE_AVAILABILITY).toEqual(TRUTH_STATES.map((state: ITruthState): string => state.label));
    expect(ROUTE_AVAILABILITY).toEqual(['Available now', 'Draft only', 'Needs approval', 'Needs access', 'Not supported']);
    expect(choices('routeAvailability')).toEqual(ROUTE_AVAILABILITY.slice());
  });

  it('asks for the kind of task from a short fixed list, never for the task itself', () => {
    expect(OUTCOME_TASK_TYPES.length).toBeGreaterThan(2);
    expect(OUTCOME_TASK_TYPES.length).toBeLessThan(8);
    expect(choices('taskType')).toEqual(OUTCOME_TASK_TYPES.slice());
  });
});

describe('the fields a walk records', () => {
  it('records the MKT-17 field set plus route availability, and nothing else', () => {
    const fields: IOutcomeRecordFields = outcomeRecordFields({
      taskType: OUTCOME_TASK_TYPES[0],
      outcome: 'Corrected',
      reviewState: 'Not reviewed',
      correctionCategory: 'brand',
      routeAvailability: 'Needs access'
    });
    expect(Object.keys(fields).sort()).toEqual(['CorrectionCategory', 'Outcome', 'ReviewState', 'RouteAvailability', 'TaskType']);
    expect(fields).toEqual({
      TaskType: OUTCOME_TASK_TYPES[0],
      Outcome: 'Corrected',
      ReviewState: 'Not reviewed',
      CorrectionCategory: 'brand',
      RouteAvailability: 'Needs access'
    });
  });

  it('keeps a correction category only behind a corrected outcome', () => {
    const fields: IOutcomeRecordFields = outcomeRecordFields({ outcome: 'Accepted', correctionCategory: 'fact' });
    expect(fields.CorrectionCategory).toBe('');
  });

  it('drops anything that is not one of the declared choices, so no typed text can reach the record', () => {
    const fields: IOutcomeRecordFields = outcomeRecordFields({
      taskType: 'The Q4 launch brief for Contoso',
      outcome: 'It went fine',
      reviewState: ['Reviewed by me'],
      correctionCategory: 'the numbers were wrong',
      routeAvailability: 'looked available'
    });
    expect(fields).toEqual({ TaskType: '', Outcome: '', ReviewState: '', CorrectionCategory: '', RouteAvailability: '' });
  });
});

describe('the piece in its page view', () => {
  it('walks on options alone and hands the service the five answers, with the receipt after it', async () => {
    const { governance, root, answers } = await record(ACCEPTED);
    expect(Object.keys(answers).sort()).toEqual(['outcome', 'reviewState', 'routeAvailability', 'taskType']);
    expect(governance.submissions).toHaveLength(1);
    const submission: IRecordedSubmission = governance.submissions[0];
    expect(submission.workflowType).toBe('outcome');
    expect(Object.keys(submission.payload as IAnswers).sort()).toEqual(['outcome', 'reviewState', 'routeAvailability', 'taskType']);
    expect(outcomeRecordFields(submission.payload as IAnswers)).toEqual({
      TaskType: OUTCOME_TASK_TYPES[0],
      Outcome: 'Accepted',
      ReviewState: 'Reviewed by me',
      CorrectionCategory: '',
      RouteAvailability: 'Available now'
    });
    await waitFor((): void => expect(root.textContent).toContain('Saved and confirmed'));
  });

  it('asks the correction category on the way through after a corrected outcome', async () => {
    const { governance, answers } = await record(CORRECTED);
    expect(answers.correctionCategory).toBe('source');
    expect(outcomeRecordFields(governance.submissions[0].payload as IAnswers)).toEqual({
      TaskType: OUTCOME_TASK_TYPES[1],
      Outcome: 'Corrected',
      ReviewState: 'Reviewed by someone else',
      CorrectionCategory: 'source',
      RouteAvailability: 'Draft only'
    });
  });
});
