import bpy
print('NAMES', sorted({o.name for o in bpy.data.objects if any(k in o.name.lower() for k in ('pector','pyramid','stern'))}))
