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

test('header button opens modal with KPIs, year heatmap and insight', async ({ page }) => {
  const many = [];
  for (let i = 0; i < 6; i++) many.push(mk(i * 2, 1800));
  await page.evaluate((list) => {
    localStorage.setItem('pp_sessions_v1', JSON.stringify(list));
  }, many);
  await page.reload();
  await expect(page.locator('#statsModalBtn')).toBeVisible();
  await page.click('#statsModalBtn');
  await expect(page.locator('#statsModal')).not.toHaveClass(/hidden/);
  const kpis = await page.locator('#statsModalKpis .stats-kpi-value').allTextContents();
  expect(kpis).toHaveLength(4);
  expect(kpis[1]).toBe('3h');
  const yearCells = await page.locator('#statsYearHeatmap .stats-cell').count();
  expect(yearCells).toBe(371);
  await expect(page.locator('#statsRatingInsight')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#statsModal')).toHaveClass(/hidden/);
});

test('modal shows zeros with no sessions', async ({ page }) => {
  await page.click('#statsModalBtn');
  await expect(page.locator('#statsModal')).not.toHaveClass(/hidden/);
  const values = await page.locator('#statsModalKpis .stats-kpi-value').allTextContents();
  expect(values[0]).toBe('2m');
  expect(values.slice(1)).toEqual(['0m', '0m', '0m']);
  const cells = await page.locator('#statsYearHeatmap .stats-cell').count();
  expect(cells).toBe(371);
  await expect(page.locator('#statsRatingInsight')).toBeHidden();
});

test('settings toggle hides the header stats button', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.locator('.settings-tab-btn[data-settings-tab="cards"]').filter({ visible: true }).first().click();
  await page.locator('#statsVisible').evaluate(el => {
    el.checked = false;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#settingsSaveBtn').scrollIntoViewIfNeeded();
  await page.click('#settingsSaveBtn');
  await expect(page.locator('#statsModalBtn')).toBeHidden();
});
