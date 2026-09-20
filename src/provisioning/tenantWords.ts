/**
 * Reads the tenant word list (src/provisioning/tenantWords.json): the one place a client name, a tenant
 * host, the reference roster, a case id or a secret shape may be written down, so that every
 * portability scan reads the same list. The file is deliberately not tenant-neutral; it lives outside
 * src/webparts, nothing in the web part imports it, and it is never packaged. Used by the provisioning
 * tests only.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface ITenantWords {
  /** Client and tenant names, matched in any case. */
  clientWords: string[];
  /** Phrases that must not appear in the built bundle, matched as written (a bare product name stays legal). */
  bundlePhrases: string[];
  /** Tenant host shapes, matched in any case. */
  hosts: string[];
  /** The reference roster's surnames, matched as written. */
  people: string[];
  /** Case ids and case names of the reference site, matched as written. */
  caseIds: string[];
  /** Shapes a secret takes, matched as written. */
  secretPatterns: string[];
}

export type TenantWordList = keyof ITenantWords;

export const TENANT_WORDS_PATH: string = 'src/provisioning/tenantWords.json';

/** The six lists, in the order the file declares them. */
export const TENANT_WORD_LISTS: TenantWordList[] = ['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns'];

/** The lists the committed provisioning files (pages.json, the sample parameters, the scripts) are scanned with. */
export const PROVISIONING_SCAN: TenantWordList[] = ['clientWords', 'hosts', 'people', 'caseIds', 'secretPatterns'];

/** The lists that are matched in any case; the rest match as written. */
const CASE_INSENSITIVE: TenantWordList[] = ['clientWords', 'hosts'];

export function readTenantWords(root: string = process.cwd()): ITenantWords {
  return JSON.parse(fs.readFileSync(path.join(root, TENANT_WORDS_PATH), 'utf8')) as ITenantWords;
}

/** One expression over a whole list; a fresh instance each time, so no global state leaks between scans. */
export function tenantWordPattern(words: ITenantWords, list: TenantWordList): RegExp {
  const entries: string[] = words[list].map((entry: string): string => `(?:${entry})`);
  // The expressions are the list's own entries, read from the committed file and proved valid by its test.
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  return new RegExp(entries.join('|'), CASE_INSENSITIVE.indexOf(list) >= 0 ? 'gi' : 'g');
}

/** Every match of the given lists in a text, so a failing scan names what it found. */
export function findTenantWords(text: string, words: ITenantWords, lists: TenantWordList[]): string[] {
  const found: string[] = [];
  for (const list of lists) {
    const pattern: RegExp = tenantWordPattern(words, list);
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      found.push(`${list}: ${match[0]}`);
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
      match = pattern.exec(text);
    }
  }
  return found;
}
