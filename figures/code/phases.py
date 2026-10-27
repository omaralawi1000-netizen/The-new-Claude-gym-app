import sys, importlib, numpy as np; sys.path.insert(0,'.')
m=importlib.import_module('motions.'+(sys.argv[1] if len(sys.argv)>1 else 'curl')); E=np.array(m.CH['elbow'][1]); N=len(E)
lo,hi=E.min(),E.max(); r=(E-lo)/(hi-lo); i0=int(r.argmin()); R=np.roll(r,-i0)
up=np.nonzero(R>0.1)[0][0]; up9=np.nonzero(R>0.9)[0][0]; dn9=up9+np.nonzero(R[up9:]<0.9)[0][0]; dn=dn9+np.nonzero(R[dn9:]<0.1)[0][0]
bot=(np.abs(E-lo)<2).sum(); top=(np.abs(E-hi)<2).sum()
print('%s N %d: lift 10-90%% %d f, top(>90%%) %d f, lower 90-10%% %d f, bottom(<10%%) %d f | within 2deg: bottom %d top %d'%(sys.argv[1] if len(sys.argv)>1 else 'curl',N,up9-up,dn9-up9,dn-dn9,N-(dn-up),bot,top))
