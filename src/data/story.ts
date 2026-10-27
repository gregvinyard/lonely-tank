import type { BiomeId } from './biomes';

// The crew's trail: emergency caches they left on their way to the signal,
// one per biome, each holding a voice log. Read in order; the last one holds
// the plans for the ship's long-range array. Text is shown in the pixel font
// (uppercase, no double quotes).

export interface CrewLog {
  /** The biome the cache was left in. */
  biome: BiomeId;
  /** Who is speaking, and when. */
  speaker: string;
  text: string;
}

export const LOGS: CrewLog[] = [
  {
    biome: 'flats',
    speaker: 'Mara · day 2',
    text:
      "The Wayfarer won't fly again. Jun says the long-range array cracked on impact, so nobody is coming for us. " +
      "But there's a signal out past the badlands, steady as a heartbeat. We're going to find it. " +
      "Stay with the ship, little tank. Keep her safe. We'll be back.",
  },
  {
    biome: 'badlands',
    speaker: 'Jun · day 5',
    text:
      'Drones everywhere out here. Old ones, patched and re-patched, and none of them answer to anyone. ' +
      "Mara thinks they've been picking this planet over for centuries. " +
      'The signal is getting stronger. I left this cache up high so the beacon would carry.',
  },
  {
    biome: 'glass',
    speaker: 'Mara · day 9',
    text:
      'The glass sings when the wind blows through it. Jun cut a prism from a spire, and it bends light like nothing we have. ' +
      'Clean enough to focus a beam. If we could fix the array, a lens like this could throw a signal clear off-world.',
  },
  {
    biome: 'bloom',
    speaker: 'Jun · day 14',
    text:
      'Everything here grows. I tore my suit on a cap and the spores closed the hole by morning, tougher than the fabric was. ' +
      "Living armour. Mara's coughing, though. We're moving on before it gets worse.",
  },
  {
    biome: 'mire',
    speaker: 'Mara · day 20',
    text:
      "Jun's leg is bad and the acid is in the air. He's resting by a seep, where the fuel keeps him warm. I'll come back for him. " +
      "The salt here holds a charge like a cell. It's what keeps the old machines running. The signal is close now.",
  },
  {
    biome: 'ruins',
    speaker: 'Mara · day 23',
    text:
      "I found it. A tower in the old city, and nobody home. Just a machine calling out the same message, over and over, for longer than people have existed. " +
      "It's lonely, I think. My radio is too weak to answer. The Wayfarer's array isn't. " +
      'Little tank, if you hear this: rebuild the array. Relics for the frame, glass for the lens, salt and spores for the core. ' +
      'Answer it. Tell it someone heard.',
  },
];

/** Shown when the array's last stage is built. */
export const ENDING = {
  title: 'Signal answered',
  speaker: 'The Wayfarer',
  text:
    'The array hums. A beam climbs from the Wayfarer into the sky. For a long moment, nothing. ' +
    'Then, far across the world, the old tower falls quiet, and answers with one new message, over and over: HEARD. HEARD. HEARD. ' +
    "Then a crackle on a suit radio band, faint and close: Little tank? It's Mara. Jun is with me. We saw the light. " +
    "Stay where you are. We're coming home.",
};

/** Ids in the save's `discovered` list for logs read, and for the ending seen. */
export const logId = (i: number) => `log:${i}`;
export const ENDING_ID = 'ending';
