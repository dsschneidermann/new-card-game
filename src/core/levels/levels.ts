import type { Hex } from '../hex/hex';
import type { ObstacleKind } from '../obstacles';

/**
 * A single enemy placed at level start: its art base (the renderer draws `${art}.idle`)
 * and the hex it stands on. Pure data — no Phaser, no entity ids; WorldScene turns each
 * spawn into an Enemy entity at create time.
 */
export interface EnemySpawn {
  readonly art: string;
  readonly hex: Hex;
}

/**
 * A single obstacle placed on the level: its kind (tall/low — see OBSTACLE_RULES for what each blocks)
 * and the hex it occupies. Pure data; WorldScene turns each into an Obstacle entity, applies its
 * walkability/sight flags to the grid, and renders it via the TerrainTheme's art for its kind.
 */
export interface ObstacleSpawn {
  readonly kind: ObstacleKind;
  readonly hex: Hex;
}

/**
 * A single treasure chest placed on the level: the (walkable) hex it stands on. Pure data; WorldScene
 * turns each into a Chest entity (carrying three rolled card rewards) + HexPosition — like an obstacle,
 * but on a WALKABLE tile, since the player moves ONTO it to open it.
 */
export interface ChestSpawn {
  readonly hex: Hex;
}

/**
 * A level's pure, engine-agnostic definition (ADR-002): world size, the player's start
 * hex, the enemy spawns, and the terrain seed that feeds the shared pure terrain functions
 * (terrainTile / terrainOverlay / terrainLeaf). Phaser-free and unit-testable.
 *
 * The Phaser-tileset-coupled terrain content (sheet frame indices + leaf shapes) is NOT
 * here — those are renderer-owned (see the Terrain Rendering arch), so the renderer pairs a
 * LevelDef with a TerrainTheme by id (src/render/terrainTheme.ts). The seed lives here
 * because it only drives the pure noise, not any sheet frame.
 */
export interface LevelDef {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  readonly startHex: Hex;
  readonly enemySpawns: readonly EnemySpawn[];
  readonly obstacles: readonly ObstacleSpawn[];
  readonly chests: readonly ChestSpawn[];
  readonly terrainSeed: number;
}
