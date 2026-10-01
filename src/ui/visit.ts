import { createContext, useContext } from 'react';

/**
 * Tab screens stay mounted between visits (switching tabs no longer rebuilds a whole screen). This counter goes up
 * each time a screen is shown again, so small "draw in" animations (rings, chart lines, bars) can key on it and
 * replay exactly as they did when screens were rebuilt on every visit.
 */
export const VisitContext = createContext(0);
export const useVisit = () => useContext(VisitContext);
