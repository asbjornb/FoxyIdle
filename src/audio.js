// Gentle procedural soundscape: wind, a slow pad, birds by day, crickets by night, and chimes.
const PENT = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try { this.enabled = localStorage.getItem('foxy-sound') !== 'off'; } catch (e) { /* ignore */ }
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // Reverb (generated impulse)
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.master);
    this.fx = ctx.createGain();
    this.fx.gain.value = 0.5;
    this.fx.connect(this.master);
    this.fx.connect(this.verb);

    // Wind: filtered brown noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; nd[i] = last * 3.5; }
    const noise = ctx.createBufferSource();
    noise.buffer = nb; noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    noise.connect(lp).connect(this.windGain).connect(this.master);
    noise.start();
    this.windFilter = lp;

    // Pad
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.05;
    const padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass'; padLP.frequency.value = 900;
    this.padGain.connect(padLP).connect(this.master);
    padLP.connect(this.verb);
    this.padOsc = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(this.padGain);
      o.start();
      this.padOsc.push(o);
    }
    this.chords = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 64]];
    this.chordIdx = 0;
    this.setChord(0);
    this.nextChord = 14;
    this.nextBird = 3;
    this.nextCricket = 1;
    this.t = 0;
  }

  setChord(i) {
    const now = this.ctx.currentTime;
    this.chords[i].forEach((n, k) => {
      this.padOsc[k].frequency.cancelScheduledValues(now);
      this.padOsc[k].frequency.setTargetAtTime(midi(n), now, 1.5);
      this.padOsc[k].detune.value = (k - 1.5) * 4;
    });
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('foxy-sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.2);
  }

  update(dt, { night = 0, gloom = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    const now = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.08 + Math.sin(this.t * 0.2) * 0.04 + gloom * 0.12, now, 0.5);
    this.windFilter.frequency.setTargetAtTime(380 + Math.sin(this.t * 0.13) * 160 - gloom * 150, now, 0.5);
    this.padGain.gain.setTargetAtTime(0.05 * (1 - gloom * 0.6), now, 1);
    this.nextChord -= dt;
    if (this.nextChord < 0) { this.chordIdx = (this.chordIdx + 1) % this.chords.length; this.setChord(this.chordIdx); this.nextChord = 14; }
    this.nextBird -= dt;
    if (this.nextBird < 0) { if (night < 0.5 && gloom < 0.6) this.bird(); this.nextBird = 3 + Math.random() * 7; }
    this.nextCricket -= dt;
    if (this.nextCricket < 0) { if (night > 0.5) this.cricket(); this.nextCricket = 0.6 + Math.random() * 1.5; }
  }

  tone(freq, { type = 'sine', dur = 0.6, vol = 0.2, at = 0, attack = 0.005, dest } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || this.fx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  chime(kind = 'berries') {
    const base = { berries: 72, wood: 67, spirit: 79, mana: 84, garden: 76 }[kind] || 72;
    const n = base + PENT[Math.floor(Math.random() * PENT.length)];
    this.tone(midi(n), { vol: 0.12, dur: 1.2 });
    this.tone(midi(n + 12), { vol: 0.04, dur: 0.8, type: 'triangle' });
  }

  pluck() {
    const n = 79 + PENT[Math.floor(Math.random() * PENT.length)];
    this.tone(midi(n), { vol: 0.035, dur: 0.25, type: 'triangle' });
  }

  success() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(67 + s), { vol: 0.1, dur: 1.4, at: i * 0.09 }));
  }

  grand() {
    [0, 7, 12, 16, 19, 24, 28].forEach((s, i) => {
      this.tone(midi(55 + s), { vol: 0.09, dur: 3, at: i * 0.16, attack: 0.05 });
      this.tone(midi(67 + s), { vol: 0.04, dur: 2.5, at: i * 0.16 + 0.05, type: 'triangle' });
    });
  }

  sad() {
    [0, -3, -7, -12].forEach((s, i) => this.tone(midi(64 + s), { vol: 0.08, dur: 2.5, at: i * 0.35, attack: 0.1, type: 'triangle' }));
  }

  deny() { this.tone(midi(50), { vol: 0.06, dur: 0.25, type: 'triangle' }); }

  bird() {
    const t0 = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1500;
    for (let i = 0; i < notes; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const s = t0 + i * 0.12;
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.1);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.025, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.11);
      const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = Math.random() * 2 - 1; o.connect(g).connect(pan).connect(this.fx); } else o.connect(g).connect(this.fx);
      o.start(s); o.stop(s + 0.15);
    }
  }

  cricket() {
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const s = t0 + i * 0.05;
      o.frequency.value = 4400 + Math.random() * 300;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.008, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
      o.connect(g).connect(this.master);
      o.start(s); o.stop(s + 0.05);
    }
  }
}
