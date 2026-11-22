# Report 2026-11-22 - Sync, Key Audit & Runtime Fixes

Environment: AI Studio Preview (`http://localhost:3000`, `tsc --noEmit` + `vite build` + `server.ts` live check)
Keys configured in server env (`/api/health`): Primary Gemini key present (`totalKeys: 1`, `isHealthy: true`); `groqConfigured: false`, `openRouterConfigured: false`, `elevenLabsConfigured: false`.

---

## Upstream Sync Status (AI Studio <-> GitHub)

Synced and verified up to upstream commit **`5196b2c`** (`Sayad0b5652k/Pdf-Claude-version-`):
- **`994c951`** — `cleanKeyInput` / `detectProvider` / SEO meta tags / AI Engine `AQ.` + Groq audit fixes.
- **`cec22fb`** — Copied restored binary `.bcmap` files (`CNS2-V.bcmap`, `ETenms-B5-H.bcmap`, `GB-H.bcmap`) + `.gitattributes`. Synced `src/paper_print.js` (`inFrame` hidden-iframe print first, self-printing `.html` download fallback only inside framed/sandboxed previews).
- **`1c2a37e`** — Synced `src/help_guide.js` (36 offline guide entries covering OCR, selection, AI menu/tools, papers, review, notes, plan, home).
- **`3e012a8`** — Synced `src/reader.js`, `src/reader_ocr.js`, `src/help_guide.js`, and `src/index.css` for one-tap `"Saare pages scan →"` batch OCR (`openOcrBatch`, progress pill `#ocr-batch-pill`, pause/stop, wake lock, live text layer). Also added `html[data-pro-theme="notebook"]` styling rules in `src/index.css` for `#ocr-batch-pill` and `.ocrb-opt` to match Notebook theme cards/buttons.
- **`436e6b6`** — Synced `src/annotations_drawing.js` (double-tap text annotation opens `'Edit Text'` / `'Save ✓'` without clearing `downTargetObj` so `mouse:up` doesn't open an empty dialog over it) and `src/index.css` (`#teacher-input` stays borderless inside its outer Notebook pill).
- **`5196b2c`** — Synced `src/help_guide.js` (`reader-tools` updated + added `reader-settings`, `focus`, and `ambient` entries; 39 total offline Help & Guide entries).

---

## `TASKS.md` Verification Status

> Per bridge rules, only what was directly verified in this environment is marked `PASS`; interactive touch/PDF reader scenarios not manually clicked in a live browser are marked `NOT TESTED`.

| Task | Result (PASS / FAIL / NOT TESTED) | Notes |
|------|-----------------------------------|-------|
| 1 Book chat tone & memory | NOT TESTED | Requires interactive PDF chat session in browser preview. Server `/api/health` confirms primary Gemini key is active (`isHealthy: true`). |
| 2 Middle-of-chapter question | NOT TESTED | Requires live browser test with a 12+ page PDF chapter. |
| 3 Quiz mode | NOT TESTED | Requires live browser test in Book Chat. |
| 4 Live web search | NOT TESTED | Requires live browser test with globe toggle. |
| 5 Link reading (in `TEMPLATE.md`, omitted in `TASKS.md`) | NOT TESTED | Note: `TASKS.md` skips #5 (jumps from #4 to #6). |
| 6 Reader on a long book | NOT TESTED | Requires 300+ page PDF scroll/fling test in browser. |
| 7 In-PDF search | NOT TESTED | Requires live PDF search test in browser. |
| 8 Image requests | NOT TESTED | Requires live Wikipedia/web image queries in browser chat. |
| 9 Chat quiz request + Exam plan | NOT TESTED | Requires live browser interaction. |
| 10 Failed reply -> Retry | NOT TESTED | Requires toggling network / invalid key in live browser chat. |
| 11 Text selection bar (touch device) | NOT TESTED | Requires touch device long-press selection over 2–3 lines. |
| 12 Settings page | NOT TESTED | Code audit of `src/views_other.js` shows main Settings order is: Help & Guide, Appearance, Reading mode, Reading options, Pro Design Theme, Performance, Storage, Backup, Advanced (contains AI Engine, AI Response Style, Privacy Lock, Storage Cleaner, Reset App), About S.A.Y.A.D., App Updates & Refresh, App Installation. Live visual overlap/collapse check still needs browser inspection. |

### Additional Runtime Checks Executed (`PASS`)
- **`npm run lint` (`tsc --noEmit`)**: `PASS` (0 errors).
- **`npm run build` (`vite build` + `esbuild server.ts`)**: `PASS`.
- **`GET /`**: `PASS` (HTTP `200`).
- **`GET /api/health`**: `PASS` (`status: "ok"`, `primary-default-key` healthy).
- **`POST /api/keys/check` (`AQ.` dummy key)**: `PASS` (correctly identified as `provider: "gemini"`, routed through Vertex/Google validation, returned clear error `"API key not valid. Please pass a valid API key."`).
- **`POST /api/keys/check` (`gsk_` dummy key)**: `PASS` (correctly identified as `provider: "groq"`, queried Groq `/openai/v1/models` rather than failing on a hardcoded model ID, returned `"Groq ne key reject kar di"`).

---

## Key AI Studio Fixes & Engineering Notes for Claude

1. **`window.fetch` Getter-Only Crash in AI Studio Preview (`src/keyvault.js`)**
   - **Error observed**: `TypeError: Cannot set property fetch of #<Window> which has only a getter` at `src/keyvault.js`.
   - **Cause**: AI Studio's iframe/runtime defines `window.fetch` with a getter-only property descriptor; direct `window.fetch = ...` throws in strict ES modules.
   - **Fix in place**: Wrapped `window.fetch` via `Object.defineProperty(window, 'fetch', { configurable: true, enumerable: true, writable: true, value: wrappedFetch })` inside `try/catch`, with same-origin `/api/` matching.
   - **Request to Claude**: Please keep `Object.defineProperty` when modifying `src/keyvault.js` — never revert to `window.fetch = ...`.

2. **Gemini `AQ.` Keys & Groq Model Verification Audit (`src/keyvault.js`, `server.ts`, `src/views_other.js`, `src/app.js`)**
   - **Gemini `AQ.` keys**: Newer Google AI Studio / Vertex Express keys start with `AQ.` instead of `AIza`. Updated `detect()` / `detectProvider()` to match `AQ\.[0-9A-Za-z_\-.]{16,}`, `cleanKey` / `cleanKeyInput` to strip quotes / `Bearer ` / `export KEY=` / invisible chars without mangling prefixes, and `keyPool.getClient(key, direct, vertexai)` in `server.ts` to auto-enable `vertexai: true` for `AQ.` keys and bypass `GEMINI_BASE_URL` when `direct = true` for personal keys.
   - **Groq verification**: Previously `/api/keys/check` hardcoded `llama-3.1-8b-instant`, failing user keys that didn't have that model enabled with: ``The model `llama-3.1-8b-instant` does not exist or you do not have access to it``. Updated `/api/keys/check` and `executeWithGroq` to query `GET https://api.groq.com/openai/v1/models` dynamically first.

3. **Notebook Theme Polish (`src/index.css`)**
   - Added `html[data-pro-theme="notebook"]` overrides for Help & Guide, Advanced KeyVault, Privacy Lock (`#sayad-lock`), and Batch OCR (`#ocr-batch-pill`, `.ocrb-opt`) — notably keeping `.help-box input` borderless inside its bordered container.

4. **Note on `paper_print.js` + `paper_ui.js` (`cec22fb`)**
   - `printPaper()` now returns `true` when hidden-iframe print succeeds outside framed previews and `false` when it falls back to `.html` download inside sandboxed iframes.
   - Observed in `src/paper_ui.js` line 785–786: caller still unconditionally shows `toast('Paper downloaded! Open file to print or save as PDF 📄')` regardless of the boolean return value. Worth wiring `const ok = await printPaper(...)` in `paper_ui.js` later if you want distinct toast copy when direct print opens.

5. **AI Studio Environment Constraints**
   - Preview runs inside a sandboxed iframe (`window.alert` / `window.open` / `confirm` must be avoided — in-app Sheets/toasts and fallback downloads work best).
   - AI Studio workspace has no `.git` / `git push` credentials; updates and bridge reports written here are synced to GitHub by the user.

6. **Redesigned Theme & Appearance Switch Animations (`src/utils.js`, `src/views_other.js`, `src/reader_settings.js`, `src/index.css`)**
   - Replaced all 6 transitions with completely new, 100% GPU-composited (`transform`, `opacity`, `clipPath`) signature animations + crisp inline SVG elements (no `filter: blur`, no `mix-blend-mode`, no particle `box-shadow` spam):
     - **`light` (Day)**: Rising curved morning horizon (`ellipse` upward wipe) + ascending golden Sun SVG + luminous horizon arc.
     - **`dark` (Night)**: Zenith nightfall sweep (`ellipse` downward) + Crescent Moon SVG + diagonal Shooting Comet + crisp 4-point diamond stars.
     - **`sepia` (Sepia)**: Diagonal parchment wash + descending crimson-gold Silk Bookmark ribbon SVG.
     - **`classic` (Classic)**: Expanding 45° Swiss Diamond Aperture + 4 locking architectural corner brackets.
     - **`editorial` (Editorial)**: Center hardcover spine split outward (`inset(0 50% 0 50%)` -> `0%`) + twin parting champagne-gold rails & top/bottom typographic rules.
     - **`notebook` (Notebook)**: Left-binding spiral page flip (`inset(0 100% 0 0)` -> `0%`) + crease curl shadow + neon highlighter swipe + 4 spring-pop SVG study stickers (star, pencil, paperclip, check badge).
   - Interruptible (`__activeThemeFx.clean(true)` -> `vt.skipTransition()`), active button DOM updates captured inside `themeTransition(...)`, `autoTheme` animated cleanly, and non-View-Transitions browsers still play the signature overlay over a clean fade.

7. **Service Worker Update Unhandled Rejection Fix (`index.html`, `src/pwa.js`, `src/app.js`)**
   - **Error observed**: `TypeError: Failed to update a ServiceWorker for scope (...) with script (.../sw.js): An unknown error occurred when fetching the script.`
   - **Cause**: `index.html` called `reg.update()` inside a synchronous `try/catch` instead of `.catch()`, so async rejections during dev-preview restarts/sandboxed fetches surfaced as unhandled rejections, and `ais-dev-*` preview hosts attempted SW registration against dev servers.
   - **Fix**: Properly chained `Promise.resolve(reg.update()).catch(() => {})` in `index.html` and `src/pwa.js`, skipped/unregistered SW on `ais-dev-*` dev preview hosts (keeping `ais-pre-*`, custom domains, and standalone PWAs enabled with `updateViaCache: 'none'`), and treated background `Failed to update a ServiceWorker` rejections as harmless in `src/app.js`.

8. **Full Head-to-Toe Engine Re-Audit & Fixes (`server.ts`, `src/ai/study_core.js`, `src/ai/topic_chat.js`, `src/ai/dictionary.js`, `src/help_guide.js`)**
   - **Root Cause 1 — `403 Agent Platform API` on `AQ.` keys (`server.ts`)**: `GeminiKeyPool.getClient` defaulted `isVertex` to `key.startsWith("AQ.")` (`vertexai: true`) and disabled `process.env.GEMINI_BASE_URL` whenever `isVertex` was true. Standard AI Studio keys starting with `AQ.` (both runtime `GEMINI_API_KEY` `AQ.Ab8...dxIQ` and user BYOK `AQ.` keys) failed on `aiplatform.googleapis.com` with `403 Agent Platform API has not been used...`.
     - *Fix*: Default `isVertex` to `false` across `getClient`, `/api/keys-diagnostics`, `/api/keys/check`, `/api/gemini/validate`, and `executeWithGeminiPool` / `executeWithGeminiPoolStream`. Standard Gemini (plus `GEMINI_BASE_URL` proxy for server keys) is now tried first; Vertex AI (`vertexai: true`) is attempted only as a secondary client fallback for `AQ.` keys if standard returns auth/403. Also normalized BYOK `customKey` inputs via `cleanKeyInput` before execution.
   - **Root Cause 2 — Invalid Model Queue & Gemini 4 Config Error Risk (`server.ts`)**: Replaced nonexistent text model `gemini-3.8-flash` with canonical `gemini-4-hydrogen` alongside `gemini-3.1-flash-lite`, `gemini-flash-latest`, and `gemini-3.1-pro-preview`, and added `buildModelConfig` to strip `temperature`/`topP`/`topK`/`candidateCount` when targeting `gemini-4-*` models.
   - **Root Cause 3 — Empty `"Not covered on this page."` Cards & SSE Header Stripping (`src/ai/study_core.js`)**: `GROUNDING_RULES` previously told the model to write `"Not covered on this page."` under fixed template headers (`important` Page 1 Historical Timelines / Page 3 Constants), producing empty cards on non-historical pages like `Photosynthesis`.
     - *Fix*: Updated `GROUNDING_RULES` and `buildAIToolPromptForPage` to prohibit placeholder filler and extract grounded milestones/facts/equations; added `cleanStudyMarkdownOutput(md)`; fixed SSE `streamer.pushText` header stripping to slice after the complete first `# 📄 PAGE ...` line rather than running regex per delta chunk.
   - **Root Cause 4 — Client Parameter & Key-Forwarding Fixes**: Fixed `src/ai/topic_chat.js` `callAI(targetedPrompt, 'explain', pageText || activeSnippet || '', Boolean(pageText), pageNum, systemInstruction)` argument order; forwarded `customKey` from `src/ai/dictionary.js` to `/api/dictionary` and handled `req.body.customKey` in `server.ts`; updated stale badge/copy in `src/ai/dictionary.js` (`Oxford • Academic AI`) and `src/help_guide.js` (`AIza… / AQ.…`).

### Verified Live Regression Suite (`PASS` on `http://localhost:3000` after restart)
- **`npm run lint` (`tsc --noEmit`)**: `PASS` (0 errors).
- **`npm run build` (`vite build` + `esbuild server.ts`)**: `PASS`.
- **`GET /api/health`**: `PASS` (`200`, `primary-default-key` healthy).
- **`GET /api/keys-diagnostics`**: `PASS` (`200`, `GEMINI_API_KEY` `AQ.Ab8...dxIQ`, `responsive: true`, `latencyMs: 633`, `error: null`).
- **`POST /api/ai`**: `PASS` (`200`, `gemini-3.1-flash-lite`).
- **`POST /api/keys/check`**: `PASS` (`200`, `AQ.` dummy returns `"API key not valid..."` instead of 403 Agent Platform error; `gsk_` dummy returns clean Groq rejection).
- **`POST /api/ai/study-tool` (`important` p1)**: `PASS` (`200`, `gemini-3.1-flash-lite`, `Has Not covered placeholder?: false`, grounded Photosynthesis key facts).
- **`POST /api/ai/study-tool` (`summarize` SSE `stream: true`)**: `PASS` (`200`, `8151` bytes, `done: true`).
- **`POST /api/ai/study-tool` (`mcq` JSON)**: `PASS` (`200`, 2 valid MCQ JSON objects parsed).
- **`POST /api/ai/study-tool` (`paper` `json: true`)**: `PASS` (`200`, valid Question Paper MCQ JSON).
- **`POST /api/dictionary`**: `PASS` (`200`, `provider: gemini`, `primaryPos: Noun`, `hindi: प्रकाश संश्लेषण`).
- **`POST /api/ai/hybrid-tutor` (JSON / SSE / Flowchart / Visual Image)**: `PASS` (`200`, Hinglish doc chat + `done: true` SSE + `flowchart-generator` Mermaid + `authentic-educational-archive` image on unrelated visual query).
- **`GET /api/image-proxy` & `POST /api/ai/image`**: `PASS` (`200`, real Wikimedia/webp visual assets).
- **`GET /api/tts/voices` & `POST /api/tts/synthesize`**: `PASS` (`200`, 18 voices listed, `35973` bytes synthesized).

---

9. **BYOK Erratic Behavior Audit & Complete Fix (`server.ts`, `src/keyvault.js`, `src/app.js`, `src/teacher.js`)**
   - **Why BYOK behaved erratically while removing keys worked cleanly**:
     1. **Repeated 404/403/429 Round-Trips on Personal Gemini Keys (`server.ts`)**: `keyPool.markCooldown` ignored `'User Personal Custom Key'`, so every request re-tested failing/rate-limited personal keys from scratch across internal aliases (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`) that 404 on direct public `generativelanguage.googleapis.com` for `AIza...` keys.
        - *Fix*: Added hashed `byokCooldowns` (`bad`: 180s, `limit`: 60s, `fallback`: 15s), `byokClientModeCache` (`direct` vs `vertex` vs `GEMINI_BASE_URL` proxy), and `endpointModel404Cache` (10m per-endpoint 404 cache); prioritized public aliases (`gemini-flash-latest`, `gemini-2.5-flash`, `gemini-3.1-flash-lite-preview`, `gemini-3.1-pro-preview`) first on direct `AIza` keys while keeping canonical server-pool ordering for pool keys.
     2. **Silent Fallback Masked as BYOK Success (`server.ts`, `src/keyvault.js`)**: When BYOK failed and `server.ts` rescued the call via `primary-default-key` (returning HTTP `200`), `wrappedFetch` assumed BYOK succeeded, incremented `n++`, wrongly reset `'limit'` back to `'ok'`, forced cooled-down keys back into `nextGemini()` on every single call (`ready.length ? ready : pool`), and fired `sayad-keys-changed` UI redraws on every API call.
        - *Fix*: Added `X-Sayad-Key-Slot`, `X-Sayad-Byok-Status` (`used | limit | bad | fallback`), `X-Sayad-Byok-Note`, `X-Sayad-Aux-Provider`, `X-Sayad-Aux-Status`, and `X-Sayad-Aux-Note` headers across `/api/ai`, `/api/ai/study-tool` (both JSON & SSE before `flushHeaders()`), `/api/dictionary`, and `/api/ai/hybrid-tutor`. Updated `src/keyvault.js` so `nextGemini()` returns `''` while all personal Gemini keys are cooling down (falling back cleanly to App Default instead of hammering failing keys), only increments `n` when the BYOK/Aux key actually served the request, and throttles UI events (`save(emit)`).
     3. **BYOK Groq & OpenRouter Key Priority + Free-Tier Handling (`server.ts`)**:
        - When user supplied ONLY a Groq/OpenRouter BYOK key (`x-sayad-aux` without personal Gemini), Tier 1 server Gemini previously intercepted 100% of calls so BYOK Groq/OR never ran; additionally OpenRouter failed 402s on paid models without `:free` fallbacks, and both Groq/OR looped all models on `401/403`.
        - *Fix*: `executeWithGroq` and `executeWithOpenRouter` now abort immediately on `401/403`, skip paid OpenRouter models on `402` into `:free` models (+ cached dynamic `:free` catalog lookup), track outcomes via `userKeyCtx`, and run user BYOK `groq`/`openrouter` first for narrative `/api/ai`, `/api/ai/study-tool` (non-JSON), and `/api/ai/hybrid-tutor` (proper SSE + JSON support) with instant seamless rescue by server `keyPool` if BYOK fails.
     4. **IndexedDB Legacy Key Resurrection (`src/app.js`)**: Boot migration now only imports `customGeminiKey` when `aiKeys === null` (not after user cleared `KeyVault` to `[]`) and clears legacy `customGeminiKey` afterward.
     5. **Teacher ElevenLabs TTS & Round-Robin Fix (`src/teacher.js`)**: Fixed `sayad_eleven_labs_key` typo -> `sayad_elevenlabs_key`, passed missing 2nd `voiceId` argument to `speakWithElevenLabs(text, voiceId, options)`, and switched Web Search icon check to `KeyVault.hasGemini()` so checking visibility doesn't mutate `rr`.

### Verified Turn-2 Live Regression Output (`PASS` on `http://localhost:3000`)
- **`tsc --noEmit` + `npm run build`**: `PASS` (0 errors).
- **`/api/health`**: `200`, `primary-default-key:true`.
- **`/api/ai` (default)**: `200` (`1002ms`), `x-sayad-key-slot: primary-default-key`.
- **`/api/ai` (bad `AIza` BYOK -> 2nd cached skip)**: `200` (`992ms` -> `575ms`), `x-sayad-byok-status: bad`, rescued by `primary-default-key`.
- **`/api/ai` (bad `AQ.` BYOK -> 2nd cached skip)**: `200` (`866ms` -> `564ms`), `x-sayad-byok-status: bad`, rescued by `primary-default-key`.
- **`/api/ai` (bad `gsk_` aux BYOK)**: `200` (`1148ms`), `x-sayad-aux-provider: groq`, `x-sayad-aux-status: bad`, rescued by `primary-default-key`.
- **`/api/ai/study-tool` (SSE `stream: true` + bad BYOK)**: `200` (`845ms`), `22` SSE chunks, pre-flush headers preserved (`x-sayad-key-slot`, `x-sayad-byok-status`).
- **`/api/ai/hybrid-tutor` (SSE)**: `200` (`1286ms`), `x-sayad-key-slot: primary-default-key`.
- **`/api/dictionary`**: `200` (`2328ms`), `osmosis` (`Noun`).
- **`/api/ai/study-tool` (`paper` `json: true`)**: `200` (`1005ms`), `validJSON: true`.
- **`/api/keys/check` (`AIza`, `AQ.`, `gsk_`, `sk-or-`, unknown)**: `200` across all 5 cases with clear localized rejection/provider errors.
- **`/api/tts/voices`**: `200`, 18 voices returned.

---

10. **Batch OCR Pill `✕` Stop Fix & Recent Workspace Sync (`src/reader_ocr.js`, `src/index.css`, `src/annot_export.js`, `src/paper_ui.js`)**
    - **Batch OCR `✕` (`#obp-stop`) Unresponsive/Non-Closing Bug (`src/reader_ocr.js`, `src/index.css`)**:
      - *Root Cause*: Tapping `✕` on `#ocr-batch-pill` only set `batch.cancel = true` without dismissing the pill from DOM, while `runBatch` stayed blocked inside `await getTesseractWorker()` (first-run language/WASM fetch) or `await ocrPageToCache(...)` (`worker.recognize` taking 5–20s per page). Additionally, `#ocr-batch-pill` sat at `z-index: 9000` without `flex-shrink: 0` / text truncation or `pointerdown`/`touchstart`/`click` `stopPropagation()`, so long ETA strings and reader tap handlers could squeeze or swallow taps on mobile.
      - *Fix*:
        - Added `dismissPillEl()` and `stopActiveBatch()` so `✕` (`#obp-stop`) immediately sets `b.cancel = true`, clears `batch = null`, removes `#ocr-batch-pill` from DOM in 0ms, releases `wakeLock`, and shows a single stop toast (`"${done} pages scan hue, baaki ruk gaye"` or `"Scan ruk gaya"`).
        - Added `prevBatchTail` promise chaining + `myBatch` identity checks before/after `wakeLock`, `getTesseractWorker()`, each page, and `ocrPageToCache()` so canceling and immediately restarting never collides on the shared Tesseract worker (`Preparing OCR…` while draining the in-flight page).
        - Added `stopPropagation()` for `pointerdown`, `touchstart` (passive), and `click` on `#ocr-batch-pill` and its buttons.
        - Updated `#ocr-batch-pill` CSS (`z-index: 10500`, `touch-action: manipulation`, `.obp-t` nowrap/ellipsis truncation, `pointer-events: none` on `.obp-bar`, `flex-shrink: 0` 30×30 buttons).
    - **Workspace Updates Observed (Claude / Direct Workspace Sync)**:
      - `src/annot_export.js`, `src/reader.js`, `src/seed.js`, `ai-studio-bridge/TASKS.md` (Task #13): Added `stripNativeSayadAnnots(fileId)` (`nativeStripped` flag) to strip duplicate native PDF annotations authored by S.A.Y.A.D. on import / first open while preserving external PDF app annotations.
      - `src/paper_ui.js`: Updated print/download toast to differentiate direct print (`'Print dialog khul gaya 🖨️'`) vs sandbox `.html` download fallback via `const printed = await printPaper(...)`.
