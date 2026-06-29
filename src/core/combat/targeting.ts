import { type Hex, hexDistance } from '../hex/hex';
import { hasLineOfSight } from '../hex/los';
import type { AttackProfile } from './types';

/**
 * Attack range & line-of-sight PREDICATES on the hex grid (ADR-006/ADR-007). Pure facts only: given an
 * attack and two hexes, can the attack reach the target, and can it see across to it. Reuses the existing
 * hex distance and line-of-sight helpers (no new grid or Bresenham code).
 *
 * Deliberately NO target- or attack-SELECTION lives here. Which enemy attacks whom, and which of its
 * attacks it uses, is the Enemy AI feature's decision — baking in a fixed "nearest target / first usable
 * attack" choice now would pre-empt that and stop the AI from making good, varied decisions. The AI
 * composes these predicates into its own selection instead.
 */

/** Whether `to` is within the profile's [minRange, maxRange], measured as hex distance (ADR-006). */
export function inAttackRange(profile: AttackProfile, from: Hex, to: Hex): boolean {
  const d = hexDistance(from, to);
  return d >= profile.minRange && d <= profile.maxRange;
}

/**
 * Whether the profile can SEE `to` from `from`: trivially true unless it requires line of sight, in which
 * case the existing hex LOS must be clear. `blocksSight` is the caller's predicate (e.g. grid.blocksSight),
 * keeping this Phaser-free; sight-blocking tiles fully block (partial cover is an open brief question).
 */
export function hasAttackLineOfSight(
  profile: AttackProfile,
  from: Hex,
  to: Hex,
  blocksSight: (h: Hex) => boolean,
): boolean {
  return !profile.requiresLineOfSight || hasLineOfSight(blocksSight, from, to);
}
