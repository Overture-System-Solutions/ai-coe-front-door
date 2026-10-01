/**
 * Guards the fifth stylesheet: the media queries the page views need (viewport reflow and reduced motion).
 * `pageViews.global.scss` forbids at-rules (`pageViews.test.ts`), so they live here, in a file that holds
 * nothing else. Every inner rule is scoped like the page view rules, so the shipped stylesheets, which carry
 * their own breakpoints for the legacy view, are never shadowed and the 1.0.0.7 parity comparison stays
 * untouched (it reads only the generated utilities, `frontDoor` and the theme block).
 */
import * as fs from 'fs';
import * as path from 'path';
import postcss from 'postcss';
import type { AtRule, ChildNode, Declaration, Root, Rule } from 'postcss';

const ROOT: string = process.cwd();
const COMPILED: string = path.join(ROOT, 'lib-commonjs/webparts/aiCoeFrontDoor/styles/pageResponsive.global.scss.css');
const SHIPPED_STYLESHEET: string = path.join(ROOT, 'parity/AiCoeFrontDoor.global.1.0.0.7.css');
/** The scope regex of pageViews.test.ts: the web part root, then a page view class. */
const SCOPED_SELECTOR: RegExp = /^#overture-ai-coe-pilot (\.overture-app)?\.ai-view(--(home|telemetry|narrow|page))?( |$)/;
const EXPECTED_QUERIES: string[] = ['(max-width: 480px)', '(max-width: 800px)', '(prefers-reduced-motion: reduce)'];

type DeclarationTable = { [selector: string]: string[] };
type QueryTable = { [params: string]: DeclarationTable };

function selectorsOf(rule: Rule): string[] {
  return rule.selector.split(',').map((selector: string): string => selector.replace(/\s+/g, ' ').trim());
}

function declarationsOf(rule: Rule): string[] {
  const declarations: string[] = [];
  rule.each((child: ChildNode): void => {
    if (child.type === 'decl') {
      const declaration: Declaration = child;
      const value: string = declaration.value.replace(/\s+/g, ' ').trim().toLowerCase();
      declarations.push(`${declaration.prop.toLowerCase()}:${value}${declaration.important ? ' !important' : ''}`);
    }
  });
  return declarations;
}

/** Every rule keyed by the media query it sits in, then by selector, with sorted canonical declarations. */
function tabulate(root: Root): QueryTable {
  const queries: QueryTable = {};
  root.each((node: ChildNode): void => {
    if (node.type !== 'atrule') {
      return;
    }
    const atRule: AtRule = node;
    const params: string = atRule.params.replace(/\s+/g, ' ').trim();
    const table: DeclarationTable = queries[params] ?? {};
    atRule.each((child: ChildNode): void => {
      if (child.type !== 'rule') {
        return;
      }
      const declarations: string[] = declarationsOf(child);
      for (const selector of selectorsOf(child)) {
        table[selector] = (table[selector] ?? []).concat(declarations).sort();
      }
    });
    queries[params] = table;
  });
  return queries;
}

function rule(queries: QueryTable, params: string, selector: string): string[] {
  return queries[params][`#overture-ai-coe-pilot ${selector}`];
}

describe('Page responsive stylesheet', () => {
  let source: string;
  let root: Root;
  let queries: QueryTable;
  let shipped: string;

  beforeAll((): void => {
    source = fs.readFileSync(COMPILED, 'utf8');
    root = postcss.parse(source);
    queries = tabulate(root);
    shipped = fs.readFileSync(SHIPPED_STYLESHEET, 'utf8');
  });

  it('stays ASCII, so Sass never emits @charset', () => {
    let nonAscii: number = 0;
    for (let index: number = 0; index < source.length; index += 1) {
      if (source.charCodeAt(index) > 127) {
        nonAscii += 1;
      }
    }
    expect(nonAscii).toBe(0);
  });

  it('holds only media at-rules, one per query, and nothing at the top level', () => {
    const topLevel: string[] = [];
    root.each((node: ChildNode): void => {
      if (node.type === 'comment') {
        return;
      }
      topLevel.push(node.type === 'atrule' ? `@${node.name} ${node.params.replace(/\s+/g, ' ').trim()}` : node.type);
    });
    expect(topLevel.slice().sort()).toEqual(EXPECTED_QUERIES.map((params: string): string => `@media ${params}`));
    root.walkAtRules((atRule: AtRule): void => {
      expect(atRule.name).toBe('media');
      expect(atRule.parent).toBe(root);
    });
  });

  it('scopes every inner rule to the web part root and a page view class', () => {
    const selectors: string[] = [];
    root.walkRules((inner: Rule): void => {
      expect(inner.parent && inner.parent.type).toBe('atrule');
      selectors.push(...selectorsOf(inner));
    });
    expect(selectors.length).toBeGreaterThan(5);
    expect(selectors.filter((selector: string): boolean => !SCOPED_SELECTOR.test(selector))).toEqual([]);
    expect(shipped.indexOf('.ai-view')).toBe(-1);
  });

  it('stacks the page grids and the work command in one column below 800px, whatever the layout setting', () => {
    for (const grid of ['.ai-page-tiles', '.ai-page-tiles--prominent', '.ai-page-cards', '.ai-page-cards--3', '.ai-page-cases', '.ai-page-workflows', '.ai-page-lanes', '.ai-page-status', '.ai-page-command']) {
      expect(rule(queries, '(max-width: 800px)', `.ai-view ${grid}`)).toEqual(['grid-template-columns:1fr']);
    }
    for (const grid of ['.ai-page-support-columns', '.ai-page-support-row']) {
      expect(rule(queries, '(max-width: 800px)', `.ai-view ${grid}`)).toEqual(['grid-template-columns:1fr']);
    }
    expect(rule(queries, '(max-width: 800px)', '.ai-view .ai-hero-copy')).toEqual(['max-width:none', 'padding:26px 22px']);
  });

  it('drops the hero illustration below 480px', () => {
    expect(rule(queries, '(max-width: 480px)', '.ai-view .ai-hero-network')).toEqual(['display:none']);
  });

  it('removes transitions and hover lifts inside the blocks when the person prefers reduced motion (WCAG 2.2 2.3.3)', () => {
    expect(rule(queries, '(prefers-reduced-motion: reduce)', '.ai-view .ai-page-block *')).toEqual(['transition:none !important']);
    for (const lifted of ['.ai-hero-cta:hover', '.ai-service-card:hover']) {
      expect(rule(queries, '(prefers-reduced-motion: reduce)', `.ai-view ${lifted}`)).toEqual(['transform:none !important']);
    }
    // The two lifts are the shipped ones; the reset mirrors the shipped reduced-motion rule for the page views.
    expect(shipped.indexOf('transform: translateY(-1px)')).toBeGreaterThan(-1);
    expect(shipped.indexOf('transform: translateY(-2px)')).toBeGreaterThan(-1);
  });
});
