/**
 * Every setting the Coach may change, in one table: its key, what it is called, which values it takes and how a value
 * becomes a change to Settings. The schema's list of keys, the validator, the Coach's guide and the tests all read this
 * table, so they can never drift apart. Everything here is reversible (the card has Undo); nothing secret lives in Settings.
 */
import type { Settings } from './types';

export interface SettingSpec {
  key: string;
  /** English label (translated where it is shown) */
  label: string;
  /** where it lives in Settings, for the guide */
  page: 'Targets' | 'Training' | 'Food & water' | 'Units & locale' | 'Appearance' | 'Today' | 'Reminders' | 'Profile' | 'Coach';
  /** allowed values, shown to the model ("number 800–8000" for numbers) */
  values: string;
  parse: (v: string, cur: Settings) => { patch: Partial<Settings>; show: string } | null;
}

const BOOL = (v: string) => (/^(on|true|yes|1|enable|enabled|show|shown|til|ja|vis)$/i.test(v) ? true : /^(off|false|no|0|disable|disabled|hide|hidden|fra|nej|skjul)$/i.test(v) ? false : undefined);
const NUM = (v: string) => { const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : undefined; };
const oneOf = <T extends string>(list: readonly T[], v: string): T | undefined => list.find((x) => x.toLowerCase() === v.toLowerCase().trim());

const choice = <T extends string>(key: string, label: string, page: SettingSpec['page'], list: readonly T[], set: (v: T, cur: Settings) => Partial<Settings>): SettingSpec =>
  ({ key, label, page, values: list.join(' | '), parse: (v, cur) => { const x = oneOf(list, v); return x ? { patch: set(x, cur), show: x } : null; } });
const toggle = (key: string, label: string, page: SettingSpec['page'], set: (b: boolean, cur: Settings) => Partial<Settings>): SettingSpec =>
  ({ key, label, page, values: 'on | off', parse: (v, cur) => { const b = BOOL(v); return b === undefined ? null : { patch: set(b, cur), show: b ? 'on' : 'off' }; } });
const number = (key: string, label: string, page: SettingSpec['page'], min: number, max: number, unit: string, set: (n: number, cur: Settings) => Partial<Settings>, step = 1): SettingSpec =>
  ({ key, label, page, values: `number ${min}–${max}${unit ? ` ${unit}` : ''}`, parse: (v, cur) => { const n = NUM(v); if (n === undefined || n < min || n > max) return null; const r = Math.round(n / step) * step; return { patch: set(r, cur), show: `${r}${unit ? ` ${unit}` : ''}` }; } });

const WIDGETS = ['water', 'quick', 'recents', 'week', 'weight', 'targets', 'muscles', 'records'] as const;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_DA = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

export const SETTING_SPEC: SettingSpec[] = [
  // appearance
  choice('theme', 'Theme', 'Appearance', ['system', 'light', 'dark'] as const, (v) => ({ theme: v })),
  choice('palette', 'Colours', 'Appearance', ['ember', 'aurora', 'mono', 'sunset', 'forest', 'golden', 'midnight', 'champagne'] as const, (v) => ({ palette: v })),
  choice('glow', 'Background glow', 'Appearance', ['full', 'soft', 'off'] as const, (v) => ({ glow: v })),
  choice('background', 'Background', 'Appearance', ['classic', 'orb', 'tabs', 'sunrise', 'mesh', 'dots', 'time', 'night', 'photo'] as const, (v) => ({ background: v })),
  choice('motion', 'Motion', 'Appearance', ['system', 'reduce', 'full'] as const, (v) => ({ motion: v })),
  toggle('sound', 'Sound', 'Appearance', (b) => ({ sound: b })),
  toggle('haptics', 'Haptics', 'Appearance', (b) => ({ haptics: b })),
  // units & locale
  choice('language', 'Language', 'Units & locale', ['en', 'da'] as const, (v) => ({ language: v })),
  choice('weightUnit', 'Weight unit', 'Units & locale', ['kg', 'lb'] as const, (v, c) => ({ units: { ...c.units, weight: v } })),
  choice('distanceUnit', 'Distance unit', 'Units & locale', ['km', 'mi'] as const, (v, c) => ({ units: { ...c.units, distance: v } })),
  choice('lengthUnit', 'Length unit', 'Units & locale', ['cm', 'in'] as const, (v, c) => ({ units: { ...c.units, length: v } })),
  { key: 'weekStart', label: 'Week starts on', page: 'Units & locale', values: 'monday | sunday', parse: (v) => { const x = v.toLowerCase(); return x === 'monday' || x === 'mandag' ? { patch: { weekStart: 1 }, show: 'Monday' } : x === 'sunday' || x === 'søndag' ? { patch: { weekStart: 0 }, show: 'Sunday' } : null; } },
  number('dayStartHour', 'New day starts at', 'Units & locale', 0, 6, 'h', (n) => ({ dayStartHour: n })),
  // targets
  number('kcalGoal', 'Calorie target', 'Targets', 800, 8000, 'kcal', (n, c) => ({ goals: { ...c.goals, kcal: n } })),
  number('proteinGoal', 'Protein target', 'Targets', 10, 500, 'g', (n, c) => ({ goals: { ...c.goals, protein: n } })),
  number('carbsGoal', 'Carb target', 'Targets', 10, 1000, 'g', (n, c) => ({ goals: { ...c.goals, carbs: n } })),
  number('fatGoal', 'Fat target', 'Targets', 10, 500, 'g', (n, c) => ({ goals: { ...c.goals, fat: n } })),
  number('fibreGoal', 'Fibre target', 'Targets', 5, 100, 'g', (n, c) => ({ goals: { ...c.goals, fibre: n } })),
  number('waterGoal', 'Water target', 'Targets', 500, 10000, 'ml', (n, c) => ({ goals: { ...c.goals, waterMl: n } })),
  choice('heavyDays', 'Heavy-day notices', 'Targets', ['on', 'quiet', 'off'] as const, (v) => ({ heavyDays: v })),
  // training
  number('restSeconds', 'Default rest', 'Training', 15, 600, 's', (n) => ({ restDefaultSec: n }), 5),
  choice('effort', 'Effort scale', 'Training', ['off', 'rpe', 'rir'] as const, (v) => ({ effort: v })),
  number('plateStep', 'Smallest weight jump', 'Training', 0.5, 10, 'kg', (n) => ({ plateStep: n }), 0.25),
  choice('workoutView', 'Workout opens in', 'Training', ['last', 'list', 'focus'] as const, (v) => ({ workoutView: v })),
  toggle('restNotify', 'Rest-over notification', 'Training', (b) => ({ restNotify: b })),
  // food
  toggle('foodLookup', 'Online food lookup', 'Food & water', (b) => ({ foodLookup: b })),
  { key: 'waterQuick', label: 'Water quick-add sizes', page: 'Food & water', values: 'up to 4 sizes in ml, e.g. "250, 500"', parse: (v) => { const xs = String(v).split(/[\s,;]+/).map(NUM).filter((n): n is number => n !== undefined && n >= 50 && n <= 2000).slice(0, 4).map(Math.round); return xs.length ? { patch: { waterQuick: xs }, show: xs.map((x) => `${x} ml`).join(' · ') } : null; } },
  // Today
  ...WIDGETS.map((w) => toggle(`today.${w}`, `Today: ${w}`, 'Today', (b, c) => ({ widgets: { ...c.widgets, [w]: b } }))),
  toggle('coachPins', 'Coach notes on Today', 'Today', (b) => ({ coachPins: b })),
  { key: 'todayOrder', label: 'Order of Today cards', page: 'Today', values: 'the cards in order, from targets, week, muscles, records, weight', parse: (v) => { const xs = [...new Set(String(v).toLowerCase().split(/[\s,;>]+/).filter((x) => ['targets', 'week', 'muscles', 'records', 'weight'].includes(x)))]; return xs.length ? { patch: { todayOrder: xs }, show: xs.join(' → ') } : null; } },
  // reminders
  toggle('reminders', 'Reminders', 'Reminders', (b) => ({ remindersEnabled: b })),
  { key: 'reminderTime', label: 'Reminder time', page: 'Reminders', values: 'HH:MM, 24-hour', parse: (v) => { const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v).trim()); if (!m || +m[1] > 23 || +m[2] > 59) return null; const s = `${m[1].padStart(2, '0')}:${m[2]}`; return { patch: { reminderTime: s, remindersEnabled: true }, show: s }; } },
  // profile
  { key: 'name', label: 'Name', page: 'Profile', values: 'text', parse: (v) => { const s = String(v).trim().slice(0, 40); return s ? { patch: { name: s }, show: s } : null; } },
  choice('goal', 'Goal', 'Profile', ['strength', 'muscle', 'fatloss', 'endurance', 'general'] as const, (v, c) => ({ profile: { ...c.profile, goal: v } })),
  choice('experience', 'Experience', 'Profile', ['new', 'some', 'experienced'] as const, (v, c) => ({ profile: { ...c.profile, experience: v } })),
  choice('equipment', 'Equipment', 'Profile', ['fullGym', 'homeDumbbells', 'bodyweight', 'barbellHome'] as const, (v, c) => ({ profile: { ...c.profile, equipment: v } })),
  { key: 'trainingDays', label: 'Training days', page: 'Profile', values: 'weekdays, e.g. "monday, wednesday, friday"', parse: (v, c) => { const ws = String(v).toLowerCase().split(/[\s,;]+/).map((w) => { const i = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3))); const j = DAY_DA.findIndex((d) => d.startsWith(w.slice(0, 3))); return i >= 0 ? i : j; }).filter((i) => i >= 0); const days = [...new Set(ws)].sort(); return days.length ? { patch: { profile: { ...c.profile, days } }, show: days.map((i) => DAYS[i].slice(0, 3)).join(' ') } : null; } },
];

export const SETTING_KEYS = SETTING_SPEC.map((s) => s.key);
export const specOf = (key: string) => SETTING_SPEC.find((s) => s.key === key);

/** One line per setting for the model: key = allowed values (the page it lives on). */
export const settingsForPrompt = () => SETTING_SPEC.map((s) => `${s.key} = ${s.values}`).join('; ');
