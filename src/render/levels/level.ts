import type Phaser from 'phaser';
import {
  FOREST_ID,
  HexGrid,
  type Hex,
  type HexLayout,
  type WorldPixelBounds,
  type World,
} from '@core/index';
import { ForestLevel } from './ForestLevel';

/**
 * The renderer-side LEVEL SEAM. A Level owns its terrain, obstacles, chests and the generation that
 * produces them; WorldScene holds one and only ever asks it for its dimensions/start, to populate/reinstall
 * the ECS, and to build its terrain render layers — reading everything else off the entity system. Each
 * Level pairs a pure core generator (src/core/levels/<id>) with its Phaser tileset frames + prop art.
 */

/** What a level needs from WorldScene to build its terrain render layers (all display/run concerns). */
export interface LevelBuildContext {
  readonly scene: Phaser.Scene;
  readonly layout: HexLayout;
  readonly worldBounds: WorldPixelBounds;
  readonly tileW: number; // s(TERRAIN_TILE_W) — display constant, scaled by WorldScene
  readonly tileH: number; // s(TERRAIN_TILE_H)
}

export interface Level {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  readonly startHex: Hex;
  /** Fresh run: generate this level's content, spawn its entities (+ Renderables), and apply grid flags. */
  populate(world: World, grid: HexGrid): void;
  /** Resume/Restart: re-apply grid flags from the RESTORED entities and re-attach their Renderables. */
  reinstall(world: World, grid: HexGrid): void;
  /** Build the terrain render layers (depth-stacked, bottom-up). WorldScene masks + tracks them. */
  buildTerrain(ctx: LevelBuildContext): Phaser.Tilemaps.TilemapLayer[];
}

/** Build the Level for an id (the only place that maps a level id to its renderer class). */
export function makeLevel(id: string, seed: number): Level {
  switch (id) {
    case FOREST_ID:
    default:
      return new ForestLevel(seed);
  }
}
