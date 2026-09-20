/**
 * Reads the values of a list row without inventing any: an empty cell, a missing column, a word that
 * is not a number and a stamp that is not a date all stay absent. The rule this file exists for is
 * that a blank never becomes `0` (`Number('')`, `Number(null)` and `Number([])` all do), because a
 * zero on a page reads as a measured result and an empty cell means nobody has measured anything.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { readIsoDate, readText } from './rawJson';

/** A finite number the row carries, zero included; undefined for a blank, a word or anything else. */
export function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return isFinite(value) ? value : undefined;
  }
  const text: string | undefined = typeof value === 'string' ? readText(value) : undefined;
  if (text === undefined) {
    return undefined;
  }
  const parsed: number = Number(text);
  return isNaN(parsed) || !isFinite(parsed) ? undefined : parsed;
}

/** The trimmed words of a text column; undefined when the cell is empty or holds something else. */
export function optionalWords(value: unknown): string | undefined {
  return typeof value === 'string' ? readText(value) : undefined;
}

/**
 * The calendar day of a date column as YYYY-MM-DD, so the page formats it exactly as it formats a
 * date written in the content document; undefined for anything that is not a date that exists.
 */
export function optionalDay(value: unknown): string | undefined {
  const text: string | undefined = optionalWords(value);
  if (text === undefined) {
    return undefined;
  }
  const separator: number = text.indexOf('T');
  return readIsoDate(separator < 0 ? text : text.slice(0, separator));
}
