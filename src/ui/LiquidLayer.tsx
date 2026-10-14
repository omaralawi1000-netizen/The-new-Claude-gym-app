import { forwardRef } from 'react';

/**
 * The glass drawn behind a block of cards while it changes shape (ui/liquid.ts). Every `.lqp` path is the same outline (its `d`
 * is animated, all alike): the fill, the hairline ring clipped inside it, the light on its top edge (the outline minus itself
 * one pixel lower), the card's own rim light (`.plinth::after`: a gradient ring, drawn with one gradient over the whole block) and
 * the hairline between rows. Hidden until a change plays.
 * (They are separate paths, not <use> copies: Chrome does not carry an animated `d` over to a <use> instance.)
 */
export const LiquidLayer = forwardRef<SVGSVGElement>(function LiquidLayer(_, ref) {
  return (
    <svg ref={ref} className="liquid" aria-hidden width="100%" height="100%">
      <defs>
        <linearGradient id="lqG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="1">
          {/* stops are filled in when a change plays (read from the real cards) */}
        </linearGradient>
        <linearGradient id="lqS" x1="0" y1="0" x2="0" y2="1" />
        <clipPath id="lqC"><path className="lqp" d="M0 0" /></clipPath>
        <mask id="lqH" maskUnits="userSpaceOnUse" x="-40" y="-40" width="3000" height="6000">
          <path className="lqp" d="M0 0" fill="#fff" />
          <path className="lqp" d="M0 0" fill="#000" transform="translate(0 1)" />
        </mask>
      </defs>
      <path className="lqp lq-fill" d="M0 0" />
      <g className="lq-sheen" clipPath="url(#lqC)" />
      <path className="lqp lq-ring" d="M0 0" clipPath="url(#lqC)" />
      <path className="lqp lq-gl" d="M0 0" clipPath="url(#lqC)" stroke="url(#lqG)" />
      <path className="lqp lq-hl" d="M0 0" mask="url(#lqH)" />
      <path className="lq-div" d="M0 0" />
    </svg>
  );
});
