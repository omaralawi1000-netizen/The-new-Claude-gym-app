import { useUI } from '../state/ui';
import { useAi, anyBrain } from '../state/ai';
import { cameraUsable } from './photos';

/** The camera icons in Food: one tap opens the camera; the shot opens "Snap your plate" with the photo already read.
 * Without an AI key (or a camera) the plate sheet opens as before, which says what is missing and still has its own buttons. */
export function openFoodPhoto(date: string, mealId: string) {
  const ui = useUI.getState();
  if (!cameraUsable() || !anyBrain(useAi.getState())) { ui.push('photoFood', { date, mealId }); return; }
  ui.push('camera', { open: (file: File) => ['photoFood', { date, mealId, file }] });
}
