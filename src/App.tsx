import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimatePresence, MotionConfig, motion, type TargetAndTransition } from 'motion/react';
import { useStore } from './state/store';
import { useUI } from './state/ui';
import { TabBar } from './ui/TabBar';
import { Toaster } from './ui/Toaster';
import { SphereStage } from './ui/Sphere';
import { Overlays } from './screens/Overlays';
import { useRestCue, openWorkout } from './screens/workout/rest';
import { useStaleWorkout } from './screens/workout/stale';
import { applyHcFromAddress } from './lib/healthSync';
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
import { contentTransform, stageCover, stageDepth, stageLayers } from './ui/engage';
import { readRGB, setBarCover, setBarDepth, setBarTint } from './ui/statusBar';
import { setKeyboard } from './ui/keyboard';
import { FpsMeter } from './ui/FpsMeter';
import { useLaunch } from './ui/launch';
import { BgBody, PER_TAB, barColor, useSkyClock, type BgKind } from './ui/Backdrop';
import { FieldGlow } from './ui/Glows';

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
  const glow = useStore((x) => x.settings.glow ?? 'full');
  useLayoutEffect(() => { document.documentElement.dataset.glow = glow; }, [glow]);
  const bg = useStore((x) => x.settings.background ?? 'classic');
  useLayoutEffect(() => { document.documentElement.dataset.bg = bg; }, [bg]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
}

/**
 * iOS-style: while a popup is up the page behind steps back (smaller, rounded corners, over black). It is driven by
 * the popups' own progress (stageDepth, see engage.ts) in the same animation frame, so it follows the popup exactly:
 * opening, under the finger while it is dragged, and as it leaves.
 */
/**
 * Switching tabs. Two things happen together:
 *  - the glow changes: the area's colour field cross-fades into the next area's colours (Field). Every field is opaque, so
 *    the new layer fades in over the old one, which stays whole until it is covered: the light never dips, and the
 *    browser just blends two finished layers instead of repainting anything;
 *  - the screens swap (TabPane, below).
 */
const GLOW = 1; // seconds the colours take to change over (eased in and out: calm, no rush at the start)
let fieldSeq = 0;
// how long a change of field takes: a tab switch GLOW; picking another background a little longer, so it settles in
// under the Settings sheet; the sky moving on (Time of day, Night sky) slower still, so it never reads as a jump
const PICK = 1.2, SKY_SHIFT = 2.6;
/** how a field change runs: its length, and whether the new field is laid over the old one (`over`) */
type FieldChange = { d: number; over: boolean };
const FIELD = {
  hidden: { opacity: 0 },
  shown: (c: FieldChange) => ({ opacity: 1, transition: { duration: c.d, ease: [0.42, 0, 0.58, 1] as const, delay: 0.05 } }),
  // Between two of the picked backgrounds (each painted opaque, see .bgx) the new one is laid over the old one, which stays
  // whole until it is covered: a true blend from one to the other. Fading both at once let the room show through mid-way
  // (a dip in the picker) and two half-skies came out brighter than either. (Classic is opaque too now.)
  gone: (c: FieldChange): TargetAndTransition => (c.over
    // held whole until it is covered, then removed. (Exactly whole: at 0.99 it stopped being an opaque layer and the screen
    // dimmed by a level for the whole change. The exit still needs something that takes that long, so it counts a variable
    // nothing reads: no drawing, no layout.)
    ? { '--gone': [0, 1], transition: { duration: c.d, ease: 'linear' as const, delay: 0.1 } }
    : { opacity: 0, transition: { duration: c.d, ease: [0.55, 0, 0.75, 1] as const, delay: 0.05 } }),
};
function Field({ hue, kind, sky, change }: { hue: string; kind: BgKind; sky: { hour: number; night: boolean }; change: FieldChange }) {
  // the new field takes up the sway (Classic's slow drift, styles.css) exactly where the field on screen is, so the lights
  // carry on through a switch and only their colours change (the sway pauses under pop-ups, so a plain clock would not match)
  const drift = useRef('');
  if (!drift.current) {
    const on = document.querySelector<HTMLElement>('.fields > .aurora')?.getAnimations().find((a) => (a as CSSAnimation).animationName === 'sway');
    const t = on?.effect?.getComputedTiming(); // how far into the sway it is: its time since it started, plus the head start it was given
    drift.current = `-${Math.round(t && t.localTime != null ? Number(t.localTime) - (t.delay ?? 0) : performance.now())}ms`;
  }
  const z = useRef(++fieldSeq);
  return (
    <motion.div className={kind === 'classic' ? 'aurora' : 'bgx'} data-k={kind} data-hue={hue} aria-hidden style={{ zIndex: z.current, ['--drift-t' as string]: drift.current }}
      custom={change} variants={FIELD} initial="hidden" animate="shown" exit="gone">
      <BgBody kind={kind} sky={sky} />
      <FieldGlow kind={kind} />
    </motion.div>
  );
}

/**
 * The screens swap as in the first version: the new one slides in 36 px from the side it sits on and fades up, the old one
 * slides out the other way, fading and softly blurring (0.38 s, ease-out). Its cards then rise in one after another (see
 * `.screen > *` in styles.css). Which side comes from the order of the tabs (Today · Train · Food · Progress); the slide is a
 * whole `transform`, so the browser runs it on its compositor at the screen's full rate.
 */
const EASE = [0.22, 1, 0.36, 1] as const;
const ORDER = ['today', 'train', 'food', 'progress'];
const PAGE = {
  enter: (d: number) => ({ opacity: 0, transform: `translateX(${d * 36}px)` }),
  // Both start 50 ms after the tap: building the new screen takes a frame or two on a phone, and an animation that started
  // during that work showed up already part-way through — the old and new pages jumped (the flicker at the top).
  center: { opacity: 1, transform: 'translateX(0px)', transitionEnd: { transform: 'none' }, transition: { duration: 0.38, ease: EASE, delay: 0.05 } },
  // no blur on the way out: filtering a whole screen every frame of a page switch cost more than anything else in it
  exit: (d: number) => ({ opacity: 0, transform: `translateX(${-d * 36}px)`, transition: { duration: 0.34, ease: EASE, delay: 0.05 } }),
};
// `custom` is the direction; AnimatePresence hands the leaving screen the NEW direction too (it was removed with the old one)
function TabPane({ hue, dir, children }: { hue: string; dir: number; children: React.ReactNode }) {
  return (
    <motion.div className="tab-pane" data-active data-hue={hue} custom={dir} variants={PAGE} initial="enter" animate="center" exit="exit" style={{ position: 'absolute', inset: 0 }}>
      {children}
    </motion.div>
  );
}

function useBarTint(app: React.RefObject<HTMLDivElement | null>, tab: string, bg: BgKind, fieldKey: string) {
  const palette = useStore((x) => x.settings.palette);
  const theme = useStore((x) => x.settings.theme);
  const first = useRef(true);
  useEffect(() => {
    const el = app.current; if (!el) return;
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    el.appendChild(probe);
    const read = (ms: number) => {
      // some colours live on the background's own layer (the newest one: the one fading in)
      const layers = [...document.querySelectorAll<HTMLElement>('.fields > [data-k]')];
      const top = layers.sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
      probe.style.color = barColor(top ?? null, bg);
      const c = readRGB(getComputedStyle(probe).color); if (c) setBarTint(c, ms);
    };
    // after this frame's styles (the new area's colours, the new background's layer) are in place
    const id = requestAnimationFrame(() => { read(first.current ? 0 : 800); first.current = false; });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => requestAnimationFrame(() => read(0));
    mq.addEventListener('change', onMq);
    return () => { cancelAnimationFrame(id); mq.removeEventListener('change', onMq); probe.remove(); };
  }, [app, tab, palette, theme, bg, fieldKey]);
}

function useStageDepth(content: React.RefObject<HTMLDivElement | null>, stage: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const apply = (v: number) => {
      const c = content.current; if (!c) return;
      const root = document.documentElement.dataset;
      const still = root.motion === 'reduce' || (root.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      // Behind a pop-up the page's content (the screen and the dock) sinks back as one piece, under the dim; the page's
      // background (the colour field) stays where it is, edge to edge. The whole page used to step back as a card, and its
      // edges, the colour behind it and its corners all showed (v0.1.72 onto the status bar's tint, v0.1.73 onto black):
      // "the top layer is not seamless". Now there is no edge to see.
      c.style.transform = v < 0.0005 || still ? '' : contentTransform(v); // the same function the browser-run (high refresh) version uses
    };
    apply(stageDepth.get());
    const offDepth = stageDepth.on('change', apply);
    // the status bar darkens with every dim over the page (a pop-up on a pop-up adds a second)
    setBarDepth(stageLayers.get());
    const offLayers = stageLayers.on('change', setBarDepth);
    // behind a full cover (the live workout) the page stops being drawn at all — see stageCover
    const cover = (c: number) => { setBarCover(c); const st = stage.current; if (!st) return; const o = c >= 0.985 ? Math.max(0, (1 - c) / 0.015) : 1; st.style.opacity = o >= 1 ? '' : String(o); };
    cover(stageCover.get());
    const offCover = stageCover.on('change', cover);
    return () => { offDepth(); offLayers(); offCover(); };
  }, [content, stage]);
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
 * While a pop-up is open (and for a moment after it has left) the app is "calm" (data-calm). The drifting colour field sits
 * under dozens of frosted cards, so while it moves every one of them must be re-blurred every frame — and a pop-up adds two
 * more full-screen blurs on top. The field is hidden behind the dim then anyway, so it is paused for the duration: the
 * pop-up gets the whole GPU for its own slide. Written on the shell directly, not as React state: as state, every pop-up
 * opening re-rendered the whole app twice (~270 components, once inside the tap and once two frames into the motion).
 */
function useCalm(app: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf = 0, timer = 0;
    const set = (on: boolean) => { const el = app.current; if (el) on ? el.setAttribute('data-calm', '') : el.removeAttribute('data-calm'); };
    let open = useUI.getState().overlays.length > 0;
    set(open);
    const off = useUI.subscribe((u) => {
      const now = u.overlays.length > 0;
      if (now === open) return;
      open = now; cancelAnimationFrame(raf); clearTimeout(timer);
      // switched on two frames after the pop-up has started moving: it restyles the page behind (its frosted bits stop
      // blurring), and doing that inside the tap delayed the pop-up's first frame
      if (now) raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => set(true)); });
      else timer = window.setTimeout(() => set(false), 900); // resume after the closing slide
    });
    return () => { off(); cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [app]);
}

export function App() {
  useTheme();
  useRestCue(); // the end of a rest, wherever you are in the app
  useStaleWorkout(); // a workout left running for hours asks once whether to finish it
  useEffect(() => { applyHcFromAddress(); window.addEventListener('hashchange', applyHcFromAddress); return () => window.removeEventListener('hashchange', applyHcFromAddress); }, []); // the watch's numbers (lib/healthSync.ts)
  useKeepStorage(); // asks the browser not to clear Aven's data on its own (lib/persist.ts)
  useDriveAuto(); // Google Drive backups while you use the app (lib/drive.ts)
  useKeyboard();
  useWakeLock();
  useLaunch(); // the launch screen's logo flows into the orb in the dock (ui/launch.ts)
  const appRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null);
  useStageDepth(contentRef, stageRef);
  const t = useT();
  // The dock answers a tap at once (TabBar reads the tab itself); the page, its colours and the status bar follow as soon
  // as the new screen is built. That build runs in the background and is dropped if another tab is tapped meanwhile, so
  // tapping through the dock quickly builds only the screen you end on (it used to build every one, each blocking the
  // next tap: the lag when the tabs were tapped fast).
  const tab = useDeferredValue(useUI((s) => s.tab));
  // the page switch (pageSwitch above) — screens are rebuilt per visit (two attempts to keep them alive both changed how it felt)
  const prev = useRef(tab);
  const lastDir = useRef(1); // the side of the last switch, kept while anything re-renders mid-slide
  const moved = Math.sign(ORDER.indexOf(tab) - ORDER.indexOf(prev.current));
  if (moved) lastDir.current = moved;
  const dir = lastDir.current;
  useEffect(() => { prev.current = tab; }, [tab]);
  const Screen = SCREENS[tab];
  // one element per tab: the app re-renders whenever a pop-up opens or closes (the colour field's pause, the resume bar),
  // and that used to re-render the whole page behind the pop-up too — Today, every time the workout was opened
  const screen = useMemo(() => <Screen />, [Screen]);
  // a running workout shows a resume bar above the tab bar on every tab but Today: the page makes room for it
  const pill = useStore((s) => !!s.active) && tab !== 'today';
  const onboarded = useStore((s) => s.settings.onboarded);
  useCalm(appRef);
  // the background (Settings → Appearance): the ones in each tab's colours change with the tab, the others only with the sky
  const bg = useStore((s) => s.settings.background ?? 'classic');
  const sky = useSkyClock(bg === 'time' || bg === 'night');
  const fieldKey = PER_TAB[bg] ? `${bg}:${tab}` : bg === 'time' ? `time:${sky.hour}` : bg === 'night' ? `night:${sky.night}` : bg;
  useBarTint(appRef, tab, bg, fieldKey);
  const change = useRef<{ key: string; bg: BgKind; dur: number; over?: boolean }>({ key: fieldKey, bg, dur: GLOW });
  if (change.current.key !== fieldKey) {
    const was = change.current.bg;
    change.current = { key: fieldKey, bg, dur: was !== bg ? PICK : PER_TAB[bg] ? GLOW : SKY_SHIFT, over: true };
  }
  const fieldChange = useMemo<FieldChange>(() => ({ d: change.current.dur, over: !!change.current.over }), [change.current.dur, change.current.over]); // eslint-disable-line
  const push = useUI((s) => s.push);
  const asked = useRef(false);
  useEffect(() => {
    if (!onboarded && !asked.current) { asked.current = true; push('onboarding', {}); }
  }, [onboarded, push]);
  useEffect(() => { registerSW(); }, []);
  // home-screen shortcuts (manifest "shortcuts"): ./?do=food | voice | photo | wrestling; ?do=workout from a rest notification
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
      else if (doIt === 'workout') openWorkout();
    }, 350);
  }, [push]);
  return (
    <MotionConfig reducedMotion="user">
      <div className="app" data-hue={tab} data-pill={pill || undefined} ref={appRef}>
        <div className="stage" ref={stageRef}>
        <div className="fields"><AnimatePresence initial={false} custom={fieldChange}><Field key={fieldKey} hue={tab} kind={bg} sky={sky} change={fieldChange} /></AnimatePresence><i className="fields-top" data-bar aria-hidden /></div>
        <div className="stage-content" ref={contentRef}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <TabPane key={tab} hue={tab} dir={dir}>{screen}</TabPane>
        </AnimatePresence>
        <TabBar />
        </div>
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
