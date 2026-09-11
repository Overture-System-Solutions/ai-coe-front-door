import * as React from 'react';
import { useSubmission } from '../context/SubmissionContext';
import { CircleCheck, Copy, Download, Info, RotateCcw } from '../icons';
import type { ISubmissionResult } from '../services/types';
import { NoticeBanner } from './NoticeBanner';

export interface IResultPanelProps {
  headerIntro: string;
  headerSubtext: string;
  summaryText: string;
  downloadFilename: string;
  onStartOver: () => void;
  onDone: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

export const COPIED_RESET_MS: number = 2500;

async function writeToClipboard(text: string): Promise<void> {
  // Wrapping the call turns a synchronous failure (no clipboard API) into a rejection too.
  await navigator.clipboard.writeText(text);
}

/** Offers the plain-text summary as a download of `filename`; failures are silent, as shipped. */
export function downloadTextFile(text: string, filename: string): void {
  try {
    const blob: Blob = new Blob([text], { type: 'text/plain' });
    const url: string = URL.createObjectURL(blob);
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch {
    // The copy button and the on-screen summary remain available.
  }
}

/** Acknowledgement page shown once a workflow has been submitted. */
export function ResultPanel({ headerIntro, headerSubtext, summaryText, downloadFilename, onStartOver, onDone }: IResultPanelProps): React.ReactElement {
  const [copyState, setCopyState] = React.useState<CopyState>('idle');
  const resetTimer: React.MutableRefObject<number | undefined> = React.useRef<number | undefined>(undefined);
  const lastResult: ISubmissionResult | undefined = useSubmission().lastResult;

  React.useEffect((): (() => void) => {
    return (): void => {
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const copySummary = (): void => {
    writeToClipboard(summaryText).then(
      (): void => {
        setCopyState('copied');
        resetTimer.current = window.setTimeout((): void => setCopyState('idle'), COPIED_RESET_MS);
      },
      (): void => setCopyState('failed')
    );
  };

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
            <strong className="block font-semibold">Submission received: {lastResult.intakeId}</strong>
            <span>{lastResult.message} This acknowledgement is not an approval decision.</span>
          </>
        ) : (
          <>
            <strong className="block font-semibold">The AI CoE record was not created.</strong>
            <span>{lastResult?.message || 'Copy or download the summary and report the issue to the AI CoE administrator.'}</span>
          </>
        )}
      </NoticeBanner>
      <div className="overture-card rounded-xl p-4">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm" style={{ fontFamily: 'var(--font-sans)' }}>
          {summaryText}
        </pre>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copySummary}
          className="overture-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copyState === 'copied' ? 'Copied!' : 'Copy summary'}
        </button>
        <button
          type="button"
          onClick={(): void => downloadTextFile(summaryText, downloadFilename)}
          className="overture-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download summary
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copyState === 'copied' ? 'Summary copied to clipboard.' : ''}
        </span>
      </div>
      {copyState === 'failed' && (
        <p className="text-sm" style={{ color: 'var(--color-info-text)' }}>
          We could not copy automatically. You can select the text above and copy it yourself.
        </p>
      )}
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
