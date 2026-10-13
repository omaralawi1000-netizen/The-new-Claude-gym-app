# Aven's 3D figures: the renderer

Offline only: nothing here ships in the app. It renders each exercise's rep into a see-through WebM in
`public/figures/<exercise-id>.webm`, which `src/screens/workout/FigureClip.tsx` plays.

- `shader.js`: the body and the look. Sculpted from rounded shapes (signed distance fields) and drawn by ray marching
  in WebGL2: matte clay, a key light, a fill light, a floor bounce and a rim light, a fine clay grain, a soft floor
  shadow, and the glow on the worked muscles (bits in `moves.js` `H`).
- `rig.js`: posing. The torso is placed in the world, and arms and legs reach their targets with two-bone IK. It also
  holds the equipment parts and the camera fitting (`fitCamera` keeps the whole rep in frame).
- `gear.js`: equipment (benches, rack, Smith machine, dip bars, cable towers, kettlebell, handles).
- `moves.js` (curl and the first bench press) and `moves1.js` (batch 1: chest and pressing): one function per exercise,
  `t` in 0..1 is one rep (`rep()`: the lift over 38%, a beat, a slower way back, 2.8 s).
- `render.html`: bakes each pose into the shader as constants (SwiftShader runs straight-line code much faster than
  loops over uniforms). Keep each part's distance in its own variable with a branch-free min at the end: chains of
  if/else per part made compiling explode past ~20 parts.

Run (needs Playwright's Chromium; software GPU):
- Contact sheet to check poses: `node sheet.mjs out/sheet.png 360 240 0,0.4 bench-press dip`
- Clips: `node clips.mjs out/clips bench-press dip ...`, then copy `out/clips/*.webm` to `public/figures/` and bump `V` in
  `FigureClip.tsx` if a clip changed. About 6–10 s per pose on 4 cores, ~44 poses per clip (a pose is reused for every
  frame where the rep is at the same point).

The glow is rendered in one warm colour; the app turns it to each look's colour with a CSS filter, so keep the clay and
equipment colours exactly neutral grey (any tint would turn too).
