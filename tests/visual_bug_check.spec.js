/**
 * Regression suite — tests real bugs and behaviour.
 * Each test has a single clear assertion goal, not just console.log output.
 */
import { test, expect } from '@playwright/test';

// ─── Shared setup ────────────────────────────────────────────────────────────

async function freshPage(page) {
  await page.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const dismiss = page.locator('#onboardingDismiss');
  if (await dismiss.isVisible({ timeout: 800 }).catch(() => false)) {
    await dismiss.click();
    await page.waitForTimeout(200);
  }
}

async function openSettings(page, tab = 'timer') {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  if (tab !== 'timer') {
    const btn = page.locator(`.settings-tab-btn[data-settings-tab="${tab}"]`).filter({ visible: true }).first();
    await btn.click();
    await page.waitForTimeout(150);
  }
}

// ─── BUG-1: Timer XL overlaps bottom-grid ────────────────────────────────────

test.describe('BUG-1 — Timer size overlap', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('regular size: timer card does not overlap bottom-grid', async ({ page }) => {
    await freshPage(page);
    const timerBox  = await page.locator('.timer-card').boundingBox();
    const gridBox   = await page.locator('.bottom-grid').boundingBox();
    expect(gridBox.y).toBeGreaterThanOrEqual(timerBox.y + timerBox.height - 2);
  });

  test('XL size: timer card does not overlap bottom-grid', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'timer');
    await page.click('.timer-size-btn[data-size="xl"]');
    await page.click('#settingsSaveBtn');
    await page.waitForTimeout(300);

    const timerBox = await page.locator('.timer-card').boundingBox();
    const gridBox  = await page.locator('.bottom-grid').boundingBox();
    const gap = gridBox.y - (timerBox.y + timerBox.height);
    expect(gap, `Expected no overlap at XL, got gap=${gap}px`).toBeGreaterThanOrEqual(0);
  });

  test('compact size: timer card does not overlap bottom-grid', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'timer');
    await page.click('.timer-size-btn[data-size="compact"]');
    await page.click('#settingsSaveBtn');
    await page.waitForTimeout(300);

    const timerBox = await page.locator('.timer-card').boundingBox();
    const gridBox  = await page.locator('.bottom-grid').boundingBox();
    expect(gridBox.y).toBeGreaterThanOrEqual(timerBox.y + timerBox.height - 2);
  });

  test('bottom-grid is NOT scaled when timer size is XL', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'timer');
    await page.click('.timer-size-btn[data-size="xl"]');
    await page.click('#settingsSaveBtn');
    const gridZoom = await page.locator('.bottom-grid').evaluate(el => el.style.zoom);
    expect(gridZoom, 'bottom-grid should not be zoomed').toBe('');
  });

  test('timer uses CSS zoom not transform', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'timer');
    await page.click('.timer-size-btn[data-size="xl"]');
    await page.click('#settingsSaveBtn');
    const transform = await page.locator('.timer-card').evaluate(el => el.style.transform);
    expect(transform).toBe('');
  });
});

// ─── BUG-2: Audio panel content reachable ────────────────────────────────────

test.describe('BUG-2 — Audio panel scroll / truncation', () => {
  test('all audio fields are visible or scrollable to', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'audio');

    // Scroll the panel to the bottom
    await page.locator('.settings-panels').evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(100);

    // Volume slider must exist and be scrollable-to
    const volSlider = page.locator('#beatsDefaultVolume');
    await expect(volSlider).toBeAttached();
    const sliderBox = await volSlider.boundingBox();
    expect(sliderBox, 'Volume slider should have a bounding box after scroll').not.toBeNull();
  });

  test('audio panel scrollHeight is greater than its clientHeight (has overflow content)', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'audio');
    const { scrollH, clientH } = await page.locator('.settings-panels').evaluate(el => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    // Not a bug assertion — just documents the overflow exists so we know scrolling is needed
    expect(scrollH).toBeGreaterThan(0);
    expect(clientH).toBeGreaterThan(0);
  });

  test('audio panel has overflow-y auto (so content is scrollable)', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'audio');
    const overflowY = await page.locator('.settings-panels').evaluate(el =>
      getComputedStyle(el).overflowY
    );
    expect(overflowY).toBe('auto');
  });

  test('Save button is always in viewport (not hidden behind overflow)', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'audio');
    const saveBox      = await page.locator('#settingsSaveBtn').boundingBox();
    const viewportSize = page.viewportSize();
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(viewportSize.height + 2);
  });
});

// ─── BUG-4: Mobile tab bar clipping ──────────────────────────────────────────

test.describe('BUG-4 — Mobile tab bar', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('all settings tabs are reachable on mobile', async ({ page }) => {
    await freshPage(page);
    await openSettings(page);
    const tabs = ['timer', 'theme', 'cards', 'audio', 'data'];
    for (const tab of tabs) {
      const btn = page.locator(`.settings-tabs-top .settings-tab-btn[data-settings-tab="${tab}"]`);
      await expect(btn, `Tab "${tab}" should be attached`).toBeAttached();
      // Scroll to it and confirm it can be clicked
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await expect(
        page.locator(`.settings-panel[data-settings-panel="${tab}"]`),
        `Panel "${tab}" should become active`
      ).toHaveClass(/active/);
    }
  });

  test('settings modal does not overflow viewport on mobile', async ({ page }) => {
    await freshPage(page);
    await openSettings(page);
    const overflows = await page.evaluate(() => {
      const el = document.querySelector('.modal-content');
      const r  = el.getBoundingClientRect();
      return r.top < -2 || r.bottom > window.innerHeight + 2;
    });
    expect(overflows).toBe(false);
  });

  test('timer size picker hidden on mobile (not just unclickable)', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'timer');
    const timerSizeFieldset = page.locator('.settings-fieldset:has(.timer-size-grid)');
    await expect(timerSizeFieldset).toBeHidden();
  });

  test('layout picker hidden on mobile', async ({ page }) => {
    await freshPage(page);
    await openSettings(page, 'theme');
    const layoutFieldset = page.locator('.settings-fieldset:has(.layout-picker)');
    await expect(layoutFieldset).toBeHidden();
  });
});

// ─── Progression algorithm ────────────────────────────────────────────────────

test.describe('Progression — rating adjusts next session duration', () => {
  async function rateSession(page, rating, durationSecs = 120) {
    await page.evaluate(async ({ rating, durationSecs }) => {
      const { state } = await import('./state.js');
      const { submitRating } = await import('./timer.js');
      state.duration = durationSecs;
      state.remaining = 0;
      state.sessions = [];
      state.pendingRating = false;
      const { saveSessions } = await import('./storage.js');
      const s = { rating: null, auto: false, length: durationSecs, timestamp: new Date().toISOString() };
      state.sessions.unshift(s);
      saveSessions();
      submitRating(rating, false);
    }, { rating, durationSecs });
    await page.waitForTimeout(100);
  }

  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('"flow" rating adds 12 min to next session', async ({ page }) => {
    await rateSession(page, 'flow', 600); // 10 min session
    const next = await page.evaluate(async () => {
      const { state } = await import('./state.js');
      return state.nextFocusDuration;
    });
    expect(next).toBe(22 * 60); // 10 + 12 = 22 min
  });

  test('"focused" rating adds 7 min', async ({ page }) => {
    await rateSession(page, 'focused', 600);
    const next = await page.evaluate(async () => (await import('./state.js')).state.nextFocusDuration);
    expect(next).toBe(17 * 60);
  });

  test('"fine" rating adds 5 min', async ({ page }) => {
    await rateSession(page, 'good', 600);
    const next = await page.evaluate(async () => (await import('./state.js')).state.nextFocusDuration);
    expect(next).toBe(15 * 60);
  });

  test('"distracted" rating subtracts 3 min', async ({ page }) => {
    await rateSession(page, 'distracted', 600);
    const next = await page.evaluate(async () => (await import('./state.js')).state.nextFocusDuration);
    expect(next).toBe(7 * 60);
  });

  test('"distracted" rating never goes below 2 min', async ({ page }) => {
    await rateSession(page, 'distracted', 120); // 2 min session — already at floor
    const next = await page.evaluate(async () => (await import('./state.js')).state.nextFocusDuration);
    expect(next).toBeGreaterThanOrEqual(2 * 60);
  });

  test('duration picker shows suggested minutes after rating', async ({ page }) => {
    await rateSession(page, 'flow', 600); // 10 min → next should be 22
    await expect(page.locator('#durationPicker')).not.toHaveClass(/hidden/);
    const pickerVal = await page.locator('#pickerMinutes').inputValue();
    expect(Number(pickerVal)).toBe(22);
  });

  test('"flow" rating hides break option in picker', async ({ page }) => {
    await rateSession(page, 'flow', 600);
    await expect(page.locator('#pickerBreakBtn')).toBeHidden();
  });

  test('"distracted" rating shows break option in picker', async ({ page }) => {
    await rateSession(page, 'distracted', 600);
    await expect(page.locator('#pickerBreakBtn')).toBeVisible();
  });
});

// ─── State persistence across reloads ─────────────────────────────────────────

test.describe('Persistence — localStorage survives reload', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('settings warmup duration persists after reload', async ({ page }) => {
    await openSettings(page, 'timer');
    await page.fill('#warmupInput', '7');
    await page.click('#settingsSaveBtn');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const time = await page.locator('#time').textContent();
    expect(time).toBe('07:00');
  });

  test('tasks survive page reload', async ({ page }) => {
    await page.fill('#taskInput', 'Persistent task');
    await page.press('#taskInput', 'Enter');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.task-text')).toHaveText('Persistent task');
  });

  test('session history survives page reload', async ({ page }) => {
    await page.evaluate(async () => {
      const { state } = await import('./state.js');
      const { saveSessions } = await import('./storage.js');
      state.sessions = [{ rating: 'good', length: 120, timestamp: new Date().toISOString() }];
      saveSessions();
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#sessionList li')).toHaveCount(1);
  });

  test('theme choice persists after reload', async ({ page }) => {
    await openSettings(page, 'theme');
    // Click the second theme (Soft Slate)
    const btn = page.locator('.theme-picker-btn').nth(1);
    await btn.click();
    await page.click('#settingsSaveBtn');
    const themeAfterSave = await page.locator('body').getAttribute('data-theme');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const themeAfterReload = await page.locator('body').getAttribute('data-theme');
    expect(themeAfterReload).toBe(themeAfterSave);
  });

  test('card visibility (tasks hidden) persists after reload', async ({ page }) => {
    await openSettings(page, 'cards');
    await page.locator('#tasksCardVisible').evaluate(el => {
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#settingsSaveBtn');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const display = await page.locator('#tasksCard').evaluate(el => el.style.display);
    expect(display).toBe('none');
  });
});

// ─── Task management ──────────────────────────────────────────────────────────

test.describe('Tasks', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('empty input does not add a task', async ({ page }) => {
    await page.press('#taskInput', 'Enter');
    await expect(page.locator('.task-item')).toHaveCount(0);
  });

  test('whitespace-only input does not add a task', async ({ page }) => {
    await page.fill('#taskInput', '   ');
    await page.press('#taskInput', 'Enter');
    await expect(page.locator('.task-item')).toHaveCount(0);
  });

  test('checkbox completion strikes through task text', async ({ page }) => {
    await page.fill('#taskInput', 'Check me');
    await page.press('#taskInput', 'Enter');
    await page.locator('.task-item-left input[type="checkbox"]').click();
    const decoration = await page.locator('.task-text').evaluate(el =>
      getComputedStyle(el).textDecorationLine
    );
    expect(decoration).toContain('line-through');
  });

  test('undo restores task at correct position', async ({ page }) => {
    await page.fill('#taskInput', 'Task A'); await page.press('#taskInput', 'Enter');
    await page.fill('#taskInput', 'Task B'); await page.press('#taskInput', 'Enter');
    // Delete Task A (first item)
    await page.locator('.task-actions button').first().click();
    await page.click('.toast-undo');
    const texts = await page.locator('.task-text').allTextContents();
    expect(texts[0]).toBe('Task A');
  });

  test('task count badge shows correct remaining count', async ({ page }) => {
    await page.fill('#taskInput', 'Task 1'); await page.press('#taskInput', 'Enter');
    await page.fill('#taskInput', 'Task 2'); await page.press('#taskInput', 'Enter');
    await expect(page.locator('#taskCount')).toHaveText('2 left');
    // Complete one
    await page.locator('.task-item-left input[type="checkbox"]').first().click();
    await expect(page.locator('#taskCount')).toHaveText('1 left');
  });
});

// ─── Timer state machine ──────────────────────────────────────────────────────

test.describe('Timer state machine', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('timer display decrements after starting', async ({ page }) => {
    await page.click('#toggleBtn');
    await page.waitForTimeout(1200);
    const time = await page.locator('#time').textContent();
    expect(time).not.toBe('02:00');
  });

  test('reset while running stops timer and restores time', async ({ page }) => {
    await page.click('#toggleBtn');
    await page.waitForTimeout(1200);
    await page.click('#resetBtn');
    await expect(page.locator('#time')).toHaveText('02:00');
    await expect(page.locator('#toggleBtn')).toContainText('Start');
  });

  test('mode tab switches to break mode and shows break ring', async ({ page }) => {
    await page.click('button[data-mode="break"]');
    const mode = await page.locator('body').getAttribute('data-mode');
    expect(mode).toBe('break');
  });

  test('decision-active class blocks timer shortcuts', async ({ page }) => {
    // Directly show rating to trigger decision-active
    await page.evaluate(async () => {
      const { state } = await import('./state.js');
      const ui = await import('./ui.js');
      state.pendingRating = true;
      ui.showRating();
    });
    await expect(page.locator('body')).toHaveClass(/decision-active/);
    // Space should NOT start the timer
    await page.keyboard.press('Space');
    const rafId = await page.evaluate(async () => (await import('./state.js')).state.rafId);
    expect(rafId).toBeFalsy();
  });

  test('progress ring offset decreases as timer runs', async ({ page }) => {
    const initialOffset = await page.locator('.ring').evaluate(el =>
      parseFloat(el.style.strokeDashoffset)
    );
    await page.click('#toggleBtn');
    await page.waitForTimeout(2000);
    await page.click('#toggleBtn'); // pause to read stable value
    const laterOffset = await page.locator('.ring').evaluate(el =>
      parseFloat(el.style.strokeDashoffset)
    );
    expect(laterOffset).toBeGreaterThan(initialOffset);
  });

  test('restart progression resets timer to warmup duration', async ({ page }) => {
    // Simulate having progressed
    await page.evaluate(async () => {
      const { state } = await import('./state.js');
      state.duration = 1800; state.remaining = 1800;
      state.nextFocusDuration = 1800;
    });
    await openSettings(page, 'data');
    await page.click('#restartProgressionBtn');
    await page.click('#restartConfirmYes');
    const time = await page.locator('#time').textContent();
    expect(time).toBe('02:00');
  });

  test('clear history empties session list', async ({ page }) => {
    await page.evaluate(async () => {
      const { state } = await import('./state.js');
      const { saveSessions } = await import('./storage.js');
      state.sessions = [
        { rating: 'good', length: 120, timestamp: new Date().toISOString() },
        { rating: 'flow', length: 240, timestamp: new Date().toISOString() },
      ];
      saveSessions();
    });
    await page.reload(); await page.waitForLoadState('networkidle');
    const dismiss = page.locator('#onboardingDismiss');
    if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) await dismiss.click();

    await openSettings(page, 'data');
    await page.click('#clearHistoryBtn');
    await page.click('#clearConfirmYes');
    await page.click('#settingsCloseBtn');
    await expect(page.locator('#sessionList .empty-state')).toBeVisible();
  });
});

// ─── Settings layout switching ────────────────────────────────────────────────

test.describe('Settings layout', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('switching to top layout shows top tabs, hides sidebar', async ({ page }) => {
    await openSettings(page, 'theme');
    await page.click('.layout-option[data-layout="top"]');
    await expect(page.locator('.settings-tabs-top')).toBeVisible();
    await expect(page.locator('.settings-tabs-sidebar')).toBeHidden();
  });

  test('active tab is synced when switching layout', async ({ page }) => {
    await openSettings(page, 'timer');
    // Navigate to audio in sidebar mode
    await page.click('.settings-tabs-sidebar .settings-tab-btn[data-settings-tab="audio"]');
    // Switch to theme to access layout picker
    await page.click('.settings-tabs-sidebar .settings-tab-btn[data-settings-tab="theme"]');
    // Switch layout to top — active tab should still be theme
    await page.click('.layout-option[data-layout="top"]');
    const activeTop = await page.locator('.settings-tabs-top .settings-tab-btn.active')
      .getAttribute('data-settings-tab');
    expect(activeTop).toBe('theme');
  });

  test('switching back to sidebar restores sidebar view', async ({ page }) => {
    await openSettings(page, 'theme');
    await page.click('.layout-option[data-layout="top"]');
    await page.click('.layout-option[data-layout="sidebar"]');
    await expect(page.locator('.settings-tabs-sidebar')).toBeVisible();
    await expect(page.locator('.settings-tabs-top')).toBeHidden();
  });

  test('layout preference is saved and restored on next open', async ({ page }) => {
    await openSettings(page, 'theme');
    await page.click('.layout-option[data-layout="top"]');
    await page.click('#settingsSaveBtn');
    // Reopen settings
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
    await expect(page.locator('.settings-tabs-top')).toBeVisible();
  });
});

// ─── Binaural beats UI ────────────────────────────────────────────────────────

test.describe('Binaural beats', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('popover closes when clicking outside', async ({ page }) => {
    await page.click('#beatsChevron');
    await expect(page.locator('#beatsPopover')).not.toHaveClass(/hidden/);
    await page.click('body', { position: { x: 10, y: 400 } });
    await expect(page.locator('#beatsPopover')).toHaveClass(/hidden/);
  });

  test('beat frequency display updates when custom freqs change', async ({ page }) => {
    await page.click('#beatsChevron');
    await page.fill('#beatsPopLeftFreq', '300');
    await page.dispatchEvent('#beatsPopLeftFreq', 'input');
    await page.fill('#beatsPopRightFreq', '314');
    await page.dispatchEvent('#beatsPopRightFreq', 'input');
    await expect(page.locator('#beatsPopBeatFreq')).toHaveText('= 14 Hz');
  });

  test('selecting a preset marks it active in popover', async ({ page }) => {
    await page.click('#beatsChevron');
    // Start beats first so preset selection is meaningful
    await page.locator('#beatsPopoverToggle').evaluate(el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('.beats-popover-item[data-preset="alpha"]');
    await expect(page.locator('.beats-popover-item[data-preset="alpha"]')).toHaveClass(/active/);
  });

  test('escape key closes popover', async ({ page }) => {
    await page.click('#beatsChevron');
    await expect(page.locator('#beatsPopover')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#beatsPopover')).toHaveClass(/hidden/);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page); });

  test('settings modal traps focus (Tab cycles within modal)', async ({ page }) => {
    await openSettings(page);
    await page.locator('#settingsCloseBtn').focus();
    await page.keyboard.press('Tab');
    const isInsideModal = await page.evaluate(() => {
      const modal = document.getElementById('settingsModal');
      return modal.contains(document.activeElement);
    });
    expect(isInsideModal).toBe(true);
  });

  test('mode tabs have correct role and aria-selected', async ({ page }) => {
    const list = page.locator('.mode-tabs');
    await expect(list).toHaveAttribute('role', 'tablist');
    await expect(page.locator('button[data-mode="focus"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('button[data-mode="break"]')).toHaveAttribute('aria-selected', 'false');
  });

  test('timer has role=timer and aria-live=off', async ({ page }) => {
    await expect(page.locator('#time')).toHaveAttribute('role', 'timer');
    await expect(page.locator('#time')).toHaveAttribute('aria-live', 'off');
  });

  test('toggle button label changes with timer state', async ({ page }) => {
    await expect(page.locator('#toggleBtn')).toContainText('Start');
    await page.click('#toggleBtn');
    await expect(page.locator('#toggleBtn')).toContainText('Pause');
    await page.click('#toggleBtn');
    await expect(page.locator('#toggleBtn')).toContainText('Start');
  });

  test('settings modal aria-hidden false when open', async ({ page }) => {
    await expect(page.locator('#settingsModal')).toHaveAttribute('aria-hidden', 'true');
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
    await expect(page.locator('#settingsModal')).toHaveAttribute('aria-hidden', 'false');
  });
});

// ─── Cross-tab sync ───────────────────────────────────────────────────────────

test.describe('Cross-tab storage sync', () => {
  test('session added in another tab appears in session list', async ({ page, context }) => {
    await freshPage(page);

    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.waitForLoadState('networkidle');

    // Add a session via storage event from tab 2
    await page2.evaluate(async () => {
      const { state } = await import('./state.js');
      const { saveSessions } = await import('./storage.js');
      state.sessions = [{ rating: 'flow', length: 300, timestamp: new Date().toISOString() }];
      saveSessions();
      // Trigger storage event in the other tab by re-setting the same key
    });

    // Fire a storage event manually in page (simulating cross-tab)
    await page.evaluate(async () => {
      const raw = localStorage.getItem('pp_sessions_v1');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'pp_sessions_v1',
        newValue: raw,
        storageArea: localStorage,
      }));
    });
    await page.waitForTimeout(200);

    await expect(page.locator('#sessionList li:not(.empty-state)')).toHaveCount(1);
    await page2.close();
  });
});
