/**
 * Freshness of a dated fact against the document's threshold: current within the window, stale
 * beyond it, unknown without a readable date. Nothing here invents a date.
 */
import { DEFAULT_SETTINGS } from './pageContent';
import { formatFactDate, freshness } from './freshness';

const NOW: Date = new Date('2026-09-19T12:00:00Z');

describe('freshness', () => {
  it('is current when the date is within the threshold', () => {
    expect(freshness('2026-09-01', NOW, 30)).toBe('current');
    expect(freshness('2026-09-19', NOW, 30)).toBe('current');
  });

  it('is stale when the date is older than the threshold', () => {
    expect(freshness('2026-08-05', NOW, 30)).toBe('stale');
    expect(freshness('2026-09-01', NOW, 7)).toBe('stale');
  });

  it('treats a date exactly at the threshold as current and one day beyond it as stale', () => {
    expect(freshness('2026-08-20', new Date('2026-09-19T00:00:00Z'), 30)).toBe('current');
    expect(freshness('2026-08-19', new Date('2026-09-19T00:00:00Z'), 30)).toBe('stale');
  });

  it('is unknown without a date or with one it cannot read', () => {
    expect(freshness(undefined, NOW, 30)).toBe('unknown');
    expect(freshness('', NOW, 30)).toBe('unknown');
    expect(freshness('last Friday', NOW, 30)).toBe('unknown');
    expect(freshness('2026-9-1', NOW, 30)).toBe('unknown');
    expect(freshness('2026-02-30', NOW, 30)).toBe('unknown');
  });

  it('never calls a future date stale', () => {
    expect(freshness('2027-01-01', NOW, DEFAULT_SETTINGS.freshnessDays)).toBe('current');
  });
});

describe('formatFactDate', () => {
  it('writes the day, the short month and the year without a leading zero', () => {
    expect(formatFactDate('2026-09-01')).toBe('1 Sep 2026');
    expect(formatFactDate('2026-12-25')).toBe('25 Dec 2026');
    expect(formatFactDate('2027-01-10')).toBe('10 Jan 2027');
  });

  it('gives nothing for a date it cannot read, so no date is invented', () => {
    expect(formatFactDate(undefined)).toBeUndefined();
    expect(formatFactDate('yesterday')).toBeUndefined();
    expect(formatFactDate('2026-13-01')).toBeUndefined();
  });
});
