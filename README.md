# Progressive Pomodoro (ProgPomo)

An adaptive focus timer PWA based on the Progressive Pomodoro technique. Start with a 2-minute warmup, rate your focus after each session, and watch your timer adapt to build deeper work sessions over time.

Try it live: [https://effectforward.github.io/Progressive-Pomodoro/](https://effectforward.github.io/Progressive-Pomodoro/)

## Features

- **Adaptive Timer**: Starts at 2 minutes, grows as you rate sessions positively
- **Rating System**: Rate sessions (Distracted → Fine → Focused → Flow) to progress
- **Task Management**: Add, complete, and delete tasks with undo
- **Session History**: Track completed sessions with ratings
- **6 Themes**: Pastel Linen, Soft Slate, Zen Graphite, Midnight Ink, Desert Linen, Midnight Slate
- **Timer Size Presets**: Compact (0.7x), Regular (1x), Large (1.3x), XL (1.6x)
- **Binaural Beats**: Toggle beats with presets and custom frequencies
- **PWA**: Installable, works offline with service worker

Quick start:
```bash
python3 -m http.server 8000
```
Open http://localhost:8000

## Tech Stack

Vanilla JS (ES modules), CSS custom properties for theming, Web Audio API for beats, Service Worker for offline caching, localStorage for persistence, Playwright for tests.

## Structure

```
├── index.html          Entry point
├── js/                 ES modules
│   ├── app.js          Main controller
│   ├── state.js        Singleton state + constants
│   ├── storage.js      localStorage persistence
│   ├── timer.js        Timer logic + rating system
│   ├── ui.js           DOM rendering + toast
│   ├── events.js       Event listeners
│   ├── beats.js        Binaural beats engine
│   └── themes.js       Theme system (6 themes)
├── style.css           Main stylesheet (imports css/ modules)
├── css/                Split stylesheet modules
├── sw.js               Service worker
├── manifest.json       PWA manifest
├── tests/              Playwright test specs
├── fonts/              Nunito font files
├── icons/              Phosphor Icons font files
└── README.md
```

## Roadmap

- [x] **Settings Export/Import** — Backup all settings to a dated JSON file and restore from it, with a confirmation step. Done in `2c0abce` (merged into `main`).
- [ ] **Stats** — Focus time summary (total, best, sessions, this week) with a last-7-day bar chart and a monthly heatmap. In development on `feature/stats-card`.
- [ ] **Export Sessions & Tasks** — Full history export alongside settings.
- [ ] **Isochronic Tones** — Add isochronic tone pulses alongside the existing binaural beats, as an alternative entrainment mode.
- [ ] **Browser Extension Port** — Port the app to a browser extension. Independent copy at `Progressive-Pomodoro-Extension`.


## License

GPLv3. See [LICENSE](LICENSE).

## Credit

Based on the Progressive Pomodoro technique by [Mike Rapadas](https://www.youtube.com/watch?v=qtoysJSQTn8).