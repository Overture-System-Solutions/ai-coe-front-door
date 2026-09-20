import * as React from 'react';
import type { IPageDocument } from '../../content/pageContent';
import type { IPageContentResult, IPageContentService } from '../../services/pageContentService';

export const NO_SERVICE_TEXT: string = 'No content document is configured.';

/** Where the content document stands for the component reading it: on its way, parsed, or explained as unavailable. */
export type DocumentState = { status: 'loading' } | { status: 'ready'; document: IPageDocument } | { status: 'unavailable'; message: string };

/**
 * Reads the content document through the instance's service when `enabled`; the service memoises,
 * so the shell and the content page reading the same document cost one request. Without a service
 * the document is unavailable at once; without `enabled` nothing is read and the state stays loading.
 */
export function useDocumentState(pageContent: IPageContentService | undefined, enabled: boolean): DocumentState {
  const [state, setState] = React.useState<DocumentState>(pageContent === undefined ? { status: 'unavailable', message: NO_SERVICE_TEXT } : { status: 'loading' });

  React.useEffect((): (() => void) => {
    if (pageContent === undefined || !enabled) {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    pageContent.getDocument().then(
      (result: IPageContentResult): void => {
        if (!cancelled) {
          setState(result.document !== undefined ? { status: 'ready', document: result.document } : { status: 'unavailable', message: result.message });
        }
      },
      (): void => {
        if (!cancelled) {
          setState({ status: 'unavailable', message: '' });
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [pageContent, enabled]);

  return state;
}
