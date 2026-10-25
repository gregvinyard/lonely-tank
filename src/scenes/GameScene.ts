import * as Phaser from 'phaser';
import {
  CAMERA,
  CANNON,
  DRONES,
  FUEL,
  HULL,
  OBSTACLES,
  PALETTE,
  RESCUE,
  RESOURCES,
  SAVE,
  SHIP,
  TANK,
  WORKSHOP,
  WORLD_SEED,
  WORLD_SIZE,
  frameLerp,
} from '../data/tuning';
import { sfx } from '../audio/sfx';
import { ROCK_VARIANTS } from '../data/assets';
import { Drone } from '../entities/Drone';
import { Tank } from '../entities/Tank';
import { keyOnce } from '../input/keyOnce';
import { applyDamage, canFire, rescuePenalty } from '../systems/combat';
import { burnFuel } from '../systems/fuel';
import { addResource, createInventory, type Inventory } from '../systems/inventory';
import { nearestInRange, type ResourceKind, type ResourceNode } from '../systems/resources';
import { SAVE_VERSION, browserStorage, clampTank, clearSave, hasSave, loadSave, writeSave, type SaveData } from '../systems/save';
import { applyAction, maxHullFor, type TankStatus, type WorkshopAction, type WorkshopTuning } from '../systems/workshop';
import { generateWorld, type World } from '../systems/worldgen';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'interact' | 'one' | 'two' | 'three', Phaser.Input.Keyboard.Key>;

export const WORKSHOP_TUNING: WorkshopTuning = { baseHull: HULL.max, repair: WORKSHOP.repair, plating: WORKSHOP.plating };

/** Emitted on game.events when the player salvages a node. */
export const COLLECTED_EVENT = 'resource-collected';
export interface CollectedPayload {
  kind: ResourceKind;
  amount: number;
  inventory: Inventory;
}

/** Emitted on game.events when the tank is returned to the ship. */
export const RESCUED_EVENT = 'tank-rescued';
export type RescueReason = 'destroyed' | 'fuel';
export interface RescuedPayload {
  reason: RescueReason;
  lost: Inventory;
}

/** Emitted on game.events after every workshop action, successful or not. */
export const WORKSHOP_EVENT = 'workshop-action';
export interface WorkshopPayload {
  action: WorkshopAction;
  ok: boolean;
  message: string;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  tank!: Tank;
  inventory: Inventory = createInventory();
  hull: number = HULL.max;
  fuel: number = FUEL.max;
  readonly maxFuel = FUEL.max;
  plating = false;
  /** Uncollected resource nodes by stable id. */
  readonly resources = new Map<string, { node: ResourceNode; sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image }>();
  /** Live drones by stable id. */
  readonly drones = new Map<string, Drone>();
  /** Ids of everything collected or destroyed, for the save. */
  readonly collected = new Set<string>();
  readonly destroyed = new Set<string>();
  /** The node the tank is close enough to salvage, if any. */
  nearby: ResourceNode | undefined;
  inSafeZone = true;
  /** Close enough to the ship to open the workshop. */
  docked = false;
  workshopOpen = false;

  private keys!: Keys;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeMs = 0;
  /** True once the low-fuel beep has played, until refueled. */
  private fuelWarned = false;
  private shells!: Phaser.Physics.Arcade.Group;
  private dustDistance = 0;
  private lastFired = -Infinity;
  private invulnUntil = 0;
  /** Set when the workshop closes; holds fire until the mouse button is released. */
  private holdFire = false;

  constructor() {
    super('Game');
  }

  get maxHull() {
    return maxHullFor(this.plating, WORKSHOP_TUNING);
  }

  create() {
    const save = this.readSave();
    this.world = generateWorld(save?.seed ?? WORLD_SEED);
    this.inventory = save?.inventory ?? createInventory();
    this.plating = save?.upgrades.plating ?? false;
    this.hull = this.maxHull;
    this.fuel = this.maxFuel;
    this.resources.clear();
    this.drones.clear();
    this.collected.clear();
    this.destroyed.clear();
    for (const id of save?.collected ?? []) this.collected.add(id);
    for (const id of save?.destroyed ?? []) this.destroyed.add(id);
    this.lastFired = -Infinity;
    this.invulnUntil = 0;
    this.docked = false;
    this.workshopOpen = false;
    this.holdFire = false;
    this.fuelWarned = false;
    this.smokeMs = 0;
    const { center } = this.world;

    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'terrain').setOrigin(0, 0);

    // Faint ring marking the ship's safe zone.
    this.add
      .circle(center.x, center.y, SHIP.safeRadius)
      .setStrokeStyle(2, PALETTE.teal, 0.25)
      .setFillStyle(PALETTE.teal, 0.04)
      .setDepth(1);

    const solids = this.physics.add.staticGroup();
    for (const r of this.world.rocks) {
      // The lighting is baked in, so vary rocks by variant and mirroring, not rotation.
      const keys = ROCK_VARIANTS[r.size].keys;
      const v = rockVariant(r.angle, keys.length);
      const rock = solids.create(r.x, r.y, keys[v.index]) as Phaser.Physics.Arcade.Image;
      rock.setFlipX(v.flip).setDepth(5);
      setCircleBody(rock, OBSTACLES.sizes[r.size].radius);
    }
    // Scorched crash site under the ship.
    this.add.ellipse(center.x - 8, center.y + 4, 150, 80, 0x2a1a14, 0.35).setDepth(1);
    const ship = solids.create(center.x, center.y, 'spaceship') as Phaser.Physics.Arcade.Image;
    ship.setDepth(6);
    setCircleBody(ship, SHIP.bodyRadius);

    for (const node of this.world.resources) if (!this.collected.has(node.id)) this.addResourceNode(node);
    for (const d of save?.drops ?? []) {
      if (!this.collected.has(d.id)) this.addResourceNode({ ...d, kind: 'scrap', angle: 0 });
    }

    this.dust = this.add.particles(0, 0, 'dust', {
      emitting: false,
      lifespan: 600,
      speed: { min: 4, max: 14 },
      alpha: { start: 0.6, end: 0 },
    });
    this.dust.setDepth(8);
    this.sparks = this.add.particles(0, 0, 'spark', {
      emitting: false,
      lifespan: { min: 150, max: 400 },
      speed: { min: 30, max: 120 },
      alpha: { start: 1, end: 0 },
    });
    this.sparks.setDepth(14);
    // Dark smoke from a badly damaged tank.
    this.smoke = this.add.particles(0, 0, 'dust', {
      emitting: false,
      lifespan: 1300,
      speedY: { min: -30, max: -16 },
      speedX: { min: -6, max: 6 },
      alpha: { start: 1, end: 0 },
      tint: 0x1e1819,
    });
    this.smoke.setDepth(15);

    let start = { x: this.world.spawn.x, y: this.world.spawn.y };
    if (save) {
      const t = clampTank(save.tank, this.maxHull, this.maxFuel, WORLD_SIZE, TANK.bodyRadius);
      start = { x: t.x, y: t.y };
      this.hull = t.hull;
      this.fuel = t.fuel;
    }
    this.tank = new Tank(this, start.x, start.y);
    this.physics.add.collider(this.tank.hull, solids);

    const droneGroup = this.physics.add.group();
    for (const p of this.world.drones) if (!this.destroyed.has(p.id)) this.drones.set(p.id, new Drone(this, p, droneGroup));
    this.physics.add.collider(droneGroup, solids);
    this.physics.add.collider(droneGroup, droneGroup);
    this.physics.add.overlap(this.tank.hull, droneGroup, (_t, d) => this.onDroneContact(droneOf(d)));

    this.shells = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.shells, solids, (s) => this.impact(s as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.shells, droneGroup, (s, d) => this.onShellHit(s as Phaser.Physics.Arcade.Image, droneOf(d)));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    cam.centerOn(start.x, start.y);
    cam.startFollow(this.tank.hull, true, CAMERA.lerp, CAMERA.lerp);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      interact: 'E',
      one: 'ONE',
      two: 'TWO',
      three: 'THREE',
    }) as Keys;
    this.keys.interact.on('down', keyOnce(() => this.interact()));
    this.keys.one.on('down', keyOnce(() => this.workshopOpen && this.workshopAction('refuel')));
    this.keys.two.on('down', keyOnce(() => this.workshopOpen && this.workshopAction('repair')));
    this.keys.three.on('down', keyOnce(() => this.workshopOpen && this.workshopAction('plating')));

    // Autosave on a timer and when the page is hidden or closed.
    this.time.addEvent({ delay: SAVE.autosaveMs, loop: true, callback: () => this.save() });
    const onHide = () => document.visibilityState === 'hidden' && this.save();
    const onPageHide = () => this.save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });

    this.input.mouse?.disableContextMenu();
    this.scene.launch('Hud');

    if (new URLSearchParams(location.search).has('debug')) {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }
  }

  update(time: number, delta: number) {
    const k = this.keys;
    // The tank holds still while the workshop is open.
    const input = this.workshopOpen
      ? { x: 0, y: 0 }
      : {
          x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
          y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
        };

    // Recompute the pointer's world position every frame: the camera moves
    // even when the mouse doesn't.
    const pointer = this.input.activePointer;
    const aim = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    this.tank.update(input, aim, delta);
    if (!pointer.leftButtonDown()) this.holdFire = false;
    const firing = pointer.leftButtonDown() && !this.workshopOpen && !this.holdFire;
    if (firing && canFire(time, this.lastFired, CANNON.cooldownMs)) this.fire(time);

    // Camera lerp is applied once per frame; scale it so the follow feels the
    // same at 60 Hz and 144 Hz.
    const l = frameLerp(CAMERA.lerp, delta);
    this.cameras.main.setLerp(l, l);
    this.emitDust(delta);

    this.fuel = burnFuel(this.fuel, this.tank.speed, TANK.maxSpeed, delta, FUEL.perSecond);
    const lowFuel = this.fuel / this.maxFuel <= FUEL.lowFraction;
    if (lowFuel && !this.fuelWarned) sfx.play('lowFuel');
    this.fuelWarned = lowFuel;
    if (this.fuel <= 0) this.rescue('fuel');
    this.emitSmoke(delta);

    const c = this.world.center;
    const fromShip = Math.hypot(this.tank.x - c.x, this.tank.y - c.y);
    this.inSafeZone = fromShip < SHIP.safeRadius;
    const docked = fromShip < WORKSHOP.dockRadius;
    if (docked && !this.docked) this.save();
    this.docked = docked;
    if (!docked) this.workshopOpen = false;

    for (const d of this.drones.values()) d.update(time, delta, this.tank, this.inSafeZone, c, SHIP.safeRadius);

    for (const s of this.shells.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (time - (s.getData('born') as number) > CANNON.lifetimeMs) s.destroy();
    }

    // Blink while invulnerable after a hit.
    const alpha = time < this.invulnUntil && Math.floor(time / 80) % 2 === 0 ? 0.4 : 1;
    this.tank.hull.setAlpha(alpha);
    this.tank.turret.setAlpha(alpha);

    const nodes = Array.from(this.resources.values(), (r) => r.node);
    this.nearby = nearestInRange(this.tank, nodes, RESOURCES.interactRange);
  }

  /** Runs a workshop action; saves when it succeeds. */
  workshopAction(action: WorkshopAction) {
    const status: TankStatus = { hull: this.hull, fuel: this.fuel, maxFuel: this.maxFuel, inventory: this.inventory, plating: this.plating };
    const result = applyAction(status, action, WORKSHOP_TUNING);
    if (result.ok) {
      ({ hull: this.hull, fuel: this.fuel, inventory: this.inventory, plating: this.plating } = result.status);
      this.save();
    }
    sfx.play(!result.ok ? 'deny' : action === 'plating' ? 'craft' : 'ok');
    this.game.events.emit(WORKSHOP_EVENT, { action, ok: result.ok, message: result.message } satisfies WorkshopPayload);
  }

  /** Writes the current progress to localStorage. Returns false if it couldn't. */
  save(): boolean {
    const storage = browserStorage();
    if (!storage) return false;
    const drops = [...this.resources.values()]
      .map((r) => r.node)
      .filter((n) => n.id.endsWith('-drop'))
      .map(({ id, amount, x, y }) => ({ id, amount, x, y }));
    const data: SaveData = {
      version: SAVE_VERSION,
      seed: this.world.seed,
      tank: { x: this.tank.x, y: this.tank.y, hull: this.hull, fuel: this.fuel },
      inventory: this.inventory,
      collected: [...this.collected],
      destroyed: [...this.destroyed],
      drops,
      upgrades: { plating: this.plating },
    };
    return writeSave(storage, SAVE.key, data);
  }

  private readSave(): SaveData | undefined {
    const storage = browserStorage();
    if (!storage) return undefined;
    // ?newgame wipes the save, then drops the flag so a reload resumes.
    const params = new URLSearchParams(location.search);
    if (params.has('newgame')) {
      clearSave(storage, SAVE.key);
      params.delete('newgame');
      const query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
      return undefined;
    }
    const save = loadSave(storage, SAVE.key);
    if (!save && hasSave(storage, SAVE.key)) console.warn('Lonely Tank: ignoring an unreadable save and starting fresh.');
    return save;
  }

  private addResourceNode(node: ResourceNode) {
    let glow: Phaser.GameObjects.Image | undefined;
    if (node.kind === 'crystal') {
      glow = this.add.image(node.x, node.y, 'glow').setDepth(2);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    const sprite = this.add.image(node.x, node.y, node.kind).setRotation(node.angle).setDepth(4);
    this.resources.set(node.id, { node, sprite, glow });
  }

  private interact() {
    if (this.workshopOpen) return this.closeWorkshop();
    const node = this.nearby;
    if (node) return this.collect(node);
    if (this.docked) {
      this.workshopOpen = true;
      sfx.play('open');
      this.save();
    }
  }

  closeWorkshop() {
    if (!this.workshopOpen) return;
    this.workshopOpen = false;
    this.holdFire = true;
  }

  private collect(node: ResourceNode) {
    const entry = this.resources.get(node.id)!;
    this.resources.delete(node.id);
    this.collected.add(node.id);
    this.nearby = undefined;
    this.inventory = addResource(this.inventory, node.kind, node.amount);
    sfx.play('pickup');

    if (entry.glow) {
      this.tweens.killTweensOf(entry.glow);
      entry.glow.destroy();
    }
    // Rise and fade in whole pixels (no scaling, to stay on the pixel grid).
    const startY = entry.sprite.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 220,
      ease: 'Quad.out',
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        entry.sprite.setY(Math.round(startY - v * 6)).setAlpha(1 - v);
      },
      onComplete: () => entry.sprite.destroy(),
    });
    this.game.events.emit(COLLECTED_EVENT, {
      kind: node.kind,
      amount: node.amount,
      inventory: this.inventory,
    } satisfies CollectedPayload);
  }

  private fire(time: number) {
    this.lastFired = time;
    // Fire where the turret actually points (it lags the cursor slightly).
    const a = this.tank.turret.rotation;
    const mx = this.tank.x + Math.cos(a) * CANNON.muzzleOffset;
    const my = this.tank.y + Math.sin(a) * CANNON.muzzleOffset;

    const shell = this.shells.create(mx, my, 'shell') as Phaser.Physics.Arcade.Image;
    shell.setRotation(a).setDepth(13).setData('born', time);
    const body = shell.body as Phaser.Physics.Arcade.Body;
    body.setCircle(2, shell.width / 2 - 2, shell.height / 2 - 2);
    body.setVelocity(Math.cos(a) * CANNON.speed, Math.sin(a) * CANNON.speed);

    const flash = this.add.image(mx, my, 'flash').setDepth(13);
    this.time.delayedCall(50, () => flash.destroy());
    this.tank.recoil();
    sfx.play('fire');
  }

  private impact(shell: Phaser.Physics.Arcade.Image) {
    this.sparks.explode(5, shell.x, shell.y);
    sfx.play('impact');
    shell.destroy();
  }

  private onShellHit(shell: Phaser.Physics.Arcade.Image, drone: Drone) {
    if (!shell.active || !this.drones.has(drone.placement.id)) return;
    this.impact(shell);
    if (drone.hit(CANNON.damage, this.tank, this.time.now)) this.destroyDrone(drone);
    else sfx.play('hit');
  }

  private destroyDrone(drone: Drone) {
    const { x, y } = drone;
    const p = drone.placement;
    this.drones.delete(p.id);
    this.destroyed.add(p.id);
    drone.destroy();

    this.sparks.explode(18, x, y);
    for (let i = 0; i < 6; i++) this.dust.emitParticleAt(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8), 1);
    this.cameras.main.shake(120, 0.004);
    sfx.play('explode');

    if (p.drop > 0) {
      this.addResourceNode({ id: `${p.id}-drop`, kind: 'scrap', amount: p.drop, x: Math.round(x), y: Math.round(y), angle: 0 });
    }
  }

  private onDroneContact(drone: Drone) {
    const now = this.time.now;
    drone.knockFrom(this.tank, now);
    if (now < this.invulnUntil) return;

    this.invulnUntil = now + HULL.hitInvulnMs;
    this.hull = applyDamage(this.hull, DRONES.contactDamage);
    this.cameras.main.shake(150, 0.006);
    this.sparks.explode(8, (this.tank.x + drone.x) / 2, (this.tank.y + drone.y) / 2);
    sfx.play('hurt');
    // Brief red flash on the tank itself.
    for (const part of [this.tank.hull, this.tank.turret]) part.setTint(0xff5040).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(90, () => {
      this.tank.hull.clearTint();
      this.tank.turret.clearTint();
    });
    if (this.hull <= 0) this.rescue('destroyed');
  }

  /** Returns the tank to the ship, repaired and refueled, minus a share of its salvage. */
  rescue(reason: RescueReason) {
    const { inventory, lost } = rescuePenalty(this.inventory, RESCUE.salvageLoss);
    this.inventory = inventory;
    this.hull = this.maxHull;
    this.fuel = this.maxFuel;
    this.invulnUntil = this.time.now + 1500;

    const { spawn } = this.world;
    this.tank.reset(spawn.x, spawn.y);
    for (const d of this.drones.values()) d.brain = { ...d.brain, mode: 'return' };

    // Jump the camera instead of letting the follow smoothing cross the map.
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.centerOn(spawn.x, spawn.y);
    cam.startFollow(this.tank.hull, true, CAMERA.lerp, CAMERA.lerp);
    cam.fadeIn(500, 0, 0, 0);

    this.save();
    sfx.play('rescue');
    this.game.events.emit(RESCUED_EVENT, { reason, lost } satisfies RescuedPayload);
  }

  /** Puffs of smoke while the hull is low. */
  private emitSmoke(delta: number) {
    if (this.hull / this.maxHull > 0.3) return;
    this.smokeMs += delta;
    if (this.smokeMs < 90) return;
    this.smokeMs = 0;
    this.smoke.emitParticleAt(this.tank.x + Phaser.Math.Between(-6, 6), this.tank.y + Phaser.Math.Between(-6, 4), 2);
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

/** Picks a rock's art variant and mirroring from its seeded angle, so the world stays deterministic. */
function rockVariant(angle: number, count: number): { index: number; flip: boolean } {
  const u = (((angle / (Math.PI * 2)) % 1) + 1) % 1;
  const slot = Math.floor(u * count * 2);
  return { index: slot % count, flip: slot >= count };
}

/** Centers a circular static body on its sprite. */
function setCircleBody(img: Phaser.Physics.Arcade.Image, radius: number) {
  const body = img.body as Phaser.Physics.Arcade.StaticBody;
  // StaticBody.setCircle stores an offset without moving the body by it;
  // setOffset does move it, so apply the offset separately.
  body.setCircle(radius).setOffset(img.width / 2 - radius, img.height / 2 - radius);
}

function droneOf(obj: unknown): Drone {
  return (obj as Phaser.GameObjects.GameObject).getData('drone') as Drone;
}
