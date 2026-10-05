import { AnimatePresence } from 'motion/react';
import { OverlayMeta, OverlayZ } from '../ui/Sheet';
import { useUI } from '../state/ui';
import { ActiveWorkout } from './workout/Active';
import { SettingsSheet } from './Settings';
import { FoodSearch } from './food/Search';
import { FoodDetail } from './food/Detail';
import { QuickAdd, CustomFood } from './food/QuickCustom';
import { RecipeEditor, RecipeList, SavedMeals } from './food/Meals';
import { Scanner } from './food/Scanner';
import { DatePicker, DayNotes, EntryMenu, MealCopy, WaterSheet } from './food/Menus';
import { ExerciseDetail } from './workout/ExerciseDetail';
import { ExerciseEditor, ExercisePicker } from './workout/Picker';
import { SessionDetail, Summary } from './workout/Summary';
import { RoutineEditor } from './workout/Routine';
import { ActivityLog, Reschedule, Schedule } from './workout/Schedule';
import { MeasureSheet, PhotosSheet, WeightSheet } from './Body';
import { Onboarding } from './Onboarding';
import { Coach } from './Coach';
import { VoiceComposer } from './Voice';
import { PhotoFood } from './food/PhotoFood';

// one stable object per overlay, so its consumers don't re-render on every change to the stack
const metas = new Map<string, { id: string; page: boolean }>();
const meta = (id: string, page: boolean) => { let m = metas.get(id); if (!m) { m = { id, page }; metas.set(id, m); if (metas.size > 200) metas.delete(metas.keys().next().value!); } return m; };

/** Renders the overlay stack. Each overlay owns its presentation (sheet, morph, or full-screen). */
export function Overlays() {
  const overlays = useUI((s) => s.overlays);
  return (
    <AnimatePresence>
      {overlays.map((o, idx) => {
        const p = o.props ?? {};
        const el = (() => { switch (o.type) {
          case 'workout': return <ActiveWorkout key={o.id} props={p} />;
          case 'settings': return <SettingsSheet key={o.id} props={p} />;
          case 'foodSearch': return <FoodSearch key={o.id} props={p} />;
          case 'foodDetail': return <FoodDetail key={o.id} props={p} />;
          case 'quickAdd': return <QuickAdd key={o.id} props={p} />;
          case 'customFood': return <CustomFood key={o.id} props={p} />;
          case 'recipes': return <RecipeList key={o.id} props={p} />;
          case 'recipe': return <RecipeEditor key={o.id} props={p} />;
          case 'savedMeals': return <SavedMeals key={o.id} props={p} />;
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
        return <OverlayZ.Provider key={o.id} value={60 + idx * 10}><OverlayMeta.Provider value={meta(o.id, !!o.page)}>{el}</OverlayMeta.Provider></OverlayZ.Provider>;
      })}
    </AnimatePresence>
  );
}
