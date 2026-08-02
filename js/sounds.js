// Synthesized end-of-session alarm sounds.
// All sounds are generated with Web Audio — no audio files, no external
// requests. Kept soft and low to avoid a jarring startle response.

let _audioCtx = null;

function getContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

export const ALARM_SOUNDS = [
  { value: 'chord', label: 'Soft chord' },
  { value: 'bell', label: 'Gentle bell' },
  { value: 'knock', label: 'Wooden knock' },
  { value: 'chimes', label: 'Wind chimes' },
  { value: 'marimba', label: 'Marimba duet' },
];

function tone(ctx, freq, start, duration, volume, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.1);
}

function playChord(ctx) {
  const freqs = [87.31, 130.81, 174.61, 220.00]; // F2, C3, F3, A3
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4 * (1 / (i + 1)), t + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 6.0);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 6.5);
  });
}

function playBell(ctx) {
  const partials = [1, 2.76, 5.4]; // fundamental + inharmonic partials (bell-like)
  partials.forEach((m, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880 * m;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22 / (i + 1), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 3.5);
  });
}

function playKnock(ctx) {
  // Three soft descending taps, like a wooden kitchen timer.
  [0, 0.18, 0.36].forEach((start, i) => {
    const freq = 320 - i * 60;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

function playChimes(ctx) {
  // Three staggered soft pings from a pentatonic set (C D E G A).
  const set = [523.25, 587.33, 659.25, 783.99, 880.00];
  const picked = [];
  for (let i = 0; i < 3; i++) {
    let note;
    do { note = set[Math.floor(Math.random() * set.length)]; } while (picked.includes(note));
    picked.push(note);
  }
  picked.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.45;
    const partials = [1, 4.2];
    partials.forEach((m, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * m;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16 / (j + 1), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 2.9);
    });
  });
}

function playMarimba(ctx) {
  // Two gentle descending notes (major third), soft mallets.
  [[659.25, 0], [523.25, 0.35]].forEach(([freq, start]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.8);
  });
}

const PLAYERS = {
  chord: playChord,
  bell: playBell,
  knock: playKnock,
  chimes: playChimes,
  marimba: playMarimba,
};

export function playAlarm(kind) {
  const ctx = getContext();
  const play = PLAYERS[kind] || playChord;
  play(ctx);
}
