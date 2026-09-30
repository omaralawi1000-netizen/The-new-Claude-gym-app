import { useEffect, useState } from 'react';
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
