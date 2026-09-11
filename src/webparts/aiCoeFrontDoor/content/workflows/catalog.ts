import type { IBranding } from '../../branding/branding';
import type { IWorkflowCatalog, WorkflowId } from '../../workflows/types';
import { createFeedbackWorkflow } from './feedback';
import { createHelpTrainingWorkflow } from './helpTraining';
import { createIdeaWorkflow } from './idea';
import { createTeamUsageWorkflow } from './teamUsage';
import { createToolCheckWorkflow } from './toolCheck';

/** Home-page order of the workflows, as shipped. */
export const WORKFLOW_ORDER: readonly WorkflowId[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback'];

/** Builds the five workflow definitions; two of them contain organization-specific wording. */
export function createWorkflowCatalog(branding: IBranding): IWorkflowCatalog {
  return {
    idea: createIdeaWorkflow(),
    toolCheck: createToolCheckWorkflow(branding),
    teamUsage: createTeamUsageWorkflow(branding),
    helpTraining: createHelpTrainingWorkflow(),
    feedback: createFeedbackWorkflow()
  };
}
