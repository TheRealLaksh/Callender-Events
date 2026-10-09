export type CategoryId = 'work' | 'personal' | 'health' | 'important';

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Repeat every N units (>= 1). */
  interval: number;
  /** Last day (inclusive) on which an occurrence may start, `YYYY-MM-DD` in the event's time zone. */
  until?: string;
  /** Total number of occurrences. Ignored when `until` is set. */
  count?: number;
  /** Weekly only: weekdays to repeat on (0 = Sunday ... 6 = Saturday). Defaults to the start's weekday. */
  weekdays?: number[];
}

/**
 * A calendar event as stored on disk.
 *
 * Timed events store `start`/`end` as UTC ISO instants and keep `tz` as the zone the
 * event was authored in (used for the edit form, recurrence maths and `.ics` export).
 * All-day events store plain `YYYY-MM-DD` dates; `end` is inclusive.
 */
export interface CalEvent {
  id: string;
  /** Stable iCalendar UID, used to de-duplicate re-imports. */
  uid: string;
  title: string;
  location: string;
  description: string;
  category: CategoryId;
  allDay: boolean;
  start: string;
  end: string;
  tz: string;
  /** Minutes before the start at which to remind. `0` means "at start". */
  reminders: number[];
  recurrence?: Recurrence;
  /**
   * Occurrences removed from a repeating series. Timed events store the occurrence's start as a UTC
   * ISO string; all-day events store its `YYYY-MM-DD` date.
   */
  exdates?: string[];
  createdAt: string;
  updatedAt: string;
}

export type EventDraft = Omit<CalEvent, 'id' | 'uid' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<CalEvent, 'id' | 'uid'>>;

/** One concrete instance of an event, with real `Date`s for rendering. `end` is exclusive. */
export interface Occurrence {
  event: CalEvent;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Unique per event + occurrence start. */
  key: string;
  recurring: boolean;
}

export type ViewMode = 'month' | 'week' | 'agenda';
export type ThemeMode = 'system' | 'light' | 'dark';
export type WeekStart = 0 | 1 | 6;
