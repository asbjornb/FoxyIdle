import * as THREE from 'three';
import { STATIONS, AREAS, TREE_STAGES } from './config.js';
import { heightAt, rng, damp, lerp, smoothstep, mistTexture, windUniforms, addWind, fbm, POOL_WATER } from './util.js';
import { jitter, paint, paintGradient } from './world.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function addMesh(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(...scl);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Animate a scale "pop" in for a newly grown decoration
function popIn(obj, list, delay = 0) {
  obj.userData.targetScale = obj.scale.clone();
  obj.scale.setScalar(0.0001);
  list.push({ obj, t: -delay });
}

function updatePops(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.t += dt;
    if (p.t < 0) continue;
    const k = Math.min(1, p.t / 0.8);
    const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // back-out
    p.obj.scale.copy(p.obj.userData.targetScale).multiplyScalar(Math.max(0.0001, e));
    if (k >= 1) list.splice(i, 1);
  }
}

class Station {
  constructor(id, scene) {
    this.id = id;
    this.def = STATIONS[id];
    this.group = new THREE.Group();
    const [x, z] = this.def.pos;
    this.center = V(x, heightAt(x, z), z);
    this.group.position.copy(this.center);
    scene.add(this.group);
    this.colliders = [];
    this.pops = [];
    this.level = 0;
    this.fxT = 0;
    this.pulse = 0;
  }
  // local helper: ground height at local offset
  gy(lx, lz) { return heightAt(this.center.x + lx, this.center.z + lz) - this.center.y; }
  world(lx, ly, lz) { return V(this.center.x + lx, this.center.y + ly, this.center.z + lz); }
  setLevel() {}
  setUnlocked() {}
  update() {}
  workFx() {}
  onCycle() {}
}

// ---------------- Berry Thicket ----------------
class BerryStation extends Station {
  constructor(scene) {
    super('berries', scene);
    this.bushes = [];
    this.spots = [[0, 0], [1.1, 0.5], [-0.9, 0.7], [0.3, -1.1], [-1.2, -0.6], [1.3, -0.8], [-0.2, 1.4]];
    this.leafMat = std('#3d7a37', { flatShading: true, roughness: 0.9 });
    addWind(this.leafMat, { strength: 0.04, heightScale: 1 });
    this.berryMat = std('#e0334f', { roughness: 0.3, emissive: '#5a0010', emissiveIntensity: 0.3 });
    this.colliders.push([this.center.x, this.center.z, 1.5]);
    // little wooden sign
    const post = addMesh(this.group, new THREE.BoxGeometry(0.08, 0.7, 0.08), std('#7a5333'), [2.2, this.gy(2.2, 1.4) + 0.35, 1.4]);
    addMesh(this.group, new THREE.BoxGeometry(0.5, 0.28, 0.05), std('#a87a4d'), [2.2, this.gy(2.2, 1.4) + 0.62, 1.42], [0, -0.4, 0]);
    post.rotation.y = -0.4;
  }
  makeBush(i) {
    const R = rng(200 + i);
    const g = new THREE.Group();
    const s = 0.75 + R() * 0.35;
    for (let k = 0; k < 4; k++) {
      const geo = new THREE.IcosahedronGeometry(0.55 - k * 0.06, 1);
      jitter(geo, 0.07, 300 + i * 10 + k);
      const a = k * 1.9 + R();
      addMesh(g, geo, this.leafMat, [Math.cos(a) * 0.3 * (k ? 1 : 0), 0.45 + (k === 3 ? 0.3 : 0), Math.sin(a) * 0.3 * (k ? 1 : 0)]);
    }
    const berries = [];
    const bg = new THREE.SphereGeometry(0.06, 8, 6);
    for (let k = 0; k < 16; k++) {
      const th = R() * Math.PI * 2, ph = R() * 1.2;
      const r = 0.62;
      const b = addMesh(g, bg, this.berryMat, [Math.cos(th) * Math.sin(ph + 0.4) * r, 0.5 + Math.cos(ph + 0.4) * r * 0.75, Math.sin(th) * Math.sin(ph + 0.4) * r], [0, 0, 0], 1, false);
      b.userData.grow = 1;
      berries.push(b);
    }
    g.scale.setScalar(s);
    const [x, z] = this.spots[i];
    g.position.set(x, this.gy(x, z) - 0.05, z);
    g.rotation.y = R() * 6;
    this.group.add(g);
    this.bushes.push({ g, berries });
    return g;
  }
  setLevel(level) {
    const want = Math.min(this.spots.length, 2 + level);
    while (this.bushes.length < want) {
      const g = this.makeBush(this.bushes.length);
      if (this.level > 0) popIn(g, this.pops);
    }
    this.level = level;
  }
  randomBerry() {
    const bush = this.bushes[Math.floor(Math.random() * this.bushes.length)];
    const ripe = bush.berries.filter((b) => b.userData.grow >= 1);
    if (!ripe.length) return null;
    return ripe[Math.floor(Math.random() * ripe.length)];
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.32) {
      this.fxT = 0;
      const b = this.randomBerry();
      if (b) {
        const from = new THREE.Vector3();
        b.getWorldPosition(from);
        b.userData.grow = 0;
        b.scale.setScalar(0.001);
        ctx.particles.arc(from, ctx.fox.basketWorld(), { color: '#e8324e', size: 0.075, life: 0.55, height: 0.7 });
        ctx.particles.burst(from, { count: 3, color: '#4f9a3a', size: 0.04, speed: 0.8, life: 0.6, g: 3 });
      }
    }
  }
  onCycle(ctx) {
    ctx.particles.burst(ctx.fox.basketWorld(), { count: 10, color: '#ffd0e0', glow: true, size: 0.1, speed: 1, life: 0.8, g: -0.5, bright: 1.5 });
  }
  update(dt) {
    updatePops(this.pops, dt);
    for (const bush of this.bushes) for (const b of bush.berries) {
      if (b.userData.grow < 1) {
        b.userData.grow = Math.min(1, b.userData.grow + dt * 0.25);
        b.scale.setScalar(Math.max(0.001, smoothstep(0.3, 1, b.userData.grow)));
      }
    }
  }
}

// ---------------- Fallen Oak ----------------
class WoodStation extends Station {
  constructor(scene) {
    super('wood', scene);
    const bark = std('#6e4a30', { flatShading: true });
    const ring = std('#d8b483');
    const logGeo = new THREE.CylinderGeometry(0.55, 0.62, 5, 9, 3);
    jitter(logGeo, 0.04, 9);
    const log = addMesh(this.group, logGeo, [bark, ring, ring], [0, 0.5 + this.gy(0, 0), 0], [0, 0, Math.PI / 2 - 0.04]);
    log.rotation.y = 0.5;
    this.log = log;
    // Broken branches
    for (const [x, y, z, rx, rz, l] of [[0.8, 1.05, -0.2, 0.3, 0.6, 1.3], [-1.1, 1.0, 0.3, -0.5, -0.4, 1.0], [1.8, 0.9, 0.6, 0.9, 0.2, 0.9]]) {
      const b = new THREE.CylinderGeometry(0.06, 0.11, l, 5);
      b.translate(0, l / 2, 0);
      const m = addMesh(this.group, b, bark, [0, 0, 0], [rx, 0, rz]);
      m.position.set(x, y + this.gy(0, 0), z).applyAxisAngle(V(0, 1, 0), 0.5);
      m.position.y = y + this.gy(0, 0);
    }
    // Mushrooms on log
    const capM = std('#d9573f', { roughness: 0.6 }), stemM = std('#f1e6d0');
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      addMesh(g, new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6), stemM, [0, 0.07, 0]);
      addMesh(g, new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), capM, [0, 0.13, 0]);
      const t = (i - 2) * 0.7;
      g.position.set(Math.cos(0.5) * t, 1.0 + this.gy(0, 0), -Math.sin(0.5) * t - 0.25);
      g.rotation.x = -0.4;
      g.scale.setScalar(0.8 + (i % 3) * 0.3);
      this.group.add(g);
    }
    // Stump
    const stumpG = new THREE.CylinderGeometry(0.55, 0.7, 0.6, 9);
    addMesh(this.group, stumpG, [bark, ring, ring], [-2.2, this.gy(-2.2, -1.4) + 0.3, -1.4]);
    this.colliders.push([this.center.x + Math.cos(0.5) * 1.6, this.center.z - Math.sin(0.5) * 1.6, 0.75]);
    this.colliders.push([this.center.x - Math.cos(0.5) * 1.6, this.center.z + Math.sin(0.5) * 1.6, 0.75]);
    this.colliders.push([this.center.x, this.center.z, 0.75]);
    this.colliders.push([this.center.x - 2.2, this.center.z - 1.4, 0.7]);
    // Woodpile grows with level
    this.pile = new THREE.Group();
    this.pile.position.set(1.4, this.gy(1.4, 2.0), 2.0);
    this.pile.rotation.y = -0.3;
    this.group.add(this.pile);
    this.pileLogs = 0;
    this.logGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.1, 7);
    this.logGeo.rotateZ(Math.PI / 2);
    this.pileMat = [bark, ring, ring];
    this.colliders.push([this.center.x + 1.4, this.center.z + 2.0, 0.7]);
  }
  addPileLog() {
    // Pyramid stacking: rows of 4,3,2,1 ...
    const i = this.pileLogs++;
    let row = 0, idx = i, rowLen = 4;
    while (idx >= rowLen) { idx -= rowLen; row++; rowLen--; if (rowLen <= 0) { rowLen = 4; row = 0; } }
    const m = addMesh(this.pile, this.logGeo, this.pileMat, [0, 0.13 + row * 0.23, (idx - (rowLen - 1) / 2) * 0.27]);
    m.rotation.x = (Math.random() - 0.5) * 0.2;
    return m;
  }
  setLevel(level) {
    const want = Math.min(10, level * 2 + 1);
    while (this.pileLogs < want) {
      const m = this.addPileLog();
      if (this.level > 0) popIn(m, this.pops, this.pileLogs * 0.08);
    }
    this.level = level;
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.4) {
      this.fxT = 0;
      const at = ctx.fox.headWorld();
      ctx.particles.burst(at, { count: 4, color: '#c79a62', size: 0.045, speed: 1.4, life: 0.7, g: 6, up: 1.8, floor: heightAt(at.x, at.z) });
      ctx.particles.burst(at, { count: 2, color: '#6a9a3a', size: 0.04, speed: 1, life: 0.8, g: 2, up: 1 });
    }
  }
  onCycle(ctx) {
    const from = ctx.fox.headWorld();
    const to = this.pile.getWorldPosition(new THREE.Vector3()).add(V(0, 0.6, 0));
    for (let i = 0; i < 3; i++) setTimeout(() => ctx.particles.arc(from, to, { color: '#a3743f', size: 0.09, life: 0.6, height: 1 }), i * 90);
  }
  update(dt) { updatePops(this.pops, dt); }
}

// ---------------- Meadow Garden ----------------
class GardenStation extends Station {
  constructor(scene) {
    super('garden', scene);
    this.soilMat = std('#5a3b26', { roughness: 1 });
    this.woodMat = std('#8a6040');
    this.stemMat = std('#4c8a34');
    this.beds = [];
    this.plants = [];
    // Overgrown state
    this.weeds = new THREE.Group();
    const weedMat = std('#6f7a3a', { flatShading: true });
    for (let i = 0; i < 22; i++) {
      const a = i * 2.39, r = Math.sqrt(i / 22) * 2.2;
      const g = new THREE.ConeGeometry(0.12, 0.6 + (i % 4) * 0.2, 4);
      addMesh(this.weeds, g, weedMat, [Math.cos(a) * r, this.gy(Math.cos(a) * r, Math.sin(a) * r) + 0.3, Math.sin(a) * r], [(i % 3) * 0.2 - 0.2, 0, (i % 5) * 0.1 - 0.2]);
    }
    this.group.add(this.weeds);
    // Sign
    addMesh(this.group, new THREE.BoxGeometry(0.08, 0.8, 0.08), this.woodMat, [2.6, this.gy(2.6, -1.6) + 0.4, -1.6]);
    addMesh(this.group, new THREE.BoxGeometry(0.6, 0.3, 0.05), std('#b88a58'), [2.6, this.gy(2.6, -1.6) + 0.72, -1.57], [0, 0.3, 0]);
    // Fence (built on unlock)
    this.fence = new THREE.Group();
    this.group.add(this.fence);
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < 0.4) continue; // opening facing the meadow (north)
      const x = Math.cos(a) * 2.9, z = Math.sin(a) * 2.9;
      addMesh(this.fence, new THREE.BoxGeometry(0.09, 0.55, 0.09), this.woodMat, [x, this.gy(x, z) + 0.27, z]);
      const a2 = ((i + 1) / N) * Math.PI * 2;
      if (Math.abs(a2 - Math.PI * 1.5) < 0.4) continue;
      const x2 = Math.cos(a2) * 2.9, z2 = Math.sin(a2) * 2.9;
      const len = Math.hypot(x2 - x, z2 - z);
      const rail = addMesh(this.fence, new THREE.BoxGeometry(len, 0.06, 0.04), this.woodMat, [(x + x2) / 2, this.gy(x, z) + 0.38, (z + z2) / 2]);
      rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
    }
    this.fence.visible = false;
    this.bedSpots = [[-1.1, -0.6, 0.3], [1.1, -0.6, -0.3], [0, 1.0, 0], [-1.4, 1.0, 0.5], [1.4, 1.0, -0.5]];
    this.growth = 0;
  }
  addBed(i) {
    const [x, z, r] = this.bedSpots[i];
    const g = new THREE.Group();
    g.position.set(x, this.gy(x, z), z);
    g.rotation.y = r;
    const box = new THREE.BoxGeometry(1.5, 0.22, 0.8, 4, 1, 2);
    jitter(box, 0.02, 60 + i);
    addMesh(g, box, this.soilMat, [0, 0.08, 0]);
    // Border planks
    for (const [px, pz, w, d] of [[0, 0.42, 1.6, 0.06], [0, -0.42, 1.6, 0.06], [0.78, 0, 0.06, 0.8], [-0.78, 0, 0.06, 0.8]]) {
      addMesh(g, new THREE.BoxGeometry(w, 0.2, d), this.woodMat, [px, 0.1, pz]);
    }
    // Plants
    const colors = ['#ff7aa8', '#ffd35a', '#b48cff', '#ff8a5a', '#8fd0ff', '#ffffff'];
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Group();
      p.position.set(-0.55 + (k % 3) * 0.55, 0.18, k < 3 ? -0.18 : 0.18);
      addMesh(p, new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4).translate(0, 0.25, 0), this.stemMat);
      addMesh(p, new THREE.SphereGeometry(0.07, 6, 4).scale(1.4, 0.4, 0.7).translate(0.08, 0.18, 0), this.stemMat);
      const bloom = addMesh(p, new THREE.ConeGeometry(0.1, 0.16, 6, 1, true).rotateX(Math.PI).translate(0, 0.55, 0),
        std(colors[(i * 2 + k) % colors.length], { side: THREE.DoubleSide, emissive: colors[(i * 2 + k) % colors.length], emissiveIntensity: 0.12 }));
      p.userData.bloom = bloom;
      p.userData.phase = Math.random() * 6;
      g.add(p);
      this.plants.push(p);
    }
    this.group.add(g);
    this.beds.push(g);
    return g;
  }
  setUnlocked(on, animate) {
    this.weeds.visible = !on;
    this.fence.visible = on;
    if (on && !this.beds.length) {
      this.addBed(0); this.addBed(1);
      if (animate) {
        this.beds.forEach((b, i) => popIn(b, this.pops, i * 0.2));
        this.fence.children.forEach((c, i) => popIn(c, this.pops, 0.3 + i * 0.02));
      }
    }
    this.unlocked = on;
  }
  setLevel(level) {
    if (!this.unlocked) { this.level = level; return; }
    const want = Math.min(this.bedSpots.length, 1 + level);
    while (this.beds.length < want) {
      const b = this.addBed(this.beds.length);
      if (this.level > 0) popIn(b, this.pops);
    }
    this.level = level;
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.2) {
      this.fxT = 0;
      const p = ctx.fox.pawWorld();
      ctx.particles.burst(p, { count: 3, color: '#6b4a2e', size: 0.05, speed: 1.2, life: 0.6, g: 7, up: 1.6, floor: heightAt(p.x, p.z) });
      if (Math.random() < 0.5) ctx.particles.rise(this.world((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3), { color: '#b8ff9a', size: 0.07, life: 1.6, speed: 0.5, bright: 1.6 });
    }
    this.growth = Math.min(1, this.growth + dt * 0.05);
  }
  onCycle(ctx) {
    ctx.particles.burst(this.world(0, 0.6, 0), { count: 18, color: '#c8ffb0', glow: true, size: 0.1, speed: 1.6, up: 1.2, life: 1.1, g: -0.3, bright: 1.8, spread: 1 });
    this.pulse = 1;
  }
  update(dt, t, ctx) {
    updatePops(this.pops, dt);
    this.pulse = Math.max(0, this.pulse - dt);
    const v = ctx.world.vitality;
    for (const p of this.plants) {
      const s = 0.55 + v * 0.55 + this.pulse * 0.08;
      if (!p.userData.targetScale || !this.pops.find((q) => q.obj === p)) p.scale.setScalar(s);
      p.rotation.z = Math.sin(t * 1.5 + p.userData.phase) * 0.06;
    }
  }
}

// ---------------- Moss Shrine ----------------
class ShrineStation extends Station {
  constructor(scene) {
    super('shrine', scene);
    const stone = std('#8f8d84', { flatShading: true, roughness: 1 });
    const moss = std('#5e8a3a', { flatShading: true });
    const plat = new THREE.CylinderGeometry(3.0, 3.2, 0.3, 14);
    jitter(plat, 0.03, 70);
    addMesh(this.group, plat, stone, [0, this.gy(0, 0) + 0.05, 0]);
    addMesh(this.group, new THREE.CylinderGeometry(2.6, 2.6, 0.05, 14), moss, [0, this.gy(0, 0) + 0.21, 0]);
    // central altar
    const altar = new THREE.CylinderGeometry(0.5, 0.65, 0.9, 6);
    jitter(altar, 0.04, 71);
    addMesh(this.group, altar, stone, [0, this.gy(0, 0) + 0.65, 0]);
    addMesh(this.group, new THREE.CylinderGeometry(0.55, 0.55, 0.08, 6), moss, [0, this.gy(0, 0) + 1.12, 0]);
    this.colliders.push([this.center.x, this.center.z, 0.8]);
    // Floating spirit orb
    this.orbMat = new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffcf6b', emissiveIntensity: 1.2, roughness: 0.3 });
    this.orb = addMesh(this.group, new THREE.IcosahedronGeometry(0.22, 2), this.orbMat, [0, this.gy(0, 0) + 1.7, 0], [0, 0, 0], 1, false);
    this.orbLight = new THREE.PointLight('#ffcf6b', 2, 7, 1.6);
    this.orbLight.position.copy(this.orb.position);
    this.group.add(this.orbLight);
    // Ring of standing stones with runes
    this.runes = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 2.6, z = Math.sin(a) * 2.6;
      if (Math.abs(a - Math.PI) < 0.5) continue; // opening facing west (toward meadow)
      const h = 1.4 + (i % 3) * 0.35;
      const sg = new THREE.BoxGeometry(0.45, h, 0.3, 1, 3, 1);
      jitter(sg, 0.05, 80 + i);
      const s = addMesh(this.group, sg, stone, [x, this.gy(x, z) + h / 2, z], [0, -a, (i % 2 ? 0.05 : -0.05)]);
      addMesh(this.group, new THREE.BoxGeometry(0.47, 0.15, 0.32), moss, [x, this.gy(x, z) + h - 0.05, z], [0, -a, 0]);
      const runeMat = new THREE.MeshStandardMaterial({ color: '#2d2b25', emissive: '#ffcf6b', emissiveIntensity: 0, roughness: 0.6 });
      const rune = addMesh(this.group, new THREE.PlaneGeometry(0.18, 0.5), runeMat, [0, 0, 0], [0, 0, 0], 1, false);
      rune.position.set(x - Math.cos(a) * 0.16, this.gy(x, z) + h * 0.55, z - Math.sin(a) * 0.16);
      rune.lookAt(this.center.x, rune.position.y + this.center.y, this.center.z);
      rune.position.set(x - Math.cos(a) * 0.16, this.gy(x, z) + h * 0.55, z - Math.sin(a) * 0.16);
      this.runes.push(runeMat);
      this.colliders.push([this.center.x + x, this.center.z + z, 0.35]);
      void s;
    }
    // lanterns (one per level)
    this.lanterns = [];
    this.lanternSpots = [[-2.4, 1.6], [-2.4, -1.6], [0.5, 3.4], [0.5, -3.4], [3.3, 0]];
  }
  addLantern(i) {
    const [x, z] = this.lanternSpots[i];
    const g = new THREE.Group();
    g.position.set(x, this.gy(x, z), z);
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5).translate(0, 0.55, 0), std('#5a4030'));
    addMesh(g, new THREE.BoxGeometry(0.28, 0.06, 0.28), std('#3a2c22'), [0, 1.12, 0]);
    const lamp = addMesh(g, new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#ffb84a', emissiveIntensity: 2.2 }), [0, 1.27, 0], [0, 0, 0], [1, 1.3, 1], false);
    g.userData.lamp = lamp;
    this.group.add(g);
    this.lanterns.push(g);
    return g;
  }
  setLevel(level) {
    while (this.lanterns.length < level) {
      const l = this.addLantern(this.lanterns.length);
      if (this.level > 0) popIn(l, this.pops);
    }
    this.level = level;
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.12) {
      this.fxT = 0;
      ctx.particles.rise(ctx.fox.group.position.clone().add(V(0, 0.2, 0)), { color: '#ffe08a', size: 0.08, radius: 1.1, speed: 0.55, life: 2.6, bright: 2.2 });
      if (Math.random() < 0.4) {
        const p = ctx.fox.headWorld();
        ctx.particles.arc(p, this.orb.getWorldPosition(new THREE.Vector3()), { color: '#ffd77a', glow: true, size: 0.07, life: 1.1, height: 1.2, bright: 2.5 });
      }
    }
  }
  onCycle(ctx) {
    this.pulse = 1;
    ctx.particles.burst(this.orb.getWorldPosition(new THREE.Vector3()), { count: 22, color: '#ffe3a0', glow: true, size: 0.1, speed: 2, up: 0.3, g: -0.2, drag: 2, life: 1.3, bright: 2.5 });
  }
  update(dt, t, ctx) {
    updatePops(this.pops, dt);
    this.pulse = Math.max(0, this.pulse - dt * 1.2);
    this.orb.position.y = this.gy(0, 0) + 1.7 + Math.sin(t * 1.3) * 0.1;
    this.orb.rotation.y = t * 0.5;
    const working = ctx.working;
    this.orbMat.emissiveIntensity = 1.2 + (working ? 0.8 : 0) + this.pulse * 2.5;
    this.orb.scale.setScalar(1 + this.pulse * 0.3);
    this.orbLight.intensity = (ctx.unlockedArea ? 2 : 0.2) + this.pulse * 3;
    this.orbLight.position.y = this.orb.position.y;
    this.runes.forEach((r, i) => { r.emissiveIntensity = damp(r.emissiveIntensity, i < this.level + (working ? 1 : 0) ? 1.6 + Math.sin(t * 2 + i) * 0.4 : 0.05, 2, dt); });
    this.lanterns.forEach((l, i) => { l.userData.lamp.material.emissiveIntensity = 2 + Math.sin(t * 3 + i * 1.7) * 0.4; });
  }
}

// ---------------- Moon Pool ----------------
class PoolStation extends Station {
  constructor(scene) {
    super('pool', scene);
    this.waterY = POOL_WATER - this.center.y;
    this.waterUniforms = { uTime: windUniforms.uTime, uGlow: { value: 0.3 }, uNight: { value: 0 } };
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.7, 48), new THREE.ShaderMaterial({
      uniforms: this.waterUniforms, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uGlow, uNight; varying vec2 vP; varying vec3 vW;
        void main(){
          float r = length(vP)/3.7;
          float rip = sin(r*40.0 - uTime*1.6)*0.5+0.5;
          float rip2 = sin(vP.x*3.0+uTime*0.7)*sin(vP.y*3.3-uTime*0.6)*0.5+0.5;
          vec3 deep = vec3(0.01,0.05,0.12), shallow = vec3(0.04,0.18,0.26);
          vec3 col = mix(shallow, deep, smoothstep(0.2, 0.9, 1.0-r)*0.7 + rip2*0.15);
          vec3 cam = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(cam.y, 0.0), 4.0);
          col += vec3(0.35,0.5,0.75)*fres*0.35;
          float spark = pow(max(0.0, sin(vP.x*5.0+uTime*0.9+sin(vP.y*2.0))*sin(vP.y*4.6-uTime*0.8)), 60.0);
          col += vec3(0.8,0.9,1.0)*spark*0.35;
          // moon reflection blob
          float moon = smoothstep(0.35, 0.0, length(vP - vec2(-0.6, 0.5)));
          col += vec3(0.7,0.85,1.0) * moon * uNight * 0.7 * (0.8+rip*0.4);
          col += vec3(0.15,0.4,0.9) * uGlow * (0.12 + rip*0.1) * smoothstep(1.0, 0.0, r);
          float edge = smoothstep(0.92, 1.0, r);
          gl_FragColor = vec4(col, 0.93 * (1.0-edge*0.5));
        }`,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = this.waterY;
    water.renderOrder = 2;
    this.group.add(water);
    this.colliders.push([this.center.x, this.center.z, 3.7]);
    // bed under water
    
    // rim stones
    const stone = std('#7d8580', { flatShading: true });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const g = new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.08, 0);
      jitter(g, 0.06, 90 + i);
      const x = Math.cos(a) * 3.85, z = Math.sin(a) * 3.85;
      addMesh(this.group, g, stone, [x, this.gy(x, z) + 0.05, z], [i, i * 2, 0], [1, 0.6, 1]);
    }
    // lily pads
    const padM = std('#3f8a4a', { side: THREE.DoubleSide }), flM = std('#ffd6ea', { emissive: '#ff9ccc', emissiveIntensity: 0.25 });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.1, r = 1.2 + (i % 3) * 0.8;
      const pad = addMesh(this.group, new THREE.CircleGeometry(0.28, 10, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), padM, [Math.cos(a) * r, this.waterY + 0.02, Math.sin(a) * r], [0, a, 0], 1, false);
      if (i % 2 === 0) addMesh(this.group, new THREE.ConeGeometry(0.08, 0.1, 6), flM, [pad.position.x, this.waterY + 0.08, pad.position.z], [Math.PI, 0, 0], 1, false);
    }
    // reeds
    const reedM = std('#6a8a3a');
    addWind(reedM, { strength: 0.2, heightScale: 1 });
    for (let i = 0; i < 30; i++) {
      const a = 2.2 + (i / 30) * 2.2 + Math.sin(i) * 0.1;
      const r = 4.1 + (i % 3) * 0.25;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      addMesh(this.group, new THREE.CylinderGeometry(0.012, 0.02, 1 + (i % 4) * 0.25, 3).translate(0, 0.5, 0), reedM, [x, this.gy(x, z), z], [(i % 3 - 1) * 0.1, 0, (i % 5 - 2) * 0.05]);
    }
    // crystals grow per level
    this.crystals = [];
    this.crystalMat = new THREE.MeshStandardMaterial({ color: '#a8d4ff', emissive: '#4a9cff', emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
    this.crystalSpots = [[4.6, 0.4], [3.2, -3.4], [-1.4, -4.6], [-4.4, -1.6], [-3.6, 3.0], [0.4, 4.7], [3.4, 3.4]];
    this.light = new THREE.PointLight('#6fb0ff', 1.5, 10, 1.5);
    this.light.position.set(0, this.waterY + 1.2, 0);
    this.group.add(this.light);
  }
  addCrystal(i) {
    const [x, z] = this.crystalSpots[i];
    const g = new THREE.Group();
    g.position.set(x, this.gy(x, z), z);
    const R = rng(500 + i);
    for (let k = 0; k < 3; k++) {
      const h = 0.7 + R() * 0.9 - k * 0.2;
      const c = new THREE.OctahedronGeometry(0.22, 0);
      c.scale(1, h / 0.22 / 2, 1);
      addMesh(g, c, this.crystalMat, [k ? (R() - 0.5) * 0.4 : 0, h / 2, k ? (R() - 0.5) * 0.4 : 0], [(R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5], 1, false);
    }
    this.group.add(g);
    this.crystals.push(g);
    return g;
  }
  setLevel(level) {
    const want = Math.min(this.crystalSpots.length, level + 1);
    while (this.crystals.length < want) {
      const c = this.addCrystal(this.crystals.length);
      if (this.level > 0) popIn(c, this.pops);
    }
    this.level = level;
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.08) {
      this.fxT = 0;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
      const from = this.world(Math.cos(a) * r, this.waterY + 0.05, Math.sin(a) * r);
      ctx.particles.arc(from, ctx.fox.headWorld().add(V(0, 0.4, 0)), { color: '#8cc6ff', glow: true, size: 0.07, life: 1.2, height: 1.8, bright: 2.6 });
    }
  }
  onCycle(ctx) {
    this.pulse = 1;
    const p = ctx.fox.headWorld();
    ctx.particles.spiral(p.clone().add(V(0, -0.6, 0)), { count: 26, color: '#a8d8ff', radius: 1.0, rise: 1.2, spin: 4, life: 1.4, size: 0.08 });
  }
  update(dt, t, ctx) {
    updatePops(this.pops, dt);
    this.pulse = Math.max(0, this.pulse - dt);
    this.waterUniforms.uGlow.value = damp(this.waterUniforms.uGlow.value, (ctx.working ? 0.8 : 0.25) + this.pulse * 0.6, 3, dt);
    this.waterUniforms.uNight.value = ctx.world.nightFactor;
    this.crystalMat.emissiveIntensity = 1.1 + Math.sin(t * 1.5) * 0.25 + this.pulse * 1.5 + (ctx.working ? 0.4 : 0);
    this.light.intensity = ctx.unlockedArea ? 1.5 + this.pulse * 2 : 0.2;
    this.crystals.forEach((c, i) => { c.position.y = this.gy(c.position.x, c.position.z) + Math.sin(t * 0.8 + i) * 0.05; });
  }
}

// ---------------- Wisp Circle ----------------
class HollowStation extends Station {
  constructor(scene) {
    super('hollow', scene);
    const stone = std('#77756d', { flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.3) continue; // opening toward the meadow (+z)
      const x = Math.cos(a) * 3.2, z = Math.sin(a) * 3.2;
      const h = 1.2 + (i % 2) * 0.6;
      const g = new THREE.BoxGeometry(0.5, h, 0.4, 1, 2, 1);
      jitter(g, 0.05, 110 + i);
      addMesh(this.group, g, stone, [x, this.gy(x, z) + h / 2, z], [0, -a, 0]);
      this.colliders.push([this.center.x + x, this.center.z + z, 0.4]);
    }
    const ped = new THREE.CylinderGeometry(0.35, 0.5, 0.7, 7);
    jitter(ped, 0.03, 120);
    addMesh(this.group, ped, stone, [0, this.gy(0, 0) + 0.35, 0]);
    this.colliders.push([this.center.x, this.center.z, 0.6]);
    this.bowlMat = new THREE.MeshStandardMaterial({ color: '#c8fff0', emissive: '#6affd0', emissiveIntensity: 1.2 });
    this.bowl = addMesh(this.group, new THREE.SphereGeometry(0.2, 12, 8), this.bowlMat, [0, this.gy(0, 0) + 0.85, 0], [0, 0, 0], 1, false);
    // glowing mushrooms
    const capCols = ['#6affd0', '#b58cff', '#7fc8ff'];
    this.shroomMats = capCols.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.1, roughness: 0.5 }));
    const stemM = std('#e8e0d0');
    const R = rng(130);
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, r = 1.2 + R() * 6.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (r > 2.6 && r < 3.8) continue;
      const g = new THREE.Group();
      const s = 0.5 + R() * 1.1;
      addMesh(g, new THREE.CylinderGeometry(0.03, 0.045, 0.22, 5).translate(0, 0.11, 0), stemM, [0, 0, 0], [0, 0, 0], 1, false);
      addMesh(g, new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), this.shroomMats[i % 3], [0, 0.2, 0], [0, 0, 0], [1, 0.8, 1], false);
      g.scale.setScalar(s);
      g.position.set(x, this.gy(x, z), z);
      this.group.add(g);
    }
    this.light = new THREE.PointLight('#6affd0', 1.5, 9, 1.5);
    this.light.position.set(0, this.gy(0, 0) + 1.4, 0);
    this.group.add(this.light);
  }
  onCycle(ctx) {
    ctx.particles.burst(this.bowl.getWorldPosition(new THREE.Vector3()), { count: 30, color: '#9fffe0', glow: true, size: 0.1, speed: 2.5, up: 1.5, g: -0.3, drag: 1.5, life: 1.5, bright: 2.5 });
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.25) {
      this.fxT = 0;
      ctx.particles.rise(this.world(0, this.gy(0, 0) + 0.9, 0), { color: '#9fffe0', radius: 0.3, speed: 0.6, size: 0.07, bright: 2.2 });
    }
  }
  update(dt, t, ctx) {
    this.bowlMat.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.3;
    this.shroomMats.forEach((m, i) => { m.emissiveIntensity = 0.9 + Math.sin(t * 1.2 + i * 2) * 0.3 + ctx.world.nightFactor * 0.5; });
    this.light.intensity = ctx.unlockedArea ? 1.5 : 0.2;
  }
}

// ---------------- The Great Tree ----------------
class TreeStation extends Station {
  constructor(scene) {
    super('tree', scene);
    this.barkMat = std('#8a837a', { roughness: 1 });
    this.veinMat = new THREE.MeshStandardMaterial({ color: '#8a837a', emissive: '#7dff8a', emissiveIntensity: 0, roughness: 0.9 });
    this.leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.85, emissive: '#2a6020', emissiveIntensity: 0 });
    addWind(this.leafMat, { strength: 0.02, heightScale: 0.25, base: 5 });
    this.blossomMat = new THREE.MeshStandardMaterial({ color: '#ffd0e0', flatShading: true, roughness: 0.7, emissive: '#ff8ab4', emissiveIntensity: 0.35 });
    addWind(this.blossomMat, { strength: 0.02, heightScale: 0.25, base: 5 });
    this.tree = new THREE.Group();
    this.tree.position.y = this.gy(0, 0) - 0.1;
    this.group.add(this.tree);
    this.colliders.push([this.center.x, this.center.z, 1.9]);
    this.tips = [];
    this.buildTrunk();
    this.buildCanopy();
    // Heartlight core
    this.coreMat = new THREE.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd36b', emissiveIntensity: 0 });
    this.core = addMesh(this.tree, new THREE.IcosahedronGeometry(0.38, 2), this.coreMat, [0.3, 2.4, 1.2], [0, 0, 0], 1, false);
    this.coreLight = new THREE.PointLight('#ffd36b', 0, 18, 1.4);
    this.coreLight.position.set(0, 3, 1.4);
    this.tree.add(this.coreLight);
    this.shown = { stage: 0, grey: 1, leaves: 0, blossom: 0, heart: 0, veins: 0, scale: 0.82 };
    this.stage = 0;
    this.applyShown();
  }
  buildTrunk() {
    // A single continuous trunk: rings along a gently curving spine, flared roots at the base.
    const rings = 22, seg = 16, height = 7.2;
    const spine = (t) => V(Math.sin(t * 2.2) * 0.35, t * height, Math.sin(t * 3.1 + 1) * 0.25);
    const radius = (t) => 0.42 + 0.85 * Math.pow(1 - t, 1.6) + 0.9 * Math.pow(Math.max(0, 1 - t * 6), 2);
    const pos = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const c = spine(t);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        const flute = 1 + 0.12 * Math.sin(a * 5 + t * 4) * (1 - t * 0.7) + 0.25 * Math.pow(Math.max(0, Math.sin(a * 3.5 + 0.4)), 4) * Math.max(0, 1 - t * 5);
        const r = radius(t) * flute * (1 + fbm(a * 1.3 + 10, t * 6, 2) * 0.08);
        pos.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
        if (i < rings && j < seg) {
          const k = i * (seg + 1) + j;
          idx.push(k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2);
        }
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    let x = spine(1).x, y = height, z = spine(1).z;
    const trunk = new THREE.Mesh(tg, this.barkMat);
    trunk.castShadow = trunk.receiveShadow = true;
    this.tree.add(trunk);
    // Hollow for the heart
    addMesh(this.tree, new THREE.SphereGeometry(0.5, 10, 8).scale(1, 1.3, 0.6), std('#2a1d14'), [spine(0.33).x, 2.4, spine(0.33).z + 0.95]);
    this.trunkTop = V(x, y, z);
    // Roots
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const len = 2.2 + (i % 3) * 0.5;
      const g = new THREE.CylinderGeometry(0.08, 0.36, len, 9);
      g.translate(0, len / 2, 0);
      const m = addMesh(this.tree, g, this.veinMat, [Math.cos(a) * 0.9, 0.25, Math.sin(a) * 0.9]);
      m.lookAt(Math.cos(a) * 5, -0.9, Math.sin(a) * 5);
      m.rotateX(Math.PI / 2);
    }
    // Branches (recursive)
    const R = rng(160);
    const branch = (start, dir, len, rad, depth) => {
      const end = start.clone().addScaledVector(dir, len);
      const g = new THREE.CylinderGeometry(rad * 0.62, rad, len, 6);
      g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, this.barkMat);
      m.castShadow = true;
      m.position.copy(start);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      this.tree.add(m);
      if (depth === 0) { this.tips.push(end); return; }
      const n = depth === 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const nd = dir.clone().add(V((R() - 0.5) * 1.3, 0.35 + R() * 0.4, (R() - 0.5) * 1.3)).normalize();
        branch(end, nd, len * (0.62 + R() * 0.15), rad * 0.6, depth - 1);
      }
      if (depth <= 1) this.tips.push(end);
    };
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const d = V(Math.cos(a) * 0.9, 0.85, Math.sin(a) * 0.9).normalize();
      const startY = 4.6 + (i % 2) * 1.0;
      branch(V(Math.sin(startY * 0.9) * 0.1, startY, 0), d, 2.6, 0.42, 2);
    }
    branch(this.trunkTop.clone().add(V(0, -0.3, 0)), V(0.1, 1, 0).normalize(), 2.0, 0.35, 2);
  }
  buildCanopy() {
    this.canopy = new THREE.Group();
    this.blossoms = new THREE.Group();
    this.tree.add(this.canopy, this.blossoms);
    const R = rng(170);
    const used = [];
    for (const tip of this.tips) {
      if (used.some((u) => u.distanceTo(tip) < 1.0)) continue;
      used.push(tip);
      const r = 1.2 + R() * 0.9;
      const g = new THREE.IcosahedronGeometry(r, 1);
      jitter(g, 0.15, 180 + used.length);
      paintGradient(g, '#3a7a35', '#a8d860', -r, r);
      const m = addMesh(this.canopy, g, this.leafMat, [tip.x, tip.y + 0.3, tip.z]);
      m.material = this.leafMat;
      for (let k = 0; k < 14; k++) {
        const th = R() * Math.PI * 2, ph = R() * Math.PI * 0.62;
        const bg = new THREE.IcosahedronGeometry(0.1 + R() * 0.07, 0);
        addMesh(this.blossoms, bg, this.blossomMat, [tip.x + Math.cos(th) * Math.sin(ph) * r, tip.y + 0.3 + Math.cos(ph) * r * 0.9, tip.z + Math.sin(th) * Math.sin(ph) * r], [R(), R(), R()], 1, false);
      }
    }
    this.leafMat.vertexColors = true;
  }
  setStage(stage) { this.stage = stage; }
  applyShown() {
    const S = this.shown;
    const grey = new THREE.Color('#8a837a'), brown = new THREE.Color('#7a5638');
    this.barkMat.color.copy(grey).lerp(brown, 1 - S.grey);
    this.canopy.scale.setScalar(Math.max(0.0001, S.leaves));
    this.canopy.visible = S.leaves > 0.01;
    this.blossoms.scale.setScalar(Math.max(0.0001, S.blossom));
    this.blossoms.visible = S.blossom > 0.01;
    this.tree.scale.setScalar(S.scale);
  }
  update(dt, t, ctx) {
    const st = this.stage;
    const S = this.shown;
    const tgt = {
      grey: st >= 2 ? 0 : st >= 1 ? 0.5 : 1,
      leaves: st >= 3 ? 1 : st >= 2 ? 0.25 : 0,
      blossom: st >= 4 ? 1 : 0,
      heart: st >= 5 ? 1 : 0,
      veins: st >= 1 ? 1 : 0,
      scale: [0.82, 0.86, 0.94, 1.0, 1.04, 1.1][st],
    };
    for (const k in tgt) S[k] = damp(S[k], tgt[k], 0.9, dt);
    this.applyShown();
    this.veinMat.emissiveIntensity = S.veins * (0.22 + Math.sin(t * 1.5) * 0.08) + S.heart * 0.25;
    this.veinMat.color.copy(this.barkMat.color);
    this.coreMat.emissiveIntensity = S.heart * (3 + Math.sin(t * 2) * 0.8);
    this.core.scale.setScalar(Math.max(0.0001, S.heart));
    this.core.visible = S.heart > 0.01;
    this.coreLight.intensity = S.heart * 6;
    this.leafMat.emissiveIntensity = S.heart * 0.25;
    // Petals drifting from the blossoms
    if (S.blossom > 0.5 && Math.random() < dt * 6) {
      const tip = this.tips[Math.floor(Math.random() * this.tips.length)];
      const p = this.tree.localToWorld(tip.clone());
      ctx.particles.solid.add({ x: p.x, y: p.y, z: p.z, vx: 0.3, vy: -0.4, vz: 0.1, sway: 1.2, seed: Math.random() * 10, g: 0, drag: 0,
        color: '#ffc2d8', size: 0.07, life: 7, fadeIn: 0.5 });
    }
    if (S.heart > 0.5 && Math.random() < dt * 8) {
      ctx.particles.rise(this.world((Math.random() - 0.5) * 8, 0.3, (Math.random() - 0.5) * 8), { color: '#ffe08a', size: 0.09, speed: 0.8, life: 4, bright: 2.4 });
    }
  }
  workFx(dt, ctx) {
    this.fxT += dt;
    if (this.fxT > 0.3) {
      this.fxT = 0;
      ctx.particles.rise(ctx.fox.group.position.clone(), { color: '#c8ffb0', size: 0.06, radius: 0.8, speed: 0.4, bright: 1.6 });
    }
  }
  celebrate(ctx) {
    const c = this.world(0, 3, 0);
    ctx.particles.spiral(this.world(0, 0.2, 0), { count: 120, color: '#ffe7a0', radius: 4, rise: 2.2, spin: 1.6, life: 3, size: 0.12, shrink: 0.7 });
    ctx.particles.burst(c, { count: 80, color: '#c8ffb0', glow: true, size: 0.14, speed: 4, up: 2, g: 0.5, drag: 1, life: 2.5, bright: 2.5, spread: 1 });
  }
}

// ---------------- Gates & mist ----------------
class Gate {
  constructor(areaId, scene) {
    this.id = areaId;
    const a = AREAS[areaId];
    this.def = a;
    const [gx, gz] = a.gate;
    this.center = V(gx, heightAt(gx, gz), gz);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    // face toward the area
    const dir = Math.atan2(a.center[0] - gx, a.center[1] - gz);
    this.group.rotation.y = dir;
    scene.add(this.group);
    const stone = std('#85837a', { flatShading: true });
    const moss = std('#5e8a3a', { flatShading: true });
    this.runeMats = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.55, 2.4, 0.5, 1, 4, 1);
      jitter(g, 0.06, 200 + sx);
      addMesh(this.group, g, stone, [sx * 1.7, 1.15, 0], [0, 0, sx * -0.05]);
      addMesh(this.group, new THREE.BoxGeometry(0.6, 0.2, 0.55), moss, [sx * 1.68, 2.3, 0]);
      const rm = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#9de8ff', emissiveIntensity: 0.15 });
      addMesh(this.group, new THREE.PlaneGeometry(0.2, 0.7), rm, [sx * 1.7, 1.3, -0.26], [0, Math.PI, 0], 1, false);
      this.runeMats.push(rm);
    }
    // Brambles: thorny tubes woven between the pillars
    this.brambles = new THREE.Group();
    this.group.add(this.brambles);
    const bm = std('#3d3326', { roughness: 1 });
    const thornM = std('#5a4a35');
    const R = rng(210 + areaId.length);
    for (let i = 0; i < 9; i++) {
      const pts = [];
      const y0 = 0.2 + R() * 1.6;
      for (let k = 0; k <= 6; k++) {
        const x = -1.6 + (k / 6) * 3.2;
        pts.push(V(x, y0 + Math.sin(k * 1.3 + i) * 0.45 + (R() - 0.5) * 0.3, Math.cos(k * 1.7 + i * 2) * 0.35));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 24, 0.045 + R() * 0.03, 5, false);
      addMesh(this.brambles, tg, bm);
      for (let k = 0; k < 8; k++) {
        const p = curve.getPoint(R());
        addMesh(this.brambles, new THREE.ConeGeometry(0.03, 0.14, 4), thornM, [p.x, p.y, p.z], [R() * 6, R() * 6, R() * 6], 1, false);
      }
    }
    // Leaves on brambles
    const lm = std('#4a5a2a', { side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) addMesh(this.brambles, new THREE.CircleGeometry(0.1, 5), lm, [-1.5 + R() * 3, 0.2 + R() * 2, (R() - 0.5) * 0.6], [R() * 6, R() * 6, 0], 1, false);
    // Rune stone in front with the cost
    this.signMat = new THREE.MeshStandardMaterial({ color: '#6e6c64', emissive: '#9de8ff', emissiveIntensity: 0.4, flatShading: true });
    const sg = new THREE.DodecahedronGeometry(0.35, 0);
    jitter(sg, 0.05, 220);
    this.sign = addMesh(this.group, sg, this.signMat, [0, 0.35, -1.6], [0, 0, 0], [1, 1.3, 0.8]);
    this.open = false;
    this.openT = 0;
    this.radius = 3.2;
    // world-space colliders for the bramble wall (removed when opened)
    this.colliders = [];
    const right = V(Math.cos(dir), 0, -Math.sin(dir));
    for (let k = -2; k <= 2; k++) this.colliders.push([gx + right.x * k * 0.8, gz + right.z * k * 0.8, 0.6]);
    for (const sx of [-1, 1]) this.colliders.push([gx + right.x * sx * 1.7, gz + right.z * sx * 1.7, 0.45]);
    this.pillarColliders = this.colliders.slice(5);
  }
  setOpen(on, animate) {
    this.open = on;
    if (!animate) {
      this.openT = on ? 1 : 0;
      this.brambles.visible = !on;
      this.sign.visible = !on;
    }
  }
  activeColliders() { return this.open ? this.pillarColliders : this.colliders; }
  update(dt, t) {
    if (this.open && this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt * 0.6);
      const e = smoothstep(0, 1, this.openT);
      this.brambles.scale.set(1 - e * 0.3, Math.max(0.001, 1 - e), 1 - e * 0.3);
      this.brambles.position.y = -e * 0.4;
      this.sign.scale.setScalar(Math.max(0.001, 1 - e));
      if (this.openT >= 1) { this.brambles.visible = false; this.sign.visible = false; }
    }
    this.runeMats.forEach((m) => { m.emissiveIntensity = this.open ? 1.6 + Math.sin(t * 2) * 0.3 : 0.15 + Math.sin(t * 1.5) * 0.08; });
    this.signMat.emissiveIntensity = 0.3 + Math.sin(t * 2.2) * 0.2;
  }
}

class Mist {
  constructor(areaId, scene) {
    const a = AREAS[areaId];
    const N = 70;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = new THREE.PlaneGeometry(1, 1).index;
    geo.attributes.position = new THREE.PlaneGeometry(1, 1).attributes.position;
    geo.attributes.uv = new THREE.PlaneGeometry(1, 1).attributes.uv;
    const offs = new Float32Array(N * 3), sizes = new Float32Array(N), seeds = new Float32Array(N);
    const R = rng(300 + areaId.length * 7);
    for (let i = 0; i < N; i++) {
      const ang = R() * Math.PI * 2, r = Math.sqrt(R()) * a.radius * 1.05;
      const x = a.center[0] + Math.cos(ang) * r, z = a.center[1] + Math.sin(ang) * r;
      offs.set([x, heightAt(x, z) + 0.6 + R() * 3.5, z], i * 3);
      sizes[i] = 5 + R() * 6;
      seeds[i] = R() * 100;
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.instanceCount = N;
    this.uniforms = { uTime: windUniforms.uTime, uAlpha: { value: 1 }, uTex: { value: mistTexture() }, uColor: { value: new THREE.Color('#e8eef5') }, uLift: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute vec3 aOff; attribute float aSize; attribute float aSeed; uniform float uTime, uLift; varying vec2 vUv; varying float vS; varying float vD;
        void main(){ vUv = uv; vS = aSeed;
          vec3 c = aOff; c.x += sin(uTime*0.07+aSeed)*1.2; c.z += cos(uTime*0.06+aSeed)*1.2; c.y += uLift*(2.0+fract(aSeed)*4.0);
          vec4 mv = viewMatrix * vec4(c,1.0);
          float a = uTime*0.03 + aSeed; mat2 rot = mat2(cos(a),-sin(a),sin(a),cos(a));
          mv.xy += rot * position.xy * aSize * (1.0+uLift*0.6);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv; varying float vS; varying float vD;
        void main(){ float t = texture2D(uTex, vUv).a; float near = smoothstep(1.0, 5.0, vD); gl_FragColor = vec4(uColor, t*uAlpha*0.95*near); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.clearing = false;
    this.t = 0;
  }
  clear(animate) {
    this.clearing = true;
    if (!animate) { this.t = 1; this.mesh.visible = false; }
  }
  update(dt, world) {
    this.uniforms.uColor.value.copy(world.scene.fog.color).lerp(new THREE.Color('#ffffff'), 0.45);
    if (this.clearing && this.t < 1) {
      this.t = Math.min(1, this.t + dt * 0.35);
      this.uniforms.uAlpha.value = 1 - smoothstep(0, 1, this.t);
      this.uniforms.uLift.value = smoothstep(0, 1, this.t);
      if (this.t >= 1) this.mesh.visible = false;
    }
  }
}

// ---------------- Wisps (idle helpers) ----------------
class Wisps {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.11, 12, 8);
    this.hues = ['#9fffe0', '#ffd6a0', '#c8b0ff', '#a0d8ff', '#ffb0d0', '#e0ffa0'];
  }
  add(stationCenter, fromPos, instant) {
    const col = this.hues[this.list.length % this.hues.length];
    const m = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.6 }));
    m.position.copy(instant ? stationCenter : fromPos);
    this.scene.add(m);
    this.list.push({ mesh: m, target: stationCenter.clone(), phase: Math.random() * 6, color: new THREE.Color(col), r: 1.6 + Math.random() * 0.8, speed: 0.5 + Math.random() * 0.4, fly: instant ? 1 : 0, from: fromPos.clone() });
  }
  update(dt, t, particles) {
    const counts = new Map();
    for (const w of this.list) {
      const key = `${w.target.x},${w.target.z}`;
      const idx = counts.get(key) || 0;
      counts.set(key, idx + 1);
      const ang = t * w.speed + w.phase + idx * 1.3;
      const orbit = V(w.target.x + Math.cos(ang) * w.r, w.target.y + 1.4 + Math.sin(t * 1.7 + w.phase) * 0.3, w.target.z + Math.sin(ang) * w.r);
      if (w.fly < 1) {
        w.fly = Math.min(1, w.fly + dt * 0.25);
        const e = smoothstep(0, 1, w.fly);
        w.mesh.position.lerpVectors(w.from, orbit, e);
        w.mesh.position.y += Math.sin(e * Math.PI) * 6;
      } else {
        w.mesh.position.lerp(orbit, 1 - Math.exp(-dt * 4));
      }
      w.mesh.scale.setScalar(1 + Math.sin(t * 5 + w.phase) * 0.15);
      if (Math.random() < dt * 14) {
        const p = w.mesh.position;
        particles.glow.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.15, vz: 0, color: w.color, size: 0.07, life: 0.8, bright: 1.8 });
      }
    }
  }
}

// ---------------- Ground interaction ring ----------------
function makeRing(radius) {
  const geo = new THREE.RingGeometry(radius - 0.12, radius, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  return m;
}

export class StationManager {
  constructor(scene, world, particles) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.stations = {
      berries: new BerryStation(scene), wood: new WoodStation(scene), garden: new GardenStation(scene),
      shrine: new ShrineStation(scene), pool: new PoolStation(scene), hollow: new HollowStation(scene), tree: new TreeStation(scene),
    };
    this.gates = {};
    this.mists = {};
    for (const id in AREAS) { this.gates[id] = new Gate(id, scene); this.mists[id] = new Mist(id, scene); }
    this.wisps = new Wisps(scene);
    this.rings = {};
    for (const id in this.stations) {
      const s = this.stations[id];
      const r = makeRing(s.def.radius);
      r.position.copy(s.center).add(V(0, 0.08, 0));
      // lift ring over terrain bumps slightly
      scene.add(r);
      this.rings[id] = r;
    }
    for (const id in this.gates) {
      const g = this.gates[id];
      const r = makeRing(g.radius);
      r.position.copy(g.center).add(V(0, 0.1, 0));
      scene.add(r);
      this.rings['gate:' + id] = r;
    }
  }

  // Sync visuals to a game state (on load / start)
  syncAll(game, animate = false) {
    const s = game.s;
    for (const id in this.stations) {
      const st = this.stations[id];
      st.setUnlocked(s.unlocked[id], animate);
      st.setLevel(s.levels[id]);
    }
    this.stations.tree.setStage(s.treeStage);
    for (const id in AREAS) {
      this.gates[id].setOpen(s.areas[id], animate);
      if (s.areas[id]) this.mists[id].clear(animate);
    }
    // Wisps
    for (const w of this.wisps.list) this.scene.remove(w.mesh);
    this.wisps.list = [];
    for (const id in s.wisps) for (let i = 0; i < s.wisps[id]; i++) this.wisps.add(this.stations[id].center, this.stations.hollow.center, true);
  }

  colliders(game) {
    const out = [];
    for (const id in this.stations) out.push(...this.stations[id].colliders);
    for (const id in this.gates) out.push(...this.gates[id].activeColliders());
    return out;
  }

  update(dt, t, ctx) {
    for (const id in this.stations) {
      const st = this.stations[id];
      const area = st.def.area;
      st.update(dt, t, { ...ctx, working: ctx.workingAt === id, unlockedArea: !area || ctx.game.s.areas[area] });
      if (ctx.workingAt === id) st.workFx(dt, ctx);
    }
    for (const id in this.gates) this.gates[id].update(dt, t);
    for (const id in this.mists) this.mists[id].update(dt, this.world);
    this.wisps.update(dt, t, this.particles);
    // Rings: show for the nearby target
    for (const key in this.rings) {
      const r = this.rings[key];
      const want = key === ctx.nearKey ? (ctx.workingAt ? 0.35 + Math.sin(t * 3) * 0.1 : 0.5) : 0;
      r.material.opacity = damp(r.material.opacity, want, 6, dt);
      r.visible = r.material.opacity > 0.01;
    }
  }
}
