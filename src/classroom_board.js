// @ts-nocheck
import rough from 'roughjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOGICAL_W = 1000;
const LOGICAL_H = 620;

const PALETTES = {
  chalkboard: {
    bg: '#13231D',
    bgEdge: '#0B1511',
    grid: 'rgba(244, 241, 234, 0.08)',
    border: 'rgba(244, 241, 234, 0.16)',
    cream: '#F5F1E8',
    amber: '#FFB469',
    teal: '#5BE0D5',
    coral: '#FF849D',
    mint: '#88F2A9',
    muted: 'rgba(232, 238, 235, 0.72)',
    fillAmber: 'rgba(255, 180, 105, 0.16)',
    fillTeal: 'rgba(91, 224, 213, 0.16)',
    fillCoral: 'rgba(255, 132, 157, 0.16)',
    fillMint: 'rgba(136, 242, 169, 0.16)',
    fillNeutral: 'rgba(255, 255, 255, 0.06)',
    labelBg: '#12221C',
  },
  whiteboard: {
    bg: '#FDFBF6',
    bgEdge: '#F3EFE4',
    grid: 'rgba(25, 33, 42, 0.09)',
    border: 'rgba(25, 33, 42, 0.13)',
    cream: '#1A222B',
    amber: '#D9540E',
    teal: '#0E7B73',
    coral: '#C62E54',
    mint: '#1E6F43',
    muted: 'rgba(26, 34, 43, 0.66)',
    fillAmber: 'rgba(217, 84, 14, 0.13)',
    fillTeal: 'rgba(14, 123, 115, 0.13)',
    fillCoral: 'rgba(198, 46, 84, 0.12)',
    fillMint: 'rgba(30, 111, 67, 0.13)',
    fillNeutral: 'rgba(26, 34, 43, 0.05)',
    labelBg: '#FDFBF6',
  },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function hashSeed(str) {
  let h = 131;
  const s = String(str || 'sayad');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 900) + 1;
}

function getStrokeColor(pal, key) {
  if (!key) return pal.cream;
  if (key.startsWith('#') || key.startsWith('rgb')) return key;
  return pal[key] || pal.cream;
}

function getHachureFill(pal, key) {
  if (key === 'amber') return pal.fillAmber;
  if (key === 'teal') return pal.fillTeal;
  if (key === 'coral') return pal.fillCoral;
  if (key === 'mint') return pal.fillMint;
  return pal.fillNeutral;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  return el;
}

function wrapWords(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const nxt = cur ? `${cur} ${w}` : w;
    if (nxt.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = nxt;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function createTextBlock(text, cx, cy, opts = {}) {
  const {
    fontSize = 18,
    fill = '#1A222B',
    fontFamily = '"IBM Plex Sans", "Baloo 2", sans-serif',
    fontWeight = '700',
    anchor = 'middle',
    maxChars = 24,
    maxLines = 2,
    lineHeight = 1.22,
  } = opts;
  const lines = wrapWords(text, maxChars).slice(0, maxLines);
  const g = svgEl('g');
  const stepY = fontSize * lineHeight;
  const startY = cy - ((lines.length - 1) * stepY) / 2;
  lines.forEach((ln, idx) => {
    const t = svgEl('text', {
      x: cx,
      y: startY + idx * stepY,
      'text-anchor': anchor,
      'dominant-baseline': 'central',
      'font-size': fontSize,
      'font-family': fontFamily,
      'font-weight': fontWeight,
      fill,
    });
    t.textContent = ln;
    g.appendChild(t);
  });
  return g;
}

/**
 * 25 RoughJS Educational Vector Icons rendered inside normalized (cx, cy, size) box.
 */
function buildVectorIcon(rc, name, cx, cy, size, col, ink, seed) {
  const key = String(name || '').toLowerCase().trim();
  const s = size / 100;
  const ox = cx - size / 2;
  const oy = cy - size / 2;
  const o = (fill) => ({
    stroke: col || ink,
    strokeWidth: 2.1,
    roughness: 1.15,
    bowing: 1.1,
    seed,
    ...(fill ? { fill, fillStyle: 'hachure', hachureGap: 4.5, fillWeight: 1.1 } : {}),
  });

  const P = (pts, f) => rc.polygon(pts.map(([x, y]) => [ox + x * s, oy + y * s]), o(f));
  const L = (x1, y1, x2, y2) => rc.line(ox + x1 * s, oy + y1 * s, ox + x2 * s, oy + y2 * s, o());
  const R = (x, y, w, h, f) => rc.rectangle(ox + x * s, oy + y * s, w * s, h * s, o(f));
  const C = (x, y, d, f) => rc.circle(ox + x * s, oy + y * s, d * s, o(f));

  const soft = `${col}33`;
  const shapes = {
    sun: () => [C(50, 50, 42, soft), L(50, 6, 50, 18), L(50, 82, 50, 94), L(6, 50, 18, 50), L(82, 50, 94, 50), L(18, 18, 28, 28), L(72, 72, 82, 82), L(82, 18, 72, 28), L(18, 82, 28, 72)],
    leaf: () => [P([[20, 78], [26, 36], [56, 16], [84, 22], [74, 58], [46, 78]], soft), L(16, 84, 68, 32), L(44, 56, 62, 52), L(52, 46, 50, 30)],
    chloroplast: () => [C(50, 50, 76, soft), R(24, 34, 20, 10, soft), R(24, 48, 20, 10, soft), R(56, 38, 20, 10, soft), R(56, 52, 20, 10, soft), L(44, 46, 56, 46)],
    water: () => [P([[50, 10], [78, 56], [74, 78], [50, 90], [26, 78], [22, 56]], soft), L(38, 60, 46, 72)],
    atom: () => [C(50, 50, 18, soft), rc.ellipse(cx, cy, size * 0.85, size * 0.34, o()), rc.ellipse(cx, cy, size * 0.34, size * 0.85, o())],
    dna: () => [L(28, 12, 72, 34), L(72, 12, 28, 34), L(28, 38, 72, 62), L(72, 38, 28, 62), L(28, 66, 72, 88), L(72, 66, 28, 88), L(34, 24, 66, 24), L(34, 50, 66, 50), L(34, 76, 66, 76)],
    cell: () => [C(50, 50, 76, soft), C(48, 48, 26, soft), C(72, 34, 10)],
    heart: () => [P([[50, 86], [16, 52], [20, 26], [38, 20], [50, 34], [62, 20], [80, 26], [84, 52]], soft)],
    brain: () => [C(38, 46, 44, soft), C(62, 46, 44, soft), L(50, 22, 50, 72), L(28, 44, 42, 40), L(58, 40, 72, 46)],
    bulb: () => [C(50, 38, 48, soft), R(38, 64, 24, 14, soft), L(42, 86, 58, 86), L(50, 2, 50, 10)],
    book: () => [R(14, 22, 72, 58, soft), L(50, 22, 50, 80), L(22, 38, 42, 38), L(22, 52, 42, 52), L(58, 38, 78, 38), L(58, 52, 78, 52)],
    crown: () => [P([[14, 72], [10, 30], [34, 50], [50, 18], [66, 50], [90, 30], [86, 72]], soft), R(14, 72, 72, 12, soft)],
    castle: () => [R(16, 42, 68, 44, soft), R(8, 24, 22, 62, soft), R(70, 24, 22, 62, soft), R(42, 60, 16, 26), L(19, 24, 19, 10), L(81, 24, 81, 10)],
    scroll: () => [R(22, 20, 56, 60, soft), C(22, 20, 14), C(78, 80, 14), L(32, 38, 68, 38), L(32, 50, 68, 50), L(32, 62, 58, 62)],
    mountain: () => [P([[6, 86], [36, 28], [56, 62], [72, 38], [94, 86]], soft)],
    ship: () => [P([[10, 66], [90, 66], [76, 86], [24, 86]], soft), L(50, 66, 50, 14), P([[54, 18], [54, 60], [86, 60]], soft)],
    people: () => [C(34, 28, 24, soft), P([[16, 88], [34, 52], [52, 88]], soft), C(68, 38, 20, soft), P([[54, 88], [68, 58], [84, 88]], soft)],
    flag: () => [L(26, 8, 26, 92), P([[26, 12], [86, 28], [26, 48]], soft)],
    fire: () => [P([[50, 8], [74, 42], [82, 66], [50, 92], [18, 66], [28, 42]], soft), P([[50, 46], [62, 66], [50, 84], [38, 66]])],
    coin: () => [C(50, 50, 66, soft), C(50, 50, 44), L(50, 32, 50, 68), L(40, 42, 60, 42)],
    map: () => [P([[12, 24], [38, 16], [62, 28], [88, 18], [88, 78], [62, 88], [38, 76], [12, 84]], soft), L(34, 40, 48, 56), L(48, 40, 34, 56)],
    wheel: () => [C(50, 50, 72, soft), C(50, 50, 16), L(50, 14, 50, 86), L(14, 50, 86, 50), L(24, 24, 76, 76), L(76, 24, 24, 76)],
    gear: () => [C(50, 50, 56, soft), C(50, 50, 22), L(50, 10, 50, 22), L(50, 78, 50, 90), L(10, 50, 22, 50), L(78, 50, 90, 50)],
    globe: () => [C(50, 50, 72, soft), rc.ellipse(cx, cy, size * 0.34, size * 0.72, o()), L(16, 50, 84, 50), L(22, 34, 78, 34), L(22, 66, 78, 66)],
    scale: () => [L(50, 16, 50, 86), L(20, 28, 80, 28), P([[14, 56], [26, 56], [20, 28]], soft), P([[74, 56], [86, 56], [80, 28]], soft), L(34, 86, 66, 86)],
  };

  const g = svgEl('g');
  const maker = shapes[key] || shapes.bulb;
  maker().forEach((el) => g.appendChild(el));
  return g;
}

/**
 * Draws a RoughJS diagram node in one of 5 crisp shapes: box | pill | circle | diamond | cloud
 */
function drawShapeNode(rc, cx, cy, w, h, shape, col, fill, seed, pal) {
  const g = svgEl('g');
  const opts = {
    stroke: col,
    strokeWidth: 2.3,
    roughness: 1.25,
    bowing: 1.25,
    seed,
    fill,
    fillStyle: 'hachure',
    hachureAngle: -41,
    hachureGap: 6.5,
    fillWeight: 1.0,
  };

  const s = String(shape || 'box').toLowerCase();
  if (s === 'circle') {
    const d = Math.min(w, h) * 1.02;
    g.appendChild(rc.circle(cx, cy, d, opts));
  } else if (s === 'diamond') {
    g.appendChild(rc.polygon([
      [cx, cy - h * 0.56],
      [cx + w * 0.56, cy],
      [cx, cy + h * 0.56],
      [cx - w * 0.56, cy],
    ], opts));
  } else if (s === 'pill') {
    const r = Math.min(h / 2, 26);
    const x = cx - w / 2;
    const y = cy - h / 2;
    const d = `M ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
    g.appendChild(rc.path(d, opts));
  } else if (s === 'cloud') {
    const rx = w * 0.48;
    const ry = h * 0.44;
    const d = `M ${cx - rx * 0.6} ${cy + ry * 0.7} C ${cx - rx * 1.1} ${cy + ry * 0.6}, ${cx - rx * 1.05} ${cy - ry * 0.35}, ${cx - rx * 0.5} ${cy - ry * 0.55} C ${cx - rx * 0.35} ${cy - ry * 1.05}, ${cx + rx * 0.35} ${cy - ry * 1.05}, ${cx + rx * 0.5} ${cy - ry * 0.55} C ${cx + rx * 1.05} ${cy - ry * 0.35}, ${cx + rx * 1.1} ${cy + ry * 0.6}, ${cx + rx * 0.6} ${cy + ry * 0.7} Z`;
    g.appendChild(rc.path(d, opts));
  } else {
    g.appendChild(rc.rectangle(cx - w / 2, cy - h / 2, w, h, opts));
  }
  return g;
}

/**
 * Draws a curved or straight RoughJS arrow between (x1,y1) -> (x2,y2) + mid label badge.
 */
function drawRoughArrow(rc, x1, y1, x2, y2, col, label, pal, seed, bend = 0) {
  const g = svgEl('g');
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cpx = mx + nx * bend;
  const cpy = my + ny * bend;

  const opts = { stroke: col, strokeWidth: 2.3, roughness: 1.05, bowing: 1.0, seed };
  if (Math.abs(bend) > 4) {
    g.appendChild(rc.path(`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`, opts));
  } else {
    g.appendChild(rc.line(x1, y1, x2, y2, opts));
  }

  // Arrowhead aligned to end tangent
  const tx = Math.abs(bend) > 4 ? x2 - cpx : dx;
  const ty = Math.abs(bend) > 4 ? y2 - cpy : dy;
  const ang = Math.atan2(ty, tx);
  const hl = 11;
  const ax1 = x2 - hl * Math.cos(ang - Math.PI / 6);
  const ay1 = y2 - hl * Math.sin(ang - Math.PI / 6);
  const ax2 = x2 - hl * Math.cos(ang + Math.PI / 6);
  const ay2 = y2 - hl * Math.sin(ang + Math.PI / 6);
  g.appendChild(rc.line(x2, y2, ax1, ay1, opts));
  g.appendChild(rc.line(x2, y2, ax2, ay2, opts));

  if (label && String(label).trim()) {
    const lx = Math.abs(bend) > 4 ? (x1 + 2 * cpx + x2) / 4 : mx;
    const ly = (Math.abs(bend) > 4 ? (y1 + 2 * cpy + y2) / 4 : my) - 12;
    const lblTxt = String(label).trim().slice(0, 18);
    const pillW = Math.max(52, lblTxt.length * 7.8 + 14);
    const pill = svgEl('rect', {
      x: lx - pillW / 2,
      y: ly - 10,
      width: pillW,
      height: 20,
      rx: 7,
      fill: pal.labelBg,
      stroke: col,
      'stroke-width': 1,
      'stroke-opacity': 0.45,
    });
    const t = svgEl('text', {
      x: lx,
      y: ly,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 11.5,
      'font-weight': '700',
      'font-family': '"IBM Plex Sans", sans-serif',
      fill: col,
    });
    t.textContent = lblTxt;
    g.appendChild(pill);
    g.appendChild(t);
  }
  return g;
}

/**
 * Overlap Guard for legacy/freeform positioned cues so nodes never collide.
 */
function boxesOverlap(a, b, pad = 12) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function normalizeAndGuardCues(rawCues = []) {
  // Drop broken/unwanted imagebackdrop overlays so vector drawings shine unobstructed
  const clean = (Array.isArray(rawCues) ? rawCues : []).filter(
    (c) => c && String(c.type || '').toLowerCase() !== 'imagebackdrop'
  );

  // Reserve header strip if a title exists
  const occupied = [];
  const hasTitle = clean.some((c) => String(c.type).toLowerCase() === 'title');
  if (hasTitle) {
    occupied.push({ x: 35, y: 20, w: 930, h: 86 });
  }

  // Track if a semantic macro diagram exists so bottom equation/bullets automatically anchor safely below it!
  const macroTypes = new Set(['flowchart', 'cycle', 'tree', 'comparison', 'venn', 'timeline', 'barchart', 'axes']);
  const hasMacro = clean.some((c) => macroTypes.has(String(c.type || '').toLowerCase()));
  if (hasMacro) {
    occupied.push({ x: 40, y: 112, w: 920, h: 378 });
  }

  let nextBottomY = hasMacro ? 506 : 132;
  const out = [];

  for (const cue of clean) {
    const t = String(cue.type || 'box').toLowerCase();
    if (t === 'title' || macroTypes.has(t) || t === 'curve' || t === 'highlight' || t === 'arrow' || t === 'processpulse') {
      out.push({ ...cue });
      continue;
    }

    if (t === 'equation') {
      const w = 560;
      const h = 50;
      let x = cue.x != null ? Math.min(LOGICAL_W - w - 30, Math.max(40, cue.x)) : (LOGICAL_W - w) / 2;
      let y = hasMacro ? Math.max(502, nextBottomY) : (cue.y ?? nextBottomY);
      const box = { x, y: y - 30, w, h };
      if (!hasMacro && occupied.some((o) => boxesOverlap(box, o))) {
        y = nextBottomY + 26;
      }
      occupied.push({ x, y: y - 30, w, h });
      nextBottomY = Math.max(nextBottomY, y + 36);
      out.push({ ...cue, x, y });
      continue;
    }

    if (t === 'bullet') {
      const w = 780;
      const h = 44;
      const x = cue.x != null ? Math.min(200, Math.max(48, cue.x)) : 62;
      let y = hasMacro ? Math.max(518, nextBottomY + 14) : (cue.y ?? nextBottomY + 18);
      while (!hasMacro && occupied.some((o) => boxesOverlap({ x, y: y - 22, w, h }, o)) && y < 560) {
        y += 56;
      }
      occupied.push({ x, y: y - 22, w, h });
      nextBottomY = Math.max(nextBottomY, y + 32);
      out.push({ ...cue, x, y });
      continue;
    }

    if (t === 'box') {
      const w = Math.max(120, Math.min(340, cue.w ?? 220));
      const h = Math.max(66, Math.min(160, cue.h ?? 96));
      let x = Math.max(44, Math.min(LOGICAL_W - w - 44, cue.x ?? 80));
      let y = Math.max(115, Math.min(LOGICAL_H - h - 40, cue.y ?? nextBottomY));
      while (occupied.some((o) => boxesOverlap({ x, y, w, h }, o)) && y + h < 575) {
        y += 42;
      }
      occupied.push({ x, y, w, h });
      nextBottomY = Math.max(nextBottomY, y + h + 16);
      out.push({ ...cue, x, y, w, h });
      continue;
    }

    if (t === 'circle' || t === 'ellipse') {
      const r = Math.max(32, Math.min(95, cue.r ?? 56));
      let cx = Math.max(44 + r, Math.min(LOGICAL_W - r - 44, cue.x ?? 500));
      let cy = Math.max(120 + r, Math.min(LOGICAL_H - r - 40, cue.y ?? 290));
      while (occupied.some((o) => boxesOverlap({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, o)) && cy + r < 575) {
        cy += 42;
      }
      occupied.push({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 });
      out.push({ ...cue, x: cx, y: cy, r });
      continue;
    }

    out.push({ ...cue });
  }

  return out;
}

/**
 * Registers an SVG group's animatable paths (stroke-dashoffset) & text clips (`clipPath` reveal)
 * into a flat scrubbed timeline array `tracks[]` so progress `0..1` animates them like Golpo AI!
 */
function collectAnimationTracks(svgDefs, rootGroup, startP, endP, idPrefix) {
  const tracks = [];
  const allNodes = [...rootGroup.querySelectorAll('path, circle, rect, ellipse, line, polygon, polyline, text')];
  const span = Math.max(0.06, endP - startP);
  const count = Math.max(1, allNodes.length);

  allNodes.forEach((node, idx) => {
    const tag = node.tagName.toLowerCase();
    const fracStart = startP + (idx / count) * span * 0.72;
    const fracEnd = Math.min(1, fracStart + Math.max(0.08, span * 0.42));

    if (tag === 'text') {
      const x = parseFloat(node.getAttribute('x') || '0');
      const y = parseFloat(node.getAttribute('y') || '0');
      const fs = parseFloat(node.getAttribute('font-size') || '18');
      const txtLen = (node.textContent || '').length;
      const estW = Math.max(90, txtLen * fs * 0.65 + 40);
      const anchor = node.getAttribute('text-anchor') || 'start';
      const boxX = anchor === 'middle' ? x - estW / 2 : anchor === 'end' ? x - estW : x - 12;
      const boxY = y - fs * 0.9;
      const boxH = fs * 1.9;

      const cpId = `${idPrefix}_cp_${idx}`;
      const cp = svgEl('clipPath', { id: cpId });
      const rect = svgEl('rect', { x: boxX, y: boxY, width: 0, height: boxH });
      cp.appendChild(rect);
      svgDefs.appendChild(cp);
      node.setAttribute('clip-path', `url(#${cpId})`);

      tracks.push({
        kind: 'clip',
        rect,
        fullW: estW,
        tipX0: boxX,
        tipY: y,
        startP: fracStart,
        endP: fracEnd,
      });
      return;
    }

    if (typeof node.getTotalLength === 'function') {
      let len = 0;
      try { len = node.getTotalLength(); } catch { len = 140; }
      if (!len || !isFinite(len)) len = 140;
      node.style.strokeDasharray = `${len}`;
      node.style.strokeDashoffset = `${len}`;
      tracks.push({
        kind: 'stroke',
        el: node,
        len,
        startP: fracStart,
        endP: fracEnd,
      });
    } else {
      node.style.opacity = '0';
      tracks.push({
        kind: 'fade',
        el: node,
        startP: fracStart,
        endP: fracEnd,
      });
    }
  });

  return tracks;
}

function buildCueElements(rc, svgDefs, cue, pal, theme, bulletOrdinal, idPrefix) {
  const g = svgEl('g');
  const col = getStrokeColor(pal, cue.color);
  const fill = getHachureFill(pal, cue.color);
  const seed = hashSeed(`${cue.type}_${cue.text || cue.title || bulletOrdinal}`);
  const type = String(cue.type || 'box').toLowerCase();

  if (type === 'title') {
    const x = cue.x ?? 52;
    const y = cue.y ?? 58;
    const titleStr = String(cue.text || '');
    const t = svgEl('text', {
      x,
      y,
      'text-anchor': 'start',
      'font-size': 34,
      'font-weight': '700',
      'font-family': '"Caveat", "Fraunces", Georgia, serif',
      fill: pal.cream,
    });
    t.textContent = titleStr;
    g.appendChild(t);

    const estW = Math.max(160, Math.min(860, titleStr.length * 16.5 + 24));
    const uCol = cue.color === 'teal' || cue.color === 'coral' ? col : pal.amber;
    g.appendChild(rc.line(x, y + 11, x + estW, y + 11, {
      stroke: uCol,
      strokeWidth: 3.2,
      roughness: 1.35,
      seed,
    }));

    if (cue.sublabel) {
      const sub = svgEl('text', {
        x,
        y: y + 32,
        'text-anchor': 'start',
        'font-size': 13.5,
        'font-weight': '600',
        'font-family': '"IBM Plex Mono", monospace',
        fill: pal.muted,
      });
      sub.textContent = String(cue.sublabel);
      g.appendChild(sub);
    }
    return g;
  }

  if (type === 'flowchart') {
    const nodes = Array.isArray(cue.nodes) ? cue.nodes.slice(0, 4) : [];
    const edges = Array.isArray(cue.edges) ? cue.edges : [];
    const n = nodes.length;
    if (!n) return g;

    const isCol = cue.direction === 'col' && n <= 3;
    const positions = [];

    if (isCol) {
      const cardW = 360;
      const cardH = 88;
      const gapY = 44;
      const totalH = n * cardH + (n - 1) * gapY;
      const startY = 128 + Math.max(0, (355 - totalH) / 2);
      nodes.forEach((nd, i) => {
        positions.push({ cx: 500, cy: startY + i * (cardH + gapY) + cardH / 2, w: cardW, h: cardH });
      });
    } else {
      const gapX = n >= 4 ? 46 : 68;
      const availW = 900;
      const cardW = Math.min(250, Math.floor((availW - (n - 1) * gapX) / n));
      const cardH = 148;
      const totalW = n * cardW + (n - 1) * gapX;
      const startX = (LOGICAL_W - totalW) / 2;
      const cy = 296;
      nodes.forEach((nd, i) => {
        positions.push({ cx: startX + i * (cardW + gapX) + cardW / 2, cy, w: cardW, h: cardH });
      });
    }

    nodes.forEach((nd, i) => {
      const pos = positions[i];
      const nCol = getStrokeColor(pal, nd.color || ['amber', 'teal', 'coral', 'mint'][i % 4]);
      const nFill = getHachureFill(pal, nd.color || ['amber', 'teal', 'coral', 'mint'][i % 4]);
      g.appendChild(drawShapeNode(rc, pos.cx, pos.cy, pos.w, pos.h, nd.shape || 'box', nCol, nFill, seed + i * 7, pal));

      let textOffsetY = 0;
      if (nd.icon) {
        g.appendChild(buildVectorIcon(rc, nd.icon, pos.cx, pos.cy - pos.h * 0.23, 38, nCol, pal.cream, seed + i * 13));
        textOffsetY = 18;
      }

      g.appendChild(createTextBlock(nd.title || `Step ${i + 1}`, pos.cx, pos.cy + textOffsetY - (nd.sub ? 12 : 0), {
        fontSize: n >= 4 ? 15.5 : 17.5,
        fill: nCol,
        maxChars: Math.floor(pos.w / 10.5),
        maxLines: 2,
      }));
      if (nd.sub) {
        g.appendChild(createTextBlock(nd.sub, pos.cx, pos.cy + textOffsetY + 20, {
          fontSize: 13,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: Math.floor(pos.w / 9),
          maxLines: 2,
        }));
      }
    });

    const autoEdges = edges.length
      ? edges
      : nodes.slice(0, -1).map((_, i) => ({ from: i, to: i + 1, label: '' }));

    autoEdges.forEach((ed, idx) => {
      const a = positions[ed.from];
      const b = positions[ed.to];
      if (!a || !b) return;
      const eCol = pal.cream;
      if (isCol) {
        g.appendChild(drawRoughArrow(rc, a.cx, a.cy + a.h / 2 + 4, b.cx, b.cy - b.h / 2 - 4, eCol, ed.label, pal, seed + idx * 19, 0));
      } else {
        const dir = b.cx >= a.cx ? 1 : -1;
        const x1 = a.cx + dir * (a.w / 2 + 5);
        const x2 = b.cx - dir * (b.w / 2 + 5);
        g.appendChild(drawRoughArrow(rc, x1, a.cy, x2, b.cy, eCol, ed.label, pal, seed + idx * 19, 0));
      }
    });

    return g;
  }

  if (type === 'cycle') {
    const nodes = Array.isArray(cue.nodes) ? cue.nodes.slice(0, 6) : [];
    const n = nodes.length;
    if (!n) return g;

    const cx = 500;
    const cy = 302;
    const rx = 285;
    const ry = 132;

    if (cue.centerTitle) {
      g.appendChild(rc.circle(cx, cy, 134, {
        stroke: pal.amber,
        strokeWidth: 2,
        roughness: 1.2,
        seed,
        fill: pal.fillAmber,
        fillStyle: 'hachure',
        hachureGap: 7,
      }));
      g.appendChild(createTextBlock(cue.centerTitle, cx, cy, {
        fontSize: 16.5,
        fill: pal.cream,
        maxChars: 13,
        maxLines: 2,
      }));
    }

    const pts = nodes.map((nd, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return {
        nd,
        x: cx + Math.cos(ang) * rx,
        y: cy + Math.sin(ang) * ry,
        ang,
      };
    });

    pts.forEach((p, i) => {
      const nCol = getStrokeColor(pal, p.nd.color || ['amber', 'teal', 'coral', 'mint'][i % 4]);
      const nFill = getHachureFill(pal, p.nd.color || ['amber', 'teal', 'coral', 'mint'][i % 4]);
      const w = 180;
      const h = 84;
      g.appendChild(drawShapeNode(rc, p.x, p.y, w, h, 'pill', nCol, nFill, seed + i * 9, pal));
      if (p.nd.icon) {
        g.appendChild(buildVectorIcon(rc, p.nd.icon, p.x - 56, p.y, 32, nCol, pal.cream, seed + i * 5));
      }
      const tx = p.nd.icon ? p.x + 14 : p.x;
      g.appendChild(createTextBlock(p.nd.title || `Stage ${i + 1}`, tx, p.y - (p.nd.sub ? 9 : 0), {
        fontSize: 15,
        fill: nCol,
        maxChars: 14,
        maxLines: 1,
      }));
      if (p.nd.sub) {
        g.appendChild(createTextBlock(p.nd.sub, tx, p.y + 13, {
          fontSize: 12.5,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: 16,
          maxLines: 1,
        }));
      }
    });

    pts.forEach((a, i) => {
      const b = pts[(i + 1) % n];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const padA = 88;
      const padB = 88;
      const x1 = a.x + Math.cos(ang) * padA * 0.72;
      const y1 = a.y + Math.sin(ang) * padA * 0.45;
      const x2 = b.x - Math.cos(ang) * padB * 0.72;
      const y2 = b.y - Math.sin(ang) * padB * 0.45;
      g.appendChild(drawRoughArrow(rc, x1, y1, x2, y2, pal.muted, '', pal, seed + i * 17, 22));
    });

    return g;
  }

  if (type === 'tree') {
    const root = cue.root || { title: cue.title || 'Core Concept', sub: cue.sub || '' };
    const branches = Array.isArray(cue.branches) ? cue.branches.slice(0, 4) : [];
    const n = branches.length || 1;

    const rW = 280;
    const rH = 92;
    const rx = 500;
    const ry = 165;
    const rCol = getStrokeColor(pal, root.color || 'amber');
    const rFill = getHachureFill(pal, root.color || 'amber');

    g.appendChild(drawShapeNode(rc, rx, ry, rW, rH, 'box', rCol, rFill, seed, pal));
    if (root.icon) {
      g.appendChild(buildVectorIcon(rc, root.icon, rx - 96, ry, 42, rCol, pal.cream, seed + 3));
    }
    const rtx = root.icon ? rx + 16 : rx;
    g.appendChild(createTextBlock(root.title || 'Concept', rtx, ry - (root.sub ? 10 : 0), {
      fontSize: 18.5,
      fill: rCol,
      maxChars: 20,
      maxLines: 2,
    }));
    if (root.sub) {
      g.appendChild(createTextBlock(root.sub, rtx, ry + 16, {
        fontSize: 13.5,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: 24,
        maxLines: 1,
      }));
    }

    const gapX = 32;
    const bw = Math.min(240, Math.floor((900 - (n - 1) * gapX) / n));
    const bh = 128;
    const totalW = n * bw + (n - 1) * gapX;
    const startX = (LOGICAL_W - totalW) / 2;
    const by = 378;

    branches.forEach((br, i) => {
      const bx = startX + i * (bw + gapX) + bw / 2;
      const bCol = getStrokeColor(pal, br.color || ['teal', 'coral', 'mint', 'amber'][i % 4]);
      const bFill = getHachureFill(pal, br.color || ['teal', 'coral', 'mint', 'amber'][i % 4]);

      // Smooth branch connector
      const midY = (ry + rH / 2 + by - bh / 2) / 2;
      g.appendChild(rc.path(`M ${rx} ${ry + rH / 2} C ${rx} ${midY}, ${bx} ${midY}, ${bx} ${by - bh / 2 - 4}`, {
        stroke: bCol,
        strokeWidth: 2.3,
        roughness: 1.15,
        seed: seed + i * 11,
      }));

      g.appendChild(drawShapeNode(rc, bx, by, bw, bh, 'box', bCol, bFill, seed + i * 13, pal));
      let ty = 0;
      if (br.icon) {
        g.appendChild(buildVectorIcon(rc, br.icon, bx, by - 30, 34, bCol, pal.cream, seed + i * 19));
        ty = 18;
      }
      g.appendChild(createTextBlock(br.title || '', bx, by + ty - (br.sub ? 11 : 0), {
        fontSize: 16,
        fill: bCol,
        maxChars: Math.floor(bw / 10),
        maxLines: 2,
      }));
      if (br.sub) {
        g.appendChild(createTextBlock(br.sub, bx, by + ty + 18, {
          fontSize: 13,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: Math.floor(bw / 8.5),
          maxLines: 2,
        }));
      }
    });

    return g;
  }

  if (type === 'comparison') {
    const left = cue.left || { title: 'Side A', points: [], color: 'amber' };
    const right = cue.right || { title: 'Side B', points: [], color: 'teal' };
    const lCol = getStrokeColor(pal, left.color || 'amber');
    const rCol = getStrokeColor(pal, right.color || 'teal');

    g.appendChild(drawShapeNode(rc, 260, 295, 405, 320, 'box', lCol, getHachureFill(pal, left.color || 'amber'), seed + 1, pal));
    g.appendChild(drawShapeNode(rc, 740, 295, 405, 320, 'box', rCol, getHachureFill(pal, right.color || 'teal'), seed + 2, pal));

    g.appendChild(createTextBlock(left.title || 'Column A', 260, 168, { fontSize: 20, fill: lCol, maxChars: 24, maxLines: 1 }));
    g.appendChild(rc.line(90, 192, 430, 192, { stroke: lCol, strokeWidth: 2, seed }));
    g.appendChild(createTextBlock(right.title || 'Column B', 740, 168, { fontSize: 20, fill: rCol, maxChars: 24, maxLines: 1 }));
    g.appendChild(rc.line(570, 192, 910, 192, { stroke: rCol, strokeWidth: 2, seed: seed + 5 }));

    (left.points || []).slice(0, 4).forEach((pt, idx) => {
      g.appendChild(createTextBlock(`• ${pt}`, 82, 234 + idx * 54, {
        anchor: 'start',
        fontSize: 16,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: 34,
        maxLines: 2,
      }));
    });
    (right.points || []).slice(0, 4).forEach((pt, idx) => {
      g.appendChild(createTextBlock(`• ${pt}`, 562, 234 + idx * 54, {
        anchor: 'start',
        fontSize: 16,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: 34,
        maxLines: 2,
      }));
    });

    // VS center badge
    g.appendChild(rc.circle(500, 295, 48, { stroke: pal.coral, strokeWidth: 2.2, fill: pal.labelBg, fillStyle: 'solid', seed: seed + 9 }));
    g.appendChild(createTextBlock('VS', 500, 295, { fontSize: 15, fill: pal.coral }));
    return g;
  }

  if (type === 'venn') {
    const left = cue.left || { title: 'Group A', sub: '', color: 'amber' };
    const right = cue.right || { title: 'Group B', sub: '', color: 'teal' };
    const lCol = getStrokeColor(pal, left.color || 'amber');
    const rCol = getStrokeColor(pal, right.color || 'teal');

    g.appendChild(rc.circle(385, 300, 300, {
      stroke: lCol,
      strokeWidth: 2.5,
      roughness: 1.2,
      seed: seed + 1,
      fill: getHachureFill(pal, left.color || 'amber'),
      fillStyle: 'hachure',
      hachureGap: 7,
    }));
    g.appendChild(rc.circle(615, 300, 300, {
      stroke: rCol,
      strokeWidth: 2.5,
      roughness: 1.2,
      seed: seed + 2,
      fill: getHachureFill(pal, right.color || 'teal'),
      fillStyle: 'hachure',
      hachureAngle: 45,
      hachureGap: 7,
    }));

    g.appendChild(createTextBlock(left.title || 'A', 305, 258, { fontSize: 19, fill: lCol, maxChars: 16, maxLines: 2 }));
    if (left.sub) g.appendChild(createTextBlock(left.sub, 305, 308, { fontSize: 14, fontWeight: '500', fill: pal.cream, maxChars: 18, maxLines: 3 }));

    g.appendChild(createTextBlock(right.title || 'B', 695, 258, { fontSize: 19, fill: rCol, maxChars: 16, maxLines: 2 }));
    if (right.sub) g.appendChild(createTextBlock(right.sub, 695, 308, { fontSize: 14, fontWeight: '500', fill: pal.cream, maxChars: 18, maxLines: 3 }));

    if (cue.overlap) {
      g.appendChild(createTextBlock(cue.overlap, 500, 300, { fontSize: 15, fill: pal.coral, maxChars: 12, maxLines: 3 }));
    }
    return g;
  }

  if (type === 'timeline') {
    const items = Array.isArray(cue.items) ? cue.items.slice(0, 5) : [];
    const n = items.length;
    if (!n) return g;

    const x1 = 95;
    const x2 = 905;
    const y = 305;
    g.appendChild(rc.line(x1, y, x2, y, { stroke: col, strokeWidth: 3, roughness: 1.2, seed }));

    items.forEach((it, idx) => {
      const frac = n === 1 ? 0.5 : idx / (n - 1);
      const ix = x1 + frac * (x2 - x1);
      const isUp = idx % 2 === 0;
      const cardY = isUp ? 185 : 420;
      const nCol = getStrokeColor(pal, ['amber', 'teal', 'coral', 'mint'][idx % 4]);

      g.appendChild(rc.line(ix, y, ix, isUp ? cardY + 42 : cardY - 42, { stroke: nCol, strokeWidth: 2, seed: seed + idx }));
      g.appendChild(rc.circle(ix, y, 16, { stroke: nCol, strokeWidth: 2.2, fill: nCol, fillStyle: 'solid', seed: seed + idx + 20 }));
      g.appendChild(drawShapeNode(rc, ix, cardY, 175, 82, 'box', nCol, getHachureFill(pal, ['amber', 'teal', 'coral', 'mint'][idx % 4]), seed + idx + 50, pal));

      g.appendChild(createTextBlock(it.year || `Stage ${idx + 1}`, ix, cardY - 17, {
        fontSize: 13.5,
        fontFamily: '"IBM Plex Mono", monospace',
        fill: nCol,
        maxChars: 16,
        maxLines: 1,
      }));
      g.appendChild(createTextBlock(it.text || '', ix, cardY + 12, {
        fontSize: 13.5,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: 18,
        maxLines: 2,
      }));
    });
    return g;
  }

  if (type === 'barchart') {
    const bars = Array.isArray(cue.bars) ? cue.bars.slice(0, 6) : [];
    if (!bars.length) return g;
    const axX = 160;
    const axY = 140;
    const axW = 680;
    const axH = 290;
    g.appendChild(rc.line(axX, axY + axH, axX, axY, { stroke: pal.cream, strokeWidth: 2.4, seed }));
    g.appendChild(rc.line(axX, axY + axH, axX + axW, axY + axH, { stroke: pal.cream, strokeWidth: 2.4, seed: seed + 2 }));

    const maxVal = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
    const slotW = axW / bars.length;
    const barW = Math.min(76, slotW * 0.56);

    bars.forEach((b, idx) => {
      const bCol = getStrokeColor(pal, b.color || ['amber', 'teal', 'coral', 'mint'][idx % 4]);
      const bh = Math.max(16, ((Number(b.value) || 0) / maxVal) * (axH - 36));
      const bx = axX + idx * slotW + (slotW - barW) / 2;
      const by = axY + axH - bh;
      g.appendChild(rc.rectangle(bx, by, barW, bh, {
        stroke: bCol,
        strokeWidth: 2.2,
        fill: getHachureFill(pal, b.color || ['amber', 'teal', 'coral', 'mint'][idx % 4]),
        fillStyle: 'hachure',
        hachureGap: 5,
        seed: seed + idx * 9,
      }));
      g.appendChild(createTextBlock(String(b.value ?? ''), bx + barW / 2, by - 14, { fontSize: 13.5, fill: bCol }));
      g.appendChild(createTextBlock(String(b.label || ''), bx + barW / 2, axY + axH + 22, { fontSize: 13.5, fill: pal.cream, maxChars: 12, maxLines: 1 }));
    });
    return g;
  }

  if (type === 'equation') {
    const eqText = String(cue.text || '');
    const x = cue.x ?? 220;
    const y = cue.y ?? 530;
    const w = Math.max(240, Math.min(820, eqText.length * 13.5 + 48));
    g.appendChild(drawShapeNode(rc, x + w / 2, y - 6, w, 48, 'pill', col, fill, seed, pal));
    g.appendChild(createTextBlock(eqText, x + w / 2, y - 6, {
      fontSize: 19,
      fontFamily: '"IBM Plex Mono", monospace',
      fill: col,
      maxChars: 58,
      maxLines: 1,
    }));
    return g;
  }

  if (type === 'bullet') {
    const x = cue.x ?? 62;
    const y = cue.y ?? 540;
    const num = cue.index ?? bulletOrdinal;
    const text = String(cue.text || '');
    const r = 15;
    g.appendChild(rc.circle(x + r, y, r * 2, {
      stroke: col,
      strokeWidth: 2,
      fill,
      fillStyle: 'solid',
      seed,
    }));
    const nTxt = svgEl('text', {
      x: x + r,
      y,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 15,
      'font-weight': '700',
      'font-family': '"IBM Plex Sans", sans-serif',
      fill: col,
    });
    nTxt.textContent = String(num);
    g.appendChild(nTxt);

    g.appendChild(createTextBlock(text, x + 44, y, {
      anchor: 'start',
      fontSize: 19,
      fontWeight: '600',
      fill: pal.cream,
      maxChars: 64,
      maxLines: 2,
    }));
    return g;
  }

  if (type === 'box') {
    const x = cue.x ?? 80;
    const y = cue.y ?? 140;
    const w = cue.w ?? 220;
    const h = cue.h ?? 96;
    g.appendChild(drawShapeNode(rc, x + w / 2, y + h / 2, w, h, cue.shape || 'box', col, fill, seed, pal));
    g.appendChild(createTextBlock(cue.text || '', x + w / 2, y + h / 2 - (cue.sublabel ? 12 : 0), {
      fontSize: 17.5,
      fill: col,
      maxChars: Math.floor(w / 10),
      maxLines: 2,
    }));
    if (cue.sublabel) {
      g.appendChild(createTextBlock(cue.sublabel, x + w / 2, y + h / 2 + 18, {
        fontSize: 13.5,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: Math.floor(w / 9),
        maxLines: 2,
      }));
    }
    return g;
  }

  if (type === 'circle' || type === 'ellipse') {
    const cx = cue.x ?? 500;
    const cy = cue.y ?? 280;
    const r = cue.r ?? 56;
    g.appendChild(drawShapeNode(rc, cx, cy, r * 2, r * 2, 'circle', col, fill, seed, pal));
    g.appendChild(createTextBlock(cue.text || '', cx, cy - (cue.sublabel ? 10 : 0), {
      fontSize: 16.5,
      fill: col,
      maxChars: Math.floor((r * 1.7) / 9),
      maxLines: 2,
    }));
    if (cue.sublabel) {
      g.appendChild(createTextBlock(cue.sublabel, cx, cy + 16, {
        fontSize: 13,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: Math.floor((r * 1.7) / 8),
        maxLines: 1,
      }));
    }
    return g;
  }

  if (type === 'arrow' || type === 'curvedarrow' || type === 'processpulse') {
    g.appendChild(drawRoughArrow(
      rc,
      cue.x1 ?? 260,
      cue.y1 ?? 200,
      cue.x2 ?? 460,
      cue.y2 ?? 200,
      col,
      cue.label || '',
      pal,
      seed,
      type === 'curvedarrow' ? 24 : 0
    ));
    return g;
  }

  if (type === 'axes') {
    const x = cue.x ?? 120;
    const y = cue.y ?? 150;
    const w = cue.w ?? 380;
    const h = cue.h ?? 270;
    g.appendChild(rc.line(x, y + h, x, y, { stroke: pal.cream, strokeWidth: 2.3, seed }));
    g.appendChild(rc.line(x, y + h, x + w, y + h, { stroke: pal.cream, strokeWidth: 2.3, seed: seed + 1 }));
    if (cue.xLabel) g.appendChild(createTextBlock(cue.xLabel, x + w, y + h + 22, { anchor: 'end', fontSize: 13, fill: pal.muted }));
    if (cue.yLabel) g.appendChild(createTextBlock(cue.yLabel, x + 12, y + 12, { anchor: 'start', fontSize: 13, fill: pal.muted }));
    return g;
  }

  if (type === 'curve') {
    const x = cue.x ?? 120;
    const y = cue.y ?? 150;
    const w = cue.w ?? 380;
    const h = cue.h ?? 270;
    const pts = Array.isArray(cue.points) && cue.points.length >= 2
      ? cue.points
      : [[0, 0.1], [0.35, 0.45], [0.7, 0.85], [1, 0.92]];
    const mapped = pts.map(([px, py]) => [x + px * w, y + h - py * h]);
    g.appendChild(rc.curve(mapped, { stroke: col, strokeWidth: 3, roughness: 0.9, seed }));
    if (cue.label) {
      const last = mapped[mapped.length - 1];
      g.appendChild(createTextBlock(cue.label, Math.min(890, last[0] + 10), last[1], { anchor: 'start', fontSize: 14, fill: col }));
    }
    return g;
  }

  if (type === 'highlight') {
    const x = cue.x ?? 80;
    const y = cue.y ?? 140;
    const w = cue.w ?? 220;
    const h = cue.h ?? 96;
    g.appendChild(rc.rectangle(x - 6, y - 6, w + 12, h + 12, { stroke: col, strokeWidth: 2.8, roughness: 1.4, seed }));
    return g;
  }

  return g;
}

function buildSmoothStrokePath(pts) {
  if (!pts || !pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${(pts[0].x + 0.5).toFixed(1)} ${pts[0].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i + 1].y) / 2).toFixed(1);
    d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export class ClassroomBoard {
  constructor(hostEl, initialState = null, opts = {}) {
    this.compact = Boolean(opts.compact);
    const defaultTheme = initialState?.theme || 'chalkboard';
    this.state = {
      theme: defaultTheme,
      pages: Array.isArray(initialState?.pages) && initialState.pages.length
        ? initialState.pages
        : [{ id: 'b1', title: 'Board 1', cues: [], userStrokes: [] }],
      activePageIndex: initialState?.activePageIndex || 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      tool: 'view',
      penColor: defaultTheme === 'whiteboard' ? '#D9540E' : '#FFB469',
      undoStack: [],
      redoStack: [],
    };
    this.progress = 1;
    this._destroyed = false;
    this._activePointers = new Map();
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;
    this._lastPanPt = null;
    this._drawingStroke = null;
    this._tracks = [];
    this.onChange = null;

    // Accept either a <div> host OR replace a legacy <canvas> cleanly with a <div> host
    if (hostEl && hostEl.tagName === 'CANVAS') {
      const div = document.createElement('div');
      div.id = hostEl.id;
      div.className = hostEl.className;
      hostEl.replaceWith(div);
      this.host = div;
    } else {
      this.host = hostEl;
    }

    this._initSvgDom();
    this._rebuildScene();
    this._bindInteractions();
  }

  _initSvgDom() {
    if (!this.host) return;
    this.host.innerHTML = '';
    this.host.classList.add('board-svg-host');

    const svg = svgEl('svg', {
      viewBox: `0 0 ${LOGICAL_W} ${LOGICAL_H}`,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'board-svg-root',
    });

    const defs = svgEl('defs');
    const patId = `grid_${Math.random().toString(36).slice(2, 8)}`;
    const pat = svgEl('pattern', { id: patId, width: 26, height: 26, patternUnits: 'userSpaceOnUse' });
    const dot = svgEl('circle', { cx: 13, cy: 13, r: 1.35, class: 'board-grid-dot' });
    pat.appendChild(dot);
    defs.appendChild(pat);

    this.defs = defs;
    this.dynamicDefs = svgEl('g');
    defs.appendChild(this.dynamicDefs);
    svg.appendChild(defs);

    const bgRect = svgEl('rect', { width: LOGICAL_W, height: LOGICAL_H, fill: `url(#${patId})` });
    svg.appendChild(bgRect);

    const viewport = svgEl('g', { id: 'board-viewport' });
    const cuesGroup = svgEl('g', { id: 'board-cues' });
    const strokesGroup = svgEl('g', { id: 'board-strokes' });
    const nibGroup = svgEl('g', { id: 'board-nib', visibility: 'hidden' });

    const nibOuter = svgEl('circle', { cx: 0, cy: 0, r: 9, fill: '#D9540E', 'fill-opacity': 0.22 });
    const nibDot = svgEl('circle', { cx: 0, cy: 0, r: 4, fill: '#D9540E' });
    nibGroup.appendChild(nibOuter);
    nibGroup.appendChild(nibDot);

    viewport.appendChild(cuesGroup);
    viewport.appendChild(strokesGroup);
    viewport.appendChild(nibGroup);
    svg.appendChild(viewport);

    this.host.appendChild(svg);
    this.svg = svg;
    this.rc = rough.svg(svg);
    this.viewport = viewport;
    this.cuesGroup = cuesGroup;
    this.strokesGroup = strokesGroup;
    this.nibGroup = nibGroup;
    this.gridDot = dot;
  }

  _applyTransform() {
    if (!this.viewport) return;
    const cx = LOGICAL_W / 2;
    const cy = LOGICAL_H / 2;
    const z = this.state.zoom || 1;
    const px = this.state.panX || 0;
    const py = this.state.panY || 0;
    this.viewport.setAttribute(
      'transform',
      `translate(${px + cx * (1 - z)}, ${py + cy * (1 - z)}) scale(${z})`
    );
  }

  _rebuildScene() {
    if (!this.svg || !this.cuesGroup || !this.strokesGroup) return;
    const theme = this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard';
    const pal = PALETTES[theme];

    this.host?.classList.toggle('is-whiteboard', theme === 'whiteboard');
    this.host?.classList.toggle('is-chalkboard', theme === 'chalkboard');
    if (this.gridDot) this.gridDot.setAttribute('fill', pal.grid);

    this.cuesGroup.innerHTML = '';
    this.dynamicDefs.innerHTML = '';
    this._tracks = [];

    const page = this.state.pages[this.state.activePageIndex] || { cues: [], userStrokes: [] };
    const guardedCues = normalizeAndGuardCues(page.cues || []);
    const total = Math.max(1, guardedCues.length);

    let bulletCounter = 0;
    guardedCues.forEach((cue, idx) => {
      if (String(cue.type || '').toLowerCase() === 'bullet') bulletCounter++;
      const startP = cue._immediate ? 0 : Math.max(0, Math.min(0.84, Number(cue.atProgress ?? (idx / total) * 0.72)));
      const endP = cue._immediate ? 0.001 : Math.min(1, startP + (idx === 0 ? 0.24 : 0.34));
      const cg = buildCueElements(this.rc, this.dynamicDefs, cue, pal, theme, bulletCounter, `c${idx}`);
      this.cuesGroup.appendChild(cg);

      if (cue._immediate) {
        const tracks = collectAnimationTracks(this.dynamicDefs, cg, 0, 0.001, `c${idx}`);
        this._tracks.push(...tracks);
      } else {
        const tracks = collectAnimationTracks(this.dynamicDefs, cg, startP, endP, `c${idx}`);
        this._tracks.push(...tracks);
      }
    });

    this._renderUserStrokes(pal);
    this._applyTransform();
    this._scrubProgress(this.progress);
  }

  _renderUserStrokes(pal) {
    if (!this.strokesGroup) return;
    this.strokesGroup.innerHTML = '';
    const page = this.state.pages[this.state.activePageIndex];
    if (!page) return;
    for (const stroke of page.userStrokes || []) {
      const d = buildSmoothStrokePath(stroke.pts);
      if (!d) continue;
      const p = svgEl('path', {
        d,
        fill: 'none',
        stroke: stroke.color || pal.amber,
        'stroke-width': stroke.size || 4,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      this.strokesGroup.appendChild(p);
    }
  }

  _scrubProgress(prog) {
    const p = clamp01(prog);
    let activeTip = null;

    for (const tr of this._tracks) {
      const local = p >= tr.endP ? 1 : p <= tr.startP ? 0 : (p - tr.startP) / Math.max(0.001, tr.endP - tr.startP);
      const eased = easeInOutCubic(local);

      if (tr.kind === 'stroke') {
        tr.el.style.strokeDashoffset = `${tr.len * (1 - eased)}`;
        if (local > 0.01 && local < 0.99 && typeof tr.el.getPointAtLength === 'function') {
          try {
            const pt = tr.el.getPointAtLength(tr.len * eased);
            activeTip = { x: pt.x, y: pt.y };
          } catch {}
        }
      } else if (tr.kind === 'clip') {
        const w = tr.fullW * eased;
        tr.rect.setAttribute('width', w.toFixed(1));
        if (local > 0.02 && local < 0.98) {
          activeTip = { x: tr.tipX0 + w, y: tr.tipY };
        }
      } else if (tr.kind === 'fade') {
        tr.el.style.opacity = `${eased}`;
      }
    }

    if (this.nibGroup) {
      if (activeTip && p < 0.995) {
        this.nibGroup.setAttribute('transform', `translate(${activeTip.x.toFixed(1)}, ${activeTip.y.toFixed(1)})`);
        this.nibGroup.setAttribute('visibility', 'visible');
      } else {
        this.nibGroup.setAttribute('visibility', 'hidden');
      }
    }
  }

  destroy() {
    this._destroyed = true;
    this._unbindInteractions();
  }

  setProgress(p) {
    this.progress = clamp01(p);
    this._scrubProgress(this.progress);
  }

  setTheme(theme) {
    this.state.theme = theme === 'whiteboard' ? 'whiteboard' : 'chalkboard';
    this.state.penColor = this.state.theme === 'whiteboard' ? '#D9540E' : '#FFB469';
    this._rebuildScene();
    this.onChange?.();
  }

  setTool(tool) {
    this.state.tool = tool;
    if (this.host) {
      this.host.style.cursor = tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'grab';
    }
  }

  resetZoom() {
    this.state.zoom = 1;
    this.state.panX = 0;
    this.state.panY = 0;
    this._applyTransform();
  }

  setSingleStepCues(cues = [], forceImmediate = false) {
    const pg = this.state.pages[0] || { id: 'mini', title: 'Concept Board', cues: [], userStrokes: [] };
    pg.cues = (Array.isArray(cues) ? cues : []).map((c) => ({ ...c, _immediate: forceImmediate }));
    this.state.pages = [pg];
    this.state.activePageIndex = 0;
    this.progress = forceImmediate ? 1 : 0.25;
    this._rebuildScene();
  }

  applyStepCues(step, forceImmediate = false) {
    if (!step) return;
    const curPage = this.state.pages[this.state.activePageIndex];
    const shouldNewPage = Boolean(step.newBoardPage) && curPage && curPage.cues.length > 0 && step._boardPageId !== curPage.id;

    if (step._boardPageId) {
      const existingIdx = this.state.pages.findIndex((p) => p.id === step._boardPageId);
      if (existingIdx !== -1) {
        this.state.activePageIndex = existingIdx;
        this.progress = forceImmediate ? 1 : 0;
        this._rebuildScene();
        this.onChange?.();
        return;
      }
    }

    let targetPage = curPage;
    if (shouldNewPage) {
      const newPage = {
        id: `b_${Date.now().toString(36)}_${this.state.pages.length + 1}`,
        title: step.title ? String(step.title).slice(0, 30) : `Board ${this.state.pages.length + 1}`,
        cues: [],
        userStrokes: [],
      };
      this.state.pages.push(newPage);
      this.state.activePageIndex = this.state.pages.length - 1;
      targetPage = newPage;
    } else if (!curPage.cues.length && step.title) {
      curPage.title = String(step.title).slice(0, 30);
    }

    step._boardPageId = targetPage.id;
    const incoming = (Array.isArray(step.boardCues) ? step.boardCues : []).map((c) => ({
      ...c,
      _immediate: forceImmediate,
    }));

    const stepTag = `step_${step.stepIndex ?? 0}`;
    const kept = targetPage.cues.filter((c) => c._stepTag !== stepTag);
    targetPage.cues = kept.concat(incoming.map((c) => ({ ...c, _stepTag: stepTag })));
    this.progress = forceImmediate ? 1 : 0;
    this._rebuildScene();
    this.onChange?.();
  }

  addExtraCues(extraCues = [], needsNewBoardPage = false, label = 'Doubt') {
    if (!Array.isArray(extraCues) || !extraCues.length) return;
    if (needsNewBoardPage) {
      const newPg = {
        id: `b_${Date.now().toString(36)}_${this.state.pages.length + 1}`,
        title: `${label} Note`,
        cues: [],
        userStrokes: [],
      };
      this.state.pages.push(newPg);
      this.state.activePageIndex = this.state.pages.length - 1;
    }
    const target = this.state.pages[this.state.activePageIndex];
    const stamped = extraCues.map((c) => ({
      ...c,
      _immediate: true,
      _stepTag: `doubt_${Date.now()}`,
    }));
    target.cues.push(...stamped);
    this.progress = 1;
    this._rebuildScene();
    this.onChange?.();
  }

  attachImageBackdrop() {
    // Intentionally a no-op: vector RoughJS icons & flowcharts keep diagrams unobstructed.
  }

  selectPage(index) {
    if (index >= 0 && index < this.state.pages.length) {
      this.state.activePageIndex = index;
      this.progress = 1;
      this._rebuildScene();
      this.onChange?.();
    }
  }

  addBlankPage() {
    const newPg = {
      id: `b_${Date.now().toString(36)}_${this.state.pages.length + 1}`,
      title: `Board ${this.state.pages.length + 1}`,
      cues: [],
      userStrokes: [],
    };
    this.state.pages.push(newPg);
    this.state.activePageIndex = this.state.pages.length - 1;
    this._rebuildScene();
    this.onChange?.();
  }

  undo() {
    const pg = this.state.pages[this.state.activePageIndex];
    if (!pg) return;
    if (pg.userStrokes.length) {
      const removed = pg.userStrokes.pop();
      this.state.redoStack.push({ type: 'stroke', pageId: pg.id, item: removed });
      this._renderUserStrokes(PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard']);
      this.onChange?.();
    } else if (pg.cues.length && !this.compact) {
      const removed = pg.cues.pop();
      this.state.redoStack.push({ type: 'cue', pageId: pg.id, item: removed });
      this._rebuildScene();
      this.onChange?.();
    }
  }

  redo() {
    const entry = this.state.redoStack.pop();
    if (!entry) return;
    const pg = this.state.pages.find((p) => p.id === entry.pageId) || this.state.pages[this.state.activePageIndex];
    if (!pg) return;
    if (entry.type === 'stroke') {
      pg.userStrokes.push(entry.item);
      this._renderUserStrokes(PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard']);
    } else if (entry.type === 'cue') {
      pg.cues.push(entry.item);
      this._rebuildScene();
    }
    this.onChange?.();
  }

  exportPng(filename = 'sayad_board.png') {
    if (!this.svg) return;
    const prevP = this.progress;
    this._scrubProgress(1);

    const theme = this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard';
    const pal = PALETTES[theme];
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('width', String(LOGICAL_W * 1.6));
    clone.setAttribute('height', String(LOGICAL_H * 1.6));

    const vp = clone.querySelector('#board-viewport');
    if (vp) vp.setAttribute('transform', '');
    const nib = clone.querySelector('#board-nib');
    if (nib) nib.setAttribute('visibility', 'hidden');

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const outW = 1600;
      const outH = 992;
      const cv = document.createElement('canvas');
      cv.width = outW;
      cv.height = outH;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      URL.revokeObjectURL(url);

      const pngUrl = cv.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.toast?.('Saved board PNG image!');
      this._scrubProgress(prevP);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this._scrubProgress(prevP);
      window.toast?.('Could not export board PNG.');
    };
    img.src = url;
  }

  summarizeCurrentBoard() {
    const pg = this.state.pages[this.state.activePageIndex];
    if (!pg) return '';
    return pg.cues
      .map((c) => {
        if (c.nodes) return `${c.type}: ${c.nodes.map((n) => n.title).join(' -> ')}`;
        if (c.branches) return `tree: ${c.root?.title || ''} -> ${c.branches.map((b) => b.title).join(', ')}`;
        return `${c.type}: ${c.text || c.label || c.title || ''}`.trim();
      })
      .filter(Boolean)
      .slice(0, 12)
      .join(' | ');
  }

  exportSerializable() {
    return {
      theme: this.state.theme,
      activePageIndex: this.state.activePageIndex,
      pages: this.state.pages.map((p) => ({
        id: p.id,
        title: p.title,
        cues: p.cues,
        userStrokes: p.userStrokes,
      })),
    };
  }

  _clientToLogical(clientX, clientY) {
    if (!this.svg) return { x: 500, y: 310 };
    const rect = this.svg.getBoundingClientRect();
    const baseScale = Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H);
    const drawnW = LOGICAL_W * baseScale;
    const drawnH = LOGICAL_H * baseScale;
    const viewX0 = rect.left + (rect.width - drawnW) / 2;
    const viewY0 = rect.top + (rect.height - drawnH) / 2;

    const svgX = (clientX - viewX0) / baseScale;
    const svgY = (clientY - viewY0) / baseScale;
    const z = this.state.zoom || 1;
    const cx = LOGICAL_W / 2;
    const cy = LOGICAL_H / 2;
    return {
      x: (svgX - (this.state.panX || 0) - cx * (1 - z)) / z,
      y: (svgY - (this.state.panY || 0) - cy * (1 - z)) / z,
    };
  }

  _bindInteractions() {
    const c = this.host;
    if (!c) return;

    const pal = () => PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard'];

    this._onPointerDown = (e) => {
      if (this.compact && this.state.tool === 'view') return;
      c.setPointerCapture?.(e.pointerId);
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._activePointers.size === 2 && !this.compact) {
        const pts = [...this._activePointers.values()];
        this._pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this._pinchStartZoom = this.state.zoom;
        this._drawingStroke = null;
        return;
      }

      if (this.state.tool === 'pen') {
        const pt = this._clientToLogical(e.clientX, e.clientY);
        const pg = this.state.pages[this.state.activePageIndex];
        this._drawingStroke = { color: this.state.penColor, size: 4, pts: [pt] };
        pg.userStrokes.push(this._drawingStroke);
        this.state.redoStack = [];
        this._renderUserStrokes(pal());
      } else if (this.state.tool === 'eraser') {
        this._eraseAt(e.clientX, e.clientY);
      } else if (!this.compact) {
        this._lastPanPt = { x: e.clientX, y: e.clientY };
      }
    };

    this._onPointerMove = (e) => {
      if (!this._activePointers.has(e.pointerId)) return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._activePointers.size === 2 && !this.compact) {
        const pts = [...this._activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchStartDist > 10) {
          this.state.zoom = Math.max(0.75, Math.min(3.2, this._pinchStartZoom * (dist / this._pinchStartDist)));
          this._applyTransform();
        }
        return;
      }

      if (this.state.tool === 'pen' && this._drawingStroke) {
        const pt = this._clientToLogical(e.clientX, e.clientY);
        this._drawingStroke.pts.push(pt);
        this._renderUserStrokes(pal());
      } else if (this.state.tool === 'eraser' && e.buttons) {
        this._eraseAt(e.clientX, e.clientY);
      } else if (this._lastPanPt && !this.compact) {
        const rect = this.svg?.getBoundingClientRect();
        const scale = rect ? Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H) : 1;
        const dx = (e.clientX - this._lastPanPt.x) / Math.max(0.2, scale);
        const dy = (e.clientY - this._lastPanPt.y) / Math.max(0.2, scale);
        this.state.panX += dx;
        this.state.panY += dy;
        this._lastPanPt = { x: e.clientX, y: e.clientY };
        this._applyTransform();
      }
    };

    this._onPointerUp = (e) => {
      this._activePointers.delete(e.pointerId);
      if (this._drawingStroke) {
        this._drawingStroke = null;
        this.onChange?.();
      }
      this._lastPanPt = null;
    };

    this._onWheel = (e) => {
      if (this.compact) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.state.zoom = Math.max(0.75, Math.min(3.2, this.state.zoom * factor));
      this._applyTransform();
    };

    c.addEventListener('pointerdown', this._onPointerDown);
    c.addEventListener('pointermove', this._onPointerMove);
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _eraseAt(clientX, clientY) {
    const pt = this._clientToLogical(clientX, clientY);
    const pg = this.state.pages[this.state.activePageIndex];
    if (!pg) return;
    const beforeLen = pg.userStrokes.length;
    pg.userStrokes = pg.userStrokes.filter((st) =>
      !st.pts.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 24)
    );
    if (pg.userStrokes.length !== beforeLen) {
      this._renderUserStrokes(PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard']);
      this.onChange?.();
    }
  }

  _unbindInteractions() {
    const c = this.host;
    if (!c) return;
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerUp);
    c.removeEventListener('wheel', this._onWheel);
  }
}

export function renderMiniBoardPreview(hostEl, cues = [], progress = 1, theme = 'whiteboard') {
  if (!hostEl) return;
  const b = new ClassroomBoard(hostEl, { theme }, { compact: true });
  b.setSingleStepCues(cues, false);
  b.setProgress(progress);
  return b;
}
