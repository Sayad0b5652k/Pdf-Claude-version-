// @ts-nocheck
// Split out of reader.js (no behaviour change). Shared reader helpers come back in through ./reader.js.
import { pageEls } from './reader.js';
let tesseractWorker = null;
let tesseractWorkerPromise = null;
export async function getTesseractWorker(){
  if(tesseractWorker) return tesseractWorker;
  if(!tesseractWorkerPromise){
    tesseractWorkerPromise = (async()=>{
      await window.ensureLib('tesseract');
      // English + Hindi covers the books this app is used with; fall back to English alone if the Hindi data cannot be fetched.
      try { return await Tesseract.createWorker('eng+hin'); }
      catch(e){ return await Tesseract.createWorker('eng'); }
    })().then(w => (tesseractWorker = w), err => { tesseractWorkerPromise = null; throw err; });
  }
  return tesseractWorkerPromise;
}

// OCR reads small text badly from a phone-sized bitmap, so the page is painted again at about 2000px wide just for this.
async function ocrCanvasFor(pe, fallback){
  try{
    const page = pe && pe.pageProxy;
    if(!page) return fallback;
    const base = page.getViewport({ scale: 1 });
    let sc = Math.min(3, Math.max(1, 2000 / base.width));
    const px = base.width * base.height * sc * sc;
    if(px > 6e6) sc *= Math.sqrt(6e6 / px);
    const vp = page.getViewport({ scale: sc });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c;
  }catch(e){ return fallback; }
}

function ocrWordsFrom(data, w, h){
  let words = data && data.words;
  if(!words && data && data.blocks) words = data.blocks.flatMap(b => (b.paragraphs || []).flatMap(p => (p.lines || []).flatMap(l => l.words || [])));
  return (words || [])
    .filter(x => x && x.text && x.text.trim() && x.bbox && (x.confidence == null || x.confidence > 25))
    .map(x => ({ t: x.text.trim(), x0: x.bbox.x0 / w, y0: x.bbox.y0 / h, x1: x.bbox.x1 / w, y1: x.bbox.y1 / h }));
}

// Lays an invisible text layer over a scanned page, so it can be selected, highlighted and copied like a normal page.
// Positions are fractions of the page, so the layer follows every zoom level by itself.
export function applyOcrTextLayer(pe, words){
  if(!pe || !pe.textLayerDiv || !pe.nativeVp || !words || !words.length) return false;
  const layer = pe.textLayerDiv;
  layer.textContent = '';
  layer.dataset.ocr = '1';
  const pageH = pe.nativeVp.height;
  const spans = [];
  const frag = document.createDocumentFragment();
  for(const w of words){
    const s = document.createElement('span');
    const hh = Math.max(0.002, w.y1 - w.y0);
    s.textContent = w.t;
    s.style.left = (w.x0 * 100) + '%';
    s.style.top = ((w.y0 + hh * 0.05) * 100) + '%';
    s.style.fontSize = `calc(${(hh * pageH * 0.85).toFixed(2)}px * var(--scale-factor))`;
    s._tw = w.x1 - w.x0;
    frag.appendChild(s);
    spans.push(s);
  }
  layer.appendChild(frag);
  // Stretch every word to the exact width it had on the scan (read all sizes first, then write, to avoid layout thrashing).
  const lr = layer.getBoundingClientRect();
  if(lr.width > 0 && layer.offsetWidth > 0){
    const f = lr.width / layer.offsetWidth;
    const target = layer.offsetWidth;
    const nat = spans.map(s => s.getBoundingClientRect().width / f);
    spans.forEach((s, i) => {
      if(nat[i] > 0.5 && s._tw > 0) s.style.transform = `scaleX(${Math.min(4, Math.max(0.25, (s._tw * target) / nat[i])).toFixed(4)})`;
      s.textContent = s.textContent + ' ';   // so copied text keeps its word spacing
      delete s._tw;
    });
  } else {
    spans.forEach(s => { s.textContent = s.textContent + ' '; delete s._tw; });
  }
  pe.spanRects = null;
  if(pe.ocrBtn){ pe.ocrBtn.remove(); pe.ocrBtn = null; }
  return true;
}

export async function runOCROnPage(pageNum, canvas, btnEl){
  const pe = pageEls[pageNum];
  const key = window.State.currentFile.id + '_' + pageNum;
  const cached = await window.DB.get('ocrcache', key);
  if(cached && cached.words && cached.words.length && pe && applyOcrTextLayer(pe, cached.words)){ return; }
  if(cached && !cached.words){ showOCRResult(pageNum, cached.text); return; }
  btnEl.innerHTML = `${window.icon('clock','icon icon-sm')} Reading…`;
  btnEl.disabled = true;
  try{
    const worker = await getTesseractWorker();
    const src = await ocrCanvasFor(pe, canvas);
    const { data } = await worker.recognize(src);
    const text = (data.text||'').trim();
    const words = ocrWordsFrom(data, src.width, src.height);
    await window.DB.put('ocrcache', {id:key, fileId:window.State.currentFile.id, page:pageNum, text, words});
    try {
      const idx = window.State.searchIndex[window.State.currentFile.id];
      const list = idx && (Array.isArray(idx) ? idx : idx.pages);
      const p = list && list.find(p=>p.page===pageNum);
      if(p) p.text = text.normalize('NFC').replace(/\s+/g,' ').toLowerCase();
    } catch(e) {}
    if(pe && applyOcrTextLayer(pe, words)){
      window.toast('Text ready \u2014 ab select ya highlight kar sakte ho');
    } else {
      btnEl.remove();
      showOCRResult(pageNum, text);
    }
  }catch(err){
    console.warn('OCR failed', err);
    btnEl.innerHTML = `${window.icon('sparkle','icon icon-sm')} Scan text`;
    btnEl.disabled = false;
    window.toast('OCR needs network access — try opening this file in a regular browser tab');
  }
}

export function showOCRResult(pageNum, text){
  const sel = {text: text || '(No text recognized on this page)', pageNum, rects:[]};
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 4px;">Scanned page text</div>
    <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:14px;">Recognized via on-device OCR — page ${pageNum}</div>
    <div class="selectable-text" style="font-size:13.5px; line-height:1.6; white-space:pre-wrap; max-height:38vh; overflow-y:auto; background:var(--surface-2); border-radius:4px; padding:12px; margin-bottom:14px;">${window.escapeHtml(text||'(No text recognized)')}</div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-ghost" style="flex:1;" id="ocr-copy">Copy text</button>
      <button class="btn btn-primary" style="flex:1;" id="ocr-ai">${window.icon('sparkle','icon icon-sm')} AI tools</button>
    </div>
  `);
  document.getElementById('ocr-copy').onclick = async ()=>{ const ok = await window.copyToClipboard(text); window.toast(ok ? 'Copied' : 'Couldn\u2019t copy — try again'); };
  document.getElementById('ocr-ai').onclick = ()=>{ window.pendingSelection = sel; window.openAIMenu(); };
}
