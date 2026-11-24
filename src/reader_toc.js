// @ts-nocheck
// Split out of reader.js (no behaviour change). Shared reader helpers come back in through ./reader.js.
import { docIsLegacyHindi, fixTocText, scrollToPage } from './reader.js';
let currentTocSessionId = 0;

/**
 * Resolves a PDF.js destination (name, array, or page index) to a 1-based page number.
 */
export async function resolveDestToPage(doc, dest) {
  if (!doc || dest == null) return null;
  try {
    let d = dest;
    if (typeof d === 'string') {
      d = await doc.getDestination(d);
    }
    if (typeof d === 'number') {
      return d + 1;
    } else if (Array.isArray(d) && d.length > 0) {
      const first = d[0];
      if (typeof first === 'number') {
        return first + 1;
      } else if (first && typeof first === 'object') {
        const idx = await doc.getPageIndex(first);
        if (typeof idx === 'number' && idx >= 0) return idx + 1;
      }
    }
  } catch (e) {
    console.warn('Error resolving TOC destination to page:', e);
  }
  return null;
}

/**
 * Reads the top text items of a page to extract a real human-readable chapter heading / subtitle.
 */
export async function getPageFirstHeading(doc, pageNum, outlineTitle = '') {
  if (!doc || !pageNum || pageNum < 1 || pageNum > doc.numPages) return '';
  const legacyDoc = await docIsLegacyHindi(doc);
  outlineTitle = fixTocText(outlineTitle, legacyDoc);
  try {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent({ normalizeWhitespace: true });
    if (!textContent || !textContent.items || textContent.items.length === 0) return '';

    // Group items into lines based on Y coordinate
    const lineBuckets = [];
    for (const item of textContent.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const y = item.transform ? Math.round(item.transform[5]) : 0;
      let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
      if (!bucket) {
        bucket = { y, items: [] };
        lineBuckets.push(bucket);
      }
      bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
    }

    // Sort buckets top to bottom (PDF Y is largest at top)
    lineBuckets.sort((a, b) => b.y - a.y);

    const cleanOutline = (outlineTitle || '').toLowerCase().trim();

    for (const b of lineBuckets.slice(0, 10)) {
      b.items.sort((a, b) => a.x - b.x);
      const lineStr = fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      if (lineStr.length < 3) continue;
      // Skip pure digits (like page numbers)
      if (/^\d+$/.test(lineStr)) continue;
      // Skip common metadata / copyright / headers
      if (/^(contents|preface|foreword|acknowledgements|table of contents)/i.test(lineStr)) continue;
      if (/^(copyright|published by|isbn|all rights reserved|page\s+\d+|book\s+\d+|national institute)/i.test(lineStr)) continue;

      const lower = lineStr.toLowerCase();
      if (cleanOutline && (lower === cleanOutline || lower === cleanOutline.replace(/[-_]/g, ' '))) {
        continue;
      }

      // Check if line starts with Chapter / Lesson marker
      if (/^(ch|chap|chapter|lesson|unit|module|पाठ|अध्याय|इकाई)\s*[-.:]?\s*\d+/i.test(lineStr)) {
        const afterMarker = lineStr.replace(/^(ch|chap|chapter|lesson|unit|module|पाठ|अध्याय|इकाई)\s*[-.:]?\s*\d+\s*[-.:]?\s*/i, '').trim();
        if (afterMarker.length >= 3 && !/^\d+$/.test(afterMarker)) {
          return afterMarker;
        }
        continue;
      }

      // Valid heading candidate (not a long body paragraph ending with period)
      if (lineStr.length >= 3 && lineStr.length <= 75 && !lineStr.endsWith('.') && !lineStr.endsWith('।')) {
        return lineStr;
      }
    }
  } catch (e) {
    console.warn('Error reading page heading:', e);
  }
  return '';
}

/**
 * Recursively resolves all outline items, assigns page numbers & end pages,
 * detects chapter headings, and caches the result.
 * Multi-Tier:
 * - Tier 1: Embedded PDF document outline (bookmarks)
 * - Tier 2: Printed in-text Table of Contents (front matter)
 * - Tier 3: Document-wide chapter start heading scanner
 */
export async function resolveAndCacheTOC(doc, fileId) {
  if (!doc) return [];
  const cacheKey = fileId || (window.State.currentFile && window.State.currentFile.id) || 'default';
  if (!window.State.tocResolvedCache) window.State.tocResolvedCache = {};
  if (window.State.tocResolvedCache[cacheKey] && window.State.tocResolvedCache[cacheKey].length > 0) {
    return window.State.tocResolvedCache[cacheKey];
  }

  // Tier 1: Embedded Native PDF Bookmarks Outline
  try {
    const legacyDoc = await docIsLegacyHindi(doc);
    const rawOutline = await doc.getOutline();
    if (rawOutline && rawOutline.length > 0) {
      async function resolveItems(items) {
        const list = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pageNum = await resolveDestToPage(doc, item.dest);
          let subItems = [];
          if (item.items && item.items.length) {
            subItems = await resolveItems(item.items);
          }
          list.push({
            title: fixTocText(item.title, legacyDoc) || `Section ${i + 1}`,
            subtitle: '',
            pageNum: pageNum,
            dest: item.dest,
            items: subItems
          });
        }
        return list;
      }

      const resolved = await resolveItems(rawOutline);
      const hasValidPages = resolved.some(it => it.pageNum && it.pageNum >= 1);

      if (hasValidPages) {
        function calculateEndPages(items, parentMaxPage) {
          for (let i = 0; i < items.length; i++) {
            const cur = items[i];
            let nextStartPage = null;
            for (let j = i + 1; j < items.length; j++) {
              if (items[j].pageNum) {
                nextStartPage = items[j].pageNum;
                break;
              }
            }
            if (nextStartPage && cur.pageNum) {
              cur.endPageNum = Math.max(cur.pageNum, nextStartPage - 1);
            } else if (cur.pageNum) {
              cur.endPageNum = parentMaxPage || doc.numPages;
            } else {
              cur.endPageNum = cur.pageNum;
            }

            if (cur.items && cur.items.length) {
              calculateEndPages(cur.items, cur.endPageNum);
            }
          }
        }
        calculateEndPages(resolved, doc.numPages);

        const enrichPromises = resolved.map(async (item) => {
          if (item.pageNum) {
            try {
              const detected = await getPageFirstHeading(doc, item.pageNum, item.title);
              if (detected && detected.toLowerCase() !== item.title.toLowerCase()) {
                item.subtitle = detected;
              }
            } catch (e) {}
          }
        });
        await Promise.allSettled(enrichPromises);

        window.State.tocResolvedCache[cacheKey] = resolved;
        return resolved;
      }
    }
  } catch (err) {
    console.warn('Error reading native PDF outline:', err);
  }

  // Tier 2: Printed In-Text Table of Contents (Front Matter Pages 1 to 30)
  try {
    const inTextEntries = await extractInTextTOC(doc, fileId);
    if (inTextEntries && inTextEntries.length >= 2) {
      window.State.tocResolvedCache[cacheKey] = inTextEntries;
      return inTextEntries;
    }
  } catch (err) {
    console.warn('Error extracting in-text TOC:', err);
  }

  // Tier 3: Document-Wide Chapter Heading Scanner (Heuristic fallback)
  try {
    const scannedEntries = await scanDocumentForChapters(doc, fileId);
    if (scannedEntries && scannedEntries.length >= 2) {
      window.State.tocResolvedCache[cacheKey] = scannedEntries;
      return scannedEntries;
    }
  } catch (err) {
    console.warn('Error scanning document for chapter headings:', err);
  }

  window.State.tocResolvedCache[cacheKey] = [];
  return [];
}

/**
 * Extracts structured chapters from printed in-text Table of Contents pages.
 */
export async function extractInTextTOC(doc, fileId) {
  if (!doc) return [];
  const legacyDoc = await docIsLegacyHindi(doc);
  const totalPages = doc.numPages || 1;
  const maxScan = Math.min(totalPages, 30);
  const entries = [];
  let currentModule = '';

  for (let p = 1; p <= maxScan; p++) {
    try {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      if (!textContent || !textContent.items || textContent.items.length < 5) continue;

      const lineBuckets = [];
      for (const item of textContent.items) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
        if (!bucket) {
          bucket = { y, items: [] };
          lineBuckets.push(bucket);
        }
        bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
      }
      lineBuckets.sort((a, b) => b.y - a.y);
      const lines = lineBuckets.map(b => {
        b.items.sort((a, b) => a.x - b.x);
        return fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      }).filter(Boolean);

      const pageJoined = lines.join(' ').toLowerCase();
      const isToc = /table\s+of\s+contents|contents\b|content\b|\bindex\b|syllabus\b|scheme\s+of\s+studies|list\s+of\s+(?:lessons|chapters|modules)/i.test(pageJoined) ||
        (lines.filter(l => /\b\d{1,4}\s*$/.test(l) && /(?:chapter|lesson|unit|module|\d+\s*[.:])/i.test(l)).length >= 2);

      if (!isToc) continue;

      for (const line of lines) {
        if (!line || line.length < 3) continue;

        // Module Header: e.g. "Module-6A: Tourism" or "Module 6B: Hospitality Management"
        const modMatch = line.match(/^(module\s*[-–:]?\s*[0-9A-Z]+(?:\s*[:.\-–]\s*[^\n\r]+)?)$/i);
        if (modMatch && !/\b\d{1,3}\s*$/.test(line)) {
          currentModule = modMatch[1].trim();
          continue;
        }

        // Pattern 1: Module/Lesson/Chapter X: Title ... Page
        const m1 = line.match(/^(?:(chapter|lesson|unit|module|paath|adhyaye?|पाठ|अध्याय|इकाई)\s*[:.\-_]?\s*)?(\d{1,3}|[ivxlcdm]+)\s*[:.\-_–—]\s*(.+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m1) {
          const prefix = m1[1] || 'Chapter';
          const num = m1[2];
          const rawTitle = m1[3].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m1[4], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • ${prefix} ${num}: ${rawTitle}` 
              : `${prefix} ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
            continue;
          }
        }

        // Pattern 2: 21. Functions of Travel Agencies ... 14
        const m2 = line.match(/^(\d{1,3})\s*[:.\-_]\s*([A-Za-z0-9\u0900-\u097F\s,–'’"&\-\/]+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m2) {
          const num = m2[1];
          const rawTitle = m2[2].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m2[3], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • Lesson ${num}: ${rawTitle}` 
              : `Lesson ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
            continue;
          }
        }

        // Pattern 3: Chapter/Lesson without dot: "Lesson 21 Functions of Travel ... 14"
        const m3 = line.match(/^(?:chapter|lesson|unit|module)\s+(\d{1,3})\s+([A-Za-z0-9\u0900-\u097F\s,–'’"&\-\/]+?)(?:[\s.·…\-_]{2,}|\t|\s{2,}|page|pg\s*)(\d{1,4})\s*$/i);
        if (m3) {
          const num = m3[1];
          const rawTitle = m3[2].replace(/[\s.·…\-_]+$/, '').trim();
          const startP = parseInt(m3[3], 10);
          if (startP >= 1 && startP <= totalPages && rawTitle.length > 2) {
            const formattedTitle = currentModule 
              ? `${currentModule} • Lesson ${num}: ${rawTitle}` 
              : `Lesson ${num}: ${rawTitle}`;
            entries.push({
              title: formattedTitle,
              subtitle: currentModule || '',
              pageNum: startP,
              rawTitle: rawTitle,
              chapterNum: num
            });
          }
        }
      }
    } catch (e) {}
  }

  if (entries.length >= 2) {
    entries.sort((a, b) => a.pageNum - b.pageNum);
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      cur.endPageNum = next ? Math.max(cur.pageNum, next.pageNum - 1) : totalPages;
    }
    return entries;
  }

  return [];
}

/**
 * Scans page headings across the document for chapter/lesson boundaries.
 */
export async function scanDocumentForChapters(doc, fileId) {
  if (!doc) return [];
  const legacyDoc = await docIsLegacyHindi(doc);
  const totalPages = doc.numPages || 1;
  const entries = [];
  let currentModule = '';

  for (let p = 1; p <= totalPages; p++) {
    try {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      if (!textContent || !textContent.items || textContent.items.length < 3) continue;

      const topItems = textContent.items.filter(it => {
        const y = it.transform ? it.transform[5] : 0;
        return y > 400 || (it.transform && it.transform[0] > 14);
      });

      const lineBuckets = [];
      for (const item of topItems) {
        const str = (item.str || '').trim();
        if (!str) continue;
        const y = item.transform ? Math.round(item.transform[5]) : 0;
        let bucket = lineBuckets.find(b => Math.abs(b.y - y) <= 4);
        if (!bucket) {
          bucket = { y, items: [] };
          lineBuckets.push(bucket);
        }
        bucket.items.push({ str, x: item.transform ? item.transform[4] : 0 });
      }
      lineBuckets.sort((a, b) => b.y - a.y);
      const topLines = lineBuckets.slice(0, 8).map(b => {
        b.items.sort((a, b) => a.x - b.x);
        return fixTocText(b.items.map(it => it.str).join(' ').trim(), legacyDoc);
      }).filter(Boolean);

      for (const line of topLines) {
        const modM = line.match(/\b(module\s*[-–:]?\s*[0-9A-Za-z]+(?:\s*[:.\-–]\s*[^\n\r]+)?)/i);
        if (modM && line.length < 60) {
          currentModule = modM[1].trim();
        }
      }

      for (let i = 0; i < topLines.length; i++) {
        const line = topLines[i];
        const match = line.match(/(?:\b|^|\s)(module|chapter|unit|lesson|paath|adhyaye?|पाठ|अध्याय|इकाई)\s*[:.\-_—–]?\s*0*(\d+|[ivxlcdm]+)\b\s*[:.\-_—–]?\s*([^\n\r]+)?/i);
        if (match) {
          const type = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          const num = match[2];
          let title = (match[3] || '').trim();
          if (!title && topLines[i + 1] && topLines[i + 1].length > 3 && !/^\d+$/.test(topLines[i + 1])) {
            title = topLines[i + 1].trim();
          }
          title = title.replace(/\b(?:page|pg|no\.?|\d+)\b/gi, '').replace(/[\s.·—–-]+$/, '').trim();

          const fullTitle = title 
            ? (currentModule ? `${currentModule} • ${type} ${num}: ${title}` : `${type} ${num}: ${title}`)
            : (currentModule ? `${currentModule} • ${type} ${num}` : `${type} ${num}`);

          if (!entries.some(e => e.pageNum === p || (e.chapterNum === num && e.type === type))) {
            entries.push({
              title: fullTitle,
              subtitle: currentModule || '',
              pageNum: p,
              type,
              chapterNum: num
            });
            break;
          }
        }
      }
    } catch (e) {}
  }

  if (entries.length >= 2) {
    entries.sort((a, b) => a.pageNum - b.pageNum);
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const next = entries[i + 1];
      cur.endPageNum = next ? Math.max(cur.pageNum, next.pageNum - 1) : totalPages;
    }
    return entries;
  }

  return [];
}

/**
 * Returns a flat, clean array of all detected chapters with start/end pages.
 */
export async function getChapterList(doc, fileId) {
  if (!doc) return [];
  const cacheKey = fileId || (window.State.currentFile && window.State.currentFile.id) || 'default';
  let chapters = window.State.tocResolvedCache?.[cacheKey];
  if (!chapters || !chapters.length) {
    chapters = await resolveAndCacheTOC(doc, fileId);
  }

  const list = [];
  function traverse(items, prefix = '') {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.pageNum) {
        const start = item.pageNum;
        const end = Math.max(start, Math.min(item.endPageNum || start, doc.numPages || start));
        const cleanTitle = (item.title || '').trim();
        const fullTitle = item.subtitle ? `${cleanTitle}: ${item.subtitle}` : cleanTitle;
        const pageSpan = end > start ? `pp. ${start}–${end}` : `p. ${start}`;
        list.push({
          title: fullTitle,
          rawTitle: cleanTitle,
          subtitle: item.subtitle || '',
          startPage: start,
          endPage: end,
          pageCount: end - start + 1,
          label: `${prefix}${fullTitle} (${pageSpan})`
        });
      }
      if (item.items && item.items.length) {
        traverse(item.items, `${prefix}  `);
      }
    }
  }

  traverse(chapters || []);
  return list;
}

export async function openTOC(){
  if (!window.State.currentDoc) {
    if (window.toast) window.toast('No document loaded');
    return;
  }

  currentTocSessionId = Date.now();
  const thisSession = currentTocSessionId;
  const doc = window.State.currentDoc;
  const fileId = window.State.currentFile ? window.State.currentFile.id : 'default';

  // Retrieve cached or immediately resolve outline
  let resolvedOutline = window.State.tocResolvedCache?.[fileId];
  if (!resolvedOutline) {
    resolvedOutline = await resolveAndCacheTOC(doc, fileId);
  }

  const hasOutline = resolvedOutline && resolvedOutline.length > 0;
  const tocMap = new Map();
  let itemCounter = 0;

  function renderItems(items, depth){
    let html = '';
    for(const item of items){
      const itemId = 'toc-item-' + (++itemCounter);
      tocMap.set(itemId, item);
      const isCurrentPage = item.pageNum && window.State.currentPage && 
        window.State.currentPage >= item.pageNum && 
        window.State.currentPage <= (item.endPageNum || item.pageNum);

      html += `
        <button class="btn toc-item ${isCurrentPage ? 'toc-item-active' : ''}" data-toc-id="${itemId}" data-page="${item.pageNum || ''}" style="width:100%; justify-content:space-between; align-items:center; padding:10px ${12 + depth * 14}px; background:${isCurrentPage ? 'var(--accent-soft)' : 'transparent'}; color:var(--text); font-size:14px; border-bottom:1px solid var(--border); border-radius:0; text-align:left; gap:10px;">
          <span style="flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:${isCurrentPage ? '700' : '600'}; font-size:13.5px; color:${isCurrentPage ? 'var(--accent)' : 'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${window.escapeHtml(item.title)}
            </span>
            ${item.subtitle ? `
              <span class="toc-subtitle" style="font-size:11.5px; color:var(--text-dim); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${window.escapeHtml(item.subtitle)}
              </span>
            ` : ''}
          </span>
          ${item.pageNum ? `
            <span class="font-mono toc-page-badge" style="font-size:11px; font-weight:700; color:${isCurrentPage ? 'var(--accent)' : 'var(--text-dim)'}; background:var(--surface-2); border:1px solid var(--border); border-radius:4px; padding:2px 7px; flex-shrink:0;">
              p. ${item.pageNum}
            </span>
          ` : ''}
        </button>
      `;
      if(item.items?.length) html += renderItems(item.items, depth + 1);
    }
    return html;
  }

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:6px 0 12px;">
      <div class="font-display" style="font-size:17px; font-weight:700; color:var(--text);">Contents & Chapters</div>
      ${hasOutline ? `<div style="display:flex; gap:6px;">
        <button class="chip toc-tab active" data-tab="outline">Outline</button>
        <button class="chip toc-tab" data-tab="pages">Pages</button>
      </div>` : ''}
    </div>
    <div id="toc-outline" style="max-height:56vh; overflow-y:auto;">
      ${hasOutline ? renderItems(resolvedOutline, 0) : window.emptyState('list', 'No table of contents', 'This PDF doesn\u2019t include an outline — browse by page below.')}
    </div>
    <div id="toc-pages" style="display:${hasOutline ? 'none' : 'grid'}; grid-template-columns:repeat(4,1fr); gap:8px; max-height:52vh; overflow-y:auto; padding:2px;"></div>
  `);

  document.querySelectorAll('.toc-item').forEach(b => {
    b.onclick = async () => {
      const itemId = b.dataset.tocId;
      const item = tocMap.get(itemId);
      if (!item) return;

      let targetPage = item.pageNum;
      if (!targetPage && item.dest) {
        targetPage = await resolveDestToPage(doc, item.dest);
      }

      window.Sheet.close();
      if (targetPage && targetPage >= 1 && targetPage <= (window.State.numPages || 999999)) {
        scrollToPage(targetPage);
      } else if (window.toast) {
        window.toast('Could not find target page');
      }
    };
  });

  const pagesGrid = document.getElementById('toc-pages');
  const outlineDiv = document.getElementById('toc-outline');
  let pagesBuilt = false;
  let observer = null;

  function buildPageThumbs(){
    if(pagesBuilt || !pagesGrid) return;
    pagesBuilt = true;
    const numPages = window.State.numPages || 0;
    
    pagesGrid.innerHTML = Array.from({length: numPages}, (_,i)=>i+1).map(i=>`
      <button class="toc-pg" data-page="${i}" style="position:relative; aspect-ratio:0.72; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
        <span class="font-mono" style="font-size:10.5px; color:var(--text-faint);">${i}</span>
      </button>
    `).join('');

    pagesGrid.querySelectorAll('.toc-pg').forEach(el => {
      el.onclick = () => {
        const pg = Number(el.dataset.page);
        window.Sheet.close();
        if (pg) scrollToPage(pg);
      };
    });

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && thisSession === currentTocSessionId) {
            const el = entry.target;
            observer.unobserve(el);
            const pgNum = Number(el.dataset.page);
            if (pgNum) renderThumbCanvas(pgNum, el);
          }
        }
      }, { root: pagesGrid, rootMargin: '100px 0px' });

      pagesGrid.querySelectorAll('.toc-pg').forEach(el => observer.observe(el));
    }
  }

  async function renderThumbCanvas(i, el) {
    if (thisSession !== currentTocSessionId) return;
    try {
      const page = await window.State.currentDoc.getPage(i);
      if (thisSession !== currentTocSessionId) return;
      const vp1 = page.getViewport({scale:1});
      const scale = 130 / vp1.width;
      const vp = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({canvasContext: canvas.getContext('2d'), viewport: vp}).promise;
      if (thisSession !== currentTocSessionId) return;
      canvas.style.cssText = 'width:100%; height:100%; object-fit:cover;';
      el.innerHTML = '';
      el.appendChild(canvas);
    } catch(e) {}
  }

  if(!hasOutline) buildPageThumbs();

  document.querySelectorAll('.toc-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.toc-tab').forEach(t => t.classList.toggle('active', t===tab));
      const showPages = tab.dataset.tab === 'pages';
      if (outlineDiv) outlineDiv.style.display = showPages ? 'none' : 'block';
      if (pagesGrid) pagesGrid.style.display = showPages ? 'grid' : 'none';
      const targetPanel = showPages ? pagesGrid : outlineDiv;
      if (targetPanel) {
        targetPanel.classList.remove('menu-swap-in');
        void targetPanel.offsetWidth;
        targetPanel.classList.add('menu-swap-in');
      }
      if (showPages) buildPageThumbs();
    };
  });
}
