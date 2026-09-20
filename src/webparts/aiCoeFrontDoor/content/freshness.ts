/**
 * How old a dated fact is against the document's threshold. A fact carries `asOf` (the day it was
 * last read back) and the document carries `settings.freshnessDays`; a fact older than that is
 * stale and the page says so beside it, so no reader takes an old truth for a current one (FD-25).
 * Without a readable date the age is unknown: the page then never invents one.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { readIsoDate } from './rawJson';

export type Freshness = 'current' | 'stale' | 'unknown';

const DAY_MS: number = 86400000;
const MONTHS: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The UTC midnight of a YYYY-MM-DD date, or undefined when the text is not one. */
function dateAt(asOf: string | undefined): Date | undefined {
  const iso: string | undefined = readIsoDate(asOf);
  return iso === undefined ? undefined : new Date(`${iso}T00:00:00Z`);
}

/**
 * `current` while the date is at most `freshnessDays` days before `now` (a future date is current too),
 * `stale` once it is older, `unknown` without a readable date.
 */
export function freshness(asOf: string | undefined, now: Date, freshnessDays: number): Freshness {
  const date: Date | undefined = dateAt(asOf);
  if (date === undefined) {
    return 'unknown';
  }
  return now.getTime() - date.getTime() > freshnessDays * DAY_MS ? 'stale' : 'current';
}

/** "1 Sep 2026" for a YYYY-MM-DD date; undefined for anything else, so no date is invented. */
export function formatFactDate(asOf: string | undefined): string | undefined {
  const date: Date | undefined = dateAt(asOf);
  if (date === undefined) {
    return undefined;
  }
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
