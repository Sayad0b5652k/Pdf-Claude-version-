// @ts-nocheck
export * from "./ai/study_core.js";
export * from "./ai/dictionary.js";
export * from "./ai/quiz_flashcards_translate.js";
export * from "./ai/tts_read_aloud.js";
export * from "./ai/topic_chat.js";

import {
  AI_TOOLS,
  callAI,
  callServerGemini,
  callGeminiFast,
  callGroqFast,
  callGroq70b,
  callGemini,
  callGroq,
  runAIToolObj,
  runExecutiveSummaryModal,
  runMasterExplanationModal,
  extractRangeText,
} from "./ai/study_core.js";

import { runDictionaryLookup } from "./ai/dictionary.js";

import {
  runMCQGeneratorModal,
  runInteractiveFlashcardsModal,
  translatePassageAI,
  runTranslateToolModal,
} from "./ai/quiz_flashcards_translate.js";

import {
  runTTS,
  getCurrentPageText,
  skipTTSSentence,
  clearTTSHighlights,
  runPageReadAloud,
  preparePageTTSData,
  pauseTTS,
  playTTSFrom,
  pickMicrosoftVoiceForText,
  ttsLangOf,
  ttsWordMs,
  getTTSSettings,
  saveTTSSettings,
  openVoiceSettingsModal,
  toggleReadAloud,
  openHandsFreeReadAloud,
  renderFloatingTTSCapsule,
  hideFloatingTTSCapsule,
  showFloatingTTSCapsule,
  getElevenLabsApiKey,
  saveElevenLabsApiKey,
  ELEVENLABS_DEFAULT_VOICES,
  getAllElevenLabsVoices,
  fetchElevenLabsVoices,
  previewElevenVoice,
  speakWithElevenLabs,
  stopElevenAudio,
} from "./ai/tts_read_aloud.js";

import { openTopicAIChat } from "./ai/topic_chat.js";

// Bind to window for global availability
window.AI_TOOLS = AI_TOOLS;
window.callAI = callAI;
window.callServerGemini = callServerGemini;
window.callGeminiFast = callGeminiFast;
window.callGroqFast = callGroqFast;
window.callGroq70b = callGroq70b;
window.runAIToolObj = runAIToolObj;
window.runDictionaryLookup = runDictionaryLookup;
window.callGemini = callGemini;
window.callGroq = callGroq;
window.extractRangeText = extractRangeText;
window.runMCQGeneratorModal = runMCQGeneratorModal;
window.runInteractiveFlashcardsModal = runInteractiveFlashcardsModal;
window.runTranslateToolModal = runTranslateToolModal;
window.translatePassageAI = translatePassageAI;
window.runTTS = runTTS;
window.getCurrentPageText = getCurrentPageText;
window.skipTTSSentence = skipTTSSentence;
window.clearTTSHighlights = clearTTSHighlights;
window.runPageReadAloud = runPageReadAloud;
window.preparePageTTSData = preparePageTTSData;
window.pauseTTS = pauseTTS;
window.playTTSFrom = playTTSFrom;
window.pickMicrosoftVoiceForText = pickMicrosoftVoiceForText;
window.ttsLangOf = ttsLangOf;
window.ttsWordMs = ttsWordMs;
window.getTTSSettings = getTTSSettings;
window.saveTTSSettings = saveTTSSettings;
window.openVoiceSettingsModal = openVoiceSettingsModal;
window.toggleReadAloud = toggleReadAloud;
window.openHandsFreeReadAloud = openHandsFreeReadAloud;
window.renderFloatingTTSCapsule = renderFloatingTTSCapsule;
window.hideFloatingTTSCapsule = hideFloatingTTSCapsule;
window.showFloatingTTSCapsule = showFloatingTTSCapsule;
window.getElevenLabsApiKey = getElevenLabsApiKey;
window.saveElevenLabsApiKey = saveElevenLabsApiKey;
window.ELEVENLABS_DEFAULT_VOICES = ELEVENLABS_DEFAULT_VOICES;
window.getAllElevenLabsVoices = getAllElevenLabsVoices;
window.fetchElevenLabsVoices = fetchElevenLabsVoices;
window.previewElevenVoice = previewElevenVoice;
window.speakWithElevenLabs = speakWithElevenLabs;
window.stopElevenAudio = stopElevenAudio;
window.openTopicAIChat = openTopicAIChat;
window.runExecutiveSummaryModal = runExecutiveSummaryModal;
window.runMasterExplanationModal = runMasterExplanationModal;
