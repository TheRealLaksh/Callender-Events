import { expect, type Page } from '@playwright/test';

/** "Today" for every test: Wednesday 12 March 2025, 10:30 in New York. */
export const NOW = new Date('2025-03-12T10:30:00-04:00');

export interface SeedEvent {
  title: string;
  /** Wall-clock `YYYY-MM-DDTHH:mm` in America/New_York, or `YYYY-MM-DD` for all-day. */
  start: string;
  end?: string;
  category?: 'work' | 'personal' | 'health' | 'important';
  location?: string;
  reminders?: number[];
  tz?: string;
  recurrence?: Record<string, unknown>;
  exdates?: string[];
}

const toUtc = (wall: string): string => {
  // America/New_York is UTC-5 (EST) before the 9 March 2025 changeover and UTC-4 (EDT) after it.
  const [d, t = '00:00'] = wall.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const offset = Date.UTC(y, m - 1, day) < Date.UTC(2025, 2, 9) ? 5 : 4;
  return new Date(Date.UTC(y, m - 1, day, h + offset, mi)).toISOString();
};

export function seedEvents(events: SeedEvent[]) {
  return events.map((e, i) => {
    const allDay = !e.start.includes('T');
    return {
      id: `seed-${i}`,
      uid: `seed-${i}@test`,
      title: e.title,
      location: e.location ?? '',
      description: '',
      category: e.category ?? 'work',
      allDay,
      start: allDay ? e.start : toUtc(e.start),
      end: allDay ? (e.end ?? e.start) : toUtc(e.end ?? e.start),
      tz: e.tz ?? 'America/New_York',
      reminders: e.reminders ?? [],
      ...(e.recurrence ? { recurrence: e.recurrence } : {}),
      ...(e.exdates ? { exdates: e.exdates } : {}),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
  });
}

/** Opens the app with a fixed clock and (optionally) pre-existing data. Waits until the calendar has rendered. */
export async function openApp(page: Page, events: SeedEvent[] = [], opts: { path?: string; keepStorage?: boolean } = {}) {
  await page.clock.setFixedTime(NOW);
  if (!opts.keepStorage) {
    const data = JSON.stringify({ version: 2, events: seedEvents(events) });
    await page.addInitScript(
      ([payload]) => {
        // Seed only on the first load so reload tests see what the app itself saved.
        if (!sessionStorage.getItem('e2e-seeded')) {
          localStorage.setItem('calibridge:v2', payload);
          sessionStorage.setItem('e2e-seeded', '1');
        }
      },
      [data],
    );
  }
  await page.goto(opts.path ?? '/');
  await expect(page.locator('.month-grid, .week-col, .agenda')).not.toHaveCount(0);
}

export async function storedEvents(page: Page): Promise<Array<Record<string, any>>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('calibridge:v2') ?? '{"events":[]}').events);
}

export const dialog = (page: Page) => page.locator('dialog[open]');

/** Clicks the visible switch/label instead of the visually-hidden input, as a user would. */
export async function setAllDay(page: Page) {
  await dialog(page).locator('.switch').click();
}
