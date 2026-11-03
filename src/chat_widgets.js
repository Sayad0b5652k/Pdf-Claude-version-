/* Interactive cards inside the book chat: quiz (MCQ / fill in the blank / short answer) and checklists.
   The model sends them as [[QUIZ]]{json}[[/QUIZ]] or [[CHECKLIST]]{json}[[/CHECKLIST]]; the chat turns them into
   a card the student can fill in, submit and get graded on the spot. All state lives on the chat message so it
   survives re-renders and reloads. */

const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const LETTERS = 'ABCDEF';

/* ---------------- parsing ---------------- */
function parseJson(body) {
  const t = String(body || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(t); } catch (e) { /* try to repair a trailing comma */ }
  try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch (e) { return null; }
}

function normQuiz(j) {
  if (!j || !Array.isArray(j.questions)) return null;
  const qs = [];
  for (const q of j.questions.slice(0, 10)) {
    if (!q || !q.q) continue;
    const type = ['mcq', 'fill', 'short'].includes(q.type) ? q.type : (Array.isArray(q.options) ? 'mcq' : 'short');
    const out = { type, q: String(q.q), explain: String(q.explain || ''), page: Number(q.page) || 0 };
    if (type === 'mcq') {
      const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).replace(/^\s*[A-Fa-f][).:\-]\s+/, '')).slice(0, 6);
      if (opts.length < 2) continue;
      let a = q.answer;
      if (typeof a === 'string' && /^[A-Fa-f]$/.test(a.trim())) a = LETTERS.indexOf(a.trim().toUpperCase());
      a = Number(a);
      if (!Number.isInteger(a) || a < 0 || a >= opts.length) continue;
      out.options = opts; out.answer = a;
    } else if (type === 'fill') {
      if (!q.answer) continue;
      out.answer = String(q.answer);
      out.accept = Array.isArray(q.accept) ? q.accept.map(String) : [];
    } else {
      out.answer = String(q.answer || '');
      out.keywords = Array.isArray(q.keywords) ? q.keywords.map((k) => String(k).toLowerCase()).filter(Boolean).slice(0, 8) : [];
      if (!out.answer && !out.keywords.length) continue;
    }
    qs.push(out);
  }
  if (!qs.length) return null;
  return { kind: 'quiz', title: String(j.title || 'Quick quiz'), questions: qs, state: { answers: {}, checked: {}, submitted: false, saved: false } };
}

function normChecklist(j) {
  const items = (j && Array.isArray(j.items) ? j.items : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
  if (!items.length) return null;
  return { kind: 'checklist', title: String(j.title || 'Checklist'), items, state: { done: {} } };
}

/** Pulls [[QUIZ]] / [[CHECKLIST]] blocks out of a reply. Returns the clean text and the widget (if any). */
export function extractWidgets(text) {
  let widget = null;
  let t = String(text || '');
  t = t.replace(/\[\[QUIZ\]\]([\s\S]*?)\[\[\/QUIZ\]\]/i, (_m, body) => { widget = normQuiz(parseJson(body)) || widget; return ''; });
  t = t.replace(/\[\[CHECKLIST\]\]([\s\S]*?)\[\[\/CHECKLIST\]\]/i, (_m, body) => { widget = normChecklist(parseJson(body)) || widget; return ''; });
  t = t.replace(/\[\[(?:QUIZ|CHECKLIST)\]\][\s\S]*$/i, ''); // a block that got cut off
  return { text: t.trim(), widget };
}

/* ---------------- grading ---------------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 'ok' | 'part' | 'bad' | 'skip' for one question. */
export function gradeQuestion(q, ans) {
  if (ans === undefined || ans === null || String(ans).trim() === '') return 'skip';
  if (q.type === 'mcq') return Number(ans) === q.answer ? 'ok' : 'bad';
  const a = norm(ans);
  if (q.type === 'fill') {
    const targets = [q.answer, ...(q.accept || [])].map(norm).filter(Boolean);
    for (const t of targets) {
      if (a === t) return 'ok';
      if (t.length > 4 && lev(a, t) <= 1) return 'ok';
    }
    return 'bad';
  }
  const kws = q.keywords || [];
  if (!kws.length) return 'part'; // nothing to check against: show the model answer, give half credit for trying
  const hit = kws.filter((k) => a.includes(norm(k))).length;
  const r = hit / kws.length;
  return r >= 0.6 ? 'ok' : r >= 0.3 ? 'part' : 'bad';
}

export function scoreQuiz(w) {
  let got = 0; const marks = [];
  w.questions.forEach((q, i) => {
    const g = gradeQuestion(q, w.state.answers[i]);
    marks.push(g);
    if (g === 'ok') got += 1; else if (g === 'part') got += 0.5;
  });
  return { got, total: w.questions.length, marks };
}

/** One-line description of a card for the model's memory of the conversation. */
export function widgetSummary(w) {
  if (!w) return '';
  if (w.kind === 'checklist') return `[checklist card "${w.title}": ${Object.values(w.state.done).filter(Boolean).length}/${w.items.length} done]`;
  if (w.state.submitted) { const s = scoreQuiz(w); return `[quiz card "${w.title}" submitted: ${s.got}/${s.total}]`; }
  return `[quiz card "${w.title}": ${w.questions.length} questions, not submitted yet]`;
}

/* ---------------- rendering ---------------- */
const TYPE_LABEL = { mcq: 'MCQ', fill: 'Fill in the blank', short: 'Short answer' };
const pageChip = (p) => (p ? `<button type="button" class="inline-page-jump-chip cw-page" data-page="${p}" title="Open page ${p}">📖 Page ${p}</button>` : '');

function quizInner(w) {
  const st = w.state; const sub = st.submitted; st.checked = st.checked || {};
  const res = sub ? scoreQuiz(w) : null;
  const nChecked = w.questions.filter((_, i) => st.checked[i]).length;
  const hasText = (i) => { const v = st.answers[i]; return v !== undefined && String(v).trim() !== ''; };
  const qh = w.questions.map((q, i) => {
    const ans = st.answers[i];
    const locked = sub || st.checked[i];
    const g = locked ? gradeQuestion(q, ans) : '';
    let input = '';
    if (q.type === 'mcq') {
      input = `<div class="cw-opts">${q.options.map((o, oi) => {
        let cls = 'cw-opt';
        if (!locked && Number(ans) === oi && ans !== undefined) cls += ' sel';
        if (locked && oi === q.answer) cls += ' right';
        if (locked && Number(ans) === oi && oi !== q.answer && ans !== undefined) cls += ' wrong';
        return `<button type="button" class="${cls}" data-q="${i}" data-o="${oi}" ${locked ? 'disabled' : ''}><b>${LETTERS[oi]}</b><span>${esc(o)}</span></button>`;
      }).join('')}</div>`;
    } else {
      const field = q.type === 'fill'
        ? `<input class="cw-in" data-q="${i}" type="text" autocomplete="off" placeholder="Apna jawab likho…" value="${esc(ans || '')}" ${locked ? 'disabled' : ''}>`
        : `<textarea class="cw-ta" data-q="${i}" rows="3" placeholder="Apne shabdon mein likho…" ${locked ? 'disabled' : ''}>${esc(ans || '')}</textarea>`;
      input = field + (locked ? '' : `<button type="button" class="cw-btn cw-check" data-act="check" data-q="${i}" ${hasText(i) ? '' : 'disabled'}>Check</button>`);
    }
    let fb = '';
    if (locked) {
      const head = g === 'ok' ? '✅ Bilkul sahi!' : g === 'part' ? '🟡 Aadha sahi' : g === 'skip' ? '⏭️ Chhoda' : '❌ Galat';
      const correct = q.type === 'mcq' ? `${LETTERS[q.answer]}. ${q.options[q.answer]}` : q.answer;
      fb = `<div class="cw-fb ${g}"><div class="cw-fbh">${head}</div>${g !== 'ok' && correct ? `<div class="cw-ans"><b>Sahi jawab:</b> ${esc(correct)}</div>` : ''}${q.explain ? `<div class="cw-exp">${esc(q.explain)}</div>` : ''}${pageChip(q.page)}</div>`;
    }
    return `<div class="cw-q"><div class="cw-qh"><span class="cw-n">${i + 1}</span><span class="cw-tag">${TYPE_LABEL[q.type]}</span></div><div class="cw-qt">${esc(q.q)}</div>${input}${fb}</div>`;
  }).join('');
  const bar = `<div class="cw-bar"><i style="width:${Math.round((sub ? w.questions.length : nChecked) / w.questions.length * 100)}%"></i></div>`;
  let foot;
  if (!sub) {
    foot = `<div class="cw-foot"><span class="cw-prog">${nChecked}/${w.questions.length} done</span><button type="button" class="cw-btn primary" data-act="submit" ${nChecked ? '' : 'disabled'}>Finish & score</button></div>`;
  } else {
    const bad = res.marks.filter((m) => m === 'bad' || m === 'skip').length;
    const pct = Math.round((res.got / res.total) * 100);
    foot = `<div class="cw-score"><div class="cw-big">${res.got % 1 ? res.got.toFixed(1) : res.got}<small> / ${res.total}</small></div><div class="cw-sc-t">${pct >= 80 ? 'Zabardast! 🔥' : pct >= 50 ? 'Achha, thoda aur revise karo' : 'Is topic ko dobara padhna padega'}</div></div>
      <div class="cw-foot wrap">${bad && !st.saved ? `<button type="button" class="cw-btn" data-act="cards">🃏 Add ${bad} mistake${bad > 1 ? 's' : ''} to Review</button>` : ''}${st.saved ? '<span class="cw-prog">✔ Review mein add ho gaye</span>' : ''}<button type="button" class="cw-btn" data-act="retry">↻ Dobara karo</button><button type="button" class="cw-btn" data-act="more">➕ Naye sawaal</button></div>`;
  }
  return `<div class="cw-head"><span>🧠</span><b>${esc(w.title)}</b><em class="cw-pill ${sub ? 'full' : ''}">${sub ? res.got + '/' + res.total : nChecked + '/' + w.questions.length}</em></div>${bar}${qh}${foot}`;
}

function checklistInner(w) {
  const done = w.state.done; const n = w.items.length; const d = w.items.filter((_, i) => done[i]).length;
  const rows = w.items.map((it, i) => `<button type="button" class="cw-ck ${done[i] ? 'on' : ''}" data-i="${i}" role="checkbox" aria-checked="${!!done[i]}"><span class="cw-box">${done[i] ? '✓' : ''}</span><span class="cw-ckt">${esc(it)}</span></button>`).join('');
  const left = w.items.filter((_, i) => !done[i]);
  return `<div class="cw-head"><span>✅</span><b>${esc(w.title)}</b><em class="cw-pill ${d === n ? 'full' : ''}">${d}/${n}</em></div>${rows}${left.length ? `<div class="cw-foot"><span class="cw-prog">Baaki ${left.length}</span><button type="button" class="cw-btn" data-act="quizleft">🧠 Baaki par quiz lo</button></div>` : '<div class="cw-foot"><span class="cw-prog">Sab ho gaya 🎉</span></div>'}`;
}

export function widgetInner(msg) {
  const w = msg && msg.widget; if (!w) return '';
  return w.kind === 'checklist' ? checklistInner(w) : quizInner(w);
}

/** Wire a rendered card. ctx = { save(), send(text), fileId, page, onPageChip(el) } */
export function bindWidget(cardEl, msg, ctx) {
  const w = msg && msg.widget; if (!w || !cardEl) return;
  const redraw = () => { cardEl.innerHTML = widgetInner(msg); bindWidget(cardEl, msg, ctx); if (ctx.afterRedraw) ctx.afterRedraw(cardEl); };
  const persist = () => { try { ctx.save && ctx.save(); } catch (e) { /* best effort */ } };

  if (w.kind === 'checklist') {
    cardEl.querySelectorAll('.cw-ck').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.i); w.state.done[i] = !w.state.done[i]; persist(); redraw(); }; });
    const q = cardEl.querySelector('[data-act="quizleft"]');
    if (q) q.onclick = () => {
      const left = w.items.filter((_, i) => !w.state.done[i]);
      ctx.send(`Quiz me on these topics I haven't covered yet:\n${left.map((x) => '- ' + x).join('\n')}`);
    };
    return;
  }

  const st = w.state; st.checked = st.checked || {};
  const finishIfAll = () => { if (w.questions.every((_, i) => st.checked[i])) st.submitted = true; };
  const syncCheckBtn = (i) => {
    const b = cardEl.querySelector(`[data-act="check"][data-q="${i}"]`);
    const v = st.answers[i]; if (b) b.disabled = !(v !== undefined && String(v).trim() !== '');
  };
  cardEl.querySelectorAll('.cw-opt').forEach((b) => {
    b.onclick = () => { const i = Number(b.dataset.q); if (st.checked[i]) return; st.answers[i] = Number(b.dataset.o); st.checked[i] = true; finishIfAll(); persist(); redraw(); };
  });
  cardEl.querySelectorAll('.cw-in, .cw-ta').forEach((inp) => {
    const i = Number(inp.dataset.q);
    inp.oninput = () => { st.answers[i] = inp.value; syncCheckBtn(i); };
    inp.onchange = persist;
    if (inp.classList.contains('cw-in')) inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = cardEl.querySelector(`[data-act="check"][data-q="${i}"]`); if (b && !b.disabled) b.click(); } };
  });
  cardEl.querySelectorAll('[data-act="check"]').forEach((b) => {
    b.onclick = () => { const i = Number(b.dataset.q); const v = st.answers[i]; if (v === undefined || String(v).trim() === '') return; st.checked[i] = true; finishIfAll(); persist(); redraw(); };
  });
  const act = (name) => cardEl.querySelector(`[data-act="${name}"]`);
  if (act('submit')) act('submit').onclick = () => { st.submitted = true; persist(); redraw(); };
  if (act('retry')) act('retry').onclick = () => { w.state = { answers: {}, checked: {}, submitted: false, saved: false }; persist(); redraw(); };
  if (act('more')) act('more').onclick = () => ctx.send(`Same topic par ${w.questions.length} naye quiz sawaal do jo pehle se alag hon (${w.title}).`);
  if (act('cards')) act('cards').onclick = async () => {
    const res = scoreQuiz(w); let n = 0;
    for (let i = 0; i < w.questions.length; i++) {
      if (res.marks[i] !== 'bad' && res.marks[i] !== 'skip') continue;
      const q = w.questions[i];
      const opts = q.type === 'mcq' ? '\n' + q.options.map((o, oi) => `${LETTERS[oi]}. ${o}`).join('\n') : '';
      const correct = q.type === 'mcq' ? `${LETTERS[q.answer]}. ${q.options[q.answer]}` : q.answer;
      await window.DB.put('flashcards', {
        id: `cq-${Date.now()}-${i}`, fileId: ctx.fileId || 'global', page: q.page || ctx.page || 1, category: 'Chat quiz mistakes',
        front: q.q + opts, back: String(correct) + (q.explain ? `\n\n${q.explain}` : ''),
        due: Date.now(), stability: 0.5, difficulty: 5, reps: 0, lapses: 1, createdAt: Date.now(),
      });
      n++;
    }
    st.saved = true; persist(); redraw();
    if (window.toast) window.toast(`Added ${n} card${n > 1 ? 's' : ''} to Review.`);
  };
}
