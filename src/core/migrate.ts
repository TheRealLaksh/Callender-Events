import { categoryFromText, DEFAULT_CATEGORY } from './categories';
import { triggerToMinutes } from './duration';
import type { CalEvent } from './types';
import { localTimeZone, parseWall, wallToInstant } from './tz';
import { newUid } from './util';

export const LEGACY_STORAGE_KEY = 'calibridge_events';

function legacyInstant(value: unknown, tz: string): number {
  if (typeof value !== 'string') return NaN;
  // The v1 app saved wall-clock strings in the browser's zone, but drag-and-drop wrote UTC ISO strings.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return Date.parse(value);
  const wall = parseWall(value);
  return wall ? wallToInstant(wall, tz) : NaN;
}

/** Converts data saved by Calibridge 1.x into the current model. Unusable rows are dropped. */
export function migrateLegacy(raw: unknown, now = new Date()): CalEvent[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : [];
  const tz = localTimeZone();
  const stamp = now.toISOString();
  const out: CalEvent[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const startMs = legacyInstant(r.datetimeStart, tz);
    let endMs = legacyInstant(r.datetimeEnd, tz);
    if (Number.isNaN(startMs)) continue;
    if (Number.isNaN(endMs) || endMs < startMs) endMs = startMs;

    const reminders = Array.isArray(r.reminders)
      ? [...new Set(r.reminders.map((x) => (typeof x === 'string' ? triggerToMinutes(x) : null)).filter((x): x is number => x !== null))]
      : [];

    out.push({
      id: `legacy-${String(r.id ?? out.length)}`,
      uid: newUid(),
      title: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : 'Untitled',
      location: typeof r.location === 'string' ? r.location : '',
      description: typeof r.description === 'string' ? r.description : '',
      category: categoryFromText(typeof r.category === 'string' ? r.category : undefined) ?? DEFAULT_CATEGORY,
      allDay: false,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      tz,
      reminders,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  return out;
}
