import { memo, useEffect, useRef, useState } from 'react';
import type { Exercise } from '../../lib/types';

/**
 * Aven's 3D figures: our own clay body doing the exercise, the worked muscles glowing. Each clip is rendered offline
 * (scripts in the premium pass), one 2.8 s rep as a small see-through WebM (VP9 with alpha, about 90 KB), so the phone
 * only plays a video: nothing is drawn per frame on the page.
 *
 * Clips are fetched the first time they're needed (or ahead, for the exercises in today's workout), kept by the service
 * worker for offline use, and handed to the <video> as a blob so it never has to stream. The glow is rendered in one warm
 * colour and turned to each look's training colour with a CSS filter (styles.css, .fgc); the clay is neutral grey, so
 * only the glow changes.
 */

// bump when clips are re-rendered, so phones fetch the new ones instead of the cached copies
const V = 1;
const CLIPS = new Set([
  // chest and pressing
  'bench-press', 'db-bench-press', 'smith-bench-press', 'close-grip-bench', 'smith-close-grip-bench', 'db-floor-press',
  'incline-bench-press', 'incline-db-press', 'smith-incline-press', 'decline-bench-press', 'decline-db-press', 'smith-decline-press',
  'machine-chest-press', 'incline-machine-press', 'db-fly', 'incline-db-fly', 'chest-fly-cable', 'low-cable-fly', 'high-cable-fly',
  'pec-deck', 'reverse-pec-deck', 'push-up', 'incline-push-up', 'decline-push-up', 'diamond-push-up', 'pike-push-up',
  'dip', 'assisted-dip', 'machine-dip', 'bench-dip', 'overhead-press', 'push-press', 'kb-press', 'landmine-press',
  'db-shoulder-press', 'arnold-press', 'smith-shoulder-press', 'machine-shoulder-press',
]);

export const hasClip = (ex: Exercise | undefined): boolean => !!ex && !ex.custom && CLIPS.has(ex.id);

const urls = new Map<string, Promise<string>>();
/** the clip as a blob URL (fetched once per app run; the service worker keeps it across runs) */
function load(id: string): Promise<string> {
  let u = urls.get(id);
  if (!u) {
    u = fetch(`${import.meta.env.BASE_URL}figures/${id}.webm?v=${V}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    u.catch(() => urls.delete(id)); // a failed fetch (offline, first time) is tried again next time
    urls.set(id, u);
  }
  return u;
}
/** fetch the clips for these exercises ahead of time (today's workout), quietly */
export function prefetchClips(ids: string[]) {
  for (const id of ids) if (CLIPS.has(id)) load(id).catch(() => {});
}

const reduced = () => document.documentElement.dataset.motion === 'reduce'
  || (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** the exercise's clip; `fallback` shows if it can't load or play. Only plays while `active` (the page you're on). */
export const FigureClip = memo(function FigureClip({ ex, active, fallback }: { ex: Exercise; active: boolean; fallback: React.ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let live = true;
    setSrc(null); setShown(false); setFailed(false);
    load(ex.id).then((u) => { if (live) setSrc(u); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [ex.id]);
  useEffect(() => {
    const v = vid.current; if (!v || !src) return;
    if (active && !reduced()) v.play().catch(() => {});
    else { v.pause(); v.currentTime = 0; }
  }, [active, src]);
  if (failed) return <>{fallback}</>;
  return (
    <video ref={vid} className={`fgc${shown ? ' on' : ''}`} src={src ?? undefined} muted playsInline loop preload="auto"
      disablePictureInPicture disableRemotePlayback aria-hidden
      onLoadedData={() => setShown(true)} onError={() => setFailed(true)} />
  );
});
