// @ts-nocheck
// Share / export a PDF with its annotations.
//  - highlights, underlines and notes become REAL PDF annotations, so any PDF app shows (and can edit) them
//  - the app's own data (incl. freehand drawings) and an edit history ride along inside the PDF as an attachment,
//    so S.A.Y.A.D. can restore everything exactly and keep "edited by A, re-edited by B"
//  - nothing is printed onto the pages (the old "flatten" export is still there as an option)

export const PAYLOAD_NAME = 'sayad-annotations.json';
const NAME_KEY = 'sayad_author_name';

const hexToRgb01 = (hex) => {
  const n = parseInt(String(hex || '#ffd84d').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Reads the S.A.Y.A.D. attachment out of a loaded pdf-lib document. Returns the payload or null. */
export function readSayadPayload(pdfDoc) {
  const { PDFName, PDFDict, PDFArray, decodePDFRawStream } = window.PDFLib;
  try {
    const names = pdfDoc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const ef = names && names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    const arr = ef && ef.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (!arr) return null;
    let found = null;
    for (let i = 0; i + 1 < arr.size(); i += 2) {
      const label = arr.lookup(i);
      if (!label || !label.decodeText || label.decodeText() !== PAYLOAD_NAME) continue;
      const spec = arr.lookup(i + 1, PDFDict);
      const efd = spec && spec.lookupMaybe(PDFName.of('EF'), PDFDict);
      const stream = efd && efd.lookup(PDFName.of('F'));
      if (!stream) continue;
      found = JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
    }
    return found && found.app === 'S.A.Y.A.D.' ? found : null;
  } catch (e) {
    return null;
  }
}

/** Drops an existing S.A.Y.A.D. attachment so re-exporting never leaves two copies. */
function removeSayadAttachment(pdfDoc) {
  const { PDFName, PDFDict, PDFArray } = window.PDFLib;
  try {
    const names = pdfDoc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    const ef = names && names.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
    const arr = ef && ef.lookupMaybe(PDFName.of('Names'), PDFArray);
    if (!arr) return;
    for (let i = arr.size() - 2; i >= 0; i -= 2) {
      const label = arr.lookup(i);
      if (label && label.decodeText && label.decodeText() === PAYLOAD_NAME) { arr.remove(i + 1); arr.remove(i); }
    }
  } catch (e) { /* keep going: worst case an old copy stays, reading takes the newest */ }
}

function plainText(s) {
  const t = window.stripMarkdown ? window.stripMarkdown(s || '') : String(s || '');
  return t.replace(/\s+\n/g, '\n').trim().slice(0, 2000);
}

/**
 * Builds the PDF bytes.
 * @returns {{bytes: Uint8Array, counts: object, skipped: number}}
 */
export async function buildAnnotatedPdf(fileId, { author, includeNotes }) {
  await window.ensureLib('pdflib');
  const { PDFDocument, PDFName, PDFHexString, PDFString } = window.PDFLib;
  const full = await window.DB.get('files', fileId);
  const rawBuf = await window.DB.normalizeBuffer(full.data);
  const pdfDoc = await PDFDocument.load(rawBuf.slice(0));
  const prior = readSayadPayload(pdfDoc);

  const all = await window.DB.byIndex('annotations', 'fileId', fileId);
  const marks = all.filter((a) => a.rects && a.rects.length && (a.type === 'highlight' || a.type === 'underline'));
  const drawings = all.filter((a) => a.kind === 'drawing' && a.json);
  // "Include my notes" off = keep mine private, but never drop notes other people already put in this file
  const notes = includeNotes
    ? (await window.DB.byIndex('notes', 'fileId', fileId)).filter((n) => n.content)
    : ((prior && prior.notes) || []).filter((n) => n.content && n.by && n.by !== author);

  const ctx = pdfDoc.context;
  const pages = pdfDoc.getPages();
  let skipped = 0;

  // A file that already carries our annotations (someone shared it earlier): drop those standard annotations
  // first, they are re-written below from the current data, so deleted ones disappear and nothing doubles up.
  if (prior) {
    const ours = new Set([...(prior.annotations || []).map((x) => String(x.id)), ...(prior.notes || []).map((x) => 'note_' + x.id)]);
    for (const pg of pages) {
      const arr = pg.node.Annots();
      if (!arr) continue;
      for (let i = arr.size() - 1; i >= 0; i--) {
        const d = arr.lookupMaybe(i, window.PDFLib.PDFDict);
        const nm = d && d.lookup(PDFName.of('NM'));
        if (nm && nm.decodeText && ours.has(nm.decodeText())) arr.remove(i);
      }
    }
  }
  const addAnnot = (page, dict) => page.node.addAnnot(ctx.register(ctx.obj(dict)));

  for (const a of marks) {
    const page = pages[a.page - 1];
    if (!page) { skipped++; continue; }
    if (page.getRotation().angle % 360 !== 0) { skipped++; continue; } // coordinates would need rotating; still kept in the attachment
    const box = page.getCropBox();
    const quads = [];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const r of a.rects) {
      const x1 = box.x + r.x * box.width, x2 = box.x + (r.x + r.w) * box.width;
      const yTop = box.y + box.height - r.y * box.height, yBot = box.y + box.height - (r.y + r.h) * box.height;
      quads.push(x1, yTop, x2, yTop, x1, yBot, x2, yBot);
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x2); minY = Math.min(minY, yBot); maxY = Math.max(maxY, yTop);
    }
    addAnnot(page, {
      Type: 'Annot',
      Subtype: a.type === 'underline' ? 'Underline' : 'Highlight',
      Rect: [minX, minY, maxX, maxY],
      QuadPoints: quads,
      C: hexToRgb01(a.color),
      CA: a.type === 'underline' ? 1 : 0.4,
      F: 4,
      T: PDFHexString.fromText(a.by || author),
      Contents: PDFHexString.fromText(a.text || ''),
      M: PDFString.fromDate(new Date(a.createdAt || Date.now())),
      NM: PDFString.of(String(a.id)),
    });
  }

  const perPage = {};
  for (const n of notes) {
    const page = pages[(n.page || 1) - 1];
    if (!page) { skipped++; continue; }
    if (page.getRotation().angle % 360 !== 0) { skipped++; continue; }
    const box = page.getCropBox();
    const slot = perPage[n.page] = (perPage[n.page] || 0) + 1;
    const x = box.x + 8, y = box.y + box.height - 8 - 22 * slot;
    addAnnot(page, {
      Type: 'Annot', Subtype: 'Text', Name: 'Comment',
      Rect: [x, y, x + 18, y + 18],
      F: 28, C: [1, 0.85, 0.2],
      T: PDFHexString.fromText(n.by || author),
      Contents: PDFHexString.fromText(plainText(n.content)),
      M: PDFString.fromDate(new Date(n.createdAt || Date.now())),
      NM: PDFString.of('note_' + String(n.id)),
    });
  }

  const counts = { highlights: marks.filter((m) => m.type !== 'underline').length, underlines: marks.filter((m) => m.type === 'underline').length, notes: notes.length, drawings: drawings.length };
  const now = Date.now();
  const history = (prior && Array.isArray(prior.history) ? prior.history : []).concat([{ by: author, at: now, action: prior ? 're-edited' : 'edited', counts }]);
  const payload = {
    app: 'S.A.Y.A.D.', v: 1, fileName: full.name, exportedAt: now, author, history,
    annotations: marks.map((a) => ({ ...a, by: a.by || author })),
    drawings: drawings.map((d) => ({ id: d.id, page: d.page, kind: 'drawing', json: d.json, updatedAt: d.updatedAt, by: d.by || author })),
    notes: notes.map((n) => ({ id: n.id, page: n.page, kind: n.kind, content: n.content, sourceText: n.sourceText || '', createdAt: n.createdAt, by: n.by || author })),
  };
  removeSayadAttachment(pdfDoc);
  await pdfDoc.attach(new TextEncoder().encode(JSON.stringify(payload)), PAYLOAD_NAME, {
    mimeType: 'application/json', description: 'S.A.Y.A.D. annotation data (lets S.A.Y.A.D. restore and keep editing)',
    creationDate: new Date(now), modificationDate: new Date(now),
  });
  const bytes = await pdfDoc.save();
  return { bytes, counts, skipped, name: full.name };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function openShareAnnotatedSheet(fileId) {
  const all = await window.DB.byIndex('annotations', 'fileId', fileId);
  const nMarks = all.filter((a) => a.rects && a.rects.length).length;
  const nDraw = all.filter((a) => a.kind === 'drawing').length;
  const nNotes = (await window.DB.byIndex('notes', 'fileId', fileId)).length;
  let saved = '';
  try { saved = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  const empty = !nMarks && !nDraw && !nNotes;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 6px;">
      <div class="font-display" style="font-size:17px; font-weight:600;">Share with annotations</div>
      <button id="sa-close" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%;" aria-label="Close">${window.icon('x', 'icon icon-sm')}</button>
    </div>
    <div style="font-size:12.5px; color:var(--text-dim); line-height:1.5; margin-bottom:12px;">
      Annotations stay <b>editable</b>: other PDF apps show them, and S.A.Y.A.D. restores them fully. Nothing is printed onto the pages.
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <span class="chip">${nMarks} highlights/underlines</span><span class="chip">${nNotes} notes</span><span class="chip">${nDraw} drawing pages</span>
    </div>
    <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:6px;">YOUR NAME (shown as "edited by")</label>
    <input id="sa-name" class="input" maxlength="40" placeholder="e.g. Sayad" value="${window.escapeHtml(saved)}" style="width:100%; margin-bottom:12px;">
    <label style="display:flex; align-items:center; gap:10px; font-size:13.5px; margin-bottom:14px; cursor:pointer;">
      <input type="checkbox" id="sa-notes" ${nNotes ? 'checked' : ''} ${nNotes ? '' : 'disabled'}> Include my notes (turn off to keep them private)
    </label>
    <div style="display:flex; gap:8px;">
      ${canShare ? `<button class="btn btn-primary" id="sa-share" style="flex:1; padding:13px;" ${empty ? 'disabled' : ''}>${window.icon('upload', 'icon icon-sm')} Share</button>` : ''}
      <button class="btn ${canShare ? '' : 'btn-primary'}" id="sa-download" style="flex:1; padding:13px;" ${empty ? 'disabled' : ''}>${window.icon('download', 'icon icon-sm')} Download</button>
    </div>
    ${empty ? '<div style="font-size:12px; color:var(--text-faint); margin-top:10px;">Nothing to export yet. Highlight or add a note first.</div>' : ''}
    <button class="btn btn-ghost" id="sa-flat" style="width:100%; margin-top:10px; font-size:12.5px;" ${nMarks ? '' : 'disabled'}>Flatten instead (print highlights onto pages, not editable)</button>
  `);
  document.getElementById('sa-close').onclick = () => window.Sheet.close();

  const run = async (mode) => {
    const author = (document.getElementById('sa-name').value || '').trim() || 'Unknown';
    try { localStorage.setItem(NAME_KEY, author); } catch (e) {}
    const includeNotes = !!document.getElementById('sa-notes').checked;
    window.toast('Preparing PDF…');
    try {
      const { bytes, counts, skipped, name } = await buildAnnotatedPdf(fileId, { author, includeNotes });
      const filename = String(name || 'document').replace(/\.pdf$/i, '') + ' (annotated).pdf';
      const blob = new Blob([bytes], { type: 'application/pdf' });
      let shared = false;
      if (mode === 'share') {
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: filename }); shared = true; }
          catch (e) { if (e && e.name === 'AbortError') return; }
        }
      }
      if (!shared) downloadBlob(blob, filename);
      window.Sheet.close();
      window.toast((shared ? 'Shared' : 'Saved') + (skipped ? ` (${skipped} item${skipped > 1 ? 's' : ''} on rotated pages kept only inside S.A.Y.A.D. data)` : '') + ` · ${counts.highlights + counts.underlines} marks, ${counts.notes} notes`);
    } catch (err) {
      console.error(err);
      window.toast('Export failed. Try again');
    }
  };
  const sh = document.getElementById('sa-share'); if (sh) sh.onclick = () => run('share');
  document.getElementById('sa-download').onclick = () => run('download');
  document.getElementById('sa-flat').onclick = async () => {
    window.Sheet.close();
    const marks = all.filter((a) => a.rects && a.rects.length);
    if (window.exportAnnotatedPdf) window.exportAnnotatedPdf(fileId, marks);
  };
}

/**
 * Puts the annotations from a shared PDF's attachment into this device's database, for the freshly added book.
 * Original ids are kept when free (so a re-share still matches), new ids are made only on a clash.
 */
export async function restoreSayadPayload(fileId, payload) {
  const authors = new Set();
  let total = 0;
  const freeId = async (store, id) => {
    const hit = id ? await window.DB.get(store, id).catch(() => null) : null;
    return hit ? window.uid() : (id || window.uid());
  };
  for (const a of payload.annotations || []) {
    if (!a || !a.rects || !a.rects.length) continue;
    await window.DB.put('annotations', { ...a, id: await freeId('annotations', a.id), fileId });
    if (a.by) authors.add(a.by);
    total++;
  }
  for (const d of payload.drawings || []) {
    if (!d || !d.json) continue;
    await window.DB.put('annotations', { id: `fabric_draw_f${fileId}_p${d.page}`, fileId, page: d.page, kind: 'drawing', json: d.json, updatedAt: d.updatedAt || Date.now(), by: d.by });
    if (d.by) authors.add(d.by);
    total++;
  }
  for (const n of payload.notes || []) {
    if (!n || !n.content) continue;
    await window.DB.put('notes', { ...n, id: await freeId('notes', n.id), fileId });
    if (n.by) authors.add(n.by);
    total++;
  }
  return { total, authors: [...authors] };
}

window.restoreSayadPayload = restoreSayadPayload;
window.openShareAnnotatedSheet = openShareAnnotatedSheet;
window.buildAnnotatedPdf = buildAnnotatedPdf;
window.readSayadPayload = readSayadPayload;
