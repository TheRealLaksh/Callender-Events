import { expect, test } from '@playwright/test';
import { dialog, openApp, storedEvents, type SeedEvent } from './helpers';

const events: SeedEvent[] = [
  { title: 'Team standup', start: '2025-03-12T09:00', end: '2025-03-12T09:30', location: 'Zoom' },
  { title: 'Design review', start: '2025-03-12T11:00', end: '2025-03-12T12:30', category: 'important', location: 'Room 4' },
  { title: 'Overlaps review', start: '2025-03-12T11:30', end: '2025-03-12T13:00' },
  { title: 'Gym', start: '2025-03-13T07:00', end: '2025-03-13T08:00', category: 'health' },
  { title: 'Dinner with Sam', start: '2025-03-14T19:00', end: '2025-03-14T21:00', category: 'personal' },
  ...[0, 1, 2, 3, 4].map((i): SeedEvent => ({ title: `Busy ${i + 1}`, start: `2025-03-18T${String(8 + i).padStart(2, '0')}:00`, end: `2025-03-18T${String(9 + i).padStart(2, '0')}:00` })),
];

test.describe('month view', () => {
  test('highlights today, shows overflow, and lists the selected day', async ({ page }) => {
    await openApp(page, events);
    await expect(page.locator('.period')).toHaveText('March 2025');
    await expect(page.locator('.cell.today')).toHaveAttribute('data-date', '2025-03-12');
    await expect(page.locator('.cell.today .chip')).toHaveCount(3);
    await expect(page.locator('.cell[data-date="2025-03-18"] .more')).toBeVisible();
    await expect(page.locator('.sidebar .day-item')).toHaveCount(3);

    await page.locator('.cell[data-date="2025-03-13"] .cell-num').click();
    await expect(page.locator('.sidebar .day-item')).toHaveCount(1);
    await expect(page.locator('.sidebar .day-panel-title')).toHaveText('Thursday, March 13');
  });

  test('"+N more" opens the full list for that day', async ({ page }) => {
    await openApp(page, events);
    await page.locator('.cell[data-date="2025-03-18"] .more').click();
    await expect(dialog(page).locator('.day-item')).toHaveCount(5);
  });

  test('dragging an event to another day keeps its time', async ({ page }) => {
    await openApp(page, events);
    const before = (await storedEvents(page)).find((e) => e.title === 'Gym')!;
    await page.locator('.chip', { hasText: 'Gym' }).dragTo(page.locator('.cell[data-date="2025-03-20"]'));
    const after = (await storedEvents(page)).find((e) => e.title === 'Gym')!;
    expect(after.start).toBe(before.start.replace('2025-03-13', '2025-03-20'));
    await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
    expect((await storedEvents(page)).find((e) => e.title === 'Gym')!.start).toBe(before.start);
  });

  test('calendar filters hide and show categories', async ({ page }) => {
    await openApp(page, events);
    await page.locator('.filter.cat-health').click();
    await expect(page.locator('.chip', { hasText: 'Gym' })).toHaveCount(0);
    await page.locator('.filter.cat-health').click();
    await expect(page.locator('.chip', { hasText: 'Gym' })).toHaveCount(1);
  });

  test('keyboard: navigation, view switching and shortcut help (also right after clicking a filter)', async ({ page }) => {
    await openApp(page, events);
    await page.locator('.filter.cat-work').click(); // focus lands on a checkbox; shortcuts must still work
    await page.keyboard.press('j');
    await expect(page.locator('.period')).toHaveText('April 2025');
    await page.keyboard.press('t');
    await expect(page.locator('.period')).toHaveText('March 2025');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.cell.selected')).toHaveAttribute('data-date', '2025-03-13');
    await page.keyboard.press('?');
    await expect(dialog(page).locator('.shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('w');
    await expect(page.locator('.week-col')).toHaveCount(7);
    await page.keyboard.press('a');
    await expect(page.locator('.agenda')).toBeVisible();
  });
});

test.describe('week view', () => {
  test('lays out overlapping events side by side and shows the current time', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('w');
    await expect(page.locator('.period')).toHaveText('Mar 9 – 15, 2025');
    const widths = await page.locator('.block', { hasText: /Design review|Overlaps review/ }).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(widths).toHaveLength(2);
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2);
    await expect(page.locator('.now-line')).toBeVisible();
  });

  test('dragging a block changes day and time; a plain click opens the editor', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('w');
    const block = page.locator('.block', { hasText: 'Team standup' });
    const box = (await block.boundingBox())!;
    const before = (await storedEvents(page)).find((e) => e.title === 'Team standup')!.start;
    await page.mouse.move(box.x + 20, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + 20 + box.width + 4, box.y + 8 + 52, { steps: 8 });
    await page.mouse.up();
    const after = (await storedEvents(page)).find((e) => e.title === 'Team standup')!.start;
    expect(new Date(after).getTime() - new Date(before).getTime()).toBe(25 * 3600_000);
    await expect(dialog(page)).toHaveCount(0);

    await page.locator('.block', { hasText: 'Team standup' }).click();
    await expect(page.locator('#ev-title')).toHaveValue('Team standup');
  });

  test('clicking an empty slot starts an event at that time', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('w');
    // 52px per hour: y = 15:00 plus a few pixels, measured from the top of Thursday's column.
    await page.locator('.week-col').nth(4).click({ position: { x: 30, y: 15 * 52 + 6 } });
    await expect(page.locator('#ev-start-time')).toHaveValue('15:00');
    await expect(page.locator('#ev-start-date')).toHaveValue('2025-03-13');
  });
});

test.describe('agenda view and search', () => {
  test('agenda groups events by day', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('a');
    await expect(page.locator('.agenda-day')).toHaveCount(4);
    await expect(page.locator('.agenda-item')).toHaveCount(10);
  });

  test('search finds events by title and opens the match', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('/');
    await expect(page.locator('.search-input')).toBeFocused();
    await page.keyboard.type('dinner');
    await expect(page.locator('.search-hit')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#ev-title')).toHaveValue('Dinner with Sam');
  });

  test('search reports when nothing matches', async ({ page }) => {
    await openApp(page, events);
    await page.keyboard.press('/');
    await page.keyboard.type('zzzz');
    await expect(page.locator('.search-empty')).toBeVisible();
  });
});
