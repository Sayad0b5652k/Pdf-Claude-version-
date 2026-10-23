// @ts-nocheck
import QRCode from 'qrcode';

/* ============================================================
   SETTINGS VIEW
   ============================================================ */
export async function renderSettings(){
  if (window.State.view !== 'settings') return;
  const prevScroll = window.scrollY || document.documentElement.scrollTop || 0;
  const totalSize = window.State.files.reduce((a,f)=>a+(f.size||0),0);
  const appUrl = 'https://sayadpro.ai.studio';
  const displayUrl = 'https://sayadpro.ai.studio';

  let qrSvg = '';
  try {
    qrSvg = await QRCode.toString(appUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#00000000'
      }
    });
    // Replace black fill with var(--accent) so it directly matches the exact theme accent color (same as S, A, Y, A, D and Athar Labs!)
    qrSvg = qrSvg.replace(/fill="#000000"/g, 'fill="var(--accent)"');
    qrSvg = qrSvg.replace(/<svg /, '<svg style="width:100%; height:100%; display:block;" ');
  } catch (err) {
    console.warn('QR Code generation error:', err);
    qrSvg = `<div style="font-size:11px; color:var(--text-dim); text-align:center;">${displayUrl}</div>`;
  }

  document.getElementById('app').innerHTML = `
  <div class="view fade-in" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:10; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border); margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('settings','icon icon-md')}
          </div>
          <div>
            <div class="font-display" style="font-size:20px; font-weight:800; letter-spacing:.02em; line-height:1.1;">Settings</div>
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-top:3px; font-weight:600;">
              <span>Preferences &amp; Reader Mode</span>
              <span style="color:var(--text-faint); font-size:10px;">•</span>
              <span style="color:var(--accent); font-weight:700;">${window.fmtBytes(totalSize)}</span>
            </div>
          </div>
        </div>
        <div class="font-mono" style="padding:4px 10px; border-radius:12px; background:var(--surface-2); color:var(--text-dim); border:1px solid var(--border); font-size:11px; font-weight:700;">
          ${window.State.files.length} ${window.State.files.length===1?'Book':'Books'}
        </div>
      </div>
    </div>
    <div style="padding:0 20px;">

    <!-- 1. Appearance -->
    <div class="section-title" style="margin-bottom:10px;">Appearance</div>
    <div class="card" style="padding:14px; margin-bottom:22px;">
      <div style="display:flex; gap:8px;">
        ${themeBtn('light','sun','Day')}
        ${themeBtn('dark','moon','Night')}
        ${themeBtn('sepia','coffee','Sepia')}
      </div>
      ${window.State.autoTheme? `<div style="font-size:11.5px; color:var(--text-faint); margin-top:10px;">Auto theme is on, so the app follows your system's light/dark setting instead of the choice above.</div>`:''}
    </div>

    <!-- 2. Reading Mode -->
    <div class="section-title" style="margin-bottom:10px;">Reading mode</div>
    <div class="card" style="padding:14px; margin-bottom:22px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        ${readingModeBtn('continuous','list','Continuous','Vertical scroll list')}
        ${readingModeBtn('single','fileText','Single page','Swipe left = next, right = back')}
      </div>
    </div>

    <!-- 3. Reading Options -->
    <div class="section-title" style="margin-bottom:10px;">Reading options</div>
    <div class="card" style="padding:4px 16px; margin-bottom:22px;">
      ${optRow('keepAwake','Keep screen awake','Prevents screen sleep during long reading intervals', window.State.keepAwake)}
      ${optRow('autoTheme','Auto theme','Sync theme automatically with your device system theme', window.State.autoTheme)}
      ${optRow('showPageNumber','Show page number','Display the page indicator in the reader header', window.State.showPageNumber)}
      ${optRow('smoothScroll','Smooth scroll','Enables eased transitions when jumping between pages', window.State.smoothScroll)}
    </div>

    <!-- 4. Pro Design Theme -->
    <div class="section-title" style="margin-bottom:10px;">Pro Design Theme (Design Architecture)</div>
    <div class="card" style="padding:14px; margin-bottom:22px;">
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
        <button data-set-pro-theme="classic" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${((window.State.proTheme||'classic')==='classic')?'var(--accent-soft)':'var(--surface-2)'};
          color:${((window.State.proTheme||'classic')==='classic')?'var(--accent)':'var(--text)'};
          border:1.5px solid ${((window.State.proTheme||'classic')==='classic')?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">🏛️</span>
          <span>Classic</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Original Look</span>
        </button>
        <button data-set-pro-theme="titanium" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${(window.State.proTheme==='titanium')?'var(--accent-soft)':'var(--surface-2)'};
          color:${(window.State.proTheme==='titanium')?'var(--accent)':'var(--text)'};
          border:1.5px solid ${(window.State.proTheme==='titanium')?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">⚡</span>
          <span>Titanium</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Precision Slate</span>
        </button>
        <button data-set-pro-theme="editorial" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${window.State.proTheme==='editorial'?'var(--accent-soft)':'var(--surface-2)'};
          color:${window.State.proTheme==='editorial'?'var(--accent)':'var(--text)'};
          border:1.5px solid ${window.State.proTheme==='editorial'?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">📖</span>
          <span>Editorial</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Swiss Minimal</span>
        </button>
        <button data-set-pro-theme="glass" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${window.State.proTheme==='glass'?'var(--accent-soft)':'var(--surface-2)'};
          color:${window.State.proTheme==='glass'?'var(--accent)':'var(--text)'};
          border:1.5px solid ${window.State.proTheme==='glass'?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">🪟</span>
          <span>Glass</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Vision Frost</span>
        </button>
      </div>
      <div style="font-size:11.5px; color:var(--text-faint); margin-top:10px; line-height:1.4;">
        Switches the visual DNA across all sheets, cards, controls, and dialogs.
      </div>
    </div>

    <!-- 5. Storage -->
    <div class="section-title" style="margin-bottom:10px;">Storage</div>
    <div class="card" style="padding:16px; margin-bottom:22px;">
      <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:6px;">
        <span style="color:var(--text-dim);">Library size</span><span class="font-mono">${window.fmtBytes(totalSize)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:14px;">
        <span style="color:var(--text-dim);">Books stored</span><span class="font-mono">${window.State.files.length}</span>
      </div>
    </div>

    <!-- 6. Backup -->
    <div class="section-title" style="margin-bottom:10px;">Backup</div>
    <div class="card" style="padding:14px; margin-bottom:22px; display:flex; gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" id="btn-export">Export notes &amp; bookmarks</button>
      <button class="btn btn-ghost" style="flex:1;" id="btn-import-backup">Restore</button>
    </div>

    <!-- 7. About S.A.Y.A.D. with QR Code on Right & Link Below -->
    <div class="section-title" style="margin-bottom:10px;">About S.A.Y.A.D.</div>
    <div class="card" style="padding:18px; font-size:13px; color:var(--text-dim); line-height:1.7; margin-bottom:22px;">
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border);">
        <div style="width:48px; height:48px; border-radius:12px; background:var(--surface-2); border:1px solid var(--accent-soft); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 3px 12px var(--accent-soft); overflow:hidden;">
          <img src="${typeof window.getThemeCrestUrl === 'function' ? window.getThemeCrestUrl() : '/icons/theme-classic-512.png'}" alt="S.A.Y.A.D." style="width:100%; height:100%; object-fit:cover; border-radius:12px;" />
        </div>
        <div>
          <div class="font-display" style="font-size:20px; font-weight:800; color:var(--text); letter-spacing:.04em;">S.A.Y.A.D.</div>
          <div style="font-size:12px;"><span style="color:var(--text-dim); font-weight:600;">Built by</span> <span style="color:var(--accent); font-weight:700;">Athar Labs</span></div>
        </div>
      </div>

      <!-- Full Meaning Box & Flat Theme-Colored QR Code (Spacious & Clean) -->
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:16px;">
          <!-- Left Column: Acronym Full Meaning in Theme Accent Colors -->
          <div style="flex:1; min-width:130px;">
            <div style="font-weight:700; color:var(--text); margin-bottom:10px; font-size:13px;">Full Meaning:</div>
            <div style="display:grid; gap:6px; font-size:13px; font-weight:600;">
              <div style="display:flex; align-items:center;"><span style="color:var(--accent); font-weight:800; font-size:16px; width:18px;">S</span> <span style="color:var(--text-dim); margin:0 6px;">—</span> <span style="color:var(--text);">Study</span></div>
              <div style="display:flex; align-items:center;"><span style="color:var(--accent); font-weight:800; font-size:16px; width:18px;">A</span> <span style="color:var(--text-dim); margin:0 6px;">—</span> <span style="color:var(--text);">Assistant for</span></div>
              <div style="display:flex; align-items:center;"><span style="color:var(--accent); font-weight:800; font-size:16px; width:18px;">Y</span> <span style="color:var(--text-dim); margin:0 6px;">—</span> <span style="color:var(--text);">Your</span></div>
              <div style="display:flex; align-items:center;"><span style="color:var(--accent); font-weight:800; font-size:16px; width:18px;">A</span> <span style="color:var(--text-dim); margin:0 6px;">—</span> <span style="color:var(--text);">Academic</span></div>
              <div style="display:flex; align-items:center;"><span style="color:var(--accent); font-weight:800; font-size:16px; width:18px;">D</span> <span style="color:var(--text-dim); margin:0 6px;">—</span> <span style="color:var(--text);">Development</span></div>
            </div>
          </div>

          <!-- Right Column: Flat QR Code rendered in exact theme accent color -->
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; background:var(--surface); border:1.5px solid var(--accent-soft); border-radius:14px; padding:10px 10px 8px; box-shadow:0 4px 14px var(--accent-soft); width:112px;">
            <div style="width:92px; height:92px; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${qrSvg}
            </div>
            <span style="font-size:9.5px; font-weight:800; color:var(--accent); margin-top:6px; letter-spacing:0.06em; text-transform:uppercase;">SCAN APP</span>
          </div>
        </div>

        <!-- Below: App URL Link with Copy Button -->
        <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <a href="${appUrl}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; gap:6px; min-width:0; flex:1; text-decoration:none;">
            <span style="font-size:13px; flex-shrink:0;">🔗</span>
            <span id="sayad-app-link-text" style="font-size:12px; font-family:var(--font-mono, monospace); color:var(--accent); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${appUrl}">
              ${appUrl}
            </span>
          </a>
          <button class="btn btn-ghost" id="btn-copy-app-link" style="padding:5px 10px; font-size:11.5px; font-weight:700; border-radius:8px; color:var(--text); background:var(--surface); border:1px solid var(--border); flex-shrink:0; display:flex; align-items:center; gap:5px; cursor:pointer;">
            ${window.icon('copy','icon icon-xs')}
            <span>Copy Link</span>
          </button>
        </div>
      </div>

      S.A.Y.A.D. stores every book, note, and flashcard directly on this device using IndexedDB — nothing leaves your browser except AI requests and dictionary/OCR lookups you trigger yourself.
      <div style="margin-top:10px; font-size:12px;">Built on: PDF.js (rendering), pdf-lib (annotated export), Tesseract.js (scanned-page OCR), Fuse.js (search), the Free Dictionary API, and a hand-implemented FSRS scheduler for spaced repetition.</div>
      <div class="font-mono" style="margin-top:12px; font-size:11px; color:var(--text-faint); border-top:1px solid var(--border); padding-top:10px;">S.A.Y.A.D V2</div>
    </div>

    <!-- 8. AI Engine & Custom API Key Section (Technical - Shifted Down Above App Installation) -->
    <div class="section-title" style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
      <span>AI Engine &amp; Custom API Key</span>
      <span style="font-size:11px; padding:2px 8px; border-radius:20px; font-weight:700; background:${window.State.customGeminiKey ? 'rgba(16, 185, 129, 0.15)' : 'var(--accent-soft)'}; color:${window.State.customGeminiKey ? '#10b981' : 'var(--accent)'}; border:1px solid ${window.State.customGeminiKey ? '#10b981' : 'var(--accent)'};">
        ${window.State.customGeminiKey ? '● Custom Key Active' : '● App Default Key Pool'}
      </span>
    </div>
    <div class="card" style="padding:16px 18px; margin-bottom:22px; border:1px solid var(--border); border-radius:16px;">
      
      <!-- Athar's Humorous & Friendly Quota Note -->
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:14px; display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:24px; line-height:1; flex-shrink:0;">☕</div>
        <div style="font-size:12.5px; line-height:1.5; color:var(--text-dim);">
          <strong style="color:var(--text);">"Quota khatam? Toh jao khud ki key lekar aao! Saara kharcha mai hi kyu uthau?"</strong>
          <div style="margin-top:3px; font-size:11px; color:var(--accent); font-weight:700;">— Sayad Athar</div>
        </div>
      </div>

      <div style="font-size:13px; color:var(--text); font-weight:700; margin-bottom:4px;">Personal Google Gemini API Key</div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px; line-height:1.4;">
        Free unlimited Google Gemini API key direct Google AI Studio se create karein aur yahan paste karein.
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <div style="position:relative; flex:1;">
          <input type="password" id="input-custom-gemini-key" placeholder="Paste your Gemini API key (AIzaSy...)" 
            value="${window.escapeHtml(window.State.customGeminiKey || '')}" 
            style="width:100%; padding:10px 38px 10px 12px; font-size:13px; font-family:var(--font-mono, monospace); background:var(--bg); border:1.5px solid var(--border); border-radius:10px; color:var(--text); outline:none;" />
          <button type="button" id="btn-toggle-key-visibility" title="Toggle visibility" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:4px;">
            👁️
          </button>
        </div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        <button class="btn btn-primary" id="btn-save-custom-key" style="flex:1; min-width:130px; padding:10px 14px; font-size:12.5px; font-weight:800; border-radius:10px; justify-content:center; gap:6px;">
          ${window.icon('check','icon icon-sm')}
          <span>Save &amp; Test Key</span>
        </button>
        ${window.State.customGeminiKey ? `
          <button class="btn btn-ghost" id="btn-remove-custom-key" style="padding:10px 14px; font-size:12.5px; font-weight:700; border-radius:10px; color:var(--danger, #ef4444); border-color:var(--danger, #ef4444); justify-content:center;">
            Remove Key
          </button>
        ` : ''}
      </div>

      <div id="custom-key-status-msg" style="display:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:600; margin-bottom:12px;"></div>

      <!-- Quick Link to Google AI Studio -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding-top:10px; border-top:1px dashed var(--border); font-size:12px;">
        <span style="color:var(--text-dim);">🔑 Key kaise milegi?</span>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color:var(--accent); font-weight:700; text-decoration:none; display:flex; align-items:center; gap:4px;">
          <span>Get Free Gemini Key (AI Studio)</span>
          <span style="font-size:11px;">↗</span>
        </a>
      </div>
    </div>

    <!-- 9. AI Response & Delivery Settings (Harmonized With App & Pro Design Themes) -->
    <div class="section-title" style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
      <span>AI Response &amp; Delivery</span>
      <span id="settings-delivery-header-badge" style="font-size:11px; padding:2px 8px; border-radius:20px; font-weight:700; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">
        ${(window.State.streamingMode || 'sse') === 'sse' ? '● Word-By-Word Flow' : (window.State.streamingMode === 'typewriter' ? '● Morphic Wave' : '● Turbo Instant')}
      </span>
    </div>
    <div class="card" style="padding:0; margin-bottom:22px; border:1px solid var(--border); border-radius:16px; overflow:hidden; background:var(--surface);">
      <details id="ai-delivery-advanced-details" ${window._settingsDeliveryOpen ? 'open' : ''} class="settings-advanced-details">
        <summary style="padding:14px 16px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; user-select:none; list-style:none; outline:none; transition:background 0.15s ease;">
          <div style="display:flex; align-items:center; gap:12px; min-width:0;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('zap','icon icon-md')}
            </div>
            <div style="min-width:0;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:14px; font-weight:800; color:var(--text); letter-spacing:-0.01em;">Delivery Style &amp; Pacing</span>
                <span style="font-size:9.5px; font-weight:800; padding:1px 6px; border-radius:6px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">ADVANCED</span>
              </div>
              <div id="settings-delivery-summary-subtitle" style="font-size:11.5px; color:var(--text-dim); margin-top:2px;">
                ${(window.State.streamingMode || 'sse') === 'sse' ? 'Active: Word-By-Word (ChatGPT Style)' : (window.State.streamingMode === 'typewriter' ? 'Active: Smooth Morphic Wave' : 'Active: Turbo Instant Jump')}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-shrink:0; margin-left:8px;">
            <span class="delivery-details-chevron" style="font-size:12px; color:var(--text-dim); transition:transform 0.2s ease;">▼</span>
          </div>
        </summary>

        <div style="padding:16px; border-top:1px solid var(--border); background:var(--surface);">
          <div style="font-size:12px; color:var(--text-dim); margin-bottom:14px; line-height:1.5;">
            Choose how AI text, summaries, and book explanations stream onto your screen:
          </div>

          <div style="display:grid; grid-template-columns:1fr; gap:12px;">
            <!-- Option 1: Word-By-Word Live Stream (ChatGPT & Claude Style) -->
            ${(() => {
              const active = (window.State.streamingMode || 'sse') === 'sse';
              return `
              <div data-set-streaming-mode="sse" class="delivery-card-option" style="padding:14px; border-radius:14px; cursor:pointer;
                background:${active ? 'var(--accent-soft)' : 'var(--surface-2)'};
                border:1.5px solid ${active ? 'var(--accent)' : 'var(--border)'};
                box-shadow:${active ? '0 4px 16px var(--accent-soft)' : 'none'};">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div class="delivery-icon-box" style="width:34px; height:34px; border-radius:10px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--accent)'}; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${window.icon('sparkle', 'icon icon-sm')}
                    </div>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:13.5px; font-weight:800; color:var(--text);">Word-By-Word Live Flow</span>
                        <span class="delivery-chip" style="font-size:9.5px; padding:1px 6px; border-radius:6px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--text-dim)'}; font-weight:800; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};">ChatGPT Style</span>
                      </div>
                      <div style="font-size:11.5px; color:var(--text-dim); margin-top:2px; line-height:1.4;">
                        Ek-ek word real-time me fluidly type hota hai screen par bina kisi jhatke ke.
                      </div>
                    </div>
                  </div>
                  <div class="delivery-status-indicator" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${active ? `
                      <span class="pulsing-accent-dot"></span>
                      <span style="font-size:11px; font-weight:800; color:var(--accent);">ACTIVE</span>
                    ` : `
                      <span style="font-size:11px; font-weight:600; color:var(--text-faint);">Select</span>
                    `}
                  </div>
                </div>

                <!-- Visual Simulation Box for Mode 1 -->
                <div class="delivery-simulation-box" style="margin-top:10px; padding:8px 12px; border-radius:10px; background:var(--surface); border:1px dashed ${active ? 'var(--accent)' : 'var(--border)'}; font-family:var(--font-mono, monospace); font-size:11px; color:var(--text);">
                  <span style="color:var(--accent); font-weight:700;">Live stream: </span>
                  <span>"The molecule enters the cycle word by word...</span><span class="ai-typing-cursor">▌</span>
                </div>
              </div>`;
            })()}

            <!-- Option 2: Smooth Morphic Wave (Section Transition Progression) -->
            ${(() => {
              const active = window.State.streamingMode === 'typewriter';
              return `
              <div data-set-streaming-mode="typewriter" class="delivery-card-option" style="padding:14px; border-radius:14px; cursor:pointer;
                background:${active ? 'var(--accent-soft)' : 'var(--surface-2)'};
                border:1.5px solid ${active ? 'var(--accent)' : 'var(--border)'};
                box-shadow:${active ? '0 4px 16px var(--accent-soft)' : 'none'};">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div class="delivery-icon-box" style="width:34px; height:34px; border-radius:10px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--accent)'}; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${window.icon('cards', 'icon icon-sm')}
                    </div>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:13.5px; font-weight:800; color:var(--text);">Smooth Morphic Card Wave</span>
                        <span class="delivery-chip" style="font-size:9.5px; padding:1px 6px; border-radius:6px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--text-dim)'}; font-weight:800; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};">Section Wave</span>
                      </div>
                      <div style="font-size:11.5px; color:var(--text-dim); margin-top:2px; line-height:1.4;">
                        Paragraphs and sections slide &amp; fade in with an elegant calm wave transition.
                      </div>
                    </div>
                  </div>
                  <div class="delivery-status-indicator" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${active ? `
                      <span class="pulsing-accent-dot"></span>
                      <span style="font-size:11px; font-weight:800; color:var(--accent);">ACTIVE</span>
                    ` : `
                      <span style="font-size:11px; font-weight:600; color:var(--text-faint);">Select</span>
                    `}
                  </div>
                </div>

                <!-- Visual Simulation Box for Mode 2 -->
                <div class="delivery-simulation-box" style="margin-top:10px; padding:8px 12px; border-radius:10px; background:var(--surface); border:1px dashed ${active ? 'var(--accent)' : 'var(--border)'}; font-size:11px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <span style="color:var(--accent); font-weight:700;">Wave sequence: </span>
                  <span style="padding:2px 6px; border-radius:6px; background:var(--accent-soft); color:var(--accent); font-size:10px; font-weight:700; border:1px solid var(--accent-soft);">▤ Section 1</span>
                  <span style="color:var(--text-faint);">➔</span>
                  <span style="padding:2px 6px; border-radius:6px; background:var(--accent-soft); color:var(--accent); font-size:10px; font-weight:700; border:1px solid var(--accent-soft);">▤ Key Points</span>
                  <span style="color:var(--text-faint);">➔</span>
                  <span style="padding:2px 6px; border-radius:6px; background:var(--accent-soft); color:var(--accent); font-size:10px; font-weight:700; border:1px solid var(--accent-soft);">📊 Flowchart</span>
                </div>
              </div>`;
            })()}

            <!-- Option 3: Instant Turbo Jump (Zero Animation Delay) -->
            ${(() => {
              const active = window.State.streamingMode === 'instant';
              return `
              <div data-set-streaming-mode="instant" class="delivery-card-option" style="padding:14px; border-radius:14px; cursor:pointer;
                background:${active ? 'var(--accent-soft)' : 'var(--surface-2)'};
                border:1.5px solid ${active ? 'var(--accent)' : 'var(--border)'};
                box-shadow:${active ? '0 4px 16px var(--accent-soft)' : 'none'};">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <div class="delivery-icon-box" style="width:34px; height:34px; border-radius:10px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--accent)'}; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${window.icon('zap', 'icon icon-sm')}
                    </div>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:13.5px; font-weight:800; color:var(--text);">Turbo Flash Jump</span>
                        <span class="delivery-chip" style="font-size:9.5px; padding:1px 6px; border-radius:6px; background:${active ? 'var(--accent)' : 'var(--surface)'}; color:${active ? 'var(--accent-ink, #ffffff)' : 'var(--text-dim)'}; font-weight:800; border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};">Fastest Direct</span>
                      </div>
                      <div style="font-size:11.5px; color:var(--text-dim); margin-top:2px; line-height:1.4;">
                        Zero waiting animation. Full generated output, formulas, and diagrams render immediately.
                      </div>
                    </div>
                  </div>
                  <div class="delivery-status-indicator" style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${active ? `
                      <span class="pulsing-accent-dot"></span>
                      <span style="font-size:11px; font-weight:800; color:var(--accent);">ACTIVE</span>
                    ` : `
                      <span style="font-size:11px; font-weight:600; color:var(--text-faint);">Select</span>
                    `}
                  </div>
                </div>

                <!-- Visual Simulation Box for Mode 3 -->
                <div class="delivery-simulation-box" style="margin-top:10px; padding:8px 12px; border-radius:10px; background:var(--surface); border:1px dashed ${active ? 'var(--accent)' : 'var(--border)'}; font-size:11px; display:flex; align-items:center; gap:8px;">
                  <span style="color:var(--accent); font-weight:700;">Turbo mode: </span>
                  <span style="color:var(--text-dim);">Zero waiting delay · 100% full content rendered in one frame</span>
                </div>
              </div>`;
            })()}
          </div>
        </div>
      </details>
    </div>

    <!-- 9. App Updates & Refresh (Technical - Shifted Down Above App Installation) -->
    <div class="section-title" style="margin-bottom:10px;">App Updates &amp; Refresh</div>
    <div class="card" style="padding:16px; margin-bottom:22px; border:1px solid var(--border); border-radius:16px; background:var(--surface);">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <div style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
          🔄
        </div>
        <div>
          <div style="font-size:14px; font-weight:700; color:var(--text);">Safe App Update &amp; Refresh</div>
          <div style="font-size:11.5px; color:var(--text-dim); margin-top:2px;">
            Clears old app cache and applies the latest features without losing your data.
          </div>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-dim); line-height:1.4; margin-bottom:14px; background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--border);">
        <strong style="color:var(--accent);">Zero Data Loss:</strong> Aapke uploaded books, PDFs, notes, bookmarks, aur highlights 100% safe rahenge.
      </div>
      <button class="btn btn-primary" id="btn-force-safe-update" style="width:100%; padding:12px; font-size:13px; font-weight:800; border-radius:10px; justify-content:center; gap:8px;">
        <span>🔄 Check Updates &amp; Refresh App</span>
      </button>
    </div>

    <!-- 10. App Installation Option at Very Bottom of Settings -->
    <div class="section-title" style="margin-top:24px; margin-bottom:12px;">App Installation</div>
    <div class="card" style="padding:18px 20px; margin-bottom:24px; border:1px solid var(--border); background:var(--surface); border-radius:20px; box-shadow:0 6px 20px rgba(0,0,0,0.12); position:relative; overflow:hidden;">
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">
        <div style="width:48px; height:48px; flex-shrink:0; border-radius:14px; overflow:hidden; border:1px solid var(--border); box-shadow:0 3px 10px rgba(0,0,0,0.15); background:var(--surface-2);">
          <img src="/icons/theme-classic-512.png" alt="S.A.Y.A.D." style="width:100%; height:100%; object-fit:cover; border-radius:14px;" />
        </div>
        <div>
          <div style="font-size:16px; font-weight:800; color:var(--text); letter-spacing:-0.01em;">Install S.A.Y.A.D. App</div>
          <div style="font-size:12px; color:var(--text-dim); margin-top:2px; line-height:1.4;">
            ${(typeof window.isStandalone === 'function' && window.isStandalone()) ? '✅ App is already installed and running in standalone mode.' : 'Install on your device home screen for fast offline study and full-screen view.'}
          </div>
        </div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <span style="font-size:11px; font-weight:700; color:var(--accent); background:var(--accent-soft); border:1px solid var(--accent); padding:3px 9px; border-radius:20px;">⚡ Offline Support</span>
        <span style="font-size:11px; font-weight:700; color:var(--text-dim); background:var(--surface-2); border:1px solid var(--border); padding:3px 9px; border-radius:20px;">🚀 Full Screen</span>
        <span style="font-size:11px; font-weight:700; color:var(--text-dim); background:var(--surface-2); border:1px solid var(--border); padding:3px 9px; border-radius:20px;">🔒 100% Private</span>
      </div>

      ${(typeof window.isStandalone === 'function' && window.isStandalone()) ? `
        <div style="padding:10px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; font-size:12.5px; color:var(--accent); font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
          <span>✅ App Installed &amp; Ready</span>
        </div>
      ` : `
        <button class="btn btn-primary" id="btn-install-pwa-settings" style="width:100%; padding:13px; font-size:14px; font-weight:800; background:linear-gradient(135deg, #FF6A2B 0%, #D9540E 100%); color:#ffffff; border:none; border-radius:12px; box-shadow:0 4px 14px rgba(217, 84, 14, 0.35); display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer;">
          <span>📲 Install S.A.Y.A.D. App</span>
        </button>
      `}
    </div>

  </div>
  </div>
  ${window.bottomNavHtml('settings')}`;
  window.bindBottomNav();

  const copyLinkBtn = document.getElementById('btn-copy-app-link');
  if (copyLinkBtn) {
    copyLinkBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(appUrl);
        window.toast('App link copied to clipboard! 📋');
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = appUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        window.toast('App link copied to clipboard! 📋');
      }
    };
  }

  const voiceBtn = document.getElementById('btn-open-voice-settings-main');
  if (voiceBtn) {
    voiceBtn.onclick = () => {
      if (typeof window.openVoiceSettingsModal === 'function') {
        window.openVoiceSettingsModal();
      }
    };
  }

  const installBtn = document.getElementById('btn-install-pwa-settings');
  if (installBtn) {
    installBtn.onclick = () => {
      if (typeof window.triggerDirectInstall === 'function') {
        window.triggerDirectInstall();
      } else if (typeof window.showInstallModal === 'function') {
        window.showInstallModal(true);
      }
    };
  }

  const updateBtn = document.getElementById('btn-force-safe-update');
  if (updateBtn) {
    updateBtn.onclick = () => {
      if (typeof window.forceAppUpdateAndRefresh === 'function') {
        window.forceAppUpdateAndRefresh(false);
      } else {
        window.location.reload();
      }
    };
  }

  // Surgical inline DOM updater helpers (Zero scroll jumping, zero flicker)
  function updateProThemeButtonsDOM(chosen) {
    document.querySelectorAll('[data-set-pro-theme]').forEach(b => {
      const active = b.dataset.setProTheme === chosen;
      b.style.background = active ? 'var(--accent-soft)' : 'var(--surface-2)';
      b.style.color = active ? 'var(--accent)' : 'var(--text)';
      b.style.border = `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
    });
  }

  function updateThemeButtonsDOM(chosen) {
    document.querySelectorAll('[data-theme-btn]').forEach(b => {
      const active = b.dataset.themeBtn === chosen;
      b.style.background = active ? 'var(--accent-soft)' : 'var(--surface-2)';
      b.style.color = active ? 'var(--accent)' : 'var(--text-dim)';
      b.style.border = `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
    });
    const autoThemeRow = document.querySelector('[data-opt="autoTheme"]');
    if (autoThemeRow) {
      const tgl = autoThemeRow.querySelector('.tgl');
      if (tgl) tgl.classList.remove('on');
    }
  }

  function updateReadingModeButtonsDOM(chosen) {
    document.querySelectorAll('[data-reading-mode]').forEach(b => {
      const active = b.dataset.readingMode === chosen;
      b.style.background = active ? 'var(--accent-soft)' : 'var(--surface-2)';
      b.style.color = active ? 'var(--accent)' : 'var(--text)';
      b.style.border = `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
      const spans = b.querySelectorAll('span');
      if (spans.length >= 2) {
        spans[0].style.color = active ? 'var(--accent)' : 'var(--text)';
        spans[1].style.color = active ? 'var(--accent)' : 'var(--text-dim)';
      }
    });
  }

  document.querySelectorAll('[data-set-pro-theme]').forEach(b=>{
    b.onclick = async ()=>{
      const chosen = b.dataset.setProTheme;
      if (window.State.proTheme === chosen) return;
      window.State.proTheme = chosen;
      document.documentElement.dataset.proTheme = chosen;
      try { localStorage.setItem('sayad_pro_theme', chosen); } catch(e){}
      if (window.DB && window.DB.setting) {
        await window.DB.setting('proTheme', chosen);
      }
      const label = chosen === 'titanium' ? '⚡ Titanium Pro' : chosen === 'editorial' ? '📖 Editorial Luxe' : chosen === 'glass' ? '🪟 Vision Glass' : '🏛️ Classic';
      window.toast(`Pro Theme set: ${label}`);
      updateProThemeButtonsDOM(chosen);
    };
  });

  document.querySelectorAll('[data-theme-btn]').forEach(b=>{
    b.onclick = async ()=>{
      window.State.theme = b.dataset.themeBtn;
      window.State.autoTheme = false;
      document.documentElement.dataset.theme = window.State.theme;
      try { localStorage.setItem('sayad_theme', window.State.theme); } catch(e){}
      if (typeof window.syncThemeColorMeta === 'function') window.syncThemeColorMeta();
      await window.DB.setting('theme', window.State.theme);
      await window.DB.setting('autoTheme', false);
      updateThemeButtonsDOM(window.State.theme);
    };
  });

  document.querySelectorAll('[data-reading-mode]').forEach(b=>{
    b.onclick = async ()=>{
      const chosen = b.dataset.readingMode;
      window.State.readingMode = chosen;
      await window.DB.setting('readingMode', window.State.readingMode);
      if(window.State.view==='reader' && window.State.currentDoc) window.mountReaderContent();
      updateReadingModeButtonsDOM(chosen);
    };
  });

  document.querySelectorAll('[data-opt]').forEach(row=>{
    row.onclick = async ()=>{
      const key = row.dataset.opt;
      window.State[key] = !window.State[key];
      await window.DB.setting(key, window.State[key]);
      const tgl = row.querySelector('.tgl');
      if (tgl) tgl.classList.toggle('on', !!window.State[key]);

      if(key==='keepAwake'){
        if(window.State.keepAwake && window.State.view==='reader') window.requestWakeLock();
        else window.releaseWakeLock();
      }
      if(key==='autoTheme'){
        if(window.State.autoTheme) window.applyAutoTheme();
      }
      if(key==='showPageNumber'){
        const el = document.getElementById('page-indicator');
        if(el) el.style.display = window.State.showPageNumber ? '' : 'none';
      }
    };
  });

  // Custom Gemini API Key Event Handlers
  const customKeyInput = document.getElementById('input-custom-gemini-key');
  const toggleVisibilityBtn = document.getElementById('btn-toggle-key-visibility');
  const saveCustomKeyBtn = document.getElementById('btn-save-custom-key');
  const removeCustomKeyBtn = document.getElementById('btn-remove-custom-key');
  const statusMsgEl = document.getElementById('custom-key-status-msg');

  if (toggleVisibilityBtn && customKeyInput) {
    toggleVisibilityBtn.onclick = () => {
      if (customKeyInput.type === 'password') {
        customKeyInput.type = 'text';
        toggleVisibilityBtn.textContent = '🔒';
      } else {
        customKeyInput.type = 'password';
        toggleVisibilityBtn.textContent = '👁️';
      }
    };
  }

  if (saveCustomKeyBtn && customKeyInput) {
    saveCustomKeyBtn.onclick = async () => {
      const enteredKey = (customKeyInput.value || '').trim();
      if (!enteredKey) {
        window.toast('Please enter a Gemini API key');
        return;
      }

      saveCustomKeyBtn.disabled = true;
      saveCustomKeyBtn.innerHTML = `<span>Testing Key...</span>`;
      if (statusMsgEl) {
        statusMsgEl.style.display = 'block';
        statusMsgEl.style.background = 'var(--surface-2)';
        statusMsgEl.style.color = 'var(--text-dim)';
        statusMsgEl.style.border = '1px solid var(--border)';
        statusMsgEl.textContent = 'Validating key with Google Gemini API...';
      }

      try {
        const resp = await fetch('/api/gemini/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: enteredKey })
        });
        const resData = await resp.json();

        if (resp.ok && resData.valid) {
          window.State.customGeminiKey = enteredKey;
          try { localStorage.setItem('sayad_custom_gemini_key', enteredKey); } catch(e){}
          if (window.DB && window.DB.setting) {
            await window.DB.setting('customGeminiKey', enteredKey);
          }
          window.toast('Custom Gemini key saved & verified! 🎉');
          renderSettings();
        } else {
          if (statusMsgEl) {
            statusMsgEl.style.display = 'block';
            statusMsgEl.style.background = 'rgba(239, 68, 68, 0.12)';
            statusMsgEl.style.color = 'var(--danger, #ef4444)';
            statusMsgEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            statusMsgEl.textContent = `❌ Validation Failed: ${resData.error || 'Invalid API Key'}`;
          }
          saveCustomKeyBtn.disabled = false;
          saveCustomKeyBtn.innerHTML = `${window.icon('check','icon icon-sm')}<span>Save &amp; Test Key</span>`;
        }
      } catch (err) {
        if (statusMsgEl) {
          statusMsgEl.style.display = 'block';
          statusMsgEl.style.background = 'rgba(239, 68, 68, 0.12)';
          statusMsgEl.style.color = 'var(--danger, #ef4444)';
          statusMsgEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
          statusMsgEl.textContent = `Network Error: ${err.message}`;
        }
        saveCustomKeyBtn.disabled = false;
        saveCustomKeyBtn.innerHTML = `${window.icon('check','icon icon-sm')}<span>Save &amp; Test Key</span>`;
      }
    };
  }

  if (removeCustomKeyBtn) {
    removeCustomKeyBtn.onclick = async () => {
      window.State.customGeminiKey = '';
      try { localStorage.removeItem('sayad_custom_gemini_key'); } catch(e){}
      if (window.DB && window.DB.setting) {
        await window.DB.setting('customGeminiKey', '');
      }
      window.toast('Reverted to default app key pool 🔄');
      renderSettings();
    };
  }

  // Handle Advanced AI Delivery Details Accordion State
  const deliveryDetails = document.getElementById('ai-delivery-advanced-details');
  if (deliveryDetails) {
    deliveryDetails.ontoggle = () => {
      window._settingsDeliveryOpen = deliveryDetails.open;
    };
  }

  // Surgical inline DOM updater for AI streaming delivery cards
  function updateStreamingModeCardsDOM(mode) {
    const modeLabels = {
      sse: 'Word-By-Word Live Flow (ChatGPT Style)',
      typewriter: 'Smooth Morphic Card Wave',
      instant: 'Turbo Flash Jump'
    };
    const modeShort = {
      sse: '● Word-By-Word Flow',
      typewriter: '● Morphic Wave',
      instant: '● Turbo Instant'
    };

    const headerBadge = document.getElementById('settings-delivery-header-badge');
    if (headerBadge) {
      headerBadge.textContent = modeShort[mode] || mode;
    }

    const subTitle = document.getElementById('settings-delivery-summary-subtitle');
    if (subTitle) {
      subTitle.textContent = `Active: ${modeLabels[mode] || mode}`;
    }

    document.querySelectorAll('[data-set-streaming-mode]').forEach(card => {
      const active = card.dataset.setStreamingMode === mode;
      card.style.background = active ? 'var(--accent-soft)' : 'var(--surface-2)';
      card.style.border = `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
      card.style.boxShadow = active ? '0 4px 16px var(--accent-soft)' : 'none';

      const statusWrap = card.querySelector('.delivery-status-indicator');
      if (statusWrap) {
        statusWrap.innerHTML = active
          ? `<span class="pulsing-accent-dot"></span><span style="font-size:11px; font-weight:800; color:var(--accent);">ACTIVE</span>`
          : `<span style="font-size:11px; font-weight:600; color:var(--text-faint);">Select</span>`;
      }

      const iconBox = card.querySelector('.delivery-icon-box');
      if (iconBox) {
        iconBox.style.background = active ? 'var(--accent)' : 'var(--surface)';
        iconBox.style.color = active ? 'var(--accent-ink, #ffffff)' : 'var(--accent)';
        iconBox.style.border = `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
      }

      const chip = card.querySelector('.delivery-chip');
      if (chip) {
        chip.style.background = active ? 'var(--accent)' : 'var(--surface)';
        chip.style.color = active ? 'var(--accent-ink, #ffffff)' : 'var(--text-dim)';
        chip.style.border = `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`;
      }

      const simBox = card.querySelector('.delivery-simulation-box');
      if (simBox) {
        simBox.style.border = `1px dashed ${active ? 'var(--accent)' : 'var(--border)'}`;
      }
    });
  }

  // Handle AI Delivery Mode Selection
  document.querySelectorAll('[data-set-streaming-mode]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const mode = btn.dataset.setStreamingMode;
      if (!mode) return;
      window.State.streamingMode = mode;
      window._settingsDeliveryOpen = true; // Keep accordion open upon selection
      try { localStorage.setItem('sayad_streaming_mode', mode); } catch(e){}
      if (window.DB && window.DB.setting) {
        await window.DB.setting('streamingMode', mode);
      }
      const modeLabels = {
        sse: 'Word-By-Word Live Flow (ChatGPT Style)',
        typewriter: 'Smooth Morphic Card Wave',
        instant: 'Turbo Flash Jump'
      };
      window.toast(`Activated: ${modeLabels[mode] || mode}`);
      updateStreamingModeCardsDOM(mode);
    };
  });

  document.getElementById('btn-export').onclick = async ()=>{
    const annots = await window.DB.all('annotations');
    const bms = await window.DB.all('bookmarks');
    const notes = await window.DB.all('notes');
    const blob = new Blob([JSON.stringify({annots,bms,notes,files:window.State.files.map(f=>({id:f.id,name:f.name,folder:f.folder,subject:f.subject}))},null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'strata-backup.json'; a.click();
    window.toast('Backup exported');
  };
  document.getElementById('btn-import-backup').onclick = ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = async ()=>{
      const text = await inp.files[0].text();
      try{
        const data = JSON.parse(text);
        for(const a of data.annots||[]) await window.DB.put('annotations', a);
        for(const b of data.bms||[]) await window.DB.put('bookmarks', b);
        for(const n of data.notes||[]) await window.DB.put('notes', n);
        window.toast('Restore complete');
      }catch(e){ window.toast('Invalid backup file'); }
    };
    inp.click();
  };

  if (prevScroll > 0) {
    requestAnimationFrame(() => {
      window.scrollTo(0, prevScroll);
    });
  }
}

export function themeBtn(key,iconName,label){
  const active = window.State.theme===key;
  return `<button data-theme-btn="${key}" class="btn" style="flex:1; flex-direction:column; height:64px; gap:6px; font-size:11.5px; font-weight:600;
    background:${active?'var(--accent-soft)':'var(--surface-2)'}; color:${active?'var(--accent)':'var(--text-dim)'}; border:1px solid ${active?'var(--accent)':'var(--border)'};">
    ${window.icon(iconName)}<span>${label}</span>
  </button>`;
}

export function readingModeBtn(key,iconName,label,sub){
  const active = window.State.readingMode===key;
  return `<button data-reading-mode="${key}" class="btn" style="flex-direction:column; align-items:flex-start; justify-content:center; min-height:68px; padding:12px; gap:3px; text-align:left;
    background:${active?'var(--accent-soft)':'var(--surface-2)'}; color:${active?'var(--accent)':'var(--text)'}; border:1px solid ${active?'var(--accent)':'var(--border)'}; border-radius:12px;">
    <span style="font-size:13.5px; font-weight:800; line-height:1.2; color:${active?'var(--accent)':'var(--text)'};">${label}</span>
    <span style="font-size:11px; font-weight:500; line-height:1.3; color:${active?'var(--accent)':'var(--text-dim)'};">${sub}</span>
  </button>`;
}

export function optRow(key,label,sub,on){
  return `<div class="opt-row" data-opt="${key}">
    <div style="min-width:0;">
      <div style="font-size:14px; font-weight:600;">${label}</div>
      <div style="font-size:12px; color:var(--text-faint); margin-top:2px;">${sub}</div>
    </div>
    <div class="tgl ${on?'on':''}"></div>
  </div>`;
}

/* ============================================================
   REVIEW TAB (FSRS flashcard deck)
   ============================================================ */
function getViewScrollEl() {
  return document.querySelector('.view') || document.documentElement;
}

export async function renderReviewView(preserveScroll = true){
  if (window.State.view !== 'review') return;
  const scrollEl = getViewScrollEl();
  const prevScroll = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
  const all = await window.DB.all('flashcards');
  const now = Date.now();
  const due = all.filter(c=>!c.due || c.due<=now);
  const revised = all.filter(c=>c.reps>0).sort((a,b)=>(a.due||0)-(b.due||0));

  document.getElementById('app').innerHTML = `
  <div class="view fade-in" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:10; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border); margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('cards','icon icon-md')}
          </div>
          <div>
            <div class="font-display" style="font-size:20px; font-weight:800; letter-spacing:.02em; line-height:1.1;">Spaced Review</div>
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-top:3px; font-weight:600;">
              <span>${all.length} ${all.length===1?'card':'cards'} total</span>
              <span style="color:var(--text-faint); font-size:10px;">•</span>
              <span style="color:${due.length?'var(--accent)':'var(--text-dim)'}; font-weight:700;">${due.length} due today</span>
            </div>
          </div>
        </div>
        <div class="font-mono" style="padding:4px 10px; border-radius:12px; background:${due.length?'var(--accent)':'var(--surface-2)'}; color:${due.length?'#fff':'var(--text-dim)'}; border:1px solid ${due.length?'var(--accent)':'var(--border)'}; font-size:11px; font-weight:700;">
          ${due.length ? due.length + ' Due' : 'Up to date'}
        </div>
      </div>
    </div>

    <div style="padding:0 20px;">

    ${due.length? `
      <button class="btn btn-primary" id="start-review" style="width:100%; padding:15px; margin-bottom:24px; font-size:15px;">${window.icon('cards','icon icon-sm')} Study ${due.length} due card${due.length===1?'':'s'}</button>
    ` : window.emptyState('cards','All caught up','Generate flashcards from any passage using the AI tools while reading — they\u2019ll show up here on their review schedule.')}

    ${revised.length? `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <div class="section-title">Already revised (${revised.length})</div>
        <button class="btn" id="practice-revised" style="width:auto; height:auto; padding:6px 12px; background:var(--surface-2); color:var(--accent); font-size:11.5px; font-weight:700;">${window.icon('sparkle','icon icon-sm')} Practice all</button>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">Available anytime — practicing these won\u2019t change their schedule.</div>
      ${revised.map(c=>`<div class="card revise-one" data-id="${c.id}" style="padding:12px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <div style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65%;">${window.escapeHtml(c.front)}</div>
        <div class="font-mono" style="font-size:10.5px; color:var(--text-faint);">${c.due? 'due '+new Date(c.due).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''}</div>
      </div>`).join('')}
    `:''}
    </div>
  </div>
  ${window.bottomNavHtml('review')}`;
  window.bindBottomNav();

  const startBtn = document.getElementById('start-review');
  if(startBtn) startBtn.onclick = ()=>openReviewSession(due);
  const practiceBtn = document.getElementById('practice-revised');
  if(practiceBtn) practiceBtn.onclick = ()=>openReviewSession(revised.slice(), true);
  document.querySelectorAll('.revise-one').forEach(el=>{
    el.onclick = ()=>{
      const card = revised.find(c=>c.id===el.dataset.id);
      if(card) openReviewSession([card], true);
    };
  });

  if (prevScroll > 0) {
    requestAnimationFrame(() => {
      window.scrollTo(0, prevScroll);
    });
  }
}

export function openReviewSession(queue, practiceMode){
  let i = 0;
  let flipped = false;
  function draw(){
    if(i>=queue.length){
      window.Sheet.open(`
        <div style="text-align:center; padding:30px 10px;">
          <div style="color:var(--accent); margin-bottom:14px; display:flex; justify-content:center;">${window.icon('check','icon icon-lg')}</div>
          <div class="font-display" style="font-size:18px; font-weight:600; margin-bottom:6px;">Session complete</div>
          <div style="font-size:13.5px; color:var(--text-dim);">${practiceMode? 'Nice practice round — this didn\u2019t change any card\u2019s schedule.' : 'Nicely done — come back when the next batch is due.'}</div>
          <button class="btn btn-primary" style="width:100%; padding:13px; margin-top:18px;" id="review-done-close">Done</button>
        </div>`);
      if(window.State.view==='review') renderReviewView();
      const doneBtn = document.getElementById('review-done-close');
      if(doneBtn) doneBtn.onclick = ()=>window.Sheet.close();
      return;
    }
    const card = queue[i];
    flipped = false;
    window.Sheet.open(cardHtml(card, false, i, queue.length));
    bindCardEvents(card);
  }
  function cardHtml(card, showBack, idx, total){
    return `
      <div style="font-size:11.5px; color:var(--text-faint); text-align:center; margin-bottom:10px;">
        ${practiceMode? 'Practice · ':''}Card ${idx+1} of ${total}
      </div>
      <div id="flip-card" style="min-height:160px; background:var(--surface-2); border:1px solid var(--border); border-radius:4px; padding:22px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:16px; line-height:1.5; margin-bottom:16px; cursor:pointer;">
        ${window.escapeHtml(showBack? card.back : card.front)}
      </div>
      ${showBack? `
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">
          <button class="btn grade-btn" data-grade="1" style="flex-direction:column; height:56px; background:var(--surface-2); color:var(--danger); font-size:11.5px; gap:2px;">Again</button>
          <button class="btn grade-btn" data-grade="2" style="flex-direction:column; height:56px; background:var(--surface-2); color:var(--text); font-size:11.5px; gap:2px;">Hard</button>
          <button class="btn grade-btn" data-grade="3" style="flex-direction:column; height:56px; background:var(--surface-2); color:var(--teal); font-size:11.5px; gap:2px;">Good</button>
          <button class="btn grade-btn" data-grade="4" style="flex-direction:column; height:56px; background:var(--surface-2); color:var(--accent); font-size:11.5px; gap:2px;">Easy</button>
        </div>
      `: `<div style="text-align:center; font-size:12.5px; color:var(--text-faint);">Tap the card to reveal the answer</div>`}
    `;
  }
  function bindCardEvents(card){
    const flipEl = document.getElementById('flip-card');
    if(flipEl) flipEl.onclick = ()=>{
      window.Sheet.body.innerHTML = cardHtml(card, true, i, queue.length);
      bindGradeButtons(card);
    };
  }
  function bindGradeButtons(card){
    document.querySelectorAll('.grade-btn').forEach(b=>{
      b.onclick = async ()=>{
        if(!practiceMode){
          const grade = Number(b.dataset.grade);
          const updated = {...card, ...window.fsrsSchedule(card, grade)};
          await window.DB.put('flashcards', updated);
        }
        i++;
        draw();
      };
    });
  }
  draw();
}

/* ============================================================
   BOOKMARKS VIEW
   ============================================================ */
export async function renderBookmarksView(preserveScroll = true){
  if (window.State.view !== 'bookmarks') return;
  const scrollEl = getViewScrollEl();
  const prevScroll = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
  const bms = (await window.DB.all('bookmarks')).sort((a,b)=>a.page-b.page);
  const fileMap = Object.fromEntries(window.State.files.map(f=>[f.id,f]));
  const categories = [...new Set(bms.map(b=>b.category).filter(Boolean))].sort();
  const uncategorizedCount = bms.filter(b=>!b.category).length;
  const isNamedCollection = window.State.bookmarkFilter && window.State.bookmarkFilter!=='all' && window.State.bookmarkFilter!=='uncategorized';

  let shown = bms;
  if(window.State.bookmarkFilter==='uncategorized') shown = bms.filter(b=>!b.category);
  else if(isNamedCollection) shown = bms.filter(b=>b.category===window.State.bookmarkFilter);

  let listHtml;
  if(!shown.length){
    listHtml = window.emptyState('bookmark','No bookmarks here','Bookmark pages while reading and they\u2019ll show up here.');
  } else if(isNamedCollection){
    const byFile = {};
    for(const b of shown){ (byFile[b.fileId] = byFile[b.fileId]||[]).push(b); }
    listHtml = Object.entries(byFile).map(([fileId, group])=>{
      const f = fileMap[fileId];
      if(!f) return '';
      const pages = group.map(b=>b.page).sort((a,b)=>a-b);
      return `<div class="card" style="padding:14px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="width:40px; height:52px; border-radius:4px; overflow:hidden; flex-shrink:0; background:var(--surface-2);">
            ${f.thumb? `<img src="${f.thumb}" style="width:100%; height:100%; object-fit:cover;">`:''}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(f.name)}</div>
            <div class="font-mono" style="font-size:11px; color:var(--text-dim);">${pages.length} page${pages.length===1?'':'s'}: ${pages.join(', ')}</div>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
          ${group.sort((a,b)=>a.page-b.page).map(b=>`<span class="chip del-bm-chip" data-id="${b.id}" style="padding:5px 10px; font-size:11.5px;">p.${b.page} ${window.icon('x','icon icon-sm')}</span>`).join('')}
        </div>
        <button class="btn btn-primary open-collection" data-file="${fileId}" data-pages="${pages.join(',')}" style="width:100%; padding:11px; font-size:13px;">${window.icon('folder','icon icon-sm')} Open collection (${pages.length} pages, rest hidden)</button>
      </div>`;
    }).join('');
  } else {
    listHtml = shown.map(b=>{
      const f = fileMap[b.fileId];
      if(!f) return '';
      return `<div class="card bm-jump" data-file="${b.fileId}" data-page="${b.page}" style="display:flex; align-items:center; gap:12px; padding:12px; margin-bottom:10px; cursor:pointer;">
        <div style="width:40px; height:52px; border-radius:4px; overflow:hidden; flex-shrink:0; background:var(--surface-2);">
          ${f.thumb? `<img src="${f.thumb}" style="width:100%; height:100%; object-fit:cover;">`:''}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(f.name)}</div>
          <div class="font-mono" style="font-size:11px; color:var(--text-dim);">Page ${b.page}${b.category? ' · '+window.escapeHtml(b.category) : ''}</div>
        </div>
        <button class="btn del-bm-btn" data-id="${b.id}" style="width:30px; height:30px; background:transparent; color:var(--text-faint); flex-shrink:0;">${window.icon('trash','icon icon-sm')}</button>
      </div>`;
    }).join('');
  }

  document.getElementById('app').innerHTML = `
  <div class="view fade-in" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:10; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border); margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('bookmark','icon icon-md')}
          </div>
          <div>
            <div class="font-display" style="font-size:20px; font-weight:800; letter-spacing:.02em; line-height:1.1;">Bookmarks</div>
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-top:3px; font-weight:600;">
              <span>${bms.length} saved ${bms.length===1?'page':'pages'}</span>
              ${categories.length ? `<span style="color:var(--text-faint); font-size:10px;">•</span><span style="color:var(--accent); font-weight:700;">${categories.length} ${categories.length===1?'collection':'collections'}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="font-mono" style="padding:4px 10px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); font-size:11px; font-weight:700;">
          ${bms.length} Total
        </div>
      </div>
    </div>
    <div style="padding:0 20px;">
    ${categories.length? `
      <div style="display:flex; gap:8px; overflow-x:auto; margin-bottom:16px; padding-bottom:2px;">
        <div class="chip bm-filter ${(!window.State.bookmarkFilter||window.State.bookmarkFilter==='all')?'active':''}" data-filter="all">All (${bms.length})</div>
        ${categories.map(c=>`<div class="chip bm-filter ${window.State.bookmarkFilter===c?'active':''}" data-filter="${window.escapeHtml(c)}">${window.icon('folder','icon icon-sm')} ${window.escapeHtml(c)} (${bms.filter(b=>b.category===c).length})</div>`).join('')}
        ${uncategorizedCount? `<div class="chip bm-filter ${window.State.bookmarkFilter==='uncategorized'?'active':''}" data-filter="uncategorized">No collection (${uncategorizedCount})</div>`:''}
      </div>
    `:''}
    ${listHtml}
    </div>
  </div>
  ${window.bottomNavHtml('bookmarks')}`;
  window.bindBottomNav();

  document.querySelectorAll('.bm-filter').forEach(el=>{
    el.onclick = ()=>{ window.State.bookmarkFilter = el.dataset.filter; renderBookmarksView(); };
  });
  document.querySelectorAll('.bm-jump').forEach(el=>{
    el.onclick = ()=>{ window.openReader(el.dataset.file, Number(el.dataset.page)); };
  });
  document.querySelectorAll('.del-bm-btn').forEach(el=>{
    el.onclick = async (e)=>{
      e.stopPropagation();
      await window.DB.del('bookmarks', el.dataset.id);
      window.toast('Bookmark removed');
      renderBookmarksView();
    };
  });
  document.querySelectorAll('.del-bm-chip').forEach(el=>{
    el.onclick = async (e)=>{
      e.stopPropagation();
      await window.DB.del('bookmarks', el.dataset.id);
      window.toast('Removed from collection');
      renderBookmarksView();
    };
  });
  document.querySelectorAll('.open-collection').forEach(el=>{
    el.onclick = ()=>{
      const pages = el.dataset.pages.split(',').map(Number);
      window.openReader(el.dataset.file, pages[0], pages, window.State.bookmarkFilter);
    };
  });

  if (prevScroll > 0) {
    const el = getViewScrollEl();
    if (el) {
      el.scrollTop = prevScroll;
      requestAnimationFrame(() => {
        const e = getViewScrollEl();
        if (e) e.scrollTop = prevScroll;
      });
    }
  }
}

/* ============================================================
   NOTES VIEW
   ============================================================ */

function getNoteCategoryGroup(kind = '') {
  const k = (kind || '').toLowerCase();
  if (k.includes('dict') || k.includes('word')) return 'dictionary';
  if (k.includes('trans')) return 'translation';
  if (k.includes('quiz') || k.includes('revision') || k.includes('ai') || k.includes('mcq') || k.includes('summary')) return 'ai';
  return 'notes';
}

function getNoteCategoryInfo(kind = '') {
  const raw = (kind || '').trim();
  const k = raw.toLowerCase();
  if (k.includes('dict') || k.includes('word')) {
    return { group: 'dictionary', label: 'Dictionary Entry', emoji: '📖' };
  }
  if (k.includes('trans')) {
    const langMatch = raw.match(/\(([^)]+)\)/);
    const lang = langMatch ? ` (${langMatch[1]})` : '';
    return { group: 'translation', label: `Translation${lang}`, emoji: '🌐' };
  }
  if (k.includes('quiz') || k.includes('mcq')) {
    return { group: 'ai', label: 'MCQ Quiz', emoji: '⚡' };
  }
  if (k.includes('revision')) {
    return { group: 'ai', label: 'Revision Notes', emoji: '✨' };
  }
  if (k.includes('summary')) {
    return { group: 'ai', label: 'AI Summary', emoji: '🤖' };
  }
  if (!raw || k === 'note' || k === 'user note') {
    return { group: 'notes', label: 'User Note', emoji: '📝' };
  }
  const formatted = raw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return { group: 'notes', label: formatted, emoji: '📌' };
}

function formatNotePreviewHtml(n) {
  const kindLower = (n.kind || '').toLowerCase();
  const content = n.content || '';

  if (kindLower.includes('dict')) {
    const wordMatch = content.match(/Word:\s*([^\n\r]+?)(?=\s*(Part of Speech:|Hindi Meaning:|Definition:|$))/i);
    const posMatch = content.match(/Part of Speech:\s*([^\n\r]+?)(?=\s*(Hindi Meaning:|Definition:|Noun Plural:|Synonyms:|$))/i);
    const hindiMatch = content.match(/Hindi Meaning:\s*([^\n\r]+?)(?=\s*(Definition:|Noun Plural:|Synonyms:|Antonyms:|$))/i);
    const defMatch = content.match(/Definition:\s*([^\n\r]+?)(?=\s*(Noun Plural:|Synonyms:|Antonyms:|$))/i);

    const word = wordMatch ? wordMatch[1].trim() : '';
    const pos = posMatch ? posMatch[1].trim() : '';
    const hindi = hindiMatch ? hindiMatch[1].trim() : '';
    const def = defMatch ? defMatch[1].trim() : '';

    if (word || def) {
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
          <span style="font-size:15px; font-weight:800; color:var(--text);">${window.escapeHtml(word || 'Word')}</span>
          ${pos ? `<span style="font-size:10px; font-weight:700; background:var(--surface-2); color:var(--text-dim); padding:2px 7px; border-radius:6px; text-transform:lowercase; border:1px solid var(--border-subtle);">${window.escapeHtml(pos)}</span>` : ''}
          ${hindi ? `<span style="font-size:12.5px; font-weight:700; color:var(--accent);">${window.escapeHtml(hindi)}</span>` : ''}
        </div>
        <div style="font-size:13px; color:var(--text-dim); line-height:1.45; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
          ${window.escapeHtml(def || content)}
        </div>
      `;
    }
  }

  // Detect visual diagrams or images inside note
  const hasMermaid = /```(?:mermaid)?\s*(?:flowchart|graph|sequenceDiagram|mindmap|classDiagram)/i.test(content);
  const hasImage = /!\[(.*?)\]\(((?:https?:\/\/|\/api\/|\/|data:)[^\s)]+)\)/.exec(content);

  let visualPills = '';
  if (hasMermaid) {
    visualPills += `<span style="display:inline-flex; align-items:center; gap:4px; font-size:10px; font-weight:700; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); padding:2px 7px; border-radius:6px;">📊 Flowchart</span>`;
  }
  if (hasImage) {
    const imgTitle = (hasImage[1] || 'Visual Graphic').slice(0, 24);
    visualPills += `<span style="display:inline-flex; align-items:center; gap:4px; font-size:10px; font-weight:700; background:var(--teal-soft, rgba(20, 184, 166, 0.15)); color:var(--teal, #0d9488); border:1px solid var(--teal, #0d9488); padding:2px 7px; border-radius:6px;">🖼️ ${window.escapeHtml(imgTitle)}</span>`;
  }

  const cleanPreview = window.stripMarkdown(content);

  return `
    ${visualPills ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">${visualPills}</div>` : ''}
    <div style="font-size:13.5px; color:var(--text); line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">
      ${window.escapeHtml(cleanPreview)}
    </div>
  `;
}

export async function renderNotesView(preserveScroll = true){
  if (window.State.view !== 'notes') return;
  const scrollEl = getViewScrollEl();
  const prevScroll = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
  const notes = (await window.DB.all('notes')).sort((a,b)=>b.createdAt-a.createdAt);
  const fileMap = Object.fromEntries(window.State.files.map(f=>[f.id,f]));

  const currentFilter = window.State.notesFilter || 'all';

  const counts = {
    all: notes.length,
    notes: notes.filter(n => getNoteCategoryGroup(n.kind) === 'notes').length,
    dictionary: notes.filter(n => getNoteCategoryGroup(n.kind) === 'dictionary').length,
    translation: notes.filter(n => getNoteCategoryGroup(n.kind) === 'translation').length,
    ai: notes.filter(n => getNoteCategoryGroup(n.kind) === 'ai').length,
  };

  const filterTabs = [
    { key: 'all', label: `All (${notes.length})` },
    counts.notes ? { key: 'notes', label: `Notes (${counts.notes})` } : null,
    counts.dictionary ? { key: 'dictionary', label: `Dictionary (${counts.dictionary})` } : null,
    counts.translation ? { key: 'translation', label: `Translations (${counts.translation})` } : null,
    counts.ai ? { key: 'ai', label: `AI Notes (${counts.ai})` } : null,
  ].filter(Boolean);

  const filteredNotes = notes.filter(n => {
    if (currentFilter === 'all') return true;
    return getNoteCategoryGroup(n.kind) === currentFilter;
  });

  document.getElementById('app').innerHTML = `
  <div class="view fade-in" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:10; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border); margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('note','icon icon-md')}
          </div>
          <div>
            <div class="font-display" style="font-size:20px; font-weight:800; letter-spacing:.02em; line-height:1.1;">Study Notes</div>
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-top:3px; font-weight:600;">
              <span>${notes.length} ${notes.length===1?'note':'notes'} &amp; annotations</span>
            </div>
          </div>
        </div>
        <div class="font-mono" style="padding:4px 10px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); font-size:11px; font-weight:700;">
          ${notes.length} Saved
        </div>
      </div>

      ${notes.length > 0 ? `
      <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:2px;" class="no-scrollbar">
        ${filterTabs.map(t => `<div class="chip note-filter ${currentFilter === t.key ? 'active' : ''}" data-filter="${t.key}">${t.label}</div>`).join('')}
      </div>
      ` : ''}
    </div>

    <div style="padding:0 20px;">
    ${filteredNotes.length ? filteredNotes.map(n => {
      const f = fileMap[n.fileId];
      const info = getNoteCategoryInfo(n.kind);
      const previewHtml = formatNotePreviewHtml(n);
      return `<div class="card note-jump" data-id="${n.id}" data-file="${n.fileId}" data-page="${n.page}" style="padding:15px 16px; margin-bottom:12px; cursor:pointer; border-radius:14px; background:var(--surface); border:1px solid var(--border);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; gap:8px;">
          <span style="display:inline-flex; align-items:center; gap:5px; background:var(--surface-2); color:var(--accent); padding:3px 9px; border-radius:8px; font-size:11px; font-weight:700; white-space:nowrap; border:1px solid var(--border-subtle);">
            <span>${info.emoji}</span>
            <span>${window.escapeHtml(info.label)}</span>
          </span>
          <span style="font-size:11px; color:var(--text-dim); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:right;">
            ${f ? window.escapeHtml(f.name || '').slice(0, 24) : ''} · p.${n.page}
          </span>
        </div>
        ${previewHtml}
      </div>`;
    }).join('') : window.emptyState('note','No notes in this category','Write notes or save AI tools, dictionary entries, and translations while reading.')}
    </div>
  </div>
  ${window.bottomNavHtml('notes')}`;
  window.bindBottomNav();

  document.querySelectorAll('.note-filter').forEach(el => {
    el.onclick = () => {
      window.State.notesFilter = el.dataset.filter;
      renderNotesView();
    };
  });

  document.querySelectorAll('.note-jump').forEach(el=>{
    if(!el.dataset.file) return;
    const note = notes.find(n=>n.id===el.dataset.id);
    el.onclick = ()=>{ if(note) openNoteDetail(note, fileMap[note.fileId]); };
  });

  if (prevScroll > 0) {
    const el = getViewScrollEl();
    if (el) {
      el.scrollTop = prevScroll;
      requestAnimationFrame(() => {
        const e = getViewScrollEl();
        if (e) e.scrollTop = prevScroll;
      });
    }
  }
}

export function openNoteDetail(note, file){
  const info = getNoteCategoryInfo(note.kind);
  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:8px;">
      <span style="display:inline-flex; align-items:center; gap:5px; background:var(--surface-2); color:var(--accent); padding:4px 10px; border-radius:8px; font-size:12px; font-weight:700; border:1px solid var(--border-subtle);">
        <span>${info.emoji}</span>
        <span>${window.escapeHtml(info.label)}</span>
      </span>
      <span style="font-size:11px; color:var(--text-dim); font-weight:600;">${file ? window.escapeHtml(file.name || '').slice(0, 26) : ''} · p.${note.page}</span>
    </div>
    ${note.sourceText ? `<div style="font-size:12.5px; color:var(--text-dim); background:var(--surface-2); border-radius:8px; border:1px solid var(--border-subtle); padding:10px 12px; margin-bottom:14px; max-height:80px; overflow-y:auto; line-height:1.5;">"${window.escapeHtml((note.sourceText || '').slice(0, 260))}${(note.sourceText || '').length > 260 ? '…' : ''}"</div>` : ''}
    <div class="selectable-text note-body-rendered" style="font-size:14.5px; line-height:1.65; margin-bottom:20px; color:var(--text); word-break:break-word;">${window.renderMarkdown(note.content || '')}</div>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-ghost" style="flex:1;" id="note-goto">${window.icon('bookmark','icon icon-sm')} Go to page</button>
      <button class="btn btn-ghost" style="flex:1; color:var(--danger);" id="note-delete">${window.icon('trash','icon icon-sm')} Delete</button>
    </div>
  `);

  const sheetBody = window.Sheet?.body || document.getElementById('sheet-body');
  if (sheetBody) {
    if (typeof window.renderMermaidDiagrams === 'function') {
      window.renderMermaidDiagrams(sheetBody);
    }
    if (typeof window.renderMathFormulas === 'function') {
      window.renderMathFormulas(sheetBody);
    }
  }

  document.getElementById('note-goto').onclick = ()=>{ window.Sheet.close(); window.openReader(note.fileId, note.page); };
  document.getElementById('note-delete').onclick = async ()=>{
    await window.DB.del('notes', note.id);
    window.Sheet.close();
    window.toast('Note deleted');
    renderNotesView();
  };
}

// Bind to window for global availability
window.renderSettings = renderSettings;
window.renderReviewView = renderReviewView;
window.openReviewSession = openReviewSession;
window.renderBookmarksView = renderBookmarksView;
window.renderNotesView = renderNotesView;
window.openNoteDetail = openNoteDetail;
