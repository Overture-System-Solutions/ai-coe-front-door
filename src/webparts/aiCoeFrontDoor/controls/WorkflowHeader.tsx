import * as React from 'react';
import { ChevronLeft } from '../icons';
import type { IPieceWorkflowDefinition } from '../workflows/types';

export interface IWorkflowHeaderProps {
  workflow: IPieceWorkflowDefinition;
  onExit: () => void;
}

/** Workflow title with the "All topics" link back to the landing page. */
export function WorkflowHeader({ workflow, onExit }: IWorkflowHeaderProps): React.ReactElement {
  return (
    <div className="mb-5">
      <button type="button" onClick={onExit} className="overture-link inline-flex items-center gap-1 rounded-lg text-sm font-medium">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        All topics
      </button>
      <h1 className="mt-2 text-xl sm:text-2xl font-semibold">{workflow.title}</h1>
    </div>
  );
}
