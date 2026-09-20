import * as React from 'react';
import { usePageViewFlag } from '../context/FrontDoorContext';
import { ChevronRight, RotateCcw } from '../icons';
import type { ISummaryField } from '../summaries/types';
import { visibleSteps } from '../workflows/formEngine';
import type { ISummarySession } from '../workflows/summarySession';
import type { IWorkflowDefinition } from '../workflows/types';
import { answerableSteps } from './AnswerList';
import { IndicatorsBanner } from './IndicatorsBanner';
import { OriginalAnswers } from './OriginalAnswers';
import { StatusPill } from './StatusPill';
import { SummaryDraftEditor } from './SummaryDraftEditor';
import { WhatHappensNext } from './WhatHappensNext';

/** The wording that differs between the idea and the team-usage summary pages. */
export interface ISummaryReviewCopy {
  heading: string;
  intro: string;
  indicatorsNote?: string;
  rebuildLabel: string;
  changedHint: string;
  confirmLabel: string;
  fieldIdPrefix: string;
}

export interface ISummaryReviewProps<TKey extends string> {
  workflow: IWorkflowDefinition;
  copy: ISummaryReviewCopy;
  fields: readonly ISummaryField<TKey>[];
  session: ISummarySession<{ [key in TKey]: string }>;
  indicators: string[];
  whatHappensNext: string;
  onUpdateField: (key: TKey, value: string) => void;
  /** Rebuilds the draft from the current answers. */
  onRebuild: () => void;
  /** True while an AI draft is being regenerated; the rebuild button waits. */
  regenerating?: boolean;
  onEditAnswer: (stepId: string) => void;
  onConfirm: () => void;
}

/** Editable summary page shared by the idea and team-usage workflows; a page view says the summary is a draft only, the legacy screen is unchanged. */
export function SummaryReview<TKey extends string>({
  workflow,
  copy,
  fields,
  session,
  indicators,
  whatHappensNext,
  onUpdateField,
  onRebuild,
  regenerating = false,
  onEditAnswer,
  onConfirm
}: ISummaryReviewProps<TKey>): React.ReactElement {
  const pageView: boolean = usePageViewFlag();
  const answersChanged: boolean = session.summarySourceSnapshot !== undefined && session.summarySourceSnapshot !== JSON.stringify(session.answers);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{copy.heading}</h2>
        {pageView && (
          <p className="ai-review-state">
            <StatusPill state="draftOnly" />
          </p>
        )}
        <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          {copy.intro}
        </p>
      </div>
      <IndicatorsBanner indicators={indicators} note={copy.indicatorsNote} />
      <SummaryDraftEditor fields={fields} idPrefix={copy.fieldIdPrefix} draft={session.summaryDraft} onChange={onUpdateField} />
      <div>
        <button
          type="button"
          onClick={onRebuild}
          disabled={regenerating}
          className="overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {regenerating ? 'Regenerating…' : copy.rebuildLabel}
        </button>
        {answersChanged && (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-info-text)' }}>
            {copy.changedHint}
          </p>
        )}
      </div>
      <OriginalAnswers steps={answerableSteps(visibleSteps(workflow, session.answers))} answers={session.answers} onEdit={onEditAnswer} />
      <WhatHappensNext text={whatHappensNext} />
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={onConfirm}
          className="overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold"
        >
          {copy.confirmLabel}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
