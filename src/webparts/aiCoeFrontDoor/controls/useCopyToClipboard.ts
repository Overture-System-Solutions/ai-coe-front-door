import * as React from 'react';

export type CopyState = 'idle' | 'copied' | 'failed';

/** How long the "Copied!" confirmation stays before the button reverts. */
export const COPIED_RESET_MS: number = 2500;

export interface ICopyToClipboard {
  copyState: CopyState;
  copy: (text: string) => void;
}

async function writeToClipboard(text: string): Promise<void> {
  // Wrapping the call turns a synchronous failure (no clipboard API) into a rejection too.
  await navigator.clipboard.writeText(text);
}

/** Clipboard copy with the shipped feedback cycle: "Copied!" for 2.5 s, or a failure hint. */
export function useCopyToClipboard(): ICopyToClipboard {
  const [copyState, setCopyState] = React.useState<CopyState>('idle');
  const resetTimer: React.MutableRefObject<number | undefined> = React.useRef<number | undefined>(undefined);

  React.useEffect((): (() => void) => {
    return (): void => {
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const copy = React.useCallback((text: string): void => {
    writeToClipboard(text).then(
      (): void => {
        setCopyState('copied');
        resetTimer.current = window.setTimeout((): void => setCopyState('idle'), COPIED_RESET_MS);
      },
      (): void => setCopyState('failed')
    );
  }, []);

  return { copyState, copy };
}
