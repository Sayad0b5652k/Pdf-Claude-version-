// @ts-nocheck
// Book chat context: page text cache, TOC / chapter detection, relevant-page search, prompt context
import { fixLegacyItems } from './hindi_fix.js';
import { teacherState } from './teacher_state.js';

// Fast multi-tier page text cache (Memory + Persistent IndexedDB)
const pdfPageTextCache = new Map();

export async function getPdfPageText(doc, pageNum, fileId = null) {
  if (!doc || pageNum < 1 || pageNum > doc.numPages) return '';
  const docKey = fileId || doc.fingerprint || 'doc';
  const cacheKey = `${docKey}_${pageNum}`;
  
  if (pdfPageTextCache.has(cacheKey)) {
    return pdfPageTextCache.get(cacheKey);
  }

  // 1. Try IndexedDB persistent page cache
  try {
    if (window.DB && typeof window.DB.getCachedPage === 'function') {
      const dbCached = await window.DB.getCachedPage(docKey, pageNum);
      if (dbCached && dbCached.text) {
        pdfPageTextCache.set(cacheKey, dbCached.text);
        return dbCached.text;
      }
    }
  } catch(e) {}

  // 2. Extract from PDF.js document handle
  try {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = fixLegacyItems(textContent.items.map(item => item.str || '')).replace(/\s+/g, ' ').trim();
    pdfPageTextCache.set(cacheKey, text);

    // Save to IndexedDB asynchronously in background
    if (window.DB && typeof window.DB.putCachedPage === 'function' && text) {
      window.DB.putCachedPage(docKey, pageNum, text).catch(() => {});
    }

    return text;
  } catch(e) {
    return '';
  }
}

export function detectLastDiscussedPage(chatMessages, fallbackPage = 1) {
  if (!chatMessages || !chatMessages.length) return fallbackPage;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const msg = chatMessages[i];
    if (!msg || !msg.text || msg.text === '…') continue;
    // Match explicit page markers only: [Page 121], [📖 Page 121], Page 121, Pg 121, "121 page"
    const match = msg.text.match(/(?:\[(?:📖\s*)?Page\s*(\d+)\]|\b(?:page|pg|page\s*no\.?)\s*(\d+)\b|(\d+)\s*(?:th|st|nd|rd)?\s*(?:page|pg)\b)/i);
    if (match) {
      const p = parseInt(match[1] || match[2] || match[3], 10);
      if (p >= 1) return p;
    }
  }
  return fallbackPage;
}

export function detectLastDiscussedChapter(chatMessages) {
  if (!chatMessages || !chatMessages.length) return null;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const msg = chatMessages[i];
    if (!msg || !msg.text || msg.text === '…') continue;
    // Look for explicit chapter/module markers in message text:
    const match = msg.text.match(/\b(Module|Chapter|Unit|Lesson|Paath|Adhyaye?)\s*[:.\-_—–]?\s*0*(\d+|[ivxlcdm]+)\b/i);
    if (match) {
      const type = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      const num = match[2];
      return { chapterType: type, chapterNumber: num };
    }
  }
  return null;
}

// Fast multi-tier TOC cache per fileId
const pdfTocCache = new Map();

export async function parseBookToc(doc, fileId, totalPages) {
  if (!doc) return [];
  const cacheKey = fileId || 'doc_toc';
  if (pdfTocCache.has(cacheKey)) {
    return pdfTocCache.get(cacheKey);
  }

  const entries = [];
  const maxTOCScan = Math.min(totalPages, 30);

  for (let p = 1; p <= maxTOCScan; p++) {
    const txt = await getPdfPageText(doc, p, fileId);
    if (!txt || txt.length < 20) continue;
    const isTocPage = /table\s+of\s+contents|contents\b|content\b|\bindex\b|syllabus\b|scheme\s+of\s+studies/i.test(txt);
    if (!isTocPage && p > 15) continue;

    const lines = txt.split(/\r?\n|\s{3,}/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      // Pattern 1: Chapter/Lesson/Unit/Module 1: Title ... 14
      const m1 = trimmed.match(/(?:chapter|lesson|unit|module|paath|adhyaye?)\s*[:.\-_]?\s*(\d+|[ivxlcdm]+)\s*[:.\-_]?\s*([A-Za-z0-9\s,–'’"&\-]+?)(?:[\s.·]{2,}|page|pg|\t)?\s*(\d{1,4})$/i);
      if (m1) {
        const cNum = m1[1];
        const title = m1[2].replace(/[\s.·]+$/, '').trim();
        const pNum = parseInt(m1[3], 10);
        if (pNum >= 1 && pNum <= totalPages) {
          entries.push({ chapterNum: cNum, title, startPage: pNum });
          continue;
        }
      }

      // Pattern 2: 1. Title ... 14
      const m2 = trimmed.match(/^(\d{1,2})\s*[:.\-_]\s*([A-Za-z0-9\s,–'’"&\-]+?)(?:[\s.·]{2,}|page|pg|\t)?\s*(\d{1,4})$/i);
      if (m2) {
        const cNum = m2[1];
        const title = m2[2].replace(/[\s.·]+$/, '').trim();
        const pNum = parseInt(m2[3], 10);
        if (pNum >= 1 && pNum <= totalPages && title.length > 2) {
          entries.push({ chapterNum: cNum, title, startPage: pNum });
        }
      }
    }
  }

  // Deduplicate and sort by startPage
  const uniqueEntries = [];
  const seenPages = new Set();
  entries.sort((a, b) => a.startPage - b.startPage).forEach(e => {
    if (!seenPages.has(e.startPage)) {
      seenPages.add(e.startPage);
      uniqueEntries.push(e);
    }
  });

  pdfTocCache.set(cacheKey, uniqueEntries);
  return uniqueEntries;
}

// Helper to parse page text for explicit module / chapter / unit headings
export function parsePageHeaderForChapter(text) {
  if (!text || typeof text !== 'string') return null;
  const topSlice = text.slice(0, 1400);
  const lines = topSlice.split(/\r?\n/).slice(0, 14);

  // Pattern A: Module/Chapter/Unit/Lesson 8: Title
  const headerRegex = /\b(module|chapter|unit|lesson|paath|adhyaye?)\s*[:.\-_—–]?\s*0*(\d+|[ivxlcdm]+)\b\s*[:.\-_—–]?\s*([^\n\r]+)?/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(headerRegex);
    if (match) {
      const type = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      const num = match[2];
      let title = (match[3] || '').trim();
      title = title.replace(/\b(?:page|pg|no\.?|\d+)\b/gi, '').replace(/[\s.·—–-]+$/, '').trim();
      return { type, chapterNum: num, title };
    }
  }

  // Pattern B: Search top 1400 characters broadly
  const broadMatch = topSlice.match(headerRegex);
  if (broadMatch) {
    const type = broadMatch[1].charAt(0).toUpperCase() + broadMatch[1].slice(1).toLowerCase();
    const num = broadMatch[2];
    let title = (broadMatch[3] || '').trim();
    title = title.replace(/\b(?:page|pg|no\.?|\d+)\b/gi, '').replace(/[\s.·—–-]+$/, '').trim();
    return { type, chapterNum: num, title };
  }

  return null;
}

export async function detectChapterBoundaries(doc, activePage, requestedChapterNum, activeFileId, totalPages, userQuery = '') {
  let startPage = activePage;
  let endPage = activePage;
  let chapterTitle = '';
  let chapterNumber = requestedChapterNum || '';
  let chapterType = 'Chapter';
  let nextChapterInfo = null;

  // -------------------------------------------------------------
  // TIER 0: AUTHORITATIVE TABLE OF CONTENTS & BOOKMARKS OUTLINE
  // ALWAYS check the verified PDF Outline / Table of Contents FIRST!
  // This is author-verified ground truth and prevents false matches.
  // -------------------------------------------------------------
  let chapterList = [];
  if (typeof window.getChapterList === 'function' && doc) {
    try {
      chapterList = await window.getChapterList(doc, activeFileId);
    } catch (e) {
      console.warn('Could not retrieve chapterList in detectChapterBoundaries:', e);
    }
  }

  if (chapterList && chapterList.length > 0) {
    let matchedIdx = -1;

    // 0A. Match by requestedChapterNum (e.g. "3", "6", "8", "1")
    if (requestedChapterNum) {
      const cleanReqNum = String(requestedChapterNum).trim().toLowerCase();
      const cleanReqDigits = cleanReqNum.replace(/\D/g, '');

      // 1. Check exact number in rawTitle (e.g. "Ch-3", "Ch 3", "3")
      matchedIdx = chapterList.findIndex(ch => {
        const rawDigits = (ch.rawTitle || '').replace(/\D/g, '');
        if (cleanReqDigits && rawDigits === cleanReqDigits) return true;
        const rawMatch = (ch.rawTitle || '').match(new RegExp(`\\b(?:ch|chap|chapter|module|lesson|unit|paath)\\s*[-–:.]?\\s*0*${cleanReqDigits || cleanReqNum}\\b`, 'i'));
        if (rawMatch) return true;
        const titleMatch = (ch.title || '').match(new RegExp(`\\b(?:ch|chap|chapter|module|lesson|unit|paath)\\s*[-–:.]?\\s*0*${cleanReqDigits || cleanReqNum}\\b`, 'i'));
        if (titleMatch) return true;
        return false;
      });

      // 2. If still not matched, check 1-based index (skipping preface/contents if present)
      if (matchedIdx === -1) {
        const numInt = parseInt(cleanReqDigits || cleanReqNum, 10);
        if (!isNaN(numInt) && numInt >= 1) {
          const startsWithIntro = /^(?:content|preface|foreword|acknowledg|intro)/i.test(chapterList[0].rawTitle || chapterList[0].title);
          const candidateIdx = startsWithIntro ? numInt : (numInt - 1);
          if (candidateIdx >= 0 && candidateIdx < chapterList.length) {
            matchedIdx = candidateIdx;
          }
        }
      }
    }

    // 0B. Match by title keywords in userQuery (e.g. "astrologer", "mary kom", "bholi", "necklace", "andha yug")
    if (matchedIdx === -1 && userQuery && typeof userQuery === 'string') {
      const qLower = userQuery.toLowerCase();
      const stopWords = new Set(['the', 'and', 'a', 'an', 'module', 'chapter', 'lesson', 'unit', 'in', 'of', 'to', 'for', 'is', 'are', 'was', 'were', 'explain', 'tell', 'about', 'summary', 'summarise', 'summarize', 'kya', 'hai', 'batao', 'samjhao', 'padhao', 'notes', 'questions']);
      
      let bestScore = 0;
      let bestIdx = -1;

      chapterList.forEach((ch, idx) => {
        const combinedTitle = `${ch.subtitle || ''} ${ch.title || ''} ${ch.rawTitle || ''}`.toLowerCase();
        const titleWords = combinedTitle
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 2 && !stopWords.has(w));
        
        let score = 0;
        for (const word of titleWords) {
          if (qLower.includes(word)) {
            score += word.length;
          }
        }
        if (score > bestScore && score >= 4) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      if (bestIdx !== -1) {
        matchedIdx = bestIdx;
      }
    }

    // 0C. Match by activePage (if activePage falls cleanly within a chapter's span)
    if (matchedIdx === -1 && activePage) {
      matchedIdx = chapterList.findIndex(ch => activePage >= ch.startPage && activePage <= ch.endPage);
    }

    if (matchedIdx !== -1) {
      const curr = chapterList[matchedIdx];
      const next = chapterList[matchedIdx + 1];
      startPage = curr.startPage;
      endPage = curr.endPage || (next ? Math.max(startPage, next.startPage - 1) : Math.min(totalPages, startPage + 22));

      // Extract and clean chapter title (e.g. "Ch-3: An Astrologer's Day MODULE - 3" -> "An Astrologer's Day")
      let cleanTitle = curr.subtitle || curr.title || '';
      cleanTitle = cleanTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
      cleanTitle = cleanTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
      cleanTitle = cleanTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');
      chapterTitle = cleanTitle || curr.title;

      // Extract chapter number
      const numMatch = (curr.rawTitle || '').match(/\d+/) || (curr.title || '').match(/(?:ch|chapter|module|lesson|unit)\s*[-–:.]?\s*(\d+)/i) || (curr.title || '').match(/\d+/);
      chapterNumber = numMatch ? numMatch[0] : (requestedChapterNum || String(matchedIdx + 1));
      chapterType = 'Chapter';

      if (next) {
        const nextNumMatch = (next.rawTitle || '').match(/\d+/) || (next.title || '').match(/\d+/);
        let nextTitle = next.subtitle || next.title;
        nextTitle = nextTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
        nextTitle = nextTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
        nextChapterInfo = {
          chapterNum: nextNumMatch ? nextNumMatch[0] : String(matchedIdx + 2),
          title: nextTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '') || next.title,
          startPage: next.startPage
        };
      }

      return {
        startPage,
        endPage,
        chapterTitle,
        chapterNumber,
        chapterType,
        source: 'toc_outline_verified',
        nextChapterInfo
      };
    }
  }

  // -------------------------------------------------------------
  // TIER 0.5: In-Text Table of Contents Parsing (Front-of-Book TOC)
  // -------------------------------------------------------------
  const tocEntries = await parseBookToc(doc, activeFileId, totalPages);
  if (tocEntries && tocEntries.length > 0 && requestedChapterNum) {
    const idx = tocEntries.findIndex(e => String(e.chapterNum).toLowerCase() === String(requestedChapterNum).toLowerCase());
    if (idx !== -1) {
      const curr = tocEntries[idx];
      const next = tocEntries[idx + 1];
      startPage = curr.startPage;
      endPage = next ? Math.max(startPage, next.startPage - 1) : Math.min(totalPages, startPage + 22);
      chapterTitle = curr.title;
      chapterNumber = curr.chapterNum;
      if (next) nextChapterInfo = { chapterNum: next.chapterNum, title: next.title, startPage: next.startPage };
      return { startPage, endPage, chapterTitle, chapterNumber, chapterType: 'Chapter', source: 'toc_verified', nextChapterInfo };
    }
  }

  // -------------------------------------------------------------
  // TIER 1: Current Page Header & Body Inspection (Active Page)
  // -------------------------------------------------------------
  const activePageText = await getPdfPageText(doc, activePage, activeFileId);
  const prevPageText = activePage > 1 ? await getPdfPageText(doc, activePage - 1, activeFileId) : '';

  if (requestedChapterNum) {
    const parsedHeader = parsePageHeaderForChapter(activePageText);
    if (parsedHeader && String(parsedHeader.chapterNum) === String(requestedChapterNum)) {
      chapterNumber = requestedChapterNum;
      chapterTitle = parsedHeader.title || '';
      chapterType = parsedHeader.type || 'Chapter';

      let foundStart = activePage;
      const backwardLimit = Math.max(1, activePage - 40);
      const specificRegex = new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${requestedChapterNum}\\b`, 'i');
      for (let p = activePage - 1; p >= backwardLimit; p--) {
        const t = await getPdfPageText(doc, p, activeFileId);
        if (t && specificRegex.test(t)) {
          foundStart = p;
        } else {
          break;
        }
      }
      startPage = foundStart;

      const nextNum = parseInt(requestedChapterNum, 10);
      let foundNext = null;
      if (!isNaN(nextNum)) {
        const nextRegex = new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${nextNum + 1}\\b`, 'i');
        const forwardLimit = Math.min(totalPages, activePage + 35);
        for (let p = activePage + 1; p <= forwardLimit; p++) {
          const t = await getPdfPageText(doc, p, activeFileId);
          if (t && nextRegex.test(t)) {
            foundNext = p;
            nextChapterInfo = { chapterNum: String(nextNum + 1), title: `Chapter ${nextNum + 1}`, startPage: p };
            break;
          }
        }
      }
      endPage = foundNext ? (foundNext - 1) : Math.min(totalPages, Math.max(activePage + 8, startPage + 22));
      return { startPage, endPage, chapterTitle, chapterNumber, chapterType, source: 'tier1_current_page_matched', nextChapterInfo };
    }
  } else {
    const curHeader = parsePageHeaderForChapter(activePageText) || parsePageHeaderForChapter(prevPageText);
    if (curHeader) {
      chapterNumber = curHeader.chapterNum;
      chapterTitle = curHeader.title;
      chapterType = curHeader.type;

      let foundStart = activePage;
      const chRegex = new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${chapterNumber}\\b`, 'i');
      const backwardLimit = Math.max(1, activePage - 40);
      for (let p = activePage - 1; p >= backwardLimit; p--) {
        const t = await getPdfPageText(doc, p, activeFileId);
        if (t && chRegex.test(t)) {
          foundStart = p;
        } else {
          break;
        }
      }
      startPage = foundStart;

      const chNumInt = parseInt(chapterNumber, 10);
      let foundNext = null;
      if (!isNaN(chNumInt)) {
        const nextRegex = new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${chNumInt + 1}\\b`, 'i');
        const forwardLimit = Math.min(totalPages, activePage + 35);
        for (let p = activePage + 1; p <= forwardLimit; p++) {
          const t = await getPdfPageText(doc, p, activeFileId);
          if (t && nextRegex.test(t)) {
            foundNext = p;
            nextChapterInfo = { chapterNum: String(chNumInt + 1), title: `Chapter ${chNumInt + 1}`, startPage: p };
            break;
          }
        }
      }
      endPage = foundNext ? (foundNext - 1) : Math.min(totalPages, Math.max(activePage + 8, startPage + 22));
      return { startPage, endPage, chapterTitle, chapterNumber, chapterType, source: 'tier1_current_page_header', nextChapterInfo };
    }
  }

  // -------------------------------------------------------------
  // TIER 2: Backward Scan for Chapter Heading
  // -------------------------------------------------------------
  const backwardLimit = Math.max(1, activePage - 45);
  let detectedStart = null;
  let detectedChNum = null;
  let detectedTitle = '';
  let detectedType = 'Chapter';

  for (let p = activePage; p >= backwardLimit; p--) {
    const t = await getPdfPageText(doc, p, activeFileId);
    if (!t) continue;

    const parsed = parsePageHeaderForChapter(t);
    if (parsed) {
      if (requestedChapterNum && String(parsed.chapterNum) !== String(requestedChapterNum)) {
        continue; // Only accept if chapter number matches requested
      }
      detectedStart = p;
      detectedChNum = parsed.chapterNum;
      detectedTitle = parsed.title;
      detectedType = parsed.type;
      break;
    }
  }

  if (detectedStart) {
    startPage = detectedStart;
    chapterNumber = detectedChNum;
    chapterTitle = detectedTitle;
    chapterType = detectedType;

    let detectedNext = null;
    const forwardLimit = Math.min(totalPages, activePage + 35);
    const nextChInt = parseInt(detectedChNum, 10);
    const nextRegex = !isNaN(nextChInt)
      ? new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${nextChInt + 1}\\b`, 'i')
      : /\b(?:module|chapter|unit|lesson|paath|adhyaye?)\s*[:.\-_—–]?\s*(\d+|[ivxlcdm]+)\b/i;

    for (let p = activePage + 1; p <= forwardLimit; p++) {
      const t = await getPdfPageText(doc, p, activeFileId);
      if (!t) continue;
      if (nextRegex.test(t)) {
        detectedNext = p;
        if (!isNaN(nextChInt)) {
          nextChapterInfo = { chapterNum: String(nextChInt + 1), title: `Chapter ${nextChInt + 1}`, startPage: p };
        }
        break;
      }
    }
    endPage = detectedNext ? (detectedNext - 1) : Math.min(totalPages, Math.max(activePage + 8, startPage + 22));
    return { startPage, endPage, chapterTitle, chapterNumber, chapterType, source: 'tier2_backward_scan', nextChapterInfo };
  }

  // -------------------------------------------------------------
  // TIER 3: Strict Document Search (Header Verified)
  // -------------------------------------------------------------
  if (requestedChapterNum) {
    const maxScan = Math.min(totalPages, 500);
    let foundStart = null;
    let foundTitle = '';
    let foundType = 'Chapter';

    for (let i = 1; i <= maxScan; i += 25) {
      const promises = [];
      for (let p = i; p < i + 25 && p <= maxScan; p++) {
        promises.push(getPdfPageText(doc, p, activeFileId).then(t => ({ page: p, text: t })));
      }
      const batch = await Promise.all(promises);
      for (const item of batch) {
        if (!item.text) continue;
        const parsed = parsePageHeaderForChapter(item.text);
        if (parsed && String(parsed.chapterNum).toLowerCase() === String(requestedChapterNum).toLowerCase()) {
          foundStart = item.page;
          foundTitle = parsed.title;
          foundType = parsed.type;
          break;
        }
      }
      if (foundStart) break;
    }

    if (foundStart) {
      startPage = foundStart;
      chapterTitle = foundTitle;
      chapterType = foundType;
      const nextNum = parseInt(requestedChapterNum, 10);
      let foundNext = null;
      if (!isNaN(nextNum)) {
        const nextRegex = new RegExp(`\\b(?:module|chapter|unit|lesson|paath|adhyaye?)\\s*[:.\\-_—–]?\\s*0*${nextNum + 1}\\b`, 'i');
        const endLimit = Math.min(totalPages, startPage + 35);
        for (let p = startPage + 1; p <= endLimit; p++) {
          const t = await getPdfPageText(doc, p, activeFileId);
          if (t && nextRegex.test(t)) {
            foundNext = p;
            nextChapterInfo = { chapterNum: String(nextNum + 1), title: `Chapter ${nextNum + 1}`, startPage: p };
            break;
          }
        }
      }
      endPage = foundNext ? (foundNext - 1) : Math.min(totalPages, startPage + 22);
      return { startPage, endPage, chapterTitle, chapterNumber: requestedChapterNum, chapterType, source: 'tier3_strict_scan', nextChapterInfo };
    }
  }

  // Fallback: Default graceful range without confusion interruptions
  startPage = Math.max(1, activePage - 2);
  endPage = Math.min(totalPages, activePage + 8);
  return {
    startPage,
    endPage,
    chapterTitle: '',
    chapterNumber: '',
    chapterType: 'Chapter',
    source: 'fallback',
    needsClarification: false,
    activePage,
    nextChapterInfo: null
  };
}

// Full-Book Dynamic Semantic Index & Cross-PDF Universal RAG Engine

const RETRIEVAL_STOP = new Set(('the a an and or of to in on for is are was were what which who how why when where this that these those with from about explain tell me give does did kya hai hain ka ki ke ko se me mein par aur batao bataiye samjhao samjha kaise kyun kyu kaun kaunsa yeh ye woh wo mujhe isko iske uska please chapter page book pdf').split(' '));

/* Rank pages of a book/chapter by how well they match a question, using the in-document search index. */
export async function findRelevantPages(query, fileId, doc, lo, hi, limit = 4) {
  const terms = [...new Set(String(query).toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3 && !RETRIEVAL_STOP.has(t)))];
  if (!terms.length || typeof window.buildSearchIndex !== 'function') return [];
  if (window.State.currentFile?.id !== fileId || window.State.currentDoc !== doc) return [];
  const job = window.buildSearchIndex();
  const t0 = Date.now();
  while (!job.done && job.pages.length < hi && Date.now() - t0 < 3500) await new Promise(r => setTimeout(r, 120));
  const scored = [];
  for (const p of job.pages) {
    if (p.page < lo || p.page > hi || !p.text) continue;
    let score = 0, distinct = 0;
    for (const t of terms) {
      let n = 0, from = 0;
      while (n < 20) { const k = p.text.indexOf(t, from); if (k < 0) break; n++; from = k + t.length; }
      if (n) { distinct++; score += 1 + Math.log2(1 + n); }
    }
    if (distinct) scored.push({ page: p.page, score: score * (1 + distinct / terms.length) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* Takes every machine-read marker out of a reply: interactive cards, follow-up chips, review cards. */
export function extractAllMarkers(text) {
  let s = typeof text === 'string' ? text : '';
  let followups = [];
  const fm = s.match(/\[\[\s*FOLLOWUPS\s*:([^\]]*)\]\]/i);
  if (fm) followups = fm[1].split('|').map(x => x.trim()).filter(x => x.length > 2 && x.length < 70).slice(0, 3);
  s = s.replace(/\[\[\s*FOLLOWUPS\s*:[^\]]*\]\]?/gi, '');
  const cards = [];
  s = s.replace(/\[\[\s*CARD\s*:([^\]]*?)\]\]/gi, (_m, body) => {
    const parts = body.split('=>');
    if (parts.length >= 2) cards.push({ front: parts[0].trim(), back: parts.slice(1).join('=>').trim() });
    return '';
  });
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return { text: s, followups, cards };
}

export async function getTeacherContext(options = {}, userQuery = '', chatHistory = []) {
  let fileRecord = window.State?.files?.find(f => f.id === teacherState.activeFileId) || window.State?.currentFile;
  const isGlobal = teacherState.activeFileId === 'global_chat' || (!fileRecord && !teacherState.activeFileId);
  const allFiles = window.State?.files || [];
  const selectedScope = options.scope || 'page'; // 'page' | 'chapter' | 'book'

  if (isGlobal) {
    let libraryOverview = '';
    let crossDocContext = '';
    if (allFiles.length > 0) {
      libraryOverview = allFiles.slice(0, 25).map(f => `- "${f.name}" (${f.pageCount || 0} pages, folder: ${f.folder || 'Main'}, subject: ${f.subject || 'General'})`).join('\n');
      
      // If user asks a question in global chat, perform deep cross-pdf search across all library PDFs
      if (userQuery && userQuery.trim().length > 2) {
        crossDocContext = await searchCrossPdfLibrary(allFiles, userQuery);
      }
    }
    return {
      docTitle: 'General AI Study Assistant (Cross-Library RAG)',
      docId: 'global_chat',
      folder: 'All',
      subject: 'Universal Academic Knowledge',
      currentPage: 1,
      totalPages: 1,
      pageText: '',
      prevPageText: '',
      nextPageText: '',
      chapterText: crossDocContext || '',
      bookOverviewText: libraryOverview ? `AVAILABLE LIBRARY DOCUMENTS:\n${libraryOverview}` : '',
      crossPdfContext: crossDocContext || (libraryOverview ? `AVAILABLE LIBRARY DOCUMENTS:\n${libraryOverview}` : '')
    };
  }

  // Load complete file record from IndexedDB if data not yet loaded in memory
  if (!fileRecord?.data) {
    try {
      const full = await window.DB.get('files', teacherState.activeFileId);
      if (full) fileRecord = full;
    } catch(e) {}
  }

  // Load PDF.js document handle to extract real text
  let doc = (window.State?.currentFile?.id === teacherState.activeFileId) ? window.State?.currentDoc : null;
  let ownedDoc = null; // temporary handle we opened ourselves and must destroy
  if (!doc && fileRecord?.data && typeof pdfjsLib !== 'undefined') {
    try {
      doc = await pdfjsLib.getDocument({ data: fileRecord.data.slice(0), ...window.PDFJS_LOAD_OPTS }).promise;
      ownedDoc = doc;
    } catch(err) {
      console.warn('Could not load PDF document for AI grounding:', err);
    }
  }

  const totalPages = doc?.numPages || fileRecord?.pageCount || window.State?.numPages || 1;
  const currentReaderPage = (window.State?.currentFile?.id === teacherState.activeFileId && window.State?.currentPage) ? window.State.currentPage : 1;

  // Clean query for intent analysis
  const cleanQ = (userQuery || '').toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').trim();
  
  // 1. Direct Page number requested in current user query (e.g. "page 56", "pg 56")
  const queryPageMatch = cleanQ.match(/\b(?:page|pg|page\s*no\.?|p\.)\s*(\d{1,4})\b/i) 
    || cleanQ.match(/\b(\d{1,4})\s*(?:th|st|nd|rd)?\s*(?:page|pg)\b/i);

  // 2. Direct Chapter or Lesson query (e.g. "chapter 8", "ch 8", "lesson 8", "eighth chapter")
  const chapterNumMatch = cleanQ.match(/(?:chapter|ch\b|lesson|unit|module|paath|adhyaye?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|pehla|pehli|doosra|dusra|teesra|chautha|panchwa|i{1,3}|iv|v|vi{0,3}|ix|x|xi{0,3}|xiv|xv|xvi{0,3}|xix|xx)\b/i) 
    || cleanQ.match(/\b(\d+|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th|pehla|pehli|doosra|dusra|teesra|chautha|panchwa)\s*(?:th|st|nd|rd)?\s*(?:chapter|ch\b|lesson|unit|module|paath|adhyaye?)\b/i);

  const numWordMap = {
    'one': '1', 'first': '1', '1st': '1', 'pehla': '1', 'pehli': '1',
    'two': '2', 'second': '2', '2nd': '2', 'doosra': '2', 'dusra': '2',
    'three': '3', 'third': '3', '3rd': '3', 'teesra': '3',
    'four': '4', 'fourth': '4', '4th': '4', 'chautha': '4',
    'five': '5', 'fifth': '5', '5th': '5', 'panchwa': '5',
    'six': '6', 'sixth': '6', '6th': '6',
    'seven': '7', 'seventh': '7', '7th': '7',
    'eight': '8', 'eighth': '8', '8th': '8',
    'nine': '9', 'ninth': '9', '9th': '9',
    'ten': '10', 'tenth': '10', '10th': '10',
    'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
    'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20',
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
    'xi': '11', 'xii': '12', 'xiii': '13', 'xiv': '14', 'xv': '15', 'xvi': '16', 'xvii': '17', 'xviii': '18', 'xix': '19', 'xx': '20'
  };

  let requestedChapterNum = '';
  if (chapterNumMatch && (chapterNumMatch[1] || chapterNumMatch[2])) {
    const rawNum = (chapterNumMatch[1] || chapterNumMatch[2]).toLowerCase();
    requestedChapterNum = numWordMap[rawNum] || rawNum.replace(/[^0-9]/g, '');
  }

  // Session Chapter Persistence:
  // If student was already discussing a chapter, keep it for follow-ups ("aur samjhao", "continue")
  // UNLESS the student explicitly inquires about a different chapter or topic title!
  const hasExplicitTopicOrChapterInQuery = requestedChapterNum || (doc && typeof userQuery === 'string' && userQuery.trim().length > 3);
  if (!requestedChapterNum && !hasExplicitTopicOrChapterInQuery) {
    if (teacherState.currentSessionChapter && teacherState.currentSessionChapter.fileId === teacherState.activeFileId && teacherState.currentSessionChapter.chapterNumber) {
      requestedChapterNum = teacherState.currentSessionChapter.chapterNumber;
    } else {
      const prevCh = detectLastDiscussedChapter(chatHistory);
      if (prevCh && prevCh.chapterNumber) {
        requestedChapterNum = prevCh.chapterNumber;
      }
    }
  }

  // 3. In-text / Exercise question detection (e.g. "chapter 8 intext questions 8.4 2b", "8.4 2b", "intext 8.4")
  const intextMatch = cleanQ.match(/(?:intext|exercise|ex\.?|q\.?|question)\s*(?:questions?|ex)?\s*(\d+\.?\d*)/i)
    || cleanQ.match(/\b(\d+\.\d+)\b/);
  const targetIntextNum = intextMatch && intextMatch[1] ? intextMatch[1] : '';

  // 4. Conversational Intents
  const isAuthorQuery = /\b(?:author|writer|lekhak|kavi|poet|who\s+wrote|kisne\s+likhi)\b/i.test(cleanQ);
  const isNextChapterQuery = /\b(?:iske\s+baad|next|agla|agle)\s*(?:ka\s*)?(?:chapter|lesson|unit|module|paath)\b/i.test(cleanQ) || /\b(?:iske\s+baad\s+(?:kya|kaun\s*sa)\s+hai)\b/i.test(cleanQ);
  const isThisChapterQuery = /\b(?:this\s+(?:chapter|module|lesson|unit)|is\s+(?:chapter|module|lesson|unit)|current\s+(?:chapter|module|lesson|unit))\b/i.test(cleanQ) || /\b(?:summarise|summarize|summary|teach\s+me|padhao|teach\s+this)\b/i.test(cleanQ);

  // Detect last discussed page from conversation history for natural continuity
  const lastDiscussedPage = detectLastDiscussedPage(chatHistory, null);
  // Anchor target: prioritize explicit current reading page if user specifically asked for "this chapter",
  // otherwise prioritize the active session chapter or last discussed page to avoid jumping
  const activeAnchorTarget = isThisChapterQuery
    ? currentReaderPage
    : (lastDiscussedPage || teacherState.currentSessionChapter?.startPage || currentReaderPage);

  // If user selected a specific chapter via the Chapter Dropdown and didn't ask for a different chapter, use it!
  let boundaries = null;
  if (teacherState.currentSessionChapter && teacherState.currentSessionChapter.fileId === teacherState.activeFileId && teacherState.currentSessionChapter.startPage && !requestedChapterNum && !isThisChapterQuery && !hasExplicitTopicOrChapterInQuery) {
    boundaries = {
      startPage: teacherState.currentSessionChapter.startPage,
      endPage: teacherState.currentSessionChapter.endPage,
      chapterTitle: teacherState.currentSessionChapter.chapterTitle || '',
      chapterNumber: teacherState.currentSessionChapter.chapterNumber || '',
      chapterType: teacherState.currentSessionChapter.chapterType || 'Chapter',
      source: 'session_chapter_selector'
    };
  } else {
    // Detect whole chapter boundaries with authoritative Table of Contents & outline
    boundaries = doc ? await detectChapterBoundaries(doc, activeAnchorTarget, requestedChapterNum, teacherState.activeFileId, totalPages, userQuery) : { startPage: 1, endPage: totalPages, chapterTitle: '', chapterNumber: '', chapterType: 'Chapter' };
  }

  // Update active session chapter to anchor future follow-up dialogue turns
  if (boundaries && boundaries.chapterNumber) {
    teacherState.currentSessionChapter = {
      fileId: teacherState.activeFileId,
      chapterNumber: boundaries.chapterNumber,
      chapterTitle: boundaries.chapterTitle || '',
      chapterType: boundaries.chapterType || 'Chapter',
      startPage: boundaries.startPage,
      endPage: boundaries.endPage
    };
  }

  let anchorPage = currentReaderPage;
  const matchedPagesMap = new Map();

  // Mode 1: Exact Direct Page Query (e.g. "page 56")
  if (queryPageMatch && (queryPageMatch[1] || queryPageMatch[2])) {
    const pReq = parseInt(queryPageMatch[1] || queryPageMatch[2], 10);
    if (pReq >= 1 && pReq <= totalPages) {
      anchorPage = pReq;
      const startP = Math.max(1, pReq - 2);
      const endP = Math.min(totalPages, pReq + 2);
      for (let p = startP; p <= endP; p++) {
        const pTxt = await getPdfPageText(doc, p, teacherState.activeFileId);
        if (pTxt && pTxt.trim()) {
          matchedPagesMap.set(p, {
            text: pTxt,
            label: p === pReq ? `⭐ REQUESTED FOCUS PAGE ${pReq}` : `📄 CONTEXT MARGIN (PAGE ${p})`
          });
        }
      }
    }
  } 
  // Mode 2: In-Text / Exercise Question Query (e.g. "intext questions 8.4 2b")
  else if (targetIntextNum && doc) {
    anchorPage = boundaries.startPage || currentReaderPage;
    const maxScanPages = Math.min(doc.numPages, 500);
    const batchSize = 25;

    for (let i = 1; i <= maxScanPages; i += batchSize) {
      const pagePromises = [];
      for (let p = i; p < i + batchSize && p <= maxScanPages; p++) {
        pagePromises.push(getPdfPageText(doc, p, teacherState.activeFileId).then(txt => ({ page: p, text: txt })));
      }
      const batchResults = await Promise.all(pagePromises);

      for (const res of batchResults) {
        if (!res.text || !res.text.trim()) continue;
        const lowerTxt = res.text.toLowerCase();
        if (lowerTxt.includes(targetIntextNum)) {
          const isAnswerKey = /answers?\s+to\s+intext|answer\s+key|hints?\s*&\s*solutions?|solutions?\s+to/i.test(lowerTxt);
          const isQuestionHeader = /intext\s+questions?|questions?\s+\d+\.\d+|exercise\s+\d+\.\d+|check\s+your\s+progress/i.test(lowerTxt);

          if (isQuestionHeader && !isAnswerKey) {
            anchorPage = res.page;
            matchedPagesMap.set(res.page, {
              text: res.text,
              label: `🎯 PRIMARY INTEXT QUESTIONS ${targetIntextNum} (EXACT QUESTION STATEMENT)`
            });
          } else if (isAnswerKey) {
            matchedPagesMap.set(res.page, {
              text: res.text,
              label: `🔑 TEXTBOOK OFFICIAL ANSWER KEY & SOLUTIONS (FOR ${targetIntextNum})`
            });
          } else {
            matchedPagesMap.set(res.page, {
              text: res.text,
              label: `📖 LESSON THEORY (SECTION ${targetIntextNum})`
            });
          }
        }
      }
    }

    // Always include Chapter Start page for general orientation
    if (boundaries.startPage && !matchedPagesMap.has(boundaries.startPage)) {
      const startTxt = await getPdfPageText(doc, boundaries.startPage, teacherState.activeFileId);
      if (startTxt && startTxt.trim()) {
        matchedPagesMap.set(boundaries.startPage, {
          text: startTxt,
          label: `📖 CHAPTER/LESSON START (INTRO & BYLINE)`
        });
      }
    }
  }
  // Mode 3: Whole Chapter Chunking & Conversational Continuity
  else if (doc) {
    anchorPage = requestedChapterNum ? boundaries.startPage : (lastDiscussedPage || currentReaderPage);
    const { startPage, endPage, chapterNumber, chapterTitle, nextChapterInfo } = boundaries;
    const pageRange = endPage - startPage + 1;
    const pagesToFetch = new Set();

    if (pageRange <= 12) {
      // Small to medium chapter: grab all pages
      for (let p = startPage; p <= endPage; p++) {
        pagesToFetch.add(p);
      }
    } else {
      // Large chapter: fetch front pages (title, author, intro), active reading focus, and chapter end (summary/exercises)
      for (let p = startPage; p <= Math.min(endPage, startPage + 3); p++) {
        pagesToFetch.add(p);
      }
      // Active page and neighbors
      const curFocus = anchorPage >= startPage && anchorPage <= endPage ? anchorPage : startPage;
      for (let p = Math.max(startPage, curFocus - 1); p <= Math.min(endPage, curFocus + 1); p++) {
        pagesToFetch.add(p);
      }
      // End pages (summary, intext questions, exercises)
      for (let p = Math.max(startPage, endPage - 3); p <= endPage; p++) {
        pagesToFetch.add(p);
      }
    }

    // If author query, ensure startPage and startPage + 1 are fetched
    if (isAuthorQuery) {
      pagesToFetch.add(startPage);
      if (startPage + 1 <= totalPages) pagesToFetch.add(startPage + 1);
    }

    // If next chapter query, ensure next chapter start page is fetched
    if (isNextChapterQuery && nextChapterInfo) {
      pagesToFetch.add(nextChapterInfo.startPage);
    }

    // Fetch all planned pages in parallel
    const sortedPageList = Array.from(pagesToFetch).sort((a, b) => a - b);
    const fetchedResults = await Promise.all(
      sortedPageList.map(p => getPdfPageText(doc, p, teacherState.activeFileId).then(txt => ({ page: p, text: txt })))
    );

    for (const item of fetchedResults) {
      if (!item.text || !item.text.trim()) continue;
      let label = '';
      if (item.page === startPage) {
        label = `📖 CHAPTER ${chapterNumber || ''} START (${(chapterTitle || 'TITLE & AUTHOR BYLINE').toUpperCase()})`;
      } else if (item.page === anchorPage) {
        label = `⭐ ACTIVE READING FOCUS`;
      } else if (item.page >= endPage - 1) {
        label = `🎯 CHAPTER SUMMARY & INTEXT EXERCISES`;
      } else if (nextChapterInfo && item.page === nextChapterInfo.startPage) {
        label = `📑 NEXT SEQUENTIAL CHAPTER: ${(nextChapterInfo.title || 'CHAPTER ' + nextChapterInfo.chapterNum).toUpperCase()}`;
      } else {
        label = `📖 CHAPTER CONTENT`;
      }
      matchedPagesMap.set(item.page, { text: item.text, label });
    }
  }

  // Keyword retrieval: the pages that actually talk about what was asked (the chapter/page picker alone
  // only grabs start, current and end pages, so answers from the middle of a long chapter were missed).
  if (doc && userQuery && userQuery.trim().length > 3 && !targetIntextNum) {
    try {
      const lo = selectedScope === 'book' ? 1 : Math.max(1, boundaries?.startPage || 1);
      const hi = selectedScope === 'book' ? totalPages : Math.min(totalPages, boundaries?.endPage || totalPages);
      const hits = await findRelevantPages(userQuery, teacherState.activeFileId, doc, lo, hi, 4);
      for (const h of hits) {
        if (matchedPagesMap.has(h.page)) continue;
        const pTxt = await getPdfPageText(doc, h.page, teacherState.activeFileId);
        if (pTxt && pTxt.trim()) matchedPagesMap.set(h.page, { text: pTxt, label: '🔎 MATCHES THE QUESTION' });
      }
    } catch (e) { console.warn('retrieval skipped', e); }
  }

  // Always ensure anchor page & its immediate neighbor pages are seeded
  if (doc && matchedPagesMap.size < 3) {
    const startP = Math.max(1, anchorPage - 1);
    const endP = Math.min(totalPages, anchorPage + 1);
    for (let p = startP; p <= endP; p++) {
      if (!matchedPagesMap.has(p)) {
        const pTxt = await getPdfPageText(doc, p, teacherState.activeFileId);
        if (pTxt && pTxt.trim()) {
          matchedPagesMap.set(p, { text: pTxt, label: p === anchorPage ? '⭐ ACTIVE FOCUS' : '' });
        }
      }
    }
  }

  let pageText = '';
  let prevPageText = '';
  let nextPageText = '';
  if (doc) {
    pageText = await getPdfPageText(doc, anchorPage, teacherState.activeFileId);
    if (anchorPage > 1) {
      prevPageText = await getPdfPageText(doc, anchorPage - 1, teacherState.activeFileId);
    }
    if (anchorPage < totalPages) {
      nextPageText = await getPdfPageText(doc, anchorPage + 1, teacherState.activeFileId);
    }
  }

  // Convert matched pages map into structured grounded context
  const sortedPageNumbers = Array.from(matchedPagesMap.keys()).sort((a, b) => a - b);
  const chapterPages = sortedPageNumbers.map(p => {
    const item = matchedPagesMap.get(p);
    const labelStr = item.label ? ` - ${item.label}` : (p === anchorPage ? ' - ⭐ ACTIVE FOCUS' : '');
    return `--- [PAGE ${p} OF ${totalPages}${labelStr}] ---\n${item.text || item}`;
  });
  let chapterText = chapterPages.join('\n\n');
  let chapterMetadataHeader = '';
  const chTypeLabel = boundaries.chapterType || 'Chapter';
  if (boundaries.chapterNumber || boundaries.chapterTitle) {
    chapterMetadataHeader += `--- [VERIFIED ${chTypeLabel.toUpperCase()} BOUNDARY & NAVIGATION METADATA] ---\nActive ${chTypeLabel}: ${boundaries.chapterNumber ? chTypeLabel + ' ' + boundaries.chapterNumber : ''} ${boundaries.chapterTitle ? `("${boundaries.chapterTitle}")` : ''} (Document Pages ${boundaries.startPage} to ${boundaries.endPage})\n`;
  }
  if (boundaries.nextChapterInfo) {
    chapterMetadataHeader += `Next Sequential Chapter: ${boundaries.nextChapterInfo.title || 'Chapter ' + boundaries.nextChapterInfo.chapterNum} (Starting at Page ${boundaries.nextChapterInfo.startPage})\n`;
  }
  if (chapterMetadataHeader) {
    chapterMetadataHeader += `---------------------------------------------------------\n\n`;
    chapterText = chapterMetadataHeader + chapterText;
  }

  // Extract Table of Contents / Intro (Pages 1 to 5) only if user is on page 1 or explicitly requested overview
  let bookOverviewText = '';
  if (doc && (selectedScope === 'book' || anchorPage <= 3)) {
    const samplePages = [];
    const maxIntro = Math.min(doc.numPages, 5);
    for (let p = 1; p <= maxIntro; p++) {
      const pTxt = await getPdfPageText(doc, p, teacherState.activeFileId);
      if (pTxt && pTxt.trim()) {
        samplePages.push(`[Page ${p} Table of Contents/Overview]:\n${pTxt.slice(0, 1200)}`);
      }
    }
    bookOverviewText = samplePages.join('\n\n');
  }

  // User notes
  let userNotesText = '';
  try {
    const notes = await window.DB.byIndex('notes', 'fileId', teacherState.activeFileId);
    if (notes && notes.length > 0) {
      userNotesText = notes.slice(0, 5).map(n => `- Note (Page ${n.page}): ${n.content}`).join('\n');
    }
  } catch(e) {}

  // 3. Real Cross-PDF Library Search (Extract real passages from other library documents)
  let crossPdfContext = '';
  if (teacherState.crossPdfActive || options.includeCrossPdf || selectedScope === 'cross_pdf') {
    const otherFiles = (window.State?.files || []).filter(f => f.id !== teacherState.activeFileId);
    if (otherFiles.length > 0 && userQuery && userQuery.trim().length > 2) {
      crossPdfContext = await searchCrossPdfLibrary(otherFiles, userQuery);
    } else if (otherFiles.length > 0) {
      crossPdfContext = otherFiles.slice(0, 10).map(f => {
        return `[Library Document: "${f.name}" | Pages: ${f.pageCount || 0} | Subject: "${f.subject || 'General'}"]`;
      }).join('\n');
    }
  }

  if (ownedDoc) { try { ownedDoc.destroy(); } catch (e) {} }

  return {
    docTitle: fileRecord?.name || 'Academic Document',
    docId: teacherState.activeFileId,
    folder: fileRecord?.folder || 'General',
    subject: fileRecord?.subject || '',
    currentPage: anchorPage,
    totalPages,
    pageText,
    prevPageText,
    nextPageText,
    chapterText,
    bookOverviewText,
    userNotesText,
    crossPdfContext,
    detectedChapterNumber: boundaries.chapterNumber || '',
    detectedChapterTitle: boundaries.chapterTitle || '',
    detectedChapterType: boundaries.chapterType || 'Chapter',
    startPage: boundaries.startPage,
    endPage: boundaries.endPage,
    needsClarification: false
  };
}

// Deep Multi-Document RAG Search Across All PDF Files in Library
export async function searchCrossPdfLibrary(filesList, query) {
  if (!filesList || !filesList.length || !query) return '';
  const cleanQ = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = cleanQ.split(/\s+/).filter(w => w.length > 2 && !['what','this','book','about','tell','explain','chapter','please','kya','yeh','hai','aur','batao','is'].includes(w));
  if (!tokens.length) return '';

  const matchedSnippets = [];
  const targetFiles = filesList.slice(0, 8); // Search up to 8 other documents in parallel

  for (const f of targetFiles) {
    let doc = null;
    try {
      let fileData = f.data;
      if (!fileData) {
        const fullRec = await window.DB.get('files', f.id);
        fileData = fullRec?.data;
      }
      if (fileData && typeof pdfjsLib !== 'undefined') {
        doc = await pdfjsLib.getDocument({ data: fileData.slice(0), ...window.PDFJS_LOAD_OPTS }).promise;
      }
    } catch(err) {
      continue;
    }

    if (!doc) continue;

    const maxScan = Math.min(doc.numPages, 30);
    for (let p = 1; p <= maxScan; p++) {
      const pTxt = await getPdfPageText(doc, p, f.id);
      if (!pTxt) continue;
      const lower = pTxt.toLowerCase();
      const matchCount = tokens.filter(t => lower.includes(t)).length;
      if (matchCount >= 1 || (cleanQ.length > 4 && lower.includes(cleanQ))) {
        matchedSnippets.push(`[FROM LIBRARY BOOK: "${f.name}" - Page ${p}]:\n${pTxt.slice(0, 1200)}`);
        if (matchedSnippets.length >= 6) break;
      }
    }
    try { doc.destroy(); } catch (e) {}
    if (matchedSnippets.length >= 6) break;
  }

  if (matchedSnippets.length > 0) {
    return `--- RELEVANT CROSS-PDF PASSAGES RETRIEVED FROM YOUR LIBRARY ---\n${matchedSnippets.join('\n\n')}\n--- END CROSS-PDF RETRIEVAL ---`;
  }
  return '';
}
