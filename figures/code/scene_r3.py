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
INFLATE = [(r'deltoid muscle', 0.007), (r'pectoralis major', 0.008), (r'biceps brachii', 0.0035), (r'Brachialis', 0.002),
           (r'triceps brachii', 0.003), (r'Latissimus', 0.004), (r'trapezius', 0.005), (r'Rectus abdominis', 0.006),
           (r'Brachioradialis', 0.0015), (r'Rectus femoris|Vastus', 0.0025), (r'Gastrocnemius', 0.0025), (r'Serratus anterior', 0.0045), (r'External abdominal oblique', 0.002),
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
    for _ in range(SMOOTH_IT + (3 if re.search(r'Serratus|oblique', o.name) else 0)):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if re.search(r'Sternocostal head of pectoralis', o.name):   # toothed rib origins -> one clean edge along the sternum
        med = [v for v in bm.verts if abs(v.co.x) < 0.045]
        for _ in range(14): bmesh.ops.smooth_vert(bm, verts=med, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free()

# ---------- egg head + neck core ----------
bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=1)
egg = bpy.context.object; egg.name = 'EggHead'
me = egg.data; n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
z = co[:, 2]
taper = 1 - 0.13 * np.clip(-z, 0, 1) ** 1.6          # narrower jaw
crown = 1 - 0.06 * np.clip(z, 0, 1) ** 2               # slightly narrower crown
co[:, 0] *= 0.075 * taper * crown
co[:, 1] *= 0.096 * (1 - 0.10 * np.clip(-z, 0, 1) ** 1.5)
co[:, 2] *= 0.121
co[:, 1] -= 0.012 * np.clip(-z, 0, 1) ** 2             # chin slightly forward
R = np.array(Matrix.Rotation(math.radians(-8), 3, 'X'))   # tip face a touch downward
co = co @ R.T + np.array([0, -0.008, 1.580])
me.vertices.foreach_set('co', co.ravel()); me.update()
for p in me.polygons: p.use_smooth = True
link(egg, 'SKIN')

bm = bmesh.new()
rings = []
for k in range(13):                                   # smooth neck column: thin at the collar, full under the head
    t = k / 12; z = 1.42 + 0.19 * t; f = t * t * (3 - 2 * t)
    rx = 0.041 + 0.017 * f; ry = 0.045 + 0.019 * f
    rings.append([bm.verts.new((rx * math.cos(2 * math.pi * j / 48), 0.012 + ry * math.sin(2 * math.pi * j / 48), z)) for j in range(48)])
for k in range(12):
    for j in range(48):
        bm.faces.new((rings[k][j], rings[k][(j + 1) % 48], rings[k + 1][(j + 1) % 48], rings[k + 1][j]))
me = bpy.data.meshes.new('NeckCore'); bm.to_mesh(me); bm.free()
neck = bpy.data.objects.new('NeckCore', me); sc.collection.objects.link(neck)
for p in neck.data.polygons: p.use_smooth = True
link(neck, 'SKIN')
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1, location=(0, -0.014, 1.45))
th = bpy.context.object; th.name = 'Throat'; th.scale = (0.017, 0.016, 0.042); bpy.ops.object.transform_apply(scale=True)
for p in th.data.polygons: p.use_smooth = True
link(th, 'SKIN')
# floor of the sternal notch between the two SCM tendons (no hole down to the ribs)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=(0, -0.035, 1.405))
nt = bpy.context.object; nt.name = 'Notch'; nt.scale = (0.018, 0.006, 0.014); bpy.ops.object.transform_apply(scale=True)
for p in nt.data.polygons: p.use_smooth = True
link(nt, 'SKIN')

# ---------- materials ----------
CLAY_DARK = (0.0055, 0.0062, 0.0066, 1); CLAY_LIGHT = (0.0145, 0.0158, 0.0167, 1)

def fibre_frame(o):
    """per-vertex rest coordinates in the object's principal frame (local z = fibre axis) -> attribute 'fc'"""
    me = o.data; n = len(me.vertices)
    if n < 4: return
    P = np.empty(n * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    c = P.mean(0); _, _, vt = np.linalg.svd(P - c, full_matrices=False)
    R = np.array([vt[1], vt[2], vt[0]])          # rows: across, across, along
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
hand, _ = clay_mat('ClayHand', across=0.005, along=0.05, bump=0.3, dist=0.0015)

def glow_mat():
    m, b = clay_mat('Glow'); nt = m.node_tree; N = nt.nodes; L = nt.links
    out = N['Material Output']
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sep.inputs[0])
    lo = N.new('ShaderNodeMapRange'); lo.inputs['From Min'].default_value = 0.10; lo.inputs['From Max'].default_value = 0.36; lo.interpolation_type = 'SMOOTHSTEP'
    hi = N.new('ShaderNodeMapRange'); hi.inputs['From Min'].default_value = 0.88; hi.inputs['From Max'].default_value = 0.62; hi.interpolation_type = 'SMOOTHSTEP'
    L.new(sep.outputs['Z'], lo.inputs['Value']); L.new(sep.outputs['Z'], hi.inputs['Value'])
    mask = N.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'; L.new(lo.outputs['Result'], mask.inputs[0]); L.new(hi.outputs['Result'], mask.inputs[1])
    # light from inside: brightest where the surface faces the viewer, fading to the rims
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    inner = N.new('ShaderNodeMapRange'); inner.inputs['From Min'].default_value = 0.0; inner.inputs['From Max'].default_value = 1.0
    inner.inputs['To Min'].default_value = 1.0; inner.inputs['To Max'].default_value = 0.25
    L.new(lw.outputs['Facing'], inner.inputs['Value'])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = GLOW_E; L.new(inner.outputs['Result'], st.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs['Color'].default_value = GLOW_RGB; L.new(st.outputs[0], em.inputs['Strength'])
    # tint the clay itself deep red under the glow so form and fibres still read
    tint = N.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MIX'
    L.new(mask.outputs[0], tint.inputs['Factor']); L.new(N['Color Ramp'].outputs['Color'], tint.inputs['A'])
    tint.inputs['B'].default_value = (0.35, 0.012, 0.006, 1); L.new(tint.outputs['Result'], b.inputs['Base Color'])
    fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = 0.72; L.new(mask.outputs[0], fac.inputs[0])
    mix = N.new('ShaderNodeMixShader'); L.new(fac.outputs[0], mix.inputs['Fac'])
    L.new(b.outputs['BSDF'], mix.inputs[1]); L.new(em.outputs['Emission'], mix.inputs[2]); L.new(mix.outputs[0], out.inputs['Surface'])
    return m

GLOW_RGB = (1.0, 0.010, 0.004, 1); GLOW_E = float(os.environ.get('GLOW_E', 3.0))
glow = glow_mat()
GLOW = re.compile(r'biceps brachii', re.I)
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    cn = o.users_collection[0].name
    if cn == 'MUS':
        fibre_frame(o); mat = glow if GLOW.search(o.name) else clay
    elif cn == 'SKIN' and o.name not in ('EggHead', 'NeckCore', 'Throat', 'Notch'):
        fibre_frame(o); mat = hand
    else:
        mat = plain
    o.data.materials.clear(); o.data.materials.append(mat)
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
cao = cn.new('ShaderNodeAmbientOcclusion'); cao.inputs['Distance'].default_value = 0.18; cao.samples = 16
cr = cn.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.05, 0.05, 0.05, 1); cr.color_ramp.elements[1].color = (0.93, 0.93, 0.93, 1)
cr.color_ramp.elements[0].position = 0.38
cl.new(cao.outputs['AO'], cr.inputs['Fac']); cl.new(cr.outputs['Color'], cn['Principled BSDF'].inputs['Base Color'])
ce = cm.node_tree.nodes['Principled BSDF']
if 'Emission Color' in ce.inputs:
    ce.inputs['Emission Color'].default_value = (1, 1, 1, 1); ce.inputs['Emission Strength'].default_value = CYC_GLOW
# the studio wall looks white to the camera but bounces far less light onto the figure: deeper shadow side, more contrast
CYC_BOUNCE = float(os.environ.get('CYC_BOUNCE', 0.22))
lp = cn.new('ShaderNodeLightPath'); dk = cn.new('ShaderNodeBsdfDiffuse'); dk.inputs['Color'].default_value = (CYC_BOUNCE,) * 3 + (1,)
mx = cn.new('ShaderNodeMixShader'); out = cn['Material Output']
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

area('Key', (-1.4, -1.8, 3.8), (0, 0, 0.9), 950, 1.3)
area('Fill', (2.6, -2.2, 1.6), (0, 0, 1.0), 35, 3.0)
area('Rim', (0.6, 2.4, 2.6), (0, 0, 1.2), 120, 1.5)
area('Bounce', (0, -1.2, -0.05), (0, 0, 1.2), 10, 2.5)    # soft floor bounce from below-front

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
