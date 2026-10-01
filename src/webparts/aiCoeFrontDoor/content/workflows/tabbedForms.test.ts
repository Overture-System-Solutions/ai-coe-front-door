/**
 * The tabbed view's shorter forms (1.0.0.18): AI idea, Check a tool or task and Register team AI use in five screens
 * at most, each screen grouping up to three closely related questions (a follow-up that shows only after an answer
 * does not count), with every question of the full form kept under its own answer key. The tool check picks its tool
 * from the approved-tools register instead of asking whether the person believes it is approved.
 */
import { createBranding } from '../../branding/branding';
import type { IApprovedTool } from '../../services/approvedToolsService';
import { buildIdeaDraftRequest, IDEA_DRAFT_ANSWER_KEYS } from '../../services/draftService';
import { answerSteps } from '../../workflows/formEngine';
import type { IAnswers, IChoiceStep, IStep, IWorkflowCatalog, IWorkflowDefinition } from '../../workflows/types';
import { createWorkflowCatalog } from './catalog';
import { createTabbedCatalog, TOOL_PICK_NOT_LISTED, TOOL_PICK_UNSURE } from './tabbedForms';

const FULL: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));

function tool(id: string, name: string): IApprovedTool {
  return {
    id,
    name,
    otherNames: [],
    status: 'Approved',
    allows: { companyInformation: false, employeeInformation: false, customerInformation: false, patientInformation: false, otherConfidentialInformation: false, regulatedInformation: false, fileUploads: false, externalSharing: false }
  };
}

const TOOLS: IApprovedTool[] = [tool('copilot-chat', 'Microsoft 365 Copilot Chat'), tool('claude', 'Claude')];
const TABBED: IWorkflowCatalog = createTabbedCatalog(FULL, TOOLS);

/** Every question a form can ask, notices aside, with all follow-ups answered so they show. */
function allKeys(definition: IWorkflowDefinition): string[] {
  const keys: string[] = [];
  const visit = (step: IStep): void => {
    if (step.type === 'group') {
      step.fields.forEach(visit);
    } else if (step.type !== 'notice') {
      keys.push(step.id);
    }
  };
  definition.steps.forEach(visit);
  return keys;
}

describe('the tabbed view\'s shorter forms', () => {
  it.each(['idea', 'toolCheck', 'teamUsage'] as const)('fits %s into five screens of at most three questions each', (id) => {
    const screens: IStep[] = TABBED[id].steps;
    expect(screens.length).toBeLessThanOrEqual(5);
    for (const screen of screens) {
      expect(screen.type).toBe('group');
      if (screen.type === 'group') {
        const always: number = screen.fields.filter((field: IStep): boolean => field.type !== 'notice' && field.showIf === undefined).length;
        expect({ screen: screen.id, always: always <= 3 }).toEqual({ screen: screen.id, always: true });
        expect(screen.title.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(['idea', 'teamUsage'] as const)('keeps every question of %s under its own answer key', (id) => {
    expect(allKeys(TABBED[id]).sort()).toEqual(allKeys(FULL[id]).sort());
  });

  it('keeps every question of the tool check except the two the register now answers', () => {
    const full: string[] = allKeys(FULL.toolCheck).filter((key: string): boolean => key !== 'toolKnown' && key !== 'toolApprovalStatus');
    expect(allKeys(TABBED.toolCheck).sort()).toEqual(full.concat('toolPick').sort());
  });

  it('leaves the classic forms untouched and the other forms as they were', () => {
    expect(TABBED.helpTraining).toBe(FULL.helpTraining);
    expect(TABBED.feedback).toBe(FULL.feedback);
    expect(FULL.idea.steps.some((step: IStep): boolean => step.type === 'group')).toBe(false);
  });

  it('sends the idea-draft flow exactly what the full form would, so the live flow needs no change', () => {
    const answers: IAnswers = {
      workToImprove: 'Weekly reports',
      painPoints: 'Copying numbers by hand',
      peopleInvolved: 'Finance team',
      frequency: 'weekly',
      timeSpent: 'hours',
      systemsInvolved: 'Excel',
      informationUsed: 'Budgets',
      informationCategories: ['internal'],
      aiAlreadyUsed: 'yes',
      aiToolName: 'Copilot',
      desiredOutcome: 'A draft each Monday',
      successMeasure: 'Two hours saved',
      hasDeadlineSponsor: 'yes',
      deadlineSponsorDetail: 'End of quarter',
      anythingElse: 'None'
    };
    expect(buildIdeaDraftRequest(TABBED.idea, answers, 'r1')).toEqual(buildIdeaDraftRequest(FULL.idea, answers, 'r1'));
    for (const key of ['workToImprove', 'painPoints', 'peopleInvolved', 'frequency', 'timeSpent', 'informationCategories', 'aiAlreadyUsed', 'desiredOutcome', 'hasDeadlineSponsor']) {
      expect(IDEA_DRAFT_ANSWER_KEYS).toContain(key);
      expect(answerSteps(TABBED.idea, answers).map((step: IStep): string => step.id)).toContain(key);
    }
  });

  it('picks the tool from the register, with "not on the list" asking for its name', () => {
    const first = TABBED.toolCheck.steps[0];
    expect(first.type).toBe('group');
    if (first.type !== 'group') {
      return;
    }
    const pick: IChoiceStep = first.fields.filter((field: IStep): boolean => field.id === 'toolPick')[0] as IChoiceStep;
    expect(pick.options.map((option) => `${option.value}=${option.label}`)).toEqual([
      'claude=Claude',
      'copilot-chat=Microsoft 365 Copilot Chat',
      `${TOOL_PICK_NOT_LISTED}=It's not on the list`,
      `${TOOL_PICK_UNSURE}=I'm not sure which tool yet`
    ]);
    const name: IStep = first.fields.filter((field: IStep): boolean => field.id === 'toolName')[0];
    expect(name.showIf?.({ toolPick: TOOL_PICK_NOT_LISTED })).toBe(true);
    expect(name.showIf?.({ toolPick: 'claude' })).toBe(false);
    expect(TABBED.toolCheck.approvedToolList).toBe(true);
  });
});
