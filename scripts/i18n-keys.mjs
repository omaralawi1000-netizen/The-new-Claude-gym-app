// Lists every English UI key passed to t()/tt() plus ternary/array literals inside t(...) calls. Used to keep src/lib/da.ts complete.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f) && files.push(p); } })('src');
const keys = new Set();
const re = /\b(?:t|tt|tNow)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  let m; while ((m = re.exec(s))) keys.add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  // t(x.label) style tables: collect 'Label' strings in known label maps
  for (const mm of s.matchAll(/(?:label|l|t|title|sub|s|text): ?'([A-Z][^']{1,80})'/g)) keys.add(mm[1].replace(/\\'/g, "'"));
}
const extra = process.argv.includes('--all');
const { da } = await import('./da-load.mjs');
const missing = [...keys].filter((k) => !(k in da)).sort();
if (process.argv.includes('--missing')) console.log(missing.join('\n'));
else console.log([...keys].sort().join('\n'));
console.error(`${keys.size} keys, ${missing.length} missing, extra=${extra}`);
