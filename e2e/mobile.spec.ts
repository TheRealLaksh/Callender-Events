import { expect, test } from '@playwright/test';
import { dialog, openApp, type SeedEvent } from './helpers';

const events: SeedEvent[] = [
  { title: 'Team standup', start: '2025-03-12T09:00', end: '2025-03-12T09:30' },
  { title: 'Gym', start: '2025-03-13T07:00', end: '2025-03-13T08:00', category: 'health' },
];

test.describe('on a phone', () => {
  test('fits the screen, shows dots, and lists the selected day under the grid', async ({ page }) => {
    await openApp(page, events);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.cell[data-date="2025-03-12"] .dot')).toHaveCount(1);
    await expect(page.locator('.month-day-panel .day-item')).toHaveCount(1);
    await page.locator('.cell[data-date="2025-03-13"] .cell-num').click();
    await expect(page.locator('.month-day-panel .day-item', { hasText: 'Gym' })).toBeVisible();
  });

  test('the drawer opens, closes and hides its contents when closed', async ({ page }) => {
    await openApp(page, events);
    await expect(page.locator('#sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.locator('.scrim').click({ position: { x: 380, y: 300 } });
    await expect(page.locator('#sidebar')).toBeHidden();
  });

  test('creating an event with the floating button', async ({ page }) => {
    await openApp(page, events);
    await page.getByRole('button', { name: 'Create event' }).click();
    await page.fill('#ev-title', 'Dentist');
    await dialog(page).getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('.month-day-panel .day-item', { hasText: 'Dentist' })).toBeVisible();
  });

  test('week view scrolls sideways with its header attached', async ({ page }) => {
    await openApp(page, events);
    await page.getByRole('button', { name: 'Week' }).click();
    const aligned = await page.evaluate(() => {
      const w = document.querySelector('.week') as HTMLElement;
      const head = document.querySelector('.week-head') as HTMLElement;
      const body = document.querySelector('.week-body') as HTMLElement;
      w.scrollLeft = 80;
      return Math.abs(head.getBoundingClientRect().left - body.getBoundingClientRect().left) < 1;
    });
    expect(aligned).toBe(true);
  });
});
