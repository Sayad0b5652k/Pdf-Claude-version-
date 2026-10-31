// @ts-nocheck

export function getDashboardScrollEl(){
  return document.getElementById('dashboard-drop') || document.querySelector('.view') || document.documentElement;
}

export async function renderDashboard(preserveScroll = true){
  if (window.State.view !== 'dashboard') return;
  const scrollEl = getDashboardScrollEl();
  const prevScroll = preserveScroll && scrollEl ? scrollEl.scrollTop : 0;
  const files = window.State.files.slice().sort((a,b)=>b.lastOpened-a.lastOpened);
  const recents = files.filter(f => f.lastOpened && !f.hideFromRecents).slice(0,8);
  const folders = [...new Set(files.map(f=>f.folder).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const totalSize = files.reduce((a,f)=>a+(f.size||0),0);
  const readingStats = await window.getReadingStats();
  const chatHistories = await window.DB.all('chathistory').catch(() => []);
  // The user may have navigated away (e.g. opened a book) while the awaits above were pending
  if (window.State.view !== 'dashboard') return;

  const existingDash = document.getElementById('dashboard-drop');
  if (existingDash) {
    // Dashboard is already mounted. Perform in-place DOM updates so scroll container
    // height never collapses to 0 and page scroll is completely stable!
    const widgetsEl = document.getElementById('dash-widgets');
    if (widgetsEl) {
      widgetsEl.innerHTML = `
        ${renderAnalyticsCard(files, readingStats)}

        ${recents.length? `
        <div id="continue-reading-section" style="margin-bottom:24px;">
          <div class="section-title" style="margin-bottom:10px;">Continue reading</div>
          <div id="continue-reading-track" class="hscroll no-scrollbar">
            ${recents.map(f=>bookCard(f,true)).join('')}
          </div>
        </div>`:''}

        <div class="no-scrollbar" style="display:flex; gap:8px; overflow-x:auto; margin-bottom:16px; padding-bottom:2px;">
          <div class="chip ${window.State.filterView==='all'?'active':''}" data-filter="all">All</div>
          <div class="chip ${window.State.filterView==='pinned'?'active':''}" data-filter="pinned">${window.icon('star','icon icon-sm')} Pinned</div>
          ${folders.map(f=>`<div class="chip ${window.State.filterView==='folder:'+f?'active':''}" data-filter="folder:${window.escapeHtml(f)}">${window.icon('folder','icon icon-sm')} ${window.escapeHtml(f)}</div>`).join('')}
        </div>
      `;
    }

    const booksEl = document.getElementById('books-section');
    if (booksEl) {
      booksEl.innerHTML = renderBooksSectionHtml();
    }

    const aiEl = document.getElementById('ai-chat-history-section');
    if (aiEl) {
      aiEl.innerHTML = renderAIChatHistorySectionHtml(chatHistories, files);
    }

    bindDashboardEvents();

    if (preserveScroll && prevScroll > 0) {
      const el = getDashboardScrollEl();
      if (el) {
        el.scrollTop = prevScroll;
        requestAnimationFrame(() => { const e = getDashboardScrollEl(); if (e) e.scrollTop = prevScroll; });
        setTimeout(() => { const e = getDashboardScrollEl(); if (e) e.scrollTop = prevScroll; }, 50);
      }
    }
    return;
  }

  const isFirstMount = !window._hasDashboardMounted;
  window._hasDashboardMounted = true;

  document.getElementById('app').innerHTML = `
  <div class="view ${isFirstMount ? 'home-enter' : ''}" id="dashboard-drop" style="padding:0 0 100px;">
    <div style="position:sticky; top:0; z-index:40; background:var(--bg); padding:16px 20px 12px; backdrop-filter:blur(10px); border-bottom:1px solid var(--border);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:44px; height:44px; border-radius:12px; background:var(--surface-2); border:1px solid var(--accent-soft); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 3px 10px var(--accent-soft); overflow:hidden;">
            <img src="${(typeof window.getThemeCrestUrl === 'function' ? window.getThemeCrestUrl() : '/icons/theme-classic-512.png')}" alt="S.A.Y.A.D." style="width:100%; height:100%; object-fit:cover; border-radius:12px;" />
          </div>
          <div>
            <div class="font-display" style="font-size:22px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; line-height:1.1; color:var(--text);">S.A.Y.A.D.</div>
            <div style="font-size:12px; margin-top:3px; letter-spacing:0.02em;">
              <span style="color:var(--text-dim); font-weight:600;">Built by</span> <span style="color:var(--accent); font-weight:700;">Athar Labs</span>
            </div>
          </div>
        </div>
        <div>
          <label class="btn btn-primary" for="file-input" id="btn-import" style="padding:9px 16px; border-radius:12px; font-size:13px; font-weight:700; gap:6px; box-shadow:0 3px 10px var(--accent-soft); cursor:pointer;">
            ${window.icon('plus','icon icon-sm')}
            <span>Import</span>
          </label>
        </div>
      </div>
      <div style="position:relative;">
        <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-faint); pointer-events:none;">${window.icon('search','icon icon-sm')}</span>
        <input id="dash-search" placeholder="Search books, notes, highlights…" style="width:100%; padding:11px 14px 11px 40px; font-size:14px; border-radius:12px; background:var(--surface-2); border:1px solid var(--border);">
      </div>
    </div>

    <div style="padding:6px 20px;">
      <div id="dash-widgets">
        ${renderAnalyticsCard(files, readingStats)}

        ${recents.length? `
        <div id="continue-reading-section" style="margin-bottom:24px;">
          <div class="section-title" style="margin-bottom:10px;">Continue reading</div>
          <div id="continue-reading-track" class="hscroll no-scrollbar">
            ${recents.map(f=>bookCard(f,true)).join('')}
          </div>
        </div>`:''}

        <div class="no-scrollbar" style="display:flex; gap:8px; overflow-x:auto; margin-bottom:16px; padding-bottom:2px;">
          <div class="chip ${window.State.filterView==='all'?'active':''}" data-filter="all">All</div>
          <div class="chip ${window.State.filterView==='pinned'?'active':''}" data-filter="pinned">${window.icon('star','icon icon-sm')} Pinned</div>
          ${folders.map(f=>`<div class="chip ${window.State.filterView==='folder:'+f?'active':''}" data-filter="folder:${window.escapeHtml(f)}">${window.icon('folder','icon icon-sm')} ${window.escapeHtml(f)}</div>`).join('')}
        </div>
      </div>

      <div id="books-section">${renderBooksSectionHtml()}</div>

      <!-- Professional AI Study Assistant & Chat History Section (At the Bottom) -->
      <div id="ai-chat-history-section" style="margin-top:32px;">
        ${renderAIChatHistorySectionHtml(chatHistories, files)}
      </div>
    </div>
  </div>
  ${window.bottomNavHtml('dashboard')}`;

  bindDashboardEvents();

  if (preserveScroll && prevScroll > 0) {
    const el = getDashboardScrollEl();
    if (el) {
      el.scrollTop = prevScroll;
      requestAnimationFrame(() => {
        const e = getDashboardScrollEl();
        if (e) e.scrollTop = prevScroll;
      });
      setTimeout(() => {
        const e = getDashboardScrollEl();
        if (e) e.scrollTop = prevScroll;
      }, 60);
    }
  }
}

export function bindDashboardEvents() {
  window.bindBottomNav();
  bindAIChatHistoryEvents();

  const searchEl = document.getElementById('dash-search');
  if (searchEl) {
    searchEl.oninput = window.debounce(async (e)=>{
      const q = e.target.value.trim();
      if(!q){ window.renderDashboard(); return; }
      await window.runGlobalSearch(q);
    }, 300);
  }

  document.querySelectorAll('[data-filter]').forEach(el=>{
    el.onclick = ()=>{
      window.State.filterView = el.dataset.filter;
      window.State.activeFolderSubject = null;
      document.querySelectorAll('[data-filter]').forEach(c=>c.classList.toggle('active', c.dataset.filter===window.State.filterView));
      document.getElementById('books-section').innerHTML = renderBooksSectionHtml();
      bindBooksSectionEvents();
    };
  });
  document.querySelectorAll('[data-open]').forEach(el=>{
    el.onclick = ()=>window.openReader(el.dataset.open);
  });
  document.querySelectorAll('[data-menu]').forEach(el=>{
    el.onclick = (e)=>{ e.stopPropagation(); openBookMenu(el.dataset.menu); };
  });
  document.querySelectorAll('[data-remove-recent]').forEach(el=>{
    el.onclick = async (e)=>{
      e.stopPropagation();
      const id = el.dataset.removeRecent;
      await removeBookFromRecents(id);
    };
  });
  bindBooksSectionEvents();
  setupDropzone();
}

export function renderBooksSectionHtml(){
  const toggleButtonsHtml = `
    <button class="btn view-mode-btn" data-view="grid" style="width:32px; height:28px; border-radius:8px; background:${window.State.viewMode==='grid'?'var(--surface)':'transparent'}; color:${window.State.viewMode==='grid'?'var(--accent)':'var(--text-dim)'}; box-shadow:${window.State.viewMode==='grid'?'var(--shadow)':'none'};">${window.icon('grid','icon icon-sm')}</button>
    <button class="btn view-mode-btn" data-view="list" style="width:32px; height:28px; border-radius:8px; background:${window.State.viewMode==='list'?'var(--surface)':'transparent'}; color:${window.State.viewMode==='list'?'var(--accent)':'var(--text-dim)'}; box-shadow:${window.State.viewMode==='list'?'var(--shadow)':'none'};">${window.icon('list','icon icon-sm')}</button>
  `;
  const toggleWrap = `<div style="display:flex; background:var(--surface-2); border-radius:4px; padding:2px; border:1px solid var(--border); flex-shrink:0;">${toggleButtonsHtml}</div>`;
  const titleRow = (label)=>`<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
    <div class="section-title" style="margin-bottom:0;">${label}</div>
    ${toggleWrap}
  </div>`;

  if(window.State.filterView.startsWith('folder:')){
    const folderName = window.State.filterView.slice(7);
    const inFolder = window.State.files.filter(f=>f.folder===folderName);
    if(!inFolder.length){
      return titleRow(window.escapeHtml(folderName)) +
        emptyState('book','No books here yet','Import a PDF to start building your library.');
    }

    const subjectsInFolder = [...new Set(inFolder.map(f=>f.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

    const groups = new Map();
    for(const f of inFolder){
      const key = f.subject || '';
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }

    let subChipsHtml = '';
    if (subjectsInFolder.length > 0) {
      subChipsHtml = `
        <div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:16px; padding-bottom:2px;" class="no-scrollbar">
          <div class="chip folder-sub-chip ${!window.State.activeFolderSubject ? 'active' : ''}" data-folder-sub="" style="font-size:12px; padding:5px 12px; font-weight:700;">
            All Subjects (${inFolder.length})
          </div>
          ${subjectsInFolder.map(s => {
            const count = (groups.get(s) || []).length;
            const isActive = window.State.activeFolderSubject === s;
            return `
              <div class="chip folder-sub-chip ${isActive ? 'active' : ''}" data-folder-sub="${window.escapeHtml(s)}" style="font-size:12px; padding:5px 12px; font-weight:600;">
                📖 ${window.escapeHtml(s)} (${count})
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    const sortWithPinned = (list) => {
      return list.slice().sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.lastOpened || 0) - (a.lastOpened || 0);
      });
    };

    let displayedFolderFiles = sortWithPinned(inFolder);
    if (window.State.activeFolderSubject) {
      displayedFolderFiles = inFolder.filter(f => f.subject === window.State.activeFolderSubject);
      displayedFolderFiles = sortWithPinned(displayedFolderFiles);
    }

    let html = titleRow(`${window.icon('folder','icon icon-sm')} ${window.escapeHtml(folderName)}`);
    html += subChipsHtml;

    if (window.State.activeFolderSubject) {
      html += `
        <div style="font-size:13px; font-weight:700; color:var(--accent); margin:4px 0 12px; display:flex; align-items:center; gap:6px;">
          <span>📖 ${window.escapeHtml(window.State.activeFolderSubject)}</span>
          <span style="font-size:11px; font-weight:500; color:var(--text-dim);">(${displayedFolderFiles.length} books)</span>
        </div>
        <div>${renderBookCards(displayedFolderFiles, false)}</div>
      `;
    } else {
      const withSubject = [...groups.entries()].filter(([k])=>k).sort((a,b)=>a[0].localeCompare(b[0]));
      const noSubject = groups.get('') || [];

      for(const [subject, files] of withSubject){
        html += `
          <div style="font-size:13px; font-weight:700; color:var(--accent); margin:12px 0 8px; display:flex; align-items:center; gap:6px;">
            <span>📖 ${window.escapeHtml(subject)}</span>
            <span style="font-size:11px; font-weight:500; color:var(--text-dim);">(${files.length})</span>
          </div>
          <div style="margin-bottom:20px;">${renderBookCards(sortWithPinned(files), false)}</div>
        `;
      }
      if(noSubject.length){
        if(withSubject.length) {
          html += `
            <div style="font-size:13px; font-weight:700; color:var(--text-dim); margin:12px 0 8px;">
              Other / Uncategorized (${noSubject.length})
            </div>
          `;
        }
        html += renderBookCards(sortWithPinned(noSubject), false);
      }
    }
    return html;
  }

  const sortWithPinned = (list) => {
    return list.slice().sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.lastOpened || 0) - (a.lastOpened || 0);
    });
  };

  let shown = sortWithPinned(window.State.files);
  if(window.State.filterView==='pinned') shown = window.State.files.filter(f=>f.pinned);
  else if(window.State.filterView.startsWith('subject:')) shown = sortWithPinned(window.State.files.filter(f=>f.subject===window.State.filterView.slice(8)));
  return `
    ${titleRow(filterLabel(window.State.filterView))}
    ${shown.length? renderBookCards(shown, false) :
      emptyState('book','No books here yet','Import a PDF to start building your library.')}
  `;
}

export function bindBooksSectionEvents(){
  const section = document.getElementById('books-section');
  if(!section) return;
  section.querySelectorAll('[data-open]').forEach(el=>{
    el.onclick = ()=>window.openReader(el.dataset.open);
  });
  section.querySelectorAll('[data-menu]').forEach(el=>{
    el.onclick = (e)=>{ e.stopPropagation(); openBookMenu(el.dataset.menu); };
  });
  section.querySelectorAll('[data-folder-sub]').forEach(el => {
    el.onclick = () => {
      window.State.activeFolderSubject = el.dataset.folderSub || null;
      section.innerHTML = renderBooksSectionHtml();
      bindBooksSectionEvents();
    };
  });
  section.querySelectorAll('.view-mode-btn').forEach(el=>{
    el.onclick = async ()=>{
      window.State.viewMode = el.dataset.view;
      await window.DB.setting('viewMode', window.State.viewMode);
      section.innerHTML = renderBooksSectionHtml();
      bindBooksSectionEvents();
    };
  });
}

export function paperEntryCard() {
  return `<button class="pp-entry" onclick="window.openPaperView && window.openPaperView({screen:'home'})">
    <span class="pp-entry-ic">${window.icon('paper','icon')}</span>
    <span class="pp-entry-t"><i class="pp-kick">PRACTICE</i><b>Question Papers</b><small>Board-pattern papers from your books, with history</small></span>
    <span class="pp-entry-go">${window.icon('chevRight','icon icon-sm')}</span></button>`;
}

export function renderAnalyticsCard(files, readingStats) {
  const weekDays = readingStats.weekDays || [];

  const barsHtml = weekDays.map((d, idx) => {
    const secs = d.seconds || 0;
    const mins = secs / 60;

    // Bar percentage calculation: 30 min -> 20%, 1 hr (60 min) -> 40%, 4+ hrs (240+ min) -> 100%
    let pct = 0;
    if (secs > 0) {
      if (mins <= 60) {
        pct = (mins / 60) * 40;
      } else if (mins <= 240) {
        pct = 40 + ((mins - 60) / 180) * 60;
      } else {
        pct = 100;
      }
    }

    let valText = '&nbsp;';
    if (secs >= 3600) {
      valText = `${(secs / 3600).toFixed(1)}h`;
    } else if (secs >= 60) {
      valText = `${Math.round(secs / 60)}m`;
    } else if (secs > 0) {
      valText = `${secs}s`;
    }

    const isToday = d.isToday;
    const hasRead = secs > 0;

    const fillHeight = hasRead ? `${Math.min(100, Math.max(6, Math.round(pct)))}%` : '0%';
    const barFillColor = isToday ? 'var(--accent, #d95c27)' : (hasRead ? 'var(--teal, #2fc6bc)' : 'transparent');
    const valColor = isToday ? 'var(--accent, #d95c27)' : (hasRead ? 'var(--text-dim, #637066)' : 'transparent');
    const animDelay = (idx * 0.08).toFixed(2);

    return `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; min-width:0;">
        <div style="height:16px; font-size:10.5px; font-weight:800; color:${valColor}; line-height:1; display:flex; align-items:center; justify-content:center; margin-bottom:6px; white-space:nowrap;">
          ${valText}
        </div>
        <div style="width:100%; max-width:34px; height:78px; background:var(--surface-3, #deded9); border-radius:12px; padding:0; display:flex; flex-direction:column; justify-content:flex-end; overflow:hidden; position:relative; box-shadow:inset 0 1px 3px rgba(0,0,0,0.12);">
          ${hasRead ? `
            <div class="today-charging-bar ${isToday ? 'is-today' : 'is-read'}" style="height:${fillHeight};">
              <!-- Wave Container -->
              <div class="battery-wave-wrap">
                <!-- Primary Wave -->
                <svg class="battery-wave wave-1" viewBox="0 0 120 16" preserveAspectRatio="none">
                  <path d="M0,8 C20,2 40,14 60,8 C80,2 100,14 120,8 L120,16 L0,16 Z" fill="${isToday ? '#ff7a45' : '#56e3d9'}"/>
                </svg>
                
                <!-- Secondary Semi-transparent Wave -->
                <svg class="battery-wave wave-2" viewBox="0 0 120 16" preserveAspectRatio="none">
                  <path d="M0,10 C30,14 50,4 80,11 C100,15 118,6 120,10 L120,16 L0,16 Z" fill="rgba(255, 255, 255, 0.45)"/>
                </svg>
              </div>

              <!-- Bubbles floating animation -->
              <div class="battery-bubble bubble-1"></div>
              <div class="battery-bubble bubble-2"></div>
              <div class="battery-bubble bubble-3"></div>
            </div>
          ` : `
            <div style="width:100%; height:0%;"></div>
          `}
        </div>
        <div style="font-size:11.5px; font-weight:${isToday ? '800' : '600'}; color:${isToday ? 'var(--accent, #d95c27)' : 'var(--text-dim, #637066)'}; margin-top:8px; line-height:1; white-space:nowrap;">
          ${d.dayName}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card" style="padding:20px; margin-bottom:22px; border:1px solid var(--border, #d8ddd5); background:var(--surface, #f8faf6); border-radius:20px; box-shadow:var(--shadow-sm);">
      <!-- Header Section -->
      <div style="margin-bottom:18px;">
        <div style="font-size:18px; font-weight:800; color:var(--text, #1c241e); line-height:1.2; letter-spacing:-0.01em;">
          Reading Analytics
        </div>
        <div style="font-size:12px; font-weight:500; color:var(--text-dim, #637066); margin-top:3px;">
          Weekly Activity &amp; Memory Overview
        </div>
      </div>

      <!-- 4 Metric Cards in 1 Row -->
      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:16px;">
        <div style="background:var(--surface-2, #eef2ea); padding:10px 4px; border-radius:10px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; border:1px solid var(--border-subtle, #dce3d7);">
          <div style="font-size:8.5px; font-weight:800; color:var(--text-dim, #637066); text-transform:uppercase; letter-spacing:.02em; display:flex; align-items:center; justify-content:center; gap:2px; white-space:nowrap; width:100%; overflow:hidden; text-overflow:ellipsis;">
            <span>📚</span><span>BOOKS</span>
          </div>
          <div style="font-size:15px; font-weight:800; color:var(--text, #1c241e); margin-top:4px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${files.length}</div>
        </div>

        <div style="background:var(--surface-2, #eef2ea); padding:10px 4px; border-radius:10px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; border:1px solid var(--border-subtle, #dce3d7);">
          <div style="font-size:8.5px; font-weight:800; color:var(--text-dim, #637066); text-transform:uppercase; letter-spacing:.02em; display:flex; align-items:center; justify-content:center; gap:2px; white-space:nowrap; width:100%; overflow:hidden; text-overflow:ellipsis;">
            <span>🔥</span><span>STREAK</span>
          </div>
          <div style="font-size:15px; font-weight:800; color:var(--accent, #d95c27); margin-top:4px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${readingStats.streakFormatted}</div>
        </div>

        <div style="background:var(--surface-2, #eef2ea); padding:10px 4px; border-radius:10px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; border:1px solid var(--border-subtle, #dce3d7);">
          <div style="font-size:8.5px; font-weight:800; color:var(--text-dim, #637066); text-transform:uppercase; letter-spacing:.02em; display:flex; align-items:center; justify-content:center; gap:2px; white-space:nowrap; width:100%; overflow:hidden; text-overflow:ellipsis;">
            <span>🧠</span><span>RETENTION</span>
          </div>
          <div style="font-size:15px; font-weight:800; color:var(--text, #1c241e); margin-top:4px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${readingStats.retentionFormatted}</div>
        </div>

        <div style="background:var(--surface-2, #eef2ea); padding:10px 4px; border-radius:10px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; border:1px solid var(--border-subtle, #dce3d7);">
          <div style="font-size:8.5px; font-weight:800; color:var(--text-dim, #637066); text-transform:uppercase; letter-spacing:.02em; display:flex; align-items:center; justify-content:center; gap:2px; white-space:nowrap; width:100%; overflow:hidden; text-overflow:ellipsis;">
            <span>📅</span><span>SPENT</span>
          </div>
          <div style="font-size:15px; font-weight:800; color:var(--text, #1c241e); margin-top:4px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${readingStats.monthlyFormatted}</div>
        </div>
      </div>

      <!-- Weekly Read Time Bar Chart Inner Container -->
      <div style="background:var(--surface-2, #eef2ea); padding:14px; border-radius:12px; border:1px solid var(--border-subtle, #dce3d7);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="font-size:10.5px; font-weight:800; color:var(--text-dim, #637066); text-transform:uppercase; letter-spacing:.03em;">
            WEEKLY READ TIME (SUN – SAT)
          </div>
          <div style="font-size:12px; font-weight:600; color:var(--text-dim, #637066);">
            Total: <span style="font-weight:800; color:var(--text, #1c241e);">${readingStats.readTimeFormatted}</span>
          </div>
        </div>

        <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:6px; height:116px;">
          ${barsHtml}
        </div>
      </div>
    </div>
  `;
}

export function statCard(iconHtml,val,label,sublabel){
  return `<div class="card" style="min-width:102px; padding:12px 14px; flex-shrink:0;">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
      <div style="color:var(--accent);">${iconHtml}</div>
      ${sublabel ? `<span style="font-size:9.5px; font-weight:700; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em;">${sublabel}</span>` : ''}
    </div>
    <div class="font-mono" style="font-size:18px; font-weight:700; color:var(--text); white-space:nowrap;">${val}</div>
    <div style="font-size:11.5px; color:var(--text-dim); margin-top:2px; white-space:nowrap; font-weight:500;">${label}</div>
  </div>`;
}

export function filterLabel(f){
  if(f==='all') return 'All books';
  if(f==='pinned') return 'Pinned';
  if(f.startsWith('folder:')) return f.slice(7);
  if(f.startsWith('subject:')) return f.slice(8);
  return 'Books';
}

function bookHue(id){ let h=0; const s=String(id||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%6; }
export function bookCard(f, wide){
  const pct = f.pageCount? Math.round(((f.lastPage||1)/f.pageCount)*100) : 0;
  let tagText = '';
  if (f.folder && f.subject) {
    tagText = `📁 ${window.escapeHtml(f.folder)} › 📖 ${window.escapeHtml(f.subject)}`;
  } else if (f.folder) {
    tagText = `📁 ${window.escapeHtml(f.folder)}`;
  } else if (f.subject) {
    tagText = `📖 ${window.escapeHtml(f.subject)}`;
  }

  return `<div class="book" data-hue="${bookHue(f.id)}" ${wide ? `data-recents-card="${f.id}"` : `data-book-card="${f.id}"`} style="${wide?'width:132px; min-width:132px; flex-shrink:0;':'width:100%;'}" data-open="${f.id}">
    ${f.pinned? `<div class="pin-dot"></div>`:''}
    <div class="thumbwrap">
      ${f.thumb? `<img src="${f.thumb}">` : `<div class="skel" style="position:absolute; inset:0;"></div>`}
      <div class="badge-pages">${f.pageCount||'—'}p</div>
      ${wide ? `<button class="btn btn-remove-recent" data-remove-recent="${f.id}" title="Remove from Continue reading" style="position:absolute; top:4px; right:4px; width:22px; height:22px; border-radius:50%; background:rgba(0,0,0,0.65); color:#fff; display:flex; align-items:center; justify-content:center; border:none; padding:0; z-index:4; cursor:pointer;">${window.icon('x','icon icon-xs')}</button>` : ''}
    </div>
    <div style="padding:9px 10px 11px;">
      <div class="book-card-title" style="font-size:12.5px; font-weight:600; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; min-height:31px;">${window.escapeHtml(f.name)}</div>
      <div class="book-tag-text" style="font-size:10px; color:var(--accent); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; ${tagText ? '' : 'display:none;'}">${tagText}</div>
      <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
        <div style="flex:1; height:3px; background:var(--surface-2); border-radius:1px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:var(--accent);"></div></div>
        <button class="btn" data-menu="${f.id}" style="width:22px; height:22px; background:transparent; color:var(--text-faint); flex-shrink:0;">${window.icon('more','icon icon-sm')}</button>
      </div>
    </div>
  </div>`;
}

export function bookCardList(f){
  const pct = f.pageCount? Math.round(((f.lastPage||1)/f.pageCount)*100) : 0;
  let pathText = '';
  if (f.folder && f.subject) {
    pathText = ` · 📁 ${window.escapeHtml(f.folder)} › 📖 ${window.escapeHtml(f.subject)}`;
  } else if (f.folder) {
    pathText = ` · 📁 ${window.escapeHtml(f.folder)}`;
  } else if (f.subject) {
    pathText = ` · 📖 ${window.escapeHtml(f.subject)}`;
  }

  return `<div class="card" data-hue="${bookHue(f.id)}" data-book-card="${f.id}" data-open="${f.id}" style="display:flex; align-items:center; gap:12px; padding:10px; margin-bottom:10px; cursor:pointer; position:relative;">
    ${f.pinned? `<span class="pin-dot-list" style="position:absolute; top:8px; left:8px; width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); z-index:2;"></span>`:''}
    <div class="card-thumb-wrap" style="width:44px; height:58px; border-radius:4px; overflow:hidden; flex-shrink:0; background:var(--surface-2); position:relative;">
      ${f.thumb? `<img class="card-thumb-img" src="${f.thumb}" style="width:100%; height:100%; object-fit:cover;">` : ''}
    </div>
    <div style="flex:1; min-width:0;">
      <div class="book-card-title" style="font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml(f.name)}</div>
      <div class="book-tag-text font-mono" style="font-size:11px; color:var(--text-dim); margin:3px 0 6px;">${f.pageCount||'—'} pages${pathText}</div>
      <div style="height:3px; background:var(--surface-2); border-radius:1px; overflow:hidden; max-width:180px;"><div style="width:${pct}%; height:100%; background:var(--accent);"></div></div>
    </div>
    <button class="btn" data-menu="${f.id}" style="width:30px; height:30px; background:transparent; color:var(--text-faint); flex-shrink:0;">${window.icon('more','icon icon-sm')}</button>
  </div>`;
}

// Surgical in-place card updater: updates title, cover, and tags with zero scroll jump and zero flicker
export function updateBookCardDOM(fileId) {
  const f = window.State.files.find(x => x.id === fileId);
  if (!f) return;

  const pct = f.pageCount ? Math.round(((f.lastPage || 1) / f.pageCount) * 100) : 0;
  let tagText = '';
  if (f.folder && f.subject) {
    tagText = `📁 ${window.escapeHtml(f.folder)} › 📖 ${window.escapeHtml(f.subject)}`;
  } else if (f.folder) {
    tagText = `📁 ${window.escapeHtml(f.folder)}`;
  } else if (f.subject) {
    tagText = `📖 ${window.escapeHtml(f.subject)}`;
  }

  // Update standard book cards (both grid and list views)
  document.querySelectorAll(`[data-book-card="${fileId}"]`).forEach(card => {
    const titleEl = card.querySelector('.book-card-title');
    if (titleEl) titleEl.textContent = f.name;

    const tagEl = card.querySelector('.book-tag-text');
    if (tagEl) {
      if (card.classList.contains('card')) {
        let pathText = '';
        if (f.folder && f.subject) pathText = ` · 📁 ${window.escapeHtml(f.folder)} › 📖 ${window.escapeHtml(f.subject)}`;
        else if (f.folder) pathText = ` · 📁 ${window.escapeHtml(f.folder)}`;
        else if (f.subject) pathText = ` · 📖 ${window.escapeHtml(f.subject)}`;
        tagEl.innerHTML = `${f.pageCount || '—'} pages${pathText}`;
      } else {
        tagEl.innerHTML = tagText;
        tagEl.style.display = tagText ? 'block' : 'none';
      }
    }

    const imgEl = card.querySelector('.thumbwrap img, .card-thumb-wrap img');
    const thumbWrap = card.querySelector('.thumbwrap, .card-thumb-wrap');
    if (imgEl && f.thumb) {
      imgEl.src = f.thumb;
    } else if (thumbWrap && f.thumb) {
      thumbWrap.innerHTML = `<img class="card-thumb-img" src="${f.thumb}" style="width:100%; height:100%; object-fit:cover;">`;
    }

    let pinDot = card.querySelector('.pin-dot, .pin-dot-list');
    if (f.pinned && !pinDot) {
      if (card.classList.contains('card')) {
        const dot = document.createElement('span');
        dot.className = 'pin-dot-list';
        dot.style.cssText = 'position:absolute; top:8px; left:8px; width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 2px var(--accent-soft); z-index:2;';
        card.prepend(dot);
      } else {
        const dot = document.createElement('div');
        dot.className = 'pin-dot';
        card.prepend(dot);
      }
    } else if (!f.pinned && pinDot) {
      pinDot.remove();
    }
  });

  // Update continue reading recents card
  document.querySelectorAll(`[data-recents-card="${fileId}"]`).forEach(card => {
    const titleEl = card.querySelector('.book-card-title');
    if (titleEl) titleEl.textContent = f.name;

    const imgEl = card.querySelector('.thumbwrap img');
    if (imgEl && f.thumb) imgEl.src = f.thumb;

    const tagEl = card.querySelector('.book-tag-text');
    if (tagEl) {
      tagEl.innerHTML = tagText;
      tagEl.style.display = tagText ? 'block' : 'none';
    }
  });
}

// Surgical removal from Continue Reading with smooth collapse animation
export async function removeBookFromRecents(fileId) {
  const fileObj = window.State.files.find(x => x.id === fileId);
  if (!fileObj) return;
  fileObj.hideFromRecents = true;
  await window.DB.updateFileMeta(fileId, { hideFromRecents: true });
  window.toast('Removed from Continue reading');

  const recentsCards = document.querySelectorAll(`[data-recents-card="${fileId}"]`);
  if (recentsCards.length > 0) {
    recentsCards.forEach(card => {
      card.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.85)';
      card.style.width = '0px';
      card.style.minWidth = '0px';
      card.style.margin = '0px';
      card.style.padding = '0px';
      card.style.overflow = 'hidden';
      setTimeout(() => {
        card.remove();
        const track = document.getElementById('continue-reading-track');
        if (track && track.children.length === 0) {
          const section = document.getElementById('continue-reading-section');
          if (section) section.remove();
        }
      }, 250);
    });
  } else {
    window.renderDashboard(true);
  }
}

export function renderBookCards(files, wide){
  if(window.State.viewMode==='list' && !wide){
    return files.map(f=>bookCardList(f)).join('');
  }
  return `<div class="grid-books">${files.map(f=>bookCard(f,wide)).join('')}</div>`;
}

export function emptyState(iconName,title,sub){
  return `<div class="empty-state" style="text-align:center; padding:50px 20px; color:var(--text-dim);">
    <div class="empty-ic" style="width:64px; height:64px; margin:0 auto 16px; border:1.5px dashed var(--border); border-radius: var(--radius-md); display:flex; align-items:center; justify-content:center; color:var(--text-faint);">
      ${window.icon(iconName,'icon icon-lg')}
    </div>
    <div class="font-display" style="font-size:17px; color:var(--text); margin-bottom:4px;">${title}</div>
    <div style="font-size:13.5px;">${sub}</div>
  </div>`;
}

export function fmtBytes(b){
  if(!b) return '0 MB';
  const mb = b/1024/1024;
  return mb<1000? mb.toFixed(1)+' MB' : (mb/1024).toFixed(2)+' GB';
}

export function setupDropzone(){
  const zone = document.getElementById('dashboard-drop');
  if (!zone) return;
  // renderDashboard() re-runs this on the same persistent element; bind only once or every drop imports N times
  if (zone._dropzoneBound) return;
  zone._dropzoneBound = true;
  ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev, e=>{ e.preventDefault(); document.body.classList.add('dropzone-active'); }));
  ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev, e=>{ e.preventDefault(); document.body.classList.remove('dropzone-active'); }));
  zone.addEventListener('drop', e=>{
    const files = [...e.dataTransfer.files].filter(f=>f.type==='application/pdf');
    if(files.length) window.importFiles(files);
  });
}

export function openBookMenu(fileId){
  const f = window.State.files.find(x=>x.id===fileId);
  if(!f) return;
  const inRecents = f.lastOpened && !f.hideFromRecents;
  window.Sheet.open(`
    <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 14px;">${window.escapeHtml(f.name)}</div>
    ${sheetRow('star', f.pinned?'Unpin':'Pin to top', 'act-pin')}
    ${sheetRow('sparkle', 'Customize book cover', 'act-cover')}
    ${inRecents ? sheetRow('x', 'Remove from Continue reading', 'act-remove-recents') : (f.hideFromRecents ? sheetRow('rotate', 'Restore to Continue reading', 'act-add-recents') : '')}
    ${sheetRow('edit','Rename','act-rename')}
    ${sheetRow('folder','Set folder / subject','act-folder')}
    ${sheetRow('trash','Delete from app','act-delete', true)}
  `);
  document.getElementById('act-pin').onclick = async ()=>{
    const isNowPinned = !f.pinned;
    f.pinned = isNowPinned;
    await window.DB.updateFileMeta(f.id, { pinned: f.pinned });
    window.Sheet.close();

    if (isNowPinned) {
      // User explicitly requested: only when pinning to top, screen smoothly scrolls to top where pinned book appears
      await window.renderDashboard(false);
      const scrollEl = getDashboardScrollEl();
      if (scrollEl) {
        scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setTimeout(() => {
        const topCard = document.querySelector(`[data-book-card="${f.id}"]`);
        if (topCard) {
          topCard.classList.add('book-pinned-pulse');
          setTimeout(() => topCard.classList.remove('book-pinned-pulse'), 1400);
        }
      }, 350);
      window.toast(`Pinned "${f.name}" to top ⭐`);
    } else {
      // User explicitly requested: when unpinning, stay at current scroll position without jumping
      const scrollEl = getDashboardScrollEl();
      const curScroll = scrollEl ? scrollEl.scrollTop : 0;
      await window.renderDashboard(true);
      const targetEl = getDashboardScrollEl();
      if (targetEl) targetEl.scrollTop = curScroll;
      window.toast(`Unpinned "${f.name}"`);
    }
  };
  if (document.getElementById('act-cover')) {
    document.getElementById('act-cover').onclick = ()=>{
      if (typeof window.openCoverCustomizer === 'function') {
        window.openCoverCustomizer(f.id);
      }
    };
  }
  if (document.getElementById('act-remove-recents')) {
    document.getElementById('act-remove-recents').onclick = async ()=>{
      window.Sheet.close();
      await removeBookFromRecents(f.id);
    };
  }
  if (document.getElementById('act-add-recents')) {
    document.getElementById('act-add-recents').onclick = async ()=>{
      f.hideFromRecents = false;
      f.lastOpened = Date.now();
      await window.DB.updateFileMeta(f.id, { hideFromRecents: false, lastOpened: f.lastOpened });
      window.Sheet.close();
      window.toast('Restored to Continue reading');
      const scrollEl = getDashboardScrollEl();
      const curScroll = scrollEl ? scrollEl.scrollTop : 0;
      await window.renderDashboard(true);
      const targetEl = getDashboardScrollEl();
      if (targetEl) targetEl.scrollTop = curScroll;
    };
  }
  document.getElementById('act-rename').onclick = () => {
    window.Sheet.open(`
      <div class="font-display" style="font-size:17px; font-weight:600; margin:6px 0 14px;">Rename book</div>
      <input id="rename-input" value="${window.escapeHtml(f.name)}" style="width:100%; padding:12px; font-size:14.5px; margin-bottom:14px;">
      <button class="btn btn-primary" style="width:100%; padding:13px;" id="rename-save">Save changes</button>
    `);
    document.getElementById('rename-save').onclick = async ()=>{
      const newName = document.getElementById('rename-input').value.trim() || f.name;
      f.name = newName;
      await window.DB.updateFileMeta(f.id, { name: newName });
      if (typeof window.refreshSmartCoverIfActive === 'function') {
        await window.refreshSmartCoverIfActive(f);
      }
      window.Sheet.close();
      updateBookCardDOM(f.id);
      window.toast('Book renamed');
    };
  };
  document.getElementById('act-folder').onclick = ()=>{
    const allFiles = window.State.files || [];
    const existingFolders = [...new Set(allFiles.map(x=>x.folder).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const existingSubjects = [...new Set(allFiles.map(x=>x.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

    const curFolder = f.folder || '';
    const curSubject = f.subject || '';

    window.Sheet.open(`
      <div style="padding:4px 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
            ${window.icon('folder','icon icon-sm')} <span>Organize PDF</span>
          </div>
        </div>

        <div id="org-preview-box" style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:10px 14px; margin-bottom:16px; font-size:13px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:6px;">
          <span style="color:var(--text-dim);">Location:</span>
          <span id="org-preview-path" style="color:var(--accent); font-weight:700;">
            ${curFolder ? `📁 ${window.escapeHtml(curFolder)}` : '📁 Uncategorized'}
            ${curSubject ? ` › 📖 ${window.escapeHtml(curSubject)}` : ''}
          </span>
        </div>

        <div style="margin-bottom:18px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <label style="font-size:13px; font-weight:700; color:var(--text);">Main Folder</label>
            ${existingFolders.length ? `<span style="font-size:11px; color:var(--text-dim);">Select existing or type new</span>` : ''}
          </div>
          
          ${existingFolders.length ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
            ${existingFolders.map(folderName => `
              <button class="btn quick-folder-chip" data-folder="${window.escapeHtml(folderName)}" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:18px; background:${curFolder === folderName ? 'var(--accent)' : 'var(--surface-2)'}; color:${curFolder === folderName ? '#fff' : 'var(--text)'}; border:1px solid ${curFolder === folderName ? 'var(--accent)' : 'var(--border)'};">
                ${window.icon('folder','icon icon-xs')} ${window.escapeHtml(folderName)}
              </button>
            `).join('')}
          </div>
          ` : ''}

          <input id="folder-input" value="${window.escapeHtml(curFolder)}" placeholder="e.g. Class 12, Class 11, Work..." style="width:100%; padding:12px 14px; font-size:14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border);">
        </div>

        <div style="margin-bottom:20px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <label style="font-size:13px; font-weight:700; color:var(--text);">Subject / Sub-category</label>
            <span style="font-size:11px; color:var(--text-dim);">Optional</span>
          </div>

          ${existingSubjects.length ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
            ${existingSubjects.map(subName => `
              <button class="btn quick-subject-chip" data-subject="${window.escapeHtml(subName)}" style="padding:5px 12px; font-size:12px; font-weight:600; border-radius:18px; background:${curSubject === subName ? 'var(--accent)' : 'var(--surface-2)'}; color:${curSubject === subName ? '#fff' : 'var(--text)'}; border:1px solid ${curSubject === subName ? 'var(--accent)' : 'var(--border)'};">
                📖 ${window.escapeHtml(subName)}
              </button>
            `).join('')}
          </div>
          ` : ''}

          <input id="subject-input" value="${window.escapeHtml(curSubject)}" placeholder="e.g. English, History, Physics..." style="width:100%; padding:12px 14px; font-size:14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border);">
        </div>

        <div style="display:flex; gap:10px;">
          <button class="btn" id="organize-clear" style="flex:1; padding:12px; font-size:13.5px; font-weight:600; border-radius:12px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim);">
            Clear All
          </button>
          <button class="btn btn-primary" id="organize-save" style="flex:2; padding:12px; font-size:14px; font-weight:700; border-radius:12px; background:var(--accent); color:#fff;">
            Save Organization
          </button>
        </div>
      </div>
    `);

    const folderInput = document.getElementById('folder-input');
    const subjectInput = document.getElementById('subject-input');
    const previewPath = document.getElementById('org-preview-path');

    const updatePreview = () => {
      const fVal = folderInput.value.trim();
      const sVal = subjectInput.value.trim();
      if (!fVal && !sVal) {
        previewPath.innerHTML = '📁 Uncategorized';
      } else {
        let text = '';
        if (fVal) text += `📁 ${window.escapeHtml(fVal)}`;
        if (sVal) text += `${fVal ? ' › ' : ''}📖 ${window.escapeHtml(sVal)}`;
        previewPath.innerHTML = text;
      }
    };

    folderInput.oninput = updatePreview;
    subjectInput.oninput = updatePreview;

    document.querySelectorAll('.quick-folder-chip').forEach(btn => {
      btn.onclick = () => {
        const val = btn.dataset.folder;
        folderInput.value = val;
        document.querySelectorAll('.quick-folder-chip').forEach(c => {
          const active = c.dataset.folder === val;
          c.style.background = active ? 'var(--accent)' : 'var(--surface-2)';
          c.style.color = active ? '#fff' : 'var(--text)';
          c.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updatePreview();
      };
    });

    document.querySelectorAll('.quick-subject-chip').forEach(btn => {
      btn.onclick = () => {
        const val = btn.dataset.subject;
        subjectInput.value = val;
        document.querySelectorAll('.quick-subject-chip').forEach(c => {
          const active = c.dataset.subject === val;
          c.style.background = active ? 'var(--accent)' : 'var(--surface-2)';
          c.style.color = active ? '#fff' : 'var(--text)';
          c.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updatePreview();
      };
    });

    document.getElementById('organize-clear').onclick = () => {
      folderInput.value = '';
      subjectInput.value = '';
      document.querySelectorAll('.quick-folder-chip, .quick-subject-chip').forEach(c => {
        c.style.background = 'var(--surface-2)';
        c.style.color = 'var(--text)';
        c.style.borderColor = 'var(--border)';
      });
      updatePreview();
    };

    document.getElementById('organize-save').onclick = async ()=>{
      f.folder = folderInput.value.trim();
      f.subject = subjectInput.value.trim();
      await window.DB.updateFileMeta(f.id, { folder: f.folder, subject: f.subject });
      if (typeof window.refreshSmartCoverIfActive === 'function') {
        await window.refreshSmartCoverIfActive(f);
      }
      window.Sheet.close();
      window.toast(f.folder ? `Moved to ${f.folder}` : 'Organization updated');
      const scrollEl = getDashboardScrollEl();
      const curScroll = scrollEl ? scrollEl.scrollTop : 0;
      await window.renderDashboard(true);
      const targetEl = getDashboardScrollEl();
      if (targetEl) targetEl.scrollTop = curScroll;
    };
  };
  document.getElementById('act-delete').onclick = async ()=>{
    const fileId = f.id;
    await window.DB.del('files', fileId);
    const annots = await window.DB.byIndex('annotations','fileId',fileId);
    for(const a of annots) await window.DB.del('annotations', a.id);
    const bms = await window.DB.byIndex('bookmarks','fileId',fileId);
    for(const b of bms) await window.DB.del('bookmarks', b.id);
    const ns = await window.DB.byIndex('notes','fileId',fileId);
    for(const n of ns) await window.DB.del('notes', n.id);
    await window.DB.del('progress', fileId);
    window.State.files = window.State.files.filter(x=>x.id!==fileId);
    window.Sheet.close();
    window.toast('Removed from app');

    // Surgical card animation: fade out and remove cards without jumping scroll
    const cards = document.querySelectorAll(`[data-book-card="${fileId}"], [data-recents-card="${fileId}"]`);
    if (cards.length > 0) {
      cards.forEach(card => {
        card.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.85)';
      });
      setTimeout(async () => {
        cards.forEach(card => card.remove());
        const scrollEl = getDashboardScrollEl();
        const curScroll = scrollEl ? scrollEl.scrollTop : 0;
        await window.renderDashboard(true);
        const targetEl = getDashboardScrollEl();
        if (targetEl) targetEl.scrollTop = curScroll;
      }, 250);
    } else {
      const scrollEl = getDashboardScrollEl();
      const curScroll = scrollEl ? scrollEl.scrollTop : 0;
      await window.renderDashboard(true);
      const targetEl = getDashboardScrollEl();
      if (targetEl) targetEl.scrollTop = curScroll;
    }
  };
}

export function renderAIChatHistorySectionHtml(chatHistories = [], files = []){
  const validChats = (chatHistories || []).filter(c => c && Array.isArray(c.messages) && c.messages.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const formatRelativeTime = (ts) => {
    if (!ts) return '';
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return `
    <div class="sy-aihist">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:38px; height:38px; border-radius:10px; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${window.icon('teacher', 'icon icon-md')}
          </div>
          <div>
            <i class="pp-kick">AI TUTOR</i><div class="font-display" style="font-size:16px; font-weight:800; color:var(--text); line-height:1.2;">
              AI Study Assistant &amp; Chat History
            </div>
            <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">
              Ask questions across all books or continue previous PDF study sessions
            </div>
          </div>
        </div>

        <button class="btn btn-primary" id="btn-start-general-ai-chat" style="padding:8px 14px; font-size:12.5px; font-weight:700; border-radius:10px; gap:6px;">
          ${window.icon('sparkle', 'icon icon-xs')}
          <span>New General Chat</span>
        </button>
      </div>

      ${validChats.length === 0 ? `
        <div class="sy-aiempty">
          <div style="color:var(--text-dim); margin-bottom:8px;">${window.icon('messages', 'icon icon-lg')}</div>
          <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:4px;">No AI chats yet</div>
          <div style="font-size:12.5px; color:var(--text-dim); max-width:380px; margin:0 auto 14px;">
            Start a universal conversation to ask any academic question, or open a PDF to study specific pages and solve questions.
          </div>
          <button class="btn btn-primary" id="btn-empty-start-ai-chat" style="padding:9px 18px; font-size:13px; font-weight:700; border-radius:10px;">
            Start First AI Chat
          </button>
        </div>
      ` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${validChats.map(chat => {
            const isGlobal = chat.fileId === 'global_chat' || chat.fileId === 'global_tutor';
            const matchedFile = files.find(f => f.id === chat.fileId);
            const title = isGlobal ? 'General AI Study Chat' : (matchedFile ? matchedFile.name : 'PDF Study Session');
            const messages = chat.messages || [];
            const lastMsg = messages[messages.length - 1];
            const msgCount = messages.length;
            const rawLastText = lastMsg ? (typeof lastMsg.text === 'string' ? lastMsg.text : (lastMsg.text != null ? String(lastMsg.text) : '')) : '';
            const snippet = rawLastText ? (rawLastText.replace(/[#*_`]/g, '').slice(0, 95) + (rawLastText.length > 95 ? '…' : '')) : 'No messages yet';
            const timeStr = formatRelativeTime(chat.updatedAt);

            return `
              <div class="card ai-chat-history-item sy-aiitem" data-file-id="${chat.fileId}" style="padding:12px 14px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:12px; transition:border-color 0.15s, transform 0.15s;">
                <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                  <div style="width:34px; height:34px; border-radius:8px; background:${isGlobal ? 'var(--accent-soft)' : 'var(--surface-3)'}; color:${isGlobal ? 'var(--accent)' : 'var(--text)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    ${window.icon(isGlobal ? 'sparkle' : 'book', 'icon icon-sm')}
                  </div>
                  <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                      <span style="font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${window.escapeHtml(title)}
                      </span>
                      <span style="font-size:10px; font-weight:700; background:var(--surface-3); color:var(--text-dim); padding:1px 6px; border-radius:4px; flex-shrink:0;">
                        ${msgCount} msg${msgCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style="font-size:12px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                      ${window.escapeHtml(snippet)}
                    </div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                  <span style="font-size:11px; color:var(--text-faint);">${timeStr}</span>
                  <button class="btn btn-icon delete-chat-hist-btn" data-delete-chat-id="${chat.fileId}" title="Delete chat history" style="width:28px; height:28px; border-radius:50%; background:transparent; border:none; color:var(--text-faint);">
                    ${window.icon('trash', 'icon icon-xs')}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

export function bindAIChatHistoryEvents(){
  const startBtn = document.getElementById('btn-start-general-ai-chat');
  if (startBtn) {
    startBtn.onclick = () => {
      if (typeof window.openTeacherView === 'function') {
        window.openTeacherView('', 'professional', 'global_chat');
      }
    };
  }

  const emptyStartBtn = document.getElementById('btn-empty-start-ai-chat');
  if (emptyStartBtn) {
    emptyStartBtn.onclick = () => {
      if (typeof window.openTeacherView === 'function') {
        window.openTeacherView('', 'professional', 'global_chat');
      }
    };
  }

  document.querySelectorAll('.ai-chat-history-item').forEach(item => {
    item.onclick = (e) => {
      if (e.target.closest('.delete-chat-hist-btn')) return;
      const fileId = item.dataset.fileId;
      if (typeof window.openTeacherView === 'function') {
        window.openTeacherView('', 'professional', fileId);
      }
    };
  });

  document.querySelectorAll('.delete-chat-hist-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const chatId = btn.dataset.deleteChatId;
      if (!chatId) return;
      try {
        await window.DB.del('chathistory', chatId);
        window.toast('Chat history deleted 🗑️');
        if (typeof window.renderDashboard === 'function') {
          window.renderDashboard();
        }
      } catch (err) {
        console.error('Failed to delete chat history:', err);
        window.toast('Could not delete chat history');
      }
    };
  });
}

export function sheetRow(iconName,label,id,danger){
  return `<button id="${id}" class="btn" style="width:100%; justify-content:space-between; align-items:center; padding:13px 10px; background:transparent; color:${danger?'var(--danger)':'var(--text)'}; font-size:14.5px; font-weight:500; border-bottom:1px solid var(--border); border-radius:0;">
    <div style="display:flex; align-items:center; gap:10px;">${window.icon(iconName,'icon icon-sm')} ${label}</div>
    <span style="color:var(--text-dim); font-size:14px;">${window.icon('chevRight','icon icon-sm')}</span>
  </button>`;
}

// Bind to window for global availability
window.renderDashboard = renderDashboard;
window.renderBooksSectionHtml = renderBooksSectionHtml;
window.bindBooksSectionEvents = bindBooksSectionEvents;
window.bookCard = bookCard;
window.emptyState = emptyState;
window.fmtBytes = fmtBytes;
window.setupDropzone = setupDropzone;
window.openBookMenu = openBookMenu;
window.sheetRow = sheetRow;
window.updateBookCardDOM = updateBookCardDOM;
window.removeBookFromRecents = removeBookFromRecents;
