import * as Phaser from 'phaser';
import { CAMERA, OBSTACLES, WORLD_SEED, WORLD_SIZE, frameLerp, zoomForViewport } from '../data/tuning';
import { Tank } from '../entities/Tank';
import { placeRocks } from '../systems/worldgen';

type Keys = Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private tank!: Tank;
  private keys!: Keys;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustDistance = 0;

  constructor() {
    super('Game');
  }

  create() {
    const center = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };

    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'terrain_ground').setOrigin(0, 0);

    const rocks = this.physics.add.staticGroup();
    for (const r of placeRocks({
      seed: WORLD_SEED,
      count: OBSTACLES.rockCount,
      worldSize: WORLD_SIZE,
      margin: 48,
      center,
      clearRadius: OBSTACLES.clearRadius,
      minSpacing: OBSTACLES.minSpacing,
    })) {
      const rock = rocks.create(r.x, r.y, 'rock') as Phaser.Physics.Arcade.Image;
      rock.setRotation(r.angle).setDepth(5);
      const body = rock.body as Phaser.Physics.Arcade.StaticBody;
      const rad = OBSTACLES.rockRadius;
      body.setCircle(rad, rock.width / 2 - rad, rock.height / 2 - rad);
    }

    this.dust = this.add.particles(0, 0, 'dust', {
      emitting: false,
      lifespan: 600,
      speed: { min: 4, max: 14 },
      scale: { start: 1, end: 2 },
      alpha: { start: 0.6, end: 0 },
    });
    this.dust.setDepth(8);

    this.tank = new Tank(this, center.x, center.y);
    this.physics.add.collider(this.tank.hull, rocks);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    cam.startFollow(this.tank.hull, true, CAMERA.lerp, CAMERA.lerp);
    const applyZoom = () => cam.setZoom(zoomForViewport(this.scale.height));
    applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, applyZoom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, applyZoom));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as Keys;

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
