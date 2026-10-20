// Blind pairs for a person to judge in the chat: two exam runs (two versions of the Coach) joined by question, the order
// shuffled per pair, the key kept apart. Then the picks ("1A 2B 3 same 4 both bad") are scored against the key.
//   node scripts/exam/pairs.mjs make <a.json> <b.json> <out-dir> <name> [ids,…|set:dev] [per-batch=5]
//   node scripts/exam/pairs.mjs score <out-dir>/<name>-key.json "1A 2B 3 same 4 both bad …"
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [cmd, ...a] = process.argv.slice(2);
const SHOW = (x) => `${x.type}${x.foods ? ` ${x.foods.map((f) => `${f.amount ?? ''}${f.unit ? ` ${f.unit}` : ''} ${f.name}`).join(', ')}` : ''}${x.text ? ` "${x.text}"` : ''}${x.on !== undefined && x.on !== null ? ` on=${x.on}` : ''}`;
const answer = (r) => `${r.reply?.trim() || '(no words)'}${r.actions?.length ? `\n   → ${r.actions.map(SHOW).join(' · ')}` : ''}`;

if (cmd === 'make') {
  const [fa, fb, out, name, pickArg = '', per = '5'] = a;
  const A = JSON.parse(readFileSync(fa, 'utf8')), B = JSON.parse(readFileSync(fb, 'utf8'));
  const first = (list, id) => list.find((r) => r.id === id && (r.try ?? 0) === 0 && r.ok !== 'error');
  let ids = [...new Set(A.map((r) => r.id))].filter((id) => first(B, id));
  if (pickArg.startsWith('set:')) ids = ids.filter((id) => first(A, id).set === pickArg.slice(4));
  else if (pickArg) ids = pickArg.split(',').filter((id) => ids.includes(id));
  const key = [], chunks = [];
  ids.forEach((id, i) => {
    const ra = first(A, id), rb = first(B, id);
    const flip = Math.random() < 0.5;
    const [x, y] = flip ? [rb, ra] : [ra, rb];
    key.push({ n: i + 1, id, A: x.variant, B: y.variant });
    const before = ra.history?.length ? `   (before: ${ra.history.map((h) => `${h.role === 'model' ? 'Coach' : 'you'}: “${h.text.slice(0, 90)}”`).join(' / ')})\n` : '';
    chunks.push(`**${i + 1}. “${ra.q}”**\n${before}\n**${i + 1}A:** ${answer(x)}\n\n**${i + 1}B:** ${answer(y)}`);
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/${name}-key.json`, JSON.stringify(key, null, 1));
  const n = Number(per);
  for (let b = 0; b * n < chunks.length; b++) writeFileSync(`${out}/${name}-batch${b + 1}.md`, chunks.slice(b * n, b * n + n).join('\n\n---\n\n'));
  console.log(`${chunks.length} pairs, ${Math.ceil(chunks.length / n)} batches → ${out}/${name}-batch*.md (key apart)`);
} else if (cmd === 'score') {
  const [fk, picks] = a;
  const key = JSON.parse(readFileSync(fk, 'utf8'));
  const tally = {}; const per = [];
  // "1A", "2 b", "3 same", "4 both bad", "5 neither"
  for (const m of picks.matchAll(/(\d+)\s*([ab]\b|same|tie|both bad|neither|both good)/gi)) {
    const k = key.find((x) => x.n === Number(m[1])); if (!k) continue;
    const v = m[2].toLowerCase();
    const who = v === 'a' ? k.A : v === 'b' ? k.B : /bad|neither/.test(v) ? 'both bad' : 'same';
    tally[who] = (tally[who] ?? 0) + 1; per.push({ n: k.n, id: k.id, pick: who });
  }
  console.log(JSON.stringify({ tally, per }, null, 1));
} else console.log('make | score');
