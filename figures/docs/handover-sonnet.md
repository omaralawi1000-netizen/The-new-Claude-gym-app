# Figures handover (25 Oct, Opus figures thread to the new Sonnet thread)

## Where everything is
- **Scene:** `/mnt/project-files/anatomy-proof/rig/scene12.blend` (208 MB, self-contained: no linked libraries, no images).
- **All working code:** `/mnt/project-files/anatomy-proof/batch1/code-r9/`. This copies the whole working folder: every `.py`, `.sh` and `.json`, plus `motions/`. It is newer than code-r8 and includes the pushdown rework, `gate.sh`, `gatereport.py` and `smooth.py`.
- **Rules:** `../figure-rules.md`.
- **Plan (approved by the coordinator):** `../plan-all-exercises.md`.
- **Hammer clip 3:** APPROVED by Omar and LOCKED in `batch1/rope-hammer-curl/clip3/approved/`. Do not change it.

## Rebuild the environment from scratch
```
python3 -m venv bpyenv                    # Python 3.13 here; bpy 5.2.2 needs 3.13
bpyenv/bin/pip install bpy==5.2.2         # pulls numpy 2.x, requests, zstandard, cython, attrs/cattrs
mkdir ap && cp -r /mnt/project-files/anatomy-proof/batch1/code-r9/* ap/ && cp /mnt/project-files/anatomy-proof/rig/scene12.blend ap/
cd ap                                    # every command runs from here (the scripts use ../bpyenv/bin/python)
```
- Nothing else was installed: no scikit-image, no OIDN package (Cycles' built-in denoiser is used), no GPU.
- The image scripts (`speck2h.py`, `holefill*.py`, `bgspeck.py`, `clipcheck.py`, `smooth.py`) run on the system `python3` with numpy and Pillow. If those are missing: `python3 -m pip install numpy pillow`.
- `ffmpeg` is needed to encode.
- **Wrapper:** `run5.py scene.blend script.py -- args` opens the blend and runs the script with `bpy` as a module. The data files `joints.json`, `legjoints.json` and `grip.json` are read from the current folder.

## Commands
- **Full clip:**
  `env MOTION=<m> PERSIST=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/<outdir> - 16 960 640 clipref`
  - This gives 130 PNGs. It takes about 26-30 s per frame on 4 cores, so about 65 min for a full clip.
  - Add `FRAMES_SUB=0,20,55` to render only some frames.
- **Diagnostics (no render):** the same command with `-- still /dev/null 0` plus one flag:
  - `GRIPDIAG=1` (contact, ROPEMONO, ROPESTRAIGHT; about 1 min/frame, so split it);
  - `TILTDIAG=1`, `FARDIAG=1 FAR_FIST_MIN=150`, `CABLEDIAG=1`, `CAMDIAG=1`;
  - `SLIVERDIAG=1 SLV_BOX=…`;
  - `POCKETDIAG=1 POCKET_OUT=dir POCKET_BOX=…` (ray masks for the pinhole fill);
  - `SLIDEDIAG=1` (bars);
  - `ROPEDBG=1`.
  - Each motion's `ENV` dict sets its render settings as defaults (render8 line 7). Shell env always wins.
- **Variants:** `python3 mkvar2.py BASE NAME "ch=[...]"`.
  - Name variants `pushdown_xxx` (base name, then `_`), so the glow picks the base's muscles. This was fixed today: before the fix, a variant called `pdc140` glowed the biceps.
- **Encode:**
  - `ffmpeg -framerate 30 -i dir/f%03d.png -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart x.mp4`
  - `ffmpeg -framerate 30 -i dir/f%03d.png -c:v libvpx-vp9 -crf 36 -b:v 0 -pix_fmt yuv420p x.webm`
- **Video page:** `python3 /mnt/project-files/tools/clip-page.py --title … --out page.html --clip "Label=x.mp4"`, then publish it with the Artifact tool.

## gate.sh (new, the plan's single red/green gate)
- **Usage:** `./gate.sh MOTION RAWDIR [x0,y0,x1,y1 hands box] [processes]` runs every check on every frame. It writes `gate/<M>/gate-report.md` and puts the final filled frames in `gate/<M>_final/`. It exits 1 if anything is red.
- **Checks:**
  - every prop: contact;
  - ropes: ROPEMONO, ROPESTRAIGHT, far end, cable, tilt smoothness (`tiltcheck.py` ≤ 0.15 deg/f²), camera gap;
  - bars: slide;
  - every prop: slivers;
  - pixels: pockets (holefill3), notches (holefill2, 2 auto passes), final speck scan, dimmed gap ends, clipcheck, blurred-step smoothness.
- **State:** it passes a syntax check. **It is NOT validated yet.** A 6-frame smoke test on hammer frames (`smoke_raw`) was running when I stopped. Re-run that smoke test first and read its report; expect parser fixes.

## Pushdown rework (r8, rope realism; Omar gave the go 25 Oct)
- **Settings** (`code-r9/motions/pushdown.py`, backup of the r7-era motion: `pushdown_r8pre.py`):
  - Camera `cam_orbit -140` (was -115): both fists show beside the hips, so the far-arm hacks are removed (abduct_l, twist_l and wrist_l are all 0).
  - Arms split 2 → 7.5 deg at lockout; twist peak 105 (was 120).
  - New keyed channel `rope_tilt [(16,0),(44,18),(60,18.6),(88,0)]`: radial fist tilt into the rope line, so the knobs hang under the pinkies at lockout. Its tilt check passes at 0.13 deg/f².
  - ENV: `COL_HIGH_X -0.35` (column off to the far side), `HIGH_Z 1.95`, `CAM_LENS 40`, `CAM_TZ 0.95`, `BASE_H 0.05` (a thicker base plate; the 2.4 cm plate vanished from behind).
  - `props._carriage` builds one straight swivel arm when the high column is offset. The cable tail runs to the column under it.
- **Done:** 8 key stills with these settings in `code-r9/pushdown-r8-keys/` (f0, 20, 36, 48, 60, 72, 90, 110). My read: the rope hangs from the thumbs to the clip and the V opens at lockout. Self-checked only, never judged.
- **In flight when I stopped:** `pd40.sh` (key stills, then far, cable, cam and contact checks). Only the far and tilt logs were copied (`pushdown-r8-logs/`). Re-run the checks, or better, run `gate.sh` on a full clip.
- **Next:**
  1. Render the full clip.
  2. Run `gate.sh pushdown <dir> <box>`. The hands box needs measuring for -140 (the hammer used 300,100,500,420).
  3. Fix every red.
  4. Run a stills judge, then a clip judge (9+). The brief gets the rope realism rules and the reference card.
  5. Fix the flaws, then show Omar.
  6. Batch A starts after his yes, with no new ask (coordinator).

## Open question (waiting on the coordinator/Omar)
- **Hammer clip 3 tilt:** the post-judge fist-tilt fix fails the 0.15 deg/f² tilt rule: max 0.40 at f23 (and the mirror around f100-106). The judged version had 0.12.
- It is the tilt easing out over about 5 frames at f18-24. Omar approved the clip anyway, and it is locked.
- If they want it fixed: add the same keyed `rope_tilt` channel to hammer (28-frame ramps), re-render f0-30 and f95-129, and gate it, as a NEW clip folder (clip 4). Never edit `clip3/approved/`.

## Lessons (also in memory figures-lessons)
- Never `pgrep` or `pkill -f` with a pattern that appears in your own command (it kills your own shell). Kill by PID from `ps`.
- Dim the ends of closing gaps; never fill them.
- Run `tiltcheck.py` after any tilt change. I didn't, and that is how the hammer issue slipped through.

## gate.sh smoke test result (25 Oct, after the handover)
I ran `./gate.sh hammer smoke_raw 300,100,500,420 1` on 6 hammer frames (f000-f005). It ran end to end. What it showed:
- **Diagnostics all PASS:** contact, ROPEMONO, ROPESTRAIGHT, far end, cable, camera, slivers.
- **Tilt FAIL 2.04:** false. On a 6-frame set, tiltcheck wraps f005 back to f000 (the clip is a loop), so the jump is fake. On a full 130-frame clip it is real.
- **Pixel stage is BROKEN on short sets:** `holefill3.py` crashed: `FileNotFoundError gate/hammer/masks/fg_f129.npy`. It looks at loop neighbours, so f000 wants f129. gate.sh then copied an empty `hf3` to `gate/hammer_final/` (0 files). The speck scans reported "0 frames, PASS" (false pass), and `clipcheck.py` / `smooth.py` crashed on the empty folder.
- **Fixes to make before trusting gate.sh** (I did not make them, per the stop):
  1. After holefill3, check `$O/hf3` has as many PNGs as `$RAW`; if not, mark FAIL "holefill3 crashed" in the report (don't silently continue).
  2. Every pixel check (speck2h, bgspeck, clipcheck, smooth) must FAIL when it sees 0 frames.
  3. For partial sets, give holefill3 and tiltcheck a no-wrap option (or only smoke-test on a full 130-frame clip).
- So the first real validation is `gate.sh` on a full rendered clip (the pushdown, step 2 above), after fixes 1-2.
- `pd40.sh` (pushdown key stills + checks) was still running in my old session when I stopped; its outputs never reached the shared folder, so treat them as not done.

## pd40 results (pushdown r8 checks, finished after the stop; logs in `code-r9/pushdown-r8-logs/`)
- **PASS:** contact 0 inside (worst clearance 0.3 mm), ROPEMONO 0, ROPESTRAIGHT 0, all 130 frames. Camera: worst near-fist to column gap 34 px at f60, pulley top margin 34 px.
- **RED 1, far fist floating, 9 frames:** f25-28 and f82-86. The far rope cap shows (8-66 px) while the far fist is only partly visible (53-145 px, under the 150 px bar) as it comes out from behind the hip. Likely fix: a little more far-arm abduct or camera orbit in those ramps so the fist shows before the cap, then re-run FARDIAG. Or judge whether it reads as floating at all (look at zoomed crops first).
- **RED 2, cable near outlines:** 27 tangent runs, longest 51 px at f88 (the gate wants 0). Check crops around f80-95; maybe move the cable or column slightly (COL_HIGH_X).
- So the pushdown is NOT ready for a full render + judge yet: fix these two first.
