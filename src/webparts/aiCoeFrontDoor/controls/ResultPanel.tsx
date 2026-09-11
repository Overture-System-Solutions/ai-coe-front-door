import * as React from 'react';
import { useSubmission } from '../context/SubmissionContext';
import { CircleCheck, Info, RotateCcw } from '../icons';
import type { ISubmissionResult } from '../services/types';
import { NoticeBanner } from './NoticeBanner';
import { SummaryActions, SummaryText } from './SummaryActions';

export interface IResultPanelProps {
  headerIntro: string;
  headerSubtext: string;
  summaryText: string;
  downloadFilename: string;
  onStartOver: () => void;
  onDone: () => void;
}

/** Acknowledgement page shown once a workflow has been submitted. */
export function ResultPanel({ headerIntro, headerSubtext, summaryText, downloadFilename, onStartOver, onDone }: IResultPanelProps): React.ReactElement {
  const lastResult: ISubmissionResult | undefined = useSubmission().lastResult;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CircleCheck className="h-7 w-7 flex-shrink-0 mt-0.5" color="var(--color-primary)" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold">{headerIntro}</h2>
          <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
            {headerSubtext}
          </p>
        </div>
      </div>
      <NoticeBanner icon={Info}>
        {lastResult?.connected ? (
          <>
            <strong className="block font-semibold">{`Submission received: ${lastResult.intakeId}`}</strong>
            <span>{`${lastResult.message} This acknowledgement is not an approval decision.`}</span>
          </>
        ) : (
          <>
            <strong className="block font-semibold">The AI CoE record was not created.</strong>
            <span>{lastResult?.message || 'Copy or download the summary and report the issue to the AI CoE administrator.'}</span>
          </>
        )}
      </NoticeBanner>
      <SummaryText text={summaryText} />
      <SummaryActions summaryText={summaryText} downloadFilename={downloadFilename} copyButtonClass="overture-btn-primary" />
      <div className="flex flex-wrap gap-3 pt-4" style={{ borderTop: '1px solid var(--color-line)' }}>
        <button
          type="button"
          onClick={onStartOver}
          className="overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Start a new one
        </button>
        <button type="button" onClick={onDone} className="overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium">
          Back to all topics
        </button>
      </div>
    </div>
  );
}
