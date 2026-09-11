/**
 * Scripted answers for each workflow plus DOM drivers that play them through the rendered UI.
 * Shared by the component tests and the original-versus-port parity suite.
 */
import { fireEvent, within } from '@testing-library/react';
import { visibleSteps } from '../webparts/aiCoeFrontDoor/workflows/formEngine';
import { isChoiceStep } from '../webparts/aiCoeFrontDoor/workflows/types';
import type { IAnswers, IStep, IStepOption, IWorkflowDefinition, WorkflowId } from '../webparts/aiCoeFrontDoor/workflows/types';

export interface IJourneyAnswer {
  stepId: string;
  value: string | string[];
}

export interface IJourney {
  workflowId: WorkflowId;
  answers: IJourneyAnswer[];
}

export const HELP_TRAINING_JOURNEY: IJourney = {
  workflowId: 'helpTraining',
  answers: [
    { stepId: 'helpCategory', value: 'teamTraining' },
    { stepId: 'teamTrainingSize', value: 'aFew' },
    { stepId: 'teamTrainingTopics', value: 'Prompting basics and safe use of Copilot.' },
    { stepId: 'name', value: 'Pat Example' },
    { stepId: 'team', value: 'Finance' },
    { stepId: 'email', value: 'pat@contoso.com' }
  ]
};

export const IDEA_JOURNEY: IJourney = {
  workflowId: 'idea',
  answers: [
    { stepId: 'workToImprove', value: 'Summarising weekly status reports for leadership.' },
    { stepId: 'painPoints', value: 'It takes two hours every Friday.' },
    { stepId: 'peopleInvolved', value: 'The finance team and two analysts.' },
    { stepId: 'frequency', value: 'weekly' },
    { stepId: 'timeSpent', value: 'hours' },
    { stepId: 'systemsInvolved', value: 'Teams and SharePoint' },
    { stepId: 'informationUsed', value: 'Team status updates' },
    { stepId: 'informationCategories', value: ['internal'] },
    { stepId: 'aiAlreadyUsed', value: 'no' },
    { stepId: 'desiredOutcome', value: 'A draft summary ready for review in minutes.' },
    { stepId: 'successMeasure', value: 'Hours saved each week.' },
    { stepId: 'hasDeadlineSponsor', value: 'no' },
    { stepId: 'anythingElse', value: 'Nothing else.' }
  ]
};

export const TOOL_CHECK_JOURNEY: IJourney = {
  workflowId: 'toolCheck',
  answers: [
    { stepId: 'helpWith', value: 'Drafting internal meeting notes.' },
    { stepId: 'toolKnown', value: 'yes' },
    { stepId: 'toolName', value: 'Copilot' },
    { stepId: 'toolApprovalStatus', value: 'approved' },
    { stepId: 'informationType', value: 'Meeting agendas' },
    { stepId: 'companyDataOrWorkflow', value: 'no' },
    { stepId: 'sensitiveCategories', value: ['none'] },
    { stepId: 'filesUploaded', value: 'no' },
    { stepId: 'outputSharedExternally', value: 'no' },
    { stepId: 'aiDecisionImportance', value: 'no' },
    { stepId: 'aiTakesAction', value: 'no' },
    { stepId: 'humanReview', value: 'always' },
    { stepId: 'usagePattern', value: 'occasional' }
  ]
};

/** Same shape as the tool check journey, but the tool is unknown, which routes to the "guidance gap" outcome. */
export const TOOL_CHECK_GAP_JOURNEY: IJourney = {
  workflowId: 'toolCheck',
  answers: [
    { stepId: 'helpWith', value: 'Cleaning up survey responses.' },
    { stepId: 'toolKnown', value: 'no' },
    { stepId: 'toolApprovalStatus', value: 'unknown' },
    { stepId: 'informationType', value: 'Anonymous survey text' },
    { stepId: 'companyDataOrWorkflow', value: 'no' },
    { stepId: 'sensitiveCategories', value: ['none'] },
    { stepId: 'filesUploaded', value: 'no' },
    { stepId: 'outputSharedExternally', value: 'no' },
    { stepId: 'aiDecisionImportance', value: 'no' },
    { stepId: 'aiTakesAction', value: 'no' },
    { stepId: 'humanReview', value: 'always' },
    { stepId: 'usagePattern', value: 'experimental' }
  ]
};

export const TEAM_USAGE_JOURNEY: IJourney = {
  workflowId: 'teamUsage',
  answers: [
    { stepId: 'toolName', value: 'ChatGPT' },
    { stepId: 'usageScope', value: 'smallTeam' },
    { stepId: 'departmentOrWork', value: 'Finance reporting' },
    { stepId: 'toolPurpose', value: 'Drafting emails and summarising documents.' },
    { stepId: 'frequency', value: 'weekly' },
    { stepId: 'sourceType', value: 'company' },
    { stepId: 'informationEntered', value: 'Internal notes' },
    { stepId: 'companyDataOrWorkflow', value: 'no' },
    { stepId: 'filesUploaded', value: 'no' },
    { stepId: 'sensitiveCategories', value: ['none'] },
    { stepId: 'benefitObserved', value: 'Faster first drafts.' },
    { stepId: 'concernsExperienced', value: 'None so far.' },
    { stepId: 'humanReview', value: 'always' },
    { stepId: 'aiTakesAction', value: 'no' },
    { stepId: 'followUpPreference', value: 'guidance' }
  ]
};

export const FEEDBACK_JOURNEY: IJourney = {
  workflowId: 'feedback',
  answers: [
    { stepId: 'serviceInvolved', value: 'toolCheck' },
    { stepId: 'gotClearNextStep', value: 'clear' },
    { stepId: 'easeRating', value: 'easy' },
    { stepId: 'positiveFeedback', value: 'Clear guidance.' },
    { stepId: 'frictionPoints', value: 'None.' },
    { stepId: 'suggestedImprovement', value: 'Add examples.' },
    { stepId: 'followUpPermission', value: 'yes' },
    { stepId: 'contactName', value: 'Pat Example' },
    { stepId: 'contactEmail', value: 'pat@contoso.com' }
  ]
};

export const JOURNEYS: readonly IJourney[] = [IDEA_JOURNEY, TOOL_CHECK_JOURNEY, TEAM_USAGE_JOURNEY, HELP_TRAINING_JOURNEY, FEEDBACK_JOURNEY];

export function journeyAnswers(journey: IJourney): IAnswers {
  const answers: IAnswers = {};
  for (const answer of journey.answers) {
    answers[answer.stepId] = answer.value;
  }
  return answers;
}

const CONTINUE_LABELS: RegExp = /^(Continue|Review my answers|Create my summary|See guidance|See my summary|Review my feedback|Save & return to (review|summary)|Save & review result)$/;

/** The primary "continue" button of the step navigation, whatever label the workflow gives it. */
export function continueButton(root: HTMLElement = document.body): HTMLElement {
  return within(root).getByRole('button', { name: CONTINUE_LABELS });
}

function optionLabel(step: IStep, value: string): string {
  if (!isChoiceStep(step)) {
    throw new Error(`Step "${step.id}" is not a choice step.`);
  }
  const option: IStepOption | undefined = step.options.filter((candidate: IStepOption): boolean => candidate.value === value)[0];
  if (option === undefined) {
    throw new Error(`Step "${step.id}" has no option "${value}".`);
  }
  return option.label;
}

/** Enters `value` into the control of `step` as a visitor would: option buttons or the field carrying the step id. */
export function enterAnswer(step: IStep, value: string | string[], root: HTMLElement = document.body): void {
  if (isChoiceStep(step)) {
    const group: HTMLElement = within(root).getByRole('group', { name: step.title });
    const values: string[] = Array.isArray(value) ? value : [value];
    for (const item of values) {
      fireEvent.click(within(group).getByRole('button', { name: optionLabel(step, item) }));
    }
    return;
  }
  const field: HTMLElement | null = root.querySelector(`#${step.id}`);
  if (field === null) {
    throw new Error(`No input with id "${step.id}" on screen.`);
  }
  fireEvent.change(field, { target: { value: Array.isArray(value) ? value.join(', ') : value } });
}

/**
 * Plays the journey from the first visible step: answers each question, passes notices, and presses
 * continue after every step, including the last one.
 */
export function playJourney(journey: IJourney, definition: IWorkflowDefinition, root: HTMLElement = document.body): void {
  const answers: IAnswers = {};
  for (let index: number = 0; ; index++) {
    const steps: IStep[] = visibleSteps(definition, answers);
    if (index >= steps.length) {
      return;
    }
    const step: IStep = steps[index];
    if (step.type !== 'notice') {
      const answer: IJourneyAnswer | undefined = journey.answers.filter((candidate: IJourneyAnswer): boolean => candidate.stepId === step.id)[0];
      if (answer === undefined) {
        throw new Error(`Journey "${journey.workflowId}" has no answer for step "${step.id}".`);
      }
      enterAnswer(step, answer.value, root);
      answers[step.id] = answer.value;
    }
    fireEvent.click(continueButton(root));
  }
}
