import { defineComponent, type ComponentType } from './ecs/component';
import { type Hex } from './hex/hex';
import { HexGrid } from './hex/grid';
import { HexPosition } from './hex/movement';
import type { World } from './ecs/world';

/**
 * A kind of map obstacle (ADR-006). A TALL obstacle blocks movement AND line of sight; a LOW obstacle blocks
 * movement only, so ranged attacks fire over it. New kinds (e.g. a sight-only bush) are one entry here
 * plus its rule below.
 */
export type ObstacleKind = 'tall' | 'low' | 'none';

/** What an obstacle kind blocks. Pure rules — shared by the grid-flag application (and any AI later). */
export interface ObstacleRule {
  readonly blocksMove: boolean;
  readonly blocksSight: boolean;
}

export const OBSTACLE_RULES: Record<ObstacleKind, ObstacleRule> = {
  tall: { blocksMove: true, blocksSight: true },
  low: { blocksMove: true, blocksSight: false },
  none: { blocksMove: false, blocksSight: false },
};

/**
 * An obstacle entity's data: its behavioural kind and the level-defined object `variant`. Persisted (like Enemy)
 * so resume restores each obstacle, its grid flags (from kind), and its art (from variant). The renderer maps the
 * variant to a texture via the active level; the shared rules below read ONLY kind.
 */
export interface ObstacleData {
  readonly kind: ObstacleKind;
  readonly variant: string;
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

/**
 * Apply the grid walkability + sight flags from the world's RESTORED Obstacle entities. Used by a level's
 * fresh populate AND its resume/restart reinstall, so a resumed run re-derives identical flags from the
 * persisted obstacle entities — no need to regenerate (or persist) the placement list. Reads each
 * Obstacle{kind} + its HexPosition and defers to applyObstacles.
 */
export function applyObstacleEntities(world: World, grid: HexGrid): void {
  const spawns = world.entitiesWith(Obstacle, HexPosition).map((e) => ({
    kind: world.store(Obstacle).get(e)!.kind,
    hex: world.store(HexPosition).get(e)!.hex,
  }));
  applyObstacles(grid, spawns);
}
