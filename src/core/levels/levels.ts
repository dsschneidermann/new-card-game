import type { Hex } from '../hex/hex';
import type { ObstacleKind } from '../obstacles';

/**
 * Shared per-level CONTENT-PLACEMENT types (Phaser-free, ADR-002). A level's pure generator
 * (src/core/levels/<id>) produces lists of these; the renderer Level turns each into an entity. They are
 * level-agnostic value types — which kinds/art a level uses, and where it places them, is the level's own.
 */

/**
 * A single enemy placed at level start: which roster archetype it is (defId, keyed into ARCHETYPES) and the
 * hex it stands on. The renderer turns each into an Enemy entity via spawnEnemy, which materialises the
 * archetype's stats (HP / armour / attacks / self-shield) and art onto components.
 */
export interface EnemySpawn {
  readonly defId: string;
  readonly hex: Hex;
}

/**
 * A single obstacle placed on a level: its behavioural kind (tall/low — see OBSTACLE_RULES for what each
 * blocks), the level-defined object `variant` (an opaque id the renderer maps to a specific prop art), and
 * the hex it occupies. The renderer turns each into an Obstacle entity, applies its walkability/sight flags
 * to the grid, and draws the art for its variant. `kind` stays the only field the shared grid-flag rules read.
 */
export interface ObstacleSpawn {
  readonly kind: ObstacleKind;
  readonly variant: string;
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
