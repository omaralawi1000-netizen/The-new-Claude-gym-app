M=${FIGMARK:-/root/fig}; cd ${AP:-$M/ap} || exit 1
[ -f $M/pbr.done ] || { env MOTION=pushdown_bar PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_pb1 - 16 960 640 clipref > clip_pb1.log 2>&1; echo done > $M/pbr.done; }
GATE_RESUME=${GATE_RESUME:-0} SLV_BOX=200,200,440,420 ./gate.sh pushdown_bar clip_pb1 150,100,500,440 4 > $M/gate_pb1.out 2>&1
echo done > $M/pb.done
