// Tiny synthesized sound effects (WebAudio, no audio files).
//
// The audio context is only created after the first click or key press, as
// browsers require. Every call is safe when audio is unavailable or muted.

export type SfxName = 'fire' | 'impact' | 'hit' | 'explode' | 'hurt' | 'pickup' | 'open' | 'ok' | 'deny' | 'craft' | 'rescue' | 'lowFuel' | 'rumble' | 'burst';

const MUTE_KEY = 'lonely-tank.muted';
const MAX_VOICES = 8;

interface Tone {
  type: OscillatorType;
  from: number; // Hz
  to: number; // Hz at the end
  ms: number;
  gain: number;
  delay?: number; // ms
}

interface Noise {
  ms: number;
  gain: number;
  cutoff: number; // low-pass Hz
  delay?: number;
}

const SOUNDS: Record<SfxName, (Tone | Noise)[]> = {
  fire: [
    { ms: 70, gain: 0.18, cutoff: 1800 },
    { type: 'square', from: 220, to: 70, ms: 70, gain: 0.05 },
  ],
  impact: [{ ms: 50, gain: 0.08, cutoff: 2500 }],
  hit: [{ type: 'square', from: 900, to: 500, ms: 50, gain: 0.05 }],
  explode: [
    { ms: 420, gain: 0.3, cutoff: 700 },
    { type: 'triangle', from: 120, to: 35, ms: 380, gain: 0.25 },
  ],
  hurt: [
    { type: 'sawtooth', from: 160, to: 60, ms: 160, gain: 0.12 },
    { ms: 120, gain: 0.12, cutoff: 1200 },
  ],
  pickup: [
    { type: 'square', from: 660, to: 660, ms: 60, gain: 0.06 },
    { type: 'square', from: 990, to: 990, ms: 90, gain: 0.06, delay: 60 },
  ],
  open: [{ type: 'triangle', from: 440, to: 660, ms: 90, gain: 0.1 }],
  ok: [
    { type: 'square', from: 520, to: 520, ms: 60, gain: 0.05 },
    { type: 'square', from: 780, to: 780, ms: 80, gain: 0.05, delay: 60 },
  ],
  deny: [{ type: 'square', from: 140, to: 120, ms: 140, gain: 0.07 }],
  craft: [
    { type: 'square', from: 523, to: 523, ms: 90, gain: 0.06 },
    { type: 'square', from: 659, to: 659, ms: 90, gain: 0.06, delay: 90 },
    { type: 'square', from: 784, to: 784, ms: 90, gain: 0.06, delay: 180 },
    { type: 'square', from: 1047, to: 1047, ms: 220, gain: 0.06, delay: 270 },
  ],
  rescue: [
    { type: 'triangle', from: 600, to: 200, ms: 500, gain: 0.15 },
    { ms: 300, gain: 0.1, cutoff: 900 },
  ],
  // A burrower about to burst out, then bursting.
  rumble: [
    { ms: 600, gain: 0.12, cutoff: 260 },
    { type: 'triangle', from: 55, to: 45, ms: 600, gain: 0.12 },
  ],
  burst: [
    { ms: 220, gain: 0.22, cutoff: 1400 },
    { type: 'sawtooth', from: 90, to: 220, ms: 140, gain: 0.08 },
  ],
  lowFuel: [
    { type: 'square', from: 880, to: 880, ms: 80, gain: 0.05 },
    { type: 'square', from: 880, to: 880, ms: 80, gain: 0.05, delay: 160 },
  ],
};

class SoundBoard {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private voices = 0;
  muted = readMuted();

  /** Creates (or resumes) the audio context; call from a user gesture. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.6;
        this.master.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = undefined;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not remembered, but still applies for this session.
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  play(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    try {
      let longest = 0;
      for (const part of SOUNDS[name]) {
        const t0 = ctx.currentTime + (part.delay ?? 0) / 1000;
        const t1 = t0 + part.ms / 1000;
        longest = Math.max(longest, (part.delay ?? 0) + part.ms);
        const env = ctx.createGain();
        env.gain.setValueAtTime(part.gain, t0);
        env.gain.exponentialRampToValueAtTime(0.001, t1);
        env.connect(this.master);
        let src: AudioScheduledSourceNode;
        if ('type' in part) {
          const osc = ctx.createOscillator();
          osc.type = part.type;
          osc.frequency.setValueAtTime(part.from, t0);
          osc.frequency.exponentialRampToValueAtTime(part.to, t1);
          osc.connect(env);
          src = osc;
        } else {
          const buf = ctx.createBufferSource();
          buf.buffer = this.noise!;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = part.cutoff;
          buf.connect(lp).connect(env);
          src = buf;
        }
        src.start(t0);
        src.stop(t1 + 0.02);
      }
      this.voices++;
      setTimeout(() => this.voices--, longest + 30);
    } catch {
      // Never let sound break the game.
    }
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sfx = new SoundBoard();
