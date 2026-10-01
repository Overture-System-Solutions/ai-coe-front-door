/**
 * The tool check against the approved-tools register (1.0.0.18, tabbed view). The person picks the tool from the
 * register; a listed tool is judged by its own row - status, the kinds of information it may be used with, files,
 * sharing outside the organization and its conditions - so a tool approved for internal information no longer sends
 * every internal use to review. A tool that is not on the list keeps the shipped routing, which says it has not been
 * reviewed. This is still guidance, not a decision: a person confirms anything the page says.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IBranding } from '../branding/branding';
import type { AnswerValue, IAnswers } from '../workflows/types';
import type { IApprovedTool } from './approvedToolsService';
import { evaluateToolPolicy, policyOutcomes } from './toolPolicyEvaluator';
import type { IPolicyDecision, IPolicyEvaluation, IPolicyOutcome, IToolPolicyEvaluator, PolicyOutcomeKey } from './toolPolicyEvaluator';

/** The two picks that are not a listed tool. */
export const TOOL_PICK_NOT_LISTED: string = 'notListed';
export const TOOL_PICK_UNSURE: string = 'unsure';

function toolFor(answers: IAnswers, tools: readonly IApprovedTool[]): IApprovedTool | undefined {
  const pick: AnswerValue = answers.toolPick;
  return typeof pick === 'string' ? tools.filter((tool: IApprovedTool): boolean => tool.id === pick)[0] : undefined;
}

/**
 * The answers the shipped routing and the request record read, filled in from the pick: whether a tool is known, its
 * name, and its approval status as the register gives it. Nothing the person typed is replaced, except a name the
 * register supplies for a listed tool.
 */
export function deriveToolAnswers(answers: IAnswers, tools: readonly IApprovedTool[]): IAnswers {
  const listed: IApprovedTool | undefined = toolFor(answers, tools);
  if (listed !== undefined) {
    const approved: boolean = listed.status === 'Approved' || listed.status === 'Approved with conditions';
    return { ...answers, toolKnown: 'yes', toolName: listed.name, toolApprovalStatus: approved ? 'approved' : 'notApproved' };
  }
  if (answers.toolPick === TOOL_PICK_NOT_LISTED) {
    return { ...answers, toolKnown: 'yes', toolApprovalStatus: 'unknown' };
  }
  if (answers.toolPick === TOOL_PICK_UNSURE) {
    return { ...answers, toolKnown: 'no', toolApprovalStatus: 'unknown' };
  }
  return answers;
}

const CATEGORY_WORDS: { [category: string]: { allowance: keyof IApprovedTool['allows']; words: string } } = {
  employee: { allowance: 'employeeInformation', words: 'employee information' },
  customer: { allowance: 'customerInformation', words: 'customer information' },
  patient: { allowance: 'patientInformation', words: 'patient information' },
  otherConfidential: { allowance: 'otherConfidentialInformation', words: 'other confidential information' },
  regulated: { allowance: 'regulatedInformation', words: 'regulated information' }
};

function selected(value: AnswerValue): string[] {
  return Array.isArray(value) ? value : [];
}

function decision(outcome: IPolicyOutcome, key: PolicyOutcomeKey, reasons: string[], nextSteps?: string[]): IPolicyEvaluation {
  return { mode: 'register', outcomeKey: key, label: outcome.label, reasons, nextSteps: nextSteps ?? outcome.defaultNextSteps, contributingStepIds: [] };
}

/** The guidance for a listed tool, from its row. */
function judgeListed(tool: IApprovedTool, answers: IAnswers, branding: IBranding): IPolicyEvaluation {
  const outcomes = policyOutcomes(branding);
  if (tool.status === 'Not approved') {
    return decision(outcomes.reviewNeeded, 'reviewNeeded', [`${tool.name} is not approved for work use.`].concat(tool.notApprovedFor === undefined ? [] : [`Not approved for: ${tool.notApprovedFor}`]));
  }
  if (tool.status === 'Under review') {
    return decision(outcomes.reviewNeeded, 'reviewNeeded', [`The AI CoE is still reviewing ${tool.name}.`]);
  }
  const beyond: string[] = [];
  const categories: string[] = selected(answers.sensitiveCategories);
  if (categories.indexOf('unsure') >= 0) {
    beyond.push("You weren't sure whether sensitive information would be involved. When that's unclear, a closer look is the safer next step.");
  }
  for (const category of categories) {
    const known = CATEGORY_WORDS[category];
    if (known !== undefined && !tool.allows[known.allowance]) {
      beyond.push(`${tool.name} is not approved for ${known.words}.`);
    }
  }
  if (answers.companyDataOrWorkflow === 'unsure') {
    beyond.push("You weren't sure whether company information or a business workflow would be involved. That needs confirmation before proceeding.");
  } else if (answers.companyDataOrWorkflow === 'yes' && !tool.allows.companyInformation) {
    beyond.push(`${tool.name} is not approved for company information or ongoing work processes.`);
  }
  if (answers.filesUploaded === 'yes' && !tool.allows.fileUploads) {
    beyond.push(`${tool.name} is not approved for file uploads.`);
  }
  if (answers.outputSharedExternally === 'yes' && !tool.allows.externalSharing) {
    beyond.push(`${tool.name} is not approved for sharing output outside the organization.`);
  }
  if (answers.aiTakesAction === 'yes' && answers.humanReview === 'no') {
    beyond.push('AI would take an action in another system, and no one would review the result first.');
  }
  if (beyond.length > 0) {
    return decision(outcomes.reviewNeeded, 'reviewNeeded', beyond.concat(tool.notApprovedFor === undefined ? [] : [`Not approved for: ${tool.notApprovedFor}`]));
  }

  const listed: string = `${tool.name} is on the AI CoE approved-tools list${tool.approvedFor === undefined ? '' : ` for ${tool.approvedFor.replace(/\.$/, '').toLowerCase()}`}${tool.lastReviewed === undefined ? '' : ` (reviewed ${tool.lastReviewed})`}.`;
  const cautions: string[] = [];
  if (answers.filesUploaded === 'yes') {
    cautions.push('Files would be uploaded, so the allowed file types and data boundary still need care.');
  }
  if (answers.outputSharedExternally === 'yes') {
    cautions.push(`The output would be shared outside ${branding.organizationLabel}, so a person should check it first.`);
  }
  if (answers.aiDecisionImportance === 'yes') {
    cautions.push('AI would be part of an important decision, so a person should stay in the loop.');
  }
  if (answers.aiTakesAction === 'yes') {
    cautions.push('AI would take an action in another system, so a check-in point would help.');
  }
  if (answers.humanReview !== 'always') {
    cautions.push('Having a person review the output every time, not just sometimes, would help here.');
  }
  const conditions: string[] = tool.conditions === undefined ? [] : [`Follow the conditions for ${tool.name}: ${tool.conditions}`];
  const access: string[] = tool.howToGetAccess === undefined ? [] : [`How to get access: ${tool.howToGetAccess}`];
  if (cautions.length > 0 || tool.status === 'Approved with conditions') {
    return decision(outcomes.safeguards, 'safeguards', [listed].concat(cautions), conditions.concat(cautions.length > 0 ? cautions : ['Keep a person reviewing the output before it is used or shared.']).concat(access));
  }
  return decision(outcomes.fits, 'fits', [listed], ['Keep a person reviewing the output before it is used or shared.'].concat(conditions, access, [outcomes.fits.defaultNextSteps[2]]));
}

/** The guidance for a tool that is not on the list: the shipped routing, saying the tool has not been reviewed. */
function judgeUnlisted(answers: IAnswers, branding: IBranding): IPolicyEvaluation {
  const shipped: IPolicyDecision = evaluateToolPolicy(answers, branding);
  const name: AnswerValue = answers.toolName;
  const reasons: string[] =
    answers.toolPick === TOOL_PICK_NOT_LISTED && typeof name === 'string' && name.trim() !== ''
      ? [`${name.trim()} isn't on the AI CoE approved-tools list yet, so it hasn't been reviewed.`].concat(shipped.reasons)
      : shipped.reasons;
  return { mode: 'register', ...shipped, reasons };
}

/** The evaluator the tabbed tool check uses: the register first, the shipped routing for anything not on it. */
export function createRegisterEvaluator(branding: IBranding, tools: readonly IApprovedTool[]): IToolPolicyEvaluator {
  return {
    evaluate: async (raw: IAnswers): Promise<IPolicyEvaluation> => {
      const answers: IAnswers = deriveToolAnswers(raw, tools);
      const listed: IApprovedTool | undefined = toolFor(answers, tools);
      return listed === undefined ? judgeUnlisted(answers, branding) : judgeListed(listed, answers, branding);
    }
  };
}
