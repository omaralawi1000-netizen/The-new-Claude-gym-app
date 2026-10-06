/**
 * Spoken replies with Gemini TTS. Lessons carried over from Setline:
 *  - newer voices return a whole WAV with a metadata chunk AFTER the audio: play only the "data" chunk, or you get a loud burst at the end;
 *  - the audio can arrive in several parts: join them all;
 *  - trim "ghost" audio after the reply using the expected length of the text.
 */
import { AiError, withFallback } from './gemini';
import { GROQ_URL, STT_MODEL } from './groq';
import { toWav } from './audioprep';
import { outMeter, setVoiceOut } from './voiceOut';

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

/** A reply as the screen shows it: lines, a bullet or not, and **bold** runs. Rich renders from this and the reader speaks
 *  from it, so word N on screen is always word N in the audio (that is what lets the spoken word light up). */
export interface RichLine { bullet: boolean; segs: { bold: boolean; text: string }[] }
export function richLines(text: string): RichLine[] {
  return text.split('\n').map((raw) => {
    const m = raw.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    const l = (m ? m[1] : raw).replace(/^\s*#{1,6}\s+/, '');
    const segs = l.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.length > 4 && p.startsWith('**') && p.endsWith('**') ? { bold: true, text: p.slice(2, -2) } : { bold: false, text: p }));
    return { bullet: !!m, segs };
  });
}
export const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);
export function speechWords(text: string): string[] {
  return richLines(text).flatMap((l) => l.segs.flatMap((s) => wordsOf(s.text)));
}

const pauseAfter = (w: string): number => (/[.!?…:]["”'’)]*$/.test(w) ? 6 : /[,;—–]["”'’)]*$/.test(w) ? 3 : 0);
const VOWELS = /[aeiouyæøåéèêáàâäöüíóú]+/gi;
/**
 * How long a word takes to say, in rough syllable units: a vowel group is a syllable, a digit is said as about one and a
 * half ("67" → "sixty-seven"), "%" and "×" are words of their own, and consonants add a little. Letter count (what this
 * used to be) made long-spelled, short-said words ("through", "strength") hog time, and the light drifted a word off.
 */
export function weightOf(w: string): number {
  const core = w.replace(/[^\p{L}\p{N}%×]/gu, '');
  if (!core) return 0.5;
  const letters = core.replace(/[\p{N}%×]/gu, '');
  const syl = Math.max(letters ? 1 : 0, letters.match(VOWELS)?.length ?? 0)
    + (core.match(/\p{N}/gu)?.length ?? 0) * 1.4 + (core.match(/[%×]/g)?.length ?? 0) * 1.5;
  const cons = letters.replace(VOWELS, '').length;
  return syl + cons * 0.12 + 0.55;
}

/**
 * When each word starts, given where the speech sits in the clip ([start, end], seconds) and the quiet stretches found in it.
 * Words share the time by how long they take to say; a comma or full stop gets a pause. The timing is then pinned to the
 * audio wherever it can be: a quiet stretch near the expected end of a phrase pins that phrase, and any other clear breath
 * (≥ 110 ms) pins the word boundary it falls on — so it re-syncs every few words instead of drifting.
 */
export function wordTimes(words: string[], start: number, end: number, gaps: [number, number][] = []): number[] {
  const n = words.length;
  if (!n) return [];
  const w = words.map(weightOf), p = words.map((x, i) => (i < n - 1 ? pauseAfter(x) : 0));
  const total = w.reduce((a, b) => a + b, 0) + p.reduce((a, b) => a + b, 0);
  const span = Math.max(0.05, end - start);
  // anchors: word index → the time it starts (and the time the word before it ends)
  type Anchor = { k: number; t: number; prevEnd: number };
  const anchors: Anchor[] = [{ k: 0, t: start, prevEnd: start }];
  const used = new Set<number>();
  let cum = 0, lastG = -1, lastT = start;
  for (let i = 0; i < n - 1; i++) {
    cum += w[i] + p[i] / 2;
    if (p[i]) {
      const expect = start + (cum / total) * span;
      let best = -1, bestD = 0.18 * span + 0.35;
      for (let g = lastG + 1; g < gaps.length; g++) {
        const c = (gaps[g][0] + gaps[g][1]) / 2;
        if (gaps[g][0] <= lastT) continue;
        const d = Math.abs(c - expect);
        if (d < bestD) { best = g; bestD = d; }
      }
      if (best >= 0) { anchors.push({ k: i + 1, t: gaps[best][1], prevEnd: gaps[best][0] }); used.add(best); lastG = best; lastT = gaps[best][1]; }
    }
    cum += p[i] / 2;
  }
  anchors.push({ k: n, t: end, prevEnd: end });
  const spread = (out: number[]) => {
    for (let a = 0; a < anchors.length - 1; a++) {
      const { k: from, t: t0 } = anchors[a], { k: to, prevEnd: t1 } = anchors[a + 1];
      let sum = 0; for (let i = from; i < to; i++) sum += w[i] + (i < to - 1 ? p[i] : 0);
      let acc = 0;
      for (let i = from; i < to; i++) { out[i] = t0 + (sum ? (acc / sum) * Math.max(0, t1 - t0) : 0); acc += w[i] + (i < to - 1 ? p[i] : 0); }
    }
    return out;
  };
  const out = spread(new Array<number>(n));
  // every other clear breath, longest first: pin the word boundary it falls on, if one is close enough
  const per = span / n;
  const rest = gaps.map((g, i) => ({ g, i })).filter(({ g, i }) => !used.has(i) && g[1] - g[0] >= 0.11).sort((x, y) => (y.g[1] - y.g[0]) - (x.g[1] - x.g[0]));
  for (const { g } of rest) {
    const c = (g[0] + g[1]) / 2;
    let best = -1, bestD = 0.55 * per;
    for (let i = 1; i < n; i++) { const d = Math.abs(out[i] - c); if (d < bestD) { best = i; bestD = d; } }
    if (best < 0) continue;
    const at = anchors.findIndex((x) => x.k >= best);
    if (anchors[at].k === best) continue;
    const before = anchors[at - 1], after = anchors[at];
    if (g[0] <= before.t || g[1] >= after.prevEnd) continue; // only between the anchors around it, in order
    anchors.splice(at, 0, { k: best, t: g[1], prevEnd: g[0] });
    spread(out);
  }
  return out;
}

/**
 * Where the voice actually is in a clip: first and last loud stretch, and the quiet dips (≥ 70 ms) between. 10 ms frames;
 * "quiet" is measured against the clip's own loudness (8% of its loud level), so a soft voice finds its breaths too.
 */
export function speechSpan(x: Float32Array, rate: number): { start: number; end: number; gaps: [number, number][] } {
  const hop = Math.max(1, Math.round(rate * 0.01)), frames = Math.floor(x.length / hop);
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) { let e = 0; for (let i = f * hop; i < (f + 1) * hop; i++) e += x[i] * x[i]; rms.push(Math.sqrt(e / hop)); }
  const sorted = rms.filter((v) => v > 0.004).sort((a, b) => a - b);
  const loudLevel = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  const th = Math.max(0.006, Math.min(0.012, loudLevel * 0.08));
  const loud = rms.map((v) => v > th);
  const first = loud.indexOf(true), last = loud.lastIndexOf(true);
  if (first < 0) return { start: 0, end: x.length / rate, gaps: [] };
  const gaps: [number, number][] = [];
  let q = -1;
  for (let f = first; f <= last; f++) {
    if (!loud[f]) { if (q < 0) q = f; }
    else if (q >= 0) { if (f - q >= 7) gaps.push([q * hop / rate, f * hop / rate]); q = -1; }
  }
  return { start: first * hop / rate, end: (last + 1) * hop / rate, gaps };
}

/** Normalised for matching what was said against what was heard: lower case, letters and digits only. */
const norm = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const near = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  // one letter off (Whisper's spelling of a Danish word, a plural)
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++miss > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return miss + (a.length - i) + (b.length - j) <= 1;
};

/**
 * The exact start of each word, from Whisper listening to the voice itself (word timestamps). The words it heard are lined
 * up with the words on screen (in order, allowing for skips and spelling); a matched word takes Whisper's time, and the
 * words it didn't match keep their estimated place between the matched ones. null when too little matched to trust it.
 */
export function alignHeard(words: string[], heard: { word: string; start: number }[], est: number[]): number[] | null {
  const a = words.map(norm), b = heard.map((h) => norm(h.word));
  const n = a.length, m = b.length;
  if (!n || !m) return null;
  // longest common subsequence (n, m ≤ ~50)
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = near(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Array<number | null>(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (near(a[i], b[j]) && L[i][j] === L[i + 1][j + 1] + 1) { hit[i] = heard[j].start; i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const spoken = a.filter(Boolean).length;
  const matched = hit.filter((x) => x !== null).length;
  if (matched < Math.max(1, spoken * 0.5)) return null;
  // times must rise: a matched word earlier than the one before it is dropped
  let prev = -Infinity;
  for (let i = 0; i < n; i++) { const v = hit[i]; if (v === null) continue; if (v <= prev) hit[i] = null; else prev = v; }
  // the words in between keep their estimated spacing, stretched to fit between the matched ones
  const out = new Array<number>(n);
  const idx = hit.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  for (let i = 0; i < n; i++) {
    if (hit[i] !== null) { out[i] = hit[i]!; continue; }
    const lo = [...idx].reverse().find((k) => k < i), hi = idx.find((k) => k > i);
    if (lo !== undefined && hi !== undefined) {
      const f = est[hi] - est[lo] > 0 ? (est[i] - est[lo]) / (est[hi] - est[lo]) : (i - lo) / (hi - lo);
      out[i] = hit[lo]! + f * (hit[hi]! - hit[lo]!);
    } else if (lo !== undefined) out[i] = hit[lo]! + (est[i] - est[lo]);
    else out[i] = Math.max(0, hit[hi!]! - (est[hi!] - est[i]));
  }
  for (let i = 1; i < n; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
  return out;
}

/** Pieces to synthesise separately: a short first sentence (so the voice starts quickly), then up to ~45 words each. */
export function chunkRanges(words: string[]): [number, number][] {
  const out: [number, number][] = [];
  let a = 0;
  while (a < words.length) {
    const first = out.length === 0, max = first ? 24 : 45, min = first ? 5 : 12;
    let b = a, cut = -1, comma = -1;
    for (; b < words.length && b - a < max; b++) {
      const pz = pauseAfter(words[b]);
      if (pz === 6) { cut = b + 1; if (b + 1 - a >= min) break; }
      else if (pz === 3 && b + 1 - a >= 8) comma = b + 1;
    }
    let end = b >= words.length ? words.length : cut > a && cut - a >= min ? cut : comma > a ? comma : cut > a ? cut : Math.min(words.length, a + max);
    if (words.length - end > 0 && words.length - end < 4) end = words.length; // never leave a two-word tail on its own
    out.push([a, end]); a = end;
  }
  return out;
}

/** `groqKey`: when there is one, Whisper listens to each piece once and gives every word its exact start (see refine). */
export interface TtsOpts { key: string; models: string[]; voice: string; groqKey?: string }
interface Clip { samples: Float32Array; rate: number; dur: number; starts: number[]; words: string[]; refined?: Promise<void> }

async function fetchClip(text: string, o: TtsOpts): Promise<Clip> {
  const data = await withFallback([...o.models, FALLBACK_TTS], async (model) => {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': o.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: /[.!?…]["”']?$/.test(text) ? text : `${text}.` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } } } }),
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
  const raw = toSamples(pcm, rate, text);
  // trim the silence around the voice (pieces then join like one breath), keeping a short lead-in and tail
  const sp = speechSpan(raw, rate);
  const from = Math.max(0, Math.floor((sp.start - 0.03) * rate)), to = Math.min(raw.length, Math.ceil((sp.end + 0.2) * rate));
  const samples = raw.slice(from, Math.max(from + 1, to)), off = from / rate;
  const words = wordsOf(text);
  const starts = wordTimes(words, sp.start - off, sp.end - off, sp.gaps.map(([a, b]) => [a - off, b - off] as [number, number]));
  return { samples, rate, dur: samples.length / rate, starts, words };
}

/**
 * Exact word times for a piece: Whisper (Groq, word timestamps) listens to the audio once, prompted with the very words, and
 * its timings replace the estimate — also while the piece is already playing (the light just moves onto the right word).
 * Any failure keeps the estimate. Once per piece; a replay uses the refined times.
 */
function refine(c: Clip, key: string): Promise<void> {
  c.refined ??= (async () => {
    const fd = new FormData();
    fd.append('file', new Blob([toWav(c.samples, c.rate)], { type: 'audio/wav' }), 'speech.wav');
    fd.append('model', STT_MODEL.fast);
    fd.append('temperature', '0');
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word');
    fd.append('prompt', c.words.join(' ').slice(0, 600));
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal: ctl.signal });
      if (!res.ok) return;
      const j = await res.json();
      const heard = (j?.words ?? []).filter((x: any) => typeof x?.word === 'string' && Number.isFinite(x?.start));
      const exact = alignHeard(c.words, heard, c.starts);
      if (exact) c.starts = exact;
    } catch { /* keep the estimate */ } finally { clearTimeout(timer); }
  })();
  return c.refined;
}

/** Synthesised pieces, kept by their exact text, voice and model — so a reply fetched in the background plays at once. */
const cache = new Map<string, Promise<Clip>>();
function clip(text: string, o: TtsOpts): Promise<Clip> {
  const k = `${o.voice}|${o.models[0] ?? ''}|${text}`;
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
  const p = fetchClip(text, o);
  cache.set(k, p);
  p.catch(() => { if (cache.get(k) === p) cache.delete(k); }); // a failure is not remembered: the next tap tries again
  while (cache.size > 30) cache.delete(cache.keys().next().value as string);
  return p;
}
const MAX_WORDS = 260;
const pieces = (text: string) => {
  const words = speechWords(text).slice(0, MAX_WORDS);
  return chunkRanges(words).map(([a, b]) => ({ a, text: words.slice(a, b).map((w) => w.replace(/[*_#`]/g, '')).join(' ').trim() }));
};

/** Fetch the start of a reply's audio in the background (the first two pieces), so tapping play starts straight away. */
export function prefetch(text: string, o: TtsOpts) {
  if (!o.key) return;
  for (const p of pieces(text).slice(0, 2)) if (p.text) clip(p.text, o).catch(() => {});
}

/** What is being read right now: which reply (`id`), which word, and whether the audio is still on its way. */
export interface Speech { id: string | null; word: number; loading: boolean }
let state: Speech = { id: null, word: -1, loading: false };
const subs = new Set<() => void>();
const setState = (p: Partial<Speech>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const speechState = () => state;
export const subscribeSpeech = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

let ctx: AudioContext | null = null;
/** The light goes on this much before the word's first sound: it reads as "at the same moment" (a screen frame and the eye's
 *  reaction lag behind the ear). */
const LEAD = 0.05;
/**
 * The point of the audio that is coming out of the speaker right now. `currentTime` is what the browser has handed to the
 * audio hardware, which plays it a little later (tens of ms on the phone, far more over Bluetooth earbuds): following it
 * lit each word early. The output timestamp says what is actually being heard; without it, the reported output latency.
 */
function heardAt(ac: AudioContext): number {
  try {
    const ts = ac.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      const t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      if (t <= ac.currentTime + 0.01 && t > ac.currentTime - 1) return t;
    }
  } catch { /* older browsers */ }
  return ac.currentTime - ((ac as any).outputLatency || ac.baseLatency || 0);
}
let nodes: AudioBufferSourceNode[] = [];
let run = 0;
const listeners = new Set<(speaking: boolean) => void>();
export const onSpeaking = (fn: (s: boolean) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function stopSpeaking() {
  run++;
  for (const n of nodes) { try { n.stop(); } catch { /* not started or already stopped */ } }
  const was = nodes.length > 0 || state.id !== null;
  nodes = []; setVoiceOut(false);
  if (state.id !== null) setState({ id: null, word: -1, loading: false });
  if (was) listeners.forEach((l) => l(false));
}

/**
 * Read a reply aloud and light up each word as it is said. Call it from the tap: the audio output is woken up before
 * anything is awaited (phones only allow sound that starts from a touch). The pieces are fetched together and queued
 * back to back on the audio clock; the word shown follows that same clock.
 */
export async function play(id: string, text: string, o: TtsOpts): Promise<void> {
  stopSpeaking();
  const my = run;
  const parts = pieces(text).filter((p) => p.text);
  if (!parts.length) return;
  ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  const ac = ctx;
  const out = outMeter(ac);
  const woke = ac.state === 'suspended' ? ac.resume().catch(() => {}) : null;
  setState({ id, word: -1, loading: true });
  const clips = parts.map((p) => clip(p.text, o));
  clips.forEach((c) => c.catch(() => {}));
  const line: { t0: number; a: number; c: Clip }[] = [];
  let at = 0, done = false;
  const tick = () => {
    if (my !== run) return;
    const now = heardAt(ac);
    if (done && now >= at) { nodes = []; setVoiceOut(false); setState({ id: null, word: -1, loading: false }); listeners.forEach((l) => l(false)); return; }
    let word = state.word;
    for (const seg of line) {
      if (now < seg.t0) break;
      const st = seg.c.starts;
      let j = -1; for (let i = 0; i < st.length && seg.t0 + st[i] - LEAD <= now; i++) j = i;
      if (j >= 0) word = seg.a + j;
    }
    if (word !== state.word) setState({ word });
    requestAnimationFrame(tick);
  };
  try {
    for (let i = 0; i < parts.length; i++) {
      let c: Clip;
      try { c = await clips[i]; }
      catch (e) { if (i === 0) throw e; break; } // a later piece failed: what has started still plays to its end
      if (my !== run) return;
      if (woke) await woke;
      const t0 = Math.max(ac.currentTime + 0.02, at);
      const buf = ac.createBuffer(1, c.samples.length, c.rate);
      buf.copyToChannel(new Float32Array(c.samples), 0);
      const node = ac.createBufferSource(); node.buffer = buf; node.connect(out);
      node.start(t0); nodes.push(node);
      line.push({ t0, a: parts[i].a, c });
      if (o.groqKey) refine(c, o.groqKey).catch(() => {});
      at = t0 + c.dur;
      if (i === 0) { setState({ loading: false }); setVoiceOut(true); listeners.forEach((l) => l(true)); requestAnimationFrame(tick); }
    }
  } catch (e) {
    if (my === run) { nodes = []; setVoiceOut(false); setState({ id: null, word: -1, loading: false }); }
    throw e;
  }
  done = true;
}
