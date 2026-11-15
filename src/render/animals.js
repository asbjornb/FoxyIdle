import * as THREE from 'three';

const SPHERE = new THREE.SphereGeometry(1, 18, 14);
const CONE = new THREE.ConeGeometry(1, 1, 14);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const TORUS = new THREE.TorusGeometry(1, 0.28, 8, 20);

const matCache = new Map();
function M(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.0, ...extra }));
  }
  return matCache.get(key);
}

function part(parent, geo, mat, pos, scale = [1, 1, 1], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function eyes(parent, y, z, spread, r = 0.06, white = false) {
  const black = M('#1a1023', { roughness: 0.15 });
  const shine = M('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    if (white) part(parent, SPHERE, M('#ffffff'), [s * spread, y, z - 0.01], [r * 1.7, r * 1.7, r * 0.8]);
    part(parent, SPHERE, black, [s * spread, y, z], [r, r, r * 0.8]);
    part(parent, SPHERE, shine, [s * spread + r * 0.35, y + r * 0.4, z + r * 0.6], [r * 0.32, r * 0.32, r * 0.32]);
  }
}

function legs(parent, color, spreadX, z1, z2, h = 0.3, r = 0.075) {
  const out = [];
  const mat = M(color);
  for (const [x, z, ph] of [[-spreadX, z1, 0], [spreadX, z1, Math.PI], [-spreadX, z2, Math.PI], [spreadX, z2, 0]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, h, z);
    part(pivot, CYL, mat, [0, -h / 2, 0], [r, h, r]);
    part(pivot, SPHERE, mat, [0, -h + 0.03, 0.03], [r * 1.25, r * 0.8, r * 1.5]);
    pivot.userData.phase = ph;
    parent.add(pivot);
    out.push(pivot);
  }
  return out;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.0), Math.max(0, Math.min(1, hsl.l * f)));
  return '#' + c.getHexString();
}

const BUILDERS = {
  fox(g, c) {
    const white = M('#fff6ec'); const dark = M('#3a2030');
    const body = part(g.body, SPHERE, M(c), [0, 0.55, 0], [0.4, 0.36, 0.55]);
    part(g.body, SPHERE, white, [0, 0.5, 0.18], [0.28, 0.27, 0.38]);
    const head = new THREE.Group(); head.position.set(0, 0.95, 0.42); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.36, 0.32, 0.33]);
    for (const s of [-1, 1]) part(head, SPHERE, white, [s * 0.15, -0.1, 0.15], [0.17, 0.13, 0.17]);
    part(head, CONE, white, [0, -0.07, 0.36], [0.13, 0.3, 0.13], [Math.PI / 2, 0, 0]);
    part(head, SPHERE, dark, [0, -0.06, 0.52], [0.05, 0.045, 0.045]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.18, 0.25, -0.02); ear.rotation.z = -s * 0.25; head.add(ear);
      part(ear, CONE, M(c), [0, 0.12, 0], [0.13, 0.32, 0.08]);
      part(ear, CONE, dark, [0, 0.24, 0.005], [0.06, 0.1, 0.05]);
      g.ears.push(ear);
    }
    eyes(head, 0.06, 0.28, 0.13);
    const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.45); g.body.add(tail); g.tail = tail;
    part(tail, SPHERE, M(c), [0, 0.12, -0.25], [0.2, 0.2, 0.36], [0.5, 0, 0]);
    part(tail, SPHERE, M(c), [0, 0.28, -0.5], [0.24, 0.24, 0.3], [0.7, 0, 0]);
    part(tail, SPHERE, white, [0, 0.42, -0.7], [0.17, 0.17, 0.19]);
    g.legs = legs(g.body, '#4a2a2a', 0.2, 0.25, -0.22);
    void body;
  },
  bunny(g, c) {
    const white = M('#fff4fa'); const pink = M('#ff9ccc');
    part(g.body, SPHERE, M(c), [0, 0.5, 0], [0.4, 0.38, 0.45]);
    part(g.body, SPHERE, white, [0, 0.45, 0.16], [0.28, 0.28, 0.3]);
    const head = new THREE.Group(); head.position.set(0, 0.92, 0.32); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.32, 0.3, 0.3]);
    for (const s of [-1, 1]) part(head, SPHERE, white, [s * 0.09, -0.1, 0.22], [0.1, 0.08, 0.08]);
    part(head, SPHERE, pink, [0, -0.04, 0.29], [0.045, 0.035, 0.03]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.12, 0.22, -0.05); ear.rotation.set(-0.2, 0, -s * 0.15); head.add(ear);
      part(ear, SPHERE, M(c), [0, 0.3, 0], [0.09, 0.32, 0.06]);
      part(ear, SPHERE, pink, [0, 0.3, 0.03], [0.05, 0.25, 0.04]);
      g.ears.push(ear);
    }
    eyes(head, 0.05, 0.25, 0.13, 0.065);
    for (const s of [-1, 1]) part(head, SPHERE, M('#ff6fa8', { transparent: true, opacity: 0.6 }), [s * 0.2, -0.06, 0.18], [0.06, 0.035, 0.03]);
    const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.42); g.body.add(tail); g.tail = tail;
    part(tail, SPHERE, white, [0, 0, 0], [0.15, 0.15, 0.15]);
    g.legs = legs(g.body, shade(c, 0.6), 0.2, 0.2, -0.18, 0.26, 0.085);
  },
  cat(g, c) {
    const light = M(shade(c, 1.35)); const dark = M('#2a1838');
    part(g.body, SPHERE, M(c), [0, 0.52, 0], [0.34, 0.32, 0.52]);
    part(g.body, SPHERE, light, [0, 0.46, 0.14], [0.24, 0.24, 0.34]);
    const head = new THREE.Group(); head.position.set(0, 0.92, 0.42); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.33, 0.29, 0.29]);
    part(head, SPHERE, light, [0, -0.09, 0.2], [0.15, 0.1, 0.1]);
    part(head, SPHERE, M('#ff8fc8'), [0, -0.04, 0.29], [0.04, 0.03, 0.03]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.17, 0.2, 0); ear.rotation.z = -s * 0.35; head.add(ear);
      part(ear, CONE, M(c), [0, 0.1, 0], [0.12, 0.24, 0.07], [0, Math.PI / 4, 0]);
      part(ear, CONE, M('#ff9fd0'), [0, 0.09, 0.02], [0.06, 0.15, 0.04], [0, Math.PI / 4, 0]);
      g.ears.push(ear);
    }
    eyes(head, 0.05, 0.25, 0.12, 0.07);
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      part(head, CYL, dark, [s * 0.22, -0.08 + k * 0.025, 0.2], [0.006, 0.2, 0.006], [0, 0, Math.PI / 2 + k * 0.15 * s]);
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.55, -0.48); g.body.add(tail); g.tail = tail;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      part(tail, SPHERE, i === 6 ? light : M(c), [0, t * 0.55 + Math.sin(t * 3) * 0.05, -0.1 - Math.sin(t * 1.4) * 0.3], [0.07, 0.07, 0.07]);
    }
    g.legs = legs(g.body, shade(c, 0.7), 0.17, 0.26, -0.24, 0.3, 0.065);
  },
  frog(g, c) {
    const belly = M('#f6ffc8'); const dark = M('#1a2a10');
    part(g.body, SPHERE, M(c), [0, 0.42, 0], [0.45, 0.3, 0.45]);
    part(g.body, SPHERE, belly, [0, 0.36, 0.12], [0.36, 0.22, 0.36]);
    const head = new THREE.Group(); head.position.set(0, 0.62, 0.22); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.42, 0.24, 0.32]);
    for (const s of [-1, 1]) {
      part(head, SPHERE, M(c), [s * 0.2, 0.2, 0.05], [0.14, 0.14, 0.14]);
      part(head, SPHERE, M('#ffffff'), [s * 0.2, 0.24, 0.13], [0.09, 0.09, 0.07]);
      part(head, SPHERE, dark, [s * 0.2, 0.25, 0.19], [0.05, 0.06, 0.03]);
      part(head, SPHERE, M('#ff7fb0', { transparent: true, opacity: 0.6 }), [s * 0.28, -0.04, 0.22], [0.06, 0.035, 0.03]);
    }
    part(head, TORUS, M('#2d4a1a'), [0, -0.05, 0.27], [0.14, 0.05, 0.05], [0, 0, 0]);
    g.ears = [];
    const tail = new THREE.Group(); g.body.add(tail); g.tail = tail;
    g.legs = legs(g.body, shade(c, 0.75), 0.36, 0.2, -0.22, 0.24, 0.09);
  },
  penguin(g, c) {
    const white = M('#ffffff'); const orange = M('#ffae2f');
    part(g.body, SPHERE, M(c), [0, 0.6, 0], [0.38, 0.5, 0.38]);
    part(g.body, SPHERE, white, [0, 0.55, 0.12], [0.3, 0.42, 0.3]);
    const head = new THREE.Group(); head.position.set(0, 1.1, 0.06); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.3, 0.27, 0.28]);
    for (const s of [-1, 1]) part(head, SPHERE, white, [s * 0.1, 0.0, 0.18], [0.11, 0.13, 0.1]);
    part(head, CONE, orange, [0, -0.06, 0.32], [0.07, 0.16, 0.05], [Math.PI / 2, 0, 0]);
    eyes(head, 0.03, 0.27, 0.1, 0.05);
    g.ears = [];
    for (const s of [-1, 1]) {
      const fl = new THREE.Group(); fl.position.set(s * 0.36, 0.75, 0); g.body.add(fl);
      part(fl, SPHERE, M(c), [s * 0.04, -0.18, 0], [0.07, 0.26, 0.15], [0, 0, s * 0.2]);
      g.ears.push(fl);
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.25, -0.35); g.body.add(tail); g.tail = tail;
    part(tail, CONE, M(c), [0, 0, 0], [0.12, 0.2, 0.05], [-Math.PI / 2 - 0.4, 0, 0]);
    g.legs = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Group(); f.position.set(s * 0.15, 0.12, 0.05); g.body.add(f);
      part(f, SPHERE, orange, [0, -0.08, 0.1], [0.1, 0.04, 0.16]);
      f.userData.phase = s > 0 ? 0 : Math.PI;
      g.legs.push(f);
    }
    g.waddle = true;
  },
  unicorn(g, c) {
    const white = M('#fffaf0'); const gold = M('#ffd76a', { metalness: 0.6, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.4 });
    const rainbow = ['#ff5f8a', '#ffa64d', '#ffe156', '#6ee07a', '#5fc8ff', '#b07cff'];
    part(g.body, SPHERE, white, [0, 0.62, -0.02], [0.36, 0.34, 0.55]);
    part(g.body, SPHERE, M(c), [0, 0.6, 0.02], [0.34, 0.3, 0.5]);
    const head = new THREE.Group(); head.position.set(0, 1.05, 0.45); g.body.add(head); g.head = head;
    part(head, SPHERE, white, [0, 0, 0], [0.27, 0.3, 0.3]);
    part(head, SPHERE, white, [0, -0.12, 0.22], [0.18, 0.15, 0.18]);
    part(head, SPHERE, M('#ffc0dc'), [0, -0.15, 0.35], [0.1, 0.06, 0.05]);
    part(head, CONE, gold, [0, 0.38, 0.1], [0.06, 0.36, 0.06], [0.35, 0, 0]);
    for (let i = 0; i < 3; i++) part(head, TORUS, gold, [0, 0.27 + i * 0.09, 0.07 + i * 0.032], [0.05 - i * 0.012, 0.05 - i * 0.012, 0.03], [Math.PI / 2 + 0.35, 0, 0]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.15, 0.25, -0.06); ear.rotation.z = -s * 0.3; head.add(ear);
      part(ear, CONE, white, [0, 0.08, 0], [0.07, 0.18, 0.05]);
      g.ears.push(ear);
    }
    eyes(head, 0.04, 0.24, 0.13, 0.06);
    for (let i = 0; i < 6; i++) part(g.body, SPHERE, M(rainbow[i]), [0, 1.2 - i * 0.09, 0.3 - i * 0.1], [0.09, 0.11, 0.09]);
    const tail = new THREE.Group(); tail.position.set(0, 0.72, -0.5); g.body.add(tail); g.tail = tail;
    for (let i = 0; i < 6; i++) part(tail, SPHERE, M(rainbow[i]), [0, -i * 0.06, -0.08 - i * 0.07], [0.09, 0.09, 0.12]);
    g.legs = legs(g.body, '#fff2df', 0.18, 0.3, -0.28, 0.36, 0.07);
  },
  bear(g, c) {
    const light = M(shade(c, 1.4)); const dark = M('#2a1018');
    part(g.body, SPHERE, M(c), [0, 0.58, 0], [0.45, 0.42, 0.52]);
    part(g.body, SPHERE, light, [0, 0.52, 0.2], [0.3, 0.3, 0.32]);
    const head = new THREE.Group(); head.position.set(0, 1.02, 0.36); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.36, 0.33, 0.32]);
    part(head, SPHERE, light, [0, -0.08, 0.25], [0.16, 0.12, 0.12]);
    part(head, SPHERE, dark, [0, -0.03, 0.35], [0.06, 0.045, 0.04]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.24, 0.24, -0.04); head.add(ear);
      part(ear, SPHERE, M(c), [0, 0, 0], [0.12, 0.12, 0.07]);
      part(ear, SPHERE, light, [0, 0, 0.04], [0.07, 0.07, 0.04]);
      g.ears.push(ear);
    }
    eyes(head, 0.06, 0.27, 0.14, 0.055);
    const tail = new THREE.Group(); tail.position.set(0, 0.5, -0.5); g.body.add(tail); g.tail = tail;
    part(tail, SPHERE, light, [0, 0, 0], [0.1, 0.1, 0.1]);
    g.legs = legs(g.body, shade(c, 0.6), 0.25, 0.22, -0.22, 0.3, 0.1);
  },
  owl(g, c) {
    const light = M(shade(c, 1.45)); const gold = M('#ffb02e'); const white = M('#ffffff');
    part(g.body, SPHERE, M(c), [0, 0.62, 0], [0.42, 0.5, 0.4]);
    part(g.body, SPHERE, light, [0, 0.55, 0.15], [0.3, 0.38, 0.3]);
    const head = new THREE.Group(); head.position.set(0, 1.08, 0.06); g.body.add(head); g.head = head;
    part(head, SPHERE, M(c), [0, 0, 0], [0.36, 0.3, 0.32]);
    for (const s of [-1, 1]) {
      part(head, SPHERE, white, [s * 0.14, 0.02, 0.24], [0.13, 0.13, 0.06]);
      part(head, SPHERE, M('#ffcf3d', { emissive: '#ff9900', emissiveIntensity: 0.35 }), [s * 0.14, 0.02, 0.28], [0.07, 0.07, 0.03]);
      part(head, SPHERE, M('#1a1023'), [s * 0.14, 0.02, 0.305], [0.035, 0.035, 0.02]);
    }
    part(head, CONE, gold, [0, -0.1, 0.3], [0.05, 0.12, 0.04], [Math.PI / 2 + 0.6, 0, 0]);
    g.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.position.set(s * 0.22, 0.24, 0); ear.rotation.z = -s * 0.5; head.add(ear);
      part(ear, CONE, M(c), [0, 0.08, 0], [0.07, 0.2, 0.05]);
      g.ears.push(ear);
    }
    for (const s of [-1, 1]) {
      const wing = new THREE.Group(); wing.position.set(s * 0.4, 0.8, -0.02); g.body.add(wing);
      part(wing, SPHERE, M(shade(c, 0.75)), [0, -0.2, 0], [0.08, 0.32, 0.25], [0, 0, s * 0.15]);
      g.ears.push(wing);
    }
    const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.36); g.body.add(tail); g.tail = tail;
    part(tail, CONE, M(shade(c, 0.75)), [0, 0, 0], [0.14, 0.2, 0.05], [-Math.PI / 2 - 0.5, 0, 0]);
    g.legs = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Group(); f.position.set(s * 0.15, 0.12, 0.05); g.body.add(f);
      part(f, SPHERE, gold, [0, -0.08, 0.08], [0.09, 0.04, 0.13]);
      f.userData.phase = s > 0 ? 0 : Math.PI;
      g.legs.push(f);
    }
    g.waddle = true;
  },
};

function crown(parent) {
  const gold = M('#ffd34d', { metalness: 0.7, roughness: 0.25, emissive: '#a06a00', emissiveIntensity: 0.5 });
  const gem = M('#ff3ea5', { emissive: '#ff3ea5', emissiveIntensity: 1.2 });
  const g = new THREE.Group();
  part(g, CYL, gold, [0, 0, 0], [0.16, 0.08, 0.16]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(g, CONE, gold, [Math.cos(a) * 0.13, 0.09, Math.sin(a) * 0.13], [0.045, 0.12, 0.045]);
    part(g, SPHERE, gem, [Math.cos(a) * 0.13, 0.16, Math.sin(a) * 0.13], [0.025, 0.025, 0.025]);
  }
  parent.add(g);
  return g;
}

function flower(parent, color) {
  const g = new THREE.Group();
  const petal = M(color, { emissive: color, emissiveIntensity: 0.25 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(g, SPHERE, petal, [Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06], [0.05, 0.02, 0.05]);
  }
  part(g, SPHERE, M('#ffe55c'), [0, 0.01, 0], [0.035, 0.03, 0.035]);
  parent.add(g);
  return g;
}

export function createAnimal(type, color, { isHuman = false } = {}) {
  const root = new THREE.Group();
  const g = { root, body: new THREE.Group(), legs: [], ears: [], tail: null, head: null };
  root.add(g.body);
  (BUILDERS[type] || BUILDERS.fox)(g, color);
  // accessory
  if (g.head) {
    let acc;
    if (isHuman) acc = crown(g.head);
    else acc = flower(g.head, ['#ff6fb5', '#ffffff', '#ffd23f', '#8be8ff'][Math.floor(Math.random() * 4)]);
    const headTop = type === 'frog' ? 0.22 : type === 'unicorn' ? 0.3 : 0.3;
    acc.position.set(type === 'unicorn' ? 0.14 : 0, headTop, type === 'unicorn' ? -0.05 : -0.02);
    acc.rotation.z = isHuman ? 0 : 0.3;
    if (!isHuman) acc.position.x = 0.12;
  }
  // glowing halo on the ground
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), haloMat);
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.1;
  root.add(halo);
  g.halo = halo;
  root.scale.setScalar(1.25);

  let t = Math.random() * 10;
  let lastAngle = null;
  g.update = (dt, moving = true, angle = 0) => {
    t += dt;
    const hopF = 13;
    const s = Math.sin(t * hopF);
    const hop = moving ? Math.abs(s) * 0.12 : Math.abs(Math.sin(t * 3)) * 0.03;
    g.body.position.y = hop;
    let turn = 0;
    if (lastAngle !== null) {
      let d = angle - lastAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn = d / Math.max(dt, 1e-3);
    }
    lastAngle = angle;
    g.body.rotation.z += ((-turn * 0.06) - g.body.rotation.z) * 0.15;
    g.body.rotation.x = moving ? -0.06 + s * 0.04 : 0;
    const squash = 1 + (moving ? (Math.abs(s) - 0.5) * 0.08 : 0);
    g.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    if (g.waddle) g.body.rotation.z += Math.sin(t * hopF * 0.5) * 0.12;
    for (const L of g.legs) L.rotation.x = moving ? Math.sin(t * hopF * 0.5 + L.userData.phase) * 0.7 : 0;
    if (g.tail) g.tail.rotation.y = Math.sin(t * 7) * 0.45;
    g.ears.forEach((e, i) => { e.rotation.x = Math.sin(t * hopF + i) * 0.12; });
    if (g.head) g.head.rotation.y = Math.sin(t * 1.3) * 0.12;
    g.halo.material.opacity = 0.4 + 0.2 * Math.sin(t * 4);
    const hs = 1 + 0.06 * Math.sin(t * 4);
    g.halo.scale.set(hs, hs, hs);
  };
  return g;
}
