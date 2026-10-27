import bpy, os
sc=bpy.context.scene
sc.render.resolution_x=350; sc.render.resolution_y=262; sc.cycles.samples=8
ng = bpy.data.node_groups.new('Comp', 'CompositorNodeTree'); sc.compositing_node_group = ng; N = ng.nodes
ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = N.new('CompositorNodeRLayers'); g = N.new('CompositorNodeGlare'); o = N.new('NodeGroupOutput')
g.inputs['Type'].default_value = 'Fog Glow'; g.inputs['Threshold'].default_value = 0.5; g.inputs['Strength'].default_value = 3; g.inputs['Size'].default_value=0.8
ng.links.new(rl.outputs['Image'], g.inputs['Image']); ng.links.new(g.outputs['Image'], o.inputs[0])
print('outs', [x.name for x in g.outputs], 'usecomp', sc.render.use_compositing, [n.bl_idname for n in N])
sc.render.filepath=os.path.abspath('g.png'); bpy.ops.render.render(write_still=True)
