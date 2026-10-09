import { DEFAULT_CATEGORY, isCategoryId } from './categories';
import { parseDateKey } from './dates';
import { eventSpan } from './occurrences';
import type { CalEvent, Recurrence } from './types';
import { isValidTimeZone, localTimeZone } from './tz';
import { newId, newUid } from './util';

const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

function normalizeRecurrence(raw: unknown): Recurrence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.freq !== 'string' || !FREQS.includes(r.freq)) return undefined;
  const rec: Recurrence = {
    freq: r.freq as Recurrence['freq'],
    interval: Number.isInteger(r.interval) && (r.interval as number) >= 1 ? (r.interval as number) : 1,
  };
  if (typeof r.until === 'string' && parseDateKey(r.until)) rec.until = r.until;
  else if (Number.isInteger(r.count) && (r.count as number) >= 1) rec.count = r.count as number;
  if (rec.freq === 'weekly' && Array.isArray(r.weekdays)) {
    const days = [...new Set(r.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (days.length > 0) rec.weekdays = days;
  }
  return rec;
}

/** Validates data loaded from storage or import. Returns null for rows that cannot be repaired. */
export function normalizeEvent(raw: unknown): CalEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const now = new Date().toISOString();

  const ev: CalEvent = {
    id: str(r.id) || newId(),
    uid: str(r.uid) || newUid(),
    title: str(r.title).trim() || 'Untitled',
    location: str(r.location),
    description: str(r.description),
    category: isCategoryId(r.category) ? r.category : DEFAULT_CATEGORY,
    allDay: r.allDay === true,
    start: str(r.start),
    end: str(r.end),
    tz: isValidTimeZone(r.tz as string) ? (r.tz as string) : localTimeZone(),
    reminders: Array.isArray(r.reminders)
      ? [...new Set(r.reminders.filter((m): m is number => Number.isInteger(m) && m >= 0 && m <= 60 * 24 * 60))].sort((a, b) => a - b)
      : [],
    recurrence: normalizeRecurrence(r.recurrence),
    createdAt: str(r.createdAt) || now,
    updatedAt: str(r.updatedAt) || now,
  };
  if (!ev.recurrence) delete ev.recurrence;
  if (ev.recurrence && Array.isArray(r.exdates)) {
    const ex = [...new Set(r.exdates.filter((x): x is string => typeof x === 'string'))];
    if (ex.length > 0) ev.exdates = ex;
  }
  return eventSpan(ev) ? ev : null;
}
