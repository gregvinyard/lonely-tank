import * as Phaser from 'phaser';
import { BURROWERS, WORLD_SIZE } from '../data/tuning';
import {
  calmBurrower,
  newBurrowerBrain,
  stepBurrower,
  underground,
  type BurrowEvent,
  type BurrowerBrain,
  type BurrowerPlacement,
} from '../systems/burrower';
import { clampOutsideCircle, type Vec } from '../systems/drone';
import { createRng } from '../systems/rng';
import type { Circle } from '../systems/steer';

export interface BurrowerWorld {
  player: Vec;
  playerMoving: boolean;
  playerSafe: boolean;
  /** Circles it never tunnels into (the ship's hull, grown by its size). */
  keepOut: readonly Circle[];
  /** Open ground it may rest or surface on. */
  isClear: (p: Vec) => boolean;
  /** Under a rock: no trail is drawn there. */
  underRock: (p: Vec) => boolean;
}

// A creature that tunnels under the sand. Underground it shows only a mound
// (and a fading trail of small mounds while it moves); it bursts out to bite,
// and only then can it be hit. It moves itself (no physics body): it passes
// under rocks, and the scene checks shells and contact by distance.
export class Burrower {
  readonly placement: BurrowerPlacement;
  hp: number = BURROWERS.hp;
  brain: BurrowerBrain;
  readonly sprite: Phaser.GameObjects.Image;
  readonly mound: Phaser.GameObjects.Image;
  private readonly scene: Phaser.Scene;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly rng: () => number;
  private readonly trail: Phaser.GameObjects.Image[] = [];
  private nextTrail = 0;
  private travelled = 0;
  private pos: Vec;

  constructor(scene: Phaser.Scene, p: BurrowerPlacement, dust: Phaser.GameObjects.Particles.ParticleEmitter) {
    this.scene = scene;
    this.placement = p;
    this.dust = dust;
    this.pos = { x: p.x, y: p.y };
    this.brain = newBurrowerBrain(p);
    this.rng = createRng(hashId(p.id));
    this.mound = scene.add.image(p.x, p.y, 'mound').setDepth(3);
    this.sprite = scene.add.image(p.x, p.y, 'burrower').setDepth(7).setVisible(false);
    this.sprite.setData('burrower', this);
  }

  get x() {
    return this.pos.x;
  }

  get y() {
    return this.pos.y;
  }

  /** Out of the sand: the only time it can bite or be hit. */
  get surfaced() {
    return !underground(this.brain.mode);
  }

  update(dtMs: number, w: BurrowerWorld): BurrowEvent | undefined {
    const { brain, velocity, event } = stepBurrower(
      this.brain,
      { pos: this.pos, player: w.player, playerMoving: w.playerMoving, playerSafe: w.playerSafe, dtMs, rng: this.rng, isClear: w.isClear },
      BURROWERS,
    );
    this.brain = brain;

    const before = this.pos;
    let next = { x: before.x + (velocity.x * dtMs) / 1000, y: before.y + (velocity.y * dtMs) / 1000 };
    const edge = BURROWERS.bodyRadius;
    next = { x: Phaser.Math.Clamp(next.x, edge, WORLD_SIZE - edge), y: Phaser.Math.Clamp(next.y, edge, WORLD_SIZE - edge) };
    for (const c of w.keepOut) next = clampOutsideCircle(next, c, c.r);
    this.pos = next;

    // Fading trail behind it while it tunnels, never drawn on top of rocks.
    this.travelled += Math.hypot(this.pos.x - before.x, this.pos.y - before.y);
    if (this.travelled >= BURROWERS.trailEvery) {
      this.travelled = 0;
      if (!w.underRock(before)) this.dropTrail(before);
    }

    // The head mound sits on whole pixels; it shakes while warning.
    const shake = this.brain.mode === 'warn' ? (Math.floor(this.scene.time.now / 60) % 2 === 0 ? 1 : -1) : 0;
    this.mound.setPosition(Math.round(this.pos.x) + shake, Math.round(this.pos.y));
    if (this.brain.mode === 'warn' && this.rng() < dtMs / 90) {
      this.dust.emitParticleAt(this.pos.x + (this.rng() - 0.5) * 16, this.pos.y + (this.rng() - 0.5) * 10, 1);
    }

    if (event === 'surface') this.surface();
    else if (event === 'dive') this.dive();
    return event;
  }

  /** Applies damage with a white flash; returns true if this destroyed it. */
  hit(damage: number): boolean {
    this.hp -= damage;
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => this.sprite.active && this.sprite.clearTint());
    return this.hp <= 0;
  }

  /** Back under the sand and home. */
  calm() {
    this.brain = calmBurrower(this.brain);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setVisible(false);
    this.mound.setVisible(true);
  }

  destroy() {
    for (const t of this.trail) {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this.mound.destroy();
    this.sprite.destroy();
  }

  private surface() {
    const x = Math.round(this.pos.x);
    const y = Math.round(this.pos.y);
    this.mound.setVisible(false);
    this.scene.tweens.killTweensOf(this.sprite);
    // Rise a few whole pixels while fading in (no scaling: stays on the pixel grid).
    this.sprite.setVisible(true).setPosition(x, y + 3).setAlpha(0);
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 120,
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        this.sprite.setY(y + Math.round(3 * (1 - v))).setAlpha(v);
      },
    });
    for (let i = 0; i < 8; i++) this.dust.emitParticleAt(x + (this.rng() - 0.5) * 28, y + (this.rng() - 0.5) * 20, 1);
  }

  private dive() {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 150, onComplete: () => this.sprite.setVisible(false) });
    this.mound.setVisible(true);
    for (let i = 0; i < 4; i++) this.dust.emitParticleAt(this.pos.x + (this.rng() - 0.5) * 20, this.pos.y + (this.rng() - 0.5) * 14, 1);
  }

  private dropTrail(at: Vec) {
    let t = this.trail[this.nextTrail];
    if (!t) {
      t = this.scene.add.image(0, 0, 'mound_trail').setDepth(2);
      this.trail[this.nextTrail] = t;
    }
    this.nextTrail = (this.nextTrail + 1) % BURROWERS.trailPool;
    this.scene.tweens.killTweensOf(t);
    t.setPosition(Math.round(at.x), Math.round(at.y)).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: t, alpha: 0, duration: BURROWERS.trailMs, ease: 'Quad.in', onComplete: () => t.setVisible(false) });
  }

  /** Trail mounds still showing, for tests. */
  get trailVisible(): number {
    return this.trail.filter((t) => t.visible && t.alpha > 0.01).length;
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
