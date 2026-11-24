// @ts-nocheck

export async function openPageTools(fid){
  if (!fid) fid = window.State && window.State.currentFile && window.State.currentFile.id; if (!fid) return;
  const file = await window.DB.get('files', fid);
  if(!file) { window.toast('Book not found'); return; }
  const numPages = file.pageCount || 0;
  const selected = new Set();
  const pageRotations = {}; // pageNum -> degrees turn (90, 180, 270, 0)

  const gridHtml = Array.from({length:numPages}, (_,i)=>i+1).map(i=>`
    <div class="pt-page" data-page="${i}" style="position:relative; aspect-ratio:0.72; background:var(--surface-2); border:2px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center;">
      <span class="pt-num font-mono" style="font-size:10.5px; color:var(--text-faint);">${i}</span>
    </div>
  `).join('');

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
    <div id="pt-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; max-height:42vh; overflow-y:auto; margin-bottom:12px; padding:2px;">${gridHtml}</div>
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
  const thumbQueue = [];
  let activeThumbs = 0;
  let observer = null;
  let thumbsReady = false;

  async function renderThumbNow(pageNum, el) {
    try {
      const doc = await docPromise;
      if (!el.isConnected) return;
      const page = await doc.getPage(pageNum);
      const vp1 = page.getViewport({scale: 1});
      const scale = 110 / vp1.width;
      const vp = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
      if (!el.isConnected) return;
      canvas.style.cssText = 'width:100%; height:100%; object-fit:cover; opacity:0; transition: opacity 0.18s ease, transform 0.25s ease;';
      
      const rot = pageRotations[pageNum] || 0;
      if (rot) canvas.style.transform = `rotate(${rot}deg)`;

      const numSpan = el.querySelector('.pt-num');
      if (numSpan) numSpan.style.display = 'none';
      el.appendChild(canvas);
      requestAnimationFrame(() => { canvas.style.opacity = '1'; });
    } catch(e) {
      console.warn('Page thumbnail load error:', e);
    }
  }

  function pumpThumbQueue() {
    if (!thumbsReady) return;
    while (activeThumbs < 2 && thumbQueue.length > 0) {
      const item = thumbQueue.shift();
      if (!item || !item.el.isConnected) continue;
      activeThumbs++;
      renderThumbNow(item.pageNum, item.el).finally(() => {
        activeThumbs = Math.max(0, activeThumbs - 1);
        pumpThumbQueue();
      });
    }
  }

  function renderThumb(pageNum, el) {
    if (renderedPages.has(pageNum)) return;
    renderedPages.add(pageNum);
    thumbQueue.push({ pageNum, el });
    pumpThumbQueue();
  }

  setTimeout(() => {
    thumbsReady = true;
    pumpThumbQueue();
  }, 220);

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
    if (typeof window.ensureLib === 'function') await window.ensureLib('pdflib');
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
    if (typeof window.ensureLib === 'function') await window.ensureLib('pdflib');
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
    if (typeof window.ensureLib === 'function') await window.ensureLib('pdflib');
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

function buildDefaultMergedTitle(books) {
  if (!books || !books.length) return 'Merged Book';
  if (books.length === 1) return books[0].name;
  if (books.length === 2) return `${books[0].name} + ${books[1].name}`;
  return `${books[0].name} + ${books.length - 1} more`;
}

async function generateFirstPageThumb(rawBuffer) {
  try {
    const doc = typeof window.loadPdfDocumentSafely === 'function'
      ? await window.loadPdfDocumentSafely(rawBuffer)
      : await window.pdfjsLib.getDocument({ data: rawBuffer.slice(0), ...(window.PDFJS_LOAD_OPTS || {}) }).promise;
    const page1 = await doc.getPage(1);
    const vp = page1.getViewport({ scale: 1 });
    const targetWidth = 300 * Math.min(window.devicePixelRatio || 1, 2);
    const scale = targetWidth / (vp.width || 300);
    const thumbVp = page1.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = thumbVp.width;
    canvas.height = thumbVp.height;
    await page1.render({ canvasContext: canvas.getContext('2d'), viewport: thumbVp }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('Merged thumbnail generation skipped:', e);
    return '';
  }
}

async function clearBookTextCaches(fileId) {
  const cacheStores = ['ocrcache', 'pagecache'];
  for (const store of cacheStores) {
    try {
      const recs = await window.DB.byIndex(store, 'fileId', fileId);
      for (const rec of recs) {
        await window.DB.del(store, rec.id);
      }
    } catch (e) {
      console.warn(`Cache clear skipped for ${store}:`, e);
    }
  }
}

async function shiftOrMigrateStudyRecords(sourceFileId, targetFileId, pageOffset) {
  const stores = ['annotations', 'bookmarks', 'notes', 'flashcards'];
  const isCrossBook = sourceFileId !== targetFileId;
  for (const store of stores) {
    try {
      const recs = await window.DB.byIndex(store, 'fileId', sourceFileId);
      for (const rec of recs) {
        const updated = {
          ...rec,
          id: isCrossBook ? window.uid() : rec.id,
          fileId: targetFileId
        };
        if (typeof updated.page === 'number' && pageOffset !== 0) {
          updated.page = Math.max(1, updated.page + pageOffset);
        }
        await window.DB.put(store, updated);
      }
    } catch (e) {
      console.warn(`Study record migration skipped for ${store}:`, e);
    }
  }
}

async function deleteBookAndOrphans(fileId) {
  await window.DB.del('files', fileId);
  const indexedStores = ['annotations', 'bookmarks', 'notes', 'flashcards', 'ocrcache', 'pagecache'];
  for (const store of indexedStores) {
    try {
      const recs = await window.DB.byIndex(store, 'fileId', fileId);
      for (const rec of recs) await window.DB.del(store, rec.id);
    } catch (e) {}
  }
  try { await window.DB.del('progress', fileId); } catch (e) {}
  window.State.files = (window.State.files || []).filter(f => f.id !== fileId);
}

window.deleteBookAndOrphans = deleteBookAndOrphans;

export async function openMergeBookPicker(initialFid = null) {
  const allBooks = [...(window.State.files || [])];
  if (allBooks.length < 2) {
    window.toast('Need at least 2 books in your library to merge');
    return;
  }

  const queueIds = [];
  if (initialFid && allBooks.some(f => f.id === initialFid)) {
    queueIds.push(initialFid);
  }

  let outputMode = initialFid ? 'existing' : 'new'; // 'existing' | 'new'
  let targetId = initialFid || allBooks[0].id;
  let deleteSources = true; // Smart default: prevents extra duplicate books cluttering Library
  let migrateStudyData = true;
  let titleEditedManually = false;
  let customTitle = '';
  let libraryFilter = '';
  let isMerging = false;

  const getBook = (id) => allBooks.find(f => f.id === id);

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 8px;">
      <div>
        <div class="font-display" style="font-size:17px; font-weight:700;">Multi-Book PDF Merger</div>
        <div style="font-size:12px; color:var(--text-faint);">Combine 2 or more books in any order into an existing book or a new one.</div>
      </div>
      <button id="merge-close-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
        ${window.icon('x', 'icon icon-sm')}
      </button>
    </div>

    <div id="merge-studio-body" style="max-height:70vh; overflow-y:auto; padding-right:2px;"></div>
  `);

  const bodyEl = document.getElementById('merge-studio-body');
  const closeBtn = document.getElementById('merge-close-x');
  if (closeBtn) closeBtn.onclick = () => { if (!isMerging) window.Sheet.close(); };

  function renderStudio() {
    const queuedBooks = queueIds.map(getBook).filter(Boolean);
    if (!queueIds.includes(targetId)) {
      targetId = queueIds[0] || allBooks[0].id;
    }
    if (!titleEditedManually) {
      customTitle = buildDefaultMergedTitle(queuedBooks);
    }

    const totalPages = queuedBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const totalBytes = queuedBooks.reduce((sum, b) => sum + (b.size || 0), 0);

    const remainingBooks = allBooks.filter(f => {
      if (queueIds.includes(f.id)) return false;
      if (!libraryFilter.trim()) return true;
      return (f.name || '').toLowerCase().includes(libraryFilter.trim().toLowerCase());
    });

    const canMerge = queuedBooks.length >= 2 && !isMerging;

    bodyEl.innerHTML = `
      <!-- 1. Selected Queue -->
      <div style="margin-top:6px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim);">
            1. Merge Order (${queuedBooks.length} selected)
          </span>
          <span class="font-mono" style="font-size:11px; color:var(--accent); font-weight:700;">
            ${queuedBooks.length ? `${totalPages} pages · ${window.fmtBytes ? window.fmtBytes(totalBytes) : ''}` : 'Pick at least 2 books'}
          </span>
        </div>

        ${queuedBooks.length === 0 ? `
          <div style="padding:14px; border-radius:10px; border:1px dashed var(--border); background:var(--surface-2); text-align:center; font-size:12.5px; color:var(--text-faint);">
            Tap books below in the order you want their pages combined.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${queuedBooks.map((b, idx) => `
              <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; background:var(--surface-2); border:1px solid ${outputMode === 'existing' && targetId === b.id ? 'var(--accent)' : 'var(--border)'};">
                <span class="font-mono" style="width:22px; height:22px; border-radius:6px; background:var(--accent-soft); color:var(--accent); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  ${idx + 1}
                </span>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; font-weight:600; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${window.escapeHtml(b.name)}
                  </div>
                  <div style="font-size:11px; color:var(--text-faint); display:flex; align-items:center; gap:6px;">
                    <span class="font-mono">${b.pageCount || '?'} pg</span>
                    ${outputMode === 'existing' && targetId === b.id ? '<span style="color:var(--accent); font-weight:700;">• Target Book</span>' : ''}
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:3px; flex-shrink:0;">
                  <button class="btn btn-icon merge-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up" style="width:28px; height:28px; border-radius:7px; background:var(--surface); border:1px solid var(--border); font-size:11px; opacity:${idx === 0 ? '0.35' : '1'};">▲</button>
                  <button class="btn btn-icon merge-move-down" data-idx="${idx}" ${idx === queuedBooks.length - 1 ? 'disabled' : ''} title="Move down" style="width:28px; height:28px; border-radius:7px; background:var(--surface); border:1px solid var(--border); font-size:11px; opacity:${idx === queuedBooks.length - 1 ? '0.35' : '1'};">▼</button>
                  <button class="btn btn-icon merge-remove-q" data-id="${b.id}" title="Remove" style="width:28px; height:28px; border-radius:7px; background:var(--surface); border:1px solid var(--border); color:var(--danger); font-size:12px;">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- 2. Add More Books -->
      <div style="margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim);">
            2. Add Books from Library
          </span>
          ${allBooks.length - queueIds.length > 0 ? `<button id="merge-add-all-btn" class="btn btn-ghost" style="padding:3px 9px; font-size:11px; border-radius:7px;">+ Add All</button>` : ''}
        </div>

        ${allBooks.length > 5 ? `
          <input id="merge-lib-filter" value="${window.escapeHtml(libraryFilter)}" placeholder="Filter library books…" style="width:100%; padding:8px 11px; font-size:12.5px; border-radius:8px; background:var(--surface-2); border:1px solid var(--border); margin-bottom:8px;" />
        ` : ''}

        <div style="max-height:155px; overflow-y:auto; border:1px solid var(--border); border-radius:10px; background:var(--surface);">
          ${remainingBooks.length === 0 ? `
            <div style="padding:12px; font-size:12px; color:var(--text-faint); text-align:center;">
              ${queueIds.length === allBooks.length ? 'All library books added to merge queue.' : 'No matching books found.'}
            </div>
          ` : remainingBooks.map(f => `
            <button class="btn mb-add-book" data-id="${f.id}" style="width:100%; justify-content:space-between; gap:10px; padding:9px 11px; background:transparent; border-bottom:1px solid var(--border); border-radius:0; color:var(--text); text-align:left;">
              <span style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span style="color:var(--accent); font-weight:800;">+</span>
                <span style="font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(f.name)}</span>
              </span>
              <span class="font-mono" style="font-size:11px; color:var(--text-faint); flex-shrink:0;">${f.pageCount || '?'} pg</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 3. Output / Save Options -->
      <div style="margin-bottom:14px; padding:12px; border-radius:12px; background:var(--surface-2); border:1px solid var(--border);">
        <div style="font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-dim); margin-bottom:8px;">
          3. Save Mode
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px;">
          <button id="merge-mode-existing" class="btn" style="padding:9px 8px; font-size:12px; font-weight:700; border-radius:9px; flex-direction:column; gap:2px;
            background:${outputMode === 'existing' ? 'var(--accent-soft)' : 'var(--surface)'};
            color:${outputMode === 'existing' ? 'var(--accent)' : 'var(--text)'};
            border:1.5px solid ${outputMode === 'existing' ? 'var(--accent)' : 'var(--border)'};">
            <span>Update Existing Book</span>
            <span style="font-size:10px; opacity:0.78; font-weight:500;">Append into 1 book</span>
          </button>
          <button id="merge-mode-new" class="btn" style="padding:9px 8px; font-size:12px; font-weight:700; border-radius:9px; flex-direction:column; gap:2px;
            background:${outputMode === 'new' ? 'var(--accent-soft)' : 'var(--surface)'};
            color:${outputMode === 'new' ? 'var(--accent)' : 'var(--text)'};
            border:1.5px solid ${outputMode === 'new' ? 'var(--accent)' : 'var(--border)'};">
            <span>Save as New Book</span>
            <span style="font-size:10px; opacity:0.78; font-weight:500;">Create fresh combined PDF</span>
          </button>
        </div>

        ${outputMode === 'existing' ? `
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11.5px; color:var(--text-dim); margin-bottom:4px; font-weight:600;">Target book to update:</label>
            <select id="merge-target-select" style="width:100%; padding:8px 10px; font-size:12.5px; border-radius:8px; background:var(--surface); border:1px solid var(--border); color:var(--text);" ${queuedBooks.length === 0 ? 'disabled' : ''}>
              ${queuedBooks.length === 0
                ? '<option value="">Select books above first</option>'
                : queuedBooks.map(b => `<option value="${b.id}" ${b.id === targetId ? 'selected' : ''}>${window.escapeHtml(b.name)} (${b.pageCount || '?'} pg)</option>`).join('')}
            </select>
          </div>
        ` : `
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:11.5px; color:var(--text-dim); margin-bottom:4px; font-weight:600;">New book name:</label>
            <input id="merge-new-title" value="${window.escapeHtml(customTitle)}" placeholder="Enter merged book title…" style="width:100%; padding:8px 10px; font-size:12.5px; border-radius:8px; background:var(--surface); border:1px solid var(--border); color:var(--text);" />
          </div>
        `}

        <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; font-size:12px; color:var(--text); margin-bottom:8px; line-height:1.4;">
          <input type="checkbox" id="merge-delete-sources" ${deleteSources ? 'checked' : ''} style="margin-top:2px; width:15px; height:15px; accent-color:var(--accent);" />
          <span>
            <strong>${outputMode === 'existing' ? 'Delete other source books after merge' : 'Delete original source books after creating new book'}</strong>
            <div style="font-size:11px; color:var(--text-faint);">
              ${outputMode === 'existing'
                ? 'Prevents duplicate books — keeps only your updated target book.'
                : 'Removes old individual copies so only the combined book remains.'}
            </div>
          </span>
        </label>

        <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; font-size:12px; color:var(--text); line-height:1.4;">
          <input type="checkbox" id="merge-migrate-data" ${migrateStudyData ? 'checked' : ''} style="margin-top:2px; width:15px; height:15px; accent-color:var(--accent);" />
          <span>
            <strong>Preserve &amp; remap highlights, bookmarks, notes &amp; flashcards</strong>
            <div style="font-size:11px; color:var(--text-faint);">Automatically adjusts page numbers to match the merged PDF.</div>
          </span>
        </label>
      </div>

      <!-- Action Footer -->
      <div style="display:flex; gap:10px; padding-bottom:4px;">
        <button id="merge-cancel-btn" class="btn btn-ghost" style="flex:1; padding:12px; font-size:13px;" ${isMerging ? 'disabled' : ''}>Cancel</button>
        <button id="merge-run-btn" class="btn btn-primary" style="flex:2; padding:12px; font-size:13px; font-weight:700;" ${canMerge ? '' : 'disabled'}>
          ${isMerging ? 'Merging PDFs…' : `Merge ${queuedBooks.length >= 2 ? `${queuedBooks.length} Books (${totalPages} pg)` : 'Books'}`}
        </button>
      </div>
    `;
    window.enhanceCustomSelects?.(bodyEl);
    window.Sheet?.updateScrollIndicator?.();

    // Bind events
    bodyEl.querySelectorAll('.mb-add-book').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!queueIds.includes(id)) {
          queueIds.push(id);
          if (queueIds.length === 1) targetId = id;
          renderStudio();
        }
      };
    });

    const addAllBtn = document.getElementById('merge-add-all-btn');
    if (addAllBtn) {
      addAllBtn.onclick = () => {
        remainingBooks.forEach(b => {
          if (!queueIds.includes(b.id)) queueIds.push(b.id);
        });
        if (!targetId && queueIds.length) targetId = queueIds[0];
        renderStudio();
      };
    }

    const filterInput = document.getElementById('merge-lib-filter');
    if (filterInput) {
      filterInput.oninput = (e) => {
        libraryFilter = e.target.value;
        const pos = e.target.selectionStart;
        renderStudio();
        const nextInput = document.getElementById('merge-lib-filter');
        if (nextInput) {
          nextInput.focus();
          try { nextInput.setSelectionRange(pos, pos); } catch (err) {}
        }
      };
    }

    bodyEl.querySelectorAll('.merge-move-up').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        if (idx > 0) {
          [queueIds[idx - 1], queueIds[idx]] = [queueIds[idx], queueIds[idx - 1]];
          renderStudio();
        }
      };
    });

    bodyEl.querySelectorAll('.merge-move-down').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        if (idx < queueIds.length - 1) {
          [queueIds[idx + 1], queueIds[idx]] = [queueIds[idx], queueIds[idx + 1]];
          renderStudio();
        }
      };
    });

    bodyEl.querySelectorAll('.merge-remove-q').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const pos = queueIds.indexOf(id);
        if (pos !== -1) queueIds.splice(pos, 1);
        renderStudio();
      };
    });

    document.getElementById('merge-mode-existing').onclick = () => {
      outputMode = 'existing';
      renderStudio();
    };
    document.getElementById('merge-mode-new').onclick = () => {
      outputMode = 'new';
      renderStudio();
    };

    const targetSelect = document.getElementById('merge-target-select');
    if (targetSelect) {
      targetSelect.onchange = (e) => {
        targetId = e.target.value;
        renderStudio();
      };
    }

    const titleInput = document.getElementById('merge-new-title');
    if (titleInput) {
      titleInput.oninput = (e) => {
        customTitle = e.target.value;
        titleEditedManually = true;
      };
    }

    document.getElementById('merge-delete-sources').onchange = (e) => {
      deleteSources = !!e.target.checked;
    };
    document.getElementById('merge-migrate-data').onchange = (e) => {
      migrateStudyData = !!e.target.checked;
    };

    document.getElementById('merge-cancel-btn').onclick = () => {
      if (!isMerging) window.Sheet.close();
    };

    document.getElementById('merge-run-btn').onclick = async () => {
      if (queueIds.length < 2 || isMerging) return;
      isMerging = true;
      renderStudio();
      const ok = await mergeMultipleBooks({
        orderedIds: [...queueIds],
        mode: outputMode,
        targetId,
        newName: (customTitle || '').trim() || buildDefaultMergedTitle(queuedBooks),
        deleteSources,
        migrateStudyData
      });
      if (!ok) {
        isMerging = false;
        renderStudio();
      }
    };
  }

  renderStudio();
}

export async function mergeMultipleBooks({
  orderedIds,
  mode = 'new',
  targetId = null,
  newName = '',
  deleteSources = false,
  migrateStudyData = true
}) {
  if (!Array.isArray(orderedIds) || orderedIds.length < 2) {
    window.toast('Select at least 2 books to merge');
    return false;
  }

  window.toast(`Merging ${orderedIds.length} books…`);
  try {
    if (typeof window.ensureLib === 'function') await window.ensureLib('pdflib');
    const { PDFDocument } = PDFLib;
    const outDoc = await PDFDocument.create();
    const loadedSources = [];
    let runningOffset = 0;

    for (let i = 0; i < orderedIds.length; i++) {
      const fid = orderedIds[i];
      const rec = await window.DB.get('files', fid);
      if (!rec) throw new Error(`Missing book record (${fid})`);
      const raw = await window.DB.normalizeBuffer(rec.data);
      if (!raw) throw new Error(`Cannot read PDF bytes for "${rec.name}"`);
      const srcDoc = await PDFDocument.load(raw.slice(0));
      const count = srcDoc.getPageCount();
      const copied = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      copied.forEach(p => outDoc.addPage(p));
      loadedSources.push({
        id: fid,
        rec,
        startOffset: runningOffset,
        pageCount: count
      });
      runningOffset += count;
    }

    const bytes = await outDoc.save();
    const cleanBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const totalPages = outDoc.getPageCount();
    const firstSource = loadedSources[0]?.rec;
    const newThumb = await generateFirstPageThumb(cleanBuffer);

    let resultingFileId = null;
    let resultingName = '';
    const deletedIds = new Set();

    if (mode === 'existing') {
      const resolvedTargetId = (targetId && orderedIds.includes(targetId)) ? targetId : orderedIds[0];
      const targetInfo = loadedSources.find(s => s.id === resolvedTargetId) || loadedSources[0];
      const targetRec = { ...targetInfo.rec };

      // 1. Shift target book's own study records if another book was placed BEFORE it
      if (migrateStudyData && targetInfo.startOffset > 0) {
        await shiftOrMigrateStudyRecords(resolvedTargetId, resolvedTargetId, targetInfo.startOffset);
        const prog = await window.DB.get('progress', resolvedTargetId);
        if (prog && typeof prog.page === 'number') {
          prog.page = Math.max(1, prog.page + targetInfo.startOffset);
          await window.DB.put('progress', prog);
        }
      }

      // 2. Overwrite target book's PDF data & metadata
      targetRec.data = cleanBuffer;
      targetRec.size = cleanBuffer.byteLength;
      targetRec.pageCount = totalPages;
      if (newThumb) targetRec.thumb = newThumb;
      targetRec.lastOpened = Date.now();
      await window.DB.put('files', targetRec);
      await clearBookTextCaches(resolvedTargetId);

      const metaIdx = (window.State.files || []).findIndex(f => f.id === resolvedTargetId);
      if (metaIdx !== -1) {
        window.State.files[metaIdx] = { ...targetRec, data: undefined };
      }

      // 3. Optionally remove the other source books & migrate their highlights/notes/bookmarks/flashcards
      if (deleteSources) {
        for (const src of loadedSources) {
          if (src.id === resolvedTargetId) continue;
          if (migrateStudyData) {
            await shiftOrMigrateStudyRecords(src.id, resolvedTargetId, src.startOffset);
          }
          await deleteBookAndOrphans(src.id);
          deletedIds.add(src.id);
        }
      }

      resultingFileId = resolvedTargetId;
      resultingName = targetRec.name;
    } else {
      const finalTitle = (newName || '').trim() || buildDefaultMergedTitle(loadedSources.map(s => s.rec));
      const created = await window.addBookFromBuffer(finalTitle, cleanBuffer, cleanBuffer.byteLength, {
        folder: firstSource?.folder || '',
        subject: firstSource?.subject || ''
      });

      if (migrateStudyData) {
        for (const src of loadedSources) {
          await shiftOrMigrateStudyRecords(src.id, created.id, src.startOffset);
        }
      }

      if (deleteSources) {
        for (const src of loadedSources) {
          await deleteBookAndOrphans(src.id);
          deletedIds.add(src.id);
        }
      }

      resultingFileId = created.id;
      resultingName = created.name;
    }

    window.Sheet.close();

    // Sync active reader if open on modified/deleted book, or refresh dashboard
    if (window.State.view === 'reader' && window.State.currentFile) {
      const curId = window.State.currentFile.id;
      if (curId === resultingFileId || deletedIds.has(curId)) {
        await window.openReader(resultingFileId);
      }
    } else if (window.State.view === 'dashboard') {
      await window.renderDashboard(true);
    }

    const removedMsg = deletedIds.size > 0 ? ` · Cleaned ${deletedIds.size} source book${deletedIds.size > 1 ? 's' : ''}` : '';
    window.toast(`Merged ${orderedIds.length} books (${totalPages} pg) → "${resultingName}"${removedMsg}`);
    return true;
  } catch (err) {
    console.error('Multi-book merge error:', err);
    window.toast(`Merge failed: ${err.message || 'try again'}`);
    return false;
  }
}

export async function mergeBooks(fidA, fidB) {
  return mergeMultipleBooks({
    orderedIds: [fidA, fidB],
    mode: 'new',
    deleteSources: false,
    migrateStudyData: true
  });
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
window.mergeMultipleBooks = mergeMultipleBooks;
window.mergeBooks = mergeBooks;

