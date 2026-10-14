/// <reference lib="webworker" />
import type { GlowJob } from './glow';

/**
 * Paints soft glows (radial gradients) into a picture with full precision and a dither, off the page. The phone draws a CSS
 * gradient in whole colour steps (0-255) without one, so a dim glow showed as rings, a little different for red, green and
 * blue (coloured rings). Here every pixel is worked out exactly and then rounded up or down at random in proportion to
 * what is left over, so each step dissolves into noise about one level strong and the eye only sees the smooth mean.
 */
declare const self: DedicatedWorkerGlobalScope;

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

self.onmessage = (e: MessageEvent<{ id: number; job: GlowJob }>) => {
  const { id, job } = e.data;
  try {
    const { w, h, base, glows, group, amp, grain } = job;
    const d = new ImageData(w, h), px = d.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // the glows over transparent, bottom first, as premultiplied colour (0-255) and alpha (0-1): CSS mixes gradients so
        let r = 0, g = 0, b = 0, a = 0;
        for (const q of glows) {
          const dx = (x + 0.5 - q.cx) / q.rx, dy = (y + 0.5 - q.cy) / q.ry;
          const t = Math.sqrt(dx * dx + dy * dy) / q.stop;
          if (t >= 1) continue;
          const k = q.a * (1 - t), m = 1 - k;
          r = q.c[0] * k + r * m; g = q.c[1] * k + g * m; b = q.c[2] * k + b * m; a = k + a * m;
        }
        r *= group; g *= group; b *= group; a *= group;
        const i = (y * w + x) * 4;
        // triangular noise (the sum of two): the mean stays exact, nothing is left of the steps
        if (base) {
          // an opaque picture (the clamped array rounds to the nearest whole level)
          let o0 = base[0] * (1 - a) + r, o1 = base[1] * (1 - a) + g, o2 = base[2] * (1 - a) + b;
          if (grain && y >= grain.y0) {
            // the grain as lib/grain.ts makes it (white, at a random strength: the product of two randoms), laid on top
            const k = grain.g * rnd() * rnd();
            o0 += (255 - o0) * k; o1 += (255 - o1) * k; o2 += (255 - o2) * k;
          }
          px[i] = o0 + (rnd() + rnd() - 1) * amp;
          px[i + 1] = o1 + (rnd() + rnd() - 1) * amp;
          px[i + 2] = o2 + (rnd() + rnd() - 1) * amp;
          px[i + 3] = 255;
        } else {
          // a see-through picture: the canvas keeps colour premultiplied by alpha, so the dither is chosen in that form and
          // the colour handed over is picked to land on exactly it when the canvas multiplies it back
          if (a <= 0) continue; // nothing here (the array starts transparent)
          const al = Math.min(255, Math.max(0, Math.round(a * 255 + (rnd() + rnd() - 1) * amp)));
          px[i + 3] = al;
          if (!al) continue;
          const pr = Math.min(al, Math.max(0, Math.round(r + (rnd() + rnd() - 1) * amp)));
          const pg = Math.min(al, Math.max(0, Math.round(g + (rnd() + rnd() - 1) * amp)));
          const pb = Math.min(al, Math.max(0, Math.round(b + (rnd() + rnd() - 1) * amp)));
          px[i] = Math.round((pr * 255) / al); px[i + 1] = Math.round((pg * 255) / al); px[i + 2] = Math.round((pb * 255) / al);
        }
      }
    }
    // willReadFrequently: the picture stays in memory, not on the graphics chip (it is kept to show again at once)
    const cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d', { alpha: !base, willReadFrequently: true });
    if (!cx) throw new Error('no 2d');
    cx.putImageData(d, 0, 0);
    const bm = cv.transferToImageBitmap();
    self.postMessage({ id, bm }, [bm]);
  } catch { self.postMessage({ id, bm: null }); }
};
