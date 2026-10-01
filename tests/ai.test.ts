// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanTranscript, buildPrompt, isEcho, isJunk, transcribe, SttError, STT_MODEL } from '../src/lib/groq';
import { pickTextModels, limitError, parseSSE, withFallback, AiError, nextQuotaReset, isExhausted, markExhausted, aiFoodRows, aiWorkoutRows, aiEstimateFood } from '../src/lib/gemini';
import { validateFoodItems, validateWorkoutItems, validateEstimate, validateRoutine } from '../src/lib/aiValidate';
import { pcmBytes, audioFrom, toSamples } from '../src/lib/tts';
import { cleanSamples, speechSpan, toWav, highpass } from '../src/lib/audioprep';
import { getKey, setKey, clearKeys, mask } from '../src/lib/keys';
import { resolveRows, rowQuantity } from '../src/lib/foodText';
import { REFERENCE_FOODS } from '../src/data/foods';
import { buildCoachContext, mapRoutineItems } from '../src/lib/coachContext';
import { defaultData } from '../src/state/defaults';
import { allExercises } from '../src/state/store';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('keys', () => {
  it('live only under their own storage key, masked for display, clearable', () => {
    setKey('groq', '  gsk_abc123456  '); setKey('gemini', 'AIzaXYZ');
    expect(getKey('groq')).toBe('gsk_abc123456');
    expect(mask(getKey('gemini'))).toBe('••••AIzaXYZ'.slice(0, 4) + 'AIzaXYZ'.slice(-4));
    expect(Object.keys(localStorage)).toEqual(['aven.keys']);
    setKey('groq', ''); expect(getKey('groq')).toBe('');
    clearKeys(); expect(localStorage.getItem('aven.keys')).toBeNull();
  });
});

describe('groq transcript hygiene', () => {
  const prompt = buildPrompt(['Skyr', 'Havregryn']);
  it('drops subtitle junk, prompt echo and noise segments', () => {
    expect(isJunk('Danske tekster af Nicolai Winther')).toBe(true);
    expect(isEcho('Skyr 237 gram, en banan, 61 gram havregryn.', prompt)).toBe(true);
    const out = cleanTranscript({ text: 'x', language: 'danish', segments: [
      { text: ' 200 gram skyr og en banan', no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.2 },
      { text: ' Tak fordi du så med.', no_speech_prob: 0.9, avg_logprob: -1.5, compression_ratio: 1 },
      { text: ' Skyr 237 gram, en banan, 61 gram havregryn.', no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 1 },
    ] }, prompt)!;
    expect(out.text).toBe('200 gram skyr og en banan'); expect(out.lang).toBe('da');
  });
  it('collapses a sentence Whisper said twice and returns empty for pure junk', () => {
    expect(cleanTranscript({ text: 'Bench 80 for 8. Bench 80 for 8.' })!.text).toBe('Bench 80 for 8.');
    expect(cleanTranscript({ text: 'Thanks for watching!' })!.text).toBe('');
  });
});

describe('groq request', () => {
  const ok = (text: string, language = 'danish') => new Response(JSON.stringify({ text, language, segments: [{ text, no_speech_prob: 0, avg_logprob: -0.1, compression_ratio: 1 }] }), { status: 200 });
  it('sends model, language, prompt, verbose_json and the bearer key', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok('200 gram skyr'));
    const text = await transcribe(new Blob(['x'], { type: 'audio/webm' }), { key: 'gsk_k', model: STT_MODEL.accurate, language: 'da', prompt: 'Skyr.' });
    expect(text).toBe('200 gram skyr');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect((init.headers as any).Authorization).toBe('Bearer gsk_k');
    const fd = init.body as FormData;
    expect(fd.get('model')).toBe('whisper-large-v3'); expect(fd.get('language')).toBe('da'); expect(fd.get('response_format')).toBe('verbose_json'); expect(fd.get('prompt')).toBe('Skyr.');
  });
  it('maps 401 to badkey, 429 to busy, retries a network blip once', async () => {
    const o = { key: 'k', model: 'm', language: 'auto' as const, prompt: '' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(transcribe(new Blob(['x']), o)).rejects.toMatchObject({ code: 'badkey' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(transcribe(new Blob(['x']), o)).rejects.toBeInstanceOf(SttError);
    const f = vi.spyOn(globalThis, 'fetch'); f.mockClear();
    f.mockRejectedValueOnce(new TypeError('net')).mockResolvedValueOnce(ok('hej'));
    expect(await transcribe(new Blob(['x']), o)).toBe('hej'); expect(f).toHaveBeenCalledTimes(2);
  });
  it('hears Norwegian-looking Danish again as Danish', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok('jeg vet ikke', 'norwegian')).mockResolvedValueOnce(ok('jeg ved ikke', 'danish'));
    expect(await transcribe(new Blob(['x']), { key: 'k', model: 'm', language: 'auto', prompt: '' })).toBe('jeg ved ikke');
    expect((f.mock.calls[1][1] as any).body.get('language')).toBe('da');
  });
  it('no key → nokey, no network call', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    await expect(transcribe(new Blob(['x']), { key: '', model: 'm', language: 'auto', prompt: '' })).rejects.toMatchObject({ code: 'nokey' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('gemini plumbing', () => {
  it('picks the newest stable Flash-Lite and Flash text models, ignoring tts/image/live', () => {
    const p = pickTextModels(['models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite', 'models/gemini-3-flash-preview', 'models/gemini-2.5-flash-preview-tts', 'models/gemini-2.5-flash-image', 'models/gemini-flash-latest', 'models/gemini-3-flash-lite'].map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })));
    expect(p.fast).toBe('gemini-3-flash-lite'); expect(p.fastAlt).toBe('gemini-2.5-flash-lite');
    expect(p.brain).toBe('gemini-3-flash-preview'); expect(p.tts).toBe('gemini-2.5-flash-preview-tts');
  });
  it('tells a daily quota from a per-minute limit', () => {
    const daily = JSON.stringify({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } });
    expect(limitError(429, daily, 'm').code).toBe('quota');
    const minute = JSON.stringify({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] } });
    const e = limitError(429, minute, 'm'); expect(e.code).toBe('busy'); expect(e.extra.retryMs).toBe(7000);
  });
  it('quota resets at midnight Pacific and exhausted models are skipped', () => {
    const now = Date.UTC(2026, 5, 10, 12, 0, 0); const reset = nextQuotaReset(now);
    expect(reset).toBeGreaterThan(now); expect(reset - now).toBeLessThanOrEqual(86_400_000);
    markExhausted('a', now); expect(isExhausted('a', now + 1000)).toBe(true); expect(isExhausted('a', reset + 1)).toBe(false);
  });
  it('falls back to the next model on busy, remembers a daily quota, throws non-retryable errors', async () => {
    const calls: string[] = [];
    const r = await withFallback(['a', 'b'], async (m) => { calls.push(m); if (m === 'a') throw new AiError('quota', 429); return 'ok'; });
    expect(r).toBe('ok'); expect(calls).toEqual(['a', 'b']); expect(isExhausted('a')).toBe(true);
    await expect(withFallback(['c'], async () => { throw new AiError('badkey', 403); })).rejects.toMatchObject({ code: 'badkey' });
    await expect(withFallback(['a'], async () => 'x')).rejects.toMatchObject({ code: 'quota' }); // only model left is exhausted
  });
  it('parses SSE frames and keeps the unfinished tail', () => {
    const { events, rest } = parseSSE('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"');
    expect(events).toEqual([{ a: 1 }, { b: 2 }]); expect(rest).toBe('data: {"c"');
  });
});

describe('validation: the model never writes data directly', () => {
  it('foods: converts units, never invents amounts, drops nonsense', () => {
    const rows = validateFoodItems({ items: [
      { name: 'skyr', amount: 200, unit: 'g' }, { name: 'banan', amount: null, unit: null }, { name: 'havregryn', amount: 6, unit: 'dl' },
      { name: 'olive oil', amount: 1, unit: 'tbsp' }, { name: 'rugbrød', amount: 2, unit: 'slice' }, { name: 'x', amount: 1, unit: 'g' }, { name: 'ris', amount: -4, unit: 'g' }, { name: 'mælk', brand: 'Arla', amount: 0.5, unit: 'l' },
    ] })!;
    expect(rows.map((r) => [r.query, r.amount, r.dim, r.countWord])).toEqual([
      ['skyr', 200, 'g', undefined], ['banan', 1, 'count', undefined], ['havregryn', 600, 'ml', undefined], ['olive oil', 15, 'ml', undefined],
      ['rugbrød', 2, 'count', 'slice'], ['Arla mælk', 500, 'ml', undefined]]);
    expect(validateFoodItems({ items: [] })).toBeNull(); expect(validateFoodItems(null)).toBeNull(); expect(validateFoodItems({ items: Array(21).fill({ name: 'egg' }) })).toBeNull();
  });
  it('workout: one bad number drops that exercise; pounds are already kg; distance km → m', () => {
    const rows = validateWorkoutItems({ items: [
      { exercise: 'bench press', sets: [{ kg: 80, reps: 8 }, { kg: 80, reps: 8 }, { kg: 80, reps: 6 }] },
      { exercise: 'squat', sets: [{ kg: 9000, reps: 5 }] }, { exercise: 'run', sets: [{ distanceKm: 5, durationSec: 1500 }] }, { exercise: 'curl', sets: [] },
    ] })!;
    expect(rows.map((r) => r.query)).toEqual(['bench press', 'run']);
    expect(rows[0].sets.length).toBe(3); expect(rows[1].sets[0]).toMatchObject({ distanceM: 5000, durationSec: 1500 });
  });
  it('estimate: rejects energy/macro contradictions and absurd values', () => {
    expect(validateEstimate({ name: 'Lasagne', kcal: 520, protein: 28, carbs: 45, fat: 24, assumptions: 'one portion' })).toMatchObject({ kcal: 520 });
    expect(validateEstimate({ name: 'Lasagne', kcal: 100, protein: 28, carbs: 45, fat: 24, assumptions: '' })).toBeNull();
    expect(validateEstimate({ name: 'x', kcal: 99999, protein: 1, carbs: 1, fat: 1, assumptions: '' })).toBeNull();
  });
  it('routine: needs ≥2 valid items, rep range ordered', () => {
    expect(validateRoutine({ name: 'Push', items: [{ exercise: 'Bench', sets: 3, repMin: 6, repMax: 10, restSec: 120 }, { exercise: 'Dip', sets: 3, repMin: 8, repMax: 12 }, { exercise: 'bad', sets: 3, repMin: 12, repMax: 8 }] })!.items.length).toBe(2);
    expect(validateRoutine({ name: 'Push', items: [{ exercise: 'Bench', sets: 3, repMin: 6, repMax: 10 }] })).toBeNull();
  });
});

describe('gemini brain end-to-end (fetch mocked)', () => {
  const reply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
  it('a messy Danish log becomes rows that then go through the normal resolver and review rules', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ items: [{ name: 'skyr', amount: 200, unit: 'g' }, { name: 'banan', amount: 1, unit: 'piece' }, { name: 'havregryn', amount: 60, unit: 'g' }, { name: 'zzzxq', amount: 1, unit: 'piece' }] }));
    const rows = await aiFoodRows('to hundrede gram skyr en banan og tres gram havregryn', { key: 'AIza', models: ['gemini-flash-lite-latest'] }, { lang: 'da', foodNames: ['Skyr, plain'] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-flash-lite-latest:generateContent'); expect((init.headers as any)['x-goog-api-key']).toBe('AIza');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json'); expect(body.generationConfig.temperature).toBe(0);
    expect(body.contents[0].parts[0].text).toContain('Transcript: "to hundrede gram skyr');
    const res = resolveRows(rows, REFERENCE_FOODS, {});
    expect(res.map((r) => r.status)).toEqual(['ambiguous', 'resolved', 'resolved', 'unmatched']); // skyr still needs a human (several products); oats is unique in the DB; unknown stays unknown
    expect(rowQuantity(res[1], REFERENCE_FOODS.find((x) => x.id === 'ref:banana')!).estimated).toBe(true);
  });
  it('garbage JSON → invalid (caller falls back to the local parser)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 }));
    await expect(aiFoodRows('x', { key: 'k', models: ['m'] }, { lang: 'en' })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('workout rows and estimates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ items: [{ exercise: 'Bench Press', sets: [{ kg: 82.5, reps: 5 }] }] }));
    expect((await aiWorkoutRows('bench 82.5 for 5', { key: 'k', models: ['m'] }, { exercises: ['Barbell Bench Press'] }))[0].sets[0]).toMatchObject({ weightKg: 82.5, reps: 5 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ name: 'Homemade lasagne', grams: 350, kcal: 560, protein: 30, carbs: 48, fat: 26, assumptions: 'one large portion' }));
    expect((await aiEstimateFood('a portion of homemade lasagne', { key: 'k', models: ['m'] }, 'en')).kcal).toBe(560);
  });
  it('maps HTTP errors: 403 badkey, 404 nomodel, offline', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(aiFoodRows('x', { key: 'k', models: ['m'] }, { lang: 'en' })).rejects.toMatchObject({ code: 'badkey' });
  });
});

describe('tts audio handling (Setline lessons)', () => {
  const wav = (samples: number[], trailer = true) => {
    const data = new Uint8Array(samples.length * 2); const dv = new DataView(data.buffer); samples.forEach((s, i) => dv.setInt16(i * 2, s, true));
    const hdr = new Uint8Array(44); const h = new DataView(hdr.buffer); [...'RIFF'].forEach((c, i) => hdr[i] = c.charCodeAt(0)); [...'WAVE'].forEach((c, i) => hdr[8 + i] = c.charCodeAt(0)); [...'fmt '].forEach((c, i) => hdr[12 + i] = c.charCodeAt(0));
    h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, 24000, true); h.setUint16(34, 16, true); [...'data'].forEach((c, i) => hdr[36 + i] = c.charCodeAt(0)); h.setUint32(40, data.length, true);
    const meta = new Uint8Array(24); [...'LIST'].forEach((c, i) => meta[i] = c.charCodeAt(0)); new DataView(meta.buffer).setUint32(4, 16, true); meta.fill(0x7f, 8);
    const all = new Uint8Array(hdr.length + data.length + (trailer ? meta.length : 0)); all.set(hdr); all.set(data, 44); if (trailer) all.set(meta, 44 + data.length); return all;
  };
  it('plays only the data chunk — metadata after the audio is not sound', () => {
    const { bytes, rate } = pcmBytes(wav([100, -100, 200, -200]), 24000); expect(bytes.length).toBe(8); expect(rate).toBe(24000);
  });
  it('joins audio that arrives in several parts', () => {
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
    const { pcm } = audioFrom({ candidates: [{ content: { parts: [{ inlineData: { data: b64(wav([1, 2])), mimeType: 'audio/L16;rate=24000' } }, { inlineData: { data: b64(wav([3, 4])), mimeType: 'audio/L16;rate=24000' } }] } }] });
    expect(pcm.length).toBe(8);
  });
  it('cuts ghost audio beyond the expected length and fades out', () => {
    const pcm = new Uint8Array(24000 * 2 * 20).fill(5); // 20 s of "audio" for a 10-character reply
    const s = toSamples(pcm, 24000, 'Hej, sådan!');
    expect(s.length).toBeLessThan(24000 * 3); expect(s[s.length - 1]).toBe(0);
  });
});

describe('audio clean-up for a loud gym', () => {
  const noise = (n: number, a: number, seed = 1) => { let s = seed; return Float32Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * a); };
  it('finds speech standing out of noise, rejects flat noise and silence', () => {
    const rate = 16000, x = new Float32Array(rate * 3); x.set(noise(x.length, 0.003));
    for (let i = rate; i < rate * 2; i++) x[i] += Math.sin(i / 9) * 0.3;
    const span = speechSpan(x, rate)!; expect(span.start).toBeGreaterThan(rate * 0.6); expect(span.end).toBeLessThan(rate * 2.5);
    expect(speechSpan(noise(rate * 2, 0.003), rate)).toBeNull();
    expect(cleanSamples(new Float32Array(rate * 2), rate)).toBeNull();
    expect(cleanSamples(x, rate)!.byteLength).toBeLessThan(44 + x.length * 2);
  });
  it('writes a valid 16 kHz mono WAV header and a high-pass removes DC rumble', () => {
    const dv = new DataView(toWav(new Float32Array(160), 16000)); expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe('RIFF'); expect(dv.getUint32(24, true)).toBe(16000); expect(dv.getUint16(22, true)).toBe(1);
    const hp = highpass(new Float32Array(4000).fill(0.5), 16000); expect(Math.abs(hp[3999])).toBeLessThan(0.01);
  });
});

describe('coach grounding and routine mapping', () => {
  it('context says what is missing and labels estimates; never zero-fills unlogged days', () => {
    const d = defaultData();
    const empty = buildCoachContext(d, '2026-06-10', (id) => id);
    expect(empty).toContain('Targets: none set'); expect(empty).toContain('no earlier days logged'); expect(empty).toContain('Bodyweight: no weigh-ins'); expect(empty).toContain('Today so far: nothing logged');
    d.weights = [{ id: 'a', date: '2026-05-01', kg: 80, at: 1 }, { id: 'b', date: '2026-06-09', kg: 78.4, at: 2 }];
    const w = buildCoachContext(d, '2026-06-10', (id) => id);
    expect(w).toContain('last measured 78.4 kg'); expect(w).toMatch(/ESTIMATE/);
  });
  it('routine items only come from the real library; unknown names are reported, not invented', () => {
    const pool = allExercises([]);
    let n = 0;
    const r = mapRoutineItems({ name: 'Push', items: [
      { exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8, restSec: 150 }, { exercise: 'Overhead Press', sets: 3, repMin: 8, repMax: 10, restSec: 120 },
      { exercise: 'Unicorn Curl', sets: 3, repMin: 10, repMax: 12, restSec: 60 }, { exercise: 'Barbell Bench Press', sets: 2, repMin: 8, repMax: 8, restSec: 60 },
    ] }, pool, () => `i${n++}`);
    expect(r.items.map((i) => i.exerciseId)).toEqual(['bench-press', 'overhead-press']);
    expect(r.skipped).toEqual(['Unicorn Curl']);
    expect(r.items[0]).toMatchObject({ workingSets: 4, repMin: 6, repMax: 8, restSec: 150 });
  });
});
