// @ts-nocheck
/**
 * Systematic Studio Annotation & Drawing Engine for S.A.Y.A.D. PDF Reader
 * Built on Fabric.js v7 with viewport-sliced high-DPI rendering, 2-finger pan/zoom passthrough,
 * and a systematic, ergonomic floating annotation card.
 */

import * as fabricModule from 'fabric';

// Handle both ES module default and named exports for Fabric.js v5 / v6 / v7 compatibility
const fabric = fabricModule.fabric || fabricModule;

let isMarkupActive = false;
// 'none' (pan) | 'select' | 'pen' | 'marker' | 'glow' | 'laser' | 'eraser' | 'text' | 'stamp' | 'rectangle' | 'ellipse' | 'arrow' | 'line'
let activeTool = 'pen';
let lastDrawTool = 'pen';
let activeColor = '#ef4444'; // Red default
let activeStrokeWidth = 2;   // 2: Thin, 6: Med, 12: Thick
let activeFill = 'none';     // 'none' | 'rgba' | 'solid'
let inkHidden = false;       // reading mode: drawings hidden (never deleted)
let laserFadeMs = 4000;      // how long a laser trail stays
let activeStamp = 'imp';
let textSticky = false;      // text with a yellow sticky-note background
let snapShapes = true;       // hold still at the end of a stroke -> straight line / circle / box
let drawingBusy = false;     // a stroke is in progress (the card fades, the draw region must not move)

// Crisp custom SVG icons for every tool
const TOOL_ICONS = {
  select: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  marker: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`,
  glow: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  laser: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
  text: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  stamp: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  rectangle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/></svg>`,
  ellipse: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/></svg>`,
  line: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="8" rx="2"/><line x1="6" y1="4" x2="18" y2="4" stroke-opacity="0.45"/><line x1="6" y1="20" x2="18" y2="20" stroke-opacity="0.45"/></svg>`,
  pan: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`
};

const TOOL_DEFS = [
  { id: 'select',    label: 'Select', g: TOOL_ICONS.select,    t: 'Select — move, resize or rotate objects' },
  { id: 'pen',       label: 'Pen',    g: TOOL_ICONS.pen,       t: 'Pen — smooth freehand writing' },
  { id: 'marker',    label: 'Marker', g: TOOL_ICONS.marker,    t: 'Marker — highlight text clearly' },
  { id: 'glow',      label: 'Glow',   g: TOOL_ICONS.glow,      t: 'Glow Pen — neon highlight stroke' },
  { id: 'laser',     label: 'Laser',  g: TOOL_ICONS.laser,     t: 'Laser — pointer trail that fades automatically' },
  { id: 'eraser',    label: 'Eraser', g: TOOL_ICONS.eraser,    t: 'Eraser — tap or scrub over any drawing to erase' },
  { id: 'text',      label: 'Text',   g: TOOL_ICONS.text,      t: 'Text — tap anywhere on the page to add a note' },
  { id: 'stamp',     label: 'Stamp',  g: TOOL_ICONS.stamp,     t: 'Stamp — place IMP, ★, ?, ✓, Revise or Q.Exam' },
  { id: 'rectangle', label: 'Box',    g: TOOL_ICONS.rectangle, t: 'Box — drag to draw a rectangle' },
  { id: 'ellipse',   label: 'Circle', g: TOOL_ICONS.ellipse,   t: 'Circle — drag to draw a circle or oval' },
  { id: 'arrow',     label: 'Arrow',  g: TOOL_ICONS.arrow,     t: 'Arrow — drag to point at key concepts' },
  { id: 'line',      label: 'Line',   g: TOOL_ICONS.line,      t: 'Line — drag to draw a straight rule' }
];

const STAMPS = {
  imp:    { label: 'IMP',    color: '#d92b2b' },
  star:   { label: '★',      color: '#e08a00' },
  doubt:  { label: '?',      color: '#7c5cff' },
  done:   { label: '✓',      color: '#1a9a55' },
  revise: { label: 'Revise', color: '#d9540e' },
  exam:   { label: 'Q.Exam', color: '#0a7fb5' }
};

const MARKER_WIDTH = { 2: 10, 6: 16, 12: 24 };   // on-screen px (made zoom-proof when the brush is set)
const pageZoomOf = (fCanvas) => Math.max(0.2, (fCanvas && fCanvas.viewportTransform && fCanvas.viewportTransform[0]) || 1);
const TEXT_SIZE = { 2: 15, 6: 20, 12: 28 };      // on-screen px at the moment it is placed

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
  const e = document.getElementById('mtool-eye');
  if (e) {
    e.classList.toggle('on', inkHidden);
    e.title = inkHidden ? 'Drawings dikhao' : 'Drawings chhupao';
  }
  window.toast(inkHidden ? 'Drawings chhup gaye (delete nahi hue)' : 'Drawings wapas dikh rahe hain');
}
export function toggleInkHidden() { setInkHidden(!inkHidden); }
window.toggleInkHidden = toggleInkHidden;
window.isInkHidden = () => inkHidden;

function showFirstUseTip() {
  let seen = false;
  try { seen = !!localStorage.getItem('sayad_markup_tip'); } catch (_) {}
  if (seen) return;
  const old = document.getElementById('mk-tip');
  if (old) old.remove();
  const tb = document.getElementById('markup-toolbar');
  const tip = document.createElement('div');
  tip.id = 'mk-tip';
  tip.innerHTML = '<span><b>1 ungli</b> = draw · <b>2 ungli</b> = scroll/zoom · <b>⋮⋮</b> se card khiskao · <b>👁</b> se drawings chhupao</span><button type="button">Samajh gaya</button>';
  document.body.appendChild(tip);
  const r = tb ? tb.getBoundingClientRect() : null;
  if (r && r.bottom + 70 < window.innerHeight) {
    tip.style.top = (r.bottom + 10) + 'px';
    tip.style.bottom = 'auto';
  }
  const bye = () => { try { localStorage.setItem('sayad_markup_tip', '1'); } catch (_) {} tip.remove(); };
  tip.querySelector('button').onclick = bye;
  setTimeout(bye, 9000);
}

export function toggleMarkupToolbar() {
  isMarkupActive = !isMarkupActive;
  renderMarkupToolbar();

  if (isMarkupActive) {
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
    const tip = document.getElementById('mk-tip');
    if (tip) tip.remove();
    releaseEmptyDrawLayers();
    window.toast('Annotation studio closed');
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
    } catch (e) {}
  });
}

function drawingHasObjects(json) {
  if (!json) return false;
  if (typeof json === 'string') return !/"objects"\s*:\s*\[\s*\]/.test(json);
  return Array.isArray(json.objects) && json.objects.length > 0;
}

function getToolLabel(t) {
  const d = TOOL_DEFS.find(x => x.id === t);
  return d ? d.label : 'Scroll / Zoom';
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
/*  Systematic Studio Toolbar Card: Full / Mini × Horizontal / Vertical */
/* ------------------------------------------------------------------ */
function widthWord() { return activeStrokeWidth <= 2 ? 'Thin' : activeStrokeWidth <= 6 ? 'Med' : 'Thick'; }
function widthClass() { return activeStrokeWidth <= 2 ? '2' : activeStrokeWidth <= 6 ? '6' : '12'; }

function getActiveSelectedObject() {
  for (const [pNum, fc] of fabricCanvases.entries()) {
    const ao = fc && typeof fc.getActiveObject === 'function' ? fc.getActiveObject() : null;
    if (ao) return { pageNum: pNum, fCanvas: fc, obj: ao };
  }
  return null;
}

function swatchesHtml() {
  const custom = !COLOR_PALETTE.some(c => c.toLowerCase() === activeColor.toLowerCase());
  return COLOR_PALETTE.map(c => `
      <button type="button" class="markup-swatch ${activeColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-color="${c}" title="Color ${c}" style="background:${c};"></button>
    `).join('') + `
      <label class="markup-swatch markup-custom-swatch ${custom ? 'active' : ''}" title="Custom Color Picker" style="position:relative; background:${custom ? activeColor : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}; display:inline-flex; align-items:center; justify-content:center; overflow:hidden;">
        <input type="color" id="mtool-custom-color" value="${activeColor}" style="opacity:0; width:100%; height:100%; position:absolute; top:0; left:0; cursor:pointer;" />
      </label>`;
}

function stampChipsHtml() {
  return Object.entries(STAMPS).map(([k, s]) =>
    `<button type="button" class="mk-stamp-chip ${activeStamp === k ? 'active' : ''}" data-stamp="${k}" style="--sc:${s.color}">${s.label}</button>`).join('');
}

function inspectorHtml(vertical) {
  const selInfo = getActiveSelectedObject();
  const hasSel = !!selInfo;
  const selIsText = hasSel && isTextObj(selInfo.obj);

  if (vertical) {
    const out = [];
    const wDot = `<span class="stroke-dot stroke-w-${widthClass()}"></span>`;
    out.push(`<button type="button" class="markup-pill-btn" id="mtool-width-cycle" title="Thickness: ${widthWord()}">${wDot}</button>`);
    if (['rectangle', 'ellipse', 'select'].includes(activeTool)) {
      const fLabel = activeFill === 'none' ? '⚪' : activeFill === 'rgba' ? '🌓' : '🔴';
      out.push(`<button type="button" class="markup-pill-btn ${activeFill !== 'none' ? 'active' : ''}" id="mtool-fill-cycle" title="Fill: ${activeFill}">${fLabel}</button>`);
    }
    if (activeTool === 'text' || selIsText) {
      out.push(`<button type="button" class="markup-pill-btn ${textSticky ? 'active' : ''}" id="mtool-sticky" title="Sticky background">🟨</button>`);
    }
    if (selIsText) {
      out.push(`<button type="button" class="markup-pill-btn active" id="mtool-edit-text" title="Edit selected text">✎</button>`);
    }
    if (hasSel) {
      out.push(`<button type="button" class="markup-pill-btn mk-del-sel" id="mtool-del-sel" title="Delete selected object">🗑</button>`);
    }
    if (activeTool === 'laser') {
      out.push(`<button type="button" class="markup-pill-btn" id="mtool-fade" title="Laser fade">${laserFadeMs / 1000}s</button>`);
    }
    if (['pen', 'glow'].includes(activeTool)) {
      out.push(`<button type="button" class="markup-pill-btn ${snapShapes ? 'active' : ''}" id="mtool-snap" title="Hold to snap shape">◻</button>`);
    }
    return out.join('');
  }

  // Horizontal systematic inspector bar
  const segs = [];

  // 1. Direct 3-step size/thickness selector (Thin / Med / Thick)
  if (activeTool !== 'laser' && activeTool !== 'eraser' && activeTool !== 'none') {
    const sizeLabel = (activeTool === 'text' || activeTool === 'stamp') ? { 2: 'S', 6: 'M', 12: 'L' } : { 2: 'Thin', 6: 'Med', 12: 'Thick' };
    segs.push(`
      <div class="mk-seg-group" title="Size / Thickness">
        ${[2, 6, 12].map(w => `
          <button type="button" class="mk-seg-btn ${activeStrokeWidth === w ? 'active' : ''}" data-stroke-w="${w}">
            <span class="stroke-dot stroke-w-${w}"></span><span>${sizeLabel[w]}</span>
          </button>
        `).join('')}
      </div>
    `);
  }

  // 2. Tool-specific controls
  if (['pen', 'glow'].includes(activeTool)) {
    segs.push(`<button type="button" class="markup-pill-btn ${snapShapes ? 'active' : ''}" id="mtool-snap" title="Draw and hold still for 0.4s to snap into a straight line, circle, or box"><span>◻</span><span>Auto-Snap</span></button>`);
  }

  if (['rectangle', 'ellipse', 'select'].includes(activeTool)) {
    const fText = activeFill === 'none' ? 'No Fill' : activeFill === 'rgba' ? 'Soft Fill' : 'Solid Fill';
    const fDot = activeFill === 'none' ? '⚪' : activeFill === 'rgba' ? '🌓' : '🔴';
    segs.push(`<button type="button" class="markup-pill-btn ${activeFill !== 'none' ? 'active' : ''}" id="mtool-fill-cycle" title="Cycle shape fill mode"><span>${fDot}</span><span>${fText}</span></button>`);
  }

  if (activeTool === 'text' || selIsText) {
    segs.push(`<button type="button" class="markup-pill-btn ${textSticky ? 'active' : ''}" id="mtool-sticky" title="Yellow sticky-note card background"><span>🟨</span><span>Sticky</span></button>`);
  }

  if (selIsText) {
    segs.push(`<button type="button" class="markup-pill-btn active" id="mtool-edit-text" title="Edit selected text note"><span>✎</span><span>Edit Text</span></button>`);
  }

  if (hasSel) {
    segs.push(`<button type="button" class="markup-pill-btn mk-del-sel" id="mtool-del-sel" title="Delete selected object"><span>🗑</span><span>Delete</span></button>`);
  }

  if (activeTool === 'laser') {
    segs.push(`
      <div class="mk-seg-group" title="Laser trail fade duration">
        ${[2000, 4000, 7000].map(ms => `
          <button type="button" class="mk-seg-btn ${laserFadeMs === ms ? 'active' : ''}" data-laser-ms="${ms}">
            <span>Fade ${ms / 1000}s</span>
          </button>
        `).join('')}
      </div>
    `);
  }

  if (activeTool === 'eraser') {
    segs.push(`<span class="mk-hint-inline">Tap or drag across any stroke/shape to erase</span>`);
  }

  if (activeTool === 'none') {
    segs.push(`<span class="mk-hint-inline">1-finger scroll & zoom active · Tap a tool to draw</span>`);
  }

  // Reading Focus Strip button always accessible on the right of inspector
  segs.push(`<button type="button" class="markup-pill-btn ${focusBandEl ? 'active' : ''}" id="mtool-focus" title="Reading Focus Strip — dims rest of page" style="margin-left:auto;">${TOOL_ICONS.focus}<span>Focus</span></button>`);

  return segs.join('');
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

  const toolBtnsFull = TOOL_DEFS.map(t =>
    `<button type="button" class="markup-tool-btn mk-labeled-btn ${activeTool === t.id ? 'active' : ''}" id="mtool-${t.id}" title="${t.t}" aria-label="${t.t}">
      <span class="mk-t-ico">${t.g}</span>
      <span class="mk-t-lbl">${t.label}</span>
    </button>`).join('');

  const toolBtnsMini = TOOL_DEFS.map(t =>
    `<button type="button" class="markup-tool-btn ${activeTool === t.id ? 'active' : ''}" id="mtool-${t.id}" title="${t.t}" aria-label="${t.t}">${t.g}</button>`).join('') +
    `<button type="button" class="markup-tool-btn ${focusBandEl ? 'active' : ''}" id="mtool-focus" title="Focus strip" aria-label="Focus strip">${TOOL_ICONS.focus}</button>`;

  const undoBtn = `<button type="button" class="markup-tool-btn mk-act-btn" id="mtool-undo" title="Undo on Page ${curPg}" aria-label="Undo" ${pageUndo.length <= 1 ? 'disabled' : ''}>↩</button>`;
  const redoBtn = `<button type="button" class="markup-tool-btn mk-act-btn" id="mtool-redo" title="Redo on Page ${curPg}" aria-label="Redo" ${pageRedo.length === 0 ? 'disabled' : ''}>↪</button>`;
  const clearBtn = `<button type="button" class="markup-tool-btn mk-act-btn" id="mtool-clear-page" title="Clear Page ${curPg} (Undoable)" aria-label="Clear page">🗑</button>`;
  const closeBtn = `<button type="button" class="mk-hbtn mk-close-btn" id="mtool-close" title="Close Annotation Studio" aria-label="Close">✕</button>`;
  const orientBtn = `<button type="button" class="mk-hbtn" id="mtool-orient" title="${vert ? 'Switch to Horizontal Card' : 'Switch to Vertical Side Dock'}" aria-label="Orientation">${vert ? '⇄' : '⇅'}</button>`;
  const eyeBtn = `<button type="button" class="mk-hbtn${inkHidden ? ' on' : ''}" id="mtool-eye" title="${inkHidden ? 'Show drawings (Dikhao)' : 'Hide drawings (Chhupao)'}" aria-label="Hide or show drawings">👁</button>`;
  const modeBtn = `<button type="button" class="mk-hbtn" id="mtool-mode" title="${mini ? 'Expand Full Studio Card' : 'Minimize to Compact Bar'}" aria-label="Expand or compact">${mini ? '⌃' : '⌄'}</button>`;

  const statusBtn = `<button type="button" class="markup-status-badge ${activeTool === 'none' ? 'badge-pan' : 'badge-active'}" id="mtool-pan-toggle" title="Tap to toggle between Drawing and 1-Finger Scroll/Pan mode">
    ${activeTool === 'none' ? `${TOOL_ICONS.pan}<span>Scroll Mode · Tap to Draw</span>` : `<span class="mk-status-dot" style="background:${activeColor}"></span><span>${getToolLabel(activeTool)} · Tap for Scroll</span>`}
  </button>`;

  if (mini && !vert) {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move"><span class="drag-dots">⋮⋮</span></div>
      <div class="mk-strip">${toolBtnsMini}</div>
      <div class="mk-sep"></div>
      <button type="button" class="mk-colordot mk-dot" id="mtool-colorpop" title="Choose Color" aria-label="Colours" style="background:${activeColor}"></button>
      ${undoBtn}
      ${eyeBtn}
      ${modeBtn}
      ${closeBtn}`;
  } else if (mini && vert) {
    const glyph = activeTool === 'none' ? TOOL_ICONS.pan : (def ? def.g : TOOL_ICONS.pen);
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move"><span class="drag-dots">⋮⋮</span></div>
      <button type="button" class="mk-toolchip" id="mtool-mode-chip" title="Expand Full Studio" aria-label="Expand">${glyph}</button>
      <div class="mk-strip">${toolBtnsMini}</div>
      <div class="mk-sep"></div>
      <button type="button" class="mk-colordot mk-dot" id="mtool-colorpop" title="Choose Color" aria-label="Choose Color" style="background:${activeColor}"></button>
      ${undoBtn}
      ${modeBtn}
      ${closeBtn}`;
  } else if (vert) {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle mk-grip" title="Drag to move">
        <span class="drag-dots">⋮⋮</span>
        <div class="mk-vhead markup-head-actions">${eyeBtn}${orientBtn}${modeBtn}${closeBtn}</div>
      </div>
      <div class="mk-tools mk-vscroll">${toolBtnsMini}</div>
      <div class="mk-vsep"></div>
      <button type="button" class="mk-colordot" id="mtool-colorpop" title="Colours" aria-label="Colours" style="background:${activeColor}"></button>
      <div class="mk-vpills">${inspectorHtml(true)}</div>
      <div class="mk-vsep"></div>
      <div class="mk-vacts">${undoBtn}${redoBtn}${clearBtn}</div>`;
  } else {
    toolbarEl.innerHTML = `
      <div class="markup-drag-handle" title="Drag header to move card anywhere">
        <div class="mk-head-left">
          <span class="drag-dots">⋮⋮</span>
          <span class="drag-title">Page ${curPg}</span>
          ${statusBtn}
        </div>
        <div class="mk-hr">${eyeBtn}${orientBtn}${modeBtn}${closeBtn}</div>
      </div>
      <div class="mk-tools-grid">${toolBtnsFull}</div>
      ${activeTool === 'stamp' ? `<div class="mk-stamps">${stampChipsHtml()}</div>` : ''}
      <div class="mk-inspector">${inspectorHtml(false)}</div>
      <div class="mk-foot">
        <div class="mk-colors">${swatchesHtml()}</div>
        <div class="mk-acts">${undoBtn}${redoBtn}${clearBtn}</div>
      </div>`;
  }

  makeToolbarDraggable(toolbarEl);
  bindToolbar(toolbarEl, curPg);
  placeToolbar(toolbarEl, fresh);
  if (vert && !mini && activeTool === 'stamp') openFlyout('stamp');
  else if (!(flyKind === 'color' && (vert || mini))) closeFlyout();
}

function afterToolChange() {
  if (activeTool !== 'none') lastDrawTool = activeTool;
  if (inkHidden && activeTool !== 'none') setInkHidden(false);
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
      if (activeTool === 'stamp' && ui.orient === 'v') flyKind = 'stamp';
      else if (flyKind === 'stamp') closeFlyout();
      afterToolChange();
    };
  });

  // Status badge toggles between Scroll Mode ('none') and last active drawing tool
  const panToggle = $('mtool-pan-toggle');
  if (panToggle) {
    panToggle.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      activeTool = (activeTool === 'none') ? (lastDrawTool || 'pen') : 'none';
      afterToolChange();
    };
  }

  const focusBtn = $('mtool-focus');
  if (focusBtn) focusBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleFocusBand(); renderMarkupToolbar(); };

  // Direct stroke width buttons (Thin / Med / Thick)
  toolbarEl.querySelectorAll('[data-stroke-w]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      activeStrokeWidth = Number(btn.dataset.strokeW) || 2;
      updateSelectedObjectStrokeWidth(activeStrokeWidth);
      updateAllPageOverlayPointerEvents();
      renderMarkupToolbar();
    };
  });

  // Direct laser fade buttons (2s / 4s / 7s)
  toolbarEl.querySelectorAll('[data-laser-ms]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      laserFadeMs = Number(btn.dataset.laserMs) || 4000;
      renderMarkupToolbar();
    };
  });

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
  toolbarEl.querySelectorAll('.mk-stamp-chip').forEach(ch => {
    ch.onclick = () => { activeStamp = ch.dataset.stamp; renderMarkupToolbar(); };
  });

  // Inspector Pills
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
  if (snapBtn) snapBtn.onclick = () => { snapShapes = !snapShapes; window.toast(snapShapes ? 'Auto-Snap ON: hold still at stroke end to straighten' : 'Auto-Snap OFF'); renderMarkupToolbar(); };

  // Edit Selected Text button
  const editTxtBtn = $('mtool-edit-text');
  if (editTxtBtn) {
    editTxtBtn.onclick = () => {
      const selInfo = getActiveSelectedObject();
      if (selInfo && isTextObj(selInfo.obj)) {
        openTextDialog(selInfo.obj.text, (str) => {
          selInfo.obj.set({ text: str, dirty: true });
          selInfo.obj.setCoords();
          selInfo.fCanvas.requestRenderAll();
          savePageCanvasState(selInfo.pageNum);
        });
      }
    };
  }

  // Delete Selected Object button
  const delSelBtn = $('mtool-del-sel');
  if (delSelBtn) {
    delSelBtn.onclick = () => {
      deleteSelectedObjects();
    };
  }

  // Actions
  const undo = $('mtool-undo'); if (undo) undo.onclick = () => performUndo(curPg);
  const redo = $('mtool-redo'); if (redo) redo.onclick = () => performRedo(curPg);
  const clr = $('mtool-clear-page'); if (clr) clr.onclick = () => clearPageDrawings(curPg);
  const cls = $('mtool-close'); if (cls) cls.onclick = () => toggleMarkupToolbar();
  const eye = $('mtool-eye'); if (eye) eye.onclick = () => toggleInkHidden();

  // Layout controls
  const toggleMode = (e) => { e.preventDefault(); e.stopPropagation(); ui.mode = ui.mode === 'mini' ? 'full' : 'mini'; saveUi(); closeFlyout(); renderMarkupToolbar(); };
  const mode = $('mtool-mode'); if (mode) mode.onclick = toggleMode;
  const modeChip = $('mtool-mode-chip'); if (modeChip) modeChip.onclick = toggleMode;
  const orient = $('mtool-orient');
  if (orient) orient.onclick = (e) => { e.preventDefault(); e.stopPropagation(); ui.orient = ui.orient === 'v' ? 'h' : 'v'; ui.x = ui.y = null; saveUi(); closeFlyout(); renderMarkupToolbar(); };
}

function deleteSelectedObjects() {
  const selInfo = getActiveSelectedObject();
  if (!selInfo) return;
  const { pageNum, fCanvas, obj } = selInfo;
  if (kindOf(obj) === 'activeselection' && typeof obj.getObjects === 'function') {
    obj.getObjects().forEach(child => fCanvas.remove(child));
  } else {
    fCanvas.remove(obj);
  }
  fCanvas.discardActiveObject();
  fCanvas.requestRenderAll();
  savePageCanvasState(pageNum);
  window.toast('Selected annotation deleted');
}

// Allow Delete / Backspace key to remove selected annotation object when not typing in an input
document.addEventListener('keydown', (e) => {
  if (!isMarkupActive) return;
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const selInfo = getActiveSelectedObject();
    if (selInfo) {
      e.preventDefault();
      deleteSelectedObjects();
    }
  }
});

function setActiveColor(c) {
  activeColor = c;
  updateSelectedObjectColor(activeColor);
  updateAllPageOverlayPointerEvents();
  renderMarkupToolbar();
  if (flyKind === 'color') closeFlyout();
}

function placeToolbar(el, fresh) {
  const apply = () => {
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    if (ui.x == null || ui.y == null) {
      if (ui.orient === 'v') {
        el.style.transform = 'none';
        el.style.left = Math.max(8, vw - w - 10) + 'px';
        el.style.top = Math.max(8, Math.min(vh - h - 8, 86)) + 'px';
      } else {
        el.style.left = '50%';
        el.style.top = '58px';
        el.style.transform = 'translateX(-50%)';
      }
    } else {
      el.style.transform = 'none';
      el.style.left = Math.max(6, Math.min(vw - w - 6, ui.x)) + 'px';
      el.style.top = Math.max(6, Math.min(vh - h - 6, ui.y)) + 'px';
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
      toolbarEl.style.left = `${Math.max(6, Math.min(window.innerWidth - toolbarEl.offsetWidth - 6, initialLeft + dx))}px`;
      toolbarEl.style.top = `${Math.max(6, Math.min(window.innerHeight - toolbarEl.offsetHeight - 6, initialTop + dy))}px`;
      positionFlyout();
    };

    const onPointerUp = () => {
      isDragging = false;
      ui.x = parseFloat(toolbarEl.style.left);
      ui.y = parseFloat(toolbarEl.style.top);
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

/* Side flyout (colours / stamps) used by the vertical or mini card */
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
  if (!f) {
    f = document.createElement('div');
    f.id = 'mk-fly';
    (document.querySelector('.view') || document.body).appendChild(f);
  }
  f.innerHTML = kind === 'stamp'
    ? `<div class="mk-fly-title">Select Stamp</div><div class="mk-fly-grid mk-fly-stamps">${stampChipsHtml()}</div>`
    : `<div class="mk-fly-title">Ink Colour</div><div class="mk-fly-grid mk-fly-colors">${swatchesHtml()}</div>`;
  f.querySelectorAll('.markup-swatch[data-color]').forEach(sw => { sw.onclick = () => setActiveColor(sw.dataset.color); });
  const ci = f.querySelector('#mtool-custom-color');
  if (ci) {
    const h = e => { if (e.target.value) setActiveColor(e.target.value); };
    ci.oninput = h;
    ci.onchange = h;
  }
  f.querySelectorAll('.mk-stamp-chip').forEach(ch => {
    ch.onclick = () => {
      activeStamp = ch.dataset.stamp;
      f.querySelectorAll('.mk-stamp-chip').forEach(c => c.classList.toggle('active', c === ch));
    };
  });
  positionFlyout();
}
function positionFlyout() {
  const f = document.getElementById('mk-fly'), tb = document.getElementById('markup-toolbar');
  if (!f || !tb) return;
  const r = tb.getBoundingClientRect(), fw = f.offsetWidth, fh = f.offsetHeight;
  if (ui.orient === 'h') {
    const left = Math.max(8, Math.min(window.innerWidth - fw - 8, r.left + r.width / 2 - fw / 2));
    const top = (r.bottom + fh + 12 < window.innerHeight) ? r.bottom + 8 : Math.max(8, r.top - fh - 8);
    f.style.left = left + 'px';
    f.style.top = top + 'px';
  } else {
    const left = (r.left + r.width / 2 > window.innerWidth / 2) ? r.left - fw - 8 : r.right + 8;
    f.style.left = Math.max(8, Math.min(window.innerWidth - fw - 8, left)) + 'px';
    f.style.top = Math.max(8, Math.min(window.innerHeight - fh - 8, r.top + 36)) + 'px';
  }
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
  const sc = document.getElementById('reader-scroll');
  if (!sc) return;
  const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
  const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  if (panLast) {
    sc.scrollLeft -= cx - panLast.x;
    sc.scrollTop -= cy - panLast.y;
  }
  panLast = { x: cx, y: cy };
}, { capture: true, passive: true });

/* Finger / pen on the page: fade the card out of the way until the stroke ends. */
const BUSY_TOOLS = ['pen', 'marker', 'glow', 'laser', 'rectangle', 'ellipse', 'arrow', 'line', 'eraser'];
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
  edge.style.top = focusBand.y + 'px';
  edge.style.height = focusBand.h + 'px';
  const grip = focusBandEl.querySelector('.fb-grip');
  const size = focusBandEl.querySelector('.fb-size');
  if (grip) grip.style.top = (focusBand.y + focusBand.h / 2 - 20) + 'px';
  if (size) size.style.top = (focusBand.y + focusBand.h - 18) + 'px';
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
      const mv = (ev) => { onMove(ev.clientY - y0, by, bh); layoutFocusBand(); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  };
  const grip = focusBandEl.querySelector('.fb-grip');
  const size = focusBandEl.querySelector('.fb-size');
  drag(grip, (dy, by) => { focusBand.y = by + dy; });
  drag(size, (dy, by, bh) => { focusBand.h = bh + dy; });
  layoutFocusBand();
  focusBandEl._relayout = () => { layoutFocusBand(); };
  return true;
}
window.addEventListener('resize', () => { if (focusBandEl && focusBandEl._relayout) focusBandEl._relayout(); });

function getFillValue(color, fillType) {
  if (fillType === 'none') return 'transparent';
  if (fillType === 'solid') return color;
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

// Accurate PDF-scene coordinate extraction across Fabric v5 / v6 / v7 under any viewportTransform
function getFabricPointer(fCanvas, options) {
  if (options) {
    if (options.scenePoint) return options.scenePoint;
    if (options.absolutePointer) return options.absolutePointer;
  }
  if (typeof fCanvas.getScenePoint === 'function' && options && options.e) {
    try { return fCanvas.getScenePoint(options.e); } catch (_) {}
  }
  if (typeof fCanvas.getPointer === 'function' && options && options.e) {
    try { return fCanvas.getPointer(options.e, false); } catch (_) {}
  }
  const e = options ? options.e : null;
  const canvasEl = getCanvasElement(fCanvas);
  if (canvasEl && e) {
    const rect = canvasEl.getBoundingClientRect();
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    const clientX = touch ? touch.clientX : (e.clientX !== undefined ? e.clientX : 0);
    const clientY = touch ? touch.clientY : (e.clientY !== undefined ? e.clientY : 0);
    const vpt = (fCanvas && fCanvas.viewportTransform) || [1, 0, 0, 1, 0, 0];
    return {
      x: (clientX - rect.left - (vpt[4] || 0)) / (vpt[0] || 1),
      y: (clientY - rect.top - (vpt[5] || 0)) / (vpt[3] || 1)
    };
  }
  return { x: 0, y: 0 };
}

// Fabric v6/v7 loadFromJSON(json, reviver) takes reviver as 2nd param and returns a Promise!
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

    if (!fCanvas.contextContainer && !fCanvas.getContext) {
      if (callback) callback();
      return;
    }

    let called = false;
    const done = () => {
      if (called) return;
      called = true;
      try {
        fCanvas.forEachObject(obj => {
          if (obj && typeof obj.setCoords === 'function') obj.setCoords();
        });
      } catch (_) {}
      if (callback) callback();
    };

    const majorVer = parseInt(String(fabric.version || '7').split('.')[0], 10) || 7;
    if (majorVer >= 6) {
      await fCanvas.loadFromJSON(parsed);
      done();
    } else {
      const res = fCanvas.loadFromJSON(parsed, done);
      if (res && typeof res.then === 'function') {
        await res;
        done();
      }
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
const isTextObj = (o) => kindOf(o) === 'itext' || kindOf(o) === 'text' || kindOf(o) === 'fabrictext' || (o && o._k === 'text');

function configureBrush(fCanvas) {
  const PencilBrushClass = fabric.PencilBrush || fabricModule.PencilBrush;
  let brush = fCanvas.freeDrawingBrush;
  if (!brush && PencilBrushClass) {
    brush = new PencilBrushClass(fCanvas);
  }
  if (!brush) return;
  brush.shadow = null;
  brush.strokeLineCap = 'round';
  brush.strokeLineJoin = 'round';
  const z = pageZoomOf(fCanvas);   // widths are chosen in screen px, so a stroke looks the same at any zoom
  if (activeTool === 'marker') {
    brush.color = withAlpha(activeColor, 0.38);
    brush.width = (MARKER_WIDTH[activeStrokeWidth] || 16) / z;
    brush.strokeLineCap = 'square';
  } else if (activeTool === 'glow') {
    brush.color = mixWithWhite(activeColor, 0.55);
    brush.width = Math.max(3, activeStrokeWidth * 1.4) / z;
    const ShadowClass = fabric.Shadow || fabricModule.Shadow;
    if (ShadowClass) brush.shadow = new ShadowClass({ color: activeColor, blur: 16 / z, offsetX: 0, offsetY: 0, affectStroke: true });
  } else {
    brush.color = activeColor;
    brush.width = Math.max(1.2, activeStrokeWidth) / z;
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
    outerContainer.style.touchAction = enablePointer ? 'none' : 'auto';
  }
  if (fabricWrapper) {
    fabricWrapper.style.pointerEvents = enablePointer ? 'auto' : 'none';
    fabricWrapper.style.touchAction = enablePointer ? 'none' : 'auto';
  }
  if (canvasEl) {
    canvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
    canvasEl.style.touchAction = enablePointer ? 'none' : 'auto';
  }
  if (fCanvas) {
    if (fCanvas.upperCanvasEl) {
      fCanvas.upperCanvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
      fCanvas.upperCanvasEl.style.touchAction = enablePointer ? 'none' : 'auto';
    }
    if (fCanvas.lowerCanvasEl) {
      fCanvas.lowerCanvasEl.style.pointerEvents = enablePointer ? 'auto' : 'none';
      fCanvas.lowerCanvasEl.style.touchAction = enablePointer ? 'none' : 'auto';
    }
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
      obj.cornerSize = 11;
      obj.touchCornerSize = 22;
      obj.transparentCorners = false;
      obj.perPixelTargetFind = false;
    } else if (activeTool === 'eraser') {
      obj.selectable = false;
      obj.evented = true;
      obj.perPixelTargetFind = false;
    } else if (activeTool === 'text') {
      const t = isTextObj(obj);
      obj.selectable = t;
      obj.evented = t;
    } else {
      obj.selectable = false;
      obj.evented = false;
    }
    if (typeof obj.setCoords === 'function') obj.setCoords();
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
      ao.set({ backgroundColor: textSticky ? '#fff3a3' : '', padding: textSticky ? 6 : 2, dirty: true });
      ao.setCoords();
      fc.requestRenderAll();
      savePageCanvasState(n);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Draw region: the Fabric canvas only covers what is on screen        */
/* ------------------------------------------------------------------ */
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
  if (document.getElementById('mk-textdlg') && !force) return;
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
    if (container._region) {
      container._region = null;
      fCanvas.setDimensions({ width: 1, height: 1 });
      container.style.width = '1px';
      container.style.height = '1px';
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
  container.style.left = r.x0 + 'px';
  container.style.top = r.y0 + 'px';
  container.style.width = rw + 'px';
  container.style.height = rh + 'px';
  fCanvas.setDimensions({ width: rw, height: rh });
  fCanvas.setViewportTransform([z, 0, 0, z, -r.x0, -r.y0]);
  if (typeof fCanvas.calcOffset === 'function') fCanvas.calcOffset();
  fCanvas.forEachObject(obj => { if (obj && typeof obj.setCoords === 'function') obj.setCoords(); });
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
  const L = { pts: [], down: false, raf: 0, cv: null, dpr: 1, strokeId: 0 };
  container._laser = L;
  const rect = () => container.getBoundingClientRect();
  const add = (e) => {
    const r = rect();
    L.pts.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now(), s: L.strokeId });
  };
  const ctx2d = () => {
    const r = rect(); const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (!L.cv) {
      L.cv = document.createElement('canvas');
      L.cv.className = 'laser-cv';
      L.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:25;';
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
      // Never connect separate strokes!
      if (L.pts[i].s !== L.pts[i - 1].s) continue;
      const a = 1 - (now - L.pts[i].t) / fade;
      const A = Math.max(0, Math.pow(a, 1.15));
      ctx.beginPath();
      ctx.moveTo(L.pts[i - 1].x * dpr, L.pts[i - 1].y * dpr);
      ctx.lineTo(L.pts[i].x * dpr, L.pts[i].y * dpr);
      ctx.shadowColor = col; ctx.shadowBlur = 16 * dpr * A;
      ctx.strokeStyle = withAlpha(col, A); ctx.lineWidth = (2 + 6 * A) * dpr; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,255,255,${(A * 0.9).toFixed(3)})`; ctx.lineWidth = (0.8 + 1.6 * A) * dpr; ctx.stroke();
    }
    // Also render single-tap laser dots or stroke tips per stroke
    for (let i = 0; i < n; i++) {
      const isStrokeEnd = (i === n - 1) || (L.pts[i + 1].s !== L.pts[i].s);
      if (!isStrokeEnd) continue;
      const p = L.pts[i];
      const isLatest = (i === n - 1);
      const ha = (isLatest && L.down) ? 1 : Math.max(0, 1 - (now - p.t) / fade);
      const pulse = isLatest ? (0.85 + 0.15 * Math.sin(now / 90)) : 0.9;
      ctx.shadowColor = col; ctx.shadowBlur = 22 * dpr * ha;
      ctx.fillStyle = withAlpha(col, ha); ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, 7 * pulse * dpr, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(255,255,255,${ha.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, 2.8 * dpr, 0, 6.283); ctx.fill();
    }
    if (n || L.down) L.raf = requestAnimationFrame(frame);
    else if (L.cv) { L.cv.remove(); L.cv.width = 0; L.cv = null; }
  };
  const kick = () => { if (!L.raf) L.raf = requestAnimationFrame(frame); };
  container.addEventListener('pointerdown', (e) => {
    if (!isMarkupActive || activeTool !== 'laser' || multiTouch) return;
    if (e.cancelable) e.preventDefault();
    L.strokeId = (L.strokeId || 0) + 1;
    L.down = true;
    add(e);
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    kick();
  });
  container.addEventListener('pointermove', (e) => {
    if (!L.down || activeTool !== 'laser') return;
    if (multiTouch) { L.down = false; L.pts = []; return; }
    if (e.cancelable) e.preventDefault();
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
  const sc = (activeStrokeWidth <= 2 ? 1.0 : activeStrokeWidth <= 6 ? 1.35 : 1.8) / (z || 1);
  const TextC = fabric.FabricText || fabric.Text || fabricModule.FabricText || fabricModule.Text;
  const RectC = fabric.Rect || fabricModule.Rect;
  const GroupC = fabric.Group || fabricModule.Group;
  const txt = new TextC(S.label, {
    left: 0, top: 0, fontSize: 16, fontWeight: '800',
    fontFamily: 'Plus Jakarta Sans, Inter, system-ui, sans-serif',
    fill: S.color, originX: 'center', originY: 'center'
  });
  const box = new RectC({
    left: 0, top: 0, width: (txt.width || 36) + 20, height: (txt.height || 18) + 10,
    rx: 6, ry: 6, fill: 'rgba(255,255,255,0.92)', stroke: S.color, strokeWidth: 2.4,
    originX: 'center', originY: 'center'
  });
  return new GroupC([box, txt], {
    left: x, top: y, originX: 'center', originY: 'center',
    angle: -4 + Math.random() * 8, scaleX: sc, scaleY: sc,
    selectable: false, evented: false, _k: 'stamp'
  });
}

// Structured text modal dialog (works reliably with phone virtual keyboards)
function openTextDialog(initial, onDone) {
  const old = document.getElementById('mk-textdlg');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'mk-textdlg';
  box.innerHTML = `
    <div class="mk-td-box">
      <div class="mk-td-title">${initial ? 'Edit Text' : 'Add Text / Sticky Note'}</div>
      <textarea class="mk-td-in" rows="3" placeholder="Type your note or label here..." maxlength="500"></textarea>
      <div class="mk-td-row">
        <button class="mk-td-btn mk-td-x" type="button">Cancel</button>
        <button class="mk-td-btn ok mk-td-ok" type="button">${initial ? 'Save ✓' : 'Place on Page ✓'}</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const ta = box.querySelector('textarea');
  ta.value = initial || '';
  const born = performance.now();
  let doneCalled = false;
  const close = () => {
    if (box.parentNode) box.remove();
    setTimeout(() => scheduleDrawSync(), 180);
  };
  const ok = (ev) => {
    if (ev) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
    }
    if (doneCalled || performance.now() - born < 120) return;
    const v = (ta.value || '').trim();
    doneCalled = true;
    try { ta.blur(); } catch (_) {}
    close();
    if (v) {
      onDone(v);
    } else {
      window.toast && window.toast('Kuch text likho phir Place on Page dabao');
    }
  };
  const cancel = (ev) => {
    if (ev) {
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
    }
    if (doneCalled || performance.now() - born < 120) return;
    doneCalled = true;
    try { ta.blur(); } catch (_) {}
    close();
  };
  const okBtn = box.querySelector('.mk-td-ok');
  const xBtn = box.querySelector('.mk-td-x');
  // Use pointerdown + click so tapping while mobile virtual keyboard is open fires immediately without getting swallowed by keyboard collapse
  okBtn.addEventListener('pointerdown', ok);
  okBtn.addEventListener('click', ok);
  xBtn.addEventListener('pointerdown', cancel);
  xBtn.addEventListener('click', cancel);
  box.addEventListener('pointerdown', (e) => {
    if (e.target === box && performance.now() - born > 300) cancel(e);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ok(e);
    }
    if (e.key === 'Escape') cancel(e);
  });
  setTimeout(() => {
    try {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch (_) {}
  }, 80);
}

function makeText(x, y, z, str) {
  const TextClass = fabric.FabricText || fabric.IText || fabricModule.FabricText || fabricModule.IText || fabric.Text || fabricModule.Text;
  const isWhite = activeColor.toLowerCase() === '#ffffff';
  const dark = (textSticky && (isWhite || activeColor.toLowerCase() === '#eab308')) || (!textSticky && isWhite);
  const t = new TextClass(str || 'Note', {
    left: x,
    top: y,
    originX: 'left',
    originY: 'top',
    fontSize: (TEXT_SIZE[activeStrokeWidth] || 20) / (z || 1),
    fill: dark ? '#18181b' : activeColor,
    fontFamily: 'Plus Jakarta Sans, Inter, system-ui, -apple-system, sans-serif',
    fontWeight: '700',
    backgroundColor: textSticky ? '#fff3a3' : (isWhite ? '#fff3a3' : 'rgba(255,255,255,0.82)'),
    padding: textSticky ? 7 : 4,
    editable: false,
    objectCaching: false,
    _k: 'text'
  });
  if (typeof t.initDimensions === 'function') t.initDimensions();
  if (typeof t.setCoords === 'function') t.setCoords();
  return t;
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
    container.style.width = '1px';
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
      enablePointerEvents: true,
      preserveObjectStacking: true
    });

    let stack = undoStacks.get(pageNum) || [];
    if (stack.length === 0) {
      const emptyObj = { version: fabric.version || '7.4.0', objects: [] };
      stack.push(JSON.stringify(emptyObj));
      undoStacks.set(pageNum, stack);
    }

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

// Helper for forgiving touch / scrub erasing at scene point (px, py)
function findObjectNearPoint(fCanvas, pt, radius) {
  const objs = fCanvas.getObjects ? fCanvas.getObjects() : [];
  for (let i = objs.length - 1; i >= 0; i--) {
    const obj = objs[i];
    if (!obj || !obj.visible) continue;
    try {
      if (typeof obj.setCoords === 'function') obj.setCoords();
      if (typeof obj.containsPoint === 'function' && obj.containsPoint(pt)) return obj;
      const br = typeof obj.getBoundingRect === 'function' ? obj.getBoundingRect(true) : null;
      if (br) {
        // Check in scene space using object's bounding box + padding
        const left = (obj.left !== undefined) ? (obj.originX === 'center' ? obj.left - (obj.getScaledWidth ? obj.getScaledWidth() / 2 : 0) : obj.left) : 0;
        const top = (obj.top !== undefined) ? (obj.originY === 'center' ? obj.top - (obj.getScaledHeight ? obj.getScaledHeight() / 2 : 0) : obj.top) : 0;
        const w = obj.getScaledWidth ? obj.getScaledWidth() : (obj.width || 0);
        const h = obj.getScaledHeight ? obj.getScaledHeight() : (obj.height || 0);
        if (pt.x >= left - radius && pt.x <= left + w + radius && pt.y >= top - radius && pt.y <= top + h + radius) {
          // For paths, verify point is reasonably close to at least one path command
          if (kindOf(obj) === 'path' && Array.isArray(obj.path)) {
            for (const cmd of obj.path) {
              const cx = cmd[cmd.length - 2], cy = cmd[cmd.length - 1];
              if (typeof cx === 'number' && typeof cy === 'number' && Math.hypot(pt.x - cx, pt.y - cy) <= radius * 2.2) {
                return obj;
              }
            }
          } else {
            return obj;
          }
        }
      }
    } catch (_) {}
  }
  return null;
}

function bindFabricCanvasEvents(fCanvas, pageNum) {
  let isDrawingShape = false;
  let activeShapeObj = null;
  let startX = 0, startY = 0;
  let isScrubErasing = false;
  let erasedAnyInStroke = false;
  let lastTextTapTime = 0, lastTextTapObj = null;
  let downTargetObj = null;

  // Hold-to-snap bookkeeping
  let strokePts = [], lastMoveT = 0, lastPt = null;

  // Refresh toolbar when selection changes so 'Delete Selected' / 'Edit Text' pills appear
  const onSelUpdate = () => { if (isMarkupActive) renderMarkupToolbar(); };
  fCanvas.on('selection:created', onSelUpdate);
  fCanvas.on('selection:updated', onSelUpdate);
  fCanvas.on('selection:cleared', onSelUpdate);

  // Path Created (Freehand Pen / Marker / Glow)
  fCanvas.on('path:created', (e) => {
    let path = e.path;
    if (!path) return;
    if (multiTouchUsed) { fCanvas.remove(path); fCanvas.requestRenderAll(); return; }
    const kind = activeTool;
    if (snapShapes && (kind === 'pen' || kind === 'glow') && strokePts.length >= 8 && (performance.now() - lastMoveT) >= 400) {
      const snapped = snapStrokeToShape(strokePts, path);
      if (snapped) {
        fCanvas.remove(path);
        fCanvas.add(snapped);
        path = snapped;
        try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      }
    }
    if (kind === 'marker') {
      path.set({ globalCompositeOperation: 'multiply' });
    }
    path.set({
      id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      pageNum,
      _k: kind
    });
    path.selectable = false;
    path.evented = false;
    if (typeof path.setCoords === 'function') path.setCoords();
    savePageCanvasState(pageNum);
  });

  // Empty text boxes disappear; real ones are saved
  fCanvas.on('text:editing:exited', (e) => {
    const t = e && e.target;
    if (t && !(t.text || '').trim()) {
      fCanvas.remove(t);
      fCanvas.discardActiveObject();
      fCanvas.requestRenderAll();
    }
    savePageCanvasState(pageNum);
  });

  // Object modified (Move, Resize, Rotate)
  fCanvas.on('object:modified', (e) => {
    if (e && e.target && typeof e.target.setCoords === 'function') e.target.setCoords();
    savePageCanvasState(pageNum);
  });

  // Desktop double-click on text object opens editor
  fCanvas.on('mouse:dblclick', (options) => {
    const t = (options && options.target) || fCanvas.getActiveObject();
    if (!isMarkupActive || !t || !isTextObj(t) || !['text', 'select'].includes(activeTool)) return;
    openTextDialog(t.text, (str) => {
      t.set({ text: str, dirty: true });
      if (typeof t.initDimensions === 'function') t.initDimensions();
      if (typeof t.setCoords === 'function') t.setCoords();
      fCanvas.requestRenderAll();
      savePageCanvasState(pageNum);
    });
  });

  fCanvas.on('mouse:down', (options) => {
    if (!isMarkupActive || multiTouch) return;

    const pointer = getFabricPointer(fCanvas, options);
    const z = pageZoomOf(fCanvas);
    startX = pointer.x;
    startY = pointer.y;
    strokePts = [pointer];
    lastPt = pointer;
    lastMoveT = performance.now();

    const targetObj = (options && options.target) || findObjectNearPoint(fCanvas, pointer, 10 / z);
    downTargetObj = targetObj;

    // Mobile double-tap on text object in 'select' or 'text' mode opens text editor
    if (targetObj && isTextObj(targetObj) && ['text', 'select'].includes(activeTool)) {
      const now = performance.now();
      if (lastTextTapObj === targetObj && (now - lastTextTapTime) < 420) {
        lastTextTapTime = 0;
        lastTextTapObj = null;
        // keep downTargetObj set: with the Text tool, mouse:up would otherwise open an empty "new text" dialog over this edit dialog
        openTextDialog(targetObj.text, (str) => {
          targetObj.set({ text: str, dirty: true });
          if (typeof targetObj.initDimensions === 'function') targetObj.initDimensions();
          if (typeof targetObj.setCoords === 'function') targetObj.setCoords();
          fCanvas.requestRenderAll();
          savePageCanvasState(pageNum);
        });
        return;
      }
      lastTextTapTime = now;
      lastTextTapObj = targetObj;
    }

    // Stamp and Text are placed on mouse:up so touch release doesn't accidentally hit the modal or get swallowed
    if (activeTool === 'stamp' || activeTool === 'text') {
      return;
    }

    // Eraser Tool action (supports both single tap AND scrub/drag erasing)
    if (activeTool === 'eraser') {
      isScrubErasing = true;
      erasedAnyInStroke = false;
      const hit = targetObj || findObjectNearPoint(fCanvas, pointer, 14 / z);
      if (hit) {
        fCanvas.remove(hit);
        fCanvas.discardActiveObject();
        fCanvas.requestRenderAll();
        erasedAnyInStroke = true;
      }
      return;
    }

    // Shape creation (Box, Circle, Line, Arrow)
    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(activeTool)) {
      isDrawingShape = true;
      const fill = getFillValue(activeColor, activeFill);
      const sw = Math.max(1.2, activeStrokeWidth) / z;

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
          strokeWidth: sw,
          strokeUniform: true,
          originX: 'left',
          originY: 'top',
          rx: 4 / z,
          ry: 4 / z,
          objectCaching: false,
          selectable: false,
          evented: false,
          _k: 'rectangle'
        });
      } else if (activeTool === 'ellipse' && EllipseClass) {
        activeShapeObj = new EllipseClass({
          left: startX,
          top: startY,
          rx: 0.5,
          ry: 0.5,
          fill: fill,
          stroke: activeColor,
          strokeWidth: sw,
          strokeUniform: true,
          originX: 'left',
          originY: 'top',
          objectCaching: false,
          selectable: false,
          evented: false,
          _k: 'ellipse'
        });
      } else if (activeTool === 'line' && LineClass) {
        activeShapeObj = new LineClass([startX, startY, startX, startY], {
          stroke: activeColor,
          strokeWidth: sw,
          strokeUniform: true,
          strokeLineCap: 'round',
          objectCaching: false,
          selectable: false,
          evented: false,
          _k: 'line'
        });
      } else if (activeTool === 'arrow') {
        activeShapeObj = createFabricArrow(startX, startY, startX + 1, startY + 1, activeColor, sw, z);
      }

      if (activeShapeObj) {
        fCanvas.add(activeShapeObj);
      }
    }
  });

  fCanvas.on('mouse:move', (options) => {
    if (multiTouch) return;
    const z = pageZoomOf(fCanvas);
    const movePt = getFabricPointer(fCanvas, options);

    if (fCanvas.isDrawingMode && drawingBusy) {
      strokePts.push(movePt);
      if (!lastPt || Math.hypot(movePt.x - lastPt.x, movePt.y - lastPt.y) * z > 3) {
        lastMoveT = performance.now();
        lastPt = movePt;
      }
      return;
    }

    lastPt = movePt;

    // Continuous scrub-erasing while dragging finger
    if (activeTool === 'eraser' && isScrubErasing) {
      const hit = (options && options.target) || findObjectNearPoint(fCanvas, movePt, 14 / z);
      if (hit) {
        fCanvas.remove(hit);
        fCanvas.discardActiveObject();
        fCanvas.requestRenderAll();
        erasedAnyInStroke = true;
      }
      return;
    }

    if (!isDrawingShape || !activeShapeObj) return;

    const pointer = movePt;
    const minX = Math.min(startX, pointer.x);
    const minY = Math.min(startY, pointer.y);
    const w = Math.max(1, Math.abs(pointer.x - startX));
    const h = Math.max(1, Math.abs(pointer.y - startY));
    const sw = Math.max(1.2, activeStrokeWidth) / z;

    if (activeTool === 'rectangle') {
      activeShapeObj.set({
        left: minX,
        top: minY,
        width: w,
        height: h,
        dirty: true
      });
      activeShapeObj.setCoords();
    } else if (activeTool === 'ellipse') {
      activeShapeObj.set({
        left: minX,
        top: minY,
        rx: w / 2,
        ry: h / 2,
        dirty: true
      });
      activeShapeObj.setCoords();
    } else if (activeTool === 'line') {
      activeShapeObj.set({
        x1: startX,
        y1: startY,
        x2: pointer.x,
        y2: pointer.y,
        dirty: true
      });
      activeShapeObj.setCoords();
    } else if (activeTool === 'arrow') {
      fCanvas.remove(activeShapeObj);
      activeShapeObj = createFabricArrow(startX, startY, pointer.x, pointer.y, activeColor, sw, z);
      fCanvas.add(activeShapeObj);
    }

    fCanvas.requestRenderAll();
  });

  fCanvas.on('mouse:up', (options) => {
    if (activeTool === 'eraser' && isScrubErasing) {
      isScrubErasing = false;
      if (erasedAnyInStroke) {
        savePageCanvasState(pageNum);
      }
      erasedAnyInStroke = false;
      return;
    }

    if (!multiTouchUsed && (activeTool === 'stamp' || activeTool === 'text')) {
      const pointer = lastPt || getFabricPointer(fCanvas, options);
      const z = pageZoomOf(fCanvas);
      const dragDistScreen = Math.hypot((pointer.x ?? startX) - startX, (pointer.y ?? startY) - startY) * z;
      if (dragDistScreen < 18) {
        const px = startX;
        const py = startY;

        if (activeTool === 'stamp') {
          const g = makeStamp(activeStamp, px, py, z);
          g.set({ id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5), pageNum });
          fCanvas.add(g);
          if (typeof g.setCoords === 'function') g.setCoords();
          fCanvas.requestRenderAll();
          savePageCanvasState(pageNum);
          return;
        }

        if (activeTool === 'text') {
          if (downTargetObj && isTextObj(downTargetObj)) {
            downTargetObj = null;
            return;
          }
          downTargetObj = null;
          openTextDialog('', (str) => {
            const liveCanvas = ensurePageDrawLayer(pageNum) || fCanvas;
            syncDrawRegion(pageNum, true);
            const liveZ = pageZoomOf(liveCanvas) || z || 1;
            const t = makeText(px, py, liveZ, str);
            t.set({
              id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              pageNum
            });
            liveCanvas.add(t);
            applyToolToFabricCanvas(liveCanvas, pageNum);
            if (typeof t.setCoords === 'function') t.setCoords();
            liveCanvas.requestRenderAll();
            savePageCanvasState(pageNum);
            window.toast && window.toast('Text page pe place ho gaya ✓');
            setTimeout(() => {
              syncDrawRegion(pageNum, true);
              liveCanvas.requestRenderAll();
            }, 140);
            setTimeout(() => {
              syncDrawRegion(pageNum, true);
              liveCanvas.requestRenderAll();
            }, 340);
          });
          return;
        }
      }
      downTargetObj = null;
      return;
    }

    if (multiTouchUsed && isDrawingShape && activeShapeObj) {
      fCanvas.remove(activeShapeObj);
      isDrawingShape = false;
      activeShapeObj = null;
      fCanvas.requestRenderAll();
      return;
    }

    if (isDrawingShape && activeShapeObj) {
      isDrawingShape = false;
      const pointer = getFabricPointer(fCanvas, options);
      const z = pageZoomOf(fCanvas);
      const dragDistScreen = Math.hypot(pointer.x - startX, pointer.y - startY) * z;

      // Ignore accidental micro-taps (< 5px on screen) so we don't leave invisible 1px shapes
      if (dragDistScreen < 5) {
        fCanvas.remove(activeShapeObj);
        activeShapeObj = null;
        fCanvas.requestRenderAll();
        return;
      }

      activeShapeObj.set({
        id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        pageNum,
        objectCaching: true,
        dirty: true
      });
      if (typeof activeShapeObj.setCoords === 'function') activeShapeObj.setCoords();

      savePageCanvasState(pageNum);
      activeShapeObj = null;
    }
  });
}

function createFabricArrow(x1, y1, x2, y2, color, strokeWidth, z = 1) {
  const LineClass = fabric.Line || fabricModule.Line;
  const TriangleClass = fabric.Triangle || fabricModule.Triangle;
  const GroupClass = fabric.Group || fabricModule.Group;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const headLength = Math.max(11 / z, strokeWidth * 3.6);

  const line = new LineClass([x1, y1, x2, y2], {
    stroke: color,
    strokeWidth: strokeWidth,
    strokeUniform: true,
    strokeLineCap: 'round',
    objectCaching: false
  });

  const triangle = new TriangleClass({
    left: x2,
    top: y2,
    originX: 'center',
    originY: 'center',
    width: headLength,
    height: headLength,
    fill: color,
    angle: angle + 90,
    objectCaching: false
  });

  if (GroupClass) {
    return new GroupClass([line, triangle], {
      selectable: false,
      evented: false,
      objectCaching: false,
      _k: 'arrow'
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
      activeObj.set({ dirty: true });
      if (typeof activeObj.setCoords === 'function') activeObj.setCoords();
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyColorToFabricObject(obj, color) {
  if (!obj) return;
  const k = obj._k || kindOf(obj);
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyColorToFabricObject(child, color));
    obj.set({ dirty: true });
    return;
  }
  if (isTextObj(obj)) {
    obj.set({ fill: color, dirty: true });
    return;
  }
  if (kindOf(obj) === 'triangle') {
    obj.set({ fill: color, dirty: true });
    return;
  }
  if (k === 'marker') {
    obj.set({ stroke: withAlpha(color, 0.38), dirty: true });
    return;
  }
  if (k === 'glow') {
    obj.set({ stroke: mixWithWhite(color, 0.55), dirty: true });
    if (obj.shadow) obj.shadow.color = color;
    return;
  }
  if (obj.stroke) obj.set('stroke', color);
  if (obj.fill && obj.fill !== 'transparent' && obj.fill !== 'none' && !String(obj.fill).startsWith('rgba(255,255,255')) {
    obj.set('fill', getFillValue(color, activeFill === 'none' ? 'rgba' : activeFill));
  }
  obj.set({ dirty: true });
}

function updateSelectedObjectStrokeWidth(width) {
  fabricCanvases.forEach((fCanvas, pNum) => {
    if (fCanvas.isDrawingMode) configureBrush(fCanvas);

    const activeObj = fCanvas.getActiveObject();
    if (activeObj) {
      const z = pageZoomOf(fCanvas);
      applyStrokeWidthToFabricObject(activeObj, width, z);
      activeObj.set({ dirty: true });
      if (typeof activeObj.setCoords === 'function') activeObj.setCoords();
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyStrokeWidthToFabricObject(obj, width, z = 1) {
  if (!obj) return;
  if (isTextObj(obj)) {
    obj.set({ fontSize: (TEXT_SIZE[width] || 20) / z, dirty: true });
    return;
  }
  if (obj._k === 'stamp') {
    const sc = (width <= 2 ? 1.0 : width <= 6 ? 1.35 : 1.8) / z;
    obj.set({ scaleX: sc, scaleY: sc, dirty: true });
    return;
  }
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyStrokeWidthToFabricObject(child, width, z));
    obj.set({ dirty: true });
    return;
  }
  if (obj._k === 'marker') {
    obj.set({ strokeWidth: (MARKER_WIDTH[width] || 16) / z, dirty: true });
  } else if ('strokeWidth' in obj && obj.stroke) {
    obj.set({ strokeWidth: Math.max(1.2, width) / z, dirty: true });
  }
}

function updateSelectedObjectFill(fill) {
  fabricCanvases.forEach((fCanvas, pNum) => {
    const activeObj = fCanvas.getActiveObject();
    if (activeObj) {
      applyFillToFabricObject(activeObj, fill);
      activeObj.set({ dirty: true });
      if (typeof activeObj.setCoords === 'function') activeObj.setCoords();
      fCanvas.requestRenderAll();
      savePageCanvasState(pNum);
    }
  });
}

function applyFillToFabricObject(obj, fill) {
  if (!obj) return;
  if (isTextObj(obj) || obj._k === 'stamp' || obj._k === 'arrow') return;
  if (['group', 'activeselection'].includes(kindOf(obj))) {
    const children = typeof obj.getObjects === 'function' ? obj.getObjects() : (obj._objects || []);
    children.forEach(child => applyFillToFabricObject(child, fill));
  } else if (kindOf(obj) !== 'path' && kindOf(obj) !== 'line') {
    obj.set({ fill, dirty: true });
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

  const KEEP = ['id', 'pageNum', '_k', 'globalCompositeOperation'];
  const jsonObj = typeof fCanvas.toObject === 'function' ? fCanvas.toObject(KEEP) : fCanvas.toJSON(KEEP);
  if (jsonObj && typeof jsonObj === 'object') {
    delete jsonObj.viewportTransform;
  }
  const jsonStr = JSON.stringify(jsonObj);

  let stack = undoStacks.get(pageNum) || [];
  if (stack.length === 0) {
    const emptyObj = { version: jsonObj.version || '7.4.0', objects: [] };
    stack.push(JSON.stringify(emptyObj));
  }

  if (stack[stack.length - 1] !== jsonStr) {
    stack.push(jsonStr);
    if (stack.length > 30) stack.shift();
    undoStacks.set(pageNum, stack);
    redoStacks.set(pageNum, []);
  }

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

    let fCanvas = (isMarkupActive || fabricCanvases.has(pageNum)) ? ensurePageDrawLayer(pageNum) : null;
    const pe = window.pageEls ? window.pageEls[pageNum] : null;

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
          if (stack.length <= 1) {
            const emptyObj = { version: fabric.version || '7.4.0', objects: [] };
            stack = [JSON.stringify(emptyObj)];
            if (drawingHasObjects(drawingRecord.json)) stack.push(drawingRecord.json);
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
      window.toast(`Undo on Page ${pageNum}`);
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
      window.toast(`Redo on Page ${pageNum}`);
    });
  }
}

export async function clearPageDrawings(pageNum) {
  const curPg = Number(pageNum || (window.State ? window.State.currentPage || 1 : 1));
  let fCanvas = fabricCanvases.get(curPg);
  if (!fCanvas) {
    fCanvas = ensurePageDrawLayer(curPg);
  }

  const objs = (fCanvas && fCanvas.getObjects) ? [...fCanvas.getObjects()] : [];
  if (objs.length === 0) {
    window.toast(`Page ${curPg} has no drawings to clear`);
    return;
  }

  if (fCanvas) {
    fCanvas.discardActiveObject();
    objs.forEach(obj => {
      try { fCanvas.remove(obj); } catch (e) {}
    });
    fCanvas.clear();
    syncDrawRegion(curPg, true);
    applyToolToFabricCanvas(fCanvas, curPg);
    fCanvas.renderAll();
    fCanvas.requestRenderAll();
  }

  // Push empty state onto undoStack instead of wiping it so Clear Page is 100% undoable!
  await savePageCanvasState(curPg);
  window.toast(`Cleared Page ${curPg} · Tap ↩ Undo to restore`);
}

// Expose globals for reader integration
window.toggleMarkupToolbar = toggleMarkupToolbar;
window.renderMarkupToolbar = renderMarkupToolbar;
window.paintDrawingsForPage = paintDrawingsForPage;
window.ensurePageDrawLayer = ensurePageDrawLayer;
window.destroyPageDrawLayer = destroyPageDrawLayer;
window.isMarkupModeActive = isMarkupModeActive;
window.syncDrawRegion = syncDrawRegion;
window.markupDebug = {
  state: () => ({ activeTool, activeColor, activeStrokeWidth, ui: { ...ui }, laserFadeMs, snapShapes, focusBand: !!focusBandEl }),
  setTool: (t) => { activeTool = t; afterToolChange(); },
  setUi: (u) => { Object.assign(ui, u); renderMarkupToolbar(); },
  canvases: () => fabricCanvases
};
