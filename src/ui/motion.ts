/**
 * Apple's springs, exactly: SwiftUI defines a spring by its perceptual duration and bounce
 * (Spring(duration:bounce:)) — stiffness = (2π / duration)², damping = 4π(1 − bounce) / duration, mass 1.
 * .smooth is (0.5, 0), .snappy (0.5, 0.15), .bouncy (0.5, 0.3); sheets and full-screen cards use the default 0.5 s.
 */
export const apple = (duration: number, bounce = 0) => ({ type: 'spring' as const, stiffness: (2 * Math.PI / duration) ** 2, damping: (4 * Math.PI * (1 - bounce)) / duration, mass: 1 });

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
export const TAP = apple(0.3, 0.15);            // a press, a tick: Apple .snappy, quick
export const SMOOTH = apple(0.4);                // content settling (Apple .smooth, a touch quicker for small moves)
export const SURFACE = { ...apple(0.5), restDelta: 0.001 }; // a sheet / card arriving: Apple's default .smooth (0.5 s, no bounce)
export const SURFACE_EXIT = { ...apple(0.42), restDelta: 0.002 }; // leaving is a touch quicker than arriving
export const WINDOW = SURFACE;
export const BOUNCY = apple(0.5, 0.3);            // Apple .bouncy: a record, a gain, a sent message
export const GENTLE = { type: 'spring', stiffness: 60, damping: 18 } as const;
export const KEYBOARD = { type: 'spring', stiffness: 460, damping: 40, mass: 0.9, restDelta: 0.5 } as const;
