import * as Phaser from 'phaser';
import { FONT_KEY, toFontText } from '../data/pixelFont';
import { PALETTE } from '../data/tuning';
import { compassPlacement } from '../systems/compass';
import type { Inventory } from '../systems/inventory';
import type { ResourceKind } from '../systems/resources';
import { COLLECTED_EVENT, type CollectedPayload, type GameScene } from './GameScene';

const COLOR = { text: 0xf3e3c3, dim: 0xc99668, accent: PALETTE.teal } as const;
const LABELS: Record<ResourceKind, string> = { scrap: 'Scrap', crystal: 'Crystal' };

// Screen-space interface drawn over the Game scene. Positions and sizes are in
// game pixels, the same grid as the world art, and text uses the pixel font.
// It reads the Game scene's state each frame rather than owning any of it.
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private counts!: Record<ResourceKind, Phaser.GameObjects.BitmapText>;
  prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.BitmapText;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private safeZone!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Container;
  private compass!: Phaser.GameObjects.Graphics;
  compassLabel!: Phaser.GameObjects.Container;
  private compassText!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;

    this.add.rectangle(4, 4, 80, 36, 0x000000, 0.55).setOrigin(0, 0);
    // Half-size icons: nearest sampling keeps them on the grid.
    this.add.image(14, 14, 'scrap').setScale(0.5);
    this.add.image(14, 30, 'crystal').setScale(0.5);
    this.counts = {
      scrap: this.text(26, 10, ''),
      crystal: this.text(26, 26, ''),
    };
    const goal = this.box('Salvage, then return to ship', COLOR.dim);
    goal.container.setPosition(4 + goal.container.width / 2, 49);
    this.setCounts(this.game_.inventory);

    ({ container: this.prompt, text: this.promptText, bg: this.promptBg } = this.box('', COLOR.text, 15));
    this.prompt.setVisible(false);

    this.safeZone = this.box('Home base · safe zone', COLOR.accent).container;
    this.hint = this.box('WASD drive · mouse aim · E salvage', COLOR.text).container;

    this.compass = this.add.graphics();
    ({ container: this.compassLabel, text: this.compassText } = this.box('', COLOR.accent));

    const onCollected = (p: CollectedPayload) => this.onCollected(p);
    this.game.events.on(COLLECTED_EVENT, onCollected);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(COLLECTED_EVENT, onCollected));
  }

  update() {
    const g = this.game_;
    const { width, height } = this.scale;

    const node = g.nearby;
    this.prompt.setVisible(!!node).setPosition(Math.round(width / 2), height - 28);
    if (node) {
      this.promptText.setText(toFontText(`[E] Salvage ${LABELS[node.kind]} ×${node.amount}`));
      this.promptBg.setSize(this.promptText.width + 10, 15).setOrigin(0.5);
    }

    this.safeZone.setVisible(g.inSafeZone).setPosition(Math.round(width / 2), 10);
    this.hint.setPosition(Math.round(this.hint.width / 2) + 4, height - 10);
    this.drawCompass(width, height);
  }

  private text(x: number, y: number, s: string, tint: number = COLOR.text) {
    return this.add.bitmapText(x, y, FONT_KEY, toFontText(s)).setTint(tint);
  }

  /** A label on a dark strip, positioned by its center. */
  private box(s: string, tint: number, height = 13) {
    const text = this.text(0, 0, s, tint).setOrigin(0.5);
    const bg = this.add.rectangle(0, 0, text.width + 8, height, 0x000000, 0.55);
    const container = this.add.container(0, 0, [bg, text]);
    container.setSize(bg.width, bg.height);
    return { container, text, bg };
  }

  private drawCompass(width: number, height: number) {
    const g = this.game_;
    const cam = g.cameras.main;
    const c = g.world.center;
    const target = { x: c.x - cam.worldView.x, y: c.y - cam.worldView.y };
    const place = compassPlacement(target, { width, height }, 48, 18);

    this.compass.clear();
    this.compassLabel.setVisible(!!place);
    if (!place) return;

    const x = Math.round(place.x);
    const y = Math.round(place.y);
    const { angle } = place;
    const pt = (dist: number, a: number) => ({ x: x + Math.cos(angle + a) * dist, y: y + Math.sin(angle + a) * dist });
    const tip = pt(7, 0);
    const left = pt(5, 2.5);
    const right = pt(5, -2.5);
    this.compass.fillStyle(0x000000, 0.55).fillCircle(x, y, 10);
    this.compass.lineStyle(1, COLOR.accent, 0.7).strokeCircle(x, y, 10);
    this.compass.fillStyle(COLOR.accent).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);

    const meters = Math.round(Math.hypot(g.tank.x - c.x, g.tank.y - c.y) / 10);
    // Keep the label on the inward side of the arrow so it never leaves the screen.
    this.compassText.setText(toFontText(`Ship ${meters}m`));
    (this.compassLabel.first as Phaser.GameObjects.Rectangle).setSize(this.compassText.width + 8, 13).setOrigin(0.5);
    this.compassLabel.setPosition(Math.round(x - Math.cos(angle) * 34), Math.round(y - Math.sin(angle) * 20));
  }

  private setCounts(inv: Inventory) {
    this.counts.scrap.setText(toFontText(`Scrap   ${inv.scrap}`));
    this.counts.crystal.setText(toFontText(`Crystal ${inv.crystal}`));
  }

  private onCollected({ kind, amount, inventory }: CollectedPayload) {
    this.setCounts(inventory);
    const counter = this.counts[kind];
    const toast = this.text(counter.x + counter.width + 6, counter.y, `+${amount}`, COLOR.accent);
    this.tweens.add({
      targets: toast,
      y: toast.y - 8,
      alpha: 0,
      duration: 900,
      ease: 'Quad.out',
      // Stay on whole pixels while rising.
      onUpdate: () => toast.setY(Math.round(toast.y)),
      onComplete: () => toast.destroy(),
    });
  }
}
