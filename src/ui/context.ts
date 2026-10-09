import type { Occurrence } from '../core/types';
import type { EventStore } from '../state/store';
import type { PrefsStore } from '../state/prefs';
import type { Nav } from './nav';

export interface NewEventInit {
  date?: Date;
  /** Minutes after midnight. Omit for an all-day event. */
  minutes?: number | null;
  durationMinutes?: number;
  title?: string;
}

/** What views and dialogs need from the app shell. */
export interface AppContext {
  store: EventStore;
  prefs: PrefsStore;
  nav: Nav;
  /** Occurrences in `[from, to)` after applying the calendar filters. */
  occurrences(from: Date, to: Date): Occurrence[];
  /** Open the editor. Pass the clicked occurrence so repeating events can be edited "this one only". */
  openEvent(id: string, occurrence?: Occurrence): void;
  newEvent(init?: NewEventInit): void;
  openDay(day: Date): void;
  /**
   * Shift an event by whole days (and optionally minutes), keeping its duration. For an occurrence of a
   * repeating event, only that occurrence moves.
   */
  moveEvent(id: string, deltaDays: number, deltaMinutes?: number, occurrence?: Occurrence): void;
}
