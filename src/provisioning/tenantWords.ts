/**
 * Reads the tenant word list (src/provisioning/tenantWords.json) and finds its entries in a text, so that every
 * portability scan reads the same list: the client names, the bundle phrases, the tenant host shape, the reference
 * roster, the case ids and the shapes a secret takes. The file lives outside src/webparts, nothing in the web part
 * imports it, and it is never packaged. Used by the provisioning tests only; scripts/tenant-words.mjs is the
 * verifier's copy of the same code, and a test holds the two to the same hashes and findings.
 *
 * The list names no client. An entry is either written out, as a regular expression (OSS's own names, generic
 * phrases, the host shape, the secret shapes), or stored only as a SHA-256 hash (the client names, the roster's
 * surnames, the case ids and case names). A hashed entry is a literal: `sha256` is the hex digest of its UTF-8 bytes
 * (with A-Z lower-cased first in a list matched in any case, which is exactly how an expression's `i` flag folds an
 * ASCII word), `length` its length and `probe` twelve bits of a rolling hash of it. The scan rolls that hash over every
 * window of each stored length, computes SHA-256 only for the windows whose probe matches, and reports a window whose
 * digest is stored, so a hashed entry is found anywhere in a text, as a substring, exactly where the written-out
 * expression was. Where two entries of a list match at one position, the one the file declares first wins, as it does
 * in the one expression a list used to be. `hashTenantWord` (and `node scripts/hash-tenant-word.mjs <list>`, which
 * reads the word from standard input) makes an entry.
 *
 * The honest limit: a hash keeps a name out of plain text, not out of reach. Anyone who guesses a name can hash it
 * and confirm it against the list; the length and the probe narrow nothing a guess cannot already confirm.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** A literal stored only as its SHA-256 hash, with what the scan needs to find it fast. */
export interface IHashedTenantWord {
  /** SHA-256 of the word's UTF-8 bytes, lower-case hex; in a list matched in any case, of the word with A-Z lower-cased. */
  sha256: string;
  /** The word's length in UTF-16 code units: the window the scan hashes. */
  length: number;
  /** Twelve bits of the word's rolling hash, so the scan computes SHA-256 only for windows that could match. */
  probe: number;
}

/** A written-out regular expression, or a hashed literal. */
export type TenantWordEntry = string | IHashedTenantWord;

export interface ITenantWords {
  /** Client and tenant names, matched in any case. */
  clientWords: TenantWordEntry[];
  /** Phrases that must not appear in the built bundle, matched as written (a bare product name stays legal). */
  bundlePhrases: TenantWordEntry[];
  /** Tenant host shapes, matched in any case. */
  hosts: TenantWordEntry[];
  /** The reference roster's surnames, matched as written. */
  people: TenantWordEntry[];
  /** Case ids and case names of the reference site, matched as written. */
  caseIds: TenantWordEntry[];
  /** Shapes a secret takes, matched as written. */
  secretPatterns: TenantWordEntry[];
}

export type TenantWordList = keyof ITenantWords;

export const TENANT_WORDS_PATH: string = 'src/provisioning/tenantWords.json';

/** The six lists, in the order the file declares them. */
export const TENANT_WORD_LISTS: TenantWordList[] = ['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns'];

/** The lists the committed provisioning files (pages.json, the sample parameters, the scripts) are scanned with. */
export const PROVISIONING_SCAN: TenantWordList[] = ['clientWords', 'hosts', 'people', 'caseIds', 'secretPatterns'];

/** The lists the built bundle, its strings chunk and the packaged manifest are scanned with (a bare product name stays legal). */
export const BUNDLE_SCAN: TenantWordList[] = ['bundlePhrases', 'hosts', 'people', 'secretPatterns'];

/** The bits of the rolling hash a hashed entry stores as its probe. */
export const TENANT_WORD_PROBE_BITS: number = 12;

/** The lists that are matched in any case; the rest match as written. */
const CASE_INSENSITIVE: TenantWordList[] = ['clientWords', 'hosts'];

/** The multiplier of the rolling hash (odd, so every power of it is invertible modulo 2^32). */
const PROBE_BASE: number = 0x01000193;
const PROBE_MASK: number = (1 << TENANT_WORD_PROBE_BITS) - 1;

export function readTenantWords(root: string = process.cwd()): ITenantWords {
  return JSON.parse(fs.readFileSync(path.join(root, TENANT_WORDS_PATH), 'utf8')) as ITenantWords;
}

export function isHashedTenantWord(entry: TenantWordEntry): entry is IHashedTenantWord {
  return typeof entry === 'object' && entry !== null;
}

/** ASCII letters lower-cased and nothing else, so lengths and positions are kept: the `i` flag's folding of an ASCII word. */
function foldAscii(text: string): string {
  return text.replace(/[A-Z]+/g, (run: string): string => run.toLowerCase());
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The polynomial hash of text[start, start + length) modulo 2^32: the sum of each code unit times PROBE_BASE^(distance to the end). */
function windowHash(text: string, start: number, length: number): number {
  let hash: number = 0;
  for (let index: number = start; index < start + length; index++) {
    hash = (Math.imul(hash, PROBE_BASE) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** The probe of a rolling hash: its bits mixed (the MurmurHash3 finalizer), then the low twelve kept. */
function probeOf(hash: number): number {
  let mixed: number = hash ^ (hash >>> 16);
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return (mixed >>> 0) & PROBE_MASK;
}

/** The hashed entry for a word in a list (A-Z lower-cased first where the list matches in any case). */
export function hashTenantWord(word: string, list: TenantWordList): IHashedTenantWord {
  if (word.length === 0) {
    throw new Error('A tenant word cannot be empty.');
  }
  const subject: string = CASE_INSENSITIVE.indexOf(list) >= 0 ? foldAscii(word) : word;
  return { sha256: sha256Hex(subject), length: subject.length, probe: probeOf(windowHash(subject, 0, subject.length)) };
}

/** What is wrong with a word list, one line per problem (`<list>[<index>]: …`); empty when every entry is usable. */
export function tenantWordProblems(words: ITenantWords): string[] {
  const problems: string[] = [];
  for (const list of TENANT_WORD_LISTS) {
    const entries: TenantWordEntry[] | undefined = words[list];
    if (!Array.isArray(entries)) {
      problems.push(`${list}: not a list`);
      continue;
    }
    if (entries.length === 0) {
      problems.push(`${list}: the list is empty`);
    }
    entries.forEach((entry: TenantWordEntry, index: number): void => {
      const where: string = `${list}[${index}]`;
      if (typeof entry === 'string') {
        if (entry.trim().length === 0) {
          problems.push(`${where}: a blank expression`);
          return;
        }
        try {
          // The expression is the list's own entry, read from the committed file; constructing it is the check.
          // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
          new RegExp(entry).test('');
        } catch (error) {
          problems.push(`${where}: not a valid expression (${(error as Error).message})`);
        }
        return;
      }
      if (!isHashedTenantWord(entry)) {
        problems.push(`${where}: neither an expression nor a hashed word`);
        return;
      }
      const keys: string = Object.keys(entry).sort().join(',');
      if (keys !== 'length,probe,sha256') {
        problems.push(`${where}: a hashed word has exactly sha256, length and probe (found ${keys})`);
      }
      if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        problems.push(`${where}: sha256 is not 64 lower-case hex digits`);
      }
      if (typeof entry.length !== 'number' || !Number.isInteger(entry.length) || entry.length < 1) {
        problems.push(`${where}: length is not a positive integer`);
      }
      if (typeof entry.probe !== 'number' || !Number.isInteger(entry.probe) || entry.probe < 0 || entry.probe > PROBE_MASK) {
        problems.push(`${where}: probe is not an integer from 0 to ${PROBE_MASK}`);
      }
    });
  }
  return problems;
}

/** The written-out entries of one list as one expression; a fresh instance each time, so no global state leaks between scans. */
export function tenantWordPattern(words: ITenantWords, list: TenantWordList): RegExp {
  const entries: string[] = words[list].filter((entry: TenantWordEntry): entry is string => typeof entry === 'string').map((entry: string): string => `(?:${entry})`);
  // The expressions are the list's own entries, read from the committed file and proved valid by its test. A list with
  // no written-out entry gets an expression that never matches.
  // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
  return new RegExp(entries.length > 0 ? entries.join('|') : '(?!)', CASE_INSENSITIVE.indexOf(list) >= 0 ? 'gi' : 'g');
}

interface IHashedMatch {
  /** Where the window starts. */
  index: number;
  /** The entry's place in its list. */
  order: number;
  length: number;
}

/** Every position where a hashed entry of the list occurs (overlaps included), by position and then by declared order. */
function hashedMatches(text: string, entries: { order: number; word: IHashedTenantWord }[], caseInsensitive: boolean): IHashedMatch[] {
  const subject: string = caseInsensitive ? foldAscii(text) : text;
  const byLength: Map<number, { order: number; word: IHashedTenantWord }[]> = new Map();
  for (const entry of entries) {
    const group: { order: number; word: IHashedTenantWord }[] | undefined = byLength.get(entry.word.length);
    if (group === undefined) {
      byLength.set(entry.word.length, [entry]);
    } else {
      group.push(entry);
    }
  }
  const found: IHashedMatch[] = [];
  byLength.forEach((group: { order: number; word: IHashedTenantWord }[], length: number): void => {
    if (length > subject.length) {
      return;
    }
    const probes: Uint8Array = new Uint8Array(PROBE_MASK + 1);
    const orders: Map<string, number> = new Map();
    for (const entry of group) {
      probes[entry.word.probe] = 1;
      if (!orders.has(entry.word.sha256)) {
        orders.set(entry.word.sha256, entry.order);
      }
    }
    // PROBE_BASE^(length - 1) modulo 2^32: the weight of the code unit that leaves the window.
    let lead: number = 1;
    for (let step: number = 1; step < length; step++) {
      lead = Math.imul(lead, PROBE_BASE);
    }
    let hash: number = windowHash(subject, 0, length);
    for (let start: number = 0; ; start++) {
      if (probes[probeOf(hash)] === 1) {
        const order: number | undefined = orders.get(sha256Hex(subject.slice(start, start + length)));
        if (order !== undefined) {
          found.push({ index: start, order, length });
        }
      }
      const next: number = start + length;
      if (next >= subject.length) {
        break;
      }
      hash = (Math.imul((hash - Math.imul(subject.charCodeAt(start), lead)) | 0, PROBE_BASE) + subject.charCodeAt(next)) >>> 0;
    }
  });
  found.sort((a: IHashedMatch, b: IHashedMatch): number => a.index - b.index || a.order - b.order);
  return found;
}

/**
 * The matched texts of one list, as the one expression over the whole list would report them with the `g` flag: the
 * leftmost match, the first entry in the file's order at that position, then on from its end (one past an empty match).
 */
function findInList(text: string, entries: TenantWordEntry[], caseInsensitive: boolean): string[] {
  const written: { order: number; pattern: RegExp }[] = [];
  const hashed: { order: number; word: IHashedTenantWord }[] = [];
  entries.forEach((entry: TenantWordEntry, order: number): void => {
    if (typeof entry === 'string') {
      // The list's own entry, read from the committed file and proved valid by its test; sticky, to test one position.
      // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
      written.push({ order, pattern: new RegExp(`(?:${entry})`, caseInsensitive ? 'iy' : 'y') });
    } else {
      hashed.push({ order, word: entry });
    }
  });
  const combined: RegExp | undefined =
    written.length === 0
      ? undefined
      : // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
        new RegExp(entries.filter((entry: TenantWordEntry): entry is string => typeof entry === 'string').map((entry: string): string => `(?:${entry})`).join('|'), caseInsensitive ? 'gi' : 'g');
  const candidates: IHashedMatch[] = hashed.length === 0 ? [] : hashedMatches(text, hashed, caseInsensitive);
  const found: string[] = [];
  let next: number = 0;
  let from: number = 0;
  // The leftmost written-out match at or after `from`. It stays valid while it starts at or after `from` (nothing
  // matched between the old start and it), so the text is searched once, not once per hashed match; null once there is
  // none left.
  let writtenMatch: RegExpExecArray | null = null;
  let writtenDone: boolean = combined === undefined;
  while (from <= text.length) {
    if (!writtenDone && (writtenMatch === null || writtenMatch.index < from)) {
      (combined as RegExp).lastIndex = from;
      writtenMatch = (combined as RegExp).exec(text);
      writtenDone = writtenMatch === null;
    }
    while (next < candidates.length && candidates[next].index < from) {
      next++;
    }
    const writtenAt: number = writtenMatch === null || writtenMatch.index < from ? -1 : writtenMatch.index;
    const hashedAt: number = next < candidates.length ? candidates[next].index : -1;
    if (writtenAt < 0 && hashedAt < 0) {
      break;
    }
    const at: number = writtenAt < 0 ? hashedAt : hashedAt < 0 ? writtenAt : Math.min(writtenAt, hashedAt);
    let best: { order: number; text: string } | undefined;
    if (hashedAt === at) {
      // Candidates at one position are sorted by declared order, so the first is the one the file declares first.
      best = { order: candidates[next].order, text: text.slice(at, at + candidates[next].length) };
    }
    if (writtenMatch !== null && writtenAt === at) {
      for (const entry of written) {
        if (best !== undefined && entry.order > best.order) {
          break;
        }
        entry.pattern.lastIndex = at;
        const match: RegExpExecArray | null = entry.pattern.exec(text);
        if (match !== null) {
          best = { order: entry.order, text: match[0] };
          break;
        }
      }
      if (best === undefined) {
        best = { order: -1, text: writtenMatch[0] };
      }
    }
    const matched: string = (best as { order: number; text: string }).text;
    found.push(matched);
    from = at + (matched.length === 0 ? 1 : matched.length);
  }
  return found;
}

/** Every match of the given lists in a text, as "<list>: <matched text>", so a failing scan names what it found. */
export function findTenantWords(text: string, words: ITenantWords, lists: TenantWordList[]): string[] {
  const found: string[] = [];
  for (const list of lists) {
    for (const matched of findInList(text, words[list], CASE_INSENSITIVE.indexOf(list) >= 0)) {
      found.push(`${list}: ${matched}`);
    }
  }
  return found;
}

/** A text for the out-of-process scan: a file under the root (`file`, a relative path) or the text itself. */
export interface ITenantWordScanItem {
  name: string;
  file?: string;
  text?: string;
}

/** Runs in the child: reads the request from standard input, scans with the verifier's copy, writes the findings. */
const OUT_OF_PROCESS_SCAN: string = [
  "import { readFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "import { pathToFileURL } from 'node:url';",
  "const input = JSON.parse(readFileSync(0, 'utf8'));",
  "const scan = await import(pathToFileURL(join(input.root, 'scripts/tenant-words.mjs')).href);",
  'const result = input.items.map((item) => ({',
  '  name: item.name,',
  "  found: scan.findTenantWords(typeof item.text === 'string' ? item.text : readFileSync(join(input.root, item.file), 'utf8'), input.words, input.lists)",
  '}));',
  'process.stdout.write(JSON.stringify(result));'
].join('\n');

/**
 * The findings of many or large texts (a whole source tree, a built bundle), scanned by the verifier's copy of this
 * code (scripts/tenant-words.mjs) in a child Node process, one entry per item in the given order. Jest's coverage
 * tracking slows the scan's per-window loop about fortyfold inside a test worker (the production bundle took seconds
 * where one expression per list took a tenth of one); the child runs untracked. The findings are the ones
 * `findTenantWords` reports here: the test of this module holds the two copies, and this function, to the same results.
 */
export function findTenantWordsOutOfProcess(
  items: ITenantWordScanItem[],
  words: ITenantWords,
  lists: TenantWordList[],
  root: string = process.cwd()
): { name: string; found: string[] }[] {
  const output: string = execFileSync(process.execPath, ['--input-type=module', '-e', OUT_OF_PROCESS_SCAN], {
    input: JSON.stringify({ root, items, words, lists }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const result: { name: string; found: string[] }[] = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== items.length) {
    throw new Error(`The out-of-process scan returned ${Array.isArray(result) ? result.length : 'no'} results for ${items.length} items.`);
  }
  return result;
}
