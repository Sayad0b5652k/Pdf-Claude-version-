import { toggleFocusMode, updateReaderZoom, mountReaderContent } from './reader.js';
import { startAutoScroll, stopAutoScroll, renderAutoScrollController, getAutoScrollSpeed, setAutoScrollSpeed } from './reader_autoscroll.js';
// @ts-nocheck
// Split out of reader.js (no behaviour change). Shared reader helpers come back in through ./reader.js.
export function openReaderSettings(){
  if (window.hideSelToolbar) window.hideSelToolbar();
  window.pendingSelection = null;
  const file = window.State.currentFile;
  const currentGoal = window.State.readingGoalMinutes || 0;
  const sessionStart = window.State.sessionStartTime || Date.now();
  const elapsedMs = Math.max(0, Date.now() - sessionStart);
  const elapsedMins = Math.floor(elapsedMs / 60000);
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000);
  const isFocus = !!window.State.isFocusMode;
  const isAlphaWaves = !!window.State.alphaWavesEnabled;

  if (window._readerSettingsTimer) {
    clearInterval(window._readerSettingsTimer);
    window._readerSettingsTimer = null;
  }

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div class="font-display" style="font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px; color:var(--text);">
          ${window.icon('settings','icon icon-sm')} <span>Reader Settings</span>
        </div>
      </div>

      <!-- 1. Reading Goal Section -->
      <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="font-size:14px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
            ${window.icon('clock','icon icon-xs')} 🎯 Reading Goal Tracker
          </div>
          <span id="reader-settings-goal-badge" style="font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:10px; background:${currentGoal > 0 ? 'var(--accent-soft)' : 'var(--bg-elev)'}; color:${currentGoal > 0 ? 'var(--accent)' : 'var(--text-dim)'}; border:1px solid ${currentGoal > 0 ? 'var(--accent)' : 'var(--border)'};">
            ${currentGoal > 0 ? `${currentGoal} min Goal` : 'Off'}
          </span>
        </div>

        <div id="reader-settings-goal-content">
          ${currentGoal > 0 ? `
            <div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
                <span id="reader-settings-session-time">Time: ${elapsedMins > 0 ? `${elapsedMins}m ` : ''}${elapsedSecs}s / ${currentGoal}m</span>
                <span id="reader-settings-session-pct" style="color:var(--accent);">${Math.min(100, Math.round((elapsedMs / (currentGoal * 60000)) * 100))}%</span>
              </div>
              <div style="width:100%; height:6px; background:var(--surface-2); border-radius:3px; overflow:hidden; border:1px solid var(--border);">
                <div id="reader-settings-session-fill" style="width:${Math.min(100, Math.round((elapsedMs / (currentGoal * 60000)) * 100))}%; height:100%; background:var(--accent); border-radius:3px; transition:width 0.3s ease;"></div>
              </div>
            </div>
          ` : `
            <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px; line-height:1.4;">
              Track your reading time systematically. Set a target session goal below.
            </div>
          `}
        </div>

        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; margin-bottom:10px;">
          <button class="btn ${currentGoal === 0 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="0" style="padding:8px 2px; font-size:12px; font-weight:600;">Off</button>
          <button class="btn ${currentGoal === 5 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="5" style="padding:8px 2px; font-size:12px; font-weight:600;">5m</button>
          <button class="btn ${currentGoal === 15 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="15" style="padding:8px 2px; font-size:12px; font-weight:600;">15m</button>
          <button class="btn ${currentGoal === 30 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="30" style="padding:8px 2px; font-size:12px; font-weight:600;">30m</button>
          <button class="btn ${currentGoal === 45 ? 'btn-primary' : 'btn-ghost'} goal-btn" data-goal="45" style="padding:8px 2px; font-size:12px; font-weight:600;">45m</button>
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
          <input type="number" id="custom-goal-input" min="1" max="600" placeholder="Custom mins (e.g. 60)…" value="${[0,5,15,30,45].includes(currentGoal) ? '' : currentGoal}" style="flex:1; padding:9px 12px; font-size:13px; background:var(--bg-elev); border:1px solid var(--border); border-radius:8px; color:var(--text);" />
          <button class="btn btn-primary" id="set-custom-goal" style="padding:9px 14px; font-size:12.5px; font-weight:600; width:auto;">Set Goal</button>
        </div>
      </div>

      <!-- Settings List: Option 5 (AI Study Tools) + Option 2 (Focus Mode) + Option 3 (Read Aloud) + Option 4 (Reading Themes) -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <!-- Option 5: AI Study Tools -->
        <button class="btn" id="open-ai-study-tools-btn" style="width:100%; padding:14px; background:var(--surface-2); border:1.5px solid var(--accent); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:10px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('sparkle','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:14px; font-weight:700; color:var(--text);">✨ AI Study Tools</div>
              <div style="font-size:11.5px; color:var(--text-dim);">Summarize, Flashcards, MCQs & Notes</div>
            </div>
          </div>
          <span style="color:var(--accent); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
        </button>

        <!-- Option 2: Focus Mode -->
        <button class="btn" id="toggle-focus-mode-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid ${isFocus ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:${isFocus ? 'var(--accent)' : 'var(--bg-elev)'}; color:${isFocus ? '#fff' : 'var(--text-dim)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('zoomIn','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Focus Mode</div>
              <div style="font-size:11px; color:var(--text-dim);">Hide toolbars & read in distraction-free full screen</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${isFocus ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 3: Hands-free Read Aloud & Voices -->
        <button class="btn" id="open-tts-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('volume','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">🔊 Hands-free Read Aloud & Voices</div>
              <div style="font-size:11px; color:var(--text-dim);">Select Male, Female, Deep voice, pitch & speed</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="color:var(--accent); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 4: Reading Themes & Layout -->
        <button class="btn" id="open-themes-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--bg-elev); color:var(--text-dim); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('sun','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Reading Themes & Layout</div>
              <div style="font-size:11px; color:var(--text-dim);">Light, Night, Sepia & scroll options</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--bg-elev); color:var(--text-dim); border:1px solid var(--border); text-transform:capitalize;">${window.State.theme || 'light'}</span>
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <!-- Option 6: Draw & Annotations (Fabric.js) -->
        <button class="btn" id="open-markup-toolbar-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid ${window.isMarkupModeActive && window.isMarkupModeActive() ? 'var(--accent)' : 'var(--border)'}; border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:${window.isMarkupModeActive && window.isMarkupModeActive() ? 'var(--accent)' : 'var(--accent-soft)'}; color:${window.isMarkupModeActive && window.isMarkupModeActive() ? '#fff' : 'var(--accent)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px;">
              ✏️
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Draw & Annotations</div>
              <div style="font-size:11px; color:var(--text-dim);">Pen, shapes, arrows, colors & eraser</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${window.isMarkupModeActive && window.isMarkupModeActive() ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>

        <button class="btn" id="toggle-ink-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px;">👁</div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">${window.isInkHidden && window.isInkHidden() ? 'Drawings dikhao' : 'Drawings chhupao'}</div>
              <div style="font-size:11px; color:var(--text-dim);">Padhte waqt saaf page — drawings delete nahi hote</div>
            </div>
          </div>
        </button>

        <!-- Option 7: Advanced Settings -->
        <button class="btn" id="open-advanced-settings-btn" style="width:100%; padding:13px 14px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--bg-elev); color:var(--text); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${window.icon('settings','icon icon-sm')}
            </div>
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:600; color:var(--text);">Advanced Settings</div>
              <div style="font-size:11px; color:var(--text-dim);">Hide status bar, navigation bar & orientation tips</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${(window.State.hideStatusBar || window.State.hideNavigationBar) ? `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:8px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent);">Active</span>` : ''}
            <span style="color:var(--text-dim); font-weight:700; font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
          </div>
        </button>
      </div>
    </div>
  `);

  if (currentGoal > 0) {
    window._readerSettingsTimer = setInterval(() => {
      const timeEl = document.getElementById('reader-settings-session-time');
      const pctEl = document.getElementById('reader-settings-session-pct');
      const fillEl = document.getElementById('reader-settings-session-fill');
      if (!timeEl) {
        clearInterval(window._readerSettingsTimer);
        window._readerSettingsTimer = null;
        return;
      }
      const sStart = window.State.sessionStartTime || Date.now();
      const eMs = Math.max(0, Date.now() - sStart);
      const eMins = Math.floor(eMs / 60000);
      const eSecs = Math.floor((eMs % 60000) / 1000);
      const targetMs = currentGoal * 60000;
      const pct = Math.min(100, Math.round((eMs / targetMs) * 100));

      timeEl.textContent = `Time: ${eMins > 0 ? `${eMins}m ` : ''}${eSecs}s / ${currentGoal}m`;
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (fillEl) fillEl.style.width = `${pct}%`;
    }, 1000);
  }

  function updateReaderGoalDOM(g) {
    document.querySelectorAll('.goal-btn').forEach(b => {
      const isMatch = Number(b.dataset.goal) === g;
      b.className = `btn ${isMatch ? 'btn-primary' : 'btn-ghost'} goal-btn`;
    });

    const badge = document.getElementById('reader-settings-goal-badge');
    if (badge) {
      badge.textContent = g > 0 ? `${g} min Goal` : 'Off';
      badge.style.background = g > 0 ? 'var(--accent-soft)' : 'var(--bg-elev)';
      badge.style.color = g > 0 ? 'var(--accent)' : 'var(--text-dim)';
      badge.style.borderColor = g > 0 ? 'var(--accent)' : 'var(--border)';
    }

    const content = document.getElementById('reader-settings-goal-content');
    if (content) {
      if (g > 0) {
        content.innerHTML = `
          <div style="background:var(--bg-elev); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
              <span id="reader-settings-session-time">Time: 0s / ${g}m</span>
              <span id="reader-settings-session-pct" style="color:var(--accent);">0%</span>
            </div>
            <div style="width:100%; height:6px; background:var(--surface-2); border-radius:3px; overflow:hidden; border:1px solid var(--border);">
              <div id="reader-settings-session-fill" style="width:0%; height:100%; background:var(--accent); border-radius:3px; transition:width 0.3s ease;"></div>
            </div>
          </div>`;
      } else {
        content.innerHTML = `
          <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px; line-height:1.4;">
            Track your reading time systematically. Set a target session goal below.
          </div>`;
      }
    }

    if (window._readerSettingsTimer) {
      clearInterval(window._readerSettingsTimer);
      window._readerSettingsTimer = null;
    }
    if (g > 0) {
      window._readerSettingsTimer = setInterval(() => {
        const timeEl = document.getElementById('reader-settings-session-time');
        const pctEl = document.getElementById('reader-settings-session-pct');
        const fillEl = document.getElementById('reader-settings-session-fill');
        if (!timeEl) {
          clearInterval(window._readerSettingsTimer);
          window._readerSettingsTimer = null;
          return;
        }
        const sStart = window.State.sessionStartTime || Date.now();
        const eMs = Math.max(0, Date.now() - sStart);
        const eMins = Math.floor(eMs / 60000);
        const eSecs = Math.floor((eMs % 60000) / 1000);
        const targetMs = g * 60000;
        const pct = Math.min(100, Math.round((eMs / targetMs) * 100));

        timeEl.textContent = `Time: ${eMins > 0 ? `${eMins}m ` : ''}${eSecs}s / ${g}m`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (fillEl) fillEl.style.width = `${pct}%`;
      }, 1000);
    }
  }

  const goalBtns = document.querySelectorAll('.goal-btn');
  goalBtns.forEach(btn => {
    btn.onclick = () => {
      const g = Number(btn.dataset.goal);
      window.State.readingGoalMinutes = g;
      window.State.goalCompletedNotified = false;
      window.State.sessionStartTime = Date.now();
      if (file && window.DB) {
        window.DB.updateFileMeta(file.id, { readingGoalMinutes: g }).catch(console.error);
      }
      window.toast(g > 0 ? `Reading Goal set to ${g} minutes` : 'Reading Goal turned Off');
      updateReaderGoalDOM(g);
    };
  });

  const customInput = document.getElementById('custom-goal-input');
  const setCustomBtn = document.getElementById('set-custom-goal');
  if (setCustomBtn && customInput) {
    setCustomBtn.onclick = () => {
      const val = parseInt(customInput.value, 10);
      if (val && val > 0) {
        window.State.readingGoalMinutes = val;
        window.State.goalCompletedNotified = false;
        window.State.sessionStartTime = Date.now();
        if (file && window.DB) {
          window.DB.updateFileMeta(file.id, { readingGoalMinutes: val }).catch(console.error);
        }
        window.toast(`Reading Goal set to ${val} minutes`);
        updateReaderGoalDOM(val);
      } else {
        window.toast('Please enter a valid number of minutes');
      }
    };
  }

  const aiToolsBtn = document.getElementById('open-ai-study-tools-btn');
  if (aiToolsBtn) {
    aiToolsBtn.onclick = () => {
      window.openAIMenu(true);
    };
  }

  const focusBtn = document.getElementById('toggle-focus-mode-btn');
  if (focusBtn) {
    focusBtn.onclick = () => {
      const next = !window.State.isFocusMode;
      window.Sheet.close();
      toggleFocusMode(next);
      if (next) {
        window.toast('Focus Mode enabled. Click ✕ on top right to exit.');
      } else {
        window.toast('Focus Mode turned Off.');
      }
    };
  }

  const ttsSettingsBtn = document.getElementById('open-tts-settings-btn');
  if (ttsSettingsBtn) {
    ttsSettingsBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.openHandsFreeReadAloud === 'function') {
        window.openHandsFreeReadAloud();
      } else if (typeof window.openVoiceSettingsModal === 'function') {
        window.openVoiceSettingsModal();
      }
    };
  }

  const themesBtn = document.getElementById('open-themes-settings-btn');
  if (themesBtn) {
    themesBtn.onclick = () => {
      openReadingThemesModal();
    };
  }

  const inkBtn = document.getElementById('toggle-ink-btn');
  if (inkBtn) inkBtn.onclick = () => { window.Sheet.close(); if (window.toggleInkHidden) window.toggleInkHidden(); };

  const markupBtn = document.getElementById('open-markup-toolbar-btn');
  if (markupBtn) {
    markupBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.toggleMarkupToolbar === 'function') {
        window.toggleMarkupToolbar();
      }
    };
  }

  const advBtn = document.getElementById('open-advanced-settings-btn');
  if (advBtn) {
    advBtn.onclick = () => {
      openAdvancedSettingsModal();
    };
  }
}

export function applyAdvancedReaderSettings() {
  const isAndroidWrapper = document.documentElement.classList.contains('sayad-android-wrapper');
  const isImmersive = !isAndroidWrapper && (window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar));
  const isSelDisabled = window.State.disableTextSelection === true;
  const selColor = window.State.selectionColor || '#2FC6BC';

  document.documentElement.style.setProperty('--selection-color', selColor);
  document.body.classList.toggle('selection-disabled', isSelDisabled);
  document.body.classList.toggle('hide-system-status-bar', isImmersive);
  document.body.classList.toggle('hide-system-nav-bar', isImmersive);

  const headerBar = document.getElementById('reader-header-bar');
  if (headerBar) {
    if (isImmersive) {
      headerBar.classList.add('status-bar-hidden');
    } else {
      headerBar.classList.remove('status-bar-hidden');
    }
  }

  const bottomBar = document.getElementById('reader-bottom-bar');
  const scrollEl = document.getElementById('reader-scroll');
  if (bottomBar) {
    if (isImmersive) {
      bottomBar.style.display = 'none';
      if (scrollEl) scrollEl.style.paddingBottom = '12px';
    } else if (window.State.view === 'reader') {
      const isAllowed = window.State.showBottomBar === true;
      bottomBar.style.display = isAllowed ? 'flex' : 'none';
      if (scrollEl) scrollEl.style.paddingBottom = isAllowed ? '68px' : '24px';
    }
  }
}

export async function updateSystemImmersiveMode() {
  const isAndroidWrapper = document.documentElement.classList.contains('sayad-android-wrapper');
  const isImmersive = !isAndroidWrapper && (window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar));

  applyAdvancedReaderSettings();

  // Native Fullscreen API to hide phone OS status bar (clock/battery) & system navigation bar
  if (isImmersive) {
    if (!document.fullscreenElement) {
      try {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen().catch(() => {});
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen().catch(() => {});
        }
      } catch (err) {
        console.warn('[Immersive] Request fullscreen error:', err);
      }
    }
  } else {
    if (document.fullscreenElement) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen().catch(() => {});
        }
      } catch (err) {
        console.warn('[Immersive] Exit fullscreen error:', err);
      }
    }
  }
}

export async function applyOrientationLock(mode) {
  window.State.screenOrientationMode = mode || 'auto';
  if (window.DB && window.DB.setting) {
    await window.DB.setting('screenOrientationMode', window.State.screenOrientationMode);
  }

  // Use Screen Orientation API if available
  if (window.screen && window.screen.orientation) {
    try {
      if (mode === 'portrait') {
        if (typeof window.screen.orientation.lock === 'function') {
          await window.screen.orientation.lock('portrait').catch(() => {});
        }
      } else if (mode === 'landscape') {
        if (typeof window.screen.orientation.lock === 'function') {
          await window.screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        // Auto - follow device sensor / system orientation lock
        if (typeof window.screen.orientation.unlock === 'function') {
          window.screen.orientation.unlock();
        }
      }
    } catch (e) {
      console.warn('[Orientation] Screen orientation lock notice:', e);
    }
  }

  // Trigger responsive reader update
  if (window.State.view === 'reader' && typeof window.updateReaderZoom === 'function') {
    setTimeout(() => {
      window.updateReaderZoom(true);
    }, 150);
  }
}
window.applyOrientationLock = applyOrientationLock;

export function openAdvancedSettingsModal() {
  const isImmersive = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);
  const selColor = window.State.selectionColor || '#FF4D6D';
  const isSelDisabled = window.State.disableTextSelection === true;
  const doubleTapAction = window.State.doubleTapAction || 'zoom';
  const isAutoScroll = window.State.autoScrollEnabled === true;
  const currentAutoSpeed = getAutoScrollSpeed() || 1.5;
  const isReadAloudOled = window.State.readAloudOledVisualizer !== false;
  const oledStyle = (window.State.oledStyle === 'blank' || window.State.oledStyle === 'fire') ? window.State.oledStyle : 'bouncing';
  const soundscape = window.State.soundscape || (window.State.alphaWavesEnabled ? 'alpha' : 'off');
  const orientationMode = window.State.screenOrientationMode || 'auto';

  const SELECTION_COLORS = [
    { id: 'pink', label: 'Vivid Pink', color: '#FF4D6D' },
    { id: 'orange', label: 'Radiant Orange', color: '#FF6A00' },
    { id: 'teal', label: 'Cyan Teal', color: '#2FC6BC' },
    { id: 'blue', label: 'Royal Blue', color: '#3B82F6' },
    { id: 'purple', label: 'Amethyst', color: '#8B5CF6' },
    { id: 'gold', label: 'Amber Gold', color: '#F59E0B' },
    { id: 'green', label: 'Emerald Mint', color: '#10B981' },
    { id: 'slate', label: 'Slate Navy', color: '#64748B' }
  ];

  const activeColorObj = SELECTION_COLORS.find(c => c.color.toLowerCase() === selColor.toLowerCase()) || SELECTION_COLORS[0];

  window.Sheet.open(`
    <div class="adv-modal-container">
      <!-- Minimalist Header -->
      <div class="adv-modal-header">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <div class="adv-header-mark">
            ⚙
          </div>
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:6px;">
              <h3 class="font-display adv-modal-title">Reader Inspector</h3>
              <span class="adv-pro-badge">PRO</span>
            </div>
            <p class="adv-modal-subtitle">Reading mechanics, gestural flow & soundscapes</p>
          </div>
        </div>
        <button id="close-advanced-modal-x" class="adv-modal-close-btn" aria-label="Close">
          ✕
        </button>
      </div>

      <!-- Linear Segmented Tabs -->
      <div class="adv-tabs-bar" role="tablist">
        <button class="adv-tab-btn active" data-tab="tab-colors" role="tab" aria-selected="true">
          Highlights
        </button>
        <button class="adv-tab-btn" data-tab="tab-gestures" role="tab" aria-selected="false">
          Gestures & Flow
        </button>
        <button class="adv-tab-btn" data-tab="tab-audio" role="tab" aria-selected="false">
          Audio & Focus
        </button>
      </div>

      <!-- TAB 1: HIGHLIGHTS & COLOR -->
      <div id="adv-pane-tab-colors" class="adv-tab-pane active">
        <!-- Minimal Preview Strip -->
        <div class="adv-preview-strip">
          <div class="adv-preview-strip-head">
            <span>LIVE INTERACTIVE PREVIEW</span>
            <span id="adv-active-color-tag" style="color:var(--text); font-weight:700;">${activeColorObj.label}</span>
          </div>
          <div class="adv-preview-strip-body">
            Active text selection highlight: <span id="adv-preview-highlight" class="adv-preview-mark" style="background:${activeColorObj.color}33; color:var(--text); outline:1px solid ${activeColorObj.color};">Smart Reader Aura</span> with immediate AI actions.
          </div>
        </div>

        <!-- Linear Swatch Ribbon -->
        <div class="adv-linear-group">
          <div class="adv-linear-group-title">
            <span>Selection Accent Spectrum</span>
          </div>
          <div class="adv-ribbon-swatches">
            ${SELECTION_COLORS.map(c => {
              const isSelected = c.color.toLowerCase() === activeColorObj.color.toLowerCase();
              return `
                <div class="adv-swatch-node ${isSelected ? 'active' : ''}" data-color="${c.color}" data-label="${c.label}" style="background:${c.color};" title="${c.label}">
                  ${isSelected ? '<span class="adv-swatch-pin"></span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Linear Settings Rows -->
        <div class="adv-linear-group">
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Lock Text Selection</div>
              <div class="adv-row-sub">Suppresses selection popup during quick page panning</div>
            </div>
            <div id="adv-lock-sel-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isSelDisabled ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isSelDisabled ? 'active' : ''}">LOCK</span>
            </div>
          </div>
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Default Markup Style</div>
              <div class="adv-row-sub">What the colour dots do when you select text (you can switch per selection)</div>
            </div>
            <div id="adv-markup-style-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${window.State.selDefaultStyle !== 'underline' ? 'active' : ''}">HIGHLIGHT</span>
              <span class="adv-pill-switch-btn ${window.State.selDefaultStyle === 'underline' ? 'active' : ''}">UNDERLINE</span>
            </div>
          </div>
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Selection Panel Style</div>
              <div class="adv-row-sub">Compact: small bar near the text. Classic: the full card at the bottom</div>
            </div>
            <div id="adv-sel-style-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${window.State.selStyle !== 'classic' ? 'active' : ''}">COMPACT</span>
              <span class="adv-pill-switch-btn ${window.State.selStyle === 'classic' ? 'active' : ''}">CLASSIC</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: GESTURES & FLOW -->
      <div id="adv-pane-tab-gestures" class="adv-tab-pane">
        <div class="adv-linear-group">
          <!-- Double Tap Action -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Double-Tap Page Action</div>
              <div class="adv-row-sub">Trigger action upon double tap anywhere on page</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-doubletap-select" class="adv-inline-select">
                <option value="zoom" ${doubleTapAction === 'zoom' ? 'selected' : ''}>Zoom / Fit Toggle</option>
                <option value="bookmark" ${doubleTapAction === 'bookmark' ? 'selected' : ''}>Bookmark Page</option>
                <option value="hide_ui" ${doubleTapAction === 'hide_ui' ? 'selected' : ''}>Zen View</option>
                <option value="tts" ${doubleTapAction === 'tts' ? 'selected' : ''}>Read Aloud</option>
                <option value="theme" ${doubleTapAction === 'theme' ? 'selected' : ''}>Light / Dark Toggle</option>
                <option value="none" ${doubleTapAction === 'none' ? 'selected' : ''}>Disabled</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>

          <!-- Continuous Auto-Scroll -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Continuous Auto-Scroll</div>
              <div class="adv-row-sub">Hands-free smooth vertical document scrolling</div>
            </div>
            <div id="adv-autoscroll-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isAutoScroll ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isAutoScroll ? 'active' : ''}">ON</span>
            </div>
          </div>

          <!-- Speed Row -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Auto-Scroll Speed</div>
              <div class="adv-row-sub">Fine-tune scrolling velocity</div>
            </div>
            <div class="adv-speed-strip">
              <button class="adv-speed-node ${currentAutoSpeed === 1.0 ? 'active' : ''}" data-speed="1.0">1.0x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 1.5 ? 'active' : ''}" data-speed="1.5">1.5x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 2.0 ? 'active' : ''}" data-speed="2.0">2.0x</button>
              <button class="adv-speed-node ${currentAutoSpeed === 3.0 ? 'active' : ''}" data-speed="3.0">3.0x</button>
            </div>
          </div>

          <!-- Orientation & Rotation Behavior -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Screen Orientation Mode</div>
              <div class="adv-row-sub">Auto (Follow phone sensor) or lock orientation</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-orientation-select" class="adv-inline-select">
                <option value="auto" ${orientationMode === 'auto' ? 'selected' : ''}>Auto (System Sync)</option>
                <option value="portrait" ${orientationMode === 'portrait' ? 'selected' : ''}>Lock Portrait</option>
                <option value="landscape" ${orientationMode === 'landscape' ? 'selected' : ''}>Lock Landscape</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>

          <!-- Hide Status & Navigation Bars -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Hide System Status Bars</div>
              <div class="adv-row-sub">Maximize visible screen height</div>
            </div>
            <div id="adv-immersive-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isImmersive ? 'active' : ''}">SHOW</span>
              <span class="adv-pill-switch-btn ${isImmersive ? 'active' : ''}">HIDE</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: AUDIO & FOCUS -->
      <div id="adv-pane-tab-audio" class="adv-tab-pane">
        <div class="adv-linear-group">
          <!-- Full-Screen Ambient Screensaver -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Ambient Screensaver</div>
              <div class="adv-row-sub">Pure black ambient focus display</div>
            </div>
            <div id="adv-oled-toggle-btn" class="adv-pill-switch" role="button">
              <span class="adv-pill-switch-btn ${!isReadAloudOled ? 'active' : ''}">OFF</span>
              <span class="adv-pill-switch-btn ${isReadAloudOled ? 'active' : ''}">ON</span>
            </div>
          </div>

          <!-- Screensaver Style & Preview -->
          <div class="adv-linear-row" style="align-items:flex-start;">
            <div class="adv-row-info" style="padding-top:2px;">
              <div class="adv-row-title">Screensaver Style</div>
              <div class="adv-row-sub">Pure blank, retro bouncing, or pixel fire</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:6px; min-width:145px; max-width:160px; align-items:stretch;">
              <div class="adv-inline-select-wrap" style="width:100%;">
                <select id="adv-oled-style-select" class="adv-inline-select" style="width:100%; text-overflow:ellipsis;">
                  <option value="blank" ${oledStyle === 'blank' ? 'selected' : ''}>⬛ Pure Blank</option>
                  <option value="bouncing" ${oledStyle === 'bouncing' ? 'selected' : ''}>📺 Retro SAYAD</option>
                  <option value="fire" ${oledStyle === 'fire' ? 'selected' : ''}>🔥 Pixelated Fire</option>
                </select>
                <span class="adv-inline-select-arrow">▼</span>
              </div>
              <button id="adv-preview-oled-btn" class="adv-mini-action-btn" style="width:100%; justify-content:center;" title="Preview Screensaver">
                ▶ Demo
              </button>
            </div>
          </div>

          <!-- Ambient Focus Soundscapes -->
          <div class="adv-linear-row">
            <div class="adv-row-info">
              <div class="adv-row-title">Ambient Soundscape</div>
              <div class="adv-row-sub">Synthesized background audio for focus</div>
            </div>
            <div class="adv-inline-select-wrap">
              <select id="adv-soundscape-select" class="adv-inline-select">
                <option value="off" ${soundscape === 'off' ? 'selected' : ''}>Off (Muted)</option>
                <option value="rain" ${soundscape === 'rain' ? 'selected' : ''}>Gentle Rain</option>
                <option value="waves" ${soundscape === 'waves' ? 'selected' : ''}>Deep Ocean</option>
                <option value="cafe" ${soundscape === 'cafe' ? 'selected' : ''}>Coffee Shop</option>
                <option value="fire" ${soundscape === 'fire' ? 'selected' : ''}>Fireplace</option>
                <option value="alpha" ${soundscape === 'alpha' ? 'selected' : ''}>432Hz Alpha</option>
                <option value="flow" ${soundscape === 'flow' ? 'selected' : ''}>528Hz Flow</option>
              </select>
              <span class="adv-inline-select-arrow">▼</span>
            </div>
          </div>
        </div>

        <div class="adv-hint-row">
          <span>💡</span>
          <span>Device rotation seamlessly expands reading viewport with no latency.</span>
        </div>
      </div>
    </div>
  `);

  // Close modal button
  const closeBtn = document.getElementById('close-advanced-modal-x');
  if (closeBtn) {
    closeBtn.onclick = () => window.Sheet.close();
  }

  // Segmented Tabs Switching Handler
  document.querySelectorAll('.adv-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.adv-tab-btn').forEach(b => {
        const isMatch = b === btn;
        b.classList.toggle('active', isMatch);
        b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });

      document.querySelectorAll('.adv-tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });

      const activePane = document.getElementById(`adv-pane-${targetTab}`);
      if (activePane) {
        activePane.classList.add('active');
      }
    };
  });

  // 1. Color Ribbon Swatches Handler
  document.querySelectorAll('.adv-swatch-node').forEach(btn => {
    btn.onclick = async () => {
      const clr = btn.dataset.color;
      const lbl = btn.dataset.label;
      window.State.selectionColor = clr;
      document.documentElement.style.setProperty('--selection-color', clr);

      if (window.DB && window.DB.setting) {
        await window.DB.setting('selectionColor', clr);
      }
      if (window.pendingSelection && typeof window.paintPendingOverlay === 'function') {
        window.paintPendingOverlay(window.pendingSelection, true);
      }

      // Update UI in-place
      document.querySelectorAll('.adv-swatch-node').forEach(b => {
        const isMatch = b.dataset.color.toLowerCase() === clr.toLowerCase();
        b.classList.toggle('active', isMatch);
        b.innerHTML = isMatch ? '<span class="adv-swatch-pin"></span>' : '';
      });

      const tag = document.getElementById('adv-active-color-tag');
      if (tag) {
        tag.textContent = lbl;
      }

      const previewHighlight = document.getElementById('adv-preview-highlight');
      if (previewHighlight) {
        previewHighlight.style.background = `${clr}33`;
        previewHighlight.style.outline = `1px solid ${clr}`;
      }

      window.toast(`Selection color: ${lbl}`);
    };
  });

  // 2. Lock Selection Toggle (Pill Switch)
  const lockSelBtn = document.getElementById('adv-lock-sel-btn');
  if (lockSelBtn) {
    lockSelBtn.onclick = async () => {
      const nextVal = !window.State.disableTextSelection;
      window.State.disableTextSelection = nextVal;
      document.body.classList.toggle('selection-disabled', nextVal);

      if (window.DB && window.DB.setting) {
        await window.DB.setting('disableTextSelection', nextVal);
      }

      if (nextVal && typeof window.hideSelToolbar === 'function') {
        window.hideSelToolbar();
      }

      const btns = lockSelBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(`Text selection ${nextVal ? 'Locked' : 'Unlocked'}`);
    };
  }

  const markupBtn = document.getElementById('adv-markup-style-btn');
  if (markupBtn) {
    markupBtn.onclick = async () => {
      const next = window.State.selDefaultStyle === 'underline' ? 'highlight' : 'underline';
      window.State.selDefaultStyle = next;
      if (window.DB && window.DB.setting) await window.DB.setting('selDefaultStyle', next);
      const btns = markupBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) { btns[0].classList.toggle('active', next !== 'underline'); btns[1].classList.toggle('active', next === 'underline'); }
      window.toast(`Default markup: ${next === 'underline' ? 'Underline' : 'Highlight'}`);
    };
  }

  const selStyleBtn = document.getElementById('adv-sel-style-btn');
  if (selStyleBtn) {
    selStyleBtn.onclick = async () => {
      const next = window.State.selStyle === 'classic' ? 'compact' : 'classic';
      window.State.selStyle = next;
      if (window.DB && window.DB.setting) await window.DB.setting('selStyle', next);
      const btns = selStyleBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) { btns[0].classList.toggle('active', next !== 'classic'); btns[1].classList.toggle('active', next === 'classic'); }
      window.toast(`Selection panel: ${next === 'classic' ? 'Classic' : 'Compact'}`);
    };
  }

  // 3. Double-Tap Action Select
  const dtSelect = document.getElementById('adv-doubletap-select');
  if (dtSelect) {
    dtSelect.onchange = async () => {
      const val = dtSelect.value;
      window.State.doubleTapAction = val;
      if (window.DB && window.DB.setting) {
        await window.DB.setting('doubleTapAction', val);
      }
      window.toast('Double-tap action updated');
    };
  }

  // 4. Auto-Scroll Toggle & Speed Presets
  const autoScrollBtn = document.getElementById('adv-autoscroll-toggle-btn');
  if (autoScrollBtn) {
    autoScrollBtn.onclick = async () => {
      const nextVal = !window.State.autoScrollEnabled;
      window.State.autoScrollEnabled = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('autoScrollEnabled', nextVal);
      }

      if (nextVal) {
        if (window.State.view === 'reader') {
          startAutoScroll();
        } else {
          window.toast('Auto-Scroll enabled (will run in reader)');
        }
      } else {
        stopAutoScroll();
        window.toast('Auto-Scroll stopped');
      }

      const btns = autoScrollBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
    };
  }

  document.querySelectorAll('.adv-speed-node').forEach(chip => {
    chip.onclick = () => {
      const spd = parseFloat(chip.dataset.speed);
      setAutoScrollSpeed(spd);
      document.querySelectorAll('.adv-speed-node').forEach(c => {
        c.classList.toggle('active', parseFloat(c.dataset.speed) === spd);
      });
      if (window.State.autoScrollEnabled && typeof renderAutoScrollController === 'function') {
        renderAutoScrollController();
      }
      window.toast(`Auto-Scroll speed: ${spd}x`);
    };
  });

  // 5. OLED Wave Screen Saver Toggle & Style & Preview
  const oledToggleBtn = document.getElementById('adv-oled-toggle-btn');
  if (oledToggleBtn) {
    oledToggleBtn.onclick = async () => {
      const current = window.State.readAloudOledVisualizer !== false;
      const nextVal = !current;
      window.State.readAloudOledVisualizer = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('readAloudOledVisualizer', nextVal);
      }

      const btns = oledToggleBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(`Ambient screensaver ${nextVal ? 'Enabled' : 'Disabled'}`);
    };
  }

  const oledStyleSelect = document.getElementById('adv-oled-style-select');
  if (oledStyleSelect) {
    oledStyleSelect.onchange = async () => {
      const val = oledStyleSelect.value;
      window.State.oledStyle = val;
      if (window.DB && window.DB.setting) {
        await window.DB.setting('oledStyle', val);
      }
      window.toast('Ambient screensaver updated');
    };
  }

  const oledPreviewBtn = document.getElementById('adv-preview-oled-btn');
  if (oledPreviewBtn) {
    oledPreviewBtn.onclick = () => {
      window.Sheet.close();
      if (typeof window.openOledBlackoutVisualizer === 'function') {
        const val = oledStyleSelect ? oledStyleSelect.value : (window.State.oledStyle || 'bouncing');
        window.openOledBlackoutVisualizer(val);
      } else {
        window.toast('Ambient Screensaver activated');
      }
    };
  }

  // 6. Soundscapes Select
  const soundscapeSelect = document.getElementById('adv-soundscape-select');
  if (soundscapeSelect) {
    soundscapeSelect.onchange = async () => {
      const val = soundscapeSelect.value;
      window.State.soundscape = val;
      if (val === 'off') {
        window.State.alphaWavesEnabled = false;
        if (typeof window.stopAlphaWaves === 'function') {
          window.stopAlphaWaves(true);
        }
        window.toast('Background audio turned off');
      } else {
        window.State.alphaWavesEnabled = true;
        if (typeof window.startAlphaWaves === 'function') {
          window.startAlphaWaves(val === 'flow' ? 'beta' : 'alpha');
        }
        window.toast(`Ambient focus playing: ${soundscapeSelect.options[soundscapeSelect.selectedIndex].text}`);
      }
      if (window.DB && window.DB.setting) {
        await window.DB.setting('soundscape', val);
        await window.DB.setting('alphaWavesEnabled', window.State.alphaWavesEnabled);
      }
    };
  }

  // 7. Screen Orientation Select
  const orientSelect = document.getElementById('adv-orientation-select');
  if (orientSelect) {
    orientSelect.onchange = async () => {
      const mode = orientSelect.value;
      await applyOrientationLock(mode);
      if (mode === 'portrait') {
        window.toast('📱 Locked to Portrait Mode');
      } else if (mode === 'landscape') {
        window.toast('🔄 Locked to Landscape Mode');
      } else {
        window.toast('🌐 Auto-sync with Phone Sensor & OS Lock');
      }
    };
  }

  // 8. Immersive Mode Toggle (Hide Status & Nav bars)
  const immersiveToggleBtn = document.getElementById('adv-immersive-toggle-btn');
  if (immersiveToggleBtn) {
    immersiveToggleBtn.onclick = async () => {
      const current = window.State.hideSystemBars === true || (window.State.hideStatusBar && window.State.hideNavigationBar);
      const nextVal = !current;
      window.State.hideSystemBars = nextVal;
      window.State.hideStatusBar = nextVal;
      window.State.hideNavigationBar = nextVal;

      if (window.DB && window.DB.setting) {
        await window.DB.setting('hideSystemBars', nextVal);
        await window.DB.setting('hideStatusBar', nextVal);
        await window.DB.setting('hideNavigationBar', nextVal);
      }

      await updateSystemImmersiveMode();
      const btns = immersiveToggleBtn.querySelectorAll('.adv-pill-switch-btn');
      if (btns.length === 2) {
        btns[0].classList.toggle('active', !nextVal);
        btns[1].classList.toggle('active', nextVal);
      }
      window.toast(nextVal ? '📱 System bars hidden' : '📱 System bars restored');
    };
  }
}

export function openReadingThemesModal() {
  const currentTheme = window.State.theme || 'light';
  const currentMode = window.State.readingMode || 'continuous';
  const currentMargin = window.State.readingMargin || 'normal';
  const showBottomBar = window.State.showBottomBar === true;

  window.Sheet.open(`
    <div style="padding:4px 0;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
          ${window.icon('sun','icon icon-sm')} <span>Reading Themes & Layout</span>
        </div>
        <button id="close-themes-modal-x" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;" aria-label="Close">
          ${window.icon('x','icon icon-sm')}
        </button>
      </div>

      <!-- Theme Selection -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Appearance Theme</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <button class="btn theme-pick-btn ${currentTheme==='light'?'active':''}" data-theme="light" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='light'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='light'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='light'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('sun','icon icon-md')}
            <span>Day</span>
          </button>
          <button class="btn theme-pick-btn ${currentTheme==='dark'?'active':''}" data-theme="dark" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='dark'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='dark'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='dark'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('moon','icon icon-md')}
            <span>Night</span>
          </button>
          <button class="btn theme-pick-btn ${currentTheme==='sepia'?'active':''}" data-theme="sepia" style="flex-direction:column; padding:12px 8px; gap:6px; font-size:12px; font-weight:700; background:${currentTheme==='sepia'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentTheme==='sepia'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentTheme==='sepia'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            ${window.icon('coffee','icon icon-md')}
            <span>Sepia</span>
          </button>
        </div>
      </div>

      <!-- Bottom Reading Bar Toggle -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Bottom Navigation Bar</div>
        <button class="btn" id="toggle-bottom-bar-btn" style="width:100%; padding:12px 14px; justify-content:space-between; background:${showBottomBar ? 'var(--accent-soft)' : 'var(--surface-2)'}; color:${showBottomBar ? 'var(--accent)' : 'var(--text)'}; border:1.5px solid ${showBottomBar ? 'var(--accent)' : 'var(--border)'}; border-radius:12px; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:10px;">
            ${window.icon('compass','icon icon-sm')}
            <div style="text-align:left;">
              <div style="font-size:13.5px; font-weight:700;">Show Bottom Bar</div>
              <div style="font-size:11px; color:var(--text-dim);">Page scrubber, quick jump & controls</div>
            </div>
          </div>
          <span style="font-size:12px; font-weight:800; padding:4px 10px; border-radius:8px; background:${showBottomBar ? 'var(--accent)' : 'var(--bg-elev)'}; color:${showBottomBar ? '#fff' : 'var(--text-dim)'};">
            ${showBottomBar ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      <!-- Reading Margins & Page Width -->
      <div style="margin-bottom:18px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Reading Margins & Page Width</div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
          <button class="btn margin-pick-btn ${currentMargin==='compact'?'active':''}" data-margin="compact" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='compact'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='compact'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='compact'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Compact</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Full Width</span>
          </button>
          <button class="btn margin-pick-btn ${currentMargin==='normal'?'active':''}" data-margin="normal" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='normal'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='normal'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='normal'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Balanced</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Standard</span>
          </button>
          <button class="btn margin-pick-btn ${currentMargin==='wide'?'active':''}" data-margin="wide" style="flex-direction:column; padding:12px 6px; gap:4px; font-size:12px; font-weight:700; background:${currentMargin==='wide'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMargin==='wide'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMargin==='wide'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <span>Wide</span>
            <span style="font-size:10px; font-weight:400; color:var(--text-dim);">Focused</span>
          </button>
        </div>
      </div>

      <!-- Reading Mode Selection -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Page View & Scroll</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <button class="btn mode-pick-btn" data-mode="continuous" style="width:100%; padding:12px 14px; justify-content:space-between; background:${currentMode==='continuous'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMode==='continuous'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMode==='continuous'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${window.icon('list','icon icon-sm')}
              <div style="text-align:left;">
                <div style="font-size:13.5px; font-weight:700;">Continuous Scroll</div>
                <div style="font-size:11px; color:var(--text-dim);">Scroll pages vertically continuously</div>
              </div>
            </div>
            ${currentMode==='continuous' ? `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>` : ''}
          </button>
          <button class="btn mode-pick-btn" data-mode="single" style="width:100%; padding:12px 14px; justify-content:space-between; background:${currentMode==='single'?'var(--accent-soft)':'var(--surface-2)'}; color:${currentMode==='single'?'var(--accent)':'var(--text)'}; border:1.5px solid ${currentMode==='single'?'var(--accent)':'var(--border)'}; border-radius:12px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${window.icon('fileText','icon icon-sm')}
              <div style="text-align:left;">
                <div style="font-size:13.5px; font-weight:700;">Single Page Flip</div>
                <div style="font-size:11px; color:var(--text-dim);">Swipe left / right to turn pages one by one</div>
              </div>
            </div>
            ${currentMode==='single' ? `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>` : ''}
          </button>
        </div>
      </div>
    </div>
  `);

  const closeX = document.getElementById('close-themes-modal-x');
  if (closeX) closeX.onclick = () => window.Sheet.close();

  const toggleBottomBarBtn = document.getElementById('toggle-bottom-bar-btn');
  if (toggleBottomBarBtn) {
    toggleBottomBarBtn.onclick = async () => {
      const currentShow = window.State.showBottomBar === true;
      const nextVal = !currentShow;
      window.State.showBottomBar = nextVal;
      if (window.DB) {
        await window.DB.setting('showBottomBar', nextVal);
      }
      const bBar = document.getElementById('reader-bottom-bar');
      const rScroll = document.getElementById('reader-scroll');
      if (bBar) {
        bBar.style.display = nextVal ? 'flex' : 'none';
      }
      if (rScroll) {
        rScroll.style.paddingBottom = nextVal ? '68px' : '24px';
      }
      window.toast(`Bottom Navigation Bar turned ${nextVal ? 'ON' : 'OFF'}`);

      // In-place UI update
      toggleBottomBarBtn.style.background = nextVal ? 'var(--accent-soft)' : 'var(--surface-2)';
      toggleBottomBarBtn.style.color = nextVal ? 'var(--accent)' : 'var(--text)';
      toggleBottomBarBtn.style.borderColor = nextVal ? 'var(--accent)' : 'var(--border)';
      const badge = toggleBottomBarBtn.querySelector('span:last-child');
      if (badge) {
        badge.textContent = nextVal ? 'ON' : 'OFF';
        badge.style.background = nextVal ? 'var(--accent)' : 'var(--bg-elev)';
        badge.style.color = nextVal ? '#fff' : 'var(--text-dim)';
      }
    };
  }

  document.querySelectorAll('.theme-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const th = btn.dataset.theme;
      if (window.State.theme === th && !window.State.autoTheme) return;
      window.State.theme = th;
      window.State.autoTheme = false;
      const fxKind = th === 'sepia' ? 'sepia' : /dark|night|black|amoled|oled/i.test(th) ? 'dark' : 'light';
      window.themeTransition(() => {
        document.documentElement.dataset.theme = th;
        if (typeof window.syncThemeColorMeta === 'function') window.syncThemeColorMeta();
        document.querySelectorAll('.theme-pick-btn').forEach(b => {
          const isMatch = b.dataset.theme === th;
          b.classList.toggle('active', isMatch);
          b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
          b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
        });
      }, btn, fxKind);
      try { localStorage.setItem('sayad_theme', th); } catch(e){}
      if (window.DB) {
        await window.DB.setting('theme', th);
        await window.DB.setting('autoTheme', false);
      }
      window.toast(`Theme set to ${th.toUpperCase()}`);
    };
  });

  document.querySelectorAll('.margin-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const mg = btn.dataset.margin;
      window.State.readingMargin = mg;
      if (window.DB) {
        await window.DB.setting('readingMargin', mg);
      }
      updateReaderZoom(true);
      window.toast(`Margin set to ${mg.toUpperCase()}`);

      // In-place UI update
      document.querySelectorAll('.margin-pick-btn').forEach(b => {
        const isMatch = b.dataset.margin === mg;
        b.classList.toggle('active', isMatch);
        b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
        b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
        b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
      });
    };
  });

  document.querySelectorAll('.mode-pick-btn').forEach(btn => {
    btn.onclick = async () => {
      const md = btn.dataset.mode;
      if (window.State.readingMode !== md) {
        window.State.readingMode = md;
        if (window.DB) {
          await window.DB.setting('readingMode', md);
        }
        if (document.getElementById('reader-scroll')) {
          mountReaderContent();
        }
        window.toast(`Reading mode set to ${md === 'single' ? 'Single Page' : 'Continuous'}`);

        // In-place UI update
        document.querySelectorAll('.mode-pick-btn').forEach(b => {
          const isMatch = b.dataset.mode === md;
          b.style.background = isMatch ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.color = isMatch ? 'var(--accent)' : 'var(--text)';
          b.style.borderColor = isMatch ? 'var(--accent)' : 'var(--border)';
          let checkSpan = b.querySelector('span:last-child');
          if (isMatch) {
            if (!checkSpan || checkSpan.textContent !== '✓') {
              b.insertAdjacentHTML('beforeend', `<span style="font-size:14px; font-weight:700; color:var(--accent);">✓</span>`);
            }
          } else if (checkSpan && checkSpan.textContent === '✓') {
            checkSpan.remove();
          }
        });
      }
    };
  });
}
