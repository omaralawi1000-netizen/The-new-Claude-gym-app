/// <reference lib="webworker" />
import type { GlowJob, GlowSrc } from './glow';
import { render } from './glowPaint';

/**
 * Paints soft glows (CSS gradients) into a picture with full precision and a dither, off the page (glowPaint.ts). The phone
 * draws a CSS gradient in whole colour steps (0-255) without one, so a dim glow showed as rings, a little different for red,
 * green and blue (coloured rings). Here every pixel is worked out exactly and then rounded up or down at random in proportion
 * to what is left over, so each step dissolves into noise about one level strong and the eye only sees the smooth mean.
 */
declare const self: DedicatedWorkerGlobalScope;

let seed = 1;
self.onmessage = (e: MessageEvent<{ id: number; job?: GlowJob; png?: ImageData }>) => {
  const { id, job, png } = e.data;
  // a picture made into a PNG file (for a background image): encoding it here keeps the page free
  if (png) {
    const c = new OffscreenCanvas(png.width, png.height);
    c.getContext('2d')!.putImageData(png, 0, 0);
    c.convertToBlob({ type: 'image/png' }).then((blob) => self.postMessage({ id, blob }), () => self.postMessage({ id, blob: null }));
    return;
  }
  if (!job) return;
  try {
    // a picture (the photo, the stars, the dots) laid out by the page, drawn here at the canvas's size
    const pix = (s: GlowSrc) => {
      if (!s.img?.bm) return null;
      const c = new OffscreenCanvas(job.w, job.h), x = c.getContext('2d')!;
      x.imageSmoothingQuality = 'high';
      x.drawImage(s.img.bm, s.img.x, s.img.y, s.img.w, s.img.h);
      s.img.bm.close();
      return x.getImageData(0, 0, job.w, job.h).data;
    };
    const d = render(job, [...job.srcs, ...(job.top ?? [])].map(pix), ++seed);
    // the pixels themselves (kept in memory to show again at once; the page writes them straight into its canvas)
    self.postMessage({ id, px: d }, [d.data.buffer]);
  } catch { self.postMessage({ id, px: null }); }
};
