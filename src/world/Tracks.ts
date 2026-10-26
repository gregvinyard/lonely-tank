import * as Phaser from 'phaser';

// Tread marks: the tank presses a pair of tracks into the ground as it drives,
// and they fade out over a few seconds. A fixed pool of marks is reused, the
// oldest first.

const POOL = 640;
const STEP = 3; // px driven between marks (the mark texture is this long)
const FADE_MS = 14000;
const START_ALPHA = 0.55;
/** The treads' centres, px either side of the hull's middle (from tank_hull.png). */
const TREADS = [-15, 15];

interface Mark {
  img: Phaser.GameObjects.Image;
  born: number;
}

export class Tracks {
  private readonly marks: Mark[] = [];
  private next = 0;
  private travelled = 0;
  private last?: { x: number; y: number };

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists('track')) {
      // One slice of tread: a dark cleat and a lighter imprint, 8 px across.
      const g = scene.make.graphics({}, false);
      g.fillStyle(0x24160f, 0.22).fillRect(0, 0, STEP, 8);
      g.fillStyle(0x24160f, 0.3).fillRect(0, 0, 1, 8);
      g.generateTexture('track', STEP, 8);
      g.destroy();
    }
    for (let i = 0; i < POOL; i++) this.marks.push({ img: scene.add.image(0, 0, 'track').setDepth(1.2).setVisible(false), born: 0 });
  }

  /** `pressing`: the tank is out on open ground (not in the ship). */
  update(x: number, y: number, rotation: number, time: number, pressing: boolean) {
    if (!pressing || !this.last) {
      this.last = { x, y };
      this.travelled = 0;
    } else {
      const dx = x - this.last.x;
      const dy = y - this.last.y;
      const d = Math.hypot(dx, dy);
      this.last = { x, y };
      // Treads only print rolling forward or back: not when shoved sideways,
      // and a teleport (rescue) doesn't drag a track across the map.
      const along = d > 0 ? Math.abs(dx * Math.cos(rotation) + dy * Math.sin(rotation)) / d : 1;
      this.travelled = d > 64 || along < 0.7 ? 0 : this.travelled + d;
      while (this.travelled >= STEP) {
        this.travelled -= STEP;
        const c = Math.cos(rotation);
        const s = Math.sin(rotation);
        for (const off of TREADS) this.stamp(x - s * off, y + c * off, rotation, time);
      }
    }
    for (const m of this.marks) {
      if (!m.img.visible) continue;
      const age = time - m.born;
      if (age >= FADE_MS) m.img.setVisible(false);
      else m.img.setAlpha(START_ALPHA * (1 - age / FADE_MS));
    }
  }

  private stamp(x: number, y: number, rotation: number, time: number) {
    const m = this.marks[this.next];
    m.img.setPosition(x, y).setRotation(rotation).setVisible(true).setAlpha(START_ALPHA);
    m.born = time;
    this.next = (this.next + 1) % POOL;
  }

  get visibleCount() {
    return this.marks.filter((m) => m.img.visible).length;
  }
}
