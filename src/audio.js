// Tiny WebAudio synth for game feedback — no asset files needed.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('ff-muted') === '1'; } catch { /* ignore */ }
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('ff-muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  capture(size) {
    const notes = [523, 659, 784, 1047, 1319];
    const n = Math.min(notes.length, 2 + Math.floor(Math.log2(1 + size / 15)));
    for (let i = 0; i < n; i++) this.tone(notes[i], 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.055 });
    this.tone(notes[n - 1] * 2, 0.4, { type: 'sine', vol: 0.06, delay: n * 0.055 });
  }
  leave() { this.tone(330, 0.12, { type: 'sine', vol: 0.06, slide: 1.5 }); }
  kill() {
    this.noise(0.25, { vol: 0.25, freq: 900 });
    this.tone(880, 0.18, { type: 'square', vol: 0.08, slide: 0.5 });
    this.tone(1320, 0.3, { type: 'triangle', vol: 0.12, delay: 0.08 });
  }
  enemyDeath() { this.noise(0.18, { vol: 0.08, freq: 600 }); }
  death() {
    this.noise(0.5, { vol: 0.3, freq: 400 });
    this.tone(440, 0.7, { type: 'sawtooth', vol: 0.12, slide: 0.25 });
  }
  beep(high) { this.tone(high ? 880 : 520, high ? 0.4 : 0.15, { type: 'triangle', vol: 0.2 }); }
  victory() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: i * 0.11 }));
  }
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', vol: 0.16, delay: i * 0.16 }));
  }
  warn() { this.tone(220, 0.12, { type: 'square', vol: 0.05 }); }
}
