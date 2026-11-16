// @ts-nocheck
/**
 * Advanced Fabric.js Drawing & Shape Annotations Module for Strata PDF Reader
 * Features:
 * - Freehand Pen drawing
 * - Shapes: Rectangle / Square, Circle / Ellipse, Arrow, Straight Line
 * - Custom Color Palette, Stroke Thickness, and Fill Options
 * - Object Selection, Move, Scale (Resize), Rotate, and Touch-Hold Transformations via Fabric.js
 * - Object Eraser Tool
 * - Per-page Undo / Redo history
 * - IndexedDB persistence for PDF documents
 */

import * as fabricModule from 'fabric';

// Handle both ES module default and named exports for Fabric.js v5 / v6 compatibility
const fabric = fabricModule.fabric || fabricModule;

let isMarkupActive = false;
// 'none' (pan) | 'select' | 'pen' | 'marker' | 'glow' | 'laser' | 'text' | 'stamp' | 'rectangle' | 'ellipse' | 'arrow' | 'line' | 'eraser'
let activeTool = 'pen';
let activeColor = '#ef4444'; // Red default
let activeStrokeWidth = 2; // 2: Thin, 6: Medium, 12: Thick
let activeFill = 'none'; // 'none' | 'rgba' | 'solid'
let inkHidden = false;            // reading mode: drawings hidden (never deleted)
let laserFadeMs = 4000;          // how long a laser trail stays
let activeStamp = 'imp';
let textSticky = false;          // text with a yellow sticky-note background
let snapShapes = true;           // hold still at the end of a stroke -> straight line / circle / box
let drawingBusy = false;         // a stroke is in progress (the card fades, the draw region must not move)

const TOOL_DEFS = [
  { id: 'select',    g: '🖐️', t: 'Select — khiskao / bada-chhota karo' },
  { id: 'pen',       g: '✏️', t: 'Pen — seedha likhna' },
  { id: 'marker',    g: '🖍️', t: 'Marker — text ko highlight karo' },
  { id: 'glow',      g: '✨', t: 'Glow pen — chamakta likhna' },
  { id: 'laser',     g: '🔴', t: 'Laser — dikhao, apne aap gayab (save nahi)' },
  { id: 'text',      g: '<span class="mk-aa">Aa</span>', t: 'Text — tap karke likho' },
  { id: 'stamp',     g: '⭐', t: 'Stamp — IMP, ★, ? lagao' },
  { id: 'rectangle', g: '⬛', t: 'Box' },
  { id: 'ellipse',   g: '⭕', t: 'Gola / ellipse' },
  { id: 'arrow',     g: '➔', t: 'Teer (arrow)' },
  { id: 'line',      g: '➖', t: 'Seedhi line' },
  { id: 'eraser',    g: '🧹', t: 'Rubber — object par tap karke hatao' }
];
const STAMPS = {
  imp:    { label: 'IMP',    color: '#d92b2b' },
  star:   { label: '★',      color: '#e08a00' },
  doubt:  { label: '?',      color: '#7c5cff' },
  done:   { label: '✓',      color: '#1a9a55' },
  revise: { label: 'Revise', color: '#d9540e' },
  exam:   { label: 'Q.Exam', color: '#0a7fb5' }
};
const MARKER_WIDTH = { 2: 9, 6: 15, 12: 22 };   // on-screen px (made zoom-proof when the brush is set)
const pageZoomOf = (fCanvas) => Math.max(0.2, (fCanvas && fCanvas.viewportTransform && fCanvas.viewportTransform[0]) || 1);
const TEXT_SIZE = { 2: 15, 6: 20, 12: 30 };   // on-screen px at the moment it is placed

// Toolbar layout (compact/full, horizontal/vertical, where it was left) is remembered between sessions.
let ui = { mode: 'full', orient: 'h', x: null, y: null };
try { Object.assign(ui, JSON.parse(localStorage.getItem('sayad_markup_ui') || '{}')); } catch (e) {}
function saveUi() { try { localStorage.setItem('sayad_markup_ui', JSON.stringify(ui)); } catch (e) {} }

// Active Fabric Canvases map by page number: pageNum -> fabric.Canvas
const fabricCanvases = new Map();

// Undo/Redo stacks by page: pageNum -> Array of canvas JSON strings
const undoStacks = new Map();
const redoStacks = new Map();

const COLOR_PALETTE = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#18181b', // Dark / Black
  '#ffffff'  // White
];

export function isMarkupModeActive() {
  return isMarkupActive;
}

export function setInkHidden(v) {
  inkHidden = !!v;
  document.body.classList.toggle('ink-hidden', inkHidden);
  const e = document.getElementById('mtool-eye'); if (e) { e.classList.toggle('on', inkHidden); e.title = inkHidden ? 'Drawings dikhao' : 'Drawings chhupao'; }
  window.toast(inkHidden ? 'Drawings chhup gaye (delete nahi hue)' : 'Drawings wapas dikh rahe hain');
}
export function toggleInkHidden() { setInkHidden(!inkHidden); }
window.toggleInkHidden = toggleInkHidden;
window.isInkHidden = () => inkHidden;

function showFirstUseTip() {
  let seen = false;
  try { seen = !!localStorage.getItem('sayad_markup_tip'); } catch (_) {}
  if (seen) { window.toast('Annotation tools chalu'); return; }
  const tb = document.getElementById('markup-toolbar');
  const tip = document.createElement('div');
  tip.id = 'mk-tip';
  tip.innerHTML = '<span>✍️ 1 ungli = likho · ✌️ 2 ungli = scroll/zoom · ⋮⋮ se card khiskao · 👁 se drawings chhupao</span><button type="button">Samajh gaya</button>';
  document.body.appendChild(tip);
  const r = tb ? tb.getBoundingClientRect() : null;
  tip.style.top = Math.min(window.innerHeight - 90, (r ? r.bottom : 60) + 10) + 'px';
  const bye = () => { try { localStorage.setItem('sayad_markup_tip', '1'); } catch (_) {} tip.remove(); };
  tip.querySelector('button').onclick = bye;
  setTimeout(bye, 9000);
}

export function toggleMarkupToolbar() {
  isMarkupActive = !isMarkupActive;
  renderMarkupToolbar();

  if (isMarkupActive) {
    // Drawing layers are created lazily (a full Fabric canvas is two extra canvases per page),
    // so make sure every page that is on screen has one before the first stroke.
    for (const [num, pe] of Object.entries(window.pageEls || {})) {
      if (pe && pe.rendered) paintDrawingsForPage(Number(num));
    }
  }
  updateAllPageOverlayPointerEvents();

  if (isMarkupActive) {
    showFirstUseTip();
  } else {
    deselectAllCanvases();
    closeFocusBand();
    closeFlyout();
    releaseEmptyDrawLayers();
    window.toast('Annotation tools closed');
  }
}

// Pages without any drawn object do not need a Fabric layer once markup mode is closed.
function releaseEmptyDrawLayers() {
  [...fabricCanvases.entries()].forEach(([pNum, fCanvas]) => {
    try {
      if (!fCanvas.getObjects().length) {
        destroyPageDrawLayer(pNum);
        const pe = window.pageEls ? window.pageEls[pNum] : null;
        const container = pe && pe.wrap ? pe.wrap.querySelector('.fabric-canvas-container') : null;
        if (container) container.remove();
      }
    } catch (e) { /* keep the layer if it cannot be inspected */ }
  });
}

// True when a saved Fabric JSON actually contains drawn objects.
function drawingHasObjects(json) {
  if (!json) return false;
  if (typeof json === 'string') return !/"objects"\s*:\s*\[\s*\]/.test(json);
  return Array.isArray(json.objects) && json.objects.length > 0;
}

function getToolLabel(t) {
  const d = TOOL_DEFS.find(x => x.id === t);
  return d ? d.t.split(' — ')[0] : 'Scroll / Zoom';
}

function hexToRgb(hex) {
  const h = (hex || '#ef4444').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixWithWhite(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const m = v => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}
function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ------------------------------------------------------------------ */
/*  Toolbar card: full / mini, horizontal / vertical, draggable         */
/* ------------------------------------------------------------------ */
function widthWord() { return activeStrokeWidth <= 2 ? 'Thin' : activeStrokeWidth <= 6 ? 'Med' : 'Thick'; }
function widthClass() { return activeStrokeWidth <= 2 ? '2' : activeStrokeWidth <= 6 ? '6' : '12'; }

function swatchesHtml() {
  const custom = !COLOR_PALETTE.some(c => c.toLowerCase() === activeColor.toLowerCase());
  return COLOR_PALETTE.map(c => `
      <div class="markup-swatch ${activeColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-color="${c}" style="background:${c};"></div>
    `).join('') + `
      <label class="markup-swatch markup-custom-swatch ${custom ? 'active' : ''}" title="Custom Color Picker" style="position:relative; background:${custom ? activeColor : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}; display:inline-flex; align-items:center; justify-content:center; overflow:hidden;">
        <input type="color" id="mtool-custom-color" value="${activeColor}" style="opacity:0; width:100%; height:100%; position:absolute; top:0; left:0; cursor:pointer;" />
      </label>`;
}

function stampChipsHtml() {
  return Object.entries(STAMPS).map(([k, s]) =>
    `<button class="mk-stamp-chip ${activeStamp === k ? 'active' : ''}" data-stamp="${k}" style="--sc:${s.color}">${s.label}</button>`).join('');
}

function pillsHtml(vertical) {
  const out = [];
  const wDot = `<span class="stroke-dot stroke-w-${widthClass()}"></span>`;
  out.push({ id: 'mtool-width-cycle', title: `Stroke thickness: ${activeStrokeWidth}px`, inner: vertical ? wDot : `${wDot}<span>${widthWord()}</span>`, on: false });
  if (['rectangle', 'ellipse', 'select'].includes(activeTool)) {
    out.push({ id: 'mtool-fill-cycle', title: `Shape fill: ${activeFill}`, inner: vertical ? (activeFill === 'none' ? '⚪' : activeFill === 'solid' ? '🔴' : '🌓') : `<span>${activeFill === 'none' ? '⚪' : activeFill === 'solid' ? '🔴' : '🌓'}</span><span>${activeFill === 'none' ? 'No Fill' : activeFill === 'solid' ? 'Soft' : 'Solid'}</span>`, on: activeFill !== 'none' });
  }
  if (activeTool === 'text') {
    out.push({ id: 'mtool-sticky', title: 'Yellow sticky-note background', inner: vertical ? '🟨' : '<span>🟨</span><span>Sticky</span>', on: textSticky });
  }
  if (activeTool === 'laser') {
    out.push({ id: 'mtool-fade', title: 'How long the laser trail stays', inner: vertical ? `${laserFadeMs / 1000}s` : `<span>⏱</span><span>Fade ${laserFadeMs / 1000}s</span>`, on: false });
  }
  if (['pen', 'glow'].includes(activeTool)) {
    out.push({ id: 'mtool-snap', title: 'Draw, then hold still: it becomes a straight line / circle / box', inner: vertical ? '◻' : '<span>◻</span><span>Snap</span>', on: snapShapes });
  }
  return out.map(p => `<button class="markup-pill-btn ${p.on ? 'active' : ''}" id="${p.id}" title="${p.title}">${p.inner}</button>`).join('');
}

export function renderMarkupToolbar() {
  let toolbarEl = document.getElementById('markup-toolbar');

  if (!isMarkupActive) {
    if (toolbarEl) toolbarEl.remove();
    closeFlyout();
    return;
  }

  const fresh = !toolbarEl;
  if (!toolbarEl) {
    toolbarEl = document.createElement('div');
    toolbarEl.id = 'markup-toolbar';
    const readerShell = document.querySelector('.view') || document.body;
    readerShell.appendChild(toolbarEl);
  }

  const curPg = Number(window.State ? window.State.currentPage || 1 : 1);
  const pageUndo = undoStacks.get(curPg) || [];
  const pageRedo = redoStacks.get(curPg) || [];
  const vert = ui.orient === 'v';
  const mini = ui.mode === 'mini';
  const def = TOOL_DEFS.find(t => t.id === activeTool);
  toolbarEl.className = `${vert ? 'mk-v' : 'mk-h'} ${mini ? 'mk-mini' : 'mk-full'}${drawingBusy ? ' md-busy' : ''}`;

  const toolBtns = TOOL_DEFS.map(t =>
    `<button class="markup-tool-btn ${activeTool === t.id ? 'active' : ''}" id="mtool-${t.id}" title="${t.t}" aria-label="${t.t}">${t.g}</button>`).join('') +
    `<button class="markup-tool-btn ${focusBandEl ? 'active' : ''}" id="mtool-focus" title="Focus band: baaki page dim" aria-label="Focus band">🔦</button>`;
  const undoBtn = `<button class="markup-tool-btn" id="mtool-undo" title="Undo on Page ${curPg}" aria-label="Undo" ${pageUndo.length <= 1 ? 'disabled style="opacity:0.35; cursor:default;"' : ''}>↩️</button>`;
  const redoBtn = `<button class="markup-tool-btn" id="mtool-redo" title="Redo on Page ${curPg}" aria-label="Redo" ${pageRedo.length === 0 ? 'disabled style="opacity:0.35; cursor:default;"' : ''}>↪️</button>`;
  const clearBtn = `<button class="markup-tool-btn" id="mtool-clear-page" title="Clear Page ${curPg}" aria-label="Clear page">🗑️</button>`;
  const closeBtn = `<button class="markup-tool-btn" id="mtool-close" title="Close Toolbar" aria-label="Close" style="color:var(--danger);">✖️</button>`;
  const orientBtn = `<button class="mk-hbtn" id="mtool-orient" title="${vert ? 'Make horizontal' : 'Make vertical'}" aria-label="Orientation">${vert ? '⇄' : '⇅'}</button>`;
  const eyeBtn = `<button class="mk-hbtn${inkHidden ? ' on' : ''}" id="mtool-eye" title="${inkHidden ? 'Drawings dikhao' : 'Drawings chhupao'}" aria-label="Hide or show drawings">👁</button>`;
  const modeBtn = `<button class="mk-hbtn" id="mtool-mode" title="${mini ? 'Expand' : 'Compact'}" aria-label="Expand or compact">${mini ? '⌃' : '⌄'}</button>`;
  const badge = `<span class="markup-status-badge ${activeTool === 'none' ? 'badge-pan' : 'badge-active'}">${activeTool === 'none' ? '🖐️ Pan / Scroll Mode' : `${def ? def.g.replace(/<[^>]+>/g, '') : ''} ${getToolLabel(activeTool)} Active`}</span>`;

  if (mini && !vert) {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move"><span class="drag-dots">⋮⋮</span></div>
      <div class="mk-strip">${toolBtns}</div>
      <button class="mk-colordot" id="mtool-colorpop" title="Colours" aria-label="Colours" style="background:${activeColor}"></button>
      ${undoBtn}
      ${eyeBtn}
      ${modeBtn}
      ${closeBtn}`;
  } else if (mini) {
    const glyph = activeTool === 'none' ? '🖐️' : (def ? def.g : '✏️');
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move"><span class="drag-dots">⋮⋮</span></div>
      <button class="mk-toolchip" id="mtool-mode" title="Expand" aria-label="Expand">${glyph}</button>
      <button class="mk-colordot" id="mtool-cycle-color" title="Next colour" aria-label="Next colour" style="background:${activeColor}"></button>
      ${undoBtn}
      ${modeBtn}
      ${closeBtn}`;
  } else if (vert) {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move"><span class="drag-dots">⋮⋮</span><span class="drag-title">${curPg}</span></div>
      <div class="mk-vhead">${eyeBtn}${orientBtn}${modeBtn}</div>
      <div class="mk-tools mk-vscroll">${toolBtns}</div>
      <div class="mk-vsep"></div>
      <button class="mk-colordot" id="mtool-colorpop" title="Colours" aria-label="Colours" style="background:${activeColor}"></button>
      <div class="mk-vpills">${pillsHtml(true)}</div>
      <div class="mk-vsep"></div>
      <div class="mk-vacts">${undoBtn}${redoBtn}${clearBtn}${closeBtn}</div>`;
  } else {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle" title="Drag to move toolbox">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="drag-dots">⋮⋮</span>
          <span class="drag-title">Pg ${curPg}</span>
        </div>
        ${badge}
        <div class="mk-hr">${eyeBtn}${orientBtn}${modeBtn}</div>
      </div>
      <div class="mk-tools">${toolBtns}</div>
      ${activeTool === 'stamp' ? `<div class="mk-stamps">${stampChipsHtml()}</div>` : ''}
      <div class="mk-colors">${swatchesHtml()}</div>
      <div class="mk-foot">
        <div class="mk-pills">${pillsHtml(false)}</div>
        <div class="mk-acts">${undoBtn}${redoBtn}${clearBtn}${closeBtn}</div>
      </div>`;
  }

  makeToolbarDraggable(toolbarEl);
  bindToolbar(toolbarEl, curPg);
  placeToolbar(toolbarEl, fresh);
  if (vert && !mini && activeTool === 'stamp') openFlyout('stamp'); else if (!(flyKind === 'color' && (vert ? !mini : mini))) closeFlyout();
}

function afterToolChange() {
  if (inkHidden && activeTool !== 'none') setInkHidden(false);   // picking a tool = you want to see the page's drawings
  closeTextEditing();
  updateAllPageOverlayPointerEvents();
  renderMarkupToolbar();
}

function bindToolbar(toolbarEl, curPg) {
  const $ = id => toolbarEl.querySelector('#' + id);

  // Tools (click the active one again -> pan / scroll mode)
  TOOL_DEFS.forEach(t => {
    const btn = $(`mtool-${t.id}`);
    if (!btn) return;
    btn.onclick = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      activeTool = (activeTool === t.id) ? 'none' : t.id;
      if (activeTool === 'stamp' && ui.orient === 'v') flyKind = 'stamp'; else if (flyKind === 'stamp') closeFlyout();
      afterToolChange();
    };
  });
  const focusBtn = $('mtool-focus');
  if (focusBtn) focusBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleFocusBand(); renderMarkupToolbar(); };

  // Colours
  toolbarEl.querySelectorAll('.markup-swatch[data-color]').forEach(sw => {
    sw.onclick = () => setActiveColor(sw.dataset.color);
  });
  const customColorInput = $('mtool-custom-color');
  if (customColorInput) {
    const h = (e) => { if (e.target.value) setActiveColor(e.target.value); };
    customColorInput.oninput = h;
    customColorInput.onchange = h;
  }
  const cycle = $('mtool-cycle-color');
  if (cycle) cycle.onclick = () => {
    const i = COLOR_PALETTE.findIndex(c => c.toLowerCase() === activeColor.toLowerCase());
    setActiveColor(COLOR_PALETTE[(i + 1) % COLOR_PALETTE.length]);
  };
  const pop = $('mtool-colorpop');
  if (pop) pop.onclick = (e) => { e.stopPropagation(); flyKind === 'color' ? closeFlyout() : openFlyout('color'); };

  // Stamps
  toolbarEl.querySelectorAll('.mk-stamp-chip').forEach(ch => { ch.onclick = () => { activeStamp = ch.dataset.stamp; renderMarkupToolbar(); }; });

  // Pills
  const widthBtn = $('mtool-width-cycle');
  if (widthBtn) widthBtn.onclick = () => {
    activeStrokeWidth = activeStrokeWidth <= 2 ? 6 : activeStrokeWidth <= 6 ? 12 : 2;
    updateSelectedObjectStrokeWidth(activeStrokeWidth);
    updateAllPageOverlayPointerEvents();
    renderMarkupToolbar();
  };
  const fillBtn = $('mtool-fill-cycle');
  if (fillBtn) fillBtn.onclick = () => {
    activeFill = activeFill === 'none' ? 'rgba' : activeFill === 'rgba' ? 'solid' : 'none';
    updateSelectedObjectFill(getFillValue(activeColor, activeFill));
    updateAllPageOverlayPointerEvents();
    renderMarkupToolbar();
  };
  const stickyBtn = $('mtool-sticky');
  if (stickyBtn) stickyBtn.onclick = () => { textSticky = !textSticky; restyleActiveText(); renderMarkupToolbar(); };
  const fadeBtn = $('mtool-fade');
  if (fadeBtn) fadeBtn.onclick = () => { laserFadeMs = laserFadeMs === 2000 ? 4000 : laserFadeMs === 4000 ? 7000 : 2000; renderMarkupToolbar(); };
  const snapBtn = $('mtool-snap');
  if (snapBtn) snapBtn.onclick = () => { snapShapes = !snapShapes; window.toast(snapShapes ? 'Snap on: likhke ruko, shape seedha ho jayega' : 'Snap off'); renderMarkupToolbar(); };

  // Actions
  const undo = $('mtool-undo'); if (undo) undo.onclick = () => performUndo(curPg);
  const redo = $('mtool-redo'); if (redo) redo.onclick = () => performRedo(curPg);
  const clr = $('mtool-clear-page'); if (clr) clr.onclick = () => clearPageDrawings(curPg);
  const cls = $('mtool-close'); if (cls) cls.onclick = () => toggleMarkupToolbar();
  const eye = $('mtool-eye'); if (eye) eye.onclick = () => toggleInkHidden();

  // Layout controls
  const mode = $('mtool-mode');
  if (mode) mode.onclick = (e) => { e.preventDefault(); e.stopPropagation(); ui.mode = ui.mode === 'mini' ? 'full' : 'mini'; saveUi(); closeFlyout(); renderMarkupToolbar(); };
  const orient = $('mtool-orient');
  if (orient) orient.onclick = (e) => { e.preventDefault(); e.stopPropagation(); ui.orient = ui.orient === 'v' ? 'h' : 'v'; ui.x = ui.y = null; saveUi(); closeFlyout(); renderMarkupToolbar(); };
}

function setActiveColor(c) {
  activeColor = c;
  updateSelectedObjectColor(activeColor);
  updateAllPageOverlayPointerEvents();
  renderMarkupToolbar();
  if (flyKind === 'color') closeFlyout();
}

// Put the card where it was left, keep it on screen, and give vertical cards a sensible default edge.
function placeToolbar(el, fresh) {
  const apply = () => {
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    if (ui.x == null || ui.y == null) {
      if (ui.orient === 'v') {
        el.style.transform = 'none';
        el.style.left = Math.max(8, vw - w - 8) + 'px';
        el.style.top = Math.max(8, Math.min(vh - h - 8, 96)) + 'px';
      } else {
        el.style.left = '50%';
        el.style.top = '58px';
        el.style.transform = 'translateX(-50%)';
      }
    } else {
      el.style.transform = 'none';
      el.style.left = Math.max(8, Math.min(vw - w - 8, ui.x)) + 'px';
      el.style.top = Math.max(8, Math.min(vh - h - 8, ui.y)) + 'px';
    }
  };
  apply();
  if (fresh) requestAnimationFrame(apply);
}

function makeToolbarDraggable(toolbarEl) {
  const handle = toolbarEl.querySelector('.markup-drag-handle');
  if (!handle || handle.dataset.dragInit) return;
  handle.dataset.dragInit = 'true';

  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  const onPointerDown = (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;

    const rect = toolbarEl.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    toolbarEl.style.transform = 'none';
    toolbarEl.style.left = `${initialLeft}px`;
    toolbarEl.style.top = `${initialTop}px`;

    const onPointerMove = (ev) => {
      if (!isDragging) return;
      const moveX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const moveY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dx = moveX - startX;
      const dy = moveY - startY;
      if (ev.cancelable) ev.preventDefault();
      toolbarEl.style.left = `${Math.max(8, Math.min(window.innerWidth - toolbarEl.offsetWidth - 8, initialLeft + dx))}px`;
      toolbarEl.style.top = `${Math.max(8, Math.min(window.innerHeight - toolbarEl.offsetHeight - 8, initialTop + dy))}px`;
      positionFlyout();
    };

    const onPointerUp = () => {
      isDragging = false;
      ui.x = parseFloat(toolbarEl.style.left); ui.y = parseFloat(toolbarEl.style.top);
      saveUi();
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
    };

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
  };

  handle.onmousedown = onPointerDown;
  handle.ontouchstart = onPointerDown;
}

/* Side flyout (colours / stamps) used by the vertical card */
let flyKind = null;
function closeFlyout() {
  flyKind = null;
  const f = document.getElementById('mk-fly');
  if (f) f.remove();
}
function openFlyout(kind) {
  const tb = document.getElementById('markup-toolbar');
  if (!tb) return;
  flyKind = kind;
  let f = document.getElementById('mk-fly');
  if (!f) { f = document.createElement('div'); f.id = 'mk-fly'; (document.querySelector('.view') || document.body).appendChild(f); }
  f.innerHTML = kind === 'stamp'
    ? `<div class="mk-fly-title">Stamps</div><div class="mk-fly-grid mk-fly-stamps">${stampChipsHtml()}</div>`
    : `<div class="mk-fly-title">Colour</div><div class="mk-fly-grid mk-fly-colors">${swatchesHtml()}</div>`;
  f.querySelectorAll('.markup-swatch[data-color]').forEach(sw => { sw.onclick = () => setActiveColor(sw.dataset.color); });
  const ci = f.querySelector('#mtool-custom-color');
  if (ci) { const h = e => { if (e.target.value) setActiveColor(e.target.value); }; ci.oninput = h; ci.onchange = h; }
  f.querySelectorAll('.mk-stamp-chip').forEach(ch => { ch.onclick = () => { activeStamp = ch.dataset.stamp; f.querySelectorAll('.mk-stamp-chip').forEach(c => c.classList.toggle('active', c === ch)); }; });
  positionFlyout();
}
function positionFlyout() {
  const f = document.getElementById('mk-fly'), tb = document.getElementById('markup-toolbar');
  if (!f || !tb) return;
  const r = tb.getBoundingClientRect(), fw = f.offsetWidth, fh = f.offsetHeight;
  const left = (r.left + r.width / 2 > window.innerWidth / 2) ? r.left - fw - 8 : r.right + 8;
  f.style.left = Math.max(8, Math.min(window.innerWidth - fw - 8, left)) + 'px';
  f.style.top = Math.max(8, Math.min(window.innerHeight - fh - 8, r.top + 40)) + 'px';
}
document.addEventListener('pointerdown', (e) => {
  if (!flyKind) return;
  if (e.target.closest && (e.target.closest('#mk-fly') || e.target.closest('#markup-toolbar'))) return;
  if (flyKind === 'color') closeFlyout();
}, true);

/* Two fingers = scroll / zoom (the reader's own pinch handles zoom), one finger = draw.
   A stroke that turns into a two-finger gesture is thrown away instead of leaving a stray line. */
const touchIds = new Set();
let multiTouch = false, multiTouchUsed = false, panLast = null;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  touchIds.add(e.pointerId);
  if (touchIds.size >= 2) { multiTouch = true; multiTouchUsed = true; }
}, true);
const touchGone = (e) => {
  if (e.pointerType !== 'touch') return;
  touchIds.delete(e.pointerId);
  if (touchIds.size < 2) { multiTouch = false; panLast = null; }
  if (touchIds.size === 0) setTimeout(() => { multiTouchUsed = false; }, 60);
};
document.addEventListener('pointerup', touchGone, true);
document.addEventListener('pointercancel', touchGone, true);
document.addEventListener('touchmove', (e) => {
  if (!isMarkupActive || e.touches.length !== 2) return;
  if (!(e.target.closest && e.target.closest('.fabric-canvas-container'))) return;
  const sc = document.getElementById('reader-scroll'); if (!sc) return;
  const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  if (panLast) { sc.scrollLeft -= cx - panLast.x; sc.scrollTop -= cy - panLast.y; }
  panLast = { x: cx, y: cy };
}, { capture: true, passive: true });

/* Finger / pen on the page: fade the card out of the way until the stroke ends. */
const BUSY_TOOLS = ['pen', 'marker', 'glow', 'laser', 'rectangle', 'ellipse', 'arrow', 'line'];
document.addEventListener('pointerdown', (e) => {
  if (!isMarkupActive || !BUSY_TOOLS.includes(activeTool)) return;
  if (!(e.target.closest && e.target.closest('.fabric-canvas-container'))) return;
  drawingBusy = true;
  const tb = document.getElementById('markup-toolbar'); if (tb) tb.classList.add('md-busy');
  const fl = document.getElementById('mk-fly'); if (fl) fl.classList.add('md-busy');
}, { capture: true, passive: true });
function endBusy() {
  if (!drawingBusy) return;
  drawingBusy = false;
  const tb = document.getElementById('markup-toolbar'); if (tb) tb.classList.remove('md-busy');
  const fl = document.getElementById('mk-fly'); if (fl) fl.classList.remove('md-busy');
  scheduleDrawSync();
}
window.addEventListener('pointerup', endBusy, true);
window.addEventListener('pointercancel', endBusy, true);

/* ------------------------------------------------------------------ */
/*  Focus band: dims everything except a movable reading strip           */
/* ------------------------------------------------------------------ */
let focusBandEl = null;
const focusBand = { y: null, h: 130 };
function closeFocusBand() { if (focusBandEl) { focusBandEl.remove(); focusBandEl = null; } }
function layoutFocusBand() {
  if (!focusBandEl) return;
  const host = document.getElementById('reader-scroll');
  if (!host) { closeFocusBand(); return; }
  const r = host.getBoundingClientRect();
  focusBand.h = Math.max(60, Math.min(r.height - 40, focusBand.h));
  if (focusBand.y == null) focusBand.y = Math.round(r.height * 0.3);
  focusBand.y = Math.max(0, Math.min(r.height - focusBand.h, focusBand.y));
  Object.assign(focusBandEl.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  focusBandEl.querySelector('.fb-top').style.height = focusBand.y + 'px';
  const bot = focusBandEl.querySelector('.fb-bot');
  bot.style.top = (focusBand.y + focusBand.h) + 'px';
  bot.style.height = Math.max(0, r.height - focusBand.y - focusBand.h) + 'px';
  const edge = focusBandEl.querySelector('.fb-edge');
  edge.style.top = focusBand.y + 'px'; edge.style.height = focusBand.h + 'px';
}
function toggleFocusBand() {
  if (focusBandEl) { closeFocusBand(); return false; }
  if (!document.getElementById('reader-scroll')) return false;
  focusBandEl = document.createElement('div');
  focusBandEl.id = 'focus-band';
  focusBandEl.innerHTML = `<div class="fb-top"></div><div class="fb-bot"></div><div class="fb-edge"></div>
    <div class="fb-grip" title="Drag to move the band">⇅</div><div class="fb-size" title="Drag to resize">⤡</div>`;
  document.body.appendChild(focusBandEl);
  const drag = (el, onMove) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const y0 = e.clientY, by = focusBand.y, bh = focusBand.h;
      const mv = (ev) => { onMove(ev.clientY - y0, by, bh); layoutFocusBand(); positionGrips(); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  };
  const grip = focusBandEl.querySelector('.fb-grip'), size = focusBandEl.querySelector('.fb-size');
  const positionGrips = () => {
    grip.style.top = (focusBand.y + focusBand.h / 2 - 20) + 'px';
    size.style.top = (focusBand.y + focusBand.h - 18) + 'px';
  };
  drag(grip, (dy, by) => { focusBand.y = by + dy; });
  drag(size, (dy, by, bh) => { focusBand.h = bh + dy; });
  layoutFocusBand(); positionGrips();
  focusBandEl._relayout = () => { layoutFocusBand(); positionGrips(); };
  return true;
}
window.addEventListener('resize', () => { if (focusBandEl && focusBandEl._relayout) focusBandEl._relayout(); });

function getFillValue(color, fillType) {
  if (fillType === 'none') return 'transparent';
  if (fillType === 'solid') return color;
  // rgba semi transparent
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16) || 0;
    const g = parseInt(color.slice(3, 5), 16) || 0;
    const b = parseInt(color.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, 0.28)`;
  }
  return 'rgba(239, 68, 68, 0.28)';
}

function getCanvasElement(fCanvas) {
  if (!fCanvas) return null;
  if (typeof fCanvas.getElement === 'function') {
    return fCanvas.getElement();
  }
  return fCanvas.lowerCanvasEl || fCanvas.upperCanvasEl || (fCanvas.elements && fCanvas.elements.container);
}

function getFabricPointer(fCanvas, options) {
  if (options) {
    if (options.scenePoint) return options.scenePoint;
    if (options.pointer) return options.pointer;
    if (options.absolutePointer) return options.absolutePointer;
  }
  if (typeof fCanvas.getScenePoint === 'function' && options && options.e) {
    return fCanvas.getScenePoint(options.e);
  }
  if (typeof fCanvas.getPointer === 'function' && options && options.e) {
    return fCanvas.getPointer(options.e);
  }
  const e = options ? options.e : null;
  const canvasEl = getCanvasElement(fCanvas);
  if (canvasEl && e) {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX !== undefined ? e.clientX : 0);
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : (e.clientY !== undefined ? e.clientY : 0);
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }
  return { x: 0, y: 0 };
}

async function safeLoadFromJSON(fCanvas, json, callback) {
  if (!fCanvas || !json) {
    if (callback) callback();
    return;
  }
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed && typeof parsed === 'object') {
      delete parsed.viewportTransform;
    }

    // Verify contextContainer exists to prevent clearRect crash on unattached canvas
    if (!fCanvas.contextContainer && !fCanvas.getContext) {
      if (callback) callback();
      return;
    }

    let called = false;
    const done = () => {
      if (called) return;
      called = true;
      if (callback) callback();
    };

    const res = fCanvas.loadFromJSON(parsed, done);
    if (res && typeof res.then === 'function') {
      await res;
      done();
    }
  } catch (err) {
    console.warn('Error loading JSON in Fabric:', err);
    if (callback) callback();
  }
}

export function updateAllPageOverlayPointerEvents() {
  fabricCanvases.forEach((fCanvas, pNum) => {
    applyToolToFabricCanvas(fCanvas, pNum);
  });
}

const DRAW_TOOLS = ['pen', 'marker', 'glow'];
const kindOf = (o) => String((o && o.type) || '').replace('-', '').toLowerCase();
const isTextObj = (o) => kindOf(o) === 'itext';

function configureBrush(fCanvas) {
  const PencilBrushClass = fabric.PencilBrush || fabricModule.PencilBrush;
  const brush = PencilBrushClass ? new PencilBrushClass(fCanvas) : fCanvas.freeDrawingBrush;
  if (!brush) return;
  brush.shadow = null;
  brush.strokeLineCap = 'round';
  const z = pageZoomOf(fCanvas);   // widths are chosen in screen px, so a stroke looks the same at any zoom
  if (activeTool === 'marker') {
    brush.color = withAlpha(activeColor, 0.42);
    brush.width = (MARKER_WIDTH[activeStrokeWidth] || 15) / z;
    brush.strokeLineCap = 'square';
  } else if (activeTool === 'glow') {
    // bright core + coloured halo = neon tube
    brush.color = mixWithWhite(activeColor, 0.55);
    brush.width = Math.max(3, activeStrokeWidth * 1.4) / z;
    const ShadowClass = fabric.Shadow || fabricModule.Shadow;
    if (ShadowClass) brush.shadow = new ShadowClass({ color: activeColor, blur: 16 / z, offsetX: 0, offsetY: 0, affectStroke: true });
  } else {
    brush.color = activeColor;
    brush.width = Math.max(1, activeStrokeWidth * 0.9) / z;
  }
  fCanvas.freeDrawingBrush = brush;
}

function applyToolToFabricCanvas(fCanvas, pNum) {
  const canvasEl = getCanvasElement(fCanvas);
  const fabricWrapper = canvasEl?.parentElement;
  const outerContainer = canvasEl?.closest('.fabric-canvas-container');

  const enablePointer = (isMarkupActive && activeTool !== 'none');

  if (outerContainer) {
    outerContainer.setAttribute('data-tool', activeTool);
    outerContainer.style.pointerEvents = enablePointer ? 'auto' : 'none';
  }
  if (fabricWrapper) {
    fabricWrapper.style.pointerEvents = enablePointer ? 'auto' : 'none';
  }
  if (canvasEl) {
    canvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
  }
  if (fCanvas) {
    if (fCanvas.upperCanvasEl) fCanvas.upperCanvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
    if (fCanvas.lowerCanvasEl) fCanvas.lowerCanvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
  }

  // The laser only lives while its tool is active.
  if (outerContainer && outerContainer._laser && activeTool !== 'laser') disposeLaser(outerContainer._laser);

  if (!isMarkupActive || activeTool === 'none') {
    fCanvas.isDrawingMode = false;
    fCanvas.selection = false;
    fCanvas.discardActiveObject();
    fCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
    fCanvas.requestRenderAll();
    return;
  }

  fCanvas.isDrawingMode = DRAW_TOOLS.includes(activeTool);
  fCanvas.selection = (activeTool === 'select');
  if (fCanvas.isDrawingMode) configureBrush(fCanvas);

  fCanvas.forEachObject(obj => {
    if (activeTool === 'select') {
      obj.selectable = true;
      obj.evented = true;
      obj.hasControls = true;
      obj.hasBorders = true;
      obj.cornerColor = '#ff6a2b';
      obj.cornerStrokeColor = '#ffffff';
      obj.cornerSize = 10;
      obj.transparentCorners = false;
    } else if (activeTool === 'eraser') {
      obj.selectable = false;
      obj.evented = true;
    } else if (activeTool === 'text') {
      const t = isTextObj(obj);   // existing text stays tappable so it can be edited again
      obj.selectable = t;
      obj.evented = t;
    } else {
      obj.selectable = false;
      obj.evented = false;
    }
  });

  fCanvas.requestRenderAll();
}

function closeTextEditing() {
  fabricCanvases.forEach(fc => {
    try { const ao = fc.getActiveObject(); if (ao && ao.isEditing) ao.exitEditing(); } catch (e) {}
  });
}
function restyleActiveText() {
  fabricCanvases.forEach((fc, n) => {
    const ao = fc.getActiveObject();
    if (ao && isTextObj(ao)) {
      ao.set({ backgroundColor: textSticky ? '#fff3a3' : '', padding: textSticky ? 6 : 2 });
      fc.requestRenderAll(); savePageCanvasState(n);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Draw region: the Fabric canvas only covers what is on screen        */
/* ------------------------------------------------------------------ */
// A full-page canvas at 600% zoom is tens of millions of pixels and every stroke redraws all of them.
// So each page's canvas is just the visible part (plus a margin), moved with the scroll; the scene
// (the objects, in PDF units) is untouched, only the viewport transform shifts.
const MAX_DRAW_PX = 6e6;
let drawSyncTimer = null;
export function scheduleDrawSync() {
  clearTimeout(drawSyncTimer);
  drawSyncTimer = setTimeout(() => {
    if (window.zoomGestureActive || drawingBusy) { scheduleDrawSync(); return; }
    fabricCanvases.forEach((_, n) => syncDrawRegion(n));
  }, 90);
}
export function syncDrawRegion(pageNum, force) {
  const fCanvas = fabricCanvases.get(pageNum);
  const pe = window.pageEls ? window.pageEls[pageNum] : null;
  if (!fCanvas || !pe || !pe.wrap) return;
  const container = pe.wrap.querySelector('.fabric-canvas-container');
  if (!container) return;
  if (drawingBusy && !force) return;
  const scroller = document.getElementById('reader-scroll');
  const z = pe.scale || 1;
  const baseW = pe.nativeVp?.width || Math.round((pe.wrap.clientWidth || 600) / z);
  const baseH = pe.nativeVp?.height || Math.round((pe.wrap.clientHeight || 800) / z);
  const cssW = baseW * z, cssH = baseH * z;
  const wr = pe.wrap.getBoundingClientRect();
  const sr = scroller ? scroller.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const k = wr.width / cssW || 1;
  const vis = {
    x0: Math.max(0, (sr.left - wr.left) / k), y0: Math.max(0, (sr.top - wr.top) / k),
    x1: Math.min(cssW, (sr.right - wr.left) / k), y1: Math.min(cssH, (sr.bottom - wr.top) / k)
  };
  if (vis.x1 - vis.x0 < 4 || vis.y1 - vis.y0 < 4) {
    // Off screen: give the bitmap back, keep the objects.
    if (container._region) {
      container._region = null;
      fCanvas.setDimensions({ width: 1, height: 1 });
      container.style.width = '1px'; container.style.height = '1px';
    }
    return;
  }
  const cur = container._region;
  if (!force && cur && cur.z === z && cur.x0 <= vis.x0 + 1 && cur.y0 <= vis.y0 + 1 && cur.x1 >= vis.x1 - 1 && cur.y1 >= vis.y1 - 1) return;

  const dpr = Math.min(window.devicePixelRatio || 2, 3);
  let r = vis;
  for (const pad of [0.4, 0.25, 0.1, 0]) {
    const px = (vis.x1 - vis.x0) * pad, py = (vis.y1 - vis.y0) * pad;
    r = { x0: Math.max(0, vis.x0 - px), y0: Math.max(0, vis.y0 - py), x1: Math.min(cssW, vis.x1 + px), y1: Math.min(cssH, vis.y1 + py) };
    if ((r.x1 - r.x0) * (r.y1 - r.y0) * dpr * dpr <= MAX_DRAW_PX) break;
  }
  const rw = Math.max(1, Math.ceil(r.x1 - r.x0)), rh = Math.max(1, Math.ceil(r.y1 - r.y0));
  container.style.left = r.x0 + 'px'; container.style.top = r.y0 + 'px';
  container.style.width = rw + 'px'; container.style.height = rh + 'px';
  fCanvas.setDimensions({ width: rw, height: rh });
  fCanvas.setViewportTransform([z, 0, 0, z, -r.x0, -r.y0]);
  if (typeof fCanvas.calcOffset === 'function') fCanvas.calcOffset();
  container._region = { z, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  if (fCanvas.isDrawingMode && DRAW_TOOLS.includes(activeTool)) configureBrush(fCanvas);
  fCanvas.requestRenderAll();
}
document.addEventListener('scroll', (e) => {
  if (e.target && e.target.id === 'reader-scroll' && fabricCanvases.size) scheduleDrawSync();
}, { capture: true, passive: true });
window.addEventListener('resize', () => { if (fabricCanvases.size) scheduleDrawSync(); });

/* ------------------------------------------------------------------ */
/*  Laser pointer: a glowing trail that fades by itself (never saved)   */
/* ------------------------------------------------------------------ */
function disposeLaser(L) {
  if (!L) return;
  L.pts = []; L.down = false;
  if (L.raf) { cancelAnimationFrame(L.raf); L.raf = 0; }
  if (L.cv) { L.cv.width = 0; L.cv.height = 0; L.cv.remove(); L.cv = null; }
}
function bindLaser(container) {
  const L = { pts: [], down: false, raf: 0, cv: null, dpr: 1 };
  container._laser = L;
  const rect = () => container.getBoundingClientRect();
  const add = (e) => { const r = rect(); L.pts.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }); };
  const ctx2d = () => {
    const r = rect(); const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (!L.cv) {
      L.cv = document.createElement('canvas');
      L.cv.className = 'laser-cv';
      L.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3';
      container.appendChild(L.cv);
    }
    if (L.cv.width !== w || L.cv.height !== h) { L.cv.width = w; L.cv.height = h; }
    L.dpr = dpr;
    return L.cv.getContext('2d');
  };
  const frame = () => {
    L.raf = 0;
    const ctx = ctx2d(); const dpr = L.dpr;
    const now = performance.now(), fade = laserFadeMs;
    L.pts = L.pts.filter(p => now - p.t < fade);
    ctx.clearRect(0, 0, L.cv.width, L.cv.height);
    const n = L.pts.length;
    const col = activeColor;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < n; i++) {
      const a = 1 - (now - L.pts[i].t) / fade;
      const A = Math.max(0, Math.pow(a, 1.15));
      ctx.beginPath(); ctx.moveTo(L.pts[i - 1].x * dpr, L.pts[i - 1].y * dpr); ctx.lineTo(L.pts[i].x * dpr, L.pts[i].y * dpr);
      ctx.shadowColor = col; ctx.shadowBlur = 16 * dpr * A;
      ctx.strokeStyle = withAlpha(col, A); ctx.lineWidth = (2 + 6 * A) * dpr; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,255,255,${(A * 0.9).toFixed(3)})`; ctx.lineWidth = (0.8 + 1.6 * A) * dpr; ctx.stroke();
    }
    if (n) {
      const p = L.pts[n - 1];
      const ha = L.down ? 1 : Math.max(0, 1 - (now - p.t) / fade);
      const pulse = 0.85 + 0.15 * Math.sin(now / 90);
      ctx.shadowColor = col; ctx.shadowBlur = 22 * dpr * ha;
      ctx.fillStyle = withAlpha(col, ha); ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, 7 * pulse * dpr, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255,255,255,${ha.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, 2.8 * dpr, 0, 6.283); ctx.fill();
    }
    if (n || L.down) L.raf = requestAnimationFrame(frame);
    else if (L.cv) { L.cv.remove(); L.cv.width = 0; L.cv = null; }
  };
  const kick = () => { if (!L.raf) L.raf = requestAnimationFrame(frame); };
  container.addEventListener('pointerdown', (e) => {
    if (!isMarkupActive || activeTool !== 'laser') return;
    L.down = true; add(e);
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    kick();
  });
  container.addEventListener('pointermove', (e) => {
    if (!L.down || activeTool !== 'laser') return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(add);
    kick();
  });
  const up = () => { L.down = false; };
  container.addEventListener('pointerup', up);
  container.addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------------ */
/*  Stamps, text and "hold to snap" shapes                              */
/* ------------------------------------------------------------------ */
function makeStamp(key, x, y, z) {
  const S = STAMPS[key] || STAMPS.imp;
  const sc = (activeStrokeWidth <= 2 ? 1.0 : activeStrokeWidth <= 6 ? 1.4 : 2.0) / (z || 1);   // same on-screen size at any zoom
  const TextC = fabric.FabricText || fabric.Text || fabricModule.FabricText || fabricModule.Text;
  const RectC = fabric.Rect || fabricModule.Rect;
  const GroupC = fabric.Group || fabricModule.Group;
  const txt = new TextC(S.label, { fontSize: 16, fontWeight: '800', fontFamily: 'Inter, system-ui, sans-serif', fill: S.color, originX: 'center', originY: 'center' });
  const box = new RectC({ width: txt.width + 20, height: txt.height + 10, rx: 6, ry: 6, fill: 'rgba(255,255,255,0.001)', stroke: S.color, strokeWidth: 2.4, originX: 'center', originY: 'center' });
  return new GroupC([box, txt], { left: x, top: y, originX: 'center', originY: 'center', angle: -6 + Math.random() * 12, scaleX: sc, scaleY: sc, selectable: false, evented: false, _k: 'stamp' });
}
// Own little text box (works with every phone keyboard; the card stays on top so the keyboard never hides it)
function openTextDialog(initial, onDone) {
  const old = document.getElementById('mk-textdlg'); if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'mk-textdlg';
  box.innerHTML = `<textarea rows="2" placeholder="Yahan likho..." maxlength="400"></textarea>
    <div class="mk-td-row"><button class="mk-td-x" type="button">✕</button><button class="mk-td-ok" type="button">Lagao ✓</button></div>`;
  document.body.appendChild(box);
  const ta = box.querySelector('textarea');
  ta.value = initial || '';
  const born = performance.now();
  const close = () => { box.remove(); };
  const ok = () => { if (performance.now() - born < 350) return; const v = ta.value.trim(); close(); if (v) onDone(v); };
  box.querySelector('.mk-td-ok').onclick = ok;
  box.querySelector('.mk-td-x').onclick = () => { if (performance.now() - born < 350) return; close(); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok(); if (e.key === 'Escape') close(); });
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 160);
}
function makeText(x, y, z, str) {
  const IT = fabric.IText || fabricModule.IText;
  const dark = textSticky && (activeColor.toLowerCase() === '#ffffff');
  return new IT(str || 'Text', {
    left: x, top: y, fontSize: (TEXT_SIZE[activeStrokeWidth] || 20) / (z || 1),
    fill: dark ? '#18181b' : activeColor,
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif', fontWeight: '600',
    backgroundColor: textSticky ? '#fff3a3' : '', padding: textSticky ? 6 : 2, editable: false, _k: 'text'
  });
}
// Straight line / ellipse / rectangle if the drawn stroke is close enough to one. Else null (keep the freehand).
function snapStrokeToShape(pts, path) {
  const n = pts.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
  }
  const w = x1 - x0, h = y1 - y0;
  if (Math.max(w, h) < 10 || len < 16) return null;
  const a = pts[0], b = pts[n - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const LineC = fabric.Line || fabricModule.Line, EllC = fabric.Ellipse || fabricModule.Ellipse, RectC = fabric.Rect || fabricModule.Rect;
  const base = { stroke: path.stroke, strokeWidth: path.strokeWidth, strokeUniform: true, strokeLineCap: 'round', shadow: path.shadow || null, selectable: false, evented: false };
  // straight?
  const dx = b.x - a.x, dy = b.y - a.y;
  let dev = 0;
  for (const p of pts) dev = Math.max(dev, Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / (chord || 1));
  if (chord / len > 0.88 && dev / (chord || 1) < 0.07) return new LineC([a.x, a.y, b.x, b.y], base);
  // closed loop: ellipse or box?
  if (chord > 0.25 * len || w < 8 || h < 8) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2, half = Math.min(w, h) / 2;
  let eE = 0, eR = 0;
  for (const p of pts) {
    eE += Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1);
    eR += Math.min(Math.abs(p.x - x0), Math.abs(p.x - x1), Math.abs(p.y - y0), Math.abs(p.y - y1)) / half;
  }
  eE /= n; eR /= n;
  if (eE < 0.16 && eE <= eR) return new EllC({ left: x0, top: y0, rx, ry, originX: 'left', originY: 'top', fill: 'transparent', ...base });
  if (eR < 0.10) return new RectC({ left: x0, top: y0, width: w, height: h, rx: 4, ry: 4, originX: 'left', originY: 'top', fill: 'transparent', ...base });
  return null;
}

export function destroyPageDrawLayer(pageNum) {
  const fCanvas = fabricCanvases.get(pageNum);
  if (fCanvas) {
    try {
      fCanvas.dispose();
    } catch (e) {
      console.warn('Error disposing fabric canvas:', e);
    }
    fabricCanvases.delete(pageNum);
  }
}

export function ensurePageDrawLayer(pageNum) {
  const pe = window.pageEls ? window.pageEls[pageNum] : null;
  if (!pe || !pe.wrap) return null;

  let container = pe.wrap.querySelector('.fabric-canvas-container');
  let fCanvas = fabricCanvases.get(pageNum);
  let created = false;

  if (!container || !fCanvas) {
    if (fCanvas) {
      try { fCanvas.dispose(); } catch (e) {}
      fabricCanvases.delete(pageNum);
    }
    if (container) {
      container.remove();
    }

    container = document.createElement('div');
    container.className = 'fabric-canvas-container';
    container.setAttribute('data-page-num', pageNum.toString());
    container.setAttribute('data-tool', activeTool);
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '1px';   // set by syncDrawRegion: only the visible part of the page gets a bitmap
    container.style.height = '1px';
    container.style.zIndex = '18';
    container.style.pointerEvents = (isMarkupActive && activeTool !== 'none') ? 'auto' : 'none';
    pe.wrap.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.id = `fabric-canvas-p${pageNum}`;
    container.appendChild(canvasEl);

    const CanvasClass = fabric.Canvas || fabricModule.Canvas;
    fCanvas = new CanvasClass(canvasEl, {
      width: 1,
      height: 1,
      isDrawingMode: false,
      selection: true,
      enablePointerEvents: true
    });

    // Ensure baseline undo stack has initial empty state
    let stack = undoStacks.get(pageNum) || [];
    if (stack.length === 0) {
      const emptyObj = { version: '5.3.0', objects: [] };
      stack.push(JSON.stringify(emptyObj));
      undoStacks.set(pageNum, stack);
    }

    // Handle 2-finger multi-touch for zoom & pan passthrough
    container.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length >= 2) {
        container.style.pointerEvents = 'none';
        setTimeout(() => {
          if (container && isMarkupActive && activeTool !== 'none') {
            container.style.pointerEvents = 'auto';
          }
        }, 400);
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!e.touches || e.touches.length < 2) {
        if (container && isMarkupActive && activeTool !== 'none') {
          container.style.pointerEvents = 'auto';
        }
      }
    });

    // Forward trackpad / mouse wheel scrolling
    container.addEventListener('wheel', (e) => {
      const scrollEl = document.getElementById('reader-scroll');
      if (scrollEl) {
        scrollEl.scrollTop += e.deltaY;
        scrollEl.scrollLeft += e.deltaX;
      }
    }, { passive: true });

    fabricCanvases.set(pageNum, fCanvas);
    bindFabricCanvasEvents(fCanvas, pageNum);
    bindLaser(container);
    created = true;
  } else {
    container.setAttribute('data-tool', activeTool);
  }

  syncDrawRegion(pageNum, created || undefined);
  applyToolToFabricCanvas(fCanvas, pageNum);
  return fCanvas;
}

function bindFabricCanvasEvents(fCanvas, pageNum) {
  let isDrawingShape = false;
  let activeShapeObj = null;
  let startX = 0, startY = 0;

  // Hold-to-snap bookkeeping: where the stroke went and when it last really moved
  let strokePts = [], lastMoveT = 0, lastPt = null;

  // Path Created (Freehand Pen / Marker / Glow)
  fCanvas.on('path:created', (e) => {
    let path = e.path;
    if (!path) return;
    if (multiTouchUsed) { fCanvas.remove(path); fCanvas.requestRenderAll(); return; }
    const kind = activeTool;
    if (snapShapes && (kind === 'pen' || kind === 'glow') && strokePts.length >= 8 && (performance.now() - lastMoveT) >= 420) {
      const snapped = snapStrokeToShape(strokePts, path);
      if (snapped) {
        fCanvas.remove(path);
        fCanvas.add(snapped);
        path = snapped;
        try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      }
    }
    path.set({
      id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      pageNum,
      _k: kind
    });
    path.selectable = false; path.evented = false;
    savePageCanvasState(pageNum);
  });

  // Empty text boxes disappear; real ones are saved
  fCanvas.on('text:editing:exited', (e) => {
    const t = e && e.target;
    if (t && !(t.text || '').trim()) { fCanvas.remove(t); fCanvas.discardActiveObject(); fCanvas.requestRenderAll(); }
    savePageCanvasState(pageNum);
  });

  // Object modified (Move, Resize, Rotate)
  fCanvas.on('object:modified', () => {
    savePageCanvasState(pageNum);
  });

  // Interactive Shape Creation via Mouse / Touch Dragging
  fCanvas.on('mouse:dblclick', (options) => {
    const t = (options && options.target) || fCanvas.getActiveObject();
    if (!isMarkupActive || !t || !isTextObj(t) || !['text', 'select'].includes(activeTool)) return;
    openTextDialog(t.text, (str) => { t.set({ text: str }); t.setCoords(); fCanvas.requestRenderAll(); savePageCanvasState(pageNum); });
  });
  fCanvas.on('mouse:down', (options) => {
    if (!isMarkupActive || multiTouch) return;

    const pointer = getFabricPointer(fCanvas, options);
    startX = pointer.x;
    startY = pointer.y;
    strokePts = [pointer]; lastPt = pointer; lastMoveT = performance.now();

    // Stamp: one tap places it
    if (activeTool === 'stamp') {
      const g = makeStamp(activeStamp, pointer.x, pointer.y, pageZoomOf(fCanvas));
      g.set({ id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), pageNum });
      fCanvas.add(g);
      fCanvas.requestRenderAll();
      savePageCanvasState(pageNum);
      return;
    }

    // Text: tap an empty spot to start a new text box (tapping an existing one edits it)
    if (activeTool === 'text') {
      if (options.target && isTextObj(options.target)) return;   // tap on existing text: select / drag it; double tap edits
      const px = pointer.x, py = pointer.y, zz = pageZoomOf(fCanvas);
      openTextDialog('', (str) => {
        const t = makeText(px, py, zz, str);
        t.set({ id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), pageNum });
        fCanvas.add(t);
        fCanvas.requestRenderAll();
        savePageCanvasState(pageNum);
      });
      return;
    }

    // Eraser Tool action
    if (activeTool === 'eraser') {
      const target = options.target;
      if (target) {
        fCanvas.remove(target);
        fCanvas.discardActiveObject();
        savePageCanvasState(pageNum);
        fCanvas.requestRenderAll();
        window.toast('Object erased');
      }
      return;
    }

    // Shape creation
    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      isDrawingShape = true;
      const fill = getFillValue(activeColor, activeFill);

      const RectClass = fabric.Rect || fabricModule.Rect;
      const EllipseClass = fabric.Ellipse || fabricModule.Ellipse;
      const LineClass = fabric.Line || fabricModule.Line;

      if (activeTool === 'rectangle' && RectClass) {
        activeShapeObj = new RectClass({
          left: startX,
          top: startY,
          width: 1,
          height: 1,
          fill: fill,
          stroke: activeColor,
          strokeWidth: activeStrokeWidth,
          strokeUniform: true,
          originX: 'left',
          originY: 'top',
          rx: 4,
          ry: 4,
          selectable: false,
          evented: false
        });
      } else if (activeTool === 'ellipse' && EllipseClass) {
        activeShapeObj = new EllipseClass({
          left: startX,
          top: startY,
          rx: 0.5,
          ry: 0.5,
          fill: fill,
          stroke: activeColor,
          strokeWidth: activeStrokeWidth,
          strokeUniform: true,
          originX: 'left',
          originY: 'top',
          selectable: false,
          evented: false
        });
      } else if (activeTool === 'line' && LineClass) {
        activeShapeObj = new LineClass([startX, startY, startX, startY], {
          stroke: activeColor,
          strokeWidth: activeStrokeWidth,
          strokeUniform: true,
          strokeLineCap: 'round',
          selectable: false,
          evented: false
        });
      } else if (activeTool === 'arrow') {
        activeShapeObj = createFabricArrow(startX, startY, startX, startY, activeColor, activeStrokeWidth);
      }

      if (activeShapeObj) {
        fCanvas.add(activeShapeObj);
      }
    }
  });

  fCanvas.on('mouse:move', (options) => {
    if (fCanvas.isDrawingMode && drawingBusy) {
      const pt = getFabricPointer(fCanvas, options);
      strokePts.push(pt);
      const z = (window.pageEls && window.pageEls[pageNum] && window.pageEls[pageNum].scale) || 1;
      if (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) * z > 3) { lastMoveT = performance.now(); lastPt = pt; }
    }
    if (!isDrawingShape || !activeShapeObj) return;

    const pointer = getFabricPointer(fCanvas, options);
    const minX = Math.min(startX, pointer.x);
    const minY = Math.min(startY, pointer.y);
    const w = Math.max(1, Math.abs(pointer.x - startX));
    const h = Math.max(1, Math.abs(pointer.y - startY));

    if (activeTool === 'rectangle') {
      activeShapeObj.set({
        left: minX,
        top: minY,
        width: w,
        height: h
      });
    } else if (activeTool === 'ellipse') {
      activeShapeObj.set({
        left: minX,
        top: minY,
        rx: w / 2,
        ry: h / 2
      });
    } else if (activeTool === 'line') {
      activeShapeObj.set({
        x2: pointer.x,
        y2: pointer.y
      });
    } else if (activeTool === 'arrow') {
      fCanvas.remove(activeShapeObj);
      activeShapeObj = createFabricArrow(startX, startY, pointer.x, pointer.y, activeColor, activeStrokeWidth);
      fCanvas.add(activeShapeObj);
    }

    fCanvas.requestRenderAll();
  });

  fCanvas.on('mouse:up', () => {
    if (multiTouchUsed && isDrawingShape && activeShapeObj) { fCanvas.remove(activeShapeObj); isDrawingShape = false; activeShapeObj = null; fCanvas.requestRenderAll(); return; }
    if (isDrawingShape && activeShapeObj) {
      isDrawingShape = false;
      activeShapeObj.set({
        id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        pageNum
      });

      // Switch automatically to select tool so user can adjust/move/resize immediately
      activeTool = 'select';
      renderMarkupToolbar();
      updateAllPageOverlayPointerEvents();

      fCanvas.setActiveObject(activeShapeObj);
      savePageCanvasState(pageNum);
      activeShapeObj = null;
    }
  });
}

function createFabricArrow(x1, y1, x2, y2, color, strokeWidth) {
  const LineClass = fabric.Line || fabricModule.Line;
  const TriangleClass = fabric.Triangle || fabricModule.Triangle;
  const GroupClass = fabric.Group || fabricModule.Group;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const headLength = Math.max(12, strokeWidth * 3.5);

  const line = new LineClass([x1, y1, x2, y2], {
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLineCap: 'round'
  });

  const triangle = new TriangleClass({
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    width: headLength,
    height: headLength,
    fill: color,
    angle: angle + 90
  });

  if (GroupClass) {
    return new GroupClass([line, triangle], {
      selectable: false,
      evented: false
    });
  }

  return line;
}

function updateSelectedObjectColor(color) {
  fabricCanvases.forEach((fCanvas, pNum) => {
    if (fCanvas.isDrawingMode) configureBrush(fCanvas);

    const activeObj = fCanvas.getActiveObject();
    if (activeObj) {
      applyColorToFabricObject(activeObj, color);
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyColorToFabricObject(obj, color) {
  if (!obj) return;
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyColorToFabricObject(child, color));
  } else {
    if (obj.stroke) obj.set('stroke', color);
    if (obj.fill && obj.fill !== 'transparent' && obj.fill !== 'none') {
      obj.set('fill', getFillValue(color, activeFill));
    }
  }
}

function updateSelectedObjectStrokeWidth(width) {
  fabricCanvases.forEach((fCanvas, pNum) => {
    if (fCanvas.isDrawingMode) configureBrush(fCanvas);

    const activeObj = fCanvas.getActiveObject();
    if (activeObj) {
      applyStrokeWidthToFabricObject(activeObj, width);
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyStrokeWidthToFabricObject(obj, width) {
  if (!obj) return;
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyStrokeWidthToFabricObject(child, width));
  } else {
    if ('strokeWidth' in obj) obj.set('strokeWidth', width);
  }
}

function updateSelectedObjectFill(fill) {
  fabricCanvases.forEach((fCanvas, pNum) => {
    const activeObj = fCanvas.getActiveObject();
    if (activeObj) {
      applyFillToFabricObject(activeObj, fill);
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyFillToFabricObject(obj, fill) {
  if (!obj) return;
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyFillToFabricObject(child, fill));
  } else if (obj.type !== 'path') {
    obj.set('fill', fill);
  }
}

function deselectAllCanvases() {
  fabricCanvases.forEach(fCanvas => {
    fCanvas.discardActiveObject();
    fCanvas.requestRenderAll();
  });
}

// IndexedDB Persistence & Undo/Redo Engine
async function savePageCanvasState(pageNum) {
  const fCanvas = fabricCanvases.get(pageNum);
  if (!fCanvas || !window.State || !window.State.currentFile) return;

  const KEEP = ['id', 'pageNum', '_k'];   // fabric v6+: extra props go through toObject(), not toJSON()
  const jsonObj = typeof fCanvas.toObject === 'function' ? fCanvas.toObject(KEEP) : fCanvas.toJSON(KEEP);
  if (jsonObj && typeof jsonObj === 'object') {
    delete jsonObj.viewportTransform;
  }
  const jsonStr = JSON.stringify(jsonObj);

  // Undo stack management: ensure base state exists if stack is empty
  let stack = undoStacks.get(pageNum) || [];
  if (stack.length === 0) {
    const emptyObj = { version: jsonObj.version || '5.3.0', objects: [] };
    stack.push(JSON.stringify(emptyObj));
  }

  if (stack[stack.length - 1] !== jsonStr) {
    stack.push(jsonStr);
    if (stack.length > 30) stack.shift(); // Limit to 30 steps
    undoStacks.set(pageNum, stack);
    redoStacks.set(pageNum, []); // Clear redo on new action
  }

  // Save to IndexedDB
  const record = {
    id: `fabric_draw_f${window.State.currentFile.id}_p${pageNum}`,
    fileId: window.State.currentFile.id,
    page: pageNum,
    kind: 'drawing',
    json: jsonStr,
    updatedAt: Date.now()
  };

  try {
    await window.DB.put('annotations', record);
  } catch (err) {
    console.error('Error saving fabric state to DB:', err);
  }

  renderMarkupToolbar();
}

export async function paintDrawingsForPage(pageNum, preloadedAnnots) {
  try {
    if (!window.State || !window.State.currentFile) return;

    // While markup mode is open (or a layer already exists) the layer is needed straight away.
    let fCanvas = (isMarkupActive || fabricCanvases.has(pageNum)) ? ensurePageDrawLayer(pageNum) : null;

    const pe = window.pageEls ? window.pageEls[pageNum] : null;
    const currentScale = pe?.scale || 1.0;

    let annots = preloadedAnnots;
    if (!annots) {
      try {
        annots = await window.DB.byIndex('annotations', 'fileId', window.State.currentFile.id);
      } catch (err) {
        console.warn('Error fetching annotations:', err);
        return;
      }
    }

    const drawingRecord = annots.find(a => a.page === pageNum && a.kind === 'drawing' && a.json);

    // Nothing drawn on this page and no reason to draw: skip creating the Fabric canvases.
    if (!fCanvas) {
      if (!drawingRecord || !drawingHasObjects(drawingRecord.json)) return;
      if (!window.pageEls || window.pageEls[pageNum] !== pe || !pe || !pe.rendered) return;
      fCanvas = ensurePageDrawLayer(pageNum);
      if (!fCanvas) return;
    }

    if (drawingRecord && drawingRecord.json) {
      await safeLoadFromJSON(fCanvas, drawingRecord.json, () => {
        try {
          syncDrawRegion(pageNum, true);
          applyToolToFabricCanvas(fCanvas, pageNum);
          if (fCanvas && typeof fCanvas.requestRenderAll === 'function') fCanvas.requestRenderAll();

          let stack = undoStacks.get(pageNum) || [];
          if (stack.length === 0) {
            stack.push(drawingRecord.json);
            undoStacks.set(pageNum, stack);
          }
        } catch (applyErr) {
          console.warn('Drawing apply notice:', applyErr);
        }
      });
    } else {
      try {
        if (fCanvas && typeof fCanvas.clear === 'function' && (fCanvas.contextContainer || fCanvas.getContext)) {
          fCanvas.clear();
        }
        syncDrawRegion(pageNum, true);
        applyToolToFabricCanvas(fCanvas, pageNum);
      } catch (clearErr) {
        console.warn('Notice clearing fabric canvas on page', pageNum, clearErr);
      }
    }
  } catch (err) {
    console.warn('Notice in paintDrawingsForPage on page', pageNum, err);
  }
}

export async function performUndo(pageNum) {
  const stack = undoStacks.get(pageNum) || [];
  if (stack.length <= 1) return;

  const current = stack.pop();
  let redoStack = redoStacks.get(pageNum) || [];
  redoStack.push(current);
  redoStacks.set(pageNum, redoStack);

  const prevJSON = stack[stack.length - 1];
  undoStacks.set(pageNum, stack);

  const fCanvas = fabricCanvases.get(pageNum);
  if (fCanvas && prevJSON) {
    await safeLoadFromJSON(fCanvas, prevJSON, async () => {
      syncDrawRegion(pageNum, true);
      applyToolToFabricCanvas(fCanvas, pageNum);
      fCanvas.requestRenderAll();

      const record = {
        id: `fabric_draw_f${window.State.currentFile.id}_p${pageNum}`,
        fileId: window.State.currentFile.id,
        page: pageNum,
        kind: 'drawing',
        json: prevJSON,
        updatedAt: Date.now()
      };
      await window.DB.put('annotations', record);
      renderMarkupToolbar();
      window.toast(`Undone on Page ${pageNum}`);
    });
  }
}

export async function performRedo(pageNum) {
  let redoStack = redoStacks.get(pageNum) || [];
  if (redoStack.length === 0) return;

  const nextJSON = redoStack.pop();
  redoStacks.set(pageNum, redoStack);

  let stack = undoStacks.get(pageNum) || [];
  stack.push(nextJSON);
  undoStacks.set(pageNum, stack);

  const fCanvas = fabricCanvases.get(pageNum);
  if (fCanvas && nextJSON) {
    await safeLoadFromJSON(fCanvas, nextJSON, async () => {
      syncDrawRegion(pageNum, true);
      applyToolToFabricCanvas(fCanvas, pageNum);
      fCanvas.requestRenderAll();

      const record = {
        id: `fabric_draw_f${window.State.currentFile.id}_p${pageNum}`,
        fileId: window.State.currentFile.id,
        page: pageNum,
        kind: 'drawing',
        json: nextJSON,
        updatedAt: Date.now()
      };
      await window.DB.put('annotations', record);
      renderMarkupToolbar();
      window.toast(`Redone on Page ${pageNum}`);
    });
  }
}

export async function clearPageDrawings(pageNum) {
  const curPg = Number(pageNum || (window.State ? window.State.currentPage || 1 : 1));
  let fCanvas = fabricCanvases.get(curPg);
  if (!fCanvas) {
    fCanvas = ensurePageDrawLayer(curPg);
  }

  if (fCanvas) {
    fCanvas.discardActiveObject();
    const objs = fCanvas.getObjects ? [...fCanvas.getObjects()] : [];
    objs.forEach(obj => {
      try {
        fCanvas.remove(obj);
      } catch (e) {
        console.warn('Error removing object:', e);
      }
    });
    fCanvas.clear();
    syncDrawRegion(curPg, true);
    applyToolToFabricCanvas(fCanvas, curPg);
    fCanvas.renderAll();
    fCanvas.requestRenderAll();
  }

  const emptyBaseStr = JSON.stringify({ version: '5.3.0', objects: [] });
  undoStacks.set(curPg, [emptyBaseStr]);
  redoStacks.set(curPg, []);

  if (window.State && window.State.currentFile) {
    try {
      const fileId = window.State.currentFile.id;
      const allAnnots = await window.DB.byIndex('annotations', 'fileId', fileId);
      if (allAnnots && Array.isArray(allAnnots)) {
        for (const a of allAnnots) {
          if (Number(a.page) === curPg && a.kind === 'drawing') {
            await window.DB.del('annotations', a.id);
          }
        }
      }
      const id = `fabric_draw_f${fileId}_p${curPg}`;
      await window.DB.del('annotations', id);
    } catch (err) {
      console.error('Error clearing DB annotations:', err);
    }
  }

  renderMarkupToolbar();
  window.toast(`Cleared drawings on Page ${curPg}`);
}

// Expose globals for reader integration
window.toggleMarkupToolbar = toggleMarkupToolbar;
window.renderMarkupToolbar = renderMarkupToolbar;
window.paintDrawingsForPage = paintDrawingsForPage;
window.ensurePageDrawLayer = ensurePageDrawLayer;
window.destroyPageDrawLayer = destroyPageDrawLayer;
window.isMarkupModeActive = isMarkupModeActive;
window.syncDrawRegion = syncDrawRegion;
window.markupDebug = { state: () => ({ activeTool, activeColor, activeStrokeWidth, ui: { ...ui }, laserFadeMs, snapShapes, focusBand: !!focusBandEl }), setTool: (t) => { activeTool = t; afterToolChange(); }, setUi: (u) => { Object.assign(ui, u); renderMarkupToolbar(); }, canvases: () => fabricCanvases };
