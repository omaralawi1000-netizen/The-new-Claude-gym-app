# Fleck judge v2 - rope/near-fist junction, box (318,340,358,364)

Verdict: MOSTLY FIXED (call it PARTLY only for one tiny speck, see below).

Viewed (x6 nearest-neighbour crops): f38-44 (all), f66-84 (all), pairs f41/42, f68/69/70, f74/75, f80/81, plus f44,48,52,56,60,64,66,68 for the gap. Not viewed: other frames, and not played at speed. Judged from stills only.

- Lattice / checker of white pixels: GONE in every frame viewed. Rope reads as smooth grey with normal shading.
- Pale blob: GONE. No large pale patch on the rope in f39-41, f70-78, f80-82.
- Pairs f41->42, f68->70, f74->75, f80->81: no pop, no flash, no change in rope texture; changes are just the fist moving in. f68->70 shows the fist sweeping in smoothly.
- Gap f44-68: reads natural. A small background-coloured wedge between rope and fist/knuckles, same shade as the backdrop, with clean edges. No speckle inside it.
- Left over: in f77-78 there is a tiny light notch/speck where the rope passes behind the fingers (about 1-2 px at source, upper right of the crop). At x6 it reads as a small gap between rope and finger, not a hole in the rope. Barely visible at 960x640. Not a blocker.

Optional fix if you want it perfect: in f77-78 only, fill the 1-3 px light pixels inside roughly (344-352,344-350) with the median of the surrounding rope/finger pixels (3x3 median, only for pixels brighter than the neighbours by >40 luma). Touch no other frames.
