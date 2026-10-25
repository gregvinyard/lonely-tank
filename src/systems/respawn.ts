/** Ids whose event happened at least `delayMs` of play time ago, oldest first. */
export function dueForRespawn(events: Map<string, number>, nowMs: number, delayMs: number): string[] {
  return [...events]
    .filter(([, at]) => nowMs - at >= delayMs)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
}

/** Extra units for a node this far from the ship: +`amount` beyond `distance`. */
export function outerBonus(distanceFromShip: number, o: { distance: number; amount: number }): number {
  return distanceFromShip >= o.distance ? o.amount : 0;
}
