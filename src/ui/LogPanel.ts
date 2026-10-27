import * as Phaser from 'phaser';
import { CELL_W, toFontText } from '../data/pixelFont';
import { UI_TEXT, frame, label } from './widgets';

// A crew log playing back: a framed panel with a title, the speaker, and the
// words typing out as if over the radio. The HUD pauses the game while it's
// open; E, Space, Enter, Esc or a click first finishes the text, then closes.

const W = 320;
const PAD = 10;
const LINE_H = 10;
/** Characters typed per second. */
const RATE = 90;

/** Splits text into lines of at most `max` characters, at spaces. */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export class LogPanel extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly speaker: Phaser.GameObjects.BitmapText;
  private readonly bodyText: Phaser.GameObjects.BitmapText;
  private readonly footer: Phaser.GameObjects.BitmapText;
  private lines: string[] = [];
  private total = 0;
  private shown = 0;
  private startedAt = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.bg = frame(scene, 'ui_panel', 0, 0, W, 60);
    this.title = label(scene, PAD, 9, '', UI_TEXT.accent);
    this.speaker = label(scene, PAD, 21, '', UI_TEXT.dim);
    this.bodyText = label(scene, PAD, 36, '', UI_TEXT.text);
    this.bodyText.setLineSpacing(LINE_H - 7 - 1);
    this.footer = label(scene, PAD, 0, '', UI_TEXT.dim);
    this.add([this.bg, this.title, this.speaker, this.bodyText, this.footer]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  /** Every character is showing. */
  get done() {
    return this.shown >= this.total;
  }

  open(title: string, speaker: string, text: string, now: number) {
    this.lines = wrapText(text, Math.floor((W - PAD * 2) / CELL_W));
    this.total = this.lines.join('\n').length;
    this.shown = 0;
    this.startedAt = now;
    this.title.setText(toFontText(title));
    this.speaker.setText(toFontText(speaker));
    // Measure the whole text once, so the panel fits it however the font spaces its lines.
    this.bodyText.setText(toFontText(this.lines.join('\n')));
    const h = 36 + Math.ceil(this.bodyText.height) + 20;
    this.bodyText.setText('');
    this.footer.setY(h - 16);
    this.bg.setSize(W, h);
    this.setSize(W, h);
    this.setVisible(true);
    this.render();
  }

  /** Shows the rest of the text at once. */
  finish() {
    this.shown = this.total;
    this.render();
  }

  update(now: number) {
    if (!this.visible) return;
    const n = Math.min(this.total, Math.floor(((now - this.startedAt) / 1000) * RATE));
    if (n > this.shown) {
      this.shown = n;
      this.render();
    }
  }

  private render() {
    this.bodyText.setText(toFontText(this.lines.join('\n').slice(0, this.shown)));
    const s = this.done ? '[E] close' : '[E] skip';
    if (this.footer.text !== toFontText(s)) {
      this.footer.setText(toFontText(s));
      this.footer.setX(W - PAD - Math.round(this.footer.width));
    }
  }
}
