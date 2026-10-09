import { describe, expect, it } from 'vitest';
import { dateKey } from '../src/core/dates';
import { parseQuickAdd } from '../src/core/quickparse';

// Wednesday 15 Jan 2025
const base = new Date(2025, 0, 15, 8, 0);
const parse = (s: string) => {
  const r = parseQuickAdd(s, base);
  return { ...r, date: dateKey(r.date) };
};

describe('parseQuickAdd', () => {
  it('leaves plain titles alone', () => {
    expect(parse('Buy milk')).toMatchObject({ title: 'Buy milk', date: '2025-01-15', minutes: null, recognised: false });
  });

  it('parses tomorrow with a 12-hour time', () => {
    expect(parse('Lunch with Sam tomorrow at 1pm')).toMatchObject({ title: 'Lunch with Sam', date: '2025-01-16', minutes: 13 * 60 });
  });

  it('parses minutes, 12am/12pm and bare 24-hour times', () => {
    expect(parse('Call 5:30pm').minutes).toBe(17 * 60 + 30);
    expect(parse('Reset 12am').minutes).toBe(0);
    expect(parse('Lunch 12pm').minutes).toBe(720);
    expect(parse('Train 17:45').minutes).toBe(17 * 60 + 45);
    expect(parse('Meet at 9').minutes).toBe(540);
    expect(parse('Standup at noon').minutes).toBe(720);
  });

  it('parses weekdays, preferring the next one', () => {
    expect(parse('Gym friday').date).toBe('2025-01-17');
    expect(parse('Review on Wednesday').date).toBe('2025-01-22'); // today is Wednesday => next week
    expect(parse('Dentist next mon').date).toBe('2025-01-20');
  });

  it('parses relative offsets and explicit dates', () => {
    expect(parse('Renew in 3 days').date).toBe('2025-01-18');
    expect(parse('Trip in 2 weeks').date).toBe('2025-01-29');
    expect(parse('Launch 2025-03-09').date).toBe('2025-03-09');
    expect(parse('Birthday mar 5').date).toBe('2025-03-05');
    expect(parse('Birthday 5th of March').date).toBe('2025-03-05');
    expect(parse('Anniversary jan 2').date).toBe('2026-01-02'); // already past => next year
  });

  it('parses durations', () => {
    expect(parse('Workshop tomorrow 10am for 2h')).toMatchObject({ durationMinutes: 120, minutes: 600, title: 'Workshop' });
    expect(parse('Chat for 45 min').durationMinutes).toBe(45);
    expect(parse('Block for 1.5 hours').durationMinutes).toBe(90);
  });

  it('does not swallow numbers that are not times', () => {
    expect(parse('Read chapter 3').minutes).toBeNull();
    expect(parse('Room 101 review').title).toBe('Room 101 review');
  });
});
