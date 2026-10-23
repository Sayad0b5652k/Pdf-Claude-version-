// @ts-nocheck
/**
 * S.A.Y.A.D. — Bespoke Custom Select Component
 * 
 * Replaces clunky, jarring OS/Android native single-choice dialogs with
 * high-craft, theme-integrated mobile-first dropdown sheets and popovers.
 * 
 * - Full 2-way synchronization with native <select> elements (value, selectedIndex, change events)
 * - Ultra-responsive touch targets (>= 48px)
 * - Instant real-time search filter for long option lists (chapters, languages, etc.)
 * - Rich typography (clean separation of module/page metadata from titles)
 * - Animated tactile feedback & fluid open/close transitions
 * - Supports Dark, Light, Sepia, and OLED themes natively
 */

let overlayEl = null;
let currentActiveSelect = null;
let currentActiveTrigger = null;
let isClosing = false;

/**
 * Cleanly parse an option text into a primary title and secondary hint/badge.
 * e.g., "ch-1: The Crow and the Deer MODULE - 1 (pp. 9–32)"
 *   -> title: "ch-1: The Crow and the Deer"
 *   -> meta: "MODULE - 1 (pp. 9–32)"
 */
function parseOptionLabel(rawText) {
  if (!rawText) return { title: '', meta: '' };
  const text = rawText.trim();

  // Pattern 1: Title (Detail inside parens at end)
  // e.g. "Multiple Choice (4 Options A, B, C, D)" or "True / False (Fact Verification)"
  const parenMatch = text.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (parenMatch && parenMatch[1].trim() && parenMatch[2].trim()) {
    return {
      title: parenMatch[1].trim(),
      meta: parenMatch[2].trim()
    };
  }

  // Pattern 2: Chapter format with MODULE or page span
  // e.g. "ch-1: The Crow and the Deer MODULE - 1 (pp. 9–32)"
  const moduleMatch = text.match(/^(.*?)\s+(MODULE\s*[-–]\s*\d+.*?)$/i);
  if (moduleMatch && moduleMatch[1].trim()) {
    return {
      title: moduleMatch[1].trim(),
      meta: moduleMatch[2].trim()
    };
  }

  // Pattern 3: Subtitle separated by dash
  const dashMatch = text.match(/^(.*?)\s*[-–—]\s*(.*)$/);
  if (dashMatch && dashMatch[1].length > 4 && dashMatch[2].length > 4) {
    return {
      title: dashMatch[1].trim(),
      meta: dashMatch[2].trim()
    };
  }

  return { title: text, meta: '' };
}

/**
 * Return an appropriate contextual icon for option types
 */
function getOptionIcon(title, meta, val) {
  const t = (title + ' ' + meta + ' ' + val).toLowerCase();

  // Audio / Soundscapes
  if (t.includes('soundscape') || t.includes('rain') || t.includes('ocean') || t.includes('waves') || t.includes('cafe') || t.includes('fireplace') || t.includes('hz') || t.includes('alpha') || t.includes('flow')) {
    if (t.includes('off') || t.includes('mute')) return '🔇';
    if (t.includes('rain')) return '🌧️';
    if (t.includes('ocean') || t.includes('waves')) return '🌊';
    if (t.includes('cafe') || t.includes('coffee')) return '☕';
    if (t.includes('fire')) return '🔥';
    if (t.includes('432hz') || t.includes('alpha')) return '🧠';
    if (t.includes('528hz') || t.includes('flow')) return '⚡';
    return '🎵';
  }

  // Screensaver / OLED
  if (t.includes('blank') || t.includes('screensaver') || t.includes('retro') || t.includes('oled')) {
    if (t.includes('blank')) return '⬛';
    if (t.includes('retro') || t.includes('sayad')) return '📺';
    if (t.includes('fire')) return '🔥';
    return '✨';
  }

  // Double tap / Gestures
  if (t.includes('zoom')) return '🔍';
  if (t.includes('bookmark')) return '🔖';
  if (t.includes('zen') || t.includes('hide')) return '👁️';
  if (t.includes('explain') || t.includes('ai')) return '🤖';
  if (t.includes('disable') || t.includes('none')) return '🚫';

  // Orientation
  if (t.includes('portrait')) return '📱';
  if (t.includes('landscape')) return '🔄';
  if (t.includes('auto') || t.includes('sensor')) return '🌐';

  // Quiz / MCQ Formats
  if (t.includes('multiple choice') || t.includes('4 options')) return '🎯';
  if (t.includes('assertion')) return '⚖️';
  if (t.includes('board theory') || t.includes('subjective')) return '📝';
  if (t.includes('fill in the blanks')) return '🧩';
  if (t.includes('true / false') || t.includes('fact')) return '✅';

  // Flashcard focus
  if (t.includes('core concepts') || t.includes('definitions')) return '💡';
  if (t.includes('thinkers') || t.includes('dates')) return '🏛️';
  if (t.includes('recall') || t.includes('q&a')) return '⚡';
  if (t.includes('cause') || t.includes('effect')) return '🔗';

  // Languages
  if (t.includes('english') || t.includes('hindi') || t.includes('spanish') || t.includes('french') || t.includes('german') || t.includes('urdu') || t.includes('bengali') || t.includes('marathi')) {
    return '🌐';
  }

  // Chapters
  if (t.includes('ch-') || t.includes('chapter')) return '📖';

  return '•';
}

/**
 * Determine a human-friendly dialog title from the element context
 */
function getSelectTitle(selectEl) {
  if (selectEl.getAttribute('data-custom-title')) {
    return selectEl.getAttribute('data-custom-title');
  }

  // Check closest or sibling labels
  const parent = selectEl.closest('.adv-linear-row, .adv-linear-group, div');
  if (parent) {
    const titleEl = parent.querySelector('.adv-row-title, label, .form-label');
    if (titleEl && titleEl.textContent) {
      const cleaned = titleEl.textContent.replace(/^[📖📑⚙️⚡🎯📝🌐\s]+/, '').trim();
      if (cleaned) return cleaned;
    }
  }

  if (selectEl.id === 'mcq-chapter-dropdown') return 'Select Chapter to Test';
  if (selectEl.id === 'mcq-type-select') return 'Question Format';
  if (selectEl.id === 'fc-focus-select') return 'Flashcard Study Focus';
  if (selectEl.id === 'trans-lang-select') return 'Target Translation Language';
  if (selectEl.id === 'adv-soundscape-select') return 'Ambient Soundscape';
  if (selectEl.id === 'adv-oled-style-select') return 'Screensaver Style';
  if (selectEl.id === 'adv-doubletap-select') return 'Double-Tap Action';
  if (selectEl.id === 'adv-orientation-select') return 'Screen Orientation Mode';

  if (selectEl.getAttribute('aria-label')) return selectEl.getAttribute('aria-label');
  if (selectEl.title) return selectEl.title;

  return 'Select an Option';
}

/**
 * Ensure the singleton overlay container is inserted in the DOM
 */
function ensureOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.id = 'sayad-select-overlay';
  overlayEl.className = 'sayad-select-overlay';
  overlayEl.innerHTML = `
    <div class="sayad-select-backdrop" id="sayad-select-backdrop"></div>
    <div class="sayad-select-panel" id="sayad-select-panel" role="dialog" aria-modal="true">
      <div class="sayad-sheet-grab-bar"></div>
      
      <div class="sayad-sheet-header">
        <div class="sayad-sheet-title-box">
          <div class="sayad-sheet-title-text">
            <h4 class="sayad-sheet-title" id="sayad-sheet-title">Select Option</h4>
            <span class="sayad-sheet-subtitle" id="sayad-sheet-subtitle">Choose from options</span>
          </div>
        </div>
        <button type="button" class="sayad-sheet-close-btn" id="sayad-sheet-close-btn" aria-label="Close menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="sayad-sheet-search-wrap" id="sayad-sheet-search-wrap">
        <svg class="sayad-sheet-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="sayad-sheet-search-input" id="sayad-sheet-search-input" placeholder="Search options..." autocomplete="off" spellcheck="false" />
        <button type="button" class="sayad-sheet-search-clear" id="sayad-sheet-search-clear" aria-label="Clear search">✕</button>
      </div>

      <div class="sayad-sheet-options-list" id="sayad-sheet-options-list" role="listbox"></div>
      
      <div class="sayad-sheet-empty" id="sayad-sheet-empty" style="display:none;">
        <span class="sayad-sheet-empty-icon">🔍</span>
        <div class="sayad-sheet-empty-msg">No matching options found</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Bind Backdrop & Close Button
  const backdrop = overlayEl.querySelector('#sayad-select-backdrop');
  const closeBtn = overlayEl.querySelector('#sayad-sheet-close-btn');
  const searchInput = overlayEl.querySelector('#sayad-sheet-search-input');
  const searchClear = overlayEl.querySelector('#sayad-sheet-search-clear');

  if (backdrop) backdrop.onclick = () => closeCustomSelectPicker();
  if (closeBtn) closeBtn.onclick = () => closeCustomSelectPicker();

  // Search input live filter
  if (searchInput) {
    searchInput.oninput = () => {
      const q = (searchInput.value || '').trim().toLowerCase();
      if (searchClear) searchClear.style.display = q ? 'flex' : 'none';
      filterOptionsList(q);
    };
  }

  if (searchClear) {
    searchClear.onclick = () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      searchClear.style.display = 'none';
      filterOptionsList('');
    };
  }

  // Keyboard accessibility
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl && overlayEl.classList.contains('active')) {
      closeCustomSelectPicker();
    }
  });

  return overlayEl;
}

/**
 * Filter the options in the open picker sheet
 */
function filterOptionsList(query) {
  if (!overlayEl) return;
  const listEl = overlayEl.querySelector('#sayad-sheet-options-list');
  const emptyEl = overlayEl.querySelector('#sayad-sheet-empty');
  if (!listEl) return;

  const items = listEl.querySelectorAll('.sayad-option-item');
  let matchCount = 0;

  items.forEach(item => {
    const hay = (item.getAttribute('data-search') || '').toLowerCase();
    const isMatch = !query || hay.includes(query);
    item.style.display = isMatch ? 'flex' : 'none';
    if (isMatch) matchCount++;
  });

  if (emptyEl) {
    emptyEl.style.display = matchCount === 0 ? 'flex' : 'none';
  }
}

/**
 * Open the custom select picker for a given native select element
 */
export function openCustomSelectPicker(selectEl, triggerEl) {
  if (!selectEl || isClosing) return;
  ensureOverlay();

  currentActiveSelect = selectEl;
  currentActiveTrigger = triggerEl;

  const panel = overlayEl.querySelector('#sayad-select-panel');
  const titleEl = overlayEl.querySelector('#sayad-sheet-title');
  const subEl = overlayEl.querySelector('#sayad-sheet-subtitle');
  const searchWrap = overlayEl.querySelector('#sayad-sheet-search-wrap');
  const searchInput = overlayEl.querySelector('#sayad-sheet-search-input');
  const searchClear = overlayEl.querySelector('#sayad-sheet-search-clear');
  const listEl = overlayEl.querySelector('#sayad-sheet-options-list');
  const emptyEl = overlayEl.querySelector('#sayad-sheet-empty');

  const title = getSelectTitle(selectEl);
  if (titleEl) titleEl.textContent = title;

  const options = Array.from(selectEl.options || []);
  const curVal = selectEl.value;

  if (subEl) {
    subEl.textContent = `${options.length} ${options.length === 1 ? 'option' : 'options'} available`;
  }

  // Search visibility: show if 6 or more options (e.g. chapters, languages, soundscapes)
  const showSearch = options.length >= 6;
  if (searchWrap) searchWrap.style.display = showSearch ? 'flex' : 'none';
  if (searchInput) {
    searchInput.value = '';
    if (searchClear) searchClear.style.display = 'none';
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Build Option rows
  listEl.innerHTML = '';
  options.forEach((opt, idx) => {
    const isSelected = (opt.value === curVal) || (idx === selectEl.selectedIndex);
    const parsed = parseOptionLabel(opt.textContent || opt.value);
    const icon = getOptionIcon(parsed.title, parsed.meta, opt.value);
    const searchString = `${parsed.title} ${parsed.meta} ${opt.value}`.toLowerCase();

    const row = document.createElement('div');
    row.className = `sayad-option-item ${isSelected ? 'selected' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    row.setAttribute('data-value', opt.value);
    row.setAttribute('data-index', idx);
    row.setAttribute('data-search', searchString);

    row.innerHTML = `
      <div class="sayad-opt-left">
        <span class="sayad-opt-icon">${icon}</span>
        <div class="sayad-opt-text-wrap">
          <div class="sayad-opt-title">${window.escapeHtml ? window.escapeHtml(parsed.title) : parsed.title}</div>
          ${parsed.meta ? `<div class="sayad-opt-meta">${window.escapeHtml ? window.escapeHtml(parsed.meta) : parsed.meta}</div>` : ''}
        </div>
      </div>
      <div class="sayad-opt-indicator">
        ${isSelected ? `
          <div class="sayad-opt-check-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        ` : `
          <div class="sayad-opt-radio-ghost"></div>
        `}
      </div>
    `;

    row.onclick = (e) => {
      e.stopPropagation();
      selectOptionValue(selectEl, opt.value, idx);
    };

    listEl.appendChild(row);
  });

  // Activate overlay
  overlayEl.classList.add('active');
  document.body.classList.add('sayad-select-open');

  // Trigger button active state
  if (triggerEl) triggerEl.classList.add('active');

  // Auto focus search if visible on desktop, or scroll selected option into view
  setTimeout(() => {
    const selectedRow = listEl.querySelector('.sayad-option-item.selected');
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // Only auto-focus search on larger screens to avoid mobile keyboard jumping up automatically
    if (showSearch && searchInput && window.innerWidth > 640) {
      searchInput.focus();
    }
  }, 100);
}

/**
 * Handle selecting an option
 */
function selectOptionValue(selectEl, value, index) {
  if (!selectEl) return;

  const previousVal = selectEl.value;
  selectEl.value = value;
  selectEl.selectedIndex = index;

  // Update custom trigger UI immediately
  if (currentActiveTrigger) {
    updateTriggerDisplay(selectEl, currentActiveTrigger);
  }

  // Fire change & input events so all existing code listeners react naturally
  try {
    const changeEvt = new Event('change', { bubbles: true });
    const inputEvt = new Event('input', { bubbles: true });
    selectEl.dispatchEvent(changeEvt);
    selectEl.dispatchEvent(inputEvt);

    if (typeof selectEl.onchange === 'function') {
      selectEl.onchange(changeEvt);
    }
  } catch (err) {
    console.warn('Error firing select change event:', err);
  }

  closeCustomSelectPicker();
}

/**
 * Close the custom select picker with a smooth animation
 */
export function closeCustomSelectPicker() {
  if (!overlayEl || isClosing || !overlayEl.classList.contains('active')) return;
  isClosing = true;

  overlayEl.classList.remove('active');
  overlayEl.classList.add('closing');
  document.body.classList.remove('sayad-select-open');

  if (currentActiveTrigger) {
    currentActiveTrigger.classList.remove('active');
  }

  setTimeout(() => {
    overlayEl.classList.remove('closing');
    isClosing = false;
    currentActiveSelect = null;
    currentActiveTrigger = null;
  }, 220);
}

/**
 * Sync the trigger button's label with the select element's current value
 */
export function updateTriggerDisplay(selectEl, triggerEl) {
  if (!selectEl || !triggerEl) return;

  const selectedOpt = selectEl.options && selectEl.options[selectEl.selectedIndex];
  const rawText = selectedOpt ? selectedOpt.textContent : (selectEl.value || '');
  const parsed = parseOptionLabel(rawText);

  const titleSpan = triggerEl.querySelector('.sayad-trigger-title');
  const metaSpan = triggerEl.querySelector('.sayad-trigger-meta');

  if (titleSpan) {
    titleSpan.textContent = parsed.title;
  }
  if (metaSpan) {
    if (parsed.meta) {
      metaSpan.textContent = parsed.meta;
      metaSpan.style.display = 'inline-block';
    } else {
      metaSpan.style.display = 'none';
    }
  }
}

/**
 * Enhance a single native <select> element into a custom dropdown
 */
export function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.nodeName !== 'SELECT') return;

  // If already enhanced, update trigger and return
  if (selectEl.dataset.customSelectInit === 'true') {
    const existingTrigger = selectEl.nextElementSibling;
    if (existingTrigger && existingTrigger.classList.contains('sayad-custom-select-trigger')) {
      updateTriggerDisplay(selectEl, existingTrigger);
    }
    return;
  }

  // Prevent re-init
  selectEl.dataset.customSelectInit = 'true';

  // Check if select is inside an inline wrapper (.adv-inline-select-wrap)
  const isInline = selectEl.classList.contains('adv-inline-select') || !!selectEl.closest('.adv-inline-select-wrap');
  
  // Hide native select completely to prevent mobile browser / Android native dialog
  selectEl.style.setProperty('display', 'none', 'important');
  selectEl.setAttribute('tabindex', '-1');
  selectEl.setAttribute('aria-hidden', 'true');

  // If inside .adv-inline-select-wrap, hide the old hardcoded arrow span if present
  const parentWrap = selectEl.closest('.adv-inline-select-wrap');
  if (parentWrap) {
    const oldArrow = parentWrap.querySelector('.adv-inline-select-arrow');
    if (oldArrow) oldArrow.style.display = 'none';
  }

  // Create custom trigger element
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `sayad-custom-select-trigger ${isInline ? 'sayad-inline-trigger' : ''}`;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  // Copy style overrides if full width
  if (selectEl.style.width === '100%') {
    trigger.style.width = '100%';
  }

  const selectedOpt = selectEl.options && selectEl.options[selectEl.selectedIndex];
  const rawText = selectedOpt ? selectedOpt.textContent : (selectEl.value || '');
  const parsed = parseOptionLabel(rawText);

  trigger.innerHTML = `
    <div class="sayad-trigger-content">
      <span class="sayad-trigger-title">${window.escapeHtml ? window.escapeHtml(parsed.title) : parsed.title}</span>
      <span class="sayad-trigger-meta" style="${parsed.meta ? '' : 'display:none;'}">${window.escapeHtml ? window.escapeHtml(parsed.meta) : parsed.meta}</span>
    </div>
    <div class="sayad-trigger-chevron">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </div>
  `;

  // Insert trigger right next to select
  selectEl.parentNode.insertBefore(trigger, selectEl.nextSibling);

  // Bind click
  trigger.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCustomSelectPicker(selectEl, trigger);
  };

  // Two-way listener: when native select changes programmatically
  selectEl.addEventListener('change', () => {
    updateTriggerDisplay(selectEl, trigger);
  });

  // Observe option mutations (e.g. when chapter list is loaded into select after PDF parsing)
  const observer = new MutationObserver(() => {
    updateTriggerDisplay(selectEl, trigger);
  });
  observer.observe(selectEl, { childList: true, subtree: true, attributes: true });
}

/**
 * Scan a container (or document.body) and enhance all <select> elements
 */
export function enhanceCustomSelects(container = document.body) {
  if (!container || !container.querySelectorAll) return;
  const selects = container.querySelectorAll('select:not([data-native="true"])');
  selects.forEach(sel => enhanceSelect(sel));
}

// Global MutationObserver to automatically catch any dynamically injected <select> tags
export function initSelectAutoEnhancer() {
  ensureOverlay();

  // Initial pass
  enhanceCustomSelects(document.body);

  // Observe DOM for newly inserted elements (e.g. in #sheet-body)
  const bodyObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // ELEMENT_NODE
            if (node.nodeName === 'SELECT' && !node.dataset.native) {
              enhanceSelect(node);
            } else if (node.querySelectorAll) {
              const innerSelects = node.querySelectorAll('select:not([data-native="true"])');
              innerSelects.forEach(s => enhanceSelect(s));
            }
          }
        });
      }
    }
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

// Attach to window for global access across the app
window.enhanceSelect = enhanceSelect;
window.enhanceCustomSelects = enhanceCustomSelects;
window.openCustomSelectPicker = openCustomSelectPicker;
window.closeCustomSelectPicker = closeCustomSelectPicker;
window.initSelectAutoEnhancer = initSelectAutoEnhancer;
