// @ts-nocheck
// Split out of reader.js (no behaviour change). Shared reader helpers come back in through ./reader.js.
/* ============================================================
   AUTO-SCROLL & TELEPROMPTER FLOW CONTROLLER ENGINE
   ============================================================ */
let autoScrollFrameId = null;
let autoScrollLastTimestamp = 0;
let isAutoScrollPaused = false;
let autoScrollSpeed = 1.0; // Multiplier: 0.5x, 1.0x, 1.5x, 2.0x, 3.0x
export function getAutoScrollSpeed() { return autoScrollSpeed; }
export function setAutoScrollSpeed(v) { autoScrollSpeed = v; }

export function startAutoScroll() {
  if (window.State.view !== 'reader') return;
  stopAutoScroll();
  window.State.autoScrollEnabled = true;
  isAutoScrollPaused = false;
  renderAutoScrollController();

  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;

  const basePixelsPerSec = 45; // Smooth teleprompter base speed

  const step = (timestamp) => {
    if (!window.State.autoScrollEnabled || window.State.view !== 'reader') {
      stopAutoScroll();
      return;
    }

    if (!autoScrollLastTimestamp) autoScrollLastTimestamp = timestamp;
    const deltaSec = (timestamp - autoScrollLastTimestamp) / 1000;
    autoScrollLastTimestamp = timestamp;

    if (!isAutoScrollPaused && deltaSec > 0 && deltaSec < 0.1) {
      const mode = window.State.readingMode;
      if (mode === 'continuous') {
        const moveDist = basePixelsPerSec * autoScrollSpeed * deltaSec;
        scrollEl.scrollTop += moveDist;

        // Stop if reached bottom
        if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4) {
          window.toast('Reached end of document');
          stopAutoScroll();
          return;
        }
      }
    }

    autoScrollFrameId = requestAnimationFrame(step);
  };

  autoScrollLastTimestamp = performance.now();
  autoScrollFrameId = requestAnimationFrame(step);
  window.toast('Auto-Scroll started (Continuous reading flow)');
}

export function stopAutoScroll() {
  if (autoScrollFrameId) {
    cancelAnimationFrame(autoScrollFrameId);
    autoScrollFrameId = null;
  }
  autoScrollLastTimestamp = 0;
  window.State.autoScrollEnabled = false;
  isAutoScrollPaused = false;
  removeAutoScrollController();
}

export function toggleAutoScrollPause() {
  isAutoScrollPaused = !isAutoScrollPaused;
  renderAutoScrollController();
  if (isAutoScrollPaused) {
    window.toast('Auto-Scroll Paused');
  } else {
    autoScrollLastTimestamp = performance.now();
    window.toast('Auto-Scroll Resumed');
  }
}

export function adjustAutoScrollSpeed(delta) {
  const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
  let curIdx = speeds.indexOf(autoScrollSpeed);
  if (curIdx === -1) curIdx = 3; // default 1.0
  const nextIdx = Math.max(0, Math.min(speeds.length - 1, curIdx + delta));
  autoScrollSpeed = speeds[nextIdx];
  renderAutoScrollController();
  window.toast(`Auto-Scroll speed: ${autoScrollSpeed}x`);
}

export function renderAutoScrollController() {
  if (window.State.view !== 'reader' || !window.State.autoScrollEnabled) {
    removeAutoScrollController();
    return;
  }

  let ctrl = document.getElementById('auto-scroll-controller');
  if (!ctrl) {
    ctrl = document.createElement('div');
    ctrl.id = 'auto-scroll-controller';
    document.body.appendChild(ctrl);
  }

  ctrl.innerHTML = `
    <div class="autoscroll-badge">
      <span class="autoscroll-dot ${isAutoScrollPaused ? 'paused' : ''}"></span>
      <span>${isAutoScrollPaused ? 'Paused' : 'Auto Scroll'}</span>
    </div>

    <button class="autoscroll-btn" id="as-slower-btn" title="Slower speed">
      −
    </button>

    <div class="autoscroll-speed-label" id="as-speed-val">${autoScrollSpeed}x</div>

    <button class="autoscroll-btn" id="as-faster-btn" title="Faster speed">
      +
    </button>

    <button class="autoscroll-btn play-btn" id="as-pause-play-btn" title="${isAutoScrollPaused ? 'Resume' : 'Pause'}">
      ${isAutoScrollPaused ? '▶' : '⏸'}
    </button>

    <button class="autoscroll-btn" id="as-close-btn" style="color:var(--text-dim);" title="Exit Auto-Scroll">
      ✕
    </button>
  `;

  document.getElementById('as-slower-btn').onclick = (e) => { e.stopPropagation(); adjustAutoScrollSpeed(-1); };
  document.getElementById('as-faster-btn').onclick = (e) => { e.stopPropagation(); adjustAutoScrollSpeed(1); };
  document.getElementById('as-pause-play-btn').onclick = (e) => { e.stopPropagation(); toggleAutoScrollPause(); };
  document.getElementById('as-close-btn').onclick = (e) => {
    e.stopPropagation();
    stopAutoScroll();
    window.toast('Auto-Scroll stopped');
  };
}

export function removeAutoScrollController() {
  const ctrl = document.getElementById('auto-scroll-controller');
  if (ctrl) ctrl.remove();
}
