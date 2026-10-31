// @ts-nocheck
import { fixLegacyHindi, pageIsLegacyHindi } from './hindi_fix.js';

/* Is this whole book legacy-font (Kruti Dev) Hindi? Sampled once per document; used so bookmarks and contents lines get converted too. */
async function docIsLegacyHindi(doc) {
  if (!doc) return false;
  if (doc.__legacyHindi !== undefined) return doc.__legacyHindi;
  let txt = '';
  try {
    const n = doc.numPages || 1;
    const pages = [...new Set([1, 2, 3, 4, 5, Math.ceil(n / 2), Math.ceil(n / 2) + 1].filter((x) => x >= 1 && x <= n))];
    for (const p of pages) {
      const tc = await (await doc.getPage(p)).getTextContent({ normalizeWhitespace: true });
      txt += ' ' + tc.items.map((i) => i.str).join(' ');
      if (txt.length > 6000) break;
    }
  } catch (e) {}
  doc.__legacyHindi = pageIsLegacyHindi(txt);
  return doc.__legacyHindi;
}
function fixTocText(str, legacy) {
  if (!str) return str;
  if (!legacy) return fixLegacyHindi(str);
  // Kruti Dev writes the colon after "पाठ 1" as a percent sign
  return fixLegacyHindi(str, { pageLegacy: true, force: true }).replace(/\s*%\s*/g, ' : ').replace(/\s{2,}/g, ' ').trim();
}

export let pageEls = {};
let tesseractWorker = null;
let wakeLockRef = null;

// Expose pageEls globally so selection.js can look up bounding box entries
window.pageEls = pageEls;

// Setup PDF.js worker explicitly with fallback
// pdf.js, its worker, CMaps and standard fonts are served from this app's own origin
// (/public/pdfjs). That removes a cross-origin round trip, works offline via the service
// worker cache, and keeps the library version locked to the one in package.json.
const PDFJS_LOCAL_WORKER = '/pdfjs/pdf.worker.min.js';
const PDFJS_LOCAL_CMAPS = '/pdfjs/cmaps/';
const PDFJS_LOCAL_FONTS = '/pdfjs/standard_fonts/';

if (typeof window !== 'undefined' && window.pdfjsLib) {
  try {
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_LOCAL_WORKER;
    }
  } catch(e) {}
}

export const PDFJS_LOAD_OPTS = {
  cMapUrl: PDFJS_LOCAL_CMAPS,
  cMapPacked: true,
  standardFontDataUrl: PDFJS_LOCAL_FONTS,
  disableFontFace: false,
  useSystemFonts: false,
  stopAtErrors: false,
  verbosity: 0,
};
window.PDFJS_LOAD_OPTS = PDFJS_LOAD_OPTS;

/**
 * Multi-tier resilient PDF Document loader.
 * Gracefully tries primary unpkg CDN, fallback jsDelivr CDN, and direct parsing with FULL embedded font rendering.
 */
export async function loadPdfDocumentSafely(rawBuffer, password = null) {
  if (!rawBuffer || rawBuffer.byteLength === 0) {
    throw new Error('PDF buffer is empty or missing');
  }

  // Ensure worker is configured
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_LOCAL_WORKER;
  }

  // Tier 1: Local CMaps & Standard Fonts (FoxitSerif, LiberationSans, etc.)
  try {
    const opts1 = {
      data: new Uint8Array(rawBuffer.slice(0)),
      cMapUrl: PDFJS_LOCAL_CMAPS,
      cMapPacked: true,
      standardFontDataUrl: PDFJS_LOCAL_FONTS,
      disableFontFace: false,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    };
    if (password) opts1.password = password;
    const task = window.pdfjsLib.getDocument(opts1);
    return await task.promise;
  } catch (err1) {
    if (err1 && (err1.name === 'PasswordException' || err1.message?.toLowerCase().includes('password'))) {
      throw err1;
    }
    console.warn('[PDF Loader] Tier 1 (local) failed, trying Tier 2 (jsDelivr CDN)...', err1?.message);
  }

  // Tier 2: Fallback jsDelivr CDN with complete standard fonts
  try {
    const opts2 = {
      data: new Uint8Array(rawBuffer.slice(0)),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/',
      disableFontFace: false,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    };
    if (password) opts2.password = password;
    const task = window.pdfjsLib.getDocument(opts2);
    return await task.promise;
  } catch (err2) {
    if (err2 && (err2.name === 'PasswordException' || err2.message?.toLowerCase().includes('password'))) {
      throw err2;
    }
    console.warn('[PDF Loader] Tier 2 failed, trying Tier 3 (Direct Byte Buffer)...', err2?.message);
  }

  // Tier 3: Direct TypedArray parser with standard font-face enabled
  try {
    const opts3 = {
      data: new Uint8Array(rawBuffer.slice(0)),
      disableFontFace: false,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    };
    if (password) opts3.password = password;
    const task = window.pdfjsLib.getDocument(opts3);
    return await task.promise;
  } catch (err3) {
    if (err3 && (err3.name === 'PasswordException' || err3.message?.toLowerCase().includes('password'))) {
      throw err3;
    }
    console.warn('[PDF Loader] Tier 3 failed, trying Tier 4 (Fallback Raw Buffer)...', err3?.message);
  }

  // Tier 4: Direct raw ArrayBuffer
  const opts4 = {
    data: rawBuffer.slice(0),
    stopAtErrors: false,
    verbosity: 0,
  };
  if (password) opts4.password = password;
  const task = window.pdfjsLib.getDocument(opts4);
  return await task.promise;
}
window.loadPdfDocumentSafely = loadPdfDocumentSafely;

let pageVpCache = {};
let pageVpCacheDoc = null;

// Single place that swaps the open pdf.js document, so the previous one is always destroyed
// (an undestroyed PDFDocumentProxy stays parsed in memory inside the pdf.js worker).
export function setCurrentDoc(doc){
  const previous = window.State.currentDoc;
  window.State.currentDoc = doc;
  if (previous && previous !== doc && typeof previous.destroy === 'function') {
    previous.destroy().catch(() => {});
  }
}
window.setCurrentDoc = setCurrentDoc;

export async function openReader(fileId, jumpToPage, pageList, pageListLabel){
  const full = await window.DB.get('files', fileId);
  if(!full){ window.toast('Book not found'); return; }

  // Extract raw buffer safely FIRST before any DB updates to prevent detachment
  let rawBuffer = await window.DB.normalizeBuffer(full.data);

  // Update lastOpened metadata safely without losing binary data
  try {
    await window.DB.updateFileMeta(fileId, { lastOpened: Date.now(), hideFromRecents: false });
  } catch (e) {
    console.warn('Could not update lastOpened metadata:', e);
  }

  const cleanMeta = { ...full, data: undefined };
  const idx = window.State.files.findIndex(f=>f.id===fileId);
  if(idx>-1) window.State.files[idx] = cleanMeta;

  // Metadata only: nothing reads the bytes from State.currentFile, and keeping them here held a
  // second full copy of the PDF in memory for as long as the app stayed open.
  const { data: _fullBytes, ...fileMeta } = full;
  window.State.currentFile = fileMeta;
  const progress = await window.DB.get('progress', fileId);
  window.State.currentPage = jumpToPage || (pageList && pageList[0]) || progress?.page || 1;
  window.State.zoom = 1;
  window.State.view = 'reader';
  window.State.pageList = pageList || null;
  window.State.pageListLabel = pageListLabel || '';

  if (typeof window.pushAppScreen === 'function') {
    window.pushAppScreen('reader');
  } else if (typeof window.ensureHistoryStack === 'function') {
    window.ensureHistoryStack();
  }

  if (typeof window.startReadingSession === 'function') {
    window.startReadingSession();
  }

  renderReaderShell();

  if (!rawBuffer || rawBuffer.byteLength === 0) {
    // If buffer is missing in memory, try re-fetching from DB one more time
    const fresh = await window.DB.get('files', fileId);
    rawBuffer = await window.DB.normalizeBuffer(fresh?.data);
  }

  if (!rawBuffer || rawBuffer.byteLength === 0) {
    console.error('File data buffer is empty or missing for file:', fileId);
    renderCorrupted(fileId, full.name);
    return;
  }

  try{
    const doc = await loadPdfDocumentSafely(rawBuffer);
    setCurrentDoc(doc);
    window.State.numPages = doc.numPages;
    if (typeof applyOrientationLock === 'function') {
      applyOrientationLock(window.State.screenOrientationMode || 'auto');
    }
    // Background warm-up of TOC destinations, chapter spans, and subtitles
    try {
      resolveAndCacheTOC(doc, fileId).catch(() => {});
    } catch(e) {}
    await mountReaderContent();
  }catch(err){
    if(err && (err.name === 'PasswordException' || err.message?.toLowerCase().includes('password'))){
      promptPassword(full, rawBuffer);
    }else{
      console.error('Failed to open PDF document:', err);
      renderCorrupted(fileId, full.name);
    }
  }
}

export function getCurrentPageText() {
  const curPage = window.State.currentPage || 1;
  const pe = window.pageEls?.[curPage];
  if (pe && pe.wrap) {
    const textLayer = pe.wrap.querySelector('.text-layer') || pe.wrap;
    const txt = textLayer.innerText || textLayer.textContent || '';
    if (txt.trim()) return fixLegacyHindi(txt.trim(), { pageLegacy: pageIsLegacyHindi(txt) });
  }
  return '';
}

export function toggleReaderChrome(forceShow) {
  if (window.State.isFocusMode) {
    // In Focus Mode, header and bottom bar are strictly kept hidden
    forceShow = false;
  }
  const header = document.getElementById('reader-header-bar');
  const bottomBar = document.getElementById('reader-bottom-bar');
  const collectionBar = document.getElementById('collection-bar');

  const isHidden = header?.classList.contains('chrome-hidden');
  const show = (forceShow !== undefined) ? forceShow : isHidden;

  if (header) {
    header.classList.toggle('chrome-hidden', !show);
    header.style.transform = show ? 'translateY(0)' : 'translateY(-100%)';
    header.style.opacity = show ? '1' : '0';
    header.style.pointerEvents = show ? 'auto' : 'none';
  }
  if (bottomBar) {
    const isAllowed = window.State.showBottomBar === true;
    if (!isAllowed) {
      bottomBar.style.display = 'none';
    } else {
      bottomBar.style.display = 'flex';
      bottomBar.classList.toggle('chrome-hidden', !show);
      bottomBar.style.transform = show ? 'translateY(0)' : 'translateY(100%)';
      bottomBar.style.opacity = show ? '1' : '0';
      bottomBar.style.pointerEvents = show ? 'auto' : 'none';
    }
  }
  if (collectionBar) {
    collectionBar.style.display = show ? 'flex' : 'none';
  }
}

export function openPageJumperModal() {
  const total = window.State.numPages || 1;
  const current = window.State.currentPage || 1;
  const pct = Math.round((current / total) * 100);

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
          ${window.icon('compass','icon icon-sm')} <span>Page Navigation & Scrubber</span>
        </div>
        <button id="close-jumper-modal-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
          ${window.icon('x','icon icon-sm')}
        </button>
      </div>

      <div style="text-align:center; padding:12px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; margin-bottom:18px;">
        <div style="font-size:24px; font-weight:800; color:var(--text);" id="jumper-page-val">Page ${current}</div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">out of ${total} pages (${pct}% read)</div>
      </div>

      <div style="margin-bottom:20px; padding:0 4px;">
        <input type="range" id="jumper-slider" min="1" max="${total}" value="${current}" style="width:100%; accent-color:var(--accent); cursor:pointer;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-dim); margin-top:6px; font-family:var(--font-mono);">
          <span>Page 1</span>
          <span>50%</span>
          <span>Page ${total}</span>
        </div>
      </div>

      <!-- Quick Jump Presets -->
      <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; margin-bottom:16px;">
        <button class="chip jumper-preset" data-pct="0" style="flex:1; justify-content:center; text-align:center; font-weight:700;">First</button>
        <button class="chip jumper-preset" data-pct="25" style="flex:1; justify-content:center; text-align:center; font-weight:700;">25%</button>
        <button class="chip jumper-preset" data-pct="50" style="flex:1; justify-content:center; text-align:center; font-weight:700;">50%</button>
        <button class="chip jumper-preset" data-pct="75" style="flex:1; justify-content:center; text-align:center; font-weight:700;">75%</button>
        <button class="chip jumper-preset" data-pct="100" style="flex:1; justify-content:center; text-align:center; font-weight:700;">Last</button>
      </div>

      <button class="btn btn-primary" id="confirm-jump-btn" style="width:100%; padding:13px; font-weight:700;">
        Jump to Page
      </button>
    </div>
  `);

  const closeX = document.getElementById('close-jumper-modal-x');
  if (closeX) closeX.onclick = () => window.Sheet.close();

  const slider = document.getElementById('jumper-slider');
  const label = document.getElementById('jumper-page-val');

  if (slider && label) {
    slider.oninput = () => {
      const p = Number(slider.value);
      label.textContent = `Page ${p}`;
    };
    slider.onchange = () => {
      const p = Number(slider.value);
      if (window.State.readingMode === 'single') {
        showSinglePage(p);
      } else {
        scrollToPage(p);
      }
    };
  }

  document.querySelectorAll('.jumper-preset').forEach(btn => {
    btn.onclick = () => {
      const pctVal = Number(btn.dataset.pct);
      const p = Math.max(1, Math.min(total, Math.round((pctVal / 100) * total)));
      if (slider) slider.value = p;
      if (label) label.textContent = `Page ${p}`;
      if (window.State.readingMode === 'single') {
        showSinglePage(p);
      } else {
        scrollToPage(p);
      }
      window.Sheet.close();
    };
  });

  const confirmBtn = document.getElementById('confirm-jump-btn');
  if (confirmBtn && slider) {
    confirmBtn.onclick = () => {
      const p = Number(slider.value);
      if (window.State.readingMode === 'single') {
        showSinglePage(p);
      } else {
        scrollToPage(p);
      }
      window.Sheet.close();
    };
  }
}

export function toggleFocusMode(enable) {
  window.State.isFocusMode = (enable === undefined) ? !window.State.isFocusMode : !!enable;
  const scrollContainer = document.getElementById('reader-scroll');
  let exitBtn = document.getElementById('exit-focus-mode-btn');

  if (window.State.isFocusMode) {
    toggleReaderChrome(false);
    if (scrollContainer) scrollContainer.style.paddingTop = '12px';

    if (!exitBtn) {
      exitBtn = document.createElement('button');
      exitBtn.id = 'exit-focus-mode-btn';
      exitBtn.className = 'btn btn-icon';
      exitBtn.title = 'Exit Focus Mode';
      exitBtn.style.cssText = 'position:fixed; top:12px; right:14px; z-index:99; background:var(--surface-2); border:1px solid var(--border); box-shadow:0 3px 12px rgba(0,0,0,0.25); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--text); cursor:pointer;';
      exitBtn.innerHTML = window.icon('x', 'icon icon-sm');
      document.body.appendChild(exitBtn);
    } else {
      exitBtn.style.display = 'flex';
    }

    exitBtn.onclick = () => {
      toggleFocusMode(false);
      window.toast('Focus Mode exited');
    };
  } else {
    toggleReaderChrome(true);
    if (scrollContainer) {
      scrollContainer.style.paddingTop = window.State.pageList ? '96px' : '64px';
    }
    if (exitBtn) {
      exitBtn.style.display = 'none';
    }
  }
}

/* ============================================================
   AUTO-SCROLL & TELEPROMPTER FLOW CONTROLLER ENGINE
   ============================================================ */
let autoScrollFrameId = null;
let autoScrollLastTimestamp = 0;
let isAutoScrollPaused = false;
let autoScrollSpeed = 1.0; // Multiplier: 0.5x, 1.0x, 1.5x, 2.0x, 3.0x

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


export function openReaderSettings(){
  if (window.hideSelToolbar) window.hideSelToolbar();
  window.pendingSelection = null;
  const file = window.State.currentFile;
  const currentGoal = window.State.readingGoalMinutes || 0;
  const sessionStart = window.State.sessionStartTime || Date.now();
  const elapsedMs = Math.max(0, Date.now() - sessionStart);
  const elapsedMins = Math.floor(elapsedMs / 60000);
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
  const isFocus = !!window.State.isFocusMode;
  const isAlphaWaves = !!window.State.alphaWavesEnabled;

  if (window._readerSettingsTimer) {
    clearInterval(window._readerSettingsTimer);
    window._readerSettingsTimer = null;
  }

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div class="font-display" style="font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px; color:var(--text);">
          ${window.icon('settings','icon icon-sm')} <span>Reader Settings</span>
        </div>
      </div>

      <!-- 1. Reading Goal Section -->
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="font-size:14px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
            ${window.icon('clock','icon icon-xs')} 🎯 Reading Goal Tracker
          </div>
          <span id="reader-settings-goal-badge" style="font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:10px; background:${currentGoal > 0 ? 'var(--accent-soft)' : 'var(--bg-elev)'}; color:${currentGoal > 0 ? 'var(--accent)' : 'var(--text-dim)'}; border:1px solid ${currentGoal > 0 ? 'var(--accent)' : 'var(--border)'};">
            ${currentGoal > 0 ? `${currentGoal} min Goal` : 'Off'}
          </span>
        </div>

        <div id="reader-settings-goal-content">
          ${currentGoal > 0 ? `
            <div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
                <span id="reader-settings-session-time">Time: ${elapsedMins > 0 ? `${elapsedMins}m ` : ''}${elapsedSecs}s / ${currentGoal}m</span>
                <span id="reader-settings-session-pct" style="color:var(--accent);">${Math.min(100, Math.round((elapsedMs / (currentGoal * 60000)) * 100))}%</span>
              </div>
              <div style="width:100%; height:6px; background:var(--surface-2); border-radius:3px; overflow:hidden; border:1px solid var(--border);">
                <div id="reader-settings-session-fill" style="width:${Math.min(100, Math.round((elapsedMs / (currentGoal * 60000)) * 100))}%; height:100%; background:var(--accent); border-radius:3px; transition:width 0.3s ease;"></div>
              </div>
            </div>
          ` : `
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px; line-height:1.4;">
              Track your reading time systematically. Set a target session goal below.
            </div>
          `}
        </div>

        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; margin-bottom:10px;">
          <button class="btn ${currentGoal === 0 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="0" style="padding:8px 2px; font-size:12px; font-weight:600;">Off</button>
          <button class="btn ${currentGoal === 5 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="5" style="padding:8px 2px; font-size:12px; font-weight:600;">5m</button>
          <button class="btn ${currentGoal === 15 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="15" style="padding:8px 2px; font-size:12px; font-weight:600;">15m</button>
          <button class="btn ${currentGoal === 30 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="30" style="padding:8px 2px; font-size:12px; font-weight:600;">30m</button>
          <button class="btn ${currentGoal === 45 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="45" style="padding:8px 2px; font-size:12px; font-weight:600;">45m</button>
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
          <input type="number" id="custom-goal-input" min="1" max="600" placeholder="Custom mins (e.g. 60)…" value="${[0,5,15,30,45].includes(currentGoal) ? '' : currentGoal}" style="flex:1; padding:9px 12px; font-size:13px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text);" />
          <button class="btn btn-primary" id="set-custom-goal" style="padding:9px 14px; font-size:12.5px; font-weight:600; width:auto;">Set Goal</button>
        </div>
      </div>

      <!-- Settings List: Option 5 (AI Study Tools) + Option 2 (Focus Mode) + Option 3 (Read Aloud) + Option 4 (Reading Themes) -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <!-- Option 5: AI Study Tools -->
        <button class="btn" id="open-ai-study-tools-btn" style="width:100%; padding:14px; background:var(--surface-2); border:1.5px solid var(--accent); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:10px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('sparkle','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:14px; font-weight:700; color:var(--text);">✨ AI Study Tools</div>
              <div style="font-size:11.5px; color:var(--text-dim);">Summarize, Flashcards, MCQs & Notes</div>
            </div>
          </div>
          <span style="color:var(--accent); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
        </button>

        <!-- Option 2: Focus Mode -->
        <button class="btn" id="toggle-focus-mode-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid ${isFocus ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:${isFocus ? 'var(--accent)' : 'var(--bg-elev)'}; color:${isFocus ? '#fff' : 'var(--text-dim)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('zoomIn','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Focus Mode</div>
              <div style="font-size:11px; color:var(--text-dim);">Hide toolbars & read in distraction-free full screen</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${isFocus ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 3: Hands-free Read Aloud & Voices -->
        <button class="btn" id="open-tts-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('volume','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">🔊 Hands-free Read Aloud & Voices</div>
              <div style="font-size:11px; color:var(--text-dim);">Select Male, Female, Deep voice, pitch & speed</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="color:var(--accent); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 4: Reading Themes & Layout -->
        <button class="btn" id="open-themes-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--bg-elev); color:var(--text-dim); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('sun','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Reading Themes & Layout</div>
              <div style="font-size:11px; color:var(--text-dim);">Light, Night, Sepia & scroll options</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--bg-elev); color:var(--text-dim); border:1px solid var(--border); text-transform:capitalize;">${window.State.theme || 'light'}</span>
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 6: Draw & Annotations (Fabric.js) -->
        <button class="btn" id="open-markup-toolbar-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid ${window.isMarkupModeActive && window.isMarkupModeActive() ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:${window.isMarkupModeActive && window.isMarkupModeActive() ? 'var(--accent)' : 'var(--accent-soft)'}; color:${window.isMarkupModeActive && window.isMarkupModeActive() ? '#fff' : 'var(--accent)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px;">
              ✏️
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Draw & Annotations</div>
              <div style="font-size:11px; color:var(--text-dim);">Pen, shapes, arrows, colors & eraser</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${window.isMarkupModeActive && window.isMarkupModeActive() ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 7: Advanced Settings -->
        <button class="btn" id="open-advanced-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--bg-elev); color:var(--text); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('settings','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Advanced Settings</div>
              <div style="font-size:11px; color:var(--text-dim);">Hide status bar, navigation bar & orientation tips</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${(window.State.hideStatusBar || window.State.hideNavigationBar) ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>
      </div>
    </div>
  `);

  if (currentGoal > 0) {
    window._readerSettingsTimer = setInterval(() => {
      const timeEl = document.getElementById('reader-settings-session-time');
      const pctEl = document.getElementById('reader-settings-session-pct');
      const fillEl = document.getElementById('reader-settings-session-fill');
      if (!timeEl) {
        clearInterval(window._readerSettingsTimer);
        window._readerSettingsTimer = null;
        return;
      }
      const sStart = window.State.sessionStartTime || Date.now();
      const eMs = Math.max(0, Date.now() - sStart);
      const eMins = Math.floor(eMs / 60000);
      const eSecs = Math.floor((eMs % 60000) / 1000);
      const targetMs = currentGoal * 60000;
      const pct = Math.min(100, Math.round((eMs / targetMs) * 100));

      timeEl.textContent = `Time: ${eMins > 0 ? `${eMins}m ` : ''}${eSecs}s / ${currentGoal}m`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (fillEl) fillEl.style.width = `${pct}%`;
    }, 1000);
  }

  function updateReaderGoalDOM(g) {
    document.querySelectorAll('.goal-btn').forEach(b => {
      const isMatch = Number(b.dataset.goal) === g;
      b.className = `btn ${isMatch ? 'btn-primary' : 'btn-ghost'} goal-btn`;
    });

    const badge = document.getElementById('reader-settings-goal-badge');
    if (badge) {
      badge.textContent = g > 0 ? `${g} min Goal` : 'Off';
      badge.style.background = g > 0 ? 'var(--accent-soft)' : 'var(--bg-elev)';
      badge.style.color = g > 0 ? 'var(--accent)' : 'var(--text-dim)';
      badge.style.borderColor = g > 0 ? 'var(--accent)' : 'var(--border)';
    }

    const content = document.getElementById('reader-settings-goal-content');
    if (content) {
      if (g > 0) {
        content.innerHTML = `
          <div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
              <span id="reader-settings-session-time">Time: 0s / ${g}m</span>
              <span id="reader-settings-session-pct" style="color:var(--accent);">0%</span>
            </div>
            <div style="width:100%; height:6px; background:var(--surface-2); border-radius:3px; overflow:hidden; border:1px solid var(--border);">
              <div id="reader-settings-session-fill" style="width:0%; height:100%; background:var(--accent); border-radius:3px; transition:width 0.3s ease;"></div>
            </div>
          </div>`;
      } else {
        content.innerHTML = `
          <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px; line-height:1.4;">
            Track your reading time systematically. Set a target session goal below.
          </div>`;
      }
    }

    if (window._readerSettingsTimer) {
      clearInterval(window._readerSettingsTimer);
      window._readerSettingsTimer = null;
    }
    if (g > 0) {
      window._readerSettingsTimer = setInterval(() => {
        const timeEl = document.getElementById('reader-settings-session-time');
        const pctEl = document.getElementById('reader-settings-session-pct');
        const fillEl = document.getElementById('reader-settings-session-fill');
        if (!timeEl) {
          clearInterval(window._readerSettingsTimer);
          window._readerSettingsTimer = null;
          return;
        }
        const sStart = window.State.sessionStartTime || Date.now();
        const eMs = Math.max(0, Date.now() - sStart);
        const eMins = Math.floor(eMs / 60000);
        const eSecs = Math.floor((eMs % 60000) / 1000);
        const targetMs = g * 60000;
        const pct = Math.min(100, Math.round((eMs / targetMs) * 100));

        timeEl.textContent = `Time: ${eMins > 0 ? `${eMins}m ` : ''}${eSecs}s / ${g}m`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (fillEl) fillEl.style.width = `${pct}%`;
      }, 1000);
    }
  }

  const goalBtns = document.querySelectorAll('.goal-btn');
  goalBtns.forEach(btn => {
    btn.onclick = () => {
      const g = Number(btn.dataset.goal);
      window.State.readingGoalMinutes = g;
      window.State.goalCompletedNotified = false;
      window.State.sessionStartTime = Date.now();
      if (file && window.DB) {
        window.DB.updateFileMeta(file.id, { readingGoalMinutes: g }).catch(console.error);
      }
      window.toast(g > 0 ? `Reading Goal set to ${g} minutes` : 'Reading Goal turned Off');
      updateReaderGoalDOM(g);
    };
  });

  const customInput = document.getElementById('custom-goal-input');
  const setCustomBtn = document.getElementById('set-custom-goal');
  if (setCustomBtn && customInput) {
    setCustomBtn.onclick = () => {
      const val = parseInt(customInput.value, 10);
      if (val && val > 0) {
        window.State.readingGoalMinutes = val;
        window.State.goalCompletedNotified = false;
        window.State.sessionStartTime = Date.now();
        if (file && window.DB) {
          window.DB.updateFileMeta(file.id, { readingGoalMinutes: val }).catch(console.error);
        }
        window.toast(`Reading Goal set to ${val} minutes`);
        updateReaderGoalDOM(val);
      } else {
        window.toast('Please enter a valid number of minutes');
      }
    };
  }

  const aiToolsBtn = document.getElementById('open-ai-study-tools-btn');
  if (aiToolsBtn) {
    aiToolsBtn.onclick = () => {
      window.openAIMenu(true);
    };
  }

  const focusBtn = document.getElementById('toggle-focus-mode-btn');
  if (focusBtn) {
    focusBtn.onclick = () => {
      const next = !window.State.isFocusMode;
      window.Sheet.close();
      toggleFocusMode(next);
      if (next) {
        window.toast('Focus Mode enabled. Click ✕ on top right to exit.');
      } else {
        window.toast('Focus Mode turned Off.');
      }
    };
  }

  const ttsSettingsBtn = document.getElementById('open-tts-settings-btn');
  if (ttsSettingsBtn) {
    ttsSettingsBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.openHandsFreeReadAloud === 'function') {
        window.openHandsFreeReadAloud();
      } else if (typeof window.openVoiceSettingsModal === 'function') {
        window.openVoiceSettingsModal();
      }
    };
  }

  const themesBtn = document.getElementById('open-themes-settings-btn');
  if (themesBtn) {
    themesBtn.onclick = () => {
      openReadingThemesModal();
    };
  }

  const markupBtn = document.getElementById('open-markup-toolbar-btn');
  if (markupBtn) {
    markupBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.toggleMarkupToolbar === 'function') {
        window.toggleMarkupToolbar();
      }
    };
  }

  const advBtn = document.getElementById('open-advanced-settings-btn');
  if (advBtn) {
    advBtn.onclick = () => {
      openAdvancedSettingsModal();
    };
  }
}

export function applyAdvancedReaderSettings() {
  const isImmersive = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);
  const isSelDisabled = window.State.disableTextSelection === true;
  const selColor = window.State.selectionColor || '#2FC6BC';

  document.documentElement.style.setProperty('--selection-color', selColor);
  document.body.classList.toggle('selection-disabled', isSelDisabled);
  document.body.classList.toggle('hide-system-status-bar', isImmersive);
  document.body.classList.toggle('hide-system-nav-bar', isImmersive);

  const headerBar = document.getElementById('reader-header-bar');
  if (headerBar) {
    if (isImmersive) {
      headerBar.classList.add('status-bar-hidden');
    } else {
      headerBar.classList.remove('status-bar-hidden');
    }
  }

  const bottomBar = document.getElementById('reader-bottom-bar');
  const scrollEl = document.getElementById('reader-scroll');
  if (bottomBar) {
    if (isImmersive) {
      bottomBar.style.display = 'none';
      if (scrollEl) scrollEl.style.paddingBottom = '12px';
    } else if (window.State.view === 'reader') {
      const isAllowed = window.State.showBottomBar === true;
      bottomBar.style.display = isAllowed ? 'flex' : 'none';
      if (scrollEl) scrollEl.style.paddingBottom = isAllowed ? '68px' : '24px';
    }
  }
}

export async function updateSystemImmersiveMode() {
  const isImmersive = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);

  applyAdvancedReaderSettings();

  // Native Fullscreen API to hide phone OS status bar (clock/battery) & system navigation bar
  if (isImmersive) {
    if (!document.fullscreenElement) {
      try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen().catch(() => {});
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen().catch(() => {});
        }
      } catch (err) {
        console.warn('[Immersive] Request fullscreen error:', err);
      }
    }
  } else {
    if (document.fullscreenElement) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen().catch(() => {});
        }
      } catch (err) {
        console.warn('[Immersive] Exit fullscreen error:', err);
      }
    }
  }
}

export async function applyOrientationLock(mode) {
  window.State.screenOrientationMode = mode || 'auto';
  if (window.DB && window.DB.setting) {
    await window.DB.setting('screenOrientationMode', window.State.screenOrientationMode);
  }

  // Use Screen Orientation API if available
  if (window.screen && window.screen.orientation) {
    try {
      if (mode === 'portrait') {
        if (typeof window.screen.orientation.lock === 'function') {
          await window.screen.orientation.lock('portrait').catch(() => {});
        }
      } else if (mode === 'landscape') {
        if (typeof window.screen.orientation.lock === 'function') {
          await window.screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        // Auto - follow device sensor / system orientation lock
        if (typeof window.screen.orientation.unlock === 'function') {
          window.screen.orientation.unlock();
        }
      }
    } catch (e) {
      console.warn('[Orientation] Screen orientation lock notice:', e);
    }
  }

  // Trigger responsive reader update
  if (window.State.view === 'reader' && typeof window.updateReaderZoom === 'function') {
    setTimeout(() => {
      window.updateReaderZoom(true);
    }, 150);
  }
}
window.applyOrientationLock = applyOrientationLock;

export function openAdvancedSettingsModal() {
  const isImmersive = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);
  const selColor = window.State.selectionColor || '#FF4D6D';
  const isSelDisabled = window.State.disableTextSelection === true;
  const doubleTapAction = window.State.doubleTapAction || 'zoom';
  const isAutoScroll = window.State.autoScrollEnabled === true;
  const currentAutoSpeed = autoScrollSpeed || 1.5;
  const isReadAloudOled = window.State.readAloudOledVisualizer !== false;
  const oledStyle = (window.State.oledStyle === 'blank' || window.State.oledStyle === 'fire') ? window.State.oledStyle : 'bouncing';
  const soundscape = window.State.soundscape || (window.State.alphaWavesEnabled ? 'alpha' : 'off');
  const orientationMode = window.State.screenOrientationMode || 'auto';

  const SELECTION_COLORS = [
    { id: 'pink', label: 'Vivid Pink', color: '#FF4D6D' },
    { id: 'orange', label: 'Radiant Orange', color: '#FF6A00' },
    { id: 'teal', label: 'Cyan Teal', color: '#2FC6BC' },
    { id: 'blue', label: 'Royal Blue', color: '#3B82F6' },
    { id: 'purple', label: 'Amethyst', color: '#8B5CF6' },
    { id: 'gold', label: 'Amber Gold', color: '#F59E0B' },
    { id: 'green', label: 'Emerald Mint', color: '#10B981' },
    { id: 'slate', label: 'Slate Navy', color: '#64748B' }
  ];

  const activeColorObj = SELECTION_COLORS.find(c => c.color.toLowerCase() === selColor.toLowerCase()) || SELECTION_COLORS[0];

  window.Sheet.open(`
    <div class="adv-modal-container">
      <!-- Minimalist Header -->
      <div class="adv-modal-header">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <div class="adv-header-mark">
            ⚙
          </div>
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:6px;">
              <h3 class="font-display adv-modal-title">Reader Inspector</h3>
              <span class="adv-pro-badge">PRO</span>
            </div>
            <p class="adv-modal-subtitle">Reading mechanics, gestural flow & soundscapes</p>
          </div>
        </div>
        <button id="close-advanced-modal-x" class="adv-modal-close-btn" aria-label="Close">
          ✕
        </button>
      </div>

      <!-- Linear Segmented Tabs -->
      <div class="adv-tabs-bar" role="tablist">
        <button class="adv-tab-btn active" data-tab="tab-colors" role="tab" aria-selected="true">
          Highlights
        </button>
        <button class="adv-tab-btn" data-tab="tab-gestures" role="tab" aria-selected="false">
          Gestures & Flow
        </button>
        <button class="adv-tab-btn" data-tab="tab-audio" role="tab" aria-selected="false">
          Audio & Focus
        </button>
      </div>

      <!-- TAB 1: HIGHLIGHTS & COLOR -->
      <div id="adv-pane-tab-colors" class="adv-tab-pane active">
        <!-- Minimal Preview Strip -->
        <div class="adv-preview-strip">
          <div class="adv-preview-strip-head">
            <span>LIVE INTERACTIVE PREVIEW</span>
            <span id="adv-active-color-tag" style="color:var(--text); font-weight:700;">${activeColorObj.label}</span>
          </div>
          <div class="adv-preview-strip-body">
            Active text selection highlight: <span id="adv-preview-highlight" class="adv-preview-mark" style="background:${activeColorObj.color}33; color:var(--text); outline:1px solid ${activeColorObj.color};">Smart Reader Aura</span> with immediate AI actions.
          </div>
        </div>

        <!-- Linear Swatch Ribbon -->
        <div class="adv-linear-group">
          <div class="adv-linear-group-title">
            <span>Selection Accent Spectrum</span>
          </div>
          <div class="adv-ribbon-swatches">
            ${SELECTION_COLORS.map(c => {
              const isSelected = c.color.toLowerCase() === activeColorObj.color.toLowerCase();
              return `
                <div class="adv-swatch-node ${isSelected ? 'active' : ''}" data-color="${c.color}" data-label="${c.label}" style="background:${c.color};" title="${c.label}">
                  ${isSelected ? '<span class="adv-swatch-pin"></span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Linear Settings Rows -->
        <div class="adv-linear-group">
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Lock Text Selection</div>
              <div class="adv-row-sub">Suppresses selection popup during quick page panning</div>
            </div>
            <div id="adv-lock-sel-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isSelDisabled ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isSelDisabled ? 'active' : ''}">LOCK</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: GESTURES & FLOW -->
      <div id="adv-pane-tab-gestures" class="adv-tab-pane">
        <div class="adv-linear-group">
          <!-- Double Tap Action -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Double-Tap Page Action</div>
              <div class="adv-row-sub">Trigger action upon double tap anywhere on page</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-doubletap-select" class="adv-inline-select">
                <option value="zoom" ${doubleTapAction === 'zoom' ? 'selected' : ''}>Zoom / Fit Toggle</option>
                <option value="bookmark" ${doubleTapAction === 'bookmark' ? 'selected' : ''}>Bookmark Page</option>
                <option value="hide_ui" ${doubleTapAction === 'hide_ui' ? 'selected' : ''}>Zen View</option>
                <option value="ai_summary" ${doubleTapAction === 'ai_summary' ? 'selected' : ''}>AI Explain</option>
                <option value="none" ${doubleTapAction === 'none' ? 'selected' : ''}>Disabled</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>

          <!-- Continuous Auto-Scroll -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Continuous Auto-Scroll</div>
              <div class="adv-row-sub">Hands-free smooth vertical document scrolling</div>
            </div>
            <div id="adv-autoscroll-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isAutoScroll ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isAutoScroll ? 'active' : ''}">ON</span>
            </div>
          </div>

          <!-- Speed Row -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Auto-Scroll Speed</div>
              <div class="adv-row-sub">Fine-tune scrolling velocity</div>
            </div>
            <div class="adv-speed-strip">
              <button class="adv-speed-node ${currentAutoSpeed === 1.0 ? 'active' : ''}" data-speed="1.0">1.0x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 1.5 ? 'active' : ''}" data-speed="1.5">1.5x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 2.0 ? 'active' : ''}" data-speed="2.0">2.0x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 3.0 ? 'active' : ''}" data-speed="3.0">3.0x</button>
            </div>
          </div>

          <!-- Orientation & Rotation Behavior -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Screen Orientation Mode</div>
              <div class="adv-row-sub">Auto (Follow phone sensor) or lock orientation</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-orientation-select" class="adv-inline-select">
                <option value="auto" ${orientationMode === 'auto' ? 'selected' : ''}>Auto (System Sync)</option>
                <option value="portrait" ${orientationMode === 'portrait' ? 'selected' : ''}>Lock Portrait</option>
                <option value="landscape" ${orientationMode === 'landscape' ? 'selected' : ''}>Lock Landscape</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>

          <!-- Hide Status & Navigation Bars -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Hide System Status Bars</div>
              <div class="adv-row-sub">Maximize visible screen height</div>
            </div>
            <div id="adv-immersive-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isImmersive ? 'active' : ''}">SHOW</span>
              <span class="adv-pill-switch-btn ${isImmersive ? 'active' : ''}">HIDE</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: AUDIO & FOCUS -->
      <div id="adv-pane-tab-audio" class="adv-tab-pane">
        <div class="adv-linear-group">
          <!-- Full-Screen Ambient Screensaver -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Ambient Screensaver</div>
              <div class="adv-row-sub">Pure black ambient focus display</div>
            </div>
            <div id="adv-oled-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isReadAloudOled ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isReadAloudOled ? 'active' : ''}">ON</span>
            </div>
          </div>

          <!-- Screensaver Style & Preview -->
          <div class="adv-linear-row" style="align-items:flex-start;">
            <div class="adv-row-info" style="padding-top:2px;">
              <div class="adv-row-title">Screensaver Style</div>
              <div class="adv-row-sub">Pure blank, retro bouncing, or pixel fire</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; min-width:145px; max-width:160px; align-items:stretch;">
              <div class="adv-inline-select-wrap" style="width:100%;">
                <select id="adv-oled-style-select" class="adv-inline-select" style="width:100%; text-overflow:ellipsis;">
                  <option value="blank" ${oledStyle === 'blank' ? 'selected' : ''}>⬛ Pure Blank</option>
                  <option value="bouncing" ${oledStyle === 'bouncing' ? 'selected' : ''}>📺 Retro SAYAD</option>
                  <option value="fire" ${oledStyle === 'fire' ? 'selected' : ''}>🔥 Pixelated Fire</option>
                </select>
                <span class="adv-inline-select-arrow">▼</span>
              </div>
              <button id="adv-preview-oled-btn" class="adv-mini-action-btn" style="width:100%; justify-content:center;" title="Preview Screensaver">
                ▶ Demo
              </button>
            </div>
          </div>

          <!-- Ambient Focus Soundscapes -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Ambient Soundscape</div>
              <div class="adv-row-sub">Synthesized background audio for focus</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-soundscape-select" class="adv-inline-select">
                <option value="off" ${soundscape === 'off' ? 'selected' : ''}>Off (Muted)</option>
                <option value="rain" ${soundscape === 'rain' ? 'selected' : ''}>Gentle Rain</option>
                <option value="waves" ${soundscape === 'waves' ? 'selected' : ''}>Deep Ocean</option>
                <option value="cafe" ${soundscape === 'cafe' ? 'selected' : ''}>Coffee Shop</option>
                <option value="fire" ${soundscape === 'fire' ? 'selected' : ''}>Fireplace</option>
                <option value="alpha" ${soundscape === 'alpha' ? 'selected' : ''}>432Hz Alpha</option>
                <option value="flow" ${soundscape === 'flow' ? 'selected' : ''}>528Hz Flow</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>
        </div>

        <div class="adv-hint-row">
          <span>💡</span>
          <span>Device rotation seamlessly expands reading viewport with no latency.</span>
        </div>
      </div>
    </div>
  `);

  // Close modal button
  const closeBtn = document.getElementById('close-advanced-modal-x');
  if (closeBtn) {
    closeBtn.onclick = () => window.Sheet.close();
  }

  // Segmented Tabs Switching Handler
  document.querySelectorAll('.adv-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.adv-tab-btn').forEach(b => {
        const isMatch = b === btn;
        b.classList.toggle('active', isMatch);
        b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });

      document.querySelectorAll('.adv-tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });

      const activePane = document.getElementById(`adv-pane-${targetTab}`);
      if (activePane) {
        activePane.classList.add('active');
      }
    };
  });

  // 1. Color Ribbon Swatches Handler
  document.querySelectorAll('.adv-swatch-node').forEach(btn => {
    btn.onclick = async () => {
      const clr = btn.dataset.color;
      const lbl = btn.dataset.label;
      window.State.selectionColor = clr;
      document.documentElement.style.setProperty('--selection-color', clr);

      if (window.DB && window.DB.setting) {
        await window.DB.setting('selectionColor', clr);
      }
      if (window.pendingSelection && typeof window.paintPendingOverlay === 'function') {
        window.paintPendingOverlay(window.pendingSelection, true);
      }

      // Update UI in-place
      document.querySelectorAll('.adv-swatch-node').forEach(b => {
        const isMatch = b.dataset.color.toLowerCase() === clr.toLowerCase();
        b.classList.toggle('active', isMatch);
        b.innerHTML = isMatch ? '<span class="adv-swatch-pin"></span>' : '';
      });

      const tag = document.getElementById('adv-active-color-tag');
      if (tag) {
        tag.textContent = lbl;
      }

      const previewHighlight = document.getElementById('adv-preview-highlight');
      if (previewHighlight) {
        previewHighlight.style.background = `${clr}33`;
        previewHighlight.style.outline = `1px solid ${clr}`;
      }

      window.toast(`Selection color: ${lbl}`);
    };
  });

  // 2. Lock Selection Toggle (Pill Switch)
  const lockSelBtn = document.getElementById('adv-lock-sel-btn');
  if (lockSelBtn) {
    lockSelBtn.onclick = async () => {
      const nextVal = !window.State.disableTextSelection;
      window.State.disableTextSelection = nextVal;
      document.body.classList.toggle('selection-disabled', nextVal);

      if (window.DB && window.DB.setting) {
        await window.DB.setting('disableTextSelection', nextVal);
      }

      if (nextVal && typeof window.hideSelToolbar === 'function') {
        window.hideSelToolbar();
      }

      const btns = lockSelBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(`Text selection ${nextVal ? 'Locked' : 'Unlocked'}`);
    };
  }

  // 3. Double-Tap Action Select
  const dtSelect = document.getElementById('adv-doubletap-select');
  if (dtSelect) {
    dtSelect.onchange = async () => {
      const val = dtSelect.value;
      window.State.doubleTapAction = val;
      if (window.DB && window.DB.setting) {
        await window.DB.setting('doubleTapAction', val);
      }
      window.toast('Double-tap action updated');
    };
  }

  // 4. Auto-Scroll Toggle & Speed Presets
  const autoScrollBtn = document.getElementById('adv-autoscroll-toggle-btn');
  if (autoScrollBtn) {
    autoScrollBtn.onclick = async () => {
      const nextVal = !window.State.autoScrollEnabled;
      window.State.autoScrollEnabled = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('autoScrollEnabled', nextVal);
      }

      if (nextVal) {
        if (window.State.view === 'reader') {
          startAutoScroll();
        } else {
          window.toast('Auto-Scroll enabled (will run in reader)');
        }
      } else {
        stopAutoScroll();
        window.toast('Auto-Scroll stopped');
      }

      const btns = autoScrollBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
    };
  }

  document.querySelectorAll('.adv-speed-node').forEach(chip => {
    chip.onclick = () => {
      const spd = parseFloat(chip.dataset.speed);
      autoScrollSpeed = spd;
      document.querySelectorAll('.adv-speed-node').forEach(c => {
        c.classList.toggle('active', parseFloat(c.dataset.speed) === spd);
      });
      if (window.State.autoScrollEnabled && typeof renderAutoScrollController === 'function') {
        renderAutoScrollController();
      }
      window.toast(`Auto-Scroll speed: ${spd}x`);
    };
  });

  // 5. OLED Wave Screen Saver Toggle & Style & Preview
  const oledToggleBtn = document.getElementById('adv-oled-toggle-btn');
  if (oledToggleBtn) {
    oledToggleBtn.onclick = async () => {
      const current = window.State.readAloudOledVisualizer !== false;
      const nextVal = !current;
      window.State.readAloudOledVisualizer = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('readAloudOledVisualizer', nextVal);
      }

      const btns = oledToggleBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(`Ambient screensaver ${nextVal ? 'Enabled' : 'Disabled'}`);
    };
  }

  const oledStyleSelect = document.getElementById('adv-oled-style-select');
  if (oledStyleSelect) {
    oledStyleSelect.onchange = async () => {
      const val = oledStyleSelect.value;
      window.State.oledStyle = val;
      if (window.DB && window.DB.setting) {
        await window.DB.setting('oledStyle', val);
      }
      window.toast('Ambient screensaver updated');
    };
  }

  const oledPreviewBtn = document.getElementById('adv-preview-oled-btn');
  if (oledPreviewBtn) {
    oledPreviewBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.openOledBlackoutVisualizer === 'function') {
        const val = oledStyleSelect ? oledStyleSelect.value : (window.State.oledStyle || 'bouncing');
        window.openOledBlackoutVisualizer(val);
      } else {
        window.toast('Ambient Screensaver activated');
      }
    };
  }

  // 6. Soundscapes Select
  const soundscapeSelect = document.getElementById('adv-soundscape-select');
  if (soundscapeSelect) {
    soundscapeSelect.onchange = async () => {
      const val = soundscapeSelect.value;
      window.State.soundscape = val;
      if (val === 'off') {
        window.State.alphaWavesEnabled = false;
        if (typeof window.stopAlphaWaves === 'function') {
          window.stopAlphaWaves(true);
        }
        window.toast('Background audio turned off');
      } else {
        window.State.alphaWavesEnabled = true;
        if (typeof window.startAlphaWaves === 'function') {
          window.startAlphaWaves(val === 'flow' ? 'beta' : 'alpha');
        }
        window.toast(`Ambient focus playing: ${soundscapeSelect.options[soundscapeSelect.selectedIndex].text}`);
      }
      if (window.DB && window.DB.setting) {
        await window.DB.setting('soundscape', val);
        await window.DB.setting('alphaWavesEnabled', window.State.alphaWavesEnabled);
      }
    };
  }

  // 7. Screen Orientation Select
  const orientSelect = document.getElementById('adv-orientation-select');
  if (orientSelect) {
    orientSelect.onchange = async () => {
      const mode = orientSelect.value;
      await applyOrientationLock(mode);
      if (mode === 'portrait') {
        window.toast('📱 Locked to Portrait Mode');
      } else if (mode === 'landscape') {
        window.toast('🔄 Locked to Landscape Mode');
      } else {
        window.toast('🌐 Auto-sync with Phone Sensor & OS Lock');
      }
    };
  }

  // 8. Immersive Mode Toggle (Hide Status & Nav bars)
  const immersiveToggleBtn = document.getElementById('adv-immersive-toggle-btn');
  if (immersiveToggleBtn) {
    immersiveToggleBtn.onclick = async () => {
      const current = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);
      const nextVal = !current;
      window.State.hideSystemBars = nextVal;
      window.State.hideStatusBar = nextVal;
      window.State.hideNavigationBar = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('hideSystemBars', nextVal);
        await window.DB.setting('hideStatusBar', nextVal);
        await window.DB.setting('hideNavigationBar', nextVal);
      }

      await updateSystemImmersiveMode();
      const btns = immersiveToggleBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(nextVal ? '📱 System bars hidden' : '📱 System bars restored');
    };
  }
}

export function openReadingThemesModal() {
  const currentTheme = window.State.theme || 'light';
  const currentMode = window.State.readingMode || 'continuous';
  const currentMargin = window.State.readingMargin || 'normal';
  const showBottomBar = window.State.showBottomBar === true;

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
          ${window.icon('sun','icon icon-sm')} <span>Reading Themes & Layout</span>
        </div>
        <button id="close-themes-modal-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
          ${window.icon('x','icon icon-sm')}
        </button>
      </div>

      <!-- Theme Selection -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Appearance Theme</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <button class="btn theme-pick-btn ${currentTheme==='light'?'active':''}" data-theme="light" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='light'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='light'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='light'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('sun','icon icon-md')}
            <span>Day</span>
          </button>
          <button class="btn theme-pick-btn ${currentTheme==='dark'?'active':''}" data-theme="dark" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='dark'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='dark'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='dark'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('moon','icon icon-md')}
            <span>Night</span>
          </button>
          <button class="btn theme-pick-btn ${currentTheme==='sepia'?'active':''}" data-theme="sepia" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='sepia'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='sepia'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='sepia'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('coffee','icon icon-md')}
            <span>Sepia</span>
          </button>
        </div>
      </div>

      <!-- Bottom Reading Bar Toggle -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Bottom Navigation Bar</div>
        <button class="btn" id="toggle-bottom-bar-btn" style="width:100%; padding:12px 14px; justify-content:space-between; background:${showBottomBar ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${showBottomBar ? 'var(--accent)' : 'var(--text)'}; border:1.5px solid ${showBottomBar ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:10px;">
            ${window.icon('compass','icon icon-sm')}
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:700;">Show Bottom Bar</div>
              <div style="font-size:11px; color:var(--text-dim);">Page scrubber, quick jump & controls</div>
            </div>
          </div>
          <span style="font-size:12px; font-weight:800; padding:4px 10px; border-radius:8px; background:${showBottomBar ? 'var(--accent)' : 'var(--bg-elev)'}; color:${showBottomBar ? '#fff' : 'var(--text-dim)'};">
            ${showBottomBar ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      <!-- Reading Margins & Page Width -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Reading Margins & Page Width</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <button class="btn margin-pick-btn ${currentMargin==='compact'?'active':''}" data-margin="compact" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='compact'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='compact'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='compact'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Compact</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Full Width</span>
          </button>
          <button class="btn margin-pick-btn ${currentMargin==='normal'?'active':''}" data-margin="normal" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='normal'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='normal'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='normal'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Balanced</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Standard</span>
          </button>
          <button class="btn margin-pick-btn ${currentMargin==='wide'?'active':''}" data-margin="wide" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='wide'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='wide'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='wide'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Wide</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Focused</span>
          </button>
        </div>
      </div>

      <!-- Reading Mode Selection -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Page View & Scroll</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <button class="btn mode-pick-btn" data-mode="continuous" style="width:100%; padding:12px 14px; justify-content:space-between; background:${currentMode==='continuous'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMode==='continuous'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMode==='continuous'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${window.icon('list','icon icon-sm')}
              <div style="text-align:left;">
                <div style="font-size:13.5px; font-weight:700;">Continuous Scroll</div>
                <div style="font-size:11px; color:var(--text-dim);">Scroll pages vertically continuously</div>
              </div>
            </div>
            ${currentMode==='continuous' ? `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>` : ''}
          </button>
          <button class="btn mode-pick-btn" data-mode="single" style="width:100%; padding:12px 14px; justify-content:space-between; background:${currentMode==='single'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMode==='single'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMode==='single'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${window.icon('fileText','icon icon-sm')}
              <div style="text-align:left;">
                <div style="font-size:13.5px; font-weight:700;">Single Page Flip</div>
                <div style="font-size:11px; color:var(--text-dim);">Swipe left / right to turn pages one by one</div>
              </div>
            </div>
            ${currentMode==='single' ? `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>` : ''}
          </button>
        </div>
      </div>
    </div>
  `);

  const closeX = document.getElementById('close-themes-modal-x');
  if (closeX) closeX.onclick = () => window.Sheet.close();

  const toggleBottomBarBtn = document.getElementById('toggle-bottom-bar-btn');
  if (toggleBottomBarBtn) {
    toggleBottomBarBtn.onclick = async () => {
      const currentShow = window.State.showBottomBar === true;
      const nextVal = !currentShow;
      window.State.showBottomBar = nextVal;
      if (window.DB) {
        await window.DB.setting('showBottomBar', nextVal);
      }
      const bBar = document.getElementById('reader-bottom-bar');
      const rScroll = document.getElementById('reader-scroll');
      if (bBar) {
        bBar.style.display = nextVal ? 'flex' : 'none';
      }
      if (rScroll) {
        rScroll.style.paddingBottom = nextVal ? '68px' : '24px';
      }
      window.toast(`Bottom Navigation Bar turned ${nextVal ? 'ON' : 'OFF'}`);

      // In-place UI update
      toggleBottomBarBtn.style.background = nextVal ? 'var(--accent-soft)' : 'var(--surface-2)';
      toggleBottomBarBtn.style.color = nextVal ? 'var(--accent)' : 'var(--text)';
      toggleBottomBarBtn.style.borderColor = nextVal ? 'var(--accent)' : 'var(--border)';
      const badge = toggleBottomBarBtn.querySelector('span:last-child');
      if (badge) {
        badge.textContent = nextVal ? 'ON' : 'OFF';
        badge.style.background = nextVal ? 'var(--accent)' : 'var(--bg-elev)';
        badge.style.color = nextVal ? '#fff' : 'var(--text-dim)';
      }
    };
  }

  document.querySelectorAll('.theme-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const th = btn.dataset.theme;
      window.State.theme = th;
      window.State.autoTheme = false;
      document.documentElement.dataset.theme = th;
      try { localStorage.setItem('sayad_theme', th); } catch(e){}
      if (typeof window.syncThemeColorMeta === 'function') window.syncThemeColorMeta();
      if (window.DB) {
        await window.DB.setting('theme', th);
        await window.DB.setting('autoTheme', false);
      }
      window.toast(`Theme set to ${th.toUpperCase()}`);

      // In-place UI update
      document.querySelectorAll('.theme-pick-btn').forEach(b => {
        const isMatch = b.dataset.theme === th;
        b.classList.toggle('active', isMatch);
        b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
        b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
        b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
      });
    };
  });

  document.querySelectorAll('.margin-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const mg = btn.dataset.margin;
      window.State.readingMargin = mg;
      if (window.DB) {
        await window.DB.setting('readingMargin', mg);
      }
      updateReaderZoom(true);
      window.toast(`Margin set to ${mg.toUpperCase()}`);

      // In-place UI update
      document.querySelectorAll('.margin-pick-btn').forEach(b => {
        const isMatch = b.dataset.margin === mg;
        b.classList.toggle('active', isMatch);
        b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
        b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
        b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
      });
    };
  });

  document.querySelectorAll('.mode-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const md = btn.dataset.mode;
      if (window.State.readingMode !== md) {
        window.State.readingMode = md;
        if (window.DB) {
          await window.DB.setting('readingMode', md);
        }
        if (document.getElementById('reader-scroll')) {
          mountReaderContent();
        }
        window.toast(`Reading mode set to ${md === 'single' ? 'Single Page' : 'Continuous'}`);

        // In-place UI update
        document.querySelectorAll('.mode-pick-btn').forEach(b => {
          const isMatch = b.dataset.mode === md;
          b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
          b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
          let checkSpan = b.querySelector('span:last-child');
          if (isMatch) {
            if (!checkSpan || checkSpan.textContent !== '✓') {
              b.insertAdjacentHTML('beforeend', `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>`);
            }
          } else if (checkSpan && checkSpan.textContent === '✓') {
            checkSpan.remove();
          }
        });
      }
    };
  });
}

export function openGoalSummarySheet(doExitCallback, isAutoTriggered = false) {
  if (window._goalSummaryTimer) {
    clearInterval(window._goalSummaryTimer);
    window._goalSummaryTimer = null;
  }

  window.State.goalCompletedNotified = true;

  const goalMins = window.State.readingGoalMinutes || 0;
  if (goalMins <= 0 && !isAutoTriggered) {
    if (doExitCallback) doExitCallback();
    return;
  }

  const getStats = () => {
    const sessionStart = window.State.sessionStartTime || Date.now();
    const elapsedMs = Math.max(0, Date.now() - sessionStart);
    const elapsedMins = Math.floor(elapsedMs / 60000);
    const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
    const targetMs = (goalMins || 1) * 60000;
    const pct = Math.min(100, Math.round((elapsedMs / targetMs) * 100));
    const isAchieved = goalMins > 0 && elapsedMs >= targetMs;
    const remSecsTotal = Math.max(0, Math.ceil((targetMs - elapsedMs) / 1000));
    const remMins = Math.ceil(remSecsTotal / 60);
    return { elapsedMs, elapsedMins, elapsedSecs, pct, isAchieved, remMins, remSecsTotal };
  };

  const initial = getStats();
  const formatTimeSpent = (mins, secs) => mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const getCompletionHumor = (mins) => {
    if (mins < 15) {
      return {
        icon: '😅',
        badgeBg: 'rgba(255, 152, 0, 0.15)',
        badgeColor: '#FF9800',
        quote: 'Bhai itne me kaise niklega exam? 😜 Bas itni si reading? Shuruat achhi hai par syllabus bohot bada hai, thoda aur time baitho!',
        sub: 'Warm-up complete! Next target bada rakho.'
      };
    } else if (mins < 45) {
      return {
        icon: '📖',
        badgeBg: 'rgba(59, 130, 246, 0.15)',
        badgeColor: '#3B82F6',
        quote: 'Chalo thoda padhai ka mood bana! 📚 Par exam crack karne ke liye consistency aur thoda aur focus chahiye. Agla session 1 ghante ka?',
        sub: 'Good start, keep building the habit!'
      };
    } else if (mins < 90) {
      return {
        icon: '🎯',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeColor: '#10B981',
        quote: 'Solid effort! 🎯 1 ghante ki focused reading ho gayi! Momentum ban raha hai, aise hi padhte rahe toh rank pakki!',
        sub: '1 hour milestone conquered.'
      };
    } else if (mins < 210) {
      return {
        icon: '🔥',
        badgeBg: 'rgba(239, 68, 68, 0.15)',
        badgeColor: '#EF4444',
        quote: 'Beast Mode ON! 🔥 2+ ghante ka non-stop deep focus! Lagta hai topper banne ka poora plan bana liya hai. Exam nikalna pakka!',
        sub: 'High-focus study power unlocked.'
      };
    } else {
      return {
        icon: '🫡',
        badgeBg: 'rgba(168, 85, 247, 0.15)',
        badgeColor: '#A855F7',
        quote: 'Hats off to you! 🫡 Pure 4+ ghante ki marathon study! Aise dedication ke sath exam nikalna 100% pakka hai. Bas revision aur hydration mat bhoolna!',
        sub: 'Absolute Legend Energy!'
      };
    }
  };

  const getDesc = (s) => {
    if (s.isAchieved) {
      const humor = getCompletionHumor(Math.max(goalMins, s.elapsedMins));
      return `
        <div style="font-weight:600; color:var(--text); margin-bottom:6px;">
          Target achieved (${goalMins} ${goalMins === 1 ? 'minute' : 'minutes'}) in ${formatTimeSpent(s.elapsedMins, s.elapsedSecs)}!
        </div>
        <div style="padding:10px 12px; background:var(--surface); border-left:3px solid ${humor.badgeColor}; border-radius:6px; font-size:12.5px; color:var(--text); line-height:1.45; margin-top:6px;">
          "${humor.quote}"
        </div>
      `;
    }
    const remText = s.remSecsTotal > 60 
      ? `${s.remMins} minute(s)` 
      : `${s.remSecsTotal} second(s)`;
    return `You read for ${formatTimeSpent(s.elapsedMins, s.elapsedSecs)}. ${remText} remaining to reach your goal.`;
  };

  const initialHumor = getCompletionHumor(Math.max(goalMins, initial.elapsedMins));

  window.Sheet.open(`
    <div style="padding:6px 0; text-align:center;">
      <div id="summary-badge-icon" style="width:52px; height:52px; border-radius:50%; background:${initial.isAchieved ? initialHumor.badgeBg : 'var(--accent-soft)'}; color:${initial.isAchieved ? initialHumor.badgeColor : 'var(--accent)'}; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; font-size:26px;">
        ${initial.isAchieved ? initialHumor.icon : '🎯'}
      </div>
      <div id="summary-title-text" class="font-display" style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:4px;">
        ${initial.isAchieved ? 'Goal Completed!' : 'Reading Goal Summary'}
      </div>
      <div style="font-size:13px; color:var(--text-dim); margin-bottom:16px;">
        Target Goal: <strong>${goalMins} ${goalMins === 1 ? 'minute' : 'minutes'}</strong>
      </div>

      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:18px; text-align:left;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px;">
          <span id="summary-time-spent-text">Time Spent: ${formatTimeSpent(initial.elapsedMins, initial.elapsedSecs)}</span>
          <span id="summary-pct-badge" style="color:${initial.isAchieved ? initialHumor.badgeColor : 'var(--accent)'};">${initial.pct}%</span>
        </div>
        <div style="width:100%; height:10px; background:var(--bg-elev); border-radius:5px; overflow:hidden; border:1px solid var(--border);">
          <div id="summary-progress-fill" style="width:${initial.pct}%; height:100%; background:${initial.isAchieved ? initialHumor.badgeColor : 'linear-gradient(90deg, var(--accent), #ff8a50)'}; border-radius:5px; transition:width .4s ease;"></div>
        </div>
        <div id="summary-desc-text" style="font-size:12px; color:var(--text-dim); margin-top:10px; line-height:1.45;">
          ${getDesc(initial)}
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" id="continue-reading-btn" style="flex:1; padding:12px; font-weight:600;">Keep Reading</button>
        <button class="btn btn-primary" id="exit-reader-btn" style="flex:1; padding:12px; font-weight:600;">Exit Reader</button>
      </div>
    </div>
  `);

  window._goalSummaryTimer = setInterval(() => {
    const s = getStats();
    const spentEl = document.getElementById('summary-time-spent-text');
    const pctEl = document.getElementById('summary-pct-badge');
    const fillEl = document.getElementById('summary-progress-fill');
    const descEl = document.getElementById('summary-desc-text');
    const titleEl = document.getElementById('summary-title-text');
    const badgeEl = document.getElementById('summary-badge-icon');

    if (!spentEl) {
      clearInterval(window._goalSummaryTimer);
      window._goalSummaryTimer = null;
      return;
    }

    const currentHumor = getCompletionHumor(Math.max(goalMins, s.elapsedMins));

    spentEl.textContent = `Time Spent: ${formatTimeSpent(s.elapsedMins, s.elapsedSecs)}`;
    pctEl.textContent = `${s.pct}%`;
    pctEl.style.color = s.isAchieved ? currentHumor.badgeColor : 'var(--accent)';
    fillEl.style.width = `${s.pct}%`;
    fillEl.style.background = s.isAchieved ? currentHumor.badgeColor : 'linear-gradient(90deg, var(--accent), #ff8a50)';
    descEl.innerHTML = getDesc(s);

    if (s.isAchieved) {
      titleEl.textContent = 'Goal Completed!';
      badgeEl.textContent = currentHumor.icon;
      badgeEl.style.background = currentHumor.badgeBg;
      badgeEl.style.color = currentHumor.badgeColor;
    }
  }, 1000);

  const contBtn = document.getElementById('continue-reading-btn');
  if (contBtn) {
    contBtn.onclick = () => {
      if (window._goalSummaryTimer) clearInterval(window._goalSummaryTimer);
      window.Sheet.close();

      const stats = getStats();
      if (stats.isAchieved) {
        window.State.readingGoalMinutes = 0;
        window.State.goalCompletedNotified = false;
        const f = window.State.currentFile;
        if (f && window.DB) {
          window.DB.updateFileMeta(f.id, { readingGoalMinutes: 0 }).catch(console.error);
        }
        if (window.toast) window.toast('Reading Goal completed & restored! Set a new goal anytime in Settings.');
      } else {
        window.State.goalCompletedNotified = false;
      }
    };
  }

  const exitBtn = document.getElementById('exit-reader-btn');
  if (exitBtn) {
    exitBtn.onclick = async () => {
      if (window._goalSummaryTimer) clearInterval(window._goalSummaryTimer);
      window.Sheet.close();

      const stats = getStats();
      if (stats.isAchieved) {
        window.State.readingGoalMinutes = 0;
        window.State.goalCompletedNotified = false;
        const f = window.State.currentFile;
        if (f && window.DB) {
          window.DB.updateFileMeta(f.id, { readingGoalMinutes: 0 }).catch(console.error);
        }
      } else {
        window.State.goalCompletedNotified = false;
      }
      if (doExitCallback) await doExitCallback();
    };
  }
}

export function renderReaderShell(){
  const f = window.State.currentFile;
  const isBottomBarOn = window.State.showBottomBar === true;
  window.State.sessionStartTime = Date.now();
  window.State.goalCompletedNotified = false;
  if (f && f.readingGoalMinutes !== undefined) {
    window.State.readingGoalMinutes = f.readingGoalMinutes;
  }

  if (window._readerGoalCheckerTimer) {
    clearInterval(window._readerGoalCheckerTimer);
    window._readerGoalCheckerTimer = null;
  }

  window._readerGoalCheckerTimer = setInterval(() => {
    if (window.State.view !== 'reader') {
      clearInterval(window._readerGoalCheckerTimer);
      window._readerGoalCheckerTimer = null;
      return;
    }
    const gMins = window.State.readingGoalMinutes || 0;
    if (gMins > 0 && !window.State.goalCompletedNotified) {
      const sStart = window.State.sessionStartTime || Date.now();
      const eMs = Date.now() - sStart;
      if (eMs >= gMins * 60000) {
        window.State.goalCompletedNotified = true;
        openGoalSummarySheet(null, true);
        const toastMsg = gMins < 15 ? '😅 Goal completed! Aur padho!' : (gMins >= 180 ? '👑 Marathon Goal Completed! Legend!' : '🎉 Reading Goal Completed!');
        window.toast(toastMsg);
      }
    }
  }, 1000);

  document.getElementById('app').innerHTML = `
  <div class="view" style="overflow:hidden;">
    <div id="reader-header-bar" style="position:absolute; top:0; left:0; right:0; z-index:20; display:flex; align-items:center; gap:8px; padding:12px 14px; background:linear-gradient(var(--bg) 60%, transparent); backdrop-filter:blur(4px); transition:transform 0.22s ease, opacity 0.22s ease;">
      <button class="btn btn-icon" id="reader-back" title="Back">${window.icon('chevLeft','icon icon-sm')}</button>
      <div id="reader-title" style="flex:1; min-width:0; cursor:pointer;">
        <div style="font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.escapeHtml(f?.name||'')}</div>
        <div class="font-mono" style="font-size:10.5px; color:var(--text-dim); ${window.State.showPageNumber?'':'display:none;'}" id="page-indicator">Loading…</div>
      </div>
      <button class="btn btn-icon" id="reader-search" title="Search">${window.icon('search','icon icon-sm')}</button>
      <button class="btn btn-icon" id="reader-toc" title="TOC">${window.icon('list','icon icon-sm')}</button>
      <button class="btn btn-icon" id="reader-bookmark" title="Bookmarks">${window.icon('bookmark','icon icon-sm')}</button>
      <button class="btn btn-icon" id="reader-settings" title="Settings">${window.icon('settings','icon icon-sm')}</button>
    </div>
    ${window.State.pageList? `
      <div id="collection-bar" style="position:absolute; top:58px; left:0; right:0; z-index:19; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 14px; background:var(--accent-soft); border-bottom:1px solid var(--accent);">
        <span style="font-size:12px; font-weight:600; color:var(--accent); display:flex; align-items:center; gap:6px;">${window.icon('folder','icon icon-sm')} ${window.escapeHtml(window.State.pageListLabel)} — ${window.State.pageList.length} pages, others hidden</span>
        <button class="btn" id="exit-collection" style="width:auto; height:26px; padding:0 10px; background:transparent; color:var(--accent); font-size:11.5px; font-weight:700;">Show full book</button>
      </div>
    `:''}
    <div id="reader-scroll" style="height:100%; padding:${window.State.pageList?'96px':'64px'} 0 ${isBottomBarOn ? '68px' : '24px'};">
      <div style="display:flex; flex-direction:column; align-items:center; gap:14px; padding-top:40px;">
        ${[1,2].map(()=>`<div class="skel" style="width:88vw; max-width:520px; aspect-ratio:.72;"></div>`).join('')}
      </div>
    </div>

    <!-- Readium UX Bottom Bar -->
    <div id="reader-bottom-bar" style="position:absolute; bottom:0; left:0; right:0; z-index:20; background:linear-gradient(transparent, var(--bg) 40%); backdrop-filter:blur(6px); padding:10px 14px; display:${isBottomBarOn ? 'flex' : 'none'}; align-items:center; justify-content:space-between; gap:10px; transition:transform 0.22s ease, opacity 0.22s ease;">
      <button class="btn btn-icon" id="reader-prev-btn" title="Previous Page" style="width:38px; height:38px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0;">
        ${window.icon('chevLeft','icon icon-sm')}
      </button>

      <div id="reader-progress-pill" title="Tap to jump or scrub pages" style="flex:1; max-width:280px; display:flex; flex-direction:column; gap:3px; align-items:center; cursor:pointer; padding:5px 12px; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; font-size:11px; font-weight:700; color:var(--text);">
          <span id="bottom-bar-page-text">Page 1</span>
          <span id="bottom-bar-pct-text" style="color:var(--accent); font-family:var(--font-mono);">0%</span>
        </div>
        <div style="width:100%; height:4px; background:var(--bg-elev); border-radius:2px; overflow:hidden;">
          <div id="bottom-bar-progress-fill" style="width:0%; height:100%; background:var(--accent); border-radius:2px; transition:width 0.15s ease;"></div>
        </div>
      </div>

      <button class="btn btn-icon" id="reader-next-btn" title="Next Page" style="width:38px; height:38px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0;">
        ${window.icon('chevRight','icon icon-sm')}
      </button>

      <button class="btn btn-icon" id="reader-themes-quick-btn" title="Reading Layout & Themes" style="width:38px; height:38px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0; color:var(--accent);">
        ${window.icon('sun','icon icon-sm')}
      </button>
    </div>
  </div>`;

  async function exitReader() {
    const goalMins = window.State.readingGoalMinutes || 0;
    const isAlreadyNotified = !!window.State.goalCompletedNotified;

    const doExit = async () => {
      if (window._readerGoalCheckerTimer) {
        clearInterval(window._readerGoalCheckerTimer);
        window._readerGoalCheckerTimer = null;
      }
      if (window._readerSettingsTimer) {
        clearInterval(window._readerSettingsTimer);
        window._readerSettingsTimer = null;
      }
      if (window._goalSummaryTimer) {
        clearInterval(window._goalSummaryTimer);
        window._goalSummaryTimer = null;
      }
      toggleFocusMode(false);
      stopAutoScroll();
      if (typeof window.stopAlphaWaves === 'function') {
        window.stopAlphaWaves(false);
      }
      if (typeof window.closeOledBlackoutVisualizer === 'function') {
        window.closeOledBlackoutVisualizer();
      }
      if (typeof window.stopReadingSession === 'function') {
        await window.stopReadingSession();
      }
      window.State.view='dashboard';
      // Release the document for real: cancel renders, free canvases and tell pdf.js to drop the
      // parsed PDF. Only nulling the reference used to leave every opened book alive in the
      // pdf.js worker (plus all its page elements) until the app was reloaded.
      const closingDoc = window.State.currentDoc;
      window.State.currentDoc=null;
      clearPageEls();
      pageVpCache = {};
      pageVpCacheDoc = null;
      const scrollElOnExit = document.getElementById('reader-scroll');
      if (scrollElOnExit) scrollElOnExit.onscroll = null;
      window.currentPageContainer = null;
      if (closingDoc && typeof closingDoc.destroy === 'function') {
        closingDoc.destroy().catch(() => {});
      }
      window.State.pageList=null;
      window.State.pageListLabel='';
      releaseWakeLock();
      if (window.screen?.orientation?.unlock) {
        try { window.screen.orientation.unlock(); } catch(e) {}
      }
      window.render();
    };

    if (goalMins > 0 && !isAlreadyNotified) {
      window.State.goalCompletedNotified = true;
      openGoalSummarySheet(doExit);
      return;
    }

    await doExit();
  }
  window.exitReader = exitReader;

  document.getElementById('reader-back').onclick = async ()=>{
    await exitReader();
  };

  document.getElementById('reader-title').onclick = ()=>openReaderMenu();
  const teacherBtn = document.getElementById('reader-teacher');
  if (teacherBtn) teacherBtn.onclick = () => {
    if (typeof window.openTeacherView === 'function') {
      window.openTeacherView();
    }
  };
  document.getElementById('reader-toc').onclick = ()=>openTOC();
  document.getElementById('reader-search').onclick = ()=>window.openInDocSearch();
  const ttsBtn = document.getElementById('reader-tts');
  if (ttsBtn) ttsBtn.onclick = ()=> {
    if (typeof window.toggleReadAloud === 'function') {
      window.toggleReadAloud();
    } else if (typeof window.openHandsFreeReadAloud === 'function') {
      window.openHandsFreeReadAloud();
    }
  };
  const markupBtn = document.getElementById('reader-markup');
  if (markupBtn) markupBtn.onclick = ()=>window.toggleMarkupToolbar();
  document.getElementById('reader-bookmark').onclick = ()=>window.toggleBookmark();
  document.getElementById('reader-settings').onclick = ()=>openReaderSettings();
  applyAdvancedReaderSettings();
  if(window.State.keepAwake) requestWakeLock();
  const exitBtn = document.getElementById('exit-collection');
  if(exitBtn) exitBtn.onclick = ()=>{ window.State.pageList=null; window.State.pageListLabel=''; renderReaderShell(); mountReaderContent(); };

  const prevBtn = document.getElementById('reader-prev-btn');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (window.State.readingMode === 'single') {
        turnSinglePage(-1);
      } else {
        scrollToPage(Math.max(1, window.State.currentPage - 1));
      }
    };
  }
  const nextBtn = document.getElementById('reader-next-btn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (window.State.readingMode === 'single') {
        turnSinglePage(1);
      } else {
        scrollToPage(Math.min(window.State.numPages, window.State.currentPage + 1));
      }
    };
  }
  const progressPill = document.getElementById('reader-progress-pill');
  if (progressPill) {
    progressPill.onclick = () => openPageJumperModal();
  }
  const quickThemesBtn = document.getElementById('reader-themes-quick-btn');
  if (quickThemesBtn) {
    quickThemesBtn.onclick = () => openReadingThemesModal();
  }

  setupReaderInteractions(document.getElementById('reader-scroll'));
  if (window.State.autoScrollEnabled) {
    startAutoScroll();
  }
  if (window.State.alphaWavesEnabled && typeof window.startAlphaWaves === 'function') {
    window.startAlphaWaves('alpha');
  }
}

export function renderCorrupted(fileId, fileName){
  const name = fileName || window.State.currentFile?.name || 'this document';
  const fid = fileId || window.State.currentFile?.id;

  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;

  scrollEl.innerHTML = `
    <div style="max-width:440px; margin:40px auto; padding:24px 18px; text-align:center;">
      <div style="width:52px; height:52px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
        ${window.icon('info','icon icon-lg')}
      </div>
      <div class="font-display" style="font-size:19px; font-weight:700; color:var(--text); margin-bottom:8px;">
        Couldn't open this PDF
      </div>
      <div style="font-size:13px; color:var(--text-dim); line-height:1.55; margin-bottom:20px;">
        This can happen if the mobile browser paused background memory or if network CMaps timed out. Tap <b>Try again</b> to use instant offline recovery.
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; max-width:280px; margin:0 auto;">
        <button class="btn btn-primary" id="retry-open" style="padding:12px 20px; font-weight:700;">
          ${window.icon('rotate','icon icon-sm')} Try again
        </button>

        <button class="btn btn-ghost" id="relink-pdf-btn" style="padding:11px 16px; border:1px solid var(--border); font-size:13px;">
          ${window.icon('upload','icon icon-sm')} Re-select "${window.escapeHtml(name)}"
        </button>

        <button class="btn btn-ghost" id="remove-corrupted" style="padding:10px 16px; color:var(--danger); font-size:12.5px;">
          ${window.icon('trash','icon icon-sm')} Remove this book
        </button>
      </div>

      <input type="file" id="relink-file-input" accept=".pdf, application/pdf" style="display:none;" />
    </div>
  `;

  const retryBtn = document.getElementById('retry-open');
  if(retryBtn) {
    retryBtn.onclick = () => {
      if(fid) openReader(fid, window.State.currentPage);
    };
  }

  const relinkBtn = document.getElementById('relink-pdf-btn');
  const relinkInput = document.getElementById('relink-file-input');
  if (relinkBtn && relinkInput) {
    relinkBtn.onclick = () => relinkInput.click();
    relinkInput.onchange = async (e) => {
      const selected = e.target.files && e.target.files[0];
      if (!selected) return;
      try {
        window.toast('Restoring book data…');
        const buf = await selected.arrayBuffer();
        const existing = await window.DB.get('files', fid);
        if (existing) {
          existing.data = buf;
          existing.size = selected.size;
          await window.DB.put('files', existing);
          window.toast('File restored! Opening…');
          openReader(fid, 1);
        }
      } catch(err) {
        console.error(err);
        window.toast('Failed to re-link PDF');
      }
    };
  }

  const removeBtn = document.getElementById('remove-corrupted');
  if(removeBtn) {
    removeBtn.onclick = async ()=>{
      if(!fid) return;
      await window.DB.del('files', fid);
      const annots = await window.DB.byIndex('annotations','fileId',fid);
      for(const a of annots) await window.DB.del('annotations', a.id);
      await window.DB.del('progress', fid);
      window.State.files = window.State.files.filter(f=>f.id!==fid);
      window.State.view = 'dashboard';
      window.State.currentDoc = null;
      window.toast('Book removed');
      window.render();
    };
  }
}

export function promptPassword(fileRec, rawBuffer){
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;
  scrollEl.innerHTML = `
    <div style="max-width:320px; margin:60px auto 0; text-align:center; padding:0 20px;">
      <div style="color:var(--accent); margin-bottom:14px; display:flex; justify-content:center;">${window.icon('lock','icon icon-lg')}</div>
      <div class="font-display" style="font-size:18px; font-weight:600; margin-bottom:6px;">Password protected</div>
      <div style="font-size:13.5px; color:var(--text-dim); margin-bottom:16px;">Enter the password to open this document.</div>
      <input id="pdf-pass" type="password" placeholder="Password" style="width:100%; padding:12px; font-size:14.5px; margin-bottom:12px; text-align:center;">
      <button class="btn btn-primary" style="width:100%; padding:13px;" id="pdf-pass-go">Unlock</button>
    </div>`;
  document.getElementById('pdf-pass-go').onclick = async ()=>{
    const pass = document.getElementById('pdf-pass').value;
    try{
      const buf = rawBuffer || (await window.DB.normalizeBuffer(fileRec.data));
      const doc = await loadPdfDocumentSafely(buf, pass);
      setCurrentDoc(doc);
      window.State.numPages = doc.numPages;
      await mountReaderContent();
    }catch(e){
      window.toast('Incorrect password or unable to unlock');
    }
  };
}

export function computeFitScale(nativeVp, mode){
  const marginWidthMap = { compact: 760, normal: 620, wide: 500 };
  const targetMax = marginWidthMap[window.State.readingMargin || 'normal'] || 620;
  const containerWidth = Math.min(window.innerWidth * 0.92, targetMax);
  if(window.State.fitMode==='page' || mode==='single'){
    const availHeight = window.innerHeight - (window.State.pageList? 96 : 64) - 72;
    return Math.min(containerWidth/nativeVp.width, availHeight/nativeVp.height) * window.State.zoom;
  }
  return (containerWidth/nativeVp.width) * window.State.zoom;
}

export function getScrollAnchorPoint() {
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return null;
  const mode = window.State.readingMode;
  const scrollRect = scrollEl.getBoundingClientRect();

  const vpX = scrollEl.clientWidth / 2;
  const vpY = scrollEl.clientHeight / 2;

  let pageNum = window.State.currentPage;
  let pe = pageEls[pageNum];

  if (mode === 'continuous') {
    const centerY = scrollRect.top + vpY;
    for (const [numStr, p] of Object.entries(pageEls)) {
      if (!p.wrap) continue;
      const rect = p.wrap.getBoundingClientRect();
      if (centerY >= rect.top && centerY <= rect.bottom) {
        pageNum = Number(numStr);
        pe = p;
        break;
      }
    }
  }

  let fracX = 0.5, fracY = 0.5;
  if (pe && pe.wrap) {
    const rect = pe.wrap.getBoundingClientRect();
    fracX = Math.max(0, Math.min(1, ((scrollRect.left + vpX) - rect.left) / (rect.width || 1)));
    fracY = Math.max(0, Math.min(1, ((scrollRect.top + vpY) - rect.top) / (rect.height || 1)));
  }

  return { pageNum, fracX, fracY, vpX, vpY };
}

export function restoreScrollAnchorPoint(anchor) {
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl || !anchor) return;

  const pe = pageEls[anchor.pageNum];
  if (pe && pe.wrap) {
    const wrapWidth = pe.nativeVp.width * pe.scale;
    const wrapHeight = pe.nativeVp.height * pe.scale;

    const docX = anchor.fracX * wrapWidth;
    const docY = anchor.fracY * wrapHeight;

    const targetScrollLeft = pe.wrap.offsetLeft + docX - anchor.vpX;
    const targetScrollTop = pe.wrap.offsetTop + docY - anchor.vpY;

    scrollEl.scrollLeft = Math.max(0, targetScrollLeft);
    scrollEl.scrollTop = Math.max(0, targetScrollTop);
  } else if (anchor.fracY !== undefined) {
    scrollEl.scrollTop = Math.max(0, anchor.fracY * scrollEl.scrollHeight - anchor.vpY);
    scrollEl.scrollLeft = Math.max(0, anchor.fracX * scrollEl.scrollWidth - anchor.vpX);
  }
}

export function updateReaderZoom(preserveAnchor = true) {
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return mountReaderContent();

  const numPagesLoaded = Object.keys(pageEls).length;
  if (numPagesLoaded === 0) return mountReaderContent();

  const mode = window.State.readingMode;
  scrollEl.classList.toggle('zoomed', mode === 'single' && window.State.zoom > 1.02);

  let anchor = null;
  if (typeof preserveAnchor === 'object' && preserveAnchor !== null) {
    anchor = preserveAnchor;
  } else if (preserveAnchor) {
    anchor = getScrollAnchorPoint();
  }

  let runningTop = 14;
  for (const numStr in pageEls) {
    const pe = pageEls[numStr];
    if (!pe || !pe.wrap) continue;

    const newScale = computeFitScale(pe.nativeVp, mode);
    pe.scale = newScale;
    const w = pe.nativeVp.width * newScale;
    const h = pe.nativeVp.height * newScale;

    pe.wrap.style.width = w + 'px';
    pe.wrap.style.height = h + 'px';

    pe._top = runningTop;
    pe._height = h;
    runningTop += h + 28;

    if (pe.canvas) {
      pe.canvas.style.width = w + 'px';
      pe.canvas.style.height = h + 'px';
    }

    if (pe.textLayerDiv) {
      pe.textLayerDiv.style.width = w + 'px';
      pe.textLayerDiv.style.height = h + 'px';
      pe.textLayerDiv.style.setProperty('--scale-factor', `${newScale}`);
    }

    // The scale changed: drop any render still running for the old scale (it would commit a
    // bitmap of the wrong size) but keep the current canvas on screen until the new one is ready.
    pe._renderToken = (pe._renderToken || 0) + 1;
    if (pe.renderTask) {
      try { pe.renderTask.cancel(); } catch(e) {}
      pe.renderTask = null;
    }
    pe.rendering = false;
    pe._renderPromise = null;
    pe.spanRects = null;
    pe.rendered = false;
  }

  if (mode === 'single') {
    const curPe = pageEls[window.State.currentPage];
    const container = window.currentPageContainer;
    if (curPe && curPe.wrap && container) {
      const curW = curPe.nativeVp.width * curPe.scale;
      const curH = curPe.nativeVp.height * curPe.scale;
      const cWidth = Math.max(scrollEl.clientWidth, curW);
      const cHeight = Math.max(scrollEl.clientHeight, curH);
      container.style.width = cWidth + 'px';
      container.style.height = cHeight + 'px';
    }
    for (const numStr in pageEls) {
      const p = pageEls[numStr];
      if (p && p.wrap) {
        p.wrap.style.position = 'absolute';
        p.wrap.style.top = '50%';
        p.wrap.style.left = '50%';
        p.wrap.style.transform = 'translate(-50%, -50%)';
      }
    }
    showSinglePage(window.State.currentPage);
  } else {
    setupVirtualRender();
  }

  if (anchor) {
    restoreScrollAnchorPoint(anchor);
  }

  if (window.pendingSelection && typeof window.paintPendingOverlay === 'function') {
    const pNum = window.pendingSelection.pageNum;
    const pe = pageEls[pNum];
    if (pe && pe.wrap) {
      window.pendingSelection.pageWrap = pe.wrap;
      window.paintPendingOverlay(window.pendingSelection, true);
    }
  }
}

export async function mountReaderContent(){
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;
  scrollEl.innerHTML = '';
  // Empty pageEls safely keeping identical reference of window.pageEls
  clearPageEls();
  
  const mode = window.State.readingMode;
  scrollEl.classList.remove('rm-continuous','rm-single');
  scrollEl.classList.add('rm-'+mode);
  scrollEl.classList.toggle('zoomed', mode==='single' && window.State.zoom > 1.02);
  const container = document.createElement('div');
  container.style.cssText = mode==='single'
    ? 'position:relative; width:100%; height:100%; min-height:100%; display:flex; align-items:center; justify-content:center; will-change:transform;'
    : 'min-height:100%; will-change:transform;';
  scrollEl.appendChild(container);
  window.currentPageContainer = container;

  const pagesToShow = window.State.pageList && window.State.pageList.length
    ? window.State.pageList.slice().sort((a,b)=>a-b)
    : Array.from({length:window.State.numPages}, (_,i)=>i+1);

  if(mode==='single' && !pagesToShow.includes(window.State.currentPage)) window.State.currentPage = pagesToShow[0];

  if(pageVpCacheDoc !== window.State.currentDoc){ pageVpCache = {}; pageVpCacheDoc = window.State.currentDoc; }

  const toFetch = pagesToShow.filter(i => !pageVpCache[i]);
  const BATCH = 40;
  for(let b=0; b<toFetch.length; b+=BATCH){
    const batch = toFetch.slice(b, b+BATCH);
    await Promise.all(batch.map(async i=>{
      const page = await window.State.currentDoc.getPage(i);
      pageVpCache[i] = page.getViewport({scale:1});
    }));
  }
  const vpByPage = {};
  for(const i of pagesToShow){
    vpByPage[i] = {nativeVp: pageVpCache[i], scale: computeFitScale(pageVpCache[i], mode)};
  }

  let runningTop = 14;
  for(const i of pagesToShow){
    const {nativeVp, scale} = vpByPage[i];
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    const w = (nativeVp.width*scale);
    const h = (nativeVp.height*scale);
    wrap.style.width = w+'px';
    wrap.style.height = h+'px';
    if(mode==='single'){
      wrap.style.position = 'absolute';
      wrap.style.top = '50%';
      wrap.style.left = '50%';
      wrap.style.transform = 'translate(-50%, -50%)';
      if(i!==window.State.currentPage) wrap.style.display = 'none';
    }
    wrap.dataset.page = i;
    container.appendChild(wrap);
    pageEls[i] = {wrap, rendered:false, scale, nativeVp, _top: runningTop, _height: h};
    runningTop += h + 28;
  }

  updatePageIndicator();
  if(mode==='single'){
    scrollEl.onscroll = null;
    showSinglePage(window.State.currentPage);
  } else {
    // Jump to the saved page first, so the first pages painted are the ones the reader is
    // actually looking at (previously page 1 was painted, then thrown away, on every open).
    scrollToPage(window.State.currentPage, false);
    setupVirtualRender();
    scrollEl.onscroll = window.throttle(()=>{ updateCurrentPageFromScroll(); setupVirtualRender(); }, 120);
  }
}

// Releases every page (render tasks, canvases, drawing layers) and empties pageEls while keeping
// the same object, because other modules hold a reference to window.pageEls.
export function clearPageEls(){
  resetRenderPipeline();
  for (const k in pageEls) {
    if (typeof window.destroyPageDrawLayer === 'function') {
      try { window.destroyPageDrawLayer(Number(k)); } catch(e) {}
    }
    discardPage(pageEls[k]);
    delete pageEls[k];
  }
}

export function showSinglePage(num, direction=0){
  const pe = pageEls[num];
  if(!pe) return;
  const prev = pageEls[window.State.currentPage];
  window.State.currentPage = num;
  updatePageIndicator();
  saveProgress();
  if(!pe.rendered) renderPage(num);
  const nums = Object.keys(pageEls).map(Number).sort((a,b)=>a-b);
  const idx = nums.indexOf(num);
  if(idx>0){ const p = pageEls[nums[idx-1]]; if(p && !p.rendered) renderPage(nums[idx-1]); }
  if(idx<nums.length-1){ const n = pageEls[nums[idx+1]]; if(n && !n.rendered) renderPage(nums[idx+1]); }

  // Unload pages that are far away in single page mode to save memory
  for(let i=0; i<nums.length; i++){
    if(Math.abs(i - idx) > 2 && pageEls[nums[i]]?.rendered){
      unloadPage(nums[i]);
    }
  }

  if(direction && prev && prev.wrap && prev!==pe){
    const dist = 40;
    pe.wrap.style.transition = 'none';
    pe.wrap.style.position = 'absolute';
    pe.wrap.style.top = '50%';
    pe.wrap.style.left = '50%';
    pe.wrap.style.transform = `translate(calc(-50% + ${direction>0?dist:-dist}px), -50%)`;
    pe.wrap.style.opacity = '0';
    pe.wrap.style.display = '';
    void pe.wrap.offsetWidth;
    pe.wrap.style.transition = 'transform .2s var(--ease), opacity .2s var(--ease)';
    pe.wrap.style.transform = 'translate(-50%, -50%)';
    pe.wrap.style.opacity = '1';
    prev.wrap.style.transition = 'transform .2s var(--ease), opacity .2s var(--ease)';
    prev.wrap.style.transform = `translate(calc(-50% + ${direction>0?-dist:dist}px), -50%)`;
    prev.wrap.style.opacity = '0';
    setTimeout(()=>{
      if(prev.wrap){ prev.wrap.style.display = 'none'; prev.wrap.style.transition = ''; prev.wrap.style.transform = 'translate(-50%, -50%)'; prev.wrap.style.opacity = ''; }
      if(pe.wrap){ pe.wrap.style.transition = ''; pe.wrap.style.transform = 'translate(-50%, -50%)'; pe.wrap.style.opacity = ''; }
    }, 210);
  } else {
    for(const k of nums){
      if(pageEls[k] && pageEls[k].wrap){
        if(k === num){
          pageEls[k].wrap.style.position = 'absolute';
          pageEls[k].wrap.style.top = '50%';
          pageEls[k].wrap.style.left = '50%';
          pageEls[k].wrap.style.display = '';
          pageEls[k].wrap.style.transform = 'translate(-50%, -50%)';
          pageEls[k].wrap.style.opacity = '1';
        } else {
          pageEls[k].wrap.style.display = 'none';
        }
      }
    }
  }
}

let lastPageTurnTime = 0;
export function turnSinglePage(delta){
  const now = Date.now();
  if (now - lastPageTurnTime < 220) return;
  lastPageTurnTime = now;
  const nums = Object.keys(pageEls).map(Number).sort((a,b)=>a-b);
  const idx = nums.indexOf(window.State.currentPage);
  if(idx===-1) return;
  const newIdx = idx + delta;
  if(newIdx<0 || newIdx>=nums.length) return;
  showSinglePage(nums[newIdx], delta);
}

export function setupReaderInteractions(scrollEl){
  if (!scrollEl) return;
  scrollEl.addEventListener('contextmenu', (e)=>{ if(e.target.closest('.textLayer')) e.preventDefault(); });

  let zoomGesture = null;
  let zoomFrame = null;
  window.zoomGestureActive = false;

  let selGesture = null;
  let longPressTimer = null;
  let touchStartX = 0, touchStartY = 0;

  let lastTouchEndTime = 0;

  scrollEl.addEventListener('touchstart', (e)=>{
    lastTouchEndTime = Date.now();
    if(e.touches.length===2){
      const t0=e.touches[0], t1=e.touches[1];
      const dist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
      if(dist<25){ zoomGesture = null; window.zoomGestureActive = false; return; }

      const midX = (t0.clientX+t1.clientX)/2, midY = (t0.clientY+t1.clientY)/2;
      const scrollRect = scrollEl.getBoundingClientRect();
      const vpX = midX - scrollRect.left;
      const vpY = midY - scrollRect.top;

      const mode = window.State.readingMode;
      let pageNum = window.State.currentPage;
      let pe = pageEls[pageNum];

      if (mode === 'continuous') {
        for (const [numStr, p] of Object.entries(pageEls)) {
          if (!p.wrap) continue;
          const rect = p.wrap.getBoundingClientRect();
          if (midY >= rect.top && midY <= rect.bottom) {
            pageNum = Number(numStr);
            pe = p;
            break;
          }
        }
      }

      let fracX = 0.5, fracY = 0.5;
      if (pe && pe.wrap) {
        const rect = pe.wrap.getBoundingClientRect();
        fracX = Math.max(0, Math.min(1, (midX - rect.left) / (rect.width || 1)));
        fracY = Math.max(0, Math.min(1, (midY - rect.top) / (rect.height || 1)));
      }

      const container = window.currentPageContainer;
      if (container) {
        const cRect = container.getBoundingClientRect();
        container.style.transformOrigin = `${midX - cRect.left}px ${midY - cRect.top}px`;
      }

      zoomGesture = { startDist: dist, startZoom: window.State.zoom, liveZoom: null, pageNum, fracX, fracY, vpX, vpY };
      window.zoomGestureActive = true;
      clearTimeout(longPressTimer);
      selGesture = null;
    } else {
      zoomGesture = null;
      window.zoomGestureActive = false;
      clearTimeout(longPressTimer);
      selGesture = null;
      if(e.touches.length===1){
        const t0 = e.touches[0];
        touchStartX = t0.clientX; touchStartY = t0.clientY;
      }
      const textLayerEl = e.target.closest && e.target.closest('.textLayer');
      if(e.touches.length===1 && textLayerEl && !window.State.disableTextSelection){
        const t = e.touches[0];
        longPressTimer = setTimeout(()=>{
          if(window.State.disableTextSelection) return;
          const pageWrap = textLayerEl.closest('.page-wrap');
          if(!pageWrap) return;
          const pageNum = Number(pageWrap.dataset.page);
          const caret = window.caretFromPointOnPage(pageNum, touchStartX, touchStartY);
          if(!caret) return;
          const wordRange = window.wordRangeAtCaret(caret);
          if(window.pendingSelection){ window.hideSelToolbar(); window.clearPendingOverlay(); window.pendingSelection = null; }
          selGesture = {
            anchorStart: {node:wordRange.startContainer, offset:wordRange.startOffset},
            anchorEnd: {node:wordRange.endContainer, offset:wordRange.endOffset},
            pageWrap, pageNum
          };
          window.updateLiveSelectionRange(wordRange, pageWrap);
          if(navigator.vibrate) navigator.vibrate(8);
        }, 380);
      }
    }
  }, {passive:true});

  scrollEl.addEventListener('touchmove', (e)=>{
    if(e.touches.length===1){
      const t = e.touches[0];
      if(!selGesture){
        if(Math.hypot(t.clientX-touchStartX, t.clientY-touchStartY) > 10) clearTimeout(longPressTimer);
      } else {
        e.preventDefault();
        const focusCaret = window.caretFromPointOnPage(selGesture.pageNum, t.clientX, t.clientY);
        if(focusCaret){
          const range = window.buildExtendedRange(selGesture.anchorStart, selGesture.anchorEnd, focusCaret);
          if(range) window.updateLiveSelectionRange(range, selGesture.pageWrap);
        }
      }
      return;
    }
    if(!zoomGesture || e.touches.length!==2) return;
    e.preventDefault();
    const t0=e.touches[0], t1=e.touches[1];
    const dist = Math.hypot(t1.clientX-t0.clientX, t1.clientY-t0.clientY);
    zoomGesture.liveZoom = Math.min(2.5, Math.max(0.5, zoomGesture.startZoom * (dist/zoomGesture.startDist)));
    if(zoomFrame) return;
    zoomFrame = requestAnimationFrame(()=>{
      zoomFrame = null;
      if(window.currentPageContainer && zoomGesture){
        window.currentPageContainer.style.transform = `scale(${zoomGesture.liveZoom/zoomGesture.startZoom})`;
      }
    });
  }, {passive:false});

  function finishZoomGesture(){
    if(!zoomGesture) return;
    const g = zoomGesture;
    zoomGesture = null;
    window.zoomGestureActive = false;
    if(zoomFrame){ cancelAnimationFrame(zoomFrame); zoomFrame = null; }
    const container = window.currentPageContainer;
    if(container){
      container.style.transition = '';
      container.style.transform = '';
      container.style.transformOrigin = '';
    }
    if(!g.liveZoom || Math.abs(g.liveZoom-window.State.zoom)<0.04){
      if (window.pendingSelection && typeof window.paintPendingOverlay === 'function') {
        window.paintPendingOverlay(window.pendingSelection, true);
      }
      return;
    }
    window.State.zoom = g.liveZoom;
    updateReaderZoom(g);
  }

  function finalizeSelectionGesture(){
    clearTimeout(longPressTimer);
    if(!selGesture) return;
    selGesture = null;
  }

  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;
  function executeDoubleTapAction(viewportX, viewportY) {
    const action = window.State.doubleTapAction || 'zoom';

    if (action === 'none') {
      // Intentionally do nothing on double tap
      return;
    }

    if (action === 'bookmark') {
      if (typeof window.toggleBookmark === 'function') {
        window.toggleBookmark();
      }
      return;
    }

    if (action === 'hide_ui') {
      const nextFocus = !window.State.isFocusMode;
      toggleFocusMode(nextFocus);
      window.toast(nextFocus ? 'Zen Immersive Mode enabled' : 'Zen Immersive Mode disabled');
      return;
    }

    // Default: 'zoom' (Fit & Zoom)
    toggleFitZoom(viewportX, viewportY);
  }

  function toggleFitZoom(viewportX, viewportY){
    const wasZoomed = window.State.zoom > 1.05;
    const scrollRect = scrollEl.getBoundingClientRect();
    const vpX = viewportX - scrollRect.left;
    const vpY = viewportY - scrollRect.top;

    const mode = window.State.readingMode;
    let pageNum = window.State.currentPage;
    let pe = pageEls[pageNum];

    if (mode === 'continuous') {
      for (const [numStr, p] of Object.entries(pageEls)) {
        if (!p.wrap) continue;
        const rect = p.wrap.getBoundingClientRect();
        if (viewportY >= rect.top && viewportY <= rect.bottom) {
          pageNum = Number(numStr);
          pe = p;
          break;
        }
      }
    }

    let fracX = 0.5, fracY = 0.5;
    if (pe && pe.wrap) {
      const rect = pe.wrap.getBoundingClientRect();
      fracX = Math.max(0, Math.min(1, (viewportX - rect.left) / (rect.width || 1)));
      fracY = Math.max(0, Math.min(1, (viewportY - rect.top) / (rect.height || 1)));
    }

    window.State.zoom = wasZoomed ? 1.0 : 1.8;
    updateReaderZoom({ pageNum, fracX, fracY, vpX, vpY });
  }

  let singleTapTimer = null;
  function handleReadiumSingleTap(clientX, clientY) {
    const screenWidth = window.innerWidth;
    const isSingle = window.State.readingMode === 'single';

    if (window.State.isFocusMode) {
      if (isSingle && clientX < screenWidth * 0.30) {
        turnSinglePage(-1);
      } else if (isSingle && clientX > screenWidth * 0.70) {
        turnSinglePage(1);
      }
      return;
    }

    if (isSingle && clientX < screenWidth * 0.30) {
      turnSinglePage(-1);
    } else if (isSingle && clientX > screenWidth * 0.70) {
      turnSinglePage(1);
    } else {
      toggleReaderChrome();
    }
  }

  let mouseDownX = 0, mouseDownY = 0;
  scrollEl.addEventListener('mousedown', (e) => {
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
  });

  scrollEl.addEventListener('click', (e) => {
    if (Date.now() - lastTouchEndTime < 600) return;
    if (Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY) > 8) return;
    if (e.target && e.target.closest && e.target.closest('button, input, select, textarea, .sheet, .menu, #sel-toolbar, #auto-scroll-controller')) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;
    if (e.detail === 2) {
      executeDoubleTapAction(e.clientX, e.clientY);
    } else {
      handleReadiumSingleTap(e.clientX, e.clientY);
    }
  });

  let lastWheelTime = 0;
  scrollEl.addEventListener('wheel', (e) => {
    if (window.State.readingMode === 'single' && window.State.zoom <= 1.02) {
      const now = Date.now();
      if (now - lastWheelTime < 240) return;
      if (Math.abs(e.deltaY) > 12 || Math.abs(e.deltaX) > 12) {
        lastWheelTime = now;
        const delta = (e.deltaY > 0 || e.deltaX > 0) ? 1 : -1;
        turnSinglePage(delta);
      }
    }
  }, { passive: true });

  window.onkeydown = (e) => {
    if (!document.getElementById('reader-scroll')) return;
    if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    
    // Volume button & arrow key page turning
    if (window.State.readingMode === 'single') {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') {
        e.preventDefault();
        turnSinglePage(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') {
        e.preventDefault();
        turnSinglePage(-1);
      }
    } else {
      if (e.key === 'PageDown' || e.key === ' ' || e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') {
        e.preventDefault();
        const sEl = document.getElementById('reader-scroll');
        if (sEl) sEl.scrollBy({ top: sEl.clientHeight * 0.8, behavior: 'smooth' });
      } else if (e.key === 'PageUp' || e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') {
        e.preventDefault();
        const sEl = document.getElementById('reader-scroll');
        if (sEl) sEl.scrollBy({ top: -sEl.clientHeight * 0.8, behavior: 'smooth' });
      }
    }
  };

  scrollEl.addEventListener('touchend', (e)=>{
    lastTouchEndTime = Date.now();
    const wasSelecting = !!selGesture, wasPinching = window.zoomGestureActive;
    if(e.touches.length===0) finalizeSelectionGesture();
    if(e.touches.length<2) finishZoomGesture();

    if(window.State.readingMode==='single' && window.State.zoom<=1.02 && !wasSelecting && !wasPinching && e.touches.length===0 && e.changedTouches.length===1){
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      if(Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)*1.2){
        turnSinglePage(dx<0 ? 1 : -1);
        lastTapTime = 0;
        return;
      }
    }

    if(!wasSelecting && !wasPinching && e.touches.length===0 && e.changedTouches.length===1){
      const t = e.changedTouches[0];
      const movedDuringThisTouch = Math.hypot(t.clientX-touchStartX, t.clientY-touchStartY);
      if(movedDuringThisTouch < 10){
        if(window.pendingSelection){
          const liveRects = window.currentSelectionRects(window.pendingSelection);
          const insideSelection = liveRects.some(r => t.clientX>=r.left && t.clientX<=r.right && t.clientY>=r.top && t.clientY<=r.bottom);
          if(!insideSelection){
            window.hideSelToolbar(); window.clearPendingOverlay(); window.pendingSelection = null;
            lastTapTime = 0;
            return;
          }
        }
        const now = Date.now();
        const distFromLastTap = Math.hypot(t.clientX-lastTapX, t.clientY-lastTapY);
        if(now-lastTapTime < 300 && distFromLastTap < 40){
          if(singleTapTimer){ clearTimeout(singleTapTimer); singleTapTimer = null; }
          lastTapTime = 0;
          executeDoubleTapAction(t.clientX, t.clientY);
        } else {
          lastTapTime = now; lastTapX = t.clientX; lastTapY = t.clientY;
          if(singleTapTimer) clearTimeout(singleTapTimer);
          singleTapTimer = setTimeout(()=>{
            singleTapTimer = null;
            handleReadiumSingleTap(t.clientX, t.clientY);
          }, 250);
        }
      }
    }
  });

  scrollEl.addEventListener('touchcancel', ()=>{
    clearTimeout(longPressTimer);
    selGesture = null;
    finishZoomGesture();
  });
}

/* ============================================================
   PAGE RENDER PIPELINE (virtualised)
   - at most maxParallelRenders pages paint at once, nearest-to-viewport first, so a fast
     scroll can no longer pile up dozens of canvases
   - every render carries a token: a page that is unloaded or re-mounted while its render is
     still in flight can never come back to life (that race used to keep 30+ canvases alive)
   - a canvas backing store is released the moment its page is unloaded
   - the bitmap is shown as soon as it is painted; the text layer follows
   ============================================================ */
// iOS Safari silently draws nothing past ~16.7M pixels per canvas and phones run out of GPU
// memory long before that, so very large (zoomed) pages are rendered at a reduced resolution.
/* Device tier. Chrome only reports RAM in steps (2, 4, 8 GB), so a 6 GB budget phone reads as "8".
   The pixel caps below are chosen so even the biggest tier never needs more than ~32 MB per page canvas,
   and a page at 250% zoom still renders at full sharpness on its own tier. */
const DEVICE_MEM = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
const DEVICE_CORES = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
const RENDER_TIER = DEVICE_MEM <= 2 || (DEVICE_CORES <= 4 && DEVICE_MEM <= 4) ? 'low' : DEVICE_MEM <= 4 ? 'mid' : 'high';
const MAX_CANVAS_PIXELS = { low: 4, mid: 6, high: 8 }[RENDER_TIER] * 1024 * 1024;
// Native sharpness on every phone: budget screens are dpr 2, so nobody is rendered below their screen's resolution.
// Memory is protected by the pixel cap above, not by blurring normal pages.
const MAX_DPR = 2.5;
window.RENDER_TIER = RENDER_TIER;
let maxParallelRenders = RENDER_TIER === 'low' ? 1 : 2;   // slow phones paint one page at a time so scrolling stays smooth
const slowRenderTimes = [];
const MAX_RENDER_FAILURES = 3;
let activeRenders = 0;
let renderQueue = [];
let renderGeneration = 0;

function releasePageResources(pe){
  pe._renderToken = (pe._renderToken || 0) + 1; // invalidates any render still in flight
  if(pe.renderTask){
    try { pe.renderTask.cancel(); } catch(e){}
    pe.renderTask = null;
  }
  if(pe.canvas){
    // Free the pixel buffer now instead of waiting for the garbage collector.
    try { pe.canvas.width = 0; pe.canvas.height = 0; } catch(e){}
  }
  if(pe.pageProxy){
    try { pe.pageProxy.cleanup(); } catch(e){}
    pe.pageProxy = null;
  }
  pe.rendered = false;
  pe.rendering = false;
  pe._renderPromise = null;
}

// Forget everything about the pages (used when leaving the reader or re-mounting it).
export function resetRenderPipeline(){
  renderGeneration++;
  activeRenders = 0;
  renderQueue = [];
}

export function unloadPage(num){
  const pe = pageEls[num];
  if(!pe) return;
  releasePageResources(pe);
  pe._failCount = 0;
  if (typeof window.destroyPageDrawLayer === 'function') {
    window.destroyPageDrawLayer(num);
  }
  pe.wrap.innerHTML = '';
  pe.canvas = null;
  pe.textLayerDiv = null;
  pe.annotLayer = null;
  pe.viewport = null;
  pe.spanRects = null;
  pe.ocrBtn = null;
}

// Releases a page's resources without touching the DOM (the whole reader is being torn down).
export function discardPage(pe){
  if(!pe) return;
  releasePageResources(pe);
  pe.canvas = null;
  pe.textLayerDiv = null;
  pe.annotLayer = null;
  pe.viewport = null;
  pe.spanRects = null;
  pe.ocrBtn = null;
}

// Bounding boxes of the text spans of a page, relative to the page. Measured on first use
// instead of for every page render (it forces a layout of every span), and never cached while
// the page is hidden (single-page mode keeps neighbours at display:none, where every rect is 0).
export function getSpanRects(pe){
  if(!pe || !pe.textLayerDiv || !pe.wrap) return null;
  if(pe.spanRects) return pe.spanRects;
  const wrapRect = pe.wrap.getBoundingClientRect();
  if(!wrapRect.width || !wrapRect.height) return null;
  pe.spanRects = [...pe.textLayerDiv.querySelectorAll('span')]
    .filter(s => s.firstChild && s.firstChild.textContent)
    .map(span => {
      const r = span.getBoundingClientRect();
      return {
        span,
        rect: {
          left: r.left - wrapRect.left,
          right: r.right - wrapRect.left,
          top: r.top - wrapRect.top,
          bottom: r.bottom - wrapRect.top,
          width: r.width
        }
      };
    });
  return pe.spanRects;
}
window.getSpanRects = getSpanRects;

function pumpRenderQueue(){
  while(activeRenders < maxParallelRenders && renderQueue.length){
    const n = renderQueue.shift();
    const pe = pageEls[n];
    if(!pe || pe.rendered || pe.rendering) continue;
    const generation = renderGeneration;
    activeRenders++;
    Promise.resolve(renderPage(n)).catch(()=>{}).finally(()=>{
      if(generation !== renderGeneration) return; // the pipeline was reset meanwhile
      activeRenders = Math.max(0, activeRenders - 1);
      pumpRenderQueue();
    });
  }
}

export function setupVirtualRender(){
  if (window.zoomGestureActive) return;
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;
  const top = scrollEl.scrollTop;
  const viewH = scrollEl.clientHeight;
  const bottom = top + viewH;
  const mid = top + viewH / 2;
  const renderMargin = Math.max(RENDER_TIER === 'low' ? 600 : 900, viewH);        // paint about one screen ahead/behind
  const unloadMargin = renderMargin + Math.max(RENDER_TIER === 'low' ? 700 : 1400, viewH * (RENDER_TIER === 'low' ? 0.8 : 1.5));    // release memory a bit further out

  const wanted = [];
  for(const [num, pe] of Object.entries(pageEls)){
    const n = Number(num);
    const relTop = pe._top !== undefined ? pe._top : (pe.wrap ? pe.wrap.offsetTop : 0);
    const relHeight = pe._height || (pe.nativeVp ? pe.nativeVp.height * pe.scale : 800);
    const relBottom = relTop + relHeight;

    const inView = relBottom > top - renderMargin && relTop < bottom + renderMargin;
    const farAway = relBottom < top - unloadMargin || relTop > bottom + unloadMargin;

    if(inView && !pe.rendered && !pe.rendering){
      wanted.push({ n, dist: Math.abs(relTop + relHeight / 2 - mid) });
    } else if(farAway && (pe.rendered || pe.rendering)){
      unloadPage(n);
    }
  }
  wanted.sort((a, b) => a.dist - b.dist);
  renderQueue = wanted.map(w => w.n);
  pumpRenderQueue();
}

export async function renderPage(num){
  const pe = pageEls[num];
  if(!pe || pe.rendered) return;
  if(pe.rendering) return pe._renderPromise; // join the render that is already running
  if((pe._failCount || 0) >= MAX_RENDER_FAILURES) return; // give up until the page is unloaded and loaded again
  const token = (pe._renderToken = (pe._renderToken || 0) + 1);
  pe.rendering = true;
  const job = renderPageNow(num, pe, token);
  pe._renderPromise = job;
  return job;
}

async function renderPageNow(num, pe, token){
  const tStart = performance.now();
  const doc = window.State.currentDoc;
  // True once this render was superseded: page unloaded, reader re-mounted or document closed.
  const isStale = () => pe._renderToken !== token || pageEls[num] !== pe || window.State.currentDoc !== doc;
  let canvas = null;
  let committed = false;
  try{
    const page = await doc.getPage(num);
    if(isStale()) return;
    pe.pageProxy = page;
    const viewport = page.getViewport({scale: pe.scale});

    // High-performance crystal-clear rendering (Retina grade clarity without GPU memory bloat)
    const dpr = Math.min(window.devicePixelRatio || 2, MAX_DPR);
    let renderViewport = page.getViewport({ scale: pe.scale * dpr });
    const pixels = renderViewport.width * renderViewport.height;
    if(pixels > MAX_CANVAS_PIXELS){
      renderViewport = page.getViewport({ scale: pe.scale * dpr * Math.sqrt(MAX_CANVAS_PIXELS / pixels) });
    }

    canvas = document.createElement('canvas');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn(`Could not acquire 2d context for page ${num}`);
      pe.rendering = false;
      pe._renderPromise = null;
      return;
    }

    // Fetch the text while the bitmap paints so the two overlap instead of queueing.
    const textPromise = page.getTextContent();
    textPromise.catch(() => {});

    const renderTask = page.render({canvasContext: ctx, viewport: renderViewport});
    pe.renderTask = renderTask;
    try {
      await renderTask.promise;
    } catch (renderError) {
      if (renderError?.name === 'RenderingCancelledException' || renderError?.message?.includes('cancelled')) {
        if(!isStale()){ pe.rendering = false; pe._renderPromise = null; }
        return;
      }
      throw renderError;
    } finally {
      if (pe.renderTask === renderTask) {
        pe.renderTask = null;
      }
    }
    if(isStale()) return;

    // Show the bitmap right away (the text layer is added below, a moment later).
    if (typeof window.destroyPageDrawLayer === 'function') {
      try {
        window.destroyPageDrawLayer(num);
      } catch (destroyErr) {
        console.warn('destroyPageDrawLayer notice:', destroyErr);
      }
    }
    const previousCanvas = pe.canvas;
    pe.wrap.innerHTML = '';
    pe.wrap.appendChild(canvas);
    if(previousCanvas && previousCanvas !== canvas){
      try { previousCanvas.width = 0; previousCanvas.height = 0; } catch(e){}
    }
    pe.canvas = canvas;
    pe.textLayerDiv = null;
    pe.annotLayer = null;
    pe.spanRects = null;
    committed = true;

    const textContent = await textPromise;
    if(isStale()) return;
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    textLayerDiv.style.setProperty('--scale-factor', `${viewport.scale}`);

    if (pdfjsLib.renderTextLayer) {
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      }).promise;
    } else if (pdfjsLib.TextLayer) {
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });
      await textLayer.render();
    } else {
      renderTextLayer(textLayerDiv, textContent, viewport);
    }
    if(isStale()) return;

    const annotLayer = document.createElement('div');
    annotLayer.className = 'annot-layer';
    pe.wrap.appendChild(textLayerDiv);
    pe.wrap.appendChild(annotLayer);

    pe.viewport = viewport;
    pe.annotLayer = annotLayer;
    pe.textLayerDiv = textLayerDiv;
    pe.spanRects = null; // measured lazily by getSpanRects()
    pe._failCount = 0;
    pe.rendered = true;
    pe.rendering = false;
    pe._renderPromise = null;
    try { window.onPageRendered && window.onPageRendered(num); } catch (e) {}
    // A phone that needs long to paint a page (slow CPU, 6GB RAM report) switches itself to one page at a time.
    if (maxParallelRenders > 1) {
      slowRenderTimes.push(performance.now() - tStart);
      if (slowRenderTimes.length > 4) slowRenderTimes.shift();
      if (slowRenderTimes.length === 4 && slowRenderTimes.reduce((a, b) => a + b, 0) / 4 > 450) maxParallelRenders = 1;
    }

    try {
      if (typeof window.paintAnnotations === 'function') {
        await window.paintAnnotations(num);
      }
    } catch (annotErr) {
      console.warn(`Annotation paint notice for page ${num}:`, annotErr);
    }
    if (window.pendingSelection && window.pendingSelection.pageNum === num && typeof window.paintPendingOverlay === 'function') {
      window.pendingSelection.pageWrap = pe.wrap;
      window.paintPendingOverlay(window.pendingSelection, true);
    }

    if(textContent.items.length===0){
      pe.scanned = true;
      const ocrBtn = document.createElement('button');
      ocrBtn.className = 'btn';
      ocrBtn.style.cssText = 'position:absolute; top:10px; right:10px; z-index:4; background:var(--surface-3); color:var(--accent); font-size:11.5px; font-weight:600; padding:8px 12px; border:1px solid var(--border); box-shadow:var(--shadow);';
      ocrBtn.innerHTML = `${window.icon('sparkle','icon icon-sm')} Scan text`;
      ocrBtn.onclick = ()=>runOCROnPage(num, canvas, ocrBtn);
      pe.wrap.appendChild(ocrBtn);
      pe.ocrBtn = ocrBtn;
    }
  }catch(err){
    if(err && err.name === 'RenderingCancelledException'){
      if(!isStale()){ pe.rendering = false; pe._renderPromise = null; }
      return;
    }
    if(isStale()) return;
    console.warn(`Page ${num} failed to render, will retry when back in view:`, err && err.message);
    pe._failCount = (pe._failCount || 0) + 1;
    pe.rendered = false;
    pe.rendering = false;
    pe._renderPromise = null;
    if(pe.canvas){
      try { pe.canvas.width = 0; pe.canvas.height = 0; } catch(e){}
    }
    pe.canvas = null;
    pe.textLayerDiv = null;
    pe.annotLayer = null;
    pe.spanRects = null;
    pe.wrap.innerHTML = '';
  }finally{
    if(!committed && canvas){
      try { canvas.width = 0; canvas.height = 0; } catch(e){}
    }
  }
}

export function renderTextLayer(div, textContent, viewport){
  const frag = document.createDocumentFragment();
  const measureCtx = renderTextLayer._ctx || (renderTextLayer._ctx = document.createElement('canvas').getContext('2d'));
  for(const item of textContent.items){
    if(!item.str) continue;
    const tx = pdfjsLib.Util.transform(pdfjsLib.Util.transform(viewport.transform, item.transform),[1,0,0,-1,0,0]);
    const angle = Math.atan2(tx[1], tx[0]);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = tx[4]+'px';
    span.style.top = (tx[5]-fontHeight)+'px';
    span.style.fontSize = fontHeight+'px';
    span.style.fontFamily = 'sans-serif';
    let transform = angle ? `rotate(${angle}rad)` : '';
    if(item.width > 0){
      measureCtx.font = `${fontHeight}px sans-serif`;
      const natural = measureCtx.measureText(item.str).width;
      const target = item.width * viewport.scale;
      if(natural > 0 && target > 0){
        const scaleX = target/natural;
        if(isFinite(scaleX) && scaleX > 0) transform += (transform?' ':'') + `scaleX(${scaleX})`;
      }
    }
    if(transform) span.style.transform = transform;
    frag.appendChild(span);
  }
  div.appendChild(frag);
}

export async function getTesseractWorker(){
  if(tesseractWorker) return tesseractWorker;
  await window.ensureLib('tesseract');
  tesseractWorker = await Tesseract.createWorker('eng');
  return tesseractWorker;
}

export async function runOCROnPage(pageNum, canvas, btnEl){
  const cached = await window.DB.get('ocrcache', window.State.currentFile.id+'_'+pageNum);
  if(cached){ showOCRResult(pageNum, cached.text); return; }
  btnEl.innerHTML = `${window.icon('clock','icon icon-sm')} Reading…`;
  btnEl.disabled = true;
  try{
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(canvas.toDataURL('image/png'));
    const text = (data.text||'').trim();
    await window.DB.put('ocrcache', {id:window.State.currentFile.id+'_'+pageNum, fileId:window.State.currentFile.id, page:pageNum, text});
    if(window.State.searchIndex[window.State.currentFile.id]){
      const p = window.State.searchIndex[window.State.currentFile.id].find(p=>p.page===pageNum);
      if(p) p.text = text;
    }
    btnEl.remove();
    showOCRResult(pageNum, text);
  }catch(err){
    console.warn('OCR failed', err);
    btnEl.innerHTML = `${window.icon('sparkle','icon icon-sm')} Scan text`;
    btnEl.disabled = false;
    window.toast('OCR needs network access — try opening this file in a regular browser tab');
  }
}

export function showOCRResult(pageNum, text){
  const sel = {text: text || '(No text recognized on this page)', pageNum, rects:[]};
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 4px;">Scanned page text</div>
    <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:14px;">Recognized via on-device OCR — page ${pageNum}</div>
    <div class="selectable-text" style="font-size:13.5px; line-height:1.6; white-space:pre-wrap; max-height:38vh; overflow-y:auto; background:var(--surface-2); border-radius:4px; padding:12px; margin-bottom:14px;">${window.escapeHtml(text||'(No text recognized)')}</div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-ghost" style="flex:1;" id="ocr-copy">Copy text</button>
      <button class="btn btn-primary" style="flex:1;" id="ocr-ai">${window.icon('sparkle','icon icon-sm')} AI tools</button>
    </div>
  `);
  document.getElementById('ocr-copy').onclick = async ()=>{ const ok = await window.copyToClipboard(text); window.toast(ok ? 'Copied' : 'Couldn\u2019t copy — try again'); };
  document.getElementById('ocr-ai').onclick = ()=>{ window.pendingSelection = sel; window.openAIMenu(); };
}

export async function exportAnnotatedPdf(fileId, annots){
  if(!annots.length){ window.toast('No highlights or underlines to export yet'); return; }
  window.toast('Preparing export…');
  try{
    const full = await window.DB.get('files', fileId);
    await window.ensureLib('pdflib');
    const { PDFDocument, rgb } = PDFLib;
    const pdfDoc = await PDFDocument.load(full.data.slice(0));
    const pages = pdfDoc.getPages();
    const hexToRgb01 = (hex)=>{
      const n = parseInt(hex.slice(1),16);
      return rgb(((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255);
    };
    for(const a of annots){
      const page = pages[a.page-1];
      if(!page) continue;
      const { width, height } = page.getSize();
      const color = hexToRgb01(a.color);
      for(const r of a.rects){
        const x = r.x*width, w = r.w*width, h = r.h*height;
        const yTop = height - (r.y*height);
        if(a.type==='underline'){
          page.drawLine({ start:{x, y:yTop-h*0.88}, end:{x:x+w, y:yTop-h*0.88}, thickness:1.8, color, opacity:0.9 });
        }else{
          page.drawRectangle({ x, y:yTop-h, width:w, height:h, color, opacity:0.35 });
        }
      }
    }
    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], {type:'application/pdf'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = full.name + ' (annotated).pdf';
    a.click();
    window.toast('Exported');
  }catch(err){
    console.error(err);
    window.toast('Export failed — try again');
  }
}

let saveProgressTimer = null;
export function debouncedSaveProgress() {
  if (saveProgressTimer) clearTimeout(saveProgressTimer);
  saveProgressTimer = setTimeout(() => {
    saveProgress();
  }, 600);
}

export function updateCurrentPageFromScroll(){
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;
  const mid = scrollEl.scrollTop + scrollEl.clientHeight*0.35;
  let closest = window.State.currentPage;
  for(const [num, pe] of Object.entries(pageEls)){
    const top = pe._top !== undefined ? pe._top : (pe.wrap ? pe.wrap.offsetTop : 0);
    if(top <= mid) closest = Number(num);
  }
  if(closest !== window.State.currentPage){
    window.State.currentPage = closest;
    updatePageIndicator();
    debouncedSaveProgress();
  }
}

export function updatePageIndicator(){
  const el = document.getElementById('page-indicator');
  const bottomPageText = document.getElementById('bottom-bar-page-text');
  const bottomPctText = document.getElementById('bottom-bar-pct-text');
  const bottomFill = document.getElementById('bottom-bar-progress-fill');

  const curPage = window.State.currentPage || 1;
  const numPages = window.State.numPages || 1;

  if(el){
    if(window.State.pageList && window.State.pageList.length){
      const sorted = window.State.pageList.slice().sort((a,b)=>a-b);
      const posn = sorted.indexOf(curPage)+1;
      el.textContent = `Page ${curPage} · ${posn>0?posn:'?'} of ${sorted.length} in "${window.State.pageListLabel}"`;
    } else {
      el.textContent = `Page ${curPage} of ${numPages}`;
    }
  }

  const pct = Math.round((curPage / numPages) * 100);

  if (bottomPageText) {
    bottomPageText.textContent = `Page ${curPage} of ${numPages}`;
  }
  if (bottomPctText) {
    bottomPctText.textContent = `${pct}%`;
  }
  if (bottomFill) {
    bottomFill.style.width = `${pct}%`;
  }

  if (window.renderFloatingTTSCapsule && document.getElementById('tts-floating-widget')) {
    window.renderFloatingTTSCapsule();
  }
}

export async function saveProgress(){
  if(!window.State.currentFile) return;
  await window.DB.put('progress', {fileId: window.State.currentFile.id, page: window.State.currentPage, zoom: window.State.zoom});
  window.State.currentFile.lastPage = window.State.currentPage;
  await window.DB.updateFileMeta(window.State.currentFile.id, { lastPage: window.State.currentPage });
}

export function scrollToPage(num, smooth=window.State.smoothScroll){
  const pe = pageEls[num];
  if(!pe) return;
  if(window.State.readingMode==='single'){
    showSinglePage(num);
    return;
  }
  const el = document.getElementById('reader-scroll');
  if (el) el.scrollTo({top: pe.wrap.offsetTop-70, behavior: smooth?'smooth':'auto'});
}

export async function requestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try{
    wakeLockRef = await navigator.wakeLock.request('screen');
    wakeLockRef.addEventListener('release', ()=>{ wakeLockRef = null; });
  }catch(err){ console.warn('Wake lock unavailable:', err.message); }
}

export function releaseWakeLock(){
  if(wakeLockRef){ wakeLockRef.release().catch(()=>{}); wakeLockRef = null; }
}

let currentTocSessionId = 0;

/**
 * Resolves a PDF.js destination (name, array, or page index) to a 1-based page number.
 */
export async function resolveDestToPage(doc, dest) {
  if (!doc || dest == null) return null;
  try {
    let d = dest;
    if (typeof d === 'string') {
      d = await doc.getDestination(d);
    }
    if (typeof d === 'number') {
      return d + 1;
    } else if (Array.isArray(d) && d.length > 0) {
      const first = d[0];
      if (typeof first === 'number') {
        return first + 1;
      } else if (first && typeof first === 'object') {
        const idx = await doc.getPageIndex(first);
        if (typeof idx === 'number' && idx >= 0) return idx + 1;
      }
    }
  } catch (e) {
    console.warn('Error resolving TOC destination to page:', e);
  }
  return null;
}

/**
 * Reads the top text items of a page to extract a real human-readable chapter heading / subtitle.
 */
export async function getPageFirstHeading(doc, pageNum, outlineTitle = '') {
  if (!doc || !pageNum || pageNum < 1 || pageNum > doc.numPages) return '';
  const legacyDoc = await docIsLegacyHindi(doc);
  outlineTitle = fixTocText(outlineTitle, legacyDoc);
  try {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    if (!textContent || !textContent.items || textContent.items.length === 0) return '';

    // Group items into lines based on Y coordinate
    const lineBuckets = [];
    for (const item of textContent.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const y = item.transform ? Math.round(item.transform[5]) : 0;
      let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
      if (!bucket) {
        bucket = { y, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
    }

    // Sort buckets top to bottom (PDF Y is largest at top)
    lineBuckets.sort((a, b) => b.y - a.y);

    const cleanOutline = (outlineTitle || '').toLowerCase().trim();

    for (const b of lineBuckets.slice(0, 10)) {
      b.items.sort((a, b) => a.x - b.x);
      const lineStr = fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      if (lineStr.length < 3) continue;
      // Skip pure digits (like page numbers)
      if (/^\d+$/.test(lineStr)) continue;
      // Skip common metadata / copyright / headers
      if (/^(contents|preface|foreword|acknowledgements|table of contents)/i.test(lineStr)) continue;
      if (/^(copyright|published by|isbn|all rights reserved|page\s+\d+|book\s+\d+|national institute)/i.test(lineStr)) continue;

      const lower = lineStr.toLowerCase();
      if (cleanOutline && (lower === cleanOutline || lower === cleanOutline.replace(/[-_]/g, ' '))) {
        continue;
      }

      // Check if line starts with Chapter / Lesson marker
      if (/^(ch|chap|chapter|lesson|unit|module|पाठ|अध्याय|इकाई)\s*[-.:]?\s*\d+/i.test(lineStr)) {
        const afterMarker = lineStr.replace(/^(ch|chap|chapter|lesson|unit|module|पाठ|अध्याय|इकाई)\s*[-.:]?\s*\d+\s*[-.:]?\s*/i, '').trim();
        if (afterMarker.length >= 3 && !/^\d+$/.test(afterMarker)) {
          return afterMarker;
        }
        continue;
      }

      // Valid heading candidate (not a long body paragraph ending with period)
      if (lineStr.length >= 3 && lineStr.length <= 75 && !lineStr.endsWith('.') && !lineStr.endsWith('।')) {
        return lineStr;
      }
    }
  } catch (e) {
    console.warn('Error reading page heading:', e);
  }
  return '';
}

/**
 * Recursively resolves all outline items, assigns page numbers & end pages,
 * detects chapter headings, and caches the result.
 * Multi-Tier:
 * - Tier 1: Embedded PDF document outline (bookmarks)
 * - Tier 2: Printed in-text Table of Contents (front matter)
 * - Tier 3: Document-wide chapter start heading scanner
 */
export async function resolveAndCacheTOC(doc, fileId) {
  if (!doc) return [];
  const cacheKey = fileId || (window.State.currentFile && window.State.currentFile.id) || 'default';
  if (!window.State.tocResolvedCache) window.State.tocResolvedCache = {};
  if (window.State.tocResolvedCache[cacheKey] && window.State.tocResolvedCache[cacheKey].length > 0) {
    return window.State.tocResolvedCache[cacheKey];
  }

  // Tier 1: Embedded Native PDF Bookmarks Outline
  try {
    const legacyDoc = await docIsLegacyHindi(doc);
    const rawOutline = await doc.getOutline();
    if (rawOutline && rawOutline.length > 0) {
      async function resolveItems(items) {
        const list = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pageNum = await resolveDestToPage(doc, item.dest);
          let subItems = [];
          if (item.items && item.items.length) {
            subItems = await resolveItems(item.items);
          }
          list.push({
            title: fixTocText(item.title, legacyDoc) || `Section ${i + 1}`,
            subtitle: '',
            pageNum: pageNum,
            dest: item.dest,
            items: subItems
          });
        }
        return list;
      }

      const resolved = await resolveItems(rawOutline);
      const hasValidPages = resolved.some(it => it.pageNum && it.pageNum >= 1);

      if (hasValidPages) {
        function calculateEndPages(items, parentMaxPage) {
          for (let i = 0; i < items.length; i++) {
            const cur = items[i];
            let nextStartPage = null;
            for (let j = i + 1; j < items.length; j++) {
              if (items[j].pageNum) {
                nextStartPage = items[j].pageNum;
                break;
              }
            }
            if (nextStartPage && cur.pageNum) {
              cur.endPageNum = Math.max(cur.pageNum, nextStartPage - 1);
            } else if (cur.pageNum) {
              cur.endPageNum = parentMaxPage || doc.numPages;
            } else {
              cur.endPageNum = cur.pageNum;
            }

            if (cur.items && cur.items.length) {
              calculateEndPages(cur.items, cur.endPageNum);
            }
          }
        }
        calculateEndPages(resolved, doc.numPages);

        const enrichPromises = resolved.map(async (item) => {
          if (item.pageNum) {
            try {
              const detected = await getPageFirstHeading(doc, item.pageNum, item.title);
              if (detected && detected.toLowerCase() !== item.title.toLowerCase()) {
                item.subtitle = detected;
              }
            } catch (e) {}
          }
        });
        await Promise.allSettled(enrichPromises);

        window.State.tocResolvedCache[cacheKey] = resolved;
        return resolved;
      }
    }
  } catch (err) {
    console.warn('Error reading native PDF outline:', err);
  }

  // Tier 2: Printed In-Text Table of Contents (Front Matter Pages 1 to 30)
  try {
    const inTextEntries = await extractInTextTOC(doc, fileId);
    if (inTextEntries && inTextEntries.length >= 2) {
      window.State.tocResolvedCache[cacheKey] = inTextEntries;
      return inTextEntries;
    }
  } catch (err) {
    console.warn('Error extracting in-text TOC:', err);
  }

  // Tier 3: Document-Wide Chapter Heading Scanner (Heuristic fallback)
  try {
    const scannedEntries = await scanDocumentForChapters(doc, fileId);
    if (scannedEntries && scannedEntries.length >= 2) {
      window.State.tocResolvedCache[cacheKey] = scannedEntries;
      return scannedEntries;
    }
  } catch (err) {
    console.warn('Error scanning document for chapter headings:', err);
  }

  window.State.tocResolvedCache[cacheKey] = [];
  return [];
}

/**
 * Extracts structured chapters from printed in-text Table of Contents pages.
 */
export async function extractInTextTOC(doc, fileId) {
  if (!doc) return [];
  const legacyDoc = await docIsLegacyHindi(doc);
  const totalPages = doc.numPages || 1;
  const maxScan = Math.min(totalPages, 30);
  const entries = [];
  let currentModule = '';

  for (let p = 1; p <= maxScan; p++) {
    try {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      if (!textContent || !textContent.items || textContent.items.length < 5) continue;

      const lineBuckets = [];
      for (const item of textContent.items) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
        if (!bucket) {
          bucket = { y, items: [] };
          lineBuckets.push(bucket);
        }
        bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
      }
      lineBuckets.sort((a, b) => b.y - a.y);
      const lines = lineBuckets.map(b => {
        b.items.sort((a, b) => a.x - b.x);
        return fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      }).filter(Boolean);

      const pageJoined = lines.join(' ').toLowerCase();
      const isToc = /table\s+of\s+contents|contents\b|content\b|\bindex\b|syllabus\b|scheme\s+of\s+studies|list\s+of\s+(?:lessons|chapters|modules)/i.test(pageJoined) ||
        (lines.filter(l => /\b\d{1,4}\s*$/.test(l) && /(?:chapter|lesson|unit|module|\d+\s*[.:])/i.test(l)).length >= 2);

      if (!isToc) continue;

      for (const line of lines) {
        if (!line || line.length < 3) continue;

        // Module Header: e.g. "Module-6A: Tourism" or "Module 6B: Hospitality Management"
        const modMatch = line.match(/^(module\s*[-–:]?\s*[0-9A-Z]+(?:\s*[:.\-–]\s*[^\n\r]+)?)$/i);
        if (modMatch && !/\b\d{1,3}\s*$/.test(line)) {
          currentModule = modMatch[1].trim();
          continue;
        }

        // Pattern 1: Module/Lesson/Chapter X: Title ... Page
        const m1 = line.match(/^(?:(chapter|lesson|unit|module|paath|adhyaye?|पाठ|अध्याय|इकाई)\s*[:.\-_]?\s*)?(\d{1,3}|[ivxlcdm]+)\s*[:.\-_–—]\s*(.+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m1) {
          const prefix = m1[1] || 'Chapter';
          const num = m1[2];
          const rawTitle = m1[3].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m1[4], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • ${prefix} ${num}: ${rawTitle}` 
              : `${prefix} ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
            continue;
          }
        }

        // Pattern 2: 21. Functions of Travel Agencies ... 14
        const m2 = line.match(/^(\d{1,3})\s*[:.\-_]\s*([A-Za-z0-9\u0900-\u097F\s,–'’"&\-\/]+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m2) {
          const num = m2[1];
          const rawTitle = m2[2].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m2[3], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • Lesson ${num}: ${rawTitle}` 
              : `Lesson ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
            continue;
          }
        }

        // Pattern 3: Chapter/Lesson without dot: "Lesson 21 Functions of Travel ... 14"
        const m3 = line.match(/^(?:chapter|lesson|unit|module)\s+(\d{1,3})\s+([A-Za-z0-9\u0900-\u097F\s,–'’"&\-\/]+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m3) {
          const num = m3[1];
          const rawTitle = m3[2].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m3[3], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • Lesson ${num}: ${rawTitle}` 
              : `Lesson ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
          }
        }
      }
    } catch (e) {}
  }

  if (entries.length >= 2) {
    entries.sort((a, b) => a.pageNum - b.pageNum);
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      cur.endPageNum = next ? Math.max(cur.pageNum, next.pageNum - 1) : totalPages;
    }
    return entries;
  }

  return [];
}

/**
 * Scans page headings across the document for chapter/lesson boundaries.
 */
export async function scanDocumentForChapters(doc, fileId) {
  if (!doc) return [];
  const legacyDoc = await docIsLegacyHindi(doc);
  const totalPages = doc.numPages || 1;
  const entries = [];
  let currentModule = '';

  for (let p = 1; p <= totalPages; p++) {
    try {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      if (!textContent || !textContent.items || textContent.items.length < 3) continue;

      const topItems = textContent.items.filter(it => {
        const y = it.transform ? it.transform[5] : 0;
        return y > 400 || (it.transform && it.transform[0] > 14);
      });

      const lineBuckets = [];
      for (const item of topItems) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
        if (!bucket) {
          bucket = { y, items: [] };
          lineBuckets.push(bucket);
        }
        bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
      }
      lineBuckets.sort((a, b) => b.y - a.y);
      const topLines = lineBuckets.slice(0, 8).map(b => {
        b.items.sort((a, b) => a.x - b.x);
        return fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      }).filter(Boolean);

      for (const line of topLines) {
        const modM = line.match(/\b(module\s*[-–:]?\s*[0-9A-Za-z]+(?:\s*[:.\-–]\s*[^\n\r]+)?)/i);
        if (modM && line.length < 60) {
          currentModule = modM[1].trim();
        }
      }

      for (let i = 0; i < topLines.length; i++) {
        const line = topLines[i];
        const match = line.match(/(?:\b|^|\s)(module|chapter|unit|lesson|paath|adhyaye?|पाठ|अध्याय|इकाई)\s*[:.\-_—–]?\s*0*(\d+|[ivxlcdm]+)\b\s*[:.\-_—–]?\s*([^\n\r]+)?/i);
        if (match) {
          const type = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          const num = match[2];
          let title = (match[3] || '').trim();
          if (!title && topLines[i + 1] && topLines[i + 1].length > 3 && !/^\d+$/.test(topLines[i + 1])) {
            title = topLines[i + 1].trim();
          }
          title = title.replace(/\b(?:page|pg|no\.?|\d+)\b/gi, '').replace(/[\s.·—–-]+$/, '').trim();

          const fullTitle = title 
            ? (currentModule ? `${currentModule} • ${type} ${num}: ${title}` : `${type} ${num}: ${title}`)
            : (currentModule ? `${currentModule} • ${type} ${num}` : `${type} ${num}`);

          if (!entries.some(e => e.pageNum === p || (e.chapterNum === num && e.type === type))) {
            entries.push({
              title: fullTitle,
              subtitle: currentModule || '',
              pageNum: p,
              type,
              chapterNum: num
            });
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (entries.length >= 2) {
    entries.sort((a, b) => a.pageNum - b.pageNum);
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      cur.endPageNum = next ? Math.max(cur.pageNum, next.pageNum - 1) : totalPages;
    }
    return entries;
  }

  return [];
}

/**
 * Returns a flat, clean array of all detected chapters with start/end pages.
 */
export async function getChapterList(doc, fileId) {
  if (!doc) return [];
  const cacheKey = fileId || (window.State.currentFile && window.State.currentFile.id) || 'default';
  let chapters = window.State.tocResolvedCache?.[cacheKey];
  if (!chapters || !chapters.length) {
    chapters = await resolveAndCacheTOC(doc, fileId);
  }

  const list = [];
  function traverse(items, prefix = '') {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.pageNum) {
        const start = item.pageNum;
        const end = Math.max(start, Math.min(item.endPageNum || start, doc.numPages || start));
        const cleanTitle = (item.title || '').trim();
        const fullTitle = item.subtitle ? `${cleanTitle}: ${item.subtitle}` : cleanTitle;
        const pageSpan = end > start ? `pp. ${start}–${end}` : `p. ${start}`;
        list.push({
          title: fullTitle,
          rawTitle: cleanTitle,
          subtitle: item.subtitle || '',
          startPage: start,
          endPage: end,
          pageCount: end - start + 1,
          label: `${prefix}${fullTitle} (${pageSpan})`
        });
      }
      if (item.items && item.items.length) {
        traverse(item.items, `${prefix}  `);
      }
    }
  }

  traverse(chapters || []);
  return list;
}

export async function openTOC(){
  if (!window.State.currentDoc) {
    if (window.toast) window.toast('No document loaded');
    return;
  }

  currentTocSessionId = Date.now();
  const thisSession = currentTocSessionId;
  const doc = window.State.currentDoc;
  const fileId = window.State.currentFile ? window.State.currentFile.id : 'default';

  // Retrieve cached or immediately resolve outline
  let resolvedOutline = window.State.tocResolvedCache?.[fileId];
  if (!resolvedOutline) {
    resolvedOutline = await resolveAndCacheTOC(doc, fileId);
  }

  const hasOutline = resolvedOutline && resolvedOutline.length > 0;
  const tocMap = new Map();
  let itemCounter = 0;

  function renderItems(items, depth){
    let html = '';
    for(const item of items){
      const itemId = 'toc-item-' + (++itemCounter);
      tocMap.set(itemId, item);
      const isCurrentPage = item.pageNum && window.State.currentPage && 
        window.State.currentPage >= item.pageNum && 
        window.State.currentPage <= (item.endPageNum || item.pageNum);

      html += `
        <button class="btn toc-item ${isCurrentPage ? 'toc-item-active' : ''}" data-toc-id="${itemId}" data-page="${item.pageNum || ''}" style="width:100%; justify-content:space-between; align-items:center; padding:10px ${12 + depth * 14}px; background:${isCurrentPage ? 'var(--accent-soft)' : 'transparent'}; color:var(--text); font-size:14px; border-bottom:1px solid var(--border); border-radius:0; text-align:left; gap:10px;">
          <span style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:${isCurrentPage ? '700' : '600'}; font-size:13.5px; color:${isCurrentPage ? 'var(--accent)' : 'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${window.escapeHtml(item.title)}
            </span>
            ${item.subtitle ? `
              <span class="toc-subtitle" style="font-size:11.5px; color:var(--text-dim); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${window.escapeHtml(item.subtitle)}
              </span>
            ` : ''}
          </span>
          ${item.pageNum ? `
            <span class="font-mono toc-page-badge" style="font-size:11px; font-weight:700; color:${isCurrentPage ? 'var(--accent)' : 'var(--text-dim)'}; background:var(--surface-2); border:1px solid var(--border); border-radius:4px; padding:2px 7px; flex-shrink:0;">
              p. ${item.pageNum}
            </span>
          ` : ''}
        </button>
      `;
      if(item.items?.length) html += renderItems(item.items, depth + 1);
    }
    return html;
  }

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:6px 0 12px;">
      <div class="font-display" style="font-size:17px; font-weight:700; color:var(--text);">Contents & Chapters</div>
      ${hasOutline ? `<div style="display:flex; gap:6px;">
        <button class="chip toc-tab active" data-tab="outline">Outline</button>
        <button class="chip toc-tab" data-tab="pages">Pages</button>
      </div>` : ''}
    </div>
    <div id="toc-outline" style="max-height:56vh; overflow-y:auto;">
      ${hasOutline ? renderItems(resolvedOutline, 0) : window.emptyState('list', 'No table of contents', 'This PDF doesn\u2019t include an outline — browse by page below.')}
    </div>
    <div id="toc-pages" style="display:${hasOutline ? 'none' : 'grid'}; grid-template-columns:repeat(4,1fr); gap:8px; max-height:52vh; overflow-y:auto; padding:2px;"></div>
  `);

  document.querySelectorAll('.toc-item').forEach(b => {
    b.onclick = async () => {
      const itemId = b.dataset.tocId;
      const item = tocMap.get(itemId);
      if (!item) return;

      let targetPage = item.pageNum;
      if (!targetPage && item.dest) {
        targetPage = await resolveDestToPage(doc, item.dest);
      }

      window.Sheet.close();
      if (targetPage && targetPage >= 1 && targetPage <= (window.State.numPages || 999999)) {
        scrollToPage(targetPage);
      } else if (window.toast) {
        window.toast('Could not find target page');
      }
    };
  });

  const pagesGrid = document.getElementById('toc-pages');
  const outlineDiv = document.getElementById('toc-outline');
  let pagesBuilt = false;
  let observer = null;

  function buildPageThumbs(){
    if(pagesBuilt || !pagesGrid) return;
    pagesBuilt = true;
    const numPages = window.State.numPages || 0;
    
    pagesGrid.innerHTML = Array.from({length: numPages}, (_,i)=>i+1).map(i=>`
      <button class="toc-pg" data-page="${i}" style="position:relative; aspect-ratio:0.72; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
        <span class="font-mono" style="font-size:10.5px; color:var(--text-faint);">${i}</span>
      </button>
    `).join('');

    pagesGrid.querySelectorAll('.toc-pg').forEach(el => {
      el.onclick = () => {
        const pg = Number(el.dataset.page);
        window.Sheet.close();
        if (pg) scrollToPage(pg);
      };
    });

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && thisSession === currentTocSessionId) {
            const el = entry.target;
            observer.unobserve(el);
            const pgNum = Number(el.dataset.page);
            if (pgNum) renderThumbCanvas(pgNum, el);
          }
        }
      }, { root: pagesGrid, rootMargin: '100px 0px' });

      pagesGrid.querySelectorAll('.toc-pg').forEach(el => observer.observe(el));
    }
  }

  async function renderThumbCanvas(i, el) {
    if (thisSession !== currentTocSessionId) return;
    try {
      const page = await window.State.currentDoc.getPage(i);
      if (thisSession !== currentTocSessionId) return;
      const vp1 = page.getViewport({scale:1});
      const scale = 130 / vp1.width;
      const vp = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
      if (thisSession !== currentTocSessionId) return;
      canvas.style.cssText = 'width:100%; height:100%; object-fit:cover;';
      el.innerHTML = '';
      el.appendChild(canvas);
    } catch(e) {}
  }

  if(!hasOutline) buildPageThumbs();

  document.querySelectorAll('.toc-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.toc-tab').forEach(t => t.classList.toggle('active', t===tab));
      const showPages = tab.dataset.tab === 'pages';
      if (outlineDiv) outlineDiv.style.display = showPages ? 'none' : 'block';
      if (pagesGrid) pagesGrid.style.display = showPages ? 'grid' : 'none';
      if (showPages) buildPageThumbs();
    };
  });
}

export async function toggleBookmark(){
  const fid = window.State.currentFile.id, page = window.State.currentPage;
  const existing = (await window.DB.byIndex('bookmarks','fileId',fid)).find(b=>b.page===page);
  if(existing){ await window.DB.del('bookmarks', existing.id); window.toast('Bookmark removed'); return; }
  await openBookmarkCategoryPicker(fid, page);
}

export async function openBookmarkCategoryPicker(fid, page){
  const all = await window.DB.all('bookmarks');
  const categories = [...new Set(all.map(b=>b.category).filter(Boolean))].sort();
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 4px;">Save bookmark to…</div>
    <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:16px;">Page ${page} · organize it into a collection</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
      ${categories.map(c=>`<div class="chip cat-pick" data-cat="${window.escapeHtml(c)}">${window.icon('folder','icon icon-sm')} ${window.escapeHtml(c)}</div>`).join('')}
      <div class="chip cat-pick" data-cat="">No collection</div>
    </div>
    <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:6px;">Or create a new one</div>
    <div style="display:flex; gap:8px;">
      <input id="new-cat-input" placeholder="e.g. Important, Practice Questions" style="flex:1; padding:12px; font-size:14px;">
      <button class="btn btn-primary" id="new-cat-save" style="padding:0 18px;">Save</button>
    </div>
  `);
  const finish = async (category)=>{
    await window.DB.put('bookmarks', {id:window.uid(), fileId:fid, page, category:category||'', createdAt:Date.now()});
    window.Sheet.close();
    window.toast(category? `Bookmarked to "${category}"` : 'Bookmarked');
  };
  document.querySelectorAll('.cat-pick').forEach(el=>{
    el.onclick = ()=>finish(el.dataset.cat);
  });
  document.getElementById('new-cat-save').onclick = ()=>{
    const val = document.getElementById('new-cat-input').value.trim();
    finish(val);
  };
}

export async function openReaderMenu(){
  const fid = window.State.currentFile.id;
  const bms = (await window.DB.byIndex('bookmarks','fileId',fid)).sort((a,b)=>a.page-b.page);
  const annots = (await window.DB.byIndex('annotations','fileId',fid)).sort((a,b)=>a.page-b.page);
  const notes = (await window.DB.byIndex('notes','fileId',fid)).sort((a,b)=>a.page-b.page);
  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 12px;">
      <div class="font-display" style="font-size:17px; font-weight:600;">Book tools</div>
      <button id="book-tools-close-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
        ${window.icon('x','icon icon-sm')}
      </button>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:16px;">
      <button class="btn btn-ghost" style="flex:1;" id="tab-bookmarks">Bookmarks (${bms.length})</button>
      <button class="btn btn-ghost" style="flex:1;" id="tab-highlights">Highlights (${annots.length})</button>
      <button class="btn btn-ghost" style="flex:1;" id="tab-notes">Notes (${notes.length})</button>
    </div>
    <div id="reader-menu-content"></div>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding:6px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-md);">
      <button class="btn btn-icon" id="zoom-step-out" style="width:36px; height:36px;">${window.icon('zoomOut','icon icon-sm')}</button>
      <span id="zoom-pct-label" class="font-mono" style="font-size:14px; font-weight:700; min-width:56px; text-align:center;">${Math.round(window.State.zoom*100)}%</span>
      <button class="btn btn-icon" id="zoom-step-in" style="width:36px; height:36px;">${window.icon('zoomIn','icon icon-sm')}</button>
    </div>
    <div style="display:flex; gap:6px; margin-top:8px;">
      ${[100,125,150,200].map(p=>`<button class="chip zoom-preset" data-zoom="${p}" style="flex:1; text-align:center; ${Math.round(window.State.zoom*100)===p?'background:var(--accent-soft); color:var(--accent); border-color:var(--accent);':''}">${p}%</button>`).join('')}
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn" data-fit="width" style="flex:1; padding:11px; background:${window.State.fitMode==='width'?'var(--accent-soft)':'var(--surface-2)'}; color:${window.State.fitMode==='width'?'var(--accent)':'var(--text)'}; border:1px solid ${window.State.fitMode==='width'?'var(--accent)':'var(--border)'};">${window.icon('list','icon icon-sm')} Fit width</button>
      <button class="btn" data-fit="page" style="flex:1; padding:11px; background:${window.State.fitMode==='page'?'var(--accent-soft)':'var(--surface-2)'}; color:${window.State.fitMode==='page'?'var(--accent)':'var(--text)'}; border:1px solid ${window.State.fitMode==='page'?'var(--accent)':'var(--border)'};">${window.icon('grid','icon icon-sm')} Fit page</button>
    </div>
    <button class="btn btn-ghost" style="width:100%; padding:12px; margin-top:12px;" id="open-page-tools">${window.icon('grid','icon icon-sm')} Page tools — rotate, delete, extract, merge</button>
    <button class="btn btn-primary" style="width:100%; padding:13px; margin-top:10px;" id="export-annotated">${window.icon('upload','icon icon-sm')} Export PDF with highlights</button>
  `);
  document.getElementById('book-tools-close-x').onclick = ()=>window.Sheet.close();
  document.getElementById('open-page-tools').onclick = ()=>window.openPageTools(fid);
  document.getElementById('export-annotated').onclick = ()=>exportAnnotatedPdf(fid, annots);
  const pctLabel = document.getElementById('zoom-pct-label');
  function applyZoom(newZoom){
    window.State.zoom = Math.min(2.5, Math.max(0.5, newZoom));
    pctLabel.textContent = Math.round(window.State.zoom*100)+'%';
    document.querySelectorAll('.zoom-preset').forEach(c=>{
      const on = Number(c.dataset.zoom)===Math.round(window.State.zoom*100);
      c.style.background = on? 'var(--accent-soft)':'';
      c.style.color = on? 'var(--accent)':'';
      c.style.borderColor = on? 'var(--accent)':'';
    });
    updateReaderZoom(true);
  }
  document.getElementById('zoom-step-out').onclick = ()=>applyZoom(window.State.zoom-0.1);
  document.getElementById('zoom-step-in').onclick = ()=>applyZoom(window.State.zoom+0.1);
  document.querySelectorAll('.zoom-preset').forEach(chip=>{
    chip.onclick = ()=>applyZoom(Number(chip.dataset.zoom)/100);
  });
  document.querySelectorAll('[data-fit]').forEach(btn=>{
    btn.onclick = ()=>{
      window.State.fitMode = btn.dataset.fit;
      window.State.zoom = 1;
      window.Sheet.close();
      updateReaderZoom(true);
    };
  });
  const content = document.getElementById('reader-menu-content');
  function showBookmarks(){
    content.innerHTML = bms.length? bms.map(b=>`<button class="btn menu-jump" data-page="${b.page}" style="width:100%; justify-content:space-between; padding:11px; background:transparent; border-bottom:1px solid var(--border); border-radius:0; color:var(--text);">
      <span>${window.icon('bookmark','icon icon-sm')} Page ${b.page}${b.category? ` <span style="color:var(--text-faint); font-weight:400;">· ${window.escapeHtml(b.category)}</span>`:''}</span><span style="color:var(--text-faint);">${window.icon('chevRight','icon icon-sm')}</span>
    </button>`).join('') : window.emptyState('bookmark','No bookmarks yet','Tap the bookmark icon while reading.');
    bindJumps();
  }
  function showHighlights(){
    content.innerHTML = annots.length? annots.map(a=>`<div class="menu-jump" data-page="${a.page}" style="padding:11px; border-bottom:1px solid var(--border); cursor:pointer; display:flex; gap:10px; align-items:flex-start;">
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><span style="width:10px; height:10px; border-radius:50%; background:${a.color}; flex-shrink:0;"></span><span class="font-mono" style="font-size:11px; color:var(--text-faint);">Page ${a.page} · ${a.type==='underline'?'underline':'highlight'}</span></div>
        <div style="font-size:13.5px; color:var(--text-dim); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${window.escapeHtml(a.text||'')}</div>
      </div>
      <button class="btn del-annot-btn" data-id="${a.id}" style="width:32px; height:32px; background:transparent; color:var(--text-faint); flex-shrink:0;">${window.icon('trash','icon icon-sm')}</button>
    </div>`).join('') : window.emptyState('highlighter','No highlights yet','Select text while reading to highlight it.');
    bindJumps();
    content.querySelectorAll('.del-annot-btn').forEach(btn=>{
      btn.onclick = (e)=>{
        e.stopPropagation();
        const a = annots.find(x=>x.id===btn.dataset.id);
        if(a) window.confirmDeleteAnnotation(a, a.page);
      };
    });
  }
  function showNotes(){
    content.innerHTML = notes.length? notes.map(n=>{
      const info = window.getNoteCategoryInfo ? window.getNoteCategoryInfo(n.kind) : { label: n.kind || 'Note', emoji: '📝' };
      return `<div class="menu-jump" data-page="${n.page}" style="padding:11px; border-bottom:1px solid var(--border); cursor:pointer;">
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:4px; font-weight:700; display:flex; align-items:center; gap:4px;">
          <span>${info.emoji}</span> <span>${window.escapeHtml(info.label)}</span> <span style="font-weight:400; color:var(--text-faint);">· Page ${n.page}</span>
        </div>
        <div style="font-size:13.5px; color:var(--text); overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${window.escapeHtml(window.stripMarkdown ? window.stripMarkdown(n.content||'') : (n.content||''))}</div>
      </div>`;
    }).join('') : window.emptyState('note','No notes yet','Generate AI notes or write your own while reading.');
    bindJumps();
  }
  function bindJumps(){
    content.querySelectorAll('.menu-jump').forEach(el=>{ el.onclick=()=>{ window.Sheet.close(); scrollToPage(Number(el.dataset.page)); }; });
  }
  document.getElementById('tab-bookmarks').onclick = showBookmarks;
  document.getElementById('tab-highlights').onclick = showHighlights;
  document.getElementById('tab-notes').onclick = showNotes;
  showBookmarks();
}

// Bind to window for global availability
window.openReader = openReader;
window.renderReaderShell = renderReaderShell;
window.computeFitScale = computeFitScale;
window.mountReaderContent = mountReaderContent;
window.updateReaderZoom = updateReaderZoom;
window.getScrollAnchorPoint = getScrollAnchorPoint;
window.restoreScrollAnchorPoint = restoreScrollAnchorPoint;
window.showSinglePage = showSinglePage;
window.turnSinglePage = turnSinglePage;
window.setupReaderInteractions = setupReaderInteractions;
window.setupVirtualRender = setupVirtualRender;
window.unloadPage = unloadPage;
window.renderPage = renderPage;
window.renderTextLayer = renderTextLayer;
window.runOCROnPage = runOCROnPage;
window.showOCRResult = showOCRResult;
window.exportAnnotatedPdf = exportAnnotatedPdf;
window.updateCurrentPageFromScroll = updateCurrentPageFromScroll;
window.updatePageIndicator = updatePageIndicator;
window.saveProgress = saveProgress;
window.scrollToPage = scrollToPage;
window.requestWakeLock = requestWakeLock;
window.releaseWakeLock = releaseWakeLock;
window.openTOC = openTOC;
window.toggleBookmark = toggleBookmark;
window.openBookmarkCategoryPicker = openBookmarkCategoryPicker;
window.openReaderMenu = openReaderMenu;
window.getCurrentPageText = getCurrentPageText;
window.openReaderSettings = openReaderSettings;
window.openReadingThemesModal = openReadingThemesModal;
window.applyAdvancedReaderSettings = applyAdvancedReaderSettings;
window.updateSystemImmersiveMode = updateSystemImmersiveMode;
window.openAdvancedSettingsModal = openAdvancedSettingsModal;
window.toggleFocusMode = toggleFocusMode;
window.toggleReaderChrome = toggleReaderChrome;
window.openPageJumperModal = openPageJumperModal;
window.startAutoScroll = startAutoScroll;
window.stopAutoScroll = stopAutoScroll;
window.toggleAutoScrollPause = toggleAutoScrollPause;
window.adjustAutoScrollSpeed = adjustAutoScrollSpeed;
window.resolveDestToPage = resolveDestToPage;
window.getPageFirstHeading = getPageFirstHeading;
window.resolveAndCacheTOC = resolveAndCacheTOC;
window.getChapterList = getChapterList;
