import { pad2 } from './util';

/** A wall-clock reading. `m` is 1-12. */
export interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s?: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localTimeZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(tz) ? tz : 'UTC';
}

/** The wall-clock time shown in `tz` at the given instant. */
export function wallAt(ms: number, tz: string): Wall {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out.year,
    m: out.month,
    d: out.day,
    h: out.hour === 24 ? 0 : out.hour,
    mi: out.minute,
    s: out.second,
  };
}

/** Offset of `tz` from UTC at the instant, in milliseconds (east is positive). */
export function offsetAt(ms: number, tz: string): number {
  const w = wallAt(ms, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s ?? 0) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which `tz` shows the given wall-clock time. Times skipped by a DST jump
 * resolve forward; repeated times resolve to the first occurrence.
 */
export function wallToInstant(w: Wall, tz: string): number {
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s ?? 0);
  const off1 = offsetAt(asUtc, tz);
  const guess1 = asUtc - off1;
  const off2 = offsetAt(guess1, tz);
  if (off1 === off2) return guess1;
  const guess2 = asUtc - off2;
  if (offsetAt(guess2, tz) === off2) return guess2;
  // Neither offset reproduces the wall time: it falls in a DST gap. Resolve forward.
  return Math.max(guess1, guess2);
}

export function formatWall(w: Wall): string {
  return `${w.y}-${pad2(w.m)}-${pad2(w.d)}T${pad2(w.h)}:${pad2(w.mi)}`;
}

export function parseWall(text: string): Wall | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

/** `YYYY-MM-DDTHH:mm` as seen in `tz` at the given instant. */
export function instantToWallString(ms: number, tz: string): string {
  return formatWall(wallAt(ms, tz));
}

/** Inverse of {@link instantToWallString}. Returns NaN for malformed input. */
export function wallStringToInstant(text: string, tz: string): number {
  const w = parseWall(text);
  return w ? wallToInstant(w, tz) : NaN;
}

let zoneListCache: string[] | undefined;

/** All IANA zones the runtime knows, with the user's own zone first. */
export function listTimeZones(): string[] {
  if (!zoneListCache) {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    let zones: string[] = [];
    try {
      zones = intl.supportedValuesOf?.('timeZone') ?? [];
    } catch {
      zones = [];
    }
    if (!zones.includes('UTC')) zones = ['UTC', ...zones];
    zoneListCache = zones;
  }
  const local = localTimeZone();
  return [local, ...zoneListCache.filter((z) => z !== local)];
}
