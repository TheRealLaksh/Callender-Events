/** Formats "minutes before start" as an iCalendar TRIGGER duration, e.g. `-PT15M`, `-P1D`, `PT0S`. */
export function minutesToTrigger(minutes: number): string {
  if (minutes <= 0) return 'PT0S';
  if (minutes % 10080 === 0) return `-P${minutes / 10080}W`;
  if (minutes % 1440 === 0) return `-P${minutes / 1440}D`;
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

/**
 * Parses an RFC 5545 duration into milliseconds (negative durations are negative).
 * Returns null when the text is not a duration.
 */
export function parseDurationMs(text: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(text.trim());
  if (!m || text.trim().replace(/^[+-]?P/i, '') === '') return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (+(w ?? 0) * 7 + +(d ?? 0)) * 86_400_000 + +(h ?? 0) * 3_600_000 + +(mi ?? 0) * 60_000 + +(s ?? 0) * 1000;
  return sign === '-' ? -ms : ms;
}

/** "Minutes before start" for a TRIGGER value, or null if it does not fire before/at the start. */
export function triggerToMinutes(text: string): number | null {
  const ms = parseDurationMs(text);
  if (ms === null || ms > 0) return null;
  return Math.round(Math.abs(ms) / 60_000);
}

export function reminderLabel(minutes: number): string {
  if (minutes <= 0) return 'At start';
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'} before`;
  if (minutes % 10080 === 0) return unit(minutes / 10080, 'week');
  if (minutes % 1440 === 0) return unit(minutes / 1440, 'day');
  if (minutes % 60 === 0) return unit(minutes / 60, 'hour');
  return unit(minutes, 'minute');
}
