import bpy, os, sys, colorsys, json
sys.argv = ['render.py','--','still', os.path.abspath('id.png'), '82', '1', os.environ.get('IDW','900'), os.environ.get('IDH','700'), os.environ.get('IDCAM','ref')]
# flat per-object colour, no lighting; record colour->name map
cols = {}
objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in ('Cyc',)]
for i, o in enumerate(objs):
    m = bpy.data.materials.new('id%d' % i); m.use_nodes = True; N = m.node_tree.nodes
    for n in list(N): N.remove(n)
    e = N.new('ShaderNodeEmission'); out = N.new('ShaderNodeOutputMaterial')
    c = (40 + (i * 7) % 200, 40 + (i // 200) * 60, 40 + (i * 13) % 200)
    e.inputs['Color'].default_value = (c[0]/255, c[1]/255, c[2]/255, 1); e.inputs['Strength'].default_value = 1
    m.node_tree.links.new(e.outputs[0], out.inputs[0])
    o.data.materials.clear(); o.data.materials.append(m); cols['%d,%d,%d' % c] = o.name
json.dump(cols, open('idmap.json', 'w'))
sc = bpy.context.scene; sc.view_settings.view_transform = 'Raw'; sc.view_settings.exposure = 0; sc.view_settings.gamma = 1; sc.view_settings.look = 'None'; sc.render.image_settings.color_depth = '8'; sc.render.dither_intensity = 0; sc.cycles.samples = 1; sc.cycles.filter_width = 0.01
sc.cycles.use_denoising = False
for l in bpy.data.lights: l.energy = 0
sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0
src = open('render.py').read().replace('glare(); denoise()', '')
exec(compile(src, 'render.py', 'exec'), {'__name__': '__main__'})
