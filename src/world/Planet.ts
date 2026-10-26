import * as Phaser from 'phaser';
import { ROCK_VARIANTS } from '../data/assets';
import { MATERIAL_TILES } from '../data/biomes';
import { PLANET } from '../data/tuning';
import { chunkContent, chunkKey, chunkOf, chunkRange, isHomeChunk, type ChunkContent } from '../systems/chunks';
import { paintGroundChunk, type Material, type Materials } from '../systems/paintGround';
import type { Circle } from '../systems/steer';
import { groundAt, type Feature, type GroundSample } from '../systems/terrain';
import type { GroundReply, GroundRequest } from './groundWorker';

// Streams the planet in around the tank: for each chunk within loadRadius it
// paints the ground (on a worker), places props with their collision, and
// tells the scene so it can add salvage and hostiles. Chunks past
// unloadRadius are torn down again.

export interface PlanetHooks {
  onLoad(c: ChunkContent): void;
  onUnload(c: ChunkContent): void;
}

interface Loaded {
  content: ChunkContent;
  objects: Phaser.GameObjects.GameObject[];
  ground?: Phaser.GameObjects.Image;
  painting: boolean;
}

/** Rock variant from the prop's random value: same art choice every time. */
function rockFrame(u: number, count: number) {
  return Math.min(count - 1, Math.floor(u * count));
}

export class Planet {
  private readonly loaded = new Map<string, Loaded>();
  private worker?: Worker;
  private materials!: Materials;
  private center = { cx: Number.NaN, cy: Number.NaN };
  /** Impassable features of the loaded chunks (each once). */
  features: Feature[] = [];
  /** Collision circles of the loaded chunks' props. */
  circles: Circle[] = [];
  /** Bumped whenever the loaded set changes. */
  version = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly seed: number,
    private readonly solids: Phaser.Physics.Arcade.StaticGroup,
    private readonly hooks: PlanetHooks,
  ) {
    this.materials = readMaterials(scene);
    try {
      this.worker = new Worker(new URL('./groundWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<GroundReply>) => this.onPainted(e.data);
      this.worker.postMessage({ type: 'materials', materials: this.materials } satisfies GroundRequest);
    } catch {
      this.worker = undefined; // paint on the main thread instead
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get loadedCount() {
    return this.loaded.size;
  }

  isLoaded(cx: number, cy: number) {
    return this.loaded.has(chunkKey(cx, cy));
  }

  /** Every loaded chunk's contents. */
  contents(): ChunkContent[] {
    return [...this.loaded.values()].map((l) => l.content);
  }

  ground(x: number, y: number): GroundSample {
    return groundAt(this.features, x, y);
  }

  /**
   * Keeps the chunks round (x, y) built. `sync` paints the ground right away
   * (after a teleport, so the tank never sits on a black hole).
   */
  update(x: number, y: number, sync = false) {
    const { cx, cy } = chunkOf(x, y);
    if (cx === this.center.cx && cy === this.center.cy && !sync) return;
    this.center = { cx, cy };
    const range = chunkRange();
    let changed = false;
    for (const [key, l] of this.loaded) {
      const { cx: lx, cy: ly } = l.content;
      if (Math.max(Math.abs(lx - cx), Math.abs(ly - cy)) > PLANET.unloadRadius) {
        this.unload(l);
        this.loaded.delete(key);
        changed = true;
      }
    }
    // Nearest first, so the ground under the tank comes in before the edges.
    const want: { cx: number; cy: number; d: number }[] = [];
    const R = PLANET.loadRadius;
    for (let j = cy - R; j <= cy + R; j++) {
      for (let i = cx - R; i <= cx + R; i++) {
        if (i < range.min || i > range.max || j < range.min || j > range.max) continue;
        if (!this.loaded.has(chunkKey(i, j))) want.push({ cx: i, cy: j, d: Math.max(Math.abs(i - cx), Math.abs(j - cy)) });
      }
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      this.load(w.cx, w.cy, sync && w.d <= 1);
      changed = true;
    }
    if (changed) this.refresh();
  }

  private load(cx: number, cy: number, paintNow: boolean) {
    const content = chunkContent(this.seed, cx, cy);
    const l: Loaded = { content, objects: [], painting: false };
    this.loaded.set(chunkKey(cx, cy), l);
    if (!isHomeChunk(cx, cy)) {
      if (paintNow || !this.worker) this.placeGround(l, paintGroundChunk(this.seed, cx, cy, this.materials));
      else {
        l.painting = true;
        this.worker.postMessage({ type: 'paint', seed: this.seed, cx, cy } satisfies GroundRequest);
      }
    }
    this.buildProps(l);
    this.hooks.onLoad(content);
  }

  private onPainted(r: GroundReply) {
    if (r.seed !== this.seed) return;
    const l = this.loaded.get(chunkKey(r.cx, r.cy));
    if (!l || l.ground) return;
    l.painting = false;
    this.placeGround(l, r.pixels);
  }

  private placeGround(l: Loaded, pixels: Uint8ClampedArray) {
    const s = PLANET.chunkSize;
    const { cx, cy } = l.content;
    const key = `ground:${cx},${cy}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const tex = this.scene.textures.createCanvas(key, s, s)!;
    tex.getContext().putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.length), s, s), 0, 0);
    tex.refresh();
    l.ground = this.scene.add.image(cx * s, cy * s, key).setOrigin(0, 0).setDepth(0);
  }

  private buildProps(l: Loaded) {
    const sc = this.scene;
    const c = l.content;
    for (const p of c.props) {
      let img: Phaser.GameObjects.Image;
      if (p.family === 'rock') {
        const keys = ROCK_VARIANTS[p.size!].keys;
        img = sc.add.image(p.x, p.y, keys[rockFrame(p.frame, keys.length)]).setDepth(5);
        if (p.tint !== 0xffffff) img.setTint(p.tint);
      } else if (p.family === 'landmark') {
        img = sc.add.image(p.x, p.y, 'landmarks', p.frame).setDepth(5);
      } else {
        // A fungus cap hangs over the tank; spires and ruins stand on the ground.
        img = sc.add.image(p.x, p.y, 'props', p.frame).setDepth(p.family === 'fungus' ? 11.7 : 5);
      }
      img.setFlipX(p.flip);
      l.objects.push(img);
      for (const circle of p.circles) {
        const part = this.solids.create(circle.x, circle.y, '__DEFAULT') as Phaser.Physics.Arcade.Image;
        part.setVisible(false);
        const body = part.body as Phaser.Physics.Arcade.StaticBody;
        body.setCircle(circle.r).setOffset(part.width / 2 - circle.r, part.height / 2 - circle.r);
        l.objects.push(part);
      }
    }
    for (const lm of c.landmarks) {
      if (c.props.some((p) => p.family === 'landmark' && p.x === lm.x && p.y === lm.y)) continue;
      l.objects.push(sc.add.image(lm.x, lm.y, 'landmarks', lm.frame).setDepth(2));
    }
    for (const d of c.decor) l.objects.push(sc.add.image(d.x, d.y, 'flora', d.frame).setFlipX(d.flip).setDepth(2));
  }

  private unload(l: Loaded) {
    for (const o of l.objects) o.destroy();
    l.objects = [];
    if (l.ground) {
      const key = l.ground.texture.key;
      l.ground.destroy();
      this.scene.textures.remove(key);
    }
    this.hooks.onUnload(l.content);
  }

  /** Rebuilds the flat lists of loaded features and collision circles. */
  private refresh() {
    const seen = new Set<Feature>();
    this.circles = [];
    for (const l of this.loaded.values()) {
      for (const f of l.content.features) seen.add(f);
      for (const p of l.content.props) this.circles.push(...p.circles);
    }
    this.features = [...seen];
    this.version++;
  }

  /** True once every loaded chunk outside the home square has its ground. */
  get groundReady() {
    return [...this.loaded.values()].every((l) => isHomeChunk(l.content.cx, l.content.cy) || !!l.ground);
  }

  /** Game objects the planet currently holds (for leak checks). */
  get objectCount() {
    let n = 0;
    for (const l of this.loaded.values()) n += l.objects.length + (l.ground ? 1 : 0);
    return n;
  }

  private destroy() {
    this.worker?.terminate();
    this.worker = undefined;
    for (const l of this.loaded.values()) {
      if (l.ground) this.scene.textures.remove(l.ground.texture.key);
    }
    this.loaded.clear();
  }
}

/** Reads the ground art into plain pixel arrays (for the painter, which may run on a worker). */
function readMaterials(scene: Phaser.Scene): Materials {
  const pixels = (key: string): Material => {
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    return { w: src.width, h: src.height, data: ctx.getImageData(0, 0, src.width, src.height).data };
  };
  const sheet = pixels('ground_tiles');
  const tiles: Material[] = [];
  for (let t = 0; t < sheet.w / 32; t++) {
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let y = 0; y < 32; y++) data.set(sheet.data.subarray((y * sheet.w + t * 32) * 4, (y * sheet.w + t * 32 + 32) * 4), y * 128);
    tiles.push({ w: 32, h: 32, data });
  }
  // Ichor: the acid lake art shifted from green to violet.
  const ichor = MATERIAL_TILES.liquid.map((t) => {
    const s = tiles[t].data;
    const d = new Uint8ClampedArray(s.length);
    for (let i = 0; i < s.length; i += 4) {
      d[i] = s[i + 1] * 0.78;
      d[i + 1] = s[i] * 0.3 + 18;
      d[i + 2] = Math.min(255, s[i + 1] * 1.02);
      d[i + 3] = 255;
    }
    return { w: 32, h: 32, data: d };
  });
  const big = pixels('ground_large');
  const large: Material[] = [];
  for (let t = 0; t < big.w / 128; t++) {
    const data = new Uint8ClampedArray(128 * 128 * 4);
    for (let y = 0; y < 128; y++) data.set(big.data.subarray((y * big.w + t * 128) * 4, (y * big.w + t * 128 + 128) * 4), y * 512);
    large.push({ w: 128, h: 128, data });
  }
  return { flats: pixels('terrain'), tiles, large, ichor };
}
