import * as THREE from 'three';

const MAXP = 4000;

const vert = /* glsl */`
attribute vec2 aUv;
varying vec2 vUv;
#include <fog_pars_vertex>
void main(){
  vUv = aUv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */`
uniform vec3 uColor;
uniform float uTime;
uniform float uDanger;
uniform float uLen;
varying vec2 vUv;
#include <fog_pars_fragment>
void main(){
  float side = abs(vUv.y);              // 0 center -> 1 edge
  float core = 1.0 - smoothstep(0.0, 0.35, side);
  float body = 1.0 - smoothstep(0.55, 1.0, side);
  float flow = 0.5 + 0.5 * sin(vUv.x * 1.6 - uTime * (7.0 + uDanger * 10.0));
  float tail = smoothstep(0.0, 2.5, vUv.x);       // taper the start
  float headFade = smoothstep(0.0, 1.2, uLen - vUv.x);
  vec3 c = mix(uColor * 0.9, vec3(1.0), core * 0.55);
  c *= 1.0 + flow * 0.5;
  c = mix(c, vec3(1.0, 0.25, 0.3), uDanger * (0.35 + 0.35 * sin(uTime * 14.0)) * body);
  float a = body * (0.65 + 0.35 * flow) * tail * (0.4 + 0.6 * headFade);
  gl_FragColor = vec4(c * 1.6, a);
  #include <fog_fragment>
}`;

class Ribbon {
  constructor(player) {
    this.player = player;
    this.pos = new Float32Array(MAXP * 2 * 3);
    this.uv = new Float32Array(MAXP * 2 * 2);
    const idx = new Uint32Array((MAXP - 1) * 6);
    for (let i = 0; i < MAXP - 1; i++) {
      const a = i * 2; const b = a + 1; const c = a + 2; const d = a + 3;
      idx.set([a, b, c, b, d, c], i * 6);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.uniforms = {
      uColor: { value: new THREE.Color(player.color) },
      uTime: { value: 0 },
      uDanger: { value: 0 },
      uLen: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.uniforms]),
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    this.uniforms = mat.uniforms;
    this.mat = mat;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(time, danger) {
    const p = this.player;
    const pts = p.path;
    this.uniforms.uTime.value = time;
    this.uniforms.uDanger.value += (danger - this.uniforms.uDanger.value) * 0.1;
    const count = p.alive && pts.length > 0 ? Math.min(pts.length + 1, MAXP) : 0;
    if (count < 2) { this.geo.setDrawRange(0, 0); return; }
    const start = pts.length + 1 - count;
    const getPt = (k) => {
      const j = start + k;
      return j < pts.length ? pts[j] : { x: p.x, z: p.z };
    };
    const w = 0.34; const y = 0.08;
    let acc = 0;
    let prev = getPt(0);
    for (let k = 0; k < count; k++) {
      const c = getPt(k);
      const a = getPt(Math.max(0, k - 1)); const b = getPt(Math.min(count - 1, k + 1));
      let tx = b.x - a.x; let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz; const nz = tx;
      if (k > 0) acc += Math.hypot(c.x - prev.x, c.z - prev.z);
      prev = c;
      const o = k * 6;
      this.pos[o] = c.x + nx * w; this.pos[o + 1] = y; this.pos[o + 2] = c.z + nz * w;
      this.pos[o + 3] = c.x - nx * w; this.pos[o + 4] = y; this.pos[o + 5] = c.z - nz * w;
      const u = k * 4;
      this.uv[u] = acc; this.uv[u + 1] = 1; this.uv[u + 2] = acc; this.uv[u + 3] = -1;
    }
    this.uniforms.uLen.value = acc;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aUv.needsUpdate = true;
    this.geo.setDrawRange(0, (count - 1) * 6);
  }
}

export class TrailLayer {
  constructor(game, scene) {
    this.game = game;
    this.ribbons = game.players.map((p) => new Ribbon(p));
    for (const r of this.ribbons) scene.add(r.mesh);
  }

  update(time, dangerFor) {
    for (const r of this.ribbons) r.update(time, dangerFor(r.player));
  }

  dispose(scene) {
    for (const r of this.ribbons) { scene.remove(r.mesh); r.geo.dispose(); r.mat.dispose(); }
  }
}
