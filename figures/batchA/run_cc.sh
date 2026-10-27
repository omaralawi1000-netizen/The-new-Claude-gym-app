cd /root/fig/ap
[ -f /root/fig/ccr.done ] || { env MOTION=curl_cable PERSIST=1 RESUME=1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_cc1 - 16 960 640 clipref > clip_cc1.log 2>&1; echo done > /root/fig/pbr.done; }
GATE_RESUME=${GATE_RESUME:-0} SLV_BOX=200,150,440,420 ./gate.sh curl_cable clip_cc1 150,40,520,440 4 > /root/fig/gate_cc1.out 2>&1
echo done > /root/fig/cc.done
