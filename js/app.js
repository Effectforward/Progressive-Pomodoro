// Main entry point — imports all modules and initializes the app
import { state } from './state.js';
import {
  loadSettings, saveSettings,
  loadSessions,
  loadTasks,
  loadTimerState,
  isOnboardingDismissed, dismissOnboarding
} from './storage.js';
import { initTheme, setTheme } from './themes.js';
import {
  el, render, updateToggleBtn,
  showRating, renderSessions, renderTasks,
  applyCardSettings, applyTimerSize,
  populateSettingsForm,
} from './ui.js';
import { start, onTimerComplete } from './timer.js';
import { setupEventListeners } from './events.js';

// ─── Initialization ──────────────────────────────────────────────────────────

function init() {
  loadSettings();
  loadSessions();
  loadTasks();
  initTheme();

  const { resumed, expired } = loadTimerState();

  if (resumed && !expired && state.remainingMs > 0) {
    start();
  } else if (state.pendingRating) {
    showRating();
    render();
  } else if (expired || state.remainingMs <= 0) {
    onTimerComplete();
  }

  if (!resumed) checkAutoRestart();

  render();
  updateToggleBtn();
  renderSessions();
  renderTasks();
  applyCardSettings();
  applyTimerSize(state.settings.timerSize || 'regular');

  if (el.pickerMinutes) {
    el.pickerMinutes.value = Math.round(state.settings.warmupDuration / 60);
  }

  const onboarding = document.getElementById('onboardingOverlay');
  if (onboarding && !isOnboardingDismissed()) {
    onboarding.classList.remove('hidden');
    document.getElementById('onboardingDismiss').addEventListener('click', () => {
      dismissOnboarding();
      onboarding.classList.add('hidden');
    }, { once: true });
  }

  setupEventListeners();

  window.addEventListener('storage', handleStorageChange);

  try {
    const k = '__pp_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (e) {
    const note = document.createElement('div');
    note.className = 'storage-note';
    note.setAttribute('role', 'alert');
    note.textContent = 'Heads up: this browser is blocking local storage, so your sessions and settings will not be saved.';
    document.body.prepend(note);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ─── Auto-restart detection ─────────────────────────────────────────────────

function checkAutoRestart() {
  const autoMinutes = state.settings.autoRestartMinutes;
  if (autoMinutes > 0 && state.sessions && state.sessions.length > 0) {
    const lastSession = state.sessions[0];
    if (lastSession && lastSession.timestamp) {
      const elapsed = (Date.now() - new Date(lastSession.timestamp).getTime()) / 60000;
      if (elapsed >= autoMinutes) {
        state.restartPrompt = true;
        state.lastSessionDuration = Math.round(lastSession.length / 60);
      }
    }
  }
}

// ─── Cross-tab sync ────────────────────────────────────────────────────────

function handleStorageChange(e) {
  if (e.key === 'pp_sessions_v1') {
    loadSessions();
    renderSessions();
  }
  if (e.key === 'pp_tasks_v1') {
    loadTasks();
    renderTasks();
  }
  if (e.key === 'pp_settings_v1') {
     loadSettings();
     populateSettingsForm();
     applyCardSettings();
     applyTimerSize(state.settings.timerSize || 'regular');
     if (!state.rafId) {
       const dur = state.settings.warmupDuration;
       state.nextFocusDuration = dur;
       state.duration = dur;
       state.remaining = dur;
       state.remainingMs = dur * 1000;
     }
   }
  if (e.key === 'pp_theme_v1') {
    const raw = localStorage.getItem('pp_theme_v1');
    if (raw) setTheme(raw);
  }
  if (e.key === 'pp_state_v1') {
    loadTimerState();
    render();
    updateToggleBtn();
  }
}

// ─── Start the app ─────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
