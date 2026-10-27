import bpy,re
for o in bpy.data.objects:
    if o.type=='MESH' and re.search(r'triceps|Brachialis|Brachioradialis|biceps|Anconeus',o.name,re.I):
        print('OB',o.name,[s.material.name if s.material else None for s in o.material_slots], o.get('rig_side'))
