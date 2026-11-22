// @ts-nocheck
import { fixLegacyHindi, fixLegacyItems, pageIsLegacyHindi } from '../hindi_fix.js';

export const AI_TOOLS = [
  {key:'summarize', label:'Summarize', icon:'fileText'},
  {key:'explain', label:'Explain simply', icon:'brain'},
  {key:'flashcards', label:'Flashcards', icon:'cards'},
  {key:'mcq', label:'MCQs', icon:'help'},
  {key:'important', label:'Key facts & dates', icon:'star'},
  {key:'meaning', label:'Word meaning', icon:'language'},
  {key:'revision', label:'Revision notes', icon:'edit'},
  {key:'paper', label:'Question Paper', icon:'paper'},
];

export async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function callStudyTool(toolKey, prompt, sourceText = '', isFullPage = false, pageNum = 1, systemInstruction = '') {
  try {
    const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');
    const isQuiz = toolKey === 'mcq' || (prompt && prompt.includes('JSON'));
    const timeoutMs = isQuiz ? 38000 : 45000;
    const res = await fetchWithTimeout('/api/ai/study-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolKey,
        prompt,
        sourceText,
        isFullPage,
        pageNum,
        model: 'gemini-3.1-flash-lite',
        customKey: customKey || undefined,
        systemInstruction: systemInstruction || undefined
      })
    }, timeoutMs);
    if (res.ok) {
      const data = await res.json();
      const text = (data.text || '').trim();
      if (text) {
        if (data.keySlot) {
          console.log(`[Study Tool] Successfully generated via [${data.keySlot}] with model [${data.model || 'gemini'}]`);
        }
        return text;
      }
    }
  } catch (err) {
    console.warn('Study tool endpoint attempt notice:', err.message);
  }
  return null;
}

export async function callServerGemini(prompt, systemInstruction = '', model = 'gemini-3.1-flash-lite') {
  try {
    const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');
    const res = await fetchWithTimeout('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemInstruction, model, customKey: customKey || undefined })
    }, 45000);
    if (res.ok) {
      const data = await res.json();
      const text = (data.text || '').trim();
      if (text) return text;
    }
  } catch (err) {
    console.warn('Server AI call attempt notice:', err.message);
  }
  return null;
}

export async function callDirectGemini(prompt, systemInstruction = '', model = 'gemini-3.1-flash-lite') {
  return await callServerGemini(prompt, systemInstruction, model);
}

export async function callGroqFast(prompt, maxTokens = 1200) {
  return await callServerGemini(prompt);
}

export async function callGroq70b(prompt, maxTokens = 1200) {
  return await callServerGemini(prompt);
}

export async function callOpenRouter(prompt, model = 'meta-llama/llama-3.3-70b-instruct', maxTokens = 1500) {
  return await callServerGemini(prompt);
}

export async function callGeminiFast(prompt, systemInstruction = '') {
  return await callServerGemini(prompt, systemInstruction, 'gemini-3.1-flash-lite');
}

export async function callGemini(prompt, systemInstruction = ''){
  return await callServerGemini(prompt, systemInstruction, 'gemini-3.1-flash-lite');
}

export async function callGroq(prompt){
  return await callServerGemini(prompt);
}

export function generateOfflineSmartSummary(toolKey, text, isFullPage = false, pageNum = 1, studyPage = 0, studyTotal = 4) {
  /* Used only when the AI service cannot be reached. It never invents content: it
     re-arranges real sentences from the page and says so. */
  const clean = String(text || '').replace(/^You are an expert[\s\S]*?"""/i, '').replace(/"""[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
  const sents = clean.split(/(?<=[.?!।])\s+/).map((x) => x.trim()).filter((x) => x.length > 25 && x.length < 400 && !/^#/.test(x));
  const note = '> ⚠️ **AI is not reachable right now.** These are the key sentences taken straight from the page, not an AI explanation. Try again when you are online.';
  if (!sents.length) {
    return `# 📄 PAGE 1 OF 1: Page ${pageNum}\n\n${note}\n\nThere is not enough readable text on this page (it may be a scanned image). Try again after text is available.`;
  }
  const label = { summarize: 'Summary', explain: 'Explanation', important: 'Key facts', revision: 'Revision points', meaning: 'Terms', notes: 'Notes' }[toolKey] || 'Key points';
  const dates = sents.filter((x) => /\b(1[0-9]{3}|20[0-9]{2})\b|\d+\s?(%|km|kg|cm|m|°C)/.test(x));
  const defs = sents.filter((x) => /\b(is called|is known as|refers to|is defined as|means)\b/i.test(x));
  const list = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join('\n');
  if (studyPage > 0) {
    const per = Math.max(3, Math.ceil(sents.length / studyTotal));
    const chunk = sents.slice((studyPage - 1) * per, studyPage * per);
    const head = `# 📄 PAGE ${studyPage} OF ${studyTotal}: ${label} (part ${studyPage})`;
    if (!chunk.length) return `${head}\n\nNothing further on this page.`;
    return `${head}\n\n${studyPage === 1 ? note + '\n\n' : ''}${list(chunk)}`;
  }
  const pagesOut = [
    `# 📄 PAGE 1 OF 3: ${label} from the page\n\n${note}\n\n${list(sents.slice(0, 5))}`,
    `# 📄 PAGE 2 OF 3: More from the page\n\n${sents.length > 5 ? list(sents.slice(5, 11)) : 'Nothing further on this page.'}`,
    `# 📄 PAGE 3 OF 3: Definitions and figures found\n\n${defs.length ? '**Definitions**\n' + list(defs.slice(0, 4)) : 'No definitions found.'}\n\n${dates.length ? '**Dates and figures**\n' + list(dates.slice(0, 5)) : 'No dates or figures found.'}`,
  ];
  return pagesOut.join('\n\n---\n');
}

export function splitMarkdownIntoStudyPages(markdownText) {
  if (!markdownText || typeof markdownText !== 'string') return [];

  // Match page headers like "# 📄 PAGE 1 OF 4: [Title]" or "## 📄 PAGE 1 / 4: [Title]" or "# PAGE 1:" or "--- \n# PAGE 1"
  const pageRegex = /(?:^|\n)(?:---\s*\n)?(?:#+\s*📄?\s*PAGE\s+(\d+)\s*(?:OF|\/)\s*(\d+)\s*[:•\-]?\s*([^\n]*))/gi;
  
  const matches = [...markdownText.matchAll(pageRegex)];
  
  if (matches.length >= 2) {
    const pages = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pageNum = parseInt(match[1], 10) || (i + 1);
      const totalPages = parseInt(match[2], 10) || matches.length;
      const title = (match[3] || '').trim() || `Page ${pageNum}`;
      
      const startIndex = match.index + match[0].length;
      const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : markdownText.length;
      const content = markdownText.substring(startIndex, endIndex).trim();
      
      pages.push({
        pageNum,
        totalPages,
        title,
        content
      });
    }
    return pages;
  }

  // Fallback: If not formatted with "# 📄 PAGE", check for "---" dividers
  const dividerParts = markdownText.split(/\n---\s*\n/).map(s => s.trim()).filter(Boolean);
  if (dividerParts.length >= 2) {
    return dividerParts.map((part, idx) => {
      const headingMatch = part.match(/^#+\s*(.+)$/m);
      const title = headingMatch ? headingMatch[1].replace(/^[#\s*📄]+/, '').trim() : `Section ${idx + 1}`;
      return {
        pageNum: idx + 1,
        totalPages: dividerParts.length,
        title,
        content: part
      };
    });
  }

  return [];
}

export async function callAI(prompt, toolKey = null, sourceText = '', isFullPage = false, pageNum = 1, systemInstruction = ''){
  const isQuiz = toolKey === 'mcq' || (prompt && (prompt.includes('JSON FORMAT') || prompt.includes('JSON array')));
  const effectiveSys = systemInstruction || (isQuiz ? "You are an elite Board Examination Paper Setter. Return ONLY a valid JSON array of question objects without markdown backticks." : '');

  // Primary Layer: Dedicated Study Tool Multi-Key Pool (Gemini 3.1 Flash Lite -> Groq -> OpenRouter)
  try {
    const studyRes = await callStudyTool(toolKey || 'study', prompt, sourceText, isFullPage, pageNum, effectiveSys);
    if (studyRes && studyRes.length > 5) return studyRes;
  } catch(e) {
    console.warn('callAI study tool pool notice:', e.message);
  }

  // Backup Layer: Universal Server AI
  try {
    const text = await callServerGemini(prompt, effectiveSys || 'You are an elite academic tutor & exam specialist.', 'gemini-3.1-flash-lite');
    if (text && text.length > 5) return text;
  } catch(e) {
    console.warn('callAI primary server Gemini attempt notice:', e.message);
  }

  // If Quiz generation failed, do not return markdown summary
  if (isQuiz) {
    return null;
  }

  // Final Intelligent Offline Fallback: Extract from actual source text
  return generateOfflineSmartSummary(toolKey || 'explain', sourceText || prompt, isFullPage, pageNum);
}

export function cleanStudyMarkdownOutput(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  // Strip single/stacked placeholder blocks like blockquote or heading followed only by "Not covered on this page."
  s = s.replace(/(?:^|\n)(?:#{1,6}[^\n]*\n+|>\s*[^\n]*\n+)*>\s*\*?Not covered on this page\.?\*?\s*(?=\n|$)/gi, '\n');
  s = s.replace(/(?:^|\n)#{1,6}[^\n]*\n+(?:[-*•]\s*)?\*?Not covered on this page\.?\*?\s*(?=\n|$)/gi, '\n');
  s = s.replace(/^[ \t]*(?:>\s*)?\*?Not covered on this page\.?\*?[ \t]*$/gmi, '');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

const GROUNDING_RULES = `

STRICT ACCURACY & FORMATTING RULES (these override everything above):
- Use ONLY facts that appear in the Source Text. Never invent dates, numbers, names, formulas, examples, definitions or "facts" from memory.
- NEVER write "Not covered on this page.", "Not mentioned", "None found", or empty placeholder sections/tables. If the Source Text lacks dates, formulas, or comparison items for a suggested section, completely OMIT that heading/table and replace it with structured key facts, mechanisms, or principles actually present in the Source Text.
- Explain in your own words with rich exam clarity. Do not paste long runs of the source; short quoted terms are great.
- Do not repeat the same point under different headings.
- Keep technical terms accurate to the Source Text, and keep every Mermaid label short, plain text without brackets or quotes inside the label.
- Exam questions you write must be answerable from the Source Text, and the model answer must match it.`;

export function getAIToolPromptForPage(...args) {
  const base = buildAIToolPromptForPage(...args);
  return base ? base + GROUNDING_RULES : base;
}

function buildAIToolPromptForPage(toolKey, text, targetPageNum = 1, totalPages = 4, isFullPage = false, sourcePageNum = 1, previousPagesContext = '', customScopeLabel = '') {
  const scopeDesc = customScopeLabel || (isFullPage ? `Page ${sourcePageNum}` : `Selected Passage`);

  if (toolKey === 'summarize') {
    if (targetPageNum === 1) {
      return `You are an elite academic professor and master curriculum analyst.
Generate **PAGE 1 OF 4** of a systematic academic study dossier for ${scopeDesc}.

YOUR GOAL FOR PAGE 1: Thoroughly cover the **FIRST SET OF TOPICS & CORE FOUNDATIONS** found in the text.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (include only sections supported by the Source Text; omit any unsupported section):
# 📄 PAGE 1 OF 4: Core Foundations & First Principles

> 💡 **Executive Thesis**: (2-3 detailed sentences establishing the primary overarching concept and academic significance of these first topics)

## 📌 Foundational Themes & Definitions
(Exhaustively break down the first 2-3 topics/concepts from the text with full pedagogical depth)
- **Primary Foundational Topic**: (Thorough, deep-dive academic breakdown with **bold key terms**, mechanisms, and context)
- **Secondary Concept & Role**: (In-depth explanation with **bold key terms** and clear cause-and-effect)
- **Core Definitions & Terminology**: (Precise definitions of all technical terms introduced in these starting topics)

> ⚡ **Key Takeaway for Foundation**: (High-impact callout summarizing why these starting principles are vital)`;
    }

    if (targetPageNum === 2) {
      return `You are an elite academic professor and master curriculum analyst.
Generate **PAGE 2 OF 4** of a systematic academic study dossier for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Thoroughly cover the **MIDDLE TOPICS, OPERATIONAL MECHANISMS & STEP-BY-STEP PROCESSES** from the text.
(Build upon the foundation without repeating Page 1).

Source Text:
"""${text}"""
${previousPagesContext ? `\n[Context of Page 1 already covered]:\n${previousPagesContext.slice(0, 500)}` : ''}

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 2 OF 4: Operational Mechanisms & Process Dynamics

## ⚙️ Step-by-Step Mechanisms & Intermediate Topics
(Exhaustively break down the middle sections, step-by-step progressions, and intermediate concepts)
- **Operational Mechanism 1**: (Step-by-step walkthrough with **bold terms**, conditions, and triggers)
- **Operational Mechanism 2**: (Detailed sequence of events or governing interactions)
- **Nuances & Boundary Conditions**: (Critical variables, dependencies, or special conditions)

## 🗺️ Operational Process Flowchart
\`\`\`mermaid
flowchart TD
  A["[Stage 1: Core Trigger / Input]"] --> B["[Stage 2: Process Mechanism]"]
  B --> C["[Stage 3: Result & Direct Impact]"]
\`\`\`

> 🔍 **Mechanism Insight**: (High-impact callout box explaining the direct cause-and-effect relationship)`;
    }

    if (targetPageNum === 3) {
      return `You are an elite academic professor and master curriculum analyst.
Generate **PAGE 3 OF 4** of a systematic academic study dossier for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Thoroughly cover the **FINAL REMAINING TOPICS, ADVANCED APPLICATIONS & COMPARISONS** from the text.

Source Text:
"""${text}"""
${previousPagesContext ? `\n[Summary of Topics already covered in Pages 1-2]:\n${previousPagesContext.slice(0, 600)}` : ''}

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 3 OF 4: Advanced Applications, Comparisons & Nuances

## 🔬 Advanced Topics & Practical Implementations
(Exhaustively break down the concluding sections, downstream effects, and real-world applications)
- **Advanced Application 1**: (Exhaustive pedagogical explanation with **bold terms** and practical examples)
- **Concluding Concept & Implications**: (Detailed analysis of outcomes and academic conclusions)

## ⚡ High-Yield Comparison Matrix
(Create a table ONLY because comparing these concepts adds genuine academic value)
| Concept / Element | Core Mechanism & Role | Critical Distinction |
| :--- | :--- | :--- |
| **Concept A** | (Precise function) | (Distinct attribute) |
| **Concept B** | (Precise function) | (Distinct attribute) |

> 📌 **Synthesis Callout**: (How all components interact in the overall system)`;
    }

    if (targetPageNum === 4) {
      return `You are an elite academic professor and master exam strategist.
Generate **PAGE 4 OF 4** of a systematic academic study dossier for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **COMPREHENSIVE MASTER SYNTHESIS of Pages 1, 2, and 3** + **DETAILED HIGH-YIELD THINGS TO REMEMBER & EXAM BLUEPRINT**.

Source Text:
"""${text}"""
${previousPagesContext ? `\n[Prior Pages Content Overview]:\n${previousPagesContext.slice(0, 800)}` : ''}

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 4 OF 4: Master Synthesis & High-Yield Things to Remember

> 🎯 **Master Executive Recap**: (Crisp 3-sentence synthesis tying together Page 1's Foundations, Page 2's Mechanisms, and Page 3's Advanced Applications)

## 📌 Critical High-Yield Things to Remember
- **Must-Know Law / Principle**: (Exact rule and formulation with **bold terms**)
- **Essential Cause-and-Effect Chain**: (The golden sequence examiners test)
- **Crucial Constants & Key Values**: (Figures, ratios, dates, or milestone values if any)

## 🎯 High-Probability Exam Traps & Model Answers
1. **Q: (Predicted High-Probability Exam Question testing the core concept)**  
   *Model Answer:* (Accurate, comprehensive model answer formatted for full marks)
2. **Q: (Predicted Multi-Concept Synthesis Question)**  
   *Model Answer:* (Accurate, comprehensive model answer formatted for full marks)

> ⚠️ **Examiner Pitfall Alert**: (Common mistake students make and how to easily secure top marks)`;
    }
  }

  if (toolKey === 'explain') {
    if (targetPageNum === 1) {
      return `You are a world-class academic tutor and master educator.
Generate **PAGE 1 OF 4** of an intuitive Masterclass Explanation for ${scopeDesc}.

YOUR GOAL FOR PAGE 1: Explain the **CORE INTUITION, EVERYDAY ANALOGIES & FIRST TOPICS** with crystal-clear clarity.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 1 OF 4: Core Intuition, Analogies & Mental Models

> 💡 **1-Minute Real-World Analogy**: (Vivid, memorable everyday analogy breaking down the central concept so anyone grasps it immediately)

## 🗺️ Conceptual Flowchart
\`\`\`mermaid
flowchart TD
  A["[Starting Concept / Core Foundation]"] --> B["[Underlying Dynamic / Mechanism]"]
  B --> C["[Direct Academic Impact / Result]"]
  C --> D["[Core Takeaway / Exam Scoring Rule]"]
\`\`\`
*(CRITICAL: Always use valid Mermaid.js flowchart syntax \`\`\`mermaid flowchart TD ... \`\`\`. Never use ASCII art or text boxes).*

## 📌 Starting Concepts Explained Simply
- **First Core Topic**: (Clear pedagogical breakdown in plain language with **bold keywords**)
- **Fundamental Rule**: (Why this rule exists and what problem it solves)

> 🌟 **Intuition Spark**: (Key mental picture to hold onto)`;
    }

    if (targetPageNum === 2) {
      return `You are a world-class academic tutor and master educator.
Generate **PAGE 2 OF 4** of an intuitive Masterclass Explanation for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Explain the **DEEP WORKING MECHANICS & INTERMEDIATE PROCESSES** step-by-step in simple language.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 2 OF 4: Step-by-Step Mechanisms & Working Principles

## ⚙️ How the System Actually Works (Step-by-Step)
1. **Initial Trigger**: (What starts the process, explained with **bold terms**)
2. **Internal Transformation**: (What happens inside the system step-by-step)
3. **Outcome Generation**: (Why the output occurs and how variables influence it)

- **Detailed Topic Breakdown**: (Exhaustive explanation of middle concepts without jargon)

> 🔍 **Why It Matters**: (Simple explanation of why this step cannot be skipped)`;
    }

    if (targetPageNum === 3) {
      return `You are a world-class academic tutor and master educator.
Generate **PAGE 3 OF 4** of an intuitive Masterclass Explanation for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Explain the **ADVANCED APPLICATIONS, COMPARISONS & REAL-WORLD BEHAVIORS**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 3 OF 4: Advanced Scenarios, Comparisons & Applications

## 🔬 Real-World Application & Nuances
- **Practical Application**: (How this concept behaves in real academic/practical contexts with **bold terms**)
- **Special Cases & Edge Conditions**: (What happens when conditions change)

## ⚡ Concept Clarity Matrix
| Concept | Simple Analogy | Practical Meaning |
| :--- | :--- | :--- |
| **Concept 1** | (Analogy) | (Plain English explanation) |
| **Concept 2** | (Analogy) | (Plain English explanation) |

> 💡 **Nuance Highlight**: (The subtle distinction that makes students understand deeply)`;
    }

    if (targetPageNum === 4) {
      return `You are a world-class academic tutor and master educator.
Generate **PAGE 4 OF 4** of an intuitive Masterclass Explanation for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **COMPLETE INTUITIVE SUMMARY of Pages 1-3** + **MEMORY HOOKS, MNEMONICS & HIGH-YIELD EXAM SCORING SECRETS**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 4 OF 4: Complete Recap, Memory Mnemonics & Exam Secrets

> 🎯 **Master Intuitive Summary**: (3-sentence simple summary wrapping up all concepts covered across Pages 1, 2, and 3)

## 🧠 Memory Hooks & Mnemonics
- 🎯 **Catchy Mnemonic**: (A clever rhyme, acronym, or memory trick to remember the entire flow)
- 🔑 **Golden Keyword Rule**: (The exact keywords that examiners look for)

## ⚡ High-Scoring Exam Advice
- **Core Concept Question**: (What examiners love to ask and the simplest way to explain it for full marks)
- **Common Confusion Cleared**: (How to avoid mixing up similar-sounding concepts)

> 🏆 **Mastery Callout**: (Confidence booster and quick 1-line exam anchor)`;
    }
  }

  if (toolKey === 'important') {
    if (targetPageNum === 1) {
      return `You are an elite academic researcher and archivist.
Generate **PAGE 1 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 1: Extract all **KEY FACTS, DATES, HISTORICAL TIMELINES OR CORE SEQUENTIAL MILESTONES** directly present in the text.
- If the text includes historical dates, years, or researchers, build a chronological milestone breakdown.
- If the text describes a scientific/conceptual topic without historical dates, extract the **Core Factual Anchors, Process Stages & Key Elements** in structured points/tables instead of empty timeline headings.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE:
# 📄 PAGE 1 OF 4: Key Facts, Dates & Core Milestones

> 💡 **Core Factual Overview**: (Concise synthesis of the primary verified facts, milestones, or dates present on this page)

## 📊 Key Milestones & Essential Facts
- **Fact / Milestone 1**: (Concrete grounded fact, year, figure, or core process stage with **bold key terms**)
- **Fact / Milestone 2**: (Concrete grounded fact, year, figure, or core process stage with **bold key terms**)
(Add a clean 2–4 row markdown table ONLY if dates, stages, or multi-attribute facts exist to compare.)

> 📌 **Factual Anchor**: (Why these starting facts or stages form the backbone of this topic)`;
    }

    if (targetPageNum === 2) {
      return `You are an elite academic researcher and archivist.
Generate **PAGE 2 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Extract all **ESSENTIAL ACADEMIC DEFINITIONS & TECHNICAL LEXICON**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 2 OF 4: Academic Lexicon & Precise Definitions

## 🏷️ Exhaustive Academic Terminology
(Extract and explain every specialized term and definition present in the Source Text)
1. **Primary Technical Term**: (Precise academic definition, contextual role, and **bold keywords**)
2. **Secondary Technical Term**: (Precise academic definition, contextual role, and **bold keywords**)
3. **Operational Term**: (Definition and specific function in this chapter)

> 💡 **Lexicon Note**: (Key distinctions between technical definitions found in the text)`;
    }

    if (targetPageNum === 3) {
      return `You are an elite academic researcher and archivist.
Generate **PAGE 3 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Extract all **GOVERNING LAWS, EQUATIONS, REACTIONS, NUMERICAL DATA & CORE CONDITIONS** directly mentioned in the text (omit any missing category without placeholder text).

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE:
# 📄 PAGE 3 OF 4: Governing Laws, Equations & Key Conditions

## ⚡ Key Principles, Formulations & Specifics
- **Governing Principle / Mechanism**: (Exact rule statement and operating conditions from the text)
- **Reaction / Formula / Relationship**: (Include equations, chemical reactions, ratios, or numerical figures mentioned in the text)
- **Specific Quantities, Inputs & Conditions**: (Concrete inputs, outputs, locations, or percentages present in the text)

> 🔬 **Precision Insight**: (Critical distinction, constraint, or detail examiners focus on)`;
    }

    if (targetPageNum === 4) {
      return `You are an elite academic researcher and exam specialist.
Generate **PAGE 4 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **COMPLETE FACTUAL RECAP of Pages 1-3** + **GUARANTEED SCORING FACTS & HIGH-FREQUENCY EXAM TRAPS**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 4 OF 4: Complete Factual Summary & High-Yield Exam Traps

> 🎯 **Master Factual Digest**: (3-sentence summary synthesizing all dates from Page 1, definitions from Page 2, and formulas from Page 3)

## 📌 Guaranteed High-Frequency Scoring Facts
- **Top Exam Fact 1**: (Direct fact frequently tested in multiple-choice or short-answer exams)
- **Top Exam Fact 2**: (Direct fact with exact terminology for maximum marks)

## ⚠️ High-Probability Examiner Traps
- **Common Confusion Trap**: (Commonly mixed-up dates, similar definitions, or formula signs)
- **Examiner Angle**: (How questions are phrased to test deep precision)

> ⚡ **Guaranteed Mark Checklist**: (Instant 3-point checklist to guarantee full marks on factual questions)`;
    }
  }

  if (toolKey === 'revision') {
    if (targetPageNum === 1) {
      return `You are an elite exam revision strategist.
Generate **PAGE 1 OF 4** of the Master Revision Blueprint for ${scopeDesc}.

YOUR GOAL FOR PAGE 1: Rapidly summarize the **FIRST SET OF PRINCIPLES & INITIAL CONCEPT PROGRESSION FLOW**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 1 OF 4: Rapid Concept Progression & Foundation Flow

> 💡 **30-Second Revision Anchor**: (Crisp 2-sentence foundation takeaway)

## 🗺️ Visual Concept Progression Flowchart
\`\`\`mermaid
flowchart TD
  A["[Foundation: Core Concept 1]"] --> B["[Process: Intermediate Dynamic 2]"]
  B --> C["[Outcome: Key Exam Rule 3]"]
\`\`\`
*(CRITICAL: Always use valid Mermaid.js flowchart syntax \`\`\`mermaid flowchart TD ... \`\`\`. Never output plain text ASCII brackets).*

## 📌 Rapid Principles (Section 1)
- **Core Principle 1**: (High-yield bullet with **bold terms** and crucial rule)
- **Core Principle 2**: (High-yield bullet with **bold terms** and crucial rule)

> ⚡ **Rapid Recall**: (Core principle in 10 words or less)`;
    }

    if (targetPageNum === 2) {
      return `You are an elite exam revision strategist.
Generate **PAGE 2 OF 4** of the Master Revision Blueprint for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Rapidly summarize the **OPERATIONAL MECHANICS & INTERMEDIATE RULES**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 2 OF 4: Operational Mechanics & Rapid Rules

## ⚙️ Fast-Track Mechanism Breakdown
1. **Rule 1**: (Step-by-step dynamic with **bold keywords**)
2. **Rule 2**: (Cause-and-effect progression)
3. **Critical Conditions**: (Boundary parameters or exceptions)

> 🔍 **Revision Rule**: (Key equation or mechanism to write down first in an exam)`;
    }

    if (targetPageNum === 3) {
      return `You are an elite exam revision strategist.
Generate **PAGE 3 OF 4** of the Master Revision Blueprint for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Provide a **QUICK-REFERENCE COMPARISON MATRIX & HIGH-YIELD FORMULA LIST**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 3 OF 4: Quick-Reference Comparison Matrix & Formulas

## ⚡ Master Quick-Reference Matrix
| Core Concept | Governing Rule | Exam Priority |
| :--- | :--- | :--- |
| **Topic A** | (Crisp 1-line rule) | ⭐⭐⭐ High Yield |
| **Topic B** | (Crisp 1-line rule) | ⭐⭐⭐ High Yield |

## 📝 Essential Formulas & Relationships
- **Formula 1**: (Clean text representation with key variables)
- **Key Proportions**: (Direct and inverse relationships)

> 📌 **Quick Reference Callout**: (How to quickly solve related calculation questions)`;
    }

    if (targetPageNum === 4) {
      return `You are an elite exam revision strategist.
Generate **PAGE 4 OF 4** of the Master Revision Blueprint for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **COMPLETE REVISION RECAP of Pages 1-3** + **60-SECOND ACTIVE RECALL CHECKLIST & EXAM TRAPS**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 4 OF 4: Complete Revision Summary & 60-Second Active Recall

> 🎯 **Master 60-Second Digest**: (3-sentence summary tying together Page 1's Foundations, Page 2's Mechanics, and Page 3's Matrix)

## ✅ 60-Second Active Recall Checklist
- [ ] **Core Definition**: Can you recite the central principle without looking?
- [ ] **Working Mechanism**: Do you know the step-by-step sequence from start to finish?
- [ ] **Key Formulas & Units**: Have you memorized the exact relationships and units?
- [ ] **Edge Cases**: Do you know the #1 trap examiners test?

> ⚡ **Top Scoring Tip**: (Exact keyword combination examiners award full marks for)

> ⚠️ **Examiner Trap Alert**: (Common student mistake and how to avoid losing marks)`;
    }
  }

  if (toolKey === 'notes') {
    if (targetPageNum === 1) {
      return `You are an elite academic professor and master notes architect.
Generate **PAGE 1 OF 4** of Comprehensive Structured Study Notes for ${scopeDesc}.

YOUR GOAL FOR PAGE 1: Architect the **CHAPTER FOUNDATIONS, CORE HIERARCHY & CONCEPT FLOWCHART**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 1 OF 4: Chapter Architecture & Core Foundations

> 💡 **Core Overview**: (Authoritative 2-3 sentence overview defining the foundational scope)

## 🗺️ Concept Architecture Flowchart
\`\`\`mermaid
flowchart TD
  A["[Chapter Core Theme]"] --> B["[Foundational Pillar 1]"]
  A --> C["[Foundational Pillar 2]"]
  B --> D["[Core Principle / Law]"]
  C --> E["[Governing Mechanism]"]
\`\`\`
*(CRITICAL: Always output valid Mermaid.js flowchart syntax \`\`\`mermaid flowchart TD ... \`\`\`. Never use ASCII art).*

## 📌 Section 1: Foundational Principles
- **Core Principle 1**: (Deep-dive academic explanation with **bold keywords** and context)
- **Essential Terminology**: (Clear definitions of foundational concepts)

> ⚡ **Foundation Anchor**: (Key takeaway to remember)`;
    }

    if (targetPageNum === 2) {
      return `You are an elite academic professor and master notes architect.
Generate **PAGE 2 OF 4** of Comprehensive Structured Study Notes for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Cover the **INTERMEDIATE MECHANISMS & STEP-BY-STEP PROCESSES**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 2 OF 4: Process Dynamics & Intermediate Mechanisms

## ⚙️ Detailed Process Walkthrough
1. **Primary Mechanism**: (Step-by-step walkthrough with **bold terms**)
2. **Intermediate Interaction**: (Detailed cause-and-effect progression)
3. **Special Conditions & Variables**: (Governing boundaries and rules)

> 🔍 **Process Note**: (Why this mechanism is central to the topic)`;
    }

    if (targetPageNum === 3) {
      return `You are an elite academic professor and master notes architect.
Generate **PAGE 3 OF 4** of Comprehensive Structured Study Notes for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Provide a **CONCEPT COMPARISON MATRIX & ADVANCED APPLICATIONS**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 3 OF 4: Concept Matrix & Advanced Applications

## ⚡ Master Comparison Matrix
| Core Concept | Governing Rule | Practical Impact |
| :--- | :--- | :--- |
| **Concept A** | (Rule statement) | (Impact) |
| **Concept B** | (Rule statement) | (Impact) |

## 🔬 Practical Applications & Nuances
- **Application 1**: (Real-world or exam context)
- **Critical Distinction**: (Nuanced boundary condition)

> 📌 **Synthesis Callout**: (How these concepts interlock)`;
    }

    if (targetPageNum === 4) {
      return `You are an elite academic professor and master notes architect.
Generate **PAGE 4 OF 4** of Comprehensive Structured Study Notes for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **MASTER SYNTHESIS & HIGH-YIELD EXAM BLUEPRINT**.

Source Text:
"""${text}"""

RECOMMENDED STRUCTURE (omit any optional section or table not supported by the Source Text):
# 📄 PAGE 4 OF 4: Master Synthesis & High-Yield Exam Blueprint

> 🎯 **Master Synthesis**: (3-sentence comprehensive wrap-up across all 3 prior pages)

## 📌 High-Yield Things to Remember
- **Golden Rule / Law**: (Exact statement and formulation)
- **Top Scoring Fact**: (Frequently tested exam point)
- **Examiner Trap Alert**: (Common misconception to avoid)

> 🏆 **Exam Mastery Rule**: (Direct scoring guideline)`;
    }
  }

  // Generic fallback
  return `Generate Page ${targetPageNum} of ${totalPages} for ${toolKey} based on this text:\n\n"""${text}"""`;
}

/**
 * High-performance Progressive Markdown Streaming Typewriter
 * Streams markdown into target element smoothly without abrupt pop-ins,
 * while allowing instant skip-to-end on click.
 */
export function streamMarkdownTypewriter(targetEl, fullMarkdown, onComplete) {
  if (typeof window.streamMorphicWave === 'function') {
    return window.streamMorphicWave(targetEl, fullMarkdown, onComplete);
  }
  return new Promise((resolve) => {
    if (!targetEl || !fullMarkdown || fullMarkdown.length < 25) {
      if (targetEl) targetEl.innerHTML = (typeof window.renderMarkdown === 'function' ? window.renderMarkdown(fullMarkdown || '') : (fullMarkdown || ''));
      if (onComplete) onComplete();
      resolve();
      return;
    }

    const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);
    targetEl.innerHTML = renderMd(fullMarkdown);
    if (onComplete) onComplete();
    resolve();
  });
}
window.streamMarkdownTypewriter = streamMarkdownTypewriter;

/**
 * Universal Master Academic Study Modal Runner
 * Handles: Summarize, Explain, Key Facts & Dates, Revision Blueprint, Vocabulary, Notes, Flashcards, and MCQs
 * Features:
 * - Instant IndexedDB cache lookup (loads saved notes instantly)
 * - "Loaded from storage" banner with timestamp and quick "🔄 Regenerate" link
 * - Dedicated Action Bar with:
 *    - 🔄 Generate New (fresh AI run)
 *    - 💾 Save to Notes (direct save to IndexedDB notebook with toast)
 *    - 📋 Copy Content (one-tap clipboard copy)
 *    - 🗂️ Add Flashcards to Review Deck (for flashcards)
 * - Clean math/symbol formatting without weird unparsed LaTeX tokens
 */
export async function runAcademicStudyModal(initialTool, sel, isDetailed = true, pageNum = 1, forceRegenerate = false) {
  const activeToolKey = typeof initialTool === 'string' ? initialTool : (initialTool?.key || 'summarize');
  const doc = window.State?.currentDoc;
  const currentFileId = window.State?.currentFile?.id || 'doc';
  const fileTitle = window.State?.currentFile?.name || 'Academic Document';
  const numPages = window.State?.numPages || 1;
  const curPage = pageNum || window.State?.currentPage || 1;

  const rawText = typeof sel === 'string' ? sel : (sel?.text || '');
  const hasTextSelection = Boolean(sel?.isSelection || (!isDetailed && rawText && rawText.length > 0 && rawText.length < 600 && rawText.trim()));
  const pageText = (rawText && rawText.trim()) ? rawText.trim() : (typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : `Chapter content on Page ${curPage}`);
  const resolvedSel = typeof sel === 'object' && sel !== null ? { ...sel, text: pageText, pageNum: curPage, isSelection: hasTextSelection } : { text: pageText, pageNum: curPage, isSelection: hasTextSelection };

  // 1. Tool Master Configurations
  const toolConfigs = {
    summarize: {
      key: 'summarize',
      label: 'Summary Dossier',
      sublabel: 'Executive thesis, foundational themes & 4-page academic synthesis',
      icon: 'fileText',
      accentColor: '#E05314',
      kind: 'Summary Dossier',
      btnLabel: 'Generate Chapter Summary',
      pageTitles: [
        'Core Foundations & Executive Thesis',
        'Operational Mechanisms & Process Dynamics',
        'Concept Comparison Matrix & Applications',
        'Master Synthesis & High-Yield Exam Blueprint'
      ]
    },
    explain: {
      key: 'explain',
      label: 'Explain Simply',
      sublabel: 'Intuitive masterclass breakdown, real-world analogies & flowcharts',
      icon: 'brain',
      accentColor: '#2563EB',
      kind: 'Masterclass Explanation',
      btnLabel: 'Generate Masterclass Explanation',
      pageTitles: [
        'Core Intuition & 1-Minute Analogy',
        'Step-by-Step Mechanisms & Working Principles',
        'Advanced Scenarios, Comparisons & Applications',
        'Complete Recap, Memory Mnemonics & Exam Secrets'
      ]
    },
    important: {
      key: 'important',
      label: 'Key Facts & Dates',
      sublabel: 'Chronological timeline, key formulas, constants & high-yield exam traps',
      icon: 'calendar',
      accentColor: '#D97706',
      kind: 'Key Facts & Dates',
      btnLabel: 'Extract Key Facts & Dates',
      pageTitles: [
        'Key Facts, Dates & Core Milestones',
        'Academic Lexicon & Technical Terms',
        'Governing Laws, Equations & Conditions',
        'Complete Factual Summary & High-Yield Exam Traps'
      ]
    },
    revision: {
      key: 'revision',
      label: 'Revision Blueprint',
      sublabel: 'High-speed concept matrix, memory hooks, mnemonics & scoring rules',
      icon: 'zap',
      accentColor: '#7C3AED',
      kind: 'Revision Blueprint',
      btnLabel: 'Construct Revision Blueprint',
      pageTitles: [
        'Rapid Concept Progression & Foundation Flow',
        'Operational Mechanics & Rapid Rules',
        'Quick-Reference Comparison Matrix & Formulas',
        'High-Speed Exam Cram Sheet & Scoring Secrets'
      ]
    },
    notes: {
      key: 'notes',
      label: 'Comprehensive Notes',
      sublabel: 'Hierarchical study outline, mechanisms & detailed reference guide',
      icon: 'edit',
      accentColor: '#4F46E5',
      kind: 'Comprehensive Notes',
      btnLabel: 'Build Comprehensive Notes',
      pageTitles: [
        'Foundational Principles & Core Overview',
        'Process Dynamics & Intermediate Mechanisms',
        'Concept Matrix & Advanced Applications',
        'Master Synthesis & High-Yield Exam Blueprint'
      ]
    },
    flashcards: {
      key: 'flashcards',
      label: 'Active Recall Flashcards',
      sublabel: 'Exam-targeted question & answer cards with spaced repetition ratings',
      icon: 'layers',
      accentColor: '#E11D48',
      kind: 'Flashcards Deck',
      btnLabel: 'Generate Flashcards Deck',
      pageTitles: [
        'Foundational Flashcards (Deck 1)',
        'Core Mechanisms Flashcards (Deck 2)',
        'Advanced Applications Flashcards (Deck 3)',
        'Exam Scoring Mastery Flashcards (Deck 4)'
      ]
    },
    meaning: {
      key: 'meaning',
      label: 'Academic Lexicon & Glossary',
      sublabel: 'Subject vocabulary, contextual definitions, etymology & Hindi anchors',
      icon: 'bookOpen',
      accentColor: '#0891B2',
      kind: 'Academic Glossary',
      btnLabel: 'Extract Academic Lexicon',
      pageTitles: [
        'Foundational Terminology & Glossary',
        'Technical & Domain-Specific Lexicon',
        'Contextual Phrases & Conceptual Vocabulary',
        'Master Vocabulary Review & Etymology'
      ]
    }
  };

  const activeConfig = toolConfigs[activeToolKey] || toolConfigs.summarize;

  // 2. Load TOC Chapters (Tier 0 Ground Truth)
  let chapterList = [];
  if (doc && typeof window.getChapterList === 'function') {
    try {
      chapterList = await window.getChapterList(doc, currentFileId);
    } catch (e) {
      console.warn('Error loading chapter list in study modal:', e);
    }
  }

  // Initial Scope: Default to Entire Chapter unless user specifically highlighted a text snippet
  let selectedScope = hasTextSelection ? 'page' : 'chapter';
  let selectedChapterIndex = 0;

  if (chapterList.length > 0) {
    const matchIdx = chapterList.findIndex(ch => curPage >= ch.startPage && curPage <= ch.endPage);
    if (matchIdx >= 0) selectedChapterIndex = matchIdx;
  }

  let rangeStart = chapterList.length > 0 && chapterList[selectedChapterIndex] ? chapterList[selectedChapterIndex].startPage : curPage;
  let rangeEnd = chapterList.length > 0 && chapterList[selectedChapterIndex] ? chapterList[selectedChapterIndex].endPage : Math.min(curPage + 5, numPages);

  const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);

  // Helper to construct scope description
  function getCurrentScopeDesc() {
    if (selectedScope === 'chapter' && chapterList.length > 0) {
      const ch = chapterList[selectedChapterIndex] || chapterList[0];
      return {
        type: 'chapter',
        title: ch.label || `Chapter (pp. ${ch.startPage}–${ch.endPage})`,
        shortTitle: ch.title || `Chapter`,
        startPage: ch.startPage,
        endPage: ch.endPage,
        pageCount: ch.pageCount || (ch.endPage - ch.startPage + 1),
        cacheKey: `study_${activeToolKey}_${currentFileId}_ch${selectedChapterIndex}_${ch.startPage}_${ch.endPage}`
      };
    } else if (selectedScope === 'range') {
      const s = Math.max(1, Math.min(rangeStart, numPages));
      const e = Math.max(s, Math.min(rangeEnd, numPages));
      const span = e - s + 1;
      return {
        type: 'range',
        title: `Pages ${s}–${e}`,
        shortTitle: `Pages ${s}–${e}`,
        startPage: s,
        endPage: e,
        pageCount: span,
        cacheKey: `study_${activeToolKey}_${currentFileId}_r${s}_${e}`
      };
    } else {
      return {
        type: 'page',
        title: resolvedSel.isSelection ? `Selected Passage (p. ${curPage})` : `Page ${curPage}`,
        shortTitle: `Page ${curPage}`,
        startPage: curPage,
        endPage: curPage,
        pageCount: 1,
        cacheKey: `study_${activeToolKey}_${currentFileId}_p${curPage}_${isDetailed ? 'full' : 'sel'}`
      };
    }
  }

  // Render Scope Dynamic Configuration HTML
  function renderScopeDetailsHtml() {
    if (selectedScope === 'chapter') {
      if (chapterList.length > 0) {
        const curCh = chapterList[selectedChapterIndex] || chapterList[0];
        return `
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <label style="font-size:12px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
                <span>📖 Select Chapter to Analyze:</span>
              </label>
              <span id="study-ch-pages-badge" style="font-size:11px; font-weight:700; color:${activeConfig.accentColor}; background:var(--surface); border:1px solid var(--border); padding:2px 8px; border-radius:6px;" class="font-mono">
                ${curCh.pageCount} ${curCh.pageCount === 1 ? 'page' : 'pages'} (pp. ${curCh.startPage}–${curCh.endPage})
              </span>
            </div>
            <select id="study-chapter-select" style="width:100%; padding:9px 12px; font-size:13px; font-weight:600; background:var(--bg); border:1px solid var(--border); border-radius:8px; color:var(--text); outline:none;">
              ${chapterList.map((ch, i) => `
                <option value="${i}" ${i === selectedChapterIndex ? 'selected' : ''}>
                  ${window.escapeHtml(ch.label)}
                </option>
              `).join('')}
            </select>
          </div>
        `;
      } else {
        return `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:12px; font-weight:700; color:var(--text);">📖 Full Document Coverage</span>
              <span style="font-size:11px; font-weight:700; color:${activeConfig.accentColor}; background:var(--surface); border:1px solid var(--border); padding:2px 8px; border-radius:6px;" class="font-mono">
                ${numPages} pages
              </span>
            </div>
            <div style="font-size:11.5px; color:var(--text-dim); line-height:1.45;">
              No separate chapter TOC detected; analyzing full document (Pages 1–${numPages}).
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
            <span id="study-range-count-badge" style="font-size:11px; font-weight:700; color:${activeConfig.accentColor}; background:var(--surface); border:1px solid var(--border); padding:2px 8px; border-radius:6px;" class="font-mono">
              ${pageSpan} ${pageSpan === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center;">
            <div>
              <span style="font-size:10.5px; color:var(--text-dim); display:block; margin-bottom:2px;">From Page:</span>
              <input type="number" id="study-range-start-input" min="1" max="${numPages}" value="${rangeStart}" style="width:100%; padding:8px 10px; font-size:13px; font-weight:600; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); text-align:center; outline:none;" />
            </div>
            <span style="color:var(--text-dim); font-size:13px; font-weight:600; margin-top:14px;">to</span>
            <div>
              <span style="font-size:10.5px; color:var(--text-dim); display:block; margin-bottom:2px;">To Page:</span>
              <input type="number" id="study-range-end-input" min="1" max="${numPages}" value="${rangeEnd}" style="width:100%; padding:8px 10px; font-size:13px; font-weight:600; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); text-align:center; outline:none;" />
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
            <span style="font-size:11px; font-weight:700; color:${activeConfig.accentColor}; background:var(--surface); border:1px solid var(--border); padding:2px 8px; border-radius:6px;" class="font-mono">1 page</span>
          </div>
          <div style="font-size:11.5px; color:var(--text-dim); line-height:1.45; max-height:38px; overflow:hidden; text-overflow:ellipsis; font-style:italic;">
            "${window.escapeHtml(resolvedSel.text.slice(0, 110))}${resolvedSel.text.length > 110 ? '…' : ''}"
          </div>
        </div>
      `;
    }
  }

  // HTML Generator for Ready State (Blueprint Hero)
  function getReadyStateInnerHtml(scopeInfo) {
    return `
      <div class="study-preview-hero">
        <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-2); border:1px solid var(--border); padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; color:${activeConfig.accentColor}; margin-bottom:12px;">
          ${window.icon('bookOpen', 'icon icon-xs')} ${window.escapeHtml(scopeInfo.shortTitle)}
        </div>
        <div class="font-display" style="font-size:18px; font-weight:800; color:var(--text); margin-bottom:6px;">
          ${activeConfig.label} Blueprint
        </div>
        <div style="font-size:13px; color:var(--text-dim); max-width:440px; margin:0 auto; line-height:1.5;">
          ${activeConfig.sublabel}
        </div>

        <div class="study-preview-pillars">
          ${(activeConfig.pageTitles || []).map((t, idx) => `
            <div class="study-preview-pillar-item">
              <span style="font-weight:800; color:${activeConfig.accentColor}; font-size:11.5px; white-space:nowrap;">P${idx + 1}</span>
              <span style="color:var(--text); font-weight:600; line-height:1.35;">${window.escapeHtml(t)}</span>
            </div>
          `).join('')}
        </div>

        <button class="btn btn-primary" id="study-hero-generate-btn" style="padding:12px 24px; font-size:14px; font-weight:700; background:${activeConfig.accentColor}; color:#fff; border:none; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 3px 12px rgba(0,0,0,0.15);">
          ${window.icon('zap', 'icon icon-sm')}
          <span>Generate ${activeConfig.label} for ${window.escapeHtml(scopeInfo.shortTitle)}</span>
        </button>
      </div>
    `;
  }

  // HTML Generator for Bottom Action Bar
  function getActionBarButtonsHtml() {
    return `
      <div style="display:grid; grid-template-columns:1fr 1.35fr; gap:8px; width:100%; box-sizing:border-box;">
        <button class="btn btn-secondary" id="study-modal-btn-chat" style="padding:10px 10px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; border-radius:10px; cursor:pointer; border:1px solid var(--border); font-size:12.5px; background:var(--surface-2); color:var(--text); white-space:nowrap; overflow:hidden;" title="Discuss this chapter in AI Book Chat">
          ${window.icon('messageSquare', 'icon icon-sm')}
          <span>Ask Tutor</span>
        </button>

        <button class="btn btn-primary" id="study-modal-btn-save-note" style="padding:10px 12px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; border-radius:10px; cursor:pointer; font-size:12.5px; background:${activeConfig.accentColor}; color:#fff; border:none; white-space:nowrap; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.15);" title="Save to Notes Notebook">
          ${window.icon('edit', 'icon icon-sm')}
          <span>Save to Notes</span>
        </button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; width:100%; box-sizing:border-box;">
        <button class="btn btn-ghost" id="study-modal-btn-regenerate" style="padding:8px 6px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:5px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text-dim); cursor:pointer; font-size:12px; white-space:nowrap; overflow:hidden;" title="Regenerate fresh">
          ${window.icon('rotateCcw', 'icon icon-xs')}
          <span>Regen</span>
        </button>

        <button class="btn btn-ghost" id="study-modal-btn-copy" style="padding:8px 6px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:5px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text-dim); cursor:pointer; font-size:12px; white-space:nowrap; overflow:hidden;" title="Copy to clipboard">
          ${window.icon('copy', 'icon icon-xs')}
          <span>Copy</span>
        </button>

        <button class="btn btn-ghost" id="study-modal-btn-listen" style="padding:8px 6px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:5px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text-dim); cursor:pointer; font-size:12px; white-space:nowrap; overflow:hidden;" title="Listen with voice narration">
          ${window.icon('volume2', 'icon icon-xs')}
          <span id="study-listen-btn-label">Listen</span>
        </button>
      </div>
    `;
  }

  // HTML Generator for Complete Dossier
  function getCompleteDossierInnerHtml(fullContent, isFromCache = false, savedTime = null, scopeInfo = null) {
    const currentScope = scopeInfo || getCurrentScopeDesc();
    const timeFormatted = savedTime ? new Date(savedTime).toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Just now';
    const studyPages = splitMarkdownIntoStudyPages(fullContent);

    let mainContentHtml = '';
    if (studyPages && studyPages.length >= 2) {
      mainContentHtml = `
        <div class="study-multipage-nav" id="study-multipage-nav">
          <div style="display:flex; align-items:center; gap:5px; padding:0 4px; font-size:11px; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">
            ${window.icon('layers', 'icon icon-xs')} Jump:
          </div>
          ${studyPages.map(p => `
            <button class="study-page-jump-btn ${p.pageNum === 1 ? 'active' : ''}" data-page-target="study-page-card-${p.pageNum}">
              <span>📄 Page ${p.pageNum}/${p.totalPages}</span>
              <span style="opacity:0.8; font-weight:500;">• ${window.escapeHtml((p.title || '').slice(0, 18))}${(p.title || '').length > 18 ? '…' : ''}</span>
            </button>
          `).join('')}
        </div>

        <div class="study-pages-container" id="study-pages-scroll-container">
          ${studyPages.map((p, idx) => `
            <div class="study-page-card" id="study-page-card-${p.pageNum}">
              <div class="study-page-card-header">
                <span class="study-page-badge">
                  <span class="study-page-badge-accent" style="background:${activeConfig.accentColor};"></span>
                  PAGE ${p.pageNum} OF ${p.totalPages}
                </span>
                <span class="study-page-title-label font-display">${window.escapeHtml(p.title || `Section ${p.pageNum}`)}</span>
              </div>
              <div class="selectable-text" style="line-height:1.68; font-size:14.2px;">
                ${renderMd(cleanStudyMarkdownOutput(p.content))}
              </div>
            </div>
            ${idx < studyPages.length - 1 ? `
              <div class="study-page-divider">
                <span>📄 Continues to Page ${p.pageNum + 1}</span>
              </div>
            ` : ''}
          `).join('')}
        </div>
      `;
    } else {
      mainContentHtml = `
        <div class="study-page-card">
          <div class="selectable-text" style="line-height:1.68; font-size:14.2px;">
            ${renderMd(fullContent)}
          </div>
        </div>
      `;
    }

    return `
      <div class="study-active-scope-bar" id="study-active-scope-bar" style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:7px 12px; margin-bottom:12px; font-size:12px; gap:8px;">
        <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
          <span style="color:${activeConfig.accentColor}; font-weight:800; display:flex; align-items:center; gap:4px; flex-shrink:0;">
            ${window.icon(activeConfig.icon || 'bookOpen', 'icon icon-xs')} ${window.escapeHtml(currentScope.shortTitle)}
          </span>
          <span style="color:var(--text-dim); font-size:11.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            • ${window.escapeHtml(currentScope.title)}
          </span>
        </div>
        <button id="study-toggle-scope-btn" type="button" style="background:var(--surface); border:1px solid var(--border); border-radius:6px; color:var(--text); font-weight:700; font-size:11px; padding:4px 9px; cursor:pointer; display:flex; align-items:center; gap:4px; flex-shrink:0;">
          ${window.icon('sliders', 'icon icon-xs')} <span id="study-toggle-scope-label">Change Scope ▾</span>
        </button>
      </div>

      ${isFromCache ? `
        <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:8px 12px; margin-bottom:12px; font-size:12px; color:var(--text-dim);">
          <span style="display:flex; align-items:center; gap:6px;">
            ${window.icon('clock', 'icon icon-xs')} Loaded instantly from notebook (${timeFormatted})
          </span>
          <button id="study-modal-btn-regen-top" style="background:transparent; border:none; color:${activeConfig.accentColor}; font-weight:700; font-size:11.5px; cursor:pointer; display:flex; align-items:center; gap:4px;">
            ${window.icon('rotateCcw', 'icon icon-xs')} Regenerate
          </button>
        </div>
      ` : ''}
      ${mainContentHtml}
    `;
  }

  // Bind Events for Completed Dossier
  function bindDossierEvents(fullContent, scopeInfo = null) {
    const liveContainer = document.getElementById('study-live-pages-container');
    const scopeCardEl = document.getElementById('study-scope-card');
    const toggleScopeBtn = document.getElementById('study-toggle-scope-btn');
    const toggleScopeLabel = document.getElementById('study-toggle-scope-label');

    if (toggleScopeBtn && scopeCardEl) {
      toggleScopeBtn.onclick = (e) => {
        e.preventDefault();
        const isHidden = scopeCardEl.style.display === 'none';
        if (isHidden) {
          scopeCardEl.style.display = 'block';
          if (toggleScopeLabel) toggleScopeLabel.textContent = 'Hide Scope ▴';
          scopeCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          scopeCardEl.style.display = 'none';
          if (toggleScopeLabel) toggleScopeLabel.textContent = 'Change Scope ▾';
        }
      };
    }

    if (liveContainer) {
      const jumpButtons = liveContainer.querySelectorAll('.study-page-jump-btn');
      jumpButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = btn.getAttribute('data-page-target');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            jumpButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          }
        });
      });

      if (typeof window.renderMermaidDiagrams === 'function') {
        setTimeout(() => window.renderMermaidDiagrams(liveContainer), 50);
      }
      if (typeof window.renderMathFormulas === 'function') {
        setTimeout(() => window.renderMathFormulas(liveContainer), 70);
      }
    }

    const regenBtn = document.getElementById('study-modal-btn-regenerate');
    if (regenBtn) regenBtn.onclick = () => executeGeneration(true);

    const topRegenBtn = document.getElementById('study-modal-btn-regen-top');
    if (topRegenBtn) topRegenBtn.onclick = () => executeGeneration(true);

    const copyBtn = document.getElementById('study-modal-btn-copy');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(fullContent);
          window.toast('Copied to clipboard!');
        } catch(err) {
          window.toast('Copied!');
        }
      };
    }

    const listenBtn = document.getElementById('study-modal-btn-listen');
    const listenLabel = document.getElementById('study-listen-btn-label');
    if (listenBtn) {
      listenBtn.onclick = () => {
        if ('speechSynthesis' in window) {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            if (listenLabel) listenLabel.textContent = 'Listen';
            listenBtn.style.color = '';
            window.toast('Audio narration stopped');
            return;
          }
          const cleanSpeechText = fullContent
            .replace(/```[\s\S]*?```/g, ' Diagram omitted. ')
            .replace(/#+\s+/g, '')
            .replace(/[*_~`>]/g, '')
            .replace(/\|.*?\|/g, '')
            .replace(/\n\s*\n/g, '. ')
            .trim();
          const utterance = new SpeechSynthesisUtterance(cleanSpeechText.slice(0, 4500));
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            if (listenLabel) listenLabel.textContent = 'Listen';
            listenBtn.style.color = '';
          };
          utterance.onerror = () => {
            if (listenLabel) listenLabel.textContent = 'Listen';
            listenBtn.style.color = '';
          };
          window.speechSynthesis.speak(utterance);
          if (listenLabel) listenLabel.textContent = 'Stop';
          listenBtn.style.color = activeConfig.accentColor;
          window.toast('Reading dossier aloud…');
        } else {
          window.toast('Speech synthesis is not supported on this browser');
        }
      };
    }

    const chatBtn = document.getElementById('study-modal-btn-chat');
    if (chatBtn) {
      chatBtn.onclick = () => {
        const currentScope = scopeInfo || getCurrentScopeDesc();
        const tutorPrompt = `I am studying "${currentScope.title}". Can you give me a deep conceptual walkthrough and quiz me on the most important points?`;
        if (typeof window.openTeacherView === 'function') {
          window.openTeacherView(tutorPrompt, 'professional', currentFileId);
        } else {
          window.toast('AI Book Chat is opening…');
        }
      };
    }

    const saveNoteBtn = document.getElementById('study-modal-btn-save-note');
    if (saveNoteBtn) {
      saveNoteBtn.onclick = async () => {
        const currentScope = scopeInfo || getCurrentScopeDesc();
        try {
          if (window.DB) {
            await window.DB.put('notes', {
              id: window.uid(),
              fileId: currentFileId,
              page: currentScope.startPage,
              kind: `${activeConfig.label} • ${currentScope.shortTitle}`,
              content: fullContent,
              sourceText: currentScope.title,
              createdAt: Date.now()
            });
            window.toast('Saved to Notes Notebook');
          }
        } catch(err) {
          console.error('Failed to save study item to notes:', err);
          window.toast('Failed to save note');
        }
      };
    }
  }

  // Bind Events for Ready State
  function bindReadyStateEvents() {
    const heroBtn = document.getElementById('study-hero-generate-btn');
    if (heroBtn) {
      heroBtn.onclick = () => executeGeneration(true);
    }
  }

  // Bind Scope Events (dropdown enhancement & range inputs)
  function bindScopeEvents() {
    const detailsContainer = document.getElementById('study-scope-details');
    if (!detailsContainer) return;

    if (selectedScope === 'chapter') {
      const drop = document.getElementById('study-chapter-select');
      if (drop) {
        drop.onchange = async () => {
          selectedChapterIndex = Number(drop.value);
          const ch = chapterList[selectedChapterIndex];
          if (ch) {
            rangeStart = ch.startPage;
            rangeEnd = ch.endPage;
            const badge = document.getElementById('study-ch-pages-badge');
            if (badge) badge.textContent = `${ch.pageCount} ${ch.pageCount === 1 ? 'page' : 'pages'} (pp. ${ch.startPage}–${ch.endPage})`;
          }
          await checkAndRenderForCurrentScope();
        };
        if (typeof window.enhanceSelect === 'function') {
          window.enhanceSelect(drop);
        }
      }
    } else if (selectedScope === 'range') {
      const startInp = document.getElementById('study-range-start-input');
      const endInp = document.getElementById('study-range-end-input');
      const badge = document.getElementById('study-range-count-badge');

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

  // Switch Scope Tabs
  function setScope(newScope) {
    selectedScope = newScope;
    document.querySelectorAll('.study-scope-btn').forEach(b => {
      if (b.dataset.scope === selectedScope) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    const detailsContainer = document.getElementById('study-scope-details');
    if (detailsContainer) {
      detailsContainer.innerHTML = renderScopeDetailsHtml();
      bindScopeEvents();
    }
    checkAndRenderForCurrentScope();
  }

  // Re-render whole dossier when generated or loaded
  function renderCompleteDossier(fullContent, isFromCache = false, savedTime = null, scopeInfo = null) {
    const liveContainer = document.getElementById('study-live-pages-container');
    const loadingIndicator = document.getElementById('study-page-loading-indicator');
    const badgeContainer = document.getElementById('study-modal-badge-container');
    const actionBar = document.getElementById('study-modal-action-bar-container');
    const btnLabel = document.getElementById('study-scope-btn-label');
    const scopeCard = document.getElementById('study-scope-card');

    if (scopeCard) scopeCard.style.display = 'none';
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (!liveContainer) return;

    if (btnLabel) btnLabel.textContent = `🔄 Regenerate ${activeConfig.label}`;

    if (badgeContainer) {
      badgeContainer.innerHTML = isFromCache
        ? `<span class="exec-summary-badge exec-badge-saved">${window.icon('bookmark', 'icon icon-xs')} Saved in Notebook</span>`
        : `<span class="exec-summary-badge" style="background:var(--surface-2); color:${activeConfig.accentColor}; border:1px solid var(--border);">${window.icon('sparkle', 'icon icon-xs')} AI Generated</span>`;
    }

    liveContainer.innerHTML = getCompleteDossierInnerHtml(fullContent, isFromCache, savedTime, scopeInfo);
    if (actionBar) {
      actionBar.style.display = 'flex';
      actionBar.style.flexDirection = 'column';
      actionBar.innerHTML = getActionBarButtonsHtml();
    }
    bindDossierEvents(fullContent, scopeInfo);
  }

  // Re-render ready state
  function renderReadyState(scopeInfo) {
    const liveContainer = document.getElementById('study-live-pages-container');
    const loadingIndicator = document.getElementById('study-page-loading-indicator');
    const actionBar = document.getElementById('study-modal-action-bar-container');
    const badgeContainer = document.getElementById('study-modal-badge-container');
    const btnLabel = document.getElementById('study-scope-btn-label');
    const scopeCard = document.getElementById('study-scope-card');

    if (scopeCard) scopeCard.style.display = 'block';
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    if (btnLabel) btnLabel.textContent = `⚡ ${activeConfig.btnLabel}`;

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="exec-summary-badge" style="background:var(--surface-2); color:${activeConfig.accentColor}; border:1px solid var(--border);">
          ${window.icon('sparkle', 'icon icon-xs')} Ready to Generate
        </span>
      `;
    }

    if (!liveContainer) return;
    liveContainer.innerHTML = getReadyStateInnerHtml(scopeInfo);
    bindReadyStateEvents();
  }

  // Check Cache for currently selected scope (used during in-modal chapter switches)
  async function checkAndRenderForCurrentScope() {
    const scopeInfo = getCurrentScopeDesc();
    if (!forceRegenerate && window.DB) {
      try {
        let cached = await window.DB.get('summaries', scopeInfo.cacheKey);
        if (!cached && scopeInfo.type === 'page') {
          if (activeToolKey === 'summarize') {
            cached = await window.DB.get('summaries', `sum_${currentFileId}_p${curPage}_${isDetailed ? 'full' : 'sel'}`);
          } else if (activeToolKey === 'explain') {
            cached = await window.DB.get('summaries', `exp_${currentFileId}_p${curPage}_${isDetailed ? 'full' : 'sel'}`);
          }
        }
        if (cached && cached.content) {
          renderCompleteDossier(cached.content, true, cached.updatedAt, scopeInfo);
          return;
        }
      } catch (e) {
        console.warn('Cache lookup notice:', e);
      }
    }
    renderReadyState(scopeInfo);
  }

  // 3. Pre-query initial cache BEFORE opening Sheet to eliminate any visual stutter / layout pop-in
  const initialScope = getCurrentScopeDesc();
  let initialCached = null;
  if (!forceRegenerate && window.DB) {
    try {
      initialCached = await window.DB.get('summaries', initialScope.cacheKey);
      if (!initialCached && initialScope.type === 'page') {
        if (activeToolKey === 'summarize') {
          initialCached = await window.DB.get('summaries', `sum_${currentFileId}_p${curPage}_${isDetailed ? 'full' : 'sel'}`);
        } else if (activeToolKey === 'explain') {
          initialCached = await window.DB.get('summaries', `exp_${currentFileId}_p${curPage}_${isDetailed ? 'full' : 'sel'}`);
        }
      }
    } catch (e) {
      console.warn('Cache lookup notice:', e);
    }
  }

  const isInitiallyCached = Boolean(initialCached && initialCached.content);

  // 4. Render Master Modal Frame with FULL pre-computed content (zero post-mount layout jump)
  window.Sheet.open(`
    <div class="exec-summary-wrapper" style="padding:4px 0;">
      <!-- Modal Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:8px; padding-bottom:12px; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div id="study-dossier-icon-box" style="width:40px; height:40px; border-radius:12px; background:var(--surface-2); color:${activeConfig.accentColor}; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            ${window.icon(activeConfig.icon, 'icon icon-md')}
          </div>
          <div>
            <div id="study-dossier-title" class="font-display" style="font-size:17.5px; font-weight:800; color:var(--text); line-height:1.2;">
              ${activeConfig.label}
            </div>
            <div style="font-size:12px; color:var(--text-dim); max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${window.escapeHtml(fileTitle)}
            </div>
          </div>
        </div>

        <div id="study-modal-badge-container">
          ${isInitiallyCached
            ? `<span class="exec-summary-badge exec-badge-saved">${window.icon('bookmark', 'icon icon-xs')} Saved in Notebook</span>`
            : `<span class="exec-summary-badge" style="background:var(--surface-2); color:${activeConfig.accentColor}; border:1px solid var(--border);">${window.icon('sparkle', 'icon icon-xs')} Ready to Generate</span>`
          }
        </div>
      </div>

      <!-- Scope & Chapter Selector Card -->
      <div class="study-scope-card" id="study-scope-card" style="display:${isInitiallyCached ? 'none' : 'block'};">
        <!-- Segmented Scope Tabs -->
        <div class="study-scope-nav" id="study-scope-group">
          <button class="study-scope-btn ${selectedScope === 'chapter' ? 'active' : ''}" data-scope="chapter">
            ${window.icon('bookOpen', 'icon icon-xs')} Chapter
          </button>
          <button class="study-scope-btn ${selectedScope === 'page' ? 'active' : ''}" data-scope="page">
            ${window.icon('fileText', 'icon icon-xs')} Page
          </button>
          <button class="study-scope-btn ${selectedScope === 'range' ? 'active' : ''}" data-scope="range">
            ${window.icon('layers', 'icon icon-xs')} Range
          </button>
        </div>

        <!-- Scope Dynamic Controls (Pre-rendered upfront) -->
        <div id="study-scope-details">
          ${renderScopeDetailsHtml()}
        </div>

        <!-- Primary Generation CTA Bar -->
        <div style="display:flex; align-items:center; gap:8px; margin-top:10px;" id="study-scope-cta-wrap">
          <button class="btn btn-primary" id="study-scope-generate-btn" style="flex:1; padding:11px 16px; font-size:13.5px; font-weight:700; background:${activeConfig.accentColor}; color:#fff; border:none; border-radius:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,0.12);">
            ${window.icon('zap', 'icon icon-sm')}
            <span id="study-scope-btn-label">${isInitiallyCached ? `🔄 Regenerate ${activeConfig.label}` : `⚡ ${activeConfig.btnLabel}`}</span>
          </button>
        </div>
      </div>

      <!-- Main Result Content Container (Pre-populated) -->
      <div id="study-modal-result" class="no-scrollbar" style="font-size:14px; line-height:1.68; color:var(--text); max-height:68vh; overflow-y:auto; padding-right:2px; scrollbar-width:none; -ms-overflow-style:none;">
        <div id="study-live-pages-container" class="study-pages-container">
          ${isInitiallyCached ? getCompleteDossierInnerHtml(initialCached.content, true, initialCached.updatedAt, initialScope) : getReadyStateInnerHtml(initialScope)}
        </div>
        <div id="study-page-loading-indicator" style="display:none; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:10px; color:var(--text-dim); font-size:13.5px; margin-bottom:10px;">
            <div class="spinner-sm" style="width:18px; height:18px; border:2.5px solid var(--border); border-top-color:${activeConfig.accentColor}; border-radius:50%; animation:spin 0.6s linear infinite;"></div>
            <span style="font-weight:700; color:var(--text);" id="study-loader-label">Scanning & Extracting Chapter Content…</span>
          </div>
          <div class="study-progress-track">
            <div class="study-progress-fill" id="study-progress-bar-fill" style="width:15%; background:${activeConfig.accentColor};"></div>
          </div>
          <div id="study-extract-detail" style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">Aggregating text across pages…</div>
          <div class="skel" style="height:14px; width:92%; margin-bottom:8px; border-radius:4px;"></div>
          <div class="skel" style="height:14px; width:80%; margin-bottom:8px; border-radius:4px;"></div>
          <div class="skel" style="height:14px; width:65%; border-radius:4px;"></div>
        </div>
      </div>

      <!-- Action Bottom Bar (Pre-rendered if cached) -->
      <div class="exec-action-bar" id="study-modal-action-bar-container" style="display:${isInitiallyCached ? 'flex' : 'none'}; flex-direction:column;">
        ${isInitiallyCached ? getActionBarButtonsHtml() : ''}
      </div>
    </div>
  `, { peek: Boolean(resolvedSel.isSelection) });

  // 5. Attach Immediate Synchronous Listeners
  bindScopeEvents();
  document.querySelectorAll('.study-scope-btn').forEach(btn => {
    btn.onclick = () => setScope(btn.dataset.scope);
  });
  const primaryGenBtn = document.getElementById('study-scope-generate-btn');
  if (primaryGenBtn) {
    primaryGenBtn.onclick = () => executeGeneration(true);
  }
  if (isInitiallyCached) {
    bindDossierEvents(initialCached.content, initialScope);
  } else {
    bindReadyStateEvents();
  }

  // Master Generation Execution Function
  async function executeGeneration(isForced = false) {
    const scopeInfo = getCurrentScopeDesc();
    const liveContainer = document.getElementById('study-live-pages-container');
    const loadingIndicator = document.getElementById('study-page-loading-indicator');
    const loaderLabel = document.getElementById('study-loader-label');
    const extractDetail = document.getElementById('study-extract-detail');
    const progressBar = document.getElementById('study-progress-bar-fill');
    const actionBar = document.getElementById('study-modal-action-bar-container');
    const badgeContainer = document.getElementById('study-modal-badge-container');
    const scopeCard = document.getElementById('study-scope-card');

    if (scopeCard) scopeCard.style.display = 'none';
    if (liveContainer) liveContainer.innerHTML = '';
    if (actionBar) actionBar.style.display = 'none';
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="exec-summary-badge" style="background:var(--surface-2); color:${activeConfig.accentColor}; border:1px solid var(--border);">
          <div class="spinner-sm" style="width:10px; height:10px; border:2px solid var(--border); border-top-color:${activeConfig.accentColor}; border-radius:50%; animation:spin 0.6s linear infinite; display:inline-block; margin-right:4px;"></div>
          Generating…
        </span>
      `;
    }

    // 1. Text Aggregation based on Scope
    let targetText = '';
    let targetPage = scopeInfo.startPage;

    if (scopeInfo.type === 'chapter' && chapterList.length > 0) {
      const ch = chapterList[selectedChapterIndex];
      if (loaderLabel) loaderLabel.textContent = `Aggregating Chapter Content (${ch.title})…`;
      if (extractDetail) extractDetail.textContent = `Scanning pages ${ch.startPage} to ${ch.endPage}…`;
      if (progressBar) progressBar.style.width = '20%';

      if (typeof window.extractRangeText === 'function') {
        targetText = await window.extractRangeText(doc, ch.startPage, ch.endPage, (curPg, s, e) => {
          if (extractDetail) extractDetail.textContent = `Extracting page ${curPg} of ${e}…`;
          if (progressBar) {
            const pct = Math.min(80, Math.round(((curPg - s + 1) / (e - s + 1)) * 60) + 20);
            progressBar.style.width = `${pct}%`;
          }
        });
      }
    } else if (scopeInfo.type === 'range') {
      const s = scopeInfo.startPage;
      const e = scopeInfo.endPage;
      if (loaderLabel) loaderLabel.textContent = `Aggregating Multi-Page Range…`;
      if (extractDetail) extractDetail.textContent = `Scanning pages ${s} to ${e}…`;
      if (progressBar) progressBar.style.width = '20%';

      if (typeof window.extractRangeText === 'function') {
        targetText = await window.extractRangeText(doc, s, e, (curPg, start, end) => {
          if (extractDetail) extractDetail.textContent = `Extracting page ${curPg} of ${end}…`;
          if (progressBar) {
            const pct = Math.min(80, Math.round(((curPg - start + 1) / (end - start + 1)) * 60) + 20);
            progressBar.style.width = `${pct}%`;
          }
        });
      }
    } else {
      // Single Page Scope
      targetText = resolvedSel.text;
    }

    if (!targetText || !targetText.trim()) {
      targetText = resolvedSel.text || `Content on Page ${scopeInfo.startPage}`;
    }

    // Hide initial extraction loading indicator so it never collides with live cards
    if (loadingIndicator) loadingIndicator.style.display = 'none';

    // 2. Sequential 4-Page Dossier Generation
    const totalPagesToGenerate = 4;
    const generatedPageChunks = [];
    const streamMode = typeof window.getStreamingMode === 'function' ? window.getStreamingMode() : (window.State?.streamingMode || 'sse');
    const pageDescriptions = activeConfig.pageTitles || [
      'Core Foundations & Executive Thesis',
      'Operational Mechanisms & Process Dynamics',
      'Concept Comparison Matrix & Applications',
      'Master Synthesis & High-Yield Exam Blueprint'
    ];

    // Create a single, slim top progress strip (no duplicate skeleton cards)
    let progressStripEl = null;
    let statusTextEl = null;
    let statusPctEl = null;
    let statusFillEl = null;

    if (liveContainer) {
      progressStripEl = document.createElement('div');
      progressStripEl.id = 'study-stream-progress-strip';
      progressStripEl.style.cssText = 'background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px 14px; margin-bottom:14px;';
      progressStripEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; font-size:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="spinner-sm" style="width:13px; height:13px; border:2px solid var(--border); border-top-color:${activeConfig.accentColor}; border-radius:50%; animation:spin 0.6s linear infinite;"></div>
            <span id="study-stream-status-text" style="font-weight:700; color:var(--text);">Generating Page 1 of ${totalPagesToGenerate}…</span>
          </div>
          <span id="study-stream-progress-pct" style="font-weight:700; color:${activeConfig.accentColor}; font-size:11.5px;" class="font-mono">25%</span>
        </div>
        <div class="study-progress-track" style="margin:0; height:4px;">
          <div class="study-progress-fill" id="study-stream-progress-fill" style="width:25%; background:${activeConfig.accentColor};"></div>
        </div>
      `;
      liveContainer.appendChild(progressStripEl);

      statusTextEl = progressStripEl.querySelector('#study-stream-status-text');
      statusPctEl = progressStripEl.querySelector('#study-stream-progress-pct');
      statusFillEl = progressStripEl.querySelector('#study-stream-progress-fill');
    }

    try {
      for (let pIndex = 1; pIndex <= totalPagesToGenerate; pIndex++) {
        const pct = Math.round((pIndex / totalPagesToGenerate) * 100);
        if (statusTextEl) {
          statusTextEl.textContent = `Generating Page ${pIndex} of ${totalPagesToGenerate} (${pageDescriptions[pIndex - 1] || 'In-depth Analysis'})…`;
        }
        if (statusPctEl) statusPctEl.textContent = `${pct}%`;
        if (statusFillEl) statusFillEl.style.width = `${pct}%`;

        const prevContext = generatedPageChunks.join('\n\n---\n\n');
        const prompt = getAIToolPromptForPage(activeToolKey, targetText, pIndex, totalPagesToGenerate, true, targetPage, prevContext, scopeInfo.title);

        // Attach live page card immediately for real-time progress
        let pageCardEl = null;
        let contentEl = null;
        let titleLabel = null;

        if (liveContainer) {
          pageCardEl = document.createElement('div');
          pageCardEl.className = 'study-page-card';
          pageCardEl.id = `study-page-card-${pIndex}`;
          pageCardEl.innerHTML = `
            <div class="study-page-card-header">
              <span class="study-page-badge">
                <span class="study-page-badge-accent" style="background:${activeConfig.accentColor};"></span>
                PAGE ${pIndex} OF ${totalPagesToGenerate}
              </span>
              <span class="study-page-title-label font-display">${window.escapeHtml(pageDescriptions[pIndex - 1] || `Page ${pIndex}`)}</span>
            </div>
            <div class="selectable-text study-page-content" style="line-height:1.68; font-size:14.2px;">
              <span class="ai-typing-cursor">▌</span>
            </div>
          `;
          liveContainer.appendChild(pageCardEl);

          contentEl = pageCardEl.querySelector('.study-page-content');
          titleLabel = pageCardEl.querySelector('.study-page-title-label');

          pageCardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        let chunkText = '';

        // Mode A: SSE Streaming
        if (streamMode === 'sse' && typeof window.fetchSSEStream === 'function' && contentEl) {
          try {
            const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');
            let streamer = typeof window.createWordByWordStreamer === 'function' ? window.createWordByWordStreamer(contentEl, { scrollContainer: liveContainer }) : null;
            let pushedCleanLen = 0;
            const stripLeadingPageHeader = (txt) => {
              const str = String(txt || '');
              const hdrMatch = str.match(/^#+\s*📄?\s*PAGE\s+\d+[^\n]*(?:\n+|$)/i);
              if (hdrMatch) return str.slice(hdrMatch[0].length);
              // Hold back incomplete first line while it still looks like `# 📄 PAGE ...`
              if (!str.includes('\n') && /^#+\s*(?:📄?\s*P(?:A(?:G(?:E)?)?)?)?/i.test(str.trim())) return '';
              return str;
            };

            chunkText = await window.fetchSSEStream(
              '/api/ai/study-tool',
              {
                toolKey: activeToolKey,
                prompt,
                sourceText: targetText,
                isFullPage: true,
                pageNum: targetPage,
                model: 'gemini-3.1-flash-lite',
                customKey: customKey || undefined
              },
              (_chunk, accumulated) => {
                const bodySoFar = stripLeadingPageHeader(accumulated);
                if (streamer) {
                  if (bodySoFar.length > pushedCleanLen) {
                    streamer.pushText(bodySoFar.slice(pushedCleanLen));
                    pushedCleanLen = bodySoFar.length;
                  }
                } else {
                  contentEl.innerHTML = renderMd(cleanStudyMarkdownOutput(bodySoFar)) + '<span class="ai-typing-cursor">▌</span>';
                }

                const tm = accumulated.match(/PAGE\s+\d+\s*(?:OF|\/)\s*\d+\s*[:•\-]?\s*([^\n]*)/i);
                if (tm && tm[1] && tm[1].trim() && titleLabel) {
                  titleLabel.textContent = tm[1].trim();
                }
              }
            );

            if (streamer) {
              const cleaned = cleanStudyMarkdownOutput((chunkText || '').replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, ''));
              await streamer.finish(cleaned);
            }
          } catch (streamErr) {
            console.warn('Study tool SSE stream error, falling back:', streamErr);
            chunkText = '';
          }
        }

        // Mode B: Unary or fallback
        if (!chunkText || chunkText.length < 20) {
          chunkText = await callAI(prompt, activeToolKey, targetText, true, targetPage);
        }
        if (!chunkText || chunkText.length < 20 || chunkText.includes('AI is not reachable right now')) {
          chunkText = generateOfflineSmartSummary(activeToolKey, targetText, true, targetPage, pIndex, totalPagesToGenerate);
        }

        // Ensure proper header format
        if (!chunkText.includes(`PAGE ${pIndex}`)) {
          const pageTitle = pageDescriptions[pIndex - 1] || `Section ${pIndex}`;
          chunkText = `# 📄 PAGE ${pIndex} OF ${totalPagesToGenerate}: ${pageTitle}\n\n${chunkText}`;
        }

        generatedPageChunks.push(chunkText);

        const titleMatch = chunkText.match(/PAGE\s+\d+\s*(?:OF|\/)\s*\d+\s*[:•\-]?\s*([^\n]*)/i);
        const cardTitle = titleMatch ? titleMatch[1].trim() : (pageDescriptions[pIndex - 1] || `Page ${pIndex}`);
        const cleanedBody = cleanStudyMarkdownOutput(chunkText.replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, ''));

        if (titleLabel) titleLabel.textContent = cardTitle;

        if (contentEl) {
          if (streamMode === 'typewriter') {
            if (typeof window.streamMorphicWave === 'function') {
              await window.streamMorphicWave(contentEl, cleanedBody, () => {
                if (typeof window.renderMermaidDiagrams === 'function' && pageCardEl) window.renderMermaidDiagrams(pageCardEl);
                if (typeof window.renderMathFormulas === 'function' && pageCardEl) window.renderMathFormulas(pageCardEl);
              }, liveContainer);
            } else {
              contentEl.innerHTML = renderMd(cleanedBody);
            }
          } else {
            contentEl.innerHTML = renderMd(cleanedBody);
            if (typeof window.renderMermaidDiagrams === 'function' && pageCardEl) window.renderMermaidDiagrams(pageCardEl);
            if (typeof window.renderMathFormulas === 'function' && pageCardEl) window.renderMathFormulas(pageCardEl);
          }
        }

        if (liveContainer && pIndex < totalPagesToGenerate) {
          const dividerEl = document.createElement('div');
          dividerEl.className = 'study-page-divider';
          dividerEl.innerHTML = `<span>📄 Continues to Page ${pIndex + 1}</span>`;
          liveContainer.appendChild(dividerEl);
        }
      }

      // Remove the live streaming progress strip once complete
      if (progressStripEl && progressStripEl.parentNode) {
        progressStripEl.parentNode.removeChild(progressStripEl);
      }
      if (loadingIndicator) loadingIndicator.style.display = 'none';

      const fullFinalContent = generatedPageChunks.join('\n\n---\n\n');

      // Save to IndexedDB with chapter cache key
      if (window.DB && fullFinalContent) {
        try {
          await window.DB.put('summaries', {
            id: scopeInfo.cacheKey,
            fileId: currentFileId,
            filePageKey: `${currentFileId}_p${scopeInfo.startPage}`,
            toolKey: activeToolKey,
            page: scopeInfo.startPage,
            scopeType: scopeInfo.type,
            scopeTitle: scopeInfo.title,
            isDetailed: true,
            content: fullFinalContent,
            updatedAt: Date.now()
          });
        } catch (err) {
          console.warn('Failed to save study dossier to DB:', err);
        }
      }

      renderCompleteDossier(fullFinalContent, false, Date.now(), scopeInfo);

    } catch (err) {
      console.error('Sequential study generation error:', err);
      if (progressStripEl && progressStripEl.parentNode) {
        progressStripEl.parentNode.removeChild(progressStripEl);
      }
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      const fallbackText = generateOfflineSmartSummary(activeToolKey, targetText, true, targetPage);
      renderCompleteDossier(fallbackText, false, Date.now(), scopeInfo);
    }
  }

  if (forceRegenerate) {
    executeGeneration(true);
  }
}

export async function runAIToolObj(tool, sel, isFullPage = false){
  if(!tool) return;
  if (tool.key === 'paper') return window.openPaperView?.({ new: true });
  const pageNum = sel?.pageNum || window.State?.currentPage || 1;
  const rawText = typeof sel === 'string' ? sel : (sel?.text || '');
  const pageText = (rawText && rawText.trim()) ? rawText.trim() : (typeof window.getCurrentPageText === 'function' ? window.getCurrentPageText() : `Chapter content on Page ${pageNum}`);
  // A short passage that the student selected counts as a selection even when the caller did not flag it.
  const looksSelected = !isFullPage && Boolean(sel && (sel.isSelection || (rawText.trim() && rawText.length < 600)));
  const resolvedSel = typeof sel === 'object' && sel !== null ? { ...sel, text: pageText, pageNum, isSelection: looksSelected } : { text: pageText, pageNum, isSelection: false };
  const isDetailed = isFullPage || !resolvedSel.isSelection;

  return runAcademicStudyModal(tool, resolvedSel, isDetailed, pageNum);
}

// Backward compatibility alias functions
export async function runExecutiveSummaryModal(sel, isDetailed = true, pageNum = 1, forceRegenerate = false) {
  return runAcademicStudyModal({ key: 'summarize', label: 'Executive Summary', icon: 'fileText' }, sel, isDetailed, pageNum, forceRegenerate);
}

export async function runMasterExplanationModal(sel, isDetailed = true, pageNum = 1, forceRegenerate = false) {
  return runAcademicStudyModal({ key: 'explain', label: 'Master Explanation', icon: 'brain' }, sel, isDetailed, pageNum, forceRegenerate);
}

/**
 * Aggregates and sanitizes text across a range of pages in a document.
 * If total text exceeds prompt limits, smartly samples key sections from each page.
 */
export async function extractRangeText(doc, startPage, endPage, onProgress) {
  if (!doc) return '';
  const numPages = doc.numPages || 1;
  const start = Math.max(1, Math.min(startPage || 1, numPages));
  const end = Math.max(start, Math.min(endPage || start, numPages));

  const pageChunks = [];
  for (let pg = start; pg <= end; pg++) {
    if (typeof onProgress === 'function') {
      try { onProgress(pg, start, end); } catch (e) {}
    }
    try {
      const page = await doc.getPage(pg);
      const textContent = await page.getTextContent({ normalizeWhitespace: true });
      const text = fixLegacyItems((textContent?.items || []).map(it => it.str)).replace(/\s+/g, ' ').trim();
      if (text) {
        pageChunks.push({ page: pg, text });
      }
    } catch (e) {
      console.warn(`Error extracting text on page ${pg}:`, e);
    }
  }

  if (pageChunks.length === 0) return '';

  let fullCombined = pageChunks.map(c => `[PAGE ${c.page}]\n${c.text}`).join('\n\n');

  // If text is larger than 42,000 characters, smartly sample across each page
  if (fullCombined.length > 42000) {
    const budgetPerPage = Math.floor(36000 / pageChunks.length);
    const sampled = pageChunks.map(c => {
      if (c.text.length <= budgetPerPage) return `[PAGE ${c.page}]\n${c.text}`;
      const half = Math.floor(budgetPerPage / 2);
      return `[PAGE ${c.page}]\n${c.text.slice(0, half)}\n...[lesson section content]...\n${c.text.slice(-half)}`;
    });
    fullCombined = sampled.join('\n\n');
  }

  return fullCombined;
}
window.extractRangeText = extractRangeText;

/**
 * Helper to divide total text into proportional overlapping sections
 */
export function sliceTextIntoSections(fullText, numSections) {
  if (!fullText || numSections <= 1) return [fullText];
  const totalLength = fullText.length;
  if (totalLength < 2500) {
    return Array.from({ length: numSections }, () => fullText);
  }
  const sectionSize = Math.floor(totalLength / numSections);
  const overlap = Math.min(500, Math.floor(sectionSize * 0.2));
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const start = Math.max(0, i * sectionSize - (i > 0 ? overlap : 0));
    const end = Math.min(totalLength, (i + 1) * sectionSize + (i < numSections - 1 ? overlap : 0));
    sections.push(fullText.slice(start, end));
  }
  return sections;
}
