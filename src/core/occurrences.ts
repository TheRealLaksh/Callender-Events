import { addDays, dateKey, daysInMonth, parseDateKey, startOfDay } from './dates';
import type { CalEvent, Occurrence, Recurrence } from './types';
import { isValidTimeZone, localTimeZone, wallAt, wallToInstant, type Wall } from './tz';

const DAY_MS = 86_400_000;
const MAX_ITERATIONS = 20_000;

interface Span {
  startMs: number;
  endMs: number;
}

/** First instance of an event as real instants. All-day events use the viewer's local midnight. */
export function eventSpan(ev: CalEvent): Span | null {
  if (ev.allDay) {
    const s = parseDateKey(ev.start);
    const e = parseDateKey(ev.end);
    if (!s || !e || e < s) return null;
    return { startMs: s.getTime(), endMs: addDays(e, 1).getTime() };
  }
  const startMs = Date.parse(ev.start);
  const endMs = Date.parse(ev.end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  return { startMs, endMs };
}

/** Day-of-month / month arithmetic on a plain y-m-d triple. Returns null for dates that do not exist. */
function nthDate(
  rec: Recurrence,
  n: number,
  base: { y: number; m: number; d: number },
): { y: number; m: number; d: number } | null {
  const step = n * rec.interval;
  switch (rec.freq) {
    case 'daily':
    case 'weekly': {
      const t = new Date(Date.UTC(base.y, base.m - 1, base.d + step * (rec.freq === 'weekly' ? 7 : 1)));
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }
    case 'monthly': {
      const total = base.m - 1 + step;
      const y = base.y + Math.floor(total / 12);
      const m0 = ((total % 12) + 12) % 12;
      if (base.d > daysInMonth(y, m0)) return null; // RFC 5545: skip months without that day
      return { y, m: m0 + 1, d: base.d };
    }
    case 'yearly': {
      const y = base.y + step;
      if (base.m === 2 && base.d === 29 && daysInMonth(y, 1) < 29) return null;
      return { y, m: base.m, d: base.d };
    }
  }
}

const keyOf = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function make(ev: CalEvent, startMs: number, endMs: number, recurring: boolean): Occurrence {
  return {
    event: ev,
    start: new Date(startMs),
    end: new Date(endMs),
    allDay: ev.allDay,
    key: `${ev.id}:${startMs}`,
    recurring,
  };
}

function expandOne(ev: CalEvent, fromMs: number, toMs: number): Occurrence[] {
  const span = eventSpan(ev);
  if (!span) return [];
  const { startMs, endMs } = span;
  const dur = endMs - startMs;
  const overlaps = (s: number, e: number) => s < toMs && Math.max(e, s + 1) > fromMs;

  const rec = ev.recurrence;
  if (!rec || rec.interval < 1) return overlaps(startMs, endMs) ? [make(ev, startMs, endMs, false)] : [];

  const tz = isValidTimeZone(ev.tz) ? ev.tz : localTimeZone();
  const w0: Wall = ev.allDay
    ? (() => {
        const d = new Date(startMs);
        return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: 0, mi: 0 };
      })()
    : wallAt(startMs, tz);
  const base = { y: w0.y, m: w0.m, d: w0.d };

  // Daily/weekly never skip, so we can jump straight to the window.
  let k = 0;
  if (rec.freq === 'daily' || rec.freq === 'weekly') {
    const stepMs = DAY_MS * rec.interval * (rec.freq === 'weekly' ? 7 : 1);
    k = Math.max(0, Math.floor((fromMs - dur - startMs) / stepMs) - 1);
  }

  const out: Occurrence[] = [];
  let emitted = k;
  for (let guard = 0; guard < MAX_ITERATIONS; guard++, k++) {
    if (!(rec.until) && rec.count !== undefined && emitted >= rec.count) break;
    const date = nthDate(rec, k, base);
    if (!date) continue;
    if (rec.until && keyOf(date.y, date.m, date.d) > rec.until) break;
    emitted++;

    const s = ev.allDay
      ? new Date(date.y, date.m - 1, date.d).getTime()
      : wallToInstant({ ...date, h: w0.h, mi: w0.mi, s: w0.s }, tz);
    const e = ev.allDay ? addDays(new Date(s), Math.round(dur / DAY_MS)).getTime() : s + dur;

    if (s >= toMs) break;
    if (overlaps(s, e)) out.push(make(ev, s, e, true));
  }
  return out;
}

/** All occurrences overlapping `[from, to)`, sorted by start. */
export function expandEvents(events: readonly CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) out.push(...expandOne(ev, from.getTime(), to.getTime()));
  return out.sort(compareOccurrences);
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start.getTime() - b.start.getTime() || a.event.title.localeCompare(b.event.title);
}

/** Occurrences touching the local calendar day of `day`. */
export function occurrencesOnDay(occs: readonly Occurrence[], day: Date): Occurrence[] {
  const s = startOfDay(day).getTime();
  const e = addDays(startOfDay(day), 1).getTime();
  return occs.filter((o) => o.start.getTime() < e && Math.max(o.end.getTime(), o.start.getTime() + 1) > s);
}

/** The first occurrence starting at or after `from`, searching up to `horizonDays` ahead. */
export function nextOccurrence(ev: CalEvent, from: Date, horizonDays = 366 * 3): Occurrence | null {
  const occs = expandOne(ev, from.getTime(), addDays(from, horizonDays).getTime());
  return occs.find((o) => o.end.getTime() >= from.getTime()) ?? null;
}

export { dateKey };
