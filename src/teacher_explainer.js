// @ts-nocheck
import {
  extractNumberedSentences,
  locateSourceAnchor,
  paintExplainerSourceHighlight,
  clearExplainerSourceHighlights,
} from './lesson_grounding.js';
import { LessonEngine, loadSavedLesson, buildWordsForSubtitles } from './lesson_engine.js';
import { ClassroomBoard } from './classroom_board.js';

let activeExplainer = null;

function esc(s) {
  return typeof window.escapeHtml === 'function'
    ? window.escapeHtml(String(s || ''))
    : String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function buildLiveWordSpans(words, activeIdx, keyTerms = []) {
  const termSet = new Set((Array.isArray(keyTerms) ? keyTerms : []).map((t) => String(t || '').trim().toLowerCase()).filter((t) => t.length >= 3));
  return words.map((w, i) => {
    const cleanWord = w.text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
    const isTerm = cleanWord && termSet.has(cleanWord);
    const cls = [
      'exp-w',
      i === activeIdx ? 'exp-w-active' : i < activeIdx ? 'exp-w-spoken' : 'exp-w-next',
      isTerm ? 'exp-term' : '',
    ].filter(Boolean).join(' ');
    return `<span class="${cls}">${esc(w.text)}</span>`;
  }).join(' ');
}

function resolveMiniBoardTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'chalkboard' : 'whiteboard';
}

const MACRO_CUE_TYPES = new Set(['flowchart', 'cycle', 'tree', 'comparison', 'venn', 'timeline', 'barchart']);

function deriveVisualCuesForStep(step) {
  const existing = Array.isArray(step?.boardCues) ? step.boardCues : [];
  if (existing.some((c) => MACRO_CUE_TYPES.has(String(c?.type || '').toLowerCase()))) {
    return existing;
  }

  const cues = [
    { type: 'title', atProgress: 0, text: step?.title || 'Key Concept', subtitle: step?.keyFormula || '', color: 'amber' },
  ];

  const branches = [];
  const palette = ['teal', 'amber', 'mint', 'coral'];
  const icons = ['bulb', 'gear', 'book', 'leaf'];

  if (step?.keyFormula) {
    branches.push({
      title: String(step.keyFormula).slice(0, 38),
      sublabel: 'Core Formula / Rule',
      color: 'amber',
      icon: 'scale',
    });
  }
  if (Array.isArray(step?.keyTerms) && step.keyTerms.length) {
    step.keyTerms.slice(0, 3).forEach((term, idx) => {
      branches.push({
        title: String(term).slice(0, 32),
        sublabel: 'Key Concept',
        color: palette[idx % palette.length],
        icon: icons[idx % icons.length],
      });
    });
  }
  if (step?.realLifeExample && branches.length < 4) {
    branches.push({
      title: 'Real-Life Example',
      sublabel: String(step.realLifeExample).slice(0, 46),
      color: 'mint',
      icon: 'globe',
    });
  }
  if (!branches.length && existing.length) {
    existing
      .filter((c) => c.text && String(c.type || '').toLowerCase() !== 'title')
      .slice(0, 4)
      .forEach((c, idx) => {
        branches.push({
          title: String(c.text).slice(0, 34),
          sublabel: c.sublabel || '',
          color: c.color || palette[idx % palette.length],
          icon: c.icon || icons[idx % icons.length],
        });
      });
  }

  if (branches.length >= 2) {
    cues.push({
      type: 'tree',
      atProgress: 0.14,
      root: {
        title: String(step?.title || 'Concept').slice(0, 30),
        shape: 'pill',
        color: 'amber',
        icon: 'bulb',
      },
      branches,
    });
    return cues;
  }

  if (existing.length) return existing;
  return [
    ...cues,
    {
      type: 'box',
      atProgress: 0.16,
      x: 160,
      y: 210,
      w: 680,
      h: 140,
      shape: 'pill',
      text: String(step?.title || 'Concept Overview').slice(0, 44),
      sublabel: String(step?.realLifeExample || step?.spokenText || '').slice(0, 68),
      color: 'teal',
    },
  ];
}

export function isExplainerOpen() {
  return Boolean(activeExplainer && document.getElementById('explainer-dock'));
}

export function closeTeacherExplainer(preserveEngine = false) {
  clearExplainerSourceHighlights();
  const dock = document.getElementById('explainer-dock');
  if (dock) dock.remove();
  const readerView = document.querySelector('#app > .view');
  if (readerView) {
    readerView.classList.remove('sayad-split-mode', 'sayad-split-expanded');
    readerView.style.removeProperty('--exp-panel-size');
  }
  if (activeExplainer) {
    if (activeExplainer.rafMini) cancelAnimationFrame(activeExplainer.rafMini);
    activeExplainer.miniBoard?.destroy();
    if (!preserveEngine) activeExplainer.engine?.destroy();
    activeExplainer = null;
  }
}

export async function openTeacherExplainer({ selectedText = '', pageNum = null, topicFocus = '' } = {}) {
  if (!window.State?.currentDoc || !window.State?.currentFile) {
    window.toast?.('Open a PDF first to launch AI Teacher Explainer.');
    return;
  }
  if (window.hideSelToolbar) window.hideSelToolbar();
  if (window.Sheet?.closeImmediate) window.Sheet.closeImmediate();
  else window.Sheet?.close?.();

  closeTeacherExplainer(false);

  const file = window.State.currentFile;
  const doc = window.State.currentDoc;
  const targetPage = pageNum || window.State.currentPage || 1;
  const totalPages = window.State.numPages || doc.numPages || 1;
  const savedLang = (() => {
    try { return localStorage.getItem('sayad_lesson_lang') || 'hinglish'; } catch { return 'hinglish'; }
  })();
  const savedSpeed = (() => {
    try { return Number(localStorage.getItem('sayad_lesson_speed')) || 1.0; } catch { return 1.0; }
  })();

  const readerView = document.querySelector('#app > .view');
  if (!readerView) return;

  readerView.classList.add('sayad-split-mode');
  readerView.style.setProperty('--exp-panel-size', '56%');

  const dock = document.createElement('section');
  dock.id = 'explainer-dock';
  dock.className = 'explainer-dock';
  dock.setAttribute('aria-label', 'AI Teacher Explainer');
  dock.innerHTML = buildExplainerShellHtml(targetPage, savedLang, savedSpeed);
  readerView.appendChild(dock);

  const { sentences } = await extractNumberedSentences(doc, targetPage, file.id);
  const existingSaved = !selectedText ? await loadSavedLesson(file.id, targetPage) : null;

  const state = {
    engine: null,
    miniBoard: null,
    penMode: false,
    sentences,
    targetPage,
    expanded: false,
    doubtOpen: false,
    panelSizePct: 56,
    anchorByStep: new Map(),
    rafMini: null,
    lastDiagramCues: [],
    lastDiagramProgress: 0,
  };

  const engine = new LessonEngine({
    fileId: file.id,
    bookTitle: file.name,
    pageNum: targetPage,
    totalPages,
    chapterTitle: existingSaved?.chapterTitle || `Page ${targetPage}`,
    mode: 'explainer',
    language: savedLang,
    speed: savedSpeed,
    sentences,
    meta: existingSaved?.meta,
    steps: existingSaved?.steps || [],
    currentStepIndex: existingSaved?.currentStepIndex || 0,
    completedSteps: existingSaved?.completedSteps || [],
    subtitleHistory: existingSaved?.subtitleHistory || [],
    doubts: existingSaved?.doubts || [],
    boardState: existingSaved?.boardState || null,
    onStateChange: (status, errMsg) => {
      updateExplainerStatusUI(state, status, errMsg);
      renderExplainerStepper(state);
    },
    onStepChange: (step, idx) => {
      syncExplainerStep(state, step, idx);
    },
    onProgress: (prog) => {
      state.lastDiagramProgress = prog;
      if (state.miniBoard) {
        state.miniBoard.setProgress(Math.min(1, prog * 1.15));
      }
      const progBar = document.getElementById('exp-step-progress');
      if (progBar) progBar.style.width = `${Math.round(prog * 100)}%`;
    },
    onSubtitleTick: (words, activeIdx, fullText) => {
      const spokenEl = document.getElementById('exp-spoken-words');
      if (!spokenEl) return;
      const step = state.engine?.activeStep;
      const wList = words?.length ? words : buildWordsForSubtitles(fullText || step?.spokenText || '');
      if (wList.length) {
        spokenEl.innerHTML = buildLiveWordSpans(wList, activeIdx, step?.keyTerms || []);
      }
    },
  });

  state.engine = engine;
  activeExplainer = state;

  bindExplainerEvents(state, dock, readerView, selectedText, topicFocus);

  if (existingSaved && existingSaved.steps?.length) {
    const startIdx = Math.min(existingSaved.steps.length - 1, existingSaved.currentStepIndex || 0);
    syncExplainerStep(state, existingSaved.steps[startIdx], startIdx);
    updateExplainerStatusUI(state, 'paused');
    renderExplainerStepper(state);
  } else {
    engine.generateAndStart({ topicFocus, selectedText, autoPlay: true });
  }
}

function langBadgeLabel(lang) {
  if (lang === 'hindi') return 'हिंदी · Teacher';
  if (lang === 'english') return 'English · Tutor';
  return 'Hinglish · Friendly';
}

function buildExplainerShellHtml(pageNum, lang, speed) {
  return `
    <div id="exp-drag-handle" class="exp-drag-handle" title="Drag to resize">
      <span class="exp-grab-bar"></span>
    </div>

    <header class="exp-header">
      <div class="exp-head-meta">
        <div class="exp-title" id="exp-step-title">Preparing explanation…</div>
        <div class="exp-subline" id="exp-subline">
          <span id="exp-page-ref">Page ${pageNum}</span>
          <span>·</span>
          <span id="exp-ground-status">Checking PDF line</span>
          <span>·</span>
          <span id="exp-step-counter">Step –/–</span>
          <span>·</span>
          <span id="exp-lang-badge" class="exp-lang-accent">${langBadgeLabel(lang)}</span>
        </div>
      </div>
      <div class="exp-head-actions">
        <button type="button" id="exp-expand" class="exp-squircle-btn" title="Expand / Split" aria-label="Expand">${window.icon('maximize', 'icon icon-sm')}</button>
        <button type="button" id="exp-close" class="exp-squircle-btn" title="Close AI Teacher" aria-label="Close">${window.icon('x', 'icon icon-sm')}</button>
      </div>
    </header>

    <nav id="exp-stepper" class="exp-stepper" aria-label="Explanation steps">
      <button type="button" class="exp-step-tab active" data-step="0">1</button>
      <button type="button" class="exp-step-tab" data-step="1" disabled>2</button>
      <button type="button" class="exp-step-tab" data-step="2" disabled>3</button>
      <button type="button" class="exp-step-tab" data-step="3" disabled>4</button>
    </nav>

    <div class="exp-progress-track">
      <div id="exp-step-progress" class="exp-progress-fill" style="width:0%"></div>
    </div>

    <div id="exp-body" class="exp-body">
      <div class="exp-loading-state">
        <div class="skel" style="height:120px; width:100%; border-radius:16px; margin-bottom:10px;"></div>
        <div class="skel" style="height:90px; width:100%; border-radius:16px;"></div>
      </div>
    </div>

    <div id="exp-doubt-drawer" class="exp-doubt-drawer" hidden>
      <div class="exp-doubt-head">
        <span>Ask about Page ${pageNum}</span>
        <button type="button" id="exp-doubt-close" class="exp-icon-sm" aria-label="Close doubt">${window.icon('x', 'icon icon-xs')}</button>
      </div>
      <div id="exp-doubt-log" class="exp-doubt-log"></div>
      <div class="exp-doubt-form">
        <input id="exp-doubt-input" type="text" placeholder="Type your doubt here…" autocomplete="off" />
        <button type="button" id="exp-doubt-send" class="btn btn-primary exp-doubt-send">${window.icon('send', 'icon icon-xs')}</button>
      </div>
    </div>

    <footer class="exp-footer">
      <div class="exp-primary-dock">
        <button type="button" id="exp-prev" class="exp-nav-pill">${window.icon('chevLeft', 'icon icon-xs')}<span>Prev</span></button>
        <button type="button" id="exp-play" class="exp-play-pill">${window.icon('pause', 'icon icon-xs')}<span>Pause</span></button>
        <button type="button" id="exp-next" class="exp-nav-pill"><span>Next</span>${window.icon('chevRight', 'icon icon-xs')}</button>
      </div>

      <div class="exp-secondary-strip">
        <button type="button" id="exp-doubt-btn" class="exp-sec-chip">${window.icon('messageSquare', 'icon icon-xs')}<span>Doubt</span></button>
        <button type="button" id="exp-replay" class="exp-sec-chip">${window.icon('rotateCcw', 'icon icon-xs')}<span>Replay</span></button>
        <button type="button" id="exp-speed" class="exp-sec-chip"><span>${speed}x</span></button>
        <button type="button" id="exp-simpler-btn" class="exp-sec-chip">${window.icon('sparkle', 'icon icon-xs')}<span>Simpler</span></button>
        <button type="button" id="exp-export-pdf-btn" class="exp-sec-chip">${window.icon('download', 'icon icon-xs')}<span>PDF</span></button>
        <button type="button" id="exp-open-classroom-btn" class="exp-sec-chip exp-sec-teal">${window.icon('teacher', 'icon icon-xs')}<span>Full Board</span></button>
        <select id="exp-lang-select" class="exp-lang-select-chip" aria-label="Explanation Language">
          <option value="hinglish" ${lang === 'hinglish' ? 'selected' : ''}>Hinglish</option>
          <option value="hindi" ${lang === 'hindi' ? 'selected' : ''}>हिंदी</option>
          <option value="english" ${lang === 'english' ? 'selected' : ''}>English</option>
        </select>
      </div>
    </footer>
  `;
}

function renderExplainerStepper(state) {
  const stepper = document.getElementById('exp-stepper');
  if (!stepper || !state.engine) return;
  const total = Math.max(state.engine.steps.length, state.engine.meta?.totalSteps || 4);
  const cur = state.engine.currentStepIndex;

  let html = '';
  for (let i = 0; i < total; i++) {
    const ready = Boolean(state.engine.steps[i]);
    const isActive = i === cur;
    const isDone = state.engine.completedSteps?.has(i);
    html += `<button type="button" class="exp-step-tab ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}" data-step="${i}" ${ready ? '' : 'disabled'}>${i + 1}</button>`;
  }
  stepper.innerHTML = html;
  stepper.querySelectorAll('.exp-step-tab').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.step);
      if (state.engine?.steps[idx]) state.engine.playStep(idx);
    };
  });
}

function updateExplainerStatusUI(state, status, errMsg) {
  const playBtn = document.getElementById('exp-play');
  const stepCounter = document.getElementById('exp-step-counter');
  const langBadge = document.getElementById('exp-lang-badge');

  if (stepCounter && state.engine) {
    const total = Math.max(state.engine.steps.length, state.engine.meta?.totalSteps || 4);
    const cur = state.engine.steps.length ? state.engine.currentStepIndex + 1 : 0;
    stepCounter.textContent = cur ? `Step ${cur}/${total}` : 'Starting…';
  }
  if (langBadge && state.engine) {
    langBadge.textContent = status === 'loading'
      ? 'Preparing…'
      : status === 'doubt'
      ? 'Doubt Mode'
      : langBadgeLabel(state.engine.language);
  }

  if (playBtn) {
    const isPlaying = status === 'playing';
    playBtn.innerHTML = isPlaying
      ? `${window.icon('pause', 'icon icon-xs')}<span>Pause</span>`
      : `${window.icon('play', 'icon icon-xs')}<span>${status === 'ended' ? 'Replay' : 'Resume'}</span>`;
  }

  if (status === 'error' && errMsg) {
    const body = document.getElementById('exp-body');
    if (body && !state.engine?.steps?.length) {
      body.innerHTML = `
        <div class="exp-error-box">
          <div style="font-weight:700; margin-bottom:4px;">Could not start AI Teacher</div>
          <div style="font-size:13px; color:var(--text-dim); margin-bottom:12px;">${esc(errMsg)}</div>
          <button type="button" id="exp-retry-btn" class="btn btn-primary" style="padding:10px 16px;">Try Again</button>
        </div>
      `;
      const retry = document.getElementById('exp-retry-btn');
      if (retry) retry.onclick = () => state.engine?.generateAndStart({ autoPlay: true });
    }
  }
}

function syncExplainerStep(state, step, idx) {
  if (!step) return;
  const titleEl = document.getElementById('exp-step-title');
  const groundStatusEl = document.getElementById('exp-ground-status');
  const bodyEl = document.getElementById('exp-body');

  if (titleEl) titleEl.textContent = step.title || `Step ${idx + 1}`;
  renderExplainerStepper(state);

  const anchor = locateSourceAnchor(
    state.targetPage,
    step.sourceQuote,
    step.sourceSentenceIds,
    state.sentences,
    step.sourceType
  );
  state.anchorByStep.set(idx, anchor);

  if (groundStatusEl) {
    groundStatusEl.textContent = anchor.matched
      ? 'Line Highlighted'
      : anchor.reason === 'synthesis'
      ? 'Overview'
      : 'Approx. Line';
  }

  paintExplainerSourceHighlight(
    state.targetPage,
    anchor,
    step.keyTerms || [],
    idx,
    (clickedStepIdx) => state.engine?.playStep(clickedStepIdx),
    true
  );

  const visualCues = deriveVisualCuesForStep(step);
  state.lastDiagramCues = visualCues;
  const boardTheme = resolveMiniBoardTheme();

  const quoteHtml = anchor.displayQuote
    ? `<button type="button" class="exp-quote-link ${anchor.matched ? '' : 'is-uncertain'}" id="exp-jump-source" title="${anchor.matched ? 'Tap to locate highlighted line on PDF' : 'Approximate page reference'}">
         ${!anchor.matched ? `<span class="exp-uncertain-pill">${anchor.reason === 'synthesis' ? 'Overview' : 'Approx. ref'}</span>` : ''}
         <span>“${esc(anchor.displayQuote)}”</span>
       </button>`
    : '';

  const words = buildWordsForSubtitles(step.spokenText || '');

  if (bodyEl) {
    if (state.miniBoard) {
      state.miniBoard.destroy();
      state.miniBoard = null;
    }

    bodyEl.innerHTML = `
      <div class="exp-board-card ${boardTheme === 'chalkboard' ? 'is-dark-board' : ''}">
        <div id="exp-mini-board" class="exp-mini-board"></div>
        <div class="exp-board-chips">
          <button type="button" id="exp-board-pen" class="exp-board-chip ${state.penMode ? 'active' : ''}" title="Sketch / underline right on this board">
            ${window.icon('edit', 'icon icon-xs')}<span>Pen</span>
          </button>
          <button type="button" id="exp-board-undo" class="exp-board-chip" title="Undo pen stroke" ${state.penMode ? '' : 'hidden'}>
            ${window.icon('rotateCcw', 'icon icon-xs')}
          </button>
          <button type="button" id="exp-board-png" class="exp-board-chip" title="Download board as PNG">
            ${window.icon('download', 'icon icon-xs')}<span>PNG</span>
          </button>
          <button type="button" id="exp-board-note" class="exp-board-chip" title="Save explanation to Notes">
            ${window.icon('note', 'icon icon-xs')}<span>Note</span>
          </button>
        </div>
      </div>

      <div class="exp-speech-card">
        ${quoteHtml}
        <div id="exp-spoken-words" class="exp-prose">
          ${words.length ? buildLiveWordSpans(words, -1, step.keyTerms || []) : ''}
        </div>
        ${(step.keyFormula || step.realLifeExample) ? `
          <div class="exp-speech-extras">
            ${step.keyFormula ? `<div class="exp-extra-pill exp-extra-formula"><strong>Formula:</strong> ${esc(step.keyFormula)}</div>` : ''}
            ${step.realLifeExample ? `<div class="exp-extra-pill exp-extra-ex"><strong>Example:</strong> ${esc(step.realLifeExample)}</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;

    const jumpBtn = document.getElementById('exp-jump-source');
    if (jumpBtn) {
      jumpBtn.onclick = () => {
        paintExplainerSourceHighlight(state.targetPage, anchor, step.keyTerms || [], idx, null, true);
      };
    }

    requestAnimationFrame(() => {
      const miniCanvas = document.getElementById('exp-mini-board');
      if (miniCanvas) {
        const board = new ClassroomBoard(miniCanvas, { theme: boardTheme }, { compact: true });
        board.setSingleStepCues(visualCues, false);
        board.setProgress(Math.max(0.32, state.engine?.stepProgress || 0.45));
        board.setTool(state.penMode ? 'pen' : 'view');
        state.miniBoard = board;

        const penBtn = document.getElementById('exp-board-pen');
        const undoBtn = document.getElementById('exp-board-undo');
        const pngBtn = document.getElementById('exp-board-png');
        const noteBtn = document.getElementById('exp-board-note');

        if (penBtn) {
          penBtn.onclick = () => {
            state.penMode = !state.penMode;
            penBtn.classList.toggle('active', state.penMode);
            if (undoBtn) undoBtn.hidden = !state.penMode;
            state.miniBoard?.setTool(state.penMode ? 'pen' : 'view');
          };
        }
        if (undoBtn) {
          undoBtn.onclick = () => state.miniBoard?.undo();
        }
        if (pngBtn) {
          pngBtn.onclick = () => {
            const slug = (step.title || 'concept').replace(/[^a-z0-9]+/gi, '_').slice(0, 32);
            state.miniBoard?.exportPng(`${slug}_p${state.targetPage}.png`);
          };
        }
        if (noteBtn) {
          noteBtn.onclick = () => saveExplanationNote(state);
        }
      }
    });
  }

  updateExplainerStatusUI(state, state.engine?.status || 'playing');
}

async function saveExplanationNote(state) {
  const file = window.State?.currentFile;
  const step = state.engine?.activeStep;
  if (!file || !step || !window.DB) return;

  const lines = [
    `AI Teacher Explanation — ${step.title}`,
    step.sourceQuote ? `Source (p.${state.targetPage}): "${step.sourceQuote}"` : '',
    '',
    step.spokenText || '',
    step.keyFormula ? `\nFormula / Key Definition: ${step.keyFormula}` : '',
    step.realLifeExample ? `\nExample: ${step.realLifeExample}` : '',
  ].filter(Boolean).join('\n');

  await window.DB.put('notes', {
    id: window.uid(),
    fileId: file.id,
    page: state.targetPage,
    quote: step.sourceQuote || step.title,
    text: lines,
    createdAt: Date.now(),
  });
  window.toast?.('Saved explanation to Notes!');
}

async function exportExplanationToPdf(state) {
  const engine = state.engine;
  if (!engine || !engine.steps.length) {
    window.toast?.('Wait for explanation steps to finish loading.');
    return;
  }

  try {
    if (!window.PDFLib && typeof window.ensureLib === 'function') {
      await window.ensureLib('pdflib');
    }
    if (!window.PDFLib) {
      window.toast?.('PDF export library unavailable offline.');
      return;
    }
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const safeAscii = (txt) => String(txt || '').replace(/[^\x20-\x7E\n]/g, ' ');
    let page = pdfDoc.addPage([595, 842]);
    let y = 795;

    const writeWrapped = (text, size, isBold, color = rgb(0.12, 0.14, 0.17), gapAfter = 8) => {
      const f = isBold ? fontBold : font;
      const clean = safeAscii(text);
      const words = clean.split(/\s+/).filter(Boolean);
      let line = '';
      const maxW = 505;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) {
          if (y < 60) {
            page = pdfDoc.addPage([595, 842]);
            y = 795;
          }
          page.drawText(line, { x: 45, y, size, font: f, color });
          y -= size * 1.45;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) {
        if (y < 60) {
          page = pdfDoc.addPage([595, 842]);
          y = 795;
        }
        page.drawText(line, { x: 45, y, size, font: f, color });
        y -= size * 1.45;
      }
      y -= gapAfter;
    };

    writeWrapped(`${engine.bookTitle} — Page ${state.targetPage} AI Tutor Study Guide`, 16, true, rgb(0.85, 0.33, 0.05), 10);
    if (engine.meta?.topicSummary) {
      writeWrapped(engine.meta.topicSummary, 11, false, rgb(0.35, 0.4, 0.45), 14);
    }

    for (const s of engine.steps) {
      writeWrapped(`${s.stepIndex + 1}. ${s.title}`, 13, true, rgb(0.1, 0.12, 0.16), 4);
      if (s.sourceQuote) writeWrapped(`Source quote: "${s.sourceQuote}"`, 9.5, false, rgb(0.4, 0.45, 0.5), 4);
      writeWrapped(s.spokenText, 10.5, false, rgb(0.15, 0.18, 0.22), 5);
      if (s.keyFormula) writeWrapped(`Key Formula/Definition: ${s.keyFormula}`, 10.5, true, rgb(0.05, 0.45, 0.42), 5);
      if (s.realLifeExample) writeWrapped(`Example: ${s.realLifeExample}`, 10, false, rgb(0.25, 0.3, 0.35), 12);
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(engine.bookTitle || 'study').replace(/[^a-z0-9]+/gi, '_')}_p${state.targetPage}_explainer.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    window.toast?.('Exported AI Teacher Study PDF!');
  } catch (e) {
    console.error('Export Explainer PDF failed:', e);
    window.toast?.('Could not export PDF cleanly.');
  }
}

function handoffToFullClassroom(state) {
  const engine = state.engine;
  if (!engine) return;
  const snapshot = {
    fileId: engine.fileId,
    bookTitle: engine.bookTitle,
    pageNum: engine.pageNum,
    totalPages: engine.totalPages,
    chapterTitle: engine.chapterTitle,
    language: engine.language,
    speed: engine.speed,
    meta: engine.meta,
    steps: engine.steps,
    currentStepIndex: engine.currentStepIndex,
    sentences: state.sentences,
  };
  engine.pause();
  closeTeacherExplainer(false);
  if (typeof window.openFullClassroom === 'function') {
    window.openFullClassroom({ resumeData: snapshot });
  }
}

function bindExplainerEvents(state, dock, readerView, selectedText, topicFocus) {
  const engine = state.engine;

  const handle = document.getElementById('exp-drag-handle');
  if (handle) {
    let dragging = false;
    handle.onpointerdown = (e) => {
      dragging = true;
      handle.setPointerCapture?.(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if (!dragging) return;
      const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth >= 760;
      if (isLandscape) {
        const pct = Math.max(34, Math.min(70, ((window.innerWidth - e.clientX) / window.innerWidth) * 100));
        state.panelSizePct = Math.round(pct);
      } else {
        const pct = Math.max(36, Math.min(86, ((window.innerHeight - e.clientY) / window.innerHeight) * 100));
        state.panelSizePct = Math.round(pct);
      }
      readerView.style.setProperty('--exp-panel-size', `${state.panelSizePct}%`);
    };
    handle.onpointerup = () => { dragging = false; };
    handle.onpointercancel = () => { dragging = false; };
  }

  document.getElementById('exp-close').onclick = () => closeTeacherExplainer(false);
  document.getElementById('exp-prev').onclick = () => engine.prevStep();
  document.getElementById('exp-next').onclick = () => engine.nextStep();
  document.getElementById('exp-play').onclick = () => engine.togglePlayPause();
  document.getElementById('exp-replay').onclick = () => engine.replayCurrentStep();
  document.getElementById('exp-simpler-btn').onclick = () => engine.simplifyCurrentStep();
  document.getElementById('exp-export-pdf-btn').onclick = () => exportExplanationToPdf(state);
  document.getElementById('exp-open-classroom-btn').onclick = () => handoffToFullClassroom(state);

  const speedCycle = [0.75, 1.0, 1.25, 1.5];
  document.getElementById('exp-speed').onclick = () => {
    const idx = speedCycle.indexOf(engine.speed);
    const next = speedCycle[(idx + 1) % speedCycle.length];
    engine.setSpeed(next);
    try { localStorage.setItem('sayad_lesson_speed', String(next)); } catch {}
    document.getElementById('exp-speed').innerHTML = `<span>${next}x</span>`;
  };

  document.getElementById('exp-expand').onclick = () => {
    state.expanded = !state.expanded;
    readerView.classList.toggle('sayad-split-expanded', state.expanded);
    const btn = document.getElementById('exp-expand');
    if (btn) {
      btn.innerHTML = state.expanded
        ? window.icon('minimize', 'icon icon-sm')
        : window.icon('maximize', 'icon icon-sm');
    }
  };

  document.getElementById('exp-lang-select').onchange = (e) => {
    const lang = e.target.value;
    try { localStorage.setItem('sayad_lesson_lang', lang); } catch {}
    engine.language = lang;
    const badge = document.getElementById('exp-lang-badge');
    if (badge) badge.textContent = langBadgeLabel(lang);
    engine.generateAndStart({ topicFocus, selectedText, autoPlay: true });
  };

  const doubtDrawer = document.getElementById('exp-doubt-drawer');
  const doubtInput = document.getElementById('exp-doubt-input');
  const doubtLog = document.getElementById('exp-doubt-log');

  const toggleDoubt = (open) => {
    state.doubtOpen = open;
    if (doubtDrawer) doubtDrawer.hidden = !open;
    if (open) {
      engine.pause('doubt');
      setTimeout(() => doubtInput?.focus(), 60);
    }
  };

  document.getElementById('exp-doubt-btn').onclick = () => toggleDoubt(!state.doubtOpen);
  document.getElementById('exp-doubt-close').onclick = () => {
    toggleDoubt(false);
    engine.resume();
  };

  const submitDoubt = async () => {
    const q = doubtInput?.value?.trim();
    if (!q) return;
    doubtInput.value = '';
    const item = document.createElement('div');
    item.className = 'exp-doubt-entry';
    item.innerHTML = `<div class="exp-doubt-q">You: ${esc(q)}</div><div class="exp-doubt-a">Thinking…</div>`;
    doubtLog.appendChild(item);
    doubtLog.scrollTop = doubtLog.scrollHeight;

    try {
      const res = await engine.askDoubt(q, state.lastDiagramCues.map((c) => c.text || c.label).join(', '));
      const aEl = item.querySelector('.exp-doubt-a');
      if (aEl && res) {
        aEl.innerHTML = `${esc(res.answerSummary || res.answerSpoken)} ${res.sourceQuote ? `<div class="exp-doubt-cite">Source: “${esc(res.sourceQuote)}”</div>` : ''}`;
      }
      if (res?.answerSpoken) {
        await engine.speakAdHocText(res.answerSpoken);
      }
    } catch {
      const aEl = item.querySelector('.exp-doubt-a');
      if (aEl) aEl.textContent = 'Could not resolve doubt right now.';
    }
  };

  document.getElementById('exp-doubt-send').onclick = submitDoubt;
  if (doubtInput) {
    doubtInput.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submitDoubt(); }
    };
  }
}

window.openTeacherExplainer = openTeacherExplainer;
window.closeTeacherExplainer = closeTeacherExplainer;
window.isExplainerOpen = isExplainerOpen;
