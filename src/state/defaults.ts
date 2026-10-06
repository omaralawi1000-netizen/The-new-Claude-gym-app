import type { ActivityKind, AppData, MemoryKind, Schedule, Settings, Lang } from '../lib/types';
import { ACTIVITY_KINDS } from '../lib/activity';

export const DATA_VERSION = 1;
/** The Coach remembers at most this many things: each one is sent with every question, so the list stays short and sharp. */
export const MEMORY_MAX = 40;
export const MEMORY_KINDS: MemoryKind[] = ['goal', 'preference', 'health', 'schedule', 'gear', 'food', 'other'];

export function detectLang(): Lang {
  try { return navigator.language?.toLowerCase().startsWith('da') ? 'da' : 'en'; } catch { return 'en'; }
}

export const DEFAULT_MEALS = [
  { id: 'breakfast', name: '' }, { id: 'lunch', name: '' }, { id: 'dinner', name: '' }, { id: 'snacks', name: '' },
];

export function defaultSettings(lang: Lang = 'en'): Settings {
  return {
    name: '',
    language: lang,
    theme: 'system',
    motion: 'system',
    units: { weight: 'kg', distance: 'km', length: 'cm' },
    weekStart: 1,
    dayStartHour: 0,
    goals: { waterMl: 2500 },
    meals: DEFAULT_MEALS.map((m) => ({ ...m })),
    waterQuick: [150, 250, 500],
    restDefaultSec: 90,
    effort: 'off',
    sound: true,
    haptics: true,
    remindersEnabled: false,
    reminderTime: '17:30',
    onboarded: false,
    profile: { goal: 'general', experience: 'some', equipment: 'fullGym', days: [1, 3, 5] },
    plateStep: 2.5,
    foodLookup: true,
    palette: 'ember',
    widgets: { water: true, quick: true, recents: true, week: true, weight: true },
  };
}

/** planned activities per weekday: known kinds only, no duplicates */
function cleanActivities(v: any): Record<number, ActivityKind[]> {
  const out: Record<number, ActivityKind[]> = {};
  if (!v || typeof v !== 'object') return out;
  for (let wd = 0; wd < 7; wd++) { const xs = Array.isArray(v[wd]) ? [...new Set(v[wd].filter((k: any) => (ACTIVITY_KINDS as readonly string[]).includes(k)))] as ActivityKind[] : []; if (xs.length) out[wd] = xs; }
  return out;
}
export function defaultSchedule(): Schedule {
  return { mode: 'weekly', weekly: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, rotation: { order: [], pointer: 0, perWeek: 3 }, overrides: [], cleared: [], activities: {} };
}

export function defaultData(lang: Lang = 'en'): AppData {
  return {
    v: DATA_VERSION,
    settings: defaultSettings(lang),
    foods: [], favourites: [], savedMeals: [], recipes: [], entries: [], water: [],
    exercises: [], routines: [], schedule: defaultSchedule(), sessions: [], active: null,
    weights: [], measurements: [], photos: [], activities: [], notes: [], choices: {}, increments: {}, memory: [],
    demo: false,
  };
}

/** Defensive merge so older / hand-edited backups never crash the app. */
export function normaliseData(raw: any, lang: Lang = 'en'): AppData {
  const d = defaultData(lang);
  if (!raw || typeof raw !== 'object') return d;
  const arr = (k: keyof AppData) => (Array.isArray(raw[k]) ? raw[k] : (d as any)[k]);
  return {
    ...d,
    settings: { ...d.settings, ...(raw.settings ?? {}), units: { ...d.settings.units, ...(raw.settings?.units ?? {}) }, goals: { ...d.settings.goals, ...(raw.settings?.goals ?? {}) }, profile: { ...d.settings.profile, ...(raw.settings?.profile ?? {}) }, widgets: { ...d.settings.widgets, ...(raw.settings?.widgets ?? {}) }, meals: Array.isArray(raw.settings?.meals) && raw.settings.meals.length ? raw.settings.meals : d.settings.meals },
    foods: arr('foods'), favourites: arr('favourites'), savedMeals: arr('savedMeals'), recipes: arr('recipes'), entries: arr('entries'), water: arr('water'),
    exercises: arr('exercises'), routines: arr('routines'),
    schedule: { ...d.schedule, ...(raw.schedule ?? {}), weekly: { ...d.schedule.weekly, ...(raw.schedule?.weekly ?? {}) }, rotation: { ...d.schedule.rotation, ...(raw.schedule?.rotation ?? {}) }, overrides: raw.schedule?.overrides ?? [], cleared: raw.schedule?.cleared ?? [], activities: cleanActivities(raw.schedule?.activities) },
    sessions: arr('sessions'), active: raw.active && typeof raw.active === 'object' ? raw.active : null,
    weights: arr('weights'), measurements: arr('measurements'), photos: arr('photos'), activities: arr('activities'), notes: arr('notes'),
    choices: raw.choices && typeof raw.choices === 'object' && !Array.isArray(raw.choices) ? raw.choices : {},
    increments: raw.increments && typeof raw.increments === 'object' && !Array.isArray(raw.increments) ? raw.increments : {},
    // a hand-edited or older backup: keep only notes that still make sense
    memory: (Array.isArray(raw.memory) ? raw.memory : []).filter((m: any) => m && typeof m.text === 'string' && m.text.trim() && typeof m.id === 'string').slice(0, MEMORY_MAX)
      .map((m: any) => ({ id: m.id, text: m.text.trim().slice(0, 240), kind: MEMORY_KINDS.includes(m.kind) ? m.kind : 'other', at: typeof m.at === 'number' ? m.at : 0, ...(Array.isArray(m.exerciseIds) && m.exerciseIds.length ? { exerciseIds: m.exerciseIds.filter((x: unknown) => typeof x === 'string').slice(0, 6) } : {}) })),
    demo: !!raw.demo,
  };
}
