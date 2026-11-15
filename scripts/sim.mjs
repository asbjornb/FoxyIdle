// Headless simulation: the human is driven by a bot brain too. Checks invariants + balance.
import { Game } from '../src/game/core.js';
import { BotBrain } from '../src/game/bot.js';

const rounds = +(process.argv[2] || 20);
const stats = { won: 0, lost: 0, reasons: {}, captures: 0, deaths: 0, maxShare: 0, kills: 0 };
let errors = 0;
for (let r = 0; r < rounds; r++) {
  const g = new Game({ playerAnimal: 'fox' });
  g.human.brain = new BotBrain(g, g.human, 0);
  let t = 0;
  while (g.state === 'playing' && t < 400) {
    g.update(1 / 60); t += 1 / 60;
    for (const e of g.drainEvents()) {
      if (e.type === 'capture') stats.captures++;
      if (e.type === 'death') { stats.deaths++; stats.reasons[e.reason] = (stats.reasons[e.reason] || 0) + 1; }
    }
    // invariants: area counts match grid
    if (Math.random() < 0.01) {
      const counts = new Array(g.players.length + 1).fill(0);
      for (const o of g.owner) counts[o]++;
      for (const p of g.players) if (counts[p.code] !== p.area) { errors++; console.log('area mismatch', p.name, counts[p.code], p.area); }
      for (const p of g.players) for (const i of p.trail) if (g.trailGrid[i] !== p.code) { errors++; console.log('trail mismatch'); break; }
    }
  }
  const res = g.result;
  stats[res.won ? 'won' : 'lost']++;
  stats.reasons['end:' + res.reason] = (stats.reasons['end:' + res.reason] || 0) + 1;
  stats.maxShare = Math.max(stats.maxShare, ...g.players.map(p => p.maxArea / (g.N * g.N)));
  const top = g.ranking()[0];
  console.log(`round ${r}: ${res.reason} t=${res.time.toFixed(0)}s humanMax=${(res.maxShare*100).toFixed(1)}% top=${top.name} ${(top.share*100).toFixed(1)}%`);
}
console.log(JSON.stringify(stats, null, 1), 'errors', errors);
