import { state } from './state.js';
import { saveTimerState, saveSessions } from './storage.js';
import { 
  render, updateToggleBtn,
  showRating, hideRating, showDurationPicker, hideDurationPicker,
  renderSessions, showToast, updateBeatsToggle,
} from './ui.js';
import * as beats from './beats.js';
import { playAlarm } from './sounds.js';

export function toggleTimer() {
  if (document.body.classList.contains('decision-active')) return;
  if (state.pendingRating) return;
  if (state.rafId) pause(); else start();
}

export function start() {
  if (state.rafId) return;
  if (state.remainingMs <= 0) {
    if (state.remaining > 0) {
      state.remainingMs = state.remaining * 1000;
    } else {
      return;
    }
  }
  state.endAt = Date.now() + state.remainingMs;
  state.rafId = requestAnimationFrame(rafTick);

  // Ask up front so the first completion isn't blocked by a late permission prompt.
  requestNotificationPermission();
  // Background fallback: rAF stops when the tab is hidden, so anchor a timeout
  // to the wall-clock end to fire completion on time while the app is alive.
  scheduleNotify();

  // A session is starting — the idle restart reminder no longer applies.
  state.restartPrompt = false;
  
  // Start binaural beats if enabled and in focus mode
  if (state.mode === 'focus' && state.settings.beatsAutoStart && !state.beatsActive) {
    const left = state.settings.beatsLeftFreq || 340;
    const right = state.settings.beatsRightFreq || 380;
    const vol = state.settings.beatsVolume || 0.5;
    beats.start(left, right, vol);
    state.beatsActive = true;
    const match = Object.values(beats.PRESETS).find(p => p.leftFreq === left && (p.leftFreq + p.beatFreq) === right);
    showToast(match ? `Binaural beats on · ${match.label}` : 'Binaural beats on');
  }
  
  saveTimerState();
  updateToggleBtn();
}

function clearNotifyTimer() {
  if (state.notifyTimer) {
    clearTimeout(state.notifyTimer);
    state.notifyTimer = null;
  }
}

function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (e) { /* notifications unavailable */ }
}

// Fire completion from a wall-clock timeout so the session ends on time even
// when the tab is hidden (rAF is throttled/stopped in the background).
function scheduleNotify() {
  clearNotifyTimer();
  if (!state.endAt) return;
  const delay = Math.max(0, state.endAt - Date.now());
  state.notifyTimer = setTimeout(() => {
    state.notifyTimer = null;
    // While visible, rAF owns completion — don't double-handle.
    if (state.rafId && !document.hidden) return;
    if (state.endAt && state.endAt > Date.now()) { scheduleNotify(); return; }
    onTimerComplete();
  }, delay);
}

export function pause() {
  if (!state.rafId) return;
  clearNotifyTimer();
  state.remainingMs = Math.max(0, state.endAt - Date.now());
  state.remaining = Math.ceil(state.remainingMs / 1000);
  state.endAt = null;
  cancelAnimationFrame(state.rafId);
  state.rafId = null;
  
  // Pause binaural beats
  if (state.beatsActive) {
    beats.stop();
    state.beatsActive = false;
    updateBeatsToggle();
  }
  
  saveTimerState();
  render();
  updateToggleBtn();
}

function announce(msg) {
  const node = document.getElementById('srStatus');
  if (node) node.textContent = msg;
}

export function reset() {
  if (document.body.classList.contains('decision-active')) return;
  if (state.pendingRating) return;
  clearNotifyTimer();
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  state.endAt = null;
  state.remainingMs = state.duration * 1000;
  state.remaining = state.duration;
  
  // Stop binaural beats
  if (state.beatsActive) {
    beats.stop();
    state.beatsActive = false;
    updateBeatsToggle();
  }
  
  hideRating();
  hideDurationPicker();
  saveTimerState();
  updateToggleBtn();
  render();
}

export function stopTimer() {
  clearNotifyTimer();
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  state.endAt = null;
  saveTimerState();
}

function rafTick() {
  const now = Date.now();
  state.remainingMs = Math.max(0, state.endAt - now);
  state.remaining = Math.ceil(state.remainingMs / 1000);
  render();
  if (state.remainingMs <= 0) {
    stopTimer();
    onTimerComplete();
  } else {
    state.rafId = requestAnimationFrame(rafTick);
  }
}

// Recalibrate on tab focus — re-anchor from wall clock so background
// tab throttling never causes drift.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.rafId && state.endAt) {
    cancelAnimationFrame(state.rafId);
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    state.remaining = Math.ceil(state.remainingMs / 1000);
    if (state.remainingMs <= 0) {
      stopTimer();
      onTimerComplete();
    } else {
      state.rafId = requestAnimationFrame(rafTick);
    }
    render();
  }
});

export function onTimerComplete() {
  clearNotifyTimer();
  updateToggleBtn();
  try {
    playAlarm(state.settings.alarmSound || 'chord');
  } catch (e) { showToast('Sound unavailable on this device.'); }
  notifyComplete();
  
  // Stop binaural beats on session complete
  if (state.beatsActive) {
    beats.stop();
    state.beatsActive = false;
    updateBeatsToggle();
  }
  
  if (state.mode === 'focus') {
    const s = { rating: null, auto: false, length: state.duration, timestamp: new Date().toISOString() };
    const firstSession = !state.sessions || state.sessions.length === 0;
    state.sessions.unshift(s);
    if (state.sessions.length > 200) state.sessions.length = 200;
    state.pendingRating = true;
    saveSessions();
    saveTimerState();
    renderSessions();
    if (firstSession) document.body.classList.remove('no-sessions');
    announce('Focus session complete. Rate your focus to continue.');
    showRating();
  } else {
    state.mode = 'focus';
    saveTimerState();
    announce('Break complete. Choose your next focus length.');
    render();
    const suggested = Math.round(state.nextFocusDuration / 60);
    showDurationPicker(suggested, false);
  }
}

export function submitRating(rating, auto = false) {
   if (state.rafId) return;
   if (!state.pendingRating) return;
   hideRating();
  state.pendingRating = false;
  // Update the auto-saved session with the rating
  if (state.sessions && state.sessions.length > 0) {
    state.sessions[0].rating = rating;
    state.sessions[0].ratingScore = ({flow:3,focused:2,good:1,distracted:0}[rating] || 1);
  }
  saveSessions();
  renderSessions();
  afterRating(rating);
}

function afterRating(rating) {
  const minutes = Math.round(state.duration / 60);
  let suggested;
  let showBreak;
  
  switch (rating) {
    case 'flow':
      suggested = minutes + 12;
      showBreak = false;
      break;
    case 'focused':
      suggested = minutes + 7;
      showBreak = true;
      break;
    case 'good':
      suggested = minutes + 5;
      showBreak = true;
      break;
    case 'distracted':
      suggested = Math.max(2, minutes - 3);
      showBreak = true;
      break;
    default:
      suggested = minutes;
      showBreak = true;
  }
  
  state.nextFocusDuration = suggested * 60;
  saveTimerState();
  showDurationPicker(suggested, showBreak);
}

export function startNextFocus(minutes) {
   if (state.pendingRating) return;
   hideDurationPicker();
   const clamped = Math.max(1, Math.min(180, Math.round(minutes)));
   state.duration = clamped * 60;
  state.remaining = state.duration;
  state.remainingMs = state.duration * 1000;
  state.nextFocusDuration = state.duration;
  state.mode = 'focus';
  saveTimerState();
  start();
  render();
}

export function takeBreakThenPick() {
  hideDurationPicker();
  state.duration = state.settings.shortBreak || 5 * 60;
  state.remaining = state.duration;
  state.remainingMs = state.remaining * 1000;
  state.mode = 'break';
  saveTimerState();
  updateToggleBtn();
  render();
}

function closeAllPanels() {
  document.getElementById('restartConfirm')?.classList.add('hidden');
  document.getElementById('clearConfirm')?.classList.add('hidden');
}

export function restartProgression() {
  const panel = document.getElementById('restartConfirm');
  const wasHidden = panel?.classList.contains('hidden');
  closeAllPanels();
  if (wasHidden) panel?.classList.remove('hidden');
}

export function doRestartProgression() {
  closeAllPanels();
  state.nextFocusDuration = state.settings.warmupDuration;
  clearNotifyTimer();

  // Stop any running timer regardless of mode.
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  state.endAt = null;

  // Stop binaural beats
  if (state.beatsActive) {
    beats.stop();
    state.beatsActive = false;
    updateBeatsToggle();
  }

  // Switch back to focus mode with the appropriate duration.
  state.mode = 'focus';
  state.duration = state.nextFocusDuration;
  state.remaining = state.duration;
  state.remainingMs = state.duration * 1000;

  state.pendingRating = false;
  saveTimerState();
  hideRating();
  hideDurationPicker();
  updateToggleBtn();
  render();
}

export function clearHistory() {
  const panel = document.getElementById('clearConfirm');
  const wasHidden = panel?.classList.contains('hidden');
  closeAllPanels();
  if (wasHidden) panel?.classList.remove('hidden');
}

export function doClearHistory() {
  closeAllPanels();
  state.pendingRating = false;
  hideRating();
  state.sessions = [];
  saveSessions();
  renderSessions();
}

// ─── Alarm + notification ──────────────────────────────────────────────────

export function notifyComplete() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body: 'Rate your focus, then tap to continue', silent: true };
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification('Session complete', options));
    } else {
      new Notification('Session complete', options);
    }
  } catch (e) { /* notifications unavailable */ }
}
