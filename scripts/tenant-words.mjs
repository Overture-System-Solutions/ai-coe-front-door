// The tenant word scan of the release verifier: the same code as src/provisioning/tenantWords.ts, in plain JavaScript
// so scripts/verify-package.mjs runs without a build. src/provisioning/tenantWords.test.ts holds the two copies to the
// same hashes and the same findings.
//
// The word list (src/provisioning/tenantWords.json) names no client. An entry is either written out, as a regular
// expression (OSS's own names, generic phrases, the host shape, the secret shapes), or stored only as a SHA-256 hash
// (the client names, the roster's surnames, the case ids and case names): { sha256, length, probe }, where sha256 is
// the hex digest of the word's UTF-8 bytes (A-Z lower-cased first in a list matched in any case), length its length
// and probe twelve bits of a rolling hash of it. The scan rolls that hash over every window of each stored length,
// computes SHA-256 only for windows whose probe matches, and reports a window whose digest is stored: a hashed entry is
// found anywhere in a text, as a substring, exactly where the written-out expression was. Where two entries of a list
// match at one position, the one the file declares first wins, as in the one expression a list used to be.
//
// The honest limit: a hash keeps a name out of plain text, not out of reach. Anyone who guesses a name can hash it and
// confirm it against the list; the length and the probe narrow nothing a guess cannot already confirm.
import { createHash } from 'node:crypto';

export const TENANT_WORD_LISTS = ['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns'];
export const TENANT_WORD_PROBE_BITS = 12;
export const CASE_INSENSITIVE_LISTS = ['clientWords', 'hosts'];

// The multiplier of the rolling hash (odd, so every power of it is invertible modulo 2^32).
const PROBE_BASE = 0x01000193;
const PROBE_MASK = (1 << TENANT_WORD_PROBE_BITS) - 1;

export function isHashedTenantWord(entry) {
  return typeof entry === 'object' && entry !== null;
}

/** ASCII letters lower-cased and nothing else, so lengths and positions are kept: the i flag's folding of an ASCII word. */
function foldAscii(text) {
  return text.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The polynomial hash of text[start, start + length) modulo 2^32. */
function windowHash(text, start, length) {
  let hash = 0;
  for (let index = start; index < start + length; index++) {
    hash = (Math.imul(hash, PROBE_BASE) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** The probe of a rolling hash: its bits mixed (the MurmurHash3 finalizer), then the low twelve kept. */
function probeOf(hash) {
  let mixed = hash ^ (hash >>> 16);
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return (mixed >>> 0) & PROBE_MASK;
}

/** The hashed entry for a word in a list (A-Z lower-cased first where the list matches in any case). */
export function hashTenantWord(word, list) {
  if (typeof word !== 'string' || word.length === 0) {
    throw new Error('A tenant word cannot be empty.');
  }
  if (!TENANT_WORD_LISTS.includes(list)) {
    throw new Error(`Unknown tenant word list "${list}"; expected one of ${TENANT_WORD_LISTS.join(', ')}.`);
  }
  const subject = CASE_INSENSITIVE_LISTS.includes(list) ? foldAscii(word) : word;
  return { sha256: sha256Hex(subject), length: subject.length, probe: probeOf(windowHash(subject, 0, subject.length)) };
}

/** What is wrong with a word list, one line per problem ("<list>[<index>]: …"); empty when every entry is usable. */
export function tenantWordProblems(words) {
  const problems = [];
  for (const list of TENANT_WORD_LISTS) {
    const entries = words[list];
    if (!Array.isArray(entries)) {
      problems.push(`${list}: not a list`);
      continue;
    }
    if (entries.length === 0) {
      problems.push(`${list}: the list is empty`);
    }
    entries.forEach((entry, index) => {
      const where = `${list}[${index}]`;
      if (typeof entry === 'string') {
        if (entry.trim().length === 0) {
          problems.push(`${where}: a blank expression`);
          return;
        }
        try {
          new RegExp(entry).test('');
        } catch (error) {
          problems.push(`${where}: not a valid expression (${error.message})`);
        }
        return;
      }
      if (!isHashedTenantWord(entry)) {
        problems.push(`${where}: neither an expression nor a hashed word`);
        return;
      }
      const keys = Object.keys(entry).sort().join(',');
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

/** Every position where a hashed entry of the list occurs (overlaps included), by position and then by declared order. */
function hashedMatches(text, entries, caseInsensitive) {
  const subject = caseInsensitive ? foldAscii(text) : text;
  const byLength = new Map();
  for (const entry of entries) {
    const group = byLength.get(entry.word.length);
    if (group === undefined) {
      byLength.set(entry.word.length, [entry]);
    } else {
      group.push(entry);
    }
  }
  const found = [];
  byLength.forEach((group, length) => {
    if (length > subject.length) {
      return;
    }
    const probes = new Uint8Array(PROBE_MASK + 1);
    const orders = new Map();
    for (const entry of group) {
      probes[entry.word.probe] = 1;
      if (!orders.has(entry.word.sha256)) {
        orders.set(entry.word.sha256, entry.order);
      }
    }
    // PROBE_BASE^(length - 1) modulo 2^32: the weight of the code unit that leaves the window.
    let lead = 1;
    for (let step = 1; step < length; step++) {
      lead = Math.imul(lead, PROBE_BASE);
    }
    let hash = windowHash(subject, 0, length);
    for (let start = 0; ; start++) {
      if (probes[probeOf(hash)] === 1) {
        const order = orders.get(sha256Hex(subject.slice(start, start + length)));
        if (order !== undefined) {
          found.push({ index: start, order, length });
        }
      }
      const next = start + length;
      if (next >= subject.length) {
        break;
      }
      hash = (Math.imul((hash - Math.imul(subject.charCodeAt(start), lead)) | 0, PROBE_BASE) + subject.charCodeAt(next)) >>> 0;
    }
  });
  found.sort((a, b) => a.index - b.index || a.order - b.order);
  return found;
}

/**
 * The matched texts of one list, as the one expression over the whole list would report them with the g flag: the
 * leftmost match, the first entry in the file's order at that position, then on from its end (one past an empty match).
 */
function findInList(text, entries, caseInsensitive) {
  const written = [];
  const hashed = [];
  entries.forEach((entry, order) => {
    if (typeof entry === 'string') {
      written.push({ order, pattern: new RegExp(`(?:${entry})`, caseInsensitive ? 'iy' : 'y') });
    } else {
      hashed.push({ order, word: entry });
    }
  });
  const combined =
    written.length === 0
      ? undefined
      : new RegExp(
          entries
            .filter((entry) => typeof entry === 'string')
            .map((entry) => `(?:${entry})`)
            .join('|'),
          caseInsensitive ? 'gi' : 'g'
        );
  const candidates = hashed.length === 0 ? [] : hashedMatches(text, hashed, caseInsensitive);
  const found = [];
  let next = 0;
  let from = 0;
  // The leftmost written-out match at or after `from`. It stays valid while it starts at or after `from` (nothing
  // matched between the old start and it), so the text is searched once, not once per hashed match; null once there is
  // none left.
  let writtenMatch = null;
  let writtenDone = combined === undefined;
  while (from <= text.length) {
    if (!writtenDone && (writtenMatch === null || writtenMatch.index < from)) {
      combined.lastIndex = from;
      writtenMatch = combined.exec(text);
      writtenDone = writtenMatch === null;
    }
    while (next < candidates.length && candidates[next].index < from) {
      next++;
    }
    const writtenAt = writtenMatch === null || writtenMatch.index < from ? -1 : writtenMatch.index;
    const hashedAt = next < candidates.length ? candidates[next].index : -1;
    if (writtenAt < 0 && hashedAt < 0) {
      break;
    }
    const at = writtenAt < 0 ? hashedAt : hashedAt < 0 ? writtenAt : Math.min(writtenAt, hashedAt);
    let best;
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
        const match = entry.pattern.exec(text);
        if (match !== null) {
          best = { order: entry.order, text: match[0] };
          break;
        }
      }
      if (best === undefined) {
        best = { order: -1, text: writtenMatch[0] };
      }
    }
    found.push(best.text);
    from = at + (best.text.length === 0 ? 1 : best.text.length);
  }
  return found;
}

/** Every match of the given lists in a text, as "<list>: <matched text>", so a failing scan names what it found. */
export function findTenantWords(text, words, lists) {
  const found = [];
  for (const list of lists) {
    for (const matched of findInList(text, words[list], CASE_INSENSITIVE_LISTS.includes(list))) {
      found.push(`${list}: ${matched}`);
    }
  }
  return found;
}
