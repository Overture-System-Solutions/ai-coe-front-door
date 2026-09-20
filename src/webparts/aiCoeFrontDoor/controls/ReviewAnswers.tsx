import * as React from 'react';
import { whatHappensNextText } from '../workflows/formEngine';
import type { IAnswers, IPieceWorkflowDefinition, IStep } from '../workflows/types';
import { AnswerList, answerableSteps } from './AnswerList';
import { WhatHappensNext } from './WhatHappensNext';

export interface IReviewAnswersProps {
  workflow: IPieceWorkflowDefinition;
  /** The visible steps for the current answers; notices are skipped. */
  steps: IStep[];
  answers: IAnswers;
  onEdit: (stepId: string) => void;
}

/** The "Check your answers" page of the generic workflows. */
export function ReviewAnswers({ workflow, steps, answers, onEdit }: IReviewAnswersProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Check your answers</h2>
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          Take a look below. You can change anything before you confirm.
        </p>
      </div>
      <AnswerList steps={answerableSteps(steps)} answers={answers} onEdit={onEdit} className="space-y-3" />
      <WhatHappensNext text={whatHappensNextText(workflow, answers)} />
    </div>
  );
}
