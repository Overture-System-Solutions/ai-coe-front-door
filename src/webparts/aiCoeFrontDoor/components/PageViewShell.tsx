import * as React from 'react';
import { isWorkflowView } from '../content/pageViews';
import type { IPageViewSettings } from '../content/pageViews';
import { WORKFLOW_ORDER } from '../content/workflows/catalog';
import { useFrontDoor } from '../context/FrontDoorContext';
import { NoticeBanner } from '../controls/NoticeBanner';
import { browserNavigate } from '../services/navigation';
import type { Navigate } from '../services/navigation';
import { GovernanceAdminDashboard } from './GovernanceAdminDashboard';
import { HomePage } from './HomePage';
import type { DraftFlags } from './LandingPage';
import { UsageTelemetryStrip } from './UsageTelemetryStrip';
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

/** No landing page shares the tree with a workflow piece, so there is nothing to keep in sync; the home page rediscovers drafts when it loads. */
const NO_DRAFT_TRACKING: IWorkflowProps['onDraftsChanged'] = (): void => undefined;

/**
 * Renders exactly one piece of the front door, chosen by the instance's page view settings, so the
 * pieces can live on separate native pages. Exits leave the page for the configured return URL.
 */
export function PageViewShell({ settings }: IPageViewShellProps): React.ReactElement {
  const { branding, isAdmin, siteUrl, services, navigate: contextNavigate } = useFrontDoor();
  const draftStore: typeof services.draftStore = services.draftStore;
  const navigate: Navigate = contextNavigate ?? browserNavigate;
  const view: IPageViewSettings['view'] = settings.view;
  const returnUrl: string | undefined = settings.returnUrl;
  const [drafts, setDrafts] = React.useState<DraftFlags>({});

  // The home piece discovers saved drafts on load, exactly as the legacy shell does; other pieces have no badges.
  React.useEffect((): (() => void) => {
    if (view !== 'home') {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    const discover = async (): Promise<void> => {
      for (const workflowId of WORKFLOW_ORDER) {
        const draft: unknown = await draftStore.load<unknown>(workflowId);
        if (cancelled) {
          return;
        }
        if (draft !== undefined) {
          setDrafts((current: DraftFlags): DraftFlags => ({ ...current, [workflowId]: true }));
        }
      }
    };
    discover().catch((): void => undefined);
    return (): void => {
      cancelled = true;
    };
  }, [draftStore, view]);

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
    default:
      content = <NoticeBanner>{UNCONFIGURED_VIEW_TEXT}</NoticeBanner>;
  }

  const rootClass: string = `overture-app ai-view ai-view--${view}${settings.layout === 'narrow' ? ' ai-view--narrow' : ''}`;
  return (
    <div className={rootClass}>
      <div className={homeLike ? 'ai-home-shell' : 'ai-workflow-shell'}>
        {!homeLike && (
          <>
            <div className="mb-6 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tracking-wide">
                {branding.headerPrefix}
                <span style={{ color: 'var(--color-primary)' }}>AI CoE Lab</span>
              </p>
              <span className="overture-badge rounded-full px-3 py-1 text-xs font-medium">Governed intake · SharePoint connected</span>
            </div>
            <div className="mb-8 h-px w-full" style={{ backgroundColor: 'var(--color-line)' }} />
          </>
        )}
        <main>{content}</main>
      </div>
    </div>
  );
}
