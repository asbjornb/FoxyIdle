import { RESOURCES, RESOURCE_ORDER, STATIONS, AREAS, TREE_STAGES, MAX_LEVEL, HARMONY, stationCycle, stationYield } from './config.js';

export const ICONS = {
  berries: `<svg viewBox="0 0 24 24"><path d="M12 4c1-2 3-2.5 4.5-2" stroke="#5e9a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 5c-2-1.5-4.5-1-5.5.5 2 .5 3.5.3 5.5-.5z" fill="#6fb04a"/><circle cx="8.5" cy="13" r="4.2" fill="#e2475b"/><circle cx="15.5" cy="13" r="4.2" fill="#d23a50"/><circle cx="12" cy="18" r="4.2" fill="#c8304a"/><circle cx="7.2" cy="11.6" r="1.1" fill="#ffb3bf"/><circle cx="14.2" cy="11.6" r="1.1" fill="#ffb3bf"/></svg>`,
  wood: `<svg viewBox="0 0 24 24"><rect x="3" y="9" width="15" height="7" rx="3.5" fill="#a26f43"/><ellipse cx="18" cy="12.5" rx="3" ry="3.5" fill="#e3c08e"/><ellipse cx="18" cy="12.5" rx="1.5" ry="1.8" fill="none" stroke="#b98a55" stroke-width="0.9"/><path d="M6 10.5h7M5 14h9" stroke="#7d5232" stroke-width="0.9" stroke-linecap="round"/><path d="M9 9 7 5.5" stroke="#7d5232" stroke-width="1.4" stroke-linecap="round"/><circle cx="6.6" cy="5" r="1.4" fill="#6fb04a"/></svg>`,
  spirit: `<svg viewBox="0 0 24 24"><defs><radialGradient id="gs" cx="50%" cy="60%" r="60%"><stop offset="0" stop-color="#fff6d0"/><stop offset="1" stop-color="#f2b84a"/></radialGradient></defs><path d="M12 2.5c3 4 6.5 6.5 6.5 11a6.5 6.5 0 0 1-13 0c0-2.6 1.4-4.2 2.6-5.4.3 1.8 1.2 2.9 2.4 3.3C10 8.6 10.6 5.3 12 2.5z" fill="url(#gs)"/><circle cx="12" cy="15" r="2.2" fill="#fffbe8"/></svg>`,
  mana: `<svg viewBox="0 0 24 24"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4ecff"/><stop offset="1" stop-color="#4d8ff0"/></linearGradient></defs><path d="M12 2 18 11 12 22 6 11z" fill="url(#gm)"/><path d="M12 2 14.5 11 12 22 9.5 11z" fill="#eaf6ff" opacity=".55"/><circle cx="18.5" cy="5" r="1.1" fill="#cfe8ff"/><circle cx="5" cy="17" r=".8" fill="#cfe8ff"/></svg>`,
  harmony: `<svg viewBox="0 0 24 24"><path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z" fill="#8fd16a"/><path d="M5 19 15 9" stroke="#3e7a2a" stroke-width="1.4" stroke-linecap="round"/></svg>`,
};

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export function fmt(n) {
  if (n < 10) return (Math.floor(n * 10) / 10).toFixed(n < 10 && n % 1 ? 1 : 0).replace(/\.0$/, '');
  if (n < 1000) return Math.floor(n).toString();
  return (n / 1000).toFixed(1) + 'k';
}

function costHTML(cost, game) {
  if (!cost) return '';
  return Object.entries(cost).map(([k, v]) => {
    const ok = game.s.res[k] >= v - 1e-9;
    return `<span class="cost ${ok ? '' : 'short'}"><i class="ic">${ICONS[k]}</i>${Math.ceil(v)}</span>`;
  }).join('');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.handlers = {};
    this.build();
    this.lastCardKey = '';
    this.floaters = [];
  }

  on(ev, fn) { this.handlers[ev] = fn; }
  fire(ev, ...a) { if (this.handlers[ev]) this.handlers[ev](...a); }

  build() {
    const r = this.root;
    // Resources
    this.resPanel = el('div', 'panel res-panel');
    this.resRows = {};
    for (const k of RESOURCE_ORDER) {
      const row = el('div', 'res-row hidden');
      row.innerHTML = `<i class="ic big">${ICONS[k]}</i><div class="res-meta"><div class="res-name">${RESOURCES[k].name}<span class="kind">${RESOURCES[k].kind}</span></div><div class="res-amt"><b>0</b><span class="rate"></span></div></div>`;
      this.resPanel.appendChild(row);
      this.resRows[k] = { row, amt: row.querySelector('b'), rate: row.querySelector('.rate') };
    }
    r.appendChild(this.resPanel);

    // Harmony + tree progress
    this.topPanel = el('div', 'top-center');
    this.topPanel.innerHTML = `
      <div class="harmony panel">
        <i class="ic">${ICONS.harmony}</i>
        <div class="harmony-body">
          <div class="harmony-label"><span>Harmony</span><span class="harmony-val">70</span></div>
          <div class="bar"><div class="fill"></div><div class="shine"></div></div>
        </div>
      </div>
      <div class="tree-pips">${TREE_STAGES.map((s, i) => `<span class="pip" title="${s.name}"><svg viewBox="0 0 24 24"><path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/></svg></span>`).join('')}<span class="tree-label">The Great Tree</span></div>`;
    r.appendChild(this.topPanel);
    this.hFill = this.topPanel.querySelector('.fill');
    this.hVal = this.topPanel.querySelector('.harmony-val');
    this.hBox = this.topPanel.querySelector('.harmony');
    this.pips = [...this.topPanel.querySelectorAll('.pip')];

    // Top-right buttons
    this.btns = el('div', 'corner-btns');
    this.btns.innerHTML = `
      <button class="round" data-act="sound" title="Sound (M)"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path class="wave" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></button>
      <button class="round" data-act="help" title="How to play (H)"><svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="15" font-family="Fraunces, serif" fill="currentColor">?</text></svg></button>`;
    this.btns.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) this.fire(b.dataset.act);
    });
    r.appendChild(this.btns);

    // Objective
    this.objective = el('div', 'panel objective');
    this.objective.innerHTML = `<div class="obj-title">Next</div><div class="obj-text"></div>`;
    this.objText = this.objective.querySelector('.obj-text');
    r.appendChild(this.objective);

    // Station card
    this.card = el('div', 'panel card hidden');
    r.appendChild(this.card);
    this.card.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled) this.fire(b.dataset.act);
    });

    // Controls hint
    this.hint = el('div', 'hint', `<span><kbd>WASD</kbd> move</span><span><kbd>Shift</kbd> run</span><span><kbd>Drag</kbd> look</span><span><kbd>Click</kbd> walk to</span><span><kbd>E</kbd> act</span><span><kbd>R</kbd> nurture</span>`);
    r.appendChild(this.hint);

    // Toasts
    this.toasts = el('div', 'toasts');
    r.appendChild(this.toasts);
    // Floating text layer
    this.floatLayer = el('div', 'float-layer');
    r.appendChild(this.floatLayer);
    // Gloom vignette
    this.gloomEl = el('div', 'gloom');
    r.appendChild(this.gloomEl);
  }

  setSound(on) {
    this.btns.querySelector('[data-act="sound"]').classList.toggle('muted', !on);
  }

  toast(text, kind = '') {
    const t = el('div', `toast ${kind}`, text);
    this.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); }, 3800);
    setTimeout(() => t.remove(), 4600);
  }

  floatText(worldPos, text, color, camera, size = 1) {
    const e = el('div', 'floater', text);
    e.style.color = color;
    e.style.fontSize = `${18 * size}px`;
    this.floatLayer.appendChild(e);
    this.floaters.push({ e, pos: worldPos.clone(), t: 0 });
  }

  updateFloaters(dt, camera) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t > 1.6) { f.e.remove(); this.floaters.splice(i, 1); continue; }
      const p = f.pos.clone();
      p.y += f.t * 0.9;
      p.project(camera);
      const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
      const a = f.t < 0.2 ? f.t / 0.2 : Math.max(0, 1 - (f.t - 1.0) / 0.6);
      f.e.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${0.8 + Math.min(1, f.t * 5) * 0.2})`;
      f.e.style.opacity = p.z < 1 ? a : 0;
    }
  }

  update(dt, ctx) {
    const g = this.game, s = g.s;
    // resources
    const rates = g.incomeRates();
    for (const k of RESOURCE_ORDER) {
      const R = this.resRows[k];
      const show = s.totals[k] > 0 || s.res[k] > 0 || (k === 'berries' || k === 'wood');
      R.row.classList.toggle('hidden', !show);
      R.amt.textContent = fmt(s.res[k]);
      R.rate.textContent = rates[k] > 0.005 ? `+${rates[k].toFixed(rates[k] < 1 ? 2 : 1)}/s` : '';
    }
    // harmony
    const h = s.harmony;
    this.hFill.style.width = `${h}%`;
    this.hVal.textContent = Math.round(h);
    this.hBox.classList.toggle('low', h < HARMONY.lowWarn && s.status === 'playing');
    const hue = 90 + (h - 50) * 0.5;
    this.hFill.style.background = `linear-gradient(90deg, hsl(${hue - 70}, 30%, 45%), hsl(${hue}, ${40 + h * 0.3}%, ${50 + h * 0.1}%))`;
    this.pips.forEach((p, i) => p.classList.toggle('on', i < s.treeStage));
    this.gloomEl.style.opacity = ctx.gloom.toFixed(3);

    this.objText.innerHTML = ctx.objective || '';
    this.objective.classList.toggle('hidden', !ctx.objective);
    this.updateCard(ctx);
    this.updateFloaters(dt, ctx.camera);
  }

  hideHint() { this.hint.classList.add('fade'); }

  updateCard(ctx) {
    const g = this.game;
    const near = ctx.near;
    if (!near) { this.card.classList.add('hidden'); this.lastCardKey = ''; return; }
    this.card.classList.remove('hidden');
    let html = '';
    if (near.type === 'gate') {
      const a = AREAS[near.id];
      const open = g.s.areas[near.id];
      if (open) { this.card.classList.add('hidden'); return; }
      const ok = g.canAfford(a.cost);
      html = `<div class="card-head"><div><div class="card-title">${a.name}</div><div class="card-sub">Shrouded in mist</div></div></div>
        <div class="card-blurb">${a.blurb}</div>
        <div class="card-actions"><button data-act="primary" class="act ${ok ? 'ready' : ''}" ${ok ? '' : 'disabled'}><kbd>E</kbd><span class="lbl">Clear the way</span><span class="costs">${costHTML(a.cost, g)}</span></button></div>`;
    } else {
      const id = near.id;
      const st = STATIONS[id];
      const s = g.s;
      const lvl = s.levels[id];
      const prim = g.primaryAction(id);
      const up = g.upgradeAction(id);
      const unlocked = s.unlocked[id];
      let sub = '';
      if (st.resource) sub = `<span class="tag" style="--c:${RESOURCES[st.resource].color}">${RESOURCES[st.resource].kind}</span>`;
      else if (id === 'garden') sub = `<span class="tag" style="--c:#8fd16a">Care</span>`;
      else if (id === 'hollow') sub = `<span class="tag" style="--c:#9fffe0">Magical</span>`;
      else sub = `<span class="tag" style="--c:#ffd36b">Stage ${s.treeStage} / ${TREE_STAGES.length}</span>`;
      const levelPips = st.upgradeBase && unlocked ? `<div class="lvl">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
      let info = '';
      if (unlocked && st.cycle) {
        const per = st.resource ? `~${Math.round(stationYield(id, lvl) * g.harmonyMult())} ${RESOURCES[st.resource].name.toLowerCase()}` : `+${(st.harmony * (1 + 0.35 * (lvl - 1))).toFixed(1)} harmony`;
        const working = ctx.workingAt === id;
        info = `<div class="work ${working ? 'on' : ''}"><div class="work-label">${working ? st.verb + '…' : 'Stand still here to begin'}<span>${per} / ${stationCycle(id, lvl).toFixed(1)}s</span></div><div class="bar"><div class="fill work-fill"></div></div></div>`;
        if (s.wisps[id]) info += `<div class="wisp-note">${s.wisps[id]} wisp${s.wisps[id] > 1 ? 's' : ''} tending here</div>`;
      }
      if (id === 'tree') {
        const stage = TREE_STAGES[s.treeStage];
        info = `<div class="card-blurb em">${stage ? `Next: <b>${stage.name}</b>` : 'The glade is whole again.'}</div>`;
      }
      if (id === 'hollow') info = `<div class="card-blurb em">Each wisp gathers at ${Math.round(40)}% of your pace, forever.</div>`;
      let actions = '';
      if (prim) {
        if (prim.kind === 'done') actions += `<button class="act" disabled><span class="lbl">${prim.label}</span></button>`;
        else actions += `<button data-act="primary" class="act ${prim.enabled ? 'ready' : ''}" ${prim.enabled ? '' : 'disabled'}><kbd>E</kbd><span class="lbl">${prim.label}</span><span class="costs">${costHTML(prim.cost, g)}</span></button>`;
      }
      if (up) {
        if (up.max) actions += `<button class="act" disabled><span class="lbl">${up.label}</span></button>`;
        else actions += `<button data-act="upgrade" class="act ${up.enabled ? 'ready' : ''}" ${up.enabled ? '' : 'disabled'}><kbd>R</kbd><span class="lbl">${up.label}</span><span class="costs">${costHTML(up.cost, g)}</span></button>`;
      }
      html = `<div class="card-head"><div><div class="card-title">${st.name}</div><div class="card-sub">${sub}</div></div>${levelPips}</div>
        <div class="card-blurb">${st.blurb}</div>${info}<div class="card-actions">${actions}</div>`;
    }
    // Only rewrite DOM when content changes (keeps buttons clickable)
    if (html !== this.lastCardKey) {
      this.card.innerHTML = html;
      this.lastCardKey = html;
    }
    const wf = this.card.querySelector('.work-fill');
    if (wf) wf.style.width = `${(ctx.workingAt === near.id ? g.workProgress() : 0) * 100}%`;
  }

  // ----- overlays -----
  showTitle({ hasSave, onContinue, onNew }) {
    const o = el('div', 'overlay title-screen');
    o.innerHTML = `
      <div class="title-inner">
        <div class="title-kicker">a gentle idle tale</div>
        <h1>Foxglade</h1>
        <p class="title-text">The heart of the glade has withered. Gather, tend and listen, and help one small fox bring the Great Tree back to life before the gloom settles in.</p>
        <div class="title-btns">
          ${hasSave ? '<button class="big primary" data-a="continue">Continue</button>' : ''}
          <button class="big ${hasSave ? '' : 'primary'}" data-a="new">${hasSave ? 'New journey' : 'Begin'}</button>
        </div>
        <div class="title-foot">Physical · Spiritual · Magical</div>
      </div>`;
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      o.classList.add('out');
      setTimeout(() => o.remove(), 900);
      if (b.dataset.a === 'continue') onContinue(); else onNew();
    });
    document.body.appendChild(o);
    this.root.classList.add('hidden-ui');
  }

  showUI() { this.root.classList.remove('hidden-ui'); }
  hideUI() { this.root.classList.add('hidden-ui'); }

  showEnd({ won, time, onNew, onContinue }) {
    const o = el('div', `overlay end-screen ${won ? 'won' : 'lost'}`);
    const mins = Math.floor(time / 60), secs = Math.floor(time % 60);
    const s = this.game.s;
    o.innerHTML = `
      <div class="end-inner panel">
        <div class="title-kicker">${won ? 'the glade remembers' : 'the glade falls quiet'}</div>
        <h2>${won ? 'The Great Tree Wakes' : 'The Gloom Settles'}</h2>
        <p>${won ? 'Light pours from the old heartwood and the whole glade sighs awake. The fox curls up among the roots, content.' : 'Without care, the colours drained away and the forest fell silent. But seeds remember the sun. Try again?'}</p>
        <div class="stats">
          <div><b>${mins}:${String(secs).padStart(2, '0')}</b><span>time</span></div>
          <div><b>${s.treeStage}/${TREE_STAGES.length}</b><span>tree stages</span></div>
          <div><b>${fmt(Object.values(s.totals).reduce((a, b) => a + b, 0))}</b><span>gathered</span></div>
          <div><b>${s.wispCount}</b><span>wisps</span></div>
        </div>
        <div class="title-btns">
          ${won ? '<button class="big primary" data-a="continue">Keep wandering</button>' : ''}
          <button class="big ${won ? '' : 'primary'}" data-a="new">${won ? 'Begin anew' : 'Try again'}</button>
        </div>
      </div>`;
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      o.classList.add('out');
      setTimeout(() => o.remove(), 700);
      if (b.dataset.a === 'continue') onContinue(); else onNew();
    });
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('in'));
  }

  toggleHelp() {
    if (this.helpEl) { this.helpEl.remove(); this.helpEl = null; return; }
    const o = el('div', 'overlay help-screen');
    o.innerHTML = `<div class="end-inner panel help">
      <h2>How to play</h2>
      <ul>
        <li><b>Move</b> with WASD or the arrow keys (hold Shift to run), or click the ground to walk there. Drag to turn the camera, scroll to zoom.</li>
        <li><b>Stand still</b> at a station and the fox gets to work on its own, gathering ${ICONS.berries} berries, ${ICONS.wood} wood, ${ICONS.spirit} spirit and ${ICONS.mana} mana.</li>
        <li><b>E</b> clears paths into the misty areas, plants the garden and makes offerings to the Great Tree. <b>R</b> nurtures a station so it yields more.</li>
        <li><b>Harmony</b> fades slowly as time passes, and faster as the glade grows. Tend the Meadow Garden to restore it. Higher harmony also means richer harvests. If it reaches zero, the gloom wins.</li>
        <li>Call <b>wisps</b> at the Wisp Circle. They keep tending stations while you're elsewhere, even when the game is closed.</li>
        <li>Restore all five stages of <b>the Great Tree</b> to win.</li>
      </ul>
      <div class="title-btns"><button class="big primary">Back to the glade</button></div></div>`;
    o.addEventListener('click', (e) => { if (e.target.closest('button') || e.target === o) this.toggleHelp(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('in'));
    this.helpEl = o;
  }
}
