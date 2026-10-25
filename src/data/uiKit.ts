// Pixel-art UI kit, drawn in code like the font so it sits exactly on the
// game's pixel grid. Frames are nine-slice textures: their corners are fixed
// and their edges are uniform along their length, so stretching them to any
// size never shows.

export const UI_COLORS: Record<string, string> = {
  k: '#0d0b10', // outline
  l: '#9aa0a8', // bevel light
  m: '#5f636b', // metal
  n: '#474a52', // metal shade
  d: '#2a2c32', // bevel dark
  f: '#17151bec', // panel fill (slightly see-through)
  g: '#211f27f0', // plate fill
  b: '#3a3d45', // button face
  h: '#4a5a5e', // button face, hovered
  t: '#3fb8a8', // teal trim
  T: '#7fe0d2', // bright teal
  r: '#c8ccd2', // rivet
  o: '#f6a04a', // amber
  R: '#e6463c', // red
  G: '#7ec850', // green
  w: '#f3e3c3', // cream
  v: '#8a5cc7', // violet
  V: '#c9a6f2', // light violet
  s: '#b8bcc0', // steel
  S: '#6f7378', // dark steel
};

export interface FrameDef {
  key: string;
  rows: string[];
  /** Fixed corner size in px on every side. */
  slice: number;
}

// '.' is transparent.
export const FRAMES: FrameDef[] = [
  {
    // Main window: bevelled metal border with rivets and a teal trim under the top edge.
    key: 'ui_panel',
    slice: 5,
    rows: [
      '.kkkkkkkkkkkk.',
      'kllllllllllllk',
      'klrmmmmmmmmrdk',
      'klmmmmmmmmmmdk',
      'kntttttttttttk',
      'kndffffffffddk',
      'kndffffffffddk',
      'kndffffffffddk',
      'kndffffffffddk',
      'kndffffffffddk',
      'klmmmmmmmmmmdk',
      'klrmmmmmmmmrdk',
      'kddddddddddddk',
      '.kkkkkkkkkkkk.',
    ],
  },
  {
    // Small label plate for HUD text.
    key: 'ui_plate',
    slice: 3,
    rows: [
      '.kkkkkk.',
      'knnnnnnk',
      'kngggggk',
      'kngggggk',
      'kngggggk',
      'kngggggk',
      'kddddddk',
      '.kkkkkk.',
    ],
  },
  {
    key: 'ui_button',
    slice: 3,
    rows: [
      '.kkkkkk.',
      'klllllmk',
      'klbbbbdk',
      'klbbbbdk',
      'klbbbbdk',
      'klbbbbdk',
      'kmdddddk',
      '.kkkkkk.',
    ],
  },
  {
    key: 'ui_button_hover',
    slice: 3,
    rows: [
      '.kkkkkk.',
      'kTTTTTtk',
      'kThhhhtk',
      'kThhhhtk',
      'kThhhhtk',
      'kThhhhtk',
      'kttttttk',
      '.kkkkkk.',
    ],
  },
  {
    key: 'ui_button_disabled',
    slice: 3,
    rows: [
      '.kkkkkk.',
      'knnnnnnk',
      'kndddddk',
      'kndddddk',
      'kndddddk',
      'kndddddk',
      'kddddddk',
      '.kkkkkk.',
    ],
  },
  {
    // Recessed track behind a progress bar.
    key: 'ui_bar',
    slice: 2,
    // The fill bar goes inside, 2 px in from each side and 5 px tall.
    rows: ['kkkkkk', 'kddddk', 'kdkkdk', 'kdkkdk', 'kdkkdk', 'kdkkdk', 'kdkkdk', 'kllllk', 'kkkkkk'],
  },
];

export interface IconDef {
  key: string;
  rows: string[];
}

// 9x9 HUD icons.
export const ICONS: IconDef[] = [
  {
    // Shield = hull.
    key: 'icon_hull',
    rows: [
      'kkkkkkkkk',
      'kGGGGwGGk',
      'kGGGwwGGk',
      'kGGGGGGGk',
      'kGGGGGGGk',
      '.kGGGGGk.',
      '.kGGGGGk.',
      '..kGGGk..',
      '...kkk...',
    ],
  },
  {
    // Battery cell with a charge bolt.
    key: 'icon_battery',
    rows: [
      '...kkk...',
      '.kkkkkkk.',
      '.ksssssk.',
      '.ksTTssk.',
      '.ksTTTsk.',
      '.kssTTsk.',
      '.ksssTsk.',
      '.ksssssk.',
      '.kkkkkkk.',
    ],
  },
  {
    // Drop = fuel.
    key: 'icon_fuel',
    rows: [
      '....k....',
      '...kok...',
      '..koook..',
      '..koook..',
      '.kowoook.',
      'kowoooook',
      'koooooook',
      '.koooook.',
      '..kkkkk..',
    ],
  },
  {
    // Chip = circuits.
    key: 'icon_circuit',
    rows: [
      '.s.s.s.s.',
      'kkkkkkkkk',
      'skGGGGGks',
      'kkGTTTGkk',
      'skGTkTGks',
      'kkGTTTGkk',
      'skGGGGGks',
      'kkkkkkkkk',
      '.s.s.s.s.',
    ],
  },
  {
    // Warning triangle.
    key: 'icon_warn',
    rows: [
      '....k....',
      '...kRk...',
      '...kRk...',
      '..kRwRk..',
      '..kRwRk..',
      '.kRRwRRk.',
      '.kRRRRRk.',
      'kRRRwRRRk',
      'kkkkkkkkk',
    ],
  },
  {
    // Upward chevron = upgrade built.
    key: 'icon_up',
    rows: [
      '....k....',
      '...kTk...',
      '..kTTTk..',
      '.kTTkTTk.',
      'kTTk.kTTk',
      'kTk.k.kTk',
      '.k.kTk.k.',
      '..kTTTk..',
      '.kTTkTTk.',
    ],
  },
];

/** Pixels to draw for a pixel map, as [x, y, cssColor]. */
export function mapPixels(rows: string[]): [number, number, string][] {
  const out: [number, number, string][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.') continue;
      const color = UI_COLORS[c];
      if (!color) throw new Error(`Unknown UI color '${c}'`);
      out.push([x, y, color]);
    }
  });
  return out;
}
