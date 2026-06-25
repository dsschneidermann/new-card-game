import { type Hex, hexKey, hexDistance } from './hex';
import { hexLineCandidates } from './range';

/**
 * A CLEAR straight-line path of hexes from `from` to `to` (inclusive of both endpoints), or null if
 * every straight line between them is blocked.
 *
 * A hex grid has, between two hexes, more than one equally-straight, equal-distance line: wherever the
 * geometric line grazes a hex boundary there are two equal-distance hexes straddling it (a primary and
 * its mirror). Rather than enumerate all 2^k combinations up front, this walks the line hex by hex and,
 * at each step, takes the primary hex if it is clear, else tries its mirror, recursing and backtracking
 * when a branch dead-ends. It is memoised on (step, previous hex) so the dynamic walk can't blow up.
 * Endpoints are never blockers, and the chosen hexes stay connected so the result is a drawable ray.
 *
 * Pure and Phaser-free (ADR-002): `blocksSight` is supplied by the caller (e.g. grid.blocksSight).
 */
export function lineOfSightPath(blocksSight: (hex: Hex) => boolean, from: Hex, to: Hex): Hex[] | null {
  const candidates = hexLineCandidates(from, to);
  const n = candidates.length - 1; // number of steps; candidates[0] = from, candidates[n] = to
  if (n === 0) return [{ q: from.q, r: from.r }];

  const adjacent = (a: Hex, b: Hex): boolean => hexDistance(a, b) <= 1;
  const memo = new Map<string, Hex[] | null>();

  // Walk from intermediate step `i` given the previously chosen hex `prev`. Try the primary hex; if it
  // is blocked, try its mirror (the equal-distance hex on the other side of the line). Keep the path
  // connected, recurse, and backtrack when both candidates dead-end. The target endpoint (step n) is
  // never a blocker. Returns the chosen hexes from step i onward, or null if this branch can't reach to.
  const walk = (i: number, prev: Hex): Hex[] | null => {
    if (i === n) return adjacent(prev, to) ? [{ q: to.q, r: to.r }] : null;
    const key = `${i}:${hexKey(prev)}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const { primary, mirror } = candidates[i]!;
    const options = hexKey(primary) === hexKey(mirror) ? [primary] : [primary, mirror];
    let result: Hex[] | null = null;
    for (const h of options) {
      if (blocksSight(h) || !adjacent(prev, h)) continue;
      const rest = walk(i + 1, h);
      if (rest !== null) {
        result = [{ q: h.q, r: h.r }, ...rest];
        break;
      }
    }
    memo.set(key, result);
    return result;
  };

  const tail = walk(1, from);
  return tail === null ? null : [{ q: from.q, r: from.r }, ...tail];
}

/** Whether there is ANY clear straight line of sight from `from` to `to` (see lineOfSightPath). */
export function hasLineOfSight(blocksSight: (hex: Hex) => boolean, from: Hex, to: Hex): boolean {
  return lineOfSightPath(blocksSight, from, to) !== null;
}
