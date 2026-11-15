import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Game } from './state.js';
import { STATIONS, AREAS, RESOURCES, TREE_STAGES, FOX_START, WORLD_RADIUS, PRODUCERS, WISP } from './config.js';
import { heightAt, damp, dampAngle, lockedAreaAt, clamp, smoothstep, lerp } from './util.js';
import { World } from './world.js';
import { Fox } from './fox.js';
import { Particles } from './particles.js';
import { StationManager } from './stations.js';
import { UI, ICONS } from './ui.js';
import { Audio } from './audio.js';
import './style.css';

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.65, 0.88);
composer.addPass(bloom);
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uGloom: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uGloom, uTime, uAspect; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
      float sat = 1.12 - uGloom*0.9;
      c.rgb = mix(vec3(l), c.rgb, sat);
      // warm highlights, cool shadows
      c.rgb *= mix(vec3(0.92,0.96,1.06), vec3(1.05,1.0,0.94), smoothstep(0.0, 0.8, l));
      c.rgb = mix(c.rgb, c.rgb*vec3(0.8,0.78,0.92), uGloom*0.5);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(1.05, 0.35, length(d));
      c.rgb *= mix(0.55 - uGloom*0.2, 1.0, vig);
      gl_FragColor = c;
    }`,
});
composer.addPass(gradePass);
composer.addPass(new OutputPass());

// ---------- systems ----------
const game = new Game();
const world = new World(scene, renderer);
const particles = new Particles(scene);
const stations = new StationManager(scene, world, particles);
const fox = new Fox();
scene.add(fox.group);
const ui = new UI(game);
const audio = new Audio();
ui.setSound(audio.enabled);

// Objective marker: floating crystal + soft beam
const marker = new THREE.Group();
const markerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: '#fff4c8', emissive: '#ffd36b', emissiveIntensity: 2.2, flatShading: true }));
markerGem.scale.set(1, 1.5, 1);
marker.add(markerGem);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 6, 16, 1, true), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uA: { value: 0.5 } },
  vertexShader: 'varying float vY; void main(){ vY = position.y/6.0+0.5; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'uniform float uA; varying float vY; void main(){ gl_FragColor = vec4(1.0,0.85,0.5, (1.0-vY)*0.22*uA); }',
}));
beam.position.y = -3.2;
marker.add(beam);
scene.add(marker);

// ---------- state ----------
let mode = 'title'; // 'title' | 'play' | 'cinematic' | 'ended'
let clock = new THREE.Clock();
let elapsed = 0;
const keys = new Set();
let moveTarget = null;
let idleTime = 0;
let actionAnim = { t: 0, type: 'idle', face: null };
let workingAt = null;
let near = null;
let saveT = 0;
let hintShown = 0;
let colliders = [];
let titleBlend = 0; // 0 = title cam, 1 = follow cam
let cinematicT = 0;
let ended = false;
const fxTimers = { dust: 0, pluck: 0 };

fox.pos.set(FOX_START[0], 0, FOX_START[1]);
fox.heading = Math.PI;

const cam = { yaw: 0, pitch: 0.3, dist: 8, target: new THREE.Vector3(), pos: new THREE.Vector3() };
cam.target.set(fox.pos.x, heightAt(fox.pos.x, fox.pos.z) + 1, fox.pos.z);

function refreshColliders() {
  colliders = [...world.treeColliders, ...stations.colliders(game)];
}

// ---------- game events ----------
function stationTop(id) { return stations.stations[id].center.clone().add(new THREE.Vector3(0, 2.2, 0)); }

game.on('gathered', ({ id, resource, amount }) => {
  const head = fox.headWorld().add(new THREE.Vector3(0, 0.5, 0));
  ui.floatText(head, `+${amount < 10 ? amount.toFixed(1).replace(/\.0$/, '') : Math.round(amount)} <i class="ic">${ICONS[resource]}</i>`, RESOURCES[resource].color, camera);
  stations.stations[id].onCycle(ctxFor());
  audio.chime(resource);
});
game.on('tended', ({ id, amount }) => {
  ui.floatText(fox.headWorld().add(new THREE.Vector3(0, 0.5, 0)), `+${amount.toFixed(1)} <i class="ic">${ICONS.harmony}</i>`, '#a6e889', camera);
  stations.stations[id].onCycle(ctxFor());
  audio.chime('garden');
});
game.on('stationUnlocked', ({ id }) => {
  stations.stations[id].setUnlocked(true, true);
  stations.stations[id].setLevel(game.s.levels[id]);
  particles.burst(stations.stations[id].center.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 60, color: '#c8ffb0', glow: true, size: 0.12, speed: 3, up: 2, g: 1, life: 1.6, bright: 2 });
  ui.toast(`<b>${STATIONS[id].name}</b> is planted. Tend it to keep the glade in harmony.`);
  audio.success();
  refreshColliders();
  game.save();
});
game.on('upgraded', ({ id, level }) => {
  stations.stations[id].setLevel(level);
  particles.spiral(stations.stations[id].center.clone().add(new THREE.Vector3(0, 0.1, 0)), { count: 50, color: '#fff0b0', radius: 2.4, rise: 1.4, spin: 2.5, life: 1.6, size: 0.09 });
  ui.toast(`${STATIONS[id].name} grows to level ${level}`);
  audio.success();
  game.save();
});
game.on('areaUnlocked', ({ id }) => {
  stations.gates[id].setOpen(true, true);
  stations.mists[id].clear(true);
  const g = stations.gates[id].center.clone().add(new THREE.Vector3(0, 1, 0));
  particles.burst(g, { count: 70, color: '#bfefff', glow: true, size: 0.12, speed: 3.5, up: 2.5, g: 0.6, life: 1.8, bright: 2.2 });
  ui.toast(`The mist lifts. <b>${AREAS[id].name}</b> is open.`, 'big');
  audio.success();
  refreshColliders();
  game.save();
});
game.on('treeStage', ({ stage }) => {
  const tree = stations.stations.tree;
  tree.setStage(stage);
  tree.celebrate(ctxFor());
  const st = TREE_STAGES[stage - 1];
  ui.toast(`<b>${st.name}</b>. ${st.text}`, 'big');
  audio.grand();
  actionAnim = { t: 2.6, type: 'offer', face: tree.center };
  game.save();
});
game.on('wisp', ({ station }) => {
  stations.wisps.add(stations.stations[station].center, stations.stations.hollow.center.clone().add(new THREE.Vector3(0, 1, 0)), false);
  stations.stations.hollow.onCycle(ctxFor());
  ui.toast(`A wisp drifts off to help at the <b>${STATIONS[station].name}</b>.`);
  audio.success();
  actionAnim = { t: 2.2, type: 'call', face: stations.stations.hollow.center };
  game.save();
});
game.on('lowHarmony', () => {
  ui.toast('Harmony is fading. The garden needs tending.', 'warn');
});
game.on('won', () => {
  mode = 'cinematic';
  ui.hideUI();
  cinematicT = 0;
  Game.clearSave();
  game.save();
});
game.on('lost', () => {
  audio.sad();
  Game.clearSave();
  setTimeout(() => {
    mode = 'ended';
    ui.hideUI();
    ui.showEnd({ won: false, time: game.s.time, onNew: newGame });
  }, 2600);
});

function ctxFor() {
  return { game, fox, particles, world, workingAt, camera };
}

// ---------- objectives ----------
const RES_STATION = { berries: 'berries', wood: 'wood', spirit: 'shrine', mana: 'pool' };
function currentObjective() {
  const s = game.s;
  if (s.status === 'won') return { text: 'The glade is restored. Wander as you like.', target: null };
  if (s.status === 'lost') return null;
  if (s.unlocked.garden && s.harmony < 32) return { text: 'Harmony is fading. Tend the <b>Meadow Garden</b>.', target: 'garden' };
  const goals = [];
  if (!s.unlocked.garden) goals.push({ name: 'plant the <b>Meadow Garden</b>', cost: STATIONS.garden.unlock, at: 'garden' });
  if (s.treeStage < 1) goals.push({ name: `offer to <b>the Great Tree</b>`, cost: TREE_STAGES[0].cost, at: 'tree' });
  if (!s.areas.east) goals.push({ name: 'clear the way to <b>Shrine Hill</b>', cost: AREAS.east.cost, at: 'gate:east' });
  if (!s.areas.west) goals.push({ name: 'clear the way to the <b>Moonlit Grove</b>', cost: AREAS.west.cost, at: 'gate:west' });
  if (!s.areas.north) goals.push({ name: 'open the <b>Wisp Hollow</b>', cost: AREAS.north.cost, at: 'gate:north' });
  if (s.areas.north && s.wispCount < 1) goals.push({ name: 'call a <b>wisp</b>', cost: game.primaryAction('hollow').cost, at: 'hollow' });
  if (s.treeStage < TREE_STAGES.length) goals.push({ name: `<b>${TREE_STAGES[s.treeStage].name}</b> at the Great Tree`, cost: TREE_STAGES[s.treeStage].cost, at: 'tree' });
  // choose first goal whose resources are obtainable
  const obtainable = (cost) => Object.keys(cost).every((k) => k === 'berries' || k === 'wood' || (k === 'spirit' && s.areas.east) || (k === 'mana' && s.areas.west));
  const g = goals.find((x) => obtainable(x.cost)) || goals[0];
  if (!g) return null;
  if (game.canAfford(g.cost)) return { text: `Go and ${g.name}. Press <kbd>E</kbd> there.`, target: g.at };
  let worst = null, wv = -1;
  for (const k in g.cost) { const need = (g.cost[k] - s.res[k]) / g.cost[k]; if (need > wv) { wv = need; worst = k; } }
  const have = Object.entries(g.cost).map(([k, v]) => `<span class="cost ${s.res[k] >= v ? '' : 'short'}"><i class="ic">${ICONS[k]}</i>${Math.floor(Math.min(s.res[k], v))}/${v}</span>`).join('');
  return { text: `Gather to ${g.name}<div class="obj-costs">${have}</div>`, target: RES_STATION[worst] };
}

function targetPos(key) {
  if (!key) return null;
  if (key.startsWith('gate:')) return stations.gates[key.slice(5)].center;
  return stations.stations[key].center;
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.repeat && (e.code === 'KeyE' || e.code === 'KeyR' || e.code === 'Space')) return;
  keys.add(e.code);
  if (mode !== 'play') return;
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { doPrimary(); e.preventDefault(); }
  if (e.code === 'KeyR') doUpgrade();
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyH') ui.toggleHelp();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { moveTarget = null; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved > 6 && mode === 'play') {
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.004, 0.12, 1.2);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (drag && drag.moved <= 6 && mode === 'play') clickToMove(e.clientX, e.clientY);
  drag = null;
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 4, 18);
  e.preventDefault();
}, { passive: false });

const raycaster = new THREE.Raycaster();
function clickToMove(cx, cy) {
  const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(world.terrain, false)[0];
  if (!hit) return;
  // If clicking on/near a station, walk into its ring
  let target = hit.point.clone();
  let stopR = 0.3;
  for (const id in STATIONS) {
    const st = stations.stations[id];
    if (target.distanceTo(st.center) < st.def.radius + 0.5 && game.stationReachable(id)) { target = st.center.clone(); stopR = st.def.radius * 0.72; break; }
  }
  for (const id in AREAS) {
    const g = stations.gates[id];
    if (!game.s.areas[id] && target.distanceTo(g.center) < g.radius) { target = g.center.clone(); stopR = 2.3; }
  }
  moveTarget = { p: target, stopR };
  particles.burst(hit.point.clone().add(new THREE.Vector3(0, 0.1, 0)), { count: 8, color: '#fff3c4', glow: true, size: 0.08, speed: 1, up: 0.6, g: 1, life: 0.6, bright: 1.6 });
}

function doPrimary() {
  if (!near || game.s.status === 'lost') return;
  let ok = false;
  if (near.type === 'gate') ok = game.unlockArea(near.id);
  else ok = game.doPrimary(near.id);
  if (!ok) {
    const a = near.type === 'gate' ? true : game.primaryAction(near.id);
    if (a) { audio.deny(); ui.card.classList.remove('shake'); void ui.card.offsetWidth; ui.card.classList.add('shake'); }
  } else if (near.type === 'station' && near.id === 'garden') {
    actionAnim = { t: 1.5, type: 'dig', face: stations.stations.garden.center };
  }
}
function doUpgrade() {
  if (!near || near.type !== 'station' || game.s.status === 'lost') return;
  if (!game.doUpgrade(near.id) && game.upgradeAction(near.id)) {
    audio.deny(); ui.card.classList.remove('shake'); void ui.card.offsetWidth; ui.card.classList.add('shake');
  }
}
function toggleSound() {
  audio.start();
  audio.setEnabled(!audio.enabled);
  ui.setSound(audio.enabled);
}
ui.on('primary', doPrimary);
ui.on('upgrade', doUpgrade);
ui.on('sound', toggleSound);
ui.on('help', () => ui.toggleHelp());

// ---------- start / restart ----------
function beginPlay() {
  mode = 'play';
  audio.start();
  ui.showUI();
  refreshColliders();
  hintShown = 0;
}

function newGame() {
  Game.clearSave();
  game.s = new Game().s;
  ended = false;
  stations.syncAll(game, false);
  fox.pos.set(FOX_START[0], 0, FOX_START[1]);
  fox.heading = Math.PI;
  cam.yaw = 0;
  moveTarget = null;
  world.vitality = 0.12;
  world.gloom = 0;
  if (mode === 'title') titleBlend = 0;
  beginPlay();
  ui.toast('The glade is quiet and grey. Perhaps the <b>berries</b> are a good place to start.');
}

function continueGame() {
  const info = game.load();
  stations.syncAll(game, false);
  world.vitality = Math.min(1, 0.12 + (game.s.vitality / 100) * 0.88);
  beginPlay();
  if (game.s.status === 'won') { game.s.freePlay = true; ended = true; }
  if (info && info.away > 60 && game.s.wispCount > 0) {
    const parts = Object.entries(info.gained).filter(([, v]) => v >= 1).map(([k, v]) => `${Math.floor(v)} <i class="ic">${ICONS[k]}</i>`);
    if (parts.length) ui.toast(`While you were away, the wisps gathered ${parts.join(' ')}`, 'big');
  } else {
    ui.toast('Welcome back to the glade.');
  }
}

// ---------- per-frame ----------
const tmpV = new THREE.Vector3();
function updatePlay(dt) {
  const s = game.s;
  const canMove = s.status !== 'lost';
  // Movement input relative to camera
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let dir = new THREE.Vector2();
  if (canMove && (ix || iz)) {
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    // forward is from camera toward the fox
    dir.set(ix * cy + iz * sy, -ix * sy + iz * cy).normalize();
  } else if (canMove && moveTarget) {
    const dx = moveTarget.p.x - fox.pos.x, dz = moveTarget.p.z - fox.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < moveTarget.stopR) moveTarget = null;
    else dir.set(dx / d, dz / d).multiplyScalar(Math.min(1, d / 1.2 + 0.3));
  }
  const maxSpeed = run ? 8.5 : 5;
  const wantSpeed = dir.length() * maxSpeed;
  fox.speed = damp(fox.speed, wantSpeed, wantSpeed > fox.speed ? 6 : 10, dt);
  if (dir.lengthSq() > 0.0001) {
    fox.heading = dampAngle(fox.heading, Math.atan2(dir.x, dir.y), 10, dt);
    hintShown += dt;
  }
  // Move along heading (smooth turning)
  if (fox.speed > 0.01) {
    const hx = Math.sin(fox.heading), hz = Math.cos(fox.heading);
    const blend = dir.lengthSq() > 0 ? 0.6 : 1;
    const mx = lerp(dir.x || hx, hx, blend), mz = lerp(dir.y || hz, hz, blend);
    const ml = Math.hypot(mx, mz) || 1;
    fox.pos.x += (mx / ml) * fox.speed * dt;
    fox.pos.z += (mz / ml) * fox.speed * dt;
  }
  // Collisions
  const fr = 0.42;
  for (let iter = 0; iter < 2; iter++) {
    for (const [cx, cz, r] of colliders) {
      const dx = fox.pos.x - cx, dz = fox.pos.z - cz;
      const d = Math.hypot(dx, dz), m = r + fr;
      if (d < m && d > 1e-5) { fox.pos.x = cx + (dx / d) * m; fox.pos.z = cz + (dz / d) * m; }
    }
    const r = Math.hypot(fox.pos.x, fox.pos.z);
    if (r > WORLD_RADIUS) { fox.pos.x *= WORLD_RADIUS / r; fox.pos.z *= WORLD_RADIUS / r; }
    const la = lockedAreaAt(fox.pos.x, fox.pos.z, s.areas);
    if (la) {
      const a = AREAS[la];
      const dx = fox.pos.x - a.center[0], dz = fox.pos.z - a.center[1];
      const d = Math.hypot(dx, dz) || 1;
      fox.pos.x = a.center[0] + (dx / d) * a.radius;
      fox.pos.z = a.center[1] + (dz / d) * a.radius;
      moveTarget = null;
    }
  }

  // Find nearby interactable
  near = null;
  let best = 1e9;
  for (const id in STATIONS) {
    if (!game.stationReachable(id)) continue;
    const st = stations.stations[id];
    const d = Math.hypot(fox.pos.x - st.center.x, fox.pos.z - st.center.z);
    if (d < st.def.radius && d < best) { best = d; near = { type: 'station', id }; }
  }
  for (const id in AREAS) {
    if (s.areas[id]) continue;
    const g = stations.gates[id];
    const d = Math.hypot(fox.pos.x - g.center.x, fox.pos.z - g.center.z);
    if (d < g.radius && d < best) { best = d; near = { type: 'gate', id }; }
  }

  // Working (idle at a station)
  const still = fox.speed < 0.25 && !(ix || iz) && !moveTarget;
  idleTime = still ? idleTime + dt : 0;
  workingAt = null;
  if (near && near.type === 'station' && game.stationActive(near.id) && STATIONS[near.id].cycle && idleTime > 0.35 && s.status !== 'lost') {
    workingAt = near.id;
  }
  actionAnim.t -= dt;
  if (workingAt) {
    fox.state = STATIONS[workingAt].anim;
    fox.faceTowards(stations.stations[workingAt].center.x, stations.stations[workingAt].center.z, dt, 5);
  } else if (actionAnim.t > 0 && still) {
    fox.state = actionAnim.type;
    if (actionAnim.face) fox.faceTowards(actionAnim.face.x, actionAnim.face.z, dt, 5);
  } else {
    fox.state = 'idle';
  }
  if (s.status === 'lost') fox.state = 'meditate';

  game.tick(dt, workingAt);
  // Little touches: dust puffs when running, soft plucks while working
  fxTimers.dust -= dt * fox.speed;
  if (fox.speed > 5.5 && fxTimers.dust < 0) {
    fxTimers.dust = 1.6;
    const gy = heightAt(fox.pos.x, fox.pos.z);
    particles.burst(new THREE.Vector3(fox.pos.x, gy + 0.05, fox.pos.z), { count: 3, color: '#cdb894', size: 0.09, speed: 0.6, up: 0.4, g: 0.3, drag: 3, life: 0.7, floor: gy });
  }
  fxTimers.pluck -= dt;
  if (workingAt && fxTimers.pluck < 0) { fxTimers.pluck = 0.9 + Math.random() * 0.6; audio.pluck(); }
  fox.setBasketFill(Math.min(1, s.res.berries / 60));

  if (hintShown > 6) ui.hideHint();
  saveT += dt;
  if (saveT > 8) { saveT = 0; if (s.status !== 'lost') game.save(); }
}

function updateCamera(dt, t) {
  const fy = heightAt(fox.pos.x, fox.pos.z);
  const follow = new THREE.Vector3(fox.pos.x, fy + 1.35, fox.pos.z);
  cam.target.x = damp(cam.target.x, follow.x, 6, dt);
  cam.target.z = damp(cam.target.z, follow.z, 6, dt);
  cam.target.y = damp(cam.target.y, follow.y, 4, dt);
  // Gentle auto-follow behind the fox when moving with keys
  const dist = cam.dist;
  const off = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(dist);
  const followPos = cam.target.clone().add(off);
  const gh = heightAt(followPos.x, followPos.z) + 0.8;
  if (followPos.y < gh) followPos.y = gh;

  // Title orbit
  const ta = t * 0.04 + 0.6;
  const titlePos = new THREE.Vector3(Math.sin(ta) * 30, 13, Math.cos(ta) * 30 - 4);
  const titleLook = new THREE.Vector3(0, 3, -4);

  let pos = followPos, look = cam.target;
  if (mode === 'title' || titleBlend < 1) {
    if (mode !== 'title') titleBlend = Math.min(1, titleBlend + dt / 2.8);
    const e = smoothstep(0, 1, titleBlend);
    pos = titlePos.lerp(followPos, e);
    look = titleLook.lerp(cam.target, e);
  }
  if (mode === 'cinematic' || (mode === 'ended' && game.s.status === 'won' && !game.s.freePlay)) {
    cinematicT += dt;
    const a = cinematicT * 0.18 + cam.yaw;
    const tree = stations.stations.tree.center;
    const cpos = new THREE.Vector3(tree.x + Math.sin(a) * 21, tree.y + 5 + Math.sin(cinematicT * 0.3) * 1.5, tree.z + Math.cos(a) * 21);
    const k = smoothstep(0, 2.5, cinematicT);
    pos = followPos.clone().lerp(cpos, k);
    look = cam.target.clone().lerp(tree.clone().add(new THREE.Vector3(0, 6, 0)), k);
    if (cinematicT > 7 && mode === 'cinematic') {
      mode = 'ended';
      ui.hideUI();
      ui.showEnd({ won: true, time: game.s.time, onNew: newGame, onContinue: () => {
        game.s.freePlay = true; ended = true; mode = 'play'; ui.showUI(); game.save();
      } });
    }
  }
  camera.position.copy(pos);
  camera.lookAt(look);
}

function updateMarker(dt, t, obj) {
  const key = obj && obj.target;
  const p = targetPos(key);
  let show = !!p && mode === 'play';
  if (p) {
    const d = Math.hypot(fox.pos.x - p.x, fox.pos.z - p.z);
    const r = key.startsWith('gate:') ? 3 : STATIONS[key].radius;
    if (d < r) show = false;
    const h = key === 'tree' ? 9 : key.startsWith('gate:') ? 3.6 : 3.2;
    marker.position.set(p.x, p.y + h + Math.sin(t * 2) * 0.15, p.z);
    markerGem.rotation.y = t * 1.5;
  }
  const s = damp(marker.scale.x, show ? 1 : 0.0001, 6, dt);
  marker.scale.setScalar(s);
  marker.visible = s > 0.01;
}

const MANUAL = new URLSearchParams(location.search).has('manual');
function frame() {
  if (MANUAL) return;
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  adaptQuality(raw);
  step(Math.min(raw, 0.05));
  render();
}

function render() {
  composer.render();
}

function step(dt) {
  elapsed += dt;
  const t = elapsed;

  if (mode === 'play') updatePlay(dt);
  else { fox.speed = damp(fox.speed, 0, 8, dt); if (mode === 'cinematic' || mode === 'ended') game.tick(dt, null); }

  fox.update(dt, heightAt(fox.pos.x, fox.pos.z));
  updateCamera(dt, t);
  const focus = mode === 'title' ? new THREE.Vector3(0, 0, -2) : fox.group.position;
  world.update(dt, t, game.s, focus, camera);
  const ctx = { ...ctxFor(), workingAt, nearKey: near ? (near.type === 'gate' ? 'gate:' + near.id : near.id) : null };
  stations.update(dt, t, ctx);
  particles.setScale(renderer.domElement.height / 1.6);
  particles.update(dt);
  const obj = mode === 'play' ? currentObjective() : null;
  updateMarker(dt, t, obj);
  if (mode === 'play' || mode === 'cinematic') ui.update(dt, { near: mode === 'play' ? near : null, workingAt, objective: obj && obj.text, gloom: world.gloom, camera });
  audio.update(dt, { night: world.nightFactor, gloom: world.gloom });

  gradePass.uniforms.uGloom.value = world.gloom;
  gradePass.uniforms.uTime.value = t;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  gradePass.uniforms.uAspect.value = w / h;
}
window.addEventListener('resize', onResize);
onResize();
window.addEventListener('beforeunload', () => { if (mode === 'play' && game.s.status !== 'lost') game.save(); });

// Idle while the tab is hidden: wisps keep working.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (mode === 'play') game.save(); return; }
  if (!hiddenAt || mode !== 'play') return;
  const away = Math.min(7200, (Date.now() - hiddenAt) / 1000);
  hiddenAt = 0;
  const { gained } = game.applyOffline(away);
  const parts = Object.entries(gained).filter(([, v]) => v >= 1).map(([k, v]) => `${Math.floor(v)} <i class="ic">${ICONS[k]}</i>`);
  if (parts.length && away > 20) ui.toast(`While you were away, the wisps gathered ${parts.join(' ')}`, 'big');
});

// Adaptive quality: if frames are slow, step down resolution, then grass density.
const quality = { level: 0, acc: 0, n: 0, cooldown: 4 };
function adaptQuality(rawDt) {
  if (MANUAL || mode === 'title') return;
  quality.cooldown -= rawDt;
  quality.acc += rawDt; quality.n++;
  if (quality.n < 90) return;
  const avg = quality.acc / quality.n;
  quality.acc = 0; quality.n = 0;
  if (quality.cooldown > 0 || avg < 1 / 40 || quality.level >= 4) return;
  quality.level++;
  quality.cooldown = 3;
  const pr = [Math.min(window.devicePixelRatio, 2), 1.5, 1.0, 1.0, 0.8][quality.level];
  renderer.setPixelRatio(Math.min(pr, window.devicePixelRatio));
  composer.setPixelRatio(Math.min(pr, window.devicePixelRatio));
  if (quality.level >= 3) world.grass.count = Math.floor(world.grass.count * 0.6);
  if (quality.level >= 4) { renderer.shadowMap.type = THREE.PCFShadowMap; bloom.enabled = false; }
  onResize();
}

stations.syncAll(game, false);
refreshColliders();
ui.showTitle({ hasSave: Game.hasSave(), onContinue: continueGame, onNew: newGame });
document.getElementById('loading')?.remove();
if (MANUAL) { step(0.016); render(); }
frame();

// Debug / test handle
window.__foxy = {
  game, fox, stations, world, camera,
  get mode() { return mode; },
  get near() { return near; },
  get workingAt() { return workingAt; },
  teleport(x, z) { fox.pos.set(x, 0, z); moveTarget = null; },
  give(res) { for (const k in res) game.gain(k, res[k]); },
  setDay(v) { world.dayTime = v; },
  cam,
  primary: doPrimary,
  keys,
  advance(seconds, dt = 1 / 30) { for (let x = 0; x < seconds; x += dt) step(dt); render(); },
  render,
  upgrade: doUpgrade,
};
