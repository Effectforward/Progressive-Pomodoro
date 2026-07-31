import { state } from './state.js';
import { saveTasks, saveSettings } from './storage.js';

export const el = {
  time: document.getElementById('time'),
  toggleBtn: document.getElementById('toggleBtn'),
  resetBtn: document.getElementById('resetBtn'),
  rating: document.getElementById('rating'),
  sessionList: document.getElementById('sessionList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  exportSettingsBtn: document.getElementById('exportSettingsBtn'),
  importSettingsBtn: document.getElementById('importSettingsBtn'),
  importSettingsFile: document.getElementById('importSettingsFile'),
  importConfirm: document.getElementById('importConfirm'),
  importConfirmYes: document.getElementById('importConfirmYes'),
  importConfirmNo: document.getElementById('importConfirmNo'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  settingsForm: document.getElementById('settingsForm'),
  warmupInput: document.getElementById('warmupInput'),
  breakInput: document.getElementById('breakInput'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  taskInput: document.getElementById('taskInput'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  taskList: document.getElementById('taskList'),
  ring: document.querySelector('.ring'),
  durationPicker: document.getElementById('durationPicker'),
  pickerMinus: document.getElementById('pickerMinus'),
  pickerPlus: document.getElementById('pickerPlus'),
  pickerMinutes: document.getElementById('pickerMinutes'),
  pickerStartBtn: document.getElementById('pickerStartBtn'),
  pickerBreakBtn: document.getElementById('pickerBreakBtn'),
  restartProgressionBtn: document.getElementById('restartProgressionBtn'),
  progressionLevel: document.getElementById('progressionHint'),
  restartBanner: document.getElementById('restartBanner'),
  restartBannerRestart: document.getElementById('restartBannerRestart'),
  restartBannerContinue: document.getElementById('restartBannerContinue'),
  lastSessionDurationDisplay: document.getElementById('lastSessionDurationDisplay'),
  autoRestartSelect: document.getElementById('autoRestartSelect'),
  autoRestartCustom: document.getElementById('autoRestartCustom'),
  // Card customization
  tasksCard: document.getElementById('tasksCard'),
  historyCard: document.getElementById('historyCard'),
  tasksCardVisible: document.getElementById('tasksCardVisible'),
  historyCardVisible: document.getElementById('historyCardVisible'),
  showBeatsAutoStart: document.getElementById('showBeatsAutoStart'),
  // Settings tabs
  settingsBody: document.querySelector('.settings-body'),
  settingsTabsSidebar: document.querySelectorAll('.settings-tabs-sidebar .settings-tab-btn[data-settings-tab]'),
  settingsTabsTop: document.querySelectorAll('.settings-tabs-top .settings-tab-btn[data-settings-tab]'),
  settingsPanels: document.querySelectorAll('.settings-panel'),
  // Theme settings
  themePickerGrid: document.getElementById('themePickerGrid'),
  timerSizeGrid: document.getElementById('timerSizeGrid'),
  layoutPickerBtns: document.querySelectorAll('.layout-option'),

  githubVisible: document.getElementById('githubVisible'),
  // Timer card (for size transform)
  timerCard: document.querySelector('.timer-card'),
  // Binaural beats
  timerDisplay: document.getElementById('timerDisplay'),
  beatsToggle: document.getElementById('beatsToggle'),
  beatsChevron: document.getElementById('beatsChevron'),
  beatsPopover: document.getElementById('beatsPopover'),
  beatsPopoverToggle: document.getElementById('beatsPopoverToggle'),
  beatsPopLeftFreq: document.getElementById('beatsPopLeftFreq'),
  beatsPopRightFreq: document.getElementById('beatsPopRightFreq'),
  beatsPopBeatFreq: document.getElementById('beatsPopBeatFreq'),
  beatsAutoStart: document.getElementById('beatsAutoStart'),
  beatsPresetSelect: document.getElementById('beatsPresetSelect'),
  beatsDefaultLeftFreq: document.getElementById('beatsDefaultLeftFreq'),
  beatsDefaultRightFreq: document.getElementById('beatsDefaultRightFreq'),
  beatsDefaultVolume: document.getElementById('beatsDefaultVolume'),
  beatsDefaultVolumeLabel: document.getElementById('beatsDefaultVolumeLabel'),
};

export function formatTime(s) {
  s = Math.max(0, Math.floor(s));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function render() {
  const timeStr = formatTime(state.remaining);
  el.time.textContent = timeStr;
  document.title = `${timeStr} - Progressive Pomodoro`;
  document.body.dataset.mode = state.mode;

  if (el.ring) {
    const progress = state.duration > 0 ? state.remaining / state.duration : 0;
    const offset = 326.7 - (progress * 326.7);
    el.ring.style.strokeDashoffset = offset;
  }

  const ringWrap = document.querySelector('.ring-wrap');
  if (ringWrap) {
    ringWrap.classList.toggle('running', !!state.rafId);
  }

  // Show/hide restart banner
  if (el.restartBanner) {
    const show = state.restartPrompt && !state.rafId;
    el.restartBanner.classList.toggle('hidden', !show);
  }
  if (el.lastSessionDurationDisplay && state.lastSessionDuration) {
    el.lastSessionDurationDisplay.textContent = state.lastSessionDuration;
  }

  updateModeTabs();
  updateProgressionLevel();
}

function updateProgressionLevel() {
  const el_ = el.progressionLevel;
  if (!el_) return;
  if (state.rafId || state.sessions.length > 0) {
    el_.classList.add('hidden');
    return;
  }
  el_.classList.remove('hidden');
  el_.textContent = 'Focus time grows as you rate your sessions';
}

export function updateModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  tabs.forEach(tab => {
    const active = tab.dataset.mode === state.mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const list = document.querySelector('.mode-tabs');
  if (list) list.setAttribute('role', 'tablist');
  tabs.forEach(tab => tab.setAttribute('role', 'tab'));
}

export function updateToggleBtn() {
  if (!el.toggleBtn) return;
  const icon = el.toggleBtn.querySelector('i');
  // Remove old text nodes (keep icon)
  el.toggleBtn.childNodes.forEach(n => { if (n.nodeType === 3) n.remove(); });
  if (icon) icon.className = state.rafId ? 'ph-fill ph-pause' : 'ph-fill ph-play';
  el.toggleBtn.append(state.rafId ? ' Pause' : ' Start');
}

export function showRating() {
  el.rating.classList.remove('hidden');
  document.body.classList.add('decision-active');
}

export function hideRating() {
  el.rating.classList.add('hidden');
  if (el.durationPicker?.classList.contains('hidden')) {
    document.body.classList.remove('decision-active');
  }
}

export function showDurationPicker(suggestedMinutes, showBreakOption) {
  if (!el.durationPicker) return;
  const mins = Math.max(1, Math.min(180, Math.round(suggestedMinutes)));
  el.pickerMinutes.value = mins;
  el.pickerBreakBtn.style.display = showBreakOption ? '' : 'none';
  el.durationPicker.classList.remove('hidden');
  document.body.classList.add('decision-active');
}

export function hideDurationPicker() {
  if (!el.durationPicker) return;
  el.durationPicker.classList.add('hidden');
  if (el.rating?.classList.contains('hidden')) {
    document.body.classList.remove('decision-active');
  }
}

const RATING_ICONS = {
  flow: '<i class="ph-fill ph-fire" style="color: var(--accent);"></i>',
  focused: '<i class="ph-fill ph-target" style="color: var(--text);"></i>',
  good: '<i class="ph-fill ph-thumbs-up" style="color: var(--text);"></i>',
  distracted: '<i class="ph-fill ph-cloud-fog" style="color: var(--muted);"></i>',
};

const RATING_LABELS = { flow: 'Flow', focused: 'Focused', good: 'Fine', distracted: 'Distracted' };

export function renderSessions() {
  if (!el.sessionList) return;
  el.sessionList.innerHTML = '';
  // Single source of truth: any session lifts the first-run disclosure.
  if (state.sessions && state.sessions.length > 0) {
    document.body.classList.remove('no-sessions');
  }
  if (!state.sessions || state.sessions.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = '<i class="ph ph-clock-counter-clockwise" style="font-size:24px;color:var(--muted);opacity:0.5;"></i><span>No sessions yet</span><span class="empty-hint">Complete a session to see it here</span>';
    el.sessionList.appendChild(li);
    return;
  }

  const dateOpts = { hour: 'numeric', minute: '2-digit' };
  state.sessions.forEach((s, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const left = document.createElement('div');
    const right = document.createElement('div');

    const icon = RATING_ICONS[s.rating] || '';
    const ratingLabel = RATING_LABELS[s.rating] || s.rating || 'Pending';
    left.className = 'session-left';
    left.innerHTML = `<div class="session-rating">${icon} ${ratingLabel}</div><div class="session-meta">${Math.round(s.length / 60)} min focus • ${new Date(s.timestamp).toLocaleTimeString([], dateOpts)}</div>`;

    if (s.auto) right.innerHTML = `<span class="session-badge">Auto</span>`;

    li.appendChild(left);
    li.appendChild(right);
    el.sessionList.appendChild(li);
  });
}

export function renderTasks() {
  if (!el.taskList) return;
  el.taskList.innerHTML = '';
  const count = document.getElementById('taskCount');
  if (count) {
    const active = state.tasks.filter(t => !t.completed).length;
    count.textContent = state.tasks.length ? active + ' left' : '';
  }
  if (!state.tasks.length) {
    // If input is already visible (empty class removed), don't re-show dashed button
    if (!el.tasksCard?.classList.contains('empty')) return;
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.innerHTML = '<button class="add-task-btn"><i class="ph ph-plus-circle"></i> Add a task</button>';
    li.querySelector('button')?.addEventListener('click', () => {
      el.tasksCard?.classList.remove('empty');
      el.taskInput?.focus();
    });
    el.taskList.appendChild(li);
    return;
  }
  el.tasksCard?.classList.remove('empty');
  state.tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.style.setProperty('--i', i);
    // BUGFIX: previously "set active" wrote into #sessionInfo.textContent,
    // which destroyed the session-count/level badges permanently. Now it
    // just highlights the active row instead.
    if (t.active) li.classList.add('active');

    const left = document.createElement('div');
    left.className = 'task-item-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!t.completed;
    cb.addEventListener('change', () => { t.completed = cb.checked; saveTasks(); renderTasks(); });
    const span = document.createElement('div');
    span.className = 'task-text';
    span.textContent = t.text;
    left.appendChild(cb);
    left.appendChild(span);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const del = document.createElement('button');
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Delete task');
    del.addEventListener('click', () => {
      state.tasks = state.tasks.filter(x => x.id !== t.id);
      saveTasks();
      renderTasks();
      showToast('Task deleted · Undo', { undo: true });
      const toastEl = document.getElementById('toast');
      if (toastEl) {
        let undone = false;
        const undoBtn = document.createElement('button');
        undoBtn.textContent = 'Undo';
        undoBtn.className = 'toast-undo';
        undoBtn.addEventListener('click', () => {
          undone = true;
          state.tasks.splice(i, 0, t);
          saveTasks();
          renderTasks();
          toastEl.hidden = true;
          _toastHasUndo = false;
        });
        toastEl.appendChild(undoBtn);
        setTimeout(() => { if (!undone && undoBtn.parentNode) { undoBtn.remove(); _toastHasUndo = false; } }, 3000);
      }
    });
    actions.appendChild(del);
    li.appendChild(left);
    li.appendChild(actions);
    el.taskList.appendChild(li);
  });
}

let _savedFocus = null;

export function openSettings() {
   if (!el.settingsModal) return;
   populateSettingsForm();
   _savedFocus = document.activeElement;
   el.settingsModal.classList.remove('hidden');
   el.settingsModal.setAttribute('aria-hidden', 'false');
   el.settingsCloseBtn?.focus();
   document.body.style.overflow = 'hidden';
}

export function closeSettings() {
   if (!el.settingsModal) return;
   el.settingsModal.classList.add('hidden');
   el.settingsModal.setAttribute('aria-hidden', 'true');
   if (_savedFocus && _savedFocus.focus) _savedFocus.focus();
   document.body.style.overflow = '';
   applyTimerSize(state.settings.timerSize);
}

export function populateSettingsForm() {
  if (!el.warmupInput || !el.breakInput) return;
  el.warmupInput.value = Math.round(state.settings.warmupDuration / 60);
  el.breakInput.value = Math.round(state.settings.shortBreak / 60);

  if (el.autoRestartSelect) {
    const val = state.settings.autoRestartMinutes;
    const match = [...el.autoRestartSelect.options].find(o => o.value === String(val));
    if (match) {
      el.autoRestartSelect.value = String(val);
      el.autoRestartCustom.hidden = true;
    } else if (val > 0) {
      el.autoRestartSelect.value = 'custom';
      el.autoRestartCustom.hidden = false;
      el.autoRestartCustom.value = val;
    } else {
      el.autoRestartSelect.value = '0';
      el.autoRestartCustom.hidden = true;
    }
  }

  // Timer size presets
  highlightSizePreset(state.settings.timerSize || 'regular');

  // GitHub toggle
  if (el.githubVisible) el.githubVisible.checked = state.settings.githubVisible !== false;

  // Card customization
  if (el.tasksCardVisible) el.tasksCardVisible.checked = state.settings.tasksCardVisible !== false;
  if (el.historyCardVisible) el.historyCardVisible.checked = state.settings.historyCardVisible !== false;
  if (el.showBeatsAutoStart) el.showBeatsAutoStart.checked = state.settings.showBeatsAutoStart !== false;

  // Settings layout
  applySettingsLayout(state.settings.settingsLayout || 'sidebar');

  // Audio settings
  populateAudioSettings();

  // Activate first tab
  activateSettingsTab('timer');
}

/** Called once on init and after every settings save to reflect card prefs. */
export function applyCardSettings() {
  const s = state.settings;

  // Tasks card visibility
  if (el.tasksCard) {
    el.tasksCard.style.display = s.tasksCardVisible !== false ? '' : 'none';
  }

  // History card visibility (respects existing no-sessions hiding too)
  if (el.historyCard) {
    el.historyCard.dataset.settingVisible = s.historyCardVisible !== false ? 'true' : 'false';
    if (s.historyCardVisible === false) {
      el.historyCard.style.display = 'none';
    } else {
      el.historyCard.style.display = '';
    }
  }

  // GitHub link visibility (in header)
  const githubLink = document.getElementById('githubStarBtn');
  if (githubLink) {
    githubLink.style.display = s.githubVisible !== false ? '' : 'none';
  }

  updateBeatsAutoStartVisibility();
}

let _toastTimer = null;
let _toastHasUndo = false;
export function showToast(msg, { undo = false } = {}) {
   const t = document.getElementById('toast');
   if (!t) return;
   t.textContent = msg;
   t.hidden = false;
   clearTimeout(_toastTimer);
   _toastHasUndo = undo;
   _toastTimer = setTimeout(() => { t.hidden = true; _toastHasUndo = false; }, 6000);
}

const TIMER_SIZE_MAP = { compact: 0.7, regular: 1.0, large: 1.3, xl: 1.6 };

export function applyTimerSize(preset) {
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  const scale = isMobile ? 1.0 : (TIMER_SIZE_MAP[preset] ?? 1.0);
  if (el.timerCard) {
    el.timerCard.style.zoom = scale === 1 ? '' : String(scale);
  }
}

function highlightSizePreset(preset) {
  if (!el.timerSizeGrid) return;
  el.timerSizeGrid.querySelectorAll('.timer-size-btn').forEach(btn => {
    const active = btn.dataset.size === preset;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

export function applySettingsLayout(layout) {
  if (!el.settingsBody) return;
  const body = el.settingsBody;
  body.classList.toggle('layout-sidebar', layout === 'sidebar');
  body.classList.toggle('layout-top', layout === 'top');

  el.layoutPickerBtns?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });

  const activeTab = body.querySelector('.settings-tab-btn.active');
  if (activeTab) activateSettingsTab(activeTab.dataset.settingsTab);
}

export function activateSettingsTab(tabId) {
  el.settingsTabsSidebar?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tabId);
  });
  el.settingsTabsTop?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.settingsTab === tabId);
  });
  el.settingsPanels?.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.settingsPanel === tabId);
  });
}

// ─── Binaural Beats UI ─────────────────────────────────────────────────────

export function updateBeatsToggle() {
  if (!el.beatsToggle) return;
  el.beatsToggle.classList.toggle('active', state.beatsActive);
  el.beatsToggle.setAttribute('aria-pressed', String(state.beatsActive));
  if (el.beatsPopoverToggle) {
    el.beatsPopoverToggle.checked = state.beatsActive;
    el.beatsPopoverToggle.setAttribute('aria-checked', String(state.beatsActive));
  }
}

export function updateBeatsPopoverActive() {
  if (!el.beatsPopover) return;
  // Prefer live input values over saved state (blur saves to state)
   const leftFreq = parseInt(el.beatsPopLeftFreq?.value, 10) ?? state.settings.beatsLeftFreq ?? 270;
   const rightFreq = parseInt(el.beatsPopRightFreq?.value, 10) ?? state.settings.beatsRightFreq ?? 284;
  const beatFreq = rightFreq - leftFreq;
  const matched = state.settings.beatsPreset || null;
  const isOff = !state.beatsActive;
  el.beatsPopover.querySelectorAll('.beats-popover-item').forEach(item => {
    const isActive = !isOff && item.dataset.preset === matched;
    item.classList.toggle('active', isActive);
    item.classList.toggle('inactive', isOff);
    item.setAttribute('aria-checked', String(isActive));
  });
  if (el.beatsPopBeatFreq) {
    el.beatsPopBeatFreq.textContent = `= ${beatFreq} Hz`;
  }
}

export function updateBeatsBeatDisplay() {
  if (!el.beatsPopBeatFreq) return;
   const left = parseInt(el.beatsPopLeftFreq?.value, 10) ?? 270;
   const right = parseInt(el.beatsPopRightFreq?.value, 10) ?? 284;
  el.beatsPopBeatFreq.textContent = `= ${Math.abs(right - left)} Hz`;
}

export function showBeatsPopover() {
  el.beatsPopover?.classList.remove('hidden');
  el.beatsChevron?.setAttribute('aria-expanded', 'true');
}

export function hideBeatsPopover() {
  el.beatsPopover?.classList.add('hidden');
  el.beatsChevron?.setAttribute('aria-expanded', 'false');
}

export function populateAudioSettings() {
  if (el.beatsAutoStart) el.beatsAutoStart.checked = !!state.settings.beatsAutoStart;
  if (el.beatsPresetSelect) {
    const matched = state.settings.beatsPreset || 'gamma';
    el.beatsPresetSelect.value = matched;
  }
  if (el.beatsDefaultLeftFreq) el.beatsDefaultLeftFreq.value = state.settings.beatsLeftFreq || 270;
  if (el.beatsDefaultRightFreq) el.beatsDefaultRightFreq.value = state.settings.beatsRightFreq || 284;
  if (el.beatsDefaultVolume) {
    const vol = Math.round((state.settings.beatsVolume || 0.5) * 100);
    el.beatsDefaultVolume.value = vol;
    if (el.beatsDefaultVolumeLabel) el.beatsDefaultVolumeLabel.textContent = vol + '%';
  }
  // Show beats auto-start control
  if (el.showBeatsAutoStart) el.showBeatsAutoStart.checked = state.settings.showBeatsAutoStart !== false;
  updateBeatsAutoStartVisibility();
}

export function updateBeatsAutoStartVisibility() {
  if (el.beatsAutoStart) {
    const row = el.beatsAutoStart.closest('.card-setting-row');
    if (row) row.style.display = state.settings.showBeatsAutoStart !== false ? '' : 'none';
  }
}
