// @ts-nocheck
import { ClassroomBoard } from './classroom_board.js';
import { LessonEngine, friendlyLessonError, loadSavedLesson } from './lesson_engine.js';
import { extractNumberedSentences } from './lesson_grounding.js';

let activeClassroom = null;
let wakeLockHandle = null;

function esc(s) {
  return typeof window.escapeHtml === 'function'
    ? window.escapeHtml(String(s || ''))
    : String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function acquireClassroomWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockHandle = await navigator.wakeLock.request('screen');
  } catch {}
}

function releaseClassroomWakeLock() {
  if (wakeLockHandle) {
    try { wakeLockHandle.release().catch(() => {}); } catch {}
    wakeLockHandle = null;
  }
}

export function isClassroomOpen() {
  return Boolean(activeClassroom && document.getElementById('classroom-stage'));
}

export function closeFullClassroom() {
  openSeq++; // cancels any open that is still preparing
  if (!activeClassroom) {
    const stray = document.getElementById('classroom-stage');
    if (stray) stray.remove();
    return;
  }
  const st = activeClassroom;
  if (st.engine && st.board) {
    st.engine.saveMemory(st.board.exportSerializable());
  }
  st.engine?.destroy();
  st.board?.destroy();
  releaseClassroomWakeLock();
  try { window.screen?.orientation?.unlock?.(); } catch {}
  const el = document.getElementById('classroom-stage');
  if (el) el.remove();
  activeClassroom = null;

  if (window.State?.view === 'reader' && typeof window.leaveOuterShell === 'function') {
    window.leaveOuterShell('reader');
  } else if (typeof window.syncBottomNav === 'function') {
    window.syncBottomNav(window.State?.view || 'dashboard');
  }
}

let openSeq = 0;

/** Closes an open drawer (Back button / outside tap). Returns true when it closed one. */
export function closeClassroomDrawer() {
  const st = activeClassroom;
  if (!st || !st.activeDrawer) return false;
  const wasDoubt = st.activeDrawer === 'doubt';
  closeDrawer(st);
  if (wasDoubt) st.engine?.resume();
  return true;
}

export async function openFullClassroom({
  selectedText = '',
  pageNum = null,
  topicFocus = '',
  resumeData = null,
} = {}) {
  const mySeq = ++openSeq;
  const file = window.State?.currentFile;
  const doc = window.State?.currentDoc;
  if (!file && !resumeData) {
    window.toast?.('Open a PDF book first to start Full Classroom.');
    return;
  }

  if (window.hideSelToolbar) window.hideSelToolbar();
  if (window.Sheet?.closeImmediate) window.Sheet.closeImmediate();
  else window.Sheet?.close?.();
  if (typeof window.closeTeacherExplainer === 'function') {
    window.closeTeacherExplainer(false);
  }

  closeFullClassroom();
  openSeq = mySeq; // closeFullClassroom() bumped it; this open is still the current one
  if (typeof window.leaveOuterShell === 'function') window.leaveOuterShell('classroom');
  acquireClassroomWakeLock();

  const targetPage = resumeData?.pageNum || pageNum || window.State?.currentPage || 1;
  const totalPages = resumeData?.totalPages || window.State?.numPages || doc?.numPages || 1;
  const bookTitle = resumeData?.bookTitle || file?.name || 'Classroom Session';
  const fileId = resumeData?.fileId || file?.id || 'global';

  const savedLang = (() => {
    try { return resumeData?.language || localStorage.getItem('sayad_lesson_lang') || 'hinglish'; } catch { return 'hinglish'; }
  })();
  const savedSpeed = (() => {
    try { return Number(resumeData?.speed || localStorage.getItem('sayad_lesson_speed')) || 1.0; } catch { return 1.0; }
  })();
  const savedBoardTheme = (() => {
    try { return localStorage.getItem('sayad_board_theme') || 'chalkboard'; } catch { return 'chalkboard'; }
  })();
  const savedSubSize = (() => {
    try { return localStorage.getItem('sayad_sub_size') || 'md'; } catch { return 'md'; }
  })();
  const savedSubBg = (() => {
    try { return localStorage.getItem('sayad_sub_bg') || 'glass'; } catch { return 'glass'; }
  })();

  let sentences = resumeData?.sentences || [];
  if (!sentences.length && doc) {
    const ext = await extractNumberedSentences(doc, targetPage, fileId);
    sentences = ext.sentences;
  }

  const savedFromDb = (!selectedText && !resumeData) ? await loadSavedLesson(fileId, targetPage) : null;
  const initialSource = resumeData || savedFromDb;
  // A newer open (or an exit) happened while we were reading the page: do not build a second stage.
  if (mySeq !== openSeq) return;

  const stage = document.createElement('div');
  stage.id = 'classroom-stage';
  stage.className = `classroom-stage cr-theme-${savedBoardTheme}`;
  stage.innerHTML = buildClassroomHtml({
    bookTitle,
    pageNum: targetPage,
    lang: savedLang,
    speed: savedSpeed,
    boardTheme: savedBoardTheme,
    subSize: savedSubSize,
    subBg: savedSubBg,
  });
  document.body.appendChild(stage);

  const canvas = document.getElementById('cr-board-canvas');
  const state = {
    stage,
    board: null,
    engine: null,
    fileId,
    doc,
    bookTitle,
    pageNum: targetPage,
    totalPages,
    sentences,
    orientationMode: 'auto',
    subtitlesOn: true,
    subSize: savedSubSize,
    subBg: savedSubBg,
    activeDrawer: null,
    chromeHidden: false,
  };

  const board = new ClassroomBoard(
    canvas,
    initialSource?.boardState || { theme: savedBoardTheme },
    {
      onBoardTap: () => toggleClassroomChrome(state),
      onZoomChange: (z) => {
        const lbl = document.getElementById('cr-zoom-reset');
        if (lbl) lbl.textContent = `${Math.round((z || 1) * 100)}%`;
      },
    }
  );
  state.board = board;

  const engine = new LessonEngine({
    fileId,
    bookTitle,
    pageNum: targetPage,
    totalPages,
    chapterTitle: initialSource?.chapterTitle || `Page ${targetPage}`,
    mode: 'classroom',
    language: savedLang,
    speed: savedSpeed,
    sentences,
    meta: initialSource?.meta,
    steps: initialSource?.steps || [],
    currentStepIndex: initialSource?.currentStepIndex || 0,
    completedSteps: initialSource?.completedSteps || [],
    subtitleHistory: initialSource?.subtitleHistory || [],
    doubts: initialSource?.doubts || [],
    boardState: initialSource?.boardState || null,
    onStateChange: (status, errMsg) => {
      updateClassroomUI(state, status, errMsg);
      renderClassroomStepper(state);
    },
    onStepChange: (step, idx) => {
      board.applyStepCues(step, false);
      renderBoardDeckList(state);
      renderClassroomStepper(state);
      updateClassroomStepHeader(state, step, idx);
      renderCheckQuestionToast(state, step);
    },
    onProgress: (prog) => {
      board.setProgress(Math.max(0.02, prog));
      const bar = document.getElementById('cr-step-bar');
      if (bar) bar.style.width = `${Math.round(prog * 100)}%`;
    },
    onSubtitleTick: (words, activeIdx, fullText) => {
      renderCinematicSubtitle(state, words, activeIdx, fullText);
    },
  });

  board.onChange = () => {
    renderBoardDeckList(state);
    engine.saveMemory(board.exportSerializable());
  };

  state.engine = engine;
  activeClassroom = state;

  bindClassroomEvents(state, selectedText, topicFocus);

  if (initialSource && initialSource.steps?.length) {
    const idx = Math.min(initialSource.steps.length - 1, initialSource.currentStepIndex || 0);
    const step = initialSource.steps[idx];
    board.applyStepCues(step, true);
    updateClassroomStepHeader(state, step, idx);
    renderBoardDeckList(state);
    renderClassroomStepper(state);
    renderCinematicSubtitle(state, [], -1, step.spokenText || '');
    updateClassroomUI(state, 'paused');
    if (!initialSource.generationComplete) {
      engine.resumeRemainingChunks();
    }
    if (resumeData) {
      engine.playStep(idx);
    } else {
      window.toast?.('Resumed saved classroom session. Tap Play to continue.');
    }
  } else {
    engine.generateAndStart({ topicFocus, selectedText, autoPlay: true });
  }
}

function buildClassroomHtml({ bookTitle, pageNum, lang, speed, boardTheme, subSize, subBg }) {
  return `
    <div id="cr-top-chrome" class="cr-top-chrome">
      <header class="cr-top-bar">
        <div class="cr-top-left">
          <button type="button" id="cr-exit-btn" class="cr-squircle-btn" title="Exit Classroom" aria-label="Exit Classroom">
            ${window.icon('chevLeft', 'icon icon-sm')}
          </button>
          <div class="cr-topic-meta">
            <div class="cr-topic-title" id="cr-chapter-title">${esc(bookTitle)}</div>
            <div class="cr-topic-sub" id="cr-step-sub">Page ${pageNum} · Preparing studio board…</div>
          </div>
        </div>

        <div class="cr-top-right">
          <button type="button" id="cr-theme-btn" class="cr-mode-chip" title="Switch Chalkboard / Whiteboard">
            <span>${boardTheme === 'chalkboard' ? 'Whiteboard' : 'Chalkboard'}</span>
          </button>
          <button type="button" id="cr-orient-btn" class="cr-squircle-btn" title="Toggle Orientation (Auto / Landscape / Portrait)">
            ${window.icon('rotate', 'icon icon-sm')}
          </button>
          <button type="button" id="cr-more-btn" class="cr-squircle-btn" title="Classroom Options">
            ${window.icon('sliders', 'icon icon-sm')}
          </button>
        </div>
      </header>

      <nav id="cr-stepper" class="cr-stepper" aria-label="Lesson Concepts">
        <button type="button" class="cr-step-tab active" data-step="0">1</button>
        <button type="button" class="cr-step-tab" data-step="1" disabled>2</button>
        <button type="button" class="cr-step-tab" data-step="2" disabled>3</button>
        <button type="button" class="cr-step-tab" data-step="3" disabled>4</button>
      </nav>

      <div class="cr-step-progress-line"><div id="cr-step-bar" class="cr-step-bar-fill"></div></div>
    </div>

    <main class="cr-stage-wrap">
      <div id="cr-board-canvas" class="cr-board-canvas"></div>

      <div class="cr-board-tools" aria-label="Board drawing tools">
        <button type="button" class="cr-tool-btn active" data-tool="view" title="Scroll & Tap">Move</button>
        <button type="button" class="cr-tool-btn" data-tool="pen" title="Draw on Board">${window.icon('edit', 'icon icon-xs')}<span>Pen</span></button>
        <div id="cr-pen-colors" class="cr-pen-colors" hidden>
          <button type="button" class="cr-pen-dot active" data-pcol="amber" title="Amber Pen" aria-label="Amber Pen"></button>
          <button type="button" class="cr-pen-dot" data-pcol="teal" title="Teal Pen" aria-label="Teal Pen"></button>
          <button type="button" class="cr-pen-dot" data-pcol="coral" title="Coral Pen" aria-label="Coral Pen"></button>
          <button type="button" class="cr-pen-dot" data-pcol="cream" title="Ink Pen" aria-label="Ink Pen"></button>
        </div>
        <button type="button" class="cr-tool-btn" data-tool="eraser" title="Erase Strokes">Erase</button>
        <button type="button" id="cr-undo-btn" class="cr-tool-btn" title="Undo">${window.icon('rotateCcw', 'icon icon-xs')}</button>
        <button type="button" id="cr-clear-ink-btn" class="cr-tool-btn" title="Clear Hand Strokes">Clear</button>
        <span class="cr-tool-sep" aria-hidden="true"></span>
        <button type="button" id="cr-follow-btn" class="cr-tool-btn active" title="Auto-follow teacher pen">Follow</button>
        <button type="button" id="cr-png-btn" class="cr-tool-btn" title="Download Board PNG">${window.icon('download', 'icon icon-xs')}</button>
        <button type="button" id="cr-zoom-out" class="cr-tool-btn" title="Zoom Out">&minus;</button>
        <button type="button" id="cr-zoom-reset" class="cr-tool-btn" title="Reset Zoom">100%</button>
        <button type="button" id="cr-zoom-in" class="cr-tool-btn" title="Zoom In">+</button>
      </div>

      <div id="cr-checkin-card" class="cr-checkin-card" hidden></div>

      <button type="button" id="cr-floating-doubt" class="cr-floating-doubt">
        ${window.icon('messageSquare', 'icon icon-sm')}
        <span>Ask Doubt</span>
      </button>

      <div class="cr-board-ledge" aria-hidden="true"></div>
      <div id="cr-drawer" class="cr-drawer" hidden></div>
    </main>

    <div id="cr-bottom-chrome" class="cr-bottom-chrome">
      <!-- Non-overlapping Dedicated Cinematic Subtitle Band -->
      <div id="cr-subtitle-stage" class="cr-subtitle-stage cr-sub-size-${subSize} cr-sub-bg-${subBg}">
        <div id="cr-subtitle-text" class="cr-subtitle-text">Starting live teacher explanation…</div>
      </div>

      <footer class="cr-controls-bar">
        <div class="cr-ctrl-group cr-ctrl-left">
          <button type="button" id="cr-boards-btn" class="cr-ctrl-chip" title="Board Pages">${window.icon('grid', 'icon icon-xs')}<span id="cr-boards-lbl">1/1</span></button>
          <button type="button" id="cr-subs-btn" class="cr-ctrl-chip" title="Subtitles & History">${window.icon('fileText', 'icon icon-xs')}<span>Subs</span></button>
        </div>

        <div class="cr-ctrl-center">
          <button type="button" id="cr-prev-topic" class="cr-nav-pill" title="Previous Topic">${window.icon('chevLeft', 'icon icon-xs')}<span>Prev</span></button>
          <button type="button" id="cr-play-pause" class="cr-play-pill" title="Pause / Resume">${window.icon('pause', 'icon icon-xs')}<span>Pause</span></button>
          <button type="button" id="cr-next-topic" class="cr-nav-pill" title="Next Topic"><span>Next</span>${window.icon('chevRight', 'icon icon-xs')}</button>
        </div>

        <div class="cr-ctrl-group cr-ctrl-right">
          <button type="button" id="cr-repeat-btn" class="cr-ctrl-chip" title="Repeat Step">${window.icon('rotateCcw', 'icon icon-xs')}</button>
          <button type="button" id="cr-speed-btn" class="cr-ctrl-chip" title="Teaching Speed"><span>${speed}x</span></button>
        </div>
      </footer>
    </div>
  `;
}

function renderClassroomStepper(state) {
  const stepper = document.getElementById('cr-stepper');
  if (!stepper || !state.engine) return;
  const total = Math.max(state.engine.steps.length, state.engine.meta?.totalSteps || 4);
  const cur = state.engine.currentStepIndex;
  const genIdx = state.engine.generatingStepIndex;

  let html = '';
  for (let i = 0; i < total; i++) {
    const ready = Boolean(state.engine.steps[i]);
    const isActive = i === cur;
    const isDone = state.engine.completedSteps?.has(i);
    const isGenerating = !ready && genIdx !== null && i === genIdx;
    const canQueue = !ready && genIdx !== null;
    const failed = !ready && state.engine.chunkFailed && i === state.engine.steps.length;
    const lbl = failed ? `${i + 1} ↻` : isGenerating ? `${i + 1}…` : `${i + 1}`;
    html += `<button type="button" class="cr-step-tab ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isGenerating ? 'is-generating' : ''}" data-step="${i}" data-failed="${failed ? 1 : 0}" ${ready || canQueue || failed ? '' : 'disabled'}>${lbl}</button>`;
  }
  stepper.innerHTML = html;
  stepper.querySelectorAll('.cr-step-tab').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.step);
      if (btn.dataset.failed === '1') { window.toast?.('Trying again…'); state.engine?.retryChunks(); return; }
      state.engine?.goToStep(idx);
    };
  });
}

function updateClassroomStepHeader(state, step, idx) {
  const chEl = document.getElementById('cr-chapter-title');
  const subEl = document.getElementById('cr-step-sub');
  const total = Math.max(state.engine?.steps?.length || 1, state.engine?.meta?.totalSteps || 1);
  if (chEl && step?.title) chEl.textContent = step.title;
  if (subEl) {
    const langTag = state.engine?.language === 'hindi' ? 'हिंदी' : state.engine?.language === 'english' ? 'English' : 'Hinglish';
    const genIdx = state.engine?.generatingStepIndex;
    const genSuffix = genIdx !== null && genIdx !== undefined ? ` · Preparing ${genIdx + 1}/${total}…` : '';
    subEl.innerHTML = `Page ${state.pageNum} · Concept ${idx + 1}/${total} · <span class="cr-sub-accent">${langTag}</span>${genSuffix}`;
  }
}

function updateClassroomUI(state, status, errMsg) {
  const playBtn = document.getElementById('cr-play-pause');
  if (playBtn) {
    const playing = status === 'playing';
    playBtn.innerHTML = playing
      ? `${window.icon('pause', 'icon icon-xs')}<span>Pause</span>`
      : status === 'doubt'
      ? `${window.icon('play', 'icon icon-xs')}<span>Resume</span>`
      : `${window.icon('play', 'icon icon-xs')}<span>${status === 'ended' ? 'Replay' : 'Play'}</span>`;
  }

  if (state.engine?.activeStep) {
    updateClassroomStepHeader(state, state.engine.activeStep, state.engine.currentStepIndex);
  }

  const hasSteps = (state.engine?.steps?.length || 0) > 0;
  if (status === 'error' && !hasSteps) showClassroomError(state, errMsg);
  else hideClassroomError();
  if (status === 'error' && hasSteps && errMsg) {
    const sub = document.getElementById('cr-subtitle-text');
    if (sub) sub.textContent = friendlyLessonError(errMsg);
  }
}

function hideClassroomError() {
  const el = document.getElementById('cr-error-card');
  if (el) el.remove();
}

function showClassroomError(state, errMsg) {
  const wrap = state.stage?.querySelector('.cr-stage-wrap');
  if (!wrap) return;
  hideClassroomError();
  const sub = document.getElementById('cr-step-sub');
  if (sub) sub.textContent = `Page ${state.pageNum} · Lesson not ready`;
  const subText = document.getElementById('cr-subtitle-text');
  if (subText) subText.textContent = '';
  const card = document.createElement('div');
  card.id = 'cr-error-card';
  card.className = 'cr-error-card';
  card.setAttribute('role', 'alert');
  card.innerHTML = `
    <div class="cr-error-emoji" aria-hidden="true">${window.icon ? window.icon('messageSquare', 'icon icon-lg') : ''}</div>
    <div class="cr-error-title">Teacher couldn't start</div>
    <div class="cr-error-msg">${esc(friendlyLessonError(errMsg))}</div>
    <div class="cr-error-actions">
      <button type="button" class="cr-mini-btn" id="cr-error-exit">Back to book</button>
      <button type="button" class="cr-mini-btn cr-mini-accent" id="cr-error-retry">Try again</button>
    </div>`;
  wrap.appendChild(card);
  card.querySelector('#cr-error-exit').onclick = () => closeFullClassroom();
  card.querySelector('#cr-error-retry').onclick = () => {
    hideClassroomError();
    state.engine.generateAndStart({ topicFocus: state.engine._topicFocus, selectedText: state.engine._selectedText, autoPlay: true });
  };
}

function renderCheckQuestionToast(state, step) {
  const el = document.getElementById('cr-checkin-card');
  if (!el) return;
  if (!step?.checkQuestion) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <div class="cr-checkin-head">
      <div class="cr-checkin-title">Quick Check-in</div>
      <button type="button" id="cr-checkin-dismiss" class="cr-checkin-close" title="Dismiss" aria-label="Dismiss">&times;</button>
    </div>
    <div class="cr-checkin-q">${esc(step.checkQuestion)}</div>
    <button type="button" class="cr-checkin-ask" id="cr-checkin-reply">Answer / Ask Doubt</button>
  `;
  const btn = document.getElementById('cr-checkin-reply');
  if (btn) btn.onclick = () => openDoubtDrawer(state, `About "${step.checkQuestion}": `);
  const closeBtn = document.getElementById('cr-checkin-dismiss');
  if (closeBtn) closeBtn.onclick = () => { el.hidden = true; };
}

function renderCinematicSubtitle(state, words, activeIdx, fullText) {
  const box = document.getElementById('cr-subtitle-stage');
  const txt = document.getElementById('cr-subtitle-text');
  if (!box || !txt) return;
  box.style.display = state.subtitlesOn ? 'flex' : 'none';
  if (!state.subtitlesOn) return;

  if (!words || !words.length) {
    txt.textContent = fullText || '';
    return;
  }

  const winSize = 15;
  const center = Math.max(0, activeIdx);
  const start = Math.max(0, Math.min(words.length - winSize, center - Math.floor(winSize * 0.4)));
  const end = Math.min(words.length, start + winSize);
  const slice = words.slice(start, end);

  txt.innerHTML = slice.map((w, localI) => {
    const globalI = start + localI;
    const cls = globalI === activeIdx ? 'cr-w-active' : globalI < activeIdx ? 'cr-w-spoken' : 'cr-w-next';
    return `<span class="${cls}">${esc(w.text)}</span>`;
  }).join(' ');
}

function renderBoardDeckList(state) {
  const lbl = document.getElementById('cr-boards-lbl');
  const count = state.board?.state?.pages?.length || 1;
  const cur = (state.board?.state?.activePageIndex || 0) + 1;
  if (lbl) lbl.textContent = `${cur}/${count}`;

  if (state.activeDrawer === 'boards') {
    openBoardsDrawer(state);
  }
}

function openBoardsDrawer(state) {
  const drawer = document.getElementById('cr-drawer');
  if (!drawer) return;
  state.activeDrawer = 'boards';
  drawer.hidden = false;
  const pages = state.board.state.pages || [];
  const activeIdx = state.board.state.activePageIndex || 0;

  drawer.innerHTML = `
    <div class="cr-drawer-head">
      <div class="cr-drawer-title">Board Pages (${pages.length})</div>
      <div style="display:flex; gap:8px;">
        <button type="button" id="cr-add-board-pg" class="cr-mini-btn">+ New Page</button>
        <button type="button" id="cr-drawer-close" class="cr-icon-sm">${window.icon('x', 'icon icon-xs')}</button>
      </div>
    </div>
    <div class="cr-board-grid">
      ${pages.map((p, idx) => `
        <button type="button" class="cr-board-thumb ${idx === activeIdx ? 'active' : ''}" data-bidx="${idx}">
          <div class="cr-bt-num">Board ${idx + 1}</div>
          <div class="cr-bt-title">${esc(p.title || 'Untitled')}</div>
          <div class="cr-bt-meta">${(p.cues?.length || 0)} items · ${(p.userStrokes?.length || 0)} notes</div>
        </button>
      `).join('')}
    </div>
  `;
  document.getElementById('cr-drawer-close').onclick = () => closeDrawer(state);
  document.getElementById('cr-add-board-pg').onclick = () => {
    state.board.addBlankPage();
    openBoardsDrawer(state);
  };
  drawer.querySelectorAll('.cr-board-thumb').forEach((btn) => {
    btn.onclick = () => {
      state.board.selectPage(Number(btn.dataset.bidx));
      closeDrawer(state);
    };
  });
}

function openSubtitlesDrawer(state) {
  const drawer = document.getElementById('cr-drawer');
  if (!drawer) return;
  state.activeDrawer = 'subtitles';
  drawer.hidden = false;
  const hist = state.engine.subtitleHistory || [];

  drawer.innerHTML = `
    <div class="cr-drawer-head">
      <div class="cr-drawer-title">Subtitles & Replay History</div>
      <button type="button" id="cr-drawer-close" class="cr-icon-sm">${window.icon('x', 'icon icon-xs')}</button>
    </div>

    <div class="cr-sub-settings-grid">
      <div class="cr-set-row">
        <span>Subtitles</span>
        <button type="button" id="cr-toggle-subs" class="cr-mini-btn">${state.subtitlesOn ? 'On' : 'Off'}</button>
      </div>
      <div class="cr-set-row">
        <span>Text Size</span>
        <div class="cr-seg">
          ${['sm', 'md', 'lg'].map((s) => `<button type="button" class="cr-seg-btn ${state.subSize === s ? 'active' : ''}" data-ssize="${s}">${s.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div class="cr-set-row">
        <span>Backdrop</span>
        <div class="cr-seg">
          ${['glass', 'solid', 'minimal'].map((bg) => `<button type="button" class="cr-seg-btn ${state.subBg === bg ? 'active' : ''}" data-sbg="${bg}">${bg}</button>`).join('')}
        </div>
      </div>
      <div class="cr-set-row">
        <span>Language</span>
        <div class="cr-seg">
          ${[
            ['hinglish', 'Hinglish'],
            ['hindi', 'हिंदी'],
            ['english', 'English'],
          ].map(([k, lbl]) => `<button type="button" class="cr-seg-btn ${state.engine.language === k ? 'active' : ''}" data-slang="${k}">${lbl}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="cr-sub-hist-lbl">Tap any previous step to replay</div>
    <div class="cr-sub-history">
      ${hist.length
        ? hist.map((h) => `
          <button type="button" class="cr-sub-hist-item" data-sidx="${h.stepIndex}">
            <div class="cr-sh-step">${esc(h.title || `Step ${h.stepIndex + 1}`)}</div>
            <div class="cr-sh-txt">${esc(h.text)}</div>
          </button>
        `).join('')
        : '<div style="padding:12px; opacity:0.65; font-size:13px;">No spoken history yet.</div>'}
    </div>
  `;

  document.getElementById('cr-drawer-close').onclick = () => closeDrawer(state);
  document.getElementById('cr-toggle-subs').onclick = () => {
    state.subtitlesOn = !state.subtitlesOn;
    const subBox = document.getElementById('cr-subtitle-stage');
    if (subBox) subBox.style.display = state.subtitlesOn ? 'flex' : 'none';
    openSubtitlesDrawer(state);
  };

  drawer.querySelectorAll('[data-ssize]').forEach((b) => {
    b.onclick = () => {
      state.subSize = b.dataset.ssize;
      try { localStorage.setItem('sayad_sub_size', state.subSize); } catch {}
      const box = document.getElementById('cr-subtitle-stage');
      if (box) {
        box.classList.remove('cr-sub-size-sm', 'cr-sub-size-md', 'cr-sub-size-lg');
        box.classList.add(`cr-sub-size-${state.subSize}`);
      }
      openSubtitlesDrawer(state);
    };
  });

  drawer.querySelectorAll('[data-sbg]').forEach((b) => {
    b.onclick = () => {
      state.subBg = b.dataset.sbg;
      try { localStorage.setItem('sayad_sub_bg', state.subBg); } catch {}
      const box = document.getElementById('cr-subtitle-stage');
      if (box) {
        box.classList.remove('cr-sub-bg-glass', 'cr-sub-bg-solid', 'cr-sub-bg-minimal');
        box.classList.add(`cr-sub-bg-${state.subBg}`);
      }
      openSubtitlesDrawer(state);
    };
  });

  drawer.querySelectorAll('[data-slang]').forEach((b) => {
    b.onclick = () => {
      const lang = b.dataset.slang;
      try { localStorage.setItem('sayad_lesson_lang', lang); } catch {}
      state.engine.language = lang;
      closeDrawer(state);
      state.engine.generateAndStart({ autoPlay: true });
    };
  });

  drawer.querySelectorAll('.cr-sub-hist-item').forEach((b) => {
    b.onclick = () => {
      const idx = Number(b.dataset.sidx);
      closeDrawer(state);
      state.engine.playStep(idx);
    };
  });
}

function openDoubtDrawer(state, prefill = '') {
  const drawer = document.getElementById('cr-drawer');
  if (!drawer) return;
  state.activeDrawer = 'doubt';
  state.engine.pause('doubt');
  drawer.hidden = false;

  const doubts = state.engine.doubts || [];
  drawer.innerHTML = `
    <div class="cr-drawer-head">
      <div class="cr-drawer-title">Lesson Paused · Ask Teacher</div>
      <div style="display:flex; gap:8px;">
        <button type="button" id="cr-resume-from-doubt" class="cr-mini-btn cr-mini-accent">Resume Lesson</button>
        <button type="button" id="cr-drawer-close" class="cr-icon-sm">${window.icon('x', 'icon icon-xs')}</button>
      </div>
    </div>

    <div id="cr-doubt-list" class="cr-doubt-list">
      ${doubts.map((d) => `
        <div class="cr-doubt-card">
          <div class="cr-dq">You: ${esc(d.question)}</div>
          <div class="cr-da">${esc(d.answerSummary || d.answerSpoken || 'Pending…')}</div>
          ${d.sourceQuote ? `<div class="cr-dcite">Source (p.${state.pageNum}): “${esc(d.sourceQuote)}”</div>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="cr-doubt-input-row">
      <input id="cr-doubt-input" type="text" value="${esc(prefill)}" placeholder="Ask any doubt about the current diagram or topic…" autocomplete="off" />
      <button type="button" id="cr-doubt-send" class="btn btn-primary" style="padding:0 16px; min-height:44px;">${window.icon('send', 'icon icon-xs')}</button>
    </div>
  `;

  const closeAndResume = () => {
    closeDrawer(state);
    state.engine.resume();
  };
  document.getElementById('cr-drawer-close').onclick = closeAndResume;
  document.getElementById('cr-resume-from-doubt').onclick = closeAndResume;

  const input = document.getElementById('cr-doubt-input');
  const send = async () => {
    const q = input?.value?.trim();
    if (!q) return;
    input.value = '';
    const list = document.getElementById('cr-doubt-list');
    const card = document.createElement('div');
    card.className = 'cr-doubt-card';
    card.innerHTML = `<div class="cr-dq">You: ${esc(q)}</div><div class="cr-da">Teacher is checking the board & book…</div>`;
    list.appendChild(card);
    list.scrollTop = list.scrollHeight;

    try {
      const boardSummary = state.board.summarizeCurrentBoard();
      const d = await state.engine.askDoubt(q, boardSummary);
      const ansEl = card.querySelector('.cr-da');
      if (ansEl && d) {
        ansEl.textContent = d.answerSummary || d.answerSpoken;
        if (d.sourceQuote) {
          const cite = document.createElement('div');
          cite.className = 'cr-dcite';
          cite.textContent = `Source (p.${state.pageNum}): “${d.sourceQuote}”`;
          card.appendChild(cite);
        }
      }
      if (d?.extraBoardCues?.length) {
        state.board.addExtraCues(d.extraBoardCues, d.needsNewBoardPage, 'Doubt');
      }
      if (d?.answerSpoken) {
        await state.engine.speakAdHocText(d.answerSpoken);
      }
    } catch {
      const ansEl = card.querySelector('.cr-da');
      if (ansEl) ansEl.textContent = 'Could not answer right now. Check connection or API key.';
    }
  };

  document.getElementById('cr-doubt-send').onclick = send;
  if (input) {
    setTimeout(() => input.focus(), 60);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    };
  }
}

function openMoreMenuDrawer(state) {
  const drawer = document.getElementById('cr-drawer');
  if (!drawer) return;
  state.activeDrawer = 'menu';
  drawer.hidden = false;
  const completedCount = state.engine.completedSteps?.size || 0;
  const totalCount = state.engine.steps?.length || 1;

  drawer.innerHTML = `
    <div class="cr-drawer-head">
      <div class="cr-drawer-title">Classroom Controls</div>
      <button type="button" id="cr-drawer-close" class="cr-icon-sm">${window.icon('x', 'icon icon-xs')}</button>
    </div>
    <div class="cr-menu-actions">
      <button type="button" id="cr-m-simpler" class="cr-menu-btn">${window.icon('sparkle', 'icon icon-sm')} Re-explain Current Concept Simply</button>
      <button type="button" id="cr-m-nextpage" class="cr-menu-btn" ${state.pageNum >= state.totalPages ? 'disabled' : ''}>${window.icon('chevRight', 'icon icon-sm')} Teach Next PDF Page (p.${Math.min(state.totalPages, state.pageNum + 1)})</button>
      <button type="button" id="cr-m-exportpng" class="cr-menu-btn">${window.icon('download', 'icon icon-sm')} Save Current Board as PNG</button>
      <button type="button" id="cr-m-savenote" class="cr-menu-btn">${window.icon('note', 'icon icon-sm')} Save Lesson Notes (${completedCount}/${totalCount} done)</button>
      <button type="button" id="cr-m-exit" class="cr-menu-btn cr-menu-danger">${window.icon('x', 'icon icon-sm')} Exit Full Classroom</button>
    </div>
  `;

  document.getElementById('cr-drawer-close').onclick = () => closeDrawer(state);
  document.getElementById('cr-m-simpler').onclick = () => {
    closeDrawer(state);
    state.engine.simplifyCurrentStep();
  };
  document.getElementById('cr-m-nextpage').onclick = () => {
    if (state.pageNum < state.totalPages) {
      const nextP = state.pageNum + 1;
      closeFullClassroom();
      openFullClassroom({ pageNum: nextP });
    }
  };
  document.getElementById('cr-m-exportpng').onclick = () => {
    const slug = (state.engine?.activeStep?.title || 'classroom').replace(/[^a-z0-9]+/gi, '_').slice(0, 32);
    state.board.exportPng(`${slug}_p${state.pageNum}.png`);
    closeDrawer(state);
  };
  document.getElementById('cr-m-savenote').onclick = async () => {
    if (!window.DB || !state.fileId) return;
    const body = state.engine.steps.map((s) => `## ${s.title}\n${s.spokenText}\n${s.keyFormula ? `Formula: ${s.keyFormula}` : ''}`).join('\n\n');
    await window.DB.put('notes', {
      id: window.uid(),
      fileId: state.fileId,
      page: state.pageNum,
      quote: state.engine.chapterTitle || `Page ${state.pageNum}`,
      text: body,
      createdAt: Date.now(),
    });
    window.toast?.('Full Classroom lesson saved to Notes!');
    closeDrawer(state);
  };
  document.getElementById('cr-m-exit').onclick = () => closeFullClassroom();
}

function toggleClassroomChrome(state, forceShow) {
  if (!state?.stage) return;
  // If a drawer is open, close it cleanly first or keep chrome visible
  if (state.activeDrawer && forceShow === undefined) {
    closeDrawer(state);
    return;
  }
  const topEl = document.getElementById('cr-top-chrome');
  const botEl = document.getElementById('cr-bottom-chrome');
  if (!state.chromeHidden) {
    if (topEl && topEl.offsetHeight > 0) {
      state.stage.style.setProperty('--cr-top-h', `${topEl.offsetHeight}px`);
    }
    if (botEl && botEl.offsetHeight > 0) {
      state.stage.style.setProperty('--cr-bot-h', `${botEl.offsetHeight}px`);
    }
  }
  const nextHidden = forceShow !== undefined ? !forceShow : !state.chromeHidden;
  state.chromeHidden = nextHidden;
  state.stage.classList.toggle('cr-chrome-hidden', nextHidden);
}

function closeDrawer(state) {
  const drawer = document.getElementById('cr-drawer');
  if (drawer) drawer.hidden = true;
  state.activeDrawer = null;
}

function toggleClassroomOrientation(state) {
  const order = ['auto', 'landscape', 'portrait'];
  const next = order[(order.indexOf(state.orientationMode) + 1) % order.length];
  state.orientationMode = next;
  state.stage.classList.remove('cr-force-landscape', 'cr-force-portrait');

  if (next === 'landscape') {
    try { window.screen?.orientation?.lock?.('landscape').catch(() => {}); } catch {}
    if (window.innerHeight > window.innerWidth) {
      state.stage.classList.add('cr-force-landscape');
    }
    window.toast?.('Orientation: Landscape');
  } else if (next === 'portrait') {
    try { window.screen?.orientation?.lock?.('portrait').catch(() => {}); } catch {}
    if (window.innerWidth > window.innerHeight) {
      state.stage.classList.add('cr-force-portrait');
    }
    window.toast?.('Orientation: Portrait');
  } else {
    try { window.screen?.orientation?.unlock?.(); } catch {}
    window.toast?.('Orientation: Auto');
  }
}

function bindClassroomEvents(state, selectedText, topicFocus) {
  const engine = state.engine;
  const board = state.board;

  document.getElementById('cr-exit-btn').onclick = () => closeFullClassroom();
  document.getElementById('cr-prev-topic').onclick = () => engine.prevStep();
  document.getElementById('cr-next-topic').onclick = () => engine.nextStep();
  document.getElementById('cr-play-pause').onclick = () => engine.togglePlayPause();
  document.getElementById('cr-repeat-btn').onclick = () => engine.replayCurrentStep();

  document.getElementById('cr-theme-btn').onclick = () => {
    const nextTheme = board.state.theme === 'chalkboard' ? 'whiteboard' : 'chalkboard';
    board.setTheme(nextTheme);
    try { localStorage.setItem('sayad_board_theme', nextTheme); } catch {}
    state.stage.classList.remove('cr-theme-chalkboard', 'cr-theme-whiteboard');
    state.stage.classList.add(`cr-theme-${nextTheme}`);
    document.getElementById('cr-theme-btn').innerHTML = `<span>${nextTheme === 'chalkboard' ? 'Whiteboard' : 'Chalkboard'}</span>`;
  };

  document.getElementById('cr-orient-btn').onclick = () => toggleClassroomOrientation(state);

  document.getElementById('cr-boards-btn').onclick = () => {
    if (state.activeDrawer === 'boards') closeDrawer(state);
    else openBoardsDrawer(state);
  };
  document.getElementById('cr-subs-btn').onclick = () => {
    if (state.activeDrawer === 'subtitles') closeDrawer(state);
    else openSubtitlesDrawer(state);
  };
  document.getElementById('cr-floating-doubt').onclick = () => {
    if (state.activeDrawer === 'doubt') { closeDrawer(state); engine.resume(); }
    else openDoubtDrawer(state);
  };
  document.getElementById('cr-more-btn').onclick = () => {
    if (state.activeDrawer === 'menu') closeDrawer(state);
    else openMoreMenuDrawer(state);
  };

  const speedCycle = [0.75, 1.0, 1.25, 1.5];
  document.getElementById('cr-speed-btn').onclick = () => {
    const idx = speedCycle.indexOf(engine.speed);
    const next = speedCycle[(idx + 1) % speedCycle.length];
    engine.setSpeed(next);
    try { localStorage.setItem('sayad_lesson_speed', String(next)); } catch {}
    document.getElementById('cr-speed-btn').innerHTML = `<span>${next}x</span>`;
  };

  const penColorsEl = document.getElementById('cr-pen-colors');
  state.stage.querySelectorAll('.cr-tool-btn[data-tool]').forEach((btn) => {
    btn.onclick = () => {
      state.stage.querySelectorAll('.cr-tool-btn[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.dataset.tool;
      board.setTool(tool);
      if (penColorsEl) penColorsEl.hidden = tool !== 'pen';
    };
  });
  state.stage.querySelectorAll('.cr-pen-dot[data-pcol]').forEach((dot) => {
    dot.onclick = () => {
      state.stage.querySelectorAll('.cr-pen-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      board.setPenColor(dot.dataset.pcol);
    };
  });
  document.getElementById('cr-undo-btn').onclick = () => board.undo();
  document.getElementById('cr-clear-ink-btn').onclick = () => {
    board.clearUserStrokes();
    window.toast?.('Cleared your pen strokes on this board.');
  };
  const followBtn = document.getElementById('cr-follow-btn');
  if (followBtn) {
    followBtn.onclick = () => {
      const next = !board.autoFollow;
      board.setAutoFollow(next);
      followBtn.classList.toggle('active', next);
      window.toast?.(next ? 'Auto-follow pen: On' : 'Auto-follow pen: Off');
    };
  }
  document.getElementById('cr-png-btn').onclick = () => {
    const slug = (engine.activeStep?.title || 'classroom').replace(/[^a-z0-9]+/gi, '_').slice(0, 32);
    board.exportPng(`${slug}_p${state.pageNum}.png`);
  };
  document.getElementById('cr-zoom-out').onclick = () => board.setZoom((board.state.zoom || 1) - 0.25);
  document.getElementById('cr-zoom-reset').onclick = () => board.resetZoom();
  document.getElementById('cr-zoom-in').onclick = () => board.setZoom((board.state.zoom || 1) + 0.25);
}

window.openFullClassroom = openFullClassroom;
window.closeClassroomDrawer = closeClassroomDrawer;
window.closeFullClassroom = closeFullClassroom;
window.isClassroomOpen = isClassroomOpen;
