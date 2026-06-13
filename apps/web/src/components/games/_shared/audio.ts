// Shared procedural audio engine for the built-in arcade games.
//
// Everything is synthesized with the WebAudio API — no audio assets to load.
// Games call the named one-shots (gameAudio.shoot(), gameAudio.coin(), …);
// each builds a tiny oscillator/noise graph, plays, and self-disposes.
//
// The AudioContext is created lazily on the first call after a user gesture
// (browsers block audio before interaction). Mute state persists in
// localStorage under 'arcadery:audio-muted' and is shared by every game.

const MUTE_KEY = 'arcadery:audio-muted';

type OscType = OscillatorType;

interface ToneOpts {
  freq: number;
  /** End frequency for a pitch slide (defaults to freq). */
  freqTo?: number;
  type?: OscType;
  duration?: number;
  volume?: number;
  /** Seconds before the tone starts. */
  delay?: number;
  attack?: number;
}

interface NoiseOpts {
  duration?: number;
  volume?: number;
  /** Band-pass center frequency; sweeps to filterTo if given. */
  filterFreq?: number;
  filterTo?: number;
  delay?: number;
}

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private mutedFlag: boolean;

  constructor() {
    let stored = false;
    try {
      stored = typeof window !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
    } catch {}
    this.mutedFlag = stored;
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(muted: boolean) {
    this.mutedFlag = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.mutedFlag);
    return this.mutedFlag;
  }

  /** Create/resume the context. Safe to call every frame; cheap after init. */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedFlag ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private out(): GainNode | null {
    this.ensure();
    return this.master;
  }

  tone(opts: ToneOpts) {
    const ctx = this.ensure();
    const out = this.out();
    if (!ctx || !out || this.mutedFlag) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const {
      freq,
      freqTo = opts.freq,
      type = 'square',
      duration = 0.12,
      volume = 0.2,
      delay = 0,
      attack = 0.005,
    } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqTo !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  noise(opts: NoiseOpts = {}) {
    const ctx = this.ensure();
    const out = this.out();
    if (!ctx || !out || this.mutedFlag) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const { duration = 0.25, volume = 0.25, filterFreq = 1200, filterTo, delay = 0 } = opts;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 1);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (filterTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t0 + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  // ─── Named one-shots shared across games ──────────────────────────

  /** UI click / menu select. */
  click() {
    this.tone({ freq: 880, type: 'sine', duration: 0.05, volume: 0.12 });
  }

  shoot() {
    this.tone({ freq: 920, freqTo: 220, type: 'square', duration: 0.09, volume: 0.1 });
  }

  laser() {
    this.tone({ freq: 1400, freqTo: 400, type: 'sawtooth', duration: 0.14, volume: 0.1 });
  }

  jump() {
    this.tone({ freq: 320, freqTo: 660, type: 'square', duration: 0.12, volume: 0.14 });
  }

  land() {
    this.noise({ duration: 0.08, volume: 0.12, filterFreq: 300, filterTo: 120 });
  }

  /** Pitch rises with the combo counter — cap keeps it musical. */
  combo(step: number) {
    const n = Math.min(12, Math.max(1, step));
    this.tone({
      freq: 440 * Math.pow(2, n / 12),
      type: 'sine',
      duration: 0.14,
      volume: 0.16,
    });
    this.tone({
      freq: 660 * Math.pow(2, n / 12),
      type: 'sine',
      duration: 0.18,
      volume: 0.08,
      delay: 0.04,
    });
  }

  coin() {
    this.tone({ freq: 988, type: 'square', duration: 0.07, volume: 0.12 });
    this.tone({ freq: 1319, type: 'square', duration: 0.16, volume: 0.12, delay: 0.07 });
  }

  pickup() {
    this.tone({ freq: 523, freqTo: 1046, type: 'triangle', duration: 0.18, volume: 0.16 });
  }

  powerup() {
    this.tone({ freq: 440, type: 'square', duration: 0.09, volume: 0.13 });
    this.tone({ freq: 554, type: 'square', duration: 0.09, volume: 0.13, delay: 0.08 });
    this.tone({ freq: 659, type: 'square', duration: 0.2, volume: 0.13, delay: 0.16 });
  }

  boost() {
    this.tone({ freq: 200, freqTo: 900, type: 'sawtooth', duration: 0.3, volume: 0.14 });
    this.noise({ duration: 0.3, volume: 0.1, filterFreq: 800, filterTo: 2400 });
  }

  hit() {
    this.tone({ freq: 220, freqTo: 90, type: 'sawtooth', duration: 0.18, volume: 0.2 });
    this.noise({ duration: 0.12, volume: 0.18, filterFreq: 500, filterTo: 150 });
  }

  explosionSmall() {
    this.noise({ duration: 0.3, volume: 0.22, filterFreq: 900, filterTo: 150 });
    this.tone({ freq: 160, freqTo: 50, type: 'triangle', duration: 0.25, volume: 0.18 });
  }

  explosionBig() {
    this.noise({ duration: 0.7, volume: 0.3, filterFreq: 700, filterTo: 60 });
    this.tone({ freq: 110, freqTo: 30, type: 'triangle', duration: 0.6, volume: 0.25 });
  }

  crumble() {
    this.noise({ duration: 0.22, volume: 0.16, filterFreq: 2200, filterTo: 300 });
  }

  /** Countdown tick / urgency blip. */
  tick() {
    this.tone({ freq: 1200, type: 'sine', duration: 0.04, volume: 0.1 });
  }

  alarm() {
    this.tone({ freq: 740, freqTo: 880, type: 'square', duration: 0.18, volume: 0.12 });
    this.tone({ freq: 740, freqTo: 880, type: 'square', duration: 0.18, volume: 0.12, delay: 0.22 });
  }

  levelup() {
    this.tone({ freq: 523, type: 'triangle', duration: 0.1, volume: 0.16 });
    this.tone({ freq: 659, type: 'triangle', duration: 0.1, volume: 0.16, delay: 0.1 });
    this.tone({ freq: 784, type: 'triangle', duration: 0.1, volume: 0.16, delay: 0.2 });
    this.tone({ freq: 1046, type: 'triangle', duration: 0.28, volume: 0.18, delay: 0.3 });
  }

  victory() {
    this.tone({ freq: 523, type: 'square', duration: 0.12, volume: 0.14 });
    this.tone({ freq: 659, type: 'square', duration: 0.12, volume: 0.14, delay: 0.12 });
    this.tone({ freq: 784, type: 'square', duration: 0.12, volume: 0.14, delay: 0.24 });
    this.tone({ freq: 1046, type: 'square', duration: 0.4, volume: 0.16, delay: 0.36 });
  }

  gameover() {
    this.tone({ freq: 392, type: 'triangle', duration: 0.22, volume: 0.18 });
    this.tone({ freq: 311, type: 'triangle', duration: 0.22, volume: 0.18, delay: 0.2 });
    this.tone({ freq: 233, type: 'triangle', duration: 0.5, volume: 0.18, delay: 0.4 });
  }
}

/** Singleton shared by all built-in games. */
export const gameAudio = new GameAudio();
