import { categoryFromText, categoryLabel, DEFAULT_CATEGORY } from './categories';
import { addDays, dateKey, parseDateKey } from './dates';
import { minutesToTrigger, parseDurationMs, triggerToMinutes } from './duration';
import type { CalEvent, EventDraft, Recurrence } from './types';
import { isValidTimeZone, localTimeZone, wallAt, wallToInstant } from './tz';
import { eventSpan } from './occurrences';
import { newUid, pad2 } from './util';

const CRLF = '\r\n';
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Serialising
// ---------------------------------------------------------------------------

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export function unescapeText(text: string): string {
  return text.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Folds a content line to 75 octets without splitting a UTF-8 sequence (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = ch;
      bytes = b;
      limit = 74; // continuation lines start with one space
    } else {
      cur += ch;
      bytes += b;
    }
  }
  parts.push(cur);
  return parts.join(CRLF + ' ');
}

const utcStamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
const compactDate = (key: string): string => key.replace(/-/g, '');

function compactWall(ms: number, tz: string): string {
  const w = wallAt(ms, tz);
  return `${w.y}${pad2(w.m)}${pad2(w.d)}T${pad2(w.h)}${pad2(w.mi)}${pad2(w.s ?? 0)}`;
}

function rrule(ev: CalEvent, rec: Recurrence): string {
  const parts = [`FREQ=${rec.freq.toUpperCase()}`];
  if (rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (rec.freq === 'weekly' && rec.weekdays && rec.weekdays.length > 0) {
    parts.push(`BYDAY=${rec.weekdays.map((d) => BYDAY[d]).join(',')}`);
  }
  if (rec.until) {
    if (ev.allDay) {
      parts.push(`UNTIL=${compactDate(rec.until)}`);
    } else {
      const [y, m, d] = rec.until.split('-').map(Number);
      parts.push(`UNTIL=${utcStamp(wallToInstant({ y, m, d, h: 23, mi: 59, s: 59 }, ev.tz))}`);
    }
  } else if (rec.count !== undefined) {
    parts.push(`COUNT=${rec.count}`);
  }
  return parts.join(';');
}

export function serializeIcs(events: readonly CalEvent[], calendarName = 'Calibridge'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calibridge//Calendar 2.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const ev of events) {
    const span = eventSpan(ev);
    if (!span) continue;
    lines.push('BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${utcStamp(Date.parse(ev.updatedAt) || Date.now())}`);

    if (ev.allDay) {
      const endExclusive = dateKey(addDays(parseDateKey(ev.end) as Date, 1));
      lines.push(`DTSTART;VALUE=DATE:${compactDate(ev.start)}`, `DTEND;VALUE=DATE:${compactDate(endExclusive)}`);
    } else if (ev.recurrence) {
      // Recurring events keep their zone so the wall-clock time survives DST changes.
      lines.push(
        `DTSTART;TZID=${ev.tz}:${compactWall(span.startMs, ev.tz)}`,
        `DTEND;TZID=${ev.tz}:${compactWall(span.endMs, ev.tz)}`,
      );
    } else {
      lines.push(`DTSTART:${utcStamp(span.startMs)}`, `DTEND:${utcStamp(span.endMs)}`);
    }

    if (ev.recurrence) lines.push(`RRULE:${rrule(ev, ev.recurrence)}`);
    if (ev.recurrence && ev.exdates && ev.exdates.length > 0) {
      if (ev.allDay) lines.push(`EXDATE;VALUE=DATE:${ev.exdates.map(compactDate).join(',')}`);
      else lines.push(`EXDATE;TZID=${ev.tz}:${ev.exdates.map((x) => compactWall(Date.parse(x), ev.tz)).join(',')}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.title || 'Untitled')}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    lines.push(`CATEGORIES:${escapeText(categoryLabel(ev.category))}`);

    for (const minutes of ev.reminders) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(ev.title || 'Reminder')}`,
        `TRIGGER:${minutesToTrigger(minutes)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface ImportResult {
  events: (EventDraft & { uid: string })[];
  /** VEVENTs that were ignored (cancelled or without a usable start). */
  skipped: number;
  warnings: string[];
}

export function unfold(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((l) => l.length > 0);
}

function splitOutsideQuotes(text: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseProp(line: string): Prop | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const [name, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

type IcsDate = { kind: 'date'; key: string } | { kind: 'time'; ms: number; tz: string };

function parseIcsDate(prop: Prop, fallbackTz: string): IcsDate | null {
  const v = prop.value.trim();
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (d) {
    const key = `${d[1]}-${d[2]}-${d[3]}`;
    return parseDateKey(key) ? { kind: 'date', key } : null;
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!t) return null;
  const wall = { y: +t[1], m: +t[2], d: +t[3], h: +t[4], mi: +t[5], s: +(t[6] ?? 0) };
  if (t[7]) return { kind: 'time', ms: Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.mi, wall.s), tz: fallbackTz };
  const tzid = prop.params.TZID;
  const tz = isValidTimeZone(tzid) ? tzid : fallbackTz;
  return { kind: 'time', ms: wallToInstant(wall, tz), tz };
}

const FREQS: Record<string, Recurrence['freq']> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};

function parseRecurrence(
  value: string,
  start: { y: number; m: number; d: number; weekday: number },
  tz: string,
  allDay: boolean,
): { rec: Recurrence | undefined; simplified: boolean } {
  const parts: Record<string, string> = {};
  for (const kv of value.split(';')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = FREQS[(parts.FREQ ?? '').toUpperCase()];
  if (!freq) return { rec: undefined, simplified: true };

  const rec: Recurrence = { freq, interval: Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1) };
  if (parts.UNTIL) {
    const u = parseIcsDate({ name: 'UNTIL', params: {}, value: parts.UNTIL }, tz);
    if (u?.kind === 'date') rec.until = u.key;
    else if (u?.kind === 'time') {
      const w = wallAt(u.ms, allDay ? 'UTC' : tz);
      rec.until = `${w.y}-${pad2(w.m)}-${pad2(w.d)}`;
    }
  } else if (parts.COUNT) {
    const n = parseInt(parts.COUNT, 10);
    if (n > 0) rec.count = n;
  }

  let simplified = false;
  for (const key of Object.keys(parts)) {
    if (!key.startsWith('BY')) continue;
    const v = parts[key];
    if (key === 'BYDAY' && freq === 'weekly') {
      // Plain weekday lists ("MO,WE,FR") are supported; positional ones ("2MO") are not.
      const days = v.split(',').map((d) => BYDAY.indexOf(d.trim().toUpperCase()));
      if (days.length > 0 && days.every((d) => d >= 0)) {
        const unique = [...new Set(days)].sort((a, b) => a - b);
        if (!(unique.length === 1 && unique[0] === start.weekday)) rec.weekdays = unique;
        continue;
      }
    }
    const trivial =
      (key === 'BYMONTHDAY' && (freq === 'monthly' || freq === 'yearly') && +v === start.d) ||
      (key === 'BYMONTH' && freq === 'yearly' && +v === start.m);
    if (!trivial) simplified = true;
  }
  return { rec, simplified };
}

export function parseIcs(text: string): ImportResult {
  const localTz = localTimeZone();
  const result: ImportResult = { events: [], skipped: 0, warnings: [] };
  let simplifiedCount = 0;
  let unknownZones = 0;

  let inEvent = false;
  let alarmDepth = 0;
  let props: Prop[] = [];
  let reminders: number[] = [];

  const finish = () => {
    const get = (n: string) => props.find((p) => p.name === n);
    const startProp = get('DTSTART');
    const status = get('STATUS')?.value.trim().toUpperCase();
    const start = startProp ? parseIcsDate(startProp, localTz) : null;
    if (!startProp || !start || status === 'CANCELLED') {
      result.skipped++;
      return;
    }
    if (startProp.params.TZID && !isValidTimeZone(startProp.params.TZID)) unknownZones++;

    const endProp = get('DTEND');
    const end = endProp ? parseIcsDate(endProp, localTz) : null;
    const durProp = get('DURATION');
    const durMs = durProp ? parseDurationMs(durProp.value) : null;

    let draftStart: string;
    let draftEnd: string;
    let tz: string;
    let allDay = false;
    let startParts: { y: number; m: number; d: number; weekday: number };

    if (start.kind === 'date') {
      allDay = true;
      tz = localTz;
      draftStart = start.key;
      let endKey = start.key;
      if (end?.kind === 'date') {
        const last = addDays(parseDateKey(end.key) as Date, -1); // DTEND is exclusive
        endKey = last >= (parseDateKey(start.key) as Date) ? dateKey(last) : start.key;
      } else if (durMs && durMs > 0) {
        const last = addDays(parseDateKey(start.key) as Date, Math.max(0, Math.ceil(durMs / 86_400_000) - 1));
        endKey = dateKey(last);
      }
      draftEnd = endKey;
      const s = parseDateKey(start.key) as Date;
      startParts = { y: s.getFullYear(), m: s.getMonth() + 1, d: s.getDate(), weekday: s.getDay() };
    } else {
      tz = start.tz;
      let endMs = start.ms + 3_600_000; // events without an end default to one hour
      if (end?.kind === 'time') endMs = Math.max(end.ms, start.ms);
      else if (durMs !== null && durMs >= 0) endMs = start.ms + durMs;
      draftStart = new Date(start.ms).toISOString();
      draftEnd = new Date(endMs).toISOString();
      const w = wallAt(start.ms, tz);
      startParts = { y: w.y, m: w.m, d: w.d, weekday: new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay() };
    }

    let recurrence: Recurrence | undefined;
    const rruleProp = get('RRULE');
    if (rruleProp) {
      const parsed = parseRecurrence(rruleProp.value, startParts, tz, allDay);
      recurrence = parsed.rec;
      if (parsed.simplified) simplifiedCount++;
    }
    const exdates: string[] = [];
    if (recurrence) {
      for (const prop of props.filter((x) => x.name === 'EXDATE')) {
        for (const raw of prop.value.split(',')) {
          const d = parseIcsDate({ ...prop, value: raw.trim() }, tz);
          if (allDay && d?.kind === 'date') exdates.push(d.key);
          else if (!allDay && d?.kind === 'time') exdates.push(new Date(d.ms).toISOString());
        }
      }
    }

    const categories = get('CATEGORIES')?.value.split(',').map((c) => unescapeText(c));
    const category = categories?.map(categoryFromText).find(Boolean) ?? DEFAULT_CATEGORY;

    result.events.push({
      uid: get('UID')?.value.trim() || newUid(),
      title: unescapeText(get('SUMMARY')?.value ?? '').trim() || 'Untitled',
      location: unescapeText(get('LOCATION')?.value ?? ''),
      description: unescapeText(get('DESCRIPTION')?.value ?? ''),
      category,
      allDay,
      start: draftStart,
      end: draftEnd,
      tz,
      reminders: [...new Set(reminders)].sort((a, b) => a - b),
      ...(recurrence ? { recurrence } : {}),
      ...(exdates.length > 0 ? { exdates: [...new Set(exdates)] } : {}),
    });
  };

  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      alarmDepth = 0;
      props = [];
      reminders = [];
    } else if (upper === 'END:VEVENT') {
      if (inEvent) finish();
      inEvent = false;
    } else if (!inEvent) {
      continue;
    } else if (upper === 'BEGIN:VALARM') {
      alarmDepth++;
    } else if (upper === 'END:VALARM') {
      alarmDepth = Math.max(0, alarmDepth - 1);
    } else {
      const prop = parseProp(line);
      if (!prop) continue;
      if (alarmDepth > 0) {
        if (prop.name === 'TRIGGER' && prop.params.VALUE !== 'DATE-TIME' && prop.params.RELATED !== 'END') {
          const minutes = triggerToMinutes(prop.value);
          if (minutes !== null) reminders.push(minutes);
        }
      } else {
        props.push(prop);
      }
    }
  }

  if (simplifiedCount) {
    result.warnings.push(`${simplifiedCount} repeating event(s) use rules Calibridge cannot represent and were simplified.`);
  }
  if (unknownZones) {
    result.warnings.push(`${unknownZones} event(s) used an unknown time zone and were read as local time.`);
  }
  return result;
}
