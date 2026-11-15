import * as THREE from 'three';

// Ground + territory: a single plane whose fragment shader reads the ownership grid.
export class TerritoryLayer {
  constructor(game, margin = 14) {
    const N = game.N;
    this.game = game;
    this.N = N;
    this.data = new Uint8Array(N * N * 4);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.capTex = new THREE.DataTexture(game.capTime, N, N, THREE.RedFormat, THREE.FloatType);
    this.capTex.magFilter = THREE.NearestFilter; this.capTex.minFilter = THREE.NearestFilter;
    this.capTex.needsUpdate = true;

    const colors = [];
    const patterns = [];
    for (let i = 0; i < 9; i++) { colors.push(new THREE.Color(0, 0, 0)); patterns.push(0); }
    for (const p of game.players) {
      colors[p.code] = new THREE.Color(p.color);
      patterns[p.code] = p.id % 8;
    }
    this.uniforms = {
      uOwner: { value: this.tex },
      uCap: { value: this.capTex },
      uN: { value: N },
      uTime: { value: 0 },
      uColors: { value: colors },
      uPattern: { value: patterns },
      uHuman: { value: game.human.code },
    };

    const size = N + margin * 2;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(N / 2, 0, N / 2);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTerr;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerr = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_GLSL}`)
        .replace('#include <map_fragment>', `
          vec3 terrEmissive;
          float terrRough;
          vec3 terrCol = terrainColor(vTerr.xz, terrEmissive, terrRough);
          diffuseColor.rgb = terrCol;
        `)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = terrRough;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += terrEmissive;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
  }

  setPlayersColors() {
    for (const p of this.game.players) {
      this.uniforms.uColors.value[p.code].set(p.color);
      this.uniforms.uPattern.value[p.code] = p.id % 8;
    }
  }

  update(time) {
    const g = this.game;
    this.uniforms.uTime.value = g.time;
    void time;
    if (g.dirtyCells) {
      const d = this.data; const o = g.owner; const t = g.trailGrid; const pv = g.prevOwner;
      for (let i = 0, j = 0; i < o.length; i++, j += 4) {
        d[j] = o[i]; d[j + 1] = t[i]; d[j + 2] = pv[i]; d[j + 3] = 255;
      }
      this.tex.needsUpdate = true;
      this.capTex.needsUpdate = true;
      g.dirtyCells = false;
    }
  }
}

const TERRAIN_GLSL = /* glsl */`
varying vec3 vTerr;
uniform sampler2D uOwner;
uniform sampler2D uCap;
uniform float uN;
uniform float uTime;
uniform vec3 uColors[9];
uniform float uPattern[9];
uniform float uHuman;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; } return s; }

vec4 cellAt(ivec2 c){
  if (c.x < 0 || c.y < 0 || c.x >= int(uN) || c.y >= int(uN)) return vec4(0.0);
  return texelFetch(uOwner, c, 0) * 255.0;
}

// Bilinear "vote" between the four surrounding cells -> smooth, rounded contours.
// returns owner code and the winning weight (0.5 at a boundary between two owners)
vec2 ownerVote(vec2 p, int channel){
  vec2 q = p - 0.5;
  ivec2 i0 = ivec2(floor(q));
  vec2 f = fract(q);
  float o[4]; float w[4];
  vec4 c00 = cellAt(i0), c10 = cellAt(i0 + ivec2(1,0)), c01 = cellAt(i0 + ivec2(0,1)), c11 = cellAt(i0 + ivec2(1,1));
  o[0] = floor(c00[channel] + 0.5); o[1] = floor(c10[channel] + 0.5); o[2] = floor(c01[channel] + 0.5); o[3] = floor(c11[channel] + 0.5);
  w[0] = (1.0-f.x)*(1.0-f.y); w[1] = f.x*(1.0-f.y); w[2] = (1.0-f.x)*f.y; w[3] = f.x*f.y;
  float best = 0.0, bw = -1.0;
  for (int a = 0; a < 4; a++){
    float s = 0.0;
    for (int b = 0; b < 4; b++) s += (o[b] == o[a]) ? w[b] : 0.0;
    if (s > bw + 1e-4 || (abs(s - bw) < 1e-4 && o[a] > best)) { bw = s; best = o[a]; }
  }
  return vec2(best, bw);
}

float patternFor(float kind, vec2 p){
  if (kind < 0.5) { // diagonal candy stripes
    return smoothstep(0.42, 0.5, abs(fract((p.x + p.y) * 0.35) - 0.5) * 2.0 - 0.1);
  } else if (kind < 1.5) { // polka dots
    vec2 g = fract(p * 0.5) - 0.5; return 1.0 - smoothstep(0.17, 0.22, length(g));
  } else if (kind < 2.5) { // diamond quilt
    vec2 g = abs(fract(p * 0.36) - 0.5); return smoothstep(0.42, 0.47, g.x + g.y);
  } else if (kind < 3.5) { // fish scales
    vec2 s = p * 0.55; float row = floor(s.y); s.x += mod(row, 2.0) * 0.5;
    vec2 g = fract(s) - vec2(0.5, 0.0); float d = length(g);
    return smoothstep(0.46, 0.5, d) * (1.0 - smoothstep(0.55, 0.6, d)) + smoothstep(0.85, 0.9, d) * 0.0;
  } else if (kind < 4.5) { // waves
    float y = p.y * 0.6 + sin(p.x * 0.7) * 0.6; return smoothstep(0.75, 0.85, abs(fract(y) - 0.5) * 2.0);
  } else if (kind < 5.5) { // tiny stars
    vec2 g = fract(p * 0.4) - 0.5; vec2 a = abs(g);
    float st = max(a.x, a.y) * 0.6 + min(a.x, a.y) * 1.6; return 1.0 - smoothstep(0.18, 0.24, st);
  } else if (kind < 6.5) { // chevrons
    float y = p.y * 0.45 + abs(fract(p.x * 0.22) - 0.5) * 1.6; return smoothstep(0.7, 0.8, abs(fract(y) - 0.5) * 2.0);
  }
  // concentric rings / plaid
  vec2 g = fract(p * 0.3); return max(smoothstep(0.86, 0.92, g.x), smoothstep(0.86, 0.92, g.y)) * 0.9;
}

vec3 meadow(vec2 p, out vec3 em, float gridAmt){
  float n = fbm(p * 0.05);
  float n2 = fbm(p * 0.18 + 7.0);
  float n3 = fbm(p * 0.9 + 3.0);
  vec3 a = vec3(0.05, 0.20, 0.22);
  vec3 b = vec3(0.10, 0.34, 0.28);
  vec3 col = mix(a, b, smoothstep(0.3, 0.75, n));
  // violet moss patches
  col = mix(col, vec3(0.20, 0.13, 0.36), smoothstep(0.55, 0.78, n2) * 0.55);
  // grass grain
  col *= 0.88 + 0.24 * n3;
  // soft tile grid every 5 cells
  vec2 gp = abs(fract(p / 5.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.03, min(0.5 - gp.x, 0.5 - gp.y));
  col *= 1.0 - line * 0.1 * gridAmt;
  // tiny glowing flowers
  vec2 cell = floor(p * 0.9);
  float h = hash12(cell);
  em = vec3(0.0);
  if (h > 0.955) {
    vec2 c = fract(p * 0.9) - 0.5 + (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5;
    float d = length(c);
    vec3 fc = mix(vec3(1.0, 0.45, 0.8), vec3(0.45, 0.85, 1.0), hash12(cell + 1.7));
    if (hash12(cell + 9.1) > 0.7) fc = vec3(1.0, 0.85, 0.4);
    float petals = 0.06 + 0.035 * cos(atan(c.y, c.x) * 5.0);
    float f = 1.0 - smoothstep(petals, petals + 0.03, d);
    float centre = 1.0 - smoothstep(0.02, 0.035, d);
    col = mix(col, fc, f);
    col = mix(col, vec3(1.0, 0.95, 0.6), centre);
    em = fc * f * (0.15 + 0.15 * sin(uTime * 2.0 + h * 40.0));
  }
  return col;
}

vec3 terrainColor(vec2 p, out vec3 em, out float rough){
  em = vec3(0.0);
  rough = 0.9;
  // outside the play field: mossy rim
  if (p.x < 0.0 || p.y < 0.0 || p.x > uN || p.y > uN) {
    float edge = max(-p.x, max(-p.y, max(p.x - uN, p.y - uN)));
    vec3 rimEm;
    vec3 col = meadow(p * 1.3 + 17.0, rimEm, 0.0) * vec3(0.55, 0.75, 0.6);
    col = mix(col, vec3(0.04, 0.12, 0.08), 0.35);
    // darker towards the cliff
    col *= 1.0 - 0.35 * smoothstep(6.0, 14.0, edge);
    // glowing boundary line
    float glow = exp(-edge * 3.5);
    em = rimEm * 0.6 + vec3(0.45, 0.8, 1.0) * glow * (0.55 + 0.25 * sin(uTime * 2.0 + (p.x + p.y) * 0.2));
    return col;
  }
  vec3 mEm;
  vec3 ground = meadow(p, mEm, 1.0);
  vec2 v = ownerVote(p, 0);
  float owner = v.x;
  float w = v.y;
  ivec2 ci = ivec2(floor(p));
  float capT = texelFetch(uCap, ci, 0).r;
  float age = uTime - capT;

  vec3 col;
  if (owner > 0.5) {
    int oi = int(owner);
    vec3 base = uColors[oi];
    float pat = patternFor(uPattern[oi], p);
    // body: slightly darker base + lighter pattern
    vec3 c1 = base * 0.78;
    vec3 c2 = mix(base, vec3(1.0), 0.28);
    col = mix(c1, c2, pat * 0.65);
    // subtle variation
    col *= 0.92 + 0.12 * fbm(p * 0.15 + owner * 3.0);
    // edge: bright inner rim then darker lip
    float e = (w - 0.5);
    float rim = 1.0 - smoothstep(0.03, 0.11, e);
    float lip = 1.0 - smoothstep(0.0, 0.03, e);
    col = mix(col, mix(base, vec3(1.0), 0.55), rim * 0.65);
    col = mix(col, base * 0.45, lip * 0.8);
    em = base * (0.06 + rim * 0.22);
    if (owner == uHuman) em += base * 0.05 * (0.5 + 0.5 * sin(uTime * 3.0));
    rough = 0.55;
    // fresh capture: white flash + rising shimmer
    if (age < 1.0) {
      float flash = exp(-age * 4.5);
      float shimmer = (1.0 - smoothstep(0.0, 1.0, age)) * hash12(floor(p * 2.0) + floor(uTime * 20.0));
      col = mix(col, mix(base, vec3(1.0), 0.6), flash * 0.6);
      em += mix(base, vec3(1.0), 0.3) * (flash * 0.45 + shimmer * 0.2);
    }
  } else {
    col = ground;
    em = mEm;
    // shadow cast by raised territory slabs (light comes from -x,-z)
    vec2 sv = ownerVote(p - vec2(0.28, 0.22), 0);
    if (sv.x > 0.5) col *= 0.6;
    // dissolving territory that was just lost
    vec4 c = cellAt(ci);
    float prev = floor(c.z + 0.5);
    if (prev > 0.5 && age < 1.4) {
      float n = hash12(floor(p * 3.0));
      float t = age / 1.4;
      if (n > t) {
        vec3 pc = uColors[int(prev)];
        col = mix(col, pc * 0.6, 0.85);
        em += pc * 0.6 * smoothstep(t, t + 0.12, n) * (1.0 - t);
      }
    }
  }
  // drifting cloud shadows
  float cloud = smoothstep(0.45, 0.75, fbm(p * 0.025 + vec2(uTime * 0.02, uTime * 0.012)));
  col *= 1.0 - cloud * 0.22;
  // faint tint beneath exposed trails
  vec2 tv = ownerVote(p, 1);
  if (tv.x > 0.5 && tv.y > 0.5) {
    vec3 tc = uColors[int(tv.x)];
    col = mix(col, tc * 0.5, 0.35);
  }
  return col;
}
`;
