// @ts-nocheck
/* Exam plan (lives on the back of the Reading Analytics card).
   The student picks subjects (books) + an exam date + priority for each; chapters come from the book's TOC (or page blocks when
   there is none). Each day the app shows "aaj ka checklist": a stateless calculation from what is still pending, so a
   missed day simply spreads the remaining chapters over the days that are left. */

const DAY = 86400000;
const localISO = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const esc = (s) => window.escapeHtml(String(s ?? ''));
const bookName = (f) => (f && f.name ? f.name.replace(/\.pdf$/i, '') : 'Book');

/* ---------------- chapters ---------------- */

/** No TOC: split the book into roughly 10-page blocks. */
export function pageBlocks(total) {
  total = Math.max(1, total || 1);
  const n = Math.min(40, Math.max(1, Math.round(total / 10)));
  const size = Math.ceil(total / n);
  const out = [];
  for (let s = 1; s <= total; s += size) {
    const e = Math.min(total, s + size - 1);
    out.push({ id: `${s}-${e}`, title: `Pages ${s}–${e}`, start: s, end: e });
  }
  return out;
}

const FRONT = /^(contents?|table of contents|preface|foreword|acknowledg|copyright|index|bibliograph|about the)/i;

/** From a (possibly nested / overlapping) chapter list pick one sensible level: the shallowest with 3 to 60 entries. */
export function pickLevel(list, total) {
  const items = (list || [])
    .filter((c) => c && c.startPage >= 1 && c.endPage >= c.startPage && !FRONT.test(String(c.rawTitle || c.title || '').trim()))
    .map((c) => ({ title: String(c.title || c.rawTitle || '').trim(), start: c.startPage, end: Math.min(total || c.endPage, c.endPage) }));
  if (items.length < 2) return [];
  const contains = (a, b) => a !== b && a.start <= b.start && a.end >= b.end && (a.start < b.start || a.end > b.end);
  items.forEach((c) => { c.depth = items.filter((o) => contains(o, c)).length; });
  const depths = [...new Set(items.map((c) => c.depth))].sort((a, b) => a - b);
  for (const d of depths) {
    const lvl = items.filter((c) => c.depth === d);
    if (lvl.length >= 3 && lvl.length <= 60) return lvl.sort((a, b) => a.start - b.start).map(toChapter);
  }
  return [];
}
const toChapter = (c) => ({ id: `${c.start}-${c.end}`, title: c.title.slice(0, 90) || `Pages ${c.start}–${c.end}`, start: c.start, end: c.end });

/** Chapters for a book: TOC when the app can read one, else page blocks. */
export async function detectChapters(file) {
  const total = Math.max(1, file.pageCount || 1);
  let doc = null;
  try {
    if (window.pdfjsLib && window.getChapterList) {
      const rec = file.data ? file : await window.DB.get('files', file.id);
      if (rec && rec.data) {
        doc = await window.pdfjsLib.getDocument({ data: rec.data.slice(0), ...(window.PDFJS_LOAD_OPTS || {}) }).promise;
        const lvl = pickLevel(await window.getChapterList(doc, file.id), total);
        if (lvl.length) return { chapters: lvl, source: 'toc' };
      }
    }
  } catch (e) { console.warn('Chapter detection failed, using page blocks:', e && e.message); }
  finally { try { doc && doc.destroy && doc.destroy(); } catch (e) { /* ignore */ } }
  return { chapters: pageBlocks(total), source: 'pages' };
}

/* ---------------- the daily maths (pure, exported for tests) ---------------- */

/** plan = { subjects:[{fileId, examDate, priority, chapters:[{id,title,start,end}], done:{id: dayStamp}, source}] } */
export function computeToday(plan, now = Date.now(), dueByFile = {}) {
  const today = startOfDay(now);
  const subs = ((plan && plan.subjects) || []).map((s) => {
    const exam = startOfDay(new Date(s.examDate + 'T00:00:00').getTime());
    const daysLeft = Math.round((exam - today) / DAY);
    const chapters = s.chapters || [];
    const done = s.done || {};
    const priority = s.priority === 'high' ? 'high' : 'normal';
    const pages = (c) => Math.max(1, c.end - c.start + 1);
    const pending = chapters.filter((c) => !done[c.id]);
    const doneToday = chapters.filter((c) => done[c.id] === today);
    const revisionDays = daysLeft > 6 ? Math.max(2, Math.round(daysLeft * 0.2)) : 0;
    const readDays = Math.max(1, daysLeft - revisionDays);
    const remainingPages = pending.reduce((a, c) => a + pages(c), 0);
    const doneTodayPages = doneToday.reduce((a, c) => a + pages(c), 0);
    const weight = priority === 'high' ? 1.35 : 1;
    const budget = Math.max(1, Math.ceil(((remainingPages + doneTodayPages) / readDays) * weight));
    let phase = 'reading';
    if (daysLeft < 0) phase = 'over';
    else if (daysLeft === 0) phase = 'examday';
    else if (!pending.length) phase = 'finished';
    else if (revisionDays > 0 && daysLeft <= revisionDays) phase = 'revision';
    const items = [];
    if (phase === 'reading') {
      let acc = doneTodayPages;
      doneToday.forEach((c) => items.push({ ...c, done: true }));
      for (const c of pending) { if (acc >= budget) break; items.push({ ...c, done: false }); acc += pages(c); }
    } else if (phase === 'finished' || phase === 'revision' || phase === 'examday') {
      doneToday.forEach((c) => items.push({ ...c, done: true }));
    }
    return {
      fileId: s.fileId, exam, examDate: s.examDate, priority, daysLeft, revisionDays, readDays,
      dailyPages: Math.ceil(remainingPages / readDays), remainingPages, phase, items,
      total: chapters.length, doneCount: chapters.length - pending.length, due: dueByFile[s.fileId] || 0,
    };
  });
  subs.sort((a, b) => (a.daysLeft < 0) - (b.daysLeft < 0) || a.exam - b.exam || (b.priority === 'high') - (a.priority === 'high'));
  return { subjects: subs, today };
}

/* ---------------- storage ---------------- */

async function loadPlan(files) {
  let p = null;
  try { p = await window.DB.getSetting('studyPlan', null); } catch (e) { p = null; }
  if (!p) return null;
  if (Array.isArray(p.subjects)) return p;
  // old single-book plan -> first subject with page blocks
  const f = (files || []).find((x) => x.id === p.fileId);
  if (!f || !p.examDate) return null;
  return { version: 2, createdAt: p.createdAt || Date.now(), subjects: [{ fileId: f.id, examDate: p.examDate, priority: 'normal', chapters: pageBlocks(f.pageCount), source: 'pages', done: {} }] };
}
async function savePlan(p) { await window.DB.setting('studyPlan', p); }

async function dueMap() {
  const out = {};
  try {
    const all = await window.DB.all('flashcards'); const now = Date.now();
    for (const c of all) if ((!c.due || c.due <= now) && c.fileId) out[c.fileId] = (out[c.fileId] || 0) + 1;
  } catch (e) { /* ignore */ }
  return out;
}

/* ---------------- back face of the Reading Analytics card ---------------- */

export async function studyPlanBackHtml(files) {
  const head = () => `<div class="sp-eyebrow">EXAM PLAN</div>`;
  if (!files || !files.length) return `${head()}<div class="sp-sub">Pehle ek book import karo.</div>`;
  const plan = await loadPlan(files);
  const live = plan && plan.subjects.filter((s) => files.some((f) => f.id === s.fileId));
  if (!live || !live.length) {
    window._spPending = 0;
    return `${head()}<div class="sp-big">Exam date set karo</div>
      <div class="sp-sub">Subjects chuno, har ek ka exam date do. Chapters TOC se aayenge aur roz ka smart checklist ban jayega.</div>
      <button id="sp-edit" class="btn btn-primary sp-btn" type="button">Plan banao</button>`;
  }
  const c = computeToday({ subjects: live }, Date.now(), await dueMap());
  const name = (id) => bookName(files.find((f) => f.id === id));
  const next = c.subjects.find((s) => s.daysLeft >= 0);
  const todayAll = c.subjects.flatMap((s) => s.items), todayDone = todayAll.filter((i) => i.done).length;
  window._spPending = todayAll.length - todayDone;
  const paceLabel = next && next.remainingPages > 0 && next.daysLeft > 0
    ? ` · ~${next.dailyPages}p/day`
    : '';
  const hero = next
    ? `<div class="sp-hero"><div class="sp-num"><b>${next.daysLeft}</b><span>din baaki</span></div>
        <div class="sp-hero-r"><span class="sp-eyebrow">EXAM PLAN${next.priority === 'high' ? ' · ⚡ HIGH' : ''}</span><span class="sp-subj-name">${esc(name(next.fileId))}</span>
        <span class="sp-today ${todayAll.length && todayDone === todayAll.length ? 'ok' : ''}">${todayAll.length ? `Aaj ${todayDone}/${todayAll.length} ✓` : 'Aaj chhutti 🎉'}${paceLabel}</span></div></div>`
    : head();
  let rows = '';
  for (const s of c.subjects) {
    const nm = esc(name(s.fileId).slice(0, 22));
    const dueChip = s.due ? `<button type="button" class="sp-rev-btn" data-rev-file="${esc(s.fileId)}">${s.due} cards ➔</button>` : '';
    if (s.phase === 'over') { rows += `<div class="sp-note-row"><span class="sp-note-txt">${nm}: exam ho gaya</span></div>`; continue; }
    if (s.phase === 'examday') { rows += `<div class="sp-note-row"><span class="sp-note-txt">${nm}: <b>exam aaj hai</b></span>${dueChip}</div>`; continue; }
    s.items.forEach((it) => {
      rows += `<div class="sp-row ${it.done ? 'on' : ''}">
        <button class="sp-ck" type="button" data-file="${esc(s.fileId)}" data-ch="${esc(it.id)}" aria-pressed="${it.done}" aria-label="Done"></button>
        <div class="sp-rt sp-open-read" data-file="${esc(s.fileId)}" data-page="${it.start}" title="Tap to read pp. ${it.start}–${it.end}">
          <b>${s.priority === 'high' ? '⚡ ' : ''}${esc(it.title)}</b>
          <span>${esc(name(s.fileId).slice(0, 20))} · pp. ${it.start}–${it.end} · <u>Read</u></span>
        </div>
        <button class="sp-q" type="button" data-file="${esc(s.fileId)}" data-page="${it.start}">Quiz</button>
      </div>`;
    });
    if (s.phase === 'finished') rows += `<div class="sp-note-row"><span class="sp-note-txt">${nm}: sab chapters ho gaye ✅</span>${dueChip}</div>`;
    else if (s.phase === 'revision') rows += `<div class="sp-note-row"><span class="sp-note-txt">${nm}: revision (${s.daysLeft}d left)</span>${dueChip}</div>`;
    else if (!s.items.some((i) => !i.done)) rows += `<div class="sp-note-row"><span class="sp-note-txt">${nm}: aaj ka goal poora ✅</span>${dueChip}</div>`;
  }
  const active = c.subjects.filter((s) => s.phase !== 'over');
  const tot = active.reduce((a, s) => a + s.total, 0), dn = active.reduce((a, s) => a + s.doneCount, 0);
  const pct = tot ? Math.round((dn / tot) * 100) : 0;
  return `${hero}
    <div class="sp-list">${rows || '<div class="sp-sub">Aaj koi chapter pending nahi.</div>'}</div>
    <i class="sp-bar"><u style="width:${pct}%"></u></i>
    <div class="sp-foot"><span>${dn}/${tot} chapters · ${pct}%</span><button id="sp-edit" class="sp-link" type="button" aria-label="Edit plan">${window.icon('edit', 'icon icon-xs')}<span>Edit</span></button></div>`;
}

export function bindStudyPlanBack(files) {
  const edit = document.getElementById('sp-edit');
  if (edit) edit.onclick = () => openStudyPlanSheet(files);
  const root = document.getElementById('an-flip');
  const flip = (to) => { window._anFlipped = to; root && root.classList.toggle('flipped', to); };
  const fb = document.getElementById('an-flip-btn'); if (fb) fb.onclick = () => flip(true);
  const bb = document.getElementById('an-back-btn'); if (bb) bb.onclick = () => flip(false);
  document.querySelectorAll('.sp-ck').forEach((b) => {
    b.onclick = async () => {
      const plan = await loadPlan(files); if (!plan) return;
      const s = plan.subjects.find((x) => x.fileId === b.dataset.file); if (!s) return;
      s.done = s.done || {};
      if (s.done[b.dataset.ch]) delete s.done[b.dataset.ch]; else s.done[b.dataset.ch] = startOfDay(Date.now());
      await savePlan(plan);
      window.renderDashboard && window.renderDashboard(false);
    };
  });
  document.querySelectorAll('.sp-open-read').forEach((el) => {
    el.onclick = async () => {
      if (typeof window.openReader !== 'function') return;
      await window.openReader(el.dataset.file, Number(el.dataset.page) || 1);
    };
  });
  document.querySelectorAll('.sp-rev-btn').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      if (window.State) {
        window.State.view = 'review';
        window.pushAppScreen && window.pushAppScreen('review');
        window.render && window.render();
      }
    };
  });
  document.querySelectorAll('.sp-q').forEach((b) => {
    b.onclick = async () => {
      if (typeof window.openReader !== 'function') return;
      await window.openReader(b.dataset.file, Number(b.dataset.page) || 1);
      setTimeout(() => { try { window.runMCQGeneratorModal && window.runMCQGeneratorModal(); } catch (e) { /* ignore */ } }, 700);
    };
  });
}

/* ---------------- setup sheet ---------------- */

export async function openStudyPlanSheet(files) {
  const old = await loadPlan(files);
  const tomorrow = localISO(Date.now() + DAY);
  let draft = ((old && old.subjects) || []).filter((s) => files.some((f) => f.id === s.fileId)).map((s) => ({
    fileId: s.fileId, examDate: s.examDate, priority: s.priority === 'high' ? 'high' : 'normal',
    chapters: s.chapters, source: s.source || 'pages', done: { ...(s.done || {}) },
    off: new Set(), loading: false, detailsOpen: false,
  }));
  if (!draft.length) draft.push({ fileId: files[0].id, examDate: localISO(Date.now() + 30 * DAY), priority: 'normal', chapters: null, source: '', done: {}, off: new Set(), loading: false, detailsOpen: false });

  const load = async (s) => {
    s.loading = true; s.chapters = null; s.off = new Set(); paint();
    const f = files.find((x) => x.id === s.fileId);
    const r = await detectChapters(f);
    s.chapters = r.chapters; s.source = r.source; s.loading = false; paint();
  };

  const describeSubjectPace = (s) => {
    if (!s.chapters || !s.examDate) return '';
    const today = startOfDay(Date.now());
    const exam = startOfDay(new Date(s.examDate + 'T00:00:00').getTime());
    const daysLeft = Math.round((exam - today) / DAY);
    if (daysLeft <= 0) return 'Exam date aaj ke baad honi chahiye';
    const activeChs = s.chapters.filter((c) => !s.off.has(c.id) && !(s.done && s.done[c.id]));
    const remPages = activeChs.reduce((a, c) => a + Math.max(1, c.end - c.start + 1), 0);
    const revDays = daysLeft > 6 ? Math.max(2, Math.round(daysLeft * 0.2)) : 0;
    const readDays = Math.max(1, daysLeft - revDays);
    const ppd = Math.ceil((remPages / readDays) * (s.priority === 'high' ? 1.35 : 1));
    const doneCount = s.chapters.filter((c) => !s.off.has(c.id) && s.done && s.done[c.id]).length;
    return `~${ppd} pp/day · ${daysLeft}d left${revDays ? ` (${revDays}d revision buffer)` : ''}${doneCount ? ` · ${doneCount} done ✓` : ''}`;
  };

  window.Sheet.open('<div class="sp-sheet" id="sp-root"></div>');
  function paint() {
    const root = document.getElementById('sp-root'); if (!root) return;
    const used = new Set(draft.map((s) => s.fileId));
    root.innerHTML = `<div class="sp-sheet-h">Exam Plan & Smart Pace</div>
      ${draft.map((s, i) => {
        const fObj = files.find((f) => f.id === s.fileId);
        const lastReadPage = (fObj && fObj.lastPage > 1) ? fObj.lastPage : 0;
        const opts = files.map((f) => `<option value="${esc(f.id)}" ${s.fileId === f.id ? 'selected' : ''} ${used.has(f.id) && s.fileId !== f.id ? 'disabled' : ''}>${esc(bookName(f))}</option>`).join('');
        const paceTxt = describeSubjectPace(s);
        const presets = [7, 15, 30, 60, 90].map((d) => {
          const iso = localISO(Date.now() + d * DAY);
          return `<button type="button" class="sp-pchip ${s.examDate === iso ? 'active' : ''}" data-preset="${i}" data-iso="${iso}">+${d}d</button>`;
        }).join('');
        const chs = s.loading ? '<div class="sp-note">Chapters nikal raha hoon…</div>'
          : s.chapters ? `<details class="sp-det" data-det="${i}" ${s.detailsOpen ? 'open' : ''}><summary>${s.chapters.length - s.off.size} chapters · ${s.source === 'toc' ? 'TOC se' : 'Pages ke blocks'}</summary>
              <div class="sp-PresetsBar" style="margin:6px 0 4px;">
                <button type="button" class="sp-pchip" data-ch-all="${i}">All</button>
                <button type="button" class="sp-pchip" data-ch-none="${i}">None</button>
                ${lastReadPage > 1 ? `<button type="button" class="sp-pchip" data-sync-read="${i}" data-upto="${lastReadPage}">✓ Mark read (≤ p.${lastReadPage})</button>` : ''}
              </div>
              ${s.chapters.map((c) => {
                const isDone = !!(s.done && s.done[c.id]);
                return `<label class="sp-chk"><input type="checkbox" data-i="${i}" data-c="${esc(c.id)}" ${s.off.has(c.id) ? '' : 'checked'}><span>${esc(c.title)} ${isDone ? '✓' : ''} <em>pp. ${c.start}–${c.end}</em></span></label>`;
              }).join('')}
            </details>` : '';
        return `<div class="sp-subj">
          <div class="sp-srow"><select data-book="${i}">${opts}</select>${draft.length > 1 ? `<button class="sp-x" data-rm="${i}" aria-label="Hata do" type="button">✕</button>` : ''}</div>
          <input type="date" data-date="${i}" min="${tomorrow}" value="${esc(s.examDate)}">
          <div class="sp-PresetsBar">
            ${presets}
            <button type="button" class="sp-pchip ${s.priority === 'high' ? 'active' : ''}" data-prio="${i}" title="Give 1.35x daily study pace to this subject">⚡ High Priority</button>
          </div>
          ${paceTxt ? `<div class="sp-pace-pill" data-pace="${i}">${esc(paceTxt)}</div>` : ''}
          ${chs}</div>`;
      }).join('')}
      ${draft.length < files.length ? '<button id="sp-add" class="btn btn-ghost" type="button" style="width:100%;margin:2px 0 4px;">+ Subject jodo</button>' : ''}
      <button id="sp-save" class="btn btn-primary" type="button" style="width:100%;padding:13px;font-weight:800;" ${draft.some((s) => s.loading || !s.chapters) ? 'disabled' : ''}>Save plan</button>
      ${old ? '<button id="sp-remove" class="btn btn-ghost" type="button" style="width:100%;margin-top:8px;color:var(--danger);">Plan hata do</button>' : ''}`;
    root.querySelectorAll('[data-det]').forEach((el) => { el.ontoggle = () => { draft[+el.dataset.det].detailsOpen = el.open; }; });
    root.querySelectorAll('[data-book]').forEach((el) => { el.onchange = () => { const s = draft[+el.dataset.book]; s.fileId = el.value; s.done = {}; load(s); }; });
    root.querySelectorAll('[data-date]').forEach((el) => { el.onchange = () => { draft[+el.dataset.date].examDate = el.value; paint(); }; });
    root.querySelectorAll('[data-preset]').forEach((el) => { el.onclick = () => { draft[+el.dataset.preset].examDate = el.dataset.iso; paint(); }; });
    root.querySelectorAll('[data-prio]').forEach((el) => { el.onclick = () => { const s = draft[+el.dataset.prio]; s.priority = s.priority === 'high' ? 'normal' : 'high'; paint(); }; });
    root.querySelectorAll('[data-rm]').forEach((el) => { el.onclick = () => { draft.splice(+el.dataset.rm, 1); paint(); }; });
    root.querySelectorAll('[data-ch-all]').forEach((el) => { el.onclick = () => { const s = draft[+el.dataset.chAll]; s.detailsOpen = true; s.off.clear(); paint(); }; });
    root.querySelectorAll('[data-ch-none]').forEach((el) => {
      el.onclick = () => {
        const s = draft[+el.dataset.chNone];
        if (s.chapters && s.chapters.length) {
          s.detailsOpen = true;
          s.off = new Set(s.chapters.slice(1).map((c) => c.id));
          paint();
        }
      };
    });
    root.querySelectorAll('[data-sync-read]').forEach((el) => {
      el.onclick = () => {
        const s = draft[+el.dataset.syncRead];
        s.detailsOpen = true;
        const upto = Number(el.dataset.upto) || 1;
        const stamp = startOfDay(Date.now() - DAY);
        s.done = s.done || {};
        let marked = 0;
        (s.chapters || []).forEach((c) => {
          if (c.end <= upto) { s.done[c.id] = stamp; marked++; }
        });
        window.toast(marked ? `${marked} chapters marked read (≤ p.${upto}) ✓` : `No chapters end before p.${upto}`);
        paint();
      };
    });
    root.querySelectorAll('.sp-chk input').forEach((el) => {
      el.onchange = () => {
        const idx = +el.dataset.i;
        const s = draft[idx];
        if (el.checked) s.off.delete(el.dataset.c); else s.off.add(el.dataset.c);
        const sm = el.closest('details').querySelector('summary');
        sm.textContent = `${s.chapters.length - s.off.size} chapters · ${s.source === 'toc' ? 'TOC se' : 'Pages ke blocks'}`;
        const paceEl = root.querySelector(`[data-pace="${idx}"]`);
        if (paceEl) paceEl.textContent = describeSubjectPace(s);
      };
    });
    const add = document.getElementById('sp-add');
    if (add) add.onclick = () => {
      const f = files.find((x) => !used.has(x.id)); if (!f) return;
      const s = { fileId: f.id, examDate: localISO(Date.now() + 30 * DAY), priority: 'normal', chapters: null, source: '', done: {}, off: new Set(), loading: false };
      draft.push(s); load(s);
    };
    const save = document.getElementById('sp-save');
    if (save) save.onclick = async () => {
      const today = startOfDay(Date.now());
      for (const s of draft) {
        if (!s.examDate || new Date(s.examDate + 'T00:00:00').getTime() <= today) { window.toast('Har subject ke liye aaj ke baad ki date chuno'); return; }
        if (s.chapters.length - s.off.size <= 0) { window.toast('Kam se kam ek chapter rakho'); return; }
      }
      const plan = { version: 2, createdAt: (old && old.createdAt) || Date.now(), subjects: draft.map((s) => ({
        fileId: s.fileId, examDate: s.examDate, priority: s.priority || 'normal', source: s.source,
        chapters: s.chapters.filter((c) => !s.off.has(c.id)), done: s.done,
      })) };
      await savePlan(plan);
      window.Sheet.close(); window.toast('Plan set ✅'); window.renderDashboard && window.renderDashboard(false);
    };
    const rm = document.getElementById('sp-remove');
    if (rm) rm.onclick = async () => { await window.DB.del('settings', 'studyPlan').catch(() => savePlan(null)); window.Sheet.close(); window.toast('Plan hata diya'); window.renderDashboard && window.renderDashboard(false); };
  }
  paint();
  for (const s of draft) if (!s.chapters) load(s);
}

window.studyPlanBackHtml = studyPlanBackHtml;
window.bindStudyPlanBack = bindStudyPlanBack;
window.computeStudyToday = computeToday;
window.studyPlanPickLevel = pickLevel;
window.studyPlanPageBlocks = pageBlocks;
window.openStudyPlanSheet = openStudyPlanSheet;
