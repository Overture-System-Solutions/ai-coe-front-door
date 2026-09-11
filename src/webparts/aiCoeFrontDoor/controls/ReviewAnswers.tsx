import * as React from 'react';
import { Info } from '../icons';
import { formatAnswer, whatHappensNextText } from '../workflows/formEngine';
import type { IAnswers, IStep, IWorkflowDefinition } from '../workflows/types';
import { NoticeBanner } from './NoticeBanner';

export interface IReviewAnswersProps {
  workflow: IWorkflowDefinition;
  /** The visible steps for the current answers; notices are skipped. */
  steps: IStep[];
  answers: IAnswers;
  onEdit: (stepId: string) => void;
}

/** The "Check your answers" page of the generic workflows. */
export function ReviewAnswers({ workflow, steps, answers, onEdit }: IReviewAnswersProps): React.ReactElement {
  const questions: IStep[] = steps.filter((step: IStep): boolean => step.type !== 'notice');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Check your answers</h2>
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          Take a look below. You can change anything before you confirm.
        </p>
      </div>
      <ul className="space-y-3">
        {questions.map((step: IStep): React.ReactElement => {
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
      <NoticeBanner icon={Info}>
        <strong className="block font-semibold" style={{ color: 'var(--color-info-text)' }}>
          What happens after you confirm
        </strong>
        <span>{whatHappensNextText(workflow, answers)}</span>
      </NoticeBanner>
    </div>
  );
}
