import * as React from 'react';
import { Info } from '../icons';
import { NoticeBanner } from './NoticeBanner';

export interface ISummaryErrorPanelProps {
  message: string;
  onRetry: () => void;
  /** Continues with the deterministic summary built from the answers. */
  onSkip: () => void;
}

/** Shown when the AI draft could not be created: retry, or continue with the plain summary. */
export function SummaryErrorPanel({ message, onRetry, onSkip }: ISummaryErrorPanelProps): React.ReactElement {
  return (
    <div className="space-y-5">
      <NoticeBanner icon={Info}>{`${message} You can try again, or continue with a plain summary built directly from your answers.`}</NoticeBanner>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onRetry} className="overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold">
          Try again
        </button>
        <button type="button" onClick={onSkip} className="overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold">
          Continue without AI help
        </button>
      </div>
    </div>
  );
}
