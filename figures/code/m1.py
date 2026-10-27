import bpy, numpy as np, re
def P(o):
    dg=bpy.context.evaluated_depsgraph_get(); e=o.evaluated_get(dg); me=e.to_mesh()
    a=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',a); a=a.reshape(-1,3); M=np.array(o.matrix_world); return a@M[:3,:3].T+M[:3,3]
objs={o.name:P(o) for o in bpy.data.objects if o.type=='MESH' and re.search(r'Adductor|Gracilis|U:body|Crotch|Hip bone|Pubic|Rectus abdominis|Sternocleido|NeckCore|trapezius',o.name)}
print('CROTCH rows: z, per object min |x| (front y<0.02)')
for z in np.arange(0.66,0.86,0.02):
    row=[]
    for n,a in objs.items():
        s=(abs(a[:,2]-z)<0.01)&(a[:,1]<0.02)&(np.abs(a[:,0])<0.12)
        if s.sum(): row.append('%s:%.3f/%.3f'%(n[:14],np.abs(a[s,0]).min(),a[s,1].min()))
    print('%.2f'%z,' '.join(row))
for n in objs:
    a=objs[n]; print(n,len(a),a.min(0).round(3),a.max(0).round(3))
