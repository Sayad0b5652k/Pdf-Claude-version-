// @ts-nocheck
import { stopAllTTSAudio, pickMicrosoftVoiceForText } from './ai/tts_read_aloud.js';

function getCustomGeminiKey() {
  try {
    return window.State?.customGeminiKey || localStorage.getItem('sayad_custom_gemini_key') || '';
  } catch {
    return '';
  }
}

export function buildWordsForSubtitles(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const words = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    words.push({ text: m[0], startChar: m.index, endChar: m.index + m[0].length });
  }
  return words;
}

export class LessonEngine {
  constructor(options = {}) {
    this.fileId = options.fileId || 'global';
    this.bookTitle = options.bookTitle || 'Study Document';
    this.pageNum = options.pageNum || 1;
    this.totalPages = options.totalPages || 1;
    this.chapterTitle = options.chapterTitle || `Page ${this.pageNum}`;
    this.mode = options.mode || 'classroom'; // 'classroom' | 'explainer'
    this.language = options.language || 'hinglish';
    this.speed = Number(options.speed || 1.0);
    this.sentences = Array.isArray(options.sentences) ? options.sentences : [];

    this.meta = options.meta || {
      chapterTitle: this.chapterTitle,
      topicSummary: '',
      totalSteps: 4,
    };
    this.steps = Array.isArray(options.steps) ? options.steps : [];
    this.currentStepIndex = Number(options.currentStepIndex || 0);
    this.completedSteps = new Set(Array.isArray(options.completedSteps) ? options.completedSteps : []);
    this.subtitleHistory = Array.isArray(options.subtitleHistory) ? options.subtitleHistory : [];
    this.doubts = Array.isArray(options.doubts) ? options.doubts : [];
    this.boardState = options.boardState || null;

    this.status = 'idle'; // 'idle' | 'loading' | 'playing' | 'paused' | 'doubt' | 'ended' | 'error'
    this.activeWords = [];
    this.activeWordIdx = -1;
    this.stepProgress = 0;

    this._audio = null;
    this._audioCache = new Map();
    this._playbackToken = 0;
    this._boundaries = [];
    this._durationMs = 0;
    this._raf = null;
    this._fallbackStartMs = 0;
    this._fallbackPausedAtMs = 0;
    this._fallbackUsingWebSpeech = false;
    this._abortCtrl = null;
    this._saveTimer = null;

    this.onStateChange = options.onStateChange || (() => {});
    this.onStepChange = options.onStepChange || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onSubtitleTick = options.onSubtitleTick || (() => {});
    this.onImageSuggested = options.onImageSuggested || (() => {});
  }

  get lessonId() {
    return `lesson_${this.fileId}_p${this.pageNum}`;
  }

  get activeStep() {
    return this.steps[this.currentStepIndex] || null;
  }

  async generateAndStart({ topicFocus = '', selectedText = '', autoPlay = true } = {}) {
    this.stopAudioOnly();
    this._abortCtrl?.abort();
    this._abortCtrl = new AbortController();

    this.status = 'loading';
    this.steps = [];
    this.currentStepIndex = 0;
    this.onStateChange(this.status);

    let stepOneStarted = false;

    try {
      const resp = await fetch('/api/ai/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this._abortCtrl.signal,
        body: JSON.stringify({
          numberedSentences: this.sentences,
          rawText: this.sentences.map((s) => s.text).join(' '),
          pageNum: this.pageNum,
          totalPages: this.totalPages,
          chapterTitle: this.chapterTitle,
          bookTitle: this.bookTitle,
          topicFocus,
          selectedText,
          language: this.language,
          mode: this.mode,
          stream: true,
          customKey: getCustomGeminiKey() || undefined,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${resp.status})`);
      }

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await resp.json();
        const objs = Array.isArray(json.objects) ? json.objects : [];
        for (const o of objs) {
          this._handleStreamObject(o, autoPlay && !stepOneStarted, () => { stepOneStarted = true; });
        }
      } else {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let sseBuf = '';
        let curEvent = 'message';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuf += decoder.decode(value, { stream: true });

          const blocks = sseBuf.split('\n\n');
          sseBuf = blocks.pop() || '';
          for (const blk of blocks) {
            const lines = blk.split('\n');
            let evName = curEvent;
            let dataStr = '';
            for (const ln of lines) {
              if (ln.startsWith('event:')) evName = ln.slice(6).trim();
              else if (ln.startsWith('data:')) dataStr += ln.slice(5).trim();
            }
            if (!dataStr) continue;
            try {
              const payload = JSON.parse(dataStr);
              if (evName === 'meta') {
                this._handleMeta(payload);
              } else if (evName === 'step') {
                this._handleStep(payload, autoPlay && !stepOneStarted, () => { stepOneStarted = true; });
              } else if (evName === 'error') {
                throw new Error(payload.message || 'Lesson stream failed');
              }
            } catch (e) {
              if (evName === 'error') throw e;
            }
          }
        }
      }

      if (!this.steps.length) {
        throw new Error('Could not generate lesson steps from this page.');
      }

      this.saveMemory();
      if (!stepOneStarted && autoPlay) {
        this.playStep(0);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('[LessonEngine] stream error:', err);
      this.status = 'error';
      this.onStateChange(this.status, err.message);
    }
  }

  _handleStreamObject(obj, startIfFirst, markStarted) {
    if (!obj) return;
    if (obj._kind === 'meta' || obj.topicSummary) this._handleMeta(obj);
    if (obj._kind === 'step' || typeof obj.spokenText === 'string') this._handleStep(obj, startIfFirst, markStarted);
  }

  _handleMeta(meta) {
    this.meta = { ...this.meta, ...meta };
    if (meta.chapterTitle) this.chapterTitle = meta.chapterTitle;
    this.onStateChange(this.status);
  }

  _handleStep(stepObj, startIfFirst, markStarted) {
    const idx = this.steps.length;
    const normalized = {
      ...stepObj,
      stepIndex: idx,
      title: stepObj.title || `Step ${idx + 1}`,
      spokenText: String(stepObj.spokenText || '').trim(),
      boardCues: Array.isArray(stepObj.boardCues) ? stepObj.boardCues : [],
      keyTerms: Array.isArray(stepObj.keyTerms) ? stepObj.keyTerms : [],
      sourceSentenceIds: Array.isArray(stepObj.sourceSentenceIds) ? stepObj.sourceSentenceIds : [],
      sourceQuote: String(stepObj.sourceQuote || '').trim(),
      sourceType: stepObj.sourceType || (stepObj.sourceQuote ? 'quote' : 'synthesis'),
    };
    this.steps.push(normalized);

    if (idx === 0 && startIfFirst) {
      markStarted();
      this.playStep(0);
    } else {
      // Prefetch Step 1 if currently on Step 0!
      if (idx === this.currentStepIndex + 1) {
        this.prefetchStepAudio(normalized);
      }
      this.onStateChange(this.status);
    }
  }

  async _fetchVisualBackdrop(query, stepIndex = 0) {
    try {
      const r = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: query }),
      });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.imageUrl) {
        this.onImageSuggested({ imageUrl: d.imageUrl, title: d.title || query, stepIndex });
      }
    } catch {}
  }

  _ttsVoiceFor(text) {
    let preferred = 'hi-IN-SwaraNeural';
    try {
      const saved = localStorage.getItem('sayad_tts_voice');
      if (saved) preferred = saved;
    } catch {}
    if (this.language === 'english') {
      preferred = preferred.startsWith('en-') ? preferred : 'en-IN-NeerjaNeural';
    }
    return pickMicrosoftVoiceForText(text, preferred);
  }

  prefetchStepAudio(step) {
    if (!step || !step.spokenText) return;
    const text = step.spokenText;
    const voice = this._ttsVoiceFor(text);
    const key = `${voice}|${text}`;
    if (this._audioCache.has(key)) return;

    const p = fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate: 1.0, pitch: 1.0 }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('TTS HTTP ' + r.status))))
      .catch(() => {
        this._audioCache.delete(key);
        return null;
      });
    this._audioCache.set(key, p);
    while (this._audioCache.size > 6) {
      this._audioCache.delete(this._audioCache.keys().next().value);
    }
  }

  async _loadAudioForText(text) {
    const voice = this._ttsVoiceFor(text);
    const key = `${voice}|${text}`;
    let p = this._audioCache.get(key);
    if (!p) {
      p = fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, rate: 1.0, pitch: 1.0 }),
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('TTS failed'))));
      this._audioCache.set(key, p);
    }
    return await p;
  }

  async playStep(idx) {
    if (idx < 0 || idx >= this.steps.length) return;
    this.stopAudioOnly();
    const token = ++this._playbackToken;

    this.currentStepIndex = idx;
    const step = this.steps[idx];
    this.activeWords = buildWordsForSubtitles(step.spokenText);
    this.activeWordIdx = -1;
    this.stepProgress = 0;
    this.status = 'playing';

    // Record subtitle history cleanly
    if (step.spokenText && !this.subtitleHistory.some((h) => h.stepIndex === idx && h.text === step.spokenText)) {
      this.subtitleHistory.push({
        id: `sub_${idx}_${Date.now()}`,
        stepIndex: idx,
        title: step.title,
        text: step.spokenText,
        ts: Date.now(),
      });
    }

    this.onStepChange(step, idx, false);
    this.onSubtitleTick(this.activeWords, -1, step.spokenText);
    this.onStateChange(this.status);

    // Stagger next-step prefetch so it doesn't open a simultaneous TTS connection
    if (this._prefetchTimer) clearTimeout(this._prefetchTimer);
    if (this.steps[idx + 1]) {
      this._prefetchTimer = setTimeout(() => {
        if (token === this._playbackToken && this.status === 'playing' && this.steps[idx + 1]) {
          this.prefetchStepAudio(this.steps[idx + 1]);
        }
      }, 2000);
    }
    this.saveMemory();

    await this._speakTextWithSync(step.spokenText, token, () => {
      if (token !== this._playbackToken) return;
      this.completedSteps.add(idx);
      this.stepProgress = 1;
      this.onProgress(1);
      this.saveMemory();

      if (this.currentStepIndex + 1 < this.steps.length && this.status === 'playing') {
        setTimeout(() => {
          if (token === this._playbackToken && this.status === 'playing') {
            this.playStep(this.currentStepIndex + 1);
          }
        }, 650);
      } else {
        this.status = 'ended';
        this.onStateChange(this.status);
      }
    });
  }

  async speakAdHocText(text, { onComplete } = {}) {
    this.stopAudioOnly();
    const token = ++this._playbackToken;
    this.activeWords = buildWordsForSubtitles(text);
    this.activeWordIdx = -1;
    this.onSubtitleTick(this.activeWords, -1, text);
    await this._speakTextWithSync(text, token, onComplete);
  }

  async _speakTextWithSync(text, token, onComplete) {
    if (!text) {
      onComplete?.();
      return;
    }

    try {
      const data = await this._loadAudioForText(text);
      if (token !== this._playbackToken) return;
      if (!data || !data.audioBase64) throw new Error('Empty neural audio');

      const src = `data:${data.mimeType || 'audio/mp3'};base64,${data.audioBase64}`;
      const audio = new Audio(src);
      audio.playbackRate = this.speed || 1.0;
      this._audio = audio;
      this._boundaries = Array.isArray(data.wordBoundaries) ? data.wordBoundaries : [];
      this._fallbackUsingWebSpeech = false;

      await new Promise((resolve) => {
        audio.onloadedmetadata = () => {
          this._durationMs = (audio.duration || 6) * 1000;
        };
        audio.onended = () => {
          this._stopRaf();
          if (this._audio === audio) this._audio = null;
          resolve();
        };
        audio.onerror = () => {
          this._stopRaf();
          if (this._audio === audio) this._audio = null;
          resolve();
        };
        audio.play()
          .then(() => {
            if (token !== this._playbackToken) {
              audio.pause();
              resolve();
              return;
            }
            this._startAudioTicker(audio, token);
          })
          .catch(() => {
            // Autoplay blocked -> cleanly fall back to paused ready state
            this.status = 'paused';
            this.stepProgress = 1;
            this.onProgress(1);
            this.onStateChange(this.status);
            resolve();
          });
      });

      if (token === this._playbackToken && this.status !== 'paused' && this.status !== 'doubt') {
        onComplete?.();
      }
    } catch {
      // Offline / TTS unavailable fallback: Web Speech API + linear cadence
      if (token !== this._playbackToken) return;
      this._speakWithWebSpeechFallback(text, token, onComplete);
    }
  }

  _speakWithWebSpeechFallback(text, token, onComplete) {
    this._fallbackUsingWebSpeech = true;
    const words = this.activeWords;
    const estDurationMs = Math.max(2500, (words.length / (2.5 * this.speed)) * 1000);
    this._durationMs = estDurationMs;
    this._fallbackStartMs = performance.now();
    this._fallbackPausedAtMs = 0;

    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = this.speed;
        u.lang = this.language === 'hindi' ? 'hi-IN' : 'en-IN';
        u.onend = () => {
          this._stopRaf();
          if (token === this._playbackToken && this.status === 'playing') onComplete?.();
        };
        u.onerror = () => {
          this._stopRaf();
          if (token === this._playbackToken && this.status === 'playing') onComplete?.();
        };
        window.speechSynthesis.speak(u);
      } catch {}
    }

    const tick = (now) => {
      if (token !== this._playbackToken || this.status !== 'playing') return;
      const elapsed = now - this._fallbackStartMs;
      const prog = Math.min(1, elapsed / estDurationMs);
      this.stepProgress = prog;
      this.onProgress(prog);
      const wIdx = Math.min(words.length - 1, Math.floor(prog * words.length));
      if (wIdx !== this.activeWordIdx) {
        this.activeWordIdx = wIdx;
        this.onSubtitleTick(words, wIdx, text);
      }
      if (prog < 1) {
        this._raf = requestAnimationFrame(tick);
      } else if (!window.speechSynthesis) {
        onComplete?.();
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _startAudioTicker(audio, token) {
    this._stopRaf();
    const boundaries = this._boundaries;
    const words = this.activeWords;

    const tick = () => {
      if (token !== this._playbackToken || this._audio !== audio) return;
      if (!audio.paused && !audio.ended) {
        const curMs = audio.currentTime * 1000;
        const durMs = (audio.duration && isFinite(audio.duration) ? audio.duration * 1000 : this._durationMs) || 6000;
        const prog = Math.max(0, Math.min(1, curMs / durMs));
        this.stepProgress = prog;
        this.onProgress(prog);

        let wIdx = -1;
        if (boundaries.length) {
          for (let i = 0; i < boundaries.length; i++) {
            if (curMs >= boundaries[i].offsetMs) wIdx = Math.min(words.length - 1, i);
            else break;
          }
        } else if (words.length) {
          wIdx = Math.min(words.length - 1, Math.floor(prog * words.length));
        }

        if (wIdx !== this.activeWordIdx) {
          this.activeWordIdx = wIdx;
          this.onSubtitleTick(words, wIdx, this.activeStep?.spokenText || '');
        }
      }
      if (!audio.ended) {
        this._raf = requestAnimationFrame(tick);
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopRaf() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  stopAudioOnly() {
    this._playbackToken++;
    if (this._prefetchTimer) {
      clearTimeout(this._prefetchTimer);
      this._prefetchTimer = null;
    }
    this._stopRaf();
    stopAllTTSAudio();
    if (this._audio) {
      try {
        this._audio.pause();
        this._audio.src = '';
      } catch {}
      this._audio = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }

  pause(reasonStatus = 'paused') {
    if (this.status !== 'playing') {
      this.status = reasonStatus;
      this.onStateChange(this.status);
      return;
    }
    this.status = reasonStatus;
    if (this._audio && !this._audio.paused) {
      try { this._audio.pause(); } catch {}
    }
    if (this._fallbackUsingWebSpeech && window.speechSynthesis) {
      try { window.speechSynthesis.pause(); } catch {}
      this._fallbackPausedAtMs = performance.now() - this._fallbackStartMs;
    }
    this._stopRaf();
    this.onStateChange(this.status);
    this.saveMemory();
  }

  resume() {
    if (this.status === 'playing') return;
    if (this.status === 'ended') {
      this.playStep(0);
      return;
    }
    this.status = 'playing';
    this.onStateChange(this.status);
    if (this._audio && this._audio.src && !this._audio.ended) {
      this._audio.playbackRate = this.speed || 1.0;
      this._audio.play().catch(() => {});
      this._startAudioTicker(this._audio, this._playbackToken);
      return;
    }
    if (this._fallbackUsingWebSpeech && window.speechSynthesis) {
      try { window.speechSynthesis.resume(); } catch {}
      this._fallbackStartMs = performance.now() - this._fallbackPausedAtMs;
      return;
    }
    if (this.activeStep) {
      this.playStep(this.currentStepIndex);
    }
  }

  togglePlayPause() {
    if (this.status === 'playing') this.pause();
    else this.resume();
  }

  setSpeed(newSpeed) {
    this.speed = Math.max(0.75, Math.min(1.75, Number(newSpeed) || 1.0));
    if (this._audio) {
      try { this._audio.playbackRate = this.speed; } catch {}
    }
    this.onStateChange(this.status);
  }

  prevStep() {
    if (!this.steps.length) return;
    const target = Math.max(0, this.currentStepIndex - 1);
    this.playStep(target);
  }

  nextStep() {
    if (!this.steps.length) return;
    if (this.currentStepIndex + 1 < this.steps.length) {
      this.playStep(this.currentStepIndex + 1);
    } else {
      window.toast?.('Lesson complete! Tap Replay or open Next Page.');
    }
  }

  replayCurrentStep() {
    if (this.activeStep) this.playStep(this.currentStepIndex);
  }

  async simplifyCurrentStep() {
    const cur = this.activeStep;
    if (!cur) return null;
    this.pause('loading');
    try {
      const resp = await fetch('/api/ai/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numberedSentences: this.sentences,
          rawText: this.sentences.map((s) => s.text).join(' '),
          pageNum: this.pageNum,
          totalPages: this.totalPages,
          chapterTitle: this.chapterTitle,
          bookTitle: this.bookTitle,
          language: this.language,
          mode: this.mode,
          simplifyStep: cur,
          stream: false,
          customKey: getCustomGeminiKey() || undefined,
        }),
      });
      if (!resp.ok) throw new Error('Could not simplify step');
      const data = await resp.json();
      const simplified = data?.objects?.[0];
      if (simplified && simplified.spokenText) {
        this.steps[this.currentStepIndex] = {
          ...cur,
          ...simplified,
          stepIndex: this.currentStepIndex,
          _boardPageId: cur._boardPageId,
        };
        await this.playStep(this.currentStepIndex);
        return this.steps[this.currentStepIndex];
      }
    } catch (e) {
      window.toast?.('Could not simplify right now.');
      this.status = 'paused';
      this.onStateChange(this.status);
    }
    return null;
  }

  async askDoubt(question, boardSummary = '') {
    this.pause('doubt');
    const q = String(question || '').trim();
    if (!q) return null;

    const doubtEntry = {
      id: `d_${Date.now().toString(36)}`,
      question: q,
      answerSpoken: '',
      answerSummary: '',
      sourceQuote: '',
      answered: false,
      stepIndex: this.currentStepIndex,
      ts: Date.now(),
    };
    this.doubts.push(doubtEntry);
    this.saveMemory();

    const resp = await fetch('/api/ai/lesson-doubt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        language: this.language,
        activeStep: this.activeStep,
        boardSummary,
        numberedSentences: this.sentences,
        pageNum: this.pageNum,
        chapterTitle: this.chapterTitle,
        bookTitle: this.bookTitle,
        customKey: getCustomGeminiKey() || undefined,
      }),
    });
    if (!resp.ok) throw new Error('Doubt response failed');
    const data = await resp.json();
    const d = data?.doubt || {};
    doubtEntry.answerSpoken = d.answerSpoken || '';
    doubtEntry.answerSummary = d.answerSummary || d.answerSpoken || '';
    doubtEntry.sourceQuote = d.sourceQuote || '';
    doubtEntry.sourceSentenceIds = d.sourceSentenceIds || [];
    doubtEntry.sourceType = d.sourceType || (d.sourceQuote ? 'quote' : 'synthesis');
    doubtEntry.extraBoardCues = Array.isArray(d.extraBoardCues) ? d.extraBoardCues : [];
    doubtEntry.needsNewBoardPage = Boolean(d.needsNewBoardPage);
    doubtEntry.answered = true;
    this.saveMemory();
    return doubtEntry;
  }

  saveMemory(extraBoardState = null) {
    if (extraBoardState) this.boardState = extraBoardState;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      try {
        if (!window.DB || typeof window.DB.putLesson !== 'function') return;
        await window.DB.putLesson({
          id: this.lessonId,
          fileId: this.fileId,
          bookTitle: this.bookTitle,
          pageNum: this.pageNum,
          totalPages: this.totalPages,
          chapterTitle: this.chapterTitle,
          language: this.language,
          speed: this.speed,
          meta: this.meta,
          steps: this.steps,
          currentStepIndex: this.currentStepIndex,
          completedSteps: [...this.completedSteps],
          subtitleHistory: this.subtitleHistory.slice(-40),
          doubts: this.doubts.slice(-25),
          boardState: this.boardState,
        });
      } catch (e) {}
    }, 350);
  }

  destroy() {
    this._abortCtrl?.abort();
    this.stopAudioOnly();
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }
}

export async function loadSavedLesson(fileId, pageNum) {
  try {
    if (!window.DB || typeof window.DB.getLesson !== 'function') return null;
    const saved = await window.DB.getLesson(`lesson_${fileId}_p${pageNum}`);
    if (saved && Array.isArray(saved.steps) && saved.steps.length) return saved;
  } catch {}
  return null;
}
