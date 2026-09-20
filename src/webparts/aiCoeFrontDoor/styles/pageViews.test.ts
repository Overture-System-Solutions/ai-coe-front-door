/**
 * Guards the page view stylesheet: additive modifier rules that let one piece sit inside a native
 * page section. Every rule is scoped under a `.ai-view` class so no shipped rule is shadowed, and the
 * file stays outside the 1.0.0.7 parity comparison, which reads only the three shipped stylesheets.
 */
import * as fs from 'fs';
import * as path from 'path';
import postcss from 'postcss';
import type { ChildNode, Declaration, Root, Rule } from 'postcss';

const ROOT: string = process.cwd();
const COMPILED: string = path.join(ROOT, 'lib-commonjs/webparts/aiCoeFrontDoor/styles/pageViews.global.scss.css');
const SHIPPED_STYLESHEET: string = path.join(ROOT, 'parity/AiCoeFrontDoor.global.1.0.0.7.css');
const SHIPPED_THEME: string = path.join(ROOT, 'parity/theme.1.0.0.7.css');
const SCOPED_SELECTOR: RegExp = /^#overture-ai-coe-pilot (\.overture-app)?\.ai-view(--(home|telemetry|narrow|page))?( |$)/;

type DeclarationTable = { [selector: string]: string[] };

function selectorsOf(rule: Rule): string[] {
  return rule.selector.split(',').map((selector: string): string => selector.replace(/\s+/g, ' ').trim());
}

function tabulate(root: Root): DeclarationTable {
  const table: DeclarationTable = {};
  root.walkRules((rule: Rule): void => {
    const declarations: string[] = [];
    rule.each((child: ChildNode): void => {
      if (child.type === 'decl') {
        const declaration: Declaration = child;
        declarations.push(`${declaration.prop.toLowerCase()}:${declaration.value.replace(/\s+/g, ' ').trim().toLowerCase()}`);
      }
    });
    for (const selector of selectorsOf(rule)) {
      table[selector] = (table[selector] ?? []).concat(declarations).sort();
    }
  });
  return table;
}

function rule(table: DeclarationTable, selector: string): string[] {
  return table[`#overture-ai-coe-pilot ${selector}`];
}

describe('Page view stylesheet', () => {
  let root: Root;
  let table: DeclarationTable;
  let shipped: string;
  let shippedTheme: string;

  beforeAll((): void => {
    root = postcss.parse(fs.readFileSync(COMPILED, 'utf8'));
    table = tabulate(root);
    shipped = fs.readFileSync(SHIPPED_STYLESHEET, 'utf8');
    shippedTheme = fs.readFileSync(SHIPPED_THEME, 'utf8');
  });

  it('scopes every rule to the web part root and a page view class', () => {
    const selectors: string[] = Object.keys(table);
    expect(selectors.length).toBeGreaterThan(10);
    expect(selectors.filter((selector: string): boolean => !SCOPED_SELECTOR.test(selector))).toEqual([]);
  });

  it('uses no at-rules', () => {
    let atRules: number = 0;
    root.walkAtRules((): void => {
      atRules += 1;
    });
    expect(atRules).toBe(0);
  });

  it('adds no selector the shipped stylesheet or theme block defines', () => {
    expect(shipped.indexOf('.ai-view')).toBe(-1);
    expect(shippedTheme.indexOf('.ai-view')).toBe(-1);
    const shippedSelectors: string[] = Object.keys(tabulate(postcss.parse(shipped)));
    expect(Object.keys(table).filter((selector: string): boolean => shippedSelectors.indexOf(selector) >= 0)).toEqual([]);
  });

  it('strips the page chrome around a piece', () => {
    expect(rule(table, '.overture-app.ai-view')).toEqual(['background:transparent']);
    expect(rule(table, '.ai-view .ai-home-shell')).toEqual(['padding:0 0 16px']);
    expect(rule(table, '.ai-view .ai-workflow-shell')).toEqual(['padding:0 0 16px']);
    expect(rule(table, '.ai-view--home .ai-path-section')).toEqual(['padding:0']);
    expect(rule(table, '.ai-view--home a.ai-service-card')).toEqual(['text-decoration:none']);
    expect(rule(table, '.ai-view--home .ai-resource-strip')).toEqual(['margin:16px 0 0']);
    expect(rule(table, '.ai-view--home .ai-resource-strip--four')).toEqual(['grid-template-columns:repeat(4, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--home .ai-home-adminbar')).toEqual(['margin:0 0 14px']);
    expect(rule(table, '.ai-view--home .ai-home-adminbar .ai-admin-back')).toEqual(['background:#087f83', 'border-color:#087f83', 'color:#fff', 'text-decoration:none']);
    expect(rule(table, '.ai-view--home .ai-home-adminbar .ai-admin-back:hover')).toEqual(['background:#055d66', 'color:#fff']);
    expect(rule(table, '.ai-view--telemetry .ai-usage-section')).toEqual(['margin:0']);
  });

  it('lays out the content page blocks with the shipped card vocabulary', () => {
    expect(rule(table, '.ai-view--page .ai-page-block + .ai-page-block')).toEqual(['margin-top:24px']);
    expect(rule(table, '.ai-view--page .ai-page-block--heading + .ai-page-block')).toEqual(['margin-top:0']);
    expect(rule(table, '.ai-view--page .ai-page-heading')).toEqual(['color:#17283b', 'font-size:24px', 'font-weight:700', 'line-height:1.3', 'margin:0 0 12px']);
    expect(rule(table, '.ai-view--page .ai-page-paragraph')).toContain('font-size:17px');
    expect(rule(table, '.ai-view--page .ai-hero-copy p a')).toEqual(['color:#fff', 'text-decoration:underline']);
    expect(rule(table, '.ai-view--page a.ai-hero-cta')).toEqual(['text-decoration:none']);
    expect(rule(table, '.ai-view--page a.ai-service-card')).toEqual(['text-decoration:none']);
    expect(rule(table, '.ai-view--page .ai-page-tiles')).toEqual(['display:grid', 'gap:16px', 'grid-template-columns:repeat(auto-fit, minmax(220px, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-page-tiles .ai-service-card')).toEqual(['grid-column:auto', 'min-height:92px']);
    expect(rule(table, '.ai-view--page .ai-page-cards')).toEqual(['display:grid', 'gap:16px', 'grid-template-columns:repeat(2, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-page-cards--3')).toEqual(['grid-template-columns:repeat(3, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-page-card')).toEqual(['background:#fff', 'border-radius:13px', 'border:1px solid #dbe5ec', 'min-width:0', 'padding:17px 18px 15px']);
    expect(rule(table, '.ai-view--page .ai-page-lane')).toEqual(rule(table, '.ai-view--page .ai-page-card'));
    expect(rule(table, '.ai-view--page .ai-page-card--teal')).toEqual(['background:linear-gradient(112deg, #f7fffd, #f0faf9)', 'border-left:5px solid #07878a']);
    expect(rule(table, '.ai-view--page .ai-page-card--cyan')).toEqual(['background:linear-gradient(112deg, #f7fdff, #ecf8fc)', 'border-left:5px solid #0e8fa3']);
    for (const tone of ['blue', 'violet', 'gold']) {
      expect(rule(table, `.ai-view--page .ai-page-card--${tone}`)).toHaveLength(2);
    }
    expect(rule(table, '.ai-view--page .ai-page-card-kicker')).toContain('text-transform:uppercase');
    expect(rule(table, '.ai-view--page .ai-page-card-meta')).toContain('font-style:italic');
    expect(rule(table, '.ai-view--page .ai-page-lanes')).toEqual(['display:grid', 'gap:16px', 'grid-template-columns:repeat(3, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-page-lane--green')).toEqual(['background:linear-gradient(112deg, #f4fdf9, #ddf6f0)', 'border-top:5px solid #076b67']);
    expect(rule(table, '.ai-view--page .ai-page-lane--amber')).toEqual(['background:linear-gradient(112deg, #fffcf2, #fff4cf)', 'border-top:5px solid #725600']);
    expect(rule(table, '.ai-view--page .ai-page-lane--red')).toEqual(['background:linear-gradient(112deg, #fff6f6, #fde8e8)', 'border-top:5px solid #9b1c1c']);
    expect(rule(table, '.ai-view--page .ai-page-lane--green .ai-page-lane-badge')).toEqual(['background:#ddf6f0', 'color:#076b67']);
    expect(rule(table, '.ai-view--page .ai-page-lane--amber .ai-page-lane-badge')).toEqual(['background:#fff4cf', 'color:#725600']);
    expect(rule(table, '.ai-view--page .ai-page-lane--red .ai-page-lane-badge')).toEqual(['background:#fde8e8', 'color:#9b1c1c']);
    expect(rule(table, '.ai-view--page .ai-page-status')).toEqual(['display:grid', 'gap:12px 24px', 'grid-template-columns:repeat(2, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-usage-section')).toEqual(['margin:0']);
    expect(rule(table, '.ai-view--page .ai-path-section')).toEqual(['padding:0']);
    expect(rule(table, '.ai-view--page .ai-resource-strip')).toEqual(['margin:16px 0 0']);
    expect(rule(table, '.ai-view--page .ai-resource-strip--four')).toEqual(['grid-template-columns:repeat(4, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-home-adminbar .ai-admin-back')).toEqual(['background:#087f83', 'border-color:#087f83', 'color:#fff', 'text-decoration:none']);
  });

  it('draws the status pill as text plus an icon shape in every page view', () => {
    expect(rule(table, '.ai-view .ai-pill')).toEqual([
      'align-items:center',
      'border-radius:999px',
      'display:inline-flex',
      'font-size:11px',
      'font-weight:800',
      'gap:6px',
      'letter-spacing:0.02em',
      'line-height:1.2',
      'min-height:24px',
      'padding:2px 10px',
      'vertical-align:middle',
      'white-space:nowrap'
    ]);
    expect(rule(table, '.ai-view .ai-pill svg')).toEqual(['height:12px', 'width:12px']);
    expect(rule(table, '.ai-view .ai-pill code')).toEqual(['font-family:inherit', 'font-size:inherit', 'font-weight:600']);
    // The traffic-light tones reuse the lane pairs the shipped stylesheet already draws.
    expect(rule(table, '.ai-view .ai-pill--green')).toEqual(['background:#ddf6f0', 'color:#076b67']);
    expect(rule(table, '.ai-view .ai-pill--amber')).toEqual(['background:#fff4cf', 'color:#725600']);
    expect(rule(table, '.ai-view .ai-pill--red')).toEqual(['background:#fde8e8', 'color:#9b1c1c']);
    for (const colour of ['#ddf6f0', '#076b67', '#fff4cf', '#725600', '#fde8e8', '#9b1c1c']) {
      expect(shipped.indexOf(colour)).toBeGreaterThan(-1);
    }
    // The blue draft tone is a new pair: no shipped stylesheet or theme block carries it.
    expect(rule(table, '.ai-view .ai-pill--blue')).toEqual(['background:#e7f0fb', 'color:#0b4a9b']);
    for (const colour of ['#e7f0fb', '#0b4a9b']) {
      expect(shipped.indexOf(colour)).toBe(-1);
      expect(shippedTheme.indexOf(colour)).toBe(-1);
    }
  });

  it('stacks the content page blocks in the narrow layout', () => {
    for (const grid of ['.ai-page-tiles', '.ai-page-cards', '.ai-page-cards--3', '.ai-page-lanes', '.ai-page-status']) {
      expect(rule(table, `.ai-view--narrow ${grid}`)).toEqual(['grid-template-columns:1fr']);
    }
    expect(rule(table, '.ai-view--narrow .ai-hero')).toEqual(['display:block', 'min-height:0']);
    expect(rule(table, '.ai-view--narrow .ai-hero-copy')).toEqual(['max-width:none', 'padding:26px 22px']);
    expect(rule(table, '.ai-view--narrow .ai-hero-network')).toEqual(['display:none']);
  });

  it('stacks the pieces in the narrow layout like the shipped phone breakpoints', () => {
    expect(rule(table, '.ai-view--narrow .ai-workflow-shell')).toEqual(['max-width:none']);
    expect(rule(table, '.ai-view--narrow .ai-home-grid .ai-service-card')).toEqual(['grid-column:span 6']);
    expect(rule(table, '.ai-view--narrow .ai-service-card')).toEqual(['grid-template-columns:52px minmax(0, 1fr) 20px', 'padding:17px 16px']);
    expect(rule(table, '.ai-view--narrow .ai-service-icon')).toEqual(['height:38px', 'width:38px']);
    expect(rule(table, '.ai-view--narrow .ai-resource-strip')).toEqual(['grid-template-columns:1fr']);
    expect(rule(table, '.ai-view--narrow .ai-resource-link + .ai-resource-link')).toEqual(['border-left:0', 'border-top:1px solid #d7e0e8']);
    expect(rule(table, '.ai-view--narrow .ai-usage-heading-row')).toEqual(['display:block']);
    expect(rule(table, '.ai-view--narrow .ai-usage-connection')).toEqual(['display:inline-block', 'margin-top:8px']);
    expect(rule(table, '.ai-view--narrow .ai-usage-grid')).toEqual(['grid-template-columns:1fr']);
    expect(rule(table, '.ai-view--narrow .ai-admin-metrics')).toEqual(['grid-template-columns:repeat(2, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--narrow .ai-admin-workspace')).toEqual(['grid-template-columns:1fr']);
    expect(rule(table, '.ai-view--narrow .ai-admin-record')).toEqual(['grid-template-columns:minmax(160px, 1fr) 78px 18px']);
    expect(rule(table, '.ai-view--narrow .ai-admin-record-date')).toEqual(['display:none']);
    expect(rule(table, '.ai-view--narrow .ai-admin-status')).toEqual(['display:none']);
    expect(rule(table, '.ai-view--narrow .ai-admin-decisions')).toEqual(['grid-template-columns:1fr']);
  });
});
