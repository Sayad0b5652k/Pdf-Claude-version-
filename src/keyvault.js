// @ts-nocheck
// KeyVault: several personal API keys (Gemini / Groq / OpenRouter), auto-detected by format.
// Keys live only on this device (localStorage + IndexedDB settings) and ride along per request.
const LS = 'sayad_keys_v1';
const PROV = {
  gemini:     { name: 'Google Gemini', short: 'Gemini', color: '#4285F4', link: 'https://aistudio.google.com/app/apikey', supported: true },
  groq:       { name: 'Groq', short: 'Groq', color: '#F55036', link: 'https://console.groq.com/keys', supported: true },
  openrouter: { name: 'OpenRouter', short: 'OpenRouter', color: '#7C5CFF', link: 'https://openrouter.ai/keys', supported: true },
  openai:     { name: 'OpenAI', short: 'OpenAI', color: '#10A37F', supported: false },
  anthropic:  { name: 'Anthropic', short: 'Claude', color: '#D97757', supported: false },
  cerebras:   { name: 'Cerebras', short: 'Cerebras', color: '#FF7A1A', supported: false },
  unknown:    { name: 'Unknown', short: '?', color: '#888', supported: false },
};
function cleanKey(k) {
  let s = String(k || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  s = s.replace(/^(?!AIza|AQ\.|gsk_|sk-|csk-)(?:export\s+)?[A-Za-z0-9_.-]{2,48}\s*[:=]\s*/i, '').trim();
  s = s.replace(/^bearer\s+/i, '').trim();
  s = s.replace(/^["'`<]+|["'`>,;]+$/g, '').trim();
  return s.replace(/\s+/g, '');
}
function detect(k) {
  k = cleanKey(k);
  if (/^(?:AIza[0-9A-Za-z_\-]{16,}|AQ\.[0-9A-Za-z_\-.]{16,})$/.test(k)) return 'gemini';
  if (/^gsk_[0-9A-Za-z_\-]{16,}$/.test(k)) return 'groq';
  if (/^sk-or-[0-9A-Za-z_\-]{8,}/.test(k)) return 'openrouter';
  if (/^sk-ant-[0-9A-Za-z_\-]{8,}/.test(k)) return 'anthropic';
  if (/^csk-[0-9A-Za-z_\-]{8,}/.test(k)) return 'cerebras';
  if (/^sk-(proj-|svcacct-)?[0-9A-Za-z_\-]{16,}$/.test(k)) return 'openai';
  return 'unknown';
}
function detectHint(k) {
  const c = cleanKey(k);
  const p = detect(c);
  if (p !== 'unknown') return { provider: p, partial: false };
  if (/^(?:AIza|AQ\.)/.test(c)) return { provider: 'gemini', partial: true };
  if (/^gsk_/.test(c)) return { provider: 'groq', partial: true };
  if (/^sk-or-/.test(c)) return { provider: 'openrouter', partial: true };
  if (/^sk-ant-/.test(c)) return { provider: 'anthropic', partial: true };
  if (/^csk-/.test(c)) return { provider: 'cerebras', partial: true };
  if (/^sk-/.test(c)) return { provider: 'openai', partial: true };
  return { provider: 'unknown', partial: false };
}
const today = () => new Date().toISOString().slice(0, 10);
let keys = [];
function load() {
  try { keys = JSON.parse(localStorage.getItem(LS) || '[]') || []; } catch (e) { keys = []; }
  if (!keys.length) { // migrate the old single Gemini key
    try { const old = localStorage.getItem('sayad_custom_gemini_key'); if (old && old.length > 10) keys = [mk(old, 'Gemini key')]; } catch (e) {}
  }
}
function mk(key, label) {
  const provider = detect(key);
  return { id: 'k' + Math.random().toString(36).slice(2, 9), provider, key, label: label || PROV[provider].short + ' key',
    addedAt: Date.now(), day: today(), n: 0, cooldownUntil: 0, quota: null, state: 'new', checkedAt: 0 };
}
function save(emit = true) {
  try { localStorage.setItem(LS, JSON.stringify(keys)); } catch (e) {}
  try { const g = keys.find(k => k.provider === 'gemini' && k.state !== 'bad'); localStorage.setItem('sayad_custom_gemini_key', g ? g.key : ''); } catch (e) {}
  try { window.DB && window.DB.setting && window.DB.setting('aiKeys', keys); } catch (e) {}
  if (emit) {
    try { window.dispatchEvent(new CustomEvent('sayad-keys-changed')); } catch (e) {}
  }
}
load();

let rr = 0;
function nextGemini() {
  const now = Date.now();
  const ready = keys.filter(k => k.provider === 'gemini' && k.state !== 'bad' && (k.cooldownUntil || 0) <= now);
  if (!ready.length) return '';
  const k = ready[rr++ % ready.length];
  return k.key;
}
function firstOf(p) {
  const now = Date.now();
  return keys.find(k => k.provider === p && k.state !== 'bad' && (k.cooldownUntil || 0) <= now) || null;
}

function applyKeyOutcome(keyObj, status, note) {
  if (!keyObj || !status) return false;
  let stateChanged = false;
  const prevState = keyObj.state;
  if (status === 'used') {
    if (keyObj.day !== today()) { keyObj.day = today(); keyObj.n = 0; }
    keyObj.n++;
    keyObj.cooldownUntil = 0;
    keyObj.note = '';
    if (prevState !== 'ok') { keyObj.state = 'ok'; stateChanged = true; }
  } else if (status === 'limit') {
    keyObj.cooldownUntil = Date.now() + 60000;
    keyObj.note = note || keyObj.note || 'Rate limit hit';
    if (prevState !== 'limit') { keyObj.state = 'limit'; stateChanged = true; }
  } else if (status === 'bad') {
    keyObj.cooldownUntil = Date.now() + 180000;
    keyObj.note = note || keyObj.note || 'Key reject hui';
    if (prevState !== 'bad') { keyObj.state = 'bad'; stateChanged = true; }
  } else if (status === 'fallback') {
    keyObj.cooldownUntil = Date.now() + 15000;
    if (note) keyObj.note = note;
  }
  return stateChanged;
}

const Vault = {
  PROV, detect, detectHint, clean: cleanKey,
  list: () => keys.slice(),
  count: () => keys.length,
  hasGemini: () => keys.some(k => k.provider === 'gemini' && k.state !== 'bad'),
  async add(key, label) {
    key = cleanKey(key);
    if (key.length < 12) throw new Error('Key bahut chhoti hai');
    if (keys.some(k => k.key === key)) throw new Error('Ye key pehle se added hai');
    const k = mk(key, label);
    keys.push(k); save();
    let r = null;
    try {
      r = await Vault.check(k.id);
    } catch (e) {
      keys = keys.filter(x => x.id !== k.id); save();
      throw new Error(e?.message || 'Key verify karne me network/server error aaya');
    }
    if (!r || r.valid === false) {
      keys = keys.filter(x => x.id !== k.id); save();
      throw new Error((r && r.error) || 'Key valid nahi hai');
    }
    return keys.find(x => x.id === k.id);
  },
  restore(list) { if (Array.isArray(list)) { keys = list; save(); } },
  remove(id) { keys = keys.filter(k => k.id !== id); save(); },
  rename(id, label) { const k = keys.find(x => x.id === id); if (k) { k.label = String(label || '').slice(0, 24) || k.label; save(); } },
  async check(id) {
    const k = keys.find(x => x.id === id); if (!k) return null;
    const resp = await fetch('/api/keys/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k.key }) });
    const d = await resp.json().catch(() => null);
    if (!d) throw new Error(`Server error (HTTP ${resp.status})`);
    k.checkedAt = Date.now();
    if (d.provider && PROV[d.provider]) k.provider = d.provider;
    k.state = d.valid ? (d.exhausted ? 'limit' : 'ok') : 'bad';
    k.cooldownUntil = d.exhausted ? (Date.now() + 60000) : 0;
    k.quota = d.quota || null; k.note = d.note || d.error || '';
    if (d.supported === false) k.state = 'unsupported';
    save();
    return d;
  },
  // 0..1 share left, or null when unknown
  remaining(k) {
    if (k.state === 'bad' || k.state === 'unsupported') return null;
    const q = k.quota;
    if (k.provider === 'gemini') { const used = k.day === today() ? k.n : 0; return Math.max(0, 1 - used / 250); }
    if (q && q.limit && q.remaining != null) return Math.max(0, Math.min(1, q.remaining / q.limit));
    if (q && q.limit == null && k.provider === 'openrouter') return 1; // no cap set on this key
    return null;
  },
  usedToday(k) { return k.day === today() ? k.n : 0; },
  anyActive: () => keys.some(k => k.state !== 'bad' && k.state !== 'unsupported'),
  auxHeader() {
    const o = {}; const g = firstOf('groq'), r = firstOf('openrouter');
    if (g) o.groq = g.key; if (r) o.openrouter = r.key;
    return Object.keys(o).length ? encodeURIComponent(JSON.stringify(o)) : '';
  },
};
window.KeyVault = Vault;

// State.customGeminiKey stays the single read point for every existing AI call; it now rotates across healthy Gemini keys.
try {
  Object.defineProperty(window.State, 'customGeminiKey', { configurable: true, enumerable: true, get: nextGemini, set() {} });
} catch (e) {}

// Count usage per key and learn from server BYOK status headers / 429s; attach Groq/OpenRouter keys to our own /api calls.
const _fetch = window.fetch.bind(window);
let _lastUiEmitAt = 0;
const wrappedFetch = function (input, init) {
  try {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/') || (typeof location !== 'undefined' && url.startsWith(location.origin + '/api/'));
    const isKeys = url.startsWith('/api/keys/') || (typeof location !== 'undefined' && url.startsWith(location.origin + '/api/keys/'));
    if (isApi && !isKeys) {
      init = init || {};
      const sentGroq = firstOf('groq');
      const sentOr = firstOf('openrouter');
      const o = {};
      if (sentGroq) o.groq = sentGroq.key;
      if (sentOr) o.openrouter = sentOr.key;
      const aux = Object.keys(o).length ? encodeURIComponent(JSON.stringify(o)) : '';

      let used = null;
      if (typeof init.body === 'string' && init.body.includes('customKey')) {
        try { const ck = cleanKey(JSON.parse(init.body).customKey); used = keys.find(k => k.key === ck) || null; } catch (e) {}
      }
      if (aux) {
        const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        h.set('x-sayad-aux', aux);
        init = { ...init, headers: h };
      }

      const p = _fetch(input, init);
      if (used || sentGroq || sentOr) {
        p.then(r => {
          let stateChanged = false;
          let countChanged = false;
          const byokStatus = (r.headers.get('x-sayad-byok-status') || '').toLowerCase();
          const byokNote = r.headers.get('x-sayad-byok-note') || '';
          const keySlot = r.headers.get('x-sayad-key-slot') || '';
          const auxProv = (r.headers.get('x-sayad-aux-provider') || '').toLowerCase();
          const auxStatus = (r.headers.get('x-sayad-aux-status') || '').toLowerCase();
          const auxNote = r.headers.get('x-sayad-aux-note') || '';

          if (used) {
            if (byokStatus) {
              stateChanged = applyKeyOutcome(used, byokStatus, byokNote) || stateChanged;
              if (byokStatus === 'used') countChanged = true;
            } else if (r.status === 429) {
              stateChanged = applyKeyOutcome(used, 'limit', 'Rate limit hit') || stateChanged;
            } else if (r.ok && keySlot === 'User Personal Custom Key') {
              stateChanged = applyKeyOutcome(used, 'used') || stateChanged;
              countChanged = true;
            }
          }

          if (auxProv && auxStatus) {
            const targetAux = auxProv === 'groq' ? sentGroq : (auxProv === 'openrouter' ? sentOr : null);
            if (targetAux) {
              stateChanged = applyKeyOutcome(targetAux, auxStatus, auxNote) || stateChanged;
              if (auxStatus === 'used') countChanged = true;
            }
          } else if (keySlot === 'user-groq' && sentGroq) {
            stateChanged = applyKeyOutcome(sentGroq, 'used') || stateChanged;
            countChanged = true;
          } else if (keySlot === 'user-openrouter' && sentOr) {
            stateChanged = applyKeyOutcome(sentOr, 'used') || stateChanged;
            countChanged = true;
          }

          if (stateChanged || countChanged) {
            const now = Date.now();
            const emit = stateChanged || (now - _lastUiEmitAt > 3000);
            if (emit) _lastUiEmitAt = now;
            save(emit);
          }
        }).catch(() => {});
      }
      return p;
    }
  } catch (e) {}
  return _fetch(input, init);
};
try {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: wrappedFetch,
  });
} catch (e) {
  try { window.fetch = wrappedFetch; } catch (_) {}
}

// ---- small UI helpers used by Settings → Advanced ----
Vault.mask = (k) => k.key.slice(0, 4) + '••••' + k.key.slice(-4);
Vault.statusOf = (k) => {
  const left = Vault.remaining(k);
  if (k.state === 'bad') return { tone: 'bad', text: k.note ? `Reject hui: ${String(k.note).slice(0, 60)}` : 'Key reject hui' };
  if (k.state === 'unsupported') return { tone: 'dim', text: 'Pehchani, par abhi use nahi hoti' };
  if (k.state === 'limit' || k.cooldownUntil > Date.now()) return { tone: 'warn', text: 'Limit chhoo li, thodi der me wapas' };
  if (k.provider === 'gemini') return { tone: left != null && left < 0.15 ? 'warn' : 'ok', text: `Aaj ${Vault.usedToday(k)} calls (estimate)` };
  const q = k.quota;
  if (q && q.limit != null && q.remaining != null) return { tone: left < 0.15 ? 'warn' : 'ok', text: `${q.remaining.toLocaleString()} / ${q.limit.toLocaleString()} ${k.provider === 'groq' ? 'requests bache' : 'credits bache'}` };
  if (k.provider === 'openrouter') return { tone: 'ok', text: 'Koi limit set nahi' };
  return { tone: 'dim', text: 'Status check karo' };
};
Vault.ringSvg = (k, size = 46) => {
  const st = Vault.statusOf(k), left = Vault.remaining(k), r = 18, c = 2 * Math.PI * r;
  const col = st.tone === 'bad' ? '#ef4444' : st.tone === 'warn' ? '#f59e0b' : st.tone === 'dim' ? 'var(--text-faint)' : (left != null && left < 0.4 ? '#f59e0b' : '#10b981');
  const frac = left == null ? (st.tone === 'bad' ? 1 : 0.0) : left;
  const centre = st.tone === 'bad' ? '!' : left == null ? '–' : Math.round(left * 100) + '%';
  return `<svg class="kv-ring" width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)" style="transition:stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)"/>
    <text x="22" y="26" text-anchor="middle" font-size="${centre.length > 3 ? 9 : 11}" font-weight="800" fill="var(--text)" font-family="var(--font-mono, monospace)">${centre}</text></svg>`;
};
