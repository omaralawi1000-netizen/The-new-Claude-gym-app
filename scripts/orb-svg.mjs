// Aven's orb as an SVG of dots: the Android icon and launch screen (gen-android-icon.mjs) and the web app's own launch
// screen in index.html (gen-launch-orb.mjs) are drawn from this one function, so they match dot for dot.
// the sphere, as dots: evenly spaced rings (1, 6, 12, 18, 24, 31 dots, each ring turned half a step against the last),
// so the dots sit evenly everywhere and the outline is a true circle; shaded and shrunk towards the edge as on a ball
// seen front on (E: how far round the ball the edge is)
function dots(K = 5, E = 0.87) {
  const L = (() => { const v = [-0.45, -0.6, 0.66], m = Math.hypot(...v); return v.map((x) => x / m); })();
  const out = [];
  for (let k = 0; k <= K; k++) {
    const r = k / K, n = k ? Math.round(2 * Math.PI * k) : 1;
    for (let j = 0; j < n; j++) {
      const ph = ((j + 0.5 * (k % 2)) / n) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(ph) * r, y = Math.sin(ph) * r, z = Math.sqrt(1 - (r * E) ** 2);
      out.push({ x, y, z, lam: Math.max(0, x * E * L[0] + y * E * L[1] + z * L[2]) });
    }
  }
  return out;
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const SHADOW = [140, 52, 22], EMBER = [236, 116, 59], LIGHT = [255, 178, 128];
function colour(lam) {
  const t = 0.2 + 0.8 * lam;
  return t < 0.6 ? mix(SHADOW, EMBER, t / 0.6) : mix(EMBER, LIGHT, (t - 0.6) / 0.4);
}

/** an svg of `size` px with the orb `diam` px wide in the middle; mono = one flat colour (themed icons) */
export function svg(size, diam, { mono = false, glow = false, bg = null, radius = 0 } = {}) {
  const c = size / 2, R = diam / 2, base = R * 0.08;
  const body = dots().sort((a, b) => a.z - b.z).map((p) => {
    const rad = base * (0.45 + 0.55 * p.z);
    const fill = mono ? '#fff' : `rgb(${colour(p.lam).join(',')})`;
    return `<circle cx="${(c + p.x * R).toFixed(2)}" cy="${(c + p.y * R).toFixed(2)}" r="${rad.toFixed(2)}" fill="${fill}"/>`;
  }).join('');
  const back = bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : '';
  const halo = glow ? `<defs><radialGradient id="h"><stop offset="0" stop-color="#f07a3e" stop-opacity=".22"/><stop offset=".55" stop-color="#f07a3e" stop-opacity=".06"/><stop offset="1" stop-color="#f07a3e" stop-opacity="0"/></radialGradient></defs><circle cx="${c}" cy="${c}" r="${R * 1.45}" fill="url(#h)"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${back}${halo}${body}</svg>`;
}

