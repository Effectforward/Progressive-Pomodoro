import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test.beforeEach(async ({ page }) => {
  // Block SW registration so stale caches never interfere
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

test('page loads with timer at 02:00', async ({ page }) => {
  await expect(page.locator('#time')).toHaveText('02:00');
  await expect(page.locator('#toggleBtn')).toBeVisible();
});

test('start/pause timer', async ({ page }) => {
  await page.click('#toggleBtn');
  await page.waitForTimeout(1500);
  const text = await page.locator('#toggleBtn').textContent();
  expect(text).toContain('Pause');
  await page.click('#toggleBtn');
  const text2 = await page.locator('#toggleBtn').textContent();
  expect(text2).toContain('Start');
});

test('reset timer', async ({ page }) => {
  await page.click('#toggleBtn');
  await page.waitForTimeout(1000);
  await page.click('#resetBtn');
  await expect(page.locator('#time')).toHaveText('02:00');
});

test('submit rating updates session', async ({ page }) => {
  await page.evaluate(async () => {
    const state = (await import('./js/state.js')).state;
    const ui = await import('./js/ui.js');
    state.pendingRating = true;
    ui.showRating();
  });
  await expect(page.locator('#rating')).toBeVisible();
  await page.click('[data-rating="good"]');
  await expect(page.locator('#rating')).toHaveClass(/hidden/);
  await expect(page.locator('#sessionList li')).toHaveCount(1);
});

test('pendingRating blocks timer start', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const state = (await import('./js/state.js')).state;
    const timer = await import('./js/timer.js');
    state.pendingRating = true;
    timer.toggleTimer();
    return state.rafId;
  });
  expect(result).toBeFalsy();
});

test('pendingRating blocks reset', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const state = (await import('./js/state.js')).state;
    const timer = await import('./js/timer.js');
    state.pendingRating = true;
    state.remaining = 999;
    timer.reset();
    return state.remaining;
  });
  expect(result).toBe(999);
});

test.describe('background notify fallback', () => {
  test('start schedules a wall-clock timeout, pause clears it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      const timer = await import('./js/timer.js');
      state.remainingMs = 60000;
      timer.start();
      const scheduled = !!state.notifyTimer;
      timer.pause();
      const cleared = state.notifyTimer === null;
      return { scheduled, cleared };
    });
    expect(result.scheduled).toBe(true);
    expect(result.cleared).toBe(true);
  });

  test('reset and stopTimer clear the scheduled timeout', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      const timer = await import('./js/timer.js');
      state.remainingMs = 60000;
      timer.start();
      timer.reset();
      const afterReset = state.notifyTimer === null;
      timer.start();
      timer.stopTimer();
      const afterStop = state.notifyTimer === null;
      return { afterReset, afterStop };
    });
    expect(result.afterReset).toBe(true);
    expect(result.afterStop).toBe(true);
  });

  test('completion clears the scheduled timeout', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      const timer = await import('./js/timer.js');
      state.remainingMs = 60000;
      timer.start();
      timer.onTimerComplete();
      return state.notifyTimer === null;
    });
    expect(result).toBe(true);
  });

  test('notifyComplete routes through the service worker', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const calls = [];
      Object.defineProperty(window, 'Notification', {
        value: { permission: 'granted' },
        configurable: true,
      });
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: Promise.resolve({
            showNotification: (title, options) => { calls.push({ title, options }); return Promise.resolve(); },
          }),
        },
        configurable: true,
      });
      const timer = await import('./js/timer.js');
      timer.notifyComplete();
      await new Promise(r => setTimeout(r, 50));
      return calls;
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Session complete');
    expect(result[0].options.body).toContain('Rate your focus');
  });

  test('requests permission once on first interaction', async ({ page, context }) => {
    const p = await context.newPage();
    await p.route('**/sw.js', r => r.fulfill({ status: 404, body: '' }));
    await p.addInitScript(() => {
      localStorage.setItem('pp_landing_seen', '1');
      window.__permCalls = 0;
      Object.defineProperty(window, 'Notification', {
        value: {
          permission: 'default',
          requestPermission: () => { window.__permCalls++; return Promise.resolve('granted'); },
        },
        configurable: true,
      });
    });
    await p.goto('/');
    const dispatch = () => p.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await dispatch();
    await p.waitForTimeout(50);
    const afterFirst = await p.evaluate(() => window.__permCalls);
    await dispatch();
    await p.waitForTimeout(50);
    const afterSecond = await p.evaluate(() => window.__permCalls);
    await p.close();
    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });
});

test('rating blocked while timer running', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const timer = await import('./js/timer.js');
    const state = (await import('./js/state.js')).state;
    state.rafId = 123;
    timer.submitRating('good');
    return state.sessions.length;
  });
  expect(result).toBe(0);
});

test('card visibility toggle hides tasks card', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.locator('#tasksCardVisible').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#settingsSaveBtn');
  const display = await page.locator('#tasksCard').evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('settings tabs switch panels', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Default tab should be timer
  await expect(page.locator('[data-settings-panel="timer"]')).toHaveClass(/active/);
  // Switch to theme tab
  await page.click('.settings-tab-btn[data-settings-tab="theme"]');
  await expect(page.locator('[data-settings-panel="theme"]')).toHaveClass(/active/);
  await expect(page.locator('[data-settings-panel="timer"]')).not.toHaveClass(/active/);
});

test('mode tabs switch focus/break', async ({ page }) => {
  await page.click('button[data-mode="break"]');
  await expect(page.locator('button[data-mode="break"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('button[data-mode="focus"]')).toHaveAttribute('aria-selected', 'false');
});

test('settings close button hides modal', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('#settingsCloseBtn');
  await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
});

test('settings backdrop click closes modal', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('#settingsModal', { position: { x: 5, y: 5 } });
  await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
});

test.describe('settings export/import', () => {
  test.use({ acceptDownloads: true });

  async function openManageTab(page) {
    await page.click('#settingsBtn');
    await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
    await page.click('.settings-tab-btn[data-settings-tab="data"]');
  }

  test('export downloads dated JSON of settings + theme, strips legacy keys', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('pp_theme_v1', 'dark');
      localStorage.setItem('pp_settings_v1', JSON.stringify({ beatsEnabled: false, beatsFrequency: 20, warmupDuration: 1800 }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openManageTab(page);

    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportSettingsBtn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^progressive-pomodoro-settings-\d{4}-\d{2}-\d{2}\.json$/);

    const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(data.settings.warmupDuration).toBe(1800);
    expect(data.theme).toBe('dark');
    expect(data.settings).not.toHaveProperty('beatsEnabled');
    expect(data.settings).not.toHaveProperty('beatsFrequency');
  });

  test('import replaces settings after confirm', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        settings: { warmupDuration: 1800, shortBreak: 600 },
        theme: 'dark',
      })),
    });
    await expect(page.locator('#importConfirm')).toBeVisible();
    await page.click('#importConfirmYes');
    await expect(page.locator('#importConfirm')).toBeHidden();
    await expect(page.locator('#toast')).toHaveText('Settings imported');
    await expect(page.locator('#warmupInput')).toHaveValue('30');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pp_settings_v1')));
    expect(stored.warmupDuration).toBe(1800);
    expect(stored.shortBreak).toBe(600);
    expect(await page.evaluate(() => localStorage.getItem('pp_theme_v1'))).toBe('dark');
  });

  test('import cancel leaves settings untouched', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ settings: { warmupDuration: 1800 }, theme: 'dark' })),
    });
    await expect(page.locator('#importConfirm')).toBeVisible();
    await page.click('#importConfirmNo');
    await expect(page.locator('#importConfirm')).toBeHidden();
    const stored = await page.evaluate(() => localStorage.getItem('pp_settings_v1'));
    expect(stored).toBeNull();
    const mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return state.settings.warmupDuration;
    });
    expect(mem).toBe(120);
    expect(await page.evaluate(() => localStorage.getItem('pp_theme_v1'))).toBe('pastel');
  });

  test('import invalid file shows error toast without confirm', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'garbage.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json at all'),
    });
    await expect(page.locator('#importConfirm')).toBeHidden();
    await expect(page.locator('#toast')).toHaveText("That doesn't look like a settings file.");
  });

  test('import valid file picks a new file after import clears the input', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'a.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ settings: { warmupDuration: 1800 }, theme: 'dark' })),
    });
    await page.click('#importConfirmYes');
    await expect(page.locator('#importSettingsFile')).toHaveValue('');
  });

  test('import with only theme (no settings) keeps all settings defaults', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'theme-only.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ theme: 'dark' })),
    });
    await page.click('#importConfirmYes');
    await expect(page.locator('#toast')).toHaveText('Settings imported');
    const mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return { warmup: state.settings.warmupDuration, preset: state.settings.beatsPreset, beats: state.settings.beatsLeftFreq };
    });
    expect(mem.warmup).toBe(120);
    expect(mem.preset).toBe('gamma');
    expect(mem.beats).toBe(340);
    expect(await page.evaluate(() => document.body.getAttribute('data-theme'))).toBe('dark');
  });
});

test.describe('settings export/import — aggressive edge cases', () => {
  test.use({ acceptDownloads: true });

  async function openManageTab(page) {
    const modal = page.locator('#settingsModal');
    const cls = await modal.getAttribute('class');
    if (cls.includes('hidden')) {
      await page.click('#settingsBtn');
      await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
    }
    await page.click('.settings-tab-btn[data-settings-tab="data"]');
  }

  async function importBuffer(page, content) {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
    await expect(page.locator('#importConfirm')).toBeVisible();
    await page.click('#importConfirmYes');
    await expect(page.locator('#importConfirm')).toBeHidden();
  }

  async function exportData(page) {
    await openManageTab(page);
    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportSettingsBtn');
    const download = await downloadPromise;
    return JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  }

  test('round-trip export → import → export is lossless', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('pp_theme_v1', 'zen');
      localStorage.setItem('pp_settings_v1', JSON.stringify({
        warmupDuration: 1500, beatsPreset: 'alpha', beatsLeftFreq: 200, beatsRightFreq: 214,
      }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    const first = await exportData(page);
    await importBuffer(page, JSON.stringify(first));
    const second = await exportData(page);
    expect(second).toEqual(first);
  });

  test('import while idle resets the timer display to imported warmup', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: { warmupDuration: 1800 } }));
    await expect(page.locator('#time')).toHaveText('30:00');
  });

  test('import while a session is running does not clobber the running timer', async ({ page }) => {
    await page.click('#toggleBtn');
    await page.waitForTimeout(400);
    const runningBefore = await page.evaluate(async () => (await import('./js/state.js')).state.rafId);
    expect(runningBefore).toBeTruthy();

    await importBuffer(page, JSON.stringify({ settings: { warmupDuration: 1800 } }));

    const after = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return { rafId: state.rafId, duration: state.duration, warmup: state.settings.warmupDuration };
    });
    expect(after.rafId).toBeTruthy();
    expect(after.duration).toBe(120);
    expect(after.warmup).toBe(1800);
    expect(await page.locator('#time').textContent()).not.toBe('30:00');
  });

  test('partial import merges with defaults (only provided keys change)', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: { shortBreak: 900 } }));
    const mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return state.settings;
    });
    expect(mem.shortBreak).toBe(900);
    expect(mem.warmupDuration).toBe(120);
    expect(mem.beatsPreset).toBe('gamma');
    expect(mem.beatsVolume).toBe(0.5);
  });

  test('import applies beats settings to the form', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: { beatsPreset: 'theta', beatsLeftFreq: 220, beatsRightFreq: 224 } }));
    await expect(page.locator('#beatsPresetSelect')).toHaveValue('theta');
    await expect(page.locator('#beatsDefaultLeftFreq')).toHaveValue('220');
    await expect(page.locator('#beatsDefaultRightFreq')).toHaveValue('224');
  });

  test('import of null settings and empty object both apply defaults without crashing', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: null, theme: 'dark' }));
    let mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return { warmup: state.settings.warmupDuration, theme: state.theme };
    });
    expect(mem.warmup).toBe(120);
    expect(mem.theme).toBe('dark');

    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'empty.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
    await page.click('#importConfirmYes');
    mem = await page.evaluate(async () => (await import('./js/state.js')).state.settings.warmupDuration);
    expect(mem).toBe(120);
  });

  test('escape key dismisses import confirm without applying', async ({ page }) => {
    await openManageTab(page);
    await page.setInputFiles('#importSettingsFile', {
      name: 'escape.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ settings: { warmupDuration: 1800 }, theme: 'dark' })),
    });
    await expect(page.locator('#importConfirm')).toBeVisible();
    await page.press('body', 'Escape');
    await expect(page.locator('#importConfirm')).toBeHidden();
    const mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return { warmup: state.settings.warmupDuration, theme: state.theme };
    });
    expect(mem.warmup).toBe(120);
    expect(mem.theme).toBe('pastel');
  });

  test('re-export after importing junk keys strips them from the file', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: { warmupDuration: 1500, hackerKey: 'x', beatsEnabled: true } }));
    const data = await exportData(page);
    expect(data.settings.warmupDuration).toBe(1500);
    expect(data.settings).not.toHaveProperty('hackerKey');
    expect(data.settings).not.toHaveProperty('beatsEnabled');
  });

  test('imported junk keys do NOT leak into stored settings (trust boundary)', async ({ page }) => {
    await importBuffer(page, JSON.stringify({ settings: { warmupDuration: 1500, hackerKey: 'x', beatsEnabled: true } }));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pp_settings_v1')));
    expect(stored.warmupDuration).toBe(1500);
    expect(stored).not.toHaveProperty('hackerKey');
    expect(stored).not.toHaveProperty('beatsEnabled');
  });

  test('import cannot pollute Object.prototype via __proto__ key', async ({ page }) => {
    await importBuffer(page, '{"settings":{"__proto__":{"polluted":"yes"},"warmupDuration":1500}}');
    const mem = await page.evaluate(async () => {
      const { state } = await import('./js/state.js');
      return {
        globalPolluted: ({}).polluted,
        settingsPolluted: state.settings.polluted,
        protoIsObject: Object.getPrototypeOf(state.settings) === Object.prototype,
        warmup: state.settings.warmupDuration,
      };
    });
    expect(mem.globalPolluted).toBeUndefined();
    expect(mem.settingsPolluted).toBeUndefined();
    expect(mem.protoIsObject).toBe(true);
    expect(mem.warmup).toBe(1500);
  });
});

test('add a task via input', async ({ page }) => {
  await page.fill('#taskInput', 'Write tests');
  await page.press('#taskInput', 'Enter');
  await expect(page.locator('.task-text')).toHaveText('Write tests');
  await expect(page.locator('.task-list li')).toHaveCount(1);
});

test('timer size preset changes timer scale', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="xl"]');
  await page.click('#settingsSaveBtn');
  const zoom = await page.locator('.timer-card').evaluate(el => el.style.zoom);
  expect(zoom).toBe('1.6');
});

test('layout picker switches to top tabs', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="theme"]');
  await page.click('.layout-option[data-layout="top"]');
  const hasTop = await page.locator('.settings-body').evaluate(el => el.classList.contains('layout-top'));
  expect(hasTop).toBe(true);
});

test('keyboard space starts and pauses timer', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  const text1 = await page.locator('#toggleBtn').textContent();
  expect(text1).toContain('Pause');
  await page.keyboard.press('Space');
  const text2 = await page.locator('#toggleBtn').textContent();
  expect(text2).toContain('Start');
});

test('keyboard r resets timer', async ({ page }) => {
  await page.click('#toggleBtn');
  await page.waitForTimeout(1000);
  await page.keyboard.press('r');
  await expect(page.locator('#time')).toHaveText('02:00');
});

test('ctrl+r does not reset timer (browser refresh passes through)', async ({ page }) => {
  await page.click('#toggleBtn');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Control+r');
  await expect(page.locator('#toggleBtn')).toContainText('Pause');
  await expect(page.locator('#time')).not.toHaveText('02:00');
});

test('settings save persists timer duration', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.fill('#warmupInput', '5');
  await page.click('#settingsSaveBtn');
  await expect(page.locator('#time')).toHaveText('05:00');
});

test('alarm sound persists from settings', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  await expect(page.locator('#alarmSoundSelect option')).toHaveCount(5);
  await page.selectOption('#alarmSoundSelect', 'marimba');
  await page.click('#settingsSaveBtn');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pp_settings_v1')).alarmSound);
  expect(saved).toBe('marimba');
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  await expect(page.locator('#alarmSoundSelect')).toHaveValue('marimba');
});

test('theme picker buttons are clickable', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="theme"]');
  const themeBtns = page.locator('.theme-picker-btn');
  await expect(themeBtns).toHaveCount(6);
  await themeBtns.first().click();
  await themeBtns.nth(2).click();
});

test('github toggle hides header link', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="cards"]');
  await page.locator('#githubVisible').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#settingsSaveBtn');
  const display = await page.locator('#githubStarBtn').evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('break duration saves from settings', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.fill('#breakInput', '10');
  await page.click('#settingsSaveBtn');
  const breakVal = await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    return state.settings.shortBreak;
  });
  expect(breakVal).toBe(600);
});

test('bottom cards scale with timer size', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="xl"]');
  await page.click('#settingsSaveBtn');
  const timerZoom = await page.locator('.timer-card').evaluate(el => el.style.zoom);
  expect(timerZoom).toBe('1.6');
});

test('bottom cards reset scale on regular', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="xl"]');
  await page.click('#settingsSaveBtn');
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="regular"]');
  await page.click('#settingsSaveBtn');
  const timerZoom = await page.locator('.timer-card').evaluate(el => el.style.zoom);
  expect(timerZoom).toBe('');
});

test('task delete shows undo toast', async ({ page }) => {
  await page.fill('#taskInput', 'Delete me');
  await page.press('#taskInput', 'Enter');
  await expect(page.locator('.task-list li')).toHaveCount(1);
  await page.click('.task-actions button');
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('.toast-undo')).toBeVisible();
  const toastText = await page.locator('#toast').textContent();
  expect(toastText).toContain('Task deleted');
  expect(toastText).toContain('Undo');
});

test('undo toast restores deleted task', async ({ page }) => {
  await page.fill('#taskInput', 'Undo me');
  await page.press('#taskInput', 'Enter');
  await expect(page.locator('.task-list li')).toHaveCount(1);
  await page.click('.task-actions button');
  await page.click('.toast-undo');
  await expect(page.locator('.task-list li')).toHaveCount(1);
  await expect(page.locator('.task-text')).toHaveText('Undo me');
});

test('progression hint hidden after sessions', async ({ page }) => {
  const hintVisible = await page.locator('#progressionHint').isVisible();
  expect(hintVisible).toBe(true);
  await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    const { saveSessions } = await import('./js/storage.js');
    state.sessions = [{ rating: 'good', length: 120, timestamp: new Date().toISOString() }];
    saveSessions();
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  const hintHidden = await page.locator('#progressionHint').evaluate(el => el.classList.contains('hidden'));
  expect(hintHidden).toBe(true);
});

test('timer size ARIA attributes correct', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const grid = page.locator('#timerSizeGrid');
  await expect(grid).toHaveAttribute('role', 'radiogroup');
  await expect(grid).toHaveAttribute('aria-label', 'Timer size');
  const regularBtn = page.locator('.timer-size-btn[data-size="regular"]');
  await expect(regularBtn).toHaveAttribute('role', 'radio');
  await expect(regularBtn).toHaveAttribute('aria-checked', 'true');
  const compactBtn = page.locator('.timer-size-btn[data-size="compact"]');
  await expect(compactBtn).toHaveAttribute('aria-checked', 'false');
});

test('timer size ARIA updates on click', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="xl"]');
  await expect(page.locator('.timer-size-btn[data-size="xl"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.timer-size-btn[data-size="regular"]')).toHaveAttribute('aria-checked', 'false');
});

test('onboarding shows progression steps', async ({ page }) => {
  await page.evaluate(async () => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#onboardingOverlay')).toBeVisible();
  await expect(page.locator('.onboarding-steps .onboarding-step')).toHaveCount(3);
  await expect(page.locator('.onboarding-step-num')).toHaveCount(3);
  await page.click('#onboardingDismiss');
  await expect(page.locator('#onboardingOverlay')).toHaveClass(/hidden/);
});

test('escape closes settings modal', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).toHaveClass(/hidden/);
});

test('history card visibility toggle', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="cards"]');
  await page.locator('#historyCardVisible').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('#settingsSaveBtn');
  const display = await page.locator('#historyCard').evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('multiple tasks can be added', async ({ page }) => {
  await page.fill('#taskInput', 'Task 1');
  await page.press('#taskInput', 'Enter');
  await page.fill('#taskInput', 'Task 2');
  await page.press('#taskInput', 'Enter');
  await page.fill('#taskInput', 'Task 3');
  await page.press('#taskInput', 'Enter');
  await expect(page.locator('.task-list li')).toHaveCount(3);
});

test('settings modal has correct ARIA attributes', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const modal = page.locator('#settingsModal .modal-content');
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
});

test('timer mode tabs have correct ARIA', async ({ page }) => {
  const focusTab = page.locator('button[data-mode="focus"]');
  const breakTab = page.locator('button[data-mode="break"]');
  await expect(focusTab).toHaveAttribute('aria-selected', 'true');
  await expect(breakTab).toHaveAttribute('aria-selected', 'false');
  await page.click('button[data-mode="break"]');
  await expect(breakTab).toHaveAttribute('aria-selected', 'true');
  await expect(focusTab).toHaveAttribute('aria-selected', 'false');
});

test('settings panels max-height allows scrolling', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const overflow = await page.locator('.settings-panels').evaluate(el => {
    const style = getComputedStyle(el);
    return style.overflowY;
  });
  expect(overflow).toBe('auto');
});

test('rating help tooltip toggles with aria-expanded', async ({ page }) => {
  await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    const ui = await import('./js/ui.js');
    state.pendingRating = true;
    ui.showRating();
  });
  const btn = page.locator('.rating-help');
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const tip = page.locator('#ratingHelpTip');
  await expect(tip).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
});

// ─── Headphone split button ────────────────────────────────────────────────

test('headphone toggle is visible in header', async ({ page }) => {
  await expect(page.locator('#beatsToggle')).toBeVisible();
});

test('chevron is visible next to headphone', async ({ page }) => {
  await expect(page.locator('#beatsChevron')).toBeVisible();
});

test('headphone toggle toggles beats on/off', async ({ page }) => {
  const toggle = page.locator('#beatsToggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('beats rebuild audio graph after the context is suspended in background', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let instances = [];
    let oscCount = 0;
    class FakeCtx {
      constructor() {
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = {};
        instances.push(this);
      }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createOscillator() {
        oscCount++;
        return { type: 'sine', frequency: { value: 0, linearRampToValueAtTime() {} }, connect() { return this; }, start() {}, stop() {}, disconnect() {} };
      }
      createStereoPanner() { return { pan: { value: 0 }, connect() { return this; } }; }
      createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} }; }
    }
    window.AudioContext = FakeCtx;
    const beats = await import('./js/beats.js');
    beats.start(200, 214, 0.5);
    const afterStart = oscCount;
    instances[instances.length - 1].state = 'suspended';
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 20));
    const afterVisible = oscCount;
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 20));
    const afterSecondEvent = oscCount;
    return { afterStart, rebuilt: afterVisible === afterStart + 2, noRebuildWhenRunning: afterSecondEvent === afterVisible };
  });
  expect(result.afterStart).toBe(2);
  expect(result.rebuilt).toBe(true);
  expect(result.noRebuildWhenRunning).toBe(true);
});

test('chevron opens/closes popover', async ({ page }) => {
  const chevron = page.locator('#beatsChevron');
  const popover = page.locator('#beatsPopover');
  await expect(popover).toHaveClass(/hidden/);
  await chevron.click();
  await expect(popover).not.toHaveClass(/hidden/);
  await chevron.click();
  await expect(popover).toHaveClass(/hidden/);
});

test('popover toggle switch syncs with headphone state', async ({ page }) => {
  const toggle = page.locator('#beatsToggle');
  const popoverToggle = page.locator('#beatsPopoverToggle');
  // Open popover first
  await page.locator('#beatsChevron').click();
  // Click headphone to turn on
  await toggle.click();
  await expect(popoverToggle).toBeChecked();
  // Click headphone to turn off
  await toggle.click();
  await expect(popoverToggle).not.toBeChecked();
});

test('beats tab no longer exists', async ({ page }) => {
  const beatsTab = page.locator('button[data-mode="beats"]');
  await expect(beatsTab).toHaveCount(0);
});

// ─── Beats auto-start visibility toggle ─────────────────────────────────────

test('beats auto-start toggle exists in Cards tab', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="cards"]');
  await expect(page.locator('#showBeatsAutoStart').locator('..')).toBeVisible();
});

test('hiding beats auto-start hides it in Audio tab', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Turn off visibility
  await page.click('.settings-tab-btn[data-settings-tab="cards"]');
  await page.locator('#showBeatsAutoStart').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
  // Check Audio tab - auto-start row should be hidden
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  const row = page.locator('#beatsAutoStart').locator('..');
  await expect(row).toBeHidden();
});

// ─── Beats preset selector ──────────────────────────────────────────────────

test('beats preset selector exists in Audio tab', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  const select = page.locator('#beatsPresetSelect');
  await expect(select).toBeVisible();
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBe(5);
});

test('changing beats preset updates frequencies', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  await page.selectOption('#beatsPresetSelect', 'alpha');
  await page.click('#settingsSaveBtn');
  const freqs = await page.evaluate(async () => {
    const { state } = await import('./js/state.js');
    return { left: state.settings.beatsLeftFreq, right: state.settings.beatsRightFreq };
  });
  expect(freqs.right - freqs.left).toBe(10); // Alpha = 10 Hz beat
});

// ─── Audio settings in Settings ─────────────────────────────────────────────

test('audio volume slider shows percentage', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  const label = page.locator('#beatsDefaultVolumeLabel');
  await expect(label).toHaveText('50%');
});

test('what are binaural beats link exists', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  const link = page.locator('a.field-hint-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://www.healthline.com/health/binaural-beats');
});

test('timer size uses CSS zoom property not transform', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.timer-size-btn[data-size="xl"]');
  await page.click('#settingsSaveBtn');
  const zoom = await page.locator('.timer-card').evaluate(el => el.style.zoom);
  const transform = await page.locator('.timer-card').evaluate(el => el.style.transform);
  expect(zoom).toBe('1.6');
  expect(transform).toBe('');
});

test('settings modal fits in viewport on small screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Use evaluate to switch tab since buttons may be hidden at small size
  await page.evaluate(() => {
    document.querySelector('[data-settings-panel="audio"]').classList.add('active');
    document.querySelector('[data-settings-panel="timer"]').classList.remove('active');
  });
  const overflows = await page.evaluate(() => {
    const modal = document.querySelector('.modal:not(.hidden) .modal-content');
    const rect = modal.getBoundingClientRect();
    return rect.top < 0 || rect.bottom > window.innerHeight;
  });
  expect(overflows).toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });
});

test('settings panels have max-height', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const maxHeight = await page.locator('.settings-panels').evaluate(el => {
    return getComputedStyle(el).maxHeight;
  });
  expect(maxHeight).not.toBe('none');
  expect(maxHeight).not.toBe('');
});

test('layout switch syncs active tab to top buttons', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Navigate to theme tab (layout picker lives here)
  const themeBtn = page.locator('.settings-tab-btn[data-settings-tab="theme"]').first();
  await themeBtn.click();
  // Select audio tab via sidebar first
  const audioSidebar = page.locator('.settings-tabs-sidebar .settings-tab-btn[data-settings-tab="audio"]');
  if (await audioSidebar.isVisible()) await audioSidebar.click();
  // Switch back to theme
  await themeBtn.click();
  // Switch to top layout
  await page.click('.layout-option[data-layout="top"]');
  // Check the active tab synced to top buttons
  const activeTopTab = page.locator('.settings-tabs-top .settings-tab-btn.active');
  await expect(activeTopTab).toHaveAttribute('data-settings-tab', 'theme');
  // Reset back to sidebar
  const sidebarBtn = page.locator('.layout-option[data-layout="sidebar"]');
  if (await sidebarBtn.isVisible()) await sidebarBtn.click();
});

test('layout switch syncs active tab to sidebar buttons', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Switch to theme tab and top layout
  const themeBtn = page.locator('.settings-tab-btn[data-settings-tab="theme"]').first();
  await themeBtn.click();
  await page.click('.layout-option[data-layout="top"]');
  // Switch to audio via top tabs
  await page.click('.settings-tabs-top .settings-tab-btn[data-settings-tab="audio"]');
  // Now both sidebar and top should have audio active
  const sidebarActive = page.locator('.settings-tabs-sidebar .settings-tab-btn.active');
  await expect(sidebarActive).toHaveAttribute('data-settings-tab', 'audio');
});

test('top tabs hidden in sidebar layout', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Ensure sidebar layout
  const sidebarLayoutBtn = page.locator('.layout-option[data-layout="sidebar"]');
  const themeBtn = page.locator('.settings-tab-btn[data-settings-tab="theme"]').first();
  await themeBtn.click();
  if (await sidebarLayoutBtn.isVisible()) await sidebarLayoutBtn.click();
  const topNavDisplay = await page.locator('.settings-tabs-top').evaluate(el => {
    return getComputedStyle(el).display;
  });
  expect(topNavDisplay).toBe('none');
});

test('sidebar hidden in top tabs layout', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Navigate to theme tab to access layout picker
  const themeBtn = page.locator('.settings-tab-btn[data-settings-tab="theme"]').first();
  await themeBtn.click();
  await page.click('.layout-option[data-layout="top"]');
  const sidebarDisplay = await page.locator('.settings-tabs-sidebar').evaluate(el => {
    return getComputedStyle(el).display;
  });
  expect(sidebarDisplay).toBe('none');
  // Reset back to sidebar
  await page.click('.layout-option[data-layout="sidebar"]');
});

test('warmup input respects min and max', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const min = await page.locator('#warmupInput').getAttribute('min');
  const max = await page.locator('#warmupInput').getAttribute('max');
  expect(min).toBe('1');
  expect(max).toBe('60');
});

test('break input respects min and max', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const min = await page.locator('#breakInput').getAttribute('min');
  const max = await page.locator('#breakInput').getAttribute('max');
  expect(min).toBe('1');
  expect(max).toBe('30');
});

test('default freq inputs have correct min and max', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  await page.click('.settings-tab-btn[data-settings-tab="audio"]');
  const leftMin = await page.locator('#beatsDefaultLeftFreq').getAttribute('min');
  const leftMax = await page.locator('#beatsDefaultLeftFreq').getAttribute('max');
  const rightMin = await page.locator('#beatsDefaultRightFreq').getAttribute('min');
  const rightMax = await page.locator('#beatsDefaultRightFreq').getAttribute('max');
  expect(leftMin).toBe('20');
  expect(leftMax).toBe('2000');
  expect(rightMin).toBe('20');
  expect(rightMax).toBe('2000');
});

test('settings scrollbar is visible when content overflows', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  // Switch to Audio tab which has enough content to overflow
  await page.click('[data-settings-tab="audio"]');
  await page.waitForTimeout(100);
  const overflowY = await page.locator('.settings-panels').evaluate(el => {
    return getComputedStyle(el).overflowY;
  });
  expect(overflowY).toBe('auto');
});

test('number inputs have no native spin buttons', async ({ page }) => {
  await page.click('#settingsBtn');
  await page.waitForSelector('#settingsModal:not(.hidden)', { state: 'visible' });
  const appearance = await page.locator('#warmupInput').evaluate(el => {
    return getComputedStyle(el).appearance;
  });
  expect(appearance).toBe('textfield');
});
