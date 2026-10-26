// @ts-nocheck
/* ======================================================================
   Legacy Hindi font text -> Unicode.

   Many Hindi PDFs were typeset with old non-Unicode fonts (Kruti Dev 010 is the common one).
   They look right on screen, but the text inside is Latin gibberish such as
   "dgrs gSa] ioZr 'kksHkk&fudksru" instead of "कहते हैं, पर्वत शोभा-निकेतन".
   That gibberish is what Copy, Speak, Translate and every AI tool received.

   This module is pure (no DOM, no state) and conservative:
   - text that already has Devanagari, or does not look like legacy Hindi, is returned unchanged;
   - only the *string* is converted. The page, the text layer, highlight rectangles and
     stored positions are never touched.
   ====================================================================== */

/* ------------------------------ mapping table ------------------------------ */
// Longest match wins, so multi-character glyphs are listed freely.
const MAP = {
  // vowels
  'vkS': 'औ', 'vks': 'ओ', 'vk': 'आ', 'v‚': 'ऑ', 'v': 'अ', 'o': 'व',
  'b±': 'ईं', 'bZ': 'ई', 'Ã': 'ई', 'b': 'इ', 'm': 'उ', 'Å': 'ऊ', ',s': 'ऐ', ',': 'ए', '_': 'ऋ',
  // full consonants
  'd': 'क', '[k': 'ख', 'x': 'ग', '?k': 'घ', '³': 'ङ',
  'p': 'च', 'N': 'छ', 't': 'ज', '>': 'झ', '¥': 'ञ',
  'V': 'ट', 'B': 'ठ', 'M': 'ड', '<': 'ढ', '.k': 'ण',
  'r': 'त', 'Fk': 'थ', 'n': 'द', '/k': 'ध', 'u': 'न',
  'i': 'प', 'Q': 'फ', 'c': 'ब', 'Hk': 'भ', 'e': 'म',
  ';': 'य', 'j': 'र', 'y': 'ल', 'O': 'ळ', "'k": 'श', '"k': 'ष', 'l': 'स', 'g': 'ह',
  // half forms
  'D': 'क्', '[': 'ख्', 'X': 'ग्', '?': 'घ्', 'P': 'च्', 'T': 'ज्', '÷': 'झ्',
  '.': 'ण्', 'R': 'त्', 'F': 'थ्', '/': 'ध्', 'U': 'न्', 'I': 'प्', '¶': 'फ्', 'C': 'ब्',
  'H': 'भ्', 'E': 'म्', '¸': 'य्', 'Y': 'ल्', "'": 'श्', '"': 'ष्', 'L': 'स्',
  // conjunct glyphs
  '{k': 'क्ष', '{': 'क्ष्', '=': 'त्र', '«': 'त्र्', 'K': 'ज्ञ', 'J': 'श्र',
  'Ø': 'क्र', 'Ý': 'फ्र', 'ç': 'प्र', 'Á': 'प्र', 'æ': 'द्र', 'í': 'द्द', 'ä': 'क्त', 'é': 'न्न', 'Ù': 'त्त्', 'Ùk': 'त्त',
  '|': 'द्य', '}': 'द्व', 'à': 'ह्न', 'á': 'ह्य', 'â': 'हृ', 'ã': 'ह्म', 'º': 'ह्', '#': 'रु', '–': 'दृ', '—': 'कृ',
  // nukta forms
  'd+': 'क़', '[k+': 'ख़', 'x+': 'ग़', 't+': 'ज़', 'M+': 'ड़', '<+': 'ढ़', 'Q+': 'फ़', 'u+': 'ऩ', 'j+': 'ऱ',
  // matras and signs
  'k': 'ा', 'h': 'ी', 'q': 'ु', 'w': 'ू', '`': 'ृ', 's': 'े', 'S': 'ै', 'ks': 'ो', 'kS': 'ौ',
  'a': 'ं', '¡': 'ँ', '%': 'ः', '~': '्', 'z': '्र', 'ª': '्र', 'Z': 'र्', 'f': 'ि',
  // punctuation used by the font
  'A': '।', '&': '-', ']': ',', '\\': '?', '@': '/', '¼': '(', '½': ')', '‘': '‘', '’': '’',
  'å': '०', 'ƒ': '१', '„': '२', '…': '३', '†': '४', '‡': '५', 'ˆ': '६', '‰': '७', 'Š': '८', '‹': '९',
};
const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
const MAXLEN = KEYS[0].length;

const MATRAS = 'ािीुूृेैोौंँः';
const isCons = (ch) => ch >= 'क' && ch <= 'ह' || ch === 'ळ' || ch === 'क़' || ch === 'ख़' || ch === 'ग़' || ch === 'ज़' || ch === 'ड़' || ch === 'ढ़' || ch === 'फ़';

/* --------------------------- word-level conversion --------------------------- */
function mapWord(w) {
  let out = '';
  let i = 0;
  while (i < w.length) {
    let hit = null;
    for (let len = Math.min(MAXLEN, w.length - i); len >= 1; len--) {
      const k = w.substr(i, len);
      if (Object.prototype.hasOwnProperty.call(MAP, k)) {
        // '.' is only the half letter ण् inside a word; a '.' before a non-letter is a full stop.
        if (k === '.' && !(i < w.length - 1 && !/[\d.,)]/.test(w[i + 1]))) { hit = null; break; }
        // ':' inside a word is the ligature रू; elsewhere it stays a colon.
        hit = k; break;
      }
    }
    if (hit === null) {
      if (w[i] === ':' && i < w.length - 1) out += 'रू'; else out += w[i];
      i += 1;
    } else { out += MAP[hit]; i += hit.length; }
  }
  return out;
}

// chhoti-i is typed before the consonant but belongs after the whole cluster.
function moveChhotiI(s) {
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== 'ि') continue;
    let j = i + 1;
    if (j >= chars.length || !isCons(chars[j])) continue;
    while (j + 2 < chars.length && chars[j + 1] === '्' && isCons(chars[j + 2])) j += 2;
    if (j + 1 < chars.length && chars[j + 1] === '्' && j + 2 === chars.length) j += 1;   // trailing halant stays with the cluster
    chars.splice(i, 1);
    chars.splice(j, 0, 'ि');          // the cluster shifted left by one after the removal
    i = j;                            // do not look at the moved matra again
  }
  return chars.join('');
}

// 'Z' (reph) is typed after the syllable it sits on; in Unicode it comes first.
const REPH = '\uE000';
function moveReph(s) {
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== REPH) continue;
    let j = i - 1;
    while (j >= 0 && MATRAS.includes(chars[j])) j--;
    if (j < 0 || !isCons(chars[j])) { chars[i] = 'र्'; continue; }
    while (j >= 2 && chars[j - 1] === '्' && isCons(chars[j - 2])) j -= 2;
    chars.splice(i, 1);
    chars.splice(j, 0, 'र्');
  }
  return chars.join('');
}

export function convertLegacyWord(w) {
  // 'bZ' is the vowel ई, not इ followed by a reph
  const marked = w.replace(/bZ/g, 'b\uE001').replace(/Z/g, REPH).replace(/b\uE001/g, 'bZ');
  return moveReph(moveChhotiI(mapWord(marked)));
}

/* ------------------------------- detection ------------------------------- */
// Very common Kruti Dev words. English text almost never contains these.
const LEXICON = new Set([
  'dk', 'ds', 'dh', 'gS', 'gSa', 'esa', 'ls', 'dks', 'Hkh', 'ugha', 'vkSj', 'ij', 'lc', 'dqN', 'tks', 'Fkk', 'Fks', 'Fkh', 'gksrk', 'gksrs', 'gksrh',
  'gks', 'gqvk', 'gqbZ', 'fd', 'D;k', 'ftl', 'bl', 'mlds', 'muds', 'mldh', 'viuk', 'viuh', 'vius', 'rFkk', ';k', 'og', 'os', 'ge', 'rqe', 'vki',
  ';g', ';s', 'dj', 'djrk', 'djrs', 'djus', 'dgk', 'dgrs', 'ckn', 'lkFk', 'lkeus', 'gh', 'tc', 'rc', 'dgka', 'ogka', ';gka', 'dksbZ', 'lHkh', 'cgqr',
  'vFkZ', "iz'u", 'mRrj', 'fgUnh', 'dfork', 'dgkuh', 'ikB', 'ys[kd', 'Nk=', 'd{kk', "f'k{kd", 'fy;k', 'gq,', 'fy,', 'nhft,',
]);
const LEGACY_SYM = /[¼½¡ªØÝçÁæíäéÙàáâãº«³¥÷¶¸ƒ„…†‡ˆ‰Š‹±‚Ã]/;
const LOOKS_LIKE_CODE = /https?:\/\/|=>|\(\)|\bfunction\b|\bconst\b|\breturn\b|[{}]\s*[;)]|<\/?[a-z]+>/;

function wordEvidence(w) {
  const core = w.replace(/^[(\[“"'‘]+|[)\].,;:!?”"'’]+$/g, '');
  if (!core) return 0;
  if (LEXICON.has(core) || LEXICON.has(w)) return 2;
  if (LEGACY_SYM.test(w)) return 1;
  if (/&[A-Za-z]/.test(w) || /[a-z]\]$/.test(w)) return 1;
  return 0;
}

const ENGLISH_COMMON = new Set(('the of and to in is it that was for on are as with his they at be this from have or by one had not but what all were when we there can an your which their said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know get through back much before go good new write our me man too any day same right look think also around another came come work three word must because does part even place well such here take why help put different away again off went old number great tell men say small every found still between name should home big give air line set own under read last never us left end along while might next sound below saw something thought both few those always looked show large often together asked house don\'t world going want school important until form food keep children feet land side without boy once animals life enough took sometimes four head above kind began almost live page got earth need far hand high year mother light country father let night picture being study second soon story since white ever paper hard near sentence better best across during today however sure knew try told young sun thing whole hear example heard several change answer room sea against top turned learn point city play toward five using himself usually').split(/\s+/));

/** How much of this text is legacy-encoded Hindi (0 to 1). */
export function legacyScore(text) {
  if (!text || /[ऀ-ॿ]/.test(text)) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return 0;
  let strong = 0, sym = 0;
  for (const w of words) { const e = wordEvidence(w); if (e === 2) strong++; else if (e === 1) sym++; }
  if (strong < 2 && !(strong >= 1 && sym >= 1)) return 0;
  return (strong * 1.5 + sym) / words.length;
}

export function looksLegacyHindi(text) { return legacyScore(text) >= 0.12; }

function looksEnglishWord(w) {
  const core = w.replace(/[^A-Za-z']/g, '');
  if (!core) return true;                                   // digits and punctuation
  if (ENGLISH_COMMON.has(core.toLowerCase())) return true;
  if (/^[A-Z]{2,}$/.test(core)) return true;                // acronyms
  if (core.length >= 4 && /^[a-z]+$/.test(core) && /(oo|ee|ght|ough|wh[aeio])/.test(core)) return true;
  if (/^(pH|mL|cm|mm|km|kg|mg|Hz|kHz|MHz|CO2|H2O)$/.test(core)) return true;
  if (/(tion|sion|ing|ment|ness|ity|ous|ive|able|ally|ed|ly|er|est|ies)$/.test(core.toLowerCase()) && core.length > 5 && !/[A-Z]/.test(core.slice(1))) return true;
  return false;
}

// A capitalised, vowel-rich word such as "Figure" is English; legacy capitals like "Hkkjr" or "Nk=" are not.
function englishShape(w) {
  const core = w.replace(/[^A-Za-z]/g, '');
  if (core.length < 5 || !/^[A-Z][a-z]+$/.test(core)) return false;
  const vowels = (core.match(/[aeiou]/gi) || []).length;
  return vowels / core.length >= 0.3 && !LEGACY_SYM.test(w);
}

/** Joins text-layer item strings, fixing each item on its own so an English item next to Hindi is kept. */
export function fixLegacyItems(strs, sep = ' ') {
  const list = (strs || []).map((x) => String(x == null ? '' : x));
  const joined = list.join(sep);
  const pageLegacy = pageIsLegacyHindi(joined);
  if (!pageLegacy && !looksLegacyHindi(joined)) return joined;
  return list.map((x) => fixLegacyHindi(x, { pageLegacy })).join(sep);
}

/**
 * True when a whole page's text is legacy Hindi (used as a hint for short selections).
 */
export function pageIsLegacyHindi(pageText) { return looksLegacyHindi(String(pageText || '').slice(0, 4000)); }

/**
 * Converts legacy-font Hindi found in `text` to Unicode.
 * - Text without legacy evidence is returned untouched (English, Unicode Hindi, numbers).
 * - Evidence is local: a word is converted only when it sits near words that are clearly legacy Hindi,
 *   so an English sentence on the same page is left alone.
 * - `opts.pageLegacy` (the page is known to be legacy Hindi) lets one or two selected words convert too.
 */
export function fixLegacyHindi(text, opts = {}) {
  if (typeof text !== 'string' || text.length < 2) return text;
  if (text.includes('\n')) return text.split('\n').map((ln) => fixLegacyHindi(ln, opts)).join('\n');
  if (/[\u0900-\u097F]/.test(text) && !/[A-Za-z]{4,}/.test(text)) return text;
  if (LOOKS_LIKE_CODE.test(text)) return text;
  const toks = text.split(/(\s+)/);
  const words = [];                                   // indexes of real tokens
  toks.forEach((t, i) => { if (t && !/^\s+$/.test(t)) words.push(i); });
  if (!words.length) return text;
  const ev = words.map((i) => wordEvidence(toks[i]));
  const anyEvidence = ev.some((e) => e > 0);
  const short = words.length <= 3;
  if (!anyEvidence && !(opts.pageLegacy && short)) return text;
  const RADIUS = 6;
  const mark = new Array(words.length).fill(false);
  if (opts.pageLegacy && short) mark.fill(true);
  // a legacy sentence ends with the danda glyph 'A' (or the real danda); English follows after it
  const isEnd = words.map((i) => /(^|[a-z\]])A$/.test(toks[i]) || /।$/.test(toks[i]));
  for (let k = 0; k < words.length; k++) {
    if (ev[k] === 0) continue;
    let lo = k, hi = k;
    while (lo > 0 && k - lo < RADIUS && !isEnd[lo - 1]) lo--;
    while (hi < words.length - 1 && hi - k < RADIUS && !isEnd[hi]) hi++;
    let strong = 0, weak = 0;
    for (let j = lo; j <= hi; j++) { if (ev[j] === 2) strong++; else if (ev[j] === 1) weak++; }
    if (strong >= 2 || (strong >= 1 && weak >= 1) || (ev[k] === 2 && words.length <= 3)) {
      for (let j = lo; j <= hi; j++) mark[j] = true;
    }
  }
  return toks.map((t, i) => {
    const k = words.indexOf(i);
    if (k < 0 || !mark[k]) return t;
    if (/^[\d.,:;()%\-–—/]+$/.test(t)) return t;       // numbers and bare punctuation
    if (ev[k] === 0 && (looksEnglishWord(t) || (short && englishShape(t)))) return t;
    return convertLegacyWord(t);
  }).join('');
}

if (typeof window !== 'undefined') { window.fixLegacyHindi = fixLegacyHindi; window.pageIsLegacyHindi = pageIsLegacyHindi; window.fixLegacyItems = fixLegacyItems; }
