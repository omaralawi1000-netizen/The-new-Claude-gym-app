# r8 full-body: blender -b scene8.blend --python render8.py -- still OUT.png FRAME [samples] [resx resy] [cam]
#                blender -b scene8.blend --python render8.py -- anim OUTDIR - [samples] [resx resy] [cam]     (MOTION=curl)
import bpy, sys, os, math, numpy as np
sys.path.insert(0, os.getcwd())
import pose, pose2
MOT = pose2.load(os.environ.get('MOTION', 'curl'))
from mathutils import Vector, Matrix, Quaternion
a = sys.argv[sys.argv.index('--')+1:]
mode, out = a[0], os.path.abspath(a[1])
sc = bpy.context.scene
if len(a) > 3: sc.cycles.samples = int(a[3])
if len(a) > 5: sc.render.resolution_x, sc.render.resolution_y = int(a[4]), int(a[5])
CAMS = {'ref': ((-1.85, -3.3, 1.25), (0.0, 0.0, 0.875), 52),
        'torso': ((-0.55, -1.45, 1.22), (-0.02, 0, 1.12), 50),
        'arm': ((-0.75, -1.05, 1.15), (-0.22, -0.05, 1.07), 50),
        'chest': ((-0.12, -0.75, 1.32), (-0.06, 0, 1.28), 60),
        'knee': ((-0.45, -0.95, 0.55), (-0.08, 0, 0.45), 50),
        'ankle': ((-0.45, -0.75, 0.25), (-0.12, 0, 0.08), 50),
        'hand': ((-0.55, -0.75, 1.18), (-0.25, -0.18, 1.08), 55),
        'neck': ((-0.35, -0.85, 1.55), (0, 0, 1.47), 50),
        'ref40': ((-2.43, -2.90, 1.25), (0.0, 0.0, 0.875), 52),
        'ref36': ((-2.22, -3.06, 1.25), (0.0, 0.0, 0.875), 52),
        'pelvis': ((-0.35, -1.1, 0.95), (0, 0, 0.82), 50),
        'headside': ((-0.9, -0.25, 1.55), (0, 0, 1.52), 60),
        'headref': ((-0.511, -0.911, 1.634), (0.0, 0.0, 1.53), 60),
        'clipref': ((-1.85, -3.3, 1.25), (0.0, 0.0, 0.85), 48),
        'clip': ((-1.45, -3.5, 1.0), (0.0, 0.0, 0.9), 46),
        'side': ((-4.0, 0.0, 0.95), (0.0, 0.0, 0.9), 50)}
GLOW_SIZE = float(os.environ.get('GLOW_SIZE', 0.62)); GLOW_STRENGTH = float(os.environ.get('GLOW_STRENGTH', 1.0))
cname = a[6] if len(a) > 6 else 'ref'
cam = sc.camera; loc, tgt, lens = CAMS[cname]
if os.environ.get('CAM_LENS'): lens = float(os.environ['CAM_LENS'])   # cable moves: a touch wider so the pulley and base sit inside the frame
if os.environ.get('CAM_TZ'): tgt = (tgt[0], tgt[1], float(os.environ['CAM_TZ']))
cam.data.lens = lens
def set_cam(orbit_deg=0.0, lift=0.0):
    c = math.cos(math.radians(orbit_deg)); s_ = math.sin(math.radians(orbit_deg))
    dx, dy = loc[0] - tgt[0], loc[1] - tgt[1]
    L = Vector((tgt[0] + dx * c - dy * s_, tgt[1] + dx * s_ + dy * c, loc[2] + lift))
    T = Vector(tgt); pan = float(os.environ.get('CAM_PAN', 0))   # slide camera + target sideways (m, + = image right moves left)
    if pan:
        rt = (T - L).cross(Vector((0, 0, 1))).normalized(); L = L + rt * pan; T = T + rt * pan
    cam.location = L; cam.rotation_euler = (T - L).to_track_quat('-Z', 'Y').to_euler()
set_cam()

# bar centre in each hand's rest frame = circle through the gripped middle-finger joints
def grip_centre(side, g=1.0):
    G, J = pose.transforms(side, 0.0, 0.0, g); c = J['f2']
    p = [np.array(G['hand'] @ Vector(c[1])), np.array(G['f20'] @ Vector(c[2])), np.array(G['f22'] @ Vector(c[4]))]
    u, v = p[1] - p[0], p[2] - p[0]; n = np.cross(u, v)
    return p[0] + (np.cross(n, u) * (v @ v) + np.cross(v, n) * (u @ u)) / (2 * (n @ n))
GC = {s: grip_centre(s) for s in 'rl'}
_GCC = {}
def gc(s, g):   # bar centre for this grip (the grip the motion asks for, not always a full fist)
    k = (s, round(g, 4))
    if k not in _GCC: _GCC[k] = grip_centre(s, g)
    return _GCC[k]

import re as _re
# which muscles glow: the movers of THIS exercise (the scene ships with the biceps glowing for the curl)
GLOW_RE = os.environ.get('GLOW_RE') or {'hammer': r'^(Long|Short) head of biceps brachii|^Brachialis muscle|^Brachioradialis',
                                        'pushdown': r'^(Long|Lateral|Medial) head of triceps brachii'}.get(os.environ.get('MOTION', 'curl'), r'^(Long|Short) head of biceps brachii')
def _glow_band(o):
    # the Glow material masks by the 'bt' attribute (lit for bt 0.17..0.47, fading over 0.02..0.17 and 0.47..0.60), built for
    # the biceps as 0 elbow .. 1 shoulder. Upper-arm muscles get the same; forearm ones get a band over the belly (upper
    # forearm), fading out down the tendon toward the wrist and up past the elbow.
    sd = o.get('rig_side'); E_ = np.array(pose.JS[sd]['E'])
    P = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    if _re.search(r'Brachioradialis', o.name, _re.I):
        A_ = np.array(pose.JS[sd]['W']) - E_; u = ((P - E_) @ A_) / (A_ @ A_); t_ = 0.17 + u * (0.30 / 0.55)   # lit u 0..0.55: the belly
    elif _re.search(r'triceps', o.name, _re.I):
        A_ = np.array(pose.JS[sd]['S']) - E_; t = ((P - E_) @ A_) / (A_ @ A_); t1 = float(os.environ.get('TRI_T1', 0.75)); print('TRIBAND', o.name, t1, float(np.min(t)), float(np.max(t))); t_ = 0.17 + (t - 0.12) * (0.30 / (t1 - 0.12))   # lit t 0.12..t1: the horseshoe (pushdown r4: TRI_T1 0.62 fades the top out under the deltoid border)
    else:
        A_ = np.array(pose.JS[sd]['S']) - E_; t_ = ((P - E_) @ A_) / (A_ @ A_)
    at = o.data.attributes.get('bt') or o.data.attributes.new('bt', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', np.stack([t_ * 0, t_ * 0, t_], 1).ravel().astype(np.float32))
if 'Glow' in bpy.data.materials and 'Clay' in bpy.data.materials:
    import re as _re
    for _o in bpy.data.objects:
        if _o.type != 'MESH' or not _o.material_slots or _o.get('rig_side') is None: continue
        _m = _o.material_slots[0].material
        if _m is not None and _m.name in ('Glow', 'Clay'):
            _g = bool(_re.search(GLOW_RE, _o.name, _re.I))
            if _g and _o.data.attributes.get('bt') is None: _glow_band(_o)
            _o.material_slots[0].material = bpy.data.materials['Glow' if _g else 'Clay']
            if _g and os.environ.get('GRIPDIAG'): print('GLOWS', _o.name)
if os.environ.get('GLOW_FACE_MIN') and 'Glow' in bpy.data.materials:   # pushdown r4: more facing contrast, so each triceps head reads as its own bulge
    bpy.data.materials['Glow'].node_tree.nodes['Map Range.002'].inputs['To Max'].default_value = float(os.environ['GLOW_FACE_MIN'])
if os.environ.get('GLOW_EMIT') and 'Glow' in bpy.data.materials:   # emission level (scene: 0.08); below clipping the facing shading shows
    bpy.data.materials['Glow'].node_tree.nodes['Math.001'].inputs[1].default_value = float(os.environ['GLOW_EMIT'])
if float(os.environ.get('GLOW_AO', 0)) > 0 and 'Glow' in bpy.data.materials:   # pushdown r4: grooves between muscle heads darken the
    # glow a little (emission x (1-k .. 1) by a short-range AO), so the triceps reads as two lobes instead of one flat shield
    _N = bpy.data.materials['Glow'].node_tree.nodes; _L = bpy.data.materials['Glow'].node_tree.links
    if 'GAO' not in _N:
        _em = _N['Emission']; _src = _em.inputs['Strength'].links[0].from_socket
        _ao = _N.new('ShaderNodeAmbientOcclusion'); _ao.name = 'GAO'; _ao.samples = 16; _ao.inputs['Distance'].default_value = float(os.environ.get('GLOW_AO_D', 0.025))
        _mr = _N.new('ShaderNodeMapRange'); _mr.inputs['To Min'].default_value = 1 - float(os.environ['GLOW_AO']); _mr.inputs['To Max'].default_value = 1.0
        _mu = _N.new('ShaderNodeMath'); _mu.operation = 'MULTIPLY'
        _L.new(_ao.outputs['AO'], _mr.inputs['Value']); _L.new(_src, _mu.inputs[0]); _L.new(_mr.outputs['Result'], _mu.inputs[1]); _L.new(_mu.outputs['Value'], _em.inputs['Strength'])
PROP = os.environ.get('PROP', 'barbell'); EZ_DEG = float(os.environ.get('EZ_DEG', 22)); EZ = None; EZ_YS = None; STATION = None
def ez_frame(G, bx):
    """in-plane 'forward' axis of the EZ bar: perpendicular to the bar line and to the mean forearm direction"""
    global EZ_YS
    n = Vector((0, 0, 0))
    for sd in 'rl':
        E_, W_ = Vector(pose.JS[sd]['E']), Vector(pose.JS[sd]['W'])
        n += (G['fore.' + sd] @ W_ - G['fore.' + sd] @ E_).normalized()
    n = (n - n.dot(bx) * bx).normalized(); yb = n.cross(bx).normalized()
    if EZ_YS is None:   # the outer ends of the grip segments go where the thumbs turned (picked once, from the hands)
        aw = (G['hand.r'].to_3x3() @ Vector(pose.GRIP['r']['a'])).normalized()
        c_, s_ = math.cos(math.radians(EZ_DEG)), math.sin(math.radians(EZ_DEG))
        EZ_YS = 1.0 if (c_ * bx - s_ * yb).normalized().dot(aw) >= (c_ * bx + s_ * yb).normalized().dot(aw) else -1.0
        print('EZ_YS', EZ_YS)
    return yb * EZ_YS

TWIST_FROM_WRIST = os.environ.get('TWIST_FROM_WRIST', '1' if PROP != 'barbell' else '0') == '1'
def posed(v, f=None):
    """channel values -> bone world matrices with each hand turned so its grip lies along the bar (or its EZ segment).
    The part of that turn about the forearm's long axis goes into the forearm twist (a wrist can't roll); the wrist keeps
    only bend and side-to-side."""
    G = pose2.solve(v)
    if pose.GRIP and not PROP.startswith('rope'):
        HB = [k for k in G if k.split('.')[0] in ('hand', 't0', 't1', 't2') or (k[0] == 'f' and k[1:3].isdigit())]
        TW = [k for k in G if k.split('.')[0] in ('foretw',)] + HB
        for _ in range(4):
            pr = np.array(G['hand.r'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(G['hand.l'] @ Vector(pose.GRIP['l']['c']))
            bx = Vector(pose.nrm(pl - pr))
            TG = (('r', bx), ('l', -bx))
            if PROP == 'ez':   # each hand follows its own angled grip segment
                yb = ez_frame(G, bx); c_, s_ = math.cos(math.radians(EZ_DEG)), math.sin(math.radians(EZ_DEG))
                TG = (('r', (c_ * bx - s_ * yb).normalized()), ('l', (-c_ * bx - s_ * yb).normalized()))
            for sd, tgt in TG:
                aw = (G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized()
                rd = aw.rotation_difference(tgt)
                Ep = G['fore.' + sd] @ Vector(pose.JS[sd]['E']); Wp = G['fore.' + sd] @ Vector(pose.JS[sd]['W'])
                tw_ang = 0.0
                if TWIST_FROM_WRIST and 'foretw.' + sd in G:   # swing-twist split about the forearm axis
                    fa = (Wp - Ep).normalized(); vq = Vector((rd.x, rd.y, rd.z)); pv = fa * vq.dot(fa)
                    qt = Quaternion((rd.w, pv.x, pv.y, pv.z));
                    if qt.magnitude > 1e-9:
                        qt.normalize(); tw_ang = 2 * math.atan2(Vector((qt.x, qt.y, qt.z)).dot(fa), qt.w)
                        Mt = Matrix.Translation(Wp) @ Matrix.Rotation(tw_ang, 4, fa) @ Matrix.Translation(-Wp)
                        for k in TW:
                            if k.endswith('.' + sd): G[k] = Mt @ G[k]
                        aw = (G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized(); rd = aw.rotation_difference(tgt)
                if os.environ.get('GRIPDIAG') and _ == 0 and f is not None:
                    print('WRISTCORR f%s %s wrist %.1f deg, into forearm twist %.1f deg' % (f, sd, math.degrees(rd.angle), math.degrees(tw_ang)))
                Mc = Matrix.Translation(Wp) @ rd.to_matrix().to_4x4() @ Matrix.Translation(-Wp)
                for k in HB:
                    if k.endswith('.' + sd): G[k] = Mc @ G[k]
    if pose.GRIP and PROP.startswith('rope') and float(os.environ.get('ROPE_TILT', 10)) > 0:
        # under cable tension the fist tilts into its rope line (side to side at the wrist, up to ROPE_TILT deg, more for a
        # sharper turn), so the rope rolls over the heel of the hand instead of turning a corner under it (judge r2 fix 2a)
        import props
        P = np.array(props.LOW if PROP == 'rope_low' else props.HIGH); entry = os.environ.get('ROPE_ENTRY', 'pinky' if PROP == 'rope_low' else 'thumb')
        HB = [k for k in G if k.split('.')[0] in ('hand', 't0', 't1', 't2') or (k[0] == 'f' and k[1:3].isdigit())]
        cs = {sd: np.array(G['hand.' + sd] @ Vector(pose.GRIP[sd]['c'])) for sd in 'rl'}
        M = (cs['r'] + cs['l']) / 2; dd = pose.nrm(P - M); Cg = M + dd * 0.75 * props.STRAND
        for sd in 'rl':
            a = np.array((G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized()); out = -a if entry == 'thumb' else a
            Ep = G['fore.' + sd] @ Vector(pose.JS[sd]['E']); Wp = G['fore.' + sd] @ Vector(pose.JS[sd]['W'])
            fa = pose.nrm(np.array(Wp - Ep)); npalm = pose.nrm(np.cross(fa, a))
            g = pose.nrm(Cg - (cs[sd] + out * 0.05)); phi = math.degrees(math.acos(float(np.clip(out @ g, -1, 1))))
            # signed by how much of the turn a side-to-side tilt can take (the share of out x g along the palm normal): it
            # passes smoothly through 0 instead of flipping sign (a sign flip snapped the wrist ~10 deg between frames)
            cx = np.cross(out, g); share = float(np.dot(cx, npalm) / max(np.linalg.norm(cx), 1e-9))
            # judge r3: up to 8 deg once the turn passes 85 deg; the share (gain 2, clipped) keeps the sign change smooth
            ang = math.radians(float(os.environ.get('ROPE_TILT', 8)) * float(np.clip((phi - 45) / 40, 0, 1))) * float(np.clip(2 * share, -1, 1)); sgn = 1.0
            Mt = Matrix.Translation(Wp) @ Matrix.Rotation(sgn * ang, 4, Vector(npalm)) @ Matrix.Translation(-Wp)
            for k in HB:
                if k.endswith('.' + sd): G[k] = Mt @ G[k]
            if os.environ.get('GRIPDIAG') and f is not None: print('ROPETILT f%s %s phi %.0f tilt %.1f' % (f, sd, phi, math.degrees(sgn * ang)))
    return G

def grip_sep(G):
    pr = np.array(G['hand.r'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(G['hand.l'] @ Vector(pose.GRIP['l']['c']))
    return float(np.linalg.norm(pl - pr))

SEP0 = None
def set_frame(f, camera=True):
    global SEP0
    v = pose2.values(MOT, f)
    if PROP == 'ez' or (PROP == 'barbell' and os.environ.get('LOCKW', '1') == '1'):   # a rigid bar keeps the hands the same distance apart: the shoulders open or close a touch to hold it (the r15 barbell curl lacked this, so its hands slid 8 cm along the bar: Omar 18 Oct)
        if SEP0 is None: SEP0 = 2 * float(os.environ['LOCKW_SEP']) / 1000 if os.environ.get('LOCKW_SEP') else grip_sep(posed(pose2.values(MOT, 0)))   # LOCKW_SEP: half-width in mm
        base = v.get('abduct', 0.0); lo, hi = base - 8.0, base + float(os.environ.get('LOCKW_MAX', 8.0))
        for _ in range(18):
            mid = (lo + hi) / 2; v['abduct'] = mid
            if grip_sep(posed(v)) < SEP0: lo = mid
            else: hi = mid
        v['abduct'] = (lo + hi) / 2
        if os.environ.get('GRIPDIAG'): print('ABDUCT f%s %.2f deg' % (f, v['abduct']))
    G = posed(v, f)
    pose2.apply(G)
    Gs = {s: {nm[:-2]: g for nm, g in G.items() if nm.endswith('.' + s)} for s in 'rl'}
    if pose.GRIP:   # the bar sits where the solved grip closed round it
        pr = np.array(Gs['r']['hand'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(Gs['l']['hand'] @ Vector(pose.GRIP['l']['c']))
    else:
        pr = np.array(Gs['r']['hand'] @ Vector(gc('r', v['grip']))); pl = np.array(Gs['l']['hand'] @ Vector(gc('l', v['grip'])))
    x = pose.nrm(pl - pr)
    if PROP.startswith('rope'):   # the rope follows the hands: each strand runs through its fist along the grip axis
        import props
        global STATION
        if STATION is None:
            STATION = props.make_cable_station(low=PROP == 'rope_low', high=PROP == 'rope_high'); bpy.data.objects['Barbell'].hide_render = True
        hands = {s: (np.array(Gs[s]['hand'] @ Vector(pose.GRIP[s]['c'])), np.array((Gs[s]['hand'].to_3x3() @ Vector(pose.GRIP[s]['a'])).normalized())) for s in 'rl'}
        props.update_rope(hands, props.LOW if PROP == 'rope_low' else props.HIGH, os.environ.get('ROPE_ENTRY', 'pinky' if PROP == 'rope_low' else 'thumb'))
        # the stoppers sit on the side of the fist AWAY from the pulley (the rope pulls toward it): low pulley curl ->
        # rope leaves the pinky side, knobs over the thumbs; high pulley pushdown -> rope leaves the thumb side, knobs under the pinkies
    elif PROP == 'ez':
        global EZ
        if EZ is None:
            import props; EZ = props.make_ez(float(np.linalg.norm(pl - pr)) / 2, EZ_DEG); bpy.data.objects['Barbell'].hide_render = True
            print('EZ built gx %.4f deg %.1f' % (float(np.linalg.norm(pl - pr)) / 2, EZ_DEG))
        y = np.array(ez_frame(G, Vector(x))); z = np.cross(x, y)
        M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
        EZ.matrix_world = M
    else:
        zh = np.array(Gs['r']['hand'].to_3x3() @ Vector((0, 0, 1))); z = pose.nrm(zh - (zh @ x) * x); y = np.cross(z, x)
        M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
        bpy.data.objects['Barbell'].matrix_world = M
    if os.environ.get('SQUASH') == '1':   # forearm presses into the biceps at deep flexion instead of passing through it (squash.py)
        import squash
        EW = {s: (np.array(G['fore.' + s] @ Vector(pose.JS[s]['E'])), np.array(G['fore.' + s] @ Vector(pose.JS[s]['W']))) for s in 'rl'}
        GF = {s: G['fore.' + s] for s in 'rl'}
        if not squash.MODS: bpy.context.view_layer.update(); squash.setup(EW, GF)
        squash.update(EW, v['elbow'], GF, {s: np.array(G['upper.' + s] @ Vector(pose.JS[s]['S'])) for s in 'rl'})
    if camera and not os.environ.get('NOCAM'): set_cam(float(os.environ['CAM_ORBIT']) if os.environ.get('CAM_ORBIT') else v.get('cam_orbit', 0.0), v.get('cam_lift', 0.0))
    if os.environ.get('NECKCAM'):   # close-up on the neck, following the posed neck bone
        t = np.array(G['neck'] @ Vector((0, 0.0, 1.47)))
        dv = np.array([float(q) for q in os.environ['NECKDIR'].split(',')]) if os.environ.get('NECKDIR') else np.array(CAMS['clipref'][0]) - np.array(CAMS['clipref'][1])
        L = Vector(t + pose.nrm(dv) * float(os.environ.get('NECKDIST', 0.9))); cam.location = L; cam.data.lens = 60
        cam.rotation_euler = (Vector(t) - L).to_track_quat('-Z', 'Y').to_euler()
    if os.environ.get('HANDCAM'):   # close-up on one hand ('r'/'l'), seen from the clip camera's direction (or HANDDIR x,y,z)
        t = pr if os.environ['HANDCAM'] == 'r' else pl
        dv = np.array([float(q) for q in os.environ['HANDDIR'].split(',')]) if os.environ.get('HANDDIR') else np.array(CAMS['clipref'][0]) - np.array(CAMS['clipref'][1])
        L = Vector(t + pose.nrm(dv) * float(os.environ.get('HANDDIST', 0.55))); cam.location = L; cam.data.lens = 60
        cam.rotation_euler = (Vector(t) - L).to_track_quat('-Z', 'Y').to_euler()

def glare():
    if hasattr(sc, 'node_tree') and not hasattr(sc, 'compositing_node_group'):
        sc.use_nodes = True; nt = sc.node_tree; N = nt.nodes
        for nd in list(N): N.remove(nd)
        rl = N.new('CompositorNodeRLayers'); g = N.new('CompositorNodeGlare'); comp = N.new('CompositorNodeComposite')
        g.glare_type = 'FOG_GLOW'; g.quality = 'HIGH'; g.threshold = 1.6; g.size = 9; g.mix = 0.0
        nt.links.new(rl.outputs['Image'], g.inputs['Image']); nt.links.new(g.outputs['Image'], comp.inputs['Image'])
    else:  # Blender 5.x compositor: bloom only from the emission pass, added over the image
        bpy.context.view_layer.use_pass_emit = True
        ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); sc.compositing_node_group = ng; N = ng.nodes
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = N.new('CompositorNodeRLayers'); g = N.new('CompositorNodeGlare'); o = N.new('NodeGroupOutput')
        g.inputs['Type'].default_value = 'Fog Glow'; g.inputs['Quality'].default_value = 'High'
        g.inputs['Threshold'].default_value = 0.0; g.inputs['Size'].default_value = GLOW_SIZE; g.inputs['Strength'].default_value = GLOW_STRENGTH
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'ADD'; mx.inputs['Factor'].default_value = 1.0
        ng.links.new(rl.outputs['Emission'], g.inputs['Image'])
        # the bloom never washes over the bar, plates or hands in front of the biceps
        bpy.context.view_layer.use_pass_object_index = True
        for ob in bpy.data.objects:
            if ob.name in ('Barbell', 'EZBar', 'Rope', 'CableStation') or ob.name.startswith(('Palm', 'Dorsum of hand', 'Dorsal surfaces of digits', 'Palmar surfaces of digits')): ob.pass_index = 1
            # BLOOM_FORE: nor over the forearm muscles, which cross in front of the biceps at the top of a curl (judge r16: red haze on the forearm)
            if os.environ.get('BLOOM_FORE') == '1' and ob.type == 'MESH' and ob.get('rig_side') and ob.users_collection and ob.users_collection[0].name == 'MUS' \
                    and _re.search(r'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus', ob.name, _re.I): ob.pass_index = 1
        if os.environ.get('FORE_NOLIGHT') == '1':   # the glowing muscles do not light the forearm muscles red (light linking, receiver side)
            fore = [ob for ob in bpy.data.objects if ob.type == 'MESH' and ob.get('rig_side') and ob.users_collection and ob.users_collection[0].name == 'MUS'
                    and _re.search(r'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus', ob.name, _re.I)]
            rc = bpy.data.collections.new('NoGlowLight')
            for ob in fore: rc.objects.link(ob)
            for co in rc.collection_objects: co.light_linking.link_state = 'EXCLUDE'
            n_ = 0
            for ob in bpy.data.objects:
                if ob.type == 'MESH' and ob.material_slots and ob.material_slots[0].material and ob.material_slots[0].material.name == 'Glow':
                    ob.light_linking.receiver_collection = rc; n_ += 1
            print('FORE_NOLIGHT', len(fore), 'receivers excluded from', n_, 'glow objects')
        inv = N.new('ShaderNodeMath'); inv.operation = 'MULTIPLY_ADD'; inv.inputs[1].default_value = -float(os.environ.get('MASK_K', 0.9)); inv.inputs[2].default_value = 1.0
        if os.environ.get('MASK_AOV', '1') == '1':
            # the mask as a shader AOV instead of the object-index pass: an AOV is filtered like the image, so its edge is
            # anti-aliased (judge r17: the index mask cut a hard stair-stepped edge along the forearm at f40-84)
            if not any(a.name == 'nb' for a in bpy.context.view_layer.aovs):
                a = bpy.context.view_layer.aovs.add(); a.name = 'nb'; a.type = 'VALUE'
            done = set()
            for ob in bpy.data.objects:
                if ob.type != 'MESH': continue
                for sl in ob.material_slots:
                    m = sl.material
                    if m is None or m.name in done or not m.node_tree: continue
                    done.add(m.name); mt = m.node_tree
                    oi = mt.nodes.new('ShaderNodeObjectInfo'); c2 = mt.nodes.new('ShaderNodeMath'); c2.operation = 'COMPARE'
                    c2.inputs[1].default_value = 1.0; c2.inputs[2].default_value = 0.5
                    ao = mt.nodes.new('ShaderNodeOutputAOV'); ao.aov_name = 'nb'
                    mt.links.new(oi.outputs['Object Index'], c2.inputs[0]); mt.links.new(c2.outputs[0], ao.inputs['Value'])
            bpy.context.view_layer.update()
            ng.links.new(rl.outputs['nb'], inv.inputs[0])
        else:
            cmp_ = N.new('ShaderNodeMath'); cmp_.operation = 'COMPARE'; cmp_.inputs[1].default_value = 1.0; cmp_.inputs[2].default_value = 0.5
            ng.links.new(rl.outputs['Object Index'] if 'Object Index' in rl.outputs else rl.outputs['IndexOB'], cmp_.inputs[0]); ng.links.new(cmp_.outputs[0], inv.inputs[0])
        gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'; gm.inputs['Factor'].default_value = 1.0
        # a soft red halo just past the silhouette (MoveKit style): the emission pass blurred wide, added to the bloom
        bl = N.new('CompositorNodeBlur'); bl.inputs['Type'].default_value = 'Gaussian'
        hr = float(os.environ.get('HALO_R', 0.018)) * sc.render.resolution_x; bl.inputs['Size'].default_value = (hr, hr)
        ng.links.new(rl.outputs['Emission'], bl.inputs['Image'])
        K_ = float(os.environ.get('HALO_K', 3.0))
        hs = N.new('ShaderNodeMix'); hs.data_type = 'RGBA'; hs.blend_type = 'MULTIPLY'; hs.inputs['Factor'].default_value = 1.0; hs.clamp_result = False
        ng.links.new(bl.outputs['Image'], hs.inputs['A']); hs.inputs['B'].default_value = (K_, K_, K_, 1)
        hk = N.new('ShaderNodeMix'); hk.data_type = 'RGBA'; hk.blend_type = 'ADD'; hk.inputs['Factor'].default_value = 1.0; hk.clamp_result = False
        ng.links.new(g.outputs['Glare'], hk.inputs['A']); ng.links.new(hs.outputs['Result'], hk.inputs['B'])
        ng.links.new(hk.outputs['Result'], gm.inputs['A']); ng.links.new(inv.outputs[0], gm.inputs['B'])
        ng.links.new(rl.outputs['Image'], mx.inputs['A']); ng.links.new(gm.outputs['Result'], mx.inputs['B'])
        ng.links.new(mx.outputs['Result'], o.inputs[0])

def denoise():
    try:
        sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    except Exception as e:
        print('no denoise', e); sc.cycles.use_denoising = False

_orb0 = float(os.environ['CAM_ORBIT']) if os.environ.get('CAM_ORBIT') else pose2.values(MOT, 0).get('cam_orbit', 0.0)
if _orb0:   # a turned camera takes the whole studio (cyc + lights) with it: same backdrop and light, figure seen from another side
    _Rz = Matrix.Rotation(math.radians(_orb0), 4, 'Z')
    for ob in bpy.data.collections['STUDIO'].objects:
        if ob.name != 'Cam': ob.matrix_world = _Rz @ ob.matrix_world
    print('STUDIO turned', _orb0)
if PROP == 'ez' or PROP.startswith('rope'): set_frame(0, camera=False)   # builds the EZ bar to fit the hands
glare(); denoise()
if os.environ.get('HIDE'):   # test: hide objects whose name matches this regex
    import re as _re
    for ob in bpy.data.objects:
        if _re.search(os.environ['HIDE'], ob.name): ob.hide_render = True; print('HIDDEN', ob.name)
# fast-mode switches (r10 reference = none of these): keep the scene in memory between frames, cap light bounces
if os.environ.get('PERSIST'): sc.render.use_persistent_data = True
if os.environ.get('BOUNCES'):
    nb = int(os.environ['BOUNCES']); sc.cycles.max_bounces = nb
    sc.cycles.diffuse_bounces = min(sc.cycles.diffuse_bounces, nb); sc.cycles.glossy_bounces = min(sc.cycles.glossy_bounces, nb)
    sc.cycles.transmission_bounces = min(sc.cycles.transmission_bounces, nb); sc.cycles.transparent_max_bounces = max(4, min(sc.cycles.transparent_max_bounces, 2 * nb))
if os.environ.get('NOISE_T'): sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = float(os.environ['NOISE_T'])
print('SETTINGS samples', sc.cycles.samples, 'adaptive', sc.cycles.use_adaptive_sampling, sc.cycles.adaptive_threshold,
      'bounces', sc.cycles.max_bounces, sc.cycles.diffuse_bounces, sc.cycles.glossy_bounces, sc.cycles.transmission_bounces,
      sc.cycles.transparent_max_bounces, 'persist', sc.render.use_persistent_data, 'threads', sc.render.threads, 'denoise', sc.cycles.use_denoising)
sc.view_settings.view_transform = 'Filmic'; sc.view_settings.look = 'Medium High Contrast'; sc.view_settings.exposure = 0.3
if os.environ.get('VIEW'):
    sc.view_settings.view_transform = os.environ['VIEW']
    sc.view_settings.look = os.environ.get('LOOK', 'None')
if os.environ.get('EXPO'): sc.view_settings.exposure = float(os.environ['EXPO'])
if os.environ.get('BORDER'):
    b_ = [float(v) for v in os.environ['BORDER'].split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = b_
if float(os.environ.get('UNDER_ARM_IN', 0)) > 0:   # judge r3 (hammer f55): the clay under-layer of the upper arm poked out up to
    # 4 mm in front of the biceps at full flexion, a grey stepped sliver. Pull it in toward the humerus axis (rest pose, radial,
    # UNDER_ARM_IN metres at most) over the upper arm only (t 0..1 elbow to shoulder, eased at both ends), so it stays a backdrop.
    # (A Displace along normals inflated it: this layer is two overlapping sheets with opposite normals.)
    for _o in bpy.data.objects:
        if _o.type != 'MESH' or not _o.name.startswith('U:arm region'): continue
        sd = _o.name[-1]; E_ = np.array(pose.JS[sd]['E']); A_ = np.array(pose.JS[sd]['S']) - E_
        Mw = np.array(_o.matrix_world); P = np.empty(len(_o.data.vertices) * 3); _o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
        Pw = P @ Mw[:3, :3].T + Mw[:3, 3]
        t = ((Pw - E_) @ A_) / (A_ @ A_); ss = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
        w = ss(t / 0.12) * ss((1.0 - t) / 0.12)
        R_ = Pw - (E_ + t[:, None] * A_); r = np.linalg.norm(R_, axis=1) + 1e-9
        dpull = np.minimum(float(os.environ['UNDER_ARM_IN']), 0.5 * r) * w
        Pw2 = Pw - R_ / r[:, None] * dpull[:, None]
        P2 = (Pw2 - Mw[:3, 3]) @ np.linalg.inv(Mw[:3, :3]).T
        _o.data.vertices.foreach_set('co', P2.ravel().astype(np.float32)); _o.data.update()
if os.environ.get('PICKDIAG'):   # which objects a pixel ray passes through (960x640): "x,y;x,y"
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0').split(',')]:
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        cm = sc.camera.matrix_world; fr_ = [cm @ v for v in sc.camera.data.view_frame(scene=sc)]   # tr, br, bl, tl
        o_ = cm.translation
        for xy in os.environ['PICKDIAG'].split(';'):
            px, py = map(float, xy.split(',')); u, v = (px + 0.5) / 960, 1 - (py + 0.5) / 640
            p = fr_[3] + (fr_[0] - fr_[3]) * u + (fr_[2] - fr_[3]) * (1 - v); d = (p - o_).normalized()
            org = o_.copy(); hits = []
            for _ in range(6):
                ok, loc, nrm, idx, ob, M = sc.ray_cast(dg, org, d)
                if not ok: break
                hits.append('%s(%s)@%.1f' % (ob.name, ob.users_collection[0].name if ob.users_collection else '-', (loc - o_).length * 1000)); org = loc + d * 1e-4
            print('PICK f%d %s: %s' % (f, xy, ' > '.join(hits)))
    raise SystemExit
if os.environ.get('CAMDIAG'):   # framing in pixels (960x640): near fist vs the column's silhouette, composition centre, margins
    from bpy_extras.object_utils import world_to_camera_view as _w2c
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 960, 640, 100
    def _px(p):
        q = _w2c(sc, sc.camera, Vector(p)); return np.array([q.x * 960, (1 - q.y) * 640])
    def _hull(P):
        P = sorted(map(tuple, P)); lo, hi = [], []
        cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        for p in P:
            while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
            lo.append(p)
        for p in reversed(P):
            while len(hi) >= 2 and cr(hi[-2], hi[-1], p) <= 0: hi.pop()
            hi.append(p)
        return np.array(lo[:-1] + hi[:-1])
    def _sdist(H, q):   # signed distance from q to convex polygon H (negative = inside)
        d = 1e9; inside = True
        for i in range(len(H)):
            a, b = H[i], H[(i + 1) % len(H)]; ab = b - a; t = np.clip((q - a) @ ab / (ab @ ab), 0, 1)
            d = min(d, np.linalg.norm(q - (a + t * ab)))
            if ab[0] * (q - a)[1] - ab[1] * (q - a)[0] < 0: inside = False
        return -d if inside else d
    import props; cx, cy = (props.COL_HIGH if PROP == 'rope_high' else props.COL_LOW)
    col3 = [(cx + sx * 0.045, cy + sy * 0.045, z) for sx in (-1, 1) for sy in (-1, 1) for z in (0.0, 2.30)]
    worst = (1e9, -1)
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0,20,48').split(',')]:
        set_frame(f); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        Hc = _hull([_px(p) for p in col3])
        camp = np.array(sc.camera.matrix_world.translation); pts = {'r': [], 'l': []}; allp = []
        for ob in bpy.data.objects:
            if ob.type != 'MESH' or ob.hide_render or not ob.users_collection or ob.users_collection[0].name not in ('SKIN',): continue
            ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world
            P = np.empty(len(m2.vertices) * 3); m2.vertices.foreach_get('co', P); P = P.reshape(-1, 3)[::4]; ev.to_mesh_clear()
            P = P @ np.array(W.to_3x3()).T + np.array(W.translation)
            if len(P) == 0: continue
            allp.append(P[::4])
            sd = ob.get('rig_side')
            if sd in pts and _re.search('Palm|digits|Dorsum', ob.name): pts[sd].append(P)
        near = min('rl', key=lambda s_: np.linalg.norm(np.vstack(pts[s_]).mean(0) - camp))
        gaps = {s_: min(_sdist(Hc, _px(p)) for p in np.vstack(pts[s_])[::2]) for s_ in 'rl'}
        st = bpy.data.objects.get('CableStation')
        SP = np.array([_px(st.matrix_world @ st.data.vertices[i].co) for i in range(0, len(st.data.vertices), 7)]) if st else np.zeros((0, 2))
        FP = np.array([_px(p) for p in np.vstack(allp)])
        U = np.vstack([FP, Hc] + ([SP] if len(SP) else []))
        mid = (U[:, 0].min() + U[:, 0].max()) / 2
        WC = np.array(props.HIGH if PROP == 'rope_high' else props.LOW)
        WP = np.array([_px(WC + np.array([0, props.WHEEL_R * 1.25 * math.cos(q), props.WHEEL_R * 1.25 * math.sin(q)])) for q in np.linspace(0, 2 * math.pi, 48)])
        top = min(FP[:, 1].min(), WP[:, 1].min()); bot = max(U[:, 1].max(), WP[:, 1].max())
        if gaps[near] < worst[0]: worst = (gaps[near], f)
        print('CAMDIAG f%d near %s: fist-column gap near %.0fpx far %.0fpx | figure+station x %.0f..%.0f mid %.0f (%+.0f) | pulley/head top margin %.0fpx bottom %.0fpx | figure x %.0f..%.0f'
              % (f, near, gaps[near], gaps['l' if near == 'r' else 'r'], U[:, 0].min(), U[:, 0].max(), mid, mid - 480, top, 640 - bot, FP[:, 0].min(), FP[:, 0].max()))
    print('CAMDIAG worst near-fist gap %.0fpx at f%d' % worst)
    raise SystemExit
MONO_BAD = [0, 0.0]
if os.environ.get('GRIPDIAG') and (PROP == 'ez' or PROP.startswith('rope')):   # the real test: posed hand skin against the built prop mesh
    from mathutils.bvhtree import BVHTree
    fr = [int(x) for x in os.environ.get('FRAMES_SUB', '0,20,41,55,60,70,100').split(',')]
    worst = {'r': 1e9, 'l': 1e9}; total_in = 0
    for f in fr:
        set_frame(f, camera=False); dg = bpy.context.evaluated_depsgraph_get()
        PO = EZ if PROP == 'ez' else bpy.data.objects['Rope']
        eb = PO.evaluated_get(dg); me = eb.to_mesh(); Mw = eb.matrix_world
        PV = [Mw @ v.co for v in me.vertices]
        bvh = BVHTree.FromPolygons([Mw @ v.co for v in me.vertices], [tuple(pl.vertices) for pl in me.polygons]); eb.to_mesh_clear()
        line = []
        for side in 'rl':
            Hh = bpy.data.objects['RIG'].pose.bones['hand.' + side]
            Hw = Hh.matrix @ Hh.bone.matrix_local.inverted()
            c = np.array(Hw @ Vector(pose.GRIP[side]['c'])); ax = np.array((Hw.to_3x3() @ Vector(pose.GRIP[side]['a'])).normalized())
            n_in = 0; dmin = 1e9; T = []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or ob.get('rig_side') != side or ob.users_collection[0].name not in ('SKIN', 'UNDER', 'MUS'): continue
                ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world; is_skin = ob.users_collection[0].name == 'SKIN'
                for vv in m2.vertices:
                    pw = W @ vv.co; loc, nrm_, idx, dist = bvh.find_nearest(pw, 0.04)
                    if loc is None: continue
                    sgn = 1.0 if (pw - loc).dot(nrm_) >= 0 else -1.0; sd_ = sgn * dist
                    if sd_ < 0: n_in += 1
                    dmin = min(dmin, sd_)
                    q = np.array(pw) - c; t = q @ ax; rad = np.linalg.norm(q - t * ax)
                    if rad < 0.03 and is_skin: T.append(t)
                ev.to_mesh_clear()
            total_in += n_in; worst[side] = min(worst[side], dmin)
            line.append('%s inside %d minclear %.1fmm grip-extent t %.1f..%.1f mm' % (side, n_in, dmin * 1000, min(T) * 1000 if T else 0, max(T) * 1000 if T else 0))
        if PROP.startswith('rope'):
            # rope against what RENDERS (visible muscles, skin incl. the head, under-sheets): UNSIGNED distance from the
            # rope centreline, sampled every 5 mm along strands, wraps, stoppers, clip and cable, must be >= that part's
            # radius, and no centreline segment may cross any surface. No normals involved (the sheets have mixed winding).
            # The straight run through each fist is the grip itself (tested above against the rope mesh) and is skipped;
            # near its own fist a strand is not tested against that arm's own hand skin (same reason).
            import bisect, props
            VS, PS, OFF, NAMES, OWN = [], [], [0], [], []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or not ob.users_collection or ob.users_collection[0].name not in ('MUS', 'SKIN', 'UNDER') or ob.hide_render: continue
                ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world; b0 = len(VS)
                VS.extend(W @ v.co for v in m2.vertices); PS.extend(tuple(i + b0 for i in pl.vertices) for pl in m2.polygons)
                OFF.append(len(PS)); NAMES.append(ob.name); OWN.append(ob.get('rig_side') if ob.users_collection[0].name in ('SKIN', 'UNDER') else None)
                ev.to_mesh_clear()
            BV = BVHTree.FromPolygons(VS, PS)
            def who(idx): return bisect.bisect_right(OFF, idx) - 1
            GCs = {}
            for sd in 'rl':
                Hh = bpy.data.objects['RIG'].pose.bones['hand.' + sd]; Hw = Hh.matrix @ Hh.bone.matrix_local.inverted()
                GCs[sd] = Vector(Hw @ Vector(pose.GRIP[sd]['c']))
            def resample(P, step=0.005):
                P = np.asarray(P, float); out = [P[0]]
                for i in range(1, len(P)):
                    L_ = np.linalg.norm(P[i] - P[i - 1]); n_ = max(1, int(math.ceil(L_ / step)))
                    out.extend(P[i - 1] + (P[i] - P[i - 1]) * (k / n_) for k in range(1, n_ + 1))
                return np.array(out)
            R_ = props.LAST; parts = []
            for sd, P in R_['paths'].items(): parts.append(('strand.' + sd, sd, resample(P[props.NTHROUGH - 1:]), props.ROPE_R))
            for sd, (kp, rr) in R_['knobs'].items():
                ks = resample(kp, 0.003); kr = np.interp(np.linalg.norm(ks - kp[0], axis=1), np.linalg.norm(kp - kp[0], axis=1), rr)
                parts.append(('stopper.' + sd, sd, ks, kr))
            parts.append(('clip', None, resample(R_['sleeve']), 0.0145)); parts.append(('cable', None, resample(R_['cable']), 0.003))
            worst_c = (1e9, ''); cross = []; head_c = 1e9
            _eh = bpy.data.objects['EggHead'].evaluated_get(dg); _m = _eh.to_mesh(); _W = _eh.matrix_world
            HB = BVHTree.FromPolygons([_W @ v.co for v in _m.vertices], [tuple(pl.vertices) for pl in _m.polygons]); _eh.to_mesh_clear()
            for nm, sd, S_, rad in parts:
                rad = np.broadcast_to(rad, (len(S_),))
                for i, q in enumerate(S_):
                    qv = Vector(q); near_own = sd is not None and (qv - GCs[sd]).length < 0.075
                    hh = HB.find_nearest(qv, 0.3)
                    if hh[0] is not None: head_c = min(head_c, hh[3] - rad[i])
                    loc, nrm_, idx, dist = BV.find_nearest(qv, 0.2)
                    if loc is not None:
                        k_ = who(idx)
                        if near_own and OWN[k_] == sd:   # skip own hand skin near the fist: find the nearest other surface
                            best = None
                            for dd in (0.0, 0.01, 0.02, 0.04):
                                for hit in BV.find_nearest_range(qv, max(dist, 0.001) + dd + rad[i] + 0.002):
                                    if OWN[who(hit[2])] != sd and (best is None or hit[3] < best[3]): best = hit
                                if best is not None: break
                            if best is None: continue
                            loc, nrm_, idx, dist = best; k_ = who(idx)
                        cl = dist - rad[i]
                        if cl < worst_c[0]: worst_c = (cl, '%s vs %s' % (nm, NAMES[k_]))
                    if i:
                        dv = qv - Vector(S_[i - 1]); L_ = dv.length
                        hit = BV.ray_cast(Vector(S_[i - 1]), dv.normalized(), L_)
                        if hit[0] is not None and not (near_own and OWN[who(hit[2])] == sd): cross.append('%s x %s' % (nm, NAMES[who(hit[2])]))
            bad = cross or worst_c[0] < -0.0005
            line.append('rope to head %s' % ('%.0fmm' % (head_c * 1000) if head_c < 1 else '>300mm'))
            # ROPEMONO (judge r3): a taut strand only ever runs toward the clip. Along each strand from the fist exit to the clip
            # the projection onto the clip->pulley direction d must never drop by more than 1 mm. Also the clip's height above
            # the two exits and above the fists (pushdown: the inverted V needs >= 12 cm at lockout, >= 18 cm at the top).
            dd_ = np.asarray(R_['d']); mono = []
            for sd, P in R_['paths'].items():
                pr = np.asarray(P[props.NTHROUGH - 1:]) @ dd_; run = np.maximum.accumulate(pr); back = float(np.max(run - pr))
                mono.append('%s back %.1fmm' % (sd, back * 1000)); MONO_BAD[0] += 1 if back > 0.001 else 0; MONO_BAD[1] = max(MONO_BAD[1], back)
            Cz = float(np.asarray(R_['C'])[2]); Ez = np.mean([np.asarray(P[props.NTHROUGH - 1])[2] for P in R_['paths'].values()])
            Fz = np.mean([float(GCs[sd][2]) for sd in 'rl'])
            line.append('ROPEMONO %s | clip above exits %.0fmm, above fists %.0fmm' % (', '.join(mono), (Cz - Ez) * 1000, (Cz - Fz) * 1000))
            line.append('rope vs body/head: min clearance %s (%s), crossings %d%s' % ('%.1fmm' % (worst_c[0] * 1000) if worst_c[0] < 0.2 else '>200mm', worst_c[1], len(cross), (' ' + ', '.join(sorted(set(cross))[:4])) if cross else ''))
            total_in += 1 if bad else 0
            # hands against the trunk, legs and head: unsigned gap from hand skin to any surface not on an arm (within 30 mm)
            ARM = [bpy.data.objects[n_].get('rig_side') is not None for n_ in NAMES]
            for sd in 'rl':
                hg = (1e9, '')
                for ob in bpy.data.objects:
                    if ob.type != 'MESH' or ob.get('rig_side') != sd or ob.users_collection[0].name != 'SKIN': continue
                    ev = ob.evaluated_get(dg); m2 = ev.to_mesh(); W = ev.matrix_world
                    for vv in m2.vertices:
                        for hit in BV.find_nearest_range(W @ vv.co, 0.03):
                            k_ = who(hit[2])
                            if not ARM[k_] and hit[3] < hg[0]: hg = (hit[3], NAMES[k_])
                    ev.to_mesh_clear()
                line.append('%s hand-body gap %s' % (sd, '%.0fmm (%s)' % (hg[0] * 1000, hg[1]) if hg[0] < 1 else '>30mm'))
                total_in += 1 if hg[0] < 0.003 else 0
        print('EZGRIP f%d  ' % f + ' | '.join(line))
    print('EZGRIP TOTAL inside %d  worst clearance r %.1fmm l %.1fmm' % (total_in, worst['r'] * 1000, worst['l'] * 1000))
    if PROP.startswith('rope'): print('ROPEMONO TOTAL violations %d (strand-frames), worst back %.1fmm' % (MONO_BAD[0], MONO_BAD[1] * 1000))
    raise SystemExit
if os.environ.get('TRUNKDIAG'):   # judge r17: signed, per-mesh test. Upper-arm muscles vs trunk muscles, and hand skin vs thigh muscles.
    # A point counts as inside only when BOTH the nearest-face normal says so AND a ray-parity count along +x agrees, against
    # ONE closed mesh at a time (the old GAPDIAG merged all trunk layers into one tree, so inner layers' normals gave false hits).
    from mathutils.bvhtree import BVHTree
    def _parity(bv, p):
        n, o, d = 0, Vector(p), Vector((1, 0.0137, 0.0071)).normalized()
        for _ in range(64):
            h = bv.ray_cast(o, d, 5.0)
            if h[0] is None: break
            n += 1; o = h[0] + d * 1e-5
        return n % 2 == 1
    ARM_RE = r'biceps brachii|^Brachialis|triceps brachii|^Deltoid'
    TR_RE = os.environ.get('TRUNK_RE', r'latissimus|serratus anterior|pectoralis major|external oblique')
    LEG_RE = os.environ.get('LEG_RE', r'rectus femoris|vastus|adductor|gracilis|sartorius|tensor fasciae|pectineus')
    HAND_RE = r'^(Palm|Dorsum of hand|Dorsal surfaces of digits|Palmar surfaces of digits)'
    for f in [int(x) for x in os.environ['FRAMES_SUB'].split(',')]:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        def _wm(o):
            me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
        def _tgts(rx):
            out = []
            for o in bpy.data.objects:
                if o.type == 'MESH' and not o.hide_render and _re.search(rx, o.name, _re.I) and o.users_collection and o.users_collection[0].name in ('MUS', 'SKIN', 'UNDER'):
                    V, F = _wm(o); out.append((o.name, BVHTree.FromPolygons(V, F)))
            return out
        TT, LL = _tgts(TR_RE), _tgts(LEG_RE)
        if f == int(os.environ['FRAMES_SUB'].split(',')[0]): print('TRUNKDIAG trunk', [n for n, _ in TT]); print('TRUNKDIAG legs', [n for n, _ in LL])
        _G = posed(pose2.values(MOT, f)); G_S = {sd: _G['upper.' + sd] @ Vector(pose.JS[sd]['S']) for sd in 'rl'}
        line = []
        for side in 'rl':
            for kind, rx, tg, skip in (('arm', ARM_RE, TT, 0.10), ('hand', HAND_RE, LL, 0.0)):
                n_in, dmin, who, deep = 0, 9.0, '', 0.0; HIST = {}
                for o in bpy.data.objects:
                    if o.type != 'MESH' or o.hide_render or not _re.search(rx, o.name, _re.I): continue
                    if o.get('rig_side') != side and not o.name.endswith('.' + side): continue
                    P, _ = _wm(o)
                    for p in P:
                        if skip and (p - G_S[side]).length < skip: continue
                        for tn, bv in tg:
                            r = bv.find_nearest(p, 0.04)
                            if r[0] is None: continue
                            if r[3] < dmin: dmin, who = r[3], '%s~%s' % (o.name[:18], tn[:22])
                            if (p - r[0]).dot(r[1]) < 0 and _parity(bv, p):
                                n_in += 1; deep = max(deep, r[3]); HIST[int((p - G_S[side]).length * 100)] = HIST.get(int((p - G_S[side]).length * 100), 0) + 1
                line.append('%s %s inside %d deepest %.1fmm min %.1fmm (%s) cm-from-shoulder %s' % (side, kind, n_in, deep * 1000, dmin * 1000, who, sorted(HIST.items())))
        print('TRUNK f%d ' % f + ' | '.join(line))
    raise SystemExit
if os.environ.get('GAPDIAG'):   # arm muscles vs trunk/legs: smallest unsigned gap (mm) per side, and how many arm points sit within 2 mm
    from mathutils.bvhtree import BVHTree
    for f in [int(x) for x in os.environ['FRAMES_SUB'].split(',')]:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get()
        def _wm(o):
            me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
        V, F = [], []
        for o in bpy.data.objects:
            if o.type == 'MESH' and not o.get('rig_side') and o.users_collection and o.users_collection[0].name == 'MUS' and not o.hide_render and not _re.search(r'deltoid|teres|spinatus|subscapular|coracobrach|trapez|rhomb|levator|pectoralis minor', o.name, _re.I):
                v_, f_ = _wm(o); n0 = len(V); V += v_; F += [tuple(i + n0 for i in q) for q in f_]
        bv = BVHTree.FromPolygons(V, F); line = []
        _G = posed(pose2.values(MOT, f)); G_S = {sd: _G['upper.' + sd] @ Vector(pose.JS[sd]['S']) for sd in 'rl'}
        for side in 'rl':
            dmin, close, who, deep = 9.0, 0, '', 0.0
            for o in bpy.data.objects:
                if o.type != 'MESH' or o.get('rig_side') != side or o.users_collection[0].name != 'MUS': continue
                P, _ = _wm(o); Sx = G_S[side]
                for p in P[::3]:
                    if (p - Sx).length < 0.12: continue
                    r = bv.find_nearest(p, 0.05)
                    if r[0] is not None:
                        if r[3] < dmin: dmin, who = r[3], o.name[:28]
                        if (p - r[0]).dot(r[1]) < 0: close += 1; deep = max(deep, r[3])
            line.append('%s min %.1fmm (%s) inside %d deepest %.1fmm' % (side, dmin * 1000, who, close, deep * 1000))
        print('GAP f%d ' % f + ' | '.join(line))
    raise SystemExit
if os.environ.get('ARMDIAG'):   # forearm muscles pressing into the glowing upper-arm muscles (closed meshes: inside = nearest-face normal test)
    from mathutils.bvhtree import BVHTree
    fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')]
    for f in fr:
        set_frame(f, camera=False); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); line = []
        for side in os.environ.get('ARMSIDE', 'r'):
            def _wm(o):
                me = o.evaluated_get(dg).to_mesh(); V = [o.matrix_world @ v.co for v in me.vertices]; F = [tuple(pl.vertices) for pl in me.polygons]; o.evaluated_get(dg).to_mesh_clear(); return V, F
            tg = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == side and o.material_slots and o.material_slots[0].material and o.material_slots[0].material.name == 'Glow']
            fa = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rig_side') == side and o.users_collection[0].name == 'MUS' and o not in tg and _re.search(os.environ.get('ARMOBJ', 'flexor|extensor|Brachioradialis|Pronator|Supinator|palmaris|Anconeus'), o.name, _re.I)]
            for t in tg:
                V, F = _wm(t); bv = BVHTree.FromPolygons(V, F); n_in = 0; deep = 0.0; who = {}
                for o in fa:
                    P, _ = _wm(o)
                    for p in P:
                        r = bv.find_nearest(p, 0.03)
                        if r[0] is not None and (p - r[0]).dot(r[1]) < 0:
                            n_in += 1; d = (p - r[0]).length; deep = max(deep, d); who[o.name] = who.get(o.name, 0) + 1
                line.append('%s %s in %d deep %.1fmm %s' % (side, t.name[:22], n_in, deep * 1000, sorted(who.items(), key=lambda q: -q[1])[:3]))
        print('ARM f%d elbow %.1f ' % (f, pose2.values(MOT, f)['elbow']) + ' | '.join(line))
    raise SystemExit
if os.environ.get('SLIDEDIAG'):   # does each hand stay put on the bar? grip centre and hand roll in the bar's own frame
    fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')] if os.environ.get('FRAMES_SUB') else range(MOT.FRAMES)
    RB = bpy.data.objects['RIG']
    for f in fr:
        set_frame(f, camera=False); bpy.context.view_layer.update()
        B = bpy.data.objects['EZBar' if PROP == 'ez' else 'Barbell'].matrix_world.copy(); Bi = B.inverted(); line = []
        for side in 'rl':
            pb = RB.pose.bones['hand.' + side]; Hw = RB.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
            cl = Bi @ (Hw @ Vector(pose.GRIP[side]['c'])); zl = Bi.to_3x3() @ (Hw.to_3x3() @ Vector((0, 0, 1)))
            kl = Bi @ (Hw @ Vector(pose.JS[side]['W']))
            line.append('%s x %+.2f y %+.2f z %+.2f mm roll %+.2f deg wristx %+.2f' % (side, cl.x * 1000, cl.y * 1000, cl.z * 1000, math.degrees(math.atan2(zl.z, zl.y)), kl.x * 1000))
        print('SLIDE f%d ' % f + ' | '.join(line) + ' | bar %.4f %.4f %.4f' % tuple(B.translation))
    raise SystemExit
if os.environ.get('GRIPDIAG'):   # numbers instead of pictures: how the hand skin sits on the bar (r = 13.5 mm)
    import re as _re
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0,41').split(',')]:
        set_frame(f, camera=False); dg = bpy.context.evaluated_depsgraph_get()
        B = bpy.data.objects['EZBar' if PROP == 'ez' else 'Barbell'].matrix_world; c = np.array(B.translation); ax = np.array(B.to_3x3().col[0]); ax /= np.linalg.norm(ax)
        for side in 'rl':
            if PROP == 'ez':   # this hand's own grip segment: through its grip centre, along the hand's (corrected) grip axis
                Hh = bpy.data.objects['RIG'].pose.bones['hand.' + side].matrix
                Hw = bpy.data.objects['RIG'].matrix_world @ Hh @ bpy.data.objects['RIG'].pose.bones['hand.' + side].bone.matrix_local.inverted()
                c = np.array(Hw @ Vector(pose.GRIP[side]['c'])); ax = np.array((Hw.to_3x3() @ Vector(pose.GRIP[side]['a'])).normalized())
            out = []
            for ob in bpy.data.objects:
                if ob.type != 'MESH' or ob.get('rig_side') != side or ob.users_collection[0].name != 'SKIN': continue
                if not _re.search(os.environ.get('GRIPOBJ', 'Palm|digits|Dorsum'), ob.name): continue
                me = ob.evaluated_get(dg).to_mesh(); P = np.array([ob.matrix_world @ v.co for v in me.vertices]); ob.evaluated_get(dg).to_mesh_clear()
                q = P - c; t = q @ ax; rad = q - t[:, None] * ax; d = np.linalg.norm(rad, axis=1)
                near = d < 0.03
                out.append((ob.name, len(P), int(near.sum()), float(d.min() * 1000), int((d < 0.0130).sum()), float(np.percentile(d[near], 10) * 1000) if near.any() else -1))
            print('GRIP f%d %s' % (f, side), ' | '.join('%s n%d near%d min%.1fmm inside%d p10 %.1f' % o for o in out))
    raise SystemExit
if mode == 'still':
    set_frame(float(a[2]))
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
else:
    os.makedirs(out, exist_ok=True)
    fr = range(MOT.FRAMES)
    if os.environ.get('FRAMES_SUB'): fr = [int(x) for x in os.environ['FRAMES_SUB'].split(',')]
    for f in fr:   # every frame differs now (body + camera move), so no held-frame copies
        fp = os.path.join(out, f'f{f:03d}.png')
        if os.environ.get('RESUME') and os.path.exists(fp): continue
        set_frame(f); sc.render.filepath = fp; bpy.ops.render.render(write_still=True)
