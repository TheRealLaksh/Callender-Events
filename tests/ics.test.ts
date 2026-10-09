import { describe, expect, it } from 'vitest';
import { escapeText, foldLine, parseIcs, serializeIcs, unescapeText, unfold } from '../src/core/ics';
import { wallStringToInstant } from '../src/core/tz';
import { minutesToTrigger, parseDurationMs, reminderLabel, triggerToMinutes } from '../src/core/duration';
import { ev } from './helpers';

const iso = (wall: string, tz = 'America/New_York') => new Date(wallStringToInstant(wall, tz)).toISOString();

describe('durations', () => {
  it('formats and parses triggers symmetrically', () => {
    for (const m of [0, 5, 15, 90, 120, 1440, 2880, 10080]) {
      expect(triggerToMinutes(minutesToTrigger(m))).toBe(m);
    }
  });

  it('parses RFC 5545 forms', () => {
    expect(parseDurationMs('PT1H30M')).toBe(5_400_000);
    expect(parseDurationMs('-P1W')).toBe(-7 * 86_400_000);
    expect(parseDurationMs('P1DT2H')).toBe(93_600_000);
    expect(parseDurationMs('P')).toBeNull();
    expect(parseDurationMs('soon')).toBeNull();
  });

  it('ignores triggers that fire after the start', () => {
    expect(triggerToMinutes('PT15M')).toBeNull();
  });

  it('labels reminders', () => {
    expect(reminderLabel(0)).toBe('At start');
    expect(reminderLabel(1)).toBe('1 minute before');
    expect(reminderLabel(120)).toBe('2 hours before');
    expect(reminderLabel(1440)).toBe('1 day before');
    expect(reminderLabel(20160)).toBe('2 weeks before');
  });
});

describe('text handling', () => {
  it('escapes and unescapes symmetrically', () => {
    const s = 'Lunch, with; Sam\\Co\nSecond line';
    expect(unescapeText(escapeText(s))).toBe(s);
  });

  it('does not double-unescape', () => {
    expect(unescapeText('a\\\\nb')).toBe('a\\nb'); // backslash + n, not a newline
  });

  it('folds long lines at 75 octets without breaking UTF-8', () => {
    const line = 'SUMMARY:' + '日本語'.repeat(40);
    const folded = foldLine(line);
    const physical = folded.split('\r\n');
    expect(physical.length).toBeGreaterThan(1);
    for (const p of physical) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)[0]).toBe(line);
  });
});

describe('serializeIcs', () => {
  const timed = ev({
    id: 'a',
    uid: 'a@test',
    title: 'Planning, Q3',
    location: 'Room 4; HQ',
    description: 'Line one\nLine two',
    start: iso('2025-03-05T10:00'),
    end: iso('2025-03-05T11:30'),
    reminders: [15, 1440],
    category: 'important',
  });

  it('produces a CRLF calendar with required properties', () => {
    const out = serializeIcs([timed]);
    expect(out.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(out).toContain('UID:a@test');
    expect(out).toContain('DTSTART:20250305T150000Z');
    expect(out).toContain('SUMMARY:Planning\\, Q3');
    expect(out).toContain('TRIGGER:-PT15M');
    expect(out).toContain('TRIGGER:-P1D');
    expect(out).not.toMatch(/[^\r]\n/); // no bare LF
  });

  it('writes all-day events with an exclusive end', () => {
    const out = serializeIcs([ev({ allDay: true, start: '2025-03-05', end: '2025-03-06' })]);
    expect(out).toContain('DTSTART;VALUE=DATE:20250305');
    expect(out).toContain('DTEND;VALUE=DATE:20250307');
  });

  it('keeps the zone for recurring events', () => {
    const out = serializeIcs([
      ev({ start: iso('2025-03-05T10:00'), end: iso('2025-03-05T11:00'), recurrence: { freq: 'weekly', interval: 2, count: 5 } }),
    ]);
    expect(out).toContain('DTSTART;TZID=America/New_York:20250305T100000');
    expect(out).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5');
  });
});

describe('parseIcs', () => {
  it('round-trips events through export and import', () => {
    const originals = [
      ev({
        id: 'a',
        uid: 'a@test',
        title: 'Planning, Q3',
        location: 'Room 4; HQ',
        description: 'Line one\nLine two',
        start: iso('2025-03-05T10:00'),
        end: iso('2025-03-05T11:30'),
        reminders: [15, 1440],
        category: 'important',
      }),
      ev({ id: 'b', uid: 'b@test', allDay: true, start: '2025-12-24', end: '2025-12-26', category: 'personal' }),
      ev({
        id: 'c',
        uid: 'c@test',
        title: '日本語のイベント '.repeat(8).trim(),
        start: iso('2025-06-02T09:00', 'Asia/Tokyo'),
        end: iso('2025-06-02T09:45', 'Asia/Tokyo'),
        tz: 'Asia/Tokyo',
        recurrence: { freq: 'weekly', interval: 2, until: '2025-12-31' },
      }),
    ];
    const parsed = parseIcs(serializeIcs(originals));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.events).toHaveLength(3);
    for (const [i, o] of originals.entries()) {
      const p = parsed.events[i];
      expect(p).toMatchObject({
        uid: o.uid,
        title: o.title,
        location: o.location,
        description: o.description,
        allDay: o.allDay,
        start: o.start,
        end: o.end,
        category: o.category,
        reminders: o.reminders,
      });
      expect(p.recurrence).toEqual(o.recurrence);
    }
    expect(parsed.events[2].tz).toBe('Asia/Tokyo');
  });

  it('reads a typical Google Calendar export', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Kolkata:20250310T140000',
      'DTEND;TZID=Asia/Kolkata:20250310T150000',
      'UID:abc123@google.com',
      'SUMMARY:Standup',
      'DESCRIPTION:Daily sync\\nBring notes',
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const [e] = parseIcs(text).events;
    expect(e.title).toBe('Standup');
    expect(e.description).toBe('Daily sync\nBring notes');
    expect(e.start).toBe('2025-03-10T08:30:00.000Z');
    expect(e.tz).toBe('Asia/Kolkata');
    expect(e.reminders).toEqual([10]);
  });

  it('handles folded lines, DURATION and missing DTEND', () => {
    const text = [
      'BEGIN:VEVENT',
      'UID:x',
      'SUMMARY:A very long',
      '  title that was folded',
      'DTSTART:20250310T140000Z',
      'DURATION:PT2H',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:y',
      'SUMMARY:No end',
      'DTSTART:20250310T140000Z',
      'END:VEVENT',
    ].join('\n');
    const { events } = parseIcs(text);
    expect(events[0].title).toBe('A very long title that was folded');
    expect(events[0].end).toBe('2025-03-10T16:00:00.000Z');
    expect(events[1].end).toBe('2025-03-10T15:00:00.000Z');
  });

  it('treats floating times as local and falls back for unknown zones', () => {
    const text = [
      'BEGIN:VEVENT',
      'UID:f',
      'DTSTART:20250310T090000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:g',
      'DTSTART;TZID=Not/AZone:20250310T090000',
      'END:VEVENT',
    ].join('\r\n');
    const r = parseIcs(text);
    expect(r.events[0].start).toBe(iso('2025-03-10T09:00')); // test TZ is America/New_York
    expect(r.warnings.join(' ')).toMatch(/unknown time zone/);
  });

  it('skips cancelled events and events without a start', () => {
    const text = [
      'BEGIN:VEVENT',
      'UID:1',
      'STATUS:CANCELLED',
      'DTSTART:20250310T090000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2',
      'SUMMARY:No start',
      'END:VEVENT',
    ].join('\r\n');
    const r = parseIcs(text);
    expect(r.events).toHaveLength(0);
    expect(r.skipped).toBe(2);
  });

  it('round-trips weekday lists and excluded occurrences', () => {
    const timed = ev({
      uid: 'w@test',
      start: iso('2025-03-03T09:00'),
      end: iso('2025-03-03T09:30'),
      recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5], count: 10 },
      exdates: [iso('2025-03-05T09:00'), iso('2025-03-10T09:00')],
    });
    const allDay = ev({
      uid: 'a@test',
      allDay: true,
      start: '2025-03-03',
      end: '2025-03-03',
      recurrence: { freq: 'daily', interval: 1 },
      exdates: ['2025-03-04', '2025-03-06'],
    });
    const text = serializeIcs([timed, allDay]);
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10');
    expect(text).toContain('EXDATE;TZID=America/New_York:20250305T090000,20250310T090000');
    expect(text).toContain('EXDATE;VALUE=DATE:20250304,20250306');
    const [t, a] = parseIcs(text).events;
    expect(t.recurrence).toEqual(timed.recurrence);
    expect(t.exdates).toEqual(timed.exdates);
    expect(a.exdates).toEqual(allDay.exdates);
  });

  it('reads EXDATE lines from other calendars (UTC, repeated lines)', () => {
    const text = [
      'BEGIN:VEVENT',
      'UID:x',
      'DTSTART:20250303T140000Z',
      'RRULE:FREQ=DAILY',
      'EXDATE:20250304T140000Z',
      'EXDATE:20250305T140000Z,20250306T140000Z',
      'END:VEVENT',
    ].join('\r\n');
    const [e] = parseIcs(text).events;
    expect(e.exdates).toEqual(['2025-03-04T14:00:00.000Z', '2025-03-05T14:00:00.000Z', '2025-03-06T14:00:00.000Z']);
  });

  it('warns when recurrence rules are simplified, but not for equivalent ones', () => {
    const rule = (r: string) =>
      parseIcs(['BEGIN:VEVENT', 'UID:r', 'DTSTART:20250310T090000Z', `RRULE:${r}`, 'END:VEVENT'].join('\r\n'));
    // 2025-03-10 is a Monday
    expect(rule('FREQ=WEEKLY;BYDAY=MO').warnings).toEqual([]);
    expect(rule('FREQ=WEEKLY;BYDAY=MO,WE').warnings).toEqual([]);
    expect(rule('FREQ=WEEKLY;BYDAY=MO,WE').events[0].recurrence?.weekdays).toEqual([1, 3]);
    expect(rule('FREQ=MONTHLY;BYDAY=2MO').warnings[0]).toMatch(/simplified/);
    expect(rule('FREQ=WEEKLY;BYDAY=2MO').warnings[0]).toMatch(/simplified/);
    expect(rule('FREQ=MONTHLY;BYMONTHDAY=10').warnings).toEqual([]);
    expect(rule('FREQ=HOURLY').events[0].recurrence).toBeUndefined();
    expect(rule('FREQ=DAILY;UNTIL=20250320T000000Z').events[0].recurrence?.until).toBe('2025-03-19');
  });

  it('does not throw on garbage', () => {
    expect(parseIcs('this is not a calendar').events).toEqual([]);
    expect(parseIcs('').events).toEqual([]);
  });
});
