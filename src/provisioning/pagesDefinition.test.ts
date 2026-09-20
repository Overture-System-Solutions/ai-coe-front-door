/**
 * Guards the page definition a site owner applies with the PnP script: six navigation pages whose
 * content the web part renders from typed blocks, the form and admin pages, one front-door instance
 * per page, links that resolve, tokens that are declared, blocks the web part's parser accepts, and no
 * client or tenant names. Structure only; the wording belongs to the page authors.
 */
import * as fs from 'fs';
import * as path from 'path';
import { HOME_CARDS } from '../webparts/aiCoeFrontDoor/content/homeCards';
import { CARD_TONES, DEFAULT_CONTENT_URL, LANE_TONES, parsePageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { IPageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import { FRONT_DOOR_VIEWS, PAGE_TARGETS } from '../webparts/aiCoeFrontDoor/content/pageViews';
import { WORKFLOW_ORDER } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import * as icons from '../webparts/aiCoeFrontDoor/icons';
import type { WorkflowId } from '../webparts/aiCoeFrontDoor/workflows/types';

interface IParameter {
  kind: 'text' | 'url';
  description: string;
}

interface INavigationEntry {
  title: string;
  page: string;
  children?: INavigationEntry[];
}

interface IRawBlock {
  type: string;
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
}

interface IPagesDefinition {
  componentId: string;
  contentFile: string;
  parameters: { [name: string]: IParameter };
  navigation: INavigationEntry[];
  pages: IPage[];
  /** The route table the script copies into the document once the tokens are resolved; absent until the first screen carries one. */
  routes?: { [key: string]: IRawItem };
}

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const NAVIGATION_PAGES: string[] = ['startHere', 'learn', 'useAi', 'requests', 'prompts', 'status'];
const PIECE_PAGES: string[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'admin'];
const BLOCK_TYPES: string[] = ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece'];
const EXPECTED_BLOCKS: { [key: string]: string[] } = {
  startHere: ['hero', 'heading', 'tiles', 'cards', 'cards', 'statusRow'],
  learn: ['paragraph', 'paragraph', 'paragraph', 'cards', 'cards', 'heading', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'heading', 'paragraph'],
  useAi: ['paragraph', 'paragraph', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'cards', 'heading', 'paragraph', 'paragraph'],
  requests: ['heading', 'paragraph', 'paragraph', 'heading', 'lanes', 'cards', 'heading', 'paragraph', 'piece'],
  prompts: ['paragraph', 'paragraph', 'heading', 'cards', 'cards'],
  status: ['paragraph', 'cards', 'piece', 'cards']
};
const TOKEN: RegExp = /\{([A-Za-z]+)(?::([A-Za-z]+))?\}/g;
const LINK_TARGET: RegExp = /\]\(([^)\s]*)\)/g;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '')) as T;
}

const definitionText: string = fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8');
const definition: IPagesDefinition = JSON.parse(definitionText) as IPagesDefinition;
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

/** Every link target in the blocks: tile hrefs, calls to action, the home piece's pages and in-text links. */
function linkTargets(): string[] {
  const targets: string[] = [];
  for (const key of NAVIGATION_PAGES) {
    for (const block of blocksOf(key)) {
      if (block.type === 'tiles') {
        targets.push(...itemsOf(block).map((item: IRawItem): string => String(item.href)));
      }
      if (block.type === 'hero' && block.cta !== undefined) {
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

/** The script's token pass over one JSON-serialised node: in-text links, page links, URL parameters, then plain tokens. */
function resolveTokens(text: string, urlValues: { [name: string]: string }): string {
  return text
    .replace(/\[([^[\]]+)\]\(\{Url:([A-Za-z]+)\}\)/g, (whole: string, label: string, name: string): string => (urlValues[name] ? whole : label))
    .replace(/\{Page:([A-Za-z]+)\}/g, (whole: string, name: string): string => `https://example.invalid/sites/ai/SitePages/${page(name).file}`)
    .replace(/\{Url:([A-Za-z]+)\}/g, (whole: string, name: string): string => urlValues[name] ?? '')
    .replace(/\{([A-Za-z]+)\}/g, 'value');
}

/** A tile or call to action whose link resolved to nothing and that names neither a state nor a route is shown as closed. */
function closeWhenUnlinked(item: IRawItem): IRawItem {
  return item.href === '' && item.state === undefined && item.route === undefined ? { ...item, state: 'needsAccess' } : item;
}

/**
 * What the script does to the definition before uploading it: page links become URLs, URL parameters
 * are filled or, when blank, dropped from in-text links; a tile or call to action whose link is blank
 * is kept and marked `needsAccess` so the page shows it as closed. Text tokens become values. The
 * route table, when the definition has one, goes through the same token pass.
 */
function resolveDocument(urlValues: { [name: string]: string }): string {
  const pages: { [key: string]: unknown } = {};
  for (const key of NAVIGATION_PAGES) {
    const resolved: string = resolveTokens(JSON.stringify({ title: page(key).title, blocks: blocksOf(key) }), urlValues);
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
  if (definition.routes !== undefined) {
    document.routes = JSON.parse(resolveTokens(JSON.stringify(definition.routes), urlValues));
  }
  return JSON.stringify(document);
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
    }
    for (const target of definition.pages) {
      for (const name of Object.keys(target.instance)) {
        expect(manifestKeys).toContain(name);
      }
    }
  });

  it('lays out each navigation page as the reference site does', () => {
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
          expect(itemsOf(block)).toHaveLength(4);
          for (const item of itemsOf(block)) {
            expect(iconNames).toContain(item.icon);
            expect(CARD_TONES).toContain(item.tone);
          }
        }
      }
    }
    const hero: IRawBlock = blocksOf('startHere')[0];
    expect(hero.cta).toEqual({ label: 'Start a request', href: '{Page:requests}' });
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
  });

  it('declares every token it uses and uses every parameter it declares', () => {
    const used: { [name: string]: boolean } = {};
    let match: RegExpExecArray | null = TOKEN.exec(definitionText);
    while (match !== null) {
      const [, first, second] = match;
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
      match = TOKEN.exec(definitionText);
    }
    for (const name of Object.keys(definition.parameters)) {
      expect(['text', 'url']).toContain(definition.parameters[name].kind);
      expect(definition.parameters[name].description.length).toBeGreaterThan(0);
      expect(used[name]).toBe(true);
    }
    expect(definition.parameters.OrganizationName.kind).toBe('text');
    const sample: { [name: string]: string } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'parameters.sample.json'), 'utf8'));
    expect(Object.keys(sample).sort()).toEqual(Object.keys(definition.parameters).sort());
    for (const name of Object.keys(sample)) {
      expect(sample[name]).toBe('');
    }
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
        expect(parsed.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS[key]);
        for (let index: number = 0; index < parsed.blocks.length; index++) {
          const source: IRawBlock = blocksOf(key)[index];
          const block: { items?: unknown[] } = parsed.blocks[index] as { items?: unknown[] };
          if (source.type !== 'tiles' && block.items !== undefined) {
            expect(block.items).toHaveLength(itemsOf(source).length);
          }
        }
      }
      // A tile whose URL parameter is blank stays on the page, shown as closed, so both runs carry all four.
      const tiles: { items: { href?: string; state?: string }[] } = (document as IPageDocument).pages.startHere.blocks[2] as { items: { href?: string; state?: string }[] };
      expect(tiles.items).toHaveLength(4);
      const unlinked: { href?: string; state?: string }[] = tiles.items.filter((item: { href?: string; state?: string }): boolean => item.href === undefined);
      expect(unlinked.map((item: { href?: string; state?: string }): string | undefined => item.state)).toEqual(urlValues === filled ? [] : ['needsAccess']);
      const hero: { cta?: { href?: string; state?: string } } = (document as IPageDocument).pages.startHere.blocks[0] as { cta?: { href?: string; state?: string } };
      expect(hero.cta).toBeDefined();
      expect((hero.cta as { href?: string }).href).toBeDefined();
    }
    expect(JSON.stringify(parsePageDocument(resolveDocument(filled)))).not.toMatch(/\{(Page|Url):|\{[A-Za-z]+\}/);
    const damaged: IPageDocument | undefined = parsePageDocument(resolveDocument(filled).replace('"type":"lanes"', '"type":"bogus"'));
    expect((damaged as IPageDocument).pages.requests.blocks.map((block): string => block.type)).toEqual(EXPECTED_BLOCKS.requests.filter((type: string): boolean => type !== 'lanes'));
  });

  it('contains no client names, tenant hosts or the reference roster', () => {
    for (const file of ['pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      expect(text).not.toMatch(/overture|tegria|cloudwave/i);
      expect(text).not.toMatch(/[a-z0-9-]+\.sharepoint\.com/i);
      expect(text).not.toMatch(/Frerichs|Sides|Martens|Donahue/);
    }
  });
});
