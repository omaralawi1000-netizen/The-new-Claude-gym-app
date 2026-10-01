import { create } from 'zustand';
import { uid } from '../lib/nutrition';

export type Tab = 'today' | 'train' | 'food' | 'progress';
export type OverlayType =
  | 'workout' | 'voice' | 'settings' | 'foodSearch' | 'foodDetail' | 'quickAdd' | 'customFood' | 'recipe' | 'recipes' | 'savedMeals'
  | 'scanner' | 'waterSheet' | 'exercise' | 'exercisePicker' | 'routine' | 'schedule' | 'sessionDetail' | 'summary' | 'weight'
  | 'activity' | 'measure' | 'photos' | 'onboarding' | 'history' | 'dayNotes' | 'exerciseEditor' | 'rescheduleSheet' | 'mealCopy' | 'mealsEditor' | 'about' | 'foodPick' | 'datePicker' | 'entryMenu' | 'lookupInfo' | 'coach' | 'photoFood';

export interface Overlay { id: string; type: OverlayType; props?: any }
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
  setTab: (tab) => set({ tab }),
  setFoodDate: (foodDate) => set({ foodDate }),
  setTrainTab: (trainTab) => set({ trainTab }),
  push: (type, props) => {
    // There is no separate "voice" screen any more: talking to the app IS the Coach. Anything that used to open the
    // dictation composer opens the Coach already listening (food/day hints ride along so it knows where you were).
    if (type === 'voice') { type = 'coach'; props = { ...props, listen: true }; }
    const top = get().overlays[get().overlays.length - 1];
    if (type === 'coach' && top?.type === 'coach') return top.id;
    const id = uid('ov');
    histDepth += 1;
    try { history.pushState({ aven: histDepth }, ''); } catch { /* ignore */ }
    set((s) => ({ overlays: [...s.overlays, { id, type, props }] }));
    return id;
  },
  pop: () => {
    const ov = get().overlays;
    if (!ov.length) return;
    set({ overlays: ov.slice(0, -1) });
    unwindTo(ov.length - 1);
  },
  popTo: (type) => {
    const ov = get().overlays;
    const keep = ov.map((o) => o.type).lastIndexOf(type) + 1;
    if (keep >= ov.length) return;
    set({ overlays: ov.slice(0, keep) });
    unwindTo(keep);
  },
  replaceTop: (type, props) => set((s) => ({ overlays: [...s.overlays.slice(0, -1), { id: uid('ov'), type, props }] })),
  swap: (n, type, props) => {
    const ov = get().overlays;
    const keep = Math.max(0, ov.length - n);
    set({ overlays: [...ov.slice(0, keep), { id: uid('ov'), type, props }] });
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

export function buzz(ms = 8) {
  try { if ('vibrate' in navigator) navigator.vibrate(ms); } catch { /* ignore */ }
}
