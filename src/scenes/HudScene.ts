import * as Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { keyOnce } from '../input/keyOnce';
import { BATTERY, FUEL, HULL } from '../data/tuning';
import { upgradeDef } from '../data/upgrades';
import { compassPlacement } from '../systems/compass';
import type { Inventory } from '../systems/inventory';
import type { ResourceKind } from '../systems/resources';
import { RESOURCE_KINDS } from '../systems/resources';
import { goalText } from '../systems/workshop';
import { RESOURCE_ICON, WorkshopPanel } from '../ui/WorkshopPanel';
import { Bar, Plate, UI_TEXT, centerOn, frame, label } from '../ui/widgets';
import {
  COLLECTED_EVENT,
  RESCUED_EVENT,
  WORKSHOP_EVENT,
  type CollectedPayload,
  type GameScene,
  type RescuedPayload,
  type WorkshopPayload,
} from './GameScene';

const COLOR = { ...UI_TEXT, hull: UI_TEXT.good } as const;
/** Bar length for the base hull/fuel; bars grow with upgrades. */
const BAR_W = 48;
const LABELS: Record<ResourceKind, string> = { scrap: 'Scrap', crystal: 'Crystal', circuit: 'Circuit' };
const KIND_COLOR: Record<ResourceKind, number> = { scrap: 0xc9cdd2, crystal: 0xc9a6f2, circuit: 0x7ec850 };
const PANEL_H = 96;
const HINT_MS = 45000; // the short controls hint fades after this; the pause screen lists them all
const CONTROLS: [string, string][] = [
  ['WASD', 'Drive'],
  ['Mouse', 'Aim turret'],
  ['Left click', 'Fire (hold)'],
  ['E', 'Salvage / enter ship'],
  ['E / Esc', 'Leave ship'],
  ['F', 'Solar panels (stopped)'],
  ['1 / 2', 'Refuel / repair'],
  ['Space', 'Build upgrade'],
  ['M', 'Sound on/off'],
  ['Esc / P', 'Pause'],
];
// Screen-space interface drawn over the Game scene, built from the pixel-art
// UI kit. Positions and sizes are in game pixels on the same grid as the world.
// It reads the Game scene's state each frame rather than owning any of it.
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private scanner!: Phaser.GameObjects.Graphics;
  private scannerLabel!: Plate;
  private counts!: Record<ResourceKind, Phaser.GameObjects.BitmapText>;
  private panel!: Phaser.GameObjects.NineSlice;
  private hullBar!: Bar;
  private fuelBar!: Bar;
  batteryBar!: Bar;
  private shownHull = -1;
  private goal!: Plate;
  /** Goal ladder rung last shown, to celebrate climbing it. */
  private shownGoal = '';
  prompt!: Plate;
  promptText!: Phaser.GameObjects.BitmapText;
  hint!: Plate;
  private compass!: Phaser.GameObjects.Graphics;
  compassLabel!: Plate;
  banner!: Plate;
  bannerText!: Phaser.GameObjects.BitmapText;
  private bannerTimer?: Phaser.Time.TimerEvent;
  workshop!: WorkshopPanel;
  workshopMessage!: Phaser.GameObjects.BitmapText;
  pauseMenu!: Phaser.GameObjects.Container;
  private pauseDim!: Phaser.GameObjects.Rectangle;
  private pausePanel!: Phaser.GameObjects.Container;
  private warning!: Plate;
  toast!: Plate;
  private toastTimer?: Phaser.Time.TimerEvent;
  /** Tracked here because scene.pause() only takes effect on the next step. */
  paused = false;

  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game') as GameScene;
    this.shownHull = -1;
    this.shownGoal = '';
    this.paused = false;

    this.createStatsPanel();
    this.goal = new Plate(this, '', { tint: COLOR.dim });

    this.prompt = new Plate(this, '', { minHeight: 17 }).setVisible(false);
    this.promptText = this.prompt.text;
    this.hint = new Plate(this, 'WASD drive · mouse aim · click fire · E use · Esc pause');
    this.time.delayedCall(HINT_MS, () => this.tweens.add({ targets: this.hint, alpha: 0, duration: 800 }));
    this.warning = new Plate(this, '', { tint: COLOR.danger, icon: 'icon_warn' }).setVisible(false);
    this.toast = new Plate(this, '').setVisible(false);
    this.scanner = this.add.graphics();
    this.scannerLabel = new Plate(this, '').setVisible(false);
    this.compass = this.add.graphics();
    this.compassLabel = new Plate(this, '', { tint: COLOR.accent });

    this.workshop = new WorkshopPanel(this, this.game_);
    this.workshopMessage = this.workshop.message;
    this.banner = new Plate(this, '', { frameKey: 'ui_panel', padX: 9, padY: 9, tint: COLOR.danger }).setVisible(false).setDepth(5);
    this.bannerText = this.banner.text;
    this.createPauseMenu();

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', keyOnce(() => (this.game_.workshopOpen ? this.game_.closeWorkshop() : this.togglePause())));
    kb.on('keydown-P', keyOnce(() => !this.game_.workshopOpen && this.togglePause()));
    kb.on('keydown-M', keyOnce(() => this.showToast(sfx.toggleMute() ? 'Sound off' : 'Sound on')));
    // Workshop navigation (the tank holds still while it's open, so WASD is free).
    const nav = (key: string, fn: () => void) => kb.on(`keydown-${key}`, keyOnce(() => this.game_.workshopOpen && !this.paused && fn()));
    for (const [keys, dx, dy] of [
      [['LEFT', 'A'], -1, 0],
      [['RIGHT', 'D'], 1, 0],
      [['UP', 'W'], 0, -1],
      [['DOWN', 'S'], 0, 1],
    ] as const) {
      for (const k of keys) nav(k, () => this.workshop.move(dx, dy));
    }
    nav('SPACE', () => this.workshop.buildSelected());
    nav('ENTER', () => this.workshop.buildSelected());

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
      : g.nearDoor
        ? '[E] Enter ship · or drive in'
        : '';
    this.prompt.setVisible(!!prompt);
    if (prompt) {
      if (this.promptText.text !== prompt.toUpperCase()) this.prompt.setLabel(prompt);
      centerBottom(this.prompt, width, height - 32);
    }

    this.updateWarning(width);
    this.toast.setPosition(width - 4 - this.toast.width, 4);
    this.hint.setPosition(4, height - 4 - this.hint.height);
    // At the top of the screen while the workshop is open, otherwise just below the tank
    // (the camera keeps it centered), clear of the prompt along the bottom.
    const bannerTop = g.workshopOpen ? 2 : height / 2 + 28;
    this.banner.setPosition(Math.round((width - this.banner.width) / 2), Math.round(bannerTop));
    this.layoutPause(width, height);
    this.updateBars();
    this.updateGoal();
    this.updateWorkshop(width, height);
    this.drawScanner(width, height);
    this.drawCompass(width, height);
  }

  private createStatsPanel() {
    this.panel = frame(this, 'ui_panel', 4, 4, 96, PANEL_H);
    this.hullBar = new Bar(this, 10, 11, 'icon_hull', BAR_W, HULL.max);
    this.fuelBar = new Bar(this, 10, 23, 'icon_fuel', BAR_W, FUEL.max);
    this.batteryBar = new Bar(this, 10, 35, 'icon_battery', BAR_W, BATTERY.max);
    // Half-size item icons: a 2:1 nearest downscale keeps them on the grid.
    this.counts = {} as Record<ResourceKind, Phaser.GameObjects.BitmapText>;
    RESOURCE_KINDS.forEach((k, i) => {
      this.add.image(9, 46 + i * 16, RESOURCE_ICON[k]).setOrigin(0, 0).setScale(0.5);
      this.counts[k] = label(this, 28, 51 + i * 16, '');
    });
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
    // The battery only runs down once the fuel's gone; then it blinks when low.
    const lowBattery = g.battery / g.maxBattery <= BATTERY.lowFraction;
    const batteryBlink = lowBattery && g.fuel <= 0 && g.solarState === 'stowed' && Math.floor(this.time.now / 300) % 2 === 0;
    this.batteryBar.setValue(g.battery, g.maxBattery, batteryBlink ? 0x1c3a36 : lowBattery ? COLOR.danger : COLOR.battery);
    // The stats panel grows with the longest bar or count.
    const right = Math.max(
      this.hullBar.x + this.hullBar.width,
      this.fuelBar.x + this.fuelBar.width,
      this.batteryBar.x + this.batteryBar.width,
      ...Object.values(this.counts).map((t) => t.x + Math.round(t.width)),
    );
    this.panel.setSize(right + 7 - this.panel.x, PANEL_H);
  }

  private updateGoal() {
    const g = this.game_;
    const s = goalText(g.levels);
    if (this.goal.text.text !== s.toUpperCase()) {
      // A new rung (but not the one shown at start-up) means the last goal was met.
      if (this.shownGoal) this.showToast('Goal complete!', 'icon_up', 3000);
      this.shownGoal = s;
      this.goal.setLabel(s);
    }
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
    let tint: number = COLOR.danger;
    if (!g.inShip) {
      const charge = Math.floor((g.battery / g.maxBattery) * 100);
      if (g.solarState !== 'stowed') {
        tint = COLOR.accent;
        const ready = g.battery >= BATTERY.foldAt * g.maxBattery;
        s = g.solarState === 'out' ? `Solar charging · ${charge}%${ready ? '' : ` · drive at ${BATTERY.foldAt * 100}%`}` : 'Solar panels';
      } else if (g.stranded) s = 'Battery flat · [F] deploy solar panels';
      else if (g.fuel <= 0) s = `Fuel empty · battery ${charge}%`;
      else if (g.fuel / g.maxFuel <= FUEL.lowFraction) s = 'Low fuel · return to ship';
      else if (g.hull / g.maxHull <= 0.3) s = 'Hull critical · repair at ship';
    }
    this.warning.setVisible(!!s);
    if (!s) return;
    this.warning.setIcon(tint === COLOR.danger ? 'icon_warn' : 'icon_battery');
    if (this.warning.text.text !== s.toUpperCase() || this.warningTint !== tint) this.warning.setLabel(s, tint);
    this.warningTint = tint;
    centerOn(this.warning, width / 2, 12);
  }

  private warningTint: number = COLOR.danger;

  showToast(message: string, icon?: string, ms = 1500) {
    this.toast.setIcon(icon);
    this.toast.setLabel(message, icon ? COLOR.accent : COLOR.text).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(ms, () => this.toast.setVisible(false));
  }

  private updateWorkshop(width: number, height: number) {
    const open = this.game_.workshopOpen;
    if (!open) {
      if (this.workshop.visible) this.workshopMessage.setText('');
      this.workshop.setVisible(false);
      return;
    }
    this.workshop.setVisible(true);
    centerOn(this.workshop, width / 2, height / 2);
    this.workshop.refresh();
  }

  /** Salvage scanner: a marker over the nearest node, or an edge arrow toward it; tier 2 adds type and range. */
  private drawScanner(width: number, height: number) {
    const g = this.game_;
    const node = g.nearestSalvage;
    this.scanner.clear();
    this.scannerLabel.setVisible(false);
    if (!node || g.workshopOpen) return;
    const view = g.cameras.main.worldView;
    const color = KIND_COLOR[node.kind];
    const sx = Math.round(node.x - view.x);
    const sy = Math.round(node.y - view.y);
    const bob = Math.floor(this.time.now / 250) % 2;
    const place = compassPlacement({ x: sx, y: sy }, { width, height }, 8, 14);
    if (!place) {
      // A small chevron hovering over it.
      const y = sy - 16 - bob;
      this.scanner.fillStyle(0x0d0b10).fillTriangle(sx - 5, y - 1, sx + 5, y - 1, sx, y + 5);
      this.scanner.fillStyle(color).fillTriangle(sx - 3, y, sx + 3, y, sx, y + 3);
      return;
    }
    const x = Math.round(place.x);
    const y = Math.round(place.y);
    const a = place.angle;
    const pt = (d: number, o: number) => ({ x: x + Math.cos(a + o) * d, y: y + Math.sin(a + o) * d });
    const tip = pt(6 + bob, 0);
    const l = pt(4, 2.4);
    const rr = pt(4, -2.4);
    this.scanner.fillStyle(0x0d0b10).fillCircle(x, y, 6);
    this.scanner.fillStyle(color).fillTriangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y);
    if (g.stats.scanner >= 2) {
      const meters = Math.round(Math.hypot(g.tank.x - node.x, g.tank.y - node.y) / 10);
      const s = `${LABELS[node.kind]} ${meters}m`;
      if (this.scannerLabel.text.text !== s.toUpperCase()) this.scannerLabel.setLabel(s, color);
      this.scannerLabel.setVisible(true);
      centerOn(this.scannerLabel, x - Math.cos(a) * 30, y - Math.sin(a) * 16);
    }
  }

  private drawCompass(width: number, height: number) {
    const g = this.game_;
    const cam = g.cameras.main;
    const c = g.world.center;
    const target = { x: c.x - cam.worldView.x, y: c.y - cam.worldView.y };
    // Keep the compass above the prompt and hint plates along the bottom.
    const floor = this.prompt.visible ? this.prompt.y : this.hint.alpha > 0 ? this.hint.y : height;
    // Hidden while any part of the (big) ship is on screen.
    const place = compassPlacement(target, { width, height: floor - 4 }, 110, 18);

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
    const why = reason === 'destroyed' ? 'Tank disabled' : 'Rescued';
    const parts = RESOURCE_KINDS.filter((k) => lost[k] > 0).map((k) => `${lost[k]} ${k}`);
    this.showBanner(`${why} · rescued to ship\n${parts.length ? `Lost ${parts.join(', ')}` : 'No salvage lost'}`, COLOR.danger, 'icon_warn');
  }

  private onWorkshop({ ok, message, built }: WorkshopPayload) {
    this.setCounts(this.game_.inventory);
    this.workshopMessage.setText(message.toUpperCase()).setTint(ok ? COLOR.accent : COLOR.danger);
    if (built) {
      const def = upgradeDef(built.id);
      const max = built.tier >= def.tiers.length;
      this.showBanner(`${def.name} ${built.tier} built\n${max ? 'Fully upgraded' : def.tiers[built.tier - 1].effect}`, COLOR.accent, def.icon);
    }
  }

  private setCounts(inv: Inventory) {
    for (const k of RESOURCE_KINDS) this.counts[k].setText(`${LABELS[k].toUpperCase().padEnd(8)}${inv[k]}`);
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
