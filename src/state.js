// Pure game-state + economy logic. No rendering here, so it can be simulated headless.
import {
  RESOURCES, AREAS, STATIONS, PRODUCERS, MAX_LEVEL, TREE_STAGES, WISP, HARMONY,
  upgradeCost, wispCost, stationCycle, stationYield,
} from './config.js';

const SAVE_KEY = 'foxy-idle-save-v1';

export function newState() {
  const res = {};
  for (const k in RESOURCES) res[k] = 0;
  const levels = {};
  const unlocked = {};
  for (const id in STATIONS) {
    levels[id] = 1;
    unlocked[id] = !STATIONS[id].unlock;
  }
  const wisps = {};
  for (const id of PRODUCERS) wisps[id] = 0;
  return {
    res,
    totals: { ...res },
    levels,
    unlocked,
    areas: { east: false, west: false, north: false },
    treeStage: 0,
    wisps,
    wispCount: 0,
    harmony: HARMONY.start,
    vitality: 0,
    time: 0,
    status: 'playing', // 'playing' | 'won' | 'lost'
    freePlay: false,
    work: { station: null, t: 0 },
    wispAcc: {},
    warned: false,
  };
}

export class Game {
  constructor() {
    this.s = newState();
    this.listeners = {};
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((fn) => fn(data)); }

  // ---------- queries ----------
  canAfford(cost) {
    for (const k in cost) if ((this.s.res[k] || 0) < cost[k] - 1e-9) return false;
    return true;
  }

  spend(cost) {
    for (const k in cost) this.s.res[k] -= cost[k];
  }

  gain(k, amt) {
    this.s.res[k] += amt;
    this.s.totals[k] += amt;
  }

  areaOpen(areaId) { return !areaId || this.s.areas[areaId]; }

  stationReachable(id) { return this.areaOpen(STATIONS[id].area); }

  stationActive(id) { return this.stationReachable(id) && this.s.unlocked[id]; }

  harmonyMult() { return 0.6 + 0.6 * (this.s.harmony / HARMONY.max); }

  decayRate() {
    const opened = Object.values(this.s.areas).filter(Boolean).length;
    return HARMONY.baseDecay + HARMONY.perAreaDecay * opened + HARMONY.perStageDecay * this.s.treeStage;
  }

  // Ratio of rates per second for UI.
  stationRate(id) {
    const st = STATIONS[id];
    if (!st.cycle) return 0;
    const lvl = this.s.levels[id];
    return stationYield(id, lvl) / stationCycle(id, lvl);
  }

  incomeRates() {
    const out = {};
    for (const k in RESOURCES) out[k] = 0;
    const m = this.harmonyMult();
    for (const id of PRODUCERS) {
      const st = STATIONS[id];
      if (!st.resource || !this.stationActive(id)) continue;
      out[st.resource] += this.stationRate(id) * WISP.efficiency * this.s.wisps[id] * m;
    }
    return out;
  }

  nextTreeCost() {
    return TREE_STAGES[this.s.treeStage]?.cost || null;
  }

  // What the primary action at a station would do: { label, cost, kind, enabled }
  primaryAction(id) {
    const s = this.s;
    const st = STATIONS[id];
    if (!this.stationReachable(id)) return null;
    if (!s.unlocked[id]) {
      return { kind: 'unlock', label: 'Plant the garden', cost: st.unlock, enabled: this.canAfford(st.unlock) };
    }
    if (id === 'tree') {
      const stage = TREE_STAGES[s.treeStage];
      if (!stage) return { kind: 'done', label: 'The Great Tree is whole', cost: null, enabled: false };
      return { kind: 'offer', label: stage.name, cost: stage.cost, enabled: this.canAfford(stage.cost) };
    }
    if (id === 'hollow') {
      if (s.wispCount >= WISP.max) return { kind: 'done', label: 'All wisps have come', cost: null, enabled: false };
      const cost = wispCost(s.wispCount);
      return { kind: 'wisp', label: `Call a wisp (${s.wispCount}/${WISP.max})`, cost, enabled: this.canAfford(cost) };
    }
    return null;
  }

  upgradeAction(id) {
    const st = STATIONS[id];
    if (!st.upgradeBase || !this.stationActive(id)) return null;
    const lvl = this.s.levels[id];
    if (lvl >= MAX_LEVEL) return { label: 'Fully grown', cost: null, enabled: false, max: true };
    const cost = upgradeCost(id, lvl);
    return { label: `Nurture to level ${lvl + 1}`, cost, enabled: this.canAfford(cost) };
  }

  // ---------- actions ----------
  doPrimary(id) {
    if (this.s.status === 'lost') return false;
    const a = this.primaryAction(id);
    if (!a || !a.enabled) return false;
    const s = this.s;
    this.spend(a.cost);
    if (a.kind === 'unlock') {
      s.unlocked[id] = true;
      s.vitality = Math.min(100, s.vitality + 3);
      this.emit('stationUnlocked', { id });
    } else if (a.kind === 'offer') {
      s.treeStage += 1;
      s.harmony = Math.min(HARMONY.max, s.harmony + HARMONY.treeStageBonus);
      s.vitality = Math.min(100, s.vitality + 10);
      this.emit('treeStage', { stage: s.treeStage });
      if (s.treeStage >= TREE_STAGES.length && s.status === 'playing') {
        s.status = 'won';
        this.emit('won', {});
      }
    } else if (a.kind === 'wisp') {
      // Assign to the active producer with the fewest wisps (ties: prefer garden for harmony).
      const candidates = PRODUCERS.filter((p) => this.stationActive(p));
      candidates.sort((a2, b2) => (s.wisps[a2] - s.wisps[b2]) || ((b2 === 'garden') - (a2 === 'garden')));
      const target = candidates[0];
      s.wisps[target] += 1;
      s.wispCount += 1;
      this.emit('wisp', { station: target });
    }
    return true;
  }

  doUpgrade(id) {
    if (this.s.status === 'lost') return false;
    const a = this.upgradeAction(id);
    if (!a || !a.enabled) return false;
    this.spend(a.cost);
    this.s.levels[id] += 1;
    this.s.vitality = Math.min(100, this.s.vitality + 2);
    this.emit('upgraded', { id, level: this.s.levels[id] });
    return true;
  }

  unlockArea(areaId) {
    if (this.s.status === 'lost') return false;
    const a = AREAS[areaId];
    if (this.s.areas[areaId] || !this.canAfford(a.cost)) return false;
    this.spend(a.cost);
    this.s.areas[areaId] = true;
    this.s.harmony = Math.min(HARMONY.max, this.s.harmony + HARMONY.areaBonus);
    this.s.vitality = Math.min(100, this.s.vitality + 5);
    this.emit('areaUnlocked', { id: areaId });
    return true;
  }

  // Applies a completed work cycle at a station (by player or wisp fraction).
  produce(id, fraction, byPlayer) {
    const st = STATIONS[id];
    const lvl = this.s.levels[id];
    const m = this.harmonyMult();
    if (st.resource) {
      const amt = stationYield(id, lvl) * fraction * m;
      this.gain(st.resource, amt);
      if (byPlayer) this.emit('gathered', { id, resource: st.resource, amount: amt });
    }
    if (st.harmony) {
      const h = st.harmony * (1 + 0.35 * (lvl - 1)) * fraction;
      this.s.harmony = Math.min(HARMONY.max, this.s.harmony + h);
      if (byPlayer && id === 'garden') this.emit('tended', { id, amount: h });
    }
    if (st.vitality) {
      this.s.vitality = Math.min(100, this.s.vitality + st.vitality * fraction);
    }
  }

  // Advance simulation. `workingAt` = station id the fox is interacting with, or null.
  tick(dt, workingAt) {
    const s = this.s;
    if (s.status === 'lost') return;
    s.time += dt;

    // Player work
    if (workingAt && this.stationActive(workingAt) && STATIONS[workingAt].cycle) {
      if (s.work.station !== workingAt) s.work = { station: workingAt, t: 0 };
      s.work.t += dt;
      const cyc = stationCycle(workingAt, s.levels[workingAt]);
      while (s.work.t >= cyc) {
        s.work.t -= cyc;
        this.produce(workingAt, 1, true);
      }
    } else {
      s.work = { station: null, t: 0 };
    }

    // Wisps: continuous production
    for (const id of PRODUCERS) {
      const n = s.wisps[id];
      if (!n || !this.stationActive(id)) continue;
      const cyc = stationCycle(id, s.levels[id]);
      this.produce(id, (dt / cyc) * WISP.efficiency * n, false);
    }

    // Harmony decay (paused once the tree is restored)
    if (s.status === 'playing') {
      s.harmony -= this.decayRate() * dt;
      if (s.harmony <= HARMONY.lowWarn && !s.warned) {
        s.warned = true;
        this.emit('lowHarmony', {});
      }
      if (s.harmony > HARMONY.lowWarn + 15) s.warned = false;
      if (s.harmony <= 0) {
        s.harmony = 0;
        s.status = 'lost';
        this.emit('lost', {});
      }
    } else {
      s.harmony = Math.min(HARMONY.max, s.harmony + dt * 0.5);
    }
  }

  workProgress() {
    const s = this.s;
    if (!s.work.station) return 0;
    return s.work.t / stationCycle(s.work.station, s.levels[s.work.station]);
  }

  // ---------- persistence ----------
  save() {
    try {
      const data = { ...this.s, work: { station: null, t: 0 }, savedAt: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  static hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return d && d.status === 'playing' || (d && d.status === 'won');
    } catch (e) { return false; }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      const base = newState();
      this.s = { ...base, ...d, res: { ...base.res, ...d.res }, levels: { ...base.levels, ...d.levels },
        unlocked: { ...base.unlocked, ...d.unlocked }, areas: { ...base.areas, ...d.areas },
        wisps: { ...base.wisps, ...d.wisps }, totals: { ...base.totals, ...d.totals } };
      // Offline progress: wisps keep working while away (max 2 hours), harmony is held steady.
      const away = Math.min(7200, Math.max(0, (Date.now() - (d.savedAt || Date.now())) / 1000));
      const before = { ...this.s.res };
      if (away > 5 && this.s.wispCount > 0) {
        const h = this.s.harmony;
        for (const id of PRODUCERS) {
          const n = this.s.wisps[id];
          if (!n || !this.stationActive(id)) continue;
          const cyc = stationCycle(id, this.s.levels[id]);
          this.produce(id, (away / cyc) * WISP.efficiency * n, false);
        }
        this.s.harmony = Math.max(h, Math.min(HARMONY.max, this.s.harmony));
      }
      const gained = {};
      for (const k in before) gained[k] = this.s.res[k] - before[k];
      return { away, gained };
    } catch (e) {
      return null;
    }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
}
