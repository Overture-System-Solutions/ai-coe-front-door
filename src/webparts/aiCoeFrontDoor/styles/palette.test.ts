/**
 * Palette tokens (1.0.0.14, decision 11). A tenant's colours are a parameter, never code: the script writes them to
 * the `paletteOverrides` property and the web part sets them as `--fd-*` custom properties on its own `domElement`,
 * exactly as `onThemeChanged` sets `--bodyText`. That only works while no stylesheet declares a `--fd-*` value of its
 * own: a declaration on `#overture-ai-coe-pilot .ai-view` would win over the value inherited from the element above
 * it, and every override would be dead. So the rules read a token through `var(--fd-x, <literal>)` alone, with a
 * fallback literal the front door already draws (the shipped colour, or for the draft blue the page-view pair of
 * 1.0.0.12), and this test reads every compiled stylesheet to prove it.
 */
import * as fs from 'fs';
import * as path from 'path';
import postcss from 'postcss';
import type { Declaration, Root, Rule } from 'postcss';
import { PALETTE_KEYS, paletteCustomProperty } from '../content/palette';
import type { PaletteKey } from '../content/palette';

const ROOT: string = process.cwd();
const COMPILED: string = path.join(ROOT, 'lib-commonjs/webparts/aiCoeFrontDoor');
const WEB_PART_ROOT: string = '#overture-ai-coe-pilot';

/** The fallback each token carries wherever it is read: the colour the front door draws when no tenant sets one. */
const FALLBACKS: { [name: string]: string } = {
  '--fd-accent': '#087f83',
  '--fd-ink': '#10243e',
  '--fd-muted': '#5b6878',
  '--fd-bg': '#f7fafc',
  '--fd-paper': '#fff',
  '--fd-focus': '#0b66d4',
  '--fd-state-green': '#ddf6f0',
  '--fd-state-blue': '#e7f0fb',
  '--fd-state-amber': '#fff4cf',
  '--fd-state-red': '#fde8e8'
};

/**
 * The nine colours of the reference palette (`08_FRONT-DOOR-AND-ENGINEERING-COCKPIT-SPEC-v3.3.md`, "Visual system").
 * They are an example override in the README and never a value in the repository. Paper (#FFFFFF) is left out: white
 * is white, and the shipped stylesheets are full of it.
 */
const REFERENCE_PALETTE: string[] = ['#062A46', '#0B4267', '#0878D1', '#21B5D8', '#008B83', '#102B3D', '#5B7180', '#EDF5F9'];

/** Every `var(--fd-…)` a stylesheet reads, as written. */
const TOKEN_READ: RegExp = /var\(\s*(--fd-[a-z-]*)\s*([^)]*)\)/g;
/** Any `--fd-…` declaration: the thing no stylesheet may carry. */
const TOKEN_DECLARATION: RegExp = /^--fd-/;

function cssFiles(suffix: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory)) {
      const full: string = path.join(directory, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.slice(-suffix.length) === suffix) {
        found.push(full);
      }
    }
  };
  walk(COMPILED);
  return found.sort();
}

interface ITokenRead {
  file: string;
  selector: string;
  name: string;
  rest: string;
}

/** Every token a declaration reads, with what follows the name; comments are left out, as postcss walks rules only. */
function tokenReads(files: string[]): ITokenRead[] {
  const reads: ITokenRead[] = [];
  for (const file of files) {
    const root: Root = postcss.parse(fs.readFileSync(file, 'utf8'));
    root.walkDecls((declaration: Declaration): void => {
      const selector: string =
        declaration.parent === undefined || declaration.parent.type !== 'rule'
          ? ''
          : (declaration.parent as Rule).selector.replace(/\s+/g, ' ').trim();
      let match: RegExpExecArray | null = TOKEN_READ.exec(declaration.value);
      while (match !== null) {
        reads.push({ file: path.basename(file), selector, name: match[1], rest: match[2].trim() });
        match = TOKEN_READ.exec(declaration.value);
      }
    });
  }
  return reads;
}

describe('Palette tokens', () => {
  const globalSheets: string[] = cssFiles('.global.scss.css');
  const allSheets: string[] = cssFiles('.css');
  const reads: ITokenRead[] = tokenReads(globalSheets);

  it('compiles the five global stylesheets the web part imports', () => {
    expect(globalSheets.map((file: string): string => path.basename(file))).toEqual([
      'frontDoor.global.scss.css',
      'pageResponsive.global.scss.css',
      'pageViews.global.scss.css',
      'tailwind.generated.global.scss.css',
      'theme.global.scss.css'
    ]);
  });

  it('declares no --fd- custom property anywhere, so an override set on the element above is never beaten', () => {
    const declared: string[] = [];
    for (const file of allSheets) {
      const root: Root = postcss.parse(fs.readFileSync(file, 'utf8'));
      root.walkDecls((declaration: Declaration): void => {
        if (TOKEN_DECLARATION.test(declaration.prop)) {
          declared.push(`${path.basename(file)} ${declaration.prop}`);
        }
      });
    }
    expect(declared).toEqual([]);
  });

  it('reads every token through a fallback literal the shipped stylesheets already carry', () => {
    expect(reads.length).toBeGreaterThan(9);
    for (const read of reads) {
      expect({ name: read.name, fallback: read.rest }).toEqual({ name: read.name, fallback: `, ${FALLBACKS[read.name]}` });
    }
    const shipped: string = fs.readFileSync(path.join(ROOT, 'parity/AiCoeFrontDoor.global.1.0.0.7.css'), 'utf8').toLowerCase();
    for (const name of Object.keys(FALLBACKS)) {
      // The draft blue is the one pair the shipped stylesheet never drew (1.0.0.12); every other fallback is its colour.
      const expected: boolean = name !== '--fd-state-blue';
      expect({ name, inShipped: shipped.indexOf(FALLBACKS[name]) >= 0 }).toEqual({ name, inShipped: expected });
    }
  });

  it('reads each of the ten keys of the property at least once, under the name the web part sets', () => {
    const names: string[] = PALETTE_KEYS.map((key: PaletteKey): string => paletteCustomProperty(key));
    expect(names.slice().sort()).toEqual(Object.keys(FALLBACKS).sort());
    for (const name of names) {
      expect({ name, read: reads.filter((entry: ITokenRead): boolean => entry.name === name).length > 0 }).toEqual({ name, read: true });
    }
  });

  it('reads each token only in the rules the README names', () => {
    const read: { [selector: string]: string[] } = {};
    for (const entry of reads) {
      for (const selector of entry.selector.split(',')) {
        const key: string = selector.trim().replace(`${WEB_PART_ROOT} `, '');
        read[key] = (read[key] ?? []).concat([entry.name]).sort();
      }
    }
    expect(read).toEqual({
      // The one accent in a page view: the button back to the front door on the administration bar.
      '.ai-view--home .ai-home-adminbar .ai-admin-back': ['--fd-accent', '--fd-accent'],
      '.ai-view--page .ai-home-adminbar .ai-admin-back': ['--fd-accent', '--fd-accent'],
      // The status pill and the case tag carry the same four tones and read the same four tokens.
      '.ai-view .ai-pill--green': ['--fd-state-green'],
      '.ai-view .ai-pill--blue': ['--fd-state-blue'],
      '.ai-view .ai-pill--amber': ['--fd-state-amber'],
      '.ai-view .ai-pill--red': ['--fd-state-red'],
      '.ai-view--page .ai-case-tag--green': ['--fd-state-green'],
      '.ai-view--page .ai-case-tag--amber': ['--fd-state-amber'],
      '.ai-view--page .ai-case-tag--red': ['--fd-state-red'],
      // The work command, the notice, the measure tiles and the quiet surface of a closed hand-off card.
      '.ai-view--page .ai-page-command-label': ['--fd-ink'],
      '.ai-view--page .ai-page-command-note': ['--fd-muted'],
      '.ai-view--page .ai-page-notice': ['--fd-paper'],
      '.ai-view--page .ai-page-notice--info': ['--fd-focus'],
      '.ai-view--page .ai-page-notice-title': ['--fd-ink'],
      '.ai-view--page .ai-metric-evidence': ['--fd-muted'],
      '.ai-view--page .ai-page-kpi-note': ['--fd-muted'],
      // The bindings of the run (1.0.0.14): the operator page reads the same ink and muted tokens as the rest.
      '.ai-view--page .ai-page-bindings-title': ['--fd-ink'],
      '.ai-view--page .ai-page-bindings-release': ['--fd-ink'],
      '.ai-view--page .ai-page-bindings-source': ['--fd-muted'],
      '.ai-view--page .ai-page-binding-name': ['--fd-ink'],
      '.ai-view--page .ai-page-binding-kind': ['--fd-ink'],
      '.ai-view--page .ai-page-binding-receipt': ['--fd-muted'],
      '.ai-view--page .ai-page-bindings-empty': ['--fd-muted'],
      '.ai-view .ai-route-card--closed': ['--fd-bg']
    });
  });

  it('keeps the reference palette out of the stylesheets: those nine colours are an example override, never code', () => {
    for (const file of allSheets) {
      const css: string = fs.readFileSync(file, 'utf8').toLowerCase();
      for (const colour of REFERENCE_PALETTE) {
        expect({ file: path.basename(file), colour, present: css.indexOf(colour.toLowerCase()) >= 0 }).toEqual({ file: path.basename(file), colour, present: false });
      }
    }
  });
});
