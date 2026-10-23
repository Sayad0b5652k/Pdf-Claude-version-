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
let activeTool = 'pen'; // 'none' | 'select' | 'pen' | 'rectangle' | 'ellipse' | 'arrow' | 'line' | 'eraser'
let activeColor = '#ef4444'; // Red default
let activeStrokeWidth = 2; // 2: Thin, 6: Medium, 12: Thick
let activeFill = 'none'; // 'none' | 'rgba' | 'solid'

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

export function toggleMarkupToolbar() {
  isMarkupActive = !isMarkupActive;
  renderMarkupToolbar();
  updateAllPageOverlayPointerEvents();

  if (isMarkupActive) {
    window.toast('Annotation tools enabled');
  } else {
    deselectAllCanvases();
    window.toast('Annotation tools closed');
  }
}

function getToolLabel(t) {
  switch (t) {
    case 'select': return 'Select / Move';
    case 'pen': return 'Pen';
    case 'rectangle': return 'Rectangle';
    case 'ellipse': return 'Circle';
    case 'arrow': return 'Arrow';
    case 'line': return 'Line';
    case 'eraser': return 'Eraser';
    default: return 'Scroll / Zoom Mode';
  }
}

export function renderMarkupToolbar() {
  let toolbarEl = document.getElementById('markup-toolbar');

  if (!isMarkupActive) {
    if (toolbarEl) toolbarEl.remove();
    return;
  }

  if (!toolbarEl) {
    toolbarEl = document.createElement('div');
    toolbarEl.id = 'markup-toolbar';
    const readerShell = document.querySelector('.view') || document.body;
    readerShell.appendChild(toolbarEl);
  }

  const curPg = Number(window.State ? window.State.currentPage || 1 : 1);
  const pageUndo = undoStacks.get(curPg) || [];
  const pageRedo = redoStacks.get(curPg) || [];

  toolbarEl.innerHTML = `
    <div class="markup-drag-handle" title="Drag to move toolbox">
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="drag-dots">⋮⋮</span>
        <span class="drag-title">Pg ${curPg}</span>
      </div>
      <span class="markup-status-badge ${activeTool === 'none' ? 'badge-pan' : 'badge-active'}">
        ${activeTool === 'none' ? '🖐️ Pan / Scroll Mode' : `${getToolLabel(activeTool)} Active`}
      </span>
    </div>

    <div class="markup-rows-grid">
      <div class="markup-tool-group">
        <button class="markup-tool-btn ${activeTool === 'select' ? 'active' : ''}" id="mtool-select" title="Select / Move / Resize (Click again to deselect)">🖐️</button>
        <button class="markup-tool-btn ${activeTool === 'pen' ? 'active' : ''}" id="mtool-pen" title="Freehand Pen (Click again to deselect)">✏️</button>
        <button class="markup-tool-btn ${activeTool === 'rectangle' ? 'active' : ''}" id="mtool-rectangle" title="Rectangle (Click again to deselect)">⬛</button>
        <button class="markup-tool-btn ${activeTool === 'ellipse' ? 'active' : ''}" id="mtool-ellipse" title="Circle (Click again to deselect)">⭕</button>
        <button class="markup-tool-btn ${activeTool === 'arrow' ? 'active' : ''}" id="mtool-arrow" title="Arrow (Click again to deselect)">➔</button>
        <button class="markup-tool-btn ${activeTool === 'line' ? 'active' : ''}" id="mtool-line" title="Line (Click again to deselect)">➖</button>
        <button class="markup-tool-btn ${activeTool === 'eraser' ? 'active' : ''}" id="mtool-eraser" title="Eraser (Click again to deselect)">🧹</button>
      </div>

      <div class="markup-divider-v"></div>

      <div class="markup-tool-group markup-right-group">
        <button class="markup-tool-btn" id="mtool-undo" title="Undo on Page ${curPg}" ${pageUndo.length <= 1 ? 'disabled style="opacity:0.35; cursor:default;"' : ''}>↩️</button>
        <button class="markup-tool-btn" id="mtool-redo" title="Redo on Page ${curPg}" ${pageRedo.length === 0 ? 'disabled style="opacity:0.35; cursor:default;"' : ''}>↪️</button>
        <button class="markup-tool-btn" id="mtool-clear-page" title="Clear Page ${curPg}">🗑️</button>
        <button class="markup-tool-btn" id="mtool-close" title="Close Toolbar" style="color:var(--danger);">✖️</button>
      </div>

      <div class="markup-swatches-group">
        ${COLOR_PALETTE.map(c => `
          <div class="markup-swatch ${activeColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-color="${c}" style="background:${c};"></div>
        `).join('')}
        <label class="markup-swatch markup-custom-swatch ${!COLOR_PALETTE.some(c => c.toLowerCase() === activeColor.toLowerCase()) ? 'active' : ''}" title="Custom Color Picker" style="position:relative; background:${!COLOR_PALETTE.some(c => c.toLowerCase() === activeColor.toLowerCase()) ? activeColor : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}; display:inline-flex; align-items:center; justify-content:center; overflow:hidden;">
          <input type="color" id="mtool-custom-color" value="${activeColor}" style="opacity:0; width:100%; height:100%; position:absolute; top:0; left:0; cursor:pointer;" />
        </label>
      </div>

      <div class="markup-divider-v"></div>

      <div class="markup-tool-group markup-right-group">
        <button class="markup-pill-btn" id="mtool-width-cycle" title="Stroke Thickness: ${activeStrokeWidth}px">
          <span class="stroke-dot stroke-w-${activeStrokeWidth <= 2 ? '2' : activeStrokeWidth <= 6 ? '6' : '12'}"></span>
          <span>${activeStrokeWidth <= 2 ? 'Thin' : activeStrokeWidth <= 6 ? 'Med' : 'Thick'}</span>
        </button>

        <button class="markup-pill-btn ${activeFill !== 'none' ? 'active' : ''}" id="mtool-fill-cycle" title="Shape Fill: ${activeFill}">
          <span>${activeFill === 'none' ? '⚪' : activeFill === 'solid' ? '🔴' : '🌓'}</span>
          <span>${activeFill === 'none' ? 'No Fill' : activeFill === 'solid' ? 'Soft' : 'Solid'}</span>
        </button>
      </div>
    </div>
  `;

  makeToolbarDraggable(toolbarEl);

  // Bind tools with toggle off / deselect logic
  ['select', 'pen', 'rectangle', 'ellipse', 'arrow', 'line', 'eraser'].forEach(tool => {
    const btn = document.getElementById(`mtool-${tool}`);
    if (btn) {
      btn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (activeTool === tool) {
          activeTool = 'none'; // Deselect active tool -> Pan / Scroll mode
        } else {
          activeTool = tool;
        }
        updateAllPageOverlayPointerEvents();
        renderMarkupToolbar();
      };
    }
  });

  // Color Swatches (Presets)
  document.querySelectorAll('.markup-swatch[data-color]').forEach(sw => {
    sw.onclick = () => {
      activeColor = sw.dataset.color;
      updateSelectedObjectColor(activeColor);
      updateAllPageOverlayPointerEvents();
      renderMarkupToolbar();
    };
  });

  // Custom Color Picker
  const customColorInput = document.getElementById('mtool-custom-color');
  if (customColorInput) {
    const handleCustomColor = (e) => {
      if (e.target.value) {
        activeColor = e.target.value;
        updateSelectedObjectColor(activeColor);
        updateAllPageOverlayPointerEvents();
        renderMarkupToolbar();
      }
    };
    customColorInput.oninput = handleCustomColor;
    customColorInput.onchange = handleCustomColor;
  }

  // Thickness
  const widthBtn = document.getElementById('mtool-width-cycle');
  if (widthBtn) {
    widthBtn.onclick = () => {
      if (activeStrokeWidth <= 2) activeStrokeWidth = 6;
      else if (activeStrokeWidth <= 6) activeStrokeWidth = 12;
      else activeStrokeWidth = 2;

      updateSelectedObjectStrokeWidth(activeStrokeWidth);
      updateAllPageOverlayPointerEvents();
      renderMarkupToolbar();
    };
  }

  // Fill
  const fillBtn = document.getElementById('mtool-fill-cycle');
  if (fillBtn) {
    fillBtn.onclick = () => {
      activeFill = activeFill === 'none' ? 'rgba' : activeFill === 'rgba' ? 'solid' : 'none';
      updateSelectedObjectFill(getFillValue(activeColor, activeFill));
      updateAllPageOverlayPointerEvents();
      renderMarkupToolbar();
    };
  }

  const undoBtn = document.getElementById('mtool-undo');
  if (undoBtn) undoBtn.onclick = () => performUndo(curPg);

  const redoBtn = document.getElementById('mtool-redo');
  if (redoBtn) redoBtn.onclick = () => performRedo(curPg);

  const clearBtn = document.getElementById('mtool-clear-page');
  if (clearBtn) clearBtn.onclick = () => clearPageDrawings(curPg);

  const closeBtn = document.getElementById('mtool-close');
  if (closeBtn) closeBtn.onclick = () => toggleMarkupToolbar();
}

function makeToolbarDraggable(toolbarEl) {
  const handle = toolbarEl.querySelector('.markup-drag-handle');
  if (!handle || handle.dataset.dragInit) return;
  handle.dataset.dragInit = 'true';

  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;

  const onPointerDown = (e) => {
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

      toolbarEl.style.left = `${Math.max(8, Math.min(window.innerWidth - toolbarEl.offsetWidth - 8, initialLeft + dx))}px`;
      toolbarEl.style.top = `${Math.max(8, Math.min(window.innerHeight - toolbarEl.offsetHeight - 8, initialTop + dy))}px`;
    };

    const onPointerUp = () => {
      isDragging = false;
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

  if (!isMarkupActive || activeTool === 'none') {
    fCanvas.isDrawingMode = false;
    fCanvas.selection = false;
    fCanvas.discardActiveObject();
    fCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
    fCanvas.requestRenderAll();
    return;
  }

  if (activeTool === 'pen') {
    fCanvas.isDrawingMode = true;
    fCanvas.selection = false;

    const PencilBrushClass = fabric.PencilBrush || fabricModule.PencilBrush;
    if (PencilBrushClass) {
      const brush = new PencilBrushClass(fCanvas);
      brush.color = activeColor;
      brush.width = activeStrokeWidth;
      fCanvas.freeDrawingBrush = brush;
    } else if (fCanvas.freeDrawingBrush) {
      fCanvas.freeDrawingBrush.color = activeColor;
      fCanvas.freeDrawingBrush.width = activeStrokeWidth;
    }

    fCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
  } else if (activeTool === 'select') {
    fCanvas.isDrawingMode = false;
    fCanvas.selection = true;
    fCanvas.forEachObject(obj => {
      obj.selectable = true;
      obj.evented = true;
      obj.hasControls = true;
      obj.hasBorders = true;
      obj.cornerColor = '#ff6a2b';
      obj.cornerStrokeColor = '#ffffff';
      obj.cornerSize = 10;
      obj.transparentCorners = false;
    });
  } else if (activeTool === 'eraser') {
    fCanvas.isDrawingMode = false;
    fCanvas.selection = false;
    fCanvas.forEachObject(obj => {
      obj.selectable = false;
      obj.evented = true;
    });
  } else {
    // Shape tools: rectangle, ellipse, arrow, line
    fCanvas.isDrawingMode = false;
    fCanvas.selection = false;
    fCanvas.forEachObject(obj => {
      obj.selectable = false;
      obj.evented = false;
    });
  }

  fCanvas.requestRenderAll();
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

  const currentScale = pe.scale || 1.0;
  const baseW = pe.nativeVp?.width || Math.round((pe.wrap.clientWidth || 600) / currentScale);
  const baseH = pe.nativeVp?.height || Math.round((pe.wrap.clientHeight || 800) / currentScale);
  const W = Math.round(baseW * currentScale);
  const H = Math.round(baseH * currentScale);

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
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '18';
    container.style.pointerEvents = (isMarkupActive && activeTool !== 'none') ? 'auto' : 'none';
    pe.wrap.appendChild(container);

    const canvasEl = document.createElement('canvas');
    canvasEl.id = `fabric-canvas-p${pageNum}`;
    container.appendChild(canvasEl);

    const CanvasClass = fabric.Canvas || fabricModule.Canvas;
    fCanvas = new CanvasClass(canvasEl, {
      width: W,
      height: H,
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

    // Apply zoom transformation to stay precisely in sync with underlying PDF page scale
    fCanvas.setZoom(currentScale);

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
  } else {
    container.setAttribute('data-tool', activeTool);
    if (fCanvas.width !== W || fCanvas.height !== H || fCanvas.getZoom() !== currentScale) {
      fCanvas.setDimensions({ width: W, height: H });
      fCanvas.setZoom(currentScale);
      fCanvas.requestRenderAll();
    }
  }

  applyToolToFabricCanvas(fCanvas, pageNum);
  return fCanvas;
}

function bindFabricCanvasEvents(fCanvas, pageNum) {
  let isDrawingShape = false;
  let activeShapeObj = null;
  let startX = 0, startY = 0;

  // Path Created (Freehand Pen)
  fCanvas.on('path:created', (e) => {
    const path = e.path;
    if (path) {
      path.set({
        id: 'draw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        pageNum
      });
      savePageCanvasState(pageNum);
    }
  });

  // Object modified (Move, Resize, Rotate)
  fCanvas.on('object:modified', () => {
    savePageCanvasState(pageNum);
  });

  // Interactive Shape Creation via Mouse / Touch Dragging
  fCanvas.on('mouse:down', (options) => {
    if (!isMarkupActive) return;

    const pointer = getFabricPointer(fCanvas, options);
    startX = pointer.x;
    startY = pointer.y;

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
    if (fCanvas.freeDrawingBrush) {
      fCanvas.freeDrawingBrush.color = color;
    }

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
  if (obj.type === 'group' || obj.type === 'activeSelection') {
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
    if (fCanvas.freeDrawingBrush) {
      fCanvas.freeDrawingBrush.width = width;
    }

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
  if (obj.type === 'group' || obj.type === 'activeSelection') {
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
  if (obj.type === 'group' || obj.type === 'activeSelection') {
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

  const jsonObj = fCanvas.toJSON(['id', 'pageNum']);
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

export async function paintDrawingsForPage(pageNum) {
  try {
    const fCanvas = ensurePageDrawLayer(pageNum);
    if (!fCanvas || !window.State || !window.State.currentFile) return;

    const pe = window.pageEls ? window.pageEls[pageNum] : null;
    const currentScale = pe?.scale || 1.0;

    let annots = [];
    try {
      annots = await window.DB.byIndex('annotations', 'fileId', window.State.currentFile.id);
    } catch (err) {
      console.warn('Error fetching annotations:', err);
      return;
    }

    const drawingRecord = annots.find(a => a.page === pageNum && a.kind === 'drawing' && a.json);

    if (drawingRecord && drawingRecord.json) {
      await safeLoadFromJSON(fCanvas, drawingRecord.json, () => {
        try {
          if (fCanvas && typeof fCanvas.setZoom === 'function') fCanvas.setZoom(currentScale);
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
        if (fCanvas && typeof fCanvas.setZoom === 'function') fCanvas.setZoom(currentScale);
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
