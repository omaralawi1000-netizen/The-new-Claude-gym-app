import { useRef } from 'react';
import { cssColor, glowScale, planKey, useGlowCanvases, type GlowJob, type GlowLayer } from '../../ui/glow';

/**
 * The live workout window's light as dithered pictures (ui/glow.ts), so it is one smooth fade on the phone instead of
 * coloured rings. Each picture is exactly the CSS gradient it replaces (styles.css `.aurora-lite::before` and `.wk-breath`),
 * which shows until the picture is ready; keep the numbers here in step with those rules.
 */
const auroraA = (el: Element) => parseFloat(getComputedStyle(el).getPropertyValue('--aurora-a')) || 0;
/** a radial light of one colour, `a` strong at its centre and gone at `stop` of its radii (canvas px) */
const light = (cx: number, cy: number, rx: number, ry: number, c: [number, number, number], a: number, stop: number): GlowLayer =>
  ({ k: 'r', g: [cx, cy, rx, ry], stops: [{ c: [...c, a], p: 0 }, { c: [...c, 0], p: stop }] });
/** the lights, drawn straight in canvas px, at the group's opacity */
const one = (layers: GlowLayer[], op: number) => ({ op, m: [1, 0, 0, 1, 0, 0], w: 0, h: 0, clip: false, bg: null, layers });

/** the window's colour field: the three lights of `.aurora-lite::before` over the window's colour, one opaque picture */
export function WkFieldGlow() {
  const cv = useRef<HTMLCanvasElement>(null);
  useGlowCanvases(() => cv.current?.parentElement ?? null, [cv], (lite) => {
    const W = lite.clientWidth, H = lite.clientHeight, T = lite.offsetTop, a = auroraA(lite);
    if (!W || !H || !a) return null;
    // the picture covers the whole window: the field's light carries on above its own top edge (styles.css .wk-solid > .aurora-lite)
    const s = glowScale(), w = Math.round(W * s), h = Math.round((H + T) * s), sx = w / W, sy = h / (H + T);
    const bx = -0.12 * W, by = -0.12 * H, bw = 1.24 * W, bh = 1.24 * H; // ::before reaches 12 % past each edge
    const at = (x: number, y: number, r: number, v: string, al: number) =>
      light((bx + x * bw) * sx, (by + y * bh + T) * sy, r * W * sx, r * W * sy, cssColor(lite, `var(${v})`), al, 1);
    // the grain (.aurora-lite::after) is drawn in too, over the field's own box: laid over the canvas it had to be a
    // full-screen layer of its own whenever the window was open
    const g = parseFloat(getComputedStyle(lite, '::after').opacity) || 0;
    // bottom first (CSS lists the topmost first)
    const jobs: GlowJob[] = [{ w, h, base: cssColor(lite, 'var(--bg)'), amp: 2, grain: { g, y0: T * sy, s: sx, f: Math.min(1, sx / 4) },
      srcs: [one([at(0.46, 1.1, 0.65, '--h3', 0.8), at(0.802, 0.435, 0.525, '--h2', 1), at(0.298, 0.08, 0.6, '--h1', 1)], a)] }];
    return { jobs, key: planKey(jobs, 'wk-field') };
  }, (on) => cv.current?.parentElement?.toggleAttribute('data-dith', on));
  return <canvas ref={cv} className="glow-cv wk-field-cv" aria-hidden />;
}

/** the breathing top light (`.wk-breath > b::before`) and the warmer one that fades in over the first hour (`::after`) */
export function WkBreathGlow() {
  const cool = useRef<HTMLCanvasElement>(null), warm = useRef<HTMLCanvasElement>(null);
  useGlowCanvases(() => cool.current?.closest<HTMLElement>('.wk-breath') ?? null, [cool, warm], (br) => {
    const W = br.clientWidth, H = br.clientHeight, a = auroraA(br);
    if (!W || !H || !a) return null;
    // (a very soft light: a quarter of the screen's pixels is plenty, and four times less to keep)
    const s = glowScale() / 2, w = Math.round(W * s), h = Math.round(H * s), sx = w / W, sy = h / H;
    // the breath dims the light to 40 % and back, which thins the dither by as much: it is drawn stronger to stay smooth there
    const job = (x: number, y: number, rx: number, ry: number, v: string, al: number): GlowJob =>
      ({ w, h, base: null, amp: 2.5, srcs: [one([light(x * W * sx, y * H * sy, rx * W * sx, ry * H * sy, cssColor(br, `var(${v})`), al, 0.72)], a)] });
    const jobs = [job(0.32, 0.3, 0.55, 0.6, '--h1', 0.55), job(0.4, 0.32, 0.6, 0.62, '--h3', 0.6)];
    return { jobs, key: planKey(jobs, 'wk-breath') };
  }, (on) => cool.current?.closest('.wk-breath')?.toggleAttribute('data-dith', on));
  return <><canvas ref={cool} className="glow-cv" aria-hidden /><canvas ref={warm} className="glow-cv warm" aria-hidden /></>;
}
