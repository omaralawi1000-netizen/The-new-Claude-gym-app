/**
 * GPT-6.1 Sol — an optional, paid brain. REST calls straight from the browser with the user's own OpenAI key (typed into
 * Settings, kept on the device, never in code, backups or logs). It answers in the same strict JSON as the Gemini path, so
 * every answer goes through the same validators before it can touch data. Gemini stays the fallback.
 *
 * The Responses API: `instructions` + `input`, `reasoning.effort` (Sol supports low…max; Aven uses medium for the orb and
 * high for the Coach), `text.format` as a strict JSON schema. The app's instructions come first and the live data last, so
 * OpenAI's prompt cache can bill the repeated part at a twentieth of the price.
 */
import { AiError, AGENT_SCHEMA, ESTIMATE_SCHEMA, ESTIMATE_SYSTEM, PHOTO_SCHEMA, PHOTO_SYSTEM, parseSSE, partialReply, photoPrompt, readPhoto, type Photo, type Turn } from './gemini';
import { validateEstimate, type FoodEstimate } from './aiValidate';
import { recordUsage } from './spend';

export const OPENAI_API = 'https://api.openai.com/v1';
export const OPENAI_MODEL = 'gpt-6.1-sol';
export type Effort = 'medium' | 'high';
export interface Sol { key: string; effort: Effort; signal?: AbortSignal }

// ── schema: Gemini's OpenAPI-style schema → a strict JSON schema ──
/**
 * Strict mode wants every property listed in `required` and no extra keys, so a field that may be left out becomes
 * "string or null" instead (the validators already treat null as absent). Types are lower-cased; Gemini-only keys dropped.
 */
export function toStrictSchema(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const type = String(s.type || '').toLowerCase();
  const optional = !!s.nullable;
  const out: any = {};
  if (s.description) out.description = s.description;
  if (type === 'object') {
    const props = s.properties || {};
    const req = new Set<string>(s.required || []);
    out.type = optional ? ['object', 'null'] : 'object';
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]: [string, any]) => [k, toStrictSchema(req.has(k) ? v : { ...v, nullable: true })]));
    out.required = Object.keys(props);
    out.additionalProperties = false;
    return out;
  }
  if (type === 'array') { out.type = optional ? ['array', 'null'] : 'array'; out.items = toStrictSchema(s.items); return out; }
  out.type = optional ? [type, 'null'] : type;
  if (Array.isArray(s.enum)) out.enum = optional ? [...s.enum, null] : s.enum;
  return out;
}
const STRICT = new WeakMap<object, any>();
const strict = (s: object) => { let v = STRICT.get(s); if (!v) { v = toStrictSchema(s); STRICT.set(s, v); } return v; };

// ── transport ───────────────────────────────────────────────
const fail = (code: ConstructorParameters<typeof AiError>[0], status = 0) => new AiError(code, status, { provider: 'openai', model: OPENAI_MODEL });
/** OpenAI's error body → one of the app's error codes. "insufficient_quota" means the account is out of credit. */
export function openaiError(status: number, body: string): AiError {
  let code = ''; try { code = JSON.parse(body)?.error?.code || JSON.parse(body)?.error?.type || ''; } catch { /* not json */ }
  if (status === 401 || status === 403) return fail('badkey', status);
  if (status === 404 || code === 'model_not_found') return fail('nomodel', status);
  if (status === 429) return fail(code === 'insufficient_quota' ? 'quota' : 'busy', status);
  if (status === 400) return fail('badrequest', status);
  if (status >= 500) return fail('busy', status);
  return fail('failed', status);
}

async function request(key: string, body: unknown, { timeout, signal }: { timeout: number; signal?: AbortSignal }) {
  if (navigator.onLine === false) throw fail('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
  let res: Response;
  try {
    res = await fetch(`${OPENAI_API}/responses`, { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e: any) { done(); throw fail(e?.name === 'AbortError' ? (signal?.aborted ? 'aborted' : 'timeout') : 'network'); }
  if (!res.ok) { const text = await res.text().catch(() => ''); done(); throw openaiError(res.status, text); }
  return { res, done, ctl };
}

/** The text of a finished (non-streamed) response: every output_text piece of the message, in order. */
export function outputText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  return (data?.output || []).filter((o: any) => o?.type === 'message').flatMap((o: any) => o.content || []).filter((c: any) => c?.type === 'output_text').map((c: any) => c.text || '').join('');
}

type Input = { role: 'user' | 'assistant'; content: string | { type: string; [k: string]: unknown }[] }[];
const toInput = (turns: Turn[], photo?: Photo): Input => turns.map((x, i) => {
  const text = x.parts.map((p) => p.text).join('');
  // a photo rides with the last message, in front of its words
  if (photo && i === turns.length - 1 && x.role === 'user') return { role: 'user', content: [{ type: 'input_image', image_url: `data:${photo.mime};base64,${photo.data}` }, { type: 'input_text', text }] };
  return { role: x.role === 'model' ? 'assistant' : 'user', content: text };
});
const body = (o: { system: string; input: Input; schema: object; name: string; effort: Effort; stream?: boolean; maxTokens: number; cacheKey: string }) => ({
  model: OPENAI_MODEL, instructions: o.system, input: o.input, stream: !!o.stream, store: false,
  reasoning: { effort: o.effort },
  text: { format: { type: 'json_schema', name: o.name, schema: strict(o.schema), strict: true } },
  // reasoning tokens count toward this, so it has room to think before it writes
  max_output_tokens: o.maxTokens, prompt_cache_key: o.cacheKey,
});
// how long it may think before the first word: high effort thinks longer
const firstWait = (effort: Effort) => (effort === 'high' ? 120_000 : 60_000);

async function json(sol: Sol, o: { system: string; input: Input; schema: object; name: string; maxTokens?: number; cacheKey: string }): Promise<any> {
  const { res, done } = await request(sol.key, body({ ...o, effort: sol.effort, maxTokens: o.maxTokens ?? (sol.effort === 'high' ? 24000 : 12000) }), { timeout: firstWait(sol.effort), signal: sol.signal });
  try {
    const data = await res.json();
    recordUsage(data?.usage);
    if (data?.status === 'incomplete' && !outputText(data)) throw fail('empty');
    try { return JSON.parse(outputText(data)); } catch { throw fail('invalid'); }
  } finally { done(); }
}

/**
 * A streamed answer: `onText(fullSoFar)` as the words arrive. While it thinks, OpenAI sends no text, so the first wait is
 * long; once words flow, a stream that goes quiet for 25 s with some text counts as finished.
 */
async function stream(sol: Sol, o: { system: string; input: Input; schema: object; name: string; cacheKey: string }, onText: (t: string) => void): Promise<string> {
  const { res, done, ctl } = await request(sol.key, body({ ...o, effort: sol.effort, stream: true, maxTokens: sol.effort === 'high' ? 24000 : 12000 }), { timeout: firstWait(sol.effort) + 60_000, signal: sol.signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '', failed: AiError | null = null, idle: ReturnType<typeof setTimeout> | undefined;
  const handle = (ev: any) => {
    if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') { full += ev.delta; onText(full); }
    else if (ev?.type === 'response.completed' || ev?.type === 'response.incomplete') recordUsage(ev.response?.usage);
    else if (ev?.type === 'response.failed' || ev?.type === 'error') failed = fail('failed');
    if (ev?.type === 'response.incomplete' && !full) failed = fail('empty');
  };
  try {
    for (;;) {
      if (full) { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 25_000); }
      let r: ReadableStreamReadResult<Uint8Array>;
      try { r = await reader.read(); } catch { if (full.trim()) break; throw fail(sol.signal?.aborted ? 'aborted' : 'timeout'); }
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      const { events, rest } = parseSSE(buf);
      buf = rest;
      events.forEach(handle);
    }
    parseSSE(buf + '\n\n').events.forEach(handle);
  } finally { clearTimeout(idle); done(); }
  if (failed && !full.trim()) throw failed;
  if (!full.trim()) throw fail('empty');
  return full.trim();
}

// ── what the app asks ───────────────────────────────────────
/** One agent turn (the orb and the Coach): { reply, actions }, unvalidated — see agent.ts. Streams the reply when watched. */
export async function solAgent(system: string, turns: Turn[], sol: Sol, onReply?: (text: string) => void, photo?: Photo): Promise<unknown> {
  const o = { system, input: toInput(turns, photo), schema: AGENT_SCHEMA, name: 'agent_turn', cacheKey: 'aven-agent' };
  if (!onReply) return json(sol, o);
  let shown = '';
  const full = await stream(sol, o, (all) => { const r = partialReply(all); if (r !== shown) { shown = r; onReply(r); } });
  try { return JSON.parse(full); } catch { throw fail('invalid'); }
}

/** A rough estimate for a food that is in no database (shown as an ESTIMATE for review). */
export async function solEstimateFood(description: string, sol: Sol, lang: string): Promise<FoodEstimate> {
  const raw = await json(sol, { system: ESTIMATE_SYSTEM(lang), input: [{ role: 'user', content: `Food: "${description}"` }], schema: ESTIMATE_SCHEMA, name: 'food_estimate', cacheKey: 'aven-estimate' });
  const est = validateEstimate(raw);
  if (!est) throw fail('invalid');
  return est;
}

/** A photo of a meal → one estimate per visible item. */
export async function solEstimatePhoto(image: { mime: string; data: string }, sol: Sol, lang: string, hint = ''): Promise<{ items: FoodEstimate[]; assumptions: string }> {
  const raw = await json(sol, {
    system: PHOTO_SYSTEM(lang), name: 'meal_photo', cacheKey: 'aven-photo',
    input: [{ role: 'user', content: [{ type: 'input_image', image_url: `data:${image.mime};base64,${image.data}` }, { type: 'input_text', text: photoPrompt(hint) }] }],
    schema: PHOTO_SCHEMA,
  });
  return readPhoto(raw);
}

/** Settings → Test: can this key use GPT-6.1 Sol? ('nomodel': the key works but the model isn't enabled on the account.) */
export async function testOpenaiKey(key: string): Promise<'ok' | 'bad' | 'nomodel' | 'offline' | string> {
  try {
    const res = await fetch(`${OPENAI_API}/models/${OPENAI_MODEL}`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'bad';
    if (res.status === 404) return 'nomodel';
    return String(res.status);
  } catch { return 'offline'; }
}
