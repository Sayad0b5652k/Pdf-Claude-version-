// @ts-nocheck

export function toast(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

function sheetMotionEnabled() {
  try {
    if (document.documentElement.classList.contains('lite-motion')) return false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch (e) {}
  return true;
}

function sheetViewSig(bodyEl) {
  if (!bodyEl) return '';
  const root = bodyEl.firstElementChild;
  const h = bodyEl.querySelector('.font-display, h1, h2, h3, [data-sheet-view]');
  const hTxt = h ? (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48) : '';
  const tag = root ? `${root.id || ''}|${root.className || ''}` : '';
  const hasVoiceTabs = bodyEl.querySelector('#engine-tab-microsoft') ? '|voice' : '';
  const hasBookMenu = bodyEl.querySelector('#reader-menu-content') ? '|bookmenu' : '';
  return `${hTxt}::${tag}${hasVoiceTabs}${hasBookMenu}`;
}

export const Sheet = {
  el: null,
  backdrop: null,
  body: null,
  fade: null,
  progressContainer: null,
  progressBar: null,
  _openRaf: null,
  _openSeq: 0,
  _isOpening: false,
  _surfaceAnim: null,
  _bodyAnim: null,
  _deckEl: null,
  _deckAnim: null,
  _cancelAnims() {
    if (this._openRaf) { cancelAnimationFrame(this._openRaf); this._openRaf = null; }
    this._isOpening = false;
    if (this._surfaceAnim) { try { this._surfaceAnim.cancel(); } catch (e) {} this._surfaceAnim = null; }
    if (this._bodyAnim) { try { this._bodyAnim.cancel(); } catch (e) {} this._bodyAnim = null; }
    if (this._deckAnim) { try { this._deckAnim.cancel(); } catch (e) {} this._deckAnim = null; }
    if (this._deckEl) { try { this._deckEl.remove(); } catch (e) {} this._deckEl = null; }
  },
  init() {
    this.el = document.getElementById('sheet');
    this.backdrop = document.getElementById('sheet-backdrop');
    this.body = document.getElementById('sheet-body');
    this.fade = document.getElementById('sheet-fade-bottom');
    this.progressContainer = document.getElementById('sheet-scroll-progress');
    this.progressBar = document.getElementById('sheet-scroll-progress-bar');

    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => this.close());
    }
    if (this.body) {
      this.body.addEventListener('scroll', () => this.updateScrollIndicator(), { passive: true });
    }
    if (this.el) {
      let startY = 0;
      let startX = 0;
      let isHandleTouch = false;

      // Only listen on the top sheet-handle for downward swipe to close.
      // Touches inside the body / menus / tabs / ai results will NEVER close the sheet on scroll!
      this.el.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          startY = e.touches[0].clientY;
          startX = e.touches[0].clientX;
          const target = e.target;
          isHandleTouch = !!(target && (target.classList.contains('sheet-handle') || target.closest('.sheet-handle')));
        }
      }, { passive: true });

      this.el.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const dy = e.changedTouches[0].clientY - startY;
          const dx = Math.abs(e.changedTouches[0].clientX - startX);

          // Only close if user deliberately pulled down directly on the top handle bar
          const isPeek = this.el.classList.contains('peek');
          if (isHandleTouch && isPeek && Math.abs(dy) < 8 && dx < 8) {
            this.el.classList.toggle('expanded'); positionBottomBar(this.el);
          } else if (isHandleTouch && isPeek && dy < -40 && Math.abs(dy) > dx * 1.5) {
            this.el.classList.add('expanded'); positionBottomBar(this.el);
          } else if (isHandleTouch && dy > 60 && dy > dx * 1.5) {
            if (isPeek && this.el.classList.contains('expanded')) { this.el.classList.remove('expanded'); positionBottomBar(this.el); }
            else this.close();
          }
          isHandleTouch = false;
        }
      }, { passive: true });
    }
  },
  updateScrollIndicator() {
    if (!this.body) return;
    if (!this.fade) this.fade = document.getElementById('sheet-fade-bottom');
    if (!this.progressContainer) this.progressContainer = document.getElementById('sheet-scroll-progress');
    if (!this.progressBar) this.progressBar = document.getElementById('sheet-scroll-progress-bar');

    const { scrollTop, scrollHeight, clientHeight } = this.body;
    const isScrollable = scrollHeight > clientHeight + 12;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 12;

    if (this.fade) {
      this.fade.style.opacity = (isScrollable && !isNearBottom) ? '1' : '0';
    }
    if (this.progressContainer) {
      this.progressContainer.style.opacity = isScrollable ? '1' : '0';
    }
    if (this.progressBar && isScrollable) {
      const maxScroll = scrollHeight - clientHeight;
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      this.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  },
  open(html, options = {}){
    if (!this.body) this.init();
    if (typeof window.hideSelToolbar === 'function') {
      window.hideSelToolbar();
    }
    const seq = ++this._openSeq;
    const isAlreadyOpen = !!(this.el && this.el.classList.contains('open'));
    const prevSig = isAlreadyOpen ? sheetViewSig(this.body) : '';
    const prevH = (isAlreadyOpen && this.el) ? this.el.getBoundingClientRect().height : 0;

    // Cancel any running animations so measurements below reflect the target natural layout.
    this._cancelAnims();

    const rawPrevScroll = (isAlreadyOpen && this.body) ? this.body.scrollTop : 0;
    this.body.innerHTML = html;

    if (typeof window.enhanceCustomSelects === 'function') {
      window.enhanceCustomSelects(this.body);
    }

    const nextSig = isAlreadyOpen ? sheetViewSig(this.body) : '';
    const isSubMenuSwap = isAlreadyOpen && (
      options.animateSwap === true ||
      (options.animateSwap !== false && prevSig !== nextSig)
    );
    const shouldPreserve = options.preserveScroll !== undefined
      ? options.preserveScroll
      : (isAlreadyOpen && !options.resetScroll && !isSubMenuSwap);
    const prevScroll = shouldPreserve ? rawPrevScroll : 0;

    if (shouldPreserve && this.body && prevScroll > 0) {
      this.body.scrollTop = prevScroll;
    } else if (this.body) {
      this.body.scrollTop = 0;
    }

    // Peek mode: page stays visible and tappable (no dimming backdrop), sheet starts at ~46% height; handle toggles full height.
    const peek = options.peek === true;
    this.el.classList.toggle('peek', peek);
    if (!peek || !isAlreadyOpen) this.el.classList.remove('expanded');

    this.body.querySelectorAll('.sheet-close-btn, [data-sheet-close]').forEach(btn => {
      btn.onclick = () => this.close();
    });

    if (!isAlreadyOpen) {
      // Lay out all new content and enhanced selects once while #sheet is off-screen,
      // then start the GPU spring transform on the next clean compositor frame.
      positionBottomBar(this.el);
      this.el.classList.remove('open');
      this.backdrop.classList.remove('open');
      void this.el.offsetHeight;
      this._isOpening = true;
      this._openRaf = requestAnimationFrame(() => {
        if (seq !== this._openSeq || !this._isOpening) return;
        this._openRaf = null;
        this._isOpening = false;
        this.el.classList.add('open');
        this.backdrop.classList.toggle('open', !peek);
      });
    } else {
      positionBottomBar(this.el);
      this.backdrop.classList.toggle('open', !peek);

      if (isSubMenuSwap && sheetMotionEnabled()) {
        // Apple Stacked Deck transition: previous card surface gently tucks back in depth while
        // the new card glides smoothly up cleanly at its settled bottom-anchored height (zero height-change jhatka).
        if (prevH > 40 && this.el && typeof document.createElement === 'function' && document.body && typeof this.el.animate === 'function') {
          try {
            const deck = document.createElement('div');
            deck.className = 'sheet-deck-prev';
            deck.setAttribute('aria-hidden', 'true');
            deck.style.height = Math.round(prevH) + 'px';
            if (this.el.style.bottom) deck.style.bottom = this.el.style.bottom;
            try {
              const cs = window.getComputedStyle ? window.getComputedStyle(this.el) : null;
              if (cs && cs.backgroundColor) deck.style.backgroundColor = cs.backgroundColor;
              if (cs && cs.backgroundImage && cs.backgroundImage !== 'none') deck.style.backgroundImage = cs.backgroundImage;
              if (cs && cs.borderTopColor) deck.style.borderColor = cs.borderTopColor;
            } catch (e) {}
            document.body.appendChild(deck);
            this._deckEl = deck;
            const dAnim = deck.animate(
              [
                { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.96 },
                { transform: 'translate3d(0, -14px, 0) scale(0.95)', opacity: 0 }
              ],
              { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
            this._deckAnim = dAnim;
            const cleanDeck = () => {
              if (this._deckAnim === dAnim) this._deckAnim = null;
              if (this._deckEl === deck) this._deckEl = null;
              try { deck.remove(); } catch (e) {}
            };
            dAnim.onfinish = cleanDeck;
            dAnim.oncancel = cleanDeck;
          } catch (e) {}
        }
        if (typeof this.el.animate === 'function') {
          try {
            const sAnim = this.el.animate(
              [
                { transform: 'translate3d(0, 52px, 0)', opacity: 0.9 },
                { transform: 'translate3d(0, 0, 0)', opacity: 1 }
              ],
              { duration: 320, easing: 'cubic-bezier(0.30, 1.28, 0.48, 1)' }
            );
            this._surfaceAnim = sAnim;
            sAnim.onfinish = () => { if (this._surfaceAnim === sAnim) this._surfaceAnim = null; };
            sAnim.oncancel = () => { if (this._surfaceAnim === sAnim) this._surfaceAnim = null; };
          } catch (e) {}
        }
        if (typeof this.body.animate === 'function') {
          try {
            const bAnim = this.body.animate(
              [{ opacity: 0.35 }, { opacity: 1 }],
              { duration: 200, easing: 'ease-out' }
            );
            this._bodyAnim = bAnim;
            bAnim.onfinish = () => { if (this._bodyAnim === bAnim) this._bodyAnim = null; };
            bAnim.oncancel = () => { if (this._bodyAnim === bAnim) this._bodyAnim = null; };
          } catch (e) {}
        }
      }
    }

    requestAnimationFrame(() => {
      if (seq !== this._openSeq) return;
      if (shouldPreserve && this.body && prevScroll > 0) {
        this.body.scrollTop = prevScroll;
      }
      this.updateScrollIndicator();
      if (typeof window.renderMermaidDiagrams === 'function') {
        window.renderMermaidDiagrams(this.body);
      }
      if (typeof window.renderMathFormulas === 'function') {
        window.renderMathFormulas(this.body);
      }
    });
    setTimeout(() => {
      if (seq !== this._openSeq) return;
      if (shouldPreserve && this.body && prevScroll > 0) {
        this.body.scrollTop = prevScroll;
      }
      this.updateScrollIndicator();
      if (typeof window.renderMermaidDiagrams === 'function') {
        window.renderMermaidDiagrams(this.body);
      }
      if (typeof window.renderMathFormulas === 'function') {
        window.renderMathFormulas(this.body);
      }
    }, 120);
    setTimeout(() => {
      if (seq !== this._openSeq) return;
      this.updateScrollIndicator();
      if (typeof window.renderMermaidDiagrams === 'function') {
        window.renderMermaidDiagrams(this.body);
      }
    }, 350);
  },
  close(){
    ++this._openSeq;
    this._cancelAnims();
    if (!this.el) return;
    this.el.classList.remove('open', 'peek', 'expanded');
    if (this.backdrop) this.backdrop.classList.remove('open');
    if (window._readerSettingsTimer) {
      clearInterval(window._readerSettingsTimer);
      window._readerSettingsTimer = null;
    }
    if (window._goalSummaryTimer) {
      clearInterval(window._goalSummaryTimer);
      window._goalSummaryTimer = null;
    }
  },
  closeImmediate(){
    ++this._openSeq;
    this._cancelAnims();
    if (!this.el) this.init();
    if (this.el) {
      this.el.style.transition = 'none';
      this.el.classList.remove('open', 'peek', 'expanded');
      requestAnimationFrame(() => {
        if (this.el) this.el.style.transition = '';
      });
    }
    if (this.backdrop) {
      this.backdrop.style.transition = 'none';
      this.backdrop.classList.remove('open');
      requestAnimationFrame(() => {
        if (this.backdrop) this.backdrop.style.transition = '';
      });
    }
    if (window._readerSettingsTimer) {
      clearInterval(window._readerSettingsTimer);
      window._readerSettingsTimer = null;
    }
    if (window._goalSummaryTimer) {
      clearInterval(window._goalSummaryTimer);
      window._goalSummaryTimer = null;
    }
  }
};

export async function copyToClipboard(text){
  if(!text) return false;
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{ await navigator.clipboard.writeText(text); return true; }
    catch(err){ console.warn('navigator.clipboard failed, falling back:', err.message); }
  }
  try{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed; top:-1000px; left:-1000px; opacity:0;';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }catch(err){
    console.warn('Fallback copy failed:', err.message);
    return false;
  }
}

export function stripMarkdown(s){
  return (s||'')
    .replace(/```(?:mermaid)?[\s\S]*?```/gi, ' [📊 Diagram/Flowchart] ')
    .replace(/!\[(.*?)\]\([^)]+\)/g, ' [🖼️ Image: $1] ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\|[^\n]+\|/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function cleanRawMathAndSymbols(text) {
  if (!text) return '';
  let s = text;

  // Clean raw LaTeX environments like \begin{...} and \end{...}
  s = s.replace(/\\begin\{[a-zA-Z0-9*]+\}/g, '');
  s = s.replace(/\\end\{[a-zA-Z0-9*]+\}/g, '');

  // Clean boxed, textbf, textit, mathrm, mathbf, etc.
  s = s.replace(/\\boxed\{([^}]+)\}/g, '$1');
  s = s.replace(/\\textbf\{([^}]+)\}/g, '**$1**');
  s = s.replace(/\\textit\{([^}]+)\}/g, '*$1*');
  s = s.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  s = s.replace(/\\mathbf\{([^}]+)\}/g, '$1');

  // If KaTeX is available (or will auto-render), preserve $$ and $ math blocks intact!
  if (typeof window.katex !== 'undefined' || typeof window.renderMathInElement === 'function') {
    // Preserve math blocks for KaTeX renderer
    return s;
  }

  // Fallback cleaner for environments where KaTeX is not loaded:
  // Replace double dollar display math with clean block math
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, eq) => {
    let cleanEq = eq
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times/g, ' × ')
      .replace(/\\div/g, ' ÷ ')
      .replace(/\\pm/g, ' ± ')
      .replace(/\\neq/g, ' ≠ ')
      .replace(/\\leq/g, ' ≤ ')
      .replace(/\\geq/g, ' ≥ ')
      .replace(/\\approx/g, ' ≈ ')
      .replace(/\\cdot/g, ' · ')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\rightarrow/g, ' → ')
      .replace(/\\leftarrow/g, ' ← ')
      .replace(/\\Rightarrow/g, ' ⇒ ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\infty/g, '∞')
      .replace(/\\sum/g, '∑')
      .replace(/\\int/g, '∫')
      .replace(/\\left|\\right/g, '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `\n> 📐 **Formula / Equation**: \`${cleanEq}\`\n`;
  });

  // Replace single dollar inline math
  s = s.replace(/\$([^\$\n]+?)\$/g, (_, eq) => {
    let cleanEq = eq
      .replace(/\\text\{([^}]+)\}/g, '$1')
      .replace(/\\times/g, ' × ')
      .replace(/\\div/g, ' ÷ ')
      .replace(/\\pm/g, ' ± ')
      .replace(/\\neq/g, ' ≠ ')
      .replace(/\\leq/g, ' ≤ ')
      .replace(/\\geq/g, ' ≥ ')
      .replace(/\\approx/g, ' ≈ ')
      .replace(/\\cdot/g, ' · ')
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\rightarrow/g, ' → ')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\pi/g, 'π')
      .replace(/\\theta/g, 'θ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\left|\\right/g, '')
      .replace(/[{}]/g, '')
      .trim();
    return `\`${cleanEq}\``;
  });

  // Clean remaining lonely LaTeX artifacts
  s = s.replace(/\\text\{([^}]+)\}/g, '$1');
  s = s.replace(/\\{([a-zA-Z0-9_\s,-]+)\\}/g, '($1)');
  s = s.replace(/\\quad/g, ' ');
  s = s.replace(/\\qquad/g, '   ');
  s = s.replace(/\\,/g, ' ');

  // Clean up weird backslash-escaped characters that AI sometimes outputs like \* or \#
  s = s.replace(/\\([*#_`~[\]()])/g, '$1');

  // Collapse runaway dash repetition (e.g. LLM tokenizer loops generating walls of dashes)
  s = s.replace(/(?:^[ \t]*[-─_]{4,}[ \t]*(?:\r?\n|$)){2,}/gm, '\n---\n');
  s = s.replace(/[-─]{25,}/g, '----------');

  // Clean ASCII table borders (+----+----+)
  s = s.replace(/^[ \t]*\+[-+]+\+[ \t]*$/gm, '');

  // Fix unclosed table rows (e.g. "| Col 1 | Col 2" missing trailing "|")
  s = s.replace(/^([ \t]*\|[^\n|]+(?:\|[^\n|]*)+)[ \t]*$/gm, '$1 |');

  // Clean robotic AI disclaimers or book nagging phrases
  s = s.replace(/\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)/gi, '');
  s = s.replace(/\*+\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)\s*\*+/gi, '');
  s = s.replace(/(?:Would you like to (?:continue with|return to) your .*? textbook|Ready to (?:return to|tackle) .*?\?)\s*$/gi, '');

  return s;
}

export function renderMarkdown(raw){
  const sanitized = cleanRawMathAndSymbols(raw || '');
  const lines = sanitized.replace(/\r\n/g,'\n').split('\n');
  let html = '', listType = null, paraBuffer = [];
  let inCodeBlock = false, codeBuffer = [], codeBlockLang = '';
  let inTable = false, tableRows = [];

  const inline = (s)=>{
    // Escape HTML first to prevent XSS
    s = escapeHtml(s);

    // Triple asterisks bold-italic: ***text***
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong style="color:var(--text); font-weight:700;"><em style="color:var(--text);">$1</em></strong>');
    // Double asterisks bold: **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text); font-weight:700;">$1</strong>');
    // Single asterisk italics: *text* (word must not be space)
    s = s.replace(/(^|[^*])\*([^*\n\s][^*\n]*?[^*\n\s]|[^*\n\s])\*(?!\*)/g, '$1<em style="color:var(--text);">$2</em>');
    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, '<code style="background:var(--surface-3); padding:2px 6px; border-radius:4px; font-size:.9em; color:var(--accent); font-weight:600; font-family:var(--font-mono, monospace);">$1</code>');
    
    // Interactive Page Citation Badges [Page X], [📖 Page X], (Page X)
    s = s.replace(/\[(?:📖\s*)?Page\s+(\d+)\]|\(Page\s+(\d+)\)/gi, (match, p1, p2) => {
      const pageNum = p1 || p2;
      return `<button class="inline-page-jump-chip" data-page="${pageNum}" title="Jump to Page ${pageNum} in PDF" style="display:inline-flex; align-items:center; gap:3px; padding:2px 7px; margin:0 2px; font-size:11.5px; font-weight:700; font-family:var(--font-mono, monospace); border-radius:6px; background:var(--accent-soft); color:var(--accent); border:1px solid var(--accent); cursor:pointer; vertical-align:middle; line-height:1.2; transition:all 0.15s ease;">📖 Page ${pageNum}</button>`;
    });

    // Remove any leftover raw/unmatched asterisks and hashtags in inline text
    s = s.replace(/(^|\s)\*{1,3}(?=\s|$)/g, '$1');
    s = s.replace(/(^|\s)#{1,6}(?=\s|$)/g, '$1');

    return s;
  };

  const createVisualCardHtml = (cleanAlt, safeUrl) => {
    const escapedAlt = escapeHtml(cleanAlt || 'Educational Visual');
    const escapedSafeAltParam = (cleanAlt || 'Educational Visual').replace(/['"\\&<>]/g, ' ');
    const downloadFilename = (cleanAlt || 'visual').replace(/[^a-zA-Z0-9_-]/g, '_');
    // Percent-encode characters that could break out of the inline attribute / JS string contexts below
    const cleanUrl = (safeUrl || '').trim().replace(/['"<>\\`\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
    // Default to proxied URL for 100% reliable bypass of carrier blocks, CORS, and referer restrictions
    const initialSrc = (cleanUrl.startsWith('/api/') || cleanUrl.startsWith('data:'))
      ? cleanUrl
      : `/api/image-proxy?url=${encodeURIComponent(cleanUrl)}&subject=${encodeURIComponent(cleanAlt || '')}`;

    return `
      <div class="ai-generated-visual-card" style="margin:16px 0; border:1px solid var(--border); border-radius:14px; overflow:hidden; background:var(--surface-2); box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <div style="position:relative; width:100%; min-height:220px; max-height:460px; overflow:hidden; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.03); cursor:zoom-in;" onclick="window.openImageLightbox && window.openImageLightbox('${initialSrc}', '${escapedSafeAltParam}')" title="Click to open, zoom and pan in high-res">
          <img src="${initialSrc}" alt="${escapedAlt}" loading="eager" decoding="async" onerror="window.handleCardImageFallback && window.handleCardImageFallback(this, '${cleanUrl.replace(/'/g, "\\'")}', '${escapedSafeAltParam}')" style="max-width:100%; max-height:460px; object-fit:contain; transition:transform 0.25s ease;" />
          <div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); color:#fff; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; display:flex; align-items:center; gap:4px; pointer-events:none;">
            <span>🔍 Tap to Zoom</span>
          </div>
        </div>
        <div style="padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-top:1px solid var(--border); background:var(--surface);">
          <div style="display:flex; align-items:center; gap:6px; min-width:0;">
            <span style="font-size:14px;">🖼️</span>
            <span style="font-size:12.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapedAlt}">${escapedAlt}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <button class="btn" onclick="window.openImageLightbox && window.openImageLightbox('${initialSrc}', '${escapedSafeAltParam}')" style="height:28px; padding:0 10px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
              <span>🔍 Zoom</span>
            </button>
            <a href="${initialSrc}" download="${downloadFilename}.png" target="_blank" class="btn" style="height:28px; padding:0 10px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
              <span>⬇️ Download</span>
            </a>
          </div>
        </div>
      </div>`;
  };

  const flushPara = ()=>{
    if(paraBuffer.length){
      const text = paraBuffer.join(' ');
      // Check if paragraph contains markdown images (supports both /api/image-proxy and absolute URLs)
      const imgRegex = /!\[(.*?)\]\(((?:https?:\/\/|\/api\/|\/)[^\r\n()]+(?:\([^\r\n()]+\)[^\r\n()]*)*)\)(?=\s|$)/g;
      if (imgRegex.test(text)) {
        let lastIdx = 0;
        let m;
        imgRegex.lastIndex = 0;
        while ((m = imgRegex.exec(text)) !== null) {
          const before = text.slice(lastIdx, m.index).trim();
          if (before) {
            html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(before)}</p>`;
          }
          html += createVisualCardHtml(m[1], m[2]);
          lastIdx = m.index + m[0].length;
        }
        const after = text.slice(lastIdx).trim();
        if (after) {
          html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(after)}</p>`;
        }
      } else {
        html += `<p style="margin:0 0 10px; line-height:1.68; font-size:14px; color:var(--text);">${inline(text)}</p>`;
      }
      paraBuffer = [];
    }
  };
  const closeList = ()=>{ if(listType){ html += `</${listType}>`; listType = null; } };

  const flushTable = ()=>{
    if(inTable && tableRows.length){
      const parsedRows = [];
      let headerPassed = false;

      tableRows.forEach((row) => {
        let cleanRow = (row || '').trim();
        if(!cleanRow) return;
        // Auto-close missing trailing pipe
        if (cleanRow.startsWith('|') && !cleanRow.endsWith('|')) {
          cleanRow += ' |';
        } else if (!cleanRow.startsWith('|') && cleanRow.endsWith('|')) {
          cleanRow = '| ' + cleanRow;
        }
        const cells = cleanRow.split('|').map(c => c.trim()).filter((c, i, a) => !(i === 0 && c === '') && !(i === a.length - 1 && c === ''));
        // Check if this row is a markdown separator line like | :--- | :--- | or |---|---|
        const isSeparator = cells.length > 0 && cells.every(c => /^[:\s─-]+$/.test(c));
        if (isSeparator) {
          headerPassed = true;
          return;
        }
        if (cells.length > 0) {
          const isHeader = !headerPassed && parsedRows.length === 0;
          parsedRows.push({ isHeader, cells });
        }
      });

      if (parsedRows.length > 0) {
        let tableHtml = `<div class="table-responsive-wrapper" style="overflow-x:auto; margin:14px 0; border:1px solid var(--border); border-radius:12px; background:var(--bg-elev); box-shadow:0 2px 10px rgba(0,0,0,0.03);"><table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">`;
        parsedRows.forEach((r, idx) => {
          const isHeader = r.isHeader;
          const tag = isHeader ? 'th' : 'td';
          const cellStyle = isHeader
            ? 'background:var(--surface-2); padding:10px 14px; font-weight:700; border-bottom:2px solid var(--border); color:var(--accent); font-family:\'Space Grotesk\', sans-serif; white-space:nowrap;'
            : `padding:9.5px 14px; border-bottom:${idx === parsedRows.length - 1 ? 'none' : '1px solid var(--border)'}; color:var(--text); line-height:1.55;`;
          tableHtml += `<tr style="${isHeader ? '' : (idx % 2 === 1 ? 'background:var(--surface);' : 'background:var(--surface-2);')}">${r.cells.map(c => `<${tag} style="${cellStyle}">${inline(c)}</${tag}>`).join('')}</tr>`;
        });
        tableHtml += `</table></div>`;
        html += tableHtml;
      }
      tableRows = [];
      inTable = false;
    }
  };

  for(const rawLine of lines){
    const line = rawLine.trim();

    // Code block toggle (``` or ```ascii or ```tree or ```mermaid)
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const isMermaid = codeBlockLang === 'mermaid' || codeBuffer.some(l => /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|mindmap|timeline)\b/i.test(l.trim()));
        if (isMermaid) {
          const rawDiagram = codeBuffer.join('\n').trim();
          html += `
            <div class="mermaid-block-wrapper" style="margin:16px 0; border:1px solid var(--border); border-radius:14px; background:var(--surface-2); overflow:hidden; box-shadow:0 4px 18px rgba(0,0,0,0.06);">
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; padding:8px 12px; background:var(--surface-3, var(--surface)); border-bottom:1px solid var(--border); font-size:12px; font-weight:700; color:var(--text);">
                <span style="display:flex; align-items:center; gap:5px; color:var(--accent); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11.5px;">
                  <span>📊 Flowchart</span>
                </span>
                <div style="display:flex; align-items:center; gap:4px; flex-shrink:0; margin-left:auto;">
                  <button class="btn btn-zoom-diagram" onclick="window.openDiagramLightbox && window.openDiagramLightbox(this)" title="Open in Fullscreen &amp; Zoom" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); cursor:pointer; display:inline-flex; align-items:center; gap:3px; flex-shrink:0; white-space:nowrap;">
                    <span>🔍 Zoom</span>
                  </button>
                  <button class="btn btn-download-diagram" onclick="window.downloadDiagram && window.downloadDiagram(this)" title="Download Diagram as Image" style="height:24px; padding:0 8px; font-size:11px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); cursor:pointer; display:inline-flex; align-items:center; gap:3px; flex-shrink:0; white-space:nowrap;">
                    <span>⬇️ Save</span>
                  </button>
                  <button class="btn btn-copy-diagram" onclick="window.copyToClipboard && window.copyToClipboard(this.getAttribute('data-code'), this)" data-code="${escapeHtml(rawDiagram).replace(/"/g, '&quot;')}" style="height:24px; padding:0 7px; font-size:11px; font-weight:600; border-radius:6px; background:var(--surface-2); border:1px solid var(--border); color:var(--text-dim); cursor:pointer; flex-shrink:0; white-space:nowrap;">
                    <span>📋 Code</span>
                  </button>
                </div>
              </div>
              <div class="diagram-render-area" style="padding:16px 12px; overflow-x:auto; text-align:center; min-height:80px; background:var(--surface); display:flex; justify-content:center; align-items:center;">
                <div class="mermaid" style="display:flex; justify-content:center; width:100%; min-height:60px;">${escapeHtml(rawDiagram)}</div>
              </div>
            </div>`;
        } else {
          html += `<pre class="no-scrollbar" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:'Courier New', Consolas, monospace; font-size:12.5px; line-height:1.55; color:var(--text); overflow-x:auto; margin:12px 0; white-space:pre; scrollbar-width:none; -ms-overflow-style:none;"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
        }
        codeBuffer = [];
        inCodeBlock = false;
        codeBlockLang = '';
      } else {
        flushPara(); closeList(); flushTable();
        inCodeBlock = true;
        codeBlockLang = line.replace(/^```/, '').trim().toLowerCase();
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Horizontal Rule: ---, ***, ___, ─── (standalone 3+ chars)
    if (/^[ \t]*[-*_─]{3,}[ \t]*$/.test(line)) {
      if (inTable) {
        // If already inside a table, treat dashed lines as internal separator or table end
        continue;
      }
      flushPara(); closeList();
      html += `<hr style="margin:16px 0; border:none; border-top:1px solid var(--border); opacity:0.6;" />`;
      continue;
    }

    // Markdown Table Detection (tolerant of partial/streaming rows and separators)
    const isTableSeparator = /^[ \t]*\|?[\s:─-]+\|?$/.test(line) && line.includes('-');
    const isTableLine = (line.startsWith('|') && line.includes('|')) ||
                        (!line.startsWith('#') && !line.startsWith('>') && !line.startsWith('`') && line.includes('|') && line.split('|').length >= 3) ||
                        (inTable && isTableSeparator);

    if (isTableLine) {
      flushPara(); closeList();
      inTable = true;
      let normLine = line;
      if (normLine.startsWith('|') && !normLine.endsWith('|')) {
        normLine += ' |';
      } else if (!normLine.startsWith('|') && normLine.endsWith('|')) {
        normLine = '| ' + normLine;
      }
      tableRows.push(normLine);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if(!line){ flushPara(); closeList(); continue; }

    // Standalone Markdown Image Line: ![alt](url)
    const blockImgMatch = line.match(/^!\[(.*?)\]\(((?:https?:\/\/|\/api\/|\/|data:)[^\s)]+)\)$/);
    if (blockImgMatch) {
      flushPara(); closeList();
      html += createVisualCardHtml(blockImgMatch[1], blockImgMatch[2]);
      continue;
    }

    let m;
    if((m = line.match(/^#{1,6}\s*(.*)$/))){
      flushPara(); closeList();
      const level = line.match(/^#+/)[0].length;
      const headingContent = inline(m[1].replace(/^#{1,6}\s*/, '').trim());
      if (level === 1) {
        html += `<h3 style="margin:18px 0 10px; font-family:'Space Grotesk',sans-serif; font-weight:800; font-size:17px; color:var(--accent); border-bottom:1.5px solid var(--accent-soft); padding-bottom:6px; display:flex; align-items:center; gap:8px;">${headingContent}</h3>`;
      } else if (level === 2) {
        html += `<h4 style="margin:16px 0 8px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15.5px; color:var(--text); display:flex; align-items:center; gap:6px;">${headingContent}</h4>`;
      } else if (level === 3) {
        html += `<h5 style="margin:14px 0 6px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:14.5px; color:var(--accent); background:var(--surface-2); padding:6px 12px; border-radius:8px; border-left:3.5px solid var(--accent); display:flex; align-items:center; gap:6px;">${headingContent}</h5>`;
      } else {
        html += `<h6 style="margin:12px 0 4px; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:13.5px; color:var(--text-dim);">${headingContent}</h6>`;
      }
      continue;
    }
    if((m = line.match(/^>\s*(.*)$/))){
      flushPara(); closeList();
      html += `<blockquote style="margin:14px 0; padding:12px 16px; background:var(--accent-soft); border-left:4px solid var(--accent); border-radius:10px; font-size:13.8px; color:var(--text); line-height:1.65; box-shadow:0 1px 4px rgba(0,0,0,0.03);">${inline(m[1])}</blockquote>`;
      continue;
    }
    if((m = line.match(/^[-*•]\s+\[([ xX])\]\s+(.*)$/))){
      flushPara();
      const isChecked = m[1].toLowerCase() === 'x';
      if(listType!=='ul'){ closeList(); html += '<ul style="margin:0 0 12px; padding-left:4px; list-style:none; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ul'; }
      html += `<li style="margin-bottom:6px; display:flex; align-items:center; gap:8px;"><span style="color:${isChecked ? 'var(--teal)' : 'var(--text-dim)'}; font-weight:bold;">${isChecked ? '☑' : '☐'}</span> ${inline(m[2])}</li>`;
      continue;
    }
    if((m = line.match(/^[-*•]\s+(.*)$/))){
      flushPara();
      if(listType!=='ul'){ closeList(); html += '<ul style="margin:0 0 12px; padding-left:20px; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ul'; }
      html += `<li style="margin-bottom:6px;">${inline(m[1])}</li>`;
      continue;
    }
    if((m = line.match(/^(\d+)[.)]\s+(.*)$/))){
      flushPara();
      if(listType!=='ol'){ closeList(); html += '<ol style="margin:0 0 12px; padding-left:20px; line-height:1.68; color:var(--text); font-size:14px;">'; listType='ol'; }
      html += `<li style="margin-bottom:6px; font-weight:500;">${inline(m[2])}</li>`;
      continue;
    }
    closeList();
    paraBuffer.push(line);
  }
  if (inCodeBlock && codeBuffer.length) {
    html += `<pre class="no-scrollbar" style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 14px; font-family:'Courier New', Consolas, monospace; font-size:12.5px; line-height:1.55; color:var(--text); overflow-x:auto; margin:12px 0; white-space:pre; scrollbar-width:none; -ms-overflow-style:none;"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
  }
  flushTable();
  flushPara(); closeList();
  return html || `<p style="line-height:1.65; font-size:14px;">${inline(raw||'')}</p>`;
}

export function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
export function throttle(fn,ms){ let last=0, t; return (...a)=>{ const now=Date.now(); if(now-last>ms){ last=now; fn(...a);} else { clearTimeout(t); t=setTimeout(()=>{last=Date.now(); fn(...a);}, ms-(now-last)); } }; }

/** Only lets real CSS colours through (hex, rgb/hsl, a plain colour name or a CSS variable); anything else becomes the fallback.
 *  Colours of imported annotations end up inside style="" attributes, so a crafted value must never be able to break out of them. */
export function safeCssColor(c, fallback = '#ffd84d') {
  const s = String(c == null ? '' : c).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(?:rgb|hsl)a?\(\s*[\d.\s,%\/-]+\)$/i.test(s)) return s;
  if (/^[a-z]{3,24}$/i.test(s)) return s;
  if (/^var\(--[a-z0-9-]{1,40}\)$/i.test(s)) return s;
  return fallback;
}
window.safeCssColor = safeCssColor;

export function escapeHtml(s){
  if (s === null || s === undefined) return '';
  const str = typeof s === 'string' ? s : String(s);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const d = document.createElement('div');
    d.textContent = str;
    // innerHTML leaves quotes alone; escape them so the result is also safe inside attribute values
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/* ============================================================
   MOBILE VIEWPORT FIX
   ============================================================ */
export function positionBottomBar(el){
  if(!el) return;
  if(window.visualViewport){
    const vv = window.visualViewport;
    const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    el.style.bottom = offset + 'px';
    if(el.id === 'sheet'){
      const frac = (el.classList.contains('peek') && !el.classList.contains('expanded')) ? 0.46 : 0.84;
      el.style.maxHeight = Math.min(vv.height * frac, vv.height - 24) + 'px';
    }
  } else {
    el.style.bottom = '0px';
    if(el.id === 'sheet') el.style.maxHeight = '';
  }
}

export function keepBottomBarPositioned(el, durationMs=600){
  if(!el) return;
  const start = performance.now();
  function tick(){
    positionBottomBar(el);
    if(performance.now()-start < durationMs) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ============================================================
   READING TIME & STATS TRACKER
   ============================================================ */

function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getCurrentWeekSunday(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

let activeSessionStart = null;
let readerTicker = null;
let currentSessionSecs = 0;
let hasRecordedCurrentSession = false;

export async function getReadingStats() {
  const defaultStats = {
    totalSeconds: 0,
    sessionsCount: 0,
    totalSessionSeconds: 0,
    dailyLog: {}
  };
  // the reader saves its reading time in the background when it closes: read the stats only after that finished
  if (window._statsFlushPromise) { try { await window._statsFlushPromise; } catch (e) {} }
  const stored = await window.DB.getSetting('reading_stats', null);
  const stats = stored ? { ...defaultStats, ...stored, dailyLog: { ...(defaultStats.dailyLog), ...(stored.dailyLog||{}) } } : defaultStats;

  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const dailyLog = { ...stats.dailyLog };
  if (currentSessionSecs > 0) {
    dailyLog[todayStr] = (dailyLog[todayStr] || 0) + currentSessionSecs;
  }

  // Calculate current week (Sunday 00:00:00 to Saturday 23:59:59)
  const sunday = getCurrentWeekSunday(now);
  const weekDays = [];
  let weeklySeconds = 0;
  let activeDaysThisWeek = 0;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dStr = getLocalDateStr(d);
    const secs = dailyLog[dStr] || 0;
    const isToday = dStr === todayStr;
    const isPastOrToday = d <= now || isToday;
    
    weeklySeconds += secs;
    if (secs >= 5 && isPastOrToday) {
      activeDaysThisWeek++;
    }

    weekDays.push({
      dayName: dayNames[i],
      dateStr: dStr,
      seconds: secs,
      minutes: Math.round(secs / 60),
      isToday
    });
  }

  // Format Weekly Read Time
  let readTimeFormatted = '0m';
  if (weeklySeconds < 60) {
    readTimeFormatted = weeklySeconds > 0 ? `${weeklySeconds}s` : '0m';
  } else if (weeklySeconds < 3600) {
    readTimeFormatted = `${Math.floor(weeklySeconds / 60)}m`;
  } else {
    const hrs = Math.floor(weeklySeconds / 3600);
    const mins = Math.floor((weeklySeconds % 3600) / 60);
    readTimeFormatted = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Calculate Monthly Read Time (Spent)
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let monthlySeconds = 0;
  Object.keys(dailyLog).forEach(dStr => {
    if (dStr.startsWith(currentMonthPrefix)) {
      monthlySeconds += dailyLog[dStr] || 0;
    }
  });

  let monthlyFormatted = '0m';
  if (monthlySeconds < 60) {
    monthlyFormatted = monthlySeconds > 0 ? `${monthlySeconds}s` : '0m';
  } else if (monthlySeconds < 3600) {
    monthlyFormatted = `${Math.floor(monthlySeconds / 60)}m`;
  } else {
    const hrs = Math.floor(monthlySeconds / 3600);
    const mins = Math.floor((monthlySeconds % 3600) / 60);
    monthlyFormatted = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  // Calculate Retention (Average PDF Reading Duration per session for the current week, refreshed weekly)
  let weeklySessionsCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dStr = getLocalDateStr(d);
    const daySecs = dailyLog[dStr] || 0;
    const recordedDaySessions = (stats.dailySessions && stats.dailySessions[dStr]) || 0;
    if (recordedDaySessions > 0) {
      weeklySessionsCount += recordedDaySessions;
    } else if (daySecs >= 10) {
      // Fallback for past recorded days without explicit session counts
      weeklySessionsCount += Math.max(1, Math.round(daySecs / 600));
    }
  }

  // Include active session if reading right now in reader
  if (currentSessionSecs >= 5 && !hasRecordedCurrentSession) {
    weeklySessionsCount += 1;
  }

  let avgWeeklySecs = 0;
  if (weeklySessionsCount > 0 && weeklySeconds > 0) {
    avgWeeklySecs = Math.round(weeklySeconds / weeklySessionsCount);
  } else if (activeDaysThisWeek > 0 && weeklySeconds > 0) {
    avgWeeklySecs = Math.round(weeklySeconds / activeDaysThisWeek);
  } else {
    avgWeeklySecs = 0;
  }

  let retentionFormatted = '0m';
  if (avgWeeklySecs <= 0) {
    retentionFormatted = '0m';
  } else if (avgWeeklySecs < 60) {
    retentionFormatted = `${avgWeeklySecs}s`;
  } else if (avgWeeklySecs < 3600) {
    const m = Math.round(avgWeeklySecs / 60);
    retentionFormatted = `${m}m`;
  } else {
    const h = Math.floor(avgWeeklySecs / 3600);
    const m = Math.round((avgWeeklySecs % 3600) / 60);
    retentionFormatted = m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Weekly Streak
  let streakFormatted = `${activeDaysThisWeek}d`;

  return {
    weeklySeconds,
    monthlySeconds,
    monthlyFormatted,
    totalSeconds: stats.totalSeconds + currentSessionSecs,
    sessionsCount: weeklySessionsCount,
    readTimeFormatted,
    retentionFormatted,
    retentionPct: avgWeeklySecs,
    streakFormatted,
    streak: activeDaysThisWeek,
    weekDays
  };
}

export function startReadingSession() {
  stopReadingSession();
  if (typeof window !== 'undefined' && window.State && window.State.view !== 'reader') {
    // Only record time strictly inside PDF Reader
    return;
  }

  activeSessionStart = Date.now();
  currentSessionSecs = 0;
  hasRecordedCurrentSession = false;

  readerTicker = setInterval(() => {
    // Only tick when tab is visible and currently reading a PDF
    if (document.hidden) return;
    if (typeof window !== 'undefined' && window.State && window.State.view !== 'reader') {
      stopReadingSession();
      return;
    }
    currentSessionSecs++;
    if (currentSessionSecs > 0 && currentSessionSecs % 15 === 0) {
      flushCurrentReadingTime();
    }
  }, 1000);
}

export async function stopReadingSession() {
  if (readerTicker) {
    clearInterval(readerTicker);
    readerTicker = null;
  }
  let flushPromise = null;
  if (currentSessionSecs > 0) {
    flushPromise = flushCurrentReadingTime().finally(() => {
      if (window._statsFlushPromise === flushPromise) {
        window._statsFlushPromise = null;
      }
    });
    window._statsFlushPromise = flushPromise;
  }
  activeSessionStart = null;
  currentSessionSecs = 0;
  hasRecordedCurrentSession = false;
  if (flushPromise) {
    await flushPromise;
  }
}

async function flushCurrentReadingTime() {
  if (currentSessionSecs <= 0) return;
  const secsToAdd = currentSessionSecs;
  currentSessionSecs = 0;

  const defaultStats = {
    totalSeconds: 0,
    sessionsCount: 0,
    totalSessionSeconds: 0,
    dailyLog: {},
    dailySessions: {}
  };
  const stored = await window.DB.getSetting('reading_stats', null);
  const stats = stored ? { 
    ...defaultStats, 
    ...stored, 
    dailyLog: { ...(defaultStats.dailyLog), ...(stored.dailyLog || {}) },
    dailySessions: { ...(defaultStats.dailySessions), ...(stored.dailySessions || {}) }
  } : defaultStats;

  const today = getLocalDateStr();
  stats.totalSeconds += secsToAdd;
  stats.totalSessionSeconds += secsToAdd;
  stats.dailyLog[today] = (stats.dailyLog[today] || 0) + secsToAdd;

  if (!hasRecordedCurrentSession && (stats.dailyLog[today] >= 5 || secsToAdd >= 5)) {
    stats.sessionsCount += 1;
    stats.dailySessions[today] = (stats.dailySessions[today] || 0) + 1;
    hasRecordedCurrentSession = true;
  }

  await window.DB.setting('reading_stats', stats);
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (window.State && window.State.view === 'reader' && currentSessionSecs > 0) {
        flushCurrentReadingTime();
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    if (window.State && window.State.view === 'reader' && currentSessionSecs > 0) {
      flushCurrentReadingTime();
    }
  });
}

export function renderMermaidDiagrams(container) {
  // Most sheets/menus have no diagram: skip all Mermaid work (and its 3 MB load) unless one is present.
  const _root = container || document;
  if (!_root.querySelector || !_root.querySelector('.mermaid:not([data-processed="true"])')) return;
  if (typeof window.mermaid !== 'undefined') {
    try {
      const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') || window.State?.theme === 'dark';
      const _themeKey = isDark ? 'd' : 'l';
      if (window._mermaidThemeKey !== _themeKey) {
      window._mermaidThemeKey = _themeKey;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        themeVariables: {
          darkMode: isDark,
          primaryColor: isDark ? '#1e293b' : '#eff6ff',
          primaryTextColor: isDark ? '#f8fafc' : '#0f172a',
          primaryBorderColor: isDark ? '#3b82f6' : '#2563eb',
          lineColor: isDark ? '#60a5fa' : '#3b82f6',
          secondaryColor: isDark ? '#0f172a' : '#f8fafc',
          tertiaryColor: isDark ? '#1e1e2e' : '#ffffff',
          edgeLabelBackground: isDark ? '#1e293b' : '#ffffff',
          fontSize: '16px'
        },
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
      });
      }
      const root = container || document;
      const nodes = Array.from(root.querySelectorAll('.mermaid:not([data-processed="true"])'));
      if (nodes.length > 0) {
        window.mermaid.run({ nodes }).catch(e => {
          console.warn('Mermaid render error:', e);
        });
      }
    } catch(err) {
      console.warn('Mermaid initialization warning:', err);
    }
  } else if (typeof window.ensureLib === 'function') {
    // Mermaid is ~3 MB, so it is fetched the first time a diagram needs it.
    window.ensureLib('mermaid').then(() => {
      if (typeof window.mermaid !== 'undefined') renderMermaidDiagrams(container);
    }).catch((e) => console.warn('Mermaid could not be loaded:', e && e.message));
  }
}

export function renderMathFormulas(container) {
  if (typeof window.renderMathInElement === 'function') {
    const target = container || document.body;
    const txt = target && target.textContent ? target.textContent : '';
    if (!txt || (!txt.includes('$') && !txt.includes('\\(') && !txt.includes('\\['))) return;
    try {
      window.renderMathInElement(target, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn('KaTeX math render warning:', e);
    }
  }
}

export function openImageLightbox(src, caption, options = {}) {
  const existing = document.getElementById('ai-image-lightbox');
  if (existing) { if (typeof existing._close === 'function') existing._close(); else existing.remove(); }
  // Neutralise characters that could break out of the attribute / inline-JS contexts in the template below
  src = String(src || '').replace(/['"<>\\`\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  caption = caption ? String(caption).replace(/['"\\&<>]/g, ' ') : caption;

  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let touchStartDist = 0;
  let touchStartZoom = 1.0;

  const isSvg = options.isSvg || false;
  const svgHtml = options.svgHtml || '';

  const modal = document.createElement('div');
  modal.id = 'ai-image-lightbox';
  modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgb(5,9,14); display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:14px; user-select:none; -webkit-user-select:none; animation:fadeIn 0.18s ease;';

  const cleanCaption = caption || (isSvg ? 'Academic Flowchart' : 'Educational Visual');
  const fileName = cleanCaption.replace(/[^a-zA-Z0-9_-]/g, '_') || 'academic-visual';

  modal.innerHTML = `
    <!-- Top Control Toolbar -->
    <div style="width:100%; max-width:960px; display:flex; align-items:center; justify-content:space-between; gap:10px; z-index:20; background:rgb(20,28,38); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:8px 12px;">
      <div style="display:flex; align-items:center; gap:8px; min-width:0;">
        <span style="font-size:16px;">${isSvg ? '📊' : '🖼️'}</span>
        <span style="color:#fff; font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;">${escapeHtml(cleanCaption)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <!-- Zoom Controls -->
        <div style="display:inline-flex; align-items:center; background:rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:2px;">
          <button id="lb-zoom-out" class="btn btn-icon" title="Zoom Out (-)" style="width:28px; height:28px; color:#fff; font-size:16px; font-weight:700; border:none; background:transparent; cursor:pointer;">−</button>
          <span id="lb-zoom-level" style="color:var(--accent, #4ade80); font-size:11.5px; font-weight:700; font-family:monospace; padding:0 6px; min-width:42px; text-align:center;">100%</span>
          <button id="lb-zoom-in" class="btn btn-icon" title="Zoom In (+)" style="width:28px; height:28px; color:#fff; font-size:16px; font-weight:700; border:none; background:transparent; cursor:pointer;">+</button>
          <button id="lb-zoom-reset" class="btn" title="Reset Zoom (1:1)" style="height:24px; padding:0 8px; font-size:10.5px; font-weight:600; color:#fff; border:none; background:rgba(255,255,255,0.15); border-radius:6px; margin-left:3px; cursor:pointer;">1:1</button>
        </div>

        <!-- Download Button -->
        ${isSvg ? `
          <button id="lb-download-btn" class="btn" title="Save Flowchart Image" style="height:30px; padding:0 10px; font-size:11.5px; font-weight:600; background:var(--accent, #3b82f6); color:#fff; border-radius:8px; border:none; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
            <span>⬇️ Save</span>
          </button>
        ` : `
          <a id="lb-download-btn" href="${src}" download="${fileName}.png" target="_blank" class="btn" style="height:30px; padding:0 10px; font-size:11.5px; font-weight:600; background:var(--accent, #3b82f6); color:#fff; border-radius:8px; border:none; text-decoration:none; display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
            <span>⬇️ Save</span>
          </a>
        `}

        <!-- Close Button -->
        <button id="close-lightbox-btn" class="btn btn-icon" title="Close (Esc)" style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.18); color:#fff; border:none; cursor:pointer; font-size:13px; font-weight:700;">✕</button>
      </div>
    </div>

    <!-- Center Viewport with Hardware-Accelerated Smooth Transform -->
    <div id="lb-viewport" style="position:relative; width:100%; height:calc(100vh - 120px); overflow:hidden; display:flex; align-items:center; justify-content:center; cursor:grab; touch-action:none;">
      <div id="lb-transform-box" style="display:flex; align-items:center; justify-content:center; transform-origin:center center; transform:translate(0px,0px) scale(1);">
        ${isSvg ? `
          <div id="lb-svg-card" style="background:var(--surface, #ffffff); border:1px solid var(--border, rgba(255,255,255,0.15)); border-radius:14px; padding:22px 26px; box-shadow:0 18px 56px rgba(0,0,0,0.6); max-width:92vw; max-height:80vh; overflow:auto; display:flex; align-items:center; justify-content:center; color:var(--text, #0f172a); pointer-events:none;">
            ${svgHtml || ''}
          </div>
        ` : `
          <img id="lb-image" src="${src}" alt="${escapeHtml(cleanCaption)}" loading="eager" decoding="async" onerror="if(!this.dataset.proxied && !'${src}'.startsWith('/api/')){this.dataset.proxied='1'; this.src='/api/image-proxy?url=' + encodeURIComponent('${src}') + '&subject=' + encodeURIComponent('${cleanCaption}');}" style="max-width:90vw; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 14px 48px rgba(0,0,0,0.7); pointer-events:none;" />
        `}
      </div>
    </div>

    <!-- Bottom Zoom / Pan Tip -->
    <div style="font-size:11px; color:rgba(255,255,255,0.65); padding:5px 12px; background:rgba(0,0,0,0.5); border-radius:20px; z-index:20; pointer-events:none;">
      💡 Pinch or Scroll to Zoom • Drag to Pan • 1:1 to reset
    </div>
  `;

  document.body.appendChild(modal);

  const transformBox = modal.querySelector('#lb-transform-box');
  const zoomLevelEl = modal.querySelector('#lb-zoom-level');
  const viewport = modal.querySelector('#lb-viewport');

  const updateTransform = () => {
    if (!transformBox) return;
    transformBox.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
    }
    if (viewport) {
      viewport.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'grab';
    }
  };

  const maxZoom = () => {
    if (isSvg || /^data:image\/svg|\.svg(?:[?#]|$)/i.test(src)) return 8;
    const im = modal.querySelector('#lb-image');
    if (!im || !im.naturalWidth || !im.clientWidth) return 5;
    // beyond ~2x the real pixel density the picture only gets blurrier, so stop there
    return Math.max(2, Math.min(5, (im.naturalWidth / (im.clientWidth * (window.devicePixelRatio || 1))) * 2));
  };
  const setZoom = (newZoom, animated = true) => {
    zoom = Math.max(0.5, Math.min(maxZoom(), newZoom));
    if (zoom <= 1) {
      panX = 0;
      panY = 0;
    }
    if (transformBox) {
      transformBox.style.transition = animated ? 'transform 0.16s cubic-bezier(0.2, 0, 0, 1)' : 'none';
    }
    updateTransform();
  };

  // Zoom In / Out / Reset
  modal.querySelector('#lb-zoom-in').onclick = (e) => { e.stopPropagation(); setZoom(zoom + 0.35, true); };
  modal.querySelector('#lb-zoom-out').onclick = (e) => { e.stopPropagation(); setZoom(zoom - 0.35, true); };
  modal.querySelector('#lb-zoom-reset').onclick = (e) => { e.stopPropagation(); panX = 0; panY = 0; setZoom(1.0, true); };

  // If SVG, wire custom download button to trigger high-res export
  if (isSvg && options.triggerBtn) {
    const dlBtn = modal.querySelector('#lb-download-btn');
    if (dlBtn) {
      dlBtn.onclick = (e) => {
        e.stopPropagation();
        downloadDiagram(options.triggerBtn);
      };
    }
  }

  // Mouse Drag / Pointer Pan (Zero Lag)
  viewport.onpointerdown = (e) => {
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    if (transformBox) transformBox.style.transition = 'none';
    viewport.setPointerCapture(e.pointerId);
    viewport.style.cursor = 'grabbing';
  };

  viewport.onpointermove = (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  };

  viewport.onpointerup = (e) => {
    isDragging = false;
    try { viewport.releasePointerCapture(e.pointerId); } catch(err) {}
    viewport.style.cursor = zoom > 1 ? 'grab' : 'default';
  };

  viewport.onpointercancel = viewport.onpointerup;

  // Mouse Wheel to Zoom
  viewport.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom(zoom + delta, false);
  };

  // Touch Pinch-to-Zoom (Smooth 60fps)
  viewport.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartDist = Math.hypot(dx, dy);
      touchStartZoom = zoom;
      if (transformBox) transformBox.style.transition = 'none';
    }
  };

  viewport.ontouchmove = (e) => {
    if (e.touches.length === 2 && touchStartDist > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchStartDist;
      zoom = Math.max(0.5, Math.min(maxZoom(), touchStartZoom * factor));
      updateTransform();
    }
  };

  // Close Handlers
  const closeModal = () => {
    modal.remove();
    window.removeEventListener('keydown', handleKey);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.25, true);
    if (e.key === '-' || e.key === '_') setZoom(zoom - 0.25, true);
  };
  window.addEventListener('keydown', handleKey);
  modal._close = closeModal;

  modal.querySelector('#close-lightbox-btn').onclick = closeModal;
}

export function openDiagramLightbox(buttonEl) {
  const wrapper = buttonEl.closest('.mermaid-block-wrapper');
  if (!wrapper) return;
  const svgEl = wrapper.querySelector('.mermaid svg');
  if (!svgEl) {
    window.toast('Diagram is still rendering, please wait…');
    return;
  }

  try {
    const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark') || window.State?.theme === 'dark';
    const clone = svgEl.cloneNode(true);

    // CRITICAL: Preserve SVG id so Mermaid's embedded scoped <style> rules continue to match!
    if (svgEl.id) {
      clone.setAttribute('id', svgEl.id);
    }
    clone.style.maxWidth = '100%';
    clone.style.height = 'auto';
    clone.style.display = 'block';

    // Apply explicit high-contrast fill and border on all flowchart nodes so they never default to black
    const nodeFill = isDark ? '#1e293b' : '#eff6ff';
    const nodeStroke = isDark ? '#60a5fa' : '#2563eb';
    const textColor = isDark ? '#f8fafc' : '#0f172a';

    clone.querySelectorAll('.node rect, .node polygon, .node circle, .node path').forEach(shape => {
      shape.setAttribute('fill', nodeFill);
      shape.setAttribute('stroke', nodeStroke);
      shape.setAttribute('stroke-width', '1.5');
      shape.style.fill = nodeFill;
      shape.style.stroke = nodeStroke;
    });

    clone.querySelectorAll('.node text, .node span, .node div, .label text').forEach(txt => {
      txt.setAttribute('fill', textColor);
      txt.style.color = textColor;
      txt.style.fill = textColor;
      txt.style.fontWeight = '600';
    });

    const serializer = new XMLSerializer();
    let svgSource = serializer.serializeToString(clone);
    if (!svgSource.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgSource = svgSource.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    openImageLightbox('', 'Interactive Academic Flowchart', {
      isSvg: true,
      svgHtml: svgSource,
      triggerBtn: buttonEl
    });
  } catch (err) {
    console.warn('Failed to open diagram lightbox:', err);
    window.toast('Could not open diagram viewer.');
  }
}

export function downloadDiagram(buttonEl) {
  const wrapper = buttonEl.closest('.mermaid-block-wrapper');
  if (!wrapper) return;
  const svgEl = wrapper.querySelector('.mermaid svg');
  if (!svgEl) {
    window.toast('Diagram is still generating…');
    return;
  }

  try {
    const serializer = new XMLSerializer();
    let svgSource = serializer.serializeToString(svgEl);
    if (!svgSource.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      svgSource = svgSource.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const img = new Image();
    const svgBlob = new Blob([svgSource], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const bbox = svgEl.getBoundingClientRect();
        const scale = 2.5; // High definition export
        canvas.width = (bbox.width || 800) * scale;
        canvas.height = (bbox.height || 500) * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill background for crisp contrast
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.download = 'academic-flowchart.png';
          a.href = pngUrl;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.toast('Flowchart downloaded as HD Image! 📊');
        }
        URL.revokeObjectURL(url);
      } catch (canvasErr) {
        // Fallback: download SVG directly
        const a = document.createElement('a');
        a.download = 'academic-flowchart.svg';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.toast('Flowchart downloaded as SVG! 📊');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); window.toast('Failed to download flowchart image.'); };
    img.src = url;
  } catch (err) {
    console.warn('Download diagram error:', err);
    window.toast('Failed to download flowchart image.');
  }
}

// Bind to window for global availability
window.toast = toast;
window.Sheet = Sheet;
/**
 * Theme & appearance switch with 6 completely distinct, GPU-composited animations
 * (View Transitions API + matching overlay fallback; respects reduced motion & lite-motion).
 *   light     Morning Horizon: curved sky-rise wipe + ascending golden Sun SVG + warm horizon arc
 *   dark      Celestial Eclipse: night sky sweep from zenith + Crescent Moon SVG + Shooting Comet + diamond stars
 *   sepia     Amber Manuscript: diagonal parchment wash + descending Silk Bookmark ribbon SVG
 *   classic   Swiss Aperture: expanding 45° diamond reveal + locking architectural corner brackets & frame
 *   editorial Hardcover Spread: center spine split outward + twin gold rails & typographic rule lines
 *   notebook  Spiral Page Flip: left-binding page sweep + paper curl shadow + highlighter zip + crisp SVG study stickers
 */
window.applyLiteMotion = function applyLiteMotion(on) {
  document.documentElement.classList.toggle('lite-motion', !!on);
  try { localStorage.setItem('sayad_lite_motion', on ? '1' : '0'); } catch (e) { /* ignore */ }
};
window.themeTransition = function themeTransition(apply, originEl, kind) {
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
  const lite = document.documentElement.classList.contains('lite-motion');
  if (reduce || lite) {
    if (window.__activeThemeFx) { try { window.__activeThemeFx.clean(true); } catch (e) {} }
    apply();
    return;
  }

  if (window.__activeThemeFx) {
    try { window.__activeThemeFx.clean(true); } catch (e) { /* ignore */ }
  }

  const W = innerWidth || 360, H = innerHeight || 640;
  let x = Math.round(W / 2), y = Math.round(H / 2);
  try {
    const r = originEl && originEl.getBoundingClientRect();
    if (r && r.width) {
      x = Math.max(0, Math.min(W, Math.round(r.left + r.width / 2)));
      y = Math.max(0, Math.min(H, Math.round(r.top + r.height / 2)));
    }
  } catch (e) { /* ignore */ }
  const maxR = Math.ceil(Math.hypot(Math.max(x, W - x), Math.max(y, H - y)));
  const accent = (() => {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d9560f'; }
    catch (e) { return '#d9560f'; }
  })();

  const EASE = 'cubic-bezier(0.45, 0.05, 0.2, 1)';
  const CRISP = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  const fx = document.createElement('div');
  fx.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;contain:strict;';
  const el = (css, html) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;will-change:transform,opacity;' + css;
    if (html) d.innerHTML = html;
    fx.appendChild(d);
    return d;
  };
  const anims = [];
  const run = (node, frames, opts) => {
    const a = node.animate(frames, Object.assign({ fill: 'both' }, opts));
    anims.push(a);
    return a;
  };

  function buildSignatureOverlay(dur) {
    if (kind === 'light') {
      // Morning Horizon: luminous horizon rim rising upward + ascending Sun SVG orb
      const rim = el(`left:-20%;top:0;width:140%;height:12px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,214,102,0.92),rgba(255,180,68,0.35) 55%,transparent 80%);`);
      run(rim, [
        { transform: `translate3d(0,${H}px,0) scaleX(0.85)`, opacity: 0.95 },
        { transform: `translate3d(0,${Math.round(-H * 0.12)}px,0) scaleX(1.15)`, opacity: 0 }
      ], { duration: dur, easing: EASE });

      const sun = el(`left:${x - 28}px;top:${y - 28}px;width:56px;height:56px;`,
        `<svg viewBox="0 0 64 64" width="56" height="56" fill="none">
          <circle cx="32" cy="32" r="24" fill="rgba(255,215,105,0.22)"/>
          <circle cx="32" cy="32" r="14" fill="#FFD15C" stroke="#FFF4CC" stroke-width="2"/>
          <g stroke="#FFD15C" stroke-width="2.5" stroke-linecap="round">
            <line x1="32" y1="4" x2="32" y2="11"/><line x1="32" y1="53" x2="32" y2="60"/>
            <line x1="4" y1="32" x2="11" y2="32"/><line x1="53" y1="32" x2="60" y2="32"/>
            <line x1="12" y1="12" x2="17" y2="17"/><line x1="47" y1="47" x2="52" y2="52"/>
            <line x1="52" y1="12" x2="47" y2="17"/><line x1="17" y1="47" x2="12" y2="52"/>
          </g>
        </svg>`);
      const riseY = -Math.max(140, Math.round(y * 0.68));
      run(sun, [
        { transform: 'translate3d(0,18px,0) scale(0.45) rotate(-35deg)', opacity: 0 },
        { transform: `translate3d(0,${Math.round(riseY * 0.55)}px,0) scale(1.15) rotate(20deg)`, opacity: 1, offset: 0.42 },
        { transform: `translate3d(0,${riseY}px,0) scale(0.85) rotate(65deg)`, opacity: 0 }
      ], { duration: dur, easing: EASE });
    } else if (kind === 'dark') {
      // Celestial Eclipse: Crescent Moon SVG + diagonal Shooting Comet + crisp 4-point diamond stars
      const skyGlow = el(`left:-15%;top:0;width:130%;height:6px;background:linear-gradient(90deg,transparent,rgba(128,168,255,0.8),rgba(196,214,255,0.95),rgba(128,168,255,0.8),transparent);`);
      run(skyGlow, [
        { transform: `translate3d(0,${-20}px,0)`, opacity: 0.9 },
        { transform: `translate3d(0,${H + 30}px,0)`, opacity: 0 }
      ], { duration: dur * 0.92, easing: EASE });

      const moon = el(`right:${Math.max(22, Math.round(W * 0.1))}px;top:${Math.max(54, Math.round(H * 0.11))}px;width:54px;height:54px;`,
        `<svg viewBox="0 0 64 64" width="54" height="54" fill="none">
          <circle cx="32" cy="32" r="24" fill="rgba(130,170,255,0.16)"/>
          <path d="M40 16a18 18 0 1 0 12 31.2A14.5 14.5 0 0 1 40 16Z" fill="#DCE7FF" stroke="#9BB9FF" stroke-width="1.5"/>
        </svg>`);
      run(moon, [
        { transform: 'translate3d(18px,-26px,0) scale(0.55) rotate(-18deg)', opacity: 0 },
        { transform: 'translate3d(0,0,0) scale(1.06) rotate(4deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate3d(-6px,8px,0) scale(0.92) rotate(10deg)', opacity: 0 }
      ], { duration: dur + 60, easing: EASE });

      // Diagonal shooting comet streak across upper sky
      const comet = el(`left:-160px;top:${Math.round(H * 0.28)}px;width:150px;height:3px;border-radius:3px;background:linear-gradient(90deg,transparent 0%,rgba(140,185,255,0.4) 45%,#ffffff 100%);transform-origin:100% 50%;`);
      run(comet, [
        { transform: `translate3d(0,0,0) rotate(-22deg) scaleX(0.35)`, opacity: 0 },
        { transform: `translate3d(${Math.round(W * 0.55)}px,${Math.round(-H * 0.12)}px,0) rotate(-22deg) scaleX(1.15)`, opacity: 1, offset: 0.35 },
        { transform: `translate3d(${Math.round(W * 1.25)}px,${Math.round(-H * 0.27)}px,0) rotate(-22deg) scaleX(0.45)`, opacity: 0 }
      ], { duration: Math.round(dur * 0.85), easing: CRISP, delay: 70 });

      // Crisp 4-point diamond stars (no blurry box-shadow)
      const stars = [[0.18, 0.14, 14, 60], [0.44, 0.1, 10, 120], [0.68, 0.24, 16, 150], [0.28, 0.36, 11, 190], [0.82, 0.42, 13, 210]];
      stars.forEach(([px, py, sz, dl]) => {
        const st = el(`left:${Math.round(px * W)}px;top:${Math.round(py * H)}px;width:${sz}px;height:${sz}px;`,
          `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="#E6EEFF"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6Z"/></svg>`);
        run(st, [
          { transform: 'scale(0.1) rotate(-25deg)', opacity: 0 },
          { transform: 'scale(1.15) rotate(0deg)', opacity: 0.95, offset: 0.45 },
          { transform: 'scale(0.2) rotate(25deg)', opacity: 0 }
        ], { duration: 480, delay: dl, easing: EASE });
      });
    } else if (kind === 'sepia') {
      // Amber Manuscript: warm diagonal paper shimmer + descending Silk Bookmark Ribbon SVG
      const sheen = el(`inset:0;width:45%;background:linear-gradient(90deg,transparent,rgba(218,165,92,0.22) 55%,transparent);`);
      run(sheen, [
        { transform: `translate3d(${Math.round(-W * 0.5)}px,0,0) skewX(-14deg)`, opacity: 0.95 },
        { transform: `translate3d(${Math.round(W * 1.35)}px,0,0) skewX(-14deg)`, opacity: 0 }
      ], { duration: dur, easing: EASE });

      const ribbon = el(`right:${Math.max(20, Math.round(W * 0.08))}px;top:0;width:42px;height:132px;`,
        `<svg viewBox="0 0 42 132" width="42" height="132" fill="none">
          <path d="M4 0h34v124l-17-15-17 15V0Z" fill="#9E3B24"/>
          <path d="M8 0v114M34 0v114" stroke="#E5B976" stroke-width="1.5" stroke-dasharray="3 3"/>
        </svg>`);
      run(ribbon, [
        { transform: 'translate3d(0,-135px,0)', opacity: 0.95 },
        { transform: 'translate3d(0,8px,0)', opacity: 1, offset: 0.52 },
        { transform: 'translate3d(0,-2px,0)', opacity: 0.95, offset: 0.72 },
        { transform: 'translate3d(0,-130px,0)', opacity: 0 }
      ], { duration: dur + 120, easing: EASE });
    } else if (kind === 'classic') {
      // Swiss Aperture: center diamond wireframe + 4 precision corner brackets snapping into place
      const diamond = el(`left:50%;top:50%;width:140px;height:140px;margin:-70px 0 0 -70px;border:2px solid ${accent};`);
      const scaleTarget = (Math.hypot(W, H) / 140) * 1.15;
      run(diamond, [
        { transform: 'rotate(45deg) scale(0.08)', opacity: 0.95 },
        { transform: `rotate(45deg) scale(${scaleTarget.toFixed(2)})`, opacity: 0 }
      ], { duration: dur, easing: CRISP });

      const corners = [
        ['left:16px;top:16px;', 'M2 22V2h20', -1, -1],
        ['right:16px;top:16px;', 'M2 2h20v20', 1, -1],
        ['left:16px;bottom:16px;', 'M2 2v20h20', -1, 1],
        ['right:16px;bottom:16px;', 'M22 2v20H2', 1, 1]
      ];
      corners.forEach(([pos, pathD, sx, sy]) => {
        const br = el(`${pos}width:24px;height:24px;`,
          `<svg viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="${pathD}" stroke="${accent}" stroke-width="2.5" stroke-linecap="square"/></svg>`);
        run(br, [
          { transform: `translate3d(${-sx * 36}px,${-sy * 36}px,0) scale(0.5)`, opacity: 0 },
          { transform: 'translate3d(0,0,0) scale(1.05)', opacity: 1, offset: 0.5 },
          { transform: `translate3d(${sx * 6}px,${sy * 6}px,0) scale(0.95)`, opacity: 0 }
        ], { duration: dur, easing: CRISP });
      });
    } else if (kind === 'editorial') {
      // Hardcover Broadsheet Spread: twin champagne-gold spine rails parting from center + top/bottom hairline rules
      const leftRail = el(`left:50%;top:0;width:2px;height:100%;margin-left:-1px;background:linear-gradient(180deg,transparent,#E5C16C 20%,${accent} 50%,#E5C16C 80%,transparent);`);
      const rightRail = el(`left:50%;top:0;width:2px;height:100%;margin-left:-1px;background:linear-gradient(180deg,transparent,#E5C16C 20%,${accent} 50%,#E5C16C 80%,transparent);`);
      const halfW = Math.ceil(W * 0.54);
      run(leftRail, [
        { transform: 'translate3d(0,0,0)', opacity: 0.95 },
        { transform: `translate3d(${-halfW}px,0,0)`, opacity: 0 }
      ], { duration: dur, easing: EASE });
      run(rightRail, [
        { transform: 'translate3d(0,0,0)', opacity: 0.95 },
        { transform: `translate3d(${halfW}px,0,0)`, opacity: 0 }
      ], { duration: dur, easing: EASE });

      [14, H - 16].forEach((topY) => {
        const rule = el(`left:8%;top:${topY}px;width:84%;height:1.5px;background:linear-gradient(90deg,transparent,#D8B058,transparent);transform-origin:50% 50%;`);
        run(rule, [
          { transform: 'scaleX(0.05)', opacity: 0.95 },
          { transform: 'scaleX(1)', opacity: 0.75, offset: 0.6 },
          { transform: 'scaleX(1.08)', opacity: 0 }
        ], { duration: dur, easing: EASE });
      });
    } else if (kind === 'notebook') {
      // Spiral Page Flip: binding shadow crease + neon highlighter swipe + 4 custom SVG study stickers
      const fold = el(`left:0;top:0;width:36px;height:100%;background:linear-gradient(90deg,rgba(28,36,85,0.22),rgba(255,253,242,0.85) 55%,rgba(28,36,85,0.08) 85%,transparent);`);
      run(fold, [
        { transform: 'translate3d(-36px,0,0)', opacity: 0.95 },
        { transform: `translate3d(${W + 16}px,0,0)`, opacity: 0 }
      ], { duration: dur, easing: EASE });

      // Translucent neon chisel-highlighter swipe across center
      const hi = el(`left:10%;top:${Math.round(H * 0.44)}px;width:80%;height:26px;border-radius:4px;background:rgba(255,232,82,0.52);transform-origin:0 50%;`);
      run(hi, [
        { transform: 'skewX(-12deg) scaleX(0)', opacity: 0.95 },
        { transform: 'skewX(-12deg) scaleX(1)', opacity: 0.75, offset: 0.55 },
        { transform: 'skewX(-12deg) scaleX(1.04)', opacity: 0 }
      ], { duration: dur * 0.9, easing: CRISP, delay: 50 });

      // 4 crisp SVG study stickers popping cleanly near the tapped card
      const stickers = [
        [-64, -52, -14, `<svg viewBox="0 0 36 36" width="32" height="32" fill="none"><path d="M18 3l4.3 9.2 10.1 1.2-7.5 6.9 2 10-8.9-5-8.9 5 2-10-7.5-6.9 10.1-1.2Z" fill="#FFD43B" stroke="#1C2455" stroke-width="2.2" stroke-linejoin="round"/></svg>`],
        [68, -48, 16, `<svg viewBox="0 0 36 36" width="30" height="30" fill="none"><path d="M25 6l5 5L12 29H7v-5L25 6Z" fill="#FF70A6" stroke="#1C2455" stroke-width="2.2" stroke-linejoin="round"/><path d="M21 10l5 5" stroke="#1C2455" stroke-width="2.2"/></svg>`],
        [-58, 56, 12, `<svg viewBox="0 0 36 36" width="28" height="28" fill="none"><path d="M26 13v11a8 8 0 0 1-16 0V11a5.5 5.5 0 0 1 11 0v12a3 3 0 0 1-6 0V14" stroke="#2D5BFF" stroke-width="2.6" stroke-linecap="round"/></svg>`],
        [62, 54, -10, `<svg viewBox="0 0 36 36" width="30" height="30" fill="none"><circle cx="18" cy="18" r="14" fill="#32D296" stroke="#1C2455" stroke-width="2.2"/><path d="M11.5 18.5l4.2 4.2 8.8-9" stroke="#1C2455" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`]
      ];
      stickers.forEach(([ox, oy, rot, svg], idx) => {
        const sx = Math.min(W - 44, Math.max(44, Math.round(x + ox)));
        const sy = Math.min(H - 44, Math.max(44, Math.round(y + oy)));
        const st = el(`left:${sx - 16}px;top:${sy - 16}px;width:32px;height:32px;`, svg);
        run(st, [
          { transform: `scale(0.2) rotate(${rot - 25}deg)`, opacity: 0 },
          { transform: `scale(1.12) rotate(${rot}deg)`, opacity: 1, offset: 0.45 },
          { transform: `scale(0.85) rotate(${rot + 10}deg)`, opacity: 0 }
        ], { duration: dur + 40, delay: 40 + idx * 32, easing: SPRING });
      });
    }
  }

  let vt = null;
  let cleaned = false;
  const clean = (skipVt) => {
    if (cleaned) return;
    cleaned = true;
    if (skipVt && vt) { try { vt.skipTransition(); } catch (e) { /* ignore */ } }
    try { anims.forEach(a => a.cancel()); } catch (e) { /* ignore */ }
    fx.remove();
    if (window.__activeThemeFx && window.__activeThemeFx.clean === clean) {
      window.__activeThemeFx = null;
    }
  };
  window.__activeThemeFx = { clean };

  // Fallback when View Transitions API is unavailable: still play the signature overlay over a crisp fade
  if (typeof document.startViewTransition !== 'function') {
    const dur = 1000;
    document.body.appendChild(fx);
    const tint = kind === 'dark' ? 'rgba(10,15,24,0.28)' : kind === 'sepia' ? 'rgba(218,194,154,0.3)' : 'rgba(255,250,240,0.28)';
    const veil = el(`inset:0;background:${tint};`);
    run(veil, [{ opacity: 0.9 }, { opacity: 0 }], { duration: dur, easing: EASE });
    apply();
    buildSignatureOverlay(dur);
    setTimeout(() => clean(false), dur + 120);
    return;
  }

  try { vt = document.startViewTransition(() => { apply(); }); }
  catch (e) { apply(); clean(false); return; }

  vt.ready.then(() => {
    if (cleaned) return;
    document.body.appendChild(fx);
    const root = document.documentElement;
    let dur = 680;
    let oldFrames = { transform: ['scale(1)', 'scale(0.985)'], opacity: [1, 0.84] };
    let newFrames;
    let easing = EASE;

    if (kind === 'light') {
      dur = 680;
      oldFrames = { transform: ['translate3d(0,0,0) scale(1)', 'translate3d(0,14px,0) scale(0.985)'], opacity: [1, 0.78] };
      newFrames = { clipPath: ['ellipse(140% 0% at 50% 105%)', 'ellipse(165% 155% at 50% 105%)'] };
    } else if (kind === 'dark') {
      dur = 700;
      oldFrames = { transform: ['scale(1)', 'scale(0.975)'], opacity: [1, 0.75] };
      newFrames = { clipPath: ['ellipse(145% 0% at 50% -6%)', 'ellipse(165% 158% at 50% -6%)'] };
    } else if (kind === 'sepia') {
      dur = 680;
      newFrames = { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] };
    } else if (kind === 'classic') {
      dur = 640;
      easing = CRISP;
      newFrames = { clipPath: ['polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)', 'polygon(50% -100%, 200% 50%, 50% 200%, -100% 50%)'] };
    } else if (kind === 'editorial') {
      dur = 680;
      newFrames = { clipPath: ['inset(0 50% 0 50%)', 'inset(0 0% 0 0%)'] };
    } else if (kind === 'notebook') {
      dur = 700;
      oldFrames = { transform: ['translate3d(0,0,0) scale(1)', 'translate3d(18px,0,0) scale(0.98)'], opacity: [1, 0.8] };
      newFrames = { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] };
    } else {
      newFrames = { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] };
    }

    dur = Math.round(dur * 1.8);   // slower, so the change reads as a smooth ~1.2s sweep instead of a snap
    run(root, oldFrames, { duration: dur, easing, pseudoElement: '::view-transition-old(root)' });
    run(root, newFrames, { duration: dur, easing, pseudoElement: '::view-transition-new(root)' });
    buildSignatureOverlay(dur);
  }).catch(() => { clean(false); });

  vt.finished.then(() => clean(false), () => clean(false));
  setTimeout(() => clean(false), 2800);
};

window.Modal = Sheet; // Safety alias for modals and bottom sheets
window.copyToClipboard = copyToClipboard;
window.stripMarkdown = stripMarkdown;
window.renderMarkdown = renderMarkdown;
window.formatMarkdown = renderMarkdown; // Alias for safe markdown rendering across all views
window.renderMermaidDiagrams = renderMermaidDiagrams;
window.renderMathFormulas = renderMathFormulas;
window.openImageLightbox = openImageLightbox;
window.openDiagramLightbox = openDiagramLightbox;
window.downloadDiagram = downloadDiagram;
window.debounce = debounce;
window.throttle = throttle;
window.escapeHtml = escapeHtml;
window.positionBottomBar = positionBottomBar;
window.keepBottomBarPositioned = keepBottomBarPositioned;
window.getReadingStats = getReadingStats;
window.startReadingSession = startReadingSession;
window.stopReadingSession = stopReadingSession;

// Robust Multi-tier Fallback for Educational Visual Cards
export function handleCardImageFallback(imgEl, originalUrl, altText) {
  if (!imgEl) return;
  const step = parseInt(imgEl.dataset.fallbackStep || '0', 10);

  if (step === 0) {
    // Stage 1: If proxied URL failed, attempt direct load (if not already tried)
    imgEl.dataset.fallbackStep = '1';
    if (originalUrl && originalUrl.startsWith('http') && imgEl.src !== originalUrl) {
      imgEl.src = originalUrl;
      return;
    }
  }

  if (step <= 1) {
    // Stage 2: Fallback query via backend proxy using clean subject
    imgEl.dataset.fallbackStep = '2';
    const cleanSubject = encodeURIComponent(altText || 'educational visual');
    imgEl.src = `/api/image-proxy?subject=${cleanSubject}&fallback=1&t=${Date.now()}`;
    return;
  }

  // Stage 3: All network sources exhausted - gracefully render elegant academic SVG card
  imgEl.dataset.fallbackStep = '3';
  imgEl.style.display = 'none';
  const container = imgEl.parentElement;
  if (container && !container.querySelector('.image-fallback-badge')) {
    const fb = document.createElement('div');
    fb.className = 'image-fallback-badge';
    fb.style.cssText = 'padding:24px 16px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text);';
    fb.innerHTML = `
      <div style="font-size:36px; line-height:1;">🖼️</div>
      <div style="font-size:14px; font-weight:700; color:var(--text);">${escapeHtml(altText || 'Educational Archive')}</div>
      <div style="font-size:12px; color:var(--text-muted, #64748b);">Authentic Reference Visual</div>
      <button class="btn" onclick="const im = this.closest('.ai-generated-visual-card')?.querySelector('img'); if(im){ im.dataset.fallbackStep='0'; im.style.display='block'; im.src='/api/image-proxy?subject=${encodeURIComponent(altText)}&t=' + Date.now(); this.parentElement.remove(); }" style="margin-top:4px; height:28px; padding:0 12px; font-size:11.5px; font-weight:600; border-radius:6px; background:var(--accent-soft); border:1px solid var(--accent); color:var(--accent); cursor:pointer;">
        🔄 Reload Image
      </button>
    `;
    container.appendChild(fb);
  }
}
window.handleCardImageFallback = handleCardImageFallback;

/**
 * Universal Server-Sent Events (SSE) Stream Reader
 * Fetches stream chunks from server endpoint and yields tokens in real time.
 */
export async function fetchSSEStream(url, bodyData, onChunk) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...bodyData, stream: true })
  });

  if (!response.ok) {
    throw new Error(`SSE HTTP error ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;

      try {
        const parsed = JSON.parse(payload);
        if (parsed.chunk) {
          fullText += parsed.chunk;
          if (typeof onChunk === 'function') {
            onChunk(parsed.chunk, fullText);
          }
        }
        if (parsed.done && parsed.fullText) {
          if (parsed.fullText.length > fullText.length) {
            fullText = parsed.fullText;
          }
        }
        if (parsed.error) {
          streamError = new Error(parsed.error);
        }
      } catch (e) {
        if (e.message && e.message.includes('SSE HTTP error')) throw e;
      }
    }
  }

  if (streamError && !fullText) throw streamError;
  return fullText;
}
window.fetchSSEStream = fetchSSEStream;

/**
 * Retrieves active AI Streaming delivery mode
 * 'sse' (Word-by-word live stream) | 'typewriter' (Morphic Wave Blocks) | 'instant' (Turbo Jump)
 */
export function getStreamingMode() {
  return (window.State && window.State.streamingMode) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sayad_streaming_mode') || 'sse') : 'sse');
}
window.getStreamingMode = getStreamingMode;

/**
 * Word-By-Word Live Natural Flow Renderer
 * Reveals text word-by-word with natural human cadence, auto-scroll and blinking cursor.
 * Can be driven chunk-by-chunk in real time, or given complete text to type out.
 */
export function createWordByWordStreamer(targetEl, options = {}) {
  const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);
  const scrollContainer = options.scrollContainer || (targetEl ? targetEl.closest('.teacher-chat-log, .modal-body, body') : null);
  
  let displayedWords = [];
  let pendingWords = [];
  let isFinished = false;
  let isCancelled = false;
  let timer = null;
  let resolvePromise = null;

  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const finishImmediately = () => {
    if (isCancelled) return;
    isCancelled = true;
    if (timer) clearInterval(timer);
    // Combine all words
    const fullText = (options.fullText || (displayedWords.join('') + pendingWords.join(''))).trim();
    if (targetEl) {
      targetEl.innerHTML = renderMd(fullText);
      if (options.onFinish) options.onFinish(fullText);
    }
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    if (resolvePromise) resolvePromise(fullText);
  };

  // Click to skip
  if (targetEl) {
    targetEl.addEventListener('click', finishImmediately, { once: true });
  }

  // Ticker that dequeues words smoothly
  timer = setInterval(() => {
    if (isCancelled) {
      clearInterval(timer);
      return;
    }

    if (pendingWords.length === 0) {
      if (isFinished) {
        finishImmediately();
      }
      return;
    }

    // Dynamic pace: if many words queued, take 2-3 words so we don't lag behind
    const count = pendingWords.length > 25 ? 3 : (pendingWords.length > 10 ? 2 : 1);
    for (let i = 0; i < count && pendingWords.length > 0; i++) {
      displayedWords.push(pendingWords.shift());
    }

    if (targetEl) {
      const currentPartial = displayedWords.join('');
      targetEl.innerHTML = renderMd(currentPartial) + '<span class="ai-typing-cursor">▌</span>';
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, 22);

  return {
    pushText(chunk) {
      if (isCancelled || !chunk) return;
      // Split chunk preserving whitespace & newlines as tokens
      const tokens = chunk.match(/\S+|\s+/g) || [chunk];
      for (const t of tokens) {
        pendingWords.push(t);
      }
    },
    finish(finalFullText) {
      if (finalFullText) {
        options.fullText = finalFullText;
      }
      isFinished = true;
      return promise;
    },
    cancel() {
      finishImmediately();
    },
    promise
  };
}
window.createWordByWordStreamer = createWordByWordStreamer;

/**
 * Word-by-word typewriter for static text
 */
export function streamWordByWord(targetEl, fullMarkdown, onComplete, scrollContainer) {
  const streamer = createWordByWordStreamer(targetEl, {
    scrollContainer,
    onFinish: onComplete
  });
  streamer.pushText(fullMarkdown);
  return streamer.finish(fullMarkdown);
}
window.streamWordByWord = streamWordByWord;

/**
 * Smooth Morphic Wave Renderer (Mode 2)
 * Renders structured paragraphs and sections in an elegant animated card-wave reveal.
 */
export function streamMorphicWave(targetEl, fullMarkdown, onComplete, scrollContainer) {
  return new Promise((resolve) => {
    if (!targetEl || !fullMarkdown || fullMarkdown.length < 30) {
      if (targetEl) {
        targetEl.innerHTML = (typeof window.renderMarkdown === 'function' ? window.renderMarkdown(fullMarkdown || '') : (fullMarkdown || ''));
      }
      if (onComplete) onComplete();
      resolve();
      return;
    }

    const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);
    const scroller = scrollContainer || targetEl.closest('.teacher-chat-log, .modal-body, body');

    // Split markdown by double newlines or headers to create logical section blocks
    const rawBlocks = fullMarkdown
      .split(/(?=\n#{1,4}\s)|\n\n+/)
      .map(b => b.trim())
      .filter(b => b.length > 0);

    if (rawBlocks.length <= 1) {
      targetEl.innerHTML = renderMd(fullMarkdown);
      if (onComplete) onComplete();
      resolve();
      return;
    }

    let isDone = false;
    let blockIndex = 0;
    targetEl.innerHTML = '';

    const finish = () => {
      if (isDone) return;
      isDone = true;
      targetEl.removeEventListener('click', finish);
      targetEl.innerHTML = renderMd(fullMarkdown);
      if (onComplete) onComplete();
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      resolve();
    };

    targetEl.addEventListener('click', finish, { once: true });

    // Stagger blocks reveal
    function revealNextBlock() {
      if (isDone) return;
      if (blockIndex >= rawBlocks.length) {
        finish();
        return;
      }

      const blockText = rawBlocks[blockIndex];
      const blockEl = document.createElement('div');
      blockEl.className = 'morphic-block-fade';
      blockEl.style.marginBottom = '10px';
      blockEl.innerHTML = renderMd(blockText);
      targetEl.appendChild(blockEl);

      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }

      blockIndex++;
      const nextDelay = Math.min(180, Math.max(90, blockText.length * 0.8));
      setTimeout(revealNextBlock, nextDelay);
    }

    revealNextBlock();
  });
}
window.streamMorphicWave = streamMorphicWave;

