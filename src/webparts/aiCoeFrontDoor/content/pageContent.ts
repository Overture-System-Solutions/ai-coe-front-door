/**
 * Page content: the typed blocks a content page is made of, read from a JSON document in the site's
 * assets (`SiteAssets/ai-coe-pages.json` unless the instance says otherwise). The document is
 * hand-editable, so parsing is strict about the envelope (version and pages) and lenient inside a
 * page: a malformed block or item is dropped and the rest of the page still renders.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { includes } from '../utils/collections';
import { PAGE_TARGETS } from './pageViews';
import type { PageLinks, PageTarget } from './pageViews';
import { asObject, ownKeys, readFlag, readIsoDate, readItems, readStringList, readText, setOptional } from './rawJson';
import type { Raw } from './rawJson';
import { parseRoutes } from './routes';
import type { RouteTable } from './routes';
import { readCanonicalStatus, readState, TRUTH_STATE_KEYS } from './truthStates';
import type { StateCode, TruthStateKey } from './truthStates';

export { isExternalHref, resolveContentHref } from './links';

export const PAGE_DOCUMENT_VERSION: number = 1;
export const DEFAULT_CONTENT_URL: string = 'SiteAssets/ai-coe-pages.json';

/** Who a page is written for: people using the front door, or the operators who run it. */
export type PagePlane = 'user' | 'operator';
export const PAGE_PLANES: readonly PagePlane[] = ['user', 'operator'];
export const DEFAULT_PAGE_PLANE: PagePlane = 'user';

/** Wording a document may override for one truth state; a blank keeps the default. */
export interface ITruthStateWording {
  label?: string;
  definition?: string;
}

/** The chrome labels a document may override. */
export type ChromeLabel = 'badge' | 'example' | 'needsRefresh' | 'awaitingSource' | 'protectedPage';
export const CHROME_LABELS: readonly ChromeLabel[] = ['badge', 'example', 'needsRefresh', 'awaitingSource', 'protectedPage'];

/**
 * The document's wording overrides, all optional and all string maps: truth-state labels and
 * definitions, plain request-status names by code, chrome labels, role names and telemetry feed names.
 * `{organization}` and `{role}` in the text are filled by the renderer, never by the script.
 */
export interface IVocabulary {
  truthStates: { [key in TruthStateKey]?: ITruthStateWording };
  requestStatuses: { [code: string]: string };
  chrome: { [key in ChromeLabel]?: string };
  roles: { [roleId: string]: string };
  telemetry: { [feedId: string]: string };
}

export const DEFAULT_VOCABULARY: IVocabulary = { truthStates: {}, requestStatuses: {}, chrome: {}, roles: {}, telemetry: {} };

/** Numbers the document sets for every page: how old a fact may be, and the smallest group a measure may describe. */
export interface IDocumentSettings {
  freshnessDays: number;
  minimumCohort: number;
}

export const DEFAULT_SETTINGS: IDocumentSettings = { freshnessDays: 30, minimumCohort: 5 };
const MAX_FRESHNESS_DAYS: number = 3650;
const MAX_MINIMUM_COHORT: number = 1000;

/** The colour families the service and metric cards already ship. */
export type CardTone = 'teal' | 'blue' | 'violet' | 'gold' | 'cyan';
export const CARD_TONES: readonly CardTone[] = ['teal', 'blue', 'violet', 'gold', 'cyan'];
export const DEFAULT_CARD_TONE: CardTone = 'teal';

/** The traffic-light tones of the request lanes. */
export type LaneTone = 'green' | 'amber' | 'red';
export const LANE_TONES: readonly LaneTone[] = ['green', 'amber', 'red'];

/**
 * What an item may say about where it leads: a link, a truth state or activation code, and a route
 * key from the document's route list (which wins over the other two). An item with a state or a
 * route may have no link: it is then shown as a labelled non-link with its pill.
 */
export interface IActionFields {
  href?: string;
  state?: StateCode;
  route?: string;
}

/** What a fact may say about its age and origin, and whether it is an example rather than a fact. */
export interface IFactFields {
  /** YYYY-MM-DD: when the fact was last read back. */
  asOf?: string;
  /** Where the fact was read from. */
  source?: string;
  /** Present when the item is an illustration, not something read from this environment; it carries the example pill. */
  illustrative?: true;
}

/**
 * What any block may say about who it is written for: role ids, any one of which shows it. A block
 * without an audience is for everyone. The roles come from site group membership, so a block is a
 * courtesy to the reader, never a protection: anything that must not be read is kept off the page by
 * the site's own permissions.
 */
export interface IBlockAudience {
  audience?: string[];
}

export interface IHeroCta extends IActionFields {
  label: string;
  /** Short line under the call to action. */
  note?: string;
}

export interface IHeroBlock extends IBlockAudience {
  type: 'hero';
  title: string;
  /** The line under the title; in-text markup allowed. */
  text?: string;
  /** Replaces the branding badge when given. */
  badge?: string;
  cta?: IHeroCta;
}

export interface IHeadingBlock extends IBlockAudience {
  type: 'heading';
  level: 2 | 3;
  text: string;
}

export interface IParagraphBlock extends IBlockAudience {
  type: 'paragraph';
  /** In-text markup allowed. */
  text: string;
}

export interface ITileItem extends IActionFields {
  title: string;
  /** Small line above the title, such as "Do", "Ask", "Improve". */
  kicker?: string;
  description?: string;
  /** Short line under the description, such as where the link opens. */
  note?: string;
  /** Name of an icon the front door ships; unknown names fall back to the light bulb. */
  icon?: string;
  tone: CardTone;
}

export interface ITilesBlock extends IBlockAudience {
  type: 'tiles';
  /** Present only when the tiles are the page's main choice: three to a row. */
  prominent?: true;
  items: ITileItem[];
}

export interface ICardItem extends IActionFields, IFactFields {
  title: string;
  /** Small line above the title, such as a duration. */
  kicker?: string;
  /** Paragraphs; in-text markup allowed. */
  body: string[];
  /** Emphasised closing line, such as a boundary or a source; in-text markup allowed. */
  meta?: string;
  tone: CardTone;
}

export interface ICardsBlock extends IBlockAudience {
  type: 'cards';
  columns: 2 | 3;
  items: ICardItem[];
}

export interface ILaneItem {
  tone: LaneTone;
  title: string;
  body: string[];
  note?: string;
  badge?: string;
}

export interface ILanesBlock extends IBlockAudience {
  type: 'lanes';
  items: ILaneItem[];
}

export interface IStatusItem extends IActionFields, IFactFields {
  label: string;
  /** In-text markup allowed. */
  text: string;
}

export interface IStatusRowBlock extends IBlockAudience {
  type: 'statusRow';
  items: IStatusItem[];
}

/** The three front-door pieces a content page can embed between its blocks: the home tiles, the telemetry strip, the person's own requests. */
export type PieceKind = 'home' | 'telemetry' | 'myWork';
export const PIECE_KINDS: readonly PieceKind[] = ['home', 'telemetry', 'myWork'];

export interface IPieceBlock extends IBlockAudience {
  type: 'piece';
  piece: PieceKind;
  /** Where the home tiles lead, as written in the document (site paths or full URLs). */
  pages: PageLinks;
  /** Telemetry only: the small line above the strip's heading, replacing the shipped one; the tile labels then come from `vocabulary.telemetry`. */
  kicker?: string;
}

/** What a status strip item is: the count of the person's own requests, or a labelled line like a status row's. */
export type StatusStripItemKind = 'myRequests' | 'text';
export const STATUS_STRIP_ITEM_KINDS: readonly StatusStripItemKind[] = ['myRequests', 'text'];

export interface IStatusStripItem extends IActionFields, IFactFields {
  kind: StatusStripItemKind;
  label: string;
  /** The line's text (required for a `text` item; a lead before the counts on a `myRequests` item); in-text markup allowed. */
  text?: string;
}

/**
 * Short labelled lines side by side on the first screen, one of which may count the person's own
 * requests by plain status (read from the request list, never a number when the list cannot be read).
 */
export interface IStatusStripBlock extends IBlockAudience {
  type: 'statusStrip';
  items: IStatusStripItem[];
  /** Shown for the request count when the person has sent nothing. */
  emptyText: string;
  /** Shown for the request count when the list cannot be read. */
  unavailableText: string;
}

export const DEFAULT_STATUS_STRIP_EMPTY_TEXT: string = 'No requests from you yet.';
export const DEFAULT_STATUS_STRIP_UNAVAILABLE_TEXT: string = 'Status unavailable: the request list could not be read.';

/**
 * The first screen's one command: a sentence about the work to be done, saved as the idea draft and
 * carried to the route the block names (`work` by default) through the route list, so an unproved
 * destination fails closed to the guided intake with the sentence already filled in.
 */
export interface IWorkCommandBlock extends IBlockAudience {
  type: 'workCommand';
  /** The question above the input, such as "What do you need done?". */
  prompt: string;
  placeholder?: string;
  submitLabel: string;
  /** Key of the route the sentence is carried to. */
  route: string;
  /** Short line under the input; in-text markup allowed. */
  note?: string;
  /** Shown when the sentence is empty on submit. */
  emptyText: string;
}

export const DEFAULT_WORK_COMMAND_SUBMIT_LABEL: string = 'Start';
export const DEFAULT_WORK_COMMAND_ROUTE: string = 'work';
export const DEFAULT_WORK_COMMAND_EMPTY_TEXT: string = 'Say what you need done first.';

/** How a notice is meant: something to know, or something to take care over (a data boundary, a pilot's limits). */
export type NoticeTone = 'info' | 'caution';
export const NOTICE_TONES: readonly NoticeTone[] = ['info', 'caution'];
export const DEFAULT_NOTICE_TONE: NoticeTone = 'info';

/** A short aside set apart from the page's prose: a boundary, a limit, a fact about what the site records. */
export interface INoticeBlock extends IBlockAudience {
  type: 'notice';
  tone: NoticeTone;
  title?: string;
  /** In-text markup allowed. */
  text: string;
}

/** One rule: what to do, in a few words, and optionally why or how. */
export interface IRuleItem {
  title: string;
  /** In-text markup allowed. */
  text?: string;
}

/** A short numbered (or bulleted) set of rules people are asked to keep, such as the three rules of the pilot. */
export interface IRulesBlock extends IBlockAudience {
  type: 'rules';
  title?: string;
  items: IRuleItem[];
  /** Numbered unless the document says `false`. */
  ordered: boolean;
}

/**
 * What a support routing row is for, so a page can pick the owner of a kind of failure without
 * reading the row's wording: `identity` takes access failures, `support` takes anything else.
 */
export type SupportRouteKind = 'identity' | 'privacy' | 'approval' | 'claims' | 'recovery' | 'support';

export const SUPPORT_ROUTE_KINDS: readonly SupportRouteKind[] = ['identity', 'privacy', 'approval', 'claims', 'recovery', 'support'];

/** One row of the support routing grid: what went wrong, who it goes to, and what to do at once. */
export interface ISupportRouteItem {
  issue: string;
  /** The named owner; absent means the page says "not yet named". */
  owner?: string;
  action?: string;
  /** Which kind of issue the row takes; absent means the row is shown but never chosen for a failure notice. */
  kind?: SupportRouteKind;
}

/**
 * The pilot's support route, shared by every page view: where to ask, when to stop and ask, what a
 * report should carry, and which owner each kind of issue goes to.
 */
export interface ISupportRouteBlock extends IBlockAudience {
  type: 'supportRoute';
  /** The route, such as the pilot channel; a link when `href` is set, a plain label otherwise. */
  label: string;
  href?: string;
  /** The situations in which to stop and ask. */
  stopWhen: string[];
  /** What to put in a report (the task type, the time, the status shown, what was expected). */
  reportFields: string[];
  routes: ISupportRouteItem[];
}

/** The traffic-light health a case last recorded; the same three tones as the request lanes. */
export type CaseHealth = LaneTone;

/**
 * One case as the page shows it: the record id, the canonical status code (never a pilot word), and
 * what its latest authoritative source said (the stage and health then, the day that source was
 * read, the next action). Nothing here is read from a list yet; an example item says so with the
 * example pill, and a dated one carries its freshness like a card.
 */
export interface ICaseCardItem {
  id: string;
  title: string;
  description?: string;
  /** A canonical status code; `AWAITING_SOURCE` draws the awaiting-source pill, every other code its plain wording. */
  state: string;
  /** The stage the latest source recorded, such as "Validate". */
  historicalStage?: string;
  historicalHealth?: CaseHealth;
  /** YYYY-MM-DD: the day the latest source was read. */
  sourceDate?: string;
  nextAction?: string;
  /** Closing line under the case; a stale case without one says not to infer progress. */
  caption?: string;
  /** Present when the case is an illustration, not a record of this environment; it carries the example pill. */
  illustrative?: true;
}

/** One card per case; a `source` naming a cases list is accepted and ignored until that list exists. */
export interface ICaseCardsBlock extends IBlockAudience {
  type: 'caseCards';
  items: ICaseCardItem[];
}

export type PageBlock =
  | IHeroBlock
  | IHeadingBlock
  | IParagraphBlock
  | ITilesBlock
  | ICardsBlock
  | ILanesBlock
  | IStatusRowBlock
  | IStatusStripBlock
  | IPieceBlock
  | IWorkCommandBlock
  | INoticeBlock
  | IRulesBlock
  | ISupportRouteBlock
  | ICaseCardsBlock;

export interface IContentPage {
  title: string;
  blocks: PageBlock[];
  /** Present only when the page is written for operators; absent means the user plane. */
  plane?: PagePlane;
  /**
   * Role ids, any one of which opens the page; absent means everyone. The site's permissions are what
   * actually keep a page shut (the script grants the same groups); this tells a person who does reach
   * the page whose page it is, instead of drawing blocks that would only mislead them.
   */
  requiredRole?: string[];
}

/** The sections every page view shares: the footer rendered below the content, the wizards included. */
export interface ISharedSections {
  footer: PageBlock[];
}

export const EMPTY_SHARED: ISharedSections = { footer: [] };

/** Block types that belong to one page only and are dropped from the shared sections. */
export const SHARED_EXCLUDED_BLOCK_TYPES: readonly PageBlock['type'][] = ['hero', 'piece', 'workCommand'];

export interface IPageDocument {
  version: number;
  pages: { [key: string]: IContentPage };
  /** Present when the document carries a vocabulary object; a malformed one is dropped. */
  vocabulary?: IVocabulary;
  /** Present when the document carries a settings object; a malformed one is dropped. */
  settings?: IDocumentSettings;
  /** Present when the document carries a routes object; a malformed one is dropped. */
  routes?: RouteTable;
  /** Present when the document carries a shared object; a malformed one is dropped. */
  shared?: ISharedSections;
}

function readTone<T extends string>(candidates: readonly T[], value: unknown): T | undefined {
  const text: string | undefined = readText(value);
  return text === undefined ? undefined : candidates.filter((candidate: T): boolean => candidate === text)[0];
}

/** Paragraphs from a string (blank line = new paragraph) or an array of strings; blanks are dropped. */
export function readParagraphs(value: unknown): string[] {
  const parts: unknown[] = typeof value === 'string' ? value.split(/\n\s*\n/) : Array.isArray(value) ? value : [];
  const paragraphs: string[] = [];
  for (const part of parts) {
    const text: string | undefined = readText(part);
    if (text !== undefined) {
      paragraphs.push(text);
    }
  }
  return paragraphs;
}

/** Reads href, state and route onto an item; true when at least one of them is there (an item with none leads nowhere). */
function readActionFields(item: IActionFields, raw: Raw): boolean {
  setOptional(item, 'href', readText(raw.href));
  const state: StateCode | undefined = readState(raw.state);
  if (state !== undefined) {
    item.state = state;
  }
  setOptional(item, 'route', readText(raw.route));
  return item.href !== undefined || item.state !== undefined || item.route !== undefined;
}

function readFactFields(item: IFactFields, raw: Raw): void {
  setOptional(item, 'asOf', readIsoDate(raw.asOf));
  setOptional(item, 'source', readText(raw.source));
  if (readFlag(raw.illustrative) === true) {
    item.illustrative = true;
  }
}

function readHeroCta(value: unknown): IHeroCta | undefined {
  const raw: Raw | undefined = asObject(value);
  const label: string | undefined = raw === undefined ? undefined : readText(raw.label);
  if (raw === undefined || label === undefined) {
    return undefined;
  }
  const cta: IHeroCta = { label };
  if (!readActionFields(cta, raw)) {
    return undefined;
  }
  setOptional(cta, 'note', readText(raw.note));
  return cta;
}

function parseHero(raw: Raw): IHeroBlock | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const block: IHeroBlock = { type: 'hero', title };
  setOptional(block, 'text', readText(raw.text));
  setOptional(block, 'badge', readText(raw.badge));
  const cta: IHeroCta | undefined = readHeroCta(raw.cta);
  if (cta !== undefined) {
    block.cta = cta;
  }
  return block;
}

function parseHeading(raw: Raw): IHeadingBlock | undefined {
  const text: string | undefined = readText(raw.text);
  return text === undefined ? undefined : { type: 'heading', level: raw.level === 3 ? 3 : 2, text };
}

function parseParagraph(raw: Raw): IParagraphBlock | undefined {
  const text: string | undefined = readText(raw.text);
  return text === undefined ? undefined : { type: 'paragraph', text };
}

function readTile(raw: Raw): ITileItem | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const item: ITileItem = { title, tone: readTone(CARD_TONES, raw.tone) ?? DEFAULT_CARD_TONE };
  if (!readActionFields(item, raw)) {
    return undefined;
  }
  setOptional(item, 'kicker', readText(raw.kicker));
  setOptional(item, 'description', readText(raw.description));
  setOptional(item, 'note', readText(raw.note));
  setOptional(item, 'icon', readText(raw.icon));
  return item;
}

function parseTiles(raw: Raw): ITilesBlock | undefined {
  const items: ITileItem[] = readItems(raw.items, readTile);
  if (items.length === 0) {
    return undefined;
  }
  const block: ITilesBlock = { type: 'tiles', items };
  if (readFlag(raw.prominent) === true) {
    block.prominent = true;
  }
  return block;
}

function readCard(raw: Raw): ICardItem | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const item: ICardItem = { title, body: readParagraphs(raw.body), tone: readTone(CARD_TONES, raw.tone) ?? DEFAULT_CARD_TONE };
  setOptional(item, 'kicker', readText(raw.kicker));
  setOptional(item, 'meta', readText(raw.meta));
  readActionFields(item, raw);
  readFactFields(item, raw);
  return item;
}

function parseCards(raw: Raw): ICardsBlock | undefined {
  const items: ICardItem[] = readItems(raw.items, readCard);
  return items.length === 0 ? undefined : { type: 'cards', columns: raw.columns === 3 ? 3 : 2, items };
}

function readLane(raw: Raw): ILaneItem | undefined {
  const tone: LaneTone | undefined = readTone(LANE_TONES, raw.tone);
  const title: string | undefined = readText(raw.title);
  if (tone === undefined || title === undefined) {
    return undefined;
  }
  const item: ILaneItem = { tone, title, body: readParagraphs(raw.body) };
  setOptional(item, 'note', readText(raw.note));
  setOptional(item, 'badge', readText(raw.badge));
  return item;
}

function parseLanes(raw: Raw): ILanesBlock | undefined {
  const items: ILaneItem[] = readItems(raw.items, readLane);
  return items.length === 0 ? undefined : { type: 'lanes', items };
}

function readStatusItem(raw: Raw): IStatusItem | undefined {
  const label: string | undefined = readText(raw.label);
  const text: string | undefined = readText(raw.text);
  if (label === undefined || text === undefined) {
    return undefined;
  }
  const item: IStatusItem = { label, text };
  readActionFields(item, raw);
  readFactFields(item, raw);
  return item;
}

function parseStatusRow(raw: Raw): IStatusRowBlock | undefined {
  const items: IStatusItem[] = readItems(raw.items, readStatusItem);
  return items.length === 0 ? undefined : { type: 'statusRow', items };
}

function readPageLinks(value: unknown): PageLinks {
  const raw: Raw | undefined = asObject(value);
  const pages: PageLinks = {};
  if (raw !== undefined) {
    for (const target of PAGE_TARGETS) {
      const link: string | undefined = readText(raw[target]);
      if (link !== undefined) {
        pages[target as PageTarget] = link;
      }
    }
  }
  return pages;
}

function parsePiece(raw: Raw): IPieceBlock | undefined {
  const piece: PieceKind | undefined = readTone(PIECE_KINDS, raw.piece);
  if (piece === undefined) {
    return undefined;
  }
  const block: IPieceBlock = { type: 'piece', piece, pages: piece === 'home' ? readPageLinks(raw.pages) : {} };
  if (piece === 'telemetry') {
    setOptional(block, 'kicker', readText(raw.kicker));
  }
  return block;
}

function readStatusStripItem(raw: Raw): IStatusStripItem | undefined {
  const label: string | undefined = readText(raw.label);
  const kind: StatusStripItemKind | undefined = raw.kind === undefined ? 'text' : readTone(STATUS_STRIP_ITEM_KINDS, raw.kind);
  const text: string | undefined = readText(raw.text);
  if (label === undefined || kind === undefined || (kind === 'text' && text === undefined)) {
    return undefined;
  }
  const item: IStatusStripItem = { kind, label };
  setOptional(item, 'text', text);
  readActionFields(item, raw);
  readFactFields(item, raw);
  return item;
}

/** The status strip: needs at least one well-formed item; the two texts for the request count fall back to their defaults. */
export function parseStatusStrip(raw: Raw): IStatusStripBlock | undefined {
  const items: IStatusStripItem[] = readItems(raw.items, readStatusStripItem);
  if (items.length === 0) {
    return undefined;
  }
  return {
    type: 'statusStrip',
    items,
    emptyText: readText(raw.emptyText) ?? DEFAULT_STATUS_STRIP_EMPTY_TEXT,
    unavailableText: readText(raw.unavailableText) ?? DEFAULT_STATUS_STRIP_UNAVAILABLE_TEXT
  };
}

/** The work command: needs a prompt; the submit label, the route and the empty-sentence text fall back to their defaults. */
export function parseWorkCommand(raw: Raw): IWorkCommandBlock | undefined {
  const prompt: string | undefined = readText(raw.prompt);
  if (prompt === undefined) {
    return undefined;
  }
  const block: IWorkCommandBlock = {
    type: 'workCommand',
    prompt,
    submitLabel: readText(raw.submitLabel) ?? DEFAULT_WORK_COMMAND_SUBMIT_LABEL,
    route: readText(raw.route) ?? DEFAULT_WORK_COMMAND_ROUTE,
    emptyText: readText(raw.emptyText) ?? DEFAULT_WORK_COMMAND_EMPTY_TEXT
  };
  setOptional(block, 'placeholder', readText(raw.placeholder));
  setOptional(block, 'note', readText(raw.note));
  return block;
}

/** A notice: needs text; the tone falls back to info and the title is optional. */
export function parseNotice(raw: Raw): INoticeBlock | undefined {
  const text: string | undefined = readText(raw.text);
  if (text === undefined) {
    return undefined;
  }
  const block: INoticeBlock = { type: 'notice', tone: readTone(NOTICE_TONES, raw.tone) ?? DEFAULT_NOTICE_TONE, text };
  setOptional(block, 'title', readText(raw.title));
  return block;
}

function readRule(raw: Raw): IRuleItem | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const item: IRuleItem = { title };
  setOptional(item, 'text', readText(raw.text));
  return item;
}

/** Rules: needs at least one titled item; numbered unless `ordered` is a literal false; the title is optional. */
export function parseRules(raw: Raw): IRulesBlock | undefined {
  const items: IRuleItem[] = readItems(raw.items, readRule);
  if (items.length === 0) {
    return undefined;
  }
  const block: IRulesBlock = { type: 'rules', items, ordered: raw.ordered !== false };
  setOptional(block, 'title', readText(raw.title));
  return block;
}

function readSupportRouteItem(raw: Raw): ISupportRouteItem | undefined {
  const issue: string | undefined = readText(raw.issue);
  if (issue === undefined) {
    return undefined;
  }
  const item: ISupportRouteItem = { issue };
  setOptional(item, 'owner', readText(raw.owner));
  setOptional(item, 'action', readText(raw.action));
  const kind: string | undefined = readText(raw.kind);
  if (kind !== undefined && includes(SUPPORT_ROUTE_KINDS, kind as SupportRouteKind)) {
    item.kind = kind as SupportRouteKind;
  }
  return item;
}

/** The support route among the shared footer blocks, if the document has one. */
export function findSupportRoute(blocks: readonly PageBlock[]): ISupportRouteBlock | undefined {
  for (const block of blocks) {
    if (block.type === 'supportRoute') {
      return block;
    }
  }
  return undefined;
}

/** The support route: needs a label; the link, the two lists and the routing rows are optional and rows without an issue are dropped. */
export function parseSupportRoute(raw: Raw): ISupportRouteBlock | undefined {
  const label: string | undefined = readText(raw.label);
  if (label === undefined) {
    return undefined;
  }
  const block: ISupportRouteBlock = {
    type: 'supportRoute',
    label,
    stopWhen: readStringList(raw.stopWhen),
    reportFields: readStringList(raw.reportFields),
    routes: readItems(raw.routes, readSupportRouteItem)
  };
  setOptional(block, 'href', readText(raw.href));
  return block;
}

function readCaseCard(raw: Raw): ICaseCardItem | undefined {
  const id: string | undefined = readText(raw.id);
  const title: string | undefined = readText(raw.title);
  const state: string | undefined = readCanonicalStatus(raw.state);
  if (id === undefined || title === undefined || state === undefined) {
    return undefined;
  }
  const item: ICaseCardItem = { id, title, state };
  setOptional(item, 'description', readText(raw.description));
  setOptional(item, 'historicalStage', readText(raw.historicalStage));
  const health: CaseHealth | undefined = readTone(LANE_TONES, raw.historicalHealth);
  if (health !== undefined) {
    item.historicalHealth = health;
  }
  setOptional(item, 'sourceDate', readIsoDate(raw.sourceDate));
  setOptional(item, 'nextAction', readText(raw.nextAction));
  setOptional(item, 'caption', readText(raw.caption));
  if (readFlag(raw.illustrative) === true) {
    item.illustrative = true;
  }
  // `source` (where a cases list would be read from) is accepted here and left out: no list is read yet.
  return item;
}

/** The case cards: needs at least one item with an id, a title and a canonical status code. */
export function parseCaseCards(raw: Raw): ICaseCardsBlock | undefined {
  const items: ICaseCardItem[] = readItems(raw.items, readCaseCard);
  return items.length === 0 ? undefined : { type: 'caseCards', items };
}

/**
 * Reads one block; undefined for anything that is not a well-formed block of a known type. Any block
 * may name the roles it is written for; a malformed or empty audience is left out, so the block stays
 * a block for everyone rather than one nobody can see.
 */
export function parseBlock(value: unknown): PageBlock | undefined {
  const raw: Raw | undefined = asObject(value);
  if (raw === undefined) {
    return undefined;
  }
  const block: PageBlock | undefined = parseTypedBlock(raw);
  const audience: string[] = readStringList(raw.audience);
  if (block !== undefined && audience.length > 0) {
    block.audience = audience;
  }
  return block;
}

function parseTypedBlock(raw: Raw): PageBlock | undefined {
  switch (raw.type) {
    case 'hero':
      return parseHero(raw);
    case 'heading':
      return parseHeading(raw);
    case 'paragraph':
      return parseParagraph(raw);
    case 'tiles':
      return parseTiles(raw);
    case 'cards':
      return parseCards(raw);
    case 'lanes':
      return parseLanes(raw);
    case 'statusRow':
      return parseStatusRow(raw);
    case 'statusStrip':
      return parseStatusStrip(raw);
    case 'piece':
      return parsePiece(raw);
    case 'workCommand':
      return parseWorkCommand(raw);
    case 'notice':
      return parseNotice(raw);
    case 'rules':
      return parseRules(raw);
    case 'supportRoute':
      return parseSupportRoute(raw);
    case 'caseCards':
      return parseCaseCards(raw);
    default:
      return undefined;
  }
}

/**
 * The shared sections: the footer's blocks read like a page's, less the hero, the piece and the work
 * command, which belong to one page each; anything malformed is left out and a missing footer is empty.
 */
export function parseShared(value: unknown): ISharedSections {
  const raw: Raw | undefined = asObject(value);
  const footer: PageBlock[] = [];
  if (raw !== undefined && Array.isArray(raw.footer)) {
    for (const entry of raw.footer) {
      const block: PageBlock | undefined = parseBlock(entry);
      if (block !== undefined && SHARED_EXCLUDED_BLOCK_TYPES.indexOf(block.type) < 0) {
        footer.push(block);
      }
    }
  }
  return { footer };
}

/** The plane a page names; anything but `operator` is the user plane. */
export function readPlane(value: unknown): PagePlane {
  return readTone(PAGE_PLANES, value) ?? DEFAULT_PAGE_PLANE;
}

/** Role ids written as one id or a list of them; anything else is no requirement at all. */
export function readRoleList(value: unknown): string[] {
  const single: string | undefined = typeof value === 'string' ? readText(value) : undefined;
  return single === undefined ? readStringList(value) : [single];
}

/** The plane of a parsed page (user unless the page says operator). */
export function pagePlane(page: IContentPage): PagePlane {
  return page.plane ?? DEFAULT_PAGE_PLANE;
}

/** Trimmed, non-empty strings of an object, keyed as written; anything else is left out. */
function readStringMap(value: unknown): { [key: string]: string } {
  const raw: Raw | undefined = asObject(value);
  const map: { [key: string]: string } = {};
  if (raw !== undefined) {
    for (const key of ownKeys(raw)) {
      const text: string | undefined = readText(raw[key]);
      if (text !== undefined) {
        map[key] = text;
      }
    }
  }
  return map;
}

/** Only the known keys of a string map. */
function pickKeys<K extends string>(map: { [key: string]: string }, keys: readonly K[]): { [key in K]?: string } {
  const picked: { [key in K]?: string } = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      picked[key] = map[key];
    }
  }
  return picked;
}

function readTruthStateWording(value: unknown): { [key in TruthStateKey]?: ITruthStateWording } {
  const raw: Raw | undefined = asObject(value);
  const wording: { [key in TruthStateKey]?: ITruthStateWording } = {};
  if (raw !== undefined) {
    for (const key of TRUTH_STATE_KEYS) {
      const entry: Raw | undefined = asObject(raw[key]);
      if (entry !== undefined) {
        const item: ITruthStateWording = {};
        setOptional(item, 'label', readText(entry.label));
        setOptional(item, 'definition', readText(entry.definition));
        wording[key] = item;
      }
    }
  }
  return wording;
}

/** The vocabulary section: string maps only, unknown keys ignored, anything malformed left out. */
export function parseVocabulary(value: unknown): IVocabulary {
  const raw: Raw | undefined = asObject(value);
  if (raw === undefined) {
    return { truthStates: {}, requestStatuses: {}, chrome: {}, roles: {}, telemetry: {} };
  }
  return {
    truthStates: readTruthStateWording(raw.truthStates),
    requestStatuses: readStringMap(raw.requestStatuses),
    chrome: pickKeys(readStringMap(raw.chrome), CHROME_LABELS),
    roles: readStringMap(raw.roles),
    telemetry: readStringMap(raw.telemetry)
  };
}

function readBoundedInteger(value: unknown, max: number, fallback: number): number {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 1 && value <= max ? value : fallback;
}

/** The settings section: whole numbers within their bounds, the defaults for anything else. */
export function parseSettings(value: unknown): IDocumentSettings {
  const raw: Raw | undefined = asObject(value);
  return {
    freshnessDays: readBoundedInteger(raw === undefined ? undefined : raw.freshnessDays, MAX_FRESHNESS_DAYS, DEFAULT_SETTINGS.freshnessDays),
    minimumCohort: readBoundedInteger(raw === undefined ? undefined : raw.minimumCohort, MAX_MINIMUM_COHORT, DEFAULT_SETTINGS.minimumCohort)
  };
}

function parsePage(value: unknown): IContentPage | undefined {
  const raw: Raw | undefined = asObject(value);
  const title: string | undefined = raw === undefined ? undefined : readText(raw.title);
  if (raw === undefined || title === undefined || !Array.isArray(raw.blocks)) {
    return undefined;
  }
  const blocks: PageBlock[] = [];
  for (const entry of raw.blocks) {
    const block: PageBlock | undefined = parseBlock(entry);
    if (block !== undefined) {
      blocks.push(block);
    }
  }
  const page: IContentPage = { title, blocks };
  if (readPlane(raw.plane) === 'operator') {
    page.plane = 'operator';
  }
  const requiredRole: string[] = readRoleList(raw.requiredRole);
  if (requiredRole.length > 0) {
    page.requiredRole = requiredRole;
  }
  return page;
}

/**
 * Parses the document text; undefined unless it is a version 1 object with a pages object. The
 * optional `vocabulary`, `settings`, `routes` and `shared` sections are carried when they are objects
 * and dropped (never the document) when they are not.
 */
export function parsePageDocument(text: string): IPageDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const raw: Raw | undefined = asObject(parsed);
  const rawPages: Raw | undefined = raw === undefined ? undefined : asObject(raw.pages);
  if (raw === undefined || raw.version !== PAGE_DOCUMENT_VERSION || rawPages === undefined) {
    return undefined;
  }
  const pages: { [key: string]: IContentPage } = {};
  for (const key of ownKeys(rawPages)) {
    const page: IContentPage | undefined = parsePage(rawPages[key]);
    if (page !== undefined) {
      pages[key] = page;
    }
  }
  const document: IPageDocument = { version: PAGE_DOCUMENT_VERSION, pages };
  if (asObject(raw.settings) !== undefined) {
    document.settings = parseSettings(raw.settings);
  }
  if (asObject(raw.vocabulary) !== undefined) {
    document.vocabulary = parseVocabulary(raw.vocabulary);
  }
  if (asObject(raw.routes) !== undefined) {
    document.routes = parseRoutes(raw.routes);
  }
  if (asObject(raw.shared) !== undefined) {
    document.shared = parseShared(raw.shared);
  }
  return document;
}

/** The configured document path, or the default when blank. */
export function parseContentUrl(value: unknown): string {
  return readText(value) ?? DEFAULT_CONTENT_URL;
}

/** The configured document path as written, trimmed; undefined when blank, so an instance without one reads no document. */
export function parseOptionalContentUrl(value: unknown): string | undefined {
  return readText(value);
}
