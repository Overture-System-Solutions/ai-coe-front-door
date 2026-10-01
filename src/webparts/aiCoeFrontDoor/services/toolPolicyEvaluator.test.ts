import { createBranding } from '../branding/branding';
import type { IBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import {
  buildReviewRequestExportText,
  createPolicyGapRecord,
  createToolPolicyEvaluator,
  evaluateToolPolicy,
  policyOutcomes
} from './toolPolicyEvaluator';
import type { IPolicyDecision, IPolicyEvaluation, IPolicyGapRecord } from './toolPolicyEvaluator';

const overture: IBranding = createBranding('Overture');
const neutral: IBranding = createBranding('');
const toolCheck: IWorkflowDefinition = createWorkflowCatalog(overture).toolCheck;

/** A tool-check answer set that reaches the "fits" outcome. */
const fitsAnswers: IAnswers = {
  helpWith: 'Draft first responses',
  toolKnown: 'yes',
  toolName: 'Approved Assistant',
  toolApprovalStatus: 'approved',
  companyDataOrWorkflow: 'no',
  sensitiveCategories: ['none'],
  filesUploaded: 'no',
  outputSharedExternally: 'no',
  aiDecisionImportance: 'no',
  aiTakesAction: 'no',
  humanReview: 'always',
  usagePattern: 'occasional'
};

describe('policyOutcomes', () => {
  it('reproduces the shipped labels and next steps with the original organization', () => {
    const outcomes = policyOutcomes(overture);
    expect(outcomes.fits.label).toBe('This appears eligible for a standard-use check');
    expect(outcomes.fits.defaultNextSteps).toEqual([
      "Confirm the tool and task still match Overture's current approved-use guidance.",
      'Keep a person reviewing the output before it is used or shared.',
      'If company information, workflow integration, or the task changes, submit a TESS review with manager endorsement before proceeding.'
    ]);
    expect(outcomes.safeguards.label).toBe('Additional safeguards and confirmation are needed');
    expect(outcomes.reviewNeeded.label).toBe('Please request a CoE review before proceeding');
    expect(outcomes.reviewNeeded.defaultNextSteps[1]).toBe('Submit the request through TESS with manager endorsement.');
    expect(outcomes.gap.label).toBe('Current guidance does not answer this yet');
    expect(outcomes.gap.defaultNextSteps[2]).toBe('If you can, find out the exact name of the tool — that helps a lot.');
  });

  it('uses neutral wording without an organization', () => {
    expect(policyOutcomes(neutral).fits.defaultNextSteps[0]).toBe(
      "Confirm the tool and task still match the organization's current approved-use guidance."
    );
  });

  // Decision 21: the review system is named by the branding; blank keeps the shipped literal in the legacy view only.
  it('names the review system from the branding in every next step that mentions it', () => {
    const named = policyOutcomes(createBranding('Overture', { reviewSystemName: 'Contoso Review Desk' }));
    expect(named.fits.defaultNextSteps[2]).toBe('If company information, workflow integration, or the task changes, submit a Contoso Review Desk review with manager endorsement before proceeding.');
    expect(named.safeguards.defaultNextSteps[1]).toBe('If company information or a business workflow is involved, submit a Contoso Review Desk review with manager endorsement.');
    expect(named.reviewNeeded.defaultNextSteps[1]).toBe('Submit the request through Contoso Review Desk with manager endorsement.');
    expect(named.gap.defaultNextSteps[1]).toBe('Use Contoso Review Desk or contact the AI CoE to confirm the current approved-use guidance before proceeding.');
    expect(JSON.stringify(named)).not.toContain('TESS');

    const pageView = policyOutcomes(createBranding('Overture', { pageView: true }));
    expect(pageView.fits.defaultNextSteps[2]).toBe('If company information, workflow integration, or the task changes, submit a review through the review system with manager endorsement before proceeding.');
    expect(pageView.safeguards.defaultNextSteps[1]).toBe('If company information or a business workflow is involved, submit a review through the review system with manager endorsement.');
    expect(pageView.reviewNeeded.defaultNextSteps[1]).toBe('Submit the request through the review system with manager endorsement.');
    expect(pageView.gap.defaultNextSteps[1]).toBe('Use the review system or contact the AI CoE to confirm the current approved-use guidance before proceeding.');
    expect(JSON.stringify(pageView)).not.toContain('TESS');

    // The legacy view with blank properties is byte-identical to the shipped package.
    expect(policyOutcomes(createBranding('Overture', { reviewSystemName: '', pageView: false }))).toEqual(policyOutcomes(overture));
    expect(JSON.stringify(policyOutcomes(overture)).match(/TESS/g)).toHaveLength(4);
  });
});

describe('evaluateToolPolicy', () => {
  it('needs review when company data is involved or unclear', () => {
    const involved: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, companyDataOrWorkflow: 'yes' }, overture);
    expect(involved.outcomeKey).toBe('reviewNeeded');
    expect(involved.reasons).toEqual(['This would involve company information or become part of a business workflow.']);
    expect(involved.nextSteps).toEqual(policyOutcomes(overture).reviewNeeded.defaultNextSteps);
    const unsure: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, companyDataOrWorkflow: 'unsure' }, overture);
    expect(unsure.reasons).toEqual([
      "You weren't sure whether company information or a business workflow would be involved. That needs confirmation before proceeding."
    ]);
  });

  it('needs review for sensitive categories, in precedence after company data', () => {
    expect(evaluateToolPolicy({ ...fitsAnswers, sensitiveCategories: ['patient'] }, overture).reasons).toEqual([
      'This may involve patient, employee, customer, confidential, or regulated information.'
    ]);
    expect(evaluateToolPolicy({ ...fitsAnswers, sensitiveCategories: ['unsure'] }, overture).reasons).toEqual([
      "You weren't sure whether sensitive information would be involved. When that's unclear, a closer look is the safer next step."
    ]);
  });

  it('needs review for unapproved tools, unreviewed actions and external output', () => {
    expect(evaluateToolPolicy({ ...fitsAnswers, toolApprovalStatus: 'notApproved' }, overture).reasons).toEqual([
      "You noted this tool isn't approved yet, as far as you know."
    ]);
    expect(evaluateToolPolicy({ ...fitsAnswers, aiTakesAction: 'yes', humanReview: 'no' }, overture).reasons).toEqual([
      'AI would take an action in another system, and no one would review the result first.'
    ]);
    const external: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, toolApprovalStatus: 'unknown', outputSharedExternally: 'yes' }, overture);
    expect(external.outcomeKey).toBe('reviewNeeded');
    expect(external.reasons).toEqual(["The output would leave Overture, and this tool isn't confirmed as approved."]);
    expect(evaluateToolPolicy({ ...fitsAnswers, toolApprovalStatus: 'unknown', outputSharedExternally: 'yes' }, neutral).reasons).toEqual([
      "The output would leave the organization, and this tool isn't confirmed as approved."
    ]);
  });

  it('reports a guidance gap for unknown tools or several unsure answers', () => {
    const unknownTool: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, toolKnown: 'no', toolApprovalStatus: 'approved' }, overture);
    expect(unknownTool.outcomeKey).toBe('gap');
    expect(unknownTool.reasons).toEqual(["There isn't enough clear information yet to point to specific guidance."]);
    expect(evaluateToolPolicy({ ...fitsAnswers, toolApprovalStatus: 'unknown' }, overture).outcomeKey).toBe('gap');
    expect(evaluateToolPolicy({ ...fitsAnswers, filesUploaded: 'unsure', aiTakesAction: 'unsure' }, overture).outcomeKey).toBe('gap');
  });

  it('fits when approved, no company data, no files, no external output and a reviewer', () => {
    const decision: IPolicyDecision = evaluateToolPolicy(fitsAnswers, overture);
    expect(decision.outcomeKey).toBe('fits');
    expect(decision.label).toBe('This appears eligible for a standard-use check');
    expect(decision.reasons).toEqual([
      'The tool is reported as approved, no company or sensitive information is involved, the task is not an ongoing workflow, and a person stays involved.'
    ]);
    expect(evaluateToolPolicy({ ...fitsAnswers, humanReview: 'sometimes' }, overture).outcomeKey).toBe('fits');
  });

  it('collects safeguard reasons in the shipped order', () => {
    const decision: IPolicyDecision = evaluateToolPolicy(
      { ...fitsAnswers, filesUploaded: 'yes', outputSharedExternally: 'yes', aiDecisionImportance: 'yes', aiTakesAction: 'yes', humanReview: 'sometimes' },
      overture
    );
    expect(decision.outcomeKey).toBe('safeguards');
    expect(decision.reasons).toEqual([
      'Files would be uploaded, so the approved tool, allowed file types, and data boundary need confirmation.',
      'The output would be shared outside Overture, so a person should check it first.',
      'AI would be part of an important decision, so a person should stay in the loop.',
      'AI would take an action in another system, so a check-in point would help.',
      'Having a person review the output every time, not just sometimes, would help here.'
    ]);
    expect(decision.nextSteps).toEqual(decision.reasons);
    expect(evaluateToolPolicy({ ...fitsAnswers, humanReview: 'sometimes', filesUploaded: 'yes' }, neutral).reasons[0]).toBe(
      'Files would be uploaded, so the approved tool, allowed file types, and data boundary need confirmation.'
    );
  });

  it('falls back to the generic safeguard reason', () => {
    const decision: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, usagePattern: 'ongoing', humanReview: 'always', filesUploaded: 'no', toolApprovalStatus: 'approved', companyDataOrWorkflow: 'no', outputSharedExternally: 'no', aiDecisionImportance: 'no', aiTakesAction: 'no', toolKnown: 'yes' , sensitiveCategories: ['none'] }, overture);
    // Every "fits" condition holds, so this is the fits outcome; make one condition fail without adding a reason.
    expect(decision.outcomeKey).toBe('fits');
    const fallback: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, humanReview: 'unsure' }, overture);
    expect(fallback.outcomeKey).toBe('safeguards');
    expect(fallback.reasons).toEqual(['Having a person review the output every time, not just sometimes, would help here.']);
  });

  it('keeps the shipped empty list of contributing step ids', () => {
    expect(evaluateToolPolicy(fitsAnswers, overture).contributingStepIds).toEqual([]);
    expect(evaluateToolPolicy({ ...fitsAnswers, companyDataOrWorkflow: 'yes' }, overture).contributingStepIds).toEqual([]);
  });
});

describe('createToolPolicyEvaluator', () => {
  it('resolves after the shipped 400 ms pause with the prototype mode marker', async () => {
    jest.useFakeTimers();
    try {
      const evaluation: Promise<IPolicyEvaluation> = createToolPolicyEvaluator(overture).evaluate(fitsAnswers);
      let settled: boolean = false;
      const tracked: Promise<IPolicyEvaluation> = evaluation.then((value: IPolicyEvaluation): IPolicyEvaluation => {
        settled = true;
        return value;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(399);
      await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
      const result: IPolicyEvaluation = await tracked;
      expect(result.mode).toBe('prototype');
      expect(result.outcomeKey).toBe('fits');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('createPolicyGapRecord', () => {
  it('captures the decision for the open policy-gap queue', () => {
    const decision: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, toolKnown: 'no' }, overture);
    const record: IPolicyGapRecord = createPolicyGapRecord(toolCheck, fitsAnswers, decision, new Date(Date.UTC(2026, 8, 11)), (): string => 'policy-gap-fixed');
    expect(record).toEqual({
      recordId: 'policy-gap-fixed',
      createdAt: '2026-09-11T00:00:00.000Z',
      workflowId: 'toolCheck',
      type: 'policy-gap',
      originalAnswers: fitsAnswers,
      outcome: 'Current guidance does not answer this yet',
      reasons: ["There isn't enough clear information yet to point to specific guidance."],
      contributingAnswers: [],
      status: 'open'
    });
  });
});

describe('buildReviewRequestExportText', () => {
  it('reproduces the shipped review-request summary', () => {
    const decision: IPolicyDecision = evaluateToolPolicy({ ...fitsAnswers, companyDataOrWorkflow: 'yes' }, overture);
    const now: Date = new Date(2026, 8, 11, 8, 15);
    const text: string = buildReviewRequestExportText(
      toolCheck,
      { ...fitsAnswers, companyDataOrWorkflow: 'yes' },
      decision,
      { name: 'Pat Lee', team: 'Billing', email: 'pat@example.com' },
      overture,
      now
    );
    const lines: string[] = text.split('\n');
    expect(lines.slice(0, 6)).toEqual([
      'Overture AI CoE — CoE review request',
      'Related to: I want to know if an AI tool or task is okay',
      'AI CoE submission summary',
      'Policy reference: Overture AI CoE governance controls, version 1.1, August 26, 2026',
      `Created: ${now.toLocaleString()}`,
      ''
    ]);
    expect(lines.slice(6, 9)).toEqual(['Requested by: Pat Lee (Billing)', 'Email: pat@example.com', '']);
    expect(lines.slice(9, 14)).toEqual([
      'Guidance result so far: Please request a CoE review before proceeding',
      '',
      'Reasons:',
      '- This would involve company information or become part of a business workflow.',
      ''
    ]);
    expect(lines[14]).toBe('Original answers:');
    expect(lines[15]).toBe('What would you like AI to help with?: Draft first responses');
    expect(lines[lines.length - 1]).toBe(
      'This review request enters the AI CoE intake and triage process for follow-up and decision logging.'
    );
    expect(text).not.toContain('Thanks for letting us know');
  });

  it('substitutes placeholders for missing contact details', () => {
    const decision: IPolicyDecision = evaluateToolPolicy(fitsAnswers, neutral);
    const text: string = buildReviewRequestExportText(toolCheck, fitsAnswers, decision, { name: '', team: '', email: '' }, neutral, new Date(2026, 0, 1));
    expect(text.split('\n')[0]).toBe('AI CoE — CoE review request');
    expect(text).toContain('Requested by: Not specified (Not specified)');
    expect(text).not.toContain('Email:');
  });
});
