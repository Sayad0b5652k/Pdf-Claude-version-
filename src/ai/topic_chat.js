// @ts-nocheck
import { callAI } from "./study_core.js";
import { fixLegacyItems } from "../hindi_fix.js";

// --- DEDICATED IN-READER TOPIC & TEXT SELECTION AI ASSISTANT ---
export async function openTopicAIChat(prefillQuestion, selectedContext = '') {
  if (window.Sheet && window.Sheet.close) window.Sheet.close();

  const file = window.State.currentFile;
  const pageNum = window.State.currentPage || 1;
  const numPages = window.State.numPages || 1;
  const docTitle = file?.name || 'Current Document';

  // Get active selected text if available
  let activeSnippet = selectedContext;
  if (!activeSnippet && window.pendingSelection && window.pendingSelection.text) {
    activeSnippet = window.pendingSelection.text.trim();
  }

  // Get current page text
  let pageText = '';
  try {
    if (window.State.currentDoc) {
      const page = await window.State.currentDoc.getPage(pageNum);
      const content = await page.getTextContent();
      pageText = fixLegacyItems(content.items.map(i => i.str)).trim();
    }
  } catch (e) {
    console.warn('Could not extract current page text for topic chat', e);
  }

  const topicChatHistory = [];
  const topicId = `topic_${file ? file.id : 'temp'}_p${pageNum}`;

  // Load existing topic notes/chat if any
  try {
    const saved = localStorage.getItem(`sayad_topic_chat_${topicId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) topicChatHistory.push(...parsed);
    }
  } catch (e) {}

  window.Sheet.open(`
    <div id="topic-chat-wrapper" style="display:flex; flex-direction:column; height:80vh; max-height:680px; font-family:inherit;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:1px solid var(--border); margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:800;">
            ⚡
          </div>
          <div>
            <div style="font-size:14px; font-weight:800; color:var(--text); display:flex; align-items:center; gap:6px;">
              <span>Instant Topic & Excerpt Helper</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); font-weight:600;">
              Focused on Page ${pageNum} of ${numPages} · ${window.escapeHtml((docTitle || '').slice(0, 30))}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-ghost" id="clear-topic-chat-btn" style="padding:4px 8px; font-size:11px; border-radius:6px; color:var(--text-dim);" title="Clear this topic history">
            🗑️ Clear
          </button>
          <button class="sheet-close-btn btn btn-ghost" style="width:32px; height:32px; border-radius:50%; font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Close">✕</button>
        </div>
      </div>

      <!-- Focused Selection Context Pill (If user selected text) -->
      ${activeSnippet ? `
        <div style="background:var(--accent-soft); border-left:3px solid var(--accent); padding:8px 12px; border-radius:8px; margin-bottom:10px; font-size:12px; line-height:1.5; color:var(--text); max-height:80px; overflow-y:auto;">
          <strong style="color:var(--accent); display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">📌 Target Excerpt:</strong>
          "${window.escapeHtml(activeSnippet.length > 200 ? activeSnippet.slice(0, 200) + '…' : activeSnippet)}"
        </div>
      ` : ''}

      <!-- Fast Action Chips -->
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:8px; margin-bottom:8px; scrollbar-width:none;">
        <button class="chip topic-quick-chip" data-query="Explain this exact excerpt in simple 3 bullet points with a real-life analogy." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          💡 Simplify This
        </button>
        <button class="chip topic-quick-chip" data-query="What are the 2 most important exam questions from this paragraph?" style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          🎯 Key Questions
        </button>
        <button class="chip topic-quick-chip" data-query="Give me a simple mnemonic or memory trick to remember this concept forever." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          🧠 Memory Trick
        </button>
        <button class="chip topic-quick-chip" data-query="Is there any formula, definition or rule mentioned here? Extract it clearly." style="padding:4px 10px; font-size:11px; font-weight:700; white-space:nowrap; background:var(--surface-2); border:1px solid var(--border);">
          📐 Key Formula/Def
        </button>
      </div>

      <!-- Messages Stream Box -->
      <div id="topic-messages-container" style="flex:1; overflow-y:auto; padding-right:4px; display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
        ${topicChatHistory.length === 0 ? `
          <div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px;">
            <div style="font-size:28px; margin-bottom:8px;">🎯</div>
            <strong>Focused Excerpt & Page Q&A</strong>
            <p style="margin:4px 0 0; font-size:12px;">Ask anything specifically about this highlighted text or page. Answers are fast, concise, and direct.</p>
          </div>
        ` : ''}
      </div>

      <!-- Input Bar -->
      <div style="display:flex; gap:8px; align-items:flex-end; border-top:1px solid var(--border); padding-top:10px;">
        <textarea id="topic-chat-input" rows="1" placeholder="Ask about this excerpt or page..." style="flex:1; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:10px 14px; font-size:13px; color:var(--text); resize:none; max-height:100px; line-height:1.4; outline:none; font-family:inherit;"></textarea>
        <button id="topic-chat-send" class="btn btn-primary" style="height:40px; width:44px; border-radius:12px; padding:0; display:flex; align-items:center; justify-content:center; background:#10b981; color:#fff; font-size:16px; flex-shrink:0;">
          ➤
        </button>
      </div>
    </div>
  `);

  const container = document.getElementById('topic-messages-container');
  const inputEl = document.getElementById('topic-chat-input');
  const sendBtn = document.getElementById('topic-chat-send');
  const clearBtn = document.getElementById('clear-topic-chat-btn');

  function renderTopicMessages() {
    if (!container) return;
    if (topicChatHistory.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px 16px; color:var(--text-dim); font-size:13px;">
          <div style="font-size:28px; margin-bottom:8px;">🎯</div>
          <strong>Focused Excerpt & Page Q&A</strong>
          <p style="margin:4px 0 0; font-size:12px;">Ask anything specifically about this highlighted text or page. Answers are fast, concise, and direct.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = topicChatHistory.map((m, idx) => `
      <div style="display:flex; flex-direction:column; align-items:${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom:4px;">
        <div style="max-width:88%; padding:10px 14px; border-radius:${m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px'}; background:${m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)'}; color:${m.role === 'user' ? '#fff' : 'var(--text)'}; font-size:13px; line-height:1.55; border:${m.role === 'user' ? 'none' : '1px solid var(--border)'}; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          ${m.role === 'assistant' ? (typeof window.renderMarkdown === 'function' ? window.renderMarkdown(m.text) : (typeof window.formatMarkdown === 'function' ? window.formatMarkdown(m.text) : window.escapeHtml(m.text))) : window.escapeHtml(m.text)}
        </div>
        <span style="font-size:10px; color:var(--text-dim); margin-top:2px; padding:0 4px;">
          ${m.role === 'user' ? 'You' : 'Topic AI'} · ${new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  }

  async function executeTopicQuery(qText) {
    if (!qText || !qText.trim()) return;
    const query = qText.trim();
    if (inputEl) inputEl.value = '';

    topicChatHistory.push({
      role: 'user',
      text: query,
      timestamp: Date.now()
    });

    topicChatHistory.push({
      role: 'assistant',
      text: '⏳ *Analyzing target text and synthesizing precise answer...*',
      timestamp: Date.now()
    });

    renderTopicMessages();
    if (sendBtn) sendBtn.disabled = true;

    try {
      const targetedPrompt = `You are the Instant Topic & Excerpt Tutor. Provide an accurate, ultra-clear, concise, and pedagogical explanation.

CONTEXT INFORMATION:
- Book / Document: "${docTitle}"
- Page Number: Page ${pageNum} of ${numPages}
${activeSnippet ? `- TARGET SELECTED EXCERPT:\n"""\n${activeSnippet}\n"""\n` : ''}
${pageText ? `- CURRENT PAGE CONTENT:\n"""\n${pageText.slice(0, 1500)}\n"""\n` : ''}

STUDENT QUESTION:
"${query}"

GUIDELINES:
1. Focus directly on the target excerpt and page context.
2. Keep the answer direct, crystal-clear, structured (bullet points / bold terms), and free from unnecessary filler.
3. If the user asked for a concept, give a 1-sentence definition, key breakdown, and an intuitive example.
4. Support clean Hinglish or English naturally according to the student's question.`;

      const aiReply = await callAI(targetedPrompt, "You are an expert precision topic tutor. Be concise, direct, and pedagogically crisp.");

      topicChatHistory[topicChatHistory.length - 1] = {
        role: 'assistant',
        text: aiReply || 'I could not generate a response for this excerpt.',
        timestamp: Date.now()
      };

      try {
        localStorage.setItem(`sayad_topic_chat_${topicId}`, JSON.stringify(topicChatHistory.slice(-20)));
      } catch (e) {}

    } catch (err) {
      topicChatHistory[topicChatHistory.length - 1] = {
        role: 'assistant',
        text: `⚠️ **Error**: Could not complete topic explanation. (${err.message})`,
        timestamp: Date.now()
      };
    }

    if (sendBtn) sendBtn.disabled = false;
    renderTopicMessages();
  }

  if (sendBtn) sendBtn.onclick = () => executeTopicQuery(inputEl.value);
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        executeTopicQuery(inputEl.value);
      }
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      topicChatHistory.length = 0;
      localStorage.removeItem(`sayad_topic_chat_${topicId}`);
      renderTopicMessages();
      window.toast('Topic chat cleared');
    };
  }

  // Fast quick chips trigger
  document.querySelectorAll('.topic-quick-chip').forEach(chip => {
    chip.onclick = () => {
      const q = chip.dataset.query;
      executeTopicQuery(q);
    };
  });

  renderTopicMessages();

  // If there was a prefilled question, fire it immediately
  if (prefillQuestion && prefillQuestion.trim()) {
    executeTopicQuery(prefillQuestion.trim());
  }
}
