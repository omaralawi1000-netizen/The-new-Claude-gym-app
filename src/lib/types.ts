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
  rest?: { endsAt: number; total: number; exerciseId: string } | null;
  records?: PersonalRecord[];
}

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
}

// ── Body & activity ─────────────────────────────────────────

export interface WeightLog { id: string; date: string; kg: number; at: number }
export type MeasureKind = 'waist' | 'chest' | 'hips' | 'arm' | 'thigh' | 'neck';
export interface Measurement { id: string; date: string; kind: MeasureKind; cm: number }
export interface ProgressPhoto { id: string; date: string; note?: string }

export type ActivityKind = 'wrestling' | 'run' | 'walk' | 'cycle' | 'swim' | 'row' | 'hike' | 'mobility' | 'warmup' | 'recovery' | 'other';
export interface ActivityLog {
  id: string;
  date: string;
  kind: ActivityKind;
  durationSec: number;
  distanceM?: number;
  /** wrestling: rounds/goes on the mat, and how hard it felt (1 easy · 2 hard · 3 max) */
  rounds?: number;
  intensity?: 1 | 2 | 3;
  note?: string;
  at: number;
}

// ── Settings ────────────────────────────────────────────────

export type Goal = 'strength' | 'muscle' | 'fatloss' | 'endurance' | 'general';
export type Experience = 'new' | 'some' | 'experienced';
export type EquipmentAccess = 'fullGym' | 'homeDumbbells' | 'bodyweight' | 'barbellHome';

export interface Settings {
  name: string;
  language: Lang;
  theme: 'system' | 'light' | 'dark';
  /** the colours of the app (glow + accent), see styles.css `data-palette` */
  palette: 'ember' | 'aurora' | 'mono' | 'sunset' | 'forest';
  /** what Today shows; anything switched off is simply gone (and so is the water on the Food screen if `water` is off) */
  widgets: { water: boolean; quick: boolean; recents: boolean; week: boolean; weight: boolean };
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
  plateStep: number;
  foodLookup: boolean;
}

export interface DailyNote { date: string; training?: string; nutrition?: string }

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
  demo: boolean;
}
