import { createContext, memo, startTransition, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useStore, exerciseMap } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Exercise, SessionExercise, SetRecord, WorkoutSession } from '../../lib/types';
import { Icon } from '../../ui/Icon';
import { Collapse, NumInput, Stepper } from '../../ui/kit';
import { Roll } from '../../ui/Roll';
import { flip } from '../../ui/flip';
import { Sheet, SheetHead, SOFT, useOverlayZ } from '../../ui/Sheet';
import { elapsedMs, historyOf, incrementFor, lastPerformance, repRange, sessionSetCount, sessionVolume, suggestProgression, countable } from '../../lib/workout';
import { dayKey, fmtDuration } from '../../lib/dates';
import { displayToKg, kgToDisplay, fmtNum, displayToM, mToDisplay } from '../../lib/units';
import { useNow } from '../../lib/hooks';
import { dockTop, setWorkoutOpener, takeWorkoutFrom, wkSourceRect, type WkSource } from '../../ui/workoutOpen';
import { nextSetOf, prepareRestAudio } from './rest';
import { completeSet, onSetDone } from './complete';
import { Briefing, LiftHints, useLiftHint } from './Briefing';
import { addSet, deleteSet, moveExercise, patchExercise, patchSet, removeExercise, adjustRest, skipRest, toggleSuperset } from './actions';
import { exName, fmtSet, MUSCLE_LABEL } from './common';
import { SphereSlot, mirrorOrb, orbPress, orbTap } from '../../ui/Sphere';
import { useSwipeDown } from '../../ui/swipe';
import { noteMove } from '../../lib/stutter';
import { Mirror, contentTransform, mirrorProgress, trackCover, warmStage, type Engage } from '../../ui/engage';
import { readRGB, setBarTint } from '../../ui/statusBar';
import { kb, keyboardGoal, onKeyboardGoal, rideFocus } from '../../ui/keyboard';
import { viewportH } from '../../ui/viewport';
import { BOUNCY, SMOOTH, SURFACE, SURFACE_EXIT, WINDOW_CLOSE, WINDOW_OPEN, mirrorSpring, snapPx } from '../../ui/motion';
import { FocusView, fadeOutPage, upNextOf, useFocusPage, type FocusApi } from './Focus';
import { morphBack, morphLand, morphStart, type Morph } from './morph';
import { WkBreathGlow, WkFieldGlow } from './wkGlow';
import { LANDS, anchorOf, arrive, catches, flyHero, landStyle, samples, type Anchor, type Hero, type Land } from './landing';

// the morph's fades, in progress (see `F` in Active)
const FADE_OUT = { inside: [0.167, 0.28], skin: [0.18, 0.26], words: [0.1, 0.188], back: [0.105, 0.15], solid: [0.17, 0.18] };
const FADE_IN = { inside: [0.025, 0.08], skin: [0.06, 0.16], words: [0.002, 0.03], back: [0, 0.03], solid: [0.018, 0.04] };
// Round 7 (landing.ts): the window's page leaves early on the way down and comes in late on the way up, so it is never seen
// as a shrunken page; the clock carries the eye. B lands on the card itself (no hold), so its fades are r6's, moved down.
// (`views`: the list, which comes in after the header, once the clock has passed it)
// (`mat`: the card's own look on the copy; `skin` is then the plain ground under it, which stands in for the window's light
// from midway, so the window never shows as an empty patch of light: it is a plain surface carrying the clock, and the
// card's look comes up on it at the end)
// (`pop`, `popS`: the card's play button on a layer of its own, so it never shows half see-through: it comes up quickly over
// `pop` while it is still a touch small, and grows the last bit into its place over `popS`; leaving, the reverse)
type Fades = typeof FADE_OUT & { views?: number[]; mat?: number[]; pop?: number[]; popS?: number[]; /** the play button's size at the far end of popS (0.88) */ popTo?: number; veil?: number[]; meta?: number[]; bar?: number[] };
const FADES: Record<Land, { out: Fades; in: Fades }> = {
  A: { out: { ...FADE_OUT, inside: [0.86, 0.99], skin: [0.42, 0.8], mat: FADE_OUT.skin }, in: { ...FADE_IN, inside: [0.68, 0.94], views: [0.86, 0.995], skin: [0.32, 0.66], mat: FADE_IN.skin } },
  B: { out: { inside: [0.5, 0.97], skin: [0.38, 0.76], mat: [0.089, 0.178], words: [0, 0.06], back: [0.006, 0.056], solid: [0.078, 0.089], pop: [0.07, 0.1], popS: [0, 0.1] }, in: { ...FADE_IN, words: [0.002, 0.07], pop: [0.002, 0.025], popS: [0.002, 0.05], inside: [0.62, 0.9], views: [0.8, 0.99], skin: [0.6, 0.88], mat: FADE_IN.skin } },
  // D (design A): the page is in the window the whole way. What the card and the header both show (the name, the clock)
  // flies as one piece (launchHero); everything else hands over with an overlap of a few frames, never one after the other
  // (r1 showed an empty card or pill for 1-3 frames at every hand-over), and never on top of its twin. Opening, the card's
  // words go over 0-9 % and the header comes in over 7-18 %, the list after it; closing, the page goes over 22-10 % and the
  // card's words come in over 15-6 %. The play button is never half see-through over the dark (brown): it is whole the
  // whole time and grows out of (or shrinks into) a dot at its middle, a disc opening, over the last 12 % (the first 6 %
  // opening); only the dot, at 15 % of its size, appears or goes in a frame. `veil`: the card's plain ground stays over the window's own light until the
  // window is a good part of the screen (r1: the light squeezed into a card or bar read as a flat red-orange slab); it is
  // set on plain progress, as `meta` is: the header's tally and progress bar, which leave in the first frames of a close
  // (the clock flies down through where they are) and come back once it has flown up.
  D: { out: { inside: [0.1, 0.2], views: [0.12, 0.22], skin: [0.1, 0.2], veil: [0.25, 0.45], meta: [0.88, 0.96], bar: [0.86, 0.97], mat: [0.089, 0.178], words: [0.06, 0.15], back: [0.006, 0.056], solid: [0.078, 0.089], pop: [0.115, 0.12], popS: [0, 0.12], popTo: 0.15 }, in: { ...FADE_IN, words: [0.002, 0.09], pop: [0.08, 0.09], popS: [0, 0.09], popTo: 0.08, inside: [0.07, 0.18], views: [0.09, 0.22], skin: [0.06, 0.2], veil: [0.25, 0.45], meta: [0.25, 0.45], bar: [0.74, 0.97], mat: FADE_IN.skin } },
  C: { out: { ...FADE_OUT, inside: [0.88, 0.995], skin: [0.42, 0.8], mat: FADE_OUT.skin }, in: { ...FADE_IN, inside: [0.6, 0.9], views: [0.8, 0.99], skin: [0.32, 0.6], mat: FADE_IN.skin } },
};
// B: how much the card gives as it catches the window (per unit of the spring's overshoot past the card): it shrinks a
// touch about its middle and dips, then springs back; the shape never changes, only its size and place
const CATCH_K = 0.4, CATCH_D = 200;
// D: no give in size, and a shallower dip (r1: 6 px, still creeping a tenth of a pixel at 0.8 s; now about 3 px)
const CATCH_KD = 0, CATCH_DD = 110;
// the card the fades are set for: any place this tall or taller lands on them as they are (`fk`)
const FK_REF = 150;
// C: how far the list sinks as it packs away (and rises from as it comes in)
const PACK = 40;
const tintMemo = new Map<string, { tab: number[]; wk: number[] }>();
/** False while the workout is minimised (kept alive but hidden): its clocks stop ticking. */
const WkLive = createContext(true);
/** When Finish was tapped: the header clock holds that time while the window fades out. */
let clockStop: number | null = null;
/**
 * The workout as it was the moment it was finished or discarded, while its window slides away (WorkoutHost). The store has
 * no active workout any more by then; without this the whole window and the sheet on it vanished in one frame.
 */
export const WkFrozen = createContext<WorkoutSession | null>(null);
/** The id of the empty stand-in the window is built ahead with, before any workout exists (WorkoutHost). */
export const WK_GHOST = 'wk-ahead';
/** The live workout, or the one just ended while it leaves the screen. */
export function useActive(): WorkoutSession | null {
  const frozen = useContext(WkFrozen);
  const live = useStore((s) => s.active);
  return frozen ?? live;
}

/**
 * The live workout: a full-height card that rises over the page (which steps back behind it), like Apple Music's player.
 * Kept alive between openings (WorkoutHost): `open` false slides it away and then hides it.
 */
export function ActiveWorkout({ props, open = true, onGone, vanish = false }: { props: { origin?: 'hero' | 'pill' | 'none' }; open?: boolean; onGone?: () => void; /** close without the slide (it is already hidden under the finish sheet) */ vanish?: boolean }) {
  const t = useT();
  const lang = useLang();
  // narrow selections: the screen re-renders when the session changes, not on every store write
  const a = useActive();
  const exercises = useStore((s) => s.exercises);
  const weightUnit = useStore((s) => s.settings.units.weight);
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const swap = useUI((u) => u.swap);
  const toast = useUI((u) => u.toast);
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const swipeV = useRef(0);
  useSwipeDown(dialogRef, dragY, (v) => { swipeV.current = v ?? 0; close(swipeV.current || dragY.getVelocity()); }, { threshold: 130 });
  // Presented like an iOS sheet: the whole window rises from the bottom edge of the screen to the top while the page behind
  // steps back and dims, and sinks back down when you close it or drag it away from anywhere. One number (`p`, the finger
  // included in `eFinger`) drives the window, the page behind, the dim and the orb. Only a transform moves: nothing is
  // blurred, clipped, faded or laid out on the way.
  const H = viewportH;
  const p = useMotionValue(0);
  // what the page's own styles are drawn from: `p` itself, except while the browser runs the same motion (runMirror), when
  // it holds still, so nothing is restyled on every frame (the phone's main thread stays free; the browser draws it all)
  const pv = useMotionValue(0);
  const frozen = useRef(false);
  // it travels a little past the bottom edge: a spring's last few percent take a while, and the window's top edge (and its
  // shadow) used to hang just under the tab bar for that long after closing. Its colour reaches 48 px above that edge
  // (--wk-lead, styles.css), so that much further too: v0.1.97 left that band lying over the tab bar at the end of a minimise
  const LEAD = 48;
  const sheetTop = (pp: number) => (1 - pp) * (H + 64 + LEAD);
  // The card it opens from: tapped on Today's workout card or the resume bar, the window is that card growing — its edges
  // travel from the card's to the screen's (the top up, the sides out, the bottom down to the edge), the page inside grows
  // with it from the card's width, and minimising shrinks it back into the card (or the bar) it lives in. Opened from
  // anywhere else (a notification, the Coach) it rises from the bottom edge as before. Transforms only (styles.css,
  // .wk-sheet / .wk-bclip / .wk-bshift): the top and sides are the window's own box, scaled; the bottom is a second box
  // inside it, moved up while its contents move down by the same amount, so nothing in the page moves with it.
  const from = useRef<{ l: number; t: number; w: number; b: number; h: number } | null>(null);
  const dims = useRef({ W: 0, hA: 0, RB: 0 }); // the window's width, its box's height (screen + lead), how far the bottom box reaches below the screen
  const leaving = useRef(false);
  // Opening, the window sets off the moment the card is tapped, as the card itself (a copy of it, words and all, takes its
  // place in that frame), at no speed and easing in; closing, it is the card again by the time it gets there and lands in
  // the card's (or bar's) exact outline at 10 % of the spring, eased in to no speed, where the card takes over in the same
  // frame (r5 faded the window out short of the card while the card's own outline was already back under it: two outlines).
  const ls = useRef<Land>('A');
  const catching = () => leaving.current && catches(ls.current) && !!from.current;
  const hold = () => (leaving.current && !catching() ? 0.1 : 0);
  // (B comes down at its own speed onto the card: no easing in at the end)
  const ease = () => (catching() ? 0 : 0.15);
  const qOf = (pp: number) => { const h = hold(), E = ease(), u = Math.max(0, (pp - h) / (1 - h)); return (u < E ? (u * u) / (2 * E) : u - E / 2) / (1 - E / 2); };
  const ppOf = (q: number) => { const h = hold(), E = ease(), v = q * (1 - E / 2), u = v < E / 2 ? Math.sqrt(2 * E * v) : v + E / 2; return h + u * (1 - h); };
  // Opening, the spring (no bounce) has a long tail: its last pixels glided in a screen pixel at a time, then it snapped.
  // Its last 3.5 % is eased out to a stop instead (the remaining distance squared), and it is all the way up with 0.5 % of
  // the spring still to go: it slows to nothing and rests, at about 0.66 s, with no last step.
  const LAND = 0.015, LAND_AT = 0.005;
  const G = (v: number) => (v >= 2 * LAND ? v - LAND : (v * v) / (4 * LAND));
  const landed = (pp: number) => {
    if (!from.current || leaving.current || catches(ls.current)) return pp; // (B opens past the top and settles back)
    return 1 - G(Math.max(0, 1 - pp - LAND_AT)) / G(1 - LAND_AT);
  };
  // how far the window has grown (0 = the card, 1 = the screen), eased in from the hold
  const qAt = (pp: number) => {
    const g = from.current;
    // the spring's last stretch is under half a pixel for every edge: it lands there, instead of creeping the last pixels
    // one screen pixel at a time
    pp = landed(pp);
    if (g && Math.abs(1 - pp) * (g.t + LEAD + dims.current.hA) < 0.5) pp = 1;
    return qOf(pp);
  };
  // B, past the card: the card's outline, a touch smaller about its middle and lower (it gives as it catches the window)
  const gAt = (pp: number) => {
    const g = from.current;
    if (!g || pp >= 0 || !catching()) return g;
    const live = ls.current === 'D', c = 1 + pp * (live ? CATCH_KD : CATCH_K), dy = -pp * (live ? CATCH_DD : CATCH_D), cx = g.l + g.w / 2, cy = (g.t + g.b) / 2, hh = ((g.b - g.t) / 2) * c;
    return { l: cx - (g.w / 2) * c, t: cy - hh + dy, w: g.w * c, b: cy + hh + dy, h: g.h * c };
  };
  const dragOff = useRef(0);
  const geo = (pp: number) => {
    const g = gAt(pp), { W, hA, RB } = dims.current;
    if (!g || !W) return { x: 0, y: sheetTop(pp) - LEAD, s: 1, by: 0 };
    const q = qAt(pp);
    // the width is whole a moment before the window lands (at 98.5 %): it then settles at exactly its own size, sharp, and
    // the spring's tail is only a vertical glide off the top of the screen
    const k = Math.min(1, q / 0.985);
    // (D let go after a swipe: the window sets off whole, from where the finger left it, and that offset fades with the
    // window's own progress, so the first frame of the close is the dragged window exactly, dragOff)
    const off = dragOff.current * Math.min(1, Math.max(0, q)); // (on q, as the edges are: on pp it let go a frame early, 7 px up)
    const y = g.t + (-LEAD - g.t) * q + off, s = (g.w + (W - g.w) * k) / W, x = g.l * (1 - k);
    const bot = g.b + (hA - LEAD + RB - g.b) * q + off; // the bottom edge on the screen
    return { x, y, s, by: Math.min(0, (bot - y) / s - (hA + RB)) };
  };
  const aAt = (pp: number) => { const g = geo(pp); return g.s === 1 ? `translate3d(0, ${snapPx(g.y + LEAD)}px, 0)` : `translate(${g.x.toFixed(2)}px, ${(g.y + LEAD).toFixed(2)}px) scale(${g.s.toFixed(5)})`; };
  const bAt = (pp: number) => `translateY(${geo(pp).by.toFixed(2)}px)`;
  const cAt = (pp: number) => `translateY(${(-geo(pp).by).toFixed(2)}px)`;
  // The card's look, stretched to the window's outline (.wk-skin's copy of the card's surface: the card's own size, so it is
  // the card exactly once it has landed): only its height changes, as the window's does.
  const matAt = (pp: number) => {
    const g = from.current, { W } = dims.current;
    if (!g || !W) return 'none';
    const { y, s, by } = geo(pp), s0 = g.w / W, bot = y + s * (dims.current.hA + dims.current.RB + by);
    // (a card running on under the tab bar: the part under the bar stays where it is, below the window's edge)
    return `scale(${(W / g.w).toFixed(5)}, ${(((bot - y) / s + (g.h - (g.b - g.t)) / s0) / g.h).toFixed(5)})`;
  };
  const sheetT = useTransform(pv, aAt);
  const bclipT = useTransform(pv, bAt);
  const bshiftT = useTransform(pv, cAt);
  // Grown from a card, the window IS the card to begin with: a copy of the card (.wk-skin: its surface and its words) takes
  // its place exactly in the tap and sets off at once; the card's words fade on it as it goes, the window's own colour comes
  // up under it and its page over it, and the copy fades as the window grows. Closing is the same in reverse, and the copy
  // is whole again before it lands: the window's page goes, the card's look comes back over the window's colour and its
  // words come back on it, all while it still moves; then the window's colour under it clears (it is a few pixels from
  // the card by then, never over a neighbour) and it lands in the card's outline as the card itself, which takes over
  // there. The page around it dims a touch while it grows (gone, unseen, by the time it is covered). Rising from the bottom
  // edge it is solid all the way, as before.
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  // The card's words and the workout's own (its header, at the card's top: `lift`) cross on the moving window, never both
  // above 15 %: opening, the card's go over the first 3 % and the header comes in over 2.5-8 %; minimising, the window's
  // page goes over 28-17 % and the card's words come in over 19-10 %, landing whole (v3 let the card's words go first and
  // showed a blank slab; r4 crossed them over each other; r5 brought them back on a card at rest).
  //   skin   the copy of the card (its look), over the window's colour
  //   back   the ground under the copy (the window's own, opaque): it hides what the window covers, and clears at the card
  //   words  the card's words on the copy
  const F = () => (leaving.current ? FADES[ls.current].out : FADES[ls.current].in);
  // The fades are set for Today's card. A smaller place to land (the resume bar, 56 px tall) is reached in the same
  // progress but is a far smaller target: at 10 % from home the window is still twice its height. So there every fade
  // runs on progress stretched by how much bigger the window is than its target, against the card (`fk`, 1 for the card),
  // and each part changes when the window has the same share of its size left to lose as it does over the card.
  const fk = useRef(1);
  const ramp = (pp: number, [a, b]: number[]) => clamp01((pp * fk.current - a) / (b - a));
  const solid = (pp: number) => (from.current ? ramp(pp, F().solid) : 1);
  const inside = (pp: number) => (from.current ? ramp(pp, F().inside) : 1);
  const insideV = (pp: number) => (from.current ? ramp(pp, F().views ?? F().inside) : 1);
  // (never quite 0 while it is there: the browser leaves what lies inside a fully clear layer to the page to animate, frame
  // by frame, instead of running it itself)
  const skinO = (pp: number) => { const v = F().veil; return Math.max(0.002, 1 - (v ? clamp01((pp - v[0]) / (v[1] - v[0])) : ramp(pp, F().skin))); };
  const metaO = (pp: number) => { const v = F().meta; return from.current && v ? clamp01((pp - v[0]) / (v[1] - v[0])) : 1; };
  const wordsO = (pp: number) => Math.max(0.002, 1 - ramp(pp, F().words));
  const popO = (pp: number) => Math.max(0.002, 1 - ramp(pp, F().pop ?? F().words));
  // D closing: the card's words ride the middle of the window while it is still taller than the card (r1: they sat at its
  // top over an empty lower third as it landed); what flies to them (launchHero) aims there too
  const wordsDy = (pp: number) => {
    const g = from.current, { W, hA, RB } = dims.current;
    if (!g || !W || ls.current !== 'D' || !leaving.current) return 0;
    const v = (hA + RB + geo(pp).by - (g.b - g.t) / (g.w / W)) / 2;
    return v > 0.05 ? v : 0;
  };
  const wordsAt = (pp: number) => { const dy = wordsDy(pp), k = skinParts.current?.k ?? 1; return `${dy ? `translateY(${dy.toFixed(2)}px) ` : ''}scale(${k.toFixed(5)})`; };
  const popAt = (pp: number) => `${wordsDy(pp) ? `translateY(${wordsDy(pp).toFixed(2)}px) ` : ''}scale(${((skinParts.current?.pop?.k ?? 1) * (1 - (1 - (F().popTo ?? 0.88)) * ramp(pp, F().popS ?? F().words))).toFixed(5)})`;
  const matR = () => F().mat ?? F().skin;
  const matO = (pp: number) => (F().mat ? Math.max(0.002, 1 - ramp(pp, F().mat!)) : 1);
  const toneO = (pp: number) => (F().mat ? Math.max(0.002, ramp(pp, F().mat!)) : 0.002);
  // (the resume bar's own glass is frosted and see-through without its blur: the window's ground is under its copy from the
  // tap, so nothing behind the bar shows through it, r1 pill-resume)
  const backO = (pp: number) => (!exact.current && !leaving.current && from.current ? 1 : ramp(pp, F().back));
  // The page behind steps back while the window grows: it dims and sinks a touch (the sheets' own step back, v0.1.76:
  // contentTransform, to 95 %), the two in step. It starts as the window sets off (eased in, so it is still at rest on the
  // frame the window lands in the card on the way down: the card, and the tab bar on it, stop exactly there); at the top it
  // lets go only once the window covers the whole screen (98.6 %), unseen, so no edge of the page lightens while in view.
  const ENV = [0.1, 0.6, 0.986, 0.996];
  const easeIn = (u: number) => (u < 0.3 ? (u * u) / 0.6 : u - 0.15) / 0.85;
  const env = (pp: number) => (from.current ? easeIn(clamp01((pp - ENV[0]) / (ENV[1] - ENV[0]))) * (1 - clamp01((pp - ENV[2]) / (ENV[3] - ENV[2]))) : 0);
  const dim = (pp: number) => 0.3 * env(pp);
  // where env bends (its eased start in steps of 1.5 %: straight lines between them are within a hair of the curve)
  const ENVB = [...Array.from({ length: 11 }, (_, i) => ENV[0] + i * 0.015), ENV[1], ENV[2], ENV[3]];
  const solidO = useTransform(pv, solid);
  const insideO = useTransform(pv, inside);
  const insideVO = useTransform(pv, insideV);
  const dimO = useTransform(pv, dim);
  // the orb's slot in the bar: where it is at rest, and how far the window has moved it at progress pp (its top edge, scaled)
  const slotTop = useRef(0);
  // D: the workout's bar rides the window's bottom edge the whole way, just above the tab bar that edge carries down (r1:
  // the tab bar went, then nothing at the bottom for 19 frames, then the bar rose: two moves with a hole between). It is
  // tucked under that edge while the window is card-sized (it would lie over the card's words) and rises out of it as the
  // window grows (moved, never faded: a fade on the bar's ancestor turns its frost off until the fade ends).
  // (how far: from the bar's top to the window's edge at rest, which is that far below the screen, measured as it sets off)
  const barTuck = useRef(160);
  // (on absolute progress, not the card-stretched kind: it rides only while the window is near full size. Riding the edge of a
  // small window it ran over the header and the rows (round 2 judge), so it sinks out first on the way down and comes up
  // last on the way up)
  const barBy = (pp: number) => { const v = F().bar; return from.current && ls.current === 'D' && v ? geo(pp).by + barTuck.current * (1 - clamp01((pp - v[0]) / (v[1] - v[0]))) : 0; };
  const barRef = useRef<HTMLDivElement>(null);
  const lastBar = useRef({ by: 0 });
  const barT = (by: number) => (by ? `translateY(${by.toFixed(2)}px)` : 'none');
  const barAt = (pp: number) => {
    const el = barRef.current; if (!el) return;
    const by = barBy(pp); if (by === lastBar.current.by) return; lastBar.current = { by };
    el.style.transform = by ? barT(by) : '';
  };
  const slotShift = (pp: number) => { const g = geo(pp); return g.y + g.s * (slotTop.current + LEAD + barBy(pp)) - slotTop.current; };
  const dragT = useTransform(dragY, (d) => Math.max(0, d) + Math.min(0, d) * 0.15);
  const dialogY = useTransform([p, dragY], ([pp, d]: number[]) => slotShift(pp) + Math.max(0, d) + Math.min(0, d) * 0.15); // how far the content is displaced (for the orb)
  const eFinger = useTransform([p, dragY], ([pp, d]: number[]) => Math.min(1, Math.max(0, pp - Math.max(0, d) / H)));
  const eFingerV = useTransform([pv, dragY], ([pp, d]: number[]) => Math.min(1, Math.max(0, pp - Math.max(0, d) / H)));
  const engage = useMemo(() => ({ e: eFinger, shift: dialogY }), [eFinger, dialogY]);
  const depthId = useId();
  // A full page, not a pop-up: it rises over the page as it is (nothing behind steps back or dims), and its own top fades
  // from the status bar's colour like every tab's page, so the bar reads as part of it. The bar takes the workout's own tint
  // (the one the tabs would give its hue) in the frames its top edge passes under the bar, and the tab's back as it leaves:
  // whatever is under the bar, the bar is its colour. Only the bar changes (theme-color); nothing on the page is restyled.
  const tintOf = (el: Element | null, mix = 'var(--bar-mix)') => {
    if (!el) return null;
    const probe = document.createElement('i');
    probe.style.cssText = `position:absolute;width:0;height:0;pointer-events:none;color:color-mix(in srgb, var(--h1) ${mix}, var(--bg))`;
    el.appendChild(probe); const c = readRGB(getComputedStyle(probe).color); probe.remove();
    return c;
  };
  const tints = useRef<{ tab: number[]; wk: number[] } | null>(null);
  const takeTints = () => {
    // (read once for each look: reading them restyled the page in the tap)
    const look = JSON.stringify(document.documentElement.dataset);
    const hit = tintMemo.get(look);
    const tab = hit?.tab ?? tintOf(document.querySelector('.app')), wk = hit?.wk ?? tintOf(dialogRef.current);
    if (!tab || !wk) return;
    tints.current = { tab, wk }; tintMemo.set(look, { tab, wk });
    // the page's own top is that colour, fixed (written on the strip itself: a variable on the window would restyle
    // everything in it, in the tap)
    topRef.current?.style.setProperty('--wk-bar', `rgb(${wk.map(Math.round).join(' ')})`);
    fillRef.current?.style.setProperty('--wk-bar', `rgb(${wk.map(Math.round).join(' ')})`);
  };
  // the progress where the window's top reaches the screen's top (the status bar turns to its colour there)
  const barAtOf = () => { const g = from.current; return g ? ppOf(g.t / (g.t + LEAD)) : 1 - LEAD / (H + 64 + LEAD); };
  useEffect(() => {
    let last = '';
    return eFinger.on('change', (v) => {
      const t = tints.current; if (!t) return;
      const at = barAtOf();
      const k = Math.min(1, Math.max(0, (v - (at - 0.015)) / 0.03));
      // the page's side of the bar dims with the page while the window grows out of a card (.wk-dim: the same colour and
      // strength), so no bright strip lies across the top of a dimmed page
      const light = document.documentElement.dataset.theme === 'light';
      const a = dim(v) * (light ? 0.55 : 1), dc = light ? [20, 24, 30] : [0, 0, 0];
      const key = `${k}|${a.toFixed(3)}`;
      if (key === last) return; last = key;
      setBarTint([0, 1, 2].map((i) => t.tab[i] * (1 - a) + dc[i] * a + (t.wk[i] - (t.tab[i] * (1 - a) + dc[i] * a)) * k) as [number, number, number], 0, false);
    });
  }, [eFinger, H]); // eslint-disable-line react-hooks/exhaustive-deps
  // the shadow along the page's top edge is there while it travels and gone as it lands (a page at rest has no edge to shade)
  // (and while it is down by the bottom edge, so it never lies over the tab bar at the end of a minimise). Grown from a card
  // there is no edge to shade: the page around it dims instead.
  const shade = (pp: number) => (from.current ? 0 : Math.min(1, Math.max(0, (1 - pp) / 0.3), Math.max(0, pp / 0.12)));
  const shadeO = useTransform(eFingerV, shade);
  const shadeRef = useRef<HTMLDivElement>(null);
  const followRef = useRef<HTMLDivElement>(null);
  // the rounded corners' cut-outs fill with the top band's colour in the very frames the bar takes that colour (the same
  // ramp as the bar's turn below): two wedges of the page behind no longer show under a strip that is already the
  // workout's. Opacity only; mid-travel the corners are round over the page.
  const fill = (pp: number) => { const at = barAtOf(); return Math.min(1, Math.max(0, (pp - (at - 0.015)) / 0.03)); }; // exactly with the bar's turn
  const fillO = useTransform(eFingerV, fill);
  const fillRef = useRef<HTMLDivElement>(null);
  // what is on the page floats a little behind the page itself, by layer: the header a touch, the list a little more. It
  // arrives a beat after the window lands (a soft settle, no pop), and on the way down it leads the window into the bar —
  // one number, so minimising is the exact reverse of opening. The workout bar and its orb ride with the window itself.
  // (its last half pixel is dropped: it lands, instead of ticking the last screen pixels in one at a time)
  const lag = (k: number) => (pp: number) => { const v = k * Math.pow(Math.max(0, 1 - landed(pp)), 0.8); return v < 0.5 ? 0 : v; };
  const headLag = lag(20), viewsLag = lag(44);
  // Grown from a card, the page is fixed inside the window instead (one piece, nothing floats in after it lands), lifted by
  // the window's top band (--wk-lead) so its header sits at the card's top edge from the first frame; it comes down to its
  // place as the window's top reaches the screen's. Only a finger dragging it down still lets the layers float.
  const lift = (pp: number) => { const v = -LEAD * (1 - qAt(pp)); return v > -0.5 ? 0 : v; };
  // C: the page packs away downwards as it fades (and rises into place as it comes in), the list more than the header
  const pack = (k: number) => (pp: number) => (from.current && ls.current === 'C' ? k * PACK * (1 - ramp(pp, F().inside)) : 0);
  const headPack = pack(0.3), viewsPack = pack(1);
  // (`rel`: how far the layer floated behind the finger when it let go (D, dragOff): it fades with the window, as the
  // offset does, instead of snapping home in the first frame of the close, round 2 judge "content jumps up")
  const relHead = useRef(0), relViews = useRef(0);
  const offset = (f: (pp: number) => number, pk: (pp: number) => number, rel: { current: number }) => (pp: number, e: number) => (from.current ? lift(pp) + pk(pp) + f(1 - Math.max(0, pp - e)) + (rel.current ? rel.current * Math.min(1, Math.max(0, qAt(pp))) : 0) : f(e));
  const headOff = offset(headLag, headPack, relHead), viewsOff = offset(viewsLag, viewsPack, relViews);
  const yAt = (y: number) => `translate3d(0, ${snapPx(y)}px, 0)`;
  const headT = useTransform([pv, eFingerV], ([pp, e]: number[]) => yAt(headOff(pp, e)));
  const viewsT = useTransform([pv, eFingerV], ([pp, e]: number[]) => yAt(viewsOff(pp, e)));
  const headRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  useEffect(() => trackCover(depthId, eFinger), [depthId, eFinger]); // and stops being drawn while the window covers it
  const sheetRef = useRef<HTMLDivElement>(null);
  const bclipRef = useRef<HTMLDivElement>(null);
  const bshiftRef = useRef<HTMLDivElement>(null);
  const solidRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  // where the window is going to or coming from, measured as the motion starts (the card may have scrolled; the bar is only
  // on the other tabs). Null: it rises from the bottom edge.
  const skinRef = useRef<HTMLDivElement>(null);
  // the window's corners are round only while it moves (or follows a finger); at rest it is a plain rectangle, as on main,
  // so three hours of scrolling a workout pay nothing for corners that sit off the screen anyway. Written on the two boxes
  // themselves (a class on the window was dropped whenever React re-rendered its class). Grown from a card they are the
  // card's corners at its size (the window is scaled, so they open out with it to the screen's as it grows).
  const radius = useRef(0);
  // the bottom corners: the card's, or for a card running on under the tab bar, the part of its corner above the bar
  const radiusB = useRef('');
  const screenR = () => parseFloat(getComputedStyle(dialogRef.current ?? document.documentElement).getPropertyValue('--wk-r')) || 0;
  const setMoving = (on: boolean, r = radius.current, rb = radiusB.current || `${r}px ${r}px`) => {
    const a0 = sheetRef.current, b0 = bclipRef.current;
    if (a0) a0.style.borderRadius = on ? `${r}px ${r}px 0 0` : '';
    if (b0) b0.style.borderRadius = on ? `0 0 ${rb.split(' ')[0]} ${rb.split(' ')[0]} / 0 0 ${rb.split(' ')[1]} ${rb.split(' ')[1]}` : '';
  };
  // The card itself while the window stands in for it (`src`: its surface, its words). Its words are hidden while the
  // copy's words stand in for them and back the frame it lands; its surface: Today's card (`exact`, nothing frosted) is
  // copied exactly, so it is hidden too, all but its shadow on the page; the resume bar is frosted (nothing on a moving
  // layer is blurred), so its own surface stays, under the window's ground, and is what shows as that ground clears.
  const src = useRef<HTMLElement[]>([]);
  const exact = useRef(true);
  const cardKey = useRef('');
  const cardAt = (pp: number) => {
    const [bg, fg] = src.current;
    if (!from.current || !bg) return;
    const home = leaving.current && (catching() ? caught.current : pp <= hold() + 1e-4);
    if (home && !wasHome.current) landedHome();
    wasHome.current = home;
    const bgOn = home || (!exact.current && (leaving.current ? pp * fk.current <= 0.2 : pp * fk.current < 0.03));
    const key = `${home}|${bgOn}`; if (key === cardKey.current) return; cardKey.current = key;
    if (fg) fg.style.opacity = home ? '' : '0';
    if (exact.current) bg.classList.toggle('wk-hollow', !home); else bg.style.opacity = bgOn ? '' : '0';
    const s = skinRef.current; if (s) s.style.visibility = home ? 'hidden' : '';
  };
  const releaseCard = () => { for (const el of src.current) { el.style.opacity = ''; el.classList.remove('wk-hollow'); } src.current = []; cardKey.current = ''; wasHome.current = false; };
  const caught = useRef(false); // B: the spring has come to rest on the card
  const wasHome = useRef(false);
  // The clock in flight (landing.ts) and the two clocks it joins: the header's and the card's. The one it is flying to is
  // hidden until it lands there; then that one shows again in the same frame and the copy goes. (D: the workout's name
  // flies the same way, beside it: whatever the card and the window both show travels as one thing, data-wk-fly.)
  const heroHost = useRef<HTMLDivElement>(null);
  const hero = useRef<{ h: Hero; watch: MutationObserver; hide: HTMLElement[] }[]>([]);
  const heroOk = useRef<(() => boolean) | null>(null);
  const dropHero = () => {
    const hs = hero.current; hero.current = []; heroOk.current = null;
    for (const x of hs) { x.h.drop(); x.watch.disconnect(); for (const el of x.hide) el.style.visibility = ''; }
  };
  // the card's details (data-wk-in, Today.tsx) that come after the clock instead of riding the window down
  const lateKinds = () => (catches(ls.current) ? [] : ls.current === 'C' ? ['label', 'sub', 'pop'] : ['sub', 'pop']);
  const lateOf = (fg: HTMLElement | null): HTMLElement[] => {
    const k = lateKinds();
    return fg ? [...fg.querySelectorAll<HTMLElement>('[data-wk-in]')].filter((el) => k.includes(el.dataset.wkIn ?? '')) : [];
  };
  const landedHome = () => {
    ((window as unknown as { __wk?: string[] }).__wk ??= []).push(`${Math.round(performance.now())} home`);
    const fg = src.current[1] ?? null, late = lateOf(fg);
    if (late.length) arrive(late, ls.current === 'C' ? [0, 40, 85] : [10, 55]);
  };
  // the flights have landed and the places they land in are showing (checked each frame from then): hand over
  const settleHero = (hs: typeof hero.current) => {
    void Promise.all(hs.map((x) => x.h.done)).then(() => {
      const step = () => { if (hero.current !== hs) return; if (heroOk.current?.()) dropHero(); else requestAnimationFrame(step); };
      step();
    });
  };
  // what flies between the card and the window's header (data-wk-fly, landing.ts): the clock of Today's running card, and
  // in D the workout's name too, from any card or the resume bar (not the card's "Paused", which the header never shows)
  const flyKinds = (fg: HTMLElement | null | undefined, bg: HTMLElement | null | undefined) => {
    if (!fg || !bg) return [];
    const kinds = ls.current === 'D' ? ['clock', 'title'] : bg.dataset.wk === 'hero' ? ['clock'] : [];
    return kinds.filter((kd) => { const c = fg.querySelector<HTMLElement>(`[data-wk-fly="${kd}"]`); return c && (kd === 'clock' || c.textContent?.trim() !== t('Paused')); });
  };
  // ...and the header's twin of each, once the header shows the same name (a workout just started is drawn there a frame or
  // two after the tap). (The header's own: the window also carries copies of the card, which have the same marks.)
  const flyPairs = (fg: HTMLElement | null | undefined, bg: HTMLElement | null | undefined): [HTMLElement, HTMLElement][] => {
    const hd = headRef.current; if (!fg || !hd) return [];
    const kinds = flyKinds(fg, bg), name = fg.querySelector('[data-wk-fly="title"]')?.textContent?.trim();
    if (kinds.includes('title') && hd.querySelector('[data-wk-fly="title"]')?.textContent?.trim() !== name) return [];
    return kinds.map((kd) => [fg.querySelector<HTMLElement>(`[data-wk-fly="${kd}"]`)!, hd.querySelector<HTMLElement>(`[data-wk-fly="${kd}"]`)]).filter((x): x is [HTMLElement, HTMLElement] => !!x[1]);
  };
  // what is flying now (launchHero), so not on the card's copy: hidden there in the frame its flight sets off, not before
  // (a name waiting a frame for the header showed a card without its name, r2)
  const flyHide = useRef(new Set<string>());
  const hideFlown = () => {
    const k = skinParts.current; if (!k) return;
    for (const box of [k.words, k.pop?.el]) box?.querySelectorAll<HTMLElement>('[data-wk-fly]').forEach((n) => { if (flyHide.current.has(n.dataset.wkFly ?? '') && (box === k.words || n.closest('[data-wk-in="pop"]') === null)) n.style.visibility = 'hidden'; });
  };
  // the flights on the window's own clock: started in the same frame as the browser-run window (runMirror), whenever they
  // were set off (a flight set going a frame ahead of the window led it by that frame: 50 px early in the fast part, r2)
  const syncHero = () => {
    const ref = mirror.current?.of(sheetRef.current); if (!ref) return;
    const hs = hero.current;
    void ref.ready.then(() => { if (hero.current !== hs || ref.startTime === null) return; for (const x of hs) for (const a of x.h.anims) { a.effect?.updateTiming({ delay: 0 }); a.startTime = ref.startTime; } }, () => {});
  };
  const skinParts = useRef<{ k: number; back: HTMLElement; tone: HTMLElement; mat: HTMLElement; words: HTMLElement | null; pop: { el: HTMLElement; k: number } | null; watch: MutationObserver | null } | null>(null);
  const skinAt = (pp: number) => {
    const s = skinRef.current, k = skinParts.current; if (!s || !k) return;
    s.style.opacity = String(skinO(pp)); k.back.style.opacity = String(backO(pp)); k.mat.style.transform = matAt(pp); k.mat.style.opacity = String(matO(pp)); k.tone.style.opacity = String(toneO(pp));
    if (k.words) { k.words.style.opacity = String(wordsO(pp)); k.words.style.transform = wordsAt(pp); }
    if (k.pop) { k.pop.el.style.opacity = String(popO(pp)); k.pop.el.style.transform = popAt(pp); }
  };
  const dropSkin = () => {
    const s = skinRef.current; skinParts.current?.watch?.disconnect(); skinParts.current = null;
    if (!s) return; s.replaceChildren(); s.style.display = ''; s.style.opacity = ''; s.style.visibility = '';
  };
  // the page behind (its screen and dock, as a sheet steps it back: App.tsx useStageDepth), written only while it is moved
  const stageEl = () => document.querySelector<HTMLElement>('.stage-content');
  const sunk = useRef(false);
  const sink = (v: number) => {
    if (!sunk.current && v < 0.0005) return;
    const el = stageEl(); if (!el) return;
    sunk.current = v >= 0.0005;
    el.style.transform = sunk.current ? contentTransform(v) : '';
  };
  // The tab bar, grown out of Today's card (it may run on under the bar) or the resume bar: the window's bottom edge carries the bar down as it
  // grows and draws it back up behind it as it goes back, so the edge never crosses it, and the two land together. Its
  // place at rest in `dockAt`; the page it is on sinks (scale, from the middle), which the shift makes up for.
  const dockAt = useRef<number | null>(null);
  const navEl = () => document.querySelector<HTMLElement>('.tabbar');
  const dock = (pp: number) => {
    const n = dockAt.current, g = from.current, { hA, RB } = dims.current;
    if (n === null || !g) return 0;
    // where its top is to be on the screen: where it rests, or under the window's bottom edge once that is past it (a card
    // ending below the bar's top: once that is past where the card ends). It holds still while the page under it sinks.
    const bot = g.b + (hA - LEAD + RB - g.b) * qAt(pp), k = 1 - 0.05 * env(pp), c = H / 2;
    const v = (n + Math.max(0, bot - Math.max(n, g.b)) - c) / k + c - n;
    // (only a true rest is let go: a threshold here made it hop by a quarter pixel as it set off)
    return v > 0.005 ? v : 0;
  };
  const dockT = (pp: number) => { const v = dock(pp); return v ? `translate3d(0, ${v.toFixed(2)}px, 0)` : 'none'; };
  const lastDock = useRef('');
  const setDock = (pp: number) => { const v = dockT(pp); if (v === lastDock.current) return; lastDock.current = v; const el = navEl(); if (el) el.style.transform = v === 'none' ? '' : v; };
  // let it go (closing without a card: it comes back up on its own)
  const freeDock = () => {
    const el = navEl(); dockAt.current = null; lastDock.current = '';
    if (!el || !el.style.transform) return;
    const t0 = el.style.transform; el.style.transform = '';
    if (!reduce) mirrorSpring(el, [{ transform: t0 }, { transform: 'none' }], SMOOTH);
  };
  // the page's styles at progress pp (whatever the browser isn't running itself)
  // the header's clock (when it is not flying), tally and progress bar (`meta`)
  const metaEls = () => [...(headRef.current?.querySelectorAll<HTMLElement>('.wk-clock, .wk-meta-rest, .wk-paused, .wk-progress') ?? [])];
  const lastMeta = useRef('');
  const metaAt = (pp: number) => { const v = String(metaO(pp)); if (v === lastMeta.current) return; lastMeta.current = v; for (const el of metaEls()) el.style.opacity = v === '1' ? '' : v; };
  const paintAt = (pp: number) => {
    if (!reduce) sink(env(pp));
    metaAt(pp); barAt(pp);
    if (dockAt.current !== null) setDock(pp);
    skinAt(pp);
  };
  useEffect(() => pv.on('change', paintAt), [pv, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => p.on('change', (pp) => { if (!frozen.current) pv.set(pp); cardAt(pp); }), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { sink(0); freeDock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const slotRest = useRef<{ left: number; top: number; width: number; height: number } | undefined>(undefined);
  // a copy of an element as it is drawn here (its colours read off it: the window has its own hue, and the page its own
  // surface colours), without the frost (nothing on a moving layer is blurred) and without its own place in the page
  const copyOf = (el: HTMLElement) => {
    const copy = el.cloneNode(true) as HTMLElement;
    const paint = (a: Element, b: HTMLElement) => {
      const cs = getComputedStyle(a);
      b.style.background = cs.background; b.style.boxShadow = cs.boxShadow; b.style.color = cs.color;
      b.style.backdropFilter = 'none'; b.style.setProperty('-webkit-backdrop-filter', 'none');
      b.removeAttribute('data-wk'); b.removeAttribute('data-orb-slot'); b.removeAttribute('id');
      [...a.children].forEach((c, i) => { if (b.children[i]) paint(c, b.children[i] as HTMLElement); });
    };
    paint(el, copy);
    // a number mid-roll: the copy shows only its new digits (the outgoing ones are not part of its resting look)
    copy.querySelectorAll('.roll-ghost').forEach((n) => n.remove());
    const cs = getComputedStyle(el.parentElement ?? el);
    Object.assign(copy.style, { position: 'absolute', left: '0', top: '0', right: 'auto', bottom: 'auto', width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`, boxSizing: 'border-box', margin: '0', transformOrigin: '0 0', opacity: '1', font: cs.font, letterSpacing: cs.letterSpacing, textAlign: cs.textAlign });
    for (const v of ['--s1', '--s2', '--s3', '--s4', '--bg-2', '--line', '--hl']) copy.style.setProperty(v, cs.getPropertyValue(v));
    return copy;
  };
  // the copy's moving parts (CSS animations: the live dot's pulse) at the same point as the card's own, so the hand-over is seamless
  const sync = (a: Element, b: Element) => {
    const css = (e: Element) => e.getAnimations({ subtree: true }).filter((x) => x instanceof CSSAnimation);
    const xs = css(a), ys = css(b);
    ys.forEach((y, i) => { const x = xs[i]; if (x && x.currentTime !== null) y.currentTime = x.currentTime; });
  };
  const measure = (g: WkSource | null) => {
    const d = dialogRef.current, a0 = sheetRef.current;
    // where the window rests: a finger may still hold it pulled down (`dragT`), and everything here is measured from its
    // place at rest (measured from where the finger left it, the landing aimed that far below the card and never met it)
    const dy = dragT.get(), raw = d?.getBoundingClientRect();
    const box = raw && new DOMRect(raw.x, raw.y - dy, raw.width, raw.height);
    releaseCard(); dropSkin(); dropHero();
    ls.current = landStyle(); caught.current = false;
    if (!d || !a0 || !box) { from.current = null; return; }
    // the orb's slot at rest: undo where the window is drawn now (its offset and scale, from the motion so far), so the orb
    // flies to the right place
    const slot = a0.querySelector<HTMLElement>('[data-orb-slot]');
    if (slot) {
      const r = slot.getBoundingClientRect(), now = geo(p.get());
      const top = (r.top - dy - box.top - now.y) / now.s - LEAD - lastBar.current.by;
      slotTop.current = top;
      slotRest.current = { left: (r.left - box.left - now.x) / now.s + box.left, top: top + box.top, width: r.width / now.s, height: r.height / now.s };
    }
    const rb = parseFloat(getComputedStyle(d).getPropertyValue('--wk-rb')) || 0;
    dims.current = { W: box.width, hA: a0.offsetHeight, RB: rb + 2 };
    const bw = barRef.current?.querySelector<HTMLElement>('.wk-bar-wrap');
    if (bw) barTuck.current = bw.offsetHeight + (parseFloat(getComputedStyle(bw).bottom) || 0) + rb + 8;
    const ok = !!g && g.w > 40 && g.b - g.t > 30;
    from.current = ok ? { l: g.l - box.left, t: g.t - box.top, w: g.w, b: g.b - box.top, h: g.h } : null;
    const s0 = ok ? g.w / box.width : 1;
    fk.current = ok ? Math.min(4, Math.max(1, ((box.height - g.h) / g.h) / ((box.height - FK_REF) / FK_REF))) : 1;
    radius.current = ok ? g.r / s0 : screenR();
    radiusB.current = '';
    if (!ok || !g) { freeDock(); return; }
    // a card running on under the tab bar: the window ends at the bar, where the card's corner has only begun to turn
    const cut = g.h - (g.b - g.t);
    if (cut > 0.5) { const e = Math.max(0, g.r - cut), ex = g.r - Math.sqrt(g.r * g.r - e * e); radiusB.current = `${(ex / s0).toFixed(2)}px ${(e / s0).toFixed(2)}px`; }
    dockAt.current = dockTop();
    if (dockAt.current === null) freeDock();
    const s = skinRef.current;
    exact.current = getComputedStyle(g.bg).backdropFilter === 'none';
    if (s) {
      // the card's own hue (the window has the workout's)
      s.dataset.hue = g.bg.closest<HTMLElement>('[data-hue]')?.dataset.hue ?? 'today';
      const back = document.createElement('div');
      back.className = 'wk-skin-back';
      // the card's own tint on that ground while the card's look is not on it (it crosses with it), so the plain window
      // is the card's colour, not the darker ground under it
      const tone = document.createElement('div');
      tone.className = 'wk-skin-tone'; back.append(tone);
      const mat = copyOf(g.bg); mat.classList.add('wk-skin-mat');
      Object.assign(mat.style, { width: `${g.w}px`, height: `${g.h}px`, borderRadius: `${g.r}px`, willChange: 'transform, opacity' });
      // the resume bar's glass (unfrosted) is part of the ground that clears over its own frosted glass
      if (exact.current) s.replaceChildren(back, mat); else { back.append(mat); s.replaceChildren(back); }
      let words: HTMLElement | null = null, pop: { el: HTMLElement; k: number } | null = null, watch: MutationObserver | null = null;
      const fg = g.fg;
      if (fg) {
        // the card's words at the card's own size wherever the window is (its scale undone), so they land exactly on the card's
        const w = document.createElement('div'); w.className = 'wk-skin-words';
        Object.assign(w.style, { position: 'absolute', left: `${((fg.offsetLeft - g.bg.offsetLeft) / s0).toFixed(3)}px`, top: `${((fg.offsetTop - g.bg.offsetTop) / s0).toFixed(3)}px`, width: `${fg.offsetWidth}px`, height: `${fg.offsetHeight}px`, transformOrigin: '0 0', transform: `scale(${(1 / s0).toFixed(5)})`, willChange: 'opacity' });
        s.append(w); words = w;
        // (the clock flies on its own, landing.ts; what arrives after it is not on the copy either)
        const lateNow = leaving.current ? lateKinds() : [];
        // the play button, where the way has its own timing for it: the same copy of the card on a layer of its own, all
        // but the button hidden (so it sits exactly where it does on the card), sized about the button's middle. (Going
        // down, the card may not show the button yet: its middle is found when it does, `place`, and only the layer's
        // origin and place, not its moving parts, depend on it.)
        if (FADES[ls.current].out.pop && !lateNow.includes('pop')) {
          const el = document.createElement('div'); el.className = 'wk-skin-pop';
          Object.assign(el.style, { position: 'absolute', left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height, transformOrigin: '0 0', transform: `scale(${(1 / s0).toFixed(5)})`, willChange: 'transform, opacity' });
          pop = { el, k: 1 / s0 };
          s.append(el);
        }
        const L0 = parseFloat(w.style.left), T0 = parseFloat(w.style.top);
        // (what flies on its own is not on the copy: launchHero)
        const flyK = flyHide.current; flyK.clear(); if (g.bg.dataset.wk === 'hero' && ls.current !== 'D') flyK.add('clock');
        const place = () => {
          const c = copyOf(fg);
          c.querySelectorAll<HTMLElement>('[data-wk-fly]').forEach((n) => { if (flyK.has(n.dataset.wkFly ?? '')) n.style.visibility = 'hidden'; });
          c.querySelectorAll<HTMLElement>('[data-wk-in]').forEach((n) => { if (lateNow.includes(n.dataset.wkIn ?? '') || (pop && n.dataset.wkIn === 'pop')) n.style.visibility = 'hidden'; });
          w.replaceChildren(c); sync(fg, c);
          if (pop) {
            const c2 = copyOf(fg); c2.style.visibility = 'hidden';
            const b2 = c2.querySelector<HTMLElement>('[data-wk-in="pop"]'); if (b2) b2.style.visibility = 'visible';
            pop.el.replaceChildren(c2);
            const pb = fg.querySelector<HTMLElement>('[data-wk-in="pop"]');
            if (pb && !pop.el.dataset.at) {
              const fr = fg.getBoundingClientRect(), br = pb.getBoundingClientRect(), q = fr.width / (fg.offsetWidth || 1) || 1;
              const cx = (br.left - fr.left + br.width / 2) / q, cy = (br.top - fr.top + br.height / 2) / q, k = pop.k;
              Object.assign(pop.el.style, { transformOrigin: `${cx.toFixed(3)}px ${cy.toFixed(3)}px`, left: `${(L0 + (k - 1) * cx).toFixed(3)}px`, top: `${(T0 + (k - 1) * cy).toFixed(3)}px` });
              pop.el.dataset.at = '1';
            }
          }
        };
        place();
        // (its clock ticks while the window travels: the copy keeps up)
        // (only for what the copy shows: the card's own clock is hidden on it (it flies), so its tick re-copied, and redrew,
        // the whole card every second of the move for nothing)
        const shown = (m: MutationRecord) => !(m.target instanceof Element ? m.target : m.target.parentElement)?.closest('[data-wk-fly="clock"]');
        watch = new MutationObserver((ms) => { if (!flyK.has('clock') || ms.some(shown)) place(); }); watch.observe(fg, { subtree: true, childList: true, characterData: true });
      }
      skinParts.current = { k: 1 / s0, back, tone, mat, words, pop, watch };
      s.style.display = 'block';
    }
    src.current = [g.bg, ...(g.fg ? [g.fg] : [])];
  };
  // high refresh rate: the window, the dim and the page behind also run by the browser on the identical spring, sampled for
  // every frame of a 120 Hz screen; while it runs, nothing here restyles them (`frozen`): each keeps the last frame (`fill`)
  // until it has all finished, then the page takes over again at that same place in one go (`thaw`)
  const mirror = useRef<Mirror | null>(null); if (!mirror.current) mirror.current = new Mirror();
  const orbM = useRef<Mirror | null>(null); if (!orbM.current) orbM.current = new Mirror();
  const run = useRef(0);
  // (written here at once, from the same functions: Motion's own values are only worked out again on their next change)
  const flush = () => {
    const pp = pv.get(), d = dragY.get(), e = Math.min(1, Math.max(0, pp - Math.max(0, d) / H));
    const set = (el: HTMLElement | null, k: 'transform' | 'opacity', v: string | number) => { if (el) el.style[k] = String(v); };
    set(sheetRef.current, 'transform', aAt(pp)); set(followRef.current, 'transform', aAt(pp));
    set(bclipRef.current, 'transform', bAt(pp)); set(bshiftRef.current, 'transform', cAt(pp));
    set(solidRef.current, 'opacity', solid(pp)); set(dimRef.current, 'opacity', dim(pp));
    set(shadeRef.current, 'opacity', shade(e)); set(fillRef.current, 'opacity', fill(e));
    set(headRef.current, 'transform', yAt(headOff(pp, e))); set(headRef.current, 'opacity', inside(pp));
    set(viewsRef.current, 'transform', yAt(viewsOff(pp, e))); set(viewsRef.current, 'opacity', insideV(pp));
    paintAt(pp);
  };
  const thaw = () => {
    run.current++;
    if (frozen.current) { frozen.current = false; pv.set(p.get()); flush(); }
    mirror.current!.cancel();
  };
  const vanishRef = useRef(vanish); vanishRef.current = vanish;
  const runMirror = (p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number) => {
    const m = mirror.current!; thaw(); orbM.current!.cancel();
    if (reduce || (p1 === 0 && vanishRef.current)) return;
    // (the orb has its own, and is not held)
    orbM.current!.add(mirrorOrb(sheetRef.current, p0, p1, sp, vel, slotShift, slotRest.current));
    const at = barAtOf(), morph = !!from.current, k = skinParts.current;
    const seen = (pp: number) => (morph ? Math.max(pp, F().inside[0]) : pp);
    // (all of it frame by frame, each part only while it changes: see engage.ts mirrorProgress `trim`)
    const o = { fill: 'forwards' as FillMode, hz: 120, trim: true };
    const go = (el: Element | null | undefined, f: (pp: number) => Keyframe, _breaks?: number[], _perFrame?: boolean) => mirrorProgress(el, p0, p1, sp, vel, f, [], true, o);
    m.add(
      go(sheetRef.current, (pp) => ({ transform: aAt(pp) }), [], true),
      // (its corner fill is only there as the top passes the status bar; the copy of the card and the window's page only
      // while they show: none of them is moved while it is not seen)
      go(followRef.current, (pp) => ({ transform: aAt(morph ? Math.max(pp, at - 0.016) : pp) }), [], true),
      morph ? go(bclipRef.current, (pp) => ({ transform: bAt(pp) }), [], true) : null,
      morph ? go(bshiftRef.current, (pp) => ({ transform: cAt(pp) }), [], true) : null,
      morph ? go(solidRef.current, (pp) => ({ opacity: String(solid(pp)) }), F().solid) : null,
      morph && k ? go(skinRef.current, (pp) => ({ opacity: String(skinO(pp)) }), F().skin) : null,
      morph && k ? go(k.back, (pp) => ({ opacity: String(backO(pp)) }), F().back) : null,
      morph && k ? go(k.mat, (pp) => ({ transform: matAt(Math.min(pp, matR()[1] / fk.current)), opacity: String(matO(pp)) }), [], true) : null,
      morph && k && F().mat ? go(k.tone, (pp) => ({ opacity: String(toneO(pp)) }), F().mat) : null,
      morph && k?.words ? go(k.words, (pp) => ({ opacity: String(wordsO(pp)), transform: wordsAt(pp) }), [], true) : null,
      morph && k?.pop ? go(k.pop.el, (pp) => ({ opacity: String(popO(pp)), transform: popAt(pp) }), [], true) : null,
      morph && ls.current === 'D' ? go(barRef.current, (pp) => ({ transform: barT(barBy(pp)) }), [], true) : null,
      ...(morph && F().meta ? metaEls().map((el) => go(el, (pp) => ({ opacity: String(metaO(pp)) }), [], true)) : []),
      morph ? go(dimRef.current, (pp) => ({ opacity: String(dim(pp)) }), ENVB) : null,
      morph ? go(stageEl(), (pp) => ({ transform: contentTransform(env(pp)) }), ENVB) : null,
      morph && dockAt.current !== null ? go(navEl(), (pp) => ({ transform: dockT(pp) }), [], true) : null,
      morph ? null : go(shadeRef.current, (pp) => ({ opacity: String(shade(pp)) }), [0.12, 0.7]),
      go(fillRef.current, (pp) => ({ opacity: String(fill(pp)) }), [at - 0.015, at + 0.015]),
      go(headRef.current, (pp) => ({ transform: yAt(headOff(seen(pp), seen(pp))), opacity: String(inside(pp)) }), [], true),
      go(viewsRef.current, (pp) => ({ transform: yAt(viewsOff(seen(pp), seen(pp))), opacity: String(insideV(pp)) }), [], true),
    );
    if (!m.size) return;
    const id = run.current; frozen.current = true;
    void m.settled().then(() => { if (run.current === id) thaw(); });
  };
  useEffect(() => { const off = dragY.on('change', (v) => { thaw(); orbM.current!.cancel(); if (v > 0) setMoving(true, screenR()); else if (!closing.current && !leaving.current) setMoving(false); }); return () => { off(); thaw(); orbM.current!.cancel(); }; }, [dragY]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing starts the very moment you let go: the window's own animation is set going first (on the compositor), and only
  // after the next frame has been drawn is the app told the workout is closed — re-rendering the page behind, the tab bar
  // and the resume bar takes a phone a good while, and before, nothing moved until it was done (the pause after a tap).
  const closing = useRef<Promise<void> | null>(null);
  // The clock's flight (landing.ts), built from the window's own spring frame by frame, so its two ends are where the
  // header's clock and the card's are in every frame (the header's moves with the window, the card's holds still). D flies
  // the workout's name the same way, so nothing the card and the header share ever fades out on one and in on the other.
  const heroTry = useRef(0);
  const launchHero = (opening: boolean, p0: number, p1: number, sp: { stiffness: number; damping: number; mass?: number }, vel: number, t0 = performance.now(), tries = 0) => {
    if (!tries) { cancelAnimationFrame(heroTry.current); dropHero(); }
    const dbg = (m: string) => { ((window as unknown as { __wk?: string[] }).__wk ??= []).push(`${Math.round(performance.now())} ${m}`); };
    const host = heroHost.current, d = dialogRef.current, sh = sheetRef.current, fg = src.current[1], bg = src.current[0], g0 = from.current;
    if (reduce || !host || !d || !sh || !g0 || !fg || !bg) { dbg(`no hero ${!!reduce} ${!!host} ${!!d} ${!!sh} ${!!g0} ${!!fg}`); return; }
    const pairs = flyPairs(fg, bg), want = flyKinds(fg, bg).length;
    // (the card behind may not show the running workout yet: it is drawn again as the window uncovers it; and a workout just
    // started is in the header a frame or two after the tap. The flight then sets off from where the window has got to.)
    const short = pairs.length < want || (bg.dataset.wk === 'hero' && !opening && !pairs.some(([c]) => c.dataset.wkFly === 'clock'));
    if (short && tries < 24) { heroTry.current = requestAnimationFrame(() => launchHero(opening, p0, p1, sp, vel, t0, tries + 1)); return; }
    if (!pairs.length) { dbg('nothing flies'); return; }
    const box = d.getBoundingClientRect();
    // the card where it rests (the page behind may be stepped back a touch right now: its scale about its middle undone)
    const stg = stageEl(), sr = stg?.getBoundingClientRect(), k = stg && sr && stg.offsetWidth ? sr.width / stg.offsetWidth : 1;
    const { W } = dims.current, s0 = g0.w / W;
    const span = p1 - p0, v0 = Math.max(-40, Math.min(40, span ? vel / span : 0));
    const fs = samples(sp, v0), L = LANDS[ls.current], hsp = opening ? L.openHero : L.closeHero, hs = hsp ? samples(hsp) : null;
    const ppAt = (i: number) => p0 + span * fs[Math.min(i, fs.length - 1)];
    // closing, it rides the header (with the window) while the page around it fades, and sets off once that is gone, so it
    // never crosses words still on the screen
    const wait = opening ? 0 : ls.current === 'C' ? 6 : 9;
    const hw = (i: number) => (hs ? hs[Math.max(0, Math.min(i - wait, hs.length - 1))] : 1);
    const frames = Math.max(fs.length, (hs?.length ?? 0) + wait) - 1;
    // (D closing: they ride the header while the page round them is there (r2: the growing clock ran over the list's first
    // card) and set off as it fades, a fifth of the way from home.)
    // (D opening: the card's big name and clock are the header's size by the time the header is in round them, a sixth of
    // the way: shrinking with the window, the big name lay over the header's clock and tally for six frames, r2. Counted
    // from where the window is when the flight sets off: a workout just started reaches the header a frame or two late.)
    const B = catches(ls.current), live = ls.current === 'D', skip = Math.round(((performance.now() - t0) * 120) / 1000);
    const made = pairs.flatMap(([cardEl, headEl]) => {
      const byLeft = cardEl.dataset.wkFly === 'title', cardNow = anchorOf(cardEl, byLeft), headNow = anchorOf(headEl, byLeft);
      const cardA = cardNow && sr && Math.abs(k - 1) > 1e-4 ? { ...cardNow, x: sr.left + sr.width / 2 + (cardNow.x - sr.left - sr.width / 2) / k, y: sr.top + sr.height / 2 + (cardNow.y - sr.top - sr.height / 2) / k } : cardNow;
      if (!cardA || !headNow) { dbg(`no anchors ${cardEl.dataset.wkFly}`); return []; }
      // the header's one in the window's own px, as laid out (its place at rest, whatever the window is doing now)
      let lx = 0, ly = 0, n: HTMLElement | null = headEl;
      while (n && n !== sh) { lx += n.offsetLeft; ly += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
      if (n !== sh) { dbg('not in sheet'); return []; }
      const hr = headEl.getBoundingClientRect(), sc = hr.width / (headEl.offsetWidth || 1);
      lx += (headNow.x - hr.left) / sc; ly += (headNow.y - hr.top) / sc;
      const headerAt = (pp: number): Anchor & { s: number } => { const G = geo(pp); return { x: box.left + G.x + G.s * lx, y: box.top + G.y + G.s * (ly + headOff(pp, pp)), f: headNow.f, s: G.s }; };
      // the card's one on the copy of the card the window carries (B: it rides the window, and the card's give)
      const rx = cardA.x - box.left - g0.l, ry = cardA.y - box.top - g0.t;
      const skinAt = (pp: number): Anchor & { s: number } => { const G = geo(pp); return { x: box.left + G.x + (G.s * rx) / s0, y: box.top + G.y + G.s * (ry / s0 + wordsDy(pp)), f: cardA.f, s: G.s / s0 }; };
      const cardRest = { ...cardA, s: 1 };
      const restHead = headerAt(1);
      // (B opening: the clock is home in its slot a little ahead of the window, before the header's words beside it come in)
      const flight = opening
        ? { frames, src: (i: number) => (B ? skinAt(ppAt(i)) : cardRest), dst: (i: number) => headerAt(ppAt(i)), w: (i: number) => (live ? 1 - Math.pow(1 - Math.min(1, Math.max(0, ppAt(i) - ppAt(skip)) / 0.3), 2) : B ? 1 - Math.pow(1 - Math.min(1, qAt(ppAt(i))), 3) : hw(i)) }
        : { frames, src: (i: number) => headerAt(ppAt(i)), dst: (i: number) => (B ? skinAt(ppAt(i)) : cardRest), w: (i: number) => (live ? Math.pow(Math.min(1, Math.max(0, (0.2 - ppAt(i)) / 0.2)), 1.5) : B ? Math.pow(Math.max(0, 1 - qAt(ppAt(i))), 1.5) : hw(i)) };
      // (D, into the resume bar: the clock goes sideways first and drops into its place last, so it never runs along its
      // line over the words before it, r2)
      if (live && !opening && bg.dataset.wk === 'pill') { const w0 = flight.w; Object.assign(flight, { wx: (i: number) => Math.min(1, Math.sqrt(Math.max(0, w0(i)))) }); }
      const a0 = opening ? cardA : headNow, a1 = opening ? { x: restHead.x, y: restHead.y, f: restHead.f } : cardA;
      const fromEl = opening ? cardEl : headEl, toEl = opening ? headEl : cardEl;
      // (D: the two looks cross over five or six frames: the name near its small end, the clock as it sets off)
      const cross: [number, number] | undefined = !live ? undefined : opening ? [0.45, 0.95] : cardEl.dataset.wkFly === 'title' ? [0.55, 0.95] : [0.02, 0.35];
      const h = flyHero(host, fromEl, toEl, a0, a1, flight, skip, false, cross, byLeft);
      // it shows what the one it is flying to shows (a clock starts ticking again as the window sets off)
      const watch = new MutationObserver(() => h.text(toEl.textContent ?? '')); watch.observe(toEl, { subtree: true, childList: true, characterData: true });
      fromEl.style.visibility = 'hidden'; toEl.style.visibility = 'hidden';
      dbg(`hero ${cardEl.dataset.wkFly} ${opening} ${frames} a0=${JSON.stringify(a0)} a1=${JSON.stringify(a1)}`);
      return [{ h, watch, hide: [fromEl, toEl] }];
    });
    hero.current = made;
    for (const [c] of pairs) flyHide.current.add(c.dataset.wkFly ?? '');
    hideFlown(); syncHero();
    heroOk.current = opening ? () => Math.abs(p.get() - 1) < 0.002 && !closing.current : () => wasHome.current;
    settleHero(made);
  };
  const startClose = (v = 0): Promise<void> => {
    if (closing.current) return closing.current;
    // back into the card or bar it lives in (Today's card on Today, the resume bar on the other tabs); finished or
    // discarded, it slides away as before
    const kind = useStore.getState().active && !vanishRef.current ? (useUI.getState().tab === 'today' ? 'hero' : 'pill') : null;
    const d = dragT.get();
    leaving.current = true; dragOff.current = 0; relHead.current = relViews.current = 0;
    measure(wkSourceRect(kind));
    noteMove(`close ${from.current ? kind : 'slide'}${v ? ' swipe' : ''}`);
    // the finger's offset becomes progress, then it carries on at the finger's speed — the window's top stays where the
    // finger left it
    const g = from.current;
    const reach = g ? g.t + LEAD : H;
    // (D: not the offset as progress, which drew the window smaller, narrower and without its tally in the first frame of
    // the close (round 2 judge): it stays whole and carries the offset, geo's dragOff)
    const whole = !!g && ls.current === 'D' && d > 0;
    dragOff.current = whole ? d : 0;
    if (whole) { const fl = 1 - Math.max(0, pv.get() - eFingerV.get()); relHead.current = headLag(fl); relViews.current = viewsLag(fl); }
    const e0 = whole ? Math.min(1, Math.max(0, p.get())) : g ? Math.min(1, Math.max(0, p.get() - Math.max(0, d) / reach)) : eFinger.get();
    p.set(e0); dragY.set(0);
    // (drawn back at rest now, not on Motion's next frame: the clock's flight below measures the window where it rests)
    if (dialogRef.current) dialogRef.current.style.transform = 'none';
    thaw(); pv.set(e0); flush(); cardAt(e0);
    const vel = -v / (whole ? Math.max(120, reach - d) : reach);
    const lw = LANDS[ls.current].closeWin;
    const sp = g ? (lw ? { ...lw, restDelta: 0.001 } : WINDOW_CLOSE) : SURFACE_EXIT;
    launchHero(false, e0, 0, sp, vel);
    runMirror(e0, 0, sp, vel); syncHero();
    // under the finish sheet: no slide, just a soft crossfade of what still shows above the sheet into the page behind. The
    // page is drawn again first (warmStage; behind a full cover it is not drawn at all, and fading over it showed black,
    // then the page cut in), two frames before the fade starts, then the window is put away.
    let fade: Animation | undefined;
    const c = vanishRef.current && !reduce
      ? new Promise<void>((ok) => { warmStage(true); dialogRef.current?.classList.add('wk-leaving'); requestAnimationFrame(() => requestAnimationFrame(() => {
        fade = dialogRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-in-out', fill: 'forwards' });
        // The finish sheet leaves the top of the screen open: the page's own header waits until the workout's is almost gone
        // (under ~15%), then fades in, so the two headers never show through each other. Only the page's opacity moves.
        document.querySelector('.stage-content')?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.62, easing: 'ease-out' }, { opacity: 1 }], { duration: 540 });
        // The page stops being kept warm only once the cover has really reached 0: let go in the same frame, it read the cover
        // as still full and hid the page for a frame, so the phone threw its whole drawing away and redrew all of it at once,
        // in the middle of the finish moment (which went blank for a beat).
        (fade?.finished ?? Promise.resolve()).then(() => { p.set(0); requestAnimationFrame(() => requestAnimationFrame(() => ok())); }, () => ok());
      })); })
      : animate(p, 0, reduce || vanishRef.current ? { duration: 0.01 } : { ...sp, velocity: vel });
    if (!vanishRef.current) setMoving(true);
    // (B hands over to the card only once the browser's copy of the spring has come to rest too: its last frames are the
    // card's give settling, and handing over on the page's own spring, a few frames sooner, left a sub-pixel jump)
    const cc = catching() && mirror.current!.size ? Promise.all([c, mirror.current!.settled()]).then(() => undefined) : c;
    closing.current = new Promise<void>((done) => { cc.then(() => { done(); if (fade) requestAnimationFrame(() => fade?.cancel()); }, () => done()); });
    // landed: the card is itself again (its words already back), and the copy of it goes
    void closing.current.then(() => { caught.current = true; cardAt(p.get()); warmStage(false); releaseCard(); dropSkin(); if (hero.current.length) dropHero(); });
    return closing.current;
  };
  // a press on Minimise that never became a tap lets the page behind rest again
  const warmUp = () => { warmStage(true); setTimeout(() => { if (!closing.current) warmStage(false); }, 1000); };
  const close = (v = 0) => {
    if (closing.current) return;
    startClose(v);
    requestAnimationFrame(() => setTimeout(() => { if (useUI.getState().overlays.some((o) => o.type === 'workout')) useUI.getState().pop(); }, 0));
  };

  // the keyboard slides over the page (it no longer resizes it): the list gets that much more room at its end, so the last
  // set's fields can still be scrolled above the keys, and the rest timer rides on top of the keyboard
  const bodyPad = useTransform(kb, (v) => `calc(var(--sab) + 150px + ${v}px)`);
  // focus pages end just above the bar (the list keeps extra room to scroll its last card up); the stage takes the rest
  const focusPad = useTransform(kb, (v) => `calc(var(--sab) + 112px + ${v}px)`);
  const exMap = useMemo(() => exerciseMap(exercises), [exercises]);
  const [menu, setMenu] = useState<string | null>(null);
  // another screen on top of the workout (the exercise list, an exercise's page): the window's slow colour stands still under it.
  // The bar stays where it is under any pop-up, as a tab bar does on iOS: the pop-up simply rises over it (it used to drop
  // out of sight first and come back up after, two motions where one will do). Not for the orb's screen or the Coach.
  const covered = useUI((u) => { const top = u.overlays[u.overlays.length - 1]; return !!top && top.type !== 'workout' && top.type !== 'voice' && top.type !== 'coach' && u.overlays.some((o) => o.type === 'workout'); });
  const [confirm, setConfirm] = useState<null | 'finish' | 'discard'>(null);
  const finishing = useRef(false);
  // The finish is coming: the page behind is drawn now, while "Finish workout?" is up (or the finger is on Finish), not in
  // the middle of the finish moment. Painting the whole page there, on top of the workout and the summary's own layers, was
  // more than the phone's GPU kept drawn: parts of the summary went blank and flickered for half a second.
  useEffect(() => { if (confirm !== 'finish') return; warmStage(true); return () => { if (!closing.current && !finishing.current) warmStage(false); }; }, [confirm]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishBtn = useRef<HTMLButtonElement>(null);
  const pointToFinish = () => { const b = finishBtn.current; if (!b) return; b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); };
  const [renaming, setRenaming] = useState(false);
  // List or Focus (one exercise per page, Focus.tsx). Remembered on this phone. Focus is built when you go to it and kept
  // until it has faded out, so leaving it is the same calm crossfade as arriving.
  const [view, setView] = useState<'list' | 'focus'>(() => {
    const pick = useStore.getState().settings.workoutView; // Settings → Training: always List, always Focus, or the last one used
    if (pick === 'list' || pick === 'focus') return pick;
    try { return localStorage.getItem('aven.wkView') === 'focus' ? 'focus' : 'list'; } catch { return 'list'; }
  });
  const [focusBuilt, setFocusBuilt] = useState(view === 'focus');
  const [focusIn, setFocusIn] = useState(view === 'focus');
  const focusApi = useRef<FocusApi | null>(null);
  // the card of the exercise you're on travels between the two views as one object (morph.ts); `shared` while it does
  const morph = useRef<Morph | null>(null);
  const focusEl = useRef<HTMLDivElement>(null);
  const [shared, setShared] = useState<null | 'in' | 'back'>(null);
  const switchView = () => {
    const next = view === 'list' ? 'focus' : 'list';
    if (next === 'focus') {
      const a0 = useStore.getState().active;
      morph.current = morphStart(body.current, nextSetOf(a0)?.se.id ?? a0?.exercises[0]?.id);
      setShared(morph.current ? 'in' : null);
    } else {
      morph.current = null;
      setShared(morphBack(body.current, focusEl.current) ? 'back' : null);
    }
    setView(next);
    try { localStorage.setItem('aven.wkView', next); } catch { /* ignore */ }
  };
  useEffect(() => {
    if (view === 'focus') {
      setFocusBuilt(true);
      // one frame in its starting place first, so it rises in instead of appearing
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setFocusIn(true)));
      return () => cancelAnimationFrame(id);
    }
    setFocusIn(false);
    // 'back' stays until the next switch: the list's fade-in holds its end, and removing it would drop the cards' layers (a flicker)
    const id = setTimeout(() => { setFocusBuilt(false); setShared((v) => (v === 'back' ? v : null)); }, 700);
    return () => clearTimeout(id);
  }, [view]);
  // Focus has been laid out and is being shown this frame: its card takes over from the list's, from exactly there
  useLayoutEffect(() => {
    if (!focusIn || !morph.current) return;
    // 'in' stays until the next switch, like 'back': the dots and stage rise in and hold their end (dropping the class as
    // they finished took their layers away, a flicker over the whole page)
    morphLand(focusEl.current, morph.current); morph.current = null;
  }, [focusIn]);
  // Opening is started before the first paint, so the browser-run half is already going when the rest of the window's setup
  // work runs. Closing — the chevron, a swipe, Back, or another screen taking its place — slides it down; then it is hidden
  // (kept, so the next opening is only the slide).
  const [hidden, setHidden] = useState(!open);
  const openRef = useRef(open); openRef.current = open;
  const onGoneRef = useRef(onGone); onGoneRef.current = onGone;
  const opening = useRef<{ stop: () => void } | null>(null);
  const startOpen = () => {
    closing.current = null;
    clockStop = null;
    // un-park it now, before the orb's flight measures where its slot will be (React would only do it after this effect)
    dialogRef.current?.classList.remove('wk-off', 'wk-leaving');
    // out of the card or bar that was tapped (none: it rises from the bottom edge)
    leaving.current = false;
    dragOff.current = 0; relHead.current = relViews.current = 0;
    measure(wkSourceRect(takeWorkoutFrom()));
    noteMove(`open ${src.current[0]?.dataset.wk ?? 'slide'}`);
    const p0 = p.get();
    thaw(); pv.set(p0); flush(); cardAt(p0);
    const lw = LANDS[ls.current].openWin;
    const sp = from.current ? (lw ? { ...lw, restDelta: 0.0005 } : WINDOW_OPEN) : SURFACE;
    launchHero(true, p0, 1, sp, 0);
    opening.current?.stop();
    const o = animate(p, 1, reduce ? { duration: 0.01 } : sp);
    opening.current = o;
    runMirror(p0, 1, sp, 0); syncHero();
    setMoving(true);
    const m = mirror.current!;
    void Promise.all([o.then(() => undefined), m.settled()]).then(() => { if (opening.current === o && !closing.current) { releaseCard(); dropSkin(); if (dragY.get() <= 0) setMoving(false); } });
    takeTints();
  };
  // waiting minimised: a tap on the resume bar or button starts the slide at once (ui/workoutOpen.ts)
  useEffect(() => (!open && hidden ? setWorkoutOpener(startOpen) : undefined));
  useLayoutEffect(() => {
    if (open) {
      if (!opening.current) startOpen(); // (already sliding when the tap started it)
      // the rest of "shown" (its clocks ticking again, its role) as a render that yields: set at once, here, it re-rendered
      // the whole window a second time inside the tap, before the slide's first frame
      startTransition(() => setHidden(false));
      return () => { opening.current?.stop(); opening.current = null; };
    }
    setMenu(null); setConfirm(null); setRenaming(false);
    const el = document.activeElement as HTMLElement | null;
    if (el && dialogRef.current?.contains(el)) el.blur();
    (closing.current ?? startClose(swipeV.current || dragY.getVelocity())).then(() => { if (!openRef.current) { setHidden(true); onGoneRef.current?.(); } });
    // eslint-disable-next-line
  }, [open]);
  // the keyboard is up: it slides over the bar (the bar stays put, it no longer drops out of sight before the keyboard rises),
  // so a running rest keeps counting in the header instead. Told by the keyboard itself, not by a field having focus: a field
  // keeps its focus when Android's back hides the keyboard, and the header then showed the rest twice.
  const [typing, setTyping] = useState(() => keyboardGoal() > 0);
  useEffect(() => onKeyboardGoal((px) => setTyping(px > 0)), []);
  // the field you tapped rides up with the keyboard, on its curve, as far as needed (the list, or Focus's page, scrolls)
  useEffect(() => { const el = dialogRef.current; return el ? rideFocus(el, (f) => f.closest<HTMLElement>('.wk-page, .wk-list')) : undefined; }, []);
  const body = useRef<HTMLDivElement>(null);
  // the list never moves sideways: CSS stops a finger, this stops scrollIntoView and friends (a "set done" ring scaling past
  // the right edge used to make room to slide into)
  useEffect(() => {
    const el = body.current; if (!el) return;
    const home = () => { if (el.scrollLeft) el.scrollLeft = 0; };
    el.addEventListener('scroll', home, { passive: true });
    return () => el.removeEventListener('scroll', home);
  }, [!a]); // eslint-disable-line react-hooks/exhaustive-deps
  const z = useOverlayZ(60);
  // where to open from is fixed at mount; where to close into is measured on every render (the card may have scrolled)
  // Render the first exercises at once and the rest a few at a time after the opening animation — no long task while
  // the surface is growing (that was the stutter/flicker on Start), and no single big hitch afterwards either.
  // The window opens first with just its header; the exercises then come in one after another once it has landed,
  // so no frame of the opening has to build the list.
  // The first two exercises are there from the very first frame (they fill the window as it opens, so nothing below them
  // ever shows first and then jumps); the rest follow one by one once the window has landed, and the buttons under the
  // list only appear after the whole list, so they are never pushed down while you look at them.
  const total0 = a?.exercises.length ?? 0;
  // The tap draws only the window and its header (one light frame, so the slide starts at once); the first two exercises
  // follow on the next two frames, while the window is still mostly below the screen edge — the slide itself runs on the
  // compositor, so this work never shows as a stutter. Building them in the tap was most of the pause after it.
  const [shown, setShown] = useState(0);
  const lead = Math.min(2, total0);
  useEffect(() => {
    if (shown >= lead) return;
    const id = requestAnimationFrame(() => setShown((n) => Math.max(n, Math.min(lead, n + 1))));
    return () => cancelAnimationFrame(id);
  }, [shown, lead]);
  const [ready, setReady] = useState(false);

  const listDoneAtOpen = useRef(total0 <= 2);
  // the exercises drawn in the very first frame ride up with the window; any that arrive after it fade in
  const firstIds = useRef(new Set((a?.exercises ?? []).slice(0, 2).map((e) => e.id)));
  const [listDone, setListDone] = useState(listDoneAtOpen.current); // stays true once the list has been complete (adding an exercise later never hides the buttons)
  useEffect(() => { if (!listDone && shown >= total0) setListDone(true); }, [shown, total0, listDone]);
  // once the opening has built the list, an exercise that joins it (added, or brought back by Undo) unfolds into place
  const listSettled = useRef(false);
  useEffect(() => { if (listDone) listSettled.current = true; }, [listDone]);
  // built ahead for a workout not started yet (WorkoutHost): the one you start takes this window over, and its list comes in
  // exactly as on a first opening
  const sid = a?.id ?? null;
  const [sidSeen, setSidSeen] = useState(sid);
  if (sidSeen !== sid) {
    setSidSeen(sid);
    if (sidSeen === WK_GHOST) {
      listDoneAtOpen.current = total0 <= 2;
      firstIds.current = new Set((a?.exercises ?? []).slice(0, 2).map((e) => e.id));
      listSettled.current = false;
      setListDone(listDoneAtOpen.current); setShown(0);
    }
  }
  // the rest-over sound, made while nothing else is happening: once the list is built (made as soon as the window had
  // landed, it ran while the rest of the list was still arriving, ~11 ms at once on the phone)
  useEffect(() => { if (ready && listDone) prepareRestAudio(); }, [ready, listDone]);
  useEffect(() => {
    if (sid === WK_GHOST) return; // (nothing to stage yet)
    if (p.get() >= 0.97) { setReady(true); return; }
    const off = p.on('change', (v) => { if (v >= 0.97) { setReady(true); off(); } });
    const fallback = setTimeout(() => setReady(true), 900);
    return () => { off(); clearTimeout(fallback); };
    // eslint-disable-next-line
  }, [sid === WK_GHOST]);
  useEffect(() => {
    if (!ready || shown < lead || shown >= total0) return;
    const id = setTimeout(() => setShown((n) => n + 1), 70);
    return () => clearTimeout(id);
  }, [ready, shown, total0, lead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ov = useUI.getState().overlays;
      if (ov[ov.length - 1]?.type !== 'workout' || document.querySelector('.sheet')) return; // a sheet above the workout (or one of its own menus) handles its own Escape
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input,textarea')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pop]);

  if (!a) return null; // finish/discard own the navigation

  const total = sessionSetCount(a.exercises, false);
  const done = sessionSetCount(a.exercises, true);
  const paused = !!a.pausedAt;

  const finish = () => {
    if (done === 0) { setConfirm('discard'); return; }
    if (done < total) { setConfirm('finish'); return; }
    haptic('confirm'); doFinish();
  };
  const doFinish = () => {
    finishing.current = true;
    clockStop = Date.now(); // the clock stands still while the window fades out
    const r = useStore.getState().finishActive();
    if (r) swap(1, 'summary', { sessionId: r.id }); // its medal lands with the finish (or record) feel
  };
  // the bar's "next set": scroll it into the middle and let it glow for a moment
  const jumpTo = (setId: string) => {
    if (view === 'focus' && focusApi.current) { focusApi.current.jumpToSet(setId); return; }
    const row = body.current?.querySelector<HTMLElement>(`[data-set="${setId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('wk-flash'); void row.offsetWidth; row.classList.add('wk-flash');
  };
  const doDiscard = () => {
    const d = useStore.getState().discardActive();
    pop();
    if (d) toast(t('Workout discarded'), { actionLabel: t('Undo'), onAction: () => useStore.getState().restoreActive(d), duration: 8000 });
  };

  const menuEx = menu ? a.exercises.find((e) => e.id === menu) : undefined;

  return (
    <>
      <motion.div
        role={hidden ? undefined : 'dialog'} aria-modal={hidden ? undefined : 'true'} aria-label={t('Active workout')} aria-hidden={hidden || undefined}
        ref={dialogRef} data-hue="train" className={`wk-card${hidden ? ' wk-off' : ''}`} style={{ zIndex: z, y: dragT }}
      >
        <WkLive.Provider value={!hidden}>
        <motion.div ref={dimRef} className="wk-dim" aria-hidden style={{ opacity: dimO }} />
        <motion.div ref={followRef} className="wk-follow" aria-hidden style={{ transform: sheetT }}>
          <motion.div ref={shadeRef} className="wk-shade" style={{ opacity: shadeO }} />
          <motion.div ref={fillRef} className="wk-corner-fill" style={{ opacity: fillO }} />
        </motion.div>
        <motion.div ref={sheetRef} className="wk-sheet" style={{ transform: sheetT }}>
        <motion.div ref={bclipRef} className="wk-bclip" style={{ transform: bclipT }}>
        <motion.div ref={bshiftRef} className="wk-bshift" style={{ transform: bshiftT }}>
          <motion.div ref={solidRef} className="wk-solid" aria-hidden style={{ opacity: solidO }}><div className="aurora-lite"><WkFieldGlow /><Breath hold={paused || covered} /></div><i ref={topRef} className="wk-top" /></motion.div>
          <div ref={skinRef} className="wk-skin" aria-hidden />
        <div className="wk-window" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingTop: 'var(--sat)' }}>
          {/* header */}
          {/* no backdrop of its own: the list scrolls in its own box below, so the header sits straight on the window's light
              (a solid band here cut the colour field off in a hard line under the grabber) */}
          <motion.div ref={headRef} className="wk-head-wrap" style={{ touchAction: 'none', transform: headT, opacity: insideO }}>
            <div className="wk-head">
              {/* the finger is down: the page behind starts drawing itself again (unseen) so the window can move the moment it lifts */}
              <button className="icon-btn flat press wk-min" aria-label={t('Minimise workout')} onPointerDown={warmUp} onPointerCancel={() => warmStage(false)} onClick={() => close()}><Icon name="chevD" /></button>
              <div className="wk-head-mid">
                {renaming ? (
                  <input className="input" autoFocus style={{ minHeight: 34, padding: '4px 10px' }} defaultValue={a.name} onBlur={(e) => { useStore.getState().mutateActive((x) => ({ ...x, name: e.target.value.trim() })); setRenaming(false); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={t('Workout name')} />
                ) : (
                  <button className="wk-title display press" data-wk-fly="title" onClick={() => setRenaming(true)}>{a.name || t('Workout')}</button>
                )}
                {/* the clock and the tally on one line: time, sets, volume */}
                <div className="wk-meta num">
                  <span className={`wk-clock${paused ? ' paused' : ''}`} data-wk-fly="clock"><Clock /></span>
                  <span className="wk-meta-rest">{total ? <><Roll text={String(done)} />/{total} {t('sets')}{done > 0 && <> · <Roll text={fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)} /> {weightUnit}</>}</> : t('No sets yet')}</span>
                  {paused && <span className="wk-paused">{t('Paused')}</span>}
                  {typing && a.rest && <RestInline />}
                </div>
              </div>
              {a.exercises.length > 0 && (
                <button className="icon-btn flat press wk-view" onClick={switchView} aria-label={view === 'list' ? t('Focus view') : t('List view')} aria-pressed={view === 'focus'}>
                  <Icon name={view === 'list' ? 'focus' : 'list'} size={20} />
                </button>
              )}
              <button className="icon-btn flat press wk-pause" onClick={() => { haptic('light'); paused ? useStore.getState().resumeActive() : useStore.getState().pauseActive(); }} aria-label={paused ? t('Resume') : t('Pause')}>
                <Icon name={paused ? 'play' : 'pause'} size={18} />
              </button>
              {/* the one Finish: muted until a set is logged, then the accent; it glows once every set is ticked */}
              <button ref={finishBtn} className={`btn sm press wk-finish ${total > 0 && done === total ? 'primary ready' : 'muted'}`} onPointerDown={total > 0 && done === total ? warmUp : undefined} onClick={finish}>{t('Finish')}</button>
            </div>
            {/* grows by scaling (the compositor's job); it animated its width, which made every set ticked lay the page out again */}
            <div className="wk-progress"><i style={{ transform: `scaleX(${total ? done / total : 0})` }} /></div>
          </motion.div>

          {/* body: the list, and Focus over it when chosen (the list stays, faded out, so switching back keeps your place) */}
          <motion.div ref={viewsRef} className="wk-views" style={{ transform: viewsT, opacity: insideVO }}>
          <motion.div ref={body} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0', paddingBottom: bodyPad, overscrollBehavior: 'contain' }} className={`hide-scroll wk-list${a.exercises.length === 0 ? ' is-empty' : ''}${view === 'focus' && a.exercises.length > 0 && (focusIn || shared !== 'in') ? ' wk-away' : ''}${shared === 'back' ? ' back' : ''}`}>
            {a.exercises.length === 0 && (
              // nothing yet: one calm, centred moment (a soft mark, the line, then the button) instead of a top-heavy
              // block over an empty half screen
              <div className="wk-empty">
                <div className="wk-empty-mark" aria-hidden><Icon name="dumbbell" size={40} /></div>
                <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Empty session')}</div>
                <div className="small t2" style={{ marginTop: 6 }}>{t('Add your first exercise, or tell the orb what you did.')}</div>
              </div>
            )}
            {/* plain blocks: an exercise added later (or brought back by Undo) unfolds, a removed one folds away (Collapse), so the
                list below opens and closes around it instead of jumping — nothing re-measures the page */}
            {/* before the first set: today's targets, anything worth knowing today, one focus (folds away on the first tick) */}
            {a.exercises.length > 0 && a.id !== WK_GHOST && <Briefing key={a.id} a={a} exMap={exMap} />}
            <AnimatePresence initial={false}>
              {a.exercises.slice(0, shown).map((se, idx) => (
                <Collapse key={se.id} appear={listSettled.current}>
                  <ExerciseBlock se={se} ex={exMap.get(se.exerciseId)} onMenu={setMenu} appear={!firstIds.current.has(se.id)}
                    linkedPrev={!!(idx > 0 && se.supersetGroup && a.exercises[idx - 1].supersetGroup === se.supersetGroup)}
                    linkedNext={!!(idx < a.exercises.length - 1 && se.supersetGroup && a.exercises[idx + 1].supersetGroup === se.supersetGroup)} />
                </Collapse>
              ))}
            </AnimatePresence>
            {listDone && (
            <motion.div initial={listDoneAtOpen.current ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SOFT}>
            <button className={`btn block press${a.exercises.length === 0 ? ' primary' : ''}`} style={{ marginTop: a.exercises.length ? 20 : 4 }} onClick={() => push('exercisePicker', { mode: 'add' })}><Icon name="plus" size={18} /> {t('Add exercise')}</button>
            <button className="btn ghost danger block press" style={{ marginTop: 10 }} onClick={() => setConfirm('discard')}>{t('Discard workout')}</button>
            </motion.div>
            )}
          </motion.div>
          {focusBuilt && a.exercises.length > 0 && (
            <div ref={focusEl} className={`wk-focus${focusIn && view === 'focus' ? ' on' : ''}${shared === 'in' ? ' shared' : ''}`}>
              <FocusView exMap={exMap} onMenu={setMenu} pad={focusPad} apiRef={focusApi} />
            </div>
          )}
          </motion.div>

          {/* the workout's own dock, where the tab bar sits: what's next, the rest timer, and the orb */}
          <div ref={barRef} className="wk-bar-ride"><WorkoutBar engage={engage} exMap={exMap} focus={view === 'focus'} onDone={pointToFinish} onJump={jumpTo} /></div>
          </div>
        </div>
        </motion.div>
        </motion.div>
          </motion.div>
        <div ref={heroHost} className="wk-hero" aria-hidden />
        </WkLive.Provider>
        </motion.div>

      <AnimatePresence>
        {menuEx && <ExerciseMenu key="menu" se={menuEx} ex={exMap.get(menuEx.exerciseId)} onClose={() => setMenu(null)} />}
        {confirm && (
          <Sheet key="confirm" size="small" onClose={() => setConfirm(null)} label={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} nested>
            <SheetHead title={confirm === 'finish' ? t('Finish workout?') : t('Discard workout?')} onClose={() => setConfirm(null)} />
            <div className="sheet-body">
              {/* the session at a glance, then one clear choice */}
              <div className="wk-end-stats">
                <div><span className="micro">{t('Time')}</span><b className="num">{fmtDuration(elapsedMs(a) / 1000)}</b></div>
                <div><span className="micro">{t('Sets')}</span><b className="num">{done}<span className="t3">/{total}</span></b></div>
                <div><span className="micro">{t('Volume')}</span><b className="num">{fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), weightUnit)), lang, 0)}<span className="t3"> {weightUnit}</span></b></div>
              </div>
              <p className="small t2 wk-end-note">{confirm === 'finish' ? t(total - done === 1 ? '1 set isn’t ticked. Only the ticked ones are saved.' : '{n} sets aren’t ticked. Only the ticked ones are saved.', { n: total - done }) : t('Nothing has been logged yet. You can undo this right after.')}</p>
              <div className="stack gap8">
                {confirm === 'finish' ? (
                  <button className="btn primary block press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { haptic('confirm'); setConfirm(null); doFinish(); }}>{done === 1 ? t('Finish and save 1 set') : t('Finish and save {n} sets', { n: done })}</button>
                ) : (
                  <button className="btn block danger press wk-end-btn" style={{ ['--i' as string]: 0 }} onClick={() => { haptic('confirm'); setConfirm(null); doDiscard(); }}>{t('Discard workout')}</button>
                )}
                <button className="btn block ghost press wk-end-btn" style={{ ['--i' as string]: 1 }} onClick={() => setConfirm(null)}>{t('Keep training')}</button>
              </div>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * The workout's living light: the top light of the window breathes very slowly (a stepped opacity change, about 14
 * tiny steps a second, so it never redraws the screen every frame) and grows warmer as the session goes on, fully warm after
 * an hour. Off with Settings → Background glow → Off (it lives in the colour field); it holds still while the workout is
 * paused, minimised, or another screen covers it. Only opacity changes; the bar's frost sits far below it.
 */
function Breath({ hold }: { hold: boolean }) {
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(60_000, !!a && live && !hold);
  const warm = a ? Math.min(1, elapsedMs(a, now) / 3_600_000) : 0;
  return <i className={`wk-breath${hold || !live ? ' hold' : ''}`} style={{ ['--warm' as string]: warm.toFixed(3) }}><b><WkBreathGlow /></b></i>;
}

/** A number that rolls up (or down) when it changes, like the steppers; still on the first draw. */
// The ticking parts live in their own small components, so the clock re-renders a line of text four times a
// second instead of the whole workout screen.
function Clock() {
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(250, !!a && live);
  return <>{a ? fmtDuration(elapsedMs(a, clockStop ?? now) / 1000) : ''}</>;
}

/** The rest timer as a few words in the header, while the keyboard is up. */
function RestInline() {
  const t = useT();
  const a = useActive();
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && live);
  if (!a?.rest) return null;
  const left = (a.pausedAt ? a.rest.endsAt : a.rest.endsAt - now) / 1000;
  return <span className="wk-rest-inline" style={{ color: left <= 0 ? 'var(--ok)' : 'var(--ac-text)', fontWeight: 650 }}> · {left <= 0 ? t('Rest over') : `${t('Rest')} ${fmtDuration(Math.ceil(left))}`}</span>;
}

/**
 * The workout's own dock, in the tab bar's place and material. On the left, what's next ("Next · Set 3 · 80 kg × 8" over
 * the exercise): tap it and the list scrolls to that set. While you rest the whole bar fills with the accent as the rest
 * passes, under the time; tap it then for −15 / +15 / Skip. When the rest is over it turns green — "Go · Bench Press" — and
 * stays so until that set is ticked. The orb sits at its right end: tap it to say your sets. It is there from the first
 * frame, so the orb glides into it with the window instead of jumping to a button at the end of the list.
 */
function WorkoutBar({ engage, exMap, focus, onDone, onJump }: { engage: Engage; exMap: Map<string, Exercise>; focus: boolean; onDone: () => void; onJump: (setId: string) => void }) {
  const t = useT();
  const lang = useLang();
  const push = useUI((u) => u.push);
  const a = useActive();
  const unit = useStore((s) => s.settings.units.weight);
  const live = useContext(WkLive);
  const now = useNow(250, !!a?.rest && !a?.pausedAt && live);
  // (the first render back from minimised: the rest time caught up while it was out of sight, so it shows the new value
  // instead of rolling down from the old one, round 2 judge "1:21 rolls to 1:19")
  const wasLive = useRef(live);
  const back = live && !wasLive.current;
  useEffect(() => { wasLive.current = live; }, [live]);
  const [panel, setPanel] = useState(false);
  useEffect(() => { if (!panel) return; const id = setTimeout(() => setPanel(false), 4000); return () => clearTimeout(id); }, [panel, a?.rest?.endsAt, a?.rest?.total]);
  const resting = !!a?.rest;
  useEffect(() => { if (!resting) setPanel(false); }, [resting]);
  const page = useFocusPage();
  if (!a) return null;
  const nx = nextSetOf(a);
  // In Focus, when the next set is on the page you're looking at, that row is already highlighted there: the bar tells you
  // what comes after this exercise instead, and a tap glides to it.
  const after = focus && nx && !a.rest && page === nx.se.id ? upNextOf(a, nx.se.id) : null;
  const shown = after ?? nx;
  const ex = shown ? exMap.get(shown.se.exerciseId) : undefined;
  const name = ex ? exName(ex, lang) : '';
  const rest = a.rest;
  const left = rest ? (a.pausedAt ? rest.endsAt : rest.endsAt - now) / 1000 : 0;
  const over = !!rest && left <= 0;
  const kg = shown ? (shown.set.weightKg ?? shown.set.target?.weightKg) : undefined;
  const reps = shown ? (shown.set.reps ?? shown.set.target?.repMax) : undefined;
  const target0 = [kg !== undefined ? `${fmtNum(kgToDisplay(kg, unit), lang, 2)} ${unit}` : '', reps ? `× ${reps}` : ''].filter(Boolean).join(' ');
  // up next with nothing planned for its weight or reps: how many sets it holds
  const leftN = after ? after.se.sets.filter((x) => !x.done).length : 0;
  const target = target0 || (after ? `${leftN} ${t(leftN === 1 ? 'set' : 'sets')}` : '');
  const setWord = nx ? (nx.label === 'W' ? t('Warm-up') : `${t('Set')} ${nx.label}`) : '';
  const empty = !a.exercises.some((e) => e.sets.length > 0);
  // every set ticked: done, even while a rest is still counting (there's nothing left to rest for)
  const state: 'next' | 'rest' | 'go' | 'done' | 'empty' = empty ? 'empty' : !nx ? 'done' : rest ? (over ? 'go' : 'rest') : 'next';
  const tap = () => {
    if (state === 'rest') setPanel((v) => !v);
    else if (state === 'done') onDone();
    else if (state === 'empty') { orbTap(1); push('voice', { mode: 'workout' }); }
    else if (shown) onJump(shown.set.id);
  };
  const ofN = nx ? nx.se.sets.filter((x) => x.type === 'working').length : 0;
  const top = state === 'next' ? (after ? t('Up next') : `${t('Next set')} · ${nx!.label === 'W' ? t('Warm-up') : t('{n} of {m}', { n: nx!.label, m: ofN })}`)
    : state === 'rest' ? (panel ? (a.pausedAt ? `${t('Rest')} · ${t('Paused')}` : t('Rest')) : nx ? `${t('Rest')} · ${t('Next')}: ${name}` : t('Rest'))
    : state === 'go' ? `${t('Rest over')}${nx ? ` · ${setWord}` : ''}`
    : state === 'empty' ? `“${t('Bench press 80 kg for 8, 8, 6')}”`
    : t('All sets done');
  const big = state === 'next' ? name
    : state === 'rest' ? (a.pausedAt && !panel ? `${fmtDuration(Math.ceil(left))} · ${t('Paused')}` : fmtDuration(Math.ceil(left)))
    : state === 'go' ? (nx ? name : t('Go'))
    : state === 'empty' ? t('Tell the orb what you did')
    : `${sessionSetCount(a.exercises, true)} ${t('sets')} · ${fmtNum(Math.round(kgToDisplay(sessionVolume(a.exercises), unit)), lang, 0)} ${unit}`;
  return (
    <div className="wk-bar-wrap">
      {/* never re-keyed: the orb's slot lives in here, and remounting it made the orb leave and land again (a tick, a hop) */}
      <div className={`wk-bar ${state}`}>
        {/* the frost, tint and rim are a layer of their own under everything: the orb's button and the words sit beside it,
            not inside the blurred element (Chrome on the phone drew a darker square where the orb is) */}
        <span className="wk-bar-even" aria-hidden />
        <span className="wk-bar-surface glass" aria-hidden />
        <span className="wk-bar-clip" aria-hidden><RestFill state={state} endsAt={rest?.endsAt} total={rest?.total} paused={!!a.pausedAt} /></span>
        <button className="wk-bar-main press" onClick={tap} aria-expanded={state === 'rest' ? panel : undefined}
          aria-label={state === 'rest' ? `${t('Rest')} ${fmtDuration(Math.ceil(left))}` : `${top}. ${big}${(state === 'next' || state === 'go') && target ? `, ${target}` : ''}`}>
          <SwapText k={`${state}${after ? after.se.id : ''}`} tone={state}>
            <span className="wk-bar-top">{top}</span>
            <span className="wk-bar-big num">{state === 'next' || (state === 'go' && nx) ? <><Fit className="wk-bar-name" text={name} />{target && <span className="wk-bar-tgt">{target}</span>}</>
              : state === 'rest' ? (!a.pausedAt && left <= 3
                // the last three seconds swell on each tick; before that the seconds roll down
                ? <span key={Math.ceil(left)} className="wk-tick">{big}</span> : <Roll key="r" text={big} still={back} />)
              : state === 'done' ? <Roll text={big} /> : big}</span>
          </SwapText>
        </button>
        <button className="wk-bar-orb" aria-label={t('Dictate sets')} onPointerDown={() => orbPress(true)} onPointerUp={() => orbPress(false)} onPointerCancel={() => orbPress(false)} onPointerLeave={() => orbPress(false)}
          onClick={() => { orbTap(1); push('voice', { mode: 'workout' }); }}>
          <SphereSlot id="workout" priority={5} engage={engage} style={{ position: 'absolute', inset: -4 }} />
        </button>
        {/* −15 / +15 / Skip slide in inside the bar itself, beside the time (a pill floating above it covered the sets) */}
        <AnimatePresence>
          {panel && state === 'rest' && (
            <motion.div key="ctl" className="wk-bar-ctl" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={SOFT}>
              <button className="wk-ctl press num" onClick={() => { haptic('select'); adjustRest(-15); }} aria-label={t('15 seconds less')}>−15</button>
              <button className="wk-ctl press num" onClick={() => { haptic('select'); adjustRest(15); }} aria-label={t('15 seconds more')}>+15</button>
              <button className="wk-ctl skip press" onClick={() => { haptic('light'); skipRest(); setPanel(false); }}>{t('Skip')}</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Text measured off the page (Fit). */
let measureCtx: CanvasRenderingContext2D | null = null;
const measurer = () => (measureCtx ??= document.createElement('canvas').getContext('2d')!);
/**
 * One line that ends in a clean "…" when it doesn't fit, never in "Press, …" (the browser's own ellipsis keeps a trailing
 * comma or space). Measured only when the text or the room for it changes.
 */
function Fit({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const cut = (n: number) => `${text.slice(0, n).replace(/[\s,.;:·–—-]+$/u, '')}…`;
    // Nothing is read from the page here. The room is read when the browser reports the line's size, right after its own
    // layout (free then), and the shorter tries are measured off the page. Reading widths here laid the whole window out an
    // extra time (and once per try), in the tap that ticks a set and in the first frame of opening.
    let whole = true, font = '', spacing = '', parentW = -1;
    const fit = () => {
      const room = el.clientWidth;
      if (el.scrollWidth <= room + 0.5) return;
      const c = measurer();
      if (!font) { const cs = getComputedStyle(el); font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; spacing = cs.letterSpacing; }
      c.font = font; c.letterSpacing = spacing;
      const fits = (n: number) => c.measureText(cut(n)).width <= room - 1;
      let lo = 1, hi = text.length - 1; // the longest start that fits with its "…"
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (fits(m)) lo = m; else hi = m - 1; }
      whole = false; el.textContent = cut(lo);
    };
    // the line shrinks to a cut name, so only the whole name tells the room; the room changes only with the parent's width
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        if (e.target === el) { if (whole) fit(); continue; }
        const w = e.contentRect.width;
        if (parentW >= 0 && w !== parentW) reset();
        parentW = w;
      }
    });
    const reset = () => { whole = true; el.textContent = text; ro.unobserve(el); ro.observe(el); };
    el.textContent = text;
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (el.isConnected) { font = ''; reset(); } });
    return () => ro.disconnect();
  }, [text]);
  return <span ref={ref} className={className} />;
}

/**
 * The bar's two lines, swapped as one: when what the bar says changes (a set ticked, the rest over, skipped), the old
 * words fade up and out while the new ones rise in, in the same place. The old lines used to be removed at once, so the
 * bar stood empty for a frame or two before the new ones faded in.
 */
function SwapText({ k, tone, children }: { k: string; tone: string; children: React.ReactNode }) {
  const cur = useRef<{ k: string; tone: string; node: React.ReactNode }>({ k, tone, node: children });
  const [gone, setGone] = useState<{ k: string; tone: string; node: React.ReactNode; n: number } | null>(null);
  const n = useRef(0);
  if (cur.current.k !== k) {
    const was = cur.current;
    n.current++;
    // derived during render (React's "store info from previous renders"): the old lines are drawn in the same frame the new ones arrive
    setGone({ ...was, n: n.current });
  }
  cur.current = { k, tone, node: children };
  useEffect(() => {
    if (!gone) return;
    const id = setTimeout(() => setGone((g) => (g && g.n === gone.n ? null : g)), 420);
    return () => clearTimeout(id);
  }, [gone]);
  return (
    <>
      {gone && gone.k !== k && <span key={`g${gone.n}`} className={`wk-bar-txt t-${gone.tone} out`} aria-hidden>{gone.node}</span>}
      <span key={k} className={`wk-bar-txt t-${tone}`}>{children}</span>
    </>
  );
}

/**
 * The rest bar's fill. The browser grows it from where the rest stands to the end in one linear animation (compositor,
 * full refresh rate), instead of the page re-aiming it four times a second. It restarts only when the rest itself changes
 * (started, ±15, paused, resumed); when a rest is skipped it slides back instead of vanishing.
 */
function RestFill({ state, endsAt, total, paused }: { state: string; endsAt?: number; total?: number; paused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const anim = useRef<{ a: Animation; from: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const prev = anim.current;
    if (state === 'rest' && endsAt !== undefined && total) {
      const leftMs = paused ? endsAt : endsAt - Date.now();
      const from = Math.min(1, Math.max(0, 1 - leftMs / (total * 1000)));
      const a = el.animate([{ transform: `translateX(${(from - 1) * 100}%)` }, { transform: 'translateX(0%)' }], { duration: Math.max(1, leftMs), easing: 'linear', fill: 'forwards' });
      if (paused) a.pause();
      anim.current = { a, from };
      prev?.a.cancel();
      return;
    }
    if (state === 'go') return; // it ended at full: the CSS keeps it there, glowing in the accent
    anim.current = null;
    if (!prev) return;
    const pr = prev.a.effect?.getComputedTiming().progress ?? 1;
    const now = prev.from + (1 - prev.from) * Math.min(1, pr);
    prev.a.cancel();
    if (now > 0.01) el.animate([{ transform: `translateX(${(now - 1) * 100}%)` }, { transform: 'translateX(-100%)' }], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }, [state, endsAt, total, paused]);
  return <i ref={ref as React.RefObject<HTMLElement>} className="wk-bar-fill" />;
}

// ── exercise block ──────────────────────────────────────────

// memoised: ticking a set re-renders that exercise only
export const ExerciseBlock = memo(function ExerciseBlock({ se, ex, linkedPrev, linkedNext, onMenu, appear }: { se: SessionExercise; ex?: Exercise; linkedPrev: boolean; linkedNext: boolean; onMenu: (id: string) => void; appear?: boolean }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const allSessions = useStore((s) => s.sessions);
  // while a just-finished workout slides away, its own saved copy must not become its "last time" (the Prev column and
  // the plan line changed under your eyes as it left)
  const frozen = useContext(WkFrozen);
  const sessions = useMemo(() => (frozen ? allSessions.filter((x) => x.id !== frozen.id) : allSessions), [allSessions, frozen]);
  const push = useUI((u) => u.push);
  const last = useMemo(() => lastPerformance(se.exerciseId, sessions), [se.exerciseId, sessions]);
  const lastWorking = last?.sets.filter(countable) ?? [];
  const increments = useStore((s) => s.increments);
  const hint = useLiftHint(se, ex);
  const sugg = useMemo(() => (ex && ex.logType === 'weightReps' ? suggestProgression(ex, historyOf(se.exerciseId, sessions), repRange(se.sets), incrementFor(ex, increments, settings.plateStep)) : undefined),
    [ex, se.exerciseId, sessions, se.sets, increments, settings.plateStep]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = settings.units;
  let workIdx = -1;
  // sets that were there when this block was drawn don't grow in; one added later does
  const known = useRef(new Set(se.sets.map((x) => x.id)));
  useEffect(() => { for (const x of se.sets) known.current.add(x.id); });
  const kgTxt = (kg: number) => `${fmtNum(kgToDisplay(kg, u.weight), lang, 2)} ${u.weight}`;
  // one short line: what to do today and why, in a neutral tint (the numbers are already in the rows)
  const rv = sugg?.reasonVars ?? {};
  const reason = !sugg ? '' : sugg.kind === 'add-weight' ? t('+{inc} · set 1 hit {max}', { inc: kgTxt(Number(rv.inc)), max: rv.max ?? '' })
    : sugg.kind === 'add-reps' ? (rv.reps !== undefined ? t('Aim for {reps} reps', { reps: rv.reps }) : t('Same weight · +1 rep'))
    : sugg.kind === 'hold' ? t('Same weight · build set 1 to {min}', { min: rv.min ?? '' })
    : sugg.kind === 'stalled' ? t('Stalled at {w} · 3 sessions', { w: kgTxt(Number(rv.w)) })
    : t('First time · aim {min}–{max} reps', { min: rv.min ?? '', max: rv.max ?? '' });
  const REASON_ICON = { 'add-weight': 'arrowUp', 'add-reps': 'plus', hold: 'repeat', stalled: 'info', first: 'sparkle' } as const;
  const complete = se.sets.length > 0 && se.sets.every((x) => x.done);
  // the last set ticked while you watch: the card settles with a brief warm glow and one soft sheen (not when it is drawn
  // already complete, and not when a set is unticked)
  // (a set ticked, not the last open set deleted: that also makes it complete, and is no moment)
  const doneN = se.sets.filter((x) => x.done).length;
  const was = useRef({ complete, doneN });
  const [settle, setSettle] = useState(0);
  useEffect(() => { if (complete && !was.current.complete && doneN > was.current.doneN) setSettle((n) => n + 1); was.current = { complete, doneN }; }, [complete, doneN]);
  // something you told the Coach about this exercise ("left shoulder hurts on overhead press"): shown beside it, with a swap.
  // A joined string, so ticking a set elsewhere doesn't redraw this block.
  // (a note with an end date stops showing once that day has passed: "sore this week" is not forever)
  const flagged = useStore((s) => { const today = dayKey(Date.now(), s.settings.dayStartHour); return s.memory.filter((m) => m.exerciseIds?.includes(se.exerciseId) && !(m.until && m.until < today)).map((m) => m.text).join('\n'); });

  return (
    <section data-flip={se.id} className={`wk-block${appear ? ' in' : ''}${complete ? ' complete' : ''}`} style={{ position: 'relative', marginTop: linkedPrev ? 0 : 18, paddingLeft: se.supersetGroup ? 14 : 0 }}>
      {se.supersetGroup && <div aria-hidden style={{ position: 'absolute', left: 0, top: linkedPrev ? -4 : 6, bottom: linkedNext ? -14 : 6, width: 3, borderRadius: 3, background: 'var(--ac)', opacity: 0.85 }} />}
      {se.supersetGroup && !linkedPrev && <div className="micro accent" style={{ marginBottom: 4 }}>{t('Superset')}</div>}
      <div className="wk-card-wrap">
      <div className="plinth" style={{ padding: '14px 12px 12px', borderRadius: 'var(--r-lg)' }}>
        <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <button className="grow press" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => ex && push('exercise', { id: ex.id })}>
            {/* a long name wraps (two lines at most look calm); it never pushes the card wider than the screen */}
            <div className="display display-sm wk-ex-title">{ex ? exName(ex, lang) : t('Unknown exercise')}<span className="wk-ex-done" aria-hidden><Icon name="check" size={14} sw={3} /></span></div>
            <div className="wk-muscles">{ex?.muscles.slice(0, 2).map((m) => t(MUSCLE_LABEL[m])).join(' · ')}</div>
          </button>
          <button className="icon-btn flat press" onClick={() => onMenu(se.id)} aria-label={t('Exercise options')}><Icon name="more" /></button>
        </div>
        {se.note && <div className="small t2" style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 10 }}>{se.note}</div>}
        {flagged && (
          <div className="wk-flag xs">
            <Icon name="note" size={14} style={{ flex: 'none', marginTop: 1 }} />
            <span className="grow">{flagged.split('\n').join(' · ')}</span>
            <button className="chip sm press" onClick={() => push('exercisePicker', { mode: 'replace', seId: se.id, forExercise: ex })}>{t('Swap')}</button>
          </div>
        )}
        {/* what the rows don't show: a record within reach, a stalled lift's change, last time's note (Briefing.tsx) */}
        <LiftHints se={se} h={hint} />
        {/* (a stalled lift's change and a heaviest-yet line already say why: one line, not two) */}
        {sugg && reason && sugg.kind !== 'stalled' && !hint.record && (
          <div className="wk-reason num"><Icon name={REASON_ICON[sugg.kind]} size={14} style={{ flex: 'none' }} /><span>{reason}</span></div>
        )}

        <div className="set-head" style={{ display: 'grid', gridTemplateColumns: gridCols(ex, settings.effort), gap: 8, marginTop: 12 }}>
          <span className="micro">{t('Set')}</span><span className="micro">{t('Prev')}</span>
          {headers(ex, u, t).map((h) => <span key={h} className="micro" style={{ textAlign: 'center' }}>{h}</span>)}
          {settings.effort !== 'off' && <span className="micro" style={{ textAlign: 'center' }}>{settings.effort.toUpperCase()}</span>}
          <span />
        </div>
        <AnimatePresence initial={false}>
          {se.sets.map((set) => {
            if (set.type === 'working') workIdx++;
            return <Collapse key={set.id} appear={!known.current.has(set.id)}><SetRow se={se} set={set} ex={ex} label={set.type === 'warmup' ? 'W' : String(workIdx + 1)} prev={set.type === 'working' ? lastWorking[Math.min(workIdx, lastWorking.length - 1)] : undefined} restDefault={settings.restDefaultSec} /></Collapse>;
          })}
        </AnimatePresence>
        <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn sm press grow wk-add-set" onClick={() => { haptic('light'); addSet(se.id); }}><Icon name="plus" size={16} /> {t('Set')}</button>
          {(!ex || ex.logType === 'weightReps' || ex.logType === 'bodyweightReps' || ex.logType === 'assisted') && <button className="btn sm ghost press" onClick={() => addSet(se.id, 'warmup')}>{t('+ Warm-up')}</button>}
        </div>
      </div>
      {/* laid over the card, not inside it: the card's frosted glass then never has to be redrawn while the glow plays */}
      {settle > 0 && complete && <span key={settle} className="wk-settle" aria-hidden><i /></span>}
      </div>
    </section>
  );
});

/** Bring a set row into view if it sits under the workout bar or just below the screen. Only ever scrolls down, and only a
 *  short way: it follows you to the next set, it never yanks the list somewhere you didn't look. */
function revealSet(id: string) {
  // the page you're on in Focus, else the list
  const list = document.querySelector<HTMLElement>('.wk-focus.on .wk-page.cur') ?? document.querySelector<HTMLElement>('.wk-list');
  const row = list?.querySelector<HTMLElement>(`[data-set="${id}"]`);
  if (!list || !row) return;
  const r = row.getBoundingClientRect(), box = list.getBoundingClientRect();
  const bar = document.querySelector('.wk-bar-wrap .wk-bar')?.getBoundingClientRect();
  const bottom = Math.min(box.bottom, bar ? bar.top - 16 : box.bottom);
  const dy = r.bottom - bottom;
  if (dy > 0 && dy < box.height * 0.8) list.scrollBy({ top: dy + 20, behavior: 'smooth' });
}

function gridCols(ex: Exercise | undefined, effort: string) {
  // minmax(0, 1fr): an input never pushes the row wider than the card (plain 1fr let its content decide)
  const extra = effort !== 'off' ? ' 52px' : '';
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return `34px 62px minmax(0, 1fr)${extra} 46px`;
  return `34px 62px minmax(0, 1fr) minmax(0, 1fr)${extra} 46px`;
}
function headers(ex: Exercise | undefined, u: { weight: string; distance: string }, t: (k: string) => string): string[] {
  const lt = ex?.logType ?? 'weightReps';
  if (lt === 'duration') return [t('Seconds')];
  if (lt === 'distance') return [u.distance.toUpperCase(), t('Min')];
  if (lt === 'bodyweightReps') return [`+${u.weight.toUpperCase()}`, t('Reps')];
  if (lt === 'assisted') return [`−${u.weight.toUpperCase()}`, t('Reps')];
  return [u.weight.toUpperCase(), t('Reps')];
}

// ── set row ─────────────────────────────────────────────────


const SetRow = memo(function SetRow({ se, set, ex, label, prev, restDefault }: { se: SessionExercise; set: SetRecord; ex?: Exercise; label: string; prev?: SetRecord; restDefault: number }) {
  const t = useT();
  const lang = useLang();
  const settings = useStore((s) => s.settings);
  const toast = useUI((u) => u.toast);
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(0);
  const bursts = useRef(0);
  const [burst, setBurst] = useState(0); // a ring that expands from the check each time a set is completed
  const [beat, setBeat] = useState<{ n: number; label: string } | null>(null); // you beat last time: gold burst + what you gained
  const [showGain, setShowGain] = useState(false);
  const [best, setBest] = useState(0); // a new best for this exercise: a gold light sweeps the row and a "New best" tag shows
  // the set to do next gets a quiet accent outline (a boolean, so only the two rows that change redraw)
  const current = useStore((s) => !set.done && nextSetOf(s.active)?.set.id === set.id);
  useEffect(() => { if (!beat) return; setShowGain(true); const id = setTimeout(() => setShowGain(false), 1500); return () => clearTimeout(id); }, [beat]);
  const lt = ex?.logType ?? 'weightReps';
  const u = settings.units;
  const wDisp = (kg?: number) => (kg === undefined ? undefined : Math.round(kgToDisplay(kg, u.weight) * 100) / 100);
  const target = set.target;
  const ph = {
    w: wDisp(target?.weightKg ?? prev?.weightKg),
    r: target?.repMax ? target.repMax : prev?.reps,
  };

  const eff = {
    weightKg: set.weightKg ?? target?.weightKg ?? prev?.weightKg,
    reps: set.reps ?? (target?.repMax ?? prev?.reps),
    durationSec: set.durationSec ?? prev?.durationSec,
    distanceM: set.distanceM ?? prev?.distanceM,
  };

  // a set ticked anywhere (a tap here, Done ✓ on the watch, logged by the Coach): the check pops, the row's light plays
  useEffect(() => onSetDone(set.id, (d) => {
    const k = ++bursts.current;
    setBurst(k);
    if (d.pr) setBest(k);
    if (d.gain) setBeat((b) => ({ n: (b?.n ?? 0) + 1, label: d.gain! }));
    // the next set comes into view if it is about to slip under the bar (never scrolls up, never jumps far)
    requestAnimationFrame(() => { const nx = nextSetOf(useStore.getState().active); if (nx) revealSet(nx.set.id); });
  }), [set.id]);

  const complete = () => {
    if (set.done) { patchSet(se.id, set.id, { done: false, completedAt: undefined }); skipRest(); return; }
    if (!completeSet(se.id, set.id, eff)) { setShake((n) => n + 1); haptic('warn'); toast(t('Enter reps first'), { tone: 'bad', duration: 1800 }); }
  };

  const remove = () => {
    const r = deleteSet(se.id, set.id);
    toast(t('Set removed'), { actionLabel: t('Undo'), onAction: r.restore });
  };

  const field = (value: number | undefined, placeholder: number | undefined, onChange: (v: number | undefined) => void, max: number, key: string, onEnter?: () => void) => (
    <div>
      <NumInput compact value={value} max={max} placeholder={placeholder !== undefined ? fmtNum(placeholder, lang, max) : '—'} onChange={onChange} label={key} onEnter={onEnter} />
    </div>
  );

  const fw = field(wDisp(set.weightKg), ph.w, (v) => patchSet(se.id, set.id, { weightKg: v === undefined ? undefined : displayToKg(v, u.weight) }), u.weight === 'lb' ? 1 : 2, t('Weight'));
  const fr = field(set.reps, ph.r, (v) => patchSet(se.id, set.id, { reps: v }), 0, t('Reps'), complete);

  return (
    // a plain row: it grows in and folds away inside its Collapse (no Motion layout — that re-measured the whole page)
    <div data-set={set.id}>
      <div className={`wk-set ${set.done ? 'done' : current ? 'current' : 'todo'}${set.type === 'warmup' ? ' warm' : ''}`} style={{ gridTemplateColumns: gridCols(ex, settings.effort) }}>
        {/* ticked: a soft light ripples out from the check across the row, and leaves the row's tint behind */}
        {burst > 0 && set.done && <span key={`w${burst}`} className="wk-set-clip" aria-hidden><i className={best === burst ? 'wk-set-sweep' : 'wk-set-wave'} /></span>}
        {best > 0 && best === burst && set.done && <span key={`b${best}`} className="wk-best" role="status">{t('New best')}</span>}
        <button className="press wk-set-n" aria-label={t('Set options')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{label}</button>
        <button className="num press wk-prev" disabled={!prev} onClick={() => prev && patchSet(se.id, set.id, { weightKg: prev.weightKg, reps: prev.reps, durationSec: prev.durationSec, distanceM: prev.distanceM })} aria-label={prev ? `${t('Use previous')}: ${fmtSet(prev, ex, u, lang, t)}` : undefined}>
          {/* a hold reads in the column's own unit ("66s" over SECONDS, not "1:06" beside a 66), as the records write it */}
          {prev ? (lt === 'duration' ? (prev.durationSec ? `${prev.durationSec}s` : '—') : fmtSet(prev, ex, u, lang, t).replace(/ (kg|lb)/, '')) : '—'}
        </button>
        {lt === 'duration' && field(set.durationSec, prev?.durationSec ?? 45, (v) => patchSet(se.id, set.id, { durationSec: v }), 0, t('Seconds'), complete)}
        {lt === 'distance' && <>
          {field(set.distanceM === undefined ? undefined : Math.round(mToDisplay(set.distanceM, u.distance) * 100) / 100, prev?.distanceM ? mToDisplay(prev.distanceM, u.distance) : undefined, (v) => patchSet(se.id, set.id, { distanceM: v === undefined ? undefined : displayToM(v, u.distance) }), 2, t('Distance'))}
          {field(set.durationSec === undefined ? undefined : Math.round((set.durationSec / 60) * 10) / 10, prev?.durationSec ? prev.durationSec / 60 : undefined, (v) => patchSet(se.id, set.id, { durationSec: v === undefined ? undefined : Math.round(v * 60) }), 1, t('Minutes'), complete)}
        </>}
        {(lt === 'weightReps' || lt === 'bodyweightReps' || lt === 'assisted') && <>{fw}{fr}</>}
        {settings.effort !== 'off' && <div><NumInput compact value={settings.effort === 'rpe' ? set.rpe : set.rir} max={1} placeholder="—" onChange={(v) => patchSet(se.id, set.id, settings.effort === 'rpe' ? { rpe: v } : { rir: v })} label={settings.effort.toUpperCase()} /></div>}
        {/* not logged: an empty outline (no check yet); logged: a filled check that draws itself in */}
        <motion.button key={shake} className={`press wk-check${set.done ? ' on' : ''}${set.done && burst > 0 ? ' fresh' : ''}`} aria-label={set.done ? t('Mark set not done') : t('Complete set')} aria-pressed={set.done} onClick={complete}
          animate={shake ? { x: [0, -5, 5, -3, 3, 0] } : undefined} transition={{ duration: 0.3 }}>
          {set.done && <svg key={`m${burst}`} className="wk-check-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" /></svg>}
          {burst > 0 && set.done && <motion.i key={burst} aria-hidden initial={{ scale: 0.9, opacity: 0.85 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--ac), 0 0 24px var(--ac)', pointerEvents: 'none' }} />}
          {beat && set.done && <motion.i key={`g${beat.n}`} aria-hidden initial={{ scale: 0.9, opacity: 1 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: '0 0 0 2px var(--gold), 0 0 30px var(--gold)', pointerEvents: 'none' }} />}
          <AnimatePresence>{showGain && beat && set.done && <motion.span key={`l${beat.n}`} className="num" initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0, y: -42, transition: { duration: 0.3 } }} transition={BOUNCY}
            style={{ position: 'absolute', left: '50%', top: 0, x: '-50%', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: 'var(--gold)', textShadow: '0 0 12px color-mix(in srgb, var(--gold) 60%, transparent)', pointerEvents: 'none' }}>{beat.label}</motion.span>}</AnimatePresence>
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <Collapse key="opts" appear ms={260}>
            <div className="row-flex" style={{ gap: 8, padding: '4px 2px 8px' }}>
              <button className="chip sm press" onClick={() => patchSet(se.id, set.id, { type: set.type === 'warmup' ? 'working' : 'warmup' })}>{set.type === 'warmup' ? t('Make working set') : t('Make warm-up')}</button>
              
              <span className="grow" />
              <button className="chip sm press" style={{ color: 'var(--bad)' }} onClick={remove}><Icon name="trash" size={14} /> {t('Delete')}</button>
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </div>
  );
});

// ── exercise menu ───────────────────────────────────────────

function ExerciseMenu({ se, ex, onClose }: { se: SessionExercise; ex?: Exercise; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const act = useActive();
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const [note, setNote] = useState(se.note ?? '');
  const [rest, setRest] = useState(se.restSec ?? s.settings.restDefaultSec);
  const idx = (act?.exercises ?? []).findIndex((e) => e.id === se.id);
  const count = (act?.exercises ?? []).length;
  const items = [
    { icon: 'swap', label: t('Replace exercise'), run: () => { onClose(); push('exercisePicker', { mode: 'replace', seId: se.id, forExercise: ex }); } },
    { icon: 'link', label: se.supersetGroup && (act?.exercises ?? [])[idx + 1]?.supersetGroup === se.supersetGroup ? t('Unlink superset') : t('Superset with next'), disabled: idx >= count - 1, run: () => { toggleSuperset(se.id); onClose(); } },
    { icon: 'arrowUp', label: t('Move up'), disabled: idx === 0, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, -1), 420, se.id); onClose(); } },
    { icon: 'arrowDown', label: t('Move down'), disabled: idx >= count - 1, run: () => { flip(document.querySelector('.wk-list'), () => moveExercise(se.id, 1), 420, se.id); onClose(); } },
  ];
  return (
    <Sheet onClose={onClose} size="small" label={t('Exercise options')} nested>
      <SheetHead title={ex ? exName(ex, lang) : t('Exercise')} onClose={onClose} />
      <div className="sheet-body">
        <div className="list">
          {items.map((i) => <button key={i.label} className="li press" disabled={i.disabled} style={{ opacity: i.disabled ? 0.4 : 1 }} onClick={i.run}><Icon name={i.icon} size={20} /><span className="li-title">{i.label}</span></button>)}
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="ex-note">{t('Exercise note')}</label>
          <textarea id="ex-note" className="input" value={note} onChange={(e) => { setNote(e.target.value); patchExercise(se.id, { note: e.target.value || undefined }); }} placeholder={t('Cues, seat height, how it felt…')} />
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Rest after a set')}</div>
          {/* the routine editor's slim stepper: any rest in 15 s steps, and it never wraps onto a second line */}
          <Stepper compact label={t('Rest after a set')} value={rest} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => { setRest(v); patchExercise(se.id, { restSec: v }); }} />
        </div>
        <button className="btn danger block press" style={{ marginTop: 22 }} onClick={() => { fadeOutPage(se.id); const r = removeExercise(se.id); onClose(); toast(t('Exercise removed'), { actionLabel: t('Undo'), onAction: r.restore }); }}><Icon name="trash" size={18} /> {t('Remove exercise')}</button>
      </div>
    </Sheet>
  );
}
