/**
 * The motion language. Every animation in the app should use one of these, so things that do the same job move the same
 * way (it is the difference between "smooth" and "made by one hand"). CSS has the same curves as --ease-spring and
 * --ease-smooth (real spring curves sampled into linear(), see styles.css).
 *
 *   tap      a press, a tick, a toggle: quick, no wobble
 *   smooth   content settling: cards, rows, layout changes
 *   surface  a sheet or popup arriving; surfaceExit carries a flick out
 *   window   the live workout opening out of its card
 *   bouncy   a moment worth celebrating: a sent message, a record, a gain
 *   gentle   slow fills: the rings, progress
 *   keyboard follows the on-screen keyboard's own curve
 */
export const TAP = { type: 'spring', stiffness: 600, damping: 42, mass: 0.7 } as const;
export const SMOOTH = { type: 'spring', stiffness: 210, damping: 28, mass: 1 } as const; // ~330 ms to settle: calm, not slow
// Surfaces move calmly: a sheet takes about half a second to arrive and settles without a bounce (critically damped);
// leaving is a touch quicker than arriving, as on iOS.
export const SURFACE = { type: 'spring', stiffness: 130, damping: 22.5, mass: 1, restDelta: 0.001 } as const;
export const SURFACE_EXIT = { type: 'spring', stiffness: 170, damping: 26, mass: 1, restDelta: 0.002 } as const;
export const WINDOW = { type: 'spring', stiffness: 120, damping: 22, mass: 1 } as const;
export const BOUNCY = { type: 'spring', stiffness: 340, damping: 20, mass: 0.8 } as const;
export const GENTLE = { type: 'spring', stiffness: 60, damping: 18 } as const;
export const KEYBOARD = { type: 'spring', stiffness: 460, damping: 40, mass: 0.9, restDelta: 0.5 } as const;
