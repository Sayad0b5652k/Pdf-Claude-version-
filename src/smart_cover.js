// S.A.Y.A.D. Smart Aesthetic Book Cover Engine
// Generates high-resolution, crisp canvas-rendered book covers with diverse patterns, color themes, and custom typography/layout controls

export const COVER_PALETTES = [
  { id: 'cosmic', name: 'Cosmic Indigo', gradient: ['#1e1b4b', '#312e81', '#4338ca'], accent: '#a5b4fc', text: '#ffffff', sub: '#e0e7ff' },
  { id: 'emerald', name: 'Emerald Sage', gradient: ['#064e3b', '#065f46', '#047857'], accent: '#6ee7b7', text: '#ffffff', sub: '#d1fae5' },
  { id: 'amber', name: 'Sunset Amber', gradient: ['#7c2d12', '#9a3412', '#c2410c'], accent: '#fde047', text: '#ffffff', sub: '#ffedd5' },
  { id: 'burgundy', name: 'Classic Wine', gradient: ['#4c0519', '#881337', '#9f1239'], accent: '#fda4af', text: '#ffffff', sub: '#ffe4e6' },
  { id: 'obsidian', name: 'Obsidian Slate', gradient: ['#09090b', '#18181b', '#27272a'], accent: '#38bdf8', text: '#ffffff', sub: '#cbd5e1' },
  { id: 'oceanic', name: 'Oceanic Teal', gradient: ['#134e4a', '#0f766e', '#0d9488'], accent: '#5eead4', text: '#ffffff', sub: '#ccfbf1' },
  { id: 'plum', name: 'Velvet Plum', gradient: ['#3b0764', '#581c87', '#6b21a8'], accent: '#f0abfc', text: '#ffffff', sub: '#f5d0fe' },
  { id: 'sepia', name: 'Warm Sepia', gradient: ['#451a03', '#78350f', '#92400e'], accent: '#fcd34d', text: '#ffffff', sub: '#fef3c7' },
];

export const COVER_PATTERNS = [
  { id: 'minimal', name: 'Clean Minimal', icon: 'sparkle' },
  { id: 'dots', name: 'Constellation Dots', icon: 'grid' },
  { id: 'frame', name: 'Editorial Frame', icon: 'file' },
  { id: 'grid', name: 'Bauhaus Grid', icon: 'list' },
  { id: 'rings', name: 'Concentric Rings', icon: 'rotate' },
  { id: 'waves', name: 'Aesthetic Waves', icon: 'activity' },
];

/**
 * Generates a crisp, high-DPI book cover image Data URL
 */
export function generateSmartCoverDataUrl(opts = {}) {
  const {
    title = 'Untitled Book',
    subject = '',
    folder = '',
    subtitle = '',
    pageCount = 0,
    paletteId = 'cosmic',
    patternId = 'minimal',
    textSize = 'md',        // 'sm' | 'md' | 'lg' | 'xl'
    tagSize = 'md',         // 'sm' | 'md' | 'lg' | 'xl'
    subSize = 'md',         // 'sm' | 'md' | 'lg' | 'xl'
    textPosition = 'top',    // 'top' | 'center' | 'bottom'
    textAlign = 'left',      // 'left' | 'center'
    showDivider = 'auto',    // 'auto' | 'always' | 'never'
  } = opts;

  const palette = COVER_PALETTES.find(p => p.id === paletteId) || COVER_PALETTES[0];
  
  // 400x560 (1:1.4 aspect ratio for standard book covers)
  const W = 400;
  const H = 560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw Gradient Background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, palette.gradient[0]);
  grad.addColorStop(0.5, palette.gradient[1]);
  grad.addColorStop(1, palette.gradient[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 2. Draw Book Spine Accent Line (left edge subtle depth shadow)
  const spineGrad = ctx.createLinearGradient(0, 0, 24, 0);
  spineGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
  spineGrad.addColorStop(0.65, 'rgba(0,0,0,0.12)');
  spineGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spineGrad;
  ctx.fillRect(0, 0, 24, H);

  // 3. Draw Geometric Patterns
  ctx.save();
  if (patternId === 'dots') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    const spacing = 24;
    for (let x = 24; x < W - 20; x += spacing) {
      for (let y = 30; y < H - 30; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (patternId === 'frame') {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.strokeRect(28, 28, W - 56, H - 56);
    // Corner marks
    const cSize = 14;
    ctx.beginPath();
    ctx.moveTo(16, 22); ctx.lineTo(16 + cSize, 22);
    ctx.moveTo(W - 16 - cSize, 22); ctx.lineTo(W - 16, 22);
    ctx.moveTo(16, H - 22); ctx.lineTo(16 + cSize, H - 22);
    ctx.moveTo(W - 16 - cSize, H - 22); ctx.lineTo(W - 16, H - 22);
    ctx.stroke();
  } else if (patternId === 'grid') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 30; x < W; x += 38) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 30; y < H; y += 38) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  } else if (patternId === 'rings') {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 2.2;
    const cx = W / 2;
    const cy = H * 0.45;
    for (let r = 40; r <= 220; r += 32) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (patternId === 'waves') {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 2.2;
    for (let row = 0; row < 6; row++) {
      const baseY = 80 + row * 80;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const y = baseY + Math.sin((x + row * 40) * 0.03) * 16;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // 4. Subtle Inner Glow / Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // 5. Header Badge (Subject / Category / Folder) - SIGNIFICANTLY ENLARGED & HIGH CONTRAST FOR MOBILE
  const categoryTag = (subject || folder || 'STUDY EDITION').toUpperCase();
  ctx.save();
  
  let tagFontSize = 20; // Default md
  let badgeHeight = 40;
  let tagPaddingX = 26;

  if (tagSize === 'sm') {
    tagFontSize = 15;
    badgeHeight = 32;
    tagPaddingX = 20;
  } else if (tagSize === 'md') {
    tagFontSize = 20;
    badgeHeight = 40;
    tagPaddingX = 26;
  } else if (tagSize === 'lg') {
    tagFontSize = 26;
    badgeHeight = 48;
    tagPaddingX = 32;
  } else if (tagSize === 'xl') {
    tagFontSize = 32;
    badgeHeight = 56;
    tagPaddingX = 38;
  }

  ctx.font = `800 ${tagFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const tagMetrics = ctx.measureText(categoryTag);
  const badgeWidth = Math.min(W - 60, tagMetrics.width + tagPaddingX);
  
  let badgeX = 32;
  if (textAlign === 'center') {
    badgeX = (W - badgeWidth) / 2;
  }
  const badgeY = 38;

  // Solid frosted high-contrast pill backdrop
  ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  const br = badgeHeight / 2;
  ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, br) : ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.fill();

  // Subtle accent border around badge
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Badge Text with shadow
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(categoryTag, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
  ctx.restore();

  // 6. Book Title (Smart Multi-line Word Wrapping & Font Size Calculation)
  const cleanTitle = title.replace(/\.pdf$/i, '').trim() || 'Untitled Book';
  const maxTitleWidth = W - 68;
  
  let baseFontSize = 30; // Default md
  if (textSize === 'sm') baseFontSize = 23;
  else if (textSize === 'md') baseFontSize = 30;
  else if (textSize === 'lg') baseFontSize = 38;
  else if (textSize === 'xl') baseFontSize = 46;

  // Auto scale down if cleanTitle is extra long
  if (cleanTitle.length > 50 && baseFontSize > 24) baseFontSize = 24;
  else if (cleanTitle.length > 35 && baseFontSize > 30) baseFontSize = 28;

  ctx.fillStyle = palette.text;
  ctx.font = `700 ${baseFontSize}px "Playfair Display", Georgia, serif`;
  
  const words = cleanTitle.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxTitleWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Limit to max 4 lines
  const displayLines = lines.slice(0, 4);
  if (lines.length > 4) {
    displayLines[3] += '...';
  }

  const lineHeight = baseFontSize * 1.32;
  const totalTextHeight = displayLines.length * lineHeight;

  // Calculate Title Y position based on textPosition
  let titleStartY = 140;
  if (textPosition === 'top') {
    titleStartY = 135;
  } else if (textPosition === 'center') {
    titleStartY = (H - totalTextHeight) / 2 - (subtitle && subtitle.trim() ? 32 : 10);
  } else if (textPosition === 'bottom') {
    titleStartY = H - totalTextHeight - (subtitle && subtitle.trim() ? 150 : 115);
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.textBaseline = 'alphabetic';

  if (textAlign === 'center') {
    ctx.textAlign = 'center';
    displayLines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, titleStartY + idx * lineHeight);
    });
  } else {
    ctx.textAlign = 'left';
    displayLines.forEach((line, idx) => {
      ctx.fillText(line, 34, titleStartY + idx * lineHeight);
    });
  }
  ctx.restore();

  // 7. Divider & Subtitle Management
  const hasSubtitle = !!(subtitle && subtitle.trim());
  const shouldRenderDivider = showDivider === 'always' || (showDivider === 'auto' && (hasSubtitle || textAlign === 'center'));

  const dividerY = titleStartY + displayLines.length * lineHeight + 16;

  // 7A. Designer Line / Accent Element
  if (shouldRenderDivider) {
    ctx.save();
    if (textAlign === 'center') {
      const halfW = 55;
      const lineGrad = ctx.createLinearGradient(W / 2 - halfW, dividerY, W / 2 + halfW, dividerY);
      lineGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
      lineGrad.addColorStop(0.5, palette.accent);
      lineGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
      
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - halfW, dividerY);
      ctx.lineTo(W / 2 + halfW, dividerY);
      ctx.stroke();

      // Center decorative diamond
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.moveTo(W / 2, dividerY - 5);
      ctx.lineTo(W / 2 + 5, dividerY);
      ctx.lineTo(W / 2, dividerY + 5);
      ctx.lineTo(W / 2 - 5, dividerY);
      ctx.closePath();
      ctx.fill();
    } else {
      // Left aligned stylized accent bar with rounded tip
      const barLength = 90;
      const lineGrad = ctx.createLinearGradient(34, dividerY, 34 + barLength, dividerY);
      lineGrad.addColorStop(0, palette.accent);
      lineGrad.addColorStop(0.85, palette.accent);
      lineGrad.addColorStop(1, 'rgba(255,255,255,0.1)');

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(34, dividerY);
      ctx.lineTo(34 + barLength, dividerY);
      ctx.stroke();

      // Small accent spark dot
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(34 + barLength + 11, dividerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 7B. Subtitle Rendering (SIGNIFICANTLY ENLARGED & HIGH CONTRAST)
  if (hasSubtitle) {
    let subFontSize = 24; // Default md
    if (subSize === 'sm') subFontSize = 18;
    else if (subSize === 'md') subFontSize = 24;
    else if (subSize === 'lg') subFontSize = 30;
    else if (subSize === 'xl') subFontSize = 38;

    ctx.save();
    ctx.fillStyle = palette.sub;
    ctx.font = `600 ${subFontSize}px "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.textBaseline = 'top';

    const subTextY = shouldRenderDivider ? (dividerY + 18) : (dividerY + 6);

    if (textAlign === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(subtitle.trim(), W / 2, subTextY);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(subtitle.trim(), 34, subTextY);
    }
    ctx.restore();
  }

  // 8. Footer Metadata
  const footerY = H - 44;
  
  // Page count badge on left
  if (pageCount > 0) {
    ctx.fillStyle = palette.sub;
    ctx.font = '700 13px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${pageCount} PAGES`, 34, footerY);
  }

  // Publisher / App tag on right
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '700 11.5px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('S.A.Y.A.D. READER', W - 34, footerY);

  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Refreshes / regenerates the smart cover if a file record has one active (e.g. after Rename or Re-organize)
 */
export async function refreshSmartCoverIfActive(fileRecord) {
  if (!fileRecord || !fileRecord.customThumb || !fileRecord.coverTheme) return;

  const theme = fileRecord.coverTheme;
  const newThumb = generateSmartCoverDataUrl({
    title: theme.customTitle || fileRecord.name,
    subject: theme.customSubject || fileRecord.subject,
    folder: fileRecord.folder,
    subtitle: theme.customSubtitle || '',
    pageCount: fileRecord.pageCount || 0,
    paletteId: theme.paletteId || 'cosmic',
    patternId: theme.patternId || 'minimal',
    textSize: theme.textSize || 'md',
    tagSize: theme.tagSize || 'md',
    subSize: theme.subSize || 'md',
    textPosition: theme.textPosition || 'top',
    textAlign: theme.textAlign || 'left',
    showDivider: theme.showDivider || 'auto',
  });

  fileRecord.customThumb = newThumb;
  fileRecord.thumb = newThumb;
  if (window.DB && typeof window.DB.updateFileMeta === 'function') {
    await window.DB.updateFileMeta(fileRecord.id, {
      thumb: newThumb,
      customThumb: newThumb,
      coverTheme: fileRecord.coverTheme,
    });
  }
}

/**
 * Opens the interactive Smart Cover Customizer Sheet with full live text, size, placement, and designer controls
 */
export function openCoverCustomizer(fileId) {
  const f = window.State?.files?.find(x => x.id === fileId);
  if (!f) return;

  // Preserve original page 1 thumbnail if not saved yet
  if (!f.originalThumb && f.thumb) {
    f.originalThumb = f.thumb;
  }

  let curPaletteId = f.coverTheme?.paletteId || 'cosmic';
  let curPatternId = f.coverTheme?.patternId || 'minimal';
  let curTextSize = f.coverTheme?.textSize || 'md';
  let curTagSize = f.coverTheme?.tagSize || 'md';
  let curSubSize = f.coverTheme?.subSize || 'md';
  let curTextPosition = f.coverTheme?.textPosition || 'top';
  let curTextAlign = f.coverTheme?.textAlign || 'left';
  let curShowDivider = f.coverTheme?.showDivider || 'auto';
  
  let curTitle = f.coverTheme?.customTitle || f.name.replace(/\.pdf$/i, '');
  let curSubject = f.coverTheme?.customSubject || f.subject || f.folder || 'Study Edition';
  let curSubtitle = f.coverTheme?.customSubtitle || '';

  const hasCustomCover = !!f.customThumb;

  const renderModalContent = () => {
    const previewDataUrl = generateSmartCoverDataUrl({
      title: curTitle,
      subject: curSubject,
      folder: f.folder,
      subtitle: curSubtitle,
      pageCount: f.pageCount || 0,
      paletteId: curPaletteId,
      patternId: curPatternId,
      textSize: curTextSize,
      tagSize: curTagSize,
      subSize: curSubSize,
      textPosition: curTextPosition,
      textAlign: curTextAlign,
      showDivider: curShowDivider,
    });

    window.Sheet.open(`
      <div class="no-scrollbar" style="padding: 2px 0 12px; scrollbar-width: none; -ms-overflow-style: none;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
            ${window.icon('sparkle','icon icon-sm')} <span>Aesthetic Book Cover</span>
          </div>
          ${hasCustomCover ? `
            <button class="btn btn-ghost" id="cover-reset-btn" style="font-size:12px; color:var(--accent); padding:4px 8px; font-weight:600;">
              Reset to Original (Page 1)
            </button>
          ` : ''}
        </div>

        <!-- Live Cover Preview Box -->
        <div style="display:flex; justify-content:center; margin-bottom:16px;">
          <div style="width:140px; height:196px; border-radius:8px; overflow:hidden; box-shadow: 0 12px 28px -5px rgba(0,0,0,0.4), 0 4px 8px -2px rgba(0,0,0,0.2); border: 1px solid var(--border); background:var(--surface-2); position:relative;">
            <img id="cover-live-img" src="${previewDataUrl}" style="width:100%; height:100%; object-fit:cover; display:block;">
          </div>
        </div>

        <!-- Section 1: Color Themes -->
        <div style="margin-bottom:14px;">
          <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>Color Theme</span>
            <span id="palette-name-label" style="font-weight:600; color:var(--accent);">${COVER_PALETTES.find(p => p.id === curPaletteId)?.name || ''}</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:7px;">
            ${COVER_PALETTES.map(pal => `
              <button class="btn palette-select-btn" data-pal="${pal.id}" style="height:34px; border-radius:8px; background: linear-gradient(135deg, ${pal.gradient[0]}, ${pal.gradient[2]}); border: 2px solid ${curPaletteId === pal.id ? 'var(--accent)' : 'transparent'}; box-shadow: ${curPaletteId === pal.id ? '0 0 0 2px var(--accent-soft)' : 'none'}; cursor:pointer; position:relative; display:flex; align-items:center; justify-content:center;">
                ${curPaletteId === pal.id ? `<span style="width:6px; height:6px; border-radius:50%; background:#fff;"></span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Section 2: Geometric Patterns -->
        <div style="margin-bottom:14px;">
          <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:6px;">
            <span>Pattern Style</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            ${COVER_PATTERNS.map(pat => `
              <button class="btn pattern-select-btn" data-pat="${pat.id}" style="padding:6px 8px; border-radius:8px; font-size:11px; font-weight:600; background:${curPatternId === pat.id ? 'var(--accent)' : 'var(--surface-2)'}; color:${curPatternId === pat.id ? '#ffffff' : 'var(--text)'}; border:1px solid ${curPatternId === pat.id ? 'var(--accent)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; gap:4px;">
                ${window.icon(pat.icon, 'icon icon-xs')} ${pat.name.split(' ')[1] || pat.name}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Section 3: Editable Text Fields -->
        <div style="margin-bottom:14px; background:var(--surface-2); padding:12px; border-radius:10px; border:1px solid var(--border);">
          <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:8px;">
            <span>Cover Text & Details</span>
          </div>
          <div style="margin-bottom:8px;">
            <label style="font-size:11px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:3px;">Book Title on Cover</label>
            <input id="cover-title-input" value="${window.escapeHtml(curTitle)}" placeholder="Book Title" style="width:100%; padding:8px 10px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--surface);">
          </div>
          <div style="display:flex; gap:8px;">
            <div style="flex:1;">
              <label style="font-size:11px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:3px;">Category / Tag (Top Badge)</label>
              <input id="cover-subject-input" value="${window.escapeHtml(curSubject)}" placeholder="e.g. ENGLISH / NOTES" style="width:100%; padding:8px 10px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--surface);">
            </div>
            <div style="flex:1;">
              <label style="font-size:11px; font-weight:600; color:var(--text-dim); display:block; margin-bottom:3px;">Subtitle</label>
              <input id="cover-sub-input" value="${window.escapeHtml(curSubtitle)}" placeholder="e.g. Part 1 / Exam Edition" style="width:100%; padding:8px 10px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--surface);">
            </div>
          </div>
        </div>

        <!-- Section 4: Typography Sizes (Title, Category, Subtitle) -->
        <div style="margin-bottom:14px; background:var(--surface-2); padding:12px; border-radius:10px; border:1px solid var(--border);">
          <div style="font-size:12px; font-weight:700; color:var(--text); margin-bottom:10px;">
            <span>Font Size Controls</span>
          </div>

          <!-- Title Size -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:11.5px; font-weight:600; color:var(--text-dim);">Title Size</span>
            <div style="display:flex; gap:4px;">
              ${['sm', 'md', 'lg', 'xl'].map(sz => `
                <button class="btn text-size-btn" data-sz="${sz}" style="padding:3px 8px; font-size:10.5px; font-weight:700; border-radius:6px; background:${curTextSize === sz ? 'var(--accent)' : 'var(--surface)'}; color:${curTextSize === sz ? '#fff' : 'var(--text)'}; border:1px solid ${curTextSize === sz ? 'var(--accent)' : 'var(--border)'};">
                  ${sz.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Category Tag Size -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:11.5px; font-weight:600; color:var(--text-dim);">Category Tag Size</span>
            <div style="display:flex; gap:4px;">
              ${['sm', 'md', 'lg', 'xl'].map(sz => `
                <button class="btn tag-size-btn" data-tagsz="${sz}" style="padding:3px 8px; font-size:10.5px; font-weight:700; border-radius:6px; background:${curTagSize === sz ? 'var(--accent)' : 'var(--surface)'}; color:${curTagSize === sz ? '#fff' : 'var(--text)'}; border:1px solid ${curTagSize === sz ? 'var(--accent)' : 'var(--border)'};">
                  ${sz.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Subtitle Size -->
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:11.5px; font-weight:600; color:var(--text-dim);">Subtitle Size</span>
            <div style="display:flex; gap:4px;">
              ${['sm', 'md', 'lg', 'xl'].map(sz => `
                <button class="btn sub-size-btn" data-subsz="${sz}" style="padding:3px 8px; font-size:10.5px; font-weight:700; border-radius:6px; background:${curSubSize === sz ? 'var(--accent)' : 'var(--surface)'}; color:${curSubSize === sz ? '#fff' : 'var(--text)'}; border:1px solid ${curSubSize === sz ? 'var(--accent)' : 'var(--border)'};">
                  ${sz.toUpperCase()}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Section 5: Placement, Alignment & Divider -->
        <div style="margin-bottom:18px; background:var(--surface-2); padding:12px; border-radius:10px; border:1px solid var(--border);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <span style="font-size:12px; font-weight:700; color:var(--text);">Placement</span>
            <div style="display:flex; gap:4px;">
              ${[
                { id: 'top', label: 'Top' },
                { id: 'center', label: 'Center' },
                { id: 'bottom', label: 'Bottom' }
              ].map(pos => `
                <button class="btn text-pos-btn" data-pos="${pos.id}" style="padding:4px 9px; font-size:11px; font-weight:600; border-radius:6px; background:${curTextPosition === pos.id ? 'var(--accent)' : 'var(--surface)'}; color:${curTextPosition === pos.id ? '#fff' : 'var(--text)'}; border:1px solid ${curTextPosition === pos.id ? 'var(--accent)' : 'var(--border)'};">
                  ${pos.label}
                </button>
              `).join('')}
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <span style="font-size:12px; font-weight:700; color:var(--text);">Alignment</span>
            <div style="display:flex; gap:4px;">
              <button class="btn text-align-btn" data-align="left" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; background:${curTextAlign === 'left' ? 'var(--accent)' : 'var(--surface)'}; color:${curTextAlign === 'left' ? '#fff' : 'var(--text)'}; border:1px solid ${curTextAlign === 'left' ? 'var(--accent)' : 'var(--border)'};">
                Left
              </button>
              <button class="btn text-align-btn" data-align="center" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; background:${curTextAlign === 'center' ? 'var(--accent)' : 'var(--surface)'}; color:${curTextAlign === 'center' ? '#fff' : 'var(--text)'}; border:1px solid ${curTextAlign === 'center' ? 'var(--accent)' : 'var(--border)'};">
                Center
              </button>
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:12px; font-weight:700; color:var(--text);">Designer Divider</span>
            <div style="display:flex; gap:4px;">
              ${[
                { id: 'auto', label: 'Auto' },
                { id: 'always', label: 'Show' },
                { id: 'never', label: 'Hide' }
              ].map(divOpt => `
                <button class="btn divider-opt-btn" data-div="${divOpt.id}" style="padding:4px 9px; font-size:11px; font-weight:600; border-radius:6px; background:${curShowDivider === divOpt.id ? 'var(--accent)' : 'var(--surface)'}; color:${curShowDivider === divOpt.id ? '#fff' : 'var(--text)'}; border:1px solid ${curShowDivider === divOpt.id ? 'var(--accent)' : 'var(--border)'};">
                  ${divOpt.label}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Save Action -->
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" id="cover-cancel-btn" style="flex:1; padding:12px; font-weight:600;">
            Cancel
          </button>
          <button class="btn btn-primary" id="cover-apply-btn" style="flex:2; padding:12px; font-weight:700; background:var(--accent); color:#ffffff; border-radius:10px;">
            Apply Smart Cover
          </button>
        </div>
      </div>
    `);

    // Event Bindings
    const liveImg = document.getElementById('cover-live-img');
    const palNameLabel = document.getElementById('palette-name-label');
    const titleInput = document.getElementById('cover-title-input');
    const subjectInput = document.getElementById('cover-subject-input');
    const subInput = document.getElementById('cover-sub-input');

    const updateLivePreview = () => {
      curTitle = titleInput ? titleInput.value : curTitle;
      curSubject = subjectInput ? subjectInput.value : curSubject;
      curSubtitle = subInput ? subInput.value : curSubtitle;

      const url = generateSmartCoverDataUrl({
        title: curTitle,
        subject: curSubject,
        folder: f.folder,
        subtitle: curSubtitle,
        pageCount: f.pageCount || 0,
        paletteId: curPaletteId,
        patternId: curPatternId,
        textSize: curTextSize,
        tagSize: curTagSize,
        subSize: curSubSize,
        textPosition: curTextPosition,
        textAlign: curTextAlign,
        showDivider: curShowDivider,
      });
      if (liveImg) liveImg.src = url;
      if (palNameLabel) {
        palNameLabel.textContent = COVER_PALETTES.find(p => p.id === curPaletteId)?.name || '';
      }
    };

    if (titleInput) titleInput.oninput = updateLivePreview;
    if (subjectInput) subjectInput.oninput = updateLivePreview;
    if (subInput) subInput.oninput = updateLivePreview;

    document.querySelectorAll('.palette-select-btn').forEach(btn => {
      btn.onclick = () => {
        curPaletteId = btn.dataset.pal;
        document.querySelectorAll('.palette-select-btn').forEach(b => {
          const active = b.dataset.pal === curPaletteId;
          b.style.borderColor = active ? 'var(--accent)' : 'transparent';
          b.style.boxShadow = active ? '0 0 0 2px var(--accent-soft)' : 'none';
          b.innerHTML = active ? `<span style="width:6px; height:6px; border-radius:50%; background:#fff;"></span>` : '';
        });
        updateLivePreview();
      };
    });

    document.querySelectorAll('.pattern-select-btn').forEach(btn => {
      btn.onclick = () => {
        curPatternId = btn.dataset.pat;
        document.querySelectorAll('.pattern-select-btn').forEach(b => {
          const active = b.dataset.pat === curPatternId;
          b.style.background = active ? 'var(--accent)' : 'var(--surface-2)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    // Title Size Buttons
    document.querySelectorAll('.text-size-btn').forEach(btn => {
      btn.onclick = () => {
        curTextSize = btn.dataset.sz;
        document.querySelectorAll('.text-size-btn').forEach(b => {
          const active = b.dataset.sz === curTextSize;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    // Category Tag Size Buttons
    document.querySelectorAll('.tag-size-btn').forEach(btn => {
      btn.onclick = () => {
        curTagSize = btn.dataset.tagsz;
        document.querySelectorAll('.tag-size-btn').forEach(b => {
          const active = b.dataset.tagsz === curTagSize;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    // Subtitle Size Buttons
    document.querySelectorAll('.sub-size-btn').forEach(btn => {
      btn.onclick = () => {
        curSubSize = btn.dataset.subsz;
        document.querySelectorAll('.sub-size-btn').forEach(b => {
          const active = b.dataset.subsz === curSubSize;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    document.querySelectorAll('.text-pos-btn').forEach(btn => {
      btn.onclick = () => {
        curTextPosition = btn.dataset.pos;
        document.querySelectorAll('.text-pos-btn').forEach(b => {
          const active = b.dataset.pos === curTextPosition;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    document.querySelectorAll('.text-align-btn').forEach(btn => {
      btn.onclick = () => {
        curTextAlign = btn.dataset.align;
        document.querySelectorAll('.text-align-btn').forEach(b => {
          const active = b.dataset.align === curTextAlign;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    document.querySelectorAll('.divider-opt-btn').forEach(btn => {
      btn.onclick = () => {
        curShowDivider = btn.dataset.div;
        document.querySelectorAll('.divider-opt-btn').forEach(b => {
          const active = b.dataset.div === curShowDivider;
          b.style.background = active ? 'var(--accent)' : 'var(--surface)';
          b.style.color = active ? '#ffffff' : 'var(--text)';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        });
        updateLivePreview();
      };
    });

    const resetBtn = document.getElementById('cover-reset-btn');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        f.thumb = f.originalThumb || f.thumb;
        f.customThumb = undefined;
        f.coverTheme = undefined;
        await window.DB.updateFileMeta(f.id, {
          thumb: f.thumb,
          customThumb: undefined,
          coverTheme: undefined,
          originalThumb: f.originalThumb,
        });
        window.Sheet.close();
        window.toast('Reset to original PDF cover (Page 1)');
        if (typeof window.updateBookCardDOM === 'function') {
          window.updateBookCardDOM(f.id);
        } else if (typeof window.renderDashboard === 'function') {
          window.renderDashboard(true);
        }
      };
    }

    const cancelBtn = document.getElementById('cover-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = () => window.Sheet.close();

    const applyBtn = document.getElementById('cover-apply-btn');
    if (applyBtn) {
      applyBtn.onclick = async () => {
        curTitle = titleInput ? titleInput.value.trim() || f.name : curTitle;
        curSubject = subjectInput ? subjectInput.value.trim() : curSubject;
        curSubtitle = subInput ? subInput.value.trim() : curSubtitle;

        const customDataUrl = generateSmartCoverDataUrl({
          title: curTitle,
          subject: curSubject,
          folder: f.folder,
          subtitle: curSubtitle,
          pageCount: f.pageCount || 0,
          paletteId: curPaletteId,
          patternId: curPatternId,
          textSize: curTextSize,
          tagSize: curTagSize,
          subSize: curSubSize,
          textPosition: curTextPosition,
          textAlign: curTextAlign,
          showDivider: curShowDivider,
        });

        f.customThumb = customDataUrl;
        f.thumb = customDataUrl;
        f.coverTheme = {
          paletteId: curPaletteId,
          patternId: curPatternId,
          textSize: curTextSize,
          tagSize: curTagSize,
          subSize: curSubSize,
          textPosition: curTextPosition,
          textAlign: curTextAlign,
          showDivider: curShowDivider,
          customTitle: curTitle,
          customSubject: curSubject,
          customSubtitle: curSubtitle,
        };

        await window.DB.updateFileMeta(f.id, {
          thumb: f.thumb,
          customThumb: f.customThumb,
          originalThumb: f.originalThumb,
          coverTheme: f.coverTheme,
        });

        window.Sheet.close();
        window.toast('Aesthetic cover applied!');
        if (typeof window.updateBookCardDOM === 'function') {
          window.updateBookCardDOM(f.id);
        } else if (typeof window.renderDashboard === 'function') {
          window.renderDashboard(true);
        }
      };
    }
  };

  renderModalContent();
}

if (typeof window !== 'undefined') {
  window.generateSmartCoverDataUrl = generateSmartCoverDataUrl;
  window.refreshSmartCoverIfActive = refreshSmartCoverIfActive;
  window.openCoverCustomizer = openCoverCustomizer;
}
