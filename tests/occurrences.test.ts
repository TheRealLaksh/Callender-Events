import { describe, expect, it } from 'vitest';
import { dateKey } from '../src/core/dates';
import { exdateKey, expandEvents, nextOccurrence, occurrencesOnDay } from '../src/core/occurrences';
import { instantToWallString, wallStringToInstant } from '../src/core/tz';
import { ev } from './helpers';

const NY = 'America/New_York';
const at = (wall: string, tz = NY) => new Date(wallStringToInstant(wall, tz)).toISOString();
const wall = (d: Date, tz = NY) => instantToWallString(d.getTime(), tz);

describe('expandEvents', () => {
  it('returns a one-off event only inside the window', () => {
    const e = ev({ start: at('2025-03-05T10:00'), end: at('2025-03-05T11:00') });
    expect(expandEvents([e], new Date(2025, 2, 1), new Date(2025, 3, 1))).toHaveLength(1);
    expect(expandEvents([e], new Date(2025, 3, 1), new Date(2025, 4, 1))).toHaveLength(0);
  });

  it('treats an event ending exactly at the window start as outside it', () => {
    const e = ev({ start: at('2025-03-04T23:00'), end: at('2025-03-05T00:00') });
    expect(expandEvents([e], new Date(2025, 2, 5), new Date(2025, 2, 6))).toHaveLength(0);
  });

  it('shows a multi-day event on every day it covers', () => {
    const e = ev({ start: at('2025-03-05T22:00'), end: at('2025-03-07T02:00') });
    const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 3, 1));
    const days = [4, 5, 6, 7, 8].map((d) => occurrencesOnDay(occs, new Date(2025, 2, d)).length);
    expect(days).toEqual([0, 1, 1, 1, 0]);
  });

  it('handles all-day events with an inclusive end date', () => {
    const e = ev({ allDay: true, start: '2025-03-05', end: '2025-03-06' });
    const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 3, 1));
    expect(occs).toHaveLength(1);
    expect(occurrencesOnDay(occs, new Date(2025, 2, 6))).toHaveLength(1);
    expect(occurrencesOnDay(occs, new Date(2025, 2, 7))).toHaveLength(0);
  });

  it('ignores malformed events instead of throwing', () => {
    const bad = ev({ start: 'garbage', end: 'garbage' });
    expect(expandEvents([bad], new Date(2025, 0, 1), new Date(2026, 0, 1))).toEqual([]);
  });

  describe('recurrence', () => {
    it('repeats daily with an interval', () => {
      const e = ev({
        start: at('2025-03-01T09:00'),
        end: at('2025-03-01T09:30'),
        recurrence: { freq: 'daily', interval: 3 },
      });
      const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 2, 11));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-03-01', '2025-03-04', '2025-03-07', '2025-03-10']);
    });

    it('jumps straight to a distant window without scanning from the start', () => {
      const e = ev({ start: at('2010-01-04T09:00'), end: at('2010-01-04T10:00'), recurrence: { freq: 'weekly', interval: 1 } });
      const occs = expandEvents([e], new Date(2025, 5, 1), new Date(2025, 5, 30));
      expect(occs).toHaveLength(4);
      expect(occs.every((o) => o.start.getDay() === 1)).toBe(true);
    });

    it('keeps wall-clock time across DST in the event zone', () => {
      const e = ev({ start: at('2025-03-07T09:00'), end: at('2025-03-07T10:00'), recurrence: { freq: 'daily', interval: 1 } });
      const occs = expandEvents([e], new Date(2025, 2, 7), new Date(2025, 2, 12));
      expect(occs.map((o) => wall(o.start).slice(11))).toEqual(['09:00', '09:00', '09:00', '09:00', '09:00']);
      // 24h apart before the change, 23h after
      expect(occs[2].start.getTime() - occs[1].start.getTime()).toBe(23 * 3_600_000);
    });

    it('stops after `count` occurrences', () => {
      const e = ev({
        start: at('2025-03-01T09:00'),
        end: at('2025-03-01T10:00'),
        recurrence: { freq: 'weekly', interval: 1, count: 3 },
      });
      expect(expandEvents([e], new Date(2025, 0, 1), new Date(2026, 0, 1))).toHaveLength(3);
    });

    it('counts from the true start even when the window is later', () => {
      const e = ev({
        start: at('2025-03-01T09:00'),
        end: at('2025-03-01T10:00'),
        recurrence: { freq: 'daily', interval: 1, count: 10 },
      });
      const occs = expandEvents([e], new Date(2025, 2, 8), new Date(2025, 3, 8));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-03-08', '2025-03-09', '2025-03-10']);
    });

    it('includes the `until` day itself', () => {
      const e = ev({
        start: at('2025-03-01T09:00'),
        end: at('2025-03-01T10:00'),
        recurrence: { freq: 'daily', interval: 1, until: '2025-03-03' },
      });
      expect(expandEvents([e], new Date(2025, 0, 1), new Date(2026, 0, 1))).toHaveLength(3);
    });

    it('skips months that lack the day (monthly on the 31st)', () => {
      const e = ev({ start: at('2025-01-31T09:00'), end: at('2025-01-31T10:00'), recurrence: { freq: 'monthly', interval: 1 } });
      const occs = expandEvents([e], new Date(2025, 0, 1), new Date(2025, 6, 1));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-01-31', '2025-03-31', '2025-05-31']);
    });

    it('repeats yearly and skips 29 Feb in non-leap years', () => {
      const e = ev({ allDay: true, start: '2024-02-29', end: '2024-02-29', recurrence: { freq: 'yearly', interval: 1 } });
      const occs = expandEvents([e], new Date(2024, 0, 1), new Date(2029, 0, 1));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2024-02-29', '2028-02-29']);
    });

    it('repeats a long all-day event with the right span', () => {
      const e = ev({
        allDay: true,
        start: '2025-03-03',
        end: '2025-03-04',
        recurrence: { freq: 'weekly', interval: 1, count: 2 },
      });
      const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 3, 30));
      expect(occs).toHaveLength(2);
      expect(dateKey(occs[1].start)).toBe('2025-03-10');
      expect(occurrencesOnDay(occs, new Date(2025, 2, 11))).toHaveLength(1);
    });

    it('repeats on several weekdays per week (Mon/Wed/Fri)', () => {
      // 2025-03-03 is a Monday
      const e = ev({
        start: at('2025-03-03T09:00'),
        end: at('2025-03-03T09:30'),
        recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5] },
      });
      const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 2, 15));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-03-03', '2025-03-05', '2025-03-07', '2025-03-10', '2025-03-12', '2025-03-14']);
    });

    it('honours the interval for multi-weekday repeats and skips days before the start', () => {
      // Start on Wednesday 2025-03-05; repeat Mon+Wed every 2 weeks. The Monday of the first week is before the start.
      const e = ev({
        start: at('2025-03-05T09:00'),
        end: at('2025-03-05T10:00'),
        recurrence: { freq: 'weekly', interval: 2, weekdays: [1, 3] },
      });
      const occs = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 3, 15));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-03-05', '2025-03-17', '2025-03-19', '2025-03-31', '2025-04-02', '2025-04-14']);
    });

    it('counts every occurrence of a multi-weekday series', () => {
      const e = ev({
        start: at('2025-03-03T09:00'),
        end: at('2025-03-03T10:00'),
        recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5], count: 5 },
      });
      const occs = expandEvents([e], new Date(2025, 0, 1), new Date(2026, 0, 1));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-03-03', '2025-03-05', '2025-03-07', '2025-03-10', '2025-03-12']);
    });

    it('jumps to a far window for multi-weekday series without losing occurrences', () => {
      const e = ev({
        start: at('2015-01-05T09:00'),
        end: at('2015-01-05T10:00'),
        recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 4] },
      });
      const occs = expandEvents([e], new Date(2025, 5, 2), new Date(2025, 5, 9));
      expect(occs.map((o) => dateKey(o.start))).toEqual(['2025-06-02', '2025-06-05']);
    });

    it('skips excluded occurrences (timed and all-day)', () => {
      const e = ev({
        start: at('2025-03-01T09:00'),
        end: at('2025-03-01T10:00'),
        recurrence: { freq: 'daily', interval: 1, count: 4 },
        exdates: [at('2025-03-02T09:00')],
      });
      expect(expandEvents([e], new Date(2025, 2, 1), new Date(2025, 2, 10)).map((o) => dateKey(o.start))).toEqual(['2025-03-01', '2025-03-03', '2025-03-04']);
      const a = ev({ allDay: true, start: '2025-03-01', end: '2025-03-01', recurrence: { freq: 'daily', interval: 1, count: 3 }, exdates: ['2025-03-02'] });
      expect(expandEvents([a], new Date(2025, 2, 1), new Date(2025, 2, 10)).map((o) => dateKey(o.start))).toEqual(['2025-03-01', '2025-03-03']);
    });

    it('builds exdate keys that match what expansion excludes', () => {
      const e = ev({ start: at('2025-03-01T09:00'), end: at('2025-03-01T10:00'), recurrence: { freq: 'weekly', interval: 1 } });
      const occ = expandEvents([e], new Date(2025, 2, 8), new Date(2025, 2, 9))[0];
      const without = { ...e, exdates: [exdateKey(occ)] };
      expect(expandEvents([without], new Date(2025, 2, 8), new Date(2025, 2, 9))).toHaveLength(0);
      expect(expandEvents([without], new Date(2025, 2, 15), new Date(2025, 2, 16))).toHaveLength(1);
    });

    it('gives each occurrence a unique key', () => {
      const e = ev({ start: at('2025-03-01T09:00'), end: at('2025-03-01T10:00'), recurrence: { freq: 'daily', interval: 1 } });
      const keys = expandEvents([e], new Date(2025, 2, 1), new Date(2025, 2, 8)).map((o) => o.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('finds the next occurrence', () => {
    const e = ev({ start: at('2025-03-01T09:00'), end: at('2025-03-01T10:00'), recurrence: { freq: 'weekly', interval: 1 } });
    const next = nextOccurrence(e, new Date(2025, 2, 10));
    expect(next && dateKey(next.start)).toBe('2025-03-15');
  });
});
