import type { AppData, Schedule, Settings, Lang } from '../lib/types';

export const DATA_VERSION = 1;

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
  };
}

export function defaultSchedule(): Schedule {
  return { mode: 'weekly', weekly: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, rotation: { order: [], pointer: 0, perWeek: 3 }, overrides: [], cleared: [] };
}

export function defaultData(lang: Lang = 'en'): AppData {
  return {
    v: DATA_VERSION,
    settings: defaultSettings(lang),
    foods: [], favourites: [], savedMeals: [], recipes: [], entries: [], water: [],
    exercises: [], routines: [], schedule: defaultSchedule(), sessions: [], active: null,
    weights: [], measurements: [], photos: [], activities: [], notes: [], choices: {},
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
    settings: { ...d.settings, ...(raw.settings ?? {}), units: { ...d.settings.units, ...(raw.settings?.units ?? {}) }, goals: { ...d.settings.goals, ...(raw.settings?.goals ?? {}) }, profile: { ...d.settings.profile, ...(raw.settings?.profile ?? {}) }, meals: Array.isArray(raw.settings?.meals) && raw.settings.meals.length ? raw.settings.meals : d.settings.meals },
    foods: arr('foods'), favourites: arr('favourites'), savedMeals: arr('savedMeals'), recipes: arr('recipes'), entries: arr('entries'), water: arr('water'),
    exercises: arr('exercises'), routines: arr('routines'),
    schedule: { ...d.schedule, ...(raw.schedule ?? {}), weekly: { ...d.schedule.weekly, ...(raw.schedule?.weekly ?? {}) }, rotation: { ...d.schedule.rotation, ...(raw.schedule?.rotation ?? {}) }, overrides: raw.schedule?.overrides ?? [], cleared: raw.schedule?.cleared ?? [] },
    sessions: arr('sessions'), active: raw.active && typeof raw.active === 'object' ? raw.active : null,
    weights: arr('weights'), measurements: arr('measurements'), photos: arr('photos'), activities: arr('activities'), notes: arr('notes'),
    choices: raw.choices && typeof raw.choices === 'object' && !Array.isArray(raw.choices) ? raw.choices : {},
    demo: !!raw.demo,
  };
}
