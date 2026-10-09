import { describe, expect, it, vi } from 'vitest';
import { LEGACY_STORAGE_KEY, migrateLegacy } from '../src/core/migrate';
import { layoutColumns } from '../src/core/layout';
import { matchEvents } from '../src/core/search';
import { dueReminders } from '../src/core/reminders';
import { normalizeEvent } from '../src/core/normalize';
import { EventStore, STORAGE_KEY } from '../src/state/store';
import { PrefsStore } from '../src/state/prefs';
import { detachOccurrence, excludeOccurrence, shiftedSpan } from '../src/state/actions';
import { retargetSeries } from '../src/core/series';
import { isLegacyHost, NEW_HOST } from '../src/ui/moved';
import { wallStringToInstant } from '../src/core/tz';
import { ev, MemoryStorage } from './helpers';

const draft = (title: string, start = '2025-03-05T15:00:00.000Z') => ({
  title,
  location: '',
  description: '',
  category: 'work' as const,
  allDay: false,
  start,
  end: new Date(Date.parse(start) + 3_600_000).toISOString(),
  tz: 'UTC',
  reminders: [],
});

describe('EventStore', () => {
  it('adds, updates and removes with persistence', () => {
    const storage = new MemoryStorage();
    const store = new EventStore(storage);
    const a = store.add(draft('A'));
    store.update(a.id, { title: 'A2' });
    expect(new EventStore(storage).list()[0].title).toBe('A2');
    store.remove(a.id);
    expect(new EventStore(storage).list()).toHaveLength(0);
  });

  it('undoes and redoes, and a new change clears redo', () => {
    const store = new EventStore(new MemoryStorage());
    const a = store.add(draft('A'));
    store.remove(a.id);
    expect(store.list()).toHaveLength(0);
    expect(store.undo()).toBe('Event deleted');
    expect(store.list()).toHaveLength(1);
    expect(store.redo()).toBe('Event deleted');
    expect(store.list()).toHaveLength(0);
    store.undo();
    store.add(draft('B'));
    expect(store.canRedo).toBe(false);
    expect(store.undo()).toBe('Event added');
    expect(store.undo()).toBe('Event added');
    expect(store.undo()).toBeNull();
  });

  it('notifies subscribers once per change', () => {
    const store = new EventStore(new MemoryStorage());
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.add(draft('A'));
    store.undo();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    store.add(draft('B'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('upserts by uid as a single undo step', () => {
    const store = new EventStore(new MemoryStorage());
    store.add({ ...draft('Old'), uid: 'same@x' });
    const res = store.upsertMany(
      [
        { ...draft('New'), uid: 'same@x' },
        { ...draft('Other'), uid: 'other@x' },
      ],
      'Imported',
    );
    expect(res).toEqual({ added: 1, updated: 1 });
    expect(store.list().map((e) => e.title)).toEqual(['New', 'Other']);
    store.undo();
    expect(store.list().map((e) => e.title)).toEqual(['Old']);
  });

  it('survives corrupt storage and unusable rows', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(new EventStore(storage).list()).toEqual([]);
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, events: [null, { start: 'x' }, ev({ start: '2025-01-01T00:00:00Z', end: '2025-01-01T01:00:00Z' })] }));
    expect(new EventStore(storage).list()).toHaveLength(1);
  });

  it('reports storage failures instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const store = new EventStore(storage);
    expect(() => store.add(draft('A'))).not.toThrow();
    expect(store.persistError?.message).toMatch(/Quota/);
    expect(store.list()).toHaveLength(1);
  });

  it('works with no storage at all', () => {
    const store = new EventStore(null);
    store.add(draft('A'));
    expect(store.list()).toHaveLength(1);
  });
});

describe('legacy migration', () => {
  const legacy = {
    events: [
      { id: 3, name: 'Local wall', datetimeStart: '2025-03-05T10:00', datetimeEnd: '2025-03-05T11:00', category: 'Health', timezone: 'Asia/Kolkata', reminders: ['-PT15M', '-P1D'], location: 'Zoom', description: 'n' },
      { id: 4, name: 'Dragged', datetimeStart: '2025-03-06T15:00:00.000Z', datetimeEnd: '2025-03-06T16:00:00.000Z', reminders: [] },
      { id: 5, name: 'Broken', datetimeStart: 'nope', datetimeEnd: 'nope' },
    ],
    trash: [],
    eventIdCounter: 6,
  };

  it('converts v1 data', () => {
    const out = migrateLegacy(legacy);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: 'Local wall', category: 'health', location: 'Zoom', reminders: [15, 1440], allDay: false });
    expect(out[0].start).toBe(new Date(wallStringToInstant('2025-03-05T10:00', out[0].tz)).toISOString());
    expect(out[1].start).toBe('2025-03-06T15:00:00.000Z');
    expect(out[1].category).toBe('work');
  });

  it('accepts the oldest array-only format', () => {
    expect(migrateLegacy(legacy.events)).toHaveLength(2);
    expect(migrateLegacy('junk')).toEqual([]);
  });

  it('runs on first load and keeps the old key as a backup', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const store = new EventStore(storage);
    expect(store.list()).toHaveLength(2);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
    store.clear();
    // v2 data now exists (even if empty), so legacy is not imported a second time.
    expect(new EventStore(storage).list()).toHaveLength(0);
  });
});

describe('normalizeEvent', () => {
  it('repairs recoverable fields and rejects the rest', () => {
    const fixed = normalizeEvent({
      id: 'x',
      title: '   ',
      category: 'bogus',
      tz: 'Nope/Zone',
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T01:00:00Z',
      reminders: [15, -1, 'x', 15, 1.5],
      recurrence: { freq: 'hourly' },
    });
    expect(fixed).toMatchObject({ title: 'Untitled', category: 'work', reminders: [15] });
    expect(fixed?.recurrence).toBeUndefined();
    expect(normalizeEvent({ start: '2025-01-02T00:00:00Z', end: '2025-01-01T00:00:00Z' })).toBeNull();
    expect(normalizeEvent('x')).toBeNull();
  });
});

describe('PrefsStore', () => {
  it('persists and sanitises', () => {
    const storage = new MemoryStorage();
    const p = new PrefsStore(storage);
    p.set({ view: 'week', theme: 'dark', hiddenCategories: ['health'] });
    const q = new PrefsStore(storage);
    expect(q.get()).toMatchObject({ view: 'week', theme: 'dark', hiddenCategories: ['health'] });
    storage.setItem('calibridge:prefs', JSON.stringify({ view: 'bogus', hiddenCategories: ['nope'] }));
    expect(new PrefsStore(storage).get()).toMatchObject({ view: 'month', hiddenCategories: [] });
  });
});

describe('layoutColumns', () => {
  it('puts overlapping blocks side by side and reuses freed columns', () => {
    const l = layoutColumns([
      { key: 'a', start: 0, end: 60 },
      { key: 'b', start: 30, end: 90 },
      { key: 'c', start: 60, end: 120 }, // starts as a ends: can reuse column 0
      { key: 'd', start: 200, end: 230 }, // separate cluster
    ]);
    expect(l.get('a')).toMatchObject({ col: 0, cols: 2 });
    expect(l.get('b')).toMatchObject({ col: 1, cols: 2 });
    expect(l.get('c')).toMatchObject({ col: 0, cols: 2 });
    expect(l.get('d')).toMatchObject({ col: 0, cols: 1 });
  });

  it('does not treat touching blocks as overlapping', () => {
    const l = layoutColumns([
      { key: 'a', start: 0, end: 60 },
      { key: 'b', start: 60, end: 120 },
    ]);
    expect(l.get('a')?.cols).toBe(1);
    expect(l.get('b')?.cols).toBe(1);
  });
});

describe('matchEvents', () => {
  const list = [ev({ id: '1', title: 'Team lunch', location: 'Cafe', start: 'a', end: 'a' }), ev({ id: '2', title: 'Dentist', description: 'Bring forms', start: 'a', end: 'a' })];
  it('matches every token across fields, case-insensitively', () => {
    expect(matchEvents(list, 'LUNCH cafe').map((e) => e.id)).toEqual(['1']);
    expect(matchEvents(list, 'forms')).toHaveLength(1);
    expect(matchEvents(list, '   ')).toEqual([]);
  });
});

describe('dueReminders', () => {
  const e = ev({
    start: new Date(wallStringToInstant('2025-03-05T10:00', 'America/New_York')).toISOString(),
    end: new Date(wallStringToInstant('2025-03-05T11:00', 'America/New_York')).toISOString(),
    reminders: [0, 15, 1440],
  });
  const t = (s: string) => new Date(wallStringToInstant(s, 'America/New_York'));

  it('returns reminders whose fire time falls in the window', () => {
    const due = dueReminders([e], t('2025-03-05T09:40'), t('2025-03-05T09:50'));
    expect(due.map((d) => d.minutesBefore)).toEqual([15]);
    expect(dueReminders([e], t('2025-03-04T09:59'), t('2025-03-04T10:00')).map((d) => d.minutesBefore)).toEqual([1440]);
  });

  it('is exclusive at the start and inclusive at the end of the window, so nothing fires twice', () => {
    const at = t('2025-03-05T09:45');
    expect(dueReminders([e], new Date(at.getTime() - 1000), at)).toHaveLength(1);
    expect(dueReminders([e], at, new Date(at.getTime() + 1000))).toHaveLength(0);
  });

  it('fires "at start" and handles recurrences', () => {
    const r = { ...e, recurrence: { freq: 'daily' as const, interval: 1 } };
    const due = dueReminders([r], t('2025-03-09T09:59'), t('2025-03-09T10:00'));
    // today's "at start", plus tomorrow's "1 day before" which lands at the same moment
    expect(due.map((d) => [d.minutesBefore, d.start.getDate()])).toEqual([[0, 9], [1440, 10]]);
  });
});

describe('series actions', () => {
  const base = () => {
    const store = new EventStore(new MemoryStorage());
    const e = store.add({
      title: 'Standup', location: 'Zoom', description: '', category: 'work', allDay: false,
      start: '2025-03-03T14:00:00.000Z', end: '2025-03-03T14:30:00.000Z', tz: 'UTC', reminders: [10],
      recurrence: { freq: 'daily', interval: 1 },
    });
    return { store, e };
  };

  it('excludes one occurrence as a single undo step', () => {
    const { store, e } = base();
    excludeOccurrence(store, e.id, { start: new Date('2025-03-05T14:00:00.000Z'), end: new Date('2025-03-05T14:30:00.000Z'), allDay: false });
    expect(store.get(e.id)?.exdates).toEqual(['2025-03-05T14:00:00.000Z']);
    store.undo();
    expect(store.get(e.id)?.exdates).toBeUndefined();
  });

  it('detaches an occurrence into its own event, atomically', () => {
    const { store, e } = base();
    const occ = { start: new Date('2025-03-05T14:00:00.000Z'), end: new Date('2025-03-05T14:30:00.000Z'), allDay: false };
    const solo = detachOccurrence(store, e.id, occ, { title: 'Standup (moved)', start: '2025-03-05T16:00:00.000Z', end: '2025-03-05T16:30:00.000Z' });
    expect(store.list()).toHaveLength(2);
    expect(solo).toMatchObject({ title: 'Standup (moved)', location: 'Zoom', reminders: [10] });
    expect(solo?.recurrence).toBeUndefined();
    expect(solo?.uid).not.toBe(e.uid);
    expect(store.get(e.id)?.exdates).toEqual(['2025-03-05T14:00:00.000Z']);
    store.undo();
    expect(store.list()).toHaveLength(1);
    expect(store.get(e.id)?.exdates).toBeUndefined();
  });

  it('shifts spans by days and minutes, keeping length', () => {
    const occ = { start: new Date(2025, 2, 5, 9, 0), end: new Date(2025, 2, 5, 10, 30), allDay: false };
    const r = shiftedSpan(occ, 2, 60);
    expect(new Date(r.start).getTime()).toBe(new Date(2025, 2, 7, 10, 0).getTime());
    expect(new Date(r.end).getTime() - new Date(r.start).getTime()).toBe(90 * 60_000);
    const allDay = { start: new Date(2025, 2, 5), end: new Date(2025, 2, 7), allDay: true }; // 5th and 6th
    expect(shiftedSpan(allDay, 3)).toEqual({ start: '2025-03-08', end: '2025-03-09' });
  });
});

describe('retargetSeries', () => {
  it('retimes the whole series when one occurrence is retimed', () => {
    const series = ev({ start: '2025-03-03T14:00:00.000Z', end: '2025-03-03T15:00:00.000Z', tz: 'UTC' });
    // The 10 March occurrence is edited to start two hours later and run 90 minutes.
    const r = retargetSeries(series, new Date('2025-03-10T14:00:00.000Z'), {
      allDay: false, tz: 'UTC', start: '2025-03-10T16:00:00.000Z', end: '2025-03-10T17:30:00.000Z',
    });
    expect(r).toEqual({ start: '2025-03-03T16:00:00.000Z', end: '2025-03-03T17:30:00.000Z' });
  });

  it('moving an occurrence to another day moves the series start by the same days', () => {
    const series = ev({ start: '2025-03-03T14:00:00.000Z', end: '2025-03-03T15:00:00.000Z', tz: 'UTC' });
    const r = retargetSeries(series, new Date('2025-03-10T14:00:00.000Z'), {
      allDay: false, tz: 'UTC', start: '2025-03-11T14:00:00.000Z', end: '2025-03-11T15:00:00.000Z',
    });
    expect(r.start).toBe('2025-03-04T14:00:00.000Z');
  });

  it('handles all-day series', () => {
    const series = ev({ allDay: true, start: '2025-03-03', end: '2025-03-04' });
    const r = retargetSeries(series, new Date(2025, 2, 10), { allDay: true, tz: 'UTC', start: '2025-03-12', end: '2025-03-14' });
    expect(r).toEqual({ start: '2025-03-05', end: '2025-03-07' });
  });

  it('keeps the wall-clock time across a DST change between the series start and the edited occurrence', () => {
    const NY = 'America/New_York';
    const series = ev({ tz: NY, start: new Date(wallStringToInstant('2025-03-03T09:00', NY)).toISOString(), end: new Date(wallStringToInstant('2025-03-03T10:00', NY)).toISOString() });
    // Occurrence on 17 March (after spring-forward) is moved to 11:00.
    const occ = new Date(wallStringToInstant('2025-03-17T09:00', NY));
    const r = retargetSeries(series, occ, {
      allDay: false, tz: NY,
      start: new Date(wallStringToInstant('2025-03-17T11:00', NY)).toISOString(),
      end: new Date(wallStringToInstant('2025-03-17T12:00', NY)).toISOString(),
    });
    expect(r.start).toBe(new Date(wallStringToInstant('2025-03-03T11:00', NY)).toISOString());
  });
});

describe('legacy host detection', () => {
  it('recognises the old address only', () => {
    expect(isLegacyHost('events.lakshp.live')).toBe(true);
    expect(isLegacyHost(NEW_HOST)).toBe(false);
    expect(isLegacyHost('localhost')).toBe(false);
  });
});
