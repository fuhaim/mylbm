/* ==========================================================================
   Nur3D hero -- the showpiece scene. Raw WebGL2, hand-written shaders.
   ========================================================================== */
(function (root) {
'use strict';
var N = root.Nur, M = N.M, G = N.GLSL, PI = N.PI, TAU = N.TAU, lin = N.lin, mix = N.mix, clamp = N.clamp;

/* ---------- shaders ---------- */
var FS_TRI = G.head + 'out vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';

var FBMN = 'float fbmN(vec2 p, float oct){ float s = 0.0, a = 0.5; for (int i = 0; i < 8; i++) { if (float(i) >= oct) break; s += a * vnoise(p); p = p * 2.03 + vec2(11.7, 3.1); a *= 0.5; } return s; }';

var NOISE3 = 'float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); vec2 o = i.xy + i.z * 17.0, o2 = i.xy + (i.z + 1.0) * 17.0;' +
  ' float a = hash21(o), b = hash21(o + vec2(1.0, 0.0)), c = hash21(o + vec2(0.0, 1.0)), d = hash21(o + vec2(1.0, 1.0)), a2 = hash21(o2), b2 = hash21(o2 + vec2(1.0, 0.0)), c2 = hash21(o2 + vec2(0.0, 1.0)), d2 = hash21(o2 + vec2(1.0, 1.0));' +
  ' return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(a2, b2, f.x), mix(c2, d2, f.x), f.y), f.z); }' +
  ' float fbm3(vec3 p, float oct){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { if (float(i) >= oct) break; s += a * vn3(p); p = p * 2.07 + vec3(3.1, 7.7, 1.9); a *= 0.5; } return s; }';

var HGT = 'vec2 hUV(vec2 xz){ float u = (xz.x + 180.0) / 360.0; float s = clamp((-64.0 - xz.y) / 290.0, 0.0, 1.0); float v = (-0.35 + sqrt(0.1225 + 2.6 * s)) / 1.3; return (vec2(clamp(u, 0.0, 1.0) * 360.0, clamp(v, 0.0, 1.0) * 220.0) + 0.5) / vec2(361.0, 221.0); }';

var CLOUD_FS = [G.head, 'in vec2 vUv; out vec4 o;',
  'uniform vec3 uCR, uCU, uCF, uCam, uSunD, uSunC, uAmb, uHorC; uniform float uTanH, uAsp, uShY, uTime, uDay, uCStep, uCOct;',
  G.noise, NOISE3,
  'const float CY0 = 24.0, CY1 = 64.0;',
  'float cdens(vec3 p, float oct){',
  '  float hg = clamp((p.y - CY0) / (CY1 - CY0), 0.0, 1.0);',
  '  vec3 q = vec3(p.x * 0.020 + uTime * 0.020, p.y * 0.040, p.z * 0.020 + uTime * 0.007);',
  '  float b = fbm3(q, oct);',
  '  float shape = smoothstep(0.0, 0.22, hg) * (1.0 - smoothstep(0.50, 1.0, hg));',
  '  return clamp((b - 0.50) * 3.8, 0.0, 1.0) * shape;',
  '}',
  'void main(){',
  '  vec2 nd = vUv * 2.0 - 1.0;',
  '  vec3 rd = normalize(uCF + uCR * (nd.x * uTanH * uAsp) + uCU * ((nd.y - uShY) * uTanH));',
  '  if (rd.y < 0.012) { o = vec4(0.0); return; }',
  '  float t0 = min((CY0 - uCam.y) / rd.y, 900.0), t1 = min((CY1 - uCam.y) / rd.y, 1000.0);',
  '  float dt = (t1 - t0) / max(uCStep, 1.0);',
  '  float jit = hash21(gl_FragCoord.xy);',
  '  float T = 1.0; vec3 L = vec3(0.0);',
  '  float cs = max(dot(rd, normalize(uSunD)), 0.0); float phase = 0.55 + 1.6 * pow(cs, 8.0) + 0.6 * pow(cs, 40.0);',
  '  for (int i = 0; i < 48; i++) {',
  '    if (float(i) >= uCStep) break;',
  '    vec3 p = uCam + rd * (t0 + (float(i) + jit) * dt);',
  '    float d = cdens(p, uCOct);',
  '    if (d > 0.01) {',
  '      float od = d + cdens(p + normalize(uSunD) * 9.0, max(uCOct - 1.0, 2.0)) + cdens(p + normalize(uSunD) * 20.0, 2.0);',
  '      float li = exp(-od * 2.4), powder = 1.0 - exp(-d * 4.0);',
  '      vec3 c = uAmb + uSunC * li * phase * (0.5 + 0.5 * powder);',
  '      float ex = exp(-d * dt * 0.07);',
  '      L += T * (1.0 - ex) * c; T *= ex;',
  '      if (T < 0.02) break;',
  '    }',
  '  }',
  '  float fade = smoothstep(0.012, 0.16, rd.y);',
  '  L = mix(L, uHorC * (1.0 - T), 1.0 - fade);',
  '  o = vec4(L, 1.0 - T) * fade; }'].join('\n');

var BG_FS = [G.head, 'in vec2 vUv; out vec4 o;',
  'uniform vec2 uRes, uCenter, uPar, uSun; uniform float uTime, uHor, uStars, uDay, uSunR, uMoon, uOct, uFlip;',
  'uniform vec3 uTop, uHorC, uGlow, uPat, uSunC; uniform sampler2D uCloud;',
  G.noise, FBMN, G.pattern,
  'void main(){',
  '  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y; if (uFlip > 0.5) uv.y = 2.0 * uHor - uv.y;',
  '  vec2 p = (uv - 0.5) * vec2(asp, 1.0);',
  '  float h = uv.y - uHor;',
  '  float t = clamp(h / 0.9, 0.0, 1.0);',
  '  vec3 col = mix(uHorC, uTop, pow(t, 0.62));',
  '  if (h < 0.0) col = uHorC * (1.0 + h * 0.5);',
  '  vec2 hp = (uv - uCenter) * vec2(asp, 1.0); float hd = length(hp);',
  '  col += uGlow * (0.55 * exp(-hd*hd*4.2) + 0.12 * exp(-hd*1.7) + 0.20 * exp(-pow(abs(hd - 0.40), 2.0) * 220.0)) * mix(0.72, 1.0, uDay);',
  '  float ang = atan(hp.y, hp.x);',
  '  float rn = vnoise(vec2(ang * 2.2, uTime * 0.03));',
  '  float rays = pow(0.5 + 0.5 * sin(ang * 13.0 + rn * 5.0 + uTime * 0.06), 6.0);',
  '  col += uGlow * rays * exp(-hd * 1.4) * 0.17;',
  '  vec2 g = uv * vec2(asp, 1.0) * 72.0 + uPar * 14.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;',
  '  float r = hash21(id); vec2 off = (vec2(hash21(id + 7.1), hash21(id + 13.3)) - 0.5) * 0.6;',
  '  float star = smoothstep(0.045 + 0.09 * r, 0.0, length(f - off)) * step(0.955, r);',
  '  star *= 0.55 + 0.45 * sin(uTime * (0.8 + r * 2.5) + r * 40.0);',
  '  col += vec3(0.85, 0.95, 1.0) * star * uStars * smoothstep(0.0, 0.3, h) * 1.7;',
  '  float nb = fbm(p * 1.6 + uPar * 0.35 + vec2(uTime * 0.006, 0.0)); float nb2 = fbm(p * 3.1 - uPar * 0.2 + 7.0);',
  '  col += mix(vec3(0.02, 0.17, 0.13), vec3(0.20, 0.12, 0.02), nb2) * pow(nb, 2.4) * 1.1 * smoothstep(-0.05, 0.35, h) * (1.0 - uDay * 0.8);',
  '  float pat = starLines(p * 3.0 + uPar * 0.55 + vec2(0.0, uTime * 0.004), 0.010);',
  '  col += uPat * pat * smoothstep(-0.02, 0.35, h) * (0.30 + 0.70 * exp(-hd * 0.9)) * 0.09;',
  '  vec2 sd = (uv - uSun) * vec2(asp, 1.0); float sl = length(sd);',
  '  vec4 cl = texture(uCloud, uv); col = col * (1.0 - cl.a) + cl.rgb;',
  '  float R0 = uSunR, disc = smoothstep(R0, R0 - 0.004, sl);',
  '  vec2 cd = sd - vec2(R0 * 0.50, R0 * 0.28); float cut = smoothstep(R0 * 0.90, R0 * 0.90 - 0.004, length(cd));',
  '  float body = mix(disc, disc * (1.0 - cut), uMoon);',
  '  col += uSunC * (body * 1.6 + exp(-sl * sl * 38.0) * 0.55 + exp(-sl * 5.0) * 0.12) * smoothstep(-0.01, 0.04, h) * (1.0 - cl.a * 0.92) * (1.0 - uFlip);',
  '  float mw = exp(-pow((p.y * 0.75 - p.x * 0.40 - 0.05) / 0.30, 2.0)) * fbmN(p * 5.0 + 3.0, uOct) * smoothstep(0.02, 0.22, h) * (1.0 - uDay);',
  '  col += vec3(0.30, 0.42, 0.55) * mw * 0.16;',
  '  float bird = 0.0;',
  '  for (int k = 0; k < 7; k++) { float fk = float(k); vec2 bp = vec2(fract(uTime * 0.016 + fk * 0.151) * 1.5 - 0.25, 0.80 + 0.05 * sin(fk * 2.3 + uTime * 0.25) + fk * 0.008); vec2 bd = (uv - bp) * vec2(asp, 1.0) * 40.0; float wing = 0.30 + 0.30 * sin(uTime * 7.0 + fk * 1.7); bird += smoothstep(0.22, 0.04, abs(bd.y - abs(bd.x) * wing)) * step(abs(bd.x), 1.0); }',
  '  col *= 1.0 - clamp(bird, 0.0, 1.0) * 0.6 * uDay * smoothstep(0.03, 0.12, h);',
  '  float sPh = fract(uTime / 11.0), sTt = sPh / 0.09, sGo = step(sPh, 0.09); vec2 sP2 = uv * vec2(asp, 1.0), sO = vec2((0.10 + 0.55 * fract(floor(uTime / 11.0) * 0.618)) * asp, 0.93), sDr = normalize(vec2(1.0, -0.5)), sRv = sP2 - (sO + sDr * sTt * 0.65);',
  '  float sAl = -dot(sRv, sDr), sPe = abs(sRv.x * sDr.y - sRv.y * sDr.x);',
  '  col += vec3(0.85, 0.93, 1.0) * smoothstep(0.0035, 0.0, sPe) * smoothstep(0.0, 0.012, sAl) * exp(-sAl * 16.0) * step(sAl, 0.3) * sGo * (1.0 - uDay) * smoothstep(0.02, 0.10, h) * 2.4;',
  '  o = vec4(col, 1.0);',
  '}'].join('\n');

var LIT_VS = function (column) {
  return [G.head.replace('precision highp float;\n', 'precision highp float;\n' + (column ? '#define COLUMN\n' : '')),
  'layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in float aPart;',
  'layout(location=4) in vec4 iA; layout(location=5) in vec4 iB; layout(location=6) in vec4 iC; layout(location=7) in vec4 iCol;',
  'uniform mat4 uVP; uniform mat4 uModel; uniform vec4 uMir; uniform sampler2D uMask; uniform float uKind, uAux, uTime;',
  'out vec3 vW; out vec3 vN; out vec2 vUV; out vec3 vL; out vec4 vCol; out vec4 vC;',
  'mat3 rot(vec3 r){ float cy=cos(r.x), sy=sin(r.x), cx=cos(r.y), sx=sin(r.y), cz=cos(r.z), sz=sin(r.z);',
  '  mat3 Y=mat3(cy,0.0,-sy, 0.0,1.0,0.0, sy,0.0,cy); mat3 X=mat3(1.0,0.0,0.0, 0.0,cx,sx, 0.0,-sx,cx); mat3 Z=mat3(cz,sz,0.0, -sz,cz,0.0, 0.0,0.0,1.0);',
  '  return Y*X*Z; }',
  'void main(){',
  '  vec3 p = aPos; vec3 n = aNor;',
  '  if (uKind > 2.5 && uKind < 3.5) p.z += smoothstep(0.05, 0.75, textureLod(uMask, aUV, 3.0).a) * uAux;',
  '#ifdef COLUMN',
  '  float hg = iC.x; float sg = hg < 0.0 ? -1.0 : 1.0;',
  '  p.xz *= iA.w; p.y = aPart < 0.5 ? p.y * hg : p.y * sg * iA.w + hg; n.y *= sg;',
  '#else',
  '  p *= iA.w;',
  '#endif',
  '  mat3 R = rot(iB.xyz); p = R * p + iA.xyz; n = R * n;',
  '  vec4 w = uModel * vec4(p, 1.0); vec3 nw = mat3(uModel) * n;',
  '  if (uMir.x > 0.5) { w.y = 2.0 * uMir.y - w.y; nw.y = -nw.y; float dd = uMir.y - w.y; w.x += (0.018 + 0.0045 * dd) * sin(w.y * 6.5 + w.z * 0.9 + uTime * 1.35); }',
  '  vW = w.xyz; vN = nw; vUV = aUV; vL = aPos; vCol = iCol; vC = iC;',
  '  gl_Position = uVP * w;',
  '}'].join('\n');
};

var LIT_FS = [G.head, 'in vec3 vW; in vec3 vN; in vec2 vUV; in vec3 vL; in vec4 vCol; in vec4 vC; out vec4 oCol;',
  'uniform vec3 uCam; uniform float uTime, uKind, uFogK, uAux, uClip, uCC; uniform vec4 uMat, uMir; uniform mat4 uModel; uniform sampler2D uMask;',
  'uniform vec3 uKeyD, uKeyC, uFillD, uFillC, uRimD, uRimC, uAmbT, uAmbB, uSkyT, uSkyH, uGndC, uSoftA, uSoftB, uFogC;',
  G.aces, G.pattern,
  'float box(vec3 r, vec3 c, vec3 ref, vec2 e){ float a = dot(r, c); if (a <= 0.0) return 0.0; vec3 u = normalize(cross(ref, c)); vec3 v = cross(c, u);',
  '  vec2 q = vec2(dot(r, u), dot(r, v)) / a; vec2 d = abs(q) / e; return smoothstep(1.0, 0.82, max(d.x, d.y)); }',
  'vec3 env(vec3 r, float rough){',
  '  float y = r.y; vec3 sky = mix(uSkyH, uSkyT, smoothstep(0.0, 0.75, y)); vec3 gnd = mix(uSkyH * 0.45, uGndC, smoothstep(0.0, -0.55, y));',
  '  vec3 c = mix(gnd, sky, smoothstep(-0.10, 0.10, y)); float soft = mix(1.0, 0.22, rough);',
  '  float b1 = box(r, normalize(vec3(-0.55, 0.72, 0.55)), vec3(0.0, 1.0, 0.0), vec2(0.55, 0.36));',
  '  float b2 = box(r, normalize(vec3(0.85, 0.25, 0.25)), vec3(0.0, 1.0, 0.0), vec2(0.13, 0.95));',
  '  float b3 = box(r, normalize(vec3(0.0, 1.0, -0.15)), vec3(1.0, 0.0, 0.0), vec2(0.75, 0.12));',
  '  float b4 = box(r, normalize(vec3(-0.9, 0.15, -0.3)), vec3(0.0, 1.0, 0.0), vec2(0.10, 0.7));',
  '  c += (uSoftA * (b1 * 5.0 + b3 * 3.4) + uSoftB * (b2 * 3.0 + b4 * 2.2)) * soft;',
  '  c += uSoftA * pow(max(dot(r, normalize(vec3(0.12, 0.14, 1.0))), 0.0), 40.0) * 1.6 * soft;',
  '  return c; }',
  'float D_GGX(float NoH, float a){ float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (3.14159265 * d * d); }',
  'vec3 lightTerm(vec3 N, vec3 V, vec3 L, vec3 lc, vec3 alb, vec3 f0, float rough, float metal){',
  '  vec3 H = normalize(V + L); float NoL = max(dot(N, L), 0.0), NoV = max(dot(N, V), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);',
  '  float a = max(rough * rough, 0.025); vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);',
  '  float k = a * 0.5; float vis = 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k) + 1e-4);',
  '  vec3 spec = D_GGX(NoH, a) * vis * F; vec3 diff = (1.0 - F) * (1.0 - metal) * alb / 3.14159265;',
  '  return (diff + spec) * lc * NoL; }',
  'void main(){',
  '  if (vL.x > uClip) discard;',
  '  if (uKind > 4.5) { float sa = textureLod(uMask, vUV - vec2(0.004, 0.05), 4.0).a * vCol.a; if (sa < 0.01) discard; oCol = vec4(vCol.rgb * sa, sa); return; }',
  '  vec3 alb = vCol.rgb; float rough = uMat.y, metal = uMat.x, emis = uMat.z, ma = 1.0, cg = 1.0;',
  '  bool isT = uKind > 2.5 && uKind < 3.5, isA = uKind > 3.5 && uKind < 4.5;',
  '  if (isT) { ma = texture(uMask, vUV).a; if (ma < 0.04) discard; alb *= mix(vec3(1.22, 1.16, 1.04), vec3(0.74, 0.56, 0.40), smoothstep(0.30, 0.82, vUV.y)); }',
  '  if (isA) { cg = clamp(vL.y / uAux, 0.0, 1.0); alb = mix(vCol.rgb * 0.12, vCol.rgb, cg); }',
  '  if (uKind > 0.5 && uKind < 1.5) {',
  '    float r = length(vL.xz);',
  '    if (abs(vL.y) > 0.085 && r < 0.93) {',
  '      float a = atan(vL.z, vL.x); float tri = abs(fract(a * 8.0 / 6.2831853) - 0.5) * 2.0;',
  '      float rs = mix(0.64, 0.30, tri); float inStar = smoothstep(0.025, -0.025, r - rs);',
  '      float rim = smoothstep(0.022, 0.0, abs(r - 0.84) - 0.018); float ring2 = smoothstep(0.016, 0.0, abs(r - 0.70) - 0.010);',
  '      float eng = max(max(inStar * 0.95, rim), ring2 * 0.75); alb = mix(alb, alb * 0.42, eng); rough = mix(rough, rough + 0.30, eng); }',
  '  }',
  '  vec3 N = normalize(vN);',
  '  float bev = 0.0; if (isT) { vec2 e = vec2(5.0 / 2048.0, 5.0 / 256.0); float gx = textureLod(uMask, vUV + vec2(e.x, 0.0), 3.0).a - textureLod(uMask, vUV - vec2(e.x, 0.0), 3.0).a, gy = textureLod(uMask, vUV + vec2(0.0, e.y), 3.0).a - textureLod(uMask, vUV - vec2(0.0, e.y), 3.0).a;',
  '    bev = clamp(length(vec2(gx, gy)) * 5.0, 0.0, 1.0); N = normalize(mat3(uModel) * normalize(vec3(-gx * 3.0, gy * 3.0, 1.0))); }',
  '  vec3 V = normalize(uCam - vW); float NoV = max(dot(N, V), 1e-3);',
  '  vec2 eq = vL.xy * 1.15; float eg = max(starLines(eq, 0.026), 0.6 * starLines(eq * 2.0 + 0.37, 0.045)) * step(1.5, uKind) * step(0.225, abs(vL.z));',
  '  alb = mix(alb, alb * vec3(0.62, 0.55, 0.50), eg); rough = mix(rough, 0.55, eg);',
  '  vec3 dpx = dFdx(vW), dpy = dFdy(vW), br1 = cross(dpy, N), br2 = cross(N, dpx); float bdet = dot(dpx, br1), bh = -eg * 0.012;',
  '  float bhx = dFdx(bh), bhy = dFdy(bh); if (abs(bdet) > 1e-12) N = normalize(abs(bdet) * N - sign(bdet) * (bhx * br1 + bhy * br2));',
  '  vec3 f0 = mix(vec3(0.04), alb, metal); vec3 col = vec3(0.0);',
  '  col += lightTerm(N, V, normalize(uKeyD), uKeyC, alb, f0, rough, metal);',
  '  col += lightTerm(N, V, normalize(uFillD), uFillC, alb, f0, rough, metal);',
  '  col += lightTerm(N, V, normalize(uRimD), uRimC, alb, f0, rough, metal);',
  '  col += mix(uAmbB, uAmbT, N.y * 0.5 + 0.5) * alb * (1.0 - metal);',
  '  vec3 R = reflect(-V, N); vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NoV, 5.0);',
  '  col += env(R, rough) * Fe * mix(1.0, 0.65, rough) * (isT ? 0.4 : 1.0);',
  '  if (uCC > 0.5 && !isT) {',
  '    vec3 Ng = normalize(vN); float Fc = 0.04 + 0.96 * pow(1.0 - max(dot(Ng, V), 1e-3), 5.0);',
  '    vec3 ccs = env(reflect(-V, Ng), 0.06) * Fc + lightTerm(Ng, V, normalize(uKeyD), uKeyC, vec3(0.0), vec3(0.04), 0.07, 1.0) + lightTerm(Ng, V, normalize(uFillD), uFillC, vec3(0.0), vec3(0.04), 0.07, 1.0) * 0.6;',
  '    col = col * (1.0 - 0.95 * Fc) + ccs * 0.95;',
  '    if (uCC > 1.5) {',
  '      vec3 cell = floor(vL * 36.0); float r1 = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453), r2 = fract(r1 * 91.7 + 0.31), r3 = fract(r2 * 57.3 + 0.77);',
  '      vec3 fn = normalize(N + (vec3(r1, r2, r3) - 0.5) * 1.1), hk2 = normalize(V + normalize(uKeyD)), hf2 = normalize(V + normalize(uFillD));',
  '      col += step(0.78, fract(r1 * 13.7 + r3 * 5.1)) * (uKeyC * pow(max(dot(fn, hk2), 0.0), 240.0) + uFillC * pow(max(dot(fn, hf2), 0.0), 240.0)) * 0.8;',
  '    }',
  '  }',
  '  col += alb * (emis + vC.y);',
  '  if (isT) { float d = (vUV.x + vUV.y * 0.22 - (fract(uTime * 0.085) * 1.7 - 0.35)) * 7.0; col += vec3(1.0, 0.90, 0.68) * exp(-d * d) * (0.5 + 2.6 * bev); }',
  '  float alpha = uMat.w * (isT ? smoothstep(0.35, 0.65, ma) : 1.0) * (isA ? pow(cg, 1.1) * 0.9 : 1.0);',
  '  float dq = 1.0; if (uMir.x > 0.5) { if (vW.y > uMir.y + 0.015) discard; dq = min((uMir.y - vW.y) * 0.03125, 1.0); }',
  '  float fd = length(vW - uCam); col = mix(col, uFogC, clamp(1.0 - exp(-fd * uFogK), 0.0, 0.8) * 0.45);',
  '#ifdef HDR',
  '  oCol = uMir.x > 0.5 ? vec4(col, dq) : vec4(col * (isT ? 1.0 : alpha), alpha);',
  '#else',
  '  oCol = uMir.x > 0.5 ? vec4(pow(aces(col), vec3(1.0 / 2.2)), dq) : vec4(pow(aces(col), vec3(1.0 / 2.2)) * (isT ? 1.0 : alpha), alpha);',
  '#endif',
  '}'].join('\n');

var TER_FS = [G.head, 'in vec3 vW; in vec3 vN; out vec4 oCol;',
  'uniform vec3 uCam, uKeyD, uKeyC, uAmbT, uAmbB, uHaze2, uHorC, uSunC, uSunD, uLd; uniform float uTime, uDay, uFogK, uOct, uShore, uFade, uShSteps; uniform vec4 uMir; uniform sampler2D uHgt;',
  G.noise, FBMN, G.aces, HGT,
  'float hAt(vec2 xz){ return textureLod(uHgt, hUV(xz), 0.0).r; }',
  'float shadowT(vec3 p, vec3 L, float steps){ float res = 1.0, t = 0.7; for (int i = 0; i < 40; i++) { if (float(i) >= steps) break; vec3 q = p + L * t; if (q.y > 70.0) break; res = min(res, 6.0 * (q.y - hAt(q.xz)) / t); t += max(1.0, t * 0.14); } return clamp(res, 0.0, 1.0); }',
  'void main(){',
  '  bool mr = uMir.x > 0.5; vec3 pw = vW; if (mr) pw.y = 2.0 * uMir.y - pw.y;',
  '  vec2 xz = pw.xz; float h = pw.y - uShore, d = length(vW - uCam);',
  '  float n1 = fbmN(xz * 0.045, uOct), n2 = fbmN(xz * 0.31 + 5.0, uOct), n3 = vnoise(xz * 1.9), n4 = vnoise(xz * 6.3), hn = fbmN(xz * 0.8, uOct);',
  '  float dl = 1.0 - smoothstep(60.0, 170.0, d);',
  '  vec3 N = normalize(vN); vec3 dpx = dFdx(vW), dpy = dFdy(vW), r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);',
  '  float dhx = dFdx(hn), dhy = dFdy(hn); if (abs(det) > 1e-9) N = normalize(abs(det) * N - sign(det) * (dhx * r1 + dhy * r2) * 2.4 * dl);',
  '  if (mr) N.y = -N.y;',
  '  float slope = 1.0 - N.y;',
  '  float low = 1.0 - smoothstep(1.2, 11.0, h);',
  '  vec2 pg = floor(xz * 0.16 + vec2(n1 * 3.0)); float pr = hash21(pg);',
  '  float ter = smoothstep(0.30, 0.70, abs(fract(h * 0.55 + n1 * 1.7) - 0.5) * 2.0);',
  '  float flat_ = low * (1.0 - smoothstep(0.08, 0.26, slope)); float flood = step(0.88, hash21(pg + 3.0)) * flat_;',
  '  vec3 paddy = mix(mix(vec3(0.08, 0.24, 0.03), vec3(0.42, 0.46, 0.09), pr), vec3(0.20, 0.34, 0.18), step(0.80, pr)) * (0.9 + 0.2 * ter);',
  '  float can = vnoise(xz * 2.6) * 0.6 + n4 * 0.4;',
  '  vec3 forest = mix(vec3(0.010, 0.055, 0.022), vec3(0.060, 0.210, 0.070), clamp(n2 * 0.8 + can * 0.7 - 0.2, 0.0, 1.0));',
  '  float strata = fract(h * 0.42 + n1 * 2.3 + n2 * 0.6);',
  '  vec3 rock = mix(vec3(0.12, 0.10, 0.09), vec3(0.30, 0.25, 0.22), clamp(n2 * 0.9 + n3 * 0.3, 0.0, 1.0));',
  '  rock *= 1.0 + 0.55 * smoothstep(0.35, 0.50, strata) * (1.0 - smoothstep(0.50, 0.66, strata));',
  '  vec3 alb = mix(forest, paddy, flat_);',
  '  alb = mix(alb, rock, clamp(smoothstep(0.20, 0.45, slope + n2 * 0.15) + smoothstep(14.0, 30.0, h) * 0.55, 0.0, 1.0));',
  '  alb = mix(alb, vec3(0.09, 0.08, 0.09), smoothstep(26.0, 38.0, h));',
  '  float veg = (1.0 - smoothstep(0.30, 0.50, slope)) * (1.0 - smoothstep(14.0, 30.0, h));',
  '  alb *= (0.75 + 0.5 * hn) * mix(0.55, 1.0, smoothstep(0.0, 1.0, h));',
  '  vec3 L = normalize(uLd), V = normalize(uCam - vW); if (mr) V.y = -V.y;',
  '  float NoL = dot(N, L), sh = shadowT(pw + N * 0.4, L, uShSteps);',
  '  float ao = 1.0 - clamp((max(hAt(xz + vec2(4.0, 0.0)) - pw.y, 0.0) + max(hAt(xz - vec2(4.0, 0.0)) - pw.y, 0.0) + max(hAt(xz + vec2(0.0, 4.0)) - pw.y, 0.0) + max(hAt(xz - vec2(0.0, 4.0)) - pw.y, 0.0)) / 14.0, 0.0, 0.6);',
  '  vec3 sunCol = uSunC * mix(0.18, 0.55, uDay);',
  '  vec3 amb = mix(uAmbB, uAmbT, N.y * 0.5 + 0.5) * mix(2.6, 1.3, uDay) * ao;',
  '  vec3 col = alb * (sunCol * max(NoL, 0.0) * sh + amb + sunCol * 0.10 * pow(max(NoL * 0.5 + 0.5, 0.0), 2.0) * sh);',
  '  col += alb * sunCol * pow(max(dot(V, -L), 0.0), 2.0) * veg * 0.5 * sh;',
  '  vec3 skyR = mix(uHorC, uHaze2 * 1.6, clamp(abs(V.y) * 3.0, 0.0, 1.0));',
  '  col = mix(col, skyR, pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0) * flood * 0.7);',
  '  col += uSunC * pow(1.0 - max(dot(N, V), 0.0), 3.0) * (0.03 + 0.06 * slope) * (1.0 + 2.0 * smoothstep(6.0, 22.0, h)) * sh;',
  '  float vl = step(0.9972, hash21(floor(xz * 0.8))) * low * (1.0 - smoothstep(0.08, 0.2, slope)) * (1.0 - uDay) * (1.0 - smoothstep(100.0, 190.0, d));',
  '  col += vec3(1.0, 0.68, 0.28) * vl * 3.0;',
  '  vec3 rdv = (vW - uCam) / d; if (mr) rdv.y = -rdv.y; float cs = max(dot(rdv, normalize(uSunD)), 0.0);',
  '  vec3 hz = mix(uHaze2, uHorC, smoothstep(70.0, 300.0, d)) + uSunC * (pow(cs, 5.0) * 0.12 + pow(cs, 24.0) * 0.30) * mix(0.30, 0.9, uDay);',
  '  vec3 f = clamp(1.0 - exp(-pow(vec3(d * uFogK) * vec3(0.85, 1.0, 1.22), vec3(1.35))), 0.0, 1.0); f = clamp(f + 0.18 * exp(-max(h, 0.0) * 0.5) * smoothstep(40.0, 160.0, d), 0.0, 1.0);',
  '  col = mix(mix(col, hz, f), hz, 1.0 - uFade);',
  '  float dq = 1.0; if (mr) { if (vW.y > uMir.y + 0.015) discard; dq = min((uMir.y - vW.y) * 0.03125, 1.0); }',
  '#ifdef HDR', '  oCol = vec4(col, dq);', '#else', '  oCol = vec4(pow(aces(col), vec3(1.0 / 2.2)), dq);', '#endif', '}'].join('\n');

var BLD_FS = [G.head, 'in vec3 vW; in vec3 vN; in vec2 vUV; in vec3 vL; out vec4 oCol;',
  'uniform vec3 uCam, uKeyD, uKeyC, uAmbT, uAmbB, uHaze2, uHorC, uSunC, uSunD, uSkyT, uSkyH; uniform float uTime, uDay, uFogK; uniform vec4 uMir;',
  G.noise, G.aces,
  'void main(){',
  '  bool mr = uMir.x > 0.5;',
  '  int id = int(vUV.x + 0.5); float ao = vUV.y;',
  '  vec3 N = normalize(vN); if (id == 5 && !gl_FrontFacing) N = -N; if (mr) N.y = -N.y;',
  '  vec3 V = normalize(uCam - vW); if (mr) V.y = -V.y;',
  '  vec3 alb = vec3(0.30, 0.27, 0.22); float met = 0.0, em = 0.0, rg = 0.8;',
  '  vec2 wp = abs(N.x) > abs(N.z) ? vL.zy : vL.xy;',
  '  float pn = vnoise(wp * 1.8) * 0.6 + vnoise(wp * 7.0) * 0.4;',
  '  if (id == 0) { alb = vec3(0.82, 0.76, 0.62) * (0.80 + 0.32 * pn); alb *= 1.0 - 0.22 * vnoise(vec2(wp.x * 3.0, wp.y * 0.22)) * smoothstep(7.0, 0.5, vL.y); }',
  '  else if (id == 1) { vec2 tp = (abs(N.x) > abs(N.z) ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y)) * vec2(1.3, 2.0); float rw = floor(tp.y); vec2 tc = vec2(tp.x + 0.5 * mod(rw, 2.0), fract(tp.y)); float tl = hash21(vec2(floor(tc.x), rw)); float ed = smoothstep(0.0, 0.12, fract(tc.x)) * smoothstep(0.0, 0.14, tc.y); alb = vec3(0.42, 0.15, 0.08) * (0.70 + 0.55 * tl) * mix(0.5, 1.0, ed); rg = 0.55; }',
  '  else if (id == 2) { float az = atan(N.z, N.x); float rib = smoothstep(0.86, 1.0, abs(fract(az / 6.2832 * 20.0) - 0.5) * 2.0); alb = mix(vec3(0.025, 0.34, 0.21), vec3(1.0, 0.72, 0.30), rib); met = mix(0.5, 1.0, rib); rg = 0.22; }',
  '  else if (id == 3) { float mu = step(0.93, fract(vL.x * 1.1 + vL.z * 1.1)) + step(0.93, fract(vL.y * 1.4)); alb = vec3(0.04, 0.06, 0.08); em = mix(3.4, 0.12, uDay) * (1.0 - 0.75 * clamp(mu, 0.0, 1.0)); rg = 0.1; }',
  '  else if (id == 4) { alb = vec3(1.0, 0.72, 0.30) * (0.85 + 0.3 * vnoise(wp * 9.0)); met = 1.0; rg = 0.3; }',
  '  else if (id == 5) alb = vec3(0.03, 0.17, 0.05) * (0.8 + 0.5 * vnoise(vL.xz * 3.0));',
  '  else if (id == 7) alb = vec3(0.05, 0.17, 0.05) * (0.7 + 0.6 * pn);',
  '  else alb = vec3(0.30, 0.27, 0.22) * (0.8 + 0.4 * pn);',
  '  vec3 Lk = normalize(uKeyD); float NoL = max(dot(N, Lk), 0.0);',
  '  vec3 col = alb * (uKeyC * (0.55 * NoL + 0.25) * mix(0.06, 0.30, uDay) + mix(uAmbB, uAmbT, N.y * 0.5 + 0.5) * mix(2.4, 1.1, uDay)) * mix(0.45, 1.0, ao);',
  '  col += alb * vec3(1.0, 0.66, 0.30) * (1.0 - uDay) * 0.30 * (0.3 + 0.7 * N.y) * ao;',
  '  col += alb * uSkyH * 0.20 * max(-N.y, 0.0);',
  '  vec3 R = reflect(-V, N); vec3 sky = mix(uSkyH, uSkyT, smoothstep(0.0, 0.8, R.y));',
  '  float nv = max(dot(N, V), 0.0), fres = pow(1.0 - nv, 4.0);',
  '  col += sky * alb * met * 0.8 + sky * (0.05 + 0.35 * fres) * ((id == 2 || id == 3) ? 1.0 : 0.0) * (id == 3 ? uDay * 5.0 : 1.0);',
  '  vec3 Hh = normalize(Lk + V); col += uKeyC * pow(max(dot(N, Hh), 0.0), mix(60.0, 8.0, rg)) * (1.0 - rg) * 0.05 * mix(0.3, 1.0, uDay) * (met * 0.6 + 0.4);',
  '  col += uSunC * pow(1.0 - nv, 3.0) * 0.05;',
  '  col += vec3(1.0, 0.70, 0.30) * em * (0.86 + 0.14 * sin(uTime * 2.7 + vW.x * 5.0 + vW.y * 3.0));',
  '  float d = length(vW - uCam); vec3 rdv = (vW - uCam) / d; if (mr) rdv.y = -rdv.y; float cs = max(dot(rdv, normalize(uSunD)), 0.0);',
  '  vec3 hz = mix(uHaze2, uHorC, smoothstep(70.0, 300.0, d)) + uSunC * (pow(cs, 5.0) * 0.12 + pow(cs, 24.0) * 0.30) * mix(0.30, 0.9, uDay);',
  '  vec3 f = clamp(1.0 - exp(-pow(vec3(d * uFogK) * vec3(0.85, 1.0, 1.22), vec3(1.35))), 0.0, 1.0); col = mix(col, hz, f);',
  '  float dq = 1.0; if (mr) { if (vW.y > uMir.y + 0.015) discard; dq = min((uMir.y - vW.y) * 0.03125, 1.0); }',
  '#ifdef HDR', '  oCol = vec4(col, dq);', '#else', '  oCol = vec4(pow(aces(col), vec3(1.0 / 2.2)), dq);', '#endif', '}'].join('\n');

var TREE_VS = [G.head,
  'layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in float aPart;',
  'layout(location=4) in vec4 iA; layout(location=5) in vec4 iB; layout(location=6) in vec4 iC; layout(location=7) in vec4 iCol;',
  'uniform mat4 uVP; uniform vec4 uMir; uniform float uTime, uFade;',
  'out vec3 vW; out vec3 vN; out vec3 vL; out vec4 vT; out vec4 vC; out vec3 vK;',
  'void main(){',
  '  float fd = clamp(uFade * 1.7 - iC.z * 0.7, 0.0, 1.0); fd = fd * fd * (3.0 - 2.0 * fd);',
  '  vec3 p = vec3(aPos.x * iB.x, aPos.y * iA.w * mix(0.4, 1.0, fd), aPos.z * iB.x);',
  '  float cy = cos(iB.y), sy = sin(iB.y);',
  '  p.xz = vec2(cy * p.x - sy * p.z, sy * p.x + cy * p.z);',
  '  vec3 n = vec3(cy * aNor.x - sy * aNor.z, aNor.y, sy * aNor.x + cy * aNor.z);',
  '  float gust = 0.55 + 0.45 * sin(uTime * 0.31 + iA.x * 0.043 + iA.z * 0.029);',
  '  float sw = 0.65 * sin(uTime * 1.25 + iB.z * 6.2832 + iA.x * 0.17) + 0.35 * sin(uTime * 2.7 + iB.z * 17.0);',
  '  float am = aUV.y * aUV.y * iA.w * (0.012 + 0.032 * gust) * fd;',
  '  p.x += sw * am; p.z += sw * am * 0.45;',
  '  vec3 w = p + iA.xyz;',
  '  if (uMir.x > 0.5) { w.y = 2.0 * uMir.y - w.y; n.y = -n.y; }',
  '  vW = w; vN = n; vL = aPos; vT = vec4(aUV.y, aPart, 0.0, fd); vC = iC; vK = iCol.rgb;',
  '  gl_Position = uVP * vec4(w, 1.0);',
  '}'].join('\n');

var TREE_FS = [G.head, 'precision highp sampler2D;', 'in vec3 vW; in vec3 vN; in vec3 vL; in vec4 vT; in vec4 vC; in vec3 vK; out vec4 oCol;',
  'uniform vec3 uCam, uAmbT, uAmbB, uHaze2, uHorC, uSunC, uSunD, uLd; uniform float uTime, uDay, uFogK, uShore; uniform vec4 uMir;',
  G.noise, G.aces,
  'void main(){',
  '  bool mr = uMir.x > 0.5; vec3 pw = vW; if (mr) pw.y = 2.0 * uMir.y - pw.y;',
  '  float h = pw.y - uShore, d = length(vW - uCam), hf = vT.x; bool trunk = vT.y < 0.5 || vT.y > 2.5, palm = vT.y > 1.5 && vT.y < 2.5;',
  '  vec3 N = normalize(vN); if (mr) N.y = -N.y;',
  '  vec3 L = normalize(uLd), V = normalize(uCam - vW); if (mr) V.y = -V.y;',
  '  float mot = vnoise(vL.xz * 4.5 + vL.y * 6.0 + vC.w * 37.0);',
  '  vec3 leaf = mix(vec3(0.014, 0.066, 0.024), vec3(0.070, 0.225, 0.068), clamp(vC.w * 0.55 + mot * 0.60 - 0.1, 0.0, 1.0)) * vK;',
  '  if (palm) leaf = mix(vec3(0.040, 0.150, 0.030), vec3(0.135, 0.330, 0.060), clamp(vC.w * 0.5 + mot * 0.7, 0.0, 1.0)) * vK;',
  '  vec3 alb = trunk ? (vT.y > 2.5 ? vec3(0.13, 0.100, 0.070) : vec3(0.075, 0.052, 0.034)) : leaf * mix(0.50, 1.18, smoothstep(0.1, 0.9, hf));',
  '  float sh = vC.x, ao = vC.y * (trunk ? 0.6 : mix(0.42, 1.0, smoothstep(0.05, 0.85, hf)));',
  '  float NoL = dot(N, L); vec3 sunCol = uSunC * mix(0.18, 0.55, uDay);',
  '  vec3 amb = mix(uAmbB, uAmbT, N.y * 0.5 + 0.5) * mix(2.6, 1.3, uDay) * ao;',
  '  vec3 col = alb * (sunCol * max(NoL, 0.0) * sh + amb + sunCol * 0.10 * pow(max(NoL * 0.5 + 0.5, 0.0), 2.0) * sh);',
  '  float lf = trunk ? 0.0 : 1.0;',
  '  col += alb * sunCol * pow(max(dot(V, -L), 0.0), 2.0) * 0.7 * sh * lf;',
  '  col += uSunC * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.05 * sh * lf;',
  '  vec3 rdv = (vW - uCam) / d; if (mr) rdv.y = -rdv.y; float cs = max(dot(rdv, normalize(uSunD)), 0.0);',
  '  vec3 hz = mix(uHaze2, uHorC, smoothstep(70.0, 300.0, d)) + uSunC * (pow(cs, 5.0) * 0.12 + pow(cs, 24.0) * 0.30) * mix(0.30, 0.9, uDay);',
  '  vec3 f = clamp(1.0 - exp(-pow(vec3(d * uFogK) * vec3(0.85, 1.0, 1.22), vec3(1.35))), 0.0, 1.0); f = clamp(f + 0.18 * exp(-max(h, 0.0) * 0.5) * smoothstep(40.0, 160.0, d), 0.0, 1.0);',
  '  col = mix(mix(col, hz, f), hz, 1.0 - vT.w);',
  '  float dq = 1.0; if (mr) { if (vW.y > uMir.y + 0.015) discard; dq = min((uMir.y - vW.y) * 0.03125, 1.0); }',
  '#ifdef HDR', '  oCol = vec4(col, dq);', '#else', '  oCol = vec4(pow(aces(col), vec3(1.0 / 2.2)), dq);', '#endif', '}'].join('\n');

var MIST_FS = [G.head, 'in vec3 vW; out vec4 o;', 'uniform vec3 uCam, uHorC, uGlow, uSunC; uniform float uTime, uDay, uOct, uLayer;', G.noise, FBMN,
  'void main(){',
  '  vec2 xz = vW.xz; float d = length(vW - uCam);',
  '  float n = fbmN(xz * 0.030 + vec2(uTime * 0.010 * (1.0 + uLayer), uLayer * 7.0), uOct), n2 = fbmN(xz * 0.10 + vec2(-uTime * 0.018, uLayer * 3.0), uOct);',
  '  float dens = smoothstep(0.40, 0.80, n + 0.30 * (n2 - 0.5));',
  '  float fade = smoothstep(14.0, 55.0, d) * (1.0 - smoothstep(170.0, 340.0, d));',
  '  vec3 V = normalize(uCam - vW); float gz = pow(1.0 - clamp(V.y, 0.0, 1.0), 1.4);',
  '  float a = dens * fade * gz * mix(0.62, 0.45, uDay);',
  '  vec3 col = uHorC * mix(1.5, 1.0, uDay) + uSunC * 0.04 + uGlow * 0.07 * exp(-dot(xz, xz) * 0.0016) * (1.0 - uDay);',
  '  o = vec4(col * a, a); }'].join('\n');

var FLOOR_VS = G.head + 'layout(location=0) in vec3 aPos; uniform mat4 uVP; out vec3 vW; void main(){ vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }';
var FLOOR_FS = [G.head, 'in vec3 vW; out vec4 o;', 'precision highp sampler2D;', 'uniform vec3 uCam, uFloorC, uHorC, uGlow, uPat, uSunD, uSunC, uTop; uniform float uTime, uFloorA, uFogK, uOct, uDay, uRK, uRDist, uRBlur, uRF0, uRFk; uniform vec4 uIsl; uniform vec2 uRes, uRSz; uniform sampler2D uHgt, uRefl;', G.noise, FBMN, G.pattern, HGT,
  'void main(){',
  '  vec2 xz = vW.xz; float dist = length(vW - uCam); float fog = 1.0 - exp(-pow(dist * uFogK, 1.7));',
  '  float pool = exp(-dot(xz, xz) * 0.040);',
  '  float pat = starLines(xz * 0.20, 0.012) * (0.30 + 0.70 * pool);',
  '  vec2 gq = abs(fract(xz * 0.5) - 0.5); float gline = min(gq.x, gq.y); float aaw = fwidth(gline) * 1.2 + 1e-4;',
  '  float grid = 1.0 - smoothstep(0.004, 0.004 + aaw, gline);',
  '  float ripple = 0.5 + 0.5 * sin(length(xz) * 3.0 - uTime * 0.9); ripple = pow(ripple, 8.0) * exp(-length(xz) * 0.35);',
  '  vec3 col = uFloorC + uGlow * pool * 0.60 + uPat * (pat * 0.55 + grid * 0.07 * pool) + uGlow * ripple * 0.10;',
  '  vec3 Vv = normalize(uCam - vW); vec2 wq = xz * 0.55, wq2 = xz * 1.9 + vec2(uTime * 0.11, -uTime * 0.07);',
  '  vec2 wn = vec2(fbmN(wq + vec2(uTime * 0.05, 0.0), uOct), fbmN(wq + vec2(9.0, -uTime * 0.04), uOct)) - 0.5, wn2 = vec2(vnoise(wq2), vnoise(wq2 + 31.7)) - 0.5;',
  '  vec3 Nw = normalize(vec3(wn.x * 0.55 + wn2.x * 0.40, 1.0, wn.y * 0.55 + wn2.y * 0.40)); vec3 Rw = reflect(-Vv, Nw);',
  '  float glit = pow(max(dot(Rw, normalize(uSunD)), 0.0), 150.0) * (0.35 + 1.7 * vnoise(xz * 3.0 + uTime * 0.7));',
  '  col += uSunC * glit * 2.2;',
  '  float dpt = xz.y < -64.0 ? max(vW.y - textureLod(uHgt, hUV(xz), 0.0).r, 0.0) : 9.0;',
  '  float shal = 1.0 - smoothstep(0.0, 2.4, dpt);',
  '  col = mix(col, mix(vec3(0.02, 0.16, 0.14), vec3(0.18, 0.55, 0.50), uDay) + uGlow * 0.03, shal * 0.55);',
  '  vec2 iq = (xz - uIsl.xy) / uIsl.zw; float ri = length(iq);',
  '  float foam = max((1.0 - smoothstep(0.0, 0.55, dpt)) * (0.55 + 0.45 * vnoise(xz * 2.5 + uTime * 0.35)) * step(xz.y, -64.0), (1.0 - smoothstep(0.0, 0.05, abs(ri - 1.015))) * (0.5 + 0.5 * vnoise(xz * 3.0 - uTime * 0.4)));',
  '  col = mix(col, vec3(0.92, 0.96, 0.96) * mix(0.55, 1.0, uDay) + uGlow * 0.05, clamp(foam, 0.0, 0.85) * (1.0 - fog));',
  '  col *= 1.0 - 0.35 * smoothstep(1.35, 1.0, ri) * step(1.0, ri);',
  '  vec3 skyR = mix(uHorC, uTop, smoothstep(0.0, 0.7, Rw.y)); col = mix(col, skyR * 1.3 + uGlow * 0.06, clamp(0.9 * pow(1.0 - clamp(Vv.y, 0.0, 1.0), 4.0), 0.0, 0.85));',
  '  col = mix(col, uHorC, fog); float fr = pow(1.0 - clamp(Vv.y, 0.0, 1.0), 3.0); float a = mix(mix(uFloorA, 0.38, fr), 1.0, fog);',
  '  vec3 rc = vec3(0.0); float Rk = 0.0;',
  '  if (uRK > 0.5) {',
  '    vec2 suv = gl_FragCoord.xy / uRes; float dist = length(vW - uCam), sl = length(Nw.xz);',
  '    float d0 = textureLod(uRefl, suv, 0.0).a * 32.0;',
  '    vec2 uvR = clamp(suv + (wn * 0.55 + wn2 * 0.12) * vec2(1.0, 0.55) * uRDist * (0.3 + 0.7 * d0 / (d0 + 6.0)) / (1.0 + dist * 0.045), vec2(0.002), vec2(0.998));',
  '    float dd = textureLod(uRefl, uvR, 0.0).a * 32.0;',
  '    float radT = uRBlur * (0.2 + 3.0 * sl) * dd / (dd + 8.0);',
  '    float lod = max(0.0, log2(max(radT, 1.0) * 1.6 / sqrt(uRK))), rot = hash21(gl_FragCoord.xy) * 6.2832;',
  '    vec3 acc = vec3(0.0);',
  '    for (int k = 0; k < 24; k++) {',
  '      if (float(k) >= uRK) break;',
  '      float rr = sqrt((float(k) + 0.5) / uRK), th = float(k) * 2.39996323 + rot;',
  '      acc += textureLod(uRefl, clamp(uvR + vec2(cos(th), sin(th)) * rr * radT / uRSz, vec2(0.002), vec2(0.998)), lod).rgb;',
  '    }',
  '    rc = acc / uRK;',
  '    Rk = clamp((uRF0 + (1.0 - uRF0) * pow(1.0 - max(dot(Nw, Vv), 0.0), 5.0)) * uRFk, 0.0, 1.0);',
  '  }',
  '  o = vec4(col * a + rc * Rk * (1.0 - a), a + Rk * (1.0 - a)); }'].join('\n');

var PTS_VS = G.head + [
  'layout(location=0) in vec4 aP; uniform mat4 uVP; uniform float uTime, uSize, uBokeh;',
  'out float vSeed; out float vTw;',
  'void main(){ vec3 p = aP.xyz; float s = aP.w;',
  '  p.y = mod(p.y + uTime * (0.04 + 0.10 * s) + 3.0, 9.5) - 3.0;',
  '  p.x += sin(uTime * 0.15 + s * 20.0) * 0.4; p.z += cos(uTime * 0.12 + s * 13.0) * 0.4;',
  '  vec4 c = uVP * vec4(p, 1.0); gl_Position = c;',
  '  vSeed = s; vTw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 2.0) + s * 30.0);',
  '  gl_PointSize = uBokeh > 0.5 ? uSize * (0.7 + 0.9 * s) * 9.0 / max(c.w, 0.5) : uSize * (0.5 + 1.6 * s * s) / max(c.w, 0.5);',
  '}'].join('\n');
var PTS_FS = [G.head, 'in float vSeed; in float vTw; out vec4 o; uniform float uBokeh, uInt; uniform vec3 uPA, uPB;',
  'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; vec3 col = mix(uPA, uPB, step(0.6, vSeed));',
  '  float a; if (uBokeh > 0.5) { a = smoothstep(1.0, 0.86, d) * (0.35 + 0.65 * smoothstep(0.55, 0.95, d)) * 0.085; }',
  '  else { a = smoothstep(1.0, 0.0, d); a *= a; }',
  '  o = vec4(col * a * vTw * uInt, 0.0); }'].join('\n');

var FLY_VS = [G.head,
  'layout(location=0) in vec4 aP; uniform mat4 uVP; uniform float uTime, uSize, uInt; out float vA;',
  'void main(){ float s = aP.w, t = uTime * (0.25 + 0.2 * s); vec3 p = aP.xyz;',
  '  p.x += sin(t * 1.3 + s * 40.0) * 1.8 + sin(t * 0.7 + s * 11.0) * 0.9; p.z += cos(t * 1.1 + s * 27.0) * 1.8; p.y += sin(t * 0.9 + s * 17.0) * 0.7;',
  '  float bl = pow(max(sin(uTime * (0.9 + s * 1.7) + s * 61.0), 0.0), 3.0);',
  '  vec4 c = uVP * vec4(p, 1.0); gl_Position = c; vA = (0.12 + 0.88 * bl) * uInt; gl_PointSize = clamp(uSize / max(c.w, 0.5), 1.5, 9.0);',
  '}'].join('\n');
var FLY_FS = [G.head, 'in float vA; out vec4 o;',
  'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = 1.0 - d; a = a * a * a;',
  '  o = vec4(vec3(0.78, 1.0, 0.34) * a * vA, 0.0); }'].join('\n');
var RAY_FS = [G.head, 'precision highp sampler2D;', 'in vec2 vUv; out vec4 o;',
  'uniform sampler2D uDepth, uCloud; uniform vec2 uSun, uRes; uniform float uSteps;', G.noise,
  'void main(){',
  '  vec2 uv = vUv; vec2 dl = (uSun - uv) * 0.95 / uSteps; vec2 s = uv + dl * hash21(gl_FragCoord.xy);',
  '  float acc = 0.0, fr = 0.0, dec = 1.0, dcy = pow(0.965, 30.0 / uSteps), asp = uRes.x / uRes.y;',
  '  for (int i = 0; i < 64; i++) {',
  '    if (float(i) >= uSteps) break;',
  '    float sky = step(0.99999, textureLod(uDepth, s, 0.0).r), cv = 1.0 - clamp(textureLod(uCloud, s, 0.0).a * 1.15, 0.0, 1.0);',
  '    vec2 dd = (s - uSun) * vec2(asp, 1.0); float w = (0.30 + exp(-dot(dd, dd) * 7.0)) * dec;',
  '    acc += sky * cv * w; fr += w; s += dl; dec *= dcy;',
  '  }',
  '  vec2 d0 = (uv - uSun) * vec2(asp, 1.0);',
  '  o = vec4(acc / max(fr, 1e-4), exp(-length(d0) * 2.2) * smoothstep(0.02, 0.14, length(d0)), 0.0, 1.0); }'].join('\n');

var LAN_VS = [G.head,
  'layout(location=0) in vec4 aP; uniform mat4 uVP; uniform vec4 uMir; uniform float uTime, uSize, uInt, uFloor; out vec4 vC;',
  'void main(){ float s = aP.w, T = 38.0 + 30.0 * fract(s * 7.13), ph = fract(uTime / T + s);',
  '  vec3 p = vec3(aP.x + 7.0 * ph + 4.0 * sin(uTime * 0.11 + s * 30.0) * ph, uFloor + 1.6 + ph * 15.0 + 0.4 * sin(uTime * 0.9 + s * 20.0), aP.z + 5.0 * sin(uTime * 0.07 + s * 17.0) * ph);',
  '  float fade = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.78, 1.0, ph)), fl = 0.82 + 0.18 * sin(uTime * 7.0 + s * 90.0) * sin(uTime * 3.1 + s * 40.0);',
  '  if (uMir.x > 0.5) p.y = 2.0 * uMir.y - p.y;',
  '  vec4 c = uVP * vec4(p, 1.0); gl_Position = c; gl_PointSize = clamp(uSize / max(c.w, 0.5), 2.0, 42.0); vC = vec4(fade * fl * uInt, ph, s, 0.0);',
  '}'].join('\n');
var LAN_FS = [G.head, 'in vec4 vC; out vec4 o;',
  'void main(){ vec2 q = (gl_PointCoord - 0.5) * 2.0; q.y = -q.y; float r2 = dot(q, q);',
  '  vec2 b = vec2(q.x / (0.36 - 0.05 * q.y * q.y * 4.0), (q.y + 0.02) / 0.50); float lb = length(b), body = smoothstep(1.0, 0.86, lb), rib = 0.85 + 0.15 * cos(b.x * 9.0);',
  '  vec3 col = vec3(1.0, 0.56, 0.16) * (exp(-r2 * 7.0) * 0.30 + body * rib * (0.45 + 0.55 * smoothstep(0.6, -0.8, q.y)) * 3.0) + vec3(1.0, 0.85, 0.5) * exp(-dot(vec2(q.x, q.y + 0.18), vec2(q.x, q.y + 0.18)) * 40.0) * 1.8;',
  '  o = vec4(col * vC.x, 0.0); }'].join('\n');

var BRIGHT_FS = [G.head, 'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uThr;',
  'void main(){ vec3 c = texture(uTex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(uThr, uThr + 0.7, l), 1.0); }'].join('\n');
var BLUR_FS = [G.head, 'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;',
  'void main(){ vec3 c = texture(uTex, vUv).rgb * 0.2270270270;',
  '  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;',
  '  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;',
  '  o = vec4(c, 1.0); }'].join('\n');
var COCF = ['uniform vec4 uF; uniform vec3 uNF;',
  'float linZ(float d){ return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - (d * 2.0 - 1.0) * (uNF.y - uNF.x)); }',
  'float cocOf(float z){',
  '  float r = (z - uF.x) / z;',
  '  float c = pow(clamp((r - uF.z) / (1.0 - uF.z), 0.0, 1.0), 1.5) * uF.y - clamp((-r - uF.z) / 1.5, 0.0, 1.0) * uF.w;',
  '  return c * smoothstep(0.5, 0.78, abs(z - uNF.z));',
  '}'].join('\n');

var DOF_FS = [G.head, 'precision highp sampler2D;', 'in vec2 vUv; out vec4 o;', 'uniform sampler2D uTex, uDepth; uniform vec2 uPx; uniform float uK, uBoost;', G.noise, COCF,
  'void main(){',
  '  vec2 uv = vUv;',
  '  float z0 = linZ(textureLod(uDepth, uv, 0.0).r), R = abs(cocOf(z0));',
  '  vec3 base = textureLod(uTex, uv, 0.0).rgb;',
  '  if (R < 0.35) { o = vec4(base, 1.0); return; }',
  '  vec3 acc = base; float ws = 1.0, rot = hash21(gl_FragCoord.xy) * 6.2832;',
  '  for (int k = 0; k < 40; k++) {',
  '    if (float(k) >= uK) break;',
  '    float rr = sqrt((float(k) + 0.5) / uK), th = float(k) * 2.39996323 + rot, dist = rr * R;',
  '    vec2 suv = uv + vec2(cos(th), sin(th)) * dist * uPx;',
  '    float zq = linZ(textureLod(uDepth, suv, 0.0).r), cq = cocOf(zq);',
  '    vec3 cc = textureLod(uTex, suv, 0.0).rgb;',
  '    float w = (zq < z0 - 0.3) ? clamp(abs(cq) - dist + 1.0, 0.0, 1.0) : 1.0;',
  '    w *= 1.0 + min(dot(cc, vec3(0.2126, 0.7152, 0.0722)), 8.0) * uBoost;',
  '    acc += cc * w; ws += w;',
  '  }',
  '  o = vec4(acc / ws, 1.0); }'].join('\n');

var COMP_FS = [G.head, 'precision highp sampler2D;', 'in vec2 vUv; out vec4 o;', 'uniform sampler2D uScene, uB0, uB1, uDof, uDepth, uRay, uCloud; uniform vec2 uRes, uLight, uSun; uniform vec3 uRayC, uRayS; uniform float uTime, uBloom, uRays, uExpo, uVig, uSteps, uSharp, uDofOn, uRayV, uFlare;',
  G.noise, G.aces, COCF,
  'void main(){',
  '  vec2 uv = vUv; vec2 ca = (uv - 0.5) * 0.0016;',
  '  vec3 sc = vec3(texture(uScene, uv + ca).r, texture(uScene, uv).g, texture(uScene, uv - ca).b);',
  '  float dw = 0.0;',
  '  if (uDofOn > 0.5) { dw = smoothstep(0.35, 1.8, abs(cocOf(linZ(textureLod(uDepth, uv, 0.0).r)))); sc = mix(sc, textureLod(uDof, uv, 0.0).rgb, dw); }',
  '  vec2 px = 1.0 / uRes; vec3 nb = (texture(uScene, uv + vec2(px.x, 0.0)).rgb + texture(uScene, uv - vec2(px.x, 0.0)).rgb + texture(uScene, uv + vec2(0.0, px.y)).rgb + texture(uScene, uv - vec2(0.0, px.y)).rgb) * 0.25;',
  '  sc += clamp((sc - nb) * uSharp * (1.0 - dw), -sc * 0.30, sc * 0.30);',
  '  vec3 b0 = texture(uB0, uv).rgb, b1 = texture(uB1, uv).rgb;',
  '  vec3 col = sc + b0 * 0.55 * uBloom + b1 * 1.05 * uBloom;',
  '  vec2 dl = (uLight - uv) * 0.9 / uSteps; vec2 s = uv; float rays = 0.0, dec = 1.0, dcy = pow(0.945, 28.0 / uSteps);',
  '  for (int i = 0; i < 64; i++) { if (float(i) >= uSteps) break; s += dl; rays += dot(texture(uB0, s).rgb, vec3(0.2126, 0.7152, 0.0722)) * dec; dec *= dcy; }',
  '  col += uRayC * (rays * uRays / uSteps);',
  '  if (uRayV > 0.5) { float zz = linZ(textureLod(uDepth, uv, 0.0).r); vec2 rv = textureLod(uRay, uv, 0.0).rg; col += uRayS * pow(rv.x, 2.8) * (0.06 + rv.y) * (1.0 - exp(-zz * 0.035)); }',
  '  if (uFlare > 0.5) {',
  '    float sv = step(0.99999, textureLod(uDepth, uSun, 0.0).r) * (1.0 - clamp(textureLod(uCloud, uSun, 0.0).a * 1.1, 0.0, 1.0)), ar = uRes.x / uRes.y;',
  '    vec2 fd = (uv - uSun) * vec2(ar, 1.0), gc = vec2(0.5) - uSun;',
  '    float st = exp(-abs(fd.y) * 70.0) * exp(-abs(fd.x) * 2.4);',
  '    float g1 = smoothstep(0.045, 0.0, length((uv - (vec2(0.5) + gc * 0.55)) * vec2(ar, 1.0))), g2 = smoothstep(0.075, 0.0, length((uv - (vec2(0.5) + gc * 1.15)) * vec2(ar, 1.0)));',
  '    col += uRayS * sv * (st * 0.16 + g1 * 0.05 * vec3(0.7, 1.0, 0.9) + g2 * 0.035 * vec3(1.0, 0.8, 0.6)) * uFlare;',
  '  }',
  '  vec3 stk = vec3(0.0); for (int i = -6; i <= 6; i++) stk += texture(uB1, uv + vec2(float(i) * 0.011, 0.0)).rgb * exp(-abs(float(i)) * 0.4);',
  '  col += stk * 0.045 * uBloom * vec3(1.0, 0.84, 0.58);',
  '  col *= uExpo; col = pow(aces(col), vec3(1.0 / 2.2));',
  '  float asp = uRes.x / uRes.y; float vig = smoothstep(1.20, 0.30, length((uv - 0.5) * vec2(asp, 1.0)) * 1.05); col *= mix(1.0 - uVig, 1.0, vig);',
  '  col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * (2.2 / 255.0);',
  '  o = vec4(col, 1.0); }'].join('\n');

/* ---------- palettes ---------- */
function sc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
var PAL = {
  night: { top: lin('#00100c'), hor: lin('#0b5947'), glow: [1.0, 0.76, 0.34], pat: lin('#f0cf7f'), floor: lin('#010e0a'), floorA: 0.80,
    key: [7.6, 5.7, 3.0], fill: sc(lin('#2ee6a6'), 0.30), rim: [1.1, 1.9, 2.5], ambT: sc(lin('#0f4d3f'), 0.35), ambB: lin('#010806'),
    skyT: [0.055, 0.040, 0.016], skyH: [0.85, 0.66, 0.40], gnd: [0.004, 0.07, 0.045], softA: [1.0, 0.82, 0.55], softB: [0.72, 0.90, 1.0], fog: lin('#0b5947'),
    stars: 1, bloom: 1.0, thr: 1.08, expo: 1.08, rays: 0.40, vig: 0.45, pa: [1.0, 0.80, 0.42], pb: [0.72, 1.0, 0.90], pint: 1.0 },
  day: { top: lin('#6fb6bd'), hor: lin('#f7edcf'), glow: [1.0, 0.90, 0.66], pat: lin('#0e7a55'), floor: lin('#8fc3be'), floorA: 0.60,
    key: [3.4, 3.1, 2.6], fill: sc(lin('#79d6c2'), 0.9), rim: [1.4, 1.5, 1.5], ambT: lin('#e8f6f1'), ambB: sc(lin('#b8ae8c'), 0.6),
    skyT: [0.60, 0.58, 0.56], skyH: lin('#fff5da'), gnd: lin('#d8cfae'), softA: [1.0, 0.96, 0.85], softB: [0.80, 0.93, 1.0], fog: lin('#f7edcf'),
    stars: 0, bloom: 0.55, thr: 1.5, expo: 0.92, rays: 0.30, vig: 0.22, pa: [1.0, 0.86, 0.5], pb: [0.5, 0.9, 0.75], pint: 0.55 }
};
function pal(k, t) { var a = PAL.night[k], b = PAL.day[k]; return typeof a === 'number' ? mix(a, b, t) : [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

var MAT = {
  gold: { c: [1.0, 0.72, 0.30, 1], m: 0.96, r: 0.27, e: 0.0 },
  goldRing: { c: [1.0, 0.70, 0.28, 1], m: 0.95, r: 0.33, e: 0.0 },
  emerald: { c: [0.02, 0.50, 0.30, 1], m: 0.10, r: 0.10, e: 0.14 },
  jewel: { c: [0.15, 1.0, 0.62, 1], m: 0.0, r: 0.05, e: 2.6 },
  bead: { c: [0.2, 1.0, 0.7, 1], m: 0.0, r: 0.1, e: 1.8 },
  coin: { c: [1.0, 0.74, 0.32, 1], m: 0.92, r: 0.30, e: 0.0 }
};

function Hero(canvas, opt) {
  opt = opt || {};
  var gl = N.getGL(canvas, { opaque: true });
  if (!gl) return null;
  var hdr = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('EXT_float_blend'); gl.getExtension('OES_texture_float_linear');
  var H = { canvas: canvas, gl: gl, hdr: hdr, day: 0, time: 0, w: 0, h: 0, dpr: 1, lost: false, pointer: { x: 0, y: 0 }, cam: { x: 0, y: 0 }, scroll: 0, sScroll: 0, quality: 1, intro: 1 };
  function P(vs, fs, n, defs) { return N.program(gl, defs ? vs.replace('precision highp float;\n', 'precision highp float;\n' + defs) : vs, defs ? fs.replace('precision highp float;\n', 'precision highp float;\n' + defs) : fs, n); }
  var hdrDef = hdr ? '#define HDR\n' : '';
  var pBg = P(FS_TRI, BG_FS, 'bg'), pLit = P(LIT_VS(false), LIT_FS, 'lit', hdrDef), pCol = P(LIT_VS(true), LIT_FS, 'col', hdrDef),
      pFloor = P(FLOOR_VS, FLOOR_FS, 'floor'), pPts = P(PTS_VS, PTS_FS, 'pts'), pFly = P(FLY_VS, FLY_FS, 'fly'), pLan = P(LAN_VS, LAN_FS, 'lan'), pRay = P(FS_TRI, RAY_FS, 'ray'), pBright = P(FS_TRI, BRIGHT_FS, 'bright'), pBlur = P(FS_TRI, BLUR_FS, 'blur'), pComp = P(FS_TRI, COMP_FS, 'comp'), pDof = P(FS_TRI, DOF_FS, 'dof'),
      pTer = P(LIT_VS(false), TER_FS, 'ter', hdrDef), pBld = P(LIT_VS(false), BLD_FS, 'bld', hdrDef),
      pMist = P(FLOOR_VS, MIST_FS, 'mist'), pTree = P(TREE_VS, TREE_FS, 'tree', hdrDef),
      pCloud = P(FS_TRI, CLOUD_FS, 'cloud');
  var emptyVao = gl.createVertexArray();
  var LV = [
    { oct: 3, rays: 16, nc: 18, np: 450, ms: 2, dpr: 1.5, px: 2.6e6, cl: 0, co: 3, sh: 6, sp: 0.25, nt: 450, tl: 0, rf: 0.35, rk: 4, tr: 0.35, df: 0, dm: 0, db: 0, nf: 0, gr: 0, cc: 0, nl: 0, lf: 0 },
    { oct: 4, rays: 28, nc: 34, np: 900, ms: 4, dpr: 2, px: 3.6e6, cl: 10, co: 3, sh: 10, sp: 0.40, nt: 1500, tl: 1, rf: 0.5, rk: 8, tr: 0.5, df: 10, dm: 0.0030, db: 0.20, nf: 60, gr: 24, cc: 1, nl: 8, lf: 1 },
    { oct: 6, rays: 44, nc: 52, np: 1800, ms: 4, dpr: 2.5, px: 4.4e6, cl: 16, co: 4, sh: 18, sp: 0.55, nt: 3200, tl: 2, rf: 0.5, rk: 12, tr: 0.5, df: 18, dm: 0.0040, db: 0.35, nf: 120, gr: 36, cc: 2, nl: 16, lf: 1 },
    { oct: 8, rays: 64, nc: 80, np: 2800, ms: 8, dpr: 3, px: 5.2e6, cl: 30, co: 5, sh: 32, sp: 0.75, nt: 6500, tl: 3, rf: 0.7, rk: 20, tr: 0.6, df: 30, dm: 0.0054, db: 0.55, nf: 220, gr: 52, cc: 2, nl: 28, lf: 1 }];
  H.lv = 2; H.cfg = LV[2]; H.ready = false;
  var LD = [0.45, 0.27, -0.85], lq = Math.hypot(LD[0], LD[1], LD[2]); LD = [LD[0] / lq, LD[1] / lq, LD[2] / lq];
  var hgtTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, hgtTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([-60]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /* geometry */
  var floorY = -2.35, R = 1.6, r8 = R * 0.7654;
  var D = {
    star: N.drawable(gl, N.geo.starPrism(8, R, r8, 0.46, 0.10, 0.09, PI / 2)),
    inlay: N.drawable(gl, N.geo.starPrism(8, R * 0.24, R * 0.24 * 0.7654, 0.50, 0.05, 0.04, PI / 2 + PI / 8)),
    core: N.drawable(gl, N.geo.starPrism(8, R * 0.11, R * 0.11 * 0.7654, 0.58, 0.05, 0.03, PI / 2)),
    jewel: N.drawable(gl, N.geo.lathe(N.geo.profSphere(20), 32, 0, TAU)),
    rings: [2.55, 3.15, 3.80].map(function (Rr, i) { return N.drawable(gl, N.geo.lathe(N.geo.profCircle(Rr, i === 1 ? 0.05 : 0.04, 10), 160, 0, TAU)); }),
    bead: N.drawable(gl, N.geo.lathe(N.geo.profSphere(12), 16, 0, TAU)),
    coin: N.drawable(gl, N.geo.lathe(N.geo.profSlab(1, 0, 0.09, 0.06, 4), 48, 0, TAU), new Float32Array(16)),
    floor: N.drawable(gl, N.geo.quadXZ(90, 76, floorY))
  };
  D.beads = N.drawable(gl, N.geo.lathe(N.geo.profSphere(12), 16, 0, TAU), new Float32Array(16));
  /* beads/ticks on the rings: instanced in ring-local space (ring lies in XZ plane) */
  var ringBeads = [[2.55, 5], [3.15, 7], [3.80, 9]].map(function (rb) {
    var arr = new Float32Array(rb[1] * 16), k;
    for (k = 0; k < rb[1]; k++) { var a = k / rb[1] * TAU; arr.set([rb[0] * Math.cos(a), 0, rb[0] * Math.sin(a), k % 2 ? 0.085 : 0.12, 0, 0, 0, 0, 1, 0, 0, 0, 0.2, 1.0, 0.7, 1], k * 16); }
    return { data: arr, n: rb[1] };
  });
  /* ---------- lanskap: pegunungan + pulau masjid/pesantren ---------- */
  function h2(x, z) { var q = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return q - Math.floor(q); }
  function vn(x, z) { var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz); var a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
  function fb(x, z, o) { var q = 0, a = 0.5, k; for (k = 0; k < o; k++) { q += a * vn(x, z); x = x * 2.03 + 11.7; z = z * 2.03 + 3.1; a *= 0.5; } return q; }
  function sst(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function terH(x, z) {
    var sh = sst(-60, -84, z), hills = fb(x * 0.02 + 3, z * 0.02, 5) * 7 * sh;
    var rg = Math.pow(1 - Math.abs(2 * fb(x * 0.0075 + 9, z * 0.0075, 5) - 1), 2.4), mt = rg * (3 + 12 * sst(-100, -280, z)) * sst(-72, -130, z);
    var dx = x - 38, dz = z + 200, r2 = dx * dx + dz * dz, vol = 13 * Math.exp(-r2 / (2 * 26 * 26)) - 3.2 * Math.exp(-r2 / (2 * 5.5 * 5.5)), pk = 7 * Math.exp(-((x + 6) * (x + 6) + (z + 150) * (z + 150)) / (2 * 20 * 20));
    var ex2 = x + 75, ez2 = z + 260, mas = 12 * Math.exp(-(ex2 * ex2 + ez2 * ez2) / (2 * 55 * 55)) * (0.7 + 0.6 * fb(x * 0.05, z * 0.05, 3));
    return floorY - 1.2 + sh * 4.2 + hills + mt + vol + pk + mas + 5 * sst(-250, -330, z);
  }
  var terJob = { ready: false, fade: 0, dead: false };
  /* ---------- pohon instans di kaki bukit: konifer, rindang, palem kelapa ---------- */
  var treeJob = { ready: false, fade: 0, nC: 0, nB: 0, nP: 0, dC: null, dB: null, dP: null, lod: -1, slices: 0, maxMs: 0, ms: 0 };
  function treeMesh(kind, lod) {
    var P3 = [], Nn = [], Uv = [], Pt = [], I = [], sg = [5, 6, 8, 9][lod], s, a, ca, sa, k;
    function vx(x, y, z, nx, ny, nz, u, v, part) { var l = Math.hypot(nx, ny, nz) || 1; P3.push(x, y, z); Nn.push(nx / l, ny / l, nz / l); Uv.push(u, v); Pt.push(part); return P3.length / 3 - 1; }
    function ring(y, r, nr, ny, part, n, ox) { var b = P3.length / 3; n = n || sg; for (s = 0; s <= n; s++) { a = s / n * TAU; ca = Math.cos(a); sa = Math.sin(a); vx((ox || 0) + r * ca, y, r * sa, nr * ca, ny, nr * sa, s / n, y, part); } return b; }
    function band(b0, b1, n) { n = n || sg; for (s = 0; s < n; s++) I.push(b0 + s, b1 + s + 1, b0 + s + 1, b0 + s, b1 + s, b1 + s + 1); }
    if (kind === 2) {
      var tn = [3, 4, 5, 6][lod], pn = [5, 6, 7, 8][lod], rg2 = [], yy, rr, cx = 0.55 * 0.86 * 0.86, ph, dx, dz, px, pz, st, q, hy, wd, bx, bz, nx, nz, prev, Lt, Rt, Lb, Rb;
      for (k = 0; k < 5; k++) { yy = -0.03 + 0.89 * k / 4; rr = 0.085 - 0.045 * k / 4; rg2.push(ring(yy, rr, 1, 0, 3, tn, 0.55 * Math.max(yy, 0) * Math.max(yy, 0))); }
      for (k = 0; k < 4; k++) band(rg2[k], rg2[k + 1], tn);
      for (k = 0; k < pn; k++) {
        ph = k / pn * TAU + 0.35 * (k % 2); dx = Math.cos(ph); dz = Math.sin(ph); px = -dz; pz = dx; prev = null;
        for (st = 0; st <= 3; st++) {
          q = st / 3; hy = 0.86 + 0.10 * Math.sin(q * PI * 0.9) - 0.30 * q * q; wd = 0.20 * Math.pow(Math.max(Math.sin(PI * Math.min(q * 0.92 + 0.08, 1)), 0), 0.7);
          bx = cx + dx * q; bz = dz * q; nx = dx * 0.4 * q; nz = dz * 0.4 * q;
          Lt = vx(bx + px * wd, hy, bz + pz * wd, nx, 1, nz, q, hy, 2); Rt = vx(bx - px * wd, hy, bz - pz * wd, nx, 1, nz, q, hy, 2);
          Lb = vx(bx + px * wd, hy, bz + pz * wd, -nx, -1, -nz, q, hy, 2); Rb = vx(bx - px * wd, hy, bz - pz * wd, -nx, -1, -nz, q, hy, 2);
          if (prev) I.push(prev.Lt, Lt, prev.Rt, prev.Rt, Lt, Rt, prev.Lb, prev.Rb, Lb, prev.Rb, Rb, Lb);
          prev = { Lt: Lt, Rt: Rt, Lb: Lb, Rb: Rb };
        }
      }
      return N.geo.pack(P3, Nn, Uv, Pt, I);
    }
    if (lod > 0) band(ring(-0.04, 0.12, 1, 0, 0), ring(0.50, 0.08, 1, 0, 0));
    if (kind === 0) {
      var T = [2, 3, 4, 5][lod], j, f, yb, yt, rb, ht, b0, ap, cb, cc;
      for (j = 0; j < T; j++) {
        f = j / T; yb = 0.12 + 0.62 * f; yt = Math.min(1, yb + 0.46 * (1 - 0.45 * f) + 0.14); rb = 1 - 0.82 * f; ht = yt - yb;
        b0 = ring(yb, rb, ht, rb, 1); ap = P3.length / 3;
        for (s = 0; s <= sg; s++) { a = (s + 0.5) / sg * TAU; vx(0, yt, 0, ht * Math.cos(a), rb, ht * Math.sin(a), (s + 0.5) / sg, yt, 1); }
        for (s = 0; s < sg; s++) I.push(b0 + s, ap + s, b0 + s + 1);
      }
      cb = ring(0.12, 1, 0, -1, 1); cc = vx(0, 0.12, 0, 0, -1, 0, 0.5, 0.12, 1);
      for (s = 0; s < sg; s++) I.push(cc, cb + s, cb + s + 1);
    } else {
      var bn = [3, 4, 5, 6][lod], cy = 0.66, ryU = 0.34, ryL = 0.22, th, rr2, y, lump, ry, rows = [], base;
      for (k = 0; k <= bn; k++) {
        th = -PI / 2 + PI * k / bn; ry = th > 0 ? ryU : ryL; y = cy + ry * Math.sin(th); rr2 = Math.cos(th); base = P3.length / 3;
        for (s = 0; s <= sg; s++) {
          a = s / sg * TAU; ca = Math.cos(a); sa = Math.sin(a);
          lump = lod > 1 && k > 0 && k < bn ? 1 + 0.14 * Math.sin(5 * a + 2.3 * k) + 0.07 * Math.sin(11 * a - 1.7 * k) : 1;
          vx(rr2 * lump * ca, y, rr2 * lump * sa, rr2 * ca, Math.sin(th) / ry, rr2 * sa, s / sg, y, 1);
        }
        rows.push(base);
      }
      for (k = 0; k < bn; k++) band(rows[k], rows[k + 1]);
    }
    return N.geo.pack(P3, Nn, Uv, Pt, I);
  }
  function treeDraw() {
    if (!treeJob.ready) return;
    N.freeDrawable(gl, D.treeC); N.freeDrawable(gl, D.treeB); N.freeDrawable(gl, D.treeP);
    var lod = H.cfg.tl;
    D.treeC = N.drawable(gl, treeMesh(0, lod), treeJob.dC.subarray(0, treeJob.nC * 16));
    D.treeB = N.drawable(gl, treeMesh(1, lod), treeJob.dB.subarray(0, treeJob.nB * 16));
    D.treeP = N.drawable(gl, treeMesh(2, lod), treeJob.dP.subarray(0, treeJob.nP * 16));
    treeJob.lod = lod;
  }
  function startTrees(hh, zs, nx, nz) {
    var X0 = -180, XW = 360, Z0 = -64, ZL = 290, W1 = nx + 1, CS = 1.4, ZA = -66, ZB = -232, NMAX = 6500, NMAXP = 520, rg = rnd(31337), rowZ = [], rowW = [], rowN = [], total = 0, r, k, c, zz, hw;
    for (r = 0; ZA - (r + 0.5) * CS > ZB; r++) { zz = ZA - (r + 0.5) * CS; hw = Math.min(0.70 * (11.6 - zz) + 12, 176); rowZ.push(zz); rowW.push(hw); rowN.push(Math.ceil(2 * hw / CS)); total += rowN[r]; }
    var keys = new Float64Array(total), rowOf = new Int32Array(total), colOf = new Int32Array(total);
    for (r = 0, k = 0; r < rowZ.length; r++) for (c = 0; c < rowN[r]; c++, k++) { rowOf[k] = r; colOf[k] = c; keys[k] = Math.floor(rg() * 1048576) * 65536 + k; }
    keys.sort();
    var dC = new Float32Array(NMAX * 16), dB = new Float32Array(NMAX * 16), dP = new Float32Array(NMAXP * 16), nC = 0, nB = 0, nP = 0, pos = 0, job = treeJob;
    function hg(x, z) {
      var fx = clamp((x - X0) / XW, 0, 1) * nx, fz = clamp((-0.35 + Math.sqrt(0.1225 + 2.6 * clamp((Z0 - z) / ZL, 0, 1))) / 1.3, 0, 1) * nz;
      var i = Math.min(Math.floor(fx), nx - 1), j = Math.min(Math.floor(fz), nz - 1), tx = fx - i, tz = fz - j;
      var a = hh[j * W1 + i], b = hh[j * W1 + i + 1], c2 = hh[(j + 1) * W1 + i], d = hh[(j + 1) * W1 + i + 1];
      return a + (b - a) * tx + (c2 - a) * tz + (a - b - c2 + d) * tx * tz;
    }
    function shadow(x, y, z) { var res = 1, t = 0.7, i, qy; for (i = 0; i < 32; i++) { qy = y + LD[1] * t; if (qy > 70) break; res = Math.min(res, 6 * (qy - hg(x + LD[0] * t, z + LD[2] * t)) / t); t += Math.max(1, t * 0.14); } return clamp(res, 0, 1); }
    function put(arr, o, x, y, z, Hh, Rw, r1, r2, r3, r4) {
      var tn = 0.82 + 0.36 * r4;
      arr.set([x, y - 0.06 * Hh, z, Hh, Rw, r3 * TAU, r2, 0, shadow(x, y + 0.5 * Hh, z), 1 - clamp((Math.max(hg(x + 4, z) - y, 0) + Math.max(hg(x - 4, z) - y, 0) + Math.max(hg(x, z + 4) - y, 0) + Math.max(hg(x, z - 4) - y, 0)) / 14, 0, 0.6), r4, r1, tn * (0.92 + 0.16 * r2), tn, tn * (0.90 + 0.20 * r3), 1], o);
    }
    function work() {
      var t0 = performance.now(), kk, x, z, y, gx, gz, slope, hN, fl, dn, r1, r2, r3, r4, kind, sz, Hh, Rw;
      while (pos < total && nC + nB < NMAX && performance.now() - t0 < 6) {
        kk = keys[pos++] % 65536; r = rowOf[kk]; c = colOf[kk];
        x = Math.min(-rowW[r] + (c + rg()) * CS, 178); z = rowZ[r] + (rg() - 0.5) * CS;
        y = hg(x, z); hN = y - floorY; r1 = rg(); r2 = rg(); r3 = rg(); r4 = rg();
        if (hN < 0.55) continue;
        gx = (hg(x + 1, z) - hg(x - 1, z)) / 2; gz = (hg(x, z + 1) - hg(x, z - 1)) / 2; slope = 1 - 1 / Math.hypot(gx, 1, gz);
        if (nP < NMAXP && rg() < 0.20 * (1 - sst(3, 8, hN)) * (1 - sst(0.10, 0.22, slope))) {
          Hh = 3.0 + 1.8 * r2; put(dP, nP++ * 16, x, y, z, Hh, Hh * (0.36 + 0.10 * r3), r1, r2, r3, r4); continue;
        }
        fl = (1 - sst(1.2, 11, hN)) * (1 - sst(0.08, 0.26, slope + 0.04));
        dn = (1 - 0.92 * fl) * (1 - sst(12, 24, hN + 5 * (fb(x * 0.03 + 5, z * 0.03, 2) - 0.5))) * (1 - sst(0.34, 0.50, slope)) * (0.22 + 0.78 * sst(0.34, 0.62, fb(x * 0.045 + 40, z * 0.045 + 12, 3))) * (1 - 0.35 * sst(-150, -232, z));
        if (rg() > dn) continue;
        kind = r1 < 0.22 + 0.55 * sst(4, 16, hN) ? 0 : 1; sz = 1 - 0.40 * sst(11, 24, hN);
        Hh = (kind === 0 ? 2.5 + 2.0 * r2 : 1.8 + 1.5 * r2) * sz; Rw = Hh * (kind === 0 ? 0.20 + 0.06 * r3 : 0.37 + 0.10 * r3);
        if (kind === 0) put(dC, nC++ * 16, x, y, z, Hh, Rw, r1, r2, r3, r4); else put(dB, nB++ * 16, x, y, z, Hh, Rw, r1, r2, r3, r4);
      }
      var dt = performance.now() - t0; job.slices++; job.ms += dt; if (dt > job.maxMs) job.maxMs = dt;
    }
    function done() { job.dC = dC; job.dB = dB; job.dP = dP; job.nC = nC; job.nB = nB; job.nP = nP; job.ready = true; treeDraw(); H.ready = true; if (opt.onReady) opt.onReady(); }
    function step() {
      if (terJob.dead) return;
      try { work(); if (pos < total && nC + nB < NMAX) setTimeout(step, 0); else done(); } catch (x) { job.dead = true; H.ready = true; if (opt.onReady) opt.onReady(); }
    }
    step();
  }

  (function () {
    var nx = 360, nz = 220, X0 = -180, XW = 360, Z0 = -64, ZL = 290, W1 = nx + 1, N1 = nz + 1, ph = 0, j = 0, i, k, u, t0;
    var pos = new Float32Array(W1 * N1 * 3), nor = new Float32Array(pos.length), hh = new Float32Array(W1 * N1), zs = new Float32Array(N1), idx = new Uint32Array(nx * nz * 6);
    for (j = 0; j < N1; j++) { u = j / nz; zs[j] = Z0 - ZL * (0.35 * u + 0.65 * u * u); }
    j = 0;
    function sliceWork() {
      if (terJob.dead) return;
      t0 = performance.now();
      while (performance.now() - t0 < 9) {
        if (ph === 0) {
          for (i = 0; i <= nx; i++) { k = j * W1 + i; hh[k] = terH(X0 + XW * i / nx, zs[j]); pos[k * 3] = X0 + XW * i / nx; pos[k * 3 + 1] = hh[k]; pos[k * 3 + 2] = zs[j]; }
          if (++j >= N1) { ph = 1; j = 0; }
        } else if (ph === 1) {
          var jn = Math.max(j - 1, 0), jf = Math.min(j + 1, nz), gx, gz, l, il, ir;
          for (i = 0; i <= nx; i++) {
            il = Math.max(i - 1, 0); ir = Math.min(i + 1, nx);
            gx = (hh[j * W1 + ir] - hh[j * W1 + il]) / (pos[(j * W1 + ir) * 3] - pos[(j * W1 + il) * 3]); gz = (hh[jf * W1 + i] - hh[jn * W1 + i]) / (zs[jf] - zs[jn]); l = Math.hypot(gx, 1, gz);
            k = j * W1 + i; nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l;
          }
          if (++j >= N1) { ph = 2; j = 0; }
        } else if (ph === 2) {
          for (i = 0; i < nx; i++) { var a = j * W1 + i, c = a + W1, o = (j * nx + i) * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = c; idx[o + 3] = a + 1; idx[o + 4] = c + 1; idx[o + 5] = c; }
          if (++j >= nz) ph = 3;
        } else {
          D.terrain = N.drawable(gl, { pos: pos, nor: nor, uv: null, part: null, idx: idx });
          gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hgtTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, W1, N1, 0, gl.RED, gl.FLOAT, hh); gl.activeTexture(gl.TEXTURE0);
          terJob.ready = true; startTrees(hh, zs, nx, nz);
          return;
        }
      }
      setTimeout(slice, 0);
    }
    function slice() { try { sliceWork(); } catch (x) { terJob.dead = true; H.ready = true; if (opt.onReady) opt.onReady(); } }
    slice();
  })();
  function Mb() { return { p: [], n: [], u: [], i: [] }; }
  function quad(m, a, b, c, d, nr, id, a0, a1) { var k = m.p.length / 3, v = [a, b, c, d], j; for (j = 0; j < 4; j++) { m.p.push(v[j][0], v[j][1], v[j][2]); m.n.push(nr[0], nr[1], nr[2]); m.u.push(id, j < 2 ? a0 : a1); } m.i.push(k, k + 1, k + 2, k, k + 2, k + 3); }
  function tri(m, a, b, c, nr, id, a0) { var k = m.p.length / 3, v = [a, b, c], j; for (j = 0; j < 3; j++) { m.p.push(v[j][0], v[j][1], v[j][2]); m.n.push(nr[0], nr[1], nr[2]); m.u.push(id, j < 2 ? a0 : 1); } m.i.push(k, k + 1, k + 2); }
  function box(m, cx, y0, cz, w, h, d, id) {
    var x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h, z0 = cz - d / 2, z1 = cz + d / 2, a = 0.42;
    quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], id, a, 1);
    quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], id, a, 1);
    quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], id, a, 1);
    quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], id, a, 1);
    quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], id, 1, 1);
  }
  function gable(m, cx, y0, cz, w, d, rh, id) {
    var x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, yr = y0 + rh, q = Math.hypot(rh, d / 2), ny = (d / 2) / q, nz = rh / q;
    quad(m, [x0, y0, z1], [x1, y0, z1], [x1, yr, cz], [x0, yr, cz], [0, ny, nz], id, 0.7, 1);
    quad(m, [x1, y0, z0], [x0, y0, z0], [x0, yr, cz], [x1, yr, cz], [0, ny, -nz], id, 0.7, 1);
    tri(m, [x1, y0, z1], [x1, y0, z0], [x1, yr, cz], [1, 0, 0], id, 0.7);
    tri(m, [x0, y0, z0], [x0, y0, z1], [x0, yr, cz], [-1, 0, 0], id, 0.7);
  }
  function pyr(m, cx, y0, cz, w, d, rh, id) {
    var x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, p = [cx, y0 + rh, cz], q1 = Math.hypot(rh, d / 2), q2 = Math.hypot(rh, w / 2);
    tri(m, [x0, y0, z1], [x1, y0, z1], p, [0, (d / 2) / q1, rh / q1], id, 0.7); tri(m, [x1, y0, z0], [x0, y0, z0], p, [0, (d / 2) / q1, -rh / q1], id, 0.7);
    tri(m, [x1, y0, z1], [x1, y0, z0], p, [rh / q2, (w / 2) / q2, 0], id, 0.7); tri(m, [x0, y0, z0], [x0, y0, z1], p, [-rh / q2, (w / 2) / q2, 0], id, 0.7);
  }
  function pf(a) { return a.map(function (p, i) { var q = a[Math.max(0, i - 1)], r = a[Math.min(a.length - 1, i + 1)], dr = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dr, dy) || 1; return { r: p[0], y: p[1], nr: dy / l, ny: -dr / l }; }); }
  function lat(m, prof, seg, cx, cy, cz, sx, sy, sz, id, a0, a1) {
    var g = N.geo.lathe(prof, seg, 0, TAU), k = m.p.length / 3, j;
    for (j = 0; j < g.pos.length / 3; j++) { m.p.push(cx + g.pos[j * 3] * sx, cy + g.pos[j * 3 + 1] * sy, cz + g.pos[j * 3 + 2] * sz); m.n.push(g.nor[j * 3], g.nor[j * 3 + 1], g.nor[j * 3 + 2]); m.u.push(id, a0 + (a1 - a0) * g.uv[j * 2 + 1]); }
    for (j = 0; j < g.idx.length; j++) m.i.push(k + g.idx[j]);
  }
  function domeP(R, Hh) { var a = [], k, th; for (k = 0; k <= 12; k++) { th = PI / 2 * (1 - k / 12); a.push([R * Math.sin(th) * (1 + 0.1 * Math.sin(2 * th)), Hh * Math.cos(th)]); } return pf(a); }
  function addGeo(m, g, cx, cy, cz, id) { var k = m.p.length / 3, j; for (j = 0; j < g.pos.length / 3; j++) { m.p.push(cx + g.pos[j * 3], cy + g.pos[j * 3 + 1], cz + g.pos[j * 3 + 2]); m.n.push(g.nor[j * 3], g.nor[j * 3 + 1], g.nor[j * 3 + 2]); m.u.push(id, 1); } for (j = 0; j < g.idx.length; j++) m.i.push(k + g.idx[j]); }
  function crescent(m, x, y, z, r) { var pts = [], k, a; for (k = 0; k <= 16; k++) { a = (140 + k / 16 * 260) * PI / 180; pts.push([r * Math.cos(a), r * Math.sin(a), 0]); } addGeo(m, N.geo.tube(pts, r * 0.15, 6), x, y, z, 4); }
  function winZ(m, x, y, z, w, h) { quad(m, [x - w / 2 - 0.16, y - 0.16, z - 0.015], [x + w / 2 + 0.16, y - 0.16, z - 0.015], [x + w / 2 + 0.16, y + h, z - 0.015], [x - w / 2 - 0.16, y + h, z - 0.015], [0, 0, 1], 4, 1, 1); tri(m, [x - w / 2 - 0.16, y + h, z - 0.015], [x + w / 2 + 0.16, y + h, z - 0.015], [x, y + h + w * 0.55 + 0.16, z - 0.015], [0, 0, 1], 4, 1); quad(m, [x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z], [0, 0, 1], 3, 1, 1); tri(m, [x - w / 2, y + h, z], [x + w / 2, y + h, z], [x, y + h + w * 0.55, z], [0, 0, 1], 3, 1); }
  function winX(m, x, y, z, w, h, sg) {
    if (sg > 0) { quad(m, [x - 0.015, y - 0.16, z + w / 2 + 0.16], [x - 0.015, y - 0.16, z - w / 2 - 0.16], [x - 0.015, y + h, z - w / 2 - 0.16], [x - 0.015, y + h, z + w / 2 + 0.16], [1, 0, 0], 4, 1, 1); quad(m, [x, y, z + w / 2], [x, y, z - w / 2], [x, y + h, z - w / 2], [x, y + h, z + w / 2], [1, 0, 0], 3, 1, 1); tri(m, [x, y + h, z + w / 2], [x, y + h, z - w / 2], [x, y + h + w * 0.55, z], [1, 0, 0], 3, 1); }
    else { quad(m, [x + 0.015, y - 0.16, z - w / 2 - 0.16], [x + 0.015, y - 0.16, z + w / 2 + 0.16], [x + 0.015, y + h, z + w / 2 + 0.16], [x + 0.015, y + h, z - w / 2 - 0.16], [-1, 0, 0], 4, 1, 1); quad(m, [x, y, z - w / 2], [x, y, z + w / 2], [x, y + h, z + w / 2], [x, y + h, z - w / 2], [-1, 0, 0], 3, 1, 1); tri(m, [x, y + h, z - w / 2], [x, y + h, z + w / 2], [x, y + h + w * 0.55, z], [-1, 0, 0], 3, 1); }
  }
  function minaret(m, x, z) {
    lat(m, pf([[1.25, 0.9], [0.95, 16]]), 14, x, 0, z, 1, 1, 1, 0, 0.5, 1);
    [7.4, 12.6].forEach(function (y) { lat(m, pf([[0.9, y], [1.6, y], [1.6, y + 0.32], [0.9, y + 0.32]]), 16, x, 0, z, 1, 1, 1, 4, 1, 1); });
    lat(m, pf([[0.8, 16], [1.15, 16.1], [0.65, 17.6], [0.0, 20]]), 16, x, 0, z, 1, 1, 1, 2, 0.8, 1);
    lat(m, pf([[0, 0], [0.12, 0.1], [0.09, 1.7], [0, 1.8]]), 8, x, 20, z, 1, 1, 1, 4, 1, 1); crescent(m, x, 22.0, z, 0.7);
    [7.4, 12.6].forEach(function (y) { lat(m, pf([[1.5, y + 0.32], [1.5, y + 1.1]]), 16, x, 0, z, 1, 1, 1, 0, 0.6, 1); lat(m, pf([[1.42, y + 1.1], [1.62, y + 1.1], [1.62, y + 1.22], [1.42, y + 1.22]]), 16, x, 0, z, 1, 1, 1, 4, 1, 1); });
  }
  function palm(m, x, z, hg, sd) {
    lat(m, pf([[0.34, 0], [0.24, hg * 0.5], [0.17, hg]]), 8, x, 0.45, z, 1, 1, 1, 6, 0.6, 1);
    var f, s, k, a, L = hg * 0.55, y0 = 0.45 + hg, base, t, yy, rr, ww, cx, cz, q;
    for (f = 0; f < 9; f++) {
      a = sd * 1.7 + f / 9 * TAU; cx = Math.cos(a); cz = Math.sin(a); base = m.p.length / 3;
      for (s = 0; s <= 6; s++) {
        t = s / 6; yy = y0 + L * (0.42 * t - 0.62 * t * t); rr = L * t * 0.9; ww = 0.55 * Math.sin(PI * Math.pow(t, 0.7)) + 0.02;
        for (k = -1; k <= 1; k += 2) { m.p.push(x + cx * rr - cz * ww * k, yy, z + cz * rr + cx * ww * k); m.n.push(0, 1, 0); m.u.push(5, 0.6 + 0.4 * t); }
      }
      for (s = 0; s < 6; s++) { q = base + s * 2; m.i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2, q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
  }
  (function () {
    var m = Mb(), i, x;
    lat(m, pf([[0, -1.6], [1, -1.6], [1, 0], [0.97, 0.38], [0, 0.45]]), 56, 0, 0, 0, 34, 1, 18.5, 7, 0.5, 1);
    box(m, 0, 0.4, 0, 30, 0.5, 18, 6); box(m, 0, 0.9, 0, 17, 6.5, 11, 0); box(m, 0, 7.4, 0, 17.6, 0.5, 11.6, 4);
    lat(m, pf([[5.4, 0], [5.4, 2.3]]), 32, 0, 7.9, 0, 1, 1, 1, 0, 0.6, 1);
    lat(m, domeP(5.6, 6.4), 40, 0, 10.2, 0, 1, 1, 1, 2, 0.7, 1);
    lat(m, pf([[0, 0], [0.16, 0.15], [0.12, 2.6], [0, 2.7]]), 10, 0, 16.5, 0, 1, 1, 1, 4, 1, 1); crescent(m, 0, 19.5, 0, 1.0);
    [[-7, -4.2], [7, -4.2], [-7, 4.2], [7, 4.2]].forEach(function (c) {
      lat(m, pf([[1.7, 0], [1.7, 1.5]]), 20, c[0], 7.9, c[1], 1, 1, 1, 0, 0.6, 1); lat(m, domeP(1.9, 2.3), 24, c[0], 9.4, c[1], 1, 1, 1, 2, 0.7, 1);
      lat(m, pf([[0, 0], [0.08, 0.1], [0.07, 1.1], [0, 1.15]]), 8, c[0], 11.7, c[1], 1, 1, 1, 4, 1, 1); crescent(m, c[0], 13.1, c[1], 0.45);
    });
    box(m, 0, 0.9, 7.6, 9, 4.8, 4.0, 0); gable(m, 0, 5.7, 7.6, 10.4, 4.8, 2.4, 1);
    minaret(m, -12.5, 6.6); minaret(m, 12.5, 6.6);
    [-6.4, 6.4].forEach(function (wx) { winZ(m, wx, 2.2, 5.54, 1.5, 3.0); });
    [-2.9, 0, 2.9].forEach(function (wx) { winZ(m, wx, 1.4, 9.64, 1.6, 2.6); });
    [-3.5, 0, 3.5].forEach(function (wz) { winX(m, 8.54, 2.2, wz, 1.4, 3.0, 1); winX(m, -8.54, 2.2, wz, 1.4, 3.0, -1); });
    [-24, 24].forEach(function (bx) {
      box(m, bx, 0.45, -1, 13, 5, 7, 0); gable(m, bx, 5.45, -1, 14.4, 8.4, 2.8, 1);
      for (i = -2; i <= 2; i++) { winZ(m, bx + i * 2.6, 1.4, 2.54, 1.0, 1.2); winZ(m, bx + i * 2.6, 3.3, 2.54, 1.0, 1.2); }
    });
    box(m, 0, 0.4, 13.5, 8, 0.3, 8, 6); pyr(m, 0, 3.7, 13.5, 9.4, 9.4, 2.8, 1);
    [[-3, 10.5], [3, 10.5], [-3, 16.5], [3, 16.5]].forEach(function (p) { box(m, p[0], 0.7, p[1], 0.45, 3.0, 0.45, 0); });
    [[-14, 12, 8], [14, 12, 8], [-31, 5, 7.5], [31, 5, 7.5], [-10, -11, 7.5], [10, -11, 7.5], [-24, -8, 7], [24, -8, 7]].forEach(function (p, k) { palm(m, p[0], p[1], p[2], k + 1); });
    D.bld = N.drawable(gl, N.geo.pack(m.p, m.n, m.u, null, m.i));
  })();
  D.mist1 = N.drawable(gl, N.geo.quadXZ(160, 100, floorY + 0.7)); D.mist2 = N.drawable(gl, N.geo.quadXZ(160, 100, floorY + 2.1));
  /* particles */
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var rr = rnd(97), NP = 2800, pts = new Float32Array(NP * 4), i;
  for (i = 0; i < NP; i++) pts.set([(rr() - 0.5) * 22, rr() * 9.5 - 3, (rr() - 0.5) * 14 - 1, rr()], i * 4);
  var NB = 26, bok = new Float32Array(NB * 4);
  for (i = 0; i < NB; i++) bok.set([(rr() - 0.5) * 20, rr() * 9.5 - 3, (rr() - 0.35) * 16, rr()], i * 4);
  function ptsVao(data) { var v = gl.createVertexArray(); gl.bindVertexArray(v); N.bindBuf(gl, 0, data, 4); gl.bindVertexArray(null); return v; }
  var vaoPts = ptsVao(pts), vaoBok = ptsVao(bok);
  var NF = 220, fly = new Float32Array(NF * 4), rf2 = rnd(808);
  for (i = 0; i < NF; i++) { fly[i * 4] = (rf2() - 0.5) * 84; fly[i * 4 + 1] = floorY + 0.25 + rf2() * 3.4; fly[i * 4 + 2] = -62 + rf2() * 70; fly[i * 4 + 3] = rf2(); }
  var vaoFly = ptsVao(fly);
  var NL = 40, lan = new Float32Array(NL * 4), rl = rnd(612);
  for (i = 0; i < NL; i++) { lan[i * 4] = (rl() - 0.5) * 22; lan[i * 4 + 1] = 0; lan[i * 4 + 2] = -42 + rl() * 16; lan[i * 4 + 3] = rl(); }
  var vaoLan = ptsVao(lan);
  /* coins */
  var rc = rnd(4242), NC = 80, coins = [];
  for (i = 0; i < NC; i++) coins.push({ rad: 4.3 + rc() * 2.6, th: rc() * TAU, w: (0.05 + rc() * 0.11) * (rc() > 0.5 ? 1 : -1), y: -1.4 + rc() * 4.0, bob: 0.15 + rc() * 0.3, f: 0.4 + rc() * 0.8, ph: rc() * TAU, s: 0.34 + rc() * 0.30, tum: 0.4 + rc() * 0.9 });
  var coinData = new Float32Array(NC * 16);

  /* HUD 3D: saldo berelief + grafik tabung/area */
  var HWd = 2048, HHt = 256;
  var hud = { txt: '', key: '', neg: false, fw: '800', ff: 'ui-sans-serif, system-ui, sans-serif', pulse: 0, amt: null, chart: null, cw: 0, ch: 0, ser: null, dirty: false, poly: null, dp: null, hc: 0, rev: 0, line: null, area: null, cvs: document.createElement('canvas') };
  hud.cvs.width = HWd; hud.cvs.height = HHt; hud.c2 = hud.cvs.getContext('2d');
  hud.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, hud.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  (function () {
    var nx = 400, ny = 50, pos = [], nor = [], uv = [], idx = [], i, j, a;
    for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) { pos.push((i / nx - 0.5) * 8, 0.5 - j / ny, 0); nor.push(0, 0, 1); uv.push(i / nx, j / ny); }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    D.text = N.drawable(gl, N.geo.pack(pos, nor, uv, null, idx));
  })();
  D.cb = N.drawable(gl, N.geo.lathe(N.geo.profSphere(12), 16, 0, TAU), new Float32Array(16));
  function freeD(d) { if (!d) return; d.bufs.forEach(function (b) { gl.deleteBuffer(b); }); gl.deleteBuffer(d.ib); gl.deleteVertexArray(d.vao); }
  function cr(a, b, c, d, t) { return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t); }
  function renderMask() {
    var c = hud.c2, s = 240, w;
    c.clearRect(0, 0, HWd, HHt); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = hud.fw + ' ' + s + 'px ' + hud.ff; w = c.measureText(hud.txt).width;
    if (w > 1960) { s = Math.floor(s * 1960 / w); c.font = hud.fw + ' ' + s + 'px ' + hud.ff; }
    c.fillText(hud.txt, HWd / 2, HHt / 2 + s * 0.30);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hud.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, hud.cvs); gl.generateMipmap(gl.TEXTURE_2D);
  }
  function buildChart() {
    hud.dirty = false; freeD(hud.line); freeD(hud.area); freeD(hud.axis); hud.line = hud.area = hud.axis = hud.poly = null;
    var s = hud.ser, r = hud.chart; if (!s || s.length < 2 || !r || r.w < 8) return;
    var n = s.length, hc = 2 * r.h / r.w, lo = Math.min.apply(null, s), hi = Math.max.apply(null, s), rg = (hi - lo) || 1, y0 = hc * 0.08, y1 = hc * 0.84;
    var ys = s.map(function (v) { return y0 + (v - lo) / rg * (y1 - y0); }), xs = ys.map(function (_, i) { return -1 + 2 * i / (n - 1); });
    var poly = [], pos = [], nor = [], idx = [], i, k, y, at;
    for (i = 0; i < n - 1; i++) for (k = 0; k < 10; k++) { y = cr(ys[Math.max(0, i - 1)], ys[i], ys[i + 1], ys[Math.min(n - 1, i + 2)], k / 10); poly.push([xs[i] + (xs[i + 1] - xs[i]) * k / 10, clamp(y, 0.01, hc), 0]); }
    poly.push([1, ys[n - 1], 0]);
    for (i = 0; i < poly.length; i++) { pos.push(poly[i][0], poly[i][1], 0, poly[i][0], 0, 0); nor.push(0, 0, 1, 0, 0, 1); if (i) { at = 2 * (i - 1); idx.push(at, at + 1, at + 2, at + 1, at + 3, at + 2); } }
    hud.axis = N.drawable(gl, N.geo.tube([[-1, 0.004, 0], [1, 0.004, 0]], 0.008, 6)); hud.line = N.drawable(gl, N.geo.tube(poly, 0.03, 8)); hud.area = N.drawable(gl, N.geo.pack(pos, nor, null, null, idx));
    hud.poly = poly; hud.hc = hc; hud.dp = xs.map(function (x, i) { return [x, ys[i]]; }); hud.arr = new Float32Array(n * 16);
  }
  function headAt(x) {
    var p = hud.poly, i = 1; if (x <= p[0][0]) return p[0][1];
    while (i < p.length - 1 && p[i][0] < x) i++;
    var a = p[i - 1], b = p[i]; return a[1] + (b[1] - a[1]) * clamp((x - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
  }
  H.setBalance = function (txt, neg, fw, ff) {
    var key = txt + '|' + fw + '|' + ff; if (key === hud.key && neg === hud.neg) return;
    if (hud.key && txt !== hud.txt) hud.pulse = 0.7;
    hud.key = key; hud.txt = txt; hud.neg = neg; hud.fw = fw || '800'; hud.ff = ff || hud.ff; if (!H.lost) renderMask();
  };
  H.setSeries = function (a) { hud.ser = a && a.length > 1 ? a : null; hud.dirty = true; };
  H.setRects = function (a, c, w, h) {
    if (!hud.chart || !c || c.w !== hud.chart.w || Math.abs(c.h / c.w - hud.chart.h / hud.chart.w) > 0.01) hud.dirty = true;
    hud.amt = a; hud.chart = c; hud.cw = w; hud.ch = h;
  };
  H.settle = function () { hud.rev = 1; hud.pulse = 0; terJob.fade = 1; treeJob.fade = 1; };
  H.treeInfo = function () { var c = D.treeC, b = D.treeB, p = D.treeP; return { ready: treeJob.ready, nC: treeJob.nC, nB: treeJob.nB, nP: treeJob.nP, lod: treeJob.lod, slices: treeJob.slices, maxSliceMs: +treeJob.maxMs.toFixed(2), totalMs: +treeJob.ms.toFixed(1), trisC: c ? c.n / 3 : 0, trisB: b ? b.n / 3 : 0, trisP: p ? p.n / 3 : 0 }; };

  /* render targets */
  var T = {};
  function freeTargets() { ['scene', 'b0a', 'b0b', 'b1a', 'b1b', 'cloud', 'refl', 'dof', 'ray'].forEach(function (k) { N.freeTarget(gl, T[k]); T[k] = null; }); if (T.depth) gl.deleteTexture(T.depth); T.depth = null; }
  function buildTargets() {
    freeTargets();
    var w = H.w, h = H.h, hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    var ms = opt.samples === undefined ? H.cfg.ms : opt.samples; while (ms > 2 && w * h * ms > 2.1e7) ms >>= 1;
    T.scene = N.makeTarget(gl, w, h, { float: hdr, samples: ms, depth: true });
    T.b0a = N.makeTarget(gl, hw, hh, { float: hdr }); T.b0b = N.makeTarget(gl, hw, hh, { float: hdr });
    T.b1a = N.makeTarget(gl, qw, qh, { float: hdr }); T.b1b = N.makeTarget(gl, qw, qh, { float: hdr });
    T.cloud = N.makeTarget(gl, hw, hh, { float: hdr });
    if (opt.reflect !== false) { T.refl = N.makeTarget(gl, Math.max(2, Math.round(w * H.cfg.rf)), Math.max(2, Math.round(h * H.cfg.rf)), { float: hdr, depth: true }); gl.bindTexture(gl.TEXTURE_2D, T.refl.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    if (H.cfg.df > 0 && T.scene.msFb && opt.dof !== false) {
      var dtx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dtx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dtx, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { T.depth = dtx; T.dof = N.makeTarget(gl, hw, hh, { float: hdr }); T.ray = H.cfg.gr > 0 ? N.makeTarget(gl, hw, hh, { float: hdr }) : null; }
      else { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0); gl.deleteTexture(dtx); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }
  H.resize = function (cssW, cssH, dprIn) {
    var dpr = dprIn || opt.dpr || Math.min(root.devicePixelRatio || 1, 2.5);
    var w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    var cap = H.cfg.px; if (w * h > cap) { var k = Math.sqrt(cap / (w * h)); w = Math.round(w * k); h = Math.round(h * k); dpr *= k; }
    if (w === H.w && h === H.h) return;
    H.w = w; H.h = h; H.dpr = dpr; H.cssW = cssW; H.cssH = cssH; canvas.width = w; canvas.height = h; buildTargets();
  };

  H.setLevel = function (n) { n = clamp(n | 0, 0, 3); var old = H.cfg.ms, oldR = H.cfg.rf, oldD = H.cfg.df > 0; H.lv = n; H.cfg = LV[n]; if (H.w && (H.cfg.ms !== old || H.cfg.rf !== oldR || (H.cfg.df > 0) !== oldD)) buildTargets(); if (treeJob.ready && treeJob.lod !== H.cfg.tl) treeDraw(); return H.cfg; };
  H.info = function () {
    var e = gl.getExtension('WEBGL_debug_renderer_info'), g;
    try { g = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (x) { g = 'GPU'; }
    return { gpu: g, samples: T.scene ? T.scene.ms : 0, w: H.w, h: H.h, dpr: H.dpr, lv: H.lv };
  };

  function U(p) { return function (k, a, b, c, d) { var l = p.U[k]; if (l == null) return; if (d !== undefined) gl.uniform4f(l, a, b, c, d); else if (c !== undefined) gl.uniform3f(l, a, b, c); else if (b !== undefined) gl.uniform2f(l, a, b); else gl.uniform1f(l, a); }; }
  function U3(p, k, v) { var l = p.U[k]; if (l != null) gl.uniform3f(l, v[0], v[1], v[2]); }
  function UM(p, k, m) { var l = p.U[k]; if (l != null) gl.uniformMatrix4fv(l, false, m); }

  function setLighting(p, pl, cam, t) {
    var u = U(p);
    U3(p, 'uCam', cam); u('uTime', t);
    var kd = [-0.5, 0.8, 0.6], fd = [0.8, 0.25, -0.35], rd = [0.0, 0.35, -1.0];
    U3(p, 'uKeyD', kd); U3(p, 'uKeyC', pl.key); U3(p, 'uFillD', fd); U3(p, 'uFillC', pl.fill); U3(p, 'uRimD', rd); U3(p, 'uRimC', pl.rim);
    U3(p, 'uAmbT', pl.ambT); U3(p, 'uAmbB', pl.ambB); U3(p, 'uSkyT', pl.skyT); U3(p, 'uSkyH', pl.skyH); U3(p, 'uGndC', pl.gnd);
    U3(p, 'uSoftA', pl.softA); U3(p, 'uSoftB', pl.softB); U3(p, 'uFogC', pl.fog); u('uFogK', 0.012);
  }
  function drawMat(p, d, mat, model, kind, mir, aux, clip) {
    var u = U(p); UM(p, 'uModel', model); u('uMat', mat.m, mat.r, mat.e, 1.0); u('uCC', mat.m > 0.9 && !mir ? H.cfg.cc : 0); u('uKind', kind || 0); u('uAux', aux || 0); u('uClip', clip === undefined ? 1e4 : clip);
    if (mir) u('uMir', 1, floorY, 0.32, 0.55); else u('uMir', 0, floorY, 0, 1);
    N.draw(gl, d, mat.c);
  }

  /* one full frame. inp = {t, dt, px, py, scroll} */
  H.frame = function (t, dt) {
    if (H.lost || !H.w) return;
    var pl = {}, k; for (k in PAL.night) pl[k] = pal(k, H.day);
    /* smooth input */
    var a = 1 - Math.exp(-dt * 3.2); H.cam.x += (H.pointer.x - H.cam.x) * a; H.cam.y += (H.pointer.y - H.cam.y) * a;
    H.sScroll += (H.scroll - H.sScroll) * (1 - Math.exp(-dt * 5)); var sp = H.sScroll, iv = 1 - H.intro;
    var asp = H.w / H.h, fovy = 30 * PI / 180 - sp * 0.10;
    var dist = Math.max(11.6, 3.6 / (Math.tan(fovy / 2) * asp)) - sp * 3.2 + iv * 6.5;
    var ex = H.cam.x * 1.25 + Math.sin(t * 0.11) * 0.25, ey = 1.0 + H.cam.y * 0.8 + sp * 2.0 + iv * 0.7, ez = dist;
    var tx = H.cam.x * 0.25, ty = 0.45 + sp * 0.6, tz = 0;
    var shiftY = opt.shiftY === undefined ? (asp < 0.8 ? 0.30 : 0.05) : opt.shiftY;
    var V = M.look(ex, ey, ez, tx, ty, tz), Pm = M.persp(fovy, asp, 0.5, 700, 0, shiftY), VP = M.mul(Pm, V), cam = [ex, ey, ez];
    H.vp = VP;
    var starPos = M.proj(VP, 0, 0.55, 0, 1, 1);
    var hx = tx - ex, hz = tz - ez, hl = Math.hypot(hx, hz), hor = M.proj(VP, ex + hx / hl * 4000, ey, ez + hz / hl * 4000, 1, 1);
    if (terJob.ready && terJob.fade < 1) terJob.fade = Math.min(1, terJob.fade + dt / 1.1);
    if (treeJob.ready && treeJob.fade < 1 && terJob.fade > 0.5) treeJob.fade = Math.min(1, treeJob.fade + dt / 1.6);
    var nTr = H.cfg.nt;
    var cfg = H.cfg, tanH = Math.tan(fovy / 2), srx = [V[0], V[4], V[8]], sux = [V[1], V[5], V[9]], sbk = [V[2], V[6], V[10]], dk = H.day;
    var sNdc = [0.64, 0.60], sunC = [mix(0.62, 3.0, dk), mix(0.78, 2.6, dk), mix(1.0, 1.7, dk)], sdir = [0, 0, 0], sln, qq;
    for (qq = 0; qq < 3; qq++) sdir[qq] = -sbk[qq] + srx[qq] * sNdc[0] * tanH * asp + sux[qq] * (sNdc[1] - shiftY) * tanH;
    sln = Math.hypot(sdir[0], sdir[1], sdir[2]); sdir = [sdir[0] / sln, sdir[1] / sln, sdir[2] / sln];
    var dN = Math.max(11.6, 3.6 / (0.26795 * asp)), zI = -34, dI = dN - zI, hwI = 0.26795 * asp * dI, sI = clamp(Math.min(0.0858 * dI / 22 * 2.1, 0.36 * hwI / 14.2), 0.05, 1.0);
    var islandM = M.mul(M.T((asp > 1 ? -0.52 : -0.30) * hwI, floorY, zI), M.S(sI, sI, sI)), islC = [(asp > 1 ? -0.52 : -0.30) * hwI, zI, 34 * sI, 18.5 * sI];
    var kd = [-0.5, 0.8, 0.6], haze2 = [mix(0.012, 0.52, dk), mix(0.060, 0.66, dk), mix(0.060, 0.80, dk)];
    var sceneT = T.scene, u;

    /* ---- awan volumetrik (setengah resolusi) ---- */
    var camF = [-sbk[0], -sbk[1], -sbk[2]], sunCl = [mix(0.50, 2.2, dk), mix(0.62, 1.9, dk), mix(0.80, 1.3, dk)], ambCl = [mix(0.020, 0.55, dk), mix(0.045, 0.64, dk), mix(0.050, 0.74, dk)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.cloud.fb); gl.viewport(0, 0, T.cloud.w, T.cloud.h); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(pCloud.p); u = U(pCloud);
    U3(pCloud, 'uCR', srx); U3(pCloud, 'uCU', sux); U3(pCloud, 'uCF', camF); U3(pCloud, 'uCam', cam); U3(pCloud, 'uSunD', sdir); U3(pCloud, 'uSunC', sunCl); U3(pCloud, 'uAmb', ambCl); U3(pCloud, 'uHorC', pl.hor);
    u('uTanH', tanH); u('uAsp', asp); u('uShY', shiftY); u('uTime', t); u('uDay', dk); u('uCStep', cfg.cl); u('uCOct', cfg.co);
    gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* models */
    var rotY = 0.55 * Math.sin(t * 0.35) + H.cam.x * 0.55 + iv * 1.6, rotX = -0.10 + 0.09 * Math.sin(t * 0.27) + H.cam.y * 0.25;
    var bob = 0.08 * Math.sin(t * 0.9) + sp * 0.5, base = M.mul(M.T(0, 0.55 + bob, 0), M.mul(M.RY(rotY), M.RX(rotX)));
    var inlayM = M.mul(base, M.RZ(t * 0.10)), coreM = M.mul(base, M.RZ(-t * 0.16));
    var jewelM = M.mul(base, M.mul(M.T(0, 0, 0.34), M.S(0.26, 0.26, 0.26)));
    var ringMs = [
      M.mul(M.T(0, 0.55 + bob, 0), M.mul(M.RY(t * 0.13 + rotY * 0.3), M.mul(M.RX(1.30 + 0.06 * Math.sin(t * 0.4)), M.RY(t * 0.30)))),
      M.mul(M.T(0, 0.55 + bob, 0), M.mul(M.RY(-t * 0.10 + 0.9), M.mul(M.RX(0.62), M.mul(M.RZ(0.35), M.RY(-t * 0.22))))),
      M.mul(M.T(0, 0.55 + bob, 0), M.mul(M.RY(t * 0.07), M.mul(M.RX(0.20 + 0.05 * Math.sin(t * 0.3)), M.RY(t * 0.15))))
    ];
    /* coins */
    for (i = 0; i < cfg.nc; i++) {
      var c = coins[i], th = c.th + t * c.w;
      coinData.set([c.rad * Math.cos(th), c.y + c.bob * Math.sin(t * c.f + c.ph), c.rad * Math.sin(th) - 1.2, c.s, 0.3 * Math.sin(t * 0.2 + c.ph), t * c.tum + c.ph, 0.4 * Math.sin(t * 0.3 + c.ph), 0, 1, 0, 0, 0, 1.0, 0.74, 0.32, 1], i * 16);
    }
    N.setInst(gl, D.coin, coinData, cfg.nc);

    function landU(p, mir) {
      var q = U(p); gl.useProgram(p.p); UM(p, 'uVP', VP); U3(p, 'uCam', cam); q('uTime', t); q('uDay', dk);
      U3(p, 'uKeyD', kd); U3(p, 'uKeyC', pl.key); U3(p, 'uAmbT', pl.ambT); U3(p, 'uAmbB', pl.ambB); U3(p, 'uHaze2', haze2); U3(p, 'uHorC', pl.hor); U3(p, 'uSunC', sunC); U3(p, 'uSkyT', pl.skyT); U3(p, 'uSkyH', pl.skyH);
      U3(p, 'uSunD', sdir); U3(p, 'uLd', LD); q('uShSteps', cfg.sh);
      q('uFogK', 0.0036); q('uOct', cfg.oct); q('uShore', floorY); q('uMir', mir ? 1 : 0, floorY, mir ? 0.012 : 0, mir ? 0.9 : 1);
    }
    function drawTrees(mir) {
      var tot = treeJob.nC + treeJob.nB; if (!D.treeC || !nTr || !tot) return;
      landU(pTree, mir); U(pTree)('uFade', treeJob.fade);
      var f = Math.min(1, (mir ? Math.round(nTr * H.cfg.tr) : nTr) / tot);
      D.treeC.count = Math.round(treeJob.nC * f); N.draw(gl, D.treeC, [1, 1, 1, 1]);
      D.treeB.count = Math.round(treeJob.nB * f); N.draw(gl, D.treeB, [1, 1, 1, 1]);
      D.treeP.count = Math.round(treeJob.nP * f); N.draw(gl, D.treeP, [1, 1, 1, 1]);
    }
    function drawLanterns(mir) {
      if (cfg.nl <= 0 || dk > 0.9) return;
      gl.useProgram(pLan.p); var q = U(pLan); UM(pLan, 'uVP', VP); q('uTime', t); q('uSize', 1.6 * (mir ? rfT.h : H.h) / 0.536); q('uInt', Math.pow(1 - dk, 1.5) * 1.8); q('uFloor', floorY); q('uMir', mir ? 1 : 0, floorY, 0, 1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.bindVertexArray(vaoLan); gl.drawArrays(gl.POINTS, 0, cfg.nl); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    function drawLand(mir) {
      if (D.terrain) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hgtTex); landU(pTer, mir); gl.uniform1i(pTer.U.uHgt, 2); gl.activeTexture(gl.TEXTURE0); UM(pTer, 'uModel', M.id()); U(pTer)('uFade', terJob.fade); N.draw(gl, D.terrain, [1, 1, 1, 1]); }
      drawTrees(mir); landU(pBld, mir); UM(pBld, 'uModel', islandM); N.draw(gl, D.bld, [1, 1, 1, 1]);
    }
    function drawMist() {
      gl.useProgram(pMist.p); var q = U(pMist); UM(pMist, 'uVP', VP); U3(pMist, 'uCam', cam); q('uTime', t); q('uDay', dk); q('uOct', cfg.oct); U3(pMist, 'uHorC', pl.hor); U3(pMist, 'uGlow', pl.glow); U3(pMist, 'uSunC', sunC);
      q('uLayer', 0); N.draw(gl, D.mist1); q('uLayer', 1); N.draw(gl, D.mist2);
    }
    function drawWorld(mir) {
      gl.frontFace(mir ? gl.CW : gl.CCW); drawLand(mir);
      gl.useProgram(pLit.p); setLighting(pLit, pl, cam, t); UM(pLit, 'uVP', VP);
      drawMat(pLit, D.star, MAT.gold, base, 2, mir);
      drawMat(pLit, D.inlay, MAT.emerald, inlayM, 0, mir);
      drawMat(pLit, D.core, MAT.gold, coreM, 0, mir);
      drawMat(pLit, D.jewel, MAT.jewel, jewelM, 0, mir);
      for (var r = 0; r < 3; r++) {
        drawMat(pLit, D.rings[r], MAT.goldRing, ringMs[r], 0, mir);
        N.setInst(gl, D.beads, ringBeads[r].data, ringBeads[r].n);
        drawMat(pLit, D.beads, MAT.bead, ringMs[r], 0, mir);
      }
      drawMat(pLit, D.coin, MAT.coin, M.id(), 1, mir);
      gl.frontFace(gl.CCW);
    }

    function drawHud() {
      gl.useProgram(pLit.p); hud.pulse *= Math.exp(-dt * 2.6);
      if (hud.dirty && hud.chart) buildChart();
      if (hud.poly && H.intro > 0.7 && hud.rev < 1) hud.rev = Math.min(1, hud.rev + dt / 1.9);
      if (!hud.amt || !hud.cw || !hud.txt) return;
      var hs = clamp((H.intro - 0.55) / 0.45, 0, 1); hs = hs * hs * (3 - 2 * hs) * (1 - 0.3 * sp);
      if (hs < 0.01) return;
      var dH = 5.2, hH = Math.tan(fovy / 2) * dH, hW = hH * asp, dy = -sp * 34, day = H.day, tp = hud.pulse;
      var rx = [V[0], V[4], V[8]], ux = [V[1], V[5], V[9]], bk = [V[2], V[6], V[10]];
      function basis(r, oy, s) {
        var xv = (((r.x + r.w / 2) / hud.cw) * 2 - 1) * hW, yv = ((1 - ((r.y + oy + dy) / hud.ch) * 2) - shiftY) * hH, q;
        var m = [rx[0] * s, rx[1] * s, rx[2] * s, 0, ux[0] * s, ux[1] * s, ux[2] * s, 0, bk[0] * s, bk[1] * s, bk[2] * s, 0, 0, 0, 0, 1];
        for (q = 0; q < 3; q++) m[12 + q] = cam[q] + rx[q] * xv + ux[q] * yv - bk[q] * dH;
        return M.mul(m, M.mul(M.RY(H.cam.x * 0.22), M.RX(-H.cam.y * 0.12)));
      }
      var a = hud.amt, wv = a.w / hud.cw * 2 * hW, hv = a.h / hud.ch * 2 * hH;
      var tc = hud.neg ? [mix(1.0, 0.62, day), mix(0.55, 0.10, day), mix(0.42, 0.05, day)] : [mix(1.0, 0.03, day), mix(0.76, 0.36, day), mix(0.34, 0.20, day)];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hud.tex); gl.uniform1i(pLit.U.uMask, 0);
      var tm = basis(a, a.h / 2, Math.min(wv / 8, hv) * hs);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      drawMat(pLit, D.text, { c: [mix(0.0, 0.30, day), mix(0.03, 0.22, day), mix(0.02, 0.10, day), mix(0.85, 0.42, day)], m: 0, r: 1, e: 0 }, M.mul(tm, M.T(0, 0, -0.1)), 5, false);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      drawMat(pLit, D.text, { c: [tc[0], tc[1], tc[2], 1], m: mix(0.85, 0.35, day), r: 0.26, e: mix(0.22, 0.0, day) + tp * 0.7 }, tm, 3, false, 0.14);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      if (!hud.poly || !hud.chart) return;
      var c = hud.chart, cm = basis(c, c.h, c.w / hud.cw * hW * hs), clip = 1e4, hx = 1, hy = hud.poly[hud.poly.length - 1][1], n2 = 0, arr = hud.arr, pul = 1 + 0.16 * Math.sin(t * 3.2) + tp * 0.5;
      if (hud.rev < 1) { clip = -1.02 + 2.04 * (1 - Math.pow(1 - hud.rev, 3)); hx = clip; hy = headAt(clip); }
      drawMat(pLit, hud.axis, { c: [1.0, 0.8, 0.42, 1], m: 0.4, r: 0.5, e: mix(0.6, 0.1, day) }, cm, 0, false);
      drawMat(pLit, hud.line, { c: [mix(0.25, 0.0, day), mix(1.0, 0.16, day), mix(0.68, 0.09, day), 1], m: mix(0.2, 0.0, day), r: mix(0.25, 0.9, day), e: mix(1.0, 0.0, day) }, cm, 0, false, 0, clip);
      hud.dp.forEach(function (p) { if (p[0] <= clip) arr.set([p[0], p[1], 0, 0.04, 0, 0, 0, 0, 1, 0, 0, 0, mix(1.0, 0.95, day), mix(0.78, 0.62, day), mix(0.34, 0.12, day), 1], n2++ * 16); });
      if (n2) { N.setInst(gl, D.cb, arr, n2); drawMat(pLit, D.cb, { c: MAT.bead.c, m: 0, r: 0.1, e: mix(1.2, 0.25, day) }, cm, 0, false); }
      drawMat(pLit, D.bead, MAT.jewel, M.mul(cm, M.mul(M.T(hx, hy, 0), M.S(0.05 * pul, 0.05 * pul, 0.05 * pul))), 0, false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(false);
      drawMat(pLit, hud.area, { c: [mix(0.22, 0.10, day), mix(1.0, 0.62, day), mix(0.66, 0.38, day), 1], m: 0, r: 0.6, e: mix(0.9, 0.7, day) }, cm, 4, false, hud.hc, clip);
      gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    }
    function drawSky(w, h, flip) {
      gl.useProgram(pBg.p); var u = U(pBg); u('uRes', w, h); u('uFlip', flip); u('uTime', t); u('uHor', 1 - hor[1]); u('uCenter', starPos[0], 1 - starPos[1]);
      u('uPar', H.cam.x * 0.6 + sp * 0.2, H.cam.y * 0.4 + sp * 0.9); u('uStars', pl.stars); u('uDay', H.day); u('uSun', sNdc[0] * 0.5 + 0.5, sNdc[1] * 0.5 + 0.5); u('uSunR', mix(0.030, 0.046, dk)); u('uMoon', 1 - dk); u('uOct', cfg.oct); U3(pBg, 'uSunC', sunC);
      U3(pBg, 'uTop', pl.top); U3(pBg, 'uHorC', pl.hor); U3(pBg, 'uGlow', pl.glow); U3(pBg, 'uPat', pl.pat);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.cloud.tex); gl.uniform1i(pBg.U.uCloud, 3); gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    }
    /* ---- pantulan air: render target terpisah setengah resolusi; dunia dicerminkan terhadap bidang air ---- */
    var rfT = opt.reflect !== false && cfg.rk > 0 ? T.refl : null;
    if (rfT) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rfT.fb); gl.viewport(0, 0, rfT.w, rfT.h);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      drawSky(rfT.w, rfT.h, 1);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      drawWorld(true); drawLanterns(true);
      gl.bindTexture(gl.TEXTURE_2D, rfT.tex); gl.generateMipmap(gl.TEXTURE_2D);
    }

    /* ---- scene pass (MSAA) ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.msFb || sceneT.fb); gl.viewport(0, 0, H.w, H.h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hud.tex);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawSky(H.w, H.h, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    /* lantai air, lalu dunia nyata (pantulan sudah dirender di target terpisah) */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    gl.useProgram(pFloor.p); u = U(pFloor); UM(pFloor, 'uVP', VP); U3(pFloor, 'uCam', cam); u('uTime', t); u('uFloorA', pl.floorA); u('uDay', dk); u('uFogK', 0.0135); u('uOct', cfg.oct); u('uIsl', islC[0], islC[1], islC[2], islC[3]); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, hgtTex); gl.uniform1i(pFloor.U.uHgt, 2); gl.activeTexture(gl.TEXTURE0); U3(pFloor, 'uSunD', sdir); U3(pFloor, 'uSunC', sunC);
    U3(pFloor, 'uFloorC', pl.floor); U3(pFloor, 'uTop', pl.top); U3(pFloor, 'uHorC', pl.hor); U3(pFloor, 'uGlow', pl.glow); U3(pFloor, 'uPat', pl.pat);
    u('uRK', rfT ? cfg.rk : 0); u('uRes', H.w, H.h);
    if (rfT) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, rfT.tex); gl.uniform1i(pFloor.U.uRefl, 4); gl.activeTexture(gl.TEXTURE0); u('uRSz', rfT.w, rfT.h); u('uRDist', 0.06); u('uRBlur', 4.5); u('uRF0', 0.45); u('uRFk', 1.5); }
    N.draw(gl, D.floor);
    gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); drawWorld(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE); gl.depthMask(false); drawMist(); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    drawHud();

    /* particles + bokeh (additive) */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    gl.useProgram(pPts.p); u = U(pPts); UM(pPts, 'uVP', VP); u('uTime', t); u('uSize', 46 * H.dpr); u('uInt', pl.pint * 1.1);
    U3(pPts, 'uPA', pl.pa); U3(pPts, 'uPB', pl.pb); u('uBokeh', 0); gl.bindVertexArray(vaoPts); gl.drawArrays(gl.POINTS, 0, cfg.np);
    u('uBokeh', 1); u('uSize', 46 * H.dpr); u('uInt', pl.pint * 1.0); gl.bindVertexArray(vaoBok); gl.drawArrays(gl.POINTS, 0, NB);
    if (cfg.nf > 0 && dk < 0.85) { gl.useProgram(pFly.p); u = U(pFly); UM(pFly, 'uVP', VP); u('uTime', t); u('uSize', 300 * H.dpr); u('uInt', (1 - dk) * (1 - dk) * 3.0); gl.bindVertexArray(vaoFly); gl.drawArrays(gl.POINTS, 0, cfg.nf); }
    drawLanterns(false);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);

    /* resolve MSAA */
    if (sceneT.msFb) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneT.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneT.fb);
      gl.blitFramebuffer(0, 0, H.w, H.h, 0, 0, H.w, H.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      if (T.depth && !H.noDepth) {
        var chk = (H.dchk | 0) < 3; if (chk) { H.dchk = (H.dchk | 0) + 1; gl.getError(); }
        gl.blitFramebuffer(0, 0, H.w, H.h, 0, 0, H.w, H.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        if (chk && gl.getError() !== gl.NO_ERROR) H.noDepth = true;
      }
    }
    /* ---- post ---- */
    gl.bindVertexArray(emptyVao);
    function pass(prog, target, w, h, setup) { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h); gl.useProgram(prog.p); setup(U(prog)); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    function tex(prog, name, tx, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx.tex); gl.uniform1i(prog.U[name], unit); }
    var dofOn = !!(T.dof && T.depth && !H.noDepth && cfg.df > 0), zf = -(V[6] * (0.55 + bob) + V[14]), apx = cfg.dm * H.h;
    var dofU = function (q) { q('uF', zf, apx, 0.18, apx * 0.6); q('uNF', 0.5, 700, 5.2); };
    if (dofOn) pass(pDof, T.dof, T.dof.w, T.dof.h, function (q) { tex(pDof, 'uTex', sceneT, 0); tex(pDof, 'uDepth', { tex: T.depth }, 1); q('uPx', 1 / H.w, 1 / H.h); q('uK', cfg.df); q('uBoost', cfg.db); dofU(q); });
    var rayOn = !!(T.depth && !H.noDepth && cfg.gr > 0 && T.ray && T.cloud);
    var flareOn = !!(T.depth && !H.noDepth && cfg.lf > 0 && T.cloud);
    if (rayOn) pass(pRay, T.ray, T.ray.w, T.ray.h, function (q) { tex(pRay, 'uDepth', { tex: T.depth }, 1); tex(pRay, 'uCloud', T.cloud, 2); q('uSun', 0.82, 0.80); q('uRes', H.w, H.h); q('uSteps', cfg.gr); });
    pass(pBright, T.b0a, T.b0a.w, T.b0a.h, function (q) { tex(pBright, 'uTex', sceneT, 0); q('uThr', pl.thr); });
    pass(pBlur, T.b0b, T.b0b.w, T.b0b.h, function (q) { tex(pBlur, 'uTex', T.b0a, 0); q('uDir', 1 / T.b0a.w, 0); });
    pass(pBlur, T.b0a, T.b0a.w, T.b0a.h, function (q) { tex(pBlur, 'uTex', T.b0b, 0); q('uDir', 0, 1 / T.b0a.h); });
    pass(pBlur, T.b1a, T.b1a.w, T.b1a.h, function (q) { tex(pBlur, 'uTex', T.b0a, 0); q('uDir', 1 / T.b1a.w, 0); });
    pass(pBlur, T.b1b, T.b1b.w, T.b1b.h, function (q) { tex(pBlur, 'uTex', T.b1a, 0); q('uDir', 0, 1 / T.b1b.h); });
    pass(pBlur, T.b1a, T.b1a.w, T.b1a.h, function (q) { tex(pBlur, 'uTex', T.b1b, 0); q('uDir', 1 / T.b1a.w, 0); });
    pass(pBlur, T.b1b, T.b1b.w, T.b1b.h, function (q) { tex(pBlur, 'uTex', T.b1a, 0); q('uDir', 0, 1 / T.b1b.h); });
    pass(pComp, null, H.w, H.h, function (q) {
      tex(pComp, 'uScene', sceneT, 0); tex(pComp, 'uB0', T.b0a, 1); tex(pComp, 'uB1', T.b1b, 2); q('uDofOn', dofOn ? 1 : 0); if (dofOn) { tex(pComp, 'uDof', T.dof, 3); tex(pComp, 'uDepth', { tex: T.depth }, 4); dofU(q); }
      q('uRayV', rayOn ? 1 : 0); q('uFlare', flareOn ? 1 : 0);
      if (rayOn || flareOn) { tex(pComp, 'uDepth', { tex: T.depth }, 4); tex(pComp, 'uCloud', T.cloud, 5); if (rayOn) tex(pComp, 'uRay', T.ray, 6); q('uSun', 0.82, 0.80); dofU(q); var rk = mix(1.25, 1.0, dk); q('uRayS', mix(0.60, 1.0, dk) * rk, mix(0.78, 0.90, dk) * rk, mix(1.0, 0.68, dk) * rk); }
      q('uRes', H.w, H.h); q('uLight', starPos[0], 1 - starPos[1]); q('uTime', t); q('uBloom', pl.bloom * (1 + iv * 1.2)); q('uRays', pl.rays); q('uRayC', pl.glow[0], pl.glow[1], pl.glow[2]); q('uExpo', pl.expo * (0.45 + 0.55 * H.intro)); q('uVig', pl.vig); q('uSteps', cfg.rays); q('uSharp', cfg.sp);
    });
    gl.bindVertexArray(null);
  };

  function onLost(e) { e.preventDefault(); H.lost = true; }
  function onBack() { H.lost = false; H.w = 0; if (opt.onRestore) opt.onRestore(); }
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onBack);
  H.off = function () { terJob.dead = true; canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onBack); };
  H.dispose = function () { freeTargets(); var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); };
  return H;
}
N.Hero = Hero;
})(window);
