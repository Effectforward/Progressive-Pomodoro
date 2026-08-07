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

test('computeStats aggregates totals, best, count and level', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { computeStats } = await import('./js/stats.js');
    const sessions = [
      { rating: 'flow', length: 1500, timestamp: new Date().toISOString() },
      { rating: 'focused', length: 900, timestamp: new Date().toISOString() },
      { rating: 'good', length: 300, timestamp: new Date().toISOString() },
    ];
    return computeStats(sessions, 1500);
  });
  expect(r.total).toBe(45);
  expect(r.best).toBe(25);
  expect(r.count).toBe(3);
  expect(r.level).toBe(25);
});

test('computeStats builds last-7 and 35-cell month views', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { computeStats } = await import('./js/stats.js');
    const sessions = [
      { rating: 'flow', length: 3600, timestamp: new Date().toISOString() },
    ];
    return computeStats(sessions, 120);
  });
  expect(r.last7).toHaveLength(7);
  expect(r.last7[6].isToday).toBe(true);
  expect(r.last7[6].minutes).toBe(60);
  expect(r.month).toHaveLength(35);
  expect(r.month.some(c => c.isToday && c.minutes === 60)).toBe(true);
  expect(r.thisWeek).toBe(60);
});

test('computeYear spans 53 GitHub-style weeks ending today', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { computeYear } = await import('./js/stats.js');
    const sessions = [
      { rating: 'flow', length: 1800, timestamp: new Date().toISOString() },
    ];
    return computeYear(sessions);
  });
  expect(r.weeks).toBe(53);
  expect(r.cells).toHaveLength(371);
  const todayCell = r.cells.filter(c => c.isToday);
  expect(todayCell).toHaveLength(1);
  expect(todayCell[0].minutes).toBe(30);
});

test('computeYear bucket keys use local date components', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { localDateKey } = await import('./js/stats.js');
    const d = new Date(2026, 7, 7, 23, 59, 59); // local Aug 7
    return localDateKey(d);
  });
  expect(r).toBe('2026-08-07');
});

test('ratingInsight returns null below the min-sample gate', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { ratingInsight } = await import('./js/stats.js');
    const few = [
      { rating: 'flow' }, { rating: 'good' }, { rating: 'distracted' },
    ];
    return {
      gated: ratingInsight(few),
      ready: ratingInsight([
        ...few,
        { rating: 'focused' }, { rating: 'flow' }, { rating: 'focused' },
      ]),
    };
  });
  expect(r.gated).toBeNull();
  expect(r.ready.rated).toBe(6);
  expect(r.ready.good).toBe(4);
  expect(r.ready.pct).toBe(67);
});

test('statsMessage reflects the given stats', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { statsMessage } = await import('./js/stats.js');
    const seed = () => 0.5;
    const stats = { thisWeek: 150, total: 1200, best: 90, count: 40, monthTotal: 500 };
    return { a: statsMessage(stats, new Date(2026, 7, 7, 10), seed), b: statsMessage(stats, new Date(2026, 7, 7, 10), seed) };
  });
  expect(r.a).toBe(r.b);
  expect(r.a).toMatch(/\d/);
});

test('heatLevel maps minutes to 4 density levels up to 4 hours', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { heatLevel } = await import('./js/stats.js');
    const mins = [0, 1, 60, 61, 120, 121, 180, 181, 240, 241, 500];
    return mins.map(m => heatLevel(m));
  });
  expect(r).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4]);
});

test('ratingInsightMessage states pct, good and rated deterministically', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { ratingInsightMessage } = await import('./js/stats.js');
    const seed = () => 0.5;
    const insight = { good: 305, rated: 591, pct: 52 };
    return { a: ratingInsightMessage(insight, seed), b: ratingInsightMessage(insight, seed) };
  });
  expect(r.a).toBe(r.b);
  expect(r.a).toContain('52');
  expect(r.a).toContain('305');
  expect(r.a).toContain('591');
});
