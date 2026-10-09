import { expandEvents } from './occurrences';
import type { CalEvent } from './types';

export interface DueReminder {
  /** Stable key so the same reminder never fires twice. */
  key: string;
  eventId: string;
  title: string;
  location: string;
  start: Date;
  allDay: boolean;
  minutesBefore: number;
  fireAt: Date;
}


/** Reminders whose fire time lies in `(after, upTo]`. */
export function dueReminders(events: readonly CalEvent[], after: Date, upTo: Date): DueReminder[] {
  const withAlarms = events.filter((e) => e.reminders.length > 0);
  if (withAlarms.length === 0) return [];
  const maxLead = Math.max(...withAlarms.flatMap((e) => e.reminders)) * 60_000;
  const occs = expandEvents(withAlarms, after, new Date(upTo.getTime() + maxLead + 86_400_000));
  const due: DueReminder[] = [];
  for (const o of occs) {
    for (const minutes of o.event.reminders) {
      // All-day events remind relative to 09:00 so "1 day before" is not at midnight.
      const anchor = o.allDay ? o.start.getTime() + 9 * 3_600_000 : o.start.getTime();
      const fireAt = anchor - minutes * 60_000;
      if (fireAt > after.getTime() && fireAt <= upTo.getTime()) {
        due.push({
          key: `${o.key}:${minutes}`,
          eventId: o.event.id,
          title: o.event.title,
          location: o.event.location,
          start: o.start,
          allDay: o.allDay,
          minutesBefore: minutes,
          fireAt: new Date(fireAt),
        });
      }
    }
  }
  return due.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
