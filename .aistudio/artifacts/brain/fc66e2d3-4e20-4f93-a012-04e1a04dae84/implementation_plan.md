# Board-Standard Chunked Quiz Generator & Multi-Tier Subjective Paper Architecture

A complete diagnostic exam upgrade introducing concurrent sectioned batch generation (5-question chunks) to eliminate output token starvation, genuine Board Exam competency standards (CBSE/NIOS analytical depth across Easy, Medium, and Hard), and restructured Board Theory & Subjective Question Papers featuring balanced Short (2M), Medium (3–4M), and Long (5–6M) analytical questions with marking rubrics.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed during interactive clarification and govern this implementation:

- **Confirmed Decision 1 (Renamed Format)**: The former "Short Answer" format is rebranded to **"Board Theory & Subjective Paper (Short, Medium & Long Answers)"** to reflect authentic board examination question papers.
- **Confirmed Decision 2 (Multi-Tier Question Distribution)**: Subjective tests are structured with an equal distribution across 3 distinct question tiers:
  - **Short Answer (2 Marks • 30–40 words)**: Core concept definitions, direct textual facts, 2 distinct marking points.
  - **Medium Answer (3–4 Marks • 60–80 words)**: Structured explanations, character analysis, cause-and-effect reasoning with 3–4 points.
  - **Long Answer (5–6 Marks • 100–120 words)**: Thematic extrapolation, comparative evaluation, critical literary analysis or multi-step scientific derivation.
  - *Distribution matrix*:
    - **5 Qs**: 2 Short (2M) · 2 Medium (3-4M) · 1 Long (5-6M)
    - **10 Qs**: 4 Short (2M) · 3 Medium (3-4M) · 3 Long (5-6M)
    - **15 Qs**: 5 Short (2M) · 5 Medium (3-4M) · 5 Long (5-6M) *(1/3 equal split)*
    - **20 Qs**: 7 Short (2M) · 7 Medium (3-4M) · 6 Long (5-6M)
    - **25 Qs**: 8 Short (2M) · 8 Medium (3-4M) · 9 Long (5-6M)
- **Confirmed Decision 3 (Concurrent 5-Question Chunking Pipeline)**: To eliminate the root cause of degraded quality and sentence copy-pasting when generating 10–25 questions:
  - The chapter is split into proportional logical sections (Introduction/Setup, Core Developments, Climax/Advanced Applications, Conclusions/Exercises).
  - High question sets ($\ge 10$) execute as **concurrent 5-question batch workers** with a live progress counter (e.g. `Synthesizing Batch 2/4: Core Section pp. 170–178 (10/20 Qs completed)…`).
  - Merged into a pristine numbered test paper with zero JSON truncation or sentence-slicing fallbacks.
- **Confirmed Decision 4 (Board-Level Difficulty Calibration)**:
  - Verbatim sentence copying is strictly prohibited in prompt instructions.
  - **Easy**: Factual comprehension, central plot/topic understanding, straightforward terminology in context.
  - **Medium**: Interpretive and analytical questions requiring multi-point synthesis and cause-and-effect understanding.
  - **Hard**: Deep critical thinking, evaluating motives, subtext analysis, high-order thinking skills (HOTS), and subtle distractor discrimination in Assertion-Reasoning and MCQs.

---

### 1. Overview & Core Concept

- **The Problem**: 
  1. Requesting 15 to 25 questions with rich JSON schemas (options, explanations, distractor analysis, exam traps) in a single monolithic LLM call exceeded output token limits or resulted in JSON truncation, which triggered a crude sentence-slicing fallback that merely lifted raw lines from the book.
  2. The "Short Answer" mode only provided single-sentence answers without the structural variety (short, medium, and long analytical) required for Board examination preparation.
- **The Solution**: 
  1. A multi-worker **Concurrent Chunk Generation Pipeline** that generates sets in high-fidelity 5-question batches mapped to distinct chapter sections, with live visual progress feedback.
  2. A dedicated **Board Theory & Subjective Examination Paper** format with clear marks badges (`[ 2 MARKS ]`, `[ 3-4 MARKS ]`, `[ 5-6 MARKS ]`), word limits, and structured marking keys.
  3. Strict Board-exam prompt framing enforcing competency-based questions, eliminating surface trivia and verbatim quote dumps.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Configuring a Board-Standard Chapter Test**:
   - The student opens the Quiz Generator from the reader action menu or bottom sheet.
   - Scope is set to `📖 Entire Chapter` (e.g. *Ch-8: The Necklace (pp. 161–194)*).
   - Format: Selects **Board Theory & Subjective Paper (Short, Medium & Long Answers)**, **Multiple Choice**, or **Assertion & Reasoning**.
   - Count: Selects **10**, **15**, **20**, or **25** questions.
   - Difficulty: Selects **Easy**, **Medium**, or **Hard**.
   - Taps **"⚡ Generate High-Yield Quiz"**.

2. **Watching Real-Time Batch Progress**:
   - The modal displays an animated multi-stage progress meter:
     ```
     ┌─────────────────────────────────────────────────────────────┐
     │  ⚡ Synthesizing 20 Board-Level Questions (Hard)           │
     │  Ch-8: The Necklace MODULE - 8 (pp. 161–194)                │
     │                                                             │
     │  [████████████████████░░░░░░░░░░░░] 60%                     │
     │  Batch 3 of 4: Climax & Resolution (pp. 182–190)             │
     │  15 / 20 Questions Verified & Formatted                     │
     └─────────────────────────────────────────────────────────────┘
     ```

3. **Reviewing and Practicing the Paper**:
   - **MCQs & Assertion-Reasoning**: Interactive options with instant feedback, distractor analysis, and Board trap warnings.
   - **Board Theory & Subjective Paper**:
     - Questions are grouped or badged with their official weightage:
       - `Q1. [2 MARKS • SHORT]` (30–40 words)
       - `Q5. [3-4 MARKS • MEDIUM]` (60–80 words)
       - `Q9. [5-6 MARKS • LONG]` (100–120 words)
     - Self-assessment buttons with marks allocation (`+2 Full Marks`, `+1 Partial`, `0 Revise`).
     - Tapping **"💾 Save Quiz to Notes"** saves the entire structured paper with marks, model answers, and rubrics.

#### Visual Architecture & Styling
- **Clean Typography**: Uses the app's established font system with crisp monospace metadata (`font-mono`) for marks badges and question indices.
- **Marks Badges**: Subtle unboxed micro-badges (`bg-surface-2 text-accent border border-border text-xs px-2 py-0.5 rounded`).
- **No Static Pill Enclosures**: Adheres to the frontend design constitution with quiet, high-legibility typographic metadata.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Sectional Text Partitioning for Parallel Batches**
  - *Chosen Approach*: When generating 15–25 questions across a multi-page chapter, partition the extracted chapter text into 3 to 5 overlapping chronological sections (e.g., Section 1: pp. 161–168, Section 2: pp. 169–176, Section 3: pp. 177–185, Section 4: pp. 186–194). Dispatch prompt workers concurrently, each generating exactly 5 questions from its respective section.
  - *Why*: Guarantees that questions test the entire story/chapter from beginning to end, prevents output token depletion, avoids JSON truncation, and speeds up total generation time by 2.5x through parallelism.
  - *Alternatives Considered*: Single prompt asking for 25 questions (failed due to token limits and fallback to verbatim line copying).

- **Decision 2: Re-architecting Fallback Logic**
  - *Chosen Approach*: If an individual 5-question batch fails to parse, retry that specific 5-question batch once with a simplified prompt. Only as a last resort, generate clean concept questions rather than slicing and dumping raw text sentences.
  - *Why*: Completely eliminates the user-reported bug where raw book lines were pasted directly into questions.

- **Decision 3: Tiered Subjective Paper Structure**
  - *Chosen Approach*: Instead of one generic "Short Answer" box, generate a balanced paper containing Short (2M), Medium (3-4M), and Long (5-6M) questions with clear mark rubrics and word count guidelines.
  - *Why*: Matches real CBSE / NIOS Board examination patterns and teaches students how to structure answers for different mark weightages.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌─────────────────────────────────────────────────────────────┐
│                 Full Chapter Content (pp. 161–194)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     Sectional Chunker         │   │   Batch Coordinator (ai.js)   │
│  - Chunk 1: Exposition & Setup│   │   - Batch 1: 5 Questions      │
│  - Chunk 2: Core Mechanism    │   │   - Batch 2: 5 Questions      │
│  - Chunk 3: Crisis / Climax   │   │   - Batch 3: 5 Questions      │
│  - Chunk 4: Resolution/Summary│   │   - Batch 4: 5 Questions      │
└───────────────┬───────────────┘   └───────────────┬───────────────┘
                │                                   │
                ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│           Concurrent Gemini AI Workers (Promise.all)        │
│    - Batch 1: Q1..Q5   (Short + Medium)                     │
│    - Batch 2: Q6..Q10  (Short + Medium)                     │
│    - Batch 3: Q11..Q15 (Medium + Long)                      │
│    - Batch 4: Q16..Q20 (Long Analytical)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Merged & Verified Exam Paper                │
│  - Re-indexed Q1 .. Q20                                     │
│  - Tier Badges: [2 Marks], [3-4 Marks], [5-6 Marks]         │
│  - Live Interactive Grading & Notes Persistence             │
└─────────────────────────────────────────────────────────────┘
```

#### Key Implementation Changes
1. **`src/ai.js` (`generateQuizInChunks` & Batch Pipeline)**:
   - Implement `generateQuizInChunks(targetText, scopeTitle, formatMode, totalCount, difficulty, targetPage, onProgress)`:
     - Calculates batch count $N = \lceil totalCount / 5 \rceil$.
     - Slices chapter text into $N$ representative overlapping zones.
     - For Subjective papers, calculates tier distribution (Short, Medium, Long) according to the confirmed equal-split matrix.
     - Runs batches concurrently via `Promise.allSettled` with individual error handling and retry.
     - Reports progress after each completed batch to update the modal progress bar.
     - Flattens, re-indexes, and validates the final question array.
2. **`src/ai.js` (`runMCQGeneratorModal`)**:
   - Update format dropdown label: `Board Theory & Subjective Paper (Short, Medium & Long Answers)`.
   - Update modal loading UI with live multi-batch progress bar and section indicators.
   - In Subjective mode, render marks badges (`[2 MARKS • SHORT]`, `[3-4 MARKS • MEDIUM]`, `[5-6 MARKS • LONG]`), expected word count hints, and marks-based self-assessment buttons (`+2`, `+4`, `+6`).
   - Remove the mechanical raw-sentence regex slicing fallback.
3. **Prompt Hardening**:
   - Include strict Board Exam directives:
     - Forbid quoting raw sentences as the question.
     - Focus on inferential analysis, character motivations, thematic significance, cause-and-effect, and critical evaluation.
     - Strict difficulty scaling: Easy (direct comprehension), Medium (analytical connection), Hard (evaluative synthesis & HOTS).
