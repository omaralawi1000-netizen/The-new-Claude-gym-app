// The five orb designs of the lab (26 Oct, Omar: "beautiful… unique… mind-blowing… alive"). Each is one WebGL2 fragment
// shader drawing the orb and the light round it. The orb's outline is always a perfect circle (the orb never changes shape);
// everything happens in light and depth inside and around it. They all read the same inputs (HEAD): the time, your voice
// (level + 16 bands), its voice, how much it is listening / thinking / speaking, the last syllables, a touch and its age,
// a press, the finger's lagging move (lean), the palette's two colours and the success colour.

export const VERT = `#version 300 es
in vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes; uniform vec2 uC; uniform float uR; uniform float uT;
uniform float uIn; uniform vec4 uB0; uniform vec4 uB1; uniform vec4 uB2; uniform vec4 uB3;
uniform float uOut; uniform float uListen; uniform float uThink; uniform float uSpeak; uniform float uAppear; uniform float uDone;
uniform vec4 uSyl; uniform vec4 uSylA;          // ages (s) and strengths of the last four syllables (its voice or yours)
uniform vec3 uTouch; uniform float uTapAge;     // where a finger touched (orb units, z = strength) and how long ago
uniform float uPress; uniform vec2 uLean;       // finger down; the inside's lag behind a drag (orb units)
uniform vec3 uAc; uniform vec3 uAlt; uniform vec3 uOk;

#define PI 3.14159265
float band(float x) {
  float f = clamp(x, 0.0, 1.0) * 15.0; int i = int(floor(f)); float r = f - float(i);
  float b[16] = float[16](uB0.x,uB0.y,uB0.z,uB0.w,uB1.x,uB1.y,uB1.z,uB1.w,uB2.x,uB2.y,uB2.z,uB2.w,uB3.x,uB3.y,uB3.z,uB3.w);
  return mix(b[i], b[min(15, i + 1)], r);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float sat(float x) { return clamp(x, 0.0, 1.0); }
// the room behind: the orb screen's dark frost with the accent's low light, and the orb's own glow round it
vec3 room(vec2 frag, float glow) {
  vec2 q = frag / uRes;
  vec3 c = vec3(0.024, 0.031, 0.05);
  c += uAc * 0.10 * smoothstep(1.1, 0.0, length((q - vec2(0.5, 1.08)) * vec2(1.0, 1.4)));
  vec2 p = (frag - uC) / uR; float r = length(p);
  c += mix(uAc, uAlt, 0.3) * glow * 0.22 * exp(-max(0.0, r - 1.0) * 2.6) * smoothstep(0.6, 1.0, r);
  return c;
}
// the glass it is held in: a bright edge where glass catches light, a soft reflection top left, a hint of colour
// splitting at the very rim
vec3 glass(vec2 p, vec3 n, float k) {
  float r = length(p), fr = pow(1.0 - n.z, 3.0);
  vec3 c = vec3(0.0);
  c += mix(uAc, vec3(1.0), 0.45) * fr * 0.55 * k;
  c.r += pow(1.0 - n.z, 6.0) * smoothstep(0.0, 1.0, p.x) * 0.25 * k;
  c.b += pow(1.0 - n.z, 6.0) * smoothstep(0.0, 1.0, -p.x) * 0.3 * k;
  vec2 hl = p - vec2(-0.36, 0.42);
  c += vec3(1.0) * 0.16 * k * exp(-dot(hl, hl) * 9.0);
  c += vec3(1.0) * 0.5 * k * exp(-dot(hl * vec2(1.0, 1.6), hl * vec2(1.0, 1.6)) * 90.0);
  return c;
}
vec3 tone(vec3 c) { return 1.0 - exp(-c * 1.25); }
// a touch: the strength of its ring of light at distance d (orb units) from where the finger landed
float tapRing(float d) { float f = uTapAge * 1.3; return uTouch.z * exp(-uTapAge * 2.2) * exp(-pow((d - f) * 9.0, 2.0)); }
`;

// 1. SILK: a glass sphere with a satin ribbon of light inside (Omar's reference clip). One half-twisted band that turns
// slowly; your voice widens it and lights it from inside; thinking braids a second band through it and quickens the
// twist; speaking sends pulses of light along it; a touch pushes it away from your finger; a drag leaves it swinging.
const SILK = HEAD + `
float ribbon(vec3 q, float rad, float tw, float w, float ph) {
  float a = atan(q.z, q.x);
  float rr = length(q.xz);
  vec2 cs = vec2(rr - rad - 0.05 * sin(2.0 * a + uT * 0.5 + ph), q.y - 0.16 * sin(2.0 * a + uT * 0.7 + ph));
  cs = rot(a * 0.5 + tw) * cs;
  float ww = w * (0.65 + 0.35 * cos(2.0 * a + uT * 0.4 + ph));
  vec2 d = abs(cs) - vec2(ww, 0.01);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.004;
}
vec3 place(vec3 p) {
  // its slow turn, the drag's swing (it lags behind the finger and swings back) and a touch pushing it away
  p.xz = rot(uT * 0.32 + uLean.x * 2.2) * p.xz;
  p.yz = rot(0.62 + 0.14 * sin(uT * 0.21) - uLean.y * 2.2) * p.yz;
  return p;
}
float scene(vec3 p, out float which) {
  vec3 tp = vec3(uTouch.xy, sqrt(max(0.0, 1.0 - dot(uTouch.xy, uTouch.xy))));
  float push = uTouch.z * exp(-uTapAge * 2.6) * 0.22;
  p += normalize(p - tp + 1e-4) * push * exp(-dot(p - tp, p - tp) * 6.0);
  vec3 q = place(p);
  float w = 0.17 + 0.09 * uIn * uListen + 0.04 * uOut;
  float tw = uT * (0.55 + 1.6 * uThink);
  float d1 = ribbon(q, 0.52, tw, w, 0.0);
  vec3 q2 = q; q2.xy = rot(PI * 0.5) * q2.xy; q2.xz = rot(uT * 0.9) * q2.xz;
  float d2 = ribbon(q2, 0.44, -tw * 1.3, w * 0.8 * uThink, 1.7) + (1.0 - uThink) * 0.5;
  which = d1 < d2 ? 0.0 : 1.0;
  return min(d1, d2);
}
void main() {
  vec2 frag = gl_FragCoord.xy; vec2 p = (frag - uC) / uR; p.y = p.y; float r = length(p);
  float app = uAppear;
  vec3 col = room(frag, 0.6 + uIn * 0.6 * uListen + uOut * 0.5 + uThink * 0.3);
  if (r < 1.0 / max(app, 0.001) * 1.0 && r < 1.0) {
    vec3 n = vec3(p, sqrt(1.0 - r * r));
    // through the glass: the ray bends a little at the surface
    vec3 ro = vec3(p - n.xy * 0.1, n.z), rd = normalize(vec3(-n.xy * 0.18, -1.0));
    float t = 0.0, hit = 0.0, which = 0.0, md = 9.0; vec3 pos;
    for (int i = 0; i < 70; i++) {
      pos = ro + rd * t;
      if (pos.z < -1.0) break;
      float d = scene(pos, which);
      md = min(md, d);
      if (d < 0.002) { hit = 1.0; break; }
      t += d * 0.55;
    }
    vec3 inside = mix(uAlt, uAc, 0.4) * 0.05 + uAc * 0.18 * exp(-r * r * 2.5) * (0.4 + uThink * 0.6 + uIn * uListen * 0.6);
    if (hit > 0.5) {
      float w2; vec2 e = vec2(0.003, 0.0);
      vec3 nn = normalize(vec3(scene(pos + e.xyy, w2) - scene(pos - e.xyy, w2), scene(pos + e.yxy, w2) - scene(pos - e.yxy, w2), scene(pos + e.yyx, w2) - scene(pos - e.yyx, w2)));
      vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
      float face = abs(nn.z);
      float diff = 0.35 + 0.65 * abs(dot(nn, L));
      vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(abs(dot(nn, hv)), 40.0);
      float sheen = pow(1.0 - face, 2.0);
      vec3 q = place(pos); float a = atan(q.z, q.x);
      // light running along it while it speaks, and the band glowing with your voice where your voice is
      float pulse = uSpeak * (0.5 + 0.5 * sin(a * 3.0 - uT * 5.0)) * (0.3 + uOut * 1.4);
      float voice = uListen * band(fract(a / (2.0 * PI) + 0.5)) * 1.2;
      vec3 base = mix(uAlt, uAc, 0.35 + 0.65 * face);
      vec3 rc = base * diff * (0.75 + voice + pulse) + vec3(1.0) * (spec * 1.4 + sheen * 0.35 * (0.6 + uThink));
      rc = mix(rc, mix(uAlt, uAc, 0.5) * 0.35, sat(-pos.z * 0.5)); // further back, quieter
      if (which > 0.5) rc = mix(rc, mix(uAc, vec3(1.0), 0.4) * diff * 1.3, 0.5);
      // lit from within, like the reference: the face towards you glows, brightest where it turns
      rc += mix(uAc, vec3(1.0), 0.55) * (pow(face, 3.0) * 0.45 + sheen * 0.25) * (0.7 + uIn * uListen * 0.8 + uOut * 0.8 + uThink * 0.5);
      inside = rc;
    }
    // its light in the glass round it (a soft bloom along the band)
    inside += mix(uAc, vec3(1.0), 0.25) * exp(-md * 22.0) * (1.0 - hit) * (0.35 + uIn * uListen * 0.6 + uOut * 0.7 + uThink * 0.4);
    vec3 g = glass(p, n, 1.0) + vec3(1.0) * tapRing(length(p - uTouch.xy)) * 0.9;
    vec3 c = inside + g;
    if (uDone > 0.0) c += uOk * 0.8 * (1.0 - uDone) * exp(-pow((p.y + 1.0 - uDone * 2.4) * 5.0, 2.0));
    float edge = smoothstep(1.0, 0.985, r);
    col = mix(col, c, edge * app);
  }
  o = vec4(tone(col), 1.0);
}`;

// 2. NEBULA: a living cloud of light held inside glass. It drifts and folds on its own; your voice stirs it (low voice
// low in it, high voice high); thinking winds it into a slow vortex round a bright core; speaking sends shells of light
// out from the core with each syllable; a touch leaves a bloom of light that spreads; a drag makes it slosh and settle.
const NEBULA = HEAD + `
float dens(vec3 q, out float heat) {
  float r = length(q);
  vec3 w = q;
  // thinking: the cloud winds into a vortex round its core (inner parts turn faster)
  w.xz = rot(uThink * (1.6 - r) * (1.2 + uT * 0.9)) * w.xz;
  w += vec3(uLean * 1.6, 0.0) * (1.0 - r);
  float h = band(sat((q.y + 1.0) * 0.5)) * uListen;
  vec3 f = w * 1.7 + vec3(0.0, -uT * 0.18, uT * 0.07);
  f += 0.55 * vec3(snoise(f * 0.8 + 3.1), snoise(f * 0.8 + 7.9), snoise(f * 0.8 + 1.3)) * (1.0 + h * 1.5 + uIn * uListen * 0.6);
  float d = fbm(f) * 0.6 + 0.35 - r * 0.55;
  heat = 0.0;
  for (int i = 0; i < 4; i++) { float age = uSyl[i]; if (age < 0.0 || age > 1.6) continue; float sh = age * 0.75; heat += uSylA[i] * uSpeak * exp(-pow((r - sh) * 7.0, 2.0)) * (1.0 - age / 1.6); }
  vec3 tp = vec3(uTouch.xy, sqrt(max(0.0, 1.0 - dot(uTouch.xy, uTouch.xy))) * 0.6);
  float tr = 0.08 + uTapAge * 0.25;
  heat += uTouch.z * exp(-uTapAge * 1.4) * exp(-dot(q - tp, q - tp) / (tr * tr)) * 1.5;
  heat += uThink * exp(-r * r * 12.0) * 1.4 + uOut * exp(-r * r * 5.0) * 0.8;
  return max(0.0, d) * (1.0 + h * 1.3);
}
void main() {
  vec2 frag = gl_FragCoord.xy; vec2 p = (frag - uC) / uR; float r = length(p);
  vec3 col = room(frag, 0.7 + uIn * uListen * 0.7 + uOut * 0.6 + uThink * 0.4);
  if (r < 1.0) {
    vec3 n = vec3(p, sqrt(1.0 - r * r));
    float z0 = n.z, z1 = -n.z, steps = 34.0, dz = (z0 - z1) / steps;
    vec3 acc = vec3(0.0); float tr = 1.0;
    for (int i = 0; i < 34; i++) {
      vec3 q = vec3(p - n.xy * 0.08, z0 - dz * (float(i) + 0.5));
      float heat; float d = dens(q, heat);
      float rq = length(q);
      vec3 c = mix(uAlt * 0.9, uAc, sat(d * 2.2)) * d * 2.4;
      c += mix(uAc, vec3(1.0), 0.6) * pow(sat(d * 1.6), 3.0) * 2.0;
      c += mix(uAc, vec3(1.0), 0.5) * heat * 1.6;
      c *= 0.55 + 0.45 * smoothstep(1.0, 0.2, rq);
      acc += c * tr * dz * 1.6;
      tr *= exp(-d * dz * 2.2);
      if (tr < 0.03) break;
    }
    vec3 c = acc + glass(p, n, 0.9) + vec3(1.0) * tapRing(length(p - uTouch.xy)) * 0.6;
    if (uDone > 0.0) c += uOk * 0.9 * (1.0 - uDone) * exp(-pow((r - uDone * 1.1) * 5.0, 2.0));
    col = mix(col, c, smoothstep(1.0, 0.985, r) * uAppear);
  }
  o = vec4(tone(col), 1.0);
}`;

// 3. LIQUID GLASS: a sphere of clear glass, like iOS's liquid glass, with soft studio light in it. Everything is ripples on
// its surface (it stays a sphere): each syllable you say sends a ring up from the bottom, each of its own goes out from the
// middle; a touch rings out from your finger; thinking lights slow caustics swirling deep inside; a drag sets the light in
// it swinging.
const LIQUID = HEAD + `
float wave(vec3 n, vec3 s, float age, float amp, float speed) {
  if (age < 0.0) return 0.0;
  float d = acos(clamp(dot(n, s), -1.0, 1.0));
  float f = age * speed;
  return amp * exp(-age * 1.6) * sin((d - f) * 26.0) * exp(-pow((d - f) * 5.0, 2.0));
}
float height(vec3 n) {
  float h = 0.0;
  vec3 bottom = normalize(vec3(0.0, -0.85, 0.5)), mid = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    h += wave(n, bottom, uSyl[i], uSylA[i] * uListen * 0.05, 1.4);
    h += wave(n, mid, uSyl[i], uSylA[i] * uSpeak * 0.05, 1.2);
  }
  vec3 tp = vec3(uTouch.xy, sqrt(max(0.0, 1.0 - dot(uTouch.xy, uTouch.xy))));
  h += wave(n, tp, uTapAge, uTouch.z * 0.07, 1.5);
  h += 0.004 * snoise(n * 3.0 + uT * 0.3) * (1.0 + uIn * uListen * 3.0);
  return h;
}
vec3 env(vec3 d) {
  // a soft studio: a dark room, a big softbox above left, a thin strip light right, the accent's glow from below
  vec3 c = vec3(0.02, 0.025, 0.04) + uAc * 0.12 * sat(-d.y) ;
  c += vec3(1.0) * 1.6 * smoothstep(0.28, 0.0, length((d.xy - vec2(-0.42, 0.55)) * vec2(1.0, 1.5)));
  c += vec3(1.0) * 0.9 * smoothstep(0.03, 0.0, abs(d.x - 0.62)) * smoothstep(0.6, 0.1, abs(d.y - 0.1));
  c += mix(uAc, uAlt, 0.5) * 0.5 * smoothstep(0.5, 0.0, length(d.xy - vec2(0.2, -0.75)));
  return c;
}
void main() {
  vec2 frag = gl_FragCoord.xy; vec2 p = (frag - uC) / uR; float r = length(p);
  vec3 col = room(frag, 0.55 + uIn * uListen * 0.5 + uOut * 0.5 + uThink * 0.3);
  if (r < 1.0) {
    vec3 n0 = vec3(p, sqrt(1.0 - r * r));
    // the ripples bend the surface's normal (never its outline)
    vec3 tx = normalize(cross(n0, vec3(0.0, 1.0, 0.0001))), ty = normalize(cross(tx, n0));
    float e = 0.01, h0 = height(n0);
    float hx = (height(normalize(n0 + tx * e)) - h0) / e, hy = (height(normalize(n0 + ty * e)) - h0) / e;
    vec3 n = normalize(n0 - tx * hx * 1.6 - ty * hy * 1.6);
    vec3 v = vec3(0.0, 0.0, 1.0);
    vec3 refl = reflect(-v, n);
    refl.xy = rot(uLean.x * 1.5) * refl.xy;
    float fres = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(n, v)), 4.0);
    // through it: the room behind, bent, coloured a little by the glass, with caustics deep inside while it thinks
    vec3 refr = refract(-v, n, 0.72);
    vec2 bp = p + refr.xy * 0.55 + uLean * 0.4;
    float ca = 0.0;
    if (uThink > 0.01) {
      vec3 cq = vec3(bp * 2.2, uT * 0.35); cq.xy = rot(uT * 0.25) * cq.xy;
      float c1 = abs(snoise(cq)), c2 = abs(snoise(cq * 1.9 + 4.0));
      ca = uThink * (pow(1.0 - c1, 10.0) + 0.6 * pow(1.0 - c2, 12.0)) * smoothstep(1.0, 0.3, length(bp));
    }
    vec3 through = vec3(0.03, 0.04, 0.06) + mix(uAlt, uAc, 0.5 + 0.5 * bp.y) * 0.22 * smoothstep(1.2, 0.0, length(bp - vec2(0.0, -0.5)));
    through += mix(uAc, vec3(1.0), 0.5) * ca * 1.4;
    through += uAc * (uIn * uListen * 0.35 + uOut * 0.45) * exp(-dot(bp, bp) * 1.8);
    vec3 c = mix(through, env(refl), fres);
    // a film of colour at the rim, like soap: the accent and its partner
    float film = pow(1.0 - n.z, 2.0);
    c += mix(uAc, uAlt, 0.5 + 0.5 * sin(film * 9.0 + uT * 0.4)) * film * 0.35;
    c += vec3(1.0) * tapRing(length(p - uTouch.xy)) * 0.4;
    if (uDone > 0.0) c += uOk * 0.8 * (1.0 - uDone) * exp(-pow((p.y + 1.0 - uDone * 2.4) * 5.0, 2.0));
    col = mix(col, c, smoothstep(1.0, 0.985, r) * uAppear);
  }
  o = vec4(tone(col), 1.0);
}`;

// 4. ECLIPSE: a dark planet with a glowing atmosphere. At rest a thin crescent of dawn on its rim. Your voice becomes its
// corona: rays of light round the rim, one for each pitch, rising and falling as you speak. Thinking: the light goes behind
// it, the rim becomes a full ring with a bright point racing round (a diamond ring). Speaking: sunrise, the light swings
// round to the front, with a flare on every syllable. A touch draws the light to your finger.
const ECLIPSE = HEAD + `
void main() {
  vec2 frag = gl_FragCoord.xy; vec2 p = (frag - uC) / uR; float r = length(p);
  vec3 col = vec3(0.02, 0.026, 0.045) + uAc * 0.06 * smoothstep(1.1, 0.0, length((frag / uRes - vec2(0.5, 1.08)) * vec2(1.0, 1.4)));
  float ang = atan(p.y, p.x);
  // where the light comes from: dawn below while it listens, behind it while it thinks (orbiting), up front as it speaks
  float la = -PI * 0.5 + uLean.x * 1.4 + uThink * uT * 1.4 + uSpeak * (PI * 0.62 + 0.25 * sin(uT * 0.6));
  if (uTouch.z * exp(-uTapAge * 1.3) > 0.05) la = mix(la, atan(uTouch.y, uTouch.x), sat(uTouch.z * exp(-uTapAge * 1.3)));
  vec3 L = normalize(vec3(cos(la), sin(la), mix(-0.35, 0.55, uSpeak) - uThink * 0.6));
  float facing = sat(cos(ang - la)) ;
  // the atmosphere round the rim: thin and bright on the lit side, a full ring while it thinks
  float limb = exp(-abs(r - 1.0) * (r > 1.0 ? 9.0 : 30.0));
  float lit = mix(pow(facing, 2.0) * (0.35 + 0.65 * uAppear), 0.55 + 0.45 * pow(facing, 3.0), uThink);
  float rays = 0.0;
  // the corona: your voice's 16 pitches round the rim (low at the bottom, high at the top, both sides)
  float fx = abs(ang + PI * 0.5); if (fx > PI) fx = 2.0 * PI - fx;
  float bv = band(fx / PI) * uListen;
  float rayN = 0.5 + 0.5 * snoise(vec3(cos(ang) * 3.0, sin(ang) * 3.0, uT * 0.6));
  float out1 = r - 1.0;
  if (out1 > 0.0) rays = (bv * 1.6 + uOut * 0.7 * uSpeak + uIn * uListen * 0.3) * rayN * exp(-out1 * mix(9.0, 3.2, sat(bv + uOut))) ;
  // flares with each syllable it says
  float flare = 0.0;
  for (int i = 0; i < 4; i++) { float age = uSyl[i]; if (age < 0.0 || age > 1.2) continue; flare += uSylA[i] * uSpeak * exp(-age * 3.0) * exp(-abs(r - 1.0 - age * 0.25) * 18.0); }
  // the diamond ring: a bright point racing round while it thinks
  float dpt = 0.0;
  { float a2 = uT * 2.1; vec2 dp = vec2(cos(a2), sin(a2)); dpt = uThink * exp(-length(p - dp) * 22.0) * 2.5; }
  vec3 atm = mix(uAlt, uAc, 0.6 + 0.4 * facing);
  col += atm * limb * lit * 1.6 + mix(uAc, vec3(1.0), 0.3) * rays * 0.9 + mix(uAc, vec3(1.0), 0.6) * flare + vec3(1.0) * dpt;
  col += atm * 0.25 * exp(-max(0.0, r - 1.0) * 3.0) * (lit * 0.6 + bv * 0.5 + uOut * 0.4);
  if (r < 1.0) {
    vec3 n = vec3(p, sqrt(1.0 - r * r));
    // the planet: almost black, with the faintest weather, lit only at its edge (and its front as it speaks)
    float day = sat(dot(n, L));
    float surf = 0.5 + 0.5 * fbm(n * 2.4 + vec3(uT * 0.03, 0.0, 0.0));
    vec3 pc = vec3(0.012, 0.015, 0.024) + atm * day * (0.12 + 0.18 * surf) * (0.4 + 0.6 * uSpeak);
    pc += atm * pow(1.0 - n.z, 4.0) * lit * 0.9; // the atmosphere seen through the edge
    pc += vec3(1.0) * pow(sat(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 30.0) * 0.25 * uSpeak;
    pc += vec3(1.0) * tapRing(length(p - uTouch.xy)) * 0.5;
    if (uDone > 0.0) pc += uOk * 0.5 * (1.0 - uDone) * exp(-pow((r - uDone) * 6.0, 2.0));
    col = mix(col, pc, smoothstep(1.0, 0.993, r) * uAppear);
  }
  o = vec4(tone(col), 1.0);
}`;

// 5. THREADS: the sphere drawn by threads of light (the libraries' "weaving", made fine). Sixteen threads round it, one for
// each pitch of your voice, vibrating with it like strings; the far side seen through, dimmer. Thinking: each thread tilts
// on its own axis and they braid into an armillary sphere, turning. Speaking: beads of light run along them. A touch
// parts the threads round your finger; a drag leaves them swinging.
const THREADS = HEAD + `
float threads(vec3 n, float back) {
  float s = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i), u = fi / 15.0;
    vec3 q = n;
    // thinking: each thread on its own tilted axis, turning at its own pace
    float tilt = uThink * (u - 0.5) * 2.4;
    q.yz = rot(tilt + uLean.y * 2.0) * q.yz;
    q.xz = rot(uT * (0.12 + uThink * (0.3 + u * 0.5)) * (mod(fi, 2.0) * 2.0 - 1.0) + uLean.x * 2.4) * q.xz;
    float lat = asin(clamp(q.y, -1.0, 1.0)), lon = atan(q.z, q.x);
    float base = mix(-1.25, 1.25, u) * (1.0 - uThink * 0.92);
    float amp = 0.012 + band(u) * uListen * 0.16 + uOut * uSpeak * 0.03;
    float disp = amp * sin(lon * (4.0 + mod(fi, 3.0)) + uT * (1.5 + u) + fi);
    // a touch parts them round your finger
    vec3 tp = vec3(uTouch.xy, sqrt(max(0.0, 1.0 - dot(uTouch.xy, uTouch.xy))));
    float near = exp(-dot(n - tp, n - tp) * 14.0) * uTouch.z * exp(-uTapAge * 2.0);
    disp += near * 0.16 * sign(lat - asin(clamp(tp.y, -1.0, 1.0)) + 0.001);
    float d = abs(lat - base - disp) * cos(lat * 0.6);
    float w = 0.007 + 0.006 * band(u) * uListen + 0.004 * uThink;
    float line = exp(-pow(d / w, 2.0)) + 0.25 * exp(-pow(d / (w * 5.0), 2.0));
    // beads of light running along them as it speaks
    float bead = uSpeak * pow(0.5 + 0.5 * sin(lon * 5.0 - uT * 4.0 + fi * 1.3), 12.0) * (0.4 + uOut * 1.6);
    s += line * (0.55 + band(u) * uListen * 1.3 + bead * 2.0 + uThink * 0.3) * mix(1.0, 0.28, back);
  }
  return s;
}
void main() {
  vec2 frag = gl_FragCoord.xy; vec2 p = (frag - uC) / uR; float r = length(p);
  vec3 col = room(frag, 0.55 + uIn * uListen * 0.5 + uOut * 0.5 + uThink * 0.4);
  if (r < 1.0) {
    vec3 nf = vec3(p, sqrt(1.0 - r * r)), nb = vec3(p, -nf.z);
    float f = threads(nf, 0.0), b = threads(nb, 1.0);
    vec3 c = mix(uAlt, uAc, 0.75) * b * 0.9 + mix(uAc, vec3(1.0), 0.35) * f;
    c += uAc * 0.06 * exp(-r * r * 2.0) * (1.0 + uThink * 2.0 + uOut * 2.0);
    c += glass(p, nf, 0.55) + vec3(1.0) * tapRing(length(p - uTouch.xy)) * 0.5;
    if (uDone > 0.0) c += uOk * f * (1.0 - uDone) * exp(-pow((p.y + 1.0 - uDone * 2.4) * 4.0, 2.0)) * 1.5;
    col = mix(col, c, smoothstep(1.0, 0.985, r) * uAppear);
  }
  o = vec4(tone(col), 1.0);
}`;

export const DESIGNS = [
  { key: 'silk', name: 'Silk', frag: SILK },
  { key: 'nebula', name: 'Nebula', frag: NEBULA },
  { key: 'liquid', name: 'Liquid glass', frag: LIQUID },
  { key: 'eclipse', name: 'Eclipse', frag: ECLIPSE },
  { key: 'threads', name: 'Threads', frag: THREADS },
];
