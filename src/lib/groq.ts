/**
 * Groq speech-to-text (Whisper). The recording is sent only to Groq for transcription and never stored by Aven.
 * Pattern from Setline: context prompt with names, verbose_json segment scores to drop noise/junk, echo defence, one retry.
 */
import { prepareAudio } from './audioprep';

export const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
export const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
export const STT_MODEL = { accurate: 'whisper-large-v3', fast: 'whisper-large-v3-turbo' } as const;
const TIMEOUT = 15000;

/** Numbers nobody eats or lifts: if Whisper, given silence, repeats its prompt back (it does), the echo is recognisable. */
const SAMPLE = 'Skyr 237 gram, en banan, 61 gram havregryn. 4 slices of rye bread. Bænkpres 37,5 kilo 11 gentagelser. Bench press 142.5 kg for 3.';
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå]+/g, ' ').trim();
const ECHO = [/\b237 gram\b/, /\b61 gram havregryn\b/, /\b37 5 kilo 11\b/, /\b142 5 kg for 3\b/, /\b4 slices of rye bread\b/];

export function buildPrompt(names: string[] = []): string {
  const uniq = [...new Set(names.filter(Boolean))].slice(0, 24);
  return (uniq.length ? uniq.join(', ') + '. ' : '') + SAMPLE;
}
export function isEcho(text: string, prompt = ''): boolean {
  const t = norm(text);
  if (!t) return false;
  if (ECHO.some((r) => r.test(t))) return true;
  const names = norm(String(prompt).split(SAMPLE)[0]);
  return !!names && t.length >= 8 && names.includes(t) && /\s/.test(t);
}
export function dedupeSentences(text: string): string {
  const out: string[] = [];
  for (const p of String(text || '').split(/(?<=[.!?])\s+/)) if (!out.length || norm(out[out.length - 1]) !== norm(p)) out.push(p);
  return out.join(' ');
}
const JUNK = [
  /danske tekster/i, /scandinavian text service/i, /tekstet af/i, /undertekster/i, /oversat af/i, /nordic subtitle/i,
  /tak fordi (du|i) (så|lyttede) med/i, /thank(s| you) for watching/i, /subtitles? by/i, /amara\.org/i,
  /please subscribe/i, /like and subscribe/i, /^\W*(musik|music|applause|bifald)\W*$/i,
];
export const isJunk = (text: string) => JUNK.some((r) => r.test(text));

interface Verbose { text?: string; language?: string; segments?: { text?: string; no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }[] }
export function cleanTranscript(data: Verbose | null, prompt = ''): { text: string; lang: string } | null {
  if (!data || typeof data.text !== 'string') return null;
  const segs = Array.isArray(data.segments) ? data.segments : null;
  let text = segs
    ? segs.filter((g) => !((g.no_speech_prob ?? 0) > 0.7 && (g.avg_logprob ?? 0) < -0.9) && !((g.compression_ratio ?? 0) > 2.4) && !isJunk(g.text || '') && !isEcho(g.text || '', prompt)).map((g) => String(g.text || '').trim()).join(' ')
    : data.text;
  text = String(text).split(/(?<=[.!?])\s+/).filter((x) => !isEcho(x, prompt)).join(' ');
  text = dedupeSentences(text.replace(/\s+/g, ' ').trim());
  if (isJunk(text) || isEcho(text, prompt)) text = '';
  const lang = String(data.language || '').toLowerCase();
  return { text, lang: ({ danish: 'da', english: 'en' } as Record<string, string>)[lang] ?? (lang.length === 2 ? lang : lang ? 'other' : '') };
}

/** How sure Whisper was of a transcript: the mean log-probability of its segments (higher is clearer; −9 when unknown). */
export function confidence(data: Verbose | null): number {
  const lp = (Array.isArray(data?.segments) ? data!.segments : []).map((g) => g.avg_logprob).filter((v): v is number => typeof v === 'number');
  return lp.length ? lp.reduce((a, b) => a + b, 0) / lp.length : -9;
}

export class SttError extends Error {
  constructor(public code: 'nokey' | 'offline' | 'network' | 'timeout' | 'badkey' | 'busy' | 'failed', public status = 0) { super(code); }
}
interface Opts { key: string; model: string; language: 'auto' | 'da' | 'en'; prompt: string }

async function once(blob: Blob, o: Opts): Promise<{ text: string; lang: string; conf: number }> {
  const fd = new FormData();
  const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : /wav/.test(blob.type) ? 'wav' : 'webm';
  fd.append('file', blob, `speech.${ext}`);
  fd.append('model', o.model);
  fd.append('temperature', '0');
  fd.append('response_format', 'verbose_json');
  if (o.language === 'da' || o.language === 'en') fd.append('language', o.language);
  if (o.prompt) fd.append('prompt', o.prompt);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let res: Response;
  try { res = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${o.key}` }, body: fd, signal: ctl.signal }); }
  catch (e: any) { throw new SttError(e?.name === 'AbortError' ? 'timeout' : navigator.onLine === false ? 'offline' : 'network'); }
  finally { clearTimeout(timer); }
  if (res.status === 401 || res.status === 403) throw new SttError('badkey', res.status);
  if (res.status === 429) throw new SttError('busy', res.status);
  if (!res.ok) throw new SttError('failed', res.status);
  const data = await res.json().catch(() => null);
  const out = cleanTranscript(data, o.prompt);
  if (!out) throw new SttError('failed', res.status);
  return { ...out, conf: confidence(data) };
}

/**
 * Left on Auto, Whisper sometimes hears a language that is neither Danish nor English — Danish taken for Norwegian, accented
 * English for Dutch. That used to be heard again as Danish only, which turned misheard English into Danish nonsense. Now it is
 * heard again as both, side by side, and the clearer of the two (Whisper's own confidence) is kept.
 */
async function heard(blob: Blob, o: Opts): Promise<string> {
  const r = await once(blob, o);
  if (!r.text || !r.lang || r.lang === 'da' || r.lang === 'en' || o.language !== 'auto') return r.text;
  const both = await Promise.allSettled([once(blob, { ...o, language: 'da' }), once(blob, { ...o, language: 'en' })]);
  const got = both.flatMap((x) => (x.status === 'fulfilled' && x.value.text ? [x.value] : []));
  if (!got.length) {
    const failed = both.find((x): x is PromiseRejectedResult => x.status === 'rejected');
    if (failed) throw failed.reason;
    return r.text;
  }
  return got.sort((a, b) => b.conf - a.conf)[0].text;
}

export async function transcribe(blob: Blob, o: Opts): Promise<string> {
  if (!o.key) throw new SttError('nokey');
  if (navigator.onLine === false) throw new SttError('offline');
  const prep = await prepareAudio(blob);
  if (prep.silent) return ''; // nothing was said: nothing to mishear
  try { return await heard(prep.blob, o); }
  catch (e: any) {
    if (!['timeout', 'network'].includes(e.code) && !(e.code === 'failed' && e.status >= 500)) throw e;
    return heard(prep.blob, o);
  }
}

export async function testGroqKey(key: string): Promise<'ok' | 'bad' | 'offline' | string> {
  try {
    const res = await fetch(GROQ_MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'bad';
    return String(res.status);
  } catch { return 'offline'; }
}
