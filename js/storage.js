// Pure persistence layer. These functions only read/write localStorage
// and mutate `state` — they never touch the DOM. Callers are responsible
// for re-rendering after a load/save if needed.

import { state, STORAGE_KEYS, DEFAULT_SETTINGS } from './state.js';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    state.settings = raw
      ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw))
      : Object.assign({}, DEFAULT_SETTINGS);
  } catch (e) {
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
  }
}

export function saveSettings() {
   try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings)); }
   catch (e) { console.warn('progPomo: settings not saved — localStorage full?', e); }
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessions);
    state.sessions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.sessions = [];
  }
}

export function saveSessions() {
  try { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions)); }
  catch (e) { console.warn('progPomo: sessions not saved — localStorage full?', e); }
}

export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tasks);
    state.tasks = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.tasks = [];
  }
}

export function saveTasks() {
  try { localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks)); }
  catch (e) { console.warn('progPomo: tasks not saved — localStorage full?', e); }
}

// Loads persisted timer state into `state`. Returns true if a running
// timer was resumed (so the caller knows whether to kick off the RAF loop).
export function loadTimerState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (!raw) {
      state.remaining = state.duration;
      state.remainingMs = state.duration * 1000;
      return { resumed: false };
    }
    const st = JSON.parse(raw);
    state.duration = st.duration || state.settings.warmupDuration;
    state.remaining = st.remaining != null ? st.remaining : state.duration;
    state.remainingMs = state.remaining * 1000;
    state.nextFocusDuration = st.nextFocusDuration || state.settings.warmupDuration;
    if (st.mode) state.mode = st.mode;
    if (st.pendingRating) state.pendingRating = true;

    if (st.isRunning && st.endAt) {
      state.endAt = st.endAt;
      state.remainingMs = Math.max(0, state.endAt - Date.now());
      state.remaining = Math.ceil(state.remainingMs / 1000);
      return { resumed: true, expired: state.remainingMs <= 0 };
    }
    return { resumed: false };
  } catch (e) {
    state.remaining = state.duration;
    state.remainingMs = state.duration * 1000;
    return { resumed: false };
  }
}

export function saveTimerState() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify({
      duration: state.duration,
      remaining: state.remaining,
      nextFocusDuration: state.nextFocusDuration,
      endAt: state.endAt,
      isRunning: !!state.rafId && !!state.endAt,
      mode: state.mode,
      pendingRating: state.pendingRating,
    }));
  } catch (e) { console.warn('progPomo: timer state not saved — localStorage full?', e); }
}

export function loadThemeName() {
  try {
    const t = localStorage.getItem(STORAGE_KEYS.theme);
    if (t) {
      state.theme = t;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      state.theme = 'dark';
    }
  } catch (e) { /* ignore */ }
}

export function saveThemeName(themeKey) {
  try { localStorage.setItem(STORAGE_KEYS.theme, themeKey); }
  catch (e) { console.warn('progPomo: theme not saved — localStorage full?', e); }
}

// ─── Settings export / import (pure helpers, DOM-free) ───────────────────────
// parseSettings validates without mutating state so callers can gate on it
// (e.g. show a confirm panel) before applySettings commits.

export function exportSettings() {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in state.settings) clean[key] = state.settings[key];
  }
  return JSON.stringify({ settings: clean, theme: state.theme }, null, 2);
}

export function parseSettings(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      settings: typeof parsed.settings === 'object' && parsed.settings !== null ? parsed.settings : {},
      theme: typeof parsed.theme === 'string' ? parsed.theme : null,
    };
  } catch (e) { return null; }
}

export function applySettings(data) {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in data.settings) clean[key] = data.settings[key];
  }
  state.settings = Object.assign({}, DEFAULT_SETTINGS, clean);
  saveSettings();
  if (data.theme) {
    state.theme = data.theme;
    saveThemeName(data.theme);
  }
}

export function isOnboardingDismissed() {
  return !!localStorage.getItem('pp_onboarding_dismissed');
}
export function dismissOnboarding() {
  try { localStorage.setItem('pp_onboarding_dismissed', '1'); }
  catch (e) { console.warn('progPomo: onboarding dismiss not saved — localStorage full?', e); }
}
