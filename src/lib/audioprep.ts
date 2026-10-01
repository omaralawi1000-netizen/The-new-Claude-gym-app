/**
 * Cleaning a recording before speech-to-text (ported from Setline's approach): rumble filtered out, the silence/noise around
 * the words trimmed (Whisper invents words in noise), level evened out, sent as 16 kHz mono WAV. Any failure → the original.
 */
export const RATE = 16000;

export function highpass(x: Float32Array, rate = RATE, hz = 110): Float32Array {
  const w = Math.tan(Math.PI * hz / rate), n = 1 / (1 + Math.SQRT2 * w + w * w);
  const b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (w * w - 1) * n, a2 = (1 - Math.SQRT2 * w + w * w) * n;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Where the speech is: runs of 20 ms frames clearly louder than the noise floor. null = nothing stands out. */
export function speechSpan(x: Float32Array, rate = RATE, frameMs = 20, padMs = 280): { start: number; end: number } | null {
  const f = Math.max(1, Math.round(rate * frameMs / 1000)), n = Math.floor(x.length / f);
  if (n < 5) return null;
  const rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = i * f; j < (i + 1) * f; j++) s += x[j] * x[j]; rms[i] = Math.sqrt(s / f); }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.15)], peak = sorted[Math.floor(n * 0.98)];
  if (peak < 0.004 || peak < floor * 2.2) return null;
  const thr = Math.max(floor * 2.2, floor + (peak - floor) * 0.12);
  const hit = (i: number) => [0, 1, 2, 3, 4].filter((k) => i + k < n && rms[i + k] > thr).length >= 3; // speech is a run, not a click
  let a = -1, b = -1;
  for (let i = 0; i < n; i++) if (hit(i)) { a = i; break; }
  for (let i = n - 1; i >= 0; i--) if (hit(Math.max(0, i - 4))) { b = i; break; }
  if (a < 0 || b < a) return null;
  const pad = Math.round(rate * padMs / 1000);
  return { start: Math.max(0, a * f - pad), end: Math.min(x.length, (b + 1) * f + pad) };
}

export function normalizeLevel(x: Float32Array, target = 0.89, maxGain = 8): Float32Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  if (!peak) return x;
  const g = Math.min(maxGain, target / peak);
  if (Math.abs(g - 1) < 0.05) return x;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
  return y;
}

export function toWav(samples: Float32Array, rate: number, outRate = RATE): ArrayBuffer {
  const k = rate / outRate, n = Math.floor(samples.length / k);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true); v.setUint32(28, outRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * k), b = Math.min(samples.length, Math.floor((i + 1) * k));
    let s = 0; for (let j = a; j < b; j++) s += samples[j];
    const x = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    v.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true);
  }
  return buf;
}

/** Samples (mono) → cleaned WAV bytes, or null when it is silent (nothing above a whisper). */
export function cleanSamples(samples: Float32Array, rate = RATE): ArrayBuffer | null {
  const hp = highpass(samples, rate);
  let peak = 0;
  for (let i = 0; i < hp.length; i++) { const a = Math.abs(hp[i]); if (a > peak) peak = a; }
  if (peak < 0.01) return null;
  const span = speechSpan(hp, rate);
  return toWav(normalizeLevel(span ? hp.subarray(span.start, span.end) : hp), rate, RATE);
}

export async function prepareAudio(blob: Blob): Promise<{ blob: Blob; cleaned: boolean; silent?: boolean }> {
  try {
    const OAC = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
    if (!OAC || !blob?.size) return { blob, cleaned: false };
    const audio: AudioBuffer = await new OAC(1, RATE, RATE).decodeAudioData(await blob.arrayBuffer());
    let x = audio.getChannelData(0);
    if (audio.sampleRate !== RATE) {
      const k = audio.sampleRate / RATE, y = new Float32Array(Math.floor(x.length / k));
      for (let i = 0; i < y.length; i++) y[i] = x[Math.floor(i * k)];
      x = y;
    }
    const wav = cleanSamples(x, RATE);
    if (!wav) return { blob, cleaned: false, silent: true };
    return { blob: new Blob([wav], { type: 'audio/wav' }), cleaned: true };
  } catch { return { blob, cleaned: false }; }
}
