import { dueReminders, type DueReminder } from '../core/reminders';
import type { EventStore } from '../state/store';

const TICK_MS = 15_000;
const MAX_CATCH_UP_MS = 30 * 60_000;
const LAST_CHECK_KEY = 'calibridge:last-reminder-check';

/**
 * Fires reminders while the app is open. On start it also catches up on anything that came due
 * (within 30 minutes) since the last time the app was running.
 */
export class ReminderService {
  private timer = 0;
  private lastCheck: number;
  private readonly fired = new Set<string>();

  constructor(
    private readonly store: EventStore,
    private readonly onDue: (reminder: DueReminder) => void,
    private readonly now: () => number = Date.now,
  ) {
    const saved = Number(safeGet(LAST_CHECK_KEY));
    const floor = this.now() - MAX_CATCH_UP_MS;
    this.lastCheck = Number.isFinite(saved) && saved > floor ? saved : floor;
  }

  start(): void {
    this.stop();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  stop(): void {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** Exposed for tests. */
  tick(): void {
    const now = this.now();
    for (const due of dueReminders(this.store.list(), new Date(this.lastCheck), new Date(now))) {
      if (this.fired.has(due.key)) continue;
      this.fired.add(due.key);
      this.onDue(due);
    }
    this.lastCheck = now;
    safeSet(LAST_CHECK_KEY, String(now));
  }

  private onVisible = (): void => {
    if (!document.hidden) this.tick();
  };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
