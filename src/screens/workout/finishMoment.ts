import { apple, springCurve, springSamples } from '../../ui/motion';

/**
 * The finish moment's choreography, as one timeline run by the browser (Web Animations on transform and opacity only, so it
 * is drawn by the compositor at the screen's full rate; a script count-up is held to 60 fps by some Android browsers).
 *
 *   0 s     the sheet rises; the medal spins in with it like a coin turning to face you, the numbers' card and the rest of
 *           the screen ride up on the same family of springs
 *   ~0.7 s  the medal lands: felt (finish, or record), a ring of its light opens, a sheen crosses it
 *   then    each number rolls up like an odometer, one after another, overlapping; each settles on its own beat, felt as a
 *           tick, never two ticks blurred together
 *   last    the line rises word by word, then one faint breath of the medal's light, and everything is still
 */

export const MEDAL_SPRING = apple(1.15, 0.1);  // the coin's turn: slow, the faintest settle at the end
const CARD_SPRING = apple(0.62);               // the card and the rest of the screen: Apple .smooth, unhurried
const TILE_SPRING = apple(0.55);
const ROLL_SPRING = apple(0.95);               // an odometer slowing to rest
const WORD_SPRING = apple(0.6);

const at = (sp: { stiffness: number; damping: number }, x: number) => {
  const { xs } = springSamples(sp);
  const i = xs.findIndex((v) => v >= x);
  return (i < 0 ? xs.length : i) / 60;
};

/** One character of an odometer: a digit rolls `travel` places up to land on itself; anything else stands still. */
export type OdoCol = { ch: string; travel: number };
/** The ones place turns once fully before it lands (it reads as counting), higher places only as far as their digit. */
export function odoCols(text: string): OdoCol[] {
  const ds = [...text].filter((c) => /\d/.test(c)).length;
  let place = ds;
  return [...text].map((ch) => {
    if (!/\d/.test(ch)) return { ch, travel: 0 };
    place--;
    const d = +ch;
    return { ch, travel: d + (place === 0 && ds > 1 ? 10 : 0) };
  });
}
/** Seconds until a roll of `travel` places reads as landed (within an eighth of a digit). */
export const rollSettle = (travel: number) => (travel <= 0 ? 0 : at(ROLL_SPRING, 1 - 0.12 / travel));

export type Plan = { medalLand: number; starts: number[]; settles: number[]; line: number; end: number };
/** When each number starts and settles: each one lands about a quarter second after the one before, never closer. */
export function plan(texts: string[]): Plan {
  const medalLand = at(MEDAL_SPRING, 0.96);
  const starts: number[] = [], settles: number[] = [];
  texts.forEach((txt, i) => {
    const t = rollSettle(Math.max(0, ...odoCols(txt).map((c) => c.travel)));
    const want = Math.max(medalLand + 0.3 + i * 0.27, (settles[i - 1] ?? 0) + 0.24);
    const st = Math.max(0.22 + i * 0.09, starts[i - 1] ?? 0, want - t);
    starts.push(st); settles.push(Math.max(want, st + t));
  });
  const line = (settles.at(-1) ?? medalLand) + 0.12;
  return { medalLand, starts, settles, line, end: line + 0.9 };
}

const ROW = 1.15; // em: one digit's height in the odometer

/** Plays the choreography on the summary's elements (found by data-fm). Returns a stop. */
export function play(root: HTMLElement, p: Plan): () => void {
  const all: Animation[] = [];
  const run = (el: Element | null | undefined, frames: Keyframe[], sp: { stiffness: number; damping: number }, delay: number, fill: FillMode = 'backwards') => {
    if (!el) return;
    const c = springCurve(sp);
    all.push((el as HTMLElement).animate(frames, { duration: c.duration, easing: c.easing, delay: delay * 1000, fill }));
  };
  const fade = (el: Element | null | undefined, delay: number, duration = 0.32) => {
    if (!el) return;
    all.push((el as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 1000, easing: 'cubic-bezier(.2, .7, .3, 1)', delay: delay * 1000, fill: 'backwards' }));
  };
  const ease = (el: Element | null | undefined, frames: Keyframe[], duration: number, delay: number, easing = 'cubic-bezier(.3, .6, .3, 1)') => {
    if (!el) return;
    all.push((el as HTMLElement).animate(frames, { duration: duration * 1000, easing, delay: delay * 1000, fill: 'forwards' }));
  };
  const q = (k: string) => root.querySelector(`[data-fm="${k}"]`);
  const qa = (k: string) => [...root.querySelectorAll(`[data-fm="${k}"]`)];

  // the medal turns to face you as it rises with the sheet
  run(q('disc'), [{ transform: 'translate3d(0, 26px, 0) scale(.55) rotateY(-360deg)' }, { transform: 'translate3d(0, 0, 0) scale(1) rotateY(0deg)' }], MEDAL_SPRING, 0.02);
  fade(q('disc'), 0.02, 0.4);
  // as it lands: its light opens once, a sheen crosses it, the rays (records) open and fade, the record label rises
  ease(q('halo'), [{ opacity: 0.75, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.3)' }], 1.6, p.medalLand - 0.12);
  ease(q('sheen'), [{ transform: 'translate3d(-120%, 0, 0)' }, { transform: 'translate3d(120%, 0, 0)' }], 1.5, p.medalLand - 0.05, 'cubic-bezier(.45, 0, .2, 1)');
  qa('ray').forEach((r, i) => ease(r, [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 0.85, transform: 'scaleY(1)', offset: 0.4 }, { opacity: 0, transform: 'scaleY(.8)' }], 1.3, p.medalLand - 0.25 + i * 0.025, 'cubic-bezier(.22, 1, .36, 1)'));
  run(q('label'), [{ transform: 'translate3d(0, 8px, 0)' }, { transform: 'none' }], WORD_SPRING, p.medalLand - 0.1); fade(q('label'), p.medalLand - 0.1);
  // the card and everything under it ride up with the sheet
  run(q('card'), [{ transform: 'translate3d(0, 28px, 0)' }, { transform: 'none' }], CARD_SPRING, 0.06); fade(q('card'), 0.06);
  run(q('rest'), [{ transform: 'translate3d(0, 36px, 0)' }, { transform: 'none' }], CARD_SPRING, 0.16); fade(q('rest'), 0.16, 0.45);
  // the numbers: each tile rises as its digits start to roll
  qa('tile').forEach((tile, i) => {
    const st = p.starts[i] ?? 0;
    run(tile, [{ transform: 'translate3d(0, 14px, 0)' }, { transform: 'none' }], TILE_SPRING, st); fade(tile, st, 0.28);
    tile.querySelectorAll<HTMLElement>('[data-travel]').forEach((strip) => {
      const n = +strip.dataset.travel!;
      run(strip, [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${-n * ROW}em, 0)` }], ROLL_SPRING, st);
    });
  });
  // the line, word by word
  qa('word').forEach((w, i) => { run(w, [{ transform: 'translate3d(0, 10px, 0)' }, { transform: 'none' }], WORD_SPRING, p.line + i * 0.045); fade(w, p.line + i * 0.045, 0.4); });
  qa('after').forEach((el, i) => { run(el, [{ transform: 'translate3d(0, 12px, 0)' }, { transform: 'none' }], CARD_SPRING, p.line + 0.3 + i * 0.08); fade(el, p.line + 0.3 + i * 0.08); });
  // the settle: one fainter, slower breath of the medal's light
  ease(q('settle'), [{ opacity: 0, transform: 'scale(1)' }, { opacity: 0.4, transform: 'scale(1.08)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.2)' }], 2, p.line + 0.25);
  return () => all.forEach((a) => a.cancel());
}
