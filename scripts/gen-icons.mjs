// Generates the Aven mark: a lit Fibonacci-lattice sphere of dots on charcoal. Run: node scripts/gen-icons.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
function svg(size, scale = 0.62, r = 0.5) {
  const N = 420, g = Math.PI * (3 - Math.sqrt(5));
  const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - y * y), th = g * i;
    let x = Math.cos(th) * rr, z = Math.sin(th) * rr;
    const tilt = 0.42, yy = y * Math.cos(tilt) - z * Math.sin(tilt), zz = y * Math.sin(tilt) + z * Math.cos(tilt);
    pts.push({ x, y: yy, z: zz });
  }
  pts.sort((a, b) => a.z - b.z);
  const c = size / 2, R = (size * scale) / 2;
  const dots = pts.map((p) => {
    const depth = (p.z + 1) / 2, lam = Math.max(0, p.x * -0.42 + p.y * -0.52 + p.z * 0.74);
    const sh = 0.15 + 0.85 * Math.pow(depth, 1.2) * (0.4 + 0.6 * lam);
    const rad = ((R * 2 * 0.0185) * (0.45 + 1.0 * depth)) * (size / 512) * 512 / 512 * r * 2;
    const col = `rgb(${Math.round(120 + 135 * sh)},${Math.round(60 + 80 * sh)},${Math.round(36 + 40 * sh)})`;
    return `<circle cx="${(c + p.x * R).toFixed(1)}" cy="${(c + p.y * R).toFixed(1)}" r="${Math.max(0.6, rad).toFixed(2)}" fill="${col}" fill-opacity="${(0.25 + 0.75 * sh).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1d1410"/><stop offset="1" stop-color="#0a0a0c"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/>${dots}</svg>`;
}
writeFileSync('public/icon.svg', svg(512, 0.66, 0.5));
const b = await chromium.launch();
for (const [name, size, scale] of [['icon-512', 512, 0.66], ['icon-192', 192, 0.66], ['icon-maskable-512', 512, 0.5]]) {
  const p = await (await b.newContext({ viewport: { width: size, height: size } })).newPage();
  await p.setContent(`<body style="margin:0">${svg(size, scale, 0.5)}</body>`);
  await p.screenshot({ path: `public/${name}.png` });
}
await b.close();
