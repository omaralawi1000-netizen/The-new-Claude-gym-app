# Figure assets (big files, not in git)

Five zip files, made 27 Oct 2026, checksums below. Omar OKed publishing them (27 Oct 17:41). Planned home: the release
tag `figures-assets-oct27` of this repo. **If that release does not exist yet, the upload has not been done** (a Claude
session could not create it; Omar or a session with release rights must). Copies are also in the Claude project folder
`/mnt/project-files/figures-assets/`. Restore each one with `unzip` inside your working folder `ap/`.

**Credit and licence:** the figure scene is derived from Z-Anatomy (<https://www.z-anatomy.com>), licensed CC BY-SA 4.0,
so these files are shared under the same licence. Keep the credit (it is also shown in the app's Settings).

**Download:** `gh release download figures-assets-oct27 -R omaralawi1000-netizen/The-new-Claude-gym-app` (or the release page
in a browser), then check `sha256sum` against the list below.

| File | Size | What | Unzip to |
|---|---|---|---|
| `figures-scene12-blend.zip` | 67 MB (208 MB unzipped) | `scene12.blend`: the rigged, lit Z-Anatomy figure scene, self-contained. **Required for any render.** | `ap/scene12.blend` |
| `figures-hammer-clip3-approved.zip` | 48 MB | Omar-approved hammer clip 3: 130 raw frames (`frames-clip_hm5w.tgz`), mp4/webm, key stills, SHA256SUMS | keep as the locked reference |
| `figures-pushdown-clip12-body.zip` | 49 MB | rope pushdown with body motion: 130 frames, mp4/webm, gate folder, keys, judge notes | reference / pixel fix |
| `figures-batchA-partial-frames.zip` | 79 MB | `curl-partial/clip_cc1` (cable curl frames f000-f063 of 130), `pushdown-bar/frames` (v1, 130 frames), `pulldown-test` (f062), `pushdown_bar.py` | `ap/` (so `ap/clip_cc1` resumes with `RESUME=1`) |
| `figures-pushdown-r8-keys-trials.zip` | 7.7 MB | key stills and camera trials of the pushdown r8 rework | reference |

SHA-256:
```
811313be37ed6483d0623a20f09859722ea4ab6495879399602bcb8cfe6ab977  figures-scene12-blend.zip
b65128984089cf7c104249396fbccf2517620b86beab6dc9968eb2af1a1b2da3  figures-hammer-clip3-approved.zip
41684c2aa3109355b19c20488619de42df566be420377fe2d86ec7c041faf0d7  figures-pushdown-clip12-body.zip
5d3334c100bd983a248e91268d498188ca57119e7e5ec1734716f7d31403f6ca  figures-batchA-partial-frames.zip
0b4ecc47d3384ab34823058015e5547f74601e5d766643cdca4830e31d0a9494  figures-pushdown-r8-keys-trials.zip
```

## What was saved and what must be re-rendered (honest list)
- **Saved:** the scene, the approved hammer clip, the pushdown body clip, 64 of 130 cable-curl frames, the 130 v1 bar-pushdown frames.
- **Gone (the figures container was wiped):** nothing rendered after those frames. The bar pushdown needs a full re-render
  (~50 min) after the chest-graze fix; the cable curl needs the other 66 frames (~35 min) then the gate; the pulldown and the
  single-arm pushdown need full renders (one test still exists for the pulldown only). Every gate run (~1.5 h per clip) must be redone.
- The Python environment (`bpyenv`) is not saved: rebuild it as in `RESUME.md`.
- The older rendered rounds of the barbell and EZ curls are not kept; their final clips are live in `public/figures/`.
