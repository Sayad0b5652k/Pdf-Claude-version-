// @ts-nocheck
/* ======================================================================
   Question Paper Generator: full-screen UI.
   Screens: home (history) · build · progress · paper (preview) · attempt · result
   Generation runs in the background (see paper_engine.js); this file only
   renders state and never owns it.
   ====================================================================== */
import * as C from './paper_core.js';
import { PaperJobs, PaperStore, prepareSources, createPaperRecord, resumePaper, regenerateQuestion, gradeWrittenAnswers, reassemble } from './paper_engine.js';
import { renderPaperHtml, printPaper, PAPER_CSS } from './paper_print.js';

const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const ic = (n, c = 'icon icon-sm') => (window.icon ? window.icon(n, c) : '');
const $ = (sel, root = document) => root.querySelector(sel);
const toast = (m) => (window.toast ? window.toast(m) : console.log(m));
const LS_KEY = 'sayad_paper_cfg_v1';
const MAX_CHAPTERS = 15;

const ps = {
  screen: 'home', paperId: null, list: [], prevView: 'dashboard',
  cfg: null, chapters: null, chapterQuery: '', docInfo: null, busy: null, picker: false,
  ci: 0, altSel: {}, filter: 'all', showSrc: {}, openAns: {}, timer: null, saveT: null, unseenDone: new Set(), replacing: new Set(),
};
let unsubJobs = null;

/* ------------------------------ Helpers ------------------------------ */
const currentRec = () => (ps.paperId ? (PaperJobs.get(ps.paperId)?.rec || ps.list.find((p) => p.id === ps.paperId) || null) : null);
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
const marksStr = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
const levelName = (b, l) => (b === 'nios' ? (l === '12' ? 'Sr. Secondary' : 'Secondary') : `Class ${l}`);
const unitHasAnswer = (a, id) => a[id] !== undefined && a[id] !== '' && a[id] !== null;

function loadPrefs() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
function savePrefs() {
  const c = ps.cfg; if (!c) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ board: c.board, level: c.level, blueprintId: c.blueprintId, difficulty: c.difficulty, language: c.language, school: c.school, verify: c.verify, internalChoice: c.internalChoice })); } catch (e) {}
}

/* ------------------------------ Config ------------------------------ */
function initCfg(keep) {
  const pref = loadPrefs();
  const board = keep?.board || pref.board || 'cbse';
  const level = keep?.level || pref.level || '10';
  let bp = C.getBlueprint(keep?.blueprintId || pref.blueprintId);
  if (!bp || bp.board !== board || bp.level !== level) bp = C.blueprintsFor(board, level)[0] || C.BLUEPRINTS[0];
  ps.cfg = {
    board: bp.board, level: bp.level, blueprintId: bp.id, sections: C.cloneBlueprint(bp).sections.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, enabled: true })) })),
    difficulty: keep?.difficulty || pref.difficulty || 'balanced', language: keep?.language || pref.language || 'auto',
    internalChoice: keep?.internalChoice ?? pref.internalChoice ?? true, verify: keep?.verify ?? pref.verify ?? true,
    unseen: keep?.unseen ?? true, seen: keep?.seen ?? true, minutes: bp.minutes, title: '', school: keep?.school ?? pref.school ?? '', exam: '',
    sel: keep?.sel || new Set(), ranges: keep?.ranges || [], fileId: keep?.fileId, fileName: keep?.fileName,
  };
}
function bp() { return C.getBlueprint(ps.cfg.blueprintId); }
function pickBlueprint(id) {
  const keep = { ...ps.cfg };
  const b = C.getBlueprint(id); if (!b) return;
  ps.cfg = { ...keep, board: b.board, level: b.level, blueprintId: b.id, minutes: b.minutes, sections: C.cloneBlueprint(b).sections.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, enabled: true })) })) };
  applyToggles();
}
function applyToggles() {
  const c = ps.cfg;
  for (const s of c.sections) for (const p of s.parts) {
    let on = p.count > 0;
    if (p.unseen) on = on && c.unseen;
    if (p.type === 'extract') on = on && c.seen;
    p.enabled = on;
  }
}
function isOfficial() {
  const b = bp(), c = ps.cfg;
  if (!b) return false;
  const a = b.sections.flatMap((s) => s.parts.map((p) => [p.count, p.attempt ?? null]));
  const d = c.sections.flatMap((s) => s.parts.map((p) => [p.count, p.attempt ?? null]));
  return JSON.stringify(a) === JSON.stringify(d) && c.unseen && c.seen;
}
const isLangSubject = () => !!bp()?.language;
const hasUnseenParts = () => ps.cfg.sections.some((s) => s.parts.some((p) => p.unseen));
const hasExtractParts = () => ps.cfg.sections.some((s) => s.parts.some((p) => p.type === 'extract'));

function stepPart(sKey, pi, dir) {
  const s = ps.cfg.sections.find((x) => x.key === sKey); const p = s?.parts[pi]; if (!p) return;
  const max = p.type === 'mcq' ? 40 : C.TYPE_META[p.type]?.composite ? 8 : 30;
  p.count = Math.max(0, Math.min(max, p.count + dir));
  if (p.attempt != null) p.attempt = Math.min(p.attempt, p.count);
  if (p.or != null) p.or = Math.min(p.or, p.count);
  applyToggles();
}
function applyPreset(name) {
  const b = bp(); const fresh = C.cloneBlueprint(b).sections;
  ps.cfg.sections = fresh.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, enabled: true })) }));
  if (name === 'official') { ps.cfg.minutes = b.minutes; ps.cfg.unseen = true; ps.cfg.seen = true; applyToggles(); return; }
  const scale = (p, k, min = 1) => { p.count = Math.max(p.count > 0 ? min : 0, Math.round(p.count * k)); if (p.attempt != null) p.attempt = Math.min(p.attempt, p.count); if (p.or != null) p.or = Math.min(p.or, p.count); };
  for (const s of ps.cfg.sections) for (const p of s.parts) {
    const t = p.type;
    if (name === 'objective') { if (['mcq', 'ar', 'obj', 'fill', 'tf'].includes(t)) scale(p, 1.5); else if (t === 'grammar') scale(p, 1); else p.count = 0; if (p.type === 'mcq') p.count = Math.min(40, p.count); }
    if (name === 'short') { if (t === 'vsa' || t === 'sa') scale(p, 1.6); else if (t === 'la') scale(p, 0.5); }
    if (name === 'long') { if (t === 'la') scale(p, 2); else if (t === 'vsa' || t === 'sa') scale(p, 0.6); }
    if (name === 'mini') { if (C.TYPE_META[t]?.composite && !['case', 'passage'].includes(t)) p.count = 0; else scale(p, 0.3); if (p.type === 'case' || p.type === 'passage') p.count = Math.min(p.count, 1); }
  }
  if (name === 'mini') ps.cfg.minutes = Math.max(30, Math.round(C.totals(ps.cfg.sections).marks * 1.4));
  if (name === 'objective') ps.cfg.minutes = Math.max(30, Math.round(C.totals(ps.cfg.sections).marks * 1.1));
  applyToggles();
}

/* ------------------------------ Library / chapters ------------------------------ */
async function resolveDoc() {
  const cur = window.State?.currentFile;
  if (window.State?.currentDoc && cur) {
    ps.docInfo = { fileId: cur.id, name: cur.name, doc: window.State.currentDoc, temp: false };
    return;
  }
  ps.docInfo = null;
}
async function loadDocFor(file) {
  ps.busy = 'Opening book…'; mountSoft();
  try {
    const rec = await window.DB.get('files', file.id);
    const buf = rec ? await window.DB.normalizeBuffer(rec.data) : null;
    if (!buf) throw new Error('missing');
    const task = window.pdfjsLib.getDocument({ data: new Uint8Array(buf), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' });
    const doc = await task.promise;
    await closeTempDoc();
    ps.docInfo = { fileId: file.id, name: file.name, doc, temp: true };
    ps.cfg.fileId = file.id; ps.cfg.fileName = file.name; ps.cfg.sel = new Set(); ps.cfg.ranges = [];
    await loadChapters();
  } catch (e) {
    toast(e?.name === 'PasswordException' ? 'This PDF is password protected. Open it once in the reader first.' : 'Could not open this book.');
  }
  ps.busy = null; ps.picker = false; mountSoft();
}
async function closeTempDoc() { try { if (ps.docInfo?.temp) await ps.docInfo.doc.destroy(); } catch (e) {} if (ps.docInfo?.temp) ps.docInfo = null; }
async function loadChapters() {
  ps.chapters = null;
  const d = ps.docInfo; if (!d) return;
  try { ps.chapters = (await window.getChapterList(d.doc, d.fileId)) || []; } catch (e) { ps.chapters = []; }
  ps.cfg.fileId = d.fileId; ps.cfg.fileName = d.name;
}
function selectedChapters() {
  const list = ps.chapters || [];
  const out = [...ps.cfg.sel].sort((a, b) => a - b).map((i) => list[i]).filter(Boolean).map((c) => ({ title: c.title || c.rawTitle, startPage: c.startPage, endPage: c.endPage }));
  for (const r of ps.cfg.ranges) if (r.from && r.to) out.push({ title: `Pages ${r.from}–${r.to}`, startPage: r.from, endPage: r.to });
  return out;
}

/* ------------------------------ Navigation ------------------------------ */
export async function openPaperView(opts = {}) {
  try { window.Sheet?.closeImmediate ? window.Sheet.closeImmediate() : window.Sheet?.close?.(); } catch (e) {}
  if (window.State.view !== 'paper') ps.prevView = window.State.view || 'dashboard';
  try { window.stopReadingSession?.(); window.hideSelToolbar?.(); } catch (e) {}
  window.State.view = 'paper';
  ensurePaperCss(); syncCapsule();
  try { window.pushAppScreen?.('paper'); } catch (e) {}
  ensureSubscription();
  ps.list = await PaperStore.list();
  await resolveDoc();
  if (opts.paperId) { ps.paperId = opts.paperId; const r = currentRec(); ps.screen = r && (r.status === 'running' || r.status === 'queued') ? 'progress' : 'paper'; ps.unseenDone.delete(opts.paperId); }
  else if (opts.screen === 'home' || (!ps.docInfo && !opts.new)) { ps.screen = 'home'; }
  else { initCfg(ps.cfg && ps.cfg.fileId === ps.docInfo?.fileId ? ps.cfg : null); applyToggles(); ps.screen = 'build'; await loadChapters(); }
  mount();
}
window.openPaperView = openPaperView;

async function startNew() {
  await resolveDoc();
  initCfg(ps.cfg); applyToggles();
  ps.screen = 'build'; ps.paperId = null; mount();
  if (ps.docInfo) { await loadChapters(); mountSoft(); }
}

export function paperBack() {
  const sc = ps.screen;
  clearTimer();
  if (sc === 'attempt') { flushSave(); ps.screen = 'paper'; return mount(); }
  if (sc === 'result') { ps.screen = 'paper'; return mount(); }
  if (sc === 'paper') { ps.screen = 'home'; return mount(); }
  if (sc === 'progress') { return exitPaperView(); }
  if (sc === 'build') { if (ps.picker) { ps.picker = false; return mount(); } return ps.prevView === 'reader' || !ps.list.length ? exitPaperView() : ((ps.screen = 'home'), mount()); }
  return exitPaperView();
}
window.paperBack = paperBack;

export async function exitPaperView() {
  clearTimer();
  await closeTempDoc();
  const running = PaperJobs.runningIds();
  if (running.length) toast('Paper background me ban raha hai. Progress neeche dikhega.');
  if (ps.prevView === 'reader' && window.State.currentDoc && window.State.currentFile) {
    window.State.view = 'reader';
    try { window.pushAppScreen?.('reader'); } catch (e) {}
    window.renderReaderShell?.(); window.mountReaderContent?.();
  } else {
    window.State.view = ps.prevView && ps.prevView !== 'paper' && ps.prevView !== 'reader' ? ps.prevView : 'dashboard';
    try { window.pushAppScreen?.(window.State.view); } catch (e) {}
    window.render?.();
  }
  syncCapsule();
}
window.exitPaperView = exitPaperView;

/* ------------------------------ Mount ------------------------------ */
function clearTimer() { if (ps.timer) { clearInterval(ps.timer); ps.timer = null; } }
function mountSoft() { if (window.State.view === 'paper') mount(true); }
function mount(keepScroll = false) {
  const app = document.getElementById('app'); if (!app) return;
  const sc = app.querySelector('.pp-scroll'); const top = keepScroll && sc ? sc.scrollTop : 0;
  const prevScreen = app.firstElementChild?.dataset?.screen;
  let html = '';
  try {
    html = ({ home: homeHtml, build: buildHtml, progress: progressHtml, paper: paperHtml, attempt: attemptHtml, result: resultHtml }[ps.screen] || homeHtml)();
  } catch (e) { console.error('[Paper UI]', e); html = `<div class="pp-pad">Something went wrong while drawing this screen.<br><button class="btn btn-ghost" data-act="home">Back</button></div>`; }
  app.innerHTML = `<div class="pp-app" data-screen="${ps.screen}">${html}${ps.busy ? `<div class="pp-busy"><div class="pp-spin"></div><div>${esc(ps.busy)}</div></div>` : ''}</div>`;
  const root = app.firstElementChild;
  root.onclick = onClick; root.oninput = onInput; root.onchange = onInput;
  const n = app.querySelector('.pp-scroll');
  if (n) n.scrollTop = keepScroll && prevScreen === ps.screen ? top : 0;
  if (ps.screen === 'attempt') startTimer();
}

/* ------------------------------ Shared pieces ------------------------------ */
function topbar(title, sub, right = '') {
  return `<header class="pp-top"><button class="pp-back" data-act="back" aria-label="Back">${ic('chevLeft')}</button><div class="pp-topt"><div class="pp-topn">${esc(title)}</div>${sub ? `<div class="pp-tops">${sub}</div>` : ''}</div>${right}</header>`;
}
function statusChip(r) {
  const j = PaperJobs.isRunning(r.id);
  if (j || r.status === 'running' || r.status === 'queued') { const p = r.progress?.total ? Math.round((r.progress.done / r.progress.total) * 100) : 0; return `<span class="pp-chip pp-chip-run">${ic('zap', 'icon icon-xs')} Generating ${p}%</span>`; }
  if (r.status === 'done') return `<span class="pp-chip pp-chip-ok">Ready</span>`;
  if (r.status === 'partial') return `<span class="pp-chip pp-chip-warn">${r.missing || 0} missing</span>`;
  if (r.status === 'interrupted') return `<span class="pp-chip pp-chip-warn">Paused</span>`;
  if (r.status === 'cancelled') return `<span class="pp-chip pp-chip-warn">Stopped</span>`;
  return `<span class="pp-chip pp-chip-bad">Failed</span>`;
}

/* ============================== HOME ============================== */
function homeHtml() {
  const canNew = true;
  const rows = ps.list.map((r) => {
    const sc = r.attempt?.submittedAt ? C.scorePaper(r, r.attempt.answers, { ...(Object.fromEntries(Object.entries(r.attempt.ai || {}).map(([k, v]) => [k, v.marks]))), ...(r.attempt.self || {}) }) : null;
    const n = r.sections?.reduce((a, s) => a + s.parts.reduce((b, p) => b + p.questions.length, 0), 0) || 0;
    return `<div class="pp-hcard" data-act="open" data-id="${r.id}">
      <div class="pp-hmark">${esc((r.board || '').toUpperCase())}<small>${esc(levelName(r.board, r.level))}</small></div>
      <div class="pp-hbody"><div class="pp-hn">${esc(r.title)}</div>
        <div class="pp-hm">${marksStr(r.marks)} marks · ${n} questions · ${fmtDate(r.createdAt)}</div>
        <div class="pp-hrow">${statusChip(r)}${sc ? `<span class="pp-chip pp-chip-score">${marksStr(sc.got)}/${marksStr(sc.max)}</span>` : ''}${r.fileName ? `<span class="pp-hbook">${esc(r.fileName)}</span>` : ''}</div></div>
      <button class="pp-kebab" data-act="del" data-id="${r.id}" aria-label="Delete">${ic('trash')}</button></div>`;
  }).join('');
  return `${topbar('Question Papers', 'Board-pattern papers from your books')}
  <div class="pp-scroll"><div class="pp-pad">
    <button class="pp-hero" data-act="new"><div><div class="pp-hero-k">NEW</div><div class="pp-hero-t">Generate a board paper</div><div class="pp-hero-s">${ps.docInfo ? 'From “' + esc(ps.docInfo.name) + '”' : 'CBSE · NIOS · pick chapters from any book'}</div></div><span class="pp-hero-go">${ic('plus', 'icon')}</span></button>
    <div class="pp-sechead"><span>History</span><span class="pp-count">${ps.list.length}</span></div>
    ${rows || `<div class="pp-empty"><div class="pp-empty-mark">№</div><div>No papers yet.</div><small>Your generated papers, answers and scores are saved here.</small></div>`}
  </div></div>`;
}

/* ============================== BUILD ============================== */
function buildHtml() {
  const c = ps.cfg; const b = bp(); const t = C.totals(c.sections); const official = isOfficial();
  const levels = C.BOARDS.find((x) => x.id === c.board).levels;
  const subjects = C.blueprintsFor(c.board, c.level);
  const verifiedCls = { official: 'ok', 'official-sample': 'ok', public: 'mid', approx: 'low' }[b.verified];
  /* --- chapters block --- */
  let chap = '';
  if (ps.picker) {
    chap = bookPickerHtml();
  } else if (!ps.docInfo) {
    chap = `<div class="pp-nobook"><div>Choose the book these chapters come from.</div><button class="btn btn-primary" data-act="pickbook">${ic('book')} Choose a book</button></div>`;
  } else {
    const list = ps.chapters;
    const q = ps.chapterQuery.trim().toLowerCase();
    const rows = (list || []).map((ch, i) => ({ ch, i })).filter(({ ch }) => !q || (ch.title || '').toLowerCase().includes(q));
    chap = `<div class="pp-book">${ic('book', 'icon icon-xs')}<span>${esc(ps.docInfo.name)}</span><button class="pp-link" data-act="pickbook">Change</button></div>
      ${list === null ? '<div class="pp-note">Reading the contents…</div>' : ''}
      ${list && list.length > 6 ? `<input class="pp-search" data-in="cq" placeholder="Search chapters" value="${esc(ps.chapterQuery)}">` : ''}
      ${list && list.length ? `<div class="pp-chtools"><button class="pp-link" data-act="chall">Select all</button><button class="pp-link" data-act="chnone">Clear</button><span class="pp-grow"></span><span class="pp-count">${ps.cfg.sel.size + ps.cfg.ranges.length} selected</span></div>
      <div class="pp-chlist">${rows.map(({ ch, i }) => `<button class="pp-ch ${c.sel.has(i) ? 'on' : ''}" data-act="ch" data-i="${i}"><span class="pp-box">${c.sel.has(i) ? ic('check', 'icon icon-xs') : ''}</span><span class="pp-chn">${esc(ch.title || ch.rawTitle)}</span><span class="pp-chp">${ch.pageCount} p</span></button>`).join('') || '<div class="pp-note">No chapter matches.</div>'}</div>` : (list ? '<div class="pp-note">No chapter list was found in this PDF. Add page ranges instead.</div>' : '')}
      ${c.ranges.map((r, i) => `<div class="pp-range"><span>Pages</span><input type="number" min="1" max="${ps.docInfo.doc.numPages}" value="${r.from || ''}" data-in="rf" data-i="${i}"><span>to</span><input type="number" min="1" max="${ps.docInfo.doc.numPages}" value="${r.to || ''}" data-in="rt" data-i="${i}"><button class="pp-x" data-act="rdel" data-i="${i}">${ic('x', 'icon icon-xs')}</button></div>`).join('')}
      <button class="pp-link pp-addr" data-act="radd">+ Add a page range</button>`;
  }
  /* --- pattern --- */
  const pattern = c.sections.map((s) => `<div class="pp-psec"><div class="pp-pl"><span class="pp-pk">${esc(s.key)}</span><div><div class="pp-pt">${esc(s.title)}</div><div class="pp-ps">${esc(s.blurb || '')}</div></div></div>
    ${s.parts.map((p, pi) => {
      const off = p.enabled === false && p.count > 0;
      const meta = [`${p.marks} mark${p.marks > 1 ? 's' : ''}${p.count > 1 && !C.TYPE_META[p.type]?.composite ? ' each' : ''}`, p.attempt != null && p.attempt < p.count ? `attempt any ${p.attempt}` : '', p.or && c.internalChoice ? `${Math.min(p.or, p.count)} with OR` : '', p.topic ? p.topic.slice(0, 40) : ''].filter(Boolean).join(' · ');
      return `<div class="pp-prow ${p.count === 0 || off ? 'dim' : ''}"><div class="pp-pn"><b>${esc(C.TYPE_META[p.type]?.name || p.type)}${p.kindHint ? ` <i>(${esc(p.kindHint)})</i>` : ''}</b><small>${esc(meta)}${off ? ' · switched off below' : ''}</small></div>
        <div class="pp-step"><button data-act="dec" data-s="${esc(s.key)}" data-p="${pi}" ${p.count <= 0 || off ? 'disabled' : ''} aria-label="Fewer">−</button><b>${p.count}</b><button data-act="inc" data-s="${esc(s.key)}" data-p="${pi}" ${off ? 'disabled' : ''} aria-label="More">+</button></div></div>`;
    }).join('')}</div>`).join('');
  const total = ps.cfg.sel.size + ps.cfg.ranges.filter((r) => r.from && r.to).length;
  const reason = !total ? 'Select at least one chapter' : !t.questions ? 'Add some questions to the pattern' : '';
  return `${topbar('New paper', ps.docInfo ? esc(ps.docInfo.name) : 'Pick a book and chapters', ps.list.length ? `<button class="pp-link pp-toplink" data-act="home">History · ${ps.list.length}</button>` : '')}
  <div class="pp-scroll"><div class="pp-pad pp-build">
    ${PaperJobs.runningIds().length ? `<button class="pp-banner" data-act="openrun">${ic('zap', 'icon icon-xs')} A paper is being generated. Tap to view.</button>` : ''}

    <section class="pp-card"><div class="pp-stepno">01</div><h3>Exam</h3>
      <div class="pp-seg">${C.BOARDS.map((x) => `<button class="${c.board === x.id ? 'on' : ''}" data-act="board" data-v="${x.id}">${x.name}</button>`).join('')}</div>
      <div class="pp-seg pp-seg-sm">${levels.map((l) => `<button class="${c.level === l.id ? 'on' : ''}" data-act="level" data-v="${l.id}">${l.name}</button>`).join('')}</div>
      <div class="pp-subjects">${subjects.map((x) => `<button class="pp-subj ${x.id === c.blueprintId ? 'on' : ''}" data-act="subject" data-v="${x.id}">${esc(x.subject)}</button>`).join('')}</div>
      <div class="pp-pattern"><div class="pp-pat-main"><b>${marksStr(b.marks)}</b> marks <i>·</i> <b>${b.minutes >= 60 ? (b.minutes / 60) + '</b> hr' : b.minutes + '</b> min'} <i>·</i> <b>${C.totals(b.sections).questions}</b> questions</div>
        <div class="pp-pat-src ${verifiedCls}"><span class="pp-dot"></span>${esc(C.VERIFIED_LABEL[b.verified])}</div></div>
    </section>

    <section class="pp-card"><div class="pp-stepno">02</div><h3>Chapters <small>pick one or many</small></h3>${chap}</section>

    <section class="pp-card"><div class="pp-stepno">03</div><h3>Paper pattern <span class="pp-badge ${official ? 'ok' : 'warn'}">${official ? 'Official' : 'Custom'}</span></h3>
      <div class="pp-presets">${[['official', 'Official'], ['short', 'More short'], ['long', 'More long'], ['objective', 'Objective only'], ['mini', 'Mini test']].map(([k, l]) => `<button class="pp-pre" data-act="preset" data-v="${k}">${l}</button>`).join('')}</div>
      ${pattern}
    </section>

    <section class="pp-card"><div class="pp-stepno">04</div><h3>Options</h3>
      <div class="pp-opt"><div><b>Difficulty</b><small>Mix of easy, average and hard questions</small></div></div>
      <div class="pp-seg pp-seg-sm">${[['easy', 'Easy'], ['balanced', 'Balanced'], ['hard', 'Hard']].map(([k, l]) => `<button class="${c.difficulty === k ? 'on' : ''}" data-act="diff" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="pp-opt"><div><b>Paper language</b><small>Auto follows the book</small></div></div>
      <div class="pp-seg pp-seg-sm">${[['auto', 'Auto'], ['en', 'English'], ['hi', 'हिन्दी']].map(([k, l]) => `<button class="${c.language === k ? 'on' : ''}" data-act="lang" data-v="${k}">${l}</button>`).join('')}</div>
      ${isLangSubject() && hasUnseenParts() ? toggleRow('unseen', 'Unseen passages', 'AI-written original passages with comprehension questions', c.unseen) : ''}
      ${isLangSubject() && hasExtractParts() ? toggleRow('seen', 'Extracts from your book', 'Reference-to-context questions on real text from the chapters', c.seen) : ''}
      ${toggleRow('choice', 'Internal choice (OR)', 'Adds an alternative question where the board pattern has one', c.internalChoice)}
      ${toggleRow('verify', 'Double-check every answer', 'A second AI pass re-solves each question and drops doubtful ones', c.verify)}
      <div class="pp-opt pp-time"><div><b>Duration</b><small>Shown on the paper</small></div><div class="pp-step"><button data-act="mins" data-v="-15">−</button><b>${c.minutes} min</b><button data-act="mins" data-v="15">+</button></div></div>
      <details class="pp-more"><summary>Header details (optional)</summary>
        <input class="pp-search" data-in="school" placeholder="School / institute name" value="${esc(c.school)}">
        <input class="pp-search" data-in="exam" placeholder="Exam name, e.g. Half Yearly Examination" value="${esc(c.exam)}">
        <input class="pp-search" data-in="title" placeholder="Paper title (for history)" value="${esc(c.title)}"></details>
    </section>
  </div></div>
  <footer class="pp-foot"><div class="pp-ft"><b>${marksStr(t.marks)}</b> marks<small>${t.questions} questions · ${c.minutes} min</small></div>
    <button class="btn btn-primary pp-go" data-act="generate" ${reason ? 'data-off="1"' : ''}>${ic('sparkle')} ${reason ? esc(reason) : 'Generate paper'}</button></footer>`;
}
function toggleRow(key, title, sub, on) {
  return `<div class="pp-opt pp-tg" data-act="tg" data-k="${key}" role="switch" aria-checked="${on}"><div><b>${title}</b><small>${sub}</small></div><span class="pp-sw ${on ? 'on' : ''}"><i></i></span></div>`;
}
function bookPickerHtml() {
  const files = (window.State.files || []).slice().sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
  return `<div class="pp-pick"><button class="pp-link" data-act="back">Cancel</button>${files.length ? files.map((f) => `<button class="pp-pickrow" data-act="usebook" data-id="${esc(f.id)}">${ic('book', 'icon icon-sm')}<span>${esc(f.name)}</span></button>`).join('') : '<div class="pp-note">Your library is empty. Add a PDF first.</div>'}</div>`;
}

/* ============================== PROGRESS ============================== */
const TIPS = ['Every answer is checked by a second pass before it reaches your paper.', 'Questions are written fresh. Lines from the book are never copied.', 'You can leave this screen. The paper keeps generating in the background.', 'Each question stores the book page it came from, so you can check it.', 'Questions are spread across all selected chapters.'];
function progressHtml() {
  const r = currentRec(); if (!r) { ps.screen = 'home'; return homeHtml(); }
  const running = PaperJobs.isRunning(r.id) || r.status === 'running' || r.status === 'queued';
  const total = r.progress?.total || 1; const done = r.progress?.done || 0; const pct = Math.min(100, Math.round((done / total) * 100));
  const bySec = {};
  for (const t of r.tasks) { const k = t.section; const s = (bySec[k] ||= { need: 0, got: 0, title: r.config.sections.find((x) => x.key === k)?.title || k }); s.need += t.count; s.got += (r.results[t.id] || []).length; }
  const circ = 2 * Math.PI * 52;
  return `${topbar(r.title, esc(r.subject))}
  <div class="pp-scroll"><div class="pp-pad pp-prog">
    <div class="pp-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/></svg><div class="pp-ringn"><b>${running ? pct : r.status === 'done' ? '✓' : pct}</b>${running || r.status !== 'done' ? '<small>%</small>' : ''}</div></div>
    <div class="pp-progl">${running ? esc(r.progress?.label || 'Preparing…') : r.status === 'done' ? 'Your paper is ready' : r.status === 'partial' ? 'Paper ready with a few gaps' : r.status === 'cancelled' ? 'Stopped' : r.status === 'interrupted' ? 'Paused when the app was closed' : 'Generation failed'}</div>
    ${running ? `<div class="pp-tip">${esc(TIPS[(done + total) % TIPS.length])}</div>` : ''}
    ${r.error ? `<div class="pp-err">${esc(r.error)}</div>` : ''}
    <div class="pp-secprog">${Object.entries(bySec).map(([k, s]) => `<div class="pp-sp"><span class="pp-pk">${esc(k)}</span><div class="pp-spb"><div class="pp-sptitle">${esc(s.title)}<span>${s.got}/${s.need}</span></div><div class="pp-bar"><i style="width:${s.need ? Math.round((s.got / s.need) * 100) : 0}%"></i></div></div></div>`).join('')}</div>
    <div class="pp-actions">${running ? `<button class="btn btn-primary" data-act="bg">Keep reading, run in background</button><button class="btn btn-ghost" data-act="cancel">Stop</button>`
      : r.status === 'done' || r.status === 'partial' ? `<button class="btn btn-primary" data-act="viewpaper">Open paper</button>${r.status === 'partial' ? '<button class="btn btn-ghost" data-act="resume">Generate missing</button>' : ''}`
      : `<button class="btn btn-primary" data-act="resume">Try again</button><button class="btn btn-ghost" data-act="home">History</button>`}</div>
  </div></div>`;
}

/* ============================== PAPER (preview) ============================== */
function paperHtml() {
  const r = currentRec(); if (!r) { ps.screen = 'home'; return homeHtml(); }
  const running = PaperJobs.isRunning(r.id);
  const n = r.sections.reduce((a, s) => a + s.parts.reduce((b, p) => b + p.questions.length, 0), 0);
  const v = r.stats?.verifiedCount;
  const at = r.attempt || {};
  const sc = at.submittedAt ? C.scorePaper(r, at.answers, mergedSelf(r)) : null;
  return `${topbar(r.title, `${esc(r.subject)} · ${marksStr(r.marks)} marks`)}
  <div class="pp-scroll"><div class="pp-pad">
    <div class="pp-sumrow"><div class="pp-stat"><b>${n}</b><small>questions</small></div><div class="pp-stat"><b>${marksStr(r.marks)}</b><small>marks</small></div><div class="pp-stat"><b>${r.minutes}</b><small>minutes</small></div>${v && v.checkable ? `<div class="pp-stat ok"><b>${v.verified}/${v.checkable}</b><small>answers verified</small></div>` : ''}</div>
    ${r.missing ? `<div class="pp-warn"><div><b>${r.missing} question${r.missing > 1 ? 's' : ''} missing.</b> The AI could not produce enough valid questions for some parts.</div><button class="btn btn-ghost" data-act="resume" ${running ? 'disabled' : ''}>Generate missing</button></div>` : ''}
    ${running ? `<button class="pp-banner" data-act="progress">${ic('zap', 'icon icon-xs')} Still generating. Tap for progress.</button>` : ''}
    <div class="pp-actions pp-actions3"><button class="btn btn-primary" data-act="attempt">${ic('play', 'icon icon-sm')} ${at.submittedAt ? 'Attempt again' : at.startedAt ? 'Continue attempt' : 'Attempt online'}</button><button class="btn btn-ghost" data-act="download">${ic('upload', 'icon icon-sm')} Download</button></div>
    ${sc ? `<button class="pp-lastscore" data-act="result"><span>Last attempt</span><b>${marksStr(sc.got)} / ${marksStr(sc.max)}</b><span>View result ›</span></button>` : ''}
    <div class="pp-sheetwrap"><div class="pp-sheet pp-onscreen">${renderPaperHtml(r, { controls: true })}</div></div>
    <div class="pp-hint">Tap ↻ beside a question to replace it with a fresh one.</div>
    <button class="pp-link pp-dangerlink" data-act="del" data-id="${r.id}">Delete this paper</button>
  </div></div>`;
}
const mergedSelf = (r) => ({ ...Object.fromEntries(Object.entries(r.attempt?.ai || {}).map(([k, v]) => [k, v.marks])), ...(r.attempt?.self || {}) });

/* ============================== ATTEMPT ============================== */
function cardsOf(r) {
  const out = [];
  for (const s of r.sections) for (const p of s.parts) for (const q of p.questions) out.push({ no: q.no, sec: s.key, secTitle: s.title, part: p, q });
  return out;
}
function unitsFor(card, which) {
  const q = which === 'alt' && card.q.alt ? { ...card.q.alt } : card.q;
  const suffix = which === 'alt' ? 'o' : '';
  if (q.items?.length) return q.items.map((it, i) => ({ id: `${card.no}${suffix}.${i + 1}`, q: it }));
  return [{ id: `${card.no}${suffix}`, q }];
}
function attemptHtml() {
  const r = currentRec(); if (!r) { ps.screen = 'home'; return homeHtml(); }
  const cards = cardsOf(r); if (!cards.length) { ps.screen = 'paper'; return paperHtml(); }
  ps.ci = Math.max(0, Math.min(ps.ci, cards.length - 1));
  const card = cards[ps.ci]; const at = r.attempt;
  const which = card.q.alt ? (ps.altSel[card.no] || 'main') : 'main';
  const q = which === 'alt' ? card.q.alt : card.q;
  const answered = cards.filter((c) => unitsFor(c, 'main').concat(c.q.alt ? unitsFor(c, 'alt') : []).some((u) => unitHasAnswer(at.answers, u.id))).length;
  const secKeys = [...new Set(cards.map((c) => c.sec))];
  const flagged = !!at.flags[card.no];
  const meta = C.TYPE_META[card.q.type] || {};
  return `<header class="pp-top pp-top-att"><button class="pp-back" data-act="back">${ic('chevLeft')}</button><div class="pp-topt"><div class="pp-topn">${esc(r.subject)}</div><div class="pp-tops"><span id="pp-clock">${fmtTime(at.elapsed || 0)}</span> · ${answered}/${cards.length} answered</div></div><button class="btn btn-primary pp-submit" data-act="submit">Submit</button></header>
  <div class="pp-secbar no-scrollbar">${secKeys.map((k) => `<button class="${k === card.sec ? 'on' : ''}" data-act="secjump" data-v="${esc(k)}">${esc(k)}</button>`).join('')}<span class="pp-grow"></span><button class="pp-pal" data-act="palette">${ic('grid', 'icon icon-sm')} ${ps.ci + 1}/${cards.length}</button></div>
  <div class="pp-scroll pp-attscroll"><div class="pp-pad">
    <article class="pp-qcard">
      <div class="pp-qhead"><span class="pp-qno">Q${card.no}</span><span class="pp-qtag">${esc(meta.name || '')}</span><span class="pp-qmarks">${marksStr(card.q.marks)} mark${card.q.marks > 1 ? 's' : ''}</span><button class="pp-flag ${flagged ? 'on' : ''}" data-act="flag" aria-label="Mark for review">${ic('bookmark', 'icon icon-sm')}</button></div>
      ${card.part.attempt && card.part.attempt < card.part.count ? `<div class="pp-qnote">Attempt any ${card.part.attempt} of ${card.part.count} in this group</div>` : ''}
      ${card.q.alt ? `<div class="pp-altsw"><button class="${which === 'main' ? 'on' : ''}" data-act="altsel" data-v="main">Question</button><button class="${which === 'alt' ? 'on' : ''}" data-act="altsel" data-v="alt">OR alternative</button></div>` : ''}
      ${attemptBody(q, unitsFor(card, which), at)}
    </article>
  </div></div>
  <footer class="pp-nav"><button class="btn btn-ghost" data-act="prev" ${ps.ci === 0 ? 'disabled' : ''}>${ic('chevLeft')} Prev</button><button class="btn btn-primary" data-act="next" ${ps.ci === cards.length - 1 ? 'disabled' : ''}>Next ${ic('chevRight')}</button></footer>`;
}
function attemptBody(q, units, at) {
  const sub = (u, label) => `<div class="pp-asub">${label ? `<div class="pp-asubh"><b>${label}</b><span class="pp-qmarks">${marksStr(u.q.marks)}</span></div>` : ''}<div class="pp-aq">${esc(u.q.q).replace(/\n/g, '<br>')}</div>${inputFor(u, at)}</div>`;
  if (q.items?.length) {
    const head = q.type === 'passage' || q.type === 'case' ? `${q.title ? `<div class="pp-ptitle">${esc(q.title)}</div>` : ''}<div class="pp-apass">${esc(q.passage).replace(/\n/g, '<br>')}</div>${q.dataTable ? dataTableHtml(q.dataTable) : ''}`
      : q.type === 'extract' ? `<div class="pp-apass pp-aext">${esc(q.passage)}</div>` : q.type === 'map' ? '<div class="pp-qnote">Identify / locate the following on an outline map. Write where each one lies.</div>' : '';
    return head + units.map((u, i) => sub(u, `(${['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'][i] || i + 1})`)).join('');
  }
  return sub(units[0], '');
}
function dataTableHtml(txt) {
  const rows = String(txt || '').split('\n').map((x) => x.trim()).filter(Boolean).filter((r) => !/^[\s|:-]+$/.test(r));
  if (rows.length < 2 || !rows.some((r) => r.includes('|'))) return `<div class="pp-apass">${esc(txt)}</div>`;
  return `<div class="pp-tbl-wrap"><table class="pp-tbl">${rows.map((r, i) => `<tr>${r.replace(/^\||\|$/g, '').split('|').map((c) => `<${i ? 'td' : 'th'}>${esc(c.trim())}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table></div>`;
}
function inputFor(u, at) {
  const v = at.answers[u.id]; const q = u.q;
  if (q.type === 'mcq' || q.type === 'ar') return `<div class="pp-aopts">${q.options.map((o, i) => `<button class="pp-aopt ${v === i ? 'on' : ''}" data-act="pick" data-u="${esc(u.id)}" data-i="${i}"><span class="pp-aletter">${'ABCD'[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>`;
  if (q.type === 'tf') return `<div class="pp-tfrow">${[[true, 'True'], [false, 'False']].map(([val, l]) => `<button class="pp-aopt pp-tfb ${v === val ? 'on' : ''}" data-act="pickbool" data-u="${esc(u.id)}" data-v="${val}">${l}</button>`).join('')}</div>`;
  const short = q.type === 'fill' || q.type === 'map' || q.type === 'grammar' || ((q.type === 'vsa' || q.type === 'short') && q.marks <= 1);
  if (short) return `<input class="pp-ain" data-in="ans" data-u="${esc(u.id)}" placeholder="Your answer" value="${esc(v || '')}" autocomplete="off" autocapitalize="off">`;
  const lim = parseInt(String(q.words || '').split(/[-–~]/).pop(), 10) || 0;
  return `<textarea class="pp-ata" data-in="ans" data-u="${esc(u.id)}" rows="${q.marks >= 5 ? 9 : q.marks >= 3 ? 6 : 4}" placeholder="Write your answer here">${esc(v || '')}</textarea><div class="pp-wc" data-wc="${esc(u.id)}">${wordCount(v)} words${lim ? ` · about ${esc(q.words)}` : ''}</div>`;
}
const wordCount = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);

function startTimer() {
  clearTimer();
  const r = currentRec(); if (!r) return;
  if (!r.attempt.startedAt) { r.attempt.startedAt = Date.now(); scheduleSave(); }
  ps.timer = setInterval(() => {
    const rr = currentRec(); if (!rr || ps.screen !== 'attempt') return clearTimer();
    rr.attempt.elapsed = (rr.attempt.elapsed || 0) + 1;
    const el = $('#pp-clock'); if (el) el.textContent = fmtTime(rr.attempt.elapsed);
    if (rr.attempt.elapsed % 15 === 0) scheduleSave();
  }, 1000);
}
function scheduleSave() { clearTimeout(ps.saveT); ps.saveT = setTimeout(flushSave, 700); }
function flushSave() { clearTimeout(ps.saveT); const r = currentRec(); if (r) PaperStore.save(r); }

/* ============================== RESULT ============================== */
function resultHtml() {
  const r = currentRec(); if (!r) { ps.screen = 'home'; return homeHtml(); }
  const at = r.attempt; const self = mergedSelf(r);
  const sc = C.scorePaper(r, at.answers, self);
  const pct = sc.max ? Math.round((sc.got / sc.max) * 100) : 0;
  const circ = 2 * Math.PI * 52;
  const units = C.flattenUnits(r);
  const altById = {}; units.filter((u) => u.alt).forEach((u) => { altById[u.id.replace('o', '')] = u; });
  const rows = [];
  for (const u0 of units) {
    if (u0.alt) continue;
    const au = altById[u0.id];
    const u = au && !unitHasAnswer(at.answers, u0.id) && unitHasAnswer(at.answers, au.id) ? au : u0;
    const a = at.answers[u.id];
    const isAuto = ['mcq', 'ar', 'tf', 'fill', 'map', 'grammar'].includes(u.q.type) || ((u.q.type === 'vsa' || u.q.type === 'short') && u.q.marks <= 1);
    const g = isAuto ? C.gradeObjective(u.q, a) : null;
    const state = !unitHasAnswer(at.answers, u.id) ? 'skip' : isAuto ? (g > 0 ? 'ok' : 'bad') : 'written';
    rows.push({ u, u0, a, g, state, isAuto, flagged: !!at.flags[u0.qNo] });
  }
  const f = ps.filter;
  const shown = rows.filter((x) => f === 'all' || (f === 'wrong' && x.state === 'bad') || (f === 'skip' && x.state === 'skip') || (f === 'written' && !x.isAuto) || (f === 'flag' && x.flagged));
  const counts = { ok: rows.filter((x) => x.state === 'ok').length, bad: rows.filter((x) => x.state === 'bad').length, skip: rows.filter((x) => x.state === 'skip').length };
  const writtenPending = rows.filter((x) => !x.isAuto && x.state === 'written' && typeof self[x.u.id] !== 'number').length;
  return `${topbar('Result', esc(r.title))}
  <div class="pp-scroll"><div class="pp-pad">
    <div class="pp-score"><div class="pp-ring pp-ring-sm"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}"/></svg><div class="pp-ringn"><b>${pct}</b><small>%</small></div></div>
      <div class="pp-scoret"><div class="pp-bigscore">${marksStr(sc.got)}<small> / ${marksStr(sc.max)}</small></div><div class="pp-scs">${pct >= 85 ? 'Excellent work' : pct >= 60 ? 'Good, keep polishing' : pct >= 35 ? 'Passable, revise the weak areas' : 'Needs more revision'}</div><div class="pp-scs">Time ${fmtTime(at.elapsed || 0)}</div></div></div>
    <div class="pp-sumrow"><div class="pp-stat ok"><b>${counts.ok}</b><small>correct</small></div><div class="pp-stat bad"><b>${counts.bad}</b><small>wrong</small></div><div class="pp-stat"><b>${counts.skip}</b><small>skipped</small></div><div class="pp-stat"><b>${marksStr(sc.descGot)}/${marksStr(sc.descMax)}</b><small>written</small></div></div>
    <div class="pp-secres">${Object.entries(sc.bySection).map(([k, s]) => `<div class="pp-sr"><span class="pp-pk">${esc(k)}</span><div class="pp-bar"><i style="width:${s.max ? Math.round((s.got / s.max) * 100) : 0}%"></i></div><span class="pp-srn">${marksStr(s.got)}/${marksStr(s.max)}</span></div>`).join('')}</div>
    ${writtenPending ? `<div class="pp-warn"><div><b>${writtenPending} written answer${writtenPending > 1 ? 's' : ''} not marked yet.</b> Mark them yourself against the scheme, or let the AI check them.</div><button class="btn btn-primary" data-act="aigrade" ${ps.busy ? 'disabled' : ''}>${ic('sparkle')} Check with AI</button></div>` : ''}
    <div class="pp-actions pp-actions3"><button class="btn btn-ghost" data-act="download">${ic('upload')} Download with my answers</button><button class="btn btn-ghost" data-act="attempt">${ic('rotateCcw')} Retry</button></div>
    <div class="pp-filters no-scrollbar">${[['all', 'All'], ['wrong', 'Wrong'], ['skip', 'Skipped'], ['written', 'Written'], ['flag', 'Flagged']].map(([k, l]) => `<button class="pp-pre ${f === k ? 'on' : ''}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div>
    ${shown.map((x) => reviewCard(x, r, self)).join('') || '<div class="pp-empty"><small>Nothing in this filter.</small></div>'}
  </div></div>`;
}
function reviewCard(x, r, self) {
  const { u, a, state, isAuto } = x; const q = u.q;
  const chip = { ok: '<span class="pp-chip pp-chip-ok">Correct</span>', bad: '<span class="pp-chip pp-chip-bad">Wrong</span>', skip: '<span class="pp-chip pp-chip-warn">Skipped</span>', written: '<span class="pp-chip pp-chip-run">Written</span>' }[state];
  const your = q.type === 'mcq' || q.type === 'ar' ? (typeof a === 'number' ? `<b>${'ABCD'[a]}.</b> ${esc(q.options[a])}` : '') : q.type === 'tf' ? (a === undefined ? '' : a ? 'True' : 'False') : esc(a || '');
  const correct = q.type === 'mcq' || q.type === 'ar' ? `<b>${'ABCD'[q.correct]}.</b> ${esc(q.options[q.correct])}` : esc(q.answer);
  const ai = r.attempt.ai?.[u.id]; const m = self[u.id];
  const srcKey = u.id;
  return `<article class="pp-rev ${state}"><div class="pp-revh"><b>${esc(u.label)}</b>${chip}<span class="pp-qmarks">${marksStr(q.marks)}</span></div>
    <div class="pp-revq">${esc(q.q).replace(/\n/g, '<br>')}</div>
    ${your ? `<div class="pp-revl"><small>Your answer</small><div class="pp-revv ${state === 'bad' ? 'bad' : ''}">${your}</div></div>` : ''}
    ${state !== 'ok' ? `<div class="pp-revl"><small>${isAuto ? 'Correct answer' : 'Model answer'}</small><div class="pp-revv good">${isAuto ? correct : esc(q.answer).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${!isAuto && q.points?.length ? `<details class="pp-more"><summary>Marking scheme</summary><ul class="pp-pts">${q.points.map((p) => `<li>${esc(p.t)} <b>[${marksStr(p.m)}]</b></li>`).join('')}</ul></details>` : ''}
    ${!isAuto && state === 'written' ? `<div class="pp-selfm"><span>Your marks</span><div class="pp-step"><button data-act="selfm" data-u="${esc(u.id)}" data-d="-0.5">−</button><b>${typeof m === 'number' ? marksStr(m) : '–'}</b><button data-act="selfm" data-u="${esc(u.id)}" data-d="0.5">+</button></div><small>of ${marksStr(q.marks)}</small></div>${ai ? `<div class="pp-aifb">AI: ${esc(ai.feedback || '')}</div>` : ''}` : ''}
    ${q.explain ? `<div class="pp-expl2">${esc(q.explain)}</div>` : ''}
    ${q.page || q.evidence ? `<button class="pp-link" data-act="src" data-u="${esc(srcKey)}">${ps.showSrc[srcKey] ? 'Hide' : 'Show'} source${q.page ? ' · p. ' + q.page : ''}</button>${ps.showSrc[srcKey] ? `<div class="pp-srcbox">${q.chapter ? '<b>' + esc(q.chapter) + '</b><br>' : ''}${q.evidence ? '“' + esc(q.evidence) + '”' : 'No quote stored for this item.'}</div>` : ''}` : ''}
  </article>`;
}

/* ============================== Events ============================== */
function onInput(e) {
  const t = e.target; const k = t.dataset?.in; if (!k) return;
  const c = ps.cfg;
  if (k === 'cq') { ps.chapterQuery = t.value; const pos = t.selectionStart; mount(true); const n = $('.pp-search[data-in="cq"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (k === 'school') { c.school = t.value; savePrefs(); return; }
  if (k === 'exam') { c.exam = t.value; return; }
  if (k === 'title') { c.title = t.value; return; }
  if (k === 'rf' || k === 'rt') { const r = c.ranges[+t.dataset.i]; if (r) r[k === 'rf' ? 'from' : 'to'] = Math.max(1, Math.min(ps.docInfo.doc.numPages, parseInt(t.value, 10) || 0)) || 0; return; }
  if (k === 'ans') {
    const r = currentRec(); if (!r) return;
    const id = t.dataset.u; r.attempt.answers[id] = t.value;
    const wc = $(`[data-wc="${CSS.escape(id)}"]`); if (wc) wc.firstChild.textContent = wordCount(t.value) + ' words';
    scheduleSave();
  }
}

async function onClick(e) {
  const el = e.target.closest('[data-act]'); if (!el) {
    const tool = e.target.closest('.pp-tool'); if (tool) { const no = +tool.closest('[data-no]')?.dataset.no; if (no) replaceQuestion(no); }
    return;
  }
  const act = el.dataset.act; const c = ps.cfg; const r = currentRec();
  switch (act) {
    case 'back': return paperBack();
    case 'home': ps.list = await PaperStore.list(); ps.screen = 'home'; return mount();
    case 'new': return startNew();
    case 'open': { if (e.target.closest('.pp-kebab')) return; ps.paperId = el.dataset.id; const rr = currentRec(); ps.screen = rr && (rr.status === 'running' || rr.status === 'queued') ? 'progress' : 'paper'; ps.unseenDone.delete(ps.paperId); return mount(); }
    case 'del': { e.stopPropagation(); const id = el.dataset.id; if (!confirm('Delete this paper and its attempt history?')) return; PaperJobs.cancel(id); await PaperStore.remove(id); ps.list = await PaperStore.list(); ps.screen = 'home'; ps.paperId = null; return mount(); }
    case 'openrun': { const id = PaperJobs.runningIds()[0]; ps.paperId = id; ps.screen = 'progress'; return mount(); }
    case 'progress': ps.screen = 'progress'; return mount();
    case 'board': { const id = C.blueprintsFor(el.dataset.v, c.level)[0]?.id || C.blueprintsFor(el.dataset.v, '10')[0].id; pickBlueprint(id); savePrefs(); return mount(true); }
    case 'level': { const id = C.blueprintsFor(c.board, el.dataset.v)[0]?.id; if (id) pickBlueprint(id); savePrefs(); return mount(true); }
    case 'subject': pickBlueprint(el.dataset.v); savePrefs(); return mount(true);
    case 'pickbook': ps.picker = true; return mount(true);
    case 'replace': { const no = +el.closest('[data-no]')?.dataset.no; if (no) replaceQuestion(no); return; }
    case 'usebook': { const f = (window.State.files || []).find((x) => x.id === el.dataset.id); if (!f) return; if (window.State.currentFile?.id === f.id && window.State.currentDoc) { ps.docInfo = { fileId: f.id, name: f.name, doc: window.State.currentDoc, temp: false }; ps.cfg.sel = new Set(); ps.cfg.ranges = []; ps.picker = false; await loadChapters(); return mount(true); } return loadDocFor(f); }
    case 'ch': { const i = +el.dataset.i; c.sel.has(i) ? c.sel.delete(i) : (c.sel.size + c.ranges.length < MAX_CHAPTERS ? c.sel.add(i) : toast(`Up to ${MAX_CHAPTERS} chapters per paper`)); return mount(true); }
    case 'chall': (ps.chapters || []).slice(0, MAX_CHAPTERS).forEach((_, i) => c.sel.add(i)); return mount(true);
    case 'chnone': c.sel.clear(); c.ranges = []; return mount(true);
    case 'radd': c.ranges.push({ from: 0, to: 0 }); return mount(true);
    case 'rdel': c.ranges.splice(+el.dataset.i, 1); return mount(true);
    case 'inc': stepPart(el.dataset.s, +el.dataset.p, 1); return mount(true);
    case 'dec': stepPart(el.dataset.s, +el.dataset.p, -1); return mount(true);
    case 'preset': applyPreset(el.dataset.v); return mount(true);
    case 'diff': c.difficulty = el.dataset.v; savePrefs(); return mount(true);
    case 'lang': c.language = el.dataset.v; savePrefs(); return mount(true);
    case 'mins': c.minutes = Math.max(15, Math.min(360, c.minutes + +el.dataset.v)); return mount(true);
    case 'tg': { const k = el.dataset.k; if (k === 'unseen') c.unseen = !c.unseen; else if (k === 'seen') c.seen = !c.seen; else if (k === 'choice') c.internalChoice = !c.internalChoice; else if (k === 'verify') c.verify = !c.verify; applyToggles(); savePrefs(); return mount(true); }
    case 'generate': return onGenerate(el);
    case 'bg': return exitPaperView();
    case 'cancel': if (r) { PaperJobs.cancel(r.id); } return;
    case 'resume': if (r) { r.status = 'queued'; ps.screen = 'progress'; await resumePaper(r); mount(); } return;
    case 'viewpaper': ps.screen = 'paper'; return mount();
    case 'download': return openDownload();
    case 'attempt': return startAttempt();
    case 'result': ps.screen = 'result'; ps.filter = 'all'; return mount();
    case 'altsel': { const card = cardsOf(r)[ps.ci]; ps.altSel[card.no] = el.dataset.v; return mount(true); }
    case 'pick': { r.attempt.answers[el.dataset.u] = +el.dataset.i; scheduleSave(); return mount(true); }
    case 'pickbool': { r.attempt.answers[el.dataset.u] = el.dataset.v === 'true'; scheduleSave(); return mount(true); }
    case 'flag': { const card = cardsOf(r)[ps.ci]; r.attempt.flags[card.no] = !r.attempt.flags[card.no]; scheduleSave(); return mount(true); }
    case 'prev': ps.ci = Math.max(0, ps.ci - 1); return mount();
    case 'next': ps.ci += 1; return mount();
    case 'secjump': { const i = cardsOf(r).findIndex((x) => x.sec === el.dataset.v); if (i >= 0) { ps.ci = i; mount(); } return; }
    case 'palette': return openPalette();
    case 'submit': return submitAttempt();
    case 'filter': ps.filter = el.dataset.v; return mount(true);
    case 'src': ps.showSrc[el.dataset.u] = !ps.showSrc[el.dataset.u]; return mount(true);
    case 'selfm': { const id = el.dataset.u; const u = C.flattenUnits(r).find((x) => x.id === id); const cur = typeof r.attempt.self[id] === 'number' ? r.attempt.self[id] : (r.attempt.ai?.[id]?.marks ?? 0); r.attempt.self[id] = Math.max(0, Math.min(u.q.marks, cur + +el.dataset.d)); scheduleSave(); return mount(true); }
    case 'aigrade': return runAiGrade();
  }
}

async function onGenerate(btn) {
  if (btn.dataset.off) { toast(btn.textContent.trim()); return; }
  const c = ps.cfg; const chapters = selectedChapters();
  if (!chapters.length || !ps.docInfo) return toast('Select at least one chapter');
  if (PaperJobs.runningIds().length >= 2) return toast('Two papers are already generating. Please wait for one to finish.');
  ps.busy = 'Reading your chapters…'; mount(true);
  let sources;
  try { sources = await prepareSources(ps.docInfo.doc, chapters, (i, n, title) => { ps.busy = `Reading chapter ${i} of ${n}…`; const el = $('.pp-busy div:last-child'); if (el) el.textContent = ps.busy; }); } catch (e) { sources = []; }
  const good = sources.filter((s) => s.words >= 60);
  if (!good.length) { ps.busy = null; mount(true); return toast('No readable text found. This looks like a scanned PDF. Run OCR on it first.'); }
  if (good.length < sources.length) toast(`${sources.length - good.length} chapter(s) had no readable text and were skipped.`);
  const words = good.reduce((a, s) => a + s.words, 0); const t = C.totals(c.sections);
  if (words / Math.max(1, t.questions) < 45) toast('Selected chapters are quite short for this many questions. Some topics may repeat.');
  applyToggles();
  const cfg = { ...c, fileId: ps.docInfo.fileId, fileName: ps.docInfo.name, official: isOfficial() };
  const rec = createPaperRecord(cfg, good);
  await PaperStore.save(rec);
  ps.list = await PaperStore.list();
  ps.paperId = rec.id; ps.screen = 'progress'; ps.busy = null;
  await closeTempDoc();
  PaperJobs.start(rec);
  mount();
}

async function startAttempt() {
  const r = currentRec(); if (!r) return;
  if (r.attempt.submittedAt) {
    if (!confirm('Start a fresh attempt? Your previous answers and score will be cleared.')) return;
    r.attempt = { answers: {}, self: {}, flags: {}, startedAt: null, submittedAt: null, elapsed: 0 };
    await PaperStore.save(r);
  }
  ps.ci = 0; ps.altSel = {}; ps.screen = 'attempt'; mount();
}
function submitAttempt() {
  const r = currentRec(); const cards = cardsOf(r);
  const un = cards.filter((c) => !unitsFor(c, 'main').concat(c.q.alt ? unitsFor(c, 'alt') : []).some((u) => unitHasAnswer(r.attempt.answers, u.id))).length;
  if (!confirm(un ? `${un} question${un > 1 ? 's are' : ' is'} still unanswered. Submit anyway?` : 'Submit your paper?')) return;
  r.attempt.submittedAt = Date.now(); clearTimer(); flushSave();
  ps.screen = 'result'; ps.filter = 'all'; mount();
}
function openPalette() {
  const r = currentRec(); const cards = cardsOf(r); const at = r.attempt;
  const html = `<div class="pp-palsheet"><div class="pp-sechead"><span>Questions</span><span class="pp-count">${ps.ci + 1} of ${cards.length}</span></div>
    <div class="pp-pallegend"><i class="a"></i>Answered <i class="f"></i>Flagged <i></i>Open</div>
    <div class="pp-palgrid">${cards.map((c, i) => { const ans = unitsFor(c, 'main').concat(c.q.alt ? unitsFor(c, 'alt') : []).some((u) => unitHasAnswer(at.answers, u.id)); return `<button class="${ans ? 'a' : ''} ${at.flags[c.no] ? 'f' : ''} ${i === ps.ci ? 'cur' : ''}" data-pal="${i}">${c.no}</button>`; }).join('')}</div></div>`;
  window.Sheet.open(html);
  document.querySelectorAll('[data-pal]').forEach((b) => { b.onclick = () => { ps.ci = +b.dataset.pal; window.Sheet.close(); mount(); }; });
}

async function runAiGrade() {
  const r = currentRec(); if (!r) return;
  ps.busy = 'AI is checking your written answers…'; mount(true);
  try {
    const res = await gradeWrittenAnswers(r, C.flattenUnits(r), r.attempt.answers);
    r.attempt.ai = { ...(r.attempt.ai || {}), ...res };
    await PaperStore.save(r);
    toast(Object.keys(res).length ? 'Done. You can adjust any mark yourself.' : 'Could not grade right now. Please mark them yourself.');
  } catch (e) { toast('AI check failed. Please try again.'); }
  ps.busy = null; mount(true);
}

async function replaceQuestion(no) {
  const r = currentRec(); if (!r || ps.replacing.has(no)) return;
  if (PaperJobs.isRunning(r.id)) return toast('Wait until the paper finishes generating.');
  if (!confirm(`Replace question ${no} with a new one?`)) return;
  ps.replacing.add(no); ps.busy = `Writing a new question ${no}…`; mount(true);
  try { await regenerateQuestion(r, no, 'main'); toast('Question replaced.'); } catch (e) { toast(e?.message || 'Could not replace the question.'); }
  ps.replacing.delete(no); ps.busy = null; mount(true);
}

/* ------------------------------ Download ------------------------------ */
function openDownload() {
  const r = currentRec(); if (!r) return;
  const attempted = !!r.attempt?.submittedAt || Object.keys(r.attempt?.answers || {}).length > 0;
  window.Sheet.open(`<div class="pp-dl"><div class="pp-dlt">Download PDF</div><div class="pp-dls">Pick what goes into the file. Each part starts on its own page.</div>
    ${dlRow('paper', 'Question paper', 'Official layout with instructions and sections', true)}
    ${dlRow('key', 'Marking scheme & model answers', 'AI answers and marking points, in a separate section', false)}
    ${dlRow('mine', 'My answers & result', attempted ? 'Your written answers with marks' : 'Attempt the paper first', false, !attempted)}
    ${dlRow('refs', 'Book page references', 'Adds chapter, page and source line in the marking scheme', false)}
    ${dlRow('roll', 'Name and roll number line', 'Printed under the paper heading', true)}
    <button class="btn btn-primary pp-dlgo" id="pp-dlgo">${ic('upload')} Download</button>
    <div class="pp-dln">In the print window choose <b>Save as PDF</b>.</div></div>`);
  const state = { paper: true, key: false, mine: false, refs: false, roll: true };
  document.querySelectorAll('.pp-dl [data-dl]').forEach((row) => {
    row.onclick = () => { if (row.dataset.disabled) return; const k = row.dataset.dl; state[k] = !state[k]; row.querySelector('.pp-sw').classList.toggle('on', state[k]); row.setAttribute('aria-checked', state[k]); };
  });
  $('#pp-dlgo').onclick = async () => {
    if (!state.paper && !state.key && !state.mine) return toast('Choose at least one part.');
    window.Sheet.close();
    const ok = await printPaper(r, { paper: state.paper, key: state.key, mine: state.mine, refs: state.refs, rollBox: state.roll });
    if (!ok) toast('Opened in a new tab. Use your browser’s print / save option.');
  };
}
function dlRow(k, t, s, on, disabled) {
  return `<div class="pp-opt pp-tg ${disabled ? 'dis' : ''}" data-dl="${k}" ${disabled ? 'data-disabled="1"' : ''} role="switch" aria-checked="${on}"><div><b>${t}</b><small>${s}</small></div><span class="pp-sw ${on ? 'on' : ''}"><i></i></span></div>`;
}

/* ------------------------------ Background wiring ------------------------------ */
function ensureSubscription() {
  if (unsubJobs) return;
  unsubJobs = PaperJobs.on(async (id) => {
    const r = PaperJobs.get(id)?.rec;
    if (window.State?.view === 'paper' && ps.paperId === id) {
      if (ps.screen === 'progress') { if (r && (r.status === 'done') && !PaperJobs.isRunning(id)) { ps.list = await PaperStore.list(); } mount(true); }
      else if (ps.screen === 'paper') mount(true);
    }
    syncCapsule();
  });
  window.addEventListener('paper:finished', (e) => {
    const { id, status } = e.detail || {};
    PaperStore.list().then((l) => { ps.list = l; });
    if (!(window.State?.view === 'paper' && ps.paperId === id)) { ps.unseenDone.add(id); toast(status === 'done' ? 'Your question paper is ready.' : status === 'partial' ? 'Question paper ready, with a few gaps.' : 'Question paper generation stopped.'); }
    syncCapsule();
  });
}


/* Paper document CSS, scoped to the on-screen sheet so it cannot clash with UI classes. */
function ensurePaperCss() {
  if (document.getElementById('pp-doc-css')) return;
  const scoped = PAPER_CSS.replace(/(^|\})\s*([^{}@]+)\{/g, (m, a, sel) => `${a}\n${sel.split(',').map((x) => { x = x.trim(); return x === '.pp-sheet' ? '.pp-sheet.pp-onscreen' : `.pp-onscreen ${x}`; }).join(',')}{`);
  const st = document.createElement('style'); st.id = 'pp-doc-css'; st.textContent = scoped; document.head.appendChild(st);
}

function syncCapsule() {
  let cap = document.getElementById('pp-capsule');
  const running = PaperJobs.runningIds();
  const unseen = [...ps.unseenDone];
  const show = (running.length || unseen.length) && window.State?.view !== 'paper';
  if (!show) { if (cap) cap.remove(); return; }
  if (!cap) {
    cap = document.createElement('button'); cap.id = 'pp-capsule'; cap.className = 'pp-capsule';
    cap.onclick = () => { const id = running[0] || [...ps.unseenDone][0]; openPaperView({ paperId: id }); };
    document.body.appendChild(cap);
  }
  if (running.length) {
    const r = PaperJobs.get(running[0]).rec; const p = r.progress?.total ? Math.round((r.progress.done / r.progress.total) * 100) : 0;
    cap.innerHTML = `<span class="pp-capring" style="--p:${p}"></span><span class="pp-capt"><b>Paper ${p}%</b><small>${esc((r.progress?.label || 'Generating').slice(0, 34))}</small></span>`;
    cap.dataset.state = 'run';
  } else { cap.innerHTML = `<span class="pp-capok">${ic('check', 'icon icon-sm')}</span><span class="pp-capt"><b>Paper ready</b><small>Tap to open</small></span>`; cap.dataset.state = 'done'; }
}

export async function initPaperModule() {
  await PaperStore.recover();
  ensureSubscription();
  setInterval(syncCapsule, 1500);
}
window.renderPaperView = () => mount(true);
window.initPaperModule = initPaperModule;
window.PaperUI = { ps, mount };
