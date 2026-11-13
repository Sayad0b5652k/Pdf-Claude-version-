// Study plan: one exam date + one book -> a tiny daily goal on Home. Everything stays on this device.
const DAY = 86400000;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Pure planning maths (exported for tests). */
export function computePlan(plan, file, dueCards, now = Date.now()) {
  const today = startOfDay(now);
  const exam = startOfDay(new Date(plan.examDate + 'T00:00:00').getTime());
  const daysLeft = Math.round((exam - today) / DAY);
  const total = Math.max(1, file?.pageCount || 1);
  const cur = Math.min(total, Math.max(1, file?.lastPage || 1));
  // last ~20% of the days (at least 2, when there is room) are kept for revision only
  const revisionDays = daysLeft > 6 ? Math.max(2, Math.round(daysLeft * 0.2)) : 0;
  const readDays = Math.max(1, daysLeft - revisionDays);
  const base = plan.dayBase && plan.dayBase.date === today ? plan.dayBase.page : cur;
  const remainingAtDayStart = Math.max(0, total - base + 1);
  const perDay = daysLeft <= 0 ? 0 : Math.max(1, Math.ceil(remainingAtDayStart / readDays));
  const goalPage = Math.min(total, base + perDay - 1);
  const doneToday = Math.max(0, cur - base);
  const reading = daysLeft > 0 && revisionDays > 0 && daysLeft <= revisionDays ? 'revision' : (cur >= total ? 'finished' : 'reading');
  return { daysLeft, total, cur, base, perDay, goalPage, doneToday, reading, dueCards, today, exam };
}

async function loadPlan() { try { return await window.DB.getSetting('studyPlan', null); } catch { return null; } }
async function savePlan(p) { await window.DB.setting('studyPlan', p); }

async function dueCount(fileId) {
  try {
    const all = await window.DB.all('flashcards'); const now = Date.now();
    return all.filter(c => (!c.due || c.due <= now) && (!fileId || c.fileId === fileId)).length;
  } catch { return 0; }
}

/** Back face of the Reading Analytics card (flip side). Returns inner HTML. */
export async function studyPlanBackHtml(files) {
  const head = `<div class="sp-back-h">Exam plan</div>`;
  if (!files || !files.length) return `${head}<div class="sp-sub">Pehle ek book import karo.</div>`;
  const plan = await loadPlan();
  const file = plan && files.find(f => f.id === plan.fileId);
  if (!plan || !file) {
    return `${head}<div class="sp-big">Exam date set karo</div>
      <div class="sp-sub">Roz ka chhota plan ban jayega: kitne pages padhne hain aur kaun se cards revise karne hain.</div>
      <button id="sp-edit" class="btn btn-primary sp-btn" type="button">Date chuno</button>`;
  }
  const today = startOfDay(Date.now());
  if (!plan.dayBase || plan.dayBase.date !== today) {   // first look of a new day: remember where we were
    plan.dayBase = { date: today, page: Math.max(1, file.lastPage || 1) };
    await savePlan(plan);
  }
  const due = await dueCount(plan.fileId);
  const c = computePlan(plan, file, due);
  const name = window.escapeHtml(file.name.replace(/\.pdf$/i, ''));
  let big, line;
  if (c.daysLeft < 0) { big = 'Exam ho gaya'; line = 'Naya date set karo ya plan hata do.'; }
  else if (c.daysLeft === 0) { big = 'Exam aaj hai'; line = `${due ? due + ' cards revise karo' : 'Sab revise ho gaya'} · All the best!`; }
  else {
    big = `${c.daysLeft} <span>din baaki</span>`;
    if (c.reading === 'revision') line = `Ab sirf revision · <b>${due}</b> cards due`;
    else if (c.reading === 'finished') line = `Book poori padh li · <b>${due}</b> cards due`;
    else if (c.doneToday >= c.perDay) line = `Aaj ka goal poora ✅ · <b>${due}</b> cards due`;
    else line = `Aaj: pages <b>${c.cur}–${c.goalPage}</b> · <b>${due}</b> cards due`;
  }
  const pct = Math.round((c.cur / c.total) * 100);
  return `${head}<div class="sp-big">${big}</div>
    <div class="sp-sub">${line}</div>
    <i class="sp-bar"><u style="width:${pct}%"></u></i>
    <div class="sp-book">${name} · ${pct}% · ${fmtDay(c.exam)}</div>
    <button id="sp-edit" class="btn sp-btn sp-btn-ghost" type="button">Edit plan</button>`;
}

export function bindStudyPlanBack(files) {
  const edit = document.getElementById('sp-edit');
  if (edit) edit.onclick = () => openStudyPlanSheet(files);
  const root = document.getElementById('an-flip');
  const flip = (to) => { window._anFlipped = to; root && root.classList.toggle('flipped', to); };
  const fb = document.getElementById('an-flip-btn'); if (fb) fb.onclick = () => flip(true);
  const bb = document.getElementById('an-back-btn'); if (bb) bb.onclick = () => flip(false);
}

export async function openStudyPlanSheet(files) {
  const plan = await loadPlan();
  const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const opts = (files || []).map(f => `<option value="${window.escapeHtml(f.id)}" ${plan && plan.fileId === f.id ? 'selected' : ''}>${window.escapeHtml(f.name.replace(/\.pdf$/i, ''))}</option>`).join('');
  window.Sheet.open(`
    <div class="sp-sheet">
      <div class="sp-sheet-h">Exam plan</div>
      <label>Kaunsi book?</label>
      <select id="sp-book">${opts}</select>
      <label>Exam kab hai?</label>
      <input id="sp-date" type="date" min="${tomorrow}" value="${plan ? plan.examDate : ''}">
      <p class="sp-note">Book ke pages exam se pehle baant diye jaate hain; aakhri kuch din sirf revision. Date aur progress sirf is device par rehte hain.</p>
      <button id="sp-save" class="btn btn-primary" style="width:100%; padding:13px; font-weight:800;">Save plan</button>
      ${plan ? '<button id="sp-remove" class="btn btn-ghost" style="width:100%; margin-top:8px; color:var(--danger);">Plan hata do</button>' : ''}
    </div>`);
  const save = document.getElementById('sp-save');
  save.onclick = async () => {
    const examDate = document.getElementById('sp-date').value, fileId = document.getElementById('sp-book').value;
    if (!examDate || new Date(examDate + 'T00:00:00') <= new Date(startOfDay(Date.now()))) { window.toast('Aaj ke baad ki date chuno'); return; }
    await savePlan({ fileId, examDate, createdAt: Date.now() });
    window.Sheet.close(); window.toast('Plan set ✅'); window.renderDashboard && window.renderDashboard();
  };
  const rm = document.getElementById('sp-remove');
  if (rm) rm.onclick = async () => { await window.DB.del('settings', 'studyPlan').catch(() => savePlan(null)); window.Sheet.close(); window.toast('Plan hata diya'); window.renderDashboard && window.renderDashboard(); };
}

window.studyPlanBackHtml = studyPlanBackHtml;
window.bindStudyPlanBack = bindStudyPlanBack;
window.computeStudyPlan = computePlan;
