/**
 * Guards the page definition a site owner applies with the PnP script: seven content pages whose
 * content the web part renders from typed blocks (five in the navigation, Prompts linked from Learn
 * and Use AI, the owners-only Operations page on the operator plane), the form and admin pages, one
 * front-door instance per page, links that resolve, tokens that are declared, blocks the web part's
 * parser accepts, the route table, provider-neutral parameters, and no client or tenant names. The
 * user-plane lints read the rendered text fields: no provider names, no route codes, no hype, no
 * freshness claims without a date, no literal dates outside illustrative items, and no committed
 * "available now" off site. Structure and the lints only; the wording belongs to the page authors.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveAction } from '../webparts/aiCoeFrontDoor/content/actions';
import type { ResolvedAction } from '../webparts/aiCoeFrontDoor/content/actions';
import { HOME_CARDS } from '../webparts/aiCoeFrontDoor/content/homeCards';
import { CARD_TONES, DEFAULT_CONTENT_URL, LANE_TONES, parsePageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { ICardsBlock, ICaseCardsBlock, IPageDocument, IPieceBlock, ITilesBlock, IStatusStripBlock, IWorkCommandBlock, IWorkflowCardsBlock } from '../webparts/aiCoeFrontDoor/content/pageContent';
import { FRONT_DOOR_VIEWS, PAGE_TARGETS } from '../webparts/aiCoeFrontDoor/content/pageViews';
import { ROLE_IDS } from '../webparts/aiCoeFrontDoor/content/roles';
import { resolveRoute } from '../webparts/aiCoeFrontDoor/content/routes';
import type { IResolvedRoute, RouteTable } from '../webparts/aiCoeFrontDoor/content/routes';
import { TELEMETRY_TILES } from '../webparts/aiCoeFrontDoor/content/telemetryTiles';
import type { ITelemetryTile } from '../webparts/aiCoeFrontDoor/content/telemetryTiles';
import { CANONICAL_STATUS } from '../webparts/aiCoeFrontDoor/content/truthStates';
import { WORKFLOW_ORDER } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import * as icons from '../webparts/aiCoeFrontDoor/icons';
import { INTAKES_LIST_TITLE, OWN_ITEMS_LISTS, OWN_ITEMS_SECURITY, PROGRAM_MEASURES_LIST_TITLE, USE_CASES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/lists';
import type { WorkflowId } from '../webparts/aiCoeFrontDoor/workflows/types';
import { findTenantWords, PROVISIONING_SCAN, readTenantWords } from './tenantWords';
import type { ITenantWords } from './tenantWords';

interface IParameter {
  /**
   * `text` must be filled; `url` may be blank and fails closed; `optional` may be blank and takes its `default`;
   * `group` carries a site group title the script looks up, and a blank or unknown one only warns (1.0.0.14).
   */
  kind: 'text' | 'url' | 'optional' | 'group';
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
  /** Name of a parameter; the script builds no page at all when that parameter is blank (the role-start page, 1.0.0.15). */
  skipWhenBlank?: string;
  plane?: string;
  /** Role ids, any one of which opens the page; the site's own permissions are what actually shut it (1.0.0.14). */
  requiredRole?: string[];
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
  /**
   * The lists the script puts under item-level security (decision 6); the script's section, never part of the
   * document. `fullControlGroups` names the `group` parameters whose site groups read every row (1.0.0.14).
   */
  listSecurity: { title: string; security: string; fullControlGroups?: string[] }[];
  /** The lists the script creates and extends (decision 9, 1.0.0.14); the script's section too, never part of the document. */
  lists: IListDefinition[];
}

/** One list the script ensures: created as a generic list when the site has none, then given the columns it lacks. */
interface IListDefinition {
  title: string;
  description: string;
  fields: IListField[];
}

/** One column of a declared list; a flag left out is false. */
interface IListField {
  name: string;
  type: string;
  choices?: string[];
  indexed?: boolean;
  required?: boolean;
  unique?: boolean;
}

/** The sections the script copies without the token pass, and the token check therefore leaves out. */
const VERBATIM_SECTIONS: ('vocabulary' | 'settings')[] = ['vocabulary', 'settings'];

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const SITE_URL: string = 'https://example.invalid/sites/ai';
/** The five pages in the top navigation, in order (decision 1: Prompts left it in 1.0.0.13). */
const NAVIGATION_PAGES: string[] = ['startHere', 'learn', 'useAi', 'requests', 'status'];
const NAVIGATION_TITLES: string[] = ['Start here', 'Learn', 'Use AI', 'Requests', 'Status'];
/**
 * Every page the content document carries: the navigation pages, Prompts (kept and linked from Learn and Use AI),
 * the Operations page and, from 1.0.0.14, the Enterprise value page, both protected by site groups and written for
 * operators. The link, document and lint walks read this list, so a page leaving the navigation drops nothing
 * silently.
 */
const CONTENT_PAGES: string[] = [...NAVIGATION_PAGES, 'prompts', 'operations', 'value', 'roleStart'];
/** The pages a run only builds when the parameter they are keyed on has a value (1.0.0.15, decision 15). */
const KEYED_PAGES: { [key: string]: string } = { roleStart: 'PilotTeamName' };
const PIECE_PAGES: string[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'admin'];
const BLOCK_TYPES: string[] = [
  'hero',
  'heading',
  'paragraph',
  'tiles',
  'cards',
  'lanes',
  'statusRow',
  'statusStrip',
  'piece',
  'workCommand',
  'notice',
  'rules',
  'supportRoute',
  'caseCards',
  'kpi',
  'workflowCards',
  'bindings'
];
const EXPECTED_BLOCKS: { [key: string]: string[] } = {
  // The status strip carries the person's own request count beside the assistant and Requests lines (1.0.0.13);
  // the leader block sits right below it from 1.0.0.14 and is shown to a leader alone. From 1.0.0.15 the three
  // workflow cards sit below the notices for every tenant, and the last card leads to the role-start page.
  startHere: ['hero', 'workCommand', 'tiles', 'statusStrip', 'cards', 'heading', 'rules', 'notice', 'notice', 'workflowCards', 'heading', 'cards', 'cards'],
  learn: ['paragraph', 'paragraph', 'paragraph', 'rules', 'cards', 'cards', 'heading', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'heading', 'paragraph', 'paragraph'],
  useAi: ['paragraph', 'paragraph', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'paragraph', 'paragraph'],
  requests: ['heading', 'paragraph', 'paragraph', 'heading', 'lanes', 'cards', 'notice', 'heading', 'paragraph', 'piece'],
  prompts: ['paragraph', 'paragraph', 'heading', 'cards', 'cards'],
  // The person's own requests first, then the one illustrative case card (decision 14), then the dated facts.
  status: ['paragraph', 'piece', 'caseCards', 'cards', 'cards'],
  // The telemetry strip lives here from 1.0.0.13 (decision 7), under a diagnostics kicker, on the operator plane;
  // the bindings of the run join it in 1.0.0.14.
  operations: ['heading', 'piece', 'bindings'],
  // The Enterprise value page of 1.0.0.14: how to read it, the three measures, and the three illustrative columns.
  value: ['heading', 'notice', 'kpi', 'cards'],
  // The role start of 1.0.0.15: the promise, the three workflows, the three rules, the five checks, the quick start
  // and the pattern, and the caution to start small (MKT-03/22/23/77).
  roleStart: ['hero', 'workflowCards', 'rules', 'rules', 'cards', 'notice']
};
const OPERATIONS_KICKER: string = 'Diagnostics: usage and cost, not a measure of value';
/** The route keys the first screen and the status items point at; the two off-site ones take their proof from parameters. */
const ROUTE_KEYS: string[] = ['work', 'assistant', 'guidedIntake', 'improve', 'value', 'valueFallback'];
const OFF_SITE_ROUTES: string[] = ['work', 'assistant'];
const ON_SITE_ROUTES: string[] = ['guidedIntake', 'improve', 'value', 'valueFallback'];
/** Routes open to a role alone; everyone else is sent to the row's fallback (1.0.0.14, decision 8). */
const ROLE_ROUTES: { [key: string]: string[] } = { value: ['leader', 'operator'] };
/** The on-site rows anyone may use: the role-gated ones resolve closed until the roles are held. */
const OPEN_ROUTES: string[] = ON_SITE_ROUTES.filter((key: string): boolean => ROLE_ROUTES[key] === undefined);
/** The measures the Enterprise value page asks the program measures list for, in the order it shows them. */
const VALUE_MEASURE_IDS: string[] = ['useful-safe-completion-rate', 'median-time-to-useful-outcome', 'repeat-use-useful-completion-rate'];
/** Every parameter the definition declares, by kind (Contracts § pages.json parameters). */
const EXPECTED_PARAMETERS: { [kind: string]: string[] } = {
  text: ['OrganizationName', 'TelemetryProvider', 'AssistantName', 'ChatName', 'StatusDate', 'PromptCount', 'PromptsAddedCount', 'PromptsAddedDate', 'PromptTestRecordCount', 'PromptStatusCounts', 'PromptIdAdminQueue', 'PromptIdMorningBrief', 'PromptIdRepeatableWork', 'LeadTeamContinuation'],
  url: ['DraftServiceUrl', 'AssistantUrl', 'ChatUrl', 'WorkCommandUrl', 'SupportUrl', 'TeamsUrl', 'PromptLibraryUrl'],
  // PilotMembers is optional (a 1.0.0.12 verifier finding): it feeds only the private-pilot notice, which the script drops when PilotTeamName is blank.
  optional: ['AssistantState', 'AssistantVerifiedDate', 'AssistantReceiptRef', 'WorkCommandState', 'WorkCommandVerifiedDate', 'WorkCommandReceiptRef', 'SupportOwnerLabel', 'IdentityOwnerLabel', 'PrivacyOwnerLabel', 'BusinessApproverLabel', 'ClaimsOwnerLabel', 'RecoveryOwnerLabel', 'GovernanceBodyFastPath', 'GovernanceBodyArchitecture', 'GovernanceBodyExecutive', 'PilotTeamName', 'PilotMembers', 'GovernanceReference', 'ReviewSystemName', 'ContentRelease', 'Palette'],
  // 1.0.0.14: one group parameter per bindable role (decision 8). The pilot group of 1.0.0.15 joined them with the
  // role-start page; it binds no role (decision 15: no fifth role id), it only names who may read that page.
  group: ['LeadersGroup', 'OperatorsGroup', 'DesignAuthorityGroup', 'PilotGroup']
};
/**
 * The parameters the script applies itself instead of through a `{token}` in the definition: the palette it writes to
 * `paletteOverrides` on every instance, and the release id it names in the end-of-run summary. Each is pinned in
 * `provisioningScript.test.ts`, so the exemption is not a hole.
 */
const SCRIPT_APPLIED_PARAMETERS: string[] = ['ContentRelease', 'Palette'];
/**
 * What a page may declare as its `permissions`: inherited, the site's owners group alone, or Read for one or more
 * site groups named by `group` parameters (1.0.0.14), each of which the script looks up on the site.
 */
const PAGE_PERMISSIONS: RegExp = /^(inherit|owners|groups:[A-Za-z][A-Za-z0-9]*(,[A-Za-z][A-Za-z0-9]*)*)$/;
/** A column name SharePoint takes as an internal name without mangling it: a letter, then letters and digits, 32 at most. */
const FIELD_NAME: RegExp = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
/** The column types the script may create (Contracts § SharePoint lists); anything else is refused rather than guessed. */
const FIELD_TYPES: string[] = ['Text', 'Note', 'Number', 'DateTime', 'Choice', 'Boolean'];
/** The Branding properties the script writes on every instance from a parameter (Contracts § Property pane; decision 21). */
const INSTANCE_BRANDING_TOKENS: { [property: string]: string } = {
  organizationName: '{OrganizationName}',
  governanceReference: '{GovernanceReference}',
  reviewSystemName: '{ReviewSystemName}',
  // 1.0.0.14: the definition binds each role id to a group parameter; the script keeps only the pairs whose site group
  // the site carries, so an unfilled or unknown group leaves its role unbound (decision 8).
  roleGroups: 'leader={LeadersGroup};operator={OperatorsGroup};designAuthority={DesignAuthorityGroup}'
};
const REMOVED_PARAMETERS: string[] = ['ConciergeUrl', 'CopilotChatUrl', 'ConciergeSourceCount', 'ConciergeNewestSourceDate', 'VerifiedDate'];
const LINK_TARGET: RegExp = /\]\(([^)\s]*)\)/g;

/** The fields the user plane renders as text; everything else on an item (state, route, href, icon, tone, ...) is a code. */
const USER_PLANE_FIELDS: string[] = [
  'title',
  'text',
  'body',
  'note',
  'meta',
  'kicker',
  'label',
  'description',
  'prompt',
  'placeholder',
  'submitLabel',
  'emptyText',
  'unavailableText',
  'caption',
  'nextAction',
  'historicalStage',
  'stopWhen',
  'reportFields',
  'issue',
  'action',
  // 1.0.0.15: the four answers a workflow card renders and the worked example above its link; `family` is a tag, not a text.
  'input',
  'output',
  'humanDecision',
  'pass',
  'example'
];
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

/** Every link target in the blocks: tile hrefs (an item that names a route has none), calls to action, strip links, the home piece's pages and in-text links. */
function linkTargets(): string[] {
  const targets: string[] = [];
  for (const key of CONTENT_PAGES) {
    for (const block of blocksOf(key)) {
      if (block.type === 'tiles') {
        for (const item of itemsOf(block)) {
          if (item.route === undefined) {
            targets.push(String(item.href));
          }
        }
      }
      if (block.type === 'statusStrip') {
        for (const item of itemsOf(block)) {
          if (item.href !== undefined) {
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

/** The page keys a run does not build: the page names a parameter in `skipWhenBlank` and the run has no value for it. */
function skippedPages(optionalValues: { [name: string]: string }): string[] {
  return definition.pages
    .filter((target: IPage): boolean => target.skipWhenBlank !== undefined && parameterValue(target.skipWhenBlank, optionalValues) === '')
    .map((target: IPage): string => target.key);
}

/** The content pages a run does upload, in definition order. */
function renderedPages(optionalValues: { [name: string]: string }): string[] {
  const skipped: string[] = skippedPages(optionalValues);
  return CONTENT_PAGES.filter((key: string): boolean => skipped.indexOf(key) < 0);
}

/** True when an item still has its destination: it targets no page this run skipped (1.0.0.15). */
function targetsKeptPage(item: IRawItem, skipped: string[]): boolean {
  const target: RegExpExecArray | null = /^\{Page:([A-Za-z]+)\}$/.exec(String(item.href ?? ''));
  return target === null || skipped.indexOf(target[1]) < 0;
}

/**
 * A block as a run keeps it: an item that targets a page the run skipped is dropped, and a block whose items all
 * went is dropped with them, so no page draws an empty grid or a link to a page that was never built.
 */
function keptBlock(block: IRawBlock, skipped: string[]): IRawBlock | undefined {
  if (!Array.isArray(block.items)) {
    return block;
  }
  const items: IRawItem[] = itemsOf(block).filter((item: IRawItem): boolean => targetsKeptPage(item, skipped));
  return items.length === 0 ? undefined : { ...block, items };
}

/** The blocks a page renders in a run: the source order, less what the run drops for a blank parameter or a skipped page. */
function keptBlocks(key: string, optionalValues: { [name: string]: string }): IRawBlock[] {
  const skipped: string[] = skippedPages(optionalValues);
  const kept: IRawBlock[] = [];
  for (const block of blocksOf(key)) {
    const trimmed: IRawBlock | undefined = isKept(block, optionalValues) ? keptBlock(block, skipped) : undefined;
    if (trimmed !== undefined) {
      kept.push(trimmed);
    }
  }
  return kept;
}

/** The block types a page renders in a run. */
function renderedTypes(key: string, optionalValues: { [name: string]: string }): string[] {
  return keptBlocks(key, optionalValues).map((block: IRawBlock): string => block.type);
}

/**
 * What the script does to the definition before uploading it: page links become URLs, URL parameters
 * are filled or, when blank, dropped from in-text links; a tile or call to action whose link is blank
 * is kept and marked `needsAccess` so the page shows it as closed; a block whose `skipWhenBlank`
 * parameter is blank is dropped. Text tokens become values. The route table and the shared sections go
 * through the same token pass. A page that names its plane carries it into the document.
 */
function resolveDocument(urlValues: { [name: string]: string }, optionalValues: { [name: string]: string } = {}): string {
  const pages: { [key: string]: unknown } = {};
  for (const key of renderedPages(optionalValues)) {
    const kept: IRawBlock[] = keptBlocks(key, optionalValues).map((block: IRawBlock): IRawBlock => {
      const copy: IRawBlock = { ...block };
      delete copy.skipWhenBlank;
      return copy;
    });
    const resolved: string = resolveTokens(JSON.stringify({ title: page(key).title, blocks: kept }), urlValues, optionalValues);
    const parsedPage: { title: string; blocks: IRawBlock[]; plane?: string; requiredRole?: string[] } = JSON.parse(resolved) as { title: string; blocks: IRawBlock[] };
    if (page(key).plane !== undefined) {
      parsedPage.plane = page(key).plane;
    }
    if (page(key).requiredRole !== undefined) {
      parsedPage.requiredRole = page(key).requiredRole;
    }
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

/** The texts the user plane renders: every content page whose plane is not `operator`, the shared footer and the route table. */
function userPlaneTexts(): IUserPlaneText[] {
  const texts: IUserPlaneText[] = [];
  for (const key of CONTENT_PAGES) {
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

/** Every item that may carry an action or a state: route rows, tiles, calls to action, status and strip items and cards. */
function actionItems(): { where: string; item: IRawItem; kind: 'route' | 'action' | 'fact' }[] {
  const found: { where: string; item: IRawItem; kind: 'route' | 'action' | 'fact' }[] = [];
  for (const key of Object.keys(definition.routes)) {
    found.push({ where: `routes.${key}`, item: definition.routes[key], kind: 'route' });
  }
  for (const key of CONTENT_PAGES) {
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
      if (block.type === 'statusRow' || block.type === 'statusStrip' || block.type === 'cards') {
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

  it('carries the five navigation pages in order; Prompts and Operations stay out of the navigation (decision 1)', () => {
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.title)).toEqual(NAVIGATION_TITLES);
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.page)).toEqual(NAVIGATION_PAGES);
    for (const entry of definition.navigation) {
      expect(pageKeys).toContain(entry.page);
    }
    const navigated: string[] = [];
    for (const entry of definition.navigation) {
      navigated.push(entry.page, ...(entry.children ?? []).map((child: INavigationEntry): string => child.page));
    }
    expect(navigated).not.toContain('prompts');
    expect(navigated).not.toContain('operations');
    // The Prompts page is still provisioned and reachable: Learn and Use AI link to it.
    expect(page('prompts').title).toBe('Prompts');
    expect(JSON.stringify(blocksOf('learn'))).toContain('{Page:prompts}');
    expect(JSON.stringify(blocksOf('useAi'))).toContain('{Page:prompts}');
  });

  it('lists the five form pages under Requests in home-card order', () => {
    const withChildren: INavigationEntry[] = definition.navigation.filter((entry: INavigationEntry): boolean => entry.children !== undefined);
    expect(withChildren.map((entry: INavigationEntry): string => entry.page)).toEqual(['requests']);
    const children: INavigationEntry[] = withChildren[0].children as INavigationEntry[];
    expect(children.map((child: INavigationEntry): string => child.page)).toEqual(WORKFLOW_ORDER);
    expect(children.map((child: INavigationEntry): string => child.title)).toEqual(WORKFLOW_ORDER.map((id: WorkflowId): string => HOME_CARDS[id].title));
  });

  it('defines fifteen pages with unique keys and files, one instance each', () => {
    // 1.0.0.15 adds the role-start page; a site whose pilot team is not named builds fourteen of the fifteen.
    expect(definition.pages).toHaveLength(15);
    expect(new Set(pageKeys).size).toBe(15);
    expect(new Set(pageFiles).size).toBe(15);
    expect(pageKeys.slice().sort()).toEqual([...CONTENT_PAGES, ...PIECE_PAGES].sort());
    for (const target of definition.pages) {
      expect(target.file).toMatch(/^[A-Za-z0-9-]+\.aspx$/);
      expect(target.title.length).toBeGreaterThan(0);
      expect(typeof target.commentsEnabled).toBe('boolean');
      expect(target.permissions).toMatch(PAGE_PERMISSIONS);
      expect(typeof target.instance).toBe('object');
      expect((target as { sections?: unknown }).sections).toBeUndefined();
    }
    for (const id of WORKFLOW_ORDER) {
      expect(page(id).title).toBe(HOME_CARDS[id].title);
    }
  });

  it('renders the nine content pages from the shared document; only Operations carries the usage feed', () => {
    for (const key of CONTENT_PAGES) {
      const instance: { [name: string]: string } = page(key).instance;
      expect(instance.view).toBe('page');
      expect(instance.pageKey).toBe(key);
      expect(instance.contentUrl).toBe(DEFAULT_CONTENT_URL);
      expect(instance.layout).toBe('wide');
      expect(instance.organizationName).toBe('{OrganizationName}');
      // The strip left Status for Operations (decision 7), and the provider property goes with it.
      expect({ key, telemetryProvider: instance.telemetryProvider }).toEqual({ key, telemetryProvider: key === 'operations' ? '{TelemetryProvider}' : undefined });
      expect(blocksOf(key).length).toBeGreaterThan(0);
    }
    for (const key of PIECE_PAGES) {
      expect(page(key).blocks).toBeUndefined();
    }
  });

  it('puts the Operations page on the operator plane, behind the operators group, with the strip, the kicker and the bindings', () => {
    const operations: IPage = page('operations');
    expect(operations.title).toBe('Operations');
    expect(operations.file).toBe('Operations.aspx');
    // 1.0.0.14: the owners-only page of 1.0.0.13 opens to the operators group as well, and names the role it is for.
    expect(operations.permissions).toBe('groups:OperatorsGroup');
    expect(operations.requiredRole).toEqual(['operator']);
    expect(operations.plane).toBe('operator');
    expect(operations.commentsEnabled).toBe(false);
    expect(blocksOf('operations')[0]).toEqual({ type: 'heading', level: 2, text: 'Operations diagnostics' });
    const strip: IRawBlock = blockOf('operations', 'piece');
    expect(strip.piece).toBe('telemetry');
    expect(strip.kicker).toBe(OPERATIONS_KICKER);
    // The run's own release and bindings sit under the strip; the block carries no binding of its own.
    const bindings: IRawBlock = blockOf('operations', 'bindings');
    expect(Object.keys(bindings).sort()).toEqual(['title', 'type']);
    expect(typeof bindings.title).toBe('string');
    // Only the two operator pages name a plane: everything else is the user plane by default.
    for (const target of definition.pages) {
      const operator: boolean = target.key === 'operations' || target.key === 'value';
      expect({ page: target.key, plane: target.plane }).toEqual({ page: target.key, plane: operator ? 'operator' : undefined });
    }
    // With the kicker set, the tiles read their labels from the vocabulary: one per feed key, naming the feed and never a provider brand.
    const telemetry: { [feedId: string]: unknown } = (definition.vocabulary as { telemetry: { [feedId: string]: unknown } }).telemetry;
    expect(Object.keys(telemetry).sort()).toEqual(TELEMETRY_TILES.map((tile: ITelemetryTile): string => tile.key).sort());
    for (const feedId of Object.keys(telemetry)) {
      expect(typeof telemetry[feedId]).toBe('string');
      expect({ feedId, provider: PROVIDER_WORDS.test(String(telemetry[feedId])) }).toEqual({ feedId, provider: false });
    }
    expect(telemetry.anthropic_api_spend_mtd).toMatch(/^Assistant usage/);
    // The operator plane is outside the user-plane lint: its texts are not collected, so the kicker's "cost" and "usage" words are never read as claims.
    expect(userPlaneTexts().filter((entry: IUserPlaneText): boolean => entry.where.indexOf('operations') === 0)).toEqual([]);
    expect(collectUserPlane(blocksOf('operations'), 'operations', []).map((entry: IUserPlaneText): string => entry.text)).toContain(OPERATIONS_KICKER);
  });

  it('gives leaders and operators an Enterprise value page of measures with no number written into it (1.0.0.14)', () => {
    const value: IPage = page('value');
    expect(value.title).toBe('Enterprise value');
    expect(value.file).toBe('Enterprise-value.aspx');
    expect(value.permissions).toBe('groups:LeadersGroup,OperatorsGroup');
    expect(value.requiredRole).toEqual(['leader', 'operator']);
    expect(value.plane).toBe('operator');
    expect(value.commentsEnabled).toBe(false);
    expect(blocksOf('value')[0]).toEqual({ type: 'heading', level: 2, text: 'Enterprise AI value' });
    // How to read the page: what each placeholder means, and that nothing on it is estimated.
    const notice: IRawBlock = blockOf('value', 'notice');
    expect(notice.tone).toBe('info');
    expect(notice.title).toBe('How to read this page');
    expect(notice.text).toBe(
      'A number appears only when it has been measured against a baseline. Pending baseline means the measure is defined but the first period is not complete. Not established means no baseline exists yet. Nothing here is estimated.'
    );
    // The three measures: an id each and the wording above it; the number, the period and the evidence come from the row.
    const kpi: IRawBlock = blockOf('value', 'kpi');
    expect(itemsOf(kpi).map((item: IRawItem): unknown => item.id)).toEqual(VALUE_MEASURE_IDS);
    expect(itemsOf(kpi).map((item: IRawItem): unknown => item.label)).toEqual([
      'Useful safe completion rate',
      'Median time to a useful outcome',
      'Repeat-use useful completion rate'
    ]);
    for (const item of itemsOf(kpi)) {
      expect(Object.keys(item).sort()).toEqual(['id', 'label']);
    }
    expect(typeof kpi.unavailableText).toBe('string');
    // The three columns are an illustration of how value is read, not a value of this environment, and carry no figure.
    const cards: IRawBlock = blockOf('value', 'cards');
    expect(itemsOf(cards).map((item: IRawItem): unknown => item.title)).toEqual(['Hypothesis', 'Forecast', 'Realised']);
    for (const item of itemsOf(cards)) {
      expect({ title: item.title, illustrative: item.illustrative }).toEqual({ title: item.title, illustrative: true });
      expect(item.state).toBeUndefined();
      expect(item.route).toBeUndefined();
      for (const text of stringsIn(item.body)) {
        expect({ title: item.title, digits: /\d/.test(text) }).toEqual({ title: item.title, digits: false });
      }
    }
    // The page is written for operators, so its texts are outside the user-plane lint, like the Operations page.
    expect(userPlaneTexts().filter((entry: IUserPlaneText): boolean => entry.where.indexOf('value') === 0)).toEqual([]);
    // The measure ids are the keys of the program measures list the script creates; the page writes no value for them.
    expect(definition.lists[0].title).toBe(PROGRAM_MEASURES_LIST_TITLE);
    expect(JSON.stringify(blocksOf('value'))).not.toContain('MeasureId');
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

  it('lays out each content page as the plan describes', () => {
    for (const key of CONTENT_PAGES) {
      expect({ key, blocks: blocksOf(key).map((block: IRawBlock): string => block.type) }).toEqual({ key, blocks: EXPECTED_BLOCKS[key] });
      for (const block of blocksOf(key)) {
        expect(BLOCK_TYPES).toContain(block.type);
        if (block.type === 'heading') {
          expect([2, 3]).toContain(block.level);
        }
        if (block.type === 'cards') {
          expect([2, 3]).toContain(block.columns);
          // A row is full or shorter than its columns, never longer: the single card that leads to the role start
          // (1.0.0.15) sits in a two-column row, and every other row fills its columns.
          expect(itemsOf(block).length).toBeGreaterThan(0);
          expect(itemsOf(block).length).toBeLessThanOrEqual(block.columns as number);
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
        if (block.type === 'kpi') {
          expect(itemsOf(block).length).toBeGreaterThan(0);
          for (const item of itemsOf(block)) {
            // A tile names a measure and, at most, the wording above it: a number, a period or an evidence
            // reference written here would be a claim only the measures list may make.
            expect(typeof item.id).toBe('string');
            expect(Object.keys(item).filter((field: string): boolean => ['id', 'label', 'illustrative'].indexOf(field) < 0)).toEqual([]);
          }
        }
        if (block.type === 'workflowCards') {
          // Every card answers the same four questions, and every committed card is an example: no workflow is
          // claimed as one this environment runs until a catalogue says so (MKT-03, decision 15).
          expect(itemsOf(block)).toHaveLength(3);
          for (const item of itemsOf(block)) {
            for (const field of ['title', 'input', 'output', 'humanDecision', 'pass']) {
              expect({ title: item.title, field, filled: typeof item[field] === 'string' && String(item[field]).length > 0 }).toEqual({ title: item.title, field, filled: true });
            }
            expect({ title: item.title, illustrative: item.illustrative }).toEqual({ title: item.title, illustrative: true });
            expect(item.state).toBeUndefined();
            expect(item.href).toBeUndefined();
            expect(item.route).toBeUndefined();
          }
        }
        if (block.type === 'bindings') {
          // The block renders what the run wrote on the document; the definition writes no binding into it.
          expect(block.items).toBeUndefined();
        }
      }
    }
  });

  it('opens Status with the person own requests, then the dated facts with their states, and no lookup promise', () => {
    // The my-work piece comes right after the opening line (decision 6); it reads the intake list trimmed by list security.
    const myWork: IRawBlock = blocksOf('status')[1];
    expect(myWork).toEqual({ type: 'piece', piece: 'myWork' });
    // The two fact cards: the assistant through its route with its verified date, and what is not here as a closed state dated by the page owner.
    const facts: IRawBlock = blockOf('status', 'cards', 0);
    expect(itemsOf(facts).map((item: IRawItem): unknown => item.title)).toEqual(['What is running', 'What is not running']);
    expect(itemsOf(facts)[0]).toMatchObject({ route: 'assistant', asOf: '{AssistantVerifiedDate}', source: 'AI CoE check' });
    expect(itemsOf(facts)[0].state).toBeUndefined();
    expect(itemsOf(facts)[1]).toMatchObject({ state: 'notSupported', asOf: '{StatusDate}', source: 'AI CoE check' });
    expect(itemsOf(facts)[1].route).toBeUndefined();
    expect(itemsOf(facts)[1].href).toBeUndefined();
    // The self-service lookup exists now (the my-work piece), so the page no longer says it is not built.
    expect(definitionText).not.toContain('Self-service status lookup');
    // The closing cards point at Requests for a follow-up and at the AI CoE for faults; neither claims a state.
    const closing: IRawBlock = blockOf('status', 'cards', 1);
    expect(itemsOf(closing).map((item: IRawItem): unknown => item.title)).toEqual(['Checking a request you sent', 'If something is wrong']);
    for (const item of itemsOf(closing)) {
      expect(item.state).toBeUndefined();
      expect(item.route).toBeUndefined();
    }
    // The parsed page keeps the states and the route, so the cards draw their pills against the route table.
    const document: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    expect(document.pages.status.blocks[1]).toEqual({ type: 'piece', piece: 'myWork', pages: {} });
    const parsed: ICardsBlock = document.pages.status.blocks[3] as ICardsBlock;
    expect(parsed.type).toBe('cards');
    expect(parsed.items[0].route).toBe('assistant');
    expect(parsed.items[0].asOf).toBeUndefined();
    expect(parsed.items[1].state).toBe('notSupported');
    // StatusDate is a text parameter: an ISO value dates the card, anything else leaves it awaiting its source rather than inventing a date.
    expect(parsed.items[1].asOf).toBeUndefined();
    expect(parsed.items[1].source).toBe('AI CoE check');
  });

  it('shows one illustrative case card on Status, labelled as an example, with its state out of the user-plane lint (decision 14)', () => {
    const cases: IRawBlock = blockOf('status', 'caseCards');
    expect(blocksOf('status')[2]).toBe(cases);
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
    const parsed: ICaseCardsBlock = document.pages.status.blocks[2] as ICaseCardsBlock;
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
    // The status strip: the assistant line, the Requests line and the person's own request count, linked to Status (1.0.0.13).
    const strip: IRawBlock = blockOf('startHere', 'statusStrip');
    expect(itemsOf(strip).map((item: IRawItem): unknown => item.label)).toEqual(['{AssistantName}', 'Requests', 'My requests']);
    expect(itemsOf(strip)[0].route).toBe('assistant');
    expect(itemsOf(strip)[0].asOf).toBe('{AssistantVerifiedDate}');
    expect(itemsOf(strip)[0].source).toBe('AI CoE check');
    expect(itemsOf(strip)[0].kind).toBeUndefined();
    expect(itemsOf(strip)[1].state).toBe('availableNow');
    expect(itemsOf(strip)[1].href).toBeUndefined();
    expect(itemsOf(strip)[1].route).toBeUndefined();
    expect(itemsOf(strip)[2]).toEqual({ kind: 'myRequests', label: 'My requests', href: '{Page:status}' });
    expect(strip.emptyText).toBeUndefined();
    expect(strip.unavailableText).toBeUndefined();
    expect(blocksOf('startHere').filter((block: IRawBlock): boolean => block.type === 'statusRow')).toEqual([]);
    // The three rules, verbatim from the quick start, numbered.
    const rules: IRawBlock = blockOf('startHere', 'rules');
    expect(rules.ordered).toBeUndefined();
    expect(itemsOf(rules).map((item: IRawItem): unknown => item.title)).toEqual(['Use only information you are allowed to use.', 'Check the result.', 'People send and approve.']);
    expect(blocksOf('startHere')[5].text).toBe('Three rules');
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
    for (const key of CONTENT_PAGES) {
      for (const block of blocksOf(key)) {
        if (block.skipWhenBlank !== undefined) {
          expect(block).toBe(pilot);
        }
      }
    }
  });

  it('shows the leader block below the strip on Start here, as two static links and no figure (1.0.0.14)', () => {
    // FD-16 asks a leader for decisions, cases and blockers; the feeds behind those need lists no backend fills yet,
    // so the block is two links a leader can follow and nothing that would read as a measure (Consciously unmet).
    const leaders: IRawBlock = blocksOf('startHere')[4];
    expect(leaders.type).toBe('cards');
    expect(leaders.audience).toEqual(['leader']);
    expect(leaders.columns).toBe(2);
    expect(itemsOf(leaders).map((item: IRawItem): unknown => item.title)).toEqual(['Decisions waiting on you', 'Material changes']);
    // The first card goes through the role-gated value route, so a leader sees the evidence view and anyone else the fallback.
    expect(itemsOf(leaders)[0].route).toBe('value');
    expect(itemsOf(leaders)[0].href).toBeUndefined();
    expect(String(itemsOf(leaders)[0].body)).toContain('{Page:value}');
    // The second is a plain on-site link with its own state; Status is open to everyone.
    expect(itemsOf(leaders)[1].href).toBe('{Page:status}');
    expect(itemsOf(leaders)[1].state).toBe('availableNow');
    expect(itemsOf(leaders)[1].route).toBeUndefined();
    for (const item of itemsOf(leaders)) {
      for (const text of stringsIn(item.body)) {
        expect({ title: item.title, digits: /\d/.test(text) }).toEqual({ title: item.title, digits: false });
      }
    }
    // It is the only block on any page written for one role; every other block is for everyone.
    const audienced: string[] = [];
    for (const key of CONTENT_PAGES) {
      blocksOf(key).forEach((block: IRawBlock, index: number): void => {
        if (block.audience !== undefined) {
          audienced.push(`${key}[${index}]`);
        }
      });
    }
    expect(audienced).toEqual(['startHere[4]']);
    // The parsed block keeps its audience, so a reader who is not a leader never sees it.
    const document: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    expect((document.pages.startHere.blocks[4] as ICardsBlock).audience).toEqual(['leader']);
  });

  it('shows the three workflows on Start here for every tenant, whether or not a pilot team is named (MKT-03)', () => {
    const workflows: IRawBlock = blockOf('startHere', 'workflowCards');
    // Unconditional and for everyone: a tenant that names no pilot team still sees what the three workflows are.
    expect(workflows.skipWhenBlank).toBeUndefined();
    expect(workflows.audience).toBeUndefined();
    expect(blocksOf('startHere')[9]).toBe(workflows);
    expect(itemsOf(workflows).map((item: IRawItem): unknown => item.title)).toEqual(['Campaign brief', 'Content and internal PR plan', 'Meeting-to-campaign follow-through']);
    // The wording is the playbook's, section by section; only the tenant's own names would be left out, and it has none.
    expect(itemsOf(workflows)[0]).toEqual({
      title: 'Campaign brief',
      input: 'approved objective, audience context and permitted current sources.',
      output: 'audience, pain points, message, channel plan, content calendar, evidence gaps and review needs.',
      humanDecision: 'Marketing validates strategy and voice.',
      pass: 'Every factual claim cites a current source or is marked unknown; nothing is published.',
      illustrative: true
    });
    expect(itemsOf(workflows)[1].pass).toBe('One destination, one CTA, accessible copy, no unsupported capability/value claim.');
    expect(itemsOf(workflows)[2].pass).toBe(
      'No assignment, message, calendar event or campaign change occurs without the appropriate confirmation and native readback.'
    );
    // The same three workflows stand on the role start, each with the worked example the quick start names.
    const onRoleStart: IRawBlock = blockOf('roleStart', 'workflowCards');
    expect(itemsOf(onRoleStart).map((item: IRawItem): unknown => item.title)).toEqual(itemsOf(workflows).map((item: IRawItem): unknown => item.title));
    for (let index: number = 0; index < 3; index += 1) {
      const onPage: IRawItem = itemsOf(onRoleStart)[index];
      const onStart: IRawItem = itemsOf(workflows)[index];
      for (const field of ['title', 'input', 'output', 'humanDecision', 'pass', 'illustrative']) {
        expect({ index, field, value: onPage[field] }).toEqual({ index, field, value: onStart[field] });
      }
      expect(typeof onPage.example).toBe('string');
      expect(onStart.example).toBeUndefined();
    }
    // The document carries the block parsed, with its four answers and its example flag, on both pages.
    const document: IPageDocument = parsePageDocument(resolveDocument({}, { PilotTeamName: 'Marketing' })) as IPageDocument;
    const parsed: IWorkflowCardsBlock = document.pages.startHere.blocks[9] as IWorkflowCardsBlock;
    expect(parsed.type).toBe('workflowCards');
    expect(parsed.items).toEqual(itemsOf(workflows));
    expect((document.pages.roleStart.blocks[1] as IWorkflowCardsBlock).items).toHaveLength(3);
  });

  it('gives the named pilot team a start page behind its group, skipped when the team is not named (decision 15)', () => {
    const roleStart: IPage = page('roleStart');
    expect(roleStart.file).toBe('Pilot-start.aspx');
    expect(roleStart.title).toBe('{PilotTeamName} start');
    expect(roleStart.skipWhenBlank).toBe('PilotTeamName');
    expect(roleStart.permissions).toBe('groups:PilotGroup');
    expect(definition.parameters.PilotGroup.kind).toBe('group');
    // The operator reads the parameter's own description while filling parameters.json, so it names both things a
    // blank value costs: the pilot notice on Start here and this page (with the card that leads to it).
    expect(definition.parameters.PilotTeamName.description).toContain('private-pilot notice');
    expect(definition.parameters.PilotTeamName.description).toContain('start page is not built');
    // No fifth role: the site group is what keeps the page shut, and the page names no role to read it.
    expect(roleStart.requiredRole).toBeUndefined();
    expect(roleStart.plane).toBeUndefined();
    expect(roleStart.commentsEnabled).toBe(false);
    // Only this page is keyed on a parameter; every other page is built on every run.
    expect(definition.pages.filter((target: IPage): boolean => target.skipWhenBlank !== undefined).map((target: IPage): string => target.key)).toEqual(['roleStart']);
    expect(Object.keys(KEYED_PAGES)).toEqual(['roleStart']);
    expect(KEYED_PAGES.roleStart).toBe(roleStart.skipWhenBlank);
    // The three rules are Start here's, word for word; the five checks are the playbook's, in the tenant's own name.
    const rules: IRawBlock = blockOf('roleStart', 'rules', 0);
    expect(rules.title).toBe('Three rules');
    expect(itemsOf(rules)).toEqual(itemsOf(blockOf('startHere', 'rules')));
    const checks: IRawBlock = blockOf('roleStart', 'rules', 1);
    expect(checks.title).toBe('Before you accept the result');
    expect(checks.ordered).toBe(false);
    expect(itemsOf(checks).map((item: IRawItem): unknown => item.title)).toEqual([
      'Is every claim supported by a current source?',
      'Are unknowns labeled instead of guessed?',
      'Does the voice sound like {OrganizationName}?',
      'Are the audience, owner and next action clear?',
      'Did it remain a draft?'
    ]);
    expect(itemsOf(checks)[4].text).toBe('Correct the result or stop if any answer is no.');
    // The quick start is the ten minutes of the employee guide; the pattern is the one Use AI already gives.
    const cards: IRawBlock = blockOf('roleStart', 'cards');
    expect(itemsOf(cards).map((item: IRawItem): unknown => item.title)).toEqual(['Ten-minute quick start', 'Prompt pattern']);
    const minutes: string[] = stringsIn(itemsOf(cards)[0].body);
    expect(minutes).toHaveLength(5);
    expect(minutes.map((text: string): string => text.split(':')[0])).toEqual(['**Minute 0-2', '**Minute 2-4', '**Minute 4-7', '**Minute 7-9', '**Minute 9-10']);
    const pattern: string =
      '*Help me [complete this task] for [audience]. Use only [permitted sources]. The result must include [required sections]. Mark missing facts and assumptions. Do not send, post, publish, assign work or change records.*';
    expect(stringsIn(itemsOf(cards)[1].body)).toEqual([pattern]);
    expect(String(blocksOf('useAi')[0].text)).toContain(pattern);
    // The caution the playbook ends the first task with (MKT-22).
    const notice: IRawBlock = blockOf('roleStart', 'notice');
    expect(notice.tone).toBe('caution');
    expect(notice.title).toBe('Start small');
    expect(notice.text).toBe('Start with a small task; not one that is high-risk, public, legally sensitive or confidential.');
    // The page is on the user plane, so its wording is read by the user-plane lints like Start here's.
    expect(userPlaneTexts().filter((entry: IUserPlaneText): boolean => entry.where.indexOf('roleStart') === 0).length).toBeGreaterThan(20);
    // The blocks parse in full once the team is named, and the page is out of the navigation.
    const document: IPageDocument = parsePageDocument(resolveDocument({}, { PilotTeamName: 'Marketing' })) as IPageDocument;
    expect(document.pages.roleStart.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS.roleStart);
    expect(document.pages.roleStart.requiredRole).toBeUndefined();
    const navigated: string[] = [];
    for (const entry of definition.navigation) {
      navigated.push(entry.page, ...(entry.children ?? []).map((child: INavigationEntry): string => child.page));
    }
    expect(navigated).not.toContain('roleStart');
  });

  it('declares the six routes with the on-site rows open by content and the off-site rows proved by parameters', () => {
    expect(Object.keys(definition.routes).sort()).toEqual(ROUTE_KEYS.slice().sort());
    expect(definition.routes.guidedIntake).toEqual({ label: 'Use the guided request instead', href: '{Page:idea}', state: 'availableNow' });
    expect(definition.routes.improve).toEqual({ label: 'Start a request', href: '{Page:requests}', state: 'availableNow' });
    // 1.0.0.14: the value route leads to the Enterprise value page for a leader or an operator, and to Status for anyone else.
    expect(definition.routes.value).toEqual({
      label: 'See what has been measured',
      href: '{Page:value}',
      state: 'availableNow',
      roles: ['leader', 'operator'],
      fallback: 'valueFallback'
    });
    expect(definition.routes.valueFallback).toEqual({
      label: 'See what has been measured on Status',
      href: '{Page:status}',
      state: 'availableNow',
      note: 'Leaders and operators see the evidence-backed view; measured results also appear on Status.'
    });
    // Only that one row names roles, and every id it names is a role the web part resolves.
    for (const key of Object.keys(definition.routes)) {
      expect({ key, roles: definition.routes[key].roles }).toEqual({ key, roles: ROLE_ROUTES[key] });
      for (const roleId of (definition.routes[key].roles ?? []) as string[]) {
        expect(ROLE_IDS).toContain(roleId);
      }
    }
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

  it('embeds the home tiles once on Requests, my work once on Status and the telemetry strip once on Operations', () => {
    const pieces: { key: string; block: IRawBlock }[] = [];
    for (const key of CONTENT_PAGES) {
      for (const block of blocksOf(key)) {
        if (block.type === 'piece') {
          pieces.push({ key, block });
        }
      }
    }
    expect(pieces.map((piece: { key: string; block: IRawBlock }): string => `${piece.key}:${String(piece.block.piece)}`)).toEqual(['requests:home', 'status:myWork', 'operations:telemetry']);
    const pages: { [target: string]: string } = pieces[0].block.pages as { [target: string]: string };
    // The eight tile targets plus the outcome record, whose own page arrives with its workflow (decision 16).
    const expectedTargets: string[] = PAGE_TARGETS.map((target: string): string => target).concat('outcome');
    expect(Object.keys(pages).sort()).toEqual(expectedTargets.sort());
    expect(pages.outcome).toBe('');
    for (const id of WORKFLOW_ORDER) {
      expect(pages[id]).toBe(`{Page:${id}}`);
    }
    // The snapshot sits on the owners-only Operations page now, so the resource strip on Requests (everyone) offers no link to it.
    expect(pages.telemetry).toBe('');
    expect(pages.admin).toBe('{Page:admin}');
    expect(pages.policy).toBe('');
    // The kicker is the only piece field besides `piece` and `pages`; my work carries neither.
    expect(Object.keys(pieces[1].block).sort()).toEqual(['piece', 'type']);
    expect(Object.keys(pieces[2].block).sort()).toEqual(['kicker', 'piece', 'type']);
  });

  it('keeps the protected pages out of the navigation; admin owners-only, the two operator pages behind their groups', () => {
    const PROTECTED: { [key: string]: string } = {
      admin: 'owners',
      // 1.0.0.14: the site's own permissions are the control; the page's requiredRole only tells a reader whose page it is.
      operations: 'groups:OperatorsGroup',
      value: 'groups:LeadersGroup,OperatorsGroup',
      // 1.0.0.15: the pilot group reads the role start; it binds no role, so the page names none (decision 15).
      roleStart: 'groups:PilotGroup'
    };
    for (const target of definition.pages) {
      expect({ page: target.key, permissions: target.permissions }).toEqual({ page: target.key, permissions: PROTECTED[target.key] ?? 'inherit' });
      // Only the two operator pages name a role; the admin page is owners-only and the role start binds no role.
      const required: { [key: string]: string[] } = { operations: ['operator'], value: ['leader', 'operator'] };
      expect({ page: target.key, requiredRole: target.requiredRole }).toEqual({ page: target.key, requiredRole: required[target.key] });
    }
    const navigated: string[] = [];
    for (const entry of definition.navigation) {
      navigated.push(entry.page, ...(entry.children ?? []).map((child: INavigationEntry): string => child.page));
    }
    for (const key of Object.keys(PROTECTED)) {
      expect(navigated).not.toContain(key);
    }
    // Operations is reached by its operators directly; the Enterprise value page is linked once, from the leader block.
    const targets: string[] = linkTargets();
    expect(targets).not.toContain('{Page:operations}');
    expect(targets.filter((target: string): boolean => target === '{Page:value}')).toHaveLength(1);
  });

  it('admits inherit, owners and groups:<Name> permissions, every name a group parameter (1.0.0.14)', () => {
    // A protected page names the group parameters that may read it, never a site group title: the titles are the
    // tenant's and live in parameters.json. The script gives the owners group Full Control and each named group Read.
    for (const target of definition.pages) {
      expect({ page: target.key, permissions: target.permissions }).toEqual({ page: target.key, permissions: expect.stringMatching(PAGE_PERMISSIONS) });
      if (target.permissions.indexOf('groups:') !== 0) {
        continue;
      }
      const names: string[] = target.permissions.slice('groups:'.length).split(',');
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect({ page: target.key, name, kind: definition.parameters[name]?.kind }).toEqual({ page: target.key, name, kind: 'group' });
      }
    }
    // The form: one or more parameter names after `groups:`, nothing else.
    for (const admitted of ['inherit', 'owners', 'groups:OperatorsGroup', 'groups:LeadersGroup,OperatorsGroup']) {
      expect({ permissions: admitted, admitted: PAGE_PERMISSIONS.test(admitted) }).toEqual({ permissions: admitted, admitted: true });
    }
    for (const refused of ['', 'groups:', 'groups:A,', 'group:A', 'everyone', 'groups:A B', 'groups:Ops Group', 'owners,groups:A']) {
      expect({ permissions: refused, admitted: PAGE_PERMISSIONS.test(refused) }).toEqual({ permissions: refused, admitted: false });
    }
  });

  it('names the two intake lists for item-level security by the titles the web part writes to (decision 6)', () => {
    // The script's "List security" section reads this: each person reads and edits their own rows; owners and the
    // groups the entry names read every row. The titles are the constants the services write with, so a rename cannot drift.
    expect(definition.listSecurity).toEqual([
      { title: INTAKES_LIST_TITLE, security: OWN_ITEMS_SECURITY, fullControlGroups: ['OperatorsGroup'] },
      { title: USE_CASES_LIST_TITLE, security: OWN_ITEMS_SECURITY, fullControlGroups: ['OperatorsGroup'] }
    ]);
    expect(definition.listSecurity.map((entry: { title: string }): string => entry.title)).toEqual(OWN_ITEMS_LISTS.slice());
    expect(OWN_ITEMS_LISTS).toEqual(['AI CoE Pilot Intakes', 'AI CoE Use Cases']);
    // 1.0.0.14 promises an operator every request row, and ReadSecurity 2 trims anyone whose level withholds Override
    // List Behaviors, so the operators group is granted Full Control here. Every name is a 'group' parameter, never a
    // group title: the title belongs to the tenant's parameter file.
    for (const entry of definition.listSecurity) {
      const names: string[] = entry.fullControlGroups ?? [];
      expect(names).toEqual(['OperatorsGroup']);
      for (const name of names) {
        expect({ list: entry.title, name, kind: definition.parameters[name]?.kind }).toEqual({ list: entry.title, name, kind: 'group' });
      }
    }
    // The section belongs to the script and never reaches the document the web part reads.
    expect(resolveDocument({})).not.toContain('listSecurity');
    expect(resolveDocument({})).not.toContain('ownItems');
    expect(resolveDocument({})).not.toContain('fullControlGroups');
  });

  it('declares the lists the script creates, by title, column, type and flag (decision 9, 1.0.0.14)', () => {
    // New lists come from this section alone: the package feature's XML stays byte-identical, so the program measures
    // list the Enterprise value page reads is declared here and created by the script's "Lists" section.
    expect(definition.lists.map((list: IListDefinition): string => list.title)).toEqual([PROGRAM_MEASURES_LIST_TITLE]);
    const measures: IListDefinition = definition.lists[0];
    expect(measures.title).toBe('AI CoE Program Measures');
    expect(measures.description.length).toBeGreaterThan(40);
    // The one convention an operator cannot guess from the columns: a `%` measure is written as a proportion, so the
    // description says it where the row is filled in (`content/measures.ts` reads 0 to 1 as a proportion).
    expect(measures.description).toContain('0.62 for 62%');
    expect(measures.description).toContain('proportion');
    expect(measures.fields.map((field: IListField): string => `${field.name}:${field.type}`)).toEqual([
      'MeasureId:Text',
      'Value:Number',
      'Unit:Text',
      'State:Choice',
      'PeriodStart:DateTime',
      'PeriodEnd:DateTime',
      'EvidenceRef:Text',
      'EvidenceNote:Note',
      'CohortSize:Number'
    ]);
    // The measure key is the row's identity: indexed, unique and required, as the intake key is in the feature's schema.
    expect(measures.fields.filter((field: IListField): boolean => field.unique === true).map((field: IListField): string => field.name)).toEqual(['MeasureId']);
    const measureId: IListField = measures.fields[0];
    expect({ indexed: measureId.indexed, required: measureId.required, unique: measureId.unique }).toEqual({ indexed: true, required: true, unique: true });
    expect(measures.fields.filter((field: IListField): boolean => field.name === 'State')[0].required).toBe(true);
    // Every list: a title, a description, at least one column, and no title declared twice.
    const titles: string[] = [];
    for (const list of definition.lists) {
      expect(typeof list.title).toBe('string');
      expect(titles).not.toContain(list.title);
      titles.push(list.title);
      expect(typeof list.description).toBe('string');
      expect(list.fields.length).toBeGreaterThan(0);
      const names: string[] = [];
      for (const field of list.fields) {
        expect({ list: list.title, field: field.name, named: FIELD_NAME.test(field.name) }).toEqual({ list: list.title, field: field.name, named: true });
        expect(FIELD_TYPES).toContain(field.type);
        expect(names).not.toContain(field.name);
        names.push(field.name);
        // Title and Id are the list's own columns; a declaration would try to add them again.
        expect(['Id', 'Title', 'Author', 'Editor', 'Created', 'Modified']).not.toContain(field.name);
        // Choices belong to a Choice column and to no other, and a Choice column needs at least two.
        if (field.type === 'Choice') {
          expect((field.choices ?? []).length).toBeGreaterThan(1);
        } else {
          expect({ field: field.name, choices: field.choices }).toEqual({ field: field.name, choices: undefined });
        }
        for (const flag of ['indexed', 'required', 'unique']) {
          const value: unknown = (field as unknown as { [key: string]: unknown })[flag];
          expect({ field: field.name, flag, value }).toEqual({ field: field.name, flag, value: value === undefined ? undefined : value === true });
        }
        // A unique column is indexed: SharePoint refuses unique values on a column it has not indexed.
        if (field.unique === true) {
          expect({ field: field.name, indexed: field.indexed }).toEqual({ field: field.name, indexed: true });
        }
      }
    }
    // The section belongs to the script; the document the web part reads carries no list definition.
    expect(resolveDocument({})).not.toContain('AI CoE Program Measures');
    expect(resolveDocument({})).not.toContain('EvidenceNote');
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
    for (const key of CONTENT_PAGES) {
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
    // A group parameter may be read without a token: a page's permissions and a list's full-control groups name it.
    for (const target of definition.pages) {
      if (target.permissions.indexOf('groups:') === 0) {
        for (const name of target.permissions.slice('groups:'.length).split(',')) {
          used[name] = true;
        }
      }
      if (target.skipWhenBlank !== undefined) {
        used[target.skipWhenBlank] = true;
      }
    }
    for (const entry of definition.listSecurity) {
      for (const name of entry.fullControlGroups ?? []) {
        used[name] = true;
      }
    }
    for (const name of Object.keys(definition.parameters)) {
      const parameter: IParameter = definition.parameters[name];
      expect(['text', 'url', 'optional', 'group']).toContain(parameter.kind);
      expect(parameter.description.length).toBeGreaterThan(0);
      // Every parameter is read somewhere: through a token here, through a page's permissions or skip key, or by the
      // script itself (the palette and the release id).
      expect({ name, used: used[name] === true || SCRIPT_APPLIED_PARAMETERS.indexOf(name) >= 0 }).toEqual({ name, used: true });
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
    const byKind: { [kind: string]: string[] } = { text: [], url: [], optional: [], group: [] };
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
    // The feed codes stay; the page the strip sits on is Operations from 1.0.0.13 (decision 7).
    expect(definition.parameters.TelemetryProvider.description).toBe('Usage feed for the Operations page: claude, openai or both.');
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
      // Every content page but the one this run skips for a blank parameter: the role start needs a pilot team name.
      expect(Object.keys((document as IPageDocument).pages)).toEqual(renderedPages({}));
      expect(renderedPages({})).not.toContain('roleStart');
      expect(renderedPages({ PilotTeamName: 'Marketing' })).toEqual(CONTENT_PAGES);
      for (const key of renderedPages({})) {
        const parsed: IPageDocument['pages'][string] = (document as IPageDocument).pages[key];
        expect(parsed.title).toBe(page(key).title);
        expect({ key, blocks: parsed.blocks.map((block): string => block.type) }).toEqual({ key, blocks: renderedTypes(key, {}) });
        // The plane and the required role travel with the page: the two operator pages carry both, every other page neither.
        expect({ key, plane: parsed.plane }).toEqual({ key, plane: page(key).plane as string | undefined });
        expect({ key, requiredRole: parsed.requiredRole }).toEqual({ key, requiredRole: page(key).requiredRole });
        const sources: IRawBlock[] = keptBlocks(key, {});
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
      // The Operations strip keeps its kicker through the parse, so the tiles read the vocabulary labels on that page.
      const strip: IPieceBlock = (document as IPageDocument).pages.operations.blocks[1] as IPieceBlock;
      expect(strip).toEqual({ type: 'piece', piece: 'telemetry', pages: {}, kicker: OPERATIONS_KICKER });
      expect((document as IPageDocument).vocabulary?.telemetry).toEqual((definition.vocabulary as { telemetry: unknown }).telemetry);
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

  it('fails the two off-site routes closed to the guided intake with every parameter blank, and opens the open on-site ones', () => {
    const document: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    const routes: RouteTable = document.routes as RouteTable;
    expect(Object.keys(routes).sort()).toEqual(ROUTE_KEYS.slice().sort());
    for (const key of OFF_SITE_ROUTES) {
      const resolved: IResolvedRoute = resolveRoute(routes, key, { siteUrl: SITE_URL });
      expect({ key, state: resolved.state, fallback: resolved.fallback?.key, href: resolved.href }).toEqual({ key, state: 'needsAccess', fallback: 'guidedIntake', href: `${SITE_URL}/SitePages/${page('idea').file}` });
      expect(resolved.external).toBe(false);
    }
    for (const key of OPEN_ROUTES) {
      const resolved: IResolvedRoute = resolveRoute(routes, key, { siteUrl: SITE_URL });
      expect({ key, state: resolved.state, external: resolved.external }).toEqual({ key, state: 'availableNow', external: false });
      expect(String(resolved.href).indexOf(`${SITE_URL}/SitePages/`)).toBe(0);
    }
    // The value route is on this site and available, and still closed to someone who holds neither role: they are sent to Status.
    const closedValue: IResolvedRoute = resolveRoute(routes, 'value', { siteUrl: SITE_URL, roles: ['employee'] });
    expect({ state: closedValue.state, fallback: closedValue.fallback?.key, href: closedValue.href }).toEqual({
      state: 'needsAccess',
      fallback: 'valueFallback',
      href: `${SITE_URL}/SitePages/${page('status').file}`
    });
    for (const roleId of ['leader', 'operator']) {
      const open: IResolvedRoute = resolveRoute(routes, 'value', { siteUrl: SITE_URL, roles: ['employee', roleId] });
      expect({ roleId, state: open.state, href: open.href }).toEqual({ roleId, state: 'availableNow', href: `${SITE_URL}/SitePages/${page('value').file}` });
    }
    // The tiles, the command and the status item resolve the same way through the actions.
    const tiles: ITilesBlock = document.pages.startHere.blocks[2] as ITilesBlock;
    const actions: (ResolvedAction | undefined)[] = tiles.items.map((item): ResolvedAction | undefined => resolveAction(item, routes, { siteUrl: SITE_URL }));
    expect(actions.map((action): string | undefined => action?.kind)).toEqual(['closed', 'link', 'closed']);
    expect((actions[0] as { fallback?: { key: string } }).fallback?.key).toBe('guidedIntake');
    // Tile 03 sends an employee to Status; a leader follows it to the Enterprise value page.
    expect((actions[2] as { fallback?: { key: string } }).fallback?.key).toBe('valueFallback');
    expect(resolveAction(tiles.items[2], routes, { siteUrl: SITE_URL, roles: ['leader'] })?.kind).toBe('link');
    const strip: IStatusStripBlock = document.pages.startHere.blocks[3] as IStatusStripBlock;
    expect(strip.type).toBe('statusStrip');
    expect(strip.items[0].route).toBe('assistant');
    expect(strip.items[0].asOf).toBeUndefined();
    expect(resolveAction(strip.items[0], routes, { siteUrl: SITE_URL })?.kind).toBe('closed');
    expect(strip.items[2]).toEqual({ kind: 'myRequests', label: 'My requests', href: `${SITE_URL}/SitePages/${page('status').file}` });
    // The Status cards resolve the same way: the assistant card closed to the guided intake, the not-running card closed with no fallback.
    const facts: ICardsBlock = document.pages.status.blocks[3] as ICardsBlock;
    const running: ResolvedAction | undefined = resolveAction(facts.items[0], routes, { siteUrl: SITE_URL });
    expect({ kind: running?.kind, fallback: (running as { fallback?: { key: string } }).fallback?.key }).toEqual({ kind: 'closed', fallback: 'guidedIntake' });
    expect(resolveAction(facts.items[1], routes, { siteUrl: SITE_URL })).toEqual({ kind: 'closed', state: 'notSupported', pill: 'notSupported', stateLabel: 'Not supported' });
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
    // The strip item and the Status card carry the assistant's date once it is set.
    const proven: IPageDocument = parsePageDocument(resolveDocument(urls, proved)) as IPageDocument;
    expect((proven.pages.startHere.blocks[3] as IStatusStripBlock).items[0].asOf).toBe('2026-01-15');
    expect((proven.pages.status.blocks[3] as ICardsBlock).items[0].asOf).toBe('2026-01-15');
  });

  it('drops the pilot notice and the role-start card when the pilot team name is blank, and keeps both when set', () => {
    const blank: IPageDocument = parsePageDocument(resolveDocument({})) as IPageDocument;
    // Two blocks go with a blank pilot team: the private-pilot notice (its own `skipWhenBlank`) and the card that
    // leads to the role-start page, which this run never builds (1.0.0.15).
    expect(blank.pages.startHere.blocks.map((block): string => block.type)).toEqual(
      EXPECTED_BLOCKS.startHere.filter((type: string, index: number): boolean => index !== 8 && index !== EXPECTED_BLOCKS.startHere.length - 1)
    );
    expect(blank.pages.startHere.blocks.filter((block): boolean => block.type === 'notice')).toHaveLength(1);
    expect(JSON.stringify(blank)).not.toContain('Private pilot');
    expect(Object.keys(blank.pages)).not.toContain('roleStart');
    expect(JSON.stringify(blank)).not.toContain('Pilot-start.aspx');
    // The three workflow cards stay whether or not a pilot team is named: every tenant sees the three workflows (MKT-03).
    expect(blank.pages.startHere.blocks.filter((block): boolean => block.type === 'workflowCards')).toHaveLength(1);
    const named: IPageDocument = parsePageDocument(resolveDocument({}, { PilotTeamName: 'Marketing' })) as IPageDocument;
    expect(named.pages.startHere.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS.startHere);
    const pilot: { title?: string; text: string } = named.pages.startHere.blocks[8] as { title?: string; text: string };
    expect(pilot.title).toBe('Private pilot');
    expect(pilot.text).toContain('Marketing');
    expect(JSON.stringify(named)).not.toContain('skipWhenBlank');
    // With the team named the card leads to the page the same run builds, under the team's own name.
    const card: ICardsBlock = named.pages.startHere.blocks[EXPECTED_BLOCKS.startHere.length - 1] as ICardsBlock;
    expect(card.type).toBe('cards');
    expect(card.items).toHaveLength(1);
    expect(card.items[0].title).toBe('Marketing start');
    expect(card.items[0].href).toBe(`${SITE_URL}/SitePages/${page('roleStart').file}`);
    expect(named.pages.roleStart.title).toBe('Marketing start');
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
