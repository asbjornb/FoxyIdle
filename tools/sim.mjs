import { Game } from '../src/state.js';
import { STATIONS, AREAS, TREE_STAGES } from '../src/config.js';
globalThis.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
const g = new Game(); const s = g.s;
const resStation = { berries:'berries', wood:'wood', spirit:'shrine', mana:'pool' };
let cur = null, travel = 0, log = [];
g.on('treeStage', e => log.push(`${(s.time/60).toFixed(1)}m tree ${e.stage}`));
g.on('areaUnlocked', e => log.push(`${(s.time/60).toFixed(1)}m area ${e.id}`));
g.on('wisp', e => log.push(`${(s.time/60).toFixed(1)}m wisp->${e.station}`));
g.on('upgraded', e => log.push(`${(s.time/60).toFixed(1)}m up ${e.id} ${e.level}`));
function goal() {
  if (!s.unlocked.garden) return ['p','garden', STATIONS.garden.unlock];
  if (!s.areas.east) return ['a','east', AREAS.east.cost];
  if (s.treeStage < 1) return ['p','tree', g.nextTreeCost()];
  if (!s.areas.west) return ['a','west', AREAS.west.cost];
  if (!s.areas.north) return ['a','north', AREAS.north.cost];
  for (const id of ['berries','wood','shrine','pool','garden']) { const u = g.upgradeAction(id); if (u && !u.max && s.levels[id] < 3) return ['u', id, u.cost]; }
  const w = g.primaryAction('hollow'); if (w && w.kind==='wisp' && s.wispCount < 4) return ['p','hollow', w.cost];
  if (s.treeStage < TREE_STAGES.length) return ['p','tree', g.nextTreeCost()];
}
const dt = 0.1; let minH = 100;
while (s.status === 'playing' && s.time < 3600) {
  const [k,id,cost] = goal();
  if (g.canAfford(cost)) { k==='a' ? g.unlockArea(id) : k==='u' ? g.doUpgrade(id) : g.doPrimary(id); continue; }
  let target;
  if (s.unlocked.garden && s.harmony < 35) target = 'garden';
  else if (cur === 'garden' && s.harmony < 75) target = 'garden';
  else { let worst=null, wv=-1; for (const r in cost) { const need = cost[r]-s.res[r]; if (need>wv){wv=need;worst=r;} } target = resStation[worst]; }
  if (target !== cur) { cur = target; travel = 5; }
  if (travel > 0) { travel -= dt; g.tick(dt, null); } else g.tick(dt, cur);
  minH = Math.min(minH, s.harmony);
}
console.log(log.join('\n')); console.log('status', s.status, 'time', (s.time/60).toFixed(1), 'min harmony', minH.toFixed(1));
// idle test: do nothing
const g2 = new Game(); let t=0; while (g2.s.status==='playing' && t<3600){g2.tick(0.5,null);t+=0.5;} console.log('idle lose after', (t/60).toFixed(1),'m');
