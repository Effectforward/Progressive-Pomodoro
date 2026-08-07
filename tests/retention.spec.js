import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => localStorage.setItem('pp_landing_seen', '1'));
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const dismiss = page.locator('#onboardingDismiss');
  if (await dismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismiss.click();
  }
});

function seed(page, sessions) {
  return page.evaluate((list) => {
    localStorage.setItem('pp_sessions_v1', JSON.stringify(list));
  }, sessions);
}

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

const mk = (days, length = 1500, extra = {}) => ({
  rating: 'focused', auto: false, length, timestamp: daysAgoISO(days), ...extra,
});

test('sessions older than 365 days are dropped on load', async ({ page }) => {
  await seed(page, [mk(400), mk(10), mk(2)]);
  await page.reload();
  const result = await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    return state.sessions.map(s => s.length);
  });
  expect(result).toHaveLength(2);
});

test('sessions with unparseable timestamps survive the retention trim', async ({ page }) => {
  await seed(page, [{ rating: null, auto: false, length: 300, timestamp: 'garbage' }]);
  await page.reload();
  const result = await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    return state.sessions.length;
  });
  expect(result).toBe(1);
});

test('saving sessions enforces the 365-day retention', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    const { saveSessions } = await import('./js/storage.js');
    state.sessions = [
      { rating: null, auto: false, length: 60, timestamp: new Date(Date.now() - 400 * 86400000).toISOString() },
      { rating: null, auto: false, length: 60, timestamp: new Date().toISOString() },
    ];
    saveSessions();
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pp_sessions_v1')));
  expect(stored).toHaveLength(1);
});

test('history list caps rendering at 100 with a note', async ({ page }) => {
  const many = [];
  for (let i = 0; i < 120; i++) many.push(mk(i));
  await seed(page, many);
  await page.reload();
  const items = await page.locator('#sessionList li:not(.empty-state)').count();
  const note = await page.locator('#sessionList .empty-state').textContent();
  expect(items).toBe(100);
  expect(note).toContain('Showing latest 100 of 120 sessions');
});
