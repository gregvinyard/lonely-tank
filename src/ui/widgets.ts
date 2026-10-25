import * as Phaser from 'phaser';
import { FONT_KEY, GLYPH_H, toFontText } from '../data/pixelFont';
import { FRAMES } from '../data/uiKit';

// Reusable HUD widgets built from the UI kit. Everything is laid out from the
// top-left on whole pixels so it stays on the game's pixel grid; widgets that
// need centering do it with Math.round, never with a 0.5 origin.

export const UI_TEXT = { text: 0xf3e3c3, dim: 0xc99668, accent: 0x3fb8a8, danger: 0xe6463c, good: 0x7ec850, fuel: 0xf6a04a } as const;

const SLICE: Record<string, number> = Object.fromEntries(FRAMES.map((f) => [f.key, f.slice]));

/** A nine-slice frame from the UI kit, origin top-left. */
export function frame(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number) {
  const s = SLICE[key];
  return scene.add.nineslice(x, y, key, undefined, w, h, s, s, s, s).setOrigin(0, 0);
}

export function label(scene: Phaser.Scene, x: number, y: number, s: string, tint: number = UI_TEXT.text) {
  return scene.add.bitmapText(x, y, FONT_KEY, toFontText(s)).setTint(tint);
}

/** Moves a sized container so its center is at (cx, cy), on whole pixels. */
export function centerOn<T extends Phaser.GameObjects.Container>(c: T, cx: number, cy: number): T {
  return c.setPosition(Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
}

export interface PlateOptions {
  tint?: number;
  icon?: string;
  frameKey?: string;
  minHeight?: number;
  padX?: number;
  padY?: number;
}

/** Text (optionally with a 9x9 icon) on a framed plate that sizes itself to fit. */
export class Plate extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.NineSlice;
  readonly text: Phaser.GameObjects.BitmapText;
  icon?: Phaser.GameObjects.Image;
  private readonly opts: Required<Omit<PlateOptions, 'icon' | 'tint'>>;

  constructor(scene: Phaser.Scene, s: string, o: PlateOptions = {}) {
    super(scene, 0, 0);
    this.opts = { frameKey: o.frameKey ?? 'ui_plate', minHeight: o.minHeight ?? 15, padX: o.padX ?? 5, padY: o.padY ?? 4 };
    this.bg = frame(scene, this.opts.frameKey, 0, 0, 16, 16);
    this.text = label(scene, 0, 0, '', o.tint ?? UI_TEXT.text);
    this.add([this.bg, this.text]);
    if (o.icon) this.setIcon(o.icon);
    scene.add.existing(this);
    this.setLabel(s);
  }

  setIcon(key: string | undefined) {
    if (!key) {
      this.icon?.destroy();
      this.icon = undefined;
    } else if (this.icon) {
      this.icon.setTexture(key);
    } else {
      this.icon = this.scene.add.image(0, 0, key).setOrigin(0, 0);
      this.add(this.icon);
    }
    return this.setLabel(this.text.text);
  }

  setLabel(s: string, tint?: number) {
    this.text.setText(toFontText(s));
    if (tint !== undefined) this.text.setTint(tint);
    const { padX, padY, minHeight } = this.opts;
    const textH = Math.max(GLYPH_H, Math.round(this.text.height) - 1);
    const h = Math.max(minHeight, textH + padY * 2, this.icon ? this.icon.height + 6 : 0);
    let x = padX;
    if (this.icon) {
      this.icon.setPosition(x, Math.round((h - this.icon.height) / 2));
      x += this.icon.width + 3;
    }
    this.text.setPosition(x, Math.round((h - textH) / 2));
    const w = x + Math.round(this.text.width) + padX - 1;
    this.bg.setSize(w, h);
    this.setSize(w, h);
    return this;
  }
}

/** A labelled progress bar whose length grows with its maximum. */
export class Bar extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.NineSlice;
  readonly fill: Phaser.GameObjects.Rectangle;
  private shown = '';

  /** `unit` is the bar length in px for `baseMax`. */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    icon: string,
    private readonly unit: number,
    private readonly baseMax: number,
  ) {
    super(scene, x, y);
    const img = scene.add.image(0, 0, icon).setOrigin(0, 0);
    this.bg = frame(scene, 'ui_bar', img.width + 2, 0, unit + 4, 9);
    this.fill = scene.add.rectangle(img.width + 4, 2, unit, 5, UI_TEXT.good).setOrigin(0, 0);
    this.add([img, this.bg, this.fill]);
    scene.add.existing(this);
  }

  setValue(value: number, max: number, color: number) {
    const full = Math.round((this.unit * max) / this.baseMax);
    const filled = Math.max(value > 0 ? 1 : 0, Math.round((full * value) / max));
    const key = `${full}:${filled}:${color}`;
    if (key === this.shown) return;
    this.shown = key;
    this.bg.setSize(full + 4, 9);
    this.fill.setSize(filled, 5).setFillStyle(color);
    this.setSize(this.bg.x + this.bg.width, 9);
  }
}

/** A framed button with hover, focus and disabled states. */
export class Button extends Phaser.GameObjects.Container {
  readonly bg: Phaser.GameObjects.NineSlice;
  private readonly hover: Phaser.GameObjects.NineSlice;
  private readonly disabledBg: Phaser.GameObjects.NineSlice;
  private enabled = true;
  private hovered = false;
  focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onClick: () => void) {
    super(scene, x, y);
    this.bg = frame(scene, 'ui_button', 0, 0, w, h);
    this.hover = frame(scene, 'ui_button_hover', 0, 0, w, h).setVisible(false);
    this.disabledBg = frame(scene, 'ui_button_disabled', 0, 0, w, h).setVisible(false);
    this.add([this.bg, this.hover, this.disabledBg]);
    this.setSize(w, h);
    // Containers hit-test around their center; give an explicit top-left rectangle instead.
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.on('pointerover', () => this.setHovered(true));
    this.on('pointerout', () => this.setHovered(false));
    this.on('pointerdown', () => onClick());
    scene.add.existing(this);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    return this.refresh();
  }

  setFocused(on: boolean) {
    this.focused = on;
    return this.refresh();
  }

  private setHovered(on: boolean) {
    this.hovered = on;
    this.refresh();
  }

  private refresh() {
    const lit = this.hovered || this.focused;
    this.disabledBg.setVisible(!this.enabled);
    this.hover.setVisible(this.enabled && lit);
    this.bg.setVisible(this.enabled && !lit);
    return this;
  }
}
