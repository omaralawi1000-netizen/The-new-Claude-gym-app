import bpy
for c in ('UNDER',):
    col = bpy.data.collections.get(c)
    print(c, [o.name for o in col.objects] if col else None)
print([c.name for c in bpy.data.collections])
