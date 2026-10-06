// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toStrictSchema, openaiError, outputText, solAgent, solEstimateFood, OPENAI_MODEL } from '../src/lib/openai';
import { solThenGemini } from '../src/lib/brain';
import { AGENT_SCHEMA, AiError } from '../src/lib/gemini';
import { validateAgent } from '../src/lib/agent';

beforeEach(() => { vi.restoreAllMocks(); });

/** Every object in a strict schema must list all its properties as required and allow nothing else. */
function checkStrict(s: any, path = '$'): string[] {
  const bad: string[] = [];
  const types = [].concat(s.type);
  if (types.includes('object' as never)) {
    if (s.additionalProperties !== false) bad.push(`${path}: additionalProperties`);
    const keys = Object.keys(s.properties || {});
    if (JSON.stringify([...keys].sort()) !== JSON.stringify([...(s.required || [])].sort())) bad.push(`${path}: required`);
    for (const k of keys) bad.push(...checkStrict(s.properties[k], `${path}.${k}`));
  }
  if (types.includes('array' as never)) bad.push(...checkStrict(s.items, `${path}[]`));
  for (const t of types) if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(t)) bad.push(`${path}: type ${t}`);
  if (s.enum && types.includes('null' as never) && !s.enum.includes(null)) bad.push(`${path}: enum without null`);
  return bad;
}

describe('strict schema from the Gemini schema', () => {
  it('turns the whole agent schema into a valid strict JSON schema', () => {
    const s = toStrictSchema(AGENT_SCHEMA);
    expect(checkStrict(s)).toEqual([]);
    expect(Object.keys(s.properties)[0]).toBe('reply'); // the reply streams first
  });
  it('makes optional fields nullable instead of leaving them out', () => {
    const s = toStrictSchema({ type: 'OBJECT', properties: { a: { type: 'STRING' }, b: { type: 'NUMBER' }, u: { type: 'STRING', nullable: true, enum: ['g', 'ml'] } }, required: ['a'] });
    expect(s.properties.a.type).toBe('string');
    expect(s.properties.b.type).toEqual(['number', 'null']);
    expect(s.properties.u.enum).toEqual(['g', 'ml', null]);
    expect(s.required).toEqual(['a', 'b', 'u']);
  });
});

describe('errors', () => {
  it('maps OpenAI statuses to the app’s codes, out of credit included', () => {
    expect(openaiError(401, '').code).toBe('badkey');
    expect(openaiError(429, JSON.stringify({ error: { code: 'insufficient_quota' } })).code).toBe('quota');
    expect(openaiError(429, JSON.stringify({ error: { code: 'rate_limit_exceeded' } })).code).toBe('busy');
    expect(openaiError(404, '').code).toBe('nomodel');
    expect(openaiError(503, '').code).toBe('busy');
    expect(openaiError(400, '').extra.provider).toBe('openai');
  });
});

describe('answers', () => {
  it('reads the text out of a finished response, skipping reasoning items', () => {
    expect(outputText({ output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] }] })).toBe('{"a":1}');
  });

  const sse = (events: object[]) => new Response(new ReadableStream({
    start(c) { const enc = new TextEncoder(); for (const e of events) c.enqueue(enc.encode(`event: ${(e as any).type}\ndata: ${JSON.stringify(e)}\n\n`)); c.close(); },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });

  it('streams the agent reply word by word, then returns the whole answer', async () => {
    const answer = JSON.stringify({ reply: 'Logged your skyr.', actions: [{ type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g', brand: null, state: null }] }] });
    const cut = [answer.slice(0, 15), answer.slice(15, 30), answer.slice(30)];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sse([{ type: 'response.created' }, ...cut.map((d) => ({ type: 'response.output_text.delta', delta: d })), { type: 'response.completed' }]));
    const seen: string[] = [];
    const raw = await solAgent('SYSTEM', [{ role: 'user', parts: [{ text: '200 g skyr' }] }], { key: 'sk-test', effort: 'medium' }, (r) => seen.push(r));
    expect(validateAgent(raw)?.actions[0].type).toBe('log_food');
    expect(seen.at(-1)).toBe('Logged your skyr.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: OPENAI_MODEL, instructions: 'SYSTEM', stream: true, store: false, reasoning: { effort: 'medium' }, text: { format: { type: 'json_schema', strict: true } } });
    expect(body.input).toEqual([{ role: 'user', content: '200 g skyr' }]);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('asks with the effort it is given (high for the Coach) and parses a plain answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ name: 'Lasagne', grams: 350, kcal: 600, protein: 30, carbs: 50, fat: 28, assumptions: 'one plate' }) }] }] }), { status: 200 }));
    const est = await solEstimateFood('a plate of lasagne', { key: 'sk-test', effort: 'high' }, 'en');
    expect(est.kcal).toBe(600);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).reasoning.effort).toBe('high');
  });

  it('turns an out-of-credit answer into a clear error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 }));
    await expect(solEstimateFood('x', { key: 'sk', effort: 'medium' }, 'en')).rejects.toMatchObject({ code: 'quota' });
  });
});

describe('Sol first, Gemini second', () => {
  const brain = (gem = 'AIza') => ({ key: gem, models: ['m'], sol: { key: 'sk', effort: 'medium' as const } });
  it('uses Sol when it answers', async () => {
    const r = await solThenGemini(brain(), async () => 'sol', async () => 'gemini');
    expect(r).toEqual({ value: 'sol', fellBack: null });
  });
  it('falls back to Gemini and says why', async () => {
    const r = await solThenGemini(brain(), async () => { throw new AiError('quota', 429, { provider: 'openai' }); }, async () => 'gemini');
    expect(r.value).toBe('gemini'); expect(r.fellBack?.code).toBe('quota');
  });
  it('never falls back when you stopped it, or when there is no Gemini key', async () => {
    await expect(solThenGemini(brain(), async () => { throw new AiError('aborted'); }, async () => 'gemini')).rejects.toMatchObject({ code: 'aborted' });
    await expect(solThenGemini(brain(''), async () => { throw new AiError('busy'); }, async () => 'gemini')).rejects.toMatchObject({ code: 'busy' });
  });
});

// Strict mode answers with EVERY field, null where nothing was said; the validators were written for Gemini, which leaves them out.
const itemKeys = Object.keys((AGENT_SCHEMA as any).properties.actions.items.properties);
const fill = (o: any, keys: string[]) => Object.fromEntries(keys.map((k) => [k, k in o ? o[k] : null]));
const foodKeys = Object.keys((AGENT_SCHEMA as any).properties.actions.items.properties.foods.items.properties);
const bitKeys = ['exercise', 'sets', 'repMin', 'repMax', 'restSec'];
const samples = [
  { type: 'log_food', foods: [{ name: 'skyr', amount: 200, unit: 'g' }], meal: 'lunch' },
  { type: 'log_water', ml: 500 }, { type: 'log_weight', kg: 81.4 },
  { type: 'log_sets', exercises: [{ exercise: 'Barbell Bench Press', sets: [{ kg: 100, reps: 8 }] }] },
  { type: 'log_activity', kind: 'wrestling', minutes: 60 }, { type: 'start_workout', routine: 'Push' }, { type: 'navigate', screen: 'progress' },
  { type: 'set_setting', key: 'theme', value: 'light' }, { type: 'edit_food', target: 'skyr', amount: 250, unit: 'g' }, { type: 'delete_food', target: 'skyr' },
  { type: 'move_food', target: 'skyr', meal_to: 'dinner' }, { type: 'edit_set', exercise: 'bench press', kg: 90 },
  { type: 'create_routine', name: 'Push day', add: [{ exercise: 'Barbell Bench Press', sets: 4, repMin: 6, repMax: 8 }] },
  { type: 'edit_routine', routine: 'Push', remove: ['Lateral Raise'] }, { type: 'set_schedule', weekday: 1, routine: 'Push' }, { type: 'replace_exercise', from: 'bench press', to: 'Incline Dumbbell Press' },
  { type: 'add_note', text: 'felt strong' }, { type: 'undo_last' },
];
describe('strict answers', () => { it('reads Sol-style nulls (every field present) exactly like missing fields', () => {
  for (const a of samples) {
    const plain = validateAgent({ reply: 'ok', actions: [a] });
    const withNulls: any = fill(a, itemKeys);
    if (withNulls.foods) withNulls.foods = withNulls.foods.map((f: any) => fill(f, foodKeys));
    if (withNulls.add) withNulls.add = withNulls.add.map((f: any) => fill(f, bitKeys));
    const nulls = validateAgent({ reply: 'ok', actions: [withNulls] });
    expect(nulls, a.type).toEqual(plain);
  }
});
});
