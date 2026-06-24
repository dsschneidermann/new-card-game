import { type Hex } from './hex';
import { hexLine } from './range';

/**
 * Whether there is clear line of sight from `from` to `to`: true unless some hex strictly BETWEEN them
 * blocks sight. Walks the hex line (excluding both endpoints) and consults `blocksSight` per hex.
 *
 * Pure and Phaser-free (ADR-002): `blocksSight` is supplied by the caller (e.g. grid.blocksSight), so
 * this is decoupled from HexGrid. Endpoints are never treated as blockers, so an obstacle standing ON
 * the target (or the caster) does not block sight to it, and adjacent targets (no hex in between) always
 * have line of sight. A single straight hex-line ray, consistent with the rendered ranged ray.
 */
export function hasLineOfSight(blocksSight: (hex: Hex) => boolean, from: Hex, to: Hex): boolean {
  const line = hexLine(from, to);
  for (let i = 1; i < line.length - 1; i += 1) {
    if (blocksSight(line[i]!)) return false;
  }
  return true;
}
