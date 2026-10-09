import { addDays, addMonths, startOfDay, startOfWeek } from '../core/dates';
import type { ViewMode } from '../core/types';
import type { PrefsStore } from '../state/prefs';

type Listener = () => void;

/** What the user is looking at: the view, the visible period (`anchor`) and the highlighted day. */
export class Nav {
  anchor = startOfDay(new Date());
  selected = startOfDay(new Date());
  private listeners = new Set<Listener>();

  constructor(private readonly prefs: PrefsStore) {}

  get view(): ViewMode {
    return this.prefs.get().view;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setView(view: ViewMode): void {
    if (view === this.view) return;
    // Anchor on the selected day so switching views keeps you where you were.
    this.anchor = this.selected;
    this.prefs.set({ view });
    this.emit();
  }

  today(): void {
    this.anchor = this.selected = startOfDay(new Date());
    this.emit();
  }

  /** Move the visible period forward (1) or back (-1). */
  step(dir: 1 | -1): void {
    this.anchor = this.view === 'week' ? addDays(this.anchor, 7 * dir) : addMonths(this.anchor, dir);
    this.emit();
  }

  select(day: Date): void {
    this.selected = startOfDay(day);
    this.emit();
  }

  /** Select a day and make sure it is on screen. */
  goTo(day: Date): void {
    this.selected = startOfDay(day);
    this.anchor = this.selected;
    this.emit();
  }

  /** Move the selected day by `days`, scrolling the visible period if it falls outside. */
  moveSelection(days: number): void {
    this.selected = addDays(this.selected, days);
    const a = this.anchor;
    const s = this.selected;
    const visible =
      this.view === 'week'
        ? startOfWeek(s, this.prefs.get().weekStart).getTime() === startOfWeek(a, this.prefs.get().weekStart).getTime()
        : s.getFullYear() === a.getFullYear() && s.getMonth() === a.getMonth();
    if (!visible) this.anchor = s;
    this.emit();
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
