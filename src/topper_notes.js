// @ts-nocheck
// "Topper Notes": one tap turns a book's highlights, underlines and notes into a clean revision sheet
// (page by page, in reading order). Printed through the browser so Hindi renders correctly; "Save as PDF" to share.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
@page{size:A4;margin:15mm 14mm 16mm}
*{box-sizing:border-box}html,body{margin:0;background:#fff}
body{font-family:'Newsreader','Noto Serif Devanagari',Georgia,serif;color:#1d1a16;font-size:11.5pt;line-height:1.5}
.tn-head{border-bottom:2.5px solid #1d1a16;padding-bottom:10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;gap:14px}
.tn-kicker{font:700 8.5pt 'Helvetica Neue',Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#c2410c}
.tn-title{font-size:22pt;font-weight:700;line-height:1.1;margin:4px 0 0}
.tn-meta{font:9pt 'Helvetica Neue',Arial,sans-serif;color:#6b655c;text-align:right;white-space:nowrap}
.tn-pg{display:grid;grid-template-columns:44px 1fr;gap:0 12px;padding:11px 0;border-bottom:1px solid #e6dfd3;break-inside:avoid-page}
.tn-pnum{font:700 9pt 'Helvetica Neue',Arial,sans-serif;color:#c2410c;letter-spacing:.04em;padding-top:3px}
.tn-pnum small{display:block;font-weight:600;color:#9a9286;font-size:7pt;letter-spacing:.14em}
.tn-hl{margin:0 0 6px;padding:2px 0 2px 10px;border-left:4px solid var(--c);}
.tn-hl.u{border-left-style:dotted;text-decoration:underline;text-decoration-color:var(--c);text-underline-offset:3px;text-decoration-thickness:2px}
.tn-note{margin:4px 0 6px;padding:7px 10px;background:#f6f1e7;border-radius:6px;font-size:10.5pt}
.tn-note b{font:700 7.5pt 'Helvetica Neue',Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#6b655c;display:block;margin-bottom:2px}
.tn-foot{margin-top:14px;font:8pt 'Helvetica Neue',Arial,sans-serif;color:#9a9286;text-align:center}
`;

function clip(s, n) {
  const t = (window.stripMarkdown ? window.stripMarkdown(s || '') : String(s || '')).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

/** Builds the sheet HTML from raw records. Pure, so it can be tested without a browser. */
export function buildTopperHtml({ title, annots, notes, date, fontCss = '', withNotes = true }) {
  const byPage = new Map();
  const slot = (p) => { if (!byPage.has(p)) byPage.set(p, { marks: [], notes: [] }); return byPage.get(p); };
  const marks = (annots || []).filter((a) => a && a.rects && a.rects.length && a.text && a.text.trim());
  marks.sort((a, b) => a.page - b.page || (a.rects[0].y - b.rects[0].y) || (a.rects[0].x - b.rects[0].x));
  for (const a of marks) slot(a.page).marks.push(a);
  const usedNotes = withNotes ? (notes || []).filter((n) => n && n.content && n.content.trim()) : [];
  for (const n of usedNotes) slot(n.page || 1).notes.push(n);
  const pages = [...byPage.keys()].sort((a, b) => a - b);

  const body = pages.map((p) => {
    const g = byPage.get(p);
    const hl = g.marks.map((a) => `<p class="tn-hl ${a.type === 'underline' ? 'u' : ''}" style="--c:${esc(a.color || '#ffd84d')}">${esc(clip(a.text, 420))}</p>`).join('');
    const nt = g.notes.map((n) => `<div class="tn-note"><b>Note</b>${esc(clip(n.content, 600))}</div>`).join('');
    return `<section class="tn-pg"><div class="tn-pnum">${p}<small>PAGE</small></div><div>${hl}${nt}</div></section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · Topper Notes</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${fontCss}<style>${CSS}</style>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},400);});</script></head><body>
<header class="tn-head"><div><div class="tn-kicker">Topper Notes</div><h1 class="tn-title">${esc(title)}</h1></div>
<div class="tn-meta">${marks.length} highlights · ${usedNotes.length} notes<br>${esc(date)}</div></header>
${body || '<p>Nothing to show yet.</p>'}
<div class="tn-foot">Made with S.A.Y.A.D.</div></body></html>`;
}

function collectFontCss() {
  let css = '';
  try {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules || []) if (r.type === 5 && /Newsreader|Noto Serif Devanagari/i.test(r.cssText)) css += r.cssText + '\n';
    }
  } catch (e) {}
  return css ? `<style>${css}</style>` : '';
}

export async function openTopperNotes(fileId) {
  const file = (window.State.files || []).find((f) => f.id === fileId) || window.State.currentFile || {};
  const annots = await window.DB.byIndex('annotations', 'fileId', fileId);
  const notes = await window.DB.byIndex('notes', 'fileId', fileId);
  const hasMarks = annots.some((a) => a.rects && a.rects.length && a.text);
  if (!hasMarks && !notes.length) { window.toast('Highlight something or add a note first'); return; }
  const html = buildTopperHtml({
    title: file.name || 'My book', annots, notes,
    date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
    fontCss: collectFontCss(),
  }).replace('<head>', `<head><base href="${esc(location.origin + '/')}">`);

  // 1. Reliable direct HTML download (guaranteed delivery in sandboxed iframes; auto-prints on open)
  const safeName = String(file.name || 'Topper_Notes').replace(/\.pdf$/i, '').replace(/[/\\?%*:|"<>]/g, '_').trim();
  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${safeName} - Topper Notes.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

  // 2. Also attempt in-app print via hidden iframe where allowed
  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    const cleanup = () => setTimeout(() => { try { frame.remove(); } catch (e) {} }, 1500);
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; });
    const w = frame.contentWindow;
    if (w) {
      try { await Promise.race([w.document.fonts && w.document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
      w.onafterprint = cleanup; w.focus(); w.print(); setTimeout(cleanup, 120000);
    } else {
      cleanup();
    }
  } catch (e) {
    // Direct file download above already delivered the printable sheet
  }
  window.toast('Topper Notes downloaded! Open file to print or Save as PDF');
}

window.openTopperNotes = openTopperNotes;
