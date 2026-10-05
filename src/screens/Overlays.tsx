import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { OverlayMeta, OverlayZ } from '../ui/Sheet';
import { useUI, type Overlay } from '../state/ui';
import { useStore } from '../state/store';
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

/**
 * The live workout stays mounted once it has been opened, until it is finished or discarded: minimising only slides it away
 * (and hides it), so opening it again is just the slide — the whole list used to be rebuilt on every Resume, a pause after
 * the tap each time. While it is open it sits in the stack at the workout overlay's place.
 */
function WorkoutHost() {
  const overlays = useUI((s) => s.overlays);
  const activeId = useStore((s) => s.active?.id ?? null);
  const idx = overlays.findIndex((o) => o.type === 'workout');
  const last = useRef<{ o: Overlay; z: number } | null>(null);
  if (idx >= 0) last.current = { o: overlays[idx], z: 60 + idx * 10 };
  const [kept, setKept] = useState<string | null>(null);
  useEffect(() => { if (idx >= 0 && activeId) setKept(activeId); }, [idx, activeId]);
  if (!activeId || !last.current || (idx < 0 && kept !== activeId)) return null;
  const { o, z } = last.current;
  return <OverlayZ.Provider value={z}><OverlayMeta.Provider value={meta(o.id, false)}><ActiveWorkout key={activeId} props={o.props ?? {}} open={idx >= 0} /></OverlayMeta.Provider></OverlayZ.Provider>;
}

/** Renders the overlay stack. Each overlay owns its presentation (sheet, morph, or full-screen). */
export function Overlays() {
  const overlays = useUI((s) => s.overlays);
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
    </>
  );
}
