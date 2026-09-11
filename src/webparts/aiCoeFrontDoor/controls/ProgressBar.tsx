import * as React from 'react';

export interface IProgressBarProps {
  /** Zero-based index of the current step. */
  current: number;
  /** Number of visible steps. */
  total: number;
  /** Any phase other than "form" shows the bar as complete. */
  phase: string;
  /** Label for the completed state; defaults to "Review your answers" (or "All done" on the result). */
  completeLabel?: string;
}

function progressLabel(percent: number, complete: boolean, phase: string, completeLabel: string | undefined): string {
  if (complete) {
    return completeLabel ?? (phase === 'result' ? 'All done' : 'Review your answers');
  }
  if (percent >= 75) {
    return 'Almost there';
  }
  if (percent >= 40) {
    return 'Making progress';
  }
  return 'Just getting started';
}

/** Segmented progress indicator with a friendly label under it. */
export function ProgressBar({ current, total, phase, completeLabel }: IProgressBarProps): React.ReactElement {
  const segmentCount: number = Math.max(total, 1);
  const complete: boolean = phase !== 'form';
  const percent: number = total > 0 ? Math.round(((current + 1) / total) * 100) : 0;
  const label: string = progressLabel(percent, complete, phase, completeLabel);
  const segments: React.ReactElement[] = [];
  for (let index: number = 0; index < segmentCount; index++) {
    const filled: boolean = complete || index <= current;
    segments.push(<span key={index} className={`overture-progress-segment h-1.5 flex-1 rounded-full ${filled ? 'is-filled' : ''}`} />);
  }
  return (
    <div className="mb-6">
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={complete ? 100 : percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${label}`}
      >
        {segments}
      </div>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        {label}
      </p>
    </div>
  );
}
