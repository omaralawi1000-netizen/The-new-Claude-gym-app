import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, from, to, step = '2', out = 'shots/contact.png', cols = '10'] = process.argv;
const imgs = []; for (let i = +from; i <= +to; i += +step) { try { imgs.push([i, readFileSync(`/tmp/frames/f${String(i).padStart(3, '0')}.png`).toString('base64')]); } catch {} }
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px">${imgs.map(([i, d]) => `<figure style="margin:0;color:#fff;font:11px sans-serif"><img style="width:100%;display:block" src="data:image/png;base64,${d}"/>${i}</figure>`).join('')}</body>`);
await p.screenshot({ path: out, fullPage: true }); await b.close();
