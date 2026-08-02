/**
 * First-visit routing — a brand-new visitor lands on the landing page,
 * a returning visitor goes straight to the timer.
 */
import { test, expect } from '@playwright/test';

test('first-time visitor is routed to the landing page and marker is set', async ({ page }) => {
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.waitForURL('**/landing.html');
  await expect(page.locator('h1')).toHaveText('Progressive Pomodoro Timer');
  const seen = await page.evaluate(() => localStorage.getItem('pp_landing_seen'));
  expect(seen).toBe('1');
});

test('returning visitor goes straight to the timer', async ({ page }) => {
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => localStorage.setItem('pp_landing_seen', '1'));
  await page.goto('/');
  await expect(page.locator('#time')).toHaveText('02:00');
});

test('installed PWA (standalone) skips the landing redirect', async ({ page }) => {
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => {
    window.matchMedia = (query) => ({
      matches: query.includes('display-mode: standalone'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  });
  await page.goto('/');
  await expect(page.locator('#time')).toHaveText('02:00');
});
