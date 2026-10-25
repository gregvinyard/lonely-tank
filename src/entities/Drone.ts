import * as Phaser from 'phaser';
import { DRONES } from '../data/tuning';
import { alertBrain, calmBrain, clampOutsideCircle, newBrain, stepDrone, type DroneBrain, type DronePlacement, type Vec } from '../systems/drone';
import { createRng } from '../systems/rng';
import type { Circle } from '../systems/steer';

// A hostile sentry drone. It hovers (a bobbing ground shadow, so the sprite
// itself never scales or rotates off the pixel grid), patrols around its home,
// and chases the tank when it comes close or shoots it, steering around rocks.
export class Drone {
  readonly sprite: Phaser.Physics.Arcade.Image;
  readonly placement: DronePlacement;
  hp: number = DRONES.hp;
  brain: DroneBrain;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly rng: () => number;
  private knockedUntil = 0;
  private bobPhase: number;
  private last: Vec;

  constructor(scene: Phaser.Scene, p: DronePlacement, group: Phaser.Physics.Arcade.Group) {
    this.placement = p;
    this.shadow = scene.add.image(p.x, p.y + 16, 'shadow').setDepth(3);
    this.sprite = scene.physics.add.image(p.x, p.y, 'drone').setDepth(12);
    // Adding to a group applies the group's body defaults, so configure after.
    group.add(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const r = DRONES.bodyRadius;
    this.body.setCircle(r, this.sprite.width / 2 - r, this.sprite.height / 2 - r);
    this.body.setCollideWorldBounds(true);
    this.sprite.setData('drone', this);

    this.brain = newBrain(p);
    this.last = { x: p.x, y: p.y };
    // Per-drone stream so patrols don't depend on frame timing of other drones.
    this.rng = createRng(hashId(p.id));
    this.bobPhase = this.rng() * Math.PI * 2;
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  update(now: number, dtMs: number, player: Vec, playerSafe: boolean, safeCenter: Vec, safeRadius: number, obstacles: readonly Circle[]) {
    const pos = { x: this.x, y: this.y };
    const speed = dtMs > 0 ? (Math.hypot(pos.x - this.last.x, pos.y - this.last.y) * 1000) / dtMs : 0;
    this.last = pos;
    const { brain, velocity } = stepDrone(this.brain, { pos, player, playerSafe, dtMs, rng: this.rng, obstacles, speed }, DRONES);
    this.brain = brain;
    if (now >= this.knockedUntil) this.body.setVelocity(velocity.x, velocity.y);

    // Never inside the ship's safe zone.
    const limit = safeRadius + DRONES.bodyRadius;
    const clamped = clampOutsideCircle({ x: this.x, y: this.y }, safeCenter, limit);
    if (clamped.x !== this.x || clamped.y !== this.y) this.body.reset(clamped.x, clamped.y);

    this.bobPhase += dtMs / 260;
    this.shadow.setPosition(this.x, this.y + 15 + Math.round(Math.sin(this.bobPhase)));
  }

  /** Hunts the player for a while, from any range. */
  alert() {
    this.brain = alertBrain(this.brain, DRONES.alertMs);
  }

  /** Forgets the player and heads home. */
  calm() {
    this.brain = calmBrain(this.brain);
  }

  /** Pushes the drone away from a point for a moment. */
  knockFrom(from: Vec, now: number) {
    const a = Math.atan2(this.y - from.y, this.x - from.x);
    this.body.setVelocity(Math.cos(a) * DRONES.knockback, Math.sin(a) * DRONES.knockback);
    this.knockedUntil = now + 180;
  }

  /** Applies damage with a white flash; returns true if this destroyed it. */
  hit(damage: number, from: Vec, now: number): boolean {
    this.hp -= damage;
    this.knockFrom(from, now);
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.sprite.scene.time.delayedCall(70, () => this.sprite.active && this.sprite.clearTint());
    return this.hp <= 0;
  }

  destroy() {
    this.shadow.destroy();
    this.sprite.destroy();
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
