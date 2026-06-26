import { describe, it, expect } from 'vitest';
import {
  generateSpaceObstacles,
  spaceStartHex,
  SPACE_COLS,
  SPACE_ROWS,
  HexGrid,
  applyObstacles,
  hexKey,
  hexDistance,
} from '@core/index';

describe('space level placement', () => {
  const grid = (): HexGrid => new HexGrid(SPACE_COLS, SPACE_ROWS);

  it('spaceStartHex is in-bounds and walkable', () => {
    expect(grid().inBounds(spaceStartHex)).toBe(true);
    expect(grid().isWalkable(spaceStartHex)).toBe(true);
  });

  it('generateSpaceObstacles is deterministic, in-bounds, kinded, and keeps the start clear', () => {
    const a = generateSpaceObstacles(2024);
    const b = generateSpaceObstacles(2024);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    const g = grid();
    for (const o of a) {
      expect(g.inBounds(o.hex)).toBe(true);
      expect(o.kind === 'tall' || o.kind === 'low').toBe(true);
      expect(hexKey(o.hex)).not.toBe(hexKey(spaceStartHex));
      expect(hexDistance(o.hex, spaceStartHex)).toBeGreaterThan(3); // START_CLEAR_RADIUS
    }
  });

  it('asteroids block movement/sight per kind, leaving the start walkable', () => {
    const g = grid();
    const asteroids = generateSpaceObstacles(2024);
    applyObstacles(g, asteroids);
    for (const o of asteroids) {
      expect(g.isWalkable(o.hex)).toBe(false);
      expect(g.blocksSight(o.hex)).toBe(o.kind === 'tall');
    }
    expect(g.isWalkable(spaceStartHex)).toBe(true);
  });
});
