import { type Hex, hexKey, hexDirectionToward } from '../hex/hex';
import { hexesWithinRange } from '../hex/range';
import type { AttackPattern } from './types';

/**
 * Expand an attack's PATTERN into the set of hexes it threatens, from the attacker's hex `from` toward the
 * aim hex `to` (the player's hex at plan time). Pure and grid-free — the caller clips the result to the map
 * (grid.inBounds) so nothing spills off-board. Every kind ALWAYS includes `to`, and a bigger pattern only
 * ADDS hexes, so a telegraph always threatens the aim and the extra tiles only widen the danger zone:
 *   - single (or an absent pattern): just [to].
 *   - line(size): a straight beam of `size` hexes starting at `to` and stepping in hexDirectionToward(from,to)
 *     — continuing past the aim away from the attacker, extending the strike's reach along that axis.
 *   - blast(radius): every hex within `radius` of `to` (reuses hexesWithinRange) — an area centred on the aim
 *     that forces the target to dodge more than one tile.
 * Results are de-duplicated with a stable order (aim first for single/line).
 */
export function attackPatternHexes(pattern: AttackPattern | undefined, from: Hex, to: Hex): Hex[] {
  const kind = pattern?.kind ?? 'single';
  if (kind === 'blast') {
    return dedupe(hexesWithinRange(to, Math.max(0, pattern?.size ?? 1)));
  }
  if (kind === 'line') {
    const length = Math.max(1, pattern?.size ?? 2);
    const dir = hexDirectionToward(from, to);
    const beam: Hex[] = [];
    for (let step = 0; step < length; step += 1) {
      beam.push({ q: to.q + dir.q * step, r: to.r + dir.r * step });
    }
    return dedupe(beam);
  }
  return [{ q: to.q, r: to.r }]; // 'single'
}

/** Drop duplicate hexes, preserving first-seen order (defensive — both sources above are already unique). */
function dedupe(hexes: Hex[]): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const h of hexes) {
    const key = hexKey(h);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}
