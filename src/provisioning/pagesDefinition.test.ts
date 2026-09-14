/**
 * Guards the page definition a site owner applies with the PnP script: six navigation pages plus the
 * form and admin pages, one front-door piece per page, links that resolve, tokens that are declared,
 * and no client or tenant names. Structure only; the wording belongs to the page authors.
 */
import * as fs from 'fs';
import * as path from 'path';
import { HOME_CARDS } from '../webparts/aiCoeFrontDoor/content/homeCards';
import { FRONT_DOOR_VIEWS } from '../webparts/aiCoeFrontDoor/content/pageViews';
import { WORKFLOW_ORDER } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
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

interface ITextControl {
  type: 'text';
  html: string;
}

interface IFrontDoorControl {
  type: 'frontDoor';
  properties: { [name: string]: string };
}

interface ILinkTarget {
  page?: string;
  url?: string;
}

interface IQuickLinkItem extends ILinkTarget {
  title: string;
}

interface IQuickLinksControl {
  type: 'quickLinks';
  layout: string;
  items: IQuickLinkItem[];
}

interface IButtonControl extends ILinkTarget {
  type: 'button';
  label: string;
}

type Control = ITextControl | IFrontDoorControl | IQuickLinksControl | IButtonControl;

interface ISection {
  template: string;
  columns: { controls: Control[] }[];
}

interface IPage {
  key: string;
  title: string;
  file: string;
  commentsEnabled: boolean;
  permissions: string;
  sections: ISection[];
}

interface IPagesDefinition {
  componentId: string;
  parameters: { [name: string]: IParameter };
  navigation: INavigationEntry[];
  pages: IPage[];
}

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const PIECE_PAGES: string[] = ['requests', 'status', 'idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'admin'];
const CONTENT_PAGES: string[] = ['startHere', 'learn', 'useAi', 'prompts'];
const COLUMNS: { [template: string]: number } = { OneColumn: 1, TwoColumn: 2, ThreeColumn: 3 };
const TOKEN: RegExp = /\{([A-Za-z]+)(?::([A-Za-z]+))?\}/g;

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

function page(key: string): IPage {
  const found: IPage | undefined = definition.pages.filter((candidate: IPage): boolean => candidate.key === key)[0];
  if (found === undefined) {
    throw new Error(`No page with key "${key}".`);
  }
  return found;
}

function controlsOf(target: IPage): Control[] {
  const controls: Control[] = [];
  for (const section of target.sections) {
    for (const column of section.columns) {
      controls.push(...column.controls);
    }
  }
  return controls;
}

function frontDoorsOf(target: IPage): IFrontDoorControl[] {
  return controlsOf(target).filter((control: Control): control is IFrontDoorControl => control.type === 'frontDoor');
}

function linkTargets(): ILinkTarget[] {
  const targets: ILinkTarget[] = [];
  for (const target of definition.pages) {
    for (const control of controlsOf(target)) {
      if (control.type === 'quickLinks') {
        targets.push(...control.items);
      } else if (control.type === 'button') {
        targets.push(control);
      }
    }
  }
  return targets;
}

function expectLinkTarget(target: ILinkTarget): void {
  if (target.page !== undefined) {
    expect(pageKeys).toContain(target.page);
    expect(target.url).toBeUndefined();
  } else {
    expect(target.url).toMatch(/^\{Url:[A-Za-z]+\}$/);
    const name: string = (target.url as string).slice(5, -1);
    expect(definition.parameters[name]?.kind).toBe('url');
  }
}

describe('front door page definition', () => {
  it('targets the web part of this package', () => {
    expect(definition.componentId).toBe(manifest.id);
    expect(definition.componentId).toBe('cf2e5904-0703-4fe4-ae5a-ec012d6fa689');
  });

  it('mirrors the six navigation pages in order', () => {
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.title)).toEqual(['Start here', 'Learn', 'Use AI', 'Requests', 'Prompts', 'Status']);
    expect(definition.navigation.map((entry: INavigationEntry): string => entry.page)).toEqual(['startHere', 'learn', 'useAi', 'requests', 'prompts', 'status']);
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

  it('defines twelve pages with unique keys and files', () => {
    expect(definition.pages).toHaveLength(12);
    expect(new Set(pageKeys).size).toBe(12);
    expect(new Set(pageFiles).size).toBe(12);
    expect(pageKeys.slice().sort()).toEqual([...PIECE_PAGES, ...CONTENT_PAGES].sort());
    for (const target of definition.pages) {
      expect(target.file).toMatch(/^[A-Za-z0-9-]+\.aspx$/);
      expect(target.title.length).toBeGreaterThan(0);
      expect(typeof target.commentsEnabled).toBe('boolean');
      expect(['inherit', 'owners']).toContain(target.permissions);
    }
    for (const id of WORKFLOW_ORDER) {
      expect(page(id).title).toBe(HOME_CARDS[id].title);
    }
  });

  it('places exactly one front-door piece on the eight piece pages and none on the four content pages', () => {
    for (const key of PIECE_PAGES) {
      expect(frontDoorsOf(page(key))).toHaveLength(1);
    }
    for (const key of CONTENT_PAGES) {
      expect(frontDoorsOf(page(key))).toHaveLength(0);
    }
  });

  it('gives every piece a known non-legacy view, manifest property keys and links to defined pages', () => {
    const expectedViews: { [key: string]: string } = { requests: 'home', status: 'telemetry', admin: 'admin' };
    for (const id of WORKFLOW_ORDER) {
      expectedViews[id] = id;
    }
    for (const key of PIECE_PAGES) {
      const properties: { [name: string]: string } = frontDoorsOf(page(key))[0].properties;
      expect(FRONT_DOOR_VIEWS).toContain(properties.view);
      expect(properties.view).toBe(expectedViews[key]);
      expect(['wide', 'narrow']).toContain(properties.layout);
      expect(properties.organizationName).toBe('{OrganizationName}');
      for (const name of Object.keys(properties)) {
        expect(manifestKeys).toContain(name);
        if (name === 'returnUrl' || name.indexOf('page') === 0) {
          const value: string = properties[name];
          if (value !== '') {
            expect(value.indexOf('SitePages/')).toBe(0);
            expect(pageFiles).toContain(value.slice('SitePages/'.length));
          }
        }
      }
      expect(properties.draftServiceUrl).toBe(key === 'idea' ? '{DraftServiceUrl}' : undefined);
      expect(properties.telemetryProvider).toBe(key === 'status' ? '{TelemetryProvider}' : undefined);
    }
    const home: { [name: string]: string } = frontDoorsOf(page('requests'))[0].properties;
    for (const name of ['pageIdea', 'pageToolCheck', 'pageTeamUsage', 'pageHelpTraining', 'pageFeedback', 'pageTelemetry', 'pageAdmin']) {
      expect(home[name]).not.toBe('');
    }
    for (const id of [...WORKFLOW_ORDER, 'admin']) {
      expect(frontDoorsOf(page(id))[0].properties.returnUrl).not.toBe('');
    }
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
    expect(linkTargets().map((target: ILinkTarget): string | undefined => target.page)).not.toContain('admin');
  });

  it('resolves every quick-link and button target', () => {
    const targets: ILinkTarget[] = linkTargets();
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expectLinkTarget(target);
    }
    for (const control of definition.pages.flatMap(controlsOf)) {
      if (control.type === 'quickLinks') {
        expect(control.layout).toBe('button');
        expect(control.items.length).toBeGreaterThan(0);
        expect(control.items.length).toBeLessThanOrEqual(8);
        for (const item of control.items) {
          expect(item.title.length).toBeGreaterThan(0);
        }
      }
      if (control.type === 'button') {
        expect(control.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps section templates, columns and text controls consistent', () => {
    for (const target of definition.pages) {
      expect(target.sections.length).toBeGreaterThan(0);
      for (const section of target.sections) {
        expect(Object.keys(COLUMNS)).toContain(section.template);
        expect(section.columns).toHaveLength(COLUMNS[section.template]);
        for (const column of section.columns) {
          for (const control of column.controls) {
            expect(['text', 'frontDoor', 'quickLinks', 'button']).toContain(control.type);
            if (control.type === 'text') {
              expect(control.html.indexOf('<')).toBe(0);
              expect(control.html).not.toMatch(/<script|<h1/i);
              const hrefs: string[] = (control.html.match(/href="([^"]*)"/g) ?? []).map((match: string): string => match.slice(6, -1));
              for (const href of hrefs) {
                expect(href).toMatch(/^\{(Page|Url):[A-Za-z]+\}$/);
              }
            }
          }
        }
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

  it('contains no client names, tenant hosts or the reference roster', () => {
    for (const file of ['pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      expect(text).not.toMatch(/overture|tegria|cloudwave/i);
      expect(text).not.toMatch(/[a-z0-9-]+\.sharepoint\.com/i);
      expect(text).not.toMatch(/Frerichs|Sides|Martens|Donahue/);
    }
  });
});
