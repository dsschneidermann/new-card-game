import { describe, it, expect } from 'vitest';
import { hasLineOfSight } from './los';
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
