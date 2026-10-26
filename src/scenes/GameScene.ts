import * as Phaser from 'phaser';
import {
  BATTERY,
  BURROWERS,
  CAMERA,
  CANNON,
  DRONES,
  FUEL,
  HULL,
  OBSTACLES,
  PLANET,
  RESCUE,
  RESOURCES,
  RESPAWN,
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
import { noUpgrades, type UpgradeId, type UpgradeLevels } from '../data/upgrades';
import { Burrower } from '../entities/Burrower';
import { Drone } from '../entities/Drone';
import type { BurrowEvent } from '../systems/burrower';
import { Tank } from '../entities/Tank';
import { keyOnce } from '../input/keyOnce';
import { applyDamage, canFire, rescuePenalty } from '../systems/combat';
import { stepPower, stranded } from '../systems/power';
import { addResource, createInventory, type Inventory } from '../systems/inventory';
import { nearestInRange, type ResourceKind, type ResourceNode } from '../systems/resources';
import { SAVE_VERSION, browserStorage, clampTank, clearSave, hasSave, loadSave, writeSave, type SaveData, type SavedDrop } from '../systems/save';
import { UPGRADE_EFFECTS, computeStats, type TankStats } from '../systems/stats';
import { build, service, type ActionResult, type ServiceAction, type TankStatus } from '../systems/workshop';
import { dueForRespawn } from '../systems/respawn';
import { atDoorway, doorMouth, doorTarget, entryPath, hullAt, inFrontOfDoor, overHull, sheltered, stepDoor, type ShipState } from '../systems/ship';
import type { Circle } from '../systems/steer';
import { generateWorld, type World } from '../systems/worldgen';
import { BIOMES, type BiomeId } from '../data/biomes';
import { biomeAt } from '../systems/biome';
import { chunkContent, chunkKey, chunkOf, chunkOfId, type ChunkContent, type FuelSeep, type Landmark } from '../systems/chunks';
import { pushOut } from '../systems/terrain';
import { Planet } from '../world/Planet';

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'interact' | 'one' | 'two' | 'solar', Phaser.Input.Keyboard.Key>;

/** Solar panels: folded away under the tank, sliding out, out and charging, or sliding back in. */
export type SolarState = 'stowed' | 'deploying' | 'out' | 'folding';

/** Longest frame counted toward play time, so a tab coming back from the background doesn't jump the clock. */
const MAX_FRAME_MS = 250;

/** Emitted on game.events when the player salvages a node. */
export const COLLECTED_EVENT = 'resource-collected';
export interface CollectedPayload {
  kind: ResourceKind;
  amount: number;
  inventory: Inventory;
}

/** Emitted on game.events when the tank crosses into a biome, or comes across a landmark. */
export const DISCOVERY_EVENT = 'planet-discovery';
export interface DiscoveryPayload {
  /** 'biome': crossed into a biome (first: never been there before). 'landmark': found one. */
  type: 'biome' | 'landmark';
  title: string;
  subtitle: string;
  first: boolean;
}

/** Emitted on game.events when the tank siphons a fuel seep. */
export const SIPHON_EVENT = 'fuel-siphoned';

/** Emitted on game.events when the tank is returned to the ship. */
export const RESCUED_EVENT = 'tank-rescued';
export type RescueReason = 'destroyed';
export interface RescuedPayload {
  reason: RescueReason;
  lost: Inventory;
}

/** Emitted on game.events after every workshop action, successful or not. */
export const WORKSHOP_EVENT = 'workshop-action';
export interface WorkshopPayload {
  action: ServiceAction | UpgradeId;
  ok: boolean;
  message: string;
  /** Set when an upgrade tier was built. */
  built?: { id: UpgradeId; tier: number };
}

export class GameScene extends Phaser.Scene {
  world!: World;
  tank!: Tank;
  inventory: Inventory = createInventory();
  levels: UpgradeLevels = noUpgrades();
  /** Current stats from the upgrade levels; recomputed whenever they change. */
  stats: TankStats = computeStats(this.levels);
  hull = this.stats.maxHull;
  fuel = this.stats.maxFuel;
  /** The drive battery; the motor runs off it and the fuel generator keeps it charged. */
  battery: number = BATTERY.max;
  solarState: SolarState = 'stowed';
  /** How far the solar panels are out, 0 (folded) to 1 (fully out). */
  solarOut = 0;
  /** Milliseconds of unpaused play; drives respawns. */
  playTimeMs = 0;
  /** Uncollected resource nodes by stable id. */
  readonly resources = new Map<string, { node: ResourceNode; sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image }>();
  /** Live drones by stable id. */
  readonly drones = new Map<string, Drone>();
  /** Live burrowers by stable id. */
  readonly burrowers = new Map<string, Burrower>();
  /** Everything collected or destroyed, with the play time it happened at. */
  readonly collected = new Map<string, number>();
  readonly destroyed = new Map<string, number>();
  /** The salvage nearest the tank, for the scanner. */
  nearestSalvage: ResourceNode | undefined;
  /** The node the tank is close enough to salvage, if any. */
  nearby: ResourceNode | undefined;
  /** The planet beyond the home square, streamed in around the tank. */
  planet!: Planet;
  /** Fuel seeps in the loaded chunks, by id. */
  readonly seeps = new Map<string, { seep: FuelSeep; sprite: Phaser.GameObjects.Image }>();
  /** The seep the tank is close enough to siphon, if any. */
  nearbySeep: FuelSeep | undefined;
  /** The biome under the tank. */
  biome: BiomeId = 'flats';
  /** Chunks the tank has been near (for the map), and biomes and landmarks found. */
  readonly explored = new Set<string>();
  readonly discovered = new Set<string>();
  /** Where the tank is relative to the ship: outside, rolling in or out, or parked inside. */
  shipState: ShipState = 'outside';
  readonly shipLayout = SHIP.layout;
  /** Cargo door openness, 0 (shut) to 1 (open). */
  doorOpen = 0;
  /** The ship menu (workshop) is showing; only while parked inside. */
  workshopOpen = false;

  private keys!: Keys;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeMs = 0;
  /** True once the low-fuel beep has played, until refueled. */
  private fuelWarned = false;
  private shells!: Phaser.Physics.Arcade.Group;
  private droneGroup!: Phaser.Physics.Arcade.Group;
  /** The cargo door shutter; it slides up into the hull to open. */
  private door!: Phaser.GameObjects.Image;
  private shipSmokeMs = 0;
  /** The menu has been shown for this stay in the ship. */
  private menuShown = false;
  /** Leaving: the tank has started rolling out of the open door. */
  private rollingOut = false;
  /** The two solar panels, either side of the tank. */
  private panels: Phaser.GameObjects.Image[] = [];
  /** The home square's rocks and the ship, grown by a drone's radius, for steering. */
  private homeDroneObstacles: Circle[] = [];
  /** The home square's rock collision circles. */
  private homeRockCircles: Circle[] = [];
  /** Home and planet obstacles together, rebuilt when the loaded chunks change. */
  private obstacleCache = { version: -1, rocks: [] as Circle[], drone: [] as Circle[] };
  private dustDistance = 0;
  private lastFired = -Infinity;
  private invulnUntil = 0;
  /** Scene time of the last hit, for the field repair kit. */
  private lastHitAt = -Infinity;
  /** Set when the workshop closes; holds fire until the mouse button is released. */
  private holdFire = false;

  constructor() {
    super('Game');
  }

  get maxHull() {
    return this.stats.maxHull;
  }

  get maxFuel() {
    return this.stats.maxFuel;
  }

  get maxBattery() {
    return BATTERY.max;
  }

  /** Out of fuel and charge: it can't move until the solar panels recharge it. */
  get stranded() {
    return stranded({ fuel: this.fuel, battery: this.battery });
  }

  create() {
    const save = this.readSave();
    this.world = generateWorld(save?.seed ?? WORLD_SEED);
    this.inventory = save?.inventory ?? createInventory();
    this.levels = save?.upgrades ?? noUpgrades();
    this.stats = computeStats(this.levels);
    this.playTimeMs = save?.playTimeMs ?? 0;
    this.hull = this.maxHull;
    this.fuel = this.maxFuel;
    this.battery = this.maxBattery;
    this.solarState = 'stowed';
    this.solarOut = 0;
    this.resources.clear();
    this.drones.clear();
    this.burrowers.clear();
    this.collected.clear();
    this.destroyed.clear();
    const worldIds = new Set(this.world.resources.map((n) => n.id));
    for (const e of save?.collected ?? []) if (worldIds.has(e.id) || chunkOfId(e.id)) this.collected.set(e.id, e.at);
    this.seeps.clear();
    this.explored.clear();
    this.discovered.clear();
    for (const k of save?.explored ?? []) this.explored.add(k);
    for (const k of save?.discovered ?? []) this.discovered.add(k);
    for (const e of save?.destroyed ?? []) this.destroyed.set(e.id, e.at);
    this.lastFired = -Infinity;
    this.invulnUntil = 0;
    this.lastHitAt = -Infinity;
    this.shipState = 'outside';
    this.doorOpen = 0;
    this.workshopOpen = false;
    this.holdFire = false;
    this.fuelWarned = false;
    this.smokeMs = 0;
    const { center } = this.world;

    const B = PLANET.bounds;
    this.physics.world.setBounds(B.min, B.min, B.max - B.min, B.max - B.min);
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'terrain').setOrigin(0, 0);

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
    this.add.ellipse(center.x - 6, center.y + 6, 380, 270, 0x2a1a14, 0.3).setDepth(1);
    this.add.ellipse(center.x + 20, center.y - 10, 250, 180, 0x2a1a14, 0.25).setDepth(1);
    // The ship draws over the tank, so a tank rolling through the door
    // disappears into the dark hold. Its hull is a set of invisible circles.
    this.add.image(center.x, center.y, 'spaceship').setDepth(11.5);
    for (const c of hullAt(center, SHIP.layout)) {
      const part = solids.create(c.x, c.y, '__DEFAULT') as Phaser.Physics.Arcade.Image;
      part.setVisible(false);
      setCircleBody(part, c.r);
    }
    const door = SHIP.layout.door;
    // The bay floor and ramp sit under the tank; the shutter closes over it.
    this.add.image(center.x + door.x, center.y + door.y, 'ship_bay').setOrigin(0, 0).setDepth(9);
    this.door = this.add.image(center.x + door.x, center.y + door.y, 'ship_door').setOrigin(0, 0).setDepth(11.6);
    this.shipSmokeMs = 0;

    for (const node of this.world.resources) if (!this.collected.has(node.id)) this.addResourceNode(node);
    for (const d of save?.drops ?? []) {
      if (!this.collected.has(d.id)) this.addResourceNode({ ...d, angle: 0, dropped: true });
    }

    this.dust = this.add.particles(0, 0, 'dust', {
      emitting: false,
      lifespan: 750,
      speed: { min: 4, max: 14 },
      alpha: { start: 0.85, end: 0 },
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
      const t = clampTank(save.tank, this.maxHull, this.maxFuel, PLANET.bounds, TANK.bodyRadius, this.maxBattery);
      this.battery = t.battery;
      // Older saves often parked the tank where the (now much bigger) ship is.
      const onShip = overHull({ x: t.x - center.x, y: t.y - center.y }, SHIP.layout, TANK.bodyRadius + 2);
      if (!onShip) start = { x: t.x, y: t.y };
      this.hull = t.hull;
      this.fuel = t.fuel;
    }
    this.tank = new Tank(this, start.x, start.y);
    // Solar panels tuck under the tank (drawn below the hull) and slide out sideways.
    this.panels = [0, 1].map((i) => this.add.image(0, 0, 'solar_panel').setFlipY(i === 1).setDepth(9.5).setVisible(false));
    // Teleporting the tank (rescue, tests) cancels any trip through the door and folds the panels.
    this.tank.onReset = () => {
      this.leaveShipNow();
      this.foldSolarNow();
    };
    this.physics.add.collider(this.tank.hull, solids);

    this.homeRockCircles = this.world.rocks.map((r) => ({ x: r.x, y: r.y, r: OBSTACLES.sizes[r.size].radius }));
    for (const p of this.world.burrowers) if (!this.destroyed.has(p.id)) this.burrowers.set(p.id, new Burrower(this, p, this.dust));
    const grow = DRONES.bodyRadius + DRONES.obstacleMargin;
    this.homeDroneObstacles = [
      ...this.world.rocks.map((r) => ({ x: r.x, y: r.y, r: OBSTACLES.sizes[r.size].radius + grow })),
      ...hullAt(center, SHIP.layout, grow),
    ];
    const droneGroup = (this.droneGroup = this.physics.add.group());
    for (const p of this.world.drones) if (!this.destroyed.has(p.id)) this.drones.set(p.id, new Drone(this, p, droneGroup));
    this.physics.add.collider(droneGroup, solids);
    this.physics.add.collider(droneGroup, droneGroup);
    this.physics.add.overlap(this.tank.hull, droneGroup, (_t, d) => this.onDroneContact(droneOf(d)));

    this.shells = this.physics.add.group({ allowGravity: false });
    this.physics.add.collider(this.shells, solids, (s) => this.impact(s as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.shells, droneGroup, (s, d) => this.onShellHit(s as Phaser.Physics.Arcade.Image, droneOf(d)));

    // The rest of the planet streams in round the tank.
    this.planet = new Planet(this, this.world.seed, solids, {
      onLoad: (c) => this.onChunkLoad(c),
      onUnload: (c) => this.onChunkUnload(c),
    });
    this.planet.update(start.x, start.y, true);
    // A tank saved somewhere that is now impassable is moved to open ground.
    const free = pushOut(this.planet.features, start.x, start.y, TANK.bodyRadius + 2);
    if (free) this.tank.reset(start.x + free.x, start.y + free.y);
    this.biome = biomeAt(this.world.seed, start.x, start.y).biome;
    this.discovered.add(`biome:${this.biome}`);

    const cam = this.cameras.main;
    cam.setBounds(B.min, B.min, B.max - B.min, B.max - B.min);
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
      solar: 'F',
    }) as Keys;
    this.keys.interact.on('down', keyOnce(() => this.interact()));
    this.keys.one.on('down', keyOnce(() => this.workshopOpen && this.workshopService('refuel')));
    this.keys.two.on('down', keyOnce(() => this.workshopOpen && this.workshopService('repair')));
    this.keys.solar.on('down', keyOnce(() => this.toggleSolar()));

    this.time.addEvent({ delay: RESPAWN.checkMs, loop: true, callback: () => this.respawn() });

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
    // A fresh (or repaired) save from the start, so a reload never loses the session.
    this.save();

    if (new URLSearchParams(location.search).has('debug')) {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }
  }

  update(time: number, delta: number) {
    const k = this.keys;
    // The tank holds still while the workshop is open.
    const wanted = this.workshopOpen
      ? { x: 0, y: 0 }
      : {
          x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0),
          y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0),
        };
    // Driving takes charge and the panels put away.
    this.updateSolar(delta, wanted.x !== 0 || wanted.y !== 0);
    const input = this.battery > 0 && this.solarState === 'stowed' ? wanted : { x: 0, y: 0 };

    // Recompute the pointer's world position every frame: the camera moves
    // even when the mouse doesn't.
    const pointer = this.input.activePointer;
    const aim = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    this.playTimeMs += Math.min(delta, MAX_FRAME_MS);
    const st = this.stats;
    const outside = this.shipState === 'outside';
    // In the ship, or rolling through its door, the ship drives the tank.
    // The planet: stream chunks in round the tank, and keep it off cliffs, out of canyons and lakes.
    this.planet.update(this.tank.x, this.tank.y);
    if (outside) this.resolveTerrain();
    if (outside) this.tank.update(input, aim, delta, st);
    else this.tank.turret.setRotation(this.tank.hull.rotation);
    if (!pointer.leftButtonDown()) this.holdFire = false;
    const firing = pointer.leftButtonDown() && outside && !this.holdFire;
    if (firing && canFire(time, this.lastFired, st.cooldownMs)) this.fire(time);

    // Camera lerp is applied once per frame; scale it so the follow feels the
    // same at 60 Hz and 144 Hz.
    const l = frameLerp(CAMERA.lerp, delta);
    this.cameras.main.setLerp(l, l);
    this.emitDust(delta);

    const power = stepPower(
      { fuel: this.fuel, battery: this.battery },
      {
        throttle: outside ? this.tank.speed / st.maxSpeed : 0,
        solar: this.solarState === 'out',
        dtMs: delta,
        maxFuel: this.maxFuel,
        maxBattery: this.maxBattery,
      },
      BATTERY,
    );
    this.fuel = power.fuel;
    // In the ship, it charges off the ship.
    this.battery = this.inShip ? this.maxBattery : power.battery;
    const lowFuel = this.fuel / this.maxFuel <= FUEL.lowFraction;
    if (lowFuel && !this.fuelWarned) sfx.play('lowFuel');
    this.fuelWarned = lowFuel;
    this.emitSmoke(delta);
    this.fieldRepair(time, delta);

    this.updateShip(delta);

    const obstacles = this.obstacles().drone;
    for (const d of this.drones.values()) {
      // Each drone only steers round what's near it.
      const near = obstacles.filter((o) => Math.abs(o.x - d.x) < 360 && Math.abs(o.y - d.y) < 360);
      d.update(time, delta, this.tank, this.inShip, near);
    }

    this.updateBurrowers(delta);

    for (const s of this.shells.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (time - (s.getData('born') as number) > st.shellLifetimeMs) s.destroy();
      // Shells fly over canyons and lakes but hit a cliff.
      else if (this.planet.ground(s.x, s.y).kind.startsWith('mesa')) this.impact(s);
    }

    // Blink while invulnerable after a hit.
    const alpha = time < this.invulnUntil && Math.floor(time / 80) % 2 === 0 ? 0.4 : 1;
    this.tank.hull.setAlpha(alpha);
    this.tank.turret.setAlpha(alpha);

    const nodes = Array.from(this.resources.values(), (r) => r.node);
    this.nearby = nearestInRange(this.tank, nodes, RESOURCES.interactRange);
    this.nearestSalvage = st.scanner > 0 ? nearestInRange(this.tank, nodes, Infinity) : undefined;
    this.nearbySeep = this.nearby ? undefined : nearestInRange(this.tank, Array.from(this.seeps.values(), (s) => s.seep), RESOURCES.interactRange);
    this.explore();
  }

  /** Pushes the tank back out of impassable ground, and stops it driving further in. */
  private resolveTerrain() {
    const body = this.tankBody;
    const push = pushOut(this.planet.features, body.center.x, body.center.y, TANK.bodyRadius);
    if (!push || (push.x === 0 && push.y === 0)) return;
    body.position.x += push.x;
    body.position.y += push.y;
    body.updateCenter();
    const len = Math.hypot(push.x, push.y);
    const nx = push.x / len;
    const ny = push.y / len;
    const into = body.velocity.x * nx + body.velocity.y * ny;
    if (into < 0) body.velocity.set(body.velocity.x - into * nx, body.velocity.y - into * ny);
  }

  /** Home and planet obstacles: rocks (for burrowers) and everything solid, grown for drones. */
  private obstacles() {
    const c = this.obstacleCache;
    if (c.version !== this.planet.version) {
      const grow = DRONES.bodyRadius + DRONES.obstacleMargin;
      c.version = this.planet.version;
      c.rocks = [...this.homeRockCircles, ...this.planet.circles];
      c.drone = [...this.homeDroneObstacles, ...this.planet.circles.map((o) => ({ x: o.x, y: o.y, r: o.r + grow }))];
    }
    return c;
  }

  /** Marks the map, notices biome crossings and landmarks. */
  private explore() {
    const t = this.tank;
    const { cx, cy } = chunkOf(t.x, t.y);
    const key = chunkKey(cx, cy);
    if (!this.explored.has(key)) {
      // The map shows a chunk once the tank has been in or right next to it.
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.explored.add(chunkKey(cx + i, cy + j));
    }
    const biome = biomeAt(this.world.seed, t.x, t.y).biome;
    if (biome !== this.biome) {
      this.biome = biome;
      const id = `biome:${biome}`;
      const first = !this.discovered.has(id);
      this.discovered.add(id);
      const def = BIOMES[biome];
      this.game.events.emit(DISCOVERY_EVENT, { type: 'biome', title: def.name, subtitle: def.blurb, first } satisfies DiscoveryPayload);
    }
    for (const c of this.planet.contents()) {
      for (const lm of c.landmarks) {
        if (this.discovered.has(lm.id) || Math.hypot(t.x - lm.x, t.y - lm.y) > PLANET.discoverRadius) continue;
        this.discovered.add(lm.id);
        sfx.play('ok');
        this.game.events.emit(DISCOVERY_EVENT, { type: 'landmark', title: lm.name, subtitle: 'Landmark found', first: true } satisfies DiscoveryPayload);
      }
    }
  }

  /** Landmarks found so far (for the map), rebuilt from their chunks. */
  get foundLandmarks(): Landmark[] {
    const out: Landmark[] = [];
    for (const id of this.discovered) {
      const c = chunkOfId(id);
      if (!id.startsWith('lm@') || !c) continue;
      const lm = chunkContent(this.world.seed, c.cx, c.cy).landmarks.find((l) => l.id === id);
      if (lm) out.push(lm);
    }
    return out;
  }

  /** A chunk came into range: put out its salvage, seeps and hostiles. */
  private onChunkLoad(c: ChunkContent) {
    for (const node of c.resources) if (!this.collected.has(node.id) && !this.resources.has(node.id)) this.addResourceNode(node);
    for (const s of c.seeps) if (!this.collected.has(s.id) && !this.seeps.has(s.id)) this.addSeep(s);
    for (const p of c.drones) if (!this.destroyed.has(p.id) && !this.drones.has(p.id)) this.drones.set(p.id, new Drone(this, p, this.droneGroup));
    for (const p of c.burrowers) {
      if (!this.destroyed.has(p.id) && !this.burrowers.has(p.id)) this.burrowers.set(p.id, new Burrower(this, p, this.dust));
    }
  }

  /** A chunk went out of range: take its things away (nothing is lost; it all comes back). */
  private onChunkUnload(c: ChunkContent) {
    for (const node of c.resources) {
      const r = this.resources.get(node.id);
      if (!r) continue;
      this.removeNodeSprites(r);
      this.resources.delete(node.id);
    }
    for (const s of c.seeps) {
      this.seeps.get(s.id)?.sprite.destroy();
      this.seeps.delete(s.id);
    }
    for (const p of c.drones) {
      this.drones.get(p.id)?.destroy();
      this.drones.delete(p.id);
    }
    for (const p of c.burrowers) {
      this.burrowers.get(p.id)?.destroy();
      this.burrowers.delete(p.id);
    }
  }

  private removeNodeSprites(r: { sprite: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image }) {
    if (r.glow) {
      this.tweens.killTweensOf(r.glow);
      r.glow.destroy();
    }
    this.tweens.killTweensOf(r.sprite);
    r.sprite.destroy();
  }

  private addSeep(seep: FuelSeep, fadeIn = false) {
    const sprite = this.add.image(seep.x, seep.y, 'seep', seep.frame).setDepth(2.5);
    this.seeps.set(seep.id, { seep, sprite });
    if (fadeIn) {
      sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: 800 });
    }
  }

  /** Draws fuel from a seep into the tanks; it seeps back in time. */
  private siphon(seep: FuelSeep) {
    if (this.fuel >= this.maxFuel - 0.5) return;
    const entry = this.seeps.get(seep.id)!;
    this.seeps.delete(seep.id);
    this.collected.set(seep.id, this.playTimeMs);
    this.nearbySeep = undefined;
    const before = this.fuel;
    this.fuel = Math.min(this.maxFuel, this.fuel + seep.amount);
    sfx.play('pickup');
    this.tweens.add({ targets: entry.sprite, alpha: 0, duration: 400, onComplete: () => entry.sprite.destroy() });
    this.game.events.emit(SIPHON_EVENT, { amount: Math.round(this.fuel - before) });
  }

  /** True while the tank is in the ship or rolling through its door: nothing can touch it. */
  get inShip() {
    return sheltered(this.shipState);
  }

  /** The tank is in front of the cargo door: E takes it in. */
  get nearDoor() {
    const c = this.world.center;
    return this.shipState === 'outside' && inFrontOfDoor({ x: this.tank.x - c.x, y: this.tank.y - c.y }, SHIP.layout);
  }

  /** Opens and closes the cargo door, and takes the tank in when it drives into the doorway. */
  private updateShip(delta: number) {
    const c = this.world.center;
    const rel = { x: this.tank.x - c.x, y: this.tank.y - c.y };
    const before = this.doorOpen;
    const target = doorTarget(this.shipState, rel, SHIP.layout);
    this.doorOpen = stepDoor(this.doorOpen, target, delta, SHIP.doorMs);
    if (before === (target ? 0 : 1) && this.doorOpen !== before) sfx.play('door');

    // The shutter slides up into the hull: show only its lower part, at the top of the opening.
    const d = SHIP.layout.door;
    const hidden = Math.round(this.doorOpen * d.h);
    this.door.setVisible(hidden < d.h);
    this.door.setCrop(0, hidden, d.w, d.h - hidden).setY(c.y + d.y - hidden);

    if (this.shipState === 'outside' && atDoorway(rel, this.doorOpen, SHIP.layout)) this.enterShip();
    // Parked: the menu opens once the door has shut behind the tank.
    if (this.shipState === 'inside' && this.doorOpen === 0 && !this.workshopOpen && !this.menuShown) {
      this.menuShown = true;
      this.workshopOpen = true;
      sfx.play('open');
    }
    // Leaving: roll out once the door is fully open.
    if (this.shipState === 'exiting' && this.doorOpen === 1 && !this.rollingOut) this.rollOut();

    // A wisp of smoke from the wreck's broken engine.
    this.shipSmokeMs += delta;
    if (this.shipSmokeMs > 260) {
      this.shipSmokeMs = 0;
      this.smoke.emitParticleAt(c.x + 64 + Phaser.Math.Between(-3, 3), c.y + 112, 1);
    }
  }

  /** F: put the solar panels out (only when stopped, out in the open), or away again. */
  toggleSolar() {
    if (this.solarState === 'out' || this.solarState === 'deploying') {
      this.solarState = 'folding';
      sfx.play('solar');
      return;
    }
    if (this.shipState !== 'outside' || this.workshopOpen || this.tank.speed > 5) return;
    this.solarState = 'deploying';
    sfx.play('solar');
  }

  /** Slides the panels in or out, and puts them away when the player drives off with enough charge. */
  private updateSolar(delta: number, wantsToDrive: boolean) {
    if (this.solarState === 'out' && wantsToDrive && this.battery >= BATTERY.foldAt * this.maxBattery) {
      this.solarState = 'folding';
      sfx.play('solar');
    }
    const step = delta / BATTERY.deployMs;
    if (this.solarState === 'deploying') {
      this.solarOut = Math.min(1, this.solarOut + step);
      if (this.solarOut === 1) this.solarState = 'out';
    } else if (this.solarState === 'folding') {
      this.solarOut = Math.max(0, this.solarOut - step);
      if (this.solarOut === 0) this.solarState = 'stowed';
    }
    this.placePanels();
  }

  /** Puts the panels either side of the hull, as far out as they've slid, on whole pixels. */
  private placePanels() {
    const reach = Math.round(this.solarOut * PANEL_REACH);
    const r = this.tank.hull.rotation;
    this.panels.forEach((p, i) => {
      const side = i === 0 ? -1 : 1;
      // Out along the tank's own sideways axis.
      p.setVisible(reach > 0)
        .setRotation(r)
        .setPosition(this.tank.x - Math.round(Math.sin(r) * side * reach), this.tank.y + Math.round(Math.cos(r) * side * reach));
    });
  }

  private foldSolarNow() {
    this.solarState = 'stowed';
    this.solarOut = 0;
    this.placePanels();
  }

  /** Rolls the tank in through the cargo door; the ship menu opens once it's inside. */
  enterShip() {
    if (this.shipState !== 'outside') return;
    this.foldSolarNow();
    const c = this.world.center;
    this.shipState = 'entering';
    this.tankBody.setVelocity(0, 0);
    this.tankBody.enable = false;
    this.save();
    this.driveTank(entryPath(SHIP.layout).map((p) => ({ x: c.x + p.x, y: c.y + p.y })), () => {
      this.shipState = 'inside';
      this.menuShown = false;
      this.save();
    });
  }

  /** Closes the ship menu and rolls the tank back out of the door, facing away from the ship. */
  exitShip() {
    if (this.shipState !== 'inside' || !this.workshopOpen) return;
    this.workshopOpen = false;
    this.holdFire = true;
    this.shipState = 'exiting';
    this.rollingOut = false;
  }

  /** The door is open: drive down the ramp and away from the ship. */
  private rollOut() {
    const c = this.world.center;
    const L = SHIP.layout;
    this.rollingOut = true;
    this.tank.hull.setPosition(c.x + L.hold.x, c.y + L.hold.y);
    // Back down the ramp, turn round clear of the ship, and drive off.
    const clear = { x: c.x + L.hold.x, y: c.y + L.exit.y - SHIP.turnRoom, reverse: true };
    this.driveTank([clear, { x: c.x + L.exit.x, y: c.y + L.exit.y }], () => {
      const at = { x: this.tank.x, y: this.tank.y };
      const facing = this.tank.hull.rotation;
      this.leaveShipNow();
      this.tankBody.reset(at.x, at.y);
      this.tank.hull.setRotation(facing);
      this.tank.turret.setRotation(facing);
      this.invulnUntil = this.time.now + SHIP.exitInvulnMs;
    });
  }

  /** Back to driving around, right where the tank is: ends any trip through the door. */
  private leaveShipNow() {
    this.tweens.killTweensOf(this.tank.hull);
    this.shipState = 'outside';
    this.workshopOpen = false;
    this.tankBody.enable = true;
  }

  /**
   * Drives the tank (physics off) through each point in turn at the ship's
   * driving speed, facing the way it goes (or away from it when reversing).
   * Small turns happen on the move; a big one (turning round) happens first, in place.
   */
  private driveTank(points: DriveLeg[], done: () => void): void {
    const [p, ...rest] = points;
    if (!p) return done();
    const hull = this.tank.hull;
    const dist = Math.hypot(p.x - hull.x, p.y - hull.y);
    if (dist < 1) return this.driveTank(rest, done);
    const facing = Math.atan2(p.y - hull.y, p.x - hull.x) + (p.reverse ? Math.PI : 0);
    const turn = Phaser.Math.Angle.Wrap(facing - hull.rotation);
    const roll = () =>
      this.tweens.add({
        targets: hull,
        x: p.x,
        y: p.y,
        duration: (dist / SHIP.driveSpeed) * 1000,
        onComplete: () => this.driveTank(rest, done),
      });
    const turnMs = Math.abs(turn) * 140;
    if (Math.abs(turn) > 1) {
      this.tweens.add({ targets: hull, rotation: hull.rotation + turn, duration: turnMs, onComplete: roll });
      return;
    }
    if (turnMs > 0) this.tweens.add({ targets: hull, rotation: hull.rotation + turn, duration: turnMs });
    roll();
  }

  private get tankBody() {
    return this.tank.hull.body as Phaser.Physics.Arcade.Body;
  }

  private updateBurrowers(delta: number) {
    const t = this.tank;
    const world = {
      player: { x: t.x, y: t.y },
      playerMoving: t.speed > 10,
      playerSafe: this.inShip,
      keepOut: this.burrowerKeepOut,
      isClear: (p: { x: number; y: number }) => this.openGround(p),
      underRock: (p: { x: number; y: number }) => this.obstacles().rocks.some((r) => Math.hypot(p.x - r.x, p.y - r.y) < r.r + 2),
    };
    const shells = this.shells.getChildren() as Phaser.Physics.Arcade.Image[];
    for (const b of this.burrowers.values()) {
      const event = b.update(delta, world);
      if (event) this.onBurrowEvent(b, event);
      // Only a surfaced burrower can be hit or touched; shells fly over a buried one.
      if (!b.surfaced) continue;
      const shell = shells.find((s) => s.active && Math.hypot(s.x - b.x, s.y - b.y) < BURROWERS.bodyRadius + 3);
      if (shell) {
        this.impact(shell);
        if (b.hit(this.stats.damage)) {
          this.destroyBurrower(b);
          continue;
        }
        sfx.play('hit');
      }
      if (Math.hypot(t.x - b.x, t.y - b.y) < TANK.bodyRadius + BURROWERS.bodyRadius) this.damageTank(BURROWERS.contactDamage, b);
    }
  }

  /** The ship's hull, grown by a burrower's size: burrowers never tunnel under it. */
  private get burrowerKeepOut(): Circle[] {
    return (this.burrowerKeepOutCache ??= hullAt(this.world.center, SHIP.layout, BURROWERS.bodyRadius + 8));
  }

  private burrowerKeepOutCache?: Circle[];

  /** Ground a burrower may rest or surface on: not under a rock or the ship, not right at the door. */
  private openGround(p: { x: number; y: number }) {
    const r = BURROWERS.bodyRadius;
    if (this.burrowerKeepOut.some((o) => Math.hypot(p.x - o.x, p.y - o.y) < o.r)) return false;
    const c = this.world.center;
    const m = doorMouth(SHIP.layout);
    if (Math.hypot(p.x - c.x - m.x, p.y - c.y - m.y) < 70) return false;
    // Nor into a lake, a canyon or a cliff.
    if (this.planet.ground(p.x, p.y).kind !== 'open') return false;
    return this.obstacles().rocks.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + r + 4);
  }

  private onBurrowEvent(b: Burrower, event: BurrowEvent) {
    const near = Math.hypot(this.tank.x - b.x, this.tank.y - b.y) < 360;
    if (event === 'warn' && near) sfx.play('rumble');
    if (event !== 'surface') return;
    if (near) {
      sfx.play('burst');
      this.cameras.main.shake(90, 0.003);
    }
    if (Math.hypot(this.tank.x - b.x, this.tank.y - b.y) < BURROWERS.biteRadius) this.damageTank(BURROWERS.biteDamage, b);
  }

  private destroyBurrower(b: Burrower) {
    const { x, y } = b;
    const p = b.placement;
    this.burrowers.delete(p.id);
    this.destroyed.set(p.id, this.playTimeMs);
    b.destroy();

    this.sparks.explode(14, x, y);
    for (let i = 0; i < 8; i++) this.dust.emitParticleAt(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-8, 8), 1);
    this.cameras.main.shake(120, 0.004);
    sfx.play('explode');

    // Burrowers live on crystal; one-off drop like a drone's.
    const kill = `${p.id}@${Math.round(this.playTimeMs)}`;
    this.addResourceNode({ id: `${kill}-crystal`, kind: 'crystal', amount: p.drop, x: Math.round(x), y: Math.round(y), angle: 0, dropped: true });
  }

  /** The repair kit slowly mends the hull while the tank is stopped and hasn't been hit for a while. */
  private fieldRepair(time: number, delta: number) {
    const rate = this.stats.repairPerSec;
    if (rate <= 0 || this.hull >= this.maxHull || this.tank.speed > 1) return;
    if (time - this.lastHitAt < UPGRADE_EFFECTS.repairCalmMs) return;
    this.hull = Math.min(this.maxHull, this.hull + (rate * delta) / 1000);
  }

  get status(): TankStatus {
    return { hull: this.hull, fuel: this.fuel, inventory: this.inventory, levels: this.levels };
  }

  /** Refuel or repair; saves when it succeeds. */
  workshopService(action: ServiceAction) {
    const result = service(this.status, action, WORKSHOP.repair);
    this.applyResult(result);
    sfx.play(result.ok ? 'ok' : 'deny');
    this.game.events.emit(WORKSHOP_EVENT, { action, ok: result.ok, message: result.message } satisfies WorkshopPayload);
  }

  /** Builds the next tier of an upgrade line; saves when it succeeds. */
  buildUpgrade(id: UpgradeId) {
    const result = build(this.status, id);
    this.applyResult(result);
    sfx.play(result.ok ? 'craft' : 'deny');
    const built = result.ok ? { id, tier: this.levels[id] } : undefined;
    this.game.events.emit(WORKSHOP_EVENT, { action: id, ok: result.ok, message: result.message, built } satisfies WorkshopPayload);
  }

  private applyResult(result: ActionResult) {
    if (!result.ok) return;
    ({ hull: this.hull, fuel: this.fuel, inventory: this.inventory, levels: this.levels } = result.status);
    this.stats = computeStats(this.levels);
    this.save();
  }

  /** Writes the current progress to localStorage. Returns false if it couldn't. */
  save(): boolean {
    const storage = browserStorage();
    if (!storage) return false;
    const drops: SavedDrop[] = [...this.resources.values()]
      .map((r) => r.node)
      .filter((n) => n.dropped)
      .map(({ id, kind, amount, x, y }) => ({ id, kind, amount, x, y }));
    const events = (m: Map<string, number>) => [...m].map(([id, at]) => ({ id, at }));
    const data: SaveData = {
      version: SAVE_VERSION,
      seed: this.world.seed,
      playTimeMs: Math.round(this.playTimeMs),
      tank: {
        ...(this.inShip ? this.world.spawn : { x: this.tank.x, y: this.tank.y }),
        hull: this.hull,
        fuel: this.fuel,
        battery: this.battery,
      },
      inventory: this.inventory,
      collected: events(this.collected),
      destroyed: events(this.destroyed),
      drops,
      upgrades: this.levels,
      explored: [...this.explored],
      discovered: [...this.discovered],
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

  /** Regrows salvage and returns drones whose time has come, as long as the tank isn't right there. */
  respawn() {
    const t = this.tank;
    for (const id of dueForRespawn(this.collected, this.playTimeMs, RESPAWN.salvageMs)) {
      const chunk = chunkOfId(id);
      // Out on the planet, a chunk that isn't loaded just puts it out next time it is.
      if (chunk && !this.planet.isLoaded(chunk.cx, chunk.cy)) {
        this.collected.delete(id);
        continue;
      }
      const content = chunk && chunkContent(this.world.seed, chunk.cx, chunk.cy);
      const node = content ? content.resources.find((n) => n.id === id) : this.world.resources.find((n) => n.id === id);
      const seep = content?.seeps.find((s) => s.id === id);
      const at = node ?? seep;
      if (!at) {
        this.collected.delete(id);
        continue;
      }
      if (Math.hypot(t.x - at.x, t.y - at.y) < RESPAWN.salvageClearance) continue;
      this.collected.delete(id);
      if (node) this.addResourceNode(node, true);
      else if (seep) this.addSeep(seep, true);
    }
    for (const id of dueForRespawn(this.destroyed, this.playTimeMs, RESPAWN.droneMs)) {
      const chunk = chunkOfId(id);
      if (chunk && !this.planet.isLoaded(chunk.cx, chunk.cy)) {
        this.destroyed.delete(id);
        continue;
      }
      const content = chunk && chunkContent(this.world.seed, chunk.cx, chunk.cy);
      const drones = content ? content.drones : this.world.drones;
      const burrowers = content ? content.burrowers : this.world.burrowers;
      const p = drones.find((d) => d.id === id) ?? burrowers.find((b) => b.id === id);
      if (!p) {
        this.destroyed.delete(id);
        continue;
      }
      if (Math.hypot(t.x - p.x, t.y - p.y) < RESPAWN.droneClearance) continue;
      this.destroyed.delete(id);
      const burrower = burrowers.find((b) => b.id === id);
      if (burrower) {
        const b = new Burrower(this, burrower, this.dust);
        this.burrowers.set(id, b);
        b.mound.setAlpha(0);
        this.tweens.add({ targets: b.mound, alpha: 1, duration: 600 });
        continue;
      }
      const drone = new Drone(this, drones.find((d) => d.id === id)!, this.droneGroup);
      this.drones.set(id, drone);
      drone.sprite.setAlpha(0);
      this.tweens.add({ targets: drone.sprite, alpha: 1, duration: 600 });
    }
  }

  private addResourceNode(node: ResourceNode, fadeIn = false) {
    let glow: Phaser.GameObjects.Image | undefined;
    if (node.kind === 'crystal') {
      glow = this.add.image(node.x, node.y, 'glow').setDepth(2);
      this.tweens.add({ targets: glow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    const sprite = this.add.image(node.x, node.y, node.kind).setRotation(node.angle).setDepth(4);
    this.resources.set(node.id, { node, sprite, glow });
    if (fadeIn) {
      sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: 800 });
    }
  }

  private interact() {
    if (this.workshopOpen) return this.exitShip();
    if (this.shipState !== 'outside') return;
    const node = this.nearby;
    if (node) return this.collect(node);
    if (this.nearbySeep) return this.siphon(this.nearbySeep);
    if (this.nearDoor) this.enterShip();
  }

  /** Leaving the ship menu means leaving the ship. */
  closeWorkshop() {
    this.exitShip();
  }

  private collect(node: ResourceNode) {
    const entry = this.resources.get(node.id)!;
    this.resources.delete(node.id);
    // World nodes regrow later; drone drops are one-offs.
    if (!node.dropped) this.collected.set(node.id, this.playTimeMs);
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
    if (drone.hit(this.stats.damage, this.tank, this.time.now)) this.destroyDrone(drone);
    else sfx.play('hit');
    // A shot wakes the drone and its neighbours, however far away the tank is.
    for (const d of this.drones.values()) {
      if (Math.hypot(d.x - drone.x, d.y - drone.y) <= DRONES.alertShare) d.alert();
    }
  }

  private destroyDrone(drone: Drone) {
    const { x, y } = drone;
    const p = drone.placement;
    this.drones.delete(p.id);
    this.destroyed.set(p.id, this.playTimeMs);
    drone.destroy();

    this.sparks.explode(18, x, y);
    for (let i = 0; i < 6; i++) this.dust.emitParticleAt(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8), 1);
    this.cameras.main.shake(120, 0.004);
    sfx.play('explode');

    // Every drone leaves a circuit; some also leave scrap. Ids include the
    // kill time so a respawned drone's drops never clash with earlier ones.
    const at = { x: Math.round(x), y: Math.round(y) };
    const side = p.drop > 0 ? 9 : 0;
    const kill = `${p.id}@${Math.round(this.playTimeMs)}`;
    this.addResourceNode({ id: `${kill}-chip`, kind: 'circuit', amount: 1, x: at.x + side, y: at.y, angle: 0, dropped: true });
    if (p.drop > 0) this.addResourceNode({ id: `${kill}-drop`, kind: 'scrap', amount: p.drop, x: at.x - side, y: at.y, angle: 0, dropped: true });
  }

  private onDroneContact(drone: Drone) {
    drone.knockFrom(this.tank, this.time.now);
    this.damageTank(DRONES.contactDamage, drone);
  }

  /** Damages the tank unless it was just hit; rescues it at 0 hull. */
  private damageTank(amount: number, from: { x: number; y: number }) {
    const now = this.time.now;
    if (now < this.invulnUntil || this.inShip) return;

    this.invulnUntil = now + HULL.hitInvulnMs;
    this.lastHitAt = now;
    this.hull = applyDamage(this.hull, amount);
    this.cameras.main.shake(150, 0.006);
    this.sparks.explode(8, (this.tank.x + from.x) / 2, (this.tank.y + from.y) / 2);
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
    this.battery = this.maxBattery;
    this.invulnUntil = this.time.now + 1500;

    const { spawn } = this.world;
    this.tank.reset(spawn.x, spawn.y);
    for (const d of this.drones.values()) d.calm();
    for (const b of this.burrowers.values()) b.calm();

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
    if (this.dustDistance < 9) return;
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

/** How far each solar panel's center slides out from the tank's center. */
const PANEL_REACH = 30;

/** One stretch of a scripted drive through the ship's door. */
interface DriveLeg {
  x: number;
  y: number;
  /** Drive backwards: keep facing the other way. */
  reverse?: boolean;
}

function droneOf(obj: unknown): Drone {
  return (obj as Phaser.GameObjects.GameObject).getData('drone') as Drone;
}
