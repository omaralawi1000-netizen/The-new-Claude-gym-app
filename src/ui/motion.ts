/**
 * Apple's springs, exactly: SwiftUI defines a spring by its perceptual duration and bounce
 * (Spring(duration:bounce:)) — stiffness = (2π / duration)², damping = 4π(1 − bounce) / duration, mass 1.
 * .smooth is (0.5, 0), .snappy (0.5, 0.15), .bouncy (0.5, 0.3); sheets and full-screen cards use the default 0.5 s.
 */
export const apple = (duration: number, bounce = 0) => ({ type: 'spring' as const, stiffness: (2 * Math.PI / duration) ** 2, damping: (4 * Math.PI * (1 - bounce)) / duration, mass: 1 });

/**
 * The motion language. Every animation in the app should use one of these, so things that do the same job move the same
 * way (it is the difference between "smooth" and "made by one hand"). CSS has the same curves as --ease-spring and
 * --ease-smooth (real spring curves sampled into linear(), see styles.css).
 *
 *   tap      a press, a tick, a toggle: quick, no wobble
 *   smooth   content settling: cards, rows, layout changes
 *   surface  a sheet or popup arriving; surfaceExit carries a flick out
 *   window   the live workout opening out of its card
 *   bouncy   a moment worth celebrating: a sent message, a record, a gain
 *   gentle   slow fills: the rings, progress
 *   keyboard follows the on-screen keyboard's own curve
 */
export const TAP = apple(0.3, 0.15);            // a press, a tick: Apple .snappy, quick
export const SMOOTH = apple(0.36);                // content settling (Apple .smooth, a touch quicker for small moves)
export const SURFACE = { ...apple(0.45), restDelta: 0.001 }; // a sheet / card arriving: Apple's .smooth, a hair quicker than the 0.5 s default
export const SURFACE_EXIT = { ...apple(0.38), restDelta: 0.002 }; // leaving is a touch quicker than arriving
export const WINDOW = SURFACE;
// the live workout growing out of its card, and back: its own, slower spring, critically damped both ways (no bounce: it
// never goes past and comes back; opening, its tail is eased to a stop, Active.tsx `landed`, so it never creeps). Closing
// is the mirror of opening: the window is back in the card at 5 % of the spring (Active.tsx `hold`), so its spring is
// longer to take the same time to get there (0.5 s, where 0.5 s took it there in 0.38 s, quicker than it came out).
export const WINDOW_OPEN = { ...apple(0.56), restDelta: 0.0005 };
export const WINDOW_CLOSE = { ...apple(0.68), restDelta: 0.01 }; // (still from 5 % down: done once nothing more changes)
export const BOUNCY = apple(0.5, 0.3);            // Apple .bouncy: a record, a gain, a sent message
export const GENTLE = { type: 'spring', stiffness: 60, damping: 18 } as const;
export const KEYBOARD = { type: 'spring', stiffness: 760, damping: 54, mass: 1, restDelta: 0.5 } as const; // ~0.25 s: keeps up with Android's keyboard instead of trailing it

// ── high refresh rate: the same springs, run by the browser ────────────────────────────────────────────────────────
// Script-driven animation (requestAnimationFrame) is capped at 60 frames a second by some Android browsers even on a 120 Hz
// screen; animations the browser runs itself (Web Animations on transform/opacity) are drawn by its compositor at the
// screen's full rate. `springCurve` turns a spring into a CSS linear() easing + duration by simulating it, so a browser-run
// animation follows exactly the curve the script spring follows (same physics, same start velocity).

type Spring = { stiffness: number; damping: number; mass?: number };
const curveCache = new Map<string, { easing: string; duration: number }>();
const sampleCache = new Map<string, { xs: number[]; duration: number }>();
/** A spring going 0 → 1 with initial velocity v0 (in progress units per second), sampled every 1/60 s: its positions (the
 * last one exactly 1) and how long it runs in ms. `fine`: run it until it is within 0.05 px of a full-height sheet's travel
 * (for a sheet moving in whole screen pixels, which then lands one pixel at a time instead of a last hop of two). */
export function springSamples(sp: Spring, v0 = 0, fine = false): { xs: number[]; duration: number } {
  const key = `${sp.stiffness}|${sp.damping}|${sp.mass ?? 1}|${v0.toFixed(2)}|${fine}`;
  const hit = sampleCache.get(key); if (hit) return hit;
  const m = sp.mass ?? 1, dt = 1 / 600;
  let x = 0, v = v0, t = 0;
  const xs: number[] = [0];
  while (t < 3) {
    // semi-implicit Euler at 600 Hz: indistinguishable from the analytic spring at this step
    v += ((sp.stiffness * (1 - x) - sp.damping * v) / m) * dt; x += v * dt; t += dt;
    if (Math.round(t * 600) % 10 === 0) xs.push(x);       // a sample every 1/60 s
    if (t > 0.1 && (fine ? Math.abs(1 - x) < 0.00005 && Math.abs(v) < 0.002 : Math.abs(1 - x) < 0.0008 && Math.abs(v) < 0.02)) break;
  }
  xs[xs.length - 1] = 1;
  const out = { xs, duration: Math.round(t * 1000) };
  sampleCache.set(key, out);
  return out;
}
/** linear() easing for a spring going 0 → 1 with initial velocity v0 (in progress units per second). `fine`: run it until it
 * is still to a hundredth of a percent (for a long move handed over to something else at its end, which would jump). */
export function springCurve(sp: Spring, v0 = 0, fine = false): { easing: string; duration: number } {
  const key = `${sp.stiffness}|${sp.damping}|${sp.mass ?? 1}|${v0.toFixed(2)}|${fine}`;
  const hit = curveCache.get(key); if (hit) return hit;
  const { xs, duration } = springSamples(sp, v0, fine);
  const out = { easing: `linear(${xs.map((v2) => +v2.toFixed(4)).join(', ')})`, duration };
  curveCache.set(key, out);
  return out;
}
/** A position in CSS px rounded to the screen's own pixels. A layer drawn between two screen pixels is resampled, a touch
 * soft, and sharp again only on a whole pixel, so a glide that crept its last fraction of a pixel came into focus a few
 * frames after it looked still. Moved in whole screen pixels it is equally sharp on every frame (one is 0.3 CSS px). */
export const snapPx = (v: number) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };

/** High-refresh mode (Settings → Appearance), on unless turned off; kept in this browser only. */
export function highRefresh(): boolean { try { return localStorage.getItem('aven.hrr') !== '0'; } catch { return true; } }
export function setHighRefresh(on: boolean) { try { localStorage.setItem('aven.hrr', on ? '1' : '0'); } catch { /* ignore */ } hrrListeners.forEach((l) => l()); }
const hrrListeners = new Set<() => void>();
export const onHighRefresh = (fn: () => void) => { hrrListeners.add(fn); return () => { hrrListeners.delete(fn); }; };

/**
 * Let the browser draw an element's part of a spring at full refresh rate. The script spring keeps running (it drives the
 * orb and anything else that reads the progress), and the element keeps getting its inline style from it — but while this
 * browser-run animation plays it takes precedence, on the identical curve, so what you see is the 120 Hz version; when it
 * ends the inline style is already at the same final value. `frames` are keyframes at progress 0 and 1 (and optional
 * offsets in between); `from`/`to` are the progress values the spring runs between.
 */
export function mirrorSpring(el: Element | null | undefined, frames: Keyframe[], sp: Spring, velocity = 0): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function' || !highRefresh()) return null;
  const c = springCurve(sp, velocity);
  try { return (el as HTMLElement).animate(frames, { duration: c.duration, easing: c.easing, fill: 'none' }); } catch { return null; }
}
