// Sound effects: recorded samples (generated with Mirelo, see docs/ART_REQUESTS.md)
// played through WebAudio, plus two loops (the tank's motor and the wind).
//
// Files are fetched at startup but only decoded once the audio context exists,
// which browsers allow only after the first click or key press. Until a sample
// is ready (or if it fails to load) the old synthesized blip stands in where
// there is one. Every call is safe when audio is unavailable or muted.

interface Sample {
  files: string[];
  /** Relative level; the files are all peak-normalised. */
  gain: number;
  /** Vary the pitch a little each time, for sounds that repeat a lot. */
  jitter?: boolean;
  /** Ignore repeats closer together than this. */
  minGapMs?: number;
}

const SAMPLES = {
  fire: { files: ['fire_0.mp3', 'fire_1.mp3'], gain: 0.55, jitter: true },
  impact: { files: ['impact_0.mp3', 'impact_1.mp3'], gain: 0.5, jitter: true, minGapMs: 40 },
  hit: { files: ['hit_0.mp3', 'hit_1.mp3'], gain: 0.5, jitter: true, minGapMs: 40 },
  explode: { files: ['explode_0.mp3', 'explode_1.mp3'], gain: 0.6, jitter: true },
  burrowerDie: { files: ['burrowerDie.mp3'], gain: 0.7 },
  hurt: { files: ['hurt_0.mp3', 'hurt_1.mp3'], gain: 0.7, jitter: true },
  rumble: { files: ['rumble.mp3'], gain: 0.6 },
  burst: { files: ['burst.mp3'], gain: 0.7 },
  alert: { files: ['alert.mp3'], gain: 0.3, minGapMs: 400 },
  pickupScrap: { files: ['pickupScrap.mp3'], gain: 0.6, jitter: true, minGapMs: 60 },
  pickupCrystal: { files: ['pickupCrystal.mp3'], gain: 0.6, jitter: true, minGapMs: 60 },
  pickupCircuit: { files: ['pickupCircuit.mp3'], gain: 0.9, jitter: true, minGapMs: 60 },
  siphon: { files: ['siphon.mp3'], gain: 0.6 },
  door: { files: ['door.mp3'], gain: 0.5 },
  open: { files: ['open.mp3'], gain: 0.5 },
  refuel: { files: ['refuel.mp3'], gain: 0.8 },
  repair: { files: ['repair.mp3'], gain: 0.45 },
  craft: { files: ['craft.mp3'], gain: 0.8 },
  deny: { files: ['deny.mp3'], gain: 0.35 },
  ok: { files: ['ok.mp3'], gain: 0.4 },
  click: { files: ['click.mp3'], gain: 0.3, minGapMs: 50 },
  solar: { files: ['solar.mp3'], gain: 0.7 },
  lowFuel: { files: ['lowFuel.mp3'], gain: 0.6 },
  rescue: { files: ['rescue.mp3'], gain: 0.6 },
  discoverBiome: { files: ['discoverBiome.mp3'], gain: 0.5 },
  discoverLandmark: { files: ['discoverLandmark.mp3'], gain: 0.45 },
  map: { files: ['map.mp3'], gain: 0.35 },
  start: { files: ['start.mp3'], gain: 0.6 },
  bump: { files: ['bump.mp3'], gain: 0.5, jitter: true, minGapMs: 500 },
} satisfies Record<string, Sample>;

export type SfxName = keyof typeof SAMPLES;

const LOOPS = {
  engine: { file: 'engine.wav', gain: 0.35 },
  wind: { file: 'wind.wav', gain: 0.22 },
} satisfies Record<string, { file: string; gain: number }>;

export type LoopName = keyof typeof LOOPS;

/** Every file under public/assets/sfx the game uses (checked by a unit test). */
export const SFX_FILES = [...Object.values(SAMPLES).flatMap((s) => s.files), ...Object.values(LOOPS).map((l) => l.file)];

const BASE = 'assets/sfx/';
const MUTE_KEY = 'lonely-tank.muted';
const MAX_VOICES = 12;
const MASTER = 0.6;

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

const PICKUP: (Tone | Noise)[] = [
  { type: 'square', from: 660, to: 660, ms: 60, gain: 0.06 },
  { type: 'square', from: 990, to: 990, ms: 90, gain: 0.06, delay: 60 },
];
const OK: (Tone | Noise)[] = [
  { type: 'square', from: 520, to: 520, ms: 60, gain: 0.05 },
  { type: 'square', from: 780, to: 780, ms: 80, gain: 0.05, delay: 60 },
];

/** The original synthesized sounds, used until (or if) a sample can't be played. */
const SYNTH: Partial<Record<SfxName, (Tone | Noise)[]>> = {
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
  pickupScrap: PICKUP,
  pickupCrystal: PICKUP,
  pickupCircuit: PICKUP,
  siphon: PICKUP,
  open: [{ type: 'triangle', from: 440, to: 660, ms: 90, gain: 0.1 }],
  ok: OK,
  refuel: OK,
  repair: OK,
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
  // Solar panels sliding out or folding away.
  solar: [
    { type: 'square', from: 300, to: 420, ms: 260, gain: 0.04 },
    { ms: 240, gain: 0.04, cutoff: 2200 },
  ],
  // The cargo door sliding.
  door: [
    { ms: 380, gain: 0.08, cutoff: 500 },
    { type: 'square', from: 70, to: 90, ms: 360, gain: 0.03 },
  ],
  lowFuel: [
    { type: 'square', from: 880, to: 880, ms: 80, gain: 0.05 },
    { type: 'square', from: 880, to: 880, ms: 80, gain: 0.05, delay: 160 },
  ],
};

interface LoopVoice {
  src?: AudioBufferSourceNode;
  gain?: GainNode;
  level: number;
  rate: number;
}

class SoundBoard {
  private ctx?: AudioContext;
  private master?: GainNode;
  /** Loops go through here, so pausing or hiding the page can silence them all. */
  private loopBus?: GainNode;
  private noise?: AudioBuffer;
  private voices = 0;
  private fetched = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer>();
  private failed = new Set<string>();
  private lastPlayed = new Map<SfxName, number>();
  private loops = new Map<LoopName, LoopVoice>();
  private loopsHeld = false;
  private loading = false;
  muted = readMuted();

  /** Starts fetching the sample files; they're decoded once the audio context exists. */
  load() {
    if (this.loading || typeof fetch === 'undefined') return;
    this.loading = true;
    for (const file of SFX_FILES) {
      fetch(BASE + file)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => {
          this.fetched.set(file, data);
          this.decode(file);
        })
        .catch(() => {
          this.failed.add(file);
          console.warn(`Sound failed to load, using a stand-in: ${file}`);
        });
    }
    document.addEventListener('visibilitychange', () => this.applyLoopBus());
  }

  /** Creates (or resumes) the audio context; call from a user gesture. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER;
        this.master.connect(this.ctx.destination);
        this.loopBus = this.ctx.createGain();
        this.loopBus.connect(this.master);
        this.applyLoopBus();
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        for (const file of this.fetched.keys()) this.decode(file);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.applyLoops());
      else this.applyLoops();
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
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER;
    return this.muted;
  }

  /** How the sample files are doing (for tests and debugging). */
  status() {
    return { total: SFX_FILES.length, decoded: this.buffers.size, failed: [...this.failed] };
  }

  play(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const def: Sample = SAMPLES[name];
    const now = performance.now();
    if (def.minGapMs && now - (this.lastPlayed.get(name) ?? -Infinity) < def.minGapMs) return;
    this.lastPlayed.set(name, now);
    try {
      const file = def.files[Math.floor(Math.random() * def.files.length)];
      const buffer = this.buffers.get(file);
      if (buffer) this.playSample(ctx, buffer, def);
      else this.playSynth(ctx, name);
    } catch {
      // Never let sound break the game.
    }
  }

  /**
   * Sets a loop's level (0 stops it) and playback rate; call as often as you like.
   * It starts once its file is ready and keeps these settings until changed.
   */
  setLoop(name: LoopName, level: number, rate = 1) {
    const v = this.loops.get(name) ?? { level: 0, rate: 1 };
    v.level = Math.max(0, Math.min(1, level));
    v.rate = rate;
    this.loops.set(name, v);
    this.applyLoop(name);
  }

  /** Silences every loop (pause, map, a scene ending) without forgetting their levels. */
  holdLoops(on: boolean) {
    this.loopsHeld = on;
    this.applyLoopBus();
  }

  private playSample(ctx: AudioContext, buffer: AudioBuffer, def: Sample) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (def.jitter) src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const g = ctx.createGain();
    g.gain.value = def.gain;
    src.connect(g).connect(this.master!);
    src.start();
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
  }

  private playSynth(ctx: AudioContext, name: SfxName) {
    const parts = SYNTH[name];
    if (!parts) return;
    let longest = 0;
    for (const part of parts) {
      const t0 = ctx.currentTime + (part.delay ?? 0) / 1000;
      const t1 = t0 + part.ms / 1000;
      longest = Math.max(longest, (part.delay ?? 0) + part.ms);
      const env = ctx.createGain();
      env.gain.setValueAtTime(part.gain, t0);
      env.gain.exponentialRampToValueAtTime(0.001, t1);
      env.connect(this.master!);
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
  }

  private decode(file: string) {
    const ctx = this.ctx;
    const data = this.fetched.get(file);
    if (!ctx || !data) return;
    this.fetched.delete(file); // decodeAudioData takes the buffer over
    ctx
      .decodeAudioData(data)
      .then((buffer) => {
        this.buffers.set(file, buffer);
        this.applyLoops();
      })
      .catch(() => {
        this.failed.add(file);
        console.warn(`Sound could not be decoded: ${file}`);
      });
  }

  private applyLoops() {
    for (const name of this.loops.keys()) this.applyLoop(name);
  }

  private applyLoop(name: LoopName) {
    const ctx = this.ctx;
    const v = this.loops.get(name);
    if (!ctx || !this.loopBus || !v || ctx.state !== 'running') return;
    try {
      if (!v.src) {
        const buffer = this.buffers.get(LOOPS[name].file);
        if (!buffer || v.level === 0) return;
        v.gain = ctx.createGain();
        v.gain.gain.value = 0;
        v.gain.connect(this.loopBus);
        v.src = ctx.createBufferSource();
        v.src.buffer = buffer;
        v.src.loop = true;
        v.src.connect(v.gain);
        // Start somewhere random, so it doesn't always open on the same gust.
        v.src.start(0, Math.random() * buffer.duration);
      }
      v.gain!.gain.setTargetAtTime(v.level * LOOPS[name].gain, ctx.currentTime, 0.08);
      v.src.playbackRate.setTargetAtTime(v.rate, ctx.currentTime, 0.1);
    } catch {
      // Never let sound break the game.
    }
  }

  private applyLoopBus() {
    if (!this.ctx || !this.loopBus) return;
    const on = !this.loopsHeld && document.visibilityState !== 'hidden';
    this.loopBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
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
