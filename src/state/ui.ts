import { create } from 'zustand';
import { uid } from '../lib/nutrition';
import { useStore } from './store';

export type Tab = 'today' | 'train' | 'food' | 'progress';
export type OverlayType =
  | 'workout' | 'voice' | 'settings' | 'foodSearch' | 'foodDetail' | 'quickAdd' | 'customFood' | 'recipe' | 'recipes' | 'savedMeals'
  | 'scanner' | 'waterSheet' | 'exercise' | 'exercisePicker' | 'routine' | 'schedule' | 'sessionDetail' | 'summary' | 'weight'
  | 'activity' | 'measure' | 'photos' | 'onboarding' | 'history' | 'dayNotes' | 'exerciseEditor' | 'rescheduleSheet' | 'mealCopy' | 'mealsEditor' | 'about' | 'foodPick' | 'datePicker' | 'entryMenu' | 'lookupInfo' | 'coach' | 'photoFood' | 'camera';

/** `page`: shown as the next page INSIDE the sheet below it (see Sheet.tsx) instead of as a second sheet stacked on top. */
export interface Overlay { id: string; type: OverlayType; props?: any; page?: boolean }

/**
 * Pop-up on pop-up only where it means something. A full-height sheet opened from another full-height sheet — a food from the
 * search, a substitute from an exercise, the exercise list from a routine — is the next step of the same task, so it opens as a
 * page inside that sheet: it slides in from the side and Back slides it out, on the one pane of glass. Tools that are their
 * own thing (the scanner, the camera, a day picker, a confirm) still rise as a sheet of their own on top.
 */
const PAGE_HOSTS = new Set<OverlayType>(['foodSearch', 'foodDetail', 'customFood', 'recipes', 'recipe', 'savedMeals', 'exercise', 'exercisePicker', 'exerciseEditor', 'sessionDetail', 'routine', 'summary', 'settings', 'coach']);
const PAGE_TYPES = new Set<OverlayType>(['foodDetail', 'customFood', 'recipes', 'recipe', 'savedMeals', 'exercise', 'exercisePicker', 'exerciseEditor', 'sessionDetail', 'settings']);
const asPage = (below: Overlay | undefined, type: OverlayType) => !!below && PAGE_HOSTS.has(below.type) && PAGE_TYPES.has(type);
export interface Toast { id: string; text: string; tone?: 'ok' | 'bad' | 'info'; actionLabel?: string; onAction?: () => void; duration: number }

interface UI {
  tab: Tab;
  foodDate: string | null; // null = follow today
  trainTab: 'plan' | 'library' | 'history';
  overlays: Overlay[];
  toasts: Toast[];
  setTab: (t: Tab) => void;
  setFoodDate: (d: string | null) => void;
  setTrainTab: (t: UI['trainTab']) => void;
  push: (type: OverlayType, props?: any) => string;
  pop: () => void;
  /** close the top `n` overlays at once */
  popN: (n: number) => void;
  popTo: (type: OverlayType) => void;
  replaceTop: (type: OverlayType, props?: any) => void;
  /** remove the top `n` overlays and show one new overlay in their place */
  swap: (n: number, type: OverlayType, props?: any) => void;
  closeAll: () => void;
  toast: (text: string, o?: { tone?: Toast['tone']; actionLabel?: string; onAction?: () => void; duration?: number }) => string;
  dismissToast: (id: string) => void;
}

/**
 * Overlay navigation. The overlay array is the source of truth and is updated synchronously; browser history only mirrors it
 * (so the hardware/Android back button closes the top overlay). `histDepth` is the number of history entries WE pushed and
 * not yet unwound — tracking it locally means rapid double-closes can never walk back out of the app.
 */
let histDepth = 0;
function unwindTo(len: number) {
  const extra = histDepth - len;
  if (extra > 0) { histDepth -= extra; try { history.go(-extra); } catch { /* ignore */ } }
}

export const useUI = create<UI>((set, get) => ({
  tab: 'today',
  foodDate: null,
  trainTab: 'plan',
  overlays: [],
  toasts: [],
  // arriving on Food from another tab always shows today: a day browsed earlier must not hide what was just logged elsewhere
  setTab: (tab) => set((s) => (tab === 'food' && s.tab !== 'food' ? { tab, foodDate: null } : { tab })),
  setFoodDate: (foodDate) => set({ foodDate }),
  setTrainTab: (trainTab) => set({ trainTab }),
  push: (type, props) => {
    const top = get().overlays[get().overlays.length - 1];
    if ((type === 'coach' || type === 'voice') && top?.type === type) return top.id;
    const id = uid('ov');
    histDepth += 1;
    try { history.pushState({ aven: histDepth }, ''); } catch { /* ignore */ }
    set((s) => ({ overlays: [...s.overlays, { id, type, props, page: asPage(top, type) }] }));
    return id;
  },
  pop: () => {
    const ov = get().overlays;
    if (!ov.length) return;
    set({ overlays: ov.slice(0, -1) });
    unwindTo(ov.length - 1);
  },
  popN: (n) => {
    const ov = get().overlays;
    const keep = Math.max(0, ov.length - n);
    if (keep >= ov.length) return;
    set({ overlays: ov.slice(0, keep) });
    unwindTo(keep);
  },
  popTo: (type) => {
    const ov = get().overlays;
    const keep = ov.map((o) => o.type).lastIndexOf(type) + 1;
    if (keep >= ov.length) return;
    set({ overlays: ov.slice(0, keep) });
    unwindTo(keep);
  },
  replaceTop: (type, props) => set((s) => ({ overlays: [...s.overlays.slice(0, -1), { id: uid('ov'), type, props, page: asPage(s.overlays[s.overlays.length - 2], type) }] })),
  swap: (n, type, props) => {
    const ov = get().overlays;
    const keep = Math.max(0, ov.length - n);
    set({ overlays: [...ov.slice(0, keep), { id: uid('ov'), type, props, page: asPage(ov[keep - 1], type) }] });
    unwindTo(keep + 1);
  },
  closeAll: () => {
    if (!get().overlays.length) return;
    set({ overlays: [] });
    unwindTo(0);
  },
  toast: (text, o = {}) => {
    const id = uid('t');
    const t: Toast = { id, text, tone: o.tone, actionLabel: o.actionLabel, onAction: o.onAction, duration: o.duration ?? (o.actionLabel ? 6000 : 3200) };
    set((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

if (typeof window !== 'undefined') {
  // hardware / browser back: trim overlays to the history depth the browser landed on
  window.addEventListener('popstate', (e) => {
    const depth = (e.state && e.state.aven) || 0;
    histDepth = depth;
    const ov = useUI.getState().overlays;
    if (ov.length > depth) useUI.setState({ overlays: ov.slice(0, depth) });
  });
  // a reload must not strand us on a history entry that has no overlay behind it
  try { if (history.state?.aven) history.replaceState(null, ''); } catch { /* ignore */ }
}

/**
 * The app's haptic vocabulary: a few distinct feels, each meaning the same thing wherever it is felt (call `haptic(name)`,
 * never a bare number). Short and light for small things, a double for "it worked", longer only where you may not be
 * looking (the rest timer). Not felt on purpose: navigation, opening things, the orb flying, scrolling, talking.
 */
export const HAPTICS = {
  step: 5,                          // a dragged item passes another
  tick: 5,                          // a number lands on the finish screen
  select: 6,                        // a choice changed: a switch, a segment, a day, a favourite, a colour
  light: 8,                         // a small thing done: add a set, undo, skip the rest, pause
  saved: 12,                        // something kept: food logged, a weight, a routine, a plan
  set: 14,                          // a set ticked
  confirm: 14,                      // a weighty button: start or end a workout, confirm what the Coach suggests
  gain: [12, 50, 22],               // a set ticked that beats last time
  success: [12, 40, 18],            // the orb or the Coach did what you asked
  listen: [6, 70, 10],              // the orb starts listening when you tap it: a soft "I'm here"
  send: 10,                         // the orb stops listening and takes what you said
  finish: [16, 60, 16, 60, 16],     // the workout's medal lands: three even beats, "done"
  record: [14, 70, 14, 70, 50],     // a new personal record (a set, or the medal of a workout with one): rising to a firm last beat
  warn: 30,                         // that can't be done yet (a set with no reps)
  countdown: 24,                    // each of a rest's last three seconds
  restOver: [180, 90, 180, 90, 320],// the rest is over (strong enough to feel through a pocket)
  arrive: [4, 135, 5, 112, 6, 92, 7, 76, 9, 60, 11, 46, 14, 34, 30], // the orb lands on its screen: a quickening heartbeat
} as const;
export type Haptic = keyof typeof HAPTICS;
export const haptic = (k: Haptic) => buzz(HAPTICS[k] as number | number[]);

export function buzz(ms: number | number[] = 8) {
  // Settings → Haptic feedback turns every buzz off; and only after the first tap (browsers refuse — and log an error —
  // before any interaction)
  if (!useStore.getState().settings.haptics) return;
  try { if ('vibrate' in navigator && ((navigator as any).userActivation?.hasBeenActive ?? true)) navigator.vibrate(ms); } catch { /* ignore */ }
}
