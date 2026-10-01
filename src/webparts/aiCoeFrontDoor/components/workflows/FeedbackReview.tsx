import * as React from 'react';
import { AnswerList, answerableSteps } from '../../controls/AnswerList';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { WhatHappensNext } from '../../controls/WhatHappensNext';
import { ChevronRight, Info } from '../../icons';
import { feedbackWhatHappensNext } from '../../summaries/feedbackSummary';
import { visibleSteps } from '../../workflows/formEngine';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';

export const FEEDBACK_NOTICE: string = 'This feedback is connected to your organization account and should not be considered anonymous.';

export interface IFeedbackReviewProps {
  workflow: IWorkflowDefinition;
  answers: IAnswers;
  onEditAnswer: (stepId: string) => void;
  onConfirm: () => void;
}

/** The "Check your feedback" page. */
export function FeedbackReview({ workflow, answers, onEditAnswer, onConfirm }: IFeedbackReviewProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Check your feedback</h2>
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          Take a look below. You can change anything before you confirm.
        </p>
      </div>
      <NoticeBanner icon={Info}>{FEEDBACK_NOTICE}</NoticeBanner>
      <AnswerList steps={answerableSteps(visibleSteps(workflow, answers), answers)} answers={answers} onEdit={onEditAnswer} className="space-y-3" />
      <WhatHappensNext text={feedbackWhatHappensNext(answers)} />
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={onConfirm}
          className="overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold"
        >
          Confirm my feedback
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
