// @ts-nocheck
// Book chat history (IndexedDB) and the welcome message
import { teacherState } from './teacher_state.js';

export function getInitialWelcomeMessage(fileId) {
  const isGlobal = fileId === 'global_chat';
  const currentFile = window.State?.files?.find(f => f.id === fileId);
  const docName = isGlobal ? 'Universal Library Workspace' : (currentFile ? currentFile.name : 'Study Material');
  const curP = window.State?.currentPage || 1;
  const totalP = window.State?.numPages || currentFile?.pageCount || 1;

  return {
    role: 'assistant',
    text: isGlobal 
      ? `### 👋 Hey! Kya padhna hai aaj?\nPoori library mein se sawaal poochh sakte ho — concept samjhana ho, problem solve karni ho, ya bas gup-shup. Main yahin hu.`
      : `### 📚 "${docName}"\nPage ${curP} of ${totalP} khula hai. Kuch bhi poochho — is page ka matlab, kisi chapter ka summary, ya book ke kisi bhi topic ka jawab. Main book ke andar dhoondh ke page number ke saath bataunga.`,
    mode: 'professional',
    timestamp: Date.now()
  };
}

export async function loadTeacherChatHistory(fileId) {
  try {
    const record = await window.DB.get('chathistory', fileId);
    return record && Array.isArray(record.messages) ? record.messages : [];
  } catch(e) {
    return [];
  }
}

export async function saveTeacherChatHistory(fileId, messages) {
  try {
    await window.DB.put('chathistory', {
      id: fileId,
      fileId,
      messages: messages.slice(-50),
      updatedAt: Date.now()
    });
  } catch(e) {
    console.warn('Could not save teacher chat history', e);
  }
}

export async function clearTeacherChatHistory(fileId) {
  try {
    teacherState.currentSessionChapter = null;
    await window.DB.del('chathistory', fileId);
  } catch(e) {}
}

/* ------------------------------------------------------------------
   Compact history for the AI request (saves quota: no extra AI call).
   - keeps the last RECENT_KEEP messages, long replies trimmed
   - anything older becomes a short digest of what the student asked
   ------------------------------------------------------------------ */
export const HISTORY_LIMITS = {
  RECENT_KEEP: 6,        // messages sent as real turns
  USER_CHARS: 400,       // trim a recent student message
  REPLY_CHARS: 600,      // trim a recent AI reply
  LAST_REPLY_CHARS: 1500, // the newest AI reply keeps more (follow-ups refer to it)
  DIGEST_ITEMS: 10,      // older student questions listed in the digest
  DIGEST_ITEM_CHARS: 100,
  DIGEST_TOTAL_CHARS: 900,
};

function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf(' '));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim() + '…';
}

/**
 * @param {Array<{role:string,text:string,isError?:boolean}>} chatMessages  full log, ending with the new
 *        user message and the empty assistant placeholder
 * @returns {{ chatHistory: Array<{role:string,text:string}>, conversationSummary: string }}
 */
export function buildCompactHistory(chatMessages) {
  const L = HISTORY_LIMITS;
  const base = (chatMessages || []).slice(0, -2).filter((m) => m && m.text && m.text !== '…' && !m.isError);
  const recent = base.slice(-L.RECENT_KEEP);
  const older = base.slice(0, Math.max(0, base.length - L.RECENT_KEEP));
  const lastAssistantIdx = recent.map((m) => m.role).lastIndexOf('assistant');

  const chatHistory = recent.map((m, i) => ({
    role: m.role,
    text: clip(m.text, m.role === 'user' ? L.USER_CHARS : i === lastAssistantIdx ? L.LAST_REPLY_CHARS : L.REPLY_CHARS),
  }));

  let conversationSummary = '';
  const asked = older.filter((m) => m.role === 'user').slice(-L.DIGEST_ITEMS).map((m) => clip(m.text, L.DIGEST_ITEM_CHARS));
  if (asked.length) {
    conversationSummary = `Earlier in this chat the student asked: ${asked.map((q, i) => `${i + 1}) ${q}`).join(' ')}`;
    if (conversationSummary.length > L.DIGEST_TOTAL_CHARS) conversationSummary = clip(conversationSummary, L.DIGEST_TOTAL_CHARS);
  }
  return { chatHistory, conversationSummary };
}

export function formatCompactHistory({ chatHistory, conversationSummary }) {
  const turns = chatHistory.map((m) => `${m.role === 'user' ? 'Student' : 'AI Tutor'}: ${m.text}`).join('\n\n');
  return [conversationSummary, turns].filter(Boolean).join('\n\n');
}
