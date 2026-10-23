// @ts-nocheck

export const COLORS = ['#FF6A2B','#2FC6BC','#FF4D6D','#8FD24B','#B48EE0'];
export let pendingSelection = null;
export let annotMode = 'highlight';
export let pendingOverlayEls = [];
export let pendingHandleEls = null;
export let handleDragState = null;

export function findPageWrapForRange(range) {
  if (!range) return null;
  const findWrap = (node) => {
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('page-wrap')) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  };
  let wrap = findWrap(range.startContainer);
  if (wrap) return wrap;
  wrap = findWrap(range.endContainer);
  if (wrap) return wrap;
  wrap = findWrap(range.commonAncestorContainer);
  if (wrap) return wrap;

  const sel = window.getSelection();
  if (sel) {
    if (sel.anchorNode) {
      wrap = findWrap(sel.anchorNode);
      if (wrap) return wrap;
    }
    if (sel.focusNode) {
      wrap = findWrap(sel.focusNode);
      if (wrap) return wrap;
    }
  }
  return null;
}

export function mergeLineRects(rawRects) {
  if (!rawRects || !rawRects.length) return [];
  const valid = [];
  for (let i = 0; i < rawRects.length; i++) {
    const r = rawRects[i];
    const w = r.width || (r.right - r.left) || 0;
    const h = r.height || (r.bottom - r.top) || 0;
    if (w > 0.5 && h > 0.5) {
      valid.push({
        left: r.left,
        top: r.top,
        right: r.right !== undefined ? r.right : r.left + w,
        bottom: r.bottom !== undefined ? r.bottom : r.top + h,
        width: w,
        height: h
      });
    }
  }
  if (!valid.length) return [];

  // Sort vertically by top
  valid.sort((a, b) => a.top - b.top);

  // Group into lines based on vertical overlap
  const lines = [];
  for (const r of valid) {
    let matchedLine = null;
    for (const line of lines) {
      const lineTop = Math.min(...line.map(item => item.top));
      const lineBottom = Math.max(...line.map(item => item.bottom));
      const overlapTop = Math.max(r.top, lineTop);
      const overlapBottom = Math.min(r.bottom, lineBottom);
      const overlapH = overlapBottom - overlapTop;
      const minH = Math.min(r.height, lineBottom - lineTop);

      if (overlapH > 0 && (overlapH / minH > 0.4 || Math.abs(r.top - lineTop) < 4)) {
        matchedLine = line;
        break;
      }
    }
    if (matchedLine) {
      matchedLine.push(r);
    } else {
      lines.push([r]);
    }
  }

  // Merge rects within each line
  const merged = [];
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);
    let cur = null;
    for (const r of line) {
      if (!cur) {
        cur = { ...r };
      } else {
        if (r.left <= cur.right + 6) {
          cur.right = Math.max(cur.right, r.right);
          cur.left = Math.min(cur.left, r.left);
          cur.top = Math.min(cur.top, r.top);
          cur.bottom = Math.max(cur.bottom, r.bottom);
          cur.width = cur.right - cur.left;
          cur.height = cur.bottom - cur.top;
        } else {
          merged.push(cur);
          cur = { ...r };
        }
      }
    }
    if (cur) merged.push(cur);
  }

  return merged;
}

export function handleSelection(){
  if (window.State && window.State.disableTextSelection) {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const text = sel.toString().trim();
  if (!text) return;
  const range = sel.getRangeAt(0);
  
  let rawRects = [...range.getClientRects()];
  if (!rawRects.length || rawRects.every(r => r.width === 0 || r.height === 0)) {
    const bound = range.getBoundingClientRect();
    if (bound && bound.width > 0 && bound.height > 0) {
      rawRects = [bound];
    }
  }
  const rects = mergeLineRects(rawRects);
  if (!rects.length) return;

  let pageWrap = findPageWrapForRange(range);
  if (!pageWrap) {
    if (window.State && window.State.currentPage) {
      const pe = window.pageEls?.[window.State.currentPage];
      if (pe && pe.wrap) pageWrap = pe.wrap;
    }
  }
  if (!pageWrap) return;
  const pageNum = Number(pageWrap.dataset.page);

  const wrapRect = pageWrap.getBoundingClientRect();
  const curW = pageWrap.clientWidth || wrapRect.width;
  const curH = pageWrap.clientHeight || wrapRect.height;
  const relRects = rects.map(r=>({left:r.left-wrapRect.left, top:r.top-wrapRect.top, width:r.width, height:r.height}));
  const normRects = rects.map(r=>({
    x: curW > 0 ? (r.left - wrapRect.left) / curW : 0,
    y: curH > 0 ? (r.top - wrapRect.top) / curH : 0,
    w: curW > 0 ? r.width / curW : 0,
    h: curH > 0 ? r.height / curH : 0
  }));

  window.lastSelectionTime = Date.now();
  const contextSentence = extractContextSentence(range, pageWrap);
  pendingSelection = {
    text, rects, relRects, normRects, pageNum, pageWrap,
    context: contextSentence,
    sentence: contextSentence,
    startNode: range.startContainer, startOffset: range.startOffset,
    endNode: range.endContainer, endOffset: range.endOffset
  };
  window.pendingSelection = pendingSelection;
  sel.removeAllRanges();
  paintPendingOverlay(pendingSelection);
  showSelToolbar();
}

export function extractContextSentence(range, pageWrap){
  try {
    const textLayer = pageWrap?.querySelector('.textLayer') || pageWrap?.querySelector('.text-layer') || pageWrap;
    if (!textLayer) return '';

    const selectedText = (range?.toString() || '').trim();
    if (!selectedText) return '';

    const fullText = (textLayer.innerText || textLayer.textContent || '').replace(/\s+/g, ' ').trim();

    let surroundingText = '';
    const startNode = range?.startContainer;
    const startSpan = startNode?.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    
    if (startSpan && textLayer.contains(startSpan)) {
      const spans = [...textLayer.querySelectorAll('span')];
      const idx = spans.indexOf(startSpan);
      if (idx !== -1) {
        const startIdx = Math.max(0, idx - 8);
        const endIdx = Math.min(spans.length, idx + 9);
        surroundingText = spans.slice(startIdx, endIdx).map(s => s.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
      }
    }

    const textToSearch = surroundingText && surroundingText.includes(selectedText) ? surroundingText : fullText;
    if (!textToSearch) return '';

    const sentences = textToSearch.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [textToSearch];
    for (const sent of sentences) {
      const cleanSent = sent.trim();
      const regex = new RegExp(`\\b${selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(cleanSent)) {
        return cleanSent;
      }
    }

    const pos = textToSearch.indexOf(selectedText);
    if (pos !== -1) {
      const start = Math.max(0, textToSearch.lastIndexOf('.', pos) + 1);
      let end = textToSearch.indexOf('.', pos + selectedText.length);
      if (end === -1) end = textToSearch.length;
      else end += 1;
      return textToSearch.slice(start, end).trim();
    }
  } catch (e) {
    console.warn('extractContextSentence error:', e);
  }
  return '';
}

export function caretFromPoint(x,y){
  if(document.caretRangeFromPoint) return document.caretRangeFromPoint(x,y);
  if(document.caretPositionFromPoint){
    const pos = document.caretPositionFromPoint(x,y);
    if(!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

export function findSpanAtPoint(pageNum, x, y){
  const pe = window.pageEls[pageNum];
  if(!pe || !pe.spanRects || !pe.spanRects.length) return null;
  for(const entry of pe.spanRects){
    const r = entry.rect;
    if(x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return entry;
  }
  let best=null, bestDist=Infinity;
  for(const entry of pe.spanRects){
    const r = entry.rect;
    const vDist = y<r.top ? r.top-y : y>r.bottom ? y-r.bottom : 0;
    const hDist = x<r.left ? r.left-x : x>r.right ? x-r.right : 0;
    const dist = vDist*4 + hDist;
    if(dist<bestDist){ bestDist=dist; best=entry; }
  }
  return best;
}

export function caretFromPointOnPage(pageNum, viewportX, viewportY){
  const pe = window.pageEls[pageNum];
  if(!pe) return null;
  const wrapRect = pe.wrap.getBoundingClientRect();
  const x = viewportX - wrapRect.left, y = viewportY - wrapRect.top;
  const entry = findSpanAtPoint(pageNum, x, y);
  if(!entry) return null;
  const textNode = entry.span.firstChild;
  const text = textNode ? textNode.textContent : '';
  if(!textNode || !text) return null;
  const ratio = Math.min(1, Math.max(0, (x-entry.rect.left)/(entry.rect.width||1)));
  const idx = Math.min(text.length, Math.max(0, Math.round(ratio*text.length)));
  const r = document.createRange();
  r.setStart(textNode, idx);
  r.collapse(true);
  return r;
}

export function wordRangeAtCaret(caretRange){
  let node = caretRange.startContainer;
  let offset = caretRange.startOffset;
  if(node.nodeType !== Node.TEXT_NODE){
    const child = node.childNodes[offset] || node.childNodes[offset-1];
    if(child && child.nodeType===Node.TEXT_NODE){ node = child; offset = 0; }
    else return caretRange;
  }
  const text = node.textContent || '';
  const isWordChar = ch => !!ch && !/[\s.,;:!?()"'\u201c\u201d\[\]{}]/.test(ch);
  let start = offset, end = offset;
  while(start>0 && isWordChar(text[start-1])) start--;
  while(end<text.length && isWordChar(text[end])) end++;
  if(start===end){ end = Math.min(text.length, start+1); }
  const r = document.createRange();
  r.setStart(node, start);
  r.setEnd(node, end);
  return r;
}

export function comparePoints(nodeA, offsetA, nodeB, offsetB){
  if(nodeA === nodeB) return offsetA - offsetB;
  const pos = nodeA.compareDocumentPosition(nodeB);
  if(pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if(pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

export function buildExtendedRange(anchorStart, anchorEnd, focusCaret){
  try{
    const focusNode = focusCaret.startContainer, focusOffset = focusCaret.startOffset;
    const cmpToStart = comparePoints(focusNode, focusOffset, anchorStart.node, anchorStart.offset);
    const cmpToEnd = comparePoints(focusNode, focusOffset, anchorEnd.node, anchorEnd.offset);
    const r = document.createRange();
    if(cmpToStart < 0){
      r.setStart(focusNode, focusOffset);
      r.setEnd(anchorEnd.node, anchorEnd.offset);
    } else if(cmpToEnd > 0){
      r.setStart(anchorStart.node, anchorStart.offset);
      r.setEnd(focusNode, focusOffset);
    } else {
      r.setStart(anchorStart.node, anchorStart.offset);
      r.setEnd(anchorEnd.node, anchorEnd.offset);
    }
    return r;
  }catch(err){
    return null;
  }
}

export function snapRangeToWholeWords(range){
  try{
    const startWord = wordRangeAtCaret((()=>{ const r=document.createRange(); r.setStart(range.startContainer,range.startOffset); r.collapse(true); return r; })());
    const endCaret = (()=>{ const r=document.createRange(); r.setStart(range.endContainer,range.endOffset); r.collapse(true); return r; })();
    const endWord = wordRangeAtCaret(endCaret);
    const snapped = document.createRange();
    snapped.setStart(startWord.startContainer, startWord.startOffset);
    snapped.setEnd(endWord.endContainer, endWord.endOffset);
    return snapped;
  }catch(err){
    return range;
  }
}

export function updateLiveSelectionRange(range, pageWrap, keepHandles){
  range = snapRangeToWholeWords(range);
  const text = range.toString();
  if(!text) return;
  const rawRects = [...range.getClientRects()];
  const rects = mergeLineRects(rawRects);
  if(!rects.length) return;
  const pageNum = Number(pageWrap.dataset.page);
  const wrapRect = pageWrap.getBoundingClientRect();
  const curW = pageWrap.clientWidth || wrapRect.width;
  const curH = pageWrap.clientHeight || wrapRect.height;
  const relRects = rects.map(r=>({left:r.left-wrapRect.left, top:r.top-wrapRect.top, width:r.width, height:r.height}));
  const normRects = rects.map(r=>({
    x: curW > 0 ? (r.left - wrapRect.left) / curW : 0,
    y: curH > 0 ? (r.top - wrapRect.top) / curH : 0,
    w: curW > 0 ? r.width / curW : 0,
    h: curH > 0 ? r.height / curH : 0
  }));
  window.lastSelectionTime = Date.now();
  const contextSentence = extractContextSentence(range, pageWrap);
  pendingSelection = {
    text, rects, relRects, normRects, pageNum, pageWrap,
    context: contextSentence,
    sentence: contextSentence,
    startNode: range.startContainer, startOffset: range.startOffset,
    endNode: range.endContainer, endOffset: range.endOffset
  };
  window.pendingSelection = pendingSelection;
  paintPendingOverlay(pendingSelection, keepHandles);
  showSelToolbar();
}

export function currentSelectionRects(selection){
  if (!selection) return [];
  const pe = window.pageEls?.[selection.pageNum];
  const wrap = pe?.wrap || selection.pageWrap;
  if (!wrap) return selection.rects || [];
  const wrapRect = wrap.getBoundingClientRect();
  const curW = wrap.clientWidth || wrapRect.width;
  const curH = wrap.clientHeight || wrapRect.height;
  if (selection.normRects && selection.normRects.length) {
    return selection.normRects.map(nr => ({
      left: nr.x * curW + wrapRect.left,
      top: nr.y * curH + wrapRect.top,
      right: (nr.x + nr.w) * curW + wrapRect.left,
      bottom: (nr.y + nr.h) * curH + wrapRect.top,
      width: nr.w * curW,
      height: nr.h * curH
    }));
  }
  if (!selection.relRects) return selection.rects || [];
  return selection.relRects.map(r=>({
    left: r.left + wrapRect.left,
    top: r.top + wrapRect.top,
    right: r.left + wrapRect.left + r.width,
    bottom: r.top + wrapRect.top + r.height,
    width: r.width,
    height: r.height
  }));
}

export function createSelectionHandle(type){
  const handle = document.createElement('div');
  handle.className = 'sel-handle';
  handle.style.cssText = 'position:absolute; width:28px; height:30px; margin-left:-14px; pointer-events:auto; touch-action:none;';
  handle.innerHTML = '<div class="sel-handle-stem"></div><div class="sel-handle-dot"></div>';
  handle.addEventListener('touchstart', (e)=>{
    e.stopPropagation();
    if(!pendingSelection) return;
    const fixed = type==='start'
      ? {node: pendingSelection.endNode, offset: pendingSelection.endOffset}
      : {node: pendingSelection.startNode, offset: pendingSelection.startOffset};
    handleDragState = {fixed, pageNum: pendingSelection.pageNum, pageWrap: pendingSelection.pageWrap};
  }, {passive:true});
  handle.addEventListener('touchmove', (e)=>{
    if(!handleDragState) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches[0];
    const focusCaret = caretFromPointOnPage(handleDragState.pageNum, t.clientX, t.clientY);
    if(!focusCaret) return;
    const range = buildExtendedRange(handleDragState.fixed, handleDragState.fixed, focusCaret);
    if(range) updateLiveSelectionRange(range, handleDragState.pageWrap, true);
  }, {passive:false});
  handle.addEventListener('touchend', (e)=>{
    if(!handleDragState) return;
    e.stopPropagation();
    handleDragState = null;
  });
  handle.addEventListener('touchcancel', ()=>{ handleDragState = null; });
  return handle;
}

export function paintPendingOverlay(selection, keepHandles){
  pendingOverlayEls.forEach(el=>el.remove());
  pendingOverlayEls = [];
  if (!selection) return;

  const pe = window.pageEls?.[selection.pageNum];
  if(!pe || !pe.annotLayer || !pe.wrap) return;

  const curW = pe.wrap.clientWidth || pe.wrap.getBoundingClientRect().width;
  const curH = pe.wrap.clientHeight || pe.wrap.getBoundingClientRect().height;
  if (!curW || !curH) return;

  const hexColor = window.State?.selectionColor || '#2FC6BC';

  // Helper to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    let c = (hex || '#2FC6BC').toString().replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16) || 0;
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  };

  const bgRgba = hexToRgba(hexColor, 0.28);
  const outlineRgba = hexToRgba(hexColor, 0.65);

  let rectsToPaint = [];
  if (selection.normRects && selection.normRects.length) {
    rectsToPaint = selection.normRects.map(nr => ({
      left: nr.x * curW,
      top: nr.y * curH,
      width: nr.w * curW,
      height: nr.h * curH,
      right: (nr.x + nr.w) * curW,
      bottom: (nr.y + nr.h) * curH
    }));
  } else if (selection.rects && selection.rects.length) {
    const wrapRect = (selection.pageWrap || pe.wrap).getBoundingClientRect();
    rectsToPaint = selection.rects.map(r => ({
      left: r.left - wrapRect.left,
      top: r.top - wrapRect.top,
      width: r.width,
      height: r.height,
      right: (r.right !== undefined ? r.right : (r.left + r.width)) - wrapRect.left,
      bottom: (r.bottom !== undefined ? r.bottom : (r.top + r.height)) - wrapRect.top
    }));
  }

  for(const r of rectsToPaint){
    const mark = document.createElement('div');
    mark.className = 'pending-mark';
    mark.style.cssText = `position:absolute; pointer-events:none; border-radius:2px;
      left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px;
      background:${bgRgba}; outline:1px solid ${outlineRgba}; mix-blend-mode:multiply;`;
    pe.annotLayer.appendChild(mark);
    pendingOverlayEls.push(mark);
  }
  if(!rectsToPaint.length) return;

  const first = rectsToPaint[0], last = rectsToPaint[rectsToPaint.length-1];
  const startX = first.left, startY = first.top + first.height;
  const endX = last.right, endY = last.top + last.height;

  if(!keepHandles || !pendingHandleEls){
    if(pendingHandleEls){ pendingHandleEls.start.remove(); pendingHandleEls.end.remove(); }
    pendingHandleEls = {start: createSelectionHandle('start'), end: createSelectionHandle('end')};
    pe.annotLayer.appendChild(pendingHandleEls.start);
    pe.annotLayer.appendChild(pendingHandleEls.end);
  } else if(pendingHandleEls.start.parentElement !== pe.annotLayer){
    pe.annotLayer.appendChild(pendingHandleEls.start);
    pe.annotLayer.appendChild(pendingHandleEls.end);
  }
  pendingHandleEls.start.style.left = startX+'px';
  pendingHandleEls.start.style.top = startY+'px';
  pendingHandleEls.end.style.left = endX+'px';
  pendingHandleEls.end.style.top = endY+'px';
}

export function clearPendingOverlay(){
  pendingOverlayEls.forEach(el=>el.remove());
  pendingOverlayEls = [];
  if(pendingHandleEls){ pendingHandleEls.start.remove(); pendingHandleEls.end.remove(); pendingHandleEls = null; }
}

export function isSingleWord(text){ return !/\s/.test(text.trim()) && text.trim().length>0; }

export function showSelToolbar(){
  const bar = document.getElementById('sel-toolbar');
  if(!bar) return;
  if(!pendingSelection || !pendingSelection.text || !pendingSelection.text.trim()){
    bar.classList.remove('show');
    return;
  }

  const text = pendingSelection.text.trim();
  const words = text.split(/\s+/).length;
  const snippet = text.length > 70 ? text.slice(0, 70) + '…' : text;

  bar.innerHTML = `
    <div class="st-card">
      <!-- Snippet & Header -->
      <div class="st-header">
        <div class="st-snippet-box">
          <span class="st-snippet-text">"${window.escapeHtml(snippet)}"</span>
          <span class="st-snippet-badge">${words} ${words === 1 ? 'word' : 'words'}</span>
        </div>
        <button class="st-close-btn" id="st-close-action" title="Dismiss selection">✕</button>
      </div>

      <div class="st-sections">
        <!-- Section 1: Annotations & Color Palette -->
        <div class="st-annot-box">
          <div class="st-annot-top-row">
            <button class="st-mode-btn ${annotMode==='highlight'?'active':''}" id="st-act-highlight">
              ${window.icon('highlighter','icon icon-xs')} <span>Highlight</span>
            </button>
            <button class="st-mode-btn ${annotMode==='underline'?'active':''}" id="st-act-underline">
              ${window.icon('underline','icon icon-xs')} <span>Underline</span>
            </button>
            <button class="st-note-btn" id="st-act-note">
              ${window.icon('note','icon icon-xs')} <span>Note</span>
            </button>
          </div>
          <div class="st-swatch-bar">
            <span class="st-swatch-hint">Tap color to apply:</span>
            <div class="st-swatches">
              ${COLORS.map(c => `<button class="st-swatch ${c===(window.State?.brushColor||COLORS[0])?'sel':''}" data-color="${c}" style="background:${c};" title="Apply ${c}"></button>`).join('')}
              <label class="st-swatch ${!COLORS.includes(window.State?.brushColor) ? 'sel' : ''}" style="position:relative; background:${!COLORS.includes(window.State?.brushColor) ? window.State.brushColor : 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'}; cursor:pointer; overflow:hidden; display:inline-flex; align-items:center; justify-content:center;" title="Custom Color Picker">
                <input type="color" id="st-color-picker" value="${window.State?.brushColor||'#FF6A2B'}" style="opacity:0; width:100%; height:100%; position:absolute; top:0; left:0; cursor:pointer;" />
              </label>
            </div>
          </div>
        </div>

        <!-- Section 2: AI STUDY ASSISTANT -->
        <div class="st-ai-box">
          <div class="st-ai-title">
            ${window.icon('sparkle','icon icon-xs')} <span>AI STUDY ASSISTANT</span>
          </div>
          <div class="st-ai-grid">
            <button class="st-ai-btn" id="st-act-explain">
              ${window.icon('brain','icon icon-xs')} <span>Explain Simply</span>
            </button>
            <button class="st-ai-btn" id="st-act-summary">
              ${window.icon('fileText','icon icon-xs')} <span>Summary</span>
            </button>
            <button class="st-ai-btn" id="st-act-flashcards">
              ${window.icon('cards','icon icon-xs')} <span>Flashcards</span>
            </button>
            <button class="st-ai-btn" id="st-act-mcq">
              ${window.icon('help','icon icon-xs')} <span>Generate MCQs</span>
            </button>
          </div>
          <button class="st-ai-btn st-ai-btn-primary" id="st-act-teach-me" style="background:var(--accent); color:#ffffff; font-weight:700; width:100%; padding:12px; border-radius:10px; border:none; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer;">
            ${window.icon('teacher','icon icon-xs')} <span>Ask AI Teacher</span>
          </button>
          <button class="st-ai-btn" id="st-act-topic-chat" style="width:100%; padding:11px; background:var(--surface); border:1px solid var(--border); color:var(--accent); font-weight:700; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer;">
            ${window.icon('sparkle','icon icon-xs')} <span>Topic AI Chat</span>
          </button>
        </div>

        <!-- Section 3: Other Useful Tools (2x2 Grid) -->
        <div class="st-tools-grid">
          <button class="st-tool-btn" id="st-act-copy">
            ${window.icon('copy','icon icon-xs')} <span>Copy</span>
          </button>
          <button class="st-tool-btn" id="st-act-tts">
            ${window.icon('volume','icon icon-xs')} <span>Speak</span>
          </button>
          <button class="st-tool-btn" id="st-act-translate">
            ${window.icon('language','icon icon-xs')} <span>Translate</span>
          </button>
          <button class="st-tool-btn" id="st-act-define">
            ${window.icon('search','icon icon-xs')} <span>Define</span>
          </button>
        </div>
      </div>
    </div>
  `;

  bar.classList.add('show');
  if(window.keepBottomBarPositioned) window.keepBottomBarPositioned(bar);

  // Bind actions
  const closeBtn = document.getElementById('st-close-action');
  if(closeBtn) closeBtn.onclick = () => hideSelToolbar();

  const hlBtn = document.getElementById('st-act-highlight');
  const ulBtn = document.getElementById('st-act-underline');
  if(hlBtn) hlBtn.onclick = () => {
    annotMode = 'highlight';
    hlBtn.classList.add('active');
    if(ulBtn) ulBtn.classList.remove('active');
  };

  if(ulBtn) ulBtn.onclick = () => {
    annotMode = 'underline';
    ulBtn.classList.add('active');
    if(hlBtn) hlBtn.classList.remove('active');
  };

  bar.querySelectorAll('.st-swatch[data-color]').forEach(btn => {
    btn.onclick = () => {
      const color = btn.dataset.color;
      window.State.brushColor = color;
      createAnnotation(color, annotMode);
      hideSelToolbar();
    };
  });

  const stPicker = document.getElementById('st-color-picker');
  if (stPicker) {
    stPicker.onchange = (e) => {
      const color = e.target.value;
      if (color) {
        window.State.brushColor = color;
        createAnnotation(color, annotMode);
        hideSelToolbar();
      }
    };
  }

  const noteBtn = document.getElementById('st-act-note');
  if(noteBtn) noteBtn.onclick = () => {
    const sel = pendingSelection;
    hideSelToolbar();
    openNoteComposer(sel);
  };

  const expBtn = document.getElementById('st-act-explain');
  if(expBtn) expBtn.onclick = () => {
    const sel = pendingSelection || { text: typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : '', pageNum: window.State?.currentPage || 1 };
    hideSelToolbar();
    window.runQuickExplain(sel, false);
  };

  const sumBtn = document.getElementById('st-act-summary');
  if(sumBtn) sumBtn.onclick = () => {
    const sel = pendingSelection || { text: typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : '', pageNum: window.State?.currentPage || 1 };
    hideSelToolbar();
    const tool = window.AI_TOOLS?.find(t => t.key === 'summarize') || { key: 'summarize', label: 'Summarize', icon: 'fileText' };
    window.runAIToolObj(tool, sel);
  };

  const fcBtn = document.getElementById('st-act-flashcards');
  if(fcBtn) fcBtn.onclick = () => {
    const sel = pendingSelection || { text: typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : '', pageNum: window.State?.currentPage || 1 };
    hideSelToolbar();
    window.runInteractiveFlashcardsModal(sel);
  };

  const mcqBtn = document.getElementById('st-act-mcq');
  if(mcqBtn) mcqBtn.onclick = () => {
    const sel = pendingSelection || { text: typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : '', pageNum: window.State?.currentPage || 1 };
    hideSelToolbar();
    window.runMCQGeneratorModal(sel);
  };

  const teachBtn = document.getElementById('st-act-teach-me');
  if(teachBtn) teachBtn.onclick = () => {
    const selText = pendingSelection?.text?.trim() || '';
    hideSelToolbar();
    if (typeof window.openTeacherView === 'function') {
      window.openTeacherView(selText ? `Teach me about this selected excerpt:\n"${selText}"` : '');
    }
  };

  const chatBtn = document.getElementById('st-act-topic-chat');
  if(chatBtn) chatBtn.onclick = () => {
    const selText = pendingSelection?.text?.trim() || '';
    hideSelToolbar();
    window.openTopicAIChat('', selText);
  };

  const copyBtn = document.getElementById('st-act-copy');
  if(copyBtn) copyBtn.onclick = async () => {
    const selText = pendingSelection?.text || '';
    hideSelToolbar();
    const ok = await window.copyToClipboard(selText);
    window.toast(ok ? 'Copied to clipboard' : 'Couldn\'t copy');
  };

  const ttsBtn = document.getElementById('st-act-tts');
  if(ttsBtn) ttsBtn.onclick = () => {
    const selText = pendingSelection?.text || '';
    hideSelToolbar();
    window.runTTS(selText);
  };

  const transBtn = document.getElementById('st-act-translate');
  if(transBtn) transBtn.onclick = () => {
    const sel = pendingSelection;
    hideSelToolbar();
    window.runTranslateToolModal(sel);
  };

  const defBtn = document.getElementById('st-act-define');
  if(defBtn) defBtn.onclick = () => {
    const sel = pendingSelection;
    hideSelToolbar();
    window.runDictionaryLookup(sel);
  };
}

export function hideSelToolbar(){
  const bar = document.getElementById('sel-toolbar');
  if (bar) bar.classList.remove('show');
  clearPendingOverlay();
  pendingSelection = null;
}

export async function createAnnotation(color, type){
  if(!pendingSelection) return;
  const {text, pageNum, pageWrap} = pendingSelection;
  const pe = window.pageEls?.[pageNum];
  const curWrap = pe?.wrap || pageWrap;
  const wrapRect = curWrap.getBoundingClientRect();
  const curW = curWrap.clientWidth || wrapRect.width;
  const curH = curWrap.clientHeight || wrapRect.height;
  
  let relRects = [];
  if (pendingSelection.normRects && pendingSelection.normRects.length) {
    relRects = pendingSelection.normRects.map(r => ({
      x: r.x, y: r.y, w: r.w, h: r.h
    }));
  } else {
    const rects = pendingSelection.rects || [];
    relRects = rects.map(r=>({
      x: curW > 0 ? (r.left - wrapRect.left) / curW : 0,
      y: curH > 0 ? (r.top - wrapRect.top) / curH : 0,
      w: curW > 0 ? r.width / curW : 0,
      h: curH > 0 ? r.height / curH : 0
    }));
  }
  const rec = {id:window.uid(), fileId:window.State.currentFile.id, page:pageNum, type, color, text, rects:relRects, createdAt:Date.now()};
  await window.DB.put('annotations', rec);
  hideSelToolbar();
  await paintAnnotations(pageNum);
  window.toast(type==='underline'? 'Underlined' : 'Highlighted');
}

export async function paintAnnotations(pageNum){
  const pe = window.pageEls[pageNum];
  if(!pe || !pe.annotLayer) return;
  const annots = await window.DB.byIndex('annotations','fileId',window.State.currentFile.id);
  const forPage = annots.filter(a=>a.page===pageNum && a.kind !== 'drawing' && a.rects);
  pe.annotLayer.innerHTML = '';
  const w = pe.wrap.clientWidth, h = pe.wrap.clientHeight;
  for(const a of forPage){
    for(const r of a.rects){
      const mark = document.createElement('div');
      mark.dataset.annotId = a.id;
      mark.style.position = 'absolute';
      mark.style.pointerEvents = 'auto';
      mark.style.cursor = 'pointer';

      const rectX = r.x * w;
      const rectY = r.y * h;
      const rectW = r.w * w;
      const rectH = r.h * h;

      if(a.type==='underline'){
        const underlineY = rectY + rectH * 0.88;
        const lineThickness = Math.max(1.5, Math.min(2.5, rectH * 0.12));

        mark.style.left = rectX + 'px';
        mark.style.top = (underlineY - 4) + 'px';
        mark.style.width = rectW + 'px';
        mark.style.height = (lineThickness + 8) + 'px';
        mark.style.background = 'transparent';
        mark.innerHTML = `<div style="position:absolute; left:0; right:0; top:4px; height:${lineThickness}px; border-radius:1px; background:${a.color}; opacity:0.95; pointer-events:none;"></div>`;
      }else{
        mark.className = 'marker-mark';
        mark.style.left = rectX + 'px';
        mark.style.top = rectY + 'px';
        mark.style.width = rectW + 'px';
        mark.style.height = rectH + 'px';
        mark.style.background = a.color;
        mark.style.mixBlendMode = 'multiply';
        mark.style.opacity = '0.38';
        mark.style.borderRadius = '2px';
      }
      mark.onclick = (e)=>{ e.stopPropagation(); confirmDeleteAnnotation(a, pageNum); };
      pe.annotLayer.appendChild(mark);
    }
  }

  if (typeof window.paintDrawingsForPage === 'function') {
    await window.paintDrawingsForPage(pageNum);
  }

  // Restore active pending selection overlay on this page
  if (window.pendingSelection && window.pendingSelection.pageNum === pageNum && typeof window.paintPendingOverlay === 'function') {
    window.paintPendingOverlay(window.pendingSelection, true);
  }
}

export function confirmDeleteAnnotation(a, pageNum){
  window.Sheet.open(`
    <div style="text-align:center; padding:8px 4px 4px;">
      <div style="color:${a.color}; margin-bottom:12px; display:flex; justify-content:center;">${window.icon(a.type==='underline'?'underline':'highlighter','icon icon-lg')}</div>
      <div class="font-display" style="font-size:16px; font-weight:600; margin-bottom:6px;">Remove this ${a.type==='underline'?'underline':'highlight'}?</div>
      <div style="font-size:13px; color:var(--text-dim); margin-bottom:18px; max-height:60px; overflow:hidden;">"${window.escapeHtml((a.text||'').slice(0,90))}${a.text&&a.text.length>90?'…':''}"</div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" style="flex:1; padding:12px;" id="cancel-del-annot">Keep it</button>
        <button class="btn" style="flex:1; padding:12px; background:var(--danger); color:#fff;" id="confirm-del-annot">Remove</button>
      </div>
    </div>
  `);
  document.getElementById('cancel-del-annot').onclick = ()=>window.Sheet.close();
  document.getElementById('confirm-del-annot').onclick = async ()=>{
    await window.DB.del('annotations', a.id);
    window.Sheet.close();
    await paintAnnotations(pageNum);
    window.toast('Removed');
  };
}

export function openNoteComposer(selArg){
  const sel = selArg || pendingSelection;
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 10px;">Add note</div>
    <div style="font-size:13px; color:var(--text-dim); background:var(--surface-2); border-radius:4px; padding:10px; margin-bottom:12px; max-height:80px; overflow:auto;">${window.escapeHtml(sel?.text?.slice(0,240)||'')}</div>
    <textarea id="note-text" rows="4" placeholder="Write your thoughts…" style="width:100%; padding:12px; font-size:14.5px; margin-bottom:14px; resize:vertical;"></textarea>
    <button class="btn btn-primary" style="width:100%; padding:13px;" id="note-save">Save note</button>
  `);
  document.getElementById('note-save').onclick = async ()=>{
    const content = document.getElementById('note-text').value.trim();
    if(!content){ window.toast('Write something first'); return; }
    await window.DB.put('notes', {id:window.uid(), fileId:window.State.currentFile.id, page: sel?.pageNum||window.State.currentPage, kind:'note', content, sourceText: sel?.text||'', createdAt:Date.now()});
    window.Sheet.close(); window.toast('Note saved'); hideSelToolbar();
  };
}

// Bind to window for global availability
window.mergeLineRects = mergeLineRects;
window.findPageWrapForRange = findPageWrapForRange;
window.handleSelection = handleSelection;
window.caretFromPoint = caretFromPoint;
window.findSpanAtPoint = findSpanAtPoint;
window.caretFromPointOnPage = caretFromPointOnPage;
window.wordRangeAtCaret = wordRangeAtCaret;
window.comparePoints = comparePoints;
window.buildExtendedRange = buildExtendedRange;
window.snapRangeToWholeWords = snapRangeToWholeWords;
window.updateLiveSelectionRange = updateLiveSelectionRange;
window.currentSelectionRects = currentSelectionRects;
window.createSelectionHandle = createSelectionHandle;
window.paintPendingOverlay = paintPendingOverlay;
window.clearPendingOverlay = clearPendingOverlay;
window.showSelToolbar = showSelToolbar;
window.hideSelToolbar = hideSelToolbar;
window.createAnnotation = createAnnotation;
window.paintAnnotations = paintAnnotations;
window.confirmDeleteAnnotation = confirmDeleteAnnotation;
window.openNoteComposer = openNoteComposer;
