/**
 * Grouped steps (1.0.0.18): one screen holding two or three closely related questions, each answer still stored under
 * its own key. A group is one step for navigation and validation; everything that lists or sends answers sees its
 * fields, so nothing downstream changes.
 */
import { answerableSteps } from '../controls/AnswerList';
import { createBranding } from '../branding/branding';
import { indexSteps } from '../services/toolPolicyEvaluator';
import { answerSteps, buildGenericExportText, expandSteps, validateStep, visibleSteps } from './formEngine';
import type { IAnswers, IPieceWorkflowDefinition, IStep } from './types';
import { Lightbulb } from '../icons';

const DEFINITION: IPieceWorkflowDefinition = {
  id: 'idea',
  title: 'Explore an AI idea',
  homeDescription: 'x',
  icon: Lightbulb,
  steps: [
    {
      id: 'theWork',
      type: 'group',
      title: 'The work',
      fields: [
        { id: 'workToImprove', type: 'textarea', title: 'What work would you like to improve?', required: true },
        { id: 'painPoints', type: 'textarea', title: 'What makes it hard?', required: true }
      ]
    },
    {
      id: 'aiToday',
      type: 'group',
      title: 'AI today',
      fields: [
        { id: 'aiAlreadyUsed', type: 'select', title: 'Is anyone already using AI for this?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        { id: 'aiToolName', type: 'text', title: 'Which tool?', required: true, showIf: (answers: IAnswers): boolean => answers.aiAlreadyUsed === 'yes' }
      ]
    },
    { id: 'later', type: 'text', title: 'Only later', showIf: (answers: IAnswers): boolean => answers.aiAlreadyUsed === 'yes' }
  ]
};

describe('grouped steps', () => {
  it('keeps a group as one step to navigate, and expands only its showing fields for listing', () => {
    const answers: IAnswers = { aiAlreadyUsed: 'no' };
    expect(visibleSteps(DEFINITION, answers).map((step: IStep): string => step.id)).toEqual(['theWork', 'aiToday']);
    const expanded: IStep[] = expandSteps(visibleSteps(DEFINITION, answers), answers);
    expect(expanded.map((step: IStep): string => `${step.id}<${step.parentId ?? ''}`)).toEqual(['workToImprove<theWork', 'painPoints<theWork', 'aiAlreadyUsed<aiToday']);
    expect(answerSteps(DEFINITION, { aiAlreadyUsed: 'yes' }).map((step: IStep): string => step.id)).toEqual(['workToImprove', 'painPoints', 'aiAlreadyUsed', 'aiToolName', 'later']);
    expect(answerableSteps(visibleSteps(DEFINITION, answers), answers).map((step: IStep): string => step.id)).toEqual(['workToImprove', 'painPoints', 'aiAlreadyUsed']);
  });

  it('validates every showing field of a group and names the one still missing', () => {
    const group: IStep = DEFINITION.steps[1];
    expect(validateStep(group, {})).toBe('Is anyone already using AI for this? Please pick one option so we can keep going.');
    expect(validateStep(group, { aiAlreadyUsed: 'no' })).toBeUndefined();
    expect(validateStep(group, { aiAlreadyUsed: 'yes' })).toBe('Which tool? Please fill in this box before continuing.');
    expect(validateStep(group, { aiAlreadyUsed: 'yes', aiToolName: 'Copilot' })).toBeUndefined();
  });

  it('exports and indexes the fields of a group like any other question', () => {
    const answers: IAnswers = { workToImprove: 'Weekly reports', painPoints: 'Copying numbers', aiAlreadyUsed: 'no' };
    const text: string = buildGenericExportText(DEFINITION, answers, visibleSteps(DEFINITION, answers), createBranding('Overture'), new Date('2026-09-30T12:00:00Z'));
    expect(text).toContain('What work would you like to improve?\nWeekly reports');
    expect(text).toContain('Is anyone already using AI for this?\nNo');
    const index: { [stepId: string]: IStep } = indexSteps(DEFINITION as never);
    expect(Object.keys(index)).toEqual(expect.arrayContaining(['theWork', 'workToImprove', 'painPoints', 'aiAlreadyUsed', 'aiToolName']));
  });
});
