// @ts-nocheck
import { fixLegacyHindi, fixLegacyItems } from './hindi_fix.js';
import { callAI, callServerGemini, callGeminiFast, callGroqFast, callGroq70b, speakWithElevenLabs, stopElevenAudio } from './ai.js';

/* ============================================================
   AI SUPER-TUTOR (AI Teacher & Chatbot)
   - Clean, uncluttered ChatGPT/Gemini conversational design
   - Unified for both specific PDF context & General Universal AI chat
   - Customization Sheet for Personas (Academic, ELI5, Memory Hacks, Exam Evaluator)
   - Action bar for each AI answer: Copy, Save to Notes, + Flashcard, Listen
   - IndexedDB Chat History Persistence with per-document and global tracking
   ============================================================ */

export const TEACHER_MODES = [
  { id: 'professional', label: 'Academic & Rigorous', icon: 'teacher', desc: 'Standard textbook breakdown, deep conceptual clarity & exam rigor' },
  { id: 'eli5', label: "Explain Like I'm 10 (ELI5)", icon: 'brain', desc: 'Everyday analogies, story-like examples, zero jargon' },
  { id: 'mnemonics', label: 'Memory Tricks & Mnemonics', icon: 'zap', desc: 'Acronyms, visual memory hooks, chunking & formulas recall' },
  { id: 'evaluator', label: 'Exam Answer Evaluator', icon: 'award', desc: 'Grade answers against 2, 3 or 5 mark rubrics with missing points' },
  { id: 'summary', label: 'Rapid Revision & Key Facts', icon: 'sparkle', desc: 'High-yield key definitions, formulas cheat sheet & rapid recap' },
];

export let activeTeacherMode = 'professional';
export let examTargetMarks = 3; // 2, 3, or 5
export let crossPdfActive = false;
export let isVoiceListening = false;
export let speechRecognitionInstance = null;
export let activeFileId = null;
export let currentSessionChapter = null; // { fileId, chapterNumber, chapterTitle, chapterType, startPage, endPage }

export const EXPLANATION_STYLES = [
  { id: 'comprehensive', label: '🌟 Comprehensive Breakdown', desc: 'Balanced, rich explanation with clear headers & authentic [Page X] citations' },
  { id: 'stepbystep', label: '🪜 Step-by-Step Walkthrough', desc: 'Numbered sequential stages, practical workflows & clear progression' },
  { id: 'academic', label: '🎓 Deep Academic Analysis', desc: 'Scholarly rigor, theoretical foundations, underlying mechanics & exam evaluation' }
];

export let activeExplanationStyle = (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_explanation_style') : '') || 'comprehensive';

// Clean repetitive loop phrases and fix common speech-to-text spelling issues
export function deduplicateSpokenPhrase(text) {
  if (!text) return '';

  // Academic and phonetic spelling correction dictionary
  const SPELLING_FIXES = {
    'chaiptar': 'chapter',
    'chaipter': 'chapter',
    'chaptar': 'chapter',
    'chepter': 'chapter',
    'chptr': 'chapter',
    'helo': 'hello',
    'helow': 'hello',
    'hlo': 'hello',
    'hlw': 'hello',
    'lesan': 'lesson',
    'lessen': 'lesson',
    'leson': 'lesson',
    'modul': 'module',
    'modyul': 'module',
    'queshn': 'question',
    'koschan': 'question',
    'koshchan': 'question',
    'queshan': 'question',
    'ansar': 'answer',
    'aansar': 'answer',
    'thimakka': 'Thimmakka',
    'thimaka': 'Thimmakka',
    'thimmaka': 'Thimmakka',
    'thimmakka\'s': 'Thimmakka\'s',
    'ekjam': 'exam',
    'exm': 'exam',
    'samjho': 'samjhao',
    'samjaho': 'samjhao',
    'btao': 'batao',
    'baare': 'bare',
    'mein': 'me',
    'kare': 'karo',
    'padho': 'padhao',
    'kitaab': 'book',
    'buk': 'book'
  };

  const rawWords = text.trim().split(/\s+/).map(w => {
    const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SPELLING_FIXES[cleanWord]) {
      return SPELLING_FIXES[cleanWord];
    }
    return w;
  });

  if (rawWords.length <= 1) return rawWords.join(' ');

  // 1. Remove immediate duplicate single words (e.g. "kya kya" -> "kya", "is is" -> "is")
  const deduplicatedWords = [];
  for (let i = 0; i < rawWords.length; i++) {
    if (i === 0 || rawWords[i].toLowerCase() !== rawWords[i - 1].toLowerCase()) {
      deduplicatedWords.push(rawWords[i]);
    }
  }

  // 2. Remove repeated consecutive sub-phrases of length 2 to 10
  let cleanStr = deduplicatedWords.join(' ');
  for (let phraseLen = 2; phraseLen <= 10; phraseLen++) {
    const tokens = cleanStr.split(/\s+/);
    if (tokens.length < phraseLen * 2) continue;
    const newTokens = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + phraseLen * 2 <= tokens.length) {
        const p1 = tokens.slice(i, i + phraseLen).join(' ').toLowerCase();
        const p2 = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();
        if (p1 === p2) {
          newTokens.push(...tokens.slice(i, i + phraseLen));
          i += phraseLen * 2;
          continue;
        }
      }
      newTokens.push(tokens[i]);
      i++;
    }
    cleanStr = newTokens.join(' ');
  }

  // 3. Remove trailing duplicate greeting if user said "hello ... hello"
  const finalTokens = cleanStr.split(/\s+/);
  if (finalTokens.length > 2) {
    if (finalTokens[0].toLowerCase() === 'hello' && finalTokens[finalTokens.length - 1].toLowerCase() === 'hello') {
      finalTokens.pop();
      cleanStr = finalTokens.join(' ');
    }
  }

  return cleanStr;
}

// High-accuracy Devanagari Hindi to Hinglish / Roman script Transliteration
export function transliterateDevanagariToHinglish(text) {
  if (!text) return '';
  if (!/[\u0900-\u097F]/.test(text)) return deduplicateSpokenPhrase(text); // already English / Latin

  // Common Hindi spoken word dictionary for natural, accurate Hinglish spelling
  const WORD_MAP = {
    'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'wo', 'क्या': 'kya',
    'है': 'hai', 'हैं': 'hain', 'हो': 'ho', 'हूँ': 'hoon', 'हूं': 'hoon',
    'था': 'tha', 'थी': 'thi', 'थे': 'the', 'किस': 'kis', 'बारे': 'bare',
    'में': 'me', 'पे': 'pe', 'पर': 'par', 'से': 'se', 'को': 'ko',
    'का': 'ka', 'की': 'ki', 'के': 'ke', 'करो': 'karo', 'करें': 'karein',
    'करना': 'karna', 'कर': 'kar', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe',
    'समझाओ': 'samjhao', 'समझाएं': 'samjhayein', 'समझा': 'samjha', 'बताओ': 'batao',
    'बताएं': 'batayein', 'पढ़ाओ': 'padhao', 'पढ़ाएं': 'padhayein', 'सिखाओ': 'sikhao',
    'कैसे': 'kaise', 'क्यों': 'kyon', 'कब': 'kab', 'कहाँ': 'kahan', 'कहा': 'kaha',
    'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni', 'उत्तर': 'answer',
    'प्रश्न': 'question', 'सवाल': 'question', 'जवाब': 'answer', 'पेज': 'page',
    'किताब': 'book', 'पाठ': 'lesson', 'मुझको': 'mujhko', 'मुझे': 'mujhe',
    'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'हम': 'hum',
    'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare', 'आप': 'aap',
    'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'तुम': 'tum',
    'तुम्हारा': 'tumhara', 'तुम्हारी': 'tumhari', 'तुम्हारे': 'tumhare',
    'नहीं': 'nahi', 'ना': 'na', 'हाँ': 'haan', 'और': 'aur', 'या': 'ya',
    'लेकिन': 'lekin', 'मगर': 'magar', 'परन्तु': 'parantu', 'क्योंकि': 'kyonki',
    'इसलिए': 'isliye', 'अगर': 'agar', 'यदि': 'yadi', 'तो': 'toh',
    'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge', 'सकता': 'sakta',
    'सकती': 'sakti', 'सकते': 'sakte', 'चाहिए': 'chahiye', 'दीजिए': 'dijiye',
    'दीजिये': 'dijiye', 'लीजिए': 'lijiye', 'बोलिए': 'boliye', 'लिखिए': 'likhiye',
    'लिखो': 'likho', 'हल': 'solution', 'सूत्र': 'formula', 'नियम': 'rule',
    'विषय': 'subject', 'अध्याय': 'chapter', 'चैप्टर': 'chapter', 'लाइन': 'line', 'पैराग्राफ': 'paragraph',
    'मुख्य': 'main', 'बिंदु': 'point', 'टॉपिक': 'topic', 'सारांश': 'summary',
    'परीक्षा': 'exam', 'तैयारी': 'preparation', 'नोट्स': 'notes', 'याद': 'yaad',
    'हेलो': 'hello', 'हेल्लो': 'hello', 'नमस्ते': 'namaste', 'पर्यावरण': 'environment',
    'कचरा': 'waste', 'प्रबंधन': 'management', 'तनाव': 'stress'
  };

  // Replace whole words from dictionary first
  let processed = text.split(/(\s+|[.,!?;:])/).map(token => {
    const cleanToken = token.trim();
    if (WORD_MAP[cleanToken]) {
      return WORD_MAP[cleanToken];
    }
    return token;
  }).join('');

  if (!/[\u0900-\u097F]/.test(processed)) return deduplicateSpokenPhrase(processed);

  // Character level phonetic transliteration map
  const vowels = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah'
  };

  const matras = {
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', '़': ''
  };

  const consonants = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'फ़': 'f', 'ड़': 'r', 'ढ़': 'rh'
  };

  let out = '';
  const len = processed.length;
  for (let i = 0; i < len; i++) {
    const char = processed[i];
    const nextChar = i + 1 < len ? processed[i + 1] : '';

    if (vowels[char]) {
      out += vowels[char];
    } else if (consonants[char]) {
      const c = consonants[char];
      if (nextChar === '्') {
        // Halant suppresses inherent vowel
        out += c;
        i++; // skip halant
      } else if (matras[nextChar] !== undefined) {
        out += c + matras[nextChar];
        i++; // skip matra
      } else if (nextChar === ' ' || !nextChar || /[.,!?;:\n]/.test(nextChar)) {
        out += c;
      } else if (consonants[nextChar] || vowels[nextChar]) {
        out += c + 'a';
      } else {
        out += c;
      }
    } else if (matras[char] !== undefined) {
      out += matras[char];
    } else if (char === '्') {
      // halant consumed
    } else {
      out += char;
    }
  }

  const cleaned = out.replace(/\s+/g, ' ').trim();
  return deduplicateSpokenPhrase(cleaned);
}

export function getInitialWelcomeMessage(fileId) {
  const isGlobal = fileId === 'global_chat';
  const currentFile = window.State?.files?.find(f => f.id === fileId);
  const docName = isGlobal ? 'Universal Library Workspace' : (currentFile ? currentFile.name : 'Study Material');
  const curP = window.State?.currentPage || 1;
  const totalP = window.State?.numPages || currentFile?.pageCount || 1;

  return {
    role: 'assistant',
    text: isGlobal 
      ? `### 👨‍🏫 Universal Academic Assistant\nConnected to your entire digital library. Query concepts across multiple textbooks, solve step-by-step problems, and evaluate exam answers.`
      : `### 📚 Grounded in "${docName}"\n**Page ${curP} of ${totalP}** • Ready to break down derivations, explain complex theorems, or evaluate exam questions.`,
    mode: 'professional',
    timestamp: Date.now()
  };
}

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
export async function getTeacherContext(options = {}, userQuery = '', chatHistory = []) {
  let fileRecord = window.State?.files?.find(f => f.id === activeFileId) || window.State?.currentFile;
  const isGlobal = activeFileId === 'global_chat' || (!fileRecord && !activeFileId);
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
      const full = await window.DB.get('files', activeFileId);
      if (full) fileRecord = full;
    } catch(e) {}
  }

  // Load PDF.js document handle to extract real text
  let doc = (window.State?.currentFile?.id === activeFileId) ? window.State?.currentDoc : null;
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
  const currentReaderPage = (window.State?.currentFile?.id === activeFileId && window.State?.currentPage) ? window.State.currentPage : 1;

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
    if (currentSessionChapter && currentSessionChapter.fileId === activeFileId && currentSessionChapter.chapterNumber) {
      requestedChapterNum = currentSessionChapter.chapterNumber;
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
    : (lastDiscussedPage || currentSessionChapter?.startPage || currentReaderPage);

  // If user selected a specific chapter via the Chapter Dropdown and didn't ask for a different chapter, use it!
  let boundaries = null;
  if (currentSessionChapter && currentSessionChapter.fileId === activeFileId && currentSessionChapter.startPage && !requestedChapterNum && !isThisChapterQuery && !hasExplicitTopicOrChapterInQuery) {
    boundaries = {
      startPage: currentSessionChapter.startPage,
      endPage: currentSessionChapter.endPage,
      chapterTitle: currentSessionChapter.chapterTitle || '',
      chapterNumber: currentSessionChapter.chapterNumber || '',
      chapterType: currentSessionChapter.chapterType || 'Chapter',
      source: 'session_chapter_selector'
    };
  } else {
    // Detect whole chapter boundaries with authoritative Table of Contents & outline
    boundaries = doc ? await detectChapterBoundaries(doc, activeAnchorTarget, requestedChapterNum, activeFileId, totalPages, userQuery) : { startPage: 1, endPage: totalPages, chapterTitle: '', chapterNumber: '', chapterType: 'Chapter' };
  }

  // Update active session chapter to anchor future follow-up dialogue turns
  if (boundaries && boundaries.chapterNumber) {
    currentSessionChapter = {
      fileId: activeFileId,
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
        const pTxt = await getPdfPageText(doc, p, activeFileId);
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
        pagePromises.push(getPdfPageText(doc, p, activeFileId).then(txt => ({ page: p, text: txt })));
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
      const startTxt = await getPdfPageText(doc, boundaries.startPage, activeFileId);
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
      sortedPageList.map(p => getPdfPageText(doc, p, activeFileId).then(txt => ({ page: p, text: txt })))
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

  // Always ensure anchor page & its immediate neighbor pages are seeded
  if (doc && matchedPagesMap.size < 3) {
    const startP = Math.max(1, anchorPage - 1);
    const endP = Math.min(totalPages, anchorPage + 1);
    for (let p = startP; p <= endP; p++) {
      if (!matchedPagesMap.has(p)) {
        const pTxt = await getPdfPageText(doc, p, activeFileId);
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
    pageText = await getPdfPageText(doc, anchorPage, activeFileId);
    if (anchorPage > 1) {
      prevPageText = await getPdfPageText(doc, anchorPage - 1, activeFileId);
    }
    if (anchorPage < totalPages) {
      nextPageText = await getPdfPageText(doc, anchorPage + 1, activeFileId);
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
      const pTxt = await getPdfPageText(doc, p, activeFileId);
      if (pTxt && pTxt.trim()) {
        samplePages.push(`[Page ${p} Table of Contents/Overview]:\n${pTxt.slice(0, 1200)}`);
      }
    }
    bookOverviewText = samplePages.join('\n\n');
  }

  // User notes
  let userNotesText = '';
  try {
    const notes = await window.DB.byIndex('notes', 'fileId', activeFileId);
    if (notes && notes.length > 0) {
      userNotesText = notes.slice(0, 5).map(n => `- Note (Page ${n.page}): ${n.content}`).join('\n');
    }
  } catch(e) {}

  // 3. Real Cross-PDF Library Search (Extract real passages from other library documents)
  let crossPdfContext = '';
  if (crossPdfActive || options.includeCrossPdf || selectedScope === 'cross_pdf') {
    const otherFiles = (window.State?.files || []).filter(f => f.id !== activeFileId);
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
    docId: activeFileId,
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

export async function loadTeacherChatHistory(fileId) {
  try {
    const record = await window.DB.get('chathistory', fileId);
    return record && Array.isArray(record.messages) ? record.messages : [];
  } catch(e) {
    return [];
  }
}

export async function saveTeacherChatHistory(fileId, messages) {
  try {
    await window.DB.put('chathistory', {
      id: fileId,
      fileId,
      messages: messages.slice(-50),
      updatedAt: Date.now()
    });
  } catch(e) {
    console.warn('Could not save teacher chat history', e);
  }
}

export async function clearTeacherChatHistory(fileId) {
  try {
    currentSessionChapter = null;
    await window.DB.del('chathistory', fileId);
  } catch(e) {}
}

let activeContextScope = 'page'; // 'page' | 'chapter' | 'book'

export function openTeacherView(prefillQuery = '', defaultMode = 'professional', customFileId = null) {
  if (window.Sheet) {
    if (typeof window.Sheet.closeImmediate === 'function') {
      window.Sheet.closeImmediate();
    } else if (typeof window.Sheet.close === 'function') {
      window.Sheet.close();
    }
  }
  activeTeacherMode = defaultMode || 'professional';
  
  const prevFileId = activeFileId;
  if (customFileId) {
    activeFileId = customFileId;
  } else if (window.State?.currentFile?.id) {
    activeFileId = window.State.currentFile.id;
  } else {
    activeFileId = 'global_chat';
  }

  if (prevFileId !== activeFileId) {
    currentSessionChapter = null;
  }

  const currentFile = window.State?.files?.find(f => f.id === activeFileId) || window.State?.currentFile;
  const isGlobal = activeFileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : currentFile.name;
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;
  const totalPages = (!isGlobal && window.State?.numPages) ? window.State.numPages : 1;

  // Render Full Screen AI Teacher Workspace View
  window.State.view = 'teacher';
  if (typeof window.stopReadingSession === 'function') window.stopReadingSession();
  if (typeof window.hideSelToolbar === 'function') window.hideSelToolbar();

  const getModeLabel = () => {
    const m = TEACHER_MODES.find(x => x.id === activeTeacherMode);
    return m ? m.label.split('(')[0].trim() : 'Academic';
  };

  const getScopeDisplay = () => {
    if (crossPdfActive) return '🌐 All Books';
    if (activeContextScope === 'chapter') return '📑 Chapter';
    if (activeContextScope === 'book') return '📚 Whole Book';
    return `📄 Page ${currentPage}`;
  };

  document.getElementById('app').innerHTML = `
  <div class="chat-workspace">
    
    <!-- Clean Minimalist Header: Back, Doc info, and Settings -->
    <header class="chat-top-bar" id="teacher-header">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <button class="btn btn-icon" id="teacher-back-btn" title="Back to Reader" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0; color:var(--text);">
          ${window.icon('chevLeft','icon icon-sm')}
        </button>

        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${window.escapeHtml(docTitle)}">
            ${window.escapeHtml(docTitle)}
          </div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${isGlobal ? 'Universal Library' : `Page ${currentPage} of ${totalPages}`} • <span style="color:#10b981; font-weight:600;">Grounded</span>
          </div>
        </div>
      </div>

      <!-- Single clean Settings button -->
      <button class="btn btn-icon" id="teacher-custom-toggle" title="Settings & Personas" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); color:var(--text); flex-shrink:0;">
        ${window.icon('settings','icon icon-sm')}
      </button>
    </header>

    <!-- Interactive Scope & Chapter Focus Bar -->
    ${!isGlobal ? `
    <div class="chat-scope-bar" id="teacher-scope-bar" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 14px; background:var(--bg-elev); border-bottom:1px solid var(--border); max-width:760px; margin:0 auto; width:100%; box-sizing:border-box;">
      <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
        <span style="font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; white-space:nowrap; flex-shrink:0;">
          Focus:
        </span>
        <div style="flex:1; min-width:0;">
          <select id="teacher-chapter-select" data-custom-title="Select Chat Context Focus" style="width:100%;">
            <option value="__loading__">Detecting chapter…</option>
          </select>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
        <span id="teacher-scope-badge-pill" style="font-size:10.5px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:3px 7px; border-radius:4px; font-family:var(--font-mono, monospace); white-space:nowrap;">
          AUTO
        </span>
      </div>
    </div>
    ` : ''}

    <!-- Main Clean Chat Log Scroll Container -->
    <div id="teacher-chat-log" class="chat-scroll-container no-scrollbar">
      <!-- Messages or Empty Hero injected here -->
    </div>

    <!-- Bottom Docked Area: Quick Suggestion Chips + Input Capsule -->
    <div style="flex-shrink:0; padding:6px 14px 12px; background:var(--bg); border-top:1px solid var(--border); max-width:760px; margin:0 auto; width:100%;">
      
      <!-- Quick Prompt Suggestion Chips -->
      <div id="chat-quick-chips-bar" style="display:flex; align-items:center; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; -webkit-overflow-scrolling:touch;">
        ${!isGlobal ? `
        <button class="chat-quick-chip" data-query="Teach me this chapter step-by-step with interactive checkpoints">
          <span>🎓 Teach Me Chapter</span>
        </button>
        <button class="chat-quick-chip" data-query="Summarise this chapter with core breakdown and key takeaways">
          <span>📖 Summarise Chapter</span>
        </button>
        ` : ''}
        <button class="chat-quick-chip" data-query="⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath">
          <span>⚡ Detail me samjhao</span>
        </button>
        <button class="chat-quick-chip" data-query="Draw a clear Mermaid flowchart diagram explaining this process step-by-step">
          <span>📊 Flowchart</span>
        </button>
        <button class="chat-quick-chip" data-query="💡 Is concept ko simple real-world analogy se samjhao (zero jargon)">
          <span>💡 Simple Analogy</span>
        </button>
        <button class="chat-quick-chip" data-query="🎯 Exam ke point of view se important questions, keywords aur scoring points batao">
          <span>🎯 Exam Points</span>
        </button>
        <button class="chat-quick-chip" data-query="🗺️ Is topic ka authentic educational map dikhao">
          <span>🗺️ Map dikhao</span>
        </button>
        <button class="chat-quick-chip" data-query="🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao">
          <span>🖼️ Visual / Diagram</span>
        </button>
      </div>

      <!-- Minimalist Docked Input Capsule with Voice Mic -->
      <div class="chat-input-capsule" id="teacher-input-wrapper">
        <button class="btn btn-icon" id="teacher-input-mic-btn" title="Voice Input (Hindi / English)" style="width:32px; height:32px; border-radius:50%; background:transparent; border:none; color:var(--text-dim); flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          ${window.icon('mic','icon icon-sm')}
        </button>

        <textarea id="teacher-input" class="no-scrollbar" rows="1" placeholder="Ask anything about this document..." style="flex:1; padding:6px 4px; font-size:13.5px; line-height:1.4; resize:none; max-height:120px; background:transparent; border:none; color:var(--text); outline:none; box-shadow:none; font-family:inherit;"></textarea>
        
        <button class="btn btn-primary" id="teacher-send-btn" title="Send Message" style="width:32px; height:32px; border-radius:50%; padding:0; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--accent); color:#fff; border:none;">
          ${window.icon('send','icon icon-xs')}
        </button>
      </div>
    </div>

  </div>`;

  initTeacherViewLogic(activeFileId, prefillQuery);
}

export async function initTeacherViewLogic(fileId, prefillQuery) {
  const chatLogEl = document.getElementById('teacher-chat-log');
  const inputEl = document.getElementById('teacher-input');
  const sendBtn = document.getElementById('teacher-send-btn');
  const backBtn = document.getElementById('teacher-back-btn');
  const customToggle = document.getElementById('teacher-custom-toggle');
  const inputMicBtn = document.getElementById('teacher-input-mic-btn');
  const inputWrapper = document.getElementById('teacher-input-wrapper');

  if (inputEl && inputWrapper) {
    inputEl.onfocus = () => { inputWrapper.style.borderColor = 'var(--accent)'; };
    inputEl.onblur = () => { inputWrapper.style.borderColor = 'var(--border)'; };
  }

  let chatMessages = await loadTeacherChatHistory(fileId);
  if (!chatMessages) chatMessages = [];

  // Filter out any stale auto-generated bulky welcome messages so we start completely clean
  chatMessages = chatMessages.filter(m => {
    if (!m || !m.text) return false;
    if (m.role === 'assistant' && (m.text.includes('Grounded in "') || m.text.includes('Universal Academic Tutor') || m.text.includes('Status: Ready for Chat'))) {
      return false;
    }
    return true;
  });

  const currentFile = window.State?.files?.find(f => f.id === fileId) || window.State?.currentFile;
  const isGlobal = fileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : (currentFile ? currentFile.name : 'Document');
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;
  const totalPages = (!isGlobal && (window.State?.numPages || currentFile?.pageCount)) ? (window.State?.numPages || currentFile?.pageCount) : 1;
  let activeAiEngine = (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_preferred_ai_engine') : '') || 'auto';

  function renderMessages() {
    if (!chatLogEl) return;

    if (chatMessages.length === 0) {
      chatLogEl.innerHTML = `
        <div class="chat-empty-hero">
          <div class="chat-empty-icon">${window.icon('book', 'icon icon-lg')}</div>
          <div class="chat-empty-title">${window.escapeHtml(docTitle)}</div>
          <div class="chat-empty-sub">Ask questions, request summaries, or explore concepts from ${isGlobal ? 'your library' : `Page ${currentPage}`}.</div>

          <!-- Super-Tutor Feature Guide Card -->
          <div class="chat-humor-note-card">
            <div class="chat-humor-badge">
              <span>🚀</span>
              <span>SUPER-TUTOR ACTIVE</span>
              <span>✨</span>
            </div>
            <div class="chat-humor-body">
              <div class="chat-humor-main">
                Smart Chapter &amp; Module Guidance with Interactive Checkpoints!
              </div>
              <div class="chat-humor-sub">
                Aap chahe kisi bhi page par ho, Book Chat automatically aapka <strong>Current Chapter ya Module</strong> detect karta hai. Try the new interactive masterclass or structured summary below!
              </div>
            </div>

            <div class="chat-humor-chips">
              <button type="button" class="chat-humor-chip good" data-fill="Teach me this chapter step-by-step with interactive checkpoints">
                <span>🎓</span>
                <span>"Teach me this chapter"</span>
              </button>
              <button type="button" class="chat-humor-chip good" data-fill="Summarise this chapter with core breakdown and key takeaways">
                <span>📖</span>
                <span>"Summarise this chapter"</span>
              </button>
              <button type="button" class="chat-humor-chip good" data-fill="Explain the core topic of Page ${currentPage} in simple terms with key takeaways">
                <span>🎯</span>
                <span>"Explain topic on Page ${currentPage}"</span>
              </button>
              <button type="button" class="chat-humor-chip good" data-fill="What are the high-yield exam questions from Page ${currentPage}?">
                <span>💡</span>
                <span>"Exam questions on Page ${currentPage}"</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Attach click events on empty state chips to send immediately
      chatLogEl.querySelectorAll('.chat-humor-chip.good').forEach(chip => {
        chip.onclick = () => {
          const fill = chip.getAttribute('data-fill');
          if (fill) {
            if (inputEl) {
              inputEl.value = fill;
            }
            sendUserMessage(fill);
          }
        };
      });

      return;
    }

    let html = chatMessages.map((m, idx) => {
      const isUser = m.role === 'user';
      
      return `
        <div class="teacher-chat-msg" style="display:flex; flex-direction:column; align-self:${isUser ? 'flex-end' : 'flex-start'}; max-width:${isUser ? '85%' : '100%'}; width:auto;" id="msg-card-${idx}">
          <div style="display:flex; align-items:center; justify-content:${isUser ? 'flex-end' : 'flex-start'}; gap:6px; margin-bottom:3px; padding:0 4px;">
            <span style="font-size:11px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em;">
              ${isUser ? 'You' : 'AI Tutor'}
            </span>
            <span style="font-size:10px; color:var(--text-faint);">
              ${m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
            </span>
            ${isUser ? `
              <button class="btn btn-icon btn-teacher-action" data-action="delete-msg" data-idx="${idx}" title="Delete message" style="width:20px; height:20px; border-radius:50%; background:transparent; border:none; color:var(--text-faint); margin-left:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
                ${window.icon('trash','icon icon-xs')}
              </button>
            ` : ''}
          </div>

          <div class="${isUser ? 'chat-msg-user-bubble' : 'chat-msg-ai-bubble selectable-text'}">
            ${isUser ? window.escapeHtml(m.text || '') : window.renderMarkdown(m.text || '')}
          </div>

          <!-- Bottom Message Utility Bar for actual AI replies -->
          ${!isUser && m.text !== '…' ? `
            <div style="display:flex; align-items:center; gap:6px; margin-top:6px; padding:2px 0;">
              <button class="btn btn-teacher-action" data-action="copy" data-idx="${idx}" title="Copy" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('copy','icon icon-xs')} <span>Copy</span>
              </button>
              <button class="btn btn-teacher-action" data-action="save-notes" data-idx="${idx}" title="Save as Note" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('note','icon icon-xs')} <span>Save Note</span>
              </button>
              <button class="btn btn-teacher-action" data-action="make-flashcard" data-idx="${idx}" title="Create Flashcard" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('cards','icon icon-xs')} <span>+ Flashcard</span>
              </button>
              <button class="btn btn-teacher-action" data-action="speak" data-idx="${idx}" title="Listen" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); gap:4px;">
                ${window.icon('volume','icon icon-xs')} <span>Listen</span>
              </button>
              <button class="btn btn-teacher-action" data-action="delete-msg" data-idx="${idx}" title="Delete" style="height:24px; width:24px; padding:0; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); color:var(--text-faint); display:flex; align-items:center; justify-content:center;">
                ${window.icon('trash','icon icon-xs')}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    chatLogEl.innerHTML = html;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
    bindMessageActionButtons();
  }

  function bindMessageActionButtons() {
    document.querySelectorAll('.btn-teacher-action').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = Number(btn.dataset.idx);
        const msg = chatMessages[idx];
        if (!msg) return;

        if (action === 'delete-msg') {
          chatMessages.splice(idx, 1);
          await saveTeacherChatHistory(fileId, chatMessages);
          renderMessages();
          window.toast('Message deleted 🗑️');
        } else if (action === 'speak') {
          // If currently speaking, stop
          if (window._activeTeacherSpeech) {
            try {
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              if (typeof stopElevenAudio === 'function') stopElevenAudio();
            } catch(e) {}
            window._activeTeacherSpeech = null;
            btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Listen</span>`;
            window.toast('Audio stopped ⏹️');
            return;
          }

          // Strip markdown symbols and code blocks for clean TTS speech
          const cleanSpeechText = (msg.text || '')
            .replace(/```mermaid[\s\S]*?```/gi, ' [Flowchart Diagram] ')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/[#*_`~>-]/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();

          if (!cleanSpeechText) {
            window.toast('No spoken text in this message');
            return;
          }

          btn.innerHTML = `<span style="display:inline-block; animation:pulse 1s infinite;">🔊</span> <span>Stop</span>`;
          window._activeTeacherSpeech = btn;

          const resetBtn = () => {
            btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Listen</span>`;
            window._activeTeacherSpeech = null;
          };

          const fallbackWebSpeech = () => {
            if (!('speechSynthesis' in window)) {
              resetBtn();
              window.toast('Speech audio is not supported in this browser.');
              return;
            }
            try {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(cleanSpeechText.slice(0, 2500));
              utterance.rate = 1.0;
              const voices = window.speechSynthesis.getVoices();
              const isHindiOrHinglish = /[\u0900-\u097F]/.test(cleanSpeechText) || /\b(?:hai|aur|kya|ye|yeh|samjhao|batao|kaise)\b/i.test(cleanSpeechText);
              if (isHindiOrHinglish) {
                const hiVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN'));
                if (hiVoice) utterance.voice = hiVoice;
              } else {
                const enVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')));
                if (enVoice) utterance.voice = enVoice;
              }
              utterance.onend = resetBtn;
              utterance.onerror = resetBtn;
              window.speechSynthesis.speak(utterance);
            } catch(e) {
              resetBtn();
            }
          };

          // Try ElevenLabs first if key is configured, otherwise immediate Web Speech
          const hasElevenKey = (typeof localStorage !== 'undefined' && localStorage.getItem('sayad_eleven_labs_key'));
          if (hasElevenKey && typeof speakWithElevenLabs === 'function') {
            try {
              await speakWithElevenLabs(cleanSpeechText.slice(0, 1000), {
                onEnd: resetBtn,
                onError: fallbackWebSpeech
              });
            } catch(e) {
              fallbackWebSpeech();
            }
          } else {
            fallbackWebSpeech();
          }
        } else if (action === 'copy') {
          const ok = await window.copyToClipboard(msg.text);
          window.toast(ok ? 'Copied explanation to clipboard' : 'Could not copy');
        } else if (action === 'save-notes') {
          const curPage = window.State?.currentPage || 1;
          try {
            await window.DB.put('notes', {
              id: window.uid(),
              fileId,
              page: curPage,
              kind: 'AI Tutor Note (' + (activeTeacherMode.toUpperCase()) + ')',
              content: msg.text,
              createdAt: Date.now()
            });
            window.toast('Saved to Notes! 📝');
          } catch (noteErr) {
            console.warn('Could not save note', noteErr);
            window.toast('Could not save note');
          }
        } else if (action === 'make-flashcard') {
          const frontPrompt = `Create ONE clean study flashcard from this educational explanation:\n"${(msg?.text || '').slice(0, 500)}"\n\nReturn strictly valid JSON: {"front": "question", "back": "answer"}`;
          try {
            const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
            const res = await fetchAi(frontPrompt, 'Generate concise educational flashcard JSON only.');
            const match = res.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              await window.DB.put('flashcards', {
                id: window.uid(),
                fileId,
                front: parsed.front || 'Key Concept',
                back: parsed.back || (msg?.text || '').slice(0, 200),
                createdAt: Date.now(),
                due: Date.now(),
                reps: 0
              });
              window.toast('Flashcard created! View in Review tab 🎴');
            } else {
              throw new Error('Flashcard format fallback');
            }
          } catch(e) {
            await window.DB.put('flashcards', {
              id: window.uid(),
              fileId,
              front: `Key Concept on Page ${window.State?.currentPage || 1}`,
              back: (msg?.text || '').slice(0, 250),
              createdAt: Date.now(),
              due: Date.now(),
              reps: 0
            });
            window.toast('Flashcard created! View in Review tab 🎴');
          }
        }
      };
    });

    // Interactive Page Citation Chips click handler
    document.querySelectorAll('.inline-page-jump-chip').forEach(chip => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        const pNum = Number(chip.dataset.page);
        if (pNum && activeFileId && activeFileId !== 'global_chat') {
          window.toast(`Navigating to Page ${pNum}… 📖`);
          if (typeof window.openReader === 'function') {
            await window.openReader(activeFileId, pNum);
          }
        }
      };
    });

    if (typeof window.renderMermaidDiagrams === 'function') {
      setTimeout(() => {
        window.renderMermaidDiagrams(chatLogEl);
      }, 60);
    }

    if (typeof window.renderMathFormulas === 'function') {
      setTimeout(() => {
        window.renderMathFormulas(chatLogEl);
      }, 70);
    } else if (typeof window.renderMathInElement === 'function') {
      setTimeout(() => {
        window.renderMathInElement(chatLogEl, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }, 70);
    }
  }

  renderMessages();

  // Open Customization Sheet (Includes In-Sheet Clear Chat Option)
  const openCustomizationSheet = () => {
    window.Sheet.open(`
      <div style="padding:4px 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div>
            <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text);">AI Tutor Settings</div>
            <div style="font-size:12px; color:var(--text-dim);">Configure teaching persona &amp; study parameters</div>
          </div>
          <button id="close-custom-sheet" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;">
            ${window.icon('x','icon icon-sm')}
          </button>
        </div>

        <!-- AI Inference Engine / Model Selector -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">AI Model Engine</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            <button class="btn custom-engine-opt ${activeAiEngine === 'auto' ? 'active' : ''}" data-engine="auto" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'auto' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'auto' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'auto' ? 'var(--accent)' : 'var(--text)'};">⚡ Auto-Switch (Gemini Flash + OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">High-speed AI reasoning with instantaneous DeepSeek/LLaMA fallback</div>
              </div>
              ${activeAiEngine === 'auto' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>

            <button class="btn custom-engine-opt ${activeAiEngine === 'deepseek' ? 'active' : ''}" data-engine="deepseek" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'deepseek' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'deepseek' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'deepseek' ? 'var(--accent)' : 'var(--text)'};">🧠 DeepSeek V3 (via OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">Exceptional complex reasoning, multi-turn dialogue &amp; math derivation</div>
              </div>
              ${activeAiEngine === 'deepseek' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>

            <button class="btn custom-engine-opt ${activeAiEngine === 'llama' ? 'active' : ''}" data-engine="llama" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'llama' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'llama' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'llama' ? 'var(--accent)' : 'var(--text)'};">🦙 Meta LLaMA 3.3 70B (via OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">Authoritative open-weights model for academic knowledge &amp; textbook Q&amp;A</div>
              </div>
              ${activeAiEngine === 'llama' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>
          </div>
        </div>

        <!-- Teaching Personas -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Teaching Persona</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            ${TEACHER_MODES.map(m => `
              <button class="btn custom-mode-opt ${activeTeacherMode === m.id ? 'active' : ''}" data-mode="${m.id}" style="display:flex; align-items:flex-start; text-align:left; gap:12px; padding:12px; border-radius:12px; background:${activeTeacherMode === m.id ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--border)'}; color:var(--text);">
                <div style="color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text-dim)'}; margin-top:2px;">
                  ${window.icon(m.icon, 'icon icon-md')}
                </div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:700; color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text)'};">${m.label}</div>
                  <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${m.desc}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Evaluator Marks Target -->
        <div id="custom-evaluator-sec" style="display:${activeTeacherMode === 'evaluator' ? 'block' : 'none'}; margin-bottom:16px; background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px;">Target Marks Rubric</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            ${[2, 3, 5].map(pts => `
              <button class="btn custom-mark-opt ${examTargetMarks === pts ? 'active' : ''}" data-marks="${pts}" style="padding:8px; font-size:13px; font-weight:700; border-radius:8px; background:${examTargetMarks === pts ? 'var(--accent)' : 'var(--bg)'}; color:${examTargetMarks === pts ? '#fff' : 'var(--text)'}; border:1px solid ${examTargetMarks === pts ? 'var(--accent)' : 'var(--border)'};">
                ${pts} Marks
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Explanation Style (Academic / Step-by-Step / Comprehensive) -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Explanation Style</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            ${EXPLANATION_STYLES.map(s => `
              <button class="btn custom-style-opt ${activeExplanationStyle === s.id ? 'active' : ''}" data-style="${s.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeExplanationStyle === s.id ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeExplanationStyle === s.id ? 'var(--accent)' : 'var(--border)'};">
                <div style="text-align:left;">
                  <div style="font-size:13px; font-weight:700; color:${activeExplanationStyle === s.id ? 'var(--accent)' : 'var(--text)'};">${s.label}</div>
                  <div style="font-size:11px; color:var(--text-dim);">${s.desc}</div>
                </div>
                ${activeExplanationStyle === s.id ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Chat Session Management (Clear Chat with In-Sheet Confirmation) -->
        <div style="border-top:1px solid var(--border); padding-top:14px;" id="clear-chat-container">
          <button class="btn" id="menu-clear-chat-btn" style="width:100%; padding:10px 14px; border-radius:10px; background:var(--danger-soft, rgba(239, 68, 68, 0.1)); border:1px solid var(--danger, #ef4444); color:var(--danger, #ef4444); font-size:13px; font-weight:700; gap:8px; justify-content:center;">
            ${window.icon('trash','icon icon-sm')}
            <span>Clear Chat History</span>
          </button>
          <div id="clear-chat-confirm-box" style="display:none; margin-top:10px; padding:12px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border); text-align:center;">
            <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px;">Are you sure you want to clear chat history?</div>
            <div style="display:flex; gap:8px; justify-content:center;">
              <button class="btn btn-primary" id="confirm-clear-yes" style="background:var(--danger, #ef4444); border-color:var(--danger, #ef4444); color:#fff; font-size:12px; padding:6px 14px; border-radius:8px;">Yes, Clear All</button>
              <button class="btn" id="confirm-clear-cancel" style="font-size:12px; padding:6px 14px; border-radius:8px;">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('close-custom-sheet').onclick = () => window.Sheet.close();

    const menuClearBtn = document.getElementById('menu-clear-chat-btn');
    const clearConfirmBox = document.getElementById('clear-chat-confirm-box');
    const confirmYesBtn = document.getElementById('confirm-clear-yes');
    const confirmCancelBtn = document.getElementById('confirm-clear-cancel');

    if (menuClearBtn && clearConfirmBox) {
      menuClearBtn.onclick = () => {
        menuClearBtn.style.display = 'none';
        clearConfirmBox.style.display = 'block';
      };
    }

    if (confirmCancelBtn && menuClearBtn && clearConfirmBox) {
      confirmCancelBtn.onclick = () => {
        clearConfirmBox.style.display = 'none';
        menuClearBtn.style.display = 'flex';
      };
    }

    if (confirmYesBtn) {
      confirmYesBtn.onclick = async () => {
        await clearTeacherChatHistory(fileId);
        chatMessages = [];
        await saveTeacherChatHistory(fileId, chatMessages);
        renderMessages();
        window.Sheet.close();
        window.toast('Chat history cleared 🗑️');
      };
    }

    document.querySelectorAll('.custom-mode-opt').forEach(btn => {
      btn.onclick = () => {
        activeTeacherMode = btn.dataset.mode;
        const evalSec = document.getElementById('custom-evaluator-sec');
        if (evalSec) evalSec.style.display = activeTeacherMode === 'evaluator' ? 'block' : 'none';
        
        document.querySelectorAll('.custom-mode-opt').forEach(b => {
          const isAct = b.dataset.mode === activeTeacherMode;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });

        window.toast(`Persona: ${btn.querySelector('div > div').textContent}`);
      };
    });

    document.querySelectorAll('.custom-mark-opt').forEach(btn => {
      btn.onclick = () => {
        examTargetMarks = Number(btn.dataset.marks);
        document.querySelectorAll('.custom-mark-opt').forEach(b => {
          const isAct = Number(b.dataset.marks) === examTargetMarks;
          b.style.background = isAct ? 'var(--accent)' : 'var(--bg)';
          b.style.color = isAct ? '#fff' : 'var(--text)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });
        window.toast(`Rubric set to ${examTargetMarks} Marks`);
      };
    });

    document.querySelectorAll('.custom-style-opt').forEach(btn => {
      btn.onclick = () => {
        activeExplanationStyle = btn.dataset.style;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sayad_explanation_style', activeExplanationStyle);
        }
        document.querySelectorAll('.custom-style-opt').forEach(b => {
          const isAct = b.dataset.style === activeExplanationStyle;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
          const chk = b.querySelector('span:last-child');
          if (chk) chk.style.display = isAct ? 'inline' : 'none';
        });
        window.toast(`Explanation Style: ${btn.querySelector('div > div').textContent}`);
      };
    });

    document.querySelectorAll('.custom-engine-opt').forEach(btn => {
      btn.onclick = () => {
        activeAiEngine = btn.dataset.engine;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sayad_preferred_ai_engine', activeAiEngine);
        }
        document.querySelectorAll('.custom-engine-opt').forEach(b => {
          const isAct = b.dataset.engine === activeAiEngine;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
          const checkSpan = b.querySelector('span');
          if (isAct) {
            if (!checkSpan) {
              const sp = document.createElement('span');
              sp.style.cssText = 'color:var(--accent); font-weight:700;';
              sp.textContent = '✓';
              b.appendChild(sp);
            }
          } else {
            if (checkSpan) checkSpan.remove();
          }
        });
        const name = btn.querySelector('div > div')?.textContent || activeAiEngine;
        window.toast(`Engine: ${name.split('(')[0].trim()}`);
      };
    });
  };

  if (customToggle) customToggle.onclick = openCustomizationSheet;

  // Dynamic Suggestion Chips Updater
  let lastKnownSubject = '';

  const cleanSubjectForChips = (raw) => {
    if (!raw) return '';
    let s = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[?!.,;:"'()[\]{}]/g, ' ')
      .replace(/\b(?:acha|achha|accha|theek\s+hai|thik\s+hai|ok|okay|ab|fir|phir|aur|sun|suno|bhai|yaar|dost|arrey|are|sir|mam|madam|please|kripya|zara|ek\s+baar|thoda|thode|kuch|koi|bhi|toh|to|chalo|well|now|then|so)\b/gi, ' ')
      .replace(/\b(?:mujhe|kripya|please|can\s+you|banao|dikhao|dikaho|dikha|dikho|dikhdo|dikhadena|dikahao|dikhye|dikhaye|dikhana|dekhao|deko|dekho|dekhna|dikhwao|do|dena|show\s+me|show|generate|give\s+me|give|create|fetch|send|bhejo|image\s+of|photo\s+of|picture\s+of|diagram\s+of|map\s+of|portrait\s+of|potrait\s+of|ka|ki|ke|ko|se|me|mein|par|pe|ek|a|an|the|ya|or|chahiye|dekhna|potrait|portrait|portait|portret|tasveer|tasvir|chitra|naksha|photo|photos|foto|fotos|pic|pics|picture|pictures|image|images|imag|imge|img|imgs|imeg|imaj|flowchart|flow\s+chart|diagram|diagrams|draw|drawing|zariye|madhyam|samjhao|samjha|batao|explain|detail\s+me|kyu|kyun|kya|hai|hain|tha|the)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/\b(?:modi|narendra\s+modi)\b/i.test(s)) return 'Narendra Modi';
    if (/\b(?:ramanujan|srinivasa)\b/i.test(s)) return 'Srinivasa Ramanujan';
    if (/\b(?:kalam|abdul\s+kalam)\b/i.test(s)) return 'A. P. J. Abdul Kalam';
    if (/\b(?:aryabhata|aryabhatta)\b/i.test(s)) return 'Aryabhata';
    if (/\b(?:shivaji)\b/i.test(s)) return 'Shivaji Maharaj';
    if (/\b(?:hitler|adolf)\b/i.test(s)) return 'Adolf Hitler';
    if (/\b(?:curie|marie)\b/i.test(s)) return 'Marie Curie';
    if (/\b(?:einstein|albert)\b/i.test(s)) return 'Albert Einstein';
    if (/\b(?:newton|isaac)\b/i.test(s)) return 'Isaac Newton';
    if (/\b(?:darwin|charles)\b/i.test(s)) return 'Charles Darwin';
    if (/\b(?:galileo)\b/i.test(s)) return 'Galileo Galilei';
    if (/\b(?:tesla|nikola)\b/i.test(s)) return 'Nikola Tesla';
    if (/\b(?:gandhi|mahatma)\b/i.test(s)) return 'Mahatma Gandhi';
    if (/\b(?:bose|subhas|subhash)\b/i.test(s)) return 'Subhash Chandra Bose';
    if (/\b(?:nehru|jawaharlal)\b/i.test(s)) return 'Jawaharlal Nehru';
    if (/\b(?:ambedkar)\b/i.test(s)) return 'B. R. Ambedkar';
    if (/\b(?:bhagat\s+singh)\b/i.test(s)) return 'Bhagat Singh';

    const hasPronoun = /\b(?:unka|unke|unki|unko|unhe|inka|inke|inki|inko|inhe|iska|iske|iski|isko|uska|uske|uski|usko|ye|yeh|wo|woh|he|she|they|his|her)\b/i.test(s);
    if (hasPronoun || s.length < 2) return '';
    return s.slice(0, 26);
  };

  function updateDynamicQuickChips(detectedTopic) {
    const bar = document.getElementById('chat-quick-chips-bar');
    if (!bar) return;

    let cleanTopic = cleanSubjectForChips(detectedTopic);

    if (cleanTopic && cleanTopic.length >= 2) {
      lastKnownSubject = cleanTopic;
    } else if (lastKnownSubject) {
      cleanTopic = lastKnownSubject;
    }

    let chips = [];
    if (cleanTopic && cleanTopic.length >= 2) {
      const shortTitle = cleanTopic.slice(0, 20);
      chips = [
        ...(!isGlobal ? [
          { label: '🎓 Teach Me Chapter', query: 'Teach me this chapter step-by-step with interactive checkpoints' },
          { label: '📖 Summarise Chapter', query: 'Summarise this chapter with core breakdown and key takeaways' }
        ] : []),
        { label: `📊 ${shortTitle} Flowchart`, query: `Draw an interactive Mermaid flowchart showing the timeline, key stages, and core components of ${cleanTopic}` },
        { label: `⚡ ${shortTitle} Detail Breakdown`, query: `Detail me samjhao ${cleanTopic} ke core concepts, causes aur deep points` },
        { label: `💡 Simple Analogy`, query: `Is concept (${cleanTopic}) ko everyday real-world analogy se simple terms me samjhao` },
        { label: `🖼️ Visual / Diagram`, query: `${cleanTopic} ka authentic educational visual illustration ya diagram dikhao` },
        { label: `🎯 Exam Points`, query: `Exam ke point of view se ${cleanTopic} par high-yield questions aur scoring keywords batao` }
      ];
    } else {
      chips = [
        ...(!isGlobal ? [
          { label: '🎓 Teach Me Chapter', query: 'Teach me this chapter step-by-step with interactive checkpoints' },
          { label: '📖 Summarise Chapter', query: 'Summarise this chapter with core breakdown and key takeaways' }
        ] : []),
        { label: '⚡ Detail me samjhao', query: '⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath' },
        { label: '📊 Flowchart', query: 'Draw a clear Mermaid flowchart diagram explaining this process step-by-step' },
        { label: '💡 Simple Analogy', query: '💡 Is concept ko simple real-world analogy se samjhao (zero jargon)' },
        { label: '🎯 Exam Points', query: '🎯 Exam ke point of view se important questions, keywords aur scoring points batao' },
        { label: '🖼️ Visual / Diagram', query: '🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao' }
      ];
    }

    bar.innerHTML = chips.map(c => `
      <button class="chat-quick-chip" data-query="${window.escapeHtml(c.query)}" style="white-space:nowrap; flex-shrink:0;">
        <span>${c.label}</span>
      </button>
    `).join('');

    bar.querySelectorAll('.chat-quick-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.dataset.query;
        if (q && inputEl) {
          inputEl.value = q;
          sendUserMessage();
        }
      };
    });
  }

  // Quick Suggestion Chips Initial Click Binding
  document.querySelectorAll('.chat-quick-chip').forEach(chip => {
    chip.onclick = () => {
      const q = chip.dataset.query;
      if (q && inputEl) {
        inputEl.value = q;
        sendUserMessage();
      }
    };
  });

  // Real-time Voice Dictation in Input Box (Hindi-to-Hinglish + English Support with Deduplication and 3.5s Silence Auto-Stop)
  let isDictating = false;
  let dictationRecognition = null;
  let silenceTimer = null;
  let baseInputText = '';
  let accumulatedFinalText = '';

  function stopDictation(notifySilence = false) {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (dictationRecognition) {
      try { dictationRecognition.stop(); } catch(e) {}
      dictationRecognition = null;
    }
    isDictating = false;
    if (inputMicBtn) {
      inputMicBtn.style.color = 'var(--text-dim)';
      inputMicBtn.style.background = 'transparent';
      inputMicBtn.style.boxShadow = 'none';
    }
    if (notifySilence) {
      window.toast('Mic auto-stopped after silence 🎙️');
    }
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (isDictating) {
        stopDictation(true);
      }
    }, 3500); // 3.5 seconds of silence auto-stops the mic
  }

  function toggleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.toast('Speech recognition is not supported in this browser tab.');
      return;
    }

    if (isDictating) {
      stopDictation(false);
      window.toast('Voice dictation stopped');
      return;
    }

    try {
      dictationRecognition = new SpeechRecognition();
      dictationRecognition.continuous = true;
      dictationRecognition.interimResults = true;
      // hi-IN recognizes Indian English & Hindi speech seamlessly
      dictationRecognition.lang = 'hi-IN';

      baseInputText = (inputEl ? inputEl.value : '').trim();
      accumulatedFinalText = '';

      dictationRecognition.onstart = () => {
        isDictating = true;
        if (inputMicBtn) {
          inputMicBtn.style.color = '#fff';
          inputMicBtn.style.background = 'var(--danger, #ef4444)';
          inputMicBtn.style.borderRadius = '50%';
          inputMicBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        }
        window.toast('Listening in Hindi/English... Speak now 🎙️');
        resetSilenceTimer();
      };

      dictationRecognition.onspeechstart = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onspeechend = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onresult = (event) => {
        resetSilenceTimer();

        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += (sessionFinal ? ' ' : '') + txt;
          } else {
            sessionInterim += (sessionInterim ? ' ' : '') + txt;
          }
        }

        const totalSpoken = (sessionFinal + (sessionInterim ? ' ' + sessionInterim : '')).trim();
        // Transliterate Hindi words to clean Hinglish / Roman script
        const transliterated = transliterateDevanagariToHinglish(totalSpoken);
        const cleanSpoken = deduplicateSpokenPhrase(transliterated);

        if (inputEl) {
          const combined = baseInputText ? `${baseInputText} ${cleanSpoken}` : cleanSpoken;
          inputEl.value = combined.trim();
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        }
      };

      dictationRecognition.onerror = (err) => {
        console.warn('Dictation notice:', err);
        stopDictation(false);
        if (err.error === 'not-allowed') {
          window.toast('Microphone permission was denied. Please grant permission.');
        }
      };

      dictationRecognition.onend = () => {
        if (isDictating) {
          stopDictation(false);
        }
      };

      dictationRecognition.start();
    } catch(err) {
      console.error('Dictation start error:', err);
      window.toast('Could not start microphone: ' + err.message);
    }
  }

  if (inputMicBtn) {
    inputMicBtn.onclick = () => toggleDictation();
  }

  async function sendUserMessage(overrideText = null) {
    const userText = (overrideText || inputEl?.value || '').trim();
    if (!userText || sendBtn.disabled) return;

    if (isDictating) {
      stopDictation(false);
    }

    chatMessages.push({
      role: 'user',
      text: userText,
      timestamp: Date.now()
    });
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }
    
    chatMessages.push({
      role: 'assistant',
      text: '…',
      mode: activeTeacherMode,
      timestamp: Date.now()
    });

    renderMessages();
    sendBtn.disabled = true;

    try {
      const ctx = await getTeacherContext({ includeCrossPdf: crossPdfActive, scope: activeContextScope }, userText, chatMessages);
      
      // Update UI with detected or anchor page
      const scopePageNumEl = document.getElementById('scope-page-num');
      const headerPageBadge = document.getElementById('teacher-header-page-badge');
      if (scopePageNumEl && ctx.currentPage) scopePageNumEl.textContent = ctx.currentPage;
      if (headerPageBadge && ctx.currentPage && fileId !== 'global_chat') headerPageBadge.textContent = `PAGE ${ctx.currentPage}`;

      // Dynamically sync chapter scope select and badge if a specific chapter was detected/grounded
      if (ctx.startPage && ctx.endPage && scopeSelect && cachedChapterList && cachedChapterList.length > 0) {
        const foundIdx = cachedChapterList.findIndex(ch => ch.startPage === ctx.startPage);
        if (foundIdx !== -1) {
          scopeSelect.value = `ch_${foundIdx}`;
          if (scopeBadgePill) scopeBadgePill.textContent = `CH ${ctx.detectedChapterNumber || foundIdx + 1}`;
          if (typeof window.enhanceSelect === 'function') {
            window.enhanceSelect(scopeSelect);
          }
        }
      }
      
      let systemPersonaInstruction = '';
      if (activeTeacherMode === 'eli5') {
        systemPersonaInstruction = 'Explain using simple, intuitive everyday analogies with zero unnecessary jargon.';
      } else if (activeTeacherMode === 'mnemonics') {
        systemPersonaInstruction = 'Focus on memory hooks, creative acronyms, and quick recall tricks for easy retention.';
      } else if (activeTeacherMode === 'evaluator') {
        systemPersonaInstruction = `Evaluate according to standard exam marking rubrics (${examTargetMarks} Marks Target), highlighting scoring keywords.`;
      } else {
        systemPersonaInstruction = 'You are an elite AI Super-Intelligence operating with the exact conversational mastery of ChatGPT (GPT-4o) and Claude (Sonnet 3.5). Direct, sharp, natural, and intellectually deep. NEVER greet or give canned introductory phrases. Jump immediately into the core substance.';
      }

      const recentConvo = chatMessages.slice(-6, -1).map(m => `${m.role === 'user' ? 'Student' : 'AI Tutor'}: ${m.text}`).join('\n\n');

      const streamMode = typeof window.getStreamingMode === 'function' ? window.getStreamingMode() : (window.State?.streamingMode || 'sse');
      const aiMsgCard = chatLogEl.querySelector('#msg-card-' + (chatMessages.length - 1)) || chatLogEl.querySelector('.teacher-chat-msg:last-child');
      const aiBubble = aiMsgCard ? aiMsgCard.querySelector('.chat-msg-ai-bubble') : chatLogEl.querySelector('.chat-msg-ai-bubble:last-of-type');
      const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);
      const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');

      let replyText = '';

      const requestPayload = {
        userQuestion: userText,
        docTitle: ctx.docTitle,
        currentPage: ctx.currentPage,
        totalPages: ctx.totalPages,
        chapterText: ctx.chapterText || ctx.pageText,
        fullContext: ctx.chapterText || ctx.pageText || ctx.bookOverviewText,
        persona: systemPersonaInstruction,
        language: 'English/Hinglish (matching the student natural inquiry)',
        chatHistory: chatMessages.slice(-20, -2).filter(m => m.text && m.text !== '…').map(m => ({ role: m.role, text: m.text })),
        customKey: customKey || undefined,
        preferredEngine: activeAiEngine || 'auto',
        explanationStyle: activeExplanationStyle || 'comprehensive',
        detectedChapterNumber: ctx.detectedChapterNumber || '',
        detectedChapterTitle: ctx.detectedChapterTitle || '',
        detectedChapterType: ctx.detectedChapterType || 'Chapter',
        chapterStartPage: ctx.startPage,
        chapterEndPage: ctx.endPage,
        needsClarification: Boolean(ctx.needsClarification)
      };

      // 1. True Real-Time Word-By-Word Streaming Mode (SSE)
      if (streamMode === 'sse' && typeof window.fetchSSEStream === 'function' && aiBubble) {
        let streamer = null;
        if (typeof window.createWordByWordStreamer === 'function') {
          streamer = window.createWordByWordStreamer(aiBubble, { scrollContainer: chatLogEl });
        }
        try {
          replyText = await window.fetchSSEStream(
            '/api/ai/hybrid-tutor',
            requestPayload,
            (chunk, accumulated) => {
              if (streamer) {
                streamer.pushText(chunk);
              } else {
                aiBubble.innerHTML = renderMd(accumulated) + '<span class="ai-typing-cursor" style="display:inline-block; color:var(--accent); font-weight:800; margin-left:2px; animation:blink 0.8s infinite;">▌</span>';
                chatLogEl.scrollTop = chatLogEl.scrollHeight;
              }
            }
          );
          if (streamer) {
            await streamer.finish(replyText);
          }
        } catch (streamErr) {
          console.warn('Teacher AI SSE stream error, falling back to unary fetch:', streamErr);
          if (streamer) streamer.cancel();
          replyText = '';
        }
      }

      // 2. Unary Fallback or Non-Streaming Fetch (for Typewriter / Instant mode)
      if (!replyText) {
        try {
          const resp = await fetch('/api/ai/hybrid-tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data && data.text) {
              replyText = data.text;
            }
          }
        } catch (hybridErr) {
          console.warn('Hybrid tutor endpoint fallback:', hybridErr);
        }
      }

      if (!replyText) {
        try {
          const fullPrompt = `You are S.A.Y.A.D. AI — an unrestricted, world-class Academic AI Tutor and Universal Super-Intelligence.

${systemPersonaInstruction}

DIRECTIVES & QUESTION-SOLVING PROTOCOL:
1. **IN-TEXT & EXERCISE QUESTIONS**:
   - Always extract the REAL, EXACT question statement from the reference document passages labeled \`🎯 PRIMARY INTEXT QUESTIONS\` or \`EXACT QUESTIONS\`.
   - ❌ NEVER invent or hallucinate fake questions.
   - If the PDF has no answer key: Solve the question completely and step-by-step from the lesson theory and your academic knowledge.
   - If the PDF has an answer key: State the question, explain the full derivation/solution, and incorporate the textbook key points.
2. **CHAPTER & LESSON QUERIES (e.g. "Chapter 8 kya hai", "Lesson 4")**:
   - Provide a complete, structured breakdown (Theme, Concepts, Timeline, Exam Questions).
   - ❌ NEVER say "not in this book" or "currently on page 1".
3. **UNIVERSAL ACADEMIC COVERAGE**:
   - Answer any query across all subjects with authoritative clarity.

STUDENT QUESTION: "${userText}"
${recentConvo ? `\nPREVIOUS CHAT:\n${recentConvo}\n` : ''}
${ctx.chapterText || ctx.pageText ? `\nREFERENCE DOCUMENT PASSAGES:\n${ctx.chapterText || ctx.pageText}\n` : ''}

Provide the complete academic answer now:`;

          const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
          if (typeof fetchAi === 'function') {
            replyText = await fetchAi(fullPrompt, systemPersonaInstruction, 'gemini-3.1-flash-lite');
          }
        } catch (fetchErr) {
          console.warn('Direct AI fallback warning:', fetchErr);
        }
      }

      if (!replyText) {
        replyText = `Mujhe aapki request process karne me thodi problem aayi. Kripya apna sawaal dobara poochhein ya question yahan paste karein, main turant madad karunga!`;
      }

      // Finish response delivery based on selected streaming mode:
      if (streamMode === 'sse') {
        // Option 1: Word-by-Word Live Natural Flow
        // If replyText came from unary fallback (stream didn't run), type word-by-word now:
        if (aiBubble && aiBubble.innerHTML.trim() === '…') {
          if (typeof window.streamWordByWord === 'function') {
            await window.streamWordByWord(aiBubble, replyText, null, chatLogEl);
          } else {
            aiBubble.innerHTML = renderMd(replyText);
          }
        } else if (aiBubble) {
          aiBubble.innerHTML = renderMd(replyText);
        }
        if (aiBubble && typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
        if (aiBubble && typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
      } else if (streamMode === 'typewriter' && aiBubble && replyText.length >= 30) {
        // Option 2: Smooth Morphic Wave (Structured Card & Section Reveal)
        if (typeof window.streamMorphicWave === 'function') {
          await window.streamMorphicWave(aiBubble, replyText, () => {
            if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
            if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
          }, chatLogEl);
        } else {
          aiBubble.innerHTML = renderMd(replyText);
          if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
          if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
        }
      } else {
        // Option 3: Turbo Instant Jump
        if (aiBubble) {
          aiBubble.innerHTML = renderMd(replyText);
          if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
          if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
        }
      }

      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: replyText,
        mode: activeTeacherMode,
        timestamp: Date.now()
      };
      await saveTeacherChatHistory(fileId, chatMessages);
      renderMessages();
    } catch(err) {
      console.error('Teacher AI Error:', err);
      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: `Kripya apna question dobara type karein ya poochhein, main madad ke liye taiyar hoon!`,
        mode: activeTeacherMode,
        timestamp: Date.now()
      };
      renderMessages();
    }

    sendBtn.disabled = false;

    // Dynamically refresh quick chips with contextually relevant follow-up suggestions
    try {
      const candidateTopic = cleanSubjectForChips(userText) || lastKnownSubject;
      if (candidateTopic) updateDynamicQuickChips(candidateTopic);
    } catch(e) {}
  }

  // Bind Send & Input events
  if (sendBtn) sendBtn.onclick = () => sendUserMessage();
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
      }
    };
    inputEl.oninput = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    };
  }

  // Back button returns to reader or dashboard
  if (backBtn) {
    backBtn.onclick = () => {
      stopElevenAudio();
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e) {}
      window._activeTeacherSpeech = null;
      if (isVoiceListening) stopVoiceRecognition();
      if (isDictating && dictationRecognition) {
        try { dictationRecognition.stop(); } catch(e) {}
      }
      if (window.State?.currentDoc && window.State?.currentFile?.id === fileId) {
        window.State.view = 'reader';
        window.renderReaderShell();
        window.mountReaderContent();
      } else {
        window.State.view = 'dashboard';
        window.renderDashboard();
      }
    };
  }

  // --- Chapter Scope Selector & Auto-Sync Setup ---
  const scopeSelect = document.getElementById('teacher-chapter-select');
  const scopeBadgePill = document.getElementById('teacher-scope-badge-pill');
  let cachedChapterList = [];

  function updateQuickPromptChips() {
    const chipsBar = document.getElementById('chat-quick-chips-bar');
    if (!chipsBar || isGlobal) return;

    let targetTitle = 'Chapter';
    if (activeContextScope === 'chapter' && currentSessionChapter) {
      targetTitle = currentSessionChapter.chapterTitle || `Ch ${currentSessionChapter.chapterNumber}`;
      if (targetTitle.length > 20) targetTitle = targetTitle.slice(0, 18) + '…';
    } else if (activeContextScope === 'page') {
      targetTitle = `Page ${currentPage}`;
    } else if (activeContextScope === 'book') {
      targetTitle = 'Book';
    }

    chipsBar.innerHTML = `
      <button class="chat-quick-chip" data-query="Teach me ${window.escapeHtml(targetTitle)} step-by-step with interactive checkpoints">
        <span>🎓 Teach Me ${window.escapeHtml(targetTitle)}</span>
      </button>
      <button class="chat-quick-chip" data-query="Summarise ${window.escapeHtml(targetTitle)} with core breakdown and key takeaways">
        <span>📖 Summarise ${window.escapeHtml(targetTitle)}</span>
      </button>
      <button class="chat-quick-chip" data-query="⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath">
        <span>⚡ Detail me samjhao</span>
      </button>
      <button class="chat-quick-chip" data-query="Exam ke point of view se ${window.escapeHtml(targetTitle)} ke important questions, keywords aur scoring points batao">
        <span>🎯 Exam Points</span>
      </button>
      <button class="chat-quick-chip" data-query="Draw a clear Mermaid flowchart diagram explaining this process step-by-step">
        <span>📊 Flowchart</span>
      </button>
      <button class="chat-quick-chip" data-query="💡 Is concept ko simple real-world analogy se samjhao (zero jargon)">
        <span>💡 Simple Analogy</span>
      </button>
      <button class="chat-quick-chip" data-query="🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao">
        <span>🖼️ Visual / Diagram</span>
      </button>
    `;

    chipsBar.querySelectorAll('.chat-quick-chip').forEach(btn => {
      btn.onclick = () => {
        const q = btn.getAttribute('data-query');
        if (inputEl && q) {
          inputEl.value = q;
          inputEl.focus();
          sendUserMessage(q);
        }
      };
    });
  }

  async function setupChapterScope() {
    if (isGlobal || !scopeSelect) return;
    const doc = window.State?.currentDoc;
    if (doc && typeof window.getChapterList === 'function') {
      try {
        cachedChapterList = await window.getChapterList(doc, fileId);
      } catch (err) {
        console.warn('Could not load chapter list for chat:', err);
      }
    }

    // Auto-detect current reading chapter if not manually chosen yet
    if (cachedChapterList.length > 0 && !currentSessionChapter) {
      const match = cachedChapterList.find(ch => currentPage >= ch.startPage && currentPage <= ch.endPage);
      if (match) {
        let cleanTitle = match.subtitle || match.title || match.rawTitle || '';
        cleanTitle = cleanTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
        cleanTitle = cleanTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
        cleanTitle = cleanTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');

        const numMatch = (match.rawTitle || '').match(/\d+/) || (match.title || '').match(/(?:ch|chapter|module|lesson|unit)\s*[-–:.]?\s*(\d+)/i) || (match.title || '').match(/\d+/);

        currentSessionChapter = {
          fileId,
          chapterNumber: numMatch ? numMatch[0] : (match.chapterNumber || ''),
          chapterTitle: cleanTitle || match.rawTitle || match.title,
          startPage: match.startPage,
          endPage: match.endPage,
          label: match.label
        };
        activeContextScope = 'chapter';
      }
    }

    // Build options list
    let optionsHtml = '';
    optionsHtml += `<option value="__page__" ${activeContextScope === 'page' ? 'selected' : ''}>📄 Current Page Focus (Page ${currentPage})</option>`;
    optionsHtml += `<option value="__book__" ${activeContextScope === 'book' ? 'selected' : ''}>📚 Full Book Overview (Pages 1–${totalPages})</option>`;

    if (cachedChapterList.length > 0) {
      cachedChapterList.forEach((ch, idx) => {
        const isSelected = activeContextScope === 'chapter' && currentSessionChapter && (
          (currentSessionChapter.startPage === ch.startPage && currentSessionChapter.endPage === ch.endPage) ||
          (currentSessionChapter.chapterTitle === ch.rawTitle || currentSessionChapter.chapterTitle === ch.title)
        );
        optionsHtml += `<option value="ch_${idx}" ${isSelected ? 'selected' : ''}>${window.escapeHtml(ch.label)}</option>`;
      });
    }

    scopeSelect.innerHTML = optionsHtml;

    if (scopeBadgePill) {
      if (activeContextScope === 'chapter' && currentSessionChapter) {
        scopeBadgePill.textContent = `CH ${currentSessionChapter.chapterNumber || ''}`.trim() || 'CHAPTER';
      } else if (activeContextScope === 'page') {
        scopeBadgePill.textContent = `PAGE ${currentPage}`;
      } else {
        scopeBadgePill.textContent = 'ALL BOOK';
      }
    }

    // Enhance with our bespoke custom dropdown
    if (typeof window.enhanceSelect === 'function') {
      window.enhanceSelect(scopeSelect);
    }

    updateQuickPromptChips();

    // Bind change listener
    scopeSelect.onchange = () => {
      const val = scopeSelect.value;
      if (val === '__page__') {
        activeContextScope = 'page';
        if (scopeBadgePill) scopeBadgePill.textContent = 'PAGE';
        window.toast(`Chat focus: Page ${currentPage}`);
      } else if (val === '__book__') {
        activeContextScope = 'book';
        if (scopeBadgePill) scopeBadgePill.textContent = 'ALL BOOK';
        window.toast('Chat focus: Entire Document');
      } else if (val.startsWith('ch_')) {
        const idx = parseInt(val.replace('ch_', ''), 10);
        const ch = cachedChapterList[idx];
        if (ch) {
          activeContextScope = 'chapter';
          let cleanTitle = ch.subtitle || ch.title || ch.rawTitle || '';
          cleanTitle = cleanTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
          cleanTitle = cleanTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
          cleanTitle = cleanTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');

          const numMatch = (ch.rawTitle || '').match(/\d+/) || (ch.title || '').match(/(?:ch|chapter|module|lesson|unit)\s*[-–:.]?\s*(\d+)/i) || (ch.title || '').match(/\d+/);

          currentSessionChapter = {
            fileId,
            chapterNumber: numMatch ? numMatch[0] : String(idx + 1),
            chapterTitle: cleanTitle || ch.rawTitle || ch.title,
            startPage: ch.startPage,
            endPage: ch.endPage,
            label: ch.label
          };
          if (scopeBadgePill) scopeBadgePill.textContent = `CH ${currentSessionChapter.chapterNumber || idx + 1}`;
          window.toast(`Chat focus: ${currentSessionChapter.chapterTitle || 'Chapter'}`);
        }
      }
      updateQuickPromptChips();
    };
  }

  setupChapterScope();

  // If there was a prefilled query, trigger it
  if (prefillQuery && prefillQuery.trim()) {
    if (inputEl) inputEl.value = prefillQuery.trim();
    sendUserMessage(prefillQuery.trim());
  }
}

export function startVoiceRecognition(onFinalTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.toast('Speech recognition is not supported in this browser tab.');
    return;
  }

  try {
    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.continuous = false;
    speechRecognitionInstance.interimResults = true;
    speechRecognitionInstance.lang = navigator.language || 'en-US';

    const waveformEl = document.getElementById('teacher-voice-waveform');
    const voiceStatusEl = document.getElementById('teacher-voice-status');
    const voiceBtn = document.getElementById('teacher-voice-toggle');

    if (waveformEl) waveformEl.style.display = 'flex';
    if (voiceBtn) {
      voiceBtn.style.background = 'var(--danger, #ef4444)';
      voiceBtn.style.color = '#fff';
    }
    isVoiceListening = true;

    speechRecognitionInstance.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      if (voiceStatusEl) voiceStatusEl.textContent = `🎙️ "${transcript}"`;
      if (event.results[0].isFinal) {
        stopVoiceRecognition();
        if (onFinalTranscript && transcript.trim()) {
          onFinalTranscript(transcript.trim());
        }
      }
    };

    speechRecognitionInstance.onerror = (err) => {
      console.warn('Speech error', err);
      stopVoiceRecognition();
      if (err.error === 'not-allowed') {
        window.toast('Microphone permission required for voice study.');
      } else {
        window.toast('Voice recognition ended');
      }
    };

    speechRecognitionInstance.onend = () => {
      stopVoiceRecognition();
    };

    speechRecognitionInstance.start();
    window.toast('Listening... Speak your question 🎙️');
  } catch(e) {
    console.error('Speech init error', e);
    stopVoiceRecognition();
    window.toast('Could not start voice recognition: ' + e.message);
  }
}

export function stopVoiceRecognition() {
  isVoiceListening = false;
  if (speechRecognitionInstance) {
    try { speechRecognitionInstance.stop(); } catch(e) {}
    speechRecognitionInstance = null;
  }
  const waveformEl = document.getElementById('teacher-voice-waveform');
  const voiceBtn = document.getElementById('teacher-voice-toggle');
  if (waveformEl) waveformEl.style.display = 'none';
  if (voiceBtn) {
    voiceBtn.style.background = 'var(--surface-2)';
    voiceBtn.style.color = 'var(--text)';
  }
}

// Global binds
window.openTeacherView = openTeacherView;
window.getTeacherContext = getTeacherContext;
window.loadTeacherChatHistory = loadTeacherChatHistory;
window.saveTeacherChatHistory = saveTeacherChatHistory;
window.clearTeacherChatHistory = clearTeacherChatHistory;
