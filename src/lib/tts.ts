/**
 * Spoken replies with Gemini TTS. Lessons carried over from Setline:
 *  - newer voices return a whole WAV with a metadata chunk AFTER the audio: play only the "data" chunk, or you get a loud burst at the end;
 *  - the audio can arrive in several parts: join them all;
 *  - trim "ghost" audio after the reply using the expected length of the text.
 */
import { AiError, withFallback } from './gemini';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const RATE = 24000;
export const VOICES = ['Achird', 'Sulafat', 'Algieba', 'Despina', 'Callirrhoe', 'Puck', 'Aoede', 'Zephyr', 'Kore', 'Charon', 'Fenrir', 'Orus'];
export const FALLBACK_TTS = 'gemini-2.5-flash-preview-tts';

/** Just the 16-bit mono samples out of raw PCM or a WAV container (any chunks before or after "data"). */
export function pcmBytes(u8: Uint8Array, fallbackRate = RATE): { bytes: Uint8Array; rate: number } {
  const tag = (o: number, n = 4) => String.fromCharCode(...u8.subarray(o, o + n));
  if (u8.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { bytes: u8.subarray(0, u8.length - (u8.length % 2)), rate: fallbackRate };
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 12, rate = fallbackRate, ch = 1, bits = 16;
  while (off + 8 <= u8.length) {
    const id = tag(off), size = v.getUint32(off + 4, true), body = off + 8;
    if (id === 'fmt ' && body + 16 <= u8.length) { ch = v.getUint16(body + 2, true) || 1; rate = v.getUint32(body + 4, true) || fallbackRate; bits = v.getUint16(body + 14, true); }
    else if (id === 'data') {
      const len = Math.min(size === 0xFFFFFFFF || size === 0 ? u8.length - body : size, u8.length - body);
      let d = u8.subarray(body, body + len - (len % 2));
      if (bits !== 16) return { bytes: new Uint8Array(0), rate };
      if (ch > 1) { const n = Math.floor(d.length / (2 * ch)), mono = new Uint8Array(n * 2); for (let i = 0; i < n; i++) { mono[i * 2] = d[i * 2 * ch]; mono[i * 2 + 1] = d[i * 2 * ch + 1]; } d = mono; }
      return { bytes: d, rate };
    }
    off = body + size + (size & 1);
  }
  return { bytes: new Uint8Array(0), rate };
}

export function audioFrom(data: any): { pcm: Uint8Array; rate: number } {
  const parts = (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.inlineData).filter((d: any) => d?.data);
  if (!parts.length) throw new AiError('empty');
  let rate: number | null = null;
  const chunks = parts.map((d: any) => {
    const bin = atob(d.data); const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const a = pcmBytes(b, Number(/rate=(\d+)/.exec(d.mimeType || '')?.[1]) || RATE);
    rate ??= a.rate;
    return a.bytes;
  });
  const bytes = new Uint8Array(chunks.reduce((n: number, c: Uint8Array) => n + c.length, 0));
  let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  return { pcm: bytes, rate: rate || RATE };
}

/** Float samples, with anything beyond the plausible spoken length cut and a short fade so nothing clicks. */
export function toSamples(pcm: Uint8Array, rate: number, text: string): Float32Array {
  const n = pcm.length >> 1, view = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
  const maxSamples = Math.min(n, Math.round(rate * (text.length * 0.1 + 1.5))); // ~10 chars/second is slow speech
  const out = new Float32Array(maxSamples);
  for (let i = 0; i < maxSamples; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  const fade = Math.min(out.length, Math.round(rate * 0.04));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

let ctx: AudioContext | null = null;
let src: AudioBufferSourceNode | null = null;
const listeners = new Set<(speaking: boolean) => void>();
export const onSpeaking = (fn: (s: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function stopSpeaking() { try { src?.stop(); } catch { /* already stopped */ } src = null; listeners.forEach((l) => l(false)); }

export async function speak(text: string, o: { key: string; models: string[]; voice: string }): Promise<void> {
  const clean = text.replace(/\*\*?|__|#+\s/g, '').replace(/^\s*(?:[-*•]|\d+\.)\s+/gm, '').replace(/\n+/g, ' ').trim().slice(0, 600);
  if (!clean) return;
  stopSpeaking();
  const data = await withFallback([...o.models, FALLBACK_TTS], async (model) => {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': o.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: /[.!?…]["”']?$/.test(clean) ? clean : `${clean}.` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } } } }),
      });
      if (res.status === 401 || res.status === 403) throw new AiError('badkey', res.status);
      if (res.status === 404) throw new AiError('nomodel', 404);
      if (res.status === 429 || res.status === 503) throw new AiError('busy', res.status);
      if (!res.ok) throw new AiError('failed', res.status);
      return res.json();
    } catch (e: any) { if (e instanceof AiError) throw e; throw new AiError(e?.name === 'AbortError' ? 'timeout' : 'network'); }
    finally { clearTimeout(timer); }
  });
  const { pcm, rate } = audioFrom(data);
  const samples = toSamples(pcm, rate, clean);
  ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const buf = ctx.createBuffer(1, samples.length, rate);
  buf.copyToChannel(new Float32Array(samples), 0);
  const node = ctx.createBufferSource(); node.buffer = buf; node.connect(ctx.destination);
  src = node; listeners.forEach((l) => l(true));
  node.onended = () => { if (src === node) { src = null; listeners.forEach((l) => l(false)); } };
  node.start();
}
