import * as React from 'react';
import type { IContentPage, IPageDocument } from '../content/pageContent';
import { isWorkflowView } from '../content/pageViews';
import type { IPageViewSettings } from '../content/pageViews';
import { useFrontDoor } from '../context/FrontDoorContext';
import { NoticeBanner } from '../controls/NoticeBanner';
import { browserNavigate } from '../services/navigation';
import type { Navigate } from '../services/navigation';
import type { IPageContentService } from '../services/pageContentService';
import { GovernanceAdminDashboard } from './GovernanceAdminDashboard';
import { HomePage } from './HomePage';
import type { DraftFlags } from './LandingPage';
import { BlockList } from './pages/BlockList';
import { ContentPage, findPage } from './pages/ContentPage';
import { documentContext, PageDocumentProvider, usePageDocument } from './pages/PageDocumentContext';
import type { IPageDocumentContextValue } from './pages/PageDocumentContext';
import { useDocumentState } from './pages/useDocumentState';
import type { DocumentState } from './pages/useDocumentState';
import { UsageTelemetryStrip } from './UsageTelemetryStrip';
import { useDraftFlags } from './useDraftFlags';
import { FeedbackWorkflow } from './workflows/FeedbackWorkflow';
import { GenericWorkflow } from './workflows/GenericWorkflow';
import { IdeaWorkflow } from './workflows/IdeaWorkflow';
import type { IWorkflowProps } from './workflows/shared';
import { TeamUsageWorkflow } from './workflows/TeamUsageWorkflow';
import { ToolCheckWorkflow } from './workflows/ToolCheckWorkflow';

export interface IPageViewShellProps {
  settings: IPageViewSettings;
}

export const ADMIN_ONLY_TEXT: string = 'The AI CoE administrator dashboard is available to site administrators only.';
export const UNCONFIGURED_VIEW_TEXT: string = 'This web part has no page view configured. Choose one under Page layout in the web part properties.';
/** The badge beside the header of a wizard view: it names the intake and claims nothing about a connection. Overridable by `vocabulary.chrome.badge`. */
export const DEFAULT_CHROME_BADGE: string = 'Governed intake';

/** The accessible name of the region around a piece that is not a wizard and not a loaded content page. */
const PIECE_LABELS: { [view: string]: string } = {
  home: 'Home tiles',
  telemetry: 'AI operations snapshot',
  admin: 'Administrator dashboard',
  page: 'Content page'
};

/** The badge wording: the document's chrome override, or the default when the document sets none. */
function chromeBadge(vocabulary: IPageDocumentContextValue['vocabulary']): string {
  const override: string | undefined = vocabulary.chrome.badge;
  return override === undefined || override === '' ? DEFAULT_CHROME_BADGE : override;
}

/** No landing page shares the tree with a workflow piece, so there is nothing to keep in sync; the home page rediscovers drafts when it loads. */
const NO_DRAFT_TRACKING: IWorkflowProps['onDraftsChanged'] = (): void => undefined;
/** The shared footer carries no home piece, so it never shows a draft badge. */
const NO_DRAFTS: DraftFlags = {};

/**
 * Renders exactly one piece of the front door, chosen by the instance's page view settings, so the
 * pieces can live on separate native pages. Exits leave the page for the configured return URL.
 *
 * The shell also reads the content document for any instance that has a content service (a content
 * view with a page key, or a form page whose property bag names the document) and provides its route
 * list, vocabulary, settings and shared sections to every block; the document's shared footer (the
 * support route) is drawn below the content of every view, in the same place on each.
 */
export function PageViewShell({ settings }: IPageViewShellProps): React.ReactElement {
  const { branding, catalog, isAdmin, siteUrl, services, user, navigate: contextNavigate } = useFrontDoor();
  const host: IPageDocumentContextValue = usePageDocument();
  const draftStore: typeof services.draftStore = services.draftStore;
  const pageContent: IPageContentService | undefined = services.pageContent;
  const navigate: Navigate = contextNavigate ?? browserNavigate;
  const view: IPageViewSettings['view'] = settings.view;
  const returnUrl: string | undefined = settings.returnUrl;
  const pageKey: string | undefined = settings.pageKey;
  // The home piece discovers saved drafts on load, exactly as the legacy shell does; other pieces have no badges
  // (a content page runs its own discovery when it embeds the home tiles).
  const drafts: DraftFlags = useDraftFlags(draftStore, view === 'home');
  // A content view reads nothing until it has a page key; any other view reads whenever the instance names a document.
  const readsDocument: boolean = view === 'page' ? pageKey !== undefined : pageContent !== undefined;
  const state: DocumentState = useDocumentState(pageContent, readsDocument);
  const document: IPageDocument | undefined = readsDocument && state.status === 'ready' ? state.document : undefined;
  const page: IContentPage | undefined = document !== undefined && view === 'page' && pageKey !== undefined ? findPage(document, pageKey) : undefined;
  const context: IPageDocumentContextValue = React.useMemo(
    (): IPageDocumentContextValue => (document === undefined ? host : documentContext(document, page, host)),
    [document, page, host]
  );

  const exit = React.useCallback((): void => navigate(returnUrl ?? siteUrl), [navigate, returnUrl, siteUrl]);
  const workflowProps: IWorkflowProps = { resumeDraft: true, onExit: exit, onDraftsChanged: NO_DRAFT_TRACKING };
  const homeLike: boolean = !isWorkflowView(view);

  let content: React.ReactElement;
  switch (view) {
    case 'idea':
      content = <IdeaWorkflow {...workflowProps} />;
      break;
    case 'toolCheck':
      content = <ToolCheckWorkflow {...workflowProps} />;
      break;
    case 'teamUsage':
      content = <TeamUsageWorkflow {...workflowProps} />;
      break;
    case 'feedback':
      content = <FeedbackWorkflow {...workflowProps} />;
      break;
    case 'helpTraining':
      content = <GenericWorkflow workflowId={view} {...workflowProps} />;
      break;
    case 'home':
      content = <HomePage drafts={drafts} pages={settings.pages} />;
      break;
    case 'telemetry':
      content = (
        <div className="ai-home">
          <UsageTelemetryStrip />
        </div>
      );
      break;
    case 'admin':
      content = isAdmin ? <GovernanceAdminDashboard onExit={exit} /> : <NoticeBanner>{ADMIN_ONLY_TEXT}</NoticeBanner>;
      break;
    case 'page':
      content = <ContentPage pageKey={pageKey} />;
      break;
    default:
      content = <NoticeBanner>{UNCONFIGURED_VIEW_TEXT}</NoticeBanner>;
  }

  // The piece sits in a labelled region (the legacy shell keeps its own main landmark on its own page): a wizard is
  // named after its workflow, a content page after its page title once the document is read, any other piece after itself.
  const regionLabel: string = isWorkflowView(view) ? catalog[view].title : page !== undefined ? page.title : (PIECE_LABELS[view] ?? branding.coeName);
  const rootClass: string = `overture-app ai-view ai-view--${view}${settings.layout === 'narrow' ? ' ai-view--narrow' : ''}`;
  return (
    <PageDocumentProvider value={context}>
      <div className={rootClass}>
        <div className={homeLike ? 'ai-home-shell' : 'ai-workflow-shell'}>
          {!homeLike && (
            <div className="mb-6 flex items-center justify-between gap-3">
              <p className="ai-page-header text-sm font-semibold tracking-wide">
                <span style={{ color: 'var(--color-primary)' }}>{branding.coeName}</span>
              </p>
              <span className="overture-badge rounded-full px-3 py-1 text-xs font-medium">{chromeBadge(context.vocabulary)}</span>
            </div>
          )}
          <p className="ai-page-identity">{`Signed in as ${user.displayName}`}</p>
          {!homeLike && <div className="mb-8 h-px w-full" style={{ backgroundColor: 'var(--color-line)' }} />}
          <div role="region" aria-label={regionLabel}>
            {content}
          </div>
          {context.shared.footer.length > 0 && (
            <div className="ai-page-block ai-page-block--shared">
              <BlockList blocks={context.shared.footer} drafts={NO_DRAFTS} />
            </div>
          )}
        </div>
      </div>
    </PageDocumentProvider>
  );
}
