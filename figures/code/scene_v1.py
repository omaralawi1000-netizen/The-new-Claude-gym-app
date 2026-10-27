# rig.blend -> scene.blend : egg head, fillers, athletic reshape, clay + glow materials, barbell, cyc, lights, camera.
# blender -b rig.blend --python scene.py -- scene.blend
import bpy, bmesh, sys, os, re, math, numpy as np
from mathutils import Vector, Matrix
OUT = sys.argv[sys.argv.index('--')+1:][0]
SMOOTH_IT = int(os.environ.get('SMOOTH_IT', 2))
sc = bpy.context.scene

def coll(name):
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name); sc.collection.children.link(c)
    return c

def link(o, cname):
    for uc in list(o.users_collection): uc.objects.unlink(o)
    coll(cname).objects.link(o)

# ---------- athletic reshape: push chosen muscles out along their normals (metres) ----------
INFLATE = [(r'deltoid muscle', 0.007), (r'pectoralis major', 0.004), (r'biceps brachii', 0.0035), (r'Brachialis', 0.002),
           (r'triceps brachii', 0.003), (r'Latissimus', 0.004), (r'trapezius', 0.005), (r'Rectus abdominis', 0.0035),
           (r'Brachioradialis', 0.0015), (r'Rectus femoris|Vastus', 0.0025), (r'Gastrocnemius', 0.0025), (r'Serratus anterior', 0.0015),
           (r'Infraspinatus|Teres major', 0.002), (r'Gluteus maximus', 0.002), (r'Sternocleidomastoid', 0.0015)]
for o in coll('MUS').objects:
    amt = next((a for pat, a in INFLATE if re.search(pat, o.name, re.I)), 0)
    if not amt: continue
    me = o.data; n = len(me.vertices)
    co = np.empty(n * 3); me.vertices.foreach_get('co', co)
    nm = np.empty(n * 3); me.vertices.foreach_get('normal', nm)
    co = co.reshape(-1, 3) + nm.reshape(-1, 3) * amt
    me.vertices.foreach_set('co', co.ravel()); me.update()
# soften the sculpt's deepest fibre gashes (keeps the fibres, loses the black slashes)
for o in list(coll('MUS').objects):
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(SMOOTH_IT):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free()

# ---------- egg head + neck core ----------
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=1)
egg = bpy.context.object; egg.name = 'EggHead'
me = egg.data; n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
z = co[:, 2]
taper = 1 - 0.20 * np.clip(-z, 0, 1) ** 1.6          # narrower jaw
crown = 1 - 0.06 * np.clip(z, 0, 1) ** 2               # slightly narrower crown
co[:, 0] *= 0.083 * taper * crown
co[:, 1] *= 0.104 * (1 - 0.10 * np.clip(-z, 0, 1) ** 1.5)
co[:, 2] *= 0.126
co[:, 1] -= 0.012 * np.clip(-z, 0, 1) ** 2             # chin slightly forward
R = np.array(Matrix.Rotation(math.radians(-8), 3, 'X'))   # tip face a touch downward
co = co @ R.T + np.array([0, -0.012, 1.652])
me.vertices.foreach_set('co', co.ravel()); me.update()
for p in me.polygons: p.use_smooth = True
link(egg, 'SKIN')

bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1, depth=1)
neck = bpy.context.object; neck.name = 'NeckCore'
neck.scale = (0.047, 0.050, 0.22); neck.location = (0, 0.012, 1.50)
bpy.ops.object.transform_apply(scale=True, location=True)
for p in neck.data.polygons: p.use_smooth = True
link(neck, 'SKIN')

# ---------- materials ----------
def clay_mat():
    m = bpy.data.materials.new('Clay'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.58
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = 0.35
    ao = N.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.008; ao.only_local = True; ao.samples = 8
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.030, 0.033, 0.037, 1)
    ramp.color_ramp.elements[1].position = 0.9; ramp.color_ramp.elements[1].color = (0.072, 0.078, 0.086, 1)
    L.new(ao.outputs['AO'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m, b

clay, _ = clay_mat()

def glow_mat():
    m, b = clay_mat(); m.name = 'Glow'; nt = m.node_tree; N = nt.nodes; L = nt.links
    out = N['Material Output']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sep.inputs[0])
    # belly mask along the muscle (rest-pose z of the bounding box), soft at both ends
    lo = N.new('ShaderNodeMapRange'); lo.inputs['From Min'].default_value = 0.10; lo.inputs['From Max'].default_value = 0.34; lo.interpolation_type = 'SMOOTHSTEP'
    hi = N.new('ShaderNodeMapRange'); hi.inputs['From Min'].default_value = 0.86; hi.inputs['From Max'].default_value = 0.62; hi.interpolation_type = 'SMOOTHSTEP'
    L.new(sep.outputs['Z'], lo.inputs['Value']); L.new(sep.outputs['Z'], hi.inputs['Value'])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L.new(lo.outputs['Result'], mul.inputs[0]); L.new(hi.outputs['Result'], mul.inputs[1])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.035, 0.012, 1); em.inputs['Strength'].default_value = 1.7
    mx2 = N.new('ShaderNodeMath'); mx2.operation = 'MULTIPLY'; mx2.inputs[1].default_value = 0.88; L.new(mul.outputs[0], mx2.inputs[0])
    mix = N.new('ShaderNodeMixShader'); L.new(mx2.outputs[0], mix.inputs['Fac'])
    L.new(b.outputs['BSDF'], mix.inputs[1]); L.new(em.outputs['Emission'], mix.inputs[2]); L.new(mix.outputs[0], out.inputs['Surface'])
    m['glow'] = 1
    return m

glow = glow_mat()
GLOW = re.compile(r'biceps brachii', re.I)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    o.data.materials.clear(); o.data.materials.append(glow if GLOW.search(o.name) else clay)
    for p in o.data.polygons: p.use_smooth = True

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

def plate_profile(x0, t=0.05, R=0.225):
    """plate: square rolled rim, recessed faces with a lip ring, raised hub; x0 = inner face. points are (r, x)."""
    e = t - 0.0
    rec = 0.011; hub = 0.004
    one = [(0.026, x0 + hub + 0.002), (0.030, x0 + hub), (0.058, x0 + hub), (0.064, x0 + hub + 0.003), (0.072, x0 + rec),
           (0.150, x0 + rec), (0.156, x0 + rec - 0.002), (0.160, x0 + rec), (0.196, x0 + rec), (0.204, x0 + 0.004),
           (0.210, x0 + 0.0008), (0.218, x0), (R - 0.004, x0), (R - 0.0005, x0 + 0.0015), (R, x0 + 0.005)]
    other = [(r, x0 + e - (x - x0)) for r, x in reversed(one)]
    return one + other

parts = []
bar = lathe([(0.0, -0.80), (0.0135, -0.80), (0.0145, -0.795), (0.0145, -0.72), (0.016, -0.72), (0.025, -0.715), (0.025, -0.395),
             (0.032, -0.395), (0.032, -0.375), (0.0145, -0.37), (0.0145, -0.3), (0.0135, -0.295), (0.0135, 0.295), (0.0145, 0.3),
             (0.0145, 0.37), (0.032, 0.375), (0.032, 0.395), (0.025, 0.395), (0.025, 0.715), (0.016, 0.72), (0.0145, 0.72),
             (0.0145, 0.795), (0.0135, 0.80), (0.0, 0.80)], 96, 'Bar')
parts.append(bar)
for side in (-1, 1):
    x0 = 0.40 if side > 0 else -0.40 - 0.05
    p = lathe(plate_profile(x0), 160, 'Plate'); parts.append(p)
    cx = 0.40 + 0.05 + 0.003 if side > 0 else -0.40 - 0.05 - 0.003 - 0.03
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
me.materials.append(cm)

w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.32

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

area('Key', (-2.2, -2.4, 3.2), (0, 0, 1.0), 480, 2.6)
area('Fill', (2.6, -2.2, 1.6), (0, 0, 1.0), 110, 3.0)
area('Rim', (0.6, 2.4, 2.6), (0, 0, 1.2), 120, 1.5)
area('Bounce', (0, -1.2, -0.05), (0, 0, 1.2), 25, 2.5)    # soft floor bounce from below-front

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
