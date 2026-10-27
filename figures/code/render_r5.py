# blender -b scene.blend --python render.py -- still OUT.png ELBOW_DEG [samples] [resx resy] [cam]
# blender -b scene.blend --python render.py -- anim OUTDIR FRAMES [samples] [resx resy] [cam]
import bpy, sys, os, math, numpy as np
sys.path.insert(0, os.getcwd())
import pose
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
        'clip': ((-1.45, -3.5, 1.0), (0.0, 0.0, 0.9), 46)}
GLOW_SIZE = float(os.environ.get('GLOW_SIZE', 0.62)); GLOW_STRENGTH = float(os.environ.get('GLOW_STRENGTH', 1.0))
cname = a[6] if len(a) > 6 else 'ref'
cam = sc.camera; loc, tgt, lens = CAMS[cname]
cam.location = loc; cam.data.lens = lens
cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

# bar centre in each hand's rest frame = circle through the gripped middle-finger joints
def grip_centre(side):
    G, J = pose.transforms(side, 0.0, 0.0, 1.0); c = J['f2']
    p = [np.array(G['hand'] @ Vector(c[1])), np.array(G['f20'] @ Vector(c[2])), np.array(G['f22'] @ Vector(c[4]))]
    u, v = p[1] - p[0], p[2] - p[0]; n = np.cross(u, v)
    return p[0] + (np.cross(n, u) * (v @ v) + np.cross(v, n) * (u @ u)) / (2 * (n @ n))
GC = {s: grip_centre(s) for s in 'rl'}

def set_pose(elbow, wrist=0.0):
    Gs = {}
    for s in 'rl': Gs[s] = pose.transforms(s, elbow, wrist, 1.0)[0]
    pose.apply(Gs)
    pr = np.array(Gs['r']['hand'] @ Vector(GC['r'])); pl = np.array(Gs['l']['hand'] @ Vector(GC['l']))
    x = pose.nrm(pl - pr)
    zh = np.array(Gs['r']['hand'].to_3x3() @ Vector((0, 0, 1))); z = pose.nrm(zh - (zh @ x) * x); y = np.cross(z, x)
    M = Matrix(np.column_stack([x, y, z]).tolist()).to_4x4(); M.translation = Vector((pr + pl) / 2)
    bpy.data.objects['Barbell'].matrix_world = M

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
        ng.links.new(rl.outputs['Image'], mx.inputs['A']); ng.links.new(g.outputs['Glare'], mx.inputs['B'])
        ng.links.new(mx.outputs['Result'], o.inputs[0])

def denoise():
    try:
        sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    except Exception as e:
        print('no denoise', e); sc.cycles.use_denoising = False

glare(); denoise()
sc.view_settings.view_transform = 'Filmic'; sc.view_settings.look = 'Medium High Contrast'; sc.view_settings.exposure = 0.3
if os.environ.get('VIEW'):
    sc.view_settings.view_transform = os.environ['VIEW']
    sc.view_settings.look = os.environ.get('LOOK', 'None')
if os.environ.get('EXPO'): sc.view_settings.exposure = float(os.environ['EXPO'])
if mode == 'still':
    set_pose(math.radians(float(a[2])), math.radians(6))
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
else:
    os.makedirs(out, exist_ok=True); F = int(a[2])
    # one rep: hold, lift (1.1 s), squeeze, lower (1.3 s), hold — eased, loops seamlessly
    for f in range(F):
        t = f / F
        if t < 0.08: k = 0
        elif t < 0.46: k = pose.ease((t - 0.08) / 0.38)
        elif t < 0.54: k = 1
        elif t < 0.96: k = 1 - pose.ease((t - 0.54) / 0.42)
        else: k = 0
        set_pose(math.radians(8 + 116 * k), math.radians(4 + 8 * k))
        sc.render.filepath = os.path.join(out, f'f{f:03d}.png'); bpy.ops.render.render(write_still=True)
