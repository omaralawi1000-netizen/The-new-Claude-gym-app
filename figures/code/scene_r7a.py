# rig.blend -> scene.blend : egg head, fillers, athletic reshape, clay + glow materials, barbell, cyc, lights, camera.
# blender -b rig.blend --python scene.py -- scene.blend
import bpy, bmesh, sys, os, re, math, numpy as np
from mathutils import Vector, Matrix
OUT = sys.argv[sys.argv.index('--')+1:][0]
SMOOTH_IT = int(os.environ.get('SMOOTH_IT', 2))
CYC_GLOW = float(os.environ.get('CYC_GLOW', 0.0))
sc = bpy.context.scene

def coll(name):
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name); sc.collection.children.link(c)
    return c

def link(o, cname):
    for uc in list(o.users_collection): uc.objects.unlink(o)
    coll(cname).objects.link(o)

# ---------- athletic reshape: push chosen muscles out along their normals (metres) ----------
BULK = float(os.environ.get('BULK', 1.0))     # r7 lifter build: muscles thicker in proportion, head unchanged
INFLATE = [(r'deltoid muscle', 0.024), (r'pectoralis major', 0.02), (r'biceps brachii', 0.0062), (r'Brachialis', 0.004),
           (r'triceps brachii', 0.006), (r'Latissimus', 0.016), (r'trapezius', 0.014), (r'Rectus abdominis', 0.0065),
           (r'Brachioradialis', 0.0035), (r'carpi|Palmaris|Flexor digitorum superficialis|Extensor digitorum\.', 0.0022),
           (r'Rectus femoris|Vastus', 0.0062), (r'Biceps femoris|Semitendinosus|Semimembranosus', 0.004),
           (r'Adductor (longus|magnus)|Gracilis|Sartorius', 0.0028), (r'Gastrocnemius', 0.0055), (r'Soleus', 0.003),
           (r'Tibialis anterior', 0.002), (r'Serratus anterior', -0.0015), (r'External abdominal oblique', 0.003),
           (r'Infraspinatus|Teres major', 0.007), (r'Gluteus maximus', 0.009), (r'Gluteus medius', 0.005),
           (r'Sternocleidomastoid', 0.0065)]
P0s, Ds = [], []
for o in coll('MUS').objects:
    amt = next((a for pat, a in INFLATE if re.search(pat, o.name, re.I)), 0) * (BULK if BULK != 1.0 else 1.0)
    if not amt: continue
    me = o.data; n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co)
    nm = np.empty(n * 3); me.vertices.foreach_get('normal', nm)
    co = co.reshape(-1, 3); d = nm.reshape(-1, 3) * amt
    P0s.append(co[::2].copy()); Ds.append(d[::2].copy())
    me.vertices.foreach_set('co', (co + d).ravel()); me.update()
# the skin sheets ride along: each sheet vertex takes the displacement of the nearest inflated muscle surface
from mathutils.kdtree import KDTree
P0 = np.concatenate(P0s); D0 = np.concatenate(Ds); kd = KDTree(len(P0))
for i, p in enumerate(P0): kd.insert(p, i)
kd.balance()
for o in list(coll('UNDER').objects):
    me = o.data; n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    for i in range(n):
        p, j, dist = kd.find(co[i])
        if j is not None: co[i] += D0[j] * max(0.0, 1 - dist / 0.02)
    me.vertices.foreach_set('co', co.ravel()); me.update()
# limb girth: arms and legs thicker about their own bone axes (a smooth radial scale, joints stay put), so they read buff
def sst0(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def bone_ends(name):
    o = bpy.data.objects[name]; P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    c = P.mean(0); ax = np.linalg.svd(P - c, full_matrices=False)[2][0]; t = (P - c) @ ax
    a = P[t > t.max() - 0.03].mean(0); b = P[t < t.min() + 0.03].mean(0)
    return (a, b) if a[2] > b[2] else (b, a)
import json as _json
_J = _json.load(open('joints.json'))
GIRTH = float(os.environ.get('GIRTH', 1.0))
LEG = []; ARMSEG = []
for sd in 'lr':
    ft, fb = bone_ends('Femur.' + sd); tt, tb = bone_ends('Tibia.' + sd)
    LEG += [(ft, fb, 0.17 * GIRTH, (0.10, 0.22), (0.80, 0.97)), (tt, tb, 0.15 * GIRTH, (0.02, 0.12), (0.62, 0.92))]
    J_ = {k: np.array(v) for k, v in _J[sd].items()}
    ARMSEG += [(sd, J_['S'], J_['E'], 0.28 * GIRTH, (0.12, 0.30), (0.88, 1.0)), (sd, J_['E'], J_['W'], 0.18 * GIRTH, (0.0, 0.10), (0.75, 0.95))]
def girth(P, segs):
    best = np.full(len(P), 1e9); out = P.copy()
    for a, b, g, (t0, t1), (t2, t3) in segs:
        ab = b - a; t = ((P - a) @ ab) / (ab @ ab); A = a + np.clip(t, 0, 1)[:, None] * ab; d = np.linalg.norm(P - A, axis=1)
        w = sst0(t0, t1, t) * sst0(t3, t2, t) * sst0(0.15, 0.11, d)
        take = d < best; best = np.where(take, d, best)
        out[take] = (A + (P - A) * (1 + g * w)[:, None])[take]
    return out
for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    cn = o.users_collection[0].name
    P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    if 'rig_side' in o and cn in ('MUS', 'BONE', 'UNDER'):
        segs = [(a, b, g, r0, r1) for sd, a, b, g, r0, r1 in ARMSEG if sd == o['rig_side']]
    elif cn in ('MUS', 'BONE', 'UNDER') and P[:, 2].min() < 0.95:
        segs = LEG
    else: continue
    Q = girth(P, segs)
    if np.abs(Q - P).max() > 0: o.data.vertices.foreach_set('co', Q.ravel()); o.data.update()
# pecs reach a little further toward the midline so the sternum shows as a narrow groove, not a band
for o in coll('MUS').objects:
    if not re.search(r'pectoralis major', o.name): continue
    me = o.data; co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    ax = np.abs(co[:, 0]); t = np.clip((0.075 - ax) / 0.05, 0, 1); t = t * t * (3 - 2 * t)
    co[:, 0] -= np.sign(co[:, 0]) * 0.011 * t
    me.vertices.foreach_set('co', co.ravel()); me.update()
# soften the sculpt's deepest fibre gashes (keeps the fibres, loses the black slashes)
for o in list(coll('MUS').objects):
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(SMOOTH_IT + (8 if re.search(r'Serratus', o.name) else 3 if re.search(r'oblique', o.name) else 0)):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if re.search(r'Sternocleidomastoid|trapezius', o.name):    # neck strands -> solid masses
        nk = [v for v in bm.verts if v.co.z > 1.36]
        for _ in range(8): bmesh.ops.smooth_vert(bm, verts=nk, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if re.search(r'Adductor longus|Gracilis', o.name):           # tendon cords at the pubis -> soft forms
        top = [v for v in bm.verts if v.co.z > 0.74]
        for _ in range(12): bmesh.ops.smooth_vert(bm, verts=top, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if re.search(r'Sternocostal head of pectoralis', o.name):   # toothed rib origins -> one clean edge along the sternum
        med = [v for v in bm.verts if abs(v.co.x) < 0.045]
        for _ in range(14): bmesh.ops.smooth_vert(bm, verts=med, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free()


# ---------- r6 surface clean-up ----------
def sst(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def vstats(o):
    me = o.data; n = len(me.vertices); P = np.empty(n * 3); me.vertices.foreach_get('co', P)
    N_ = np.empty(n * 3); me.vertices.foreach_get('normal', N_)
    E = np.empty(len(me.edges) * 2, int); me.edges.foreach_get('vertices', E)
    return P.reshape(-1, 3), N_.reshape(-1, 3), E.reshape(-1, 2)
def smooth_sel(o, mask, passes, factor=0.5):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    vs = [bm.verts[i] for i in np.nonzero(mask)[0] if not bm.verts[i].is_boundary]
    for _ in range(passes): bmesh.ops.smooth_vert(bm, verts=vs, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free(); o.data.update()
def crevices(o, pct=98.5, floor=0.00035, grow=2, passes=8):
    """knife-cut gashes = vertices sunk well below their neighbours: grow the mark a little and relax only there"""
    P, Nn, E = vstats(o)
    if len(P) < 50: return
    S = np.zeros_like(P); c = np.zeros(len(P))
    np.add.at(S, E[:, 0], P[E[:, 1]]); np.add.at(S, E[:, 1], P[E[:, 0]]); np.add.at(c, E[:, 0], 1); np.add.at(c, E[:, 1], 1)
    conc = ((S / np.maximum(c, 1)[:, None] - P) * Nn).sum(1)
    m = conc > max(floor, np.percentile(conc, pct))
    for _ in range(grow):
        g = m.copy(); g[E[m[E[:, 0]], 1]] = True; g[E[m[E[:, 1]], 0]] = True; m = g
    smooth_sel(o, m, passes)
FORE = re.compile(r'carpi|Palmaris|Flexor digitorum|Brachioradialis|Extensor digitorum|digiti minimi|pollicis|Pronator|Supinator|Anconeus')
for o in list(coll('MUS').objects):
    if re.search(r'biceps brachii', o.name): continue
    if re.search(r'pectoralis major|deltoid', o.name): crevices(o, pct=96, grow=3, passes=12)    # knife-cut slashes
    elif FORE.search(o.name):                                                                   # forearm: clean masses, no rolled-sleeve grooves
        crevices(o, pct=94, grow=3, passes=10); P, _, _ = vstats(o); smooth_sel(o, np.ones(len(P), bool), 4)
    else: crevices(o)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('U:arm region'): crevices(o, pct=96, grow=2, passes=8)
# sternal heads of the SCM end under the new neck surface (no white tendon tips at the notch)
for o in list(coll('MUS').objects):
    if o.name.startswith('Sternocleidomastoid'):
        P, _, _ = vstats(o); w = sst(1.44, 1.40, P[:, 2]); P[:, 1] += 0.007 * w
        o.data.vertices.foreach_set('co', P.ravel()); o.data.update()
# sternum bones never show between the pecs
for o in list(coll('BONE').objects):
    if re.search(r'Manubrium|Body of sternum|Xiphoid', o.name):
        P, _, _ = vstats(o); P[:, 1] += 0.007; o.data.vertices.foreach_set('co', P.ravel()); o.data.update()
# kneecaps: sink the patella under the knee sheet so it reads as a soft knee, not a pasted disk
for o in list(coll('BONE').objects):
    if o.name.startswith('Patella'):
        P, _, _ = vstats(o); c = P.mean(0); P = c + (P - c) * 0.86; P[:, 1] += 0.004
        o.data.vertices.foreach_set('co', P.ravel()); o.data.update()
ub = bpy.data.objects.get('U:body')
if ub:   # manubrium + the strip between the pecs: one smooth groove
    P, _, _ = vstats(ub)
    w = sst(0.05, 0.015, np.abs(P[:, 0])) * sst(1.10, 1.16, P[:, 2]) * sst(1.46, 1.42, P[:, 2]) * (P[:, 1] < 0.0)
    P[:, 1] += 0.007 * w                          # sink the strip so the pec edges overlap it: a groove, not a plate
    ub.data.vertices.foreach_set('co', P.ravel()); ub.data.update()
    smooth_sel(ub, w > 0.05, 8)
for o in list(coll('SKIN').objects):   # pebbly sculpted foot skin -> smooth clay, seam ring left alone
    if o.name.startswith('Foot skin'):
        P, _, E = vstats(o); bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
        bnd = np.array([v.is_boundary for v in bm.verts]); bm.free()
        for _ in range(6):
            g = bnd.copy(); g[E[bnd[E[:, 0]], 1]] = True; g[E[bnd[E[:, 1]], 0]] = True; bnd = g
        smooth_sel(o, ~bnd & (P[:, 2] < 0.06), 6)

# ---------- mannequin head + neck: one implicit surface ----------
# neck radius about a vertical axis, sampled from the neck muscles (rays from outside), closed over the strand gaps,
# smoothed, then unioned with a blank mannequin head (broad cranium, jaw angle, chin plane) and meshed by marching cubes
from mathutils.bvhtree import BVHTree
import subprocess
AX, AY = 0.0, 0.012
vs_, ps_ = [], []
for o in bpy.data.objects:
    if o.type != 'MESH' or o.users_collection[0].name not in ('MUS', 'BONE', 'UNDER') or 'rig_side' in o: continue
    P, _, _ = vstats(o)
    inb = (np.abs(P[:, 0]) < 0.13) & (P[:, 1] > -0.13) & (P[:, 1] < 0.15) & (P[:, 2] > 1.35) & (P[:, 2] < 1.57)
    if not inb.any(): continue
    base = len(vs_); vs_.extend(map(tuple, P))
    for p in o.data.polygons:
        vv = p.vertices
        if all(inb[i] for i in vv): ps_.append(tuple(base + i for i in vv))
bvh = BVHTree.FromPolygons(vs_, ps_)
ZS = np.arange(1.372, 1.66, 0.004); NA = 144; R0 = 0.115
TH = np.arange(NA) * 2 * np.pi / NA
def ellr(rx, ry): return 1 / np.sqrt((np.cos(TH) / rx) ** 2 + (np.sin(TH) / ry) ** 2)
R = np.full((len(ZS), NA), np.nan)
for i, z in enumerate(ZS):
    if z > 1.535: continue
    for j, t in enumerate(TH):
        o_ = Vector((AX + R0 * math.cos(t), AY + R0 * math.sin(t), z)); d_ = Vector((-math.cos(t), -math.sin(t), 0))
        hit = bvh.ray_cast(o_, d_, R0)
        if hit[0] is not None: R[i, j] = R0 - hit[3]
low = ellr(0.047, 0.052); up = ellr(0.050, 0.056)
for i, z in enumerate(ZS):
    w = sst(1.48, 1.545, z); row = np.where(np.isnan(R[i]), low, R[i])
    R[i] = np.maximum(row, 0.94 * low) * (1 - w) + up * w
def roll(A, k, ax): return np.roll(A, k, ax)
Rm = R.copy()
for dj in range(-4, 5):
    for di in (-1, 0, 1):
        Rm = np.maximum(Rm, np.roll(roll(R, dj, 1), di, 0))
wm = sst(1.39, 1.42, ZS)[:, None]
R = R * (1 - wm) + Rm * wm                         # close the gaps between strands (not at the collar)
for _ in range(10):
    Rp = np.pad(R, ((1, 1), (0, 0)), mode='edge')
    R = (Rp[:-2] + Rp[1:-1] * 2 + Rp[2:]) / 4
    R = (np.roll(R, 1, 1) + 2 * R + np.roll(R, -1, 1)) / 4
R += 0.0008
fld = os.path.abspath('neckfield.npz'); hm = os.path.abspath('headmesh.npz')
np.savez(fld, R=R, ZS=ZS, AX=AX, AY=AY)
print(subprocess.run(['python3', os.path.join(os.getcwd(), 'headmesh.py'), fld, hm], capture_output=True, text=True).stdout)
H = np.load(hm)
me = bpy.data.meshes.new('EggHead'); me.from_pydata(H['v'].tolist(), [], H['f'].tolist()); me.update()
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
for _ in range(2): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me); bm.free()
egg = bpy.data.objects.new('EggHead', me); sc.collection.objects.link(egg)
for p in me.polygons: p.use_smooth = True
link(egg, 'SKIN')
# floor of the sternal notch between the two SCM tendons (no hole down to the ribs)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=(0, -0.035, 1.405))
nt = bpy.context.object; nt.name = 'Notch'; nt.scale = (0.018, 0.006, 0.014); bpy.ops.object.transform_apply(scale=True)
for p in nt.data.polygons: p.use_smooth = True
link(nt, 'SKIN')
# thin flat shield at the apex of the gap between the thighs, flush with the adductor fronts: closes the dark notch
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, -0.022, 0.822))
cr_ = bpy.context.object; cr_.name = 'Crotch'; cr_.scale = (0.024, 0.005, 0.034); bpy.ops.object.transform_apply(scale=True)
for p in cr_.data.polygons: p.use_smooth = True
link(cr_, 'SKIN')


# ---------- materials ----------
CLAY_DARK = (0.0052, 0.0062, 0.0070, 1); CLAY_LIGHT = (0.0138, 0.0160, 0.0178, 1)   # cool blue-grey clay

def fibre_frame(o, along=None):
    """per-vertex rest coordinates in the object's principal frame (local z = fibre axis) -> attribute 'fc'"""
    me = o.data; n = len(me.vertices)
    if n < 4: return
    P = np.empty(n * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    c = P.mean(0); _, _, vt = np.linalg.svd(P - c, full_matrices=False)
    R = np.array([vt[1], vt[2], vt[0]])          # rows: across, across, along
    if along is not None:                         # fixed fibre direction (pecs run sternum -> arm, mirrored pairs match)
        a = np.array(along, float); a /= np.linalg.norm(a); u = np.cross(a, [0, 1.0, 0]); u /= np.linalg.norm(u)
        R = np.array([u, np.cross(a, u), a])
    Q = (P - c) @ R.T
    at = me.attributes.get('fc') or me.attributes.new('fc', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', Q.ravel().astype(np.float32))

def clay_mat(name='Clay', across=0.0028, along=0.045, bump=0.65, dist=0.0016):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.55
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.4
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.012; ao.only_local = False; ao.samples = 8
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = CLAY_DARK
    ramp.color_ramp.elements[1].position = 0.9; ramp.color_ramp.elements[1].color = CLAY_LIGHT
    L.new(ao.outputs['AO'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    if bump:
        at = N.new('ShaderNodeAttribute'); at.attribute_name = 'fc'; at.attribute_type = 'GEOMETRY'
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / across, 1 / across, 1 / along)
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.0; nz.inputs['Detail'].default_value = 3.0
        if 'Roughness' in nz.inputs: nz.inputs['Roughness'].default_value = 0.45
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = dist
        L.new(at.outputs['Vector'], mp.inputs['Vector']); L.new(mp.outputs['Vector'], nz.inputs['Vector'])
        L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m, b

clay, _ = clay_mat()
plain, _ = clay_mat('ClayPlain', bump=0)
matte, mb = clay_mat('ClayMatte', across=0.002, along=0.002, bump=0.08, dist=0.001)
mb.inputs['Roughness'].default_value = 0.85
if 'Specular IOR Level' in mb.inputs: mb.inputs['Specular IOR Level'].default_value = 0.15
headmat, hb = clay_mat('ClayHead', bump=0)                      # blank mannequin head: matte, no fibres, no gloss
hb.inputs['Roughness'].default_value = 0.7
if 'Specular IOR Level' in hb.inputs: hb.inputs['Specular IOR Level'].default_value = 0.25
soft, sb = clay_mat('ClaySoft', across=0.0035, along=0.007, bump=0.12, dist=0.001)   # abs, flanks, skin sheet: smooth clay
sb.inputs['Roughness'].default_value = 0.62
SOFT = re.compile(r'Rectus abdominis|oblique|Serratus|Latissimus|Pyramidalis', re.I)
hand, _ = clay_mat('ClayHand', across=0.005, along=0.05, bump=0.3, dist=0.0015)

def glow_mat():
    m, b = clay_mat('Glow'); nt = m.node_tree; N = nt.nodes; L = nt.links
    out = N['Material Output']
    # mask by position along the upper arm (bt: 0 elbow .. 1 shoulder, rest pose): glows from just above the elbow to the
    # deltoid's lower edge, and nothing of the long-head tendon shows in the gap under the delt
    tc = N.new('ShaderNodeAttribute'); tc.attribute_name = 'bt'; tc.attribute_type = 'GEOMETRY'
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Vector'], sep.inputs[0])
    lo = N.new('ShaderNodeMapRange'); lo.inputs['From Min'].default_value = float(os.environ.get('GLOW_LO0', 0.02)); lo.inputs['From Max'].default_value = float(os.environ.get('GLOW_LO1', 0.17)); lo.interpolation_type = 'SMOOTHSTEP'
    hi = N.new('ShaderNodeMapRange'); hi.inputs['From Min'].default_value = float(os.environ.get('GLOW_HI0', 0.60)); hi.inputs['From Max'].default_value = float(os.environ.get('GLOW_HI1', 0.47)); hi.interpolation_type = 'SMOOTHSTEP'
    L.new(sep.outputs['Z'], lo.inputs['Value']); L.new(sep.outputs['Z'], hi.inputs['Value'])
    mask = N.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; L.new(lo.outputs['Result'], mask.inputs[0]); L.new(hi.outputs['Result'], mask.inputs[1])
    # light from inside: brightest where the surface faces the viewer, fading to the rims
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    inner = N.new('ShaderNodeMapRange'); inner.inputs['From Min'].default_value = 0.0; inner.inputs['From Max'].default_value = 1.0
    inner.inputs['To Min'].default_value = 1.0; inner.inputs['To Max'].default_value = float(os.environ.get('GLOW_RIM', 0.65))
    L.new(lw.outputs['Facing'], inner.inputs['Value'])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = GLOW_E; L.new(inner.outputs['Result'], st.inputs[0])
    lp = N.new('ShaderNodeLightPath'); cam_only = N.new('ShaderNodeMath'); cam_only.operation = 'MULTIPLY'
    L.new(st.outputs[0], cam_only.inputs[0]); L.new(lp.outputs['Is Camera Ray'], cam_only.inputs[1])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = GLOW_RGB; L.new(cam_only.outputs[0], em.inputs['Strength'])
    # tint the clay itself deep red under the glow so form and fibres still read
    tint = N.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MIX'
    L.new(mask.outputs[0], tint.inputs['Factor']); L.new(N['Color Ramp'].outputs['Color'], tint.inputs['A'])
    tint.inputs['B'].default_value = (0.16, 0.01, 0.005, 1); L.new(tint.outputs['Result'], b.inputs['Base Color'])
    fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = float(os.environ.get('GLOW_MIX', 0.92)); L.new(mask.outputs[0], fac.inputs[0])
    mix = N.new('ShaderNodeMixShader'); L.new(fac.outputs[0], mix.inputs['Fac'])
    L.new(b.outputs['BSDF'], mix.inputs[1]); L.new(em.outputs['Emission'], mix.inputs[2]); L.new(mix.outputs[0], out.inputs['Surface'])
    return m

GLOW_RGB = (1.0, 0.018, 0.008, 1); GLOW_E = float(os.environ.get('GLOW_E', 0.08))
glow = glow_mat()
GLOW = re.compile(r'biceps brachii', re.I)
import json
JS_ = json.load(open('joints.json'))
for o in bpy.data.objects:
    if o.type == 'MESH' and GLOW.search(o.name):
        sd = o.get('rig_side', 'r' if o.name.endswith('.r') else 'l'); S_ = np.array(JS_[sd]['S']); E_ = np.array(JS_[sd]['E'])
        P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
        t_ = ((P - E_) @ (S_ - E_)) / ((S_ - E_) @ (S_ - E_))
        at = o.data.attributes.get('bt') or o.data.attributes.new('bt', 'FLOAT_VECTOR', 'POINT')
        at.data.foreach_set('vector', np.stack([t_ * 0, t_ * 0, t_], 1).ravel().astype(np.float32))
def zc(o):
    P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); return P.reshape(-1, 3)[:, 2].mean()
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    cn = o.users_collection[0].name
    if cn == 'MUS':
        fx = None
        if re.search(r'pectoralis major', o.name): fx = (1.0, 0, 0.25 if o.name.endswith('.l') else -0.25) if 'Clavicular' not in o.name else (1.0, 0, -0.5 if o.name.endswith('.l') else 0.5)
        fibre_frame(o, fx); mat = glow if GLOW.search(o.name) else soft if (SOFT.search(o.name) or zc(o) < 0.42) else clay
    elif o.name == 'EggHead':
        mat = headmat
    elif o.name in ('Notch', 'Crotch') or cn == 'UNDER' or o.name.startswith('Patella'):
        fibre_frame(o); mat = soft
    elif cn == 'SKIN' and o.name.startswith('Foot skin'):
        fibre_frame(o, (0, 0, 1.0)); mat = soft
    elif cn == 'SKIN':
        fibre_frame(o); mat = hand
    else:
        mat = plain
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True

for o in bpy.data.objects:
    if o.type != 'MESH' or 'rig_side' not in o: continue
    sd = o['rig_side']; n = len(o.data.vertices); w = np.zeros(n)
    for g in ('upper', 'fore'):
        vg = o.vertex_groups.get(f'{g}.{sd}')
        if not vg: continue
        for v in o.data.vertices:
            for ge in v.groups:
                if ge.group == vg.index: w[v.index] += ge.weight
    if w.max() <= 0: continue
    cg = o.vertex_groups.new(name='cs')
    for i in np.nonzero(w > 1e-3)[0]: cg.add([int(i)], float(min(1, w[i])), 'REPLACE')
    cs = o.modifiers.new('cs', 'CORRECTIVE_SMOOTH'); cs.factor = 0.5; cs.iterations = 10; cs.rest_source = 'ORCO'
    cs.smooth_type = 'LENGTH_WEIGHTED'; cs.vertex_group = 'cs'; cs.use_pin_boundary = True

# ---------- barbell (rest pose: along X, centre at origin; posed per frame) ----------
def lathe(profile, segs=128, name='lathe'):
    """profile: list of (r, x) points; revolve around X axis"""
    bm = bmesh.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs; ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * ca, r * sa)) for r, x in profile])
    for k in range(segs):
        A, B = rings[k], rings[(k + 1) % segs]
        for j in range(len(profile) - 1):
            bm.faces.new((A[j], A[j + 1], B[j + 1], B[j]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    return o

def plate_profile(x0, t=0.05, R=0.200):
    """plate: square rolled rim, recessed faces with a lip ring, raised hub; x0 = inner face. points are (r, x)."""
    e = t - 0.0
    rec = 0.011; hub = 0.004
    one = [(0.026, x0 + hub + 0.002), (0.030, x0 + hub), (0.058, x0 + hub), (0.064, x0 + hub + 0.003), (0.072, x0 + rec),
           (0.130, x0 + rec), (0.136, x0 + rec - 0.002), (0.140, x0 + rec), (0.172, x0 + rec), (0.180, x0 + 0.004),
           (0.186, x0 + 0.0008), (0.193, x0), (R - 0.004, x0), (R - 0.0005, x0 + 0.0015), (R, x0 + 0.005)]
    other = [(r, x0 + e - (x - x0)) for r, x in reversed(one)]
    return one + other

parts = []
bar = lathe([(0.0, -0.87), (0.0135, -0.87), (0.0145, -0.865), (0.0145, -0.8), (0.016, -0.8), (0.025, -0.795), (0.025, -0.465), (0.032, -0.465), (0.032, -0.445), (0.0145, -0.44), (0.0145, -0.37), (0.0135, -0.365), (0.0135, 0.365), (0.0145, 0.37), (0.0145, 0.44), (0.032, 0.445), (0.032, 0.465), (0.025, 0.465), (0.025, 0.795), (0.016, 0.8), (0.0145, 0.8), (0.0145, 0.865), (0.0135, 0.87), (0.0, 0.87)], 96, 'Bar')
parts.append(bar)
for side in (-1, 1):
    x0 = 0.47 if side > 0 else -0.47 - 0.05
    p = lathe(plate_profile(x0), 160, 'Plate'); parts.append(p)
    cx = 0.47 + 0.05 + 0.003 if side > 0 else -0.47 - 0.05 - 0.003 - 0.03
    c = lathe([(0.026, cx), (0.036, cx), (0.038, cx + 0.004), (0.038, cx + 0.026), (0.036, cx + 0.03), (0.026, cx + 0.03)], 96, 'Collar'); parts.append(c)
bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active = bar; bpy.ops.object.join()
bar = bpy.context.object; bar.name = 'Barbell'; bar.data.materials.append(clay); link(bar, 'PROPS')

# ---------- studio: cyclorama, lights, world, camera ----------
bm = bmesh.new(); prof = []
for k in range(25): prof.append((-6 + 6.3 * k / 24, 0.0))           # floor y from -6 to 0.3 (z=0.0)
for k in range(1, 17):
    a = (math.pi / 2) * k / 16; prof.append((0.3 + 1.6 * math.sin(a), 0.0 + 1.6 * (1 - math.cos(a))))
for k in range(1, 6): prof.append((1.9, 1.6 + 1.5 * k))
cols = []
for xi in range(2):
    x = -8 if xi == 0 else 8
    cols.append([bm.verts.new((x, y, zz)) for y, zz in prof])
for j in range(len(prof) - 1): bm.faces.new((cols[0][j], cols[0][j + 1], cols[1][j + 1], cols[1][j]))
me = bpy.data.meshes.new('Cyc'); bm.to_mesh(me); bm.free()
cyc = bpy.data.objects.new('Cyc', me); link(cyc, 'STUDIO')
for p in me.polygons: p.use_smooth = True
cm = bpy.data.materials.new('CycMat'); cm.use_nodes = True
cb = cm.node_tree.nodes['Principled BSDF']; cb.inputs['Base Color'].default_value = (0.93, 0.93, 0.93, 1); cb.inputs['Roughness'].default_value = 0.9
if 'Specular IOR Level' in cb.inputs: cb.inputs['Specular IOR Level'].default_value = 0.1
cn = cm.node_tree.nodes; cl = cm.node_tree.links
cao = cn.new('ShaderNodeAmbientOcclusion'); cao.inputs['Distance'].default_value = 0.22; cao.samples = 16
cr = cn.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.035, 0.035, 0.035, 1); cr.color_ramp.elements[1].color = (0.93, 0.93, 0.93, 1)
cr.color_ramp.elements[0].position = 0.72
cl.new(cao.outputs['AO'], cr.inputs['Fac']); cl.new(cr.outputs['Color'], cn['Principled BSDF'].inputs['Base Color'])
ce = cm.node_tree.nodes['Principled BSDF']
if 'Emission Color' in ce.inputs:
    ce.inputs['Emission Color'].default_value = (1, 1, 1, 1); ce.inputs['Emission Strength'].default_value = CYC_GLOW
# the studio wall looks white to the camera but bounces far less light onto the figure: deeper shadow side, more contrast
CYC_BOUNCE = float(os.environ.get('CYC_BOUNCE', 0.22))
lp = cn.new('ShaderNodeLightPath'); dk = cn.new('ShaderNodeBsdfDiffuse'); dk.inputs['Color'].default_value = (CYC_BOUNCE,) * 3 + (1,)
mx = cn.new('ShaderNodeMixShader'); out = cn['Material Output']
# to the camera the floor is lit only by its own occlusion: one grounded shadow, darkest at the soles, no stray cast shadow
CYC_E = float(os.environ.get('CYC_E', 1.6))
cem = cn.new('ShaderNodeEmission'); cem.inputs['Strength'].default_value = CYC_E; cl.new(cr.outputs['Color'], cem.inputs['Color'])
cl.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac']); cl.new(dk.outputs[0], mx.inputs[1]); cl.new(ce.outputs[0], mx.inputs[2])
cl.new(mx.outputs[0], out.inputs['Surface'])
me.materials.append(cm)

w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.08

def area(name, loc, target, energy, size, size_y=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.shape = 'RECTANGLE' if size_y else 'SQUARE'
    ld.size = size
    if size_y: ld.size_y = size_y
    o = bpy.data.objects.new(name, ld); link(o, 'STUDIO'); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    o.data.cycles.is_portal = False
    try: o.visible_camera = False
    except Exception: pass
    return o

# each light comes twice: one lights the figure (normal shadows), a shadowless twin lights only the floor,
# so the floor carries a single grounded contact shadow (its own occlusion) and no stray cast shadow
LL_CYC = bpy.data.collections.new('LL_CYC'); LL_CYC.objects.link(cyc)
LL_NOFLOOR = bpy.data.collections.new('LL_NOFLOOR'); LL_NOFLOOR.objects.link(cyc)
LL_NOFLOOR.collection_objects[0].light_linking.link_state = 'EXCLUDE'
def lamp(name, loc, target, energy, size):
    a = area(name, loc, target, energy, size); a.light_linking.receiver_collection = LL_NOFLOOR
    f = area(name + 'Floor', loc, target, energy, size); f.light_linking.receiver_collection = LL_CYC
    f.light_linking.blocker_collection = LL_CYC
lamp('Key', (-1.4, -1.8, 3.8), (0, 0, 0.9), float(os.environ.get('KEY_W', 620)), 1.3)
lamp('Fill', (2.6, -2.2, 1.6), (0, 0, 1.0), 35, 3.0)
lamp('Rim', (0.6, 2.4, 2.6), (0, 0, 1.2), 120, 1.5)
lamp('Bounce', (0, -1.2, -0.05), (0, 0, 1.2), 10, 2.5)    # soft floor bounce from below-front
# low front fill on the figure only: even, light clay top to bottom (legs no longer fall off to black)
lf = area('LowFill', (-1.1, -3.0, 0.55), (0, 0, 0.55), float(os.environ.get('LOWFILL_W', 700)), 2.2, 1.4); lf.light_linking.receiver_collection = LL_NOFLOOR

cam_d = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_d); link(cam, 'STUDIO'); sc.camera = cam
cam.location = (-1.30, -3.55, 1.02); cam_d.lens = 54
cam.rotation_euler = (Vector((0.0, 0.0, 0.86)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.render.resolution_x = 1400; sc.render.resolution_y = 1050
sc.cycles.samples = 128; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 2; sc.cycles.transmission_bounces = 0
sc.cycles.volume_bounces = 0; sc.cycles.transparent_max_bounces = 2
names = [v.identifier for v in sc.view_settings.bl_rna.properties['view_transform'].enum_items]
sc.view_settings.view_transform = 'AgX' if 'AgX' in names else 'Filmic'
try: sc.view_settings.look = 'AgX - Base Contrast' if 'AgX' in names else 'None'
except Exception: pass
sc.view_settings.exposure = 0.3
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print('scene saved')
