# blender -b rig.blend --python test_pose.py -- out elbow_deg grip views
import bpy, sys, os, numpy as np
sys.path.insert(0, os.getcwd())
import pose
from mathutils import Vector
a = sys.argv[sys.argv.index('--')+1:]
out, el, gr = a[0], float(a[1]), float(a[2]); views = a[3]
Gs = {}
for s in 'rl':
    G, J = pose.transforms(s, np.radians(el), 0.0, gr); Gs[s] = G
pose.apply(Gs)
# bar centre: circle through posed middle-finger MCP, PIP, DIP projected on the plane normal to the bar
G, J = pose.transforms('r', np.radians(el), 0.0, gr)
c = J['f2']
pts = [np.array(G['hand'] @ Vector(c[1])), np.array(G['f20'] @ Vector(c[2])), np.array(G['f21'] @ Vector(c[3])), np.array(G['f22'] @ Vector(c[4]))]
print('posed finger pts', np.round(pts, 3).tolist())
def circ(p1, p2, p3):
    a, b = p2 - p1, p3 - p1; n = np.cross(a, b)
    cc = p1 + (np.cross(n, a) * (b @ b) + np.cross(b, n) * (a @ a)) / (2 * (n @ n)); return cc, np.linalg.norm(cc - p1)
cc, rr = circ(pts[0], pts[1], pts[3])
print('bar centre', np.round(cc, 3).tolist(), 'radius to joints', round(rr, 4))
bpy.ops.mesh.primitive_cylinder_add(radius=0.014, depth=1.2, location=(0, cc[1], cc[2]), rotation=(0, np.pi / 2, 0))
sys.argv = ['x', '--', out, '24', '640', views]
exec(open('look.py').read())
