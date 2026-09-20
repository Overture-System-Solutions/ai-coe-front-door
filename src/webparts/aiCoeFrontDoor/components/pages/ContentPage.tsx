import * as React from 'react';
import type { IContentPage, IPageDocument, PageBlock } from '../../content/pageContent';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { LoadingState } from '../../controls/LoadingState';
import { NoticeBanner } from '../../controls/NoticeBanner';
import type { IPageContentResult, IPageContentService } from '../../services/pageContentService';
import type { DraftFlags } from '../LandingPage';
import { useDraftFlags } from '../useDraftFlags';
import { CardsBlock } from './blocks/CardsBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { LanesBlock } from './blocks/LanesBlock';
import { PieceBlock } from './blocks/PieceBlock';
import { StatusRowBlock } from './blocks/StatusRowBlock';
import { HeadingBlock, ParagraphBlock } from './blocks/TextBlocks';
import { TilesBlock } from './blocks/TilesBlock';
import { WorkCommandBlock } from './blocks/WorkCommandBlock';
import { documentContext, PageDocumentProvider, usePageDocument } from './PageDocumentContext';
import type { IPageDocumentContextValue } from './PageDocumentContext';

export interface IContentPageProps {
  /** Key of the page in the content document; absent when the instance is not configured yet. */
  pageKey?: string;
}

export const LOADING_PAGE_TEXT: string = 'Loading the page content…';
export const NO_PAGE_KEY_TEXT: string = 'This web part has no page key configured. Enter the key of a page from the content document under Page content in the web part properties.';
export const CONTENT_UNAVAILABLE_TEXT: string = 'The page content could not be loaded.';
export const NO_SERVICE_TEXT: string = 'No content document is configured.';

export function pageMissingText(pageKey: string): string {
  return `The content document has no page named "${pageKey}". Check the page key in the web part properties or add the page to the document.`;
}

type ContentState = { status: 'loading' } | { status: 'ready'; document: IPageDocument } | { status: 'unavailable'; message: string };

function renderBlock(block: PageBlock, drafts: DraftFlags): React.ReactElement {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />;
    case 'heading':
      return <HeadingBlock block={block} />;
    case 'paragraph':
      return <ParagraphBlock block={block} />;
    case 'tiles':
      return <TilesBlock block={block} />;
    case 'cards':
      return <CardsBlock block={block} />;
    case 'lanes':
      return <LanesBlock block={block} />;
    case 'statusRow':
      return <StatusRowBlock block={block} />;
    case 'workCommand':
      return <WorkCommandBlock block={block} />;
    default:
      return <PieceBlock block={block} drafts={drafts} />;
  }
}

function findPage(document: IPageDocument, pageKey: string): IContentPage | undefined {
  return Object.prototype.hasOwnProperty.call(document.pages, pageKey) ? document.pages[pageKey] : undefined;
}

function hasHomePiece(page: IContentPage | undefined): boolean {
  return page !== undefined && page.blocks.some((block: PageBlock): boolean => block.type === 'piece' && block.piece === 'home');
}

/**
 * One page of the content document rendered as front-door blocks: the hero, the work command,
 * headings, paragraphs, tiles, cards, lanes and status lines in the order the document lists them,
 * with the home tiles or the telemetry strip embedded where the document places them. The document's route list,
 * vocabulary and settings reach the blocks through the page document context, never through props;
 * the clock and the roles come from the host (the shell, or the test harness).
 */
export function ContentPage({ pageKey }: IContentPageProps): React.ReactElement {
  const { services } = useFrontDoor();
  const host: IPageDocumentContextValue = usePageDocument();
  const pageContent: IPageContentService | undefined = services.pageContent;
  const [state, setState] = React.useState<ContentState>(pageContent === undefined ? { status: 'unavailable', message: NO_SERVICE_TEXT } : { status: 'loading' });
  // Nothing to read until a page key is configured; the service memoises, so a later key costs no second request.
  const needsDocument: boolean = pageKey !== undefined;

  React.useEffect((): (() => void) => {
    if (pageContent === undefined || !needsDocument) {
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
  }, [pageContent, needsDocument]);

  const page: IContentPage | undefined = state.status === 'ready' && pageKey !== undefined ? findPage(state.document, pageKey) : undefined;
  const drafts: DraftFlags = useDraftFlags(services.draftStore, hasHomePiece(page));
  const document: IPageDocument | undefined = state.status === 'ready' ? state.document : undefined;
  const context: IPageDocumentContextValue = React.useMemo(
    (): IPageDocumentContextValue => (document === undefined ? host : documentContext(document, page, host)),
    [document, page, host]
  );

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
    content = page.blocks.map(
      (block: PageBlock, index: number): React.ReactElement => (
        <div key={index} className={`ai-page-block ai-page-block--${block.type}`}>
          {renderBlock(block, drafts)}
        </div>
      )
    );
  }

  return (
    <PageDocumentProvider value={context}>
      <div className="ai-home ai-page">{content}</div>
    </PageDocumentProvider>
  );
}
