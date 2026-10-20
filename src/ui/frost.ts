/**
 * Frosted cards (dark theme). A page's cards show a soft, brighter copy of the colour field behind them, as frosted glass
 * would, without a backdrop blur: real blur under scrolling cards cost a third of the frame rate at the phone's 3.75 dpr.
 *
 * Each tab's field is still (every background but Classic's sway), so its picture is copied once, small (1/6 of the screen)
 * and soft, into a tiny picture per tab. Every card holds a tiny canvas the size of the screen, drawn from it, that stays put
 * on the screen while the card scrolls: a scroll-driven `transform` (styles.css `.frost`), which the compositor runs. The
 * graphics chip scales the tiny picture up (more softness for free); nothing is blurred per frame.
 *
 * The canvases are made with their cards (when a page is built), never added or dropped at the end of an animation; a
 * tab's picture only draws into them. Classic (it sways) keeps the plain glass.
 */
const SC = 6; // the frost picture's scale: 1 pixel for 6 css px
const pics = new Map<string, HTMLCanvasElement>(); // tab → its frost picture
const live = new Set<HTMLCanvasElement>();

const size = () => ({ w: Math.ceil(window.innerWidth / SC), h: Math.ceil(window.innerHeight / SC) });
const hueOf = (el: Element) => (el.closest('.tab-pane') as HTMLElement | null)?.dataset.hue ?? '';
const dark = () => document.documentElement.dataset.theme !== 'light';

function paint(cv: HTMLCanvasElement) {
  const src = pics.get(hueOf(cv));
  const g = cv.getContext('2d'); if (!g) return;
  if (!src) { g.clearRect(0, 0, cv.width, cv.height); cv.dataset.on = ''; return; }
  if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
  g.clearRect(0, 0, cv.width, cv.height); g.drawImage(src, 0, 0);
  cv.dataset.on = '1';
}

const imgs = new Map<string, HTMLImageElement>();
/** a moving part's own picture (SelfGlow's --glow-img), loaded; null until it is */
function partImage(el: HTMLElement): HTMLImageElement | null {
  const m = /url\("?([^")]+)"?\)/.exec(el.style.getPropertyValue('--glow-img')); if (!m) return null;
  let im = imgs.get(m[1]);
  if (!im) { im = new Image(); im.src = m[1]; imgs.set(m[1], im); im.onload = () => { const f = lastField; if (f) frostFromField(f); }; }
  return im.complete && im.naturalWidth ? im : null;
}

let lastField: HTMLElement | null = null;
/** Copy a field's picture (and its moving glows where they are now) into its tab's frost picture. */
export function frostFromField(field: HTMLElement) {
  const hue = field.dataset.hue ?? '';
  if (!hue) return;
  const sways = field.classList.contains('aurora') && document.documentElement.dataset.motion !== 'reduce';
  const cv = field.querySelector<HTMLCanvasElement>('canvas.glow-field');
  if (!dark() || sways) { pics.delete(hue); repaint(hue); return; }
  if (!cv || !cv.width || !field.hasAttribute('data-dith')) return; // (until its picture is in, the cards keep the last one)
  lastField = field;
  const { w, h } = size();
  const raw = document.createElement('canvas'); raw.width = w; raw.height = h;
  const g = raw.getContext('2d'); if (!g) return;
  const r = field.getBoundingClientRect();
  g.drawImage(cv, r.left / SC, r.top / SC, r.width / SC, r.height / SC);
  for (const el of field.querySelectorAll<HTMLElement>('[data-dith-img]')) {
    const im = partImage(el); if (!im) continue;
    const b = el.getBoundingClientRect(), op = parseFloat(getComputedStyle(el).opacity);
    if (!(op > 0) || !b.width) continue;
    g.globalAlpha = op; g.drawImage(im, b.left / SC, b.top / SC, b.width / SC, b.height / SC); g.globalAlpha = 1;
  }
  // soft (≈ 24 css px), a touch brighter, with a faint white frost: light through frosted glass, not a stronger colour
  // (a richer copy read as an orange wash over the warm palettes)
  const out = pics.get(hue) ?? document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d'); if (!o) return;
  o.filter = 'blur(4px) saturate(1.12) brightness(1.22)';
  o.drawImage(raw, 0, 0);
  o.filter = 'none';
  o.fillStyle = 'rgba(255, 255, 255, 0.035)'; o.fillRect(0, 0, w, h);
  pics.set(hue, out);
  repaint(hue);
}

function repaint(hue: string) { for (const cv of live) { if (!cv.isConnected) { live.delete(cv); continue; } if (hueOf(cv) === hue) paint(cv); } }

/** Give a card its frost: a clip the card's shape, holding a screen-sized canvas that stays put while the card scrolls. */
function dress(card: HTMLElement) {
  if (card.querySelector(':scope > .frost')) return;
  // (only a page's own cards: not one inside another card, nor inside anything that clips or scrolls (overflow hidden
  // makes a scroll box too, and the copy would then follow that box instead of the page)
  if (card.parentElement?.closest('.plinth')) return;
  const boxy = (o: string) => o === 'auto' || o === 'scroll' || o === 'hidden';
  for (let p = card.parentElement; p && !p.classList.contains('screen'); p = p.parentElement) {
    const cs = getComputedStyle(p); if (boxy(cs.overflowX) || boxy(cs.overflowY)) return;
  }
  // (a card that hides its overflow is a scroll box itself: `clip` draws the same and isn't one)
  const own = getComputedStyle(card);
  if (boxy(own.overflowX) || boxy(own.overflowY)) {
    if (own.overflowX !== 'hidden' || own.overflowY !== 'hidden') return;
    card.style.overflow = 'clip';
  }
  const wrap = document.createElement('span'); wrap.className = 'frost'; wrap.setAttribute('aria-hidden', 'true');
  const hold = document.createElement('i');
  const cv = document.createElement('canvas'); const { w, h } = size(); cv.width = w; cv.height = h;
  hold.appendChild(cv); wrap.appendChild(hold); card.appendChild(wrap);
  live.add(cv); paint(cv);
}

let started = false;
export function startFrost() {
  if (started || typeof document === 'undefined') return; started = true;
  const root = document.documentElement;
  const sh = () => root.style.setProperty('--frost-sh', `${window.innerHeight}px`);
  sh(); window.addEventListener('resize', () => { sh(); const f = lastField; if (f?.isConnected) frostFromField(f); });
  const scan = (n: ParentNode) => { for (const c of n.querySelectorAll<HTMLElement>('.screen .plinth')) dress(c); };
  scan(document);
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement) || n.classList.contains('frost')) continue;
      if (n.matches('.screen .plinth')) dress(n);
      scan(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
