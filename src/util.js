import * as THREE from 'three';
import { AREAS } from './config.js';

// --- 2D simplex noise (Stefan Gustavson, public domain) ---
const grad3 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const perm = new Uint8Array(512);
(function seed() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();

export function noise2(xin, yin) {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = grad3[perm[ii + perm[jj]] % 8]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = grad3[perm[ii + i1 + perm[jj + j1]] % 8]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = grad3[perm[ii + 1 + perm[jj + 1]] % 8]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * (n0 + n1 + n2);
}

export function fbm(x, y, oct = 4) {
  let a = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { sum += a * noise2(x * f, y * f); f *= 2; a *= 0.5; }
  return sum;
}

// Seeded RNG for deterministic scenery
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const POOL_FLOOR = -1.1;
export const POOL_WATER = -0.55;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

// Paths (dirt trails) between points of interest, as line segments.
export const PATHS = [
  [[0, 11], [0, 4]],
  [[0, 11], [-1, 15]],
  [[0, 8], [-8, 6]],
  [[0, 8], [9, 5]],
  [[9, 5], [15.5, -1.5]], [[15.5, -1.5], [22, -3]], [[22, -3], [28, -4]],
  [[-8, 6], [-15.5, -1.5]], [[-15.5, -1.5], [-22, -3]], [[-22, -3], [-28, -4]],
  [[-5, -9], [0, -17]], [[5, -9], [0, -17]], [[0, -17], [0, -27]],
  [[-8, 6], [-5, -9]], [[9, 5], [5, -9]],
];

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  const x = a[0] + dx * t - px, z = a[1] + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}

export function pathDist(x, z) {
  let d = 1e9;
  for (const [a, b] of PATHS) d = Math.min(d, segDist(x, z, a, b));
  return d;
}

// Terrain height. Flat-ish playable glade, raised shrine hill, a basin for the moon pool,
// rising forested hills toward the rim.
export function heightAt(x, z) {
  const r = Math.sqrt(x * x + z * z);
  let h = fbm(x * 0.045, z * 0.045, 3) * 1.1;
  // shrine hill (east)
  const de = Math.hypot(x - 27, z + 3);
  h += 2.6 * (1 - smoothstep(4, 13, de));
  // moon pool basin (west), raised rim around
  const dw = Math.hypot(x + 27, z + 3);
  h += 0.8 * (1 - smoothstep(6, 12, dw)) - 0.9 * (1 - smoothstep(0, 6.5, dw));
  // wisp hollow (north) gentle bowl with rim
  const dn = Math.hypot(x, z + 29);
  h += -0.6 * (1 - smoothstep(0, 9, dn)) + 0.9 * smoothstep(8, 12, dn) * (1 - smoothstep(12, 16, dn));
  // great tree mound
  const dt = Math.hypot(x, z + 4);
  h += 0.9 * (1 - smoothstep(0, 7, dt));
  // outer rim hills
  h += smoothstep(36, 60, r) * (8 + fbm(x * 0.03 + 9, z * 0.03, 3) * 10);
  // flatten paths slightly
  const pd = pathDist(x, z);
  h -= 0.12 * (1 - smoothstep(0, 1.6, pd));
  // moon pool bowl: a clean basin below the water line
  const dp = Math.hypot(x + 28, z + 4);
  h = lerp(h, POOL_FLOOR, 1 - smoothstep(3.5, 4.7, dp));
  return h;
}

// Locked areas: returns area id if (x,z) is inside a locked area.
export function lockedAreaAt(x, z, areasState) {
  for (const id in AREAS) {
    if (areasState[id]) continue;
    const a = AREAS[id];
    if (Math.hypot(x - a.center[0], z - a.center[1]) < a.radius) return id;
  }
  return null;
}

// Soft round sprite texture for particles
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

let _mistTex = null;
export function mistTexture() {
  if (_mistTex) return _mistTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 18 + Math.random() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  _mistTex = new THREE.CanvasTexture(c);
  _mistTex.colorSpace = THREE.SRGBColorSpace;
  return _mistTex;
}

// Shared uniforms for wind animation
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

// Injects gentle wind sway into a standard material (vertex displacement scaled by height).
export function addWind(material, { strength = 0.08, heightScale = 1, base = 0, fadeNear = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float hgt = max(0.0, (transformed.y - ${base.toFixed(3)}) * ${heightScale.toFixed(3)});
          float ph = wp.x * 0.35 + wp.z * 0.27;
          float sway = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          transformed.x += sway * ${strength.toFixed(3)} * hgt * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * ${(strength * 0.6).toFixed(3)} * hgt * uWind;
        }`);
    if (fadeNear) {
      // Screen-door fade for geometry right in front of the camera so it never blocks the fox
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = -mvPosition.z;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCamDist;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            float fade = smoothstep(2.5, 6.0, vCamDist);
            vec2 g = floor(gl_FragCoord.xy);
            float dither = fract(dot(g, vec2(0.5, 0.25)) + fract(g.y * 0.5) * 0.5);
            dither = fract(52.9829189 * fract(dot(g, vec2(0.06711056, 0.00583715))));
            if (fade < 0.999 && dither > fade) discard;
          }`);
    }
  };
  return material;
}
