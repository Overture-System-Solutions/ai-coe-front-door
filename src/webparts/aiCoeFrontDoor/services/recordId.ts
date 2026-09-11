/** The part of `crypto` the record ids need; absent in very old browsers. */
export interface IUuidSource {
  randomUUID?: () => string;
}

function globalUuidSource(): IUuidSource | undefined {
  return typeof crypto !== 'undefined' ? crypto : undefined;
}

/**
 * Local record id for policy-gap and feedback records: `<prefix>-<uuid>`, or a timestamp plus random
 * suffix when `randomUUID` is unavailable (as shipped).
 */
export function createRecordId(
  prefix: string,
  source: IUuidSource | undefined = globalUuidSource(),
  now: () => number = Date.now,
  random: () => number = Math.random
): string {
  if (source !== undefined && typeof source.randomUUID === 'function') {
    return `${prefix}-${source.randomUUID()}`;
  }
  return `${prefix}-${now()}-${random().toString(36).slice(2, 10)}`;
}
