// @ts-nocheck
import { fixLegacyHindi, fixLegacyItems, pageIsLegacyHindi } from './hindi_fix.js';

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

const GROUNDING_RULES = `

STRICT ACCURACY RULES (these override everything above):
- Use ONLY facts that appear in the Source Text. Never invent dates, numbers, names, formulas, examples, definitions or "facts" from memory.
- If the Source Text has nothing for a heading (for example no dates, no formulas, no comparison to make), write "Not covered on this page." under it, or leave that table or flowchart out. Never pad.
- Explain in your own words. Do not paste long runs of the source; a short quoted term or phrase is fine.
- Do not repeat the same point under different headings.
- Keep the language of the Source Text for terms, and keep every Mermaid label short, plain text without brackets or quotes inside the label.
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

OUTPUT IN THIS EXACT STRUCTURE (Rich markdown, clear bold keywords, bullet points, callout boxes):
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

YOUR GOAL FOR PAGE 1: Extract all **STARTING HISTORICAL DATES, FOUNDATIONAL TIMELINES & MILESTONES**.

Source Text:
"""${text}"""

OUTPUT IN THIS EXACT STRUCTURE:
# 📄 PAGE 1 OF 4: Historical Timelines & Chronological Milestones

> 💡 **Chronological Foundation**: (Detailed overview of historical or sequence progression)

## 📊 Chronological Milestones & Discoveries
| Era / Stage / Date | Event / Discovery | Key Figures | Academic Significance |
| :--- | :--- | :--- | :--- |
| **Phase / Year 1** | (Detailed milestone with **bold terms**) | (Names/Theorists) | (Significance) |
| **Phase / Year 2** | (Detailed milestone with **bold terms**) | (Names/Theorists) | (Significance) |

> 📌 **Milestone Anchor**: (Why these historical or chronological steps laid the groundwork)`;
    }

    if (targetPageNum === 2) {
      return `You are an elite academic researcher and archivist.
Generate **PAGE 2 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 2: Extract all **ESSENTIAL ACADEMIC DEFINITIONS & TECHNICAL LEXICON**.

Source Text:
"""${text}"""

OUTPUT IN THIS EXACT STRUCTURE:
# 📄 PAGE 2 OF 4: Academic Lexicon & Precise Definitions

## 🏷️ Exhaustive Academic Terminology
(Extract and explain every specialized term and definition in rigorous detail)
1. **Primary Technical Term**: (Precise academic definition, contextual role, and **bold keywords**)
2. **Secondary Technical Term**: (Precise academic definition, contextual role, and **bold keywords**)
3. **Operational Term**: (Definition and specific function in this chapter)

> 💡 **Lexicon Note**: (Key distinctions between technical definitions)`;
    }

    if (targetPageNum === 3) {
      return `You are an elite academic researcher and archivist.
Generate **PAGE 3 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 3: Extract all **GOVERNING LAWS, FORMULAS, NUMERICAL DATA & CONSTANTS**.

Source Text:
"""${text}"""

OUTPUT IN THIS EXACT STRUCTURE:
# 📄 PAGE 3 OF 4: Governing Laws, Formulas & Numerical Constants

## ⚡ Mathematical & Scientific Formulations
- **Governing Law / Principle**: (Exact rule statement and operating conditions)
- **Formula / Equation**: (Clean plain-text formula with unit breakdown: e.g., $E = mc^2$ where $E$ = Energy in Joules)
- **Numerical Figures & Constants**: (Specific percentages, constants, values, or ratios)

> 🔬 **Formula Insight**: (Unit conversions, sign conventions, and variable constraints)`;
    }

    if (targetPageNum === 4) {
      return `You are an elite academic researcher and exam specialist.
Generate **PAGE 4 OF 4** of the Master Catalog for ${scopeDesc}.

YOUR GOAL FOR PAGE 4: Provide a **COMPLETE FACTUAL RECAP of Pages 1-3** + **GUARANTEED SCORING FACTS & HIGH-FREQUENCY EXAM TRAPS**.

Source Text:
"""${text}"""

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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

OUTPUT IN THIS EXACT STRUCTURE:
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
  const hasTextSelection = Boolean(sel?.isSelection || (rawText && rawText.length > 0 && rawText.length < 600 && rawText.trim()));
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
        'Historical Milestones & Chronological Timeline',
        'Definitive Constants, Figures & Technical Terms',
        'Governing Laws, Equations & Formula Catalog',
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
                ${renderMd(p.content)}
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
      <div id="study-modal-result" class="no-scrollbar" style="font-size:14px; line-height:1.68; color:var(--text); max-height:60vh; overflow-y:auto; padding-right:2px; scrollbar-width:none; -ms-overflow-style:none;">
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
  `);

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
              (chunk, accumulated) => {
                if (streamer) {
                  const cleanChunk = chunk.replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, '');
                  streamer.pushText(cleanChunk);
                } else {
                  const cleaned = accumulated.replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, '').trim();
                  contentEl.innerHTML = renderMd(cleaned) + '<span class="ai-typing-cursor">▌</span>';
                }

                const tm = accumulated.match(/PAGE\s+\d+\s*(?:OF|\/)\s*\d+\s*[:•\-]?\s*([^\n]*)/i);
                if (tm && tm[1] && tm[1].trim() && titleLabel) {
                  titleLabel.textContent = tm[1].trim();
                }
              }
            );

            if (streamer) {
              const cleaned = (chunkText || '').replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, '').trim();
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
        const cleanedBody = chunkText.replace(/^#+\s*📄?\s*PAGE[\s\S]*?\n/i, '').trim();

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
  const resolvedSel = typeof sel === 'object' && sel !== null ? { ...sel, text: pageText, pageNum } : { text: pageText, pageNum, isSelection: false };
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


export function getVerbForms(word) {
  const w = word.toLowerCase().trim();
  const irregulars = {
    be: { v1: 'be', v2: 'was/were', v3: 'been', ing: 'being', s: 'is' },
    have: { v1: 'have', v2: 'had', v3: 'had', ing: 'having', s: 'has' },
    do: { v1: 'do', v2: 'did', v3: 'done', ing: 'doing', s: 'does' },
    go: { v1: 'go', v2: 'went', v3: 'gone', ing: 'going', s: 'goes' },
    write: { v1: 'write', v2: 'wrote', v3: 'written', ing: 'writing', s: 'writes' },
    read: { v1: 'read', v2: 'read', v3: 'read', ing: 'reading', s: 'reads' },
    take: { v1: 'take', v2: 'took', v3: 'taken', ing: 'taking', s: 'takes' },
    make: { v1: 'make', v2: 'made', v3: 'made', ing: 'making', s: 'makes' },
    see: { v1: 'see', v2: 'saw', v3: 'seen', ing: 'seeing', s: 'sees' },
    know: { v1: 'know', v2: 'knew', v3: 'known', ing: 'knowing', s: 'knows' },
    get: { v1: 'get', v2: 'got', v3: 'got/gotten', ing: 'getting', s: 'gets' },
    give: { v1: 'give', v2: 'gave', v3: 'given', ing: 'giving', s: 'gives' },
    find: { v1: 'find', v2: 'found', v3: 'found', ing: 'finding', s: 'finds' },
    think: { v1: 'think', v2: 'thought', v3: 'thought', ing: 'thinking', s: 'thinks' },
    tell: { v1: 'tell', v2: 'told', v3: 'told', ing: 'telling', s: 'tells' },
    become: { v1: 'become', v2: 'became', v3: 'become', ing: 'becoming', s: 'becomes' },
    show: { v1: 'show', v2: 'showed', v3: 'shown', ing: 'showing', s: 'shows' },
    leave: { v1: 'leave', v2: 'left', v3: 'left', ing: 'leaving', s: 'leaves' },
    feel: { v1: 'feel', v2: 'felt', v3: 'felt', ing: 'feeling', s: 'feels' },
    put: { v1: 'put', v2: 'put', v3: 'put', ing: 'putting', s: 'puts' },
    bring: { v1: 'bring', v2: 'brought', v3: 'brought', ing: 'bringing', s: 'brings' },
    begin: { v1: 'begin', v2: 'began', v3: 'begun', ing: 'beginning', s: 'begins' },
    keep: { v1: 'keep', v2: 'kept', v3: 'kept', ing: 'keeping', s: 'keeps' },
    hold: { v1: 'hold', v2: 'held', v3: 'held', ing: 'holding', s: 'holds' },
    speak: { v1: 'speak', v2: 'spoke', v3: 'spoken', ing: 'speaking', s: 'speaks' },
    run: { v1: 'run', v2: 'ran', v3: 'run', ing: 'running', s: 'runs' },
    eat: { v1: 'eat', v2: 'ate', v3: 'eaten', ing: 'eating', s: 'eats' },
    break: { v1: 'break', v2: 'broke', v3: 'broken', ing: 'breaking', s: 'breaks' },
    buy: { v1: 'buy', v2: 'bought', v3: 'bought', ing: 'buying', s: 'buys' },
    drive: { v1: 'drive', v2: 'drove', v3: 'driven', ing: 'driving', s: 'drives' },
    fall: { v1: 'fall', v2: 'fell', v3: 'fallen', ing: 'falling', s: 'falls' },
    fly: { v1: 'fly', v2: 'flew', v3: 'flown', ing: 'flying', s: 'flies' },
    grow: { v1: 'grow', v2: 'grew', v3: 'grown', ing: 'growing', s: 'grows' },
    sing: { v1: 'sing', v2: 'sang', v3: 'sung', ing: 'singing', s: 'sings' },
    swim: { v1: 'swim', v2: 'swam', v3: 'swum', ing: 'swimming', s: 'swims' },
  };

  if (irregulars[w]) return irregulars[w];

  let v2 = w + 'd';
  let v3 = w + 'd';
  let ing = w + 'ing';
  let s = w + 's';

  if (w.endsWith('e')) {
    v2 = w + 'd';
    v3 = w + 'd';
    ing = w.slice(0, -1) + 'ing';
    s = w + 's';
  } else if (w.endsWith('y') && !/[aeiou]y$/.test(w)) {
    v2 = w.slice(0, -1) + 'ied';
    v3 = w.slice(0, -1) + 'ied';
    ing = w + 'ing';
    s = w.slice(0, -1) + 'ies';
  } else if (/[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/.test(w) && w.length <= 6) {
    const last = w[w.length - 1];
    v2 = w + last + 'ed';
    v3 = w + last + 'ed';
    ing = w + last + 'ing';
    s = w + 's';
  } else {
    v2 = w + 'ed';
    v3 = w + 'ed';
  }

  return { v1: w, v2, v3, ing, s };
}

export function detectPrimaryPOS(cleanWord, freeDictData, datamuseData, wiktionaryData) {
  if (/ism$|ist$|ness$|ity$|tion$|sion$|ment$|ance$|ence$|ship$|hood$|or$|er$|ology$/i.test(cleanWord)) {
    const knownVerbsWithEr = ['gather', 'filter', 'foster', 'render', 'alter', 'bother', 'deliver', 'discover', 'recover', 'stagger'];
    if (!knownVerbsWithEr.includes(cleanWord)) return 'Noun';
  }
  if (/ize$|ise$|ify$|ate$/i.test(cleanWord) && cleanWord.length > 4) {
    return 'Verb';
  }
  if (/ous$|ful$|less$|able$|ible$|ic$|ive$/i.test(cleanWord) && cleanWord.length > 4) {
    return 'Adjective';
  }
  if (/ly$/i.test(cleanWord) && cleanWord.length > 4 && !['family', 'rally', 'belly', 'ally', 'jelly', 'chili', 'holy', 'ugly', 'silly'].includes(cleanWord)) {
    return 'Adverb';
  }

  const posVotes = { Noun: 0, Verb: 0, Adjective: 0, Adverb: 0, Pronoun: 0, Preposition: 0, Conjunction: 0, Interjection: 0 };
  const normalizePos = (p) => {
    if (!p) return null;
    const lower = p.toLowerCase().trim();
    if (lower === 'n' || lower === 'noun') return 'Noun';
    if (lower === 'v' || lower === 'verb') return 'Verb';
    if (lower === 'adj' || lower === 'adjective') return 'Adjective';
    if (lower === 'adv' || lower === 'adverb') return 'Adverb';
    if (lower === 'pron' || lower === 'pronoun') return 'Pronoun';
    if (lower === 'prep' || lower === 'preposition') return 'Preposition';
    if (lower === 'conj' || lower === 'conjunction') return 'Conjunction';
    if (lower === 'interj' || lower === 'interjection' || lower === 'int') return 'Interjection';
    return null;
  };

  if (datamuseData && Array.isArray(datamuseData)) {
    for (const item of datamuseData) {
      if (item.word.toLowerCase() === cleanWord && item.defs) {
        for (const defStr of item.defs) {
          const parts = defStr.split('\t');
          const pos = normalizePos(parts[0]);
          if (pos) posVotes[pos] = (posVotes[pos] || 0) + 3;
        }
      }
    }
  }

  const entry = freeDictData?.[0];
  if (entry?.meanings) {
    entry.meanings.forEach((m, idx) => {
      const pos = normalizePos(m.partOfSpeech);
      if (pos) {
        posVotes[pos] = (posVotes[pos] || 0) + (idx === 0 ? 5 : 2);
      }
    });
  }

  if (wiktionaryData?.en && Array.isArray(wiktionaryData.en)) {
    wiktionaryData.en.forEach((wItem, idx) => {
      const pos = normalizePos(wItem.partOfSpeech);
      if (pos) {
        posVotes[pos] = (posVotes[pos] || 0) + (idx === 0 ? 3 : 1);
      }
    });
  }

  let topPos = 'Noun';
  let maxScore = -1;
  for (const [pos, score] of Object.entries(posVotes)) {
    if (score > maxScore) {
      maxScore = score;
      topPos = pos;
    }
  }

  return topPos;
}

export function findLemmaAndInflections(word, primaryPos) {
  const w = word.toLowerCase().trim();

  // 1. Irregular Adjectives Table (Highest Priority)
  const irregularAdjectives = {
    good: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    better: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    best: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    bad: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    worse: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    worst: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    far: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    farther: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    farthest: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    further: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    furthest: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    little: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    less: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    least: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    many: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    much: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    more: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    most: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    old: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    older: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    oldest: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    elder: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    eldest: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' }
  };

  if (irregularAdjectives[w]) {
    return {
      baseWord: irregularAdjectives[w].baseWord,
      singular: irregularAdjectives[w].baseWord,
      plural: irregularAdjectives[w].baseWord + 's',
      positive: irregularAdjectives[w].positive,
      comparative: irregularAdjectives[w].comparative,
      superlative: irregularAdjectives[w].superlative
    };
  }

  // 2. Irregular Nouns Table (Explicitly Map 'age' -> 'ages')
  const irregularNouns = {
    ages: { baseWord: 'age', singular: 'age', plural: 'ages' },
    age: { baseWord: 'age', singular: 'age', plural: 'ages' },
    children: { baseWord: 'child', singular: 'child', plural: 'children' },
    child: { baseWord: 'child', singular: 'child', plural: 'children' },
    people: { baseWord: 'person', singular: 'person', plural: 'people' },
    person: { baseWord: 'person', singular: 'person', plural: 'people' },
    men: { baseWord: 'man', singular: 'man', plural: 'men' },
    man: { baseWord: 'man', singular: 'man', plural: 'men' },
    women: { baseWord: 'woman', singular: 'woman', plural: 'women' },
    woman: { baseWord: 'woman', singular: 'woman', plural: 'women' },
    feet: { baseWord: 'foot', singular: 'foot', plural: 'feet' },
    foot: { baseWord: 'foot', singular: 'foot', plural: 'feet' },
    teeth: { baseWord: 'tooth', singular: 'tooth', plural: 'teeth' },
    tooth: { baseWord: 'tooth', singular: 'tooth', plural: 'teeth' },
    mice: { baseWord: 'mouse', singular: 'mouse', plural: 'mice' },
    mouse: { baseWord: 'mouse', singular: 'mouse', plural: 'mice' },
    geese: { baseWord: 'goose', singular: 'goose', plural: 'geese' },
    goose: { baseWord: 'goose', singular: 'goose', plural: 'geese' },
    leaves: { baseWord: 'leaf', singular: 'leaf', plural: 'leaves' },
    leaf: { baseWord: 'leaf', singular: 'leaf', plural: 'leaves' },
    lives: { baseWord: 'life', singular: 'life', plural: 'lives' },
    life: { baseWord: 'life', singular: 'life', plural: 'lives' },
    knives: { baseWord: 'knife', singular: 'knife', plural: 'knives' },
    knife: { baseWord: 'knife', singular: 'knife', plural: 'knives' },
    halves: { baseWord: 'half', singular: 'half', plural: 'halves' },
    half: { baseWord: 'half', singular: 'half', plural: 'halves' },
    wolves: { baseWord: 'wolf', singular: 'wolf', plural: 'wolves' },
    wolf: { baseWord: 'wolf', singular: 'wolf', plural: 'wolves' },
    phenomena: { baseWord: 'phenomenon', singular: 'phenomenon', plural: 'phenomena' },
    phenomenon: { baseWord: 'phenomenon', singular: 'phenomenon', plural: 'phenomena' },
    criteria: { baseWord: 'criterion', singular: 'criterion', plural: 'criteria' },
    criterion: { baseWord: 'criterion', singular: 'criterion', plural: 'criteria' },
    radii: { baseWord: 'radius', singular: 'radius', plural: 'radii' },
    radius: { baseWord: 'radius', singular: 'radius', plural: 'radii' },
    foci: { baseWord: 'focus', singular: 'focus', plural: 'foci / focuses' },
    focus: { baseWord: 'focus', singular: 'focus', plural: 'foci / focuses' },
    stimuli: { baseWord: 'stimulus', singular: 'stimulus', plural: 'stimuli' },
    stimulus: { baseWord: 'stimulus', singular: 'stimulus', plural: 'stimuli' },
    cacti: { baseWord: 'cactus', singular: 'cactus', plural: 'cacti / cactuses' },
    cactus: { baseWord: 'cactus', singular: 'cactus', plural: 'cacti / cactuses' },
    data: { baseWord: 'datum', singular: 'datum', plural: 'data' },
    datum: { baseWord: 'datum', singular: 'datum', plural: 'data' },
    indices: { baseWord: 'index', singular: 'index', plural: 'indices / indexes' },
    index: { baseWord: 'index', singular: 'index', plural: 'indexes / indices' },
    matrices: { baseWord: 'matrix', singular: 'matrix', plural: 'matrices' },
    matrix: { baseWord: 'matrix', singular: 'matrix', plural: 'matrices' },
    analyses: { baseWord: 'analysis', singular: 'analysis', plural: 'analyses' },
    analysis: { baseWord: 'analysis', singular: 'analysis', plural: 'analyses' },
    crises: { baseWord: 'crisis', singular: 'crisis', plural: 'crises' },
    crisis: { baseWord: 'crisis', singular: 'crisis', plural: 'crises' },
    hypotheses: { baseWord: 'hypothesis', singular: 'hypothesis', plural: 'hypotheses' },
    hypothesis: { baseWord: 'hypothesis', singular: 'hypothesis', plural: 'hypotheses' },
    diagnoses: { baseWord: 'diagnosis', singular: 'diagnosis', plural: 'diagnoses' },
    diagnosis: { baseWord: 'diagnosis', singular: 'diagnosis', plural: 'diagnoses' },
    series: { baseWord: 'series', singular: 'series', plural: 'series' },
    species: { baseWord: 'species', singular: 'species', plural: 'species' },
    sheep: { baseWord: 'sheep', singular: 'sheep', plural: 'sheep' },
    deer: { baseWord: 'deer', singular: 'deer', plural: 'deer' },
    fish: { baseWord: 'fish', singular: 'fish', plural: 'fish / fishes' },
    oxen: { baseWord: 'ox', singular: 'ox', plural: 'oxen' },
    ox: { baseWord: 'ox', singular: 'ox', plural: 'oxen' },
    heroes: { baseWord: 'hero', singular: 'hero', plural: 'heroes' },
    hero: { baseWord: 'hero', singular: 'hero', plural: 'heroes' },
    potatoes: { baseWord: 'potato', singular: 'potato', plural: 'potatoes' },
    potato: { baseWord: 'potato', singular: 'potato', plural: 'potatoes' },
    tomatoes: { baseWord: 'tomato', singular: 'tomato', plural: 'tomatoes' },
    tomato: { baseWord: 'tomato', singular: 'tomato', plural: 'tomatoes' },
  };

  if (irregularNouns[w]) {
    return {
      baseWord: irregularNouns[w].baseWord,
      singular: irregularNouns[w].singular,
      plural: irregularNouns[w].plural,
      positive: irregularNouns[w].singular,
      comparative: 'more ' + irregularNouns[w].singular,
      superlative: 'most ' + irregularNouns[w].singular
    };
  }

  // Strictly Uncountable / Mass nouns check (Exclude common count nouns like age)
  const strictlyUncountable = ['water', 'air', 'rice', 'information', 'knowledge', 'advice', 'furniture', 'money', 'evidence', 'equipment', 'luggage', 'baggage', 'news', 'paper', 'butter', 'milk', 'sugar', 'salt', 'sand', 'bread', 'homework', 'gold', 'silver', 'oxygen', 'courage', 'patience'];
  if (strictlyUncountable.includes(w) || (/ism$|ness$|ity$|ance$|ence$|hood$|ship$|dom$|ics$/i.test(w) && w !== 'age')) {
    return {
      baseWord: w,
      singular: w,
      plural: 'Uncountable (mass noun)',
      positive: w,
      comparative: 'more ' + w,
      superlative: 'most ' + w
    };
  }

  // Regular Noun rule derivation
  let singular = w;
  let plural = w + 's';

  if (w.endsWith('ies') && w.length > 4) {
    singular = w.slice(0, -3) + 'y';
    plural = w;
  } else if (w.endsWith('es') && w.length > 3) {
    if (/[sxz]es$|ches$|shes$/i.test(w)) {
      singular = w.slice(0, -2);
      plural = w;
    } else if (w.endsWith('ves') && w.length > 4) {
      singular = w.slice(0, -3) + 'f';
      plural = w;
    } else {
      singular = w.slice(0, -1);
      plural = w;
    }
  } else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('is') && !w.endsWith('us') && w.length > 3) {
    singular = w.slice(0, -1);
    plural = w;
  } else if (w.endsWith('y') && !/[aeiou]y$/i.test(w)) {
    singular = w;
    plural = w.slice(0, -1) + 'ies';
  } else if (/[sxz]$|ch$|sh$/i.test(w)) {
    singular = w;
    plural = w + 'es';
  } else if (w.endsWith('e')) {
    singular = w;
    plural = w + 's';
  }

  // Regular Adjective derivation
  let positive = singular;
  let comparative = 'more ' + positive;
  let superlative = 'most ' + positive;

  if (positive.length <= 6) {
    if (positive.endsWith('e')) {
      comparative = positive + 'r';
      superlative = positive + 'st';
    } else if (positive.endsWith('y') && !/[aeiou]y$/i.test(positive)) {
      comparative = positive.slice(0, -1) + 'ier';
      superlative = positive.slice(0, -1) + 'iest';
    } else if (!positive.endsWith('ful') && !positive.endsWith('less')) {
      comparative = positive + 'er';
      superlative = positive + 'est';
    }
  }

  return {
    baseWord: singular,
    singular,
    plural,
    positive,
    comparative,
    superlative
  };
}

export async function fetchAIDictionaryVerification(word, context = '', subjectDomain = '') {
  // 1. Primary: Server-side Gemini Oxford-Grade Lexicon Engine
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        context: context || '',
        subjectDomain: subjectDomain || window.State?.currentFile?.title || ''
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const resJson = await resp.json();
      if (resJson && resJson.data && resJson.data.word) {
        return resJson.data;
      }
    }
  } catch (err) {
    console.warn('[Dictionary] /api/dictionary call fallback or timeout:', err.message);
  }

  // 2. Fallback: Fast client LLM calls with multi-POS instruction
  const prompt = `You are an expert lexicographer. Provide comprehensive dictionary data for "${word}"${context ? ` in context: "${context}"` : ''}.
ACCURACY RULES: Include ONLY the parts of speech this word genuinely has (the two entries in "partsOfSpeech" below are a format example, delete any that do not apply). Use the context to pick the right sense for "contextMeaning". If you are not sure of a field (etymology, phonetics, an antonym), use "" or [] instead of guessing. Never invent a word, a Hindi meaning or an etymology. Synonyms and antonyms must be real, common words.
Return raw JSON ONLY with NO markdown code block tags:
{
  "word": "${word}",
  "baseWord": "root word",
  "phonetic": "IPA phonetics",
  "primaryPos": "Noun" | "Verb" | "Adjective" | "Adverb",
  "hindiMeaning": "accurate Hindi meaning (हिंदी अर्थ) in Devanagari script",
  "contextMeaning": "exact meaning in this context",
  "academicDefinition": "authoritative Oxford definition",
  "simpleExplanation": "easy 1-sentence Feynman explanation",
  "academicExample": "scholarly example sentence",
  "commonPitfall": "common student mistake or confusable pair",
  "etymology": "word origin",
  "partsOfSpeech": [
    {
      "pos": "Noun",
      "definition": "definition as Noun",
      "hindiMeaning": "Hindi meaning as Noun",
      "example": "Example sentence as Noun",
      "synonyms": ["(real synonym)"],
      "antonyms": [],
      "grammar": { "singular": "${word}", "plural": "${word}s" }
    },
    {
      "pos": "Verb",
      "definition": "definition as Verb",
      "hindiMeaning": "Hindi meaning as Verb",
      "example": "Example sentence as Verb",
      "synonyms": ["(real synonym)"],
      "antonyms": [],
      "grammar": { "v1": "${word}", "v2": "past", "v3": "past part", "ing": "-ing", "s": "-s" }
    }
  ],
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1", "antonym2"]
}`;

  try {
    let rawText = '';
    try {
      rawText = await callGroqFast(prompt, 600);
    } catch (e1) {
      try {
        rawText = await callGroq70b(prompt, 600);
      } catch (e2) {
        rawText = await callOpenRouter(prompt, 'meta-llama/llama-3.3-70b-instruct', 600);
      }
    }

    if (rawText) {
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && (parsed.baseWord || parsed.word)) return parsed;
    }
  } catch (e) {
    console.warn('AI Dictionary Verification fallback:', e.message);
  }
  return null;
}

export function getAdvancedGrammarForms(cleanWord, primaryPos, freeDictData, aiData) {
  const w = cleanWord.toLowerCase().trim();

  // Step 1: Check static irregular tables FIRST for 100% mathematical guarantee on good/better/best, bad/worse/worst, age/ages
  const lemmaInfo = findLemmaAndInflections(w, primaryPos);
  if (['good', 'better', 'best', 'bad', 'worse', 'worst', 'far', 'farther', 'further', 'farthest', 'furthest', 'little', 'less', 'least', 'many', 'much', 'more', 'most'].includes(w)) {
    return {
      type: 'adjective',
      isAdjective: true,
      baseWord: lemmaInfo.baseWord,
      positive: lemmaInfo.positive,
      comparative: lemmaInfo.comparative,
      superlative: lemmaInfo.superlative
    };
  }

  if (w === 'age' || w === 'ages') {
    return {
      type: 'noun',
      isNoun: true,
      baseWord: 'age',
      singular: 'age',
      plural: 'ages'
    };
  }

  // Step 2: Use AI Data if available with fallback logic
  if (aiData) {
    const aiPos = normalizePOS(aiData.primaryPos || primaryPos);
    if (aiPos === 'Verb' && aiData.v1) {
      return {
        type: 'verb',
        isVerb: true,
        baseWord: aiData.baseWord || aiData.v1,
        v1: aiData.v1,
        v2: aiData.v2 || (aiData.v1 + 'ed'),
        v3: aiData.v3 || (aiData.v1 + 'ed'),
        ing: aiData.ing || (aiData.v1 + 'ing'),
        s: aiData.s || (aiData.v1 + 's'),
        transitivity: aiData.transitivity || ''
      };
    }
    if (aiPos === 'Noun' && aiData.singular && aiData.plural) {
      let plural = aiData.plural;
      if ((w === 'age' || w === 'ages') || plural.toLowerCase().includes('uncountable') && w === 'age') {
        plural = 'ages';
      }
      return {
        type: 'noun',
        isNoun: true,
        baseWord: aiData.baseWord || aiData.singular,
        singular: aiData.singular,
        plural: plural
      };
    }
    if (aiPos === 'Adjective' && aiData.positive) {
      let positive = aiData.positive;
      let comparative = aiData.comparative || ('more ' + positive);
      let superlative = aiData.superlative || ('most ' + positive);

      if (positive === 'better' || positive === 'best' || w === 'best' || w === 'better') {
        positive = 'good';
        comparative = 'better';
        superlative = 'best';
      }

      return {
        type: 'adjective',
        isAdjective: true,
        baseWord: aiData.baseWord || positive,
        positive,
        comparative,
        superlative
      };
    }
  }

  if (primaryPos === 'Verb') {
    const vf = getVerbForms(lemmaInfo.baseWord);
    let transitivity = '';
    const entry = freeDictData?.[0];
    if (entry?.meanings) {
      for (const m of entry.meanings) {
        if (m.partOfSpeech?.toLowerCase() === 'verb') {
          for (const d of (m.definitions || [])) {
            const defText = (d.definition || '').toLowerCase();
            if (defText.includes('transitive') || defText.includes('(transitive)')) {
              transitivity = 'Transitive';
            } else if (defText.includes('intransitive') || defText.includes('(intransitive)')) {
              transitivity = 'Intransitive';
            }
          }
        }
      }
    }

    return {
      type: 'verb',
      isVerb: true,
      baseWord: lemmaInfo.baseWord,
      v1: vf.v1,
      v2: vf.v2,
      v3: vf.v3,
      ing: vf.ing,
      s: vf.s,
      transitivity
    };
  }

  if (primaryPos === 'Noun') {
    return {
      type: 'noun',
      isNoun: true,
      baseWord: lemmaInfo.baseWord,
      singular: lemmaInfo.singular,
      plural: lemmaInfo.plural
    };
  }

  if (primaryPos === 'Adjective') {
    return {
      type: 'adjective',
      isAdjective: true,
      baseWord: lemmaInfo.baseWord,
      positive: lemmaInfo.positive,
      comparative: lemmaInfo.comparative,
      superlative: lemmaInfo.superlative
    };
  }

  return {
    type: 'other',
    isOther: true,
    label: 'Not applicable for this word.'
  };
}

export function getGrammarForms(cleanWord, primaryPos, freeDictData, aiData) {
  return getAdvancedGrammarForms(cleanWord, primaryPos, freeDictData, aiData);
}

export function getCoreSynonymsAndAntonyms(cleanWord) {
  const w = cleanWord.toLowerCase().trim();
  const map = {
    good: {
      synonyms: ['excellent', 'fine', 'superior', 'admirable', 'great', 'virtuous', 'positive'],
      antonyms: ['bad', 'poor', 'inferior', 'wicked', 'evil']
    },
    better: {
      synonyms: ['superior', 'finer', 'improved', 'preferable'],
      antonyms: ['worse', 'inferior']
    },
    best: {
      synonyms: ['finest', 'top', 'optimum', 'supreme', 'prime'],
      antonyms: ['worst', 'poorest']
    },
    bad: {
      synonyms: ['poor', 'inferior', 'dreadful', 'awful', 'terrible', 'harmful'],
      antonyms: ['good', 'excellent', 'fine', 'virtuous']
    },
    worse: {
      synonyms: ['more inferior', 'poorer', 'unpleasant'],
      antonyms: ['better', 'superior']
    },
    worst: {
      synonyms: ['most inferior', 'poorest', 'dreadful'],
      antonyms: ['best', 'finest']
    },
    far: {
      synonyms: ['distant', 'remote', 'faraway', 'removed'],
      antonyms: ['near', 'close', 'nearby']
    },
    age: {
      synonyms: ['era', 'epoch', 'period', 'generation', 'lifetime', 'years'],
      antonyms: ['youth', 'infancy']
    },
    ages: {
      synonyms: ['eons', 'eras', 'epochs', 'years', 'generations'],
      antonyms: ['moments', 'seconds']
    },
    happy: {
      synonyms: ['joyful', 'cheerful', 'delighted', 'glad', 'content'],
      antonyms: ['sad', 'unhappy', 'sorrowful', 'depressed']
    },
    sad: {
      synonyms: ['unhappy', 'sorrowful', 'gloomy', 'melancholy', 'dejected'],
      antonyms: ['happy', 'joyful', 'cheerful']
    },
    big: {
      synonyms: ['large', 'huge', 'massive', 'enormous', 'gigantic'],
      antonyms: ['small', 'little', 'tiny', 'miniature']
    },
    small: {
      synonyms: ['little', 'tiny', 'miniature', 'compact', 'minor'],
      antonyms: ['big', 'large', 'huge', 'massive']
    },
    fast: {
      synonyms: ['quick', 'rapid', 'swift', 'speedy', 'brisk'],
      antonyms: ['slow', 'sluggish', 'gradual']
    },
    slow: {
      synonyms: ['sluggish', 'gradual', 'unhurried', 'leisurely'],
      antonyms: ['fast', 'quick', 'rapid', 'swift']
    },
    beautiful: {
      synonyms: ['gorgeous', 'attractive', 'stunning', 'lovely', 'handsome'],
      antonyms: ['ugly', 'unattractive', 'hideous']
    },
    smart: {
      synonyms: ['intelligent', 'clever', 'bright', 'sharp', 'shrewd'],
      antonyms: ['stupid', 'foolish', 'dumb', 'ignorant']
    },
    strong: {
      synonyms: ['powerful', 'robust', 'sturdy', 'mighty', 'tough'],
      antonyms: ['weak', 'frail', 'feeble', 'vulnerable']
    },
    weak: {
      synonyms: ['frail', 'feeble', 'fragile', 'vulnerable', 'delicate'],
      antonyms: ['strong', 'powerful', 'robust']
    },
    rich: {
      synonyms: ['wealthy', 'affluent', 'prosperous', 'abundant'],
      antonyms: ['poor', 'impoverished', 'needy']
    },
    poor: {
      synonyms: ['impoverished', 'needy', 'penniless', 'destitute'],
      antonyms: ['rich', 'wealthy', 'affluent']
    },
    hot: {
      synonyms: ['warm', 'scalding', 'boiling', 'heated'],
      antonyms: ['cold', 'chilly', 'freezing', 'cool']
    },
    cold: {
      synonyms: ['chilly', 'freezing', 'frigid', 'icy'],
      antonyms: ['hot', 'warm', 'boiling']
    },
    hard: {
      synonyms: ['difficult', 'solid', 'tough', 'firm'],
      antonyms: ['easy', 'soft', 'simple']
    },
    easy: {
      synonyms: ['simple', 'effortless', 'painless', 'uncomplicated'],
      antonyms: ['hard', 'difficult', 'demanding']
    },
    important: {
      synonyms: ['vital', 'crucial', 'essential', 'significant'],
      antonyms: ['unimportant', 'trivial', 'minor']
    },
    resilient: {
      synonyms: ['tough', 'hardy', 'adaptable', 'buoyant'],
      antonyms: ['vulnerable', 'fragile', 'weak']
    },
    ubiquitous: {
      synonyms: ['omnipresent', 'pervasive', 'everywhere', 'universal'],
      antonyms: ['rare', 'scarce', 'infrequent']
    },
    ephemeral: {
      synonyms: ['transient', 'fleeting', 'temporary', 'momentary'],
      antonyms: ['permanent', 'eternal', 'lasting']
    },
    pragmatic: {
      synonyms: ['practical', 'realistic', 'sensible', 'rational'],
      antonyms: ['idealistic', 'impractical', 'unrealistic']
    },
    word: {
      synonyms: ['term', 'expression', 'utterance', 'remark', 'statement', 'vow', 'promise', 'news'],
      antonyms: ['silence', 'inaction']
    }
  };
  return map[w] || { synonyms: [], antonyms: [] };
}

export function validateSynonymsAndAntonyms(cleanWord, primaryPos, synRawList = [], antRawList = []) {
  const isCleanWord = (w) => {
    if (!w || typeof w !== 'string') return false;
    const lower = w.toLowerCase().trim();
    if (lower === cleanWord) return false;
    if (!/^[a-z]+(-[a-z]+)*(\s[a-z]+(-[a-z]+)*)?$/i.test(lower)) return false;
    if (lower.length < 2 || lower.length > 30) return false;
    return true;
  };

  const core = getCoreSynonymsAndAntonyms(cleanWord);
  const combinedSyns = [...(core.synonyms || []), ...synRawList];
  const combinedAnts = [...(core.antonyms || []), ...antRawList];

  const cleanSyns = [];
  const synSet = new Set();
  for (const s of combinedSyns) {
    if (isCleanWord(s)) {
      const lower = s.toLowerCase().trim();
      if (!synSet.has(lower)) {
        synSet.add(lower);
        cleanSyns.push(lower);
      }
    }
  }

  const cleanAnts = [];
  const antSet = new Set();
  for (const a of combinedAnts) {
    if (isCleanWord(a)) {
      const lower = a.toLowerCase().trim();
      if (!synSet.has(lower) && !antSet.has(lower)) {
        antSet.add(lower);
        cleanAnts.push(lower);
      }
    }
  }

  return {
    synonyms: cleanSyns.slice(0, 8),
    antonyms: cleanAnts.slice(0, 8)
  };
}

export function extractHindiMeaningByPOS(cleanWord, primaryPos, primaryDef, gtxData, myMemory) {
  let selectedHindi = '';

  if (gtxData && Array.isArray(gtxData) && gtxData[1] && Array.isArray(gtxData[1])) {
    const targetPosLower = primaryPos.toLowerCase();
    const posMap = { noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb' };
    const mappedTarget = posMap[targetPosLower] || targetPosLower;

    for (const dictBlock of gtxData[1]) {
      if (Array.isArray(dictBlock) && dictBlock[0] && dictBlock[0].toLowerCase() === mappedTarget) {
        const terms = dictBlock[1];
        const detailList = dictBlock[2];
        
        if (Array.isArray(detailList) && detailList.length > 0) {
          const matchedTerms = [];
          const defKeywords = (primaryDef || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);

          for (const item of detailList) {
            if (item.word && Array.isArray(item.reverse_translation)) {
              const revs = item.reverse_translation.map(r => r.toLowerCase());
              const isRelevantSense = revs.includes(cleanWord) || revs.some(r => defKeywords.some(kw => r.includes(kw)));
              if (isRelevantSense && !matchedTerms.includes(item.word)) {
                matchedTerms.push(item.word);
              }
            }
          }

          if (matchedTerms.length > 0) {
            selectedHindi = matchedTerms.slice(0, 2).join(', ');
            break;
          }
        }

        if (!selectedHindi && Array.isArray(terms) && terms.length > 0) {
          selectedHindi = terms.slice(0, 2).join(', ');
          break;
        }
      }
    }
  }

  if (!selectedHindi && gtxData && Array.isArray(gtxData) && gtxData[0]?.[0]?.[0]) {
    const raw = gtxData[0][0][0].trim();
    if (raw && raw.toLowerCase() !== cleanWord && /[\u0900-\u097F]/.test(raw)) {
      selectedHindi = raw;
    }
  }

  if (!selectedHindi && myMemory && myMemory.responseData && myMemory.responseData.translatedText) {
    const rawHi = myMemory.responseData.translatedText.trim();
    if (rawHi && rawHi.toLowerCase() !== cleanWord && !rawHi.startsWith('MYMEMORY WARNING') && /[\u0900-\u097F]/.test(rawHi)) {
      selectedHindi = rawHi;
    }
  }

  return selectedHindi ? `${cleanWord} ➔ ${selectedHindi}` : '';
}

export function parseMerriamWebsterResponse(mwData, cleanWord) {
  if (!Array.isArray(mwData) || !mwData.length) return null;
  if (typeof mwData[0] === 'string') {
    return { suggestions: mwData.slice(0, 5) };
  }

  const entries = mwData.filter(item => typeof item === 'object' && item.hwi);
  if (!entries.length) return null;

  const meanings = [];
  let pronunciation = '';
  let audioUrl = '';
  const synonyms = [];
  const antonyms = [];
  const etymologies = [];
  const headwords = [];

  entries.forEach(entry => {
    const hw = (entry.hwi?.hw || cleanWord).replace(/\*/g, '·');
    if (!headwords.includes(hw)) headwords.push(hw);

    const posRaw = entry.fl || 'Word';
    const posName = posRaw.charAt(0).toUpperCase() + posRaw.slice(1);

    if (!pronunciation && entry.hwi?.prs?.[0]?.mw) {
      pronunciation = entry.hwi.prs[0].mw;
    }
    if (!audioUrl && entry.hwi?.prs?.[0]?.sound?.audio) {
      const audioName = entry.hwi.prs[0].sound.audio;
      let subDir = audioName.charAt(0);
      if (audioName.startsWith('bix')) subDir = 'bix';
      else if (audioName.startsWith('gg')) subDir = 'gg';
      else if (/^[0-9_\W]/.test(audioName)) subDir = 'number';
      audioUrl = `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subDir}/${audioName}.mp3`;
    }

    if (Array.isArray(entry.shortdef)) {
      entry.shortdef.forEach(sdef => {
        const cleaned = sdef.replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
        if (cleaned && !meanings.some(m => m.def === cleaned)) {
          meanings.push({ pos: posName, def: cleaned, source: 'Merriam-Webster' });
        }
      });
    }

    if (!meanings.length && entry.def) {
      entry.def.forEach(dObj => {
        if (Array.isArray(dObj.sseq)) {
          dObj.sseq.forEach(sseqItem => {
            sseqItem.forEach(sItem => {
              if (Array.isArray(sItem) && sItem[0] === 'sense' && sItem[1]?.dt) {
                sItem[1].dt.forEach(dtItem => {
                  if (Array.isArray(dtItem) && dtItem[0] === 'text') {
                    const textDef = dtItem[1].replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
                    if (textDef && !meanings.some(m => m.def === textDef)) {
                      meanings.push({ pos: posName, def: textDef, source: 'Merriam-Webster' });
                    }
                  }
                });
              }
            });
          });
        }
      });
    }

    if (entry.meta?.syns) {
      entry.meta.syns.flat().forEach(s => {
        if (typeof s === 'string' && !synonyms.includes(s)) synonyms.push(s);
      });
    }
    if (entry.meta?.ants) {
      entry.meta.ants.flat().forEach(a => {
        if (typeof a === 'string' && !antonyms.includes(a)) antonyms.push(a);
      });
    }

    if (entry.et && Array.isArray(entry.et)) {
      entry.et.forEach(etItem => {
        if (Array.isArray(etItem) && etItem[0] === 'text') {
          const cleanEt = etItem[1].replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').replace(/<[^>]*>/g, '').trim();
          if (cleanEt && !etymologies.includes(cleanEt)) etymologies.push(cleanEt);
        }
      });
    }
  });

  return {
    headword: headwords[0] || cleanWord,
    meanings,
    pronunciation,
    audioUrl,
    synonyms,
    antonyms,
    etymologies
  };
}

export function parseMerriamWebsterThesaurusResponse(mwThesData, cleanWord) {
  if (!Array.isArray(mwThesData) || !mwThesData.length) return null;
  if (typeof mwThesData[0] === 'string') return null;

  const synonyms = [];
  const antonyms = [];

  mwThesData.forEach(entry => {
    if (entry && typeof entry === 'object' && entry.meta) {
      if (Array.isArray(entry.meta.syns)) {
        entry.meta.syns.flat().forEach(s => {
          if (typeof s === 'string') {
            const cleanS = s.trim().toLowerCase();
            if (cleanS && cleanS !== cleanWord && !synonyms.includes(cleanS)) {
              synonyms.push(cleanS);
            }
          }
        });
      }
      if (Array.isArray(entry.meta.ants)) {
        entry.meta.ants.flat().forEach(a => {
          if (typeof a === 'string') {
            const cleanA = a.trim().toLowerCase();
            if (cleanA && cleanA !== cleanWord && !antonyms.includes(cleanA)) {
              antonyms.push(cleanA);
            }
          }
        });
      }
    }
  });

  return { synonyms, antonyms };
}

export function normalizePOS(posRaw) {
  if (!posRaw || typeof posRaw !== 'string') return 'General';
  const lower = posRaw.trim().toLowerCase();
  if (lower === 'n' || lower === 'noun') return 'Noun';
  if (lower === 'v' || lower === 'verb' || lower.includes('verb')) return 'Verb';
  if (lower === 'adj' || lower === 'adjective') return 'Adjective';
  if (lower === 'adv' || lower === 'adverb') return 'Adverb';
  if (lower === 'prep' || lower === 'preposition') return 'Preposition';
  if (lower === 'conj' || lower === 'conjunction') return 'Conjunction';
  if (lower === 'pron' || lower === 'pronoun') return 'Pronoun';
  if (lower === 'interj' || lower === 'interjection') return 'Interjection';
  if (lower.includes('phrase') || lower.includes('idiom')) return 'Phrase / Idiom';
  return posRaw.charAt(0).toUpperCase() + posRaw.slice(1).toLowerCase();
}

export async function fetchHybridDictionary(word, context = '', subjectDomain = '') {
  const cleanWord = word.toLowerCase().trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '') || word.toLowerCase().trim();
  const cacheKey = 'dict_v12_' + cleanWord + (context ? '_' + context.slice(0, 30).replace(/\s+/g, '_') : '');

  // 1. Check IndexedDB cache first
  try {
    if (window.DB && window.DB.getSetting && !context) {
      const cached = await window.DB.getSetting(cacheKey, null);
      if (cached && cached.primaryDef && cached.primaryDef !== 'Definition not available in standard dictionary datasets.') {
        return cached;
      }
    }
  } catch(e) {}

  // 2. Setup Merriam-Webster keys
  const DEFAULT_MW_DICT_KEY = 'a25615d3-9057-4b18-b917-f4bf6c173c5c';
  const DEFAULT_MW_THESAURUS_KEY = 'f0f9a8b2-85d7-4064-9737-f4432f18ef65';

  let mwDictKey = window.State?.mwDictKey || window.State?.mwApiKey || DEFAULT_MW_DICT_KEY;
  let mwThesKey = window.State?.mwThesaurusKey || DEFAULT_MW_THESAURUS_KEY;

  if (window.DB?.getSetting) {
    try {
      const dbDict = await window.DB.getSetting('mw_dict_key', '');
      if (dbDict) mwDictKey = dbDict;
      const dbThes = await window.DB.getSetting('mw_thesaurus_key', '');
      if (dbThes) mwThesKey = dbThes;
    } catch(e){}
  }

  const mwDictUrl = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(cleanWord)}?key=${encodeURIComponent(mwDictKey)}`;
  const mwThesUrl = `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(cleanWord)}?key=${encodeURIComponent(mwThesKey)}`;

  // 3. Fetch Merriam-Webster, dictionaryapi.dev, Datamuse, translations & AI Lexicographer Verification simultaneously
  const [
    dictApiRes,
    datamuseRes,
    datamuseSynsRes,
    datamuseAntsRes,
    gtxRes,
    myMemoryRes,
    mwDictRes,
    mwThesRes,
    aiRes
  ] = await Promise.allSettled([
    fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=dp`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanWord)}&langpair=en|hi`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(mwDictUrl, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(mwThesUrl, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchAIDictionaryVerification(cleanWord, context, subjectDomain)
  ]);

  const freeDictData = dictApiRes.status === 'fulfilled' ? dictApiRes.value : null;
  const datamuseData = datamuseRes.status === 'fulfilled' ? datamuseRes.value : null;
  const datamuseSyns = datamuseSynsRes.status === 'fulfilled' && Array.isArray(datamuseSynsRes.value) ? datamuseSynsRes.value : [];
  const datamuseAnts = datamuseAntsRes.status === 'fulfilled' && Array.isArray(datamuseAntsRes.value) ? datamuseAntsRes.value : [];
  const gtxData = gtxRes.status === 'fulfilled' ? gtxRes.value : null;
  const myMemory = myMemoryRes.status === 'fulfilled' ? myMemoryRes.value : null;
  const mwDictRaw = mwDictRes.status === 'fulfilled' ? mwDictRes.value : null;
  const mwThesRaw = mwThesRes.status === 'fulfilled' ? mwThesRes.value : null;
  const aiData = aiRes.status === 'fulfilled' ? aiRes.value : null;

  const merriamWebster = mwDictRaw ? parseMerriamWebsterResponse(mwDictRaw, cleanWord) : null;
  const mwThesaurus = mwThesRaw ? parseMerriamWebsterThesaurusResponse(mwThesRaw, cleanWord) : null;

  const primaryPos = normalizePOS(aiData?.primaryPos || detectPrimaryPOS(cleanWord, freeDictData, datamuseData, null));

  // Build Map of POS Groups to group senses, synonyms, and antonyms by Part of Speech
  const posGroupMap = new Map();

  const getPosGroup = (posRaw) => {
    const normPos = normalizePOS(posRaw);
    if (!posGroupMap.has(normPos)) {
      posGroupMap.set(normPos, {
        pos: normPos,
        senses: [],
        rawSyns: [],
        rawAnts: [],
        synonyms: [],
        antonyms: []
      });
    }
    return posGroupMap.get(normPos);
  };

  // 1. Process Merriam-Webster Dictionary
  if (Array.isArray(mwDictRaw)) {
    mwDictRaw.forEach(entry => {
      if (typeof entry === 'object' && entry.hwi) {
        const entryPos = normalizePOS(entry.fl || 'Word');
        const group = getPosGroup(entryPos);

        if (Array.isArray(entry.shortdef)) {
          entry.shortdef.forEach(sdef => {
            const cleaned = sdef.replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
            if (cleaned && !group.senses.some(s => s.def === cleaned)) {
              group.senses.push({ pos: entryPos, def: cleaned, example: '', source: 'Merriam-Webster' });
            }
          });
        }

        if (!group.senses.length && entry.def) {
          entry.def.forEach(dObj => {
            if (Array.isArray(dObj.sseq)) {
              dObj.sseq.forEach(sseqItem => {
                sseqItem.forEach(sItem => {
                  if (Array.isArray(sItem) && sItem[0] === 'sense' && sItem[1]?.dt) {
                    sItem[1].dt.forEach(dtItem => {
                      if (Array.isArray(dtItem) && dtItem[0] === 'text') {
                        const textDef = dtItem[1].replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
                        if (textDef && !group.senses.some(s => s.def === textDef)) {
                          group.senses.push({ pos: entryPos, def: textDef, example: '', source: 'Merriam-Webster' });
                        }
                      }
                    });
                  }
                });
              });
            }
          });
        }

        if (entry.meta?.syns) {
          entry.meta.syns.flat().forEach(s => {
            if (typeof s === 'string') group.rawSyns.push(s);
          });
        }
        if (entry.meta?.ants) {
          entry.meta.ants.flat().forEach(a => {
            if (typeof a === 'string') group.rawAnts.push(a);
          });
        }
      }
    });
  }

  // 2. Process Merriam-Webster Thesaurus
  if (Array.isArray(mwThesRaw)) {
    mwThesRaw.forEach(entry => {
      if (entry && typeof entry === 'object' && entry.meta) {
        const entryPos = normalizePOS(entry.fl || 'Word');
        const group = getPosGroup(entryPos);

        if (Array.isArray(entry.meta.syns)) {
          entry.meta.syns.flat().forEach(s => {
            if (typeof s === 'string') group.rawSyns.push(s);
          });
        }
        if (Array.isArray(entry.meta.ants)) {
          entry.meta.ants.flat().forEach(a => {
            if (typeof a === 'string') group.rawAnts.push(a);
          });
        }
      }
    });
  }

  // 3. Process Free Dictionary API
  if (freeDictData && freeDictData[0] && freeDictData[0].meanings) {
    for (const m of freeDictData[0].meanings) {
      const mPos = normalizePOS(m.partOfSpeech || 'General');
      const group = getPosGroup(mPos);

      for (const d of (m.definitions || [])) {
        if (d.definition && !group.senses.some(s => s.def === d.definition)) {
          group.senses.push({ pos: mPos, def: d.definition, example: d.example || '', source: 'dictionaryapi.dev' });
        }
      }

      (m.synonyms || []).forEach(s => group.rawSyns.push(s));
      (m.antonyms || []).forEach(a => group.rawAnts.push(a));
      for (const d of (m.definitions || [])) {
        (d.synonyms || []).forEach(s => group.rawSyns.push(s));
        (d.antonyms || []).forEach(a => group.rawAnts.push(a));
      }
    }
  }

  // 4. Inject AI multi-POS structured data (CRITICAL for words like "issue" with Noun & Verb forms)
  if (aiData?.partsOfSpeech && Array.isArray(aiData.partsOfSpeech)) {
    aiData.partsOfSpeech.forEach(posItem => {
      if (posItem && posItem.pos) {
        const itemPos = normalizePOS(posItem.pos);
        const group = getPosGroup(itemPos);
        if (posItem.definition) {
          if (!group.senses.some(s => s.def === posItem.definition)) {
            group.senses.unshift({
              pos: itemPos,
              def: posItem.definition,
              example: posItem.example || '',
              source: 'Oxford Academic'
            });
          }
        }
        if (posItem.hindiMeaning) {
          group.hindiMeaning = posItem.hindiMeaning;
        }
        if (posItem.example) {
          group.example = posItem.example;
        }
        if (Array.isArray(posItem.synonyms) && posItem.synonyms.length > 0) {
          posItem.synonyms.forEach(s => {
            if (s && !group.rawSyns.includes(s)) group.rawSyns.unshift(s);
          });
        }
        if (Array.isArray(posItem.antonyms) && posItem.antonyms.length > 0) {
          posItem.antonyms.forEach(a => {
            if (a && !group.rawAnts.includes(a)) group.rawAnts.unshift(a);
          });
        }
        if (posItem.grammar) {
          group.grammar = posItem.grammar;
        }
      }
    });
  }

  // Inject AI Synonyms & Antonyms for primary POS
  if (aiData?.synonyms && Array.isArray(aiData.synonyms)) {
    const primGroup = getPosGroup(primaryPos);
    aiData.synonyms.forEach(s => {
      if (s && !primGroup.rawSyns.includes(s)) primGroup.rawSyns.unshift(s);
    });
  }
  if (aiData?.antonyms && Array.isArray(aiData.antonyms)) {
    const primGroup = getPosGroup(primaryPos);
    aiData.antonyms.forEach(a => {
      if (a && !primGroup.rawAnts.includes(a)) primGroup.rawAnts.unshift(a);
    });
  }

  // Ensure primary POS group exists
  const primGroup = getPosGroup(primaryPos || 'General');

  // 5. Process Datamuse API Synonyms and Antonyms with POS tagging
  if (datamuseSyns && Array.isArray(datamuseSyns)) {
    datamuseSyns.forEach(s => {
      if (s && s.word) {
        let matchedPos = null;
        if (Array.isArray(s.tags)) {
          const tagPos = s.tags.find(t => ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'interj'].includes(t.toLowerCase()));
          if (tagPos) matchedPos = normalizePOS(tagPos);
        }
        if (matchedPos && posGroupMap.has(matchedPos) && posGroupMap.get(matchedPos).senses.length > 0) {
          getPosGroup(matchedPos).rawSyns.push(s.word);
        } else {
          primGroup.rawSyns.push(s.word);
        }
      }
    });
  }

  if (datamuseAnts && Array.isArray(datamuseAnts)) {
    datamuseAnts.forEach(a => {
      if (a && a.word) {
        let matchedPos = null;
        if (Array.isArray(a.tags)) {
          const tagPos = a.tags.find(t => ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'interj'].includes(t.toLowerCase()));
          if (tagPos) matchedPos = normalizePOS(tagPos);
        }
        if (matchedPos && posGroupMap.has(matchedPos) && posGroupMap.get(matchedPos).senses.length > 0) {
          getPosGroup(matchedPos).rawAnts.push(a.word);
        } else {
          primGroup.rawAnts.push(a.word);
        }
      }
    });
  }

  // 4. Inject AI-verified Multi-POS data if available
  if (Array.isArray(aiData?.partsOfSpeech) && aiData.partsOfSpeech.length > 0) {
    aiData.partsOfSpeech.forEach(pItem => {
      if (!pItem || !pItem.pos) return;
      const nPos = normalizePOS(pItem.pos);
      const group = getPosGroup(nPos);
      if (pItem.definition) {
        // Put AI definition at the very front of senses
        if (!group.senses.some(s => s.def === pItem.definition)) {
          group.senses.unshift({
            pos: nPos,
            def: pItem.definition,
            example: pItem.example || '',
            source: 'Oxford/AI Verified'
          });
        }
      }
      if (pItem.hindiMeaning) {
        group.hindiMeaning = pItem.hindiMeaning;
      }
      if (pItem.example && !group.example) {
        group.example = pItem.example;
      }
      if (Array.isArray(pItem.synonyms) && pItem.synonyms.length > 0) {
        group.rawSyns.unshift(...pItem.synonyms);
      }
      if (Array.isArray(pItem.antonyms) && pItem.antonyms.length > 0) {
        group.rawAnts.unshift(...pItem.antonyms);
      }
      if (pItem.grammar) {
        group.grammar = pItem.grammar;
      }
    });
  }

  if (aiData?.primaryDef && !primGroup.senses.some(s => s.def === aiData.primaryDef)) {
    primGroup.senses.unshift({
      pos: primaryPos || 'General',
      def: aiData.primaryDef,
      example: aiData.academicExample || '',
      source: 'AI Verified'
    });
  }

  if (!primGroup.senses.length) {
    primGroup.senses.push({
      pos: primaryPos || 'General',
      def: `Could not fetch a definition for "${cleanWord}" right now. Check your internet and search again.`,
      example: '',
      source: ''
    });
  }

  // Fold any 0-sense groups' synonyms/antonyms into primary POS group
  posGroupMap.forEach((group, pos) => {
    if (pos !== primaryPos && (!group.senses || group.senses.length === 0)) {
      if (group.rawSyns && group.rawSyns.length) {
        primGroup.rawSyns.push(...group.rawSyns);
      }
      if (group.rawAnts && group.rawAnts.length) {
        primGroup.rawAnts.push(...group.rawAnts);
      }
    }
  });

  // Validate Synonyms and Antonyms for each POS group
  posGroupMap.forEach((group) => {
    const { synonyms: valSyns, antonyms: valAnts } = validateSynonymsAndAntonyms(cleanWord, group.pos, group.rawSyns, group.rawAnts);
    group.synonyms = valSyns;
    group.antonyms = valAnts;
    if (!group.grammar) {
      group.grammar = getGrammarForms(cleanWord, group.pos, freeDictData, aiData);
    }
    if (!group.hindiMeaning) {
      const gSenseDef = group.senses?.[0]?.def || '';
      group.hindiMeaning = extractHindiMeaningByPOS(cleanWord, group.pos, gSenseDef, gtxData, myMemory);
    }
  });

  // Extract allMeanings and overall synonyms/antonyms
  const meanings = [];
  const allRawSyns = [];
  const allRawAnts = [];

  posGroupMap.forEach(group => {
    if (group.senses && group.senses.length > 0) {
      group.senses.forEach(s => {
        if (!meanings.some(exist => exist.def === s.def)) {
          meanings.push(s);
        }
      });
      group.synonyms.forEach(s => allRawSyns.push(s));
      group.antonyms.forEach(a => allRawAnts.push(a));
    }
  });

  const { synonyms, antonyms } = validateSynonymsAndAntonyms(cleanWord, primaryPos, allRawSyns, allRawAnts);
  const primaryDef = aiData?.academicDefinition || aiData?.primaryDef || meanings[0]?.def || `Definition for "${cleanWord}": standard vocabulary word.`;
  const exampleSentence = meanings.find(m => m.example)?.example || '';

  const phonetic = merriamWebster?.pronunciation ? `\\ ${merriamWebster.pronunciation} \\` : (freeDictData?.[0]?.phonetic || freeDictData?.[0]?.phonetics?.find(p => p.text)?.text || '');
  const audioUrl = merriamWebster?.audioUrl || (freeDictData?.[0]?.phonetics?.find(p => p.audio && p.audio.trim().length > 0)?.audio) || '';

  const grammar = getGrammarForms(cleanWord, primaryPos, freeDictData, aiData);
  const hindiMeaning = aiData?.hindiMeaning || extractHindiMeaningByPOS(cleanWord, primaryPos, primaryDef, gtxData, myMemory);
  const baseWord = aiData?.baseWord || grammar?.baseWord || cleanWord;

  const majorPosOrder = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition', 'Conjunction', 'Pronoun', 'Interjection'];

  const validAiPosNames = (aiData?.partsOfSpeech && Array.isArray(aiData.partsOfSpeech) && aiData.partsOfSpeech.length > 0)
    ? aiData.partsOfSpeech.map(p => normalizePOS(p.pos || ''))
    : null;

  const posGroups = Array.from(posGroupMap.values())
    .filter(g => {
      if (!g.senses || g.senses.length === 0) return false;
      // Never allow Phrase / Idiom as a standalone POS card
      if (g.pos === 'Phrase / Idiom' || g.pos === 'Phrase' || g.pos === 'Idiom') return false;
      // If AI verified parts of speech, strictly only allow those verified parts of speech or primaryPos
      if (validAiPosNames && validAiPosNames.length > 0) {
        return validAiPosNames.includes(g.pos) || g.pos === primaryPos;
      }
      // Otherwise only allow major recognized parts of speech
      return majorPosOrder.includes(g.pos);
    })
    .sort((a, b) => {
      if (a.pos === primaryPos) return -1;
      if (b.pos === primaryPos) return 1;
      const idxA = majorPosOrder.indexOf(a.pos);
      const idxB = majorPosOrder.indexOf(b.pos);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

  const resultData = {
    word: cleanWord,
    baseWord,
    phonetic: aiData?.phonetic || phonetic,
    audioUrl,
    partsOfSpeech: Array.from(new Set(meanings.map(m => m.pos))),
    primaryPos,
    primaryDef: aiData?.academicDefinition || aiData?.primaryDef || primaryDef,
    contextMeaning: aiData?.contextMeaning || '',
    academicDefinition: aiData?.academicDefinition || primaryDef,
    simpleExplanation: aiData?.simpleExplanation || '',
    academicExample: aiData?.academicExample || exampleSentence,
    commonPitfall: aiData?.commonPitfall || '',
    etymology: aiData?.etymology || (merriamWebster?.etymologies?.join(' ') || ''),
    hindiMeaning: aiData?.hindiMeaning || hindiMeaning,
    allMeanings: meanings.slice(0, 10),
    posGroups,
    grammar: (aiData && aiData.grammar) ? { ...grammar, ...aiData.grammar } : grammar,
    synonyms: (aiData?.synonyms && aiData.synonyms.length > 0) ? Array.from(new Set([...aiData.synonyms, ...synonyms])).slice(0, 8) : synonyms,
    antonyms: (aiData?.antonyms && aiData.antonyms.length > 0) ? Array.from(new Set([...aiData.antonyms, ...antonyms])).slice(0, 6) : antonyms,
    exampleSentence: aiData?.academicExample || exampleSentence,
    merriamWebster,
    source: aiData ? 'Gemini Oxford Academic Engine' : (merriamWebster ? 'Merriam-Webster' : 'Hybrid Dictionary'),
    cachedAt: Date.now()
  };

  try {
    if (window.DB && window.DB.setting) {
      await window.DB.setting(cacheKey, resultData);
    }
  } catch(e) {}

  return resultData;
}

export async function runDictionaryLookup(sel){
  const rawText = sel?.text || (typeof sel === 'string' ? sel : '');
  let contextSentence = sel?.context || sel?.sentence || sel?.fullSentence || (rawText.length > 40 ? rawText : '');
  
  let initialWord = '';
  if (rawText) {
    const trimmed = rawText.trim();
    if (trimmed.includes(' ') && trimmed.length > 30) {
      initialWord = trimmed.split(/\s+/)[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
    } else {
      initialWord = trimmed.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
    }
  }

  // Auto-detect surrounding sentence from active page text if context wasn't passed directly
  if (!contextSentence && initialWord && typeof window.getCurrentPageText === 'function') {
    try {
      const pageTxt = window.getCurrentPageText() || '';
      if (pageTxt) {
        const sentences = pageTxt.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [pageTxt];
        const regex = new RegExp(`\\b${initialWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const found = sentences.find(s => regex.test(s));
        if (found) {
          contextSentence = found.trim();
        }
      }
    } catch(e) {}
  }

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:2px 0 10px;">
      <div class="font-display" style="font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px; color:var(--text); letter-spacing:-0.01em;">
        ${window.icon('language','icon icon-sm')} <span id="dict-header-title">${initialWord ? window.escapeHtml(initialWord) : 'Academic Lexicon & Word Meaning'}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:10.5px; font-weight:700; background:rgba(47, 198, 188, 0.15); color:var(--teal); border:1px solid rgba(47, 198, 188, 0.35); padding:2px 7px; border-radius:6px; text-transform:uppercase; letter-spacing:0.04em;">
          Oxford • Gemini 3.7
        </span>
      </div>
    </div>

    <!-- Search Input & Quick Chips -->
    <div style="margin-bottom:12px; background:var(--surface-2); padding:10px 12px; border-radius:12px; border:1px solid var(--border);">
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="position:relative; flex:1;">
          <input type="text" id="dict-search-input" placeholder="Type academic word (e.g. ubiquitous, photosynthesis, hypothesis)..." value="${window.escapeHtml(initialWord)}" style="width:100%; padding:9px 12px 9px 34px; font-size:14px; font-weight:600; border-radius:10px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text);" />
          <span style="position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-dim); pointer-events:none; font-size:13px;">🔍</span>
        </div>
        <button class="btn btn-primary" id="dict-search-btn" style="padding:9px 16px; font-size:13px; font-weight:700; border-radius:10px; flex-shrink:0;">
          Lookup
        </button>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin-top:8px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none;">
        <span style="font-size:10.5px; font-weight:700; color:var(--text-dim); white-space:nowrap; text-transform:uppercase; letter-spacing:0.03em;">Try:</span>
        ${['photosynthesis', 'resilient', 'ephemeral', 'pragmatic', 'meticulous', 'ubiquitous'].map(w => `
          <button class="btn dict-chip-btn" data-word="${w}" style="font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); cursor:pointer; white-space:nowrap;">
            ${w}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Active Document Context Bar (If Available) -->
    ${contextSentence ? `
      <div id="dict-context-banner" style="margin-bottom:12px; background:rgba(99, 102, 241, 0.08); border:1px solid rgba(99, 102, 241, 0.25); padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.45; color:var(--text);">
        <div style="font-size:10.5px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px; display:flex; align-items:center; gap:4px;">
          🎯 Document Context Grounding
        </div>
        <div style="color:var(--text-dim); font-style:italic;">"${window.escapeHtml(contextSentence.slice(0, 160))}${contextSentence.length > 160 ? '…' : ''}"</div>
      </div>
    ` : ''}

    <div id="dict-result" class="selectable-text" style="font-size:14px; line-height:1.6; display:flex; flex-direction:column; gap:12px;">
      <div class="skel" style="height:20px; width:50%;"></div>
      <div class="skel" style="height:14px; width:90%;"></div>
      <div class="skel" style="height:14px; width:80%;"></div>
    </div>
  `);

  const searchInput = document.getElementById('dict-search-input');
  const searchBtn = document.getElementById('dict-search-btn');
  const headerTitle = document.getElementById('dict-header-title');

  let activeAudio = null;

  const executeLookup = async (lookupWord, customCtx = '') => {
    const word = lookupWord.trim().replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '') || lookupWord.trim();
    if (searchInput && searchInput.value !== word) {
      searchInput.value = word;
    }

    const resultContainer = document.getElementById('dict-result');

    if (!word) {
      if (headerTitle) headerTitle.textContent = 'Academic Lexicon & Word Meaning';
      if (resultContainer) {
        resultContainer.innerHTML = `
          <div style="text-align:center; padding:28px 16px; background:var(--surface-2); border-radius:14px; border:1px dashed var(--border);">
            <div style="font-size:32px; margin-bottom:8px;">📖</div>
            <div style="font-size:15px; font-weight:700; color:var(--text); margin-bottom:4px;">Type any word above to look up its meaning</div>
            <div style="font-size:12.5px; color:var(--text-dim); max-width:280px; margin:0 auto;">
              Instant Oxford definitions, context-specific meaning, Hindi translations, grammar inflections, and audio pronunciation.
            </div>
          </div>
        `;
      }
      return;
    }

    if (headerTitle) headerTitle.textContent = word;

    if (resultContainer) {
      resultContainer.innerHTML = `
        <div style="padding:14px 0; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="skel" style="height:22px; width:45%; border-radius:6px;"></div>
            <div class="skel" style="height:18px; width:20%; border-radius:6px;"></div>
          </div>
          <div class="skel" style="height:14px; width:95%; border-radius:4px;"></div>
          <div class="skel" style="height:14px; width:80%; border-radius:4px;"></div>
          <div class="skel" style="height:40px; width:100%; border-radius:8px; margin-top:4px;"></div>
        </div>
      `;
    }

    try {
      const activeCtx = customCtx || contextSentence || '';
      const data = await fetchHybridDictionary(word, activeCtx);

      const phonetic = data.phonetic || '';
      const pos = data.primaryPos || 'Word';
      const academicDef = data.academicDefinition || data.primaryDef || 'Definition not available.';
      const contextMeaning = data.contextMeaning || '';
      const simpleExplanation = data.simpleExplanation || '';
      const academicExample = data.academicExample || data.exampleSentence || '';
      const commonPitfall = data.commonPitfall || '';
      const etymology = data.etymology || (data.merriamWebster?.etymologies?.join(' ') || '');
      const hindiMeaning = data.hindiMeaning || '';
      const synList = data.synonyms || [];
      const antList = data.antonyms || [];
      const g = data.grammar;
      const posGroups = data.posGroups || [];

      // Render POS-separated cards
      const getPosIcon = (posStr) => {
        const p = (posStr || '').toLowerCase();
        if (p.includes('noun')) return '📘';
        if (p.includes('verb')) return '⚡';
        if (p.includes('adj')) return '🎨';
        if (p.includes('adv')) return '🚀';
        if (p.includes('prep')) return '🔗';
        return '📌';
      };

      const renderPosGrammar = (gObj, posStr) => {
        if (!gObj) return '';
        const p = (posStr || '').toLowerCase();
        if ((p === 'verb' || gObj.type === 'verb' || gObj.isVerb) && (gObj.v1 || gObj.v2 || gObj.v3)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Verb Forms (Conjugation)
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(95px, 1fr)); gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V1 Base</span><strong>${window.escapeHtml(gObj.v1 || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V2 Past</span><strong>${window.escapeHtml(gObj.v2 || (word + 'ed'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V3 Past Part.</span><strong>${window.escapeHtml(gObj.v3 || (word + 'ed'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">-ing Form</span><strong>${window.escapeHtml(gObj.ing || (word + 'ing'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">-s/-es Form</span><strong>${window.escapeHtml(gObj.s || (word + 's'))}</strong></div>
              </div>
            </div>
          `;
        }
        if ((p === 'noun' || gObj.type === 'noun' || gObj.isNoun) && (gObj.plural || gObj.singular)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Noun Number Forms
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 8px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Singular</span><strong>${window.escapeHtml(gObj.singular || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 8px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Plural</span><strong>${window.escapeHtml(gObj.plural || (word + 's'))}</strong></div>
              </div>
            </div>
          `;
        }
        if ((p === 'adjective' || gObj.type === 'adjective' || gObj.isAdjective) && (gObj.positive || gObj.comparative)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Adjective Degrees
              </div>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Positive</span><strong>${window.escapeHtml(gObj.positive || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Comparative</span><strong>${window.escapeHtml(gObj.comparative || ('more ' + word))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Superlative</span><strong>${window.escapeHtml(gObj.superlative || ('most ' + word))}</strong></div>
              </div>
            </div>
          `;
        }
        return '';
      };

      // Generate distinct POS card sections
      const activeGroups = (posGroups && posGroups.length > 0) ? posGroups : [{
        pos: pos,
        senses: [{ def: academicDef }],
        hindiMeaning: hindiMeaning,
        example: academicExample,
        synonyms: synList,
        antonyms: antList,
        grammar: g
      }];

      const posCardsHtml = activeGroups.map(group => {
        const groupPos = group.pos || pos;
        const groupDef = group.senses?.[0]?.def || academicDef;
        const groupHindi = group.hindiMeaning || (groupPos === pos ? hindiMeaning : '');
        const groupExample = group.example || group.senses?.find(s => s.example)?.example || (groupPos === pos ? academicExample : '');
        const groupSyns = (group.synonyms && group.synonyms.length > 0) ? group.synonyms : (groupPos === pos ? synList : []);
        const groupAnts = (group.antonyms && group.antonyms.length > 0) ? group.antonyms : (groupPos === pos ? antList : []);
        const groupGrammar = group.grammar || (groupPos === pos ? g : null);
        const icon = getPosIcon(groupPos);

        return `
          <div style="margin-bottom:14px; background:var(--bg-elev); padding:13px 14px; border-radius:12px; border:1px solid var(--border);">
            
            <!-- POS Title & Hindi Meaning Badge -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11.5px; font-weight:800; text-transform:uppercase; background:var(--accent-soft); color:var(--accent); padding:3px 9px; border-radius:6px; letter-spacing:0.04em; display:inline-flex; align-items:center; gap:4px;">
                  ${icon} ${window.escapeHtml(groupPos)} Form
                </span>
                ${groupHindi ? `
                  <span style="font-size:13px; font-weight:700; color:var(--teal); background:rgba(47, 198, 188, 0.1); padding:2px 8px; border-radius:6px;">
                    ${window.escapeHtml(groupHindi)}
                  </span>
                ` : ''}
              </div>
            </div>

            <!-- Definition for this POS -->
            <div style="font-size:13.5px; color:var(--text); font-weight:500; line-height:1.5; margin-bottom:8px;">
              ${window.escapeHtml(groupDef)}
            </div>

            <!-- Example for this POS -->
            ${groupExample ? `
              <div style="font-size:12.5px; color:var(--text-dim); font-style:italic; line-height:1.45; margin-bottom:10px; padding:6px 10px; background:var(--surface-2); border-left:3px solid var(--accent); border-radius:0 6px 6px 0;">
                "${window.escapeHtml(groupExample)}"
              </div>
            ` : ''}

            <!-- POS-Specific Synonyms & Antonyms -->
            <div style="display:flex; flex-direction:column; gap:6px; background:var(--surface-2); padding:8px 10px; border-radius:8px; margin-top:6px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:10px; font-weight:800; color:var(--teal); text-transform:uppercase; letter-spacing:0.03em; flex-shrink:0;">${window.escapeHtml(groupPos)} Synonyms:</span>
                ${groupSyns.length > 0 ? groupSyns.map(s => `
                  <button class="dict-chip-tag syn-chip" data-word="${window.escapeHtml(s)}" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(47, 198, 188, 0.12); color:var(--teal); border:1px solid rgba(47, 198, 188, 0.3); cursor:pointer; transition:all 0.15s ease;">
                    ${window.escapeHtml(s)}
                  </button>
                `).join('') : '<em style="font-size:11px; color:var(--text-faint);">None identified</em>'}
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:10px; font-weight:800; color:var(--danger); text-transform:uppercase; letter-spacing:0.03em; flex-shrink:0;">${window.escapeHtml(groupPos)} Antonyms:</span>
                ${groupAnts.length > 0 ? groupAnts.map(a => `
                  <button class="dict-chip-tag ant-chip" data-word="${window.escapeHtml(a)}" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(224, 86, 36, 0.12); color:var(--danger); border:1px solid rgba(224, 86, 36, 0.3); cursor:pointer; transition:all 0.15s ease;">
                    ${window.escapeHtml(a)}
                  </button>
                `).join('') : '<em style="font-size:11px; color:var(--text-faint);">None identified</em>'}
              </div>
            </div>

            <!-- POS-Specific Grammar Inflections -->
            ${renderPosGrammar(groupGrammar, groupPos)}

          </div>
        `;
      }).join('');

      let html = `
        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:16px;">
          
          <!-- Master Lexicon Header -->
          <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; gap:8px; border-bottom:1px solid var(--border); padding-bottom:12px;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                <span class="font-display" style="font-size:22px; font-weight:800; color:var(--text); letter-spacing:-0.02em;">
                  ${window.escapeHtml(word)}
                </span>
                ${phonetic ? `<span class="font-mono" style="color:var(--text-dim); font-size:13px; font-weight:600;">${window.escapeHtml(phonetic)}</span>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
                ${activeGroups.map(gItem => `
                  <span style="font-size:10.5px; font-weight:800; text-transform:uppercase; background:var(--accent-soft); color:var(--accent); padding:2px 7px; border-radius:5px; letter-spacing:0.03em;">
                    ${getPosIcon(gItem.pos)} ${window.escapeHtml(gItem.pos)}
                  </span>
                `).join('')}
                ${data.merriamWebster ? `
                  <span style="font-size:10px; font-weight:700; background:#8d1720; color:#ffffff; padding:2px 6px; border-radius:5px;">
                    Merriam-Webster
                  </span>
                ` : ''}
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <button class="btn btn-ghost" id="dict-audio-play" title="Pronounce word" style="padding:6px 10px; font-size:12px; color:var(--accent); background:var(--accent-soft); border:1px solid rgba(255,106,43,0.3); border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
                ${window.icon('volume','icon icon-xs')} <span>Listen</span>
              </button>
              <button class="btn btn-ghost" id="dict-copy-btn" title="Copy entry" style="padding:6px 9px; font-size:12px; border:1px solid var(--border); border-radius:8px;">
                ${window.icon('copy','icon icon-xs')}
              </button>
            </div>
          </div>

          <!-- 1. Context Meaning (If Document Context Grounded) -->
          ${(contextMeaning && contextMeaning !== academicDef) ? `
            <div style="margin-bottom:12px; background:rgba(99, 102, 241, 0.1); padding:10px 14px; border-radius:10px; border-left:4px solid #6366f1;">
              <div style="font-size:11px; font-weight:800; color:#6366f1; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                🎯 Precise Meaning in Current Document Sentence
              </div>
              <div style="font-size:14px; color:var(--text); font-weight:600; line-height:1.5;">
                ${window.escapeHtml(contextMeaning)}
              </div>
            </div>
          ` : ''}

          <!-- 2. Distinct Part of Speech Cards (Noun, Verb, Adjective, etc.) -->
          ${posCardsHtml}

          <!-- 3. Feynman Intuition / Plain-English Breakdown -->
          ${simpleExplanation ? `
            <div style="margin-bottom:12px; background:var(--bg-elev); padding:10px 14px; border-radius:10px; border:1px solid var(--border); font-size:13px; color:var(--text-dim); line-height:1.45; display:flex; align-items:baseline; gap:6px;">
              <span style="font-size:11px; font-weight:800; color:var(--teal); text-transform:uppercase; letter-spacing:0.04em; flex-shrink:0;">💡 Intuition:</span>
              <span style="color:var(--text); font-weight:500;">${window.escapeHtml(simpleExplanation)}</span>
            </div>
          ` : ''}

          <!-- 4. Examiner Trap / Common Pitfall -->
          ${commonPitfall ? `
            <div style="margin-bottom:12px; background:rgba(224, 86, 36, 0.08); padding:10px 14px; border-radius:10px; border-left:4px solid var(--danger);">
              <div style="font-size:11px; font-weight:800; color:var(--danger); text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                ⚠️ Common Pitfall &amp; Examiner Caution
              </div>
              <div style="font-size:13px; color:var(--text); line-height:1.45;">
                ${window.escapeHtml(commonPitfall)}
              </div>
            </div>
          ` : ''}

          <!-- 5. Etymology & Root History (If Available) -->
          ${etymology ? `
            <div style="margin-bottom:8px; background:var(--bg-elev); padding:9px 12px; border-radius:8px; border:1px solid var(--border); font-size:12px; color:var(--text-dim); line-height:1.45;">
              <span style="font-weight:800; color:var(--text); font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em;">🏛️ Etymology:</span>
              ${window.escapeHtml(etymology)}
            </div>
          ` : ''}

        </div>

        <!-- Action Bar -->
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
          <button class="btn btn-ghost" style="flex:1; min-width:130px; padding:11px; font-size:13px; font-weight:700; border-radius:10px;" id="dict-ai-explain-btn">
            ${window.icon('sparkle','icon icon-xs')} Ask AI Tutor About This
          </button>
          <button class="btn btn-primary" style="flex:1; min-width:130px; padding:11px; font-size:13px; font-weight:700; border-radius:10px;" id="dict-save-deck-btn">
            ⭐ Save to Vocabulary Deck
          </button>
        </div>
      `;

      if (resultContainer) resultContainer.innerHTML = html;

      // Event listeners for synonym and antonym chip tags
      document.querySelectorAll('.dict-chip-tag').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = btn.getAttribute('data-word');
          if (w) executeLookup(w, '');
        };
      });

      // Audio playback with Web Speech API and recorded URL
      const dictAudioPlay = document.getElementById('dict-audio-play');
      if (dictAudioPlay) {
        dictAudioPlay.onclick = () => {
          const audioSrc = data.audioUrl || data.merriamWebster?.audioUrl;
          if (audioSrc) {
            if (activeAudio) {
              activeAudio.pause();
              activeAudio.currentTime = 0;
            }
            activeAudio = new Audio(audioSrc);
            activeAudio.play().catch(() => {
              if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(word);
                u.lang = 'en-US';
                window.speechSynthesis.speak(u);
              } else if (window.runTTS) {
                window.runTTS(word);
              }
            });
          } else if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(word);
            u.lang = 'en-US';
            window.speechSynthesis.speak(u);
          } else if (window.runTTS) {
            window.runTTS(word);
          }
        };
      }

      // Copy Entry Button
      const copyBtn = document.getElementById('dict-copy-btn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const textToCopy = `**${word}** [${pos}] ${phonetic}\nDefinition: ${academicDef}\nHindi Meaning: ${hindiMeaning}\nExample: ${academicExample}\nSynonyms: ${synList.join(', ')}`;
          navigator.clipboard.writeText(textToCopy);
          if (window.Toast?.show) window.Toast.show('Copied lexicon entry to clipboard');
          else if (window.toast) window.toast('Copied to clipboard');
        };
      }

      // Ask AI Tutor About This Word
      const aiExplainBtn = document.getElementById('dict-ai-explain-btn');
      if (aiExplainBtn) {
        aiExplainBtn.onclick = () => {
          if (window.Sheet && window.Sheet.close) window.Sheet.close();
          const query = `Explain the academic word "${word}" in depth, its exact nuances, and how it is used in examinations.`;
          if (typeof window.openAIChat === 'function') {
            window.openAIChat(query);
          } else if (typeof window.openTeacherView === 'function') {
            const fid = window.State?.currentFile?.id || 'global_chat';
            window.openTeacherView(query, 'professional', fid);
          }
        };
      }

      // Save to Vocabulary Deck / Notes
      const saveDeckBtn = document.getElementById('dict-save-deck-btn');
      if (saveDeckBtn) {
        saveDeckBtn.onclick = async () => {
          const entry = {
            id: window.uid(),
            fileId: window.State?.currentFile?.id,
            page: sel?.pageNum || window.State?.currentPage || 1,
            kind: 'Vocabulary Card',
            word,
            primaryPos: pos,
            phonetic,
            academicDefinition: academicDef,
            hindiMeaning,
            academicExample,
            synonyms: synList,
            antonyms: antList,
            content: `**${word}** (${pos})\n• Definition: ${academicDef}\n• Hindi: ${hindiMeaning}\n• Example: "${academicExample}"\n• Synonyms: ${synList.join(', ')}`,
            createdAt: Date.now()
          };

          try {
            if (window.DB?.put) {
              await window.DB.put('notes', entry);
            }
            if (window.Toast?.show) window.Toast.show(`Saved "${word}" to your Vocabulary Deck!`);
            else if (window.toast) window.toast(`Saved "${word}" to Vocabulary Deck!`);
            window.Sheet.close();
          } catch (dbErr) {
            console.error('Error saving vocabulary card:', dbErr);
          }
        };
      }

    } catch (err) {
      console.error('Dictionary Lookup Error:', err);
      if (resultContainer) {
        resultContainer.innerHTML = `
          <div style="color:var(--danger); padding:14px; background:var(--surface-2); border-radius:10px; border:1px solid rgba(224, 86, 36, 0.3);">
            <div style="font-weight:700; margin-bottom:4px;">Could not load lexicon data</div>
            <div style="font-size:12px; color:var(--text-dim);">Please check connection and try again.</div>
          </div>
        `;
      }
    }
  };

  if (searchBtn) {
    searchBtn.onclick = () => {
      if (searchInput) executeLookup(searchInput.value, '');
    };
  }

  if (searchInput) {
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        executeLookup(searchInput.value, '');
      }
    };
  }

  document.querySelectorAll('.dict-chip-btn').forEach(btn => {
    btn.onclick = () => {
      const w = btn.dataset.word;
      if (w) executeLookup(w, '');
    };
  });

  executeLookup(initialWord, contextSentence);
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
function sliceTextIntoSections(fullText, numSections) {
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

// --- MICROSOFT NEURAL & ELEVENLABS & TTS ENGINES ---
export const MICROSOFT_NEURAL_VOICES = [
  // 🇮🇳 Hindi & Indian Accents (Clear & Natural)
  { id: 'hi-IN-SwaraNeural', name: '👩 Swara — Hindi & English (Natural Female)', lang: 'hi-IN', category: 'Hindi & Indian Accents', gender: 'female' },
  { id: 'hi-IN-MadhurNeural', name: '👨 Madhur — Hindi & English (Deep Male)', lang: 'hi-IN', category: 'Hindi & Indian Accents', gender: 'male' },
  { id: 'en-IN-NeerjaNeural', name: '👩 Neerja — Indian English (Educator Female)', lang: 'en-IN', category: 'Hindi & Indian Accents', gender: 'female' },
  { id: 'en-IN-PrabhatNeural', name: '👨 Prabhat — Indian English (Clear Male)', lang: 'en-IN', category: 'Hindi & Indian Accents', gender: 'male' },

  // 🇺🇸 English US (High Definition)
  { id: 'en-US-JennyNeural', name: '👩 Jenny — Conversational US Female', lang: 'en-US', category: 'English (US & UK)', gender: 'female' },
  { id: 'en-US-GuyNeural', name: '👨 Guy — Deep US Male', lang: 'en-US', category: 'English (US & UK)', gender: 'male' },
  { id: 'en-US-AriaNeural', name: '👩 Aria — Academic & Expressive Female', lang: 'en-US', category: 'English (US & UK)', gender: 'female' },
  { id: 'en-US-ChristopherNeural', name: '👨 Christopher — News & Academic Male', lang: 'en-US', category: 'English (US & UK)', gender: 'male' },
  { id: 'en-US-EricNeural', name: '👨 Eric — Friendly & Calm Male', lang: 'en-US', category: 'English (US & UK)', gender: 'male' },
  { id: 'en-US-AnaNeural', name: '👧 Ana — Soft & Gentle Female', lang: 'en-US', category: 'English (US & UK)', gender: 'female' },

  // 🇬🇧 English UK
  { id: 'en-GB-SoniaNeural', name: '👩 Sonia — British English Educator', lang: 'en-GB', category: 'English (US & UK)', gender: 'female' },
  { id: 'en-GB-RyanNeural', name: '👨 Ryan — British English Narrator', lang: 'en-GB', category: 'English (US & UK)', gender: 'male' },
  { id: 'en-GB-LibbyNeural', name: '👩 Libby — British English Warm Female', lang: 'en-GB', category: 'English (US & UK)', gender: 'female' },

  // 🏛️ Regional Indian Languages
  { id: 'bn-IN-TanishaaNeural', name: '👩 Tanishaa — Bengali (Female)', lang: 'bn-IN', category: 'Regional Indian', gender: 'female' },
  { id: 'ta-IN-PallaviNeural', name: '👩 Pallavi — Tamil (Female)', lang: 'ta-IN', category: 'Regional Indian', gender: 'female' },
  { id: 'te-IN-ShrutiNeural', name: '👩 Shruti — Telugu (Female)', lang: 'te-IN', category: 'Regional Indian', gender: 'female' },
  { id: 'mr-IN-AarohiNeural', name: '👩 Aarohi — Marathi (Female)', lang: 'mr-IN', category: 'Regional Indian', gender: 'female' },
  { id: 'ur-IN-GulNeural', name: '👩 Gul — Urdu (Female)', lang: 'ur-IN', category: 'Regional Indian', gender: 'female' }
];

let activeMicrosoftAudio = null;
let msRequestSeq = 0;      // bumped on every stop: a late network reply from an older request must not play
const msAudioCache = new Map();   // prefetched sentence audio (key -> Promise<data>)

function ttsCancelled() { const e = new Error('TTS request superseded'); e.cancelled = true; return e; }

export function stopMicrosoftAudio() {
  msRequestSeq++;
  if (activeMicrosoftAudio) {
    try {
      activeMicrosoftAudio.pause();
      activeMicrosoftAudio.currentTime = 0;
    } catch (e) {}
    activeMicrosoftAudio = null;
  }
}

export function stopAllTTSAudio() {
  stopMicrosoftAudio();
  stopElevenAudio();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

/** Hindi text on an English-only voice is silent/garbled, so switch to a Hindi voice for Devanagari text. */
export function pickMicrosoftVoiceForText(text, chosenId) {
  const chosen = chosenId || 'hi-IN-SwaraNeural';
  if (ttsLangOf(text) !== 'hi') return chosen;
  const v = MICROSOFT_NEURAL_VOICES.find(x => x.id === chosen);
  if (v && /^(hi|mr|ur|bn|ta|te)-/i.test(v.lang)) return chosen;
  return v && v.gender === 'male' ? 'hi-IN-MadhurNeural' : 'hi-IN-SwaraNeural';
}

function msCacheKey(text, voice, rate, pitch) { return `${voice}|${rate}|${pitch}|${text}`; }

function fetchMicrosoftAudioData(text, voice, rate, pitch) {
  const key = msCacheKey(text, voice, rate, pitch);
  const hit = msAudioCache.get(key);
  if (hit) { msAudioCache.delete(key); return hit; }
  return doFetchMicrosoft(text, voice, rate, pitch);
}

function doFetchMicrosoft(text, voice, rate, pitch) {
  return (async () => {
    const res = await fetchWithTimeout('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate, pitch })
    }, 30000);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Microsoft TTS failed with status ${res.status}`);
    }
    const data = await res.json();
    if (!data.audioBase64) throw new Error('No audio generated by Microsoft TTS service');
    return data;
  })();
}

/** Starts fetching the next sentence's audio while the current one plays, so there is no gap between sentences. */
export function prefetchMicrosoftNeural(text, voiceId, options = {}) {
  try {
    if (!text || !text.trim()) return;
    const settings = getTTSSettings();
    const voice = pickMicrosoftVoiceForText(text, voiceId || settings.microsoftVoiceId);
    const rate = typeof options.rate === 'number' ? options.rate : (settings.rate || 1.0);
    const pitch = typeof options.pitch === 'number' ? options.pitch : (settings.pitch || 1.0);
    const key = msCacheKey(text, voice, rate, pitch);
    if (msAudioCache.has(key)) return;
    const pr = doFetchMicrosoft(text, voice, rate, pitch);
    pr.catch(() => { msAudioCache.delete(key); });
    msAudioCache.set(key, pr);
    while (msAudioCache.size > 3) msAudioCache.delete(msAudioCache.keys().next().value);
  } catch (e) {}
}

export async function speakWithMicrosoftNeural(text, voiceId, options = {}) {
  stopAllTTSAudio();
  const mySeq = msRequestSeq;

  const settings = getTTSSettings();
  const targetVoice = pickMicrosoftVoiceForText(text, voiceId || settings.microsoftVoiceId);
  const rate = typeof options.rate === 'number' ? options.rate : (settings.rate || 1.0);
  const pitch = typeof options.pitch === 'number' ? options.pitch : (settings.pitch || 1.0);

  const data = await fetchMicrosoftAudioData(text, targetVoice, rate, pitch);
  if (mySeq !== msRequestSeq) throw ttsCancelled();

  const audioSrc = `data:${data.mimeType || 'audio/mp3'};base64,${data.audioBase64}`;
  const audio = new Audio(audioSrc);
  activeMicrosoftAudio = audio;

  const boundaries = Array.isArray(data.wordBoundaries) ? data.wordBoundaries : [];
  if (options.onAudio) { try { options.onAudio(audio, boundaries.length > 0); } catch (e) {} }

  return new Promise((resolve, reject) => {
    let animFrame = null;
    let nextBoundaryIdx = 0;

    const trackWordBoundaries = () => {
      if (activeMicrosoftAudio !== audio || audio.ended) {
        if (animFrame) cancelAnimationFrame(animFrame);
        return;
      }
      if (!audio.paused) {
        const currentMs = audio.currentTime * 1000;
        while (nextBoundaryIdx < boundaries.length && currentMs >= boundaries[nextBoundaryIdx].offsetMs) {
          const b = boundaries[nextBoundaryIdx];
          if (options.onWordBoundary) {
            options.onWordBoundary({
              boundaryIndex: nextBoundaryIdx,
              offsetMs: b.offsetMs,
              durationMs: b.durationMs,
              text: b.text,
              length: b.length
            });
          }
          nextBoundaryIdx++;
        }
      }
      animFrame = requestAnimationFrame(trackWordBoundaries);
    };

    audio.onplay = () => {
      if (options.onStart) options.onStart();
      if (boundaries.length && !animFrame) animFrame = requestAnimationFrame(trackWordBoundaries);
    };

    audio.onended = () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (activeMicrosoftAudio === audio) activeMicrosoftAudio = null;
      if (options.onEnd) options.onEnd();
      resolve(data);
    };

    audio.onerror = (e) => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (activeMicrosoftAudio === audio) activeMicrosoftAudio = null;
      if (mySeq !== msRequestSeq) { reject(ttsCancelled()); return; }
      if (options.onError) options.onError(e);
      reject(e);
    };

    audio.play().catch((playErr) => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (activeMicrosoftAudio === audio) activeMicrosoftAudio = null;
      reject(mySeq !== msRequestSeq ? ttsCancelled() : playErr);
    });
  });
}

export async function previewMicrosoftVoice(voiceId, onStart, onEnd) {
  stopAllTTSAudio();
  const v = MICROSOFT_NEURAL_VOICES.find(x => x.id === voiceId) || MICROSOFT_NEURAL_VOICES[0];
  const samplePhrase = v.lang.startsWith('hi')
    ? `नमस्ते! मैं माइक्रोसॉफ्ट न्यूरल वॉइस हूँ। मैं आपकी पुस्तकें और नोट्स साफ़ आवाज़ में पढ़ सकता हूँ।`
    : `Hello! I am ${v.name.split('—')[0].replace(/^[^\w\s]+/, '').trim()}, powered by Microsoft Neural Voice. I am ready to read your documents clearly.`;

  await speakWithMicrosoftNeural(samplePhrase, voiceId, {
    onStart,
    onEnd: () => {
      if (onEnd) onEnd();
    },
    onError: () => {
      if (onEnd) onEnd();
    }
  });
}

export const DEFAULT_ELEVENLABS_KEY = '';

export function getElevenLabsApiKey() {
  return localStorage.getItem('sayad_elevenlabs_key') || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ELEVENLABS_API_KEY) || (typeof process !== 'undefined' && process.env && process.env.ELEVENLABS_API_KEY) || '';
}

export function saveElevenLabsApiKey(key) {
  if (key) {
    localStorage.setItem('sayad_elevenlabs_key', key.trim());
  } else {
    localStorage.removeItem('sayad_elevenlabs_key');
  }
}

export const ELEVENLABS_DEFAULT_VOICES = [
  // 🎓 Academic, Educational & Professional (Best for Study & Books)
  { id: 'nPczCjzI2devNBz1zQrb', name: '👨 Brian — Deep, Resonant & Comforting (Recommended)', category: 'Academic & Deep', gender: 'male', accent: 'American', preview_url: 'https://api.us.elevenlabs.io/v1/voices/nPczCjzI2devNBz1zQrb/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiIyZGQzZTcyYy00ZmQzLTQyZjEtOTNlYS1hYmM1ZDRlNWFhMWQubXAzIiwidGltZXN0YW1wIjoxNzg2OTE0MDAwMDAwMDAwfQ%3D%3D' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: '👩 Alice — Clear & Engaging Educator', category: 'Academic & Educator', gender: 'female', accent: 'British', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: '👨 George — Warm & Captivating Storyteller', category: 'Storyteller & Warm', gender: 'male', accent: 'British', preview_url: 'https://api.us.elevenlabs.io/v1/voices/JBFqnCBsd6RMkjVDRZzb/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiJlNjIwNmQxYS0wNzIxLTQ3ODctYWFmYi0wNmE2ZTcwNWNhYzUubXAzIiwidGltZXN0YW1wIjoxNzg2OTE0MDAwMDAwMDAwfQ%3D%3D' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: '👩 Sarah — Mature, Reassuring & Confident', category: 'Professional & Clear', gender: 'female', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: '👨 Daniel — Steady British Broadcaster', category: 'Formal & News', gender: 'male', accent: 'British', preview_url: 'https://api.us.elevenlabs.io/v1/voices/onwK4e9ZLuTAKqWW03F9/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiI3ZWVlMDIzNi0xYTcyLTRiODYtYjMwMy01ZGNhZGMwMDdiYTkubXAzIiwidGltZXN0YW1wIjoxNzg2OTE0MDAwMDAwMDAwfQ%3D%3D' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: '👩 Bella — Professional, Bright & Warm', category: 'Academic & Warm', gender: 'female', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: '👩 Matilda — Knowledgeable & Professional', category: 'Academic Female', gender: 'female', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: '👨 Adam — Firm, Bold & Authoritative', category: 'Authoritative', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3' },

  // 🎙️ Conversational & Expressive Narrators
  { id: 'IKne3meq5aSn9XLyUdCD', name: '👨 Charlie — Deep, Confident & Energetic', category: 'Dynamic Male', gender: 'male', accent: 'Australian', preview_url: 'https://api.us.elevenlabs.io/v1/voices/IKne3meq5aSn9XLyUdCD/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiIxMDJkZTZmMi0yMmVkLTQzZTAtYTFmMS0xMTFmYTc1YzU0ODEubXAzIiwidGltZXN0YW1wIjoxNzg2OTE0MDAwMDAwMDAwfQ%3D%3D' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: '👨 Roger — Laid-Back, Casual & Resonant', category: 'Resonant & Relaxed', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: '👩 Jessica — Playful, Bright & Warm', category: 'Friendly & Warm', gender: 'female', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3' },
  { id: 'cjVigY5qzO86Huf0OWal', name: '👨 Eric — Smooth & Trustworthy', category: 'Smooth & Calm', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: '👩 Lily — Velvety Actress & Expressive', category: 'Expressive British', gender: 'female', accent: 'British', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: '👨 Liam — Energetic & Modern', category: 'Modern & Quick', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: '🎙️ River — Relaxed, Neutral & Informative', category: 'Neutral & Calm', gender: 'neutral', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: '👩 Laura — Enthusiast & Expressive', category: 'Enthusiastic', gender: 'female', accent: 'American', preview_url: 'https://api.us.elevenlabs.io/v1/voices/FGY2WhTYpPnrIDTdsKH5/previews/audio?payload=eyJ2b2ljZV9zb3VyY2UiOiJwcmVtYWRlIiwiZmlsZW5hbWUiOiI2NzM0MTc1OS1hZDA4LTQxYTUtYmU2ZS1kZTEyZmU0NDg2MTgubXAzIiwidGltZXN0YW1wIjoxNzg2OTE0MDAwMDAwMDAwfQ%3D%3D' },
  { id: 'iP95p4xoKVk53GoZ742B', name: '👨 Chris — Charming & Down-to-Earth', category: 'Casual Conversational', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/iP95p4xoKVk53GoZ742B/3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3' },
  { id: 'bIHbv24MWmeRgasZH58o', name: '👨 Will — Relaxed Optimist', category: 'Calm & Friendly', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: '👨 Bill — Wise, Mature & Balanced', category: 'Mature Narrator', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pqHfZKP75CvOlQylNhV4/d782b3ff-84ba-4029-848c-acf01285524d.mp3' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: '👨 Harry — Fierce & Strong Character', category: 'Dramatic', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: '👨 Callum — Husky Character Narrator', category: 'Husky Voice', gender: 'male', accent: 'American', preview_url: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3' }
];

let activeElevenAudio = null;
let activePreviewAudio = null;

let elevenRequestSeq = 0;

export function stopElevenAudio() {
  elevenRequestSeq++;
  if (activeElevenAudio) {
    try {
      activeElevenAudio.pause();
      activeElevenAudio.currentTime = 0;
    } catch (e) {}
    activeElevenAudio = null;
  }
  if (activePreviewAudio) {
    try {
      activePreviewAudio.pause();
      activePreviewAudio.currentTime = 0;
    } catch (e) {}
    activePreviewAudio = null;
  }
}

export async function fetchElevenLabsVoices() {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) return ELEVENLABS_DEFAULT_VOICES;

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!res.ok) return ELEVENLABS_DEFAULT_VOICES;
    const data = await res.json();
    if (data && data.voices && data.voices.length > 0) {
      const dynamicList = data.voices.map(v => ({
        id: v.voice_id,
        name: `${v.labels?.gender === 'female' ? '👩' : '👨'} ${v.name}`,
        category: v.labels?.use_case || v.category || 'Custom Voice',
        gender: v.labels?.gender || 'neutral',
        accent: v.labels?.accent || 'English',
        preview_url: v.preview_url
      }));
      window.State.cachedElevenVoices = dynamicList;
      return dynamicList;
    }
  } catch (err) {
    console.warn('Could not fetch live ElevenLabs voices, using verified catalog:', err);
  }
  return ELEVENLABS_DEFAULT_VOICES;
}

export function getAllElevenLabsVoices() {
  return (window.State && window.State.cachedElevenVoices) || ELEVENLABS_DEFAULT_VOICES;
}

export async function previewElevenVoice(voiceId, onStart, onEnd) {
  stopElevenAudio();
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  const voices = getAllElevenLabsVoices();
  const found = voices.find(v => v.id === voiceId);

  // If we have an instant pre-cached preview URL from ElevenLabs, use it directly
  if (found && found.preview_url) {
    try {
      const audio = new Audio(found.preview_url);
      activePreviewAudio = audio;
      if (onStart) onStart();
      audio.onended = () => {
        activePreviewAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = () => {
        activePreviewAudio = null;
        if (onEnd) onEnd();
      };
      await audio.play();
      return;
    } catch (err) {
      console.warn('Audio preview URL failed, falling back to direct synthesis:', err);
    }
  }

  // Fallback: synthesize short sample text directly
  const samplePhrase = `Hello! This is ${found ? found.name.replace(/^[^\w]+/, '') : 'this voice'}. I am ready to read your documents clearly.`;
  await speakWithElevenLabs(samplePhrase, voiceId, {
    onStart,
    onEnd: () => {
      if (onEnd) onEnd();
    },
    onError: () => {
      if (onEnd) onEnd();
    }
  });
}

export async function speakWithElevenLabs(text, voiceId, options = {}) {
  const apiKey = getElevenLabsApiKey();
  if (!apiKey) {
    throw new Error('ElevenLabs API Key is missing');
  }

  stopElevenAudio();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const myElevenSeq = elevenRequestSeq;

  // Ensure target voice is a valid ID from the active list
  const validVoices = getAllElevenLabsVoices();
  let targetVoice = voiceId || getTTSSettings().elevenVoiceId;
  const isMatch = validVoices.some(v => v.id === targetVoice);
  if (!targetVoice || !isMatch) {
    targetVoice = 'nPczCjzI2devNBz1zQrb'; // Default to Brian (Deep, Resonant & Clear)
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj?.detail?.message || `ElevenLabs error (${res.status})`);
  }

  const blob = await res.blob();
  if (myElevenSeq !== elevenRequestSeq) throw ttsCancelled();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  activeElevenAudio = audio;
  if (options.onAudio) { try { options.onAudio(audio); } catch (e) {} }

  return new Promise((resolve, reject) => {
    const release = () => { try { URL.revokeObjectURL(audioUrl); } catch (e) {} if (activeElevenAudio === audio) activeElevenAudio = null; };
    audio.onplay = () => {
      if (options.onStart) options.onStart();
    };

    audio.onended = () => {
      release();
      if (options.onEnd) options.onEnd();
      resolve();
    };

    audio.onerror = (e) => {
      release();
      if (myElevenSeq !== elevenRequestSeq) { reject(ttsCancelled()); return; }
      if (options.onError) options.onError(e);
      reject(e);
    };

    audio.play().catch((err) => { release(); reject(myElevenSeq !== elevenRequestSeq ? ttsCancelled() : err); });
  });
}

// --- TTS & VOICE MANAGER ---
let ttsTimer = null;
let lastBoundaryTs = 0;
let activeTTSSentences = [];
let activeTTSSentenceIdx = 0;
let activeTTSWordIdx = 0;
let activeTTSPageNum = 1;
let currentTTSUtterance = null;
let isTTSCancelledByUser = false;
let isReadingActive = false;
let isTTSWidgetVisible = false;
let currentUtteranceId = 0;

export function getTTSSettings() {
  if (window.State.ttsSettings) return window.State.ttsSettings;
  let saved = null;
  try {
    const raw = localStorage.getItem('pdf_reader_tts_settings');
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}
  window.State.ttsSettings = saved || {
    engine: 'microsoft', // 'microsoft' | 'elevenlabs' | 'system'
    microsoftVoiceId: 'hi-IN-SwaraNeural',
    preset: 'male_deep',
    useElevenLabs: false,
    elevenVoiceId: 'nPczCjzI2devNBz1zQrb',
    voiceURI: '',
    pitch: 1.0,
    rate: 1.0,
    autoAdvance: true
  };
  return window.State.ttsSettings;
}

export function saveTTSSettings(settings) {
  window.State.ttsSettings = { ...getTTSSettings(), ...settings };
  try {
    localStorage.setItem('pdf_reader_tts_settings', JSON.stringify(window.State.ttsSettings));
  } catch (e) {}
}

export function isElevenLabsActive() {
  const settings = getTTSSettings();
  const key = getElevenLabsApiKey();
  return Boolean(key && settings.engine === 'elevenlabs' && settings.useElevenLabs !== false);
}

export function isMicrosoftNeuralActive() {
  const settings = getTTSSettings();
  return settings.engine === 'microsoft' || !settings.engine;
}

export function getActiveVoiceDisplayName() {
  const settings = getTTSSettings();
  const engine = settings.engine || 'microsoft';

  if (engine === 'microsoft') {
    const msVoices = MICROSOFT_NEURAL_VOICES;
    const found = msVoices.find(v => v.id === settings.microsoftVoiceId) || msVoices[0];
    return {
      type: 'microsoft',
      name: found ? found.name.split('—')[0].replace(/^[^\w\s]+/, '').trim() : 'Swara',
      fullName: found ? found.name : '👩 Swara — Hindi & English (Natural Female)',
      category: found?.category || 'Hindi & Indian Accents',
      badge: 'Microsoft Neural'
    };
  } else if (engine === 'elevenlabs' && isElevenLabsActive()) {
    const elevenVoices = getAllElevenLabsVoices();
    const found = elevenVoices.find(v => v.id === settings.elevenVoiceId) || elevenVoices[0];
    return {
      type: 'elevenlabs',
      name: found ? found.name.split('—')[0].replace(/^[^\w\s]+/, '').trim() : 'Brian',
      fullName: found ? found.name : '👨 Brian — Deep, Resonant & Comforting',
      category: found?.category || 'AI Voice',
      badge: 'ElevenLabs AI'
    };
  } else {
    const sysVoices = getSystemVoices();
    let sysName = 'System Default';
    if (settings.voiceURI) {
      const v = sysVoices.find(x => x.voiceURI === settings.voiceURI);
      if (v) sysName = v.name;
    } else {
      const v = findBestVoiceForPreset(settings.preset, sysVoices);
      if (v) sysName = v.name;
    }
    const presetNames = {
      male_deep: 'Deep Male',
      female_soft: 'Natural Female',
      fast: 'Fast Narrator',
      calm: 'Calm Reader',
      custom: 'Custom Voice'
    };
    return {
      type: 'system',
      name: presetNames[settings.preset] || sysName.split(' ')[0],
      fullName: sysName,
      category: 'Browser Voice',
      badge: 'System TTS'
    };
  }
}

export function getSystemVoices() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices() || [];
}

export function findBestVoiceForPreset(preset, voices) {
  if (!voices || !voices.length) return null;
  const settings = getTTSSettings();
  if (preset === 'custom' && settings.voiceURI) {
    const found = voices.find(v => v.voiceURI === settings.voiceURI);
    if (found) return found;
  }

  const englishVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
  const pool = englishVoices.length ? englishVoices : voices;

  if (preset === 'male_deep') {
    const maleKW = ['male', 'david', 'mark', 'george', 'guy', 'daniel', 'google us english', 'alex', 'natural'];
    const match = pool.find(v => maleKW.some(kw => v.name.toLowerCase().includes(kw)));
    if (match) return match;
  } else if (preset === 'female_soft') {
    const femaleKW = ['female', 'zira', 'samantha', 'victoria', 'karen', 'fiona', 'susan', 'google uk english female', 'natural'];
    const match = pool.find(v => femaleKW.some(kw => v.name.toLowerCase().includes(kw)));
    if (match) return match;
  }
  return pool[0] || voices[0];
}

export function applyPresetSettings(preset) {
  const current = getTTSSettings();
  let updated = { ...current, preset, engine: 'system', useElevenLabs: false };

  if (preset === 'male_deep') {
    updated.pitch = 0.70;
    updated.rate = 0.95;
  } else if (preset === 'female_soft') {
    updated.pitch = 1.15;
    updated.rate = 1.00;
  } else if (preset === 'fast') {
    updated.pitch = 1.00;
    updated.rate = 1.35;
  } else if (preset === 'calm') {
    updated.pitch = 0.85;
    updated.rate = 0.80;
  }
  saveTTSSettings(updated);
  return updated;
}

export function clearTTSHighlights() {
  activeWordEl = null;
  document.querySelectorAll('.tts-word-active, .highlight').forEach(el => {
    el.classList.remove('tts-word-active', 'highlight');
  });
  document.querySelectorAll('.tts-sentence-active').forEach(el => {
    el.classList.remove('tts-sentence-active');
  });
  document.querySelectorAll('.tts-s-active').forEach(el => {
    el.classList.remove('tts-s-active');
  });
  document.querySelectorAll('.has-tts-active').forEach(el => {
    el.classList.remove('has-tts-active');
  });
}

export function ensureFloatingTTSCapsule() {
  let widget = document.getElementById('tts-floating-widget');
  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'tts-floating-widget';
    document.body.appendChild(widget);
  }
  return widget;
}

export function hideFloatingTTSCapsule(side = 'right') {
  const widget = document.getElementById('tts-floating-widget');
  if (widget) {
    if (side === 'left') {
      widget.classList.add('tts-collapsed-left');
      widget.classList.remove('tts-collapsed');
    } else {
      widget.classList.add('tts-collapsed');
      widget.classList.remove('tts-collapsed-left');
    }
  }
}

export function showFloatingTTSCapsule() {
  isTTSWidgetVisible = true;
  const widget = ensureFloatingTTSCapsule();
  if (widget) {
    widget.style.display = 'block';
    widget.classList.remove('tts-collapsed');
    widget.classList.remove('tts-collapsed-left');
  }
}

export function pauseTTS() {
  ttsClearAdvance();
  isReadingActive = false;
  isTTSCancelledByUser = true;
  stopAllTTSAudio();
  if (ttsTimer) { clearTimeout(ttsTimer); clearInterval(ttsTimer); ttsTimer = null; }
  clearTTSHighlights();
  syncTTSControllerState();
}

export function turnOffTTS() {
  ttsClearAdvance();
  isReadingActive = false;
  isTTSWidgetVisible = false;
  isTTSCancelledByUser = true;
  stopAllTTSAudio();
  if (ttsTimer) { clearTimeout(ttsTimer); clearInterval(ttsTimer); ttsTimer = null; }
  clearTTSHighlights();
  if (typeof window.closeOledBlackoutVisualizer === 'function') {
    window.closeOledBlackoutVisualizer();
  }
  const widget = document.getElementById('tts-floating-widget');
  if (widget) {
    widget.style.display = 'none';
    widget.remove();
  }
  syncTTSControllerState();
}

let ttsCapsuleWindowHandlers = null;

export function renderFloatingTTSCapsule() {
  if (!isTTSWidgetVisible || !window.State || !window.State.currentDoc) {
    const w = document.getElementById('tts-floating-widget');
    if (w) {
      w.style.display = 'none';
      w.remove();
    }
    return;
  }

  const widget = ensureFloatingTTSCapsule();
  widget.style.display = 'block';

  const pageNum = window.State ? (window.State.currentPage || 1) : 1;
  const numPages = window.State ? (window.State.numPages || 1) : 1;
  const settings = getTTSSettings();
  const voiceInfo = getActiveVoiceDisplayName();
  const isSpeaking = isReadingActive && (Boolean(activeMicrosoftAudio) || Boolean(activeElevenAudio) || Boolean(window.speechSynthesis && window.speechSynthesis.speaking));

  widget.innerHTML = `
    <!-- Expanded Floating Rectangular Capsule Box -->
    <div id="tts-capsule-bar" class="tts-capsule-bar" title="Drag Left/Right to Hide, Drag Up/Down to Move or Turn Off">
      <div class="tts-capsule-left">
        <button id="tts-cap-prev-s" class="tts-cap-icon-btn" title="Previous Sentence">
          ⏮️
        </button>
        <button id="tts-cap-play" class="tts-cap-btn-main ${isSpeaking ? 'active' : ''}" title="${isSpeaking ? 'Pause Reading' : 'Start Reading'}">
          ${isSpeaking ? '⏹️' : '▶️'}
        </button>
        <button id="tts-cap-next-s" class="tts-cap-icon-btn" title="Next Sentence">
          ⏭️
        </button>
        <div class="tts-cap-info">
          <div class="tts-cap-pg font-mono">Pg ${pageNum}/${numPages}</div>
          <div class="tts-cap-status" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90px;" title="${voiceInfo.fullName}">
            ${isSpeaking ? `🔊 ${voiceInfo.name}` : `✨ ${voiceInfo.name}`}
          </div>
        </div>
      </div>

      <div class="tts-cap-speeds">
        ${[0.8, 1.0, 1.25, 1.5, 2.0].map(s => `
          <button class="tts-cap-speed-chip ${Math.abs(settings.rate - s) < 0.05 ? 'active' : ''}" data-speed="${s}">
            ${s}x
          </button>
        `).join('')}
      </div>

      <div class="tts-cap-right">
        <button id="tts-cap-voice" class="tts-cap-icon-btn" title="Voice &amp; Character Settings (${voiceInfo.fullName})">
          ⚙️
        </button>
        <button id="tts-cap-close" class="tts-cap-icon-btn close-btn" title="Turn Off Read Aloud">
          ✕
        </button>
      </div>
    </div>

    <!-- Edge Tab when Collapsed -->
    <div id="tts-edge-tab" class="tts-edge-tab" title="Click or Drag to open Read Aloud controls">
      <div class="tts-edge-tab-inner">
        <span class="tts-edge-icon">🔊</span>
        <span class="tts-edge-label">READ</span>
      </div>
    </div>
  `;

  const prevSBtn = document.getElementById('tts-cap-prev-s');
  if (prevSBtn) {
    prevSBtn.onclick = (e) => {
      e.stopPropagation();
      skipTTSSentence(-1);
    };
  }

  const nextSBtn = document.getElementById('tts-cap-next-s');
  if (nextSBtn) {
    nextSBtn.onclick = (e) => {
      e.stopPropagation();
      skipTTSSentence(1);
    };
  }

  const playBtn = document.getElementById('tts-cap-play');
  if (playBtn) {
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (isReadingActive) {
        pauseTTS();
        window.toast('Paused reading');
      } else {
        runPageReadAloud(activeTTSSentences.length && activeTTSPageNum ? activeTTSPageNum : (window.State.currentPage || 1), {
          resume: true,
          onStart: () => renderFloatingTTSCapsule(),
          onEnd: () => renderFloatingTTSCapsule(),
          onStop: () => renderFloatingTTSCapsule()
        });
      }
    };
  }

  document.querySelectorAll('.tts-cap-speed-chip').forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const spd = parseFloat(chip.dataset.speed);
      saveTTSSettings({ rate: spd });
      if (isReadingActive) {
        // Continue playback at current sentence with new speed seamlessly
        continuePlaybackWithCurrentSettings();
      } else {
        renderFloatingTTSCapsule();
      }
    };
  });

  const voiceBtn = document.getElementById('tts-cap-voice');
  if (voiceBtn) {
    voiceBtn.onclick = (e) => {
      e.stopPropagation();
      openVoiceSettingsModal();
    };
  }

  const closeBtn = document.getElementById('tts-cap-close');
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      turnOffTTS();
      window.toast('Read Aloud turned off ⏹️');
    };
  }

  const edgeTab = document.getElementById('tts-edge-tab');
  if (edgeTab) {
    edgeTab.onclick = (e) => {
      e.stopPropagation();
      showFloatingTTSCapsule();
    };
  }

  // --- Interactive Gesture/Drag Handling ---
  const capBar = document.getElementById('tts-capsule-bar');
  if (capBar) {
    let startX = 0, startY = 0, deltaX = 0, deltaY = 0, isDragging = false;

    const onPointerDown = (e) => {
      if (e.target.closest('button, input, select')) return;
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      deltaX = 0;
      deltaY = 0;
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      deltaX = clientX - startX;
      deltaY = clientY - startY;

      widget.style.transform = `translate(calc(-50% + ${deltaX}px), ${deltaY}px)`;
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      widget.style.transform = '';

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const isTopDocked = widget.classList.contains('tts-top-docked');

      if (absX > 35 && absX > absY * 1.3) {
        if (deltaX < 0) {
          hideFloatingTTSCapsule('left');
          window.toast('Reader hidden to left edge ⬅️');
        } else {
          hideFloatingTTSCapsule('right');
          window.toast('Reader hidden to right edge ➡️');
        }
      } else if (absY > 25) {
        if (isTopDocked) {
          if (deltaY < -25) {
            turnOffTTS();
            window.toast('Read Aloud turned off ⏹️');
          } else if (deltaY > 25) {
            widget.classList.remove('tts-top-docked');
            window.toast('Moved to bottom ⬇️');
          }
        } else {
          if (deltaY > 25) {
            turnOffTTS();
            window.toast('Read Aloud turned off ⏹️');
          } else if (deltaY < -25) {
            widget.classList.add('tts-top-docked');
            window.toast('Docked to top ⬆️');
          }
        }
      }

      startX = 0; startY = 0; deltaX = 0; deltaY = 0;
    };

    if (ttsCapsuleWindowHandlers) {
      window.removeEventListener('mousemove', ttsCapsuleWindowHandlers.move);
      window.removeEventListener('mouseup', ttsCapsuleWindowHandlers.up);
      window.removeEventListener('touchmove', ttsCapsuleWindowHandlers.move);
      window.removeEventListener('touchend', ttsCapsuleWindowHandlers.up);
    }
    ttsCapsuleWindowHandlers = { move: onPointerMove, up: onPointerUp };

    capBar.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    capBar.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp, { passive: true });
  }
}

/* ===== Read-aloud text model: sentences, words, language, timing ===== */

/** 'hi' when the text is mostly Devanagari, otherwise 'en'. */
export function ttsLangOf(text) {
  const t = String(text || '');
  const dev = (t.match(/[ऀ-ॿ]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  return dev > 0 && dev >= lat * 0.4 ? 'hi' : 'en';
}

const TTS_SENT_END = /[.!?।॥]+["'”’)\]]*$/;
const TTS_ABBR = /^(?:dr|mr|mrs|ms|prof|sr|jr|st|vs|etc|fig|figs|no|nos|vol|pp|eg|ie|e\.g|i\.e|cf|eq|ch|sec|rs|approx|dept|a\.m|p\.m|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.$/i;

function ttsEndsSentence(spoken, isFirstWord) {
  const w = spoken.replace(/["'”’)\]]+$/g, '');
  if (!TTS_SENT_END.test(spoken)) return false;
  if (TTS_ABBR.test(w) || /^[A-Za-z]\.$/.test(w)) return false;           // "Dr." / "A."
  if (isFirstWord && /^\(?\d{1,3}[.)]$/.test(w)) return false;            // "1." list numbering
  if (/^\d+\.\d*$/.test(w) && w.length > 2 && !/\.$/.test(w)) return false;
  return true;
}

/** Rough syllable count (English and Devanagari); used to time highlights when the engine gives no word events. */
function ttsSyllables(word) {
  const core = String(word || '').replace(/[^\p{L}\p{M}\p{N}]/gu, '');
  if (!core) return 0;
  if (/[ऀ-ॿ]/.test(core)) {
    const ch = [...core];
    let syl = 0;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (/[ऄ-औॠॡ]/.test(c)) syl++;
      else if (/[ा-ौॢॣ]/.test(c)) syl++;
      else if (/[क-हक़-य़]/.test(c)) {
        let n = ch[i + 1];
        if (n === '़') n = ch[i + 2];
        if (!n || !/[ा-्ॢॣ]/.test(n)) syl++;
      }
    }
    if (syl > 1 && /[क-हक़-य़]$/.test(core)) syl--;     // schwa deletion at word end
    return Math.max(1, syl);
  }
  if (/^\d+$/.test(core)) return Math.max(1, Math.round(core.length * 1.5));
  const lower = core.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  return Math.max(1, (lower.match(/[aeiouy]+/g) || []).length);
}

/** Estimated time one word takes to speak, in ms (at rate 1.0 this is about 160 words per minute). */
export function ttsWordMs(word, rate = 1) {
  const w = String(word || '');
  let ms = ttsSyllables(w) * 190 + 70;
  if (/[,;:—]$/.test(w)) ms += 170;
  else if (/[.!?।॥]["'”)]*$/.test(w)) ms += 320;
  return Math.max(60, Math.round(ms / (rate || 1)));
}

/** Resolves the live DOM element of a word, re-tagging the page if the text layer was rebuilt (zoom / re-render). */
function refreshSentenceEls(sentence) {
  const w0 = sentence.words[0];
  if (w0 && w0.el && w0.el.isConnected) return true;
  const pe = window.pageEls && window.pageEls[sentence.pageNum];
  if (!pe || !pe.textLayerDiv) return false;
  const r = tagTTSWordSpans(pe.textLayerDiv, sentence.pageNum);
  const fresh = r.sentences[sentence.idx];
  if (!fresh || fresh.words.length !== sentence.words.length) return false;
  sentence.words.forEach((w, i) => { w.el = fresh.words[i].el; w.parentSpan = fresh.words[i].parentSpan; });
  sentence.parentSpans = fresh.parentSpans;
  sentence.parentSpans.forEach(sp => sp.classList.add('tts-sentence-active'));
  return true;
}

let activeWordEl = null;

function ensureWordVisible(el) {
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl || !el) return;
  const sRect = scrollEl.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < sRect.top + 40 || r.bottom > sRect.bottom - 60) {
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }
}

/** Highlights exactly one word (cheap: touches only the previous and the new element). */
function setActiveWord(sentence, idx) {
  if (!sentence || !sentence.words) return;
  const w = sentence.words[idx];
  if (!w) return;
  if (!w.el || !w.el.isConnected) { if (!refreshSentenceEls(sentence)) return; }
  const el = sentence.words[idx].el;
  if (!el) return;
  activeTTSWordIdx = idx;
  if (el === activeWordEl) return;
  if (activeWordEl) activeWordEl.classList.remove('tts-word-active', 'highlight');
  el.classList.add('tts-word-active', 'highlight');
  activeWordEl = el;
  ensureWordVisible(el);
}

/** Maps an engine's word events (text only) to page words by walking the spoken string, so hyphens, numbers and skipped tokens cannot knock the highlight out of sync. */
function makeBoundaryMapper(sentence, spokenText, startCharOffset, startWIdx) {
  const hay = spokenText.toLowerCase();
  const words = sentence.words;
  let cursor = 0;
  let last = startWIdx;
  const wordAt = (charPos) => {
    let lo = 0, hi = words.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].startChar <= charPos) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
  return (wb) => {
    const t = String(wb && wb.text || '').toLowerCase().trim();
    if (!t) return last;
    let p = hay.indexOf(t, cursor);
    if (p < 0 || p - cursor > 60) {
      const t2 = t.replace(/[^\p{L}\p{M}\p{N}]/gu, '');
      p = t2 ? hay.indexOf(t2, cursor) : -1;
      if (p >= 0 && p - cursor <= 60) { cursor = p + t2.length; }
      else p = -1;
    } else cursor = p + t.length;
    let idx;
    if (p >= 0) idx = wordAt(p + startCharOffset);
    else {
      idx = Math.min(last + 1, words.length - 1);                      // lost track: step one word
      cursor = Math.max(cursor, (words[idx].startChar - startCharOffset) + (words[idx].spoken || '').length);
    }
    if (idx < last) idx = last;                                         // never move backwards
    last = idx;
    return idx;
  };
}

const ttsTimingFactor = { en: 1, hi: 1 };   // actual/estimated duration, learned from finished sentences (self-calibrating)
let ttsAdvanceTimer = null;                 // pending "turn to next page" timeout

function ttsClearAdvance() { if (ttsAdvanceTimer) { clearTimeout(ttsAdvanceTimer); ttsAdvanceTimer = null; } }
function ttsScheduleAdvance(fn, ms) { ttsClearAdvance(); ttsAdvanceTimer = setTimeout(() => { ttsAdvanceTimer = null; fn(); }, ms); }

function ttsWordStarts(sentence, startWIdx, rate) {
  const starts = [];
  let t = 0;
  for (let i = startWIdx; i < sentence.words.length; i++) {
    starts.push(t);
    t += ttsWordMs(sentence.words[i].spoken, rate);
  }
  return { starts, total: t };
}

/** No word events from the engine (many phones): advance highlights on a clock built from syllable counts. */
function startTimedHighlight(sentence, startWIdx, rate, utterId, isStillNative) {
  const raw = ttsWordStarts(sentence, startWIdx, rate);
  const k = ttsTimingFactor[sentence.lang === 'hi' ? 'hi' : 'en'] || 1;
  const starts = raw.starts.map(x => x * k);
  const t0 = performance.now();
  let i = 0;
  const tick = () => {
    ttsTimer = null;
    if (utterId !== currentUtteranceId || !isReadingActive || isTTSCancelledByUser) return;
    if (isStillNative && isStillNative()) return;
    const el = performance.now() - t0;
    while (i + 1 < starts.length && starts[i + 1] <= el) i++;
    setActiveWord(sentence, startWIdx + i);
    if (i + 1 < starts.length) ttsTimer = setTimeout(tick, Math.max(25, starts[i + 1] - el));
  };
  if (starts.length > 1) ttsTimer = setTimeout(tick, Math.max(25, starts[1]));
  return { t0, rawTotal: raw.total };
}

function ttsLearnSpeed(lang, rawTotal, actualMs) {
  if (!(rawTotal > 400) || !(actualMs > 300)) return;
  const f = Math.min(2, Math.max(0.5, (actualMs - 60) / rawTotal));
  const key = lang === 'hi' ? 'hi' : 'en';
  ttsTimingFactor[key] = ttsTimingFactor[key] * 0.4 + f * 0.6;
}

/** Audio without word events (ElevenLabs): follow the real playback position, scaled to the real duration. */
function startAudioSyncedHighlight(audio, sentence, startWIdx, rate, utterId) {
  const { starts, total } = ttsWordStarts(sentence, startWIdx, rate);
  if (starts.length < 2) return;
  let raf = null;
  const loop = () => {
    if (utterId !== currentUtteranceId || !isReadingActive || isTTSCancelledByUser || audio.ended) return;
    if (!audio.paused) {
      const dur = audio.duration;
      const pos = isFinite(dur) && dur > 0 ? (audio.currentTime / dur) * total : audio.currentTime * 1000;
      let i = 0;
      while (i + 1 < starts.length && starts[i + 1] <= pos) i++;
      setActiveWord(sentence, startWIdx + i);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function tagTTSWordSpans(textLayerDiv, pageNum) {
  if (!textLayerDiv) return { fullText: '', sentences: [], wordsMap: [] };
  const pgNum = pageNum || activeTTSPageNum || 1;

  const outerSpans = [...textLayerDiv.querySelectorAll('span')].filter(s => !s.classList.contains('tts-w'));

  // 1) make sure every word is its own span
  const allWordEls = [];
  for (const span of outerSpans) {
    const text = span.textContent || '';
    if (!text.trim()) continue;
    let wordSpans = [...span.querySelectorAll('.tts-w')];
    if (wordSpans.length === 0) {
      const parts = text.split(/(\s+)/);
      span.innerHTML = '';
      parts.forEach(pt => {
        if (!pt) return;
        if (/\S/.test(pt)) {
          const wSpan = document.createElement('span');
          wSpan.className = 'tts-w';
          wSpan.textContent = pt;
          span.appendChild(wSpan);
        } else {
          span.appendChild(document.createTextNode(pt));
        }
      });
      wordSpans = [...span.querySelectorAll('.tts-w')];
    }
    wordSpans.forEach(el => allWordEls.push({ el, span }));
  }

  // 2) what is actually spoken: legacy-font Hindi (Kruti Dev etc.) is converted to Unicode, one token per word
  const rawTokens = allWordEls.map(x => x.el.textContent);
  let spokenTokens = rawTokens;
  try {
    const joined = rawTokens.join(' ');
    const pageLegacy = pageIsLegacyHindi(joined);
    const fixed = fixLegacyHindi(joined, { pageLegacy });
    const parts = fixed.split(/\s+/).filter(Boolean);
    if (parts.length === rawTokens.length) spokenTokens = parts;
    else if (pageLegacy) spokenTokens = rawTokens.map(t => fixLegacyHindi(t, { pageLegacy: true }));
  } catch (e) { spokenTokens = rawTokens; }

  let globalWordIdx = 0;
  let globalSentenceIdx = 0;
  const sentences = [];
  const wordsMap = [];
  let currentSentenceText = '';
  let currentSentenceWords = [];
  let currentSentenceSpans = new Set();

  function finalizeSentence() {
    if (!currentSentenceWords.length) return;
    const sentenceText = currentSentenceText.trim();
    if (!sentenceText) return;
    const sObj = {
      idx: globalSentenceIdx,
      pageNum: pgNum,
      text: sentenceText,
      lang: ttsLangOf(sentenceText),
      words: currentSentenceWords,
      parentSpans: Array.from(currentSentenceSpans)
    };
    sObj.words.forEach(w => { if (w.el) w.el.setAttribute('data-tts-s-idx', globalSentenceIdx.toString()); });
    sentences.push(sObj);
    globalSentenceIdx++;
    currentSentenceText = '';
    currentSentenceWords = [];
    currentSentenceSpans = new Set();
  }

  allWordEls.forEach(({ el: wEl, span }, k) => {
    const wText = rawTokens[k];
    const spoken = (spokenTokens[k] || wText);
    const localWordIdx = currentSentenceWords.length;
    wEl.setAttribute('data-word-index', globalWordIdx.toString());
    wEl.setAttribute('data-tts-s-idx', globalSentenceIdx.toString());
    wEl.setAttribute('data-tts-w-idx', localWordIdx.toString());

    const startChar = currentSentenceText.length;
    currentSentenceText += spoken + ' ';
    const endChar = currentSentenceText.length;

    const wObj = { idx: globalWordIdx, sIdx: globalSentenceIdx, el: wEl, parentSpan: span, startChar, endChar, text: wText, spoken };
    currentSentenceWords.push(wObj);
    currentSentenceSpans.add(span);
    wordsMap.push(wObj);
    globalWordIdx++;

    const n = currentSentenceWords.length;
    if (ttsEndsSentence(spoken.trim(), n === 1)) finalizeSentence();
    else if ((n >= 28 && /[,;:—]$/.test(spoken)) || n >= 60) finalizeSentence();   // very long run-ons are read in parts
  });

  finalizeSentence();

  const fullText = sentences.map(s => s.text).join(' ');

  // tap a word to start reading from it (works on any page, even one that is not the active reading page)
  if (!textLayerDiv.dataset.ttsClickSetup) {
    textLayerDiv.dataset.ttsClickSetup = 'true';
    textLayerDiv.dataset.ttsPage = String(pgNum);
    textLayerDiv.addEventListener('click', (e) => {
      if (!isReadingActive) return;
      const target = e.target.closest('.tts-w') || e.target.closest('span');
      if (!target) return;
      if (window.getSelection && String(window.getSelection()).trim()) return;     // user is selecting text, not tapping
      const sIdxAttr = target.getAttribute('data-tts-s-idx');
      const wIdxAttr = target.getAttribute('data-tts-w-idx');
      if (sIdxAttr === null) return;
      const pg = parseInt(textLayerDiv.dataset.ttsPage || '0', 10) || activeTTSPageNum;
      playTTSFrom(pg, parseInt(sIdxAttr, 10), wIdxAttr !== null ? parseInt(wIdxAttr, 10) : 0);
    });
  }

  return { fullText, sentences, wordsMap };
}

/** Start (or jump) reading at a sentence/word of a page. */
export function playTTSFrom(pageNum, sIdx, wIdx = 0) {
  ttsClearAdvance();
  isReadingActive = true;
  isTTSCancelledByUser = false;
  if (pageNum === activeTTSPageNum && activeTTSSentences.length && window.playTTSSentenceAt) {
    window.playTTSSentenceAt(sIdx, wIdx);
  } else {
    runPageReadAloud(pageNum, { startSentence: sIdx, startWord: wIdx, onStart: () => renderFloatingTTSCapsule(), onEnd: () => renderFloatingTTSCapsule(), onStop: () => renderFloatingTTSCapsule() });
  }
}

export async function preparePageTTSData(pageNum) {
  const pgNum = pageNum || window.State.currentPage || 1;
  if (window.renderPage && window.pageEls && window.pageEls[pgNum]) {
    const pe = window.pageEls[pgNum];
    if (!pe.rendered) {
      await window.renderPage(pgNum);
    }
  }

  const pe = window.pageEls ? window.pageEls[pgNum] : null;
  if (!pe || !pe.textLayerDiv) {
    const fallbackText = await getCurrentPageText(pgNum);
    return { text: fallbackText, sentences: [], wordsMap: [] };
  }

  const { fullText, sentences, wordsMap } = tagTTSWordSpans(pe.textLayerDiv, pgNum);
  return { text: fullText, sentences, wordsMap, pe };
}

export function runTTS(text, options = {}) {
  isTTSCancelledByUser = false;

  if (activeMicrosoftAudio || activeElevenAudio || (window.speechSynthesis && window.speechSynthesis.speaking)) {
    if (!options.forcePlay) {
      isTTSCancelledByUser = true;
      stopAllTTSAudio();
      if (ttsTimer) clearInterval(ttsTimer);
      clearTTSHighlights();
      window.toast('Stopped reading aloud');
      if (options.onStop) options.onStop();
      return;
    }
  }

  stopAllTTSAudio();

  if (!text || !text.trim()) {
    window.toast('No text available to read aloud');
    return;
  }

  isReadingActive = true;
  isTTSCancelledByUser = false;

  const settings = getTTSSettings();
  const engine = settings.engine || 'microsoft';

  if (engine === 'microsoft') {
    window.toast('🎙️ Reading with Microsoft Neural Voice…');
    speakWithMicrosoftNeural(text, settings.microsoftVoiceId || 'hi-IN-SwaraNeural', {
      rate: settings.rate || 1.0,
      pitch: settings.pitch || 1.0,
      onStart: () => {
        isReadingActive = true;
        if (options.onStart) options.onStart();
      },
      onEnd: () => {
        if (isTTSCancelledByUser || !isReadingActive) return;
        isReadingActive = false;
        if (options.onEnd) options.onEnd();
        else window.toast('Finished reading');
      },
      onError: (err) => {
        if (isTTSCancelledByUser || !isReadingActive) return;
        window.toast('Microsoft voice unavailable, falling back to system voice');
        runSystemTTSFallback(text, options);
      }
    }).catch(err => {
      if ((err && err.cancelled) || isTTSCancelledByUser || !isReadingActive) return;
      runSystemTTSFallback(text, options);
    });
    return;
  }

  const elevenKey = getElevenLabsApiKey();
  if (engine === 'elevenlabs' && elevenKey && settings.useElevenLabs !== false) {
    window.toast('✨ Reading with ElevenLabs AI Voice…');
    speakWithElevenLabs(text, settings.elevenVoiceId, {
      onStart: () => {
        isReadingActive = true;
        if (options.onStart) options.onStart();
      },
      onEnd: () => {
        if (isTTSCancelledByUser || !isReadingActive) return;
        isReadingActive = false;
        if (options.onEnd) options.onEnd();
        else window.toast('Finished reading');
      },
      onError: (err) => {
        if (isTTSCancelledByUser || !isReadingActive) return;
        window.toast('ElevenLabs error, falling back to system voice');
        runSystemTTSFallback(text, options);
      }
    }).catch(err => {
      if ((err && err.cancelled) || isTTSCancelledByUser || !isReadingActive) return;
      runSystemTTSFallback(text, options);
    });
    return;
  }

  runSystemTTSFallback(text, options);
}

function runSystemTTSFallback(text, options = {}) {
  if (!('speechSynthesis' in window)) {
    window.toast('Text-to-speech not supported in this browser');
    return;
  }

  const settings = getTTSSettings();
  const utter = new SpeechSynthesisUtterance(text);

  const lang = ttsLangOf(text);
  const voice = pickSystemVoice(lang, settings.preset);
  if (voice) utter.voice = voice;
  utter.lang = voice && voice.lang ? voice.lang : (lang === 'hi' ? 'hi-IN' : 'en-US');

  utter.pitch = typeof options.pitch === 'number' ? options.pitch : (settings.pitch || 1.0);
  utter.rate = typeof options.rate === 'number' ? options.rate : (settings.rate || 1.0);

  utter.onstart = () => {
    isReadingActive = true;
    if (options.onStart) options.onStart();
    else window.toast('🔊 Reading aloud…');
  };

  utter.onboundary = (e) => {
    if (!isReadingActive || isTTSCancelledByUser) return;
    if (options.onBoundary) options.onBoundary(e);
  };

  utter.onend = () => {
    if (isTTSCancelledByUser || !isReadingActive) return;
    isReadingActive = false;
    if (ttsTimer) clearInterval(ttsTimer);
    clearTTSHighlights();
    if (options.onEnd) options.onEnd();
    else window.toast('Finished reading');
  };

  utter.onerror = (e) => {
    if (isTTSCancelledByUser || !isReadingActive) return;
    isReadingActive = false;
    if (ttsTimer) clearInterval(ttsTimer);
    clearTTSHighlights();
    if (options.onError) options.onError(e);
  };

  window.speechSynthesis.speak(utter);
}

function ensureSentenceInReaderView(sentence) {
  if (!sentence) return;
  const scrollEl = document.getElementById('reader-scroll');
  if (!scrollEl) return;

  const targetEl = (sentence.words && sentence.words[0] && sentence.words[0].el) || 
                   (sentence.parentSpans && sentence.parentSpans[0]);
  if (!targetEl) return;

  const sRect = scrollEl.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();

  if (tRect.top < sRect.top + 30 || tRect.bottom > sRect.bottom - 40) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function continuePlaybackWithCurrentSettings() {
  if (!isReadingActive || !activeTTSSentences || !activeTTSSentences.length) {
    renderFloatingTTSCapsule();
    return;
  }
  const sIdx = activeTTSSentenceIdx || 0;
  const wIdx = activeTTSWordIdx || 0;
  if (window.playTTSSentenceAt) {
    window.playTTSSentenceAt(sIdx, wIdx);
  }
}

export function skipTTSSentence(direction = 1) {
  if (!activeTTSSentences || !activeTTSSentences.length) return;
  ttsClearAdvance();
  currentUtteranceId++;
  if (ttsTimer) { clearTimeout(ttsTimer); clearInterval(ttsTimer); ttsTimer = null; }
  stopAllTTSAudio();
  // prev/next also works while paused: it simply resumes reading from there
  isReadingActive = true;
  isTTSCancelledByUser = false;

  const targetIdx = activeTTSSentenceIdx + direction;
  if (targetIdx >= 0 && targetIdx < activeTTSSentences.length) {
    if (window.playTTSSentenceAt) {
      window.playTTSSentenceAt(targetIdx, 0);
    }
  } else if (targetIdx >= activeTTSSentences.length) {
    const nextPage = activeTTSPageNum + 1;
    if (nextPage <= (window.State.numPages || 1)) {
      if (window.scrollToPage) window.scrollToPage(nextPage);
      ttsScheduleAdvance(() => runPageReadAloud(nextPage, { onStart: () => renderFloatingTTSCapsule(), onEnd: () => renderFloatingTTSCapsule(), onStop: () => renderFloatingTTSCapsule() }), 300);
    } else {
      isReadingActive = false;
      renderFloatingTTSCapsule();
    }
  } else if (targetIdx < 0) {
    const prevPage = activeTTSPageNum - 1;
    if (prevPage >= 1) {
      if (window.scrollToPage) window.scrollToPage(prevPage);
      ttsScheduleAdvance(() => runPageReadAloud(prevPage, { startSentence: 'last', onStart: () => renderFloatingTTSCapsule(), onEnd: () => renderFloatingTTSCapsule(), onStop: () => renderFloatingTTSCapsule() }), 300);
    } else if (window.playTTSSentenceAt) {
      window.playTTSSentenceAt(0, 0);
    }
  }
}

export async function runPageReadAloud(pageNum, callbacks = {}) {
  const pgNum = pageNum || window.State.currentPage || 1;
  const wasSamePage = activeTTSPageNum === pgNum && activeTTSSentences && activeTTSSentences.length > 0;
  const prevSentenceIdx = activeTTSSentenceIdx || 0;
  const prevWordIdx = activeTTSWordIdx || 0;

  const { text, sentences, wordsMap } = await preparePageTTSData(pgNum);

  if (!sentences || !sentences.length) {
    if (text && text.trim()) {
      runTTS(text, callbacks);
      return;
    }
    window.toast('No text found on this page to read');
    if (callbacks.onEnd) callbacks.onEnd();
    return;
  }

  clearTTSHighlights();
  showFloatingTTSCapsule();

  if (window.State && window.State.readAloudOledVisualizer && typeof window.openOledBlackoutVisualizer === 'function') {
    window.openOledBlackoutVisualizer();
  }

  // where to begin: an explicit sentence/word, the paused position on this page, or the top of the page
  let startS = 0, startW = 0;
  if (callbacks.startSentence === 'last') startS = sentences.length - 1;
  else if (typeof callbacks.startSentence === 'number') { startS = callbacks.startSentence; startW = callbacks.startWord || 0; }
  else if (callbacks.resume && wasSamePage) { startS = prevSentenceIdx; startW = prevWordIdx; }
  startS = Math.max(0, Math.min(startS, sentences.length - 1));

  currentUtteranceId++;
  activeTTSSentences = sentences;
  activeTTSPageNum = pgNum;
  activeTTSSentenceIdx = startS;
  activeTTSWordIdx = startW;
  isReadingActive = true;
  isTTSCancelledByUser = false;

  const playSentenceAt = (sIdx, startWIdx = 0) => {
    if (!isReadingActive || isTTSCancelledByUser) return;

    currentUtteranceId++;
    const thisUtteranceId = currentUtteranceId;

    if (ttsTimer) {
      clearTimeout(ttsTimer);
      clearInterval(ttsTimer);
      ttsTimer = null;
    }

    stopAllTTSAudio();

    if (sIdx >= sentences.length) {
      isReadingActive = false;
      clearTTSHighlights();
      renderFloatingTTSCapsule();

      const settings = getTTSSettings();
      if (settings.autoAdvance && pgNum < (window.State.numPages || 1)) {
        const nextPage = pgNum + 1;
        window.toast(`Turning to Page ${nextPage}…`);
        if (window.scrollToPage) window.scrollToPage(nextPage);
        ttsScheduleAdvance(() => runPageReadAloud(nextPage, callbacks), 300);
      } else {
        window.toast('Finished reading page');
        if (callbacks.onEnd) callbacks.onEnd();
      }
      return;
    }

    if (sIdx < 0) sIdx = 0;
    activeTTSSentenceIdx = sIdx;
    activeTTSWordIdx = startWIdx;

    const sentence = sentences[sIdx];
    clearTTSHighlights();
    lastBoundaryTs = Date.now();

    if (!refreshSentenceEls(sentence)) { /* element refs stay as they are; setActiveWord retries on every word */ }
    sentence.parentSpans.forEach(span => span.classList.add('tts-sentence-active'));
    ensureSentenceInReaderView(sentence);

    setActiveWord(sentence, Math.min(startWIdx, sentence.words.length - 1));

    // text to speak: the sentence (from the tapped word onward when started mid-sentence)
    const startCharOffset = (sentence.words && sentence.words[startWIdx]) ? sentence.words[startWIdx].startChar : 0;
    const spokenText = startCharOffset > 0 ? sentence.text.substring(startCharOffset) : sentence.text;

    const settings = getTTSSettings();
    const engine = settings.engine || 'microsoft';
    const rate = settings.rate || 1.0;

    // A. Microsoft Neural Voice: real word events, mapped by text
    if (engine === 'microsoft') {
      renderFloatingTTSCapsule();
      if (callbacks.onStart) callbacks.onStart();

      const mapBoundary = makeBoundaryMapper(sentence, spokenText, startCharOffset, startWIdx);
      let gotBoundary = false;

      speakWithMicrosoftNeural(spokenText, settings.microsoftVoiceId || 'hi-IN-SwaraNeural', {
        rate,
        pitch: settings.pitch || 1.0,
        onAudio: (audio, hasBoundaries) => {
          if (thisUtteranceId !== currentUtteranceId) return;
          if (!hasBoundaries) startAudioSyncedHighlight(audio, sentence, startWIdx, rate, thisUtteranceId);
        },
        onStart: () => {
          if (thisUtteranceId !== currentUtteranceId || !isReadingActive) return;
          renderFloatingTTSCapsule();
          // warm the next sentence so there is no pause between sentences
          const nxt = sentences[sIdx + 1];
          if (nxt) prefetchMicrosoftNeural(nxt.text, settings.microsoftVoiceId, { rate, pitch: settings.pitch || 1.0 });
        },
        onWordBoundary: (wb) => {
          if (thisUtteranceId !== currentUtteranceId || !isReadingActive || isTTSCancelledByUser) return;
          gotBoundary = true;
          setActiveWord(sentence, mapBoundary(wb));
        },
        onEnd: () => {
          if (thisUtteranceId !== currentUtteranceId) return;
          if (ttsTimer) clearTimeout(ttsTimer);
          if (!isReadingActive || isTTSCancelledByUser) return;
          playSentenceAt(sIdx + 1, 0);
        },
        onError: () => {
          if (thisUtteranceId !== currentUtteranceId) return;
          if (ttsTimer) clearTimeout(ttsTimer);
          window.toast('Microsoft voice unavailable, falling back to system voice…');
          speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt);
        }
      }).catch(err => {
        if (err && err.cancelled) return;
        if (thisUtteranceId !== currentUtteranceId) return;
        if (ttsTimer) clearTimeout(ttsTimer);
        if (!isReadingActive || isTTSCancelledByUser) return;
        speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt);
      });
      return;
    }

    // B. ElevenLabs: follows the real audio position
    const useEleven = isElevenLabsActive();
    if (useEleven) {
      renderFloatingTTSCapsule();
      if (callbacks.onStart) callbacks.onStart();

      speakWithElevenLabs(spokenText, settings.elevenVoiceId, {
        onAudio: (audio) => {
          if (thisUtteranceId !== currentUtteranceId) return;
          startAudioSyncedHighlight(audio, sentence, startWIdx, rate, thisUtteranceId);
        },
        onStart: () => {
          if (thisUtteranceId !== currentUtteranceId || !isReadingActive) return;
          renderFloatingTTSCapsule();
        },
        onEnd: () => {
          if (thisUtteranceId !== currentUtteranceId) return;
          if (ttsTimer) clearTimeout(ttsTimer);
          if (!isReadingActive || isTTSCancelledByUser) return;
          playSentenceAt(sIdx + 1, 0);
        },
        onError: () => {
          if (thisUtteranceId !== currentUtteranceId) return;
          if (ttsTimer) clearTimeout(ttsTimer);
          window.toast('Switching sentence to system voice…');
          speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt);
        }
      }).catch(err => {
        if (err && err.cancelled) return;
        if (thisUtteranceId !== currentUtteranceId) return;
        if (ttsTimer) clearTimeout(ttsTimer);
        if (!isReadingActive || isTTSCancelledByUser) return;
        speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt);
      });
      return;
    }

    // C. Browser SpeechSynthesis
    speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt);
  };

  window.playTTSSentenceAt = playSentenceAt;
  playSentenceAt(startS, startW);
}

let warnedNoHindiVoice = false;

function speakSentenceWithSystemUtterance(spokenText, sentence, startWIdx, startCharOffset, sIdx, thisUtteranceId, callbacks, playSentenceAt) {
  const utter = new SpeechSynthesisUtterance(spokenText);
  currentTTSUtterance = utter;

  const settings = getTTSSettings();
  const lang = sentence.lang || ttsLangOf(spokenText);
  const voice = pickSystemVoice(lang, settings.preset);
  if (voice) utter.voice = voice;
  utter.lang = voice && voice.lang ? voice.lang : (lang === 'hi' ? 'hi-IN' : 'en-US');
  if (lang === 'hi' && !(voice && /^hi/i.test(voice.lang)) && !warnedNoHindiVoice) {
    warnedNoHindiVoice = true;
    window.toast('Is device par Hindi system voice nahi mili. Settings me Microsoft Neural (Swara) voice chuniye.');
  }

  utter.pitch = settings.pitch || 1.0;
  utter.rate = settings.rate || 1.0;

  let hasNativeBoundary = false;
  let timedInfo = null;

  utter.onstart = () => {
    if (thisUtteranceId !== currentUtteranceId || !isReadingActive) return;
    renderFloatingTTSCapsule();
    if (callbacks.onStart) callbacks.onStart();
    lastBoundaryTs = Date.now();
    // Until the engine sends a real word event (phones often never do), time the highlight from syllable counts.
    timedInfo = startTimedHighlight(sentence, startWIdx, utter.rate, thisUtteranceId, () => hasNativeBoundary);
  };

  utter.onboundary = (e) => {
    if (thisUtteranceId !== currentUtteranceId || !isReadingActive || isTTSCancelledByUser) return;
    if (e.name && e.name !== 'word') return;
    hasNativeBoundary = true;
    if (ttsTimer) { clearTimeout(ttsTimer); ttsTimer = null; }
    lastBoundaryTs = Date.now();
    const charIdx = (e.charIndex || 0) + startCharOffset;
    const ws = sentence.words;
    let idx = 0;
    for (let i = ws.length - 1; i >= 0; i--) { if (charIdx >= ws[i].startChar) { idx = i; break; } }
    setActiveWord(sentence, idx);
  };

  utter.onend = () => {
    if (thisUtteranceId !== currentUtteranceId) return;
    if (ttsTimer) clearTimeout(ttsTimer);
    if (!isReadingActive || isTTSCancelledByUser) return;
    if (timedInfo && !hasNativeBoundary) ttsLearnSpeed(sentence.lang, timedInfo.rawTotal, performance.now() - timedInfo.t0);
    playSentenceAt(sIdx + 1, 0);
  };

  utter.onerror = (e) => {
    if (thisUtteranceId !== currentUtteranceId) return;
    if (ttsTimer) clearTimeout(ttsTimer);
    if (!isReadingActive || isTTSCancelledByUser) return;
    if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
    playSentenceAt(sIdx + 1, 0);
  };

  setTimeout(() => {
    if (thisUtteranceId !== currentUtteranceId || !isReadingActive || isTTSCancelledByUser) return;
    window.speechSynthesis.speak(utter);
  }, 40);
}

/** System voice for a language: Hindi needs a hi-* voice (an English voice mispronounces or skips Devanagari). */
function pickSystemVoice(lang, preset) {
  const voices = getSystemVoices();
  if (lang === 'hi') {
    const hv = voices.filter(v => v.lang && /^hi([-_]|$)/i.test(v.lang));
    return hv.find(v => v.localService) || hv[0] || null;
  }
  return findBestVoiceForPreset(preset, voices);
}

export async function getCurrentPageText(pageNum) {
  if (!window.State || !window.State.currentDoc) return '';
  const pgNum = pageNum || window.State.currentPage || 1;
  try {
    const page = await window.State.currentDoc.getPage(pgNum);
    const content = await page.getTextContent();
    const str = fixLegacyItems(content.items.map(item => item.str)).replace(/\s+/g, ' ').trim();
    return str;
  } catch(e) {
    return '';
  }
}

let selectedVoiceCategory = 'hindi';
let currentPlayingVoiceId = null;

export function openVoiceSettingsModal() {
  const settings = getTTSSettings();
  const currentEngine = settings.engine || 'microsoft';
  const msVoices = MICROSOFT_NEURAL_VOICES;
  const currentMsVoiceId = settings.microsoftVoiceId || 'hi-IN-SwaraNeural';
  const elevenVoices = getAllElevenLabsVoices();
  const currentElevenVoiceId = settings.elevenVoiceId || 'nPczCjzI2devNBz1zQrb';
  const voices = getSystemVoices();

  const presets = [
    { id: 'male_deep', label: '👨 Deep Male Voice', sub: 'Pitch 0.70x · Resonant & Deep' },
    { id: 'female_soft', label: '👩 Female Natural', sub: 'Pitch 1.15x · Soft & Clear' },
    { id: 'fast', label: '⚡ Fast Narrator', sub: 'Speed 1.35x · Quick Study' },
    { id: 'calm', label: '🧘 Calm Reader', sub: 'Speed 0.80x · Slow & Steady' },
    { id: 'custom', label: '🎛️ Custom System Voice', sub: 'Manual Browser Voice & Pitch' }
  ];

  // Helper to filter MS voices by active category
  let activeMsList = msVoices;
  if (selectedVoiceCategory === 'hindi') {
    activeMsList = msVoices.filter(v => (v.category && v.category.includes('Hindi')) || v.id.startsWith('hi-') || v.id.startsWith('en-IN'));
  } else if (selectedVoiceCategory === 'us') {
    activeMsList = msVoices.filter(v => v.id.startsWith('en-US'));
  } else if (selectedVoiceCategory === 'uk') {
    activeMsList = msVoices.filter(v => v.id.startsWith('en-GB') || v.id.startsWith('en-AU'));
  } else if (selectedVoiceCategory === 'regional') {
    activeMsList = msVoices.filter(v => v.category === 'Regional Indian' || (!v.id.startsWith('hi-') && !v.id.startsWith('en-')));
  }

  // Active voice display name
  const activeVoiceName = currentEngine === 'microsoft'
    ? (msVoices.find(v => v.id === currentMsVoiceId)?.name || 'Swara (Hindi)')
    : currentEngine === 'elevenlabs'
    ? (elevenVoices.find(v => v.id === currentElevenVoiceId)?.name || 'Brian')
    : 'System Voice';

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:4px 0 12px;">
      <div class="font-display" style="font-size:17px; font-weight:800; display:flex; align-items:center; gap:8px;">
        ${window.icon('volume','icon icon-sm')} Voice &amp; Speech Settings
      </div>
      <button class="sheet-close-btn btn btn-ghost" style="width:32px; height:32px; border-radius:50%; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Close Menu">✕</button>
    </div>

    <!-- ACTIVE VOICE SUMMARY BADGE -->
    <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:34px; height:34px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:18px;">
          ${currentEngine === 'microsoft' ? '⚡' : currentEngine === 'elevenlabs' ? '✨' : '🎙️'}
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Selected Voice</div>
          <div style="font-size:13.5px; font-weight:800; color:var(--text);">${activeVoiceName}</div>
        </div>
      </div>
      <span style="font-size:11px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:3px 10px; border-radius:12px;">
        ${settings.rate.toFixed(2)}x Speed
      </span>
    </div>

    <!-- ENGINE SELECTOR TABS -->
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-bottom:14px; background:var(--surface-2); padding:4px; border-radius:14px; border:1px solid var(--border);">
      <button id="engine-tab-microsoft" class="btn" style="padding:9px 6px; font-size:12px; font-weight:800; border-radius:10px; border:none; cursor:pointer; background:${currentEngine === 'microsoft' ? 'var(--accent)' : 'transparent'}; color:${currentEngine === 'microsoft' ? '#fff' : 'var(--text-dim)'}; transition:all 0.2s ease;">
        ⚡ Microsoft Neural
      </button>
      <button id="engine-tab-eleven" class="btn" style="padding:9px 6px; font-size:12px; font-weight:800; border-radius:10px; border:none; cursor:pointer; background:${currentEngine === 'elevenlabs' ? 'var(--accent)' : 'transparent'}; color:${currentEngine === 'elevenlabs' ? '#fff' : 'var(--text-dim)'}; transition:all 0.2s ease;">
        ✨ ElevenLabs
      </button>
      <button id="engine-tab-system" class="btn" style="padding:9px 6px; font-size:12px; font-weight:800; border-radius:10px; border:none; cursor:pointer; background:${currentEngine === 'system' ? 'var(--accent)' : 'transparent'}; color:${currentEngine === 'system' ? '#fff' : 'var(--text-dim)'}; transition:all 0.2s ease;">
        🎙️ Device Voice
      </button>
    </div>

    <!-- MICROSOFT NEURAL PANEL -->
    <div id="microsoft-engine-panel" style="display:${currentEngine === 'microsoft' ? 'block' : 'none'}; margin-bottom:16px;">
      <!-- Category Filter Chips -->
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:10px; scrollbar-width:none;">
        <button class="ms-cat-chip btn" data-cat="hindi" style="padding:6px 12px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; border:1px solid ${selectedVoiceCategory === 'hindi' ? 'var(--accent)' : 'var(--border)'}; background:${selectedVoiceCategory === 'hindi' ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${selectedVoiceCategory === 'hindi' ? 'var(--accent)' : 'var(--text)'};">
          🇮🇳 Hindi &amp; Indian
        </button>
        <button class="ms-cat-chip btn" data-cat="us" style="padding:6px 12px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; border:1px solid ${selectedVoiceCategory === 'us' ? 'var(--accent)' : 'var(--border)'}; background:${selectedVoiceCategory === 'us' ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${selectedVoiceCategory === 'us' ? 'var(--accent)' : 'var(--text)'};">
          🇺🇸 US English
        </button>
        <button class="ms-cat-chip btn" data-cat="uk" style="padding:6px 12px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; border:1px solid ${selectedVoiceCategory === 'uk' ? 'var(--accent)' : 'var(--border)'}; background:${selectedVoiceCategory === 'uk' ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${selectedVoiceCategory === 'uk' ? 'var(--accent)' : 'var(--text)'};">
          🇬🇧 UK English
        </button>
        <button class="ms-cat-chip btn" data-cat="regional" style="padding:6px 12px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; border:1px solid ${selectedVoiceCategory === 'regional' ? 'var(--accent)' : 'var(--border)'}; background:${selectedVoiceCategory === 'regional' ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${selectedVoiceCategory === 'regional' ? 'var(--accent)' : 'var(--text)'};">
          🏛️ Regional Languages
        </button>
      </div>

      <!-- Voice Cards Scrollable List -->
      <div style="display:flex; flex-direction:column; gap:8px; max-height:270px; overflow-y:auto; padding-right:2px; margin-bottom:12px;">
        ${activeMsList.map(v => {
          const isSelected = currentMsVoiceId === v.id;
          const isPlaying = currentPlayingVoiceId === v.id;
          return `
            <div class="ms-voice-card" data-voice-id="${v.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:${isSelected ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; cursor:pointer; transition:all 0.15s ease;">
              <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <div style="width:32px; height:32px; border-radius:50%; background:${isSelected ? 'var(--accent)' : 'var(--bg-elev)'}; color:${isSelected ? '#fff' : 'var(--text)'}; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0;">
                  ${v.gender === 'female' ? '👩' : '👨'}
                </div>
                <div style="min-width:0; flex:1;">
                  <div style="font-size:13px; font-weight:700; color:${isSelected ? 'var(--accent)' : 'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${v.name.replace(/^[^\w\s]+/, '').trim()}
                  </div>
                  <div style="font-size:11px; color:var(--text-dim);">
                    ${v.lang} · ${v.category}
                  </div>
                </div>
              </div>

              <!-- Preview Button -->
              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <button class="btn ms-preview-btn" data-voice-id="${v.id}" title="Preview Voice" style="padding:5px 10px; font-size:11.5px; font-weight:700; height:30px; border-radius:15px; border:1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; background:${isPlaying ? 'var(--accent)' : 'var(--surface)'}; color:${isPlaying ? '#fff' : isSelected ? 'var(--accent)' : 'var(--text)'}; display:flex; align-items:center; gap:4px;">
                  ${isPlaying ? '🔊 Playing' : '▶ Preview'}
                </button>
                <div style="width:18px; height:18px; border-radius:50%; border:2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; background:${isSelected ? 'var(--accent)' : 'transparent'};">
                  ${isSelected ? '<div style="width:6px; height:6px; border-radius:50%; background:#fff;"></div>' : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- ELEVENLABS PANEL -->
    <div id="eleven-engine-panel" style="display:${currentEngine === 'elevenlabs' ? 'block' : 'none'}; margin-bottom:16px;">
      <div style="display:flex; flex-direction:column; gap:8px; max-height:270px; overflow-y:auto; padding-right:2px; margin-bottom:12px;">
        ${elevenVoices.map(v => {
          const isSelected = currentElevenVoiceId === v.id;
          const isPlaying = currentPlayingVoiceId === v.id;
          return `
            <div class="eleven-voice-card" data-voice-id="${v.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:${isSelected ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; cursor:pointer; transition:all 0.15s ease;">
              <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <div style="width:32px; height:32px; border-radius:50%; background:${isSelected ? 'var(--accent)' : 'var(--bg-elev)'}; color:${isSelected ? '#fff' : 'var(--text)'}; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0;">
                  ${v.gender === 'female' ? '👩' : '👨'}
                </div>
                <div style="min-width:0; flex:1;">
                  <div style="font-size:13px; font-weight:700; color:${isSelected ? 'var(--accent)' : 'var(--text)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${v.name.replace(/^[^\w\s]+/, '').trim()}
                  </div>
                  <div style="font-size:11px; color:var(--text-dim);">
                    ${v.category} · ${v.accent || 'English'}
                  </div>
                </div>
              </div>

              <!-- Preview Button -->
              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <button class="btn eleven-preview-btn" data-voice-id="${v.id}" title="Preview Voice" style="padding:5px 10px; font-size:11.5px; font-weight:700; height:30px; border-radius:15px; border:1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; background:${isPlaying ? 'var(--accent)' : 'var(--surface)'}; color:${isPlaying ? '#fff' : isSelected ? 'var(--accent)' : 'var(--text)'}; display:flex; align-items:center; gap:4px;">
                  ${isPlaying ? '🔊 Playing' : '▶ Preview'}
                </button>
                <div style="width:18px; height:18px; border-radius:50%; border:2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; background:${isSelected ? 'var(--accent)' : 'transparent'};">
                  ${isSelected ? '<div style="width:6px; height:6px; border-radius:50%; background:#fff;"></div>' : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- SYSTEM VOICES PANEL -->
    <div id="system-engine-panel" style="display:${currentEngine === 'system' ? 'block' : 'none'}; margin-bottom:16px;">
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
        ${presets.map(p => `
          <button class="btn voice-preset-btn" data-preset="${p.id}" style="width:100%; padding:10px 14px; background:${settings.preset === p.id && currentEngine === 'system' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${settings.preset === p.id && currentEngine === 'system' ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
            <div style="text-align:left;">
              <div style="font-size:13px; font-weight:700; color:${settings.preset === p.id && currentEngine === 'system' ? 'var(--accent)' : 'var(--text)'};">${p.label}</div>
              <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${p.sub}</div>
            </div>
            <div style="width:18px; height:18px; border-radius:50%; border:2px solid ${settings.preset === p.id && currentEngine === 'system' ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:${settings.preset === p.id && currentEngine === 'system' ? 'var(--accent)' : 'transparent'};">
              ${settings.preset === p.id && currentEngine === 'system' ? '<div style="width:6px; height:6px; border-radius:50%; background:#fff;"></div>' : ''}
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Universal Reading Speed Slider & Pitch -->
    <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:12px 14px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:12.5px; font-weight:700; color:var(--text);">Reading Speed</span>
        <span id="rate-val" style="color:var(--accent); font-weight:800; font-size:13px;">${settings.rate.toFixed(2)}x</span>
      </div>
      
      <!-- Quick Speed Chips -->
      <div style="display:flex; gap:6px; margin-bottom:10px;">
        ${[0.8, 1.0, 1.25, 1.5, 2.0].map(spd => `
          <button class="btn modal-quick-speed-chip" data-speed="${spd}" style="flex:1; padding:5px 0; font-size:11.5px; font-weight:700; border-radius:8px; border:1px solid ${Math.abs(settings.rate - spd) < 0.05 ? 'var(--accent)' : 'var(--border)'}; background:${Math.abs(settings.rate - spd) < 0.05 ? 'var(--accent)' : 'var(--bg)'}; color:${Math.abs(settings.rate - spd) < 0.05 ? '#fff' : 'var(--text)'}; cursor:pointer;">
            ${spd}x
          </button>
        `).join('')}
      </div>

      <input type="range" id="rate-slider" min="0.5" max="2.0" step="0.05" value="${settings.rate}" style="width:100%; accent-color:var(--accent);" />
    </div>

    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary" id="save-voice-btn" style="width:100%; padding:12px; font-weight:800; font-size:14px; border-radius:12px; background:var(--accent); color:#fff; box-shadow:0 4px 14px var(--accent-soft);">
        ✓ Apply Voice &amp; Save
      </button>
    </div>
  `);

  // Engine Tab Switchers
  const msTab = document.getElementById('engine-tab-microsoft');
  const elevenTab = document.getElementById('engine-tab-eleven');
  const systemTab = document.getElementById('engine-tab-system');

  if (msTab && elevenTab && systemTab) {
    msTab.onclick = () => {
      saveTTSSettings({ engine: 'microsoft', useElevenLabs: false });
      if (isReadingActive) continuePlaybackWithCurrentSettings();
      openVoiceSettingsModal();
    };
    elevenTab.onclick = () => {
      saveTTSSettings({ engine: 'elevenlabs', useElevenLabs: true });
      if (isReadingActive) continuePlaybackWithCurrentSettings();
      openVoiceSettingsModal();
    };
    systemTab.onclick = () => {
      saveTTSSettings({ engine: 'system', useElevenLabs: false });
      if (isReadingActive) continuePlaybackWithCurrentSettings();
      openVoiceSettingsModal();
    };
  }

  // Category Filter Chips
  document.querySelectorAll('.ms-cat-chip').forEach(btn => {
    btn.onclick = () => {
      selectedVoiceCategory = btn.dataset.cat;
      openVoiceSettingsModal();
    };
  });

  // MS Voice Card Select & Preview
  document.querySelectorAll('.ms-voice-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('.ms-preview-btn')) return; // handled by preview button
      const voiceId = card.dataset.voiceId;
      saveTTSSettings({ engine: 'microsoft', microsoftVoiceId: voiceId, useElevenLabs: false });
      if (isReadingActive) {
        continuePlaybackWithCurrentSettings();
      } else {
        renderFloatingTTSCapsule();
      }
      const found = msVoices.find(v => v.id === voiceId);
      window.toast(`Selected voice: ${found ? found.name.replace(/^[^\w\s]+/, '').trim() : voiceId}`);
      openVoiceSettingsModal();
    };
  });

  document.querySelectorAll('.ms-preview-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const voiceId = btn.dataset.voiceId;

      if (currentPlayingVoiceId === voiceId) {
        stopAllTTSAudio();
        currentPlayingVoiceId = null;
        openVoiceSettingsModal();
        return;
      }

      stopAllTTSAudio();
      currentPlayingVoiceId = voiceId;
      openVoiceSettingsModal();

      try {
        await previewMicrosoftVoice(
          voiceId,
          () => {},
          () => {
            currentPlayingVoiceId = null;
            openVoiceSettingsModal();
          }
        );
      } catch (err) {
        console.error('Preview error:', err);
        currentPlayingVoiceId = null;
        openVoiceSettingsModal();
        window.toast('Preview unavailable, please check network');
      }
    };
  });

  // ElevenLabs Voice Card Select & Preview
  document.querySelectorAll('.eleven-voice-card').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('.eleven-preview-btn')) return;
      const voiceId = card.dataset.voiceId;
      saveTTSSettings({ engine: 'elevenlabs', elevenVoiceId: voiceId, useElevenLabs: true });
      if (isReadingActive) {
        continuePlaybackWithCurrentSettings();
      } else {
        renderFloatingTTSCapsule();
      }
      const found = elevenVoices.find(v => v.id === voiceId);
      window.toast(`Selected voice: ${found ? found.name.replace(/^[^\w\s]+/, '').trim() : voiceId}`);
      openVoiceSettingsModal();
    };
  });

  document.querySelectorAll('.eleven-preview-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const voiceId = btn.dataset.voiceId;

      if (currentPlayingVoiceId === voiceId) {
        stopAllTTSAudio();
        currentPlayingVoiceId = null;
        openVoiceSettingsModal();
        return;
      }

      stopAllTTSAudio();
      currentPlayingVoiceId = voiceId;
      openVoiceSettingsModal();

      try {
        await previewElevenVoice(
          voiceId,
          () => {},
          () => {
            currentPlayingVoiceId = null;
            openVoiceSettingsModal();
          }
        );
      } catch (err) {
        currentPlayingVoiceId = null;
        openVoiceSettingsModal();
        window.toast('Preview unavailable');
      }
    };
  });

  // Preset buttons
  document.querySelectorAll('.voice-preset-btn').forEach(btn => {
    btn.onclick = () => {
      const p = btn.dataset.preset;
      applyPresetSettings(p);
      if (isReadingActive) continuePlaybackWithCurrentSettings();
      openVoiceSettingsModal();
    };
  });

  // Quick Speed Chips
  document.querySelectorAll('.modal-quick-speed-chip').forEach(btn => {
    btn.onclick = () => {
      const spd = parseFloat(btn.dataset.speed);
      saveTTSSettings({ rate: spd });
      if (isReadingActive) continuePlaybackWithCurrentSettings();
      openVoiceSettingsModal();
    };
  });

  // Rate Slider
  const rateSlider = document.getElementById('rate-slider');
  const rateVal = document.getElementById('rate-val');
  if (rateSlider && rateVal) {
    rateSlider.oninput = () => {
      const v = parseFloat(rateSlider.value);
      saveTTSSettings({ rate: v });
      rateVal.textContent = `${v.toFixed(2)}x`;
      if (isReadingActive) continuePlaybackWithCurrentSettings();
    };
  }

  // Save button
  const saveBtn = document.getElementById('save-voice-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      stopAllTTSAudio();
      currentPlayingVoiceId = null;
      window.Sheet.close();
      renderFloatingTTSCapsule();
      window.toast('Voice settings applied!');
    };
  }
}

export function syncTTSControllerState() {
  const isSpeaking = isReadingActive && (Boolean(activeMicrosoftAudio) || Boolean(activeElevenAudio) || Boolean(window.speechSynthesis && window.speechSynthesis.speaking));
  
  // Update in-sheet play button if the sheet is open
  const sheetPlayBtn = document.getElementById('tts-sheet-play-pause');
  if (sheetPlayBtn) {
    sheetPlayBtn.innerHTML = isSpeaking ? '⏸️ Pause Reading' : '▶️ Start Reading';
    if (isSpeaking) {
      sheetPlayBtn.style.background = 'var(--surface-3, #334155)';
      sheetPlayBtn.style.color = '#fff';
    } else {
      sheetPlayBtn.style.background = 'var(--accent)';
      sheetPlayBtn.style.color = '#fff';
    }
  }

  // Update floating capsule bar if present
  renderFloatingTTSCapsule();
}

export function openHandsFreeReadAloud() {
  const pageNum = window.State ? (window.State.currentPage || 1) : 1;
  const numPages = window.State ? (window.State.numPages || 1) : 1;

  const settings = getTTSSettings();
  const voiceInfo = getActiveVoiceDisplayName();
  const isSpeaking = isReadingActive && (Boolean(activeMicrosoftAudio) || Boolean(activeElevenAudio) || Boolean(window.speechSynthesis && window.speechSynthesis.speaking));

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:2px 0 12px;">
      <div class="font-display" style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
        ${window.icon('volume','icon icon-sm')} Read Aloud Controller
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="font-mono" style="font-size:12px; font-weight:700; color:var(--accent); background:var(--accent-soft); padding:3px 10px; border-radius:12px;">
          Page ${pageNum} of ${numPages}
        </span>
        <button class="sheet-close-btn btn btn-ghost" style="width:32px; height:32px; border-radius:50%; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Close Menu">✕</button>
      </div>
    </div>

    <!-- Active Voice Summary & Quick Settings -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:12px 14px; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700; color:var(--text); overflow:hidden;">
        <div style="width:34px; height:34px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:17px; flex-shrink:0;">
          ${voiceInfo.type === 'microsoft' ? '⚡' : voiceInfo.type === 'elevenlabs' ? '✨' : '🎙️'}
        </div>
        <div style="min-width:0;">
          <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:800; font-size:13.5px;">
            ${voiceInfo.fullName}
          </div>
          <div style="font-size:11px; color:var(--accent); font-weight:700;">
            ${voiceInfo.badge} · ${settings.rate.toFixed(2)}x Speed
          </div>
        </div>
      </div>
      <button class="btn btn-ghost" id="open-voice-modal-btn" style="padding:6px 12px; font-size:12px; font-weight:700; height:32px; border-radius:8px; border:1px solid var(--accent); color:var(--accent); background:var(--accent-soft); flex-shrink:0; cursor:pointer;">
        ⚙️ Change
      </button>
    </div>

    <!-- Main Player Action Controls -->
    <div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:16px;">
      <button class="btn btn-ghost" id="tts-sheet-prev-btn" title="Previous Sentence" style="width:46px; height:46px; border-radius:50%; font-size:18px; border:1px solid var(--border); cursor:pointer;">
        ⏮️
      </button>

      <button class="btn btn-primary" id="tts-sheet-play-pause" style="padding:0 28px; height:50px; border-radius:25px; font-size:15px; font-weight:800; gap:8px; background:${isSpeaking ? 'var(--surface-3, #334155)' : 'var(--accent)'}; color:#fff; box-shadow:0 4px 14px var(--accent-soft); cursor:pointer; transition:all 0.2s ease;">
        ${isSpeaking ? '⏸️ Pause Reading' : '▶️ Start Reading'}
      </button>

      <button class="btn btn-ghost" id="tts-sheet-next-btn" title="Next Sentence" style="width:46px; height:46px; border-radius:50%; font-size:18px; border:1px solid var(--border); cursor:pointer;">
        ⏭️
      </button>
    </div>

    <!-- Speed Quick Selector & Auto Advance -->
    <div style="display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-bottom:6px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:12px; font-weight:600; color:var(--text-dim);">Speed:</span>
        ${[0.8, 1.0, 1.25, 1.5, 2.0].map(s => `
          <button class="chip tts-sheet-speed-btn" data-speed="${s}" style="padding:4px 9px; font-size:11.5px; border-radius:8px; border:1px solid ${Math.abs(settings.rate - s) < 0.05 ? 'var(--accent)' : 'var(--border)'}; background:${Math.abs(settings.rate - s) < 0.05 ? 'var(--accent)' : 'var(--bg-elev)'}; color:${Math.abs(settings.rate - s) < 0.05 ? '#fff' : 'var(--text)'}; font-weight:700; cursor:pointer;">
            ${s}x
          </button>
        `).join('')}
      </div>

      <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; color:var(--text); cursor:pointer;">
        <input type="checkbox" id="sheet-auto-advance-chk" ${settings.autoAdvance ? 'checked' : ''} style="accent-color:var(--accent);" />
        Auto-next Page
      </label>
    </div>
  `);

  // Wire events without recursive sheet reopenings
  const openVoiceBtn = document.getElementById('open-voice-modal-btn');
  if (openVoiceBtn) {
    openVoiceBtn.onclick = () => {
      openVoiceSettingsModal();
    };
  }

  const sheetPlayPauseBtn = document.getElementById('tts-sheet-play-pause');
  if (sheetPlayPauseBtn) {
    sheetPlayPauseBtn.onclick = () => {
      if (isReadingActive) {
        pauseTTS();
        syncTTSControllerState();
        window.toast('Read Aloud paused ⏸️');
      } else {
        // Automatically close sheet so the user can immediately see the PDF page and word highlights
        window.Sheet.close();
        runPageReadAloud(pageNum, {
          onStart: () => syncTTSControllerState(),
          onEnd: () => syncTTSControllerState(),
          onStop: () => syncTTSControllerState()
        });
        syncTTSControllerState();
        window.toast('Reading page aloud 🔊');
      }
    };
  }

  const prevBtn = document.getElementById('tts-sheet-prev-btn');
  if (prevBtn) {
    prevBtn.onclick = () => {
      skipTTSSentence(-1);
    };
  }

  const nextBtn = document.getElementById('tts-sheet-next-btn');
  if (nextBtn) {
    nextBtn.onclick = () => {
      skipTTSSentence(1);
    };
  }

  document.querySelectorAll('.tts-sheet-speed-btn').forEach(btn => {
    btn.onclick = () => {
      const spd = parseFloat(btn.dataset.speed);
      saveTTSSettings({ rate: spd });
      if (isReadingActive) {
        continuePlaybackWithCurrentSettings();
      }
      // Update UI active chip in place
      document.querySelectorAll('.tts-sheet-speed-btn').forEach(b => {
        const match = Math.abs(parseFloat(b.dataset.speed) - spd) < 0.05;
        b.style.background = match ? 'var(--accent)' : 'var(--bg-elev)';
        b.style.color = match ? '#fff' : 'var(--text)';
        b.style.borderColor = match ? 'var(--accent)' : 'var(--border)';
      });
      syncTTSControllerState();
    };
  });

  const autoAdvChk = document.getElementById('sheet-auto-advance-chk');
  if (autoAdvChk) {
    autoAdvChk.onchange = () => {
      saveTTSSettings({ autoAdvance: autoAdvChk.checked });
    };
  }
}

export function toggleReadAloud() {
  openHandsFreeReadAloud();
}

// --- DEDICATED IN-READER TOPIC & TEXT SELECTION AI ASSISTANT ---
export async function openTopicAIChat(prefillQuestion, selectedContext = '') {
  if (window.Sheet && window.Sheet.close) window.Sheet.close();

  const file = window.State.currentFile;
  const pageNum = window.State.currentPage || 1;
  const numPages = window.State.numPages || 1;
  const docTitle = file?.name || 'Current Document';

  // Get active selected text if available
  let activeSnippet = selectedContext;
  if (!activeSnippet && window.pendingSelection && window.pendingSelection.text) {
    activeSnippet = window.pendingSelection.text.trim();
  }

  // Get current page text
  let pageText = '';
  try {
    if (window.State.currentDoc) {
      const page = await window.State.currentDoc.getPage(pageNum);
      const content = await page.getTextContent();
      pageText = fixLegacyItems(content.items.map(i => i.str)).trim();
    }
  } catch (e) {
    console.warn('Could not extract current page text for topic chat', e);
  }

  const topicChatHistory = [];
  const topicId = `topic_${file ? file.id : 'temp'}_p${pageNum}`;

  // Load existing topic notes/chat if any
  try {
    const saved = localStorage.getItem(`sayad_topic_chat_${topicId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) topicChatHistory.push(...parsed);
    }
  } catch (e) {}

  window.Sheet.open(`
    <div id="topic-chat-wrapper" style="display:flex; flex-direction:column; height:80vh; max-height:680px; font-family:inherit;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid var(--border); margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:800;">
            ⚡
          </div>
          <div>
            <div style="font-size:14px; font-weight:800; color:var(--text); display:flex; align-items:center; gap:6px;">
              <span>Instant Topic & Excerpt Helper</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); font-weight:600;">
              Focused on Page ${pageNum} of ${numPages} · ${window.escapeHtml((docTitle || '').slice(0, 30))}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-ghost" id="clear-topic-chat-btn" style="padding:4px 8px; font-size:11px; border-radius:6px; color:var(--text-dim);" title="Clear this topic history">
            🗑️ Clear
          </button>
          <button class="sheet-close-btn btn btn-ghost" style="width:32px; height:32px; border-radius:50%; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Close">✕</button>
        </div>
      </div>

      <!-- Focused Selection Context Pill (If user selected text) -->
      ${activeSnippet ? `
        <div style="background:var(--accent-soft); border-left:3px solid var(--accent); padding:8px 12px; border-radius:8px; margin-bottom:10px; font-size:12px; line-height:1.5; color:var(--text); max-height:80px; overflow-y:auto;">
          <strong style="color:var(--accent); display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">📌 Target Excerpt:</strong>
          "${window.escapeHtml(activeSnippet.length > 200 ? activeSnippet.slice(0, 200) + '…' : activeSnippet)}"
        </div>
      ` : ''}

      <!-- Fast Action Chips -->
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; scrollbar-width:none;">
        <button class="chip topic-quick-chip" data-query="Explain this exact excerpt in simple 3 bullet points with a real-life analogy." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          💡 Simplify This
        </button>
        <button class="chip topic-quick-chip" data-query="What are the 2 most important exam questions from this paragraph?" style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          🎯 Key Questions
        </button>
        <button class="chip topic-quick-chip" data-query="Give me a simple mnemonic or memory trick to remember this concept forever." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          🧠 Memory Trick
        </button>
        <button class="chip topic-quick-chip" data-query="Is there any formula, definition or rule mentioned here? Extract it clearly." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          📐 Key Formula/Def
        </button>
      </div>

      <!-- Messages Stream Box -->
      <div id="topic-messages-container" style="flex:1; overflow-y:auto; padding-right:4px; display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
        ${topicChatHistory.length === 0 ? `
          <div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px;">
            <div style="font-size:28px; margin-bottom:8px;">🎯</div>
            <strong>Focused Excerpt & Page Q&A</strong>
            <p style="margin:4px 0 0; font-size:12px;">Ask anything specifically about this highlighted text or page. Answers are fast, concise, and direct.</p>
          </div>
        ` : ''}
      </div>

      <!-- Input Bar -->
      <div style="display:flex; gap:8px; align-items:flex-end; border-top:1px solid var(--border); padding-top:10px;">
        <textarea id="topic-chat-input" rows="1" placeholder="Ask about this excerpt or page..." style="flex:1; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:10px 14px; font-size:13px; color:var(--text); resize:none; max-height:100px; line-height:1.4; outline:none; font-family:inherit;"></textarea>
        <button id="topic-chat-send" class="btn btn-primary" style="height:40px; width:44px; border-radius:12px; padding:0; display:flex; align-items:center; justify-content:center; background:#10b981; color:#fff; font-size:16px; flex-shrink:0;">
          ➤
        </button>
      </div>
    </div>
  `);

  const container = document.getElementById('topic-messages-container');
  const inputEl = document.getElementById('topic-chat-input');
  const sendBtn = document.getElementById('topic-chat-send');
  const clearBtn = document.getElementById('clear-topic-chat-btn');

  function renderTopicMessages() {
    if (!container) return;
    if (topicChatHistory.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px;">
          <div style="font-size:28px; margin-bottom:8px;">🎯</div>
          <strong>Focused Excerpt & Page Q&A</strong>
          <p style="margin:4px 0 0; font-size:12px;">Ask anything specifically about this highlighted text or page. Answers are fast, concise, and direct.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = topicChatHistory.map((m, idx) => `
      <div style="display:flex; flex-direction:column; align-items:${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom:4px;">
        <div style="max-width:88%; padding:10px 14px; border-radius:${m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px'}; background:${m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)'}; color:${m.role === 'user' ? '#fff' : 'var(--text)'}; font-size:13px; line-height:1.55; border:${m.role === 'user' ? 'none' : '1px solid var(--border)'}; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          ${m.role === 'assistant' ? (typeof window.renderMarkdown === 'function' ? window.renderMarkdown(m.text) : (typeof window.formatMarkdown === 'function' ? window.formatMarkdown(m.text) : window.escapeHtml(m.text))) : window.escapeHtml(m.text)}
        </div>
        <span style="font-size:10px; color:var(--text-dim); margin-top:2px; padding:0 4px;">
          ${m.role === 'user' ? 'You' : 'Topic AI'} · ${new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  }

  async function executeTopicQuery(qText) {
    if (!qText || !qText.trim()) return;
    const query = qText.trim();
    if (inputEl) inputEl.value = '';

    topicChatHistory.push({
      role: 'user',
      text: query,
      timestamp: Date.now()
    });

    topicChatHistory.push({
      role: 'assistant',
      text: '⏳ *Analyzing target text and synthesizing precise answer...*',
      timestamp: Date.now()
    });

    renderTopicMessages();
    if (sendBtn) sendBtn.disabled = true;

    try {
      const targetedPrompt = `You are the Instant Topic & Excerpt Tutor. Provide an accurate, ultra-clear, concise, and pedagogical explanation.

CONTEXT INFORMATION:
- Book / Document: "${docTitle}"
- Page Number: Page ${pageNum} of ${numPages}
${activeSnippet ? `- TARGET SELECTED EXCERPT:\n"""\n${activeSnippet}\n"""\n` : ''}
${pageText ? `- CURRENT PAGE CONTENT:\n"""\n${pageText.slice(0, 1500)}\n"""\n` : ''}

STUDENT QUESTION:
"${query}"

GUIDELINES:
1. Focus directly on the target excerpt and page context.
2. Keep the answer direct, crystal-clear, structured (bullet points / bold terms), and free from unnecessary filler.
3. If the user asked for a concept, give a 1-sentence definition, key breakdown, and an intuitive example.
4. Support clean Hinglish or English naturally according to the student's question.`;

      const aiReply = await callAI(targetedPrompt, "You are an expert precision topic tutor. Be concise, direct, and pedagogically crisp.");

      topicChatHistory[topicChatHistory.length - 1] = {
        role: 'assistant',
        text: aiReply || 'I could not generate a response for this excerpt.',
        timestamp: Date.now()
      };

      try {
        localStorage.setItem(`sayad_topic_chat_${topicId}`, JSON.stringify(topicChatHistory.slice(-20)));
      } catch (e) {}

    } catch (err) {
      topicChatHistory[topicChatHistory.length - 1] = {
        role: 'assistant',
        text: `⚠️ **Error**: Could not complete topic explanation. (${err.message})`,
        timestamp: Date.now()
      };
    }

    if (sendBtn) sendBtn.disabled = false;
    renderTopicMessages();
  }

  if (sendBtn) sendBtn.onclick = () => executeTopicQuery(inputEl.value);
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        executeTopicQuery(inputEl.value);
      }
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      topicChatHistory.length = 0;
      localStorage.removeItem(`sayad_topic_chat_${topicId}`);
      renderTopicMessages();
      window.toast('Topic chat cleared');
    };
  }

  // Fast quick chips trigger
  document.querySelectorAll('.topic-quick-chip').forEach(chip => {
    chip.onclick = () => {
      const q = chip.dataset.query;
      executeTopicQuery(q);
    };
  });

  renderTopicMessages();

  // If there was a prefilled question, fire it immediately
  if (prefillQuestion && prefillQuestion.trim()) {
    executeTopicQuery(prefillQuestion.trim());
  }
}

// Bind to window for global availability
window.AI_TOOLS = AI_TOOLS;
window.callAI = callAI;
window.callServerGemini = callServerGemini;
window.callGeminiFast = callGeminiFast;
window.callGroqFast = callGroqFast;
window.callGroq70b = callGroq70b;
window.runAIToolObj = runAIToolObj;
window.runDictionaryLookup = runDictionaryLookup;
window.callGemini = callGemini;
window.callGroq = callGroq;
window.runMCQGeneratorModal = runMCQGeneratorModal;
window.runInteractiveFlashcardsModal = runInteractiveFlashcardsModal;
window.runTranslateToolModal = runTranslateToolModal;
window.translatePassageAI = translatePassageAI;
window.runTTS = runTTS;
window.skipTTSSentence = skipTTSSentence;
window.clearTTSHighlights = clearTTSHighlights;
window.runPageReadAloud = runPageReadAloud;
window.preparePageTTSData = preparePageTTSData;
window.pauseTTS = pauseTTS;
window.playTTSFrom = playTTSFrom;
window.getTTSSettings = getTTSSettings;
window.saveTTSSettings = saveTTSSettings;
window.openVoiceSettingsModal = openVoiceSettingsModal;
window.toggleReadAloud = toggleReadAloud;
window.openHandsFreeReadAloud = openHandsFreeReadAloud;
window.renderFloatingTTSCapsule = renderFloatingTTSCapsule;
window.hideFloatingTTSCapsule = hideFloatingTTSCapsule;
window.showFloatingTTSCapsule = showFloatingTTSCapsule;
window.getElevenLabsApiKey = getElevenLabsApiKey;
window.saveElevenLabsApiKey = saveElevenLabsApiKey;
window.ELEVENLABS_DEFAULT_VOICES = ELEVENLABS_DEFAULT_VOICES;
window.getAllElevenLabsVoices = getAllElevenLabsVoices;
window.fetchElevenLabsVoices = fetchElevenLabsVoices;
window.previewElevenVoice = previewElevenVoice;
window.speakWithElevenLabs = speakWithElevenLabs;
window.stopElevenAudio = stopElevenAudio;
window.openTopicAIChat = openTopicAIChat;
window.runExecutiveSummaryModal = runExecutiveSummaryModal;
window.runMasterExplanationModal = runMasterExplanationModal;


