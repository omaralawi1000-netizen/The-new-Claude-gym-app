import bpy
mats={}
for o in bpy.data.objects:
    if o.type!='MESH': continue
    for s in o.material_slots:
        m=s.material
        if not m or not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type=='BSDF_PRINCIPLED':
                st=n.inputs['Emission Strength'].default_value
                if st>0: mats.setdefault(m.name,[]).append(o.name)
            if n.type=='EMISSION': mats.setdefault(m.name+'(EM)',[]).append(o.name)
for k,v in mats.items(): print('MAT',k,len(v),v[:12])
