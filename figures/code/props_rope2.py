# Props built at render time so they fit the posed hands exactly. Same clay as the barbell, same plate/collar profiles.
# EZ bar: in its own frame x runs along the bar (right hand -> left hand), y is the bend plane (+y = the outer ends of the
# grip segments, which sit a little forward when the forearms turn in), z is the bar-plane normal. Origin = midway between
# the two grip centres, so placing it is the same as the straight bar.
import bpy, bmesh, math, numpy as np

def _fillet(pts, r, n=10):
    """polyline -> same polyline with each inner corner replaced by a circular arc of radius r"""
    P = [np.array(p, float) for p in pts]; out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        u = (a - b) / np.linalg.norm(a - b); v = (c - b) / np.linalg.norm(c - b)
        ang = math.acos(np.clip(u @ v, -1, 1))
        if ang > math.pi - 1e-3: out.append(b); continue
        t = r / math.tan(ang / 2); p0 = b + u * t; p1 = b + v * t
        bis = (u + v) / np.linalg.norm(u + v); ctr = b + bis * (r / math.sin(ang / 2))
        a0 = math.atan2(*(p0 - ctr)[::-1]); a1 = math.atan2(*(p1 - ctr)[::-1])
        d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for k in range(n + 1):
            q = a0 + d * k / n; out.append(ctr + r * np.array([math.cos(q), math.sin(q)]))
    out.append(P[-1]); return out

def _tube(path, radius, segs=48, name='tube'):
    """sweep a circle of `radius` (float or per-point list) along a planar path in the xy plane"""
    bm = bmesh.new(); rings = []
    path = [np.array(p, float) for p in path]; n = len(path)
    rad = radius if isinstance(radius, (list, tuple)) else [radius] * n
    for i, p in enumerate(path):
        d = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]; d /= np.linalg.norm(d)
        nx = np.array([-d[1], d[0], 0.0]); nz = np.array([0, 0, 1.0])
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            q = np.array([p[0], p[1], 0.0]) + rad[i] * (math.cos(a) * nx + math.sin(a) * nz)
            ring.append(bm.verts.new(tuple(q)))
        rings.append(ring)
    for i in range(n - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(segs):
            bm.faces.new((A[k], A[(k + 1) % segs], B[(k + 1) % segs], B[k]))
    for ring in (rings[0], rings[-1]):
        bm.faces.new(ring if ring is rings[-1] else ring[::-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def _lathe(profile, segs, name):
    bm = bmesh.new(); rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs; ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * ca, r * sa)) for r, x in profile])
    for k in range(segs):
        A, B = rings[k], rings[(k + 1) % segs]
        for j in range(len(profile) - 1): bm.faces.new((A[j], A[j + 1], B[j + 1], B[j]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def _plate_profile(x0, t=0.04, R=0.17):
    rec = 0.009; hub = 0.004
    one = [(0.026, x0 + hub + 0.002), (0.030, x0 + hub), (0.055, x0 + hub), (0.060, x0 + hub + 0.003), (0.066, x0 + rec),
           (0.112, x0 + rec), (0.117, x0 + rec - 0.002), (0.121, x0 + rec), (0.146, x0 + rec), (0.153, x0 + 0.004),
           (0.158, x0 + 0.0008), (0.164, x0), (R - 0.004, x0), (R - 0.0005, x0 + 0.0015), (R, x0 + 0.005)]
    other = [(r, x0 + t - (x - x0)) for r, x in reversed(one)]
    return one + other

def _tan_len(a, b, c, r):
    u = (a - b) / np.linalg.norm(a - b); v = (c - b) / np.linalg.norm(c - b)
    ang = math.acos(np.clip(u @ v, -1, 1)); return r / math.tan(ang / 2)

def make_ez(gx, theta_deg, t_lo=-0.0543, t_hi=0.0452, margin=0.012, r_bar=0.0135, plate_R=0.17):
    """EZ curl bar fitted to the hands. gx: half the distance between the grip centres. The hand skin spans t_lo..t_hi
    along each hand's grip axis (thumb -> pinky) from its grip centre; the straight grip section covers that span plus
    `margin` each side, and only then do the (wide, smooth) bends start. The outer ends of the grip sections sit at +y."""
    th = math.radians(theta_deg); c, s = math.cos(th), math.sin(th)
    R = float(__import__('os').environ.get('EZ_BEND_R', 0.045)); D = float(__import__('os').environ.get('EZ_DEPTH', 0.045))
    CA = math.radians(float(__import__('os').environ.get('EZ_CONN_DEG', 38)))
    ax = np.array([-c, -s])                      # left hand, thumb -> pinky (outer -> inner), in the bar's frame
    g = np.array([gx, 0.0])
    O = g + (t_lo - margin) * ax; I = g + (t_hi + margin) * ax   # ends of the straight part the hand needs
    tin, tout = 0.03, 0.015
    for _ in range(4):   # place the corners so that after rounding the straight part is exactly O..I
        Ic = I + tin * ax; Oc = O - tout * ax
        base = Ic[1] + D                         # bar line: centre section and sleeves
        A = np.array([Ic[0] - D / math.tan(CA), base]); A0 = np.array([0.0, base])
        Bx = Oc[0] + max(abs(base - Oc[1]) / math.tan(CA), 0.04); B = np.array([Bx, base]); B1 = np.array([Bx + 0.05, base])
        tin = _tan_len(A, Ic, Oc, R); tout = _tan_len(Ic, Oc, B, R)
    xs = Bx
    half = [tuple(A0), tuple(A), tuple(Ic), tuple(Oc), tuple(B), tuple(B1)]
    half = _fillet(half, R, 16)
    path = [(-p_[0], p_[1]) for p_ in reversed(half[1:])] + half
    parts = [_tube(path, r_bar, 40, 'EZcore')]
    print('EZ geometry gx %.4f straight %.1f..%.1f mm  bends r %.0f mm  depth %.0f mm  tangents in %.1f out %.1f mm  base %.4f' % (gx, (t_lo - margin) * 1000, (t_hi + margin) * 1000, R * 1000, D * 1000, tin * 1000, tout * 1000, base))
    # sleeves, collars and plates: straight along x past the bends (same look as the barbell's)
    x1 = xs + 0.05
    for sd in (-1, 1):
        prof = [(0.0, x1 - 0.002), (r_bar, x1 - 0.002), (0.016, x1), (0.025, x1 + 0.004), (0.025, x1 + 0.255), (0.0235, x1 + 0.26), (0.0, x1 + 0.26)]
        if sd < 0: prof = [(r, -x) for r, x in reversed(prof)]
        parts.append(_lathe(prof, 64, 'EZsleeve'))
        ring = [(0.026, x1 + 0.006), (0.032, x1 + 0.006), (0.032, x1 + 0.024), (0.026, x1 + 0.024)]
        if sd < 0: ring = [(r, -x) for r, x in reversed(ring)]
        parts.append(_lathe(ring, 64, 'EZring'))
        p0 = x1 + 0.03
        pp = _plate_profile(p0, R=plate_R)
        if sd < 0: pp = [(r, -x) for r, x in reversed(pp)]
        parts.append(_lathe(pp, 128, 'EZplate'))
        cx = p0 + 0.043
        col = [(0.026, cx), (0.034, cx), (0.036, cx + 0.004), (0.036, cx + 0.022), (0.034, cx + 0.026), (0.026, cx + 0.026)]
        if sd < 0: col = [(r, -x) for r, x in reversed(col)]
        parts.append(_lathe(col, 64, 'EZcollar'))
    for q in parts[1:]: q.location.y = base
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    o = bpy.context.view_layer.objects.active; o.name = 'EZBar'
    o.data.materials.append(bpy.data.materials['Clay'])
    for col_ in list(o.users_collection): col_.objects.unlink(o)
    bpy.data.collections['PROPS'].objects.link(o)
    return o

# ---------- cable station (one design for every cable move): a column straight in front of the lifter, with a pulley
# carriage on its face low (curls) or high (pushdowns). Only the carriage a move uses is shown. The clip camera for cable
# moves turns round to the lifter's right side so the column stands beside the figure, never in front of it.
# The station recedes: a lighter, matte grey (StationMat), so the figure stays the subject.
import os as _os
COL_LOW = (0.0, -0.80)                 # column centre for low-pulley moves (figure faces -y, feet at z=0)
LOW = (0.0, -0.69, 0.10)               # low pulley wheel centre
# high pulley: a pushdown stands close to the stack, so the cable runs near vertical at lockout and the rope hangs as an
# inverted V under the clip (judge round 1: 0.69 m out at 1.98 m made the lockout V point forward, edge-on to the camera)
COL_HIGH = (0.0, -float(_os.environ.get('COL_HIGH_Y', 0.55)))
HIGH = (0.0, COL_HIGH[1] + 0.11, float(_os.environ.get('HIGH_Z', 1.80)))
COL = COL_LOW
WHEEL_R = 0.063                        # 1.5x the first pass: reads as a pulley at app size

def _mat(name, base, rough, spec=0.3, metal=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = spec
    return m

def station_mat():
    v = float(_os.environ.get('STATION_V', 0.034))      # the figure's clay is ~0.016 (linear): about 1.5-2 values lighter
    return _mat('StationMat', (v, v, v * 1.02), 0.78, 0.22)

def _box(c, s, name, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=c); o = bpy.context.object; o.scale = s; o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = o.modifiers.new('bv', 'BEVEL'); m.width = bevel; m.segments = 4; m.limit_method = 'NONE'
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons: p.use_smooth = True
    return o

def _wheel(c, name):
    """pulley wheel with a deep groove and a hub, axle along x"""
    R = WHEEL_R
    prof = [(0.0, -0.013), (0.016, -0.013), (0.018, -0.009), (R - 0.014, -0.008), (R, -0.012), (R + 0.002, -0.010),
            (R - 0.008, -0.004), (R - 0.009, 0.0), (R - 0.008, 0.004), (R + 0.002, 0.010), (R, 0.012), (R - 0.014, 0.008),
            (0.018, 0.009), (0.016, 0.013), (0.0, 0.013)]
    prof = [(r, x + c[0]) for r, x in prof]
    o = _lathe(prof, 72, name)
    for v in o.data.vertices: v.co.y += c[1]; v.co.z += c[2]
    return o

def _carriage(c, col, parts):
    # a block on the column face, two cheek plates (rounded, a little bigger than the wheel) holding the wheel's axle
    face = col[1] + 0.045
    parts.append(_box((c[0], face + 0.02, c[2]), (0.11, 0.04, 0.18), 'C_car', 0.01))
    span = c[1] - face
    for sx in (-1, 1):
        parts.append(_box((c[0] + sx * 0.019, face + span / 2 + 0.01, c[2]), (0.006, span + 0.02 + 2 * 0.02, 2 * WHEEL_R + 0.03), 'C_cheek', 0.006))
        bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.008, location=(c[0] + sx * 0.024, c[1], c[2]), rotation=(0, math.pi / 2, 0))
        nut = bpy.context.object; nut.name = 'C_nut'; parts.append(nut)
    parts.append(_wheel(c, 'C_wheel'))

def make_cable_station(low=True, high=False):
    parts = []
    col = COL_HIGH if high else COL_LOW
    x, y = col
    parts.append(_box((x, y, 1.15), (0.09, 0.09, 2.30), 'C_up', 0.01))           # column
    parts.append(_box((x, y - 0.04, 0.012), (0.42, 0.34, 0.024), 'C_base', 0.008))   # base plate
    if low: _carriage(LOW, col, parts)
    if high: _carriage(HIGH, col, parts)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts: p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = 'CableStation'
    for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(station_mat())
    for c_ in list(o.users_collection): c_.objects.unlink(o)
    bpy.data.collections['PROPS'].objects.link(o)
    return o

def _bezier(P0, P1, P2, P3, n):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t ** 2 * P2 + t ** 3 * P3

def _tube3(path, radius, segs, bm, mat=0, cap=True):
    """sweep a circle along a 3D path (parallel-transport frames) into bmesh bm; caps both ends.
    Each vertex carries 'rc' = (cos a, sin a, arc length) for the braid shader (cos/sin so nothing wraps at a seam)."""
    path = np.asarray(path, float); n = len(path)
    T = np.gradient(path, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    ref = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
    N = np.cross(T[0], ref); N /= np.linalg.norm(N); rings = []
    sl = np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
    lay = bm.verts.layers.float_vector.get('rc') or bm.verts.layers.float_vector.new('rc')
    for i in range(n):
        if i:
            N = N - (N @ T[i]) * T[i]; N /= np.linalg.norm(N)
        B = np.cross(T[i], N)
        r = radius[i] if hasattr(radius, '__len__') else radius
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            v = bm.verts.new(tuple(path[i] + r * (math.cos(a) * N + math.sin(a) * B))); v[lay] = (math.cos(a), math.sin(a), sl[i])
            ring.append(v)
        rings.append(ring)
    for i in range(n - 1):
        A, Bq = rings[i], rings[i + 1]
        for k in range(segs): bm.faces.new((A[k], A[(k + 1) % segs], Bq[(k + 1) % segs], Bq[k])).material_index = mat
    if cap:
        bm.faces.new(rings[0][::-1]).material_index = mat; bm.faces.new(rings[-1]).material_index = mat

ROPE_R = 0.0135; KNOB_R = 0.021; KNOB_L = 0.044
STRAND = float(_os.environ.get('ROPE_STRAND', 0.27))     # exit of the fist -> clip; a standard 27-inch triceps rope
ROPE_WRAP = float(_os.environ.get('ROPE_WRAP', 0.032))  # the rope bends round the edge of the fist on this radius
LAST = {}                                               # centreline of the last built rope, for the contact test

def rope_geometry(hands, pulley_c, entry):
    """hands: {'r': (centre, axis thumb->pinky), 'l': ...}; entry: the side of the fist the rope LEAVES toward the pulley.
    The stoppers sit on the other side, away from the pulley (the cable pulls the rope toward it):
    'pinky' for low-pulley curls (knobs over the thumbs), 'thumb' for high-pulley pushdowns (knobs under the pinkies).
    Returns the clip point, the clip direction and per-strand paths (the first NTHROUGH points run through the fist)."""
    M = (hands['r'][0] + hands['l'][0]) / 2; P = np.array(pulley_c)
    d = P - M; d /= np.linalg.norm(d)
    ends = {}
    # the hand skin spans -54 mm (thumb side) .. +45 mm (little-finger side) along the grip axis from the grip centre:
    # the rope runs straight through that span; the stopper sits just past the other edge
    EXIT = float(_os.environ.get('ROPE_EXIT', 0.006))
    T_THUMB, T_PINKY = -0.0543 - EXIT, 0.0452 + EXIT
    for s, (c, a) in hands.items():
        out = -a if entry == 'thumb' else a                  # direction the rope leaves the fist toward the pulley
        t_out, t_knob = (T_THUMB, T_PINKY) if entry == 'thumb' else (T_PINKY, T_THUMB)
        ends[s] = (c, a, t_out, out, c + a * t_knob)
    def exit_pt(s, C):
        c, a, t_out, out, K = ends[s]
        g = C - (c + a * t_out); g /= np.linalg.norm(g)
        phi = math.acos(np.clip(out @ g, -1, 1))
        # a turn of more than ~45 deg starts bending inside the fist edge (at the heel of the hand), so the bend hugs the
        # fist instead of hooking out behind it (judge round 1: a 100 deg turn on 35 mm stuck out 4 cm behind the fist)
        inset = float(_os.environ.get('ROPE_INSET', 0.020)) * float(np.clip((phi - math.radians(45)) / math.radians(45), 0, 1))
        return c + a * (t_out - np.sign(t_out) * inset), phi
    lo, hi = 0.02, 1.2                                       # the clip slides along the hand-mid -> pulley line until the strands are taut
    for _ in range(50):
        t = (lo + hi) / 2; C = M + d * t
        L = np.mean([np.linalg.norm(C - exit_pt(s, C)[0]) for s in ends])
        if L < STRAND: lo = t
        else: hi = t
    C = M + d * (lo + hi) / 2
    paths = {}
    for s in ends:
        c, a, t_out, out, K = ends[s]
        E, phi = exit_pt(s, C)
        if _os.environ.get('ROPEDBG'): print('ROPEDBG', s, 'phi %.0f deg' % math.degrees(phi), 'inset %.1f mm' % (1000 * np.linalg.norm(E - (c + a * t_out))))
        g = C - E; g /= np.linalg.norm(g)
        phi = math.acos(np.clip(out @ g, -1, 1))
        n = g - (g @ out) * out
        through = np.linspace(K, E, 8)[:-1]
        if phi < 0.05 or np.linalg.norm(n) < 1e-6:
            arc = [E]
        else:
            n /= np.linalg.norm(n)
            # radius limited so the arc never overshoots the clip
            rho = min(ROPE_WRAP, 0.45 * np.linalg.norm(C - E))
            ctr = E + n * rho
            arc = [ctr - n * rho * math.cos(q) + out * rho * math.sin(q) for q in np.linspace(0, phi, max(6, int(phi / 0.08)))]
        Q = np.array(arc[-1])
        line = [Q + (C - Q) * u for u in np.linspace(0, 1, 16)[1:]]
        paths[s] = np.vstack([through, np.array(arc), np.array(line)])
    return C, d, paths

NTHROUGH = 7

def rope_mats():
    m = bpy.data.materials.get('RopeMat')
    if m is None:
        # dark charcoal braided rope: a three-strand helix (pitch 25 mm) + fine fibres, from the 'rc' attribute
        m = bpy.data.materials.new('RopeMat'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
        b = N['Principled BSDF']; v = float(_os.environ.get('ROPE_V', 0.0048))
        b.inputs['Base Color'].default_value = (v, v, v * 1.03, 1); b.inputs['Roughness'].default_value = 0.72
        if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.3
        at = N.new('ShaderNodeAttribute'); at.attribute_name = 'rc'; at.attribute_type = 'GEOMETRY'
        sp = N.new('ShaderNodeSeparateXYZ'); L.new(at.outputs['Vector'], sp.inputs[0])
        ang = N.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'; L.new(sp.outputs['Y'], ang.inputs[0]); L.new(sp.outputs['X'], ang.inputs[1])
        def mad(x, k, c0):
            n_ = N.new('ShaderNodeMath'); n_.operation = 'MULTIPLY_ADD'; L.new(x, n_.inputs[0]); n_.inputs[1].default_value = k; n_.inputs[2].default_value = c0; return n_.outputs[0]
        def op(o_, a_, b_=None, bv=None):
            n_ = N.new('ShaderNodeMath'); n_.operation = o_; L.new(a_, n_.inputs[0])
            if b_ is not None: L.new(b_, n_.inputs[1])
            elif bv is not None: n_.inputs[1].default_value = bv
            return n_.outputs[0]
        PITCH = 0.025
        s_term = mad(sp.outputs['Z'], -2 * math.pi / PITCH, 0.0)           # -2 pi s / pitch
        ph = op('MULTIPLY', op('ADD', ang.outputs[0], s_term), bv=3.0)       # 3 (a - 2 pi s / p)
        strand = mad(op('COSINE', ph), 0.5, 0.5)
        strand = op('POWER', strand, bv=0.45)                                 # round strands, narrow grooves
        fib = op('MULTIPLY', op('ADD', ang.outputs[0], mad(sp.outputs['Z'], 2 * math.pi / 0.007, 0.0)), bv=26.0)
        fib = mad(op('SINE', fib), 0.06, 0.0)
        h = op('ADD', strand, fib)
        bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.75; bp.inputs['Distance'].default_value = 0.0012
        L.new(h, bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
        # grooves a touch darker
        cm = N.new('ShaderNodeMix'); cm.data_type = 'RGBA'; cm.blend_type = 'MULTIPLY'; cm.inputs['Factor'].default_value = 1.0
        cm.inputs['A'].default_value = (v, v, v * 1.03, 1)
        gm = mad(strand, 0.5, 0.5)
        cc = N.new('ShaderNodeCombineXYZ'); L.new(gm, cc.inputs[0]); L.new(gm, cc.inputs[1]); L.new(gm, cc.inputs[2])
        L.new(cc.outputs[0], cm.inputs['B']); L.new(cm.outputs['Result'], b.inputs['Base Color'])
    rub = _mat('RopeRubber', (0.0012, 0.0012, 0.0013), 0.6, 0.22)        # matte black rubber stoppers
    met = _mat('RopeMetal', (0.42, 0.42, 0.43), 0.32, 0.5, 1.0)           # clip and eye: steel
    cab = _mat('CableMat', (0.012, 0.012, 0.013), 0.45, 0.35)             # coated cable: a dark line that reads against the cyc
    return m, rub, met, cab

def update_rope(hands, pulley_c, entry):
    C, d, paths = rope_geometry(hands, pulley_c, entry)
    bm = bmesh.new()
    knobs = {}
    for s, p in paths.items():
        _tube3(p, ROPE_R, 20, bm, 0)
        # rubber stopper on the knob end: soft chamfer where the rope enters, straight body, domed end
        k0 = p[0]; tdir = (p[0] - p[1]) / np.linalg.norm(p[0] - p[1])
        us, rr = [], []
        for u in np.linspace(0, 0.006, 4): us.append(u); rr.append(ROPE_R + 0.0008 + (KNOB_R - ROPE_R - 0.0008) * math.sin(0.5 * math.pi * u / 0.006))
        for u in np.linspace(0.006, KNOB_L - KNOB_R, 6)[1:]: us.append(u); rr.append(KNOB_R)
        for q in np.linspace(0, 0.5 * math.pi, 9)[1:]:
            us.append(KNOB_L - KNOB_R + KNOB_R * math.sin(q)); rr.append(max(KNOB_R * math.cos(q), 0.0006))
        kp = np.vstack([k0 - tdir * 0.001 + tdir * u for u in us])
        _tube3(kp, rr, 28, bm, 1)
        knobs[s] = (kp, rr)
    # clip: a short steel sleeve where the two strands meet, an eye, then the cable to the pulley's groove
    sleeve = np.vstack([C + d * u for u in np.linspace(-0.012, 0.040, 6)])
    _tube3(sleeve, 0.0145, 24, bm, 2)
    P = np.array(pulley_c); v = C - P; v /= np.linalg.norm(v)
    side = np.cross(np.cross(v, np.array([1.0, 0, 0])), np.array([1.0, 0, 0]))
    side = side / np.linalg.norm(side) if np.linalg.norm(side) > 1e-6 else v
    T_ = P + side * (WHEEL_R - 0.009) * (1 if side @ v > 0 else -1)
    ax = np.cross(d, np.array([1.0, 0, 0])); ax = ax / np.linalg.norm(ax) if np.linalg.norm(ax) > 1e-6 else np.array([0, 1.0, 0])
    ec = C + d * 0.053
    eye = np.vstack([ec + 0.011 * (math.cos(q) * d + math.sin(q) * ax) for q in np.linspace(0, 2 * math.pi, 33)])
    _tube3(eye, 0.0028, 12, bm, 2)
    c0 = ec + d * 0.011
    cable = np.vstack([c0 + (T_ - c0) * u for u in np.linspace(0, 1, 40)])
    _tube3(cable, 0.0030, 12, bm, 3)
    me = bpy.data.meshes.get('RopeMesh') or bpy.data.meshes.new('RopeMesh')
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.get('Rope')
    if o is None:
        o = bpy.data.objects.new('Rope', me); bpy.data.collections['PROPS'].objects.link(o)
        for m_ in rope_mats(): o.data.materials.append(m_)
    LAST.clear(); LAST.update(C=C, d=d, paths=paths, knobs=knobs, sleeve=sleeve, cable=cable)
    return o, C
