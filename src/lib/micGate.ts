/**
 * What of the microphone goes up to Gemini Live: only you (Omar, 26 Oct: "when it speaks it hears itself … I want it to only
 * hear me", and background music kept it listening after he stopped). It runs on every ~100 ms of microphone, and says:
 * 'mute' (silence goes up instead, so the stream never stops and it hears you stopped), 'send', or 'open' (you just started
 * talking: send what was held back from just before too, so your first word isn't clipped).
 *
 * - The room: the quietest moments of the last 2 s are the room's own sound (music, a fan): steady sound never has the
 *   short dips between words that a voice has. You count only well above it, and only for 0.2 s or more (not a click).
 * - Its own voice (no echo cancelling: that puts Android in call volume): while it plays and just after, the microphone
 *   mostly hears its voice coming back. How loud that is next to what plays is learned the whole time it speaks (the
 *   typical ratio, not the quiet half: a loud phone speaker comes back louder than it was sent). Only a voice far above
 *   that for 0.3 s counts as you talking over it; otherwise it is never sent. (Tapping still stops it at once.)
 */
export interface GateFrame {
  /** loudness (RMS, 0–1) of each few ms of this chunk */ frames: number[];
  /** of the whole chunk */ rms: number;
  /** its own voice: loudness of what played over the last ~0.3 s (0 when nothing did) */ echo: number;
  /** its voice is playing, or just stopped (the room still rings with it) */ talking: boolean;
}
export type GateSay = 'mute' | 'send' | 'open';

export function createMicGate(o: { min?: number; coupling?: number } = {}) {
  const MIN = o.min ?? 0.006; // (−44 dB: under this nothing counts, even in a silent room)
  const HANG = 8; // chunks (0.8 s) it stays open after your voice dips: the pauses between words
  const ring: number[] = []; // the last 2 s of frame loudness (outside its voice)
  let floor = MIN / 4, coupling = o.coupling ?? 3, echoHold = 0;
  let open = 0, loud = 0, barge = 0, over = false;
  const step = (x: GateFrame): GateSay => {
    // the room: its quietest moment of the last 2 s (falls at once, rises slowly)
    if (!x.talking) {
      for (const f of x.frames) ring.push(f);
      if (ring.length > 250) ring.splice(0, ring.length - 250);
      let m = Infinity; for (const f of ring) if (f < m) m = f;
      if (m < Infinity) floor += (m - floor) * (m < floor ? 0.5 : 0.12);
    }
    const start = Math.max(MIN, floor * 8), keep = Math.max(MIN * 0.8, floor * 5);
    if (x.talking) {
      // its voice coming back: learned all along (a typical ratio), held a moment for the room's ring
      echoHold = Math.max(x.echo, echoHold * 0.7);
      if (x.echo > 0.003 && !over) coupling = Math.min(20, Math.max(0.05, coupling * (x.rms / x.echo > coupling ? 1.05 : 0.97)));
      const th = Math.max(MIN * 3, start, echoHold * coupling * 3);
      if (over) { if (x.rms > Math.max(keep, th * 0.5)) open = HANG; else open--; if (open <= 0) { over = false; open = 0; } return over ? 'send' : 'mute'; }
      barge = x.rms > th ? barge + 1 : 0;
      if (barge >= 3) { barge = 0; over = true; open = HANG; loud = 0; return 'open'; }
      open = 0; loud = 0;
      return 'mute';
    }
    over = false; barge = 0; echoHold = 0;
    if (open > 0) { if (x.rms > keep) open = HANG; else open--; return open > 0 ? 'send' : 'mute'; }
    loud = x.rms > start ? loud + 1 : 0;
    if (loud >= 2) { loud = 0; open = HANG; return 'open'; }
    return 'mute';
  };
  return {
    step,
    /** you are being heard right now (or a sound is starting to count as you) */
    get hearing() { return open > 0 || loud > 0 || barge > 0; },
    get floor() { return floor; },
    get coupling() { return coupling; },
  };
}
