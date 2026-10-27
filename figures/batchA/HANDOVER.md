# Batch A (cable twins): handover, 27 Oct (stopped on Omar's request, nothing running)

## Done
- Bar pushdown (motions/pushdown_bar.py): rendered, gated, judged 8.4 (judge-verdict.md in pushdown-bar/). Main flaw: cable grazed chest f30-64. Fix tested: HIGH_Y 0.55 -> 0.75 gives 0 tangent runs (already set in the motion file). Needs re-render (clip_pb2) + gate. v1 frames in pushdown-bar/frames.
- New props/code: bar_high/bar_low cable bar (props.py), HANDLE=r one-hand handle (render8.py), lat glow for "pulldown_" motions (render8.py, lats have no rig_side), resumable gate.sh, gatereport.py bar rows. All copied to code/.
- Cable curl (motions/curl_cable.py, PROP bar_low): 6-frame test looked right; full render was ~64 of 130 frames done when stopped (curl-partial/clip_cc1, resume with RESUME=1 on the same folder if /root/fig/ap survives).
- Straight-arm pulldown (motions/pulldown_straight.py, cam -100, HIGH_Y 1.2): stills tested, natural, cable clear (CABLEDIAG 0 tangent). Not rendered.
- Single-arm pushdown (motions/pushdown_single.py, HANDLE r, cam -85, HIGH_X -0.20, far arm relaxed): framing frame looked good; hand/handle grip not yet closely checked. Not rendered.

## Next (in order)
1. Resume curl render, then ./gate.sh curl_cable clip_cc1 150,40,520,440 4 (GATE_RESUME=1 after a restart). Scripts: code/run_cc.sh (note its render line writes pbr.done by mistake; ccr.done never set).
2. Re-render bar pushdown (run_q.sh does it), gate, judge again.
3. Pulldown, then single-arm: render + gate + judge (run_q2.sh).
4. One phone page for Omar with all four (tools: /mnt/project-files/tools/clip-page.py), honest scores, ask for yes.
Gate takes ~1.5 h and render ~50 min per clip with 4 procs. Keep the turn alive while jobs run (jobs die when the container restarts).
Working folder /root/fig/ap is ephemeral; everything needed is in code/. Hammer clip-3 tilt fix still waits on Omar (do not touch).
