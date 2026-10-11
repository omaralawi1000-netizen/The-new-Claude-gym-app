import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, usePresence, usePresenceData } from 'motion/react';
import { useStore } from './state/store';
import { useUI } from './state/ui';
import { TabBar } from './ui/TabBar';
import { Toaster } from './ui/Toaster';
import { SphereStage } from './ui/Sphere';
import { Overlays } from './screens/Overlays';
import { useRestCue } from './screens/workout/rest';
import { useKeepStorage } from './lib/persist';
import { useDriveAuto } from './screens/DriveBackup';
import { TodayScreen } from './screens/Today';
import { TrainScreen } from './screens/Train';
import { FoodScreen } from './screens/Food';
import { ProgressScreen } from './screens/Progress';
import { useT } from './lib/i18n';
import { registerSW } from './pwa';
import { dayKey } from './lib/dates';
import { defaultMealId } from './lib/derive';
import { stageCover, stageDepth, stageTransform } from './ui/engage';
import { barColor, readRGB, setBarDepth, setBarTint } from './ui/statusBar';
import { setKeyboard } from './ui/keyboard';
import { FpsMeter } from './ui/FpsMeter';

/** Where the last tap landed — the theme switch spreads out from there. */
const lastTap = { x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: 0 };
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { lastTap.x = e.clientX; lastTap.y = e.clientY; }, { capture: true, passive: true });

/**
 * Keep the screen on while a workout is running (and not paused): the phone no longer locks between sets. The browser
 * drops the lock whenever the app is hidden, so it is taken again when you come back.
 */
function useWakeLock() {
  const on = useStore((s) => !!s.active && !s.active.pausedAt);
  useEffect(() => {
    const wl = (navigator as any).wakeLock as { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } | undefined;
    if (!on || !wl) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const take = () => { if (document.visibilityState === 'visible') wl.request('screen').then((l) => { if (alive) lock = l; else l.release().catch(() => {}); }).catch(() => {}); };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { alive = false; document.removeEventListener('visibilitychange', take); lock?.release().catch(() => {}); };
  }, [on]);
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const motionPref = useStore((s) => s.settings.motion);
  const lang = useStore((s) => s.settings.language);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      const next = dark ? 'dark' : 'light';
      const set = () => {
        root.dataset.theme = next;
      };
      try { localStorage.setItem('aven.theme', theme); } catch { /* ignore */ }
      // switching while the app is open: the new theme spreads out as a circle from where you tapped (View Transitions);
      // on first paint, with reduced motion, or where unsupported it simply switches
      const prev = root.dataset.theme;
      const still = root.dataset.motion === 'reduce' || (root.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      const vt = (document as any).startViewTransition as undefined | ((cb: () => void) => { ready: Promise<void> });
      if (!prev || prev === next || still || !vt) { set(); return; }
      const { x, y } = lastTap;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      try {
        const t = vt.call(document, set);
        t.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
      } catch { set(); }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { root.dataset.motion = motionPref === 'system' ? (mq.matches ? 'reduce' : 'system') : motionPref; };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [motionPref]);
  const palette = useStore((x) => x.settings.palette);
  useLayoutEffect(() => { document.documentElement.dataset.palette = palette; }, [palette]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
}

/**
 * iOS-style: while a popup is up the page behind steps back (smaller, rounded corners, over black). It is driven by
 * the popups' own progress (stageDepth, see engage.ts) in the same animation frame, so it follows the popup exactly:
 * opening, under the finger while it is dragged, and as it leaves.
 */
/**
 * Switching tabs.
 *
 * It starts from the new screen's first painted frame, not from the tap. Building a screen blocks the page for a moment (a
 * long one on a phone); anything that started at the tap had run part-way by the time it was drawn — the jump seen as
 * flicker. So the tap changes the tab, the new screen is built hidden while the old one stays fully up, and two frames after
 * it has been painted the gate opens and everything starts in that same instant, from one callback (never one render later,
 * which left blank frames between the screens on a busy phone):
 *  - the old screen fades out quickly (it never overlaps the new one for long: both are see-through over the glow);
 *  - the new screen is there at once and its cards rise in one after another (`.screen > *` in styles.css), with a small
 *    slide from the side its tab sits on;
 *  - the glow cross-fades to the new area's colours (Field). Fades are short so that fast tapping never stacks several
 *    full-screen glow layers — that kept the GPU loaded, the phone warmed up and the frame rate fell the longer you switched.
 * All of it is browser-run (opacity / transform), drawn on the compositor at the screen's full rate.
 */
const gate = { open: true, ready: Promise.resolve(), release: () => {} };
function closeGate() {
  if (!gate.open) return; // already waiting: the pending release covers this switch too
  gate.open = false;
  gate.ready = new Promise<void>((res) => { gate.release = () => { gate.open = true; res(); }; });
}
const still = () => document.documentElement.dataset.motion === 'reduce';
const GLOW_MS = 450;
const OUT_MS = 120;
const SLIDE_MS = 420;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Enter and leave for one switch layer. `enter` runs when the gate opens (straight away if no switch is waiting); `leave`
 * runs when AnimatePresence removes the layer, also from the gate, and the layer is dropped when it has finished. If the tab
 * comes back first (tapped again mid-switch) the leave is cancelled, which puts the layer straight back.
 */
function useSwitchLayer(ref: React.RefObject<HTMLElement | null>, enter: (el: HTMLElement, waited: boolean) => void, leave: (el: HTMLElement) => Animation) {
  const waited = useRef(!gate.open); // decided by the render that built this layer
  const [present, safeToRemove] = usePresence();
  const leaving = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    if (!waited.current) { enter(el, false); return; }
    el.style.opacity = '0'; // hidden while it is built and painted the first time
    let alive = true;
    gate.ready.then(() => { if (alive) { el.style.opacity = ''; enter(el, true); } });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (present) { leaving.current?.cancel(); leaving.current = null; if (ref.current) ref.current.style.display = ''; return; }
    let alive = true;
    gate.ready.then(() => {
      const el = ref.current;
      if (!alive || !el) return;
      const a = leave(el); leaving.current = a;
      // Hidden the moment it has faded: AnimatePresence only removes leaving layers once ALL of them are done, so while you
      // keep switching, faded layers (full-screen, still drifting) piled up and were all still drawn every frame.
      a.finished.then(() => { if (alive) { el.style.display = 'none'; safeToRemove?.(); } }, () => { /* cancelled: it came back */ });
    });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [present]);
}

let fieldSeq = 0;
/** Glow layers still fading out: when another switch starts they finish four times faster, so tapping quickly through the
 *  tabs leaves at most about two full-screen layers drawn at once. */
const fading = new Set<Animation>();
function fadeGlow(el: HTMLElement): Animation {
  for (const o of fading) o.updatePlaybackRate(4);
  // the old one goes a little later than the new one comes, so the light never dips
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: GLOW_MS, delay: 60, easing: 'cubic-bezier(0.55, 0, 0.75, 1)', fill: 'forwards' });
  fading.add(a);
  const done = () => fading.delete(a);
  a.finished.then(done, done);
  return a;
}
function Field({ hue }: { hue: string }) {
  // every field drifts on the same clock, so the new one lines up with the old one and only its colours change
  const drift = useRef(`-${Math.round(performance.now())}ms`);
  const z = useRef(++fieldSeq);
  const ref = useRef<HTMLDivElement>(null);
  useSwitchLayer(ref,
    (el, waited) => { if (waited) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GLOW_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }); },
    fadeGlow);
  return (
    <div ref={ref} className="aurora" data-hue={hue} aria-hidden style={{ zIndex: z.current, ['--drift-t' as string]: drift.current }}>
      <i /><i /><i />
    </div>
  );
}

const ORDER = ['today', 'train', 'food', 'progress'];
function TabPane({ hue, dir, children }: { hue: string; dir: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const leaveDir = usePresenceData() as number | undefined; // the NEW direction: AnimatePresence hands it to the leaving screen
  useSwitchLayer(ref,
    (el, waited) => {
      el.setAttribute('data-go', ''); // its cards start rising now (styles.css)
      if (waited && !still()) el.animate([{ transform: `translateX(${dir * 24}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: EASE_OUT });
    },
    (el) => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: still() ? 'none' : `translateX(${-(leaveDir ?? dir) * 16}px)` }], { duration: OUT_MS, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' }));
  return (
    <div ref={ref} className="tab-pane" data-active data-hue={hue} style={{ position: 'absolute', inset: 0 }}>
      {children}
    </div>
  );
}

/** The status bar takes the colour of the top of the page: a deep tint of the current area's light (ui/statusBar.ts). */
function useBarTint(app: React.RefObject<HTMLDivElement | null>, tab: string) {
  const palette = useStore((x) => x.settings.palette);
  const theme = useStore((x) => x.settings.theme);
  const first = useRef(true);
  useEffect(() => {
    const el = app.current; if (!el) return;
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;color:color-mix(in srgb, var(--h1) var(--bar-mix), var(--bg))';
    el.appendChild(probe);
    const read = (ms: number) => { const c = readRGB(getComputedStyle(probe).color); if (c) setBarTint(c, ms); };
    // once the new screen has been painted (the page switch starts then too — see `gate`), when the new area's colours are in place
    let id = 0, alive = true;
    gate.ready.then(() => { if (alive) id = requestAnimationFrame(() => { read(first.current ? 0 : GLOW_MS); first.current = false; }); });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => requestAnimationFrame(() => read(0));
    mq.addEventListener('change', onMq);
    return () => { alive = false; cancelAnimationFrame(id); mq.removeEventListener('change', onMq); probe.remove(); };
  }, [app, tab, palette, theme]);
}

function useStageDepth(app: React.RefObject<HTMLDivElement | null>, stage: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const apply = (v: number) => {
      setBarDepth(v);
      const a = app.current, st = stage.current; if (!a || !st) return;
      const root = document.documentElement.dataset;
      const still = root.motion === 'reduce' || (root.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (v < 0.0005 || still) { st.style.transform = ''; st.style.borderRadius = ''; st.style.willChange = ''; st.style.overflow = ''; a.style.background = ''; return; }
      st.style.willChange = 'transform'; st.style.overflow = 'hidden'; // layer hints only while a popup is up, so the idle app is built exactly like the original
      st.style.transform = stageTransform(v); // the same function the browser-run (high refresh) version uses
      st.style.borderRadius = `${28 * v}px`;
      a.style.background = barColor(); // the page steps back onto the colour of the status bar: no seam under it (kept in step by statusBar.ts)
    };
    apply(stageDepth.get());
    const offDepth = stageDepth.on('change', apply);
    // behind a full cover (the live workout) the page stops being drawn at all — see stageCover
    const cover = (c: number) => { const st = stage.current; if (!st) return; const o = c >= 0.985 ? Math.max(0, (1 - c) / 0.015) : 1; st.style.opacity = o >= 1 ? '' : String(o); };
    cover(stageCover.get());
    const offCover = stageCover.on('change', cover);
    return () => { offDepth(); offCover(); };
  }, [app, stage]);
}

/**
 * Keep sheets above the on-screen keyboard. The keyboard OVERLAYS the page (the page is never resized, so there is no
 * black strip while the system draws it) and we move the sheets ourselves, springing along with it (`kb`).
 * Chrome on Android reports the keyboard through navigator.virtualKeyboard; iOS overlays it and shrinks the visual
 * viewport instead, so that is the fallback.
 */
function useKeyboard() {
  useEffect(() => {
    const reduced = () => document.documentElement.dataset.motion === 'reduce';
    const vk = (navigator as any).virtualKeyboard as { overlaysContent: boolean; boundingRect: DOMRect; addEventListener: Window['addEventListener']; removeEventListener: Window['removeEventListener'] } | undefined;
    if (vk) {
      try { vk.overlaysContent = true; } catch { /* ignore */ }
      const upd = () => { const h = vk.boundingRect?.height ?? 0; setKeyboard(h > 80 ? h : 0, reduced()); };
      vk.addEventListener('geometrychange', upd); upd();
      return () => { vk.removeEventListener('geometrychange', upd); try { vk.overlaysContent = false; } catch { /* ignore */ } };
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboard(kb > 80 ? kb : 0, reduced());
    };
    vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); upd();
    return () => { vv.removeEventListener('resize', upd); vv.removeEventListener('scroll', upd); };
  }, []);
}

const SCREENS = { today: TodayScreen, train: TrainScreen, food: FoodScreen, progress: ProgressScreen };

/**
 * True while a pop-up is open (and for a moment after it has left). The drifting colour field sits under dozens of frosted
 * cards, so while it moves every one of them must be re-blurred every frame — and a pop-up adds two more full-screen
 * blurs on top. The field is hidden behind the dim then anyway, so it is paused for the duration: the pop-up gets the
 * whole GPU for its own slide.
 */
function useCalm(): boolean {
  const open = useUI((u) => u.overlays.length > 0);
  const [calm, setCalm] = useState(open);
  useEffect(() => {
    // switched on two frames after the pop-up has started moving: it restyles every element of the page behind (its
    // frosted cards stop blurring), and doing that inside the tap delayed the pop-up's first frame
    if (open) { let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setCalm(true)); }); return () => cancelAnimationFrame(id); }
    const id = setTimeout(() => setCalm(false), 900); // resume after the closing slide
    return () => clearTimeout(id);
  }, [open]);
  return calm;
}

export function App() {
  useTheme();
  useRestCue(); // the end of a rest, wherever you are in the app
  useKeepStorage(); // asks the browser not to clear Aven's data on its own (lib/persist.ts)
  useDriveAuto(); // Google Drive backups while you use the app (lib/drive.ts)
  useKeyboard();
  useWakeLock();
  const appRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null);
  useStageDepth(appRef, stageRef);
  const t = useT();
  const tab = useUI((s) => s.tab);
  useBarTint(appRef, tab);
  // the page switch (pageSwitch above) — screens are rebuilt per visit (two attempts to keep them alive both changed how it felt)
  const prev = useRef(tab);
  const lastDir = useRef(1); // the side of the last switch, kept while anything re-renders mid-slide
  const moved = Math.sign(ORDER.indexOf(tab) - ORDER.indexOf(prev.current));
  if (moved) lastDir.current = moved;
  const dir = lastDir.current;
  useEffect(() => { prev.current = tab; }, [tab]);
  // a switch closes the gate while the new screen is built; two frames after it is on the glass the gate opens (see `gate`)
  const gated = useRef(tab);
  if (gated.current !== tab) { gated.current = tab; closeGate(); }
  useLayoutEffect(() => {
    if (gate.open) return;
    let a = requestAnimationFrame(() => { a = requestAnimationFrame(() => gate.release()); });
    return () => cancelAnimationFrame(a);
  }, [tab]);
  const Screen = SCREENS[tab];
  // one element per tab: the app re-renders whenever a pop-up opens or closes (the colour field's pause, the resume bar),
  // and that used to re-render the whole page behind the pop-up too — Today, every time the workout was opened
  const screen = useMemo(() => <Screen />, [Screen]);
  // a running workout shows a resume bar above the tab bar on every tab but Today: the page makes room for it
  const pill = useStore((s) => !!s.active) && tab !== 'today';
  const onboarded = useStore((s) => s.settings.onboarded);
  const calm = useCalm();
  const push = useUI((s) => s.push);
  const asked = useRef(false);
  useEffect(() => {
    if (!onboarded && !asked.current) { asked.current = true; push('onboarding', {}); }
  }, [onboarded, push]);
  useEffect(() => { registerSW(); }, []);
  // home-screen shortcuts (manifest "shortcuts"): ./?do=food | voice | photo | wrestling
  useEffect(() => {
    const doIt = new URLSearchParams(location.search).get('do');
    if (!doIt || !useStore.getState().settings.onboarded) return;
    try { history.replaceState(history.state, '', location.pathname); } catch { /* ignore */ }
    const st = useStore.getState();
    const today = dayKey(Date.now(), st.settings.dayStartHour);
    const mealId = defaultMealId(st.settings.meals);
    setTimeout(() => {
      if (doIt === 'food') push('foodSearch', { date: today, mealId });
      else if (doIt === 'voice') push('voice', { mode: 'food', date: today, mealId });
      else if (doIt === 'photo') push('photoFood', { date: today, mealId });
      else if (doIt === 'wrestling') push('activity', { kind: 'wrestling' });
    }, 350);
  }, [push]);
  return (
    <MotionConfig reducedMotion="user">
      <div className="app" data-hue={tab} data-pill={pill || undefined} data-calm={calm || undefined} ref={appRef}>
        <div className="stage" ref={stageRef}>
        <div className="fields"><AnimatePresence initial={false} mode="sync"><Field key={tab} hue={tab} /></AnimatePresence></div>
        <AnimatePresence mode="sync" initial={false} custom={dir}>
          <TabPane key={tab} hue={tab} dir={dir}>{screen}</TabPane>
        </AnimatePresence>
        <TabBar />
        </div>
        <Overlays />
        <Toaster />
        <SphereStage />
        <FpsMeter />
        <UpdateBanner />
      </div>
      <span className="sr" aria-live="polite">{t('Aven')}</span>
    </MotionConfig>
  );
}

function UpdateBanner() {
  const t = useT();
  const active = useStore((s) => s.active);
  const ready = useUI((s) => (s as any).updateReady as boolean | undefined);
  if (!ready || active) return null;
  return (
    <div className="glass" style={{ position: 'fixed', left: 14, right: 14, top: 'calc(var(--sat) + 10px)', zIndex: 95, borderRadius: 18, padding: '10px 12px 10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="grow small">{t('A new version of Aven is ready.')}</span>
      <button className="btn sm primary press" onClick={() => (window as any).__avenApplyUpdate?.()}>{t('Update')}</button>
    </div>
  );
}
