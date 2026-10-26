// @ts-nocheck
/* ======================================================================
   Question paper rendering: the same HTML is used for the on-screen
   preview and for the printable / PDF document (paper, marking scheme,
   student's answers).
   ====================================================================== */
import { TYPE_META, flattenUnits, scorePaper } from './paper_core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const num = (n) => (Number.isInteger(n) ? String(n) : String(n));
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

const T = {
  en: { time: 'Time Allowed', max: 'Maximum Marks', hours: 'hours', minutes: 'minutes', gi: 'General Instructions', or: 'OR', attempt: (n, m) => `Attempt any ${n} of the following ${m} questions.`, marks: 'Marks', each: 'each', key: 'Marking Scheme & Model Answers', mine: 'Student’s Answers', roll: 'Roll No.', name: 'Name', qs: 'Questions', q: 'Question', ans: 'Answer', pts: 'Marking points', unanswered: 'Not attempted', score: 'Score', read: 'Read the following and answer the questions that follow.', extract: 'Read the extract and answer the questions that follow.', map: 'On the outline map, locate and label / identify the following.', words: 'words', seat: 'Class' },
  hi: { time: 'समय', max: 'पूर्णांक', hours: 'घंटे', minutes: 'मिनट', gi: 'सामान्य निर्देश', or: 'अथवा', attempt: (n, m) => `निम्नलिखित ${m} में से किन्हीं ${n} प्रश्नों के उत्तर दीजिए।`, marks: 'अंक', each: 'प्रत्येक', key: 'अंकन योजना एवं आदर्श उत्तर', mine: 'विद्यार्थी के उत्तर', roll: 'अनुक्रमांक', name: 'नाम', qs: 'प्रश्न', q: 'प्रश्न', ans: 'उत्तर', pts: 'अंकन बिंदु', unanswered: 'उत्तर नहीं दिया', score: 'प्राप्तांक', read: 'निम्नलिखित को पढ़कर पूछे गए प्रश्नों के उत्तर दीजिए।', extract: 'दिए गए अंश को पढ़कर प्रश्नों के उत्तर दीजिए।', map: 'रेखा-मानचित्र पर निम्नलिखित को दर्शाइए / पहचानिए।', words: 'शब्द', seat: 'कक्षा' },
};

function timeLabel(rec, t) {
  const m = rec.minutes || 180;
  return m % 60 === 0 ? `${m / 60} ${t.hours}` : m > 60 ? `${Math.floor(m / 60)} ${t.hours} ${m % 60} ${t.minutes}` : `${m} ${t.minutes}`;
}
const boardTitle = (rec) => (rec.board === 'nios' ? 'NATIONAL INSTITUTE OF OPEN SCHOOLING' : 'CENTRAL BOARD OF SECONDARY EDUCATION');
const levelTitle = (rec) => (rec.board === 'nios' ? (rec.level === '12' ? 'SENIOR SECONDARY COURSE' : 'SECONDARY COURSE') : `CLASS ${rec.level}`);

function tableHtml(txt) {
  const rows = String(txt || '').split('\n').map((r) => r.trim()).filter(Boolean);
  if (rows.length < 2 || !rows.some((r) => r.includes('|'))) return txt ? `<p class="pp-data">${nl(txt)}</p>` : '';
  const cells = rows.filter((r) => !/^[\s|:-]+$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  return `<table class="pp-table">${cells.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
}

function optionsHtml(q, key) {
  return `<ol class="pp-opts" type="a">${q.options.map((o, i) => `<li class="${key && i === q.correct ? 'pp-correct' : ''}">${esc(o)}</li>`).join('')}</ol>`;
}

/* One question (or sub-question) body, without its number. */
function bodyHtml(q, o = {}) {
  if (q.type === 'ar') return `<div class="pp-q">${nl(q.q)}</div>${optionsHtml(q, o.key)}`;
  if (q.type === 'mcq') return `<div class="pp-q">${nl(q.q)}</div>${optionsHtml(q, o.key)}`;
  return `<div class="pp-q">${nl(q.q)}</div>${q.type === 'tf' ? '<div class="pp-tf">( True / False )</div>' : ''}`;
}

function compositeHtml(q, t, o = {}) {
  const items = q.items || [];
  let head = '';
  if (q.type === 'passage') head = `<div class="pp-note">${esc(t.read)}</div>${q.title ? `<div class="pp-ptitle">${esc(q.title)}</div>` : ''}<div class="pp-passage">${nl(q.passage)}</div>${q.dataTable ? tableHtml(q.dataTable) : ''}`;
  else if (q.type === 'extract') head = `<div class="pp-note">${esc(t.extract)}</div><div class="pp-passage pp-extract">${nl(q.passage)}</div>`;
  else if (q.type === 'case') head = `${q.title ? `<div class="pp-ptitle">${esc(q.title)}</div>` : ''}<div class="pp-passage">${nl(q.passage)}</div>`;
  else if (q.type === 'map') head = `<div class="pp-note">${esc(t.map)}</div>`;
  const subs = items.map((it, i) => `<div class="pp-sub"><span class="pp-subno">(${ROMAN[i] || i + 1})</span><div class="pp-subbody">${bodyHtml(it, o)}</div><span class="pp-m">${num(it.marks)}</span></div>`).join('');
  return head + subs;
}

function questionHtml(q, t, o = {}) {
  const composite = !!q.items?.length;
  const body = composite ? compositeHtml(q, t, o) : bodyHtml(q, o);
  const mk = composite ? '' : `<span class="pp-m">${num(q.marks)}</span>`;
  const extra = q.type === 'letter' || q.type === 'paragraph' || q.type === 'essay' || q.type === 'notice' || q.type === 'summary' || q.type === 'la' || q.type === 'sa' || q.type === 'vsa' ? (q.words ? `<span class="pp-words">(${esc(String(q.words))} ${t.words})</span>` : '') : '';
  const tools = o.controls ? `<span class="pp-tools" data-no="${q.no}"><button class="pp-tool" data-act="replace" title="Replace this question">↻</button></span>` : '';
  const pill = o.controls && q.verified ? '<span class="pp-ver" title="Answer independently verified">✓</span>' : '';
  return `<div class="pp-qrow" data-qno="${q.no}"><span class="pp-no">${q.no}.</span><div class="pp-qbody">${body}${extra}</div>${mk}${tools}${pill}</div>`;
}

function altHtml(q, t, o) {
  const a = { ...q.alt, no: q.no };
  return `<div class="pp-or">${esc(t.or)}</div>${questionHtml({ ...a, verified: q.alt.verified }, t, { ...o, controls: false }).replace('<span class="pp-no">' + q.no + '.</span>', '<span class="pp-no"></span>')}`;
}

function partIntro(part, t, lang) {
  const first = part.questions[0]?.no, last = part.questions[part.questions.length - 1]?.no;
  if (!first) return '';
  const range = first === last ? `${t.q} ${first}` : `${t.qs} ${first} – ${last}`;
  const name = TYPE_META[part.type]?.name || '';
  const marks = part.marks ? `${num(part.marks)} ${t.marks}${part.count > 1 ? ' ' + t.each : ''}` : '';
  const att = part.attempt && part.attempt < part.count ? ' ' + t.attempt(part.attempt, part.count) : '';
  const topic = part.topic ? ` · ${esc(part.topic)}` : '';
  return `<div class="pp-part"><b>${range}</b> · ${esc(lang === 'hi' ? '' : name)}${lang === 'hi' ? '' : ' · '}${marks}${topic}${att ? `<span class="pp-att">${esc(att)}</span>` : ''}</div>`;
}

/* ----------------------------- Paper ----------------------------- */
export function renderPaperHtml(rec, o = {}) {
  const t = T[rec.lang === 'hi' ? 'hi' : 'en'];
  const head = `
    <header class="pp-head">
      ${rec.config?.school ? `<div class="pp-school">${esc(rec.config.school)}</div>` : ''}
      <div class="pp-board">${esc(boardTitle(rec))}</div>
      <div class="pp-exam">${esc(rec.config?.exam || (rec.board === 'nios' ? 'Public Examination · Sample Question Paper' : 'Sample Question Paper'))} · ${esc(levelTitle(rec))}</div>
      <div class="pp-subject">${esc(rec.subject)}</div>
      <div class="pp-meta"><span>${t.time}: ${timeLabel(rec, t)}</span><span>${t.max}: ${num(rec.marks)}</span></div>
      ${o.rollBox ? `<div class="pp-roll"><span>${t.name}: ____________________</span><span>${t.roll}: ____________</span></div>` : ''}
    </header>
    ${rec.instructions?.length ? `<section class="pp-gi"><div class="pp-gih">${t.gi}</div><ol>${rec.instructions.map((i) => `<li>${esc(i)}</li>`).join('')}</ol></section>` : ''}`;
  const body = (rec.sections || []).map((s) => `
    <section class="pp-sec">
      <div class="pp-sech"><div class="pp-secname">${esc(s.title)}</div>${s.blurb ? `<div class="pp-secsub">${esc(s.blurb)}</div>` : ''}</div>
      ${s.parts.map((p) => `${partIntro(p, t, rec.lang)}${p.questions.map((q) => `${questionHtml(q, t, o)}${q.alt ? altHtml(q, t, o) : ''}`).join('')}${p.missing ? `<div class="pp-missing">${p.missing} question${p.missing > 1 ? 's' : ''} could not be generated for this part.</div>` : ''}`).join('')}
    </section>`).join('');
  return `${head}${body}<div class="pp-end">— ${rec.lang === 'hi' ? 'समाप्त' : 'End of Paper'} —</div>`;
}

/* -------------------------- Marking scheme -------------------------- */
function answerLine(q, t) {
  if (q.type === 'mcq' || q.type === 'ar') return `<b>(${'abcd'[q.correct]})</b> ${esc(q.options[q.correct])}`;
  if (q.type === 'tf') return `<b>${esc(q.answer)}</b>`;
  return nl(q.answer);
}
function pointsHtml(q, t) {
  if (!q.points?.length) return '';
  return `<table class="pp-pts"><tr><th>${t.pts}</th><th>${t.marks}</th></tr>${q.points.map((p) => `<tr><td>${esc(p.t)}</td><td>${num(p.m)}</td></tr>`).join('')}</table>`;
}
function keyBlock(q, t, o, label) {
  const subs = q.items?.length ? q.items.map((it, i) => `<div class="pp-ksub"><b>(${ROMAN[i] || i + 1})</b> ${answerLine(it, t)} <span class="pp-m">[${num(it.marks)}]</span>${pointsHtml(it, t)}${o.refs && it.evidence ? `<div class="pp-ref">“${esc(it.evidence)}”</div>` : ''}</div>`).join('') : `${answerLine(q, t)}${pointsHtml(q, t)}${q.explain ? `<div class="pp-expl">${nl(q.explain)}</div>` : ''}`;
  const ref = o.refs && (q.page || q.chapter) ? `<div class="pp-ref">${q.chapter ? esc(q.chapter) : ''}${q.page ? ` · p. ${q.page}` : ''}${q.evidence && !q.items?.length ? ` — “${esc(q.evidence)}”` : ''}</div>` : '';
  return `<div class="pp-krow"><span class="pp-no">${label}</span><div class="pp-qbody">${subs}${ref}</div></div>`;
}
export function renderKeyHtml(rec, o = {}) {
  const t = T[rec.lang === 'hi' ? 'hi' : 'en'];
  return `<h2 class="pp-doch">${t.key}</h2><div class="pp-docsub">${esc(rec.subject)} · ${num(rec.marks)} ${t.marks}</div>` + (rec.sections || []).map((s) => `
    <section class="pp-sec"><div class="pp-sech"><div class="pp-secname">${esc(s.title)}</div></div>
    ${s.parts.map((p) => p.questions.map((q) => keyBlock(q, t, o, q.no + '.') + (q.alt ? `<div class="pp-or">${t.or}</div>` + keyBlock(q.alt, t, o, '') : '')).join('')).join('')}</section>`).join('');
}

/* ---------------------------- Student answers ---------------------------- */
export function renderMineHtml(rec) {
  const t = T[rec.lang === 'hi' ? 'hi' : 'en'];
  const at = rec.attempt || {};
  const units = flattenUnits(rec);
  const sc = scorePaper(rec, at.answers || {}, at.self || {});
  const shown = (q, a) => {
    if (a === undefined || a === '' || a === null) return `<i class="pp-na">${t.unanswered}</i>`;
    if (q.type === 'mcq' || q.type === 'ar') return `<b>(${'abcd'[a]})</b> ${esc(q.options[a] || '')}`;
    if (q.type === 'tf') return esc(a === true || a === 'true' ? (rec.lang === 'hi' ? 'सही' : 'True') : (rec.lang === 'hi' ? 'गलत' : 'False'));
    return nl(a);
  };
  const rows = units.map((u) => {
    const a = at.answers?.[u.id];
    const ai = at.ai?.[u.id];
    const mk = at.self?.[u.id] ?? ai?.marks;
    return `<div class="pp-krow"><span class="pp-no">${esc(u.label)}</span><div class="pp-qbody">${shown(u.q, a)}${typeof mk === 'number' ? `<span class="pp-got">${num(mk)} / ${num(u.q.marks)}</span>` : ''}${ai?.feedback ? `<div class="pp-expl">${esc(ai.feedback)}</div>` : ''}</div></div>`;
  }).join('');
  return `<h2 class="pp-doch">${t.mine}</h2><div class="pp-docsub">${esc(rec.subject)} · ${t.score}: ${num(sc.got)} / ${num(sc.max)}</div>${rows}`;
}

/* --------------------------------- CSS --------------------------------- */
export const PAPER_CSS = `
.pp-sheet{font-family:'Newsreader','Noto Serif Devanagari','Times New Roman',serif;color:#14181a;font-size:14px;line-height:1.5}
.pp-head{text-align:center;border-bottom:2px solid #14181a;padding-bottom:10px;margin-bottom:12px}
.pp-school{font-size:17px;font-weight:700;letter-spacing:.02em;margin-bottom:2px}
.pp-board{font-size:11px;letter-spacing:.18em;font-weight:600;color:#444}
.pp-exam{font-size:12px;margin-top:2px;color:#333}
.pp-subject{font-size:21px;font-weight:700;margin:6px 0 8px}
.pp-meta{display:flex;justify-content:space-between;font-weight:600;font-size:13px}
.pp-roll{display:flex;justify-content:space-between;font-size:12.5px;margin-top:12px;color:#222}
.pp-gi{border:1px solid #14181a;padding:8px 14px;margin-bottom:14px;font-size:12.5px}
.pp-gih{font-weight:700;margin-bottom:3px}
.pp-gi ol{margin:0;padding-left:18px}
.pp-sec{margin-bottom:10px}
.pp-sech{text-align:center;margin:16px 0 8px;break-after:avoid}
.pp-secname{display:inline-block;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13.5px;border-top:1.5px solid #14181a;border-bottom:1.5px solid #14181a;padding:3px 16px}
.pp-secsub{font-size:11.5px;font-style:italic;color:#444;margin-top:3px}
.pp-part{font-size:12px;margin:12px 0 6px;color:#222;break-after:avoid}
.pp-part b{font-weight:700}
.pp-att{display:block;font-style:italic;color:#444}
.pp-qrow,.pp-krow{display:flex;gap:8px;align-items:flex-start;margin:7px 0;position:relative;break-inside:avoid}
.pp-no{min-width:26px;font-weight:700}
.pp-qbody{flex:1;min-width:0}
.pp-m{font-weight:700;white-space:nowrap;font-size:12.5px}
.pp-m::before{content:'[';font-weight:400}.pp-m::after{content:']';font-weight:400}
.pp-words{font-size:11.5px;color:#555;font-style:italic;display:block;margin-top:2px}
.pp-opts{margin:4px 0 0;padding-left:20px;display:grid;grid-template-columns:1fr 1fr;gap:2px 22px;list-style-type:lower-alpha}
.pp-opts li::marker{font-weight:600}
.pp-correct{font-weight:700;text-decoration:underline}
.pp-tf{font-size:12px;color:#444;margin-top:2px}
.pp-or{text-align:center;font-weight:700;letter-spacing:.14em;font-size:12px;margin:6px 0}
.pp-passage{border:1px solid #9aa3a0;background:#f7f8f5;padding:8px 12px;margin:6px 0 8px;font-size:13.2px;white-space:pre-wrap}
.pp-extract{font-style:italic}
.pp-ptitle{font-weight:700;margin:6px 0 2px}
.pp-note{font-size:12px;font-style:italic;color:#333;margin-top:2px}
.pp-sub{display:flex;gap:8px;margin:5px 0;align-items:flex-start}
.pp-subno{min-width:26px;font-weight:600}
.pp-subbody{flex:1;min-width:0}
.pp-table{border-collapse:collapse;margin:6px 0;font-size:12.5px}
.pp-table th,.pp-table td{border:1px solid #14181a;padding:3px 10px}
.pp-table th{background:#e9ece6}
.pp-pts{border-collapse:collapse;margin:4px 0;font-size:12px;width:100%}
.pp-pts th,.pp-pts td{border:1px solid #b7beba;padding:2px 8px;text-align:left}
.pp-pts th:last-child,.pp-pts td:last-child{width:48px;text-align:center}
.pp-pts th{background:#eef0ea}
.pp-ksub{margin:5px 0}
.pp-expl{font-size:11.8px;color:#444;margin-top:3px;font-style:italic}
.pp-ref{font-size:11px;color:#666;margin-top:2px}
.pp-got{display:inline-block;margin-left:10px;font-weight:700;font-size:12px;color:#0b6b3a}
.pp-na{color:#888}
.pp-end{text-align:center;font-size:12px;letter-spacing:.2em;margin:18px 0 4px;color:#444}
.pp-doch{font-size:19px;margin:0 0 2px;text-align:center}
.pp-docsub{text-align:center;font-size:12px;color:#444;margin-bottom:14px;border-bottom:1px solid #14181a;padding-bottom:8px}
.pp-missing{font-size:12px;color:#a33;border:1px dashed #a33;padding:4px 8px;margin:6px 0}
.pp-tools{position:absolute;right:-6px;top:-4px;display:none}
.pp-qrow:hover .pp-tools{display:block}
.pp-tool{border:1px solid #9aa3a0;background:#fff;border-radius:6px;font-size:13px;width:24px;height:24px;cursor:pointer;color:#333}
.pp-ver{position:absolute;right:30px;top:-2px;font-size:11px;color:#0b6b3a;font-family:sans-serif}
.pp-pagebreak{break-before:page}
`;

/* ----------------------------- Print document ----------------------------- */
export function buildPrintDocument(rec, o = {}) {
  const parts = [];
  if (o.paper !== false) parts.push(`<div>${renderPaperHtml(rec, { rollBox: o.rollBox !== false })}</div>`);
  if (o.key) parts.push(`<div class="${parts.length ? 'pp-pagebreak' : ''}">${renderKeyHtml(rec, { refs: o.refs })}</div>`);
  if (o.mine) parts.push(`<div class="${parts.length ? 'pp-pagebreak' : ''}">${renderMineHtml(rec)}</div>`);
  const title = `${rec.title || rec.subject}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `<!doctype html><html lang="${rec.lang === 'hi' ? 'hi' : 'en'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<base href="${esc(o.baseHref || '')}">
${o.fontCss || ''}
<style>@page{size:A4;margin:16mm 14mm 16mm}*{box-sizing:border-box}html,body{margin:0;background:#fff}body{padding:0}${PAPER_CSS}
@media print{.pp-tools,.pp-ver{display:none!important}}</style></head><body class="pp-sheet">${parts.join('')}</body></html>`;
}

/* Prints through a hidden iframe so the user can "Save as PDF" (works for Hindi too). */
/* The app bundles its fonts; copy the @font-face rules for the paper fonts into the print frame. */
function collectPaperFontCss() {
  let css = '';
  try {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules || []) {
        if (r.type === 5 && /Newsreader|Noto Serif Devanagari/i.test(r.cssText)) css += r.cssText + '\n';
      }
    }
  } catch (e) {}
  return css ? `<style>${css}</style>` : '';
}

export async function printPaper(rec, o = {}) {
  const html = buildPrintDocument(rec, { ...o, baseHref: location.origin + '/', fontCss: collectPaperFontCss() });
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => { try { frame.remove(); } catch (e) {} }, 1500);
  await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; });
  const w = frame.contentWindow;
  try { await Promise.race([w.document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  try {
    w.onafterprint = cleanup;
    w.focus();
    w.print();
    setTimeout(cleanup, 120000);
    return true;
  } catch (e) {
    cleanup();
    // fallback: open the document in a tab so the browser's own print / save works
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    return false;
  }
}
