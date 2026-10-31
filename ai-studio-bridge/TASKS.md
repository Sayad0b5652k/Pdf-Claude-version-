# Tasks for AI Studio (written by Claude)

Run these in the live preview with the real Gemini key in Secrets. Fill in a report in `reports/`.
Optional keys: `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` (task 4 and 5 only if they are set).

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

## 4. Live web search (only if TAVILY_API_KEY is set)
The globe button should appear in the chat input. Turn it on and ask: "aaj ki latest India news".
Expected: answer mentions live results and ends with a `Sources:` line with working links.
Also check: with the button OFF, asking "latest iPhone price" still triggers web search automatically.
If no key is set, the globe button must NOT be visible - report whether that holds.

## 5. Link reading (only if FIRECRAWL_API_KEY is set)
Paste a news article URL into chat and ask "isme kya likha hai". Expected: a summary of that page + a source link.

## 6. Reader on a long book
Open a PDF with 300+ pages. Fling-scroll fast, then jump to the last chapters from the TOC.
Expected: pages are never blank for more than a moment and the page counter matches the jump.

## 7. In-PDF search
Search a word that appears many times. Expected: results grouped by chapter, tap one -> the word (only the
word) is highlighted, bottom bar shows "n / total", arrows move between matches.

## 8. Anything else that looks broken
List it with steps and a screenshot description.
