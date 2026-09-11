import { createBranding } from '../../branding/branding';
import { isChoiceStep } from '../../workflows/types';
import type { IAnswers, IStep, IWorkflowCatalog, WorkflowId } from '../../workflows/types';
import { COMPANY_INFORMATION_HELP_SUFFIX, SENSITIVE_INFO_NOTICE, companyInformationHelp } from './copy';
import { createWorkflowCatalog, WORKFLOW_ORDER } from './catalog';

const overture: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));
const neutral: IWorkflowCatalog = createWorkflowCatalog(createBranding(''));

function step(catalog: IWorkflowCatalog, workflowId: WorkflowId, stepId: string): IStep {
  const found: IStep | undefined = catalog[workflowId].steps.filter((candidate: IStep): boolean => candidate.id === stepId)[0];
  if (found === undefined) {
    throw new Error(`Missing step ${workflowId}.${stepId}`);
  }
  return found;
}

function isVisible(catalog: IWorkflowCatalog, workflowId: WorkflowId, stepId: string, answers: IAnswers): boolean {
  const candidate: IStep = step(catalog, workflowId, stepId);
  return candidate.showIf === undefined ? true : candidate.showIf(answers);
}

describe('workflow catalog', () => {
  it('lists the five workflows in the original home-page order', () => {
    expect(WORKFLOW_ORDER).toEqual(['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback']);
  });

  it('carries the original titles, descriptions and versions', () => {
    expect(overture.idea.title).toBe('I have an idea for using AI');
    expect(overture.idea.homeDescription).toBe('Share an idea for using AI to help with your work.');
    expect(overture.idea.workflowVersion).toBe('2.1');
    expect(overture.idea.resultIntro).toBe('Thanks for sharing your idea.');
    expect(overture.idea.whatHappensNext).toBe(
      'Your idea will enter the AI CoE intake and triage process. You will receive the submission identifier shown after confirmation.'
    );
    expect(overture.toolCheck.title).toBe('I want to know if an AI tool or task is okay');
    expect(overture.toolCheck.homeDescription).toBe('Ask about a tool or task before you use it.');
    expect(overture.toolCheck.workflowVersion).toBe('2.1');
    expect(overture.teamUsage.title).toBe('My team is already using an AI tool');
    expect(overture.teamUsage.homeDescription).toBe('Tell us about an AI tool your team already uses.');
    expect(overture.teamUsage.workflowVersion).toBe('2.1');
    expect(overture.helpTraining.title).toBe('I need help or training');
    expect(overture.helpTraining.homeDescription).toBe('Get help learning about AI, or find training.');
    expect(overture.helpTraining.workflowVersion).toBeUndefined();
    expect(overture.helpTraining.resultIntro).toBe('Thanks for reaching out.');
    expect(overture.helpTraining.whatHappensNext).toBe(
      "There's no connected list of courses or sessions yet, so this can't point you to a specific one right now. Your request will be recorded in the AI CoE service queue for follow-up."
    );
    expect(overture.feedback.title).toBe('I want to give the AI CoE feedback');
    expect(overture.feedback.homeDescription).toBe('Share your thoughts to help us do better.');
    expect(overture.feedback.workflowVersion).toBe('2.0');
  });

  it('has the original step ids in order', () => {
    const ids = (workflowId: WorkflowId): string[] => overture[workflowId].steps.map((candidate: IStep): string => candidate.id);
    expect(ids('idea')).toEqual([
      'workToImprove', 'painPoints', 'peopleInvolved', 'frequency', 'timeSpent', 'systemsInvolved', 'informationUsed',
      'informationCategories', 'informationSensitiveNotice', 'aiAlreadyUsed', 'aiToolName', 'desiredOutcome',
      'successMeasure', 'hasDeadlineSponsor', 'deadlineSponsorDetail', 'anythingElse'
    ]);
    expect(ids('toolCheck')).toEqual([
      'helpWith', 'toolKnown', 'toolName', 'toolApprovalStatus', 'informationType', 'companyDataOrWorkflow',
      'sensitiveCategories', 'sensitiveNotice', 'filesUploaded', 'fileTypeDetail', 'outputSharedExternally',
      'aiDecisionImportance', 'aiTakesAction', 'actionSystemDetail', 'humanReview', 'usagePattern'
    ]);
    expect(ids('teamUsage')).toEqual([
      'toolName', 'usageScope', 'departmentOrWork', 'toolPurpose', 'frequency', 'sourceType', 'informationEntered',
      'companyDataOrWorkflow', 'filesUploaded', 'fileTypeDetail', 'sensitiveCategories', 'sensitiveNotice',
      'benefitObserved', 'concernsExperienced', 'humanReview', 'aiTakesAction', 'actionNotice', 'actionSystemDetail',
      'followUpPreference'
    ]);
    expect(ids('helpTraining')).toEqual([
      'helpCategory', 'newToAiFocus', 'specificTaskDetail', 'chooseToolGoal', 'teamTrainingSize', 'teamTrainingTopics',
      'promptingGoal', 'checkingOutputDetail', 'aiProjectDetail', 'aiProjectStage', 'somethingElseDetail', 'name', 'team', 'email'
    ]);
    expect(ids('feedback')).toEqual([
      'serviceInvolved', 'gotClearNextStep', 'easeRating', 'positiveFeedback', 'frictionPoints', 'suggestedImprovement',
      'followUpPermission', 'contactName', 'contactEmail'
    ]);
  });

  it('gives every choice step at least two options and every notice a body', () => {
    for (const workflowId of WORKFLOW_ORDER) {
      for (const candidate of overture[workflowId].steps) {
        if (isChoiceStep(candidate)) {
          expect(candidate.options.length).toBeGreaterThanOrEqual(2);
        }
        if (candidate.type === 'notice') {
          expect(candidate.body.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('shows conditional steps exactly as the original predicates did', () => {
    expect(isVisible(overture, 'idea', 'aiToolName', { aiAlreadyUsed: 'yes' })).toBe(true);
    expect(isVisible(overture, 'idea', 'aiToolName', { aiAlreadyUsed: 'no' })).toBe(false);
    expect(isVisible(overture, 'idea', 'deadlineSponsorDetail', { hasDeadlineSponsor: 'yes' })).toBe(true);
    expect(isVisible(overture, 'idea', 'deadlineSponsorDetail', {})).toBe(false);
    expect(isVisible(overture, 'idea', 'informationSensitiveNotice', { informationCategories: ['public', 'internal'] })).toBe(false);
    expect(isVisible(overture, 'idea', 'informationSensitiveNotice', { informationCategories: ['internal', 'employee'] })).toBe(true);
    expect(isVisible(overture, 'idea', 'informationSensitiveNotice', { informationCategories: ['unsure'] })).toBe(true);
    expect(isVisible(overture, 'idea', 'informationSensitiveNotice', { informationCategories: 'employee' })).toBe(false);

    expect(isVisible(overture, 'toolCheck', 'toolName', { toolKnown: 'yes' })).toBe(true);
    expect(isVisible(overture, 'toolCheck', 'toolName', { toolKnown: 'no' })).toBe(false);
    expect(isVisible(overture, 'toolCheck', 'sensitiveNotice', { sensitiveCategories: ['none'] })).toBe(false);
    expect(isVisible(overture, 'toolCheck', 'sensitiveNotice', { sensitiveCategories: ['regulated'] })).toBe(true);
    expect(isVisible(overture, 'toolCheck', 'fileTypeDetail', { filesUploaded: 'yes' })).toBe(true);
    expect(isVisible(overture, 'toolCheck', 'fileTypeDetail', { filesUploaded: 'unsure' })).toBe(false);
    expect(isVisible(overture, 'toolCheck', 'actionSystemDetail', { aiTakesAction: 'yes' })).toBe(true);
    expect(isVisible(overture, 'toolCheck', 'actionSystemDetail', { aiTakesAction: 'no' })).toBe(false);

    expect(isVisible(overture, 'teamUsage', 'sensitiveNotice', { sensitiveCategories: ['regulated'] })).toBe(false);
    expect(isVisible(overture, 'teamUsage', 'sensitiveNotice', { sensitiveCategories: ['customer'] })).toBe(true);
    expect(isVisible(overture, 'teamUsage', 'actionNotice', { aiTakesAction: 'yes' })).toBe(true);
    expect(isVisible(overture, 'teamUsage', 'actionNotice', { aiTakesAction: 'unsure' })).toBe(false);
    expect(isVisible(overture, 'teamUsage', 'fileTypeDetail', { filesUploaded: 'yes' })).toBe(true);

    const helpBranches: [string, string][] = [
      ['newToAiFocus', 'new'], ['specificTaskDetail', 'specificTask'], ['chooseToolGoal', 'chooseTool'],
      ['teamTrainingSize', 'teamTraining'], ['teamTrainingTopics', 'teamTraining'], ['promptingGoal', 'prompting'],
      ['checkingOutputDetail', 'checkingOutput'], ['aiProjectDetail', 'aiProject'], ['aiProjectStage', 'aiProject'],
      ['somethingElseDetail', 'other']
    ];
    for (const [stepId, category] of helpBranches) {
      expect(isVisible(overture, 'helpTraining', stepId, { helpCategory: category })).toBe(true);
      expect(isVisible(overture, 'helpTraining', stepId, { helpCategory: 'zzz' })).toBe(false);
    }
    expect(isVisible(overture, 'helpTraining', 'name', {})).toBe(true);

    expect(isVisible(overture, 'feedback', 'contactName', { followUpPermission: 'yes' })).toBe(true);
    expect(isVisible(overture, 'feedback', 'contactEmail', { followUpPermission: 'no' })).toBe(false);
  });

  it('marks exclusive options and required flags as in the original', () => {
    const categories: IStep = step(overture, 'toolCheck', 'sensitiveCategories');
    expect(isChoiceStep(categories) && categories.options.filter((option) => option.exclusive).map((option) => option.value)).toEqual(['none', 'unsure']);
    const ideaCategories: IStep = step(overture, 'idea', 'informationCategories');
    expect(isChoiceStep(ideaCategories) && ideaCategories.options.filter((option) => option.exclusive).map((option) => option.value)).toEqual(['unsure']);
    expect(step(overture, 'idea', 'systemsInvolved').required).toBe(false);
    expect(step(overture, 'idea', 'workToImprove').required).toBe(true);
    expect(step(overture, 'idea', 'workToImprove').showSafetyNotice).toBe(true);
    expect(step(overture, 'helpTraining', 'email').required).toBe(false);
    expect(step(overture, 'feedback', 'contactEmail').help).toBe('This is optional.');
  });

  it('reuses the shared sensitive-information notice', () => {
    expect(SENSITIVE_INFO_NOTICE).toBe(
      'Thanks for letting us know. When patient, employee, or customer information may be involved, this may need an extra look before moving forward. That is okay — you do not need to add any details about the information itself. We will just ask a few more general questions.'
    );
    const ideaNotice: IStep = step(overture, 'idea', 'informationSensitiveNotice');
    const toolNotice: IStep = step(overture, 'toolCheck', 'sensitiveNotice');
    expect(ideaNotice.type === 'notice' && ideaNotice.body).toBe(SENSITIVE_INFO_NOTICE);
    expect(toolNotice.type === 'notice' && toolNotice.body).toBe(SENSITIVE_INFO_NOTICE);
    const teamNotice: IStep = step(overture, 'teamUsage', 'sensitiveNotice');
    expect(teamNotice.type === 'notice' && teamNotice.body).toBe(
      "Thanks for sharing that. When information like this may be involved, it's a good idea to pause that part of the process for now, just until the AI CoE can take a look and offer guidance. The rest of what you shared is still really helpful — please continue."
    );
  });

  it('brands the company-information help and the external-sharing question', () => {
    const original: string =
      'Company information includes Overture, client, partner, and internal work information — even when it is not patient, employee, customer, or otherwise confidential. An ongoing work process also counts as a business workflow. Describe information categories and the intended process; do not enter confidential values, source records, prompts, or response content.';
    expect(companyInformationHelp(createBranding('Overture'))).toBe(original);
    expect(step(overture, 'toolCheck', 'companyDataOrWorkflow').help).toBe(original);
    expect(step(overture, 'teamUsage', 'companyDataOrWorkflow').help).toBe(original);
    expect(step(overture, 'toolCheck', 'outputSharedExternally').title).toBe('Would the output be shared outside Overture?');

    expect(step(neutral, 'toolCheck', 'companyDataOrWorkflow').help).toBe(`Company information includes company, client, partner, and internal work information${COMPANY_INFORMATION_HELP_SUFFIX}`);
    expect(step(neutral, 'toolCheck', 'outputSharedExternally').title).toBe('Would the output be shared outside the organization?');
    expect(JSON.stringify(neutral)).not.toMatch(/overture/i);
  });
});
