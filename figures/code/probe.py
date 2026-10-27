import sys, os, math, numpy as np
from mathutils import Vector
sys.path.insert(0, '.'); import pose, pose2
M = pose2.load(os.environ['MOTION'])
for f in [int(x) for x in sys.argv[1:]]:
    v = pose2.values(M, f); G = pose2.solve(v)
    for s in 'r':
        J = pose.JS[s]; S = np.array(G['upper.'+s] @ Vector(J['S'])); E = np.array(G['upper.'+s] @ Vector(J['E'])); W = np.array(G['fore.'+s] @ Vector(J['W']))
        u = E - S; fo = W - E
        print('f%3d upper vs vertical %.1f deg (fwd +) | forearm vs horizontal %.1f deg | hand z %.2f y %.2f | elbow y %.2f, chest y %.2f' % (f,
            math.degrees(math.atan2(-u[1], -u[2])), math.degrees(math.atan2(fo[2], math.hypot(fo[0], fo[1]))), W[2], W[1], E[1], np.array(G['chest'] @ Vector((0,0,1.25)))[1]))
