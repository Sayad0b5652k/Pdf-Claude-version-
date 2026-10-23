// @ts-nocheck

import './icons.js';
import './db.js';
import './ai.js';
import './utils.js';
import './seed.js';
import './views_dashboard.js';
import './smart_cover.js';
import './views_other.js';
import './reader.js';
import './page_tools.js';
import './selection.js';
import './annotations_drawing.js';
import './teacher.js';
import './mind_audio.js';
import './custom_select.js';
import { initPWAListeners } from './pwa.js';

export const NAV_TABS = [
  {key:'dashboard', label:'Home', icon:'home'},
  {key:'bookmarks', label:'Bookmarks', icon:'bookmark'},
  {key:'review', label:'Review', icon:'cards'},
  {key:'notes', label:'Notes', icon:'note'},
  {key:'settings', label:'Settings', icon:'settings'},
];

export function bottomNavHtml(active){
  return `<div class="bottom-nav">
    ${NAV_TABS.map(t=>`<button data-nav="${t.key}" class="${active===t.key?'active':''}">${window.icon(t.icon,'icon icon-sm')}<span>${t.label}</span></button>`).join('')}
  </div>`;
}

export function pushAppScreen(screenName){
  try {
    const currentHash = window.location.hash;
    const targetHash = '#' + screenName;
    if (currentHash !== targetHash) {
      window.history.pushState({ app: 'sayad', screen: screenName, t: Date.now() }, '', targetHash);
    }
  } catch (e) {}
}
window.pushAppScreen = pushAppScreen;

export function bindBottomNav(){
  document.querySelectorAll('[data-nav]').forEach(b=>{
    b.onclick = (e)=>{
      e.stopPropagation();
      const targetView = b.dataset.nav;
      if (targetView) {
        window.State.view = targetView;
        pushAppScreen(targetView);
        window.scrollTo(0, 0);
        render();
      }
    };
  });
}

export function render(){
  try {
    if(window.State.view!=='reader') {
      if(typeof window.stopReadingSession === 'function') window.stopReadingSession();
      if(typeof window.hideSelToolbar === 'function') window.hideSelToolbar();
    }
    if(window.State.view==='dashboard') {
      if(typeof window.renderDashboard === 'function') window.renderDashboard();
    }
    else if(window.State.view==='reader') {
      if(typeof window.renderReaderShell === 'function') window.renderReaderShell();
    }
    else if(window.State.view==='settings') {
      if(typeof window.renderSettings === 'function') window.renderSettings();
    }
    else if(window.State.view==='bookmarks') {
      if(typeof window.renderBookmarksView === 'function') window.renderBookmarksView();
    }
    else if(window.State.view==='notes') {
      if(typeof window.renderNotesView === 'function') window.renderNotesView();
    }
    else if(window.State.view==='review') {
      if(typeof window.renderReviewView === 'function') window.renderReviewView();
    }
  } catch (err) {
    console.error('Error during render():', err);
  }
}

export const HUMOROUS_EXIT_QUOTES = [
  {
    emoji: '🤨📚',
    tag: 'Dost Ka Sawal',
    title: 'Kyu bhai, nahi ho rahi padhai? 😂',
    msg: 'Abhi toh book kholi thi aur itni jaldi back button? Reels scroll karne ka mann kar raha hai na sach batao? Chalo 5 minute aur padh lo!',
    stayBtn: 'Nahi Yaar, Padh Raha Hoon! 📖',
    exitBtn: 'Sach Me Break Chahiye 😴'
  },
  {
    emoji: '💀🎯',
    tag: 'Reality Check',
    title: 'Aise niklega exam dost? 🧐',
    msg: 'Topper log is waqt notes revision kar rahe hain aur tum app band karne ki firaq mein ho? Chalo chupchap 1 topic aur finish karo!',
    stayBtn: 'Sahi Bol Raha Hai, Padhne Do! 🔥',
    exitBtn: 'Dimag Ka Dahi Ho Gaya, Exit 🚪'
  },
  {
    emoji: '🥲📉',
    tag: 'Syllabus Alert',
    title: 'Syllabus dekh ke darr lag gaya kya? 🏃‍♂️',
    msg: 'App band karne se syllabus thodi kam ho jayega mere bhai! Thoda sa hi sahi, par roz padho. Bas 1 page aur padh lo phir chale jana!',
    stayBtn: 'Chalo 1 Page Aur Padh Lete Hain 🫡',
    exitBtn: 'Kal Pakka Padhunga, Exit 🚪'
  },
  {
    emoji: '🤫☕',
    tag: 'Pyaar Se Roast',
    title: 'Kitna padh liya jo itna thak gaye? 🤣',
    msg: 'Mushkil se 2 page palte hain aur energy zero ho gayi! Thoda concentration badhao dost, phone rakhne se pehle ek paragraph aur nipta lo!',
    stayBtn: 'Abhi Padh Ke Dikhata Hoon! 😤',
    exitBtn: 'Need Aa Rahi Hai Bhai 🥱'
  },
  {
    emoji: '🚀✨',
    tag: 'Future Reminder',
    title: 'Kal subah fir guilt hoga! 💭',
    msg: 'Abhi back karoge, phir 1 ghante baad lagega "kaash thoda aur padh liya hota". Us guilt se bachna hai toh 3 minute aur ruko!',
    stayBtn: 'Baat Me Dum Hai, Rukta Hoon! 💡',
    exitBtn: 'Chalo Bye, Exit 🚪'
  }
];

export function getNextHumorousExitQuote() {
  let idx = 0;
  try {
    idx = parseInt(localStorage.getItem('sayad_exit_quote_seq') || '0', 10);
  } catch (e) {}

  if (isNaN(idx) || idx < 0) idx = 0;
  const quote = HUMOROUS_EXIT_QUOTES[idx % HUMOROUS_EXIT_QUOTES.length];

  try {
    localStorage.setItem('sayad_exit_quote_seq', ((idx + 1) % HUMOROUS_EXIT_QUOTES.length).toString());
  } catch (e) {}

  return quote;
}

export function showHumorousExitDialog() {
  const existing = document.getElementById('sayad-exit-dialog');
  if (existing) {
    existing.remove();
  }

  const quote = getNextHumorousExitQuote();

  const overlay = document.createElement('div');
  overlay.id = 'sayad-exit-dialog';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    animation: sayadFadeIn 0.2s ease-out;
  `;

  overlay.innerHTML = `
    <div style="
      background: var(--surface, #1e293b);
      border: 1.5px solid var(--accent, #FF6A2B);
      border-radius: 24px;
      max-width: 350px;
      width: 100%;
      padding: 24px 20px 20px;
      box-shadow: 0 24px 50px rgba(0,0,0,0.6), 0 0 30px rgba(255,106,43,0.15);
      text-align: center;
      color: var(--text, #fff);
      animation: sayadScaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    ">
      <!-- Tag badge -->
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: var(--accent-soft, rgba(255,106,43,0.15));
        color: var(--accent, #FF6A2B);
        border: 1px solid var(--accent, #FF6A2B);
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-bottom: 14px;
      ">
        <span>⚡</span>
        <span>${quote.tag}</span>
      </div>

      <!-- Emoji Icon -->
      <div style="
        font-size: 44px;
        margin-bottom: 12px;
        line-height: 1;
        filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));
      ">${quote.emoji}</div>

      <!-- Title -->
      <div style="
        font-size: 17.5px;
        font-weight: 800;
        font-family: 'Space Grotesk', system-ui, sans-serif;
        color: var(--text, #fff);
        margin-bottom: 10px;
        line-height: 1.35;
      ">${quote.title}</div>

      <!-- Message -->
      <div style="
        font-size: 13.5px;
        color: var(--text-dim, #94a3b8);
        line-height: 1.55;
        margin-bottom: 22px;
        background: var(--surface-2, rgba(255,255,255,0.04));
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--border, rgba(255,255,255,0.08));
      ">${quote.msg}</div>

      <!-- Actions -->
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-stay-study" style="
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          background: var(--accent, #FF6A2B);
          color: #ffffff;
          border: none;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(255,106,43,0.4);
          transition: transform 0.1s;
        ">${quote.stayBtn}</button>
        <button id="btn-confirm-exit" style="
          width: 100%;
          padding: 11px;
          border-radius: 14px;
          background: transparent;
          color: var(--text-dim, #94a3b8);
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        ">${quote.exitBtn}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on backdrop tap
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (typeof window.toast === 'function') {
        window.toast('Yeh hui na baat! Wapas padhai shuru! 🔥');
      }
    }
  });

  document.getElementById('btn-stay-study')?.addEventListener('click', () => {
    overlay.remove();
    if (typeof window.toast === 'function') {
      window.toast('Yeh hui na baat! Focus mode ON! 🔥');
    }
  });

  document.getElementById('btn-confirm-exit')?.addEventListener('click', () => {
    overlay.remove();
    window._sayadAllowExit = true;
    if (typeof window.toast === 'function') {
      window.toast('Alvida dost! Agli baar acche se padhai karna! 👋');
    }
    try {
      window.history.go(-2);
    } catch (e) {
      try { window.history.back(); } catch(e2){}
    }
  });
}
window.showHumorousExitDialog = showHumorousExitDialog;

export function ensureHistoryStack() {
  try {
    const hash = window.location.hash;
    if (!hash || hash === '' || hash === '#' || hash === '#root') {
      window.history.replaceState({ app: 'sayad', screen: 'root' }, '', '#root');
      window.history.pushState({ app: 'sayad', screen: 'dashboard', t: Date.now() }, '', '#dashboard');
    }
  } catch (e) {}
}
window.ensureHistoryStack = ensureHistoryStack;
window.ensureHistoryTrap = ensureHistoryStack;

export function initHardwareBackNavigation() {
  window._sayadAllowExit = false;

  // 1. Initial push on startup to create the two-tier history stack [#root, #dashboard]
  ensureHistoryStack();

  // 2. User Gesture Priming: Keep the history stack armed on any user interaction
  const primeHistory = () => {
    const hash = window.location.hash;
    if (!hash || hash === '' || hash === '#' || hash === '#root') {
      ensureHistoryStack();
    }
  };
  window.addEventListener('pointerdown', primeHistory, { passive: true });
  window.addEventListener('touchstart', primeHistory, { passive: true });
  window.addEventListener('click', primeHistory, { passive: true });

  // 3. Popstate event listener for Android / Phone Back Button & Gestures
  window.addEventListener('popstate', async (event) => {
    if (window._sayadAllowExit) {
      window._sayadAllowExit = false;
      return;
    }

    // Priority 1: Check if Humorous Exit Dialog is open -> Close dialog and stay on dashboard
    const exitDialog = document.getElementById('sayad-exit-dialog');
    if (exitDialog) {
      exitDialog.remove();
      pushAppScreen('dashboard');
      return;
    }

    // Priority 2: Check if any Sheet / Modal / Overlay is open -> Close sheet & stay on current view
    const sheetEl = document.getElementById('sheet');
    const customModals = document.querySelectorAll('.modal.open, #teacher-sheet.open, #ocr-crop-overlay');
    if (sheetEl && sheetEl.classList.contains('open')) {
      if (window.Sheet && typeof window.Sheet.close === 'function') {
        window.Sheet.close();
      }
      pushAppScreen(window.State?.view || 'dashboard');
      return;
    }
    if (customModals && customModals.length > 0) {
      customModals.forEach(m => m.classList.remove('open'));
      pushAppScreen(window.State?.view || 'dashboard');
      return;
    }

    // Priority 3: Check if inside AI Teacher Workspace
    if (window.State && window.State.view === 'teacher') {
      if (typeof window.stopElevenAudio === 'function') window.stopElevenAudio();
      if (window.State?.currentDoc && window.State?.currentFile) {
        window.State.view = 'reader';
        pushAppScreen('reader');
        if (typeof window.renderReaderShell === 'function') window.renderReaderShell();
        if (typeof window.mountReaderContent === 'function') window.mountReaderContent();
      } else {
        window.State.view = 'dashboard';
        pushAppScreen('dashboard');
        window.render();
      }
      return;
    }

    // Priority 4: Check if inside PDF Reader View -> Go back to Home Dashboard
    if (window.State && window.State.view === 'reader') {
      if (typeof window.exitReader === 'function') {
        await window.exitReader();
      } else {
        window.State.view = 'dashboard';
        window.render();
      }
      pushAppScreen('dashboard');
      return;
    }

    // Priority 5: Check if on secondary tabs (Bookmarks, Review, Notes, Settings) -> Go back to Home
    if (window.State && window.State.view && window.State.view !== 'dashboard') {
      window.State.view = 'dashboard';
      pushAppScreen('dashboard');
      window.render();
      return;
    }

    // Priority 6: User is on Home Dashboard and pressed Back button -> Show Humorous Dialog!
    // Re-push #dashboard immediately so the user remains on dashboard and the stack is ready
    pushAppScreen('dashboard');
    showHumorousExitDialog();
  });
}
window.initHardwareBackNavigation = initHardwareBackNavigation;

export async function boot(){
  initPWAListeners();
  initHardwareBackNavigation();
  if (typeof window.initSelectAutoEnhancer === 'function') {
    window.initSelectAutoEnhancer();
  }
  window.State.theme = await window.DB.getSetting('theme','light');
  document.documentElement.dataset.theme = window.State.theme;
  try { localStorage.setItem('sayad_theme', window.State.theme); } catch(e){}
  window.State.proTheme = await window.DB.getSetting('proTheme','classic');
  document.documentElement.dataset.proTheme = window.State.proTheme;
  try { localStorage.setItem('sayad_pro_theme', window.State.proTheme); } catch(e){}
  syncThemeColorMeta();
  window.State.viewMode = await window.DB.getSetting('viewMode','grid');
  window.State.readingMode = await window.DB.getSetting('readingMode','continuous');
  window.State.readingMargin = await window.DB.getSetting('readingMargin','normal');
  window.State.showBottomBar = await window.DB.getSetting('showBottomBar', false);
  window.State.hideSystemBars = await window.DB.getSetting('hideSystemBars', false);
  window.State.hideStatusBar = await window.DB.getSetting('hideStatusBar', false);
  window.State.hideNavigationBar = await window.DB.getSetting('hideNavigationBar', false);
  window.State.selectionColor = await window.DB.getSetting('selectionColor', '#2FC6BC');
  window.State.disableTextSelection = await window.DB.getSetting('disableTextSelection', false);
  window.State.doubleTapAction = await window.DB.getSetting('doubleTapAction', 'zoom');
  window.State.autoScrollEnabled = await window.DB.getSetting('autoScrollEnabled', false);
  window.State.readAloudOledVisualizer = await window.DB.getSetting('readAloudOledVisualizer', true);
  window.State.alphaWavesEnabled = await window.DB.getSetting('alphaWavesEnabled', false);
  window.State.screenOrientationMode = await window.DB.getSetting('screenOrientationMode', 'auto');
  if (typeof window.updateSystemImmersiveMode === 'function') {
    window.updateSystemImmersiveMode();
  } else if (typeof window.applyAdvancedReaderSettings === 'function') {
    window.applyAdvancedReaderSettings();
  }
  window.State.keepAwake = await window.DB.getSetting('keepAwake', false);
  window.State.autoTheme = await window.DB.getSetting('autoTheme', false);
  window.State.showPageNumber = await window.DB.getSetting('showPageNumber', true);
  window.State.smoothScroll = await window.DB.getSetting('smoothScroll', true);
  window.State.streamingMode = (await window.DB.getSetting('streamingMode', 'sse')) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sayad_streaming_mode') || 'sse') : 'sse');
  window.State.customGeminiKey = (await window.DB.getSetting('customGeminiKey', '')) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sayad_custom_gemini_key') || '') : '');
  window.State.activeIconTheme = typeof localStorage !== 'undefined' ? (localStorage.getItem('sayad_active_icon_theme') || 'crest-dark') : 'crest-dark';
  window.State.mwDictKey = await window.DB.getSetting('mw_dict_key', 'a25615d3-9057-4b18-b917-f4bf6c173c5c');
  window.State.mwThesaurusKey = await window.DB.getSetting('mw_thesaurus_key', 'f0f9a8b2-85d7-4064-9737-f4432f18ef65');
  window.State.mwApiKey = window.State.mwDictKey;
  if(window.State.autoTheme) applyAutoTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{ if(window.State.autoTheme) applyAutoTheme(); });
  window.State.files = await window.DB.all('files');
  
  // Connect file-input element to importFiles for mobile & desktop uploads
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const files = [...(e.target.files || [])];
      if (files.length) {
        window.importFiles(files);
      }
      fileInput.value = ''; // Reset input so same file can be re-imported
    });
  }

  render();
  await window.seedSampleIfNeeded();
}

export function getThemeCrestUrl() {
  const proTheme = (window.State && window.State.proTheme) || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_pro_theme') : null) || 'classic';
  if (proTheme === 'titanium') return '/icons/theme-titanium-512.png';
  if (proTheme === 'editorial') return '/icons/theme-editorial-512.png';
  if (proTheme === 'glass') return '/icons/theme-glass-512.png';
  return '/icons/theme-classic-512.png'; // Universal Silver Pure Luxury Default
}
window.getThemeCrestUrl = getThemeCrestUrl;

export function syncThemeColorMeta(){
  const meta = document.querySelector('meta[name="theme-color"]');
  if(!meta) return;
  const theme = document.documentElement.dataset.theme || window.State?.theme || 'light';
  let color = '#EEF1EA';
  if(theme === 'dark') color = '#0A0F14';
  else if(theme === 'sepia') color = '#DECFAE';
  else if(theme === 'oled') color = '#000000';
  meta.setAttribute('content', color);
  try { localStorage.setItem('sayad_theme', theme); } catch(e){}
}

export function applyAutoTheme(){
  window.State.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = window.State.theme;
  try { localStorage.setItem('sayad_theme', window.State.theme); } catch(e){}
  syncThemeColorMeta();
  window.DB.setting('theme', window.State.theme);
}

/* ============================================================
   GLOBAL SEARCH (dashboard)
   ============================================================ */
export async function runGlobalSearch(q){
  const widgets = document.getElementById('dash-widgets');
  const query = q.trim().toLowerCase();
  if(!query){
    if(widgets) widgets.style.display = 'block';
    if(window.renderDashboard) window.renderDashboard();
    return;
  }

  if(widgets) widgets.style.display = 'none';

  const section = document.getElementById('books-section');
  if(!section) return;

  const files = window.State.files || [];
  let notes = [];
  let annots = [];
  let cards = [];

  try {
    if(window.DB && window.DB.all) {
      notes = (await window.DB.all('notes')) || [];
      annots = (await window.DB.all('annotations')) || [];
      cards = (await window.DB.all('flashcards')) || [];
    }
  } catch(err) {
    console.warn('DB fetch for search error:', err);
  }

  // 1. Matched Books
  const matchedBooks = files.filter(f => 
    (f.name && f.name.toLowerCase().includes(query)) ||
    (f.subject && f.subject.toLowerCase().includes(query)) ||
    (f.folder && f.folder.toLowerCase().includes(query))
  );

  // 2. Matched Notes
  const matchedNotes = notes.filter(n => 
    (n.content && n.content.toLowerCase().includes(query)) ||
    (n.sourceText && n.sourceText.toLowerCase().includes(query)) ||
    (n.kind && n.kind.toLowerCase().includes(query))
  ).map(n => {
    const file = files.find(f => f.id === n.fileId);
    return { ...n, fileName: file ? file.name : 'Document Note' };
  });

  // 3. Matched Highlights / Annotations
  const matchedAnnots = annots.filter(a => 
    (a.text && a.text.toLowerCase().includes(query)) ||
    (a.note && a.note.toLowerCase().includes(query)) ||
    (a.label && a.label.toLowerCase().includes(query))
  ).map(a => {
    const file = files.find(f => f.id === a.fileId);
    return { ...a, fileName: file ? file.name : 'Highlight' };
  });

  // 4. Matched Flashcards
  const matchedCards = cards.filter(c =>
    (c.front && c.front.toLowerCase().includes(query)) ||
    (c.back && c.back.toLowerCase().includes(query))
  ).map(c => {
    const file = files.find(f => f.id === c.fileId);
    return { ...c, fileName: file ? file.name : 'Flashcard' };
  });

  const totalHits = matchedBooks.length + matchedNotes.length + matchedAnnots.length + matchedCards.length;

  if(totalHits === 0){
    section.innerHTML = window.emptyState('search', 'No matches found', `No books, notes, or highlights matching "${window.escapeHtml(q)}"`);
    return;
  }

  let html = `<div style="font-size:13.5px; font-weight:700; color:var(--text-dim); margin-bottom:18px;">
    Found ${totalHits} result${totalHits === 1 ? '' : 's'} for "${window.escapeHtml(q)}"
  </div>`;

  // Render Books Section
  if(matchedBooks.length){
    html += `
      <div style="margin-bottom:24px;">
        <div style="font-size:13.5px; font-weight:800; color:var(--accent); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          ${window.icon('book','icon icon-sm')} Books (${matchedBooks.length})
        </div>
        <div class="grid-books">${matchedBooks.map(f => window.bookCard(f, false)).join('')}</div>
      </div>
    `;
  }

  // Render Notes Section
  if(matchedNotes.length){
    html += `
      <div style="margin-bottom:24px;">
        <div style="font-size:13.5px; font-weight:800; color:var(--accent); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          ${window.icon('note','icon icon-sm')} Notes (${matchedNotes.length})
        </div>
        <div style="display:grid; gap:10px;">
          ${matchedNotes.map(n => `
            <div class="card search-note-item" data-file="${n.fileId}" data-page="${n.page||1}" style="padding:14px; cursor:pointer; border-left:3px solid var(--accent); transition:transform 0.15s ease;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:700; color:var(--accent);">${window.escapeHtml(n.fileName)}</span>
                <span class="font-mono" style="font-size:11px; color:var(--text-faint); background:var(--surface-2); padding:2px 8px; border-radius:6px;">p. ${n.page||1}</span>
              </div>
              <div style="font-size:13.5px; font-weight:600; color:var(--text); line-height:1.4; margin-bottom:4px;">
                ${window.escapeHtml(n.content || '')}
              </div>
              ${n.sourceText ? `<div style="font-size:12px; color:var(--text-dim); font-style:italic; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">"${window.escapeHtml(n.sourceText)}"</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Render Highlights / Annotations Section
  if(matchedAnnots.length){
    html += `
      <div style="margin-bottom:24px;">
        <div style="font-size:13.5px; font-weight:800; color:var(--accent); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          ${window.icon('edit','icon icon-sm')} Highlights & Annotations (${matchedAnnots.length})
        </div>
        <div style="display:grid; gap:10px;">
          ${matchedAnnots.map(a => `
            <div class="card search-annot-item" data-file="${a.fileId}" data-page="${a.page||1}" style="padding:14px; cursor:pointer; border-left:3px solid ${a.color || 'var(--accent)'}; transition:transform 0.15s ease;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:700; color:var(--text-dim);">${window.escapeHtml(a.fileName)}</span>
                <span class="font-mono" style="font-size:11px; color:var(--text-faint); background:var(--surface-2); padding:2px 8px; border-radius:6px;">p. ${a.page||1}</span>
              </div>
              <div style="font-size:13px; color:var(--text); font-weight:500; background:var(--surface-2); padding:8px 10px; border-radius:8px; line-height:1.4;">
                "${window.escapeHtml(a.text || a.note || '')}"
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Render Flashcards Section
  if(matchedCards.length){
    html += `
      <div style="margin-bottom:24px;">
        <div style="font-size:13.5px; font-weight:800; color:var(--accent); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          ${window.icon('sparkles','icon icon-sm')} Flashcards (${matchedCards.length})
        </div>
        <div style="display:grid; gap:10px;">
          ${matchedCards.map(c => `
            <div class="card search-card-item" data-file="${c.fileId}" data-page="${c.page||1}" style="padding:14px; cursor:pointer; border:1px solid var(--border);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:12px; font-weight:700; color:var(--accent);">${window.escapeHtml(c.fileName)}</span>
                <span class="font-mono" style="font-size:11px; color:var(--text-faint);">p. ${c.page||1}</span>
              </div>
              <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:4px;">Q: ${window.escapeHtml(c.front || '')}</div>
              <div style="font-size:12.5px; color:var(--text-dim);">A: ${window.escapeHtml(c.back || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  section.innerHTML = html;

  // Bind clicks
  section.querySelectorAll('[data-open]').forEach(el => {
    el.onclick = () => window.openReader(el.dataset.open);
  });
  section.querySelectorAll('[data-menu]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); window.openBookMenu(el.dataset.menu); };
  });
  section.querySelectorAll('.search-note-item, .search-annot-item, .search-card-item').forEach(el => {
    el.onclick = () => {
      const fileId = el.dataset.file;
      const page = parseInt(el.dataset.page, 10) || 1;
      if(fileId) window.openReader(fileId, page);
    };
  });
}

/* ============================================================
   IN-DOC SEARCH
   ============================================================ */
export async function buildSearchIndex(){
  const fid = window.State.currentFile.id;
  if(window.State.searchIndex[fid]) return window.State.searchIndex[fid];
  const pages = [];
  for(let i=1;i<=window.State.numPages;i++){
    const page = await window.State.currentDoc.getPage(i);
    const tc = await page.getTextContent();
    pages.push({page:i, text: tc.items.map(it=>it.str).join(' ')});
  }
  window.State.searchIndex[fid] = pages;
  return pages;
}

export async function openInDocSearch(){
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 14px;">Search in document</div>
    <input id="doc-search-input" placeholder="Search text…" style="width:100%; padding:12px; font-size:14.5px; margin-bottom:12px;">
    <div id="doc-search-results" style="font-size:13.5px; color:var(--text-dim);">Building index…</div>
  `);
  const pages = await buildSearchIndex();
  document.getElementById('doc-search-results').textContent = 'Type to search across all pages.';
  document.getElementById('doc-search-input').oninput = window.debounce((e)=>{
    const q = e.target.value.trim().toLowerCase();
    const results = document.getElementById('doc-search-results');
    if(!q){ results.textContent='Type to search across all pages.'; return; }
    const hits = pages.filter(p=>p.text.toLowerCase().includes(q)).slice(0,40);
    if(!hits.length){ results.innerHTML = `No matches for "${window.escapeHtml(q)}"`; return; }
    results.innerHTML = hits.map(h=>{
      const i = h.text.toLowerCase().indexOf(q);
      const snippet = window.escapeHtml(h.text.slice(Math.max(0,i-40), i+60));
      return `<button class="btn search-hit" data-page="${h.page}" style="width:100%; text-align:left; justify-content:flex-start; padding:10px; background:transparent; border-bottom:1px solid var(--border); border-radius:0; color:var(--text);">
        <span class="font-mono" style="color:var(--accent); font-size:11px; flex-shrink:0;">p.${h.page}</span>
        <span style="font-size:13px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">…${snippet}…</span>
      </button>`;
    }).join('');
    document.querySelectorAll('.search-hit').forEach(b=>{
      b.onclick=()=>{ window.Sheet.close(); const pg=Number(b.dataset.page); window.scrollToPage(pg); flashSearchMatch(pg, q); };
    });
  }, 250);
}

export function flashSearchMatch(pageNum, query, attemptsLeft=8){
  const pe = window.pageEls[pageNum];
  if(!pe || !pe.spanRects || !pe.spanRects.length){
    if(attemptsLeft>0) setTimeout(()=>flashSearchMatch(pageNum, query, attemptsLeft-1), 150);
    return;
  }
  const q = query.toLowerCase();
  const matches = pe.spanRects.filter(entry => entry.span.textContent.toLowerCase().includes(q));
  if(!matches.length || !pe.annotLayer) return;
  const flashEls = matches.map(entry=>{
    const r = entry.rect;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${(r.bottom-r.top)||16}px;
      background:rgba(255,106,43,.6); border-radius:3px; pointer-events:none; transition:opacity .8s ease;`;
    pe.annotLayer.appendChild(el);
    return el;
  });
  setTimeout(()=>{
    flashEls.forEach(el=>{ el.style.opacity='0'; setTimeout(()=>el.remove(), 800); });
  }, 1100);
}

/* ============================================================
   AI CHAT (Clean unified ChatGPT / Gemini experience)
   ============================================================ */
export async function openAIChat(prefillQuestion){
  if (window.Sheet) {
    if (typeof window.Sheet.closeImmediate === 'function') {
      window.Sheet.closeImmediate();
    } else if (typeof window.Sheet.close === 'function') {
      window.Sheet.close();
    }
  }
  const fid = window.State?.currentFile?.id || 'global_chat';
  if (typeof window.openTeacherView === 'function') {
    window.openTeacherView(prefillQuestion || '', 'professional', fid);
  }
}

export function openAIMenu(isFromSettings = false){
  const nativeText = window.getSelection ? window.getSelection().toString().trim() : '';
  if (isFromSettings || !nativeText) {
    if (window.hideSelToolbar) window.hideSelToolbar();
    window.pendingSelection = null;
  }

  const sel = window.pendingSelection;
  const hasText = !!(sel && sel.text && sel.text.trim() && !isFromSettings);
  const curPage = window.State?.currentPage || 1;

  window.Sheet.open(`
    <div style="padding:2px 0 16px;">
      <!-- Header with Title and Close X Button -->
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
        <div>
          <div class="font-display" style="font-size:20px; font-weight:700; color:var(--text); margin-bottom:2px;">AI study tools</div>
          <div style="font-size:12.5px; color:var(--text-dim); display:flex; align-items:center; gap:6px;">
            <span style="background:${hasText ? 'rgba(224, 83, 20, 0.12)' : 'var(--accent-soft)'}; color:${hasText ? '#e05314' : 'var(--accent)'}; font-size:11px; font-weight:700; padding:2px 7px; border-radius:4px; text-transform:uppercase;">
              ${hasText ? 'Selection Mode' : `Book Chat Mode`}
            </span>
            <span>${hasText ? 'Based on highlighted passage' : `Ask questions, summaries & explanations`}</span>
          </div>
        </div>
        <button id="close-ai-modal-x" class="btn btn-ghost" style="width:34px; height:34px; border-radius:10px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; padding:0; color:var(--text);" aria-label="Close">
          ✕
        </button>
      </div>

      <!-- Main Orange Action Button -->
      <button class="btn" id="ai-open-chat" style="width:100%; padding:14px; margin-bottom:16px; background:#e05314; color:#ffffff; font-size:15px; font-weight:700; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:8px; border:none; box-shadow:0 3px 12px rgba(224, 83, 20, 0.28); cursor:pointer;">
        ${window.icon('sparkle','icon icon-sm')}
        <span>${hasText ? 'Ask AI about this selection' : 'Chat AI about the book'}</span>
      </button>

      <!-- 2-Column Grid of 7 Tools -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        ${window.AI_TOOLS.map((t, idx) => `
          <button class="btn ai-tool" data-key="${t.key}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:86px; padding:14px 10px; gap:8px; background:var(--surface-2); border:1px solid var(--border); border-radius:14px; color:var(--text); cursor:pointer; ${idx === 6 ? 'grid-column: span 1;' : ''}">
            <div style="color:var(--text); opacity:0.85;">${window.icon(t.icon, 'icon icon-md')}</div>
            <span style="font-size:13px; font-weight:600; text-align:center; line-height:1.2;">${t.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `);

  const closeBtn = document.getElementById('close-ai-modal-x');
  if (closeBtn) {
    closeBtn.onclick = () => window.Sheet.close();
  }

  document.getElementById('ai-open-chat').onclick = () => {
    if (hasText && sel && sel.text && sel.text.trim()) {
      openAIChat(`"${sel.text.trim()}"`);
    } else {
      openAIChat(null);
    }
  };

  document.querySelectorAll('.ai-tool').forEach(b => {
    b.onclick = () => {
      const toolKey = b.dataset.key;
      const toolObj = window.AI_TOOLS.find(t => t.key === toolKey);
      if (hasText) {
        if (toolKey === 'meaning' && window.runDictionaryLookup) {
          window.runDictionaryLookup(sel);
        } else {
          window.runAIToolObj(toolObj, sel, false);
        }
      } else {
        const pageText = window.getCurrentPageText ? window.getCurrentPageText() : '';
        const mockSel = { text: pageText || `Content of Page ${curPage}`, pageNum: curPage, isSelection: false };
        if (toolKey === 'mcq' && window.runMCQGeneratorModal) {
          window.runMCQGeneratorModal(mockSel);
        } else if (toolKey === 'flashcards' && window.runInteractiveFlashcardsModal) {
          window.runInteractiveFlashcardsModal(mockSel);
        } else if (toolKey === 'meaning' && window.runDictionaryLookup) {
          window.runDictionaryLookup({ text: '' });
        } else {
          window.runAIToolObj(toolObj, mockSel, true);
        }
      }
    };
  });
}

export function runQuickExplain(sel, wordMode){
  if(wordMode) return window.runDictionaryLookup(sel);
  const tool = {key:'explain', icon:'brain', label:'Explain this line', prompt:(t)=>`Explain this line/sentence simply and clearly, as if to a student encountering it for the first time, using an analogy if it helps:\n\n"""${t}"""`};
  return window.runAIToolObj(tool, sel);
}

// Bind to window for global availability
window.bottomNavHtml = bottomNavHtml;
window.bindBottomNav = bindBottomNav;
window.render = render;
window.applyAutoTheme = applyAutoTheme;
window.runGlobalSearch = runGlobalSearch;
window.buildSearchIndex = buildSearchIndex;
window.openInDocSearch = openInDocSearch;
window.flashSearchMatch = flashSearchMatch;
window.openAIChat = openAIChat;
window.openAcademicChat = openAIChat;
window.openAIMenu = openAIMenu;
window.runQuickExplain = runQuickExplain;
window.boot = boot;

/* ============================================================
   INIT & PREVENT DIRECT VIEWPORT ZOOM
   ============================================================ */
if('ontouchstart' in window || navigator.maxTouchPoints>0){
  document.documentElement.classList.add('touch-device');
}

// Prevent browser native page-scaling zoom events on multi-touch gestures completely.
// This restricts the page layout to 1.0 scale everywhere, while the custom zoom engine inside the reader
// is completely unaffected because it uses JavaScript CSS scale transforms on its own container.
document.addEventListener('touchmove', (e)=>{
  if(e.touches.length > 1) {
    e.preventDefault();
  }
}, {passive:false});

document.addEventListener('gesturestart', (e)=>{
  e.preventDefault();
}, {passive:false});

document.addEventListener('gesturechange', (e)=>{
  e.preventDefault();
}, {passive:false});

let pointerDownPos = null;
document.addEventListener('pointerdown', (e)=>{
  pointerDownPos = { x: e.clientX, y: e.clientY };
}, {passive:true});

// Dismiss selection toolbar when tapping on empty space without scrolling
document.addEventListener('click', (e)=>{
  const bar = document.getElementById('sel-toolbar');
  if(!bar || !bar.classList.contains('show')) return;

  // Protect against trailing click right after a text selection is formed (e.g. tap-hold release or double tap)
  if (window.lastSelectionTime && (Date.now() - window.lastSelectionTime < 500)) {
    return;
  }

  // If active native selection exists, do not dismiss
  const activeSel = window.getSelection() ? window.getSelection().toString().trim() : '';
  if (activeSel && activeSel.length > 0) return;

  // If user moved mouse/finger more than 8px, it was a scroll/drag gesture, so do not hide
  if (pointerDownPos) {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 8) return;
  }

  // Do not hide if click is inside the toolbar or bottom sheet
  if(bar.contains(e.target)) return;
  if(document.getElementById('sheet')?.contains(e.target)) return;
  if(e.target.closest('.sheet') || e.target.closest('#sheet-backdrop')) return;

  // Do not hide if click is on selection handles or pending selection marks
  if(e.target.closest('.sel-handle') || e.target.closest('.pending-mark')) return;

  // Do not hide if click is on form fields, buttons, etc.
  if(e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('[role="button"]')) return;

  window.hideSelToolbar();
}, true);

// Automatically detect and handle selections instantly across the reader (handles desktop drag, double clicks, touch selection, etc.)
let selectionTimer = null;
const triggerSelection = () => {
  clearTimeout(selectionTimer);
  if (window.State && window.State.view === 'reader' && typeof window.handleSelection === 'function') {
    selectionTimer = setTimeout(() => {
      window.handleSelection();
    }, 15);
  }
};
document.addEventListener('mouseup', triggerSelection);
document.addEventListener('dblclick', triggerSelection);
document.addEventListener('touchend', triggerSelection);
document.addEventListener('selectionchange', triggerSelection);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.hideSelToolbar();
  }
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && window.State.view==='reader' && window.State.keepAwake) window.requestWakeLock();
});

let lastKnownWidth = window.innerWidth;
const handleViewportResize = () => {
  const widthChanged = Math.abs(window.innerWidth - lastKnownWidth) > 10;
  lastKnownWidth = window.innerWidth;
  if(!widthChanged && !window.screen?.orientation) return;
  if(window.zoomGestureActive) return;
  if(window.State.view==='reader' && window.State.currentDoc) {
    if (typeof window.updateReaderZoom === 'function') {
      window.updateReaderZoom(true);
    } else if (typeof window.mountReaderContent === 'function') {
      window.mountReaderContent();
    }
  }
};

window.addEventListener('resize', window.debounce(handleViewportResize, 200));
window.addEventListener('orientationchange', () => {
  setTimeout(handleViewportResize, 150);
});

if(window.visualViewport){
  const repositionAll = ()=>{
    window.positionBottomBar(document.getElementById('sel-toolbar'));
    window.positionBottomBar(document.getElementById('sheet'));
  };
  window.visualViewport.addEventListener('resize', repositionAll);
  window.visualViewport.addEventListener('scroll', repositionAll);
}

// Delegated bottom navigation tap handler ensuring seamless switching from any screen
document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    const targetView = navBtn.dataset.nav;
    if (targetView) {
      window.State.view = targetView;
      window.scrollTo(0, 0);
      render();
    }
  }
});

window.syncThemeColorMeta = syncThemeColorMeta;
window.applyAutoTheme = applyAutoTheme;

// Note: App boot-up is triggered from App.tsx useEffect once the DOM is fully mounted.
