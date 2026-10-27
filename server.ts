import dotenv from "dotenv";
dotenv.config();

import express from "express";
import compression from "compression";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { MICROSOFT_NEURAL_VOICES, synthesizeMicrosoftTTS } from "./server/microsoft_tts.ts";

// -------------------------------------------------------------
// DYNAMIC MULTI-KEY GEMINI POOL MANAGER
// -------------------------------------------------------------

interface KeySlot {
  key: string;
  tag: string;
  cooldownUntil: number;
}

class GeminiKeyPool {
  private clientCache = new Map<string, GoogleGenAI>();
  private studyKeys: KeySlot[] = [];
  private chatKeys: KeySlot[] = [];
  private backupKeys: KeySlot[] = [];
  private allKeys: KeySlot[] = [];
  private studyRoundRobinIdx = 0;
  private chatRoundRobinIdx = 0;
  private generalRoundRobinIdx = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    // Study Keys (2 dedicated)
    const rawStudy1 = (process.env.GEMINI_STUDY_KEY_1 || "").trim();
    const rawStudy2 = (process.env.GEMINI_STUDY_KEY_2 || "").trim();

    // Book AI Chat Keys (5 dedicated)
    const rawChat1 = (process.env.GEMINI_CHAT_KEY_1 || "").trim();
    const rawChat2 = (process.env.GEMINI_CHAT_KEY_2 || "").trim();
    const rawChat3 = (process.env.GEMINI_CHAT_KEY_3 || "").trim();
    const rawChat4 = (process.env.GEMINI_CHAT_KEY_4 || "").trim();
    const rawChat5 = (process.env.GEMINI_CHAT_KEY_5 || "").trim();

    // Backups & General
    const rawBackup1 = (process.env.GEMINI_BACKUP_KEY_1 || "").trim();
    const rawBackupList = (process.env.GEMINI_BACKUP_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);
    const rawDefault = (process.env.GEMINI_API_KEY || "").trim();

    // Numbered keys support (e.g. GEMINI_KEY_1 to GEMINI_KEY_10)
    const rawKey1 = (process.env.GEMINI_KEY_1 || "").trim();
    const rawKey2 = (process.env.GEMINI_KEY_2 || "").trim();
    const rawKey3 = (process.env.GEMINI_KEY_3 || "").trim();
    const rawKey4 = (process.env.GEMINI_KEY_4 || "").trim();
    const rawKey5 = (process.env.GEMINI_KEY_5 || "").trim();
    const rawKey6 = (process.env.GEMINI_KEY_6 || "").trim();
    const rawKey7 = (process.env.GEMINI_KEY_7 || "").trim();
    const rawKey8 = (process.env.GEMINI_KEY_8 || "").trim();
    const rawKey9 = (process.env.GEMINI_KEY_9 || "").trim();
    const rawKey10 = (process.env.GEMINI_KEY_10 || "").trim();

    const seen = new Set<string>();
    const studySlots: KeySlot[] = [];
    const chatSlots: KeySlot[] = [];
    const backupSlots: KeySlot[] = [];
    const allSlots: KeySlot[] = [];

    const addKey = (key: string, tag: string, pool: 'study' | 'chat' | 'backup' | 'all') => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      const slot: KeySlot = { key, tag, cooldownUntil: 0 };
      if (pool === 'study' || pool === 'all') studySlots.push(slot);
      if (pool === 'chat' || pool === 'all') chatSlots.push(slot);
      if (pool === 'backup' || pool === 'all') backupSlots.push(slot);
      allSlots.push(slot);
    };

    // 1. Dedicated Study Tools Keys (2)
    if (rawStudy1) addKey(rawStudy1, "study-key-1", "study");
    if (rawStudy2) addKey(rawStudy2, "study-key-2", "study");

    // 2. Dedicated Book AI Chat Keys (5)
    if (rawChat1) addKey(rawChat1, "chat-key-1", "chat");
    if (rawChat2) addKey(rawChat2, "chat-key-2", "chat");
    if (rawChat3) addKey(rawChat3, "chat-key-3", "chat");
    if (rawChat4) addKey(rawChat4, "chat-key-4", "chat");
    if (rawChat5) addKey(rawChat5, "chat-key-5", "chat");

    // 3. Backup Key
    if (rawBackup1) addKey(rawBackup1, "backup-key-1", "backup");
    rawBackupList.forEach((k, idx) => addKey(k, `backup-key-${idx + 2}`, "backup"));

    // 4. Numbered keys mapping (if provided as GEMINI_KEY_1..10)
    if (rawKey1) addKey(rawKey1, "key-1 (study)", "study");
    if (rawKey2) addKey(rawKey2, "key-2 (study)", "study");
    if (rawKey3) addKey(rawKey3, "key-3 (chat)", "chat");
    if (rawKey4) addKey(rawKey4, "key-4 (chat)", "chat");
    if (rawKey5) addKey(rawKey5, "key-5 (chat)", "chat");
    if (rawKey6) addKey(rawKey6, "key-6 (chat)", "chat");
    if (rawKey7) addKey(rawKey7, "key-7 (chat)", "chat");
    if (rawKey8) addKey(rawKey8, "key-8 (backup)", "backup");
    if (rawKey9) addKey(rawKey9, "key-9 (backup)", "backup");
    if (rawKey10) addKey(rawKey10, "key-10 (backup)", "backup");

    // 5. Default Gemini Key (universal fallback for all pools)
    if (rawDefault) addKey(rawDefault, "primary-default-key", "all");

    this.studyKeys = studySlots;
    this.chatKeys = chatSlots;
    this.backupKeys = backupSlots;
    this.allKeys = allSlots;

    console.log(`[GeminiKeyPool] Initialized: ${this.studyKeys.length} Study Key(s), ${this.chatKeys.length} Book Chat Key(s), ${this.backupKeys.length} Backup Key(s), ${this.allKeys.length} Total Unique Key(s).`);
  }

  public getClient(key: string): GoogleGenAI {
    if (!this.clientCache.has(key)) {
      this.clientCache.set(key, new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      }));
    }
    return this.clientCache.get(key)!;
  }

  public markCooldown(key: string, ms = 45000) {
    const slot = this.allKeys.find(s => s.key === key);
    if (slot) {
      slot.cooldownUntil = Date.now() + ms;
      console.warn(`[GeminiKeyPool] Marked key [${slot.tag}] on cooldown for ${ms / 1000}s`);
    }
  }

  public getOrderedKeysForTool(category: 'study' | 'chat' | 'general'): KeySlot[] {
    const now = Date.now();
    let primaryPool: KeySlot[] = [];
    let fallbackPool: KeySlot[] = [];

    if (category === 'chat') {
      primaryPool = [...this.chatKeys];
      fallbackPool = [...this.backupKeys, ...this.studyKeys, ...this.allKeys];
    } else if (category === 'study') {
      primaryPool = [...this.studyKeys];
      fallbackPool = [...this.backupKeys, ...this.chatKeys, ...this.allKeys];
    } else {
      primaryPool = [...this.allKeys];
      fallbackPool = [...this.backupKeys];
    }

    // Deduplicate within pools
    const dedup = (list: KeySlot[]) => {
      const u: KeySlot[] = [];
      const keysSeen = new Set<string>();
      list.forEach(s => {
        if (!keysSeen.has(s.key)) {
          keysSeen.add(s.key);
          u.push(s);
        }
      });
      return u;
    };

    primaryPool = dedup(primaryPool);
    fallbackPool = dedup(fallbackPool.filter(s => !primaryPool.some(p => p.key === s.key)));

    // Rotate primary pool for load balancing
    if (primaryPool.length > 1) {
      if (category === 'chat') {
        const offset = this.chatRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      } else if (category === 'study') {
        const offset = this.studyRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      } else {
        const offset = this.generalRoundRobinIdx++ % primaryPool.length;
        primaryPool = [...primaryPool.slice(offset), ...primaryPool.slice(0, offset)];
      }
    }

    const fullSequence = [...primaryPool, ...fallbackPool];
    // Put healthy keys first, cooled-down keys last
    return fullSequence.sort((a, b) => {
      const aReady = a.cooldownUntil <= now ? 0 : 1;
      const bReady = b.cooldownUntil <= now ? 0 : 1;
      return aReady - bReady;
    });
  }

  public hasAnyKey(): boolean {
    return this.allKeys.length > 0;
  }

  public getStatus() {
    return {
      totalKeys: this.allKeys.length,
      studyKeysCount: this.studyKeys.length,
      chatKeysCount: this.chatKeys.length,
      backupKeysCount: this.backupKeys.length,
      slots: this.allKeys.map(s => ({
        tag: s.tag,
        isHealthy: s.cooldownUntil <= Date.now(),
        cooldownRemainingSec: Math.max(0, Math.ceil((s.cooldownUntil - Date.now()) / 1000))
      }))
    };
  }
}

const keyPool = new GeminiKeyPool();

// Track model-level temporary spikes (e.g. 503 High Demand / UNAVAILABLE)
const modelOverloadCooldowns = new Map<string, number>();

function isModelOverloaded(modelName: string): boolean {
  const until = modelOverloadCooldowns.get(modelName) || 0;
  return Date.now() < until;
}

function markModelOverloaded(modelName: string, durationMs = 120000) {
  modelOverloadCooldowns.set(modelName, Date.now() + durationMs);
  console.warn(`[GeminiKeyPool] Model [${modelName}] marked on temporary high-demand cooldown for ${durationMs / 1000}s`);
}

// Execute Gemini prompt across the key pool with powerful models
async function executeWithGeminiPool(
  category: 'study' | 'chat' | 'general',
  prompt: string,
  options: {
    systemInstruction?: string;
    targetModel?: string;
    temperature?: number;
    responseMimeType?: string;
    customKey?: string;
    tools?: any[];
  } = {}
): Promise<{ text: string; model: string; keyTag: string } | null> {
  // If user provided custom key (BYOK), prioritize it as top slot
  let slots = keyPool.getOrderedKeysForTool(category);
  if (options.customKey && typeof options.customKey === 'string' && options.customKey.trim().length > 10) {
    const customSlot: KeySlot = {
      key: options.customKey.trim(),
      tag: 'User Personal Custom Key',
      cooldownUntil: 0,
    };
    slots = [customSlot, ...slots];
  }
  if (!slots.length) return null;

  // Ultra-resilient, high-availability model queue using active canonical models:
  // 1. gemini-3.1-flash-lite (fast, low latency, active canonical model)
  // 2. gemini-3.8-flash (standard text model from gemini-api skill)
  // 3. gemini-flash-latest (canonical alias for gemini flash)
  // 4. gemini-3.1-pro-preview (high capability reasoning model)
  let requested = options.targetModel;
  if (!requested || requested.includes("2.5") || requested.includes("2.0") || requested.includes("1.5")) {
    requested = "gemini-3.1-flash-lite";
  }

  const candidateModels = [
    requested,
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-pro-preview",
  ];

  const healthyModels: string[] = [];
  const overloadedModels: string[] = [];

  for (const m of candidateModels) {
    if (!m) continue;
    if (m.includes("1.5") || m.includes("2.0") || m.includes("2.5")) continue;
    if (isModelOverloaded(m)) {
      overloadedModels.push(m);
    } else {
      healthyModels.push(m);
    }
  }

  const modelQueue = Array.from(new Set([...healthyModels, ...overloadedModels]));

  const config: any = {
    temperature: typeof options.temperature === "number" ? options.temperature : 0.22,
    maxOutputTokens: 8192,
  };
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }
  if (options.responseMimeType) {
    config.responseMimeType = options.responseMimeType;
  }
  if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
    config.tools = options.tools;
  }

  // Iterate over healthy slots
  for (const slot of slots) {
    const ai = keyPool.getClient(slot.key);
    let anyModelSucceededOnSlot = false;

    for (const modelName of modelQueue) {
      try {
        const timeoutMs = 30000;
        const timeoutPromise = new Promise<{ text?: string; isTimeout: boolean }>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms for ${modelName}`)), timeoutMs)
        );

        const generatePromise = (async () => {
          try {
            const resp = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config,
            });
            return { text: resp.text, isTimeout: false };
          } catch (modelCallErr: any) {
            // If tool call fails on a specific model, retry immediately without tools
            if (config.tools) {
              try {
                const cleanCfg = { ...config };
                delete cleanCfg.tools;
                const resp2 = await ai.models.generateContent({
                  model: modelName,
                  contents: prompt,
                  config: cleanCfg,
                });
                return { text: resp2.text, isTimeout: false };
              } catch (retryErr) {
                throw modelCallErr;
              }
            }
            throw modelCallErr;
          }
        })();

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const text = response.text || "";
        if (text && text.trim()) {
          anyModelSucceededOnSlot = true;
          return {
            text: text.trim(),
            model: modelName,
            keyTag: slot.tag,
          };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        
        // If model is deprecated / 404 (e.g. no longer available), silently continue to next active model in queue
        if (msg.includes("404") || msg.includes("no longer available") || msg.includes("not found")) {
          continue;
        }

        // High demand / temporary overload (503 / 500 / 504 / UNAVAILABLE / overloaded) -> model-specific spike:
        if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("overloaded") || msg.includes("500") || msg.includes("504")) {
          markModelOverloaded(modelName, 60000);
          console.info(`[Gemini Failover] Model [${modelName}] experiencing temporary load on slot [${slot.tag}], switching to next candidate.`);
          continue;
        }

        // If the key itself is explicitly invalid or credential bad:
        if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid") || msg.includes("CREDENTIAL_MISCONFIGURED")) {
          keyPool.markCooldown(slot.key, 120000);
          break; // Switch to next key
        }
        
        // Quota exhaustion (429 / RESOURCE_EXHAUSTED):
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          console.info(`[Gemini Quota] Slot [${slot.tag}] model [${modelName}] quota reached, trying next model.`);
          continue;
        }

        console.info(`[Gemini Attempt Notice] Key: [${slot.tag}] Model: [${modelName}] Note: ${msg.slice(0, 80)}`);
        continue;
      }
    }

    // If all models in the queue failed on this slot, place key on short cooldown and try next key
    if (!anyModelSucceededOnSlot) {
      keyPool.markCooldown(slot.key, 30000);
    }
  }
  return null;
}

// Real-Time Streaming Gemini Execution across pool with SSE
async function executeWithGeminiPoolStream(
  category: 'study' | 'chat' | 'general',
  prompt: string,
  onChunk: (chunkText: string) => void,
  options: {
    systemInstruction?: string;
    targetModel?: string;
    temperature?: number;
    customKey?: string;
  } = {}
): Promise<{ text: string; model: string; keyTag: string } | null> {
  let slots = keyPool.getOrderedKeysForTool(category);
  if (options.customKey && typeof options.customKey === 'string' && options.customKey.trim().length > 10) {
    const customSlot: KeySlot = {
      key: options.customKey.trim(),
      tag: 'User Personal Custom Key',
      cooldownUntil: 0,
    };
    slots = [customSlot, ...slots];
  }
  if (!slots.length) return null;

  let requested = options.targetModel;
  if (!requested || requested.includes("2.5") || requested.includes("2.0") || requested.includes("1.5")) {
    requested = "gemini-3.1-flash-lite";
  }

  const candidateModels = [
    requested,
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-pro-preview",
  ];

  const healthyModels: string[] = [];
  const overloadedModels: string[] = [];

  for (const m of candidateModels) {
    if (!m) continue;
    if (m.includes("1.5") || m.includes("2.0") || m.includes("2.5")) continue;
    if (isModelOverloaded(m)) {
      overloadedModels.push(m);
    } else {
      healthyModels.push(m);
    }
  }

  const modelQueue = Array.from(new Set([...healthyModels, ...overloadedModels]));

  const config: any = {
    temperature: typeof options.temperature === "number" ? options.temperature : 0.22,
    maxOutputTokens: 8192,
  };
  if (options.systemInstruction) {
    config.systemInstruction = options.systemInstruction;
  }

  for (const slot of slots) {
    const ai = keyPool.getClient(slot.key);
    let anyModelSucceededOnSlot = false;

    for (const modelName of modelQueue) {
      try {
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config,
        });

        let accumulated = "";
        for await (const chunk of stream) {
          const piece = chunk.text || "";
          if (piece) {
            accumulated += piece;
            onChunk(piece);
          }
        }

        if (accumulated && accumulated.trim()) {
          anyModelSucceededOnSlot = true;
          return {
            text: accumulated.trim(),
            model: modelName,
            keyTag: slot.tag,
          };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("404") || msg.includes("no longer available") || msg.includes("not found")) {
          continue;
        }

        // High demand / temporary overload (503 / 500 / 504 / UNAVAILABLE / overloaded) -> model-specific spike:
        if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("overloaded") || msg.includes("500") || msg.includes("504")) {
          markModelOverloaded(modelName, 60000);
          console.info(`[Gemini Stream Failover] Model [${modelName}] experiencing temporary load on slot [${slot.tag}], switching to next candidate.`);
          continue;
        }

        if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid") || msg.includes("CREDENTIAL_MISCONFIGURED")) {
          keyPool.markCooldown(slot.key, 120000);
          break;
        }

        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
          console.info(`[Gemini Stream Quota] Slot [${slot.tag}] model [${modelName}] quota reached, trying next model.`);
          continue;
        }

        console.info(`[Gemini Stream Attempt Notice] Key: [${slot.tag}] Model: [${modelName}] Note: ${msg.slice(0, 80)}`);
        continue;
      }
    }

    if (!anyModelSucceededOnSlot) {
      keyPool.markCooldown(slot.key, 30000);
    }
  }
  return null;
}

async function executeWithGroq(prompt: string, systemInstruction?: string, temperature = 0.3): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const models = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"];
  for (const model of models) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt }
          ],
          temperature,
          max_tokens: 3500
        }),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && text.trim()) return text.trim();
      }
    } catch (err: any) {
      console.warn(`[Groq Failover] Model ${model} error:`, err?.message);
    }
  }
  return null;
}

async function executeWithOpenRouter(
  prompt: string,
  systemInstruction?: string,
  temperature = 0.3,
  preferredModel?: string
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI;
  if (!apiKey) return null;

  const models = Array.from(new Set([
    preferredModel,
    "deepseek/deepseek-chat",
    "meta-llama/llama-3.3-70b-instruct",
    "qwen/qwen-2.5-72b-instruct",
    "mistralai/mistral-small-24b-instruct-2501:free"
  ].filter(Boolean) as string[]));

  for (const model of models) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aistudio.google.com",
          "X-Title": "SAYAD Super Tutor"
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt }
          ],
          temperature,
        }),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && text.trim()) return { text: text.trim(), model };
      }
    } catch (err: any) {
      console.warn(`[OpenRouter Failover] Model ${model} error:`, err?.message);
    }
  }
  return null;
}

function detectUserLanguage(text: string): "Hinglish" | "Hindi" | "English" {
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  const hinglishWords = /\b(?:kya|kyu|kyun|kaise|kaisa|kaisi|hai|hain|hoon|tha|thi|hoga|hogi|hoge|raha|rahe|rahi|aur|bhi|toh|ye|yeh|wo|woh|isko|usko|unka|unke|unki|inka|inke|apna|apni|meri|mera|mere|mujhe|tum|tumhe|aap|aapko|samjha|samjhao|batao|karo|karna|kar|krne|nahi|nhi|matlab|bhai|yaar|dekhna|dikhao|kripya|chahiye|mein|bataiye|kuch|sab|wale|wali|karein|samjho|theek|thik|accha|zariye)\b/i;
  if (hinglishWords.test(text)) return "Hinglish";
  return "English";
}

function isGreeting(q: string, hasHistory = false): boolean {
  if (!q) return false;
  const clean = q.trim().toLowerCase().replace(/[!?.,;:~`"']+/g, " ").replace(/\s+/g, " ").trim();
  // If there is ongoing chat history, follow-up queries like "aur batao", "aur detail me", "aur", "fir kya hua", "iske baad" are dialogue continuations, NOT greetings!
  if (hasHistory && /^(?:aur\s+batao|aur\s+detail\s+me|aur\s+bataiye|aur\s+bhai|aur\s+kuch|fir\s+kya\s+hua|iske\s+baad|aur\s+detail)\b/i.test(clean)) {
    return false;
  }
  // If the query contains substantive academic question words or topics, not a pure greeting
  if (/\b(?:why|what|how|explain|difference|formula|theory|chapter|page|equation|cause|effect|samjhao|batao|kya\s+hai|kyu\s+hai|kaise\s+hota|definition|meaning|flowchart|image|diagram|portrait|potrait|map|naksha|chitra)\b/i.test(clean)) {
    return false;
  }
  // Check if it's composed purely of greeting / pleasantry tokens
  const greetingTokens = /^(?:hi|hello|hey|heya|heyy|hola|namaste|namaskar|pranam|good\s+(?:morning|afternoon|evening)|yo|ram\s*ram)?\s*(?:kaise\s+ho|kaisa\s+hai|kaisi\s+ho|kya\s+haal\s+hai|kya\s+haal|kya\s+hal\s+hai|kya\s+chal\s+raha\s+hai|kya\s+chal\s+rha|sab\s+badhiya|sab\s+theek|whats\s*up|sup|wassup|how\s+are\s+you|how\s+r\s+u|aur\s+batao|aur\s+bhai)?\s*(?:bhai|bro|yaar|sir|mam|friend|dost|there|everyone)?$/i;
  if (greetingTokens.test(clean) && clean.length > 0) return true;
  if (/^(?:नमस्ते|प्रणाम|नमस्कार|कैसे हो|क्या हाल है|सब ठीक|कैसा है)$/.test(clean)) return true;
  return false;
}

function isConversationalPleasantry(q: string, hasContinuationPrompt = false, hasChatHistory = false): boolean {
  if (!q) return false;
  // If the conversation is waiting on a continuation prompt OR if chat history is actively flowing,
  // do NOT swallow "yes", "haan", "next", "theek", etc. as standalone dismissals!
  if (hasContinuationPrompt) return false;
  const clean = q.trim().toLowerCase().replace(/[!?.,;:~`"']+/g, " ").replace(/\s+/g, " ").trim();
  // Pure closing expressions of gratitude can always be acknowledged quickly
  if (/^(?:shukriya|dhanyawad|thanks|thank\s+you|thanku)$/i.test(clean)) return true;
  // If user is in an active chat with history, let yes/haan/ok go to the conversation model for contextual flow
  if (hasChatHistory) return false;
  return /^(?:ok|okay|theek\s+hai|thik\s+hai|accha|achha|achha\s+ji|theek|thik|samajh\s+gaya|samajh\s+gayi|got\s+it|done|yes|haan|ha|sahi\s+hai|cool|awesome|great|nice|waah|wah|perfect)$/i.test(clean);
}

// Broadest possible Indian & Global pronoun / anaphora detection (Hinglish variants: unka, unnke, ye, yeh, yh, etc.)
const anaphoricPronounsRegex = /\b(?:unka|unke|unki|unko|unhe|unhone|unse|unnka|unnke|unnki|unnko|unnhe|unnhone|unnse|inka|inke|inki|inko|inhe|inhone|inse|innka|innke|innki|innko|innhe|innhone|innse|uska|uske|uski|usko|usey|usne|usse|usska|usske|usski|ussko|ussey|ussne|ussse|iska|iske|iski|isko|isey|isne|isse|isska|isske|isski|issko|issey|issne|issse|ye|yeh|yh|yehi|yahi|wo|woh|voh|wohi|vahi|he|she|they|his|her|their|him|them|same|previous|pichla|pichle|pichli)\b/i;

// Conversational pleasantries, prefixes and fillers that should NEVER pollute the academic topic query
const conversationalPrefixRegex = /\b(?:acha|achha|accha|theek\s+hai|thik\s+hai|ok|okay|ab|fir|phir|aur|sun|suno|bhai|yaar|dost|arrey|are|sir|mam|madam|please|kripya|zara|ek\s+baar|thoda|thode|kuch|koi|bhi|toh|to|chalo|well|now|then|so)\b/gi;

// Words that indicate an attribute of a person/topic, rather than an independent entity itself
const attributeWordsRegex = /\b(?:life|jivan|jeevan|zindagi|biography|timeline|discoveries|inventions|history|works|theories|theory|story|kahani|kaam|process|mechanism|steps|details|points|contribution|contributions|achievements|career|shuruwat|bachpan|death|birth|kaise\s+hua|kya\s+tha|zariye|madhyam)\b/i;

// Highly tolerant visual action and noun regex covering typical typos (imag, imge, dikho, dikaho, dikahao, etc.)
const visualNoiseRegex = /\b(?:mujhe|kripya|please|can\s+you|banao|dikhao|dikaho|dikha|dikho|dikhdo|dikhadena|dikahao|dikhye|dikhaye|dikhana|dekhao|deko|dekho|dekhna|dikhwao|dikhaw|dikhlao|dikhlana|dikhva|dikhwa|do|dena|show\s+me|show|generate|give\s+me|give|create|fetch|send|bhejo|image\s+of|photo\s+of|picture\s+of|diagram\s+of|map\s+of|portrait\s+of|potrait\s+of|authentic|labeled|scientific|historical|geographical|ka|ki|ke|ko|se|me|mein|par|pe|ek|a|an|the|ya|or|chahiye|dekhna|potrait|portrait|portait|portret|tasveer|tasvir|chitra|naksha|photo|photos|foto|fotos|pic|pics|picture|pictures|image|images|imag|imge|img|imgs|imeg|imaj|flowchart|flow\s+chart|diagram|diagrams|draw|drawing|zariye|madhyam|samjhao|samjha|batao)\b/gi;
const topicNoiseRegex = /\b(?:is\s+topic|this\s+topic|is\s+concept|this\s+concept|is\s+chapter|this\s+chapter|is\s+personality|current\s+topic|topic|concept|personality|portrait|potrait|diagram|map|naksha|tasveer|tasvir|chitra|image|photo|pic)\b/gi;

// Canonical mapping for prominent historical & scientific personalities
const canonicalEntityMap: Record<string, string> = {
  "modi": "Narendra Modi",
  "narendra modi": "Narendra Modi",
  "pm modi": "Narendra Modi",
  "prime minister modi": "Narendra Modi",
  "patel": "Vallabhbhai Patel",
  "sardar patel": "Vallabhbhai Patel",
  "vallabhbhai patel": "Vallabhbhai Patel",
  "kalam": "A. P. J. Abdul Kalam",
  "abdul kalam": "A. P. J. Abdul Kalam",
  "apj abdul kalam": "A. P. J. Abdul Kalam",
  "ashoka": "Ashoka",
  "akbar": "Akbar",
  "shah jahan": "Shah Jahan",
  "babur": "Babur",
  "alexander": "Alexander the Great",
  "caesar": "Julius Caesar",
  "aristotle": "Aristotle",
  "plato": "Plato",
  "socrates": "Socrates",
  "da vinci": "Leonardo da Vinci",
  "leonardo da vinci": "Leonardo da Vinci",
  "lincoln": "Abraham Lincoln",
  "churchill": "Winston Churchill",
  "trump": "Donald Trump",
  "biden": "Joe Biden",
  "obama": "Barack Obama",
  "ramanujan": "Srinivasa Ramanujan",
  "hitler": "Adolf Hitler",
  "curie": "Marie Curie",
  "einstein": "Albert Einstein",
  "newton": "Isaac Newton",
  "darwin": "Charles Darwin",
  "galileo": "Galileo Galilei",
  "tesla": "Nikola Tesla",
  "gandhi": "Mahatma Gandhi",
  "bose": "Subhas Chandra Bose",
  "nehru": "Jawaharlal Nehru",
  "ambedkar": "B. R. Ambedkar",
  "bhagat singh": "Bhagat Singh",
  "tagore": "Rabindranath Tagore",
  "aryabhata": "Aryabhata",
  "shivaji": "Chhatrapati Shivaji Maharaj",
  "napoleon": "Napoleon",
  "shakespeare": "William Shakespeare",
  "bohr": "Niels Bohr",
  "rutherford": "Ernest Rutherford",
  "pasteur": "Louis Pasteur",
  "mendel": "Gregor Mendel",
  "faraday": "Michael Faraday",
  "maxwell": "James Clerk Maxwell",
  "edison": "Thomas Edison",
  "fleming": "Alexander Fleming",
  "hawking": "Stephen Hawking"
};

function getCanonicalEntityName(rawName: string): string {
  if (!rawName) return "";
  const lower = rawName.toLowerCase().trim();
  for (const [key, canon] of Object.entries(canonicalEntityMap)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(lower)) {
      return canon;
    }
  }
  return rawName.trim();
}

function isDocumentSpecificQuery(userQuestion: string, docTitle?: string): boolean {
  if (!userQuestion || typeof userQuestion !== 'string') return false;
  const q = userQuestion.toLowerCase().trim();

  // 1. Direct Chapter / Lesson / Unit / Module / Paath / Adhyay query
  if (/\b(?:chapter|ch\b|lesson|unit|module|paath|adhyaye?|part)\b/i.test(q)) return true;

  // 2. Direct Book / PDF / Document / File / Kitab / Textbook reference
  if (/\b(?:book|pdf|document|doc\b|file|kitab|kitaab|pustak|textbook)\b/i.test(q)) return true;

  // 3. Direct Page / Intext / Exercise / Question reference
  if (/\b(?:page|pg\b|p\.|intext|exercise|ex\.|question\s*\d+|q\s*\d+|prashna|sawal|abhyas|solution|soln|\d+\.\d+)\b/i.test(q)) return true;

  // 4. Story / Poem / Passage / Character / Plot / Author inquiry
  if (/\b(?:story|kahani|poem|kavita|passage|paragraph|character|plot|author|writer|poet|kavi|lekhak|summary|moral|who\s+wrote|kisne\s+likhi)\b/i.test(q)) return true;

  // 5. Next chapter or sequential navigation
  if (/\b(?:next\s+chapter|agla\s+chapter|iske\s+baad|iske\s+baad\s+ka)\b/i.test(q)) return true;

  // 6. Deictic indicators referring to loaded material: "iska chapter", "iss book", "isme kya hai", etc.
  if (/\b(?:is|iss|ye|yeh|iska|iske|iski|isme|isse)\s+(?:book|pdf|document|chapter|page|lesson|poem|story|kahani|kavita|file|module|text|summary|author|writer|poet|part)\b/i.test(q)) return true;
  if (/\b(?:iska\s+(?:matlab|arth|meaning|summary|overview)|isme\s+kya\s+(?:hai|likha|bataya)|is\s+page\s+(?:par|pe))\b/i.test(q)) return true;

  // 7. Ordinal chapter inquiries like "first chapter", "pehla chapter", "chapter 1"
  if (/\b(?:first|1st|second|2nd|third|3rd|pehla|pehli|doosra|dusra|teesra)\s*(?:chapter|lesson|unit|module|paath|story|kavita|kahani)\b/i.test(q)) return true;

  // 7. If docTitle is provided and user query matches title tokens of loaded document
  if (docTitle && typeof docTitle === 'string' && docTitle !== 'global_chat') {
    const cleanDoc = docTitle.toLowerCase().replace(/[-_.]/g, ' ').replace(/\b(?:pdf|copy|doc|\d+)\b/g, '').trim();
    const docWords = cleanDoc.split(/\s+/).filter(w => w.length >= 3 && !['english','hindi','book','class','part'].includes(w));
    for (const w of docWords) {
      if (q.includes(w)) return true;
    }
  }

  return false;
}

function extractAcademicSubject(rawQuery: string, chatHistory?: any[], docTitle?: string): string {
  // If query is meta-conversational about the chat, prompt, context, or AI behavior:
  if (/\b(?:context|yaad|mix\s*up|mixup|root\s*cause|fix|galat|wrong|suno|kya\s+bol\s+rahe|kiske\s+bare\s+me|kya\s+baat\s+ho\s+rahi|baat\s+ho\s+rahi|chat\s+ka)\b/i.test(rawQuery)) {
    return "";
  }

  // If a document is loaded in this session, the subject is strictly the document and its chapter!
  if (docTitle && typeof docTitle === 'string' && docTitle !== 'global_chat') {
    const cleanTitle = docTitle
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b(?:copy)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract chapter number if mentioned in query
    const chMatch = rawQuery.match(/(?:chapter|ch|lesson|unit|module|paath|adhyaye?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|1st|second|2nd|third|3rd|pehla|pehli|doosra|dusra|teesra)/i)
      || rawQuery.match(/(\d+|first|1st|second|2nd|third|3rd|pehla|pehli|doosra|dusra|teesra)\s*(?:th|st|nd|rd)?\s*(?:chapter|ch|lesson|unit|module|paath)/i);

    if (chMatch) {
      const numWordMap: Record<string, string> = {
        'one': '1', 'first': '1', '1st': '1', 'pehla': '1', 'pehli': '1',
        'two': '2', 'second': '2', '2nd': '2', 'doosra': '2', 'dusra': '2',
        'three': '3', 'third': '3', '3rd': '3', 'teesra': '3',
        'four': '4', 'fourth': '4', '4th': '4',
        'five': '5', 'fifth': '5', '5th': '5'
      };
      const raw = (chMatch[1] || '').toLowerCase();
      const chNum = numWordMap[raw] || raw;
      return `${cleanTitle} (Chapter ${chNum})`;
    }

    // Check if recent conversation turns were discussing a specific chapter of this book
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const text = chatHistory[i]?.text || '';
        const prevChMatch = text.match(/\b(Module|Chapter|Unit|Lesson)\s*0*(\d+)\b/i);
        if (prevChMatch) {
          return `${cleanTitle} (${prevChMatch[1]} ${prevChMatch[2]})`;
        }
      }
    }

    return cleanTitle;
  }

  // 1. Detect if query contains anaphoric pronouns or purely attribute words without a concrete named entity
  const hasPronoun = anaphoricPronounsRegex.test(rawQuery);

  // Clean rawQuery of noise and conversational pleasantries
  let clean = rawQuery
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[?!.,;:"'()[\]{}]/g, " ")
    .replace(visualNoiseRegex, " ")
    .replace(conversationalPrefixRegex, " ")
    .replace(topicNoiseRegex, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip all pronouns and filler tokens to test if the query contains an explicit new entity
  const queryWithoutPronounsOrFiller = clean
    .replace(anaphoricPronounsRegex, " ")
    .replace(conversationalPrefixRegex, " ")
    .replace(/\b(?:koi|kisi|kuch|sab|apna|apni|apne|meri|mera|mere|teri|tera|tere|sir|bhai|yaar|please|kripya|chahiye|dekhna|dikhao|batao|samjhao)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If the query is just attribute words (like "life", "timeline", "discoveries") or has anaphora ("inka", "unke", "iski")
  const isPureAttribute = attributeWordsRegex.test(clean) && !/\b(?:einstein|newton|galileo|darwin|curie|bohr|tesla|rutherford|scorpio|gandhi|nehru|hitler|war|mughal|cell|atom|photosynthesis|dna|rna|light|sound|electricity|magnetism|gravity|motion|force)\b/i.test(clean);

  const isAnaphoric = hasPronoun || queryWithoutPronounsOrFiller.length < 2 || isPureAttribute;

  // 2. If pronoun or pure attribute is detected, find antecedent entity from chat history
  let antecedentEntity = "";
  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    const recent = chatHistory.slice().reverse();
    for (const msg of recent) {
      if (msg && typeof msg.text === 'string') {
        const text = msg.text;

        // A. Search for prominent historical figures, scientists, or scientific topics in previous turns
        const academicKeywords = text.match(/\b(?:Marie\s+Curie|Madam\s+Curie|Pierre\s+Curie|Albert\s+Einstein|Einstein|Isaac\s+Newton|Newton|Galileo(?:\s+Galilei)?|Charles\s+Darwin|Darwin|Nikola\s+Tesla|Tesla|Niels\s+Bohr|Bohr|Ernest\s+Rutherford|Rutherford|Louis\s+Pasteur|Pasteur|Gregor\s+Mendel|Mendel|Michael\s+Faraday|Faraday|James\s+Clerk\s+Maxwell|Maxwell|Thomas\s+Edison|Edison|Alexander\s+Fleming|Fleming|Stephen\s+Hawking|Hawking|Subhash\s+Chandra\s+Bose|Mahatma\s+Gandhi|Jawaharlal\s+Nehru|B\.\s*R\.\s*Ambedkar|Bhagat\s+Singh|Rabindranath\s+Tagore|William\s+Shakespeare|Robert\s+Frost|John\s+Keats|William\s+Wordsworth|Nissim\s+Ezekiel|World\s+War\s+[12I|V]+|French\s+Revolution|Russian\s+Revolution|Indian\s+National\s+Movement|Photosynthesis|Cell\s+Division|Mitosis|Meiosis|Periodic\s+Table|Thermodynamics|Quantum\s+Mechanics|Relativity|Ohm's\s+Law|Newton's\s+Laws|Gravitation|Night\s+of\s+the\s+Scorpion)\b/i);

        if (academicKeywords && academicKeywords[0]) {
          if (/Marie\s+Curie/i.test(text)) {
            antecedentEntity = "Marie Curie";
          } else {
            antecedentEntity = academicKeywords[0];
          }
          break;
        }

        // B. Look for markdown headings in AI answers (e.g. ### Marie Curie or ### Photosynthesis)
        const headingMatch = text.match(/###?\s+([^:\n\r#|`]+)/);
        if (headingMatch && headingMatch[1]) {
          const cand = headingMatch[1].replace(/\b(?:Life|Timeline|Overview|Breakdown|Concepts?|Explanation|Summary|Journey)\b/gi, '').trim();
          if (cand.length >= 3 && !anaphoricPronounsRegex.test(cand)) {
            antecedentEntity = cand;
            break;
          }
        }

        // C. Look for bolded entity names in AI answers (e.g. **Marie Curie**)
        const boldMatches = text.match(/\*\*([A-Z][a-zA-Z0-9\s'-]{2,30})\*\*/g);
        if (boldMatches && boldMatches.length > 0) {
          for (const bm of boldMatches) {
            const raw = bm.replace(/\*/g, '').trim();
            if (raw.length >= 3 && !anaphoricPronounsRegex.test(raw) && !/^(?:Note|Key|Tip|Summary|Definition|Important|Rule|Stage|Step|Phase|Flowchart)$/i.test(raw)) {
              antecedentEntity = raw;
              break;
            }
          }
          if (antecedentEntity) break;
        }

        // D. Look in prior user messages
        if (msg.role === 'user' && text !== rawQuery) {
          const cand = text
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/[?!.,;:"'()[\]{}]/g, ' ')
            .replace(visualNoiseRegex, ' ')
            .replace(topicNoiseRegex, ' ')
            .replace(anaphoricPronounsRegex, ' ')
            .replace(/\b(?:mujhe|kripya|please|batao|explain|detail\s+me|samjhao|kya|kyu|kyun|hai|hain|tha|the|bhi|aur|ka|ki|ke|in|on|at|of|the|a|an|tell|about|chahiye|karo|kaise|koi|kisi)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cand.length >= 3 && !anaphoricPronounsRegex.test(cand)) {
            antecedentEntity = cand;
            break;
          }
        }
      }
    }
  }

  // If query was anaphoric (e.g. "Inka koi image dikhao" or "unke life ko")
  if (isAnaphoric && antecedentEntity) {
    if (attributeWordsRegex.test(clean) || attributeWordsRegex.test(rawQuery)) {
      return `${antecedentEntity} (Life & Career Timeline)`;
    }
    return antecedentEntity;
  }

  if (queryWithoutPronounsOrFiller.length >= 2 && !isAnaphoric) {
    return queryWithoutPronounsOrFiller;
  }

  if (antecedentEntity) {
    return antecedentEntity;
  }

  // 3. Fallback to doc title if it contains a recognizable subject
  if (docTitle && typeof docTitle === 'string') {
    const cleanTitle = docTitle
      .replace(/\.[a-zA-Z0-9]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b(?:class|standard|grade|ncert|cbse|chapter|unit|module|lesson|book|\d+|copy|english|hindi|science|maths?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanTitle.length >= 4) return cleanTitle;
  }

  return clean || "";
}

async function fetchLiveInternetGrounding(query: string): Promise<string> {
  if (!query || query.trim().length < 4) return "";
  // Do NOT search internet on casual greetings or conversational pleasantries
  if (isGreeting(query) || isConversationalPleasantry(query)) return "";

  try {
    const cleanQ = query
      .replace(/[?!.,;:"'()[\]{}]/g, " ")
      .replace(/\b(?:kya|kyu|kaise|batao|explain|samjhao|detail\s+me|verify|latest|current|up\s+to\s+date|information|karo|bhai|yaar|hi|hello|hey|theek|achha|ok|please)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanQ.length < 3) return "";

    // 1. Wikipedia Summary REST API with 2000ms timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const wikiResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQ)}`, {
        headers: { "User-Agent": "SAYAD-Academic-App/1.0 (educational research)" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (wikiResp.ok) {
        const wikiData: any = await wikiResp.json();
        if (wikiData && wikiData.extract) {
          return `[VERIFIED LIVE ENCYCLOPEDIC KNOWLEDGE (${wikiData.title})]:\n${wikiData.extract}`;
        }
      }
    } catch(e) {
      clearTimeout(timeoutId);
    }

    // 2. DuckDuckGo Instant Knowledge API with 1500ms timeout
    const ddgCtrl = new AbortController();
    const ddgTimeoutId = setTimeout(() => ddgCtrl.abort(), 1500);
    try {
      const ddgResp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQ)}&format=json&no_html=1&skip_disambig=1`, {
        headers: { "User-Agent": "SAYAD-Academic-App/1.0" },
        signal: ddgCtrl.signal
      });
      clearTimeout(ddgTimeoutId);
      if (ddgResp.ok) {
        const ddgData: any = await ddgResp.json();
        const abstract = ddgData.AbstractText || ddgData.Abstract;
        if (abstract) {
          return `[VERIFIED LIVE KNOWLEDGE GROUNDING (${ddgData.Heading || cleanQ})]:\n${abstract}`;
        }
      }
    } catch(e) {
      clearTimeout(ddgTimeoutId);
    }
  } catch (err) {
    console.warn("Internet grounding fetch notice:", err);
  }
  return "";
}

function cleanImageUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let clean = rawUrl.split("?")[0];
  clean = clean.replace(/\(/g, "%28").replace(/\)/g, "%29");
  return clean;
}

async function fetchEducationalInternetImage(rawQuery: string, fallbackSubject?: string): Promise<{ imageUrl: string; title: string; description: string; source: string } | null> {
  if (!rawQuery && !fallbackSubject) return null;

  const hasPronoun = anaphoricPronounsRegex.test(rawQuery || "");
  let cleanQuery = "";

  // If query contains pronouns (inka, unka, iska, etc.) or is empty, immediately prioritize fallbackSubject!
  if ((hasPronoun || !rawQuery || rawQuery.trim().length < 2) && fallbackSubject && fallbackSubject.trim().length >= 2) {
    cleanQuery = fallbackSubject.trim();
  } else {
    cleanQuery = (rawQuery || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[?!.,;:"'()[\]{}]/g, " ")
      .replace(visualNoiseRegex, " ")
      .replace(conversationalPrefixRegex, " ")
      .replace(topicNoiseRegex, " ")
      .replace(anaphoricPronounsRegex, " ")
      .replace(/\b(?:koi|kisi|kuch|sab|apna|apni|apne|meri|mera|mere|teri|tera|tere|sir|bhai|yaar|please|kripya)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if ((cleanQuery.length < 2 || anaphoricPronounsRegex.test(cleanQuery)) && fallbackSubject && fallbackSubject.trim().length >= 2) {
      cleanQuery = fallbackSubject.trim();
    }
  }

  // Remove any timeline or parenthesis context (e.g. "Marie Curie (Life & Career Timeline)" -> "Marie Curie")
  cleanQuery = cleanQuery.replace(/\s*\([^)]*\)/g, "").trim();

  // Resolve to canonical historical/scientific name if matched (e.g. Hitler -> Adolf Hitler)
  cleanQuery = getCanonicalEntityName(cleanQuery);

  if (!cleanQuery || cleanQuery.length < 2) return null;

  const isMap = /\b(?:map|naksha|alliances|boundaries|territory|geographical)\b/i.test(rawQuery);
  const isPortrait = /\b(?:portrait|potrait|portait|chehra|tasveer|tasvir|photo|chitra|personality)\b/i.test(rawQuery) || !isMap;
  const isDiagram = /\b(?:diagram|structure|flowchart|anatomy|labeled|scientific)\b/i.test(rawQuery);

  const searchKeywords = [
    cleanQuery,
    isPortrait && !cleanQuery.toLowerCase().includes("portrait") ? `${cleanQuery} portrait` : null,
    isMap && !cleanQuery.toLowerCase().includes("map") ? `${cleanQuery} map` : null,
    isDiagram && !cleanQuery.toLowerCase().includes("diagram") ? `${cleanQuery} diagram` : null,
  ].filter(Boolean) as string[];

  // 1. If map or diagram, search Wikimedia Commons first for high-res educational SVGs/PNGs
  if (isMap || isDiagram) {
    for (const kw of searchKeywords) {
      try {
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(kw)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|size|mime&format=json`;
        const resp = await fetch(commonsUrl, { headers: { "User-Agent": "SAYAD-Academic-App/2.0 (educational research)" } });
        if (resp.ok) {
          const data: any = await resp.json();
          const pages = data?.query?.pages;
          if (pages) {
            for (const pageId of Object.keys(pages)) {
              const p = pages[pageId];
              const info = p?.imageinfo?.[0];
              const url = info?.url;
              if (url && (url.endsWith(".svg") || url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".webp"))) {
                if ((info.width && info.width > 200) || url.endsWith(".svg")) {
                  const title = (p.title || cleanQuery).replace(/^File:/i, "").replace(/\.[a-zA-Z0-9]+$/, "").replace(/_/g, " ");
                  return {
                    imageUrl: cleanImageUrl(url),
                    title,
                    description: `Authentic educational visual archive from Wikimedia Commons archives.`,
                    source: "Wikimedia Commons (Open Educational Archive)"
                  };
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[Wikimedia Commons Image Search Error]:", err);
      }
    }
  }

  // 2. Search Wikipedia API with smart entity scoring (ensures primary subject matches)
  for (const kw of searchKeywords) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(kw)}&gsrlimit=8&prop=pageimages|extracts&piprop=original|thumbnail&pithumbsize=1200&exintro=1&explaintext=1&format=json`;
      const resp = await fetch(wikiUrl, { headers: { "User-Agent": "SAYAD-Academic-App/2.0 (educational research)" } });
      if (resp.ok) {
        const data: any = await resp.json();
        const pages = Object.values(data?.query?.pages || {});

        const scored = pages.map((p: any) => {
          let score = 0;
          const title = (p.title || "").toLowerCase();
          const q = cleanQuery.toLowerCase();
          const img = p?.thumbnail?.source || p?.original?.source;
          if (!img) return { page: p, score: -100 };

          // Direct title match
          if (title === q) score += 100;
          else if (title.startsWith(q) || q.startsWith(title)) score += 80;
          else if (title.includes(q)) score += 60;

          // Penalize secondary/incident articles (treaties, filmographies, controversies, death accounts)
          if (/\b(?:disambiguation|death of|views of|film|filmography|movie|treaty|concordat|reichskonkordat|list of|album|song)\b/i.test(title)) {
            score -= 70;
          }

          // Penalize flags/SVG logos when seeking a person's photo/portrait
          if (img.includes('.svg') && (title.includes('flag') || title.includes('coat_of_arms') || title.includes('germany') || title.includes('party'))) {
            score -= 50;
          }

          return { page: p, score, title: p.title, img, extract: p.extract };
        }).filter((x: any) => x.score > 0);

        scored.sort((a: any, b: any) => b.score - a.score);

        if (scored.length > 0) {
          const best = scored[0];
          return {
            imageUrl: cleanImageUrl(best.img),
            title: best.title,
            description: best.extract ? best.extract.slice(0, 350) + "…" : "",
            source: `Wikipedia Official Archives (${best.title})`
          };
        }
      }
    } catch (err) {
      console.warn("[Wikipedia Image Search Error]:", err);
    }
  }

  // 3. Fallback check on Wikimedia Commons if Wikipedia didn't have an image
  if (!isMap && !isDiagram) {
    for (const kw of searchKeywords) {
      try {
        const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(kw)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|size&format=json`;
        const resp = await fetch(commonsUrl, { headers: { "User-Agent": "SAYAD-Academic-App/1.0 (educational research)" } });
        if (resp.ok) {
          const data: any = await resp.json();
          const pages = data?.query?.pages;
          if (pages) {
            for (const pageId of Object.keys(pages)) {
              const p = pages[pageId];
              const info = p?.imageinfo?.[0];
              const url = info?.url;
              if (url && (url.endsWith(".svg") || url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".webp"))) {
                const title = (p.title || cleanQuery).replace(/^File:/i, "").replace(/\.[a-zA-Z0-9]+$/, "").replace(/_/g, " ");
                return {
                  imageUrl: cleanImageUrl(url),
                  title,
                  description: "",
                  source: "Wikimedia Commons"
                };
              }
            }
          }
        }
      } catch (err) {}
    }
  }

  // 4. Ultimate Educational Fallback via DuckDuckGo Open Web Images (ensures any figure, leader, or concept works)
  for (const kw of searchKeywords) {
    const ddgImg = await fetchDuckDuckGoImage(kw);
    if (ddgImg && ddgImg.imageUrl) {
      return {
        imageUrl: ddgImg.imageUrl,
        title: ddgImg.title || cleanQuery,
        description: `Visual reference from educational open archives for ${cleanQuery}.`,
        source: ddgImg.source
      };
    }
  }

  return null;
}

async function fetchDuckDuckGoImage(query: string): Promise<{ imageUrl: string; title: string; source: string } | null> {
  try {
    const tokenResp = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(5000)
    });
    const html = await tokenResp.text();
    const vqdMatch = html.match(/vqd=([0-9-]+)/) || html.match(/vqd="([0-9-]+)"/);
    if (!vqdMatch) return null;
    const vqd = vqdMatch[1];
    const imgResp = await fetch(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!imgResp.ok) return null;
    const data: any = await imgResp.json();
    const results = data?.results || [];
    if (results.length > 0) {
      for (const r of results) {
        if (r.image && (r.image.startsWith("http://") || r.image.startsWith("https://"))) {
          return {
            imageUrl: cleanImageUrl(r.image),
            title: r.title || query,
            source: `Web Educational Archive (${r.source || 'DuckDuckGo'})`
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[DDG Image Search Error]:", err?.message);
  }
  return null;
}

function sanitizeAIResponse(text: string): string {
  if (!text) return text;
  return text
    // Strip repetitive book disclaimers
    .replace(/\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)/gi, "")
    .replace(/\*+\s*\(\s*(?:External Knowledge|Web Search|Book ke bahar se)[^)]*\)\s*\*+/gi, "")
    // Collapse runaway dash repetition (e.g. LLM tokenizer loops generating walls of dashes)
    .replace(/(?:^[ \t]*[-─_]{4,}[ \t]*(?:\r?\n|$)){2,}/gm, "\n---\n")
    .replace(/[-─]{25,}/g, "----------")
    // Clean ASCII table borders (+----+----+)
    .replace(/^[ \t]*\+[-+]+\+[ \t]*$/gm, "")
    // Strip trailing nagging prompts to return to the book
    .replace(/(?:Would you like to (?:continue with|return to) your .*? textbook|Ready to (?:return to|tackle) .*?\?)\s*$/gi, "")
    .trim();
}

async function generateAIImage(prompt: string): Promise<{ imageUrl: string; description?: string } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI;
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aistudio.google.com",
        "X-Title": "SAYAD Super Tutor Visuals"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{
          role: "user",
          content: `Create a clean, detailed, textbook-quality educational illustration or visual diagram of: ${prompt}. Ensure high clarity and educational value.`
        }],
        modalities: ["image", "text"]
      })
    });

    if (resp.ok) {
      const data: any = await resp.json();
      const choice = data?.choices?.[0];
      const images = choice?.message?.images;
      if (images && images.length > 0) {
        const imgObj = images[0];
        const imageUrl = imgObj?.image_url?.url || imgObj?.url;
        if (imageUrl) {
          return {
            imageUrl,
            description: choice?.message?.content || prompt
          };
        }
      }
    }
  } catch (err: any) {
    console.warn("[AI Image Generation notice]:", err?.message);
  }
  return null;
}

// -------------------------------------------------------------
// SAFE OUTBOUND IMAGE FETCH (used by /api/image-proxy)
// -------------------------------------------------------------
// The proxy fetches URLs on behalf of visitors, so it must never reach private networks (SSRF),
// never return non-image content under this app's origin (script injection) and never buffer
// unbounded downloads.

function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(v)) {
    if (v === "::" || v === "::1") return true;
    // IPv4 hidden inside IPv6: ::ffff:10.0.0.1 and the hex form ::ffff:a00:1 that URL parsing produces,
    // plus the deprecated IPv4-compatible ::a00:1.
    const mappedDotted = v.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedDotted) return isPrivateAddress(mappedDotted[1]);
    const mappedHex = v.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // NAT64 (64:ff9b::/96) can reach IPv4 hosts, including private ones.
    return /^(fc|fd|fe[89ab]|ff|64:ff9b:)/.test(v);
  }
  return true; // not an IP literal: treat as unsafe
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("blocked host");
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("blocked address");
    return;
  }
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("blocked address");
  }
}

const MAX_PROXY_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PROXY_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;

function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function fetchPublicImage(
  startUrl: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    await assertPublicHost(parsed.hostname); // re-checked on every redirect hop
    const resp = await fetch(parsed.toString(), { headers, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) return null;
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!resp.ok) return null;

    const declaredLength = Number(resp.headers.get("content-length") || 0);
    if (declaredLength > MAX_PROXY_IMAGE_BYTES) return null;
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROXY_IMAGE_BYTES) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    const buffer = Buffer.concat(chunks);

    let contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.test(contentType)) {
      // Some image hosts label files as octet-stream; accept those only when the bytes really are an image.
      const sniffed = !contentType || contentType === "application/octet-stream" ? sniffImageType(buffer) : null;
      if (!sniffed) return null;
      contentType = sniffed;
    }
    return { buffer, contentType };
  }
  return null;
}

function sendProxyImage(res: express.Response, buffer: Buffer, contentType: string, cacheControl: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Even if someone opens the URL directly, a hostile SVG cannot run script on this origin.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return res.send(buffer);
}

// -------------------------------------------------------------
// SIMPLE PER-IP RATE LIMITER (no extra dependency)
// -------------------------------------------------------------
function createRateLimiter(windowMs: number, max: number): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please slow down for a minute.", status: "error" });
    }
    next();
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled promise rejection (kept running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception (kept running):", err);
});

// True on serverless hosts (Netlify/Vercel/AWS Lambda): no dev server, no static files, no listen().
const IS_SERVERLESS = !!(process.env.SAYAD_SERVERLESS || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.VERCEL);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // One reverse proxy hop (Cloud Run / AI Studio): makes req.ip the real visitor for rate limiting.
  app.set("trust proxy", 1);

  // Abuse protection: the AI routes spend the owner's API quota. Limits are generous for normal study use.
  app.use("/api/", createRateLimiter(60_000, 300));
  app.use(["/api/ai", "/api/tts", "/api/gemini", "/api/dictionary", "/api/image-proxy"], createRateLimiter(60_000, 150));

  // Compress static files only: API responses include streamed (SSE) replies that must not be buffered.
  app.use(compression({
    filter: (req, res) => !req.path.startsWith("/api/") && compression.filter(req, res),
  }));

  app.use(express.json({ limit: "30mb" }));

  // Health check & Key Pool Diagnostics
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      keyPool: keyPool.getStatus(),
      groqConfigured: !!process.env.GROQ_API_KEY,
      openRouterConfigured: !!process.env.OPENROUTER_API_KEY,
      elevenLabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    });
  });

  // Comprehensive Key Diagnostics & Live Responsiveness Test
  // Spends real API calls and shows key fragments, so it is locked: set DIAGNOSTICS_TOKEN and send it
  // as the `x-diagnostics-token` header. Without a token it is only available outside production.
  app.get("/api/keys-diagnostics", async (req, res) => {
    const configuredToken = (process.env.DIAGNOSTICS_TOKEN || "").trim();
    if (configuredToken) {
      if (!safeEqual(String(req.get("x-diagnostics-token") || ""), configuredToken)) {
        return res.status(404).json({ error: "Not found" });
      }
    } else if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const envKeys = [
        { varName: "GEMINI_API_KEY", tag: "Primary Default Fallback", pool: "Universal" },
        { varName: "GEMINI_STUDY_KEY_1", tag: "Dedicated Study Key #1", pool: "Study Tools" },
        { varName: "GEMINI_STUDY_KEY_2", tag: "Dedicated Study Key #2", pool: "Study Tools" },
        { varName: "GEMINI_CHAT_KEY_1", tag: "Dedicated Book Chat Key #1", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_2", tag: "Dedicated Book Chat Key #2", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_3", tag: "Dedicated Book Chat Key #3", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_4", tag: "Dedicated Book Chat Key #4", pool: "Book AI Chat" },
        { varName: "GEMINI_CHAT_KEY_5", tag: "Dedicated Book Chat Key #5", pool: "Book AI Chat" },
        { varName: "GEMINI_BACKUP_KEY_1", tag: "Emergency Backup Key #1", pool: "Failover" },
        { varName: "GROQ_API_KEY", tag: "Groq High-Speed LLaMA/GPT", pool: "Backup LLM" },
        { varName: "OPENROUTER_API_KEY", tag: "OpenRouter Multi-Model", pool: "Backup LLM" },
        { varName: "ELEVENLABS_API_KEY", tag: "ElevenLabs Voice TTS", pool: "Audio Synthesis" },
      ];

      const valMap = new Map<string, string[]>();
      const results: any[] = [];

      for (const item of envKeys) {
        const val = (process.env[item.varName] || "").trim();
        if (!val) {
          results.push({
            variable: item.varName,
            tag: item.tag,
            pool: item.pool,
            configured: false,
            status: "not_configured",
            message: "Variable not set in environment"
          });
          continue;
        }

        if (!valMap.has(val)) {
          valMap.set(val, []);
        }
        valMap.get(val)!.push(item.varName);

        const preview = `${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
        let isResponsive = false;
        let latencyMs = 0;
        let errorMessage = "";

        if (item.varName.startsWith("GEMINI_")) {
          const t0 = Date.now();
          try {
            const ai = keyPool.getClient(val);
            const resp = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: "ping",
            });
            latencyMs = Date.now() - t0;
            isResponsive = !!(resp && resp.text);
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message || "Failed to respond";
          }
        } else if (item.varName === "GROQ_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${val}` },
              body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: [{ role: "user", content: "ping" }] })
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        } else if (item.varName === "OPENROUTER_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
              headers: { "Authorization": `Bearer ${val}` }
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        } else if (item.varName === "ELEVENLABS_API_KEY") {
          const t0 = Date.now();
          try {
            const resp = await fetch("https://api.elevenlabs.io/v1/user", {
              headers: { "xi-api-key": val }
            });
            latencyMs = Date.now() - t0;
            isResponsive = resp.ok;
            if (!resp.ok) errorMessage = `Status ${resp.status}`;
          } catch (err: any) {
            latencyMs = Date.now() - t0;
            errorMessage = err.message;
          }
        }

        results.push({
          variable: item.varName,
          tag: item.tag,
          pool: item.pool,
          configured: true,
          preview,
          responsive: isResponsive,
          latencyMs,
          error: errorMessage || null
        });
      }

      // Check duplicates
      const duplicateDetails: any[] = [];
      valMap.forEach((vars, val) => {
        if (vars.length > 1) {
          duplicateDetails.push({
            keyPreview: `${val.substring(0, 6)}...${val.substring(val.length - 4)}`,
            usedInVariables: vars
          });
        }
      });

      res.json({
        totalVariablesChecked: envKeys.length,
        totalConfigured: results.filter(r => r.configured).length,
        totalUniqueKeys: valMap.size,
        hasDuplicates: duplicateDetails.length > 0,
        duplicateDetails,
        allKeysSummary: results
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Diagnostics failed" });
    }
  });

  // Resilient High-Performance Image Proxy (bypasses mobile carrier blocks, referer filters, CORS, and rate limits)
  const imageProxyCache = new Map<string, { buffer: Buffer; contentType: string; time: number }>();
  const MAX_IMAGE_CACHE = 150;

  function setCacheItem(key: string, item: { buffer: Buffer; contentType: string; time: number }) {
    if (imageProxyCache.size >= MAX_IMAGE_CACHE) {
      const firstKey = imageProxyCache.keys().next().value;
      if (firstKey) imageProxyCache.delete(firstKey);
    }
    imageProxyCache.set(key, item);
  }

  function generateFallbackSvg(subject: string): string {
    const clean = (subject || "Academic Visual").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#818cf8"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" rx="16"/>
      <circle cx="400" cy="180" r="64" fill="rgba(56, 189, 248, 0.1)" stroke="url(#accent)" stroke-width="2"/>
      <text x="400" y="196" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="44" text-anchor="middle" fill="#38bdf8">🖼️</text>
      <text x="400" y="290" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" fill="#f8fafc">${clean}</text>
      <text x="400" y="324" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="14" text-anchor="middle" fill="#94a3b8">Authentic Academic Archive Reference</text>
    </svg>`;
  }

  app.get("/api/image-proxy", async (req, res) => {
    try {
      let rawUrl = (req.query.url as string) || "";
      const subject = (req.query.subject as string) || "";

      // Check cache first for instant sub-millisecond response
      const cacheKey = rawUrl || subject;
      if (cacheKey && imageProxyCache.has(cacheKey)) {
        const cached = imageProxyCache.get(cacheKey)!;
        return sendProxyImage(res, cached.buffer, cached.contentType, "public, max-age=604800, immutable");
      }

      // If no URL was provided but subject was, automatically search an authentic image for subject
      if (!rawUrl && subject) {
        const found = await fetchEducationalInternetImage(subject);
        if (found && found.imageUrl) {
          rawUrl = found.imageUrl;
        }
      }

      if (!rawUrl) {
        const svg = generateFallbackSvg(subject || "Educational Visual");
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.send(Buffer.from(svg));
      }

      // Safely handle URL decoding (avoid URI malformed if already decoded)
      let targetUrl = rawUrl.trim();
      if (/^https?%3A%2F%2F/i.test(targetUrl)) {
        try {
          targetUrl = decodeURIComponent(targetUrl);
        } catch (e) {}
      }

      let parsed: URL;
      try {
        parsed = new URL(targetUrl);
      } catch {
        try {
          parsed = new URL(encodeURI(targetUrl));
        } catch {
          const svg = generateFallbackSvg(subject || "Educational Visual");
          res.setHeader("Content-Type", "image/svg+xml");
          res.setHeader("Access-Control-Allow-Origin", "*");
          return res.send(Buffer.from(svg));
        }
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).send("Invalid protocol");
      }

      const imageHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      };

      let fetched: { buffer: Buffer; contentType: string } | null = null;
      try {
        fetched = await fetchPublicImage(parsed.toString(), 9000, imageHeaders);
      } catch (fetchErr: any) {
        console.warn("[Proxy Fetch blocked/failed]:", fetchErr?.message);
      }

      // If upstream failed or was refused, try an alternative image for the subject
      if (!fetched && subject) {
        const altImg = await fetchEducationalInternetImage(subject);
        if (altImg && altImg.imageUrl && altImg.imageUrl !== targetUrl) {
          try {
            fetched = await fetchPublicImage(altImg.imageUrl, 8000, imageHeaders);
          } catch (e) {}
        }
      }

      if (!fetched) {
        const svg = generateFallbackSvg(subject || "Educational Archive Visual");
        return sendProxyImage(res, Buffer.from(svg), "image/svg+xml", "public, max-age=86400");
      }

      if (cacheKey.length <= 500) {
        setCacheItem(cacheKey, { buffer: fetched.buffer, contentType: fetched.contentType, time: Date.now() });
      }
      return sendProxyImage(res, fetched.buffer, fetched.contentType, "public, max-age=604800, immutable");
    } catch (err: any) {
      console.warn("[Image Proxy Error]:", err?.message);
      const svg = generateFallbackSvg("Educational Visual");
      return sendProxyImage(res, Buffer.from(svg), "image/svg+xml", "no-cache");
    }
  });

  // Dedicated AI Study Tools Endpoint (Summarize, Explain, Flashcards, MCQs, Revision, Meaning, Key Facts)
  app.post("/api/ai/study-tool", async (req, res) => {
    try {
      const { toolKey, prompt, sourceText, isFullPage, pageNum, model, temperature, customKey, stream, systemInstruction, json } = req.body;
      if (!prompt && !sourceText) {
        return res.status(400).json({ error: "Missing prompt or sourceText" });
      }

      const queryPrompt = prompt || sourceText;
      const targetModel = model || "gemini-3.1-flash-lite";

      let studySysInstruction = "You are an elite academic curriculum analyst, master tutor & exam specialist. Provide thorough, comprehensive, in-depth, long-form explanations and summaries with vivid analogies, interactive Mermaid.js flowcharts (```mermaid\\nflowchart TD\\n... \\n```), structured bullet points, numbered takeaways, markdown comparison tables, and high-yield exam insights. Use clean standard markdown (#, ##, -, bold). When creating markdown tables, always use standard format (| Header 1 | Header 2 | followed by | :--- | :--- |) with concise cell contents; never use repetitive dashes or ASCII box borders. NEVER output raw unparsed LaTeX (like $$, \\frac), stray asterisks (*), or weird symbols. NEVER output plain text ASCII art diagrams; always use proper Mermaid JS syntax for flowcharts and progression maps. Ensure 100% factual accuracy strictly grounded in the provided document text.";

      if (typeof systemInstruction === "string" && systemInstruction.trim()) {
        studySysInstruction = systemInstruction.trim();
      } else if (toolKey === "mcq" || (prompt && (prompt.includes("JSON FORMAT") || prompt.includes("JSON array")))) {
        studySysInstruction = "You are an elite Board Examination Paper Setter (CBSE & NIOS standard). Return ONLY a valid JSON array of question objects. Do NOT output markdown backticks (```), commentary, or explanations outside the JSON.";
      }

      // Real-Time SSE Streaming Delivery if requested
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        let accumulatedStreamText = "";
        const streamResult = await executeWithGeminiPoolStream(
          'study',
          queryPrompt,
          (chunk) => {
            accumulatedStreamText += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          },
          {
            targetModel,
            temperature: typeof temperature === "number" ? temperature : 0.22,
            systemInstruction: studySysInstruction,
            customKey,
          }
        );

        if (streamResult && accumulatedStreamText.trim().length > 0) {
          res.write(`data: ${JSON.stringify({ done: true, fullText: accumulatedStreamText.trim(), model: streamResult.model })}\n\n`);
          return res.end();
        }

        // Fallback to non-streaming execution if stream yielded nothing
        const fallbackRes = await executeWithGeminiPool('study', queryPrompt, {
          targetModel,
          temperature: typeof temperature === "number" ? temperature : 0.22,
          systemInstruction: studySysInstruction,
          customKey,
        });

        const fallbackText = fallbackRes?.text || "";
        if (fallbackText) {
          res.write(`data: ${JSON.stringify({ chunk: fallbackText })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true, fullText: fallbackText, model: fallbackRes?.model })}\n\n`);
          return res.end();
        }

        // Groq Fallback for study tool
        if (process.env.GROQ_API_KEY) {
          try {
            const groqRes = await executeWithGroq(queryPrompt, studySysInstruction, 0.22);
            if (groqRes) {
              res.write(`data: ${JSON.stringify({ chunk: groqRes })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true, fullText: groqRes, model: "groq-llama-3.3-70b" })}\n\n`);
              return res.end();
            }
          } catch(e) {}
        }

        // OpenRouter Fallback for study tool
        if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
          try {
            const orRes = await executeWithOpenRouter(queryPrompt, studySysInstruction, 0.22);
            if (orRes && orRes.text) {
              res.write(`data: ${JSON.stringify({ chunk: orRes.text })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true, fullText: orRes.text, model: "openrouter" })}\n\n`);
              return res.end();
            }
          } catch(e) {}
        }

        res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
        return res.end();
      }

      // 1. Execute with dedicated Gemini Study Key Pool (or user BYOK custom key)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('study', queryPrompt, {
            targetModel,
            temperature: typeof temperature === "number" ? temperature : 0.22,
            systemInstruction: studySysInstruction,
            customKey,
            responseMimeType: json === true ? "application/json" : undefined,
          });

          if (result && result.text) {
            return res.json({
              text: result.text,
              status: "success",
              provider: "gemini",
              model: result.model,
              keySlot: result.keyTag,
              toolKey: toolKey || "study-tool",
            });
          }
        } catch (studyErr: any) {
          console.warn("[Study Tool] Gemini Pool notice:", studyErr.message);
        }
      }

      // 2. High-speed Groq Inference (Sub-second fallback)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(queryPrompt, studySysInstruction, 0.25);
        if (groqText) {
          return res.json({
            text: groqText,
            status: "success",
            provider: "groq",
            model: "gpt-oss-120b",
            toolKey: toolKey || "study-tool"
          });
        }
      }

      // 3. OpenRouter (DeepSeek V3 / LLaMA 3.3 70B) Fallback
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orResult = await executeWithOpenRouter(queryPrompt, studySysInstruction, 0.25);
        if (orResult && orResult.text) {
          return res.json({
            text: orResult.text,
            status: "success",
            provider: "openrouter",
            model: orResult.model,
            toolKey: toolKey || "study-tool"
          });
        }
      }

      return res.status(503).json({
        error: "All AI study inference services temporarily busy. Please check keys in Settings.",
        status: "error"
      });
    } catch (err: any) {
      console.error("Study Tool Server Error:", err);
      return res.status(500).json({ error: err.message || "Failed to process study tool" });
    }
  });

  // Dedicated Oxford-Grade Academic Dictionary & Lexicon Endpoint
  app.post("/api/dictionary", async (req, res) => {
    try {
      const { word, context, subjectDomain } = req.body;
      if (!word || typeof word !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'word' field in request body." });
      }

      const cleanWord = word.trim().replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
      if (!cleanWord) {
        return res.status(400).json({ error: "Word cannot be empty" });
      }

      const lexiconSysInstruction = `You are a master lexicographer, etymologist, and academic vocabulary specialist (Oxford, Cambridge, and Merriam-Webster standard).
Your goal is to provide 100% factually accurate, structured vocabulary analysis for students and researchers.

STRICT LINGUISTIC RULES:
1. CONTEXTUAL GRAMMATICAL DISAMBIGUATION:
   - If a sentence context is provided, analyze the EXACT grammatical role and meaning of "${cleanWord}" in that specific sentence first.
   - Example 1: In "The Mauryan king Ashoka was the first person to issue inscriptions" or "The king issue the rules", "issue" is used as a VERB meaning "to officially release, publish, make available, or circulate" (Hindi: जारी करना / प्रकाशित करना). It is NOT a Noun (problem/matter).
   - Example 2: In "We must address the environmental issue", "issue" is used as a NOUN meaning "an important problem or topic under discussion" (Hindi: मुद्दा / समस्या).
   - When context is provided:
     * Set "primaryPos" to the EXACT part of speech used in that sentence (e.g. "Verb" or "Noun").
     * Set "contextMeaning" to its precise definition in that sentence.
     * Set "hindiMeaning" to the Hindi translation corresponding to that contextual grammatical role.
     * In the "partsOfSpeech" array, place the contextual part of speech as the FIRST item.

2. MULTI-PARTS OF SPEECH SEPARATION (REAL PARTS OF SPEECH ONLY):
   - Provide a distinct object in "partsOfSpeech" for EVERY VALID formal dictionary part of speech of this word (e.g., for "issue": Noun and Verb).
   - For EACH part of speech:
     * "pos": "Noun" | "Verb" | "Adjective" | "Adverb" | "Preposition" (only standard parts of speech).
     * "definition": Textbook Oxford/Cambridge academic definition for this specific POS.
     * "hindiMeaning": Accurate Hindi translation (हिंदी अर्थ in Devanagari script) for this POS.
     * "example": Scholarly example sentence demonstrating this POS.
     * "synonyms": 4-6 authentic, accurate synonyms strictly belonging to this POS.
     * "antonyms": 2-4 authentic antonyms strictly belonging to this POS.
     * "grammar": Exact inflections (singular/plural for Nouns, V1/V2/V3/ing/s for Verbs, Positive/Comparative/Superlative for Adjectives).

3. BAN SPURIOUS OR SLANG PARTS OF SPEECH:
   - NEVER invent or include non-standard, slang, or fake parts of speech (e.g. "issue" is NOT an Adjective; do NOT output an Adjective object for "issue").
   - Do NOT classify idioms or phrases as separate parts of speech.

4. Strict JSON Output:
   - Output ONLY a valid JSON object matching the schema. No markdown formatting.`;

      const lexiconPrompt = `Analyze the academic word "${cleanWord}"${context ? ` in the context of this sentence: "${context}"` : ""}${subjectDomain ? ` (Subject: ${subjectDomain})` : ""}.

Return ONLY a valid raw JSON object with this exact structure:
{
  "word": "${cleanWord}",
  "phonetic": "IPA phonetic notation (e.g. /ˈɪʃuː/)",
  "primaryPos": "Noun or Verb (match context if provided)",
  "hindiMeaning": "Hindi meaning matching primaryPos (Devanagari script)",
  "contextMeaning": "Exact meaning in the sentence (if context provided)",
  "academicDefinition": "Primary Oxford/Cambridge academic definition matching primaryPos",
  "simpleExplanation": "Simple 1-sentence plain-English breakdown using the Feynman technique",
  "academicExample": "Academic or textbook example sentence",
  "commonPitfall": "Confusable pair, false friend, or examiner trap",
  "etymology": "Root origin and language history",
  "partsOfSpeech": [
    {
      "pos": "Noun",
      "definition": "Precise definition when used as a Noun",
      "hindiMeaning": "हिंदी अर्थ as Noun",
      "example": "Sentence demonstrating usage as a Noun",
      "synonyms": ["noun_synonym_1", "noun_synonym_2", "noun_synonym_3", "noun_synonym_4"],
      "antonyms": ["noun_antonym_1", "noun_antonym_2"],
      "grammar": {
        "singular": "${cleanWord}",
        "plural": "${cleanWord}s"
      }
    },
    {
      "pos": "Verb",
      "definition": "Precise definition when used as a Verb",
      "hindiMeaning": "हिंदी अर्थ as Verb",
      "example": "Sentence demonstrating usage as a Verb",
      "synonyms": ["verb_synonym_1", "verb_synonym_2", "verb_synonym_3", "verb_synonym_4"],
      "antonyms": ["verb_antonym_1", "verb_antonym_2"],
      "grammar": {
        "v1": "${cleanWord}",
        "v2": "past form",
        "v3": "past participle form",
        "ing": "-ing form",
        "s": "-s/-es form"
      }
    }
  ],
  "synonyms": ["synonym_1", "synonym_2", "synonym_3", "synonym_4"],
  "antonyms": ["antonym_1", "antonym_2"]
}`;

      // 1. Try Gemini Key Pool with ultra-fast 'gemini-3.1-flash-lite'
      if (keyPool.hasAnyKey()) {
        try {
          const result = await executeWithGeminiPool('study', lexiconPrompt, {
            targetModel: "gemini-3.1-flash-lite",
            temperature: 0.05,
            systemInstruction: lexiconSysInstruction,
            responseMimeType: "application/json",
          });

          if (result && result.text) {
            try {
              const cleaned = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              return res.json({
                data: parsed,
                status: "success",
                provider: "gemini",
                model: result.model,
              });
            } catch (pErr) {
              console.warn("Gemini JSON parse fallback for dictionary:", pErr);
            }
          }
        } catch (gErr: any) {
          console.warn("[Dictionary] Gemini pool notice:", gErr.message);
        }
      }

      // 2. Fast Groq Fallback
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(lexiconPrompt, lexiconSysInstruction, 0.1);
        if (groqText) {
          try {
            const cleaned = groqText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return res.json({
              data: parsed,
              status: "success",
              provider: "groq",
              model: "gpt-oss-120b",
            });
          } catch (pErr) {}
        }
      }

      // 3. OpenRouter Fallback
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orResult = await executeWithOpenRouter(lexiconPrompt, lexiconSysInstruction, 0.1);
        if (orResult && orResult.text) {
          try {
            const cleaned = orResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            return res.json({
              data: parsed,
              status: "success",
              provider: "openrouter",
              model: orResult.model,
            });
          } catch (pErr) {}
        }
      }

      return res.status(503).json({
        error: "Dictionary inference service temporarily unavailable.",
        status: "error",
      });
    } catch (err: any) {
      console.error("Dictionary Endpoint Error:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch dictionary definition" });
    }
  });

  // Verify / Test Custom User Gemini API Key
  app.post("/api/gemini/validate", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
        return res.status(400).json({ valid: false, error: "Please enter a valid Gemini API key" });
      }

      // Validate by listing models (works for any valid key, independent of model availability).
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      let gr: Response;
      try {
        gr = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { "x-goog-api-key": apiKey.trim() },
          signal: ctl.signal,
        });
      } finally { clearTimeout(timer); }
      if (gr.ok) {
        return res.json({ valid: true, message: "Key verified successfully!" });
      }
      let detail = "";
      try { const j: any = await gr.json(); detail = j?.error?.message || ""; } catch {}
      const bad = gr.status === 400 || gr.status === 401 || gr.status === 403;
      return res.status(bad ? 400 : 502).json({
        valid: false,
        error: bad
          ? `Google ne key reject ki (${gr.status}): ${detail || "invalid key"}`
          : `Google se jawab nahi mila (${gr.status}): ${detail || "try again"}`,
      });
    } catch (err: any) {
      console.warn("Key validation failed:", err.message);
      return res.status(502).json({ valid: false, error: `Server se Google tak pahunch nahi paaya: ${err?.name === "AbortError" ? "timeout" : (err?.message || err?.cause?.message || "network error")}` });
    }
  });

  // Universal Multi-Provider AI Generation Endpoint
  app.post("/api/ai", async (req, res) => {
    try {
      const { prompt, systemInstruction, model, temperature, customKey } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'prompt' field in request body." });
      }

      // Tier 1: Google Gemini Models via Multi-Key Pool (or user BYOK custom key)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('general', prompt, {
            systemInstruction,
            targetModel: model || "gemini-3.1-flash-lite",
            temperature,
            customKey,
          });

          if (result && result.text) {
            return res.json({
              text: result.text,
              status: "success",
              provider: "gemini",
              model: result.model,
              keySlot: result.keyTag,
            });
          }
        } catch (gErr: any) {
          console.warn("Gemini service execution notice:", gErr.message);
        }
      }

      // Tier 2: Groq API (if configured)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(prompt, systemInstruction, typeof temperature === "number" ? temperature : 0.3);
        if (groqText) {
          return res.json({ text: groqText, status: "success", provider: "groq", model: "gpt-oss-120b" });
        }
      }

      // Tier 3: OpenRouter API (if configured in environment)
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orResult = await executeWithOpenRouter(prompt, systemInstruction, typeof temperature === "number" ? temperature : 0.3);
        if (orResult && orResult.text) {
          return res.json({ text: orResult.text, status: "success", provider: "openrouter", model: orResult.model });
        }
      }

      return res.status(503).json({
        error: "No AI provider configured. Please provide GEMINI_API_KEY in Settings.",
        status: "error"
      });
    } catch (err: any) {
      console.error("AI Server Error:", err);
      return res.status(500).json({
        error: err.message || "Failed to generate AI response",
        status: "error",
      });
    }
  });

  // S.A.Y.A.D. AI - Intelligent, Conversational, and Document-Aware Super AI
  app.post("/api/ai/hybrid-tutor", async (req, res) => {
    try {
      const {
        userQuestion,
        docTitle,
        currentPage,
        totalPages,
        chapterText,
        fullContext,
        persona,
        language,
        chatHistory,
        customKey,
        preferredEngine,
        stream,
        explanationStyle,
        detectedChapterNumber,
        detectedChapterTitle,
        detectedChapterType,
        chapterStartPage,
        chapterEndPage,
        needsClarification
      } = req.body;

      if (!userQuestion) {
        return res.status(400).json({ error: "Missing userQuestion" });
      }

      const hasChatHistory = Array.isArray(chatHistory) && chatHistory.length > 0;
      const lastAssistantMsg = hasChatHistory ? [...chatHistory].reverse().find((m: any) => m && m.role === 'assistant' && m.text) : null;
      const lastText = (lastAssistantMsg?.text || '').toLowerCase();
      const hasContinuationPrompt = /\b(?:shall\s+i\s+continue|shal\s+i\s+continue|checkpoint\s*\d+|part\s*1\s*complete|type\s*['"]?continue['"]?|would\s+you\s+like\s+me\s+to\s+continue)\b/i.test(lastText);

      const isTeachMeRequest = /\b(?:teach\s+me|padhao|teach\s+this|teach\s+chapter|interactive\s+tutor|masterclass)\b/i.test(userQuestion);
      const isSummaryRequest = !isTeachMeRequest && (/\b(?:summarise|summarize|summary|gist|overview)\s*(?:this|is|the)?\s*(?:chapter|module|lesson|unit)?\b/i.test(userQuestion) || /\b(?:chapter|module)\s*(?:summary|summarise|summarize)\b/i.test(userQuestion));
      const isContinuationRequest = (hasChatHistory && (hasContinuationPrompt || /^(?:continue|shal\s+i\s+continue|shall\s+i\s+continue|yes|haan|ha|next|go\s+on|go\s+ahead|aur\s+batao|proceed|part\s*2|agla|agle|aage|aur\s+detail)\b/i.test(userQuestion.trim().toLowerCase()))) || /\b(?:shal\s+i\s+continue|shall\s+i\s+continue)\b/i.test(userQuestion);

      const userLang = detectUserLanguage(userQuestion);

      // Clarification check: Do NOT block or interrupt the conversation with canned error messages.
      // If user asks to summarize/teach without explicit context, let Gemini answer with whatever chapter/document context is provided.

      // 1. Check if user is sending a casual greeting / pleasantry
      if (!isContinuationRequest && isGreeting(userQuestion, hasChatHistory)) {
        let greetingReply = "";
        if (userLang === "Hinglish") {
          greetingReply = "Hey! Main bilkul badhiya hoon. Aap batao, aaj kya padhna ya discuss karna chahte ho — koi concept samajhna hai, questions solve karne hain, ya koi topic detail me dekhna hai?";
        } else if (userLang === "Hindi") {
          greetingReply = "नमस्ते! मैं बिल्कुल ठीक हूँ। आज आपकी पढ़ाई में मैं किस प्रकार मदद कर सकता हूँ? कोई अध्याय, प्रश्न या विषय समझना हो तो बताइए।";
        } else {
          greetingReply = "Hey! How's your study session going? What are we working on or exploring today?";
        }

        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.write(`data: ${JSON.stringify({ chunk: greetingReply })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true, fullText: greetingReply })}\n\n`);
          return res.end();
        }

        return res.json({
          text: greetingReply,
          status: "success",
          engine: "conversational-tutor"
        });
      }

      // 1.1. Check if user is sending an acknowledgement / pleasantry (e.g. "theek hai", "ok", "samajh gaya")
      // Do NOT hijack answers when user is responding to an active conversation thread or continuation prompt!
      if (!isContinuationRequest && isConversationalPleasantry(userQuestion, hasContinuationPrompt, hasChatHistory)) {
        let ackReply = "";
        if (userLang === "Hinglish") {
          ackReply = "Badhiya! Aur koi concept samajhna ho ya koi specific question/diagram dekhna ho, toh batao — main yahin hoon.";
        } else if (userLang === "Hindi") {
          ackReply = "बहुत बढ़िया! यदि कोई अन्य अवधारणा, प्रश्न या आरेख समझना हो, तो बताएं।";
        } else {
          ackReply = "Great! Feel free to ask anytime if you want to explore more concepts or diagrams.";
        }

        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          res.write(`data: ${JSON.stringify({ chunk: ackReply })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true, fullText: ackReply })}\n\n`);
          return res.end();
        }

        return res.json({
          text: ackReply,
          status: "success",
          engine: "conversational-tutor"
        });
      }

      // 2. Check if user specifically asks for an interactive flowchart / concept diagram / mindmap
      const isFlowchartRequest = /\b(?:flowchart|flow\s+chart|mindmap|mind\s+map|concept\s+map)\b/i.test(userQuestion) || (/\b(?:banao|dikhao|dikha|create|draw|generate|visualize)\b/i.test(userQuestion) && /\b(?:flowchart|flow\s+chart|mindmap|mind\s+map)\b/i.test(userQuestion));

      if (isFlowchartRequest) {
        try {
          const userLang = detectUserLanguage(userQuestion);
          const resolvedSubject = extractAcademicSubject(userQuestion, chatHistory, docTitle) || userQuestion;
          console.log(`[Flowchart Request] Query: "${userQuestion}", Subject: "${resolvedSubject}"`);

          const flowchartPrompt = `You are a world-class academic tutor and visual concept designer.
The student requested an interactive academic flowchart for: "${resolvedSubject}".
Topic & Context to portray: ${resolvedSubject}. (Ensure diagram and explanation are strictly focused on ${resolvedSubject} and its actual stages/milestones/lifecycle).
Language to use: ${userLang === "Hinglish" ? "Natural Conversational Hinglish (Roman Hindi + English terms)" : userLang === "Hindi" ? "Pure Hindi (Devanagari)" : "Fluent Academic English"}.

MANDATORY RULES:
1. First, provide a clean, valid Mermaid.js flowchart in a \`\`\`mermaid code block.
   - Use 'flowchart TD' (Top-to-Down).
   - Use simple node IDs (A, B, C, D, E1, E2).
   - Put clear, descriptive labels inside square brackets, e.g.:
     A["1. Stage Name: Clear Action/Input"] --> B["2. Next Stage: Description"]
   - Do NOT use special characters, quotes, or unescaped parentheses inside bracket labels.
2. Directly below the diagram, provide a thorough, step-by-step academic breakdown:
   - Explain what happens at each stage of this process.
   - Detail the underlying mechanism, inputs, outputs, and cause-and-effect relationships.
   - Highlight high-yield exam takeaways and key scoring concepts.
3. No introductory greetings or meta-filler. Start directly with the flowchart!`;

          if (stream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            if (typeof res.flushHeaders === "function") res.flushHeaders();

            let streamedFlowchart = "";
            const streamResult = await executeWithGeminiPoolStream(
              'chat',
              flowchartPrompt,
              (chunk) => {
                streamedFlowchart += chunk;
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
              },
              {
                systemInstruction: `You are an expert visual educator. Create clean, valid Mermaid.js flowcharts and thorough explanations. Language: ${userLang}.`,
                targetModel: "gemini-3.1-flash-lite",
                temperature: 0.2,
                customKey,
              }
            );

            if (streamResult && streamedFlowchart.trim().length > 0) {
              res.write(`data: ${JSON.stringify({ done: true, fullText: sanitizeAIResponse(streamedFlowchart.trim()), engine: "flowchart-generator" })}\n\n`);
              return res.end();
            }
          }

          let flowchartResult = "";
          if (keyPool.hasAnyKey() || customKey) {
            const expResult = await executeWithGeminiPool('chat', flowchartPrompt, {
              systemInstruction: `You are an expert visual educator. Create clean, valid Mermaid.js flowcharts and thorough explanations. Language: ${userLang}.`,
              targetModel: "gemini-3.1-flash-lite",
              temperature: 0.2,
              customKey,
            });
            flowchartResult = expResult?.text || "";
          } else if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
            const expResult = await executeWithOpenRouter(flowchartPrompt, "You are an expert visual educator.", 0.2);
            flowchartResult = expResult?.text || "";
          }

          if (flowchartResult) {
            return res.json({
              text: sanitizeAIResponse(flowchartResult),
              status: "success",
              engine: "flowchart-generator"
            });
          }
        } catch (fcErr) {
          console.warn("Flowchart generation error:", fcErr);
        }
      }

      // 3. Check if user specifically asks for an image / visual diagram / illustration / picture / map / portrait
      const hasExplicitVisualWord = /\b(?:image|images|imag|imge|img|imgs|imeg|imaj|picture|pictures|pic|pics|pix|photo|photos|foto|fotos|tasveer|tasvir|chitra|portrait|potrait|portait|portret|diagram|diagrams|naksha|map|maps|visual|visuals|illustration|figure|drawing)\b/i.test(userQuestion);
      const hasVisualCommand = /\b(?:generate|create|draw|fetch|send|bhejo)\s+(?:an?\s+)?(?:image|picture|photo|illustration|drawing|map|diagram|portrait|tasveer|chitra|naksha)\b/i.test(userQuestion) ||
        /\b(?:image|picture|photo|illustration|drawing|map|diagram|portrait|tasveer|chitra|naksha)\s*(?:dikhao|banao|bhejo|dikha|bana|generate|create)\b/i.test(userQuestion);

      const isImageRequest = !isFlowchartRequest && (hasExplicitVisualWord || hasVisualCommand);

      if (isImageRequest) {
        try {
          const userLang = detectUserLanguage(userQuestion);
          const resolvedSubject = extractAcademicSubject(userQuestion, chatHistory, docTitle);
          console.log(`[Visual Request] Query: "${userQuestion}", Resolved Subject: "${resolvedSubject}"`);

          const hasPronoun = anaphoricPronounsRegex.test(userQuestion);
          const targetVisualSubject = (hasPronoun && resolvedSubject) ? resolvedSubject : (resolvedSubject || userQuestion);
          const netImg = await fetchEducationalInternetImage(targetVisualSubject, resolvedSubject);
          if (netImg && netImg.imageUrl) {
            let explanation = "";
            const visualLangInstruction = userLang === "Hinglish"
              ? "Explain this visual in natural, conversational Hinglish (Roman Hindi + English). Do NOT write in pure English."
              : userLang === "Hindi"
              ? "Explain this visual in pure, articulate Hindi (Devanagari)."
              : "Explain this visual in fluent, academic English.";

            const visualContextPrompt = `The student requested an educational visual for: "${netImg.title}".
We are displaying an authentic educational archive visual titled "${netImg.title}".
${visualLangInstruction}

Write a comprehensive, high-yield academic breakdown:
### 🏛️ ${netImg.title} — Key Analysis & Context

Provide:
1. **Visual Context & Key Elements**: Explain what this authentic visual portrays, key individuals/structures visible, and setting.
2. **Historical / Scientific Background**: Deep, authoritative explanation of why this figure/event/concept is significant.
3. **Core Facts & Exam Takeaways**: Key dates, achievements, formulas, or points examiners ask in tests.

Strictly NO greetings, NO filler, and start directly with the analysis.`;

            try {
              if (keyPool.hasAnyKey() || customKey) {
                const expResult = await executeWithGeminiPool('chat', visualContextPrompt, {
                  targetModel: "gemini-3.1-flash-lite",
                  temperature: 0.25,
                  customKey,
                });
                explanation = expResult?.text || netImg.description || "";
              } else if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
                const expResult = await executeWithOpenRouter(visualContextPrompt, "You are an elite academic educator.", 0.25);
                explanation = expResult?.text || netImg.description || "";
              }
            } catch (expErr) {
              explanation = netImg.description || "";
            }

            const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(netImg.imageUrl)}&subject=${encodeURIComponent(netImg.title)}`;
            const combinedText = `![${netImg.title}](${proxyUrl})\n\n${explanation}`;
            return res.json({
              text: sanitizeAIResponse(combinedText),
              status: "success",
              engine: "authentic-educational-archive",
              hasImage: true
            });
          }

          // Fallback to Generative AI Image if configured and specific prompt exists
          if (resolvedSubject && (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI)) {
            const imgResult = await generateAIImage(resolvedSubject);
            if (imgResult && imgResult.imageUrl) {
              let explanation = "";
              try {
                const expResult = await executeWithOpenRouter(
                  `Provide a concise educational breakdown for visual: "${resolvedSubject}". Bullet points only.`,
                  "You are an expert academic educator."
                );
                explanation = expResult?.text || "";
              } catch(e) {}

              const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imgResult.imageUrl)}&subject=${encodeURIComponent(resolvedSubject)}`;
              const combinedText = `![${imgResult.description || resolvedSubject}](${proxyUrl})\n\n${explanation}`;
              return res.json({
                text: sanitizeAIResponse(combinedText),
                status: "success",
                engine: "openrouter-gemini-image",
                hasImage: true
              });
            }
          }

          // If no specific image or subject was found, ask nicely instead of showing irrelevant images
          let guidanceMsg = "";
          if (userLang === "Hinglish") {
            guidanceMsg = "Aap kis specific topic, personality ya scientific concept ka map ya image dekhna chahte hain? (Jaise *World War 1 alliances map*, *Albert Einstein portrait*, ya *Plant cell diagram*). Topic ka naam likhein, main turant visual display kar dunga!";
          } else if (userLang === "Hindi") {
            guidanceMsg = "आप किस विशिष्ट विषय, व्यक्तित्व या वैज्ञानिक अवधारणा का मानचित्र या चित्र देखना चाहते हैं? (जैसे *प्रथम विश्व युद्ध का नक्शा*, *अल्बर्ट आइंस्टीन का चित्र*, या *पादप कोशिका का आरेख*)। विषय का नाम बताएं, मैं तुरंत प्रस्तुत करूँगा!";
          } else {
            guidanceMsg = "Which specific topic, historical figure, or concept would you like a visual of? (e.g., *World War 1 map*, *Albert Einstein portrait*, *Plant cell diagram*). Let me know the topic and I'll display it right away!";
          }

          return res.json({
            text: guidanceMsg,
            status: "success",
            engine: "tutor-guidance"
          });
        } catch (imgErr: any) {
          console.warn("Visual generation fallback to standard text:", imgErr?.message);
        }
      }

      // Format conversation history for multi-turn conversational context (up to 20 turns)
      let historyFormatted = '';
      if (Array.isArray(chatHistory) && chatHistory.length > 0) {
        const recentTurns = chatHistory.slice(-20).filter((m: any) => m && m.text && m.text !== '…');
        if (recentTurns.length > 0) {
          historyFormatted = `### RECENT CONVERSATION HISTORY (Active Multi-Turn Dialogue Context):
${recentTurns.map((m: any) => `${m.role === 'user' ? 'Student' : 'AI Assistant'}: ${m.text}`).join('\n\n')}
`;
        }
      }

      const isDocQuery = isDocumentSpecificQuery(userQuestion, docTitle) || Boolean(docTitle && docTitle !== 'global_chat' && (chapterText || fullContext));
      const resolvedSubject = extractAcademicSubject(userQuestion, chatHistory, docTitle);
      const liveInternetGrounding = !isDocQuery ? await fetchLiveInternetGrounding(resolvedSubject || userQuestion) : "";

      const hybridPrompt = `You are an elite, state-of-the-art AI Super-Intelligence and Universal Academic Professor — operating with the exact intelligence, sharp intuition, and natural conversational mastery of ChatGPT (GPT-4o) and Claude (Sonnet 3.5).

${persona ? `### ACTIVE PERSONA / STYLE:\n${persona}\n` : ''}
### CRITICAL: STRICT LANGUAGE & SCRIPT MIRRORING (CHATGPT / CLAUDE / GEMINI FEEL):
The student is communicating in: ${userLang}.

YOU MUST STRICTLY MIRROR THE STUDENT'S EXACT LANGUAGE AND SCRIPT:

1. **IF HINGLISH (Roman Hindi/Urdu mixed with English, e.g. "bhai ye samjha de", "world war 1 kyu hua tha", "is concept ke main points batao", "kaise karein", "aur detail me batao", "yeh sab kya hai")**:
   - YOU MUST WRITE IN CONVERSATIONAL HINGLISH (Latin alphabet Roman Hindi mixed with standard English terms).
   - Talk like an intelligent, friendly mentor or senior professor chatting in natural Hinglish.
   - Example tone:
     "Dekho, World War 1 ke shuru hone ke peeche 4 sabse bade reasons the jise hum M-A-I-N formula kehte hain:
     - **Militarism (सैन्यीकरण)**: Har European country apni sena aur weapons badhane me lagi thi...
     - **Alliances (गठजोड़)**: Europe do bade camps me divide ho gaya tha..."
   - ❌ NEVER reply in pure English when the student speaks in Hinglish!
   - ❌ NEVER reply in Devanagari Hindi when the student speaks in Hinglish!

2. **IF HINDI (Devanagari, e.g. "यह कैसे काम करता है?", "प्रथम विश्व युद्ध के क्या कारण थे?")**:
   - YOU MUST REPLY IN PURE, ELEGANT HINDI in Devanagari script.

3. **IF ENGLISH (e.g. "Explain the core causes of WW1", "Summarize page 16")**:
   - YOU MUST REPLY IN FLUENT, POLISHED ACADEMIC ENGLISH.

### ABSOLUTE CONVERSATIONAL DIRECTIVES:

1. **ZERO INTRODUCTORY FLUFF & ZERO PREAMBLES**:
   - NEVER start responses with filler like: "Certainly!", "That's a great question!", "I'd be happy to explain...", "It seems you'd like to dive deeper...", or meta-commentary.
   - Start IMMEDIATELY with the core substance and high-impact knowledge.
   - When the student says "Detail me", "aur batao", "explain more", or asks a follow-up, jump DIRECTLY into the deeper breakdown without any filler.

2. **EXTERNAL KNOWLEDGE & ZERO BOOK APOLOGIES (FOR GENERAL QUESTIONS)**:
   - If the student asks about World War, Physics, Science, Programming, History, Personalities (e.g. Albert Einstein), or ANY general academic topic outside the book: Answer with complete, authoritative, world-class depth, just like ChatGPT or Claude.
   - NEVER say: "Since your current textbook is...", "Your book focuses on [Topic] and does not cover this...", "This is not in your book...", or "(External Knowledge / Book ke bahar se)".
   - NEVER ask the student for page numbers or say "this does not appear in the text" on general academic questions.

3. **RESPONSE DEPTH, CONVERSATIONAL NATURALNESS & ZERO FORCED TEMPLATES**:
   - Provide a COMPREHENSIVE, HIGH-YIELD, and WELL-STRUCTURED answer that addresses the student's question directly with depth and clarity.
   - ❌ **NEVER FORCE BOILERPLATE TEMPLATE HEADERS**:
     - Do NOT forcefully append boilerplate template sections like "### 🎯 Exam & Scoring Takeaways", "### 💡 Pro-Tip", or "### Everyday Analogy" to every regular response.
     - ONLY include an Exam Takeaways section if the student explicitly asks for exam preparation, test questions, marks, or revision summaries, OR if the active explanation style is 'academic'.
     - Keep the conversation organic, natural, and directly focused on what the student asked.
   - **STYLE ADAPTATION (${explanationStyle || 'comprehensive'})**:
     ${explanationStyle === 'stepbystep' ? `
     - The student selected STEP-BY-STEP TUTORIAL style:
       Structure the answer as an intuitive, numbered, sequential walkthrough with clear stages, practical workflows, and real-world examples.
     ` : explanationStyle === 'academic' ? `
     - The student selected DEEP ACADEMIC ANALYSIS style:
       Deliver scholarly depth, theoretical foundations, underlying mechanics, critical analysis, and exam evaluation points.
     ` : `
     - The student selected COMPREHENSIVE BREAKDOWN style:
       Deliver a balanced, rich, highly articulate explanation with clear conceptual headers, authentic document citations ([Page X]), and intuitive clarity.
     `}

4. **CONVERSATIONAL FLUIDITY & MULTI-TURN MEMORY (CHATGPT / CLAUDE / GEMINI FEEL)**:
   - The student may ask follow-up questions in ANY natural conversational phrasing:
     - "author kon hai?" / "who wrote this?" / "kavi kaun hai?":
       Immediately inspect the currently discussed chapter's opening lines, title, or byline in the reference passages and name the author/poet with confidence.
     - "iske baad ka chapter konsa hai?" / "next chapter kya hai?":
       Check the Table of Contents or subsequent chapter markers in the reference passages and name the next chapter and its starting page.
     - "explain simply" / "isko explain simply" / "can you explain" / "I didn't get it" / "aur detail me" / "aur batao" / "isko thoda asaan bhasha me samjhao":
       Do NOT restart with repetitive greetings or boilerplate. Immediately re-explain the concept discussed in the prior turn using clear, intuitive everyday analogies, practical examples, and conversational ease.
   - You MUST seamlessly resolve pronouns ("isko", "ye", "this", "it", "author", "next chapter") based on the ongoing conversation history and the active loaded document.
   - Maintain complete conversational memory across all turns in this chat thread.

5. **CONTEXT SWITCHING & DISAMBIGUATION (ANTI-BLEEDING DIRECTIVE)**:
   - If the student previously discussed another subject in prior turns (e.g. History, Nationalism, Politics, Science) and now asks about the book or a chapter (e.g. "Chapter 1 explain karo", "Iss book ke chapter 1 ke bare me", "Iska chapter 1", "Ye story kya hai", "Isme kya hota hai"):
     - ❌ NEVER carry over previous conversation subjects (like Nationalism, History, or Science) into the book query!
     - The student is explicitly inquiring about their loaded textbook: "${docTitle || 'Active Document'}".
     - Ground your explanation STRICTLY on the attached document passages for "${docTitle || 'Active Document'}".
   - Only maintain thread continuity with previous external subjects if the student is continuing that specific discussion and NOT inquiring about their loaded document/chapter.

6. **AUTHENTIC DUAL-MODE DOCUMENT GROUNDING & ZERO HALLUCINATIONS**:
   - When the student asks about a chapter or lesson (e.g. "Chapter 8", "Lesson 8", "Chapter 1", Tourism), story, character, poem, or in-text question:
     - Ground your answer in the provided document passages with 100% precision.
     - Cite the exact page cleanly using \`[Page X]\` (e.g. \`[Page 9]\`, \`[Page 103]\`) so the student can jump to it.
     - **IN-TEXT / EXERCISE QUESTIONS (e.g. "chapter 8 intext questions 8.4 2b", "intext 8.4 2b", "8.4 2b")**:
       1. FIRST print the EXACT QUESTION statement from the textbook passages \`[Page X]\`.
       2. THEN provide the comprehensive, step-by-step verified solution/answer from the textbook's theory and answer key \`[Page Y]\`.
     - ❌ ABSOLUTELY NEVER hallucinate or assume chapter titles, authors, or stories from other curriculums or textbooks. Use ONLY the real facts and characters from the attached document!
     - When synthesizing dual-mode answers (inside textbook facts + broader real-world knowledge), clearly distinguish what the textbook states (\`[Page X]\`) versus broader modern academic context.

7. **MULTI-CHAPTER & GENERAL KNOWLEDGE FLEXIBILITY (NO CONFUSION GUARANTEE)**:
   - The student's active UI scope may be focused on a specific chapter or page, BUT:
     a) **If the student asks about a DIFFERENT chapter or another page of this book** (e.g. they have Chapter 1 focused, but ask "Chapter 4 me kya hai?", "Tell me about Bholi", "Explain page 140", or "What happens in Chapter 8?"):
        - Directly, authoritatively, and thoroughly answer about THAT requested chapter/page.
        - ❌ NEVER complain: "You have Chapter 1 selected", "This is from another chapter", "Confusion ho gayi thi", or "I cannot answer this".
        - ❌ NEVER give a 1-line or superficial summary! Provide a rich, detailed, academic breakdown.
     b) **If the student asks a general knowledge, science, history, coding, math, philosophical, or completely OFF-TOPIC question** (e.g. "What is photosynthesis?", "Newton's second law", "World War 1 causes", "Python loop kaise kaam karta hai", or life/study advice):
        - Answer with complete, rich, detailed, articulate academic mastery (just like ChatGPT or Claude).
        - ❌ NEVER say: "We are in XYZ PDF", "This book doesn't cover that", "Confusion ho gayi thi", or refuse to answer!
        - ❌ NEVER give a tiny superficial summary when a rich, structured explanation is needed! Maintain high analytical and educational depth.

${isTeachMeRequest ? `
### 🎓 MANDATORY "TEACH ME THIS CHAPTER" PROTOCOL (INTERACTIVE SOCRATIC MASTERCLASS):
The student asked you to TEACH them this chapter/module:
- Detected Subject: ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''} ${detectedChapterTitle ? `("${detectedChapterTitle}")` : ''} [Document Pages ${chapterStartPage || currentPage} to ${chapterEndPage || currentPage}].

PEDAGOGICAL TEACHING RULES:
1. **Header & Roadmap Announcement**:
   - Start immediately with:
     \`🎓 **Interactive Masterclass: ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''} — ${(detectedChapterTitle || 'Core Concepts').toUpperCase()}** [Pages ${chapterStartPage || currentPage} to ${chapterEndPage || currentPage}]\`
   - Provide an inspiring 2-sentence Big Picture: Why this chapter matters in real life, and the roadmap of the core pillars we will master together.
2. **Teach Section 1 (The Foundational Core)**:
   - Teach the first major conceptual section with clarity, crystal-clear definitions, and everyday analogies from the attached document.
   - Ground everything in the textbook passages \`[Page X]\`.
3. **Interactive Checkpoint 1 (Mandatory)**:
   - Conclude Section 1 with an engaging checkpoint question to verify the student's understanding before advancing:
     ---
     💡 **Checkpoint 1:**
     *[Ask 1 concise, thought-provoking question testing Section 1]*

     👉 *Type your answer, or simply type **'Next' / 'Continue'** whenever you're ready for Section 2!*
   - ❌ NEVER monologue through the whole chapter at once! Teach Section 1 first and pause at the checkpoint.
` : ''}

${isSummaryRequest ? `
### 📖 MANDATORY CHAPTER SUMMARY PROTOCOL ("SHALL I CONTINUE?" WORKFLOW):
The student requested a comprehensive summary of this chapter/module:
- Detected Subject: ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''} ${detectedChapterTitle ? `("${detectedChapterTitle}")` : ''} [Document Pages ${chapterStartPage || currentPage} to ${chapterEndPage || currentPage}].

SUMMARY PROTOCOL:
1. **Header**:
   \`📖 **Comprehensive Chapter Summary: ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''} — ${(detectedChapterTitle || 'Key Themes').toUpperCase()}** [Pages ${chapterStartPage || currentPage} to ${chapterEndPage || currentPage}]\`
2. **Part 1 Breakdown (High-Yield Substance)**:
   - **Central Theme & Objective**: What this chapter covers.
   - **Foundational Concepts & Core Terminology**: In-depth explanation of primary topics with page citations \`[Page X]\`.
   - **Key Mechanisms / Chronology**: Step-by-step breakdown of major processes or events.
3. **Continuation Checkpoint (Mandatory)**:
   - Conclude Part 1 with a clear, inviting continuation checkpoint:
     ---
     📌 **[Part 1 Complete]** I have covered the core themes and foundational concepts of ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''}.

     **Shall I continue** with Part 2 (In-Depth Sub-topics, Case Studies, and High-Yield In-Text Questions)?
     👉 *Type **'Continue'** or **'Yes'** to proceed to Part 2!*
` : ''}

${isContinuationRequest ? `
### ⏩ SEAMLESS DIALOGUE CONTINUATION WORKFLOW:
The student signaled to continue ("${userQuestion}"):
- Inspect the previous turn from conversation history.
- **If continuing an interactive Masterclass (Checkpoint response)**:
  1. Briefly validate the student's answer with warm encouragement and precision.
  2. Advance immediately to **Section 2 (Core Mechanics & Deep Concepts)** with rich textbook knowledge.
  3. Conclude Section 2 with **Checkpoint 2** (or ask *"Shall I continue with Section 3 / In-Text Solutions?"*).
- **If continuing from Part 1 of a Summary**:
  1. Deliver **Part 2: In-Depth Sub-topics, Case Studies & High-Yield Questions** immediately.
  2. ❌ NEVER repeat Part 1 or re-greet!
` : ''}

7. **NEVER NAG OR PUSH THE STUDENT TO RETURN TO THE BOOK**:
   - NEVER say: "Would you like to return to your textbook now?", "Ready to tackle Intext Questions on Page X?", or "Shall we go back to the lesson?".
   - Let the conversation flow naturally wherever the student's curiosity leads.

8. **TOP-NOTCH STRUCTURE & ACADEMIC VALUE**:
   - Use clean Markdown with bold concept names, structured bullet points, comparison tables (\`| Feature | A | B |\`) when comparing, and clean LaTeX math notation ($E = mc^2$, $F = ma$) for equations.
   - Deliver clear historical, scientific, or conceptual breakdowns with cause-and-effect clarity.

8. **ZERO REFUSALS ABOUT IMAGES, VISUALS, OR FILES**:
   - NEVER say: "Main yahan direct image/file nahi bhej sakta", "I cannot send images", or give a verbal excuse instead of helping.
   - Our system natively renders authentic educational visuals, Wikimedia archive images, and Mermaid flowcharts. Never claim you lack image capability.

### 📖 REFERENCE PASSAGES FROM CURRENT DOCUMENT ("${docTitle || 'Active Document'}" ${detectedChapterNumber ? `- ${detectedChapterType || 'Chapter'} ${detectedChapterNumber}` : ''}):
${(chapterText || fullContext) ? `${chapterText || fullContext}` : '(General/External Academic Inquiry — Answer authoritatively using complete intelligence and verified internet grounding)'}

${liveInternetGrounding ? `### 🌐 LIVE VERIFIED INTERNET KNOWLEDGE & ENCYCLOPEDIC GROUNDING:\n${liveInternetGrounding}\n` : ''}

=======================================================
### 💬 ACTIVE MULTI-TURN CONVERSATION THREAD:
${historyFormatted ? historyFormatted : '(Beginning of conversation)'}
=======================================================

STUDENT INQUIRY:
- Current Message: "${userQuestion}"
- Active Study Target: "${docTitle || 'Academic Chat'}" (${detectedChapterType || 'Chapter'} ${detectedChapterNumber || 'Active Section'})

### 📌 MANDATORY MULTI-TURN CONTEXT CONTINUITY DIRECTIVES:
1. Maintain 100% UNBROKEN CONVERSATION CONTINUITY with the active dialogue thread above.
2. When the student asks follow-up questions, responds to checkpoints, or says "continue", "aur samjhao", "ye kya hai", "point 2", stay strictly anchored to what was just discussed and the active chapter (${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''}).
3. **IF THE STUDENT GIVES FEEDBACK ABOUT CONTEXT OR MIX-UP (e.g. "context yaad nahi rakh raha", "mix-up ho raha hai", "galat bata rahe ho", "kiske bare me baat ho rahi hai", "pehle root cause dekho")**:
   - Immediately and warmly acknowledge this in natural ${userLang}.
   - Re-anchor the student clearly: State the exact document and chapter you are actively studying ("${docTitle || 'Document'}" — ${detectedChapterType || 'Chapter'} ${detectedChapterNumber || ''}).
   - Briefly summarize the true topic under discussion and smoothly ask how they would like to proceed (e.g., continue Part 2, review a specific section, or ask a question).
   - Zero boilerplate, zero generic excuses — just clear, intelligent, transparent recovery!
4. Strictly mirror the student's language (${userLang}).

Provide the complete, direct, exhaustive high-intelligence answer now in ${userLang}:`;

      // Specific user engine preference handling
      if ((preferredEngine === 'deepseek' || preferredEngine === 'openrouter-deepseek') && (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI)) {
        const orResult = await executeWithOpenRouter(hybridPrompt, "You are the S.A.Y.A.D. Super-Tutor Lead Academic Professor.", 0.25, "deepseek/deepseek-chat");
        if (orResult && orResult.text) {
          return res.json({ text: sanitizeAIResponse(orResult.text), status: "success", engine: "deepseek-v3", provider: "openrouter" });
        }
      }

      if ((preferredEngine === 'llama' || preferredEngine === 'openrouter-llama') && (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI)) {
        const orResult = await executeWithOpenRouter(hybridPrompt, "You are the S.A.Y.A.D. Super-Tutor Lead Academic Professor.", 0.25, "meta-llama/llama-3.3-70b-instruct");
        if (orResult && orResult.text) {
          return res.json({ text: sanitizeAIResponse(orResult.text), status: "success", engine: "openrouter-llama-3.3-70b", provider: "openrouter" });
        }
      }

      // Real-Time SSE Streaming Delivery if requested
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        let streamedHybridText = "";
        const streamResult = await executeWithGeminiPoolStream(
          'chat',
          hybridPrompt,
          (chunk) => {
            streamedHybridText += chunk;
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          },
          {
            systemInstruction: `You are an elite, state-of-the-art AI Super-Intelligence operating with the exact intelligence, sharp intuition, and natural conversational mastery of ChatGPT (GPT-4o) and Claude (Sonnet 3.5). Strictly match the student's language: Hinglish if they talk in Hinglish, Hindi if in Hindi, and English if in English.`,
            targetModel: "gemini-3.1-flash-lite",
            temperature: 0.25,
            customKey,
          }
        );

        if (streamResult && streamedHybridText.trim().length > 0) {
          res.write(`data: ${JSON.stringify({ done: true, fullText: sanitizeAIResponse(streamedHybridText.trim()), engine: streamResult.model })}\n\n`);
          return res.end();
        }

        // Fallback to non-streaming if stream yielded nothing
        const fallbackRes = await executeWithGeminiPool('chat', hybridPrompt, {
          systemInstruction: `You are an elite AI Super-Intelligence. Strictly match student language.`,
          targetModel: "gemini-3.1-flash-lite",
          temperature: 0.25,
          customKey,
        });

        const fallbackText = sanitizeAIResponse(fallbackRes?.text || "");
        if (fallbackText) {
          res.write(`data: ${JSON.stringify({ chunk: fallbackText })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true, fullText: fallbackText, engine: fallbackRes?.model })}\n\n`);
          return res.end();
        }

        // Tier 2 Fallback: Groq Ultra-Fast Llama 3.3 70B
        if (process.env.GROQ_API_KEY) {
          try {
            const groqReply = await executeWithGroq(hybridPrompt, "You are an elite academic professor.", 0.25);
            if (groqReply) {
              const cleanGroq = sanitizeAIResponse(groqReply);
              res.write(`data: ${JSON.stringify({ chunk: cleanGroq })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true, fullText: cleanGroq, engine: "groq-llama-3.3-70b" })}\n\n`);
              return res.end();
            }
          } catch(e) {}
        }

        // Tier 3 Fallback: OpenRouter
        if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
          try {
            const orResult = await executeWithOpenRouter(hybridPrompt, "You are an elite academic professor.", 0.25);
            if (orResult && orResult.text) {
              const cleanOr = sanitizeAIResponse(orResult.text);
              res.write(`data: ${JSON.stringify({ chunk: cleanOr })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true, fullText: cleanOr, engine: "openrouter" })}\n\n`);
              return res.end();
            }
          } catch(e) {}
        }

        res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
        return res.end();
      }

      // Tier 1: Try Gemini Key Pool with powerful models (Dedicated Chat Pool with 5 keys or user customKey)
      if (keyPool.hasAnyKey() || customKey) {
        try {
          const result = await executeWithGeminiPool('chat', hybridPrompt, {
            systemInstruction: `You are an elite, state-of-the-art AI Super-Intelligence operating with the exact intelligence, sharp intuition, and natural conversational mastery of ChatGPT (GPT-4o) and Claude (Sonnet 3.5). Strictly match the student's language: Hinglish if they talk in Hinglish, Hindi if in Hindi, and English if in English.`,
            targetModel: "gemini-3.1-flash-lite",
            temperature: 0.25,
            customKey,
          });

          if (result && result.text) {
            return res.json({
              text: sanitizeAIResponse(result.text),
              status: "success",
              engine: result.model.startsWith("gemini-") ? result.model : `gemini-${result.model}`,
              keySlot: result.keyTag,
            });
          }
        } catch (geminiInitErr: any) {
          console.warn("Gemini service init warning:", geminiInitErr.message);
        }
      }

      // Tier 2: OpenRouter DeepSeek V3 / LLaMA 3.3 70B (State of the art reasoning & fast responses)
      if (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_AI) {
        const orResult = await executeWithOpenRouter(
          hybridPrompt,
          "You are an elite AI Super-Intelligence operating with the exact intelligence and natural conversational mastery of ChatGPT (GPT-4o) and Claude (Sonnet 3.5). Strictly match the user's language (Hinglish/Hindi/English).",
          0.25,
          "deepseek/deepseek-chat"
        );
        if (orResult && orResult.text) {
          return res.json({
            text: sanitizeAIResponse(orResult.text),
            status: "success",
            engine: `openrouter-${orResult.model.split('/').pop()}`,
            provider: "openrouter"
          });
        }
      }

      // Tier 3: Open-Source LLaMA / GPT on Groq (High speed, instant responses)
      if (process.env.GROQ_API_KEY) {
        const groqText = await executeWithGroq(hybridPrompt, "You are the S.A.Y.A.D. Super-Tutor Lead Academic Professor.", 0.3);
        if (groqText) {
          return res.json({ text: sanitizeAIResponse(groqText), status: "success", engine: "groq-gpt-oss-120b" });
        }
      }

      return res.status(500).json({ error: "All AI inference engines temporarily unavailable." });
    } catch (err: any) {
      console.error("Hybrid Tutor Server Error:", err);
      return res.status(500).json({ error: err.message || "Failed to generate hybrid AI response" });
    }
  });

  // Dedicated AI Visual Generation Endpoint
  app.post("/api/ai/image", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "Prompt string is required for image generation" });
      }

      // 1. First try authentic free educational internet media (Wikipedia / Wikimedia Commons)
      const netImg = await fetchEducationalInternetImage(prompt);
      if (netImg && netImg.imageUrl) {
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(netImg.imageUrl)}&subject=${encodeURIComponent(netImg.title)}`;
        return res.json({
          status: "success",
          imageUrl: proxyUrl,
          title: netImg.title,
          description: netImg.description,
          source: netImg.source,
          isInternetAuthentic: true
        });
      }

      // 2. Fallback to OpenRouter generative image
      const img = await generateAIImage(prompt);
      if (img && img.imageUrl) {
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(img.imageUrl)}&subject=${encodeURIComponent(prompt)}`;
        return res.json({ status: "success", imageUrl: proxyUrl, description: img.description });
      }
      return res.status(500).json({ error: "Image generation model was unable to generate visual." });
    } catch (err: any) {
      console.error("Image generation error:", err);
      return res.status(500).json({ error: err.message || "Failed to generate image" });
    }
  });

  // -------------------------------------------------------------
  // MICROSOFT NEURAL TTS API ENDPOINTS
  // -------------------------------------------------------------
  app.get("/api/tts/voices", (req, res) => {
    res.json({
      status: "success",
      voices: MICROSOFT_NEURAL_VOICES,
      defaultVoice: "hi-IN-SwaraNeural"
    });
  });

  app.post("/api/tts/synthesize", async (req, res) => {
    try {
      const { text, voice, rate, pitch } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Text is required for TTS synthesis" });
      }

      const result = await synthesizeMicrosoftTTS(text, {
        voice: voice || "hi-IN-SwaraNeural",
        rate: typeof rate === "number" ? rate : 1.0,
        pitch: typeof pitch === "number" ? pitch : 1.0,
      });

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        wordBoundaries: result.wordBoundaries,
        voice: result.voice,
        durationEstimateMs: result.durationEstimateMs
      });
    } catch (ttsErr: any) {
      console.error("Microsoft TTS Synthesis Error:", ttsErr);
      return res.status(500).json({
        error: ttsErr.message || "Failed to synthesize speech using Microsoft Neural Voice"
      });
    }
  });

  // Vite development middleware vs production static files
  if (IS_SERVERLESS) {
    // Serverless host: the CDN serves static files; this app only handles /api/*.
  } else if (process.env.NODE_ENV !== "production") {
    const viteId = "vite"; // computed so bundlers never pull vite (dev-only) into the production/serverless bundle
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteId);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        const rel = path.relative(distPath, filePath).split(path.sep).join("/");
        if (rel.startsWith("assets/")) {
          // content-hashed by Vite: safe to cache forever
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (rel === "index.html" || rel === "sw.js" || rel === "manifest.json") {
          // must always be revalidated so updates are picked up
          res.setHeader("Cache-Control", "no-cache");
        } else if (rel.startsWith("pdfjs/") || rel.startsWith("vendor/") || rel.startsWith("icons/")) {
          res.setHeader("Cache-Control", "public, max-age=604800");
        }
      },
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!IS_SERVERLESS) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`S.A.Y.A.D. Server running on http://localhost:${PORT}`);
    });
  }
  return app;
}

export const appPromise = startServer();


