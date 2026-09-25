"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHECK_LIMITATION = exports.PROHIBITED_CLAIMS = exports.AVOIDED_WORDS = void 0;
exports.checkCopy = checkCopy;
/** The avoided words. Matched whole-word and case-insensitively; a longer word that merely contains one is left. */
exports.AVOIDED_WORDS = ['transform', 'unlock', 'revolutionize', 'revolutionise', 'best in class'];
exports.PROHIBITED_CLAIMS = [
    'inventedRoi',
    'inventedAdoption',
    'unsupportedAvailability',
    'unsupportedSecurity',
    'unsupportedCapability'
];
exports.CHECK_LIMITATION = 'A clean check means no avoided wording was found. It is not proof that any claim here is true; a claim is supported by an approved source or it is marked unknown.';
/** A number followed by a percent sign, or a money amount: the shapes an invented result usually arrives in. */
const FIGURE = /(\d+(?:\.\d+)?\s*%)|([$£€]\s?\d[\d,]*(?:\.\d+)?)/g;
/** Anything that is not a letter or a digit parts one word from the next. */
const NOT_WORD = /[^a-z0-9]+/g;
/**
 * Lower-cased, punctuation turned to single spaces, and padded at both ends, so a whole word or a whole phrase can
 * be found by looking for it with a space on each side. This is done without building a pattern per word: a regular
 * expression assembled from a value at run time is what the repository's lint rule warns about, and a phrase such
 * as "best in class" needs the same treatment as a single word anyway.
 */
function spaced(text) {
    return ` ${text.toLowerCase().replace(NOT_WORD, ' ').trim()} `;
}
/**
 * Reads one piece of copy. Every finding names what was found rather than which rule fired, because the reviewer
 * acting on it cares about the wording, not the policy's structure.
 *
 * A figure is reported whenever the claim carrying it cites nothing. That is deliberately noisy: a measured figure
 * with a citation passes, and an uncited one is exactly the case the prohibited-claim rule exists for.
 */
function checkCopy(text, options) {
    const findings = [];
    const subject = typeof text === 'string' ? text : '';
    const padded = spaced(subject);
    for (const word of exports.AVOIDED_WORDS) {
        if (padded.indexOf(spaced(word)) >= 0) {
            findings.push({
                kind: 'avoidedWord',
                found: word,
                note: 'The message house avoids this wording. Say what the thing does instead.'
            });
        }
    }
    const cited = options !== undefined && options.cited === true;
    if (!cited) {
        FIGURE.lastIndex = 0;
        let match = FIGURE.exec(subject);
        while (match !== null) {
            findings.push({
                kind: 'unsupportedFigure',
                found: match[0].trim(),
                note: 'A figure needs an approved source, or the claim must be marked unknown.'
            });
            match = FIGURE.exec(subject);
        }
    }
    return { findings, limitation: exports.CHECK_LIMITATION };
}
