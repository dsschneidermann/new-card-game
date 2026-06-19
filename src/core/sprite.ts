/**
 * Character sprite helpers (feature 14): pure and Phaser-free. Sheets are a
 * single right-facing row of frames; the left facing is the same animation
 * mirrored (flipX) at render time, so only the facing decision lives here.
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
