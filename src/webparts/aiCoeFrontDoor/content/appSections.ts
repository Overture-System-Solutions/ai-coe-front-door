/**
 * The sections of the consolidated view, and the capability each one needs.
 *
 * The prototype organises the front door as six tabs above three entry choices: get my work done, run or improve
 * the business, review enterprise AI value. That organisation is kept because it matches how someone arrives -
 * with a task, not with a system in mind - but each section here maps to something the front door can actually do.
 * Nothing is listed to fill a tab.
 *
 * Every section names the capability it needs. A section whose capability is refused is not drawn, and, far more
 * importantly, its services are never called: the capability is checked before the section mounts. A tab left
 * undrawn is a courtesy, not the control (see services/authorization.ts).
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { Capability } from '../services/authorization';

export type AppSectionId = 'home' | 'cases' | 'engineering' | 'improvement' | 'value' | 'map';

export const APP_SECTION_IDS: readonly AppSectionId[] = ['home', 'cases', 'engineering', 'improvement', 'value', 'map'];

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
}

/**
 * The six sections. `home` and `cases` are a person's own work and are open to everyone; `engineering` is the
 * guided intake, also open; `improvement` is feedback and outcome recording, also open. Only the measured view and
 * the operator surface are held to a role, which is the same division the site already enforces by page.
 */
export const APP_SECTIONS: readonly IAppSection[] = [
  {
    id: 'home',
    label: 'Home',
    summary: 'Say what you need done, or pick one of the three ways in.'
  },
  {
    id: 'cases',
    label: 'Cases',
    summary: 'What you have sent to the AI CoE, and where each one stands.'
  },
  {
    id: 'engineering',
    label: 'Engineering',
    summary: 'The guided requests: an idea, a tool or task check, a team disclosure, help or training.'
  },
  {
    id: 'improvement',
    label: 'Improvement',
    summary: 'Record how an AI task turned out, or tell the AI CoE what is not working.'
  },
  {
    id: 'value',
    label: 'Enterprise value',
    summary: 'Measures recorded with their evidence. A measure nobody has recorded shows what it is waiting for.',
    capability: 'readProgramMeasures'
  },
  {
    id: 'map',
    label: 'System map',
    summary: 'What is connected, what it is allowed to do, and what is still waiting on a binding.',
    capability: 'readUsageTelemetry'
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
    description: 'Ask for a draft, check whether a tool is allowed, or get help with something you are stuck on.',
    section: 'engineering'
  },
  {
    step: '02',
    title: 'Run or improve the business',
    description: 'Register how your team is using AI, record how a task turned out, or raise something that is not working.',
    section: 'improvement'
  },
  {
    step: '03',
    title: 'Review enterprise AI value',
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
