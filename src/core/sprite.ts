/**
 * Character spritesheet helpers (feature 14): pure and Phaser-free. Directional
 * sheets lay out rows as down/up/left/right; v1 uses the left/right facings only
 * (best fit for the hex perspective). Animation playback itself is Phaser-side;
 * only the facing rule and frame-range math live here so they are unit-testable.
 */

export type Facing = 'left' | 'right';

/**
 * Facing after a movement hop, by the horizontal-dominant rule: a hop whose
 * horizontal delta dominates (|dx| > |dy|) faces the sign of dx; a more-vertical
 * or equal hop keeps the previous facing. Presentation-only (no gameplay effect).
 */
export function facingFromDelta(prev: Facing, dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return prev;
}

/** Row indices of a 4-direction character sheet. */
export const PLAYER_ROWS = { down: 0, up: 1, left: 2, right: 3 } as const;

/** Inclusive frame-index range of a directional row in a `cols`-wide sheet. */
export function rowFrameRange(cols: number, rowIndex: number): { start: number; end: number } {
  const start = rowIndex * cols;
  return { start, end: start + cols - 1 };
}
