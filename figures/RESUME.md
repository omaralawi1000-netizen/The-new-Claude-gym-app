# Exercise figures: resume guide (27 Oct 2026)

A new session with only this repo should be able to pick the figures up exactly where they stopped. Read this file,
then `batchA/HANDOVER.md` (the newest state), then `docs/figure-rules.md`.

## What the figures are
Rendered 3D clips (Blender, Cycles, 130 frames, 960x640, loop) of a grey clay muscle figure with the working muscles
glowing red, built from the Z-Anatomy model (credit it in Settings, CC BY-SA 4.0). They play in the workout screen
(`src/screens/workout/Figure.tsx`, `Clip.tsx`, files in `public/figures/`).
Omar judges them closely on his phone. **The barbell curl (live, v0.1.154) is the quality minimum: a move that can't reach
it doesn't ship.**

## What is in this folder
| Path | What |
|---|---|
| `code/` | the whole working folder (newest, "code-r9"): `render8.py` (renderer), `scene.py`/`build*.py` (scene build), `gate.sh` + `gatereport.py` (the one red/green check), diagnostics, `run5.py` wrapper, `joints.json`/`legjoints.json`/`grip.json`, and `motions/` (one file per exercise and round) |
| `batchA/` | newer than `code/`: Batch A motions (`pushdown_bar.py`, `curl_cable.py`, `pulldown_straight.py`, `pushdown_single.py`, `pushdown_d.py` = the approved body motion template), the newer `render8.py`/`props.py`/`pose2.py`, `gate.sh`, `holefill3.py`, run scripts, and `HANDOVER.md` |
| `docs/` | `figure-rules.md` (look, grip, motion, camera, rope realism rules), `patterns.md` (movement groups), `plan-all-exercises.md` (approved plan and order), `handover-sonnet.md` (25 Oct setup + gate notes), `naturalness-r11.md`, `grip-neck-r12.md`, `reference-card-template.md`, `lessons-memory.md` |
| `verdicts/` | judge verdicts and per-round READMEs (barbell r16-r18, EZ curl, rope hammer, rope pushdown, bar pushdown) |

**Use `batchA/` files over `code/` files when the names match** (copy `batchA/*` over the working folder; motions go in `motions/`).

## Big files (not in git)
Listed in [`ASSETS.md`](ASSETS.md): scene, approved hammer clip, pushdown body clip, Batch A partial frames, pushdown keys.
Where they live and how to restore them is in [`ASSETS.md`](ASSETS.md). They are not public: get them from Omar / the project folder (see ASSETS.md). Without the scene file you cannot render.

## Set up (about 10 min)
```
python3 -m venv bpyenv                 # needs Python 3.13
bpyenv/bin/pip install bpy==5.2.2      # pulls numpy 2.x etc. No GPU, no OIDN package needed.
mkdir ap && cp -r figures/code/* ap/
cd figures/batchA && cp render8.py props.py pose2.py holefill3.py fixfleck.py gate.sh gatereport.py run_*.sh ../../ap/ \
  && cp pushdown_bar.py curl_cable.py pulldown_straight.py pushdown_single.py pushdown_d.py ../../ap/motions/ && cd ../..
```
The second line puts the newer Batch A files over the older ones (motion files go in `ap/motions/`). Then put `scene12.blend` (from the assets zip) in `ap/` and run everything from `ap/`
(scripts call `../bpyenv/bin/python`). The image scripts need system `python3` with numpy and Pillow; encoding needs `ffmpeg`.
Wrapper: `run5.py scene.blend script.py -- args`.

## Commands
- Full clip: `env MOTION=<m> PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/<outdir> - 16 960 640 clipref`
  (130 PNGs, ~26-35 s per frame on 4 cores, so ~50-65 min). `RESUME=1` skips frames already in the folder.
  `FRAMES_SUB=0,20,55` renders only some frames.
- Diagnostics (no render): same command with `-- still /dev/null 0` and one of `GRIPDIAG=1`, `TILTDIAG=1`, `FARDIAG=1`,
  `CABLEDIAG=1`, `CAMDIAG=1`, `SLIVERDIAG=1`, `POCKETDIAG=1`, `SLIDEDIAG=1`.
- Gate: `./gate.sh MOTION RAWDIR x0,y0,x1,y1 4` (hands box, processes). ~1.5 h per clip. `GATE_RESUME=1` resumes.
  **gate.sh has run end to end only on the pushdown; see the fixes still listed in `docs/handover-sonnet.md`.**
  Known gate gaps (found by an automated review, not fixed): `gatereport.py` can report GREEN if a parallel job was killed
  without a traceback (check every `.ok` marker and the frame count yourself); it has no summary line for straight-barbell
  contact (`GRIP f..` records), so it says "no GRIPDIAG result" on barbell/curl clips. The runner scripts in `batchA/` take
  `AP=<working folder>` and `FIGMARK=<marker folder>` (defaults `/root/fig/ap`, `/root/fig`).
  More gaps reported by the same review, **not verified or fixed** (check each before relying on the gate):
  `holefill3.py` wraps masks at a fixed 130 frames (the 120-frame `curl_cable` clip would ask for a missing `fg_f129.npy`);
  `render8.py` imports `pose` before the motion's `ENV` is applied, so `MOTION=hammer`/`pushdown` without `PROP` exported may
  use the barbell elbow hinge; the gate's diagnostic renders omit the camera argument (`ref` instead of `clipref`), which
  could give pocket masks from a different viewpoint. Export `PROP` yourself and pass the camera until these are fixed.
  Third round, same status: the runners write their `.done` markers even when a stage fails (delete the marker of any stage that
  failed); `POCKETDIAG` in `render8.py` raises `KeyError: 'C'` for plain barbell/EZ props (no rope-eye data); the grip regex in
  `gatereport.py` drops negative clearances, so a penetrating chunk can be ignored. **Treat the whole gate as unvalidated and
  fix it against a full clip before trusting a green.**
- Encode: `ffmpeg -framerate 30 -i dir/f%03d.png -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart x.mp4` (and libvpx-vp9 for webm).
- Show Omar: `python3 tools/clip-page.py` is in the Claude project folder (`/mnt/project-files/tools/`); if you don't have it, any
  page with Real/Half/Quarter speed works. He watches inside Claude, never downloads.

## Status per exercise (27 Oct 2026)
| Exercise | State | Next |
|---|---|---|
| Barbell curl | LIVE v0.1.154 (r18, judge 9.0). Reference quality. | none |
| EZ-bar curl | LIVE v0.1.153 | none |
| Rope hammer curl | Clip 3 APPROVED by Omar (judge 9.2), locked, **not in the app yet** | Ship it when Omar says. A fist-tilt fix (0.40 vs rule 0.15 deg/f2) is optional: a new clip 4 with a keyed `rope_tilt` channel, never edit `approved/` |
| Rope pushdown | body-motion version (clip12-body) judged 8.6, body motion 9.0 and Omar said the amount is "fine". Open: white fleck f39-41, f70-80; far-elbow fan f16-22 / f90-96; cable graze at chest f48-64 (judge saw 2-4 px) | Small pixel fix (`fixfleck.py`) or accept; then Batch A |
| Bar pushdown (Batch A) | v1 frames rendered, judge 8.4: cable grazed chest f30-64 | `HIGH_Y` is already 0.75 in the motion (0 tangent runs in the test). Re-render to a new folder, gate, judge |
| Cable curl (Batch A) | full render was 64 of 120 frames done; the 64 frames **are saved** (f000-f063) | `RESUME=1` into the restored `clip_cc1`, then gate with `150,40,520,440` |
| Straight-arm pulldown | one still (f062) saved; motion tested natural, cable clear | render + gate + judge |
| Single-arm pushdown | motion exists, framing looked good, grip not closely checked | check grip closeups, then render + gate + judge |

Order in the plan: finish the rope pushdown, Batch A (4 cable twins), then more families (see `docs/plan-all-exercises.md`).
Process: reference card, camera test, pose, gate (all green), stills judge, clip judge (9+), fix, then ONE page for Omar per batch.

## Rules that must hold
- Never edit an approved clip folder. New round = new folder.
- Judges never build; the builder fixes and a fresh judge re-checks. Say "judged" vs "self-checked".
- Omar's go is needed before a figure goes into the app. Nothing here ships on its own.
- No keys, no Android signing keys in this folder.

## Lessons
- Never fill the end of a closing gap fully (it pops): dim it. Check fills as raw vs final strips.
- Diff a clip frame against the judged key before saying the clip matches the stills.
- Module-level diagnostic code in `render8.py` must not assign `loc`/`tgt` (camera globals).
- `GRIPDIAG` is ~1 min per frame: split frame lists over processes.
- Never `pgrep`/`pkill -f` with a pattern that appears in your own command line; kill by PID.
- Run `tiltcheck.py` after any tilt change (the hammer's tilt slipped through once).
- ARMDIAG counts are not trustworthy with SQUASH on; judge visually.
- A render container is ephemeral and is killed when the turn ends: keep the turn alive while jobs run, and copy finished
  frames to shared storage as you go.
- Realism found late by Omar was the biggest cost (rope 70 cm in front of the body). Get a real reference video first.
- A 6-frame smoke test shows false loop-wrap failures; only trust full 130-frame clips.

## Where it stopped (1 Nov 2026)
Omar moved all work to a new project, so the figures stopped here. Nothing is running. Nothing was published or shipped.

**Per exercise**
- Barbell curl, EZ-bar curl: live in the app, nothing to do.
- Rope hammer curl: clip 3 approved by Omar (locked in `figures-hammer-clip3-approved.zip`), not in the app yet.
- Rope pushdown: body-motion clip judged 8.6, body motion 9.0. Still open: white flecks f39-41 and f70-80, far-elbow fan f16-22 / f90-96, cable near the chest f48-64.
- Cable curl (Batch A): **all 120 frames are rendered** (`curl-cable-clip_cc1` in `/mnt/project-files/anatomy-proof/batch1/batchA/`, plus an mp4). Not judged, not shown to Omar. The gate (checks) stopped at 30 of 60 jobs (contact checks passed so far, 0 inside). Those job results were only in the old container.
- Bar pushdown (Batch A): v1 judged 8.4 (cable grazed the chest). The fix (`HIGH_Y` 0.75) is in the motion file. It needs a full re-render (~50 min), a gate run and a judge.
- Straight-arm pulldown: one test still only. Needs a full render, gate, judge.
- Single-arm pushdown: framing looked good, grip not closely checked. Needs a full render, gate, judge.

**The gate needs a full rerun.** Treat it as unvalidated: it has the gaps listed above, plus one fix made on 27 Oct that is only in the working copy (not in git): the diagnostic runs in `gate.sh` need `-- still /dev/null 0 16 960 640 clipref` (render settings and the `clipref` camera) or they crash or use the wrong camera. Apply that to both `gate.sh` copies first.

**Binaries (not in git, kept private on purpose):** the 5 zips in the Claude project folder `/mnt/project-files/figures-assets/`, which Omar will upload into the new project's files. SHA-256:
```
811313be37ed6483d0623a20f09859722ea4ab6495879399602bcb8cfe6ab977  figures-scene12-blend.zip
b65128984089cf7c104249396fbccf2517620b86beab6dc9968eb2af1a1b2da3  figures-hammer-clip3-approved.zip
41684c2aa3109355b19c20488619de42df566be420377fe2d86ec7c041faf0d7  figures-pushdown-clip12-body.zip
5d3334c100bd983a248e91268d498188ca57119e7e5ec1734716f7d31403f6ca  figures-batchA-partial-frames.zip
0b4ecc47d3384ab34823058015e5547f74601e5d766643cdca4830e31d0a9494  figures-pushdown-r8-keys-trials.zip
```
The 120 finished cable-curl frames are not in those zips (the zip has only the first 64): copy `curl-cable-clip_cc1/` too.

**Prompt for a new session:** "Read README.md 'Start here', then figures/RESUME.md and figures/batchA/HANDOVER.md in the repo omaralawi1000-netizen/The-new-Claude-gym-app. The figure zips are in this project's files. Restore them as described in figures/ASSETS.md, set up bpy as in RESUME.md, then continue with the cable curl gate."
