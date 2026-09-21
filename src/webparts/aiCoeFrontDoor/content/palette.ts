/**
 * The ten colours a tenant may set, and how the `paletteOverrides` property carries them. The colours of an
 * organization are a parameter, never code: the provisioning script writes the value on every instance from the
 * `Palette` parameter, the web part reads it here and sets each pair as a `--fd-*` custom property on its own
 * element, exactly as the theme colours are set. The rules that read a token do so through `var(--fd-x, <literal>)`
 * with the front door's own colour as the fallback, and no stylesheet declares a token of its own: a declaration
 * inside the web part would win over the value set on the element above it and every override would be dead.
 *
 * Only a plain hex colour is taken. A pair with an unknown key, a colour in any other notation or a value that is
 * something else entirely is dropped on its own, so one typo never costs the rest and nothing but a colour ever
 * reaches the style of the element.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { includes } from '../utils/collections';

/**
 * The colour each key stands for is documented in the README under "Palette override".
 *
 * The last seven arrived with the consolidated view. Five name roles the shipped ten had no word for - a hairline,
 * a soft surface, and the three stops of the entry panel's wash. The other two are the pressed and tinted states of
 * the accent, which the parts the consolidated view reuses need: those parts colour themselves from the theme
 * variables of the shipped bundle, and without a word for the darker and softer accent the view would carry one
 * accent in its own chrome and another in every reused button. Each falls back to a colour the front door already
 * draws, so a site that sets no palette is unchanged.
 */
export type PaletteKey =
  | 'accent'
  | 'ink'
  | 'muted'
  | 'bg'
  | 'paper'
  | 'focus'
  | 'stateGreen'
  | 'stateBlue'
  | 'stateAmber'
  | 'stateRed'
  // Added for the consolidated view: the roles its component kit needs that the shipped ten do not cover.
  | 'line'
  | 'soft'
  | 'heroFrom'
  | 'heroTo'
  | 'heroGlow'
  // The two states of the accent the reused parts of the front door draw themselves with.
  | 'accentDark'
  | 'accentSoft';

export const PALETTE_KEYS: readonly PaletteKey[] = [
  'accent',
  'ink',
  'muted',
  'bg',
  'paper',
  'focus',
  'stateGreen',
  'stateBlue',
  'stateAmber',
  'stateRed',
  'line',
  'soft',
  'heroFrom',
  'heroTo',
  'heroGlow',
  'accentDark',
  'accentSoft'
];

/** The colours a tenant set, by key; a key nobody set is absent and its fallback stands. */
export type PaletteOverrides = { [key in PaletteKey]?: string };

const PAIR_SEPARATOR: RegExp = /;/;
/** Three or six hexadecimal digits after a hash, and nothing else: no function, no keyword, no second value. */
const HEX_COLOUR: RegExp = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CAPITAL: RegExp = /([A-Z])/g;

export function isPaletteKey(value: string): value is PaletteKey {
  return includes(PALETTE_KEYS, value as PaletteKey);
}

/**
 * The custom property a key is set and read under: `stateGreen` becomes `--fd-state-green`. Every name is lower
 * case, so no step that lower-cases a name can part the value the web part sets from the rule that reads it.
 */
export function paletteCustomProperty(key: PaletteKey): string {
  return `--fd-${key.replace(CAPITAL, (capital: string): string => `-${capital.toLowerCase()}`)}`;
}

/**
 * Reads the `paletteOverrides` property: pairs of a key and a hex colour, one pair per semicolon, the key and the
 * colour parted by the first equals sign and both trimmed. When a key is set twice the last pair wins; the case of
 * the colour is kept as it was given.
 */
export function parsePaletteOverrides(value: string | undefined): PaletteOverrides {
  const palette: PaletteOverrides = {};
  if (typeof value !== 'string') {
    return palette;
  }
  for (const entry of value.split(PAIR_SEPARATOR)) {
    const separator: number = entry.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key: string = entry.slice(0, separator).trim();
    const colour: string = entry.slice(separator + 1).trim();
    if (isPaletteKey(key) && HEX_COLOUR.test(colour)) {
      palette[key] = colour;
    }
  }
  return palette;
}
