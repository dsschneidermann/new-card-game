import { type Hex, hexEquals, hexKey } from './hex';
import type { HexGrid } from './grid';

/**
 * Deterministic shortest path (BFS) over walkable, in-bounds hexes, inclusive
 * of both endpoints. Returns [] if either endpoint is not walkable or `to` is
 * unreachable; returns [from] when from == to. The fixed neighbour order makes
 * the route reproducible (ADR-006: no RNG in pathfinding).
 */
export function findPath(grid: HexGrid, from: Hex, to: Hex): Hex[] {
  if (!grid.isWalkable(from) || !grid.isWalkable(to)) return [];
  if (hexEquals(from, to)) return [from];

  const frontier: Hex[] = [from];
  const cameFrom = new Map<string, Hex | null>([[hexKey(from), null]]);

  while (frontier.length > 0) {
    const current = frontier.shift() as Hex;
    if (hexEquals(current, to)) break;
    for (const next of grid.walkableNeighbors(current)) {
      const key = hexKey(next);
      if (!cameFrom.has(key)) {
        cameFrom.set(key, current);
        frontier.push(next);
      }
    }
  }

  if (!cameFrom.has(hexKey(to))) return [];
  const path: Hex[] = [];
  let step: Hex | null = to;
  while (step !== null) {
    path.push(step);
    step = cameFrom.get(hexKey(step)) ?? null;
  }
  return path.reverse();
}
