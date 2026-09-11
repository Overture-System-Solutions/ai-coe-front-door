import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { evaluateToolPolicy } from '../services/toolPolicyEvaluator';
import type { IPolicyDecision } from '../services/toolPolicyEvaluator';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import { buildGuidanceExportText } from './guidanceExport';

const toolCheck: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).toolCheck;
const answers: IAnswers = { helpWith: 'Draft replies', toolKnown: 'no', toolApprovalStatus: 'unknown', sensitiveCategories: ['none'], companyDataOrWorkflow: 'no' };

describe('buildGuidanceExportText', () => {
  it('reproduces the shipped guidance summary', () => {
    const decision: IPolicyDecision = evaluateToolPolicy(answers, createBranding('Overture'));
    const now: Date = new Date(2026, 8, 11, 10, 0);
    const text: string = buildGuidanceExportText(toolCheck, answers, decision, createBranding('Overture'), now);
    expect(text.split('\n')).toEqual([
      'Overture AI CoE — I want to know if an AI tool or task is okay',
      'Guidance prototype — routing only, not an approval decision',
      'Policy reference: Overture AI CoE governance controls, version 1.1, August 26, 2026',
      `Created: ${now.toLocaleString()}`,
      '',
      'Result: Current guidance does not answer this yet',
      '',
      "Why you're seeing this:",
      "- There isn't enough clear information yet to point to specific guidance.",
      '',
      'Next steps:',
      '- This is a gap in current guidance, not a decision about your idea.',
      '- Use TESS or contact the AI CoE to confirm the current approved-use guidance before proceeding.',
      '- If you can, find out the exact name of the tool — that helps a lot.',
      '',
      'Answers that shaped this result:',
      '',
      'A person must confirm the final answer. Company information and business workflows require the Overture review path described in policy.'
    ]);
  });

  it('uses neutral wording without an organization', () => {
    const decision: IPolicyDecision = evaluateToolPolicy(answers, createBranding(''));
    const text: string = buildGuidanceExportText(toolCheck, answers, decision, createBranding(''), new Date(2026, 0, 1));
    expect(text.split('\n')[0]).toBe('AI CoE — I want to know if an AI tool or task is okay');
    expect(text).toContain('require the review path described in policy.');
  });
});
