import type { Hex } from '../hex/hex';

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
  readonly terrainSeed: number;
}
