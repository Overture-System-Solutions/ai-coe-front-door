/**
 * Guards the page definition a site owner applies with the PnP script: six navigation pages whose
 * content the web part renders from typed blocks, the form and admin pages, one front-door instance
 * per page, links that resolve, tokens that are declared, blocks the web part's parser accepts, the
 * route table, provider-neutral parameters, and no client or tenant names. The user-plane lints read
 * the rendered text fields: no provider names, no route codes, no hype, no freshness claims without a
 * date, no literal dates outside illustrative items, and no committed "available now" off site.
 * Structure and the lints only; the wording belongs to the page authors.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveAction } from '../webparts/aiCoeFrontDoor/content/actions';
import type { ResolvedAction } from '../webparts/aiCoeFrontDoor/content/actions';
import { HOME_CARDS } from '../webparts/aiCoeFrontDoor/content/homeCards';
import { CARD_TONES, DEFAULT_CONTENT_URL, LANE_TONES, parsePageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { ICaseCardsBlock, IPageDocument, ITilesBlock, IStatusRowBlock, IWorkCommandBlock } from '../webparts/aiCoeFrontDoor/content/pageContent';
import { FRONT_DOOR_VIEWS, PAGE_TARGETS } from '../webparts/aiCoeFrontDoor/content/pageViews';
import { resolveRoute } from '../webparts/aiCoeFrontDoor/content/routes';
import type { IResolvedRoute, RouteTable } from '../webparts/aiCoeFrontDoor/content/routes';
import { CANONICAL_STATUS } from '../webparts/aiCoeFrontDoor/content/truthStates';
import { WORKFLOW_ORDER } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import * as icons from '../webparts/aiCoeFrontDoor/icons';
import type { WorkflowId } from '../webparts/aiCoeFrontDoor/workflows/types';
import { findTenantWords, PROVISIONING_SCAN, readTenantWords } from './tenantWords';
import type { ITenantWords } from './tenantWords';

interface IParameter {
  /** `text` must be filled; `url` may be blank and fails closed; `optional` may be blank and takes its `default`. */
  kind: 'text' | 'url' | 'optional';
  description: string;
  /** Substituted when an `optional` parameter is blank; the other kinds may not declare one. */
  default?: string;
}

interface INavigationEntry {
  title: string;
  page: string;
  children?: INavigationEntry[];
}

interface IRawBlock {
  type: string;
  /** Name of a parameter; the script drops the block when that parameter is blank (the pilot notice). */
  skipWhenBlank?: string;
  [field: string]: unknown;
}

interface IRawItem {
  [field: string]: unknown;
}

interface IPage {
  key: string;
  title: string;
  file: string;
  commentsEnabled: boolean;
  permissions: string;
  instance: { [name: string]: string };
  blocks?: IRawBlock[];
  plane?: string;
}

interface IPagesDefinition {
  componentId: string;
  contentFile: string;
  parameters: { [name: string]: IParameter };
  navigation: INavigationEntry[];
  pages: IPage[];
  /** The route table the script copies into the document once the tokens are resolved. */
  routes: { [key: string]: IRawItem };
  /** The shared sections (the footer below every page view), resolved like the blocks. */
  shared: { footer: IRawBlock[] };
  /** Label and definition overrides the script copies as written: their {role} and {organization} tokens belong to the renderer. */
  vocabulary?: { [key: string]: unknown };
  /** Freshness and cohort settings, copied as written like the vocabulary. */
  settings?: { [key: string]: unknown };
}

/** The sections the script copies without the token pass, and the token check therefore leaves out. */
const VERBATIM_SECTIONS: ('vocabulary' | 'settings')[] = ['vocabulary', 'settings'];

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const SITE_URL: string = 'https://example.invalid/sites/ai';
const NAVIGATION_PAGES: string[] = ['startHere', 'learn', 'useAi', 'requests', 'prompts', 'status'];
const PIECE_PAGES: string[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'admin'];
const BLOCK_TYPES: string[] = ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece', 'workCommand', 'notice', 'rules', 'supportRoute', 'caseCards'];
const EXPECTED_BLOCKS: { [key: string]: string[] } = {
  startHere: ['hero', 'workCommand', 'tiles', 'statusRow', 'heading', 'rules', 'notice', 'notice', 'heading', 'cards'],
  learn: ['paragraph', 'paragraph', 'paragraph', 'rules', 'cards', 'cards', 'heading', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'heading', 'paragraph', 'paragraph'],
  useAi: ['paragraph', 'paragraph', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'paragraph', 'paragraph'],
  requests: ['heading', 'paragraph', 'paragraph', 'heading', 'lanes', 'cards', 'notice', 'heading', 'paragraph', 'piece'],
  prompts: ['paragraph', 'paragraph', 'heading', 'cards', 'cards'],
  // The one illustrative case card sits right after the opening line (decision 14); step 18 adds the my-work piece before it.
  status: ['paragraph', 'caseCards', 'cards', 'piece', 'cards']
};
/** The route keys the first screen and the status items point at; the two off-site ones take their proof from parameters. */
const ROUTE_KEYS: string[] = ['work', 'assistant', 'guidedIntake', 'improve', 'value'];
const OFF_SITE_ROUTES: string[] = ['work', 'assistant'];
const ON_SITE_ROUTES: string[] = ['guidedIntake', 'improve', 'value'];
/** Every parameter the definition declares, by kind (Contracts § pages.json parameters). */
const EXPECTED_PARAMETERS: { [kind: string]: string[] } = {
  text: ['OrganizationName', 'TelemetryProvider', 'AssistantName', 'ChatName', 'StatusDate', 'PromptCount', 'PromptsAddedCount', 'PromptsAddedDate', 'PromptTestRecordCount', 'PromptStatusCounts', 'PromptIdAdminQueue', 'PromptIdMorningBrief', 'PromptIdRepeatableWork', 'LeadTeamContinuation'],
  url: ['DraftServiceUrl', 'AssistantUrl', 'ChatUrl', 'WorkCommandUrl', 'SupportUrl', 'TeamsUrl', 'PromptLibraryUrl'],
  // PilotMembers is optional (a 1.0.0.12 verifier finding): it feeds only the private-pilot notice, which the script drops when PilotTeamName is blank.
  optional: ['AssistantState', 'AssistantVerifiedDate', 'AssistantReceiptRef', 'WorkCommandState', 'WorkCommandVerifiedDate', 'WorkCommandReceiptRef', 'SupportOwnerLabel', 'IdentityOwnerLabel', 'PrivacyOwnerLabel', 'BusinessApproverLabel', 'ClaimsOwnerLabel', 'RecoveryOwnerLabel', 'GovernanceBodyFastPath', 'GovernanceBodyArchitecture', 'GovernanceBodyExecutive', 'PilotTeamName', 'PilotMembers', 'GovernanceReference', 'ReviewSystemName']
};
/** The Branding properties the script writes on every instance from a parameter (Contracts § Property pane; decision 21). */
const INSTANCE_BRANDING_TOKENS: { [property: string]: string } = { organizationName: '{OrganizationName}', governanceReference: '{GovernanceReference}', reviewSystemName: '{ReviewSystemName}' };
const REMOVED_PARAMETERS: string[] = ['ConciergeUrl', 'CopilotChatUrl', 'ConciergeSourceCount', 'ConciergeNewestSourceDate', 'VerifiedDate'];
const LINK_TARGET: RegExp = /\]\(([^)\s]*)\)/g;

/** The fields the user plane renders as text; everything else on an item (state, route, href, icon, tone, ...) is a code. */
const USER_PLANE_FIELDS: string[] = ['title', 'text', 'body', 'note', 'meta', 'kicker', 'label', 'description', 'prompt', 'placeholder', 'submitLabel', 'emptyText', 'unavailableText', 'caption', 'nextAction', 'historicalStage', 'stopWhen', 'reportFields', 'issue', 'action'];
/** The fields a freshness claim ("live", "running", "answering") needs a date on; a title such as "What is running" passes. */
const FRESHNESS_FIELDS: string[] = ['text', 'body', 'meta'];
const PROVIDER_WORDS: RegExp = /concierge|copilot|claude|chatgpt|work iq|openai|gemini/i;
const UPPER_SNAKE_CODE: RegExp = /\b[A-Z]{2,}(?:_[A-Z]+)+\b/;
const ENGINEERING_WORDS: RegExp = /\b(connected|connector|lease|automation level)\b/i;
const HYPE: RegExp = /transform|unlock|revolutioni[sz]e|best in class|fully autonomous|enterprise-wide|guaranteed|eliminates risk/i;
const FRESHNESS_WORDS: RegExp = /\b(live|running|answering)\b/i;
const LITERAL_ISO_DATE: RegExp = /\b20\d\d-\d\d-\d\d\b/;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '')) as T;
}

const definitionText: string = fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8');
const definition: IPagesDefinition = JSON.parse(definitionText) as IPagesDefinition;
const tenantWords: ITenantWords = readTenantWords(ROOT);
const manifest: { id: string; preconfiguredEntries: { properties: { [name: string]: unknown } }[] } = readJson(
  path.join(ROOT, 'src/webparts/aiCoeFrontDoor/AiCoeFrontDoorWebPart.manifest.json')
);
const manifestKeys: string[] = Object.keys(manifest.preconfiguredEntries[0].properties);
const pageKeys: string[] = definition.pages.map((page: IPage): string => page.key);
const pageFiles: string[] = definition.pages.map((page: IPage): string => page.file);
const iconNames: string[] = Object.keys(icons);

function page(key: string): IPage {
  const found: IPage | undefined = definition.pages.filter((candidate: IPage): boolean => candidate.key === key)[0];
  if (found === undefined) {
    throw new Error(`No page with key "${key}".`);
  }
  return found;
}

function blocksOf(key: string): IRawBlock[] {
  return page(key).blocks ?? [];
}

function itemsOf(block: IRawBlock): IRawItem[] {
  return (block.items ?? []) as IRawItem[];
}

function blockOf(key: string, type: string, nth: number = 0): IRawBlock {
  const found: IRawBlock | undefined = blocksOf(key).filter((block: IRawBlock): boolean => block.type === type)[nth];
  if (found === undefined) {
    throw new Error(`Page "${key}" has no ${type} block number ${nth}.`);
  }
  return found;
}

/** Every string anywhere in a value, depth first. */
function stringsIn(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      stringsIn(entry, into);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      stringsIn((value as { [key: string]: unknown })[key], into);
    }
  }
  return into;
}

/** Every link target in the blocks: tile hrefs (an item that names a route has none), calls to action, the home piece's pages and in-text links. */
function linkTargets(): string[] {
  const targets: string[] = [];
  for (const key of NAVIGATION_PAGES) {
    for (const block of blocksOf(key)) {
      if (block.type === 'tiles') {
        for (const item of itemsOf(block)) {
          if (item.route === undefined) {
            targets.push(String(item.href));
          }
        }
      }
      if (block.type === 'hero' && block.cta !== undefined && (block.cta as IRawItem).route === undefined) {
        targets.push(String((block.cta as { href: unknown }).href));
      }
      if (block.type === 'piece' && block.pages !== undefined) {
        targets.push(...stringsIn(block.pages).filter((value: string): boolean => value !== ''));
      }
      for (const text of stringsIn(block)) {
        let match: RegExpExecArray | null = LINK_TARGET.exec(text);
        while (match !== null) {
          targets.push(match[1]);
          match = LINK_TARGET.exec(text);
        }
      }
    }
  }
  return targets;
}

function expectLinkTarget(target: string): void {
  const match: RegExpExecArray | null = /^\{(Page|Url):([A-Za-z]+)\}$/.exec(target);
  expect(match).not.toBeNull();
  const [, kind, name] = match as RegExpExecArray;
  if (kind === 'Page') {
    expect(pageKeys).toContain(name);
    expect(name).not.toBe('admin');
  } else {
    expect(definition.parameters[name]?.kind).toBe('url');
  }
}

/** Every token in a text, in order: `{First}` or `{First:Second}`. */
function tokensIn(text: string): { first: string; second?: string }[] {
  const found: { first: string; second?: string }[] = [];
  // A fresh expression per call, so one scan's position never leaks into the next.
  const pattern: RegExp = /\{([A-Za-z]+)(?::([A-Za-z]+))?\}/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    found.push({ first: match[1], second: match[2] });
    match = pattern.exec(text);
  }
  return found;
}

/** The definition as the token check reads it: everything but the sections the script copies as written. */
function tokenScannedText(source: IPagesDefinition): string {
  const copy: IPagesDefinition = { ...source };
  for (const section of VERBATIM_SECTIONS) {
    delete copy[section];
  }
  return JSON.stringify(copy);
}

/** What a run substitutes for a plain token: a filled value for text; the given value, else the declared default, else nothing, for optional. */
function parameterValue(name: string, optionalValues: { [name: string]: string }): string {
  const parameter: IParameter | undefined = definition.parameters[name];
  if (parameter !== undefined && parameter.kind === 'optional') {
    return optionalValues[name] ?? parameter.default ?? '';
  }
  return 'value';
}

/** The script's token pass over one JSON-serialised node: in-text links, page links, URL parameters, then plain tokens. */
function resolveTokens(text: string, urlValues: { [name: string]: string }, optionalValues: { [name: string]: string }): string {
  return text
    .replace(/\[([^[\]]+)\]\(\{Url:([A-Za-z]+)\}\)/g, (whole: string, label: string, name: string): string => (urlValues[name] ? whole : label))
    .replace(/\{Page:([A-Za-z]+)\}/g, (whole: string, name: string): string => `${SITE_URL}/SitePages/${page(name).file}`)
    .replace(/\{Url:([A-Za-z]+)\}/g, (whole: string, name: string): string => urlValues[name] ?? '')
    .replace(/\{([A-Za-z]+)\}/g, (whole: string, name: string): string => parameterValue(name, optionalValues));
}

/** A tile or call to action whose link resolved to nothing and that names neither a state nor a route is shown as closed. */
function closeWhenUnlinked(item: IRawItem): IRawItem {
  return item.href === '' && item.state === undefined && item.route === undefined ? { ...item, state: 'needsAccess' } : item;
}

/** True when the script keeps the block: it names no parameter in `skipWhenBlank`, or the one it names has a value. */
function isKept(block: IRawBlock, optionalValues: { [name: string]: string }): boolean {
  return block.skipWhenBlank === undefined || parameterValue(block.skipWhenBlank, optionalValues) !== '';
}

/** The block types a page renders in a run: the source order, less the blocks the script drops for a blank parameter. */
function renderedTypes(key: string, optionalValues: { [name: string]: string }): string[] {
  return blocksOf(key)
    .filter((block: IRawBlock): boolean => isKept(block, optionalValues))
    .map((block: IRawBlock): string => block.type);
}

/**
 * What the script does to the definition before uploading it: page links become URLs, URL parameters
 * are filled or, when blank, dropped from in-text links; a tile or call to action whose link is blank
 * is kept and marked `needsAccess` so the page shows it as closed; a block whose `skipWhenBlank`
 * parameter is blank is dropped. Text tokens become values. The route table and the shared sections go
 * through the same token pass.
 */
function resolveDocument(urlValues: { [name: string]: string }, optionalValues: { [name: string]: string } = {}): string {
  const pages: { [key: string]: unknown } = {};
  for (const key of NAVIGATION_PAGES) {
    const kept: IRawBlock[] = blocksOf(key)
      .filter((block: IRawBlock): boolean => isKept(block, optionalValues))
      .map((block: IRawBlock): IRawBlock => {
        const copy: IRawBlock = { ...block };
        delete copy.skipWhenBlank;
        return copy;
      });
    const resolved: string = resolveTokens(JSON.stringify({ title: page(key).title, blocks: kept }), urlValues, optionalValues);
    const parsedPage: { title: string; blocks: IRawBlock[] } = JSON.parse(resolved) as { title: string; blocks: IRawBlock[] };
    parsedPage.blocks = parsedPage.blocks.map((block: IRawBlock): IRawBlock => {
      if (block.type === 'tiles') {
        return { ...block, items: itemsOf(block).map(closeWhenUnlinked) };
      }
      if (block.type === 'hero' && block.cta !== undefined) {
        return { ...block, cta: closeWhenUnlinked(block.cta as IRawItem) };
      }
      return block;
    });
    pages[key] = parsedPage;
  }
  const document: { [key: string]: unknown } = { version: 1, pages };
  document.routes = JSON.parse(resolveTokens(JSON.stringify(definition.routes), urlValues, optionalValues));
  document.shared = JSON.parse(resolveTokens(JSON.stringify(definition.shared), urlValues, optionalValues));
  for (const section of VERBATIM_SECTIONS) {
    if (definition[section] !== undefined) {
      document[section] = definition[section];
    }
  }
  return JSON.stringify(document);
}

/** One rendered text of the user plane, with what its item says about its age and whether it is an example. */
interface IUserPlaneText {
  where: string;
  field: string;
  text: string;
  asOf: boolean;
  illustrative: boolean;
}

/** Every user-plane text field under a node, depth first; codes (state, route, href, icon, tone, type, ...) are not texts. */
function collectUserPlane(node: unknown, where: string, into: IUserPlaneText[], asOf: boolean = false, illustrative: boolean = false): IUserPlaneText[] {
  if (Array.isArray(node)) {
    node.forEach((entry: unknown, index: number): void => {
      collectUserPlane(entry, `${where}[${index}]`, into, asOf, illustrative);
    });
    return into;
  }
  if (node === null || typeof node !== 'object') {
    return into;
  }
  const raw: { [key: string]: unknown } = node as { [key: string]: unknown };
  const itemAsOf: boolean = asOf || raw.asOf !== undefined;
  const itemIllustrative: boolean = illustrative || raw.illustrative === true;
  for (const key of Object.keys(raw)) {
    const value: unknown = raw[key];
    if (USER_PLANE_FIELDS.indexOf(key) >= 0) {
      for (const text of stringsIn(value)) {
        into.push({ where: `${where}.${key}`, field: key, text, asOf: itemAsOf, illustrative: itemIllustrative });
      }
    } else if (typeof value === 'object') {
      collectUserPlane(value, `${where}.${key}`, into, itemAsOf, itemIllustrative);
    }
  }
  return into;
}

/** The texts the user plane renders: every page whose plane is not `operator`, the shared footer and the route table. */
function userPlaneTexts(): IUserPlaneText[] {
  const texts: IUserPlaneText[] = [];
  for (const key of NAVIGATION_PAGES) {
    if (page(key).plane !== 'operator') {
      collectUserPlane(blocksOf(key), key, texts);
    }
  }
  collectUserPlane(definition.shared.footer, 'shared.footer', texts);
  collectUserPlane(definition.routes, 'routes', texts);
  return texts;
}

/** The offending texts for one lint, empty when the lint passes. */
function offending(texts: IUserPlaneText[], test: (entry: IUserPlaneText) => boolean): string[] {
  return texts.filter(test).map((entry: IUserPlaneText): string => `${entry.where}: ${entry.text}`);
}

/** True when a link target the script would leave in the document stays on this site: a page link or a site path. */
function isOnSite(href: unknown): boolean {
  return typeof href === 'string' && (/^\{Page:[A-Za-z]+\}$/.test(href) || (href.charAt(0) === '/' && href.substring(0, 2) !== '//'));
}

/** Every item that may carry an action or a state: route rows, tiles, calls to action, status items and cards. */
function actionItems(): { where: string; item: IRawItem; kind: 'route' | 'action' | 'fact' }[] {
  const found: { where: string; item: IRawItem; kind: 'route' | 'action' | 'fact' }[] = [];
  for (const key of Object.keys(definition.routes)) {
    found.push({ where: `routes.${key}`, item: definition.routes[key], kind: 'route' });
  }
  for (const key of NAVIGATION_PAGES) {
    blocksOf(key).forEach((block: IRawBlock, index: number): void => {
      const where: string = `${key}[${index}]`;
      if (block.type === 'tiles') {
        itemsOf(block).forEach((item: IRawItem, nth: number): void => {
          found.push({ where: `${where}.items[${nth}]`, item, kind: 'action' });
        });
      }
      if (block.type === 'hero' && block.cta !== undefined) {
        found.push({ where: `${where}.cta`, item: block.cta as IRawItem, kind: 'action' });
      }
      if (block.type === 'statusRow' || block.type === 'cards') {
        itemsOf(block).forEach((item: IRawItem, nth: number): void => {
          found.push({ where: `${where}.items[${nth}]`, item, kind: 'fact' });
        });
      }
    });
  }
  return found;
}

describe('front door page definition', () => {
  it('targets the web part of this package and names the content document', () => {
    expect(definition.componentId).toBe(manifest.id);
    expect(definition.componentId).toBe('cf2e5904-0703-4fe4-ae5a-ec012d6fa689');
    expect(`SiteAssets/${definition.contentFile}`).toBe(DEFAULT_CONTENT_URL);
  });

  it('mirrors the six navigation pages in order', () => {
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.title)).toEqual(['Start here', 'Learn', 'Use AI', 'Requests', 'Prompts', 'Status']);
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.page)).toEqual(NAVIGATION_PAGES);
    for (const entry of definition.navigation) {
      expect(pageKeys).toContain(entry.page);
    }
  });

  it('lists the five form pages under Requests in home-card order', () => {
    const withChildren: INavigationEntry[] = definition.navigation.filter((entry: INavigationEntry): boolean => entry.children !== undefined);
    expect(withChildren.map((entry: INavigationEntry): string => entry.page)).toEqual(['requests']);
    const children: INavigationEntry[] = withChildren[0].children as INavigationEntry[];
    expect(children.map((child: INavigationEntry): string => child.page)).toEqual(WORKFLOW_ORDER);
    expect(children.map((child: INavigationEntry): string => child.title)).toEqual(WORKFLOW_ORDER.map((id: WorkflowId): string => HOME_CARDS[id].title));
  });

  it('defines twelve pages with unique keys and files, one instance each', () => {
    expect(definition.pages).toHaveLength(12);
    expect(new Set(pageKeys).size).toBe(12);
    expect(new Set(pageFiles).size).toBe(12);
    expect(pageKeys.slice().sort()).toEqual([...NAVIGATION_PAGES, ...PIECE_PAGES].sort());
    for (const target of definition.pages) {
      expect(target.file).toMatch(/^[A-Za-z0-9-]+\.aspx$/);
      expect(target.title.length).toBeGreaterThan(0);
      expect(typeof target.commentsEnabled).toBe('boolean');
      expect(['inherit', 'owners']).toContain(target.permissions);
      expect(typeof target.instance).toBe('object');
      expect((target as { sections?: unknown }).sections).toBeUndefined();
    }
    for (const id of WORKFLOW_ORDER) {
      expect(page(id).title).toBe(HOME_CARDS[id].title);
    }
  });

  it('renders the six navigation pages as content pages of the shared document', () => {
    for (const key of NAVIGATION_PAGES) {
      const instance: { [name: string]: string } = page(key).instance;
      expect(instance.view).toBe('page');
      expect(instance.pageKey).toBe(key);
      expect(instance.contentUrl).toBe(DEFAULT_CONTENT_URL);
      expect(instance.layout).toBe('wide');
      expect(instance.organizationName).toBe('{OrganizationName}');
      expect(instance.telemetryProvider).toBe(key === 'status' ? '{TelemetryProvider}' : undefined);
      expect(blocksOf(key).length).toBeGreaterThan(0);
    }
    for (const key of PIECE_PAGES) {
      expect(page(key).blocks).toBeUndefined();
    }
  });

  it('gives every piece page its workflow or dashboard, returning to Requests', () => {
    for (const key of PIECE_PAGES) {
      const instance: { [name: string]: string } = page(key).instance;
      expect(FRONT_DOOR_VIEWS).toContain(instance.view);
      expect(instance.view).toBe(key);
      expect(instance.layout).toBe('wide');
      expect(instance.returnUrl).toBe('SitePages/Requests.aspx');
      expect(instance.organizationName).toBe('{OrganizationName}');
      expect(instance.draftServiceUrl).toBe(key === 'idea' ? '{DraftServiceUrl}' : undefined);
      // The five form pages read the document for the shared footer below the wizard; the admin page does not.
      expect(instance.contentUrl).toBe(WORKFLOW_ORDER.indexOf(key as WorkflowId) >= 0 ? DEFAULT_CONTENT_URL : undefined);
    }
    for (const target of definition.pages) {
      for (const name of Object.keys(target.instance)) {
        expect(manifestKeys).toContain(name);
      }
      // Every instance carries the Branding properties as tokens, so one parameter file brands every page the same way.
      for (const property of Object.keys(INSTANCE_BRANDING_TOKENS)) {
        expect({ page: target.key, property, token: target.instance[property] }).toEqual({ page: target.key, property, token: INSTANCE_BRANDING_TOKENS[property] });
      }
    }
  });

  it('lays out each navigation page as the plan describes', () => {
    for (const key of NAVIGATION_PAGES) {
      expect(blocksOf(key).map((block: IRawBlock): string => block.type)).toEqual(EXPECTED_BLOCKS[key]);
      for (const block of blocksOf(key)) {
        expect(BLOCK_TYPES).toContain(block.type);
        if (block.type === 'heading') {
          expect([2, 3]).toContain(block.level);
        }
        if (block.type === 'cards') {
          expect([2, 3]).toContain(block.columns);
          expect(itemsOf(block)).toHaveLength(block.columns as number);
          for (const item of itemsOf(block)) {
            expect(CARD_TONES).toContain(item.tone);
            expect(Array.isArray(item.body)).toBe(true);
          }
        }
        if (block.type === 'lanes') {
          expect(itemsOf(block).map((item: IRawItem): unknown => item.tone)).toEqual(LANE_TONES);
        }
        if (block.type === 'tiles') {
          expect(itemsOf(block)).toHaveLength(3);
          for (const item of itemsOf(block)) {
            expect(iconNames).toContain(item.icon);
            expect(CARD_TONES).toContain(item.tone);
          }
        }
        if (block.type === 'rules') {
          expect(itemsOf(block).length).toBeGreaterThan(0);
          for (const item of itemsOf(block)) {
            expect(typeof item.title).toBe('string');
          }
        }
        if (block.type === 'notice') {
          expect(['info', 'caution']).toContain(block.tone);
          expect(typeof block.text).toBe('string');
        }
        if (block.type === 'caseCards') {
          expect(itemsOf(block).length).toBeGreaterThan(0);
          for (const item of itemsOf(block)) {
            expect(typeof item.id).toBe('string');
            expect(typeof item.title).toBe('string');
            expect(CANONICAL_STATUS).toContain(item.state);
            if (item.historicalHealth !== undefined) {
              expect(LANE_TONES).toContain(item.historicalHealth);
            }
            // Every case card is an example or says when its source was last read: no case is shown without a date (decision 14).
            expect({ id: item.id, dated: item.illustrative === true || typeof item.sourceDate === 'string' }).toEqual({ id: item.id, dated: true });
          }
        }
      }
    }
  });

  it('shows one illustrative case card on Status, labelled as an example, with its state out of the user-plane lint (decision 14)', () => {
    const cases: IRawBlock = blockOf('status', 'caseCards');
    expect(blocksOf('status')[1]).toBe(cases);
    expect(itemsOf(cases)).toHaveLength(1);
    expect(itemsOf(cases)[0]).toEqual({
      id: 'EXAMPLE-01',
      title: 'Example case: a proof-of-value programme',
      description: 'Shows how a case looks when its latest evidence is older than the freshness threshold.',
      state: 'AWAITING_SOURCE',
      historicalStage: 'Validate',
      historicalHealth: 'amber',
      sourceDate: '2026-08-28',
      nextAction: 'Read the latest authoritative source before updating the case.',
      caption: 'Do not infer progress',
      illustrative: true
    });
    // `state` is a code, not a text: the UPPER_SNAKE lint never reads it, while the same code in a description is caught.
    const probe: IUserPlaneText[] = collectUserPlane([{ type: 'caseCards', items: [{ id: 'X', title: 'x', state: 'AWAITING_SOURCE', description: 'y', historicalStage: 'Validate' }] }], 'probe', []);
    expect(probe.map((entry: IUserPlaneText): string => entry.field).sort()).toEqual(['description', 'historicalStage', 'title']);
    expect(offending(probe, (entry: IUserPlaneText): boolean => UPPER_SNAKE_CODE.test(entry.text))).toEqual([]);
    const leak: IUserPlaneText[] = collectUserPlane([{ type: 'caseCards', items: [{ id: 'X', title: 'x', state: 'DRAFT', description: 'Now AWAITING_SOURCE.' }] }], 'probe', []);
    expect(offending(leak, (entry: IUserPlaneText): boolean => UPPER_SNAKE_CODE.test(entry.text))).toHaveLength(1);
    // The parsed document keeps the card with its example flag and its dated source, so the page draws the example pill and never a current fact.
    const document: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    const parsed: ICaseCardsBlock = document.pages.status.blocks[1] as ICaseCardsBlock;
    expect(parsed.type).toBe('caseCards');
    expect(parsed.items).toEqual([itemsOf(cases)[0]]);
  });

  it('opens Start here with the operating promise, the work command and the three action paths', () => {
    const hero: IRawBlock = blocksOf('startHere')[0];
    expect(hero.title).toBe('Start with the work you need done.');
    expect(hero.text).toBe('The AI CoE helps you finish it safely, improve it or route it to the right person.');
    // The work command is the first screen's one primary control; the hero carries no call to action (decision 20).
    expect(hero.cta).toBeUndefined();
    const command: IRawBlock = blockOf('startHere', 'workCommand');
    expect(command.prompt).toBe('What do you need done?');
    expect(command.route).toBe('work');
    expect(command.submitLabel).toBe('Start');
    expect(typeof command.placeholder).toBe('string');
    expect(typeof command.note).toBe('string');
    const tiles: IRawBlock = blockOf('startHere', 'tiles');
    expect(tiles.prominent).toBe(true);
    expect(itemsOf(tiles).map((item: IRawItem): unknown => item.kicker)).toEqual(['01 · Work', '02 · Improve', '03 · Value']);
    expect(itemsOf(tiles).map((item: IRawItem): unknown => item.title)).toEqual(['Get my work done', 'Run / improve the business', 'Review enterprise AI value']);
    expect(itemsOf(tiles).map((item: IRawItem): unknown => item.route)).toEqual(['work', 'improve', 'value']);
    for (const item of itemsOf(tiles)) {
      expect(item.href).toBeUndefined();
      expect(typeof item.description).toBe('string');
    }
    const statusRow: IRawBlock = blockOf('startHere', 'statusRow');
    expect(itemsOf(statusRow).map((item: IRawItem): unknown => item.label)).toEqual(['{AssistantName}', 'Requests']);
    expect(itemsOf(statusRow)[0].route).toBe('assistant');
    expect(itemsOf(statusRow)[0].asOf).toBe('{AssistantVerifiedDate}');
    expect(itemsOf(statusRow)[0].source).toBe('AI CoE check');
    expect(itemsOf(statusRow)[1].state).toBe('availableNow');
    expect(itemsOf(statusRow)[1].href).toBeUndefined();
    expect(itemsOf(statusRow)[1].route).toBeUndefined();
    // The three rules, verbatim from the quick start, numbered.
    const rules: IRawBlock = blockOf('startHere', 'rules');
    expect(rules.ordered).toBeUndefined();
    expect(itemsOf(rules).map((item: IRawItem): unknown => item.title)).toEqual(['Use only information you are allowed to use.', 'Check the result.', 'People send and approve.']);
    expect(blocksOf('startHere')[4].text).toBe('Three rules');
    // The data boundary is unconditional; the pilot notice is keyed by the pilot team name.
    const boundary: IRawBlock = blockOf('startHere', 'notice', 0);
    const pilot: IRawBlock = blockOf('startHere', 'notice', 1);
    expect(boundary.tone).toBe('caution');
    expect(boundary.title).toBe('Data boundary');
    expect(boundary.skipWhenBlank).toBeUndefined();
    expect(pilot.tone).toBe('caution');
    expect(pilot.title).toBe('Private pilot');
    expect(pilot.skipWhenBlank).toBe('PilotTeamName');
    expect(pilot.text).toContain('{PilotTeamName}');
    expect(pilot.text).toContain('{PilotMembers}');
    expect(definition.parameters.PilotTeamName.kind).toBe('optional');
    expect(definition.parameters.PilotMembers.kind).toBe('optional');
    // Blank members take a default, so the notice never reads "tried by <team>: ." with a dangling colon.
    expect(definition.parameters.PilotMembers.default).toBe('the named pilot members');
    expect(String(pilot.text).replace('{PilotTeamName}', 'a team').replace('{PilotMembers}', String(definition.parameters.PilotMembers.default)))
      .toMatch(/^This front door is being tried by a team: the named pilot members\. Something wrong/);
    // The Requests page repeats the boundary word for word.
    expect(blockOf('requests', 'notice').text).toBe(boundary.text);
    expect(blockOf('requests', 'notice').title).toBe('Data boundary');
    // Learn's orientation list is unnumbered; nothing else names a parameter to skip on.
    expect(blockOf('learn', 'rules').ordered).toBe(false);
    expect(itemsOf(blockOf('learn', 'rules'))).toHaveLength(4);
    for (const key of NAVIGATION_PAGES) {
      for (const block of blocksOf(key)) {
        if (block.skipWhenBlank !== undefined) {
          expect(block).toBe(pilot);
        }
      }
    }
  });

  it('declares the five routes with the on-site rows open by content and the off-site rows proved by parameters', () => {
    expect(Object.keys(definition.routes).sort()).toEqual(ROUTE_KEYS.slice().sort());
    expect(definition.routes.guidedIntake).toEqual({ label: 'Use the guided request instead', href: '{Page:idea}', state: 'availableNow' });
    expect(definition.routes.improve).toEqual({ label: 'Start a request', href: '{Page:requests}', state: 'availableNow' });
    expect(definition.routes.value).toEqual({ label: 'See what has been measured', href: '{Page:status}', state: 'availableNow' });
    expect(definition.routes.work).toMatchObject({ label: 'Start', href: '{Url:WorkCommandUrl}', state: '{WorkCommandState}', verifiedOn: '{WorkCommandVerifiedDate}', receiptRef: '{WorkCommandReceiptRef}', fallback: 'guidedIntake' });
    expect(definition.routes.assistant).toMatchObject({ label: 'Ask {AssistantName}', href: '{Url:AssistantUrl}', state: '{AssistantState}', verifiedOn: '{AssistantVerifiedDate}', receiptRef: '{AssistantReceiptRef}', fallback: 'guidedIntake' });
    for (const key of OFF_SITE_ROUTES) {
      expect(typeof definition.routes[key].note).toBe('string');
      expect(definition.routes[key].note).toContain('new tab');
    }
    expect(definition.routes.work.note).toContain('Nothing is sent or changed');
  });

  it('commits "available now" only where this site is the destination: a page link or a site path (decision 3)', () => {
    for (const entry of actionItems()) {
      const state: unknown = entry.item.state;
      if (state !== 'availableNow') {
        // A state token is filled from a parameter after tenant proof; a literal code other than availableNow is not a claim of availability.
        continue;
      }
      if (entry.kind === 'route' || entry.kind === 'action' || entry.item.href !== undefined) {
        expect({ where: entry.where, onSite: isOnSite(entry.item.href) }).toEqual({ where: entry.where, onSite: true });
      }
    }
    // The two off-site rows carry no literal state at all: state, date and receipt are parameters.
    for (const key of OFF_SITE_ROUTES) {
      expect(String(definition.routes[key].state)).toMatch(/^\{[A-Za-z]+\}$/);
      expect(definition.parameters[String(definition.routes[key].state).slice(1, -1)].kind).toBe('optional');
      expect(definition.parameters[String(definition.routes[key].verifiedOn).slice(1, -1)].kind).toBe('optional');
      expect(definition.parameters[String(definition.routes[key].receiptRef).slice(1, -1)].kind).toBe('optional');
      expect(String(definition.routes[key].href)).toMatch(/^\{Url:[A-Za-z]+\}$/);
    }
    for (const key of ON_SITE_ROUTES) {
      expect(definition.routes[key].state).toBe('availableNow');
      expect(definition.routes[key].verifiedOn).toBeUndefined();
      expect(definition.routes[key].receiptRef).toBeUndefined();
    }
  });

  it('shares one support route below every page view with the five stop clauses and the six owners', () => {
    expect(definition.shared.footer).toHaveLength(1);
    const support: IRawBlock = definition.shared.footer[0];
    expect(support.type).toBe('supportRoute');
    expect(support.label).toBe('Ask the AI CoE for help');
    expect(support.href).toBe('{Url:SupportUrl}');
    expect(support.stopWhen).toEqual([
      'the signed-in account or destination is unclear',
      "someone else's information appears",
      'a source is missing',
      'a claim cannot be verified',
      'the system appears ready to take an external action you did not approve'
    ]);
    expect(support.reportFields).toEqual(['task type', 'time', 'status shown', 'what you expected', 'never secrets or unnecessary private content']);
    const routes: IRawItem[] = support.routes as IRawItem[];
    expect(routes).toHaveLength(6);
    expect(routes.map((row: IRawItem): unknown => row.owner)).toEqual(['{IdentityOwnerLabel}', '{PrivacyOwnerLabel}', '{BusinessApproverLabel}', '{ClaimsOwnerLabel}', '{RecoveryOwnerLabel}', '{SupportOwnerLabel}']);
    expect(routes.map((row: IRawItem): unknown => row.issue)).toEqual(['Access or sign-in', 'Private or regulated data', 'A business decision or approval', 'A claim that cannot be supported', 'An outcome you are unsure about', 'Anything else']);
    // The failure notice of a wizard page routes a permission failure to the identity owner and anything else to the support owner by these kinds.
    expect(routes.map((row: IRawItem): unknown => row.kind)).toEqual(['identity', 'privacy', 'approval', 'claims', 'recovery', 'support']);
    for (const row of routes) {
      // A blank owner label leaves the row's owner out, and the page then reads "not yet named".
      expect(definition.parameters[String(row.owner).slice(1, -1)].kind).toBe('optional');
      expect(definition.parameters[String(row.owner).slice(1, -1)].default).toBeUndefined();
    }
  });

  it('embeds the home tiles once on Requests and the telemetry strip once on Status', () => {
    const pieces: { key: string; block: IRawBlock }[] = [];
    for (const key of NAVIGATION_PAGES) {
      for (const block of blocksOf(key)) {
        if (block.type === 'piece') {
          pieces.push({ key, block });
        }
      }
    }
    expect(pieces.map((piece: { key: string; block: IRawBlock }): string => `${piece.key}:${String(piece.block.piece)}`)).toEqual(['requests:home', 'status:telemetry']);
    const pages: { [target: string]: string } = pieces[0].block.pages as { [target: string]: string };
    expect(Object.keys(pages).sort()).toEqual(PAGE_TARGETS.slice().sort());
    for (const id of WORKFLOW_ORDER) {
      expect(pages[id]).toBe(`{Page:${id}}`);
    }
    expect(pages.telemetry).toBe('{Page:status}');
    expect(pages.admin).toBe('{Page:admin}');
    expect(pages.policy).toBe('');
  });

  it('keeps the admin page owners-only and out of navigation and links', () => {
    expect(page('admin').permissions).toBe('owners');
    for (const target of definition.pages) {
      if (target.key !== 'admin') {
        expect(target.permissions).toBe('inherit');
      }
    }
    const navigated: string[] = [];
    for (const entry of definition.navigation) {
      navigated.push(entry.page, ...(entry.children ?? []).map((child: INavigationEntry): string => child.page));
    }
    expect(navigated).not.toContain('admin');
  });

  it('resolves every link target to a page or a URL parameter, and carries no HTML', () => {
    const targets: string[] = linkTargets();
    expect(targets.length).toBeGreaterThan(10);
    expect(targets).not.toContain('undefined');
    for (const target of targets) {
      if (target === '{Page:admin}') {
        continue;
      }
      expectLinkTarget(target);
    }
    for (const key of NAVIGATION_PAGES) {
      for (const text of stringsIn(blocksOf(key))) {
        expect(text).not.toMatch(/<[a-z]+[\s>]|&[a-z]+;/i);
      }
    }
    for (const text of stringsIn(definition.shared)) {
      expect(text).not.toMatch(/<[a-z]+[\s>]|&[a-z]+;/i);
    }
  });

  it('declares every token it uses and uses every parameter it declares', () => {
    const used: { [name: string]: boolean } = {};
    for (const token of tokensIn(tokenScannedText(definition))) {
      const { first, second } = token;
      if (second !== undefined) {
        expect(['Page', 'Url']).toContain(first);
        if (first === 'Page') {
          expect(pageKeys).toContain(second);
        } else {
          expect(definition.parameters[second]?.kind).toBe('url');
          used[second] = true;
        }
      } else {
        expect(Object.keys(definition.parameters)).toContain(first);
        used[first] = true;
      }
    }
    for (const name of Object.keys(definition.parameters)) {
      const parameter: IParameter = definition.parameters[name];
      expect(['text', 'url', 'optional']).toContain(parameter.kind);
      expect(parameter.description.length).toBeGreaterThan(0);
      expect(used[name]).toBe(true);
      // Only an optional parameter may carry a default, and a default is text.
      if (parameter.default !== undefined) {
        expect(parameter.kind).toBe('optional');
        expect(typeof parameter.default).toBe('string');
      }
    }
    expect(definition.parameters.OrganizationName.kind).toBe('text');
    const sample: { [name: string]: string } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'parameters.sample.json'), 'utf8'));
    expect(Object.keys(sample).sort()).toEqual(Object.keys(definition.parameters).sort());
    for (const name of Object.keys(sample)) {
      expect(sample[name]).toBe('');
    }
  });

  it('declares the provider-neutral parameters of the plan, by kind, and none of the removed ones', () => {
    const byKind: { [kind: string]: string[] } = { text: [], url: [], optional: [] };
    for (const name of Object.keys(definition.parameters)) {
      byKind[definition.parameters[name].kind].push(name);
    }
    for (const kind of Object.keys(EXPECTED_PARAMETERS)) {
      expect({ kind, names: byKind[kind].sort() }).toEqual({ kind, names: EXPECTED_PARAMETERS[kind].slice().sort() });
    }
    // As whole words: AssistantVerifiedDate is a new parameter, VerifiedDate a removed one.
    const words: string[] = definitionText.split(/[^A-Za-z0-9_]+/);
    for (const name of REMOVED_PARAMETERS) {
      expect(definition.parameters[name]).toBeUndefined();
      expect(words).not.toContain(name);
    }
    // The governance bodies read as an approver not yet named until the parameters are filled; the fast path is the AI CoE.
    expect(definition.parameters.GovernanceBodyFastPath.default).toBe('the AI CoE');
    expect(definition.parameters.GovernanceBodyArchitecture.default).toBe('a named approver (not yet named)');
    expect(definition.parameters.GovernanceBodyExecutive.default).toBe('a named approver (not yet named)');
    // The draft flow is named for what it does, not for a provider.
    expect(definition.parameters.DraftServiceUrl.description).toBe('HTTP trigger URL of the AI draft flow for the idea page; blank keeps plain summaries.');
    expect(definition.parameters.TelemetryProvider.description).toBe('Usage feed for the Status page: claude, openai or both.');
    // Every prompt-library parameter is still read by the Prompts page.
    for (const name of Object.keys(definition.parameters)) {
      if (name.indexOf('Prompt') === 0) {
        expect(JSON.stringify(blocksOf('prompts'))).toContain(definition.parameters[name].kind === 'url' ? `{Url:${name}}` : `{${name}}`);
      }
    }
  });

  it('leaves the vocabulary and settings sections out of the token check, as the script copies them as written', () => {
    // A {role} or {organization} placeholder in a vocabulary override is the renderer's, not a parameter.
    const withOverrides: IPagesDefinition = {
      ...definition,
      vocabulary: { chrome: { protectedPage: 'This page is for the {role} role and is not available to you.' }, truthStates: { availableNow: { definition: 'proved in the current {organization} environment.' } } },
      settings: { freshnessDays: 30, minimumCohort: 5 }
    };
    const names: string[] = tokensIn(tokenScannedText(withOverrides)).map((token: { first: string }): string => token.first);
    expect(names).not.toContain('role');
    expect(names).not.toContain('organization');
    expect(names).toContain('OrganizationName');
    // The raw text does carry them, so the exemption is what keeps the check honest rather than blind.
    expect(tokensIn(JSON.stringify(withOverrides)).map((token: { first: string }): string => token.first)).toContain('role');
    // And the render contract carries both sections through unchanged.
    const parsed: { vocabulary?: unknown; settings?: unknown } = JSON.parse(resolveDocument({})) as { vocabulary?: unknown; settings?: unknown };
    expect(parsed.vocabulary).toEqual(definition.vocabulary);
    expect(parsed.settings).toEqual(definition.settings);
  });

  it('produces a document the web part parses in full, with every URL parameter filled or blank', () => {
    const filled: { [name: string]: string } = {};
    for (const name of Object.keys(definition.parameters)) {
      if (definition.parameters[name].kind === 'url') {
        filled[name] = `https://example.invalid/${name}`;
      }
    }
    for (const urlValues of [filled, {}]) {
      const document: IPageDocument | undefined = parsePageDocument(resolveDocument(urlValues));
      expect(document).toBeDefined();
      expect(Object.keys((document as IPageDocument).pages)).toEqual(NAVIGATION_PAGES);
      for (const key of NAVIGATION_PAGES) {
        const parsed: IPageDocument['pages'][string] = (document as IPageDocument).pages[key];
        expect(parsed.title).toBe(page(key).title);
        expect(parsed.blocks.map((block): string => block.type)).toEqual(renderedTypes(key, {}));
        const sources: IRawBlock[] = blocksOf(key).filter((block: IRawBlock): boolean => isKept(block, {}));
        for (let index: number = 0; index < parsed.blocks.length; index++) {
          const source: IRawBlock = sources[index];
          const block: { items?: unknown[] } = parsed.blocks[index] as { items?: unknown[] };
          if (source.type !== 'tiles' && block.items !== undefined) {
            expect(block.items).toHaveLength(itemsOf(source).length);
          }
        }
      }
      // The three action paths name routes, so both runs carry all three; none is a plain link.
      const tiles: ITilesBlock = (document as IPageDocument).pages.startHere.blocks[2] as ITilesBlock;
      expect(tiles.type).toBe('tiles');
      expect(tiles.prominent).toBe(true);
      expect(tiles.items).toHaveLength(3);
      expect(tiles.items.map((item): string | undefined => item.route)).toEqual(['work', 'improve', 'value']);
      expect(tiles.items.filter((item): boolean => item.href !== undefined)).toHaveLength(0);
      // The hero carries no call to action in either run (decision 20).
      const hero: { cta?: unknown } = (document as IPageDocument).pages.startHere.blocks[0] as { cta?: unknown };
      expect(hero.cta).toBeUndefined();
      // The work command points at the work route.
      const command: IWorkCommandBlock = (document as IPageDocument).pages.startHere.blocks[1] as IWorkCommandBlock;
      expect(command.type).toBe('workCommand');
      expect(command.route).toBe('work');
      // The shared footer parses as the support route, six rows, no owner yet.
      const footer: IPageDocument['shared'] = (document as IPageDocument).shared;
      expect(footer?.footer.map((block): string => block.type)).toEqual(['supportRoute']);
      expect((footer?.footer[0] as { routes: { owner?: string }[] }).routes).toHaveLength(6);
      expect((footer?.footer[0] as { routes: { owner?: string }[] }).routes.filter((row): boolean => row.owner !== undefined)).toHaveLength(0);
    }
    expect(JSON.stringify(parsePageDocument(resolveDocument(filled)))).not.toMatch(/\{(Page|Url):|\{[A-Za-z]+\}/);
    const damaged: IPageDocument | undefined = parsePageDocument(resolveDocument(filled).replace('"type":"lanes"', '"type":"bogus"'));
    expect((damaged as IPageDocument).pages.requests.blocks.map((block): string => block.type)).toEqual(renderedTypes('requests', {}).filter((type: string): boolean => type !== 'lanes'));
  });

  it('fails the two off-site routes closed to the guided intake with every parameter blank, and opens the three on-site ones', () => {
    const document: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    const routes: RouteTable = document.routes as RouteTable;
    expect(Object.keys(routes).sort()).toEqual(ROUTE_KEYS.slice().sort());
    for (const key of OFF_SITE_ROUTES) {
      const resolved: IResolvedRoute = resolveRoute(routes, key, { siteUrl: SITE_URL });
      expect({ key, state: resolved.state, fallback: resolved.fallback?.key, href: resolved.href }).toEqual({ key, state: 'needsAccess', fallback: 'guidedIntake', href: `${SITE_URL}/SitePages/${page('idea').file}` });
      expect(resolved.external).toBe(false);
    }
    for (const key of ON_SITE_ROUTES) {
      const resolved: IResolvedRoute = resolveRoute(routes, key, { siteUrl: SITE_URL });
      expect({ key, state: resolved.state, external: resolved.external }).toEqual({ key, state: 'availableNow', external: false });
      expect(String(resolved.href).indexOf(`${SITE_URL}/SitePages/`)).toBe(0);
    }
    // The tiles, the command and the status item resolve the same way through the actions.
    const tiles: ITilesBlock = document.pages.startHere.blocks[2] as ITilesBlock;
    const actions: (ResolvedAction | undefined)[] = tiles.items.map((item): ResolvedAction | undefined => resolveAction(item, routes, { siteUrl: SITE_URL }));
    expect(actions.map((action): string | undefined => action?.kind)).toEqual(['closed', 'link', 'link']);
    expect((actions[0] as { fallback?: { key: string } }).fallback?.key).toBe('guidedIntake');
    const statusRow: IStatusRowBlock = document.pages.startHere.blocks[3] as IStatusRowBlock;
    expect(statusRow.items[0].route).toBe('assistant');
    expect(statusRow.items[0].asOf).toBeUndefined();
    expect(resolveAction(statusRow.items[0], routes, { siteUrl: SITE_URL })?.kind).toBe('closed');
  });

  it('opens an off-site route only once its state, date and receipt reference are set after tenant proof', () => {
    const urls: { [name: string]: string } = { WorkCommandUrl: 'https://work.example/start', AssistantUrl: 'https://assistant.example/chat' };
    const proved: { [name: string]: string } = { WorkCommandState: 'availableNow', WorkCommandVerifiedDate: '2026-01-15', WorkCommandReceiptRef: 'QR-0001', AssistantState: 'AVAILABLE', AssistantVerifiedDate: '2026-01-15' };
    const routes: RouteTable = (parsePageDocument(resolveDocument(urls, proved)) as IPageDocument).routes as RouteTable;
    const now: Date = new Date('2026-02-01T00:00:00Z');
    const work: IResolvedRoute = resolveRoute(routes, 'work', { siteUrl: SITE_URL, now });
    expect({ state: work.state, external: work.external, href: work.href }).toEqual({ state: 'availableNow', external: true, href: 'https://work.example/start' });
    // The assistant has a state and a date but no receipt reference: still closed, awaiting its source.
    const assistant: IResolvedRoute = resolveRoute(routes, 'assistant', { siteUrl: SITE_URL, now });
    expect({ state: assistant.state, pill: assistant.pill, fallback: assistant.fallback?.key }).toEqual({ state: 'needsAccess', pill: 'awaitingSource', fallback: 'guidedIntake' });
    // A URL alone, with the state blank, opens nothing.
    const unproved: RouteTable = (parsePageDocument(resolveDocument(urls)) as IPageDocument).routes as RouteTable;
    expect(resolveRoute(unproved, 'work', { siteUrl: SITE_URL, now }).state).toBe('needsAccess');
    // The status item carries the assistant's date once it is set.
    const statusRow: IStatusRowBlock = (parsePageDocument(resolveDocument(urls, proved)) as IPageDocument).pages.startHere.blocks[3] as IStatusRowBlock;
    expect(statusRow.items[0].asOf).toBe('2026-01-15');
  });

  it('drops the pilot notice when the pilot team name is blank and keeps it when set', () => {
    const blank: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    expect(blank.pages.startHere.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS.startHere.filter((type: string, index: number): boolean => index !== 7));
    expect(blank.pages.startHere.blocks.filter((block): boolean => block.type === 'notice')).toHaveLength(1);
    expect(JSON.stringify(blank)).not.toContain('Private pilot');
    const named: IPageDocument = parsePageDocument(resolveDocument({}, { PilotTeamName: 'Marketing' })) as IPageDocument;
    expect(named.pages.startHere.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS.startHere);
    const pilot: { title?: string; text: string } = named.pages.startHere.blocks[7] as { title?: string; text: string };
    expect(pilot.title).toBe('Private pilot');
    expect(pilot.text).toContain('Marketing');
    expect(JSON.stringify(named)).not.toContain('skipWhenBlank');
  });

  it('keeps the user plane free of provider names, route codes, engineering words and hype', () => {
    const texts: IUserPlaneText[] = userPlaneTexts();
    expect(texts.length).toBeGreaterThan(100);
    expect(offending(texts, (entry: IUserPlaneText): boolean => PROVIDER_WORDS.test(entry.text))).toEqual([]);
    expect(offending(texts, (entry: IUserPlaneText): boolean => UPPER_SNAKE_CODE.test(entry.text))).toEqual([]);
    expect(offending(texts, (entry: IUserPlaneText): boolean => ENGINEERING_WORDS.test(entry.text))).toEqual([]);
    expect(offending(texts, (entry: IUserPlaneText): boolean => HYPE.test(entry.text))).toEqual([]);
    // The lint reads what the page authors wrote, tokens included: a provider name may only arrive through a parameter.
    expect(texts.some((entry: IUserPlaneText): boolean => entry.text.indexOf('{AssistantName}') >= 0)).toBe(true);
    expect(texts.some((entry: IUserPlaneText): boolean => entry.text.indexOf('{ChatName}') >= 0)).toBe(true);
  });

  it('claims freshness only with a date, and writes a literal date only on an illustrative item', () => {
    const texts: IUserPlaneText[] = userPlaneTexts();
    expect(offending(texts, (entry: IUserPlaneText): boolean => FRESHNESS_FIELDS.indexOf(entry.field) >= 0 && !entry.asOf && FRESHNESS_WORDS.test(entry.text))).toEqual([]);
    expect(offending(texts, (entry: IUserPlaneText): boolean => !entry.illustrative && LITERAL_ISO_DATE.test(entry.text))).toEqual([]);
    // The Status titles keep their plain words: the lint reads text, body and meta, not titles.
    expect(itemsOf(blockOf('status', 'cards', 0)).map((item: IRawItem): unknown => item.title)).toEqual(['What is running', 'What is not running']);
    // The lint would catch a claim: the same walk over a card that says "live" without a date names it.
    const claim: IUserPlaneText[] = collectUserPlane([{ type: 'cards', items: [{ title: 'Now', body: ['The assistant is live.'] }] }], 'probe', []);
    expect(offending(claim, (entry: IUserPlaneText): boolean => FRESHNESS_FIELDS.indexOf(entry.field) >= 0 && !entry.asOf && FRESHNESS_WORDS.test(entry.text))).toHaveLength(1);
    const dated: IUserPlaneText[] = collectUserPlane([{ type: 'cards', items: [{ title: 'Now', body: ['The assistant is live.'], asOf: '{AssistantVerifiedDate}' }] }], 'probe', []);
    expect(offending(dated, (entry: IUserPlaneText): boolean => FRESHNESS_FIELDS.indexOf(entry.field) >= 0 && !entry.asOf && FRESHNESS_WORDS.test(entry.text))).toHaveLength(0);
  });

  it('contains no word of the tenant list: client names, tenant hosts, the reference roster, case ids or secret shapes', () => {
    // The list itself (src/provisioning/tenantWords.json) is the one place those words may live.
    for (const file of ['pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      for (const list of PROVISIONING_SCAN) {
        expect({ file, list, found: findTenantWords(text, tenantWords, [list]) }).toEqual({ file, list, found: [] });
      }
    }
  });
});
