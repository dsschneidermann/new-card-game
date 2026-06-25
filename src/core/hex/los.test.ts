import { describe, it, expect } from 'vitest';
import { hasLineOfSight, lineOfSightPath } from './los';
import { HexGrid } from './grid';
import { offsetToAxial } from './layout';
import type { Hex } from './hex';

/** A blocksSight predicate that returns true for any hex in the given set. */
const walls =
  (...hs: Hex[]) =>
  (h: Hex): boolean =>
    hs.some((w) => w.q === h.q && w.r === h.r);

describe('hasLineOfSight', () => {
  it('is clear when nothing blocks between the endpoints', () => {
    expect(hasLineOfSight(() => false, { q: 0, r: 0 }, { q: 3, r: 0 })).toBe(true);
  });

  it('is blocked when a sight-blocker lies strictly between', () => {
    // The line 0,0 -> 4,0 passes through 1,0 / 2,0 / 3,0; a wall on 2,0 blocks it.
    expect(hasLineOfSight(walls({ q: 2, r: 0 }), { q: 0, r: 0 }, { q: 4, r: 0 })).toBe(false);
  });

  it('ignores blockers sitting ON either endpoint', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 3, r: 0 };
    expect(hasLineOfSight(walls(from, to), from, to)).toBe(true);
  });

  it('is always clear for adjacent hexes (no hex in between)', () => {
    // Even if the predicate blocks everything, adjacency has no intermediate hex.
    expect(hasLineOfSight(() => true, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(true);
  });

  it('finds an equal-distance MIRROR path when the canonical one is blocked', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 1, r: 1 }; // distance 2; the two straight paths straddle (1,0) and (0,1)
    expect(hasLineOfSight(walls({ q: 1, r: 0 }), from, to)).toBe(true); // mirror via (0,1)
    expect(hasLineOfSight(walls({ q: 0, r: 1 }), from, to)).toBe(true); // mirror via (1,0)
    expect(hasLineOfSight(walls({ q: 1, r: 0 }, { q: 0, r: 1 }), from, to)).toBe(false); // both straddles blocked
  });
});

describe('lineOfSightPath', () => {
  it('returns a connected clear ray that routes around the blocker', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 1, r: 1 };
    const path = lineOfSightPath(walls({ q: 1, r: 0 }), from, to);
    expect(path).not.toBeNull();
    expect(path!.some((h) => h.q === 1 && h.r === 0)).toBe(false); // avoids the blocked hex
    expect(path!.some((h) => h.q === 0 && h.r === 1)).toBe(true); // uses its mirror
    expect(path![0]).toEqual(from);
    expect(path![path!.length - 1]).toEqual(to);
  });

  it('is null when every straight line is blocked', () => {
    expect(lineOfSightPath(walls({ q: 1, r: 0 }, { q: 0, r: 1 }), { q: 0, r: 0 }, { q: 1, r: 1 })).toBeNull();
  });
});

describe('HexGrid sight flags', () => {
  it('tracks blocksSight independently of walkability', () => {
    const grid = new HexGrid(8, 8);
    const h = offsetToAxial({ col: 3, row: 3 });
    expect(grid.blocksSight(h)).toBe(false);

    grid.setBlocksSight(h, true);
    expect(grid.blocksSight(h)).toBe(true);
    expect(grid.isWalkable(h)).toBe(true); // sight-blocking does not imply unwalkable

    grid.setWalkable(h, false);
    expect(grid.isWalkable(h)).toBe(false);
    expect(grid.blocksSight(h)).toBe(true); // and unwalkable does not change sight

    grid.setBlocksSight(h, false);
    expect(grid.blocksSight(h)).toBe(false);
  });
});
