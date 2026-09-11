import * as React from 'react';
import { WORKFLOW_ORDER } from '../content/workflows/catalog';
import { useFrontDoor } from '../context/FrontDoorContext';
import type { WorkflowId } from '../workflows/types';
import { GovernanceAdminDashboard } from './GovernanceAdminDashboard';
import { LandingPage } from './LandingPage';
import type { DraftFlags } from './LandingPage';
import { FeedbackWorkflow } from './workflows/FeedbackWorkflow';
import { GenericWorkflow } from './workflows/GenericWorkflow';
import { IdeaWorkflow } from './workflows/IdeaWorkflow';
import { TeamUsageWorkflow } from './workflows/TeamUsageWorkflow';
import { ToolCheckWorkflow } from './workflows/ToolCheckWorkflow';
import type { IWorkflowProps } from './workflows/shared';

type Route = 'home' | 'admin' | WorkflowId;

/** Routes between the landing page, the administrator dashboard and the five workflows. */
export function FrontDoorShell(): React.ReactElement {
  const { branding, isAdmin, services } = useFrontDoor();
  const draftStore: typeof services.draftStore = services.draftStore;
  const [route, setRoute] = React.useState<Route>('home');
  const [resumeDraft, setResumeDraft] = React.useState<boolean>(false);
  const [drafts, setDrafts] = React.useState<DraftFlags>({});

  React.useEffect((): (() => void) => {
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
  }, [draftStore]);

  const goHome = React.useCallback((): void => setRoute('home'), []);
  const onDraftsChanged = React.useCallback((workflowId: WorkflowId, hasDraft: boolean): void => {
    setDrafts((current: DraftFlags): DraftFlags => ({ ...current, [workflowId]: hasDraft }));
  }, []);

  const workflowProps: IWorkflowProps = { resumeDraft, onExit: goHome, onDraftsChanged };
  const homeLike: boolean = route === 'home' || route === 'admin';

  let content: React.ReactElement;
  switch (route) {
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
      content = <GenericWorkflow workflowId={route} {...workflowProps} />;
      break;
    case 'admin':
      if (isAdmin) {
        content = <GovernanceAdminDashboard onExit={goHome} />;
        break;
      }
    // falls through: the dashboard is only offered to administrators
    default:
      content = (
        <LandingPage
          drafts={drafts}
          onSelect={(workflowId: WorkflowId, hasDraft: boolean): void => {
            setResumeDraft(hasDraft);
            setRoute(workflowId);
          }}
          onOpenAdmin={(): void => setRoute('admin')}
        />
      );
  }

  return (
    <div className="overture-app min-h-screen">
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
