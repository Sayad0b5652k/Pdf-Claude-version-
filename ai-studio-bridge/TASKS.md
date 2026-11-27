# Tasks for AI Studio (written by Claude)

Run these in the live preview with the real Gemini key in Secrets. Fill in a report in `reports/`.
Only the Gemini key is needed. No Tavily/Firecrawl.

## 1. Book chat tone and memory
Open any PDF -> Chat. Ask: "photosynthesis kya hota hai", then "iska formula?", then "theek hai".
Expected: short natural Hinglish answers (not long lectures), "iska" understood from the previous turn,
"theek hai" answered like a person (not a canned line). Three follow-up chips appear under the chat and no
`[[FOLLOWUPS` text is visible anywhere.

## 2. Question from the middle of a long chapter
Use a PDF with a chapter of 12+ pages. Ask about something that is only in the middle of that chapter.
Expected: the answer is correct and cites that page as a tappable `Page N` chip that jumps to it.

## 3. Quiz mode
In chat tap "Quiz me". Answer 5 questions (get at least 2 wrong).
Expected: one question at a time, feedback with page chip, "Final score: X/5", then a
"Add N cards to Review" chip. Tap it and check Review has the new cards (category "Quiz mistakes").
Also check the quiz questions really come from the book (not general knowledge).

## 4. Live web search (Google Search grounding)
The globe button shows in the chat input when a Gemini key exists. Turn it on and ask: "aaj ki latest India news".
Expected: answer uses fresh info and ends with a `Sources:` line with working links.

## 6. Reader on a long book
Open a PDF with 300+ pages. Fling-scroll fast, then jump to the last chapters from the TOC.
Expected: pages are never blank for more than a moment and the page counter matches the jump.

## 7. In-PDF search
Search a word that appears many times. Expected: results grouped by chapter, tap one -> the word (only the
word) is highlighted, bottom bar shows "n / total", arrows move between matches.

## 8. Image requests (real Wikipedia / web)
Ask: "Mahatma Gandhi ki photo dikhao", "photosynthesis ka diagram dikhao", "India ka map dikhao".
Expected: the image matches the subject (never a different topic). If Wikipedia has nothing, an honest
"reliable image nahi mili" message. Report any wrong-subject image with the exact prompt.

## 9. Chat quiz request + Exam plan
In book chat type "Mujhse quiz pucho". Expected: no AI call; a short message with a "Quiz Generator kholo" button that opens the generator.
Home -> Reading Analytics card -> "Exam plan" chip flips it. Tap "Plan banao": pick 2 books, an exam date for each, check the chapters list (TOC se for books with a TOC, "pages ke blocks" otherwise), Save.
Expected: today's checklist with chapters from both books; ticking a row strikes it through and the progress bar moves; "Quiz" on a row opens the book and the Quiz Generator.

## 10. Failed reply -> Retry
Turn on airplane mode (or use a wrong Gemini key), send a chat message.
Expected: a clear error message and a "Retry" button. Fix the network/key, tap Retry: the answer arrives, the question is not duplicated.

## 11. Text selection bar (touch device only)
In the reader long-press a word and drag the handles over 2-3 lines.
Expected: a small bar (colour dots, underline, note, "Ask AI", "...") appears right below the selection - not half the screen.
Tap a colour dot: highlight applied in one tap. Tap "Ask AI" -> chips row -> "Explain": the result opens as a lower sheet
(about 45% height) and the PDF page above stays visible and scrollable; tap the sheet handle to expand/collapse.
"..." must open the old full card with every original button. Reader > Advanced > "Selection Panel Style" switches between COMPACT and CLASSIC.
Report any case where the bar overlaps the selection handles or goes off screen.

## 12. Settings page
Open Settings. Expected order: Appearance, Reading, Pro Design Theme, AI Engine, AI Response, Storage, Backup, App Updates, App Installation, About.
Nothing overlaps, "Full meaning, QR & app link" and "Credits" collapse/expand. Report anything cramped.

## 13. Re-imported exported PDF: deleted highlight/underline must NOT come back (new fix, Claude)
Cause: an exported PDF holds each highlight/underline twice (real PDF annotation + our editable record). Delete removed only ours; pdf.js drew the real one again.
Fix: on import (and once on first open of older imports) the real duplicates that belong to our payload are stripped from the stored bytes (`stripNativeSayadAnnots` in src/annot_export.js, flag `nativeStripped`).
Test in live preview: highlight + underline a few lines -> Share/Export annotated PDF -> import that PDF again -> open it -> Reject/Delete a highlight and an underline -> go to another page and back, close and reopen the book.
Expected: deleted marks stay gone, kept marks still show once (not doubled). Also test a PDF annotated in another PDF app: its own marks should still show (we only strip ones with our ids).

## 14. Zoom / theme / double-tap round (Claude)
a) Reader: start Read Aloud, then pinch-zoom in/out: the yellow word/sentence highlight must stay (it re-attaches after the page re-renders).
b) Zoom in/out with highlights, underlines and a freehand drawing on the page: they must stay glued to the text, no jump (marks now use % positions; drawing canvas re-fits right after zoom).
c) Change Day/Night/Sepia from Settings and from the reader's "Reading Themes" sheet: sweep now lasts about 1.2-1.4 s and is smoother (gentler easing). Report if it stutters on a slow phone.
d) Advanced > Double-Tap Page Action: "AI Explain" was removed (did nothing). New: "Read Aloud" and "Light / Dark Toggle". Old saved value is migrated to Read Aloud.

## 14b. Zoom engine change (Claude) - please test on the slowest phone you have
Pinch zoom no longer rebuilds the whole page: bitmap is stretched by CSS, text layer/marks/drawings stay, and only the visible area is repainted sharp (tile system). Test: pinch in/out many times on a long PDF (continuous and single-page mode), with highlights, a drawing and Read Aloud running.
Expected: no flicker/jump, text stays selectable, sharp text within ~0.3 s of releasing the pinch. Report any page that stays blurry after scrolling to it while zoomed.

## 15. Anything else that looks broken
List it with steps and a screenshot description.

## Note from Claude: scan-zoom tuning on top of the AI Studio zoom engine (separate commit, revert with `git revert <hash>`)
Changes only in src/reader.js: (1) sharp tile pixel budget 2/3/4 MP by tier (was MAX_CANVAS_PIXELS 4/6/8 MP), (2) tile overscan pads [0.2,0.1,0], (3) removed permanent `will-change:transform` on the page container (translate3d during pinch/animation promotes it anyway).
Headless A/B (4x CPU throttle): 40-page scan zoom-in worst frame 246 -> 155 ms, slow frames 5 -> 2; 80-page text zoom-in 164 -> 86 ms. Markup-on case unchanged. Please check on a phone: scanned PDF, pinch to 3x, scroll while zoomed; tell me if text looks softer or tiles pop late while scrolling.

## Note from Claude: faster first page on big scans (own commit, revert with `git revert <hash>`)
src/reader.js: until the first page of a newly opened book is painted, only ONE page renders (`firstPagePainted`); parallel rendering resumes right after. Headless 4x CPU, 12-page scan with 3.8 MB JPEG per page: open -> first painted ~2.1 s -> ~1.5 s. Zoom tile time unchanged once idle.
OPEN, NOT REPRODUCED: user reports a weird black screen after going back from the PDF (phone). Headless: button back and history.back() both fine, in light and dark, even right after a theme change. AI Studio: please check in the live preview (scanned PDF, zoomed in, then back; also with Privacy Lock / pro themes) and describe what you see.
Also reported: page render sometimes 3-4 s, sometimes fast (intermittent) on scanned PDFs.

## Note from Claude: back from reader no longer freezes/black (own commit, revert with `git revert <hash>`)
Cause: exitReader awaited stopReadingSession() (IndexedDB write, ~1 s on phones when the DB queue is busy) while the reader stayed frozen; pages went black. Now: the save runs in the background (`window._statsFlushPromise`; getReadingStats() waits for it, so dashboard numbers stay correct), the dashboard renders first, page canvases are freed in a following task (skipped if a book was reopened meanwhile).
Headless 4x CPU: view switch 248 ms -> 9 ms, dashboard on screen 310-348 ms -> 133 ms.
Please test on phone: read ~1 min, press back (button AND phone gesture), check Reading Analytics shows the new time without needing to reopen the app.

## Note from Claude: BLACK PAGES on phone (user screenshots, sepia theme, both a normal and a scanned PDF)
Pages show as solid black rectangles (page marks still visible on top). Suspect: `.page-wrap canvas { backface-visibility: hidden }` (added with the zoom engine commit 9c36958) + the theme `filter` (sepia/dark) = one GPU layer per page bitmap -> phone GPU memory exhausted -> black canvases. Removed that one line (own commit, revert with `git revert <hash>`). I cannot reproduce black in headless (no real GPU), so AI Studio please check in the live preview on the phone: open a 12+ page scanned PDF in Sepia and in Dark, scroll, zoom, go back. If still black: tell me which theme/PDF; next suspects are `.page-tile` double buffering (2 big canvases per page) and TILE_MAX_DPR 3.5.




## 16. DISCUSSION (Claude -> AI Studio): which FREE APIs should the app use? Please answer in a report
User wants a big upgrade today. Constraint stays: **no paid services, keep the app lean, never put keys in the repo/client** (BYOK via keyvault + server env is fine). You have the real keys and a live preview, so please TEST the claims below instead of trusting web pages, and answer with PASS/FAIL/NOT TESTED.

Where we are today (from reading server.ts): text = Gemini (`gemini-3.1-flash-lite`) with Groq + OpenRouter as BYOK/fallback; `detectProvider()` already recognises `csk-` (Cerebras) keys; images = `/api/ai/image` tries Wikimedia first, then OpenRouter `google/gemini-2.5-flash-image`; no web-search provider yet.

Candidates and what public pages say (they CONFLICT, so verify with your own key; limits change often):
- **Cerebras** (very fast inference). One tracker (Nov 2026) says free ~1M tokens/day, 30 RPM, no training on data, no card; another says a $5 trial that expires in 30 days and needs a verified payment method. -> Please check: does a fresh free key work today without a card, and what is the real daily limit? Good for: chat tutor, quiz/flashcards (fast streaming).
- **Mistral** (La Plateforme "Experiment" tier). One source says ~1B tokens/month free but only if you accept training on your data; another says no free API / billing activation needed. -> Please check on a real key. Privacy matters (user study notes), so if free = "trained on your data" we should either skip it or make it opt-in with a clear toast.
- **Groq** (already in the app): about 30 RPM / 1,000 requests per day on gpt-oss-120b, no card. Keep as fast fallback.
- **Tavily** (web search API, for "search the web" in the tutor / current-affairs notes / fact-check): I could not confirm its free quota from the sources I read. Please check the dashboard: how many free credits per month, and is a card needed? Idea: one `/api/web-search` endpoint, used only when the user asks or the answer needs fresh facts, results cached, hard monthly counter so we never exceed free credits.
- **Images**: Cloudflare Workers AI (FLUX-class models, ~10,000 "neurons"/day free, no card, no training) looks like the best free generator; Pollinations is keyless but slow (~1 request per 30 s) and unreliable; Gemini image on the Google free tier trains on data outside the EEA. Keep Wikimedia first (real textbook media), then ONE free generator as fallback.

What I need from you (answer each in the report):
1. For every provider above: PASS/FAIL that a free key works today, the real RPM/day limit you hit, and whether a card was needed.
2. Proposed routing table: task (chat, quiz, flashcards, summary, dictionary, translate, OCR cleanup, web search, image) -> primary provider -> fallback. Prefer the fastest free model for streaming chat, Gemini for long-context PDF work.
3. How to keep user keys safe: BYOK only in keyvault, server never logs keys, per-provider daily counters in the UI ("Cerebras 120/1000 today") so the user sees when a free tier is almost used up.
4. A single provider-adapter module (one function `callLLM({task, prompt, stream})`) so adding a provider is ~30 lines; please do NOT scatter provider code through study_core.js/teacher.js.
5. Anything you recommend we do NOT add (keeps the app lean).
Do not start building until the user confirms the routing table. Claude will review the adapter code afterwards.


## 17. Note from Claude: service-worker cache fix (own commit 7783850, revert with `git revert 7783850`) + 1 question
**What was wrong:** the startup script in `index.html` deleted every Cache Storage entry except one hard-coded name (`sayad-v43-...`). When `CACHE_NAME` in `public/sw.js` moved to v44 the two names stopped matching, so every online page load deleted the live offline cache and a cold offline launch failed (`net::ERR_FAILED`). Found by killing the server in a headless test: cache entries went 43 -> 15 -> 0 across reloads.
**Fix:** `index.html` now deletes only caches that do NOT start with `sayad-` (the SW's own `activate` step already removes older sayad versions). `CACHE_NAME` is now `sayad-v45-offline-fix`.
**Please keep:** when you bump `CACHE_NAME`, edit only `public/sw.js` and keep the `sayad-` prefix. Do not put a hard-coded cache name back into `index.html`. If your local `index.html` still has the old `k !== 'sayad-v43-...'` line, take the new one when you rebase.
**Low priority, not changed:** `forceAppUpdateAndRefresh` (`src/pwa.js`) deletes ALL caches, including the new service worker's fresh precache, then reloads; the precache is only rebuilt on the next cold start. If you want it fixed: after the purge, when online, call `reg.unregister()` on each registration so the reload re-installs the SW and precaches again.
**Question for section 16:** earlier builds removed Tavily/Firecrawl because their keys could not be set in AI Studio Secrets. In your report, please say whether a Tavily key can be set there now. If not, Tavily has to be BYOK through keyvault, or we skip it.


## 18. Note from Claude: password-protected PDFs now open (own commit, revert with `git revert`)
Import used to refuse them. Now: password popup on import (asks again if wrong, skips on cancel), reader unlock screen improved. Password is kept in memory only (never stored). `src/pdf_password.js` wraps `window.pdfjsLib` in a Proxy so every `getDocument` of an unlocked book gets its password automatically; please do not remove it. Locked books carry `encrypted: true` and a generated cover; page tools / merge / annotated share show "password protected" instead of failing (pdf-lib cannot read encrypted files). Please test on a real phone with a real protected PDF.


## 19. Note from Claude: Classroom / split-screen fixes (2 own commits, revert with `git revert <hash>`)
**Bugs fixed (tested with a mocked lesson API, no real key available to me):**
1. Back button with a drawer open (Subs / Boards / Doubt / menu) closed the whole classroom. Now Back closes only the drawer (`closeClassroomDrawer()` in `classroom_view.js`, used in the `popstate` handler in `app.js`).
2. `openFullClassroom` called twice quickly built two stages (it awaits page text). It now carries an `openSeq` token; a newer open or an exit cancels the older one.
3. When the lesson could not be made the board stayed empty with "Preparing studio board..." and a raw server message. Now a card ("Teacher couldn't start" + Try again / Back to book) with a plain-language reason (`friendlyLessonError` in `lesson_engine.js`, also used by the split-screen panel). A failed later concept is retried once quietly, then its stepper tab shows a retry arrow.
**Teaching content:** `src/lesson_facts.js` finds every formula and date of the page by itself (no AI). `LessonEngine._addMissingFacts` adds an `equation` / `timeline` / `callout` cue for any formula or date the AI forgot (cues are flagged `_auto: true`). The server prompt now demands: write what you say, in the order you say it; cover the whole page in order; every formula/date copied exactly, written and read aloud; 6 to 9 cues per concept; concept count follows page length (3 to 6) and `sourceSentenceIds` must list every sentence a concept teaches.
**Screen use:** the board writes each item in proportion to its size, one after another. Wide screens (landscape / tablet / desktop) show two board columns (`arrangeForScreen`, `board.viewW`); on any screen short boards stretch their gaps to fill the height. The subtitle band is capped at 3 lines (2 on short screens) because a paused lesson used to show the whole spoken text and hide the board. Landscape phones hide the stepper row. Split-screen panel: chip strip is one scrollable row and the language picker is inline, so the board gets about twice the height.
**Please keep:** the `openSeq` guard, the drawer-first Back handling, and `_auto` cues. Cue renderers were not touched; column 2 is only a `translate` on the cue group. Please test with a real key on a real phone: long pages (6 concepts), Hindi pages, and a page with many dates.
