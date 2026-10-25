import * as Phaser from 'phaser';
import { TANK } from '../data/tuning';
import { rotateToward, stepVelocity, type Vec2 } from '../systems/movement';

// The player tank: one logical entity made of a physics-driven hull sprite
// and a free-rotating turret sprite drawn on top. Both textures face +X.
export class Tank {
  readonly hull: Phaser.Physics.Arcade.Image;
  readonly turret: Phaser.GameObjects.Image;
  private readonly body: Phaser.Physics.Arcade.Body;
  /** Pixels the turret is kicked back along its barrel after a shot. */
  private kick = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.hull = scene.physics.add.image(x, y, 'tank_hull').setDepth(10);
    this.turret = scene.add.image(x, y, 'tank_turret').setDepth(11);

    this.body = this.hull.body as Phaser.Physics.Arcade.Body;
    const r = TANK.bodyRadius;
    this.body.setCircle(r, this.hull.width / 2 - r, this.hull.height / 2 - r);
    this.body.setCollideWorldBounds(true);

    // Keep the turret glued to the hull after physics has moved it this frame.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncTurret, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncTurret, this);
    });
  }

  get x() {
    return this.hull.x;
  }

  get y() {
    return this.hull.y;
  }

  get speed() {
    return Math.hypot(this.body.velocity.x, this.body.velocity.y);
  }

  /** input: raw directional input (-1..1 per axis). aim: world point to aim the turret at. */
  update(input: Vec2, aim: Vec2, dtMs: number) {
    const dt = dtMs / 1000;

    // Start from the body's actual velocity so collisions bleed off speed.
    const vel = stepVelocity({ x: this.body.velocity.x, y: this.body.velocity.y }, input, dt, TANK);
    this.body.setVelocity(vel.x, vel.y);

    // Hull swings toward the direction we're asking to drive.
    if (input.x !== 0 || input.y !== 0) {
      const heading = Math.atan2(input.y, input.x);
      this.hull.rotation = rotateToward(this.hull.rotation, heading, TANK.hullTurnRate * dt);
    }

    const aimAngle = Math.atan2(aim.y - this.hull.y, aim.x - this.hull.x);
    this.turret.rotation = rotateToward(this.turret.rotation, aimAngle, TANK.turretTurnRate * dt);
  }

  /** Teleports the tank to a point, stopped and facing right. */
  reset(x: number, y: number) {
    this.body.reset(x, y);
    this.hull.setRotation(0);
    this.syncTurret();
  }

  /** Kicks the turret back a couple of whole pixels; it settles over a few frames. */
  recoil() {
    this.kick = 3;
  }

  private syncTurret() {
    const a = this.turret.rotation;
    this.turret.setPosition(this.hull.x - Math.round(Math.cos(a) * this.kick), this.hull.y - Math.round(Math.sin(a) * this.kick));
    if (this.kick > 0) this.kick = Math.max(0, this.kick - 0.5);
  }
}
