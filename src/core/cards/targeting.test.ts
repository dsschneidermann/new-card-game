import { describe, it, expect } from 'vitest';
import { resolveTargeting } from './targeting';
import type { TargetSpec } from './types';
import type { Hex } from '../hex/hex';

const origin: Hex = { q: 0, r: 0 };

/** A blocksSight predicate from a set of wall hexes. */
const walls =
  (...hs: Hex[]) =>
  (h: Hex): boolean =>
    hs.some((w) => w.q === h.q && w.r === h.r);

const has = (hexes: readonly Hex[], h: Hex): boolean => hexes.some((p) => p.q === h.q && p.r === h.r);

describe('resolveTargeting line-of-sight gating', () => {
  it('lineOfSight: blocked between -> empty; clear -> the target plus the ray', () => {
    const spec: TargetSpec = { kind: 'lineOfSight', maxRange: 5 };
    const target: Hex = { q: 4, r: 0 };
    const blocked = resolveTargeting(spec, origin, target, undefined, walls({ q: 2, r: 0 }));
    expect(blocked.primary).toEqual([]);
    const clear = resolveTargeting(spec, origin, target, undefined, () => false);
    expect(clear.primary).toEqual([target]);
    expect(clear.secondary.length).toBeGreaterThan(0); // the ray between the endpoints
  });

  it('singleHex WITH a maxRange (reach attack, e.g. Long Strike) requires line of sight', () => {
    const spec: TargetSpec = { kind: 'singleHex', maxRange: 2 };
    const target: Hex = { q: 2, r: 0 };
    expect(resolveTargeting(spec, origin, target, undefined, walls({ q: 1, r: 0 })).primary).toEqual([]);
    expect(resolveTargeting(spec, origin, target, undefined, () => false).primary).toEqual([target]);
  });

  it('singleHex WITHOUT a maxRange (e.g. teleport) ignores line of sight', () => {
    const spec: TargetSpec = { kind: 'singleHex' };
    const target: Hex = { q: 4, r: 0 };
    // A wall sits between, but an unranged pick is not a reach attack, so it is still allowed.
    expect(resolveTargeting(spec, origin, target, undefined, walls({ q: 2, r: 0 })).primary).toEqual([target]);
  });

  it('selfAoe excludes burst hexes a wall shields, keeps clear ones', () => {
    const spec: TargetSpec = { kind: 'selfAoe', radius: 2 };
    const wall: Hex = { q: 1, r: 0 };
    const { primary } = resolveTargeting(spec, origin, origin, undefined, walls(wall));
    expect(has(primary, { q: 2, r: 0 })).toBe(false); // directly behind the wall: shielded
    expect(has(primary, { q: 0, r: -1 })).toBe(true); // a clear neighbour stays in the burst
    expect(has(primary, wall)).toBe(true); // the wall hex itself is adjacent (LoS clear), so it stays
    expect(has(primary, origin)).toBe(false); // the caster's own hex is never in its burst
  });

  it('with no blocksSight predicate, behaves exactly as before (no LoS gating)', () => {
    const spec: TargetSpec = { kind: 'lineOfSight', maxRange: 5 };
    const target: Hex = { q: 4, r: 0 };
    // Default predicate = nothing blocks, so a target with a (would-be) wall still resolves.
    expect(resolveTargeting(spec, origin, target).primary).toEqual([target]);
  });
});
