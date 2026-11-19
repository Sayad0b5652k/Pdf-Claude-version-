// @ts-nocheck
import { callAI, callServerGemini, speakWithElevenLabs, stopElevenAudio } from './ai.js';
import { teacherState } from './teacher_state.js';
import { deduplicateSpokenPhrase, transliterateDevanagariToHinglish } from './teacher_text.js';
import { extractAllMarkers, findRelevantPages, getTeacherContext } from './teacher_context.js';
import { loadTeacherChatHistory, saveTeacherChatHistory, clearTeacherChatHistory, buildCompactHistory, formatCompactHistory } from './teacher_history.js';
import { stopVoiceRecognition, isVoiceActive } from './teacher_voice.js';

/* ============================================================
   AI SUPER-TUTOR (AI Teacher & Chatbot)
   - Clean, uncluttered ChatGPT/Gemini conversational design
   - Unified for both specific PDF context & General Universal AI chat
   - Customization Sheet for Personas (Academic, ELI5, Memory Hacks, Exam Evaluator)
   - Action bar for each AI answer: Copy, Save to Notes, + Flashcard, Listen
   - IndexedDB Chat History Persistence with per-document and global tracking
   ============================================================ */

export const TEACHER_MODES = [
  { id: 'professional', short: 'Academic', label: 'Academic & Rigorous', icon: 'teacher', desc: 'Standard textbook breakdown, deep conceptual clarity & exam rigor' },
  { id: 'eli5', short: 'ELI5', label: "Explain Like I'm 10 (ELI5)", icon: 'brain', desc: 'Everyday analogies, story-like examples, zero jargon' },
  { id: 'mnemonics', short: 'Memory tricks', label: 'Memory Tricks & Mnemonics', icon: 'zap', desc: 'Acronyms, visual memory hooks, chunking & formulas recall' },
  { id: 'evaluator', short: 'Evaluator', label: 'Exam Answer Evaluator', icon: 'award', desc: 'Grade answers against 2, 3 or 5 mark rubrics with missing points' },
  { id: 'summary', short: 'Quick revision', label: 'Rapid Revision & Key Facts', icon: 'sparkle', desc: 'High-yield key definitions, formulas cheat sheet & rapid recap' },
];

export let activeTeacherMode = 'professional';
export let examTargetMarks = 3; // 2, 3, or 5
let webSearchOn = (() => { try { return localStorage.getItem('sayad_chat_web') === '1'; } catch (e) { return false; } })();

export const EXPLANATION_STYLES = [
  { id: 'comprehensive', label: '🌟 Comprehensive Breakdown', desc: 'Balanced, rich explanation with clear headers & authentic [Page X] citations' },
  { id: 'stepbystep', label: '🪜 Step-by-Step Walkthrough', desc: 'Numbered sequential stages, practical workflows & clear progression' },
  { id: 'academic', label: '🎓 Deep Academic Analysis', desc: 'Scholarly rigor, theoretical foundations, underlying mechanics & exam evaluation' }
];

export let activeExplanationStyle = (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_explanation_style') : '') || 'comprehensive';


let activeContextScope = 'page'; // 'page' | 'chapter' | 'book'

export function openTeacherView(prefillQuery = '', defaultMode = 'professional', customFileId = null) {
  if (window.Sheet) {
    if (typeof window.Sheet.closeImmediate === 'function') {
      window.Sheet.closeImmediate();
    } else if (typeof window.Sheet.close === 'function') {
      window.Sheet.close();
    }
  }
  activeTeacherMode = defaultMode || 'professional';
  
  const prevFileId = teacherState.activeFileId;
  if (customFileId) {
    teacherState.activeFileId = customFileId;
  } else if (window.State?.currentFile?.id) {
    teacherState.activeFileId = window.State.currentFile.id;
  } else {
    teacherState.activeFileId = 'global_chat';
  }

  if (prevFileId !== teacherState.activeFileId) {
    teacherState.currentSessionChapter = null;
  }

  const currentFile = window.State?.files?.find(f => f.id === teacherState.activeFileId) || window.State?.currentFile;
  const isGlobal = teacherState.activeFileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : currentFile.name;
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;
  const totalPages = (!isGlobal && window.State?.numPages) ? window.State.numPages : 1;

  // Render Full Screen AI Teacher Workspace View
  window.State.view = 'teacher';
  if (typeof window.stopReadingSession === 'function') window.stopReadingSession();
  if (typeof window.hideSelToolbar === 'function') window.hideSelToolbar();

  const getModeLabel = () => {
    const m = TEACHER_MODES.find(x => x.id === activeTeacherMode);
    return m ? (m.short || m.label.split('(')[0].trim()) : 'Academic';
  };

  const getScopeDisplay = () => {
    if (teacherState.crossPdfActive) return '🌐 All Books';
    if (activeContextScope === 'chapter') return '📑 Chapter';
    if (activeContextScope === 'book') return '📚 Whole Book';
    return `📄 Page ${currentPage}`;
  };

  document.getElementById('app').innerHTML = `
  <div class="chat-workspace">
    
    <!-- Clean Minimalist Header: Back, Doc info, and Settings -->
    <header class="chat-top-bar" id="teacher-header">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <button class="btn btn-icon" id="teacher-back-btn" title="Back to Reader" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); flex-shrink:0; color:var(--text);">
          ${window.icon('chevLeft','icon icon-sm')}
        </button>

        <div style="min-width:0;">
          <div style="font-size:14px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${window.escapeHtml(docTitle)}">
            ${window.escapeHtml(docTitle)}
          </div>
          <div style="font-size:11px; color:var(--text-dim); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${isGlobal ? 'Universal Library' : `Page ${currentPage} of ${totalPages}`} • <span style="color:#10b981; font-weight:600;">Grounded</span>
          </div>
        </div>
      </div>

      <!-- Single clean Settings button -->
      <button class="btn btn-icon" id="teacher-custom-toggle" title="Settings & Personas" style="width:34px; height:34px; border-radius:50%; background:var(--surface-2); border:1px solid var(--border); color:var(--text); flex-shrink:0;">
        ${window.icon('settings','icon icon-sm')}
      </button>
    </header>

    <!-- Context row: what the chat is reading from + how the tutor answers -->
    <div class="cw-context" id="teacher-scope-bar">
      ${!isGlobal ? `
      <div class="cw-context-select">
        <select id="teacher-chapter-select" data-custom-title="Select Chat Context Focus" style="width:100%;">
          <option value="__loading__">Detecting chapter…</option>
        </select>
      </div>
      <span id="teacher-scope-badge-pill" class="cw-scope-badge">AUTO</span>
      ` : '<div class="cw-context-select cw-context-label">Whole library</div>'}
      <button class="cw-mode-pill" id="teacher-mode-pill" type="button" title="How the tutor answers">
        <span class="cw-mode-dot"></span><span id="teacher-mode-pill-text">${window.escapeHtml(getModeLabel())}</span>${window.icon('chevDown','icon icon-xs')}
      </button>
    </div>

    <!-- Main Clean Chat Log Scroll Container -->
    <div id="teacher-chat-log" class="chat-scroll-container no-scrollbar">
      <!-- Messages or Empty Hero injected here -->
    </div>

    <!-- Bottom Docked Area: Quick Suggestion Chips + Input Capsule -->
    <div style="flex-shrink:0; padding:6px 14px 12px; background:var(--bg); border-top:1px solid var(--border); max-width:760px; margin:0 auto; width:100%;">
      
      <!-- Quick Prompt Suggestion Chips -->
      <div id="chat-quick-chips-bar" style="display:flex; align-items:center; gap:6px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; -webkit-overflow-scrolling:touch;">
        ${!isGlobal ? `
        <button class="chat-quick-chip" data-query="Teach me this chapter step-by-step with interactive checkpoints">
          <span>🎓 Teach Me Chapter</span>
        </button>
        <button class="chat-quick-chip" data-query="Summarise this chapter with core breakdown and key takeaways">
          <span>📖 Summarise Chapter</span>
        </button>
        ` : ''}
        <button class="chat-quick-chip" data-query="Quiz me — 5 questions from this book, one at a time">
          <span>🧠 Quiz me</span>
        </button>
        <button class="chat-quick-chip" data-query="⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath">
          <span>⚡ Detail me samjhao</span>
        </button>
        <button class="chat-quick-chip" data-query="Draw a clear Mermaid flowchart diagram explaining this process step-by-step">
          <span>📊 Flowchart</span>
        </button>
        <button class="chat-quick-chip" data-query="💡 Is concept ko simple real-world analogy se samjhao (zero jargon)">
          <span>💡 Simple Analogy</span>
        </button>
        <button class="chat-quick-chip" data-query="🎯 Exam ke point of view se important questions, keywords aur scoring points batao">
          <span>🎯 Exam Points</span>
        </button>
        <button class="chat-quick-chip" data-query="🗺️ Is topic ka authentic educational map dikhao">
          <span>🗺️ Map dikhao</span>
        </button>
        <button class="chat-quick-chip" data-query="🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao">
          <span>🖼️ Visual / Diagram</span>
        </button>
      </div>

      <!-- Minimalist Docked Input Capsule with Voice Mic -->
      <div class="chat-input-capsule" id="teacher-input-wrapper">
        <button class="btn btn-icon" id="teacher-web-btn" title="Web search: off" aria-pressed="false" style="display:none; width:32px; height:32px; border-radius:50%; background:transparent; border:none; color:var(--text-dim); flex-shrink:0; align-items:center; justify-content:center; font-size:16px;">🌐</button>
        <button class="btn btn-icon" id="teacher-input-mic-btn" title="Voice Input (Hindi / English)" style="width:32px; height:32px; border-radius:50%; background:transparent; border:none; color:var(--text-dim); flex-shrink:0; display:flex; align-items:center; justify-content:center;">
          ${window.icon('mic','icon icon-sm')}
        </button>

        <textarea id="teacher-input" class="no-scrollbar" rows="1" placeholder="Ask anything about this document..." style="flex:1; padding:6px 4px; font-size:13.5px; line-height:1.4; resize:none; max-height:120px; background:transparent; border:none; color:var(--text); outline:none; box-shadow:none; font-family:inherit;"></textarea>
        
        <button class="btn btn-primary" id="teacher-send-btn" title="Send Message" style="width:32px; height:32px; border-radius:50%; padding:0; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--accent); color:#fff; border:none;">
          ${window.icon('send','icon icon-xs')}
        </button>
      </div>
    </div>

  </div>`;

  initTeacherViewLogic(teacherState.activeFileId, prefillQuery);
}

export async function initTeacherViewLogic(fileId, prefillQuery) {
  const chatLogEl = document.getElementById('teacher-chat-log');
  const inputEl = document.getElementById('teacher-input');
  const sendBtn = document.getElementById('teacher-send-btn');
  const backBtn = document.getElementById('teacher-back-btn');
  const customToggle = document.getElementById('teacher-custom-toggle');
  const inputMicBtn = document.getElementById('teacher-input-mic-btn');
  const inputWrapper = document.getElementById('teacher-input-wrapper');

  // Live web search toggle (Google Search grounding; shown whenever a Gemini key is available).
  const webBtn = document.getElementById('teacher-web-btn');
  if (webBtn) {
    const paintWeb = () => {
      webBtn.title = 'Web search: ' + (webSearchOn ? 'on — answers use live results' : 'off');
      webBtn.setAttribute('aria-pressed', String(webSearchOn));
      webBtn.style.background = webSearchOn ? 'var(--accent-soft)' : 'transparent';
      webBtn.style.boxShadow = webSearchOn ? '0 0 0 1.5px var(--accent) inset' : 'none';
    };
    fetch('/api/web/status').then(r => r.ok ? r.json() : null).then(d => {
      let byok = ''; try { byok = window.State?.customGeminiKey || localStorage.getItem('sayad_custom_gemini_key') || ''; } catch (e) {}
      if (d && (d.enabled || byok)) { webBtn.style.display = 'flex'; paintWeb(); }
    }).catch(() => {});
    webBtn.onclick = () => {
      webSearchOn = !webSearchOn;
      try { localStorage.setItem('sayad_chat_web', webSearchOn ? '1' : '0'); } catch (e) {}
      paintWeb();
      if (window.toast) window.toast(webSearchOn ? 'Web search ON — live results use honge' : 'Web search OFF');
    };
  }

  if (inputEl && inputWrapper) {
    inputEl.onfocus = () => { inputWrapper.style.borderColor = 'var(--accent)'; };
    inputEl.onblur = () => { inputWrapper.style.borderColor = 'var(--border)'; };
  }

  let chatMessages = await loadTeacherChatHistory(fileId);
  if (!chatMessages) chatMessages = [];

  // Filter out any stale auto-generated bulky welcome messages so we start completely clean
  chatMessages = chatMessages.filter(m => {
    if (!m || !m.text) return false;
    if (m.role === 'assistant' && (m.text.includes('Grounded in "') || m.text.includes('Universal Academic Tutor') || m.text.includes('Status: Ready for Chat'))) {
      return false;
    }
    return true;
  });

  const currentFile = window.State?.files?.find(f => f.id === fileId) || window.State?.currentFile;
  const isGlobal = fileId === 'global_chat' || !currentFile;
  const docTitle = isGlobal ? 'Library Universal Chat' : (currentFile ? currentFile.name : 'Document');
  const currentPage = (!isGlobal && window.State?.currentPage) ? window.State.currentPage : 1;
  const totalPages = (!isGlobal && (window.State?.numPages || currentFile?.pageCount)) ? (window.State?.numPages || currentFile?.pageCount) : 1;
  let activeAiEngine = (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_preferred_ai_engine') : '') || 'auto';

  function renderMessages() {
    if (!chatLogEl) return;

    if (chatMessages.length === 0) {
      const starters = isGlobal
        ? ['Explain a concept in simple words', 'Help me make a study plan', 'Give me a tricky practice question']
        : [`Explain Page ${currentPage} in simple words`, 'Summarise this chapter in key points', `Likely exam questions from Page ${currentPage}`, 'Make a flowchart of this chapter'];
      chatLogEl.innerHTML = `
        <div class="chat-empty-hero">
          <div class="chat-empty-icon">${window.icon('book', 'icon icon-lg')}</div>
          <div class="chat-empty-title">${window.escapeHtml(docTitle)}</div>
          <div class="chat-empty-sub">Ask anything. Answers come from ${isGlobal ? 'your library' : 'this book'}, with page links.</div>
          <div class="cw-starters">
            <div class="cw-starters-label">Try asking</div>
            ${starters.map(q => `<button type="button" class="cw-starter" data-fill="${window.escapeHtml(q)}"><span>${window.escapeHtml(q)}</span>${window.icon('chevRight','icon icon-xs')}</button>`).join('')}
          </div>
        </div>
      `;

      // Attach click events on empty state chips to send immediately
      chatLogEl.querySelectorAll('.cw-starter').forEach(chip => {
        chip.onclick = () => {
          const fill = chip.getAttribute('data-fill');
          if (fill) {
            if (inputEl) {
              inputEl.value = fill;
            }
            sendUserMessage(fill);
          }
        };
      });

      return;
    }

    const lastIdx = chatMessages.length - 1;
    let html = chatMessages.map((m, idx) => {
      const isUser = m.role === 'user';
      const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
      const realReply = !isUser && m.text !== '…' && !m.isError;

      if (isUser) {
        return `
        <div class="teacher-chat-msg cw-row cw-row-user" id="msg-card-${idx}">
          <button class="btn-teacher-action cw-ghost" data-action="delete-msg" data-idx="${idx}" title="Delete message" aria-label="Delete message">${window.icon('trash','icon icon-xs')}</button>
          <div class="chat-msg-user-bubble">${window.escapeHtml(m.text || '')}</div>
        </div>`;
      }

      return `
        <div class="teacher-chat-msg cw-row cw-row-ai" id="msg-card-${idx}">
          <div class="cw-ai-meta"><span class="cw-ai-mark"></span>Tutor${time ? `<span class="cw-ai-time">${time}</span>` : ''}</div>
          <div class="chat-msg-ai-bubble selectable-text">${window.renderMarkdown(m.text || '')}</div>
          ${m.quizCta ? `<div style="margin-top:8px;"><button class="btn btn-primary" data-action="open-quiz" style="padding:10px 16px;border-radius:14px;font-weight:800;">Quiz Generator kholo</button></div>` : ''}
          ${realReply ? `
            <div class="cw-actions">
              <button class="btn-teacher-action cw-act" data-action="copy" data-idx="${idx}" title="Copy">${window.icon('copy','icon icon-xs')}<span>Copy</span></button>
              <button class="btn-teacher-action cw-act" data-action="save-notes" data-idx="${idx}" title="Save as Note">${window.icon('note','icon icon-xs')}<span>Save</span></button>
              <button class="btn-teacher-action cw-act" data-action="make-flashcard" data-idx="${idx}" title="Create Flashcard">${window.icon('cards','icon icon-xs')}<span>Flashcard</span></button>
              <button class="btn-teacher-action cw-act" data-action="speak" data-idx="${idx}" title="Listen">${window.icon('volume','icon icon-xs')}<span>Listen</span></button>
              <button class="btn-teacher-action cw-act cw-act-icon" data-action="delete-msg" data-idx="${idx}" title="Delete" aria-label="Delete">${window.icon('trash','icon icon-xs')}</button>
            </div>
            ${idx === lastIdx && !m.quizCta ? `
            <div class="cw-follow-row">
              <button class="cw-follow" data-fu="more">Explain more</button>
              <button class="cw-follow" data-fu="simple">Simpler</button>
              <button class="cw-follow" data-fu="example">Example</button>
              <button class="cw-follow" data-fu="exam">Exam question</button>
            </div>` : ''}
          ` : ''}
          ${m.isError && idx === lastIdx && idx > 0 && chatMessages[idx-1]?.role === 'user' ? `
            <div class="cw-actions"><button class="btn-teacher-action cw-follow" data-action="retry" data-idx="${idx}" title="Retry">↻ Retry</button></div>
          ` : ''}
        </div>`;
    }).join('');

    chatLogEl.innerHTML = html;
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
    bindMessageActionButtons();
  }

  function bindMessageActionButtons() {
    document.querySelectorAll('[data-action="open-quiz"]').forEach(b => {
      b.onclick = () => { if (typeof window.runMCQGeneratorModal === 'function') window.runMCQGeneratorModal(); };
    });
    document.querySelectorAll('.btn-teacher-action').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = Number(btn.dataset.idx);
        const msg = chatMessages[idx];
        if (!msg) return;

        if (action === 'retry') {
          const prev = chatMessages[idx - 1];
          if (!prev || prev.role !== 'user' || sendBtn.disabled) return;
          const again = prev.text;
          chatMessages.splice(idx - 1, 2);
          await saveTeacherChatHistory(fileId, chatMessages);
          renderMessages();
          sendUserMessage(again);
          return;
        }
        if (action === 'delete-msg') {
          chatMessages.splice(idx, 1);
          await saveTeacherChatHistory(fileId, chatMessages);
          renderMessages();
          window.toast('Message deleted 🗑️');
        } else if (action === 'speak') {
          // If currently speaking, stop
          if (window._activeTeacherSpeech) {
            try {
              if (window.speechSynthesis) window.speechSynthesis.cancel();
              if (typeof stopElevenAudio === 'function') stopElevenAudio();
            } catch(e) {}
            window._activeTeacherSpeech = null;
            btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Listen</span>`;
            window.toast('Audio stopped ⏹️');
            return;
          }

          // Strip markdown symbols and code blocks for clean TTS speech
          const cleanSpeechText = (msg.text || '')
            .replace(/```mermaid[\s\S]*?```/gi, ' [Flowchart Diagram] ')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/!\[.*?\]\(.*?\)/g, '')
            .replace(/[#*_`~>-]/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();

          if (!cleanSpeechText) {
            window.toast('No spoken text in this message');
            return;
          }

          btn.innerHTML = `<span style="display:inline-block; animation:pulse 1s infinite;">🔊</span> <span>Stop</span>`;
          window._activeTeacherSpeech = btn;

          const resetBtn = () => {
            btn.innerHTML = `${window.icon('volume','icon icon-xs')} <span>Listen</span>`;
            window._activeTeacherSpeech = null;
          };

          const fallbackWebSpeech = () => {
            if (!('speechSynthesis' in window)) {
              resetBtn();
              window.toast('Speech audio is not supported in this browser.');
              return;
            }
            try {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(cleanSpeechText.slice(0, 2500));
              utterance.rate = 1.0;
              const voices = window.speechSynthesis.getVoices();
              const isHindiOrHinglish = /[\u0900-\u097F]/.test(cleanSpeechText) || /\b(?:hai|aur|kya|ye|yeh|samjhao|batao|kaise)\b/i.test(cleanSpeechText);
              if (isHindiOrHinglish) {
                const hiVoice = voices.find(v => v.lang.includes('hi') || v.lang.includes('IN'));
                if (hiVoice) utterance.voice = hiVoice;
              } else {
                const enVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')));
                if (enVoice) utterance.voice = enVoice;
              }
              utterance.onend = resetBtn;
              utterance.onerror = resetBtn;
              window.speechSynthesis.speak(utterance);
            } catch(e) {
              resetBtn();
            }
          };

          // Try ElevenLabs first if key is configured, otherwise immediate Web Speech
          const hasElevenKey = (typeof localStorage !== 'undefined' && localStorage.getItem('sayad_eleven_labs_key'));
          if (hasElevenKey && typeof speakWithElevenLabs === 'function') {
            try {
              await speakWithElevenLabs(cleanSpeechText.slice(0, 1000), {
                onEnd: resetBtn,
                onError: fallbackWebSpeech
              });
            } catch(e) {
              fallbackWebSpeech();
            }
          } else {
            fallbackWebSpeech();
          }
        } else if (action === 'copy') {
          const ok = await window.copyToClipboard(msg.text);
          window.toast(ok ? 'Copied explanation to clipboard' : 'Could not copy');
        } else if (action === 'save-notes') {
          const curPage = window.State?.currentPage || 1;
          try {
            await window.DB.put('notes', {
              id: window.uid(),
              fileId,
              page: curPage,
              kind: 'AI Tutor Note (' + (activeTeacherMode.toUpperCase()) + ')',
              content: msg.text,
              createdAt: Date.now()
            });
            window.toast('Saved to Notes! 📝');
          } catch (noteErr) {
            console.warn('Could not save note', noteErr);
            window.toast('Could not save note');
          }
        } else if (action === 'make-flashcard') {
          const frontPrompt = `Create ONE clean study flashcard from this educational explanation:\n"${(msg?.text || '').slice(0, 500)}"\n\nReturn strictly valid JSON: {"front": "question", "back": "answer"}`;
          try {
            const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
            const res = await fetchAi(frontPrompt, 'Generate concise educational flashcard JSON only.');
            const match = res.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              await window.DB.put('flashcards', {
                id: window.uid(),
                fileId,
                front: parsed.front || 'Key Concept',
                back: parsed.back || (msg?.text || '').slice(0, 200),
                createdAt: Date.now(),
                due: Date.now(),
                reps: 0
              });
              window.toast('Flashcard created! View in Review tab 🎴');
            } else {
              throw new Error('Flashcard format fallback');
            }
          } catch(e) {
            await window.DB.put('flashcards', {
              id: window.uid(),
              fileId,
              front: `Key Concept on Page ${window.State?.currentPage || 1}`,
              back: (msg?.text || '').slice(0, 250),
              createdAt: Date.now(),
              due: Date.now(),
              reps: 0
            });
            window.toast('Flashcard created! View in Review tab 🎴');
          }
        }
      };
    });

    // Follow-up chips under the newest answer
    const FOLLOW_UPS = {
      more: 'Explain this in more detail, with one example from the book.',
      simple: 'Explain that again in simpler words.',
      example: 'Give me one more real-life example of this.',
      exam: 'What exam question could come on this? Give a model answer.',
    };
    document.querySelectorAll('.cw-follow[data-fu]').forEach(b => {
      b.onclick = (e) => { e.stopPropagation(); if (FOLLOW_UPS[b.dataset.fu]) sendUserMessage(FOLLOW_UPS[b.dataset.fu]); };
    });

    // Interactive Page Citation Chips click handler
    document.querySelectorAll('.inline-page-jump-chip').forEach(chip => {
      chip.onclick = async (e) => {
        e.stopPropagation();
        const pNum = Number(chip.dataset.page);
        if (pNum && teacherState.activeFileId && teacherState.activeFileId !== 'global_chat') {
          window.toast(`Navigating to Page ${pNum}… 📖`);
          if (typeof window.openReader === 'function') {
            await window.openReader(teacherState.activeFileId, pNum);
          }
        }
      };
    });

    if (typeof window.renderMermaidDiagrams === 'function') {
      setTimeout(() => {
        window.renderMermaidDiagrams(chatLogEl);
      }, 60);
    }

    if (typeof window.renderMathFormulas === 'function') {
      setTimeout(() => {
        window.renderMathFormulas(chatLogEl);
      }, 70);
    } else if (typeof window.renderMathInElement === 'function') {
      setTimeout(() => {
        window.renderMathInElement(chatLogEl, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }, 70);
    }
  }

  renderMessages();

  // Open Customization Sheet (Includes In-Sheet Clear Chat Option)
  const openCustomizationSheet = () => {
    window.Sheet.open(`
      <div style="padding:4px 0;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
          <div>
            <div class="font-display" style="font-size:18px; font-weight:700; color:var(--text);">AI Tutor Settings</div>
            <div style="font-size:12px; color:var(--text-dim);">Configure teaching persona &amp; study parameters</div>
          </div>
          <button id="close-custom-sheet" class="btn btn-icon" style="width:32px; height:32px; border-radius:50%; flex-shrink:0;">
            ${window.icon('x','icon icon-sm')}
          </button>
        </div>

        <!-- AI Inference Engine / Model Selector -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">AI Model Engine</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            <button class="btn custom-engine-opt ${activeAiEngine === 'auto' ? 'active' : ''}" data-engine="auto" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'auto' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'auto' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'auto' ? 'var(--accent)' : 'var(--text)'};">⚡ Auto-Switch (Gemini Flash + OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">High-speed AI reasoning with instantaneous DeepSeek/LLaMA fallback</div>
              </div>
              ${activeAiEngine === 'auto' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>

            <button class="btn custom-engine-opt ${activeAiEngine === 'deepseek' ? 'active' : ''}" data-engine="deepseek" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'deepseek' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'deepseek' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'deepseek' ? 'var(--accent)' : 'var(--text)'};">🧠 DeepSeek V3 (via OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">Exceptional complex reasoning, multi-turn dialogue &amp; math derivation</div>
              </div>
              ${activeAiEngine === 'deepseek' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>

            <button class="btn custom-engine-opt ${activeAiEngine === 'llama' ? 'active' : ''}" data-engine="llama" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeAiEngine === 'llama' ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeAiEngine === 'llama' ? 'var(--accent)' : 'var(--border)'};">
              <div style="text-align:left;">
                <div style="font-size:13px; font-weight:700; color:${activeAiEngine === 'llama' ? 'var(--accent)' : 'var(--text)'};">🦙 Meta LLaMA 3.3 70B (via OpenRouter)</div>
                <div style="font-size:11px; color:var(--text-dim);">Authoritative open-weights model for academic knowledge &amp; textbook Q&amp;A</div>
              </div>
              ${activeAiEngine === 'llama' ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
            </button>
          </div>
        </div>

        <!-- Teaching Personas -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Teaching Persona</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            ${TEACHER_MODES.map(m => `
              <button class="btn custom-mode-opt ${activeTeacherMode === m.id ? 'active' : ''}" data-mode="${m.id}" style="display:flex; align-items:flex-start; text-align:left; gap:12px; padding:12px; border-radius:12px; background:${activeTeacherMode === m.id ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--border)'}; color:var(--text);">
                <div style="color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text-dim)'}; margin-top:2px;">
                  ${window.icon(m.icon, 'icon icon-md')}
                </div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:700; color:${activeTeacherMode === m.id ? 'var(--accent)' : 'var(--text)'};">${m.label}</div>
                  <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">${m.desc}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Evaluator Marks Target -->
        <div id="custom-evaluator-sec" style="display:${activeTeacherMode === 'evaluator' ? 'block' : 'none'}; margin-bottom:16px; background:var(--surface-2); padding:12px; border-radius:12px; border:1px solid var(--border);">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px;">Target Marks Rubric</label>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
            ${[2, 3, 5].map(pts => `
              <button class="btn custom-mark-opt ${examTargetMarks === pts ? 'active' : ''}" data-marks="${pts}" style="padding:8px; font-size:13px; font-weight:700; border-radius:8px; background:${examTargetMarks === pts ? 'var(--accent)' : 'var(--bg)'}; color:${examTargetMarks === pts ? '#fff' : 'var(--text)'}; border:1px solid ${examTargetMarks === pts ? 'var(--accent)' : 'var(--border)'};">
                ${pts} Marks
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Explanation Style (Academic / Step-by-Step / Comprehensive) -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:700; color:var(--text-dim); display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Explanation Style</label>
          <div style="display:grid; grid-template-columns:1fr; gap:8px;">
            ${EXPLANATION_STYLES.map(s => `
              <button class="btn custom-style-opt ${activeExplanationStyle === s.id ? 'active' : ''}" data-style="${s.id}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:10px; background:${activeExplanationStyle === s.id ? 'var(--accent-soft)' : 'var(--surface-2)'}; border:1.5px solid ${activeExplanationStyle === s.id ? 'var(--accent)' : 'var(--border)'};">
                <div style="text-align:left;">
                  <div style="font-size:13px; font-weight:700; color:${activeExplanationStyle === s.id ? 'var(--accent)' : 'var(--text)'};">${s.label}</div>
                  <div style="font-size:11px; color:var(--text-dim);">${s.desc}</div>
                </div>
                ${activeExplanationStyle === s.id ? '<span style="color:var(--accent); font-weight:700;">✓</span>' : ''}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Chat Session Management (Clear Chat with In-Sheet Confirmation) -->
        <div style="border-top:1px solid var(--border); padding-top:14px;" id="clear-chat-container">
          <button class="btn" id="menu-clear-chat-btn" style="width:100%; padding:10px 14px; border-radius:10px; background:var(--danger-soft, rgba(239, 68, 68, 0.1)); border:1px solid var(--danger, #ef4444); color:var(--danger, #ef4444); font-size:13px; font-weight:700; gap:8px; justify-content:center;">
            ${window.icon('trash','icon icon-sm')}
            <span>Clear Chat History</span>
          </button>
          <div id="clear-chat-confirm-box" style="display:none; margin-top:10px; padding:12px; border-radius:10px; background:var(--surface-2); border:1px solid var(--border); text-align:center;">
            <div style="font-size:13px; font-weight:700; color:var(--text); margin-bottom:8px;">Are you sure you want to clear chat history?</div>
            <div style="display:flex; gap:8px; justify-content:center;">
              <button class="btn btn-primary" id="confirm-clear-yes" style="background:var(--danger, #ef4444); border-color:var(--danger, #ef4444); color:#fff; font-size:12px; padding:6px 14px; border-radius:8px;">Yes, Clear All</button>
              <button class="btn" id="confirm-clear-cancel" style="font-size:12px; padding:6px 14px; border-radius:8px;">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('close-custom-sheet').onclick = () => window.Sheet.close();

    const menuClearBtn = document.getElementById('menu-clear-chat-btn');
    const clearConfirmBox = document.getElementById('clear-chat-confirm-box');
    const confirmYesBtn = document.getElementById('confirm-clear-yes');
    const confirmCancelBtn = document.getElementById('confirm-clear-cancel');

    if (menuClearBtn && clearConfirmBox) {
      menuClearBtn.onclick = () => {
        menuClearBtn.style.display = 'none';
        clearConfirmBox.style.display = 'block';
      };
    }

    if (confirmCancelBtn && menuClearBtn && clearConfirmBox) {
      confirmCancelBtn.onclick = () => {
        clearConfirmBox.style.display = 'none';
        menuClearBtn.style.display = 'flex';
      };
    }

    if (confirmYesBtn) {
      confirmYesBtn.onclick = async () => {
        await clearTeacherChatHistory(fileId);
        chatMessages = [];
        await saveTeacherChatHistory(fileId, chatMessages);
        renderMessages();
        window.Sheet.close();
        window.toast('Chat history cleared 🗑️');
      };
    }

    document.querySelectorAll('.custom-mode-opt').forEach(btn => {
      btn.onclick = () => {
        activeTeacherMode = btn.dataset.mode;
        paintModePill();
        const evalSec = document.getElementById('custom-evaluator-sec');
        if (evalSec) evalSec.style.display = activeTeacherMode === 'evaluator' ? 'block' : 'none';
        
        document.querySelectorAll('.custom-mode-opt').forEach(b => {
          const isAct = b.dataset.mode === activeTeacherMode;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });

        window.toast(`Persona: ${btn.querySelector('div > div').textContent}`);
      };
    });

    document.querySelectorAll('.custom-mark-opt').forEach(btn => {
      btn.onclick = () => {
        examTargetMarks = Number(btn.dataset.marks);
        document.querySelectorAll('.custom-mark-opt').forEach(b => {
          const isAct = Number(b.dataset.marks) === examTargetMarks;
          b.style.background = isAct ? 'var(--accent)' : 'var(--bg)';
          b.style.color = isAct ? '#fff' : 'var(--text)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
        });
        window.toast(`Rubric set to ${examTargetMarks} Marks`);
      };
    });

    document.querySelectorAll('.custom-style-opt').forEach(btn => {
      btn.onclick = () => {
        activeExplanationStyle = btn.dataset.style;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sayad_explanation_style', activeExplanationStyle);
        }
        document.querySelectorAll('.custom-style-opt').forEach(b => {
          const isAct = b.dataset.style === activeExplanationStyle;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
          const chk = b.querySelector('span:last-child');
          if (chk) chk.style.display = isAct ? 'inline' : 'none';
        });
        window.toast(`Explanation Style: ${btn.querySelector('div > div').textContent}`);
      };
    });

    document.querySelectorAll('.custom-engine-opt').forEach(btn => {
      btn.onclick = () => {
        activeAiEngine = btn.dataset.engine;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('sayad_preferred_ai_engine', activeAiEngine);
        }
        document.querySelectorAll('.custom-engine-opt').forEach(b => {
          const isAct = b.dataset.engine === activeAiEngine;
          b.style.background = isAct ? 'var(--accent-soft)' : 'var(--surface-2)';
          b.style.borderColor = isAct ? 'var(--accent)' : 'var(--border)';
          const checkSpan = b.querySelector('span');
          if (isAct) {
            if (!checkSpan) {
              const sp = document.createElement('span');
              sp.style.cssText = 'color:var(--accent); font-weight:700;';
              sp.textContent = '✓';
              b.appendChild(sp);
            }
          } else {
            if (checkSpan) checkSpan.remove();
          }
        });
        const name = btn.querySelector('div > div')?.textContent || activeAiEngine;
        window.toast(`Engine: ${name.split('(')[0].trim()}`);
      };
    });
  };

  if (customToggle) customToggle.onclick = openCustomizationSheet;

  // Dynamic Suggestion Chips Updater
  let lastKnownSubject = '';

  const cleanSubjectForChips = (raw) => {
    if (!raw) return '';
    let s = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[?!.,;:"'()[\]{}]/g, ' ')
      .replace(/\b(?:acha|achha|accha|theek\s+hai|thik\s+hai|ok|okay|ab|fir|phir|aur|sun|suno|bhai|yaar|dost|arrey|are|sir|mam|madam|please|kripya|zara|ek\s+baar|thoda|thode|kuch|koi|bhi|toh|to|chalo|well|now|then|so)\b/gi, ' ')
      .replace(/\b(?:mujhe|kripya|please|can\s+you|banao|dikhao|dikaho|dikha|dikho|dikhdo|dikhadena|dikahao|dikhye|dikhaye|dikhana|dekhao|deko|dekho|dekhna|dikhwao|do|dena|show\s+me|show|generate|give\s+me|give|create|fetch|send|bhejo|image\s+of|photo\s+of|picture\s+of|diagram\s+of|map\s+of|portrait\s+of|potrait\s+of|ka|ki|ke|ko|se|me|mein|par|pe|ek|a|an|the|ya|or|chahiye|dekhna|potrait|portrait|portait|portret|tasveer|tasvir|chitra|naksha|photo|photos|foto|fotos|pic|pics|picture|pictures|image|images|imag|imge|img|imgs|imeg|imaj|flowchart|flow\s+chart|diagram|diagrams|draw|drawing|zariye|madhyam|samjhao|samjha|batao|explain|detail\s+me|kyu|kyun|kya|hai|hain|tha|the)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/\b(?:modi|narendra\s+modi)\b/i.test(s)) return 'Narendra Modi';
    if (/\b(?:ramanujan|srinivasa)\b/i.test(s)) return 'Srinivasa Ramanujan';
    if (/\b(?:kalam|abdul\s+kalam)\b/i.test(s)) return 'A. P. J. Abdul Kalam';
    if (/\b(?:aryabhata|aryabhatta)\b/i.test(s)) return 'Aryabhata';
    if (/\b(?:shivaji)\b/i.test(s)) return 'Shivaji Maharaj';
    if (/\b(?:hitler|adolf)\b/i.test(s)) return 'Adolf Hitler';
    if (/\b(?:curie|marie)\b/i.test(s)) return 'Marie Curie';
    if (/\b(?:einstein|albert)\b/i.test(s)) return 'Albert Einstein';
    if (/\b(?:newton|isaac)\b/i.test(s)) return 'Isaac Newton';
    if (/\b(?:darwin|charles)\b/i.test(s)) return 'Charles Darwin';
    if (/\b(?:galileo)\b/i.test(s)) return 'Galileo Galilei';
    if (/\b(?:tesla|nikola)\b/i.test(s)) return 'Nikola Tesla';
    if (/\b(?:gandhi|mahatma)\b/i.test(s)) return 'Mahatma Gandhi';
    if (/\b(?:bose|subhas|subhash)\b/i.test(s)) return 'Subhash Chandra Bose';
    if (/\b(?:nehru|jawaharlal)\b/i.test(s)) return 'Jawaharlal Nehru';
    if (/\b(?:ambedkar)\b/i.test(s)) return 'B. R. Ambedkar';
    if (/\b(?:bhagat\s+singh)\b/i.test(s)) return 'Bhagat Singh';

    const hasPronoun = /\b(?:unka|unke|unki|unko|unhe|inka|inke|inki|inko|inhe|iska|iske|iski|isko|uska|uske|uski|usko|ye|yeh|wo|woh|he|she|they|his|her)\b/i.test(s);
    if (hasPronoun || s.length < 2) return '';
    return s.slice(0, 26);
  };

  // Chips written by the model for this exact conversation.
  function renderFollowupChips(list, cards) {
    const bar = document.getElementById('chat-quick-chips-bar');
    if (!bar || (!list.length && !(cards && cards.length))) return;
    const cardChip = cards && cards.length ? `<button class="chat-quick-chip" id="quiz-cards-chip" style="white-space:nowrap; flex-shrink:0; border-color:var(--accent); color:var(--accent); font-weight:700;"><span>🃏 Add ${cards.length} card${cards.length > 1 ? 's' : ''} to Review</span></button>` : '';
    bar.innerHTML = cardChip + list.map(q => `<button class="chat-quick-chip" data-query="${window.escapeHtml(q)}" style="white-space:nowrap; flex-shrink:0;"><span>${window.escapeHtml(q)}</span></button>`).join('');
    bar.scrollLeft = 0;
    const cc = bar.querySelector('#quiz-cards-chip');
    if (cc) cc.onclick = async () => {
      cc.disabled = true;
      let n = 0;
      for (const c of cards) {
        await window.DB.put('flashcards', { id: `qz-${Date.now()}-${n}`, fileId: teacherState.activeFileId || 'global', page: window.State?.currentPage || 1, category: 'Quiz mistakes', front: c.front, back: c.back, due: Date.now(), stability: 0.5, difficulty: 5, reps: 0, lapses: 1, createdAt: Date.now() });
        n++;
      }
      window.toast && window.toast(`Added ${n} card${n > 1 ? 's' : ''} to Review.`);
      cc.remove();
    };
    bar.querySelectorAll('.chat-quick-chip[data-query]').forEach(chip => {
      chip.onclick = () => { const q = chip.dataset.query; if (q && inputEl) { inputEl.value = q; sendUserMessage(); } };
    });
  }

  function updateDynamicQuickChips(detectedTopic) {
    const bar = document.getElementById('chat-quick-chips-bar');
    if (!bar) return;

    let cleanTopic = cleanSubjectForChips(detectedTopic);

    if (cleanTopic && cleanTopic.length >= 2) {
      lastKnownSubject = cleanTopic;
    } else if (lastKnownSubject) {
      cleanTopic = lastKnownSubject;
    }

    let chips = [];
    if (cleanTopic && cleanTopic.length >= 2) {
      const shortTitle = cleanTopic.slice(0, 20);
      chips = [
        ...(!isGlobal ? [
          { label: '🎓 Teach Me Chapter', query: 'Teach me this chapter step-by-step with interactive checkpoints' },
          { label: '📖 Summarise Chapter', query: 'Summarise this chapter with core breakdown and key takeaways' }
        ] : []),
        { label: `📊 ${shortTitle} Flowchart`, query: `Draw an interactive Mermaid flowchart showing the timeline, key stages, and core components of ${cleanTopic}` },
        { label: `⚡ ${shortTitle} Detail Breakdown`, query: `Detail me samjhao ${cleanTopic} ke core concepts, causes aur deep points` },
        { label: `💡 Simple Analogy`, query: `Is concept (${cleanTopic}) ko everyday real-world analogy se simple terms me samjhao` },
        { label: `🖼️ Visual / Diagram`, query: `${cleanTopic} ka authentic educational visual illustration ya diagram dikhao` },
        { label: `🎯 Exam Points`, query: `Exam ke point of view se ${cleanTopic} par high-yield questions aur scoring keywords batao` }
      ];
    } else {
      chips = [
        ...(!isGlobal ? [
          { label: '🎓 Teach Me Chapter', query: 'Teach me this chapter step-by-step with interactive checkpoints' },
          { label: '📖 Summarise Chapter', query: 'Summarise this chapter with core breakdown and key takeaways' }
        ] : []),
        { label: '⚡ Detail me samjhao', query: '⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath' },
        { label: '📊 Flowchart', query: 'Draw a clear Mermaid flowchart diagram explaining this process step-by-step' },
        { label: '💡 Simple Analogy', query: '💡 Is concept ko simple real-world analogy se samjhao (zero jargon)' },
        { label: '🎯 Exam Points', query: '🎯 Exam ke point of view se important questions, keywords aur scoring points batao' },
        { label: '🖼️ Visual / Diagram', query: '🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao' }
      ];
    }

    bar.innerHTML = chips.map(c => `
      <button class="chat-quick-chip" data-query="${window.escapeHtml(c.query)}" style="white-space:nowrap; flex-shrink:0;">
        <span>${c.label}</span>
      </button>
    `).join('');

    bar.querySelectorAll('.chat-quick-chip').forEach(chip => {
      chip.onclick = () => {
        const q = chip.dataset.query;
        if (q && inputEl) {
          inputEl.value = q;
          sendUserMessage();
        }
      };
    });
  }

  // Quick Suggestion Chips Initial Click Binding
  document.querySelectorAll('.chat-quick-chip').forEach(chip => {
    chip.onclick = () => {
      const q = chip.dataset.query;
      if (q && inputEl) {
        inputEl.value = q;
        sendUserMessage();
      }
    };
  });

  // Real-time Voice Dictation in Input Box (Hindi-to-Hinglish + English Support with Deduplication and 3.5s Silence Auto-Stop)
  let isDictating = false;
  let dictationRecognition = null;
  let silenceTimer = null;
  let baseInputText = '';
  let accumulatedFinalText = '';

  function stopDictation(notifySilence = false) {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (dictationRecognition) {
      try { dictationRecognition.stop(); } catch(e) {}
      dictationRecognition = null;
    }
    isDictating = false;
    if (inputMicBtn) {
      inputMicBtn.style.color = 'var(--text-dim)';
      inputMicBtn.style.background = 'transparent';
      inputMicBtn.style.boxShadow = 'none';
    }
    if (notifySilence) {
      window.toast('Mic auto-stopped after silence 🎙️');
    }
  }

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (isDictating) {
        stopDictation(true);
      }
    }, 3500); // 3.5 seconds of silence auto-stops the mic
  }

  function toggleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.toast('Speech recognition is not supported in this browser tab.');
      return;
    }

    if (isDictating) {
      stopDictation(false);
      window.toast('Voice dictation stopped');
      return;
    }

    try {
      dictationRecognition = new SpeechRecognition();
      dictationRecognition.continuous = true;
      dictationRecognition.interimResults = true;
      // hi-IN recognizes Indian English & Hindi speech seamlessly
      dictationRecognition.lang = 'hi-IN';

      baseInputText = (inputEl ? inputEl.value : '').trim();
      accumulatedFinalText = '';

      dictationRecognition.onstart = () => {
        isDictating = true;
        if (inputMicBtn) {
          inputMicBtn.style.color = '#fff';
          inputMicBtn.style.background = 'var(--danger, #ef4444)';
          inputMicBtn.style.borderRadius = '50%';
          inputMicBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
        }
        window.toast('Listening in Hindi/English... Speak now 🎙️');
        resetSilenceTimer();
      };

      dictationRecognition.onspeechstart = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onspeechend = () => {
        resetSilenceTimer();
      };

      dictationRecognition.onresult = (event) => {
        resetSilenceTimer();

        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += (sessionFinal ? ' ' : '') + txt;
          } else {
            sessionInterim += (sessionInterim ? ' ' : '') + txt;
          }
        }

        const totalSpoken = (sessionFinal + (sessionInterim ? ' ' + sessionInterim : '')).trim();
        // Transliterate Hindi words to clean Hinglish / Roman script
        const transliterated = transliterateDevanagariToHinglish(totalSpoken);
        const cleanSpoken = deduplicateSpokenPhrase(transliterated);

        if (inputEl) {
          const combined = baseInputText ? `${baseInputText} ${cleanSpoken}` : cleanSpoken;
          inputEl.value = combined.trim();
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        }
      };

      dictationRecognition.onerror = (err) => {
        console.warn('Dictation notice:', err);
        stopDictation(false);
        if (err.error === 'not-allowed') {
          window.toast('Microphone permission was denied. Please grant permission.');
        }
      };

      dictationRecognition.onend = () => {
        if (isDictating) {
          stopDictation(false);
        }
      };

      dictationRecognition.start();
    } catch(err) {
      console.error('Dictation start error:', err);
      window.toast('Could not start microphone: ' + err.message);
    }
  }

  if (inputMicBtn) {
    inputMicBtn.onclick = () => toggleDictation();
  }

  async function sendUserMessage(overrideText = null) {
    const userText = (overrideText || inputEl?.value || '').trim();
    if (!userText || sendBtn.disabled) return;

    if (isDictating) {
      stopDictation(false);
    }

    chatMessages.push({
      role: 'user',
      text: userText,
      timestamp: Date.now()
    });
    if (inputEl) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    // Quizzes live in the Quiz Generator (reliable, graded, saves mistakes): point there instead of faking a quiz in chat.
    if (/\b(quiz|mcq|mcqs|test\s+me|mock\s+test)\b|sawal\s+poochh|questions?\s+poochh/i.test(userText) && fileId !== 'global_chat') {
      chatMessages.push({
        role: 'assistant',
        text: 'Quiz ke liye Quiz Generator best hai: chapter chuno, MCQ / fill in the blank / short answer ka mix lo, aur galtiyan apne aap review me chali jati hain.',
        quizCta: true,
        mode: activeTeacherMode,
        timestamp: Date.now()
      });
      await saveTeacherChatHistory(fileId, chatMessages);
      renderMessages();
      return;
    }
    
    chatMessages.push({
      role: 'assistant',
      text: '…',
      mode: activeTeacherMode,
      timestamp: Date.now()
    });

    renderMessages();
    sendBtn.disabled = true;

    try {
      const ctx = await getTeacherContext({ includeCrossPdf: teacherState.crossPdfActive, scope: activeContextScope }, userText, chatMessages);
      
      // Update UI with detected or anchor page
      const scopePageNumEl = document.getElementById('scope-page-num');
      const headerPageBadge = document.getElementById('teacher-header-page-badge');
      if (scopePageNumEl && ctx.currentPage) scopePageNumEl.textContent = ctx.currentPage;
      if (headerPageBadge && ctx.currentPage && fileId !== 'global_chat') headerPageBadge.textContent = `PAGE ${ctx.currentPage}`;

      // Dynamically sync chapter scope select and badge if a specific chapter was detected/grounded
      if (ctx.startPage && ctx.endPage && scopeSelect && cachedChapterList && cachedChapterList.length > 0) {
        const foundIdx = cachedChapterList.findIndex(ch => ch.startPage === ctx.startPage);
        if (foundIdx !== -1) {
          scopeSelect.value = `ch_${foundIdx}`;
          if (scopeBadgePill) scopeBadgePill.textContent = `CH ${ctx.detectedChapterNumber || foundIdx + 1}`;
          if (typeof window.enhanceSelect === 'function') {
            window.enhanceSelect(scopeSelect);
          }
        }
      }
      
      let systemPersonaInstruction = '';
      if (activeTeacherMode === 'eli5') {
        systemPersonaInstruction = 'Explain using simple, intuitive everyday analogies with zero unnecessary jargon.';
      } else if (activeTeacherMode === 'mnemonics') {
        systemPersonaInstruction = 'Focus on memory hooks, creative acronyms, and quick recall tricks for easy retention.';
      } else if (activeTeacherMode === 'evaluator') {
        systemPersonaInstruction = `Evaluate according to standard exam marking rubrics (${examTargetMarks} Marks Target), highlighting scoring keywords.`;
      } else if (activeTeacherMode === 'summary') {
        systemPersonaInstruction = 'Rapid revision mode: answer as a tight cheat sheet. Short bullet points, key definitions, formulas, dates and keywords in bold. No long paragraphs, no filler. End with a one-line "remember this" takeaway.';
      } else {
        systemPersonaInstruction = 'Academic mode: act like a sharp, rigorous teacher. NEVER greet; start with a 1-2 line direct answer, then break it down textbook-style: the core concept in plain words, how/why it works, one concrete example, and the exam-relevant points (key terms in bold, common mistakes). Keep it tight and skip sections that do not apply to a simple question. For a casual or one-line question, just answer naturally without the full structure.';
      }

      const compactHistory = buildCompactHistory(chatMessages);
      const recentConvo = formatCompactHistory(compactHistory);

      const streamMode = typeof window.getStreamingMode === 'function' ? window.getStreamingMode() : (window.State?.streamingMode || 'sse');
      const aiMsgCard = chatLogEl.querySelector('#msg-card-' + (chatMessages.length - 1)) || chatLogEl.querySelector('.teacher-chat-msg:last-child');
      const aiBubble = aiMsgCard ? aiMsgCard.querySelector('.chat-msg-ai-bubble') : chatLogEl.querySelector('.chat-msg-ai-bubble:last-of-type');
      const renderMd = typeof window.renderMarkdown === 'function' ? window.renderMarkdown : (s => s);
      const customKey = window.State?.customGeminiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('sayad_custom_gemini_key') : '');

      let replyText = '';
      let markers = null;

      const requestPayload = {
        userQuestion: userText,
        docTitle: ctx.docTitle,
        currentPage: ctx.currentPage,
        totalPages: ctx.totalPages,
        chapterText: ctx.chapterText || ctx.pageText,
        fullContext: ctx.chapterText || ctx.pageText || ctx.bookOverviewText,
        persona: systemPersonaInstruction,
        language: 'English/Hinglish (matching the student natural inquiry)',
        chatHistory: compactHistory.chatHistory,
        conversationSummary: compactHistory.conversationSummary,
        customKey: customKey || undefined,
        preferredEngine: activeAiEngine || 'auto',
        explanationStyle: activeExplanationStyle || 'comprehensive',
        detectedChapterNumber: ctx.detectedChapterNumber || '',
        detectedChapterTitle: ctx.detectedChapterTitle || '',
        detectedChapterType: ctx.detectedChapterType || 'Chapter',
        chapterStartPage: ctx.startPage,
        chapterEndPage: ctx.endPage,
        needsClarification: Boolean(ctx.needsClarification),
        webSearch: webSearchOn
      };

      // 1. True Real-Time Word-By-Word Streaming Mode (SSE)
      if (streamMode === 'sse' && typeof window.fetchSSEStream === 'function' && aiBubble) {
        let streamer = null;
        if (typeof window.createWordByWordStreamer === 'function') {
          streamer = window.createWordByWordStreamer(aiBubble, { scrollContainer: chatLogEl });
        }
        try {
          replyText = await window.fetchSSEStream(
            '/api/ai/hybrid-tutor',
            requestPayload,
            (chunk, accumulated) => {
              if (streamer) {
                streamer.pushText(chunk);
              } else {
                aiBubble.innerHTML = renderMd(accumulated) + '<span class="ai-typing-cursor" style="display:inline-block; color:var(--accent); font-weight:800; margin-left:2px; animation:blink 0.8s infinite;">▌</span>';
                chatLogEl.scrollTop = chatLogEl.scrollHeight;
              }
            }
          );
          markers = replyText ? extractAllMarkers(replyText) : null;
          if (markers) replyText = markers.text;
          if (streamer) {
            await streamer.finish(replyText);
          }
        } catch (streamErr) {
          console.warn('Teacher AI SSE stream error, falling back to unary fetch:', streamErr);
          if (streamer) streamer.cancel();
          replyText = '';
        }
      }

      // 2. Unary Fallback or Non-Streaming Fetch (for Typewriter / Instant mode)
      if (!replyText) {
        try {
          const resp = await fetch('/api/ai/hybrid-tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data && data.text) {
              replyText = data.text;
            }
          }
        } catch (hybridErr) {
          console.warn('Hybrid tutor endpoint fallback:', hybridErr);
        }
      }

      if (!replyText) {
        try {
          const fullPrompt = `You are S.A.Y.A.D. AI — an unrestricted, world-class Academic AI Tutor and Universal Super-Intelligence.

${systemPersonaInstruction}

DIRECTIVES & QUESTION-SOLVING PROTOCOL:
1. **IN-TEXT & EXERCISE QUESTIONS**:
   - Always extract the REAL, EXACT question statement from the reference document passages labeled \`🎯 PRIMARY INTEXT QUESTIONS\` or \`EXACT QUESTIONS\`.
   - ❌ NEVER invent or hallucinate fake questions.
   - If the PDF has no answer key: Solve the question completely and step-by-step from the lesson theory and your academic knowledge.
   - If the PDF has an answer key: State the question, explain the full derivation/solution, and incorporate the textbook key points.
2. **CHAPTER & LESSON QUERIES (e.g. "Chapter 8 kya hai", "Lesson 4")**:
   - Provide a complete, structured breakdown (Theme, Concepts, Timeline, Exam Questions).
   - ❌ NEVER say "not in this book" or "currently on page 1".
3. **UNIVERSAL ACADEMIC COVERAGE**:
   - Answer any query across all subjects with authoritative clarity.

STUDENT QUESTION: "${userText}"
${recentConvo ? `\nPREVIOUS CHAT:\n${recentConvo}\n` : ''}
${ctx.chapterText || ctx.pageText ? `\nREFERENCE DOCUMENT PASSAGES:\n${ctx.chapterText || ctx.pageText}\n` : ''}

Provide the complete academic answer now:`;

          const fetchAi = (typeof callServerGemini === 'function' ? callServerGemini : window.callServerGemini) || callAI || window.callAI;
          if (typeof fetchAi === 'function') {
            replyText = await fetchAi(fullPrompt, systemPersonaInstruction, 'gemini-3.1-flash-lite');
          }
        } catch (fetchErr) {
          console.warn('Direct AI fallback warning:', fetchErr);
        }
      }

      // Interactive cards, follow-up chips and review cards the model attached to its reply.
      replyText = typeof replyText === 'string' ? replyText : '';
      const mk = (markers && markers.text === replyText) ? markers : extractAllMarkers(replyText);
      replyText = mk.text;
      const followups = mk.followups;
      window.__lastFollowups = followups;
      window.__quizCards = mk.cards;

      let replyFailed = false;
      if (!replyText) {
        replyFailed = true;
        replyText = (typeof navigator !== 'undefined' && navigator.onLine === false)
          ? `📡 Internet nahi mil raha, isliye jawab nahi aa paya. Net aane par wahi sawaal dobara bhej dena.`
          : `⚠️ AI se abhi jawab nahi aaya. Ye aam taur par Gemini key ya server ke issue se hota hai. Settings mein key check karo ya thodi der baad wahi sawaal dobara bhejo.`;
      }

      // Finish response delivery based on selected streaming mode:
      if (streamMode === 'sse') {
        // Option 1: Word-by-Word Live Natural Flow
        // If replyText came from unary fallback (stream didn't run), type word-by-word now:
        if (aiBubble && aiBubble.innerHTML.trim() === '…') {
          if (typeof window.streamWordByWord === 'function') {
            await window.streamWordByWord(aiBubble, replyText, null, chatLogEl);
          } else {
            aiBubble.innerHTML = renderMd(replyText);
          }
        } else if (aiBubble) {
          aiBubble.innerHTML = renderMd(replyText);
        }
        if (aiBubble && typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
        if (aiBubble && typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
      } else if (streamMode === 'typewriter' && aiBubble && replyText.length >= 30) {
        // Option 2: Smooth Morphic Wave (Structured Card & Section Reveal)
        if (typeof window.streamMorphicWave === 'function') {
          await window.streamMorphicWave(aiBubble, replyText, () => {
            if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
            if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
          }, chatLogEl);
        } else {
          aiBubble.innerHTML = renderMd(replyText);
          if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
          if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
        }
      } else {
        // Option 3: Turbo Instant Jump
        if (aiBubble) {
          aiBubble.innerHTML = renderMd(replyText);
          if (typeof window.renderMermaidDiagrams === 'function') window.renderMermaidDiagrams(aiBubble);
          if (typeof window.renderMathFormulas === 'function') window.renderMathFormulas(aiBubble);
        }
      }

      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: replyText,
        mode: activeTeacherMode,
        timestamp: Date.now(),
        isError: replyFailed || undefined
      };
      await saveTeacherChatHistory(fileId, chatMessages);
      renderMessages();
    } catch(err) {
      console.error('Teacher AI Error:', err);
      chatMessages[chatMessages.length - 1] = {
        role: 'assistant',
        text: `⚠️ Kuch gadbad ho gayi aur jawab nahi aa paya. Wahi sawaal ek baar dobara bhejo.`,
        mode: activeTeacherMode,
        timestamp: Date.now(),
        isError: true
      };
      renderMessages();
    }

    sendBtn.disabled = false;

    // Dynamically refresh quick chips with contextually relevant follow-up suggestions
    try {
      const fu = window.__lastFollowups || [];
      window.__lastFollowups = [];
      const qc = window.__quizCards || [];
      window.__quizCards = [];
      if (qc.length) renderFollowupChips(fu, qc);
      else if (fu.length) renderFollowupChips(fu);
      else {
        const candidateTopic = cleanSubjectForChips(userText) || lastKnownSubject;
        if (candidateTopic) updateDynamicQuickChips(candidateTopic);
      }
    } catch(e) {}
  }

  // Bind Send & Input events
  if (sendBtn) sendBtn.onclick = () => sendUserMessage();
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
      }
    };
    inputEl.oninput = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    };
  }

  // Back button returns to reader or dashboard
  if (backBtn) {
    backBtn.onclick = () => {
      stopElevenAudio();
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e) {}
      window._activeTeacherSpeech = null;
      if (isVoiceActive()) stopVoiceRecognition();
      if (isDictating && dictationRecognition) {
        try { dictationRecognition.stop(); } catch(e) {}
      }
      if (window.State?.currentDoc && window.State?.currentFile?.id === fileId) {
        window.State.view = 'reader';
        window.renderReaderShell();
        window.mountReaderContent();
      } else {
        window.State.view = 'dashboard';
        window.renderDashboard();
      }
    };
  }

  // --- Chapter Scope Selector & Auto-Sync Setup ---
  function paintModePill() {
    const t = document.getElementById('teacher-mode-pill-text');
    const m = TEACHER_MODES.find(x => x.id === activeTeacherMode);
    if (t && m) t.textContent = m.short || m.label;
  }
  const modePill = document.getElementById('teacher-mode-pill');
  if (modePill) modePill.onclick = () => openCustomizationSheet();
  const scopeSelect = document.getElementById('teacher-chapter-select');
  const scopeBadgePill = document.getElementById('teacher-scope-badge-pill');
  let cachedChapterList = [];

  function updateQuickPromptChips() {
    const chipsBar = document.getElementById('chat-quick-chips-bar');
    if (!chipsBar || isGlobal) return;

    let targetTitle = 'Chapter';
    if (activeContextScope === 'chapter' && teacherState.currentSessionChapter) {
      targetTitle = teacherState.currentSessionChapter.chapterTitle || `Ch ${teacherState.currentSessionChapter.chapterNumber}`;
      if (targetTitle.length > 20) targetTitle = targetTitle.slice(0, 18) + '…';
    } else if (activeContextScope === 'page') {
      targetTitle = `Page ${currentPage}`;
    } else if (activeContextScope === 'book') {
      targetTitle = 'Book';
    }

    chipsBar.innerHTML = `
      <button class="chat-quick-chip" data-query="Teach me ${window.escapeHtml(targetTitle)} step-by-step with interactive checkpoints">
        <span>🎓 Teach Me ${window.escapeHtml(targetTitle)}</span>
      </button>
      <button class="chat-quick-chip" data-query="Summarise ${window.escapeHtml(targetTitle)} with core breakdown and key takeaways">
        <span>📖 Summarise ${window.escapeHtml(targetTitle)}</span>
      </button>
      <button class="chat-quick-chip" data-query="⚡ Detail me samjhao — key concepts, causes, aur deep breakdown ke saath">
        <span>⚡ Detail me samjhao</span>
      </button>
      <button class="chat-quick-chip" data-query="Exam ke point of view se ${window.escapeHtml(targetTitle)} ke important questions, keywords aur scoring points batao">
        <span>🎯 Exam Points</span>
      </button>
      <button class="chat-quick-chip" data-query="Draw a clear Mermaid flowchart diagram explaining this process step-by-step">
        <span>📊 Flowchart</span>
      </button>
      <button class="chat-quick-chip" data-query="💡 Is concept ko simple real-world analogy se samjhao (zero jargon)">
        <span>💡 Simple Analogy</span>
      </button>
      <button class="chat-quick-chip" data-query="🖼️ Is concept ka labeled diagram ya authentic visual illustration dikhao">
        <span>🖼️ Visual / Diagram</span>
      </button>
    `;

    chipsBar.querySelectorAll('.chat-quick-chip').forEach(btn => {
      btn.onclick = () => {
        const q = btn.getAttribute('data-query');
        if (inputEl && q) {
          inputEl.value = q;
          inputEl.focus();
          sendUserMessage(q);
        }
      };
    });
  }

  async function setupChapterScope() {
    if (isGlobal || !scopeSelect) return;
    const doc = window.State?.currentDoc;
    if (doc && typeof window.getChapterList === 'function') {
      try {
        cachedChapterList = await window.getChapterList(doc, fileId);
      } catch (err) {
        console.warn('Could not load chapter list for chat:', err);
      }
    }

    // Auto-detect current reading chapter if not manually chosen yet
    if (cachedChapterList.length > 0 && !teacherState.currentSessionChapter) {
      const match = cachedChapterList.find(ch => currentPage >= ch.startPage && currentPage <= ch.endPage);
      if (match) {
        let cleanTitle = match.subtitle || match.title || match.rawTitle || '';
        cleanTitle = cleanTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
        cleanTitle = cleanTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
        cleanTitle = cleanTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');

        const numMatch = (match.rawTitle || '').match(/\d+/) || (match.title || '').match(/(?:ch|chapter|module|lesson|unit)\s*[-–:.]?\s*(\d+)/i) || (match.title || '').match(/\d+/);

        teacherState.currentSessionChapter = {
          fileId,
          chapterNumber: numMatch ? numMatch[0] : (match.chapterNumber || ''),
          chapterTitle: cleanTitle || match.rawTitle || match.title,
          startPage: match.startPage,
          endPage: match.endPage,
          label: match.label
        };
        activeContextScope = 'chapter';
      }
    }

    // Build options list
    let optionsHtml = '';
    optionsHtml += `<option value="__page__" ${activeContextScope === 'page' ? 'selected' : ''}>📄 Current Page Focus (Page ${currentPage})</option>`;
    optionsHtml += `<option value="__book__" ${activeContextScope === 'book' ? 'selected' : ''}>📚 Full Book Overview (Pages 1–${totalPages})</option>`;

    if (cachedChapterList.length > 0) {
      cachedChapterList.forEach((ch, idx) => {
        const isSelected = activeContextScope === 'chapter' && teacherState.currentSessionChapter && (
          (teacherState.currentSessionChapter.startPage === ch.startPage && teacherState.currentSessionChapter.endPage === ch.endPage) ||
          (teacherState.currentSessionChapter.chapterTitle === ch.rawTitle || teacherState.currentSessionChapter.chapterTitle === ch.title)
        );
        optionsHtml += `<option value="ch_${idx}" ${isSelected ? 'selected' : ''}>${window.escapeHtml(ch.label)}</option>`;
      });
    }

    scopeSelect.innerHTML = optionsHtml;

    if (scopeBadgePill) {
      if (activeContextScope === 'chapter' && teacherState.currentSessionChapter) {
        scopeBadgePill.textContent = `CH ${teacherState.currentSessionChapter.chapterNumber || ''}`.trim() || 'CHAPTER';
      } else if (activeContextScope === 'page') {
        scopeBadgePill.textContent = `PAGE ${currentPage}`;
      } else {
        scopeBadgePill.textContent = 'ALL BOOK';
      }
    }

    // Enhance with our bespoke custom dropdown
    if (typeof window.enhanceSelect === 'function') {
      window.enhanceSelect(scopeSelect);
    }

    updateQuickPromptChips();

    // Bind change listener
    scopeSelect.onchange = () => {
      const val = scopeSelect.value;
      if (val === '__page__') {
        activeContextScope = 'page';
        if (scopeBadgePill) scopeBadgePill.textContent = 'PAGE';
        window.toast(`Chat focus: Page ${currentPage}`);
      } else if (val === '__book__') {
        activeContextScope = 'book';
        if (scopeBadgePill) scopeBadgePill.textContent = 'ALL BOOK';
        window.toast('Chat focus: Entire Document');
      } else if (val.startsWith('ch_')) {
        const idx = parseInt(val.replace('ch_', ''), 10);
        const ch = cachedChapterList[idx];
        if (ch) {
          activeContextScope = 'chapter';
          let cleanTitle = ch.subtitle || ch.title || ch.rawTitle || '';
          cleanTitle = cleanTitle.replace(/^(?:ch|chap|chapter|lesson|unit|module)\s*[-–:.]?\s*\d+\s*[-–:.]?\s*/i, '');
          cleanTitle = cleanTitle.replace(/\b(?:module|chapter|unit|lesson)\s*[-–:.]?\s*\d+\b/gi, '');
          cleanTitle = cleanTitle.trim().replace(/^[-–:.\s]+|[-–:.\s]+$/g, '');

          const numMatch = (ch.rawTitle || '').match(/\d+/) || (ch.title || '').match(/(?:ch|chapter|module|lesson|unit)\s*[-–:.]?\s*(\d+)/i) || (ch.title || '').match(/\d+/);

          teacherState.currentSessionChapter = {
            fileId,
            chapterNumber: numMatch ? numMatch[0] : String(idx + 1),
            chapterTitle: cleanTitle || ch.rawTitle || ch.title,
            startPage: ch.startPage,
            endPage: ch.endPage,
            label: ch.label
          };
          if (scopeBadgePill) scopeBadgePill.textContent = `CH ${teacherState.currentSessionChapter.chapterNumber || idx + 1}`;
          window.toast(`Chat focus: ${teacherState.currentSessionChapter.chapterTitle || 'Chapter'}`);
        }
      }
      updateQuickPromptChips();
    };
  }

  setupChapterScope();

  // If there was a prefilled query, trigger it
  if (prefillQuery && prefillQuery.trim()) {
    if (inputEl) inputEl.value = prefillQuery.trim();
    sendUserMessage(prefillQuery.trim());
  }
}


window.openTeacherView = openTeacherView;
window.getTeacherContext = getTeacherContext;
window.loadTeacherChatHistory = loadTeacherChatHistory;
window.saveTeacherChatHistory = saveTeacherChatHistory;
window.clearTeacherChatHistory = clearTeacherChatHistory;
window.findRelevantPages = findRelevantPages;
