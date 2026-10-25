// ─────────────────────────────────────────────────────────────
// Aven domain model.
// Canonical storage units: kg, metres, centimetres, millilitres, kcal.
// Nutrients are stored PER 100 OF THE FOOD'S BASIS UNIT (g or ml).
// A nutrient that is `undefined` is UNKNOWN — never treated as zero.
// ─────────────────────────────────────────────────────────────

export type Lang = 'en' | 'da';

export type NutrientKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'sugar' | 'satFat' | 'sodium';
/** kcal, g, g, g, g, g, g, mg */
export type Nutrients = Partial<Record<NutrientKey, number>>;
export type BasisUnit = 'g' | 'ml';

export interface Portion {
  id: string;
  label: string;
  /** size in the food's basis unit (g for g-basis, ml for ml-basis) */
  amount: number;
  /** verified = from the data source or entered by the user; false = typical/estimated */
  verified: boolean;
}

export type FoodSource = 'reference' | 'off' | 'usda' | 'custom' | 'recipe' | 'quick';
export type FoodState = 'raw' | 'cooked' | 'dry';

export interface Food {
  id: string;
  name: string;
  nameDa?: string;
  brand?: string;
  source: FoodSource;
  sourceId?: string;
  barcode?: string;
  basis: BasisUnit;
  per100: Nutrients;
  portions: Portion[];
  /** grams per millilitre — only present when actually known */
  density?: number;
  state?: FoodState;
  /** foods sharing a group are raw/cooked variants of each other */
  variantGroup?: string;
  aliases?: string[];
  note?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Quantity {
  amount: number;
  unit: 'g' | 'ml' | 'portion';
  portionId?: string;
}

/** Everything needed to recompute an entry, frozen at log time. */
export interface FoodSnapshot {
  foodId?: string;
  name: string;
  brand?: string;
  source: FoodSource;
  sourceId?: string;
  state?: FoodState;
  basis: BasisUnit;
  per100: Nutrients;
  density?: number;
  portions: Portion[];
}

export interface FoodEntry {
  id: string;
  date: string; // YYYY-MM-DD in user's day-boundary terms
  mealId: string;
  at: number;
  snap: FoodSnapshot;
  qty: Quantity;
  /** quantity in the snapshot's basis unit (g or ml) */
  base: number;
  /** computed totals for this entry; absent key = unknown */
  nutrients: Nutrients;
  note?: string;
  /** the portion size was an estimate (unverified portion or dictated "one banana") */
  estimated?: boolean;
  /** entered as a quick calorie/macro log rather than a food */
  quick?: boolean;
}

export interface Meal {
  id: string;
  name: string;
}

export interface SavedMealItem {
  snap: FoodSnapshot;
  qty: Quantity;
  /** a quick, photo or Coach entry (totals only): logged again with exactly these totals */
  nutrients?: Nutrients;
}
export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  createdAt: number;
}

export interface RecipeIngredient {
  id: string;
  snap: FoodSnapshot;
  qty: Quantity;
  base: number;
}
export interface Recipe {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  servings: number;
  /** total prepared (cooked) weight in grams; optional */
  totalWeightG?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WaterEntry {
  id: string;
  date: string;
  ml: number;
  at: number;
}

// ── Training ────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'cardio';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'smith' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'bench' | 'other';
export type Movement = 'push' | 'pull' | 'squat' | 'hinge' | 'lunge' | 'carry' | 'core' | 'cardio' | 'isolation';
export type LogType = 'weightReps' | 'bodyweightReps' | 'assisted' | 'duration' | 'distance';

export interface Exercise {
  id: string;
  name: string;
  nameDa?: string;
  muscles: MuscleGroup[]; // first = primary
  equipment: Equipment[];
  movement: Movement;
  logType: LogType;
  instructions: string[];
  instructionsDa?: string[];
  /** other names people search for ("Smith incline bench") */
  aka?: string[];
  custom?: boolean;
  archived?: boolean;
}

export type SetType = 'warmup' | 'working';

export interface SetRecord {
  id: string;
  type: SetType;
  weightKg?: number; // load (added load for bodyweight; assistance for assisted)
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  rir?: number;
  done: boolean;
  completedAt?: number;
  /** planned target for this set (from the routine) */
  target?: { repMin?: number; repMax?: number; weightKg?: number };
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  note?: string;
  supersetGroup?: string;
  restSec?: number;
  sets: SetRecord[];
  /** working sets that were planned when the workout was finished (done or not) — progression skips days cut short */
  plannedSets?: number;
}

export interface WorkoutSession {
  id: string;
  name: string;
  routineId?: string;
  plannedDate?: string;
  date: string; // day key at start
  startedAt: number;
  endedAt?: number;
  /** total paused time so far (ms) */
  pausedMs: number;
  pausedAt?: number;
  status: 'active' | 'done';
  exercises: SessionExercise[];
  note?: string;
  /** setId: the set whose tick started it (unticking that set stops it); '' = started by hand; absent = saved by an older version */
  rest?: { endsAt: number; total: number; exerciseId: string; setId?: string } | null;
  records?: PersonalRecord[];
  /** how it felt, from the one-tap check-in after it (each optional): energy 1 low · 2 ok · 3 great; soreness 1 none ·
   *  2 some · 3 a lot; sleep (the night before) 1 poor · 2 ok · 3 good */
  checkin?: CheckIn;
  /** made from sets told to the Coach with no workout running (after the gym, or for another day): later sets that day
   *  join it */
  logged?: boolean;
}
export interface CheckIn { energy?: 1 | 2 | 3; soreness?: 1 | 2 | 3; sleep?: 1 | 2 | 3; at: number }

export type RecordKind = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration' | 'distance';
export interface PersonalRecord {
  exerciseId: string;
  kind: RecordKind;
  value: number;
  previous?: number;
  setId: string;
  date: string;
}

export interface RoutineItem {
  id: string;
  exerciseId: string;
  warmupSets: number;
  workingSets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  supersetGroup?: string;
  note?: string;
  /** for duration/distance exercises */
  targetDurationSec?: number;
  targetDistanceM?: number;
}
export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
  note?: string;
  /** made for one day only (the Coach's "chest and triceps tomorrow"): it works in the plan and the history, but the
   *  routine lists leave it out so they don't fill up with one-off days */
  oneOff?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Schedule {
  mode: 'weekly' | 'rotation';
  /** 0 = Sunday … 6 = Saturday */
  weekly: Record<number, string | null>;
  rotation: { order: string[]; pointer: number; perWeek: number };
  /** one-off placements (incl. rescheduled workouts) */
  overrides: { date: string; routineId: string; originDate?: string }[];
  /** dates on which the normal weekly plan is cleared (skipped or moved away) */
  cleared: string[];
  /** activities planned on a weekday besides the gym (0 = Sunday … 6 = Saturday), e.g. wrestling on Tuesdays */
  activities?: Record<number, ActivityKind[]>;
  /** the day (YYYY-MM-DD) each weekday's plan last changed (0 = Sunday … 6 = Saturday): days before it are never "missed" */
  weeklySince?: Record<number, string>;
}

// ── Body & activity ─────────────────────────────────────────

export interface WeightLog { id: string; date: string; kg: number; at: number }

/**
 * A heavy day caught up over the next few (lib/eating.ts): what it was over by, and the lower targets that make up for it.
 * Omar asked for it (19 Oct): an evening that got out of hand (often logged the morning after) is paid back over 3–4 days,
 * never in one brutal day, protein kept, never under a safe floor.
 */
/** The calorie target changed on `from` (to `kcal`, from `prev`; either undefined = no target). One record a day. */
export interface TargetChange { from: string; kcal?: number; prev?: number }
export interface CatchUp {
  id: string;
  /** the heavy day, and how far over its target it went */
  date: string; over: number;
  /** the days with a lower target, and how much lower each */
  days: string[]; perDay: number;
  /** noticed the same evening (live) or from a log made afterwards (late) */
  trigger: 'live' | 'late';
  at: number;
  /** the lowest a day's target may go because of it */
  floor: number;
  /** said to them already: the toast, and the Coach's first line */
  told?: boolean; coachTold?: boolean;
  /** taken back (Undo, or "don't cut my calories"): kept so the same day is never caught up again */
  off?: boolean;
  /** the plan as decided after a look at everything (lib/verdict.ts): the pop-up's line and the reasoning behind it */
  line?: string; why?: string;
  /** decided once (an older record with a `line` counts as decided); set by hand through the Coach (never re-planned) */
  decided?: boolean; byHand?: boolean;
  /** its day stopped being heavy after it was decided (an entry deleted or fixed): kept with no cut, so a re-log of the
   *  same evening is never decided or said again */
  gone?: boolean;
}
export type MeasureKind = 'waist' | 'chest' | 'hips' | 'arm' | 'thigh' | 'neck';
export interface Measurement { id: string; date: string; kind: MeasureKind; cm: number }
export interface ProgressPhoto { id: string; date: string; note?: string }

export type ActivityKind = 'wrestling' | 'run' | 'walk' | 'cycle' | 'swim' | 'row' | 'stairs' | 'hike' | 'mobility' | 'warmup' | 'recovery' | 'other';
export interface ActivityLog {
  id: string;
  date: string;
  kind: ActivityKind;
  durationSec: number;
  distanceM?: number;
  /** metres climbed (the watch) */
  elevationM?: number;
  /** wrestling: rounds/goes on the mat, and how hard it felt (1 easy · 2 hard · 3 max) */
  rounds?: number;
  intensity?: 1 | 2 | 3;
  note?: string;
  at: number;
  /** from the watch (Health Connect): its record id (never added twice), when it ran, and what the watch measured */
  source?: 'watch';
  hcId?: string;
  startAt?: number;
  avgHr?: number;
  maxHr?: number;
  /** active calories the watch counted: shown, never added to the food target */
  kcal?: number;
  /** the watch's own name for it ("Stair climber", "Elliptical"), for kinds Aven has no word for */
  name?: string;
}

/** Steps of one day, from the watch and phone (Health Connect counts each step once). */
export interface StepDay { date: string; count: number }

/**
 * Everything else the watch measured on one day (Health Connect, read only): calories, distance, floors, resting heart
 * rate, HRV, the night's sleep (counted on the morning it ended) with its stages, and body numbers. Missing = not measured
 * or not allowed.
 */
export interface HealthDay {
  date: string;
  /** active and total calories burned (shown, never added to the food target) */
  activeKcal?: number; totalKcal?: number;
  distanceM?: number; floors?: number;
  /** resting heart rate (bpm) and heart rate variability (RMSSD, ms) */
  restHr?: number; hrv?: number;
  /** sleep in minutes, and its stages */
  sleepMin?: number; deepMin?: number; remMin?: number; lightMin?: number; awakeMin?: number;
  /** when the night's sleep started and ended (ms) */
  sleepStart?: number; sleepEnd?: number;
  weightKg?: number; bodyFat?: number; vo2max?: number;
  /** blood oxygen (%) and breathing rate (per minute), the day's average */
  spo2?: number; respRate?: number;
  /** body composition (the watch's last scan that day, kg) and basal metabolic rate (kcal a day) */
  leanKg?: number; bodyWaterKg?: number; boneKg?: number; bmr?: number;
  /** body temperature (°C); skin temperature at night: the night's average off the watch's own normal (°C), and that normal */
  bodyTemp?: number; skinDelta?: number; skinBase?: number;
}

// ── Settings ────────────────────────────────────────────────

export type Goal = 'strength' | 'muscle' | 'fatloss' | 'endurance' | 'general';
export type Experience = 'new' | 'some' | 'experienced';
export type EquipmentAccess = 'fullGym' | 'homeDumbbells' | 'bodyweight' | 'barbellHome';

/** the sheet surface in Settings; anything unknown (an option tried on Beta and since dropped) reads as Glass */
export const surfaceOf = (v: unknown): NonNullable<Settings['surface']> => (v === 'now' || v === 'deep' ? v : 'glass');
/** the surface look on trial (Settings > Appearance > Surfaces, surfaces.css `data-look`); missing = A, the pick */
// (Omar 25 Oct: A for everyone, the picker is gone; an old saved choice is ignored)
export const lookOf = (_v?: unknown): NonNullable<Settings['look']> => 'a';
/** the card colour on busy backgrounds, on trial on Beta (Settings > Appearance > Cards, frost.ts `data-cards`); missing = blue (E) */
export const cardsOf = (v: unknown): NonNullable<Settings['cards']> => (v === 'sapphire' || v === 'clear' || v === 'plum' || v === 'mix' || v === 'light' ? v : 'blue');

export interface Settings {
  name: string;
  language: Lang;
  theme: 'system' | 'light' | 'dark';
  /** the colours of the app (glow + accent), see styles.css `data-palette` */
  palette: 'ember' | 'aurora' | 'mono' | 'sunset' | 'forest' | 'golden' | 'midnight' | 'champagne';
  /** how strong the colour light behind the app is (styles.css `data-glow`); missing = full */
  glow?: 'full' | 'soft' | 'off';
  /** the colour of the sheets, fields and bar tracks on dark (look.css `data-surface`); missing = glass */
  surface?: 'now' | 'glass' | 'deep';
  /** cards, buttons and sheets on dark (surfaces.css `data-look`): Before = as shipped, A/B/C the three options; missing = A */
  look?: 'before' | 'a' | 'b' | 'c';
  /** the card colour on busy backgrounds (frost.ts `data-cards`): E blue, F sapphire, G clear, A plum (v0.1.170); missing = blue */
  cards?: 'blue' | 'sapphire' | 'clear' | 'plum' | 'mix' | 'light';
  /** what is drawn behind the app (ui/Backdrop.tsx, styles.css `.bgx`); missing = classic (the drifting colour field) */
  background?: 'classic' | 'orb' | 'tabs' | 'sunrise' | 'mesh' | 'dots' | 'time' | 'night' | 'photo';
  /** which view a workout opens in; missing or 'last' = the one last used on this phone */
  workoutView?: 'last' | 'list' | 'focus';
  /** what Today shows; anything switched off is simply gone (and so is the water on the Food screen if `water` is off) */
  widgets: { water: boolean; quick: boolean; recents: boolean; week: boolean; weight: boolean; targets: boolean; muscles: boolean; records: boolean };
  /** the Coach's pin on Today: things it noticed (lib/nudges.ts); on unless switched off */
  coachPins?: boolean;
  /** the order of the cards below the workout on Today (screens/TodayCards.tsx); missing ones go at the end */
  todayOrder?: string[];
  motion: 'system' | 'reduce' | 'full';
  units: { weight: 'kg' | 'lb'; distance: 'km' | 'mi'; length: 'cm' | 'in' };
  weekStart: 0 | 1;
  dayStartHour: number;
  goals: { kcal?: number; protein?: number; carbs?: number; fat?: number; fibre?: number; waterMl: number };
  meals: Meal[];
  waterQuick: number[];
  restDefaultSec: number;
  effort: 'off' | 'rpe' | 'rir';
  sound: boolean;
  haptics: boolean;
  /** a notification when a rest ends while Aven isn't on screen (needs the browser's permission); default on */
  restNotify?: boolean;
  remindersEnabled: boolean;
  reminderTime: string;
  onboarded: boolean;
  profile: { goal: Goal; experience: Experience; equipment: EquipmentAccess; days: number[] };
  /** Settings → Profile (all optional): age, sex and height feed the health scores (sleep need, max heart rate); the goal
   *  weight is shown against your weigh-ins. Weights in kg, height in cm, whatever the display units. */
  body?: { birthYear?: number; sex?: 'male' | 'female'; heightCm?: number; goalWeightKg?: number };
  plateStep: number;
  foodLookup: boolean;
  /** heavy-day notices (lib/eating.ts `heavyMode`): on = noticed, decided, maybe a small trim; quiet = noticed only, the
   *  Coach knows; off = not noticed. Missing = by goal (fat loss on, other goals quiet) */
  heavyDays?: 'on' | 'quiet' | 'off';
  /** the day notices last turned on: days before it are never judged (no pop-ups about the past) */
  heavyOnSince?: string;
}

export interface DailyNote { date: string; training?: string; nutrition?: string }

/** Something lasting the user told the Coach about themselves ("no separate leg day — wrestling covers legs"). The Coach
 *  reads these before every answer; the user can see, change and remove them in Settings → Coach memory. */
export type MemoryKind = 'goal' | 'preference' | 'health' | 'schedule' | 'gear' | 'food' | 'other';
export interface MemoryNote {
  id: string;
  text: string;
  kind: MemoryKind;
  at: number;
  /** the exercises it is about (a sore shoulder on overhead press): the workout shows it beside them */
  exerciseIds?: string[];
  /** a temporary thing ("sick until Friday"): the last day it applies (YYYY-MM-DD). After it, the Coach no longer reads it */
  until?: string;
  /** when it was last reworded (a newer fact replaced the older one) */
  updatedAt?: number;
  /** its earlier wordings, newest first (up to 3) */
  was?: { text: string; at: number }[];
}

/** One weekly review as kept: the week's last day, the Coach's verdict and up to two priorities (ids from lib/weekReview). */
export interface WeekReviewNote { week: string; at: number; verdict?: string; priorities: { id: string; text: string }[] }

export interface AppData {
  v: number;
  settings: Settings;
  foods: Food[]; // custom + saved (from lookups) foods
  favourites: string[];
  savedMeals: SavedMeal[];
  recipes: Recipe[];
  entries: FoodEntry[];
  water: WaterEntry[];
  exercises: Exercise[]; // custom only
  routines: Routine[];
  schedule: Schedule;
  sessions: WorkoutSession[];
  active: WorkoutSession | null;
  weights: WeightLog[];
  measurements: Measurement[];
  photos: ProgressPhoto[];
  activities: ActivityLog[];
  notes: DailyNote[];
  /** remembered dictation choices: folded query → food id */
  choices: Record<string, string>;
  /** your own progression step per exercise (kg), when it differs from the default */
  increments: Record<string, number>;
  /** what the Coach remembers about you */
  memory: MemoryNote[];
  /** the weekly reviews (the newest 26): the Coach's verdict and the priorities it set, so the next review can check them */
  reviews?: WeekReviewNote[];
  /** steps per day from the watch (Health Connect), the newest ~2 years */
  steps: StepDay[];
  /** the rest of what the watch measured, per day (newest ~2 years) */
  health?: HealthDay[];
  /** heavy days being caught up (lib/eating.ts), the newest 30 */
  catchUps?: CatchUp[];
  /** when the calorie target changed (lib/eating.ts `targetOn`), so a day is judged against the target it had */
  targets?: TargetChange[];
  /** things done or said once, with the day (heavySeen: heavy days already there were marked seen; invisibleSaid,
   *  helpSaid, ageAsked: the Coach brought it up) */
  marks?: Record<string, string>;
  /** watch workouts deleted by hand (their Health Connect ids, the newest 500): never brought back by a sync */
  hcGone?: string[];
  demo: boolean;
}
