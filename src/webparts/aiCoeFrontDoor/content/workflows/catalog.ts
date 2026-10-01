import type { IBranding } from '../../branding/branding';
import type { IPieceWorkflowDefinition, IWorkflowCatalog, PieceWorkflowId, WorkflowId } from '../../workflows/types';
import { OUTCOME_WORKFLOW } from './outcome';
import { createFeedbackWorkflow } from './feedback';
import { createHelpTrainingWorkflow } from './helpTraining';
import { createIdeaWorkflow } from './idea';
import { createTeamUsageWorkflow } from './teamUsage';
import { createToolCheckWorkflow } from './toolCheck';

/** Home-page order of the workflows, as shipped. */
export const WORKFLOW_ORDER: readonly WorkflowId[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback'];

/**
 * The same order for page views, where the outcome record follows the five as a sixth piece. The legacy
 * landing page reads `WORKFLOW_ORDER` and keeps its five cards (decision 16).
 */
export const PAGE_WORKFLOWS: readonly PieceWorkflowId[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'outcome'];

/**
 * The definition behind a piece of a page view: one of the five in the catalog, or the outcome record,
 * which has no catalog entry because `WorkflowId` stays at five (decision 16).
 */
export function pieceWorkflow(catalog: IWorkflowCatalog, id: PieceWorkflowId): IPieceWorkflowDefinition {
  return id === 'outcome' ? OUTCOME_WORKFLOW : catalog[id];
}

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
