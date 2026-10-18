import { useStore } from '../state/store';
import type { Exercise } from './types';

/** Names speech-to-text should expect (your recent lifts and foods): it hears them right more often. Shared by the orb
 *  and the Coach's microphone. */
export function sttNames(pool: Exercise[]): string[] {
  const st = useStore.getState();
  const foods = [...new Set([...st.entries].sort((a, b) => b.at - a.at).map((e) => e.snap.name))].slice(0, 25);
  const lifts = [...new Set(st.sessions.slice(-6).flatMap((x) => x.exercises.map((e) => pool.find((q) => q.id === e.exerciseId)?.name ?? '')))].filter(Boolean);
  return [...lifts, ...foods].slice(0, 40);
}
