/**
 * A card as dust (Omar, 26 Oct: "I want it to shape the card almost fully with the specks… so it feels seamless"): the
 * points Stardust's writer specks fly to, sampled from the card exactly as it is laid out — its rounded outline, the
 * outlines of its buttons and chips, a faint scatter over its face, and every word in its own font, size and place — so
 * the dust draws the card itself, and the real card can take over with only a flash between them.
 * Returns css px pairs in the page's coordinates, shuffled, at most `budget` of them (the words first, then the outlines,
 * then the face).
 */
export function shapeOf(el: HTMLElement, budget = 6000): Float32Array {
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return new Float32Array(0);
  const S = 2, PAD = 4; // (drawn at twice the size: thin letters still have pixels to sample)
  const w = Math.ceil(box.width + PAD * 2), h = Math.ceil(box.height + PAD * 2);
  const layer = () => { const c = document.createElement('canvas'); c.width = w * S; c.height = h * S; const g = c.getContext('2d')!; g.scale(S, S); g.translate(PAD - box.left, PAD - box.top); return { c, g }; };
  const words = layer(), lines = layer();
  lines.g.strokeStyle = '#fff'; lines.g.lineWidth = 1.3;
  const radius = (cs: CSSStyleDeclaration, r: DOMRect) => Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2, r.width / 2);
  const outline = (node: Element, r: DOMRect) => { const cs = getComputedStyle(node); lines.g.beginPath(); lines.g.roundRect(r.left + 0.75, r.top + 0.75, r.width - 1.5, r.height - 1.5, radius(cs, r)); lines.g.stroke(); };
  outline(el, box);
  // its buttons, chips and inner boxes: anything with its own border or fill
  for (const n of el.querySelectorAll<HTMLElement>('*')) {
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = n.getBoundingClientRect(); if (r.width < 6 || r.height < 6) continue;
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    const filled = cs.backgroundColor && !/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
    if ((bordered || filled) && (n.tagName === 'BUTTON' || r.width < box.width - 4)) outline(n, r);
    // (icons: their outline only, a small rounded square)
    if (n.tagName === 'svg' || n.tagName === 'SVG') { lines.g.beginPath(); lines.g.roundRect(r.left, r.top, r.width, r.height, Math.min(r.width, r.height) / 3); lines.g.stroke(); }
  }
  // every word, in its own font and place (line by line, as the card wraps it)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  words.g.fillStyle = '#fff'; words.g.textBaseline = 'middle';
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const p = t.parentElement; if (!p || !t.data.trim()) continue;
    const cs = getComputedStyle(p); if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    words.g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in words.g) (words.g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const upper = cs.textTransform === 'uppercase';
    for (const m of t.data.matchAll(/\S+/g)) {
      range.setStart(t, m.index!); range.setEnd(t, m.index! + m[0].length);
      const r = range.getBoundingClientRect(); if (!r.width) continue;
      words.g.fillText(upper ? m[0].toUpperCase() : m[0], r.left, r.top + r.height / 2, r.width + 1);
    }
  }
  // sample: the words densely, the outlines a little less, the face sparsely
  const take = (c: HTMLCanvasElement, step: number, thr: number) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, out: number[] = [];
    for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) if (d[(y * c.width + x) * 4 + 3] > thr) out.push(box.left - PAD + x / S, box.top - PAD + y / S);
    return out;
  };
  const shuffle = (a: number[]) => { for (let i = a.length / 2 - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i * 2], a[j * 2]] = [a[j * 2], a[i * 2]]; [a[i * 2 + 1], a[j * 2 + 1]] = [a[j * 2 + 1], a[i * 2 + 1]]; } return a; };
  const tw = shuffle(take(words.c, 2, 90)), ol = shuffle(take(lines.c, 2, 60));
  const face: number[] = []; for (let k = 0; k < budget * 0.06; k++) face.push(box.left + 6 + Math.random() * (box.width - 12), box.top + 6 + Math.random() * (box.height - 12));
  const nW = Math.min(tw.length / 2, Math.round(budget * 0.66)), nO = Math.min(ol.length / 2, Math.round(budget * 0.94) - nW), nF = Math.max(0, Math.min(face.length / 2, budget - nW - nO));
  return new Float32Array(shuffle([...tw.slice(0, nW * 2), ...ol.slice(0, nO * 2), ...face.slice(0, nF * 2)]));
}
