// @ts-nocheck
/* Auto-highlight: marks what a good student would mark.
 *
 *  - Highlight (yellow): the sentences that carry the page (definitions, causes, key statements, facts).
 *  - Underline (red): formulas and dates, plus the key terms the AI picked (Smart mode).
 *
 * Quick mode runs on the phone with no AI and no internet. Smart mode asks the AI which sentences matter and falls back
 * to Quick if the AI is not reachable. Everything is saved as a normal annotation flagged by:'AI', reviewed:false, so the
 * reader's existing review banner ("N to review from AI" / Keep all / reject) handles it and nothing is final until kept.
 */
import { extractPageFacts } from './lesson_facts.js';

export const AI_AUTHOR = 'AI';
const HL_COLOR = '#FFD93D';
const UL_COLOR = '#E5484D';

// share of a page's sentences to mark, and the hard cap per page
export const DENSITY = {
  low: { label: 'Few', share: 0.08, max: 2, ul: 2 },
  normal: { label: 'Normal', share: 0.15, max: 4, ul: 4 },
  high: { label: 'Many', share: 0.26, max: 7, ul: 8 },
};

const STOP = new Set(('the and for that with this from which are was were has have had not but they their there these those into over under about between because while when where what will would could should also such than then them been being its our your his her she him who whom whose can may might must shall any all each both more most other some only very just like many much one two three use used using make made'
  + ' है हैं था थे थी और या का के की को में से पर यह वह ये वे एक कि जो भी तो हो ही कर करता करती करते होता होती होते लिए साथ बाद पहले अपने उस इस उन इन').split(' '));

const DEF_RE = /\b(?:is|are|was|were)\s+(?:called|known as|defined as|termed|referred to as)\b|\b(?:means|refers to|defined as|is the|are the)\b|कहते हैं|कहलाता|कहलाती|कहलाते|कहा जाता|परिभाषा|अर्थात्?/i;
const CUE_RE = /\b(?:important|note that|remember|key|significant|therefore|thus|hence|must|always|never|main|primary|essential|advantages?|disadvantages?|causes?|effects?|because|firstly|finally|summary|conclusion|result(?:s|ed)? in|leads? to|law|principle|theorem|rule)\b|महत्वपूर्ण|महत्त्वपूर्ण|ध्यान|इसलिए|अतः|मुख्य|कारण|प्रभाव|निष्कर्ष|नियम|सिद्धांत/i;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------- 1. the page as text + where every character sits on the page ---------- */

/** @returns {{text:string, spans:{s:number,e:number,x:number,y:number,w:number,h:number}[], vw:number, vh:number}} */
export async function readPageLayout(doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent({ normalizeWhitespace: true });
  const Util = window.pdfjsLib && window.pdfjsLib.Util;
  let text = '';
  const spans = [];
  let lastY = null, lastFont = 10;
  for (const it of tc.items) {
    const str = it.str;
    if (!str) { if (it.hasEOL) text += '\n'; continue; }
    const t = Util ? Util.transform(vp.transform, it.transform) : it.transform;
    const fontH = Math.hypot(t[2], t[3]) || 10;
    const horizontal = Math.abs(t[1]) < 0.01 * Math.abs(t[0] || 1);
    const y = t[5];
    if (lastY !== null && Math.abs(y - lastY) > lastFont * 0.55 && text && !/\s$/.test(text)) text += ' ';
    else if (text && !/[\s\n]$/.test(text) && !/^\s/.test(str) && lastY !== null && Math.abs(y - lastY) <= lastFont * 0.55) {
      // same line, separate item: join with a space only when there is a visible gap
      const gap = t[4] - (spans.length ? spans[spans.length - 1].x + spans[spans.length - 1].w : t[4]);
      if (gap > fontH * 0.18) text += ' ';
    }
    const s = text.length;
    text += str;
    if (horizontal && it.width > 0) {
      const fam = (tc.styles && tc.styles[it.fontName] && tc.styles[it.fontName].fontFamily) || 'sans-serif';
      spans.push({ s, e: text.length, x: t[4], y: y - fontH * 0.86, w: it.width * (vp.scale || 1), h: fontH * 1.06, str, font: `${Math.max(6, fontH).toFixed(1)}px ${fam}` });
    }
    lastY = y; lastFont = fontH;
    if (it.hasEOL) { text += '\n'; lastY = null; }
  }
  return { text, spans, vw: vp.width, vh: vp.height };
}

let _mctx = null;
/** Fraction (0..1) of an item's width taken by its first `n` characters, measured with the real font so a highlight starts on the right letter. */
function fracOf(sp, n) {
  const len = Math.max(1, sp.e - sp.s);
  if (n <= 0) return 0;
  if (n >= len) return 1;
  try {
    if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
    _mctx.font = sp.font;
    const full = _mctx.measureText(sp.str).width;
    if (full > 0) return Math.min(1, _mctx.measureText(sp.str.slice(0, n)).width / full);
  } catch (e) { /* fall through */ }
  return n / len;
}

/** Page-fraction rectangles for the characters [from,to) of the page text, one per line. */
export function rectsForRange(layout, from, to) {
  const lines = [];
  for (const sp of layout.spans) {
    if (sp.e <= from || sp.s >= to) continue;
    const a = Math.max(from, sp.s) - sp.s;
    const b = Math.min(to, sp.e) - sp.s;
    const fa = fracOf(sp, a), fb = fracOf(sp, b);
    const x = sp.x + sp.w * fa;
    const w = sp.w * (fb - fa);
    if (w <= 0.5) continue;
    const r = { x, y: sp.y, w, h: sp.h };
    const last = lines[lines.length - 1];
    // merge neighbours on the same line into one bar
    if (last && Math.abs(last.y - r.y) < r.h * 0.4 && r.x - (last.x + last.w) < r.h * 0.9 && r.x >= last.x - 1) {
      last.w = Math.max(last.w, r.x + r.w - last.x);
      last.h = Math.max(last.h, r.h);
    } else lines.push(r);
  }
  const { vw, vh } = layout;
  return lines.map((r) => ({ x: r.x / vw, y: r.y / vh, w: r.w / vw, h: r.h / vh }))
    .filter((r) => r.w > 0.002 && r.h > 0.002);
}

/* ---------- 2. sentences ---------- */

export function splitSentences(text) {
  const out = [];
  // Slides / bullet lists have almost no full stops: every line is its own point
  const stops = (text.match(/[.!?।]/g) || []).length;
  if (text.length > 200 && stops < Math.max(2, text.length / 400)) {
    let pos = 0;
    for (const line of text.split('\n')) {
      const from = pos + (line.length - line.trimStart().length);
      const to = pos + line.trimEnd().length;
      pos += line.length + 1;
      if (to - from >= 25) out.push({ id: 'S' + (out.length + 1), s: from, e: to, text: text.slice(from, to).replace(/^[•▪◦‣●○■□\-–*]\s*/, '') });
    }
    if (out.length >= 3) return out;
    out.length = 0;
  }
  const re = /[^.!?।\n]+(?:[.!?।]+|\n|$)/g;
  let m, buf = null;
  const push = (from, to) => {
    let a = from, b = to;
    while (a < b && /\s/.test(text[a])) a++;
    while (b > a && /\s/.test(text[b - 1])) b--;
    if (b - a >= 28) out.push({ id: 'S' + (out.length + 1), s: a, e: b, text: text.slice(a, b).replace(/\s*\n\s*/g, ' ') });
  };
  // sentences that run over several lines: join a line that does not end a sentence with the next one
  while ((m = re.exec(text))) {
    const piece = m[0];
    const endsSentence = /[.!?।]+\s*$/.test(piece);
    // a short line without punctuation that is followed by a capital letter is a heading: it never joins the next sentence
    const isHeadingLine = !endsSentence && /\n$/.test(piece) && piece.trim().length < 60 && !/[,;:\-–]$/.test(piece.trim()) && /^\s*[\p{Lu}\p{N}]/u.test(text.slice(m.index + piece.length, m.index + piece.length + 3));
    if (isHeadingLine && (buf === null || buf.to - buf.from < 60)) { buf = null; continue; }
    if (buf === null) buf = { from: m.index, to: m.index + piece.length };
    else buf.to = m.index + piece.length;
    if (endsSentence || /\n$/.test(piece) && piece.trim().length < 3) { push(buf.from, buf.to); buf = null; }
    else if (buf.to - buf.from > 420) { push(buf.from, buf.to); buf = null; }
  }
  if (buf) push(buf.from, buf.to);
  return out;
}

const wordsOf = (t) => (t.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((w) => !STOP.has(w));

function usable(sen) {
  const t = sen.text;
  if (t.length > 360) return false;
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (letters / t.length < 0.55) return false;               // tables, page numbers, dotted leaders
  if (t.split(/\s+/).length < 5) return false;
  return true;
}

/* ---------- 3. Quick mode: score every sentence on the phone ---------- */

export function scoreSentences(sentences, facts) {
  const ok = sentences.filter(usable);
  const freq = new Map();
  for (const s of ok) for (const w of new Set(wordsOf(s.text))) freq.set(w, (freq.get(w) || 0) + 1);
  const factIds = new Set([...(facts.formulas || []), ...(facts.dates || [])].map((f) => f.sid));
  let maxTf = 1;
  const raw = ok.map((s, i) => {
    const ws = wordsOf(s.text);
    let tf = 0;
    for (const w of ws) { const c = freq.get(w) || 0; if (c > 1) tf += c; }
    tf = ws.length ? tf / Math.sqrt(ws.length) : 0;
    maxTf = Math.max(maxTf, tf);
    return { s, i, tf };
  });
  return raw.map(({ s, i, tf }) => {
    let score = (tf / maxTf) * 4;
    if (DEF_RE.test(s.text)) score += 3;
    if (CUE_RE.test(s.text)) score += 1.5;
    if (factIds.has(s.id)) score += 3;
    if (/\d/.test(s.text)) score += 0.8;
    if ((s.text.match(/\b\p{Lu}[\p{L}]{2,}/gu) || []).length >= 3) score += 0.7;
    if (i === 0) score += 0.8;
    if (s.text.length < 45) score -= 1;
    return { sen: s, score };
  });
}

export function pickTop(scored, density) {
  const d = DENSITY[density] || DENSITY.normal;
  const n = Math.min(d.max, Math.max(1, Math.round(scored.length * d.share)));
  return [...scored].sort((a, b) => b.score - a.score).slice(0, n)
    .filter((x) => x.score >= 2.2 || scored.length <= 3)
    .sort((a, b) => a.sen.s - b.sen.s);
}

/* ---------- 4. Smart mode: the AI chooses, the phone still draws ---------- */

async function smartPick(sentences, density) {
  const d = DENSITY[density] || DENSITY.normal;
  const lines = sentences.filter(usable).map((s) => `[${s.id}] ${s.text}`).join('\n').slice(0, 9000);
  const n = Math.max(1, Math.min(d.max, Math.round(sentences.length * d.share)));
  const prompt = `You are a topper marking a textbook page for revision.
From the numbered sentences below choose the ${n} (at most) most exam-important sentences: definitions, laws, causes, effects, key facts. Also, for each chosen sentence give the ONE short key term or phrase (1-4 words) that must be underlined; it MUST be copied exactly from that sentence.
Never choose headings, page numbers or examples that only repeat another sentence.
Return ONLY JSON, no markdown: {"picks":[{"id":"S3","term":"photosynthesis"}]}

SENTENCES:
${lines}`;
  const raw = await window.callAI(prompt, null, '', false, 1);
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json');
  const obj = JSON.parse(m[0]);
  const picks = Array.isArray(obj.picks) ? obj.picks : [];
  const byId = new Map(sentences.map((s) => [s.id, s]));
  return picks.filter((p) => byId.has(String(p.id))).slice(0, n)
    .map((p) => ({ sen: byId.get(String(p.id)), term: String(p.term || '').trim() }));
}

/* ---------- 5. one page ---------- */

async function existingFor(fileId, pageNum) {
  const all = await window.DB.byIndex('annotations', 'fileId', fileId);
  return all.filter((a) => a.page === pageNum && a.rects && a.text);
}

/** Marks one page. Returns {hl, ul, noText, mode} */
export async function autoHighlightPage({ fileId, doc, pageNum, density = 'normal', mode = 'quick' }) {
  const layout = await readPageLayout(doc, pageNum);
  const sentences = splitSentences(layout.text);
  if (layout.text.replace(/\s/g, '').length < 20) return { hl: 0, ul: 0, noText: true, mode };
  if (!sentences.filter(usable).length) return { hl: 0, ul: 0, noText: false, mode };
  const legacy = typeof window.pageIsLegacyHindi === 'function' && window.pageIsLegacyHindi(layout.text);
  const fix = (t) => (legacy && window.fixLegacyHindi ? window.fixLegacyHindi(t, { pageLegacy: true, force: true }) : t);

  const facts = extractPageFacts(sentences);
  let picks, usedMode = 'quick';
  if (mode === 'smart') {
    try { picks = await smartPick(sentences, density); usedMode = 'smart'; if (!picks.length) picks = null; } catch (e) { console.warn('[auto-highlight] AI pick failed, using Quick:', e && e.message); }
  }
  if (!picks) picks = pickTop(scoreSentences(sentences, facts), density).map((x) => ({ sen: x.sen, term: '' }));

  const have = await existingFor(fileId, pageNum);
  const haveText = have.map((a) => norm(a.text));
  const dup = (t) => { const n = norm(t); return haveText.some((h) => h === n || h.includes(n) || n.includes(h)); };

  const records = [];
  const now = Date.now();
  const mk = (type, color, from, to, text) => {
    const rects = rectsForRange(layout, from, to);
    if (!rects.length) return;
    records.push({ id: window.uid(), fileId, page: pageNum, type, color, text: fix(text), rects, createdAt: now + records.length, by: AI_AUTHOR, reviewed: false });
  };

  let hl = 0;
  for (const p of picks) {
    if (dup(p.sen.text)) continue;
    mk('highlight', HL_COLOR, p.sen.s, p.sen.e, p.sen.text);
    hl++;
  }

  // underlines: Smart key terms first, then every formula and date of the page (capped)
  const d = DENSITY[density] || DENSITY.normal;
  const uls = [];
  for (const p of picks) {
    if (!p.term || p.term.length < 3) continue;
    const at = layout.text.indexOf(p.term, p.sen.s);
    if (at >= 0 && at + p.term.length <= p.sen.e) uls.push({ from: at, to: at + p.term.length, text: p.term });
  }
  const sById = new Map(sentences.map((s) => [s.id, s]));
  for (const f of [...(facts.formulas || []), ...(facts.dates || [])]) {
    const sen = sById.get(f.sid);
    if (!sen) continue;
    const label = f.kind === 'date' ? f.year : f.text;
    const at = layout.text.indexOf(label, sen.s);
    if (at >= 0 && at + label.length <= sen.e + 1) uls.push({ from: at, to: at + label.length, text: label });
  }
  let ul = 0;
  const seen = new Set();
  for (const u of uls) {
    if (ul >= d.ul) break;
    const key = u.from + ':' + u.to;
    if (seen.has(key) || dup(u.text) && have.some((a) => a.type === 'underline' && norm(a.text) === norm(u.text))) continue;
    seen.add(key);
    mk('underline', UL_COLOR, u.from, u.to, u.text);
    ul++;
  }

  for (const r of records) await window.DB.put('annotations', r);
  return { hl, ul: records.filter((r) => r.type === 'underline').length, noText: false, mode: usedMode };
}

/* ---------- 6. whole run + the sheet ---------- */

export async function runAutoHighlight({ fileId, doc, pages, density, mode, onProgress, shouldStop }) {
  let hl = 0, ul = 0, noText = 0, usedSmart = false, failed = 0;
  for (let i = 0; i < pages.length; i++) {
    if (shouldStop && shouldStop()) break;
    if (onProgress) onProgress(i, pages.length);
    try {
      const r = await autoHighlightPage({ fileId, doc, pageNum: pages[i], density, mode });
      hl += r.hl; ul += r.ul; if (r.noText) noText++; if (r.mode === 'smart') usedSmart = true;
    } catch (e) { failed++; console.warn('[auto-highlight] page', pages[i], e); }
    if (typeof window.paintAnnotations === 'function' && window.pageEls && window.pageEls[pages[i]]) {
      try { await window.paintAnnotations(pages[i]); } catch (e) { /* page not on screen */ }
    }
    if (i % 4 === 3) await new Promise((r) => setTimeout(r)); // let the UI breathe on long books
  }
  return { hl, ul, noText, failed, usedSmart, pages: pages.length };
}

const PREF_KEY = 'sayad_autohl_prefs';
function loadPrefs() { try { return { density: 'normal', mode: 'quick', scope: 'page', ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch (e) { return { density: 'normal', mode: 'quick', scope: 'page' }; } }
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }

/** The options sheet. onDone() runs after highlights were added (the reader refreshes its list). */
export function openAutoHighlightSheet({ fileId, onDone } = {}) {
  const fid = fileId || (window.State && window.State.currentFile && window.State.currentFile.id);
  const doc = window.State && window.State.currentDoc;
  if (!fid || !doc) { window.toast && window.toast('Open a book first'); return; }
  const prefs = loadPrefs();
  const cur = window.State.currentPage || 1;
  const total = doc.numPages || 1;
  const chip = (group, val, label, sub) => `<button type="button" class="ah-chip" data-g="${group}" data-v="${val}" aria-pressed="false"><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 4px;">
      <div>
        <div class="font-display" style="font-size:18px; font-weight:600;">Auto-highlight</div>
        <div style="font-size:12px; color:var(--text-faint);">Marks the important lines for you. You decide what to keep.</div>
      </div>
      <button id="ah-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">${window.icon('x', 'icon icon-sm')}</button>
    </div>
    <div class="ah-label">How much</div>
    <div class="ah-row">${chip('density', 'low', 'Few', 'only the big ones')}${chip('density', 'normal', 'Normal', 'balanced')}${chip('density', 'high', 'Many', 'revision mode')}</div>
    <div class="ah-label">Where</div>
    <div class="ah-row">${chip('scope', 'page', 'This page', 'page ' + cur)}${chip('scope', 'book', 'Whole book', total + ' pages')}</div>
    <div class="ah-label">Method</div>
    <div class="ah-row">${chip('mode', 'quick', 'Quick', 'works offline')}${chip('mode', 'smart', 'Smart (AI)', 'this page only')}</div>
    <div class="ah-legend"><i style="background:${HL_COLOR};"></i> highlight = key lines &nbsp; <i class="u" style="background:${UL_COLOR};"></i> underline = formulas, dates, key terms</div>
    <button id="ah-go" class="btn btn-primary" style="width:100%; padding:13px; margin-top:12px;">${window.icon('highlighter', 'icon icon-sm')} Highlight</button>
    <div id="ah-prog" style="display:none; margin-top:10px;"><div style="height:6px; border-radius:3px; background:var(--border); overflow:hidden;"><div id="ah-bar" style="height:100%; width:0; background:var(--accent); transition:width .2s;"></div></div><div id="ah-prog-t" style="font-size:12px; color:var(--text-dim); margin-top:5px; text-align:center;"></div></div>
    <style>
      .ah-label{font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--text-faint); margin:12px 0 6px;}
      .ah-row{display:flex; gap:8px;}
      .ah-chip{flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; padding:10px 6px; border-radius:12px; border:1.5px solid var(--border); background:var(--surface); color:var(--text); font-size:13.5px; cursor:pointer; min-height:52px; justify-content:center;}
      .ah-chip span{font-size:10.5px; color:var(--text-faint); font-weight:400;}
      .ah-chip[aria-pressed="true"]{border-color:var(--accent); background:var(--accent-soft); color:var(--accent);}
      .ah-chip[aria-pressed="true"] span{color:var(--accent); opacity:.8;}
      .ah-chip[disabled]{opacity:.4; cursor:not-allowed;}
      .ah-legend{font-size:11.5px; color:var(--text-dim); margin-top:12px; display:flex; align-items:center; flex-wrap:wrap; gap:4px;}
      .ah-legend i{display:inline-block; width:16px; height:8px; border-radius:2px; opacity:.8;}
      .ah-legend i.u{height:3px; border-radius:0;}
    </style>`);

  const q = (s) => document.querySelector(s);
  const state = { ...prefs };
  const sync = () => {
    if (state.mode === 'smart' && state.scope === 'book') state.scope = 'page'; // AI for a whole book would burn the free limit
    document.querySelectorAll('.ah-chip').forEach((b) => {
      b.setAttribute('aria-pressed', String(state[b.dataset.g] === b.dataset.v));
      if (b.dataset.g === 'scope' && b.dataset.v === 'book') b.disabled = state.mode === 'smart';
    });
  };
  document.querySelectorAll('.ah-chip').forEach((b) => { b.onclick = () => { if (b.disabled) return; state[b.dataset.g] = b.dataset.v; sync(); }; });
  sync();
  const x = q('#ah-x'); if (x) x.onclick = () => window.Sheet.close();

  const go = q('#ah-go');
  let stop = false, running = false;
  if (go) go.onclick = async () => {
    if (running) { stop = true; return; }
    running = true; stop = false;
    savePrefs({ density: state.density, mode: state.mode, scope: state.scope });
    const pages = state.scope === 'book' ? Array.from({ length: total }, (_, i) => i + 1) : [cur];
    const prog = q('#ah-prog'), bar = q('#ah-bar'), pt = q('#ah-prog-t');
    if (prog) prog.style.display = 'block';
    go.textContent = 'Stop';
    const res = await runAutoHighlight({
      fileId: fid, doc, pages, density: state.density, mode: state.mode,
      shouldStop: () => stop,
      onProgress: (i, n) => { if (bar) bar.style.width = Math.round((i / n) * 100) + '%'; if (pt) pt.textContent = `Page ${pages[i]} · ${i + 1} of ${n}`; },
    });
    running = false;
    window.Sheet.close();
    if (onDone) { try { await onDone(res); } catch (e) { console.error(e); } }
    const total2 = res.hl + res.ul;
    if (total2) window.toast(`Added ${res.hl} highlight${res.hl === 1 ? '' : 's'} and ${res.ul} underline${res.ul === 1 ? '' : 's'} to review${state.mode === 'smart' && !res.usedSmart ? ' (AI was busy, used Quick)' : ''}`);
    else if (res.noText && res.noText === res.pages) window.toast('No selectable text on this page (scanned?). Run OCR first.');
    else window.toast('Nothing new to mark here');
  };
}

window.openAutoHighlightSheet = openAutoHighlightSheet;
