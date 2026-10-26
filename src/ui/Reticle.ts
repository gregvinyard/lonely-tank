import * as Phaser from 'phaser';

// The aiming reticle that replaces the mouse cursor in play: a ring with four
// ticks and a centre dot, drawn in game pixels so it sits on the same grid as
// everything else. A dark outline keeps it readable on any ground.

const SIZE = 23;
const C = 11; // centre pixel
const RING = 8;
const LIGHT = [255, 214, 120];
const DARK = [26, 18, 16];

function makeTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('reticle')) return;
  const px: (number[] | null)[] = new Array(SIZE * SIZE).fill(null);
  const on = (x: number, y: number) => {
    const d = Math.hypot(x - C, y - C);
    // The ring, broken where the ticks cross it.
    const tick = (x === C && (y <= C - RING + 1 || y >= C + RING - 1) && Math.abs(y - C) <= RING + 2) ||
      (y === C && (x <= C - RING + 1 || x >= C + RING - 1) && Math.abs(x - C) <= RING + 2);
    const ring = Math.abs(d - RING) < 0.5;
    return tick || ring || (x === C && y === C);
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (on(x, y)) px[y * SIZE + x] = LIGHT;
  // Outline every lit pixel.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (px[y * SIZE + x]) continue;
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && px[ny * SIZE + nx] === LIGHT) near = true;
      }
      if (near) px[y * SIZE + x] = DARK;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  px.forEach((c, i) => {
    if (!c) return;
    img.data.set([c[0], c[1], c[2], 255], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas('reticle', canvas);
}

export class Reticle {
  private readonly img: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    makeTexture(scene);
    this.img = scene.add.image(0, 0, 'reticle').setDepth(1000).setVisible(false);
    const canvas = scene.game.canvas;
    canvas.style.cursor = 'none';
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (canvas.style.cursor = ''));
  }

  update() {
    const p = this.scene.input.activePointer;
    // Hidden until the mouse is over the game (and after it leaves).
    this.img.setVisible(this.scene.input.isOver && p.wasTouch === false);
    this.img.setPosition(Math.round(p.x), Math.round(p.y));
  }
}
