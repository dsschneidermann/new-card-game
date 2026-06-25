import { describe, it, expect } from 'vitest';
import { resolveTargeting } from './targeting';
import type { TargetSpec } from './types';
import type { Hex } from '../hex/hex';

const origin: Hex = { q: 0, r: 0 };

/** A blocksSight predicate from a set of tall obstacle hexes. */
const obstacles =
  (...hs: Hex[]) =>
  (h: Hex): boolean =>
    hs.some((w) => w.q === h.q && w.r === h.r);

const has = (hexes: readonly Hex[], h: Hex): boolean => hexes.some((p) => p.q === h.q && p.r === h.r);

describe('resolveTargeting line-of-sight gating', () => {
  it('lineOfSight: blocked -> no red target but the attempted ray; clear -> the target plus the ray', () => {
    const spec: TargetSpec = { kind: 'lineOfSight', maxRange: 5 };
    const target: Hex = { q: 4, r: 0 };
    const blocked = resolveTargeting(spec, origin, target, undefined, obstacles({ q: 2, r: 0 }));
    expect(blocked.primary).toEqual([]); // no red target square when the shot is blocked
    expect(has(blocked.secondary, { q: 1, r: 0 })).toBe(true); // ray drawn up to...
    expect(has(blocked.secondary, { q: 2, r: 0 })).toBe(true); // ...and including the tall obstacle
    expect(has(blocked.secondary, target)).toBe(false); // but never reaching the target
    const clear = resolveTargeting(spec, origin, target, undefined, () => false);
    expect(clear.primary).toEqual([target]);
    expect(clear.secondary.length).toBeGreaterThan(0); // the ray between the endpoints
  });

  it('singleHex WITH a maxRange (reach attack, e.g. Long Strike) requires line of sight', () => {
    const spec: TargetSpec = { kind: 'singleHex', maxRange: 2 };
    const target: Hex = { q: 2, r: 0 };
    expect(resolveTargeting(spec, origin, target, undefined, obstacles({ q: 1, r: 0 })).primary).toEqual([]);
    expect(resolveTargeting(spec, origin, target, undefined, () => false).primary).toEqual([target]);
  });

  it('singleHex WITHOUT a maxRange (e.g. teleport) ignores line of sight', () => {
    const spec: TargetSpec = { kind: 'singleHex' };
    const target: Hex = { q: 4, r: 0 };
    // A tall obstacle sits between, but an unranged pick is not a reach attack, so it is still allowed.
    expect(resolveTargeting(spec, origin, target, undefined, obstacles({ q: 2, r: 0 })).primary).toEqual([target]);
  });

  it('selfAoe excludes burst hexes a tall obstacle shields, keeps clear ones', () => {
    const spec: TargetSpec = { kind: 'selfAoe', radius: 2 };
    const tall: Hex = { q: 1, r: 0 };
    const { primary } = resolveTargeting(spec, origin, origin, undefined, obstacles(tall));
    expect(has(primary, { q: 2, r: 0 })).toBe(false); // directly behind the tall: shielded
    expect(has(primary, { q: 0, r: -1 })).toBe(true); // a clear neighbour stays in the burst
    expect(has(primary, tall)).toBe(true); // the tall hex itself is adjacent (LoS clear), so it stays
    expect(has(primary, origin)).toBe(false); // the caster's own hex is never in its burst
  });

  it('with no blocksSight predicate, behaves exactly as before (no LoS gating)', () => {
    const spec: TargetSpec = { kind: 'lineOfSight', maxRange: 5 };
    const target: Hex = { q: 4, r: 0 };
    // Default predicate = nothing blocks, so a target with a (would-be) tall still resolves.
    expect(resolveTargeting(spec, origin, target).primary).toEqual([target]);
  });

  it('lineOfSight stays valid via the mirror path and draws a ray that avoids the blocker', () => {
    const spec: TargetSpec = { kind: 'lineOfSight', maxRange: 5 };
    const target: Hex = { q: 1, r: 1 }; // two straight paths straddle (1,0) and (0,1)
    const res = resolveTargeting(spec, origin, target, undefined, obstacles({ q: 1, r: 0 }));
    expect(res.primary).toEqual([target]); // still targetable
    expect(has(res.secondary, { q: 1, r: 0 })).toBe(false); // drawn ray avoids the tall
    expect(has(res.secondary, { q: 0, r: 1 })).toBe(true); // routes via the mirror
  });

  it('selfAoe highlight includes a hex reachable only via a mirror path', () => {
    const spec: TargetSpec = { kind: 'selfAoe', radius: 2 };
    const behind: Hex = { q: 1, r: 1 };
    const oneTall = resolveTargeting(spec, origin, origin, undefined, obstacles({ q: 1, r: 0 })).primary;
    expect(has(oneTall, behind)).toBe(true); // a mirror straight line still reaches it
    const bothTalls = resolveTargeting(spec, origin, origin, undefined, obstacles({ q: 1, r: 0 }, { q: 0, r: 1 })).primary;
    expect(has(bothTalls, behind)).toBe(false); // both straddles blocked -> shielded
  });
});
