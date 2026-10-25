import { orbMoved } from './Sphere';
import { BOUNCY, apple } from './motion';

const HOME = apple(0.5); // (Reduce motion: home without the bounce)

/**
 * The orb in your hand (Omar, 26 Oct: "it reacts to my swipe, not just an animation, and maybe a bounce"). While your finger
 * is on it, it is wherever your finger says (with a rubber band where it shouldn't go); let go and it springs home with one
 * soft, calm bounce, carrying the speed you flicked it with. A swipe that means something (down: put it away; up out of the
 * dock: open it) is the owner's call in `release`. Only a transform on one small wrapper moves (the stage follows it); the
 * orb itself never changes shape. Under Reduce motion it still follows your finger, and goes home without the bounce.
 * `drift` adds a motion of its own while it isn't held (the comet's loop with your voice); null when there's none.
 */
export type HandOpts = {
  follow: (dx: number, dy: number) => [number, number];
  release: (x: number, y: number, vy: number) => boolean;
  drift?: (dt: number) => [number, number] | null;
  calm?: () => boolean;
};

/** A rubber band: follows at first, then gives less and less (never further than c). */
export const rubber = (d: number, c: number) => Math.sign(d) * c * (1 - 1 / (Math.abs(d) / c + 1));

export class OrbHand {
  x = 0; y = 0; private vx = 0; private vy = 0;
  private held = false; private moved = false; private kept = false;
  private sx = 0; private sy = 0; private hist: { t: number; y: number; x: number }[] = [];
  private raf = 0; private last = 0;
  constructor(private el: () => HTMLElement | null, private o: HandOpts) {}

  /** a finger lands on it */
  down(e: React.PointerEvent) {
    this.held = true; this.moved = false; this.kept = false;
    // (caught mid-bounce: it is picked up from where it is, not from home)
    this.sx = e.clientX - this.x; this.sy = e.clientY - this.y; this.vx = this.vy = 0;
    this.hist = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  /** the finger moves; true once it is a drag (not a tap) */
  move(e: React.PointerEvent) {
    if (!this.held) return false;
    const dx = e.clientX - this.sx, dy = e.clientY - this.sy;
    if (!this.moved && Math.hypot(e.clientX - this.hist[0].x, e.clientY - this.hist[0].y) < 8) return false; // (still a tap)
    this.moved = true;
    [this.x, this.y] = this.o.follow(dx, dy);
    this.hist.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (this.hist.length > 2 && e.timeStamp - this.hist[0].t > 90) this.hist.shift();
    this.write(); this.wake();
    return true;
  }
  /** the finger lifts; true when it was a drag, so the tap that follows is ignored */
  up() {
    if (!this.held) return false;
    this.held = false;
    const was = this.moved;
    if (was) {
      const a = this.hist[0], b = this.hist[this.hist.length - 1], dt = Math.max(16, b.t - a.t);
      // the flick's speed in px per second, from the last ~90 ms (scaled to the orb's damped travel)
      const fx = (b.x - a.x) / dt, fy = (b.y - a.y) / dt;
      this.kept = this.o.release(this.x, this.y, fy);
      this.vx = fx * 1000 * 0.35; this.vy = fy * 1000 * 0.35;
    }
    this.wake();
    return was;
  }
  /** something to follow started (the comet): run the loop */
  wake() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.step);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; document.removeEventListener('visibilitychange', this.back); }
  /** back on screen: carry on where it was (a spring mid-way home, the float) */
  private back = () => { if (document.hidden) document.addEventListener('visibilitychange', this.back, { once: true }); else this.wake(); };

  private step = (now: number) => {
    this.raf = 0;
    if (document.hidden) { document.addEventListener('visibilitychange', this.back, { once: true }); return; } // (off screen: nothing moves)
    const dt = Math.min(0.034, (now - this.last) / 1000); this.last = now;
    if (!this.held && !this.kept) {
      // home on the shared BOUNCY spring (one soft overshoot), or without it under Reduce motion
      const sp = this.o.calm?.() ? HOME : BOUNCY, k = sp.stiffness, c = sp.damping;
      this.vx += (-k * this.x - c * this.vx) * dt; this.vy += (-k * this.y - c * this.vy) * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    const d = this.held || this.kept ? null : this.o.drift?.(dt) ?? null;
    const home = !this.held && !this.kept && Math.abs(this.x) + Math.abs(this.y) < 0.15 && Math.abs(this.vx) + Math.abs(this.vy) < 2;
    if (home) { this.x = this.y = this.vx = this.vy = 0; }
    this.write(d);
    if (this.held || (!this.kept && !home) || d) this.raf = requestAnimationFrame(this.step);
  };
  private write(d: [number, number] | null = null) {
    const el = this.el(); if (!el) return;
    const x = this.x + (d?.[0] ?? 0), y = this.y + (d?.[1] ?? 0);
    el.style.transform = x || y ? `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` : '';
    orbMoved(x, y);
  }
}
