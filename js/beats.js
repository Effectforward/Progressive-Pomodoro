// ─── Binaural Beats Generator ───────────────────────────────────────────────
// Pure Web Audio API synthesis. Two oscillators → left/right ear.
//
// Science (from research):
// - Binaural beats: brain perceives beat at difference frequency between ears
// - Example: Left 200Hz, Right 205Hz → perceived beat at 5Hz
// - Carrier frequency: the base tone (lower frequency) — optimal range 200-400Hz
// - Lower carrier tones (200-340 Hz) produce more robust entrainment effects
// - Standard convention: lower freq to left ear, higher freq to right ear
//
// Brainwave ranges (Hz):
//   Delta:  0.5-4    Deep sleep, recovery
//   Theta:  4-8      Meditation, relaxation
//   Alpha:  8-13     Calm focus, creativity
//   Beta:   13-30    Active thinking, concentration
//   Gamma:  30-100   High-level processing, insight
//
// Oster Curve: optimal carrier frequencies for target beat frequencies
//   10Hz beat → ~230-240Hz carrier
//   14Hz beat → ~260-280Hz carrier
//   20Hz beat → ~300-320Hz carrier

let _audioCtx = null;
let _leftOsc = null;
let _rightOsc = null;
let _gainNode = null;
let _isPlaying = false;
let _cleanupTimer = null;

// Presets based on research
// leftFreq = carrier (lower), rightFreq = carrier + beatFreq
// Carrier frequencies based on Oster Curve (1973) — optimal perception
export const PRESETS = {
  delta: {
    name: 'Delta (0.5-4 Hz)',
    label: 'Deep Sleep',
    desc: 'Deep sleep, recovery',
    leftFreq: 100,
    beatFreq: 2,
  },
  theta: {
    name: 'Theta (4-8 Hz)',
    label: 'Meditation',
    desc: 'Deep relaxation, meditation',
    leftFreq: 200,
    beatFreq: 6,
  },
  alpha: {
    name: 'Alpha (8-13 Hz)',
    label: 'Calm Focus',
    desc: 'Calm alertness, creativity',
    leftFreq: 230,
    beatFreq: 10,
  },
  beta: {
    name: 'Beta (13-30 Hz)',
    label: 'Active Focus',
    desc: 'Concentration, active thinking',
    leftFreq: 270,
    beatFreq: 14,
  },
  gamma: {
    name: 'Gamma (30-100 Hz)',
    label: 'Peak Focus',
    desc: 'High-level processing, insight',
    leftFreq: 340,
    beatFreq: 40,
  },
};

function getAudioContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

/**
 * Start binaural beats with direct left/right ear frequencies.
 * @param {number} leftFreq - Left ear frequency (Hz) — carrier/lower tone
 * @param {number} rightFreq - Right ear frequency (Hz) — carrier + beat
 * @param {number} volume - Volume 0-1
 */
export function start(leftFreq = 200, rightFreq = 214, volume = 0.5) {
  // Clean up any previous nodes (including if stop() is still fading out)
  if (_cleanupTimer) { clearTimeout(_cleanupTimer); _cleanupTimer = null; }
  try { _leftOsc?.stop(); } catch {}
  try { _rightOsc?.stop(); } catch {}
  try { _leftOsc?.disconnect(); } catch {}
  try { _rightOsc?.disconnect(); } catch {}
  try { _gainNode?.disconnect(); } catch {}
  _leftOsc = null;
  _rightOsc = null;
  _gainNode = null;

  const ctx = getAudioContext();
  const t = ctx.currentTime;

  // Ensure right > left (standard convention)
  if (rightFreq <= leftFreq) rightFreq = leftFreq + 1;

  _leftOsc = ctx.createOscillator();
  _rightOsc = ctx.createOscillator();
  _leftOsc.type = 'sine';
  _rightOsc.type = 'sine';
  _leftOsc.frequency.value = leftFreq;
  _rightOsc.frequency.value = rightFreq;

  const pannerL = ctx.createStereoPanner();
  const pannerR = ctx.createStereoPanner();
  pannerL.pan.value = -1;
  pannerR.pan.value = 1;

  _gainNode = ctx.createGain();
  _gainNode.gain.setValueAtTime(0, t);
  _gainNode.gain.linearRampToValueAtTime(volume, t + 0.3);

  _leftOsc.connect(pannerL).connect(_gainNode).connect(ctx.destination);
  _rightOsc.connect(pannerR).connect(_gainNode).connect(ctx.destination);

  _leftOsc.start(t);
  _rightOsc.start(t);
  _isPlaying = true;
}

export function stop() {
  if (!_isPlaying) return;
  const ctx = _audioCtx;
  if (!ctx) { _isPlaying = false; return; }
  const t = ctx.currentTime;

  _gainNode.gain.linearRampToValueAtTime(0, t + 0.4);

  const l = _leftOsc, r = _rightOsc;
  l.stop(t + 0.45);
  r.stop(t + 0.45);

  _isPlaying = false;

  _cleanupTimer = setTimeout(() => {
    try { l.disconnect(); } catch {}
    try { r.disconnect(); } catch {}
    try { _gainNode.disconnect(); } catch {}
    _leftOsc = null;
    _rightOsc = null;
    _gainNode = null;
    _cleanupTimer = null;
  }, 500);
}

/**
 * Set left ear frequency (carrier).
 */
function setLeftFrequency(freq) {
  if (!_isPlaying || !_leftOsc) return;
  const t = _audioCtx.currentTime;
  _leftOsc.frequency.linearRampToValueAtTime(freq, t + 0.05);
}

/**
 * Set right ear frequency.
 */
function setRightFrequency(freq) {
  if (!_isPlaying || !_rightOsc) return;
  const t = _audioCtx.currentTime;
  _rightOsc.frequency.linearRampToValueAtTime(freq, t + 0.05);
}

/**
 * Set both frequencies at once (from left/right values).
 */
export function setFrequencies(leftFreq, rightFreq) {
   if (!_isPlaying) return;
   if (rightFreq <= leftFreq) rightFreq = leftFreq + 1;
   setLeftFrequency(leftFreq);
   setRightFrequency(rightFreq);
}

export function setVolume(vol) {
  if (!_isPlaying || !_gainNode) return;
  const t = _audioCtx.currentTime;
  _gainNode.gain.linearRampToValueAtTime(vol, t + 0.05);
}

// Chrome suspends the AudioContext when the tab is hidden, and a bare resume()
// leaves silence because the scheduled start/stop times are already in the
// past. When we come back while beats should still be playing, rebuild the
// graph so the sound actually returns.
export function resumeIfNeeded() {
  if (document.visibilityState !== 'visible') return false;
  if (!_isPlaying) return false;
  if (_audioCtx && _audioCtx.state === 'running') return false;
  const left = _leftOsc?.frequency.value ?? 200;
  const right = _rightOsc?.frequency.value ?? 214;
  const vol = _gainNode?.gain.value ?? 0.5;
  start(left, right, vol);
  return true;
}

document.addEventListener('visibilitychange', resumeIfNeeded);
