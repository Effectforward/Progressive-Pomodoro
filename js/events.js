// ─── Event Listeners ──────────────────────────────────────────────────────────
import { state } from './state.js';
import { saveSettings, saveTasks, saveTimerState, exportSettings, parseSettings, applySettings } from './storage.js';
import { setTheme, THEME_META } from './themes.js';
import {
  el, render, updateToggleBtn,
  hideDurationPicker,
  renderTasks,
  openSettings, closeSettings, populateSettingsForm,
  applyCardSettings, applyTimerSize, applySettingsLayout,
  activateSettingsTab, showToast,
  updateBeatsToggle, populateAudioSettings,
  updateBeatsAutoStartVisibility, updateBeatsPopoverActive,
  updateBeatsBeatDisplay,
  showBeatsPopover, hideBeatsPopover,
} from './ui.js';
import {
  toggleTimer, reset, start, stopTimer,
  submitRating, startNextFocus, takeBreakThenPick,
  restartProgression, doRestartProgression, clearHistory, doClearHistory
} from './timer.js';
import * as beats from './beats.js';

export function setupEventListeners() {
  // Timer controls
  el.toggleBtn?.addEventListener('click', toggleTimer);
  el.resetBtn?.addEventListener('click', reset);

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (document.body.classList.contains('decision-active')) return;
      const target = tab.dataset.mode;
      if (target === state.mode) return;

      if (state.rafId && (state.mode === 'focus' || state.mode === 'break')) {
        stopTimer();
      }

      state.mode = target;
      saveTimerState();

      if (target === 'break') {
        takeBreakThenPick();
      } else {
        hideDurationPicker();
        state.duration = state.nextFocusDuration;
        state.remaining = state.duration;
        state.remainingMs = state.duration * 1000;
      }

      updateToggleBtn();
      render();
    });
  });

  // Rating buttons
  document.querySelectorAll('[data-rating]').forEach(btn => {
    btn.addEventListener('click', () => {
      submitRating(btn.dataset.rating, false);
    });
  });

  // Rating help tooltip
  document.querySelector('.rating-help')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const tip = document.getElementById('ratingHelpTip');
    const btn = e.currentTarget;
    if (tip) {
      const expanded = !tip.hidden;
      tip.hidden = expanded;
      btn.setAttribute('aria-expanded', String(!expanded));
    }
  });

  // Duration picker
  el.pickerMinus?.addEventListener('click', () => {
    const v = parseInt(el.pickerMinutes?.value, 10) ?? 5;
    if (v > 1) el.pickerMinutes.value = v - 1;
  });
  el.pickerPlus?.addEventListener('click', () => {
    const v = parseInt(el.pickerMinutes?.value, 10) ?? 5;
    if (v < 180) el.pickerMinutes.value = v + 1;
  });
  document.querySelectorAll('#pickerPresets .preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.pickerMinutes.value = parseInt(chip.dataset.min, 10);
    });
  });
  el.pickerStartBtn?.addEventListener('click', () => {
    const mins = parseInt(el.pickerMinutes?.value, 10) ?? 5;
    startNextFocus(mins);
  });
  el.pickerBreakBtn?.addEventListener('click', () => {
    takeBreakThenPick();
  });

  // Restart banner
  el.restartBannerRestart?.addEventListener('click', () => {
    state.restartPrompt = false;
    doRestartProgression();
  });
  el.restartBannerContinue?.addEventListener('click', () => {
    state.restartPrompt = false;
    startNextFocus(state.lastSessionDuration || Math.round(state.settings.warmupDuration / 60));
  });

  // Auto restart settings toggle
  el.autoRestartSelect?.addEventListener('change', () => {
    const hint = document.getElementById('autoRestartHint');
    const isCustom = el.autoRestartSelect.value === 'custom';
    if (el.autoRestartCustom) el.autoRestartCustom.hidden = !isCustom;
    if (hint) hint.hidden = isCustom;
    if (isCustom) el.autoRestartCustom?.focus();
  });

  // Restart progression
  el.restartProgressionBtn?.addEventListener('click', restartProgression);
  document.getElementById('restartConfirmYes')?.addEventListener('click', doRestartProgression);
  document.getElementById('restartConfirmNo')?.addEventListener('click', () => {
    document.getElementById('restartConfirm')?.classList.add('hidden');
  });

  // Clear history
  el.clearHistoryBtn?.addEventListener('click', clearHistory);
  document.getElementById('clearConfirmYes')?.addEventListener('click', doClearHistory);
  document.getElementById('clearConfirmNo')?.addEventListener('click', () => {
    document.getElementById('clearConfirm')?.classList.add('hidden');
  });

  // Settings export / import
  el.exportSettingsBtn?.addEventListener('click', doExportSettings);
  el.importSettingsBtn?.addEventListener('click', () => el.importSettingsFile?.click());
  el.importSettingsFile?.addEventListener('change', onImportSettingsFile);
  el.importConfirmYes?.addEventListener('click', doImportSettings);
  el.importConfirmNo?.addEventListener('click', () => {
    el.importConfirm?.classList.add('hidden');
  });

  // Settings
  el.settingsBtn?.addEventListener('click', openSettings);
  el.settingsCloseBtn?.addEventListener('click', closeSettings);
  el.settingsModal?.addEventListener('click', (e) => {
    if (e.target === el.settingsModal) closeSettings();
  });
  el.settingsModal?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...el.settingsModal.querySelectorAll(
      'button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled]), select:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.offsetParent !== null);
    if (focusable.length < 1) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !el.settingsModal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !el.settingsModal.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });

  el.settingsForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettingsForm();
  });

  // Settings tabs (sidebar + top — unified selector)
  document.querySelectorAll('.settings-tab-btn[data-settings-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateSettingsTab(btn.dataset.settingsTab));
  });

  // Layout toggle in Appearance
  el.layoutPickerBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      applySettingsLayout(btn.dataset.layout);
    });
  });

  // Timer size presets (live preview)
  el.timerSizeGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('.timer-size-btn');
    if (!btn) return;
    const preset = btn.dataset.size;
    el.timerSizeGrid.querySelectorAll('.timer-size-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-checked', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-checked', 'true');
    applyTimerSize(preset);
  });

  // Beats preset select — sync frequencies
  el.beatsPresetSelect?.addEventListener('change', () => {
    const key = el.beatsPresetSelect.value;
    const p = beats.PRESETS[key];
    if (!p) return;
    state.settings.beatsPreset = key;
    state.settings.beatsLeftFreq = p.leftFreq;
    state.settings.beatsRightFreq = p.leftFreq + p.beatFreq;
    if (el.beatsDefaultLeftFreq) el.beatsDefaultLeftFreq.value = p.leftFreq;
    if (el.beatsDefaultRightFreq) el.beatsDefaultRightFreq.value = p.leftFreq + p.beatFreq;
    if (state.beatsActive) {
      beats.setFrequencies(state.settings.beatsLeftFreq, state.settings.beatsRightFreq);
    }
  });

  // Beats volume slider (live preview)
  el.beatsDefaultVolume?.addEventListener('input', () => {
    const vol = parseInt(el.beatsDefaultVolume.value, 10) / 100;
    if (el.beatsDefaultVolumeLabel) el.beatsDefaultVolumeLabel.textContent = el.beatsDefaultVolume.value + '%';
    if (state.beatsActive) beats.setVolume(vol);
  });

  // Beats frequency inputs (live preview)
  el.beatsDefaultLeftFreq?.addEventListener('change', () => {
    state.settings.beatsPreset = null;
    const left = parseInt(el.beatsDefaultLeftFreq.value, 10) || 340;
    const right = parseInt(el.beatsDefaultRightFreq.value, 10) || 380;
    if (state.beatsActive) beats.setFrequencies(left, right);
  });
  el.beatsDefaultRightFreq?.addEventListener('change', () => {
    state.settings.beatsPreset = null;
    const left = parseInt(el.beatsDefaultLeftFreq.value, 10) || 340;
    const right = parseInt(el.beatsDefaultRightFreq.value, 10) || 380;
    if (state.beatsActive) beats.setFrequencies(left, right);
  });

  // Show beats auto-start control
  el.showBeatsAutoStart?.addEventListener('change', () => {
    state.settings.showBeatsAutoStart = el.showBeatsAutoStart.checked;
    updateBeatsAutoStartVisibility();
    saveSettings();
  });

  // Theme picker grid (live preview)
  el.themePickerGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set-theme]');
    if (!btn) return;
    const themeKey = btn.dataset.setTheme;
    if (THEME_META[themeKey]) {
      setTheme(themeKey);
    }
  });

  // Headphone split button — toggle on/off
  el.beatsToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.beatsActive) {
      beats.stop();
      state.beatsActive = false;
      showToast('Binaural beats off');
    } else {
      const left = state.settings.beatsLeftFreq || 340;
      const right = state.settings.beatsRightFreq || 380;
      const vol = state.settings.beatsVolume || 0.5;
      beats.start(left, right, vol);
      state.beatsActive = true;
      showToast('Binaural beats on');
    }
    updateBeatsToggle();
    updateBeatsPopoverActive();
  });

  // Chevron — open/close popover
  el.beatsChevron?.addEventListener('click', (e) => {
    e.stopPropagation();
    const popover = el.beatsPopover;
    if (!popover) return;
    const isOpen = !popover.classList.contains('hidden');
    if (isOpen) {
      hideBeatsPopover();
    } else {
      updateBeatsToggle();
      updateBeatsPopoverActive();
      showBeatsPopover();
      if (el.beatsPopLeftFreq) el.beatsPopLeftFreq.value = state.settings.beatsLeftFreq || 340;
      if (el.beatsPopRightFreq) el.beatsPopRightFreq.value = state.settings.beatsRightFreq || 380;
      updateBeatsBeatDisplay();
    }
  });

  // Popover toggle switch
  el.beatsPopoverToggle?.addEventListener('change', () => {
    if (el.beatsPopoverToggle.checked) {
      const left = state.settings.beatsLeftFreq || 340;
      const right = state.settings.beatsRightFreq || 380;
      const vol = state.settings.beatsVolume || 0.5;
      beats.start(left, right, vol);
      state.beatsActive = true;
      showToast('Binaural beats on');
    } else {
      beats.stop();
      state.beatsActive = false;
      showToast('Binaural beats off');
    }
    updateBeatsToggle();
    updateBeatsPopoverActive();
  });

  // Beats popover preset selection
  el.beatsPopover?.addEventListener('click', (e) => {
    const item = e.target.closest('.beats-popover-item');
    if (!item) return;
    const preset = item.dataset.preset;
    const p = beats.PRESETS[preset];
    if (!p) return;
    const left = p.leftFreq;
    const right = p.leftFreq + p.beatFreq;
    const vol = state.settings.beatsVolume || 0.5;
    state.settings.beatsPreset = preset;
    state.settings.beatsLeftFreq = left;
    state.settings.beatsRightFreq = right;
    if (state.beatsActive) {
      beats.setFrequencies(left, right);
    } else {
      beats.start(left, right, vol);
      state.beatsActive = true;
      updateBeatsToggle();
    }
    saveSettings();
    updateBeatsPopoverActive();
    if (el.beatsPopLeftFreq) el.beatsPopLeftFreq.value = left;
    if (el.beatsPopRightFreq) el.beatsPopRightFreq.value = right;
    updateBeatsBeatDisplay();
  });

  // Custom freq inputs — live update when playing
  el.beatsPopLeftFreq?.addEventListener('input', () => {
    state.settings.beatsPreset = null;
    updateBeatsBeatDisplay();
    updateBeatsPopoverActive();
    if (state.beatsActive) {
      const left = parseInt(el.beatsPopLeftFreq.value, 10) || 340;
      const right = parseInt(el.beatsPopRightFreq?.value, 10) || 380;
      beats.setFrequencies(left, right);
    }
  });
  el.beatsPopRightFreq?.addEventListener('input', () => {
    state.settings.beatsPreset = null;
    updateBeatsBeatDisplay();
    updateBeatsPopoverActive();
    if (state.beatsActive) {
      const left = parseInt(el.beatsPopLeftFreq?.value, 10) || 340;
      const right = parseInt(el.beatsPopRightFreq.value, 10) || 380;
      beats.setFrequencies(left, right);
    }
  });

  // Save custom freqs on blur
  const saveCustomFreqs = () => {
    state.settings.beatsPreset = null;
      const left = parseInt(el.beatsPopLeftFreq?.value, 10) || 340;
      const right = parseInt(el.beatsPopRightFreq?.value, 10) || 380;
    state.settings.beatsLeftFreq = left;
    state.settings.beatsRightFreq = right;
    saveSettings();
  };
  el.beatsPopLeftFreq?.addEventListener('blur', saveCustomFreqs);
  el.beatsPopRightFreq?.addEventListener('blur', saveCustomFreqs);

  // Close popover on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.beats-split-wrap')) {
      hideBeatsPopover();
    }
  });

  // Tasks
  el.addTaskBtn?.addEventListener('click', addTask);
  el.taskInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (el.beatsPopover && !el.beatsPopover.classList.contains('hidden')) {
        hideBeatsPopover();
        return;
      }
      if (el.settingsModal && !el.settingsModal.classList.contains('hidden')) {
        closeSettings();
        return;
      }
      const onboarding = document.getElementById('onboardingOverlay');
      if (onboarding && !onboarding.classList.contains('hidden')) {
        onboarding.classList.add('hidden');
        return;
      }
      document.getElementById('restartConfirm')?.classList.add('hidden');
      document.getElementById('clearConfirm')?.classList.add('hidden');
      el.importConfirm?.classList.add('hidden');
    }
    if (el.settingsModal && !el.settingsModal.classList.contains('hidden')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (document.body.classList.contains('decision-active')) return;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleTimer();
    }
    if (e.key === 'r') {
      e.preventDefault();
      reset();
    }
  });

  // Scroll wheel on number inputs — only when hovered
  const hoveredInputs = new Set();
  document.addEventListener('pointerover', (e) => {
    if (e.target.matches?.('input[type="number"]')) hoveredInputs.add(e.target);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.matches?.('input[type="number"]')) hoveredInputs.delete(e.target);
  });
  document.addEventListener('wheel', (e) => {
    const input = e.target;
    if (!input.matches?.('input[type="number"]') || !hoveredInputs.has(input)) return;
    if (input.disabled || input.readOnly) return;
    e.preventDefault();
    const step = Number(input.step) || 1;
    const min = input.min !== '' ? Number(input.min) : -Infinity;
    const max = input.max !== '' ? Number(input.max) : Infinity;
    const val = Number(input.value) || 0;
    const dir = e.deltaY < 0 ? 1 : -1;
    const clamped = Math.min(max, Math.max(min, val + dir * step));
    input.value = clamped;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { passive: false });
}

// ─── Settings Form ──────────────────────────────────────────────────────────

export function saveSettingsForm() {
    const warmupMin = Math.min(60, Math.max(1, parseInt(el.warmupInput?.value, 10) ?? 2));
    const breakMin = Math.min(30, Math.max(1, parseInt(el.breakInput?.value, 10) ?? 5));

  state.settings.warmupDuration = warmupMin * 60;
  state.settings.shortBreak = breakMin * 60;

  if (el.autoRestartSelect) {
    if (el.autoRestartSelect.value === 'custom') {
      state.settings.autoRestartMinutes = Math.max(1, parseInt(el.autoRestartCustom?.value, 10) ?? 1);
    } else {
      state.settings.autoRestartMinutes = parseInt(el.autoRestartSelect.value, 10);
    }
  }

  // Timer size preset
  const activeSizeBtn = document.querySelector('.timer-size-btn.active');
  state.settings.timerSize = activeSizeBtn?.dataset.size || 'regular';

  // GitHub visibility
  state.settings.githubVisible = el.githubVisible?.checked !== false;

  // Settings layout
  const activeLayoutBtn = document.querySelector('.layout-option.active');
  state.settings.settingsLayout = activeLayoutBtn?.dataset.layout || 'sidebar';

  // Mobile: force fixed timer size and top tabs layout
  if (window.matchMedia('(max-width: 600px)').matches) {
    state.settings.timerSize = 'regular';
    state.settings.settingsLayout = 'top';
  }

  // Card customization
  state.settings.tasksCardVisible   = el.tasksCardVisible?.checked !== false;
  state.settings.historyCardVisible = el.historyCardVisible?.checked !== false;
  state.settings.showBeatsAutoStart = el.showBeatsAutoStart?.checked !== false;

  // Audio settings
  state.settings.beatsAutoStart = el.beatsAutoStart?.checked === true;
  if (state.settings.beatsPreset) {
    const p = beats.PRESETS[state.settings.beatsPreset];
    if (p) {
      state.settings.beatsLeftFreq = p.leftFreq;
      state.settings.beatsRightFreq = p.leftFreq + p.beatFreq;
    }
  } else {
    const leftFreq = parseInt(el.beatsDefaultLeftFreq?.value, 10);
    const rightFreq = parseInt(el.beatsDefaultRightFreq?.value, 10);
    if (!isNaN(leftFreq) && !isNaN(rightFreq) && rightFreq > leftFreq) {
      state.settings.beatsLeftFreq = leftFreq;
      state.settings.beatsRightFreq = rightFreq;
    }
  }
  state.settings.beatsVolume = (parseInt(el.beatsDefaultVolume?.value, 10) ?? 50) / 100;

  saveSettings();
  applyCardSettings();
  applyTimerSize(state.settings.timerSize);

  // If the timer is idle, apply the correct duration.
  if (!state.rafId) {
    const dur = state.settings.warmupDuration;
    state.nextFocusDuration = dur;
    state.duration = dur;
    state.remaining = dur;
    state.remainingMs = dur * 1000;
    saveTimerState();
    render();
  }

  closeSettings();
  showToast('Settings saved');
}

// ─── Settings export / import ────────────────────────────────────────────────

function doExportSettings() {
  const blob = new Blob([exportSettings()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `progressive-pomodoro-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Settings exported');
}

let _pendingImport = null;

function onImportSettingsFile() {
  const file = el.importSettingsFile?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = parseSettings(String(reader.result ?? ''));
    if (!data) {
      showToast("That doesn't look like a settings file.");
      return;
    }
    _pendingImport = data;
    el.importConfirm?.classList.remove('hidden');
  };
  reader.onerror = () => showToast("Couldn't read that file.");
  reader.readAsText(file);
}

function doImportSettings() {
  el.importConfirm?.classList.add('hidden');
  const data = _pendingImport;
  _pendingImport = null;
  if (!data) return;
  applySettings(data);
  populateSettingsForm();
  populateAudioSettings();
  updateBeatsAutoStartVisibility();
  applyCardSettings();
  applyTimerSize(state.settings.timerSize || 'regular');
  if (data.theme) setTheme(data.theme);
  if (!state.rafId) {
    const dur = state.settings.warmupDuration;
    state.nextFocusDuration = dur;
    state.duration = dur;
    state.remaining = dur;
    state.remainingMs = dur * 1000;
    saveTimerState();
    render();
  }
  if (el.importSettingsFile) el.importSettingsFile.value = '';
  showToast('Settings imported');
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

function addTask() {
  const input = el.taskInput;
  const text = input?.value?.trim();
  if (!text) return;

  state.tasks.push({
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text,
    completed: false,
    active: false,
    createdAt: new Date().toISOString(),
  });

  saveTasks();
  renderTasks();
  input.value = '';
  input.focus();
}
