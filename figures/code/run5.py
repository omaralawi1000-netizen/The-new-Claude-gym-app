# bpy-module runner: python run5.py file.blend script.py -- args
import sys, bpy
blend, script = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
sys.argv = [script] + sys.argv[3:]
exec(compile(open(script).read(), script, 'exec'), {'__name__': '__main__'})
