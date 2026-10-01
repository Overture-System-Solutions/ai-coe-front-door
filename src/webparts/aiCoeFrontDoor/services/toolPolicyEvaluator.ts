import type { IBranding } from '../branding/branding';
import { asStringArray, includes } from '../utils/collections';
import { answerSteps, formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition, WorkflowId } from '../workflows/types';
import { createRecordId } from './recordId';

export type PolicyOutcomeKey = 'fits' | 'safeguards' | 'reviewNeeded' | 'gap';

export interface IPolicyOutcome {
  label: string;
  defaultNextSteps: string[];
}

export type PolicyOutcomes = { [key in PolicyOutcomeKey]: IPolicyOutcome };

/**
 * The four routing outcomes of the guidance prototype, with organization-specific wording. The review system is
 * named by the branding (`reviewSystemName`, a web part property): blank keeps the shipped name in the legacy view,
 * so the parity suites hold, and neutral wording in page views.
 */
export function policyOutcomes(branding: IBranding): PolicyOutcomes {
  return {
    fits: {
      label: 'This appears eligible for a standard-use check',
      defaultNextSteps: [
        `Confirm the tool and task still match ${branding.organizationPossessive} current approved-use guidance.`,
        'Keep a person reviewing the output before it is used or shared.',
        `If company information, workflow integration, or the task changes, submit ${branding.reviewRequestPhrase} with manager endorsement before proceeding.`
      ]
    },
    safeguards: {
      label: 'Additional safeguards and confirmation are needed',
      defaultNextSteps: [
        'Pause this use until the tool status, data boundary, and human checkpoint are confirmed.',
        `If company information or a business workflow is involved, submit ${branding.reviewRequestPhrase} with manager endorsement.`
      ]
    },
    reviewNeeded: {
      label: 'Please request a CoE review before proceeding',
      defaultNextSteps: [
        'Pause this AI use until the required review is complete.',
        `Submit the request through ${branding.reviewSystemName} with manager endorsement.`,
        "You don't need to add any sensitive details — the answers you already gave are enough to start."
      ]
    },
    gap: {
      label: 'Current guidance does not answer this yet',
      defaultNextSteps: [
        'This is a gap in current guidance, not a decision about your idea.',
        `Use ${branding.reviewSystemName} or contact the AI CoE to confirm the current approved-use guidance before proceeding.`,
        'If you can, find out the exact name of the tool — that helps a lot.'
      ]
    }
  };
}

export interface IPolicyDecision {
  outcomeKey: PolicyOutcomeKey;
  label: string;
  reasons: string[];
  nextSteps: string[];
  contributingStepIds: string[];
}

/**
 * Package 1.0.0.7 built this list by spreading a Set under an ES5 target, which always produced an
 * empty array, so the "Answers that shaped this result" section never listed anything. Preserved for
 * parity; the intended value would be the de-duplicated `stepIds`.
 */
function contributingStepIds(_stepIds: readonly string[]): string[] {
  return [];
}

function createDecision(
  outcomes: PolicyOutcomes,
  key: PolicyOutcomeKey,
  reasons: string[],
  stepIds: readonly string[],
  nextSteps?: string[]
): IPolicyDecision {
  const outcome: IPolicyOutcome = outcomes[key];
  return {
    outcomeKey: key,
    label: outcome.label,
    reasons,
    nextSteps: nextSteps && nextSteps.length ? nextSteps : outcome.defaultNextSteps,
    contributingStepIds: contributingStepIds(stepIds)
  };
}

const SENSITIVE_CATEGORIES: readonly string[] = ['patient', 'employee', 'customer', 'otherConfidential', 'regulated'];
const UNCERTAINTY_STEPS: readonly string[] = [
  'toolApprovalStatus',
  'companyDataOrWorkflow',
  'filesUploaded',
  'outputSharedExternally',
  'aiDecisionImportance',
  'aiTakesAction',
  'humanReview'
];

/** Local, synchronous routing logic of the tool check (the shipped "guidance prototype"). */
export function evaluateToolPolicy(answers: IAnswers, branding: IBranding): IPolicyDecision {
  const outcomes: PolicyOutcomes = policyOutcomes(branding);
  const categories: string[] = asStringArray(answers.sensitiveCategories);
  const sensitive: boolean = categories.some((category: string): boolean => includes(SENSITIVE_CATEGORIES, category));
  const unsureSensitive: boolean = includes(categories, 'unsure');
  const approved: boolean = answers.toolApprovalStatus === 'approved';
  const notApproved: boolean = answers.toolApprovalStatus === 'notApproved';
  const unknownStatus: boolean = answers.toolApprovalStatus === 'unknown';
  const sharedExternally: boolean = answers.outputSharedExternally === 'yes';
  const takesAction: boolean = answers.aiTakesAction === 'yes';
  const noReview: boolean = answers.humanReview === 'no';
  const alwaysReview: boolean = answers.humanReview === 'always';
  const sometimesReview: boolean = answers.humanReview === 'sometimes';
  const importantDecision: boolean = answers.aiDecisionImportance === 'yes';
  const filesUploaded: boolean = answers.filesUploaded === 'yes';
  const toolUnknown: boolean = answers.toolKnown === 'no';
  const companyData: boolean = answers.companyDataOrWorkflow === 'yes';
  const companyUnsure: boolean = answers.companyDataOrWorkflow === 'unsure';
  const unsureAnswers: string[] = UNCERTAINTY_STEPS.filter(
    (stepId: string): boolean => answers[stepId] === 'unknown' || answers[stepId] === 'unsure'
  );

  if (companyData || companyUnsure) {
    return createDecision(
      outcomes,
      'reviewNeeded',
      [
        companyUnsure
          ? "You weren't sure whether company information or a business workflow would be involved. That needs confirmation before proceeding."
          : 'This would involve company information or become part of a business workflow.'
      ],
      ['companyDataOrWorkflow']
    );
  }
  if (sensitive || unsureSensitive) {
    return createDecision(
      outcomes,
      'reviewNeeded',
      [
        unsureSensitive
          ? "You weren't sure whether sensitive information would be involved. When that's unclear, a closer look is the safer next step."
          : 'This may involve patient, employee, customer, confidential, or regulated information.'
      ],
      ['sensitiveCategories']
    );
  }
  if (notApproved) {
    return createDecision(outcomes, 'reviewNeeded', ["You noted this tool isn't approved yet, as far as you know."], ['toolApprovalStatus']);
  }
  if (takesAction && noReview) {
    return createDecision(
      outcomes,
      'reviewNeeded',
      ['AI would take an action in another system, and no one would review the result first.'],
      ['aiTakesAction', 'humanReview']
    );
  }
  if (sharedExternally && !approved) {
    return createDecision(
      outcomes,
      'reviewNeeded',
      [`The output would leave ${branding.organizationLabel}, and this tool isn't confirmed as approved.`],
      ['outputSharedExternally', 'toolApprovalStatus']
    );
  }
  if (unknownStatus || toolUnknown || unsureAnswers.length >= 2) {
    return createDecision(
      outcomes,
      'gap',
      ["There isn't enough clear information yet to point to specific guidance."],
      ['toolKnown', 'toolApprovalStatus'].concat(unsureAnswers)
    );
  }
  if (
    approved &&
    answers.companyDataOrWorkflow === 'no' &&
    !filesUploaded &&
    !sharedExternally &&
    !importantDecision &&
    !takesAction &&
    (alwaysReview || sometimesReview)
  ) {
    return createDecision(
      outcomes,
      'fits',
      ['The tool is reported as approved, no company or sensitive information is involved, the task is not an ongoing workflow, and a person stays involved.'],
      ['toolApprovalStatus', 'companyDataOrWorkflow', 'sensitiveCategories', 'humanReview']
    );
  }

  const reasons: string[] = [];
  if (filesUploaded) {
    reasons.push('Files would be uploaded, so the approved tool, allowed file types, and data boundary need confirmation.');
  }
  if (sharedExternally) {
    reasons.push(`The output would be shared outside ${branding.organizationLabel}, so a person should check it first.`);
  }
  if (importantDecision) {
    reasons.push('AI would be part of an important decision, so a person should stay in the loop.');
  }
  if (takesAction) {
    reasons.push('AI would take an action in another system, so a check-in point would help.');
  }
  if (!alwaysReview) {
    reasons.push('Having a person review the output every time, not just sometimes, would help here.');
  }
  if (unknownStatus) {
    reasons.push("Confirming the tool's status would help close this out.");
  }
  if (reasons.length === 0) {
    reasons.push('A few small safeguards would help make this a clearer fit.');
  }
  return createDecision(outcomes, 'safeguards', reasons, UNCERTAINTY_STEPS, reasons);
}

export interface IPolicyEvaluation extends IPolicyDecision {
  /**
   * The shipped evaluator is a local prototype, not a policy service, and the UI labels it as such; `register`
   * (1.0.0.18) is the tabbed view's tool check, which reads the approved-tools register.
   */
  mode: 'prototype' | 'register';
}

export interface IToolPolicyEvaluator {
  evaluate(answers: IAnswers): Promise<IPolicyEvaluation>;
}

export const EVALUATION_DELAY_MS: number = 400;

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, milliseconds);
  });
}

/** Evaluates after the shipped 400 ms pause, which gives the "evaluating" state time to show. */
export function createToolPolicyEvaluator(
  branding: IBranding,
  delayMs: number = EVALUATION_DELAY_MS,
  wait: (milliseconds: number) => Promise<void> = defaultWait
): IToolPolicyEvaluator {
  return {
    evaluate: async (answers: IAnswers): Promise<IPolicyEvaluation> => {
      await wait(delayMs);
      return { mode: 'prototype', ...evaluateToolPolicy(answers, branding) };
    }
  };
}

export interface IPolicyGapRecord {
  recordId: string;
  createdAt: string;
  workflowId: WorkflowId;
  type: 'policy-gap';
  originalAnswers: IAnswers;
  outcome: string;
  reasons: string[];
  contributingAnswers: string[];
  status: 'open';
}

export function createPolicyGapRecord(
  definition: IWorkflowDefinition,
  answers: IAnswers,
  decision: IPolicyDecision,
  now: Date = new Date(),
  recordId: () => string = (): string => createRecordId('policy-gap')
): IPolicyGapRecord {
  return {
    recordId: recordId(),
    createdAt: now.toISOString(),
    workflowId: definition.id,
    type: 'policy-gap',
    originalAnswers: answers,
    outcome: decision.label,
    reasons: decision.reasons,
    contributingAnswers: decision.contributingStepIds,
    status: 'open'
  };
}

export interface IReviewContact {
  name: string;
  team: string;
  email: string;
}

/** Plain-text summary attached to a CoE review request. */
export function buildReviewRequestExportText(
  definition: IWorkflowDefinition,
  answers: IAnswers,
  decision: IPolicyDecision,
  contact: IReviewContact,
  branding: IBranding,
  now: Date = new Date()
): string {
  const lines: string[] = [];
  lines.push(branding.exportHeader('CoE review request'));
  lines.push(`Related to: ${definition.title}`);
  lines.push('AI CoE submission summary');
  lines.push(`Policy reference: ${branding.governanceReference}`);
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  lines.push(`Requested by: ${contact.name || 'Not specified'} (${contact.team || 'Not specified'})`);
  if (contact.email) {
    lines.push(`Email: ${contact.email}`);
  }
  lines.push('');
  lines.push(`Guidance result so far: ${decision.label}`);
  lines.push('');
  lines.push('Reasons:');
  for (const reason of decision.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('');
  lines.push('Original answers:');
  for (const step of answerSteps(definition, answers)) {
    if (step.type !== 'notice') {
      const value: string = formatAnswer(step, answers[step.id]);
      if (value) {
        lines.push(`${step.title}: ${value}`);
      }
    }
  }
  lines.push('');
  lines.push('This review request enters the AI CoE intake and triage process for follow-up and decision logging.');
  return lines.join('\n');
}

export function indexSteps(definition: IWorkflowDefinition): { [stepId: string]: IStep } {
  const index: { [stepId: string]: IStep } = {};
  for (const step of definition.steps) {
    index[step.id] = step;
    // A group's fields are questions of their own for every summary that looks one up by its answer key.
    if (step.type === 'group') {
      for (const field of step.fields) {
        index[field.id] = field;
      }
    }
  }
  return index;
}
