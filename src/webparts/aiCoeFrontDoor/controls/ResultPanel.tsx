import * as React from 'react';
import { usePageDocument } from '../components/pages/PageDocumentContext';
import {
  LEGACY_PENDING_TEXT,
  LEGACY_PENDING_TITLE,
  RECEIPT_CONFIRM_AGAIN,
  RECEIPT_NOT_APPROVAL,
  RECEIPT_OPEN_RECORD,
  RECEIPT_PENDING_AFTER_REFERENCE,
  RECEIPT_PENDING_BEFORE_REFERENCE,
  RECEIPT_PENDING_TITLE,
  RECEIPT_READBACK_LINE,
  RECEIPT_REFERENCE_KEY,
  RECEIPT_SAVED_AT_KEY,
  RECEIPT_SAVED_TITLE,
  RECEIPT_SOURCE_LINE
} from '../content/constants';
import { usePageViewFlag } from '../context/FrontDoorContext';
import { useSubmission } from '../context/SubmissionContext';
import { CircleCheck, Clock3, Info, RotateCcw } from '../icons';
import { failureUserMessage } from '../services/failureClass';
import type { FailureClass } from '../services/failureClass';
import { submissionState } from '../services/types';
import type { ISubmissionResult, SubmissionState } from '../services/types';
import { FailureNotice } from './FailureNotice';
import { NoticeBanner } from './NoticeBanner';
import { RouteCard } from './RouteCard';
import { StatusPill } from './StatusPill';
import { SummaryActions, SummaryText } from './SummaryActions';

export interface IResultPanelProps {
  headerIntro: string;
  headerSubtext: string;
  summaryText: string;
  downloadFilename: string;
  onStartOver: () => void;
  onDone: () => void;
  /**
   * Sends the last attempt again under its reference (the workflow owns it, so it can settle the
   * draft afterwards); without it the panel calls the submission context directly.
   */
  onRetry?: () => void;
}

/** The route the hand-off card after a saved record resolves: the assistant, closed until proved here. */
export const HAND_OFF_ROUTE: string = 'assistant';
/** The class a failed result without one is shown as: nothing is known beyond "not now". */
const DEFAULT_FAILURE_CLASS: FailureClass = 'TRANSIENT';

/** The moment a row was confirmed, in the person's local time; the raw stamp when it cannot be parsed. */
function localTime(iso: string): string {
  const parsed: number = Date.parse(iso);
  return isNaN(parsed) ? iso : new Date(parsed).toLocaleString();
}

/** The shipped acknowledgement of the legacy shell, plus the third branch for a record that may exist but was not confirmed. */
function LegacyNotice({ lastResult }: { lastResult: ISubmissionResult | undefined }): React.ReactElement {
  if (lastResult !== undefined && submissionState(lastResult) === 'pending') {
    return (
      <NoticeBanner icon={Info}>
        <strong className="block font-semibold">{LEGACY_PENDING_TITLE}</strong>
        <span>{`${lastResult.message} ${LEGACY_PENDING_TEXT}`}</span>
      </NoticeBanner>
    );
  }
  return (
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
  );
}

/** The receipt of a saved record: the operation, its source, the reference and time, the readback, the record link, the draft state. */
function SavedReceipt({ result }: { result: ISubmissionResult }): React.ReactElement {
  const reference: string = result.intakeId ?? '';
  return (
    <>
      <section className="ai-receipt ai-receipt--saved" aria-label={RECEIPT_SAVED_TITLE}>
        <div className="ai-receipt-head">
          <CircleCheck className="ai-receipt-icon" aria-hidden="true" focusable="false" />
          <strong className="ai-receipt-title">{RECEIPT_SAVED_TITLE}</strong>
          <StatusPill state="draftOnly" />
        </div>
        <p className="ai-receipt-line">{RECEIPT_SOURCE_LINE}</p>
        <p className="ai-receipt-line ai-receipt-reference">
          <span className="ai-receipt-key">{RECEIPT_REFERENCE_KEY}</span> <code>{reference}</code>
          {result.savedAt !== undefined && ` · ${RECEIPT_SAVED_AT_KEY} ${localTime(result.savedAt)}`}
        </p>
        <p className="ai-receipt-line">{RECEIPT_READBACK_LINE}</p>
        {result.itemUrl !== undefined && (
          <p className="ai-receipt-line">
            <a className="ai-receipt-link" href={result.itemUrl}>
              {RECEIPT_OPEN_RECORD}
            </a>
          </p>
        )}
        <p className="ai-receipt-line ai-receipt-caveat">{RECEIPT_NOT_APPROVAL}</p>
      </section>
      <RouteCard routeKey={HAND_OFF_ROUTE} reference={reference === '' ? undefined : reference} />
    </>
  );
}

/** The write was accepted but not read back: the reference completes it, nothing is written twice. */
function PendingReceipt({ result, onConfirmAgain }: { result: ISubmissionResult; onConfirmAgain: () => void }): React.ReactElement {
  const { plane } = usePageDocument();
  return (
    <section className="ai-receipt ai-receipt--pending" aria-label={RECEIPT_PENDING_TITLE}>
      <div className="ai-receipt-head">
        <Clock3 className="ai-receipt-icon" aria-hidden="true" focusable="false" />
        <strong className="ai-receipt-title">{RECEIPT_PENDING_TITLE}</strong>
        {plane === 'operator' && result.failureClass !== undefined && <code className="ai-receipt-code">{result.failureClass}</code>}
      </div>
      <p className="ai-receipt-line">
        {RECEIPT_PENDING_BEFORE_REFERENCE} <code>{result.intakeId ?? ''}</code> {RECEIPT_PENDING_AFTER_REFERENCE}
      </p>
      <button type="button" onClick={onConfirmAgain} className="overture-btn-primary ai-receipt-retry">
        {RECEIPT_CONFIRM_AGAIN}
      </button>
    </section>
  );
}

/** What a page view shows for the last result: the receipt, the pending receipt or the failure notice. */
function PageViewOutcome({ lastResult, onRetry }: { lastResult: ISubmissionResult; onRetry: () => void }): React.ReactElement {
  const state: SubmissionState = submissionState(lastResult);
  if (state === 'saved') {
    return <SavedReceipt result={lastResult} />;
  }
  if (state === 'pending') {
    return <PendingReceipt result={lastResult} onConfirmAgain={onRetry} />;
  }
  const failureClass: FailureClass = lastResult.failureClass ?? DEFAULT_FAILURE_CLASS;
  return <FailureNotice failureClass={failureClass} userMessage={lastResult.userMessage ?? failureUserMessage(failureClass)} onRetry={onRetry} />;
}

/**
 * Acknowledgement page shown once a workflow has been submitted. The legacy shell keeps its shipped
 * notice (with a third branch for a pending record); a page view shows the receipt, the pending
 * receipt with its confirm-again button, or the failure notice, followed by the same summary and actions.
 */
export function ResultPanel({ headerIntro, headerSubtext, summaryText, downloadFilename, onStartOver, onDone, onRetry }: IResultPanelProps): React.ReactElement {
  const pageView: boolean = usePageViewFlag();
  const { lastResult, retryLast } = useSubmission();
  const retry: () => void = React.useCallback((): void => {
    if (onRetry !== undefined) {
      onRetry();
      return;
    }
    retryLast().catch((error: unknown): void => console.error('AI CoE retry failed', error));
  }, [onRetry, retryLast]);
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
      {pageView && lastResult !== undefined ? <PageViewOutcome lastResult={lastResult} onRetry={retry} /> : <LegacyNotice lastResult={lastResult} />}
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
