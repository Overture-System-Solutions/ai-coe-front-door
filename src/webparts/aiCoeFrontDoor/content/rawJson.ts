/**
 * Readers for the hand-edited JSON the content document and its route list are made of: strict
 * about types, lenient about whitespace, and undefined for anything that is not what was asked for.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

export type Raw = { [key: string]: unknown };

/** A plain object (not an array, not null); undefined for anything else. */
export function asObject(value: unknown): Raw | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : undefined;
}

/**
 * The keys of a parsed object that are safe to copy into a fresh map: JSON.parse keeps a `__proto__`
 * member as an own key, and writing it onto a plain object would swap that object's prototype
 * instead of adding an entry, so that one key is left out.
 */
export function ownKeys(raw: Raw): string[] {
  return Object.keys(raw).filter((key: string): boolean => key !== '__proto__');
}

/** A trimmed, non-empty string; undefined for anything else. */
export function readText(value: unknown): string | undefined {
  const text: string = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

/** Sets `key` on `target` only when there is a value, so absent fields stay absent. */
export function setOptional<T extends object>(target: T, key: keyof T, value: string | undefined): void {
  if (value !== undefined) {
    (target as { [name: string]: unknown })[key as string] = value;
  }
}

/** The well-formed items of an array, each read by `readItem`; anything else is left out. */
export function readItems<T>(value: unknown, readItem: (raw: Raw) => T | undefined): T[] {
  const items: T[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const raw: Raw | undefined = asObject(entry);
      const item: T | undefined = raw === undefined ? undefined : readItem(raw);
      if (item !== undefined) {
        items.push(item);
      }
    }
  }
  return items;
}

const ISO_DATE: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date written as YYYY-MM-DD that exists; undefined for anything else. */
export function readIsoDate(value: unknown): string | undefined {
  const text: string | undefined = readText(value);
  const match: RegExpExecArray | null = text === undefined ? null : ISO_DATE.exec(text);
  if (match === null) {
    return undefined;
  }
  const parsed: Date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.toISOString().slice(0, 10) === text ? text : undefined;
}

/** The trimmed, non-empty strings of an array; anything else is left out. */
export function readStringList(value: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text: string | undefined = readText(entry);
      if (text !== undefined) {
        list.push(text);
      }
    }
  }
  return list;
}

/** True only for a literal `true`; undefined for anything else, so a flag stays absent unless set. */
export function readFlag(value: unknown): true | undefined {
  return value === true ? true : undefined;
}
