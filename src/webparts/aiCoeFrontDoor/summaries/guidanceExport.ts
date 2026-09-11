import type { IBranding } from '../branding/branding';
import { indexSteps } from '../services/toolPolicyEvaluator';
import type { IPolicyDecision } from '../services/toolPolicyEvaluator';
import { formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition } from '../workflows/types';

/** Plain-text export of a tool-check guidance result. */
export function buildGuidanceExportText(
  definition: IWorkflowDefinition,
  answers: IAnswers,
  decision: IPolicyDecision,
  branding: IBranding,
  now: Date = new Date()
): string {
  const index: { [stepId: string]: IStep } = indexSteps(definition);
  const lines: string[] = [];
  lines.push(branding.exportHeader(definition.title));
  lines.push('Guidance prototype — routing only, not an approval decision');
  lines.push(`Policy reference: ${branding.governanceReference}`);
  lines.push(`Created: ${now.toLocaleString()}`);
  lines.push('');
  lines.push(`Result: ${decision.label}`);
  lines.push('');
  lines.push("Why you're seeing this:");
  for (const reason of decision.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('');
  lines.push('Next steps:');
  for (const nextStep of decision.nextSteps) {
    lines.push(`- ${nextStep}`);
  }
  lines.push('');
  lines.push('Answers that shaped this result:');
  for (const stepId of decision.contributingStepIds) {
    const step: IStep | undefined = index[stepId];
    if (step) {
      lines.push(`${step.title}: ${formatAnswer(step, answers[stepId]) || 'Not answered'}`);
    }
  }
  lines.push('');
  lines.push(
    `A person must confirm the final answer. Company information and business workflows require ${branding.reviewPathPhrase} described in policy.`
  );
  return lines.join('\n');
}
