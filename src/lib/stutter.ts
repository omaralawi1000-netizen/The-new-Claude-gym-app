import { useUI } from '../state/ui';

/**
 * A stutter recorder for the real phone. Headless traces can't feel what a phone feels; this notes every long animation
 * frame (a frame the screen had to wait for) for five minutes, with where you were and what you last tapped, so a report can
 * be pasted back and the next fix aimed at what actually stuttered. Only timings, screen names and script names — nothing you
 * logged. Off until started; nothing is sent anywhere.
 */
export interface Hitch { at: number; ms: number; block: number; where: string; tap: string; scripts: string[] }

const MAX = 200, DURATION = 5 * 60_000;
let hitches: Hitch[] = [];
let startedAt = 0, stopAt = 0, obs: PerformanceObserver | null = null, timer: ReturnType<typeof setTimeout> | null = null;
let lastTap = '';
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const subscribeStutter = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const stutterState = () => ({ on: !!obs, left: obs ? Math.max(0, stopAt - Date.now()) : 0, count: hitches.length });

const where = () => { const u = useUI.getState(); const top = u.overlays[u.overlays.length - 1]; return top ? `${u.tab} › ${top.type}` : u.tab; };
const onTap = (e: Event) => {
  const el = (e.target as HTMLElement | null)?.closest?.('button, a, input, [role="button"], [aria-label]') as HTMLElement | null;
  lastTap = (el?.getAttribute('aria-label') || el?.textContent || el?.tagName || '').trim().slice(0, 40);
};

export function startStutter() {
  stopStutter();
  hitches = []; startedAt = performance.now(); stopAt = Date.now() + DURATION;
  const type = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
  obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries() as any[]) {
      if (hitches.length >= MAX) break;
      hitches.push({
        at: Math.round((e.startTime - startedAt) / 100) / 10, ms: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0), where: where(), tap: lastTap,
        scripts: (e.scripts ?? []).slice(0, 3).map((x: any) => `${x.invokerType ?? ''}:${String(x.invoker ?? '').slice(0, 40)} ${Math.round(x.duration)}ms ${x.sourceFunctionName || ''} ${String(x.sourceURL || '').split('/').pop()}:${x.sourceCharPosition ?? ''}`.trim()),
      });
    }
    emit();
  });
  try { obs.observe({ type, buffered: false }); } catch { obs = null; return; }
  addEventListener('pointerdown', onTap, true);
  timer = setTimeout(stopStutter, DURATION);
  emit();
}

export function stopStutter() {
  obs?.disconnect(); obs = null;
  if (timer) clearTimeout(timer); timer = null;
  removeEventListener('pointerdown', onTap, true);
  emit();
}

/** The report to paste back: the phone and browser, then each long frame (worst first). */
export function stutterReport(): string {
  const worst = [...hitches].sort((a, b) => b.ms - a.ms);
  return JSON.stringify({
    app: 'Aven', when: new Date().toISOString(), ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, cores: navigator.hardwareConcurrency,
    hitches: hitches.length, over50ms: hitches.filter((h) => h.ms > 50).length, worst,
  }, null, 1);
}
