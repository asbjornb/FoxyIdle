// Deterministic mechanics tests for the simulation core.
import assert from 'node:assert/strict';
import { Game } from '../src/game/core.js';

function freshGame() {
  const g = new Game({ playerAnimal: 'fox' });
  // park every bot far away, frozen, so scenarios are deterministic
  for (const p of g.players) { if (p.isBot) { p.brain = { think() {}, reset() {} }; p.speed = 0; } }
  return g;
}
function run(g, sec) { for (let t = 0; t < sec; t += 1 / 60) g.update(1 / 60); }
function clearBoard(g) {
  for (const p of g.players) if (p.alive) g.kill(p, null, 'reset');
  g.drainEvents();
}
function place(g, p, x, z, r = 3) {
  p.alive = true; p.area = 0; p.trail = []; p.path = [];
  p.minX = g.N; p.maxX = 0; p.minZ = g.N; p.maxZ = 0;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) g.setOwner((z + dz) * g.N + (x + dx), p, false);
  p.x = x + 0.5; p.z = z + 0.5; p.cell = z * g.N + x;
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓', name); }

test('loop outside territory captures the enclosed area', () => {
  const g = freshGame(); clearBoard(g); g.checkEnd = () => {};
  const h = g.human; place(g, h, 40, 40); h.speed = 8;
  const before = h.area;
  const legs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const a of legs) { h.angle = h.targetAngle = a; run(g, 1.3); }
  // head back home
  for (let t = 0; t < 3 && h.trail.length; t += 1 / 60) {
    h.targetAngle = Math.atan2(40.5 - h.z, 40.5 - h.x); g.update(1 / 60);
  }
  assert.ok(h.alive, 'still alive');
  assert.equal(h.trail.length, 0, 'trail consumed');
  assert.ok(h.area > before + 60, `area grew ${before} -> ${h.area}`);
  const ev = g.drainEvents().filter((e) => e.type === 'capture');
  assert.ok(ev.length >= 1, 'capture event emitted');
});

test('crossing an enemy trail eliminates its owner', () => {
  const g = freshGame(); clearBoard(g); g.checkEnd = () => {};
  const h = g.human; const b = g.players[1];
  place(g, h, 30, 60); place(g, b, 60, 30);
  // give the bot an exposed trail across x=30..50 at z=45
  for (let x = 30; x <= 50; x++) { const i = 45 * g.N + x; g.trailGrid[i] = b.code; b.trail.push(i); }
  h.speed = 8; h.angle = h.targetAngle = -Math.PI / 2; // move up (towards smaller z)
  run(g, 2.5);
  assert.equal(b.alive, false, 'bot eliminated');
  assert.equal(h.kills, 1, 'kill credited');
  assert.equal(b.area, 0, 'victim territory removed');
  assert.ok(h.alive, 'killer alive');
});

test('running into your own trail is fatal', () => {
  const g = freshGame(); clearBoard(g); g.checkEnd = () => {};
  const h = g.human; place(g, h, 70, 70); h.speed = 8;
  h.angle = h.targetAngle = 0; run(g, 1.5); // out to the right
  h.targetAngle = Math.PI / 2; run(g, 0.5);
  h.targetAngle = Math.PI; run(g, 0.4);
  h.targetAngle = -Math.PI / 2; run(g, 1.2); // cut back across own trail
  assert.equal(h.alive, false, 'human died on own trail');
});

test('players are safe from bumps inside their own territory', () => {
  const g = freshGame(); clearBoard(g); g.checkEnd = () => {};
  const h = g.human; const b = g.players[1];
  place(g, h, 50, 50, 5);
  b.alive = true; b.x = 50.5; b.z = 50.5 + 0.3; b.cell = 50 * g.N + 50; b.trail = [1]; // intruder head-to-head inside human land
  g.checkHeadCollisions();
  assert.ok(h.alive, 'owner survives');
  assert.equal(b.alive, false, 'intruder dies');
});

test('round ends with defeat when the human dies', () => {
  const g = freshGame();
  g.kill(g.human, g.players[1], 'cut');
  run(g, 0.05);
  assert.equal(g.state, 'lost');
  assert.equal(g.result.reason, 'eliminated');
});

test('round ends at the timer with the leader winning', () => {
  const g = freshGame();
  g.timeLeft = 0.02;
  const h = g.human; place(g, h, 70, 70, 6);
  run(g, 0.1);
  assert.equal(g.state, 'won');
  assert.equal(g.result.reason, 'timeout-lead');
});

test('area bookkeeping matches the grid after random play', () => {
  const g = new Game({}); g.checkEnd = () => {};
  run(g, 60);
  const counts = new Array(10).fill(0);
  for (const o of g.owner) counts[o]++;
  for (const p of g.players) assert.equal(counts[p.code], p.area, `${p.name} area`);
});

console.log(`\n${passed} tests passed`);
