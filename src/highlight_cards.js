// @ts-nocheck
// Highlights -> flashcards, without any AI call: each highlight becomes a fill-in-the-blank card
// (the key term is hidden, the full sentence is the answer). Cards go to the normal Review Deck.

const STOP = new Set(('the and for that with this from which are was were has have had not but they their there these those into over under about between because while when where what who whom whose then than also such can could would should may might will shall been being its our your his her she him you them out use used using each other more most some any all one two three first second very just only like both many much same own through during before after again further once here why how per via within without across along among').split(' '));

const clean = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Picks the word worth hiding: numbers/terms with capitals first, otherwise the longest non-stopword. */
export function pickBlank(words) {
  let best = -1, bestScore = 0;
  words.forEach((raw, i) => {
    const w = clean(raw);
    if (!w || STOP.has(w.toLowerCase())) return;
    const dev = /[ऀ-ॿ]/.test(w);
    if (w.length < (dev ? 4 : 5) && !/\d/.test(w)) return;
    let score = w.length;
    if (/\d/.test(w)) score += 6;
    if (i > 0 && /^\p{Lu}/u.test(w)) score += 4;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** One highlight -> {front, back} or null when it is too short to make a good card. */
export function highlightToCard(text, page) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 25) return null;
  const words = t.split(' ');
  const i = pickBlank(words);
  if (i < 0) return null;
  const answer = clean(words[i]);
  const blanked = words.slice();
  blanked[i] = words[i].replace(answer, '_____');
  return { front: `Fill the blank (page ${page}):\n${blanked.join(' ')}`, back: `${answer}\n\n${t}` };
}

export async function makeCardsFromHighlights(fileId) {
  const annots = (await window.DB.byIndex('annotations', 'fileId', fileId)).filter((a) => a.rects && a.rects.length && a.text);
  let added = 0, existed = 0, skipped = 0;
  for (const a of annots) {
    const id = `hl-${a.id}`;
    if (await window.DB.get('flashcards', id).catch(() => null)) { existed++; continue; } // keep its study progress
    const c = highlightToCard(a.text, a.page);
    if (!c) { skipped++; continue; }
    await window.DB.put('flashcards', { id, fileId, page: a.page, category: 'Highlights', front: c.front, back: c.back, due: Date.now(), stability: 1.5, difficulty: 3, reps: 0, lapses: 0, createdAt: Date.now() });
    added++;
  }
  return { added, existed, skipped };
}

window.makeCardsFromHighlights = makeCardsFromHighlights;
