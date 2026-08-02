// Central mutable state + constants shared across modules.
// Other modules import `state` and mutate its properties directly
// (e.g. `state.duration = 120`) rather than owning their own copies.

export const STORAGE_KEYS = {
  settings: 'pp_settings_v1',
  sessions: 'pp_sessions_v1',
  tasks: 'pp_tasks_v1',
  state: 'pp_state_v1',
  theme: 'pp_theme_v1',
};

export const DEFAULT_SETTINGS = {
  warmupDuration: 2 * 60,
  shortBreak: 5 * 60,
  autoRestartMinutes: 0,
  alarmSound: 'chord', // 'chord'|'bell'|'knock'|'chimes'|'marimba'
  // Appearance
  timerSize: 'regular',
  githubVisible: true,
  settingsLayout: 'sidebar',
  // Card customization
  tasksCardVisible: true,
  historyCardVisible: true,
  // Binaural beats
  beatsLeftFreq: 340,
  beatsRightFreq: 380,
  beatsVolume: 0.5,
  beatsAutoStart: false,
  beatsPreset: 'gamma', // 'alpha'|'beta'|'gamma'|'delta'|'theta'|null (null = custom)
  // Visibility controls
  showBeatsAutoStart: true,
};

export const state = {
  // timer
  duration: DEFAULT_SETTINGS.warmupDuration,
  remaining: DEFAULT_SETTINGS.warmupDuration,
  remainingMs: DEFAULT_SETTINGS.warmupDuration * 1000,
  endAt: null,          // absolute wall-clock ms when session ends
  rafId: null,          // requestAnimationFrame handle
  nextFocusDuration: DEFAULT_SETTINGS.warmupDuration,

  // data
  sessions: [],
  tasks: [],
  settings: Object.assign({}, DEFAULT_SETTINGS),
  restartPrompt: false,
  lastSessionDuration: 0,

  // guards
  pendingRating: false, // session completed, awaiting rating before next start

  // binaural beats (runtime)
  beatsActive: false,

  // ui/mode
  theme: 'pastel',
  mode: 'focus', // 'focus' | 'break'
};
