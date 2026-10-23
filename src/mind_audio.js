// @ts-nocheck

/* ============================================================
   BINAURAL MIND WAVES FOCUS SYNTHESIZER & AMBIENT ENGINE
   Completely redesigned from scratch for S.A.Y.A.D.
   - Dual-oscillator true stereo binaural entrainment
   - Isochronic pulse speaker mode
   - Procedural ambient soundscapes (Rain, Drone, Stream, Bowls)
   - Real-time Web Audio Analyser oscilloscope visualizer
   - Draggable & collapsible floating control studio
   - Built-in Pomodoro focus timer
   ============================================================ */

// Brainwave Presets configuration
export const MIND_PRESETS = {
  alpha: {
    id: 'alpha',
    name: 'Alpha Waves',
    hz: 10.0,
    carrier: 432.0,
    tag: '10 Hz · Flow State',
    desc: 'Super-learning, memory retention, effortless reading & relaxed focus.',
    color: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.45)',
    icon: '🧠'
  },
  beta: {
    id: 'beta',
    name: 'Beta Waves',
    hz: 20.0,
    carrier: 432.0,
    tag: '20 Hz · Active Study',
    desc: 'High alertness, critical thinking, speed reading & analytical focus.',
    color: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.45)',
    icon: '📖'
  },
  gamma: {
    id: 'gamma',
    name: 'Gamma Waves',
    hz: 40.0,
    carrier: 432.0,
    tag: '40 Hz · Peak Focus',
    desc: 'Hyper-concentration, complex problem solving & maximum mental clarity.',
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.45)',
    icon: '⚡'
  },
  theta: {
    id: 'theta',
    name: 'Theta Waves',
    hz: 6.0,
    carrier: 432.0,
    tag: '6 Hz · Deep Insight',
    desc: 'Conceptual brainstorming, creative intuition & subconscious processing.',
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.45)',
    icon: '✨'
  },
  delta: {
    id: 'delta',
    name: 'Delta Waves',
    hz: 2.5,
    carrier: 216.0,
    tag: '2.5 Hz · Zen Rest',
    desc: 'Stress reduction, soothing mental fatigue & restorative calmness.',
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.45)',
    icon: '🌙'
  }
};

// Carrier Frequencies
export const CARRIER_FREQUENCIES = [
  { freq: 432.0, name: '432 Hz', label: 'Harmonic Solfeggio (Natural Focus)' },
  { freq: 528.0, name: '528 Hz', label: 'Clarity & Energy (Mental Agility)' },
  { freq: 216.0, name: '216 Hz', label: 'Warm Low Resonance (Gentle)' },
  { freq: 136.1, name: '136.1 Hz', label: 'Earth OM (Grounding Calm)' },
  { freq: 108.0, name: '108 Hz', label: 'Deep Sub-Tone (Hypnotic)' }
];

// Ambient Soundscape Modes
export const AMBIENT_PRESETS = [
  { id: 'rain', name: '🌧️ Forest Rain', desc: 'Warm acoustic rain & soft drizzle' },
  { id: 'drone', name: '🌌 Cosmic Drone', desc: 'Harmonic space pads & warm chord drone' },
  { id: 'stream', name: '🧘 Zen Stream', desc: 'Gentle flowing stream & water ripples' },
  { id: 'bowl', name: '🔔 Tibetan Bowl', desc: 'Harmonic resonant overtone bell' },
  { id: 'none', name: '🔇 Waves Only', desc: 'Pure scientific binaural beats' }
];

// Internal Audio Engine State
let audioCtx = null;
let masterGain = null;
let analyserNode = null;

// Binaural Nodes
let oscLeft = null;
let oscRight = null;
let gainLeft = null;
let gainRight = null;
let mergerNode = null;
let wavesGain = null;
let isochronicGain = null;
let isochronicLfo = null;
let isochronicLfoGain = null;

// Ambient Nodes
let ambientGain = null;
let ambientSourceNode = null;
let ambientFilterNode = null;
let ambientModLfo = null;
let ambientOscNodes = [];

// Audio Settings State
let isPlaying = false;
let currentPreset = 'alpha';
let carrierFreq = 432.0;
let soundMode = 'headphones'; // 'headphones' (true binaural) | 'speakers' (isochronic pulse)
let ambientPreset = 'rain'; // 'rain' | 'drone' | 'stream' | 'bowl' | 'none'
let masterVolume = 0.70;
let wavesVolume = 0.65;
let ambientVolume = 0.40;

// Focus Session Timer State
let timerMinutes = 0; // 0 = infinite
let timerRemainingSeconds = 0;
let timerInterval = null;

// Floating Widget State
let widgetDocked = false; // true if minimized to pill dock
let widgetDismissed = true; // true when completely closed via X button
let visualizerAnimId = null;
let pillVisualizerAnimId = null;

/* ============================================================
   AUDIO CONTEXT INITIALIZATION & HELPERS
   ============================================================ */

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Generates procedural pink/brown noise audio buffer for organic rainfall & water
function createRainBuffer(ctx, duration = 4.0) {
  const sampleRate = ctx.sampleRate;
  const frameCount = sampleRate * duration;
  const buffer = ctx.createBuffer(2, frameCount, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise filter algorithm (Paul Kellet's filter)
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      data[i] = pink;
    }
  }
  return buffer;
}

/* ============================================================
   START / UPDATE BINAURAL & AMBIENT AUDIO
   ============================================================ */

export function startMindWaves(presetId = 'alpha', customCarrier = null, notify = true, inPlace = false) {
  try {
    widgetDismissed = false;
    const ctx = getAudioContext();
    if (!ctx) return;

    if (presetId && MIND_PRESETS[presetId]) {
      currentPreset = presetId;
    }
    if (customCarrier) {
      carrierFreq = customCarrier;
    }

    const preset = MIND_PRESETS[currentPreset] || MIND_PRESETS.alpha;
    const diffHz = preset.hz;
    const baseFreq = carrierFreq || preset.carrier || 432.0;

    // Clean up previous active audio nodes cleanly
    stopAllAudioNodes();

    const ct = ctx.currentTime;

    // 1. Master Channel with Analyser for live oscilloscope
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, ct);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(0.01, masterVolume), ct + 1.2);

    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.85;

    masterGain.connect(analyserNode);
    analyserNode.connect(ctx.destination);

    // 2. Binaural Beats Channel
    wavesGain = ctx.createGain();
    wavesGain.gain.setValueAtTime(wavesVolume, ct);

    // Channel merger for 100% stereo left/right isolation
    mergerNode = ctx.createChannelMerger(2);

    gainLeft = ctx.createGain();
    gainRight = ctx.createGain();
    gainLeft.gain.setValueAtTime(1.0, ct);
    gainRight.gain.setValueAtTime(1.0, ct);

    oscLeft = ctx.createOscillator();
    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(baseFreq, ct);

    oscRight = ctx.createOscillator();
    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(baseFreq + diffHz, ct);

    oscLeft.connect(gainLeft);
    oscRight.connect(gainRight);

    gainLeft.connect(mergerNode, 0, 0); // Left channel
    gainRight.connect(mergerNode, 0, 1); // Right channel

    // Speaker Mode Isochronic Pulse Layer
    isochronicGain = ctx.createGain();
    if (soundMode === 'speakers') {
      isochronicGain.gain.setValueAtTime(0.5, ct);
      isochronicLfo = ctx.createOscillator();
      isochronicLfo.type = 'sine';
      isochronicLfo.frequency.setValueAtTime(diffHz, ct);

      isochronicLfoGain = ctx.createGain();
      isochronicLfoGain.gain.setValueAtTime(0.5, ct);

      isochronicLfo.connect(isochronicLfoGain);
      isochronicLfoGain.connect(isochronicGain.gain);
      isochronicLfo.start();
    } else {
      isochronicGain.gain.setValueAtTime(1.0, ct);
    }

    mergerNode.connect(isochronicGain);
    isochronicGain.connect(wavesGain);
    wavesGain.connect(masterGain);

    oscLeft.start();
    oscRight.start();

    // 3. Ambient Soundscape Channel
    initAmbientLayer(ctx);

    isPlaying = true;
    window.State.alphaWavesEnabled = true;
    if (window.DB && window.DB.setting) {
      window.DB.setting('alphaWavesEnabled', true).catch(() => {});
    }

    // Start Focus Session Timer if active
    if (timerMinutes > 0 && timerRemainingSeconds <= 0) {
      timerRemainingSeconds = timerMinutes * 60;
    }
    startTimerCountdown();

    // Update Floating UI
    if (inPlace && document.getElementById('mind-waves-studio') && !widgetDocked) {
      updatePlayPauseInPlaceOrRender();
    } else {
      renderMindWavesWidget();
    }
    if (notify) {
      if (typeof notify === 'string') {
        window.toast(notify);
      } else {
        window.toast(`${preset.icon} ${preset.name} (${preset.tag}) Activated`);
      }
    }
  } catch (err) {
    console.error('Error starting Mind Waves:', err);
  }
}

function initAmbientLayer(ctx) {
  if (ambientPreset === 'none') return;

  const ct = ctx.currentTime;
  ambientGain = ctx.createGain();
  ambientGain.gain.setValueAtTime(ambientVolume * 0.75, ct);

  if (ambientPreset === 'rain') {
    // Procedural Forest Rain
    const rainBuf = createRainBuffer(ctx, 4.0);
    const src = ctx.createBufferSource();
    src.buffer = rainBuf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, ct);
    filter.Q.setValueAtTime(1.5, ct);

    // Subtle gentle modulation for natural rain rhythm
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.2, ct);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(300, ct);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    src.connect(filter);
    filter.connect(ambientGain);
    src.start();

    ambientSourceNode = src;
    ambientFilterNode = filter;
    ambientModLfo = lfo;
  } else if (ambientPreset === 'drone') {
    // Warm Cosmic Triad Drone (Harmonic Solfeggio Octaves)
    const baseRoot = carrierFreq * 0.25; // 108Hz from 432Hz
    const freqs = [baseRoot, baseRoot * 1.5, baseRoot * 2.0]; // Root, Fifth, Octave

    ambientOscNodes = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f + (i * 0.3), ct); // Micro-detune for warm chorus

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25 / (i + 1), ct);
      osc.connect(g);
      g.connect(ambientGain);
      osc.start();
      return osc;
    });
  } else if (ambientPreset === 'stream') {
    // Zen Water Stream
    const rainBuf = createRainBuffer(ctx, 3.0);
    const src = ctx.createBufferSource();
    src.buffer = rainBuf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, ct);
    filter.Q.setValueAtTime(3.0, ct);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.35, ct);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(220, ct);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    src.connect(filter);
    filter.connect(ambientGain);
    src.start();

    ambientSourceNode = src;
    ambientFilterNode = filter;
    ambientModLfo = lfo;
  } else if (ambientPreset === 'bowl') {
    // Tibetan Singing Bowl Harmonic Resonator
    const fundamental = 216.0;
    const overtones = [fundamental, fundamental * 2.76, fundamental * 5.4];

    ambientOscNodes = overtones.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, ct);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18 / (i + 1), ct);

      // Tremolo shimmer
      const trem = ctx.createOscillator();
      trem.frequency.setValueAtTime(0.15 + i * 0.05, ct);
      const tremG = ctx.createGain();
      tremG.gain.setValueAtTime(0.04, ct);
      trem.connect(tremG);
      tremG.connect(g.gain);
      trem.start();

      osc.connect(g);
      g.connect(ambientGain);
      osc.start();
      return osc;
    });
  }

  ambientGain.connect(masterGain);
}

function stopAllAudioNodes() {
  if (oscLeft) { try { oscLeft.stop(); oscLeft.disconnect(); } catch (e) {} oscLeft = null; }
  if (oscRight) { try { oscRight.stop(); oscRight.disconnect(); } catch (e) {} oscRight = null; }
  if (isochronicLfo) { try { isochronicLfo.stop(); isochronicLfo.disconnect(); } catch (e) {} isochronicLfo = null; }
  if (ambientSourceNode) { try { ambientSourceNode.stop(); ambientSourceNode.disconnect(); } catch (e) {} ambientSourceNode = null; }
  if (ambientModLfo) { try { ambientModLfo.stop(); ambientModLfo.disconnect(); } catch (e) {} ambientModLfo = null; }
  if (ambientOscNodes && ambientOscNodes.length) {
    ambientOscNodes.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
    ambientOscNodes = [];
  }
}

export function pauseMindWaves(notify = true) {
  if (!isPlaying) return;
  if (masterGain && audioCtx) {
    try {
      const ct = audioCtx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, ct);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.3);
      setTimeout(() => {
        stopAllAudioNodes();
      }, 320);
    } catch (e) {
      stopAllAudioNodes();
    }
  } else {
    stopAllAudioNodes();
  }

  isPlaying = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }

  if (pillVisualizerAnimId) {
    cancelAnimationFrame(pillVisualizerAnimId);
    pillVisualizerAnimId = null;
  }

  updatePlayPauseInPlaceOrRender();

  if (notify && window.toast) {
    window.toast('Mind Waves Audio Paused ⏸️');
  }
}

export function resumeMindWaves(notify = true) {
  if (isPlaying) return;
  widgetDismissed = false;
  startMindWaves(currentPreset, carrierFreq, notify ? 'Mind Waves Audio Resumed ▶' : false, true);
}

export function toggleMindWaves() {
  if (isPlaying) {
    pauseMindWaves(true);
  } else {
    resumeMindWaves(true);
  }
}

export function stopMindWaves(notify = true) {
  if (masterGain && audioCtx) {
    try {
      const ct = audioCtx.currentTime;
      masterGain.gain.setValueAtTime(masterGain.gain.value, ct);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.4);
      setTimeout(() => {
        stopAllAudioNodes();
      }, 420);
    } catch (e) {
      stopAllAudioNodes();
    }
  } else {
    stopAllAudioNodes();
  }

  isPlaying = false;
  widgetDismissed = true;
  window.State.alphaWavesEnabled = false;
  if (window.DB && window.DB.setting) {
    window.DB.setting('alphaWavesEnabled', false).catch(() => {});
  }

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerRemainingSeconds = timerMinutes * 60;

  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }

  if (pillVisualizerAnimId) {
    cancelAnimationFrame(pillVisualizerAnimId);
    pillVisualizerAnimId = null;
  }

  removeMindWavesWidget();

  if (notify && window.toast) {
    window.toast('Mind Waves Audio Turned Off ⏹️');
  }
}

/* ============================================================
   REAL-TIME PARAMETER SETTERS
   ============================================================ */

export function setMindWavesPreset(presetId) {
  if (!MIND_PRESETS[presetId]) return;
  currentPreset = presetId;
  if (isPlaying) {
    startMindWaves(presetId, carrierFreq);
  } else {
    renderMindWavesWidget();
  }
}

export function setCarrierFrequency(freq) {
  carrierFreq = Number(freq);
  if (isPlaying) {
    startMindWaves(currentPreset, carrierFreq);
  } else {
    renderMindWavesWidget();
  }
}

export function setAmbientPreset(ambId) {
  ambientPreset = ambId;
  if (isPlaying) {
    startMindWaves(currentPreset, carrierFreq);
  } else {
    renderMindWavesWidget();
  }
}

export function setSoundMode(mode) {
  soundMode = mode;
  if (isPlaying) {
    startMindWaves(currentPreset, carrierFreq);
  } else {
    renderMindWavesWidget();
  }
}

export function setMasterVolume(vol) {
  masterVolume = Math.max(0.0, Math.min(1.0, vol));
  if (masterGain && audioCtx) {
    try {
      masterGain.gain.setValueAtTime(masterGain.gain.value, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(masterVolume, audioCtx.currentTime + 0.05);
    } catch (e) {}
  }
}

export function setWavesVolume(vol) {
  wavesVolume = Math.max(0.0, Math.min(1.0, vol));
  if (wavesGain && audioCtx) {
    try {
      wavesGain.gain.setValueAtTime(wavesGain.gain.value, audioCtx.currentTime);
      wavesGain.gain.linearRampToValueAtTime(wavesVolume, audioCtx.currentTime + 0.05);
    } catch (e) {}
  }
}

export function setAmbientVolume(vol) {
  ambientVolume = Math.max(0.0, Math.min(1.0, vol));
  if (ambientGain && audioCtx) {
    try {
      ambientGain.gain.setValueAtTime(ambientGain.gain.value, audioCtx.currentTime);
      ambientGain.gain.linearRampToValueAtTime(ambientVolume * 0.75, audioCtx.currentTime + 0.05);
    } catch (e) {}
  }
}

export function setTimerDuration(mins) {
  timerMinutes = Number(mins);
  if (timerMinutes > 0) {
    timerRemainingSeconds = timerMinutes * 60;
  } else {
    timerRemainingSeconds = 0;
  }
  if (isPlaying) {
    startTimerCountdown();
  }
  renderMindWavesWidget();
}

function startTimerCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  if (timerMinutes <= 0) return;

  timerInterval = setInterval(() => {
    if (!isPlaying) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    if (timerRemainingSeconds > 0) {
      timerRemainingSeconds--;
      updateTimerDisplayInUI();
    } else {
      // Timer finished!
      clearInterval(timerInterval);
      timerInterval = null;
      playCompletionChime();
      stopMindWaves(false);
      if (window.toast) {
        window.toast(`🎯 Focus Session Finished (${timerMinutes}m) · Great Work!`);
      }
    }
  }, 1000);
}

function playCompletionChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const ct = ctx.currentTime;
    [528, 660, 792].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ct + i * 0.25);
      g.gain.setValueAtTime(0.001, ct + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.3, ct + i * 0.25 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ct + i * 0.25 + 1.2);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(ct + i * 0.25);
      osc.stop(ct + i * 0.25 + 1.3);
    });
  } catch (e) {}
}

function updateTimerDisplayInUI() {
  const m = Math.floor(timerRemainingSeconds / 60);
  const s = timerRemainingSeconds % 60;
  const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

  const studioTimerEl = document.getElementById('mw-timer-clock');
  if (studioTimerEl) {
    studioTimerEl.textContent = timeStr;
  }
  const pillTimerEl = document.getElementById('mw-pill-timer');
  if (pillTimerEl) {
    pillTimerEl.textContent = timeStr;
  }
}

/* ============================================================
   SCRATCH-BUILT FLOATING MENU & STUDIO UI
   ============================================================ */

export function openMindWavesStudio() {
  widgetDismissed = false;
  widgetDocked = false;
  renderMindWavesWidget();
}

export function closeMindWavesStudio() {
  widgetDocked = true;
  renderMindWavesWidget();
}

function updatePlayPauseInPlaceOrRender() {
  const studio = document.getElementById('mind-waves-studio');
  const footer = document.querySelector('.mw-studio-footer');
  if (studio && footer && !widgetDocked) {
    const preset = MIND_PRESETS[currentPreset] || MIND_PRESETS.alpha;
    footer.innerHTML = `
      <button id="mw-dock-action-btn" class="btn btn-ghost" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20"></polyline>
          <polyline points="20 10 14 10 14 4"></polyline>
          <line x1="14" y1="10" x2="21" y2="3"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
        <span>Minimize to Dock</span>
      </button>

      ${isPlaying ? `
        <button id="mw-pause-action-btn" class="btn" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:rgba(234, 179, 8, 0.15); color:#eab308; border:1px solid rgba(234, 179, 8, 0.3); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
          <span style="font-size:13px; line-height:1;">⏸️</span>
          <span>Pause</span>
        </button>
      ` : `
        <button id="mw-play-action-btn" class="btn btn-primary" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:${preset.color}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
          <span style="font-size:13px; line-height:1;">▶</span>
          <span>${timerRemainingSeconds > 0 && timerRemainingSeconds < timerMinutes * 60 ? 'Resume Audio' : 'Start Focus'}</span>
        </button>
      `}

      <button id="mw-stop-action-btn" class="btn" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
        <span style="font-size:13px; line-height:1;">✕</span>
        <span>Stop Audio</span>
      </button>
    `;

    const dockActionBtn = document.getElementById('mw-dock-action-btn');
    if (dockActionBtn) {
      dockActionBtn.onclick = () => {
        widgetDocked = true;
        renderMindWavesWidget();
      };
    }
    const pauseBtn = document.getElementById('mw-pause-action-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        pauseMindWaves(true);
      };
    }
    const playBtn = document.getElementById('mw-play-action-btn');
    if (playBtn) {
      playBtn.onclick = () => {
        resumeMindWaves(true);
      };
    }
    const stopBtn = document.getElementById('mw-stop-action-btn');
    if (stopBtn) {
      stopBtn.onclick = () => {
        stopMindWaves(true);
      };
    }

    if (isPlaying) {
      startOscilloscopeAnimation();
    }
  } else {
    renderMindWavesWidget();
  }
}

export function renderMindWavesWidget() {
  // If explicitly closed via X, remove widget
  if (widgetDismissed) {
    removeMindWavesWidget();
    return;
  }

  let root = document.getElementById('mind-waves-floating-container');
  if (!root) {
    root = document.createElement('div');
    root.id = 'mind-waves-floating-container';
    document.body.appendChild(root);
  }

  const preset = MIND_PRESETS[currentPreset] || MIND_PRESETS.alpha;
  const m = Math.floor(timerRemainingSeconds / 60);
  const s = timerRemainingSeconds % 60;
  const timerStr = timerMinutes > 0 ? `${m}:${s < 10 ? '0' : ''}${s}` : '∞';

  if (widgetDocked) {
    // -------------------------------------------------------------
    // 1. MINI DOCK PILL (COMPACT & SLEEK)
    // -------------------------------------------------------------
    root.innerHTML = `
      <div id="mind-waves-pill" class="mw-dock-pill" title="Tap to open Mind Waves Studio">
        <div class="mw-pill-dot" style="background:${preset.color}; box-shadow:${isPlaying ? `0 0 10px ${preset.color}` : 'none'}; opacity:${isPlaying ? 1 : 0.6};"></div>
        <div class="mw-pill-content">
          <div class="mw-pill-name">${preset.icon} ${preset.name.split(' ')[0]}</div>
          <div class="mw-pill-sub">${preset.hz}Hz · <span id="mw-pill-timer">${timerStr}</span></div>
        </div>

        <div class="mw-pill-eq ${isPlaying ? 'playing' : ''}">
          <span style="background:${preset.color};"></span>
          <span style="background:${preset.color};"></span>
          <span style="background:${preset.color};"></span>
        </div>

        <button class="mw-pill-btn" id="mw-pill-toggle-play" title="${isPlaying ? 'Pause' : 'Play'}">
          ${isPlaying ? '⏸' : '▶'}
        </button>

        <button class="mw-pill-btn" id="mw-pill-expand" title="Expand Studio" style="display:flex; align-items:center; justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>

        <button class="mw-pill-btn mw-pill-close" id="mw-pill-close" title="Turn off Audio">
          ✕
        </button>
      </div>
    `;

    // Make pill draggable
    setupPillDraggable();

    // Event handlers for pill
    const toggleBtn = document.getElementById('mw-pill-toggle-play');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMindWaves();
      };
    }

    const expandBtn = document.getElementById('mw-pill-expand');
    if (expandBtn) {
      expandBtn.onclick = (e) => {
        e.stopPropagation();
        widgetDocked = false;
        renderMindWavesWidget();
      };
    }

    const closeBtn = document.getElementById('mw-pill-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        stopMindWaves(true);
      };
    }

    const pillBody = document.getElementById('mind-waves-pill');
    if (pillBody) {
      pillBody.onclick = () => {
        widgetDocked = false;
        renderMindWavesWidget();
      };
    }
  } else {
    // -------------------------------------------------------------
    // 2. EXPANDED FULL FLOATING STUDIO MODAL / CARD
    // -------------------------------------------------------------
    const existingStudio = document.getElementById('mind-waves-studio');
    const savedScrollTop = existingStudio ? existingStudio.scrollTop : 0;

    root.innerHTML = `
      <div id="mind-waves-backdrop" class="mw-studio-backdrop"></div>
      <div id="mind-waves-studio" class="mw-studio-card">
        
        <!-- Header -->
        <div class="mw-studio-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="mw-studio-emblem" style="background:${preset.glow}; border-color:${preset.color};">
              <span>${preset.icon}</span>
            </div>
            <div>
              <div class="mw-studio-title">Binaural Mind Waves Studio</div>
              <div class="mw-studio-sub">Scientific Brainwave Entrainment & Ambient Focus</div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <button id="mw-mode-dock-btn" class="mw-icon-btn" title="Minimize to Dock" style="display:flex; align-items:center; justify-content:center;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
            <button id="mw-close-studio-btn" class="mw-icon-btn mw-close-btn" title="Turn off Audio & Close">
              ✕
            </button>
          </div>
        </div>

        <!-- Live Waveform Oscilloscope Visualizer -->
        <div class="mw-visualizer-wrap">
          <canvas id="mw-studio-canvas" class="mw-oscilloscope-canvas"></canvas>
          <div class="mw-visualizer-overlay">
            <div class="mw-vis-badge" style="border-color:${preset.color}; color:${preset.color};">
              <span class="mw-pulse-dot" style="background:${preset.color};"></span>
              ${preset.name} · ${preset.hz} Hz
            </div>
            <div class="mw-vis-carrier font-mono">
              Base Carrier: ${carrierFreq} Hz · ${soundMode === 'headphones' ? '🎧 Stereo Binaural' : '🔊 Isochronic Pulse'}
            </div>
          </div>
        </div>

        <!-- Brainwave Frequency Selector Cards -->
        <div class="mw-section-title">
          <span>🧠 BRAINWAVE FREQUENCY STATE</span>
          <span style="font-size:11px; font-weight:600; color:var(--text-dim);">Scientific cognitive calibration</span>
        </div>

        <div class="mw-presets-grid">
          ${Object.values(MIND_PRESETS).map(p => `
            <div class="mw-preset-card ${currentPreset === p.id ? 'active' : ''}" data-preset-id="${p.id}" style="--preset-col:${p.color}; --preset-glow:${p.glow};">
              <div class="mw-pcard-header">
                <span class="mw-pcard-icon">${p.icon}</span>
                <span class="mw-pcard-hz">${p.hz} Hz</span>
              </div>
              <div class="mw-pcard-name">${p.name}</div>
              <div class="mw-pcard-tag">${p.tag.split('·')[1]?.trim() || ''}</div>
              <div class="mw-pcard-desc">${p.desc}</div>
            </div>
          `).join('')}
        </div>

        <!-- Sound Mode & Carrier Pitch Tuning -->
        <div class="mw-row-grid">
          <div>
            <div class="mw-section-label">🎧 LISTENING MODE</div>
            <div class="mw-mode-switch">
              <button class="mw-mode-btn ${soundMode === 'headphones' ? 'active' : ''}" data-sound-mode="headphones">
                🎧 Headphones (Binaural)
              </button>
              <button class="mw-mode-btn ${soundMode === 'speakers' ? 'active' : ''}" data-sound-mode="speakers">
                🔊 Speakers (Isochronic)
              </button>
            </div>
          </div>

          <div>
            <div class="mw-section-label">🎵 BASE CARRIER FREQUENCY</div>
            <div class="mw-carrier-pills">
              ${CARRIER_FREQUENCIES.map(c => `
                <button class="mw-carrier-pill ${carrierFreq === c.freq ? 'active' : ''}" data-carrier="${c.freq}" title="${c.label}">
                  ${c.name}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Ambient Soundscapes Mixer -->
        <div class="mw-section-title" style="margin-top:14px;">
          <span>🌿 AMBIENT SOUNDSCAPE LAYERS</span>
          <span style="font-size:11px; font-weight:600; color:var(--text-dim);">Procedural natural acoustics</span>
        </div>

        <div class="mw-ambient-grid">
          ${AMBIENT_PRESETS.map(a => `
            <button class="mw-ambient-chip ${ambientPreset === a.id ? 'active' : ''}" data-ambient-id="${a.id}">
              <div style="font-size:12.5px; font-weight:700;">${a.name}</div>
              <div style="font-size:10px; opacity:0.75; margin-top:2px;">${a.desc}</div>
            </button>
          `).join('')}
        </div>

        <!-- Multi-Layer Audio Mixer Sliders -->
        <div class="mw-mixer-wrap">
          <!-- Binaural Waves Volume -->
          <div class="mw-slider-row">
            <div class="mw-slider-info">
              <span>🧠 Binaural Waves</span>
              <span id="mw-val-waves" class="font-mono">${Math.round(wavesVolume * 100)}%</span>
            </div>
            <input type="range" id="mw-slider-waves" min="0" max="1" step="0.02" value="${wavesVolume}" class="mw-range-slider" />
          </div>

          <!-- Ambient Volume -->
          <div class="mw-slider-row">
            <div class="mw-slider-info">
              <span>🌿 Ambient Layer</span>
              <span id="mw-val-ambient" class="font-mono">${ambientPreset === 'none' ? 'Muted' : `${Math.round(ambientVolume * 100)}%`}</span>
            </div>
            <input type="range" id="mw-slider-ambient" min="0" max="1" step="0.02" value="${ambientVolume}" class="mw-range-slider" ${ambientPreset === 'none' ? 'disabled' : ''} />
          </div>

          <!-- Master Volume -->
          <div class="mw-slider-row">
            <div class="mw-slider-info">
              <span>🔊 Master Volume</span>
              <span id="mw-val-master" class="font-mono">${Math.round(masterVolume * 100)}%</span>
            </div>
            <input type="range" id="mw-slider-master" min="0" max="1" step="0.02" value="${masterVolume}" class="mw-range-slider" />
          </div>
        </div>

        <!-- Focus Session Pomodoro Timer -->
        <div class="mw-timer-card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">⏱️</span>
              <div>
                <div style="font-size:13px; font-weight:700; color:var(--text);">Focus Session Countdown</div>
                <div style="font-size:11px; color:var(--text-dim);">Audio fades out softly when session ends</div>
              </div>
            </div>
            <div id="mw-timer-clock" class="mw-timer-digits font-mono">
              ${timerStr}
            </div>
          </div>

          <div class="mw-timer-presets">
            <button class="mw-timer-chip ${timerMinutes === 0 ? 'active' : ''}" data-timer-mins="0">Continuous (∞)</button>
            <button class="mw-timer-chip ${timerMinutes === 15 ? 'active' : ''}" data-timer-mins="15">15 min</button>
            <button class="mw-timer-chip ${timerMinutes === 25 ? 'active' : ''}" data-timer-mins="25">25 min (Pomodoro)</button>
            <button class="mw-timer-chip ${timerMinutes === 45 ? 'active' : ''}" data-timer-mins="45">45 min</button>
            <button class="mw-timer-chip ${timerMinutes === 60 ? 'active' : ''}" data-timer-mins="60">60 min</button>
          </div>
        </div>

        <!-- Master Action Footer -->
        <div class="mw-studio-footer" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; align-items:stretch;">
          <button id="mw-dock-action-btn" class="btn btn-ghost" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span>Minimize to Dock</span>
          </button>

          ${isPlaying ? `
            <button id="mw-pause-action-btn" class="btn" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:rgba(234, 179, 8, 0.15); color:#eab308; border:1px solid rgba(234, 179, 8, 0.3); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
              <span style="font-size:13px; line-height:1;">⏸️</span>
              <span>Pause</span>
            </button>
          ` : `
            <button id="mw-play-action-btn" class="btn btn-primary" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:${preset.color}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
              <span style="font-size:13px; line-height:1;">▶</span>
              <span>${timerRemainingSeconds > 0 && timerRemainingSeconds < timerMinutes * 60 ? 'Resume Audio' : 'Start Focus'}</span>
            </button>
          `}

          <button id="mw-stop-action-btn" class="btn" style="height:48px; min-height:48px; max-height:48px; padding:4px 6px; border-radius:12px; font-size:11.5px; font-weight:700; background:rgba(239, 68, 68, 0.15); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.3); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; line-height:1.2; box-sizing:border-box;">
            <span style="font-size:13px; line-height:1;">✕</span>
            <span>Stop Audio</span>
          </button>
        </div>

      </div>
    `;

    // Bind all expanded studio interactive elements
    bindStudioEvents();

    // Start Live Oscilloscope Animation
    startOscilloscopeAnimation();

    const newStudio = document.getElementById('mind-waves-studio');
    if (newStudio && savedScrollTop > 0) {
      newStudio.scrollTop = savedScrollTop;
      requestAnimationFrame(() => {
        const s = document.getElementById('mind-waves-studio');
        if (s) s.scrollTop = savedScrollTop;
      });
    }
  }
}

function bindStudioEvents() {
  const backdrop = document.getElementById('mind-waves-backdrop');
  if (backdrop) {
    backdrop.onclick = () => {
      widgetDocked = true;
      renderMindWavesWidget();
    };
  }

  const dockBtn = document.getElementById('mw-mode-dock-btn');
  if (dockBtn) {
    dockBtn.onclick = () => {
      widgetDocked = true;
      renderMindWavesWidget();
    };
  }

  const dockActionBtn = document.getElementById('mw-dock-action-btn');
  if (dockActionBtn) {
    dockActionBtn.onclick = () => {
      widgetDocked = true;
      renderMindWavesWidget();
    };
  }

  const closeBtn = document.getElementById('mw-close-studio-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      stopMindWaves(true);
    };
  }

  // Presets cards
  document.querySelectorAll('.mw-preset-card').forEach(card => {
    card.onclick = () => {
      const pid = card.dataset.presetId;
      setMindWavesPreset(pid);
    };
  });

  // Sound mode buttons (headphones vs speakers)
  document.querySelectorAll('.mw-mode-btn').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.soundMode;
      setSoundMode(mode);
    };
  });

  // Carrier pills
  document.querySelectorAll('.mw-carrier-pill').forEach(pill => {
    pill.onclick = () => {
      const freq = Number(pill.dataset.carrier);
      setCarrierFrequency(freq);
    };
  });

  // Ambient chips
  document.querySelectorAll('.mw-ambient-chip').forEach(chip => {
    chip.onclick = () => {
      const ambId = chip.dataset.ambientId;
      setAmbientPreset(ambId);
    };
  });

  // Sliders
  const sWaves = document.getElementById('mw-slider-waves');
  if (sWaves) {
    sWaves.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setWavesVolume(v);
      const valEl = document.getElementById('mw-val-waves');
      if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
    };
  }

  const sAmbient = document.getElementById('mw-slider-ambient');
  if (sAmbient) {
    sAmbient.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setAmbientVolume(v);
      const valEl = document.getElementById('mw-val-ambient');
      if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
    };
  }

  const sMaster = document.getElementById('mw-slider-master');
  if (sMaster) {
    sMaster.oninput = (e) => {
      const v = parseFloat(e.target.value);
      setMasterVolume(v);
      const valEl = document.getElementById('mw-val-master');
      if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
    };
  }

  // Timer chips
  document.querySelectorAll('.mw-timer-chip').forEach(chip => {
    chip.onclick = () => {
      const mins = Number(chip.dataset.timerMins);
      setTimerDuration(mins);
    };
  });

  // Play / Pause / Stop action buttons
  const pauseBtn = document.getElementById('mw-pause-action-btn');
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      pauseMindWaves(true);
    };
  }

  const playBtn = document.getElementById('mw-play-action-btn');
  if (playBtn) {
    playBtn.onclick = () => {
      if (!isPlaying) {
        resumeMindWaves(true);
      }
    };
  }

  const stopBtn = document.getElementById('mw-stop-action-btn');
  if (stopBtn) {
    stopBtn.onclick = () => {
      stopMindWaves(true);
    };
  }
}

function removeMindWavesWidget() {
  const container = document.getElementById('mind-waves-floating-container');
  if (container) container.remove();
}

/* ============================================================
   REAL-TIME OSCILLOSCOPE VISUALIZER ENGINE
   ============================================================ */

function startOscilloscopeAnimation() {
  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }

  const canvas = document.getElementById('mw-studio-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 480) * dpr;
  canvas.height = (rect.height || 120) * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width || 480;
  const h = rect.height || 120;
  const centerY = h / 2;

  let bufferLength = 128;
  let dataArray = new Uint8Array(bufferLength);
  let startTime = performance.now();

  function drawFrame(now) {
    if (!document.getElementById('mw-studio-canvas')) return;

    ctx.clearRect(0, 0, w, h);

    const preset = MIND_PRESETS[currentPreset] || MIND_PRESETS.alpha;
    const col = preset.color;
    const elapsed = (now - startTime) / 1000;

    if (isPlaying && analyserNode) {
      analyserNode.getByteTimeDomainData(dataArray);

      // Draw active audio waveform
      ctx.beginPath();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;

      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * (h / 2);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      // Secondary modulated harmonic layer for binaural beat visual representation
      ctx.beginPath();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowBlur = 0;

      for (let px = 0; px <= w; px += 4) {
        const beatMod = Math.sin(px * 0.05 - elapsed * (preset.hz * 0.5));
        const py = centerY + beatMod * 16 * Math.sin(px / w * Math.PI);
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else {
      // Idle state calm sine wave
      ctx.beginPath();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.shadowBlur = 0;

      for (let px = 0; px <= w; px += 4) {
        const py = centerY + Math.sin(px * 0.03 + elapsed * 1.5) * 8;
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    visualizerAnimId = requestAnimationFrame(drawFrame);
  }

  visualizerAnimId = requestAnimationFrame(drawFrame);
}

/* ============================================================
   PILL DRAGGABLE HANDLER
   ============================================================ */

function setupPillDraggable() {
  const pill = document.getElementById('mind-waves-pill');
  if (!pill) return;

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  const onPointerDown = (e) => {
    // Ignore button clicks inside pill
    if (e.target.closest('button')) return;

    isDragging = true;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    startX = clientX;
    startY = clientY;

    const rect = pill.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    pill.style.transition = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();

    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    const newLeft = Math.max(10, Math.min(window.innerWidth - pill.offsetWidth - 10, initialLeft + deltaX));
    const newTop = Math.max(10, Math.min(window.innerHeight - pill.offsetHeight - 10, initialTop + deltaY));

    pill.style.left = `${newLeft}px`;
    pill.style.top = `${newTop}px`;
    pill.style.bottom = 'auto';
    pill.style.right = 'auto';
  };

  const onPointerUp = () => {
    isDragging = false;
    pill.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  };

  pill.addEventListener('pointerdown', onPointerDown);
}

/* ============================================================
/* ============================================================
   AMBIENT SCREENSAVER (PURE BLACK, RETRO BOUNCING & PIXEL FIRE)
   ============================================================ */

let oledOverlay = null;
let oledAnimId = null;

export function isOledBlackoutActive() {
  return Boolean(document.getElementById('oled-blackout-visualizer'));
}

export function openOledBlackoutVisualizer(modeOverride) {
  if (document.getElementById('oled-blackout-visualizer')) return;

  const mode = modeOverride || window.State?.oledStyle || 'bouncing';

  const overlay = document.createElement('div');
  overlay.id = 'oled-blackout-visualizer';
  oledOverlay = overlay;

  if (mode === 'blank') {
    // Mode 1: Pure Blank Page (OLED pure black, zero visual distraction)
    overlay.innerHTML = '';
  } else {
    // Mode 2 (Bouncing SAYAD) or Mode 3 (Pixelated Fire)
    overlay.innerHTML = `<canvas id="oled-canvas" class="ambient-screensaver-canvas"></canvas>`;
  }

  document.body.appendChild(overlay);

  // Tap anywhere on the pure black screen immediately closes the screensaver and returns to reading
  const exitHandler = (e) => {
    if (e && e.cancelable) e.preventDefault();
    closeOledBlackoutVisualizer();
  };
  overlay.addEventListener('click', exitHandler);
  overlay.addEventListener('touchend', exitHandler, { passive: false });

  const keyHandler = (e) => {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
      closeOledBlackoutVisualizer();
      window.removeEventListener('keydown', keyHandler);
    }
  };
  window.addEventListener('keydown', keyHandler);

  if (mode === 'bouncing') {
    initBouncingSayadCanvas();
  } else if (mode === 'fire') {
    initPixelFireCanvas();
  }
}

export function closeOledBlackoutVisualizer() {
  if (oledAnimId) {
    cancelAnimationFrame(oledAnimId);
    oledAnimId = null;
  }
  const overlay = document.getElementById('oled-blackout-visualizer');
  if (overlay) {
    overlay.remove();
  }
  oledOverlay = null;
}

// -------------------------------------------------------------
// MODE 2: RETRO TV / DVD BOUNCING SAYAD BOX
// -------------------------------------------------------------
function initBouncingSayadCanvas() {
  const canvas = document.getElementById('oled-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  let h = window.innerHeight;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  resize();

  const RETRO_COLORS = [
    { border: '#FF6A2B', glow: 'rgba(255, 106, 43, 0.45)', text: '#FFA07A' },
    { border: '#2FC6BC', glow: 'rgba(47, 198, 188, 0.45)', text: '#7FE7DE' },
    { border: '#A855F7', glow: 'rgba(168, 85, 247, 0.45)', text: '#D8B4FE' },
    { border: '#F59E0B', glow: 'rgba(245, 158, 11, 0.45)', text: '#FDE68A' },
    { border: '#EC4899', glow: 'rgba(236, 72, 153, 0.45)', text: '#FBCFE8' },
    { border: '#3B82F6', glow: 'rgba(59, 130, 246, 0.45)', text: '#93C5FD' },
  ];

  let colorIdx = Math.floor(Math.random() * RETRO_COLORS.length);
  const boxW = 124;
  const boxH = 52;
  let x = Math.max(10, Math.min(w - boxW - 10, Math.random() * (w - boxW)));
  let y = Math.max(10, Math.min(h - boxH - 10, Math.random() * (h - boxH)));
  let vx = (Math.random() > 0.5 ? 1 : -1) * (1.8 + Math.random() * 0.6);
  let vy = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 0.6);

  function loop() {
    if (!document.getElementById('oled-blackout-visualizer')) return;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Update position
    x += vx;
    y += vy;

    let bounced = false;
    if (x + boxW >= w) {
      x = w - boxW;
      vx = -Math.abs(vx);
      bounced = true;
    } else if (x <= 0) {
      x = 0;
      vx = Math.abs(vx);
      bounced = true;
    }

    if (y + boxH >= h) {
      y = h - boxH;
      vy = -Math.abs(vy);
      bounced = true;
    } else if (y <= 0) {
      y = 0;
      vy = Math.abs(vy);
      bounced = true;
    }

    if (bounced) {
      colorIdx = (colorIdx + 1) % RETRO_COLORS.length;
    }

    const col = RETRO_COLORS[colorIdx];

    // Draw retro TV / DVD box with rounded corners
    ctx.save();
    ctx.shadowColor = col.glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(12, 12, 12, 0.92)';
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 2.5;

    const r = 10;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + boxW - r, y);
    ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
    ctx.lineTo(x + boxW, y + boxH - r);
    ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
    ctx.lineTo(x + r, y + boxH);
    ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw retro scanline detail inside box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let sl = y + 4; sl < y + boxH - 4; sl += 4) {
      ctx.fillRect(x + 4, sl, boxW - 8, 1);
    }

    // Centered "SAYAD" Text
    ctx.fillStyle = col.text;
    ctx.font = 'bold 17px "Space Grotesk", "IBM Plex Sans", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2px';
    ctx.fillText('SAYAD', x + boxW / 2, y + boxH / 2 - 4);

    // Subtle sub-label
    ctx.fillStyle = col.border;
    ctx.font = '600 8.5px "IBM Plex Mono", monospace, sans-serif';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('RETRO TV', x + boxW / 2, y + boxH / 2 + 13);

    ctx.restore();

    oledAnimId = requestAnimationFrame(loop);
  }

  oledAnimId = requestAnimationFrame(loop);
}

// -------------------------------------------------------------
// MODE 3: FIREBASE STUDIO RETRO PIXELATED FIRE
// -------------------------------------------------------------
function initPixelFireCanvas() {
  const canvas = document.getElementById('oled-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  let w = window.innerWidth;
  let h = window.innerHeight;

  const pixelSize = Math.max(7, Math.floor(Math.min(w, h) / 60));
  let fireW = Math.ceil(w / pixelSize);
  let fireH = Math.ceil(h / pixelSize);
  let firePixels = new Uint8Array(fireW * fireH);

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    fireW = Math.ceil(w / pixelSize);
    fireH = Math.ceil(h / pixelSize);
    firePixels = new Uint8Array(fireW * fireH);
  }
  resize();

  // Authentic 28-color pixel fire palette from deep black to fiery red, amber, gold and flame-white
  const FIRE_PALETTE = [
    '#000000', '#100000', '#250200', '#3b0600',
    '#550d00', '#741500', '#951f00', '#b62a00',
    '#d63700', '#e94800', '#f55c00', '#ff7300',
    '#ff8a00', '#ffa100', '#ffb700', '#ffcc00',
    '#ffe01f', '#ffeb4c', '#fff37a', '#fff8a8',
    '#fffbd2', '#ffffff'
  ];

  const maxIntensity = FIRE_PALETTE.length - 1;

  function loop() {
    if (!document.getElementById('oled-blackout-visualizer')) return;

    // Seed bottom rows with fluctuating heat
    const bottomRowOffset = (fireH - 1) * fireW;
    const secondBottomRow = (fireH - 2) * fireW;
    for (let x = 0; x < fireW; x++) {
      const heat = Math.random() > 0.12 ? maxIntensity : Math.floor(maxIntensity * 0.7);
      firePixels[bottomRowOffset + x] = heat;
      if (secondBottomRow >= 0) {
        firePixels[secondBottomRow + x] = heat;
      }
    }

    // Propagate fire upward with subtle random wind
    for (let x = 0; x < fireW; x++) {
      for (let y = 1; y < fireH; y++) {
        const fromIdx = y * fireW + x;
        const heat = firePixels[fromIdx];
        if (heat === 0) {
          firePixels[fromIdx - fireW] = 0;
        } else {
          const decay = Math.floor(Math.random() * 2.8);
          const wind = Math.floor(Math.random() * 3) - 1;
          const targetX = Math.min(fireW - 1, Math.max(0, x + wind));
          const targetIdx = (y - 1) * fireW + targetX;
          firePixels[targetIdx] = Math.max(0, heat - (decay & 1 ? 1 : 2));
        }
      }
    }

    // Render pure pitch-black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Draw crisp pixel blocks
    for (let y = 0; y < fireH; y++) {
      for (let x = 0; x < fireW; x++) {
        const val = firePixels[y * fireW + x];
        if (val > 0) {
          ctx.fillStyle = FIRE_PALETTE[Math.min(val, maxIntensity)];
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
      }
    }

    oledAnimId = requestAnimationFrame(loop);
  }

  oledAnimId = requestAnimationFrame(loop);
}

/* ============================================================
   GLOBAL WINDOW BINDINGS (WITH FULL BACKWARD COMPATIBILITY)
   ============================================================ */

window.startMindWaves = startMindWaves;
window.stopMindWaves = stopMindWaves;
window.pauseMindWaves = pauseMindWaves;
window.resumeMindWaves = resumeMindWaves;
window.toggleMindWaves = toggleMindWaves;
window.openMindWavesStudio = openMindWavesStudio;
window.closeMindWavesStudio = closeMindWavesStudio;
window.renderMindWavesWidget = renderMindWavesWidget;

// Backward-compatible aliases for alpha waves calls
window.startAlphaWaves = (preset = 'alpha') => startMindWaves(preset);
window.stopAlphaWaves = (notify = true) => stopMindWaves(notify);
window.setAlphaWavesVolume = (vol) => setWavesVolume(vol);
window.renderAlphaWavesWidget = () => renderMindWavesWidget();

window.openOledBlackoutVisualizer = openOledBlackoutVisualizer;
window.closeOledBlackoutVisualizer = closeOledBlackoutVisualizer;
window.isOledBlackoutActive = isOledBlackoutActive;
