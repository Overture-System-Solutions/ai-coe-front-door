/**
 * The tool check against the approved-tools register (1.0.0.18). A listed tool is judged by its own row - its status,
 * the kinds of information it may be used with, files, sharing outside the organization and its conditions - and a tool
 * that is not on the list keeps the shipped routing, saying it has not been reviewed yet.
 */
import { createBranding } from '../branding/branding';
import { TOOL_PICK_NOT_LISTED, TOOL_PICK_UNSURE } from '../content/workflows/tabbedForms';
import type { IApprovedTool, IToolAllowances } from './approvedToolsService';
import { createRegisterEvaluator, deriveToolAnswers } from './registerToolPolicy';
import type { IPolicyEvaluation } from './toolPolicyEvaluator';
import type { IAnswers } from '../workflows/types';

const NONE: IToolAllowances = { companyInformation: false, employeeInformation: false, customerInformation: false, patientInformation: false, otherConfidentialInformation: false, regulatedInformation: false, fileUploads: false, externalSharing: false };

function tool(overrides: Partial<IApprovedTool>): IApprovedTool {
  return { id: 'copilot-chat', name: 'Copilot Chat', otherNames: [], status: 'Approved', allows: { ...NONE, companyInformation: true }, ...overrides };
}

/** A tidy, low-risk use: internal information, no files, nothing shared out, no decision, no action, always reviewed. */
const SAFE: IAnswers = {
  helpWith: 'Summarise my meeting notes',
  toolPick: 'copilot-chat',
  companyDataOrWorkflow: 'yes',
  sensitiveCategories: ['none'],
  filesUploaded: 'no',
  outputSharedExternally: 'no',
  aiDecisionImportance: 'no',
  aiTakesAction: 'no',
  humanReview: 'always',
  usagePattern: 'occasional'
};

async function judge(answers: IAnswers, tools: IApprovedTool[]): Promise<IPolicyEvaluation> {
  return createRegisterEvaluator(createBranding('Overture'), tools).evaluate(answers);
}

describe('deriveToolAnswers', () => {
  it('fills in what the register knows about the picked tool', () => {
    expect(deriveToolAnswers({ toolPick: 'copilot-chat' }, [tool({})])).toEqual({ toolPick: 'copilot-chat', toolKnown: 'yes', toolName: 'Copilot Chat', toolApprovalStatus: 'approved' });
    expect(deriveToolAnswers({ toolPick: 'copilot-chat' }, [tool({ status: 'Not approved' })]).toolApprovalStatus).toBe('notApproved');
    expect(deriveToolAnswers({ toolPick: 'copilot-chat' }, [tool({ status: 'Under review' })]).toolApprovalStatus).toBe('notApproved');
    expect(deriveToolAnswers({ toolPick: TOOL_PICK_NOT_LISTED, toolName: 'Gamma' }, [tool({})])).toEqual({ toolPick: TOOL_PICK_NOT_LISTED, toolName: 'Gamma', toolKnown: 'yes', toolApprovalStatus: 'unknown' });
    expect(deriveToolAnswers({ toolPick: TOOL_PICK_UNSURE }, [tool({})])).toEqual({ toolPick: TOOL_PICK_UNSURE, toolKnown: 'no', toolApprovalStatus: 'unknown' });
  });
});

describe('createRegisterEvaluator', () => {
  it('fits a listed, approved tool used within its row, and says it rests on the register', async () => {
    const decision: IPolicyEvaluation = await judge(SAFE, [tool({ approvedFor: 'Drafting and summarising', lastReviewed: '2026-09-30' })]);
    expect(decision.outcomeKey).toBe('fits');
    expect(decision.mode).toBe('register');
    expect(decision.reasons.join(' ')).toContain('Copilot Chat is on the AI CoE approved-tools list');
  });

  it('asks for a review when the tool is not approved or still under review', async () => {
    const no: IPolicyEvaluation = await judge(SAFE, [tool({ status: 'Not approved', notApprovedFor: 'Any client work' })]);
    expect(no.outcomeKey).toBe('reviewNeeded');
    expect(no.reasons).toEqual(['Copilot Chat is not approved for work use.', 'Not approved for: Any client work']);
    const pending: IPolicyEvaluation = await judge(SAFE, [tool({ status: 'Under review' })]);
    expect(pending.outcomeKey).toBe('reviewNeeded');
    expect(pending.reasons[0]).toBe('The AI CoE is still reviewing Copilot Chat.');
  });

  it('asks for a review when the use goes beyond what the row allows', async () => {
    const customer: IPolicyEvaluation = await judge({ ...SAFE, sensitiveCategories: ['customer'] }, [tool({})]);
    expect(customer.outcomeKey).toBe('reviewNeeded');
    expect(customer.reasons).toContain('Copilot Chat is not approved for customer information.');
    const company: IPolicyEvaluation = await judge(SAFE, [tool({ allows: NONE })]);
    expect(company.reasons).toContain('Copilot Chat is not approved for company information or ongoing work processes.');
    const files: IPolicyEvaluation = await judge({ ...SAFE, filesUploaded: 'yes' }, [tool({})]);
    expect(files.reasons).toContain('Copilot Chat is not approved for file uploads.');
    const shared: IPolicyEvaluation = await judge({ ...SAFE, outputSharedExternally: 'yes' }, [tool({})]);
    expect(shared.reasons).toContain('Copilot Chat is not approved for sharing output outside the organization.');
    const unsure: IPolicyEvaluation = await judge({ ...SAFE, sensitiveCategories: ['unsure'] }, [tool({})]);
    expect(unsure.outcomeKey).toBe('reviewNeeded');
  });

  it('allows what the row allows: customer information and files with a tool approved for them', async () => {
    const allowed: IPolicyEvaluation = await judge({ ...SAFE, sensitiveCategories: ['customer'], filesUploaded: 'yes' }, [
      tool({ allows: { ...NONE, companyInformation: true, customerInformation: true, fileUploads: true } })
    ]);
    expect(allowed.outcomeKey).toBe('safeguards');
    expect(allowed.reasons.join(' ')).toContain('Files would be uploaded');
  });

  it('turns an approval with conditions into safeguards that carry the conditions', async () => {
    const decision: IPolicyEvaluation = await judge(SAFE, [tool({ status: 'Approved with conditions', conditions: 'Sign in with your work account.' })]);
    expect(decision.outcomeKey).toBe('safeguards');
    expect(decision.nextSteps).toContain('Follow the conditions for Copilot Chat: Sign in with your work account.');
  });

  it('keeps the shipped routing for a tool that is not on the list, saying so', async () => {
    const decision: IPolicyEvaluation = await judge({ ...SAFE, toolPick: TOOL_PICK_NOT_LISTED, toolName: 'Gamma', companyDataOrWorkflow: 'no' }, [tool({})]);
    expect(decision.outcomeKey).toBe('gap');
    expect(decision.reasons[0]).toBe("Gamma isn't on the AI CoE approved-tools list yet, so it hasn't been reviewed.");
    expect(decision.mode).toBe('register');
    const unsure: IPolicyEvaluation = await judge({ ...SAFE, toolPick: TOOL_PICK_UNSURE }, [tool({})]);
    expect(unsure.outcomeKey).toBe('reviewNeeded');
  });
});
