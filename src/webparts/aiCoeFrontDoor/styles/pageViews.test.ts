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
    // The call to action is a 44px target (WCAG 2.5.5); the page tiles already stand 92px, above that floor.
    expect(rule(table, '.ai-view--page a.ai-hero-cta')).toEqual(['min-height:44px', 'text-decoration:none']);
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

  it('lays out prominent tiles, closed cards and the action states', () => {
    expect(rule(table, '.ai-view--page .ai-page-tiles--prominent')).toEqual(['grid-template-columns:repeat(3, minmax(0, 1fr))']);
    expect(rule(table, '.ai-view--page .ai-service-kicker')).toEqual(['color:#5b6878', 'font-size:11px', 'font-weight:800', 'letter-spacing:0.03em', 'margin:0 0 4px', 'text-transform:uppercase']);
    expect(rule(table, '.ai-view--page .ai-service-note')).toEqual(['color:#5b6878', 'display:block', 'font-size:13px', 'font-style:italic', 'line-height:1.45', 'margin-top:6px']);
    expect(rule(table, '.ai-view--page .ai-service-state')).toEqual(['display:block', 'margin-top:8px']);
    expect(rule(table, '.ai-view--page .ai-service-card--closed')).toEqual(['cursor:default', 'opacity:0.85']);
    expect(rule(table, '.ai-view--page .ai-service-card--closed:hover')).toEqual(['border-color:#d4dee6', 'box-shadow:0 5px 12px rgba(28, 49, 70, 0.1)', 'transform:none']);
    expect(rule(table, '.ai-view--page a.ai-service-fallback')).toEqual(['color:#076874', 'display:inline-block', 'font-size:14px', 'font-weight:600', 'margin-top:8px', 'min-height:24px', 'text-decoration:underline']);
    expect(rule(table, '.ai-view--page .ai-hero-cta--closed')).toEqual(['cursor:default', 'opacity:0.85']);
    expect(rule(table, '.ai-view--page .ai-hero-cta--closed:hover')).toEqual(['background:#fff', 'color:#076874', 'transform:none']);
    expect(rule(table, '.ai-view--page .ai-hero-state')).toEqual(['display:block', 'margin-top:12px']);
    expect(rule(table, '.ai-view--page a.ai-hero-fallback')).toEqual(['color:#fff', 'display:inline-block', 'font-weight:600', 'margin:12px 0 0', 'min-height:24px', 'text-decoration:underline']);
    expect(rule(table, '.ai-view--page .ai-hero-note')).toEqual(['font-size:14px', 'margin:10px 0 0', 'opacity:0.9']);
    expect(rule(table, '.ai-view--page .ai-page-tiles .ai-service-card')).toContain('min-height:92px');
    expect(rule(table, '.ai-view--narrow .ai-page-tiles--prominent')).toEqual(['grid-template-columns:1fr']);
  });

  it('lays out the work command as a grid whose controls are 44px targets', () => {
    expect(rule(table, '.ai-view--page .ai-page-command')).toEqual(['align-items:center', 'display:grid', 'gap:10px 12px', 'grid-template-columns:minmax(0, 1fr) auto']);
    expect(rule(table, '.ai-view--page .ai-page-command-label')).toEqual(['color:#10243e', 'font-size:19px', 'font-weight:700', 'grid-column:1/-1', 'line-height:1.3']);
    expect(rule(table, '.ai-view--page .ai-page-command-input')).toEqual(['border-radius:12px', 'font-size:17px', 'line-height:1.4', 'min-height:44px', 'min-width:0', 'padding:10px 14px', 'width:100%']);
    expect(rule(table, '.ai-view--page .ai-page-command-submit')).toEqual(['border-radius:12px', 'cursor:pointer', 'font-size:16px', 'font-weight:700', 'min-height:44px', 'padding:10px 22px', 'white-space:nowrap']);
    for (const line of ['.ai-page-command-note', '.ai-page-command-alert', '.ai-page-command-status']) {
      expect(rule(table, `.ai-view--page ${line}`)).toContain('grid-column:1/-1');
      expect(rule(table, `.ai-view--page ${line}`)).toContain('font-size:14px');
    }
    expect(rule(table, '.ai-view--page .ai-page-command-note')).toContain('color:#5b6878');
    expect(rule(table, '.ai-view--page .ai-page-command-note a')).toEqual(['color:#076874', 'font-weight:600', 'text-decoration:underline']);
    expect(rule(table, '.ai-view--page .ai-page-command-alert')).toContain('color:#9b1c1c');
    expect(rule(table, '.ai-view--page .ai-page-command-status')).toContain('color:#076b67');
    expect(rule(table, '.ai-view--narrow .ai-page-command')).toEqual(['grid-template-columns:1fr']);
  });

  it('draws a notice with a toned left edge and spaces the rules list', () => {
    expect(rule(table, '.ai-view--page .ai-page-notice')).toEqual([
      'background:#fff',
      'border-radius:13px',
      'border:1px solid #dbe5ec',
      'color:#2b3d52',
      'font-size:15px',
      'line-height:1.5',
      'max-width:860px',
      'padding:14px 18px'
    ]);
    // The tone is carried by the left edge and the title, never by colour alone: info in the shipped link blue, caution in the amber lane ink.
    expect(rule(table, '.ai-view--page .ai-page-notice--info')).toEqual(['border-left:5px solid #0b66d4']);
    expect(rule(table, '.ai-view--page .ai-page-notice--caution')).toEqual(['border-left:5px solid #725600']);
    for (const colour of ['#0b66d4', '#725600']) {
      expect(shipped.indexOf(colour)).toBeGreaterThan(-1);
    }
    expect(rule(table, '.ai-view--page .ai-page-notice-title')).toEqual(['color:#10243e', 'display:block', 'font-size:16px', 'margin:0 0 4px']);
    expect(rule(table, '.ai-view--page .ai-page-notice-text')).toEqual(['margin:0']);
    expect(rule(table, '.ai-view--page .ai-page-notice a')).toEqual(['color:#076874', 'font-weight:600', 'text-decoration:underline']);
    expect(rule(table, '.ai-view--page .ai-page-rules-title')).toEqual(['color:#10243e', 'font-size:18px', 'font-weight:700', 'line-height:1.3', 'margin:0 0 10px']);
    expect(rule(table, '.ai-view--page .ai-page-rules')).toEqual(['color:#2b3d52', 'font-size:16px', 'line-height:1.5', 'margin:0', 'max-width:860px', 'padding:0 0 0 26px']);
    expect(rule(table, '.ai-view--page .ai-page-rules > li')).toEqual(['padding-left:6px']);
    expect(rule(table, '.ai-view--page .ai-page-rules > li + li')).toEqual(['margin-top:10px']);
    expect(rule(table, '.ai-view--page .ai-page-rule-title')).toEqual(['color:#10243e', 'display:block']);
    expect(rule(table, '.ai-view--page .ai-page-rules a')).toEqual(['color:#076874', 'font-weight:600', 'text-decoration:underline']);
  });

  it('draws the shared footer and the support route in every page view, the routing grid as cards on the card surface', () => {
    // Scoped to `.ai-view`, not `.ai-view--page`: the footer sits below the wizard views as well.
    expect(rule(table, '.ai-view .ai-page-block--shared')).toEqual(['border-top:1px solid #dbe5ec', 'margin-top:32px', 'padding-top:24px']);
    expect(rule(table, '.ai-view .ai-page-block--shared .ai-page-block + .ai-page-block')).toEqual(['margin-top:24px']);
    expect(rule(table, '.ai-view .ai-page-support')).toEqual(['color:#2b3d52', 'font-size:15px', 'line-height:1.5']);
    expect(rule(table, '.ai-view .ai-page-support-title')).toEqual(['color:#10243e', 'font-size:20px', 'font-weight:700', 'line-height:1.3', 'margin:0 0 8px']);
    expect(rule(table, '.ai-view .ai-page-support-route')).toEqual(['font-size:16px', 'margin:0 0 16px']);
    expect(rule(table, '.ai-view .ai-page-support a')).toEqual(['color:#076874', 'font-weight:600', 'text-decoration:underline']);
    expect(rule(table, '.ai-view .ai-page-support-columns')).toEqual(['display:grid', 'gap:16px 24px', 'grid-template-columns:repeat(2, minmax(0, 1fr))', 'margin:0 0 16px']);
    expect(rule(table, '.ai-view .ai-page-support-heading')).toEqual(['color:#10243e', 'font-size:15px', 'font-weight:700', 'line-height:1.3', 'margin:0 0 6px']);
    expect(rule(table, '.ai-view .ai-page-support-list')).toEqual(['margin:0', 'padding:0 0 0 20px']);
    expect(rule(table, '.ai-view .ai-page-support-grid')).toEqual(['display:grid', 'gap:10px', 'margin:0']);
    expect(rule(table, '.ai-view .ai-page-support-row')).toEqual([
      'background:#fff',
      'border-radius:13px',
      'border:1px solid #dbe5ec',
      'display:grid',
      'gap:4px 16px',
      'grid-template-columns:minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr)',
      'padding:12px 16px'
    ]);
    expect(rule(table, '.ai-view .ai-page-support-row dt')).toEqual(['color:#10243e', 'font-weight:700']);
    expect(rule(table, '.ai-view .ai-page-support-row dd')).toEqual(['margin:0']);
    expect(rule(table, '.ai-view .ai-page-support-key')).toEqual(['color:#5b6878', 'display:block', 'font-size:11px', 'font-weight:800', 'letter-spacing:0.03em', 'text-transform:uppercase']);
    // The edges, inks and link colour are the shipped ones; the body ink #2b3d52 is the page views' own, as on the notice.
    for (const colour of ['#dbe5ec', '#10243e', '#076874', '#5b6878']) {
      expect(shipped.indexOf(colour)).toBeGreaterThan(-1);
    }
    expect(rule(table, '.ai-view--narrow .ai-page-support-columns')).toEqual(['grid-template-columns:1fr']);
    expect(rule(table, '.ai-view--narrow .ai-page-support-row')).toEqual(['grid-template-columns:1fr']);
  });

  it('draws the page-view chrome: the header line and the identity line, in every page view', () => {
    // The header keeps the shipped workflow header's size and weight; the identity line is quiet, in the shipped muted ink.
    expect(rule(table, '.ai-view .ai-page-header')).toEqual(['margin:0']);
    expect(rule(table, '.ai-view .ai-page-identity')).toEqual(['color:#5b6878', 'font-size:13px', 'line-height:1.4', 'margin:0 0 16px']);
    expect(shipped.indexOf('#5b6878')).toBeGreaterThan(-1);
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

  it('gives every focusable control in a page view the shipped 3px focus ring (WCAG 2.2 2.4.7, 2.4.11)', () => {
    // The ring is the shipped service-card ring (#0b66d4, 3px, offset 3px), applied by element so a block never ships a control without one.
    for (const control of ['a', 'button', 'input', 'select', 'textarea']) {
      expect(rule(table, `.ai-view ${control}:focus-visible`)).toEqual(['outline-offset:3px', 'outline:3px solid #0b66d4']);
    }
    expect(shipped.indexOf('outline: 3px solid #0b66d4')).toBeGreaterThan(-1);
    // On the dark hero the ring keeps the shipped hero colour, which the blue ring would not contrast against.
    expect(rule(table, '.ai-view .ai-hero a:focus-visible')).toEqual(['outline-color:#8be9ff']);
    expect(shipped.indexOf('outline: 3px solid #8be9ff')).toBeGreaterThan(-1);
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
