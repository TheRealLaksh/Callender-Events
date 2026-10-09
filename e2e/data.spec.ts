import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dialog, NOW, openApp, storedEvents, type SeedEvent } from './helpers';

const events: SeedEvent[] = [
  { title: 'Planning, Q3', start: '2025-03-12T10:00', end: '2025-03-12T11:00', category: 'important', reminders: [15, 1440], location: 'Room 4; HQ' },
  { title: 'Standup', start: '2025-03-03T09:00', end: '2025-03-03T09:30', recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3, 5] }, exdates: ['2025-03-05T14:00:00.000Z'] },
  { title: 'Holiday', start: '2025-03-20', end: '2025-03-21', category: 'personal' },
];

test.describe('data', () => {
  test('migrates data saved by Calibridge 1.x and keeps the old key as a backup', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(
          'calibridge_events',
          JSON.stringify({
            events: [
              { id: 1, name: 'Old event', datetimeStart: '2025-03-12T09:00', datetimeEnd: '2025-03-12T10:00', category: 'Health', timezone: 'Asia/Kolkata', reminders: ['-PT15M'], location: 'Zoom', description: '' },
              { id: 2, name: 'Dragged', datetimeStart: '2025-03-13T15:00:00.000Z', datetimeEnd: '2025-03-13T16:00:00.000Z', reminders: [] },
            ],
            trash: [],
            eventIdCounter: 3,
          }),
        );
      }
    });
    await page.goto('/');
    await expect(page.locator('.chip', { hasText: 'Old event' })).toBeVisible();
    const stored = await storedEvents(page);
    expect(stored).toHaveLength(2);
    expect(stored.find((e) => e.title === 'Old event')).toMatchObject({ category: 'health', reminders: [15], allDay: false });
    expect(await page.evaluate(() => localStorage.getItem('calibridge_events'))).not.toBeNull();
  });

  test('exports a valid .ics, and re-importing it restores everything without duplicates', async ({ page }, info) => {
    await openApp(page, events);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.sidebar-foot').getByRole('button', { name: 'Export' }).click()]);
    expect(download.suggestedFilename()).toBe('calibridge-2025-03-12.ics');
    const file = info.outputPath('export.ics');
    await download.saveAs(file);
    const ics = readFileSync(file, 'utf8');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(ics).toContain('EXDATE;TZID=America/New_York:');
    expect(ics).toContain('SUMMARY:Planning\\, Q3');
    expect(ics).toContain('TRIGGER:-P1D');

    // Wipe via settings (with confirmation), then import the file back.
    await page.getByRole('button', { name: 'Settings' }).click();
    await dialog(page).getByRole('button', { name: 'Delete all' }).click();
    await dialog(page).getByRole('button', { name: 'Delete all' }).click();
    expect(await storedEvents(page)).toHaveLength(0);

    const importFile = async () => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.sidebar-foot').getByRole('button', { name: 'Import' }).click()]);
      await chooser.setFiles(file);
    };
    await importFile();
    await expect.poll(async () => (await storedEvents(page)).length).toBe(3);
    const restored = (await storedEvents(page)).find((e) => e.title === 'Standup')!;
    expect(restored.recurrence).toEqual({ freq: 'weekly', interval: 1, weekdays: [1, 3, 5] });
    expect(restored.exdates).toEqual(['2025-03-05T14:00:00.000Z']);
    expect((await storedEvents(page)).find((e) => e.title === 'Planning, Q3')).toMatchObject({ reminders: [15, 1440], category: 'important', location: 'Room 4; HQ' });

    await importFile(); // same file again: updates, no duplicates
    await page.waitForTimeout(300);
    expect(await storedEvents(page)).toHaveLength(3);
  });

  test('reports an unreadable file instead of failing silently', async ({ page }) => {
    await openApp(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.sidebar-foot').getByRole('button', { name: 'Import' }).click()]);
    await chooser.setFiles({ name: 'junk.ics', mimeType: 'text/calendar', buffer: Buffer.from('not a calendar') });
    await expect(page.locator('.toast-error')).toBeVisible();
  });

  test('events, theme and view survive a reload', async ({ page }) => {
    await openApp(page, events);
    await page.getByRole('button', { name: /light theme/ }).click();
    await page.keyboard.press('w');
    await page.reload();
    await expect(page.locator('.week-col')).toHaveCount(7);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await storedEvents(page)).toHaveLength(3);
  });

  test('works offline once loaded', async ({ page, context }) => {
    await openApp(page, events);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForTimeout(1000); // let the precache finish
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.chip', { hasText: 'Planning, Q3' })).toBeVisible();
  });

  test('ships a strict content security policy', async ({ page }) => {
    await openApp(page);
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
  });
});
