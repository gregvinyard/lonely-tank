// The planet's biomes: how each region looks, what it is made of, and what
// lives and lies there. All of it is data; worldgen reads it.

export type BiomeId = 'flats' | 'badlands' | 'glass' | 'bloom' | 'mire' | 'ruins';
export type FeatureKind = 'mesa' | 'canyon' | 'lake';

/** Expected count per chunk (512x512 px) of each kind of thing. */
export interface BiomeContents {
  rocks: number;
  /** Solid props (mushroom trees, spires, ruin walls) by texture key family. */
  props: number;
  /** Ground scatter you drive over (small plants, rubble). */
  decor: number;
  scrap: number;
  crystal: number;
  circuit: number;
  seep: number;
  drone: number;
  burrower: number;
  landmark: number;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** Shown under the name the first time you cross into it. */
  blurb: string;
  /** Map colour (0xRRGGBB). */
  mapColor: number;
  /** Seamless 128 px ground tile in `ground_large.png`, or -1 for the home sand. */
  ground: number;
  /** Relative odds of a biome site, and how far from the ship it may appear. */
  weight: number;
  minDistance: number;
  /** Chance a feature cell centred in this biome holds each feature. */
  features: Partial<Record<FeatureKind, number>>;
  /** Liquid tint for lakes here. */
  liquid: 'acid' | 'ichor';
  /** Rock tint (multiplied over the boulder art). */
  rockTint: number;
  contents: BiomeContents;
}

const none: BiomeContents = { rocks: 0, props: 0, decor: 0, scrap: 0, crystal: 0, circuit: 0, seep: 0, drone: 0, burrower: 0, landmark: 0 };

export const BIOMES: Record<BiomeId, BiomeDef> = {
  flats: {
    id: 'flats',
    name: 'Dust Flats',
    blurb: 'Open sand and old wreckage',
    mapColor: 0xb07a4f,
    ground: -1,
    weight: 3,
    minDistance: 0,
    features: { canyon: 0.22, mesa: 0.12, lake: 0.06 },
    liquid: 'acid',
    rockTint: 0xffffff,
    contents: { ...none, rocks: 2.2, decor: 0.6, scrap: 0.55, crystal: 0.12, drone: 0.12, burrower: 0.1, landmark: 0.012 },
  },
  badlands: {
    id: 'badlands',
    name: 'Rust Badlands',
    blurb: 'Mesas, canyons and scrap',
    mapColor: 0x9c4a2a,
    ground: 0,
    weight: 2.4,
    minDistance: 0,
    features: { mesa: 0.5, canyon: 0.38 },
    liquid: 'acid',
    rockTint: 0xe08a6a,
    contents: { ...none, rocks: 3, decor: 1.5, scrap: 1.1, crystal: 0.15, drone: 0.22, burrower: 0.05, landmark: 0.015 },
  },
  glass: {
    id: 'glass',
    name: 'Glass Fields',
    blurb: 'Crystal country',
    mapColor: 0xc9b6e8,
    ground: 1,
    weight: 2,
    minDistance: 6000,
    features: { canyon: 0.3 },
    liquid: 'ichor',
    rockTint: 0xffffff,
    contents: { ...none, rocks: 0.6, props: 2.6, decor: 1, scrap: 0.15, crystal: 1.1, drone: 0.25, landmark: 0.01 },
  },
  bloom: {
    id: 'bloom',
    name: 'Fungal Bloom',
    blurb: 'Something grows here',
    mapColor: 0x2c6e6a,
    ground: 2,
    weight: 2,
    minDistance: 5000,
    features: { lake: 0.35 },
    liquid: 'ichor',
    rockTint: 0x9fb8c0,
    contents: { ...none, rocks: 0.6, props: 3, decor: 10, scrap: 0.35, crystal: 0.5, drone: 0.08, burrower: 0.32, landmark: 0.01 },
  },
  mire: {
    id: 'mire',
    name: 'Acid Mire',
    blurb: 'Toxic lakes and fuel seeps',
    mapColor: 0x5d6b2c,
    ground: 3,
    weight: 1.6,
    minDistance: 7000,
    features: { lake: 0.85 },
    liquid: 'acid',
    rockTint: 0x9aa070,
    contents: { ...none, rocks: 1.2, props: 0.4, decor: 6, scrap: 0.45, crystal: 0.1, seep: 0.45, drone: 0.08, burrower: 0.2, landmark: 0.01 },
  },
  ruins: {
    id: 'ruins',
    name: 'Old City',
    blurb: 'Ruins of those who came before',
    mapColor: 0x7a7090,
    ground: 4,
    weight: 0.5,
    minDistance: 9000,
    features: {},
    liquid: 'ichor',
    rockTint: 0xb0a8c0,
    contents: { ...none, rocks: 0.3, props: 5, decor: 3, scrap: 0.8, crystal: 0.1, circuit: 0.7, drone: 0.45, landmark: 0.02 },
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

/** Material tiles in `ground_tiles.png` that aren't biome ground. */
export const MATERIAL_TILES = { mesaTop: [10, 11], liquid: [12, 13], cliff: [14, 15] } as const;
