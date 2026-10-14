import { liquidReduced, playLiquid, type LiquidPlan, type LiquidSlice } from '../../ui/liquid';

/**
 * The Food diary's empty day is one card (a row per meal); the first food turns it into one card per meal, and removing the last
 * one turns them back. This measures the two layouts and plays the liquid-glass change between them (ui/liquid.ts).
 */

type Row = { el: HTMLElement; top: number; bottom: number; name: number; plus: number; late: { el: HTMLElement; at: number }[]; plusEl: HTMLElement | null };
type Snap = { joined: boolean; cards: HTMLElement[]; metas: HTMLElement[]; slices: Row[]; x0: number; x1: number; radius: number; below: { el: HTMLElement; top: number }[] };

// what arrives with the glass, and how far the glass has to get before it shows (the foods are the lowest part of a card)
const LATE: [string, number][] = [['.meal-meta', 0.28], ['.meal-head > .icon-btn', 0.28], ['.meal-bar', 0.55], ['.meal-list', 0.8]];

/** Where everything of the meals block is, in px from the top-left of the page part (`.subpage`) it sits in. */
export function snapMeals(root: HTMLElement): Snap | null {
  const o = root.getBoundingClientRect();
  const kids = [...root.children] as HTMLElement[];
  const first = kids.findIndex((k) => k.classList.contains('meals-empty') || k.classList.contains('meal'));
  if (first < 0) return null;
  const joined = kids[first].classList.contains('meals-empty');
  const rel = (e: Element) => { const r = e.getBoundingClientRect(); return { top: r.top - o.top, bottom: r.bottom - o.top, left: r.left - o.left, right: r.right - o.left }; };
  let slices: Row[];
  let cards: HTMLElement[];
  const metas: HTMLElement[] = [];
  let box: ReturnType<typeof rel>;
  let end = first + 1;
  if (joined) {
    const card = kids[first]; cards = [card]; box = rel(card);
    const rows = [...card.querySelectorAll<HTMLElement>('.meal-row')];
    slices = rows.map((el, k) => {
      const r = rel(el);
      return { el, top: k === 0 ? box.top : r.top, bottom: k === rows.length - 1 ? box.bottom : rel(rows[k + 1]).top, name: rel(el.querySelector('.meal-name')!).top, plus: rel(el.querySelector('.meal-add')!).top, late: [], plusEl: el.querySelector<HTMLElement>('.meal-add') };
    });
  } else {
    const secs = kids.slice(first).filter((k) => k.classList.contains('meal'));
    end = first + secs.length;
    cards = secs;
    // the "nothing logged" lines are gone with the cards: keep a copy of each, where it was, to fade out
    secs.forEach((sec) => sec.querySelectorAll<HTMLElement>('.meal-meta').forEach((m) => {
      const r = rel(m), c = m.cloneNode(true) as HTMLElement;
      c.className += ' lq-ghost-text'; c.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
      metas.push(c);
    }));
    box = { top: rel(secs[0]).top, bottom: rel(secs[secs.length - 1]).bottom, left: rel(secs[0]).left, right: rel(secs[0]).right };
    slices = secs.map((el) => { const r = rel(el); return { el, top: r.top, bottom: r.bottom, name: rel(el.querySelector('.meal-name')!).top, plus: rel(el.querySelector('.meal-add')!).top, late: LATE.flatMap(([q, at]) => [...el.querySelectorAll<HTMLElement>(q)].map((e) => ({ el: e, at }))), plusEl: el.querySelector<HTMLElement>('.meal-add') }; });
  }
  const below = kids.slice(end).filter((k) => !k.classList.contains('liquid')).map((el) => ({ el, top: rel(el).top }));
  const radius = parseFloat(getComputedStyle(kids[first]).borderTopLeftRadius) || 22;
  return { joined, cards, metas, slices, x0: box.left, x1: box.right, radius, below };
}

/** Builds the plan from the layouts before and after the swap, and plays it. `after` is measured with the new cards in place. */
export function playMealsLiquid(layer: SVGSVGElement, before: Snap, after: Snap): { done: Promise<void>; cancel: () => void } | null {
  if (liquidReduced() || before.slices.length !== after.slices.length || before.slices.length < 2) return null;
  const split = before.joined; // the empty card becomes the meals
  const slices: LiquidSlice[] = after.slices.map((a, k) => {
    const b = before.slices[k];
    // the element's first text sits where it sat: its top at the start = its end top + (old name − new name)
    const elTo = a.el.getBoundingClientRect().top - root(a.el).top;
    const elFrom = elTo + (b.name - a.name);
    const plusFrom = a.plusEl ? b.plus - a.plus - (elFrom - elTo) : 0;
    return {
      el: a.el, from: { top: b.top, bottom: b.bottom }, to: { top: a.top, bottom: a.bottom }, elTo, elFrom,
      plus: a.plusEl ? { el: a.plusEl, from: plusFrom } : undefined,
      late: after.joined ? undefined : a.late,
    };
  });
  const below = after.below.map((a, i) => ({ el: a.el, from: before.below[i]?.top ?? a.top, to: a.top }));
  const plan: LiquidPlan = { layer, dir: split ? 'split' : 'merge', x0: after.x0, x1: after.x1, radius: after.radius, slices, below, texts: before.metas, glints: after.cards, ghosts: before.joined ? [{ top: before.slices[0].top, bottom: before.slices[before.slices.length - 1].bottom }] : before.slices.map((b) => ({ top: b.top, bottom: b.bottom })), box: split ? { x0: before.x0, x1: before.x1, top: before.slices[0].top, bottom: before.slices[before.slices.length - 1].bottom } : { x0: after.x0, x1: after.x1, top: after.slices[0].top, bottom: after.slices[after.slices.length - 1].bottom }, divider: [after.x0 + 20, after.x1 - 20] };
  layer.style.visibility = 'visible';
  return playLiquid(plan);
}

const root = (el: HTMLElement) => (el.closest('.subpage') as HTMLElement).getBoundingClientRect();
