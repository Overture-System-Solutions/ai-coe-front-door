import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import {
  buildGenericExportText,
  createGenericSession,
  formatAnswer,
  genericReducer,
  validateStep,
  visibleSteps,
  whatHappensNextText
} from './formEngine';
import type { IGenericSession } from './formEngine';
import type { IAnswers, IStep, IWorkflowCatalog, IWorkflowDefinition } from './types';

const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));
const helpTraining: IWorkflowDefinition = catalog.helpTraining;
const toolCheck: IWorkflowDefinition = catalog.toolCheck;

function stepOf(definition: IWorkflowDefinition, id: string): IStep {
  const found: IStep | undefined = definition.steps.filter((candidate: IStep): boolean => candidate.id === id)[0];
  if (found === undefined) {
    throw new Error(`Missing step ${id}`);
  }
  return found;
}

describe('visibleSteps', () => {
  it('keeps unconditional steps and evaluates showIf against the answers', () => {
    const ids: string[] = visibleSteps(helpTraining, { helpCategory: 'teamTraining' }).map((candidate: IStep): string => candidate.id);
    expect(ids).toEqual(['helpCategory', 'teamTrainingSize', 'teamTrainingTopics', 'name', 'team', 'email']);
    expect(visibleSteps(helpTraining, {}).map((candidate: IStep): string => candidate.id)).toEqual(['helpCategory', 'name', 'team', 'email']);
  });
});

describe('validateStep', () => {
  it('returns the original message for each missing required answer', () => {
    expect(validateStep(stepOf(toolCheck, 'toolKnown'), {})).toBe('Please pick one option so we can keep going.');
    expect(validateStep(stepOf(toolCheck, 'sensitiveCategories'), {})).toBe('Please pick at least one option so we can keep going.');
    expect(validateStep(stepOf(toolCheck, 'sensitiveCategories'), { sensitiveCategories: [] })).toBe('Please pick at least one option so we can keep going.');
    expect(validateStep(stepOf(toolCheck, 'toolName'), { toolName: '   ' })).toBe('Please fill in this box before continuing.');
    expect(validateStep(stepOf(toolCheck, 'helpWith'), {})).toBe('Please add a few words before continuing. Even a short sentence is fine.');
  });

  it('accepts answered required steps and ignores optional and notice steps', () => {
    expect(validateStep(stepOf(toolCheck, 'toolKnown'), { toolKnown: 'yes' })).toBeUndefined();
    expect(validateStep(stepOf(toolCheck, 'sensitiveCategories'), { sensitiveCategories: ['none'] })).toBeUndefined();
    expect(validateStep(stepOf(toolCheck, 'helpWith'), { helpWith: 'Draft replies' })).toBeUndefined();
    expect(validateStep(stepOf(toolCheck, 'informationType'), {})).toBeUndefined();
    expect(validateStep(stepOf(toolCheck, 'sensitiveNotice'), {})).toBeUndefined();
    expect(validateStep(undefined, {})).toBeUndefined();
  });
});

describe('formatAnswer', () => {
  it('resolves option labels, joins multiselects and passes text through', () => {
    expect(formatAnswer(stepOf(toolCheck, 'toolApprovalStatus'), 'notApproved')).toBe("I don't think it's approved yet");
    expect(formatAnswer(stepOf(toolCheck, 'toolApprovalStatus'), 'mystery')).toBe('mystery');
    expect(formatAnswer(stepOf(toolCheck, 'sensitiveCategories'), ['patient', 'employee'])).toBe('Patient information, Employee information');
    expect(formatAnswer(stepOf(toolCheck, 'sensitiveCategories'), ['patient', 'zzz'])).toBe('Patient information, zzz');
    expect(formatAnswer(stepOf(toolCheck, 'sensitiveCategories'), [])).toBe('');
    expect(formatAnswer(stepOf(toolCheck, 'helpWith'), 'Draft replies')).toBe('Draft replies');
    expect(formatAnswer(stepOf(toolCheck, 'helpWith'), undefined)).toBe('');
    expect(formatAnswer(stepOf(toolCheck, 'helpWith'), '')).toBe('');
  });
});

describe('whatHappensNextText', () => {
  it('returns the definition text unchanged', () => {
    expect(whatHappensNextText(helpTraining, {})).toBe(helpTraining.whatHappensNext);
    expect(whatHappensNextText(toolCheck, {})).toBeUndefined();
  });
});

describe('createGenericSession', () => {
  it('starts at the first visible step with empty state', () => {
    const session: IGenericSession = createGenericSession(helpTraining, undefined);
    expect(session).toEqual({
      answers: {},
      currentStepId: 'helpCategory',
      phase: 'form',
      editReturnTarget: undefined,
      errors: {},
      result: undefined,
      notice: undefined
    });
  });

  it('resumes a draft, keeping a still-visible step and the review phase', () => {
    const answers: IAnswers = { helpCategory: 'prompting', promptingGoal: 'Better prompts' };
    const session: IGenericSession = createGenericSession(helpTraining, { answers, currentStepId: 'promptingGoal', phase: 'review' });
    expect(session.answers).toEqual(answers);
    expect(session.currentStepId).toBe('promptingGoal');
    expect(session.phase).toBe('review');
    expect(session.notice).toBe('Picking up where you left off.');
  });

  it('falls back to the first visible step when the saved step is hidden', () => {
    const session: IGenericSession = createGenericSession(helpTraining, { answers: { helpCategory: 'new' }, currentStepId: 'promptingGoal', phase: 'form' });
    expect(session.currentStepId).toBe('helpCategory');
    expect(session.phase).toBe('form');
    expect(session.notice).toBe('Picking up where you left off.');
  });
});

describe('genericReducer', () => {
  const initial: IGenericSession = createGenericSession(helpTraining, undefined);

  it('records answers and clears their error and any notice', () => {
    const withError: IGenericSession = genericReducer(initial, { type: 'SET_ERROR', stepId: 'helpCategory', message: 'Oops' });
    expect(withError.errors.helpCategory).toBe('Oops');
    const answered: IGenericSession = genericReducer({ ...withError, notice: 'Picking up where you left off.' }, { type: 'ANSWER', stepId: 'helpCategory', value: 'new' });
    expect(answered.answers).toEqual({ helpCategory: 'new' });
    expect(answered.errors.helpCategory).toBeUndefined();
    expect(answered.notice).toBeUndefined();
  });

  it('moves between steps and phases', () => {
    const moved: IGenericSession = genericReducer(initial, { type: 'GOTO', stepId: 'name', phase: 'form', editReturnTarget: 'review' });
    expect(moved.currentStepId).toBe('name');
    expect(moved.editReturnTarget).toBe('review');
    const plain: IGenericSession = genericReducer(moved, { type: 'GOTO', stepId: 'team' });
    expect(plain.phase).toBe('form');
    expect(plain.editReturnTarget).toBeUndefined();
    expect(genericReducer(initial, { type: 'SET_PHASE', phase: 'submitting' }).phase).toBe('submitting');
    const done: IGenericSession = genericReducer(initial, { type: 'SET_RESULT', result: { connected: true, message: 'ok' } });
    expect(done.phase).toBe('result');
    expect(done.result).toEqual({ connected: true, message: 'ok' });
    expect(genericReducer(initial, { type: 'SET_NOTICE', text: 'Saved.' }).notice).toBe('Saved.');
    expect(genericReducer(done, { type: 'RESET', session: initial })).toBe(initial);
  });
});

describe('buildGenericExportText', () => {
  it('lists the answered visible steps under the branded header', () => {
    const answers: IAnswers = { helpCategory: 'teamTraining', teamTrainingSize: 'aFew', name: 'Pat', team: 'Billing', email: '' };
    const text: string = buildGenericExportText(helpTraining, answers, visibleSteps(helpTraining, answers), createBranding('Overture'), new Date(2026, 8, 11, 9, 30));
    const lines: string[] = text.split('\n');
    expect(lines[0]).toBe('Overture AI CoE — I need help or training');
    expect(lines[1]).toBe('AI CoE submission summary');
    expect(lines[2]).toBe(`Created: ${new Date(2026, 8, 11, 9, 30).toLocaleString()}`);
    expect(lines[3]).toBe('');
    expect(lines.slice(4, 13)).toEqual([
      'What would you like help with?', 'My team needs training', '',
      'About how many people would need training?', 'A few people', '',
      'What is your name?', 'Pat', ''
    ]);
    expect(lines.slice(13, 16)).toEqual(['What team are you on?', 'Billing', '']);
    expect(lines[lines.length - 1]).toBe(helpTraining.whatHappensNext);
    expect(text).not.toContain('What is your work email?');
  });

  it('uses neutral wording when no organization is configured', () => {
    const text: string = buildGenericExportText(helpTraining, {}, [], createBranding(''), new Date(2026, 0, 1));
    expect(text.split('\n')[0]).toBe('AI CoE — I need help or training');
  });
});
