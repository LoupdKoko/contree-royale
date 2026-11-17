// ==========================================
// MOTEUR AUDIO SYNTHÉTIQUE (WEB AUDIO API)
// ==========================================
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.settings = {
      muted: false,
      master: 80,
      cards: 85,
      announces: 90,
      ui: 75
    };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  getContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  getGain(category) {
    if (this.settings.muted) return 0;
    const master = (this.settings.master ?? 80) / 100;
    const cat = (this.settings[category] ?? 80) / 100;
    return master * cat;
  }

  // Son de clic d'interface
  playClick() {
    const vol = this.getGain('ui');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  // Son de pose de carte sur le tapis feutré
  playCardSlap() {
    const vol = this.getGain('cards');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 0.075;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.32));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, ctx.currentTime);
    filter.Q.setValueAtTime(1.2, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.075);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }

  // Son de ramassage du pli
  playTrickSweep() {
    const vol = this.getGain('cards');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.22 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  // Son d'annonce / enchère
  playBidSound(type = 'BID') {
    const vol = this.getGain('announces');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (type === 'PASS') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.09);
      g.gain.setValueAtTime(0.16 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'COINCHE' || type === 'SURCOINCHE') {
      [440, 554.37, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);
        g.gain.setValueAtTime(0.18 * vol, now + idx * 0.055);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.18);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.19);
      });
    } else {
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        g.gain.setValueAtTime(0.22 * vol, now + idx * 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.12);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.13);
      });
    }
  }

  // Fanfare fin de manche
  playRoundEnd(success = true) {
    const vol = this.getGain('announces');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = success ? [523.25, 659.25, 783.99, 1046.5] : [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      g.gain.setValueAtTime(0.24 * vol, now + idx * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
  }

  // Fanfare spéciale "Fanny" (1500 à 0)
  playFannySound(weWon = true) {
    const vol = this.getGain('announces');
    if (vol <= 0.01) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const sequence = weWon
      ? [
          { f: 523.25, d: 0.1, t: 0 },
          { f: 659.25, d: 0.1, t: 0.11 },
          { f: 783.99, d: 0.1, t: 0.22 },
          { f: 1046.5, d: 0.22, t: 0.33 },
          { f: 783.99, d: 0.1, t: 0.58 },
          { f: 1046.5, d: 0.35, t: 0.7 }
        ]
      : [
          { f: 392.0, d: 0.18, t: 0 },
          { f: 369.99, d: 0.18, t: 0.2 },
          { f: 349.23, d: 0.18, t: 0.4 },
          { f: 329.63, d: 0.45, t: 0.6 }
        ];

    sequence.forEach(({ f, d, t }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now + t);
      g.gain.setValueAtTime(0.25 * vol, now + t);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + d);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + d + 0.02);
    });
  }
}

export const soundEngine = new SoundEngine();
