import * as React from 'react';
import { APP_SECTIONS, DEFAULT_APP_SECTION, ENTRY_CHOICES, sectionOf } from '../../content/appSections';
import type { AppSectionId, IAppSection } from '../../content/appSections';
import { INITIAL_JOURNEYS } from '../../content/marketing/demoJourney';
import type { DemoJourneys } from '../../content/marketing/demoJourney';
import { findSupportRoute } from '../../content/pageContent';
import type { ISupportRouteBlock } from '../../content/pageContent';
import type { IPageViewSettings } from '../../content/pageViews';
import { FrontDoorProvider, useFrontDoor } from '../../context/FrontDoorContext';
import type { IFrontDoorContextValue } from '../../context/FrontDoorContext';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { decide } from '../../services/authorization';
import type { IDecision } from '../../services/authorization';
import { gateServices } from '../../services/gatedServices';
import type { IGatedServices } from '../../services/gatedServices';
import type { IPageContentResult } from '../../services/pageContentService';
import { GovernanceAdminDashboard } from '../GovernanceAdminDashboard';
import { unresolvedRoles, useRoles } from '../useRoles';
import type { RoleLoadState } from '../useRoles';
import type { IRoleResolution } from '../../services/roleResolver';
import type { IStatusRow } from './kit';
import { AppNotice } from './kit';
import { FeedbackWorkflow } from '../workflows/FeedbackWorkflow';
import { GenericWorkflow } from '../workflows/GenericWorkflow';
import { IdeaWorkflow } from '../workflows/IdeaWorkflow';
import type { IWorkflowProps } from '../workflows/shared';
import { TeamUsageWorkflow } from '../workflows/TeamUsageWorkflow';
import { ToolCheckWorkflow } from '../workflows/ToolCheckWorkflow';
import { WORK_COMMAND_WORKFLOW_ID, workCommandDraft } from '../pages/blocks/WorkCommandBlock';
import { AppFooter, AppTopbar, widestRole } from './AppChrome';
import type { ISupportRouteBinding } from './AppChrome';
import { AppCases, AppEngineering, AppImprovement, AppSystemMap, AppUsage } from './AppSections';
import { AppMarketing } from './AppMarketing';
import { AppValue } from './AppValue';
import { AppHero, SAVE_FAILED_TEXT } from './AppHero';

/**
 * The consolidated view: one instance, one page, sections reached by tabs inside the part.
 *
 * What this replaces. The front door has been spread over separate native pages since 1.0.0.10, one piece per page,
 * which made every ordinary journey a page load and put the protected surfaces behind separate page permissions.
 * This puts the whole experience back in one application, which is what the prototype describes and what someone
 * arriving with a task actually wants.
 *
 * What that costs, and what is done about it. Page permissions were the real control on the operator and measured
 * surfaces; as sections of one page they are gone. So every section that is not open to everyone names a
 * capability, and three things hold at once (the 2026-09-22 review showed the first version holding only one):
 *
 * - the destination is authorized synchronously, in the navigation itself and again in the render, so a refused
 *   section is never mounted, not even for the one frame an effect would need to send the person back;
 * - the services the sections receive are the capability-aware facades, so a protected read that is somehow
 *   reached answers refused without leaving the browser;
 * - a refused destination is said so, in place, without naming the group or the role it would take.
 *
 * That is defence in depth and nothing more: item-level security on the lists stays the boundary, because the
 * person controls the client. Server authorization remains mandatory.
 *
 * What a sentence typed on Home becomes. It is kept as the idea draft on this device (the contract the work command
 * of the content pages already uses) and the guided request opens inside this instance, resumed from that draft.
 * Nothing is submitted by navigating, the sentence never enters a URL, and if the draft cannot be kept nothing
 * opens and the box says so.
 *
 * Navigation. Sections are state, not addresses, so moving between them keeps a part-finished request exactly
 * where it was, and the Marketing walkthrough's state lives here rather than beneath the section, so leaving and
 * returning finds it where it was. The durable Marketing records live in the service store, not in this component.
 * The tabs are a real tab list for a keyboard and a screen reader, and the section heading takes focus on a change.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IAppShellProps {
  settings: IPageViewSettings;
}

/** Shown in place of a section whose capability the person does not hold; it names neither group nor role. */
export const OPERATOR_QUEUE_NEEDS_OWNER: string =
  'The request queue is open to a site owner on this site. Your operator role is confirmed, but this instance was not opened with the site permission the queue needs, so it was not read.';

/**
 * A section a person is not allowed to open is not drawn, so it never mounts and never calls a service.
 * The administrator queue also needs the site permission the dashboard already required: an operator
 * without it still sees System map, but the queue control itself is absent.
 */
function allowed(section: IAppSection, resolution: IRoleResolution, isAdmin: boolean): IDecision {
  if (section.capability === undefined) {
    return { allowed: true };
  }
  const decision: IDecision = decide(section.capability, resolution);
  if (section.id === 'admin' && !isAdmin) {
    return decision.allowed ? { allowed: false, reason: 'notInRole', message: OPERATOR_QUEUE_NEEDS_OWNER } : decision;
  }
  return decision;
}

/** No landing page shares this tree, so a workflow has nothing to report a draft to. */
const NO_DRAFT_TRACKING: IWorkflowProps['onDraftsChanged'] = (): void => undefined;

export function AppShell({ settings }: IAppShellProps): React.ReactElement {
  const context: IFrontDoorContextValue = useFrontDoor();
  const { branding, isAdmin, services, user } = context;
  const roleState: RoleLoadState = useRoles(services.roles, isAdmin);
  // Until the membership is known the resolution is the unresolved one, which the gate refuses every narrowed
  // capability for, so nothing protected is drawn or fetched while the answer is still coming.
  const resolution: IRoleResolution = roleState.status === 'ready' ? roleState.resolution : unresolvedRoles(isAdmin);

  // The facades the sections receive: every protected read decided from this resolution before it leaves the browser.
  const gated: IGatedServices = React.useMemo((): IGatedServices => gateServices(services, resolution), [services, resolution]);
  const sectionContext: IFrontDoorContextValue = React.useMemo((): IFrontDoorContextValue => ({ ...context, services: gated.services }), [context, gated]);

  const [section, setSection] = React.useState<AppSectionId>(DEFAULT_APP_SECTION);
  const [denied, setDenied] = React.useState<string | undefined>(undefined);
  const [workflow, setWorkflow] = React.useState<'idea' | 'toolCheck' | 'teamUsage' | 'helpTraining' | 'feedback' | 'outcome' | undefined>(undefined);
  // The labelled demonstration's state, held here so Home → Marketing → back finds it where it was.
  const [demo, setDemo] = React.useState<DemoJourneys>(INITIAL_JOURNEYS);
  const [support, setSupport] = React.useState<ISupportRouteBinding | 'pending' | undefined>(services.pageContent === undefined ? undefined : 'pending');
  const headingRef: React.RefObject<HTMLHeadingElement> = React.useRef<HTMLHeadingElement>(null);
  const moved: React.MutableRefObject<boolean> = React.useRef<boolean>(false);

  const visible: IAppSection[] = APP_SECTIONS.filter((candidate: IAppSection): boolean => allowed(candidate, resolution, isAdmin).allowed);

  // The section actually drawn is decided here, synchronously, from the resolution of this render: a section that is
  // not allowed right now is never in the tree, whatever the state says. The effect below only tidies the state.
  const shown: AppSectionId = allowed(sectionOf(section), resolution, isAdmin).allowed ? section : DEFAULT_APP_SECTION;

  React.useEffect((): void => {
    if (shown !== section) {
      setSection(shown);
    }
  }, [shown, section]);

  React.useEffect((): void => {
    if (moved.current && headingRef.current !== null) {
      headingRef.current.focus();
    }
  }, [shown]);

  // The support route the site binds, read once from the shared footer of the page content document.
  React.useEffect((): (() => void) => {
    const reader: typeof services.pageContent = services.pageContent;
    if (reader === undefined) {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    reader.getDocument().then(
      (result: IPageContentResult): void => {
        if (cancelled) {
          return;
        }
        const block: ISupportRouteBlock | undefined = result.document === undefined ? undefined : findSupportRoute(result.document.shared?.footer ?? []);
        setSupport(block === undefined ? undefined : block.href === undefined ? { label: block.label } : { label: block.label, href: block.href });
      },
      (): void => {
        if (!cancelled) {
          setSupport(undefined);
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [services.pageContent]);

  /** Opens a section, refusing in place what the gate refuses: the destination is decided before any state moves. */
  const open = React.useCallback(
    (next: AppSectionId): void => {
      moved.current = true;
      setWorkflow(undefined);
      const decision: IDecision = allowed(sectionOf(next), resolution, isAdmin);
      if (!decision.allowed) {
        setDenied(decision.message);
        setSection(DEFAULT_APP_SECTION);
        return;
      }
      setDenied(undefined);
      setSection(next);
    },
    [resolution, isAdmin]
  );

  /**
   * The Home sentence: kept as the idea draft, then the guided request opens here, resumed from it. The store's
   * answer decides: a failed save opens nothing and returns the complaint for the box to show.
   */
  const command = React.useCallback(
    async (sentence: string): Promise<string | undefined> => {
      let saved: { ok: boolean };
      try {
        saved = await services.draftStore.save(WORK_COMMAND_WORKFLOW_ID, workCommandDraft(sentence));
      } catch {
        saved = { ok: false };
      }
      if (!saved.ok) {
        return SAVE_FAILED_TEXT;
      }
      moved.current = true;
      setDenied(undefined);
      setSection('engineering');
      setWorkflow('idea');
      return undefined;
    },
    [services.draftStore]
  );

  /**
   * Arrow keys move along the tabs, Home and End jump to the ends. A tab list that can only be reached by pointer
   * or by tabbing through every tab is not a tab list; this is the behaviour the role promises.
   */
  const onTabKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const keys: string[] = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (keys.indexOf(event.key) < 0 || visible.length === 0) {
        return;
      }
      event.preventDefault();
      const at: number = visible.map((candidate: IAppSection): AppSectionId => candidate.id).indexOf(shown);
      const last: number = visible.length - 1;
      let next: number;
      if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = last;
      } else if (event.key === 'ArrowRight') {
        next = at >= last ? 0 : at + 1;
      } else {
        next = at <= 0 ? last : at - 1;
      }
      open(visible[next].id);
      const button: HTMLElement | null = document.getElementById(`ai-app-tab-${visible[next].id}`);
      if (button !== null) {
        button.focus();
      }
    },
    [visible, shown, open]
  );

  const current: IAppSection = sectionOf(shown);
  const exit = React.useCallback((): void => setWorkflow(undefined), []);
  const workflowProps: IWorkflowProps = { resumeDraft: true, onExit: exit, onDraftsChanged: NO_DRAFT_TRACKING };
  const operatorWithoutOwner: boolean = !isAdmin && resolution.resolution === 'resolved' && resolution.roles.indexOf('operator') >= 0;

  let body: React.ReactElement;
  if (workflow !== undefined) {
    switch (workflow) {
      case 'idea':
        body = <IdeaWorkflow {...workflowProps} />;
        break;
      case 'toolCheck':
        body = <ToolCheckWorkflow {...workflowProps} />;
        break;
      case 'teamUsage':
        body = <TeamUsageWorkflow {...workflowProps} />;
        break;
      case 'feedback':
        body = <FeedbackWorkflow {...workflowProps} />;
        break;
      default:
        body = <GenericWorkflow workflowId={workflow} {...workflowProps} />;
        break;
    }
  } else {
    switch (shown) {
      case 'home':
        body = (
          <React.Fragment>
            {denied !== undefined && <NoticeBanner>{denied}</NoticeBanner>}
            <AppHero
              organizationName={branding.organizationLabel}
              choices={ENTRY_CHOICES}
              onChoose={open}
              onCommand={command}
              commandLabel={`Ask the ${branding.coeName}`}
              role={widestRole(resolution.roles)}
              status={viewStatus(resolution, roleState.status === 'loading')}
              pending={roleState.status === 'loading'}
            />
          </React.Fragment>
        );
        break;
      case 'cases':
        body = <AppCases />;
        break;
      case 'engineering':
        body = <AppEngineering starters={<AppStarters kind="engineering" onStart={setWorkflow} />} />;
        break;
      case 'marketing':
        body = <AppMarketing demo={demo} onDemoChange={setDemo} resolution={resolution} />;
        break;
      case 'improvement':
        body = <AppImprovement starters={<AppStarters kind="improvement" onStart={setWorkflow} />} />;
        break;
      case 'value':
        body = <AppValue usage={decide('readUsageTelemetry', resolution).allowed ? <AppUsage /> : undefined} />;
        break;
      case 'map':
        body = (
          <AppSystemMap
            admin={
              operatorWithoutOwner ? (
                <AppNotice tone="info">{OPERATOR_QUEUE_NEEDS_OWNER}</AppNotice>
              ) : undefined
            }
          />
        );
        break;
      case 'admin':
        body = <GovernanceAdminDashboard onExit={(): void => open('home')} />;
        break;
      default: {
        const exhaustive: never = shown;
        body = <NoticeBanner>{`That part of the front door is not available (${String(exhaustive)}).`}</NoticeBanner>;
        break;
      }
    }
  }

  return (
    <div className={`overture-app ai-view ai-view--app${settings.layout === 'narrow' ? ' ai-view--narrow' : ''}`}>
      <AppTopbar
        organizationName={branding.organizationLabel}
        displayName={user.displayName}
        resolution={resolution}
        pending={roleState.status === 'loading'}
      />
      <nav className="ai-app-tabs" aria-label="AI Center of Excellence sections">
        <div role="tablist" aria-label="AI Center of Excellence sections" className="ai-app-tabrow" onKeyDown={onTabKey}>
          {visible.map((candidate: IAppSection): React.ReactElement => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={`ai-app-tab-${candidate.id}`}
              aria-selected={candidate.id === shown}
              aria-controls={`ai-app-panel-${candidate.id}`}
              tabIndex={candidate.id === shown ? 0 : -1}
              className={candidate.id === 'admin' ? 'ai-app-tab ai-app-tab--admin' : 'ai-app-tab'}
              onClick={(): void => open(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </nav>
      <section
        role="tabpanel"
        id={`ai-app-panel-${shown}`}
        aria-labelledby={`ai-app-tab-${shown}`}
        className="ai-app-panel"
      >
        <h2 className={`ai-app-heading${shown === 'home' ? ' ai-app-heading--quiet' : ''}`} tabIndex={-1} ref={headingRef}>
          {current.label}
        </h2>
        {shown !== 'home' && <p className="ai-app-summary">{current.summary}</p>}
        <FrontDoorProvider value={sectionContext}>{body}</FrontDoorProvider>
      </section>
      <AppFooter organizationName={branding.organizationLabel} support={support} />
    </div>
  );
}

/**
 * What the view can honestly say about itself, down the side of the first screen. Every row is read from state this
 * build holds rather than asserted: whether the membership resolved, and what that means for what is shown.
 */
function viewStatus(resolution: IRoleResolution, pending: boolean): IStatusRow[] {
  const confirmed: boolean = resolution.resolution === 'resolved';
  return [
    {
      label: 'Your access',
      note: pending ? 'Reading your site groups' : confirmed ? 'Resolved from your site groups' : 'Could not be confirmed, so less is shown',
      tone: pending ? 'design' : confirmed ? 'good' : 'wait',
      state: pending ? 'Checking' : confirmed ? 'Confirmed' : 'Not confirmed'
    },
    {
      label: 'What this page can do',
      note: 'It drafts, records and shows. It sends nothing and publishes nothing.',
      tone: 'good',
      state: 'Bounded'
    },
    {
      label: 'Marketing workflows',
      note: 'A labelled demonstration, and a synthetic workspace with real validation, review and persistence over invented sources',
      tone: 'design',
      state: 'Synthetic only'
    }
  ];
}

/** The starters of a section: the requests it can begin, each opening inside this instance. */
interface IStarter {
  id: 'idea' | 'toolCheck' | 'teamUsage' | 'helpTraining' | 'feedback' | 'outcome';
  title: string;
  description: string;
}

const ENGINEERING_STARTERS: readonly IStarter[] = [
  { id: 'idea', title: 'Explore an AI idea', description: 'Describe something you would like AI to help with and get a summary the AI CoE can act on.' },
  { id: 'toolCheck', title: 'Check a tool or task', description: 'Find out whether a tool or a task is allowed, and what to do if it is not.' },
  { id: 'helpTraining', title: 'Get help or training', description: 'Ask for help with something specific, or for training for you or your team.' }
];

const IMPROVEMENT_STARTERS: readonly IStarter[] = [
  { id: 'teamUsage', title: 'Register team AI use', description: 'Tell the AI CoE how your team is already using AI, so it is counted and supported.' },
  { id: 'outcome', title: 'Record a task outcome', description: 'Say how one AI task turned out. Every answer is a choice; nothing you typed or produced is saved.' },
  { id: 'feedback', title: 'Share feedback', description: 'Tell the AI CoE what is not working, or what should exist and does not.' }
];

function AppStarters({ kind, onStart }: { kind: 'engineering' | 'improvement'; onStart: (id: IStarter['id']) => void }): React.ReactElement {
  const starters: readonly IStarter[] = kind === 'engineering' ? ENGINEERING_STARTERS : IMPROVEMENT_STARTERS;
  return (
    <ul className={kind === 'improvement' ? 'ai-app-starters ai-app-starters--spaced' : 'ai-app-starters'}>
      {starters.map((starter: IStarter): React.ReactElement => (
        <li key={starter.id} className="ai-app-starter">
          <button type="button" className="ai-app-starter-button" onClick={(): void => onStart(starter.id)}>
            <span className="ai-app-starter-title">{starter.title}</span>
            <span className="ai-app-starter-text">{starter.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
