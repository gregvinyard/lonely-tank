import * as Phaser from 'phaser';
import { UPGRADES, type UpgradeDef } from '../data/upgrades';
import { WORKSHOP } from '../data/tuning';
import { RESOURCE_KINDS, type ResourceKind } from '../systems/resources';
import { checkBuild, service } from '../systems/workshop';
import type { GameScene } from '../scenes/GameScene';
import { Button, UI_TEXT, frame, label } from './widgets';

export const WORKSHOP_W = 376;
export const WORKSHOP_H = 196;
const COLS = 4;
const CARD_W = 44;
const CARD_H = 50;
const GAP = 4;
const GRID_X = 8;
const GRID_Y = 50;
const DETAIL_X = GRID_X + COLS * CARD_W + (COLS - 1) * GAP + 6;
const DETAIL_W = WORKSHOP_W - DETAIL_X - 8;

/** Item sprites shown at half size as resource icons. */
export const RESOURCE_ICON: Record<ResourceKind, string> = { scrap: 'scrap', crystal: 'crystal', circuit: 'circuit' };

interface Card {
  def: UpgradeDef;
  button: Button;
  bg: Phaser.GameObjects.NineSlice;
  icon: Phaser.GameObjects.Image;
  pips: Phaser.GameObjects.Graphics;
}

/**
 * The workshop screen: services along the top, a grid of upgrade cards, and
 * a detail pane for the selected card with its cost and a Build button.
 * Mouse: click a card to select it, click Build. Keys: arrows/WASD select,
 * Space/Enter build, 1/2 refuel/repair (handled by the Game scene).
 */
export class WorkshopPanel extends Phaser.GameObjects.Container {
  readonly cards: Card[] = [];
  readonly services: Button[] = [];
  readonly exitButton: Button;
  readonly buildButton: Button;
  readonly message: Phaser.GameObjects.BitmapText;
  selected = 0;
  private readonly counts: Record<ResourceKind, Phaser.GameObjects.BitmapText>;
  private readonly serviceCosts: Phaser.GameObjects.BitmapText[] = [];
  private readonly detail: {
    name: Phaser.GameObjects.BitmapText;
    tier: Phaser.GameObjects.BitmapText;
    next: Phaser.GameObjects.BitmapText;
    effect: Phaser.GameObjects.BitmapText;
    costIcons: Phaser.GameObjects.Image[];
    costText: Phaser.GameObjects.BitmapText[];
    status: Phaser.GameObjects.BitmapText;
    buildLabel: Phaser.GameObjects.BitmapText;
  };

  constructor(
    scene: Phaser.Scene,
    private readonly game_: GameScene,
  ) {
    super(scene, 0, 0);
    this.setSize(WORKSHOP_W, WORKSHOP_H);
    this.add(frame(scene, 'ui_panel', 0, 0, WORKSHOP_W, WORKSHOP_H));
    this.add(label(scene, 10, 8, 'Cargo hold · workshop', UI_TEXT.accent));

    // Resources, right-aligned in the header.
    this.counts = {} as Record<ResourceKind, Phaser.GameObjects.BitmapText>;
    RESOURCE_KINDS.forEach((k, i) => {
      const x = WORKSHOP_W - 150 + i * 48;
      this.add(scene.add.image(x, 4, RESOURCE_ICON[k]).setOrigin(0, 0).setScale(0.5));
      this.counts[k] = label(scene, x + 17, 9, '');
      this.add(this.counts[k]);
    });

    // Services.
    const sw = (WORKSHOP_W - 16 - GAP) / 2;
    (['refuel', 'repair'] as const).forEach((a, i) => {
      const b = new Button(scene, 8 + i * (sw + GAP), 22, sw, 22, () => this.game_.workshopOpen && this.game_.workshopService(a));
      b.add(label(scene, 6, 4, a === 'refuel' ? '[1] Refuel' : `[2] Repair +${WORKSHOP.repair.hull}`));
      const cost = label(scene, 6, 13, '', UI_TEXT.dim);
      b.add(cost);
      this.serviceCosts.push(cost);
      this.services.push(b);
      this.add(b);
    });

    // Upgrade cards.
    UPGRADES.forEach((def, i) => {
      const x = GRID_X + (i % COLS) * (CARD_W + GAP);
      const y = GRID_Y + Math.floor(i / COLS) * (CARD_H + GAP);
      const button = new Button(scene, x, y, CARD_W, CARD_H, () => this.select(i));
      const icon = scene.add.image(6, 5, def.icon).setOrigin(0, 0);
      const pips = scene.add.graphics();
      button.add([icon, pips]);
      this.cards.push({ def, button, bg: button.bg, icon, pips });
      this.add(button);
    });

    // Detail pane.
    const dx = DETAIL_X;
    const dy = GRID_Y;
    this.add(frame(scene, 'ui_plate', dx, dy, DETAIL_W, CARD_H * 2 + GAP));
    const t = (y: number, tint: number) => {
      const b = label(scene, dx + 6, dy + y, '', tint);
      this.add(b);
      return b;
    };
    this.detail = {
      name: t(6, UI_TEXT.accent),
      tier: t(16, UI_TEXT.dim),
      next: t(29, UI_TEXT.dim),
      effect: t(39, UI_TEXT.text),
      costIcons: [],
      costText: [],
      status: t(70, UI_TEXT.danger),
      buildLabel: label(scene, 0, 4, 'Build [Space]'),
    };
    for (let i = 0; i < 3; i++) {
      const icon = scene.add.image(dx + 4 + i * 34, dy + 49, 'scrap').setOrigin(0, 0).setScale(0.5);
      const txt = label(scene, dx + 21 + i * 34, dy + 54, '');
      this.detail.costIcons.push(icon);
      this.detail.costText.push(txt);
      this.add([icon, txt]);
    }
    this.buildButton = new Button(scene, dx + 4, dy + CARD_H * 2 + GAP - 24, DETAIL_W - 8, 20, () => this.buildSelected());
    this.buildButton.add(this.detail.buildLabel);
    this.add(this.buildButton);

    this.message = label(scene, 10, WORKSHOP_H - 32, '', UI_TEXT.accent);
    this.add(this.message);
    const help = label(scene, 10, WORKSHOP_H - 20, 'Arrows select · Space build', UI_TEXT.dim);
    this.add(help);

    // Leaving the menu drives the tank back out of the ship.
    this.exitButton = new Button(scene, WORKSHOP_W - 112, WORKSHOP_H - 26, 104, 20, () => this.game_.workshopOpen && this.game_.exitShip());
    this.exitButton.add(label(scene, 6, 6, 'Leave ship [E]'));
    this.add(this.exitButton);

    this.setVisible(false);
    scene.add.existing(this);
  }

  select(i: number) {
    this.selected = Phaser.Math.Clamp(i, 0, this.cards.length - 1);
    this.refresh();
  }

  /** Moves the selection by whole columns/rows of the grid. */
  move(dx: number, dy: number) {
    const col = (this.selected % COLS) + dx;
    const row = Math.floor(this.selected / COLS) + dy;
    const rows = Math.ceil(this.cards.length / COLS);
    if (col < 0 || col >= COLS || row < 0 || row >= rows) return;
    this.select(row * COLS + col);
  }

  buildSelected() {
    // Only from the open workshop, whatever input reached us.
    if (this.game_.workshopOpen) this.game_.buildUpgrade(this.cards[this.selected].def.id);
  }

  /** Re-reads the Game scene's state; cheap enough to call every frame while open. */
  refresh() {
    const g = this.game_;
    for (const k of RESOURCE_KINDS) setText(this.counts[k], String(g.inventory[k]));

    const status = g.status;
    const fuelOk = service(status, 'refuel', WORKSHOP.repair).ok;
    const repairOk = service(status, 'repair', WORKSHOP.repair).ok;
    this.services[0].setEnabled(fuelOk);
    this.services[1].setEnabled(repairOk);
    setText(this.serviceCosts[0], `Free · fuel ${Math.floor(g.fuel)}/${g.maxFuel}`);
    setText(this.serviceCosts[1], `${WORKSHOP.repair.scrap} scrap · hull ${Math.ceil(g.hull)}/${g.maxHull}`);

    this.cards.forEach((c, i) => {
      const check = checkBuild(g.levels, g.inventory, c.def.id);
      c.button.setFocused(i === this.selected);
      c.button.setEnabled(check.ok || i === this.selected || check.reason === 'max');
      // Locked lines (missing a requirement) are faded out.
      c.icon.setAlpha(!check.ok && check.reason === 'locked' ? 0.35 : 1);
      drawPips(c.pips, g.levels[c.def.id], c.def.tiers.length, check.ok);
    });

    const card = this.cards[this.selected];
    const def = card.def;
    const level = g.levels[def.id];
    const max = def.tiers.length;
    const check = checkBuild(g.levels, g.inventory, def.id);
    const d = this.detail;
    setText(d.name, def.name);
    setText(d.tier, level >= max ? `Tier ${level}/${max} · max` : `Tier ${level}/${max}`);
    const next = def.tiers[level];
    setText(d.next, next ? 'Next tier:' : '');
    setText(d.effect, next ? next.effect : 'Fully upgraded');
    const costKinds = next ? RESOURCE_KINDS.filter((k) => next.cost[k]) : [];
    d.costIcons.forEach((icon, i) => {
      const k = costKinds[i];
      icon.setVisible(!!k);
      d.costText[i].setVisible(!!k);
      if (!k) return;
      icon.setTexture(RESOURCE_ICON[k]);
      const need = next!.cost[k]!;
      setText(d.costText[i], String(need));
      d.costText[i].setTint(g.inventory[k] >= need ? UI_TEXT.text : UI_TEXT.danger);
    });
    setText(d.status, !check.ok && check.reason === 'locked' ? check.message : '');
    this.buildButton.setEnabled(check.ok);
    d.buildLabel.setTint(check.ok ? UI_TEXT.text : UI_TEXT.dim);
    d.buildLabel.setX(Math.round((DETAIL_W - 8 - d.buildLabel.width) / 2));
  }
}

function setText(t: Phaser.GameObjects.BitmapText, s: string) {
  const up = s.toUpperCase();
  if (t.text !== up) t.setText(up);
}

/** Tier pips: filled for built tiers, outlined for the rest; the next one glows when affordable. */
function drawPips(g: Phaser.GameObjects.Graphics, level: number, max: number, canBuild: boolean) {
  g.clear();
  const w = 6;
  const gap = 2;
  const x0 = Math.round((CARD_W - (max * w + (max - 1) * gap)) / 2);
  for (let i = 0; i < max; i++) {
    const x = x0 + i * (w + gap);
    const y = 40;
    g.fillStyle(0x0d0b10).fillRect(x, y, w, 5);
    if (i < level) g.fillStyle(UI_TEXT.accent).fillRect(x + 1, y + 1, w - 2, 3);
    else if (i === level && canBuild) g.fillStyle(UI_TEXT.fuel).fillRect(x + 1, y + 1, w - 2, 3);
    else g.fillStyle(0x2a2c32).fillRect(x + 1, y + 1, w - 2, 3);
  }
}
