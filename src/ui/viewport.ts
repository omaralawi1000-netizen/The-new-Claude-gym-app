/**
 * The window's height, read once and again on resize. Reading window.innerHeight while rendering makes the browser finish
 * styling the page on the spot whenever anything is pending — it was a style recalculation on every render of the live
 * workout (several per opening, mid-slide) and of every sheet.
 */
export let viewportH = typeof window !== 'undefined' ? window.innerHeight : 900;
if (typeof window !== 'undefined') window.addEventListener('resize', () => { viewportH = window.innerHeight; }, { passive: true });
