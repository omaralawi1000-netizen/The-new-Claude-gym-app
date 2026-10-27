# scene11f.blend -> scene12.blend : forearm twist (pronation / supination) for dumbbell, hammer and cable moves.
# blender -b scene11f.blend --python twist.py -- scene12.blend
# A new bone foretw.<side> per arm carries the full twist; the old fore weight is split along the forearm (elbow 0 -> wrist 1),
# so the twist spreads up the forearm the way the radius rolls over the ulna. The arm modifiers already use preserve-volume
# (dual quaternion) skinning, so blending two bones that differ by a pure twist never pinches (no candy wrapper).
# The hand and fingers hang off foretw in pose.py. Geometry is untouched.
import bpy, sys, os, json, numpy as np
OUT = sys.argv[sys.argv.index('--') + 1:][0]
JS = json.load(open('joints.json'))
T0, T1 = float(os.environ.get('TW_T0', 0.05)), float(os.environ.get('TW_T1', 0.95))   # where along the forearm the twist ramps

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

rig = bpy.data.objects['RIG']; bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for s in 'lr':
    E, W = np.array(JS[s]['E']), np.array(JS[s]['W'])
    if 'foretw.' + s not in rig.data.edit_bones:
        eb = rig.data.edit_bones.new('foretw.' + s); eb.head = tuple(E); eb.tail = tuple(W); eb.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')

n = 0
for o in bpy.data.objects:
    s = o.get('rig_side')
    if o.type != 'MESH' or s is None: continue
    vg = o.vertex_groups.get('fore.' + s)
    if vg is None: continue
    E, W = np.array(JS[s]['E']), np.array(JS[s]['W']); a = W - E; L2 = a @ a
    M = np.array(o.matrix_world)
    tw = o.vertex_groups.get('foretw.' + s) or o.vertex_groups.new(name='foretw.' + s)
    gi = vg.index
    for v in o.data.vertices:
        w = next((g.weight for g in v.groups if g.group == gi), 0.0)
        if w <= 0: continue
        P = M[:3, :3] @ np.array(v.co) + M[:3, 3]
        t = float(ss(T0, T1, ((P - E) @ a) / L2))
        if t > 0: tw.add([v.index], w * t, 'REPLACE')
        vg.add([v.index], w * (1 - t), 'REPLACE')
    for md in o.modifiers:
        if md.type == 'ARMATURE': md.use_deform_preserve_volume = True
    n += 1
print('TWIST objects', n)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT))
