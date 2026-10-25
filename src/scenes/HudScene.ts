import * as Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { keyOnce } from '../input/keyOnce';
import { FUEL, HULL, WORKSHOP } from '../data/tuning';
import { compassPlacement } from '../systems/compass';
import type { Inventory } from '../systems/inventory';
import type { ResourceKind } from '../systems/resources';
import { applyAction, objectiveText, type WorkshopAction } from '../systems/workshop';
import { Bar, Button, Plate, UI_TEXT, centerOn, frame, label } from '../ui/widgets';
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

const COLOR = { ...UI_TEXT, hull: UI_TEXT.good } as const;
/** Bar length for the base hull/fuel; bars grow with upgrades. */
const BAR_W = 48;
const LABELS: Record<ResourceKind, string> = { scrap: 'Scrap', crystal: 'Crystal' };
const HINT_MS = 45000; // the short controls hint fades after this; the pause screen lists them all
const CONTROLS: [string, string][] = [
  ['WASD', 'Drive'],
  ['Mouse', 'Aim turret'],
  ['Left click', 'Fire (hold)'],
  ['E', 'Salvage / workshop'],
  ['1 2 3', 'Workshop actions'],
  ['M', 'Sound on/off'],
  ['Esc / P', 'Pause'],
];
const WORKSHOP_W = 232;
const WORKSHOP_H = 128;

interface WorkshopRow {
  action: WorkshopAction;
  button: Button;
  /** The button's frame; tests click its bounds. */
  bg: Phaser.GameObjects.NineSlice;
  label: Phaser.GameObjects.BitmapText;
  cost: Phaser.GameObjects.BitmapText;
}

// Screen-space interface drawn over the Game scene, built from the pixel-art
// UI kit. Positions and sizes are in game pixels on the same grid as the world.
// It reads the Game scene's state each frame rather than owning any of it.
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private counts!: Record<ResourceKind, Phaser.GameObjects.BitmapText>;
  private panel!: Phaser.GameObjects.NineSlice;
  private hullBar!: Bar;
  private fuelBar!: Bar;
  private shownHull = -1;
  private goal!: Plate;
  prompt!: Plate;
  promptText!: Phaser.GameObjects.BitmapText;
  private safeZone!: Plate;
  hint!: Plate;
  private compass!: Phaser.GameObjects.Graphics;
  compassLabel!: Plate;
  banner!: Plate;
  bannerText!: Phaser.GameObjects.BitmapText;
  private bannerTimer?: Phaser.Time.TimerEvent;
  workshop!: Phaser.GameObjects.Container;
  private rows: WorkshopRow[] = [];
  workshopMessage!: Phaser.GameObjects.BitmapText;
  pauseMenu!: Phaser.GameObjects.Container;
  private pauseDim!: Phaser.GameObjects.Rectangle;
  private pausePanel!: Phaser.GameObjects.Container;
  private warning!: Plate;
  private toast!: Plate;
  private toastTimer?: Phaser.Time.TimerEvent;
  /** Tracked here because scene.pause() only takes effect on the next step. */
  paused = false;

  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;
    this.shownHull = -1;
    this.paused = false;
    this.rows = [];

    this.createStatsPanel();
    this.goal = new Plate(this, '', { tint: COLOR.dim });

    this.prompt = new Plate(this, '', { minHeight: 17 }).setVisible(false);
    this.promptText = this.prompt.text;
    this.safeZone = new Plate(this, 'Home base · safe zone', { tint: COLOR.accent });
    this.hint = new Plate(this, 'WASD drive · mouse aim · click fire · E use · Esc pause');
    this.time.delayedCall(HINT_MS, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 800 }));
    this.warning = new Plate(this, '', { tint: COLOR.danger, icon: 'icon_warn' }).setVisible(false);
    this.toast = new Plate(this, '').setVisible(false);
    this.compass = this.add.graphics();
    this.compassLabel = new Plate(this, '', { tint: COLOR.accent });

    this.createWorkshop();
    this.banner = new Plate(this, '', { frameKey: 'ui_panel', padX: 9, padY: 9, tint: COLOR.danger }).setVisible(false).setDepth(5);
    this.bannerText = this.banner.text;
    this.createPauseMenu();

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', keyOnce(() => (this.game_.workshopOpen ? this.game_.closeWorkshop() : this.togglePause())));
    kb.on('keydown-P', keyOnce(() => !this.game_.workshopOpen && this.togglePause()));
    kb.on('keydown-M', keyOnce(() => this.showToast(sfx.toggleMute() ? 'Sound off' : 'Sound on')));

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
    this.prompt.setVisible(!!prompt);
    if (prompt) {
      if (this.promptText.text !== prompt.toUpperCase()) this.prompt.setLabel(prompt);
      centerBottom(this.prompt, width, height - 32);
    }

    this.safeZone.setVisible(g.inSafeZone && !g.workshopOpen);
    centerOn(this.safeZone, width / 2, 12);
    this.updateWarning(width);
    this.toast.setPosition(width - 4 - this.toast.width, 4);
    this.hint.setPosition(4, height - 4 - this.hint.height);
    // Below the workshop panel while it's open, otherwise just under the goal plate.
    const bannerTop = g.workshopOpen ? height / 2 + WORKSHOP_H / 2 + 6 : this.goal.y + this.goal.height + 6;
    this.banner.setPosition(Math.round((width - this.banner.width) / 2), Math.round(bannerTop));
    this.layoutPause(width, height);
    this.updateBars();
    this.updateGoal();
    this.updateWorkshop(width, height);
    this.drawCompass(width, height);
  }

  private createStatsPanel() {
    this.panel = frame(this, 'ui_panel', 4, 4, 96, 68);
    this.hullBar = new Bar(this, 10, 11, 'icon_hull', BAR_W, HULL.max);
    this.fuelBar = new Bar(this, 10, 23, 'icon_fuel', BAR_W, FUEL.max);
    // Half-size item icons: a 2:1 nearest downscale keeps them on the grid.
    this.add.image(9, 34, 'scrap').setOrigin(0, 0).setScale(0.5);
    this.add.image(9, 50, 'crystal').setOrigin(0, 0).setScale(0.5);
    this.counts = {
      scrap: label(this, 28, 39, ''),
      crystal: label(this, 28, 55, ''),
    };
    this.setCounts(this.game_.inventory);
  }

  private updateBars() {
    const g = this.game_;
    if (g.hull < this.shownHull) this.cameras.main.flash(120, 120, 20, 20);
    this.shownHull = g.hull;
    this.hullBar.setValue(g.hull, g.maxHull, g.hull / g.maxHull > 0.3 ? COLOR.hull : COLOR.danger);
    const lowFuel = g.fuel / g.maxFuel <= FUEL.lowFraction;
    // The low-fuel bar blinks so it's noticed mid-fight.
    const blinkOff = lowFuel && Math.floor(this.time.now / 300) % 2 === 0;
    this.fuelBar.setValue(g.fuel, g.maxFuel, blinkOff ? 0x5a2a20 : lowFuel ? COLOR.danger : COLOR.fuel);
    // The stats panel grows with the longest bar or count.
    const right = Math.max(
      this.hullBar.x + this.hullBar.width,
      this.fuelBar.x + this.fuelBar.width,
      ...Object.values(this.counts).map((t) => t.x + Math.round(t.width)),
    );
    this.panel.setSize(right + 7 - this.panel.x, 68);
  }

  private updateGoal() {
    const g = this.game_;
    const s = objectiveText(g.inventory, g.plating, WORKSHOP_TUNING);
    if (this.goal.text.text !== s.toUpperCase()) this.goal.setLabel(s);
    this.goal.setPosition(4, this.panel.y + this.panel.height + 2);
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.scene.pause('Game');
    } else {
      this.scene.resume('Game');
      // Keys released while paused would otherwise stay held.
      this.game_.input.keyboard?.resetKeys();
    }
    this.pauseMenu.setVisible(this.paused);
  }

  private createPauseMenu() {
    const w = 204;
    const h = 136;
    this.pauseDim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setOrigin(0, 0);
    const parts: Phaser.GameObjects.GameObject[] = [frame(this, 'ui_panel', 0, 0, w, h)];
    const title = label(this, 0, 9, 'Paused', COLOR.accent);
    title.setX(Math.round((w - title.width) / 2));
    parts.push(title);
    CONTROLS.forEach(([key, what], i) => {
      const y = 22 + i * 11;
      parts.push(label(this, 12, y, key, COLOR.text), label(this, 86, y, what, COLOR.dim));
    });
    const saves = label(this, 0, 104, 'Progress saves automatically', COLOR.dim);
    const resume = label(this, 0, 117, '[Esc] resume', COLOR.text);
    for (const t of [saves, resume]) t.setX(Math.round((w - t.width) / 2));
    parts.push(saves, resume);
    this.pausePanel = this.add.container(0, 0, parts).setSize(w, h);
    this.pauseMenu = this.add.container(0, 0, [this.pauseDim, this.pausePanel]).setVisible(false).setDepth(10);
  }

  private layoutPause(width: number, height: number) {
    this.pauseDim.setSize(width, height);
    centerOn(this.pausePanel, width / 2, height / 2);
  }

  private updateWarning(width: number) {
    const g = this.game_;
    let s = '';
    if (!g.inSafeZone) {
      if (g.fuel / g.maxFuel <= FUEL.lowFraction) s = 'Low fuel · return to ship';
      else if (g.hull / g.maxHull <= 0.3) s = 'Hull critical · repair at ship';
    }
    this.warning.setVisible(!!s);
    if (!s) return;
    if (this.warning.text.text !== s.toUpperCase()) this.warning.setLabel(s);
    centerOn(this.warning, width / 2, 12);
  }

  private showToast(message: string) {
    this.toast.setLabel(message).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(1500, () => this.toast.setVisible(false));
  }

  private createWorkshop() {
    const items: [WorkshopAction, string][] = [
      ['refuel', '[1] Refuel'],
      ['repair', '[2] Repair'],
      ['plating', '[3] Craft reinforced plating'],
    ];
    const parts: Phaser.GameObjects.GameObject[] = [frame(this, 'ui_panel', 0, 0, WORKSHOP_W, WORKSHOP_H)];
    const title = label(this, 0, 9, 'Workshop', COLOR.accent);
    title.setX(Math.round((WORKSHOP_W - title.width) / 2));
    parts.push(title);
    items.forEach(([action, text], i) => {
      const button = new Button(this, 6, 20 + i * 26, WORKSHOP_W - 12, 24, () => this.game_.workshopAction(action));
      const row: WorkshopRow = {
        action,
        button,
        bg: button.bg,
        label: label(this, 6, 5, text),
        cost: label(this, 14, 14, '', COLOR.dim),
      };
      button.add([row.label, row.cost]);
      this.rows.push(row);
      parts.push(button);
    });
    this.workshopMessage = label(this, 0, 100, '', COLOR.accent);
    const close = label(this, 0, 113, '[E] or [Esc] close', COLOR.dim);
    close.setX(Math.round((WORKSHOP_W - close.width) / 2));
    parts.push(this.workshopMessage, close);
    this.workshop = this.add.container(0, 0, parts).setSize(WORKSHOP_W, WORKSHOP_H).setVisible(false);
  }

  private updateWorkshop(width: number, height: number) {
    const g = this.game_;
    if (!g.workshopOpen) {
      if (this.workshop.visible) this.workshopMessage.setText('');
      this.workshop.setVisible(false);
      return;
    }
    centerOn(this.workshop.setVisible(true), width / 2, height / 2);
    this.workshopMessage.setX(Math.round((WORKSHOP_W - this.workshopMessage.width) / 2));
    const r = WORKSHOP.repair;
    const p = WORKSHOP.plating;
    const costs: Record<WorkshopAction, string> = {
      refuel: `Free · fuel ${Math.floor(g.fuel)}/${g.maxFuel}`,
      repair: `${r.scrap} scrap · +${r.hull} hull · ${Math.ceil(g.hull)}/${g.maxHull}`,
      plating: g.plating ? 'Installed' : `${p.scrap} scrap, ${p.crystal} crystal · +${p.maxHull} max hull`,
    };
    const status = { hull: g.hull, fuel: g.fuel, maxFuel: g.maxFuel, inventory: g.inventory, plating: g.plating };
    for (const row of this.rows) {
      const cost = costs[row.action].toUpperCase();
      if (row.cost.text !== cost) row.cost.setText(cost);
      // Grey out what can't be done right now.
      const can = applyAction(status, row.action, WORKSHOP_TUNING).ok;
      row.button.setEnabled(can);
      row.label.setTint(can ? COLOR.text : COLOR.dim);
    }
  }

  private drawCompass(width: number, height: number) {
    const g = this.game_;
    const cam = g.cameras.main;
    const c = g.world.center;
    const target = { x: c.x - cam.worldView.x, y: c.y - cam.worldView.y };
    // Keep the compass above the prompt and hint plates along the bottom.
    const floor = this.prompt.visible ? this.prompt.y : this.hint.alpha > 0 ? this.hint.y : height;
    const place = compassPlacement(target, { width, height: floor - 4 }, 48, 18);

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
    this.compass.fillStyle(0x17151b, 0.92).fillCircle(x, y, 10);
    this.compass.lineStyle(1, 0x5f636b).strokeCircle(x, y, 10);
    this.compass.lineStyle(1, COLOR.accent, 0.8).strokeCircle(x, y, 8);
    this.compass.fillStyle(COLOR.accent).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);

    const meters = Math.round(Math.hypot(g.tank.x - c.x, g.tank.y - c.y) / 10);
    const s = `Ship ${meters}m`;
    if (this.compassLabel.text.text !== s.toUpperCase()) this.compassLabel.setLabel(s);
    // Keep the label on the inward side of the arrow so it never leaves the screen.
    centerOn(this.compassLabel, x - Math.cos(angle) * 36, y - Math.sin(angle) * 22);
  }

  private showBanner(message: string, tint: number, icon?: string) {
    this.bannerText.setCenterAlign();
    this.banner.setIcon(icon);
    this.banner.setLabel(message, tint).setVisible(true);
    this.bannerTimer?.remove();
    this.bannerTimer = this.time.delayedCall(3500, () => this.banner.setVisible(false));
  }

  private onRescued({ reason, lost }: RescuedPayload) {
    this.setCounts(this.game_.inventory);
    const why = reason === 'fuel' ? 'Out of fuel' : 'Tank disabled';
    this.showBanner(`${why} · rescued to ship\nLost ${lost.scrap} scrap, ${lost.crystal} crystal`, COLOR.danger, 'icon_warn');
  }

  private onWorkshop({ action, ok, message }: WorkshopPayload) {
    this.setCounts(this.game_.inventory);
    this.workshopMessage.setText(message.toUpperCase()).setTint(ok ? COLOR.accent : COLOR.danger);
    if (ok && action === 'plating') {
      this.showBanner(`Reinforced plating installed\nMax hull ${this.game_.maxHull} · objective complete`, COLOR.accent, 'icon_up');
    }
  }

  private setCounts(inv: Inventory) {
    this.counts.scrap.setText(`SCRAP   ${inv.scrap}`);
    this.counts.crystal.setText(`CRYSTAL ${inv.crystal}`);
  }

  private onCollected({ kind, amount, inventory }: CollectedPayload) {
    this.setCounts(inventory);
    const counter = this.counts[kind];
    const toast = label(this, counter.x + Math.round(counter.width) + 6, counter.y, `+${amount}`, COLOR.accent);
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

/** Centers a plate horizontally with its bottom edge at `bottom`. */
function centerBottom(p: Plate, width: number, bottom: number) {
  p.setPosition(Math.round((width - p.width) / 2), Math.round(bottom - p.height));
}
