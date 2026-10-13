// Aven's exercise figure: one sculpted body (signed distance fields), posed by rig.js, rendered offline into clips.
// World: y up, floor at y = 0. Torso local frame = the standing body's frame: x forward (chest), y up, z sideways.
export const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0,1); }
`;

export const makeFS = (decl, gear) => `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 R;
${decl}

float smin(float a,float b,float k){ float h=clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
float smax(float a,float b,float k){ return -smin(-a,-b,k); }
float sdE(vec3 p, vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.)/max(k1,1e-6); }
float sdRC(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-mix(ra,rb,h); }
float sdSeg(vec3 p, vec3 a, vec3 b){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
float sdCyl(vec3 p, vec3 a, vec3 b, float r){ vec3 ba=b-a, pa=p-a; float baba=dot(ba,ba), paba=dot(pa,ba);
  float x=length(pa*baba-ba*paba)-r*baba; float y=abs(paba-baba*.5)-baba*.5; float x2=x*x, y2=y*y*baba;
  float d=(max(x,y)<0.)?-min(x2,y2):(((x>0.)?x2:0.)+((y>0.)?y2:0.)); return sign(d)*sqrt(abs(d))/baba; }
float sdRBox(vec3 p, vec3 b, float r){ vec3 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r; }
vec3 qrot(vec4 q, vec3 v){ return v + 2.*cross(q.xyz, cross(q.xyz, v) + q.w*v); }
// frame of a bone a->b with a hint for its front: columns = front, along, side
mat3 frameOf(vec3 a, vec3 b, vec3 f){ vec3 y=normalize(b-a); vec3 x=normalize(f - y*dot(f,y)); vec3 z=cross(x,y); return mat3(x,y,z); }

float hot; float mat; // distance to the worked muscles; material (0 body, 1 metal, 2 pad, 3 chrome, 4 plate)
void addHot(int bit, float d){ if ((uHot & bit) != 0) hot = min(hot, d); }

// ── torso and head, in torso-local coordinates (the standing pose)
float torso(vec3 p){
  float d = sdE(p - vec3(-0.01,1.31,0.), vec3(.1,.16,.15));                // ribcage
  d = smin(d, sdE(p - vec3(-0.035,1.27,0.), vec3(.075,.15,.19)), .05);     // back: the V
  vec3 m = vec3(p.x, p.y, abs(p.z));                                        // mirrored
  float lats = sdE(m - vec3(-0.04,1.24,0.11), vec3(.05,.13,.06));
  d = smin(d, lats, .04);
  d = smin(d, sdE(p - vec3(0.0,1.09,0.), vec3(.095,.13,.125)), .06);       // waist
  d = smin(d, sdE(p - vec3(-0.01,0.95,0.), vec3(.105,.095,.15)), .06);     // pelvis
  vec3 pq = m - vec3(0.062,1.37,0.085); float pa = -0.32; pq.yz = mat2(cos(pa),-sin(pa),sin(pa),cos(pa))*pq.yz;
  float pecs = sdE(pq, vec3(.04,.06,.105));
  d = smin(d, pecs, .02);
  d = smin(d, sdRC(m, vec3(0.045,1.465,0.025), vec3(0.0,1.475,0.17), .016, .016), .035); // collarbones
  float glutes = sdE(m - vec3(-0.075,0.9,0.07), vec3(.075,.09,.078));
  d = smin(d, glutes, .04);
  float traps = sdE(m - vec3(-0.025,1.49,0.075), vec3(.055,.04,.085));
  d = smin(d, traps, .04);
  d = smin(d, sdE(m - vec3(0.04,1.1,0.1), vec3(.06,.1,.035)), .04);        // obliques
  float abs_ = sdE(p - vec3(0.06,1.12,0.), vec3(.04,.13,.075));
  d = smin(d, abs_, .05);
  d = smin(d, sdE(p - vec3(0.025,1.425,0.), vec3(.06,.05,.13)), .05);      // upper chest
  d = smax(d, -sdE(p - vec3(0.1,1.14,0.), vec3(.01,.1,.005)), .016);       // ab midline (soft)
  for (int i=0;i<3;i++) d = smax(d, -sdE(p - vec3(0.1,1.19-0.07*float(i),0.), vec3(.008,.005,.05)), .016);
  d = smax(d, -sdE(p - vec3(0.085,1.37,0.), vec3(.016,.06,.004)), .012);    // between the pecs
  d = smin(d, sdRC(p, vec3(-.005,1.47,0.), vec3(0.01,1.56,0.), .058, .05), .04);   // neck
  d = smin(d, sdE(m - vec3(0.02,1.5,0.035), vec3(.018,.06,.016)), .02);           // neck cords
  d = smin(d, sdE(p - vec3(0.012,1.64,0.), vec3(.08,.1,.073)), .03);             // head
  d = smin(d, sdE(p - vec3(0.042,1.585,0.), vec3(.048,.042,.052)), .03);         // jaw
  d = smin(d, sdE(p - vec3(0.074,1.625,0.), vec3(.008,.014,.006)), .018);        // a hint of a nose; no face
  addHot(1, pecs); addHot(32, lats); addHot(128, glutes); addHot(2048, traps); addHot(1024, abs_);
  return d;
}

// ── arm i: shoulder S, elbow E, wrist W
float arm(vec3 p, int i){
  vec3 S = uJ[i*3], E = uJ[i*3+1], W = uJ[i*3+2];
  float bb = min(sdSeg(p, S, E), sdSeg(p, E, W + normalize(W-E)*.07));
  if (bb > .16) return bb - .1;
  vec3 f = uAF[i], sd = uAS[i];
  mat3 mu = frameOf(S, E, f);
  vec3 q = (p - S) * mu; float zs = dot(sd, mu[2]) > 0. ? 1. : -1.; q.z *= zs; // +z = outward
  float d = sdRC(p, S + (E-S)*.07, E, .05, .037);
  float flex = clamp(1. - dot(normalize(E-S), normalize(W-E)), 0., 1.);
  float delF = sdE(q - vec3(.03, .045, .01), vec3(.042,.075,.045));
  float delS = sdE(q - vec3(.0, .05, .04), vec3(.045,.08,.04));
  float delR = sdE(q - vec3(-.03, .05, .015), vec3(.04,.07,.045));
  float del = smin(smin(delF, delS, .02), delR, .02);
  float pump = 1. + .2*flex;
  float bi = sdE(q - vec3(.026, .155, 0.), vec3(.038*pump, .085, .04*mix(1.,1.08,flex)));
  float tri = smin(sdE(q - vec3(-.032, .11, .012), vec3(.04, .095, .036)), sdE(q - vec3(-.03, .14, -.016), vec3(.036, .08, .034)), .015);
  d = smin(d, del, .03);
  d = smin(d, tri, .016);
  d = smin(d, bi, .015);
  addHot(2, delF); addHot(4, delS); addHot(8192, delR); addHot(16, bi); addHot(8, tri);
  // forearm
  vec3 pn = uPalm[i];
  mat3 mf = frameOf(E, W, pn);
  float fa = sdRC(p, E, W, .044, .031);
  vec3 fq = (p - E) * mf;
  float flexors = sdE(fq - vec3(.012, .075, 0.), vec3(.042, .1, .044));
  float bra = sdE(fq - vec3(-.005, .06, .02), vec3(.035, .085, .03));
  fa = smin(fa, smin(flexors, bra, .02), .03);
  d = smin(d, fa, .02);
  addHot(4096, flexors);
  // hand: a closed fist round the grip axis
  vec3 fw = normalize(W - E);
  vec3 g = uGrip[i];
  vec3 gx = normalize(g - fw*dot(g,fw)), nx = normalize(cross(gx, fw));
  if (dot(nx, pn) < 0.) nx = -nx;
  vec3 C = W + fw*.05;
  vec3 hq = vec3(dot(p-C, gx), dot(p-C, fw), dot(p-C, nx));
  float hand = sdRBox(hq - vec3(0., -.012, .0), vec3(.042, .032, .022), .018);                    // palm, back of the hand
  hand = smin(hand, sdRC(hq, vec3(-.04, .022, -.004), vec3(.04, .022, -.004), .019, .017), .012);  // curled fingers
  float th = dot(g, uAS[i]) > 0. ? -1. : 1.;                                                      // thumb on the inner side
  hand = smin(hand, sdRC(hq, vec3(.045*th, -.025, .02), vec3(.02*th, .016, .03), .012, .011), .01);
  d = smin(d, hand, .018);
  return d;
}

float leg(vec3 p, int i){
  vec3 Hp = uJ[6+i*3], K = uJ[7+i*3], A = uJ[8+i*3];
  float bb = min(sdSeg(p, Hp, K), sdSeg(p, K, A));
  if (bb > .2) return bb - .14;
  vec3 f = uLF[i];
  mat3 mt = frameOf(Hp, K, f);
  vec3 q = (p - Hp) * mt; float zs = dot(uLS[i], mt[2]) > 0. ? 1. : -1.; q.z *= zs;
  float d = sdRC(p, Hp, K, .083, .05);
  float rect = sdE(q - vec3(.035, .2, .0), vec3(.06,.19,.055));
  float vl = sdE(q - vec3(.01, .22, .045), vec3(.055,.17,.05));
  float vm = sdE(q - vec3(.025, .34, -.035), vec3(.05,.085,.05));
  float quads = smin(smin(rect, vl, .02), vm, .02);
  float ham = sdE(q - vec3(-.04, .2, .0), vec3(.055,.17,.06));
  d = smin(d, quads, .03);
  d = smin(d, ham, .035);
  addHot(64, quads); addHot(256, ham);
  mat3 ms = frameOf(K, A, f);
  vec3 c = (p - K) * ms; c.z *= zs;
  d = smin(d, sdE(p - K - ms[0]*.02, vec3(.028,.036,.036)), .035);         // knee
  d = smin(d, sdRC(p, K, A, .046, .027), .03);
  d = smin(d, sdE(c - vec3(.025, .12, .012), vec3(.026,.1,.026)), .025);   // shin
  float calf = smin(sdE(c - vec3(-.03, .12, .012), vec3(.045,.105,.04)), sdE(c - vec3(-.028, .14, -.016), vec3(.047,.095,.038)), .02);
  d = smin(d, calf, .02);
  addHot(512, calf);
  vec3 ff = uFoot[i];
  vec3 fy = normalize(K - A); vec3 fz = normalize(cross(ff, fy)); vec3 fx = cross(fy, fz);
  vec3 fq = p - A;
  vec3 fl = vec3(dot(fq, fx), dot(fq, fy), dot(fq, fz));
  d = smin(d, sdE(fl - vec3(.055,-.052,0), vec3(.1,.03,.038)), .03);      // foot
  d = smin(d, sdE(fl - vec3(-.01,-.045,0), vec3(.045,.04,.034)), .02);    // heel
  return d;
}

float body(vec3 p){
  vec3 lp = transpose(uR) * (p - uT);
  float bt = sdSeg(lp, vec3(-.01,.93,0.), vec3(.01,1.6,0.)) - .26;   // a capsule round the whole torso and head
  float d = bt > .05 ? bt : torso(lp);
  d = smin(d, arm(p, 0), .03);
  d = smin(d, arm(p, 1), .03);
  d = smin(d, leg(p, 0), .045);
  d = smin(d, leg(p, 1), .045);
  return d;
}

// a simple stand-in of the body (capsules), only for the soft shadow on the floor
float bodyS(vec3 p){
  vec3 lp = transpose(uR) * (p - uT);
  float d = sdE(lp - vec3(-.01,1.2,0.), vec3(.12,.33,.18));
  d = min(d, length(lp - vec3(.015,1.62,0.)) - .09);
  for (int i=0;i<2;i++){
    vec3 S = uJ[i*3], E = uJ[i*3+1], W = uJ[i*3+2];
    d = min(d, min(sdRC(p,S,E,.055,.042), sdRC(p,E,W + normalize(W-E)*.08,.044,.034)));
    vec3 Hp = uJ[6+i*3], K = uJ[7+i*3], A = uJ[8+i*3];
    d = min(d, min(sdRC(p,Hp,K,.085,.055), sdRC(p,K,A,.05,.032)));
    d = min(d, sdRC(p, A + vec3(0,-.04,0), A + vec3(0,-.05,0) + uFoot[i]*.15, .04, .03));
  }
  return d;
}
float plate(vec3 p, vec3 c, vec3 ax, float r, float h){
  vec3 q = p - c; float a = dot(q, ax); float rr = length(q - ax*a);
  vec2 dd = vec2(rr - r, abs(a) - h);
  float d = min(max(dd.x,dd.y),0.) + length(max(dd,0.)) - .006;
  d = max(d, -max(rr - r*.78, abs(a) - h*.55));        // recessed face
  d = min(d, max(rr - r*.22, abs(a) - h*1.05) - .004); // hub
  return d;
}
${gear}
float map(vec3 p){
  hot = 1e9;
  float g = gear(p);
  float b = body(p);
  if (b < g) { mat = 0.; return b; }
  return g;
}
float mapS(vec3 p){ return min(gearS(p), bodyS(p)); }
#define ZERO min(int(R.x),0)
// loops start at ZERO so the compiler keeps them as loops (one copy of map each) instead of unrolling them
vec3 nrm(vec3 p){ vec3 n = vec3(0.); for (int i=ZERO;i<4;i++){ vec3 e = .5773*(2.*vec3((((i+3)>>1)&1),((i>>1)&1),(i&1))-1.); n += e*map(p+.0006*e); } return normalize(n); }
float ao(vec3 p, vec3 n){ float o=0., s=1.; for(int i=ZERO+1;i<5;i++){ float h=.006+.02*float(i); o+=(h-map(p+n*h))*s; s*=.7; } return clamp(1.-3.2*o,0.,1.); }
vec3 grade(vec3 c){ c = c/(1.+c*.12); c = pow(max(c,0.), vec3(.4545)); return mix(c, c*c*(3.-2.*c), .55); }
float h3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x), f.y), f.z); }
float clayN(vec3 p){ return vn(p*38.)*.7 + vn(p*95.)*.3; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
float shadow(vec3 ro, vec3 rd, float t0, float k){ float r=1., t=t0*(1.+hash(gl_FragCoord.xy)); for(int i=ZERO;i<64;i++){ float h=mapS(ro+rd*t); r=min(r, k*h/t); t+=clamp(h,.02,.2); if(r<.005||t>1.4) break; } r=clamp(r,0.,1.); return r*r*(3.-2.*r); }

void main(){
  vec2 uv = (gl_FragCoord.xy - .5*R)/R.y;
  vec3 ww = normalize(uTa-uCam), uu = normalize(cross(ww, vec3(0,1,0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x*uu + uv.y*vv + uFocal*ww), ro = uCam;
  vec3 acc = vec3(1.0,.36,.2);                       // the reference accent; the app tints it to each look
  // march only inside the sphere round the whole scene
  vec3 oc = ro - uSB.xyz; float bq = dot(oc, rd), cq = dot(oc, oc) - uSB.w*uSB.w, disc = bq*bq - cq;
  float t = 1e9, tEnd = -1.; float hit = -1.; float minHot = 1e9; float hotHit = 1e9, matHit = 0.;
  if (disc > 0.) { float sq = sqrt(disc); t = max(-bq - sq, .3); tEnd = -bq + sq; }
  for(int i=ZERO;i<220;i++){ if (t > tEnd) break; vec3 p = ro+rd*t; float h = map(p); minHot = min(minHot, hot); if(h<.0004*t){ hit=1.; hotHit = hot; matHit = mat; break; } t+=h*.8; }
  float tf = rd.y < 0. ? -ro.y/rd.y : 1e9;
  vec3 bgc = mix(vec3(.004,.0042,.006), vec3(.03,.02,.022), smoothstep(.75,.0,length(uv-vec2(0.,-.02))));
  vec3 col; float alpha;
  if (hit < 0. || tf < t) {
    float shA = 0.;
    if (tf < 1e8) {
      vec3 p = ro + rd*tf;
      vec3 o2 = p - uSB.xyz; float b2 = dot(o2, uKey), c2 = dot(o2,o2) - uSB.w*uSB.w;
      float s = (b2*b2 - c2 > 0. && -b2 + sqrt(b2*b2-c2) > 0.) ? shadow(p+vec3(0,.002,0), uKey, .03, 5.) : 1.;
      float occ = 1.; for(int i=ZERO+1;i<5;i++){ float hh=.06*float(i); occ -= .2*clamp(1.-mapS(p+vec3(0,hh,0))/hh,0.,1.); }
      s *= clamp(occ,0.,1.);
      vec2 q2 = gl_FragCoord.xy/R; float edge = min(min(q2.x, 1.-q2.x), min(q2.y, 1.-q2.y));
      shA = (1.-s)*.6*smoothstep(2.4, .6, length(p.xz - uTa.xz))*smoothstep(0., .14, edge);
    }
    col = bgc*(1.-shA); alpha = shA;
  } else {
    vec3 p = ro+rd*t; vec3 n = nrm(p);
    float hotd = hotHit; float m = matHit;
    float a = ao(p,n);
    float rim = pow(clamp(1.+dot(n,rd),0.,1.), 2.6);
    float soft = pow(clamp(dot(n,uKey)*.5+.5,0.,1.), 2.2);
    float back = clamp(dot(n,uRim)*.7+.3,0.,1.);
    vec3 rf = reflect(rd,n);
    vec3 c;
    if (m < .5) {
      // a fine sculpted grain: nudge the normal by the slope of a soft noise (shading only, the shape stays)
      vec2 e2 = vec2(.0025, 0.); float n0 = clayN(p);
      vec3 gN = vec3(clayN(p+e2.xyy)-n0, clayN(p+e2.yxy)-n0, clayN(p+e2.yyx)-n0)/e2.x;
      vec3 ns = normalize(n - .0005*(gN - n*dot(gN,n)));
      float soft2 = pow(clamp(dot(ns,uKey)*.55+.45,0.,1.), 2.6);
      float fill = clamp(dot(ns,uFill)*.5+.5,0.,1.);
      float sky = clamp(ns.y*.5+.5,0.,1.);
      float bounce = clamp(-ns.y,0.,1.);
      vec3 base = vec3(.5);                 // near-neutral clay, so a look's tint only moves the glow
      c = base*(.02 + 1.0*soft2 + .1*fill*fill + .06*sky + .05*bounce) * pow(a, 1.35);
      c += pow(clamp(dot(reflect(rd,ns),uKey),0.,1.), 12.)*.06*soft2;  // satin sheen
      c += rim*back*vec3(.61)*.42 + rim*.035;
      float g = smoothstep(.022, -.006, hotd);
      float k = mix(.75, 1., uWork);
      float lum = dot(c, vec3(.3,.5,.2));
      vec3 hc = acc*(.14 + 1.2*lum)*vec3(1.,.84,.84) + acc*.1*k + vec3(1.,.6,.45)*pow(g,4.)*.1*k;
      c = mix(c, hc, g*k);
    } else if (m < 1.5 || m > 3.5) {                 // satin metal (frames) and plates
      float sp = pow(clamp(dot(rf,uKey),0.,1.), 24.);
      c = vec3(.058)*(.5+.9*soft)*a + sp*.3 + rim*back*vec3(.5)*.5;
    } else if (m < 2.5) {                            // pads: dark matte upholstery
      c = vec3(.05)*(.4+1.2*soft)*a + rim*back*vec3(.43)*.3 + pow(clamp(dot(rf,uKey),0.,1.),6.)*.03;
    } else {                                         // chrome bars and handles
      float sp = pow(clamp(dot(rf,uKey),0.,1.), 40.);
      c = vec3(.092)*(.4+.8*soft)*a + sp*.8 + rim*back*vec3(.57)*.45;
    }
    col = c; alpha = 1.;
  }
  // soft bloom round the worked muscles
  float bl = .3*exp(-minHot*30.)*mix(.6,1.,uWork);
  if (alpha >= 1.) { o = vec4(grade(col + acc*bl), 1.); return; }
  if (uAlpha > .5) { float ga = clamp(bl*1.5, 0., 1.); o = vec4(grade(acc)*ga, 1. - (1.-alpha)*(1.-ga)); return; }
  o = vec4(grade(col + acc*bl), 1.);
}
`;
