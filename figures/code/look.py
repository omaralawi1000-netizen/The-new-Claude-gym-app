# Quick look render of a blend: blender -b X.blend --python look.py -- out_prefix [samples] [res]
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--')+1:]
OUT = argv[0]; SAMP = int(argv[1]) if len(argv) > 1 else 32; RES = int(argv[2]) if len(argv) > 2 else 640
VIEWS = argv[3].split(',') if len(argv) > 3 else ['front']
sc = bpy.context.scene
if 'clay' not in bpy.data.materials:
    mat = bpy.data.materials.new('clay'); mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.36, 0.38, 0.40, 1); b.inputs['Roughness'].default_value = 0.65
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = False; o.hide_viewport = False
            o.data.materials.clear(); o.data.materials.append(mat)
            for p in o.data.polygons: p.use_smooth = True
if 'floor' not in bpy.data.objects:
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.089)); fl = bpy.context.object; fl.name = 'floor'
    fm = bpy.data.materials.new('floorm'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    fl.data.materials.append(fm)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.85, 0.86, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    bpy.ops.object.light_add(type='AREA', location=(-1.8, -2.6, 3.0)); L = bpy.context.object; L.data.energy = 500; L.data.size = 2.5
    L.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - L.location).to_track_quat('-Z', 'Y').to_euler()
V = {'front': ((0.55, -3.2, 1.25), (0, 0, 0.85), 40),
     'arm': ((0.45, -1.3, 1.25), (-0.18, 0, 1.05), 50),
     'torso': ((0.3, -1.5, 1.3), (0, 0, 1.15), 50),
     'hand': ((0.0, -0.8, 1.0), (-0.24, 0, 0.82), 50),
     'hside': ((-0.9, -0.45, 0.82), (-0.28, -0.06, 0.76), 60),
     'hfront': ((-0.35, -0.8, 0.8), (-0.28, -0.06, 0.76), 60),
     'back': ((-0.5, 3.2, 1.3), (0, 0, 0.85), 40)}
sc.render.engine = 'CYCLES'; sc.cycles.samples = SAMP; sc.cycles.use_denoising = False
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.cycles.device = 'CPU'
sc.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
for nm in VIEWS:
    pos, ta, lens = V[nm]
    bpy.ops.object.camera_add(location=pos); cam = bpy.context.object; sc.camera = cam
    cam.rotation_euler = (mathutils.Vector(ta) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    sc.render.filepath = f'{OUT}-{nm}.png'
    bpy.ops.render.render(write_still=True)
