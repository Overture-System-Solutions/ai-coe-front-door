import * as React from 'react';

export interface ILoadingStateProps {
  text: string;
}

/** Centered, politely announced placeholder while a workflow loads, evaluates or submits. */
export function LoadingState({ text }: ILoadingStateProps): React.ReactElement {
  return (
    <div className="py-16 text-center" role="status" aria-live="polite">
      <p className="text-base" style={{ color: 'var(--color-ink-muted)' }}>
        {text}
      </p>
    </div>
  );
}
