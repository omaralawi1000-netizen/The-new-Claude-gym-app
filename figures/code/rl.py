import bpy
sc=bpy.context.scene; vl=sc.view_layers[0]; vl.use_pass_emit=True
ng = bpy.data.node_groups.new('C', 'CompositorNodeTree'); rl=ng.nodes.new('CompositorNodeRLayers'); rl.scene=sc
print('outs', [o.name for o in rl.outputs if o.enabled], bpy.context.view_layer.name, vl.name)
