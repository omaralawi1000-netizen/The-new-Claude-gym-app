import bpy; sc=bpy.context.scene
for v in ('AgX','Filmic','Standard','Khronos PBR Neutral'):
    try:
        sc.view_settings.view_transform=v; print('LOOKS', v, [l.identifier for l in sc.view_settings.bl_rna.properties['look'].enum_items])
    except Exception as e: print('LOOKS', v, e)
