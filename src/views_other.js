// @ts-nocheck
import QRCode from 'qrcode';
import { GUIDE, searchGuide, askHelpAI, logMiss } from './help_guide.js';

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

  const isAdv = window.State.settingsPage === 'advanced';
  document.getElementById('app').innerHTML = `
  <div class="view fade-in" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:10; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border); margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:12px;">
          ${isAdv ? `<button id="btn-adv-back" aria-label="Back to Settings" style="width:40px; height:40px; border-radius:12px; background:var(--surface-2); color:var(--text); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; cursor:pointer;">${window.icon('chevLeft','icon icon-md')}</button>` : `<div style="width:40px; height:40px; border-radius:12px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('settings','icon icon-md')}
          </div>`}
          <div>
            <div class="font-display" style="font-size:20px; font-weight:800; letter-spacing:.02em; line-height:1.1;">${isAdv ? 'Advanced' : 'Settings'}</div>
            <div style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-dim); margin-top:3px; font-weight:600;">
              <span>${isAdv ? 'AI, lock &amp; storage' : 'Preferences &amp; Reader Mode'}</span>
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

    ${!isAdv ? `
    <!-- Help & Guide -->
    <div class="card help-card" id="help-card">
      <div class="help-head"><div class="help-q">?</div><div><div class="help-title">Help &amp; Guide</div><div class="help-sub">App ke baare me kuch bhi poocho</div></div></div>
      <div class="help-box"><span>🔍</span><input id="help-input" type="search" placeholder="Jaise: PIN lock kaise lagaun?" autocomplete="off" enterkeyhint="search" /></div>
      <div id="help-out" class="help-out"></div>
    </div>
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
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">
        <button data-set-pro-theme="classic" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${((window.State.proTheme||'classic')==='classic')?'var(--accent-soft)':'var(--surface-2)'};
          color:${((window.State.proTheme||'classic')==='classic')?'var(--accent)':'var(--text)'};
          border:1.5px solid ${((window.State.proTheme||'classic')==='classic')?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">🏛️</span>
          <span>Classic</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Original Look</span>
        </button>
        <button data-set-pro-theme="editorial" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${window.State.proTheme==='editorial'?'var(--accent-soft)':'var(--surface-2)'};
          color:${window.State.proTheme==='editorial'?'var(--accent)':'var(--text)'};
          border:1.5px solid ${window.State.proTheme==='editorial'?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">📖</span>
          <span>Editorial</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Swiss Minimal</span>
        </button>
        <button data-set-pro-theme="notebook" class="btn" style="flex-direction:column; padding:10px 4px; height:74px; gap:3px; font-size:10.5px; font-weight:700; border-radius:10px;
          background:${window.State.proTheme==='notebook'?'var(--accent-soft)':'var(--surface-2)'};
          color:${window.State.proTheme==='notebook'?'var(--accent)':'var(--text)'};
          border:1.5px solid ${window.State.proTheme==='notebook'?'var(--accent)':'var(--border)'};">
          <span style="font-size:17px;">📓</span>
          <span>Notebook</span>
          <span style="font-size:9px; opacity:0.75; font-weight:500;">Doodle Study</span>
        </button>
      </div>
      <div style="font-size:11.5px; color:var(--text-faint); margin-top:10px; line-height:1.4;">
        Switches the visual DNA across all sheets, cards, controls, and dialogs.
      </div>
    </div>

    <!-- Performance -->
    <div class="section-title" style="margin-bottom:10px;">Performance</div>
    <div class="card" style="padding:4px 16px; margin-bottom:22px;">
      ${optRow('liteMotion','Animations kam karo','Smooth chalane ke liye: animations, blur aur shadows halke ho jaate hain', window.State.liteMotion)}
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

    <!-- Advanced (opens its own page) -->
    <div class="section-title" style="margin-bottom:10px;">Advanced</div>
    <button class="card" id="btn-open-advanced" style="width:100%; padding:14px 16px; margin-bottom:22px; display:flex; align-items:center; gap:12px; text-align:left; cursor:pointer; color:var(--text);">
      <div style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">${window.icon('settings','icon icon-sm')}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; font-weight:700;">Advanced</div>
        <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">AI keys, quota &amp; response style</div>
      </div>
      ${window.icon('chevRight','icon icon-sm')}
    </button>

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

      <details style="margin-bottom:12px;">
        <summary style="cursor:pointer; font-weight:700; color:var(--text); font-size:13px; padding:4px 0;">Full meaning, QR &amp; app link</summary>
        <div style="margin-top:10px;">
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

        </div>
      </details>
      S.A.Y.A.D. stores every book, note, and flashcard directly on this device using IndexedDB — nothing leaves your browser except AI requests and dictionary/OCR lookups you trigger yourself.
      <details style="margin-top:10px;"><summary style="cursor:pointer; font-size:12px; font-weight:700;">Credits</summary><div style="margin-top:6px; font-size:12px;">Built on: PDF.js (rendering), pdf-lib (annotated export), Tesseract.js (scanned-page OCR), Fuse.js (search), the Free Dictionary API, and a hand-implemented FSRS scheduler for spaced repetition.</div></details>
      <div class="font-mono" style="margin-top:12px; font-size:11px; color:var(--text-faint); border-top:1px solid var(--border); padding-top:10px;">S.A.Y.A.D V2</div>
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
            Applies the latest version. Your books, notes and highlights stay safe.
          </div>
        </div>
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

    ` : `
    <!-- AI Engine: multi-key vault -->
    <div class="section-title adv-title"><span>AI Engine</span><span class="adv-badge" id="adv-key-badge"></span></div>
    <div class="card adv-card" id="adv-keys-card">
      <div class="adv-lead">Apni keys daalo — Gemini, Groq ya OpenRouter. App khud pehchan leti hai, aur ek khatam ho to agli use karti hai.</div>
      <div id="adv-key-list"></div>
      <div class="adv-add">
        <div class="adv-add-row">
          <input type="password" id="adv-key-input" placeholder="API key paste karo…" autocomplete="off" spellcheck="false" />
          <button type="button" id="adv-key-eye" aria-label="Show or hide key">👁️</button>
        </div>
        <div class="adv-add-foot">
          <span id="adv-detect" class="adv-detect">Provider auto-detect hoga</span>
          <button class="btn btn-primary" id="adv-key-add" style="padding:9px 16px; font-size:12.5px; font-weight:800; border-radius:10px;">Add key</button>
        </div>
        <div id="adv-key-msg" class="adv-msg" style="display:none;"></div>
      </div>
      <div class="adv-links">
        <span>Free key:</span>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Gemini ↗</a>
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq ↗</a>
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter ↗</a>
        <button type="button" id="adv-key-testall" class="adv-link-btn">Sab check karo</button>
      </div>
    </div>

    <!-- AI Response & Delivery -->
    <div class="section-title adv-title"><span>AI Response Style</span><span class="adv-badge" id="settings-delivery-header-badge"></span></div>
    <div class="card adv-card" style="padding:14px;">
      <div class="adv-seg" id="adv-seg">
        ${[['sse','sparkle','Live Flow','Word by word'],['typewriter','cards','Wave','Section by section'],['instant','zap','Instant','Sab ek saath']].map(([m,ic,t,s]) => {
          const on = (window.State.streamingMode || 'sse') === m;
          return `<button type="button" data-set-streaming-mode="${m}" class="adv-seg-btn${on ? ' on' : ''}"><span class="adv-seg-ic">${window.icon(ic,'icon icon-sm')}</span><b>${t}</b><small>${s}</small></button>`;
        }).join('')}
      </div>
      <div class="adv-preview" id="adv-preview" data-mode="${window.State.streamingMode || 'sse'}"></div>
    </div>

    <!-- Privacy Lock -->
    <div class="section-title adv-title"><span>Privacy Lock</span><span class="adv-badge" id="lock-badge"></span></div>
    <div class="card adv-card" id="lock-card"></div>

    <!-- Storage Cleaner -->
    <div class="section-title adv-title"><span>Storage Cleaner</span><span class="adv-badge" id="clean-badge" data-on="0">Scan</span></div>
    <div class="card adv-card" id="clean-card">
      <div class="adv-lead">Purani, bina khuli books dhundh ke jagah khali karo. Delete hone par us book ke notes &amp; highlights bhi jaate hain — pehle Backup le lo.</div>
      <div id="clean-list"></div>
      <button class="btn btn-ghost" id="clean-scan" style="width:100%; justify-content:center; padding:11px; font-weight:800; border-radius:12px;">Books scan karo</button>
    </div>

    <!-- Reset -->
    <div class="section-title adv-title"><span>Reset App</span></div>
    <div class="card adv-card adv-danger" id="reset-card">
      <div class="adv-lead">Sab kuch mita do: books, notes, highlights, settings, keys, lock. Wapas nahi aayega. Pehle Backup le lena.</div>
      <input id="reset-input" class="adv-reset-input" placeholder="Confirm karne ke liye RESET type karo" autocomplete="off" autocapitalize="characters" />
      <button class="btn" id="reset-go" disabled style="width:100%; justify-content:center; padding:12px; font-weight:800; border-radius:12px;">Sab kuch erase karo</button>
    </div>


    `}
  </div>
  </div>
  ${window.bottomNavHtml('settings')}`;
  window.bindBottomNav();

  const openAdv = document.getElementById('btn-open-advanced');
  if (openAdv) openAdv.onclick = () => { window.State.settingsPage = 'advanced'; renderSettings(); window.scrollTo(0, 0); };
  const advBack = document.getElementById('btn-adv-back');
  if (advBack) advBack.onclick = () => { window.State.settingsPage = 'main'; renderSettings(); window.scrollTo(0, 0); };

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
      window.themeTransition(() => { document.documentElement.dataset.proTheme = chosen; }, b, chosen);
      try { localStorage.setItem('sayad_pro_theme', chosen); } catch(e){}
      if (window.DB && window.DB.setting) {
        await window.DB.setting('proTheme', chosen);
      }
      const label = chosen === 'editorial' ? '📖 Editorial Luxe' : chosen === 'notebook' ? '📓 Notebook' : '🏛️ Classic';
      window.toast(`Pro Theme set: ${label}`);
      updateProThemeButtonsDOM(chosen);
    };
  });

  document.querySelectorAll('[data-theme-btn]').forEach(b=>{
    b.onclick = async ()=>{
      const chosen = b.dataset.themeBtn;
      window.State.theme = chosen;
      window.State.autoTheme = false;
      window.themeTransition(() => {
        document.documentElement.dataset.theme = chosen;
        if (typeof window.syncThemeColorMeta === 'function') window.syncThemeColorMeta();
        updateThemeButtonsDOM(chosen);
      }, b, /dark|night|black|amoled/i.test(chosen) ? 'dark' : 'light');
      try { localStorage.setItem('sayad_theme', chosen); } catch(e){}
      await window.DB.setting('theme', chosen);
      await window.DB.setting('autoTheme', false);
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

      if(key==='liteMotion' && window.applyLiteMotion) window.applyLiteMotion(window.State.liteMotion);
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

  // ---- Help & Guide card ----
  const hIn = document.getElementById('help-input'), hOut = document.getElementById('help-out');
  if (hIn && hOut) {
    const esc = window.escapeHtml;
    const goTo = (g) => {
      const scroll = (id, sel) => setTimeout(() => {
        const el = sel ? document.querySelector(sel) : document.getElementById(id);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('help-flash'); setTimeout(() => el.classList.remove('help-flash'), 1600); }
      }, 120);
      if (g.t === 'adv') { window.State.settingsPage = 'advanced'; renderSettings(); window.scrollTo(0, 0); scroll(g.id); }
      else if (g.t === 'set') { if (window.State.settingsPage !== 'main') { window.State.settingsPage = 'main'; renderSettings(); } scroll(g.id, g.sel || (g.id ? '#' + g.id : null)); }
      else if (g.t === 'nav') { window.State.settingsPage = 'main'; const b = document.querySelector(`[data-nav="${g.n}"]`); if (b) b.click(); }
    };
    const answerCard = (e, others) => `<div class="help-ans"><div class="help-ans-t">${esc(e.title)}</div><div class="help-ans-a">${esc(e.a)}</div>
      ${e.go && e.go.length ? `<div class="help-go">${e.go.map((g, i) => `<button type="button" class="help-gobtn" data-gi="${i}">${esc(g.l)} →</button>`).join('')}</div>` : ''}
      ${others.length ? `<div class="help-more"><span>Ye bhi dekho:</span>${others.map(o => `<button type="button" data-more="${o.id}">${esc(o.title)}</button>`).join('')}</div>` : ''}</div>`;
    const showEntry = (e, others) => {
      hOut.innerHTML = answerCard(e, others);
      hOut.querySelectorAll('[data-gi]').forEach(b => b.onclick = () => goTo(e.go[+b.dataset.gi]));
      hOut.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { const x = GUIDE.find(g => g.id === b.dataset.more); showEntry(x, others.filter(o => o !== x).concat(e === x ? [] : [e]).slice(0, 2)); });
    };
    const aiBtn = (q) => navigator.onLine ? `<button type="button" class="help-ai" id="help-ai">✨ AI se poocho</button>` : `<div class="help-off">Offline ho — AI ke liye internet chahiye</div>`;
    const bindAI = (q) => { const b = document.getElementById('help-ai'); if (!b) return; b.onclick = async () => {
      b.disabled = true; b.textContent = 'AI soch raha hai…';
      const t = await askHelpAI(q);
      const box = document.createElement('div'); box.className = 'help-ans help-ai-ans';
      box.innerHTML = t ? `<div class="help-ans-t">✨ AI ne samjhaya</div><div class="help-ans-a">${esc(t)}</div>` : `<div class="help-ans-a">AI abhi jawab nahi de paaya. Thodi der baad try karo.</div>`;
      b.replaceWith(box); }; };
    const chips = ['PIN lock kaise lagaun', 'API key daalna', 'App slow hai', 'Backup lena'];
    const idle = () => { hOut.innerHTML = `<div class="help-chips">${chips.map(c => `<button type="button">${c}</button>`).join('')}</div>`;
      hOut.querySelectorAll('.help-chips button').forEach(b => b.onclick = () => { hIn.value = b.textContent; run(); }); };
    let timer = null;
    const run = () => {
      const q = hIn.value.trim();
      if (!q) return idle();
      const r = searchGuide(q, 3);
      if (r.length) { showEntry(r[0], r.slice(1)); const extra = document.createElement('div'); extra.id = 'help-ai-slot'; extra.innerHTML = aiBtn(q); hOut.appendChild(extra); bindAI(q); }
      else { logMiss(q); hOut.innerHTML = `<div class="help-ans"><div class="help-ans-a">Guide me ye nahi mila. Doosre shabd try karo (jaise "lock", "key", "backup").</div></div>` + aiBtn(q); bindAI(q); }
    };
    hIn.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 160); };
    idle();
  }

  // ---- Advanced: multi-key vault + response style ----
  const KV = window.KeyVault;
  const keyList = document.getElementById('adv-key-list');
  const keyMsg = (t, tone) => {
    const el = document.getElementById('adv-key-msg'); if (!el) return;
    el.style.display = t ? 'block' : 'none'; el.textContent = t || ''; el.dataset.tone = tone || '';
  };
  const paintKeys = () => {
    if (!keyList || !KV) return;
    const list = KV.list();
    const badge = document.getElementById('adv-key-badge');
    if (badge) { const live = list.filter(k => k.state !== 'bad' && k.state !== 'unsupported').length; badge.textContent = list.length ? `${live} active` : 'App default'; badge.dataset.on = list.length ? '1' : '0'; }
    if (!list.length) { keyList.innerHTML = `<div class="adv-empty">Abhi koi personal key nahi — app apni default key pool use kar rahi hai.</div>`; return; }
    keyList.innerHTML = list.map(k => {
      const P = KV.PROV[k.provider] || KV.PROV.unknown, st = KV.statusOf(k);
      return `<div class="kv-row" data-kid="${k.id}">
        ${KV.ringSvg(k)}
        <div class="kv-main">
          <div class="kv-top"><span class="kv-chip" style="--pc:${P.color}">${P.short}</span><span class="kv-label">${window.escapeHtml(k.label)}</span></div>
          <div class="kv-mask">${KV.mask(k)}</div>
          <div class="kv-status" data-tone="${st.tone}">${st.text}</div>
        </div>
        <div class="kv-actions">
          <button type="button" data-kv-refresh="${k.id}" aria-label="Check key" title="Check">↻</button>
          <button type="button" data-kv-del="${k.id}" aria-label="Remove key" title="Remove">✕</button>
        </div></div>`;
    }).join('');
    keyList.querySelectorAll('[data-kv-refresh]').forEach(b => b.onclick = async () => {
      b.classList.add('spin'); try { await KV.check(b.dataset.kvRefresh); } catch (e) { window.toast('Check fail: ' + e.message); } paintKeys();
    });
    keyList.querySelectorAll('[data-kv-del]').forEach(b => b.onclick = () => { KV.remove(b.dataset.kvDel); window.toast('Key hata di'); paintKeys(); });
  };
  if (KV && keyList) {
    paintKeys();
    // quietly refresh real quota for Groq/OpenRouter keys (cheap); Gemini is counted locally
    KV.list().filter(k => k.provider !== 'gemini' && k.state !== 'unsupported' && Date.now() - (k.checkedAt || 0) > 120000)
      .forEach(k => KV.check(k.id).then(paintKeys).catch(() => {}));
    const inp = document.getElementById('adv-key-input'), det = document.getElementById('adv-detect');
    const eye = document.getElementById('adv-key-eye'), add = document.getElementById('adv-key-add');
    const norm = (val) => (KV.clean ? KV.clean(val) : String(val || '').trim());
    const updateDetect = () => {
      const v = norm(inp.value); keyMsg('');
      if (!v) { det.textContent = 'Provider auto-detect hoga'; det.dataset.tone = ''; return; }
      const { provider: p, partial } = KV.detectHint ? KV.detectHint(v) : { provider: KV.detect(v), partial: false };
      const P = KV.PROV[p] || KV.PROV.unknown;
      if (p === 'unknown') {
        det.textContent = 'Pehchan nahi paayi…';
        det.style.setProperty('--pc', P.color); det.dataset.tone = 'dim';
      } else if (partial) {
        det.textContent = `${P.name} key lag rahi hai — poori key paste karo`;
        det.style.setProperty('--pc', P.color); det.dataset.tone = 'ok';
      } else {
        det.textContent = `✓ ${P.name} key${P.supported ? '' : ' (abhi supported nahi)'}`;
        det.style.setProperty('--pc', P.color); det.dataset.tone = 'ok';
      }
    };
    inp.oninput = updateDetect;
    inp.onchange = updateDetect;
    inp.onpaste = () => setTimeout(updateDetect, 0);
    eye.onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.textContent = inp.type === 'password' ? '👁️' : '🔒'; };
    add.onclick = async () => {
      const v = norm(inp.value); if (!v) return keyMsg('Pehle key paste karo', 'bad');
      add.disabled = true; add.textContent = 'Checking…'; keyMsg('Key verify ho rahi hai…', 'dim');
      try { const k = await KV.add(v); inp.value = ''; updateDetect(); keyMsg(''); window.toast(`${KV.PROV[k.provider].name} key add ho gayi 🎉`); paintKeys(); }
      catch (e) { keyMsg('❌ ' + e.message, 'bad'); }
      add.disabled = false; add.textContent = 'Add key';
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') add.click(); };
    document.getElementById('adv-key-testall').onclick = async (e) => {
      const list = KV.list();
      if (!list.length) { window.toast('Pehle koi API key add karo'); return; }
      const btn = e.currentTarget; btn.textContent = 'Checking…';
      for (const k of list) { try { await KV.check(k.id); } catch (er) {} paintKeys(); }
      btn.textContent = 'Sab check karo';
    };
    window._advKeysListener && window.removeEventListener('sayad-keys-changed', window._advKeysListener);
    window._advKeysListener = () => { if (document.getElementById('adv-key-list')) paintKeys(); };
    window.addEventListener('sayad-keys-changed', window._advKeysListener);
  }

  // ---- Privacy Lock card ----
  const lockCard = document.getElementById('lock-card');
  if (lockCard && window.AppLock) {
    const AL = window.AppLock;
    const lm = (t, bad) => { const e = lockCard.querySelector('.adv-msg'); if (e) { e.style.display = t ? 'block' : 'none'; e.textContent = t || ''; e.dataset.tone = bad ? 'bad' : ''; } };
    const paintLock = () => {
      const on = AL.enabled();
      const b = document.getElementById('lock-badge'); b.textContent = on ? 'On' : 'Off'; b.dataset.on = on ? '1' : '0';
      const dl = AL.delay();
      lockCard.innerHTML = on ? `
        <div class="adv-lead">App kholte hi (aur door jaane ke baad) PIN maangega. Ye casual logon se bachne ke liye hai, encryption nahi.</div>
        <div class="adv-lbl">Auto-lock kab?</div>
        <div class="adv-pills" id="lock-delay">${[[0,'Turant'],[60,'1 min'],[300,'5 min']].map(([v,t]) => `<button type="button" data-d="${v}" class="${dl === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="adv-btnrow"><button class="btn btn-ghost" id="lock-now">Abhi lock karo</button><button class="btn btn-ghost" id="lock-change">PIN badlo</button><button class="btn btn-ghost" id="lock-off" style="color:var(--danger,#ef4444)">Band karo</button></div>
        <div id="lock-form"></div><div class="adv-msg" style="display:none"></div>` : `
        <div class="adv-lead">4 digit PIN lagao. Fingerprint abhi support nahi hai.</div>
        <div id="lock-form"><div class="adv-pin-row"><input id="pin1" type="password" inputmode="numeric" maxlength="4" placeholder="Naya PIN" /><input id="pin2" type="password" inputmode="numeric" maxlength="4" placeholder="Dobara PIN" /></div>
        <button class="btn btn-primary" id="lock-save" style="width:100%; justify-content:center; padding:11px; font-weight:800; border-radius:12px; margin-top:10px;">Lock lagao</button></div><div class="adv-msg" style="display:none"></div>`;
      const save = lockCard.querySelector('#lock-save');
      if (save) save.onclick = async () => {
        const a = lockCard.querySelector('#pin1').value, c = lockCard.querySelector('#pin2').value;
        if (!/^\d{4}$/.test(a)) return lm('PIN 4 digit ka hona chahiye', 1);
        if (a !== c) return lm('Dono PIN match nahi kar rahe', 1);
        await AL.setPin(a, 0); window.toast('Privacy Lock on 🔒'); paintLock();
      };
      lockCard.querySelectorAll('#lock-delay [data-d]').forEach(x => x.onclick = () => { AL.setDelay(+x.dataset.d); paintLock(); });
      const now = lockCard.querySelector('#lock-now'); if (now) now.onclick = () => AL.lock();
      const ch = lockCard.querySelector('#lock-change'), off = lockCard.querySelector('#lock-off');
      const askPin = (label, cb) => {
        lockCard.querySelector('#lock-form').innerHTML = `<div class="adv-pin-row"><input id="pin0" type="password" inputmode="numeric" maxlength="4" placeholder="Abhi ka PIN" />${label === 'change' ? '<input id="pin1" type="password" inputmode="numeric" maxlength="4" placeholder="Naya PIN" />' : ''}</div><button class="btn btn-primary" id="pin-ok" style="width:100%; justify-content:center; padding:11px; font-weight:800; border-radius:12px; margin-top:10px;">Confirm</button>`;
        lockCard.querySelector('#pin-ok').onclick = async () => {
          if (!(await AL.verify(lockCard.querySelector('#pin0').value))) return lm('Abhi ka PIN galat hai', 1);
          try { await cb(lockCard.querySelector('#pin1') && lockCard.querySelector('#pin1').value); } catch (e) { return lm(e.message, 1); }
          paintLock();
        };
      };
      if (ch) ch.onclick = () => askPin('change', async (n) => { await AL.setPin(n); window.toast('PIN badal gaya'); });
      if (off) off.onclick = () => askPin('off', async () => { AL.disable(); window.toast('Privacy Lock band'); });
    };
    paintLock();
  }

  // ---- Storage Cleaner ----
  const cleanBtn = document.getElementById('clean-scan');
  if (cleanBtn) cleanBtn.onclick = async () => {
    const list = document.getElementById('clean-list'), badge = document.getElementById('clean-badge');
    cleanBtn.disabled = true; cleanBtn.textContent = 'Scan ho raha hai…';
    const rows = []; const files = (window.State.files || []).filter(f => f.folder !== 'Sample');
    for (const f of files) {
      let size = 0; try { const r = await window.DB.get('files', f.id); const d = r && r.data; size = d ? (d.byteLength || d.size || 0) : 0; } catch (e) {}
      const days = f.lastOpened ? Math.floor((Date.now() - f.lastOpened) / 86400000) : null;
      rows.push({ f, size, days, stale: days == null || days >= 60 });
    }
    rows.sort((a, b) => (b.stale - a.stale) || (b.size - a.size));
    const mb = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
    if (!rows.length) { list.innerHTML = '<div class="adv-empty">Koi book nahi mili.</div>'; }
    else {
      list.innerHTML = rows.map(r => `<label class="cl-row"><input type="checkbox" data-cid="${r.f.id}" data-sz="${r.size}" ${r.stale ? 'checked' : ''} /><span class="cl-main"><b>${window.escapeHtml((r.f.name || 'Book').replace(/\.pdf$/i, ''))}</b><small>${r.days == null ? 'Kabhi nahi khuli' : r.days === 0 ? 'Aaj khuli' : r.days + ' din pehle khuli'}</small></span><span class="cl-size">${mb(r.size)}</span></label>`).join('')
        + `<div class="cl-foot"><span id="cl-sum"></span><button class="btn btn-ghost" id="cl-del" style="color:var(--danger,#ef4444); border-color:var(--danger,#ef4444); font-weight:800; border-radius:10px;">Delete</button></div>`;
      const sum = () => { const cs = [...list.querySelectorAll('[data-cid]:checked')]; document.getElementById('cl-sum').textContent = cs.length ? `${cs.length} selected · ${mb(cs.reduce((a, c) => a + +c.dataset.sz, 0))}` : 'Kuch select nahi'; document.getElementById('cl-del').disabled = !cs.length; };
      list.querySelectorAll('[data-cid]').forEach(c => c.onchange = sum); sum();
      const stale = rows.filter(r => r.stale);
      badge.textContent = stale.length ? `${stale.length} purani · ${mb(stale.reduce((a, r) => a + r.size, 0))}` : 'Sab fresh'; badge.dataset.on = stale.length ? '0' : '1';
      let armed = false; const del = document.getElementById('cl-del');
      del.onclick = async () => {
        if (!armed) { armed = true; del.textContent = 'Pakka? Dobara tap karo'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3500); return; }
        del.disabled = true; del.textContent = 'Delete ho rahi hain…';
        for (const c of [...list.querySelectorAll('[data-cid]:checked')]) { try { await window.deleteBookAndOrphans(c.dataset.cid); } catch (e) {} }
        window.toast('Jagah khali ho gayi 🧹'); cleanBtn.disabled = false; cleanBtn.click();
      };
    }
    cleanBtn.disabled = false; cleanBtn.textContent = 'Dobara scan karo';
  };

  // ---- Reset ----
  const ri = document.getElementById('reset-input'), rg = document.getElementById('reset-go');
  if (ri && rg) { ri.oninput = () => { rg.disabled = ri.value.trim() !== 'RESET'; rg.classList.toggle('armed', !rg.disabled); };
    rg.onclick = () => { rg.disabled = true; rg.textContent = 'Erase ho raha hai…'; window.resetEverything(); }; }

  // Response style
  const STYLE = {
    sse: { badge: '● Live Flow', demo: 'The molecule enters the cycle word by word<span class="ai-typing-cursor">▌</span>' },
    typewriter: { badge: '● Wave', demo: '<i>▤ Section 1</i> → <i>▤ Key points</i> → <i>📊 Flowchart</i>' },
    instant: { badge: '● Instant', demo: 'Poora jawab ek hi frame me — zero wait' },
  };
  const paintStyle = (mode) => {
    const b = document.getElementById('settings-delivery-header-badge'); if (b) b.textContent = (STYLE[mode] || STYLE.sse).badge;
    const pv = document.getElementById('adv-preview'); if (pv) { pv.dataset.mode = mode; pv.innerHTML = (STYLE[mode] || STYLE.sse).demo; }
    document.querySelectorAll('[data-set-streaming-mode]').forEach(x => x.classList.toggle('on', x.dataset.setStreamingMode === mode));
  };
  paintStyle(window.State.streamingMode || 'sse');
  document.querySelectorAll('[data-set-streaming-mode]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const mode = btn.dataset.setStreamingMode; if (!mode) return;
      window.State.streamingMode = mode;
      try { localStorage.setItem('sayad_streaming_mode', mode); } catch (e) {}
      if (window.DB && window.DB.setting) await window.DB.setting('streamingMode', mode);
      paintStyle(mode);
    };
  });

  // Backup = everything you made (not the PDFs themselves and not rebuildable caches).
  const BACKUP_STORES = ['annotations','bookmarks','notes','flashcards','papers','progress','settings','summaries','chathistory'];
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.onclick = async ()=>{
    const out = { app: 'strata', version: 2, exportedAt: new Date().toISOString(), stores: {},
      files: window.State.files.map(f=>({id:f.id,name:f.name,folder:f.folder,subject:f.subject})) };
    for (const st of BACKUP_STORES) { try { out.stores[st] = await window.DB.all(st); } catch(e) { out.stores[st] = []; } }
    // keep the old keys so older builds can still read this file
    out.annots = out.stores.annotations; out.bms = out.stores.bookmarks; out.notes = out.stores.notes;
    const blob = new Blob([JSON.stringify(out)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'strata-backup.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const n = Object.values(out.stores).reduce((t, r) => t + r.length, 0);
    window.toast('Backup exported (' + n + ' items)');
  };
  const btnRestore = document.getElementById('btn-import-backup');
  if (btnRestore) btnRestore.onclick = ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = async ()=>{
      if (!inp.files || !inp.files[0]) return;
      const text = await inp.files[0].text();
      try{
        const data = JSON.parse(text);
        const stores = data.stores || { annotations: data.annots, bookmarks: data.bms, notes: data.notes };
        let n = 0;
        for (const st of BACKUP_STORES) for (const rec of (stores[st] || [])) { await window.DB.put(st, rec); n++; }
        window.toast('Restore complete (' + n + ' items). Books ki PDF files dobara add karni padengi agar wo is phone me nahi hain.');
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
      ${revised.map(c=>`<div class="card revise-one" data-id="${c.id}" style="padding:10px 10px 10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:8px; cursor:pointer;">
        <div style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0;">${window.escapeHtml(c.front)}</div>
        <div class="font-mono" style="font-size:10.5px; color:var(--text-faint); flex-shrink:0;">${c.due? 'due '+new Date(c.due).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''}</div>
        <button class="icon-btn del-card" data-id="${c.id}" title="Delete card" style="width:28px; height:28px; color:var(--text-faint); flex-shrink:0;">${window.icon('trash','icon icon-sm')}</button>
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
  document.querySelectorAll('.del-card').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      await window.DB.del('flashcards', btn.dataset.id);
      window.toast('Card deleted');
      renderReviewView();
    };
  });
  document.querySelectorAll('.revise-one').forEach(el=>{
    el.onclick = (e)=>{
      if(e.target.closest('.del-card')) return;
      const card = revised.find(c=>c.id===el.dataset.id);
      if(card) openReviewSession([card], true);
    };
  });
  document.querySelectorAll('.del-card').forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      await window.DB.del('flashcards', btn.dataset.id);
      window.toast('Card deleted');
      renderReviewView();
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
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
        <span style="width:28px;"></span>
        <div style="font-size:11.5px; color:var(--text-faint);">
          ${practiceMode? 'Practice · ':''}Card ${idx+1} of ${total}
        </div>
        <button class="icon-btn" id="review-del-card" title="Delete this card" style="width:28px; height:28px; color:var(--text-faint);">${window.icon('trash','icon icon-sm')}</button>
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
      <div style="text-align:center; margin-top:12px;"><button class="btn" id="review-del-card" style="width:auto; height:auto; padding:5px 12px; background:transparent; color:var(--text-faint); font-size:11.5px;">${window.icon('trash','icon icon-sm')} Delete this card</button></div>
    `;
  }
  function bindDeleteBtn(card){
    const delBtn = document.getElementById('review-del-card');
    if(delBtn) delBtn.onclick = async ()=>{
      await window.DB.del('flashcards', card.id);
      queue.splice(i, 1);
      window.toast('Card deleted');
      draw();
    };
  }
  function bindCardEvents(card){
    bindDeleteBtn(card);
    const flipEl = document.getElementById('flip-card');
    if(flipEl) flipEl.onclick = ()=>{
      window.Sheet.body.innerHTML = cardHtml(card, true, i, queue.length);
      bindDeleteBtn(card);
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
          <span style="font-size:15px; font-weight:800; color:var(--text); min-width:0; overflow-wrap:anywhere;">${window.escapeHtml(word || 'Word')}</span>
          ${pos ? `<span style="font-size:10px; font-weight:700; background:var(--surface-2); color:var(--text-dim); padding:2px 7px; border-radius:6px; text-transform:lowercase; border:1px solid var(--border-subtle);">${window.escapeHtml(pos)}</span>` : ''}
          ${hindi ? `<span style="font-size:12.5px; font-weight:700; color:var(--accent);">${window.escapeHtml(hindi)}</span>` : ''}
        </div>
        <div class="nt-clamp nt-clamp-2" style="font-size:13px; color:var(--text-dim);">
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
    <div class="nt-clamp nt-clamp-3" style="font-size:13.5px; color:var(--text);">
      ${window.escapeHtml(cleanPreview)}
    </div>
  `;
}

const NOTE_SECTIONS = [
  { key: 'notes',       emoji: '📝', title: 'My Notes',     hint: 'Notes you wrote while reading' },
  { key: 'dictionary',  emoji: '📖', title: 'Dictionary',   hint: 'Words you looked up' },
  { key: 'translation', emoji: '🌐', title: 'Translations', hint: 'Passages you translated' },
  { key: 'ai',          emoji: '✨', title: 'AI Notes',     hint: 'Summaries, revision notes and quizzes' },
];

function noteFileName(note, file, ext = 'md') {
  const info = getNoteCategoryInfo(note.kind);
  const raw = [info.label, file?.name ? String(file.name).replace(/\.pdf$/i, '') : '', note.page ? `p${note.page}` : '']
    .filter(Boolean).join(' ');
  const safe = raw.replace(/[^\p{L}\p{N}\s_-]+/gu, ' ').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `${safe || 'note'}.${ext}`;
}

function noteToMarkdown(note, file) {
  const info = getNoteCategoryInfo(note.kind);
  const lines = [`# ${info.label}`, ''];
  const meta = [];
  if (file?.name) meta.push(`Book: ${file.name}`);
  if (note.page) meta.push(`Page: ${note.page}`);
  if (note.createdAt) meta.push(`Saved: ${new Date(note.createdAt).toLocaleDateString()}`);
  if (meta.length) lines.push(`_${meta.join(' · ')}_`, '');
  if (note.sourceText) lines.push(...String(note.sourceText).trim().split('\n').map(l => `> ${l}`), '');
  lines.push((note.content || note.text || '').trim(), '', '_Exported from S.A.Y.A.D._', '');
  return lines.join('\n');
}

function downloadNote(note, file) {
  const url = URL.createObjectURL(new Blob([noteToMarkdown(note, file)], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = noteFileName(note, file);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  window.toast('Note downloaded');
}

function openNoteEditor(note, file) {
  const info = getNoteCategoryInfo(note.kind);
  window.Sheet.open(`
    <div style="display:flex; align-items:center; gap:8px; margin:6px 0 12px; min-width:0;">
      <span style="flex:0 0 auto;">${info.emoji}</span>
      <div class="font-display" style="font-size:17px; font-weight:700; min-width:0; overflow-wrap:anywhere;">Edit ${window.escapeHtml(info.label)}</div>
    </div>
    ${note.sourceText ? `<div style="font-size:12.5px; color:var(--text-dim); background:var(--surface-2); border-radius:8px; border:1px solid var(--border-subtle); padding:10px 12px; margin-bottom:12px; max-height:70px; overflow:auto; line-height:1.5; overflow-wrap:anywhere;">"${window.escapeHtml(String(note.sourceText).slice(0, 220))}${String(note.sourceText).length > 220 ? '…' : ''}"</div>` : ''}
    <textarea id="note-edit-text" class="nt-edit-area" rows="8" placeholder="Write your note…">${window.escapeHtml(note.content || '')}</textarea>
    <div style="display:flex; gap:10px;">
      <button class="btn btn-ghost" style="flex:1; padding:12px;" id="note-edit-cancel">Cancel</button>
      <button class="btn btn-primary" style="flex:1; padding:12px;" id="note-edit-save">Save changes</button>
    </div>
  `);
  const area = document.getElementById('note-edit-text');
  document.getElementById('note-edit-cancel').onclick = () => window.Sheet.close();
  document.getElementById('note-edit-save').onclick = async () => {
    const content = area.value.trim();
    if (!content) { window.toast('Note cannot be empty — delete it instead'); return; }
    if (content === (note.content || '').trim()) { window.Sheet.close(); return; }
    await window.DB.put('notes', { ...note, content, updatedAt: Date.now() });
    window.Sheet.close();
    window.toast('Note updated');
    renderNotesView();
  };
}

function confirmDeleteNote(note, file) {
  const info = getNoteCategoryInfo(note.kind);
  const preview = window.stripMarkdown ? window.stripMarkdown(note.content || '') : (note.content || '');
  window.Sheet.open(`
    <div style="text-align:center; padding:8px 4px 4px;">
      <div style="color:var(--danger); margin-bottom:12px; display:flex; justify-content:center;">${window.icon('trash', 'icon icon-lg')}</div>
      <div class="font-display" style="font-size:16px; font-weight:600; margin-bottom:6px; overflow-wrap:anywhere;">Delete this ${window.escapeHtml(info.label.toLowerCase())}?</div>
      <div style="font-size:13px; color:var(--text-dim); margin-bottom:18px; max-height:60px; overflow:hidden; overflow-wrap:anywhere;">"${window.escapeHtml(preview.slice(0, 90))}${preview.length > 90 ? '…' : ''}"</div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" style="flex:1; padding:12px;" id="note-del-cancel">Keep it</button>
        <button class="btn" style="flex:1; padding:12px; background:var(--danger); color:#fff;" id="note-del-confirm">Delete</button>
      </div>
    </div>
  `);
  document.getElementById('note-del-cancel').onclick = () => window.Sheet.close();
  document.getElementById('note-del-confirm').onclick = async () => {
    await window.DB.del('notes', note.id);
    window.Sheet.close();
    window.toast('Note deleted');
    renderNotesView();
  };
}

function noteCardHtml(n, file) {
  const info = getNoteCategoryInfo(n.kind);
  const where = [file ? String(file.name || '').replace(/\.pdf$/i, '') : '', n.page ? `p.${n.page}` : ''].filter(Boolean).join(' · ');
  return `<div class="nt-card" data-id="${window.escapeHtml(String(n.id))}">
    <div class="nt-card-main">
      <div class="nt-card-top">
        <span class="nt-kind"><span>${info.emoji}</span><span style="overflow:hidden; text-overflow:ellipsis;">${window.escapeHtml(info.label)}</span></span>
        <span class="nt-where">${window.escapeHtml(where)}</span>
      </div>
      <div class="nt-body">${formatNotePreviewHtml(n)}</div>
    </div>
    <div class="nt-actions">
      <button class="nt-act" data-act="edit" aria-label="Edit note">${window.icon('edit', 'icon icon-xs')}<span>Edit</span></button>
      <button class="nt-act" data-act="download" aria-label="Download note">${window.icon('download', 'icon icon-xs')}<span>Download</span></button>
      <button class="nt-act danger" data-act="delete" aria-label="Delete note">${window.icon('trash', 'icon icon-xs')}<span>Delete</span></button>
    </div>
  </div>`;
}

export async function renderNotesView(preserveScroll = true){
  if (window.State.view !== 'notes') return;
  const scrollEl = getViewScrollEl();
  const prevScroll = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
  const notes = (await window.DB.all('notes')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const fileMap = Object.fromEntries(window.State.files.map(f=>[f.id,f]));

  const byGroup = Object.fromEntries(NOTE_SECTIONS.map(s => [s.key, []]));
  for (const n of notes) byGroup[getNoteCategoryGroup(n.kind)].push(n);

  let currentFilter = window.State.notesFilter || 'all';
  if (currentFilter !== 'all' && !byGroup[currentFilter]?.length) currentFilter = 'all';

  const filterTabs = [
    { key: 'all', label: `All (${notes.length})` },
    ...NOTE_SECTIONS.filter(s => byGroup[s.key].length).map(s => ({ key: s.key, label: `${s.title} (${byGroup[s.key].length})` })),
  ];

  const visible = NOTE_SECTIONS.filter(s => byGroup[s.key].length && (currentFilter === 'all' || currentFilter === s.key));

  const sectionsHtml = visible.length ? visible.map(s => `
    <section class="nt-section" data-section="${s.key}">
      <div class="nt-section-head">
        <div class="nt-section-badge">${s.emoji}</div>
        <div class="nt-section-text">
          <div class="nt-section-title font-display">${s.title}</div>
          <div class="nt-section-hint">${s.hint}</div>
        </div>
        <span class="nt-section-count font-mono">${byGroup[s.key].length}</span>
      </div>
      ${byGroup[s.key].map(n => noteCardHtml(n, fileMap[n.fileId])).join('')}
    </section>`).join('')
    : window.emptyState('note','No notes yet','Write notes or save AI tools, dictionary entries, and translations while reading.');

  document.getElementById('app').innerHTML = `
  <div class="view fade-in">
    <div class="nt-wrap">
      <div class="nt-head">
        <div class="nt-head-top">
          <div class="nt-head-icon">${window.icon('note','icon icon-md')}</div>
          <div class="nt-head-text">
            <h1 class="nt-title font-display">Study Notes</h1>
            <div class="nt-sub">${notes.length} ${notes.length===1?'note':'notes'} &amp; annotations</div>
          </div>
          ${notes.length ? `<div class="nt-head-actions">
            <span class="nt-count font-mono">${notes.length} Saved</span>
            <button id="notes-export" class="btn btn-ghost nt-export">${window.icon('download','icon icon-xs')} Export all</button>
          </div>` : ''}
        </div>
        ${notes.length > 0 ? `<div class="nt-filters no-scrollbar">
          ${filterTabs.map(t => `<div class="chip note-filter ${currentFilter === t.key ? 'active' : ''}" data-filter="${t.key}">${window.escapeHtml(t.label)}</div>`).join('')}
        </div>` : ''}
      </div>
      ${sectionsHtml}
    </div>
  </div>
  ${window.bottomNavHtml('notes')}`;
  window.bindBottomNav();

  const expBtn = document.getElementById('notes-export');
  if (expBtn) expBtn.onclick = () => {
    const groups = {};
    for (const n of notes) { const f = fileMap[n.fileId]; const k = f ? f.name : 'General'; (groups[k] ||= []).push(n); }
    let md = '# My Study Notes\n\n_Exported from S.A.Y.A.D. on ' + new Date().toLocaleDateString() + '_\n';
    for (const [book, list] of Object.entries(groups)) {
      md += `\n## ${book}\n`;
      for (const n of list.sort((a, b) => (a.page || 0) - (b.page || 0))) {
        const info = getNoteCategoryInfo(n.kind);
        md += `\n### ${info.label} · page ${n.page || '-'}\n${(n.content || n.text || '').trim()}\n`;
      }
    }
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'sayad-notes.md'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    window.toast('Notes exported');
  };

  document.querySelectorAll('.note-filter').forEach(el => {
    el.onclick = () => {
      window.State.notesFilter = el.dataset.filter;
      renderNotesView(false);
    };
  });

  const noteById = Object.fromEntries(notes.map(n => [String(n.id), n]));
  document.querySelectorAll('.nt-card').forEach(card => {
    const note = noteById[card.dataset.id];
    if (!note) return;
    const file = fileMap[note.fileId];
    card.onclick = () => openNoteDetail(note, file);
    card.querySelectorAll('.nt-act').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.act === 'edit') openNoteEditor(note, file);
        else if (btn.dataset.act === 'download') downloadNote(note, file);
        else if (btn.dataset.act === 'delete') confirmDeleteNote(note, file);
      };
    });
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
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:8px; min-width:0;">
      <span style="display:inline-flex; align-items:center; gap:5px; flex:0 0 auto; max-width:55%; background:var(--surface-2); color:var(--accent); padding:4px 10px; border-radius:8px; font-size:12px; font-weight:700; border:1px solid var(--border-subtle); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        <span>${info.emoji}</span>
        <span style="overflow:hidden; text-overflow:ellipsis;">${window.escapeHtml(info.label)}</span>
      </span>
      <span style="font-size:11px; color:var(--text-dim); font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file ? window.escapeHtml(String(file.name || '').slice(0, 26)) : ''}${note.page ? ` · p.${note.page}` : ''}</span>
    </div>
    ${note.sourceText ? `<div style="font-size:12.5px; color:var(--text-dim); background:var(--surface-2); border-radius:8px; border:1px solid var(--border-subtle); padding:10px 12px; margin-bottom:14px; max-height:80px; overflow-y:auto; line-height:1.5; overflow-wrap:anywhere;">"${window.escapeHtml((note.sourceText || '').slice(0, 260))}${(note.sourceText || '').length > 260 ? '…' : ''}"</div>` : ''}
    <div class="selectable-text note-body-rendered" style="font-size:14.5px; line-height:1.65; margin-bottom:20px; color:var(--text); word-break:break-word; overflow-wrap:anywhere;">${window.renderMarkdown(note.content || '')}</div>
    <div class="nt-detail-actions">
      <button class="btn btn-ghost" id="note-goto" ${file ? '' : 'disabled style="opacity:.5;"'}>${window.icon('bookmark','icon icon-sm')} Go to page</button>
      <button class="btn btn-ghost" id="note-edit">${window.icon('edit','icon icon-sm')} Edit</button>
      <button class="btn btn-ghost" id="note-download">${window.icon('download','icon icon-sm')} Download</button>
      <button class="btn btn-ghost" style="color:var(--danger);" id="note-delete">${window.icon('trash','icon icon-sm')} Delete</button>
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

  document.getElementById('note-goto').onclick = ()=>{ if (!file) return; window.Sheet.close(); window.openReader(note.fileId, note.page); };
  document.getElementById('note-edit').onclick = ()=> openNoteEditor(note, file);
  document.getElementById('note-download').onclick = ()=> downloadNote(note, file);
  document.getElementById('note-delete').onclick = ()=> confirmDeleteNote(note, file);
}

// Bind to window for global availability
window.renderSettings = renderSettings;
window.renderReviewView = renderReviewView;
window.openReviewSession = openReviewSession;
window.renderBookmarksView = renderBookmarksView;
window.renderNotesView = renderNotesView;
window.openNoteDetail = openNoteDetail;
