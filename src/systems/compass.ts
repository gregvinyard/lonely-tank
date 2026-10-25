export interface CompassPlacement {
  x: number;
  y: number;
  angle: number; // radians, pointing from the screen center toward the target
}

/**
 * Where to draw an edge-of-screen arrow pointing at `target` (in screen px),
 * or null when the target is on screen. `targetRadius` counts the target as
 * visible while any part of it shows; `inset` keeps the arrow off the edge.
 */
export function compassPlacement(
  target: { x: number; y: number },
  screen: { width: number; height: number },
  targetRadius: number,
  inset: number,
): CompassPlacement | null {
  const { width: w, height: h } = screen;
  const onScreen =
    target.x > -targetRadius && target.x < w + targetRadius && target.y > -targetRadius && target.y < h + targetRadius;
  if (onScreen) return null;

  const cx = w / 2;
  const cy = h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  // Scale the direction so it touches the inset rectangle.
  const hx = Math.max(1, cx - inset);
  const hy = Math.max(1, cy - inset);
  const s = Math.min(dx === 0 ? Infinity : hx / Math.abs(dx), dy === 0 ? Infinity : hy / Math.abs(dy));
  return { x: cx + dx * s, y: cy + dy * s, angle };
}
