/**
 * Character sprite helpers (feature 14): pure and Phaser-free. Sheets are a
 * single right-facing row of frames; the left facing is the same animation
 * mirrored (flipX) at render time, so only the facing decision lives here.
 */

export type Facing = 'left' | 'right';

/**
 * Facing for a move, from its overall horizontal intent: a target to the left
 * (dx < 0) faces left, to the right (dx > 0) faces right, and directly
 * above/below (dx === 0 — e.g. an even-row-to-even-row vertical move) keeps the
 * previous facing. Computed once per move from start->target, not per hop, so a
 * vertical zigzag does not flicker the facing. Presentation-only.
 */
export function facingFromIntent(prev: Facing, dx: number): Facing {
  if (dx === 0) return prev;
  return dx < 0 ? 'left' : 'right';
}
