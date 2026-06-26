import type { Hex } from '../hex/hex';
import type { ObstacleKind } from '../obstacles';

/**
 * Shared per-level CONTENT-PLACEMENT types (Phaser-free, ADR-002). A level's pure generator
 * (src/core/levels/<id>) produces lists of these; the renderer Level turns each into an entity. They are
 * level-agnostic value types — which kinds/art a level uses, and where it places them, is the level's own.
 */

/**
 * A single enemy placed at level start: its art base (the renderer draws `${art}.idle`) and the hex it
 * stands on. The renderer turns each into an Enemy entity.
 */
export interface EnemySpawn {
  readonly art: string;
  readonly hex: Hex;
}

/**
 * A single obstacle placed on a level: its behavioural kind (tall/low — see OBSTACLE_RULES for what each
 * blocks) and the hex it occupies. The renderer turns each into an Obstacle entity, applies its
 * walkability/sight flags to the grid, and draws the level's art for its kind.
 */
export interface ObstacleSpawn {
  readonly kind: ObstacleKind;
  readonly hex: Hex;
}

/**
 * A single treasure chest placed on a level: the (walkable) hex it stands on. The renderer turns each into
 * a Chest entity (carrying three rolled card rewards) + HexPosition — like an obstacle, but on a WALKABLE
 * tile (it doesn't block paths). The player opens it by targeting it with a move (a zero-cost interact).
 */
export interface ChestSpawn {
  readonly hex: Hex;
}
