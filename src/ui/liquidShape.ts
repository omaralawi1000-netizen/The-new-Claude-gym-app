/**
 * The outline of a stack of glass slices that are joined into one card and pull apart into separate cards (or the other way
 * round), as one closed SVG path. Pure geometry: `liquidPath` takes where each slice's top and bottom are and how far each seam
 * has separated, and returns a path whose seams are real liquid necks:
 *
 *   joined     the slices are one card: straight sides, the seam is only a hairline between two rows
 *   separating the seam draws in at both sides like a groove, the slices' inner corners round off
 *   stretching what still joins them is a neck that narrows to a thread (the waist) with soft fillets where it leaves each slice
 *   apart      the thread is gone and each slice is a plain rounded card
 *
 * Everything is one outline, so one translucent fill gives the same glass as a CSS card with no doubled tint where shapes
 * overlap; the ring and the top light are drawn from the same outline (see liquid.ts).
 */

export type Slice = { top: number; bottom: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => { const x = clamp01(v); return x * x * (3 - 2 * x); };

/**
 * How far a seam has separated (0 joined … 1 apart) → the corner radius where two slices meet, the half-width of the waist and
 * the neck's fillets. A fillet is a quarter ellipse: as tall as half the gap (ry) but long along the card's edge (rx), so
 * what is left of the join leaves each card on a long, soft taper like a liquid bridge, never a square-ended slot.
 */
export function seamShape(sep: number, gap: number, width: number, R: number) {
  const s = clamp01(sep);
  const rho = R * smooth(s / 0.4); // the inner corners round off while the seam draws in
  const ry0 = Math.max(0, gap / 2);
  // the waist narrows from the full width to a thread: slowly at first, then fast, so the neck "lets go" near the end
  const hwTarget = (width / 2) * (1 - smooth((s - 0.05) / 0.5)) ** 1.5;
  const rx0 = Math.min(ry0 * 5 + 5, 70);
  const hw = Math.max(0, Math.min(hwTarget, width / 2 - rho - rx0));
  const rx = Math.max(0, Math.min(rx0, width / 2 - rho - hw));
  // a thread has no body to taper from: its fillets shrink with it
  const k = hw > 0 ? Math.min(1, hw / 3) : 0;
  return { rho, hw, rx: rx * k, ry: ry0 * k };
}

/**
 * @param slices   the slices, top to bottom, in px (they must not overlap: bottom[k] <= top[k+1])
 * @param seps     per seam (slices.length - 1): 0 joined … 1 apart
 * @param x0 x1    the left and right edge
 * @param R        the corner radius of a card (--r-md)
 * @param dy       shifts the whole outline down (the top light is the outline minus itself shifted by 1 px)
 */
export function liquidPath(slices: Slice[], seps: number[], x0: number, x1: number, R: number, dy = 0): string {
  const n = slices.length;
  const W = x1 - x0, cx = (x0 + x1) / 2;
  const seam = seps.map((s, k) => seamShape(s, Math.max(0, slices[k + 1].top - slices[k].bottom), W, R));
  const rt = slices.map((_, k) => (k === 0 ? R : seam[k - 1].rho));
  const rb = slices.map((_, k) => (k === n - 1 ? R : seam[k].rho));
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const p: string[] = [];
  const M = (x: number, y: number) => p.push(`M${f(x)} ${f(y + dy)}`);
  const L = (x: number, y: number) => p.push(`L${f(x)} ${f(y + dy)}`);
  const A = (r: number, sweep: 0 | 1, x: number, y: number) => p.push(`A${f(r)} ${f(r)} 0 0 ${sweep} ${f(x)} ${f(y + dy)}`);
  const E = (rx: number, ry: number, sweep: 0 | 1, x: number, y: number) => p.push(`A${f(rx)} ${f(ry)} 0 0 ${sweep} ${f(x)} ${f(y + dy)}`);
  // along the top edge, then down the right side
  M(x0 + rt[0], slices[0].top); L(x1 - rt[0], slices[0].top); A(rt[0], 1, x1, slices[0].top + rt[0]);
  for (let k = 0; k < n; k++) {
    const s = slices[k];
    L(x1, s.bottom - rb[k]); A(rb[k], 1, x1 - rb[k], s.bottom);
    if (k < n - 1) {
      const nx = slices[k + 1], { hw, rx, ry } = seam[k], xw = cx + hw;
      L(xw + rx, s.bottom); E(rx, ry, 0, xw, s.bottom + ry);
      L(xw, nx.top - ry); E(rx, ry, 0, xw + rx, nx.top);
      L(x1 - rt[k + 1], nx.top); A(rt[k + 1], 1, x1, nx.top + rt[k + 1]);
    }
  }
  // along the bottom edge, then up the left side
  const last = slices[n - 1];
  L(x0 + rb[n - 1], last.bottom); A(rb[n - 1], 1, x0, last.bottom - rb[n - 1]);
  for (let k = n - 1; k >= 0; k--) {
    const s = slices[k];
    L(x0, s.top + rt[k]); A(rt[k], 1, x0 + rt[k], s.top);
    if (k > 0) {
      const pv = slices[k - 1], { hw, rx, ry } = seam[k - 1], xw = cx - hw;
      L(xw - rx, s.top); E(rx, ry, 0, xw, s.top - ry);
      L(xw, pv.bottom + ry); E(rx, ry, 0, xw - rx, pv.bottom);
      L(x0 + rb[k - 1], pv.bottom); A(rb[k - 1], 1, x0, pv.bottom - rb[k - 1]);
    }
  }
  p.push('Z');
  return p.join('');
}
