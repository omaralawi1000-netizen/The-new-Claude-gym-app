import { useUI } from '../state/ui';
import { coachTrace } from './coachTrace';

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
  hitches = []; moves = []; moveN = 0; startedAt = performance.now(); stopAt = Date.now() + DURATION;
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

// ── the workout window's moves, frame by frame ──
// A long-frame observer only sees the main thread; a phone that can't draw a frame in time (the GPU) shows up instead as
// gaps between animation frames. So while recording, each open and close of the workout window samples its frames for
// 1.3 s. Every move is drawn one of a few ways in turn (`VARIANTS`, styles.css :root[data-perf]), each leaving out one
// suspect cost, so a report from the real phone says which one the lag is made of.
export interface Move { kind: string; variant: string; frames: number; late12: number; late20: number; worst: number; /** the first frame after the tap (setup and the first drawing) */ first: number }
const VARIANTS = ['asis', 'nomask', 'noround', 'noblur', 'nopage'];
let moves: Move[] = [], moveN = 0, moveRaf = 0;
export function noteMove(kind: string) {
  if (!obs || moves.length >= 120) return;
  cancelAnimationFrame(moveRaf);
  const variant = VARIANTS[moveN++ % VARIANTS.length], root = document.documentElement;
  root.dataset.perf = variant;
  const t0 = performance.now(), gaps: number[] = [];
  let last = t0;
  const step = (t: number) => {
    gaps.push(t - last); last = t;
    if (t - t0 < 1300) { moveRaf = requestAnimationFrame(step); return; }
    if (root.dataset.perf === variant) delete root.dataset.perf;
    const g = gaps.slice(1);
    moves.push({ kind, variant, frames: g.length, late12: g.filter((x) => x > 12).length, late20: g.filter((x) => x > 20).length, worst: Math.round(Math.max(0, ...g)), first: Math.round(g[0] ?? 0) });
    emit();
  };
  moveRaf = requestAnimationFrame(step);
}

/** The report to paste back: the phone and browser, then each long frame (worst first). */
export function stutterReport(): string {
  const worst = [...hitches].sort((a, b) => b.ms - a.ms);
  return JSON.stringify({
    app: 'Aven', when: new Date().toISOString(), ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`, cores: navigator.hardwareConcurrency,
    moves: summary(), movesRaw: moves, hitches: hitches.length, over50ms: hitches.filter((h) => h.ms > 50).length, worst, coachOrb: coachTrace(),
  }, null, 1);
}

/** Per way of drawing: the moves' frames on average (a 120 Hz screen draws about 155 in 1.3 s). */
function summary() {
  const out: Record<string, string> = {};
  for (const v of VARIANTS) {
    const m = moves.filter((x) => x.variant === v); if (!m.length) continue;
    const avg = (k: keyof Move) => Math.round(m.reduce((s, x) => s + (x[k] as number), 0) / m.length);
    out[v] = `${m.length} moves: ${avg('frames')} frames, ${avg('late12')} late (>12 ms), ${avg('late20')} very late (>20 ms), worst ${Math.max(...m.map((x) => x.worst))} ms, first frame ${avg('first')} ms`;
  }
  return out;
}
