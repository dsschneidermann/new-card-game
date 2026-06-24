import { defineComponent, type ComponentType } from './ecs/component';
import { type Hex } from './hex/hex';
import { HexGrid } from './hex/grid';

/**
 * A kind of map obstacle (ADR-006). A WALL blocks movement AND line of sight; a low ROCK blocks
 * movement only, so ranged attacks fire over it. New kinds (e.g. a sight-only bush) are one entry here
 * plus its rule below.
 */
export type ObstacleKind = 'wall' | 'rock';

/** What an obstacle kind blocks. Pure rules — shared by the grid-flag application (and any AI later). */
export interface ObstacleRule {
  readonly blocksMove: boolean;
  readonly blocksSight: boolean;
}

export const OBSTACLE_RULES: Record<ObstacleKind, ObstacleRule> = {
  wall: { blocksMove: true, blocksSight: true },
  rock: { blocksMove: true, blocksSight: false },
};

/**
 * An obstacle entity's data: its kind. Persisted (like Enemy) so resume restores each obstacle and its
 * art. The renderer maps the kind to a texture via the level's TerrainTheme.obstacleArt.
 */
export interface ObstacleData {
  readonly kind: ObstacleKind;
}

export const Obstacle: ComponentType<ObstacleData> = defineComponent<ObstacleData>('Obstacle');

/**
 * Apply a set of obstacles to a grid's walkability + sight flags per their kind's rules. Pure: the
 * movement pathfinder then routes around the now-unwalkable hexes and hasLineOfSight is blocked by the
 * sight-blocking ones. Idempotent for a given obstacle set.
 */
export function applyObstacles(grid: HexGrid, obstacles: Iterable<{ kind: ObstacleKind; hex: Hex }>): void {
  for (const { kind, hex } of obstacles) {
    const rule = OBSTACLE_RULES[kind];
    if (rule.blocksMove) grid.setWalkable(hex, false);
    if (rule.blocksSight) grid.setBlocksSight(hex, true);
  }
}
