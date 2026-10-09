import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp, type SeedEvent } from './helpers';

const events: SeedEvent[] = [
  { title: 'Team standup', start: '2025-03-12T09:00', end: '2025-03-12T09:30', location: 'Zoom' },
  { title: 'Design review', start: '2025-03-12T11:00', end: '2025-03-12T12:30', category: 'important' },
  { title: 'Gym', start: '2025-03-13T07:00', end: '2025-03-13T08:00', category: 'health', recurrence: { freq: 'weekly', interval: 1 } },
  { title: 'Holiday', start: '2025-03-20', end: '2025-03-21', category: 'personal' },
];

async function audit(page: Page, label: string) {
  await page.waitForTimeout(500); // let toast/dialog entrance animations finish so contrast is measured on settled colours
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`accessibility (${theme})`, () => {
    // Reduced motion avoids auditing elements mid-animation (toasts fade in), which yields false contrast readings.
    test.use({ colorScheme: theme, reducedMotion: 'reduce' });

    test('month view', async ({ page }) => {
      await openApp(page, events);
      await audit(page, 'month view');
    });

    test('week view', async ({ page }) => {
      await openApp(page, events);
      await page.keyboard.press('w');
      await audit(page, 'week view');
    });

    test('agenda view', async ({ page }) => {
      await openApp(page, events);
      await page.keyboard.press('a');
      await audit(page, 'agenda view');
    });

    test('event editor', async ({ page }) => {
      await openApp(page, events);
      await page.keyboard.press('c');
      await page.selectOption('#ev-freq', 'weekly');
      await audit(page, 'event dialog');
    });

    test('settings', async ({ page }) => {
      await openApp(page, events);
      await page.getByRole('button', { name: 'Settings' }).click();
      await audit(page, 'settings dialog');
    });

    test('search results', async ({ page }) => {
      await openApp(page, events);
      await page.keyboard.press('/');
      await page.keyboard.type('gym');
      await expect(page.locator('.search-hit')).toHaveCount(1);
      await audit(page, 'search results');
    });
  });
}
