import * as React from 'react';
import { Copy, Download } from '../icons';
import { downloadTextFile } from './download';
import type { OptionalElement } from './render';
import { useCopyToClipboard } from './useCopyToClipboard';
import type { CopyState } from './useCopyToClipboard';

export interface ISummaryActionsProps {
  summaryText: string;
  downloadFilename: string;
  /** Style of the copy button: the result panel uses the primary style, the guidance page the secondary one. */
  copyButtonClass: 'overture-btn-primary' | 'overture-btn-secondary';
}

const BUTTON_CLASSES: string = 'inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold';

/** "Copy summary" / "Download summary" buttons with the live region announcing a successful copy. */
export function SummaryActions({ summaryText, downloadFilename, copyButtonClass }: ISummaryActionsProps): React.ReactElement {
  const { copyState, copy } = useCopyToClipboard();
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={(): void => copy(summaryText)} className={`${copyButtonClass} ${BUTTON_CLASSES}`}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copyState === 'copied' ? 'Copied!' : 'Copy summary'}
        </button>
        <button type="button" onClick={(): void => downloadTextFile(summaryText, downloadFilename)} className={`overture-btn-secondary ${BUTTON_CLASSES}`}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Download summary
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copyState === 'copied' ? 'Summary copied to clipboard.' : ''}
        </span>
      </div>
      <CopyFailureNote copyState={copyState} />
    </>
  );
}

function CopyFailureNote({ copyState }: { copyState: CopyState }): OptionalElement {
  if (copyState !== 'failed') {
    return null;
  }
  return (
    <p className="text-sm" style={{ color: 'var(--color-info-text)' }}>
      We could not copy automatically. You can select the text above and copy it yourself.
    </p>
  );
}

/** The monospace-free preformatted block that shows the summary text. */
export function SummaryText({ text }: { text: string }): React.ReactElement {
  return (
    <div className="overture-card rounded-xl p-4">
      <pre className="whitespace-pre-wrap break-words font-sans text-sm" style={{ fontFamily: 'var(--font-sans)' }}>
        {text}
      </pre>
    </div>
  );
}
