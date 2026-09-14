/**
 * Page content: the typed blocks a content page is made of, read from a JSON document in the site's
 * assets (`SiteAssets/ai-coe-pages.json` unless the instance says otherwise). The document is
 * hand-editable, so parsing is strict about the envelope (version and pages) and lenient inside a
 * page: a malformed block or item is dropped and the rest of the page still renders.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { PAGE_TARGETS, resolvePageUrl } from './pageViews';
import type { PageLinks, PageTarget } from './pageViews';

export const PAGE_DOCUMENT_VERSION: number = 1;
export const DEFAULT_CONTENT_URL: string = 'SiteAssets/ai-coe-pages.json';

/** The colour families the service and metric cards already ship. */
export type CardTone = 'teal' | 'blue' | 'violet' | 'gold' | 'cyan';
export const CARD_TONES: readonly CardTone[] = ['teal', 'blue', 'violet', 'gold', 'cyan'];
export const DEFAULT_CARD_TONE: CardTone = 'teal';

/** The traffic-light tones of the request lanes. */
export type LaneTone = 'green' | 'amber' | 'red';
export const LANE_TONES: readonly LaneTone[] = ['green', 'amber', 'red'];

export interface ILinkTarget {
  label: string;
  href: string;
}

export interface IHeroBlock {
  type: 'hero';
  title: string;
  /** The line under the title; in-text markup allowed. */
  text?: string;
  /** Replaces the branding badge when given. */
  badge?: string;
  cta?: ILinkTarget;
}

export interface IHeadingBlock {
  type: 'heading';
  level: 2 | 3;
  text: string;
}

export interface IParagraphBlock {
  type: 'paragraph';
  /** In-text markup allowed. */
  text: string;
}

export interface ITileItem {
  title: string;
  href: string;
  description?: string;
  /** Name of an icon the front door ships; unknown names fall back to the light bulb. */
  icon?: string;
  tone: CardTone;
}

export interface ITilesBlock {
  type: 'tiles';
  items: ITileItem[];
}

export interface ICardItem {
  title: string;
  /** Small line above the title, such as a duration. */
  kicker?: string;
  /** Paragraphs; in-text markup allowed. */
  body: string[];
  /** Emphasised closing line, such as a boundary or a source; in-text markup allowed. */
  meta?: string;
  tone: CardTone;
}

export interface ICardsBlock {
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

export interface ILanesBlock {
  type: 'lanes';
  items: ILaneItem[];
}

export interface IStatusItem {
  label: string;
  /** In-text markup allowed. */
  text: string;
}

export interface IStatusRowBlock {
  type: 'statusRow';
  items: IStatusItem[];
}

/** The two front-door pieces a content page can embed between its blocks. */
export type PieceKind = 'home' | 'telemetry';
export const PIECE_KINDS: readonly PieceKind[] = ['home', 'telemetry'];

export interface IPieceBlock {
  type: 'piece';
  piece: PieceKind;
  /** Where the home tiles lead, as written in the document (site paths or full URLs). */
  pages: PageLinks;
}

export type PageBlock = IHeroBlock | IHeadingBlock | IParagraphBlock | ITilesBlock | ICardsBlock | ILanesBlock | IStatusRowBlock | IPieceBlock;

export interface IContentPage {
  title: string;
  blocks: PageBlock[];
}

export interface IPageDocument {
  version: number;
  pages: { [key: string]: IContentPage };
}

type Raw = { [key: string]: unknown };

function asObject(value: unknown): Raw | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : undefined;
}

/** A trimmed, non-empty string; undefined for anything else. */
function readText(value: unknown): string | undefined {
  const text: string = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

function setOptional<T extends object>(target: T, key: keyof T, value: string | undefined): void {
  if (value !== undefined) {
    (target as { [name: string]: unknown })[key as string] = value;
  }
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

function readItems<T>(value: unknown, readItem: (raw: Raw) => T | undefined): T[] {
  const items: T[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const raw: Raw | undefined = asObject(entry);
      const item: T | undefined = raw === undefined ? undefined : readItem(raw);
      if (item !== undefined) {
        items.push(item);
      }
    }
  }
  return items;
}

function readLinkTarget(value: unknown): ILinkTarget | undefined {
  const raw: Raw | undefined = asObject(value);
  const label: string | undefined = raw === undefined ? undefined : readText(raw.label);
  const href: string | undefined = raw === undefined ? undefined : readText(raw.href);
  return label !== undefined && href !== undefined ? { label, href } : undefined;
}

function parseHero(raw: Raw): IHeroBlock | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const block: IHeroBlock = { type: 'hero', title };
  setOptional(block, 'text', readText(raw.text));
  setOptional(block, 'badge', readText(raw.badge));
  const cta: ILinkTarget | undefined = readLinkTarget(raw.cta);
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
  const href: string | undefined = readText(raw.href);
  if (title === undefined || href === undefined) {
    return undefined;
  }
  const item: ITileItem = { title, href, tone: readTone(CARD_TONES, raw.tone) ?? DEFAULT_CARD_TONE };
  setOptional(item, 'description', readText(raw.description));
  setOptional(item, 'icon', readText(raw.icon));
  return item;
}

function parseTiles(raw: Raw): ITilesBlock | undefined {
  const items: ITileItem[] = readItems(raw.items, readTile);
  return items.length === 0 ? undefined : { type: 'tiles', items };
}

function readCard(raw: Raw): ICardItem | undefined {
  const title: string | undefined = readText(raw.title);
  if (title === undefined) {
    return undefined;
  }
  const item: ICardItem = { title, body: readParagraphs(raw.body), tone: readTone(CARD_TONES, raw.tone) ?? DEFAULT_CARD_TONE };
  setOptional(item, 'kicker', readText(raw.kicker));
  setOptional(item, 'meta', readText(raw.meta));
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
  return label !== undefined && text !== undefined ? { label, text } : undefined;
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
  return { type: 'piece', piece, pages: piece === 'home' ? readPageLinks(raw.pages) : {} };
}

/** Reads one block; undefined for anything that is not a well-formed block of a known type. */
export function parseBlock(value: unknown): PageBlock | undefined {
  const raw: Raw | undefined = asObject(value);
  if (raw === undefined) {
    return undefined;
  }
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
    case 'piece':
      return parsePiece(raw);
    default:
      return undefined;
  }
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
  return { title, blocks };
}

/** Parses the document text; undefined unless it is a version 1 object with a pages object. */
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
  for (const key of Object.keys(rawPages)) {
    const page: IContentPage | undefined = parsePage(rawPages[key]);
    if (page !== undefined) {
      pages[key] = page;
    }
  }
  return { version: PAGE_DOCUMENT_VERSION, pages };
}

/** The configured document path, or the default when blank. */
export function parseContentUrl(value: unknown): string {
  return readText(value) ?? DEFAULT_CONTENT_URL;
}

const PASS_THROUGH: RegExp = /^(#|\?|mailto:|tel:)/i;

/** A link target from the document: site paths resolve against the site; anchors, queries, mail and full URLs pass through. */
export function resolveContentHref(siteUrl: string, href: string): string {
  const text: string = href.trim();
  if (PASS_THROUGH.test(text)) {
    return text;
  }
  return resolvePageUrl(siteUrl, text) ?? '#';
}
