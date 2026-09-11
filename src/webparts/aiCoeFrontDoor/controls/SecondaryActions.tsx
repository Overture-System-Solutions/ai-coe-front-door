import * as React from 'react';
import { RotateCcw, Save } from '../icons';

export interface ISecondaryActionsProps {
  onSaveDraft: () => void;
  onStartOver: () => void;
  notice: string | undefined;
  /** Defaults to true; pages without a draft to keep (e.g. summaries) hide the link. */
  showSaveDraft?: boolean;
}

/** "Save draft" / "Start over" links with the transient notice shown next to them. */
export function SecondaryActions({ onSaveDraft, onStartOver, notice, showSaveDraft = true }: ISecondaryActionsProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {showSaveDraft && (
        <button type="button" onClick={onSaveDraft} className="overture-link inline-flex items-center gap-1.5 rounded-lg text-sm font-medium">
          <Save className="h-4 w-4" aria-hidden="true" />
          Save draft
        </button>
      )}
      <button type="button" onClick={onStartOver} className="overture-btn-ghost inline-flex items-center gap-1.5 rounded-lg text-sm font-medium">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Start over
      </button>
      {notice && (
        <span role="status" aria-live="polite" className="text-sm font-medium" style={{ color: 'var(--color-primary-dark)' }}>
          {notice}
        </span>
      )}
    </div>
  );
}
