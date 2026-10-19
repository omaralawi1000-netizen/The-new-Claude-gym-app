// @vitest-environment jsdom
// The Coach exam: the real Coach instructions and data blocks (agentSystem), built from fake people, sent to each model
// through OpenRouter, look-ups answered on the fake data like the phone does, every answer checked and saved with its
// cost. Run by hand only (it costs money):
//   EXAM_MODELS=openai/gpt-6.1-sol,anthropic/claude-haiku-5.5 npx vitest run --config scripts/exam/vitest.config.ts
// Optional: EXAM_ONLY=id,id  EXAM_EFFORT=low|medium|high (else easy=low, think=medium)  EXAM_OUT=dir  EXAM_TAG=name
// The key is never in the code: OPENROUTER_API_KEY from the environment, or added by the network's secret proxy.
import { it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PERSONAS, NOW } from './personas';
import { QUESTIONS, type Question } from './questions';
import { SEED_EXERCISES } from '../../src/data/exercises';
import { agentSystem } from '../../src/lib/agentTurn';
import { AGENT_SCHEMA, schemaHintForTest } from '../../src/lib/gemini';
import { toStrictSchema } from '../../src/lib/openai';
import { validateAgent } from '../../src/lib/agent';
import { runLookups, validateLookups } from '../../src/lib/agentLookup';
import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici';

// (test workers don't read HTTPS_PROXY by themselves)
const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined;

const MODELS = (process.env.EXAM_MODELS ?? 'openai/gpt-6.1-sol').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = process.env.EXAM_ONLY?.split(',').map((s) => s.trim());
const OUT = process.env.EXAM_OUT ?? '/tmp/claude-0/exam';
const TAG = process.env.EXAM_TAG ?? 'run';
const SCHEMA = toStrictSchema(AGENT_SCHEMA);

interface Result { id: string; persona: string; kind: string; model: string; effort: string; ok: string | null; reply: string; actions: any[]; lookups: string[]; cost: number; ms: number; error?: string; rounds: number }

async function call(model: string, effort: string, messages: any[], plain: boolean, schema: object = SCHEMA, name = 'agent_turn'): Promise<{ text: string; cost: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  const body: any = { model, messages, max_tokens: 16000, reasoning: { effort }, usage: { include: true },
    response_format: plain ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name, strict: true, schema } } };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res: any = await proxyFetch('https://openrouter.ai/api/v1/chat/completions', { dispatcher, method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
    const data: any = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
    return { text: data?.choices?.[0]?.message?.content ?? '', cost: Number(data?.usage?.cost) || 0 };
  }
  throw new Error('busy');
}

async function ask(q: Question, model: string): Promise<Result> {
  const d = PERSONAS[q.persona]();
  const now = new Date(NOW); if (q.at) now.setHours(q.at[0], q.at[1]);
  vi.setSystemTime(now);
  const effort = process.env.EXAM_EFFORT ?? (q.kind === 'easy' ? 'low' : 'medium');
  const { system, today, mealLabel } = agentSystem(d, { lang: 'en', pool: SEED_EXERCISES, where: 'the Coach chat', now });
  const t0 = performance.now(); let cost = 0, found = '', raw: any = null, rounds = 0; const lookups: string[] = [];
  let plain = false;
  try {
    for (let round = 0; round < 3; round++) {
      rounds++;
      const last = round === 2;
      const sys = system + (plain ? schemaHintForTest() : '') + (found ? `\n\nLOOKUP RESULTS (you asked for these in this turn; answer from them, do not ask for them again):\n${found}` : '') + (last && round > 0 ? '\n\nNo more look-ups this turn: answer now with what you have, and say if something is still unknown.' : '');
      let r;
      try { r = await call(model, effort, [{ role: 'system', content: sys }, { role: 'user', content: q.q }], plain); }
      catch (e: any) { if (!plain && /400|schema|response_format|structured/i.test(String(e.message))) { plain = true; round--; rounds--; continue; } throw e; }
      cost += r.cost;
      try { raw = JSON.parse(r.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
      catch (e) { if (plain) throw e; plain = true; round--; rounds--; continue; } // (it ignored the format: ask again the plain way, as the app does)
      const look = last ? [] : validateLookups(raw?.lookups);
      if (!look.length) break;
      lookups.push(...look.map((l) => `${l.kind}${l.query ? `:${l.query}` : ''}`));
      const local = look.filter((l) => l.kind !== 'web');
      if (local.length) found += (found ? '\n\n' : '') + runLookups(d, local, { today, lang: 'en', pool: SEED_EXERCISES, mealLabel, said: [] });
      if (look.some((l) => l.kind === 'web')) found += '\n\n### web\nThe web search is not available in this test: answer from what you know.';
    }
    const v = validateAgent(raw);
    if (!v) return { id: q.id, persona: q.persona, kind: q.kind, model, effort, ok: 'invalid answer', reply: JSON.stringify(raw).slice(0, 500), actions: [], lookups, cost, ms: Math.round(performance.now() - t0), rounds };
    const ans = { reply: v.reply, actions: v.actions };
    return { id: q.id, persona: q.persona, kind: q.kind, model, effort, ok: q.check?.(ans) ?? null, reply: v.reply, actions: v.actions, lookups, cost, ms: Math.round(performance.now() - t0), rounds };
  } catch (e: any) {
    return { id: q.id, persona: q.persona, kind: q.kind, model, effort, ok: 'error', reply: '', actions: [], lookups, cost, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e).slice(0, 300), rounds };
  }
}

it.runIf(process.env.EXAM_VERDICT !== 'only')('runs the Coach exam', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const qs = QUESTIONS.filter((q) => !ONLY || ONLY.includes(q.id));
  const jobs = MODELS.flatMap((m) => qs.map((q) => () => ask(q, m)));
  const results: Result[] = [];
  // a few at a time (Date is faked per question, so questions with their own time run one by one)
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 10 }, async () => { while (queue.length) { const j = queue.shift()!; results.push(await j()); } }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  const lines: string[] = [];
  for (const m of MODELS) {
    const rs = results.filter((r) => r.model === m);
    const auto = rs.filter((r) => QUESTIONS.find((q) => q.id === r.id)?.check);
    lines.push(`${m}: auto checks ${auto.filter((r) => !r.ok).length}/${auto.length}, errors ${rs.filter((r) => r.ok === 'error' || r.ok === 'invalid answer').length}, cost $${rs.reduce((n, r) => n + r.cost, 0).toFixed(4)}, avg ${Math.round(rs.reduce((n, r) => n + r.ms, 0) / Math.max(1, rs.length) / 100) / 10}s`);
  }
  console.log(lines.join('\n'));
}, 3_600_000);

// The heavy-day verdict (lib/verdict.ts): the same facts the app sends, three different people. EXAM_VERDICT=1 to run.
it.runIf(!!process.env.EXAM_VERDICT)('runs the heavy-day verdicts', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { verdictPrompt, VERDICT_SCHEMA, clampVerdict } = await import('../../src/lib/verdict');
  const { reconcileCatchUps } = await import('../../src/lib/eating');
  const { addDays } = await import('../../src/lib/dates');
  const cases: { id: string; persona: string; at: [number, number]; tweak?: (d: any) => void; good: string }[] = [
    { id: 'v-omar', persona: 'omar', at: [9, 30], good: 'third heavy day in ~3 weeks, fat loss, short night, wrestling tomorrow: calm, water not fat, a small trim at most (or none), protein kept, maybe the evening/sleep link' },
    { id: 'v-sara-rare', persona: 'sara', at: [21, 30], tweak: (d) => d.entries.push({ id: 'big', date: '2026-10-19', mealId: 'dinner', at: new Date(2026, 9, 19, 21).getTime(), snap: { name: 'Birthday dinner and cake', basis: 'g', per100: { kcal: 250 } }, qty: { amount: 1000, unit: 'g' }, base: 1000, nutrients: { kcal: 2500, protein: 60 } }), good: 'a first heavy evening in weeks for a consistent person: none (back to normal), reassuring' },
    { id: 'v-mads-bulk', persona: 'mads', at: [9, 30], tweak: (d) => { d.settings.goals.kcal = 2600; d.entries.push({ id: 'big', date: addDays('2026-10-19', -1), mealId: 'snacks', at: new Date(2026, 9, 19, 8).getTime(), snap: { name: 'Burger menu', basis: 'g', per100: { kcal: 300 } }, qty: { amount: 500, unit: 'g' }, base: 500, nutrients: { kcal: 1500, protein: 40 } }); }, good: 'a 16-year-old bulking: none, no cutting at all' },
  ];
  const out: any[] = [];
  for (const m of MODELS) for (const c of cases) {
    const d = PERSONAS[c.persona](); d.catchUps = []; c.tweak?.(d);
    const now = new Date(NOW); now.setHours(c.at[0], c.at[1]); vi.setSystemTime(now);
    const r = reconcileCatchUps(d, now.getTime());
    const cu = r?.fresh[0];
    if (!cu) { out.push({ id: c.id, model: m, error: 'not noticed' }); continue; }
    d.catchUps = r!.list;
    const { system, prompt } = verdictPrompt(d, cu, '2026-10-19', 'en');
    const t0 = performance.now();
    try {
      const res = await call(m, 'high', [{ role: 'system', content: system }, { role: 'user', content: prompt }], false, toStrictSchema(VERDICT_SCHEMA), 'heavy_day').catch(() => call(m, 'high', [{ role: 'system', content: `${system}\nAnswer with only a JSON object {plan, perDay, days, line, why}.` }, { role: 'user', content: prompt }], true));
      const raw = JSON.parse(res.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      out.push({ id: c.id, model: m, over: cu.over, verdict: clampVerdict(raw, d.settings.goals.kcal, cu.floor), raw, cost: res.cost, ms: Math.round(performance.now() - t0), good: c.good });
    } catch (e: any) { out.push({ id: c.id, model: m, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${TAG}-verdict.json`, JSON.stringify(out, null, 1));
}, 3_600_000);
