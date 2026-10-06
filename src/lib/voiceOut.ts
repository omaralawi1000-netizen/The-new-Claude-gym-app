/**
 * The read-aloud voice's level, for the orb (it glows with what it says). Kept apart from tts.ts so the orb, which is on
 * every screen, doesn't pull the speech code into the first download.
 */
let meter: AnalyserNode | null = null;
let buf: Float32Array<ArrayBuffer> | null = null;
let on = false;

/** The analyser the reply's audio runs through on its way to the speaker (one per audio context). */
export function outMeter(ac: AudioContext): AnalyserNode {
  if (!meter || meter.context !== ac) { meter = ac.createAnalyser(); meter.fftSize = 1024; meter.connect(ac.destination); buf = null; }
  return meter;
}
export const setVoiceOut = (v: boolean) => { on = v; };

/** How loud the reply being read aloud is right now, 0..1 (0 when nothing is playing). */
export function speakingLevel(): number {
  if (!on || !meter) return 0;
  buf ??= new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(buf);
  let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  return Math.min(1, Math.max(0, (Math.sqrt(e / buf.length) - 0.01) / 0.16));
}
