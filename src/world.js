import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, fbm, rng, smoothstep, pathDist, windUniforms, addWind, lerp, glowTexture } from './util.js';
import { STATIONS, AREAS } from './config.js';

// ---------- Day / night palette ----------
// Each key: sky top, horizon, sun color, sun intensity, hemi sky, hemi ground, fog
const KEYS = [
  { t: 0.0, top: '#4e7fc4', hor: '#f5d6a8', sun: '#fff1d6', si: 2.6, hs: '#bcd6ff', hg: '#6b5a3a', hi: 0.9, fog: '#d9d2bc', star: 0 },   // late morning
  { t: 0.35, top: '#5f86c8', hor: '#ffd29a', sun: '#ffe2b0', si: 2.4, hs: '#cfd9ff', hg: '#7a5d3a', hi: 0.85, fog: '#e6cfa6', star: 0 }, // afternoon
  { t: 0.55, top: '#5a5aa0', hor: '#ff9e6b', sun: '#ffb27a', si: 1.9, hs: '#d6b9e8', hg: '#6e4a36', hi: 0.8, fog: '#e7a98a', star: 0.05 }, // golden dusk
  { t: 0.68, top: '#1d2552', hor: '#7d5b8c', sun: '#a7b8ff', si: 0.9, hs: '#7a8cd0', hg: '#3a3650', hi: 0.9, fog: '#4a4a74', star: 0.7 }, // blue hour
  { t: 0.82, top: '#152048', hor: '#43558a', sun: '#a9c0ff', si: 0.95, hs: '#7d92d4', hg: '#3a4060', hi: 1.0, fog: '#34406a', star: 1 }, // moonlit night
  { t: 0.93, top: '#3b5a9a', hor: '#f0b9a0', sun: '#ffd0b0', si: 1.6, hs: '#b8c4f0', hg: '#5a4a3a', hi: 0.85, fog: '#c9b0a8', star: 0.2 }, // dawn
  { t: 1.0, top: '#4e7fc4', hor: '#f5d6a8', sun: '#fff1d6', si: 2.6, hs: '#bcd6ff', hg: '#6b5a3a', hi: 0.9, fog: '#d9d2bc', star: 0 },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), sun: new THREE.Color(k.sun),
  hs: new THREE.Color(k.hs), hg: new THREE.Color(k.hg), fog: new THREE.Color(k.fog) }));

export const DAY_LENGTH = 360; // seconds per full cycle

function samplePalette(t) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = smoothstep(0, 1, (t - a.t) / (b.t - a.t));
  return {
    top: a.top.clone().lerp(b.top, f), hor: a.hor.clone().lerp(b.hor, f), sun: a.sun.clone().lerp(b.sun, f),
    si: lerp(a.si, b.si, f), hs: a.hs.clone().lerp(b.hs, f), hg: a.hg.clone().lerp(b.hg, f), hi: lerp(a.hi, b.hi, f),
    fog: a.fog.clone().lerp(b.fog, f), star: lerp(a.star, b.star, f),
  };
}

function inStationFootprint(x, z, pad = 0) {
  for (const id in STATIONS) {
    const s = STATIONS[id];
    if (Math.hypot(x - s.pos[0], z - s.pos[1]) < s.radius * 0.8 + pad) return true;
  }
  for (const id in AREAS) {
    const g = AREAS[id].gate;
    if (Math.hypot(x - g[0], z - g[1]) < 2.4 + pad) return true;
  }
  return false;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.vitality = 0; // displayed (smoothed) vitality 0..1
    this.gloom = 0;
    this.dayTime = 0.08;
    this.flowerEntries = [];
    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildGrass();
    this.buildTrees();
    this.buildRocks();
    this.buildFlowers();
    this.buildMountains();
    this.buildFireflies();
    this.buildMotes();
    this.buildLeaves();
  }

  // ---------- lights ----------
  buildLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5a3a, 0.9);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xd9d2bc, 0.012);
  }

  // ---------- sky ----------
  buildSky() {
    const geo = new THREE.SphereGeometry(450, 48, 24);
    this.skyUniforms = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uStars: { value: 0 }, uTime: windUniforms.uTime, uGloom: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uSunCol, uSunDir, uMoonDir; uniform float uStars, uTime, uGloom;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.75, h), 0.7));
          col = mix(col, uHor*0.85, smoothstep(0.0,-0.2,d.y));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(sd, 900.0)*6.0 + pow(sd, 18.0)*0.35 + pow(sd,3.0)*0.12) * step(-0.05, uSunDir.y);
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.85,0.9,1.0) * (smoothstep(0.9993,0.9996,md)*1.6 + pow(md, 60.0)*0.12) * uStars;
          // stars
          vec3 sp = floor(d*260.0);
          float st = hash(sp);
          float tw = 0.6+0.4*sin(uTime*2.0 + st*40.0);
          col += vec3(step(0.9975, st) * tw * uStars * smoothstep(0.05,0.3,d.y));
          // soft clouds bands
          float c = sin(d.x*6.0+uTime*0.01)*sin(d.z*5.0-uTime*0.012)*0.5+0.5;
          col = mix(col, col*1.08+vec3(0.03), c*smoothstep(0.05,0.4,d.y)*0.25*(1.0-uStars));
          float g = dot(col, vec3(0.299,0.587,0.114));
          col = mix(col, vec3(g)*vec3(0.75,0.72,0.85), uGloom*0.7);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // ---------- terrain ----------
  buildTerrain() {
    const size = 170, seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const lush = new Float32Array(pos.count * 3);
    const dry = new Float32Array(pos.count * 3);
    const cA = new THREE.Color('#5f9a3c'), cB = new THREE.Color('#86b54a'), cC = new THREE.Color('#3f7a35');
    const cPath = new THREE.Color('#b99a6b'), cForest = new THREE.Color('#40592c'), cMoss = new THREE.Color('#6a8f3e');
    const dA = new THREE.Color('#7b7d5c'), dB = new THREE.Color('#948f6a'), dPath = new THREE.Color('#9a8a70'), dForest = new THREE.Color('#5d5a46');
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const r = Math.hypot(x, z);
      const n = fbm(x * 0.08, z * 0.08, 3) * 0.5 + 0.5;
      const n2 = fbm(x * 0.25 + 40, z * 0.25, 2) * 0.5 + 0.5;
      tmp.copy(cA).lerp(cB, smoothstep(0.35, 0.75, n)).lerp(cC, smoothstep(0.6, 0.9, n2) * 0.5);
      tmp2.copy(dA).lerp(dB, n);
      const forest = smoothstep(32, 42, r);
      tmp.lerp(cForest, forest); tmp2.lerp(dForest, forest);
      // shrine hill moss
      const de = Math.hypot(x - 27, z + 3);
      tmp.lerp(cMoss, (1 - smoothstep(3, 9, de)) * 0.5);
      const pd = pathDist(x, z);
      const pw = (1 - smoothstep(0.5, 1.5 + n2 * 0.6, pd)) * (1 - forest);
      tmp.lerp(cPath, pw * 0.9); tmp2.lerp(dPath, pw * 0.9);
      lush.set([tmp.r, tmp.g, tmp.b], i * 3);
      dry.set([tmp2.r, tmp2.g, tmp2.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(lush, 3));
    geo.setAttribute('aDry', new THREE.BufferAttribute(dry, 3));
    geo.computeVertexNormals();
    this.terrainUniforms = { uVital: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uVital = this.terrainUniforms.uVital;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aDry;\nuniform float uVital;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(aDry, vColor.rgb, uVital);');
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  // ---------- grass ----------
  buildGrass() {
    // Blade: tapered strip with 4 segments
    const segs = 4;
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.045 * (1 - t * 0.9);
      const bend = t * t * 0.12;
      verts.push(-w, t, bend, w, t, bend);
      uvs.push(0, t, 1, t);
      if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('aH', new THREE.Float32BufferAttribute(uvs.filter((_, i) => i % 2 === 1), 1));
    blade.setIndex(idx);
    blade.computeVertexNormals();

    const R = rng(7);
    const count = 60000;
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
    this.grassUniforms = { uVital: this.terrainUniforms.uVital };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWind = windUniforms.uWind;
      shader.uniforms.uVital = this.grassUniforms.uVital;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind; attribute float aH; varying float vH; varying vec3 vIC;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = aH;
          vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float ph = ip.x*0.3 + ip.z*0.2;
          float gust = sin(uTime*0.6 + ip.x*0.05 + ip.z*0.04)*0.5+0.5;
          float sway = (sin(uTime*1.8+ph)*0.5 + sin(uTime*3.1+ph*1.3)*0.2 + gust*0.8) * uWind;
          transformed.x += sway * 0.18 * aH*aH;
          transformed.z += cos(uTime*1.4+ph)*0.06*aH*aH*uWind;
          #ifdef USE_INSTANCING_COLOR
            vIC = instanceColor;
          #else
            vIC = vec3(1.0);
          #endif
        `)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nobjectNormal = vec3(0.0,1.0,0.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uVital; varying float vH; varying vec3 vIC;`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = normalize(vNormal);`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 lushBase = vec3(0.13,0.34,0.09), lushTip = vec3(0.58,0.84,0.30);
          vec3 dryBase = vec3(0.27,0.29,0.19), dryTip = vec3(0.64,0.63,0.44);
          vec3 gc = mix(mix(dryBase, lushBase, uVital), mix(dryTip, lushTip, uVital), vH);
          diffuseColor.rgb = gc * vIC;
        `);
    };
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    let tries = 0;
    while (n < count && tries < count * 4) {
      tries++;
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 40;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const pd = pathDist(x, z);
      if (pd < 0.9 && R() > 0.15) continue;
      if (inStationFootprint(x, z, -0.6) && R() > 0.3) continue;
      if (Math.hypot(x + 28, z + 4) < 4.3) continue; // pool water
      const clump = fbm(x * 0.15, z * 0.15, 2) * 0.5 + 0.5;
      if (R() > 0.35 + clump * 0.9) continue;
      const y = heightAt(x, z);
      p.set(x, y - 0.02, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * Math.PI * 2);
      const hh = (0.26 + R() * 0.34) * (0.7 + clump * 0.6) * (pd < 1.4 ? 0.6 : 1);
      s.set(0.8 + R() * 0.6, hh, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      const v = 0.8 + R() * 0.35;
      col.setRGB(v, v * (0.95 + R() * 0.1), v * (0.85 + R() * 0.2));
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.grass = mesh;
  }

  // ---------- trees ----------
  makeRoundTree() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.2, 6, 1);
    trunk.translate(0, 1.1, 0);
    paint(trunk, '#6b4a33');
    parts.push(trunk);
    const blobs = [[0, 2.6, 0, 1.25], [0.6, 2.25, 0.3, 0.85], [-0.55, 2.3, -0.25, 0.9], [0.1, 3.3, -0.1, 0.85]];
    blobs.forEach(([x, y, z, r], i) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      jitter(g, 0.12, i + 3);
      g.translate(x, y, z);
      paintGradient(g, '#3f7d3a', '#8cc256', y - r, y + r);
      parts.push(g);
    });
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  }

  makePine() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.4, 5, 1);
    trunk.translate(0, 0.7, 0);
    paint(trunk, '#5a3d2b');
    parts.push(trunk);
    [[1.3, 1.6, 1.0], [1.05, 1.4, 1.9], [0.75, 1.2, 2.7], [0.45, 0.9, 3.35]].forEach(([r, h, y], i) => {
      const g = new THREE.ConeGeometry(r, h, 7, 1);
      jitter(g, 0.06, 20 + i);
      g.translate(0, y + h * 0.3, 0);
      paintGradient(g, '#24563a', '#5f9a5a', y - h * 0.2, y + h);
      parts.push(g);
    });
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  }

  makeBirch() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.15, 2.8, 6, 1);
    trunk.translate(0, 1.4, 0);
    paint(trunk, '#e8e2d4');
    parts.push(trunk);
    [[0, 3.1, 0, 0.9], [0.35, 2.6, 0.2, 0.7], [-0.3, 2.7, -0.2, 0.7]].forEach(([x, y, z, r], i) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      jitter(g, 0.1, 40 + i);
      g.translate(x, y, z);
      paintGradient(g, '#7aa83e', '#d8d36a', y - r, y + r);
      parts.push(g);
    });
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  }

  buildTrees() {
    const R = rng(21);
    const types = [
      { geo: this.makeRoundTree(), list: [] },
      { geo: this.makePine(), list: [] },
      { geo: this.makeBirch(), list: [] },
    ];
    const blocked = (x, z) => pathDist(x, z) < 2.2 || inStationFootprint(x, z, 2.5) || Math.hypot(x, z + 4) < 8;
    // Forest wall ring
    for (let i = 0; i < 520; i++) {
      const a = R() * Math.PI * 2;
      const r = 36 + Math.pow(R(), 0.7) * 34;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (blocked(x, z)) continue;
      const t = R() < 0.45 ? 1 : R() < 0.75 ? 0 : 2;
      types[t].list.push([x, z, 0.9 + R() * 0.9 + (r - 36) * 0.02, R()]);
    }
    // Scattered inside glade
    for (let i = 0; i < 140; i++) {
      const a = R() * Math.PI * 2;
      const r = 12 + R() * 24;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (blocked(x, z)) continue;
      if (fbm(x * 0.06, z * 0.06, 2) < -0.05) continue;
      const t = R() < 0.3 ? 1 : R() < 0.6 ? 0 : 2;
      types[t].list.push([x, z, 0.75 + R() * 0.55, R()]);
    }
    this.treeColliders = [];
    this.treeMats = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    types.forEach((t, ti) => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
      addWind(mat, { strength: 0.035, heightScale: 0.6, base: 1.4, fadeNear: true });
      this.treeMats.push(mat);
      const mesh = new THREE.InstancedMesh(t.geo, mat, t.list.length);
      t.list.forEach(([x, z, sc, rr], i) => {
        p.set(x, heightAt(x, z) - 0.1, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rr * Math.PI * 2);
        s.set(sc, sc * (0.9 + rr * 0.3), sc);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        c.setHSL(0, 0, 0.85 + rr * 0.3);
        mesh.setColorAt(i, c);
        if (Math.hypot(x, z) < 40) this.treeColliders.push([x, z, 0.45 * sc]);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  buildRocks() {
    const R = rng(33);
    const geo = new THREE.DodecahedronGeometry(0.6, 0);
    jitter(geo, 0.18, 5);
    const mat = new THREE.MeshStandardMaterial({ color: '#8c8a80', flatShading: true, roughness: 1 });
    const list = [];
    for (let i = 0; i < 90; i++) {
      const a = R() * Math.PI * 2, r = 8 + R() * 36;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDist(x, z) < 1.6 || inStationFootprint(x, z, 1.2) || Math.hypot(x, z + 4) < 6.5) continue;
      list.push([x, z, 0.3 + R() * (r > 34 ? 2.2 : 0.8), R()]);
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach(([x, z, sc, rr], i) => {
      p.set(x, heightAt(x, z) + sc * 0.15, z);
      q.setFromEuler(new THREE.Euler(rr * 2, rr * 7, rr * 3));
      s.set(sc * (1 + rr * 0.5), sc * 0.7, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      c.setHSL(0.1 + rr * 0.05, 0.08, 0.5 + rr * 0.2);
      mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // ---------- flowers that bloom as vitality grows ----------
  buildFlowers() {
    const R = rng(55);
    const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.32, 3, 1);
    stem.translate(0, 0.16, 0);
    paint(stem, '#4f8a35');
    const petals = [];
    for (let i = 0; i < 5; i++) {
      const pg = new THREE.SphereGeometry(0.055, 5, 3);
      pg.scale(1, 0.35, 0.6);
      const a = (i / 5) * Math.PI * 2;
      pg.translate(Math.cos(a) * 0.06, 0.33, Math.sin(a) * 0.06);
      paint(pg, '#ffffff');
      petals.push(pg);
    }
    const center = new THREE.SphereGeometry(0.035, 5, 4);
    center.translate(0, 0.345, 0);
    paint(center, '#ffd34d');
    const geo = mergeGeometries([stem, ...petals, center].map((g) => (g.index ? g.toNonIndexed() : g)));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    addWind(mat, { strength: 0.25, heightScale: 3 });
    const count = 2600;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const palette = ['#ff8fb1', '#ffffff', '#ffd166', '#c39bff', '#7fc8ff', '#ff6f61', '#fff1a8'].map((h) => new THREE.Color(h));
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let n = 0;
    while (n < count) {
      // Flowers cluster in patches; bias toward the meadow near the centre.
      const a = R() * Math.PI * 2, r = Math.pow(R(), 0.8) * 36;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (pathDist(x, z) < 1.2 || inStationFootprint(x, z, -0.5) || Math.hypot(x + 28, z + 4) < 4.8) continue;
      const patch = fbm(x * 0.12 + 7, z * 0.12, 2);
      if (patch < 0.05 && R() > 0.15) continue;
      const pi = Math.floor((fbm(x * 0.05, z * 0.05 + 3, 1) * 0.5 + 0.5) * palette.length * 1.3 + R() * 2) % palette.length;
      this.flowerEntries.push({ x, z, y: heightAt(x, z), s: 0.6 + R() * 0.5, rot: R() * 6.28, grow: 0, color: palette[pi],
        order: r / 36 + R() * 0.6 });
      n++;
    }
    // Bloom order: near the centre first, spreading outward.
    this.flowerEntries.sort((a, b) => a.order - b.order);
    this.flowerEntries.forEach((f, i) => {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, f.color);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.flowers = mesh;
    this.flowersShown = 0;
    this._fm = new THREE.Matrix4();
  }

  updateFlowers(dt) {
    const target = Math.floor(this.flowerEntries.length * Math.min(1, 0.03 + this.vitality * 1.0));
    let dirty = false;
    const m = this._fm, q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.flowerEntries.length; i++) {
      const f = this.flowerEntries[i];
      const want = i < target ? 1 : 0;
      if (f.grow === want) continue;
      f.grow = want > f.grow ? Math.min(1, f.grow + dt * (0.6 + (i % 7) * 0.1)) : Math.max(0, f.grow - dt);
      const e = f.grow < 1 ? 1 - Math.pow(1 - f.grow, 3) * Math.cos(f.grow * 3) : 1;
      p.set(f.x, f.y, f.z);
      q.setFromAxisAngle(up, f.rot);
      const sc = f.s * Math.max(0.0001, e);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      this.flowers.setMatrixAt(i, m);
      dirty = true;
    }
    if (dirty) this.flowers.instanceMatrix.needsUpdate = true;
  }

  buildMountains() {
    const R = rng(77);
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#5b6f78', flatShading: true, roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.2;
      const r = 120 + R() * 40;
      const h = 30 + R() * 40;
      const g = new THREE.ConeGeometry(18 + R() * 20, h, 6, 3);
      jitter(g, 2.5, 100 + i);
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
      mesh.rotation.y = R() * 6;
      group.add(mesh);
    }
    this.scene.add(group);
    this.mountains = group;
    this.mountainMat = mat;
  }

  // ---------- ambient particles ----------
  buildFireflies() {
    const N = 260;
    const R = rng(91);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 36;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.set([x, heightAt(x, z) + 0.4 + R() * 2.2, z], i * 3);
      seed[i] = R() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.fireflyUniforms = { uTime: windUniforms.uTime, uNight: { value: 0 }, uTex: { value: glowTexture() }, uScale: { value: 300 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.fireflyUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uNight, uScale; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position;
          p.x += sin(uTime*0.4+aSeed)*1.2; p.z += cos(uTime*0.33+aSeed*1.3)*1.2; p.y += sin(uTime*0.8+aSeed*2.0)*0.4;
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          float blink = smoothstep(0.2, 1.0, sin(uTime*1.7+aSeed*5.0)*0.5+0.5);
          vA = blink * (0.12 + uNight*0.88);
          gl_PointSize = uScale * 0.09 * (0.6+blink*0.6) / -mv.z; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.85,0.4)*2.2, t.a*vA); }`,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  buildMotes() {
    const N = 400;
    const R = rng(92);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(R() - 0.5) * 50, R() * 6, (R() - 0.5) * 50], i * 3);
      seed[i] = R() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.moteUniforms = { uTime: windUniforms.uTime, uCenter: { value: new THREE.Vector3() }, uTex: { value: glowTexture() }, uScale: { value: 300 }, uDay: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.moteUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uScale, uDay; uniform vec3 uCenter; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position;
          p.x += uTime*0.25 + sin(uTime*0.3+aSeed)*0.8; p.z += sin(uTime*0.2+aSeed*2.0)*0.8; p.y += sin(uTime*0.5+aSeed)*0.5;
          p.xz = mod(p.xz - uCenter.xz + 25.0, 50.0) - 25.0 + uCenter.xz; p.y += uCenter.y;
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          vA = 0.35 * uDay * smoothstep(40.0, 10.0, -mv.z);
          gl_PointSize = uScale * 0.035 / -mv.z; }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.95,0.8), t.a*vA); }`,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  buildLeaves() {
    const N = 90;
    const geo = new THREE.PlaneGeometry(0.14, 0.09);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.8 });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const R = rng(93);
    this.leafData = [];
    const cols = ['#e8a33d', '#d9692b', '#a7c14a', '#f2c45a', '#ff9fb8'].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      this.leafData.push({ x: (R() - 0.5) * 40, y: R() * 8, z: (R() - 0.5) * 40, s: R() * 10, sp: 0.4 + R() * 0.5 });
      mesh.setColorAt(i, cols[i % cols.length]);
    }
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.leaves = mesh;
    this._lm = new THREE.Matrix4();
    this._le = new THREE.Euler();
    this._lq = new THREE.Quaternion();
  }

  updateLeaves(dt, t, center) {
    const m = this._lm, e = this._le, q = this._lq, p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.leafData.length; i++) {
      const L = this.leafData[i];
      L.y -= dt * L.sp;
      L.x += dt * (0.5 + Math.sin(t + L.s) * 0.4);
      L.z += dt * Math.cos(t * 0.7 + L.s) * 0.3;
      let lx = L.x - center.x, lz = L.z - center.z;
      if (L.y < -0.5 || Math.abs(lx) > 22 || Math.abs(lz) > 22) {
        L.y = 6 + Math.random() * 4;
        L.x = center.x + (Math.random() - 0.5) * 40;
        L.z = center.z + (Math.random() - 0.5) * 40;
        lx = L.x - center.x; lz = L.z - center.z;
      }
      const ground = heightAt(L.x, L.z);
      const y = Math.max(ground + 0.05, ground + L.y);
      p.set(L.x, y, L.z);
      e.set(t * 2 + L.s, t * 1.3 + L.s, t * 1.7);
      q.setFromEuler(e);
      m.compose(p, q, s);
      this.leaves.setMatrixAt(i, m);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  get isNight() { return this.nightFactor > 0.5; }

  // ---------- per frame ----------
  update(dt, t, state, focus, camera) {
    windUniforms.uTime.value = t;
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    const pal = samplePalette(this.dayTime);

    // Vitality/gloom smoothing
    const vTarget = Math.min(1, 0.12 + Math.sqrt(state.vitality / 100) * 0.88);
    this.vitality = lerp(this.vitality, vTarget, 1 - Math.exp(-dt * 0.8));
    const gTarget = state.status === 'lost' ? 1 : smoothstep(45, 0, state.harmony);
    this.gloom = lerp(this.gloom, gTarget, 1 - Math.exp(-dt * 1.2));
    this.terrainUniforms.uVital.value = this.vitality;
    for (const m of this.treeMats) m.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.75, 0.68, 0.55), (1 - this.vitality) * 0.6);

    // Sun path: angle from time of day
    const ang = this.dayTime * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang + 0.6) * 0.8, 0.35 + 0.55 * Math.cos(ang * 1.0 - 0.3) * 0.5 + 0.15, Math.sin(ang + 0.6) * 0.6).normalize();
    this.nightFactor = pal.star;
    const lightDir = sunDir.clone();
    if (pal.star > 0.5) lightDir.set(-sunDir.x, Math.max(0.5, sunDir.y + 0.4), -sunDir.z).normalize(); // moon lights the scene
    lightDir.y = Math.max(lightDir.y, 0.32);
    lightDir.normalize();
    this.sun.position.copy(focus).addScaledVector(lightDir, 60);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(pal.sun);
    const gloomDim = 1 - this.gloom * 0.45;
    this.sun.intensity = pal.si * gloomDim;
    this.hemi.color.copy(pal.hs);
    this.hemi.groundColor.copy(pal.hg);
    this.hemi.intensity = pal.hi * (1 - this.gloom * 0.3);

    const gloomCol = new THREE.Color('#5d5868');
    const fogCol = pal.fog.clone().lerp(gloomCol, this.gloom * 0.7);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = 0.0085 + this.gloom * 0.018;
    this.skyUniforms.uTop.value.copy(pal.top);
    this.skyUniforms.uHor.value.copy(pal.hor.clone().lerp(fogCol, 0.35));
    this.skyUniforms.uSunCol.value.copy(pal.sun);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uMoonDir.value.set(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.35, -sunDir.z).normalize();
    this.skyUniforms.uStars.value = pal.star;
    this.skyUniforms.uGloom.value = this.gloom;
    this.mountainMat.color.copy(fogCol).lerp(new THREE.Color('#41525e'), 0.45);
    this.sky.position.copy(camera.position);

    this.fireflyUniforms.uNight.value = Math.max(pal.star, this.vitality * 0.25);
    const h = this.renderer.domElement.height;
    this.fireflyUniforms.uScale.value = h;
    this.moteUniforms.uScale.value = h;
    this.moteUniforms.uCenter.value.copy(focus);
    this.moteUniforms.uDay.value = 1 - pal.star * 0.7;
    windUniforms.uWind.value = 0.8 + Math.sin(t * 0.13) * 0.25;

    this.updateFlowers(dt);
    this.updateLeaves(dt, t, focus);
  }
}

// ---------- geometry helpers ----------
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function paintGradient(geo, lowHex, highHex, y0, y1) {
  const a = new THREE.Color(lowHex), b = new THREE.Color(highHex), c = new THREE.Color();
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, smoothstep(y0, y1, pos.getY(i)));
    arr.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Deterministically displace vertices (welding shared positions so faces stay closed).
export function jitter(geo, amt, seed = 1) {
  const R = rng(seed);
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(R() - 0.5) * amt * 2, (R() - 0.5) * amt * 2, (R() - 0.5) * amt * 2]);
    const d = map.get(key);
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
