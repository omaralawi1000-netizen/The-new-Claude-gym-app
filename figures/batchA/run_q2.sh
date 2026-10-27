cd /root/fig/ap
while [ ! -f /root/fig/pb2.done ]; do sleep 20; done
[ -f /root/fig/plr.done ] || { env MOTION=pulldown_straight PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_pl1 - 16 960 640 clipref > clip_pl1.log 2>&1; echo done > /root/fig/plr.done; }
GATE_RESUME=${GATE_RESUME:-0} SLV_BOX=200,100,500,440 ./gate.sh pulldown_straight clip_pl1 150,60,520,440 4 > /root/fig/gate_pl1.out 2>&1
echo done > /root/fig/pl.done
[ -f /root/fig/psr.done ] || { env MOTION=pushdown_single PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_ps1 - 16 960 640 clipref > clip_ps1.log 2>&1; echo done > /root/fig/psr.done; }
GATE_RESUME=${GATE_RESUME:-0} SLV_BOX=200,100,500,440 ./gate.sh pushdown_single clip_ps1 150,60,520,440 4 > /root/fig/gate_ps1.out 2>&1
echo done > /root/fig/ps.done
