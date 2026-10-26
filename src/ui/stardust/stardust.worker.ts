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

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.canvas) {
    try { eng = new DustEngine(d.canvas as OffscreenCanvas); eng.onCrisp = (on) => self.postMessage({ crisp: on }); self.postMessage({ ready: true }); }
    catch (err) { self.postMessage({ failed: true, why: String(err) }); }
  }
  if (d.text && eng) eng.setText(d.text as Float32Array);
  if (d.state) { st = d.state as DustState; if (!scheduled) { scheduled = true; self.requestAnimationFrame(loop); } }
};
function loop(now: number) {
  scheduled = false;
  if (!eng || !st) return;
  const more = eng.frame(now, st);
  if (!more) { self.postMessage({ gone: true }); return; }
  scheduled = true; self.requestAnimationFrame(loop);
}
