// Stardust's two shaders (the orb screen's orb while talking live, Omar 26 Oct; designed in scripts/dust-lab). One vertex
// shader places every speck of dust from a few numbers per frame, so thousands of specks cost the page nothing: the graphics
// chip does it. See engine.ts for what each input means.

export const DUST_VS = `#version 300 es
in vec4 aHome; in vec4 aRnd; in vec2 aTg;
uniform vec2 uC; uniform float uR; uniform float uT; uniform float uRot; uniform float uScale; uniform float uSz;
uniform float uIn; uniform vec4 uB0; uniform vec4 uB1; uniform vec4 uB2; uniform vec4 uB3;
uniform float uOut; uniform float uListen; uniform float uThink; uniform float uSpeak; uniform float uAppear; uniform float uDone;
uniform float uAttn; uniform float uQuiet;
uniform vec4 uSyl; uniform vec4 uSylA; uniform vec3 uTouch; uniform float uTapAge; uniform vec3 uHold; uniform vec2 uLean;
uniform float uWrite; uniform float uUnwrite; uniform float uCrisp; uniform vec2 uView; uniform float uDpr; uniform float uReduce; uniform float uSmall;
uniform vec4 uHeard; uniform vec4 uHeardA;
uniform float uBass; uniform float uMid; uniform float uHigh; uniform float uWake; uniform vec4 uImp[4]; uniform float uTwP; uniform float uCut; uniform float uBand; uniform float uHz; uniform float uKind; uniform vec2 uShift;
out float vA; out float vHot; out float vOk; out float vBack; out float vGlow; out float vWr;
#define PI 3.14159265
float band(float x) {
  float f = clamp(x, 0.0, 1.0) * 15.0; int i = int(floor(f)); float r = f - float(i);
  float b[16] = float[16](uB0.x,uB0.y,uB0.z,uB0.w,uB1.x,uB1.y,uB1.z,uB1.w,uB2.x,uB2.y,uB2.z,uB2.w,uB3.x,uB3.y,uB3.z,uB3.w);
  return mix(b[i], b[min(15, i + 1)], r);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float eio(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
vec2 bow(vec2 a, vec2 b, float bend, float t) {
  float e = eio(t); vec2 d = b - a; float L = max(length(d), 1.0);
  return mix(a, b, e) + vec2(-d.y, d.x) / L * sin(e * PI) * bend;
}
float vGlowPre(float lit, float hot, float tw) { return clamp(smoothstep(0.8, 1.0, lit) * 0.6 + hot * 0.3 + tw * 0.45, 0.0, 1.0); }
void main() {
  vec3 p = aHome.xyz; float shell = aHome.w;
  float lat = p.y;
  // currents: it doesn't turn as one ball, it flows: bands of latitude slide past each other (the inner dust less), to and
  // fro like a tide, so the streams of light keep their shape however long you talk (a shear that only grew wound them into
  // noise within a minute); the bands meander a little as they go (Omar, 26 Oct: it read as static)
  float flow = (0.6 * sin(lat * 3.6 + 1.3) + 0.25 * sin(lat * 7.9 - 0.4)) * (0.55 + 0.45 * shell) * (1.0 - uReduce);
  float shear = flow * (0.9 * sin(uT * 0.11) + 0.5 * sin(uT * 0.07 + 1.0));
  float lon0 = atan(p.z, p.x);
  // (on the horizon, thinking is weather: its bands swirl past each other, to and fro)
  float spin = uRot + shear + uThink * uHz * 0.7 * sin(lat * 5.0 + uT * 0.5) * (1.0 - uReduce);
  float lat2 = lat + 0.035 * sin(lon0 * 3.0 + uT * 0.37 + lat * 2.0) * sqrt(max(0.0, 1.0 - lat * lat)) * (1.0 - uReduce);
  float rr0 = sqrt(max(0.0, 1.0 - lat2 * lat2));
  p = vec3(cos(lon0 + spin) * rr0, lat2, sin(lon0 + spin) * rr0);
  float lonF = lon0 + shear * 1.6 + uT * 0.03; // (where the speck is along its current, for its light)
  p.yz = rot(0.38 + 0.5 * uHz) * p.yz; // (the horizon is seen from above: more of its top towards you)
  float r = shell;
  vec3 pv = p; // (seen direction, for the rim)
  // thinking: the sphere's dust settles into a spinning galaxy, each speck in its own turn (so it flows, never snaps):
  // spread from the core out, the inner ones turning faster, gathered into two arms, seen from a little above
  float gk = sm(uThink * 1.35 - aRnd.z * 0.35) * (1.0 - uReduce) * (1.0 - uHz);
  float rg = pow(aRnd.x, 0.75) * 1.05 + 0.03;
  float ga = atan(aHome.z, aHome.x) - uT * 0.9 / (rg + 0.35);
  ga += 0.42 * sin(2.0 * (ga + log(rg) * 3.2));
  if (gk > 0.001) {
    vec3 g = vec3(cos(ga) * rg, (aRnd.y - 0.5) * 0.06 * (1.0 - rg * 0.5), sin(ga) * rg);
    g.yz = rot(0.5) * g.yz;
    p = mix(p * r, g, gk); r = 1.0;
  }
  // your voice: the dust swells where your voice is (low voice low in it, high voice high), shimmering
  float bv = band((lat + 1.0) * 0.5) * uListen;
  r *= 1.0 + (bv * 0.22 * (0.55 + 0.45 * sin(uT * 7.0 + aRnd.y * 30.0)) + uIn * uListen * 0.03) * (1.0 - uReduce);
  float hot = 0.0;
  // your voice: each syllable you say is a ring of light drawn in from its skin to its heart (it takes your words in)
  float heardHot = 0.0;
  for (int i = 0; i < 4; i++) { float age = uHeard[i]; if (age < 0.0 || age > 1.1) continue; float d = shell - (1.05 - age * 0.95); float w = exp(-d * d * 70.0) * uHeardA[i] * (1.0 - age / 1.1) * uListen; r *= 1.0 - w * 0.07 * (1.0 - uReduce); heardHot += w; }
  // weight: big slow forms swell and settle under the dust (heaviest in the low voice), while fine fast ripples ride over
  // them with the voice itself; the inner dust (its core) swells most with the low voice, on its own heavy spring
  float form = (vn(aHome.xyz * 1.5 + vec3(uT * 0.05, -uT * 0.04, uT * 0.03)) - 0.5) * (1.0 - gk) * (1.0 - uReduce);
  r *= 1.0 + form * (0.07 + uBass * 0.12);
  r *= 1.0 + uBass * mix(0.13, 0.045, smoothstep(0.6, 0.95, shell)) * (1.0 - uReduce);
  float rip = sin(shell * 34.0 + lat * 15.0 + lonF * 5.0 - uT * 8.5 + form * 9.0);
  r *= 1.0 + uMid * 0.022 * rip * (0.5 + form) * (1.0 - uReduce);
  // a tap: a shockwave of light travels round the sphere from where you touched it, measured along its surface
  vec3 vd = normalize(pv + vec3(0.0, 0.0, 1e-5)); float impHot = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = uImp[i].w; if (age < 0.0 || age > 1.8) continue;
    float ang = acos(clamp(dot(vd, uImp[i].xyz), -1.0, 1.0));
    float d = ang - age * 2.0; float fade = 1.0 - age / 1.8;
    float w = exp(-d * d * 16.0) * fade * fade * (1.0 - uReduce);
    r *= 1.0 + w * 0.1 * (1.0 - uReduce); hot += w * 1.2; impHot += w;
  }
  // on the horizon: each syllable runs as a ripple of light sideways along its rim, from the middle out (its voice) or
  // from the edges in (yours)
  float rimW = 0.0;
  if (uHz > 0.01) {
    float rimK = pow(1.0 - abs(pv.z), 2.5) * uHz * (1.0 - uReduce);
    for (int i = 0; i < 4; i++) {
      float a1 = uSyl[i]; if (a1 >= 0.0 && a1 < 1.4) { float d = abs(pv.x) - a1 * 0.85; rimW += exp(-d * d * 28.0) * uSylA[i] * (1.0 - a1 / 1.4) * uSpeak * rimK; }
      float a2 = uHeard[i]; if (a2 >= 0.0 && a2 < 1.2) { float d = abs(pv.x) - (1.0 - a2 * 0.85); rimW += exp(-d * d * 28.0) * uHeardA[i] * (1.0 - a2 / 1.2) * uListen * rimK; }
    }
    r *= 1.0 + rimW * 0.035; hot += rimW * 1.4;
  }
  // its voice: a wave of light running out through the dust with each syllable
  for (int i = 0; i < 4; i++) { float age = uSyl[i]; if (age < 0.0 || age > 1.4) continue; float d = shell - age * 1.1; float w = exp(-d * d * 60.0) * uSylA[i] * (1.0 - age / 1.4) * uSpeak; r *= 1.0 + w * 0.06 * (1.0 - uReduce); hot += w; }
  r *= 1.0 + uOut * uSpeak * 0.035;
  // appearing: it opens out of the orb it takes over from, from just inside its skin out to its own, each speck in its
  // turn and brightest as it arrives (the beads open into dust), never a haze wider than the orb
  float ap = sm((uAppear - aRnd.z * 0.45) / 0.55);
  // waking: it gathers in to a bright core and opens again (once each time it turns to listen; ~0.9 s, calm)
  float wk = uWake >= 0.0 ? sin(clamp(uWake / 0.9, 0.0, 1.0) * PI) * (1.0 - uReduce) : 0.0;
  vec3 q = p * r * uScale * (1.0 - wk * 0.14 * (0.4 + 0.6 * shell));
  q *= mix(0.72 + aRnd.x * 0.2, 1.0, ap);
  float persp = 1.0 / (1.0 - q.z * 0.28);
  vec2 s = q.xy * persp;
  // a finger held on it: the dust nearby leans towards it
  vec2 hd = uHold.xy - s; float hdd = dot(hd, hd);
  s += hd * uHold.z * 0.22 * exp(-hdd * 5.0);
  // a tap: the dust scatters from your finger and swirls back
  vec2 td = s - uTouch.xy; float tdd = dot(td, td);
  float push = uTouch.z * exp(-uTapAge * 2.0) * sin(min(uTapAge * 6.0, PI) * 0.5) * (1.0 - uReduce);
  s += normalize(td + 1e-4) * push * 0.35 * exp(-tdd * 9.0);
  s = rot(uTouch.z * exp(-uTapAge * 1.6) * 0.6 * exp(-tdd * 6.0) * (1.0 - uReduce)) * s;
  // a drag: the outer dust lags behind the finger more than the inner
  s += uLean * (0.4 + 0.6 * shell) * (0.7 + 0.6 * aRnd.y);
  vec2 px = uC + s * uR;
  // writing: the writer specks fly out (each in its turn, left to right) to the words, and back
  float wr = 0.0;
  if (aTg.x >= 0.0) {
    vec2 tgt = vec2(aTg.x, uView.y / uDpr - aTg.y) * uDpr + uShift * uKind;
    float dl = (aTg.x * uDpr / uView.x) * 0.5 + aRnd.z * 0.25;
    float k = sm((uWrite - dl) / 0.5) * (1.0 - sm((uUnwrite - aRnd.x * 0.45) / 0.55));
    if (k > 0.0) px = bow(px, tgt, (aRnd.y - 0.5) * 80.0 * uDpr * (1.0 - uReduce), uReduce > 0.5 ? step(0.5, k) : k);
    wr = k;
  }
  gl_Position = vec4(px / uView * 2.0 - 1.0, 0.0, 1.0);
  float depth = mix(clamp((q.z / max(r, 0.3) + 1.0) * 0.5, 0.0, 1.0), 0.75 + 0.25 * q.z, gk);
  vBack = 1.0 - depth;
  // light drifting over the dust in slow clouds (so you can follow it turn); thinking's spiral arms
  // (light in long filaments along the currents, drifting with them, not blotches: streams you can follow)
  vec3 hp = vec3(lat * 5.5, cos(lonF) * 1.2, sin(lonF) * 1.2);
  float cloud = vn(hp * 1.3 + vec3(uT * 0.05, 0.0, uT * 0.09)) * 0.7 + vn(hp * 3.1 - uT * 0.15) * 0.3;
  float arms = 0.5 + 0.5 * cos(2.0 * (ga + log(rg) * 3.2));
  float lit = mix(smoothstep(0.44, 0.74, cloud), 0.14 + 0.86 * pow(arms, 2.2), gk);
  lit = max(lit, max(bv * 0.7, heardHot * 1.0));
  // its skin: specks seen edge-on glow brighter, so it reads as a sphere of light with depth, not a flat disc
  float rim = pow(1.0 - abs(pv.z), 2.5) * (1.0 - gk) * (0.35 + 0.65 * smoothstep(0.85, 0.95, shell));
  // a few specks twinkle, the larger ones most
  float tw = pow(0.5 + 0.5 * sin(uT * (1.3 + aRnd.y * 2.6) + uTwP * (0.5 + aRnd.y) + aRnd.x * 40.0), mix(14.0, 6.0, uHigh)) * (aRnd.w > 2.4 ? 1.0 : 0.35 + uHigh * 0.4) * (1.0 - uReduce);
  // the far side small and faint, the near side crisp: depth
  gl_PointSize = (1.0 + vGlowPre(lit, hot, tw) * 0.7) * max(1.0 + 0.4 * uSmall, aRnd.w * uSz * mix(mix(0.55, 1.05, depth), 1.0, wr) * (1.0 + hot * 0.5 + tw * 0.6) * (1.0 + bv * 0.4 * (1.0 - uReduce)) * mix(mix(0.5, 1.2, lit), 1.0, wr));
  // (writing, every speck is the same fine size whatever the orb's: the outline and the words read cleanly)
  gl_PointSize = mix(gl_PointSize, clamp(aRnd.w, 0.8, 1.6) * uDpr * mix(1.15, 0.9, uKind), wr);
  float a0 = mix(0.05, 1.0, pow(depth, 1.6)) * (0.09 + 0.91 * lit) + rim * 0.3;
  // (once the words are written in crisp text, their dust steps back to a faint shimmer behind them)
  vA = mix(a0, mix(0.95, 0.22, uCrisp), wr) * ap * (1.0 + 1.6 * ap * (1.0 - ap) * (1.0 - uReduce)) * (1.0 + bv * 0.35 + uIn * uListen * 0.15 + gk * 0.9 + uAttn * 0.35 + tw * 0.8) * (1.0 - 0.45 * uQuiet) * (1.0 + 0.7 * uSmall);
  // only the hottest specks get a halo of light (the glow is a highlight, never a fog over the whole orb)
  vGlow = clamp(smoothstep(0.8, 1.0, lit) * 0.6 + hot * 0.3 + tw * 0.45 + wk * (1.0 - shell) * 1.5, 0.0, 1.0) * (1.0 - wr);
  // (a card it writes: at the moment the real card appears, its dust flashes towards white and steps back)
  float flash = uKind * uCrisp * (1.0 - uCrisp) * 4.0 * wr;
  vA *= 1.0 + flash * 0.9;
  if (uKind > 0.5) vA = mix(vA, vA * mix(1.0, 0.06 / 0.22, uCrisp), wr);
  vWr = wr * uKind;
  vA *= (wr > 0.0 ? 1.0 : smoothstep(uCut + uBand * 0.5, uCut - uBand * 0.5, float(gl_VertexID))) * (1.0 + wk * (1.0 - smoothstep(0.5, 1.0, shell)) * 2.0) * (1.0 + impHot * 2.2);
  vHot = hot + heardHot * 0.8 + wk * 0.5 + lit * lit * 0.35 + gk * exp(-length(q.xz) * 4.0) * 1.6 + bv * 0.35 + uAttn * 0.25 + flash * 1.4;
  // logged: the success colour runs up through it
  vOk = uDone > 0.0 ? exp(-pow((lat + 1.0 - uDone * 2.4) * 3.0, 2.0)) * (1.0 - uDone) : 0.0;
}`;

export const DUST_FS = `#version 300 es
precision highp float;
in float vA; in float vHot; in float vOk; in float vBack; in float vGlow; in float vWr;
uniform vec3 uAc; uniform vec3 uAlt; uniform vec3 uOk; uniform float uDark; uniform float uMood;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r = length(c);
  if (r > 1.0) discard;
  // a plain speck is a soft dot; a hot one is a small bright core in a wide faint halo (it is drawn bigger for it)
  float core = smoothstep(mix(1.0, 0.45, vGlow), 0.0, r), glow = exp(-r * r * mix(3.0, 5.5, vGlow));
  // dark: light added (overlaps glow); light theme: deeper colour laid over the page
  vec3 col = mix(mix(uAc, vec3(1.0), 0.18 * uDark), uAlt, vBack * 0.55);
  col = mix(col, mix(vec3(1.0), uAc * 0.6, 1.0 - uDark), clamp(vHot * 0.5, 0.0, 0.7));
  // the mood of what it says, in its own palette: glad leans to its second colour and brighter, serious to a deeper accent
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, uMood > 0.0 ? mix(uAlt, vec3(1.0), 0.25 * uDark) * (0.7 + lum) : uAc * 0.55, clamp(abs(uMood), 0.0, 1.0) * 0.35);
  col = mix(col, uOk, clamp(vOk, 0.0, 1.0));
  // (a card in dust takes the colour of the card's own words)
  col = mix(col, uDark > 0.5 ? vec3(1.0, 0.97, 0.95) : vec3(0.1, 0.08, 0.1), clamp(vWr * 0.8, 0.0, 1.0));
  float a = clamp(vA * (core * mix(0.6, 0.75, vGlow) + glow * mix(0.4, 0.5, vGlow)) * mix(1.0, 1.6, 1.0 - uDark), 0.0, 1.0);
  o = vec4(col * a, a);
}`;
