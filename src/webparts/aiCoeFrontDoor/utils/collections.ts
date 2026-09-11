/**
 * Small helpers that keep the code within the ES5 + ES2015-core library the SPFx rig compiles against
 * (no Array.prototype.includes, Object.entries, Array.from or Set spreading).
 */

export function includes<T>(list: readonly T[], value: T): boolean {
  return list.indexOf(value) >= 0;
}

/** True when `value` is an array containing at least one of `candidates`. */
export function includesAny(value: unknown, candidates: readonly string[]): boolean {
  return Array.isArray(value) && value.some((item: unknown): boolean => includes(candidates, String(item)));
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item: unknown): string => String(item)) : [];
}

export function uniqueInOrder<T>(list: readonly T[]): T[] {
  const result: T[] = [];
  for (const item of list) {
    if (!includes(result, item)) {
      result.push(item);
    }
  }
  return result;
}

export function objectKeys<T extends object>(value: T): (keyof T & string)[] {
  return Object.keys(value) as (keyof T & string)[];
}
