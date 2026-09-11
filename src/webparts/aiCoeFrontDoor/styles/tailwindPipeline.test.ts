import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards the Tailwind build step: the generated utility stylesheet must exist by the time Jest runs
 * (Heft compiles Sass and webpack before the test phase) and must use the shipped prefixing strategy.
 */
const generatedSource: string = path.resolve(
  process.cwd(),
  'src/webparts/aiCoeFrontDoor/styles/tailwind.generated.global.scss'
);
const compiledOutput: string = path.resolve(
  process.cwd(),
  'lib-commonjs/webparts/aiCoeFrontDoor/styles/tailwind.generated.global.scss.css'
);

describe('Tailwind build step', () => {
  it('generates the utility stylesheet before Sass runs', () => {
    expect(fs.existsSync(generatedSource)).toBe(true);
    expect(fs.existsSync(compiledOutput)).toBe(true);
  });

  it('prefixes every utility with the web part root id, as shipped in 1.0.0.7', () => {
    const css: string = fs.readFileSync(generatedSource, 'utf8');
    const selectors: string[] = css.match(/^[^@\s{}][^{]*\{/gm) ?? [];
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.indexOf('#overture-ai-coe-pilot')).toBe(0);
    }
  });

  it('keeps the nine inert utilities that the shipped stylesheet contained', () => {
    const css: string = fs.readFileSync(generatedSource, 'utf8');
    for (const utility of ['.\\!visible', '.visible', '.border', '.contents', '.filter', '.outline', '.transform', '.transition', '.underline']) {
      expect(css).toContain(`#overture-ai-coe-pilot ${utility} {`);
    }
  });

  it('does not emit Preflight base styles', () => {
    const css: string = fs.readFileSync(generatedSource, 'utf8');
    expect(css).not.toMatch(/^\s*(html|body)\s*\{/m);
    expect(css).not.toContain('::before');
  });
});
