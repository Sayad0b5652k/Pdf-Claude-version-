// @ts-nocheck
import {
  fetchWithTimeout,
  callGroqFast,
  callGroq70b,
  callOpenRouter,
  extractRangeText
} from "./study_core.js";


export function getVerbForms(word) {
  const w = word.toLowerCase().trim();
  const irregulars = {
    be: { v1: 'be', v2: 'was/were', v3: 'been', ing: 'being', s: 'is' },
    have: { v1: 'have', v2: 'had', v3: 'had', ing: 'having', s: 'has' },
    do: { v1: 'do', v2: 'did', v3: 'done', ing: 'doing', s: 'does' },
    go: { v1: 'go', v2: 'went', v3: 'gone', ing: 'going', s: 'goes' },
    write: { v1: 'write', v2: 'wrote', v3: 'written', ing: 'writing', s: 'writes' },
    read: { v1: 'read', v2: 'read', v3: 'read', ing: 'reading', s: 'reads' },
    take: { v1: 'take', v2: 'took', v3: 'taken', ing: 'taking', s: 'takes' },
    make: { v1: 'make', v2: 'made', v3: 'made', ing: 'making', s: 'makes' },
    see: { v1: 'see', v2: 'saw', v3: 'seen', ing: 'seeing', s: 'sees' },
    know: { v1: 'know', v2: 'knew', v3: 'known', ing: 'knowing', s: 'knows' },
    get: { v1: 'get', v2: 'got', v3: 'got/gotten', ing: 'getting', s: 'gets' },
    give: { v1: 'give', v2: 'gave', v3: 'given', ing: 'giving', s: 'gives' },
    find: { v1: 'find', v2: 'found', v3: 'found', ing: 'finding', s: 'finds' },
    think: { v1: 'think', v2: 'thought', v3: 'thought', ing: 'thinking', s: 'thinks' },
    tell: { v1: 'tell', v2: 'told', v3: 'told', ing: 'telling', s: 'tells' },
    become: { v1: 'become', v2: 'became', v3: 'become', ing: 'becoming', s: 'becomes' },
    show: { v1: 'show', v2: 'showed', v3: 'shown', ing: 'showing', s: 'shows' },
    leave: { v1: 'leave', v2: 'left', v3: 'left', ing: 'leaving', s: 'leaves' },
    feel: { v1: 'feel', v2: 'felt', v3: 'felt', ing: 'feeling', s: 'feels' },
    put: { v1: 'put', v2: 'put', v3: 'put', ing: 'putting', s: 'puts' },
    bring: { v1: 'bring', v2: 'brought', v3: 'brought', ing: 'bringing', s: 'brings' },
    begin: { v1: 'begin', v2: 'began', v3: 'begun', ing: 'beginning', s: 'begins' },
    keep: { v1: 'keep', v2: 'kept', v3: 'kept', ing: 'keeping', s: 'keeps' },
    hold: { v1: 'hold', v2: 'held', v3: 'held', ing: 'holding', s: 'holds' },
    speak: { v1: 'speak', v2: 'spoke', v3: 'spoken', ing: 'speaking', s: 'speaks' },
    run: { v1: 'run', v2: 'ran', v3: 'run', ing: 'running', s: 'runs' },
    eat: { v1: 'eat', v2: 'ate', v3: 'eaten', ing: 'eating', s: 'eats' },
    break: { v1: 'break', v2: 'broke', v3: 'broken', ing: 'breaking', s: 'breaks' },
    buy: { v1: 'buy', v2: 'bought', v3: 'bought', ing: 'buying', s: 'buys' },
    drive: { v1: 'drive', v2: 'drove', v3: 'driven', ing: 'driving', s: 'drives' },
    fall: { v1: 'fall', v2: 'fell', v3: 'fallen', ing: 'falling', s: 'falls' },
    fly: { v1: 'fly', v2: 'flew', v3: 'flown', ing: 'flying', s: 'flies' },
    grow: { v1: 'grow', v2: 'grew', v3: 'grown', ing: 'growing', s: 'grows' },
    sing: { v1: 'sing', v2: 'sang', v3: 'sung', ing: 'singing', s: 'sings' },
    swim: { v1: 'swim', v2: 'swam', v3: 'swum', ing: 'swimming', s: 'swims' },
  };

  if (irregulars[w]) return irregulars[w];

  let v2 = w + 'd';
  let v3 = w + 'd';
  let ing = w + 'ing';
  let s = w + 's';

  if (w.endsWith('e')) {
    v2 = w + 'd';
    v3 = w + 'd';
    ing = w.slice(0, -1) + 'ing';
    s = w + 's';
  } else if (w.endsWith('y') && !/[aeiou]y$/.test(w)) {
    v2 = w.slice(0, -1) + 'ied';
    v3 = w.slice(0, -1) + 'ied';
    ing = w + 'ing';
    s = w.slice(0, -1) + 'ies';
  } else if (/[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/.test(w) && w.length <= 6) {
    const last = w[w.length - 1];
    v2 = w + last + 'ed';
    v3 = w + last + 'ed';
    ing = w + last + 'ing';
    s = w + 's';
  } else {
    v2 = w + 'ed';
    v3 = w + 'ed';
  }

  return { v1: w, v2, v3, ing, s };
}

export function detectPrimaryPOS(cleanWord, freeDictData, datamuseData, wiktionaryData) {
  if (/ism$|ist$|ness$|ity$|tion$|sion$|ment$|ance$|ence$|ship$|hood$|or$|er$|ology$/i.test(cleanWord)) {
    const knownVerbsWithEr = ['gather', 'filter', 'foster', 'render', 'alter', 'bother', 'deliver', 'discover', 'recover', 'stagger'];
    if (!knownVerbsWithEr.includes(cleanWord)) return 'Noun';
  }
  if (/ize$|ise$|ify$|ate$/i.test(cleanWord) && cleanWord.length > 4) {
    return 'Verb';
  }
  if (/ous$|ful$|less$|able$|ible$|ic$|ive$/i.test(cleanWord) && cleanWord.length > 4) {
    return 'Adjective';
  }
  if (/ly$/i.test(cleanWord) && cleanWord.length > 4 && !['family', 'rally', 'belly', 'ally', 'jelly', 'chili', 'holy', 'ugly', 'silly'].includes(cleanWord)) {
    return 'Adverb';
  }

  const posVotes = { Noun: 0, Verb: 0, Adjective: 0, Adverb: 0, Pronoun: 0, Preposition: 0, Conjunction: 0, Interjection: 0 };
  const normalizePos = (p) => {
    if (!p) return null;
    const lower = p.toLowerCase().trim();
    if (lower === 'n' || lower === 'noun') return 'Noun';
    if (lower === 'v' || lower === 'verb') return 'Verb';
    if (lower === 'adj' || lower === 'adjective') return 'Adjective';
    if (lower === 'adv' || lower === 'adverb') return 'Adverb';
    if (lower === 'pron' || lower === 'pronoun') return 'Pronoun';
    if (lower === 'prep' || lower === 'preposition') return 'Preposition';
    if (lower === 'conj' || lower === 'conjunction') return 'Conjunction';
    if (lower === 'interj' || lower === 'interjection' || lower === 'int') return 'Interjection';
    return null;
  };

  if (datamuseData && Array.isArray(datamuseData)) {
    for (const item of datamuseData) {
      if (item.word.toLowerCase() === cleanWord && item.defs) {
        for (const defStr of item.defs) {
          const parts = defStr.split('\t');
          const pos = normalizePos(parts[0]);
          if (pos) posVotes[pos] = (posVotes[pos] || 0) + 3;
        }
      }
    }
  }

  const entry = freeDictData?.[0];
  if (entry?.meanings) {
    entry.meanings.forEach((m, idx) => {
      const pos = normalizePos(m.partOfSpeech);
      if (pos) {
        posVotes[pos] = (posVotes[pos] || 0) + (idx === 0 ? 5 : 2);
      }
    });
  }

  if (wiktionaryData?.en && Array.isArray(wiktionaryData.en)) {
    wiktionaryData.en.forEach((wItem, idx) => {
      const pos = normalizePos(wItem.partOfSpeech);
      if (pos) {
        posVotes[pos] = (posVotes[pos] || 0) + (idx === 0 ? 3 : 1);
      }
    });
  }

  let topPos = 'Noun';
  let maxScore = -1;
  for (const [pos, score] of Object.entries(posVotes)) {
    if (score > maxScore) {
      maxScore = score;
      topPos = pos;
    }
  }

  return topPos;
}

export function findLemmaAndInflections(word, primaryPos) {
  const w = word.toLowerCase().trim();

  // 1. Irregular Adjectives Table (Highest Priority)
  const irregularAdjectives = {
    good: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    better: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    best: { baseWord: 'good', positive: 'good', comparative: 'better', superlative: 'best' },
    bad: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    worse: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    worst: { baseWord: 'bad', positive: 'bad', comparative: 'worse', superlative: 'worst' },
    far: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    farther: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    farthest: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    further: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    furthest: { baseWord: 'far', positive: 'far', comparative: 'farther / further', superlative: 'farthest / furthest' },
    little: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    less: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    least: { baseWord: 'little', positive: 'little', comparative: 'less', superlative: 'least' },
    many: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    much: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    more: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    most: { baseWord: 'many / much', positive: 'many / much', comparative: 'more', superlative: 'most' },
    old: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    older: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    oldest: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    elder: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' },
    eldest: { baseWord: 'old', positive: 'old', comparative: 'older / elder', superlative: 'oldest / eldest' }
  };

  if (irregularAdjectives[w]) {
    return {
      baseWord: irregularAdjectives[w].baseWord,
      singular: irregularAdjectives[w].baseWord,
      plural: irregularAdjectives[w].baseWord + 's',
      positive: irregularAdjectives[w].positive,
      comparative: irregularAdjectives[w].comparative,
      superlative: irregularAdjectives[w].superlative
    };
  }

  // 2. Irregular Nouns Table (Explicitly Map 'age' -> 'ages')
  const irregularNouns = {
    ages: { baseWord: 'age', singular: 'age', plural: 'ages' },
    age: { baseWord: 'age', singular: 'age', plural: 'ages' },
    children: { baseWord: 'child', singular: 'child', plural: 'children' },
    child: { baseWord: 'child', singular: 'child', plural: 'children' },
    people: { baseWord: 'person', singular: 'person', plural: 'people' },
    person: { baseWord: 'person', singular: 'person', plural: 'people' },
    men: { baseWord: 'man', singular: 'man', plural: 'men' },
    man: { baseWord: 'man', singular: 'man', plural: 'men' },
    women: { baseWord: 'woman', singular: 'woman', plural: 'women' },
    woman: { baseWord: 'woman', singular: 'woman', plural: 'women' },
    feet: { baseWord: 'foot', singular: 'foot', plural: 'feet' },
    foot: { baseWord: 'foot', singular: 'foot', plural: 'feet' },
    teeth: { baseWord: 'tooth', singular: 'tooth', plural: 'teeth' },
    tooth: { baseWord: 'tooth', singular: 'tooth', plural: 'teeth' },
    mice: { baseWord: 'mouse', singular: 'mouse', plural: 'mice' },
    mouse: { baseWord: 'mouse', singular: 'mouse', plural: 'mice' },
    geese: { baseWord: 'goose', singular: 'goose', plural: 'geese' },
    goose: { baseWord: 'goose', singular: 'goose', plural: 'geese' },
    leaves: { baseWord: 'leaf', singular: 'leaf', plural: 'leaves' },
    leaf: { baseWord: 'leaf', singular: 'leaf', plural: 'leaves' },
    lives: { baseWord: 'life', singular: 'life', plural: 'lives' },
    life: { baseWord: 'life', singular: 'life', plural: 'lives' },
    knives: { baseWord: 'knife', singular: 'knife', plural: 'knives' },
    knife: { baseWord: 'knife', singular: 'knife', plural: 'knives' },
    halves: { baseWord: 'half', singular: 'half', plural: 'halves' },
    half: { baseWord: 'half', singular: 'half', plural: 'halves' },
    wolves: { baseWord: 'wolf', singular: 'wolf', plural: 'wolves' },
    wolf: { baseWord: 'wolf', singular: 'wolf', plural: 'wolves' },
    phenomena: { baseWord: 'phenomenon', singular: 'phenomenon', plural: 'phenomena' },
    phenomenon: { baseWord: 'phenomenon', singular: 'phenomenon', plural: 'phenomena' },
    criteria: { baseWord: 'criterion', singular: 'criterion', plural: 'criteria' },
    criterion: { baseWord: 'criterion', singular: 'criterion', plural: 'criteria' },
    radii: { baseWord: 'radius', singular: 'radius', plural: 'radii' },
    radius: { baseWord: 'radius', singular: 'radius', plural: 'radii' },
    foci: { baseWord: 'focus', singular: 'focus', plural: 'foci / focuses' },
    focus: { baseWord: 'focus', singular: 'focus', plural: 'foci / focuses' },
    stimuli: { baseWord: 'stimulus', singular: 'stimulus', plural: 'stimuli' },
    stimulus: { baseWord: 'stimulus', singular: 'stimulus', plural: 'stimuli' },
    cacti: { baseWord: 'cactus', singular: 'cactus', plural: 'cacti / cactuses' },
    cactus: { baseWord: 'cactus', singular: 'cactus', plural: 'cacti / cactuses' },
    data: { baseWord: 'datum', singular: 'datum', plural: 'data' },
    datum: { baseWord: 'datum', singular: 'datum', plural: 'data' },
    indices: { baseWord: 'index', singular: 'index', plural: 'indices / indexes' },
    index: { baseWord: 'index', singular: 'index', plural: 'indexes / indices' },
    matrices: { baseWord: 'matrix', singular: 'matrix', plural: 'matrices' },
    matrix: { baseWord: 'matrix', singular: 'matrix', plural: 'matrices' },
    analyses: { baseWord: 'analysis', singular: 'analysis', plural: 'analyses' },
    analysis: { baseWord: 'analysis', singular: 'analysis', plural: 'analyses' },
    crises: { baseWord: 'crisis', singular: 'crisis', plural: 'crises' },
    crisis: { baseWord: 'crisis', singular: 'crisis', plural: 'crises' },
    hypotheses: { baseWord: 'hypothesis', singular: 'hypothesis', plural: 'hypotheses' },
    hypothesis: { baseWord: 'hypothesis', singular: 'hypothesis', plural: 'hypotheses' },
    diagnoses: { baseWord: 'diagnosis', singular: 'diagnosis', plural: 'diagnoses' },
    diagnosis: { baseWord: 'diagnosis', singular: 'diagnosis', plural: 'diagnoses' },
    series: { baseWord: 'series', singular: 'series', plural: 'series' },
    species: { baseWord: 'species', singular: 'species', plural: 'species' },
    sheep: { baseWord: 'sheep', singular: 'sheep', plural: 'sheep' },
    deer: { baseWord: 'deer', singular: 'deer', plural: 'deer' },
    fish: { baseWord: 'fish', singular: 'fish', plural: 'fish / fishes' },
    oxen: { baseWord: 'ox', singular: 'ox', plural: 'oxen' },
    ox: { baseWord: 'ox', singular: 'ox', plural: 'oxen' },
    heroes: { baseWord: 'hero', singular: 'hero', plural: 'heroes' },
    hero: { baseWord: 'hero', singular: 'hero', plural: 'heroes' },
    potatoes: { baseWord: 'potato', singular: 'potato', plural: 'potatoes' },
    potato: { baseWord: 'potato', singular: 'potato', plural: 'potatoes' },
    tomatoes: { baseWord: 'tomato', singular: 'tomato', plural: 'tomatoes' },
    tomato: { baseWord: 'tomato', singular: 'tomato', plural: 'tomatoes' },
  };

  if (irregularNouns[w]) {
    return {
      baseWord: irregularNouns[w].baseWord,
      singular: irregularNouns[w].singular,
      plural: irregularNouns[w].plural,
      positive: irregularNouns[w].singular,
      comparative: 'more ' + irregularNouns[w].singular,
      superlative: 'most ' + irregularNouns[w].singular
    };
  }

  // Strictly Uncountable / Mass nouns check (Exclude common count nouns like age)
  const strictlyUncountable = ['water', 'air', 'rice', 'information', 'knowledge', 'advice', 'furniture', 'money', 'evidence', 'equipment', 'luggage', 'baggage', 'news', 'paper', 'butter', 'milk', 'sugar', 'salt', 'sand', 'bread', 'homework', 'gold', 'silver', 'oxygen', 'courage', 'patience'];
  if (strictlyUncountable.includes(w) || (/ism$|ness$|ity$|ance$|ence$|hood$|ship$|dom$|ics$/i.test(w) && w !== 'age')) {
    return {
      baseWord: w,
      singular: w,
      plural: 'Uncountable (mass noun)',
      positive: w,
      comparative: 'more ' + w,
      superlative: 'most ' + w
    };
  }

  // Regular Noun rule derivation
  let singular = w;
  let plural = w + 's';

  if (w.endsWith('ies') && w.length > 4) {
    singular = w.slice(0, -3) + 'y';
    plural = w;
  } else if (w.endsWith('es') && w.length > 3) {
    if (/[sxz]es$|ches$|shes$/i.test(w)) {
      singular = w.slice(0, -2);
      plural = w;
    } else if (w.endsWith('ves') && w.length > 4) {
      singular = w.slice(0, -3) + 'f';
      plural = w;
    } else {
      singular = w.slice(0, -1);
      plural = w;
    }
  } else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('is') && !w.endsWith('us') && w.length > 3) {
    singular = w.slice(0, -1);
    plural = w;
  } else if (w.endsWith('y') && !/[aeiou]y$/i.test(w)) {
    singular = w;
    plural = w.slice(0, -1) + 'ies';
  } else if (/[sxz]$|ch$|sh$/i.test(w)) {
    singular = w;
    plural = w + 'es';
  } else if (w.endsWith('e')) {
    singular = w;
    plural = w + 's';
  }

  // Regular Adjective derivation
  let positive = singular;
  let comparative = 'more ' + positive;
  let superlative = 'most ' + positive;

  if (positive.length <= 6) {
    if (positive.endsWith('e')) {
      comparative = positive + 'r';
      superlative = positive + 'st';
    } else if (positive.endsWith('y') && !/[aeiou]y$/i.test(positive)) {
      comparative = positive.slice(0, -1) + 'ier';
      superlative = positive.slice(0, -1) + 'iest';
    } else if (!positive.endsWith('ful') && !positive.endsWith('less')) {
      comparative = positive + 'er';
      superlative = positive + 'est';
    }
  }

  return {
    baseWord: singular,
    singular,
    plural,
    positive,
    comparative,
    superlative
  };
}

export async function fetchAIDictionaryVerification(word, context = '', subjectDomain = '') {
  // 1. Primary: Server-side Gemini Oxford-Grade Lexicon Engine
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch('/api/dictionary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word,
        context: context || '',
        subjectDomain: subjectDomain || window.State?.currentFile?.title || ''
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const resJson = await resp.json();
      if (resJson && resJson.data && resJson.data.word) {
        return resJson.data;
      }
    }
  } catch (err) {
    console.warn('[Dictionary] /api/dictionary call fallback or timeout:', err.message);
  }

  // 2. Fallback: Fast client LLM calls with multi-POS instruction
  const prompt = `You are an expert lexicographer. Provide comprehensive dictionary data for "${word}"${context ? ` in context: "${context}"` : ''}.
ACCURACY RULES: Include ONLY the parts of speech this word genuinely has (the two entries in "partsOfSpeech" below are a format example, delete any that do not apply). Use the context to pick the right sense for "contextMeaning". If you are not sure of a field (etymology, phonetics, an antonym), use "" or [] instead of guessing. Never invent a word, a Hindi meaning or an etymology. Synonyms and antonyms must be real, common words.
Return raw JSON ONLY with NO markdown code block tags:
{
  "word": "${word}",
  "baseWord": "root word",
  "phonetic": "IPA phonetics",
  "primaryPos": "Noun" | "Verb" | "Adjective" | "Adverb",
  "hindiMeaning": "accurate Hindi meaning (हिंदी अर्थ) in Devanagari script",
  "contextMeaning": "exact meaning in this context",
  "academicDefinition": "authoritative Oxford definition",
  "simpleExplanation": "easy 1-sentence Feynman explanation",
  "academicExample": "scholarly example sentence",
  "commonPitfall": "common student mistake or confusable pair",
  "etymology": "word origin",
  "partsOfSpeech": [
    {
      "pos": "Noun",
      "definition": "definition as Noun",
      "hindiMeaning": "Hindi meaning as Noun",
      "example": "Example sentence as Noun",
      "synonyms": ["(real synonym)"],
      "antonyms": [],
      "grammar": { "singular": "${word}", "plural": "${word}s" }
    },
    {
      "pos": "Verb",
      "definition": "definition as Verb",
      "hindiMeaning": "Hindi meaning as Verb",
      "example": "Example sentence as Verb",
      "synonyms": ["(real synonym)"],
      "antonyms": [],
      "grammar": { "v1": "${word}", "v2": "past", "v3": "past part", "ing": "-ing", "s": "-s" }
    }
  ],
  "synonyms": ["synonym1", "synonym2"],
  "antonyms": ["antonym1", "antonym2"]
}`;

  try {
    let rawText = '';
    try {
      rawText = await callGroqFast(prompt, 600);
    } catch (e1) {
      try {
        rawText = await callGroq70b(prompt, 600);
      } catch (e2) {
        rawText = await callOpenRouter(prompt, 'meta-llama/llama-3.3-70b-instruct', 600);
      }
    }

    if (rawText) {
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed && (parsed.baseWord || parsed.word)) return parsed;
    }
  } catch (e) {
    console.warn('AI Dictionary Verification fallback:', e.message);
  }
  return null;
}

export function getAdvancedGrammarForms(cleanWord, primaryPos, freeDictData, aiData) {
  const w = cleanWord.toLowerCase().trim();

  // Step 1: Check static irregular tables FIRST for 100% mathematical guarantee on good/better/best, bad/worse/worst, age/ages
  const lemmaInfo = findLemmaAndInflections(w, primaryPos);
  if (['good', 'better', 'best', 'bad', 'worse', 'worst', 'far', 'farther', 'further', 'farthest', 'furthest', 'little', 'less', 'least', 'many', 'much', 'more', 'most'].includes(w)) {
    return {
      type: 'adjective',
      isAdjective: true,
      baseWord: lemmaInfo.baseWord,
      positive: lemmaInfo.positive,
      comparative: lemmaInfo.comparative,
      superlative: lemmaInfo.superlative
    };
  }

  if (w === 'age' || w === 'ages') {
    return {
      type: 'noun',
      isNoun: true,
      baseWord: 'age',
      singular: 'age',
      plural: 'ages'
    };
  }

  // Step 2: Use AI Data if available with fallback logic
  if (aiData) {
    const aiPos = normalizePOS(aiData.primaryPos || primaryPos);
    if (aiPos === 'Verb' && aiData.v1) {
      return {
        type: 'verb',
        isVerb: true,
        baseWord: aiData.baseWord || aiData.v1,
        v1: aiData.v1,
        v2: aiData.v2 || (aiData.v1 + 'ed'),
        v3: aiData.v3 || (aiData.v1 + 'ed'),
        ing: aiData.ing || (aiData.v1 + 'ing'),
        s: aiData.s || (aiData.v1 + 's'),
        transitivity: aiData.transitivity || ''
      };
    }
    if (aiPos === 'Noun' && aiData.singular && aiData.plural) {
      let plural = aiData.plural;
      if ((w === 'age' || w === 'ages') || plural.toLowerCase().includes('uncountable') && w === 'age') {
        plural = 'ages';
      }
      return {
        type: 'noun',
        isNoun: true,
        baseWord: aiData.baseWord || aiData.singular,
        singular: aiData.singular,
        plural: plural
      };
    }
    if (aiPos === 'Adjective' && aiData.positive) {
      let positive = aiData.positive;
      let comparative = aiData.comparative || ('more ' + positive);
      let superlative = aiData.superlative || ('most ' + positive);

      if (positive === 'better' || positive === 'best' || w === 'best' || w === 'better') {
        positive = 'good';
        comparative = 'better';
        superlative = 'best';
      }

      return {
        type: 'adjective',
        isAdjective: true,
        baseWord: aiData.baseWord || positive,
        positive,
        comparative,
        superlative
      };
    }
  }

  if (primaryPos === 'Verb') {
    const vf = getVerbForms(lemmaInfo.baseWord);
    let transitivity = '';
    const entry = freeDictData?.[0];
    if (entry?.meanings) {
      for (const m of entry.meanings) {
        if (m.partOfSpeech?.toLowerCase() === 'verb') {
          for (const d of (m.definitions || [])) {
            const defText = (d.definition || '').toLowerCase();
            if (defText.includes('transitive') || defText.includes('(transitive)')) {
              transitivity = 'Transitive';
            } else if (defText.includes('intransitive') || defText.includes('(intransitive)')) {
              transitivity = 'Intransitive';
            }
          }
        }
      }
    }

    return {
      type: 'verb',
      isVerb: true,
      baseWord: lemmaInfo.baseWord,
      v1: vf.v1,
      v2: vf.v2,
      v3: vf.v3,
      ing: vf.ing,
      s: vf.s,
      transitivity
    };
  }

  if (primaryPos === 'Noun') {
    return {
      type: 'noun',
      isNoun: true,
      baseWord: lemmaInfo.baseWord,
      singular: lemmaInfo.singular,
      plural: lemmaInfo.plural
    };
  }

  if (primaryPos === 'Adjective') {
    return {
      type: 'adjective',
      isAdjective: true,
      baseWord: lemmaInfo.baseWord,
      positive: lemmaInfo.positive,
      comparative: lemmaInfo.comparative,
      superlative: lemmaInfo.superlative
    };
  }

  return {
    type: 'other',
    isOther: true,
    label: 'Not applicable for this word.'
  };
}

export function getGrammarForms(cleanWord, primaryPos, freeDictData, aiData) {
  return getAdvancedGrammarForms(cleanWord, primaryPos, freeDictData, aiData);
}

export function getCoreSynonymsAndAntonyms(cleanWord) {
  const w = cleanWord.toLowerCase().trim();
  const map = {
    good: {
      synonyms: ['excellent', 'fine', 'superior', 'admirable', 'great', 'virtuous', 'positive'],
      antonyms: ['bad', 'poor', 'inferior', 'wicked', 'evil']
    },
    better: {
      synonyms: ['superior', 'finer', 'improved', 'preferable'],
      antonyms: ['worse', 'inferior']
    },
    best: {
      synonyms: ['finest', 'top', 'optimum', 'supreme', 'prime'],
      antonyms: ['worst', 'poorest']
    },
    bad: {
      synonyms: ['poor', 'inferior', 'dreadful', 'awful', 'terrible', 'harmful'],
      antonyms: ['good', 'excellent', 'fine', 'virtuous']
    },
    worse: {
      synonyms: ['more inferior', 'poorer', 'unpleasant'],
      antonyms: ['better', 'superior']
    },
    worst: {
      synonyms: ['most inferior', 'poorest', 'dreadful'],
      antonyms: ['best', 'finest']
    },
    far: {
      synonyms: ['distant', 'remote', 'faraway', 'removed'],
      antonyms: ['near', 'close', 'nearby']
    },
    age: {
      synonyms: ['era', 'epoch', 'period', 'generation', 'lifetime', 'years'],
      antonyms: ['youth', 'infancy']
    },
    ages: {
      synonyms: ['eons', 'eras', 'epochs', 'years', 'generations'],
      antonyms: ['moments', 'seconds']
    },
    happy: {
      synonyms: ['joyful', 'cheerful', 'delighted', 'glad', 'content'],
      antonyms: ['sad', 'unhappy', 'sorrowful', 'depressed']
    },
    sad: {
      synonyms: ['unhappy', 'sorrowful', 'gloomy', 'melancholy', 'dejected'],
      antonyms: ['happy', 'joyful', 'cheerful']
    },
    big: {
      synonyms: ['large', 'huge', 'massive', 'enormous', 'gigantic'],
      antonyms: ['small', 'little', 'tiny', 'miniature']
    },
    small: {
      synonyms: ['little', 'tiny', 'miniature', 'compact', 'minor'],
      antonyms: ['big', 'large', 'huge', 'massive']
    },
    fast: {
      synonyms: ['quick', 'rapid', 'swift', 'speedy', 'brisk'],
      antonyms: ['slow', 'sluggish', 'gradual']
    },
    slow: {
      synonyms: ['sluggish', 'gradual', 'unhurried', 'leisurely'],
      antonyms: ['fast', 'quick', 'rapid', 'swift']
    },
    beautiful: {
      synonyms: ['gorgeous', 'attractive', 'stunning', 'lovely', 'handsome'],
      antonyms: ['ugly', 'unattractive', 'hideous']
    },
    smart: {
      synonyms: ['intelligent', 'clever', 'bright', 'sharp', 'shrewd'],
      antonyms: ['stupid', 'foolish', 'dumb', 'ignorant']
    },
    strong: {
      synonyms: ['powerful', 'robust', 'sturdy', 'mighty', 'tough'],
      antonyms: ['weak', 'frail', 'feeble', 'vulnerable']
    },
    weak: {
      synonyms: ['frail', 'feeble', 'fragile', 'vulnerable', 'delicate'],
      antonyms: ['strong', 'powerful', 'robust']
    },
    rich: {
      synonyms: ['wealthy', 'affluent', 'prosperous', 'abundant'],
      antonyms: ['poor', 'impoverished', 'needy']
    },
    poor: {
      synonyms: ['impoverished', 'needy', 'penniless', 'destitute'],
      antonyms: ['rich', 'wealthy', 'affluent']
    },
    hot: {
      synonyms: ['warm', 'scalding', 'boiling', 'heated'],
      antonyms: ['cold', 'chilly', 'freezing', 'cool']
    },
    cold: {
      synonyms: ['chilly', 'freezing', 'frigid', 'icy'],
      antonyms: ['hot', 'warm', 'boiling']
    },
    hard: {
      synonyms: ['difficult', 'solid', 'tough', 'firm'],
      antonyms: ['easy', 'soft', 'simple']
    },
    easy: {
      synonyms: ['simple', 'effortless', 'painless', 'uncomplicated'],
      antonyms: ['hard', 'difficult', 'demanding']
    },
    important: {
      synonyms: ['vital', 'crucial', 'essential', 'significant'],
      antonyms: ['unimportant', 'trivial', 'minor']
    },
    resilient: {
      synonyms: ['tough', 'hardy', 'adaptable', 'buoyant'],
      antonyms: ['vulnerable', 'fragile', 'weak']
    },
    ubiquitous: {
      synonyms: ['omnipresent', 'pervasive', 'everywhere', 'universal'],
      antonyms: ['rare', 'scarce', 'infrequent']
    },
    ephemeral: {
      synonyms: ['transient', 'fleeting', 'temporary', 'momentary'],
      antonyms: ['permanent', 'eternal', 'lasting']
    },
    pragmatic: {
      synonyms: ['practical', 'realistic', 'sensible', 'rational'],
      antonyms: ['idealistic', 'impractical', 'unrealistic']
    },
    word: {
      synonyms: ['term', 'expression', 'utterance', 'remark', 'statement', 'vow', 'promise', 'news'],
      antonyms: ['silence', 'inaction']
    }
  };
  return map[w] || { synonyms: [], antonyms: [] };
}

export function validateSynonymsAndAntonyms(cleanWord, primaryPos, synRawList = [], antRawList = []) {
  const isCleanWord = (w) => {
    if (!w || typeof w !== 'string') return false;
    const lower = w.toLowerCase().trim();
    if (lower === cleanWord) return false;
    if (!/^[a-z]+(-[a-z]+)*(\s[a-z]+(-[a-z]+)*)?$/i.test(lower)) return false;
    if (lower.length < 2 || lower.length > 30) return false;
    return true;
  };

  const core = getCoreSynonymsAndAntonyms(cleanWord);
  const combinedSyns = [...(core.synonyms || []), ...synRawList];
  const combinedAnts = [...(core.antonyms || []), ...antRawList];

  const cleanSyns = [];
  const synSet = new Set();
  for (const s of combinedSyns) {
    if (isCleanWord(s)) {
      const lower = s.toLowerCase().trim();
      if (!synSet.has(lower)) {
        synSet.add(lower);
        cleanSyns.push(lower);
      }
    }
  }

  const cleanAnts = [];
  const antSet = new Set();
  for (const a of combinedAnts) {
    if (isCleanWord(a)) {
      const lower = a.toLowerCase().trim();
      if (!synSet.has(lower) && !antSet.has(lower)) {
        antSet.add(lower);
        cleanAnts.push(lower);
      }
    }
  }

  return {
    synonyms: cleanSyns.slice(0, 8),
    antonyms: cleanAnts.slice(0, 8)
  };
}

export function extractHindiMeaningByPOS(cleanWord, primaryPos, primaryDef, gtxData, myMemory) {
  let selectedHindi = '';

  if (gtxData && Array.isArray(gtxData) && gtxData[1] && Array.isArray(gtxData[1])) {
    const targetPosLower = primaryPos.toLowerCase();
    const posMap = { noun: 'noun', verb: 'verb', adjective: 'adjective', adverb: 'adverb' };
    const mappedTarget = posMap[targetPosLower] || targetPosLower;

    for (const dictBlock of gtxData[1]) {
      if (Array.isArray(dictBlock) && dictBlock[0] && dictBlock[0].toLowerCase() === mappedTarget) {
        const terms = dictBlock[1];
        const detailList = dictBlock[2];
        
        if (Array.isArray(detailList) && detailList.length > 0) {
          const matchedTerms = [];
          const defKeywords = (primaryDef || '').toLowerCase().split(/\W+/).filter(w => w.length > 3);

          for (const item of detailList) {
            if (item.word && Array.isArray(item.reverse_translation)) {
              const revs = item.reverse_translation.map(r => r.toLowerCase());
              const isRelevantSense = revs.includes(cleanWord) || revs.some(r => defKeywords.some(kw => r.includes(kw)));
              if (isRelevantSense && !matchedTerms.includes(item.word)) {
                matchedTerms.push(item.word);
              }
            }
          }

          if (matchedTerms.length > 0) {
            selectedHindi = matchedTerms.slice(0, 2).join(', ');
            break;
          }
        }

        if (!selectedHindi && Array.isArray(terms) && terms.length > 0) {
          selectedHindi = terms.slice(0, 2).join(', ');
          break;
        }
      }
    }
  }

  if (!selectedHindi && gtxData && Array.isArray(gtxData) && gtxData[0]?.[0]?.[0]) {
    const raw = gtxData[0][0][0].trim();
    if (raw && raw.toLowerCase() !== cleanWord && /[\u0900-\u097F]/.test(raw)) {
      selectedHindi = raw;
    }
  }

  if (!selectedHindi && myMemory && myMemory.responseData && myMemory.responseData.translatedText) {
    const rawHi = myMemory.responseData.translatedText.trim();
    if (rawHi && rawHi.toLowerCase() !== cleanWord && !rawHi.startsWith('MYMEMORY WARNING') && /[\u0900-\u097F]/.test(rawHi)) {
      selectedHindi = rawHi;
    }
  }

  return selectedHindi ? `${cleanWord} ➔ ${selectedHindi}` : '';
}

export function parseMerriamWebsterResponse(mwData, cleanWord) {
  if (!Array.isArray(mwData) || !mwData.length) return null;
  if (typeof mwData[0] === 'string') {
    return { suggestions: mwData.slice(0, 5) };
  }

  const entries = mwData.filter(item => typeof item === 'object' && item.hwi);
  if (!entries.length) return null;

  const meanings = [];
  let pronunciation = '';
  let audioUrl = '';
  const synonyms = [];
  const antonyms = [];
  const etymologies = [];
  const headwords = [];

  entries.forEach(entry => {
    const hw = (entry.hwi?.hw || cleanWord).replace(/\*/g, '·');
    if (!headwords.includes(hw)) headwords.push(hw);

    const posRaw = entry.fl || 'Word';
    const posName = posRaw.charAt(0).toUpperCase() + posRaw.slice(1);

    if (!pronunciation && entry.hwi?.prs?.[0]?.mw) {
      pronunciation = entry.hwi.prs[0].mw;
    }
    if (!audioUrl && entry.hwi?.prs?.[0]?.sound?.audio) {
      const audioName = entry.hwi.prs[0].sound.audio;
      let subDir = audioName.charAt(0);
      if (audioName.startsWith('bix')) subDir = 'bix';
      else if (audioName.startsWith('gg')) subDir = 'gg';
      else if (/^[0-9_\W]/.test(audioName)) subDir = 'number';
      audioUrl = `https://media.merriam-webster.com/audio/prons/en/us/mp3/${subDir}/${audioName}.mp3`;
    }

    if (Array.isArray(entry.shortdef)) {
      entry.shortdef.forEach(sdef => {
        const cleaned = sdef.replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
        if (cleaned && !meanings.some(m => m.def === cleaned)) {
          meanings.push({ pos: posName, def: cleaned, source: 'Merriam-Webster' });
        }
      });
    }

    if (!meanings.length && entry.def) {
      entry.def.forEach(dObj => {
        if (Array.isArray(dObj.sseq)) {
          dObj.sseq.forEach(sseqItem => {
            sseqItem.forEach(sItem => {
              if (Array.isArray(sItem) && sItem[0] === 'sense' && sItem[1]?.dt) {
                sItem[1].dt.forEach(dtItem => {
                  if (Array.isArray(dtItem) && dtItem[0] === 'text') {
                    const textDef = dtItem[1].replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
                    if (textDef && !meanings.some(m => m.def === textDef)) {
                      meanings.push({ pos: posName, def: textDef, source: 'Merriam-Webster' });
                    }
                  }
                });
              }
            });
          });
        }
      });
    }

    if (entry.meta?.syns) {
      entry.meta.syns.flat().forEach(s => {
        if (typeof s === 'string' && !synonyms.includes(s)) synonyms.push(s);
      });
    }
    if (entry.meta?.ants) {
      entry.meta.ants.flat().forEach(a => {
        if (typeof a === 'string' && !antonyms.includes(a)) antonyms.push(a);
      });
    }

    if (entry.et && Array.isArray(entry.et)) {
      entry.et.forEach(etItem => {
        if (Array.isArray(etItem) && etItem[0] === 'text') {
          const cleanEt = etItem[1].replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').replace(/<[^>]*>/g, '').trim();
          if (cleanEt && !etymologies.includes(cleanEt)) etymologies.push(cleanEt);
        }
      });
    }
  });

  return {
    headword: headwords[0] || cleanWord,
    meanings,
    pronunciation,
    audioUrl,
    synonyms,
    antonyms,
    etymologies
  };
}

export function parseMerriamWebsterThesaurusResponse(mwThesData, cleanWord) {
  if (!Array.isArray(mwThesData) || !mwThesData.length) return null;
  if (typeof mwThesData[0] === 'string') return null;

  const synonyms = [];
  const antonyms = [];

  mwThesData.forEach(entry => {
    if (entry && typeof entry === 'object' && entry.meta) {
      if (Array.isArray(entry.meta.syns)) {
        entry.meta.syns.flat().forEach(s => {
          if (typeof s === 'string') {
            const cleanS = s.trim().toLowerCase();
            if (cleanS && cleanS !== cleanWord && !synonyms.includes(cleanS)) {
              synonyms.push(cleanS);
            }
          }
        });
      }
      if (Array.isArray(entry.meta.ants)) {
        entry.meta.ants.flat().forEach(a => {
          if (typeof a === 'string') {
            const cleanA = a.trim().toLowerCase();
            if (cleanA && cleanA !== cleanWord && !antonyms.includes(cleanA)) {
              antonyms.push(cleanA);
            }
          }
        });
      }
    }
  });

  return { synonyms, antonyms };
}

export function normalizePOS(posRaw) {
  if (!posRaw || typeof posRaw !== 'string') return 'General';
  const lower = posRaw.trim().toLowerCase();
  if (lower === 'n' || lower === 'noun') return 'Noun';
  if (lower === 'v' || lower === 'verb' || lower.includes('verb')) return 'Verb';
  if (lower === 'adj' || lower === 'adjective') return 'Adjective';
  if (lower === 'adv' || lower === 'adverb') return 'Adverb';
  if (lower === 'prep' || lower === 'preposition') return 'Preposition';
  if (lower === 'conj' || lower === 'conjunction') return 'Conjunction';
  if (lower === 'pron' || lower === 'pronoun') return 'Pronoun';
  if (lower === 'interj' || lower === 'interjection') return 'Interjection';
  if (lower.includes('phrase') || lower.includes('idiom')) return 'Phrase / Idiom';
  return posRaw.charAt(0).toUpperCase() + posRaw.slice(1).toLowerCase();
}

export async function fetchHybridDictionary(word, context = '', subjectDomain = '') {
  const cleanWord = word.toLowerCase().trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '') || word.toLowerCase().trim();
  const cacheKey = 'dict_v12_' + cleanWord + (context ? '_' + context.slice(0, 30).replace(/\s+/g, '_') : '');

  // 1. Check IndexedDB cache first
  try {
    if (window.DB && window.DB.getSetting && !context) {
      const cached = await window.DB.getSetting(cacheKey, null);
      if (cached && cached.primaryDef && cached.primaryDef !== 'Definition not available in standard dictionary datasets.') {
        return cached;
      }
    }
  } catch(e) {}

  // 2. Setup Merriam-Webster keys
  const DEFAULT_MW_DICT_KEY = 'a25615d3-9057-4b18-b917-f4bf6c173c5c';
  const DEFAULT_MW_THESAURUS_KEY = 'f0f9a8b2-85d7-4064-9737-f4432f18ef65';

  let mwDictKey = window.State?.mwDictKey || window.State?.mwApiKey || DEFAULT_MW_DICT_KEY;
  let mwThesKey = window.State?.mwThesaurusKey || DEFAULT_MW_THESAURUS_KEY;

  if (window.DB?.getSetting) {
    try {
      const dbDict = await window.DB.getSetting('mw_dict_key', '');
      if (dbDict) mwDictKey = dbDict;
      const dbThes = await window.DB.getSetting('mw_thesaurus_key', '');
      if (dbThes) mwThesKey = dbThes;
    } catch(e){}
  }

  const mwDictUrl = `https://www.dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(cleanWord)}?key=${encodeURIComponent(mwDictKey)}`;
  const mwThesUrl = `https://www.dictionaryapi.com/api/v3/references/thesaurus/json/${encodeURIComponent(cleanWord)}?key=${encodeURIComponent(mwThesKey)}`;

  // 3. Fetch Merriam-Webster, dictionaryapi.dev, Datamuse, translations & AI Lexicographer Verification simultaneously
  const [
    dictApiRes,
    datamuseRes,
    datamuseSynsRes,
    datamuseAntsRes,
    gtxRes,
    myMemoryRes,
    mwDictRes,
    mwThesRes,
    aiRes
  ] = await Promise.allSettled([
    fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=dp`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanWord)}&langpair=en|hi`, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(mwDictUrl, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchWithTimeout(mwThesUrl, {}, 9000).then(r => r.ok ? r.json() : null),
    fetchAIDictionaryVerification(cleanWord, context, subjectDomain)
  ]);

  const freeDictData = dictApiRes.status === 'fulfilled' ? dictApiRes.value : null;
  const datamuseData = datamuseRes.status === 'fulfilled' ? datamuseRes.value : null;
  const datamuseSyns = datamuseSynsRes.status === 'fulfilled' && Array.isArray(datamuseSynsRes.value) ? datamuseSynsRes.value : [];
  const datamuseAnts = datamuseAntsRes.status === 'fulfilled' && Array.isArray(datamuseAntsRes.value) ? datamuseAntsRes.value : [];
  const gtxData = gtxRes.status === 'fulfilled' ? gtxRes.value : null;
  const myMemory = myMemoryRes.status === 'fulfilled' ? myMemoryRes.value : null;
  const mwDictRaw = mwDictRes.status === 'fulfilled' ? mwDictRes.value : null;
  const mwThesRaw = mwThesRes.status === 'fulfilled' ? mwThesRes.value : null;
  const aiData = aiRes.status === 'fulfilled' ? aiRes.value : null;

  const merriamWebster = mwDictRaw ? parseMerriamWebsterResponse(mwDictRaw, cleanWord) : null;
  const mwThesaurus = mwThesRaw ? parseMerriamWebsterThesaurusResponse(mwThesRaw, cleanWord) : null;

  const primaryPos = normalizePOS(aiData?.primaryPos || detectPrimaryPOS(cleanWord, freeDictData, datamuseData, null));

  // Build Map of POS Groups to group senses, synonyms, and antonyms by Part of Speech
  const posGroupMap = new Map();

  const getPosGroup = (posRaw) => {
    const normPos = normalizePOS(posRaw);
    if (!posGroupMap.has(normPos)) {
      posGroupMap.set(normPos, {
        pos: normPos,
        senses: [],
        rawSyns: [],
        rawAnts: [],
        synonyms: [],
        antonyms: []
      });
    }
    return posGroupMap.get(normPos);
  };

  // 1. Process Merriam-Webster Dictionary
  if (Array.isArray(mwDictRaw)) {
    mwDictRaw.forEach(entry => {
      if (typeof entry === 'object' && entry.hwi) {
        const entryPos = normalizePOS(entry.fl || 'Word');
        const group = getPosGroup(entryPos);

        if (Array.isArray(entry.shortdef)) {
          entry.shortdef.forEach(sdef => {
            const cleaned = sdef.replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
            if (cleaned && !group.senses.some(s => s.def === cleaned)) {
              group.senses.push({ pos: entryPos, def: cleaned, example: '', source: 'Merriam-Webster' });
            }
          });
        }

        if (!group.senses.length && entry.def) {
          entry.def.forEach(dObj => {
            if (Array.isArray(dObj.sseq)) {
              dObj.sseq.forEach(sseqItem => {
                sseqItem.forEach(sItem => {
                  if (Array.isArray(sItem) && sItem[0] === 'sense' && sItem[1]?.dt) {
                    sItem[1].dt.forEach(dtItem => {
                      if (Array.isArray(dtItem) && dtItem[0] === 'text') {
                        const textDef = dtItem[1].replace(/\{bc\}/g, '').replace(/\{[a-z_]+\|([^}|]+)(?:\|[^}]*)?\}/g, '$1').replace(/\{[^}]+\}/g, '').trim();
                        if (textDef && !group.senses.some(s => s.def === textDef)) {
                          group.senses.push({ pos: entryPos, def: textDef, example: '', source: 'Merriam-Webster' });
                        }
                      }
                    });
                  }
                });
              });
            }
          });
        }

        if (entry.meta?.syns) {
          entry.meta.syns.flat().forEach(s => {
            if (typeof s === 'string') group.rawSyns.push(s);
          });
        }
        if (entry.meta?.ants) {
          entry.meta.ants.flat().forEach(a => {
            if (typeof a === 'string') group.rawAnts.push(a);
          });
        }
      }
    });
  }

  // 2. Process Merriam-Webster Thesaurus
  if (Array.isArray(mwThesRaw)) {
    mwThesRaw.forEach(entry => {
      if (entry && typeof entry === 'object' && entry.meta) {
        const entryPos = normalizePOS(entry.fl || 'Word');
        const group = getPosGroup(entryPos);

        if (Array.isArray(entry.meta.syns)) {
          entry.meta.syns.flat().forEach(s => {
            if (typeof s === 'string') group.rawSyns.push(s);
          });
        }
        if (Array.isArray(entry.meta.ants)) {
          entry.meta.ants.flat().forEach(a => {
            if (typeof a === 'string') group.rawAnts.push(a);
          });
        }
      }
    });
  }

  // 3. Process Free Dictionary API
  if (freeDictData && freeDictData[0] && freeDictData[0].meanings) {
    for (const m of freeDictData[0].meanings) {
      const mPos = normalizePOS(m.partOfSpeech || 'General');
      const group = getPosGroup(mPos);

      for (const d of (m.definitions || [])) {
        if (d.definition && !group.senses.some(s => s.def === d.definition)) {
          group.senses.push({ pos: mPos, def: d.definition, example: d.example || '', source: 'dictionaryapi.dev' });
        }
      }

      (m.synonyms || []).forEach(s => group.rawSyns.push(s));
      (m.antonyms || []).forEach(a => group.rawAnts.push(a));
      for (const d of (m.definitions || [])) {
        (d.synonyms || []).forEach(s => group.rawSyns.push(s));
        (d.antonyms || []).forEach(a => group.rawAnts.push(a));
      }
    }
  }

  // 4. Inject AI multi-POS structured data (CRITICAL for words like "issue" with Noun & Verb forms)
  if (aiData?.partsOfSpeech && Array.isArray(aiData.partsOfSpeech)) {
    aiData.partsOfSpeech.forEach(posItem => {
      if (posItem && posItem.pos) {
        const itemPos = normalizePOS(posItem.pos);
        const group = getPosGroup(itemPos);
        if (posItem.definition) {
          if (!group.senses.some(s => s.def === posItem.definition)) {
            group.senses.unshift({
              pos: itemPos,
              def: posItem.definition,
              example: posItem.example || '',
              source: 'Oxford Academic'
            });
          }
        }
        if (posItem.hindiMeaning) {
          group.hindiMeaning = posItem.hindiMeaning;
        }
        if (posItem.example) {
          group.example = posItem.example;
        }
        if (Array.isArray(posItem.synonyms) && posItem.synonyms.length > 0) {
          posItem.synonyms.forEach(s => {
            if (s && !group.rawSyns.includes(s)) group.rawSyns.unshift(s);
          });
        }
        if (Array.isArray(posItem.antonyms) && posItem.antonyms.length > 0) {
          posItem.antonyms.forEach(a => {
            if (a && !group.rawAnts.includes(a)) group.rawAnts.unshift(a);
          });
        }
        if (posItem.grammar) {
          group.grammar = posItem.grammar;
        }
      }
    });
  }

  // Inject AI Synonyms & Antonyms for primary POS
  if (aiData?.synonyms && Array.isArray(aiData.synonyms)) {
    const primGroup = getPosGroup(primaryPos);
    aiData.synonyms.forEach(s => {
      if (s && !primGroup.rawSyns.includes(s)) primGroup.rawSyns.unshift(s);
    });
  }
  if (aiData?.antonyms && Array.isArray(aiData.antonyms)) {
    const primGroup = getPosGroup(primaryPos);
    aiData.antonyms.forEach(a => {
      if (a && !primGroup.rawAnts.includes(a)) primGroup.rawAnts.unshift(a);
    });
  }

  // Ensure primary POS group exists
  const primGroup = getPosGroup(primaryPos || 'General');

  // 5. Process Datamuse API Synonyms and Antonyms with POS tagging
  if (datamuseSyns && Array.isArray(datamuseSyns)) {
    datamuseSyns.forEach(s => {
      if (s && s.word) {
        let matchedPos = null;
        if (Array.isArray(s.tags)) {
          const tagPos = s.tags.find(t => ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'interj'].includes(t.toLowerCase()));
          if (tagPos) matchedPos = normalizePOS(tagPos);
        }
        if (matchedPos && posGroupMap.has(matchedPos) && posGroupMap.get(matchedPos).senses.length > 0) {
          getPosGroup(matchedPos).rawSyns.push(s.word);
        } else {
          primGroup.rawSyns.push(s.word);
        }
      }
    });
  }

  if (datamuseAnts && Array.isArray(datamuseAnts)) {
    datamuseAnts.forEach(a => {
      if (a && a.word) {
        let matchedPos = null;
        if (Array.isArray(a.tags)) {
          const tagPos = a.tags.find(t => ['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'interj'].includes(t.toLowerCase()));
          if (tagPos) matchedPos = normalizePOS(tagPos);
        }
        if (matchedPos && posGroupMap.has(matchedPos) && posGroupMap.get(matchedPos).senses.length > 0) {
          getPosGroup(matchedPos).rawAnts.push(a.word);
        } else {
          primGroup.rawAnts.push(a.word);
        }
      }
    });
  }

  // 4. Inject AI-verified Multi-POS data if available
  if (Array.isArray(aiData?.partsOfSpeech) && aiData.partsOfSpeech.length > 0) {
    aiData.partsOfSpeech.forEach(pItem => {
      if (!pItem || !pItem.pos) return;
      const nPos = normalizePOS(pItem.pos);
      const group = getPosGroup(nPos);
      if (pItem.definition) {
        // Put AI definition at the very front of senses
        if (!group.senses.some(s => s.def === pItem.definition)) {
          group.senses.unshift({
            pos: nPos,
            def: pItem.definition,
            example: pItem.example || '',
            source: 'Oxford/AI Verified'
          });
        }
      }
      if (pItem.hindiMeaning) {
        group.hindiMeaning = pItem.hindiMeaning;
      }
      if (pItem.example && !group.example) {
        group.example = pItem.example;
      }
      if (Array.isArray(pItem.synonyms) && pItem.synonyms.length > 0) {
        group.rawSyns.unshift(...pItem.synonyms);
      }
      if (Array.isArray(pItem.antonyms) && pItem.antonyms.length > 0) {
        group.rawAnts.unshift(...pItem.antonyms);
      }
      if (pItem.grammar) {
        group.grammar = pItem.grammar;
      }
    });
  }

  if (aiData?.primaryDef && !primGroup.senses.some(s => s.def === aiData.primaryDef)) {
    primGroup.senses.unshift({
      pos: primaryPos || 'General',
      def: aiData.primaryDef,
      example: aiData.academicExample || '',
      source: 'AI Verified'
    });
  }

  if (!primGroup.senses.length) {
    primGroup.senses.push({
      pos: primaryPos || 'General',
      def: `Could not fetch a definition for "${cleanWord}" right now. Check your internet and search again.`,
      example: '',
      source: ''
    });
  }

  // Fold any 0-sense groups' synonyms/antonyms into primary POS group
  posGroupMap.forEach((group, pos) => {
    if (pos !== primaryPos && (!group.senses || group.senses.length === 0)) {
      if (group.rawSyns && group.rawSyns.length) {
        primGroup.rawSyns.push(...group.rawSyns);
      }
      if (group.rawAnts && group.rawAnts.length) {
        primGroup.rawAnts.push(...group.rawAnts);
      }
    }
  });

  // Validate Synonyms and Antonyms for each POS group
  posGroupMap.forEach((group) => {
    const { synonyms: valSyns, antonyms: valAnts } = validateSynonymsAndAntonyms(cleanWord, group.pos, group.rawSyns, group.rawAnts);
    group.synonyms = valSyns;
    group.antonyms = valAnts;
    if (!group.grammar) {
      group.grammar = getGrammarForms(cleanWord, group.pos, freeDictData, aiData);
    }
    if (!group.hindiMeaning) {
      const gSenseDef = group.senses?.[0]?.def || '';
      group.hindiMeaning = extractHindiMeaningByPOS(cleanWord, group.pos, gSenseDef, gtxData, myMemory);
    }
  });

  // Extract allMeanings and overall synonyms/antonyms
  const meanings = [];
  const allRawSyns = [];
  const allRawAnts = [];

  posGroupMap.forEach(group => {
    if (group.senses && group.senses.length > 0) {
      group.senses.forEach(s => {
        if (!meanings.some(exist => exist.def === s.def)) {
          meanings.push(s);
        }
      });
      group.synonyms.forEach(s => allRawSyns.push(s));
      group.antonyms.forEach(a => allRawAnts.push(a));
    }
  });

  const { synonyms, antonyms } = validateSynonymsAndAntonyms(cleanWord, primaryPos, allRawSyns, allRawAnts);
  const primaryDef = aiData?.academicDefinition || aiData?.primaryDef || meanings[0]?.def || `Definition for "${cleanWord}": standard vocabulary word.`;
  const exampleSentence = meanings.find(m => m.example)?.example || '';

  const phonetic = merriamWebster?.pronunciation ? `\\ ${merriamWebster.pronunciation} \\` : (freeDictData?.[0]?.phonetic || freeDictData?.[0]?.phonetics?.find(p => p.text)?.text || '');
  const audioUrl = merriamWebster?.audioUrl || (freeDictData?.[0]?.phonetics?.find(p => p.audio && p.audio.trim().length > 0)?.audio) || '';

  const grammar = getGrammarForms(cleanWord, primaryPos, freeDictData, aiData);
  const hindiMeaning = aiData?.hindiMeaning || extractHindiMeaningByPOS(cleanWord, primaryPos, primaryDef, gtxData, myMemory);
  const baseWord = aiData?.baseWord || grammar?.baseWord || cleanWord;

  const majorPosOrder = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Preposition', 'Conjunction', 'Pronoun', 'Interjection'];

  const validAiPosNames = (aiData?.partsOfSpeech && Array.isArray(aiData.partsOfSpeech) && aiData.partsOfSpeech.length > 0)
    ? aiData.partsOfSpeech.map(p => normalizePOS(p.pos || ''))
    : null;

  const posGroups = Array.from(posGroupMap.values())
    .filter(g => {
      if (!g.senses || g.senses.length === 0) return false;
      // Never allow Phrase / Idiom as a standalone POS card
      if (g.pos === 'Phrase / Idiom' || g.pos === 'Phrase' || g.pos === 'Idiom') return false;
      // If AI verified parts of speech, strictly only allow those verified parts of speech or primaryPos
      if (validAiPosNames && validAiPosNames.length > 0) {
        return validAiPosNames.includes(g.pos) || g.pos === primaryPos;
      }
      // Otherwise only allow major recognized parts of speech
      return majorPosOrder.includes(g.pos);
    })
    .sort((a, b) => {
      if (a.pos === primaryPos) return -1;
      if (b.pos === primaryPos) return 1;
      const idxA = majorPosOrder.indexOf(a.pos);
      const idxB = majorPosOrder.indexOf(b.pos);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

  const resultData = {
    word: cleanWord,
    baseWord,
    phonetic: aiData?.phonetic || phonetic,
    audioUrl,
    partsOfSpeech: Array.from(new Set(meanings.map(m => m.pos))),
    primaryPos,
    primaryDef: aiData?.academicDefinition || aiData?.primaryDef || primaryDef,
    contextMeaning: aiData?.contextMeaning || '',
    academicDefinition: aiData?.academicDefinition || primaryDef,
    simpleExplanation: aiData?.simpleExplanation || '',
    academicExample: aiData?.academicExample || exampleSentence,
    commonPitfall: aiData?.commonPitfall || '',
    etymology: aiData?.etymology || (merriamWebster?.etymologies?.join(' ') || ''),
    hindiMeaning: aiData?.hindiMeaning || hindiMeaning,
    allMeanings: meanings.slice(0, 10),
    posGroups,
    grammar: (aiData && aiData.grammar) ? { ...grammar, ...aiData.grammar } : grammar,
    synonyms: (aiData?.synonyms && aiData.synonyms.length > 0) ? Array.from(new Set([...aiData.synonyms, ...synonyms])).slice(0, 8) : synonyms,
    antonyms: (aiData?.antonyms && aiData.antonyms.length > 0) ? Array.from(new Set([...aiData.antonyms, ...antonyms])).slice(0, 6) : antonyms,
    exampleSentence: aiData?.academicExample || exampleSentence,
    merriamWebster,
    source: aiData ? 'Gemini Oxford Academic Engine' : (merriamWebster ? 'Merriam-Webster' : 'Hybrid Dictionary'),
    cachedAt: Date.now()
  };

  try {
    if (window.DB && window.DB.setting) {
      await window.DB.setting(cacheKey, resultData);
    }
  } catch(e) {}

  return resultData;
}

export async function runDictionaryLookup(sel){
  const rawText = sel?.text || (typeof sel === 'string' ? sel : '');
  let contextSentence = sel?.context || sel?.sentence || sel?.fullSentence || (rawText.length > 40 ? rawText : '');
  
  let initialWord = '';
  if (rawText) {
    const trimmed = rawText.trim();
    if (trimmed.includes(' ') && trimmed.length > 30) {
      initialWord = trimmed.split(/\s+/)[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
    } else {
      initialWord = trimmed.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
    }
  }

  // Auto-detect surrounding sentence from active page text if context wasn't passed directly
  if (!contextSentence && initialWord && typeof window.getCurrentPageText === 'function') {
    try {
      const pageTxt = window.getCurrentPageText() || '';
      if (pageTxt) {
        const sentences = pageTxt.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g) || [pageTxt];
        const regex = new RegExp(`\\b${initialWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const found = sentences.find(s => regex.test(s));
        if (found) {
          contextSentence = found.trim();
        }
      }
    } catch(e) {}
  }

  window.Sheet.open(`
    <div style="display:flex; align-items:center; justify-content:space-between; margin:2px 0 10px;">
      <div class="font-display" style="font-size:18px; font-weight:800; display:flex; align-items:center; gap:8px; color:var(--text); letter-spacing:-0.01em;">
        ${window.icon('language','icon icon-sm')} <span id="dict-header-title">${initialWord ? window.escapeHtml(initialWord) : 'Academic Lexicon & Word Meaning'}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="font-size:10.5px; font-weight:700; background:rgba(47, 198, 188, 0.15); color:var(--teal); border:1px solid rgba(47, 198, 188, 0.35); padding:2px 7px; border-radius:6px; text-transform:uppercase; letter-spacing:0.04em;">
          Oxford • Gemini 3.7
        </span>
      </div>
    </div>

    <!-- Search Input & Quick Chips -->
    <div style="margin-bottom:12px; background:var(--surface-2); padding:10px 12px; border-radius:12px; border:1px solid var(--border);">
      <div style="display:flex; gap:8px; align-items:center;">
        <div style="position:relative; flex:1;">
          <input type="text" id="dict-search-input" placeholder="Type academic word (e.g. ubiquitous, photosynthesis, hypothesis)..." value="${window.escapeHtml(initialWord)}" style="width:100%; padding:9px 12px 9px 34px; font-size:14px; font-weight:600; border-radius:10px; border:1px solid var(--border); background:var(--bg-elev); color:var(--text);" />
          <span style="position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--text-dim); pointer-events:none; font-size:13px;">🔍</span>
        </div>
        <button class="btn btn-primary" id="dict-search-btn" style="padding:9px 16px; font-size:13px; font-weight:700; border-radius:10px; flex-shrink:0;">
          Lookup
        </button>
      </div>
      <div style="display:flex; align-items:center; gap:6px; margin-top:8px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none;">
        <span style="font-size:10.5px; font-weight:700; color:var(--text-dim); white-space:nowrap; text-transform:uppercase; letter-spacing:0.03em;">Try:</span>
        ${['photosynthesis', 'resilient', 'ephemeral', 'pragmatic', 'meticulous', 'ubiquitous'].map(w => `
          <button class="btn dict-chip-btn" data-word="${w}" style="font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:8px; background:var(--bg-elev); border:1px solid var(--border); color:var(--text); cursor:pointer; white-space:nowrap;">
            ${w}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Active Document Context Bar (If Available) -->
    ${contextSentence ? `
      <div id="dict-context-banner" style="margin-bottom:12px; background:rgba(99, 102, 241, 0.08); border:1px solid rgba(99, 102, 241, 0.25); padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.45; color:var(--text);">
        <div style="font-size:10.5px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px; display:flex; align-items:center; gap:4px;">
          🎯 Document Context Grounding
        </div>
        <div style="color:var(--text-dim); font-style:italic;">"${window.escapeHtml(contextSentence.slice(0, 160))}${contextSentence.length > 160 ? '…' : ''}"</div>
      </div>
    ` : ''}

    <div id="dict-result" class="selectable-text" style="font-size:14px; line-height:1.6; display:flex; flex-direction:column; gap:12px;">
      <div class="skel" style="height:20px; width:50%;"></div>
      <div class="skel" style="height:14px; width:90%;"></div>
      <div class="skel" style="height:14px; width:80%;"></div>
    </div>
  `);

  const searchInput = document.getElementById('dict-search-input');
  const searchBtn = document.getElementById('dict-search-btn');
  const headerTitle = document.getElementById('dict-header-title');

  let activeAudio = null;

  const executeLookup = async (lookupWord, customCtx = '') => {
    const word = lookupWord.trim().replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '') || lookupWord.trim();
    if (searchInput && searchInput.value !== word) {
      searchInput.value = word;
    }

    const resultContainer = document.getElementById('dict-result');

    if (!word) {
      if (headerTitle) headerTitle.textContent = 'Academic Lexicon & Word Meaning';
      if (resultContainer) {
        resultContainer.innerHTML = `
          <div style="text-align:center; padding:28px 16px; background:var(--surface-2); border-radius:14px; border:1px dashed var(--border);">
            <div style="font-size:32px; margin-bottom:8px;">📖</div>
            <div style="font-size:15px; font-weight:700; color:var(--text); margin-bottom:4px;">Type any word above to look up its meaning</div>
            <div style="font-size:12.5px; color:var(--text-dim); max-width:280px; margin:0 auto;">
              Instant Oxford definitions, context-specific meaning, Hindi translations, grammar inflections, and audio pronunciation.
            </div>
          </div>
        `;
      }
      return;
    }

    if (headerTitle) headerTitle.textContent = word;

    if (resultContainer) {
      resultContainer.innerHTML = `
        <div style="padding:14px 0; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="skel" style="height:22px; width:45%; border-radius:6px;"></div>
            <div class="skel" style="height:18px; width:20%; border-radius:6px;"></div>
          </div>
          <div class="skel" style="height:14px; width:95%; border-radius:4px;"></div>
          <div class="skel" style="height:14px; width:80%; border-radius:4px;"></div>
          <div class="skel" style="height:40px; width:100%; border-radius:8px; margin-top:4px;"></div>
        </div>
      `;
    }

    try {
      const activeCtx = customCtx || contextSentence || '';
      const data = await fetchHybridDictionary(word, activeCtx);

      const phonetic = data.phonetic || '';
      const pos = data.primaryPos || 'Word';
      const academicDef = data.academicDefinition || data.primaryDef || 'Definition not available.';
      const contextMeaning = data.contextMeaning || '';
      const simpleExplanation = data.simpleExplanation || '';
      const academicExample = data.academicExample || data.exampleSentence || '';
      const commonPitfall = data.commonPitfall || '';
      const etymology = data.etymology || (data.merriamWebster?.etymologies?.join(' ') || '');
      const hindiMeaning = data.hindiMeaning || '';
      const synList = data.synonyms || [];
      const antList = data.antonyms || [];
      const g = data.grammar;
      const posGroups = data.posGroups || [];

      // Render POS-separated cards
      const getPosIcon = (posStr) => {
        const p = (posStr || '').toLowerCase();
        if (p.includes('noun')) return '📘';
        if (p.includes('verb')) return '⚡';
        if (p.includes('adj')) return '🎨';
        if (p.includes('adv')) return '🚀';
        if (p.includes('prep')) return '🔗';
        return '📌';
      };

      const renderPosGrammar = (gObj, posStr) => {
        if (!gObj) return '';
        const p = (posStr || '').toLowerCase();
        if ((p === 'verb' || gObj.type === 'verb' || gObj.isVerb) && (gObj.v1 || gObj.v2 || gObj.v3)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Verb Forms (Conjugation)
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(95px, 1fr)); gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V1 Base</span><strong>${window.escapeHtml(gObj.v1 || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V2 Past</span><strong>${window.escapeHtml(gObj.v2 || (word + 'ed'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">V3 Past Part.</span><strong>${window.escapeHtml(gObj.v3 || (word + 'ed'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">-ing Form</span><strong>${window.escapeHtml(gObj.ing || (word + 'ing'))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">-s/-es Form</span><strong>${window.escapeHtml(gObj.s || (word + 's'))}</strong></div>
              </div>
            </div>
          `;
        }
        if ((p === 'noun' || gObj.type === 'noun' || gObj.isNoun) && (gObj.plural || gObj.singular)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Noun Number Forms
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 8px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Singular</span><strong>${window.escapeHtml(gObj.singular || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 8px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Plural</span><strong>${window.escapeHtml(gObj.plural || (word + 's'))}</strong></div>
              </div>
            </div>
          `;
        }
        if ((p === 'adjective' || gObj.type === 'adjective' || gObj.isAdjective) && (gObj.positive || gObj.comparative)) {
          return `
            <div style="margin-top:8px; background:var(--surface-2); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">
              <div style="font-weight:800; color:var(--accent); font-size:10px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">
                📐 Adjective Degrees
              </div>
              <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:5px; font-size:11.5px;">
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Positive</span><strong>${window.escapeHtml(gObj.positive || word)}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Comparative</span><strong>${window.escapeHtml(gObj.comparative || ('more ' + word))}</strong></div>
                <div style="background:var(--bg-elev); padding:4px 6px; border-radius:5px;"><span style="color:var(--text-dim); font-size:9.5px; display:block;">Superlative</span><strong>${window.escapeHtml(gObj.superlative || ('most ' + word))}</strong></div>
              </div>
            </div>
          `;
        }
        return '';
      };

      // Generate distinct POS card sections
      const activeGroups = (posGroups && posGroups.length > 0) ? posGroups : [{
        pos: pos,
        senses: [{ def: academicDef }],
        hindiMeaning: hindiMeaning,
        example: academicExample,
        synonyms: synList,
        antonyms: antList,
        grammar: g
      }];

      const posCardsHtml = activeGroups.map(group => {
        const groupPos = group.pos || pos;
        const groupDef = group.senses?.[0]?.def || academicDef;
        const groupHindi = group.hindiMeaning || (groupPos === pos ? hindiMeaning : '');
        const groupExample = group.example || group.senses?.find(s => s.example)?.example || (groupPos === pos ? academicExample : '');
        const groupSyns = (group.synonyms && group.synonyms.length > 0) ? group.synonyms : (groupPos === pos ? synList : []);
        const groupAnts = (group.antonyms && group.antonyms.length > 0) ? group.antonyms : (groupPos === pos ? antList : []);
        const groupGrammar = group.grammar || (groupPos === pos ? g : null);
        const icon = getPosIcon(groupPos);

        return `
          <div style="margin-bottom:14px; background:var(--bg-elev); padding:13px 14px; border-radius:12px; border:1px solid var(--border);">
            
            <!-- POS Title & Hindi Meaning Badge -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11.5px; font-weight:800; text-transform:uppercase; background:var(--accent-soft); color:var(--accent); padding:3px 9px; border-radius:6px; letter-spacing:0.04em; display:inline-flex; align-items:center; gap:4px;">
                  ${icon} ${window.escapeHtml(groupPos)} Form
                </span>
                ${groupHindi ? `
                  <span style="font-size:13px; font-weight:700; color:var(--teal); background:rgba(47, 198, 188, 0.1); padding:2px 8px; border-radius:6px;">
                    ${window.escapeHtml(groupHindi)}
                  </span>
                ` : ''}
              </div>
            </div>

            <!-- Definition for this POS -->
            <div style="font-size:13.5px; color:var(--text); font-weight:500; line-height:1.5; margin-bottom:8px;">
              ${window.escapeHtml(groupDef)}
            </div>

            <!-- Example for this POS -->
            ${groupExample ? `
              <div style="font-size:12.5px; color:var(--text-dim); font-style:italic; line-height:1.45; margin-bottom:10px; padding:6px 10px; background:var(--surface-2); border-left:3px solid var(--accent); border-radius:0 6px 6px 0;">
                "${window.escapeHtml(groupExample)}"
              </div>
            ` : ''}

            <!-- POS-Specific Synonyms & Antonyms -->
            <div style="display:flex; flex-direction:column; gap:6px; background:var(--surface-2); padding:8px 10px; border-radius:8px; margin-top:6px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:10px; font-weight:800; color:var(--teal); text-transform:uppercase; letter-spacing:0.03em; flex-shrink:0;">${window.escapeHtml(groupPos)} Synonyms:</span>
                ${groupSyns.length > 0 ? groupSyns.map(s => `
                  <button class="dict-chip-tag syn-chip" data-word="${window.escapeHtml(s)}" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(47, 198, 188, 0.12); color:var(--teal); border:1px solid rgba(47, 198, 188, 0.3); cursor:pointer; transition:all 0.15s ease;">
                    ${window.escapeHtml(s)}
                  </button>
                `).join('') : '<em style="font-size:11px; color:var(--text-faint);">None identified</em>'}
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:10px; font-weight:800; color:var(--danger); text-transform:uppercase; letter-spacing:0.03em; flex-shrink:0;">${window.escapeHtml(groupPos)} Antonyms:</span>
                ${groupAnts.length > 0 ? groupAnts.map(a => `
                  <button class="dict-chip-tag ant-chip" data-word="${window.escapeHtml(a)}" style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(224, 86, 36, 0.12); color:var(--danger); border:1px solid rgba(224, 86, 36, 0.3); cursor:pointer; transition:all 0.15s ease;">
                    ${window.escapeHtml(a)}
                  </button>
                `).join('') : '<em style="font-size:11px; color:var(--text-faint);">None identified</em>'}
              </div>
            </div>

            <!-- POS-Specific Grammar Inflections -->
            ${renderPosGrammar(groupGrammar, groupPos)}

          </div>
        `;
      }).join('');

      let html = `
        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:16px;">
          
          <!-- Master Lexicon Header -->
          <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:12px; gap:8px; border-bottom:1px solid var(--border); padding-bottom:12px;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                <span class="font-display" style="font-size:22px; font-weight:800; color:var(--text); letter-spacing:-0.02em;">
                  ${window.escapeHtml(word)}
                </span>
                ${phonetic ? `<span class="font-mono" style="color:var(--text-dim); font-size:13px; font-weight:600;">${window.escapeHtml(phonetic)}</span>` : ''}
              </div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
                ${activeGroups.map(gItem => `
                  <span style="font-size:10.5px; font-weight:800; text-transform:uppercase; background:var(--accent-soft); color:var(--accent); padding:2px 7px; border-radius:5px; letter-spacing:0.03em;">
                    ${getPosIcon(gItem.pos)} ${window.escapeHtml(gItem.pos)}
                  </span>
                `).join('')}
                ${data.merriamWebster ? `
                  <span style="font-size:10px; font-weight:700; background:#8d1720; color:#ffffff; padding:2px 6px; border-radius:5px;">
                    Merriam-Webster
                  </span>
                ` : ''}
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:6px;">
              <button class="btn btn-ghost" id="dict-audio-play" title="Pronounce word" style="padding:6px 10px; font-size:12px; color:var(--accent); background:var(--accent-soft); border:1px solid rgba(255,106,43,0.3); border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
                ${window.icon('volume','icon icon-xs')} <span>Listen</span>
              </button>
              <button class="btn btn-ghost" id="dict-copy-btn" title="Copy entry" style="padding:6px 9px; font-size:12px; border:1px solid var(--border); border-radius:8px;">
                ${window.icon('copy','icon icon-xs')}
              </button>
            </div>
          </div>

          <!-- 1. Context Meaning (If Document Context Grounded) -->
          ${(contextMeaning && contextMeaning !== academicDef) ? `
            <div style="margin-bottom:12px; background:rgba(99, 102, 241, 0.1); padding:10px 14px; border-radius:10px; border-left:4px solid #6366f1;">
              <div style="font-size:11px; font-weight:800; color:#6366f1; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                🎯 Precise Meaning in Current Document Sentence
              </div>
              <div style="font-size:14px; color:var(--text); font-weight:600; line-height:1.5;">
                ${window.escapeHtml(contextMeaning)}
              </div>
            </div>
          ` : ''}

          <!-- 2. Distinct Part of Speech Cards (Noun, Verb, Adjective, etc.) -->
          ${posCardsHtml}

          <!-- 3. Feynman Intuition / Plain-English Breakdown -->
          ${simpleExplanation ? `
            <div style="margin-bottom:12px; background:var(--bg-elev); padding:10px 14px; border-radius:10px; border:1px solid var(--border); font-size:13px; color:var(--text-dim); line-height:1.45; display:flex; align-items:baseline; gap:6px;">
              <span style="font-size:11px; font-weight:800; color:var(--teal); text-transform:uppercase; letter-spacing:0.04em; flex-shrink:0;">💡 Intuition:</span>
              <span style="color:var(--text); font-weight:500;">${window.escapeHtml(simpleExplanation)}</span>
            </div>
          ` : ''}

          <!-- 4. Examiner Trap / Common Pitfall -->
          ${commonPitfall ? `
            <div style="margin-bottom:12px; background:rgba(224, 86, 36, 0.08); padding:10px 14px; border-radius:10px; border-left:4px solid var(--danger);">
              <div style="font-size:11px; font-weight:800; color:var(--danger); text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                ⚠️ Common Pitfall &amp; Examiner Caution
              </div>
              <div style="font-size:13px; color:var(--text); line-height:1.45;">
                ${window.escapeHtml(commonPitfall)}
              </div>
            </div>
          ` : ''}

          <!-- 5. Etymology & Root History (If Available) -->
          ${etymology ? `
            <div style="margin-bottom:8px; background:var(--bg-elev); padding:9px 12px; border-radius:8px; border:1px solid var(--border); font-size:12px; color:var(--text-dim); line-height:1.45;">
              <span style="font-weight:800; color:var(--text); font-size:10.5px; text-transform:uppercase; letter-spacing:0.04em;">🏛️ Etymology:</span>
              ${window.escapeHtml(etymology)}
            </div>
          ` : ''}

        </div>

        <!-- Action Bar -->
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
          <button class="btn btn-ghost" style="flex:1; min-width:130px; padding:11px; font-size:13px; font-weight:700; border-radius:10px;" id="dict-ai-explain-btn">
            ${window.icon('sparkle','icon icon-xs')} Ask AI Tutor About This
          </button>
          <button class="btn btn-primary" style="flex:1; min-width:130px; padding:11px; font-size:13px; font-weight:700; border-radius:10px;" id="dict-save-deck-btn">
            ⭐ Save to Vocabulary Deck
          </button>
        </div>
      `;

      if (resultContainer) resultContainer.innerHTML = html;

      // Event listeners for synonym and antonym chip tags
      document.querySelectorAll('.dict-chip-tag').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = btn.getAttribute('data-word');
          if (w) executeLookup(w, '');
        };
      });

      // Audio playback with Web Speech API and recorded URL
      const dictAudioPlay = document.getElementById('dict-audio-play');
      if (dictAudioPlay) {
        dictAudioPlay.onclick = () => {
          const audioSrc = data.audioUrl || data.merriamWebster?.audioUrl;
          if (audioSrc) {
            if (activeAudio) {
              activeAudio.pause();
              activeAudio.currentTime = 0;
            }
            activeAudio = new Audio(audioSrc);
            activeAudio.play().catch(() => {
              if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(word);
                u.lang = 'en-US';
                window.speechSynthesis.speak(u);
              } else if (window.runTTS) {
                window.runTTS(word);
              }
            });
          } else if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(word);
            u.lang = 'en-US';
            window.speechSynthesis.speak(u);
          } else if (window.runTTS) {
            window.runTTS(word);
          }
        };
      }

      // Copy Entry Button
      const copyBtn = document.getElementById('dict-copy-btn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const textToCopy = `**${word}** [${pos}] ${phonetic}\nDefinition: ${academicDef}\nHindi Meaning: ${hindiMeaning}\nExample: ${academicExample}\nSynonyms: ${synList.join(', ')}`;
          navigator.clipboard.writeText(textToCopy);
          if (window.Toast?.show) window.Toast.show('Copied lexicon entry to clipboard');
          else if (window.toast) window.toast('Copied to clipboard');
        };
      }

      // Ask AI Tutor About This Word
      const aiExplainBtn = document.getElementById('dict-ai-explain-btn');
      if (aiExplainBtn) {
        aiExplainBtn.onclick = () => {
          if (window.Sheet && window.Sheet.close) window.Sheet.close();
          const query = `Explain the academic word "${word}" in depth, its exact nuances, and how it is used in examinations.`;
          if (typeof window.openAIChat === 'function') {
            window.openAIChat(query);
          } else if (typeof window.openTeacherView === 'function') {
            const fid = window.State?.currentFile?.id || 'global_chat';
            window.openTeacherView(query, 'professional', fid);
          }
        };
      }

      // Save to Vocabulary Deck / Notes
      const saveDeckBtn = document.getElementById('dict-save-deck-btn');
      if (saveDeckBtn) {
        saveDeckBtn.onclick = async () => {
          const entry = {
            id: window.uid(),
            fileId: window.State?.currentFile?.id,
            page: sel?.pageNum || window.State?.currentPage || 1,
            kind: 'Vocabulary Card',
            word,
            primaryPos: pos,
            phonetic,
            academicDefinition: academicDef,
            hindiMeaning,
            academicExample,
            synonyms: synList,
            antonyms: antList,
            content: `**${word}** (${pos})\n• Definition: ${academicDef}\n• Hindi: ${hindiMeaning}\n• Example: "${academicExample}"\n• Synonyms: ${synList.join(', ')}`,
            createdAt: Date.now()
          };

          try {
            if (window.DB?.put) {
              await window.DB.put('notes', entry);
            }
            if (window.Toast?.show) window.Toast.show(`Saved "${word}" to your Vocabulary Deck!`);
            else if (window.toast) window.toast(`Saved "${word}" to Vocabulary Deck!`);
            window.Sheet.close();
          } catch (dbErr) {
            console.error('Error saving vocabulary card:', dbErr);
          }
        };
      }

    } catch (err) {
      console.error('Dictionary Lookup Error:', err);
      if (resultContainer) {
        resultContainer.innerHTML = `
          <div style="color:var(--danger); padding:14px; background:var(--surface-2); border-radius:10px; border:1px solid rgba(224, 86, 36, 0.3);">
            <div style="font-weight:700; margin-bottom:4px;">Could not load lexicon data</div>
            <div style="font-size:12px; color:var(--text-dim);">Please check connection and try again.</div>
          </div>
        `;
      }
    }
  };

  if (searchBtn) {
    searchBtn.onclick = () => {
      if (searchInput) executeLookup(searchInput.value, '');
    };
  }

  if (searchInput) {
    searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        executeLookup(searchInput.value, '');
      }
    };
  }

  document.querySelectorAll('.dict-chip-btn').forEach(btn => {
    btn.onclick = () => {
      const w = btn.dataset.word;
      if (w) executeLookup(w, '');
    };
  });

  executeLookup(initialWord, contextSentence);
}
