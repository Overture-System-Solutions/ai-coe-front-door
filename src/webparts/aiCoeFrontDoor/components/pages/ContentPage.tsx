import * as React from 'react';
import type { IContentPage, IPageDocument, PageBlock } from '../../content/pageContent';
import { holdsAnyRole, protectedPageText } from '../../content/roles';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { LoadingState } from '../../controls/LoadingState';
import { NoticeBanner } from '../../controls/NoticeBanner';
import type { IPageContentService } from '../../services/pageContentService';
import type { DraftFlags } from '../LandingPage';
import { useDraftFlags } from '../useDraftFlags';
import { BlockList } from './BlockList';
import { usePageDocument } from './PageDocumentContext';
import type { IPageDocumentContextValue } from './PageDocumentContext';
import { useDocumentState } from './useDocumentState';
import type { DocumentState } from './useDocumentState';

export { NO_SERVICE_TEXT } from './useDocumentState';

export interface IContentPageProps {
  /** Key of the page in the content document; absent when the instance is not configured yet. */
  pageKey?: string;
}

export const LOADING_PAGE_TEXT: string = 'Loading the page content…';
/** Shown when a block was left out and the membership behind the roles was never read. */
export const ROLE_NOTE_TEXT: string = 'Some sections are not shown because your role could not be confirmed.';
export const NO_PAGE_KEY_TEXT: string = 'This web part has no page key configured. Enter the key of a page from the content document under Page content in the web part properties.';
export const CONTENT_UNAVAILABLE_TEXT: string = 'The page content could not be loaded.';

export function pageMissingText(pageKey: string): string {
  return `The content document has no page named "${pageKey}". Check the page key in the web part properties or add the page to the document.`;
}

/** The named page of a document, or undefined; own keys only, so `constructor` and its kin never match. */
export function findPage(document: IPageDocument, pageKey: string): IContentPage | undefined {
  return Object.prototype.hasOwnProperty.call(document.pages, pageKey) ? document.pages[pageKey] : undefined;
}

function hasHomePiece(blocks: readonly PageBlock[]): boolean {
  return blocks.some((block: PageBlock): boolean => block.type === 'piece' && block.piece === 'home');
}

/** The blocks this reader is written for: those with no audience, and those naming a role they hold. */
function blocksFor(page: IContentPage | undefined, roles: string[] | undefined): PageBlock[] {
  return page === undefined ? [] : page.blocks.filter((block: PageBlock): boolean => holdsAnyRole(block.audience, roles));
}

/**
 * One page of the content document rendered as front-door blocks: the hero, the work command,
 * headings, paragraphs, tiles, cards, lanes, status lines, notices and rules in the order the document lists them,
 * with the home tiles or the telemetry strip embedded where the document places them. The document's route list,
 * vocabulary, settings and shared sections reach the blocks through the page document context the page view
 * shell provides, never through props; the shell also draws the shared footer below this page.
 *
 * The same context carries the roles the reader holds. A page written for a role they do not hold draws its
 * protected wording and nothing else, so no piece of it starts a request; a block written for a role they do
 * not hold is left out of the page. Neither is a protection: the site's own permissions decide what the server
 * hands out, and a reader whose membership could never be read is told that a section is missing because of it.
 */
export function ContentPage({ pageKey }: IContentPageProps): React.ReactElement {
  const { services } = useFrontDoor();
  const { roles, rolesState, vocabulary }: IPageDocumentContextValue = usePageDocument();
  const pageContent: IPageContentService | undefined = services.pageContent;
  // Nothing to read until a page key is configured; the service memoises, so a later key costs no second request.
  const state: DocumentState = useDocumentState(pageContent, pageKey !== undefined);
  const page: IContentPage | undefined = state.status === 'ready' && pageKey !== undefined ? findPage(state.document, pageKey) : undefined;
  // A page written for a role the reader does not hold draws nothing at all, so no piece of it starts a request.
  const permitted: boolean = page !== undefined && holdsAnyRole(page.requiredRole, roles);
  const blocks: PageBlock[] = permitted ? blocksFor(page, roles) : [];
  // Only a reader whose membership was never read is told that something is missing because of it.
  const withheld: boolean = permitted && page !== undefined && blocks.length < page.blocks.length && rolesState === 'unresolved';
  const drafts: DraftFlags = useDraftFlags(services.draftStore, hasHomePiece(blocks));

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
  } else if (!permitted) {
    content = <NoticeBanner>{protectedPageText(page.requiredRole, vocabulary)}</NoticeBanner>;
  } else {
    content = (
      <>
        <BlockList blocks={blocks} drafts={drafts} />
        {withheld && <p className="ai-page-role-note">{ROLE_NOTE_TEXT}</p>}
      </>
    );
  }

  return <div className="ai-home ai-page">{content}</div>;
}
