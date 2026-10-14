// Writes the launch orb into index.html (between the launch-orb markers): the same 100 px orb (in a 120 px box, as the Android launch image) of dots as the Android
// launch screen, drawn by the page's very first paint, before any script has run. Run: node scripts/gen-launch-orb.mjs
import fs from 'node:fs';
import { svg } from './orb-svg.mjs';
const f = 'index.html';
const html = fs.readFileSync(f, 'utf8');
const orb = svg(120, 100).replace('<svg ', '<svg class="launch-logo" aria-hidden="true" ');
const out = html.replace(/<!-- launch-orb -->[\s\S]*?<!-- \/launch-orb -->/, `<!-- launch-orb -->${orb}<!-- /launch-orb -->`);
if (out === html && !html.includes(orb)) throw new Error('index.html has no launch-orb markers');
fs.writeFileSync(f, out);
console.log('launch orb written into index.html');
