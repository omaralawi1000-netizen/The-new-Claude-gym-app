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
export const SMOOTH = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const;
export const SURFACE = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 } as const;
export const SURFACE_EXIT = { type: 'spring', stiffness: 260, damping: 34, mass: 0.9, restDelta: 0.002 } as const;
export const WINDOW = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 } as const;
export const BOUNCY = { type: 'spring', stiffness: 340, damping: 20, mass: 0.8 } as const;
export const GENTLE = { type: 'spring', stiffness: 60, damping: 18 } as const;
export const KEYBOARD = { type: 'spring', stiffness: 460, damping: 40, mass: 0.9, restDelta: 0.5 } as const;
