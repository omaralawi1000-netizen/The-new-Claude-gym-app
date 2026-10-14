import { useRef } from 'react';
import { cssColor, glowScale, useGlowCanvases, type Glow } from '../../ui/glow';

/**
 * The live workout window's light as dithered pictures (ui/glow.ts), so it is one smooth fade on the phone instead of
 * coloured rings. Each picture is exactly the CSS gradient it replaces (styles.css `.aurora-lite::before` and `.wk-breath`),
 * which shows until the picture is ready; keep the numbers here in step with those rules.
 */
const auroraA = (el: Element) => parseFloat(getComputedStyle(el).getPropertyValue('--aurora-a')) || 0;

/** the window's colour field: the three lights of `.aurora-lite::before` over the window's colour, one opaque picture */
export function WkFieldGlow() {
  const cv = useRef<HTMLCanvasElement>(null);
  useGlowCanvases('wk-field', () => cv.current?.parentElement ?? null, [cv], (lite) => {
    const W = lite.clientWidth, H = lite.clientHeight, T = lite.offsetTop, a = auroraA(lite);
    if (!W || !H || !a) return null;
    // the picture covers the whole window: the field's light carries on above its own top edge (styles.css .wk-solid > .aurora-lite)
    const s = glowScale(), w = Math.round(W * s), h = Math.round((H + T) * s), sx = w / W, sy = h / (H + T);
    const bx = -0.12 * W, by = -0.12 * H, bw = 1.24 * W, bh = 1.24 * H; // ::before reaches 12 % past each edge
    const light = (x: number, y: number, r: number, v: string, al: number): Glow =>
      ({ cx: (bx + x * bw) * sx, cy: (by + y * bh + T) * sy, rx: r * W * sx, ry: r * W * sy, stop: 1, c: cssColor(lite, `var(${v})`), a: al });
    // the grain (.aurora-lite::after) is drawn in too, over the field's own box: laid over the canvas it had to be a
    // full-screen layer of its own whenever the window was open
    const g = parseFloat(getComputedStyle(lite, '::after').opacity) || 0;
    return [{ w, h, base: cssColor(lite, 'var(--bg)'), group: a, amp: 2, grain: { g, y0: T * sy },
      glows: [light(0.46, 1.1, 0.65, '--h3', 0.8), light(0.802, 0.435, 0.525, '--h2', 1), light(0.298, 0.08, 0.6, '--h1', 1)] }];
  }, (on) => cv.current?.parentElement?.toggleAttribute('data-dith', on));
  return <canvas ref={cv} className="glow-cv wk-field-cv" aria-hidden />;
}

/** the breathing top light (`.wk-breath > b::before`) and the warmer one that fades in over the first hour (`::after`) */
export function WkBreathGlow() {
  const cool = useRef<HTMLCanvasElement>(null), warm = useRef<HTMLCanvasElement>(null);
  useGlowCanvases('wk-breath', () => cool.current?.closest<HTMLElement>('.wk-breath') ?? null, [cool, warm], (br) => {
    const W = br.clientWidth, H = br.clientHeight, a = auroraA(br);
    if (!W || !H || !a) return null;
    const s = glowScale(), w = Math.round(W * s), h = Math.round(H * s), sx = w / W, sy = h / H;
    // the breath dims the light to 40 % and back, which thins the dither by as much: it is drawn stronger to stay smooth there
    const light = (x: number, y: number, rx: number, ry: number, v: string, al: number) =>
      ({ w, h, base: null, group: a, amp: 2.5, glows: [{ cx: x * W * sx, cy: y * H * sy, rx: rx * W * sx, ry: ry * H * sy, stop: 0.72, c: cssColor(br, `var(${v})`), a: al }] });
    return [light(0.32, 0.3, 0.55, 0.6, '--h1', 0.55), light(0.4, 0.32, 0.6, 0.62, '--h3', 0.6)];
  }, (on) => cool.current?.closest('.wk-breath')?.toggleAttribute('data-dith', on));
  return <><canvas ref={cool} className="glow-cv" aria-hidden /><canvas ref={warm} className="glow-cv warm" aria-hidden /></>;
}
