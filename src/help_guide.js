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
    a: 'Settings → Advanced → AI Engine me key paste karo. App khud pehchan leti hai ki Gemini (AIza… / AQ.…), Groq (gsk_…) ya OpenRouter (sk-or-…) hai. Kai keys daal sakte ho, ek ki limit khatam ho to agli use hoti hai.',
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
    a: 'Book kholne par upar Back, Search, TOC (contents), Bookmarks, Reading Layout & Themes aur Settings (gear) ke icons hain. Previous / Next Page buttons se page badalte hain, aur neeche progress pill par tap karke ya ghasit ke kisi bhi page par jump kar sakte ho. Auto-scroll se nikalne ke liye Exit Auto-Scroll dabao.',
    go: [] },
  { id: 'book-chat', title: 'Book se AI chat', keys: 'chat ai book chapter teacher poochna explain samjhao tools focus scope reading from',
    a: 'Book ke AI chat me chapter ya current page ka focus chip dikhta hai, usi hisse se AI jawab deta hai. Teach aur Quiz upar hain, baaki sab "Tools" chip me milta hai.',
    go: [] },
  { id: 'quiz', title: 'Quiz banana', keys: 'quiz mcq test question practice galti mistakes revise generator',
    a: 'Book chat ke Tools me Quiz Generator hai: chapter chuno, MCQ / fill in the blank / short answer ka mix lo. Quiz graded hota hai aur galtiyan revise ke liye save hoti hain.',
    go: [] },
  { id: 'ocr', title: 'Scanned page ka text select karna (Scan text)', keys: 'scan text ocr saare sab sare saare pages ek click batch scanned page select highlight copy nahi ho raha photo wali pdf image pdf text nahi',
    a: 'Scanned (photo wali) page par upar "Scan text" button aata hai. Dabane par app page padhti hai aur uske baad us page ke shabd normal page ki tarah select, highlight aur copy ho sakte hain. Ye text save ho jaata hai, isliye page dobara kholne par apne aap wapas aa jaata hai. Pehli baar OCR data ke liye internet chahiye; English aur Hindi dono padhti hai. Dhundhli ya tedhi photo me kuch shabd galat ya chhoot sakte hain. Har page par alag se dabana na pade to "Saare pages scan →" dabao: ek tap me saare scanned pages ek ke baad ek scan ho jaate hain (text wale pages chhod diye jaate hain), upar progress dikhta hai aur Pause / Stop bhi hai.',
    go: [] },
  { id: 'select', title: 'Text select karke kya kar sakte ho', keys: 'select selected selection long press highlight underline copy define translate listen search note toolbar rang color shabd ka matlab',
    a: 'Kisi shabd par long-press karke select karo. Toolbar me Highlight, Underline, Copy, Define (matlab), Translate, Listen (padh ke sunao), Search aur Add note milte hain. Rang chunne ke liye color dots, aur apna rang custom color picker se. "Full panel" se poora tool panel khulta hai.',
    go: [] },
  { id: 'ai-menu', title: 'AI study tools (reader me)', keys: 'ai menu tools summarize explain flashcards mcq key facts word meaning revision notes question paper sparkle ai button',
    a: 'Reader me AI button dabao: upar "Chat AI about the book" (ya text select ho to "Ask AI about this selection") aur neeche tools: Summarize, Explain simply, Flashcards, MCQs, Key facts & dates, Word meaning, Revision notes aur Question Paper.',
    go: [] },
  { id: 'chat-tools', title: 'Book chat ke Tutor tools aur modes', keys: 'tutor tools chat teach chapter summarise exam points analogy flowchart diagram map quiz step walkthrough mnemonic memory tricks evaluator mode',
    a: 'Book chat ke Tools me Teach Me Chapter, Summarise Chapter, Exam Points, Simple Analogy, Flowchart, Visual / Diagram, Map dikhao, Quiz me aur Step-by-Step jaise shortcuts hain. AI ke modes bhi hain: Academic & Rigorous, Exam Answer Evaluator, Memory Tricks & Mnemonics aur Rapid Revision & Key Facts.',
    go: [] },
  { id: 'chat-actions', title: 'Chat ke jawab ke saath kya kar sakte ho', keys: 'chat jawab copy listen speak save notes flashcard retry delete message action',
    a: 'Har AI jawab par: Copy, Speak (sunna), Save to notes, Make flashcard, Retry (dobara jawab) aur Delete message ke options hote hain.',
    go: [] },
  { id: 'papers', title: 'Question Paper banana', keys: 'question paper exam paper test banana timer attempt marks print pdf practice sample paper revision cards',
    a: 'Home ke Question Papers me chapters chuno aur paper banao. Paper timer ke saath attempt hota hai, result me score aur galtiyan dikhti hain, aur galtiyon se "revision cards" ban jaate hain jo Review me jaate hain. Paper ko print ya Save as PDF bhi kar sakte ho.',
    go: [{ l: 'Home jao', t: 'nav', n: 'dashboard' }] },
  { id: 'review', title: 'Review (spaced revision flashcards)', keys: 'review flashcard spaced revision again hard good easy card revise yaad karna keep it',
    a: 'Review tab me flashcards aate hain. Card par tap karke jawab dekho, phir Again / Hard / Good / Easy se batao kitna yaad tha, app agla review usi hisaab se lagati hai.',
    go: [{ l: 'Review jao', t: 'nav', n: 'review' }] },
  { id: 'notes', title: 'Study Notes', keys: 'notes study notes likhna save ai answer export notes tab',
    a: 'Notes tab me tumhare study notes rehte hain. AI ke jawab ya selected text se "Save to notes" / "Add note" karke yahan jod sakte ho. Notes ka export Settings → Backup se hota hai.',
    go: [{ l: 'Notes jao', t: 'nav', n: 'notes' }] },
  { id: 'bookmarks', title: 'Bookmark (page save karna)', keys: 'bookmark nishan page save yaad bookmarks',
    a: 'Reader ke upar bookmark icon se page save karo. Saare bookmarks Bookmarks tab me milte hain aur wahan se seedha us page par ja sakte ho.',
    go: [{ l: 'Bookmarks jao', t: 'nav', n: 'bookmarks' }] },
  { id: 'home', title: 'Home screen', keys: 'home dashboard library streak spent retention books continue reading ai tutor folder subject',
    a: 'Home par Continue reading, stats (Streak, Spent, Retention, Books), tumhari library, Question Papers aur AI Tutor ke chats dikhte hain. Book ke menu se Rename book, Subject / Sub-category aur folder (Main Folder) badal sakte ho.',
    go: [{ l: 'Home jao', t: 'nav', n: 'dashboard' }] },
  { id: 'plan', title: 'Exam Plan & Smart Pace', keys: 'exam plan date smart pace study plan roz kitna padhna schedule timetable',
    a: 'Exam Plan me exam date set karo aur "Plan banao" dabao. App batati hai ki roz kitna padhna hai taaki time par syllabus khatam ho. Plan hatana ho to "Plan hata do".',
    go: [] },
  { id: 'organize', title: 'PDF ke pages organize karna', keys: 'organize pdf pages merge reorder delete rotate page tools jodna combine',
    a: 'Home par "Organize PDF" tool se PDF ke pages ko sambhal sakte ho (jaise pages jodna ya hatana). Original book ko badalne se pehle Backup lena achha rehta hai.',
    go: [{ l: 'Home jao', t: 'nav', n: 'dashboard' }] },
  { id: 'autoscroll', title: 'Auto-scroll aur padh ke sunana', keys: 'autoscroll auto scroll apne aap scroll speed slower faster listen tts read aloud sunna awaaz',
    a: 'Reader me auto-scroll ke Slower / Faster buttons se speed badal sakte ho. Kisi text ko select karke "Listen" dabane par app use padh ke sunati hai.',
    go: [] },
  { id: 'settings-map', title: 'Settings me kya kya hai', keys: 'settings setting sections kya kya hai kahan milega options list',
    a: 'Settings me upar se: Help & Guide, Appearance, Reading Mode, Reading Options, Pro Design Theme, Performance, Storage, Backup, Advanced (AI Engine, Response Style, Privacy Lock, Storage Cleaner, Reset App), About, App Updates & Refresh aur sabse neeche Installation.',
    go: [{ l: 'Advanced kholo', t: 'adv', id: 'adv-keys-card' }] },
  { id: 'reader-settings', title: 'Reader Settings (gear)', keys: 'reader settings gear options page view scroll appearance theme bottom navigation double tap default markup style draw annotations inspector',
    a: 'Reader ke upar Settings (gear) me: Appearance Theme, Page View & Scroll (Continuous Scroll wagairah), Auto-Scroll Speed, Double-Tap Page Action, Default Markup Style, Draw & Annotations, Bottom Navigation Bar aur Advanced Settings milte hain. Alag "Reading Layout & Themes" icon se padhne ka layout aur theme badalta hai.',
    go: [] },
  { id: 'focus', title: 'Focus Mode, orientation aur selection lock', keys: 'focus mode status bar hide lock portrait landscape rotate rotation orientation screen lock text selection full screen distraction',
    a: 'Reader Settings me Focus Mode (distraction kam), Hide System Status Bars (zyada screen), Lock Portrait / Lock Landscape (screen ghoomne se roke) aur Lock Text Selection (galti se select na ho) ke options hain.',
    go: [] },
  { id: 'ambient', title: 'Ambient sound aur screensaver', keys: 'ambient soundscape sound rain fireplace coffee shop ocean screensaver background awaaz music padhte waqt',
    a: 'Reader Settings me Ambient Soundscape (jaise Gentle Rain, Fireplace, Coffee Shop, Deep Ocean) aur Ambient Screensaver ka option hai, taaki padhte waqt mann laga rahe.',
    go: [] },
  { id: 'tabs', title: 'Neeche ke tabs', keys: 'tab tabs navigation menu neeche bar paanch',
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

const STOP = new Set('kaise kya ka ki ke me mein hai ho hoga ko se ye wo kar karu karo karna kare karun text lagaun lagana chahiye hum mujhe mera meri apna apni the to bhi aur par pe'.split(' '));
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
