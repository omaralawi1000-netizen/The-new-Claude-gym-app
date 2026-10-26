/// <reference lib="webworker" />
import { DustEngine, type DustState } from './engine';

/**
 * Stardust, drawn off the page: the page hands over its canvas once and then sends where things stand every page frame
 * (DustState); this worker draws on its own frame clock (the screen's full refresh rate), so the orb never waits for the
 * page. It tells the page when the greeting is fully written in dust (to show the crisp text) and when it has left.
 */
declare const self: DedicatedWorkerGlobalScope;
let eng: DustEngine | null = null;
let st: DustState | null = null;
let scheduled = false;
// (where the orb is heading: when the page is busy for a frame or two, the dust carries on the way it was going instead of
// stopping, so a drag stays smooth; never more than 33 ms ahead, and the page's next word wins)
let at = 0, vx = 0, vy = 0, px = 0, py = 0;

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.canvas) {
    try {
      const cv = d.canvas as OffscreenCanvas;
      // (the graphics chip reset: tell the page, which brings the usual orb back)
      cv.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); eng = null; self.postMessage({ failed: true }); });
      eng = new DustEngine(cv); eng.onCrisp = (on) => self.postMessage({ crisp: on }); self.postMessage({ ready: true });
    }
    catch (err) { self.postMessage({ failed: true, why: String(err) }); }
  }
  if (d.text && eng) eng.setText(d.text as Float32Array, d.use ?? undefined);
  if (d.state) {
    // (the speed from when the page sent each one, not when they arrived: two can arrive together after a hiccup)
    const n = d.state as DustState, t = n.at ?? performance.timeOrigin + performance.now(), dt = t - at;
    if (st && dt > 2 && dt < 60) { vx = (n.cx - px) / dt; vy = (n.cy - py) / dt; } else { vx = vy = 0; }
    st = n; at = t; px = n.cx; py = n.cy;
    if (!scheduled) { scheduled = true; self.requestAnimationFrame(loop); } }
};
function loop(now: number) {
  scheduled = false;
  if (!eng || !st) return;
  const late = performance.timeOrigin + performance.now() - at;
  const ahead = late > 12 && !st.reduced ? Math.min(33, late) : 0;
  const more = eng.frame(now, ahead ? { ...st, cx: px + vx * ahead, cy: py + vy * ahead } : st);
  if (!more) { self.postMessage({ gone: true }); return; }
  scheduled = true; self.requestAnimationFrame(loop);
}
