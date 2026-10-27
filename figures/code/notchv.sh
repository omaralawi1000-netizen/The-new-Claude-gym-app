# notchv.sh: NOTCHDIAG + FARDIAG f36-72 for abduct_l offsets (wrist return f60-74)
R=../bpyenv/bin/python; export PD_WRLKEYS=33:0,41:-6,60:-6.3,74:0; F=$(seq -s, 36 2 72)
for d in -3 0 3 5; do
  K=$(python3 -c "print(','.join('%d:%g'%(f,v+($d if 0<v else 0)) for f,v in [(16,0),(30,10),(40,9.6),(52,4),(62,4.4),(68,10.4),(84,10.8),(98,0)]))")
  ( env MOTION=pushdown PD_ABLKEYS=$K NOTCHDIAG=1 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^NOTCHDIAG' > nv_$d.txt
    env MOTION=pushdown PD_ABLKEYS=$K FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 30 80) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > nv_${d}_far.txt ) &
done
wait
