// @ts-nocheck
// Voice input for the book chat

export let isVoiceListening = false;
export let speechRecognitionInstance = null;
export function isVoiceActive() { return isVoiceListening; }

export function startVoiceRecognition(onFinalTranscript) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.toast('Speech recognition is not supported in this browser tab.');
    return;
  }

  try {
    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.continuous = false;
    speechRecognitionInstance.interimResults = true;
    speechRecognitionInstance.lang = navigator.language || 'en-US';

    const waveformEl = document.getElementById('teacher-voice-waveform');
    const voiceStatusEl = document.getElementById('teacher-voice-status');
    const voiceBtn = document.getElementById('teacher-voice-toggle');

    if (waveformEl) waveformEl.style.display = 'flex';
    if (voiceBtn) {
      voiceBtn.style.background = 'var(--danger, #ef4444)';
      voiceBtn.style.color = '#fff';
    }
    isVoiceListening = true;

    speechRecognitionInstance.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      if (voiceStatusEl) voiceStatusEl.textContent = `🎙️ "${transcript}"`;
      if (event.results[0].isFinal) {
        stopVoiceRecognition();
        if (onFinalTranscript && transcript.trim()) {
          onFinalTranscript(transcript.trim());
        }
      }
    };

    speechRecognitionInstance.onerror = (err) => {
      console.warn('Speech error', err);
      stopVoiceRecognition();
      if (err.error === 'not-allowed') {
        window.toast('Microphone permission required for voice study.');
      } else {
        window.toast('Voice recognition ended');
      }
    };

    speechRecognitionInstance.onend = () => {
      stopVoiceRecognition();
    };

    speechRecognitionInstance.start();
    window.toast('Listening... Speak your question 🎙️');
  } catch(e) {
    console.error('Speech init error', e);
    stopVoiceRecognition();
    window.toast('Could not start voice recognition: ' + e.message);
  }
}

export function stopVoiceRecognition() {
  isVoiceListening = false;
  if (speechRecognitionInstance) {
    try { speechRecognitionInstance.stop(); } catch(e) {}
    speechRecognitionInstance = null;
  }
  const waveformEl = document.getElementById('teacher-voice-waveform');
  const voiceBtn = document.getElementById('teacher-voice-toggle');
  if (waveformEl) waveformEl.style.display = 'none';
  if (voiceBtn) {
    voiceBtn.style.background = 'var(--surface-2)';
    voiceBtn.style.color = 'var(--text)';
  }
}

// Global binds
