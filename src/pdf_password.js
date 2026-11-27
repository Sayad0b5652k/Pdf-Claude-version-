// @ts-nocheck
/* Password-protected PDFs
 *
 *  - The password is asked once (when the book is imported, or on the reader's unlock screen) and kept
 *    ONLY in memory for the current session. It is never written to storage.
 *  - After that, every pdf.js load of the same file gets the password automatically (AI tools, chapter
 *    detection, page thumbnails ...), so the other modules do not need to know about passwords at all.
 *  - The stored PDF stays encrypted exactly as it was imported. Such books are flagged `encrypted`, get a
 *    generated cover (page 1 is never drawn into the library) and the tools that rewrite PDF bytes with
 *    pdf-lib (pages, merge, annotated export) say why they are unavailable instead of failing.
 *
 * pdf.js 3.x exposes getDocument as a non-configurable getter, so window.pdfjsLib is swapped for a thin Proxy.
 */

const unlocked = new Map(); // fingerprint of the PDF bytes -> password (memory only)

function bytesOf(data) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/** Cheap identity of a PDF: its length plus a hash of the first and last 4 KB (the trailer with the unique /ID is at the end). */
export function pdfFingerprint(data) {
  const u8 = bytesOf(data);
  if (!u8 || !u8.length) return '';
  const n = u8.length, K = 4096;
  let h = 2166136261 >>> 0;
  const mix = (from, to) => { for (let i = from; i < to; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } };
  mix(0, Math.min(K, n));
  if (n > K) mix(Math.max(K, n - K), n);
  return n + ':' + h.toString(16);
}

export function rememberPdfPassword(data, password) {
  const k = pdfFingerprint(data);
  if (k && password) unlocked.set(k, String(password));
}

export function knownPdfPassword(data) {
  const k = pdfFingerprint(data);
  return k ? unlocked.get(k) : undefined;
}

/** pdf.js rejects with PasswordException: code 1 = a password is needed, code 2 = the one given is wrong. */
export function isPasswordError(e) {
  return !!e && (e.name === 'PasswordException' || /password/i.test(String(e.message || '')));
}
export function wasWrongPassword(e) {
  return !!e && (e.code === 2 || /incorrect/i.test(String(e.message || '')));
}

/* ---- every pdf.js load of an unlocked book gets its password automatically ---- */
function installGetDocumentPatch() {
  const lib = window.pdfjsLib;
  if (!lib || lib.__sayadPw || typeof lib.getDocument !== 'function') return;
  const original = lib.getDocument;
  const getDocument = function (src, ...rest) {
    try {
      let params = src;
      if (src instanceof Uint8Array || src instanceof ArrayBuffer) params = { data: src };
      if (params && typeof params === 'object' && params.data && params.password === undefined) {
        const pw = knownPdfPassword(params.data);
        if (pw) src = { ...params, password: pw };
      }
    } catch (e) { /* never block a normal load */ }
    return original.call(lib, src, ...rest);
  };
  window.pdfjsLib = new Proxy(lib, {
    get(target, key) {
      if (key === 'getDocument') return getDocument;
      if (key === '__sayadPw') return true;
      return Reflect.get(target, key, target);
    },
  });
}
installGetDocumentPatch();

/* ---- the password popup ---- */
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Resolves with the typed password, or null when the person cancels. */
export function askPdfPassword({ name = '', wrong = false } = {}) {
  return new Promise((resolve) => {
    const old = document.getElementById('pdf-pass-modal');
    if (old) old.remove();
    const root = document.createElement('div');
    root.id = 'pdf-pass-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Password required');
    root.style.cssText = 'position:fixed; inset:0; z-index:100000; display:flex; align-items:flex-start; justify-content:center; padding:13vh 18px 0; background:rgba(8,8,12,.58); -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px);';
    const lock = typeof window.icon === 'function' ? window.icon('lock', 'icon icon-lg') : '';
    root.innerHTML = `
      <div id="pdf-pass-card" style="width:100%; max-width:340px; background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:20px; padding:22px 20px 16px; box-shadow:0 22px 60px rgba(0,0,0,.4); text-align:center;">
        <div style="width:46px; height:46px; margin:0 auto 12px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:flex; align-items:center; justify-content:center;">${lock}</div>
        <div class="font-display" style="font-size:18px; font-weight:600; margin-bottom:4px;">Password protected</div>
        <div style="font-size:13px; color:var(--text-dim); margin-bottom:14px; word-break:break-word;">${name ? 'Enter the password to open <b>' + escHtml(name) + '</b>.' : 'Enter the password to open this PDF.'}</div>
        <div style="position:relative; margin-bottom:6px;">
          <input id="pdf-pass-input" type="password" placeholder="Password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" style="width:100%; padding:12px 56px 12px 12px; font-size:16px; text-align:center;">
          <button type="button" id="pdf-pass-eye" class="btn" style="position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:6px 9px; font-size:11.5px; background:transparent; color:var(--text-dim);">Show</button>
        </div>
        <div id="pdf-pass-err" role="alert" style="min-height:18px; font-size:12.5px; color:#d64545; margin-bottom:8px;">${wrong ? 'Wrong password, try again.' : ''}</div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-ghost" id="pdf-pass-cancel" style="flex:1; padding:12px;">Cancel</button>
          <button type="button" class="btn btn-primary" id="pdf-pass-go" style="flex:1; padding:12px;">Unlock</button>
        </div>
      </div>`;
    document.body.appendChild(root);

    const card = root.querySelector('#pdf-pass-card');
    const input = root.querySelector('#pdf-pass-input');
    const eye = root.querySelector('#pdf-pass-eye');
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', onBack);
      document.removeEventListener('keydown', onKey, true);
      try { root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }); } catch (e) { /* no animation support */ }
      setTimeout(() => root.remove(), 140);
      resolve(value);
    };
    const submit = () => { if (!input.value) { input.focus(); return; } finish(input.value); };
    const onBack = () => finish(null);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      else if (e.key === 'Enter' && root.contains(document.activeElement)) { e.preventDefault(); submit(); }
    };
    window.addEventListener('popstate', onBack);
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', (e) => { if (e.target === root) finish(null); });
    root.querySelector('#pdf-pass-cancel').onclick = () => finish(null);
    root.querySelector('#pdf-pass-go').onclick = submit;
    eye.onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.textContent = show ? 'Hide' : 'Show';
      input.focus();
    };
    try {
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
      card.animate([{ transform: 'translateY(14px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.25,.8,.3,1)' });
      if (wrong) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 300, delay: 120 });
    } catch (e) { /* no animation support */ }
    setTimeout(() => input.focus(), 60);
  });
}

/**
 * Opens a PDF for import. If it needs a password, asks for it (again on a wrong one) until it opens or the person cancels.
 * Resolves { doc, locked } where `locked` means the file really is password protected. Rejects with name 'PasswordCancelled' on cancel.
 */
export async function loadPdfWithPrompt(raw, name) {
  installGetDocumentPatch();
  const load = (pw) => (typeof window.loadPdfDocumentSafely === 'function'
    ? window.loadPdfDocumentSafely(raw, pw)
    : window.pdfjsLib.getDocument({ data: raw.slice(0), ...(window.PDFJS_LOAD_OPTS || {}), ...(pw ? { password: pw } : {}) }).promise);
  // Opened earlier this session with a password (e.g. the same file added twice): it still counts as locked.
  const alreadyKnown = !!knownPdfPassword(raw);
  try {
    return { doc: await load(), locked: alreadyKnown };
  } catch (err) {
    if (!isPasswordError(err)) throw err;
    let wrong = wasWrongPassword(err);
    for (;;) {
      const pw = await askPdfPassword({ name, wrong });
      if (pw == null) { const e = new Error('Password not entered'); e.name = 'PasswordCancelled'; throw e; }
      try {
        const doc = await load(pw);
        rememberPdfPassword(raw, pw);
        return { doc, locked: true };
      } catch (e) {
        if (!isPasswordError(e)) throw e;
        wrong = true;
      }
    }
  }
}

/* ---- tools that rewrite the PDF bytes cannot work on an encrypted file ---- */
export function isLockedBook(fid) {
  const f = ((window.State && window.State.files) || []).find((x) => x.id === fid);
  return !!(f && f.encrypted);
}

/** Tells the person why a tool is unavailable for a password-protected book. Returns true when it refused. */
export function refuseIfLocked(fid, what) {
  if (!isLockedBook(fid)) return false;
  window.toast(`This PDF is password protected, so ${what} isn't available for it yet.`);
  return true;
}

window.loadPdfWithPrompt = loadPdfWithPrompt;
window.askPdfPassword = askPdfPassword;
window.rememberPdfPassword = rememberPdfPassword;
window.isPdfPasswordError = isPasswordError;
window.isLockedBook = isLockedBook;
window.refuseIfLocked = refuseIfLocked;
