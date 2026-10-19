import { Component, Suspense, startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'motion/react';
import { OverlayMeta, OverlayZ } from '../ui/Sheet';
import { useUI, type Overlay } from '../state/ui';
import { useStore } from '../state/store';
import { ActiveWorkout, WkFrozen, WK_GHOST } from './workout/Active';
import type { WorkoutSession } from '../lib/types';
import { FoodSearch } from './food/Search';
import { FoodDetail } from './food/Detail';
import { QuickAdd, CustomFood } from './food/QuickCustom';
import { RecipeEditor, RecipeList, SavedMeals } from './food/Meals';
import { DatePicker, DayNotes, EntryMenu, MealCopy, WaterSheet } from './food/Menus';
import { ExerciseDetail } from './workout/ExerciseDetail';
import { ExerciseEditor, ExercisePicker } from './workout/Picker';
import { SessionDetail, Summary } from './workout/Summary';
import { RoutineEditor } from './workout/Routine';
import { ActivityLog, Reschedule, Schedule } from './workout/Schedule';
import { MeasureSheet, PhotosSheet, WeightSheet } from './Body';
import { deferred, preloadLater } from '../ui/lazy';
import { tNow } from '../lib/i18n';
import { installCoachTrace } from '../lib/coachTrace';

// The biggest pop-ups are files of their own, loaded after the app has opened (ui/lazy.ts): the app starts with less to load
// and run. They are fetched while the app is idle a few seconds after opening, so they open as quickly as before.
const Coach = deferred(() => import('./Coach').then((m) => m.Coach));
const VoiceComposer = deferred(() => import('./Voice').then((m) => m.VoiceComposer));
const SettingsSheet = deferred(() => import('./Settings').then((m) => m.SettingsSheet));
const PhotoFood = deferred(() => import('./food/PhotoFood').then((m) => m.PhotoFood));
const CameraSheet = deferred(() => import('./CameraSheet').then((m) => m.CameraSheet));
const Scanner = deferred(() => import('./food/Scanner').then((m) => m.Scanner));
const Onboarding = deferred(() => import('./Onboarding').then((m) => m.Onboarding));
const WeekReviewSheet = deferred(() => import('./WeekReview').then((m) => m.WeekReviewSheet));
preloadLater(Coach, VoiceComposer, SettingsSheet, PhotoFood, Scanner, CameraSheet, Onboarding, WeekReviewSheet);

// one stable object per overlay, so its consumers don't re-render on every change to the stack
const metas = new Map<string, { id: string; page: boolean }>();
const meta = (id: string, page: boolean) => { let m = metas.get(id); if (!m) { m = { id, page }; metas.set(id, m); if (metas.size > 200) metas.delete(metas.keys().next().value!); } return m; };

/**
 * The live workout stays mounted once it has been opened, until it is finished or discarded: minimising only slides it away
 * (and hides it), so opening it again is just the slide — the whole list used to be rebuilt on every Resume, a pause after
 * the tap each time. While it is open it sits in the stack at the workout overlay's place.
 *
 * It is also built ahead, hidden, once the app has settled after starting (and again after a workout has ended): before a
 * workout exists it holds an empty stand-in (WK_GHOST), and the workout you start takes that same window over, so Start moves
 * on the tap exactly like Resume. Building it in the tap was ~45 ms on the phone before anything moved.
 */
function WorkoutHost() {
  const overlays = useUI((s) => s.overlays);
  const active = useStore((s) => s.active);
  const activeId = active?.id ?? null;
  const idx = overlays.findIndex((o) => o.type === 'workout');
  const last = useRef<{ o: Overlay; z: number }>({ o: { id: 'workout-ahead', type: 'workout' }, z: 60 });
  if (idx >= 0) last.current = { o: overlays[idx], z: 60 + idx * 10 };
  const [kept, setKept] = useState<string | null>(null);
  useEffect(() => { if (idx >= 0 && activeId) setKept(activeId); }, [idx, activeId]);
  // Finished or discarded while open: the store's workout is gone at once, but the window slides down like any closing,
  // drawn from the workout as it was (WkFrozen), and is let go once it has left the screen.
  const seen = useRef<{ a: WorkoutSession | null; open: boolean }>({ a: null, open: false });
  const [leaving, setLeaving] = useState<WorkoutSession | null>(null);
  // (read in this same render too: waiting for the state to catch up let one pass pick the built-ahead stand-in's slot,
  // which remounted the window, so it vanished at once instead of leaving smoothly)
  let gone = active ? null : leaving;
  if (!active && seen.current.a && seen.current.open && leaving?.id !== seen.current.a.id) { gone = seen.current.a; setLeaving(gone); }
  if (active && leaving) setLeaving(null);
  seen.current = { a: active, open: idx >= 0 && !!active };
  // Finished from the open window: it stays where it is while the finish sheet rises over it (no gap where the page behind
  // flashes through), and is let go without its slide once the sheet has covered it
  const held = !!gone && overlays.some((o) => o.type === 'summary' && o.props?.sessionId === gone.id);
  const [covered, setCovered] = useState<string | null>(null);
  useEffect(() => {
    if (!held || !gone) return;
    const id = gone.id, t = setTimeout(() => setCovered(id), HOLD_MS);
    return () => clearTimeout(t);
  }, [held, gone?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const hold = held && covered !== gone?.id;
  const ahead = useAhead(activeId, !!gone);
  const shownId = activeId ?? gone?.id ?? (ahead ? WK_GHOST : null);
  // one window per workout, except that a workout started while the stand-in is waiting takes that window over
  const slot = useRef<{ id: string; key: string } | null>(null);
  if (shownId && slot.current?.id !== shownId) slot.current = { id: shownId, key: slot.current?.id === WK_GHOST ? slot.current.key : shownId === WK_GHOST ? `${WK_GHOST}-${++aheadN}` : shownId };
  if (!shownId || (idx < 0 && !gone && kept !== activeId && !ahead)) return null;
  const { o, z } = last.current;
  return (
    <OverlayZ.Provider value={z}><OverlayMeta.Provider value={meta(o.id, false)}><WkFrozen.Provider value={active ? null : (gone ?? ghost)}>
      <ActiveWorkout key={slot.current!.key} props={o.props ?? {}} open={(idx >= 0 && !!active) || hold} vanish={held} onGone={() => setLeaving(null)} />
    </WkFrozen.Provider></OverlayMeta.Provider></OverlayZ.Provider>
  );
}

let aheadN = 0;
// the finish sheet's rise, until it covers most of the window: the window is let go early, before the numbers roll, so the
// phone never has the workout, the page behind and the whole finish moment to draw at once
const HOLD_MS = 120;
const ghost: WorkoutSession = { id: WK_GHOST, name: '', date: '', startedAt: 0, pausedMs: 0, status: 'active', exercises: [], rest: null };
/**
 * True once the app has settled (a few seconds in, the finger off the screen for a moment, the main thread free), so the
 * workout window can be built ahead. It is built as a render that yields, so a tap in the middle still gets through. Cleared
 * when a workout ends, and asked for again once its window has gone, so the next one is built ahead too.
 */
function useAhead(activeId: string | null, leaving: boolean): boolean {
  const [ahead, setAhead] = useState(false);
  const was = useRef(activeId);
  if (was.current && !activeId && ahead) setAhead(false);
  was.current = activeId;
  useEffect(() => {
    if (ahead || leaving || typeof requestIdleCallback !== 'function') return;
    let id = 0, timer = 0, touched = performance.now();
    const touch = () => { touched = performance.now(); };
    // (the page's slow ambient light keeps frames coming, so "idle" is only ever the gap between two frames)
    const ask = () => { id = requestIdleCallback(() => { if (performance.now() - touched < 1500) later(); else startTransition(() => setAhead(true)); }, { timeout: 4000 }); };
    const later = () => { timer = window.setTimeout(ask, 1500); };
    window.addEventListener('pointerdown', touch, true);
    later();
    return () => { clearTimeout(timer); cancelIdleCallback(id); window.removeEventListener('pointerdown', touch, true); };
  }, [ahead, leaving]);
  return ahead;
}

/** A missing screen file (for example after a deploy) must not unmount the app or leave an invisible overlay behind. */
class OverlayBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    const ui = useUI.getState();
    const i = ui.overlays.findIndex((o) => o.id === this.props.id);
    if (i < 0) return;
    ui.popN(ui.overlays.length - i);
    ui.toast(tNow('Couldn’t open this screen. Reload Aven and try again.'), {
      tone: 'bad', duration: 10000, actionLabel: tNow('Reload'), onAction: () => location.reload(),
    });
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Renders the overlay stack. Each overlay owns its presentation (sheet, morph, or full-screen). */
export function Overlays() {
  const overlays = useUI((s) => s.overlays);
  useEffect(installCoachTrace, []);
  return (
    <>
    <WorkoutHost />
    <AnimatePresence>
      {overlays.map((o, idx) => {
        const p = o.props ?? {};
        const el = (() => { switch (o.type) {
          case 'workout': return null; // drawn by WorkoutHost, which keeps it alive between openings
          case 'settings': return <SettingsSheet key={o.id} props={p} />;
          case 'foodSearch': return <FoodSearch key={o.id} props={p} />;
          case 'foodDetail': return <FoodDetail key={o.id} props={p} />;
          case 'quickAdd': return <QuickAdd key={o.id} props={p} />;
          case 'customFood': return <CustomFood key={o.id} props={p} />;
          case 'recipes': return <RecipeList key={o.id} props={p} />;
          case 'recipe': return <RecipeEditor key={o.id} props={p} />;
          case 'savedMeals': return <SavedMeals key={o.id} props={p} />;
          case 'camera': return <CameraSheet key={o.id} props={p} />;
          case 'scanner': return <Scanner key={o.id} props={p} />;
          case 'datePicker': return <DatePicker key={o.id} props={p} />;
          case 'entryMenu': return <EntryMenu key={o.id} props={p} />;
          case 'mealCopy': return <MealCopy key={o.id} props={p} />;
          case 'waterSheet': return <WaterSheet key={o.id} props={p} />;
          case 'dayNotes': return <DayNotes key={o.id} props={p} />;
          case 'exercise': return <ExerciseDetail key={o.id} props={p} />;
          case 'exercisePicker': return <ExercisePicker key={o.id} props={p} />;
          case 'exerciseEditor': return <ExerciseEditor key={o.id} props={p} />;
          case 'summary': return <Summary key={o.id} props={p} />;
          case 'weekReview': return <WeekReviewSheet key={o.id} props={p} />;
          case 'sessionDetail': return <SessionDetail key={o.id} props={p} />;
          case 'routine': return <RoutineEditor key={o.id} props={p} />;
          case 'schedule': return <Schedule key={o.id} props={p} />;
          case 'rescheduleSheet': return <Reschedule key={o.id} props={p} />;
          case 'activity': return <ActivityLog key={o.id} props={p} />;
          case 'weight': return <WeightSheet key={o.id} />;
          case 'measure': return <MeasureSheet key={o.id} />;
          case 'photos': return <PhotosSheet key={o.id} />;
          case 'photoFood': return <PhotoFood key={o.id} props={p} />;
          case 'coach': return <Coach key={o.id} props={p} />;
          case 'voice': return <VoiceComposer key={o.id} props={p} />;
          case 'onboarding': return <Onboarding key={o.id} props={p} />;
          default: return null;
        } })();
        return <OverlayZ.Provider key={o.id} value={60 + idx * 10}><OverlayMeta.Provider value={meta(o.id, !!o.page)}><OverlayBoundary id={o.id}><Suspense fallback={null}>{el}</Suspense></OverlayBoundary></OverlayMeta.Provider></OverlayZ.Provider>;
      })}
    </AnimatePresence>
    </>
  );
}
