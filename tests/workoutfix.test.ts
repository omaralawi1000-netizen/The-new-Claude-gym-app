// @vitest-environment jsdom
// Fixes from the v0.1.160 workout audit: the plan, records and set counting stay right after edits.
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/state/store';
import { defaultData } from '../src/state/defaults';
import type { Routine } from '../src/lib/types';

const routine = (id: string, name = id): Routine => ({ id, name, items: [], createdAt: 0, updatedAt: 0 } as unknown as Routine);

beforeEach(() => {
  localStorage.clear();
  const d = defaultData(); d.settings.onboarded = true;
  useStore.getState().replaceAll(d);
});

describe('deleting a routine and Undo', () => {
  it('puts it back on its weekdays, one-off days and rotation place', () => {
    const st = useStore.getState();
    st.patch({ routines: [routine('A'), routine('B'), routine('C')] });
    st.setSchedule({ weekly: { 0: null, 1: 'A', 2: 'B', 3: null, 4: 'A', 5: null, 6: null }, overrides: [{ date: '2026-10-22', routineId: 'A' }], rotation: { order: ['B', 'A', 'C'], pointer: 1, perWeek: 3 } });
    const removed = useStore.getState().deleteRoutine('A')!;
    let sch = useStore.getState().schedule;
    expect(sch.weekly[1]).toBeNull();
    expect(sch.overrides).toEqual([]);
    expect(sch.rotation.order).toEqual(['B', 'C']);
    useStore.getState().restoreRoutine(removed.routine, removed.slots);
    sch = useStore.getState().schedule;
    expect(useStore.getState().routines.map((r) => r.id)).toContain('A');
    expect(sch.weekly[1]).toBe('A');
    expect(sch.weekly[4]).toBe('A');
    expect(sch.weekly[2]).toBe('B');
    expect(sch.overrides).toEqual([{ date: '2026-10-22', routineId: 'A' }]);
    expect(sch.rotation).toMatchObject({ order: ['B', 'A', 'C'], pointer: 1 });
  });
  it('does not take a weekday back that was given to another routine meanwhile', () => {
    const st = useStore.getState();
    st.patch({ routines: [routine('A'), routine('B')] });
    st.setSchedule({ weekly: { 0: null, 1: 'A', 2: null, 3: null, 4: null, 5: null, 6: null } });
    const removed = useStore.getState().deleteRoutine('A')!;
    useStore.getState().setSchedule({ weekly: { ...useStore.getState().schedule.weekly, 1: 'B' } });
    useStore.getState().restoreRoutine(removed.routine, removed.slots);
    expect(useStore.getState().schedule.weekly[1]).toBe('B');
  });
});
