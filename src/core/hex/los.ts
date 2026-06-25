import { type Hex } from './hex';
import { hexLineCandidates } from './range';

/** The result of walking the straight line from `from` to `to` for line of sight (see lineOfSightPath). */
export interface LineOfSightResult {
  /**
   * The hexes the straight line walked, starting at `from`. When `clear`, the full path through to `to`
   * (inclusive of both endpoints). When NOT clear, the prefix actually reached followed by the blocking
   * hex(es) at the first step where every candidate was a sight-blocker — so the ray can still be drawn
   * up to and including the wall it ran into.
   */
  readonly hexes: Hex[];
  /** True when an unblocked straight line reaches `to`. */
  readonly clear: boolean;
}

/**
 * Walk the straight line of hexes from `from` to `to` (inclusive of both endpoints) for line of sight.
 *
 * A hex grid has, between two hexes, more than one equally-straight, equal-distance line: wherever the
 * geometric line grazes a hex boundary there are two equal-distance hexes straddling it (a primary and
 * its mirror). hexLineCandidates gives both at each step. Grazes are never adjacent — the densest case (a
 * pure diagonal) strictly alternates graze/clean — so the two equal-distance hexes of a graze are both
 * adjacent to the single forced hex at the next step. Whichever side we take therefore reconverges at the
 * very next step, so the choice never propagates: a single forward pass that takes the clear candidate at
 * each step needs no backtracking. Endpoints are never blockers, and consecutive candidates stay
 * connected, so the result is a drawable ray.
 *
 * Returns `{ clear: true }` with the full path when an unblocked straight line reaches `to`; otherwise
 * `{ clear: false }` with the prefix reached plus the blocking hex(es) at the step that stopped it (so a
 * caller can still draw the ray up to the wall). Use hasLineOfSight when only the yes/no is needed.
 *
 * Pure and Phaser-free (ADR-002): `blocksSight` is supplied by the caller (e.g. grid.blocksSight).
 */
export function lineOfSightPath(blocksSight: (hex: Hex) => boolean, from: Hex, to: Hex): LineOfSightResult {
  const candidates = hexLineCandidates(from, to);
  const n = candidates.length - 1; // number of steps; candidates[0] = from, candidates[n] = to
  const hexes: Hex[] = [{ q: from.q, r: from.r }];
  if (n === 0) return { hexes, clear: true };

  for (let i = 1; i < n; i += 1) {
    const { primary, mirror } = candidates[i]!;
    // Take the primary hex if clear, else its equal-distance mirror. At a non-graze step primary and
    // mirror are the same hex, so this is simply "is it clear?".
    if (!blocksSight(primary)) {
      hexes.push({ q: primary.q, r: primary.r });
    } else if (!blocksSight(mirror)) {
      hexes.push({ q: mirror.q, r: mirror.r });
    } else {
      // Both candidates of this step are sight-blockers, so this straight line — and every equal-distance
      // straight line — is blocked here. Record the blocking hex(es) so the ray can be drawn up to the
      // wall, then report not-clear. (At a non-graze step primary === mirror, so it is recorded once.)
      hexes.push({ q: primary.q, r: primary.r });
      if (mirror.q !== primary.q || mirror.r !== primary.r) hexes.push({ q: mirror.q, r: mirror.r });
      return { hexes, clear: false };
    }
  }
  hexes.push({ q: to.q, r: to.r });
  return { hexes, clear: true };
}

/** Whether there is ANY clear straight line of sight from `from` to `to` (see lineOfSightPath). */
export function hasLineOfSight(blocksSight: (hex: Hex) => boolean, from: Hex, to: Hex): boolean {
  return lineOfSightPath(blocksSight, from, to).clear;
}
