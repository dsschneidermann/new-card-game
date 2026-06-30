import { type Hex, hexEquals, hexKey, hexDistance } from './hex';
import type { HexGrid } from './grid';

/** Shared empty set so the no-`blocked` callers neither allocate nor change behaviour. */
const NO_BLOCKED: ReadonlySet<string> = new Set<string>();

/**
 * Deterministic shortest path over walkable, in-bounds hexes, inclusive of both
 * endpoints. Returns [] if either endpoint is not walkable or `to` is
 * unreachable; returns [from] when from == to.
 *
 * `blocked` is an optional set of extra non-walkable hex KEYS layered on top of grid
 * walkability (e.g. enemy-occupied tiles, which block the PLAYER's movement — see
 * src/core/occupancy.ts). A blocked hex is never traversed, and a blocked `to` returns []
 * (you cannot STOP on it); the origin `from` is never tested against `blocked`, so a mover
 * always starts where it stands. With the default empty set, behaviour is exactly as before.
 *
 * A* with a lexicographic cost (min steps, then min accumulated distance from
 * the straight start->goal line). Among equally-short paths it picks the one
 * that hugs the straight line, so e.g. a "straight up" move takes a tight
 * alternating zigzag rather than drifting one way then correcting. The
 * line-distance is the |cross product| of (node-from) and (goal-from) in axial
 * space; a fixed insertion-order tie-break keeps the result reproducible (no RNG).
 */
export function findPath(grid: HexGrid, from: Hex, to: Hex, blocked: ReadonlySet<string> = NO_BLOCKED): Hex[] {
  if (!grid.isWalkable(from) || !grid.isWalkable(to)) return [];
  if (hexEquals(from, to)) return [from];
  if (blocked.has(hexKey(to))) return []; // cannot END on a blocked hex (e.g. an enemy)

  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const lineDist = (h: Hex): number => Math.abs((h.q - from.q) * dr - (h.r - from.r) * dq);

  interface QNode {
    readonly hex: Hex;
    readonly steps: number;
    readonly line: number;
    readonly f: number;
    readonly seq: number;
  }
  const open: QNode[] = [];
  const bestSteps = new Map<string, number>();
  const bestLine = new Map<string, number>();
  const cameFrom = new Map<string, Hex | null>();
  let seq = 0;

  /** Relax a node: accept it only if (steps, line) is lexicographically better. */
  const relax = (hex: Hex, steps: number, line: number, parent: Hex | null): void => {
    const k = hexKey(hex);
    const cs = bestSteps.get(k);
    if (cs !== undefined && (cs < steps || (cs === steps && (bestLine.get(k) as number) <= line))) {
      return;
    }
    bestSteps.set(k, steps);
    bestLine.set(k, line);
    cameFrom.set(k, parent);
    open.push({ hex, steps, line, f: steps + hexDistance(hex, to), seq });
    seq += 1;
  };

  relax(from, 0, lineDist(from), null);

  while (open.length > 0) {
    // Pop the min by (f, line, seq) — a linear scan is ample at grid scale.
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i] as QNode;
      const b = open[bi] as QNode;
      if (a.f < b.f || (a.f === b.f && (a.line < b.line || (a.line === b.line && a.seq < b.seq)))) {
        bi = i;
      }
    }
    const cur = open.splice(bi, 1)[0] as QNode;
    const ck = hexKey(cur.hex);
    if (cur.steps !== bestSteps.get(ck) || cur.line !== bestLine.get(ck)) continue; // stale
    if (hexEquals(cur.hex, to)) break;
    for (const next of grid.walkableNeighbors(cur.hex)) {
      if (blocked.has(hexKey(next))) continue; // route around blocked hexes (the blocked `to` already returned [])
      relax(next, cur.steps + 1, cur.line + lineDist(next), cur.hex);
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

/**
 * Every walkable hex reachable from `from` within `maxSteps` steps, keyed by hexKey (for membership)
 * to the Hex itself (so the overlay can paint it). Breadth-first over walkable neighbours; the origin
 * is excluded and obstacles / out-of-bounds hexes never appear. Drives the movement reachable-range
 * overlay and validates a release target (reachable iff its hexKey is present in the result).
 *
 * `blocked` is the same optional extra-non-walkable hex-key set as findPath: a blocked hex is neither
 * reachable nor traversable, so any hex reachable ONLY through it (within the budget) drops out too. The
 * default empty set leaves behaviour exactly as before.
 */
export function hexesReachable(
  grid: HexGrid,
  from: Hex,
  maxSteps: number,
  blocked: ReadonlySet<string> = NO_BLOCKED,
): Map<string, Hex> {
  const reached = new Map<string, Hex>();
  if (maxSteps <= 0 || !grid.isWalkable(from)) return reached;
  const seen = new Set<string>([hexKey(from)]);
  let frontier: Hex[] = [from];
  for (let step = 1; step <= maxSteps && frontier.length > 0; step += 1) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const nb of grid.walkableNeighbors(h)) {
        const k = hexKey(nb);
        if (seen.has(k) || blocked.has(k)) continue; // skip blocked tiles and anything reachable only through them
        seen.add(k);
        reached.set(k, nb);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return reached;
}
