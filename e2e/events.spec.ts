import { expect, test } from '@playwright/test';
import { dialog, openApp, setAllDay, storedEvents } from './helpers';

test.describe('creating and editing events', () => {
  test('validates, creates and persists an event with all its fields', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create event' }).first().click();
    await expect(page.locator('#ev-title')).toBeFocused();

    await dialog(page).getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('.form-error')).toContainText('title');

    await page.fill('#ev-title', 'Quarterly planning');
    await page.fill('#ev-start-time', '14:00');
    await page.dispatchEvent('#ev-start-time', 'change');
    await expect(page.locator('#ev-end-time')).toHaveValue('15:00'); // duration is kept when the start moves

    await page.fill('#ev-end-time', '13:00');
    await page.dispatchEvent('#ev-end-time', 'change');
    await dialog(page).getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('.form-error')).toContainText('cannot end before');

    await page.fill('#ev-end-time', '16:00');
    await page.dispatchEvent('#ev-end-time', 'change');
    await page.locator('.cat-option.cat-important').click();
    await dialog(page).getByRole('button', { name: '30 min', exact: false }).first().click();
    await page.fill('input[aria-label="Custom reminder amount"]', '3');
    await page.selectOption('select[aria-label="Custom reminder unit"]', '1440');
    await dialog(page).getByRole('button', { name: 'Add', exact: true }).click();
    await page.fill('#ev-location', 'Boardroom');
    await dialog(page).getByRole('button', { name: 'Create' }).click();
    await expect(dialog(page)).toHaveCount(0);

    const [saved] = await storedEvents(page);
    expect(saved).toMatchObject({ title: 'Quarterly planning', category: 'important', location: 'Boardroom', allDay: false });
    expect(saved.start).toBe('2025-03-12T18:00:00.000Z'); // 14:00 EDT
    expect(saved.reminders).toEqual([30, 4320]);
    await expect(page.locator('.toast', { hasText: 'Event created' })).toBeVisible();
  });

  test('edits, deletes and undoes via toast and keyboard', async ({ page }) => {
    await openApp(page, [{ title: 'Lunch', start: '2025-03-12T12:00', end: '2025-03-12T13:00' }]);
    await page.locator('.chip', { hasText: 'Lunch' }).click();
    await expect(page.locator('#ev-title')).toHaveValue('Lunch');
    await expect(page.locator('#ev-start-time')).toHaveValue('12:00');
    await page.fill('#ev-title', 'Team lunch');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    expect((await storedEvents(page))[0].title).toBe('Team lunch');

    await page.locator('.chip', { hasText: 'Team lunch' }).click();
    await dialog(page).getByRole('button', { name: 'Delete' }).click();
    expect(await storedEvents(page)).toHaveLength(0);
    await page.locator('.toast-action', { hasText: 'Undo' }).last().click(); // newest toast belongs to the delete
    expect(await storedEvents(page)).toHaveLength(1);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z'); // undo the title edit
    expect((await storedEvents(page))[0].title).toBe('Lunch');
    await page.keyboard.press('Control+Shift+z');
    expect((await storedEvents(page))[0].title).toBe('Team lunch');
  });

  test('quick add parses title, day, time and duration', async ({ page }) => {
    await openApp(page);
    await page.fill('#quick-add', 'Lunch with Sam tomorrow at 1pm for 90 min');
    await page.press('#quick-add', 'Enter');
    await expect(page.locator('#ev-title')).toHaveValue('Lunch with Sam');
    await expect(page.locator('#ev-start-date')).toHaveValue('2025-03-13');
    await expect(page.locator('#ev-start-time')).toHaveValue('13:00');
    await expect(page.locator('#ev-end-time')).toHaveValue('14:30');
    await page.keyboard.press('Control+Enter');
    await expect(dialog(page)).toHaveCount(0);
    expect(await storedEvents(page)).toHaveLength(1);
  });

  test('all-day events are plain dates; time zones are applied for real', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create event' }).first().click();
    await page.fill('#ev-title', 'Conference');
    await setAllDay(page);
    await expect(page.locator('#ev-start-time')).toBeHidden();
    await expect(page.locator('#ev-tz')).toBeHidden();
    await dialog(page).getByRole('button', { name: 'Create' }).click();

    await page.getByRole('button', { name: 'Create event' }).first().click();
    await page.fill('#ev-title', 'Call Tokyo team');
    await page.selectOption('#ev-tz', 'Asia/Tokyo');
    await page.fill('#ev-start-time', '09:00');
    await page.dispatchEvent('#ev-start-time', 'change');
    await dialog(page).getByRole('button', { name: 'Create' }).click();

    const events = await storedEvents(page);
    const conf = events.find((e) => e.title === 'Conference');
    const tokyo = events.find((e) => e.title === 'Call Tokyo team');
    expect(conf).toMatchObject({ allDay: true, start: '2025-03-12' });
    expect(tokyo.tz).toBe('Asia/Tokyo');
    expect(tokyo.start).toBe('2025-03-12T00:00:00.000Z'); // 09:00 JST
  });

  test('titles are rendered as text, never as HTML', async ({ page }) => {
    await openApp(page, [{ title: '<img src=x onerror=window.__xss=1>', start: '2025-03-15T14:00', end: '2025-03-15T15:00' }]);
    await expect(page.locator('.chip', { hasText: '<img src=x' })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});
