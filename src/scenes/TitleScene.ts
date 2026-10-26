import * as Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { SAVE } from '../data/tuning';
import { keyOnce } from '../input/keyOnce';
import { browserStorage, clearSave, loadSave } from '../systems/save';
import { saveSummary } from '../systems/saveSummary';
import { Button, UI_TEXT, frame, label } from '../ui/widgets';

const BUTTON_W = 132;
const BUTTON_H = 19;
const GAP = 6;

type Choice = 'continue' | 'new';

// The first thing a player sees: the logo over a backdrop, and Continue / New game.
// A new game over an existing save asks first.
export class TitleScene extends Phaser.Scene {
  private hasSave = false;
  private summary = '';
  private buttons: { id: Choice; button: Button }[] = [];
  private focus = 0;
  private confirm?: Phaser.GameObjects.Container;
  private confirmButtons: Button[] = [];
  private confirmFocus = 0;
  private leaving = false;
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super('Title');
  }

  create() {
    this.leaving = false;
    this.confirm = undefined;
    const storage = browserStorage();
    const save = storage && loadSave(storage, SAVE.key);
    this.hasSave = !!save;
    this.summary = save ? saveSummary(save) : '';

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));

    const kb = this.input.keyboard!;
    const move = (d: number) => () => this.moveFocus(d);
    for (const k of ['UP', 'W']) kb.on(`keydown-${k}`, keyOnce(move(-1)));
    for (const k of ['DOWN', 'S']) kb.on(`keydown-${k}`, keyOnce(move(1)));
    for (const k of ['LEFT', 'A']) kb.on(`keydown-${k}`, keyOnce(move(-1)));
    for (const k of ['RIGHT', 'D']) kb.on(`keydown-${k}`, keyOnce(move(1)));
    for (const k of ['ENTER', 'SPACE', 'E']) kb.on(`keydown-${k}`, keyOnce(() => this.activate()));
    kb.on('keydown-ESC', keyOnce(() => this.closeConfirm()));
    kb.on('keydown-M', keyOnce(() => sfx.toggleMute()));

    // The wind starts here (once the first key or click lets audio play) and carries on into the game.
    sfx.holdLoops(false);
    sfx.setLoop('wind', 0.8);
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  /** Continue the saved game, or (after asking, if there is one) start a new one. */
  choose(id: Choice) {
    if (this.leaving) return;
    if (id === 'continue') return this.start(false);
    if (this.hasSave) return this.openConfirm();
    this.start(true);
  }

  private start(fresh: boolean) {
    if (this.leaving) return;
    this.leaving = true;
    sfx.play('start');
    if (fresh) {
      const storage = browserStorage();
      if (storage) clearSave(storage, SAVE.key);
    }
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Game'));
  }

  private layout() {
    this.layer?.destroy();
    this.buttons = [];
    const { width: W, height: H } = this.scale;
    this.layer = this.add.container(0, 0);

    // Backdrop: scaled by a whole number to cover the screen, anchored to the bottom.
    const bg = this.add.image(0, 0, 'title_bg');
    const s = Math.max(1, Math.ceil(Math.max(W / bg.width, H / bg.height)));
    bg.setScale(s).setOrigin(0.5, 1).setPosition(Math.round(W / 2), H);
    this.layer.add(bg);

    // The logo: 2x where it fits with the menu below it.
    const logo = this.add.image(0, 0, 'title_logo').setOrigin(0, 0);
    const ls = H >= 300 && W >= logo.width * 2 + 32 ? 2 : 1;
    logo.setScale(ls).setPosition(Math.round((W - logo.width * ls) / 2), Math.round(H * 0.06));
    this.layer.add(logo);

    const menuH = (this.hasSave ? 2 : 1) * (BUTTON_H + GAP) + (this.hasSave ? 12 : 0);
    let y = Math.max(logo.y + logo.height * ls + 10, Math.round(H * 0.62 - menuH / 2));
    const x = Math.round((W - BUTTON_W) / 2);
    if (this.hasSave) {
      this.addButton('continue', 'Continue', x, y);
      y += BUTTON_H + 3;
      this.layer.add(this.centered(W / 2, y, this.summary, UI_TEXT.dim, true));
      y += 9 + GAP;
    }
    this.addButton('new', 'New game', x, y);

    this.layer.add(this.centered(W / 2, H - 12, this.hasSave ? 'W/S choose · Enter select · M sound' : 'Enter start · M sound', UI_TEXT.dim, true));
    this.focus = Math.min(this.focus, this.buttons.length - 1);
    this.refreshFocus();

    if (this.confirm) {
      this.confirm.destroy();
      this.confirm = undefined;
      this.openConfirm();
    }
  }

  private addButton(id: Choice, text: string, x: number, y: number) {
    const button = new Button(this, x, y, BUTTON_W, BUTTON_H, () => this.choose(id));
    const t = label(this, 0, 0, text);
    t.setPosition(Math.round((BUTTON_W - t.width) / 2), Math.round((BUTTON_H - 7) / 2));
    button.add(t);
    button.on('pointerover', () => {
      this.focus = this.buttons.findIndex((b) => b.id === id);
      this.refreshFocus();
    });
    this.buttons.push({ id, button });
    this.layer.add(button);
  }

  /** A line of text centered on x, with a dark backing so it reads over the backdrop. */
  private centered(cx: number, y: number, s: string, tint: number, backed = false) {
    const c = this.add.container(0, 0);
    const t = label(this, 0, 0, s, tint);
    const x = Math.round(cx - t.width / 2);
    if (backed) c.add(this.add.rectangle(x - 3, y - 2, Math.round(t.width) + 5, 11, 0x000000, 0.45).setOrigin(0, 0));
    t.setPosition(x, y);
    c.add(t);
    return c;
  }

  private openConfirm() {
    if (this.confirm) return;
    sfx.play('open');
    const { width: W, height: H } = this.scale;
    const pw = 210;
    const ph = 72;
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const c = this.add.container(0, 0);
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0, 0).setInteractive());
    c.add(frame(this, 'ui_panel', px, py, pw, ph));
    for (const [i, line] of ['Start a new game?', 'Your saved tank will be lost.'].entries()) {
      const t = label(this, 0, 0, line, i === 0 ? UI_TEXT.text : UI_TEXT.dim);
      t.setPosition(Math.round(px + (pw - t.width) / 2), py + 10 + i * 11);
      c.add(t);
    }
    const bw = 90;
    this.confirmButtons = [];
    for (const [i, [text, fn]] of ([
      ['Start over', () => this.start(true)],
      ['Cancel', () => this.closeConfirm()],
    ] as const).entries()) {
      const b = new Button(this, px + 10 + i * (pw - 20 - bw), py + ph - BUTTON_H - 9, bw, BUTTON_H, fn);
      const t = label(this, 0, 0, text, i === 0 ? UI_TEXT.danger : UI_TEXT.text);
      t.setPosition(Math.round((bw - t.width) / 2), Math.round((BUTTON_H - 7) / 2));
      b.add(t);
      b.on('pointerover', () => {
        this.confirmFocus = i;
        this.refreshFocus();
      });
      this.confirmButtons.push(b);
      c.add(b);
    }
    this.confirmFocus = 1; // Cancel, so a stray Enter doesn't wipe the save
    this.confirm = c;
    this.refreshFocus();
  }

  private closeConfirm() {
    if (!this.confirm || this.leaving) return;
    this.confirm.destroy();
    this.confirm = undefined;
    this.confirmButtons = [];
    sfx.play('click');
    this.refreshFocus();
  }

  private moveFocus(d: number) {
    if (this.leaving) return;
    if (this.confirm) this.confirmFocus = (this.confirmFocus + d + 2) % 2;
    else this.focus = (this.focus + d + this.buttons.length) % this.buttons.length;
    sfx.play('click');
    this.refreshFocus();
  }

  private activate() {
    if (this.leaving) return;
    if (this.confirm) {
      if (this.confirmFocus === 0) this.start(true);
      else this.closeConfirm();
      return;
    }
    this.choose(this.buttons[this.focus].id);
  }

  private refreshFocus() {
    this.buttons.forEach((b, i) => b.button.setFocused(!this.confirm && i === this.focus));
    this.confirmButtons.forEach((b, i) => b.setFocused(i === this.confirmFocus));
  }
}
