import { cancelFrame, frame } from 'motion/react';
import { useUI } from '../state/ui';
import { highRefresh } from '../ui/motion';

/** Temporary phone diagnostics for the Coach/orb freeze. Only fixed event names, timings and geometry; no app data. */
const KEY = 'aven.coachTrace';
interface TraceEvent {
  event: 'open' | 'close' | 'sample' | 'error'; screen: 'coach' | 'voice'; at: number;
  highRefresh?: boolean;
  rafAge?: number; motionAge?: number; hidden?: boolean;
  surfaces?: { kind: 'coach' | 'voice'; top: number; height: number }[]; scrims?: number;
  error?: { name: string; file: string; line: number; column: number };
}
interface Trace { version: string; when: string; highRefresh: boolean; events: TraceEvent[] }
export function coachTrace(): Trace | null {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v?.version && Array.isArray(v.events) ? v : null; }
  catch { return null; }
}

export function installCoachTrace(): () => void {
  let trace = coachTrace();
  let current: { id: string; screen: 'coach' | 'voice' } | null = null;
  let screen: 'coach' | 'voice' = 'coach', running = false, raf = 0;
  let rafAt = 0, motionAt = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const save = (e: Omit<TraceEvent, 'screen' | 'at'>) => {
    if (!trace) return;
    trace.events.push({ ...e, screen, at: Math.round(performance.now()) });
    trace.events = trace.events.slice(-32);
    try { sessionStorage.setItem(KEY, JSON.stringify(trace)); } catch { /* diagnostics must never interrupt the app */ }
  };
  const browserFrame = () => { rafAt = performance.now(); if (running) raf = requestAnimationFrame(browserFrame); };
  const motionFrame = () => { motionAt = performance.now(); };
  const stop = () => {
    running = false; cancelAnimationFrame(raf); cancelFrame(motionFrame);
    timers.forEach(clearTimeout); timers = [];
  };
  const sample = () => {
    const now = performance.now();
    const surfaces = [...document.querySelectorAll<HTMLElement>('.sheet:has(.coach-body), .voice[role="dialog"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { kind: el.classList.contains('voice') ? 'voice' as const : 'coach' as const, top: Math.round(r.top), height: Math.round(r.height) };
    });
    save({ event: 'sample', rafAge: Math.round(now - rafAt), motionAge: Math.round(now - motionAt), hidden: document.hidden, surfaces, scrims: document.querySelectorAll('.scrim').length });
  };
  const changed = () => {
    const ov = useUI.getState().overlays.filter((o) => o.type === 'coach' || o.type === 'voice').at(-1);
    if ((ov?.id ?? null) === (current?.id ?? null)) return;
    stop();
    if (ov) {
      current = { id: ov.id, screen: ov.type as 'coach' | 'voice' }; screen = current.screen;
      if (!trace || trace.version !== __APP_VERSION__) trace = { version: __APP_VERSION__, when: new Date().toISOString(), highRefresh: highRefresh(), events: [] };
      trace.highRefresh = highRefresh();
      save({ event: 'open', highRefresh: trace.highRefresh });
    } else { current = null; save({ event: 'close' }); }
    running = true; rafAt = motionAt = performance.now();
    raf = requestAnimationFrame(browserFrame); frame.postRender(motionFrame, true);
    timers = [setTimeout(sample, 250), setTimeout(sample, 1600), setTimeout(() => { sample(); stop(); }, 2400)];
  };
  const onError = (e: ErrorEvent) => {
    if (!running) return;
    // Never persist an error message or arbitrary stack: either can contain dictated text or a request URL with a key.
    const name = String(e.error?.name ?? 'Error');
    const file = String(e.filename ?? '').split(/[?#]/)[0].split('/').pop() ?? '';
    save({ event: 'error', error: { name: /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error', file: /^[\w.-]+\.(?:m?js|tsx?)$/.test(file) ? file : '', line: e.lineno, column: e.colno } });
  };
  const off = useUI.subscribe((s, p) => { if (s.overlays !== p.overlays) changed(); });
  window.addEventListener('error', onError); changed();
  return () => { stop(); off(); window.removeEventListener('error', onError); };
}
