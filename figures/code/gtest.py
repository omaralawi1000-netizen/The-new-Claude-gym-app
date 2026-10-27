import bpy, sys
sc = bpy.context.scene
exec(open('render.py').read().split("def denoise")[0].split("def glare")[1].join(["def glare",""]) if False else "")
