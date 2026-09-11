/** Intake identifiers keep the shipped `OVT-AICOE-YYYYMMDD-XXXXXXXX` format; the Power Automate flows rely on it. */
export const INTAKE_ID_PREFIX: string = 'OVT-AICOE-';

const SUFFIX_LENGTH: number = 8;
const ALPHABET: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Fills the buffer with random bytes and returns it (the `crypto.getRandomValues` contract). */
export type RandomBytes = (buffer: Uint8Array) => Uint8Array;

function defaultRandomBytes(buffer: Uint8Array): Uint8Array {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(buffer);
  }
  for (let index: number = 0; index < buffer.length; index++) {
    buffer[index] = Math.floor(Math.random() * 256);
  }
  return buffer;
}

/** Eight upper-case base-36 characters, like the original `Math.random().toString(36)` suffix but always full length. */
export function randomIntakeSuffix(fill: RandomBytes = defaultRandomBytes): string {
  const bytes: Uint8Array = fill(new Uint8Array(SUFFIX_LENGTH));
  let suffix: string = '';
  for (let index: number = 0; index < bytes.length; index++) {
    suffix += ALPHABET.charAt(bytes[index] % ALPHABET.length);
  }
  return suffix;
}

function padTwo(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function createIntakeId(now: Date = new Date(), suffix: () => string = randomIntakeSuffix): string {
  const date: string = [now.getUTCFullYear(), padTwo(now.getUTCMonth() + 1), padTwo(now.getUTCDate())].join('');
  return `${INTAKE_ID_PREFIX}${date}-${suffix()}`;
}
