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
 * Bake a list of `{ kind, hex }` obstacles into a grid's walkability + sight flags per each kind's rules —
 * the low-level inner write loop. This is an INTERNAL primitive: in production it is called ONLY by
 * applyObstacleEntities (the public driver below); its only other callers are this module's unit tests. It
 * is deliberately NOT re-exported from the core barrel — reach for applyObstacleEntities instead. Pure and
 * idempotent for a given list: the movement pathfinder then routes around the now-unwalkable hexes and
 * hasLineOfSight is blocked by the sight-blocking ones.
 */
export function bakeObstacleFlags(grid: HexGrid, obstacles: Iterable<{ kind: ObstacleKind; hex: Hex }>): void {
  for (const { kind, hex } of obstacles) {
    const rule = OBSTACLE_RULES[kind];
    if (rule.blocksMove) grid.setWalkable(hex, false);
    if (rule.blocksSight) grid.setBlocksSight(hex, true);
  }
}

/**
 * Rebuild a grid's walkability + sight flags from the world's Obstacle entities — the PUBLIC obstacle entry
 * point (the only production call path: ForestLevel.populate / reinstall → install). The grid flags are a
 * DERIVED spatial index over the obstacles: the persisted Obstacle{kind} + HexPosition entities are the
 * source of truth, and this projection rebuilds that index at every world build. Because it re-derives from
 * the entities, a level's fresh populate AND its resume/restart reinstall produce identical flags with no
 * need to regenerate (or persist) a placement list. Reads each Obstacle{kind} + its HexPosition and bakes
 * them via the internal bakeObstacleFlags.
 */
export function applyObstacleEntities(world: World, grid: HexGrid): void {
  const spawns = world.entitiesWith(Obstacle, HexPosition).map((e) => ({
    kind: world.store(Obstacle).get(e)!.kind,
    hex: world.store(HexPosition).get(e)!.hex,
  }));
  bakeObstacleFlags(grid, spawns);
}
