import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

export function useNow(ms = 500, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** Short chime + vibration when a rest timer ends. Respects the sound / haptics settings. */
export function restEndedCue() {
  const { sound, haptics } = useStore.getState().settings;
  try { if (haptics && 'vibrate' in navigator) navigator.vibrate([90, 60, 90]); } catch { /* ignore */ }
  if (!sound) return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    const t0 = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    o.start(t0); o.stop(t0 + 0.45);
    o.onended = () => ctx.close().catch(() => {});
  } catch { /* ignore */ }
}

/**
 * Long lists in a popup: the first rows are drawn at once, the rest follow in small batches while the popup's opening
 * slide runs (and stop being a problem for the main thread, which a 200-row list mounted in one go was). A new list
 * (a search, a filter) starts again from the first rows.
 */
export function useProgressive<T>(items: T[], first = 14, step = 30): T[] {
  const [n, setN] = useState(first);
  const last = useRef(items);
  if (last.current !== items) { last.current = items; if (n !== first) setN(first); }
  useEffect(() => {
    if (n >= items.length) return;
    const id = setTimeout(() => setN((v) => v + step), n === first ? 380 : 90); // the first batch waits for the slide
    return () => clearTimeout(id);
  }, [n, items, first, step]);
  return n >= items.length ? items : items.slice(0, n);
}
