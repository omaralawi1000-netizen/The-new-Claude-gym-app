# Gate report: pushdown_bar

**RED: fix before any judge** (2 fail, 7 pass, 2 for a human eye)

- PASS  Pixel stage ran on every frame (holefill3 made all final frames): raw 130, final 130
- PASS  No diagnostic job crashed: none
- PASS  Hands on the prop (contact): inside 0, worst clearance 0.3 mm
- FAIL  Cable clear of outlines: tangent runs 59, longest 72 px
- FAIL  Hands never slide on the bar (SLIDEDIAG): max range 13.36 mm
- INFO  Far-limb slivers (judge decides size): frames 18,75,94,113,0,19,76,95,114,28,66,85,123,29,67,86,105,124,30,68,106,125,31,69,107,126,13,32,70,108,127,14,52,71,109,128,15,34,72,110,129,16,73,111,17,36,74,93,112,1,20,39,77,96,115,2,21,40,78,97,116,3,22,79,98,117,4,23,80,118,5,24,81,119,6,25,82,120,7,26,83,121,8,27,84,122
- PASS  Background specks after the fill (speck2h): 0 frames
- INFO  Dimmed gap ends (check in sequence): frames 0,2,11,18,19,20,22,25,26,27,28,29,30,31,32,33,34,35,38,52,55,63,74,75,76,77,78,79,80,81,82,83,85,86,87,88,89,90,92,97,111,112,113,122,124,128
- PASS  No pops or flicker (clipcheck): []
- PASS  Motion smooth, no hitch (blurred steps): SMOOTH steps 130 median 0.435 max 1.336 | seam 0.084 vs neighbours 0.106 | spikes none
- PASS  Pixel scans saw every frame: speck2h 130 frames, clipcheck "frames N" ok

Logs and crops: this folder. Final frames: ../pushdown_bar_final/
