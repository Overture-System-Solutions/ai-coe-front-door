/**
 * The sections of the consolidated view, and the capability each one needs.
 *
 * The prototype organises the front door as six tabs above three entry choices: get my work done, run or improve
 * the business, review the AI metrics. That organisation is kept because it matches how someone arrives -
 * with a task, not with a system in mind - but each section here maps to something the front door can actually do.
 * Nothing is listed to fill a tab.
 *
 * Every section names the capability it needs. A section whose capability is refused is not drawn, and, far more
 * importantly, its services are never called: the capability is checked before the section mounts. A tab left
 * undrawn is a courtesy, not the control (see services/authorization.ts). The administrator queue is listed last
 * so the shell can draw it as a separate control at the far end of the bar.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { Capability } from '../services/authorization';

export type AppSectionId = 'home' | 'cases' | 'engineering' | 'marketing' | 'improvement' | 'value' | 'admin';

export const APP_SECTION_IDS: readonly AppSectionId[] = ['home', 'engineering', 'improvement', 'marketing', 'cases', 'value', 'admin'];

export const DEFAULT_APP_SECTION: AppSectionId = 'home';

export interface IAppSection {
  id: AppSectionId;
  /** The tab wording. */
  label: string;
  /** The line under the section heading, saying what the section is for. */
  summary: string;
  /**
   * The capability the section needs, or undefined when it is open to everyone signed in. A section that names one
   * is not rendered and starts no request unless the capability is allowed.
   */
  capability?: Capability;
  /** Alternative entry capabilities; each operation still enforces its own service gate. */
  alternativeCapabilities?: readonly Capability[];
  /** Drawn at the far end of the tab row, with the other end sections (1.0.0.18: Cases, Metrics, Admin). */
  end?: true;
}

/**
 * The sections, in tab order (1.0.0.18). `home`, `engineering` (shown as Requests: the guided requests and the
 * person's own requests) and `improvement` (outcomes and feedback) are open to everyone, and so is `cases`. Marketing,
 * the measured view (shown as Metrics) and the administrator queue are held to a role, which is the same division the
 * site already enforces by page. Cases, Metrics and Admin sit together at the far end of the row. The ids are kept as
 * they were, so nothing saved against a section changes meaning; only the order and the wording moved.
 */
export const APP_SECTIONS: readonly IAppSection[] = [
  {
    id: 'home',
    label: 'Home',
    summary: 'Say what you need done, or pick one of the three ways in.'
  },
  {
    id: 'engineering',
    label: 'Requests',
    summary: 'Start a request - an idea, a tool or task check, your team\'s AI use, help or training - and follow the ones you sent.'
  },
  {
    id: 'improvement',
    label: 'Improvement',
    summary: 'Record how an AI task turned out, or tell the AI CoE what is not working.'
  },
  {
    id: 'marketing',
    label: 'Marketing',
    summary: 'The three Marketing workflows, walked end to end with invented material so the safeguards can be seen.',
    capability: 'draftCampaignBrief',
    alternativeCapabilities: ['decideMarketingReview']
  },
  {
    id: 'cases',
    label: 'Cases',
    summary: 'The cases the AI CoE is deciding: add requested information and follow their review.',
    end: true
  },
  {
    id: 'value',
    label: 'Metrics',
    summary: 'Measures recorded with their evidence. A measure nobody has recorded shows what it is waiting for.',
    capability: 'readProgramMeasures',
    end: true
  },
  {
    id: 'admin',
    label: 'Admin',
    summary: 'The administrator queue of submissions, governance progress and recorded decisions.',
    capability: 'readAdminQueue',
    end: true
  }
];

/** The three entry choices of the first screen, each leading to the section that serves it. */
export interface IEntryChoice {
  step: string;
  title: string;
  description: string;
  section: AppSectionId;
}

export const ENTRY_CHOICES: readonly IEntryChoice[] = [
  {
    step: '01',
    title: 'Get my work done',
    description: 'Share an idea, check whether a tool is allowed, tell us how your team uses AI, or get help with something you are stuck on.',
    section: 'engineering'
  },
  {
    step: '02',
    title: 'Run or improve the business',
    description: 'Record how a task turned out, or raise something that is not working.',
    section: 'improvement'
  },
  {
    step: '03',
    title: 'Review AI metrics',
    description: 'See what has actually been measured, with the evidence behind each number.',
    section: 'value'
  }
];

export function sectionOf(id: AppSectionId): IAppSection {
  return APP_SECTIONS.filter((section: IAppSection): boolean => section.id === id)[0];
}

/** Normalises a stored or pasted section id; anything unrecognised is the first screen. */
export function parseAppSection(value: unknown): AppSectionId {
  const text: string = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return APP_SECTION_IDS.filter((id: AppSectionId): boolean => id.toLowerCase() === text)[0] ?? DEFAULT_APP_SECTION;
}
