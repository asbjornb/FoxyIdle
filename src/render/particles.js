import * as THREE from 'three';

const MAX = 5000;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.kind = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute float aKind;
        varying vec3 vColor; varying float vAlpha; varying float vKind;
        uniform float uScale;
        void main(){
          vColor = color; vAlpha = aAlpha; vKind = aKind;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha; varying float vKind;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a;
          if (vKind > 0.5) {
            // four-point sparkle star
            vec2 q = abs(c);
            float star = max(1.0 - smoothstep(0.0, 0.08, q.x) , 1.0 - smoothstep(0.0, 0.08, q.y)) * (1.0 - smoothstep(0.2, 0.5, d));
            a = max(star, 1.0 - smoothstep(0.0, 0.16, d));
          } else {
            a = 1.0 - smoothstep(0.15, 0.5, d);
          }
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.8, a * vAlpha);
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.mat = mat;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, kind = 0, grav = -6) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.kind[i] = kind; this.grav[i] = grav;
  }

  burst(x, y, z, color, count, { speed = 6, size = 0.5, life = 1.0, up = 4, star = 0.4, grav = -8 } = {}) {
    const c = new THREE.Color(color);
    const w = new THREE.Color('#ffffff');
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const cc = Math.random() < 0.25 ? w : c;
      this.emit(x, y, z, Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s, cc,
        size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), Math.random() < star ? 1 : 0, grav);
    }
  }

  update(dt, viewportH) {
    this.mat.uniforms.uScale.value = viewportH * 0.5;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      this.vel[j + 1] += this.grav[i] * dt;
      const drag = Math.exp(-dt * 1.8);
      this.vel[j] *= drag; this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.1) { this.pos[j + 1] = 0.1; this.vel[j + 1] *= -0.4; }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.5) * (t > 0.9 ? (1 - t) * 10 : 1);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aKind.needsUpdate = true;
  }
}

export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.RingGeometry(0.85, 1, 64);
    this.geo.rotateX(-Math.PI / 2);
  }
  spawn(x, z, color, maxR = 6, life = 0.7) {
    let r = this.pool.find((o) => !o.active);
    if (!r) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.renderOrder = 4;
      r = { mesh: m, active: false };
      this.scene.add(m);
      this.pool.push(r);
    }
    r.active = true; r.t = 0; r.life = life; r.maxR = maxR;
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.15, z);
    r.mesh.material.color.set(color).multiplyScalar(1.5);
  }
  update(dt) {
    for (const r of this.pool) {
      if (!r.active) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      const s = 0.3 + e * r.maxR;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - k) * 0.9;
    }
  }
}
