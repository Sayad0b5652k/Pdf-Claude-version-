// @ts-nocheck
import {
  callStudyTool,
  callServerGemini,
  callAI,
  extractRangeText,
  sliceTextIntoSections
} from "./study_core.js";
/**
 * Calculates equal distribution of Short (2M), Medium (3-4M), and Long (5-6M) questions
 */
function getSubjectiveDistribution(totalCount) {
  if (totalCount === 5) return { short: 2, medium: 2, long: 1 };
  if (totalCount === 10) return { short: 4, medium: 4, long: 2 };
  if (totalCount === 15) return { short: 5, medium: 5, long: 5 };
  if (totalCount === 20) return { short: 8, medium: 8, long: 4 };
  if (totalCount === 25) return { short: 10, medium: 10, long: 5 };
  const s = Math.round(totalCount * 0.4);
  const m = Math.round(totalCount * 0.4);
  const l = Math.max(1, totalCount - s - m);
  return { short: s, medium: m, long: l };
}

/**
 * Deep semantic check to detect duplicate questions across batches
 */
function isQuestionDuplicate(q1, q2) {
  if (!q1 || !q2) return false;

  // For Assertion & Reasoning: compare assertion text
  if (q1.assertion && q2.assertion) {
    const a1 = String(q1.assertion).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const a2 = String(q2.assertion).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (a1 === a2) return true;
    if (a1.length > 20 && a2.length > 20 && (a1.includes(a2) || a2.includes(a1))) return true;
  }

  // Compare question texts
  const t1 = String(q1.question || q1.assertion || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const t2 = String(q2.question || q2.assertion || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t1 || !t2) return false;
  if (t1 === t2) return true;
  if (t1.length > 25 && t2.length > 25 && (t1.includes(t2) || t2.includes(t1))) return true;

  // Significant word overlap calculation (Jaccard)
  const stopWords = new Set(['what', 'which', 'explain', 'analyze', 'describe', 'according', 'section', 'passage', 'characters', 'character', 'following', 'statement', 'true', 'false', 'both', 'reason', 'assertion', 'that', 'with', 'from', 'this', 'these', 'their']);
  const words1 = new Set(t1.split(' ').filter(w => w.length > 3 && !stopWords.has(w)));
  const words2 = new Set(t2.split(' ').filter(w => w.length > 3 && !stopWords.has(w)));
  if (words1.size >= 4 && words2.size >= 4) {
    let intersect = 0;
    for (const w of words1) {
      if (words2.has(w)) intersect++;
    }
    const overlap = intersect / Math.min(words1.size, words2.size);
    if (overlap >= 0.72) return true;
  }

  return false;
}

/**
 * Normalizes question object into clean standard schema with bulletproof Assertion & Reason support
 */
function normalizeSingleQuestion(rawQ, formatMode, fallbackIdx = 0) {
  const q = { ...rawQ };
  if (!q.type) q.type = formatMode;

  if (formatMode === 'assertion_reasoning' || q.type === 'assertion_reasoning') {
    let a = (q.assertion || q.statementA || q.statement_a || q.A || '').trim();
    let r = (q.reason || q.statementR || q.statement_r || q.R || '').trim();

    if (!a || !r) {
      const fullQ = (q.question || q.prompt || q.text || '').trim();
      if (fullQ) {
        const matchA = fullQ.match(/Assertion\s*(?:\([A-Za-z0-9]\))?[:\-–—]?\s*([\s\S]+?)(?=(?:Reason\s*(?:\([A-Za-z0-9]\))?[:\-–—])|$)/i);
        const matchR = fullQ.match(/Reason\s*(?:\([A-Za-z0-9]\))?[:\-–—]?\s*([\s\S]+)$/i);
        if (matchA && matchA[1] && matchA[1].trim()) a = matchA[1].trim();
        if (matchR && matchR[1] && matchR[1].trim()) r = matchR[1].trim();
      }
    }

    if (!a) {
      a = (q.question && q.question.trim()) ? q.question.trim() : `Critical conceptual claim regarding events and themes in this passage.`;
    }
    if (!r) {
      r = (q.explanation && q.explanation.trim()) ? q.explanation.trim() : `The textual evidence and character psychology establish this underlying causality.`;
    }

    q.assertion = a;
    q.reason = r;
    q.question = `Assertion (A): ${a}\nReason (R): ${r}`;

    const standardAROptions = [
      "Both (A) and (R) are true and (R) is the correct explanation of (A)",
      "Both (A) and (R) are true but (R) is NOT the correct explanation of (A)",
      "(A) is true but (R) is false",
      "(A) is false but (R) is true"
    ];
    q.options = standardAROptions;

    let targetCorrectIndex = (fallbackIdx % 4);
    if (typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3) {
      targetCorrectIndex = q.correctIndex;
    } else if (typeof q.correctAnswer === 'string') {
      const idx = standardAROptions.findIndex(opt => opt.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim());
      if (idx >= 0) targetCorrectIndex = idx;
      else if (q.correctAnswer.startsWith('A') || q.correctAnswer.includes('is the correct explanation')) targetCorrectIndex = 0;
      else if (q.correctAnswer.startsWith('B') || q.correctAnswer.includes('NOT the correct')) targetCorrectIndex = 1;
      else if (q.correctAnswer.startsWith('C') || q.correctAnswer.includes('(R) is false')) targetCorrectIndex = 2;
      else if (q.correctAnswer.startsWith('D') || q.correctAnswer.includes('(A) is false')) targetCorrectIndex = 3;
    }

    q.correctIndex = targetCorrectIndex;
    q.correctAnswer = standardAROptions[targetCorrectIndex];

    if (!q.explanation) {
      q.explanation = targetCorrectIndex === 0 
        ? "Both statements are confirmed by the text, and Statement (R) directly explains the underlying cause behind Assertion (A)."
        : (targetCorrectIndex === 1 
          ? "Both statements are true individually based on the narrative, but Statement (R) does not provide the causal reason for Assertion (A)."
          : (targetCorrectIndex === 2 
            ? "Assertion (A) is supported by the passage, whereas Reason (R) contradicts direct textual facts."
            : "Assertion (A) is an inaccurate claim, while Reason (R) correctly reflects the textual reality."));
    }
    if (!q.distractorAnalysis) {
      q.distractorAnalysis = "Verify the factual accuracy of both statements independently before evaluating their causal connection.";
    }
    if (!q.examTrap) {
      q.examTrap = "Do not assume correlation implies causation; confirm if (R) genuinely answers 'Why' for (A).";
    }
  } else if (formatMode === 'fill_blank' || q.type === 'fill_blank') {
    if (!q.question) q.question = "The fundamental law governing this process is _______ .";
    if (!q.options) q.options = [];
    if (!q.correctAnswer) q.correctAnswer = "key principle";
    if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
      q.acceptedAnswers = [q.correctAnswer];
    }
  } else if (formatMode === 'true_false' || q.type === 'true_false') {
    if (!Array.isArray(q.options) || q.options.length < 2) q.options = ["True", "False"];
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 1) {
      q.correctIndex = fallbackIdx % 2;
    }
    q.correctAnswer = q.options[q.correctIndex] || "True";
  } else if (formatMode === 'subjective' || q.type === 'subjective') {
    if (!q.options) q.options = [];
    if (!q.keyPoints || !Array.isArray(q.keyPoints)) {
      q.keyPoints = ["Accurate identification of textual theme", "Structured analytical justification"];
    }
    if (!q.wordLimit) {
      q.wordLimit = q.tier === 'long' ? '100-120 words' : (q.tier === 'medium' ? '60-80 words' : '30-40 words');
    }
  } else {
    // MCQ
    if (!Array.isArray(q.options) || q.options.length < 4) {
      q.options = [
        q.correctAnswer || "Primary textual observation",
        "Plausible alternative outcome",
        "Misleading surface-level assumption",
        "Direct conceptual contradiction"
      ];
      q.correctIndex = 0;
      q.correctAnswer = q.options[0];
    }
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      q.correctIndex = fallbackIdx % q.options.length;
      q.correctAnswer = q.options[q.correctIndex];
    }
  }

  return q;
}

/**
 * Intelligent Dynamic Fallback Generator:
 * Extracts 100% UNIQUE sentences across the passage so no two questions ever repeat!
 */
function generateConceptFallbackQuestions(count, formatMode, difficulty, sectionLabel, shortCount = 0, mediumCount = 0, longCount = 0, sectionText = '', startIndex = 0) {
  /* Last-resort questions when the AI could not be reached. Every question is built from a
     real sentence of the page (a word is blanked out), so nothing here can be made up.
     Formats that need real understanding (assertion-reason, true/false, subjective) are
     not faked: they return nothing and the caller reports fewer questions. */
  if (formatMode !== 'mcq' && formatMode !== 'fill_blank') return [];
  const sents = String(sectionText || '').replace(/\s+/g, ' ').split(/(?<=[.?!])\s+/).map((x) => x.trim())
    .filter((x) => x.length > 40 && x.length < 220 && !/https?:|page\s*\d+/i.test(x));
  const STOP = new Set('which these those their there where while about after before because between during through should would could other being having under again further'.split(' '));
  const words = [...new Set((sectionText.match(/[A-Za-z][A-Za-z-]{5,}/g) || []).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w)))];
  const out = [];
  for (let i = 0; i < sents.length && out.length < count; i++) {
    const sent = sents[(startIndex + i) % sents.length];
    const cands = (sent.match(/[A-Za-z][A-Za-z-]{5,}/g) || []).filter((w) => !STOP.has(w.toLowerCase()));
    if (!cands.length) continue;
    const target = cands.sort((x, y) => y.length - x.length)[0];
    const blanked = sent.replace(new RegExp('\\b' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), '_______');
    if (out.some((q) => q.question === `Complete the sentence from the text: ${blanked}`)) continue;
    const question = `Complete the sentence from the text: ${blanked}`;
    if (formatMode === 'fill_blank') {
      out.push({ type: 'fill_blank', question, options: [], correctAnswer: target.toLowerCase(), acceptedAnswers: [target, target.toLowerCase()], explanation: `Original line: "${sent}"`, examTrap: '' });
      continue;
    }
    const pool = words.filter((w) => w !== target.toLowerCase() && Math.abs(w.length - target.length) <= 3);
    if (pool.length < 3) continue;
    const dis = []; for (let k = 0; k < pool.length && dis.length < 3; k++) { const w = pool[(startIndex * 7 + i * 5 + k * 11) % pool.length]; if (!dis.includes(w)) dis.push(w); }
    if (dis.length < 3) continue;
    const ci = (startIndex + out.length) % 4;
    const opts = dis.slice(); opts.splice(ci, 0, target.toLowerCase());
    out.push({ type: 'mcq', question, options: opts, correctIndex: ci, correctAnswer: target.toLowerCase(), explanation: `Original line: "${sent}"`, distractorAnalysis: '', examTrap: '' });
  }
  return out;
}

/**
 * Sequential 5-Question Chunk Generator:
 * STRICT RULE: Generates EXACTLY 5 questions at a time sequentially ("sirf 5 question generate ho uske baad hi agla 5").
 * Passes previously generated questions to every subsequent batch to guarantee ZERO DUPLICATION.
 */
async function generateQuizInChunks({
  targetText,
  scopeTitle,
  formatMode,
  rawQType,
  totalCount,
  difficulty,
  targetPage,
  onBatchProgress,
  onBatchQuestionsReady,
  shouldAbort
}) {
  const batchSize = 5;
  const numBatches = Math.max(1, Math.ceil(totalCount / batchSize));
  const textSections = sliceTextIntoSections(targetText, numBatches);

  // For Subjective mode, pre-calculate Short, Medium, Long distribution
  const subjDist = formatMode === 'subjective' ? getSubjectiveDistribution(totalCount) : null;
  let remainingShort = subjDist ? subjDist.short : 0;
  let remainingMedium = subjDist ? subjDist.medium : 0;
  let remainingLong = subjDist ? subjDist.long : 0;

  const accumulatedQuestions = [];

  for (let b = 0; b < numBatches; b++) {
    if (typeof shouldAbort === 'function' && shouldAbort()) {
      break;
    }
    const isLast = b === numBatches - 1;
    const countThisBatch = isLast ? (totalCount - accumulatedQuestions.length) : Math.min(batchSize, totalCount - accumulatedQuestions.length);
    if (countThisBatch <= 0) break;

    // Subjective tier distribution for this 5-question batch
    let batchShort = 0, batchMedium = 0, batchLong = 0;
    if (formatMode === 'subjective') {
      for (let k = 0; k < countThisBatch; k++) {
        if (remainingShort > 0 && (k % 3 === 0 || (remainingMedium === 0 && remainingLong === 0))) {
          batchShort++;
          remainingShort--;
        } else if (remainingMedium > 0 && (k % 3 === 1 || remainingLong === 0)) {
          batchMedium++;
          remainingMedium--;
        } else if (remainingLong > 0) {
          batchLong++;
          remainingLong--;
        } else if (remainingShort > 0) {
          batchShort++;
          remainingShort--;
        } else if (remainingMedium > 0) {
          batchMedium++;
          remainingMedium--;
        }
      }
    }

    const rawSection = textSections[b] || targetText;
    // Keep section text focused under 3200 characters so Gemini Flash returns in 2-3 seconds
    const sectionText = (rawSection && rawSection.length > 3200) ? rawSection.slice(0, 3200) : rawSection;
    const sectionLabel = numBatches > 1 ? `Part ${b + 1} of ${numBatches}` : scopeTitle;

    // Report batch start to UI progress bar
    if (typeof onBatchProgress === 'function') {
      onBatchProgress(
        b,
        numBatches,
        accumulatedQuestions.length,
        totalCount,
        `Formulating Batch ${b + 1} of ${numBatches} (Questions ${accumulatedQuestions.length + 1}–${accumulatedQuestions.length + countThisBatch})…`
      );
    }

    const boardHeader = `You are an elite Board Examination Paper Setter (CBSE & State Board Standard).
CRITICAL BOARD EXAMINATION INSTRUCTIONS:
1. STRICT BAN ON RAW SENTENCE RECOPYING: Never simply quote or copy-paste a raw sentence from the source text and append a blank or question tag to it. Formulate genuine, academically rigorous examination questions testing deep comprehension, literary devices, character psychology, thematic subtext, cause-and-effect relationships, and conceptual synthesis.
2. DIFFICULTY LEVEL: "${difficulty}"
   - Easy: Direct conceptual clarity, fundamental definitions, central themes, key vocabulary in context.
   - Medium: Analytical connections, comparing motives/outcomes, applying principles, multi-point reasoning.
   - Hard: High-Order Thinking Skills (HOTS), critical evaluation, subtle distractor discrimination, subtext and symbolic analysis.
3. CONTEXT SOURCE: Covering ${sectionLabel} of "${scopeTitle}".
4. GROUNDING (MOST IMPORTANT): Every question and its correct answer must be provable from the SOURCE PASSAGE below. Never use outside facts, never invent names, dates, numbers or events. Exactly one option may be correct, and the explanation must point to what the passage says. If the passage cannot support the requested number of good questions, return fewer instead of inventing.
5. SPEED & HIGH-YIELD CONCISENESS: Keep question statements, model explanations, and distractor analyses crisp and direct (1-2 clear sentences each, max 30 words per explanation) for fast execution.
SOURCE PASSAGE:
"""${sectionText}"""`;

    // Anti-repetition context passing previously generated questions
    const antiRepetitionHeader = accumulatedQuestions.length > 0 ? `
CRITICAL ANTI-REPETITION MANDATE:
The following ${accumulatedQuestions.length} questions have ALREADY been generated in this exam:
${accumulatedQuestions.map((q, idx) => `${idx + 1}. ${q.assertion ? `Assertion: "${q.assertion}"` : `Question: "${q.question}"`}`).slice(-10).join('\n')}

YOU MUST NOT REPEAT, DUPLICATE, OR REPHRASE ANY OF THE ABOVE QUESTIONS, THEMES, OR CLAIMS.
Generate ${countThisBatch} completely FRESH, UNIQUE questions focusing on DIFFERENT paragraphs, actions, dialogue, and nuances from this passage!
` : '';

    let batchPrompt = '';

    // 1. BOARD THEORY & SUBJECTIVE
    if (formatMode === 'subjective') {
      batchPrompt = `${boardHeader}
${antiRepetitionHeader}
TASK: Generate EXACTLY ${countThisBatch} BOARD THEORY & SUBJECTIVE EXAMINATION QUESTIONS strictly adhering to this tier breakdown:
- ${batchShort} Short Answer Questions (2 Marks each, expected word count 30-40 words, 2 distinct marking points)
- ${batchMedium} Medium Answer Questions (3-4 Marks each, expected word count 60-80 words, 3-4 structured explanation points)
- ${batchLong} Long Analytical Questions (5-6 Marks each, expected word count 100-120 words, multi-faceted analytical evaluation)

JSON FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of ${countThisBatch} objects. No markdown backticks, no preamble text:
[
  {
    "type": "subjective",
    "tier": "short",
    "marks": 2,
    "wordLimit": "30-40 words",
    "question": "Rigorous board-style question testing conceptual / analytical understanding",
    "options": [],
    "correctAnswer": "Exhaustive model answer written in crisp academic prose according to official Board marking criteria.",
    "keyPoints": ["Mandatory marking point 1", "Mandatory marking point 2"],
    "explanation": "Official Board marking rubric, concept breakdown, and evaluation criteria",
    "examTrap": "Common student misconception or omission where marks are typically deducted"
  }
]`;
    }

    // 2. ASSERTION & REASONING (REBUILT CLEANLY FROM SCRATCH)
    else if (formatMode === 'assertion_reasoning') {
      batchPrompt = `${boardHeader}
${antiRepetitionHeader}
TASK: Generate EXACTLY ${countThisBatch} unique, rigorous ASSERTION & REASONING questions strictly grounded in the passage.
Difficulty level: "${difficulty}".

BOARD RULES FOR ASSERTION & REASONING:
1. Each question must evaluate TWO statements:
   - "assertion": A meaningful analytical proposition or claim directly relating to events, themes, or characters in this passage.
   - "reason": An explanatory or causal statement that may or may not provide the correct explanation for the assertion.
2. Standard Board Options (must be EXACTLY these 4):
   [
     "Both (A) and (R) are true and (R) is the correct explanation of (A)",
     "Both (A) and (R) are true but (R) is NOT the correct explanation of (A)",
     "(A) is true but (R) is false",
     "(A) is false but (R) is true"
   ]
3. DIVERSITY IN CORRECT ANSWERS: Vary correctIndex across 0, 1, 2, and 3. DO NOT set all questions to option A!
4. "question": Full combined text: "Assertion (A): [assertion text]\\nReason (R): [reason text]".
5. "correctIndex": The integer index (0, 1, 2, or 3) corresponding to the correct option.
6. "correctAnswer": The exact string from options[correctIndex].
7. "explanation": Step-by-step logic proving the truth values of (A) and (R) and their causal relation.
8. "distractorAnalysis": Clear rationale explaining why the other 3 choices fail.
9. "examTrap": Specific distractor nuance or trap students often fall into.

JSON FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of ${countThisBatch} objects. No markdown backticks, no preamble text:
[
  {
    "type": "assertion_reasoning",
    "assertion": "(a claim taken from this passage)",
    "reason": "(a statement from this passage that may or may not explain the assertion)",
    "question": "Assertion (A): (the claim)\\nReason (R): (the statement)",
    "options": [
      "Both (A) and (R) are true and (R) is the correct explanation of (A)",
      "Both (A) and (R) are true but (R) is NOT the correct explanation of (A)",
      "(A) is true but (R) is false",
      "(A) is false but (R) is true"
    ],
    "correctIndex": 0,
    "correctAnswer": "Both (A) and (R) are true and (R) is the correct explanation of (A)",
    "explanation": "Say which statements the passage confirms and whether (R) explains (A).",
    "distractorAnalysis": "Since both statements are true and (R) is the causal reason, options B, C, and D are invalid.",
    "examTrap": "Do not confuse correlation with causation; confirm if (R) directly explains the 'Why' behind (A)."
  }
]`;
    }

    // 3. FILL IN THE BLANKS
    else if (formatMode === 'fill_blank') {
      batchPrompt = `${boardHeader}
${antiRepetitionHeader}
TASK: Generate EXACTLY ${countThisBatch} high-yield FILL-IN-THE-BLANK questions at difficulty level "${difficulty}".

RULES:
1. Formulate a meaningful, academically significant sentence where EXACTLY ONE crucial term or keyword is replaced with "_______".
2. "question": The complete sentence containing "_______".
3. "correctAnswer": The exact missing keyword.
4. "acceptedAnswers": Array of valid synonyms/variations.
5. "options": MUST BE EMPTY ARRAY [].
6. "explanation": Pedagogical logic supporting the correct term.

Return ONLY a valid JSON array of ${countThisBatch} objects.`;
    }

    // 4. TRUE / FALSE
    else if (formatMode === 'true_false') {
      batchPrompt = `${boardHeader}
${antiRepetitionHeader}
TASK: Generate EXACTLY ${countThisBatch} rigorous TRUE/FALSE questions at difficulty level "${difficulty}". Provide balanced True and False items.

RULES:
1. "question": The statement to evaluate.
2. "options": ["True", "False"].
3. "correctIndex": 0 for True, 1 for False.
4. "correctAnswer": "True" or "False".
5. "explanation": Textual evidence confirming truth value.

Return ONLY a valid JSON array of ${countThisBatch} objects.`;
    }

    // 5. MULTIPLE CHOICE QUESTIONS (4 OPTIONS)
    else {
      batchPrompt = `${boardHeader}
${antiRepetitionHeader}
TASK: Generate EXACTLY ${countThisBatch} unique, rigorous MULTIPLE CHOICE QUESTIONS (4 distinct options A, B, C, D) at difficulty level "${difficulty}".

RULES:
1. Test understanding of the concepts, reasons and relationships in the passage (applying, comparing, explaining) rather than bare recall of a copied line. Suit the subject: science and maths test principles and application, literature tests theme and character, history tests cause and effect.
2. Provide 4 plausible options with intelligent distractors.
3. Vary correctIndex across 0, 1, 2, and 3.
4. "question": Clear, challenging problem statement.
5. "options": Array of 4 option strings.
6. "correctIndex": 0, 1, 2, or 3.
7. "correctAnswer": Exact text of options[correctIndex].
8. "explanation": Step-by-step logic proving why the correct option is true.
9. "distractorAnalysis": Breakdown explaining why other options are eliminated.
10. "examTrap": Specific distractor trap to beware of.

Return ONLY a valid JSON array of ${countThisBatch} objects.`;
    }

    let batchQuestions = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawRes = await callAI(batchPrompt, 'mcq', sectionText, false, targetPage);
        const cleanJson = (rawRes || '')
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        const match = cleanJson.match(/\[[\s\S]*\]/);
        if (match) {
          const sanitized = match[0].replace(/,\s*([\]}])/g, '$1');
          batchQuestions = JSON.parse(sanitized);
        } else if (cleanJson.startsWith('[') && cleanJson.endsWith(']')) {
          batchQuestions = JSON.parse(cleanJson);
        }
        if (Array.isArray(batchQuestions) && batchQuestions.length > 0) {
          break;
        }
      } catch (err) {
        console.warn(`Sequential Batch ${b + 1} attempt ${attempt + 1} parse issue:`, err.message);
      }
    }

    // If API returned nothing or failed, formulate distinct in-text fallback questions
    if (!Array.isArray(batchQuestions) || batchQuestions.length === 0) {
      batchQuestions = generateConceptFallbackQuestions(
        countThisBatch,
        formatMode,
        difficulty,
        sectionLabel,
        batchShort,
        batchMedium,
        batchLong,
        sectionText,
        accumulatedQuestions.length
      );
    }

    // Normalize and filter duplicates
    let addedCount = 0;
    for (let i = 0; i < batchQuestions.length; i++) {
      if (accumulatedQuestions.length >= totalCount) break;
      const normalizedQ = normalizeSingleQuestion(batchQuestions[i], formatMode, accumulatedQuestions.length);

      // Verify no duplicate against all already accumulated questions
      const isDupe = accumulatedQuestions.some(existing => isQuestionDuplicate(existing, normalizedQ));
      if (!isDupe) {
        accumulatedQuestions.push(normalizedQ);
        addedCount++;
      }
    }

    // If duplicate filter left a deficit in this batch, backfill with unique items
    if (addedCount < countThisBatch && accumulatedQuestions.length < totalCount) {
      const deficit = Math.min(countThisBatch - addedCount, totalCount - accumulatedQuestions.length);
      const uniqueFills = generateConceptFallbackQuestions(
        deficit,
        formatMode,
        difficulty,
        sectionLabel,
        0, 0, 0,
        sectionText,
        accumulatedQuestions.length + 10
      );
      for (const f of uniqueFills) {
        if (accumulatedQuestions.length >= totalCount) break;
        const normF = normalizeSingleQuestion(f, formatMode, accumulatedQuestions.length);
        if (!accumulatedQuestions.some(existing => isQuestionDuplicate(existing, normF))) {
          accumulatedQuestions.push(normF);
        }
      }
    }

    // Report batch completion to UI progress bar
    if (typeof onBatchProgress === 'function') {
      onBatchProgress(
        b + 1,
        numBatches,
        accumulatedQuestions.length,
        totalCount,
        `Batch ${b + 1} of ${numBatches} completed (${accumulatedQuestions.length}/${totalCount} questions formulated)`
      );
    }

    // Progressive Live Streaming: Notify UI that this batch is ready immediately!
    if (typeof onBatchQuestionsReady === 'function') {
      const isComplete = accumulatedQuestions.length >= totalCount || b === numBatches - 1;
      onBatchQuestionsReady(accumulatedQuestions.slice(0), isComplete, b + 1, numBatches);
    }

    // Small polite pause between batches to prevent any API throttling
    if (b < numBatches - 1 && accumulatedQuestions.length < totalCount) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Final check: Guarantee totalCount is reached
  if (accumulatedQuestions.length < totalCount) {
    const finalDeficit = totalCount - accumulatedQuestions.length;
    const finalBackfill = generateConceptFallbackQuestions(
      finalDeficit,
      formatMode,
      difficulty,
      scopeTitle,
      0, 0, 0,
      targetText,
      accumulatedQuestions.length + 20
    );
    for (const q of finalBackfill) {
      if (accumulatedQuestions.length >= totalCount) break;
      accumulatedQuestions.push(normalizeSingleQuestion(q, formatMode, accumulatedQuestions.length));
    }
  }

  if (typeof onBatchQuestionsReady === 'function') {
    onBatchQuestionsReady(accumulatedQuestions.slice(0, totalCount), true, numBatches, numBatches);
  }

  return accumulatedQuestions.slice(0, totalCount);
}

export async function runMCQGeneratorModal(sel){
  const curPage = sel?.pageNum || window.State?.currentPage || 1;
  const rawText = typeof sel === 'string' ? sel : (sel?.text || '');
  const pageText = (rawText && rawText.trim()) ? rawText.trim() : (typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : `Chapter content on Page ${curPage}`);
  const isTextSelected = Boolean(sel?.isSelection || (rawText && rawText.length < 500 && rawText.trim()));
  const resolvedSel = typeof sel === 'object' && sel !== null ? { ...sel, text: pageText, pageNum: curPage, isSelection: isTextSelected } : { text: pageText, pageNum: curPage, isSelection: isTextSelected };

  const doc = window.State?.currentDoc;
  const numPages = window.State?.numPages || 1;

  // Retrieve chapters if available
  let chapterList = [];
  if (doc && typeof window.getChapterList === 'function') {
    try {
      chapterList = await window.getChapterList(doc);
    } catch(e) {
      console.warn('Error loading chapter list for quiz:', e);
    }
  }

  // Initial Scope: Default to Entire Chapter first unless a text passage was specifically selected
  let selectedScope = isTextSelected ? 'page' : 'chapter';
  let selectedChapterIndex = 0;

  if (chapterList.length > 0) {
    const matchIdx = chapterList.findIndex(ch => curPage >= ch.startPage && curPage <= ch.endPage);
    if (matchIdx >= 0) selectedChapterIndex = matchIdx;
  }

  let rangeStart = chapterList.length > 0 && chapterList[selectedChapterIndex] ? chapterList[selectedChapterIndex].startPage : curPage;
  let rangeEnd = chapterList.length > 0 && chapterList[selectedChapterIndex] ? chapterList[selectedChapterIndex].endPage : Math.min(curPage + 5, numPages);

  let selectedCount = 10; // High-yield chapter test standard
  let selectedDiff = 'Medium';

  function renderScopeDetailsHtml() {
    if (selectedScope === 'chapter') {
      if (chapterList.length > 0) {
        const curCh = chapterList[selectedChapterIndex] || chapterList[0];
        return `
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <label style="font-size:12px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
                <span>📖 Select Chapter to Test:</span>
              </label>
              <span id="mcq-ch-pages-badge" class="badge badge-accent font-mono" style="font-size:11px; font-weight:700;">
                ${curCh.pageCount} ${curCh.pageCount === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <select id="mcq-chapter-dropdown" style="width:100%; padding:9px 12px; font-size:13px; font-weight:600; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; color:var(--text); outline:none;">
              ${chapterList.map((ch, i) => `
                <option value="${i}" ${i === selectedChapterIndex ? 'selected' : ''}>
                  ${window.escapeHtml(ch.label)}
                </option>
              `).join('')}
            </select>
            <div style="font-size:11.5px; color:var(--text-dim); display:flex; align-items:center; gap:4px; margin-top:2px;">
              <span>⚡ Full-lesson coverage: formulated in sequential 5-question batches.</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <label style="font-size:12px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
                <span>📖 Full Document Coverage:</span>
              </label>
              <span id="mcq-ch-pages-badge" class="badge badge-accent font-mono" style="font-size:11px; font-weight:700;">
                ${numPages} ${numPages === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <div style="font-size:11.5px; color:var(--text-dim); line-height:1.45; background:var(--bg-elev); padding:8px 10px; border-radius:6px; border:1px solid var(--border);">
              Covering the entire document (Pages 1–${numPages}) in sequential 5-question batches.
            </div>
          </div>
        `;
      }
    } else if (selectedScope === 'range') {
      const pageSpan = Math.max(1, rangeEnd - rangeStart + 1);
      return `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <label style="font-size:12px; font-weight:700; color:var(--text);">📑 Custom Page Range Coverage:</label>
            <span id="mcq-range-count-badge" class="badge badge-accent font-mono" style="font-size:11px; font-weight:700;">
              ${pageSpan} ${pageSpan === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center;">
            <div>
              <span style="font-size:10.5px; color:var(--text-dim); display:block; margin-bottom:2px;">From Page:</span>
              <input type="number" id="mcq-range-start-input" min="1" max="${numPages}" value="${rangeStart}" style="width:100%; padding:8px 10px; font-size:13px; font-weight:600; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; color:var(--text); text-align:center; outline:none;" />
            </div>
            <span style="color:var(--text-dim); font-size:13px; font-weight:600; margin-top:14px;">to</span>
            <div>
              <span style="font-size:10.5px; color:var(--text-dim); display:block; margin-bottom:2px;">To Page:</span>
              <input type="number" id="mcq-range-end-input" min="1" max="${numPages}" value="${rangeEnd}" style="width:100%; padding:8px 10px; font-size:13px; font-weight:600; background:var(--bg-elev); border:1px solid var(--border); border-radius:6px; color:var(--text); text-align:center; outline:none;" />
            </div>
          </div>
        </div>
      `;
    } else {
      // Single Page Scope
      return `
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:12px; font-weight:700; color:var(--text);">
              📄 ${resolvedSel.isSelection ? 'Selected Text Passage' : `Current Page (Page ${curPage} of ${numPages})`}
            </span>
            <span class="badge badge-subtle font-mono" style="font-size:10.5px; font-weight:600;">1 page</span>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); line-height:1.45; max-height:42px; overflow:hidden; text-overflow:ellipsis; font-style:italic;">
            "${window.escapeHtml(resolvedSel.text.slice(0, 110))}${resolvedSel.text.length > 110 ? '…' : ''}"
          </div>
        </div>
      `;
    }
  }

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div class="font-display" style="font-size:18px; font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:8px; color:var(--text);">
        ${window.icon('help','icon icon-sm')} MCQ & Chapter Quiz Generator
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">
        Board Exam standard practice papers, analytical questions, and structured marking keys.
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
        <!-- Scope Selector: Entire Chapter FIRST, then Current Page, then Custom Range -->
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:6px;">
            Quiz Scope & Content Source
          </label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;" id="mcq-scope-group">
            <button class="btn ${selectedScope === 'chapter' ? 'btn-primary' : 'btn-ghost'} mcq-scope-btn" data-scope="chapter" style="padding:8px 4px; font-size:12px; font-weight:600;">
              📖 Entire Chapter
            </button>
            <button class="btn ${selectedScope === 'page' ? 'btn-primary' : 'btn-ghost'} mcq-scope-btn" data-scope="page" style="padding:8px 4px; font-size:12px; font-weight:600;">
              📄 Current Page
            </button>
            <button class="btn ${selectedScope === 'range' ? 'btn-primary' : 'btn-ghost'} mcq-scope-btn" data-scope="range" style="padding:8px 4px; font-size:12px; font-weight:600;">
              📑 Custom Range
            </button>
          </div>
        </div>

        <!-- Scope Dynamic Controls -->
        <div id="mcq-scope-details" style="background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:10px 12px;">
          ${renderScopeDetailsHtml()}
        </div>

        <!-- Question Format Selection -->
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:6px;">Question Format</label>
          <select id="mcq-type-select" style="width:100%; padding:10px 12px; font-size:13.5px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text); outline:none;">
            <option value="Multiple Choice (4 Options)" selected>Multiple Choice (4 Options A, B, C, D)</option>
            <option value="Assertion & Reasoning">Assertion & Reasoning (Exam Standard)</option>
            <option value="Board Theory & Subjective Paper (Short, Medium & Long Answers)">Board Theory & Subjective Paper (Short, Medium & Long Answers)</option>
            <option value="Fill in the Blanks">Fill in the Blanks (Key Terms & Definitions)</option>
            <option value="True / False">True / False (Fact Verification)</option>
          </select>
        </div>

        <!-- Question Count Selector -->
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <label style="font-size:12px; font-weight:700; color:var(--text-dim);">Number of Questions</label>
            <span id="mcq-count-indicator" class="badge badge-subtle font-mono" style="font-size:11px; font-weight:700;">${selectedCount} Questions</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px;" id="mcq-count-group">
            <button class="btn ${selectedCount === 5 ? 'btn-primary' : 'btn-ghost'} mcq-cnt-btn" data-cnt="5" style="padding:8px 4px; font-size:12.5px; font-weight:600;">5</button>
            <button class="btn ${selectedCount === 10 ? 'btn-primary' : 'btn-ghost'} mcq-cnt-btn" data-cnt="10" style="padding:8px 4px; font-size:12.5px; font-weight:600;">10</button>
            <button class="btn ${selectedCount === 15 ? 'btn-primary' : 'btn-ghost'} mcq-cnt-btn" data-cnt="15" style="padding:8px 4px; font-size:12.5px; font-weight:600;">15</button>
            <button class="btn ${selectedCount === 20 ? 'btn-primary' : 'btn-ghost'} mcq-cnt-btn" data-cnt="20" style="padding:8px 4px; font-size:12.5px; font-weight:600;">20</button>
            <button class="btn ${selectedCount === 25 ? 'btn-primary' : 'btn-ghost'} mcq-cnt-btn" data-cnt="25" style="padding:8px 4px; font-size:12.5px; font-weight:600;">25</button>
          </div>
          <div id="mcq-tier-breakdown-hint" style="font-size:11.5px; color:var(--accent); font-weight:600; margin-top:6px; line-height:1.4;"></div>
        </div>

        <!-- Difficulty Level -->
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:6px;">Difficulty Level</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;" id="mcq-diff-group">
            <button class="btn btn-ghost mcq-diff-btn" data-diff="Easy" style="padding:8px; font-size:12.5px;">Easy</button>
            <button class="btn btn-primary mcq-diff-btn" data-diff="Medium" style="padding:8px; font-size:12.5px;">Medium</button>
            <button class="btn btn-ghost mcq-diff-btn" data-diff="Hard" style="padding:8px; font-size:12.5px;">Hard</button>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" id="start-mcq-gen" style="width:100%; padding:13px; font-size:14px; font-weight:700;">
        ⚡ Generate High-Yield Quiz
      </button>

      <div id="mcq-interactive-container" style="margin-top:16px;"></div>
    </div>
  `);

  function bindScopeEvents() {
    const scopeContainer = document.getElementById('mcq-scope-details');
    if (!scopeContainer) return;

    if (selectedScope === 'chapter') {
      const drop = document.getElementById('mcq-chapter-dropdown');
      if (drop) {
        drop.onchange = () => {
          selectedChapterIndex = Number(drop.value);
          const ch = chapterList[selectedChapterIndex];
          if (ch) {
            rangeStart = ch.startPage;
            rangeEnd = ch.endPage;
            const badge = document.getElementById('mcq-ch-pages-badge');
            if (badge) badge.textContent = `${ch.pageCount} ${ch.pageCount === 1 ? 'page' : 'pages'}`;
          }
        };
        if (typeof window.enhanceSelect === 'function') {
          window.enhanceSelect(drop);
        }
      }
      const switchBtn = document.getElementById('mcq-switch-to-range');
      if (switchBtn) {
        switchBtn.onclick = () => {
          setScope('range');
        };
      }
    } else if (selectedScope === 'range') {
      const startInp = document.getElementById('mcq-range-start-input');
      const endInp = document.getElementById('mcq-range-end-input');
      const badge = document.getElementById('mcq-range-count-badge');

      function updateRange() {
        if (!startInp || !endInp) return;
        const s = Math.max(1, Math.min(Number(startInp.value) || 1, numPages));
        const e = Math.max(s, Math.min(Number(endInp.value) || s, numPages));
        rangeStart = s;
        rangeEnd = e;
        if (badge) {
          const span = e - s + 1;
          badge.textContent = `${span} ${span === 1 ? 'page' : 'pages'}`;
        }
      }

      if (startInp) startInp.oninput = updateRange;
      if (endInp) endInp.oninput = updateRange;
    }
  }

  function setScope(newScope) {
    selectedScope = newScope;
    document.querySelectorAll('.mcq-scope-btn').forEach(b => {
      b.className = (b.dataset.scope === selectedScope) ? 'btn btn-primary mcq-scope-btn' : 'btn btn-ghost mcq-scope-btn';
    });
    const scopeDetails = document.getElementById('mcq-scope-details');
    if (scopeDetails) {
      scopeDetails.innerHTML = renderScopeDetailsHtml();
      bindScopeEvents();
    }
  }

  // Bind Scope Tabs
  document.querySelectorAll('.mcq-scope-btn').forEach(btn => {
    btn.onclick = () => {
      setScope(btn.dataset.scope);
    };
  });
  bindScopeEvents();

  const typeSelect = document.getElementById('mcq-type-select');
  if (typeSelect && typeof window.enhanceSelect === 'function') {
    window.enhanceSelect(typeSelect);
  }
  const breakdownHint = document.getElementById('mcq-tier-breakdown-hint');

  function updateTierBreakdownHint() {
    if (!breakdownHint) return;
    const currentType = typeSelect ? typeSelect.value : '';
    const isSubj = currentType.includes('Board Theory') || currentType.includes('Subjective') || currentType.includes('Short Answer');
    if (isSubj) {
      const dist = getSubjectiveDistribution(selectedCount);
      breakdownHint.style.display = 'block';
      breakdownHint.innerHTML = `📋 <strong>Paper Structure:</strong> ${dist.short} Short (2M) · ${dist.medium} Medium (3-4M) · ${dist.long} Long (5-6M)`;
    } else {
      const bCount = Math.max(1, Math.ceil(selectedCount / 5));
      breakdownHint.style.display = 'block';
      breakdownHint.innerHTML = `⚡ <strong>Sequential Execution:</strong> ${bCount} sequential 5-question batch${bCount > 1 ? 'es' : ''} with anti-repetition filter.`;
    }
  }

  if (typeSelect) {
    typeSelect.onchange = updateTierBreakdownHint;
  }

  // Question Count Buttons
  const cntBtns = document.querySelectorAll('.mcq-cnt-btn');
  const cntIndicator = document.getElementById('mcq-count-indicator');
  cntBtns.forEach(b => {
    b.onclick = () => {
      cntBtns.forEach(btn => { btn.className = 'btn btn-ghost mcq-cnt-btn'; });
      b.className = 'btn btn-primary mcq-cnt-btn';
      selectedCount = Number(b.dataset.cnt);
      if (cntIndicator) cntIndicator.textContent = `${selectedCount} Questions`;
      updateTierBreakdownHint();
    };
  });
  updateTierBreakdownHint();

  // Difficulty Level Buttons
  const diffBtns = document.querySelectorAll('.mcq-diff-btn');
  diffBtns.forEach(b => {
    b.onclick = () => {
      diffBtns.forEach(btn => { btn.className = 'btn btn-ghost mcq-diff-btn'; });
      b.className = 'btn btn-primary mcq-diff-btn';
      selectedDiff = b.dataset.diff;
    };
  });

  // Start Generation
  document.getElementById('start-mcq-gen').onclick = async () => {
    const rawQType = document.getElementById('mcq-type-select').value;
    const container = document.getElementById('mcq-interactive-container');

    let targetText = '';
    let scopeTitle = '';
    let targetPage = curPage;

    if (selectedScope === 'chapter' && chapterList.length > 0) {
      const ch = chapterList[selectedChapterIndex];
      scopeTitle = ch.label;
      targetPage = ch.startPage;

      container.innerHTML = `
        <div style="padding:24px 0; text-align:center; color:var(--text-dim);">
          <div class="spinner-sm" style="width:24px; height:24px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.6s linear infinite; margin:0 auto 12px;"></div>
          <div style="font-size:14.5px; font-weight:700; color:var(--text); margin-bottom:4px;">Aggregating Chapter Content (${ch.title})…</div>
          <div id="mcq-extract-status" style="font-size:12px; color:var(--text-dim);">Scanning pages ${ch.startPage} to ${ch.endPage}…</div>
        </div>
      `;

      targetText = await extractRangeText(doc, ch.startPage, ch.endPage, (curPg, s, e) => {
        const el = document.getElementById('mcq-extract-status');
        if (el) el.textContent = `Extracting page ${curPg} of ${e}…`;
      });
    } else if (selectedScope === 'range') {
      const s = Math.max(1, Math.min(rangeStart, numPages));
      const e = Math.max(s, Math.min(rangeEnd, numPages));
      scopeTitle = `Pages ${s}–${e}`;
      targetPage = s;

      container.innerHTML = `
        <div style="padding:24px 0; text-align:center; color:var(--text-dim);">
          <div class="spinner-sm" style="width:24px; height:24px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.6s linear infinite; margin:0 auto 12px;"></div>
          <div style="font-size:14.5px; font-weight:700; color:var(--text); margin-bottom:4px;">Aggregating Multi-Page Range…</div>
          <div id="mcq-extract-status" style="font-size:12px; color:var(--text-dim);">Extracting pages ${s} to ${e}…</div>
        </div>
      `;

      targetText = await extractRangeText(doc, s, e, (curPg, start, end) => {
        const el = document.getElementById('mcq-extract-status');
        if (el) el.textContent = `Extracting page ${curPg} of ${end}…`;
      });
    } else {
      scopeTitle = resolvedSel.isSelection ? `Selected Passage (p. ${curPage})` : `Page ${curPage}`;
      targetPage = curPage;
      targetText = resolvedSel.text;
    }

    if (!targetText || !targetText.trim()) {
      targetText = resolvedSel.text || `Chapter content on Page ${curPage}`;
    }

    // Map format type
    let formatMode = 'mcq';
    if (rawQType.includes('Board Theory') || rawQType.includes('Subjective') || rawQType.includes('Short Answer')) {
      formatMode = 'subjective';
    } else if (rawQType.includes('Fill in the Blanks')) {
      formatMode = 'fill_blank';
    } else if (rawQType.includes('True / False') || rawQType.includes('True/False')) {
      formatMode = 'true_false';
    } else if (rawQType.includes('Assertion')) {
      formatMode = 'assertion_reasoning';
    } else {
      formatMode = 'mcq';
    }

    const totalBatchesNeeded = Math.max(1, Math.ceil(selectedCount / 5));

    container.innerHTML = `
      <div style="padding:22px 0; text-align:center;">
        <div style="width:100%; max-width:300px; height:8px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; margin:0 auto 12px; overflow:hidden;">
          <div id="mcq-batch-progress" style="width:15%; height:100%; background:var(--accent); transition:width 0.3s ease;"></div>
        </div>
        <div id="mcq-status-title" style="font-size:14.5px; font-weight:700; color:var(--text); margin-bottom:4px;">
          Synthesizing ${selectedCount} Board-Level Questions (${selectedDiff})…
        </div>
        <div id="mcq-status-sub" style="font-size:12px; color:var(--text-dim);">
          Formulating high-yield 5-question batches sequentially across ${scopeTitle}…
        </div>
      </div>
    `;

    let questions = [];
    let isComplete = false;
    let currentBatchNum = 0;
    let totalBatchNum = totalBatchesNeeded;
    let userAnswers = {};
    let checked = false;

    try {
      function normalizeAnswer(str) {
        if (!str) return '';
        return String(str)
          .toLowerCase()
          .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '')
          .replace(/^(the|a|an)\s+/i, '')
          .trim();
      }

      function isFillBlankCorrect(userText, qObj) {
        if (!userText || !userText.trim()) return false;
        const normUser = normalizeAnswer(userText);
        const normCorrect = normalizeAnswer(qObj.correctAnswer);
        if (normUser === normCorrect) return true;
        if (Array.isArray(qObj.acceptedAnswers)) {
          return qObj.acceptedAnswers.some(ans => normalizeAnswer(ans) === normUser);
        }
        return false;
      }

      function renderQuiz() {
        let isSubj = formatMode === 'subjective';
        let correctScore = 0;
        let totalAchievableMarks = 0;

        questions.forEach((q, idx) => {
          const qMarks = q.marks || (q.tier === 'long' ? 6 : (q.tier === 'medium' ? 4 : (isSubj ? 2 : 1)));
          totalAchievableMarks += qMarks;

          const ans = userAnswers[idx];
          if (!ans) return;

          if (isSubj) {
            if (ans.marksScored !== undefined) {
              correctScore += ans.marksScored;
            } else if (ans.text && ans.text.trim().length > 15) {
              correctScore += qMarks;
            }
          } else if (q.type === 'fill_blank') {
            if (ans.isCorrect) correctScore += 1;
          } else {
            if (ans.isCorrect) correctScore += 1;
          }
        });

        const scorePct = totalAchievableMarks > 0 ? Math.round((correctScore / totalAchievableMarks) * 100) : 0;
        const badgeColor = scorePct >= 70 ? 'badge-accent' : (scorePct >= 40 ? 'badge-warning' : 'badge-danger');

        let formatTitle = rawQType;
        if (formatMode === 'subjective') formatTitle = 'Board Theory & Subjective';
        else if (formatMode === 'fill_blank') formatTitle = 'Fill in the Blanks';
        else if (formatMode === 'true_false') formatTitle = 'True / False';
        else if (formatMode === 'assertion_reasoning') formatTitle = 'Assertion & Reasoning';
        else formatTitle = 'Multiple Choice';

        let html = `
          <div style="border-top:1px solid var(--border); padding-top:14px; margin-top:12px;">
            <div style="font-size:14.5px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                <span class="badge badge-accent" style="font-size:11.5px; font-weight:700;">${formatTitle}</span>
                <span class="badge badge-subtle font-mono" style="font-size:11px; font-weight:600;">${scopeTitle}</span>
                <span style="color:var(--text-dim); font-size:12px;">• ${questions.length} Qs • ${selectedDiff}</span>
              </div>
              ${checked ? `
                <span class="badge ${badgeColor}" style="font-size:12.5px; font-weight:700; padding:4px 10px;">
                  Score: ${correctScore} / ${totalAchievableMarks} Marks (${scorePct}%)
                </span>
              ` : ''}
            </div>

            <div id="mcq-questions-scroll-list" style="display:flex; flex-direction:column; gap:16px; max-height:50vh; overflow-y:auto; padding-right:4px; scrollbar-width:none; -ms-overflow-style:none;">
        `;

        questions.forEach((q, idx) => {
          const userAns = userAnswers[idx];
          const isFill = q.type === 'fill_blank' || formatMode === 'fill_blank';
          const isTF = q.type === 'true_false' || formatMode === 'true_false';
          const isSubjective = q.type === 'subjective' || formatMode === 'subjective' || q.tier;
          const isAR = q.type === 'assertion_reasoning' || formatMode === 'assertion_reasoning';
          const hasOptions = Array.isArray(q.options) && q.options.length > 0;

          const qTier = q.tier || (q.marks >= 5 ? 'long' : (q.marks >= 3 ? 'medium' : 'short'));
          const qMarks = q.marks || (qTier === 'long' ? 6 : (qTier === 'medium' ? 4 : 2));

          let tierBadgeStyle = 'color:var(--accent); background:rgba(47, 198, 188, 0.1); border:1px solid var(--accent);';
          let tierLabel = `2 MARKS • SHORT`;
          if (qTier === 'long' || qMarks >= 5) {
            tierBadgeStyle = 'color:#a855f7; background:rgba(168, 85, 247, 0.1); border:1px solid #a855f7;';
            tierLabel = `5-6 MARKS • LONG ANSWER`;
          } else if (qTier === 'medium' || qMarks >= 3) {
            tierBadgeStyle = 'color:#f59e0b; background:rgba(245, 158, 11, 0.1); border:1px solid #f59e0b;';
            tierLabel = `3-4 MARKS • MEDIUM ANSWER`;
          }

          let questionContentHtml = '';
          if (isAR) {
            let aText = q.assertion || '';
            let rText = q.reason || '';
            if (!aText || !rText) {
              const fullQ = q.question || '';
              const matchA = fullQ.match(/Assertion\s*(?:\([A-Za-z0-9]\))?[:\-–—]?\s*([\s\S]+?)(?=Reason\s*(?:\([A-Za-z0-9]\))?[:\-–—]|$)/i);
              const matchR = fullQ.match(/Reason\s*(?:\([A-Za-z0-9]\))?[:\-–—]?\s*([\s\S]+)$/i);
              if (matchA && matchA[1] && matchA[1].trim()) aText = matchA[1].trim();
              if (matchR && matchR[1] && matchR[1].trim()) rText = matchR[1].trim();
              if (!aText) aText = fullQ.trim() || "The critical interaction described in this section precipitates the central dilemma.";
              if (!rText) rText = (q.explanation && q.explanation.trim()) ? q.explanation.trim() : "The characters' underlying motivations and lack of prudent foresight dictate the consequential outcomes.";
            }

            questionContentHtml = `
              <div style="display:flex; flex-direction:column; gap:8px;">
                <div style="background:var(--bg-elev); border-left:3.5px solid var(--accent); padding:10px 12px; border-radius:6px;">
                  <span style="display:block; font-size:11px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">Assertion (A)</span>
                  <div style="font-size:13.5px; font-weight:600; color:var(--text); line-height:1.5;">${window.escapeHtml(aText)}</div>
                </div>
                <div style="background:var(--bg-elev); border-left:3.5px solid #a855f7; padding:10px 12px; border-radius:6px;">
                  <span style="display:block; font-size:11px; font-weight:800; color:#a855f7; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px;">Reason (R)</span>
                  <div style="font-size:13.5px; font-weight:600; color:var(--text); line-height:1.5;">${window.escapeHtml(rText)}</div>
                </div>
              </div>
            `;
          } else if (isFill) {
            const safeQ = (q.question || '').replace(/_______/g, '<span style="color:var(--accent); font-weight:800; background:var(--accent-soft); padding:1px 8px; border-radius:4px; border-bottom:2px solid var(--accent); margin:0 4px;">_______</span>');
            questionContentHtml = `<div style="font-size:14px; font-weight:600; color:var(--text); line-height:1.55;">${safeQ}</div>`;
          } else {
            questionContentHtml = `<div style="font-size:14px; font-weight:600; color:var(--text); line-height:1.55;">${window.escapeHtml(q.question || '').replace(/\n/g, '<br/>')}</div>`;
          }

          html += `
            <div class="mcq-question-card" data-q-card="${idx}" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:14px;">
              <!-- Top Metadata Row: Q Number on Left, Marks & Type Badge on Right (Full width, no cramping!) -->
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border);">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:14px; font-weight:800; color:var(--accent); font-family:monospace;">Q${idx + 1}.</span>
                  ${isSubjective ? `
                    <span style="font-size:10.5px; font-weight:800; padding:2px 8px; border-radius:4px; letter-spacing:0.3px; ${tierBadgeStyle}">
                      ${tierLabel}
                    </span>
                  ` : `
                    <span style="font-size:10.5px; font-weight:700; color:var(--text-dim); background:var(--bg-elev); padding:2px 8px; border-radius:4px; border:1px solid var(--border); white-space:nowrap;">
                      ${isAR ? 'Assertion & Reason' : (isFill ? 'Fill in Blank' : (isTF ? 'True / False' : 'Multiple Choice'))}
                    </span>
                  `}
                </div>
                ${isSubjective ? `
                  <span style="font-size:11.5px; color:var(--text-dim); font-style:italic; font-weight:600;">
                    ${q.wordLimit || (qTier === 'long' ? '100-120 words' : (qTier === 'medium' ? '60-80 words' : '30-40 words'))}
                  </span>
                ` : ''}
              </div>

              <!-- Full-width question prompt container (Never squeezed against the badge!) -->
              <div style="margin-bottom:12px;">
                ${questionContentHtml}
              </div>
          `;

          // 1. BOARD THEORY & SUBJECTIVE UI
          if (isSubjective) {
            const val = userAns ? (userAns.text || '') : '';
            const rowsCount = qTier === 'long' ? 5 : (qTier === 'medium' ? 4 : 2);
            html += `
              <div style="margin-top:8px;">
                <textarea class="q-subjective-input" data-q="${idx}" rows="${rowsCount}" placeholder="Draft your answer here according to the word limit (${q.wordLimit || '30-40 words'})…" style="width:100%; padding:10px 12px; font-size:13px; line-height:1.45; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text); resize:vertical; outline:none;" ${checked ? 'disabled' : ''}>${window.escapeHtml(val)}</textarea>
              </div>
            `;

            if (checked) {
              const currentMarks = userAns ? (userAns.marksScored !== undefined ? userAns.marksScored : (val.trim().length > 15 ? qMarks : 0)) : 0;
              const fullMarks = qMarks;
              const halfMarks = Math.max(1, Math.round(qMarks / 2));

              html += `
                <div style="margin-top:10px; font-size:12.5px; line-height:1.55; color:var(--text); background:var(--bg-elev); border:1px solid var(--border); padding:10px 12px; border-radius:8px;">
                  <div style="color:var(--teal); font-weight:700; margin-bottom:4px;">
                    🎯 Official Board Model Answer:
                  </div>
                  <div style="color:var(--text); font-weight:600; margin-bottom:8px; background:rgba(47, 198, 188, 0.08); padding:8px 10px; border-radius:6px; border-left:3px solid var(--teal);">
                    ${window.escapeHtml(q.correctAnswer || q.explanation)}
                  </div>
                  ${Array.isArray(q.keyPoints) && q.keyPoints.length ? `
                    <div style="margin-bottom:6px;">
                      <strong style="color:var(--accent);">🔑 Essential Marking Scheme Points:</strong>
                      <ul style="margin:4px 0 0 16px; padding:0;">
                        ${q.keyPoints.map(kp => `<li>${window.escapeHtml(kp)}</li>`).join('')}
                      </ul>
                    </div>
                  ` : ''}
                  <div style="margin-bottom:6px;"><strong style="color:var(--text-dim);">💡 Marking Criteria & Logic:</strong> ${window.escapeHtml(q.explanation || '')}</div>
                  ${q.examTrap ? `<div style="color:#e05314; font-size:11.5px; margin-top:4px;"><strong>⚠️ Common Board Exam Trap:</strong> ${window.escapeHtml(q.examTrap)}</div>` : ''}

                  <div style="margin-top:10px; display:flex; align-items:center; justify-content:space-between; border-top:1px dashed var(--border); padding-top:8px; flex-wrap:wrap; gap:6px;">
                    <span style="font-size:11.5px; color:var(--text-dim); font-weight:600;">Self-Evaluate Score:</span>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-ghost self-score-btn" data-q="${idx}" data-score="${fullMarks}" style="padding:4px 8px; font-size:11px; font-weight:700; ${currentMarks === fullMarks ? 'background:var(--teal); color:#fff;' : ''}">
                        ⭐ Full (${fullMarks}/${fullMarks})
                      </button>
                      <button class="btn btn-ghost self-score-btn" data-q="${idx}" data-score="${halfMarks}" style="padding:4px 8px; font-size:11px; font-weight:700; ${currentMarks === halfMarks ? 'background:var(--accent); color:#fff;' : ''}">
                        ½ Partial (${halfMarks}/${fullMarks})
                      </button>
                      <button class="btn btn-ghost self-score-btn" data-q="${idx}" data-score="0" style="padding:4px 8px; font-size:11px; font-weight:700; ${currentMarks === 0 ? 'background:var(--danger); color:#fff;' : ''}">
                        ❌ Revise (0/${fullMarks})
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }
          }

          // 2. FILL IN THE BLANKS UI
          else if (isFill) {
            const val = userAns ? (userAns.text || '') : '';
            const isCorrect = userAns ? userAns.isCorrect : false;
            html += `
              <div style="margin-top:8px;">
                <div style="position:relative; margin-bottom:8px;">
                  <input type="text" class="q-fill-input" data-q="${idx}" value="${window.escapeHtml(val)}" placeholder="Type missing word / phrase…" style="width:100%; padding:11px 14px; font-size:13.5px; font-weight:600; background:var(--bg-elev); border:${checked ? (isCorrect ? '2px solid var(--teal)' : '2px solid var(--danger)') : '1.5px solid var(--border)'}; border-radius:8px; color:var(--text); outline:none; transition:all 0.15s ease;" ${checked ? 'disabled' : ''} />
                </div>
            `;

            if (checked) {
              html += `
                <div style="margin-top:8px; font-size:12.5px; padding:10px 12px; background:${isCorrect ? 'rgba(47, 198, 188, 0.12)' : 'rgba(255, 77, 109, 0.12)'}; border:1px solid ${isCorrect ? 'var(--teal)' : 'var(--danger)'}; border-radius:8px;">
                  <div style="font-weight:700; color:${isCorrect ? 'var(--teal)' : 'var(--danger)'}; margin-bottom:4px;">
                    ${isCorrect ? '✅ Correct!' : `❌ Your Answer: "${window.escapeHtml(val || '(empty)')}"`}
                  </div>
                  <div style="color:var(--text); font-weight:600; margin-bottom:4px;">
                    <strong>Correct Answer:</strong> <span style="color:var(--teal); font-weight:700;">${window.escapeHtml(q.correctAnswer)}</span>
                  </div>
                  <div style="color:var(--text-dim); font-size:12px; margin-top:4px;">
                    <strong>💡 Logic:</strong> ${window.escapeHtml(q.explanation || 'Directly confirmed from the source text.')}
                  </div>
                  ${q.examTrap ? `<div style="color:#e05314; font-size:11.5px; margin-top:4px;"><strong>⚠️ Exam Trap:</strong> ${window.escapeHtml(q.examTrap)}</div>` : ''}
                </div>
              `;
            }
            html += `</div>`;
          }

          // 3. TRUE / FALSE UI
          else if (isTF) {
            const opts = q.options && q.options.length === 2 ? q.options : ['True', 'False'];
            html += `<div class="mcq-opts-group" data-q-opts="${idx}" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">`;
            opts.forEach((opt, oIdx) => {
              let btnStyle = `background:var(--bg-elev); border:1px solid var(--border); color:var(--text); text-align:center; padding:10px; font-size:13.5px; font-weight:600; border-radius:8px; cursor:pointer; transition:all .15s ease;`;
              if (userAns && userAns.selectedIndex === oIdx) {
                btnStyle = `background:var(--accent-soft); border:2px solid var(--accent); color:var(--accent); text-align:center; padding:10px; font-size:13.5px; font-weight:700; border-radius:8px; cursor:pointer;`;
              }
              if (checked) {
                if (oIdx === q.correctIndex) {
                  btnStyle = `background:rgba(47, 198, 188, 0.2); border:2px solid var(--teal); color:var(--teal); text-align:center; padding:10px; font-size:13.5px; font-weight:700; border-radius:8px;`;
                } else if (userAns && userAns.selectedIndex === oIdx && !userAns.isCorrect) {
                  btnStyle = `background:rgba(255, 77, 109, 0.2); border:2px solid var(--danger); color:var(--danger); text-align:center; padding:10px; font-size:13.5px; font-weight:700; border-radius:8px;`;
                }
              }
              const icon = opt.toLowerCase() === 'true' ? '✓' : '✗';
              html += `<button class="opt-btn" data-q="${idx}" data-o="${oIdx}" style="${btnStyle}">
                <span style="font-weight:800; margin-right:4px;">${icon}</span> ${window.escapeHtml(opt)}
              </button>`;
            });
            html += `</div>`;

            if (checked) {
              html += `
                <div style="margin-top:10px; font-size:12.5px; line-height:1.55; color:var(--text); background:var(--bg-elev); border:1px solid var(--border); padding:10px 12px; border-radius:8px;">
                  <div style="color:var(--teal); font-weight:700; margin-bottom:4px;">
                    ✅ Correct Answer: <span style="color:var(--text);">${opts[q.correctIndex] || q.correctAnswer}</span>
                  </div>
                  <div style="margin-bottom:4px;"><strong style="color:var(--accent);">💡 Evidence:</strong> ${window.escapeHtml(q.explanation || 'Verified from the source text.')}</div>
                  ${q.examTrap ? `<div style="color:#e05314; font-size:11.5px; margin-top:4px;"><strong>⚠️ Exam Trap:</strong> ${window.escapeHtml(q.examTrap)}</div>` : ''}
                </div>
              `;
            }
          }

          // 4. MULTIPLE CHOICE & ASSERTION REASONING UI
          else {
            if (hasOptions) {
              html += `<div class="mcq-opts-group" data-q-opts="${idx}" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">`;
              q.options.forEach((opt, oIdx) => {
                let btnStyle = `background:var(--bg-elev); border:1px solid var(--border); color:var(--text); text-align:left; padding:9px 12px; font-size:13px; border-radius:8px; cursor:pointer; line-height:1.4; transition:all .15s ease;`;
                if (userAns && userAns.selectedIndex === oIdx) {
                  btnStyle = `background:var(--accent-soft); border:2px solid var(--accent); color:var(--accent); text-align:left; padding:9px 12px; font-size:13px; border-radius:8px; font-weight:600; cursor:pointer; line-height:1.4;`;
                }
                if (checked) {
                  if (oIdx === q.correctIndex) {
                    btnStyle = `background:rgba(47, 198, 188, 0.2); border:2px solid var(--teal); color:var(--teal); text-align:left; padding:9px 12px; font-size:13px; border-radius:8px; font-weight:700; line-height:1.4;`;
                  } else if (userAns && userAns.selectedIndex === oIdx && !userAns.isCorrect) {
                    btnStyle = `background:rgba(255, 77, 109, 0.2); border:2px solid var(--danger); color:var(--danger); text-align:left; padding:9px 12px; font-size:13px; border-radius:8px; font-weight:600; line-height:1.4;`;
                  }
                }
                html += `<button class="opt-btn" data-q="${idx}" data-o="${oIdx}" style="${btnStyle}">
                  <span style="font-weight:700; margin-right:6px;">${String.fromCharCode(65 + oIdx)}.</span> ${window.escapeHtml(opt)}
                </button>`;
              });
              html += `</div>`;
            }

            if (checked) {
              html += `
                <div style="margin-top:12px; font-size:12.5px; line-height:1.55; color:var(--text); background:var(--bg-elev); border:1px solid var(--border); padding:10px 12px; border-radius:8px;">
                  <div style="color:var(--teal); font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                    <span>✅ Correct Answer:</span> <span style="color:var(--text); font-weight:600;">${window.escapeHtml(q.options ? q.options[q.correctIndex] : q.correctAnswer)}</span>
                  </div>
                  <div style="margin-bottom:6px;"><strong style="color:var(--accent);">💡 Logic:</strong> ${window.escapeHtml(q.explanation || 'Directly supported by the source text.')}</div>
                  ${q.distractorAnalysis ? `<div style="margin-bottom:6px; color:var(--text-dim);"><strong style="color:var(--text);">❌ Elimination:</strong> ${window.escapeHtml(q.distractorAnalysis)}</div>` : ''}
                  ${q.examTrap ? `<div style="color:#e05314; background:rgba(224, 83, 20, 0.08); padding:6px 8px; border-radius:6px; margin-top:6px;"><strong>⚠️ Exam Trap:</strong> ${window.escapeHtml(q.examTrap)}</div>` : ''}
                </div>
              `;
            }
          }

          html += `</div>`;
        });

        html += `
            </div>
            <div style="display:flex; gap:8px; margin-top:14px;">
              ${!checked ? `
                <button class="btn btn-primary" id="check-quiz-btn" style="flex:1; padding:12px; font-weight:700;">Submit & Check Answers</button>
              ` : `
                <button class="btn btn-ghost" id="retake-quiz-btn" style="flex:1; padding:12px; font-weight:600;">🔄 Retake Quiz</button>
                <button class="btn btn-primary" id="save-quiz-note" style="flex:1.4; padding:12px; font-weight:700;">💾 Save Quiz to Notes</button>
              `}
            </div>
          </div>
        `;

        container.innerHTML = html;

        // Event listener for Option Buttons (MCQ, Assertion/Reason, True/False)
        container.querySelectorAll('.opt-btn').forEach(btn => {
          btn.onclick = (e) => {
            if (checked) return;
            if (e && e.preventDefault) e.preventDefault();
            const qI = Number(btn.dataset.q);
            const oI = Number(btn.dataset.o);
            const qObj = questions[qI];
            userAnswers[qI] = {
              selectedIndex: oI,
              isCorrect: oI === qObj.correctIndex
            };

            const group = container.querySelector(`.mcq-opts-group[data-q-opts="${qI}"]`);
            if (group) {
              group.querySelectorAll('.opt-btn').forEach(b => {
                const curO = Number(b.dataset.o);
                if (curO === oI) {
                  b.style.cssText = 'background:var(--accent-soft); border:2px solid var(--accent); color:var(--accent); text-align:' + (b.style.textAlign || 'left') + '; padding:9px 12px; font-size:13px; border-radius:8px; font-weight:700; cursor:pointer; line-height:1.4;';
                } else {
                  b.style.cssText = 'background:var(--bg-elev); border:1px solid var(--border); color:var(--text); text-align:' + (b.style.textAlign || 'left') + '; padding:9px 12px; font-size:13px; border-radius:8px; cursor:pointer; line-height:1.4;';
                }
              });
            }
          };
        });

        // Event listener for Fill in the Blanks Inputs
        container.querySelectorAll('.q-fill-input').forEach(inp => {
          inp.oninput = () => {
            const qI = Number(inp.dataset.q);
            const qObj = questions[qI];
            const txt = inp.value;
            userAnswers[qI] = {
              text: txt,
              isCorrect: isFillBlankCorrect(txt, qObj)
            };
          };
        });

        // Event listener for Subjective Textareas
        container.querySelectorAll('.q-subjective-input').forEach(inp => {
          inp.oninput = () => {
            const qI = Number(inp.dataset.q);
            const txt = inp.value;
            userAnswers[qI] = {
              ...(userAnswers[qI] || {}),
              text: txt
            };
          };
        });

        // Event listener for Self Scoring buttons on Subjective Questions
        container.querySelectorAll('.self-score-btn').forEach(b => {
          b.onclick = () => {
            const qI = Number(b.dataset.q);
            const scoreVal = Number(b.dataset.score);
            userAnswers[qI] = {
              ...(userAnswers[qI] || {}),
              marksScored: scoreVal
            };
            const scrollDiv = container.querySelector('#mcq-questions-scroll-list');
            const savedInnerScroll = scrollDiv ? scrollDiv.scrollTop : 0;
            renderQuiz();
            const newScrollDiv = container.querySelector('#mcq-questions-scroll-list');
            if (newScrollDiv && savedInnerScroll > 0) newScrollDiv.scrollTop = savedInnerScroll;
          };
        });

        const checkBtn = document.getElementById('check-quiz-btn');
        if (checkBtn) {
          checkBtn.onclick = () => {
            container.querySelectorAll('.q-fill-input').forEach(inp => {
              const qI = Number(inp.dataset.q);
              const qObj = questions[qI];
              const txt = inp.value;
              userAnswers[qI] = {
                text: txt,
                isCorrect: isFillBlankCorrect(txt, qObj)
              };
            });
            container.querySelectorAll('.q-subjective-input').forEach(inp => {
              const qI = Number(inp.dataset.q);
              const qObj = questions[qI];
              const qTier = qObj.tier || (qObj.marks >= 5 ? 'long' : (qObj.marks >= 3 ? 'medium' : 'short'));
              const qMarks = qObj.marks || (qTier === 'long' ? 6 : (qTier === 'medium' ? 4 : 2));
              const txt = inp.value;
              const defaultScore = txt.trim().length > 15 ? qMarks : 0;
              userAnswers[qI] = {
                ...(userAnswers[qI] || {}),
                text: txt,
                marksScored: (userAnswers[qI]?.marksScored !== undefined) ? userAnswers[qI].marksScored : defaultScore
              };
            });

            const scrollDiv = container.querySelector('#mcq-questions-scroll-list');
            const savedInnerScroll = scrollDiv ? scrollDiv.scrollTop : 0;
            const savedSheetScroll = window.Sheet && window.Sheet.body ? window.Sheet.body.scrollTop : 0;
            checked = true;
            renderQuiz();
            requestAnimationFrame(() => {
              const newScrollDiv = container.querySelector('#mcq-questions-scroll-list');
              if (newScrollDiv && savedInnerScroll > 0) newScrollDiv.scrollTop = savedInnerScroll;
              if (window.Sheet && window.Sheet.body && savedSheetScroll > 0) {
                window.Sheet.body.scrollTop = savedSheetScroll;
              }
            });
          };
        }

        const retakeBtn = document.getElementById('retake-quiz-btn');
        if (retakeBtn) {
          retakeBtn.onclick = () => {
            checked = false;
            userAnswers = {};
            renderQuiz();
          };
        }

        const saveBtn = document.getElementById('save-quiz-note');
        if (saveBtn) {
          saveBtn.onclick = async () => {
            const formatted = questions.map((q, i) => {
              const isSubj = q.type === 'subjective' || formatMode === 'subjective' || q.tier;
              if (isSubj) {
                const tier = (q.tier || (q.marks >= 5 ? 'LONG' : (q.marks >= 3 ? 'MEDIUM' : 'SHORT'))).toUpperCase();
                const mks = q.marks || (tier === 'LONG' ? 6 : (tier === 'MEDIUM' ? 4 : 2));
                return `### Q${i + 1} [${mks} MARKS • ${tier}]: ${q.question}\n- **Word Limit**: ${q.wordLimit || (tier === 'LONG' ? '100-120 words' : (tier === 'MEDIUM' ? '60-80 words' : '30-40 words'))}\n- **Model Answer**: ${q.correctAnswer}\n- **Key Marking Points**: ${Array.isArray(q.keyPoints) ? q.keyPoints.join('; ') : ''}\n- **Evaluation Rubric**: ${q.explanation || ''}\n- **Board Exam Trap**: ${q.examTrap || ''}`;
              } else if (q.type === 'fill_blank') {
                return `### Q${i + 1} (Fill in the Blank): ${q.question}\n- **Correct Answer**: ${q.correctAnswer}\n- **Explanation**: ${q.explanation || ''}\n- **Exam Trap**: ${q.examTrap || ''}`;
              } else if (q.type === 'true_false') {
                return `### Q${i + 1} (True/False): ${q.question}\n- **Answer**: ${q.correctAnswer}\n- **Evidence**: ${q.explanation || ''}\n- **Exam Trap**: ${q.examTrap || ''}`;
              } else if (q.type === 'assertion_reasoning' || formatMode === 'assertion_reasoning') {
                return `### Q${i + 1} (Assertion & Reasoning):\n${q.question}\n- **Correct Answer**: ${q.options ? q.options[q.correctIndex] : q.correctAnswer}\n- **Explanation**: ${q.explanation || ''}\n- **Elimination Analysis**: ${q.distractorAnalysis || ''}\n- **Exam Trap**: ${q.examTrap || ''}`;
              } else {
                return `### Q${i + 1} (MCQ): ${q.question}\n- **Options**:\n${q.options ? q.options.map((opt, oi) => `  ${String.fromCharCode(65 + oi)}. ${opt}${oi === q.correctIndex ? ' (Correct)' : ''}`).join('\n') : ''}\n- **Explanation**: ${q.explanation || ''}\n- **Elimination**: ${q.distractorAnalysis || ''}\n- **Exam Trap**: ${q.examTrap || ''}`;
              }
            }).join('\n\n');

            await window.DB.put('notes', {
              id: window.uid(),
              fileId: window.State.currentFile ? window.State.currentFile.id : 'global',
              page: targetPage,
              kind: `${formatTitle} — ${scopeTitle}`,
              content: formatted,
              sourceText: targetText.slice(0, 2500),
              createdAt: Date.now()
            });
            window.toast(`${formatTitle} saved to Notes!`);
            window.Sheet.close();
          };
        }
      }

      let aborted = false;
      const generated = await generateQuizInChunks({
        targetText, scopeTitle, formatMode, rawQType, totalCount: selectedCount, difficulty: selectedDiff, targetPage,
        shouldAbort: () => aborted || !document.getElementById('mcq-interactive-container') || !document.body.contains(container),
        onBatchProgress: (b, n, done, total, label) => {
          const bar = document.getElementById('mcq-batch-progress'); if (bar) bar.style.width = Math.max(8, Math.round((done / Math.max(1, total)) * 100)) + '%';
          const sub = document.getElementById('mcq-status-sub'); if (sub && label) sub.textContent = label;
        },
        onBatchQuestionsReady: (qs) => { questions = qs; }
      });
      if (Array.isArray(generated) && generated.length) questions = generated;
      if (!questions.length) {
        container.innerHTML = `<div style="padding:18px 0; text-align:center; color:var(--text-dim); font-size:13.5px; line-height:1.6;">Could not make questions right now. Check your internet or try again, or choose a page with more text.<div style="margin-top:12px;"><button class="btn btn-primary" id="mcq-retry-btn" style="padding:10px 20px; font-weight:700;">Try again</button></div></div>`;
        const rb = document.getElementById('mcq-retry-btn'); if (rb) rb.onclick = () => document.getElementById('start-mcq-gen')?.click();
        return;
      }

      renderQuiz();

    } catch (err) {
      console.error('Quiz generation error:', err);
      container.innerHTML = `<div style="color:var(--danger); font-size:13px; margin-top:10px;">Failed to generate questions. Please try again.</div>`;
    }
  };
}

export async function runInteractiveFlashcardsModal(sel){
  const pageNum = sel?.pageNum || window.State?.currentPage || 1;
  const rawText = typeof sel === 'string' ? sel : (sel?.text || '');
  const pageText = (rawText && rawText.trim()) ? rawText.trim() : (typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : `Chapter content on Page ${pageNum}`);
  const resolvedSel = typeof sel === 'object' && sel !== null ? { ...sel, text: pageText, pageNum } : { text: pageText, pageNum, isSelection: false };

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div class="font-display" style="font-size:18px; font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:8px; color:var(--text);">
        ${window.icon('cards','icon icon-sm')} Smart Flashcards Generator
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:14px; background:var(--surface-2); padding:8px 10px; border-radius:6px; max-height:48px; overflow:hidden; text-overflow:ellipsis;">
        "${window.escapeHtml((resolvedSel?.text || '').slice(0, 110))}${(resolvedSel?.text || '').length > 110 ? '…' : ''}"
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:6px;">Number of Flashcards</label>
          <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px;" id="fc-count-group">
            <button class="btn btn-ghost fc-cnt-btn" data-cnt="3" style="padding:8px 4px; font-size:12.5px; font-weight:600;">3</button>
            <button class="btn btn-primary fc-cnt-btn" data-cnt="5" style="padding:8px 4px; font-size:12.5px; font-weight:600;">5</button>
            <button class="btn btn-ghost fc-cnt-btn" data-cnt="10" style="padding:8px 4px; font-size:12.5px; font-weight:600;">10</button>
            <button class="btn btn-ghost fc-cnt-btn" data-cnt="15" style="padding:8px 4px; font-size:12.5px; font-weight:600;">15</button>
            <button class="btn btn-ghost fc-cnt-btn" data-cnt="20" style="padding:8px 4px; font-size:12.5px; font-weight:600;">20</button>
          </div>
        </div>

        <div>
          <label style="font-size:12px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:6px;">Flashcard Study Focus</label>
          <select id="fc-focus-select" style="width:100%; padding:10px 12px; font-size:13.5px; background:var(--surface-2); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--text);">
            <option value="Core Concepts & Definitions">Core Concepts & Definitions</option>
            <option value="Exam Key Facts, Thinkers & Dates">Exam Key Facts, Thinkers & Dates</option>
            <option value="High-Yield Q&A Recall">High-Yield Q&A Recall</option>
            <option value="Cause & Effect Relationships">Cause & Effect Relationships</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary" id="start-fc-gen" style="width:100%; padding:13px; font-size:14px; font-weight:700;">
        ⚡ Generate Smart Flashcards
      </button>

      <div id="flashcards-loader" style="display:none; margin-top:16px;">
        <div style="padding:16px 0; text-align:center; color:var(--text-dim);">
          <div class="spinner-sm" style="width:20px; height:20px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.6s linear infinite; margin:0 auto 12px;"></div>
          <div style="font-size:13.5px; font-weight:600; color:var(--text);">Generating high-yield active recall flashcards…</div>
        </div>
      </div>
      <div id="flashcards-deck-container" style="margin-top:16px;"></div>
    </div>
  `);

  let selectedCount = 5;
  const cntBtns = document.querySelectorAll('.fc-cnt-btn');
  cntBtns.forEach(b => {
    b.onclick = () => {
      cntBtns.forEach(btn => { btn.className = 'btn btn-ghost fc-cnt-btn'; });
      b.className = 'btn btn-primary fc-cnt-btn';
      selectedCount = Number(b.dataset.cnt);
    };
  });

  document.getElementById('start-fc-gen').onclick = async () => {
    const focusType = document.getElementById('fc-focus-select').value;
    const loader = document.getElementById('flashcards-loader');
    const deckContainer = document.getElementById('flashcards-deck-container');
    loader.style.display = 'block';
    deckContainer.innerHTML = '';

    const prompt = `You are a master of active recall & spaced repetition. Create exactly ${selectedCount} high-yield flashcards focused on "${focusType}" from this text:

"""${sel.text}"""

OUTPUT REQUIREMENT:
Return ONLY a valid JSON array of objects with no markdown block fences or conversational text.
Format:
[
  {
    "category": "Key Concept / Theme Tag",
    "front": "Clear, direct active-recall question or prompt",
    "back": "Precise, complete answer with bold key terms",
    "context": "1-sentence why this is crucial / practical context",
    "trick": "Short memory hook or mnemonic trick"
  }
]`;

    try {
      let cards = [];
      try {
        const rawRes = await callAI(prompt, 'flashcards', sel.text, false, pageNum);
        const cleanJson = (rawRes || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const match = cleanJson.match(/\[[\s\S]*\]/);
        if (match) {
          cards = JSON.parse(match[0]);
        } else if (cleanJson.startsWith('[') && cleanJson.endsWith(']')) {
          cards = JSON.parse(cleanJson);
        } else if (window.parseFlashcardsText) {
          cards = window.parseFlashcardsText(rawRes);
        }
      } catch(e) {
        console.warn('Flashcard parse attempt fallback:', e.message);
      }

      // Robust fallback if AI or JSON parsing was empty
      if (!Array.isArray(cards) || !cards.length) {
        const sentences = (sel.text || '').split(/(?<=[.?!])\s+/).filter(s => s.length > 15);
        cards = sentences.slice(0, selectedCount).map((s, idx) => {
          const words = s.split(' ');
          const term = words.slice(0, 4).join(' ');
          return {
            category: "Core Concept",
            front: `What is the core principle behind ${term}?`,
            back: s,
            context: `Foundational knowledge on Page ${pageNum}.`,
            trick: `Link ${term} to fundamental subject principles.`
          };
        });
      }

      if (!cards.length) {
        cards = [{
          category: "Overview",
          front: "What is the key takeaway of this selected passage?",
          back: sel.text,
          context: "Direct reading excerpt.",
          trick: "Active recall of chapter themes."
        }];
      }

      loader.style.display = 'none';

      let currentCardIdx = 0;
      let isFlipped = false;
      let userRatings = {};

      function renderCardDeck() {
        const card = cards[currentCardIdx];
        const rating = userRatings[currentCardIdx];
        const progressPct = Math.round(((currentCardIdx + 1) / cards.length) * 100);

        deckContainer.innerHTML = `
          <div style="border-top:1px solid var(--border); padding-top:14px;">
            <!-- Progress & Badge Header -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
              <span class="badge badge-accent" style="font-size:11.5px; font-weight:700;">
                ${window.escapeHtml(card.category || 'High-Yield Concept')}
              </span>
              <span style="font-size:12.5px; font-weight:600; color:var(--text-dim);">
                Card ${currentCardIdx + 1} of ${cards.length}
              </span>
            </div>

            <!-- Mini Progress Bar -->
            <div style="width:100%; height:4px; background:var(--surface-2); border-radius:2px; margin-bottom:14px; overflow:hidden;">
              <div style="width:${progressPct}%; height:100%; background:var(--accent); transition:width .2s ease;"></div>
            </div>

            <!-- 3D Interactive Card Box -->
            <div style="perspective:1000px; margin-bottom:14px; cursor:pointer;" id="flip-card-box">
              <div style="position:relative; width:100%; min-height:160px; padding:22px; border-radius:12px; background:${isFlipped ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:2px solid ${isFlipped ? 'var(--accent)' : 'var(--border)'}; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; transition:all .2s cubic-bezier(.4,0,.2,1); box-shadow:0 4px 12px rgba(0,0,0,0.06);">
                <div style="font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; color:${isFlipped ? 'var(--accent)' : 'var(--text-dim)'}; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                  <span>${isFlipped ? '💡 ANSWER & LOGIC' : '❓ ACTIVE RECALL QUESTION'}</span>
                  <span style="font-size:10px; opacity:0.7;">(Tap to ${isFlipped ? 'flip front' : 'reveal answer'})</span>
                </div>

                <div style="font-size:15.5px; font-weight:600; color:var(--text); line-height:1.55; margin-bottom:${isFlipped && (card.context || card.trick) ? '12px' : '0'};">
                  ${window.escapeHtml(isFlipped ? card.back : card.front)}
                </div>

                ${isFlipped && card.context ? `
                  <div style="font-size:12px; color:var(--text-dim); margin-top:8px; border-top:1px solid var(--border); padding-top:8px; width:100%;">
                    <strong style="color:var(--text);">Context:</strong> ${window.escapeHtml(card.context)}
                  </div>
                ` : ''}

                ${isFlipped && card.trick ? `
                  <div style="font-size:11.5px; color:var(--accent); font-weight:600; margin-top:4px;">
                    ⚡ Memory Hook: ${window.escapeHtml(card.trick)}
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Spaced Repetition Rating Buttons -->
            <div style="display:flex; gap:6px; margin-bottom:14px;">
              <button class="btn btn-ghost fc-rate-btn" data-rate="hard" style="flex:1; padding:8px; font-size:12px; border:1px solid var(--border); ${rating === 'hard' ? 'background:rgba(255,77,109,0.18); border-color:var(--danger); color:var(--danger); font-weight:700;' : ''}">
                🔴 Hard (1d)
              </button>
              <button class="btn btn-ghost fc-rate-btn" data-rate="good" style="flex:1; padding:8px; font-size:12px; border:1px solid var(--border); ${rating === 'good' ? 'background:var(--accent-soft); border-color:var(--accent); color:var(--accent); font-weight:700;' : ''}">
                🟡 Good (3d)
              </button>
              <button class="btn btn-ghost fc-rate-btn" data-rate="easy" style="flex:1; padding:8px; font-size:12px; border:1px solid var(--border); ${rating === 'easy' ? 'background:rgba(47,198,188,0.18); border-color:var(--teal); color:var(--teal); font-weight:700;' : ''}">
                🟢 Easy (7d)
              </button>
            </div>

            <!-- Navigation Controls -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:8px;">
              <button class="btn btn-ghost" id="fc-prev" ${currentCardIdx === 0 ? 'disabled' : ''} style="flex:1; padding:9px 12px; font-size:13px; font-weight:600;">← Prev</button>
              <button class="btn btn-ghost" id="fc-flip-btn" style="flex:1.2; padding:9px 12px; font-size:13px; font-weight:600;">🔄 Flip Card</button>
              <button class="btn btn-ghost" id="fc-next" ${currentCardIdx === cards.length - 1 ? 'disabled' : ''} style="flex:1; padding:9px 12px; font-size:13px; font-weight:600;">Next →</button>
            </div>

            <!-- Save to Deck CTA -->
            <button class="btn btn-primary" id="fc-save-deck" style="width:100%; padding:13px; font-weight:700; font-size:14px;">
              💾 Save All ${cards.length} Flashcards to Review Deck
            </button>
          </div>
        `;

        document.getElementById('flip-card-box').onclick = () => {
          isFlipped = !isFlipped;
          renderCardDeck();
        };

        const flipBtn = document.getElementById('fc-flip-btn');
        if (flipBtn) {
          flipBtn.onclick = () => {
            isFlipped = !isFlipped;
            renderCardDeck();
          };
        }

        deckContainer.querySelectorAll('.fc-rate-btn').forEach(btn => {
          btn.onclick = () => {
            userRatings[currentCardIdx] = btn.dataset.rate;
            if (currentCardIdx < cards.length - 1) {
              currentCardIdx++;
              isFlipped = false;
            }
            renderCardDeck();
          };
        });

        const prevBtn = document.getElementById('fc-prev');
        if (prevBtn) prevBtn.onclick = () => {
          if (currentCardIdx > 0) {
            currentCardIdx--;
            isFlipped = false;
            renderCardDeck();
          }
        };

        const nextBtn = document.getElementById('fc-next');
        if (nextBtn) nextBtn.onclick = () => {
          if (currentCardIdx < cards.length - 1) {
            currentCardIdx++;
            isFlipped = false;
            renderCardDeck();
          }
        };

        document.getElementById('fc-save-deck').onclick = async () => {
          for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            const rate = userRatings[i] || 'good';
            const stability = rate === 'easy' ? 3 : (rate === 'hard' ? 0.5 : 1.5);
            await window.DB.put('flashcards', {
              id: window.uid(),
              fileId: window.State.currentFile ? window.State.currentFile.id : 'global',
              page: pageNum,
              category: c.category || focusType,
              front: c.front,
              back: c.back + (c.context ? `\n\nContext: ${c.context}` : '') + (c.trick ? `\nMemory Trick: ${c.trick}` : ''),
              due: Date.now(),
              stability,
              difficulty: rate === 'hard' ? 5 : (rate === 'easy' ? 1 : 3),
              reps: 0,
              lapses: 0,
              createdAt: Date.now()
            });
          }
          window.toast(`Added ${cards.length} flashcards to Review Deck!`);
          window.Sheet.close();
        };
      }

      renderCardDeck();

    } catch (err) {
      loader.style.display = 'none';
      deckContainer.innerHTML = `<div style="color:var(--danger); font-size:13px; padding:12px; background:var(--surface-2); border-radius:8px;">Could not generate flashcards. Please try again.</div>`;
    }
  };
}

export async function translatePassageAI(text, targetLang) {
  const cleanText = (text || '').trim();
  const isShortWord = cleanText.split(/\s+/).length <= 4;

  const systemInstruction = `You are a world-class academic translator, linguist, and bilingual educator.
Your task is to translate the user's text into ${targetLang} with utmost accuracy, natural fluency, and professional clarity.

STRICT TRANSLATION RULES:
1. If the input is a single word or short term:
   - Provide the primary, most accurate translation prominently at the top.
   - Include clear phonetic pronunciation / transliteration if the script differs (e.g. Hindi, Arabic, Russian, Chinese, Japanese).
   - State the grammatical category (Noun, Verb, Adjective, etc.).
   - List 2-3 accurate contextual synonyms or alternate translations in ${targetLang}.
   - Provide 1-2 practical, realistic example sentences with parallel translations in both languages.
2. If the input is a phrase, sentence, or passage:
   - Provide a natural, fluent, and precise translation of the entire passage directly.
   - If there are nuanced, idiomatic, or academic terms, provide a brief bulleted vocabulary breakdown below.
3. Strict Output Constraints:
   - NEVER output ASCII art diagrams, mock chemical drawings, long philosophical essays, or unrendered LaTeX markers.
   - Output structured, clean Markdown with clear headings (###), bold key terms (**word**), and bullet points (-).
   - Keep the response clean, direct, and immediately readable.`;

  const prompt = isShortWord
    ? `Translate the word/term "${cleanText}" into ${targetLang}.`
    : `Translate the following passage accurately and naturally into ${targetLang}:\n\n"""${cleanText}"""`;

  // 1. Try server general Gemini endpoint with dedicated translation system instruction
  try {
    const res = await callServerGemini(prompt, systemInstruction, 'gemini-3.1-flash-lite');
    if (res && res.length > 3) return res;
  } catch (e) {
    console.warn('Translate primary callServerGemini notice:', e.message);
  }

  // 2. Try study tool endpoint
  try {
    const studyRes = await callStudyTool('translate', prompt, cleanText);
    if (studyRes && studyRes.length > 3) return studyRes;
  } catch (e) {
    console.warn('Translate study tool fallback notice:', e.message);
  }

  // 3. Fallback to basic prompt
  return await callAI(prompt, 'translate', cleanText);
}

export async function runTranslateToolModal(sel){
  if(!sel || !sel.text) return;
  const langs = [
    'Hindi', 'Urdu', 'Spanish', 'French', 'German', 
    'Arabic', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Gujarati', 
    'Russian', 'Chinese', 'Japanese', 'Korean', 'Italian', 'Portuguese', 'Turkish'
  ];

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div class="font-display" style="font-size:18px; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
        ${window.icon('language','icon icon-sm')} Translate Selection
      </div>
      <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:14px; background:var(--surface-2); border:1px solid var(--border); padding:9px 12px; border-radius:10px; max-height:60px; overflow-y:auto; line-height:1.45;">
        "${window.escapeHtml((sel?.text || '').slice(0, 200))}"
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:6px;">Target Language</label>
        <select id="trans-lang-select" style="width:100%; padding:10px 12px; font-size:14px; font-weight:600; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; color:var(--text);">
          ${langs.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="start-trans-btn" style="width:100%; padding:12px; font-weight:700; font-size:14px; margin-bottom:14px; border-radius:10px; box-shadow:0 3px 12px var(--accent-soft);">
        ${window.icon('language','icon icon-xs')} Translate Now
      </button>
      <div id="trans-result-box"></div>
    </div>
  `);

  document.getElementById('start-trans-btn').onclick = async () => {
    const targetLang = document.getElementById('trans-lang-select').value;
    const resBox = document.getElementById('trans-result-box');
    resBox.innerHTML = `
      <div style="padding:16px; background:var(--surface-2); border-radius:12px; border:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; color:var(--accent); font-weight:700; font-size:13px;">
          <span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span> Translating into ${targetLang}...
        </div>
        <div class="skel" style="height:14px; width:95%; margin-bottom:8px; border-radius:4px;"></div>
        <div class="skel" style="height:14px; width:80%; margin-bottom:8px; border-radius:4px;"></div>
        <div class="skel" style="height:14px; width:60%; border-radius:4px;"></div>
      </div>
    `;

    try {
      const translation = await translatePassageAI(sel.text, targetLang);
      const renderedHtml = typeof window.renderMarkdown === 'function' 
        ? window.renderMarkdown(translation) 
        : (typeof window.formatMarkdown === 'function' ? window.formatMarkdown(translation) : window.escapeHtml(translation));

      resBox.innerHTML = `
        <div class="selectable-text" style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:14px 16px; font-size:13.5px; line-height:1.65; color:var(--text); margin-bottom:14px; max-height:360px; overflow-y:auto;">
          ${renderedHtml}
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" id="copy-trans-btn" style="flex:1; padding:10px 12px; font-weight:700; font-size:12.5px; border-radius:10px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; gap:6px;">
            ${window.icon('copy','icon icon-xs')} Copy
          </button>
          <button class="btn btn-primary" id="save-trans-note" style="flex:1; padding:10px 12px; font-weight:700; font-size:12.5px; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:6px;">
            ${window.icon('bookmark','icon icon-xs')} Save to Notes
          </button>
        </div>
      `;

      document.getElementById('copy-trans-btn').onclick = async () => {
        await window.copyToClipboard(translation);
        window.toast('Translation copied to clipboard! 📋');
      };

      document.getElementById('save-trans-note').onclick = async () => {
        await window.DB.put('notes', {
          id: window.uid(),
          fileId: window.State?.currentFile?.id || 'global_notes',
          page: sel.pageNum || 1,
          kind: `Translation (${targetLang})`,
          content: translation,
          sourceText: sel.text,
          createdAt: Date.now()
        });
        window.toast(`Translation saved to Notes! 📝`);
        window.Sheet.close();
      };
    } catch (err) {
      console.error('Translation error:', err);
      resBox.innerHTML = `<div style="color:var(--danger); font-size:13px; padding:12px; background:rgba(239,68,68,0.1); border-radius:10px;">Translation failed. Please check your internet connection or API settings.</div>`;
    }
  };
}

