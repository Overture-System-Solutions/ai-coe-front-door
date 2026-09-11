import * as React from 'react';
import { ChevronLeft, ChevronRight } from '../icons';
import { SecondaryActions } from './SecondaryActions';

export interface IStepNavProps {
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
  onSaveDraft: () => void;
  onStartOver: () => void;
  notice: string | undefined;
}

/** Back / continue buttons under a question, with the secondary actions beneath them. */
export function StepNav({ onBack, onContinue, continueLabel, onSaveDraft, onStartOver, notice }: IStepNavProps): React.ReactElement {
  return (
    <div className="mt-8 pt-5" style={{ borderTop: '1px solid var(--color-line)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="overture-btn-secondary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-base font-medium"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="overture-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-base font-semibold"
        >
          {continueLabel}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3">
        <SecondaryActions onSaveDraft={onSaveDraft} onStartOver={onStartOver} notice={notice} />
      </div>
    </div>
  );
}
