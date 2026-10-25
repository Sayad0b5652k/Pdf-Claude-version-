// @ts-nocheck
/* ======================================================================
   Question Paper Generator: engine.
   - source extraction (chapters -> clean text -> slices)
   - prompt building + AI calls (JSON mode, retries, abort)
   - validation / grounding / anti-copy / de-duplication (paper_core)
   - independent verification pass (second look at every answer)
   - background job runner that survives view changes, with persistence
   ====================================================================== */
import * as C from './paper_core.js';

const MODEL = 'gemini-3.1-flash-lite';
const SYSTEM = 'You are a meticulous board-examination paper setter and fact checker. You output ONLY valid JSON, never markdown or commentary. You never invent facts that the supplied source does not support; if the source cannot support the requested number of items, return fewer items.';
const CONCURRENCY = 3;

const uid = () => (window.uid ? window.uid() : Math.random().toString(36).slice(2, 11) + Date.now().toString(36));

/* ------------------------------- Storage ------------------------------- */
export const PaperStore = {
  async list() {
    try { const all = (await window.DB.all('papers')) || []; return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch (e) { return []; }
  },
  async get(id) { try { return await window.DB.get('papers', id); } catch (e) { return null; } },
  async save(rec) { rec.updatedAt = Date.now(); try { await window.DB.put('papers', rec); } catch (e) { console.warn('[Paper] save failed', e); } },
  async remove(id) { try { await window.DB.del('papers', id); } catch (e) {} },
  /* A page reload kills running jobs; flag them so the user can resume. */
  async recover() {
    const all = await this.list();
    for (const r of all) if (r.status === 'running' || r.status === 'queued') { r.status = 'interrupted'; for (const t of r.tasks || []) if (t.status === 'running') t.status = 'pending'; await this.save(r); }
  },
};

/* ------------------------------ AI transport ------------------------------ */
async function postJson(url, body, timeoutMs, signal) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); }
}
const sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

export async function callPaperAI(prompt, { temperature = 0.35, timeoutMs = 75000, signal, tries = 3 } = {}) {
  const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw new Error('cancelled');
    try {
      const data = await postJson('/api/ai/study-tool', { toolKey: 'paper', prompt, systemInstruction: SYSTEM, model: MODEL, temperature, json: true, customKey: customKey || undefined }, timeoutMs, signal);
      const text = (data.text || '').trim();
      if (text.length > 5) return text;
      lastErr = new Error('empty response');
    } catch (e) {
      if (signal?.aborted) throw new Error('cancelled');
      lastErr = e;
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408) break;
    }
    await sleep(1500 * (i + 1) * (i + 1), signal);
  }
  throw lastErr || new Error('AI request failed');
}

/* ------------------------------ Source prep ------------------------------ */
export async function prepareSources(doc, chapters, onProgress) {
  const out = [];
  let i = 0;
  for (const ch of chapters) {
    i++;
    if (onProgress) onProgress(i, chapters.length, ch.title);
    let text = '';
    try { text = await window.extractRangeText(doc, ch.startPage, ch.endPage); } catch (e) {}
    text = String(text || '').replace(/\n?\.\.\.\[lesson section content\]\.\.\.\n?/g, ' ');
    const words = text.replace(/\[PAGE \d+\]/g, '').trim().split(/\s+/).filter(Boolean).length;
    out.push({ title: ch.title, startPage: ch.startPage, endPage: ch.endPage, text, words });
  }
  return out;
}

/* ------------------------------- Prompting ------------------------------- */
const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)' };
const DIFF = {
  easy: 'about 50% easy, 40% average and 10% difficult',
  balanced: 'about 30% easy, 50% average and 20% difficult',
  hard: 'about 15% easy, 45% average and 40% difficult (higher-order thinking)',
};
const BOARD_NAME = { cbse: 'CBSE', nios: 'NIOS' };
const UNSEEN_EN = ['the habit of reading in a digital age', 'urban gardening and shared green spaces', 'how sleep shapes learning', 'a young inventor who solves a local problem', 'water conservation in everyday life', 'the rise of cycling in cities', 'volunteering and community service', 'a school science fair', 'the importance of mental well-being for students', 'traditional crafts and the modern market', 'road safety awareness', 'renewable energy in villages'];
const UNSEEN_HI = ['पुस्तकों का महत्व', 'पर्यावरण संरक्षण', 'समय का सदुपयोग', 'परिश्रम की महिमा', 'विज्ञान और मानव जीवन', 'ग्रामीण जीवन और शहरी जीवन', 'खेलकूद का महत्व', 'स्वच्छता अभियान', 'डिजिटल भारत', 'अनुशासन और सफलता'];
const pick = (arr, seed) => arr[C.rng(seed)() * arr.length | 0];

const subPlanText = (sub, lang) => {
  const lines = []; let n = 1;
  for (const [t, k, m] of sub) for (let i = 0; i < k; i++) {
    const kind = t === 'mcq' ? 'MCQ with 4 options' : t === 'map' ? 'map item (locate / identify and label)'
      : t === 'obj' ? ['fill in the blank (use ________)', 'true/false statement', 'one-word / one-sentence answer'][(n - 1) % 3]
      : m <= 1 ? 'very short answer (one word or one sentence)' : m === 2 ? 'short answer (30-40 words)' : 'short answer (50-60 words)';
    lines.push(`${n}) ${kind}, ${m} mark${m > 1 ? 's' : ''}`);
    n++;
  }
  return lines.join('\n');
};

const SUBQ_SHAPE = `Each sub-question object: {"question":"…","type":"mcq|short|fill|tf","options":["…","…","…","…"] (mcq only),"correctIndex":0-3 (mcq only),"answer":"…" (non-mcq; for tf use "True" or "False"),"keyPoints":["…"] (short answers, one point per mark or half mark),"evidence":"exact quote from the source (max 25 words)","explanation":"one sentence"}`;

function buildCommon(rec, task, srcText, seenStems, feedback) {
  const bn = BOARD_NAME[rec.board] || rec.board.toUpperCase();
  const kindNote = {
    maths: 'This is a Mathematics paper: every numerical answer must be computed carefully and re-checked; show the working step by step in the model answer and award step marks in keyPoints (e.g. formula, substitution, calculation, final answer with units). Use only concepts, formulas and example patterns present in the source. Numbers must be self-consistent.',
    science: 'This is a Science paper: use correct scientific terminology and SI units. For numericals show the formula, substitution and answer with units. Use only concepts, laws and examples present in the source.',
    sst: 'This is a Social Science paper: names, dates, places, terms and causes must match the source exactly. Never add facts that are not in the source.',
    english: 'This is an English paper: literature questions must be about the textbook content in the source; do not invent characters, events or quotations.',
    hindi: 'यह हिंदी का प्रश्न-पत्र है: साहित्यिक प्रश्न केवल दिए गए पाठ की सामग्री पर आधारित हों; कोई पात्र, घटना या उद्धरण न गढ़ें।',
    generic: 'Use only the facts present in the source.',
  }[rec.kind] || '';
  return `You are a senior ${bn} examiner setting the ${rec.subject} paper for ${rec.level === '12' ? 'Class 12 / Senior Secondary' : 'Class 10 / Secondary'}.
Write EVERYTHING (questions, options, answers, explanations) in ${LANG_NAME[rec.lang] || 'English'}.
${kindNote}

RULES (strict):
1. Every question must be answerable from the SOURCE below and must not rely on outside facts.
2. Never copy a sentence from the source or merely add a blank to it. Test understanding, application, data interpretation or reasoning. At least half of the questions should be competency-based (real-life application, analysis, inference), the rest recall/understanding.
3. For each question return "evidence": an EXACT quote (max 25 words, copied word-for-word) from the SOURCE that proves the answer, and "page": the page number taken from the nearest [p.N] marker.
4. Difficulty mix for this batch: ${DIFF[rec.difficulty] || DIFF.balanced}.
5. Cover DIFFERENT topics/paragraphs of the source. No two questions may test the same fact. Questions must read like an official ${bn} question paper (no chatty wording, no "according to the passage" unless a passage is part of the question).
6. Do NOT mention the source, these rules or page markers inside questions or answers.
${seenStems.length ? `\nALREADY IN THIS PAPER (do not repeat or rephrase these):\n${seenStems.map((s, i) => `- ${s.slice(0, 140)}`).join('\n')}\n` : ''}${feedback.length ? `\nPREVIOUS ATTEMPT WAS REJECTED FOR: ${[...new Set(feedback)].join('; ')}. Fix these problems.\n` : ''}
SOURCE (chapters selected by the student):
"""
${srcText}
"""`;
}

function schemaFor(task, need, rec, sub) {
  const t = task.type, m = task.marks, hi = rec.lang === 'hi';
  const words = task.words || C.TYPE_META[t]?.words || '';
  switch (t) {
    case 'mcq':
      return `TASK: Write EXACTLY ${need} multiple-choice questions (1 mark each), each with 4 plausible, similar-length options and exactly ONE correct option. Avoid "all of the above" / "none of the above". Spread the correct option randomly.
Return a JSON array of ${need} objects: {"question":"…","options":["…","…","…","…"],"correctIndex":0,"evidence":"…","page":12,"explanation":"why the answer is right and the best distractor wrong"}`;
    case 'ar': return `TASK: Write EXACTLY ${need} Assertion-Reason questions (1 mark each). The four options are fixed:
0: both A and R true and R correctly explains A; 1: both true but R does not explain A; 2: A true, R false; 3: A false, R true.
Use a varied mix of correctIndex values (not all 0). Statements must be factual and clearly true or false according to the source.
Return a JSON array of ${need} objects: {"assertion":"…","reason":"…","correctIndex":0,"evidence":"…","page":12,"explanation":"…"}`;
    case 'fill': return `TASK: Write EXACTLY ${need} fill-in-the-blank questions (1 mark each) with a single blank written as ________ and a short, unambiguous answer.
Return a JSON array: {"question":"… ________ …","answer":"…","accepted":["alternative spellings or synonyms"],"evidence":"…","page":12,"explanation":"…"}`;
    case 'tf': return `TASK: Write EXACTLY ${need} true/false statements (1 mark each), roughly half true and half false. A false statement must be subtly wrong, not absurd.
Return a JSON array: {"question":"statement","answer":"True" or "False","evidence":"…","page":12,"explanation":"…"}`;
    case 'vsa': case 'sa': case 'la': {
      const pts = m <= 2 ? `${m * 2} short marking points` : `${m} to ${m * 2} marking points`;
      return `TASK: Write EXACTLY ${need} ${m}-mark ${C.TYPE_META[t].name.toLowerCase()} questions (expected answer length ${words} words). Use board command words (explain, differentiate, justify, analyse, evaluate, with reasons, describe) and vary them.${rec.kind === 'maths' || rec.kind === 'science' ? ' Include numerical/derivation questions where the chapter supports them.' : ''}
Return a JSON array of ${need} objects: {"question":"…","answer":"complete model answer within about ${words} words","keyPoints":["${pts} that together are worth exactly ${m} mark${m > 1 ? 's' : ''}"],"evidence":"…","page":12,"explanation":"common mistake or examiner note"}`;
    }
    case 'case': return `TASK: Write ONE case/source-based question worth ${m} marks. First write a short, original scenario, data set or source excerpt of 70-130 words that applies concepts from the SOURCE (a real-life situation, an experiment, a table of data, or a paraphrased historical/geographical source). All facts you rely on must match the SOURCE. Then write the sub-questions in this exact order:
${subPlanText(sub, rec.lang)}
Return ONE JSON object: {"title":"short title","passage":"the scenario / data / source text","subQuestions":[ … ],"evidence":"…","page":12}
${SUBQ_SHAPE}`;
    case 'map': return `TASK: Write ONE map-skill question worth ${m} marks as ${m} separate items. Each item names a place, feature or region that is explicitly discussed in the SOURCE and asks the student to locate and label it on an outline map (or identify it from a description). The "answer" says exactly where it is (state/region/direction) as stated in the SOURCE. ${'Items to produce:\n' + subPlanText(sub, rec.lang)}
Return ONE JSON object: {"title":"Map work","subQuestions":[{"question":"…","answer":"…","evidence":"…"}],"page":12}`;
    case 'obj': return `TASK: Write EXACTLY ${need} objective items. Each item is worth ${m} marks and consists of ${m} one-mark sub-questions in this order:
${subPlanText(sub, rec.lang)}
Return a JSON array of ${need} objects: {"subQuestions":[ … ]}
${SUBQ_SHAPE}
For fill-in-the-blank use "type":"fill" and "accepted":[…]; for true/false use "type":"tf"; for one-word answers use "type":"short" with a one-line "answer".`;
    case 'passage': {
      const theme = pick(hi ? UNSEEN_HI : UNSEEN_EN, rec.id + task.id);
      const data = task.passageKind === 'data' || task.passageKind === 'factual';
      return `TASK: Write ONE UNSEEN passage question worth ${m} marks. The passage must be a completely ORIGINAL ${task.passageKind === 'poem' ? 'poem of about 14-20 lines' : `prose passage of ${words || '250'} words`} for this level, on a theme such as "${theme}". Do not use real statistics, quotations or named real people; any numbers must be clearly illustrative.${data ? ' Add a small data table (as plain text rows with | separators) that the questions partly depend on, and put it in "dataTable".' : ''}
The passage must clearly contain the answer to every sub-question. Sub-questions in this exact order:
${subPlanText(sub, rec.lang)}
Return ONE JSON object: {"title":"…","passage":"…","dataTable":"…or empty","subQuestions":[ … ]}
${SUBQ_SHAPE} (the "evidence" must be an exact quote from YOUR passage).`;
    }
    case 'extract': return `TASK: The EXTRACT below is taken word-for-word from the textbook. Write the sub-questions on it, in this exact order (total ${m} marks):
${subPlanText(sub, rec.lang)}
Questions must test meaning, inference, vocabulary-in-context or character/theme; they must be answerable from the extract together with the SOURCE.
EXTRACT:
"""
${task.fixedText}
"""
Return ONE JSON object: {"subQuestions":[ … ]}
${SUBQ_SHAPE}`;
    case 'grammar': {
      const k = task.subs || 1;
      return hi
        ? `TASK: Write EXACTLY ${need} व्याकरण प्रश्न (प्रत्येक ${m} अंक${k > 1 ? `, ${k} उप-भागों के साथ` : ''}) विषय: ${task.topic || 'व्याकरण'}. प्रश्न में वाक्य/पद स्वयं दें, उत्तर स्पष्ट और एकमात्र सही हो। विविध प्रकार के प्रश्न बनाएँ (पहचानिए, बदलिए, छाँटकर लिखिए)।
Return a JSON array: {"question":"…","answer":"…","explanation":"…"}`
        : `TASK: Write EXACTLY ${need} grammar/usage items (${m} mark${m > 1 ? 's' : ''} each${k > 1 ? `, each with ${k} numbered one-mark sub-points (i)…` : ''}) on: ${task.topic || 'grammar'}. Use a MIX of gap-filling, error correction/editing, sentence transformation and reported speech where relevant. Each item must have exactly one correct answer. Use fresh sentences (they may echo the themes of the SOURCE but need not quote it).
Return a JSON array: {"question":"…","answer":"…${k > 1 ? ' (list all ' + k + ' answers)' : ''}","explanation":"rule applied"}`;
    }
    case 'letter': case 'paragraph': case 'essay': case 'notice': case 'summary': {
      const label = { letter: 'letter-writing', paragraph: 'analytical-paragraph', essay: 'essay/article', notice: 'notice/email/message/advertisement', summary: 'summary-writing' }[t];
      const extra = t === 'paragraph' ? ' The question must itself contain the data (a small table or list of figures as plain text) or cues the paragraph is based on.' : t === 'letter' ? ' Describe a realistic situation with the needed details (generic names), and state whether the letter is formal or informal.' : t === 'summary' ? ' The question must include the full passage (150-200 words) to be summarised.' : '';
      return `TASK: Write EXACTLY ${need} ${label} task${need > 1 ? 's' : ''} worth ${m} marks each (answer length ${words || 'as per board norms'} words), on DIFFERENT topics.${extra}
Return a JSON array: {"question":"complete task as printed on the paper","answer":"a model answer of the required length in the correct format","keyPoints":["rubric lines such as Format, Content, Organisation, Accuracy, each with equal share of ${m} marks"]}`;
    }
  }
  return '';
}

function normalizeCandidates(task, parsed) {
  if (parsed == null) return [];
  const composite = C.TYPE_META[task.type]?.composite;
  if (composite && task.type !== 'obj') {
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter((x) => x && typeof x === 'object').slice(0, 1);
  }
  const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : Array.isArray(parsed.items) ? parsed.items : [parsed]);
  return arr.filter((x) => x && typeof x === 'object');
}

/* ------------------------------- Verification ------------------------------- */
function verifyPrompt(items, srcText, rec, basis) {
  return `You are an independent examiner re-checking another setter's questions.
${basis === 'maths' ? 'SOLVE every question yourself from scratch, then compare with the claimed answer.' : 'Using ONLY the SOURCE (and ordinary language knowledge for language skills), decide whether the claimed answer is correct.'}
Verdicts: "ok" = the claimed answer is correct and there is exactly one defensible answer; "wrong" = claimed answer is incorrect; "ambiguous" = more than one option/answer is defensible or the question is unclear; "unsupported" = the answer depends on facts that are not in the source.
For MCQ / assertion-reason also return "pick": the index (0-3) you believe is correct.
Return ONLY a JSON array: [{"id":0,"verdict":"ok","pick":2,"note":"max 15 words"}]

SOURCE:
"""
${srcText}
"""

ITEMS:
${items.map((it) => `#${it.id} [${it.kind}] ${it.question}${it.options ? '\n' + it.options.map((o, i) => `   ${'ABCD'[i]}) ${o}`).join('\n') : ''}\n   CLAIMED ANSWER: ${it.claimed}`).join('\n\n')}`;
}

function collectVerifiable(q, out, prefix = '') {
  const nodes = q.items?.length ? q.items.map((it, j) => ({ it, key: `${prefix}${j}` })) : [{ it: q, key: prefix + '0' }];
  for (const { it, key } of nodes) {
    if (['mcq', 'ar'].includes(it.type)) out.push({ ref: it, key, kind: it.type === 'ar' ? 'assertion-reason' : 'mcq', question: it.q, options: it.options, claimed: `${'ABCD'[it.correct]}) ${it.options[it.correct]}`, claimedIndex: it.correct });
    else if (['tf', 'fill', 'vsa', 'sa', 'la', 'short', 'map'].includes(it.type)) out.push({ ref: it, key, kind: it.type, question: it.q, claimed: `${String(it.answer).slice(0, 500)}` });
  }
}

async function verifyQuestions(job, task, qs, srcText) {
  const flat = [];
  qs.forEach((q, qi) => collectVerifiable(q, flat, qi + ':'));
  if (!flat.length) return { keep: qs, dropped: 0, verified: 0 };
  const items = flat.map((f, i) => ({ id: i, kind: f.kind, question: f.question, options: f.options, claimed: f.claimed }));
  let verdicts;
  try {
    const raw = await callPaperAI(verifyPrompt(items, srcText, job.rec, job.rec.kind === 'maths' ? 'maths' : 'src'), { temperature: 0.1, signal: job.signal, tries: 2, timeoutMs: 60000 });
    verdicts = C.parseJsonLoose(raw);
  } catch (e) { if (job.cancelled) throw e; verdicts = null; }
  if (!Array.isArray(verdicts)) { qs.forEach((q) => { q.verified = false; }); return { keep: qs, dropped: 0, verified: 0 }; }
  const bad = new Set();
  let verified = 0;
  verdicts.forEach((v) => {
    const f = flat[v?.id];
    if (!f) return;
    const pick = Number.isInteger(v.pick) ? v.pick : null;
    const mismatch = f.claimedIndex != null && pick != null && pick !== f.claimedIndex;
    if (v.verdict === 'ok' && !mismatch) { f.ref.verified = true; verified++; } else if (v.verdict === 'ok' && mismatch) bad.add(+f.key.split(':')[0]);
    else if (v.verdict === 'wrong' || v.verdict === 'ambiguous' || v.verdict === 'unsupported') bad.add(+f.key.split(':')[0]);
  });
  const keep = qs.filter((_, i) => !bad.has(i));
  qs.forEach((q, i) => { q.verified = flat.filter((f) => +f.key.split(':')[0] === i).every((f) => f.ref.verified === true); });
  return { keep, dropped: qs.length - keep.length, verified };
}

/* --------------------------------- Task runner --------------------------------- */
function stemsOf(rec) {
  const out = [];
  for (const arr of Object.values(rec.results || {})) for (const q of arr) { if (!q) continue; out.push(q.q || q.passage || ''); if (q.items) q.items.forEach((i) => out.push(i.q)); }
  return out.filter(Boolean);
}

function buildPlan(task, rec, focus) {
  const plan = { marks: task.marks, words: task.words || C.TYPE_META[task.type]?.words };
  if (C.TYPE_META[task.type]?.composite) {
    plan.sub = task.sub || C.defaultSub(task.type, task.marks);
    if (task.type === 'extract') {
      const sl = focus[0];
      plan.fixedText = C.pickExtract(sl?.text || '', task.marks >= 8 ? 120 : 95, ((task.startIndex + 1) * 0.37) % 0.7);
      plan.page = sl?.pages?.[0] ?? null;
      plan.chapter = sl?.chapter;
    }
  }
  return plan;
}

async function runTask(job, task, focus = []) {
  const rec = job.rec;
  const noSource = !focus.length;
  const srcText = focus.map((f) => `### ${f.chapter}\n${f.text}`).join('\n\n').slice(0, 11000);
  const idx = C.buildSourceIndex(srcText.replace(/\[p\.\d+\]/g, ' '));
  const lang = rec.lang;
  const isLangSkill = !!(C.TYPE_META[task.type]?.language && task.type !== 'extract') || task.lang;
  const plan = buildPlan(task, rec, focus);
  if (task.type === 'extract') { task.fixedText = plan.fixedText; }
  const accepted = [...(rec.results[task.id] || [])];
  const rejected = [];
  let stats = { rejected: 0, dropped: 0 };
  const verifyOn = rec.verify && !C.TYPE_META[task.type]?.writing && task.type !== 'grammar';
  const baseSeen = stemsOf(rec);

  for (let attempt = 0; attempt < 3 && accepted.length < task.count; attempt++) {
    if (job.cancelled) throw new Error('cancelled');
    const need = task.count - accepted.length;
    const seenNow = [...baseSeen, ...accepted.map((a) => a.q || a.passage || '')];
    const prompt = buildCommon(rec, task, srcText, seenNow.slice(-16), rejected) + '\n\n' + schemaFor({ ...task, fixedText: plan.fixedText }, need, rec, plan.sub);
    let raw;
    try { raw = await callPaperAI(prompt, { signal: job.signal, temperature: attempt ? 0.55 : 0.35 }); } catch (e) { if (job.cancelled) throw e; rejected.push('request failed'); continue; }
    const cands = normalizeCandidates(task, C.parseJsonLoose(raw));
    if (!cands.length) { rejected.push('invalid JSON'); continue; }
    const fresh = [];
    for (const c of cands) {
      if (fresh.length + accepted.length >= task.count) break;
      const ctx = { idx: isLangSkill ? null : idx, kind: rec.kind, lang, seen: [...seenNow, ...fresh.map((f) => f.q || f.passage || '')], seed: rec.id + task.id + attempt };
      const v = C.TYPE_META[task.type]?.composite ? C.validateComposite(task.type, c, plan, ctx) : C.validateQuestion(task.type, c, plan, ctx);
      if (v.error) { rejected.push(v.error); stats.rejected++; continue; }
      const q = v.q;
      q.tid = task.id;
      if (task.type === 'extract') { q.page = plan.page; q.chapter = plan.chapter; q.passage = plan.fixedText; }
      if (!q.chapter && focus[0]) q.chapter = focus.find((f) => f.pages?.includes(q.page))?.chapter || focus[0].chapter;
      if (task.type === 'passage') q.unseen = true;
      if (task.topic) q.topic = task.topic;
      fresh.push(q);
    }
    if (!fresh.length) continue;
    if (verifyOn) {
      const vSrc = task.type === 'passage' ? fresh.map((f) => f.passage + (f.dataTable ? '\n' + f.dataTable : '')).join('\n\n') : srcText;
      const res = await verifyQuestions(job, task, fresh, vSrc);
      stats.dropped += res.dropped;
      if (res.dropped) rejected.push('failed independent answer check');
      accepted.push(...res.keep);
    } else accepted.push(...fresh.map((f) => (f.verified = null, f)));
  }
  accepted.forEach((q, i) => { q.ti = i; });
  rec.results[task.id] = accepted.slice(0, task.count);
  rec.stats.rejected += stats.rejected;
  rec.stats.dropped += stats.dropped;
  task.status = accepted.length >= task.count ? 'done' : accepted.length ? 'partial' : 'failed';
  if (task.status !== 'done') task.note = [...new Set(rejected)].slice(0, 3).join('; ');
  return task.status;
}

/* ------------------------------- Job manager ------------------------------- */
const jobs = new Map();
const listeners = new Set();
export const PaperJobs = {
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(id) { listeners.forEach((fn) => { try { fn(id); } catch (e) {} }); try { window.dispatchEvent(new CustomEvent('paper:update', { detail: { id } })); } catch (e) {} },
  get(id) { return jobs.get(id) || null; },
  isRunning(id) { const j = jobs.get(id); return !!(j && j.running); },
  runningIds() { return [...jobs.values()].filter((j) => j.running).map((j) => j.rec.id); },
  cancel(id) { const j = jobs.get(id); if (j) { j.cancelled = true; j.ctl.abort(); } },
  async start(rec) {
    if (jobs.get(rec.id)?.running) return jobs.get(rec.id);
    const ctl = new AbortController();
    const job = { rec, ctl, signal: ctl.signal, cancelled: false, running: true, stats: { verified: 0 } };
    jobs.set(rec.id, job);
    runJob(job).catch((e) => console.warn('[Paper] job error', e));
    return job;
  },
};

function refreshProgress(rec, label) {
  const total = rec.tasks.length;
  const done = rec.tasks.filter((t) => t.status === 'done' || t.status === 'partial' || t.status === 'failed').length;
  rec.progress = { done, total, label: label || rec.progress?.label || '' };
}

export function reassemble(rec) {
  const byPart = {};
  for (const t of rec.tasks) { const key = `${t.section}${t.partIndex}`; (byPart[key] ||= []).push(...(rec.results[t.id] || [])); }
  rec.sections = C.assemblePaper(rec.config.sections, byPart, { internalChoice: rec.internalChoice });
  rec.missing = rec.sections.reduce((a, s) => a + s.parts.reduce((b, p) => b + p.missing, 0), 0);
  return rec;
}

async function runJob(job) {
  const rec = job.rec;
  rec.status = 'running';
  rec.error = null;
  const chapters = (rec.src?.chapters || []).map((c) => ({ title: c.title, slices: C.sliceChapter(c.text, 3200) }));
  const tasksAll = C.distributeSlices(rec.tasks, chapters);
  const queue = tasksAll.filter((t) => t.status !== 'done');
  const focusOf = new Map(tasksAll.map((t) => [t.id, t.focus || []]));
  await PaperStore.save(rec);
  PaperJobs.emit(rec.id);
  let cursor = 0;
  const worker = async () => {
    while (!job.cancelled) {
      const t = queue[cursor++];
      if (!t) return;
      const rt = rec.tasks.find((x) => x.id === t.id);
      rt.status = 'running';
      refreshProgress(rec, labelFor(rec, rt));
      PaperJobs.emit(rec.id);
      try { await runTask(job, rt, focusOf.get(rt.id)); } catch (e) { if (job.cancelled) return; rt.status = 'failed'; rt.note = String(e.message || e).slice(0, 80); }
      reassemble(rec);
      refreshProgress(rec, labelFor(rec, rt));
      await PaperStore.save(rec);
      PaperJobs.emit(rec.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker));
  job.running = false;
  rec.tasks.forEach((t) => { if (t.status === 'running') t.status = 'pending'; });
  reassemble(rec);
  const ok = rec.tasks.every((t) => t.status === 'done');
  const any = rec.tasks.some((t) => t.status === 'done' || t.status === 'partial');
  rec.status = job.cancelled ? 'cancelled' : ok ? 'done' : any ? 'partial' : 'failed';
  if (rec.status === 'failed') rec.error = 'The AI service did not return usable questions. Check your connection or API key in Settings and try again.';
  rec.stats.verifiedCount = countVerified(rec);
  refreshProgress(rec, rec.status === 'done' ? 'Paper ready' : '');
  await PaperStore.save(rec);
  PaperJobs.emit(rec.id);
  try { window.dispatchEvent(new CustomEvent('paper:finished', { detail: { id: rec.id, status: rec.status } })); } catch (e) {}
}

function countVerified(rec) {
  let n = 0, t = 0;
  for (const u of C.flattenUnits(rec)) { if (u.alt) continue; if (['mcq', 'ar', 'tf', 'fill', 'vsa', 'sa', 'la', 'short', 'map'].includes(u.q.type)) { t++; if (u.q.verified) n++; } }
  return { verified: n, checkable: t };
}
function labelFor(rec, task) {
  const s = rec.config.sections.find((x) => x.key === task.section);
  return `${s?.title || task.section} · ${C.TYPE_META[task.type]?.name || task.type}`;
}

/* ------------------------------ Creating records ------------------------------ */
export function createPaperRecord(cfg, sources) {
  const id = uid();
  const bp = C.getBlueprint(cfg.blueprintId);
  const sections = JSON.parse(JSON.stringify(cfg.sections));
  const t = C.totals(sections);
  const lang = cfg.language === 'auto' ? (bp?.language || C.detectScript(sources.map((s) => s.text).join(' ').slice(0, 6000))) : cfg.language;
  const rec = {
    id, fileId: cfg.fileId, fileName: cfg.fileName, title: cfg.title || `${bp?.subject || cfg.subject} · ${BOARD_NAME[cfg.board]} ${cfg.level === '12' ? 'Class 12' : 'Class 10'}`,
    board: cfg.board, level: cfg.level, blueprintId: cfg.blueprintId, subject: bp?.subject || cfg.subject, kind: bp?.kind || 'generic', lang,
    difficulty: cfg.difficulty || 'balanced', internalChoice: !!cfg.internalChoice, verify: cfg.verify !== false,
    marks: t.marks, minutes: cfg.minutes || bp?.minutes || 180, instructions: cfg.instructions || bp?.instructions || [],
    chapters: sources.map((s) => ({ title: s.title, startPage: s.startPage, endPage: s.endPage })),
    config: { sections, official: !!cfg.official, school: cfg.school || '', exam: cfg.exam || '' },
    status: 'queued', progress: { done: 0, total: 0, label: 'Preparing…' }, results: {}, sections: [], missing: 0,
    stats: { rejected: 0, dropped: 0 }, createdAt: Date.now(), updatedAt: Date.now(),
    src: { chapters: sources.map((s) => ({ title: s.title, text: s.text.slice(0, 60000) })) },
    attempt: { answers: {}, self: {}, flags: {}, startedAt: null, submittedAt: null, elapsed: 0 },
  };
  rec.tasks = C.planTasks(sections, { internalChoice: rec.internalChoice });
  rec.progress.total = rec.tasks.length;
  return rec;
}

/* Re-run every task that is not finished (after cancel / failure / reload). */
export async function resumePaper(rec) {
  // a partial task keeps what it already produced and only asks for the rest (see runTask)
  rec.tasks.forEach((t) => { if (t.status !== 'done') { t.status = 'pending'; delete t.note; } });
  return PaperJobs.start(rec);
}

/* Replace a single question with a fresh one of the same type and marks. */
export async function regenerateQuestion(rec, qNo, which = 'main') {
  const holder = rec.sections.flatMap((s) => s.parts.flatMap((p) => p.questions.map((q) => ({ q, part: p, sec: s })))).find((x) => x.q.no === qNo);
  if (!holder) throw new Error('Question not found');
  const target = which === 'alt' ? holder.q.alt : holder.q;
  if (!target) throw new Error('No such question');
  const task = rec.tasks.find((t) => t.id === target.tid);
  if (!task) throw new Error('Task not found');
  const chapters = (rec.src?.chapters || []).map((c) => ({ title: c.title, slices: C.sliceChapter(c.text, 3200) }));
  const t1 = { ...task, count: 1, startIndex: 0 };
  // draw on a random part of the selected chapters so the replacement is a different question
  const pool = chapters.flatMap((c) => c.slices.map((s) => ({ chapter: c.title, ...s })));
  const focus = pool.length ? [pool[(Math.random() * pool.length) | 0]] : [];
  const ctl = new AbortController();
  // `results` is emptied for this task, and the other questions' stems are still passed in to avoid repeats
  const job = { rec: { ...rec, results: { ...rec.results, [task.id]: [] }, stats: { rejected: 0, dropped: 0 } }, signal: ctl.signal, cancelled: false, stats: { verified: 0 } };
  await runTask(job, t1, focus);
  const fresh = job.rec.results[task.id]?.[0];
  if (!fresh) throw new Error('Could not generate a replacement. Try again.');
  fresh.tid = task.id;
  const list = rec.results[task.id] || [];
  const at = list.indexOf(target);
  if (at >= 0) list[at] = fresh;
  fresh.ti = target.ti;
  rec.results[task.id] = list;
  rec.stats.rejected += job.rec.stats.rejected;
  reassemble(rec);
  await PaperStore.save(rec);
  PaperJobs.emit(rec.id);
  return fresh;
}

/* ---------------------- AI grading of written answers ---------------------- */
export async function gradeWrittenAnswers(rec, units, answers) {
  const todo = units.filter((u) => !u.alt && answers[u.id] && String(answers[u.id]).trim().length > 2 && !['mcq', 'ar', 'tf', 'fill', 'map', 'grammar'].includes(u.q.type) && !(u.q.type === 'vsa' && u.q.marks <= 1));
  const out = {};
  for (let i = 0; i < todo.length; i += 5) {
    const batch = todo.slice(i, i + 5);
    const prompt = `You are a strict but fair ${BOARD_NAME[rec.board]} examiner. Mark each student's answer against the marking scheme. Award marks in steps of 0.5, never above the maximum. Be consistent: give credit only for points that are actually present and correct.
Return ONLY a JSON array: [{"id":"…","marks":2.5,"feedback":"max 25 words: what was good, what was missing"}]

${batch.map((u) => `ID ${u.id} (max ${u.q.marks} marks)
QUESTION: ${u.q.q}
MARKING SCHEME: ${(u.q.points || []).map((p) => `${p.t} [${p.m}]`).join(' | ') || u.q.answer}
MODEL ANSWER: ${String(u.q.answer).slice(0, 700)}
STUDENT ANSWER: ${String(answers[u.id]).slice(0, 1500)}`).join('\n\n')}`;
    try {
      const raw = await callPaperAI(prompt, { temperature: 0.1, tries: 2, timeoutMs: 60000 });
      const arr = C.parseJsonLoose(raw);
      if (Array.isArray(arr)) for (const r of arr) { const u = batch.find((b) => String(b.id) === String(r.id)); if (u && Number.isFinite(+r.marks)) out[u.id] = { marks: Math.max(0, Math.min(u.q.marks, Math.round(+r.marks * 2) / 2)), feedback: String(r.feedback || '').slice(0, 200) }; }
    } catch (e) { /* skip this batch */ }
  }
  return out;
}

window.PaperJobs = PaperJobs;
window.PaperStore = PaperStore;
