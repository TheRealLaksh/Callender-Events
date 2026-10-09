import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateKey, diffDays, monthGrid, parseDateKey, startOfWeek, weekDays } from '../src/core/dates';
import { instantToWallString, isValidTimeZone, offsetAt, wallAt, wallStringToInstant, wallToInstant } from '../src/core/tz';

describe('time zones', () => {
  it('reads wall time in another zone', () => {
    const ms = Date.UTC(2025, 0, 15, 12, 0); // 12:00Z
    expect(instantToWallString(ms, 'Asia/Kolkata')).toBe('2025-01-15T17:30');
    expect(instantToWallString(ms, 'America/Los_Angeles')).toBe('2025-01-15T04:00');
  });

  it('round-trips wall time through an instant', () => {
    const iso = '2025-07-04T09:45';
    for (const tz of ['UTC', 'Asia/Kolkata', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Auckland']) {
      expect(instantToWallString(wallStringToInstant(iso, tz), tz)).toBe(iso);
    }
  });

  it('handles the offset change across DST', () => {
    expect(offsetAt(Date.UTC(2025, 0, 15), 'America/New_York')).toBe(-5 * 3_600_000);
    expect(offsetAt(Date.UTC(2025, 6, 15), 'America/New_York')).toBe(-4 * 3_600_000);
  });

  it('moves a time skipped by spring-forward to after the gap', () => {
    // 2025-03-09 02:30 does not exist in New York.
    const ms = wallStringToInstant('2025-03-09T02:30', 'America/New_York');
    expect(instantToWallString(ms, 'America/New_York')).toBe('2025-03-09T03:30');
  });

  it('resolves a repeated fall-back hour to its first occurrence', () => {
    // 2025-11-02 01:30 happens twice in New York; the first is still EDT (05:30Z).
    expect(new Date(wallStringToInstant('2025-11-02T01:30', 'America/New_York')).toISOString()).toBe('2025-11-02T05:30:00.000Z');
  });

  it('is not fooled by midnight rendered as 24:00', () => {
    expect(wallAt(Date.UTC(2025, 0, 1, 5, 0), 'America/New_York').h).toBe(0);
  });

  it('validates zone names', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('builds an instant from parts', () => {
    expect(wallToInstant({ y: 2025, m: 1, d: 1, h: 0, mi: 0 }, 'Asia/Kolkata')).toBe(Date.UTC(2024, 11, 31, 18, 30));
  });
});

describe('dates', () => {
  it('clamps month arithmetic', () => {
    expect(dateKey(addMonths(new Date(2025, 0, 31), 1))).toBe('2025-02-28');
    expect(dateKey(addMonths(new Date(2024, 0, 31), 1))).toBe('2024-02-29');
    expect(dateKey(addMonths(new Date(2025, 0, 15), -1))).toBe('2024-12-15');
  });

  it('counts calendar days across DST', () => {
    expect(diffDays(new Date(2025, 2, 8), new Date(2025, 2, 10))).toBe(2);
  });

  it('rejects impossible date keys', () => {
    expect(parseDateKey('2025-02-30')).toBeNull();
    expect(parseDateKey('nope')).toBeNull();
    expect(dateKey(parseDateKey('2025-02-28') as Date)).toBe('2025-02-28');
  });

  it('finds the start of the week for each convention', () => {
    const wed = new Date(2025, 0, 15);
    expect(dateKey(startOfWeek(wed, 0))).toBe('2025-01-12');
    expect(dateKey(startOfWeek(wed, 1))).toBe('2025-01-13');
    expect(dateKey(startOfWeek(wed, 6))).toBe('2025-01-11');
    expect(weekDays(wed, 1)).toHaveLength(7);
  });

  it('always lays out six full weeks beginning on the week start', () => {
    for (const ws of [0, 1, 6] as const) {
      const g = monthGrid(new Date(2025, 1, 10), ws);
      expect(g).toHaveLength(42);
      expect(g[0].getDay()).toBe(ws);
      expect(dateKey(g[41])).toBe(dateKey(addDays(g[0], 41)));
    }
  });
});
