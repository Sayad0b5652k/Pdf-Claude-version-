// @ts-nocheck
// Privacy Lock: a PIN screen over the whole app. Keeps casual snoopers out; it is not encryption.
const LS = 'sayad_lock';
const cfg = () => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } };
const putCfg = (c) => { try { c ? localStorage.setItem(LS, JSON.stringify(c)) : localStorage.removeItem(LS); } catch (e) {} };
async function hash(pin, salt) {
  const s = salt + ':' + pin;
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'x' + h; }
}
let overlay = null, hiddenAt = 0, fails = 0, lockedUntil = 0;

export const AppLock = {
  enabled: () => !!(cfg() && cfg().hash),
  delay: () => (cfg() && cfg().delay) || 0,
  async setPin(pin, delay) {
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN 4 digit ka hona chahiye');
    const salt = Math.random().toString(36).slice(2);
    putCfg({ salt, hash: await hash(pin, salt), delay: delay != null ? delay : AppLock.delay() });
    document.documentElement.classList.add('has-lock');
  },
  async verify(pin) { const c = cfg(); return !!c && (await hash(pin, c.salt)) === c.hash; },
  setDelay(sec) { const c = cfg(); if (c) { c.delay = sec; putCfg(c); } },
  disable() { putCfg(null); document.documentElement.classList.remove('app-locked', 'has-lock'); AppLock.unlock(); },
  lock() { if (!AppLock.enabled() || overlay) return; build(); },
  unlock() {
    document.documentElement.classList.remove('app-locked');
    if (overlay) { const o = overlay; overlay = null; o.classList.add('out'); setTimeout(() => o.remove(), 220); }
  },
};
window.AppLock = AppLock;

function build() {
  document.documentElement.classList.add('app-locked');
  const o = document.createElement('div'); o.id = 'sayad-lock'; overlay = o;
  o.innerHTML = `<div class="lk-box">
    <div class="lk-badge">🔒</div>
    <div class="lk-title">S.A.Y.A.D. locked</div>
    <div class="lk-sub" id="lk-sub">PIN daalo</div>
    <div class="lk-dots" id="lk-dots"><i></i><i></i><i></i><i></i></div>
    <div class="lk-pad">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
    <button type="button" class="lk-forgot" id="lk-forgot">PIN bhool gaye?</button></div>`;
  document.body.appendChild(o);
  let pin = '';
  const dots = o.querySelectorAll('#lk-dots i'), sub = o.querySelector('#lk-sub');
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const press = async (k) => {
    if (Date.now() < lockedUntil) { sub.textContent = `${Math.ceil((lockedUntil - Date.now()) / 1000)}s ruko…`; return; }
    if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    paint();
    if (pin.length === 4) {
      if (await AppLock.verify(pin)) { fails = 0; AppLock.unlock(); }
      else {
        fails++; pin = ''; sub.textContent = 'Galat PIN'; sub.dataset.bad = '1';
        o.querySelector('.lk-box').classList.add('shake'); setTimeout(() => o.querySelector('.lk-box') && o.querySelector('.lk-box').classList.remove('shake'), 400);
        if (fails >= 5) { lockedUntil = Date.now() + 30000; fails = 0; sub.textContent = '5 galat try — 30s ruko'; }
        setTimeout(paint, 120);
      }
    }
  };
  o.querySelectorAll('[data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  o.onkeydown = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); };
  o.tabIndex = -1; o.focus();
  o.querySelector('#lk-forgot').onclick = () => {
    sub.dataset.bad = '';
    sub.innerHTML = 'PIN recover nahi ho sakta. Sirf app ka sara data erase karke unlock hoga.<br><button type="button" class="lk-erase" id="lk-erase">Sab erase karo</button>';
    o.querySelector('#lk-erase').onclick = () => { if (window.resetEverything) window.resetEverything(); };
  };
}

// Re-lock when the app comes back after being away
document.addEventListener('visibilitychange', () => {
  if (!AppLock.enabled()) return;
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt >= AppLock.delay() * 1000) AppLock.lock();
});
if (AppLock.enabled()) { document.documentElement.classList.add('has-lock'); (document.body ? AppLock.lock() : document.addEventListener('DOMContentLoaded', () => AppLock.lock())); }

// Full reset (used by Settings → Reset app and by the lock screen)
window.resetEverything = async () => {
  try { const regs = await (navigator.serviceWorker && navigator.serviceWorker.getRegistrations()) || []; await Promise.all(regs.map(r => r.unregister())); } catch (e) {}
  try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
  try {
    const dbs = (indexedDB.databases ? await indexedDB.databases() : [{ name: 'marginal_db' }]);
    await Promise.race([Promise.all(dbs.map(d => new Promise(res => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))), new Promise(r => setTimeout(r, 1500))]);
  } catch (e) {}
  location.replace('/');
};
