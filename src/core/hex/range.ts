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

/**
 * The contiguous line of hexes from `a` to `b`, inclusive of both endpoints
 * (length = hexDistance(a,b) + 1). A tiny epsilon nudge breaks exact-midpoint
 * ties so the result is deterministic and every step is a single hex.
 */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const eps = 1e-6;
  const aq = a.q + eps;
  const ar = a.r + eps;
  const as = -a.q - a.r - 2 * eps;
  const bq = b.q;
  const br = b.r;
  const bs = -b.q - b.r;
  const out: Hex[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push(cubeRound(aq + (bq - aq) * t, ar + (br - ar) * t, as + (bs - as) * t));
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
