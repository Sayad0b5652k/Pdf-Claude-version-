import WebSocket from 'ws';
import crypto from 'crypto';
import https from 'https';

export interface WordBoundary {
  offsetMs: number;
  durationMs: number;
  text: string;
  length: number;
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  audioBase64: string;
  mimeType: string;
  wordBoundaries: WordBoundary[];
  voice: string;
  durationEstimateMs: number;
  provider?: 'microsoft' | 'fallback';
}

// Popular Microsoft Neural Voices
export const MICROSOFT_NEURAL_VOICES = [
  // Hindi & Indian Accents
  { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi - Natural Female)', lang: 'hi-IN', gender: 'Female', category: 'Hindi & Indian' },
  { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi - Natural Male)', lang: 'hi-IN', gender: 'Male', category: 'Hindi & Indian' },
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (English India - Expressive Female)', lang: 'en-IN', gender: 'Female', category: 'Hindi & Indian' },
  { id: 'en-IN-PrabhatNeural', name: 'Prabhat (English India - Professional Male)', lang: 'en-IN', gender: 'Male', category: 'Hindi & Indian' },

  // English (US)
  { id: 'en-US-JennyNeural', name: 'Jenny (US - Conversational Female)', lang: 'en-US', gender: 'Female', category: 'English US & UK' },
  { id: 'en-US-GuyNeural', name: 'Guy (US - Warm Male Narrator)', lang: 'en-US', gender: 'Male', category: 'English US & UK' },
  { id: 'en-US-AriaNeural', name: 'Aria (US - Crisp & Clear Female)', lang: 'en-US', gender: 'Female', category: 'English US & UK' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US - Deep Academic Male)', lang: 'en-US', gender: 'Male', category: 'English US & UK' },
  { id: 'en-US-EricNeural', name: 'Eric (US - Friendly Male)', lang: 'en-US', gender: 'Male', category: 'English US & UK' },
  { id: 'en-US-AnaNeural', name: 'Ana (US - Gentle & Calm Female)', lang: 'en-US', gender: 'Female', category: 'English US & UK' },

  // English (UK)
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK - Elegant British Female)', lang: 'en-GB', gender: 'Female', category: 'English US & UK' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK - Smooth British Male)', lang: 'en-GB', gender: 'Male', category: 'English US & UK' },

  // Regional Indian Languages
  { id: 'bn-IN-TanishaaNeural', name: 'Tanishaa (Bengali - Natural Female)', lang: 'bn-IN', gender: 'Female', category: 'Regional Indian' },
  { id: 'ta-IN-PallaviNeural', name: 'Pallavi (Tamil - Natural Female)', lang: 'ta-IN', gender: 'Female', category: 'Regional Indian' },
  { id: 'te-IN-ShrutiNeural', name: 'Shruti (Telugu - Natural Female)', lang: 'te-IN', gender: 'Female', category: 'Regional Indian' },
  { id: 'mr-IN-AarohiNeural', name: 'Aarohi (Marathi - Natural Female)', lang: 'mr-IN', gender: 'Female', category: 'Regional Indian' },
  { id: 'ur-IN-GulNeural', name: 'Gul (Urdu - Natural Female)', lang: 'ur-IN', gender: 'Female', category: 'Regional Indian' },
  { id: 'ur-PK-UzmaNeural', name: 'Uzma (Urdu - Expressive Female)', lang: 'ur-PK', gender: 'Female', category: 'Regional Indian' }
];

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600n; // Windows epoch difference in seconds

// LRU audio cache + in-flight dedup + serialized WebSocket queue
const CACHE_LIMIT = 100;
const synthesisCache = new Map<string, SynthesisResult>();
const inFlightRequests = new Map<string, Promise<SynthesisResult>>();

let msQueueTail: Promise<void> = Promise.resolve();
let lastMsAttemptAt = 0;
let msCooldownUntil = 0;
let msCookieJar = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function updateCookieJar(setCookieHeader?: string[] | string) {
  if (!setCookieHeader) return;
  const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const pairs = new Map<string, string>();
  if (msCookieJar) {
    for (const part of msCookieJar.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) pairs.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    }
  }
  for (const raw of list) {
    const first = String(raw || '').split(';')[0];
    const idx = first.indexOf('=');
    if (idx > 0) {
      pairs.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
    }
  }
  if (pairs.size > 0) {
    msCookieJar = Array.from(pairs.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

function generateSecMsGec(): string {
  const ticks = BigInt(Math.floor(Date.now() / 1000)) + WIN_EPOCH;
  const rounded = ticks - (ticks % 300n);
  const windowsTicks = rounded * 10000000n;
  const str = windowsTicks.toString() + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatRate(rate: number): string {
  const percent = Math.round((rate - 1.0) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function formatPitch(pitch: number): string {
  const percent = Math.round((pitch - 1.0) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function enqueueMsCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const elapsed = Date.now() - lastMsAttemptAt;
    if (elapsed < 420) {
      await sleep(420 - elapsed);
    }
    lastMsAttemptAt = Date.now();
    return fn();
  };
  const next = msQueueTail.then(run, run);
  msQueueTail = next.then(() => undefined, () => undefined);
  return next;
}

function attemptMicrosoftEdgeWs(
  text: string,
  voice: string,
  rate: number,
  pitch: number
): Promise<SynthesisResult> {
  const rateStr = formatRate(rate);
  const pitchStr = formatPitch(pitch);
  const cleanText = escapeXml(text.trim());

  const requestId = crypto.randomUUID().replace(/-/g, '');
  const connId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();
  const secMsGec = generateSecMsGec();

  const wsUrl = `wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='${voice}'>
      <prosody pitch='${pitchStr}' rate='${rateStr}' volume='+0%'>
        ${cleanText}
      </prosody>
    </voice>
  </speak>`;

  return new Promise((resolve, reject) => {
    const audioChunks: Buffer[] = [];
    const wordBoundaries: WordBoundary[] = [];
    let isFinished = false;
    let statusRejectErr: (Error & { statusCode?: number }) | null = null;

    const headers: Record<string, string> = {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
    };
    if (msCookieJar) {
      headers['Cookie'] = msCookieJar;
    }

    const ws = new WebSocket(wsUrl, {
      headers,
      handshakeTimeout: 8000,
    });

    const timeout = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try { ws.terminate(); } catch (_) {}
        reject(new Error('Microsoft Edge TTS timeout after 15 seconds'));
      }
    }, 15000);

    ws.on('upgrade', (res) => {
      updateCookieJar(res.headers['set-cookie']);
    });

    ws.on('unexpected-response', (_req, res) => {
      updateCookieJar(res.headers['set-cookie']);
      const code = res.statusCode || 500;
      const err: Error & { statusCode?: number } = new Error(`Unexpected server response: ${code}`);
      err.statusCode = code;
      statusRejectErr = err;
      try { res.resume(); } catch (_) {}
      try { ws.terminate(); } catch (_) {}
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    ws.on('open', () => {
      const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\nX-Timestamp:${timestamp}Z\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buffer.length > 2) {
          const headerLength = buffer.readUInt16BE(0);
          if (buffer.length >= 2 + headerLength) {
            const headerStr = buffer.toString('utf-8', 2, 2 + headerLength);
            if (headerStr.includes('Path:audio')) {
              const audioPayload = buffer.subarray(2 + headerLength);
              if (audioPayload.length > 0) {
                audioChunks.push(audioPayload);
              }
            }
          }
        }
      } else {
        const textMsg = data.toString();
        if (textMsg.includes('Path:audio.metadata')) {
          try {
            const bodyIdx = textMsg.indexOf('\r\n\r\n');
            if (bodyIdx !== -1) {
              const jsonStr = textMsg.substring(bodyIdx + 4);
              const parsed = JSON.parse(jsonStr);
              if (parsed.Metadata && Array.isArray(parsed.Metadata)) {
                for (const item of parsed.Metadata) {
                  if (item.Type === 'WordBoundary' && item.Data) {
                    const offsetMs = Math.round((item.Data.Offset || 0) / 10000);
                    const durationMs = Math.round((item.Data.Duration || 0) / 10000);
                    const wordText = item.Data.text ? item.Data.text.Text : '';
                    const wordLen = item.Data.text ? item.Data.text.Length : wordText.length;
                    wordBoundaries.push({
                      offsetMs,
                      durationMs,
                      text: wordText,
                      length: wordLen
                    });
                  }
                }
              }
            }
          } catch (_) {
            // Ignore metadata parse warning
          }
        } else if (textMsg.includes('Path:turn.end')) {
          if (!isFinished) {
            isFinished = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (_) {}

            const completeAudio = Buffer.concat(audioChunks);
            const audioBase64 = completeAudio.toString('base64');
            const totalDurationMs = wordBoundaries.length > 0
              ? (wordBoundaries[wordBoundaries.length - 1].offsetMs + wordBoundaries[wordBoundaries.length - 1].durationMs)
              : 0;

            resolve({
              audioBuffer: completeAudio,
              audioBase64,
              mimeType: 'audio/mpeg',
              wordBoundaries,
              voice,
              durationEstimateMs: totalDurationMs,
              provider: 'microsoft',
            });
          }
        }
      }
    });

    ws.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        reject(statusRejectErr || err);
      }
    });

    ws.on('close', () => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          const completeAudio = Buffer.concat(audioChunks);
          resolve({
            audioBuffer: completeAudio,
            audioBase64: completeAudio.toString('base64'),
            mimeType: 'audio/mpeg',
            wordBoundaries,
            voice,
            durationEstimateMs: 0,
            provider: 'microsoft',
          });
        } else {
          reject(statusRejectErr || new Error('Microsoft Edge TTS connection closed before audio received'));
        }
      }
    });
  });
}

function splitTtsChunks(text: string, maxLen = 175): string[] {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const clauses = cleaned.split(/(?<=[।.!?,\n;:])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const clause of clauses) {
    if (!clause) continue;
    if ((cur ? cur.length + 1 + clause.length : clause.length) <= maxLen) {
      cur = cur ? `${cur} ${clause}` : clause;
    } else {
      if (cur) chunks.push(cur);
      if (clause.length <= maxLen) {
        cur = clause;
      } else {
        const words = clause.split(/\s+/);
        cur = '';
        for (const w of words) {
          if ((cur ? cur.length + 1 + w.length : w.length) <= maxLen) {
            cur = cur ? `${cur} ${w}` : w;
          } else {
            if (cur) chunks.push(cur);
            cur = w.slice(0, maxLen);
          }
        }
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function mapVoiceToGoogleLang(voice: string, text: string): string {
  const v = String(voice || '').toLowerCase();
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (v.startsWith('bn-')) return 'bn';
  if (v.startsWith('ta-')) return 'ta';
  if (v.startsWith('te-')) return 'te';
  if (v.startsWith('mr-')) return 'mr';
  if (v.startsWith('ur-')) return 'ur';
  if (v.startsWith('hi-')) return 'hi';
  if (v.startsWith('en-in')) return 'en-IN';
  if (v.startsWith('en-gb')) return 'en-GB';
  return 'en';
}

function fetchGoogleTtsChunk(chunk: string, tl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(chunk)}`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
        timeout: 9000,
      },
      (res) => {
        if ((res.statusCode || 500) >= 400) {
          res.resume();
          reject(new Error(`Fallback TTS HTTP ${res.statusCode}`));
          return;
        }
        const parts: Buffer[] = [];
        res.on('data', (d) => parts.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        res.on('end', () => resolve(Buffer.concat(parts)));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Fallback TTS timeout'));
    });
    req.on('error', reject);
  });
}

function buildEstimatedWordBoundaries(text: string, totalMs: number): WordBoundary[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || totalMs <= 0) return [];
  const weights = words.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length));
  const sum = weights.reduce((a, b) => a + b, 0) || words.length;
  const boundaries: WordBoundary[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const dur = Math.max(60, Math.round((weights[i] / sum) * totalMs));
    boundaries.push({
      offsetMs: cursor,
      durationMs: dur,
      text: words[i],
      length: words[i].length,
    });
    cursor += dur;
  }
  return boundaries;
}

async function synthesizeFallbackTTS(
  text: string,
  voice: string,
  rate: number
): Promise<SynthesisResult> {
  const tl = mapVoiceToGoogleLang(voice, text);
  const chunks = splitTtsChunks(text, 175);
  const buffers: Buffer[] = [];
  for (const ch of chunks) {
    const buf = await fetchGoogleTtsChunk(ch, tl);
    if (buf.length > 0) buffers.push(buf);
  }
  const completeAudio = Buffer.concat(buffers);
  if (!completeAudio.length) {
    throw new Error('Fallback TTS returned empty audio');
  }
  // Google translate_tts encodes at ~32kbps MPEG-2 (4000 bytes/sec)
  const rawDurationMs = Math.max(900, Math.round((completeAudio.length / 4000) * 1000 / Math.max(0.5, rate)));
  const wordBoundaries = buildEstimatedWordBoundaries(text, rawDurationMs);

  return {
    audioBuffer: completeAudio,
    audioBase64: completeAudio.toString('base64'),
    mimeType: 'audio/mpeg',
    wordBoundaries,
    voice: `fallback:${tl}`,
    durationEstimateMs: rawDurationMs,
    provider: 'fallback',
  };
}

export async function synthesizeMicrosoftTTS(
  text: string,
  options: {
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  } = {}
): Promise<SynthesisResult> {
  const voice = options.voice || 'hi-IN-SwaraNeural';
  const rate = typeof options.rate === 'number' ? options.rate : 1.0;
  const pitch = typeof options.pitch === 'number' ? options.pitch : 1.0;
  const trimmed = String(text || '').trim();
  const cacheKey = `${voice}|${rate.toFixed(2)}|${pitch.toFixed(2)}|${trimmed}`;

  const cached = synthesisCache.get(cacheKey);
  if (cached) {
    // Refresh LRU order
    synthesisCache.delete(cacheKey);
    synthesisCache.set(cacheKey, cached);
    return cached;
  }

  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  const job = (async (): Promise<SynthesisResult> => {
    let result: SynthesisResult | null = null;
    let lastErr: any = null;

    // Try Microsoft Neural TTS unless temporarily cooling down from a 429 rate-limit
    if (Date.now() >= msCooldownUntil) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await enqueueMsCall(() => attemptMicrosoftEdgeWs(trimmed, voice, rate, pitch));
          break;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || '');
          const isRateLimit = err?.statusCode === 429 || err?.statusCode === 403 || /\b(429|403)\b/.test(msg);
          if (isRateLimit) {
            if (attempt === 0) {
              await sleep(650 + Math.floor(Math.random() * 250));
              continue;
            }
            // Cool down Microsoft Edge requests for 45s to avoid hammering the upstream IP limit
            msCooldownUntil = Date.now() + 45_000;
            console.warn(`[TTS] Microsoft Edge returned ${err?.statusCode || '429'}; switching to neural-fallback stream for 45s.`);
            break;
          }
          if (attempt === 0) {
            await sleep(250);
          }
        }
      }
    }

    if (!result) {
      try {
        result = await synthesizeFallbackTTS(trimmed, voice, rate);
      } catch (fbErr: any) {
        throw lastErr || fbErr;
      }
    }

    synthesisCache.set(cacheKey, result);
    while (synthesisCache.size > CACHE_LIMIT) {
      const oldest = synthesisCache.keys().next().value;
      if (oldest !== undefined) synthesisCache.delete(oldest);
      else break;
    }
    return result;
  })();

  inFlightRequests.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
