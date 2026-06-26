import Phaser from 'phaser';
import {
  AssetKeys,
  Obstacle,
  HexPosition,
  applyObstacleEntities,
  generateSpaceObstacles,
  spaceStartHex,
  SPACE_COLS,
  SPACE_ROWS,
  SPACE_ID,
  HexGrid,
  type AssetKey,
  type World,
  type Hex,
  type ObstacleKind,
} from '@core/index';
import { Renderable } from '@render/characterViews';
import type { Level, LevelBuildContext } from './level';

/**
 * The Space level (TEMPORARY — removed after the level-seam code review). Empty void terrain (one flat
 * fill layer) + asteroid obstacles (reusing the shared tall/low rules with asteroid art), no chests, no
 * enemies. Demonstrates that adding a level touches only its own files + the registry — never WorldScene
 * or the shared helpers. All art is ADR-004 placeholder.
 */
const SPACE_DEPTH = -1_100_000; // the void fill, below the hex outline (gridGfx at -1_000_000)
const VOID_KEY = AssetKeys.terrainSpace;

// Large asteroids are tall (block movement + sight); small are low (fire over). Space's own art.
const ASTEROID_ART: Record<ObstacleKind, AssetKey> = {
  tall: AssetKeys.obstacleAsteroid1,
  low: AssetKeys.obstacleAsteroid2,
};

export class SpaceLevel implements Level {
  readonly id = SPACE_ID;
  readonly cols = SPACE_COLS;
  readonly rows = SPACE_ROWS;
  readonly startHex: Hex = spaceStartHex;

  constructor(private readonly seed: number) {}

  populate(world: World, grid: HexGrid): void {
    for (const o of generateSpaceObstacles(this.seed)) {
      const e = world.createEntity();
      world.store(Obstacle).add(e, { kind: o.kind });
      world.store(HexPosition).add(e, { hex: o.hex });
    }
    this.install(world, grid);
  }

  reinstall(world: World, grid: HexGrid): void {
    this.install(world, grid);
  }

  private install(world: World, grid: HexGrid): void {
    applyObstacleEntities(world, grid);
    for (const [obstacle, { kind }] of world.store(Obstacle).entries()) {
      world.store(Renderable).add(obstacle, { texture: ASTEROID_ART[kind] });
    }
  }

  buildTerrain(ctx: LevelBuildContext): Phaser.Tilemaps.TilemapLayer[] {
    const { scene, layout, worldBounds: wb, tileW, tileH } = ctx;
    scene.textures.get(VOID_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const originCol = Math.floor(wb.minX / tileW);
    const topPadRows = Math.ceil(layout.height / tileH);
    const originRow = Math.floor(wb.minY / tileH) - topPadRows;
    const cols = Math.ceil(wb.maxX / tileW) - originCol + 1;
    const rows = Math.ceil(wb.maxY / tileH) - originRow + 1;
    const map = scene.make.tilemap({ tileWidth: 16, tileHeight: 16, width: cols, height: rows });
    const tileset = map.addTilesetImage('space', VOID_KEY, 16, 16) as Phaser.Tilemaps.Tileset;
    const fill = map
      .createBlankLayer('space', tileset, originCol * tileW, originRow * tileH)!
      .setScale(tileW / 16, tileH / 16)
      .setDepth(SPACE_DEPTH);
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) fill.putTileAt(tileset.firstgid, tx, ty); // the single void tile
    }
    return [fill];
  }
}
