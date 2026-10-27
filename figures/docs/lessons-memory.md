---
name: figures-lessons
description: Hard-won lessons for the Blender exercise-figure pipeline (pinhole fills, diag code, process hygiene)
metadata:
  type: feedback
---

- Lesson: never fill the end of a closing gap fully (pops); dim it. Check fills as raw-vs-final frame strips.
- Lesson: always diff a clip frame against the judged key before claiming the clip matches the stills.
- Lesson: module-level diag code in render8 must not assign `loc`/`tgt` (set_cam globals): moved the camera after frame 1.
- Lesson: GRIPDIAG is ~1 min/frame; split frame lists into parallel processes (4 cores).
- Lesson: never pgrep/pkill -f with a pattern in your own command line (killed the shell 3x); kill by pid from ps.

**Why:** each cost a failed round or a killed shell.
**How to apply:** follow them in every figure round; see [[figures-oct-18]].
