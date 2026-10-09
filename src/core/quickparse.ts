import { addDays, startOfDay } from './dates';

export interface QuickAdd {
  title: string;
  /** Local calendar day. Falls back to `base` when the text names no date. */
  date: Date;
  /** Minutes after midnight, or null when no time was given (=> all-day). */
  minutes: number | null;
  durationMinutes: number | null;
  /** True if any date or time words were recognised. */
  recognised: boolean;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function cut(text: string, re: RegExp): { text: string; match: RegExpExecArray | null } {
  const match = re.exec(text);
  if (!match) return { text, match: null };
  return { text: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`, match };
}

/** A small, predictable natural-language parser: "Lunch with Sam tomorrow at 1pm for 90 min". */
export function parseQuickAdd(input: string, base: Date): QuickAdd {
  let text = ` ${input} `;
  let recognised = false;
  let date = startOfDay(base);
  let minutes: number | null = null;
  let durationMinutes: number | null = null;

  // Duration: "for 2h", "for 45 min", "for 1.5 hours"
  {
    const r = cut(text, /\sfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i);
    if (r.match) {
      const n = parseFloat(r.match[1]);
      durationMinutes = Math.round(/^h/i.test(r.match[2]) ? n * 60 : n);
      text = r.text;
      recognised = true;
    }
  }

  // Time
  {
    let r = cut(text, /\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$|[,.])/i);
    if (r.match) {
      let h = parseInt(r.match[1], 10) % 12;
      if (/^p/i.test(r.match[3])) h += 12;
      minutes = h * 60 + (r.match[2] ? parseInt(r.match[2], 10) : 0);
    } else {
      r = cut(text, /\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$|[,.])/i);
      if (r.match) minutes = parseInt(r.match[1], 10) * 60 + parseInt(r.match[2], 10);
      else {
        r = cut(text, /\sat\s+(\d{1,2})(?=\s|$|[,.])/i);
        if (r.match && parseInt(r.match[1], 10) <= 23) minutes = parseInt(r.match[1], 10) * 60;
        else {
          r = cut(text, /\s(?:at\s+)?(noon|midnight)\b/i);
          if (r.match) minutes = /noon/i.test(r.match[1]) ? 720 : 0;
        }
      }
    }
    if (minutes !== null && r.match) {
      text = r.text;
      recognised = true;
    }
  }

  // Date
  const dateRules: [RegExp, (m: RegExpExecArray) => Date | null][] = [
    [/\s(today|tonight)\b/i, () => startOfDay(base)],
    [/\s(tomorrow|tmrw|tmr)\b/i, () => addDays(startOfDay(base), 1)],
    [
      /\sin\s+(\d+)\s*(day|days|week|weeks)\b/i,
      (m) => addDays(startOfDay(base), parseInt(m[1], 10) * (/^w/i.test(m[2]) ? 7 : 1)),
    ],
    [
      /\s(\d{4})-(\d{2})-(\d{2})\b/,
      (m) => {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.getMonth() === +m[2] - 1 ? d : null;
      },
    ],
    [
      /\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
      (m) => monthDay(base, m[1], m[2]),
    ],
    [
      /\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
      (m) => monthDay(base, m[2], m[1]),
    ],
    [
      /\s(?:on\s+|next\s+|this\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i,
      (m) => {
        const target = WEEKDAYS.indexOf(m[1].toLowerCase());
        const today = startOfDay(base);
        let delta = (target - today.getDay() + 7) % 7;
        if (delta === 0 || /\snext\s/i.test(m[0])) delta = delta === 0 ? 7 : delta;
        return addDays(today, delta);
      },
    ],
  ];
  for (const [re, build] of dateRules) {
    const r = cut(text, re);
    if (!r.match) continue;
    const d = build(r.match);
    if (d) {
      date = d;
      text = r.text;
      recognised = true;
      break;
    }
  }

  const title = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(on|at|from|for|in)$/i, '')
    .replace(/^(on|at)\s+/i, '')
    .trim();

  return { title, date, minutes, durationMinutes, recognised };
}

function monthDay(base: Date, mon: string, day: string): Date | null {
  const month = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  const d = parseInt(day, 10);
  if (month < 0 || d < 1 || d > 31) return null;
  const today = startOfDay(base);
  let candidate = new Date(today.getFullYear(), month, d);
  if (candidate.getMonth() !== month) return null;
  if (candidate < today) candidate = new Date(today.getFullYear() + 1, month, d);
  return candidate.getMonth() === month ? candidate : null;
}
