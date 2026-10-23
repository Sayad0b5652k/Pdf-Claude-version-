// @ts-nocheck

export async function openPageTools(fid){
  const file = await window.DB.get('files', fid);
  if(!file) { window.toast('Book not found'); return; }
  const numPages = file.pageCount || 0;
  const selected = new Set();
  const pageRotations = {}; // pageNum -> degrees turn (90, 180, 270, 0)

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 8px;">
      <div>
        <div class="font-display" style="font-size:17px; font-weight:600;">Page tools</div>
        <div style="font-size:12px; color:var(--text-faint);">Tap pages to select, then choose an action.</div>
      </div>
      <button id="pt-close-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
        ${window.icon('x','icon icon-sm')}
      </button>
    </div>
    <div id="pt-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; max-height:42vh; overflow-y:auto; margin-bottom:12px; padding:2px;"></div>
    <div id="pt-selcount" style="font-size:12px; color:var(--text-faint); margin-bottom:10px; text-align:center;">No pages selected</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <button class="btn btn-ghost" id="pt-rotate" disabled>${window.icon('rotate','icon icon-sm')} Rotate 90°</button>
      <button class="btn btn-ghost" id="pt-delete" disabled>${window.icon('trash','icon icon-sm')} Delete</button>
      <button class="btn btn-ghost" id="pt-extract" disabled>${window.icon('copy','icon icon-sm')} Extract as new book</button>
      <button class="btn btn-ghost" id="pt-merge">${window.icon('merge','icon icon-sm')} Merge with another book</button>
    </div>
  `);

  const closeBtn = document.getElementById('pt-close-x');
  if (closeBtn) closeBtn.onclick = () => window.Sheet.close();

  const grid = document.getElementById('pt-grid');
  const selCountEl = document.getElementById('pt-selcount');
  const actButtons = ['pt-rotate','pt-delete','pt-extract'].map(id=>document.getElementById(id));

  grid.innerHTML = Array.from({length:numPages}, (_,i)=>i+1).map(i=>`
    <div class="pt-page" data-page="${i}" style="position:relative; aspect-ratio:0.72; background:var(--surface-2); border:2px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center;">
      <span class="pt-num font-mono" style="font-size:10.5px; color:var(--text-faint);">${i}</span>
    </div>
  `).join('');

  function updateSelUI(){
    selCountEl.textContent = selected.size ? `${selected.size} page${selected.size>1?'s':''} selected` : 'No pages selected';
    actButtons.forEach(b=>b.disabled = selected.size===0);
    grid.querySelectorAll('.pt-page').forEach(el=>{
      const p = Number(el.dataset.page);
      const on = selected.has(p);
      el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      el.style.boxShadow = on ? '0 0 0 1px var(--accent)' : 'none';
    });
  }

  grid.querySelectorAll('.pt-page').forEach(el=>{
    el.onclick = ()=>{
      const p = Number(el.dataset.page);
      if(selected.has(p)) selected.delete(p); else selected.add(p);
      updateSelUI();
    };
  });
  updateSelUI();

  // Optimized lazy loading doc instance
  let docPromise = null;
  if (window.State.currentDoc && window.State.currentFile && window.State.currentFile.id === fid) {
    docPromise = Promise.resolve(window.State.currentDoc);
  } else {
    docPromise = pdfjsLib.getDocument({data: file.data.slice(0), ...window.PDFJS_LOAD_OPTS}).promise;
  }

  const renderedPages = new Set();
  let observer = null;

  async function renderThumb(pageNum, el) {
    if (renderedPages.has(pageNum)) return;
    renderedPages.add(pageNum);
    try {
      const doc = await docPromise;
      const page = await doc.getPage(pageNum);
      const vp1 = page.getViewport({scale: 1});
      const scale = 110 / vp1.width;
      const vp = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
      canvas.style.cssText = 'width:100%; height:100%; object-fit:cover; transition: transform 0.25s ease;';
      
      const rot = pageRotations[pageNum] || 0;
      if (rot) canvas.style.transform = `rotate(${rot}deg)`;

      const numSpan = el.querySelector('.pt-num');
      if (numSpan) numSpan.style.display = 'none';
      el.appendChild(canvas);
    } catch(e) {
      console.warn('Page thumbnail load error:', e);
    }
  }

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target;
          observer.unobserve(el);
          const pg = Number(el.dataset.page);
          if (pg) renderThumb(pg, el);
        }
      }
    }, { root: grid, rootMargin: '80px 0px' });

    grid.querySelectorAll('.pt-page').forEach(el => observer.observe(el));
  } else {
    grid.querySelectorAll('.pt-page').forEach(el => {
      const pg = Number(el.dataset.page);
      if (pg) renderThumb(pg, el);
    });
  }

  // Bind actions
  document.getElementById('pt-rotate').onclick = async () => {
    const pagesToRotate = [...selected];
    if (!pagesToRotate.length) return;
    
    // Rotate in PDF file and DB without closing the modal
    await rotatePagesInline(fid, pagesToRotate, pageRotations);
    
    // Update thumbnail rotation badge and canvas CSS transform in Page tools
    pagesToRotate.forEach(p => {
      const el = grid.querySelector(`.pt-page[data-page="${p}"]`);
      if (el) {
        const rot = pageRotations[p] || 0;
        let badge = el.querySelector('.pt-rot-badge');
        if (rot) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pt-rot-badge';
            badge.style.cssText = 'position:absolute; top:3px; right:3px; background:var(--accent); color:var(--accent-ink); font-size:9.5px; font-weight:700; padding:1px 4px; border-radius:3px; z-index:5; font-family:IBM Plex Mono, monospace;';
            el.appendChild(badge);
          }
          badge.textContent = `↻ ${rot}°`;
        } else if (badge) {
          badge.remove();
        }

        const cv = el.querySelector('canvas');
        if (cv) {
          cv.style.transform = rot ? `rotate(${rot}deg)` : 'none';
        }
      }
    });
  };

  document.getElementById('pt-delete').onclick = () => confirmDeletePages(fid, [...selected], numPages);
  document.getElementById('pt-extract').onclick = () => extractPagesAsNewBook(fid, [...selected].sort((a,b)=>a-b));
  document.getElementById('pt-merge').onclick = () => openMergeBookPicker(fid);
}

export async function rotatePagesInline(fid, pages, pageRotations){
  if(!pages.length) return;
  window.toast('Rotating…');
  try{
    const full = await window.DB.get('files', fid);
    const raw = await window.DB.normalizeBuffer(full.data);
    if (!raw) throw new Error('Cannot load PDF buffer for rotation');
    const { PDFDocument, degrees } = PDFLib;
    const pdfDoc = await PDFDocument.load(raw.slice(0));
    const docPages = pdfDoc.getPages();
    for(const p of pages){
      const page = docPages[p-1];
      if(!page) continue;
      const current = page.getRotation().angle;
      const newAngle = (current + 90) % 360;
      page.setRotation(degrees(newAngle));
      pageRotations[p] = ((pageRotations[p] || 0) + 90) % 360;
    }
    const bytes = await pdfDoc.save();
    const cleanBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    full.data = cleanBuffer;
    await window.DB.put('files', full);
    
    if(window.State.view==='reader' && window.State.currentFile && window.State.currentFile.id===fid) {
      window.State.currentFile.data = cleanBuffer;
      // Re-load pdfjs document in background without breaking reader view
      window.State.currentDoc = typeof window.loadPdfDocumentSafely === 'function' ? await window.loadPdfDocumentSafely(cleanBuffer) : await pdfjsLib.getDocument({data: cleanBuffer.slice(0), ...window.PDFJS_LOAD_OPTS}).promise;
      if (typeof window.mountReaderContent === 'function') {
        window.mountReaderContent();
      }
    }
    window.toast(`Rotated ${pages.length} page${pages.length>1?'s':''} 90°`);
  }catch(err){
    console.error(err);
    window.toast('Rotate failed — try again');
  }
}

export async function rotatePages(fid, pages){
  await rotatePagesInline(fid, pages, {});
}

export function confirmDeletePages(fid, pages, totalPages){
  if(!pages.length) return;
  if(pages.length >= totalPages){ window.toast("Can't delete every page in a book"); return; }
  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 10px;">
      <div class="font-display" style="font-size:17px; font-weight:600;">Delete ${pages.length} page${pages.length>1?'s':''}?</div>
      <button id="del-close-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
        ${window.icon('x','icon icon-sm')}
      </button>
    </div>
    <div style="font-size:13px; color:var(--text-dim); margin-bottom:20px; line-height:1.5;">
      This removes them from the book for good. Any highlights, notes, bookmarks, or flashcards on those pages are deleted too, and the remaining pages renumber. This can't be undone.
    </div>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-ghost" style="flex:1; padding:12px;" id="cancel-del-pages">Cancel</button>
      <button class="btn" style="flex:1; padding:12px; background:var(--danger); color:#fff;" id="confirm-del-pages">Delete</button>
    </div>
  `);
  document.getElementById('del-close-x').onclick = ()=>window.Sheet.close();
  document.getElementById('cancel-del-pages').onclick = ()=>window.Sheet.close();
  document.getElementById('confirm-del-pages').onclick = ()=>deletePages(fid, pages);
}

export async function deletePages(fid, pages){
  window.toast('Deleting…');
  try{
    const full = await window.DB.get('files', fid);
    const raw = await window.DB.normalizeBuffer(full.data);
    if (!raw) throw new Error('Cannot load PDF buffer for deletion');
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(raw.slice(0));
    const sorted = [...pages].sort((a,b)=>b-a);
    for(const p of sorted) pdfDoc.removePage(p-1);
    const bytes = await pdfDoc.save();
    const cleanBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    full.data = cleanBuffer;
    full.pageCount = pdfDoc.getPageCount();
    await window.DB.put('files', full);
    await remapPageRefsAfterDelete(fid, pages);
    window.Sheet.close();

    const fileIdx = window.State.files.findIndex(f => f.id === fid);
    if (fileIdx !== -1) window.State.files[fileIdx].pageCount = full.pageCount;

    if(window.State.view==='reader' && window.State.currentFile && window.State.currentFile.id===fid) {
      await window.openReader(fid);
    } else if (window.State.view === 'dashboard') {
      window.renderDashboard();
    }
    window.toast('Pages deleted');
  }catch(err){
    console.error(err);
    window.toast('Delete failed — try again');
  }
}

export async function remapPageRefsAfterDelete(fileId, deletedPages){
  const deletedSet = new Set(deletedPages);
  const stores = ['annotations','bookmarks','notes','flashcards'];
  for(const store of stores){
    const recs = await window.DB.byIndex(store, 'fileId', fileId);
    for(const rec of recs){
      if(deletedSet.has(rec.page)){
        await window.DB.del(store, rec.id);
      } else {
        const shift = [...deletedSet].filter(p=>p<rec.page).length;
        if(shift>0){ rec.page -= shift; await window.DB.put(store, rec); }
      }
    }
  }
  const prog = await window.DB.get('progress', fileId);
  if(prog){
    const shift = [...deletedSet].filter(p=>p<=prog.page).length;
    const newPage = Math.max(1, prog.page - shift);
    if(newPage !== prog.page){ prog.page = newPage; await window.DB.put('progress', prog); }
  }
}

export async function extractPagesAsNewBook(fid, pages){
  if(!pages.length){ window.toast('Select at least one page'); return; }
  window.toast('Extracting…');
  try{
    const full = await window.DB.get('files', fid);
    const { PDFDocument } = PDFLib;
    const src = await PDFDocument.load(full.data.slice(0));
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, pages.map(p=>p-1));
    copied.forEach(p=>out.addPage(p));
    const bytes = await out.save();
    window.Sheet.close();
    const newName = `${full.name} (p${pages[0]}-${pages[pages.length-1]})`;
    await window.addBookFromBuffer(newName, bytes, bytes.byteLength, {folder: full.folder||''});
    if (window.State.view === 'dashboard') window.renderDashboard();
    window.toast('New book created from selected pages — find it in your library');
  }catch(err){
    console.error(err);
    window.toast('Extract failed — try again');
  }
}

export async function openMergeBookPicker(fid){
  const others = window.State.files.filter(f=>f.id!==fid);
  if(!others.length){ window.toast('No other books to merge with yet'); return; }
  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 8px;">
      <div>
        <div class="font-display" style="font-size:17px; font-weight:600;">Merge with…</div>
        <div style="font-size:12px; color:var(--text-faint);">Creates a new combined book — original books stay untouched.</div>
      </div>
      <button id="merge-close-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
        ${window.icon('x','icon icon-sm')}
      </button>
    </div>
    <div style="max-height:50vh; overflow-y:auto; margin-top:8px;">
      ${others.map(f=>`<button class="btn mb-pick" data-id="${f.id}" style="width:100%; justify-content:flex-start; gap:10px; padding:11px; background:transparent; border-bottom:1px solid var(--border); border-radius:0; color:var(--text); text-align:left;">
        ${window.icon('book','icon icon-sm')} <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(f.name)}</span>
      </button>`).join('')}
    </div>
  `);
  document.getElementById('merge-close-x').onclick = ()=>window.Sheet.close();
  document.querySelectorAll('.mb-pick').forEach(btn=>{
    btn.onclick = ()=>mergeBooks(fid, btn.dataset.id);
  });
}

export async function mergeBooks(fidA, fidB){
  window.toast('Merging…');
  try{
    const { PDFDocument } = PDFLib;
    const fullA = await window.DB.get('files', fidA);
    const fullB = await window.DB.get('files', fidB);
    const docA = await PDFDocument.load(fullA.data.slice(0));
    const docB = await PDFDocument.load(fullB.data.slice(0));
    const copied = await docA.copyPages(docB, docB.getPageIndices());
    copied.forEach(p=>docA.addPage(p));
    const bytes = await docA.save();
    window.Sheet.close();
    await window.addBookFromBuffer(`${fullA.name} + ${fullB.name}`, bytes, bytes.byteLength, {folder: fullA.folder||''});
    if (window.State.view === 'dashboard') window.renderDashboard();
    window.toast('Merged into a new book — find it in your library');
  }catch(err){
    console.error(err);
    window.toast('Merge failed — try again');
  }
}

// Bind to window for global availability
window.openPageTools = openPageTools;
window.rotatePagesInline = rotatePagesInline;
window.rotatePages = rotatePages;
window.confirmDeletePages = confirmDeletePages;
window.deletePages = deletePages;
window.remapPageRefsAfterDelete = remapPageRefsAfterDelete;
window.extractPagesAsNewBook = extractPagesAsNewBook;
window.openMergeBookPicker = openMergeBookPicker;
window.mergeBooks = mergeBooks;

