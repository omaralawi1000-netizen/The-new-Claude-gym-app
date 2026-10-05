/// <reference lib="webworker" />
import { SphereRenderer, type OrbInputs, type SphereColors } from './sphereRender';

/**
 * The orb, drawn off the page. The page sends where things stand once per app frame (size, colours, the voice, a press or
 * tap); this worker draws on its own frame clock into the OffscreenCanvas the page handed over, so the orb's own motion is
 * not held to the page's script frame rate. It reports how many frames a second it really draws (for the frame-rate
 * readout) and the voice level it shows (for the ring around the orb's button).
 */
declare const self: DedicatedWorkerGlobalScope;

interface State { bucket: number; dpr: number; reduced: boolean; colors: SphereColors; inp: OrbInputs; run: boolean }
let r: SphereRenderer | null = null;
let st: Partial<State> = {};
let tap = 0, whoosh = 0, ignite = 0, frames = 0, t0 = 0, sentVoice = -1, scheduled = false;

if (typeof self.requestAnimationFrame !== 'function') self.postMessage({ unsupported: true });

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d.canvas) { r = new SphereRenderer(d.canvas as OffscreenCanvas); r.onOnset = (s) => self.postMessage({ onset: s }); }
  if (d.state) {
    st = { ...st, ...d.state };
    if (d.state.inp?.tap) tap = Math.max(tap, d.state.inp.tap);
    if (d.state.inp?.whoosh) whoosh = Math.max(whoosh, d.state.inp.whoosh);
    if (d.state.inp?.ignite) ignite = Math.max(ignite, d.state.inp.ignite);
    if (st.run && !scheduled) schedule();
  }
};

function schedule() { scheduled = true; self.requestAnimationFrame(loop); }

function loop(now: number) {
  scheduled = false;
  if (!r || !st.run || !st.bucket || !st.colors || !st.inp) { frames = 0; t0 = 0; return; }
  r.resize(st.bucket, st.dpr ?? 2);
  r.frame(now, st.bucket, !!st.reduced, st.colors, { ...st.inp, tap, whoosh, ignite });
  tap = 0; whoosh = 0; ignite = 0;
  frames++;
  if (!t0) t0 = now;
  if (now - t0 >= 1000) { self.postMessage({ fps: Math.round((frames * 1000) / (now - t0)) }); frames = 0; t0 = now; }
  const v = r.voice;
  if (Math.abs(v - sentVoice) > 0.01 || (v < 0.004) !== (sentVoice < 0.004)) { sentVoice = v; self.postMessage({ voice: v }); }
  schedule();
}
