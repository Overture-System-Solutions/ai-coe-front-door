import { PALETTE_KEYS, paletteCustomProperty, parsePaletteOverrides } from './palette';
import type { PaletteKey, PaletteOverrides } from './palette';

describe('PALETTE_KEYS', () => {
  it('names the ten colours a tenant may override, in the order the README documents', () => {
    expect(PALETTE_KEYS).toEqual([
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
      'heroGlow'
    ]);
  });

  it('gives every key a lower-case custom property name, so no step that lower-cases a name can break the pair', () => {
    const names: string[] = PALETTE_KEYS.map((key: PaletteKey): string => paletteCustomProperty(key));
    expect(names).toEqual([
      '--fd-accent',
      '--fd-ink',
      '--fd-muted',
      '--fd-bg',
      '--fd-paper',
      '--fd-focus',
      '--fd-state-green',
      '--fd-state-blue',
      '--fd-state-amber',
      '--fd-state-red',
      '--fd-line',
      '--fd-soft',
      '--fd-hero-from',
      '--fd-hero-to',
      '--fd-hero-glow'
    ]);
    for (const name of names) {
      expect(name).toBe(name.toLowerCase());
    }
  });
});

describe('parsePaletteOverrides', () => {
  it('keeps the known keys whose value is a hex colour and drops the rest', () => {
    const palette: PaletteOverrides = parsePaletteOverrides('accent=#008B83;ink=#102B3D;bogus=x;muted=red');
    expect(palette).toEqual({ accent: '#008B83', ink: '#102B3D' });
    expect(Object.keys(palette)).toHaveLength(2);
  });

  it('is empty for a blank, absent or shapeless value', () => {
    expect(parsePaletteOverrides('')).toEqual({});
    expect(parsePaletteOverrides('   ')).toEqual({});
    expect(parsePaletteOverrides(undefined)).toEqual({});
    expect(parsePaletteOverrides('#008B83')).toEqual({});
    expect(parsePaletteOverrides(';;=;=#fff;accent=')).toEqual({});
  });

  it('trims the pairs, takes three-digit hex, keeps the case of the value and lets the last pair win', () => {
    expect(parsePaletteOverrides(' accent = #0f0 ; stateGreen=#DDF6F0 ;')).toEqual({ accent: '#0f0', stateGreen: '#DDF6F0' });
    expect(parsePaletteOverrides('ink=#102B3D;ink=#062A46')).toEqual({ ink: '#062A46' });
  });

  it('refuses a value that is not a plain hex colour, so no expression reaches the style attribute', () => {
    for (const value of ['red', 'rgb(0,0,0)', 'var(--x)', '#12345', '#1234567', 'url(x)', '#00ff00 !important', 'expression(1)']) {
      expect({ value, palette: parsePaletteOverrides(`accent=${value}`) }).toEqual({ value, palette: {} });
    }
  });

  it('takes every key the property names', () => {
    const pairs: string = PALETTE_KEYS.map((key: PaletteKey): string => `${key}=#010203`).join(';');
    const palette: PaletteOverrides = parsePaletteOverrides(pairs);
    expect(Object.keys(palette).sort()).toEqual(PALETTE_KEYS.slice().sort());
  });
});
