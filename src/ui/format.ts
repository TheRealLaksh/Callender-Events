import { addDays, isSameDay } from '../core/dates';
import { categoryLabel } from '../core/categories';
import type { Occurrence } from '../core/types';

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const dayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const hourOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

export const fmtTime = (d: Date): string => time.format(d);
export const fmtDayLong = (d: Date): string => dayLong.format(d);
export const fmtDayShort = (d: Date): string => dayShort.format(d);
export const fmtMonthYear = (d: Date): string => monthYear.format(d);
export const fmtHour = (h: number): string => hourOnly.format(new Date(2000, 0, 1, h));

export function fmtWeekRange(first: Date): string {
  const last = addDays(first, 6);
  if (first.getMonth() === last.getMonth()) return `${monthDay.format(first)} – ${last.getDate()}, ${last.getFullYear()}`;
  if (first.getFullYear() === last.getFullYear()) return `${monthDay.format(first)} – ${monthDay.format(last)}, ${last.getFullYear()}`;
  return `${monthDay.format(first)}, ${first.getFullYear()} – ${monthDay.format(last)}, ${last.getFullYear()}`;
}

/** Human description of when an occurrence happens, optionally relative to the day being shown. */
export function fmtWhen(o: Occurrence, forDay?: Date): string {
  // `end` is exclusive, so the last instant that still belongs to the occurrence is 1 ms earlier.
  const last = new Date(Math.max(o.start.getTime(), o.end.getTime() - 1));
  const singleDay = isSameDay(o.start, last);

  if (o.allDay) return singleDay ? 'All day' : `${monthDay.format(o.start)} – ${monthDay.format(last)}`;
  if (singleDay) {
    return o.end.getTime() > o.start.getTime() ? `${fmtTime(o.start)} – ${fmtTime(o.end)}` : fmtTime(o.start);
  }
  if (forDay) {
    if (isSameDay(forDay, o.start)) return `From ${fmtTime(o.start)}`;
    if (isSameDay(forDay, last)) return `Until ${fmtTime(o.end)}`;
    return 'All day';
  }
  return `${monthDay.format(o.start)}, ${fmtTime(o.start)} – ${monthDay.format(o.end)}, ${fmtTime(o.end)}`;
}

export function describeOccurrence(o: Occurrence): string {
  const parts = [o.event.title, fmtDayShort(o.start), fmtWhen(o), categoryLabel(o.event.category)];
  if (o.event.location) parts.push(o.event.location);
  return parts.join(', ');
}
