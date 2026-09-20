/**
 * @jest-environment node
 */
/**
 * Static checks on the lint configuration: the content document is data from a site file, so nothing
 * under the web part may write raw HTML into the page. The rule that forbids it is an error, the
 * React plugin that defines the rule is registered, and no scanned source uses the escape hatch.
 */
import * as fs from 'fs';
import * as path from 'path';

interface IFlatConfigEntry {
  files?: string[];
  plugins?: { [name: string]: unknown };
  rules?: { [name: string]: unknown };
}

const ROOT: string = process.cwd();
const WEB_PARTS_DIR: string = path.join(ROOT, 'src/webparts');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const file: string = path.join(dir, entry);
    if (fs.statSync(file).isDirectory()) {
      sourceFiles(file, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(file);
    }
  }
  return found;
}

function ruleLevel(config: IFlatConfigEntry[], rule: string): unknown {
  let level: unknown;
  for (const entry of config) {
    if (entry.rules !== undefined && Object.prototype.hasOwnProperty.call(entry.rules, rule)) {
      level = entry.rules[rule];
    }
  }
  return level;
}

describe('lint configuration', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config: IFlatConfigEntry[] = require(path.join(ROOT, 'eslint.config.js')) as IFlatConfigEntry[];

  it('registers the React plugin that defines react/no-danger', () => {
    expect(config.some((entry: IFlatConfigEntry): boolean => entry.plugins !== undefined && entry.plugins.react !== undefined)).toBe(true);
  });

  it('makes react/no-danger an error for every TypeScript file, after the profile', () => {
    expect(ruleLevel(config, 'react/no-danger')).toBe('error');
    const last: IFlatConfigEntry | undefined = config.filter((entry: IFlatConfigEntry): boolean => entry.rules !== undefined && entry.rules['react/no-danger'] !== undefined).pop();
    expect(last?.files).toEqual(['**/*.ts', '**/*.tsx']);
    const text: string = fs.readFileSync(path.join(ROOT, 'eslint.config.js'), 'utf8');
    expect(text).toContain("'react/no-danger': 'error'");
  });

  it('has no dangerouslySetInnerHTML under src/webparts', () => {
    const offenders: string[] = sourceFiles(WEB_PARTS_DIR).filter((file: string): boolean => fs.readFileSync(file, 'utf8').indexOf('dangerouslySetInnerHTML') >= 0);
    expect(offenders).toEqual([]);
  });
});
