/* Page facts the teacher must not skip: every formula / equation and every date of the page.
 *
 * The AI teacher is asked to write them on the board, but models drop things. This module finds the formulas and
 * dates in the page text itself (no AI, no network) and, for a lesson step, returns board cues for the ones the
 * step forgot, so a student never finds a formula in the book that the "teacher" did not write.
 */

const YEAR_RE = /\b(1[0-9]{3}|20[0-3][0-9])\b(?:\s*(?:AD|CE|BC|BCE))?/g;
const BC_RE = /\b(\d{1,4})\s*(BC|BCE)\b/gi;
const EQ_OP = /(?:=|≈|→|->|⟶|⇌|<->|=>)/;
const EQ_ONLY = /^(?:=|≈|→|->|⟶|⇌|<->|=>)$/;
const PLAIN_OP = /^(?:\+|[-−–]|×|\*|\/|÷)$/;

const norm = (s) => String(s || '').toLowerCase().replace(/[\s·*]/g, '').replace(/→|->|⟶/g, '=>');

const OPERAND_CHARS = /^[(\[{]*[-−]?[0-9A-Za-zΔΣΩαβγθλμπρσφω½¼¾√∝°′″^_/*.+\-−×÷²³⁰¹⁴-⁹₀-₉()\[\]{}=≈→⟶⇌<>]+$/;
const stripTail = (t) => t.replace(/[,.;:]+$/, '');
const isProse = (t) => /^[A-Za-z]{3,}$/.test(t) && !/^[A-Z]{2,5}$/.test(t);
const operandOK = (raw) => {
  const t = stripTail(String(raw || ''));
  return !!t && OPERAND_CHARS.test(t) && !isProse(t) && !/^[.,;:()]+$/.test(t);
};

/** Finds "operand op operand ... = ... operand" runs in a sentence, e.g. F = ma, v = u + at, 6CO2 + 6H2O -> C6H12O6 + 6O2. */
function formulasIn(text) {
  const tok = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  const used = new Array(tok.length).fill(false);
  for (let i = 0; i < tok.length; i++) {
    const t = stripTail(tok[i]);
    const spaced = EQ_ONLY.test(t);
    const glued = !spaced && EQ_OP.test(t) && operandOK(tok[i]);
    if (!spaced && !glued) continue;
    if (used[i]) continue;
    let l = i, r = i;
    if (spaced) {
      if (i === 0 || i === tok.length - 1 || !operandOK(tok[i - 1]) || !operandOK(tok[i + 1])) continue;
      l = i - 1; r = i + 1;
    }
    // extend left:  operand (op operand)*
    while (l - 2 >= 0 && (PLAIN_OP.test(tok[l - 1]) || EQ_ONLY.test(tok[l - 1])) && operandOK(tok[l - 2]) && !used[l - 2]) l -= 2;
    // a leading "+"/"-" glued to the first operand is not part of a formula start
    while (r + 2 < tok.length && (PLAIN_OP.test(tok[r + 1]) || EQ_ONLY.test(tok[r + 1])) && operandOK(tok[r + 2])) r += 2;
    if (glued && l === i && r === i) { /* e.g. F=ma on its own */ }
    for (let k = l; k <= r; k++) used[k] = true;
    const f = stripTail(tok.slice(l, r + 1).join(' ')).replace(/^[(\[{]+(?=[A-Za-z0-9])/, (m) => (/[)\]}]/.test(tok.slice(l, r + 1).join(' ')) ? m : ''));
    if (f.length >= 3 && f.length <= 90) out.push(f);
  }
  return out;
}

const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The clause around a date, without the date itself ("Revolt of 1857 began at Meerut" -> "Revolt began at Meerut"). */
function clauseAround(text, idx, len, label) {
  const before = text.slice(0, idx);
  const after = text.slice(idx + len);
  const bl = before.toLowerCase();
  const lb = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('.'), before.lastIndexOf('।'), bl.lastIndexOf(' and '), bl.lastIndexOf(' while '), bl.lastIndexOf(' और '));
  const al = after.toLowerCase();
  const raAll = [after.search(/[,;.।]/), al.indexOf(' and '), al.indexOf(' while '), al.indexOf(' और ')].filter((n) => n >= 0);
  const ra = raAll.length ? Math.min(...raAll) : after.length;
  let clause = (before.slice(lb < 0 ? 0 : lb + 1) + label + after.slice(0, ra)).replace(/^\s*(?:and|while|और)\s+/i, '');
  clause = clause.replace(new RegExp('\\s*(?:\\b(?:in|of|during|around|about|by|from|until|till|since|circa)\\b\\s*)?' + escRe(label) + '\\b'), '');
  return clause.replace(/\s+/g, ' ').replace(/^[\s\-–(),]+|[\s\-–(,]+$/g, '').split(' ').slice(0, 10).join(' ');
}

/** @param {{id:string,text:string}[]} sentences */
export function extractPageFacts(sentences) {
  const formulas = [];
  const dates = [];
  const seenF = new Set();
  const seenD = new Set();
  for (const s of sentences || []) {
    const text = String(s?.text || '');
    if (!text) continue;
    // Hindi pages write years in Devanagari digits (१८५७); same length, so match positions still fit the original text
    const asciiText = text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

    for (const f of formulasIn(text)) {
      const key = norm(f);
      if (seenF.has(key)) continue;
      seenF.add(key);
      formulas.push({ kind: 'formula', text: f, key, sid: s.id });
    }

    const addDate = (label, idx, len) => {
      const k = norm(label);
      if (seenD.has(k + '|' + s.id)) return;
      seenD.add(k + '|' + s.id);
      const ctx = clauseAround(text, idx, len, label);
      dates.push({ kind: 'date', year: label, text: ctx || text.slice(0, 50), key: k, sid: s.id });
    };
    let m;
    YEAR_RE.lastIndex = 0;
    while ((m = YEAR_RE.exec(asciiText))) addDate(text.substr(m.index, m[0].length).trim(), m.index, m[0].length);
    BC_RE.lastIndex = 0;
    while ((m = BC_RE.exec(asciiText))) {
      if (!dates.some((d) => d.sid === s.id && /bc/i.test(d.year) && norm(d.year).includes(norm(m[1])))) addDate(text.substr(m.index, m[0].length).trim(), m.index, m[0].length);
    }
  }
  return { formulas, dates };
}

function boardText(step) {
  let t = String(step?.spokenText || '') + ' ' + String(step?.keyFormula || '') + ' ';
  try { t += JSON.stringify(step?.boardCues || []); } catch { /* ignore */ }
  return norm(t);
}

const yearNum = (d) => {
  const n = parseInt(String(d.year).replace(/[^0-9]/g, ''), 10) || 0;
  return /BC/i.test(d.year) ? -n : n;
};

/**
 * Board cues for the page's formulas / dates that the lesson has not put on any board yet.
 * @param {object} step      the step being added (its cues are checked too)
 * @param {object[]} allSteps steps already in the lesson
 * @param {{formulas:object[],dates:object[]}} facts
 * @param {{isLast:boolean}} opts the last step also takes facts that no step cited
 */
export function missingFactCues(step, allSteps, facts, { isLast = false } = {}) {
  if (!facts || (!facts.formulas.length && !facts.dates.length)) return [];
  const have = [...(allSteps || []), step].map(boardText).join('|');
  const cited = new Set((step?.sourceSentenceIds || []).map(String));
  const mine = (f) => cited.has(String(f.sid));
  const claimedElsewhere = (f) => (allSteps || []).some((st) => (st.sourceSentenceIds || []).map(String).includes(String(f.sid)));

  const want = (f) => (mine(f) || (isLast && !claimedElsewhere(f)) || (isLast && !(allSteps || []).length));
  const formulas = facts.formulas.filter((f) => want(f) && !have.includes(f.key)).slice(0, 4);
  const dates = facts.dates.filter((d) => want(d) && !have.includes(norm(d.year) + norm(d.text).slice(0, 6)) && !have.includes(norm(d.year))).slice(0, 7);

  const cues = [];
  formulas.forEach((f, i) => cues.push({ type: 'equation', text: f.text, color: i % 2 ? 'teal' : 'amber', atProgress: 0.55 + i * 0.05, _auto: true }));
  if (dates.length === 1) {
    cues.push({ type: 'callout', label: `Date to remember · ${dates[0].year}`, icon: 'scroll', text: dates[0].text, color: 'coral', atProgress: 0.8, _auto: true });
  } else if (dates.length > 1) {
    const items = [...dates].sort((a, b) => yearNum(a) - yearNum(b)).map((d) => ({ year: d.year, text: d.text }));
    cues.push({ type: 'timeline', title: 'Dates to remember', items, atProgress: 0.8, _auto: true });
  }
  return cues;
}
