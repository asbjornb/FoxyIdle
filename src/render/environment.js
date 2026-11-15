import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function softTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildEnvironment(scene, N) {
  const updaters = [];
  const C = N / 2;
  const rand = rng(1337);

  // ---------- sky dome ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform float uTime;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.05, 0.03, 0.16);
        vec3 mid = vec3(0.28, 0.12, 0.42);
        vec3 hor = vec3(0.95, 0.48, 0.55);
        vec3 col = mix(hor, mid, smoothstep(-0.15, 0.25, y));
        col = mix(col, top, smoothstep(0.25, 0.85, y));
        col = mix(col, vec3(0.12, 0.08, 0.25), smoothstep(-0.1, -0.6, y));
        // stars
        vec3 q = floor(vDir * 220.0);
        float s = h(q);
        float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 60.0);
        col += vec3(1.0, 0.95, 1.0) * step(0.997, s) * smoothstep(0.05, 0.4, y) * tw;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.position.set(C, 0, C);
  scene.add(sky);
  updaters.push((t, cam) => { skyMat.uniforms.uTime.value = t; sky.position.set(cam.position.x, 0, cam.position.z); });

  // ---------- floating island body ----------
  const M = 14;
  const S = N + M * 2;
  const rock = new THREE.MeshStandardMaterial({ color: '#4a3560', roughness: 0.95, flatShading: true });
  const rockDark = new THREE.MeshStandardMaterial({ color: '#2a1f40', roughness: 1, flatShading: true });
  const lip = new THREE.MeshStandardMaterial({ color: '#2f6a5c', roughness: 0.9, flatShading: true });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(S, 6, S, 24, 2, 24), rock);
  {
    const pa = slab.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      if (y < 0) { pa.setX(i, pa.getX(i) * (0.97 + rand() * 0.03)); pa.setZ(i, pa.getZ(i) * (0.97 + rand() * 0.03)); pa.setY(i, y - rand() * 2); }
    }
    slab.geometry.computeVertexNormals();
  }
  slab.position.set(C, -3.02, C);
  scene.add(slab);
  const lipMesh = new THREE.Mesh(new THREE.BoxGeometry(S + 0.6, 0.8, S + 0.6), lip);
  lipMesh.position.set(C, -0.42, C);
  scene.add(lipMesh);
  const under = new THREE.Mesh(new THREE.ConeGeometry(S * 0.72, 60, 8, 6), rockDark);
  {
    const pa = under.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      if (y < 29) { pa.setX(i, pa.getX(i) + (rand() - 0.5) * 8); pa.setZ(i, pa.getZ(i) + (rand() - 0.5) * 8); }
    }
    under.geometry.computeVertexNormals();
  }
  under.rotation.x = Math.PI; under.rotation.y = Math.PI / 8;
  under.position.set(C, -36, C);
  scene.add(under);

  // ---------- crystal border ----------
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  crystalGeo.scale(0.45, 1.5, 0.45);
  const crystalMats = [
    new THREE.MeshStandardMaterial({ color: '#ff7ad9', emissive: '#ff3fbf', emissiveIntensity: 1.4, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: '#7af0ff', emissive: '#3fd4ff', emissiveIntensity: 1.4, roughness: 0.2 }),
  ];
  const borderPts = [];
  const step = 5;
  for (let i = 0; i <= N; i += step) {
    borderPts.push([i, -1.4], [i, N + 1.4], [-1.4, i], [N + 1.4, i]);
  }
  for (let m = 0; m < 2; m++) {
    const pts = borderPts.filter((_, i) => i % 2 === m);
    const inst = new THREE.InstancedMesh(crystalGeo, crystalMats[m], pts.length);
    const d = new THREE.Object3D();
    pts.forEach(([x, z], i) => {
      d.position.set(x, 0.9, z);
      d.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      const s = 0.7 + rand() * 0.6; d.scale.set(s, s, s);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    });
    inst.castShadow = true;
    scene.add(inst);
    updaters.push((t) => { crystalMats[m].emissiveIntensity = 1.1 + 0.5 * Math.sin(t * 2 + m * Math.PI); });
  }

  // ---------- decor on the outer rim: mushrooms, trees, lanterns ----------
  const decor = new THREE.Group();
  scene.add(decor);
  const capMats = ['#ff5fa2', '#ffb04f', '#9a6bff', '#4fd8ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.15 }));
  const stemMat = new THREE.MeshStandardMaterial({ color: '#f5e6d8', roughness: 0.7 });
  const dotMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4 });
  const leafMats = ['#3fd6a0', '#ff8ad0', '#7fd0ff', '#c8a2ff'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true }));
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b3a4f', roughness: 0.9, flatShading: true });
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 2.2 });

  function mushroom(x, z, s) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8), stemMat); stem.position.y = 0.8; g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMats[Math.floor(rand() * 4)]);
    cap.scale.set(1.1, 0.75, 1.1); cap.position.y = 1.5; g.add(cap);
    for (let k = 0; k < 5; k++) {
      const a = rand() * Math.PI * 2; const r = 0.4 + rand() * 0.4;
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), dotMat);
      d.position.set(Math.cos(a) * r, 1.5 + Math.sqrt(Math.max(0, 1 - r * r)) * 0.72, Math.sin(a) * r); g.add(d);
    }
    g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = rand() * 6;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    decor.add(g);
  }
  function tree(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2, 6), trunkMat); trunk.position.y = 1; g.add(trunk);
    const lm = leafMats[Math.floor(rand() * 4)];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4 - k * 0.35, 1.6, 7), lm);
      c.position.y = 2 + k * 0.9; g.add(c);
    }
    g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = rand() * 6;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    decor.add(g);
  }
  function lantern(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), trunkMat); pole.position.y = 1.2; g.add(pole);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lanternMat); l.position.y = 2.5; g.add(l);
    g.position.set(x, 0, z);
    decor.add(g);
  }
  const ring = (inset, count, fn) => {
    for (let k = 0; k < count; k++) {
      const side = Math.floor(rand() * 4); const t = rand() * (N + 2 * inset) - inset;
      const off = 3 + rand() * (M - 5);
      let x; let z;
      if (side === 0) { x = t; z = -off; } else if (side === 1) { x = t; z = N + off; } else if (side === 2) { x = -off; z = t; } else { x = N + off; z = t; }
      fn(x, z);
    }
  };
  ring(M - 2, 70, (x, z) => (rand() < 0.5 ? mushroom(x, z, 0.8 + rand() * 1.2) : tree(x, z, 0.8 + rand() * 0.9)));
  ring(0, 26, (x, z) => lantern(x, z));

  // ---------- fireflies / magic motes ----------
  const FF = 900;
  const ffPos = new Float32Array(FF * 3); const ffSeed = new Float32Array(FF);
  for (let i = 0; i < FF; i++) {
    ffPos[i * 3] = -M + rand() * (N + 2 * M);
    ffPos[i * 3 + 1] = 0.6 + rand() * 6;
    ffPos[i * 3 + 2] = -M + rand() * (N + 2 * M);
    ffSeed[i] = rand() * 100;
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 1));
  const ffMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.4 + aSeed) * 1.5;
        p.z += cos(uTime * 0.33 + aSeed * 1.3) * 1.5;
        p.y += sin(uTime * 0.8 + aSeed * 2.0) * 0.6;
        vA = 0.5 + 0.5 * sin(uTime * 2.5 + aSeed * 7.0);
        vS = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.35 + 0.25 * vA) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vS;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = 1.0 - smoothstep(0.0, 0.5, d);
        vec3 c = mix(vec3(1.0, 0.85, 0.45), vec3(0.6, 0.95, 1.0), step(0.5, fract(vS)));
        gl_FragColor = vec4(c * 1.5, a * a * vA * 0.9);
      }`,
  });
  const ff = new THREE.Points(ffGeo, ffMat);
  ff.frustumCulled = false;
  scene.add(ff);
  updaters.push((t, cam, h) => { ffMat.uniforms.uTime.value = t; ffMat.uniforms.uScale.value = h * 0.5; });

  // ---------- clouds drifting below the island ----------
  const cloudTex = softTexture('rgba(255,220,255,0.85)', 'rgba(255,200,255,0)');
  const clouds = [];
  for (let k = 0; k < 70; k++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, color: new THREE.Color().setHSL(0.8 + rand() * 0.15, 0.6, 0.75), transparent: true, opacity: 0.35 + rand() * 0.3, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    const a = rand() * Math.PI * 2; const r = S * 0.55 + rand() * 120;
    sp.position.set(C + Math.cos(a) * r, -10 - rand() * 40, C + Math.sin(a) * r);
    const s = 30 + rand() * 50; sp.scale.set(s, s * 0.5, 1);
    sp.userData.speed = 0.5 + rand();
    scene.add(sp); clouds.push(sp);
  }
  updaters.push((t, cam, h, dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > C + S * 0.5 + 200) c.position.x = C - S * 0.5 - 200;
    }
  });

  // ---------- distant floating islets ----------
  for (let k = 0; k < 10; k++) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 1.5, 8), lip); g.add(top);
    const bot = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 8), rock); bot.rotation.x = Math.PI; bot.position.y = -6.7; g.add(bot);
    for (let j = 0; j < 3; j++) {
      const tr = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.2, 6), leafMats[Math.floor(rand() * 4)]);
      tr.position.set((rand() - 0.5) * 6, 2.3, (rand() - 0.5) * 6); g.add(tr);
    }
    const a = (k / 10) * Math.PI * 2 + rand() * 0.4; const r = S * 0.75 + rand() * 50;
    g.position.set(C + Math.cos(a) * r, -6 - rand() * 18, C + Math.sin(a) * r);
    const base = g.position.y; const ph = rand() * 6;
    scene.add(g);
    updaters.push((t) => { g.position.y = base + Math.sin(t * 0.5 + ph) * 1.2; g.rotation.y = t * 0.03 + ph; });
  }

  return {
    update(t, cam, viewportH, dt) { for (const u of updaters) u(t, cam, viewportH, dt); },
  };
}
