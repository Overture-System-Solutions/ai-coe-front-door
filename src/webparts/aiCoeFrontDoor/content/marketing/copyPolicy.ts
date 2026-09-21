/**
 * The initial generated-copy policy: the words a draft may not use, and the claim classes it may not make.
 *
 * Decision 5 of the local baseline. The word list is the campaign brief's message-house guidance plus the copy
 * deck's prohibited-claims guidance, as the baseline states them. Any further brand or legal vocabulary the organization sets
 * is a **pending input**, so this list is a starting point and is written to be extended, not a finished policy.
 *
 * The honest limit, stated here because it is easy to forget once a check goes green: **passing this check is not
 * proof that a claim is true.** It finds four words and some obvious shapes. It cannot tell whether a figure was
 * measured, whether a capability exists in the tenant, or whether a security statement is supportable. Those are
 * decided by the source register and a human reviewer, and `checkCopy` says so in its own result.
 *
 * Scope. `docs/content-claims.md` carries further restrictions; the baseline keeps those scoped to the user
 * interface. They are deliberately not applied here to schema keys, citations or technical documentation, because
 * a ban written for reader-facing wording makes nonsense of a field name or a source reference.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The avoided words. Matched whole-word and case-insensitively; a longer word that merely contains one is left. */
export const AVOIDED_WORDS: readonly string[] = ['transform', 'unlock', 'revolutionize', 'revolutionise', 'best in class'];

/** The claim classes a draft may not make without evidence the register carries. */
export type ProhibitedClaim = 'inventedRoi' | 'inventedAdoption' | 'unsupportedAvailability' | 'unsupportedSecurity' | 'unsupportedCapability';

export const PROHIBITED_CLAIMS: readonly ProhibitedClaim[] = [
  'inventedRoi',
  'inventedAdoption',
  'unsupportedAvailability',
  'unsupportedSecurity',
  'unsupportedCapability'
];

export interface ICopyFinding {
  kind: 'avoidedWord' | 'unsupportedFigure';
  /** What was found, in the reader's own words, so a reviewer can see it without reading the rule. */
  found: string;
  note: string;
}

export interface ICopyCheckResult {
  findings: ICopyFinding[];
  /**
   * Always present, always the same sentence. A caller that shows a clean result must show this with it, so nobody
   * reads a word check as a fact check.
   */
  limitation: string;
}

export const CHECK_LIMITATION: string =
  'A clean check means no avoided wording was found. It is not proof that any claim here is true; a claim is supported by an approved source or it is marked unknown.';

/** A number followed by a percent sign, or a money amount: the shapes an invented result usually arrives in. */
const FIGURE: RegExp = /(\d+(?:\.\d+)?\s*%)|([$£€]\s?\d[\d,]*(?:\.\d+)?)/g;
/** Anything that is not a letter or a digit parts one word from the next. */
const NOT_WORD: RegExp = /[^a-z0-9]+/g;

/**
 * Lower-cased, punctuation turned to single spaces, and padded at both ends, so a whole word or a whole phrase can
 * be found by looking for it with a space on each side. This is done without building a pattern per word: a regular
 * expression assembled from a value at run time is what the repository's lint rule warns about, and a phrase such
 * as "best in class" needs the same treatment as a single word anyway.
 */
function spaced(text: string): string {
  return ` ${text.toLowerCase().replace(NOT_WORD, ' ').trim()} `;
}

/**
 * Reads one piece of copy. Every finding names what was found rather than which rule fired, because the reviewer
 * acting on it cares about the wording, not the policy's structure.
 *
 * A figure is reported whenever the claim carrying it cites nothing. That is deliberately noisy: a measured figure
 * with a citation passes, and an uncited one is exactly the case the prohibited-claim rule exists for.
 */
export function checkCopy(text: string, options?: { cited?: boolean }): ICopyCheckResult {
  const findings: ICopyFinding[] = [];
  const subject: string = typeof text === 'string' ? text : '';
  const padded: string = spaced(subject);
  for (const word of AVOIDED_WORDS) {
    if (padded.indexOf(spaced(word)) >= 0) {
      findings.push({
        kind: 'avoidedWord',
        found: word,
        note: 'The message house avoids this wording. Say what the thing does instead.'
      });
    }
  }
  const cited: boolean = options !== undefined && options.cited === true;
  if (!cited) {
    FIGURE.lastIndex = 0;
    let match: RegExpExecArray | null = FIGURE.exec(subject);
    while (match !== null) {
      findings.push({
        kind: 'unsupportedFigure',
        found: match[0].trim(),
        note: 'A figure needs an approved source, or the claim must be marked unknown.'
      });
      match = FIGURE.exec(subject);
    }
  }
  return { findings, limitation: CHECK_LIMITATION };
}
