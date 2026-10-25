// @ts-nocheck
/* ======================================================================
   Question Paper Generator: pure logic (no DOM, no network).
   Blueprints, text helpers, JSON repair, question validation, grounding,
   planning and scoring. Everything here is unit-testable in plain Node.
   ====================================================================== */

/* ----------------------------- Question types ----------------------------- */
export const TYPE_META = {
  mcq:      { name: 'Multiple Choice',      tag: 'MCQ',  objective: true,  auto: true,  grounded: true },
  ar:       { name: 'Assertion & Reason',   tag: 'A-R',  objective: true,  auto: true,  grounded: true },
  fill:     { name: 'Fill in the Blank',    tag: 'FIB',  objective: true,  auto: true,  grounded: true },
  tf:       { name: 'True / False',         tag: 'T/F',  objective: true,  auto: true,  grounded: true },
  obj:      { name: 'Objective (multi-part)', tag: 'OBJ', objective: true, auto: true,  grounded: true, composite: true },
  vsa:      { name: 'Very Short Answer',    tag: 'VSA',  words: '30-40',   grounded: true },
  sa:       { name: 'Short Answer',         tag: 'SA',   words: '50-60',   grounded: true },
  la:       { name: 'Long Answer',          tag: 'LA',   words: '100-120', grounded: true },
  case:     { name: 'Case / Source Based',  tag: 'CASE', composite: true,    grounded: true },
  map:      { name: 'Map Skill',            tag: 'MAP',  composite: true,    grounded: true },
  passage:  { name: 'Unseen Passage',       tag: 'UNSEEN', composite: true,  language: true },
  extract:  { name: 'Reference to Context', tag: 'EXTRACT', composite: true, language: true, grounded: true },
  grammar:  { name: 'Grammar & Usage',      tag: 'GRAM', objective: true,    language: true, auto: true },
  letter:   { name: 'Letter Writing',       tag: 'WRITE', writing: true,     language: true },
  paragraph:{ name: 'Analytical Paragraph', tag: 'WRITE', writing: true,     language: true },
  essay:    { name: 'Essay / Article',      tag: 'WRITE', writing: true,     language: true },
  notice:   { name: 'Notice / Email / Message', tag: 'WRITE', writing: true, language: true },
  summary:  { name: 'Summary Writing',      tag: 'WRITE', writing: true,     language: true },
};
export const isAutoType = (t) => !!TYPE_META[t]?.auto;

/* ------------------------------- Blueprints ------------------------------- */
// P(type, count, marksEach, extra)  -> one "part" (a group of same-type questions)
//   attempt : students answer only this many of `count` ("Attempt any n")
//   or      : this many questions get an internal-choice alternative ("OR")
//   words   : word-limit hint printed on the paper
//   sub     : sub-question plan for composite types [[type, n, marksEach], ...]
//   topic   : label for grammar groups etc.
//   lang    : true => language-skill part (needs no chapter grounding)
const P = (type, count, marks, extra = {}) => ({ type, count, marks, ...extra });

const CASE_SUB = (m) => (m <= 2 ? [['short', 1, m]] : m === 3 ? [['mcq', 1, 1], ['short', 1, 2]] : [['mcq', 2, 1], ['short', 1, m - 2]]);
export const defaultSub = (type, marks) => {
  if (type === 'case') return CASE_SUB(marks);
  if (type === 'map') return [['map', marks, 1]];
  if (type === 'extract') return marks >= 5 ? [['mcq', 2, 1], ['short', 1, 1], ['short', 1, marks - 3]] : marks === 4 ? [['mcq', 2, 1], ['short', 1, 2]] : [['mcq', 1, 1], ['short', 1, Math.max(1, marks - 1)]];
  if (type === 'passage') {
    if (marks <= 5) return [['mcq', marks, 1]];
    const shorts = marks >= 10 ? 2 : 1;
    return [['mcq', marks - shorts * 2, 1], ['short', shorts, 2]];
  }
  if (type === 'obj') return [['obj', marks, 1]];
  return null;
};

const CBSE_GENERAL = [
  'All questions are compulsory unless an internal choice is given.',
  'Marks for each question are shown against it.',
  'Write the answers in the answer sheet provided.',
];

export const BLUEPRINTS = [
  /* ---------------------------- CBSE · Class 10 ---------------------------- */
  { id: 'cbse10_science', board: 'cbse', level: '10', subject: 'Science', kind: 'science', verified: 'public', marks: 80, minutes: 180,
    source: 'CBSE Class 10 Science (086) paper design, secondary sources',
    instructions: ['This question paper has five sections: A, B, C, D and E.', ...CBSE_GENERAL, 'Section E contains three case-based questions of 4 marks each.'],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'Objective type, 1 mark each', parts: [P('mcq', 16, 1), P('ar', 4, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 6, 2, { or: 2, words: '30-40' })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 7, 3, { or: 2, words: '50-60' })] },
      { key: 'D', title: 'Section D', blurb: 'Long answer, 5 marks each', parts: [P('la', 3, 5, { or: 3, words: '100-120' })] },
      { key: 'E', title: 'Section E', blurb: 'Case / source based, 4 marks each', parts: [P('case', 3, 4)] },
    ] },
  { id: 'cbse10_maths', board: 'cbse', level: '10', subject: 'Mathematics (Standard)', kind: 'maths', verified: 'official-sample', marks: 80, minutes: 180,
    source: 'CBSE Class 10 Mathematics Standard board sample paper 2025-26',
    instructions: ['This question paper has 5 sections A, B, C, D and E.', 'Section A has 18 MCQs and 2 Assertion-Reason questions of 1 mark each.', 'Section E has 3 case-study questions of 4 marks each (sub-parts 1, 1 and 2).', ...CBSE_GENERAL, 'Use of calculators is not allowed.'],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'MCQ and Assertion-Reason, 1 mark each', parts: [P('mcq', 18, 1), P('ar', 2, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 5, 2, { or: 2 })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 6, 3, { or: 2 })] },
      { key: 'D', title: 'Section D', blurb: 'Long answer, 5 marks each', parts: [P('la', 4, 5, { or: 2 })] },
      { key: 'E', title: 'Section E', blurb: 'Case study, 4 marks each', parts: [P('case', 3, 4)] },
    ] },
  { id: 'cbse10_sst', board: 'cbse', level: '10', subject: 'Social Science', kind: 'sst', verified: 'public', marks: 80, minutes: 180,
    source: 'CBSE Class 10 Social Science paper design, secondary sources (sources disagree on section layout)',
    instructions: ['This question paper has six sections A to F.', ...CBSE_GENERAL, 'Section E has three source-based questions of 4 marks each.', 'Section F is map-based (5 marks).'],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'Multiple choice, 1 mark each', parts: [P('mcq', 20, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 4, 2, { or: 2 })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 5, 3, { or: 2 })] },
      { key: 'D', title: 'Section D', blurb: 'Long answer, 5 marks each', parts: [P('la', 4, 5, { or: 4 })] },
      { key: 'E', title: 'Section E', blurb: 'Source / case based, 4 marks each', parts: [P('case', 3, 4)] },
      { key: 'F', title: 'Section F', blurb: 'Map skill based', parts: [P('map', 1, 5)] },
    ] },
  { id: 'cbse10_english', board: 'cbse', level: '10', subject: 'English (Language & Literature)', kind: 'english', language: 'en', verified: 'official', marks: 80, minutes: 180,
    source: 'CBSE Class 10 English Language & Literature (184) curriculum 2025-26, official',
    instructions: ['This paper has three sections: A (Reading), B (Writing and Grammar) and C (Literature).', ...CBSE_GENERAL, 'Attempt the questions as per the instructions given in each section.'],
    sections: [
      { key: 'A', title: 'Section A: Reading', blurb: 'Two unseen passages, 20 marks', parts: [
        P('passage', 1, 10, { passageKind: 'discursive', words: '400-450', sub: [['mcq', 6, 1], ['short', 2, 2]], unseen: true }),
        P('passage', 1, 10, { passageKind: 'data', words: '200-250', sub: [['mcq', 6, 1], ['short', 2, 2]], unseen: true })] },
      { key: 'B', title: 'Section B: Writing & Grammar', blurb: 'Grammar 10 marks, writing 10 marks', parts: [
        P('grammar', 12, 1, { attempt: 10, topic: 'Determiners, Tenses, Modals, Subject-verb concord, Reported speech' }),
        P('letter', 2, 5, { attempt: 1, words: '100-120' }),
        P('paragraph', 2, 5, { attempt: 1, words: '100-120' })] },
      { key: 'C', title: 'Section C: Literature', blurb: 'Extracts and textbook questions, 40 marks', parts: [
        P('extract', 2, 5, { attempt: 1, kindHint: 'prose or drama' }),
        P('extract', 2, 5, { attempt: 1, kindHint: 'poetry' }),
        P('sa', 5, 3, { attempt: 4, words: '40-50' }),
        P('sa', 3, 3, { attempt: 2, words: '40-50' }),
        P('la', 2, 6, { attempt: 1, words: '100-120' }),
        P('la', 2, 6, { attempt: 1, words: '100-120' })] },
    ] },
  { id: 'cbse10_hindi', board: 'cbse', level: '10', subject: 'Hindi (Course A)', kind: 'hindi', language: 'hi', verified: 'public', marks: 80, minutes: 180,
    source: 'CBSE Class 10 Hindi A (002) paper design',
    instructions: ['इस प्रश्न-पत्र में चार खंड हैं: क, ख, ग और घ।', 'सभी खंडों के प्रश्नों के उत्तर देना अनिवार्य है।', 'प्रश्न के सामने अंक दिए गए हैं।'],
    sections: [
      { key: 'क', title: 'खंड क: अपठित बोध', blurb: 'अपठित गद्यांश और काव्यांश (14 अंक)', parts: [
        P('passage', 1, 7, { passageKind: 'prose', words: '~250', sub: [['mcq', 3, 1], ['short', 2, 2]], unseen: true }),
        P('passage', 1, 7, { passageKind: 'poem', words: '~120', sub: [['mcq', 3, 1], ['short', 2, 2]], unseen: true })] },
      { key: 'ख', title: 'खंड ख: व्यावहारिक व्याकरण', blurb: 'चार भागों में से प्रत्येक के 5 में से 4 प्रश्न (16 अंक)', parts: [
        P('grammar', 5, 1, { attempt: 4, topic: 'वाक्य रचना (रचना के आधार पर वाक्य भेद)' }),
        P('grammar', 5, 1, { attempt: 4, topic: 'वाच्य' }),
        P('grammar', 5, 1, { attempt: 4, topic: 'पद परिचय' }),
        P('grammar', 5, 1, { attempt: 4, topic: 'अलंकार (उपमा, रूपक, उत्प्रेक्षा, अतिशयोक्ति, मानवीकरण)' })] },
      { key: 'ग', title: 'खंड ग: पाठ्यपुस्तक एवं पूरक पाठ्यपुस्तक', blurb: 'गद्य, काव्य और पूरक (30 अंक)', parts: [
        P('extract', 1, 11, { sub: [['mcq', 5, 1], ['vsa', 3, 2]], kindHint: 'गद्य', attempt: 1 }),
        P('extract', 1, 11, { sub: [['mcq', 5, 1], ['vsa', 3, 2]], kindHint: 'काव्य', attempt: 1 }),
        P('sa', 3, 4, { attempt: 2, words: '50-60' })] },
      { key: 'घ', title: 'खंड घ: रचनात्मक लेखन', blurb: 'अनुच्छेद, पत्र, सूचना/ई-मेल, विज्ञापन/संदेश (20 अंक)', parts: [
        P('paragraph', 3, 6, { attempt: 1, words: '~120' }),
        P('letter', 2, 5, { attempt: 1, words: '~100' }),
        P('notice', 2, 5, { attempt: 1, words: '~80' }),
        P('notice', 2, 4, { attempt: 1, words: '~40' })] },
    ] },

  /* ---------------------------- CBSE · Class 12 ---------------------------- */
  ...['Physics', 'Chemistry', 'Biology'].map((s) => ({
    id: 'cbse12_' + s.toLowerCase(), board: 'cbse', level: '12', subject: s, kind: 'science', verified: 'public', marks: 70, minutes: 180,
    source: `CBSE Class 12 ${s} theory paper design, secondary sources`,
    instructions: ['This question paper has five sections: A, B, C, D and E.', ...CBSE_GENERAL, 'Section D has two case-based questions of 4 marks each.'],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'MCQ and Assertion-Reason, 1 mark each', parts: [P('mcq', 12, 1), P('ar', 4, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 5, 2, { or: 2 })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 7, 3, { or: 2 })] },
      { key: 'D', title: 'Section D', blurb: 'Case based, 4 marks each', parts: [P('case', 2, 4)] },
      { key: 'E', title: 'Section E', blurb: 'Long answer, 5 marks each', parts: [P('la', 3, 5, { or: 3 })] },
    ] })),
  { id: 'cbse12_maths', board: 'cbse', level: '12', subject: 'Mathematics', kind: 'maths', verified: 'public', marks: 80, minutes: 180,
    source: 'CBSE Class 12 Mathematics theory paper design, secondary sources',
    instructions: ['This question paper has five sections A, B, C, D and E.', ...CBSE_GENERAL, 'Use of calculators is not allowed.'],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'MCQ and Assertion-Reason, 1 mark each', parts: [P('mcq', 18, 1), P('ar', 2, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 5, 2, { or: 2 })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 6, 3, { or: 2 })] },
      { key: 'D', title: 'Section D', blurb: 'Long answer, 5 marks each', parts: [P('la', 4, 5, { or: 2 })] },
      { key: 'E', title: 'Section E', blurb: 'Case study, 4 marks each', parts: [P('case', 3, 4)] },
    ] },
  { id: 'cbse12_english', board: 'cbse', level: '12', subject: 'English Core', kind: 'english', language: 'en', verified: 'approx', marks: 80, minutes: 180,
    source: 'CBSE Class 12 English Core (301): section marks from public sources; question mix approximated',
    instructions: ['This paper has three sections: A (Reading), B (Creative Writing) and C (Literature).', ...CBSE_GENERAL],
    sections: [
      { key: 'A', title: 'Section A: Reading', blurb: 'Two unseen passages, 22 marks', parts: [
        P('passage', 1, 12, { passageKind: 'discursive', words: '500-600', sub: [['mcq', 6, 1], ['short', 3, 2]], unseen: true }),
        P('passage', 1, 10, { passageKind: 'factual', words: '350-400', sub: [['mcq', 6, 1], ['short', 2, 2]], unseen: true })] },
      { key: 'B', title: 'Section B: Creative Writing', blurb: 'Notice, letter, article or report, 18 marks', parts: [
        P('notice', 2, 4, { attempt: 1, words: '~50' }),
        P('letter', 2, 6, { attempt: 1, words: '120-150' }),
        P('essay', 2, 8, { attempt: 1, words: '120-150' })] },
      { key: 'C', title: 'Section C: Literature', blurb: 'Extracts and textbook questions, 40 marks', parts: [
        P('extract', 2, 4, { attempt: 1, kindHint: 'poetry' }),
        P('extract', 2, 4, { attempt: 1, kindHint: 'prose' }),
        P('vsa', 6, 2, { attempt: 4, words: '40-50' }),
        P('sa', 3, 4, { attempt: 2, words: '40-50' }),
        P('la', 2, 6, { attempt: 1, words: '120-150' }),
        P('la', 2, 6, { attempt: 1, words: '120-150' }),
        P('sa', 1, 4)] },
    ] },
  { id: 'cbse12_generic', board: 'cbse', level: '12', subject: 'Other subjects (History, Pol. Sci., Economics, Business Studies, Accountancy ...)', kind: 'generic', verified: 'approx', marks: 80, minutes: 180,
    source: 'Generic 80-mark CBSE theory layout (approximate: subjects differ, edit the counts to match your syllabus)',
    instructions: ['This question paper has five sections A to E.', ...CBSE_GENERAL],
    sections: [
      { key: 'A', title: 'Section A', blurb: 'Multiple choice, 1 mark each', parts: [P('mcq', 20, 1)] },
      { key: 'B', title: 'Section B', blurb: 'Very short answer, 2 marks each', parts: [P('vsa', 5, 2, { or: 2 })] },
      { key: 'C', title: 'Section C', blurb: 'Short answer, 3 marks each', parts: [P('sa', 6, 3, { or: 2 })] },
      { key: 'D', title: 'Section D', blurb: 'Long answer, 5 marks each', parts: [P('la', 4, 5, { or: 2 })] },
      { key: 'E', title: 'Section E', blurb: 'Case / source based, 4 marks each', parts: [P('case', 3, 4)] },
    ] },

  /* --------------------------- NIOS · Secondary (10) --------------------------- */
  { id: 'nios10_science', board: 'nios', level: '10', subject: 'Science & Technology (212)', kind: 'science', verified: 'official', marks: 85, minutes: 150,
    source: 'NIOS Question Paper Design: Science & Technology (212), official',
    instructions: ['Part A has objective questions, Part B has subjective questions.', 'All questions are compulsory except where an internal choice is given.', 'Marks for each question are shown against it.'],
    sections: [
      { key: 'A', title: 'Part A: Objective', blurb: 'MCQ and multi-part objective questions (42 marks)', parts: [P('mcq', 17, 1), P('obj', 10, 2), P('obj', 1, 5)] },
      { key: 'B', title: 'Part B: Subjective', blurb: 'VSA, SA and LA (43 marks)', parts: [P('vsa', 6, 2, { or: 3 }), P('sa', 7, 3, { or: 3 }), P('la', 2, 5, { or: 2 })] },
    ] },
  { id: 'nios10_sst', board: 'nios', level: '10', subject: 'Social Science (213)', kind: 'sst', verified: 'official', marks: 100, minutes: 180,
    source: 'NIOS Question Paper Design: Social Science (213), official',
    instructions: ['All questions are compulsory except where an internal choice is given.', 'Marks for each question are shown against it.'],
    sections: [
      { key: 'A', title: 'Part A: Objective', blurb: 'MCQ and multi-part objective questions (50 marks)', parts: [P('mcq', 20, 1), P('obj', 15, 2)] },
      { key: 'B', title: 'Part B: Subjective', blurb: 'VSA, SA, skill/map and LA (50 marks)', parts: [P('vsa', 6, 2, { or: 3 }), P('sa', 6, 3, { or: 3 }), P('map', 2, 4), P('la', 2, 6, { or: 2 })] },
    ] },
  { id: 'nios10_maths', board: 'nios', level: '10', subject: 'Mathematics (211)', kind: 'maths', verified: 'approx', marks: 85, minutes: 180,
    source: 'NIOS Mathematics (211): approximated from public sources (official PDF could not be read)',
    instructions: ['All questions are compulsory except where an internal choice is given.', 'Marks for each question are shown against it.'],
    sections: [
      { key: 'A', title: 'Part A: Objective', blurb: 'MCQ and multi-part objective questions', parts: [P('mcq', 17, 1), P('obj', 11, 2)] },
      { key: 'B', title: 'Part B: Subjective', blurb: 'VSA, SA and LA', parts: [P('vsa', 9, 2, { or: 3 }), P('sa', 6, 3, { or: 2 }), P('la', 2, 5, { or: 2 })] },
    ] },
  { id: 'nios10_english', board: 'nios', level: '10', subject: 'English (202)', kind: 'english', language: 'en', verified: 'official', marks: 100, minutes: 180,
    source: 'NIOS Question Paper Design: English (202), official (internal mapping of objective items approximated)',
    instructions: ['All questions are compulsory except where an internal choice is given.', 'Marks for each question are shown against it.'],
    sections: [
      { key: 'A', title: 'Part A: Objective', blurb: 'Comprehension, vocabulary and grammar (50 marks)', parts: [
        P('mcq', 1, 1, { lang: true }), P('obj', 1, 2, { lang: true }),
        P('passage', 1, 5, { passageKind: 'discursive', words: '200-250', sub: [['mcq', 5, 1]], unseen: true }),
        P('grammar', 10, 3, { topic: 'Grammar, vocabulary and editing (3 sub-points each)', subs: 3 }),
        P('grammar', 3, 4, { topic: 'Grammar and usage (4 sub-points each)', subs: 4 })] },
      { key: 'B', title: 'Part B: Subjective', blurb: 'Text-based and writing (50 marks)', parts: [
        P('vsa', 13, 2, { or: 4, words: '20-25' }), P('sa', 2, 3, { or: 1, words: '40-45' }),
        P('la', 3, 4, { or: 2, words: '70-80' }), P('essay', 1, 6, { or: 1, words: '100-150' })] },
    ] },
  { id: 'nios10_hindi', board: 'nios', level: '10', subject: 'Hindi (201)', kind: 'hindi', language: 'hi', verified: 'approx', marks: 100, minutes: 180,
    source: 'NIOS Hindi (201): totals from the official design (its table is partly garbled, so the split is approximated)',
    instructions: ['सभी प्रश्न अनिवार्य हैं (जहाँ विकल्प न दिया हो)।', 'प्रश्न के सामने अंक दिए गए हैं।'],
    sections: [
      { key: 'क', title: 'खंड क: वस्तुनिष्ठ', blurb: 'बहुविकल्पी और बहु-भाग प्रश्न', parts: [
        P('mcq', 13, 1), P('obj', 9, 2),
        P('passage', 1, 4, { passageKind: 'prose', sub: [['mcq', 4, 1]], unseen: true }),
        P('passage', 1, 4, { passageKind: 'poem', sub: [['mcq', 4, 1]], unseen: true }),
        P('grammar', 4, 1, { topic: 'व्याकरण' }), P('grammar', 3, 2, { topic: 'व्याकरण (भाषा प्रयोग)' })] },
      { key: 'ख', title: 'खंड ख: वर्णनात्मक', blurb: 'लघु/दीर्घ उत्तर और लेखन कौशल', parts: [
        P('vsa', 1, 2, { or: 1 }), P('sa', 2, 3, { or: 1 }), P('sa', 4, 4, { or: 2, words: '60-80' }),
        P('extract', 2, 5, { attempt: 2, kindHint: 'गद्य/काव्य' }),
        P('summary', 1, 5), P('letter', 2, 5, { attempt: 1 }), P('essay', 4, 7, { attempt: 1, words: '~300' })] },
    ] },

  /* ----------------------- NIOS · Senior Secondary (12) ----------------------- */
  { id: 'nios12_generic', board: 'nios', level: '12', subject: 'Senior Secondary (any subject)', kind: 'generic', verified: 'approx', marks: 80, minutes: 180,
    source: 'NIOS senior secondary theory layout (approximate; edit the counts to match your subject)',
    instructions: ['All questions are compulsory except where an internal choice is given.', 'Marks for each question are shown against it.'],
    sections: [
      { key: 'A', title: 'Part A: Objective', blurb: 'MCQ and multi-part objective questions', parts: [P('mcq', 15, 1), P('obj', 8, 2)] },
      { key: 'B', title: 'Part B: Subjective', blurb: 'VSA, SA, LA and case based', parts: [P('vsa', 6, 2, { or: 3 }), P('sa', 6, 3, { or: 3 }), P('la', 3, 5, { or: 3 }), P('case', 1, 4)] },
    ] },
];

export const BOARDS = [
  { id: 'cbse', name: 'CBSE', levels: [{ id: '10', name: 'Class 10' }, { id: '12', name: 'Class 12' }] },
  { id: 'nios', name: 'NIOS', levels: [{ id: '10', name: 'Secondary (10)' }, { id: '12', name: 'Sr. Secondary (12)' }] },
];
export const VERIFIED_LABEL = {
  official: 'Matches the official board document',
  'official-sample': 'Matches the official board sample paper',
  public: 'Built from published pattern summaries, edit counts if your school differs',
  approx: 'Approximate layout, edit the counts to match your exam',
};

export function blueprintsFor(board, level) { return BLUEPRINTS.filter((b) => b.board === board && b.level === level); }
export function getBlueprint(id) { return BLUEPRINTS.find((b) => b.id === id) || null; }
export function cloneBlueprint(bp) { return JSON.parse(JSON.stringify(bp)); }

/* Per part: marks it adds to the paper, and how many questions it generates. */
export const partAttempt = (p) => Math.min(p.count, p.attempt ?? p.count);
export const partMarks = (p) => partAttempt(p) * p.marks;
export const partGenerateCount = (p, choiceOn) => p.count + (choiceOn && p.or ? Math.min(p.or, p.count) : 0);

export function totals(sections) {
  let marks = 0, questions = 0, generate = 0;
  for (const s of sections) for (const p of s.parts) {
    if (p.enabled === false) continue;
    marks += partMarks(p);
    questions += partAttempt(p);
    generate += p.count;
  }
  return { marks, questions, generate };
}

/* ----------------------------- Text utilities ----------------------------- */
const STOP = new Set('the a an of to in on at for and or is are was were be been it its this that these those with as by from has have had not but if then so than which who whom whose what when where why how can could may might will would shall should do does did into out up down over under about after before between during through also such their there they them he she his her we you your our i me my'.split(' '));

export function normText(s) {
  return String(s || '').toLowerCase().replace(/[‘’“”]/g, "'").replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export const tokens = (s) => { const n = normText(s); return n ? n.split(' ') : []; };
export const contentWords = (s) => tokens(s).filter((w) => w.length > 2 && !STOP.has(w));
function shingles(toks, k) {
  const out = new Set();
  for (let i = 0; i + k <= toks.length; i++) out.add(toks.slice(i, i + k).join(' '));
  return out;
}

export function buildSourceIndex(text) {
  const norm = normText(text);
  const toks = norm ? norm.split(' ') : [];
  return { norm, words: new Set(toks), sh3: shingles(toks, 3), sh5: shingles(toks, 5), length: toks.length };
}

/* Fraction of the candidate's k-word runs that exist verbatim in the source. */
export function copyRatio(candidate, idx, k = 5) {
  const toks = tokens(candidate);
  if (toks.length < k + 3) return 0;
  const sh = shingles(toks, k);
  if (!sh.size) return 0;
  let hit = 0;
  for (const x of sh) if (idx.sh5.has(x)) hit++;
  return hit / sh.size;
}

/* Does an evidence snippet really occur in the source (exact or near-exact)? */
export function evidenceFound(evidence, idx) {
  const n = normText(evidence);
  if (!n || n.split(' ').length < 3) return false;
  if (idx.norm.includes(n)) return true;
  const sh = shingles(n.split(' '), 3);
  if (!sh.size) return false;
  let hit = 0;
  for (const x of sh) if (idx.sh3.has(x)) hit++;
  return hit / sh.size >= 0.7;
}

/* Share of an answer's content words that occur somewhere in the source. */
export function answerCoverage(answer, idx) {
  const w = contentWords(answer);
  if (!w.length) return 0;
  let hit = 0;
  for (const x of w) if (idx.words.has(x)) hit++;
  return hit / w.length;
}

export function jaccard(a, b) {
  const A = new Set(contentWords(a)), B = new Set(contentWords(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export function isDuplicate(text, others, threshold = 0.62) {
  for (const o of others) if (jaccard(text, o) >= threshold) return true;
  return false;
}

export function detectScript(text) {
  const s = String(text || '').slice(0, 6000);
  const dev = (s.match(/[ऀ-ॿ]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  if (dev + lat < 40) return 'en';
  return dev > lat * 0.4 ? 'hi' : 'en';
}

export function stripMd(s) {
  return String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#+\s*/gm, '').replace(/`/g, '').replace(/\s+\n/g, '\n').trim();
}

/* Cleans text extracted from a PDF: removes [PAGE n] markers (kept separately), page numbers, hyphenation. */
export function cleanPdfText(raw) {
  return String(raw || '')
    .replace(/-\s+(?=[a-z])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\bPage\s+\d+\b/gi, ' ')
    .trim();
}

/* Splits a chapter's text ("[PAGE n]\n...") into ordered slices of about `size` characters. */
export function sliceChapter(text, size = 3200) {
  const parts = String(text || '').split(/\[PAGE (\d+)\]\n?/);
  const pages = [];
  for (let i = 1; i < parts.length; i += 2) pages.push({ page: +parts[i], text: cleanPdfText(parts[i + 1] || '') });
  if (!pages.length && text) pages.push({ page: 0, text: cleanPdfText(text) });
  const slices = [];
  let cur = { pages: [], text: '' };
  for (const p of pages) {
    if (!p.text) continue;
    if (cur.text && cur.text.length + p.text.length > size) { slices.push(cur); cur = { pages: [], text: '' }; }
    cur.pages.push(p.page);
    cur.text += (cur.text ? ' ' : '') + `[p.${p.page}] ` + p.text;
    while (cur.text.length > size * 1.6) {
      // very long single page: cut on a sentence boundary
      let cut = cur.text.lastIndexOf('. ', size);
      if (cut < size * 0.5) cut = size;
      slices.push({ pages: cur.pages.slice(), text: cur.text.slice(0, cut + 1) });
      cur = { pages: cur.pages.slice(-1), text: cur.text.slice(cut + 1).trim() };
    }
  }
  if (cur.text.trim()) slices.push(cur);
  return slices;
}

/* Picks a clean, sentence-aligned extract (~words) from a slice, for "reference to context" questions. */
export function pickExtract(sliceText, words = 95, startFrac = 0.2) {
  const clean = String(sliceText || '').replace(/\[p\.\d+\]\s*/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?।]+[.!?।]+(?:["'”’)]*)/g) || [clean];
  if (!sentences.length) return '';
  let i = Math.min(sentences.length - 1, Math.floor(sentences.length * startFrac));
  let out = '';
  while (i < sentences.length && out.split(/\s+/).length < words) { out += (out ? ' ' : '') + sentences[i].trim(); i++; }
  return out.trim();
}

/* ------------------------------- JSON repair ------------------------------ */
export function parseJsonLoose(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.search(/[\[{]/);
  if (start < 0) return null;
  s = s.slice(start);
  const tryParse = (x) => { try { return JSON.parse(x.replace(/,\s*([\]}])/g, '$1')); } catch (e) { return undefined; } };
  let r = tryParse(s);
  if (r !== undefined) return r;
  // walk the text to find a balanced end, or the last complete element of a truncated array
  let depth = 0, inStr = false, esc = false, end = -1, lastElementEnd = -1;
  const isArr = s[0] === '[';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
      if (isArr && depth === 1) lastElementEnd = i;
    }
  }
  if (end >= 0) { r = tryParse(s.slice(0, end + 1)); if (r !== undefined) return r; }
  if (isArr && lastElementEnd > 0) { r = tryParse(s.slice(0, lastElementEnd + 1) + ']'); if (r !== undefined) return r; }
  return null;
}

/* --------------------------- Deterministic shuffle -------------------------- */
function hash32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = typeof seed === 'string' ? hash32(seed) : seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const POSITIONAL = /\b(all|both|none|neither)\b[^.]{0,24}\b(above|these|of the)\b|\b(i|ii|iii|iv)\s*(and|&|,)\s*(i|ii|iii|iv)\b|\boption\s*[a-d]\b|\b(a|b|c|d)\s*(and|&)\s*(a|b|c|d)\b/i;
export function shuffleOptions(options, correct, seed) {
  if (options.some((o) => POSITIONAL.test(o))) return { options, correct };
  const idx = options.map((_, i) => i);
  const r = rng(seed);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { options: idx.map((i) => options[i]), correct: idx.indexOf(correct) };
}

export const AR_OPTIONS = {
  en: [
    'Both (A) and (R) are true and (R) is the correct explanation of (A).',
    'Both (A) and (R) are true, but (R) is not the correct explanation of (A).',
    '(A) is true, but (R) is false.',
    '(A) is false, but (R) is true.',
  ],
  hi: [
    'अभिकथन (A) और कारण (R) दोनों सही हैं और (R), (A) की सही व्याख्या है।',
    'अभिकथन (A) और कारण (R) दोनों सही हैं, परंतु (R), (A) की सही व्याख्या नहीं है।',
    '(A) सही है, परंतु (R) गलत है।',
    '(A) गलत है, परंतु (R) सही है।',
  ],
};

/* ------------------------------ Marking points ------------------------------ */
export function allocatePoints(points, marks) {
  const texts = (points || []).map((p) => stripMd(typeof p === 'string' ? p : (p?.t || p?.point || p?.text || ''))).filter(Boolean).slice(0, Math.max(1, Math.ceil(marks * 2)));
  if (!texts.length || marks <= 0) return [];
  const n = Math.min(texts.length, Math.max(1, Math.round(marks * 2)));
  const use = texts.slice(0, n);
  const unit = marks / use.length;
  const out = use.map((t) => ({ t, m: Math.round(unit * 2) / 2 }));
  let sum = out.reduce((a, b) => a + b.m, 0);
  let i = out.length - 1;
  while (Math.abs(sum - marks) > 1e-9 && i >= 0) { const d = marks - sum; out[i].m = Math.max(0, out[i].m + d); sum = out.reduce((a, b) => a + b.m, 0); i--; if (i < 0 && Math.abs(sum - marks) > 1e-9) break; }
  return out.filter((o) => o.m > 0);
}

/* ------------------------------ Validation ------------------------------ */
const CLIP = (s, n) => stripMd(s).slice(0, n);
const asStr = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function validateOptions(raw) {
  const opts = Array.isArray(raw.options) ? raw.options.map((o) => CLIP(asStr(o).replace(/^\(?[A-Da-d][).:]\s+/, ''), 260)).filter(Boolean) : [];
  if (opts.length !== 4) return { error: 'needs exactly 4 options' };
  if (new Set(opts.map(normText)).size !== 4) return { error: 'duplicate options' };
  let ci = Number.isInteger(raw.correctIndex) ? raw.correctIndex : (Number.isInteger(+raw.correctIndex) && raw.correctIndex !== '' && raw.correctIndex != null ? +raw.correctIndex : -1);
  if (ci < 0 && typeof raw.correct === 'string') {
    const m = raw.correct.trim().match(/^\(?([A-Da-d])\)?$/);
    if (m) ci = 'abcd'.indexOf(m[1].toLowerCase());
    else ci = opts.findIndex((o) => normText(o) === normText(raw.correct));
  }
  if (!(ci >= 0 && ci < 4)) return { error: 'bad correctIndex' };
  return { options: opts, correct: ci };
}

/* ctx: { idx (source index), kind, lang, seen:[text], seed } */
export function validateQuestion(type, raw, plan, ctx) {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  const marks = plan.marks;
  const meta = TYPE_META[type] || {};
  const base = { type, marks };
  const q = CLIP(asStr(raw.question ?? raw.q), 1200);
  const evidence = CLIP(asStr(raw.evidence), 400);
  const page = Number.isFinite(+raw.page) ? +raw.page : (Number.isFinite(+raw.sourcePage) ? +raw.sourcePage : null);
  const explain = CLIP(asStr(raw.explanation ?? raw.explain), 600);

  const groundCheck = (answerText) => {
    if (!meta.grounded || plan.noGround || ctx.kind === 'maths' || !ctx.idx) return null;
    if (evidenceFound(evidence, ctx.idx)) return null;
    if (answerCoverage(answerText, ctx.idx) >= 0.6) return null;
    return 'not grounded in the chapter text';
  };
  const copyCheck = (text) => (ctx.idx && copyRatio(text, ctx.idx) > 0.6 ? 'copies a sentence from the book' : null);
  const dupCheck = (text) => (isDuplicate(text, ctx.seen || []) ? 'duplicate of an earlier question' : null);

  if (type === 'mcq' || type === 'ar') {
    let qq = q;
    let options, correct;
    if (type === 'ar') {
      const a = CLIP(asStr(raw.assertion), 500), r = CLIP(asStr(raw.reason), 500);
      if (a.length < 8 || r.length < 8) return { error: 'missing assertion or reason' };
      qq = (ctx.lang === 'hi' ? 'अभिकथन (A): ' : 'Assertion (A): ') + a + '\n' + (ctx.lang === 'hi' ? 'कारण (R): ' : 'Reason (R): ') + r;
      options = AR_OPTIONS[ctx.lang === 'hi' ? 'hi' : 'en'].slice();
      const ci = Number.isInteger(raw.correctIndex) ? raw.correctIndex : parseInt(raw.correctIndex, 10);
      if (!(ci >= 0 && ci < 4)) return { error: 'bad correctIndex' };
      correct = ci;
    } else {
      if (qq.length < 10) return { error: 'question too short' };
      const o = validateOptions(raw);
      if (o.error) return o;
      const sh = shuffleOptions(o.options, o.correct, (ctx.seed || '') + qq);
      options = sh.options; correct = sh.correct;
    }
    const err = copyCheck(qq) || dupCheck(qq) || groundCheck(options[correct] + ' ' + explain);
    if (err) return { error: err };
    return { q: { ...base, q: qq, options, correct, answer: options[correct], explain, evidence, page, assertion: type === 'ar' ? CLIP(asStr(raw.assertion), 500) : undefined } };
  }

  if (type === 'fill') {
    if (!/_{2,}|\[blank\]|…{2,}/.test(q) || q.length < 12) return { error: 'blank missing' };
    const ans = CLIP(asStr(raw.answer), 120);
    if (!ans) return { error: 'no answer' };
    const err = copyCheck(q) || dupCheck(q) || groundCheck(ans + ' ' + q);
    if (err) return { error: err };
    return { q: { ...base, q: q.replace(/\[blank\]|…{2,}/g, '________'), answer: ans, accepted: (Array.isArray(raw.accepted) ? raw.accepted : []).map((x) => CLIP(asStr(x), 120)).filter(Boolean).slice(0, 4), explain, evidence, page } };
  }

  if (type === 'tf') {
    const val = raw.answer === true || /^true|सही|सत्य$/i.test(asStr(raw.answer).trim());
    const isFalse = raw.answer === false || /^false|गलत|असत्य$/i.test(asStr(raw.answer).trim());
    if (!val && !isFalse) return { error: 'true/false answer missing' };
    if (q.length < 10) return { error: 'statement too short' };
    const err = copyCheck(q) || dupCheck(q) || groundCheck(q);
    if (err) return { error: err };
    return { q: { ...base, q, answer: val ? (ctx.lang === 'hi' ? 'सही' : 'True') : (ctx.lang === 'hi' ? 'गलत' : 'False'), tfValue: !!val, explain, evidence, page } };
  }

  if (type === 'vsa' || type === 'sa' || type === 'la' || type === 'short') {
    if (q.length < 10) return { error: 'question too short' };
    const answer = CLIP(asStr(raw.answer ?? raw.modelAnswer), 2500);
    if (answer.length < 3) return { error: 'no model answer' };
    const points = allocatePoints(raw.keyPoints ?? raw.points ?? raw.markingPoints, marks);
    if (!points.length && marks > 1) return { error: 'no marking points' };
    const err = copyCheck(q) || dupCheck(q) || groundCheck(answer + ' ' + points.map((p) => p.t).join(' '));
    if (err) return { error: err };
    return { q: { ...base, q, answer, points, explain, evidence, page, words: plan.words } };
  }

  if (type === 'grammar') {
    if (q.length < 8) return { error: 'item too short' };
    const answer = CLIP(asStr(raw.answer), 400);
    if (!answer) return { error: 'no answer' };
    const err = dupCheck(q);
    if (err) return { error: err };
    return { q: { ...base, q, answer, explain } };
  }

  if (TYPE_META[type]?.writing) {
    if (q.length < 20) return { error: 'task too short' };
    const answer = CLIP(asStr(raw.answer ?? raw.modelAnswer), 3000);
    if (answer.length < 40) return { error: 'no model answer' };
    const err = dupCheck(q);
    if (err) return { error: err };
    return { q: { ...base, q, answer, points: allocatePoints(raw.keyPoints ?? raw.rubric, marks), words: plan.words } };
  }

  return { error: 'unknown type ' + type };
}

/* Composite types: a passage / case / extract plus a planned list of sub-questions. */
export function validateComposite(type, raw, plan, ctx) {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  const flat = [];
  for (const [t, n, m] of plan.sub) for (let i = 0; i < n; i++) flat.push({ t, m });
  const subRaw = Array.isArray(raw.subQuestions) ? raw.subQuestions : (Array.isArray(raw.questions) ? raw.questions : []);
  if (subRaw.length < flat.length) return { error: `needs ${flat.length} sub-questions, got ${subRaw.length}` };

  let passageText = '';
  if (type === 'extract') passageText = plan.fixedText || '';
  else passageText = stripMd(asStr(raw.passage ?? raw.caseText ?? raw.text)).slice(0, 4500);
  if (type === 'case' || type === 'passage') {
    const min = type === 'case' ? 18 : 28; // words (a short case can be a data table + two lines)
    if (passageText.split(/\s+/).length < min) return { error: 'passage too short' };
  } else if (type === 'extract' && passageText.split(/\s+/).length < 20) return { error: 'extract missing' };

  const items = [];
  const seenInside = [];
  for (let i = 0; i < flat.length; i++) {
    const { t, m } = flat[i];
    const sr = subRaw[i] || {};
    const subType = t === 'short' ? (m >= 3 ? 'sa' : 'vsa') : t === 'obj' ? 'fill' : t;
    let v;
    const subPlan = { marks: m, words: m <= 1 ? 'one word / one sentence' : m === 2 ? '30-40' : '50-60', noGround: type === 'passage' };
    const subCtx = { ...ctx, seen: [...(ctx.seen || []), ...seenInside], idx: type === 'passage' ? null : ctx.idx };
    if (t === 'obj') {
      const kind = ['fill', 'tf', 'short'][i % 3];
      const a = sr.answer;
      if (kind === 'tf' || sr.type === 'tf') v = validateQuestion('tf', sr, subPlan, subCtx);
      else if (kind === 'fill' || sr.type === 'fill') v = validateQuestion('fill', sr, subPlan, subCtx);
      else v = validateQuestion('vsa', { ...sr, keyPoints: sr.keyPoints || [asStr(a)] }, { ...subPlan, marks: 1 }, subCtx);
      if (v.q) v.q.marks = 1;
    } else if (t === 'map') {
      const q = CLIP(asStr(sr.question ?? sr.q), 300), ans = CLIP(asStr(sr.answer), 300);
      if (q.length < 6 || ans.length < 3) return { error: 'map item incomplete' };
      v = { q: { type: 'map', marks: 1, q, answer: ans, explain: CLIP(asStr(sr.explanation), 300), evidence: CLIP(asStr(sr.evidence), 300) } };
    } else if (t === 'mcq') {
      v = validateQuestion('mcq', sr, { marks: m, noGround: type === 'passage' }, subCtx);
    } else {
      v = validateQuestion(subType, { ...sr, keyPoints: sr.keyPoints || sr.points }, subPlan, subCtx);
    }
    if (v.error) return { error: `sub ${i + 1}: ${v.error}` };
    v.q.marks = m;
    items.push(v.q);
    seenInside.push(v.q.q);
  }
  const out = { type, marks: plan.marks, passage: passageText, items, evidence: CLIP(asStr(raw.evidence), 400), page: Number.isFinite(+raw.page) ? +raw.page : null, title: CLIP(asStr(raw.title), 140) };
  if (raw.dataTable) out.dataTable = CLIP(asStr(raw.dataTable), 1500);
  if (plan.words) out.words = plan.words;
  return { q: out };
}

/* ------------------------------ Planning ------------------------------ */
export function maxBatch(type) {
  if (type === 'mcq' || type === 'ar' || type === 'fill' || type === 'tf' || type === 'grammar') return 6;
  if (type === 'vsa') return 5;
  if (type === 'sa') return 4;
  if (type === 'la') return 3;
  if (TYPE_META[type]?.writing) return 2;
  if (type === 'obj') return 4;
  return 1; // composite: one passage / case / extract / map per request
}

/* Splits the enabled parts into generation tasks; each task asks for <= maxBatch questions. */
export function planTasks(sections, opts = {}) {
  const tasks = [];
  const choiceOn = !!opts.internalChoice;
  for (const s of sections) {
    s.parts.forEach((p, pi) => {
      if (p.enabled === false || p.count <= 0) return;
      if (opts.skipUnseen === true && p.unseen) return;
      const total = partGenerateCount(p, choiceOn);
      const sub = TYPE_META[p.type]?.composite && p.type !== 'obj' ? (p.sub || defaultSub(p.type, p.marks)) : null;
      let left = total, n = 0;
      const per = maxBatch(p.type);
      while (left > 0) {
        const take = Math.min(per, left);
        tasks.push({ id: `${s.key}${pi}-${n}`, section: s.key, partIndex: pi, type: p.type, marks: p.marks, count: take, startIndex: total - left, words: p.words, topic: p.topic, kindHint: p.kindHint, passageKind: p.passageKind, sub, subs: p.subs, lang: !!p.lang, status: 'pending' });
        left -= take; n++;
      }
    });
  }
  return tasks;
}

/* --------------------------- Source distribution --------------------------- */
/* Gives every task a distinct set of slices so the whole chapter set is covered evenly. */
export function distributeSlices(tasks, chapters) {
  // chapters: [{title, slices:[{pages,text}]}]
  const pool = [];
  const maxLen = Math.max(0, ...chapters.map((c) => c.slices.length));
  for (let i = 0; i < maxLen; i++) for (const c of chapters) if (c.slices[i]) pool.push({ chapter: c.title, ...c.slices[i] });
  if (!pool.length) return tasks.map((t) => ({ ...t, focus: [] }));
  let cursor = 0;
  return tasks.map((t) => {
    const need = Math.min(pool.length, t.type === 'extract' || TYPE_META[t.type]?.composite ? 1 : Math.max(1, Math.min(3, Math.ceil(t.count / 2))));
    const focus = [];
    for (let i = 0; i < need; i++) focus.push(pool[(cursor + i) % pool.length]);
    cursor += need;
    return { ...t, focus };
  });
}

/* ------------------------------- Assembly ------------------------------- */
/* Turns validated questions into the final ordered paper (numbering, OR pairing, attempt notes). */
export function assemblePaper(sections, results, opts = {}) {
  const choiceOn = !!opts.internalChoice;
  let no = 1;
  const out = [];
  for (const s of sections) {
    const sec = { key: s.key, title: s.title, blurb: s.blurb, parts: [] };
    s.parts.forEach((p, pi) => {
      if (p.enabled === false || p.count <= 0) return;
      const list = (results[`${s.key}${pi}`] || []).slice();
      const wantMain = p.count;
      const main = list.slice(0, wantMain);
      const extra = list.slice(wantMain);
      if (choiceOn && p.or && extra.length) {
        const n = Math.min(extra.length, p.or, main.length);
        // spread the OR questions over the part (every k-th question) rather than clustering them
        const step = Math.max(1, Math.floor(main.length / n));
        for (let i = 0; i < n; i++) { const at = Math.min(main.length - 1, Math.max(0, main.length - 1 - i * step)); if (!main[at].alt) main[at].alt = extra[i]; }
      }
      const qs = main.map((q) => ({ ...q, no: no++ }));
      sec.parts.push({ index: pi, type: p.type, count: p.count, attempt: p.attempt ?? null, marks: p.marks, words: p.words, topic: p.topic, questions: qs, missing: Math.max(0, wantMain - main.length) });
    });
    if (sec.parts.length) out.push(sec);
  }
  return out;
}

/* ------------------------------- Scoring ------------------------------- */
const normAns = (s) => normText(s).replace(/^(the|a|an)\s+/, '');
export function gradeObjective(q, ans) {
  if (ans == null || ans === '') return null;
  if (q.type === 'mcq' || q.type === 'ar') return ans === q.correct ? q.marks : 0;
  if (q.type === 'tf') return (ans === true || ans === 'true') === q.tfValue ? q.marks : 0;
  if (['fill', 'grammar', 'map'].includes(q.type) || ((q.type === 'vsa' || q.type === 'short') && q.marks <= 1)) {
    const u = normAns(ans);
    if (!u) return null;
    const ok = [q.answer, ...(q.accepted || [])].some((a) => normAns(a) === u || (u.length > 3 && normAns(a).includes(u) && u.split(' ').length >= normAns(a).split(' ').length * 0.6));
    return ok ? q.marks : 0;
  }
  return null;
}

/* Flattens a paper into the list of answerable units (questions or sub-questions). */
export function flattenUnits(paper) {
  const units = [];
  for (const sec of paper.sections || []) for (const part of sec.parts) for (const q of part.questions) {
    const push = (node, label, altOf) => {
      if (node.items?.length) node.items.forEach((it, i) => units.push({ id: `${q.no}${altOf ? 'o' : ''}.${i + 1}`, qNo: q.no, label: `${label}(${i + 1})`, sec: sec.key, partType: part.type, q: it, alt: !!altOf }));
      else units.push({ id: `${q.no}${altOf ? 'o' : ''}`, qNo: q.no, label, sec: sec.key, partType: part.type, q: node, alt: !!altOf });
    };
    push(q, String(q.no), false);
    if (q.alt) push(q.alt, q.no + ' (OR)', true);
  }
  return units;
}

/* For a question with an internal-choice alternative, the answered one (main first) is the one that counts. */
export function effectiveUnit(u, altById, answers) {
  const au = altById[u.id.replace('o', '')] && !u.alt ? altById[u.id] : null;
  const has = (id) => answers[id] !== undefined && answers[id] !== '' && answers[id] !== null;
  if (au && !has(u.id) && has(au.id)) return au;
  return u;
}

export function scorePaper(paper, answers = {}, selfMarks = {}) {
  let objGot = 0, objMax = 0, descGot = 0, descMax = 0, answered = 0, total = 0;
  const bySection = {};
  const all = flattenUnits(paper);
  const altById = {};
  all.filter((x) => x.alt).forEach((x) => { altById[x.id.replace('o', '')] = x; });
  for (const u0 of all) {
    if (u0.alt) continue;
    const au = altById[u0.id];
    const has = (id) => answers[id] !== undefined && answers[id] !== '' && answers[id] !== null;
    const u = au && !has(u0.id) && has(au.id) ? au : u0;
    const m = u0.q.marks || 0;
    total++;
    const a = answers[u.id];
    if (has(u.id)) answered++;
    const sec = (bySection[u0.sec] ||= { got: 0, max: 0 });
    sec.max += m;
    const isAuto = ['mcq', 'ar', 'tf', 'fill', 'map', 'grammar'].includes(u.q.type) || (u.q.type === 'vsa' && m <= 1) || (u.q.type === 'short' && m <= 1);
    if (isAuto) {
      const g = gradeObjective(u.q, a); objMax += m; const v = g == null ? 0 : g; objGot += v; sec.got += v;
    } else {
      descMax += m;
      const sm = selfMarks[u.id];
      if (typeof sm === 'number') { const v = Math.min(m, Math.max(0, sm)); descGot += v; sec.got += v; }
    }
  }
  return { objGot, objMax, descGot, descMax, got: objGot + descGot, max: objMax + descMax, answered, total, bySection };
}

/* Which blueprint-defined marks apply to a paper whose parts were edited. */
export function describePattern(bp, sections) {
  const t = totals(sections);
  const base = totals(bp.sections);
  return { ...t, official: t.marks === base.marks && t.questions === base.questions };
}
