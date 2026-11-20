// @ts-nocheck
// Speech-to-text clean-up and Devanagari -> Hinglish helpers for the book chat

// Clean repetitive loop phrases and fix common speech-to-text spelling issues
export function deduplicateSpokenPhrase(text) {
  if (!text) return '';

  // Academic and phonetic spelling correction dictionary
  const SPELLING_FIXES = {
    'chaiptar': 'chapter',
    'chaipter': 'chapter',
    'chaptar': 'chapter',
    'chepter': 'chapter',
    'chptr': 'chapter',
    'helo': 'hello',
    'helow': 'hello',
    'hlo': 'hello',
    'hlw': 'hello',
    'lesan': 'lesson',
    'lessen': 'lesson',
    'leson': 'lesson',
    'modul': 'module',
    'modyul': 'module',
    'queshn': 'question',
    'koschan': 'question',
    'koshchan': 'question',
    'queshan': 'question',
    'ansar': 'answer',
    'aansar': 'answer',
    'thimakka': 'Thimmakka',
    'thimaka': 'Thimmakka',
    'thimmaka': 'Thimmakka',
    'thimmakka\'s': 'Thimmakka\'s',
    'ekjam': 'exam',
    'exm': 'exam',
    'samjho': 'samjhao',
    'samjaho': 'samjhao',
    'btao': 'batao',
    'baare': 'bare',
    'mein': 'me',
    'kare': 'karo',
    'padho': 'padhao',
    'kitaab': 'book',
    'buk': 'book'
  };

  const rawWords = text.trim().split(/\s+/).map(w => {
    const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SPELLING_FIXES[cleanWord]) {
      return SPELLING_FIXES[cleanWord];
    }
    return w;
  });

  if (rawWords.length <= 1) return rawWords.join(' ');

  // 1. Remove immediate duplicate single words (e.g. "kya kya" -> "kya", "is is" -> "is")
  const deduplicatedWords = [];
  for (let i = 0; i < rawWords.length; i++) {
    if (i === 0 || rawWords[i].toLowerCase() !== rawWords[i - 1].toLowerCase()) {
      deduplicatedWords.push(rawWords[i]);
    }
  }

  // 2. Remove repeated consecutive sub-phrases of length 2 to 10
  let cleanStr = deduplicatedWords.join(' ');
  for (let phraseLen = 2; phraseLen <= 10; phraseLen++) {
    const tokens = cleanStr.split(/\s+/);
    if (tokens.length < phraseLen * 2) continue;
    const newTokens = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + phraseLen * 2 <= tokens.length) {
        const p1 = tokens.slice(i, i + phraseLen).join(' ').toLowerCase();
        const p2 = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase();
        if (p1 === p2) {
          newTokens.push(...tokens.slice(i, i + phraseLen));
          i += phraseLen * 2;
          continue;
        }
      }
      newTokens.push(tokens[i]);
      i++;
    }
    cleanStr = newTokens.join(' ');
  }

  // 3. Remove trailing duplicate greeting if user said "hello ... hello"
  const finalTokens = cleanStr.split(/\s+/);
  if (finalTokens.length > 2) {
    if (finalTokens[0].toLowerCase() === 'hello' && finalTokens[finalTokens.length - 1].toLowerCase() === 'hello') {
      finalTokens.pop();
      cleanStr = finalTokens.join(' ');
    }
  }

  return cleanStr;
}

// High-accuracy Devanagari Hindi to Hinglish / Roman script Transliteration
export function transliterateDevanagariToHinglish(text) {
  if (!text) return '';
  if (!/[\u0900-\u097F]/.test(text)) return deduplicateSpokenPhrase(text); // already English / Latin

  // Common Hindi spoken word dictionary for natural, accurate Hinglish spelling
  const WORD_MAP = {
    'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'wo', 'क्या': 'kya',
    'है': 'hai', 'हैं': 'hain', 'हो': 'ho', 'हूँ': 'hoon', 'हूं': 'hoon',
    'था': 'tha', 'थी': 'thi', 'थे': 'the', 'किस': 'kis', 'बारे': 'bare',
    'में': 'me', 'पे': 'pe', 'पर': 'par', 'से': 'se', 'को': 'ko',
    'का': 'ka', 'की': 'ki', 'के': 'ke', 'करो': 'karo', 'करें': 'karein',
    'करना': 'karna', 'कर': 'kar', 'रहा': 'raha', 'रही': 'rahi', 'रहे': 'rahe',
    'समझाओ': 'samjhao', 'समझाएं': 'samjhayein', 'समझा': 'samjha', 'बताओ': 'batao',
    'बताएं': 'batayein', 'पढ़ाओ': 'padhao', 'पढ़ाएं': 'padhayein', 'सिखाओ': 'sikhao',
    'कैसे': 'kaise', 'क्यों': 'kyon', 'कब': 'kab', 'कहाँ': 'kahan', 'कहा': 'kaha',
    'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni', 'उत्तर': 'answer',
    'प्रश्न': 'question', 'सवाल': 'question', 'जवाब': 'answer', 'पेज': 'page',
    'किताब': 'book', 'पाठ': 'lesson', 'मुझको': 'mujhko', 'मुझे': 'mujhe',
    'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere', 'हम': 'hum',
    'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare', 'आप': 'aap',
    'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'तुम': 'tum',
    'तुम्हारा': 'tumhara', 'तुम्हारी': 'tumhari', 'तुम्हारे': 'tumhare',
    'नहीं': 'nahi', 'ना': 'na', 'हाँ': 'haan', 'और': 'aur', 'या': 'ya',
    'लेकिन': 'lekin', 'मगर': 'magar', 'परन्तु': 'parantu', 'क्योंकि': 'kyonki',
    'इसलिए': 'isliye', 'अगर': 'agar', 'यदि': 'yadi', 'तो': 'toh',
    'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge', 'सकता': 'sakta',
    'सकती': 'sakti', 'सकते': 'sakte', 'चाहिए': 'chahiye', 'दीजिए': 'dijiye',
    'दीजिये': 'dijiye', 'लीजिए': 'lijiye', 'बोलिए': 'boliye', 'लिखिए': 'likhiye',
    'लिखो': 'likho', 'हल': 'solution', 'सूत्र': 'formula', 'नियम': 'rule',
    'विषय': 'subject', 'अध्याय': 'chapter', 'चैप्टर': 'chapter', 'लाइन': 'line', 'पैराग्राफ': 'paragraph',
    'मुख्य': 'main', 'बिंदु': 'point', 'टॉपिक': 'topic', 'सारांश': 'summary',
    'परीक्षा': 'exam', 'तैयारी': 'preparation', 'नोट्स': 'notes', 'याद': 'yaad',
    'हेलो': 'hello', 'हेल्लो': 'hello', 'नमस्ते': 'namaste', 'पर्यावरण': 'environment',
    'कचरा': 'waste', 'प्रबंधन': 'management', 'तनाव': 'stress'
  };

  // Replace whole words from dictionary first
  let processed = text.split(/(\s+|[.,!?;:])/).map(token => {
    const cleanToken = token.trim();
    if (WORD_MAP[cleanToken]) {
      return WORD_MAP[cleanToken];
    }
    return token;
  }).join('');

  if (!/[\u0900-\u097F]/.test(processed)) return deduplicateSpokenPhrase(processed);

  // Character level phonetic transliteration map
  const vowels = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah'
  };

  const matras = {
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', '़': ''
  };

  const consonants = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'फ़': 'f', 'ड़': 'r', 'ढ़': 'rh'
  };

  let out = '';
  const len = processed.length;
  for (let i = 0; i < len; i++) {
    const char = processed[i];
    const nextChar = i + 1 < len ? processed[i + 1] : '';

    if (vowels[char]) {
      out += vowels[char];
    } else if (consonants[char]) {
      const c = consonants[char];
      if (nextChar === '्') {
        // Halant suppresses inherent vowel
        out += c;
        i++; // skip halant
      } else if (matras[nextChar] !== undefined) {
        out += c + matras[nextChar];
        i++; // skip matra
      } else if (nextChar === ' ' || !nextChar || /[.,!?;:\n]/.test(nextChar)) {
        out += c;
      } else if (consonants[nextChar] || vowels[nextChar]) {
        out += c + 'a';
      } else {
        out += c;
      }
    } else if (matras[char] !== undefined) {
      out += matras[char];
    } else if (char === '्') {
      // halant consumed
    } else {
      out += char;
    }
  }

  const cleaned = out.replace(/\s+/g, ' ').trim();
  return deduplicateSpokenPhrase(cleaned);
}
