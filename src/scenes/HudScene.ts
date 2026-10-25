import * as Phaser from 'phaser';
import { PALETTE } from '../data/tuning';
import { compassPlacement } from '../systems/compass';
import type { Inventory } from '../systems/inventory';
import type { ResourceKind } from '../systems/resources';
import { COLLECTED_EVENT, type CollectedPayload, type GameScene } from './GameScene';

const TEXT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '14px',
  color: '#f3e3c3',
};

const LABELS: Record<ResourceKind, string> = { scrap: 'Scrap', crystal: 'Crystal' };

// Screen-space interface drawn over the Game scene, unaffected by camera zoom.
// It reads the Game scene's state each frame rather than owning any of it.
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private counts!: Record<ResourceKind, Phaser.GameObjects.Text>;
  private prompt!: Phaser.GameObjects.Text;
  private safeZone!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private compass!: Phaser.GameObjects.Graphics;
  private compassLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;

    this.add.rectangle(8, 8, 196, 92, 0x000000, 0.45).setOrigin(0, 0);
    this.add.image(28, 28, 'scrap');
    this.add.image(28, 60, 'crystal');
    this.counts = {
      scrap: this.add.text(48, 20, '', TEXT),
      crystal: this.add.text(48, 52, '', TEXT),
    };
    this.add.text(16, 80, 'Salvage and return to the ship', { ...TEXT, fontSize: '11px', color: '#c99668' });
    this.setCounts(this.game_.inventory);

    this.prompt = this.add
      .text(0, 0, '', { ...TEXT, fontSize: '16px', backgroundColor: '#000000aa', padding: { x: 10, y: 6 } })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.safeZone = this.add
      .text(0, 12, 'HOME BASE · SAFE ZONE', { ...TEXT, fontSize: '12px', color: '#3fb8a8', backgroundColor: '#00000088', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 0);
    this.hint = this.add
      .text(12, 0, 'WASD drive  ·  mouse aim  ·  E salvage', { ...TEXT, fontSize: '12px', backgroundColor: '#00000066', padding: { x: 6, y: 4 } })
      .setOrigin(0, 1);

    this.compass = this.add.graphics();
    this.compassLabel = this.add
      .text(0, 0, '', { ...TEXT, fontSize: '12px', color: '#3fb8a8', backgroundColor: '#00000088', padding: { x: 4, y: 2 } })
      .setOrigin(0.5);

    const onCollected = (p: CollectedPayload) => this.onCollected(p);
    this.game.events.on(COLLECTED_EVENT, onCollected);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(COLLECTED_EVENT, onCollected));
  }

  update() {
    const g = this.game_;
    const { width, height } = this.scale;

    const node = g.nearby;
    this.prompt.setVisible(!!node).setPosition(width / 2, height - 48);
    if (node) this.prompt.setText(`[E] Salvage ${LABELS[node.kind].toLowerCase()} ×${node.amount}`);

    this.safeZone.setVisible(g.inSafeZone).setX(width / 2);
    this.hint.setY(height - 8);
    this.drawCompass(width, height);
  }

  private drawCompass(width: number, height: number) {
    const g = this.game_;
    const cam = g.cameras.main;
    const c = g.world.center;
    const target = { x: (c.x - cam.worldView.x) * cam.zoom, y: (c.y - cam.worldView.y) * cam.zoom };
    const place = compassPlacement(target, { width, height }, 48 * cam.zoom, 36);

    this.compass.clear();
    this.compassLabel.setVisible(!!place);
    if (!place) return;

    const { x, y, angle } = place;
    const pt = (dist: number, a: number) => ({ x: x + Math.cos(angle + a) * dist, y: y + Math.sin(angle + a) * dist });
    const tip = pt(14, 0);
    const left = pt(10, 2.5);
    const right = pt(10, -2.5);
    this.compass.fillStyle(0x000000, 0.55).fillCircle(x, y, 20);
    this.compass.lineStyle(2, PALETTE.teal, 0.6).strokeCircle(x, y, 20);
    this.compass.fillStyle(PALETTE.teal).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);

    const meters = Math.round(Math.hypot(g.tank.x - c.x, g.tank.y - c.y) / 10);
    // Keep the label on the inward side of the arrow so it never leaves the screen.
    this.compassLabel.setText(`SHIP ${meters}m`).setPosition(x - Math.cos(angle) * 48, y - Math.sin(angle) * 30);
  }

  private setCounts(inv: Inventory) {
    this.counts.scrap.setText(`${LABELS.scrap.toUpperCase()}   ${inv.scrap}`);
    this.counts.crystal.setText(`${LABELS.crystal.toUpperCase()} ${inv.crystal}`);
  }

  private onCollected({ kind, amount, inventory }: CollectedPayload) {
    this.setCounts(inventory);
    const counter = this.counts[kind];
    this.tweens.add({ targets: counter, scale: 1.25, duration: 90, yoyo: true });
    const toast = this.add.text(counter.x + 110, counter.y, `+${amount}`, { ...TEXT, color: '#3fb8a8' });
    this.tweens.add({ targets: toast, y: toast.y - 14, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => toast.destroy() });
  }
}
