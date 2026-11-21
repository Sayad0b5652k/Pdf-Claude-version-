// @ts-nocheck
// Help & Guide: hand-written app guide + tiny offline search + optional AI explainer (grounded in the same guide).
// go: {t:'adv', id} = open Settings → Advanced and scroll to #id · {t:'set', id} = Settings main page, scroll to #id/selector
export const GUIDE = [
  { id: 'lock', title: 'PIN lock lagana', keys: 'pin lock tala password privacy suraksha secure chhupana app lock fingerprint',
    a: 'Settings → Advanced → Privacy Lock me 4 digit PIN daalo aur dobara confirm karo. Auto-lock Turant / 1 min / 5 min chun sakte ho. Ye casual logon se bachne ke liye hai, encryption nahi.',
    go: [{ l: 'Privacy Lock kholo', t: 'adv', id: 'lock-card' }] },
  { id: 'pin-forgot', title: 'PIN bhool gaye', keys: 'pin bhool forgot recover reset unlock password yaad nahi',
    a: 'PIN recover nahi ho sakta. Lock screen par "PIN bhool gaye?" dabao, ye app ka sara data erase karke unlock karta hai. Isliye pehle Backup lena achha hai.',
    go: [{ l: 'Backup kholo', t: 'set', id: 'btn-export' }] },
  { id: 'keys', title: 'Apni API key daalna', keys: 'api key daalna add gemini groq openrouter byok apni key personal custom provider',
    a: 'Settings → Advanced → AI Engine me key paste karo. App khud pehchan leti hai ki Gemini (AIza…), Groq (gsk_…) ya OpenRouter (sk-or-…) hai. Kai keys daal sakte ho, ek ki limit khatam ho to agli use hoti hai.',
    go: [{ l: 'AI Engine kholo', t: 'adv', id: 'adv-keys-card' }] },
  { id: 'ring', title: 'Key ka circle (quota)', keys: 'circle ring quota limit bacha kitna khatam percent status key',
    a: 'Har key ke bagal ka circle bacha hua quota dikhata hai. Groq aur OpenRouter ka asli quota milta hai. Gemini ka quota Google batata nahi, isliye wo app ke apne count ka estimate hai. Lal "!" = key reject hui.',
    go: [{ l: 'Keys dekho', t: 'adv', id: 'adv-keys-card' }] },
  { id: 'ai-fail', title: 'AI jawab nahi de raha', keys: 'ai nahi chal raha jawab nahi error limit quota fail slow response nahi aa raha',
    a: 'Pehle internet check karo, AI ke liye net chahiye. Phir Advanced me key ka circle dekho: lal ya amber ho to limit lagi hai, thodi der baad try karo ya doosri key daalo. "Sab check karo" dabake keys test kar sakte ho.',
    go: [{ l: 'Keys check karo', t: 'adv', id: 'adv-keys-card' }] },
  { id: 'style', title: 'AI jawab kaise dikhe', keys: 'response style streaming typing word live flow wave instant jawab dikhna animation delivery',
    a: 'Advanced → AI Response Style me teen option hain: Live Flow (word by word), Wave (section by section) aur Instant (poora ek saath).',
    go: [{ l: 'Response Style kholo', t: 'adv', id: 'adv-seg' }] },
  { id: 'cleaner', title: 'Jagah khali karna', keys: 'storage jagah space khali delete purani books memory bhar gaya cleaner size mb',
    a: 'Advanced → Storage Cleaner → "Books scan karo". 60 din se purani ya kabhi na khuli books pehle se select hoti hain. Delete karne par us book ke notes aur highlights bhi jaate hain, isliye pehle Backup lo.',
    go: [{ l: 'Cleaner kholo', t: 'adv', id: 'clean-card' }] },
  { id: 'reset', title: 'App reset karna', keys: 'reset erase sab mita factory clear data naya shuru delete everything',
    a: 'Advanced → Reset App me RESET type karo, tab button chalta hai. Books, notes, settings, keys aur lock sab mit jaate hain. Pehle Backup lo.',
    go: [{ l: 'Reset kholo', t: 'adv', id: 'reset-card' }] },
  { id: 'backup', title: 'Backup aur Restore', keys: 'backup restore export import notes bookmarks save wapas data transfer naya phone',
    a: 'Settings → Backup me "Export notes & bookmarks" se file banti hai (notes, highlights, flashcards wagairah). Naye phone par "Restore" se wapas la sakte ho. PDF books file me nahi hoti, unhe dobara import karna padta hai.',
    go: [{ l: 'Backup kholo', t: 'set', id: 'btn-export' }] },
  { id: 'theme', title: 'Day / Night / Sepia', keys: 'theme dark night day sepia light mode andhera raat rang color',
    a: 'Settings → Appearance me Day, Night aur Sepia chun sakte ho. "Auto theme" ON karo to phone ke hisaab se badalta rahega.',
    go: [{ l: 'Appearance kholo', t: 'set', sel: '[data-theme-btn]' }] },
  { id: 'pro-theme', title: 'Classic / Editorial / Notebook design', keys: 'pro design theme classic editorial notebook look style app ka design badalna',
    a: 'Settings → Pro Design Theme me teen designs hain: Classic, Editorial aur Notebook. Chunte hi poore app ka look badal jaata hai.',
    go: [{ l: 'Design theme kholo', t: 'set', sel: '[data-set-pro-theme]' }] },
  { id: 'lite', title: 'App slow ya atakti hai', keys: 'slow lag atak hang smooth animation halka lite motion fast performance dheema phone purana',
    a: 'Settings → Performance me "Lite motion" ON karo. Animations kam ho jaate hain aur purane phone par app halki chalti hai.',
    go: [{ l: 'Lite motion kholo', t: 'set', sel: '[data-opt="liteMotion"]' }] },
  { id: 'install', title: 'App install karna', keys: 'install pwa home screen add app download phone icon',
    a: 'Settings me sabse neeche "Install S.A.Y.A.D. App" button hai. Isse app home screen par aa jaati hai aur offline bhi chalti hai.',
    go: [{ l: 'Install kholo', t: 'set', sel: '#btn-install-pwa-settings' }] },
  { id: 'update', title: 'App update karna', keys: 'update refresh naya version latest upgrade reload purana',
    a: 'Settings → App Updates & Refresh me "Check Updates & Refresh App" dabao. Latest version lag jaata hai, tumhari books, notes aur highlights safe rehte hain.',
    go: [{ l: 'Update kholo', t: 'set', id: 'btn-force-safe-update' }] },
  { id: 'reading', title: 'Padhne ke options', keys: 'reading screen awake sleep page number smooth scroll continuous single page swipe scroll mode',
    a: 'Settings → Reading Mode me Continuous (scroll) ya Single page (swipe) chuno. Reading Options me screen awake, page number aur smooth scroll ke toggles hain.',
    go: [{ l: 'Reading options kholo', t: 'set', sel: '[data-opt="showPageNumber"]' }] },
  { id: 'reader-tools', title: 'Book ke andar search, index, bookmark', keys: 'search dhundo index toc contents bookmark reader page jump chapter dhundna book andar',
    a: 'Book kholne par upar search (🔍), contents/TOC, bookmark aur settings ke icons hain. Neeche progress pill par tap karke kisi bhi page par jump kar sakte ho.',
    go: [] },
  { id: 'book-chat', title: 'Book se AI chat', keys: 'chat ai book chapter teacher poochna explain samjhao tools focus scope reading from',
    a: 'Book ke AI chat me chapter ya current page ka focus chip dikhta hai, usi hisse se AI jawab deta hai. Teach aur Quiz upar hain, baaki sab "Tools" chip me milta hai.',
    go: [] },
  { id: 'quiz', title: 'Quiz banana', keys: 'quiz mcq test question practice galti mistakes revise generator',
    a: 'Book chat ke Tools me Quiz Generator hai: chapter chuno, MCQ / fill in the blank / short answer ka mix lo. Quiz graded hota hai aur galtiyan revise ke liye save hoti hain.',
    go: [] },
  { id: 'tabs', title: 'Neeche ke tabs', keys: 'home bookmarks review notes settings tab navigation menu neeche bar kahan',
    a: 'Neeche paanch tabs hain: Home (library), Bookmarks, Review, Notes aur Settings.',
    go: [{ l: 'Home jao', t: 'nav', n: 'dashboard' }, { l: 'Notes jao', t: 'nav', n: 'notes' }] },
  { id: 'import', title: 'Book (PDF) jodna', keys: 'pdf import add book jodna upload library kitab file nayi',
    a: 'Home par import button se PDF chuno. Book is device par hi save hoti hai (IndexedDB), kahin upload nahi hoti.',
    go: [{ l: 'Home jao', t: 'nav', n: 'dashboard' }] },
  { id: 'privacy', title: 'Data kahan jaata hai', keys: 'privacy data safe upload server cloud kahan jata hai surakshit',
    a: 'Books, notes aur flashcards sirf tumhare device par rehte hain. Sirf AI ke sawal, dictionary aur OCR lookups jo tum khud chalate ho, server tak jaate hain.',
    go: [] },
  { id: 'offline', title: 'Bina internet ke', keys: 'offline internet net nahi bina wifi chalega',
    a: 'Install ke baad padhna, notes aur bookmarks offline chalte hain. AI jawab aur dictionary ke liye internet chahiye.',
    go: [] },
];

const STOP = new Set('kaise kya ka ki ke me mein hai ho hoga ko se ye wo kar karu karo karna kare karun lagaun lagana chahiye hum mujhe mera meri apna apni the to bhi aur par pe'.split(' '));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
const toks = (s) => norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t));
const INDEX = GUIDE.map(e => ({ e, keys: new Set(toks(e.keys + ' ' + e.title)), title: new Set(toks(e.title)) }));

export function searchGuide(q, limit = 3) {
  const qt = toks(q); if (!qt.length) return [];
  const res = [];
  for (const it of INDEX) {
    let s = 0;
    for (const t of qt) {
      if (it.keys.has(t)) s += it.title.has(t) ? 4 : 3;
      else if (t.length >= 3) { for (const k of it.keys) { if (k.length >= 3 && (k.startsWith(t) || t.startsWith(k))) { s += 1.6; break; } } }
    }
    if (s >= 2) res.push({ e: it.e, s });
  }
  return res.sort((a, b) => b.s - a.s).slice(0, limit).map(r => r.e);
}

export function logMiss(q) {
  try { const a = JSON.parse(localStorage.getItem('sayad_help_miss') || '[]'); a.unshift({ q: String(q).slice(0, 120), t: Date.now() }); localStorage.setItem('sayad_help_miss', JSON.stringify(a.slice(0, 40))); } catch (e) {}
}

// AI explainer: answers only from the guide
export async function askHelpAI(q) {
  const guide = GUIDE.map(e => `- ${e.title}: ${e.a}`).join('\n');
  const sys = 'Tum S.A.Y.A.D. study app ke Help assistant ho. Sirf neeche diye GUIDE ke hisaab se Hinglish me 2-4 chhote vaakyon me jawab do, aur kahan jaana hai (Settings → ...) saaf batao. Agar guide me jawab nahi hai to seedha bolo "Ye mujhe guide me nahi mila" aur kuch gadho mat. GUIDE:\n' + guide;
  const customKey = (window.State && window.State.customGeminiKey) || undefined;
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ prompt: String(q).slice(0, 300), systemInstruction: sys, temperature: 0.2, customKey }) });
    if (!r.ok) return null;
    const d = await r.json(); return (d.text || '').trim() || null;
  } catch (e) { return null; } finally { clearTimeout(to); }
}
