import type { WeekStart } from './types';
import { pad2 } from './util';

const DAY_MS = 86_400_000;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Adds months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  const last = daysInMonth(out.getFullYear(), out.getMonth());
  out.setDate(Math.min(d.getDate(), last));
  return out;
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** `YYYY-MM-DD` in the viewer's local calendar. */
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** Whole calendar days from `a` to `b`, immune to DST. */
export function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function startOfWeek(d: Date, weekStart: WeekStart): Date {
  const offset = (d.getDay() - weekStart + 7) % 7;
  return addDays(startOfDay(d), -offset);
}

export function weekDays(anchor: Date, weekStart: WeekStart): Date[] {
  const first = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Always six weeks, so the grid height never jumps between months. */
export function monthGrid(anchor: Date, weekStart: WeekStart): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekdayLabels(weekStart: WeekStart, width: 'narrow' | 'short' = 'short'): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: width });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((weekStart + i) % 7))));
}

export function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
