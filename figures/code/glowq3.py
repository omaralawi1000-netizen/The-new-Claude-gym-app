import bpy
o=bpy.data.objects['Long head of triceps brachii.r']; print('SLOT', o.material_slots[0].link, o.get('rig_side'), o.material_slots[0].material.name)
