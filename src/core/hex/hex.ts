/**
 * Axial hex coordinates and the six-direction adjacency (ADR-006). Pure and
 * Phaser-free; all hex math lives here so movement, range, and pathfinding are
 * unit-testable against fixed grids.
 */

/** Axial hex coordinate (pointy-top). */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** A stable string key for using hexes in Maps/Sets. */
export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

/** The six axial neighbour directions, in a fixed order (deterministic routes). */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** The six neighbours of a hex, in HEX_DIRECTIONS order. */
export function neighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d));
}

/** Hex (cube) distance between two axial hexes. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * The axial neighbour direction (one of HEX_DIRECTIONS) that best points from `from` toward `to`: the
 * direction whose cube vector is most aligned (largest dot product) with the from→to vector. Used to orient
 * a directional attack pattern (a line/beam) from an attacker toward its target. When from == to there is no
 * direction, so it returns the first canonical direction; ties resolve to the earliest HEX_DIRECTIONS entry,
 * so the result is deterministic (no RNG). Pure.
 */
export function hexDirectionToward(from: Hex, to: Hex): Hex {
  const vq = to.q - from.q;
  const vr = to.r - from.r;
  if (vq === 0 && vr === 0) return HEX_DIRECTIONS[0]!;
  // Cube coords (x=q, z=r, y=-q-r): the dot product in cube space ranks how aligned each direction is.
  const vx = vq;
  const vz = vr;
  const vy = -vq - vr;
  let best = HEX_DIRECTIONS[0]!;
  let bestDot = -Infinity;
  for (const d of HEX_DIRECTIONS) {
    const dot = d.q * vx + (-d.q - d.r) * vy + d.r * vz;
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best;
}
