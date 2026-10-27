# r8 full-body: blender -b scene8.blend --python render8.py -- still OUT.png FRAME [samples] [resx resy] [cam]
#                blender -b scene8.blend --python render8.py -- anim OUTDIR - [samples] [resx resy] [cam]     (MOTION=curl)
import bpy, sys, os, math, numpy as np
sys.path.insert(0, os.getcwd())
import pose, pose2
MOT = pose2.load(os.environ.get('MOTION', 'curl'))
from mathutils import Vector, Matrix
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
cam = sc.camera; loc, tgt, lens = CAMS[cname]; cam.data.lens = lens
def set_cam(orbit_deg=0.0, lift=0.0):
    c = math.cos(math.radians(orbit_deg)); s_ = math.sin(math.radians(orbit_deg))
    dx, dy = loc[0] - tgt[0], loc[1] - tgt[1]
    L = Vector((tgt[0] + dx * c - dy * s_, tgt[1] + dx * s_ + dy * c, loc[2] + lift))
    cam.location = L; cam.rotation_euler = (Vector(tgt) - L).to_track_quat('-Z', 'Y').to_euler()
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

def set_frame(f, camera=True):
    v = pose2.values(MOT, f); G = pose2.solve(v)
    if pose.GRIP:   # one straight bar in both hands: turn each hand a little at the wrist so its gripped bar line lies along the bar
        HB = [k for k in G if k.split('.')[0] in ('hand', 't0', 't1', 't2') or (k[0] == 'f' and k[1:3].isdigit())]
        for _ in range(3):
            pr = np.array(G['hand.r'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(G['hand.l'] @ Vector(pose.GRIP['l']['c']))
            bx = Vector(pose.nrm(pl - pr))
            for sd, tgt in (('r', bx), ('l', -bx)):
                aw = (G['hand.' + sd].to_3x3() @ Vector(pose.GRIP[sd]['a'])).normalized()
                rd = aw.rotation_difference(tgt); Rq = rd.to_matrix().to_4x4()
                if os.environ.get('GRIPDIAG') and _ == 0: print('WRISTCORR f%s %s %.1f deg axis' % (f, sd, math.degrees(rd.angle)), [round(x, 2) for x in rd.axis])
                if os.environ.get('GRIPDIAG') and _ == 0: print('LOCALTGT f%s %s' % (f, sd), [round(x, 4) for x in (G['hand.' + sd].to_3x3().inverted() @ tgt)])
                Wp = G['fore.' + sd] @ Vector(pose.JS[sd]['W'])
                Mc = Matrix.Translation(Wp) @ Rq @ Matrix.Translation(-Wp)
                for k in HB:
                    if k.endswith('.' + sd): G[k] = Mc @ G[k]
    pose2.apply(G)
    Gs = {s: {nm[:-2]: g for nm, g in G.items() if nm.endswith('.' + s)} for s in 'rl'}
    if pose.GRIP:   # the bar sits where the solved grip closed round it
        pr = np.array(Gs['r']['hand'] @ Vector(pose.GRIP['r']['c'])); pl = np.array(Gs['l']['hand'] @ Vector(pose.GRIP['l']['c']))
    else:
        pr = np.array(Gs['r']['hand'] @ Vector(gc('r', v['grip']))); pl = np.array(Gs['l']['hand'] @ Vector(gc('l', v['grip'])))
    x = pose.nrm(pl - pr)
    zh = np.array(Gs['r']['hand'].to_3x3() @ Vector((0, 0, 1))); z = pose.nrm(zh - (zh @ x) * x); y = np.cross(z, x)
    M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
    bpy.data.objects['Barbell'].matrix_world = M
    if camera and not os.environ.get('NOCAM'): set_cam(v.get('cam_orbit', 0.0), v.get('cam_lift', 0.0))
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
            if ob.name == 'Barbell' or ob.name.startswith(('Palm', 'Dorsum of hand', 'Dorsal surfaces of digits', 'Palmar surfaces of digits')): ob.pass_index = 1
        cmp_ = N.new('ShaderNodeMath'); cmp_.operation = 'COMPARE'; cmp_.inputs[1].default_value = 1.0; cmp_.inputs[2].default_value = 0.5
        inv = N.new('ShaderNodeMath'); inv.operation = 'MULTIPLY_ADD'; inv.inputs[1].default_value = -0.9; inv.inputs[2].default_value = 1.0
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
if os.environ.get('GRIPDIAG'):   # numbers instead of pictures: how the hand skin sits on the bar (r = 13.5 mm)
    import re as _re
    for f in [int(x) for x in os.environ.get('FRAMES_SUB', '0,41').split(',')]:
        set_frame(f, camera=False); dg = bpy.context.evaluated_depsgraph_get()
        B = bpy.data.objects['Barbell'].matrix_world; c = np.array(B.translation); ax = np.array(B.to_3x3().col[0]); ax /= np.linalg.norm(ax)
        for side in 'rl':
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
