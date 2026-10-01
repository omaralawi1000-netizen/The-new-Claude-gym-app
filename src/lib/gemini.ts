/**
 * Gemini — "the brain". REST calls straight from the browser with the user's own key (typed into Settings, kept on the device).
 * Pattern from Setline: newest stable models picked from the key's model list, fallbacks on busy/quota, strict JSON schemas,
 * and EVERY answer validated before it can touch data. Only the text needed for a request leaves the phone.
 */
import type { ParsedFoodRow } from './foodText';
import type { ParsedWorkoutRow } from './workoutText';
import { MAX_ITEMS, validateFoodItems, validateWorkoutItems, validateEstimate, validateRoutine, type FoodEstimate, type RoutineDraft } from './aiValidate';

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** Google's rolling aliases always point at the newest Flash / Flash-Lite: a safe last resort. */
export const FALLBACK_MODELS = { fast: 'gemini-flash-lite-latest', brain: 'gemini-flash-latest' };

// ── model choice (pure) ─────────────────────────────────────
const idOf = (m: any): string => String(m?.name || m).replace(/^models\//, '');
const canGenerate = (m: any) => typeof m === 'string' || !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent');
const version = (s: string) => Number((s.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
const tier = (s: string) => (/(exp|experimental)/.test(s) ? 3 : /latest/.test(s) ? 2 : /preview/.test(s) ? 1 : 0);
const SPECIAL = /(tts|image|live|audio|embedding|aqa|vision|thinking|learnlm|robotics|computer|nano|gemma|imagen|veo)/;
export function rankModels(list: string[]): string[] {
  return [...list].sort((a, b) => Number(tier(a) >= 2) - Number(tier(b) >= 2) || version(b) - version(a) || tier(a) - tier(b) || a.length - b.length);
}
export function pickTextModels(models: any[]) {
  const ids = models.filter(canGenerate).map(idOf).filter((s) => /^gemini/.test(s) && !SPECIAL.test(s));
  const lite = rankModels(ids.filter((s) => /flash-lite/.test(s)));
  const flash = rankModels(ids.filter((s) => /flash/.test(s) && !/lite/.test(s)));
  const tts = rankModels(models.map(idOf).filter((s) => /tts/.test(s) && /flash/.test(s)));
  return { fast: lite[0] ?? '', fastAlt: lite[1] ?? '', brain: flash[0] ?? '', brainAlt: flash[1] ?? '', tts: tts[0] ?? '' };
}

// ── errors, limits, quota memory ────────────────────────────
export class AiError extends Error {
  constructor(public code: 'offline' | 'timeout' | 'network' | 'aborted' | 'badkey' | 'badrequest' | 'nomodel' | 'busy' | 'quota' | 'failed' | 'invalid' | 'empty' | 'nokey', public status = 0, public extra: { model?: string; retryMs?: number | null; resetAt?: number } = {}) { super(code); }
}
export function limitError(status: number, body: string, modelId = ''): AiError {
  let j: any = null; try { j = JSON.parse(body); } catch { /* not json */ }
  const details: any[] = j?.error?.details || [];
  const quotaIds = details.flatMap((d) => d.violations || []).map((v: any) => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
  const delay = details.find((d) => /RetryInfo/.test(d['@type'] || ''))?.retryDelay;
  const retryMs = delay ? Math.round(parseFloat(delay) * 1000) : null;
  if (status === 429 && /PerDay/i.test(quotaIds)) return new AiError('quota', 429, { model: modelId });
  return new AiError('busy', status, { model: modelId, retryMs: Number.isFinite(retryMs as number) ? retryMs : null });
}
const EXHAUSTED = 'aven.exhausted';
export function nextQuotaReset(now = Date.now()): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return now - ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + 86_400_000;
}
const readEx = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(EXHAUSTED) || '{}') || {}; } catch { return {}; } };
export function markExhausted(m: string, now = Date.now()) { if (!m) return; const ex = readEx(); ex[m] = nextQuotaReset(now); try { localStorage.setItem(EXHAUSTED, JSON.stringify(ex)); } catch { /* ignore */ } }
export const isExhausted = (m: string, now = Date.now()) => (readEx()[m] || 0) > now;

const modelOf = (path: string) => decodeURIComponent(/models\/([^:/?]+)/.exec(path)?.[1] || '');
async function post(path: string, key: string, body: unknown, { timeout = 0, signal }: { timeout?: number; signal?: AbortSignal } = {}) {
  if (navigator.onLine === false) throw new AiError('offline');
  const ctl = new AbortController();
  const timer = timeout ? setTimeout(() => ctl.abort(), timeout) : 0;
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  let res: Response;
  try { res = await fetch(`${API}/${path}`, { method: 'POST', signal: ctl.signal, headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e: any) { clearTimeout(timer); throw new AiError(e?.name === 'AbortError' ? (signal?.aborted ? 'aborted' : 'timeout') : 'network'); }
  const fail = (e: AiError) => { clearTimeout(timer); return e; };
  if (res.status === 400) throw fail(new AiError('badrequest', 400));
  if (res.status === 401 || res.status === 403) throw fail(new AiError('badkey', res.status));
  if (res.status === 404) throw fail(new AiError('nomodel', 404));
  if (res.status === 429 || res.status === 503) throw fail(limitError(res.status, await res.text().catch(() => ''), modelOf(path)));
  if (!res.ok) throw fail(new AiError('failed', res.status));
  return { res, done: () => clearTimeout(timer) };
}
const textOf = (res: any): string => (res?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');

export async function listModels(key: string): Promise<{ status: 'ok'; models: any[] } | { status: string }> {
  try {
    const res = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
    if (res.status === 400 || res.status === 401 || res.status === 403) return { status: 'bad' };
    if (!res.ok) return { status: String(res.status) };
    return { status: 'ok', models: (await res.json()).models || [] };
  } catch { return { status: 'offline' }; }
}

export const retryable = (e: unknown) => e instanceof AiError && (e.code === 'busy' || e.code === 'quota' || e.code === 'nomodel' || e.code === 'empty' || (e.code === 'failed' && e.status >= 500));
/** Run fn(model) with the chosen model, then the runner-ups. Models out of daily quota are skipped (and remembered). */
export async function withFallback<T>(models: string[], fn: (m: string) => Promise<T>, { rounds = 1, wait = 1500, maxWait = 12000, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), now = () => Date.now() } = {}): Promise<T> {
  let list = [...new Set(models.filter(Boolean))].filter((m) => !isExhausted(m, now()));
  if (!list.length) throw new AiError('quota', 429, { resetAt: nextQuotaReset(now()) });
  let last: unknown, waited = false;
  for (let round = 0; round < rounds; round++) {
    if (round) await sleep(wait * round);
    for (const m of list) {
      try { return await fn(m); } catch (e: any) {
        last = e;
        if (!retryable(e)) throw e;
        if (e.code === 'quota') markExhausted(m, now());
        else if (e.code === 'busy' && e.extra?.retryMs && e.extra.retryMs <= maxWait && !waited && m === list[list.length - 1]) {
          waited = true; await sleep(e.extra.retryMs);
          try { return await fn(m); } catch (e2) { last = e2; if (!retryable(e2)) throw e2; }
        }
      }
    }
    list = list.filter((m) => !isExhausted(m, now()));
    if (!list.length) throw new AiError('quota', 429, { resetAt: nextQuotaReset(now()) });
    const code = (last as AiError)?.code;
    if (code !== 'busy' && code !== 'empty' && code !== 'quota') break;
  }
  throw last;
}

// ── structured JSON calls ───────────────────────────────────
async function generateJson(key: string, model: string, { system, prompt, schema, temperature = 0, maxOutputTokens = 1024, timeout = 9000, signal, image }: { system: string; prompt: string; schema: unknown; temperature?: number; maxOutputTokens?: number; timeout?: number; signal?: AbortSignal; image?: { mime: string; data: string } }): Promise<any> {
  const { res, done } = await post(`models/${encodeURIComponent(model)}:generateContent`, key, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: image ? [{ inline_data: { mime_type: image.mime, data: image.data } }, { text: prompt }] : [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens },
  }, { timeout, signal });
  try {
    const data = await res.json();
    try { return JSON.parse(textOf(data)); } catch { throw new AiError('invalid'); }
  } finally { done(); }
}

export interface Brain { key: string; models: string[]; signal?: AbortSignal }

const FOOD_UNITS = ['g', 'kg', 'ml', 'dl', 'cl', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'slice', 'handful', 'glass', 'can', 'scoop', 'bowl', 'serving'];
const FOOD_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    name: { type: 'STRING', description: 'the food, generic and singular, in the language it was said (e.g. skyr, banan, havregryn, rye bread)' },
    brand: { type: 'STRING', nullable: true, description: 'brand only if the user said one' },
    amount: { type: 'NUMBER', nullable: true, description: 'quantity exactly as said; null if no quantity was said' },
    unit: { type: 'STRING', nullable: true, enum: FOOD_UNITS },
    state: { type: 'STRING', nullable: true, enum: ['raw', 'cooked', 'dry'], description: 'only if said (e.g. "cooked rice")' },
  }, required: ['name'] } } },
  required: ['items'],
};
const FOOD_SYSTEM = 'You extract the foods and drinks from a spoken food log (English or Danish, produced by speech recognition, so words may be misheard). ' +
  'Return one item per food. Copy quantities exactly as said; NEVER invent or guess an amount (amount null if none was said). ' +
  'Convert number words to numbers ("to æg" = 2 eggs). Use the unit the user said; "a banana" is amount 1, unit piece. ' +
  'Do not add foods that were not said and do not estimate nutrition. Ignore filler words and anything that is not food.';

export async function aiFoodRows(text: string, brain: Brain, ctx: { foodNames?: string[]; lang: string }): Promise<ParsedFoodRow[]> {
  const prompt = `${ctx.lang === 'da' ? 'The app language is Danish.' : 'The app language is English.'}\n${ctx.foodNames?.length ? `Foods this user often logs (use these spellings when they match): ${ctx.foodNames.slice(0, 40).join(', ')}.\n` : ''}Transcript: "${text}"`;
  const raw = await withFallback(brain.models, (m) => generateJson(brain.key, m, { system: FOOD_SYSTEM, prompt, schema: FOOD_SCHEMA, signal: brain.signal }));
  const rows = validateFoodItems(raw);
  if (!rows) throw new AiError('invalid');
  return rows;
}

const WORKOUT_SCHEMA = {
  type: 'OBJECT',
  properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    exercise: { type: 'STRING', description: 'the exercise name, as close as possible to one in the given catalog' },
    sets: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      kg: { type: 'NUMBER', nullable: true, description: 'weight in kilograms (convert pounds)' },
      reps: { type: 'INTEGER', nullable: true },
      durationSec: { type: 'INTEGER', nullable: true },
      distanceKm: { type: 'NUMBER', nullable: true },
    } } },
  }, required: ['exercise', 'sets'] } } },
  required: ['items'],
};
const WORKOUT_SYSTEM = 'You turn a spoken gym log (English or Danish, from speech recognition, may be misheard) into exercises with sets. ' +
  'One item per exercise; one set object per set in order ("80 for 8, 8 and 6" = three sets). Use only numbers that were said; never invent weights or reps. ' +
  'Weights are kilograms: convert pounds. For timed or distance exercises use durationSec / distanceKm. Pick the exercise name from the catalog when one clearly matches.';

export async function aiWorkoutRows(text: string, brain: Brain, ctx: { exercises: string[] }): Promise<ParsedWorkoutRow[]> {
  const prompt = `Exercise catalog: ${ctx.exercises.join(', ')}.\nTranscript: "${text}"`;
  const raw = await withFallback(brain.models, (m) => generateJson(brain.key, m, { system: WORKOUT_SYSTEM, prompt, schema: WORKOUT_SCHEMA, signal: brain.signal }));
  const rows = validateWorkoutItems(raw);
  if (!rows) throw new AiError('invalid');
  return rows;
}

const ESTIMATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, grams: { type: 'NUMBER', nullable: true, description: 'estimated total weight of the described portion in grams' },
    kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' },
    assumptions: { type: 'STRING', description: 'one short sentence: what portion/ingredients you assumed' },
  },
  required: ['name', 'kcal', 'protein', 'carbs', 'fat', 'assumptions'],
};
/** A rough estimate for a food that is in no database. Always shown as an ESTIMATE for review — never exact. */
export async function aiEstimateFood(description: string, brain: Brain, lang: string): Promise<FoodEstimate> {
  const system = 'You estimate the nutrition of ONE described food or dish for a food log. Give typical values for the described portion; if the portion is vague assume a normal single serving. ' +
    `State your assumptions in one short sentence in ${lang === 'da' ? 'Danish' : 'English'}. Numbers are for the whole described portion, not per 100 g.`;
  const raw = await withFallback(brain.models, (m) => generateJson(brain.key, m, { system, prompt: `Food: "${description}"`, schema: ESTIMATE_SCHEMA, temperature: 0.2, signal: brain.signal, timeout: 12000 }));
  const est = validateEstimate(raw);
  if (!est) throw new AiError('invalid');
  return est;
}

const PHOTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, grams: { type: 'NUMBER', nullable: true, description: 'estimated weight of this item on the plate in grams' },
      kcal: { type: 'NUMBER' }, protein: { type: 'NUMBER' }, carbs: { type: 'NUMBER' }, fat: { type: 'NUMBER' },
    }, required: ['name', 'kcal', 'protein', 'carbs', 'fat'] } },
    assumptions: { type: 'STRING', description: 'one short sentence: portion sizes / hidden ingredients you assumed' },
    notFood: { type: 'BOOLEAN', description: 'true if the photo does not show food or drink' },
  },
  required: ['items', 'assumptions'],
};
/** A photo of a meal → one estimate per visible item. Always shown as ESTIMATES for review — never exact. */
export async function aiEstimatePhoto(image: { mime: string; data: string }, brain: Brain, lang: string, hint = ''): Promise<{ items: FoodEstimate[]; assumptions: string }> {
  const system = 'You estimate the nutrition of a meal from a photo for a food log. List each distinct food or drink you can see (max 8) with an estimated weight and its nutrition for that amount. ' +
    'Judge portion size from the plate, cutlery and hands. Include likely cooking oil or sauce only if visible. Be realistic, not optimistic. ' +
    `Name items and write the assumptions in ${lang === 'da' ? 'Danish' : 'English'}. If it is not food, return no items and notFood true.`;
  const raw = await withFallback(brain.models, (m) => generateJson(brain.key, m, { system, prompt: hint ? `The user says: "${hint}"` : 'Estimate this meal.', schema: PHOTO_SCHEMA, temperature: 0.2, maxOutputTokens: 1536, timeout: 25000, signal: brain.signal, image }));
  const assumptions = typeof raw?.assumptions === 'string' ? raw.assumptions.slice(0, 240) : '';
  const items = (Array.isArray(raw?.items) ? raw.items : []).slice(0, 8).map((x: any) => validateEstimate({ ...x, assumptions })).filter(Boolean) as FoodEstimate[];
  if (!items.length) throw new AiError(raw?.notFood ? 'invalid' : 'empty');
  return { items, assumptions };
}

const ROUTINE_SCHEMA = {
  type: 'OBJECT',
  properties: { name: { type: 'STRING' }, note: { type: 'STRING', nullable: true }, items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    exercise: { type: 'STRING' }, sets: { type: 'INTEGER' }, repMin: { type: 'INTEGER' }, repMax: { type: 'INTEGER' }, restSec: { type: 'INTEGER', nullable: true },
  }, required: ['exercise', 'sets', 'repMin', 'repMax'] } } },
  required: ['name', 'items'],
};
export async function aiRoutine(request: string, brain: Brain, ctx: { exercises: string[]; profile: string; lang: string }): Promise<RoutineDraft> {
  const system = 'You design ONE gym routine (a single session) from the user request, using ONLY exercises from the catalog (exact names). ' +
    '4–8 exercises, compound lifts first, sensible sets (2–5) and rep ranges, rest in seconds. Respect their equipment and experience. ' +
    `Write the name${ctx.lang === 'da' ? ' in Danish' : ''}. No medical advice.`;
  const prompt = `User profile: ${ctx.profile}\nExercise catalog: ${ctx.exercises.join(', ')}\nRequest: "${request}"`;
  const raw = await withFallback(brain.models, (m) => generateJson(brain.key, m, { system, prompt, schema: ROUTINE_SCHEMA, temperature: 0.4, maxOutputTokens: 2048, timeout: 20000, signal: brain.signal }));
  const r = validateRoutine(raw);
  if (!r) throw new AiError('invalid');
  return r;
}

// ── streaming chat (the Coach) ──────────────────────────────
export function parseSSE(buffer: string): { events: any[]; rest: string } {
  const events: any[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch { /* skip a bad frame */ }
  }
  return { events, rest };
}
const noThinking = new Set<string>();
export interface Turn { role: 'user' | 'model'; parts: { text: string }[] }

/** Stream an answer; onText(fullSoFar) per chunk. A stream that goes quiet after some text counts as the answer. */
export async function streamChat({ key, model, system, contents, onText, signal, firstByteTimeout = 20000, firstChunkTimeout = 60000, idleTimeout = 25000 }: {
  key: string; model: string; system: string; contents: Turn[]; onText?: (t: string) => void; signal?: AbortSignal; firstByteTimeout?: number; firstChunkTimeout?: number; idleTimeout?: number;
}): Promise<string> {
  const think = !noThinking.has(model);
  let posted;
  try {
    posted = await post(`models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, key, {
      systemInstruction: { parts: [{ text: system }] }, contents,
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096, ...(think ? { thinkingConfig: { thinkingBudget: 1024 } } : {}) },
    }, { timeout: firstByteTimeout, signal });
  } catch (e) {
    if (think && e instanceof AiError && e.code === 'badrequest') { noThinking.add(model); return streamChat({ key, model, system, contents, onText, signal, firstByteTimeout, firstChunkTimeout, idleTimeout }); }
    throw e;
  }
  const { res, done } = posted;
  done();
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  const read = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const off = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { off(); reader.cancel().catch(() => {}); reject(new AiError('aborted')); };
    if (signal?.aborted) return onAbort();
    timer = setTimeout(() => { off(); reader.cancel().catch(() => {}); reject(new AiError('timeout')); }, full ? idleTimeout : firstChunkTimeout);
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.read().then((r) => { off(); resolve(r); }, () => { off(); reject(new AiError(signal?.aborted ? 'aborted' : 'network')); });
  });
  for (;;) {
    let r;
    try { r = await read(); } catch (e: any) { if (e.code === 'timeout' && full.trim()) break; throw e; }
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true });
    const { events, rest } = parseSSE(buf);
    buf = rest;
    for (const ev of events) { const piece = textOf(ev); if (piece) { full += piece; onText?.(full); } }
  }
  for (const ev of parseSSE(buf + '\n\n').events) { const piece = textOf(ev); if (piece) { full += piece; onText?.(full); } }
  if (!full.trim()) throw new AiError('empty');
  return full.trim();
}

/** Human-readable reason, for the UI (never a stack trace). */
export function aiErrorText(e: unknown, t: (k: string) => string): string {
  const code = e instanceof AiError ? e.code : 'failed';
  return ({
    offline: t('You’re offline.'), timeout: t('Gemini took too long. Try again.'), network: t('Couldn’t reach Gemini. Check your connection.'),
    badkey: t('Gemini rejected the key. Check it in Settings → Voice & AI.'), badrequest: t('Gemini couldn’t handle that request.'), nomodel: t('That Gemini model isn’t available for your key.'),
    busy: t('Gemini is busy right now. Try again in a moment.'), quota: t('Today’s free Gemini quota is used up. It resets at midnight Pacific time.'),
    invalid: t('Gemini’s answer didn’t make sense, so it was ignored.'), empty: t('Gemini sent an empty answer. Try again.'), aborted: t('Stopped.'), nokey: t('Add a Gemini key in Settings → Voice & AI.'), failed: t('Gemini failed. Try again.'),
  } as Record<string, string>)[code] ?? t('Gemini failed. Try again.');
}
export { MAX_ITEMS };
