import { type Hex, hexDistance } from './hex';

/**
 * Hex line drawing and range (ADR-006), pure and Phaser-free. Used by card/spell
 * targeting (feature 09): a line-of-sight ray and an area-of-effect disk.
 */

/** Round fractional cube coords to the nearest hex (axial result). */
function cubeRound(q: number, r: number, s: number): Hex {
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

const LINE_EPS = 1e-6;

/**
 * The rounded hex at fraction i/n along a->b. The tie-break nudge's SIGN picks the side of an
 * exact-midpoint crossing: +LINE_EPS reproduces the canonical hexLine, -LINE_EPS gives the mirror hex.
 */
function lineHexAt(a: Hex, b: Hex, n: number, i: number, eps: number): Hex {
  const aq = a.q + eps;
  const ar = a.r + eps;
  const as = -aq - ar;
  const bs = -b.q - b.r;
  const t = i / n;
  return cubeRound(aq + (b.q - aq) * t, ar + (b.r - ar) * t, as + (bs - as) * t);
}

/**
 * The contiguous line of hexes from `a` to `b`, inclusive of both endpoints
 * (length = hexDistance(a,b) + 1). A tiny epsilon nudge breaks exact-midpoint
 * ties so the result is deterministic and every step is a single hex.
 */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const out: Hex[] = [];
  for (let i = 0; i <= n; i += 1) out.push(lineHexAt(a, b, n, i, LINE_EPS));
  return out;
}

/**
 * Per-step candidates of the straight line a->b: at each step the PRIMARY hex (the canonical +eps
 * tie-break, identical to hexLine) and the MIRROR hex (the -eps tie-break). They are equal except where
 * the line grazes a hex boundary — there they are the two equal-distance hexes straddling the line.
 * Line of sight walks these and tries the mirror when the primary is blocked.
 */
export function hexLineCandidates(a: Hex, b: Hex): { primary: Hex; mirror: Hex }[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ primary: { q: a.q, r: a.r }, mirror: { q: a.q, r: a.r } }];
  const out: { primary: Hex; mirror: Hex }[] = [];
  for (let i = 0; i <= n; i += 1) {
    out.push({ primary: lineHexAt(a, b, n, i, LINE_EPS), mirror: lineHexAt(a, b, n, i, -LINE_EPS) });
  }
  return out;
}

/** Every hex within `radius` of `center` (cube distance <= radius), center first-ish. */
export function hexesWithinRange(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr += 1) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}
