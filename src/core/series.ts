import { addDays, dateKey, diffDays, parseDateKey } from './dates';
import type { CalEvent, EventDraft } from './types';
import { instantToWallString, parseWall, wallStringToInstant } from './tz';

const wallToUtcMs = (wall: string): number => {
  const w = parseWall(wall);
  return w ? Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) : NaN;
};

const utcMsToWall = (ms: number): string => {
  const t = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};

/**
 * The user edited one occurrence of a repeating event and chose to apply the change to the whole
 * series. Shift the series' own start/end by the same amount the occurrence moved, keeping the
 * edited duration, so "change this Wednesday's meeting to 10:00" retimes every Wednesday.
 */
export function retargetSeries(
  series: CalEvent,
  occurrenceStart: Date,
  draft: Pick<EventDraft, 'allDay' | 'start' | 'end' | 'tz'>,
): { start: string; end: string } {
  if (draft.allDay) {
    const newStart = parseDateKey(draft.start);
    const newEnd = parseDateKey(draft.end);
    const baseStart = series.allDay ? parseDateKey(series.start) : null;
    if (!newStart || !newEnd) return { start: draft.start, end: draft.end };
    const delta = diffDays(
      new Date(occurrenceStart.getFullYear(), occurrenceStart.getMonth(), occurrenceStart.getDate()),
      newStart,
    );
    const length = diffDays(newStart, newEnd);
    const start = baseStart ? addDays(baseStart, delta) : newStart;
    return { start: dateKey(start), end: dateKey(addDays(start, length)) };
  }

  // Timed: do the arithmetic on wall-clock readings so a daylight-saving change in between does not shift the time.
  const occWall = wallToUtcMs(instantToWallString(occurrenceStart.getTime(), series.tz));
  const newStartWall = wallToUtcMs(instantToWallString(Date.parse(draft.start), draft.tz));
  const newEndWall = wallToUtcMs(instantToWallString(Date.parse(draft.end), draft.tz));
  const baseWall = series.allDay
    ? NaN
    : wallToUtcMs(instantToWallString(Date.parse(series.start), series.tz));
  const startWall = Number.isNaN(baseWall) ? newStartWall : baseWall + (newStartWall - occWall);
  const endWall = startWall + (newEndWall - newStartWall);
  return {
    start: new Date(wallStringToInstant(utcMsToWall(startWall), draft.tz)).toISOString(),
    end: new Date(wallStringToInstant(utcMsToWall(endWall), draft.tz)).toISOString(),
  };
}
