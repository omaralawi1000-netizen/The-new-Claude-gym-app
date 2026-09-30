/**
 * Single microphone owner.
 * - Only one owner can hold the mic at a time; acquiring while held by another owner is refused ("busy").
 * - release() stops every track, disconnects the analyser and closes the AudioContext.
 * - The level / bands are the REAL input signal. If the mic isn't running, level() is 0 and active is false —
 *   the UI must not pretend to be listening.
 */
export type MicFail = 'unsupported' | 'denied' | 'busy' | 'nodevice' | 'error';
export type MicResult = { ok: true } | { ok: false; reason: MicFail };

class MicManager {
  private owner: string | null = null;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private time: Uint8Array<ArrayBuffer> | null = null;
  private smooth = 0;
  private token = 0;
  private listeners = new Set<() => void>();
  readonly bandCount = 16;
  private bandsOut = new Float32Array(16);

  get active() { return !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live'); }
  get ownedBy() { return this.owner; }
  get supported() { return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((l) => l()); }

  async acquire(owner: string): Promise<MicResult> {
    if (!this.supported) return { ok: false, reason: 'unsupported' };
    if (this.owner && this.owner !== owner) return { ok: false, reason: 'busy' };
    if (this.owner === owner && this.active) return { ok: true };
    this.owner = owner;
    const my = ++this.token;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      // released (or superseded) while the permission prompt was open → drop the stream immediately
      if (this.owner !== owner || my !== this.token) { stream.getTracks().forEach((t) => t.stop()); return { ok: false, reason: 'busy' }; }
      this.stream = stream;
      stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => { if (this.stream === stream) this.release(owner); }));
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
        const src = this.ctx.createMediaStreamSource(stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.72;
        src.connect(this.analyser);
        this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
        this.time = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      }
      this.emit();
      return { ok: true };
    } catch (e: any) {
      if (this.owner === owner) this.owner = null;
      const n = e?.name;
      this.emit();
      if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return { ok: false, reason: 'denied' };
      if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return { ok: false, reason: 'nodevice' };
      return { ok: false, reason: 'error' };
    }
  }

  release(owner?: string) {
    if (owner && this.owner !== owner) return;
    this.token++;
    this.stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
    this.stream = null;
    try { this.analyser?.disconnect(); } catch { /* ignore */ }
    this.analyser = null;
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {});
    this.ctx = null;
    this.freq = null; this.time = null;
    this.smooth = 0;
    this.bandsOut.fill(0);
    this.owner = null;
    this.emit();
  }

  /** Smoothed RMS 0..1 of the live input (0 if not running). */
  level(): number {
    if (!this.analyser || !this.time) return 0;
    this.analyser.getByteTimeDomainData(this.time);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) { const v = (this.time[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / this.time.length);
    const target = Math.min(1, rms * 5.2);
    this.smooth += (target - this.smooth) * (target > this.smooth ? 0.5 : 0.14);
    return this.smooth;
  }

  /** 16 log-ish frequency bands 0..1 of the live input. */
  bands(): Float32Array {
    if (!this.analyser || !this.freq) return this.bandsOut;
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    for (let b = 0; b < this.bandCount; b++) {
      const lo = Math.floor(Math.pow(b / this.bandCount, 1.7) * n * 0.6) + 1;
      const hi = Math.max(lo + 1, Math.floor(Math.pow((b + 1) / this.bandCount, 1.7) * n * 0.6) + 1);
      let s = 0;
      for (let i = lo; i < hi; i++) s += this.freq[i];
      const v = s / (hi - lo) / 255;
      this.bandsOut[b] += (v - this.bandsOut[b]) * 0.45;
    }
    return this.bandsOut;
  }
}

export const mic = new MicManager();

if (typeof document !== 'undefined') {
  // never keep the microphone while the app is in the background
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') mic.release(); });
  window.addEventListener('pagehide', () => mic.release());
}
