import * as React from 'react';
import { POLICY_LIBRARY_SEGMENT } from '../content/constants';
import { HOME_CARDS } from '../content/homeCards';
import type { IHomeCard } from '../content/homeCards';
import { WORKFLOW_ORDER } from '../content/workflows/catalog';
import { useFrontDoor } from '../context/FrontDoorContext';
import { HeroNetworkSvg } from '../controls/HeroNetworkSvg';
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronRight, LayoutDashboard, ShieldCheck } from '../icons';
import type { WorkflowId } from '../workflows/types';
import { UsageTelemetryStrip } from './UsageTelemetryStrip';

export type DraftFlags = { [id in WorkflowId]?: boolean };

export interface ILandingPageProps {
  /** Workflows that have a saved draft on this device. */
  drafts: DraftFlags;
  onSelect: (workflowId: WorkflowId, hasDraft: boolean) => void;
  onOpenAdmin: () => void;
}

const PATHS_HEADING_ID: string = 'ai-coe-paths';

/** Absolute link to the policy library on the current site, or a relative one when the site is unknown. */
export function policyLibraryUrl(siteUrl: string): string {
  return siteUrl ? `${siteUrl.replace(/\/$/, '')}/${POLICY_LIBRARY_SEGMENT}` : `../${POLICY_LIBRARY_SEGMENT}`;
}

/** The home page: hero, the five path cards, the resource strip and the telemetry snapshot. */
export function LandingPage({ drafts, onSelect, onOpenAdmin }: ILandingPageProps): React.ReactElement {
  const { branding, siteUrl, isAdmin } = useFrontDoor();

  const scrollToPaths = (): void => {
    const heading: HTMLElement | null = document.getElementById(PATHS_HEADING_ID);
    if (heading) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="ai-home">
      {isAdmin && (
        <div className="ai-home-adminbar">
          <span>AI CoE administration</span>
          <button type="button" onClick={onOpenAdmin}>
            <LayoutDashboard aria-hidden="true" /> Open admin dashboard
          </button>
        </div>
      )}
      <section className="ai-hero" aria-labelledby="ai-hero-title">
        <div className="ai-hero-copy">
          <span className="ai-hero-badge">{branding.heroBadge}</span>
          <h1 id="ai-hero-title">AI, safely put to work.</h1>
          <p>Ideas, guidance, training, and governance—start in the right place.</p>
          <button type="button" className="ai-hero-cta" onClick={scrollToPaths}>
            Choose your path <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <HeroNetworkSvg />
      </section>
      <section className="ai-path-section" aria-labelledby={PATHS_HEADING_ID}>
        <h2 id={PATHS_HEADING_ID}>How can we help?</h2>
        <div className="ai-home-grid">
          {WORKFLOW_ORDER.map((id: WorkflowId): React.ReactElement => {
            const card: IHomeCard = HOME_CARDS[id];
            const Icon: IHomeCard['icon'] = card.icon;
            const hasDraft: boolean = drafts[id] === true;
            return (
              <button key={id} type="button" onClick={(): void => onSelect(id, hasDraft)} className={`ai-service-card ai-service-card--${card.tone}`}>
                <Icon className="ai-service-icon" aria-hidden="true" />
                <span className="ai-service-copy">
                  <span className="ai-service-title">{card.title}</span>
                  <span className="ai-service-description">{card.description}</span>
                  {hasDraft && <span className="ai-draft-badge">Resume draft</span>}
                </span>
                <ArrowRight className="ai-service-arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
      <nav className="ai-resource-strip" aria-label="Popular AI CoE resources">
        <a href={policyLibraryUrl(siteUrl)} className="ai-resource-link">
          <ShieldCheck aria-hidden="true" />
          <span>AI policy</span>
          <ChevronRight aria-hidden="true" />
        </a>
        <button type="button" className="ai-resource-link" onClick={(): void => onSelect('toolCheck', drafts.toolCheck === true)}>
          <BriefcaseBusiness aria-hidden="true" />
          <span>Approved tools</span>
          <ChevronRight aria-hidden="true" />
        </button>
        <button type="button" className="ai-resource-link" onClick={(): void => onSelect('helpTraining', drafts.helpTraining === true)}>
          <CalendarDays aria-hidden="true" />
          <span>Upcoming training</span>
          <ChevronRight aria-hidden="true" />
        </button>
      </nav>
      <UsageTelemetryStrip />
    </div>
  );
}
