/**
 * @jest-environment node
 */
/**
 * The one list of tenant words every portability scan reads (client names, bundle phrases, tenant
 * hosts, the reference roster, case ids, secret shapes). It is deliberately not tenant-neutral, so it
 * lives outside src/webparts and is never packaged; this test keeps its shape usable by the scans.
 */
import * as fs from 'fs';
import * as path from 'path';
import { findTenantWords, readTenantWords, TENANT_WORD_LISTS, TENANT_WORDS_PATH, tenantWordPattern } from './tenantWords';
import type { ITenantWords, TenantWordList } from './tenantWords';

const ROOT: string = process.cwd();

describe('tenant word list', () => {
  const words: ITenantWords = readTenantWords(ROOT);

  it('lives outside the web part sources and the packaged assets', () => {
    expect(TENANT_WORDS_PATH).toBe('src/provisioning/tenantWords.json');
    expect(TENANT_WORDS_PATH.indexOf('src/webparts')).toBe(-1);
    expect(TENANT_WORDS_PATH.indexOf('sharepoint/')).toBe(-1);
    expect(fs.existsSync(path.join(ROOT, TENANT_WORDS_PATH))).toBe(true);
  });

  it('declares the six lists and nothing else, each non-empty', () => {
    expect(TENANT_WORD_LISTS).toEqual(['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns']);
    expect(Object.keys(words).sort()).toEqual(TENANT_WORD_LISTS.slice().sort());
    for (const list of TENANT_WORD_LISTS) {
      expect(Array.isArray(words[list])).toBe(true);
      expect(words[list].length).toBeGreaterThan(0);
    }
  });

  it('holds only valid, non-blank regular expressions', () => {
    for (const list of TENANT_WORD_LISTS) {
      for (const entry of words[list]) {
        expect(typeof entry).toBe('string');
        expect(entry.trim().length).toBeGreaterThan(0);
        // Constructing from the entry is the check itself: an entry that is not a valid expression fails here.
        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
        expect((): RegExp => new RegExp(entry)).not.toThrow();
      }
      expect((): RegExp => tenantWordPattern(words, list)).not.toThrow();
    }
  });

  it('matches the shapes each list is for, client names and hosts in any case', () => {
    const cases: { list: TenantWordList; text: string }[] = [
      { list: 'clientWords', text: 'the OVERTURE tenant' },
      { list: 'bundlePhrases', text: 'Start with Claude' },
      { list: 'hosts', text: 'https://Contoso.SharePoint.com/sites/ai' },
      { list: 'people', text: 'B. Frerichs' },
      { list: 'caseIds', text: 'case CW-03' },
      { list: 'secretPatterns', text: 'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }
    ];
    for (const item of cases) {
      expect(findTenantWords(item.text, words, [item.list]).length).toBeGreaterThan(0);
    }
    // The roster is matched as written: a lower-case common word is not a surname.
    expect(findTenantWords('both sides of the page', words, ['people'])).toEqual([]);
    expect(findTenantWords('A plain sentence about the front door.', words, TENANT_WORD_LISTS)).toEqual([]);
  });
});
