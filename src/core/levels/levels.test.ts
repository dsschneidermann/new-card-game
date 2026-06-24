import { describe, it, expect } from 'vitest';
import { FOREST_LEVEL } from './forest';
import { HexGrid } from '../hex/grid';
import { offsetToAxial } from '../hex/layout';
import { hexEquals } from '../hex/hex';
import { applyObstacles } from '../obstacles';

describe('FOREST_LEVEL', () => {
  it('has the forest identity (id, size, seed)', () => {
    expect(FOREST_LEVEL.id).toBe('forest');
    expect(FOREST_LEVEL.cols).toBe(52);
    expect(FOREST_LEVEL.rows).toBe(42);
    expect(FOREST_LEVEL.terrainSeed).toBe(0x7e44a1);
  });

  it('starts the player at the grid centre, in-bounds and walkable', () => {
    const centre = offsetToAxial({ col: 26, row: 21 });
    expect(hexEquals(FOREST_LEVEL.startHex, centre)).toBe(true);
    const grid = new HexGrid(FOREST_LEVEL.cols, FOREST_LEVEL.rows);
    expect(grid.inBounds(FOREST_LEVEL.startHex)).toBe(true);
    expect(grid.isWalkable(FOREST_LEVEL.startHex)).toBe(true);
  });

  it('spawns no enemies (the showcase was removed)', () => {
    expect(FOREST_LEVEL.enemySpawns).toHaveLength(0);
  });

  it('places obstacles near the start and applies their grid flags', () => {
    expect(FOREST_LEVEL.obstacles.length).toBeGreaterThan(0);
    const grid = new HexGrid(FOREST_LEVEL.cols, FOREST_LEVEL.rows);
    applyObstacles(grid, FOREST_LEVEL.obstacles);
    for (const o of FOREST_LEVEL.obstacles) {
      expect(grid.isWalkable(o.hex)).toBe(false); // every obstacle blocks movement
      expect(grid.blocksSight(o.hex)).toBe(o.kind === 'wall'); // only walls block line of sight
    }
    expect(grid.isWalkable(FOREST_LEVEL.startHex)).toBe(true); // the start hex stays clear
  });
});
