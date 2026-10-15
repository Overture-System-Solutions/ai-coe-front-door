/**
 * @jest-environment node
 */
/**
 * The one list of tenant words every portability scan reads (client names, bundle phrases, tenant hosts, the
 * reference roster, case ids, secret shapes). The client names, the roster and the case ids are stored only as
 * SHA-256 hashes, so the list names no client. This test keeps the file's shape usable by the scans, proves a hashed
 * entry is found exactly where the written-out expression it replaced was found (anywhere in a text, in its list's
 * case rule, in the order the file declares), proves the verifier's copy of the scan agrees, and proves neither the
 * file nor the sources, scripts, tests and README carry a hashed entry in plain text. No real entry is written here:
 * the fixtures are fictional names hashed in the test.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  findTenantWords,
  findTenantWordsOutOfProcess,
  hashTenantWord,
  isHashedTenantWord,
  readTenantWords,
  TENANT_WORD_LISTS,
  TENANT_WORD_PROBE_BITS,
  TENANT_WORDS_PATH,
  tenantWordPattern,
  tenantWordProblems
} from './tenantWords';
import type { IHashedTenantWord, ITenantWords, TenantWordEntry, TenantWordList } from './tenantWords';

const ROOT: string = process.cwd();

/** The lists whose client entries are hashed; hosts and secret shapes are generic and stay written out. */
const NAMING_LISTS: TenantWordList[] = ['clientWords', 'bundlePhrases', 'people', 'caseIds'];

/** Only the hashed entries of a word list (every list kept, possibly empty), so a scan looks for nothing else. */
function hashedOnly(words: ITenantWords): ITenantWords {
  const result: Partial<ITenantWords> = {};
  for (const list of TENANT_WORD_LISTS) {
    result[list] = words[list].filter((entry: TenantWordEntry): boolean => isHashedTenantWord(entry));
  }
  return result as ITenantWords;
}

/** The written-out entries of one list. */
function writtenOut(words: ITenantWords, list: TenantWordList): string[] {
  return words[list].filter((entry: TenantWordEntry): entry is string => !isHashedTenantWord(entry));
}

/** Fictional words in the place of the hashed ones: the same lists, the same order, every entry written out. */
const PLAIN_FIXTURE: ITenantWords = {
  clientWords: ['overture', 'fabrikam', 'gofabrikam', 'osscontact'],
  bundlePhrases: ['Overture', 'Fabrikam', 'Northwind', 'Start with Claude', 'OSS Demo', 'Claude draft flow'],
  hosts: ['[a-z0-9-]+\\.sharepoint\\.com'],
  people: ['Quintanilla', 'Okafor', 'Lindqvist'],
  caseIds: ['FB-0\\d', 'Contoso Insights'],
  secretPatterns: ['sig=', 'client_secret', '-----BEGIN', 'eyJ[A-Za-z0-9_-]{20,}']
};

/** The same lists with the fictional names hashed, the case-id expression expanded into its ten literals. */
const HASHED_FIXTURE: ITenantWords = {
  clientWords: ['overture', hashTenantWord('fabrikam', 'clientWords'), hashTenantWord('gofabrikam', 'clientWords'), 'osscontact'],
  bundlePhrases: ['Overture', hashTenantWord('Fabrikam', 'bundlePhrases'), hashTenantWord('Northwind', 'bundlePhrases'), 'Start with Claude', 'OSS Demo', 'Claude draft flow'],
  hosts: ['[a-z0-9-]+\\.sharepoint\\.com'],
  people: ['Quintanilla', 'Okafor', 'Lindqvist'].map((name: string): IHashedTenantWord => hashTenantWord(name, 'people')),
  caseIds: [
    ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit: string): IHashedTenantWord => hashTenantWord(`FB-0${digit}`, 'caseIds')),
    hashTenantWord('Contoso Insights', 'caseIds')
  ],
  secretPatterns: ['sig=', 'client_secret', '-----BEGIN', 'eyJ[A-Za-z0-9_-]{20,}']
};

/** Texts that exercise substrings, case, overlap, adjacency, the ends of the text and the order of alternatives. */
const PARITY_TEXTS: string[] = [
  '',
  'f',
  'fabrikam',
  'FABRIKAM',
  'gofabrikam.com and fabrikam and Fabrikamfabrikam',
  'GoFabrikam, gofabrikamgofabrikam, gofabrika',
  'the Fabrikam Northwind pilot, NORTHWIND, Northwinds',
  'B. Quintanilla, quintanilla, QuintanillaOkafor, Okafor-Lindqvist, Lindqvis',
  'case FB-03, FB-09x, FB-0, FB-0a, FB-010, fb-03, FB-03FB-04',
  'Contoso Insights; contoso insights; Contoso  Insights',
  'https://Fabrikam.SharePoint.com/sites/ai and https://contoso.sharepoint.com',
  'the overture-ai-coe-front-door package, OVERTURE, osscontact.com',
  'Start with Claude in the OSS Demo, then the Claude draft flow',
  'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and sig=abc and client_secret',
  // Only ASCII letters fold, as in an expression's i flag: the long s and the Kelvin sign are not s and k.
  'Fabrikam\u00e9 caf\u00e9 fabri\u212aam \u017fabrikam fabrikam\u0130 \ud83d\ude00Fabrikam'
];

/** A deterministic text of the given length over a small alphabet, with fixture words planted in random case. */
function plantedText(length: number, seed: number): string {
  const alphabet: string = 'abfikmortwnqulFBKMNOQ -0123456789.';
  const plants: string[] = ['fabrikam', 'FabriKam', 'gofabrikam', 'Fabrikam', 'Northwind', 'Quintanilla', 'Okafor', 'FB-07', 'Contoso Insights', 'overture'];
  let state: number = seed >>> 0;
  const next = (bound: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    // The high bits: the low bits of a power-of-two linear congruential generator repeat with a short period.
    return (state >>> 16) % bound;
  };
  const parts: string[] = [];
  let size: number = 0;
  while (size < length) {
    const piece: string = next(20) === 0 ? plants[next(plants.length)] : alphabet[next(alphabet.length)];
    parts.push(piece);
    size += piece.length;
  }
  return parts.join('');
}

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

  it('holds only valid entries: a non-blank regular expression or a well-formed SHA-256 hashed literal', () => {
    expect(tenantWordProblems(words)).toEqual([]);
    for (const list of TENANT_WORD_LISTS) {
      for (const entry of words[list]) {
        if (isHashedTenantWord(entry)) {
          expect(Object.keys(entry).sort()).toEqual(['length', 'probe', 'sha256']);
          expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
          expect(Number.isInteger(entry.length) && entry.length > 0).toBe(true);
          expect(Number.isInteger(entry.probe) && entry.probe >= 0 && entry.probe < 2 ** TENANT_WORD_PROBE_BITS).toBe(true);
        } else {
          expect(typeof entry).toBe('string');
          expect(entry.trim().length).toBeGreaterThan(0);
          // Constructing from the entry is the check itself: an entry that is not a valid expression fails here.
          // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
          expect((): RegExp => new RegExp(entry)).not.toThrow();
        }
      }
      expect((): RegExp => tenantWordPattern(words, list)).not.toThrow();
      // No digest twice in a list: a duplicate would be a second copy of one word.
      const digests: string[] = words[list].filter(isHashedTenantWord).map((entry: IHashedTenantWord): string => entry.sha256);
      expect(new Set(digests).size).toBe(digests.length);
    }
  });

  it('names the malformed entries it refuses', () => {
    const broken: ITenantWords = {
      ...HASHED_FIXTURE,
      clientWords: ['', '   ', '(unclosed'],
      people: [
        { sha256: 'not-a-digest', length: 4, probe: 1 },
        { sha256: 'a'.repeat(64), length: 0, probe: 1 },
        { sha256: 'a'.repeat(64), length: 3, probe: 2 ** TENANT_WORD_PROBE_BITS },
        { sha256: 'A'.repeat(64), length: 3, probe: 1 }
      ]
    };
    const problems: string[] = tenantWordProblems(broken);
    expect(problems.length).toBe(7);
    expect(problems.every((problem: string): boolean => /^(clientWords|people)\[\d\]: /.test(problem))).toBe(true);
    expect(tenantWordProblems({ ...HASHED_FIXTURE, hosts: [] })).toEqual(['hosts: the list is empty']);
  });

  it('stores the client names, the roster and the case ids only as hashes; OSS names and generic shapes stay written out', () => {
    // Written out: OSS's own names, generic phrases, the host shape and the secret shapes, exactly these.
    expect(writtenOut(words, 'clientWords')).toEqual(['overture', 'osscontact']);
    expect(writtenOut(words, 'bundlePhrases')).toEqual(['Overture', 'Start with Claude', 'OSS Demo', 'Claude draft flow']);
    expect(words.hosts).toEqual(['[a-z0-9-]+\\.sharepoint\\.com']);
    expect(words.secretPatterns).toEqual(['sig=', 'client_secret', '-----BEGIN', 'eyJ[A-Za-z0-9_-]{20,}']);
    // Hashed: three client words, two bundle phrases, the nine roster surnames, ten case-id literals and one case name.
    expect(hashedOnly(words).clientWords.length).toBe(3);
    expect(hashedOnly(words).bundlePhrases.length).toBe(2);
    expect(words.people.length).toBe(9);
    expect(words.people.every(isHashedTenantWord)).toBe(true);
    expect(words.caseIds.length).toBe(11);
    expect(words.caseIds.every(isHashedTenantWord)).toBe(true);
  });

  it('carries no hashed entry in plain text, in the word file or anywhere in the sources, scripts, tests and README', () => {
    const hashed: ITenantWords = hashedOnly(words);
    const fileText: string = fs.readFileSync(path.join(ROOT, TENANT_WORDS_PATH), 'utf8');
    expect(findTenantWords(fileText, hashed, NAMING_LISTS)).toEqual([]);
    // The sources, scripts and tests are walked as text; dependency and cache folders and binary files are skipped.
    const skipDirectories: string[] = ['node_modules', '__pycache__', '.pytest_cache', 'pytest-tmp'];
    const binary: RegExp = /\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot|zip|sppkg|pdf|docx|xlsx|pptx)$/i;
    const files: string[] = ['README.md'];
    const walk = (relative: string): void => {
      for (const entry of fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })) {
        const child: string = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          if (skipDirectories.indexOf(entry.name) < 0) {
            walk(child);
          }
        } else if (!binary.test(entry.name)) {
          files.push(child);
        }
      }
    };
    for (const folder of ['src', 'scripts', 'tests']) {
      walk(folder);
    }
    expect(files.length).toBeGreaterThan(100);
    // Several megabytes: scanned out of process, where coverage tracking does not slow the loop (the last test below
    // holds that scan to this module's findings).
    const results: { name: string; found: string[] }[] = findTenantWordsOutOfProcess(files.map((file: string) => ({ name: file, file })), hashed, NAMING_LISTS, ROOT);
    expect(results.map((result: { name: string }): string => result.name)).toEqual(files);
    for (const result of results) {
      expect(result).toEqual({ name: result.name, found: [] });
    }
  });

  it('matches the shapes each list is for, client names and hosts in any case', () => {
    const cases: { list: TenantWordList; text: string }[] = [
      { list: 'clientWords', text: 'the OVERTURE tenant' },
      { list: 'bundlePhrases', text: 'Start with Claude' },
      { list: 'hosts', text: 'https://Contoso.SharePoint.com/sites/ai' },
      { list: 'secretPatterns', text: 'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' }
    ];
    for (const item of cases) {
      expect(findTenantWords(item.text, words, [item.list]).length).toBeGreaterThan(0);
    }
    expect(findTenantWords('A plain sentence about the front door.', words, TENANT_WORD_LISTS)).toEqual([]);
  });

  it('finds a hashed entry anywhere in a text, in the case rule of its list, and names what it found', () => {
    // Client words match in any case, and inside a longer word or host.
    expect(findTenantWords('the FABRIKAM tenant', HASHED_FIXTURE, ['clientWords'])).toEqual(['clientWords: FABRIKAM']);
    expect(findTenantWords('https://notfabrikamish.example', HASHED_FIXTURE, ['clientWords'])).toEqual(['clientWords: fabrikam']);
    expect(hashTenantWord('FaBrIkAm', 'clientWords')).toEqual(hashTenantWord('fabrikam', 'clientWords'));
    // The roster, the case ids and the bundle phrases match as written.
    expect(findTenantWords('B. Quintanilla', HASHED_FIXTURE, ['people'])).toEqual(['people: Quintanilla']);
    expect(findTenantWords('quintanilla QUINTANILLA', HASHED_FIXTURE, ['people'])).toEqual([]);
    expect(hashTenantWord('Quintanilla', 'people')).not.toEqual(hashTenantWord('quintanilla', 'people'));
    expect(findTenantWords('case FB-03 and FB-09x', HASHED_FIXTURE, ['caseIds'])).toEqual(['caseIds: FB-03', 'caseIds: FB-09']);
    expect(findTenantWords('fb-03', HASHED_FIXTURE, ['caseIds'])).toEqual([]);
    expect(findTenantWords('the Fabrikam pilot', HASHED_FIXTURE, ['bundlePhrases'])).toEqual(['bundlePhrases: Fabrikam']);
    expect(findTenantWords('the fabrikam pilot', HASHED_FIXTURE, ['bundlePhrases'])).toEqual([]);
    // A hashed entry is a literal of its stored length: one character short or different is no match.
    expect(findTenantWords('Quintanill Quintanila', HASHED_FIXTURE, ['people'])).toEqual([]);
  });

  it('reports exactly what the written-out expressions they replace report: position, overlap and declared order', () => {
    for (const text of PARITY_TEXTS) {
      expect({ text, found: findTenantWords(text, HASHED_FIXTURE, TENANT_WORD_LISTS) }).toEqual({ text, found: findTenantWords(text, PLAIN_FIXTURE, TENANT_WORD_LISTS) });
    }
    // The first alternative in the file's order wins where two entries match at one position, as in one expression.
    const plainFirst: ITenantWords = { ...PLAIN_FIXTURE, clientWords: ['fab', hashTenantWord('fabrikam', 'clientWords')] };
    const hashedFirst: ITenantWords = { ...PLAIN_FIXTURE, clientWords: [hashTenantWord('fabrikam', 'clientWords'), 'fab'] };
    expect(findTenantWords('fabrikam fab', plainFirst, ['clientWords'])).toEqual(['clientWords: fab', 'clientWords: fab']);
    expect(findTenantWords('fabrikam fab', hashedFirst, ['clientWords'])).toEqual(['clientWords: fabrikam', 'clientWords: fab']);
    expect(findTenantWords('fabrikam fab', { ...PLAIN_FIXTURE, clientWords: ['fab', 'fabrikam'] }, ['clientWords'])).toEqual(['clientWords: fab', 'clientWords: fab']);
    expect(findTenantWords('fabrikam fab', { ...PLAIN_FIXTURE, clientWords: ['fabrikam', 'fab'] }, ['clientWords'])).toEqual(['clientWords: fabrikam', 'clientWords: fab']);
    // A long text with planted words, so the rolling probe is exercised across many windows.
    for (const seed of [1, 7, 2026]) {
      const text: string = plantedText(30000, seed);
      const expected: string[] = findTenantWords(text, PLAIN_FIXTURE, TENANT_WORD_LISTS);
      expect(expected.length).toBeGreaterThan(100);
      expect(findTenantWords(text, HASHED_FIXTURE, TENANT_WORD_LISTS)).toEqual(expected);
    }
  });

  it('agrees with the verifier copy of the scan (scripts/tenant-words.mjs) on hashes and findings', () => {
    const module: string = path.join(ROOT, 'scripts/tenant-words.mjs');
    expect(fs.existsSync(module)).toBe(true);
    const texts: string[] = [...PARITY_TEXTS, plantedText(50000, 11)];
    const samples: { word: string; list: TenantWordList }[] = [
      { word: 'FaBrIkAm', list: 'clientWords' },
      { word: 'Quintanilla', list: 'people' },
      { word: 'FB-03', list: 'caseIds' },
      { word: 'Contoso Insights', list: 'bundlePhrases' }
    ];
    const script: string = [
      "import { readFileSync } from 'node:fs';",
      "import { pathToFileURL } from 'node:url';",
      "const input = JSON.parse(readFileSync(0, 'utf8'));",
      'const scan = await import(pathToFileURL(input.module).href);',
      'const result = {',
      '  hashes: input.samples.map((sample) => scan.hashTenantWord(sample.word, sample.list)),',
      '  fixture: input.texts.map((text) => scan.findTenantWords(text, input.fixture, input.lists)),',
      '  real: input.texts.map((text) => scan.findTenantWords(text, input.real, input.lists)),',
      '  problems: scan.tenantWordProblems(input.real)',
      '};',
      'process.stdout.write(JSON.stringify(result));'
    ].join('\n');
    const output: string = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      input: JSON.stringify({ module, samples, texts, fixture: HASHED_FIXTURE, real: words, lists: TENANT_WORD_LISTS }),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    const result: { hashes: IHashedTenantWord[]; fixture: string[][]; real: string[][]; problems: string[] } = JSON.parse(output);
    expect(result.hashes).toEqual(samples.map((sample: { word: string; list: TenantWordList }): IHashedTenantWord => hashTenantWord(sample.word, sample.list)));
    expect(result.fixture).toEqual(texts.map((text: string): string[] => findTenantWords(text, HASHED_FIXTURE, TENANT_WORD_LISTS)));
    expect(result.real).toEqual(texts.map((text: string): string[] => findTenantWords(text, words, TENANT_WORD_LISTS)));
    expect(result.problems).toEqual([]);
  });

  it('scans out of process with the same findings, for texts and for files', () => {
    const texts: string[] = [...PARITY_TEXTS, plantedText(30000, 3)];
    const items: { name: string; text?: string; file?: string }[] = texts.map((text: string, index: number) => ({ name: `text ${index}`, text }));
    items.push({ name: 'word file', file: TENANT_WORDS_PATH });
    const results: { name: string; found: string[] }[] = findTenantWordsOutOfProcess(items, HASHED_FIXTURE, TENANT_WORD_LISTS, ROOT);
    const expected: { name: string; found: string[] }[] = texts.map((text: string, index: number) => ({ name: `text ${index}`, found: findTenantWords(text, HASHED_FIXTURE, TENANT_WORD_LISTS) }));
    expected.push({ name: 'word file', found: findTenantWords(fs.readFileSync(path.join(ROOT, TENANT_WORDS_PATH), 'utf8'), HASHED_FIXTURE, TENANT_WORD_LISTS) });
    expect(results).toEqual(expected);
    // Not vacuous: the planted text has findings, hashed ones among them.
    expect(results[texts.length - 1].found.length).toBeGreaterThan(100);
    expect(results[texts.length - 1].found).toContain('people: Quintanilla');
  });
});
