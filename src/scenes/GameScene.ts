import * as Phaser from 'phaser';
import { CAMERA, OBSTACLES, PALETTE, RESOURCES, SHIP, WORLD_SEED, WORLD_SIZE, frameLerp } from '../data/tuning';
import { Tank } from '../entities/Tank';
import { addResource, createInventory, type Inventory } from '../systems/inventory';
import { nearestInRange, type ResourceKind, type ResourceNode } from '../systems/resources';
import { generateWorld, type World } from '../systems/worldgen';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'interact', Phaser.Input.Keyboard.Key>;

/** Emitted on game.events when the player salvages a node. */
export const COLLECTED_EVENT = 'resource-collected';
export interface CollectedPayload {
  kind: ResourceKind;
  amount: number;
  inventory: Inventory;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  tank!: Tank;
  inventory: Inventory = createInventory();
  /** Uncollected resource nodes by stable id. */
  readonly resources = new Map<string, { node: ResourceNode; sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image }>();
  /** The node the tank is close enough to salvage, if any. */
  nearby: ResourceNode | undefined;
  inSafeZone = true;

  private keys!: Keys;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustDistance = 0;

  constructor() {
    super('Game');
  }

  create() {
    this.world = generateWorld(WORLD_SEED);
    this.inventory = createInventory();
    this.resources.clear();
    const { center } = this.world;

    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'terrain_ground').setOrigin(0, 0);

    // Faint ring marking the ship's safe zone.
    this.add
      .circle(center.x, center.y, SHIP.safeRadius)
      .setStrokeStyle(2, PALETTE.teal, 0.25)
      .setFillStyle(PALETTE.teal, 0.04)
      .setDepth(1);

    const solids = this.physics.add.staticGroup();
    for (const r of this.world.rocks) {
      const rock = solids.create(r.x, r.y, 'rock') as Phaser.Physics.Arcade.Image;
      rock.setRotation(r.angle).setDepth(5);
      setCircleBody(rock, OBSTACLES.rockRadius);
    }
    // Scorched crash site under the ship.
    this.add.ellipse(center.x - 8, center.y + 4, 150, 80, 0x2a1a14, 0.35).setDepth(1);
    const ship = solids.create(center.x, center.y, 'spaceship') as Phaser.Physics.Arcade.Image;
    ship.setDepth(6);
    setCircleBody(ship, SHIP.bodyRadius);

    for (const node of this.world.resources) {
      let glow: Phaser.GameObjects.Image | undefined;
      if (node.kind === 'crystal') {
        glow = this.add.image(node.x, node.y, 'glow').setDepth(2).setScale(2);
        this.tweens.add({ targets: glow, alpha: 0.35, scale: 2.4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      const sprite = this.add.image(node.x, node.y, node.kind).setRotation(node.angle).setDepth(4);
      this.resources.set(node.id, { node, sprite, glow });
    }

    this.dust = this.add.particles(0, 0, 'dust', {
      emitting: false,
      lifespan: 600,
      speed: { min: 4, max: 14 },
      scale: { start: 1, end: 2 },
      alpha: { start: 0.6, end: 0 },
    });
    this.dust.setDepth(8);

    this.tank = new Tank(this, this.world.spawn.x, this.world.spawn.y);
    this.physics.add.collider(this.tank.hull, solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    cam.startFollow(this.tank.hull, true, CAMERA.lerp, CAMERA.lerp);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D', interact: 'E' }) as Keys;
    this.keys.interact.on('down', () => this.interact());

    this.scene.launch('Hud');

    if (new URLSearchParams(location.search).has('debug')) {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }
  }

  update(_time: number, delta: number) {
    const k = this.keys;
    const input = {
      x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
      y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
    };

    // Recompute the pointer's world position every frame: the camera moves
    // even when the mouse doesn't.
    const pointer = this.input.activePointer;
    const aim = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    this.tank.update(input, aim, delta);

    // Camera lerp is applied once per frame; scale it so the follow feels the
    // same at 60 Hz and 144 Hz.
    const l = frameLerp(CAMERA.lerp, delta);
    this.cameras.main.setLerp(l, l);
    this.emitDust(delta);

    const nodes = Array.from(this.resources.values(), (r) => r.node);
    this.nearby = nearestInRange(this.tank, nodes, RESOURCES.interactRange);
    const c = this.world.center;
    this.inSafeZone = Math.hypot(this.tank.x - c.x, this.tank.y - c.y) < SHIP.safeRadius;
  }

  private interact() {
    const node = this.nearby;
    if (!node) return;
    const entry = this.resources.get(node.id)!;
    this.resources.delete(node.id);
    this.nearby = undefined;
    this.inventory = addResource(this.inventory, node.kind, node.amount);

    if (entry.glow) {
      this.tweens.killTweensOf(entry.glow);
      entry.glow.destroy();
    }
    this.tweens.add({
      targets: entry.sprite,
      scale: 1.6,
      alpha: 0,
      y: entry.sprite.y - 6,
      duration: 220,
      ease: 'Quad.out',
      onComplete: () => entry.sprite.destroy(),
    });
    this.game.events.emit(COLLECTED_EVENT, {
      kind: node.kind,
      amount: node.amount,
      inventory: this.inventory,
    } satisfies CollectedPayload);
  }

  private emitDust(delta: number) {
    const speed = this.tank.speed;
    if (speed < 20) return;
    this.dustDistance += (speed * delta) / 1000;
    if (this.dustDistance < 14) return;
    this.dustDistance = 0;

    // Puff from both rear tread corners.
    const rot = this.tank.hull.rotation;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const side of [-1, 1]) {
      const lx = -16;
      const ly = side * 14;
      this.dust.emitParticleAt(this.tank.x + lx * cos - ly * sin, this.tank.y + lx * sin + ly * cos, 1);
    }
  }
}

function setCircleBody(img: Phaser.Physics.Arcade.Image, radius: number) {
  const body = img.body as Phaser.Physics.Arcade.StaticBody;
  body.setCircle(radius, img.width / 2 - radius, img.height / 2 - radius);
}
