# scene8.blend -> scene9.blend : hands and wrists only (Omar 14 Oct: "take a look at the hands").
# blender -b scene8.blend --python handfix.py -- scene9.blend
#  1. the wrist and hand skin patches get the same forearm girth as the muscles under them (they were left un-thickened,
#     so the buff forearm's tendons poked through and their edges crumpled: the "cuff" at the wrist)
#  2. hand skin: smooth skin instead of the fibre-striped clay (the stripes read as a bandage)
#  3. the low-poly skin patches are subdivided after posing, so the knuckles and wrist bend round instead of in facets
import bpy, sys, os, json, re, numpy as np
OUT = sys.argv[sys.argv.index('--') + 1:][0]
J = json.load(open('joints.json'))
GIRTH_SKIN = float(os.environ.get('GIRTH_SKIN', 1.0)); SUBD = int(os.environ.get('SUBD', 0))
def sst0(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def girth(P, a, b, g, t01, t23):
    ab = b - a; t = ((P - a) @ ab) / (ab @ ab); A = a + np.clip(t, 0, 1)[:, None] * ab; d = np.linalg.norm(P - A, axis=1)
    w = sst0(*t01, t) * sst0(t23[1], t23[0], t) * sst0(0.15, 0.11, d)
    return A + (P - A) * (1 + g * w)[:, None]
# smooth skin: clay colour from AO like the rest, only a whisper of grain
base = bpy.data.materials['ClaySoft']; skin = base.copy(); skin.name = 'ClaySkin'
for nd in skin.node_tree.nodes:
    if nd.type == 'BUMP': nd.inputs['Strength'].default_value = float(os.environ.get('SKIN_BUMP', 0.05))
n = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or o.users_collection[0].name != 'SKIN' or 'rig_side' not in o: continue
    sd = o['rig_side']; E = np.array(J[sd]['E']); W = np.array(J[sd]['W'])
    P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    if GIRTH_SKIN: o.data.vertices.foreach_set('co', girth(P, E, W, 0.18 * GIRTH_SKIN, (0.0, 0.10), (0.75, 0.95)).ravel()); o.data.update()
    if not o.name.startswith(('Nail', 'Perionyx')): o.data.materials.clear(); o.data.materials.append(skin)
    if SUBD:
        m = o.modifiers.new('subd', 'SUBSURF'); m.levels = 0; m.render_levels = SUBD
    n += 1
print('HANDFIX skin objects', n)

# ---------- neck (Omar 04:31: "from the neck to the head it's just attached to the body") ----------
#  the mannequin head's neck was a smooth, matte tube on a fibrous body: a material break at the collar and a thin neck.
#  4. the neck carries the body's clay and fibres (running up the neck), fading to the smooth head between the jaw and ears
#  5. the neck is thicker in its middle (a lifter's neck), flaring into the traps
NECK = float(os.environ.get('NECK', 1.0))
if NECK:
    eg = bpy.data.objects['EggHead']; me = eg.data
    P = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    M = np.array(eg.matrix_world); Mi = np.linalg.inv(M); Pw = P @ M[:3, :3].T + M[:3, 3]
    z = Pw[:, 2]; w = sst0(float(os.environ.get('NW0', 1.42)), float(os.environ.get('NW1', 1.47)), z) * sst0(float(os.environ.get('NW3', 1.535)), float(os.environ.get('NW2', 1.50)), z)
    yc = -0.004
    Q = Pw.copy(); Q[:, 0] *= 1 + float(os.environ.get('NECK_X', 0.15)) * w; Q[:, 1] = yc + (Q[:, 1] - yc) * (1 + float(os.environ.get('NECK_Y', 0.07)) * w)
    me.vertices.foreach_set('co', (Q @ Mi[:3, :3].T + Mi[:3, 3]).ravel()); me.update()
    fc = me.attributes.get('fc') or me.attributes.new('fc', 'FLOAT_VECTOR', 'POINT'); fc.data.foreach_set('vector', (Pw - Pw.mean(0)).ravel().astype(np.float32))
    nk = me.attributes.get('nk') or me.attributes.new('nk', 'FLOAT_VECTOR', 'POINT'); nk.data.foreach_set('vector', np.stack([z * 0, z * 0, z], 1).ravel().astype(np.float32))
    m = bpy.data.materials['Clay'].copy(); m.name = 'ClayNeck'; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']; bp = [nd for nd in N if nd.type == 'BUMP'][0]
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'nk'; at.attribute_type = 'GEOMETRY'
    sp = N.new('ShaderNodeSeparateXYZ'); L.new(at.outputs['Vector'], sp.inputs[0])
    def ramp(a, b_, lo, hi):
        r = N.new('ShaderNodeMapRange'); r.interpolation_type = 'SMOOTHSTEP'; r.inputs['From Min'].default_value = a; r.inputs['From Max'].default_value = b_
        r.inputs['To Min'].default_value = lo; r.inputs['To Max'].default_value = hi; L.new(sp.outputs['Z'], r.inputs['Value']); return r
    L.new(ramp(float(os.environ.get('NB0', 1.47)), float(os.environ.get('NB1', 1.525)), float(os.environ.get('NECK_BUMP', 0.4)), 0.0).outputs['Result'], bp.inputs['Strength'])
    L.new(ramp(1.52, 1.58, 0.55, 0.7).outputs['Result'], b.inputs['Roughness'])
    if 'Specular IOR Level' in b.inputs: L.new(ramp(1.52, 1.58, 0.4, 0.25).outputs['Result'], b.inputs['Specular IOR Level'])
    me.materials.clear(); me.materials.append(m)
    print('NECKFIX', len(P), 'max widen', float(np.abs(Q - Pw).max()))

# ---------- wrist (Omar 04:42: "the hands still doesn't hold the bar properly") ----------
#  6. the hand now turns at the wrist to keep the bar in the palm; the forearm->hand blend was only +-12 mm wide, so that
#     turn folded the skin into a crease. Spread it over the end of the forearm (35 mm) and the heel of the hand (8 mm).
WB = os.environ.get('WRIST_BLEND', '-0.035,0.008')
if WB:
    w0, w1 = [float(x) for x in WB.split(',')]; nw = 0
    def nrm(v): return v / np.linalg.norm(v)
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for sd in 'rl':
            if 'fore.' + sd not in o.vertex_groups or 'hand.' + sd not in o.vertex_groups: continue
            Jd = {k: np.array(v) for k, v in J[sd].items()}
            ax = nrm(nrm(Jd['W'] - Jd['E']) + nrm(Jd['f2'][1] - Jd['W']))
            Mw = np.array(o.matrix_world); vg = o.vertex_groups; gi = {g.index: g.name for g in vg}
            hand_chain = {g.name for g in vg if g.name.endswith('.' + sd) and g.name.split('.')[0] not in ('upper', 'fore')}
            for v in o.data.vertices:
                ws = {gi[g.group]: g.weight for g in v.groups if g.group in gi}
                f = ws.get('fore.' + sd, 0.0); h = sum(ws.get(k, 0.0) for k in hand_chain); T = f + h
                if T <= 1e-6: continue
                pw = Mw[:3, :3] @ np.array(v.co) + Mw[:3, 3]; x = (pw - Jd['W']) @ ax
                if x < w0 - 0.002 or x > w1 + 0.002: continue
                t = float(sst0(w0, w1, np.array(x))); h2 = T * t
                vg['fore.' + sd].add([v.index], T - h2, 'REPLACE')
                if h > 1e-6:
                    for k in hand_chain:
                        if k in ws: vg[k].add([v.index], ws[k] * h2 / h, 'REPLACE')
                else:
                    vg['hand.' + sd].add([v.index], h2, 'REPLACE')
                nw += 1
    print('WRISTBLEND verts', nw)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
