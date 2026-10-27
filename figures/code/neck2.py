# scene10n.blend (handfix with NECK=0) -> scene11.blend : neck to head, round 2 (Omar 04:49 "refine the neck to the head")
#  The mannequin neck was a plain tube up into a knob chin. Sculpt it like a strong lifter's neck:
#  traps flaring from the skull base to the shoulders, the two SCMs as soft ridges (mastoid -> sternum, from the real
#  SCM muscle's path), a hollow at the jugular notch, the neck slimmer just under the jaw so the jaw casts a soft shadow,
#  and the body's fibre texture fading out along the jaw-to-skull line instead of at a level collar.
#  blender -b scene10n.blend --python neck2.py -- scene11.blend      (all sizes in metres, env overrides for tuning)
import bpy, sys, os, json, numpy as np
OUT = sys.argv[sys.argv.index('--') + 1:][0]
def E(k, d): return float(os.environ.get(k, d))
def sst0(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def angd(a, b): return (a - b + np.pi) % (2 * np.pi) - np.pi
eg = bpy.data.objects['EggHead']; me = eg.data
P = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
M = np.array(eg.matrix_world); Mi = np.linalg.inv(M); Pw = P @ M[:3, :3].T + M[:3, 3]
x, y, z = Pw.T
yc = np.interp(z, [1.38, 1.45, 1.50, 1.56], [0.030, 0.030, 0.024, 0.024])
q = y - yc; r = np.hypot(x, q) + 1e-9; th = np.arctan2(q, x)          # th -90 deg = front (-y), +90 = back
h = z - (E('JZ', 1.475) + E('JS', 0.40) * (y - E('JY', -0.08)))       # height above the chin -> skull-base line
wN = sst0(E('NH1', 0.003), E('NH0', -0.008), h) * sst0(E('NB0', 1.39), E('NB1', 1.41), z)
back = sst0(-0.2, 0.7, np.sin(th))
dr = r * (E('FLB', 0.12) * back * sst0(E('FLB_TOP', 1.53), 1.42, z) + E('FLS', 0.05) * sst0(1.49, 1.42, z)
          - E('SLIM', 0.06) * (1 - back) * sst0(1.44, 1.48, z))
scm = np.array(json.load(open('scm.json')))                               # SCM centreline (z, x, y) from the muscle
xs = np.interp(z, scm[:, 0], scm[:, 1]); ys = np.interp(z, scm[:, 0], scm[:, 2])
amp = E('SCMA', 0.0035) * sst0(1.395, 1.415, z) * sst0(1.53, 1.505, z); sg = E('SCMS', 0.008)
for s in (1, -1):
    arc = r * angd(th, np.arctan2(ys - yc, s * xs)); dr += amp * np.exp(-arc ** 2 / (2 * sg * sg))
arcf = r * angd(th, -np.pi / 2)
dr -= E('JUG', 0.003) * np.exp(-arcf ** 2 / (2 * 0.012 ** 2) - (z - E('JUGZ', 1.415)) ** 2 / (2 * 0.010 ** 2))
D = (wN * dr)[:, None] * np.stack([x / r, q / r, 0 * r], 1)
# smooth the displacement over the mesh so no ridge has a hard edge
ed = np.empty(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ed); ed = ed.reshape(-1, 2)
deg = np.bincount(ed.ravel(), minlength=len(P)).astype(float)[:, None] + 1e-9
for _ in range(int(E('SMOOTH', 8))):
    S = np.zeros_like(D); np.add.at(S, ed[:, 0], D[ed[:, 1]]); np.add.at(S, ed[:, 1], D[ed[:, 0]]); D = 0.5 * D + 0.5 * S / deg
Q = Pw + D
me.vertices.foreach_set('co', (Q @ Mi[:3, :3].T + Mi[:3, 3]).ravel()); me.update()
fc = me.attributes.get('fc') or me.attributes.new('fc', 'FLOAT_VECTOR', 'POINT'); fc.data.foreach_set('vector', (Pw - Pw.mean(0)).ravel().astype(np.float32))
nk = me.attributes.get('nk') or me.attributes.new('nk', 'FLOAT_VECTOR', 'POINT'); nk.data.foreach_set('vector', np.stack([z * 0, z * 0, h], 1).ravel().astype(np.float32))
m = bpy.data.materials['Clay'].copy(); m.name = 'ClayNeck'; nt = m.node_tree; N = nt.nodes; L = nt.links
b = N['Principled BSDF']; bp = [nd for nd in N if nd.type == 'BUMP'][0]
at = N.new('ShaderNodeAttribute'); at.attribute_name = 'nk'; at.attribute_type = 'GEOMETRY'
sp = N.new('ShaderNodeSeparateXYZ'); L.new(at.outputs['Vector'], sp.inputs[0])
def ramp(a, b_, lo, hi):
    rr = N.new('ShaderNodeMapRange'); rr.interpolation_type = 'SMOOTHSTEP'; rr.inputs['From Min'].default_value = a; rr.inputs['From Max'].default_value = b_
    rr.inputs['To Min'].default_value = lo; rr.inputs['To Max'].default_value = hi; L.new(sp.outputs['Z'], rr.inputs['Value']); return rr
L.new(ramp(E('TB0', -0.03), E('TB1', -0.002), E('NECK_BUMP', 0.4), 0.0).outputs['Result'], bp.inputs['Strength'])
L.new(ramp(-0.01, 0.025, 0.55, 0.7).outputs['Result'], b.inputs['Roughness'])
if 'Specular IOR Level' in b.inputs: L.new(ramp(-0.01, 0.025, 0.4, 0.25).outputs['Result'], b.inputs['Specular IOR Level'])
me.materials.clear(); me.materials.append(m)
print('NECK2 moved', int((np.linalg.norm(D, axis=1) > 1e-4).sum()), 'max %.1f mm' % (np.linalg.norm(D, axis=1).max() * 1000))
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
