// @ts-nocheck
import { getPdfPageText } from './teacher_context.js';
import { fixLegacyHindi, pageIsLegacyHindi } from './hindi_fix.js';

/**
 * Normalize text for deterministic anchor matching (keeps Devanagari, Latin, numbers).
 */
export function normMatchText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D'"`.,;:!?()[\]{}<>\/\\|—–\-_*~•·।]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  const n = normMatchText(s);
  return n ? n.split(' ').filter(Boolean) : [];
}

/**
 * Reads rendered `.textLayer span` entries from `pageEls[pageNum]` in visual reading order,
 * falling back cleanly to `getPdfPageText` when page isn't currently mounted.
 */
export async function extractNumberedSentences(doc, pageNum, fileId = null) {
  const pe = window.pageEls?.[pageNum];
  let fullText = '';

  if (pe && pe.textLayerDiv) {
    const spans = [...pe.textLayerDiv.querySelectorAll('span')];
    if (spans.length) {
      const legacy = (() => {
        try {
          const raw = pe.textLayerDiv.innerText || pe.textLayerDiv.textContent || '';
          return pageIsLegacyHindi(raw);
        } catch {
          return false;
        }
      })();
      const parts = spans
        .map((sp) => {
          const t = (sp.textContent || '').replace(/\s+/g, ' ').trim();
          return legacy ? fixLegacyHindi(t) : t;
        })
        .filter(Boolean);
      fullText = parts.join(' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (!fullText && doc) {
    fullText = await getPdfPageText(doc, pageNum, fileId);
  }

  if (!fullText || !fullText.trim()) {
    return { fullText: '', sentences: [] };
  }

  // Split cleanly on sentence boundaries (Latin + Devanagari danda `।`)
  const rawChunks = fullText
    .replace(/([.?!।])\s+(?=[A-Z0-9\u0900-\u097F"“(\[])/g, '$1\n')
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 6);

  // Sub-chunk ultra-long run-on OCR blocks around ~240 chars for tighter anchor precision
  const finalChunks = [];
  for (const chunk of rawChunks) {
    if (chunk.length <= 260) {
      finalChunks.push(chunk);
    } else {
      const subs = chunk.split(/(?<=[,;:])\s+/);
      let acc = '';
      for (const sub of subs) {
        if ((acc + ' ' + sub).trim().length > 220 && acc) {
          finalChunks.push(acc.trim());
          acc = sub;
        } else {
          acc = (acc ? acc + ' ' : '') + sub;
        }
      }
      if (acc.trim()) finalChunks.push(acc.trim());
    }
  }

  const sentences = finalChunks.slice(0, 85).map((text, idx) => ({
    id: `S${idx + 1}`,
    text,
  }));

  return { fullText, sentences };
}

/**
 * Matches a verbatim quote (or fallback sentence text from `sourceSentenceIds`) against live PDF `.textLayer` spans.
 * Guarantees ZERO random false highlights: returns `{ matched: false }` if confidence < 0.78.
 */
export function locateSourceAnchor(pageNum, sourceQuote = '', sourceSentenceIds = [], sentenceList = [], sourceType = 'quote') {
  const pe = window.pageEls?.[pageNum];
  const fallbackSent = (() => {
    if (Array.isArray(sourceSentenceIds) && sourceSentenceIds.length && Array.isArray(sentenceList)) {
      const hit = sentenceList.find((s) => sourceSentenceIds.includes(s.id));
      if (hit) return hit.text;
    }
    return '';
  })();

  const candidateQuery = (sourceQuote && String(sourceQuote).trim().length >= 8)
    ? String(sourceQuote).trim()
    : fallbackSent;

  if (!candidateQuery || sourceType === 'synthesis') {
    return {
      matched: false,
      confidence: sourceType === 'synthesis' ? 0.55 : 0,
      reason: sourceType === 'synthesis' ? 'synthesis' : 'empty_quote',
      pageNum,
      rects: [],
      displayQuote: fallbackSent || sourceQuote || '',
    };
  }

  if (!pe || !pe.wrap || !pe.textLayerDiv) {
    return {
      matched: false,
      confidence: 0.4,
      reason: 'page_not_mounted',
      pageNum,
      rects: [],
      displayQuote: candidateQuery,
    };
  }

  const spanRects = typeof window.getSpanRects === 'function' ? window.getSpanRects(pe) : pe.spanRects;
  if (!spanRects || !spanRects.length) {
    return {
      matched: false,
      confidence: 0.2,
      reason: 'no_text_layer',
      pageNum,
      rects: [],
      displayQuote: candidateQuery,
    };
  }

  const qNorm = normMatchText(candidateQuery);
  const qTokens = tokenize(candidateQuery);
  if (qTokens.length < 2) {
    return {
      matched: false,
      confidence: 0.3,
      reason: 'too_short',
      pageNum,
      rects: [],
      displayQuote: candidateQuery,
    };
  }

  // Build token stream pointing back to span index
  const legacy = pageIsLegacyHindi(pe.textLayerDiv.innerText || pe.textLayerDiv.textContent || '');
  const spanEntries = spanRects.map((sr, sIdx) => {
    const raw = (sr.span?.textContent || '').trim();
    const fixed = legacy ? fixLegacyHindi(raw) : raw;
    return {
      sIdx,
      rect: sr.rect,
      norm: normMatchText(fixed),
      tokens: tokenize(fixed),
    };
  });

  const streamTokens = [];
  for (const se of spanEntries) {
    for (const tk of se.tokens) {
      streamTokens.push({ token: tk, sIdx: se.sIdx });
    }
  }

  if (!streamTokens.length) {
    return {
      matched: false,
      confidence: 0.2,
      reason: 'empty_spans',
      pageNum,
      rects: [],
      displayQuote: candidateQuery,
    };
  }

  // 1. Exact contiguous stream match first (confidence 0.98)
  const qJoined = qTokens.join(' ');
  const fullStreamStr = streamTokens.map((x) => x.token).join(' ');
  const exactTokenIdx = fullStreamStr.indexOf(qJoined);
  if (exactTokenIdx !== -1) {
    const prefixTokens = fullStreamStr.slice(0, exactTokenIdx).trim();
    const startTokPos = prefixTokens ? prefixTokens.split(' ').length : 0;
    const endTokPos = Math.min(streamTokens.length - 1, startTokPos + qTokens.length - 1);
    const matchedSpanSet = new Set();
    for (let k = startTokPos; k <= endTokPos; k++) {
      matchedSpanSet.add(streamTokens[k].sIdx);
    }
    const rawRects = [...matchedSpanSet].map((idx) => spanEntries[idx].rect);
    const mergedRects = mergeAlignedRects(rawRects);
    if (mergedRects.length) {
      return {
        matched: true,
        confidence: 0.97,
        reason: 'exact',
        pageNum,
        rects: mergedRects,
        displayQuote: candidateQuery,
      };
    }
  }

  // 2. Sliding window fuzzy bag-of-tokens + sequence order check
  const winLen = Math.min(streamTokens.length, Math.max(qTokens.length + 4, Math.ceil(qTokens.length * 1.25)));
  const qSet = new Set(qTokens);
  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;

  // Step through token stream in small increments
  const stride = streamTokens.length > 500 ? 2 : 1;
  for (let start = 0; start <= Math.max(0, streamTokens.length - Math.min(3, qTokens.length)); start += stride) {
    const end = Math.min(streamTokens.length, start + winLen);
    const winSlice = streamTokens.slice(start, end);
    const winSet = new Set(winSlice.map((x) => x.token));
    let hits = 0;
    for (const qt of qSet) {
      if (winSet.has(qt)) hits++;
    }
    const recall = hits / qSet.size;
    if (recall < 0.65) continue;

    // Bonus for ordered token alignment
    let qCursor = 0;
    let orderedHits = 0;
    for (const wt of winSlice) {
      if (qCursor < qTokens.length && wt.token === qTokens[qCursor]) {
        orderedHits++;
        qCursor++;
      } else {
        const look = qTokens.indexOf(wt.token, qCursor);
        if (look !== -1 && look - qCursor <= 3) {
          orderedHits++;
          qCursor = look + 1;
        }
      }
    }
    const orderRatio = orderedHits / qTokens.length;
    const score = recall * 0.55 + orderRatio * 0.45;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
      bestEnd = end - 1;
    }
  }

  if (bestScore >= 0.78) {
    // Tighten trailing boundary to last matching token
    let tightEnd = bestEnd;
    while (tightEnd > bestStart && !qSet.has(streamTokens[tightEnd].token)) {
      tightEnd--;
    }
    let tightStart = bestStart;
    while (tightStart < tightEnd && !qSet.has(streamTokens[tightStart].token)) {
      tightStart++;
    }
    const spanIdSet = new Set();
    for (let k = tightStart; k <= tightEnd; k++) {
      spanIdSet.add(streamTokens[k].sIdx);
    }
    const rawRects = [...spanIdSet].map((idx) => spanEntries[idx].rect);
    const mergedRects = mergeAlignedRects(rawRects);
    if (mergedRects.length) {
      return {
        matched: true,
        confidence: Number(bestScore.toFixed(2)),
        reason: 'fuzzy_strong',
        pageNum,
        rects: mergedRects,
        displayQuote: candidateQuery,
      };
    }
  }

  return {
    matched: false,
    confidence: Number(bestScore.toFixed(2)),
    reason: 'uncertain',
    pageNum,
    rects: [],
    displayQuote: candidateQuery,
  };
}

function mergeAlignedRects(rawRects) {
  if (!rawRects || !rawRects.length) return [];
  const valid = rawRects.filter((r) => r && (r.width > 1) && (r.bottom > r.top));
  if (!valid.length) return [];

  if (typeof window.mergeLineRects === 'function') {
    return window.mergeLineRects(valid);
  }

  const sorted = [...valid].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const r of sorted) {
    const h = r.bottom - r.top;
    let found = null;
    for (const line of lines) {
      const lt = line[0].top;
      const lb = line[0].bottom;
      const overlap = Math.min(r.bottom, lb) - Math.max(r.top, lt);
      if (overlap > Math.min(h, lb - lt) * 0.4) {
        found = line;
        break;
      }
    }
    if (found) found.push(r);
    else lines.push([r]);
  }

  const merged = [];
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);
    let cur = { ...line[0] };
    for (let i = 1; i < line.length; i++) {
      const n = line[i];
      if (n.left <= cur.right + 14) {
        cur.right = Math.max(cur.right, n.right);
        cur.top = Math.min(cur.top, n.top);
        cur.bottom = Math.max(cur.bottom, n.bottom);
        cur.width = cur.right - cur.left;
      } else {
        merged.push(cur);
        cur = { ...n };
      }
    }
    merged.push(cur);
  }
  return merged;
}

/**
 * Clears ONLY temporary AI explainer overlays without touching saved student highlights.
 */
export function clearExplainerSourceHighlights() {
  document.querySelectorAll('.sayad-explainer-hl, .sayad-explainer-term-hl').forEach((el) => el.remove());
}

/**
 * Paints synced highlights on `.annot-layer` + optional underlined key terms on the same page,
 * and binds click-to-jump back into the explainer step.
 */
export function paintExplainerSourceHighlight(pageNum, anchorResult, keyTerms = [], stepIndex = 0, onJumpToStep = null, autoScroll = true) {
  clearExplainerSourceHighlights();
  if (!anchorResult || !anchorResult.matched || !anchorResult.rects?.length) return false;

  const pe = window.pageEls?.[pageNum];
  if (!pe || !pe.annotLayer) return false;

  let minTop = Infinity;
  for (const r of anchorResult.rects) {
    const h = Math.max(10, (r.bottom - r.top));
    if (r.top < minTop) minTop = r.top;

    const mark = document.createElement('div');
    mark.className = 'sayad-explainer-hl';
    mark.title = `Step ${stepIndex + 1} source · Tap to focus`;
    mark.style.cssText = `
      left:${Math.max(0, r.left - 5)}px;
      top:${Math.max(0, r.top - 2)}px;
      width:${Math.max(10, r.width + 10)}px;
      height:${h + 4}px;
    `;
    mark.onclick = (e) => {
      e.stopPropagation();
      if (typeof onJumpToStep === 'function') onJumpToStep(stepIndex);
    };
    pe.annotLayer.appendChild(mark);
  }

  // Underline important terms on the page where matched
  if (Array.isArray(keyTerms) && keyTerms.length && pe.textLayerDiv) {
    const normTerms = keyTerms
      .map((t) => normMatchText(t))
      .filter((t) => t.length >= 3);
    const spanRects = typeof window.getSpanRects === 'function' ? window.getSpanRects(pe) : pe.spanRects;
    if (normTerms.length && spanRects?.length) {
      let paintedTerms = 0;
      for (const sr of spanRects) {
        if (paintedTerms >= 12) break;
        const sn = normMatchText(sr.span?.textContent || '');
        if (!sn) continue;
        if (normTerms.some((term) => sn.includes(term) || (sn.length >= 4 && term.includes(sn)))) {
          const ul = document.createElement('div');
          ul.className = 'sayad-explainer-term-hl';
          ul.style.cssText = `
            left:${sr.rect.left}px;
            top:${sr.rect.bottom - 2}px;
            width:${Math.max(8, sr.rect.width)}px;
            height:2.5px;
          `;
          pe.annotLayer.appendChild(ul);
          paintedTerms++;
        }
      }
    }
  }

  if (autoScroll && pe.wrap && Number.isFinite(minTop)) {
    const scrollEl = document.getElementById('reader-scroll');
    if (scrollEl) {
      const targetTop = Math.max(0, pe.wrap.offsetTop + minTop - Math.max(80, scrollEl.clientHeight * 0.28));
      scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }
  return true;
}
