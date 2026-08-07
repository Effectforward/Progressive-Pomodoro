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

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

const mk = (days, length = 1500, extra = {}) => ({
  rating: 'focused', auto: false, length, timestamp: daysAgoISO(days), ...extra,
});

test('stats card renders KPIs and a 35-cell heatmap', async ({ page }) => {
  await page.evaluate((list) => {
    localStorage.setItem('pp_sessions_v1', JSON.stringify(list));
  }, [mk(0, 1500)]);
  await page.reload();
  await expect(page.locator('#statsCard')).toBeVisible();
  const values = await page.locator('#statsKpis .stats-kpi-value').allTextContents();
  expect(values).toHaveLength(4);
  expect(values[1]).toBe('25m');
  const cells = await page.locator('#statsHeatmap .stats-cell').count();
  expect(cells).toBe(35);
  const todayActive = await page.locator('#statsHeatmap .stats-cell:not(.stats-cell-0)').count();
  expect(todayActive).toBeGreaterThanOrEqual(1);
});

test('stats card shows zeros with no sessions', async ({ page }) => {
  await expect(page.locator('#statsCard')).toBeVisible();
  const values = await page.locator('#statsKpis .stats-kpi-value').allTextContents();
  expect(values[0]).toBe('2m');
  expect(values.slice(1)).toEqual(['0m', '0m', '0m']);
  const cells = await page.locator('#statsHeatmap .stats-cell').count();
  expect(cells).toBe(35);
});

test('stats card hides when statsDisplay is off', async ({ page }) => {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pp_settings_v1') || '{}');
    s.statsDisplay = 'off';
    localStorage.setItem('pp_settings_v1', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator('#statsCard')).toBeHidden();
});

test('expand button opens modal with year heatmap and insight', async ({ page }) => {
  const many = [];
  for (let i = 0; i < 6; i++) many.push(mk(i * 2, 1800));
  await page.evaluate((list) => {
    localStorage.setItem('pp_sessions_v1', JSON.stringify(list));
  }, many);
  await page.reload();
  await page.click('#statsExpandBtn');
  await expect(page.locator('#statsModal')).not.toHaveClass(/hidden/);
  const yearCells = await page.locator('#statsYearHeatmap .stats-cell').count();
  expect(yearCells).toBe(371);
  const kpis = await page.locator('#statsModalKpis .stats-kpi-value').allTextContents();
  expect(kpis).toHaveLength(4);
  await expect(page.locator('#statsRatingInsight')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#statsModal')).toHaveClass(/hidden/);
});

test('header stats button appears only in modal mode', async ({ page }) => {
  await expect(page.locator('#statsModalBtn')).toBeHidden();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('pp_settings_v1') || '{}');
    s.statsDisplay = 'modal';
    localStorage.setItem('pp_settings_v1', JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator('#statsModalBtn')).toBeVisible();
  await page.click('#statsModalBtn');
  await expect(page.locator('#statsModal')).not.toHaveClass(/hidden/);
});
