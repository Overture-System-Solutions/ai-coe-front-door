/**
 * Stylesheet parity with package 1.0.0.7.
 *
 * The shipped web part carried one stylesheet (Tailwind utilities followed by hand-written rules,
 * kept verbatim in parity/AiCoeFrontDoor.global.1.0.0.7.css) plus a theme block injected at runtime
 * (parity/theme.1.0.0.7.css). The port regenerates the utilities from the TSX class names, keeps the
 * hand-written rules in frontDoor.global.css and scopes the theme block in theme.global.css.
 *
 * Both sides are pushed through the same autoprefixer + cssnano pipeline that SharePoint Framework
 * applies when packaging, so formatting differences disappear and only real rule or declaration
 * differences remain.
 */
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import * as fs from 'fs';
import * as path from 'path';
import postcss from 'postcss';
import type { AtRule, ChildNode, Container, Declaration, Document, Root, Rule } from 'postcss';

type RuleTable = { [key: string]: string[] };

const ROOT: string = process.cwd();
const SHIPPED_STYLESHEET: string = path.join(ROOT, 'parity/AiCoeFrontDoor.global.1.0.0.7.css');
const SHIPPED_THEME: string = path.join(ROOT, 'parity/theme.1.0.0.7.css');
const COMPILED: string = path.join(ROOT, 'lib-commonjs/webparts/aiCoeFrontDoor/styles');
const WEB_PART_ROOT: string = '#overture-ai-coe-pilot';

async function shippedForm(css: string): Promise<Root> {
  const result = await postcss([autoprefixer(), cssnano({ preset: 'default' })]).process(css, { from: undefined });
  return postcss.parse(result.css);
}

function atRuleContext(rule: Rule): string {
  const parts: string[] = [];
  let parent: Container | Document | undefined = rule.parent;
  while (parent !== undefined && parent.type === 'atrule') {
    const atRule: AtRule = parent as AtRule;
    parts.unshift(`@${atRule.name} ${atRule.params}`.replace(/\s+/g, ' ').trim());
    parent = atRule.parent;
  }
  return parts.join(' > ');
}

function declarationsOf(rule: Rule): string[] {
  const out: string[] = [];
  rule.each((child: ChildNode): void => {
    if (child.type === 'decl') {
      const declaration: Declaration = child;
      const value: string = declaration.value.replace(/\s+/g, ' ').trim().toLowerCase();
      out.push(`${declaration.prop.toLowerCase()}:${value}${declaration.important ? '!important' : ''}`);
    }
  });
  return out.sort();
}

function normaliseSelector(selector: string): string {
  return selector.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
}

/** Every rule keyed by its at-rule context and selector, with sorted canonical declarations. */
function tabulate(root: Root): RuleTable {
  const table: RuleTable = {};
  root.walkRules((rule: Rule): void => {
    const key: string = `${atRuleContext(rule)} :: ${normaliseSelector(rule.selector)}`;
    const declarations: string[] = declarationsOf(rule);
    table[key] = table[key] === undefined ? declarations : table[key].concat(declarations).sort();
  });
  return table;
}

function merge(first: RuleTable, second: RuleTable): RuleTable {
  const merged: RuleTable = {};
  for (const key of Object.keys(first)) {
    merged[key] = first[key];
  }
  for (const key of Object.keys(second)) {
    merged[key] = merged[key] === undefined ? second[key] : merged[key].concat(second[key]).sort();
  }
  return merged;
}

function keysMissingFrom(expected: RuleTable, actual: RuleTable): string[] {
  return Object.keys(expected)
    .filter((key: string): boolean => actual[key] === undefined)
    .sort();
}

function sharedKeys(first: RuleTable, second: RuleTable): string[] {
  return Object.keys(first)
    .filter((key: string): boolean => second[key] !== undefined)
    .sort();
}

function declarationMismatches(expected: RuleTable, actual: RuleTable): string[] {
  return sharedKeys(expected, actual)
    .filter((key: string): boolean => expected[key].join(';') !== actual[key].join(';'))
    .map((key: string): string => `${key}\n    shipped: ${expected[key].join('; ')}\n    ported:  ${actual[key].join('; ')}`);
}

/**
 * Undoes the two scoping changes of theme.global.css before minification, so cssnano sees the same
 * selectors on both sides (it refuses to merge rules whose selectors contain `:where()`).
 */
function unscopeTheme(css: string): string {
  return css.split(`:where(${WEB_PART_ROOT}) `).join('').replace(/^#overture-ai-coe-pilot\s*\{/m, ':root {');
}

describe('Stylesheet parity with package 1.0.0.7', () => {
  let shipped: RuleTable;
  let utilities: RuleTable;
  let handWritten: RuleTable;
  let shippedTheme: RuleTable;
  let portedTheme: RuleTable;

  beforeAll(async (): Promise<void> => {
    const read = (file: string): string => fs.readFileSync(file, 'utf8');
    shipped = tabulate(await shippedForm(read(SHIPPED_STYLESHEET)));
    utilities = tabulate(await shippedForm(read(path.join(COMPILED, 'tailwind.generated.global.css.css'))));
    handWritten = tabulate(await shippedForm(read(path.join(COMPILED, 'frontDoor.global.css.css'))));
    shippedTheme = tabulate(await shippedForm(read(SHIPPED_THEME)));
    portedTheme = tabulate(await shippedForm(unscopeTheme(read(path.join(COMPILED, 'theme.global.css.css')))));
  });

  it('keeps the generated utilities and the hand-written rules disjoint', () => {
    expect(sharedKeys(utilities, handWritten)).toEqual([]);
  });

  it('regenerates every shipped rule and nothing else', () => {
    const ported: RuleTable = merge(utilities, handWritten);
    expect(keysMissingFrom(shipped, ported)).toEqual([]);
    expect(keysMissingFrom(ported, shipped)).toEqual([]);
  });

  it('matches the declarations of every shipped rule', () => {
    expect(declarationMismatches(shipped, merge(utilities, handWritten))).toEqual([]);
  });

  it('scopes the runtime theme block without changing its rules', () => {
    expect(keysMissingFrom(shippedTheme, portedTheme)).toEqual([]);
    expect(keysMissingFrom(portedTheme, shippedTheme)).toEqual([]);
    expect(declarationMismatches(shippedTheme, portedTheme)).toEqual([]);
  });
});
