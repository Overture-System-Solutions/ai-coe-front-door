import * as React from 'react';
import { PAGE_HOME_CARDS } from '../content/homeCards';
import type { IHomeCard } from '../content/homeCards';
import type { PageLinks } from '../content/pageViews';
import { PAGE_WORKFLOWS } from '../content/workflows/catalog';
import { useFrontDoor } from '../context/FrontDoorContext';
import { NoticeBanner } from '../controls/NoticeBanner';
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronRight, LayoutDashboard, ShieldCheck } from '../icons';
import type { PieceWorkflowId, WorkflowId } from '../workflows/types';
import { policyLibraryUrl } from './LandingPage';
import type { DraftFlags } from './LandingPage';

export interface IHomePageProps {
  /** Workflows that have a saved draft on this device. */
  drafts: DraftFlags;
  /** Where each tile leads; tiles without a page are left out. */
  pages: PageLinks;
}

export const NO_PATHS_TEXT: string = 'No paths are linked yet. Add the page links in the web part properties.';

const PATHS_HEADING_ID: string = 'ai-coe-paths';

/**
 * The home tiles as a piece of its own: the five path cards, the outcome record when its page is
 * linked, and the resource strip, each a link to another page of the site. Same markup and classes as
 * the landing page's cards, so the shipped styles apply; no hero and no telemetry strip, which live on
 * their own pages.
 */
export function HomePage({ drafts, pages }: IHomePageProps): React.ReactElement {
  const { siteUrl, isAdmin } = useFrontDoor();
  const linked: PieceWorkflowId[] = PAGE_WORKFLOWS.filter((id: PieceWorkflowId): boolean => pages[id] !== undefined);
  const stripLinks: number = [pages.toolCheck, pages.helpTraining, pages.telemetry].filter((url: string | undefined): boolean => url !== undefined).length + 1;
  const stripClass: string = stripLinks === 4 ? 'ai-resource-strip ai-resource-strip--four' : 'ai-resource-strip';

  return (
    <div className="ai-home">
      {isAdmin && pages.admin !== undefined && (
        <div className="ai-home-adminbar">
          <span>AI CoE administration</span>
          <a className="ai-admin-back" href={pages.admin}>
            <LayoutDashboard aria-hidden="true" /> Open admin dashboard
          </a>
        </div>
      )}
      <section className="ai-path-section" aria-labelledby={PATHS_HEADING_ID}>
        <h2 id={PATHS_HEADING_ID}>How can we help?</h2>
        {linked.length === 0 ? (
          <NoticeBanner>{NO_PATHS_TEXT}</NoticeBanner>
        ) : (
          <div className="ai-home-grid">
            {linked.map((id: PieceWorkflowId): React.ReactElement => {
              const card: IHomeCard = PAGE_HOME_CARDS[id];
              const Icon: IHomeCard['icon'] = card.icon;
              return (
                <a key={id} href={pages[id]} className={`ai-service-card ai-service-card--${card.tone}`}>
                  <Icon className="ai-service-icon" aria-hidden="true" />
                  <span className="ai-service-copy">
                    <span className="ai-service-title">{card.title}</span>
                    <span className="ai-service-description">{card.description}</span>
                    {drafts[id as WorkflowId] === true && <span className="ai-draft-badge">Resume draft</span>}
                  </span>
                  <ArrowRight className="ai-service-arrow" aria-hidden="true" />
                </a>
              );
            })}
          </div>
        )}
      </section>
      <nav className={stripClass} aria-label="Popular AI CoE resources">
        <a href={pages.policy ?? policyLibraryUrl(siteUrl)} className="ai-resource-link">
          <ShieldCheck aria-hidden="true" />
          <span>AI policy</span>
          <ChevronRight aria-hidden="true" />
        </a>
        {pages.toolCheck !== undefined && (
          <a href={pages.toolCheck} className="ai-resource-link">
            <BriefcaseBusiness aria-hidden="true" />
            <span>Approved tools</span>
            <ChevronRight aria-hidden="true" />
          </a>
        )}
        {pages.helpTraining !== undefined && (
          <a href={pages.helpTraining} className="ai-resource-link">
            <CalendarDays aria-hidden="true" />
            <span>Upcoming training</span>
            <ChevronRight aria-hidden="true" />
          </a>
        )}
        {pages.telemetry !== undefined && (
          <a href={pages.telemetry} className="ai-resource-link">
            <LayoutDashboard aria-hidden="true" />
            <span>AI operations snapshot</span>
            <ChevronRight aria-hidden="true" />
          </a>
        )}
      </nav>
    </div>
  );
}
