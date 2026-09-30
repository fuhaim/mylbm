/* ==========================================================================
   Nur3D hero -- the showpiece scene. Raw WebGL2, hand-written shaders.
   ========================================================================== */
(function (root) {
'use strict';
var N = root.Nur, M = N.M, G = N.GLSL, PI = N.PI, TAU = N.TAU, lin = N.lin, mix = N.mix, clamp = N.clamp;

/* ---------- shaders ---------- */
var FS_TRI = G.head + 'out vec2 vUv;\nvoid main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); vUv = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }';

var BG_FS = [G.head, 'in vec2 vUv; out vec4 o;',
  'uniform vec2 uRes, uCenter, uPar; uniform float uTime, uHor, uStars, uDay;',
  'uniform vec3 uTop, uHorC, uGlow, uPat;',
  G.noise, G.pattern,
  'void main(){',
  '  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y;',
  '  vec2 p = (uv - 0.5) * vec2(asp, 1.0);',
  '  float h = uv.y - uHor;',
  '  float t = clamp(h / 0.9, 0.0, 1.0);',
  '  vec3 col = mix(uHorC, uTop, pow(t, 0.62));',
  '  if (h < 0.0) col = uHorC * (1.0 + h * 0.5);',
  '  vec2 hp = (uv - uCenter) * vec2(asp, 1.0); float hd = length(hp);',
  '  col += uGlow * (0.55 * exp(-hd*hd*4.2) + 0.22 * exp(-hd*1.7) + 0.20 * exp(-pow(abs(hd - 0.40), 2.0) * 220.0));',
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
  '  col += mix(vec3(0.02, 0.17, 0.13), vec3(0.20, 0.12, 0.02), nb2) * pow(nb, 2.4) * 1.7 * smoothstep(-0.05, 0.35, h) * (1.0 - uDay * 0.8);',
  '  float pat = starLines(p * 3.0 + uPar * 0.55 + vec2(0.0, uTime * 0.004), 0.010);',
  '  col += uPat * pat * smoothstep(-0.02, 0.35, h) * (0.30 + 0.70 * exp(-hd * 0.9)) * 0.20;',
  '  o = vec4(col, 1.0);',
  '}'].join('\n');

var LIT_VS = function (column) {
  return [G.head.replace('precision highp float;\n', 'precision highp float;\n' + (column ? '#define COLUMN\n' : '')),
  'layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in float aPart;',
  'layout(location=4) in vec4 iA; layout(location=5) in vec4 iB; layout(location=6) in vec4 iC; layout(location=7) in vec4 iCol;',
  'uniform mat4 uVP; uniform mat4 uModel; uniform vec4 uMir;',
  'out vec3 vW; out vec3 vN; out vec2 vUV; out vec3 vL; out vec4 vCol; out vec4 vC;',
  'mat3 rot(vec3 r){ float cy=cos(r.x), sy=sin(r.x), cx=cos(r.y), sx=sin(r.y), cz=cos(r.z), sz=sin(r.z);',
  '  mat3 Y=mat3(cy,0.0,-sy, 0.0,1.0,0.0, sy,0.0,cy); mat3 X=mat3(1.0,0.0,0.0, 0.0,cx,sx, 0.0,-sx,cx); mat3 Z=mat3(cz,sz,0.0, -sz,cz,0.0, 0.0,0.0,1.0);',
  '  return Y*X*Z; }',
  'void main(){',
  '  vec3 p = aPos; vec3 n = aNor;',
  '#ifdef COLUMN',
  '  float hg = iC.x; float sg = hg < 0.0 ? -1.0 : 1.0;',
  '  p.xz *= iA.w; p.y = aPart < 0.5 ? p.y * hg : p.y * sg * iA.w + hg; n.y *= sg;',
  '#else',
  '  p *= iA.w;',
  '#endif',
  '  mat3 R = rot(iB.xyz); p = R * p + iA.xyz; n = R * n;',
  '  vec4 w = uModel * vec4(p, 1.0); vec3 nw = mat3(uModel) * n;',
  '  if (uMir.x > 0.5) { w.y = 2.0 * uMir.y - w.y; nw.y = -nw.y; }',
  '  vW = w.xyz; vN = nw; vUV = aUV; vL = aPos; vCol = iCol; vC = iC;',
  '  gl_Position = uVP * w;',
  '}'].join('\n');
};

var LIT_FS = [G.head, 'in vec3 vW; in vec3 vN; in vec2 vUV; in vec3 vL; in vec4 vCol; in vec4 vC; out vec4 oCol;',
  'uniform vec3 uCam; uniform float uTime, uKind, uFogK; uniform vec4 uMat, uMir;',
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
  '  vec3 alb = vCol.rgb; float rough = uMat.y, metal = uMat.x, emis = uMat.z;',
  '  if (uKind > 0.5 && uKind < 1.5) {',
  '    float r = length(vL.xz);',
  '    if (abs(vL.y) > 0.085 && r < 0.93) {',
  '      float a = atan(vL.z, vL.x); float tri = abs(fract(a * 8.0 / 6.2831853) - 0.5) * 2.0;',
  '      float rs = mix(0.64, 0.30, tri); float inStar = smoothstep(0.025, -0.025, r - rs);',
  '      float rim = smoothstep(0.022, 0.0, abs(r - 0.84) - 0.018); float ring2 = smoothstep(0.016, 0.0, abs(r - 0.70) - 0.010);',
  '      float eng = max(max(inStar * 0.95, rim), ring2 * 0.75); alb = mix(alb, alb * 0.42, eng); rough = mix(rough, rough + 0.30, eng); }',
  '  }',
  '  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW); float NoV = max(dot(N, V), 1e-3);',
  '  vec2 eq = vL.xy * 1.15; float eg = max(starLines(eq, 0.026), 0.6 * starLines(eq * 2.0 + 0.37, 0.045)) * step(1.5, uKind) * step(0.225, abs(vL.z));',
  '  alb = mix(alb, alb * vec3(0.62, 0.55, 0.50), eg); rough = mix(rough, 0.55, eg);',
  '  vec3 dpx = dFdx(vW), dpy = dFdy(vW), br1 = cross(dpy, N), br2 = cross(N, dpx); float bdet = dot(dpx, br1), bh = -eg * 0.012;',
  '  if (abs(bdet) > 1e-12) N = normalize(abs(bdet) * N - sign(bdet) * (dFdx(bh) * br1 + dFdy(bh) * br2));',
  '  vec3 f0 = mix(vec3(0.04), alb, metal); vec3 col = vec3(0.0);',
  '  col += lightTerm(N, V, normalize(uKeyD), uKeyC, alb, f0, rough, metal);',
  '  col += lightTerm(N, V, normalize(uFillD), uFillC, alb, f0, rough, metal);',
  '  col += lightTerm(N, V, normalize(uRimD), uRimC, alb, f0, rough, metal);',
  '  col += mix(uAmbB, uAmbT, N.y * 0.5 + 0.5) * alb * (1.0 - metal);',
  '  vec3 R = reflect(-V, N); vec3 Fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NoV, 5.0);',
  '  col += env(R, rough) * Fe * mix(1.0, 0.65, rough);',
  '  col += alb * (emis + vC.y);',
  '  float alpha = uMat.w;',
  '  if (uMir.x > 0.5) { float dd = max(uMir.y - vW.y, 0.0); alpha *= uMir.w * exp(-dd * uMir.z); }',
  '  float fd = length(vW - uCam); col = mix(col, uFogC, clamp(1.0 - exp(-fd * uFogK), 0.0, 0.8) * 0.45);',
  '#ifdef HDR',
  '  oCol = vec4(col * alpha, alpha);',
  '#else',
  '  oCol = vec4(pow(aces(col), vec3(1.0 / 2.2)) * alpha, alpha);',
  '#endif',
  '}'].join('\n');

var FLOOR_VS = G.head + 'layout(location=0) in vec3 aPos; uniform mat4 uVP; out vec3 vW; void main(){ vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }';
var FLOOR_FS = [G.head, 'in vec3 vW; out vec4 o;', 'uniform vec3 uCam, uFloorC, uHorC, uGlow, uPat; uniform float uTime, uFloorA, uFogK;', G.noise, G.pattern,
  'void main(){',
  '  vec2 xz = vW.xz; float dist = length(vW - uCam); float fog = 1.0 - exp(-pow(dist * uFogK, 1.7));',
  '  float pool = exp(-dot(xz, xz) * 0.040);',
  '  float pat = starLines(xz * 0.20, 0.012) * (0.30 + 0.70 * pool);',
  '  vec2 gq = abs(fract(xz * 0.5) - 0.5); float gline = min(gq.x, gq.y); float aaw = fwidth(gline) * 1.2 + 1e-4;',
  '  float grid = 1.0 - smoothstep(0.004, 0.004 + aaw, gline);',
  '  float ripple = 0.5 + 0.5 * sin(length(xz) * 3.0 - uTime * 0.9); ripple = pow(ripple, 8.0) * exp(-length(xz) * 0.35);',
  '  vec3 col = uFloorC + uGlow * pool * 0.60 + uPat * (pat * 0.55 + grid * 0.07 * pool) + uGlow * ripple * 0.10;',
  '  col = mix(col, uHorC, fog); float a = mix(uFloorA, 1.0, fog);',
  '  o = vec4(col * a, a); }'].join('\n');

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

var BRIGHT_FS = [G.head, 'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uThr;',
  'void main(){ vec3 c = texture(uTex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(uThr, uThr + 0.7, l), 1.0); }'].join('\n');
var BLUR_FS = [G.head, 'in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;',
  'void main(){ vec3 c = texture(uTex, vUv).rgb * 0.2270270270;',
  '  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;',
  '  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;',
  '  o = vec4(c, 1.0); }'].join('\n');
var COMP_FS = [G.head, 'in vec2 vUv; out vec4 o;', 'uniform sampler2D uScene, uB0, uB1; uniform vec2 uRes, uLight; uniform vec3 uRayC; uniform float uTime, uBloom, uRays, uExpo, uVig;',
  G.noise, G.aces,
  'void main(){',
  '  vec2 uv = vUv; vec2 ca = (uv - 0.5) * 0.0016;',
  '  vec3 sc = vec3(texture(uScene, uv + ca).r, texture(uScene, uv).g, texture(uScene, uv - ca).b);',
  '  vec3 b0 = texture(uB0, uv).rgb, b1 = texture(uB1, uv).rgb;',
  '  vec3 col = sc + b0 * 0.55 * uBloom + b1 * 1.05 * uBloom;',
  '  vec2 dl = (uLight - uv) * 0.9 / 28.0; vec2 s = uv; float rays = 0.0; float dec = 1.0;',
  '  for (int i = 0; i < 28; i++) { s += dl; rays += dot(texture(uB0, s).rgb, vec3(0.2126, 0.7152, 0.0722)) * dec; dec *= 0.945; }',
  '  col += uRayC * (rays * uRays / 28.0);',
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
    stars: 1, bloom: 1.0, thr: 0.95, expo: 1.08, rays: 0.55, vig: 0.45, pa: [1.0, 0.80, 0.42], pb: [0.72, 1.0, 0.90], pint: 1.0 },
  day: { top: lin('#6fb6bd'), hor: lin('#f7edcf'), glow: [1.0, 0.90, 0.66], pat: lin('#0e7a55'), floor: lin('#e9e2cf'), floorA: 0.90,
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
      pFloor = P(FLOOR_VS, FLOOR_FS, 'floor'), pPts = P(PTS_VS, PTS_FS, 'pts'), pBright = P(FS_TRI, BRIGHT_FS, 'bright'), pBlur = P(FS_TRI, BLUR_FS, 'blur'), pComp = P(FS_TRI, COMP_FS, 'comp');
  var emptyVao = gl.createVertexArray();

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
    floor: N.drawable(gl, N.geo.quadXZ(70, 70, floorY))
  };
  D.beads = N.drawable(gl, N.geo.lathe(N.geo.profSphere(12), 16, 0, TAU), new Float32Array(16));
  /* beads/ticks on the rings: instanced in ring-local space (ring lies in XZ plane) */
  var ringBeads = [[2.55, 5], [3.15, 7], [3.80, 9]].map(function (rb) {
    var arr = new Float32Array(rb[1] * 16), k;
    for (k = 0; k < rb[1]; k++) { var a = k / rb[1] * TAU; arr.set([rb[0] * Math.cos(a), 0, rb[0] * Math.sin(a), k % 2 ? 0.085 : 0.12, 0, 0, 0, 0, 1, 0, 0, 0, 0.2, 1.0, 0.7, 1], k * 16); }
    return { data: arr, n: rb[1] };
  });
  /* particles */
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var rr = rnd(97), NP = 900, pts = new Float32Array(NP * 4), i;
  for (i = 0; i < NP; i++) pts.set([(rr() - 0.5) * 22, rr() * 9.5 - 3, (rr() - 0.5) * 14 - 1, rr()], i * 4);
  var NB = 26, bok = new Float32Array(NB * 4);
  for (i = 0; i < NB; i++) bok.set([(rr() - 0.5) * 20, rr() * 9.5 - 3, (rr() - 0.35) * 16, rr()], i * 4);
  function ptsVao(data) { var v = gl.createVertexArray(); gl.bindVertexArray(v); N.bindBuf(gl, 0, data, 4); gl.bindVertexArray(null); return v; }
  var vaoPts = ptsVao(pts), vaoBok = ptsVao(bok);
  /* coins */
  var rc = rnd(4242), NC = 34, coins = [];
  for (i = 0; i < NC; i++) coins.push({ rad: 4.3 + rc() * 2.6, th: rc() * TAU, w: (0.05 + rc() * 0.11) * (rc() > 0.5 ? 1 : -1), y: -1.4 + rc() * 4.0, bob: 0.15 + rc() * 0.3, f: 0.4 + rc() * 0.8, ph: rc() * TAU, s: 0.34 + rc() * 0.30, tum: 0.4 + rc() * 0.9 });
  var coinData = new Float32Array(NC * 16);

  /* render targets */
  var T = {};
  function freeTargets() { ['scene', 'b0a', 'b0b', 'b1a', 'b1b'].forEach(function (k) { N.freeTarget(gl, T[k]); T[k] = null; }); }
  function buildTargets() {
    freeTargets();
    var w = H.w, h = H.h, hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    T.scene = N.makeTarget(gl, w, h, { float: hdr, samples: opt.samples === undefined ? 4 : opt.samples, depth: true });
    T.b0a = N.makeTarget(gl, hw, hh, { float: hdr }); T.b0b = N.makeTarget(gl, hw, hh, { float: hdr });
    T.b1a = N.makeTarget(gl, qw, qh, { float: hdr }); T.b1b = N.makeTarget(gl, qw, qh, { float: hdr });
  }
  H.resize = function (cssW, cssH, dprIn) {
    var dpr = dprIn || opt.dpr || Math.min(root.devicePixelRatio || 1, 2.5);
    var w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    var cap = 6.2e6; if (w * h > cap) { var k = Math.sqrt(cap / (w * h)); w = Math.round(w * k); h = Math.round(h * k); dpr *= k; }
    if (w === H.w && h === H.h) return;
    H.w = w; H.h = h; H.dpr = dpr; H.cssW = cssW; H.cssH = cssH; canvas.width = w; canvas.height = h; buildTargets();
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
  function drawMat(p, d, mat, model, kind, mir) {
    var u = U(p); UM(p, 'uModel', model); u('uMat', mat.m, mat.r, mat.e, 1.0); u('uKind', kind || 0);
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
    var V = M.look(ex, ey, ez, tx, ty, tz), Pm = M.persp(fovy, asp, 0.5, 120, 0, shiftY), VP = M.mul(Pm, V), cam = [ex, ey, ez];
    H.vp = VP;
    var starPos = M.proj(VP, 0, 0.55, 0, 1, 1);
    var hx = tx - ex, hz = tz - ez, hl = Math.hypot(hx, hz), hor = M.proj(VP, ex + hx / hl * 4000, ey, ez + hz / hl * 4000, 1, 1);
    var sceneT = T.scene, u;

    /* ---- scene pass (MSAA) ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.msFb || sceneT.fb); gl.viewport(0, 0, H.w, H.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(pBg.p); u = U(pBg); u('uRes', H.w, H.h); u('uTime', t); u('uHor', 1 - hor[1]); u('uCenter', starPos[0], 1 - starPos[1]);
    u('uPar', H.cam.x * 0.6 + sp * 0.2, H.cam.y * 0.4 + sp * 0.9); u('uStars', pl.stars); u('uDay', H.day);
    U3(pBg, 'uTop', pl.top); U3(pBg, 'uHorC', pl.hor); U3(pBg, 'uGlow', pl.glow); U3(pBg, 'uPat', pl.pat);
    gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
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
    for (i = 0; i < NC; i++) {
      var c = coins[i], th = c.th + t * c.w;
      coinData.set([c.rad * Math.cos(th), c.y + c.bob * Math.sin(t * c.f + c.ph), c.rad * Math.sin(th) - 1.2, c.s, 0.3 * Math.sin(t * 0.2 + c.ph), t * c.tum + c.ph, 0.4 * Math.sin(t * 0.3 + c.ph), 0, 1, 0, 0, 0, 1.0, 0.74, 0.32, 1], i * 16);
    }
    N.setInst(gl, D.coin, coinData, NC);

    function drawWorld(mir) {
      gl.useProgram(pLit.p); setLighting(pLit, pl, cam, t); UM(pLit, 'uVP', VP);
      gl.frontFace(mir ? gl.CW : gl.CCW);
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
    /* mirrored world first (under the floor), then floor, then the real thing */
    if (opt.reflect !== false) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); drawWorld(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    gl.useProgram(pFloor.p); u = U(pFloor); UM(pFloor, 'uVP', VP); U3(pFloor, 'uCam', cam); u('uTime', t); u('uFloorA', pl.floorA); u('uFogK', 0.030);
    U3(pFloor, 'uFloorC', pl.floor); U3(pFloor, 'uHorC', pl.hor); U3(pFloor, 'uGlow', pl.glow); U3(pFloor, 'uPat', pl.pat);
    N.draw(gl, D.floor);
    gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); drawWorld(false);

    /* particles + bokeh (additive) */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    gl.useProgram(pPts.p); u = U(pPts); UM(pPts, 'uVP', VP); u('uTime', t); u('uSize', 46 * H.dpr); u('uInt', pl.pint * 1.1);
    U3(pPts, 'uPA', pl.pa); U3(pPts, 'uPB', pl.pb); u('uBokeh', 0); gl.bindVertexArray(vaoPts); gl.drawArrays(gl.POINTS, 0, NP);
    u('uBokeh', 1); u('uSize', 46 * H.dpr); u('uInt', pl.pint * 1.0); gl.bindVertexArray(vaoBok); gl.drawArrays(gl.POINTS, 0, NB);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null);

    /* resolve MSAA */
    if (sceneT.msFb) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneT.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneT.fb);
      gl.blitFramebuffer(0, 0, H.w, H.h, 0, 0, H.w, H.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    /* ---- post ---- */
    gl.bindVertexArray(emptyVao);
    function pass(prog, target, w, h, setup) { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null); gl.viewport(0, 0, w, h); gl.useProgram(prog.p); setup(U(prog)); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    function tex(prog, name, tx, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx.tex); gl.uniform1i(prog.U[name], unit); }
    pass(pBright, T.b0a, T.b0a.w, T.b0a.h, function (q) { tex(pBright, 'uTex', sceneT, 0); q('uThr', pl.thr); });
    pass(pBlur, T.b0b, T.b0b.w, T.b0b.h, function (q) { tex(pBlur, 'uTex', T.b0a, 0); q('uDir', 1 / T.b0a.w, 0); });
    pass(pBlur, T.b0a, T.b0a.w, T.b0a.h, function (q) { tex(pBlur, 'uTex', T.b0b, 0); q('uDir', 0, 1 / T.b0a.h); });
    pass(pBlur, T.b1a, T.b1a.w, T.b1a.h, function (q) { tex(pBlur, 'uTex', T.b0a, 0); q('uDir', 1 / T.b1a.w, 0); });
    pass(pBlur, T.b1b, T.b1b.w, T.b1b.h, function (q) { tex(pBlur, 'uTex', T.b1a, 0); q('uDir', 0, 1 / T.b1b.h); });
    pass(pBlur, T.b1a, T.b1a.w, T.b1a.h, function (q) { tex(pBlur, 'uTex', T.b1b, 0); q('uDir', 1 / T.b1a.w, 0); });
    pass(pBlur, T.b1b, T.b1b.w, T.b1b.h, function (q) { tex(pBlur, 'uTex', T.b1a, 0); q('uDir', 0, 1 / T.b1b.h); });
    pass(pComp, null, H.w, H.h, function (q) {
      tex(pComp, 'uScene', sceneT, 0); tex(pComp, 'uB0', T.b0a, 1); tex(pComp, 'uB1', T.b1b, 2);
      q('uRes', H.w, H.h); q('uLight', starPos[0], 1 - starPos[1]); q('uTime', t); q('uBloom', pl.bloom * (1 + iv * 1.2)); q('uRays', pl.rays); q('uRayC', pl.glow[0], pl.glow[1], pl.glow[2]); q('uExpo', pl.expo * (0.45 + 0.55 * H.intro)); q('uVig', pl.vig);
    });
    gl.bindVertexArray(null);
  };

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); H.lost = true; });
  canvas.addEventListener('webglcontextrestored', function () { H.lost = false; H.w = 0; if (opt.onRestore) opt.onRestore(); });
  H.dispose = function () { freeTargets(); var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); };
  return H;
}
N.Hero = Hero;
})(window);
