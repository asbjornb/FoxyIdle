import * as THREE from 'three';
import { damp, dampAngle } from './util.js';

const ORANGE = '#e8742a';
const WHITE = '#f7efe3';
const DARK = '#2e211c';

function mat(hex, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, metalness: 0, ...opts });
}

function mesh(geo, material, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export class Fox {
  constructor() {
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.3);
    const orange = mat(ORANGE);
    const white = mat(WHITE);
    const dark = mat(DARK, { roughness: 0.6 });
    const black = mat('#111111', { roughness: 0.3 });
    this.mats = { orange, white, dark };

    // Root pivot (hips/body)
    const root = new THREE.Group();
    root.position.y = 0.42;
    this.group.add(root);
    this.root = root;

    const torsoGeo = new THREE.CapsuleGeometry(0.19, 0.42, 6, 12);
    torsoGeo.rotateX(Math.PI / 2);
    mesh(torsoGeo, orange, root, [0, 0.02, 0], [0, 0, 0], [1, 0.95, 1]);
    mesh(new THREE.SphereGeometry(0.17, 12, 10), white, root, [0, -0.04, 0.22], [0, 0, 0], [0.95, 1, 1.05]);
    mesh(new THREE.SphereGeometry(0.15, 10, 8), white, root, [0, -0.09, 0.02], [0, 0, 0], [1, 0.6, 1.6]);

    // Neck + head
    const neck = new THREE.Group();
    neck.position.set(0, 0.1, 0.3);
    root.add(neck);
    this.neck = neck;
    mesh(new THREE.SphereGeometry(0.13, 10, 8), orange, neck, [0, 0.05, 0.02], [0, 0, 0], [1, 1.1, 1]);
    mesh(new THREE.SphereGeometry(0.11, 10, 8), white, neck, [0, -0.02, 0.07]);

    const head = new THREE.Group();
    head.position.set(0, 0.15, 0.1);
    neck.add(head);
    this.head = head;
    mesh(new THREE.SphereGeometry(0.16, 14, 12), orange, head, [0, 0, 0], [0, 0, 0], [1, 0.88, 0.95]);
    mesh(new THREE.SphereGeometry(0.085, 10, 8), white, head, [0.085, -0.055, 0.06]);
    mesh(new THREE.SphereGeometry(0.085, 10, 8), white, head, [-0.085, -0.055, 0.06]);
    const snoutGeo = new THREE.ConeGeometry(0.08, 0.22, 10);
    snoutGeo.rotateX(Math.PI / 2);
    mesh(snoutGeo, orange, head, [0, -0.035, 0.19], [0.08, 0, 0], [1, 0.8, 1]);
    mesh(new THREE.SphereGeometry(0.06, 10, 8), white, head, [0, -0.075, 0.15], [0, 0, 0], [1, 0.6, 1.5]);
    mesh(new THREE.SphereGeometry(0.03, 8, 6), black, head, [0, -0.025, 0.3]);
    // Eyes (scaled on Y for blinking)
    this.eyes = [];
    for (const sx of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(0.072 * sx, 0.025, 0.125);
      head.add(eye);
      mesh(new THREE.SphereGeometry(0.026, 10, 8), black, eye, [0, 0, 0], [0, 0, 0], [1, 1, 0.7]);
      const hl = mesh(new THREE.SphereGeometry(0.008, 6, 4), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), eye, [0.008 * sx, 0.01, 0.018]);
      hl.castShadow = false;
      this.eyes.push(eye);
    }
    // Ears
    this.ears = [];
    for (const sx of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.085 * sx, 0.11, -0.02);
      ear.rotation.z = -0.25 * sx;
      head.add(ear);
      const eg = new THREE.ConeGeometry(0.065, 0.19, 4);
      eg.translate(0, 0.095, 0);
      mesh(eg, orange, ear, [0, 0, 0], [0, Math.PI / 4, 0], [1, 1, 0.55]);
      const tip = new THREE.ConeGeometry(0.035, 0.07, 4);
      tip.translate(0, 0.16, 0);
      mesh(tip, dark, ear, [0, 0.0, 0.0], [0, Math.PI / 4, 0], [1, 1, 0.6]);
      const inner = new THREE.ConeGeometry(0.04, 0.12, 3);
      inner.translate(0, 0.07, 0);
      mesh(inner, white, ear, [0, 0.0, 0.018], [0, 0, 0], [1, 1, 0.3]);
      this.ears.push(ear);
    }

    // Legs: upper pivot (hip/shoulder) -> lower pivot (knee)
    this.legs = [];
    const legDefs = [
      { x: 0.1, z: 0.22, front: true }, { x: -0.1, z: 0.22, front: true },
      { x: 0.11, z: -0.2, front: false }, { x: -0.11, z: -0.2, front: false },
    ];
    for (const d of legDefs) {
      const hip = new THREE.Group();
      hip.position.set(d.x, -0.04, d.z);
      root.add(hip);
      const ug = new THREE.CylinderGeometry(0.055, 0.042, 0.2, 8);
      ug.translate(0, -0.1, 0);
      mesh(ug, d.front ? orange : orange, hip, [0, 0, 0], [0, 0, 0], d.front ? [1, 1, 1] : [1.25, 1, 1.35]);
      const knee = new THREE.Group();
      knee.position.set(0, -0.19, 0);
      hip.add(knee);
      const lg = new THREE.CylinderGeometry(0.04, 0.034, 0.2, 8);
      lg.translate(0, -0.1, 0);
      mesh(lg, dark, knee);
      mesh(new THREE.SphereGeometry(0.045, 8, 6), dark, knee, [0, -0.2, 0.02], [0, 0, 0], [1, 0.6, 1.4]);
      this.legs.push({ hip, knee, front: d.front, side: Math.sign(d.x) });
    }

    // Tail: chain of segments
    this.tail = [];
    let parent = root;
    const radii = [0.075, 0.11, 0.13, 0.125, 0.095];
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 0.08, -0.38);
    root.add(tailBase);
    parent = tailBase;
    radii.forEach((r, i) => {
      const seg = new THREE.Group();
      seg.position.set(0, 0, i === 0 ? 0 : -0.15);
      parent.add(seg);
      const m = i === radii.length - 1 ? white : orange;
      mesh(new THREE.SphereGeometry(r, 10, 8), m, seg, [0, 0, -0.07], [0, 0, 0], [1, 0.95, 1.5]);
      this.tail.push(seg);
      parent = seg;
    });
    this.tailBase = tailBase;

    // Basket on the back
    const basket = new THREE.Group();
    basket.position.set(0, 0.2, -0.06);
    root.add(basket);
    const bmat = mat('#b9844c', { roughness: 0.9 });
    const bgeo = new THREE.CylinderGeometry(0.13, 0.1, 0.14, 12, 1, true);
    const bm = mesh(bgeo, bmat, basket, [0, 0.07, 0]);
    bm.material.side = THREE.DoubleSide;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), bmat, basket, [0, 0.005, 0]);
    mesh(new THREE.TorusGeometry(0.13, 0.016, 6, 16), mat('#8d5f33'), basket, [0, 0.14, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.TorusGeometry(0.115, 0.01, 6, 16), mat('#8d5f33'), basket, [0, 0.07, 0], [Math.PI / 2, 0, 0]);
    // Handle
    const handle = new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI);
    mesh(handle, mat('#8d5f33'), basket, [0, 0.14, 0], [0, Math.PI / 2, 0]);
    // Strap around the belly
    mesh(new THREE.TorusGeometry(0.205, 0.015, 6, 20), mat('#7a4e2c'), root, [0, 0.0, -0.05], [0, Math.PI / 2, 0], [1, 1.0, 1]);
    // Berries inside basket
    this.basketBerries = [];
    const bberry = mat('#d9344d', { roughness: 0.35 });
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = 0.03 + (i % 3) * 0.028;
      const b = mesh(new THREE.SphereGeometry(0.03, 8, 6), bberry, basket, [Math.cos(a) * r, 0.06 + Math.floor(i / 6) * 0.04, Math.sin(a) * r]);
      b.visible = false;
      this.basketBerries.push(b);
    }
    this.basket = basket;

    // Animation state
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.state = 'idle';
    this.t = 0;
    this.walkPhase = 0;
    this.blinkT = 2;
    this.pose = this.makePose();
    this.basketFill = 0;
  }

  makePose() {
    return {
      rootY: 0.42, rootPitch: 0, rootRoll: 0, neckPitch: 0, headPitch: 0, headYaw: 0, headRoll: 0,
      legs: [0, 0, 0, 0], knees: [0, 0, 0, 0], tailPitch: -0.55, tailYaw: 0, tailCurl: 0.12, earTilt: 0, eyeOpen: 1,
    };
  }

  setBasketFill(f) {
    this.basketFill = f;
    const n = Math.round(f * this.basketBerries.length);
    this.basketBerries.forEach((b, i) => { b.visible = i < n; });
  }

  // Returns world position of the basket opening (for berry particle arcs)
  basketWorld(out = new THREE.Vector3()) {
    this.basket.getWorldPosition(out);
    out.y += 0.18;
    return out;
  }

  headWorld(out = new THREE.Vector3()) {
    this.head.getWorldPosition(out);
    return out;
  }

  pawWorld(out = new THREE.Vector3()) {
    this.legs[0].knee.getWorldPosition(out);
    return out;
  }

  update(dt, groundY) {
    this.t += dt;
    const t = this.t;
    const tp = this.makePose();
    const sp = this.speed;
    const moving = sp > 0.2;

    // ---- target pose by state ----
    switch (this.state) {
      case 'gather': {
        // Rear up a little, alternate front paws reaching into the bush, head nodding
        tp.rootPitch = -0.35; tp.rootY = 0.47;
        const c = t * 5;
        tp.legs[0] = -1.2 + Math.sin(c) * 0.45; tp.knees[0] = 0.7 + Math.max(0, Math.sin(c)) * 0.5;
        tp.legs[1] = -1.2 + Math.sin(c + Math.PI) * 0.45; tp.knees[1] = 0.7 + Math.max(0, Math.sin(c + Math.PI)) * 0.5;
        tp.legs[2] = 0.35; tp.legs[3] = 0.35; tp.knees[2] = -0.25; tp.knees[3] = -0.25;
        tp.neckPitch = 0.15; tp.headPitch = 0.2 + Math.sin(c * 0.5) * 0.12; tp.headYaw = Math.sin(t * 1.3) * 0.25;
        tp.tailPitch = -0.2; tp.tailYaw = Math.sin(t * 6) * 0.35;
        break;
      }
      case 'tug': {
        // Bite a branch and pull backwards in rhythmic heaves
        const c = Math.sin(t * 3.2);
        tp.rootPitch = 0.18 + c * 0.05; tp.rootY = 0.38 - Math.max(0, c) * 0.04;
        tp.neckPitch = 0.55; tp.headPitch = 0.35 - c * 0.12; tp.headRoll = Math.sin(t * 6.4) * 0.15;
        tp.legs[0] = -0.45; tp.legs[1] = -0.35; tp.knees[0] = 0.15; tp.knees[1] = 0.1;
        tp.legs[2] = 0.55 + c * 0.1; tp.legs[3] = 0.6 + c * 0.1; tp.knees[2] = -0.5; tp.knees[3] = -0.5;
        tp.tailPitch = -0.1 + c * 0.1; tp.tailYaw = Math.sin(t * 3.2) * 0.4; tp.earTilt = -0.3;
        this.root.position.z = -0.03 * (c + 1);
        break;
      }
      case 'dig': {
        const c = t * 11;
        tp.rootPitch = 0.3; tp.rootY = 0.36;
        tp.neckPitch = 0.55; tp.headPitch = 0.35;
        tp.legs[0] = -0.5 + Math.sin(c) * 0.7; tp.knees[0] = 0.4 + Math.max(0, Math.cos(c)) * 0.8;
        tp.legs[1] = -0.5 + Math.sin(c + Math.PI) * 0.7; tp.knees[1] = 0.4 + Math.max(0, Math.cos(c + Math.PI)) * 0.8;
        tp.legs[2] = 0.3; tp.legs[3] = 0.3; tp.knees[2] = -0.3; tp.knees[3] = -0.3;
        tp.tailPitch = 0.25; tp.tailYaw = Math.sin(t * 9) * 0.5; tp.earTilt = 0.2;
        break;
      }
      case 'meditate': {
        // Sit, tail wrapped, eyes closed, gentle breathing
        const br = Math.sin(t * 1.4);
        tp.rootPitch = -0.62; tp.rootY = 0.36 + br * 0.008;
        tp.legs[0] = 0.62; tp.legs[1] = 0.62; tp.knees[0] = 0; tp.knees[1] = 0;
        tp.legs[2] = -0.95; tp.legs[3] = -0.95; tp.knees[2] = 2.2; tp.knees[3] = 2.2;
        tp.neckPitch = -0.15; tp.headPitch = 0.62 + br * 0.03;
        tp.tailPitch = 0.5; tp.tailYaw = 1.0; tp.tailCurl = 0.45; tp.eyeOpen = 0.08; tp.earTilt = 0.1;
        break;
      }
      case 'channel': {
        // Sit upright, look to the sky, raise one paw
        const br = Math.sin(t * 2);
        tp.rootPitch = -0.7; tp.rootY = 0.37;
        tp.legs[0] = -0.9 + br * 0.15; tp.knees[0] = 0.6; tp.legs[1] = 0.7; tp.knees[1] = 0;
        tp.legs[2] = -0.95; tp.legs[3] = -0.95; tp.knees[2] = 2.2; tp.knees[3] = 2.2;
        tp.neckPitch = -0.3; tp.headPitch = 0.1 + br * 0.05; tp.headRoll = Math.sin(t * 0.7) * 0.1;
        tp.tailPitch = 0.3; tp.tailYaw = Math.sin(t * 1.5) * 0.3 + 0.6; tp.tailCurl = 0.3; tp.eyeOpen = 0.5; tp.earTilt = -0.15;
        break;
      }
      case 'offer':
      case 'call': {
        // A slow respectful bow, repeated
        const c = (Math.sin(t * 1.6) + 1) * 0.5;
        tp.rootPitch = 0.1 + c * 0.25; tp.rootY = 0.4 - c * 0.05;
        tp.legs[0] = -0.25 - c * 0.5; tp.legs[1] = -0.25 - c * 0.5; tp.knees[0] = c * 0.9; tp.knees[1] = c * 0.9;
        tp.legs[2] = 0.15; tp.legs[3] = 0.15;
        tp.neckPitch = 0.2 + c * 0.6; tp.headPitch = c * 0.3; tp.eyeOpen = 1 - c * 0.85;
        tp.tailYaw = Math.sin(t * 2.5) * 0.5; tp.tailPitch = -0.3; tp.earTilt = -c * 0.4;
        break;
      }
      default: {
        if (!moving) {
          // Idle: breathing, ear twitches, looking around, tail swish
          const br = Math.sin(t * 2.0);
          tp.rootY = 0.42 + br * 0.006;
          tp.headYaw = Math.sin(t * 0.37) * 0.35 + Math.sin(t * 0.11) * 0.25;
          tp.headPitch = Math.sin(t * 0.23) * 0.1;
          tp.tailYaw = Math.sin(t * 1.2) * 0.35;
          tp.earTilt = Math.sin(t * 7) > 0.97 ? 0.4 : 0;
        }
      }
    }
    if (this.state !== 'tug') this.root.position.z = damp(this.root.position.z, 0, 8, dt);

    // ---- locomotion layered on top ----
    if (moving && this.state === 'idle') {
      const run = Math.min(1, sp / 7);
      this.walkPhase += dt * (5 + sp * 1.7);
      const ph = this.walkPhase;
      const amp = 0.55 + run * 0.35;
      // diagonal gait (trot): FL with BR, FR with BL
      const offs = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < 4; i++) {
        const s = Math.sin(ph + offs[i]);
        tp.legs[i] = s * amp;
        const lift = Math.max(0, Math.cos(ph + offs[i]));
        tp.knees[i] = this.legs[i].front ? lift * 0.9 : -lift * 0.7;
      }
      tp.rootY = 0.42 + Math.abs(Math.sin(ph)) * 0.035 * (1 + run);
      tp.rootPitch = Math.sin(ph * 2) * 0.03 - run * 0.05;
      tp.rootRoll = Math.sin(ph) * 0.03;
      tp.headPitch = -Math.sin(ph * 2) * 0.04 + run * 0.1;
      tp.tailPitch = -0.35 + run * 0.25;
      tp.tailYaw = Math.sin(ph) * 0.25;
      tp.earTilt = -run * 0.35;
    }

    // ---- blink ----
    this.blinkT -= dt;
    let blink = 1;
    if (this.blinkT < 0.12) blink = 0.1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;

    // ---- blend current pose toward target ----
    const P = this.pose, k = moving ? 14 : 7;
    for (const key of ['rootY', 'rootPitch', 'rootRoll', 'neckPitch', 'headPitch', 'headYaw', 'headRoll', 'tailPitch', 'tailYaw', 'tailCurl', 'earTilt', 'eyeOpen']) {
      P[key] = damp(P[key], tp[key], k, dt);
    }
    for (let i = 0; i < 4; i++) {
      P.legs[i] = damp(P.legs[i], tp.legs[i], k * 1.4, dt);
      P.knees[i] = damp(P.knees[i], tp.knees[i], k * 1.4, dt);
    }

    // ---- apply ----
    this.group.position.set(this.pos.x, groundY, this.pos.z);
    this.group.rotation.y = this.heading;
    this.root.position.y = P.rootY;
    this.root.rotation.set(P.rootPitch, 0, P.rootRoll);
    this.neck.rotation.set(P.neckPitch, 0, 0);
    this.head.rotation.set(P.headPitch, P.headYaw, P.headRoll);
    // Keep legs planted relative to the body pitch
    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      L.hip.rotation.x = P.legs[i];
      L.knee.rotation.x = P.knees[i];
    }
    const eyeS = Math.min(P.eyeOpen, blink);
    this.eyes.forEach((e) => { e.scale.y = Math.max(0.08, eyeS); });
    this.ears.forEach((e, i) => { e.rotation.x = P.earTilt; e.rotation.z = (i === 0 ? -1 : 1) * (0.25 + Math.max(0, -P.earTilt) * 0.3); });
    // Tail: wave travels down the chain
    this.tailBase.rotation.set(P.tailPitch, P.tailYaw * 0.5, 0);
    this.tail.forEach((seg, i) => {
      const w = Math.sin(t * 2.4 - i * 0.7) * 0.08 * (1 - this.speed * 0.05);
      seg.rotation.set(P.tailCurl * 0.25 + (i > 2 ? 0.08 : 0), P.tailYaw * 0.35 + w, 0);
    });
  }

  // Face a point smoothly
  faceTowards(x, z, dt, rate = 6) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.heading = dampAngle(this.heading, target, rate, dt);
  }
}
