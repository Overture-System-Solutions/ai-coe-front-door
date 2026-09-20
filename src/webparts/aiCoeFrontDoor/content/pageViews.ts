/**
 * Page views: which piece of the front door one web part instance renders, and where its links go.
 *
 * The shipped behaviour (the whole front door on one page, switching screens in memory) is the
 * "legacy" view and the default, so an instance whose property bag predates these properties keeps
 * rendering exactly as before. Every other view renders one piece so the front door can be spread
 * over several native pages, one instance per page.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { PieceWorkflowId, WorkflowId } from '../workflows/types';
// The six ids that render a step-by-step piece: the five shipped workflows and the outcome record.
import { PAGE_WORKFLOWS as PIECE_WORKFLOW_IDS } from './workflows/catalog';

/** `page` renders one page of the content document (see pageContent.ts) chosen by `pageKey`. */
export type FrontDoorView = 'legacy' | 'home' | PieceWorkflowId | 'telemetry' | 'admin' | 'page';

export const FRONT_DOOR_VIEWS: readonly FrontDoorView[] = ['legacy', 'home', 'idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'page', 'outcome'];
export const DEFAULT_FRONT_DOOR_VIEW: FrontDoorView = 'legacy';

function matchIgnoringCase<T extends string>(candidates: readonly T[], value: unknown): T | undefined {
  const text: string = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return candidates.filter((candidate: T): boolean => candidate.toLowerCase() === text)[0];
}

/** Normalises the raw property value to a view id with its canonical casing; anything unrecognised is legacy. */
export function parseFrontDoorView(value: unknown): FrontDoorView {
  return matchIgnoringCase(FRONT_DOOR_VIEWS, value) ?? DEFAULT_FRONT_DOOR_VIEW;
}

/** True for the six views that walk someone through steps, so none of them takes the home-shell path. */
export function isWorkflowView(view: FrontDoorView): view is PieceWorkflowId {
  return PIECE_WORKFLOW_IDS.indexOf(view as PieceWorkflowId) >= 0;
}

/** How much room the piece has: a wide section, or a narrow column (half or one third of the page). */
export type PieceLayout = 'wide' | 'narrow';

export const PIECE_LAYOUTS: readonly PieceLayout[] = ['wide', 'narrow'];
export const DEFAULT_PIECE_LAYOUT: PieceLayout = 'wide';

export function parsePieceLayout(value: unknown): PieceLayout {
  return matchIgnoringCase(PIECE_LAYOUTS, value) ?? DEFAULT_PIECE_LAYOUT;
}

/** Pages the home tiles link to: the five workflows, the telemetry snapshot, the admin dashboard and the policy page. */
export type PageTarget = WorkflowId | 'telemetry' | 'admin' | 'policy';

export const PAGE_TARGETS: readonly PageTarget[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'policy'];

/**
 * Everything a piece can link to: the eight tile targets plus the outcome record, which is a page a home
 * piece may offer but not one of the tile targets, so `PageTarget` and its property map stay as shipped.
 */
export type PageLinkTarget = PageTarget | 'outcome';

export const PAGE_LINK_TARGETS: readonly PageLinkTarget[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'policy', 'outcome'];

export type PageLinks = { [target in PageLinkTarget]?: string };

/** The raw web part properties behind the page views; all optional because older instances lack them. */
export interface IPageViewProperties {
  view?: string;
  layout?: string;
  returnUrl?: string;
  pageIdea?: string;
  pageToolCheck?: string;
  pageTeamUsage?: string;
  pageHelpTraining?: string;
  pageFeedback?: string;
  pageTelemetry?: string;
  pageAdmin?: string;
  pagePolicy?: string;
  /** Where the outcome record lives; blank leaves it off the home tiles (decision 16). */
  pageOutcome?: string;
  /** Which page of the content document a `page` view renders. */
  pageKey?: string;
  /** Site path or URL of the content document; blank means the default in pageContent.ts. */
  contentUrl?: string;
}

export const PAGE_TARGET_PROPERTIES: { [target in PageTarget]: keyof IPageViewProperties } = {
  idea: 'pageIdea',
  toolCheck: 'pageToolCheck',
  teamUsage: 'pageTeamUsage',
  helpTraining: 'pageHelpTraining',
  feedback: 'pageFeedback',
  telemetry: 'pageTelemetry',
  admin: 'pageAdmin',
  policy: 'pagePolicy'
};

const FULL_URL: RegExp = /^https?:\/\//i;

/** True for an http or https URL, which page content opens in a new tab. */
export function isFullUrl(value: string): boolean {
  return FULL_URL.test(value.trim());
}

/** The page key as typed, trimmed; undefined when blank. */
export function parsePageKey(value: unknown): string | undefined {
  const text: string = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

/**
 * Turns a property value into a link: a full URL (http or https) or a root-based path (leading "/")
 * is kept as given; a site path such as "SitePages/Requests.aspx" is appended to the site URL; blank
 * gives undefined. With an empty site URL a site path becomes root-based.
 */
export function resolvePageUrl(siteUrl: string, raw: unknown): string | undefined {
  const text: string = typeof raw === 'string' ? raw.trim() : '';
  if (text === '') {
    return undefined;
  }
  if (FULL_URL.test(text) || text.charAt(0) === '/') {
    return text;
  }
  return `${siteUrl.replace(/\/$/, '')}/${text}`;
}

export interface IPageViewSettings {
  view: FrontDoorView;
  layout: PieceLayout;
  /** Where a workflow's exits and the dashboard's "Front Door" button lead; undefined means the site home. */
  returnUrl?: string;
  /** Resolved links for the home tiles; only mapped targets are present. */
  pages: PageLinks;
  /** The content page a `page` view renders; the document itself is read by a service the web part creates. */
  pageKey?: string;
}

/** Reads the page view properties of one instance into resolved settings. */
export function createPageViewSettings(props: IPageViewProperties, siteUrl: string): IPageViewSettings {
  const pages: PageLinks = {};
  for (const target of PAGE_TARGETS) {
    const url: string | undefined = resolvePageUrl(siteUrl, props[PAGE_TARGET_PROPERTIES[target]]);
    if (url !== undefined) {
      pages[target] = url;
    }
  }
  // The outcome record has its own property: it is a link the home piece may carry, not a tile target.
  const outcomeUrl: string | undefined = resolvePageUrl(siteUrl, props.pageOutcome);
  if (outcomeUrl !== undefined) {
    pages.outcome = outcomeUrl;
  }
  const settings: IPageViewSettings = {
    view: parseFrontDoorView(props.view),
    layout: parsePieceLayout(props.layout),
    returnUrl: resolvePageUrl(siteUrl, props.returnUrl),
    pages
  };
  const pageKey: string | undefined = parsePageKey(props.pageKey);
  if (pageKey !== undefined) {
    settings.pageKey = pageKey;
  }
  return settings;
}
