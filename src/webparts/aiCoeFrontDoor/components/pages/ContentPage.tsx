import * as React from 'react';
import type { IContentPage, IPageDocument, PageBlock } from '../../content/pageContent';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { LoadingState } from '../../controls/LoadingState';
import { NoticeBanner } from '../../controls/NoticeBanner';
import type { IPageContentService } from '../../services/pageContentService';
import type { DraftFlags } from '../LandingPage';
import { useDraftFlags } from '../useDraftFlags';
import { BlockList } from './BlockList';
import { useDocumentState } from './useDocumentState';
import type { DocumentState } from './useDocumentState';

export { NO_SERVICE_TEXT } from './useDocumentState';

export interface IContentPageProps {
  /** Key of the page in the content document; absent when the instance is not configured yet. */
  pageKey?: string;
}

export const LOADING_PAGE_TEXT: string = 'Loading the page content…';
export const NO_PAGE_KEY_TEXT: string = 'This web part has no page key configured. Enter the key of a page from the content document under Page content in the web part properties.';
export const CONTENT_UNAVAILABLE_TEXT: string = 'The page content could not be loaded.';

export function pageMissingText(pageKey: string): string {
  return `The content document has no page named "${pageKey}". Check the page key in the web part properties or add the page to the document.`;
}

/** The named page of a document, or undefined; own keys only, so `constructor` and its kin never match. */
export function findPage(document: IPageDocument, pageKey: string): IContentPage | undefined {
  return Object.prototype.hasOwnProperty.call(document.pages, pageKey) ? document.pages[pageKey] : undefined;
}

function hasHomePiece(page: IContentPage | undefined): boolean {
  return page !== undefined && page.blocks.some((block: PageBlock): boolean => block.type === 'piece' && block.piece === 'home');
}

/**
 * One page of the content document rendered as front-door blocks: the hero, the work command,
 * headings, paragraphs, tiles, cards, lanes, status lines, notices and rules in the order the document lists them,
 * with the home tiles or the telemetry strip embedded where the document places them. The document's route list,
 * vocabulary, settings and shared sections reach the blocks through the page document context the page view
 * shell provides, never through props; the shell also draws the shared footer below this page.
 */
export function ContentPage({ pageKey }: IContentPageProps): React.ReactElement {
  const { services } = useFrontDoor();
  const pageContent: IPageContentService | undefined = services.pageContent;
  // Nothing to read until a page key is configured; the service memoises, so a later key costs no second request.
  const state: DocumentState = useDocumentState(pageContent, pageKey !== undefined);
  const page: IContentPage | undefined = state.status === 'ready' && pageKey !== undefined ? findPage(state.document, pageKey) : undefined;
  const drafts: DraftFlags = useDraftFlags(services.draftStore, hasHomePiece(page));

  let content: React.ReactNode;
  if (pageKey === undefined) {
    content = <NoticeBanner>{NO_PAGE_KEY_TEXT}</NoticeBanner>;
  } else if (state.status === 'loading') {
    content = <LoadingState text={LOADING_PAGE_TEXT} />;
  } else if (state.status === 'unavailable') {
    content = (
      <NoticeBanner>
        {CONTENT_UNAVAILABLE_TEXT} {state.message}
      </NoticeBanner>
    );
  } else if (page === undefined) {
    content = <NoticeBanner>{pageMissingText(pageKey)}</NoticeBanner>;
  } else {
    content = <BlockList blocks={page.blocks} drafts={drafts} />;
  }

  return <div className="ai-home ai-page">{content}</div>;
}
