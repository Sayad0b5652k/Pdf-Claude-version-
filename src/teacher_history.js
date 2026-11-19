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
