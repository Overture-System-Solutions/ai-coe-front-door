import * as React from 'react';
import { APP_SECTIONS, DEFAULT_APP_SECTION, ENTRY_CHOICES, sectionOf } from '../../content/appSections';
import type { AppSectionId, IAppSection } from '../../content/appSections';
import type { IPageViewSettings } from '../../content/pageViews';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { decide } from '../../services/authorization';
import type { IDecision } from '../../services/authorization';
import { browserNavigate } from '../../services/navigation';
import type { Navigate } from '../../services/navigation';
import { GovernanceAdminDashboard } from '../GovernanceAdminDashboard';
import { UsageTelemetryStrip } from '../UsageTelemetryStrip';
import { unresolvedRoles, useRoles } from '../useRoles';
import type { RoleLoadState } from '../useRoles';
import type { IRoleResolution } from '../../services/roleResolver';
import { FeedbackWorkflow } from '../workflows/FeedbackWorkflow';
import { GenericWorkflow } from '../workflows/GenericWorkflow';
import { IdeaWorkflow } from '../workflows/IdeaWorkflow';
import type { IWorkflowProps } from '../workflows/shared';
import { TeamUsageWorkflow } from '../workflows/TeamUsageWorkflow';
import { ToolCheckWorkflow } from '../workflows/ToolCheckWorkflow';
import { AppCases } from './AppCases';
import { AppMarketing } from './AppMarketing';
import { AppValue } from './AppValue';
import { AppHero } from './AppHero';

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
 * capability, the capability is decided before the section is mounted, and a refused section is never rendered -
 * which means its services are never constructed and no request for its data leaves the browser. That is defence
 * in depth and nothing more: item-level security on the lists stays the boundary, because the person controls the
 * client.
 *
 * Navigation. Sections are state, not addresses, so moving between them keeps a part-finished request exactly
 * where it was. The tabs are a real tab list for a keyboard and a screen reader, and the section heading takes
 * focus on a change so a reader is told where it landed rather than being left at the top of the page.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IAppShellProps {
  settings: IPageViewSettings;
}

/** A section a person is not allowed to open is not drawn, so it never mounts and never calls a service. */
function allowed(section: IAppSection, resolution: IRoleResolution): boolean {
  if (section.capability === undefined) {
    return true;
  }
  const decision: IDecision = decide(section.capability, resolution);
  return decision.allowed;
}

/** No landing page shares this tree, so a workflow has nothing to report a draft to. */
const NO_DRAFT_TRACKING: IWorkflowProps['onDraftsChanged'] = (): void => undefined;

export function AppShell({ settings }: IAppShellProps): React.ReactElement {
  const { branding, isAdmin, services, siteUrl, user, navigate: contextNavigate } = useFrontDoor();
  const navigate: Navigate = contextNavigate ?? browserNavigate;
  const roleState: RoleLoadState = useRoles(services.roles, isAdmin);
  // Until the membership is known the resolution is the unresolved one, which the gate refuses every narrowed
  // capability for, so nothing protected is drawn or fetched while the answer is still coming.
  const resolution: IRoleResolution = roleState.status === 'ready' ? roleState.resolution : unresolvedRoles(isAdmin);

  const [section, setSection] = React.useState<AppSectionId>(DEFAULT_APP_SECTION);
  const [workflow, setWorkflow] = React.useState<'idea' | 'toolCheck' | 'teamUsage' | 'helpTraining' | 'feedback' | 'outcome' | undefined>(undefined);
  const headingRef: React.RefObject<HTMLHeadingElement> = React.useRef<HTMLHeadingElement>(null);
  const moved: React.MutableRefObject<boolean> = React.useRef<boolean>(false);

  const visible: IAppSection[] = APP_SECTIONS.filter((candidate: IAppSection): boolean => allowed(candidate, resolution));

  // A section that stops being allowed (the membership resolved to less than a first guess) must not stay open.
  React.useEffect((): void => {
    if (visible.filter((candidate: IAppSection): boolean => candidate.id === section).length === 0) {
      setSection(DEFAULT_APP_SECTION);
    }
  }, [visible, section]);

  React.useEffect((): void => {
    if (moved.current && headingRef.current !== null) {
      headingRef.current.focus();
    }
  }, [section]);

  const open = React.useCallback((next: AppSectionId): void => {
    moved.current = true;
    setWorkflow(undefined);
    setSection(next);
  }, []);

  const current: IAppSection = sectionOf(section);
  const exit = React.useCallback((): void => setWorkflow(undefined), []);
  const workflowProps: IWorkflowProps = { resumeDraft: true, onExit: exit, onDraftsChanged: NO_DRAFT_TRACKING };

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
    switch (section) {
      case 'home':
        body = <AppHero organizationName={branding.organizationLabel} choices={ENTRY_CHOICES} onChoose={open} />;
        break;
      case 'cases':
        body = <AppCases />;
        break;
      case 'engineering':
        body = <AppStarters kind="engineering" onStart={setWorkflow} />;
        break;
      case 'marketing':
        body = <AppMarketing />;
        break;
      case 'improvement':
        body = <AppStarters kind="improvement" onStart={setWorkflow} />;
        break;
      case 'value':
        body = <AppValue />;
        break;
      case 'map':
        body = (
          <div className="ai-app-map">
            <UsageTelemetryStrip />
            {isAdmin ? <GovernanceAdminDashboard onExit={(): void => navigate(siteUrl)} /> : undefined}
          </div>
        );
        break;
      default:
        body = <NoticeBanner>{'That part of the front door is not available.'}</NoticeBanner>;
        break;
    }
  }

  return (
    <div className={`overture-app ai-view ai-view--app${settings.layout === 'narrow' ? ' ai-view--narrow' : ''}`}>
      <p className="ai-page-identity">{`Signed in as ${user.displayName}`}</p>
      <nav className="ai-app-tabs" aria-label="AI Center of Excellence sections">
        <div role="tablist" aria-label="AI Center of Excellence sections" className="ai-app-tabrow">
          {visible.map((candidate: IAppSection): React.ReactElement => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={`ai-app-tab-${candidate.id}`}
              aria-selected={candidate.id === section}
              aria-controls={`ai-app-panel-${candidate.id}`}
              tabIndex={candidate.id === section ? 0 : -1}
              className="ai-app-tab"
              onClick={(): void => open(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </nav>
      <section
        role="tabpanel"
        id={`ai-app-panel-${section}`}
        aria-labelledby={`ai-app-tab-${section}`}
        className="ai-app-panel"
      >
        <h2 className="ai-app-heading" tabIndex={-1} ref={headingRef}>
          {current.label}
        </h2>
        <p className="ai-app-summary">{current.summary}</p>
        {body}
      </section>
    </div>
  );
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
    <ul className="ai-app-starters">
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
