import { describe, it, expect } from 'vitest';
import { OBSTACLE_RULES, Obstacle, applyObstacles } from './obstacles';
import { HexGrid } from './hex/grid';
import { offsetToAxial } from './hex/layout';
import { HexPosition } from './hex/movement';
import { createWorld, serializeWorld, restoreWorld } from './ecs/world';

describe('obstacle rules', () => {
  it('a tall obstacle blocks movement and sight; a low obstacle blocks movement only', () => {
    expect(OBSTACLE_RULES.tall).toEqual({ blocksMove: true, blocksSight: true });
    expect(OBSTACLE_RULES.low).toEqual({ blocksMove: true, blocksSight: false });
  });
});

describe('applyObstacles', () => {
  it('sets grid walkability + sight flags per kind', () => {
    const grid = new HexGrid(10, 10);
    const tall = offsetToAxial({ col: 4, row: 4 });
    const low = offsetToAxial({ col: 6, row: 4 });
    applyObstacles(grid, [
      { kind: 'tall', hex: tall },
      { kind: 'low', hex: low },
    ]);
    expect(grid.isWalkable(tall)).toBe(false);
    expect(grid.blocksSight(tall)).toBe(true);
    expect(grid.isWalkable(low)).toBe(false);
    expect(grid.blocksSight(low)).toBe(false); // ranged fires over a low low
  });
});

describe('Obstacle persistence', () => {
  it('round-trips an obstacle entity with its kind', () => {
    const world = createWorld(1);
    const e = world.createEntity();
    world.store(Obstacle).add(e, { kind: 'tall' });
    world.store(HexPosition).add(e, { hex: { q: 1, r: 2 } });

    const restored = restoreWorld(serializeWorld(world));
    const obstacles = [...restored.store(Obstacle).entries()];
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]![1].kind).toBe('tall');
  });
});
