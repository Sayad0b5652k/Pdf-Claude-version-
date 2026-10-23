import WebSocket from 'ws';
import crypto from 'crypto';

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
  const rate = options.rate || 1.0;
  const pitch = options.pitch || 1.0;

  const rateStr = formatRate(rate);
  const pitchStr = formatPitch(pitch);
  const cleanText = escapeXml(text.trim());

  const requestId = crypto.randomUUID().replace(/-/g, '');
  const connId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const secMsGec = generateSecMsGec();

  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${connId}`;

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

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
      }
    });

    const timeout = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try { ws.close(); } catch (_) {}
        reject(new Error('Microsoft Edge TTS timeout after 15 seconds'));
      }
    }, 15000);

    ws.on('open', () => {
      // 1. Send speech.config
      const configMsg = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      // 2. Send SSML request
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\nX-Timestamp:${timestamp}Z\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        // Binary message contains 2-byte header length, followed by header text, followed by raw MP3 audio
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
                    // Offset and Duration are in 100-nanosecond units (ticks). Divide by 10,000 to get ms.
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
          } catch (metaErr) {
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
              durationEstimateMs: totalDurationMs
            });
          }
        }
      }
    });

    ws.on('error', (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timeout);
        reject(err);
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
            durationEstimateMs: 0
          });
        } else {
          reject(new Error('Microsoft Edge TTS connection closed before audio received'));
        }
      }
    });
  });
}
