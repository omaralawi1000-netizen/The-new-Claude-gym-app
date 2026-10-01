import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { orbStats } from './Sphere';

/**
 * A frame-rate readout for finding out what your phone and browser really give the app (Settings → Appearance → Frame rate
 * readout). It runs its own requestAnimationFrame loop and shows, once a second: the refresh rate the browser is delivering
 * (from the median gap between frames), how many frames arrived, and how many were late. A steady "120 Hz" with no late
 * frames is the best case; a steady "60 Hz" with no late frames means the browser or the phone is capping the rate (not the
 * app being slow); "late" frames mean the app itself missed its deadline. The second line is the orb's own drawing rate and
 * where it is drawn (its own thread with high refresh rate on). Off by default; costs nothing when off.
 */
const KEY = 'aven.fps';
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setFpsMeter = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } listeners.forEach((l) => l()); };
export const useFpsMeterOn = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => false);

export function FpsMeter() {
  const on = useFpsMeterOn();
  const [view, setView] = useState({ hz: 0, fps: 0, late: 0, worst: 0, orb: 0, off: false });
  const raf = useRef(0);
  useEffect(() => {
    if (!on) return;
    let last = performance.now(), windowStart = last;
    let gaps: number[] = [];
    const tick = (t: number) => {
      gaps.push(t - last); last = t;
      if (t - windowStart >= 1000) {
        const sorted = [...gaps].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)] || 16.7;
        const hz = 1000 / med;
        const late = gaps.filter((g) => g > med * 1.5).length;
        setView({ hz: Math.round(hz / 5) * 5, fps: Math.round((gaps.length * 1000) / (t - windowStart)), late, worst: Math.round(Math.max(...gaps)), orb: orbStats.fps, off: orbStats.offThread });
        gaps = []; windowStart = t;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [on]);
  if (!on) return null;
  const good = view.late === 0;
  return (
    <div aria-hidden style={{ position: 'fixed', left: 8, top: 'calc(var(--sat) + 4px)', zIndex: 2000, pointerEvents: 'none', padding: '4px 8px', borderRadius: 10, font: '600 11px/1.3 ui-monospace, monospace', background: 'rgba(0,0,0,.72)', color: good ? '#8CF5B0' : '#FFD479', fontVariantNumeric: 'tabular-nums' }}>
      {view.hz || '…'} Hz · {view.fps} fps · {view.late} late · max {view.worst} ms
      <br />orb {view.orb || '…'} fps · {view.off ? 'own thread' : 'page'}
    </div>
  );
}
