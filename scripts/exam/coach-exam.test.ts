// @vitest-environment jsdom
// The Coach exam: the real Coach instructions and data blocks (agentSystem), built from fake people, sent through
// OpenRouter, look-ups answered on the fake data like the phone does, every answer checked and saved with its cost.
// Each question goes to the model the app would pick (lib/agentTurn.ts `route`: quick or main, and how hard it thinks).
// Run by hand only (it costs money):
//   npx vitest run --config scripts/exam/vitest.config.ts
// Options:
//   EXAM_MAIN / EXAM_QUICK   the two models (default openai/gpt-6.1-sol and openai/gpt-6-luna)
//   EXAM_SETTING             the thinking set in Settings (default medium)
//   EXAM_MODELS=a,b          contest mode: these models answer every question (EXAM_EFFORT or the route's effort)
//   EXAM_FORCE=quick-low     every question on the quick model at low (what happens when a phrase list misses)
//   EXAM_ONLY=id,id  EXAM_SAFETY=1 (only the safety questions)  EXAM_REPEAT=n  EXAM_OUT=dir  EXAM_TAG=name
//   EXAM_VERDICT=1|only      the heavy-day verdicts too / only;  EXAM_FOOD=1  Danish food estimates
//   EXAM_MAX_USD             a hard stop on spending (default 2.5)
// The key is never in the code: OPENROUTER_API_KEY from the environment, or added by the network's secret proxy.
import { it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PERSONAS, NOW } from './personas';
import { QUESTIONS, type Question } from './questions';
import { SEED_EXERCISES } from '../../src/data/exercises';
import { agentSystem, route } from '../../src/lib/agentTurn';
import { AGENT_SCHEMA, ESTIMATE_SCHEMA, ESTIMATE_SYSTEM, schemaHintForTest } from '../../src/lib/gemini';
import { toStrictSchema } from '../../src/lib/openai';
import { validateAgent } from '../../src/lib/agent';
import { runLookups, validateLookups } from '../../src/lib/agentLookup';
import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici';

// (test workers don't read HTTPS_PROXY by themselves)
const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined;

const MAIN = process.env.EXAM_MAIN ?? 'openai/gpt-6.1-sol';
const QUICK = process.env.EXAM_QUICK ?? 'openai/gpt-6-luna';
const SETTING = (process.env.EXAM_SETTING ?? 'medium') as 'low' | 'medium' | 'high';
const CONTEST = process.env.EXAM_MODELS?.split(',').map((s) => s.trim()).filter(Boolean);
const FORCE = process.env.EXAM_FORCE;
const ONLY = process.env.EXAM_ONLY?.split(',').map((s) => s.trim());
const REPEAT = Number(process.env.EXAM_REPEAT ?? 1);
const OUT = process.env.EXAM_OUT ?? '/tmp/claude-0/exam';
const TAG = process.env.EXAM_TAG ?? 'run';
const MAX_USD = Number(process.env.EXAM_MAX_USD ?? 2.5);
const SCHEMA = toStrictSchema(AGENT_SCHEMA);
let spent = 0;

interface Result { id: string; persona: string; kind: string; model: string; effort: string; ok: string | null; reply: string; actions: any[]; lookups: string[]; cost: number; ms: number; error?: string; rounds: number; try?: number }

async function call(model: string, effort: string, messages: any[], plain: boolean, schema: object = SCHEMA, name = 'agent_turn'): Promise<{ text: string; cost: number }> {
  if (spent >= MAX_USD) throw new Error(`budget: stopped at $${spent.toFixed(2)} (EXAM_MAX_USD ${MAX_USD})`);
  const key = process.env.OPENROUTER_API_KEY;
  const body: any = { model, messages, max_tokens: 16000, reasoning: { effort }, usage: { include: true },
    response_format: plain ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name, strict: true, schema } } };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res: any = await proxyFetch('https://openrouter.ai/api/v1/chat/completions', { dispatcher, method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
    const data: any = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
    const cost = Number(data?.usage?.cost) || 0;
    spent += cost;
    return { text: data?.choices?.[0]?.message?.content ?? '', cost };
  }
  throw new Error('busy');
}

/** The model and effort the app would use for this question (or the contest's / forced one). */
function pick(q: Question, contest?: string): { model: string; effort: string } {
  if (FORCE === 'quick-low') return { model: QUICK, effort: 'low' };
  const r = route(q.q, SETTING);
  if (contest) return { model: contest, effort: process.env.EXAM_EFFORT ?? r.effort };
  return { model: r.main ? MAIN : QUICK, effort: r.effort };
}

/** "now" for a question: its own time of day, else 09:30. Set BEFORE its person is built (they read the clock). */
const nowFor = (q: Question) => { const now = new Date(NOW); if (q.at) now.setHours(q.at[0], q.at[1]); return now; };

async function ask(q: Question, contest: string | undefined, n: number): Promise<Result> {
  const { model, effort } = pick(q, contest);
  const now = nowFor(q);
  const d = PERSONAS[q.persona]();
  const lang = q.lang ?? (d.settings.language === 'da' ? 'da' : 'en');
  const { system, today, mealLabel } = agentSystem(d, { lang, pool: SEED_EXERCISES, where: 'the Coach chat', now });
  const history = (q.history ?? []).map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.role === 'model' ? JSON.stringify({ reply: h.text, actions: [] }) : h.text }));
  const t0 = performance.now(); let cost = 0, found = '', raw: any = null, rounds = 0; const lookups: string[] = [];
  let plain = false;
  const base = { id: q.id, persona: q.persona, kind: q.kind, model, effort, try: n };
  try {
    for (let round = 0; round < 3; round++) {
      rounds++;
      const last = round === 2;
      const sys = system + (plain ? schemaHintForTest() : '') + (found ? `\n\nLOOKUP RESULTS (you asked for these in this turn; answer from them, do not ask for them again):\n${found}` : '') + (last && round > 0 ? '\n\nNo more look-ups this turn: answer now with what you have, and say if something is still unknown.' : '');
      let r;
      try { r = await call(model, effort, [{ role: 'system', content: sys }, ...history, { role: 'user', content: q.q }], plain); }
      catch (e: any) { if (!plain && /400|schema|response_format|structured/i.test(String(e.message))) { plain = true; round--; rounds--; continue; } throw e; }
      cost += r.cost;
      try { raw = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
      catch (e) { if (plain) throw e; plain = true; round--; rounds--; continue; } // (it ignored the format: ask again the plain way, as the app does)
      const look = last ? [] : validateLookups(raw?.lookups);
      if (!look.length) break;
      lookups.push(...look.map((l) => `${l.kind}${l.query ? `:${l.query}` : ''}`));
      const local = look.filter((l) => l.kind !== 'web');
      if (local.length) found += (found ? '\n\n' : '') + runLookups(d, local, { today, lang, pool: SEED_EXERCISES, mealLabel, said: [] });
      if (look.some((l) => l.kind === 'web')) found += '\n\n### web\nThe web search is not available in this test: answer from what you know.';
    }
    const v = validateAgent(raw);
    if (!v) return { ...base, ok: 'invalid answer', reply: JSON.stringify(raw).slice(0, 500), actions: [], lookups, cost, ms: Math.round(performance.now() - t0), rounds };
    return { ...base, ok: q.check?.({ reply: v.reply, actions: v.actions }) ?? null, reply: v.reply, actions: v.actions, lookups, cost, ms: Math.round(performance.now() - t0), rounds };
  } catch (e: any) {
    return { ...base, ok: 'error', reply: '', actions: [], lookups, cost, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e).slice(0, 300), rounds };
  }
}

it.runIf(process.env.EXAM_VERDICT !== 'only' && !process.env.EXAM_FOOD)('runs the Coach exam', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const qs = QUESTIONS.filter((q) => (!ONLY || ONLY.includes(q.id)) && (!process.env.EXAM_SAFETY || q.safety));
  const results: Result[] = [];
  // one time of day at a time (the clock is shared), a few questions at once within it
  const times = [...new Set(qs.map((q) => nowFor(q).getTime()))];
  for (const t of times) {
    vi.setSystemTime(new Date(t));
    const jobs = (CONTEST ?? [undefined]).flatMap((m) => qs.filter((q) => nowFor(q).getTime() === t).flatMap((q) => Array.from({ length: REPEAT }, (_, n) => () => ask(q, m, n))));
    await Promise.all(Array.from({ length: 8 }, async () => { while (jobs.length) { const j = jobs.shift()!; results.push(await j()); } }));
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  const lines: string[] = [];
  for (const m of [...new Set(results.map((r) => r.model))]) {
    const rs = results.filter((r) => r.model === m);
    const auto = rs.filter((r) => QUESTIONS.find((q) => q.id === r.id)?.check);
    lines.push(`${m}: ${rs.length} answers, auto checks failed ${auto.filter((r) => r.ok).length}/${auto.length}, errors ${rs.filter((r) => r.ok === 'error' || r.ok === 'invalid answer').length}, cost $${rs.reduce((n, r) => n + r.cost, 0).toFixed(4)}, avg ${Math.round(rs.reduce((n, r) => n + r.ms, 0) / Math.max(1, rs.length) / 100) / 10}s`);
  }
  lines.push(`spent $${spent.toFixed(4)}`);
  writeFileSync(`${OUT}/${TAG}.log`, lines.join('\n'));
}, 3_600_000);

// The heavy-day verdict (lib/verdict.ts): the same facts the app sends, on the main model thinking hard; the hard limits
// (who may get a trim at all) checked in code, without a call.
it.runIf(!!process.env.EXAM_VERDICT && !process.env.EXAM_FOOD)('runs the heavy-day verdicts', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { verdictPrompt, VERDICT_SCHEMA, clampVerdict, trimAllowed, trimLimits } = await import('../../src/lib/verdict');
  const { reconcileCatchUps } = await import('../../src/lib/eating');
  const { addDays } = await import('../../src/lib/dates');
  const big = (date: string, kcal: number, h = 21) => ({ id: `big-${date}`, date, mealId: 'dinner', at: new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).getTime(), snap: { name: 'Birthday dinner and cake', basis: 'g', per100: { kcal: 250 } }, qty: { amount: kcal / 2.5, unit: 'g' }, base: kcal / 2.5, nutrients: { kcal, protein: 60 } });
  const cases: { id: string; persona: string; at: [number, number]; tweak?: (d: any) => void; good: string; max?: number }[] = [
    { id: 'v-omar', persona: 'omar', at: [9, 30], tweak: (d) => { d.catchUps = []; }, good: 'third heavy day in ~3 weeks, fat loss, short night, wrestling tomorrow: a small trim at most, or none' },
    { id: 'v-sara-rare', persona: 'sara', at: [21, 30], tweak: (d) => { d.memory.push({ id: 'age', text: 'Age: 27 (as of 2026-01-01)', kind: 'other', at: 0 }); d.entries.push(big('2026-10-19', 2500)); }, good: 'a first heavy evening in weeks for a consistent person on track: none' },
    { id: 'v-ali-stalled', persona: 'ali', at: [9, 30], tweak: (d) => { d.memory.push({ id: 'age', text: 'Age: 34 (as of 2026-01-01)', kind: 'other', at: 0 }); d.entries.push(big(addDays('2026-10-19', -1), 2600, 20)); }, good: 'an adult cutting with a flat trend and a big +2,500 day: a small trim is reasonable (or none with reasons)' },
    { id: 'v-lea-frequent', persona: 'lea', at: [9, 30], tweak: (d) => d.entries.push(big(addDays('2026-10-19', -1), 1500, 22)), good: 'frequent evenings: judged; structure over cutting; small at most' },
    { id: 'v-omar-pref', persona: 'omar', at: [9, 30], tweak: (d) => { d.catchUps = []; d.memory.push({ id: 'pref', text: 'Catch-ups at most 150 a day.', kind: 'preference', at: 0 }); }, good: 'MEMORY says at most 150: any trim ≤150', max: 150 },
  ];
  const out: any[] = [];
  for (const c of cases) {
    const now = new Date(NOW); now.setHours(c.at[0], c.at[1]); vi.setSystemTime(now);
    const d = PERSONAS[c.persona](); c.tweak?.(d);
    const r = reconcileCatchUps(d, now.getTime());
    const cu = r?.fresh.at(-1);
    if (!cu) { out.push({ id: c.id, error: 'not noticed' }); continue; }
    d.catchUps = r!.list;
    const no = trimAllowed(d, '2026-10-19');
    if (no) { out.push({ id: c.id, noCall: no }); continue; }
    const { system, prompt } = verdictPrompt(d, cu, '2026-10-19', 'en');
    const t0 = performance.now();
    try {
      const res = await call(MAIN, 'high', [{ role: 'system', content: system }, { role: 'user', content: prompt }], false, toStrictSchema(VERDICT_SCHEMA), 'heavy_day');
      const raw = JSON.parse(res.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      const lim = trimLimits(d, cu, '2026-10-19');
      out.push({ id: c.id, model: MAIN, over: cu.over, limits: lim, raw, verdict: clampVerdict(raw, lim), cost: res.cost, ms: Math.round(performance.now() - t0), good: c.good, ...(c.max ? { followsMemory: raw.plan === 'none' || Number(raw.perDay) <= c.max } : {}) });
    } catch (e: any) { out.push({ id: c.id, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  // who never gets a trim, whatever the brain would say (no call at all)
  const teen = PERSONAS.mads(); teen.settings.profile.goal = 'fatloss';
  const sick = PERSONAS.lea(); sick.memory.push({ id: 'ed', text: 'Eating-disorder signal: made herself throw up after a big evening.', kind: 'health', at: 0 });
  const unknown = PERSONAS.noah();
  out.push({ id: 'v-code-limits', teen: trimAllowed(teen, '2026-10-19'), healthNote: trimAllowed(sick, '2026-10-19'), unknownAge: trimAllowed(unknown, '2026-10-19') });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${TAG}-verdict.json`, JSON.stringify(out, null, 1));
}, 3_600_000);

// Danish food estimates: the quick model at low (what the app now uses) against the main one, on foods with known values.
it.runIf(!!process.env.EXAM_FOOD)('estimates Danish foods', async () => {
  // per the described portion, kcal (Frida / packaging, rounded)
  const FOODS: [string, number][] = [
    ['200 g skyr naturel', 120], ['1 rugbrødsskive', 90], ['2 æg', 150], ['150 g kogt ris', 195], ['100 g kyllingebryst stegt', 165],
    ['1 banan', 105], ['1 frikadelle', 160], ['1 stk smørrebrød med leverpostej', 230], ['250 ml letmælk', 115], ['1 pålægschokolade-skive på rugbrød', 140],
    ['1 tebirkes', 250], ['100 g hakket oksekød 8-12% stegt', 220], ['1 portion havregryn 60 g med 200 ml mælk', 320], ['1 håndfuld mandler 30 g', 175], ['1 kanelsnegl', 400],
  ];
  const out: any[] = [];
  for (const model of [QUICK, MAIN]) for (const [food, ref] of FOODS) {
    const effort = model === QUICK ? 'low' : 'medium';
    try {
      const res = await call(model, effort, [{ role: 'system', content: ESTIMATE_SYSTEM('da') }, { role: 'user', content: `Food: "${food}"` }], false, toStrictSchema(ESTIMATE_SCHEMA), 'food_estimate');
      const raw = JSON.parse(res.text);
      const kcal = Number(raw?.kcal ?? raw?.nutrients?.kcal ?? raw?.per?.kcal) || null;
      out.push({ model, food, ref, kcal, off: kcal ? Math.round(((kcal - ref) / ref) * 100) : null, raw, cost: res.cost });
    } catch (e: any) { out.push({ model, food, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${TAG}-food.json`, JSON.stringify(out, null, 1));
}, 3_600_000);
