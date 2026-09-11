import * as React from 'react';
import { formatAnswer } from '../workflows/formEngine';
import type { IAnswers, IStep } from '../workflows/types';

export interface IAnswerListProps {
  steps: IStep[];
  answers: IAnswers;
  onEdit: (stepId: string) => void;
  /** Spacing classes of the list; review pages use "space-y-3", collapsible lists "mt-3 space-y-3". */
  className: string;
}

/** Question/answer cards with an Edit button each. */
export function AnswerList({ steps, answers, onEdit, className }: IAnswerListProps): React.ReactElement {
  return (
    <ul className={className}>
      {steps.map((step: IStep): React.ReactElement => {
        const answer: string = formatAnswer(step, answers[step.id]);
        return (
          <li key={step.id} className="overture-card flex items-start justify-between gap-4 rounded-xl px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--color-ink-muted)' }}>
                {step.title}
              </p>
              <p className="mt-0.5 text-base break-words">
                {answer || (
                  <span className="italic" style={{ color: 'var(--color-ink-muted)' }}>
                    Not answered
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={(): void => onEdit(step.id)}
              className="overture-btn-secondary flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              Edit
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The steps a review page lists: every visible step except notices. */
export function answerableSteps(steps: IStep[]): IStep[] {
  return steps.filter((step: IStep): boolean => step.type !== 'notice');
}
