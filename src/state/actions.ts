import { addDays, dateKey } from '../core/dates';
import { exdateKey } from '../core/occurrences';
import type { CalEvent, Occurrence } from '../core/types';
import { newId, newUid } from '../core/util';
import type { EventStore } from './store';

type OccurrenceRef = Pick<Occurrence, 'start' | 'end' | 'allDay'>;

const withExclusion = (ev: CalEvent, occ: OccurrenceRef, now: string): CalEvent => ({
  ...ev,
  exdates: [...new Set([...(ev.exdates ?? []), exdateKey(occ)])],
  updatedAt: now,
});

/** Removes a single occurrence from a repeating series. */
export function excludeOccurrence(store: EventStore, id: string, occ: OccurrenceRef, label = 'Occurrence deleted'): void {
  const now = new Date().toISOString();
  store.transact(label, (events) => events.map((e) => (e.id === id ? withExclusion(e, occ, now) : e)));
}

/**
 * Turns one occurrence into its own standalone event (with `patch` applied) and removes it from
 * the series, in a single undo step. Returns the new event.
 */
export function detachOccurrence(
  store: EventStore,
  id: string,
  occ: OccurrenceRef,
  patch: Partial<CalEvent>,
  label = 'Occurrence updated',
): CalEvent | undefined {
  const series = store.get(id);
  if (!series) return undefined;
  const now = new Date().toISOString();
  const standalone: CalEvent = { ...series, ...patch, id: newId(), uid: newUid(), createdAt: now, updatedAt: now };
  delete standalone.recurrence;
  delete standalone.exdates;
  store.transact(label, (events) => [...events.map((e) => (e.id === id ? withExclusion(e, occ, now) : e)), standalone]);
  return standalone;
}

/** Start/end for an occurrence shifted by whole days and minutes, preserving its length. */
export function shiftedSpan(occ: OccurrenceRef, deltaDays: number, deltaMinutes = 0): { start: string; end: string } {
  if (occ.allDay) {
    const lastDay = addDays(occ.end, -1);
    return { start: dateKey(addDays(occ.start, deltaDays)), end: dateKey(addDays(lastDay, deltaDays)) };
  }
  const duration = occ.end.getTime() - occ.start.getTime();
  const start = new Date(occ.start);
  start.setDate(start.getDate() + deltaDays); // keeps local wall-clock time across DST changes
  const shifted = new Date(start.getTime() + deltaMinutes * 60_000);
  return { start: shifted.toISOString(), end: new Date(shifted.getTime() + duration).toISOString() };
}
