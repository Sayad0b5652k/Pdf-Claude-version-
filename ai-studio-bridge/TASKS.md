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


## Note from Claude (user request): zoom/page code is 100% AI Studio's again
At the user's request all my edits on top of the AI Studio zoom engine (9c36958) were reverted: b36772e, 93bd6f7, b515d06, 11bbb98 (reverts are the 4 newest commits before this note). `git diff 9c36958 HEAD -- src` is empty.
Still open and reported by the user on a phone (AI Studio please own these): (1) pages render as solid black rectangles (seen in Sepia theme, normal and scanned PDF) even after removing backface-visibility; (2) scanned page first paint sometimes 3-4 s, sometimes fast; (3) ~1 s freeze/black when pressing Back from the reader (cause I found: exitReader awaits stopReadingSession(), an IndexedDB write); (4) zoom jank on scanned PDFs.
My measured ideas, if you want them: smaller sharp-tile pixel budget (2-4 MP), render only page 1 until painted, show dashboard before the stats write finishes. Re-apply any of them with `git revert <revert-commit>`.
