// A judge model compares two Coach answers to the same question, blind, both ways round (a pick counts only when it is the
// same both ways: it cancels a judge's habit of preferring the first or the second). It reads the person's facts (MEMORY and
// DATA as the Coach saw them), never the Coach's instructions. Costs are added to the project's ledger and stop at the budget.
//   node scripts/exam/judge.mjs <a.json> <b.json> <out-dir> <name> [set:dev|ids,…] [model]
// Env: EXAM_BUDGET (default 10), EXAM_LEDGER (default <out-dir>/quality-spent.json), OPENROUTER_API_KEY or the secret proxy.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EnvHttpProxyAgent, fetch } from 'undici';

const [fa, fb, out, name, pickArg = '', MODEL = 'anthropic/claude-sonnet-5.5'] = process.argv.slice(2);
const dispatcher = process.env.HTTPS_PROXY || process.env.https_proxy ? new EnvHttpProxyAgent() : undefined;
const LEDGER = process.env.EXAM_LEDGER ?? `${out}/quality-spent.json`;
const BUDGET = Number(process.env.EXAM_BUDGET ?? 10);
const ledger = () => { try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return { total: 0, runs: {} }; } };
const book = (c) => { const l = ledger(); l.total = Math.round((l.total + c) * 1e6) / 1e6; l.runs[`judge-${name}`] = Math.round(((l.runs[`judge-${name}`] ?? 0) + c) * 1e6) / 1e6; writeFileSync(LEDGER, JSON.stringify(l, null, 1)); };

const SYSTEM = `You judge two answers from an AI fitness and food coach inside a phone app, to the same message from the same person. You see the person's facts (their memory notes and the app's data, exactly as the coach saw them), the conversation before, the message, and the two answers (each: the words shown, and the app actions it took).

Judge as the person would, who said what a great coach answer is for them:
- It answers what they actually asked, first, in plain direct words (warm, not soft; no lecture, no shame, no hype, no filler).
- It uses THEIR numbers from the facts correctly and draws the right conclusion from them; a clear recommendation when they need a decision, with the main reason; practical systems (meal timing, hunger, sleep, environment) over "be disciplined".
- It brings up something they did not ask about only when it truly matters right now (an unprompted "see a doctor", age question, recovery remark or warning that doesn't fit the message is a clear minus).
- It honours their memory notes (preferences, plans, how they want to be talked to).
- Length fits the question and a phone screen: a log gets a few words, a real question gets what it needs, nothing padded.
- Their language (Danish in, Danish out). Messages may be dictated and misheard: reading the meaning right is a plus.
- Logging and app actions: the right action with the right amounts, nothing invented, nothing done unasked.
- Safety: real red flags (purging, fainting, fast weight cuts in a teen, chest pain…) handled responsibly. Being safe is never a minus; being preachy when nothing is wrong is.

Also check correctness: list any number or claim in each answer that contradicts the facts or is invented.

Reply with JSON only: {"issues1":["…"],"issues2":["…"],"better":1|2|0,"why":"one sentence"}  (0 = equally good or equally bad)`;

const first = (list, id) => list.find((r) => r.id === id && (r.try ?? 0) === 0 && r.ok !== 'error');
const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
let ids = [...new Set(A.map((r) => r.id))].filter((id) => first(B, id));
if (pickArg.startsWith('set:')) ids = ids.filter((id) => first(A, id).set === pickArg.slice(4));
else if (pickArg) ids = pickArg.split(',').filter((id) => ids.includes(id));
const SHOW = (x) => JSON.stringify(x);
const ans = (r) => `Words: ${r.reply?.trim() || '(none)'}\nActions: ${r.actions?.length ? r.actions.map(SHOW).join('\n') : '(none)'}`;
const factsFor = (r) => { const f = `${out}/facts/${r.persona}__${r.id}.txt`; return existsSync(f) ? readFileSync(f, 'utf8').slice(0, 20000) : '(no facts saved)'; };

async function judge(r, x, y) {
  if (ledger().total >= BUDGET) throw new Error(`budget: stopped at $${ledger().total.toFixed(2)}`);
  const before = r.history?.length ? r.history.map((h) => `${h.role === 'model' ? 'Coach' : 'Person'}: ${h.text}`).join('\n') : '(none)';
  const user = `FACTS:\n${factsFor(r)}\n\nCONVERSATION BEFORE:\n${before}\n\nMESSAGE: ${r.q}\n\nANSWER 1:\n${ans(x)}\n\nANSWER 2:\n${ans(y)}`;
  const key = process.env.OPENROUTER_API_KEY;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { dispatcher, method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, usage: { include: true }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429 || res.status >= 500) { await new Promise((ok) => setTimeout(ok, 3000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 200)}`);
    book(Number(data?.usage?.cost) || 0);
    const text = data?.choices?.[0]?.message?.content ?? '';
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  }
  throw new Error('busy');
}

const rows = [];
const jobs = ids.map((id) => async () => {
  const ra = first(A, id), rb = first(B, id);
  try {
    const [j1, j2] = await Promise.all([judge(ra, ra, rb), judge(ra, rb, ra)]);
    const p1 = j1.better === 1 ? ra.variant : j1.better === 2 ? rb.variant : 'tie';
    const p2 = j2.better === 1 ? rb.variant : j2.better === 2 ? ra.variant : 'tie';
    rows.push({ id, set: ra.set, pick: p1 === p2 ? p1 : 'tie', p1, p2, why: [j1.why, j2.why], issues: { [ra.variant]: [...(j1.issues1 ?? []), ...(j2.issues2 ?? [])], [rb.variant]: [...(j1.issues2 ?? []), ...(j2.issues1 ?? [])] }, len: { [ra.variant]: ra.reply.length, [rb.variant]: rb.reply.length } });
  } catch (e) { rows.push({ id, error: String(e?.message ?? e).slice(0, 200) }); }
});
await Promise.all(Array.from({ length: 4 }, async () => { while (jobs.length) await jobs.shift()(); }));
const tally = {}; for (const r of rows) if (r.pick) tally[r.pick] = (tally[r.pick] ?? 0) + 1;
const longerWon = rows.filter((r) => r.pick && r.pick !== 'tie' && r.len[r.pick] === Math.max(...Object.values(r.len))).length;
writeFileSync(`${out}/judge-${name}.json`, JSON.stringify(rows, null, 1));
console.log(JSON.stringify({ tally, decided: rows.filter((r) => r.pick && r.pick !== 'tie').length, longerWon, errors: rows.filter((r) => r.error).length, spentTotal: ledger().total }, null, 1));
