import * as THREE from 'three';
import { glowTexture } from './util.js';

let _dotTex = null;
function dotTexture() {
  if (_dotTex) return _dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(26, 24, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.75, 'rgba(225,225,225,1)');
  grd.addColorStop(0.92, 'rgba(160,160,160,0.9)');
  grd.addColorStop(1, 'rgba(120,120,120,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  _dotTex = new THREE.CanvasTexture(c);
  _dotTex.colorSpace = THREE.SRGBColorSpace;
  return _dotTex;
}

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uTex: { value: additive ? glowTexture() : dotTexture() }, uScale: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
        varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_Position = projectionMatrix*mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); if (t.a*vA < 0.01) discard;
          gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
    scene.add(this.points);
  }

  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0;
    p.color = p.color instanceof THREE.Color ? p.color : new THREE.Color(p.color || '#ffffff');
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); if (p.onDone) p.onDone(); continue; }
      const k = p.age / p.life;
      if (p.type === 'arc') {
        const e = p.ease ? k * k * (3 - 2 * k) : k;
        const a = p.from, b = p.to, c = p.ctrl;
        const u = 1 - e;
        p.x = u * u * a.x + 2 * u * e * c.x + e * e * b.x;
        p.y = u * u * a.y + 2 * u * e * c.y + e * e * b.y;
        p.z = u * u * a.z + 2 * u * e * c.z + e * e * b.z;
      } else if (p.type === 'spiral') {
        const ang = p.a0 + p.age * p.spin;
        const r = p.r0 * (1 - k * p.shrink);
        p.x = p.cx + Math.cos(ang) * r;
        p.z = p.cz + Math.sin(ang) * r;
        p.y = p.cy + p.age * p.rise;
      } else {
        p.vy -= (p.g || 0) * dt;
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.sway) { p.x += Math.sin(p.age * 3 + p.seed) * p.sway * dt; p.z += Math.cos(p.age * 2.5 + p.seed) * p.sway * dt; }
        if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
      }
    }
    const n = Math.min(L.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const k = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.color.r * (p.bright || 1); this.col[i * 3 + 1] = p.color.g * (p.bright || 1); this.col[i * 3 + 2] = p.color.b * (p.bright || 1);
      const fadeIn = Math.min(1, p.age / (p.fadeIn ?? 0.15));
      const fadeOut = p.fadeOut === false ? 1 : Math.min(1, (1 - k) / 0.3);
      this.alpha[i] = (p.alpha ?? 1) * fadeIn * fadeOut;
      this.size[i] = p.size * (p.grow ? 1 + k * p.grow : 1);
    }
    for (let i = n; i < this.max; i++) this.alpha[i] = 0;
    const g = this.points.geometry;
    g.setDrawRange(0, Math.max(n, 1));
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[name].needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.glow = new Pool(scene, 2500, true);
    this.solid = new Pool(scene, 1200, false);
  }

  setScale(h) {
    this.glow.uniforms.uScale.value = h;
    this.solid.uniforms.uScale.value = h;
  }

  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
  }

  // Item arcs from a to b (berries into the basket, etc.)
  arc(from, to, { color = '#ff4060', size = 0.06, life = 0.7, height = 0.8, glow = false, bright = 1, onDone } = {}) {
    const ctrl = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + height, (from.z + to.z) / 2);
    (glow ? this.glow : this.solid).add({ type: 'arc', from: from.clone(), to: to.clone(), ctrl, color, size, life, ease: true, bright, fadeIn: 0.05, onDone });
  }

  burst(at, { count = 12, color = '#ffffff', speed = 2, size = 0.05, life = 0.9, g = 4, glow = false, up = 1.5, drag = 1, bright = 1, spread = 1, floor } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      (glow ? this.glow : this.solid).add({
        x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * speed * r, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * speed * r,
        g, drag, color, size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.6), bright, floor,
      });
    }
  }

  rise(at, { count = 1, color = '#ffe08a', size = 0.08, life = 2.5, radius = 0.6, speed = 0.6, sway = 0.4, bright = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      this.glow.add({ x: at.x + Math.cos(a) * r, y: at.y, z: at.z + Math.sin(a) * r, vx: 0, vy: speed * (0.6 + Math.random() * 0.8), vz: 0,
        sway, seed: Math.random() * 10, color, size: size * (0.6 + Math.random() * 0.8), life: life * (0.7 + Math.random() * 0.6), bright, fadeIn: 0.5 });
    }
  }

  spiral(center, { count = 1, color = '#8fc8ff', size = 0.07, life = 2, radius = 1.5, rise = 0.8, spin = 2.5, shrink = 0.9, bright = 2.5 } = {}) {
    for (let i = 0; i < count; i++) {
      this.glow.add({ type: 'spiral', cx: center.x, cy: center.y, cz: center.z, a0: Math.random() * Math.PI * 2, r0: radius * (0.7 + Math.random() * 0.5),
        rise: rise * (0.7 + Math.random() * 0.6), spin, shrink, color, size, life, bright, fadeIn: 0.4 });
    }
  }
}
