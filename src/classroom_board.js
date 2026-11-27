// @ts-nocheck
import rough from 'roughjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOGICAL_W = 640;
const LOGICAL_H = 620;
const CX = LOGICAL_W / 2;
const MARGIN_X = 24;
const USABLE_W = LOGICAL_W - MARGIN_X * 2; // 592

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

function resolveColorKey(key, fallback = 'amber') {
  const k = String(key || '').toLowerCase().trim();
  if (k === 'amber' || k === 'teal' || k === 'coral' || k === 'mint') return k;
  return fallback;
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
    lineHeight = 1.25,
    alignTop = false,
  } = opts;
  const lines = wrapWords(text, maxChars).slice(0, maxLines);
  const g = svgEl('g');
  if (!lines.length) return g;
  const stepY = fontSize * lineHeight;
  const startY = alignTop ? cy + fontSize * 0.55 : cy - ((lines.length - 1) * stepY) / 2;
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
function drawShapeNode(rc, cx, cy, w, h, shape, col, fill, seed) {
  const g = svgEl('g');
  const opts = {
    stroke: col,
    strokeWidth: 2.3,
    roughness: 1.2,
    bowing: 1.15,
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
    const isVert = Math.abs(dy) > Math.abs(dx) * 1.4;
    const lx = Math.abs(bend) > 4 ? (x1 + 2 * cpx + x2) / 4 : mx;
    const ly = isVert
      ? (Math.abs(bend) > 4 ? (y1 + 2 * cpy + y2) / 4 : my)
      : (Math.abs(bend) > 4 ? (y1 + 2 * cpy + y2) / 4 : my) - 13;
    const lblTxt = String(label).trim().slice(0, 22);
    const badgeW = Math.max(58, lblTxt.length * 8 + 18);
    const badge = svgEl('rect', {
      x: lx - badgeW / 2,
      y: ly - 11,
      width: badgeW,
      height: 22,
      rx: 6,
      fill: pal.labelBg,
      stroke: col,
      'stroke-width': 1,
      'stroke-opacity': 0.5,
    });
    const t = svgEl('text', {
      x: lx,
      y: ly,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 12.5,
      'font-weight': '700',
      'font-family': '"IBM Plex Sans", sans-serif',
      fill: col,
    });
    t.textContent = lblTxt;
    g.appendChild(badge);
    g.appendChild(t);
  }
  return g;
}

/**
 * Draws a crisp section caption above any macro diagram when cue.title is supplied.
 */
function appendDiagramCaption(g, title, yTop, pal, colorKey) {
  if (!title || !String(title).trim()) return 0;
  const col = getStrokeColor(pal, colorKey || 'amber');
  const t = svgEl('text', {
    x: MARGIN_X,
    y: yTop + 14,
    'text-anchor': 'start',
    'dominant-baseline': 'central',
    'font-size': 16.5,
    'font-weight': '700',
    'font-family': '"IBM Plex Sans", sans-serif',
    'letter-spacing': '0.02em',
    fill: col,
  });
  t.textContent = String(title).trim();
  g.appendChild(t);
  g.appendChild(svgEl('line', {
    x1: MARGIN_X,
    y1: yTop + 28,
    x2: LOGICAL_W - MARGIN_X,
    y2: yTop + 28,
    stroke: pal.border,
    'stroke-width': 1,
    'stroke-dasharray': '4 4',
  }));
  return 36;
}

const RICH_MACRO_TYPES = new Set([
  'flowchart',
  'cycle',
  'tree',
  'comparison',
  'cause_effect',
  'pyramid',
  'matrix',
  'venn',
  'timeline',
  'barchart',
]);

/**
 * Guarantees every step fills the board richly even if an older saved lesson or AI response
 * emitted only 2 bare arrows or minimal text.
 */
function enrichStepBoardCues(rawCues = [], step = null) {
  const input = (Array.isArray(rawCues) ? rawCues : []).filter(
    (c) => c && String(c.type || '').toLowerCase() !== 'imagebackdrop'
  );
  if (!step) return input;

  const out = [];
  const bareArrows = [];

  for (const c of input) {
    const t = String(c.type || '').toLowerCase();
    if ((t === 'arrow' || t === 'curvedarrow' || t === 'processpulse') && c.label) {
      bareArrows.push(c);
    } else {
      out.push(c);
    }
  }

  // Upgrade bare labeled arrows (e.g. legacy 2-arrow steps) into a full-width flowchart
  if (bareArrows.length >= 2 && !out.some((c) => RICH_MACRO_TYPES.has(String(c.type || '').toLowerCase()))) {
    const icons = ['bulb', 'gear', 'leaf', 'book'];
    const palette = ['amber', 'teal', 'coral', 'mint'];
    out.push({
      type: 'flowchart',
      atProgress: 0.14,
      title: step.conceptTag || 'Key Process Steps',
      direction: bareArrows.length <= 3 ? 'row' : 'col',
      nodes: bareArrows.slice(0, 6).map((a, idx) => ({
        title: String(a.label || `Part ${idx + 1}`),
        sub: a.sublabel || '',
        shape: idx === 0 ? 'pill' : 'box',
        color: resolveColorKey(a.color, palette[idx % 4]),
        icon: icons[idx % 4],
      })),
    });
  } else if (bareArrows.length === 1) {
    out.push(bareArrows[0]);
  }

  const hasTitle = out.some((c) => String(c.type || '').toLowerCase() === 'title');
  if (!hasTitle && step.title) {
    out.unshift({
      type: 'title',
      atProgress: 0,
      text: step.title,
      sublabel: step.conceptTag || '',
      color: 'amber',
    });
  }

  const hasMacro = out.some((c) => RICH_MACRO_TYPES.has(String(c.type || '').toLowerCase()));
  if (!hasMacro) {
    const terms = Array.isArray(step.keyTerms) ? step.keyTerms.filter(Boolean) : [];
    const palette = ['teal', 'amber', 'mint', 'coral'];
    const icons = ['bulb', 'gear', 'book', 'leaf'];
    if (terms.length >= 2) {
      out.push({
        type: 'tree',
        atProgress: 0.14,
        title: 'Concept Breakdown',
        root: {
          title: String(step.title || 'Core Idea').slice(0, 32),
          sub: step.conceptTag || '',
          color: 'amber',
          icon: 'bulb',
        },
        branches: terms.slice(0, 4).map((t, idx) => ({
          title: String(t).slice(0, 30),
          sub: 'Key Concept',
          color: palette[idx % 4],
          icon: icons[idx % 4],
        })),
      });
    } else if (step.spokenText) {
      const clauses = String(step.spokenText)
        .split(/(?<=[.!?।])\s+|,\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 16)
        .slice(0, 4);
      if (clauses.length >= 2) {
        out.push({
          type: 'flowchart',
          atProgress: 0.14,
          title: step.conceptTag || 'Key Process Flow',
          direction: 'row',
          nodes: clauses.map((cl, idx) => ({
            title: cl.split(/\s+/).slice(0, 4).join(' ').slice(0, 26),
            sub: cl.slice(0, 44),
            shape: idx === 0 ? 'pill' : idx === clauses.length - 1 ? 'cloud' : 'box',
            color: palette[idx % 4],
            icon: icons[idx % 4],
          })),
        });
      }
    }
  }

  const hasEquation = out.some((c) => String(c.type || '').toLowerCase() === 'equation');
  if (!hasEquation && step.keyFormula && String(step.keyFormula).trim()) {
    out.push({
      type: 'equation',
      atProgress: 0.56,
      text: String(step.keyFormula).trim(),
      color: 'amber',
    });
  }

  const hasCallout = out.some((c) => String(c.type || '').toLowerCase() === 'callout');
  if (!hasCallout && step.realLifeExample && String(step.realLifeExample).trim()) {
    out.push({
      type: 'callout',
      atProgress: 0.68,
      label: 'Real-Life Example',
      icon: 'globe',
      text: String(step.realLifeExample).trim(),
      color: 'teal',
    });
  }

  const bulletCount = out.filter((c) => String(c.type || '').toLowerCase() === 'bullet').length;
  if (bulletCount < 2 && step.spokenText) {
    const sentences = String(step.spokenText)
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 22 && s.length <= 165);
    const needed = Math.min(2 - bulletCount, sentences.length);
    for (let i = 0; i < needed; i++) {
      out.push({
        type: 'bullet',
        atProgress: 0.78 + i * 0.08,
        text: sentences[i],
        color: ['teal', 'mint', 'amber'][i % 3],
      });
    }
  }

  return out;
}

/**
 * Vertical Flow-Stack Layout Engine:
 * Measures exact dynamic height of EVERY cue and assigns guaranteed non-overlapping _layoutY & _layoutH.
 */
function layoutBoardCues(rawCues = [], topPad = 30) {
  const clean = (Array.isArray(rawCues) ? rawCues : []).filter(
    (c) => c && String(c.type || '').toLowerCase() !== 'imagebackdrop'
  );

  // Inject clean divider banners when consecutive different steps or doubts stack onto one scrollable board
  const sequenced = [];
  let prevTag = null;
  for (const cue of clean) {
    const tag = cue._stepTag || null;
    if (tag && prevTag && tag !== prevTag && String(cue.type || '').toLowerCase() !== 'divider') {
      const label = tag.startsWith('doubt_')
        ? 'Doubt Clarification'
        : tag.startsWith('step_')
        ? `Concept ${Number(tag.slice(5)) + 1}`
        : '';
      sequenced.push({
        type: 'divider',
        label,
        atProgress: 0,
        _immediate: Boolean(cue._immediate),
        _stepTag: tag,
      });
    }
    sequenced.push(cue);
    if (tag) prevTag = tag;
  }

  let cursorY = topPad;
  let lastAxesBox = null;
  let rowBoxEndX = 0;
  let rowBoxTopY = 0;
  let rowBoxMaxH = 0;

  const out = [];

  for (let idx = 0; idx < sequenced.length; idx++) {
    const raw = sequenced[idx];
    const nextRaw = sequenced[idx + 1];
    const cue = { ...raw };
    const type = String(cue.type || 'box').toLowerCase();

    if (type !== 'box' && type !== 'circle' && type !== 'ellipse' && rowBoxMaxH > 0) {
      cursorY = Math.max(cursorY, rowBoxTopY + rowBoxMaxH + 22);
      rowBoxEndX = 0;
      rowBoxTopY = 0;
      rowBoxMaxH = 0;
    }

    const hasCaption = Boolean(cue.title) && type !== 'title' && type !== 'callout' && (type !== 'tree' || Boolean(cue.root));
    const capH = hasCaption ? 36 : 0;

    if (type === 'title') {
      const tLines = Math.max(1, wrapWords(cue.text || '', 28).slice(0, 2).length);
      const subText = cue.sublabel || cue.subtitle || '';
      const sLines = subText ? wrapWords(subText, 50).slice(0, 2).length : 0;
      const h = 38 + (tLines - 1) * 38 + (sLines ? 22 + sLines * 20 : 8) + 12;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 20;
      out.push(cue);
      continue;
    }

    if (type === 'divider') {
      const h = 36;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 18;
      out.push(cue);
      continue;
    }

    if (type === 'flowchart') {
      const nodes = Array.isArray(cue.nodes) ? cue.nodes.slice(0, 6) : [];
      const n = nodes.length;
      if (!n) continue;
      const isCol = cue.direction === 'col' && n <= 4;
      let bodyH = 172;
      if (isCol) {
        const cardH = 102;
        const gapY = 42;
        bodyH = n * cardH + Math.max(0, n - 1) * gapY + 14;
      } else if (n <= 3) {
        bodyH = 172;
      } else {
        bodyH = 152 + 64 + 152 + 14;
      }
      const h = capH + bodyH;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'cycle') {
      const h = capH + 404;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'tree') {
      const branches = Array.isArray(cue.branches) ? cue.branches.slice(0, 5) : [];
      const n = Math.max(1, branches.length);
      const gapX = n >= 4 ? 14 : 20;
      const bw = Math.min(250, Math.floor((USABLE_W - (n - 1) * gapX) / n));
      let maxSubLines = 1;
      branches.forEach((b) => {
        const s = b.sub || b.sublabel || '';
        if (s) {
          maxSubLines = Math.max(maxSubLines, wrapWords(s, Math.max(9, Math.floor(bw / 8.5))).slice(0, 3).length);
        }
      });
      const bh = 112 + maxSubLines * 19;
      const h = capH + 6 + 94 + 68 + bh + 18;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cue._treeBH = bh;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'comparison') {
      const lPts = (cue.left?.points || []).slice(0, 5);
      const rPts = (cue.right?.points || []).slice(0, 5);
      const measureCol = (pts) => {
        let sum = 0;
        pts.forEach((pt) => {
          const lines = Math.max(1, wrapWords(`• ${pt}`, 24).slice(0, 3).length);
          sum += lines * 22 + 14;
        });
        return sum;
      };
      const contentH = Math.max(120, measureCol(lPts), measureCol(rPts));
      const boxH = 74 + contentH + 20;
      const h = capH + boxH + 10;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cue._compBoxH = boxH;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'cause_effect') {
      const pairs = Array.isArray(cue.pairs) ? cue.pairs.slice(0, 4) : [];
      if (!pairs.length) continue;
      let totalH = 0;
      const rowHeights = pairs.map((pr) => {
        const cLines = Math.max(1, wrapWords(pr.cause || '', 18).slice(0, 3).length);
        const eLines = Math.max(1, wrapWords(pr.effect || '', 18).slice(0, 3).length);
        const rh = Math.max(82, Math.max(cLines, eLines) * 21 + 38);
        totalH += rh + 18;
        return rh;
      });
      const h = capH + Math.max(84, totalH - 10);
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cue._rowHeights = rowHeights;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'pyramid') {
      const tiers = Array.isArray(cue.tiers || cue.levels) ? (cue.tiers || cue.levels).slice(0, 5) : [];
      if (!tiers.length) continue;
      const tierH = tiers.length >= 5 ? 64 : 72;
      const gap = 8;
      const h = capH + tiers.length * tierH + (tiers.length - 1) * gap + 14;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cue._tierH = tierH;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'matrix') {
      const headers = Array.isArray(cue.headers) ? cue.headers.slice(0, 4) : ['Topic', 'Details'];
      const rows = Array.isArray(cue.rows) ? cue.rows.slice(0, 6) : [];
      const colW = Math.floor(USABLE_W / Math.max(2, headers.length));
      const maxChars = Math.max(9, Math.floor(colW / 9.2));
      const rowHeights = rows.map((r) => {
        const cells = Array.isArray(r) ? r : [String(r)];
        let maxL = 1;
        cells.forEach((c) => {
          maxL = Math.max(maxL, wrapWords(String(c || ''), maxChars).slice(0, 3).length);
        });
        return Math.max(48, maxL * 20 + 22);
      });
      const bodyH = 50 + rowHeights.reduce((a, b) => a + b, 0);
      const h = capH + bodyH + 10;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cue._rowHeights = rowHeights;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'callout') {
      const bodyLines = Math.max(1, wrapWords(cue.text || cue.sublabel || '', 46).slice(0, 6).length);
      const hasBadge = Boolean(cue.label || cue.title || cue.badge);
      const h = (hasBadge ? 48 : 22) + bodyLines * 26 + 20;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 22;
      out.push(cue);
      continue;
    }

    if (type === 'venn') {
      const h = capH + 308;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'timeline') {
      const h = capH + 346;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'barchart') {
      const h = capH + 328;
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 24;
      out.push(cue);
      continue;
    }

    if (type === 'axes') {
      const box = { x: 76, y: cursorY + capH + 12, w: LOGICAL_W - 124, h: 236 };
      lastAxesBox = box;
      cue._axesBox = box;
      cue._layoutY = cursorY;
      cue._layoutH = capH + 284;
      cursorY += cue._layoutH + 24;
      out.push(cue);
      continue;
    }

    if (type === 'curve') {
      if (lastAxesBox) {
        cue._axesBox = lastAxesBox;
        cue._layoutY = lastAxesBox.y;
        cue._layoutH = lastAxesBox.h;
      } else {
        const box = { x: 76, y: cursorY + 12, w: LOGICAL_W - 124, h: 224 };
        lastAxesBox = box;
        cue._axesBox = box;
        cue._layoutY = cursorY;
        cue._layoutH = 260;
        cursorY += 284;
      }
      out.push(cue);
      continue;
    }

    if (type === 'equation') {
      const eqLines = Math.max(1, wrapWords(cue.text || '', 38).slice(0, 2).length);
      const h = Math.max(60, eqLines * 27 + 30);
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 22;
      out.push(cue);
      continue;
    }

    if (type === 'bullet') {
      const lines = Math.max(1, wrapWords(cue.text || '', 42).slice(0, 5).length);
      const h = Math.max(46, lines * 28 + 16);
      cue._layoutY = cursorY;
      cue._layoutH = h;
      cursorY += h + 16;
      out.push(cue);
      continue;
    }

    if (type === 'box') {
      const nextIsBox = nextRaw && String(nextRaw.type || '').toLowerCase() === 'box' && (!nextRaw._stepTag || nextRaw._stepTag === cue._stepTag);
      const pairW = Math.floor((USABLE_W - 20) / 2);
      const canPairNext = rowBoxMaxH === 0 && nextIsBox;
      const joinsPrev = rowBoxMaxH > 0 && rowBoxEndX + 20 + pairW <= LOGICAL_W - MARGIN_X;
      const w = (canPairNext || joinsPrev) ? pairW : USABLE_W;
      const subLines = cue.sublabel ? wrapWords(cue.sublabel, Math.max(14, Math.floor(w / 9.5))).slice(0, 4).length : 0;
      const tLines = wrapWords(cue.text || '', Math.max(12, Math.floor(w / 10.5))).slice(0, 2).length;
      const h = Math.max(96, Math.min(200, cue.h ?? (44 + tLines * 24 + subLines * 20)));
      if (joinsPrev) {
        cue._layoutX = rowBoxEndX + 20;
        cue._layoutY = rowBoxTopY;
        rowBoxEndX = cue._layoutX + w;
        rowBoxMaxH = Math.max(rowBoxMaxH, h);
        cursorY = Math.max(cursorY, rowBoxTopY + rowBoxMaxH + 22);
      } else {
        if (rowBoxMaxH > 0) cursorY = Math.max(cursorY, rowBoxTopY + rowBoxMaxH + 22);
        cue._layoutX = MARGIN_X;
        cue._layoutY = cursorY;
        rowBoxEndX = MARGIN_X + w;
        rowBoxTopY = cursorY;
        rowBoxMaxH = h;
        cursorY += h + 22;
      }
      cue._layoutW = w;
      cue._layoutH = h;
      out.push(cue);
      continue;
    }

    if (type === 'circle' || type === 'ellipse') {
      const r = Math.max(46, Math.min(92, cue.r ?? 64));
      const d = r * 2;
      if (rowBoxMaxH > 0 && rowBoxEndX + 26 + d <= LOGICAL_W - MARGIN_X) {
        cue._layoutX = rowBoxEndX + 26 + r;
        cue._layoutY = rowBoxTopY + r;
        rowBoxEndX = cue._layoutX + r;
        rowBoxMaxH = Math.max(rowBoxMaxH, d);
        cursorY = Math.max(cursorY, rowBoxTopY + rowBoxMaxH + 22);
      } else {
        if (rowBoxMaxH > 0) cursorY = Math.max(cursorY, rowBoxTopY + rowBoxMaxH + 22);
        cue._layoutX = CX;
        cue._layoutY = cursorY + r;
        rowBoxEndX = CX + r;
        rowBoxTopY = cursorY;
        rowBoxMaxH = d;
        cursorY += d + 24;
      }
      cue._layoutR = r;
      out.push(cue);
      continue;
    }

    if (type === 'arrow' || type === 'curvedarrow' || type === 'processpulse') {
      cue._layoutY = cursorY;
      cue._layoutH = 44;
      cursorY += 54;
      out.push(cue);
      continue;
    }

    if (type === 'highlight') {
      if (cue.w && cue.h) out.push(cue);
      continue;
    }

    out.push(cue);
  }

  return { cues: out, contentH: Math.max(LOGICAL_H, Math.ceil(cursorY + 42)) };
}

/**
 * Registers an SVG group's animatable paths (stroke-dashoffset) & text clips (`clipPath` reveal)
 * into a flat scrubbed timeline array `tracks[]` so progress `0..1` animates them progressively.
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
      const estW = Math.max(90, txtLen * fs * 0.68 + 40);
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

function buildCueElements(rc, svgDefs, cue, pal, theme, bulletOrdinal) {
  const g = svgEl('g');
  const col = getStrokeColor(pal, cue.color);
  const fill = getHachureFill(pal, cue.color);
  const seed = hashSeed(`${cue.type}_${cue.text || cue.title || bulletOrdinal}_${cue._layoutY || 0}`);
  const type = String(cue.type || 'box').toLowerCase();
  const baseY = cue._layoutY ?? 34;

  if (type === 'title') {
    const x = MARGIN_X;
    const titleStr = String(cue.text || '');
    const tLines = wrapWords(titleStr, 28).slice(0, 2);
    tLines.forEach((ln, idx) => {
      const t = svgEl('text', {
        x,
        y: baseY + 26 + idx * 38,
        'text-anchor': 'start',
        'font-size': 33,
        'font-weight': '700',
        'font-family': '"Caveat", "Fraunces", Georgia, serif',
        fill: pal.cream,
      });
      t.textContent = ln;
      g.appendChild(t);
    });

    const lineY = baseY + 38 + (tLines.length - 1) * 38;
    const longestLen = Math.max(12, ...tLines.map((l) => l.length));
    const estW = Math.max(180, Math.min(USABLE_W, longestLen * 17 + 24));
    const uCol = cue.color === 'teal' || cue.color === 'coral' ? col : pal.amber;
    g.appendChild(rc.line(x, lineY, x + estW, lineY, {
      stroke: uCol,
      strokeWidth: 3.2,
      roughness: 1.3,
      seed,
    }));

    const subStr = cue.sublabel || cue.subtitle || '';
    if (subStr) {
      g.appendChild(createTextBlock(subStr, x, lineY + 18, {
        anchor: 'start',
        fontSize: 15,
        fontWeight: '600',
        fontFamily: '"IBM Plex Mono", monospace',
        fill: pal.muted,
        maxChars: 50,
        maxLines: 2,
        alignTop: true,
      }));
    }
    return g;
  }

  if (type === 'divider') {
    const midY = baseY + 18;
    g.appendChild(rc.line(MARGIN_X, midY, LOGICAL_W - MARGIN_X, midY, {
      stroke: pal.border,
      strokeWidth: 1.6,
      roughness: 1.1,
      seed,
    }));
    if (cue.label) {
      const lbl = String(cue.label);
      const pw = Math.max(120, lbl.length * 8.5 + 28);
      g.appendChild(svgEl('rect', {
        x: CX - pw / 2,
        y: midY - 12,
        width: pw,
        height: 24,
        rx: 7,
        fill: pal.labelBg,
        stroke: pal.amber,
        'stroke-width': 1.2,
        'stroke-opacity': 0.6,
      }));
      const txt = svgEl('text', {
        x: CX,
        y: midY,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': 12.5,
        'font-weight': '700',
        'font-family': '"IBM Plex Mono", monospace',
        fill: pal.amber,
      });
      txt.textContent = lbl;
      g.appendChild(txt);
    }
    return g;
  }

  if (type === 'flowchart') {
    const nodes = Array.isArray(cue.nodes) ? cue.nodes.slice(0, 6) : [];
    const edges = Array.isArray(cue.edges) ? cue.edges : [];
    const n = nodes.length;
    if (!n) return g;

    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const startAreaY = baseY + yOff;
    const isCol = cue.direction === 'col' && n <= 4;
    const positions = [];

    if (isCol) {
      const cardW = USABLE_W - 24;
      const cardH = 102;
      const gapY = 42;
      nodes.forEach((nd, i) => {
        positions.push({ cx: CX, cy: startAreaY + i * (cardH + gapY) + cardH / 2 + 6, w: cardW, h: cardH, row: i });
      });
    } else if (n <= 3) {
      const gapX = 28;
      const cardW = Math.floor((USABLE_W - (n - 1) * gapX) / n);
      const cardH = 158;
      const totalW = n * cardW + (n - 1) * gapX;
      const startX = (LOGICAL_W - totalW) / 2;
      const cy = startAreaY + cardH / 2 + 8;
      nodes.forEach((nd, i) => {
        positions.push({ cx: startX + i * (cardW + gapX) + cardW / 2, cy, w: cardW, h: cardH, row: 0 });
      });
    } else {
      const topCount = Math.ceil(n / 2);
      const botCount = n - topCount;
      const maxCols = Math.max(topCount, botCount);
      const gapX = 26;
      const cardW = Math.floor((USABLE_W - (maxCols - 1) * gapX) / maxCols);
      const cardH = 146;
      const rowGap = 64;

      const topTotalW = topCount * cardW + (topCount - 1) * gapX;
      const topStartX = (LOGICAL_W - topTotalW) / 2;
      const row1CY = startAreaY + cardH / 2 + 8;
      const row2CY = row1CY + cardH + rowGap;

      for (let i = 0; i < topCount; i++) {
        positions.push({ cx: topStartX + i * (cardW + gapX) + cardW / 2, cy: row1CY, w: cardW, h: cardH, row: 0 });
      }
      const botTotalW = botCount * cardW + (botCount - 1) * gapX;
      const rightEdgeX = topStartX + topTotalW;
      const botStartX = rightEdgeX - botTotalW;
      for (let j = 0; j < botCount; j++) {
        const revIdx = botCount - 1 - j;
        positions.push({ cx: botStartX + revIdx * (cardW + gapX) + cardW / 2, cy: row2CY, w: cardW, h: cardH, row: 1 });
      }
    }

    nodes.forEach((nd, i) => {
      const pos = positions[i];
      const ck = resolveColorKey(nd.color, ['amber', 'teal', 'coral', 'mint'][i % 4]);
      const nCol = getStrokeColor(pal, ck);
      const nFill = getHachureFill(pal, ck);
      g.appendChild(drawShapeNode(rc, pos.cx, pos.cy, pos.w, pos.h, nd.shape || 'box', nCol, nFill, seed + i * 7));

      let textOffsetY = 0;
      if (nd.icon) {
        g.appendChild(buildVectorIcon(rc, nd.icon, pos.cx, pos.cy - pos.h * 0.25, 34, nCol, pal.cream, seed + i * 13));
        textOffsetY = 17;
      }

      const subText = nd.sub || nd.sublabel || '';
      g.appendChild(createTextBlock(nd.title || `Step ${i + 1}`, pos.cx, pos.cy + textOffsetY - (subText ? 13 : 0), {
        fontSize: n >= 4 ? 16 : 18,
        fill: nCol,
        maxChars: Math.max(11, Math.floor(pos.w / 10.5)),
        maxLines: 2,
      }));
      if (subText) {
        g.appendChild(createTextBlock(subText, pos.cx, pos.cy + textOffsetY + 21, {
          fontSize: 13.5,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: Math.max(12, Math.floor(pos.w / 9.2)),
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
      } else if (a.row !== b.row) {
        const x1 = a.cx;
        const y1 = a.cy + a.h / 2 + 5;
        const x2 = b.cx;
        const y2 = b.cy - b.h / 2 - 5;
        g.appendChild(drawRoughArrow(rc, x1, y1, x2, y2, eCol, ed.label, pal, seed + idx * 19, Math.abs(x2 - x1) < 12 ? 0 : 18));
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

    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const cx = CX;
    const cy = baseY + yOff + 200;
    const rx = 188;
    const ry = 144;

    if (cue.centerTitle) {
      g.appendChild(rc.circle(cx, cy, 122, {
        stroke: pal.amber,
        strokeWidth: 2,
        roughness: 1.2,
        seed,
        fill: pal.fillAmber,
        fillStyle: 'hachure',
        hachureGap: 7,
      }));
      g.appendChild(createTextBlock(cue.centerTitle, cx, cy, {
        fontSize: 16,
        fill: pal.cream,
        maxChars: 12,
        maxLines: 2,
      }));
    }

    const pts = nodes.map((nd, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return {
        nd,
        x: cx + Math.cos(ang) * rx,
        y: cy + Math.sin(ang) * ry,
      };
    });

    pts.forEach((p, i) => {
      const ck = resolveColorKey(p.nd.color, ['amber', 'teal', 'coral', 'mint'][i % 4]);
      const nCol = getStrokeColor(pal, ck);
      const nFill = getHachureFill(pal, ck);
      g.appendChild(drawShapeNode(rc, p.x, p.y, 172, 84, 'pill', nCol, nFill, seed + i * 9));
      if (p.nd.icon) {
        g.appendChild(buildVectorIcon(rc, p.nd.icon, p.x - 56, p.y, 30, nCol, pal.cream, seed + i * 5));
      }
      const tx = p.nd.icon ? p.x + 14 : p.x;
      const subText = p.nd.sub || p.nd.sublabel || '';
      g.appendChild(createTextBlock(p.nd.title || `Stage ${i + 1}`, tx, p.y - (subText ? 10 : 0), {
        fontSize: 15,
        fill: nCol,
        maxChars: 13,
        maxLines: 1,
      }));
      if (subText) {
        g.appendChild(createTextBlock(subText, tx, p.y + 13, {
          fontSize: 12.5,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: 14,
          maxLines: 1,
        }));
      }
    });

    pts.forEach((a, i) => {
      const b = pts[(i + 1) % n];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const x1 = a.x + Math.cos(ang) * 78 * 0.72;
      const y1 = a.y + Math.sin(ang) * 78 * 0.45;
      const x2 = b.x - Math.cos(ang) * 78 * 0.72;
      const y2 = b.y - Math.sin(ang) * 78 * 0.45;
      g.appendChild(drawRoughArrow(rc, x1, y1, x2, y2, pal.muted, '', pal, seed + i * 17, 20));
    });

    return g;
  }

  if (type === 'tree') {
    const root = cue.root || { title: cue.title || 'Core Concept', sub: cue.sub || '' };
    const branches = Array.isArray(cue.branches) ? cue.branches.slice(0, 5) : [];
    const n = branches.length || 1;
    const yOff = cue.root ? appendDiagramCaption(g, cue.title, baseY, pal, cue.color) : 0;

    const rW = 300;
    const rH = 94;
    const rx = CX;
    const ry = baseY + yOff + rH / 2 + 6;
    const rKey = resolveColorKey(root.color, 'amber');
    const rCol = getStrokeColor(pal, rKey);
    const rFill = getHachureFill(pal, rKey);

    g.appendChild(drawShapeNode(rc, rx, ry, rW, rH, root.shape || 'box', rCol, rFill, seed));
    if (root.icon) {
      g.appendChild(buildVectorIcon(rc, root.icon, rx - 104, ry, 36, rCol, pal.cream, seed + 3));
    }
    const rtx = root.icon ? rx + 18 : rx;
    const rootSub = root.sub || root.sublabel || '';
    g.appendChild(createTextBlock(root.title || 'Concept', rtx, ry - (rootSub ? 11 : 0), {
      fontSize: 18,
      fill: rCol,
      maxChars: 19,
      maxLines: 2,
    }));
    if (rootSub) {
      g.appendChild(createTextBlock(rootSub, rtx, ry + 16, {
        fontSize: 13.5,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: 22,
        maxLines: 1,
      }));
    }

    const gapX = n >= 4 ? 14 : 20;
    const bw = Math.min(250, Math.floor((USABLE_W - (n - 1) * gapX) / n));
    const bh = cue._treeBH || 144;
    const totalW = n * bw + (n - 1) * gapX;
    const startX = (LOGICAL_W - totalW) / 2;
    const by = ry + rH / 2 + 68 + bh / 2;

    branches.forEach((br, i) => {
      const bx = startX + i * (bw + gapX) + bw / 2;
      const bKey = resolveColorKey(br.color, ['teal', 'coral', 'mint', 'amber'][i % 4]);
      const bCol = getStrokeColor(pal, bKey);
      const bFill = getHachureFill(pal, bKey);

      const midY = (ry + rH / 2 + by - bh / 2) / 2;
      g.appendChild(rc.path(`M ${rx} ${ry + rH / 2} C ${rx} ${midY}, ${bx} ${midY}, ${bx} ${by - bh / 2 - 4}`, {
        stroke: bCol,
        strokeWidth: 2.3,
        roughness: 1.15,
        seed: seed + i * 11,
      }));

      g.appendChild(drawShapeNode(rc, bx, by, bw, bh, br.shape || 'box', bCol, bFill, seed + i * 13));
      let ty = 0;
      if (br.icon) {
        g.appendChild(buildVectorIcon(rc, br.icon, bx, by - bh * 0.25, 30, bCol, pal.cream, seed + i * 19));
        ty = 17;
      }
      const brSub = br.sub || br.sublabel || '';
      g.appendChild(createTextBlock(br.title || '', bx, by + ty - (brSub ? 14 : 0), {
        fontSize: n >= 4 ? 14.5 : 16.5,
        fill: bCol,
        maxChars: Math.max(9, Math.floor(bw / 10)),
        maxLines: 2,
      }));
      if (brSub) {
        g.appendChild(createTextBlock(brSub, bx, by + ty + 19, {
          fontSize: 13,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: Math.max(9, Math.floor(bw / 8.5)),
          maxLines: 3,
        }));
      }
    });

    return g;
  }

  if (type === 'comparison') {
    const left = cue.left || { title: 'Side A', points: [], color: 'amber' };
    const right = cue.right || { title: 'Side B', points: [], color: 'teal' };
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const lKey = resolveColorKey(left.color, 'amber');
    const rKey = resolveColorKey(right.color, 'teal');
    const lCol = getStrokeColor(pal, lKey);
    const rCol = getStrokeColor(pal, rKey);

    const boxW = Math.floor((USABLE_W - 28) / 2); // 282
    const leftCX = MARGIN_X + boxW / 2; // 165
    const rightCX = LOGICAL_W - MARGIN_X - boxW / 2; // 475
    const boxH = cue._compBoxH || 300;
    const topY = baseY + yOff + 8;
    const cy = topY + boxH / 2;

    g.appendChild(drawShapeNode(rc, leftCX, cy, boxW, boxH, 'box', lCol, getHachureFill(pal, lKey), seed + 1));
    g.appendChild(drawShapeNode(rc, rightCX, cy, boxW, boxH, 'box', rCol, getHachureFill(pal, rKey), seed + 2));

    g.appendChild(createTextBlock(left.title || 'Column A', leftCX, topY + 32, { fontSize: 18.5, fill: lCol, maxChars: 18, maxLines: 1 }));
    g.appendChild(rc.line(leftCX - (boxW / 2 - 16), topY + 56, leftCX + (boxW / 2 - 16), topY + 56, { stroke: lCol, strokeWidth: 2, seed }));
    g.appendChild(createTextBlock(right.title || 'Column B', rightCX, topY + 32, { fontSize: 18.5, fill: rCol, maxChars: 18, maxLines: 1 }));
    g.appendChild(rc.line(rightCX - (boxW / 2 - 16), topY + 56, rightCX + (boxW / 2 - 16), topY + 56, { stroke: rCol, strokeWidth: 2, seed: seed + 5 }));

    const drawColPts = (pts, startX) => {
      let py = topY + 74;
      (pts || []).slice(0, 5).forEach((pt) => {
        const lines = wrapWords(`• ${pt}`, 24).slice(0, 3);
        g.appendChild(createTextBlock(`• ${pt}`, startX, py, {
          anchor: 'start',
          fontSize: 15.5,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: 24,
          maxLines: 3,
          alignTop: true,
        }));
        py += Math.max(1, lines.length) * 22 + 14;
      });
    };
    drawColPts(left.points, MARGIN_X + 16);
    drawColPts(right.points, rightCX - boxW / 2 + 16);

    g.appendChild(rc.circle(CX, cy, 44, { stroke: pal.coral, strokeWidth: 2.2, fill: pal.labelBg, fillStyle: 'solid', seed: seed + 9 }));
    g.appendChild(createTextBlock('VS', CX, cy, { fontSize: 15, fill: pal.coral }));
    return g;
  }

  if (type === 'cause_effect') {
    const pairs = Array.isArray(cue.pairs) ? cue.pairs.slice(0, 4) : [];
    if (!pairs.length) return g;
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    let ry = baseY + yOff + 8;
    const rowHeights = cue._rowHeights || pairs.map(() => 92);
    const cardW = 212;
    const causeCX = MARGIN_X + cardW / 2;
    const effectCX = LOGICAL_W - MARGIN_X - cardW / 2;

    pairs.forEach((pr, idx) => {
      const rh = rowHeights[idx] || 92;
      const cy = ry + rh / 2;
      const cKey = resolveColorKey(pr.causeColor, 'amber');
      const eKey = resolveColorKey(pr.effectColor, 'teal');
      const cCol = getStrokeColor(pal, cKey);
      const eCol = getStrokeColor(pal, eKey);

      g.appendChild(drawShapeNode(rc, causeCX, cy, cardW, rh, 'box', cCol, getHachureFill(pal, cKey), seed + idx * 7));
      g.appendChild(createTextBlock(pr.cause || 'Cause', causeCX, cy, {
        fontSize: 15,
        fill: pal.cream,
        maxChars: 18,
        maxLines: 3,
      }));

      g.appendChild(drawRoughArrow(rc, causeCX + cardW / 2 + 6, cy, effectCX - cardW / 2 - 6, cy, pal.coral, pr.via || 'leads to', pal, seed + idx * 13, 0));

      g.appendChild(drawShapeNode(rc, effectCX, cy, cardW, rh, 'pill', eCol, getHachureFill(pal, eKey), seed + idx * 11));
      g.appendChild(createTextBlock(pr.effect || 'Effect', effectCX, cy, {
        fontSize: 15,
        fill: eCol,
        maxChars: 18,
        maxLines: 3,
      }));

      ry += rh + 18;
    });
    return g;
  }

  if (type === 'pyramid') {
    const tiers = Array.isArray(cue.tiers || cue.levels) ? (cue.tiers || cue.levels).slice(0, 5) : [];
    if (!tiers.length) return g;
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const n = tiers.length;
    const tierH = cue._tierH || 70;
    const gap = 8;
    const minW = 210;
    const maxW = USABLE_W;
    let ty = baseY + yOff + 8;

    tiers.forEach((tr, idx) => {
      const topFrac = idx / n;
      const botFrac = (idx + 1) / n;
      const wTop = minW + (maxW - minW) * topFrac;
      const wBot = minW + (maxW - minW) * botFrac;
      const ck = resolveColorKey(tr.color, ['coral', 'amber', 'teal', 'mint'][idx % 4]);
      const tCol = getStrokeColor(pal, ck);
      const tFill = getHachureFill(pal, ck);

      g.appendChild(rc.polygon([
        [CX - wTop / 2, ty],
        [CX + wTop / 2, ty],
        [CX + wBot / 2, ty + tierH],
        [CX - wBot / 2, ty + tierH],
      ], {
        stroke: tCol,
        strokeWidth: 2.3,
        roughness: 1.15,
        seed: seed + idx * 9,
        fill: tFill,
        fillStyle: 'hachure',
        hachureGap: 6.5,
      }));

      const titleStr = tr.title || tr.label || `Level ${idx + 1}`;
      const subStr = tr.sub || tr.sublabel || '';
      const midTierY = ty + tierH / 2;
      const maxC = Math.max(14, Math.floor(((wTop + wBot) / 2) / 10.5));
      g.appendChild(createTextBlock(titleStr, CX, midTierY - (subStr ? 11 : 0), {
        fontSize: 17,
        fill: tCol,
        maxChars: maxC,
        maxLines: 1,
      }));
      if (subStr) {
        g.appendChild(createTextBlock(subStr, CX, midTierY + 13, {
          fontSize: 13.5,
          fontWeight: '500',
          fill: pal.cream,
          maxChars: maxC + 6,
          maxLines: 1,
        }));
      }
      ty += tierH + gap;
    });
    return g;
  }

  if (type === 'matrix') {
    const headers = Array.isArray(cue.headers) ? cue.headers.slice(0, 4) : ['Feature', 'Details'];
    const rows = Array.isArray(cue.rows) ? cue.rows.slice(0, 6) : [];
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const cols = Math.max(2, headers.length);
    const tableX = MARGIN_X;
    const tableW = USABLE_W;
    const colW = tableW / cols;
    const headH = 50;
    const rowHeights = cue._rowHeights || rows.map(() => 54);
    const totalH = headH + rowHeights.reduce((a, b) => a + b, 0);
    const topY = baseY + yOff + 8;

    g.appendChild(rc.rectangle(tableX, topY, tableW, headH, {
      stroke: pal.amber,
      strokeWidth: 2,
      roughness: 1.0,
      seed,
      fill: pal.fillAmber,
      fillStyle: 'hachure',
      hachureGap: 7,
    }));
    g.appendChild(rc.rectangle(tableX, topY, tableW, totalH, {
      stroke: pal.cream,
      strokeWidth: 2.2,
      roughness: 1.05,
      seed: seed + 1,
    }));

    headers.forEach((hdr, cIdx) => {
      const cx = tableX + cIdx * colW + colW / 2;
      if (cIdx > 0) {
        g.appendChild(rc.line(tableX + cIdx * colW, topY, tableX + cIdx * colW, topY + totalH, {
          stroke: pal.border,
          strokeWidth: 1.5,
          roughness: 0.9,
          seed: seed + 10 + cIdx,
        }));
      }
      g.appendChild(createTextBlock(String(hdr), cx, topY + headH / 2, {
        fontSize: 16,
        fill: pal.amber,
        maxChars: Math.max(9, Math.floor(colW / 10)),
        maxLines: 1,
      }));
    });

    let ry = topY + headH;
    const maxCellChars = Math.max(10, Math.floor(colW / 9.5));
    rows.forEach((row, rIdx) => {
      const rh = rowHeights[rIdx] || 54;
      if (rIdx > 0) {
        g.appendChild(rc.line(tableX, ry, tableX + tableW, ry, {
          stroke: pal.border,
          strokeWidth: 1.3,
          roughness: 0.85,
          seed: seed + 40 + rIdx,
        }));
      }
      const cells = Array.isArray(row) ? row : [String(row)];
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const val = cells[cIdx] ?? '';
        const cx = tableX + cIdx * colW + colW / 2;
        g.appendChild(createTextBlock(String(val), cx, ry + rh / 2, {
          fontSize: 14.5,
          fontWeight: cIdx === 0 ? '700' : '500',
          fill: cIdx === 0 ? pal.teal : pal.cream,
          maxChars: maxCellChars,
          maxLines: 3,
        }));
      }
      ry += rh;
    });
    return g;
  }

  if (type === 'callout') {
    const ck = resolveColorKey(cue.color, 'teal');
    const cCol = getStrokeColor(pal, ck);
    const cFill = getHachureFill(pal, ck);
    const h = cue._layoutH || 118;
    const x = MARGIN_X;
    const w = USABLE_W;

    g.appendChild(svgEl('rect', {
      x,
      y: baseY,
      width: w,
      height: h,
      rx: 12,
      fill: cFill,
    }));
    g.appendChild(rc.rectangle(x, baseY, w, h, {
      stroke: cCol,
      strokeWidth: 2.1,
      roughness: 1.05,
      seed,
    }));

    const badgeText = cue.label || cue.title || cue.badge || 'Key Note';
    let textTopY = baseY + 20;
    if (badgeText) {
      g.appendChild(buildVectorIcon(rc, cue.icon || 'bulb', x + 32, baseY + 26, 26, cCol, pal.cream, seed + 2));
      const bt = svgEl('text', {
        x: x + 54,
        y: baseY + 26,
        'text-anchor': 'start',
        'dominant-baseline': 'central',
        'font-size': 15,
        'font-weight': '700',
        'font-family': '"IBM Plex Mono", monospace',
        fill: cCol,
      });
      bt.textContent = String(badgeText);
      g.appendChild(bt);
      textTopY = baseY + 50;
    }

    const bodyText = cue.text || cue.sublabel || '';
    g.appendChild(createTextBlock(bodyText, x + 20, textTopY, {
      anchor: 'start',
      fontSize: 18,
      fontWeight: '600',
      fill: pal.cream,
      maxChars: 46,
      maxLines: 6,
      lineHeight: 1.4,
      alignTop: true,
    }));
    return g;
  }

  if (type === 'venn') {
    const left = cue.left || { title: 'Group A', sub: '', color: 'amber' };
    const right = cue.right || { title: 'Group B', sub: '', color: 'teal' };
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const lKey = resolveColorKey(left.color, 'amber');
    const rKey = resolveColorKey(right.color, 'teal');
    const lCol = getStrokeColor(pal, lKey);
    const rCol = getStrokeColor(pal, rKey);
    const cy = baseY + yOff + 150;

    g.appendChild(rc.circle(232, cy, 260, {
      stroke: lCol,
      strokeWidth: 2.5,
      roughness: 1.2,
      seed: seed + 1,
      fill: getHachureFill(pal, lKey),
      fillStyle: 'hachure',
      hachureGap: 7,
    }));
    g.appendChild(rc.circle(408, cy, 260, {
      stroke: rCol,
      strokeWidth: 2.5,
      roughness: 1.2,
      seed: seed + 2,
      fill: getHachureFill(pal, rKey),
      fillStyle: 'hachure',
      hachureAngle: 45,
      hachureGap: 7,
    }));

    g.appendChild(createTextBlock(left.title || 'A', 172, cy - 38, { fontSize: 18, fill: lCol, maxChars: 13, maxLines: 2 }));
    if (left.sub) g.appendChild(createTextBlock(left.sub, 172, cy + 14, { fontSize: 14, fontWeight: '500', fill: pal.cream, maxChars: 14, maxLines: 3 }));

    g.appendChild(createTextBlock(right.title || 'B', 468, cy - 38, { fontSize: 18, fill: rCol, maxChars: 13, maxLines: 2 }));
    if (right.sub) g.appendChild(createTextBlock(right.sub, 468, cy + 14, { fontSize: 14, fontWeight: '500', fill: pal.cream, maxChars: 14, maxLines: 3 }));

    if (cue.overlap) {
      g.appendChild(createTextBlock(cue.overlap, CX, cy, { fontSize: 14.5, fill: pal.coral, maxChars: 10, maxLines: 3 }));
    }
    return g;
  }

  if (type === 'timeline') {
    const items = Array.isArray(cue.items) ? cue.items.slice(0, 6) : [];
    const n = items.length;
    if (!n) return g;

    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const cardW = n >= 5 ? 114 : n === 4 ? 136 : 164;
    const x1 = MARGIN_X + cardW / 2 + 4;
    const x2 = LOGICAL_W - MARGIN_X - cardW / 2 - 4;
    const y = baseY + yOff + 170;
    g.appendChild(rc.line(MARGIN_X + 8, y, LOGICAL_W - MARGIN_X - 8, y, { stroke: col, strokeWidth: 3, roughness: 1.2, seed }));

    items.forEach((it, idx) => {
      const frac = n === 1 ? 0.5 : idx / (n - 1);
      const ix = x1 + frac * (x2 - x1);
      const isUp = idx % 2 === 0;
      const cardY = isUp ? y - 114 : y + 114;
      const ck = ['amber', 'teal', 'coral', 'mint'][idx % 4];
      const nCol = getStrokeColor(pal, ck);

      g.appendChild(rc.line(ix, y, ix, isUp ? cardY + 46 : cardY - 46, { stroke: nCol, strokeWidth: 2, seed: seed + idx }));
      g.appendChild(rc.circle(ix, y, 16, { stroke: nCol, strokeWidth: 2.2, fill: nCol, fillStyle: 'solid', seed: seed + idx + 20 }));
      g.appendChild(drawShapeNode(rc, ix, cardY, cardW, 92, 'box', nCol, getHachureFill(pal, ck), seed + idx + 50));

      g.appendChild(createTextBlock(it.year || `Stage ${idx + 1}`, ix, cardY - 20, {
        fontSize: 13,
        fontFamily: '"IBM Plex Mono", monospace',
        fill: nCol,
        maxChars: 12,
        maxLines: 1,
      }));
      g.appendChild(createTextBlock(it.text || '', ix, cardY + 13, {
        fontSize: 13,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: Math.max(10, Math.floor(cardW / 9)),
        maxLines: 2,
      }));
    });
    return g;
  }

  if (type === 'barchart') {
    const bars = Array.isArray(cue.bars) ? cue.bars.slice(0, 7) : [];
    if (!bars.length) return g;
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const axX = 76;
    const axY = baseY + yOff + 24;
    const axW = LOGICAL_W - 120;
    const axH = 242;
    g.appendChild(rc.line(axX, axY + axH, axX, axY, { stroke: pal.cream, strokeWidth: 2.4, seed }));
    g.appendChild(rc.line(axX, axY + axH, axX + axW, axY + axH, { stroke: pal.cream, strokeWidth: 2.4, seed: seed + 2 }));

    const maxVal = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
    const slotW = axW / bars.length;
    const barW = Math.min(68, slotW * 0.56);

    bars.forEach((b, idx) => {
      const ck = resolveColorKey(b.color, ['amber', 'teal', 'coral', 'mint'][idx % 4]);
      const bCol = getStrokeColor(pal, ck);
      const bh = Math.max(18, ((Number(b.value) || 0) / maxVal) * (axH - 36));
      const bx = axX + idx * slotW + (slotW - barW) / 2;
      const by = axY + axH - bh;
      g.appendChild(rc.rectangle(bx, by, barW, bh, {
        stroke: bCol,
        strokeWidth: 2.2,
        fill: getHachureFill(pal, ck),
        fillStyle: 'hachure',
        hachureGap: 5,
        seed: seed + idx * 9,
      }));
      g.appendChild(createTextBlock(String(b.value ?? ''), bx + barW / 2, by - 14, { fontSize: 14, fill: bCol }));
      g.appendChild(createTextBlock(String(b.label || ''), bx + barW / 2, axY + axH + 22, { fontSize: 13.5, fill: pal.cream, maxChars: 10, maxLines: 1 }));
    });
    return g;
  }

  if (type === 'equation') {
    const eqText = String(cue.text || '');
    const h = cue._layoutH || 60;
    const w = Math.max(360, Math.min(USABLE_W, Math.min(38, eqText.length) * 14 + 56));
    const cy = baseY + h / 2;
    g.appendChild(drawShapeNode(rc, CX, cy, w, h, 'pill', col, fill, seed));
    g.appendChild(createTextBlock(eqText, CX, cy, {
      fontSize: 18.5,
      fontFamily: '"IBM Plex Mono", monospace',
      fill: col,
      maxChars: 38,
      maxLines: 2,
    }));
    return g;
  }

  if (type === 'bullet') {
    const x = MARGIN_X + 2;
    const num = cue.index ?? bulletOrdinal;
    const text = String(cue.text || '');
    const r = 16;
    const badgeY = baseY + 22;
    g.appendChild(rc.circle(x + r, badgeY, r * 2, {
      stroke: col,
      strokeWidth: 2,
      fill,
      fillStyle: 'solid',
      seed,
    }));
    const nTxt = svgEl('text', {
      x: x + r,
      y: badgeY,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': 16,
      'font-weight': '700',
      'font-family': '"IBM Plex Sans", sans-serif',
      fill: col,
    });
    nTxt.textContent = String(num);
    g.appendChild(nTxt);

    g.appendChild(createTextBlock(text, x + 44, baseY + 8, {
      anchor: 'start',
      fontSize: 20,
      fontWeight: '600',
      fill: pal.cream,
      maxChars: 42,
      maxLines: 5,
      lineHeight: 1.38,
      alignTop: true,
    }));
    return g;
  }

  if (type === 'box') {
    const x = cue._layoutX ?? MARGIN_X;
    const y = baseY;
    const w = cue._layoutW ?? 340;
    const h = cue._layoutH ?? 112;
    g.appendChild(drawShapeNode(rc, x + w / 2, y + h / 2, w, h, cue.shape || 'box', col, fill, seed));
    const sub = cue.sublabel || cue.sub || '';
    g.appendChild(createTextBlock(cue.text || '', x + w / 2, y + h / 2 - (sub ? 14 : 0), {
      fontSize: 18,
      fill: col,
      maxChars: Math.max(12, Math.floor(w / 10.5)),
      maxLines: 2,
    }));
    if (sub) {
      g.appendChild(createTextBlock(sub, x + w / 2, y + h / 2 + 19, {
        fontSize: 14,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: Math.max(14, Math.floor(w / 9.2)),
        maxLines: 3,
      }));
    }
    return g;
  }

  if (type === 'circle' || type === 'ellipse') {
    const cx = cue._layoutX ?? CX;
    const cy = baseY;
    const r = cue._layoutR ?? 64;
    g.appendChild(drawShapeNode(rc, cx, cy, r * 2, r * 2, 'circle', col, fill, seed));
    const sub = cue.sublabel || cue.sub || '';
    g.appendChild(createTextBlock(cue.text || '', cx, cy - (sub ? 10 : 0), {
      fontSize: 17,
      fill: col,
      maxChars: Math.floor((r * 1.7) / 9.5),
      maxLines: 2,
    }));
    if (sub) {
      g.appendChild(createTextBlock(sub, cx, cy + 16, {
        fontSize: 13.5,
        fontWeight: '500',
        fill: pal.cream,
        maxChars: Math.floor((r * 1.7) / 8.5),
        maxLines: 1,
      }));
    }
    return g;
  }

  if (type === 'arrow' || type === 'curvedarrow' || type === 'processpulse') {
    const y = baseY + 22;
    const rawX1 = cue.x1 ?? 70;
    const rawX2 = cue.x2 ?? (LOGICAL_W - 70);
    const span = Math.abs(rawX2 - rawX1);
    const x1 = span < 420 ? 70 : Math.min(LOGICAL_W - 60, Math.max(40, rawX1));
    const x2 = span < 420 ? LOGICAL_W - 70 : Math.min(LOGICAL_W - 40, Math.max(60, rawX2));
    g.appendChild(drawRoughArrow(
      rc,
      x1,
      y,
      x2,
      y,
      col,
      cue.label || '',
      pal,
      seed,
      type === 'curvedarrow' ? 18 : 0
    ));
    return g;
  }

  if (type === 'axes') {
    const ab = cue._axesBox || { x: 76, y: baseY + 12, w: LOGICAL_W - 124, h: 236 };
    const yOff = appendDiagramCaption(g, cue.title, baseY, pal, cue.color);
    const y = baseY + yOff + 12;
    g.appendChild(rc.line(ab.x, y + ab.h, ab.x, y, { stroke: pal.cream, strokeWidth: 2.3, seed }));
    g.appendChild(rc.line(ab.x, y + ab.h, ab.x + ab.w, y + ab.h, { stroke: pal.cream, strokeWidth: 2.3, seed: seed + 1 }));
    if (cue.xLabel) g.appendChild(createTextBlock(cue.xLabel, ab.x + ab.w, y + ab.h + 22, { anchor: 'end', fontSize: 14, fill: pal.muted }));
    if (cue.yLabel) g.appendChild(createTextBlock(cue.yLabel, ab.x + 12, y + 12, { anchor: 'start', fontSize: 14, fill: pal.muted }));
    return g;
  }

  if (type === 'curve') {
    const ab = cue._axesBox || { x: 76, y: baseY + 12, w: LOGICAL_W - 124, h: 224 };
    const pts = Array.isArray(cue.points) && cue.points.length >= 2
      ? cue.points
      : [[0, 0.1], [0.35, 0.45], [0.7, 0.85], [1, 0.92]];
    const mapped = pts.map(([px, py]) => [ab.x + px * ab.w, ab.y + ab.h - py * ab.h]);
    g.appendChild(rc.curve(mapped, { stroke: col, strokeWidth: 3, roughness: 0.9, seed }));
    if (cue.label) {
      const last = mapped[mapped.length - 1];
      g.appendChild(createTextBlock(cue.label, Math.min(LOGICAL_W - 40, last[0] + 10), last[1], { anchor: 'start', fontSize: 14.5, fill: col }));
    }
    return g;
  }

  if (type === 'highlight' && cue.w && cue.h) {
    g.appendChild(rc.rectangle((cue.x ?? 80) - 6, (cue.y ?? 140) - 6, cue.w + 12, cue.h + 12, { stroke: col, strokeWidth: 2.8, roughness: 1.4, seed }));
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
    this.logicalH = LOGICAL_H;
    this.renderH = LOGICAL_H;
    this.progress = 1;
    this.autoFollow = opts.autoFollow !== undefined ? Boolean(opts.autoFollow) : !this.compact;
    this._lastUserScrollAt = 0;
    this._lastAutoScrollAt = 0;
    this._destroyed = false;
    this._activePointers = new Map();
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;
    this._lastScrollDragPt = null;
    this._tapCandidate = null;
    this._drawingStroke = null;
    this._tracks = [];
    this._ro = null;
    this.onChange = null;
    this.onBoardTap = typeof opts.onBoardTap === 'function' ? opts.onBoardTap : null;
    this.onZoomChange = typeof opts.onZoomChange === 'function' ? opts.onZoomChange : null;

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
    this.host.classList.toggle('is-compact', this.compact);
    this._syncTouchAction();

    const scrollStage = document.createElement('div');
    scrollStage.className = 'board-scroll-stage';

    const svg = svgEl('svg', {
      viewBox: `0 0 ${LOGICAL_W} ${this.logicalH}`,
      preserveAspectRatio: 'xMidYMin meet',
      class: 'board-svg-root',
    });

    const defs = svgEl('defs');
    const patId = `grid_${Math.random().toString(36).slice(2, 8)}`;
    const pat = svgEl('pattern', { id: patId, width: 24, height: 24, patternUnits: 'userSpaceOnUse' });
    const dot = svgEl('circle', { cx: 12, cy: 12, r: 1.3, class: 'board-grid-dot' });
    pat.appendChild(dot);
    defs.appendChild(pat);

    this.defs = defs;
    this.dynamicDefs = svgEl('g');
    defs.appendChild(this.dynamicDefs);
    svg.appendChild(defs);

    const bgRect = svgEl('rect', { width: LOGICAL_W, height: this.logicalH, fill: `url(#${patId})` });
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

    scrollStage.appendChild(svg);
    this.host.appendChild(scrollStage);

    this.scrollStage = scrollStage;
    this.svg = svg;
    this.bgRect = bgRect;
    this.rc = rough.svg(svg);
    this.viewport = viewport;
    this.cuesGroup = cuesGroup;
    this.strokesGroup = strokesGroup;
    this.nibGroup = nibGroup;
    this.gridDot = dot;

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._layoutScrollStage());
      this._ro.observe(this.host);
    }
  }

  _syncTouchAction() {
    if (!this.host) return;
    if (this.state.tool === 'pen' || this.state.tool === 'eraser') {
      this.host.style.touchAction = 'none';
      this.host.style.cursor = this.state.tool === 'pen' ? 'crosshair' : 'cell';
    } else if (this.compact) {
      this.host.style.touchAction = 'pan-y';
      this.host.style.cursor = 'default';
    } else {
      this.host.style.touchAction = 'pan-x pan-y';
      this.host.style.cursor = 'grab';
    }
  }

  _layoutScrollStage() {
    if (!this.scrollStage || !this.host || !this.svg) return;
    const hostW = Math.max(220, this.host.clientWidth || 340);
    const hostH = Math.max(180, this.host.clientHeight || 220);

    if (this.compact) {
      const naturalH = Math.round(hostW * (this.logicalH / LOGICAL_W));
      this.renderH = Math.max(this.logicalH, Math.round(LOGICAL_W * (hostH / hostW)));
      this.svg.setAttribute('viewBox', `0 0 ${LOGICAL_W} ${this.renderH}`);
      if (this.bgRect) this.bgRect.setAttribute('height', String(this.renderH));
      this.scrollStage.style.width = '100%';
      this.scrollStage.style.height = `${Math.max(hostH, naturalH + 10)}px`;
      return;
    }

    const z = this.state.zoom || 1;
    // Expand viewBox height to match portrait/landscape screen aspect so dot-grid fills 100% of screen
    // while keeping content anchored right at topPad (`68px` below toolbar)!
    const minViewLogicalH = Math.round(LOGICAL_W * (hostH / hostW));
    this.renderH = Math.max(this.logicalH, minViewLogicalH);
    this.svg.setAttribute('viewBox', `0 0 ${LOGICAL_W} ${this.renderH}`);
    if (this.bgRect) this.bgRect.setAttribute('height', String(this.renderH));

    const stageNaturalH = Math.round(hostW * (this.renderH / LOGICAL_W));
    const stageH = Math.max(hostH + 24, stageNaturalH);
    this.scrollStage.style.width = `${Math.round(hostW * z)}px`;
    this.scrollStage.style.height = `${Math.round(stageH * z)}px`;
  }

  _applyTransform() {
    if (this.viewport) this.viewport.removeAttribute('transform');
    this._layoutScrollStage();
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
    const { cues: laidCues, contentH } = layoutBoardCues(page.cues || [], this.compact ? 24 : 68);
    this.logicalH = contentH || LOGICAL_H;

    const total = Math.max(1, laidCues.length);
    let bulletCounter = 0;

    laidCues.forEach((cue, idx) => {
      const t = String(cue.type || '').toLowerCase();
      if (t === 'divider') bulletCounter = 0;
      if (t === 'bullet') bulletCounter++;

      const autoStart = (idx / total) * 0.82;
      const cueProg = cue.atProgress !== undefined && idx < 4 ? Number(cue.atProgress) : autoStart;
      const startP = cue._immediate ? 0 : Math.max(0, Math.min(0.88, Math.max(autoStart * 0.65, cueProg)));
      const endP = cue._immediate ? 0.001 : Math.min(1, startP + Math.max(0.14, 0.72 / Math.min(total, 5)));

      const cg = buildCueElements(this.rc, this.dynamicDefs, cue, pal, theme, bulletCounter);
      this.cuesGroup.appendChild(cg);

      const tracks = cue._immediate
        ? collectAnimationTracks(this.dynamicDefs, cg, 0, 0.001, `c${idx}`)
        : collectAnimationTracks(this.dynamicDefs, cg, startP, endP, `c${idx}`);
      this._tracks.push(...tracks);
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
        this._maybeAutoFollow(activeTip.y);
      } else {
        this.nibGroup.setAttribute('visibility', 'hidden');
      }
    }
  }

  _maybeAutoFollow(logicalY) {
    if (!this.autoFollow || this.compact || !this.host || !this.scrollStage) return;
    if (this.state.tool === 'pen' || this.state.tool === 'eraser') return;
    const now = Date.now();
    if (now - this._lastUserScrollAt < 4500) return;
    if (now - this._lastAutoScrollAt < 380) return;

    const stageH = this.scrollStage.offsetHeight || this.host.scrollHeight || 1;
    const viewH = this.host.clientHeight || 400;
    if (stageH <= viewH + 20) return;

    const denom = Math.max(1, this.renderH || this.logicalH);
    const tipPxY = (logicalY / denom) * stageH;
    const curTop = this.host.scrollTop;
    const lowerBound = curTop + viewH * 0.76;
    const upperBound = curTop + viewH * 0.12;

    if (tipPxY > lowerBound || tipPxY < upperBound) {
      this._lastAutoScrollAt = now;
      const targetTop = Math.max(0, Math.min(stageH - viewH, tipPxY - viewH * 0.42));
      this.host.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }

  destroy() {
    this._destroyed = true;
    this._ro?.disconnect();
    this._ro = null;
    this._unbindInteractions();
  }

  setProgress(p) {
    this.progress = clamp01(p);
    this._scrubProgress(this.progress);
  }

  setAutoFollow(enabled) {
    this.autoFollow = Boolean(enabled);
    if (this.autoFollow) this._lastUserScrollAt = 0;
  }

  setTheme(theme) {
    this.state.theme = theme === 'whiteboard' ? 'whiteboard' : 'chalkboard';
    this.state.penColor = this.state.theme === 'whiteboard' ? '#D9540E' : '#FFB469';
    this._rebuildScene();
    this.onChange?.();
  }

  setTool(tool) {
    this.state.tool = tool;
    this._syncTouchAction();
  }

  setPenColor(keyOrHex) {
    const pal = PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard'];
    this.state.penColor = getStrokeColor(pal, keyOrHex);
  }

  clearUserStrokes() {
    const pg = this.state.pages[this.state.activePageIndex];
    if (!pg || !pg.userStrokes?.length) return;
    pg.userStrokes = [];
    const pal = PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard'];
    this._renderUserStrokes(pal);
    this.onChange?.();
  }

  scrollToTop() {
    if (this.host) {
      this.host.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  }

  setZoom(nextZoom, clientX = null, clientY = null) {
    if (!this.host || this.compact) return;
    const oldZ = this.state.zoom || 1;
    const clamped = Math.max(0.85, Math.min(2.8, Number(nextZoom) || 1));
    if (Math.abs(clamped - oldZ) < 0.005) return;

    const hostRect = this.host.getBoundingClientRect();
    const focalX = clientX != null ? clientX - hostRect.left : hostRect.width / 2;
    const focalY = clientY != null ? clientY - hostRect.top : hostRect.height / 2;
    const ratio = clamped / oldZ;

    const targetLeft = (this.host.scrollLeft + focalX) * ratio - focalX;
    const targetTop = (this.host.scrollTop + focalY) * ratio - focalY;

    this.state.zoom = clamped;
    this._layoutScrollStage();
    this.host.scrollLeft = Math.max(0, targetLeft);
    this.host.scrollTop = Math.max(0, targetTop);
    this.onZoomChange?.(clamped);
  }

  resetZoom() {
    this.state.zoom = 1;
    this.state.panX = 0;
    this.state.panY = 0;
    this._layoutScrollStage();
    this.scrollToTop();
    this.onZoomChange?.(1);
  }

  setSingleStepCues(cues = [], forceImmediate = false, step = null) {
    const pg = this.state.pages[0] || { id: 'mini', title: 'Concept Board', cues: [], userStrokes: [] };
    const enriched = enrichStepBoardCues(cues, step);
    pg.cues = enriched.map((c) => ({ ...c, _immediate: forceImmediate }));
    this.state.pages = [pg];
    this.state.activePageIndex = 0;
    this.progress = forceImmediate ? 1 : 0.25;
    this._rebuildScene();
    this.scrollToTop();
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
        this.scrollToTop();
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
    const enriched = enrichStepBoardCues(step.boardCues, step);
    const incoming = enriched.map((c) => ({
      ...c,
      _immediate: forceImmediate,
    }));

    const stepTag = `step_${step.stepIndex ?? 0}`;
    const kept = targetPage.cues.filter((c) => c._stepTag !== stepTag);
    targetPage.cues = kept.concat(incoming.map((c) => ({ ...c, _stepTag: stepTag })));
    this.progress = forceImmediate ? 1 : 0;
    this._rebuildScene();
    if (shouldNewPage || kept.length === 0) {
      this.scrollToTop();
    } else if (this.host && this.scrollStage) {
      this.host.scrollTo({ top: Math.max(0, this.scrollStage.offsetHeight - this.host.clientHeight), behavior: 'smooth' });
    }
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
    if (this.host && this.scrollStage) {
      this.host.scrollTo({ top: Math.max(0, this.scrollStage.offsetHeight - this.host.clientHeight), behavior: 'smooth' });
    }
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
      this.scrollToTop();
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
    this.scrollToTop();
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
    const outW = Math.round(LOGICAL_W * 1.8);
    const outH = Math.round((this.logicalH || LOGICAL_H) * 1.8);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('viewBox', `0 0 ${LOGICAL_W} ${this.logicalH}`);
    clone.setAttribute('width', String(outW));
    clone.setAttribute('height', String(outH));

    const vp = clone.querySelector('#board-viewport');
    if (vp) vp.setAttribute('transform', '');
    const nib = clone.querySelector('#board-nib');
    if (nib) nib.setAttribute('visibility', 'hidden');

    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
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
        if (c.pairs) return `cause_effect: ${c.pairs.map((p) => `${p.cause} -> ${p.effect}`).join('; ')}`;
        if (c.tiers) return `pyramid: ${c.tiers.map((t) => t.title).join(' > ')}`;
        if (c.headers) return `matrix: ${(c.headers || []).join(' / ')}`;
        return `${c.type}: ${c.text || c.label || c.title || ''}`.trim();
      })
      .filter(Boolean)
      .slice(0, 14)
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
    if (!this.svg) return { x: CX, y: 310 };
    const rect = this.svg.getBoundingClientRect();
    const curH = this.renderH || this.logicalH || LOGICAL_H;
    const baseScale = Math.min(rect.width / LOGICAL_W, rect.height / curH);
    const drawnW = LOGICAL_W * baseScale;
    const viewX0 = rect.left + (rect.width - drawnW) / 2;
    const viewY0 = rect.top;

    return {
      x: (clientX - viewX0) / baseScale,
      y: (clientY - viewY0) / baseScale,
    };
  }

  _bindInteractions() {
    const c = this.host;
    if (!c) return;

    const pal = () => PALETTES[this.state.theme === 'whiteboard' ? 'whiteboard' : 'chalkboard'];

    this._onPointerDown = (e) => {
      if (this.compact && this.state.tool === 'view') return;

      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._activePointers.size >= 2) {
        if (this._tapCandidate) this._tapCandidate.multi = true;
        if (!this.compact && this._activePointers.size === 2) {
          const pts = [...this._activePointers.values()];
          this._pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this._pinchStartZoom = this.state.zoom;
          this._drawingStroke = null;
          this._lastScrollDragPt = null;
        }
        return;
      }

      if (this.state.tool === 'pen') {
        c.setPointerCapture?.(e.pointerId);
        const pt = this._clientToLogical(e.clientX, e.clientY);
        const pg = this.state.pages[this.state.activePageIndex];
        this._drawingStroke = { color: this.state.penColor, size: 4, pts: [pt] };
        pg.userStrokes.push(this._drawingStroke);
        this.state.redoStack = [];
        this._renderUserStrokes(pal());
      } else if (this.state.tool === 'eraser') {
        c.setPointerCapture?.(e.pointerId);
        this._eraseAt(e.clientX, e.clientY);
      } else if (!this.compact) {
        this._tapCandidate = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          t: Date.now(),
          moved: false,
          multi: false,
        };
        if (e.pointerType === 'mouse' && e.button === 0) {
          this._lastScrollDragPt = { x: e.clientX, y: e.clientY };
          this.host.style.cursor = 'grabbing';
        }
      }
    };

    this._onPointerMove = (e) => {
      if (!this._activePointers.has(e.pointerId)) return;
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._tapCandidate && this._tapCandidate.id === e.pointerId) {
        if (Math.hypot(e.clientX - this._tapCandidate.x, e.clientY - this._tapCandidate.y) > 8) {
          this._tapCandidate.moved = true;
          this._lastUserScrollAt = Date.now();
        }
      }

      if (this._activePointers.size === 2 && !this.compact) {
        const pts = [...this._activePointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (this._pinchStartDist > 12) {
          this.setZoom(this._pinchStartZoom * (dist / this._pinchStartDist), midX, midY);
        }
        return;
      }

      if (this.state.tool === 'pen' && this._drawingStroke) {
        const pt = this._clientToLogical(e.clientX, e.clientY);
        this._drawingStroke.pts.push(pt);
        this._renderUserStrokes(pal());
      } else if (this.state.tool === 'eraser' && e.buttons) {
        this._eraseAt(e.clientX, e.clientY);
      } else if (this._lastScrollDragPt && !this.compact) {
        const dx = e.clientX - this._lastScrollDragPt.x;
        const dy = e.clientY - this._lastScrollDragPt.y;
        this.host.scrollLeft -= dx;
        this.host.scrollTop -= dy;
        this._lastScrollDragPt = { x: e.clientX, y: e.clientY };
        this._lastUserScrollAt = Date.now();
      }
    };

    this._onPointerUp = (e) => {
      const wasTap = Boolean(
        !this.compact &&
        this.state.tool === 'view' &&
        this._tapCandidate &&
        this._tapCandidate.id === e.pointerId &&
        !this._tapCandidate.moved &&
        !this._tapCandidate.multi &&
        Date.now() - this._tapCandidate.t < 360
      );

      this._activePointers.delete(e.pointerId);
      if (this._activePointers.size === 0) {
        this._tapCandidate = null;
      }

      if (this._drawingStroke) {
        this._drawingStroke = null;
        this.onChange?.();
      }
      if (this._lastScrollDragPt) {
        this._lastScrollDragPt = null;
        this._syncTouchAction();
      }

      if (wasTap) {
        this.onBoardTap?.();
      }
    };

    this._onWheel = (e) => {
      if (this.compact) return;
      this._lastUserScrollAt = Date.now();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.setZoom((this.state.zoom || 1) * factor, e.clientX, e.clientY);
      }
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
