cd /root/fig/ap
while [ ! -f /root/fig/cc.done ]; do sleep 20; done
# bar pushdown re-render with the pulley moved out (judge: cable grazed the chest)
[ -f /root/fig/pb2r.done ] || { env MOTION=pushdown_bar PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_pb2 - 16 960 640 clipref > clip_pb2.log 2>&1; echo done > /root/fig/pb2r.done; }
GATE_RESUME=${GATE_RESUME:-0} SLV_BOX=200,200,440,420 ./gate.sh pushdown_bar clip_pb2 150,100,500,440 4 > /root/fig/gate_pb2.out 2>&1
echo done > /root/fig/pb2.done
