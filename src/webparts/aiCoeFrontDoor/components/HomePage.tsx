import * as React from 'react';
import { HOME_CARDS } from '../content/homeCards';
import type { IHomeCard } from '../content/homeCards';
import type { PageLinks } from '../content/pageViews';
import { WORKFLOW_ORDER } from '../content/workflows/catalog';
import { useFrontDoor } from '../context/FrontDoorContext';
import { NoticeBanner } from '../controls/NoticeBanner';
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronRight, LayoutDashboard, ShieldCheck } from '../icons';
import type { WorkflowId } from '../workflows/types';
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
 * The home tiles as a piece of its own: the five path cards and the resource strip, each a link to
 * another page of the site. Same markup and classes as the landing page's cards, so the shipped
 * styles apply; no hero and no telemetry strip, which live on their own pages.
 */
export function HomePage({ drafts, pages }: IHomePageProps): React.ReactElement {
  const { siteUrl, isAdmin } = useFrontDoor();
  const linked: WorkflowId[] = WORKFLOW_ORDER.filter((id: WorkflowId): boolean => pages[id] !== undefined);

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
            {linked.map((id: WorkflowId): React.ReactElement => {
              const card: IHomeCard = HOME_CARDS[id];
              const Icon: IHomeCard['icon'] = card.icon;
              return (
                <a key={id} href={pages[id]} className={`ai-service-card ai-service-card--${card.tone}`}>
                  <Icon className="ai-service-icon" aria-hidden="true" />
                  <span className="ai-service-copy">
                    <span className="ai-service-title">{card.title}</span>
                    <span className="ai-service-description">{card.description}</span>
                    {drafts[id] === true && <span className="ai-draft-badge">Resume draft</span>}
                  </span>
                  <ArrowRight className="ai-service-arrow" aria-hidden="true" />
                </a>
              );
            })}
          </div>
        )}
      </section>
      <nav className="ai-resource-strip" aria-label="Popular AI CoE resources">
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
      </nav>
    </div>
  );
}
