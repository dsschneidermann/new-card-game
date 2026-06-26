import Phaser from 'phaser';
import {
  AssetKeys,
  Obstacle,
  Chest,
  Enemy,
  HexPosition,
  spawnChest,
  applyObstacleEntities,
  forestTerrainTile,
  forestOverlay,
  forestLeaf,
  generateForestObstacles,
  generateForestChests,
  forestStartHex,
  FOREST_COLS,
  FOREST_ROWS,
  FOREST_ID,
  HexGrid,
  type AssetKey,
  type World,
  type Hex,
  type ObstacleKind,
  type TerrainKind,
  type TerrainOverlay,
  type LeafShape,
} from '@core/index';
import { Renderable } from '@render/characterViews';
import type { Level, LevelBuildContext } from './level';

// Terrain render depths (the forest's 3-layer stack), all BELOW the hex outline (gridGfx at -1_000_000).
const TERRAIN_DEPTH = -1_100_000; // grass/dirt fill (bottom)
const TERRAIN_OVERLAY_DEPTH = -1_050_000; // grass-edge overlays (above the fill)
const LEAF_DEPTH = -1_025_000; // grass-leaf decals (above the overlays)

const GROUND_KEY = AssetKeys.terrainGroundGrass;
const LEAF_KEY = AssetKeys.terrainStairsGrass;

// Curated PLAIN fill tiles: the only clean GRASS fill is the flat green; the textured fills are the DIRT
// tiles. The list LENGTH is each kind's variant count, passed into forestTerrainTile.
const FILL_FRAMES: Record<TerrainKind, readonly number[]> = {
  grass: [527],
  dirt: [422],
};

// Grass-edge overlay descriptor -> Ground_grass frame (pairs / edges / diagonal corners).
const OVERLAY_FRAMES: Record<TerrainOverlay, number> = {
  pairWN: 571, pairNE: 572, pairES: 593, pairSW: 592,
  edgeW: 591, edgeN: 611, edgeE: 589, edgeS: 578,
  cornerNW: 612, cornerNE: 610, cornerSE: 568, cornerSW: 570,
};

// Grass-leaf decals from the stairs_grass foliage sheet (frame indices LOCAL to that sheet; the renderer
// offsets them past the ground tileset's gid range). Extracted from the gap-separated TMX "reeds" clusters.
const LEAF_SHAPES: readonly LeafShape[] = [
  [{ dx: 0, dy: 0, frame: 113 }, { dx: 1, dy: 0, frame: 114 }, { dx: 0, dy: 1, frame: 134 }, { dx: 1, dy: 1, frame: 135 }, { dx: 0, dy: 2, frame: 155 }, { dx: 1, dy: 2, frame: 156 }],
  [{ dx: 0, dy: 0, frame: 115 }, { dx: 1, dy: 0, frame: 116 }, { dx: 2, dy: 0, frame: 117 }, { dx: 0, dy: 1, frame: 136 }, { dx: 1, dy: 1, frame: 137 }, { dx: 2, dy: 1, frame: 138 }, { dx: 0, dy: 2, frame: 157 }, { dx: 1, dy: 2, frame: 158 }, { dx: 2, dy: 2, frame: 159 }],
  [{ dx: 0, dy: 0, frame: 118 }, { dx: 1, dy: 0, frame: 119 }, { dx: 2, dy: 0, frame: 120 }, { dx: 0, dy: 1, frame: 139 }, { dx: 1, dy: 1, frame: 140 }, { dx: 2, dy: 1, frame: 141 }, { dx: 0, dy: 2, frame: 160 }, { dx: 1, dy: 2, frame: 161 }, { dx: 2, dy: 2, frame: 162 }],
  [{ dx: 0, dy: 0, frame: 121 }, { dx: 1, dy: 0, frame: 122 }, { dx: 0, dy: 1, frame: 142 }, { dx: 1, dy: 1, frame: 143 }, { dx: 0, dy: 2, frame: 163 }, { dx: 1, dy: 2, frame: 164 }],
  [{ dx: 0, dy: 0, frame: 169 }, { dx: 1, dy: 0, frame: 170 }, { dx: 2, dy: 0, frame: 171 }, { dx: 0, dy: 1, frame: 190 }, { dx: 1, dy: 1, frame: 191 }, { dx: 2, dy: 1, frame: 192 }, { dx: 0, dy: 2, frame: 211 }, { dx: 1, dy: 2, frame: 212 }, { dx: 2, dy: 2, frame: 213 }],
  [{ dx: 0, dy: 0, frame: 175 }, { dx: 1, dy: 0, frame: 176 }, { dx: 2, dy: 0, frame: 177 }, { dx: 0, dy: 1, frame: 196 }, { dx: 1, dy: 1, frame: 197 }, { dx: 2, dy: 1, frame: 198 }, { dx: 0, dy: 2, frame: 217 }, { dx: 1, dy: 2, frame: 218 }, { dx: 2, dy: 2, frame: 219 }],
  [{ dx: 0, dy: 0, frame: 178 }, { dx: 1, dy: 0, frame: 179 }, { dx: 0, dy: 1, frame: 199 }, { dx: 1, dy: 1, frame: 200 }, { dx: 0, dy: 2, frame: 220 }, { dx: 1, dy: 2, frame: 221 }],
  [{ dx: 0, dy: 0, frame: 180 }, { dx: 1, dy: 0, frame: 181 }, { dx: 0, dy: 1, frame: 201 }, { dx: 1, dy: 1, frame: 202 }],
  [{ dx: 0, dy: 0, frame: 182 }, { dx: 1, dy: 0, frame: 183 }, { dx: 0, dy: 1, frame: 203 }, { dx: 1, dy: 1, frame: 204 }],
  [{ dx: 0, dy: 0, frame: 184 }, { dx: 1, dy: 0, frame: 185 }, { dx: 0, dy: 1, frame: 205 }, { dx: 1, dy: 1, frame: 206 }],
  [{ dx: 0, dy: 0, frame: 193 }, { dx: 1, dy: 0, frame: 194 }, { dx: 2, dy: 0, frame: 195 }, { dx: 0, dy: 1, frame: 214 }, { dx: 1, dy: 1, frame: 215 }, { dx: 2, dy: 1, frame: 216 }],
  [{ dx: 0, dy: 0, frame: 222 }, { dx: 1, dy: 0, frame: 223 }, { dx: 0, dy: 1, frame: 243 }, { dx: 1, dy: 1, frame: 244 }],
  [{ dx: 0, dy: 0, frame: 224 }, { dx: 1, dy: 0, frame: 225 }, { dx: 0, dy: 1, frame: 245 }, { dx: 1, dy: 1, frame: 246 }],
  [{ dx: 0, dy: 0, frame: 226 }, { dx: 1, dy: 0, frame: 227 }, { dx: 0, dy: 1, frame: 247 }, { dx: 1, dy: 1, frame: 248 }],
  [{ dx: 0, dy: 0, frame: 232 }, { dx: 1, dy: 0, frame: 233 }, { dx: 2, dy: 0, frame: 234 }, { dx: 0, dy: 1, frame: 253 }, { dx: 1, dy: 1, frame: 254 }, { dx: 2, dy: 1, frame: 255 }],
  [{ dx: 0, dy: 0, frame: 235 }, { dx: 1, dy: 0, frame: 236 }, { dx: 0, dy: 1, frame: 256 }, { dx: 1, dy: 1, frame: 257 }],
  [{ dx: 0, dy: 0, frame: 237 }, { dx: 1, dy: 0, frame: 238 }, { dx: 0, dy: 1, frame: 258 }, { dx: 1, dy: 1, frame: 259 }],
  [{ dx: 0, dy: 0, frame: 239 }, { dx: 1, dy: 0, frame: 240 }, { dx: 0, dy: 1, frame: 260 }, { dx: 1, dy: 1, frame: 261 }],
  [{ dx: 0, dy: 0, frame: 241 }, { dx: 1, dy: 0, frame: 242 }, { dx: 0, dy: 1, frame: 262 }, { dx: 1, dy: 1, frame: 263 }],
  [{ dx: 0, dy: 0, frame: 264 }, { dx: 1, dy: 0, frame: 265 }],
  [{ dx: 0, dy: 0, frame: 266 }, { dx: 1, dy: 0, frame: 267 }],
  [{ dx: 0, dy: 0, frame: 268 }],
  [{ dx: 0, dy: 0, frame: 269 }],
  [{ dx: 0, dy: 0, frame: 274 }, { dx: 1, dy: 0, frame: 275 }, { dx: 0, dy: 1, frame: 295 }, { dx: 1, dy: 1, frame: 296 }],
  [{ dx: 0, dy: 0, frame: 276 }, { dx: 1, dy: 0, frame: 277 }, { dx: 0, dy: 1, frame: 297 }, { dx: 1, dy: 1, frame: 298 }],
  [{ dx: 0, dy: 0, frame: 278 }, { dx: 1, dy: 0, frame: 279 }, { dx: 2, dy: 0, frame: 280 }, { dx: 0, dy: 1, frame: 299 }, { dx: 1, dy: 1, frame: 300 }, { dx: 2, dy: 1, frame: 301 }],
  [{ dx: 0, dy: 0, frame: 281 }, { dx: 1, dy: 0, frame: 282 }, { dx: 0, dy: 1, frame: 302 }, { dx: 1, dy: 1, frame: 303 }],
  [{ dx: 0, dy: 0, frame: 284 }, { dx: 1, dy: 0, frame: 285 }, { dx: 2, dy: 0, frame: 286 }, { dx: 0, dy: 1, frame: 305 }, { dx: 1, dy: 1, frame: 306 }, { dx: 2, dy: 1, frame: 307 }],
  [{ dx: 0, dy: 0, frame: 287 }, { dx: 1, dy: 0, frame: 288 }, { dx: 0, dy: 1, frame: 308 }, { dx: 1, dy: 1, frame: 309 }],
  [{ dx: 0, dy: 0, frame: 289 }, { dx: 1, dy: 0, frame: 290 }, { dx: 0, dy: 1, frame: 310 }, { dx: 1, dy: 1, frame: 311 }],
  [{ dx: 0, dy: 0, frame: 316 }, { dx: 0, dy: 1, frame: 337 }],
  [{ dx: 0, dy: 0, frame: 317 }, { dx: 1, dy: 0, frame: 318 }, { dx: 0, dy: 1, frame: 338 }, { dx: 1, dy: 1, frame: 339 }],
  [{ dx: 0, dy: 0, frame: 319 }, { dx: 1, dy: 0, frame: 320 }, { dx: 0, dy: 1, frame: 340 }, { dx: 1, dy: 1, frame: 341 }],
  [{ dx: 0, dy: 0, frame: 321 }, { dx: 0, dy: 1, frame: 342 }],
  [{ dx: 0, dy: 0, frame: 322 }, { dx: 1, dy: 0, frame: 323 }, { dx: 0, dy: 1, frame: 343 }, { dx: 1, dy: 1, frame: 344 }],
  [{ dx: 0, dy: 0, frame: 324 }, { dx: 0, dy: 1, frame: 345 }],
  [{ dx: 0, dy: 0, frame: 325 }, { dx: 1, dy: 0, frame: 326 }, { dx: 0, dy: 1, frame: 346 }, { dx: 1, dy: 1, frame: 347 }],
  [{ dx: 0, dy: 0, frame: 327 }, { dx: 0, dy: 1, frame: 348 }],
  [{ dx: 0, dy: 0, frame: 328 }],
  [{ dx: 0, dy: 0, frame: 329 }],
];

// Per obstacle KIND -> its prop art (a tree for tall, a boulder for low). The forest's own art.
const OBSTACLE_ART: Record<ObstacleKind, AssetKey> = {
  tall: AssetKeys.obstacleTreeGrass1,
  low: AssetKeys.obstacleRockGrass1,
};

/**
 * The Forest level: grass/dirt/leaf terrain, tree/rock obstacles, and reward chests, all generated
 * procedurally from the run seed. Owns the forest's tileset frames + prop art and the terrain layer build
 * (the former WorldScene.createTerrain + FOREST_THEME); delegates the pure content generation to
 * src/core/levels/forest.
 */
export class ForestLevel implements Level {
  readonly id = FOREST_ID;
  readonly cols = FOREST_COLS;
  readonly rows = FOREST_ROWS;
  readonly startHex: Hex = forestStartHex;

  constructor(private readonly seed: number) {}

  populate(world: World, grid: HexGrid): void {
    const obstacles = generateForestObstacles(this.seed);
    for (const o of obstacles) {
      const e = world.createEntity();
      world.store(Obstacle).add(e, { kind: o.kind });
      world.store(HexPosition).add(e, { hex: o.hex });
    }
    // Each chest rolls its three offered cards from world.rng at spawn (deterministic + persisted).
    for (const c of generateForestChests(this.seed, obstacles)) spawnChest(world, c.hex);
    this.install(world, grid);
  }

  reinstall(world: World, grid: HexGrid): void {
    this.install(world, grid);
  }

  /** Apply grid flags from the obstacle entities + (re-)attach Renderables for all forest content. */
  private install(world: World, grid: HexGrid): void {
    applyObstacleEntities(world, grid);
    for (const [obstacle, { kind }] of world.store(Obstacle).entries()) {
      world.store(Renderable).add(obstacle, { texture: OBSTACLE_ART[kind] });
    }
    for (const [chest, data] of world.store(Chest).entries()) {
      world.store(Renderable).add(chest, { texture: data.opened ? AssetKeys.chestOpen : AssetKeys.chest });
    }
    for (const [enemy, { art }] of world.store(Enemy).entries()) {
      world.store(Renderable).add(enemy, { texture: `${art}.idle`, animBase: art });
    }
  }

  buildTerrain(ctx: LevelBuildContext): Phaser.Tilemaps.TilemapLayer[] {
    const { scene, layout, worldBounds: wb, tileW, tileH } = ctx;
    const seed = this.seed;
    const variantCounts = { grass: FILL_FRAMES.grass.length, dirt: FILL_FRAMES.dirt.length };
    // NEAREST so the 16px pixel-art tiles stay crisp scaled up.
    scene.textures.get(GROUND_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    scene.textures.get(LEAF_KEY).setFilter(Phaser.Textures.FilterMode.NEAREST);
    const originCol = Math.floor(wb.minX / tileW);
    // Extend the layer's TOP up by the mask's one-hex-height top-pad so real tiles back it (no empty sliver).
    const topPadRows = Math.ceil(layout.height / tileH);
    const originRow = Math.floor(wb.minY / tileH) - topPadRows;
    const cols = Math.ceil(wb.maxX / tileW) - originCol + 1;
    const rows = Math.ceil(wb.maxY / tileH) - originRow + 1;
    const map = scene.make.tilemap({ tileWidth: 16, tileHeight: 16, width: cols, height: rows });
    const tileset = map.addTilesetImage('terrain', GROUND_KEY, 16, 16) as Phaser.Tilemaps.Tileset;
    // Second tileset on the SAME map for the leaf decals; its firstgid sits past the ground gids so they never collide.
    const leafFirstGid = tileset.firstgid + tileset.total;
    const leafTileset = map.addTilesetImage('stairs_grass', LEAF_KEY, 16, 16, 0, 0, leafFirstGid) as Phaser.Tilemaps.Tileset;
    const fill = map
      .createBlankLayer('terrain', tileset, originCol * tileW, originRow * tileH)!
      .setScale(tileW / 16, tileH / 16)
      .setDepth(TERRAIN_DEPTH);
    const overlay = map
      .createBlankLayer('overlay', tileset, originCol * tileW, originRow * tileH)!
      .setScale(tileW / 16, tileH / 16)
      .setDepth(TERRAIN_OVERLAY_DEPTH);
    const leaf = map
      .createBlankLayer('leaf', [tileset, leafTileset], originCol * tileW, originRow * tileH)!
      .setScale(tileW / 16, tileH / 16)
      .setDepth(LEAF_DEPTH);
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const { kind, variant } = forestTerrainTile(originCol + tx, originRow + ty, seed, variantCounts);
        fill.putTileAt(FILL_FRAMES[kind][variant] as number, tx, ty);
        const ov = forestOverlay(originCol + tx, originRow + ty, seed);
        if (ov !== null) overlay.putTileAt(OVERLAY_FRAMES[ov], tx, ty);
        const lf = forestLeaf(originCol + tx, originRow + ty, seed, LEAF_SHAPES);
        if (lf !== null) leaf.putTileAt(leafFirstGid + lf, tx, ty);
      }
    }
    return [fill, overlay, leaf];
  }
}
