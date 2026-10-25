import * as Phaser from 'phaser';
import { FONT_KEY, toFontText } from '../data/pixelFont';
import { FUEL, HULL, PALETTE, WORKSHOP } from '../data/tuning';
import { compassPlacement } from '../systems/compass';
import type { Inventory } from '../systems/inventory';
import type { ResourceKind } from '../systems/resources';
import { applyAction, objectiveText, type WorkshopAction } from '../systems/workshop';
import {
  COLLECTED_EVENT,
  RESCUED_EVENT,
  WORKSHOP_EVENT,
  WORKSHOP_TUNING,
  type CollectedPayload,
  type GameScene,
  type RescuedPayload,
  type WorkshopPayload,
} from './GameScene';

const COLOR = { text: 0xf3e3c3, dim: 0xc99668, accent: PALETTE.teal, hull: 0x7ec850, fuel: 0xf6a04a, danger: 0xe6463c } as const;
/** Bar length for the base 100 hull; the bar grows with upgrades. */
const BAR_W = 48;
const BAR_X = 35;
const LABELS: Record<ResourceKind, string> = { scrap: 'Scrap', crystal: 'Crystal' };
const WORKSHOP_W = 228;
const WORKSHOP_H = 118;

interface Bar {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  shown: string;
}

interface WorkshopRow {
  action: WorkshopAction;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.BitmapText;
  cost: Phaser.GameObjects.BitmapText;
}

// Screen-space interface drawn over the Game scene. Positions and sizes are in
// game pixels, the same grid as the world art, and text uses the pixel font.
// It reads the Game scene's state each frame rather than owning any of it.
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private counts!: Record<ResourceKind, Phaser.GameObjects.BitmapText>;
  private panel!: Phaser.GameObjects.Rectangle;
  private hullBar!: Bar;
  private fuelBar!: Bar;
  private shownHull = -1;
  private goal!: ReturnType<HudScene['box']>;
  prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.BitmapText;
  private promptBg!: Phaser.GameObjects.Rectangle;
  private safeZone!: Phaser.GameObjects.Container;
  hint!: Phaser.GameObjects.Container;
  private compass!: Phaser.GameObjects.Graphics;
  compassLabel!: Phaser.GameObjects.Container;
  private compassText!: Phaser.GameObjects.BitmapText;
  banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.BitmapText;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerTimer?: Phaser.Time.TimerEvent;
  workshop!: Phaser.GameObjects.Container;
  private rows: WorkshopRow[] = [];
  workshopMessage!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;
    this.shownHull = -1;

    this.panel = this.add.rectangle(4, 4, 0, 60, 0x000000, 0.55).setOrigin(0, 0);
    this.text(9, 9, 'Hull');
    this.hullBar = this.bar(9);
    this.text(9, 20, 'Fuel');
    this.fuelBar = this.bar(20);
    // Half-size icons: nearest sampling keeps them on the grid.
    this.add.image(14, 38, 'scrap').setScale(0.5);
    this.add.image(14, 53, 'crystal').setScale(0.5);
    this.counts = {
      scrap: this.text(26, 34, ''),
      crystal: this.text(26, 49, ''),
    };
    this.goal = this.box('', COLOR.dim);
    this.setCounts(this.game_.inventory);

    ({ container: this.prompt, text: this.promptText, bg: this.promptBg } = this.box('', COLOR.text, 15));
    this.prompt.setVisible(false);

    this.safeZone = this.box('Home base · safe zone', COLOR.accent).container;
    this.hint = this.box('WASD drive · mouse aim · click fire · E salvage/workshop', COLOR.text).container;
    this.compass = this.add.graphics();
    ({ container: this.compassLabel, text: this.compassText } = this.box('', COLOR.accent));

    this.createWorkshop();
    ({ container: this.banner, text: this.bannerText, bg: this.bannerBg } = this.box('', COLOR.danger, 24));
    this.banner.setVisible(false);

    const onCollected = (p: CollectedPayload) => this.onCollected(p);
    const onRescued = (p: RescuedPayload) => this.onRescued(p);
    const onWorkshop = (p: WorkshopPayload) => this.onWorkshop(p);
    this.game.events.on(COLLECTED_EVENT, onCollected);
    this.game.events.on(RESCUED_EVENT, onRescued);
    this.game.events.on(WORKSHOP_EVENT, onWorkshop);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(COLLECTED_EVENT, onCollected);
      this.game.events.off(RESCUED_EVENT, onRescued);
      this.game.events.off(WORKSHOP_EVENT, onWorkshop);
    });
  }

  update() {
    const g = this.game_;
    const { width, height } = this.scale;

    const node = g.nearby;
    const prompt = node
      ? `[E] Salvage ${LABELS[node.kind]} ×${node.amount}`
      : g.docked && !g.workshopOpen
        ? '[E] Open workshop'
        : '';
    this.prompt.setVisible(!!prompt).setPosition(Math.round(width / 2), height - 28);
    if (prompt) {
      this.promptText.setText(toFontText(prompt));
      this.promptBg.setSize(this.promptText.width + 10, 15).setOrigin(0.5);
    }

    this.safeZone.setVisible(g.inSafeZone && !g.workshopOpen).setPosition(Math.round(width / 2), 10);
    this.hint.setPosition(Math.round(this.hint.width / 2) + 4, height - 10);
    // Below the workshop panel while it's open, otherwise clear of the stats panel.
    const bannerY = g.workshopOpen ? height / 2 + WORKSHOP_H / 2 + 16 : height / 3;
    this.banner.setPosition(Math.round(width / 2), Math.round(bannerY));
    this.updateBars();
    this.updateGoal();
    this.updateWorkshop(width, height);
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

  private bar(y: number): Bar {
    const bg = this.add.rectangle(BAR_X, y, BAR_W + 2, 7, 0x000000).setOrigin(0, 0);
    const fill = this.add.rectangle(BAR_X + 1, y + 1, BAR_W, 5, COLOR.hull).setOrigin(0, 0);
    return { bg, fill, shown: '' };
  }

  /** Sizes a bar so its full length is proportional to `max`, in whole pixels. */
  private setBar(bar: Bar, value: number, max: number, baseMax: number, color: number) {
    const full = Math.round((BAR_W * max) / baseMax);
    const filled = Math.max(value > 0 ? 1 : 0, Math.round((full * value) / max));
    const key = `${full}:${filled}:${color}`;
    if (key === bar.shown) return;
    bar.shown = key;
    bar.bg.setSize(full + 2, 7);
    bar.fill.setSize(filled, 5).setFillStyle(color);
  }

  private updateBars() {
    const g = this.game_;
    if (g.hull < this.shownHull) this.cameras.main.flash(120, 120, 20, 20);
    this.shownHull = g.hull;
    this.setBar(this.hullBar, g.hull, g.maxHull, HULL.max, g.hull / g.maxHull > 0.3 ? COLOR.hull : COLOR.danger);
    const lowFuel = g.fuel / g.maxFuel <= FUEL.lowFraction;
    // The low-fuel bar blinks so it's noticed mid-fight.
    const blinkOff = lowFuel && Math.floor(this.time.now / 300) % 2 === 0;
    this.setBar(this.fuelBar, g.fuel, g.maxFuel, FUEL.max, blinkOff ? 0x5a2a20 : lowFuel ? COLOR.danger : COLOR.fuel);
    // The stats panel grows with the hull bar.
    this.panel.setSize(Math.max(84, BAR_X + this.hullBar.bg.width + 1), 60);
  }

  private updateGoal() {
    const g = this.game_;
    const s = toFontText(objectiveText(g.inventory, g.plating, WORKSHOP_TUNING));
    if (this.goal.text.text === s) return;
    this.goal.text.setText(s);
    this.goal.bg.setSize(this.goal.text.width + 8, 13).setOrigin(0.5);
    this.goal.container.setPosition(4 + Math.round(this.goal.bg.width / 2), 73);
  }

  private createWorkshop() {
    const items: [WorkshopAction, string][] = [
      ['refuel', '[1] Refuel'],
      ['repair', '[2] Repair'],
      ['plating', '[3] Craft reinforced plating'],
    ];
    const left = -WORKSHOP_W / 2 + 6;
    const bg = this.add.rectangle(0, 0, WORKSHOP_W, WORKSHOP_H, 0x000000, 0.8).setStrokeStyle(1, COLOR.accent, 0.7);
    const title = this.text(0, -50, 'Workshop', COLOR.accent).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [bg, title];
    items.forEach(([action, label], i) => {
      const y = -38 + i * 24;
      const rowBg = this.add.rectangle(0, y + 10, WORKSHOP_W - 8, 22, COLOR.accent, 0).setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(COLOR.accent, 0.15));
      rowBg.on('pointerout', () => rowBg.setFillStyle(COLOR.accent, 0));
      rowBg.on('pointerdown', () => this.game_.workshopAction(action));
      const row: WorkshopRow = { action, bg: rowBg, label: this.text(left, y + 1, label), cost: this.text(left + 12, y + 11, '', COLOR.dim) };
      this.rows.push(row);
      parts.push(rowBg, row.label, row.cost);
    });
    this.workshopMessage = this.text(0, 36, '', COLOR.accent).setOrigin(0.5);
    const close = this.text(0, 49, '[E] or [Esc] close', COLOR.dim).setOrigin(0.5);
    parts.push(this.workshopMessage, close);
    this.workshop = this.add.container(0, 0, parts).setVisible(false);
  }

  private updateWorkshop(width: number, height: number) {
    const g = this.game_;
    if (!g.workshopOpen) {
      if (this.workshop.visible) this.workshopMessage.setText('');
      this.workshop.setVisible(false);
      return;
    }
    this.workshop.setVisible(true).setPosition(Math.round(width / 2), Math.round(height / 2));
    const r = WORKSHOP.repair;
    const p = WORKSHOP.plating;
    const costs: Record<WorkshopAction, string> = {
      refuel: `Free · fuel ${Math.floor(g.fuel)}/${g.maxFuel}`,
      repair: `${r.scrap} scrap · +${r.hull} hull · ${Math.ceil(g.hull)}/${g.maxHull}`,
      plating: g.plating ? 'Installed' : `${p.scrap} scrap, ${p.crystal} crystal · +${p.maxHull} max hull`,
    };
    const status = { hull: g.hull, fuel: g.fuel, maxFuel: g.maxFuel, inventory: g.inventory, plating: g.plating };
    for (const row of this.rows) {
      row.cost.setText(toFontText(costs[row.action]));
      // Dim what can't be done right now.
      const can = applyAction(status, row.action, WORKSHOP_TUNING).ok;
      row.label.setAlpha(can ? 1 : 0.45);
      row.cost.setAlpha(can ? 1 : 0.45);
    }
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

  private showBanner(message: string, tint: number) {
    this.bannerText.setText(toFontText(message)).setTint(tint);
    this.bannerText.setCenterAlign();
    this.bannerBg.setSize(this.bannerText.width + 12, this.bannerText.height + 8).setOrigin(0.5);
    this.banner.setVisible(true);
    this.bannerTimer?.remove();
    this.bannerTimer = this.time.delayedCall(3500, () => this.banner.setVisible(false));
  }

  private onRescued({ reason, lost }: RescuedPayload) {
    this.setCounts(this.game_.inventory);
    const why = reason === 'fuel' ? 'Out of fuel' : 'Tank disabled';
    this.showBanner(`${why} · rescued to ship\nLost ${lost.scrap} scrap, ${lost.crystal} crystal`, COLOR.danger);
  }

  private onWorkshop({ action, ok, message }: WorkshopPayload) {
    this.setCounts(this.game_.inventory);
    this.workshopMessage.setText(toFontText(message)).setTint(ok ? COLOR.accent : COLOR.danger);
    if (ok && action === 'plating') {
      this.showBanner(`Reinforced plating installed\nMax hull ${this.game_.maxHull} · objective complete`, COLOR.accent);
    }
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
