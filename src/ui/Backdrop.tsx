import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { useVoice } from '../state/voice';
import { onVoiceOut, voiceOutOn } from '../lib/voiceOut';
import { useDaySummary, useToday } from '../lib/derive';
import { loadPhoto, savePhoto, deletePhoto } from '../lib/photos';
import type { Settings } from '../lib/types';

/**
 * The backgrounds you can pick in Settings → Appearance. All but Classic hold completely still: each is a few gradients (or
 * one small picture) painted once, so the frosted tab bar and sheets over them never have to re-blur a moving field. Only
 * Sunrise (when food is logged) and Orb light (when the Coach starts or stops talking) ever change, and then by one slow
 * opacity / transform transition that the browser runs on its compositor.
 */
export type BgKind = NonNullable<Settings['background']>;
export const BG_KINDS: BgKind[] = ['classic', 'orb', 'tabs', 'sunrise', 'mesh', 'dots', 'time', 'night', 'photo'];
/** the backgrounds that take each tab's colours (they cross-fade on a tab switch); the rest look the same on every tab */
export const PER_TAB: Record<BgKind, boolean> = { classic: true, orb: true, tabs: true, sunrise: true, mesh: true, dots: true, time: false, night: false, photo: false };

// ── the clock: Time of day and Night sky ────────────────────

/** Sunrise and sunset in Aarhus for the given day (NOAA's approximation, within a couple of minutes), as timestamps. */
export function sunTimes(d: Date, lat = 56.1567, lon = 10.2108): { rise: number; set: number } {
  const rad = Math.PI / 180;
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
  const g = (2 * Math.PI / 365) * (n - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const c = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, c))) / rad;
  const day0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return { rise: day0 + (720 - 4 * (lon + ha) - eqt) * 60000, set: day0 + (720 - 4 * (lon - ha) - eqt) * 60000 };
}

/**
 * Sky colours through the day (top of the screen, middle, horizon), by local hour, interpolated between these. Two skies:
 * warm (Ember, Sunset: golden evenings) and cool (the others: evenings stay blue and violet, so cards never go muddy
 * brown next to a teal or green accent). Midday is a clean light blue in both, never white (white over dark reads grey).
 */
const SKY_WARM: [number, string, string, string][] = [
  [0, '#0a1238', '#1a1c52', '#2a2462'],
  [4.5, '#0d1640', '#22265e', '#3a2c6a'],
  [6.5, '#284684', '#7466b8', '#ff9c86'],
  [9, '#2f7fd0', '#58bfe4', '#ffd49a'],
  [13, '#2f8ff0', '#5cc8ff', '#86e2ff'],
  [16.5, '#3471c0', '#e2a874', '#ffb466'],
  [19, '#33296f', '#c24f78', '#ff8a3d'],
  [21, '#1a1f5c', '#2c2a6c', '#3e2c70'],
  [22.5, '#101a4c', '#1e2460', '#2a2a6c'],
  [24, '#0a1238', '#1a1c52', '#2a2462'],
];
const SKY_COOL: [number, string, string, string][] = [
  [0, '#0a1440', '#162058', '#1e2a6a'],
  [4.5, '#0d1846', '#1c2862', '#263472'],
  [6.5, '#284a8c', '#5a6cc8', '#b49cf0'],
  [9, '#2a7ad0', '#4cb8e8', '#7ae0f0'],
  [13, '#2f8ff0', '#5cc8ff', '#86e2ff'],
  [16.5, '#2c62c0', '#4a8ee0', '#8ab4ff'],
  [19, '#232a80', '#5a3cb0', '#9a5ce0'],
  [21, '#141e62', '#22307a', '#36408a'],
  [22.5, '#0e1a52', '#18266a', '#223478'],
  [24, '#0a1440', '#162058', '#1e2a6a'],
];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => `rgb(${hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(' ')})`;
export const warmSky = (palette: string) => palette === 'ember' || palette === 'sunset';
export function skyAt(hour: number, warm = true): { top: string; mid: string; low: string; bright: number } {
  const SKY = warm ? SKY_WARM : SKY_COOL;
  let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= hour) i++;
  const [h0, ...a] = SKY[i], [h1, ...b] = SKY[i + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  // how bright the sky is: 0 at night, 1 at midday (dims the layer at night so it reads as a deep sky, not a wash)
  const bright = Math.max(0, Math.sin(((hour - 5) / 17) * Math.PI));
  return { top: mix(a[0], b[0], t), mid: mix(a[1], b[1], t), low: mix(a[2], b[2], t), bright };
}

/**
 * The time the sky shows, in quarter hours. It moves on only when you come back to the app, or every 15 minutes while
 * nothing is open, so the sky never changes while anything moves (the change itself is one slow cross-fade).
 */
export function useSkyClock(on: boolean): { hour: number; night: boolean; key: string } {
  const read = () => {
    const d = new Date();
    const q = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) / 4;
    const s = sunTimes(d);
    const night = d.getTime() < s.rise || d.getTime() > s.set;
    return { hour: q, night, key: `${q}:${night ? 'n' : 'd'}` };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    if (!on) return;
    const upd = () => { const n = read(); setV((o) => (o.key === n.key ? o : n)); };
    upd();
    const vis = () => { if (document.visibilityState === 'visible') upd(); };
    document.addEventListener('visibilitychange', vis);
    const id = setInterval(() => { if (!document.querySelector('.app[data-calm]')) upd(); }, 15 * 60000);
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(id); };
  }, [on]);
  return v;
}

// ── Orb light: is the Coach talking? ────────────────────────

/** True while the Coach (or the orb screen) is working on an answer or reading one aloud. */
export function useTalking(): boolean {
  const thinking = useVoice((v) => v.phase === 'processing');
  const speaking = useSyncExternalStore(onVoiceOut, voiceOutOn, () => false);
  return thinking || speaking;
}

// ── Sunrise: how full is the day? ───────────────────────────

/** 0..1: today's calories and protein against their goals (the average of the two; one if only one goal is set). */
export function useDayFill(): number {
  const today = useToday();
  const { sum } = useDaySummary(today);
  const goals = useStore((s) => s.settings.goals);
  const parts: number[] = [];
  if (goals.kcal) parts.push(Math.min(1, (sum.totals.kcal ?? 0) / goals.kcal));
  if (goals.protein) parts.push(Math.min(1, (sum.totals.protein ?? 0) / goals.protein));
  if (!parts.length) parts.push(Math.min(1, (sum.totals.kcal ?? 0) / 2400));
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 100;
}

// ── Your photo ──────────────────────────────────────────────

/** The background photo lives in this phone's IndexedDB (with the progress photos), already blurred; it is never uploaded. */
const PHOTO_ID = 'aven-bg';
let photoUrl: string | null = null;
let photoLoaded = false;
const photoSubs = new Set<() => void>();
const setUrl = (u: string | null) => { if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = u; photoSubs.forEach((f) => f()); };
function loadOnce() {
  if (photoLoaded) return; photoLoaded = true;
  loadPhoto(PHOTO_ID).then((b) => { if (b) setUrl(URL.createObjectURL(b)); }).catch(() => {});
}
export function useBgPhoto(): string | null {
  return useSyncExternalStore((f) => { loadOnce(); photoSubs.add(f); return () => { photoSubs.delete(f); }; }, () => photoUrl, () => null);
}
/**
 * Blur the picked photo ONCE, here, into a small picture the size of a phone screen's shape: the screen then only scales a
 * still image up (soft anyway), and nothing is ever blurred live. Re-encoding also drops the photo's location data.
 */
export async function setBgPhoto(file: File): Promise<void> {
  const bmp = await createImageBitmap(file);
  const W = 240, H = 520;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const k = Math.max(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
  const pad = 40; // drawn a little past the edges, so the blur doesn't fade out at the sides
  if (typeof (g as { filter?: unknown }).filter === 'string') {
    g.filter = 'blur(16px) saturate(1.1)';
    g.drawImage(bmp, (W - w) / 2 - pad, (H - h) / 2 - pad, w + pad * 2, h + pad * 2);
  } else {
    // no canvas filter: shrink it to a few dozen pixels and scale back up, which blurs it just as softly
    const s = document.createElement('canvas'); s.width = 30; s.height = 65;
    s.getContext('2d')!.drawImage(bmp, (30 - w / 10) / 2, (65 - h / 10) / 2, w / 10, h / 10);
    g.imageSmoothingQuality = 'high'; g.drawImage(s, 0, 0, W, H);
  }
  bmp.close?.();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.9));
  await savePhoto(PHOTO_ID, blob);
  photoLoaded = true;
  setUrl(URL.createObjectURL(blob));
}
export async function clearBgPhoto() { await deletePhoto(PHOTO_ID).catch(() => {}); setUrl(null); }

// ── Dot field and stars: small pictures made once ───────────

/** A grid of dots that shrink and fade toward the bottom, like the orb's dot sphere seen from close by. */
function dotsSvg(color: string): string {
  const step = 14, cols = 29, rows = 40;
  let d = '';
  for (let r = 0; r < rows; r++) {
    const k = 1 - r / rows;
    const rad = (0.28 + 0.7 * Math.pow(k, 0.9)).toFixed(2), op = (0.5 * Math.pow(k, 1.8)).toFixed(3);
    for (let c = 0; c < cols; c++) d += `<circle cx='${c * step + 7}' cy='${r * step + 7}' r='${rad}' fill-opacity='${op}'/>`;
  }
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${cols * step}' height='${rows * step}' fill='${color}'>${d}</svg>`)}")`;
}
/** A still night sky: about seventy faint stars, more of them high up, a handful a little brighter. Same sky every night. */
const STARS = (() => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = 400, H = 860; let d = '';
  const tints = ['#ffffff', '#ffffff', '#ffffff', '#d6e4ff', '#ffe9cf'];
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W, y = Math.pow(rnd(), 2) * H * 0.78;
    const big = rnd() > 0.93;
    const r = big ? 0.8 + rnd() * 0.35 : 0.3 + rnd() * 0.45;
    const op = (big ? 0.85 : 0.2 + rnd() * 0.45) * (1 - (y / H) * 0.9);
    const fill = tints[Math.floor(rnd() * tints.length)];
    d += `<circle cx='${x.toFixed(1)}' cy='${y.toFixed(1)}' r='${r.toFixed(2)}' fill='${fill}' fill-opacity='${op.toFixed(2)}'/>`;
  }
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>${d}</svg>`)}")`;
})();

/** The dot colour: the area's accent lifted toward white (dark) or deepened (light), read once from the element's own colours. */
function useDots(ref: React.RefObject<HTMLElement | null>, on: boolean): string | undefined {
  const theme = useStore((s) => s.settings.theme);
  const palette = useStore((s) => s.settings.palette);
  const [img, setImg] = useState<string>();
  useLayoutEffect(() => {
    if (!on || !ref.current) return;
    const ac = getComputedStyle(ref.current).getPropertyValue('--ac').trim() || '#ff7a59';
    const light = document.documentElement.dataset.theme === 'light';
    const [r, g, b] = ac.startsWith('#') && ac.length === 7 ? hex(ac) : [255, 122, 89];
    const m = (v: number) => Math.round(light ? v * 0.55 : v + (255 - v) * 0.45);
    setImg(dotsSvg(`rgb(${m(r)},${m(g)},${m(b)})`));
  }, [on, theme, palette, ref]);
  return img;
}

// ── the layer itself ────────────────────────────────────────

/** The inside of one background layer (App's Field cross-fades these; Settings shows each one small). */
export function BgBody({ kind, preview, fill: fixedFill, sky }: { kind: BgKind; preview?: boolean; fill?: number; sky?: { hour: number; night: boolean } }) {
  if (kind === 'classic') return <><i /><i /><i /></>;
  if (kind === 'sunrise') return preview ? <Sunrise fill={fixedFill ?? 0.6} /> : <LiveSunrise />;
  if (kind === 'orb') return preview ? <Orb talk={false} /> : <LiveOrb />;
  if (kind === 'tabs') return <b className="bg-tabs" />;
  if (kind === 'mesh') return <b className="bg-mesh" />;
  if (kind === 'dots') return <Dots />;
  if (kind === 'time') return <Sky hour={sky?.hour ?? new Date().getHours()} />;
  if (kind === 'night') return <Night night={sky?.night ?? true} />;
  return <Photo />;
}

function LiveSunrise() { return <Sunrise fill={useDayFill()} />; }
function Sunrise({ fill }: { fill: number }) {
  return <><b className="bg-sun-sky" /><b className="bg-sun" style={{ ['--fill' as string]: fill }} /></>;
}
function LiveOrb() {
  const coach = useUI((u) => u.overlays.some((o) => o.type === 'coach'));
  return <Orb talk={useTalking()} coach={coach} spot={useOrbSpot(coach)} />;
}
type Spot = { x: number; y: number } | null;
/**
 * The centre of the orb that is showing (the dock's, or the Coach's while it is open), in px from the screen's top left. It
 * is read from the layout (offsets), not from where it is drawn right now, so a sheet still sliding up or the dock still
 * gliding doesn't send the light somewhere on the way: it heads for where the orb comes to rest.
 */
function orbSpot(coach: boolean): Spot {
  if (typeof document === 'undefined') return null;
  const orb = (coach ? document.querySelector('.coach-composer .voice-ring')?.parentElement : document.querySelector('.tabbar .sphere-slot')) as HTMLElement | null | undefined;
  if (!orb || !orb.offsetWidth) return null;
  let x = orb.offsetWidth / 2, y = orb.offsetHeight / 2;
  for (let e: HTMLElement | null = orb; e; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft - (e === orb ? 0 : e.scrollLeft); y += e.offsetTop - (e === orb ? 0 : e.scrollTop); }
  return { x: Math.round(x), y: Math.round(y) };
}
/** follows the orb: measured when the Coach opens or closes (again once its sheet has settled) and when the screen resizes */
function useOrbSpot(coach: boolean): Spot {
  const [spot, setSpot] = useState<Spot>(() => orbSpot(coach));
  useEffect(() => {
    const m = () => { const s = orbSpot(coach); if (s) setSpot((p) => (p && p.x === s.x && p.y === s.y ? p : s)); };
    const raf = requestAnimationFrame(m), t1 = setTimeout(m, 450), t2 = setTimeout(m, 1000);
    const vv = window.visualViewport;
    window.addEventListener('resize', m); vv?.addEventListener('resize', m);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); window.removeEventListener('resize', m); vv?.removeEventListener('resize', m); };
  }, [coach]);
  return spot;
}
/**
 * The orb's light: a halo centred on the orb, with a beam rising from it. When the Coach opens, the light glides over to
 * the Coach's orb (bottom-left) in one slow transform while the beam fades; while the Coach answers, a brighter copy of
 * the halo fades in on top. Nothing is redrawn: the layers only move and fade.
 */
function Orb({ talk, coach = false, spot = null }: { talk: boolean; coach?: boolean; spot?: Spot }) {
  const at = spot ? { ['--ox' as string]: `${spot.x}px`, ['--oy' as string]: `${spot.y}px` } : undefined;
  return (
    <b className="bg-orb-all" style={at}>
      <i className={`bg-orb${coach ? ' away' : ''}`} /><i className={`bg-orb-lit${talk && !coach ? ' on' : ''}`} />
      <i className="bg-orb-spot"><i /><i className={talk ? 'on' : ''} /></i>
    </b>
  );
}
function Dots() {
  const ref = useRef<HTMLElement>(null);
  const img = useDots(ref, true);
  return <><b className="bg-dots-wash" /><b ref={ref} className="bg-dots" style={img ? { backgroundImage: img } : undefined} /></>;
}
function Sky({ hour }: { hour: number }) {
  const warm = warmSky(useStore((x) => x.settings.palette));
  const s = useMemo(() => skyAt(hour, warm), [hour, warm]);
  return <b className="bg-sky" style={{ ['--sk1' as string]: s.top, ['--sk2' as string]: s.mid, ['--sk3' as string]: s.low, ['--skb' as string]: s.bright.toFixed(2) }} />;
}
function Night({ night }: { night: boolean }) {
  const warm = warmSky(useStore((x) => x.settings.palette));
  return night ? <><b className="bg-night" /><b className="bg-milky" /><b className="bg-stars" style={{ backgroundImage: STARS }} /></> : <b className={`bg-dusk${warm ? ' warm' : ''}`} />;
}
function Photo() {
  const url = useBgPhoto();
  return <><b className="bg-photo" style={url ? { backgroundImage: `url("${url}")` } : undefined} /><b className="bg-photo-dim" /></>;
}
