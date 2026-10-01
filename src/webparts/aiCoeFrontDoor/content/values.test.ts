import { optionalDay, optionalNumber, optionalWords } from './values';

describe('optionalNumber', () => {
  it('keeps a number the row actually carries, zero included', () => {
    expect(optionalNumber(0)).toBe(0);
    expect(optionalNumber(0.62)).toBe(0.62);
    expect(optionalNumber(-4)).toBe(-4);
    expect(optionalNumber(1250)).toBe(1250);
    // A column typed as a number can still arrive as its text; a readable one counts.
    expect(optionalNumber('0')).toBe(0);
    expect(optionalNumber('0.62')).toBe(0.62);
    expect(optionalNumber(' 12.5 ')).toBe(12.5);
  });

  it('never turns a blank into zero', () => {
    // The whole point of the reader: an empty cell is an unknown, and an unknown must never be shown as 0.
    for (const blank of ['', '   ', null, undefined, [], {}, false, true, 'pending', 'NaN', NaN, Infinity, -Infinity]) {
      expect({ blank, read: optionalNumber(blank) }).toEqual({ blank, read: undefined });
      expect(optionalNumber(blank)).not.toBe(0);
    }
    // And the trap the plain conversions fall into, written out.
    expect(Number('')).toBe(0);
    expect(Number([])).toBe(0);
    expect(Number(null)).toBe(0);
    expect(Number(false)).toBe(0);
  });
});

describe('optionalWords', () => {
  it('keeps a trimmed word and drops everything blank', () => {
    expect(optionalWords(' Quarterly review ')).toBe('Quarterly review');
    expect(optionalWords('EV-2026-Q2')).toBe('EV-2026-Q2');
    for (const blank of ['', '   ', null, undefined, 4, [], {}, true]) {
      expect({ blank, read: optionalWords(blank) }).toEqual({ blank, read: undefined });
    }
  });
});

describe('optionalDay', () => {
  it('reads the calendar day of a stamp or a date and nothing else', () => {
    expect(optionalDay('2026-06-30T00:00:00Z')).toBe('2026-06-30');
    expect(optionalDay('2026-06-30T23:59:59.999Z')).toBe('2026-06-30');
    expect(optionalDay('2026-06-30')).toBe('2026-06-30');
    expect(optionalDay(' 2026-06-30 ')).toBe('2026-06-30');
    for (const blank of ['', '   ', null, undefined, 20260630, 'the second quarter', '30/06/2026', '2026-13-01', '2026-02-30']) {
      expect({ blank, read: optionalDay(blank) }).toEqual({ blank, read: undefined });
    }
  });
});
