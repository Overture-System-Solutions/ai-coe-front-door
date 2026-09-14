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
const SCOPED_SELECTOR: RegExp = /^#overture-ai-coe-pilot (\.overture-app)?\.ai-view(--(home|telemetry|narrow))?( |$)/;

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
