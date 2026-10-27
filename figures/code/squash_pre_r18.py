# Soft-tissue contact at deep elbow flexion: the forearm flexor mass presses into the biceps. Without this the meshes simply
# interpenetrate (up to 30 mm at the top of the curl) and the glowing biceps pokes out between the forearm muscles as thin red
# slivers (judge, barbell r16). A geometry-nodes step after the armature pushes every upper-arm muscle point that lies inside
# the forearm's envelope (a tapered capsule fitted to the forearm muscles) out onto its surface, so the biceps wraps the forearm
# the way flesh does. Strength follows the elbow angle (0 below SQ_ON degrees, full at SQ_FULL), so straight-arm frames are untouched.
import bpy, os, re, math, numpy as np
from mathutils import Vector

FORE_RE = r'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus'
UPPER_RE = os.environ.get('SQ_UPPER', r'^(Long|Short) head of biceps brachii|^Brachialis muscle')
SQ_ON, SQ_FULL = float(os.environ.get('SQ_ON', 55)), float(os.environ.get('SQ_FULL', 85))
MARGIN = float(os.environ.get('SQ_MARGIN', 0.002))
PCT = float(os.environ.get('SQ_PCT', 95))
T0 = float(os.environ.get('SQ_T0', 0.10))      # leave the elbow crease itself alone (the biceps tendon crosses it by design)
EMP, MODS = {}, {}

def _node_group(prof):
    """prof: (ts, a, b) radius profile along elbow->wrist: a along U (forearm's front at rest), b across it"""
    ts, A_, B_ = prof; amax, bmax = float(max(A_)), float(max(B_))
    ng = bpy.data.node_groups.new('FlexSquash', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    pos = N.new('GeometryNodeInputPosition')
    ob = {}
    for nm in ('E', 'W', 'U', 'S'):
        o = N.new('GeometryNodeObjectInfo'); o.transform_space = 'RELATIVE'; o.name = 'Obj' + nm; ob[nm] = o.outputs['Location']
    S = N.new('ShaderNodeValue'); S.name = 'S'; S.outputs[0].default_value = 0.0
    def vm(op, a, b=None):
        n = N.new('ShaderNodeVectorMath'); n.operation = op; L.new(a, n.inputs[0])
        if b is not None: L.new(b, n.inputs[1])
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH') else n.outputs['Vector']
    def fm(op, a, b=None, bv=None, cv=None, c=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        if isinstance(a, float): n.inputs[0].default_value = a
        else: L.new(a, n.inputs[0])
        if b is not None: L.new(b, n.inputs[1])
        elif bv is not None: n.inputs[1].default_value = bv
        if c is not None: L.new(c, n.inputs[2])
        elif cv is not None: n.inputs[2].default_value = cv
        return n.outputs[0]
    def curve(vals, vmax):
        n = N.new('ShaderNodeFloatCurve'); cm = n.mapping; cv = cm.curves[0]
        while len(cv.points) > 2: cv.points.remove(cv.points[-1])
        cv.points[0].location = (float(ts[0]), float(vals[0] / vmax)); cv.points[1].location = (float(ts[-1]), float(vals[-1] / vmax))
        for t_, v_ in zip(ts[1:-1], vals[1:-1]): cv.points.new(float(t_), float(v_ / vmax))
        for pt in cv.points: pt.handle_type = 'VECTOR'
        cm.update(); return n
    AB = vm('SUBTRACT', ob['W'], ob['E']); AP = vm('SUBTRACT', pos.outputs['Position'], ob['E'])
    t = fm('DIVIDE', vm('DOT_PRODUCT', AP, AB), vm('DOT_PRODUCT', AB, AB))
    tc = fm('MINIMUM', fm('MAXIMUM', t, bv=0.0), bv=1.0)
    sc = N.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'; L.new(AB, sc.inputs[0]); L.new(tc, sc.inputs['Scale'])
    q = vm('SUBTRACT', pos.outputs['Position'], vm('ADD', ob['E'], sc.outputs['Vector']))
    An = vm('NORMALIZE', AB)
    Uw = vm('SUBTRACT', ob['U'], ob['E'])
    Ut = vm('NORMALIZE', vm('SUBTRACT', Uw, vm('PROJECT', Uw, An)))
    Vt = vm('CROSS_PRODUCT', An, Ut)
    u = vm('DOT_PRODUCT', q, Ut); w = vm('DOT_PRODUCT', q, Vt); d = vm('LENGTH', q)
    ca = curve(A_, amax); L.new(tc, ca.inputs['Value']); cb = curve(B_, bmax); L.new(tc, cb.inputs['Value'])
    a = fm('MULTIPLY', ca.outputs[0], bv=amax); b = fm('MULTIPLY', cb.outputs[0], bv=bmax)
    # radius of the ellipse in this point's direction: d / sqrt((u/a)^2 + (w/b)^2)
    e = fm('SQRT', fm('ADD', fm('POWER', fm('DIVIDE', u, a), bv=2.0), fm('POWER', fm('DIVIDE', w, b), bv=2.0)))
    rho = fm('DIVIDE', d, fm('MAXIMUM', e, bv=1e-6))
    pen = fm('MAXIMUM', fm('SUBTRACT', fm('ADD', rho, bv=MARGIN), d), bv=0.0)
    g = N.new('ShaderNodeMapRange'); g.clamp = True; L.new(t, g.inputs['Value'])
    g.inputs['From Min'].default_value = T0; g.inputs['From Max'].default_value = T0 + 0.08
    g.inputs['To Min'].default_value = 0.0; g.inputs['To Max'].default_value = 1.0
    g2 = N.new('ShaderNodeMapRange'); g2.clamp = True; L.new(t, g2.inputs['Value'])
    g2.inputs['From Min'].default_value = 1.0; g2.inputs['From Max'].default_value = 1.05
    g2.inputs['To Min'].default_value = 1.0; g2.inputs['To Max'].default_value = 0.0
    k = fm('MULTIPLY', fm('MULTIPLY', fm('MULTIPLY', pen, g.outputs['Result']), g2.outputs['Result']), S.outputs[0])
    # push toward the humerus (the forearm presses the biceps onto the bone), never round the forearm: the distance along that
    # line that clears the envelope ~ pen / (how fast that line leaves the forearm axis), capped short of the bone axis
    SE = vm('SUBTRACT', ob['E'], ob['S']); SP = vm('SUBTRACT', pos.outputs['Position'], ob['S'])
    th = fm('MINIMUM', fm('MAXIMUM', fm('DIVIDE', vm('DOT_PRODUCT', SP, SE), vm('DOT_PRODUCT', SE, SE)), bv=0.0), bv=1.0)
    sh = N.new('ShaderNodeVectorMath'); sh.operation = 'SCALE'; L.new(SE, sh.inputs[0]); L.new(th, sh.inputs['Scale'])
    toH = vm('SUBTRACT', vm('ADD', ob['S'], sh.outputs['Vector']), pos.outputs['Position'])
    Dn = vm('NORMALIZE', toH); rate = fm('MAXIMUM', vm('DOT_PRODUCT', Dn, vm('NORMALIZE', q)), bv=0.35)
    dist = fm('MINIMUM', fm('DIVIDE', k, rate), c=None, b=fm('MULTIPLY', vm('LENGTH', toH), bv=0.8))
    off = N.new('ShaderNodeVectorMath'); off.operation = 'SCALE'; L.new(Dn, off.inputs[0]); L.new(dist, off.inputs['Scale'])
    sp = N.new('GeometryNodeSetPosition'); L.new(gi.outputs['Geometry'], sp.inputs['Geometry']); L.new(off.outputs['Vector'], sp.inputs['Offset'])
    L.new(sp.outputs['Geometry'], go.inputs['Geometry'])
    return ng

def _verts(o, dg):
    me = o.evaluated_get(dg).to_mesh(); P = np.array([o.matrix_world @ v.co for v in me.vertices]); o.evaluated_get(dg).to_mesh_clear(); return P

def fit(EW, UW):
    """EW: {side: (E, W)}, UW: {side: unit 'front' direction} at the current frame -> radius profile (ts, a, b) per side"""
    dg = bpy.context.evaluated_depsgraph_get(); out = {}
    for s, (E, W) in EW.items():
        E, W = np.array(E), np.array(W); ab = W - E; L2 = ab @ ab; An = ab / np.sqrt(L2)
        U = np.array(UW[s]); U = U - (U @ An) * An; U /= np.linalg.norm(U); V = np.cross(An, U)
        P = np.concatenate([_verts(o, dg) for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == s
                            and o.users_collection[0].name == 'MUS' and re.search(FORE_RE, o.name, re.I)])
        t = (P - E) @ ab / L2; Q = P - (E + np.clip(t, 0, 1)[:, None] * ab); u, w = Q @ U, Q @ V
        edges = np.linspace(0.0, 1.0, 11); ts, A_, B_ = [], [], []
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (t >= lo) & (t < hi)
            a = np.percentile(np.abs(u[m]), PCT); b = np.percentile(np.abs(w[m]), PCT)
            sc = np.percentile(np.sqrt((u[m] / a) ** 2 + (w[m] / b) ** 2), PCT)   # grow the ellipse until it holds PCT% of the points
            ts.append((lo + hi) / 2); A_.append(a * sc); B_.append(b * sc)
        ts = [0.0] + ts + [1.0]; A_ = [A_[0]] + A_ + [A_[-1]]; B_ = [B_[0]] + B_ + [B_[-1]]
        out[s] = (np.array(ts), np.array(A_), np.array(B_))
        print('SQUASH fit %s  a(front) %s  b(side) %s mm' % (s, ' '.join('%.0f' % (x * 1000) for x in A_), ' '.join('%.0f' % (x * 1000) for x in B_)))
    return out

ULOC = {}
def setup(EW, Gfore):
    UW = {}
    for s in 'rl':
        U0 = Vector((0, -1, 0)); ULOC[s] = Gfore[s].to_3x3().inverted() @ U0; UW[s] = np.array(U0)
    R = fit(EW, UW)
    for s in 'rl':
        for nm in ('E', 'W', 'U', 'S'):
            e = bpy.data.objects.new('Sq%s.%s' % (nm, s), None); bpy.context.scene.collection.objects.link(e); EMP[(nm, s)] = e
        for o in bpy.data.objects:
            if o.type != 'MESH' or o.get('rig_side') != s or o.users_collection[0].name != 'MUS' or not re.search(UPPER_RE, o.name): continue
            ng = _node_group(R[s]); m = o.modifiers.new('FlexSquash', 'NODES'); m.node_group = ng
            for nm in ('E', 'W', 'U', 'S'): ng.nodes['Obj' + nm].inputs[0].default_value = EMP[(nm, s)]
            MODS.setdefault(s, []).append(ng.nodes['S'])
    if FILL > 0:
        for s in 'rl': make_filler(R[s], EW, Gfore, s)
    print('SQUASH on', {s: len(v) for s, v in MODS.items()})

def update(EW, elbow, Gfore, SW=None):
    k = float(np.clip((elbow - SQ_ON) / (SQ_FULL - SQ_ON), 0, 1)); k = k * k * (3 - 2 * k)
    for s, (E, W) in EW.items():
        EMP[('E', s)].location = Vector(E); EMP[('W', s)].location = Vector(W)
        EMP[('U', s)].location = Vector(E) + (Gfore[s].to_3x3() @ ULOC[s]) * 0.1
        EMP[('S', s)].location = Vector(SW[s])
        for n in MODS.get(s, []): n.outputs[0].default_value = k
        if s in FILLOBJ: FILLOBJ[s].matrix_world = Gfore[s] @ G0[s].inverted()

# Gap filler: the forearm is a bundle of separate muscles with gaps between them, and with the bloom masked off the forearm
# the glowing biceps behind it shows through those gaps as thin red lines. A clay core the shape of the same envelope,
# shrunk to sit under the muscle surfaces, fills them the way the deep forearm muscles would.
FILL = float(os.environ.get('SQ_FILL', 0.0)); FILLOBJ, G0 = {}, {}
def make_filler(prof, EW, Gfore, s):
    import bmesh
    ts, A_, B_ = prof; E, W = np.array(EW[s][0]), np.array(EW[s][1]); ab = W - E; An = ab / np.linalg.norm(ab)
    U = np.array(Gfore[s].to_3x3() @ ULOC[s]); U = U - (U @ An) * An; U /= np.linalg.norm(U); V = np.cross(An, U)
    bm = bmesh.new(); rings = []; tt = np.linspace(float(os.environ.get('SQ_FILL_T0', 0.22)), float(os.environ.get('SQ_FILL_T1', 0.72)), 25); NS = 32
    for t in tt:
        a = float(np.interp(t, ts, A_)) * FILL; b = float(np.interp(t, ts, B_)) * FILL; c = E + ab * t
        rings.append([bm.verts.new(tuple(c + a * math.cos(q) * U + b * math.sin(q) * V)) for q in np.linspace(0, 2 * math.pi, NS, endpoint=False)])
    for i in range(len(rings) - 1):
        for k in range(NS): bm.faces.new((rings[i][k], rings[i][(k + 1) % NS], rings[i + 1][(k + 1) % NS], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new('ForeFill.' + s); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new('ForeFill.' + s, me); bpy.data.collections['MUS'].objects.link(o) if 'MUS' in bpy.data.collections else bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(bpy.data.materials['Clay']); FILLOBJ[s] = o; G0[s] = Gfore[s].copy(); o['rig_side'] = s
    if os.environ.get('BLOOM_FORE') == '1': o.pass_index = 1
