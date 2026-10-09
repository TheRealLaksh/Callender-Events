import { expect, test } from '@playwright/test';
import { dialog, openApp, storedEvents } from './helpers';

const weekly = { freq: 'weekly', interval: 1 };

test.describe('repeating events', () => {
  test('creates a weekly series with several weekdays and an end count', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create event' }).first().click();
    await page.fill('#ev-title', 'Gym');
    await page.selectOption('#ev-freq', 'weekly');
    // 12 March is a Wednesday (locked on); add Monday and Friday.
    const days = dialog(page).getByRole('group', { name: 'Repeat on' });
    await expect(days.getByRole('button', { name: 'Wed' })).toBeDisabled();
    await days.getByRole('button', { name: 'Mon' }).click();
    await days.getByRole('button', { name: 'Fri' }).click();
    await page.selectOption('#ev-ends', 'count');
    await page.fill('#ev-count', '5');
    await dialog(page).getByRole('button', { name: 'Create' }).click();

    const [e] = await storedEvents(page);
    expect(e.recurrence).toEqual({ freq: 'weekly', interval: 1, count: 5, weekdays: [1, 3, 5] });
    // Wed 12, Fri 14, Mon 17, Wed 19, Fri 21
    await expect(page.locator('.chip', { hasText: 'Gym' })).toHaveCount(5);
  });

  test('"This event only" moves one occurrence into its own event', async ({ page }) => {
    await openApp(page, [{ title: 'Standup', start: '2025-03-03T09:00', end: '2025-03-03T09:30', recurrence: weekly }]);
    const mondays = page.locator('.cell[data-date="2025-03-17"] .chip');
    await mondays.click();
    await expect(dialog(page).locator('.banner')).toContainText('Mar 17');
    await page.fill('#ev-start-time', '11:00');
    await page.dispatchEvent('#ev-start-time', 'change');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await dialog(page).getByRole('button', { name: 'This event only' }).click();

    const events = await storedEvents(page);
    expect(events).toHaveLength(2);
    const series = events.find((e) => e.recurrence)!;
    const solo = events.find((e) => !e.recurrence)!;
    expect(series.exdates).toEqual(['2025-03-17T13:00:00.000Z']);
    expect(solo.start).toBe('2025-03-17T15:00:00.000Z'); // 11:00 EDT
    // Other Mondays keep 9:00; the 17th now shows 11:00.
    await expect(page.locator('.cell[data-date="2025-03-24"] .chip-time')).toHaveText(/9:00a/);
    await expect(page.locator('.cell[data-date="2025-03-17"] .chip-time')).toHaveText(/11:00a/);
    await expect(page.locator('.cell[data-date="2025-03-17"] .chip')).toHaveCount(1);
  });

  test('"All events" retimes the whole series from a later occurrence', async ({ page }) => {
    await openApp(page, [{ title: 'Standup', start: '2025-03-03T09:00', end: '2025-03-03T09:30', recurrence: weekly }]);
    await page.locator('.cell[data-date="2025-03-17"] .chip').click();
    await page.fill('#ev-start-time', '10:00');
    await page.dispatchEvent('#ev-start-time', 'change');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await dialog(page).getByRole('button', { name: 'All events' }).click();
    const [e] = await storedEvents(page);
    // 3 March is still on standard time (UTC-5), so 10:00 local is 15:00Z. The series start moved by the
    // same amount as the occurrence (09:00 -> 10:00) even though the edit was made on 17 March (daylight time).
    expect(e.start).toBe('2025-03-03T15:00:00.000Z');
    expect(e.end).toBe('2025-03-03T15:30:00.000Z');
    await expect(page.locator('.cell[data-date="2025-03-24"] .chip-time')).toHaveText(/10:00a/);
  });

  test('deleting one occurrence keeps the rest; deleting all removes the series', async ({ page }) => {
    await openApp(page, [{ title: 'Standup', start: '2025-03-03T09:00', end: '2025-03-03T09:30', recurrence: weekly }]);
    await page.locator('.cell[data-date="2025-03-17"] .chip').click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: 'This event only' }).click();
    await expect(page.locator('.cell[data-date="2025-03-17"] .chip')).toHaveCount(0);
    await expect(page.locator('.cell[data-date="2025-03-24"] .chip')).toHaveCount(1);
    await page.locator('.toast-action', { hasText: 'Undo' }).last().click();
    await expect(page.locator('.cell[data-date="2025-03-17"] .chip')).toHaveCount(1);

    await page.locator('.cell[data-date="2025-03-17"] .chip').click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: 'All events' }).click();
    expect(await storedEvents(page)).toHaveLength(0);
  });

  test('dragging one occurrence moves only that occurrence', async ({ page }) => {
    await openApp(page, [{ title: 'Standup', start: '2025-03-03T09:00', end: '2025-03-03T09:30', recurrence: weekly }]);
    await page.locator('.cell[data-date="2025-03-17"] .chip').dragTo(page.locator('.cell[data-date="2025-03-19"]'));
    const events = await storedEvents(page);
    expect(events).toHaveLength(2);
    await expect(page.locator('.cell[data-date="2025-03-19"] .chip')).toHaveCount(1);
    await expect(page.locator('.cell[data-date="2025-03-17"] .chip')).toHaveCount(0);
    await expect(page.locator('.cell[data-date="2025-03-24"] .chip')).toHaveCount(1);
  });
});
