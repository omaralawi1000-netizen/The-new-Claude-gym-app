// Analyze a probe-r13-D-frames log. usage: node scripts/probe-r13-D-analyze.mjs file.json [from-mark] [ms] [keys]
// Prints per frame the chosen elements (o = effective opacity, y = top, tf = transform) and flags: an element that was
// there and is gone, an opacity step > .35 in one frame, a still element that jumps > 4 px in one frame.
import fs from 'node:fs';
const [file, from = 'open', span = '1600', keys = 'orb,slot,cam,send,go,stop,stand,fly,close,newc,tip,dots,speak'] = process.argv.slice(2);
const { marks, log } = JSON.parse(fs.readFileSync(file, 'utf8'));
const m = marks.find((x) => x[1] === from); const t0 = m ? m[0] : 0, t1 = t0 + Number(span);
const K = keys.split(',');
const rows = log.filter((r) => r.t >= t0 - 20 && r.t <= t1);
let prev = null;
const fmt = (k, v) => v == null ? `${k}:-` : `${k}:${v.o}${v.n > 1 ? `x${v.n}` : ''}@${v.x},${v.y}${v.w !== undefined ? ` ${v.w}x${v.h}` : ''}${v.tf ? ` [${v.tf}]` : ''}${v.tr ? ` tr(${v.tr})` : ''}${v.sc ? ` sc(${v.sc})` : ''}${v.cls ? ` {${v.cls}}` : ''}`;
for (const r of rows) {
  const flags = [];
  if (prev) for (const k of K) {
    const a = prev[k], c = r[k];
    if (a && !c && a.o > 0.02) flags.push(`${k} GONE (was o=${a.o})`);
    if (!a && c && c.o > 0.35) flags.push(`${k} POPPED IN o=${c.o}`);
    if (a && c && Math.abs(a.o - c.o) > 0.35 && r.t - prev.t < 40) flags.push(`${k} o ${a.o}->${c.o}`);
  }
  const extra = `st:${r.st} last:${r.last ? `${r.last.id}@${r.last.y}/${r.last.b} ${r.last.vis}` : '-'} kb:${r.kb}`;
  console.log(String(r.t - t0).padStart(5), K.map((k) => fmt(k, r[k])).join(' | '), '|', extra, flags.length ? ' <<< ' + flags.join('; ') : '');
  prev = r;
}
