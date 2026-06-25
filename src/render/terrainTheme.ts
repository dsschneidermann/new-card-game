import {
  AssetKeys,
  type AssetKey,
  type TerrainKind,
  type TerrainOverlay,
  type LeafShape,
  type ObstacleKind,
} from '@core/index';

/**
 * The Phaser-tileset-coupled terrain content for a level: which tileset textures it draws from
 * and which sheet frames / leaf shapes its ground uses. This is the renderer half of a "level":
 * it pairs with a pure LevelDef (which holds the world size, start, spawns, and terrain SEED).
 * WorldScene.createTerrain feeds these frames/shapes into the pure terrainTile/terrainOverlay/
 * terrainLeaf. The frame indices are renderer-owned and tileset-coupled (Terrain Rendering arch),
 * so they live here rather than in the pure core.
 */
export interface TerrainTheme {
  readonly groundKey: AssetKey;
  readonly leafKey: AssetKey;
  // (kind) -> the ground-sheet fill frames for that kind. The list LENGTH is the kind's variant
  // count, passed into the pure terrainTile so the variant index always lands within the frames.
  readonly fillFrames: Record<TerrainKind, readonly number[]>;
  // Grass-edge overlay descriptor -> Ground_grass frame: pairs (two adjacent cardinals) / edges / diagonal corners.
  readonly overlayFrames: Record<TerrainOverlay, number>;
  // Grass-leaf decals from the stairs_grass foliage sheet (leafKey). Each decal is a SHAPE: a list of
  // { dx, dy, frame } tiles anchored at its top-left (frame = LOCAL stairs_grass index; the renderer
  // offsets it past the ground tileset). These shapes were extracted from the gap-separated clusters in
  // the TMX "reeds" layer. The core scatters them one-per-slot on grass; each decal must fit within a
  // single leaf slot.
  readonly leafShapes: readonly LeafShape[];
  // Per obstacle KIND -> the texture for that obstacle's prop sprite. WorldScene spawns an obstacle
  // entity with this art and renders it bottom-anchored + depth-sorted, like a character.
  readonly obstacleArt: Record<ObstacleKind, AssetKey>;
}

/**
 * The Forest level's terrain skin: the flat-green grass fill + the textured dirt fill, the curated
 * grass-edge transition frames, and the grass-leaf foliage decals. Moved verbatim out of WorldScene;
 * keyed to FOREST_LEVEL.id ('forest') via terrainThemeForLevel.
 */
export const FOREST_THEME: TerrainTheme = {
  groundKey: AssetKeys.terrainGroundGrass,
  leafKey: AssetKeys.terrainStairsGrass,
  // Curated PLAIN fill tiles: the only clean GRASS fill is the flat green; the textured fills are the
  // DIRT/rock tiles. These lists are the single source of truth for how many variants each kind has.
  fillFrames: {
    grass: [527],
    dirt: [422],
  },
  overlayFrames: {
    pairWN: 571, pairNE: 572, pairES: 593, pairSW: 592,
    edgeW: 591, edgeN: 611, edgeE: 589, edgeS: 578,
    cornerNW: 612, cornerNE: 610, cornerSE: 568, cornerSW: 570,
  },
  leafShapes: [
    [{ dx: 0, dy: 0, frame: 113 }, { dx: 1, dy: 0, frame: 114 }, { dx: 0, dy: 1, frame: 134 }, { dx: 1, dy: 1, frame: 135 }, { dx: 0, dy: 2, frame: 155 }, { dx: 1, dy: 2, frame: 156 }], // 2x3
    [{ dx: 0, dy: 0, frame: 115 }, { dx: 1, dy: 0, frame: 116 }, { dx: 2, dy: 0, frame: 117 }, { dx: 0, dy: 1, frame: 136 }, { dx: 1, dy: 1, frame: 137 }, { dx: 2, dy: 1, frame: 138 }, { dx: 0, dy: 2, frame: 157 }, { dx: 1, dy: 2, frame: 158 }, { dx: 2, dy: 2, frame: 159 }], // 3x3
    [{ dx: 0, dy: 0, frame: 118 }, { dx: 1, dy: 0, frame: 119 }, { dx: 2, dy: 0, frame: 120 }, { dx: 0, dy: 1, frame: 139 }, { dx: 1, dy: 1, frame: 140 }, { dx: 2, dy: 1, frame: 141 }, { dx: 0, dy: 2, frame: 160 }, { dx: 1, dy: 2, frame: 161 }, { dx: 2, dy: 2, frame: 162 }], // 3x3
    [{ dx: 0, dy: 0, frame: 121 }, { dx: 1, dy: 0, frame: 122 }, { dx: 0, dy: 1, frame: 142 }, { dx: 1, dy: 1, frame: 143 }, { dx: 0, dy: 2, frame: 163 }, { dx: 1, dy: 2, frame: 164 }], // 2x3
    [{ dx: 0, dy: 0, frame: 169 }, { dx: 1, dy: 0, frame: 170 }, { dx: 2, dy: 0, frame: 171 }, { dx: 0, dy: 1, frame: 190 }, { dx: 1, dy: 1, frame: 191 }, { dx: 2, dy: 1, frame: 192 }, { dx: 0, dy: 2, frame: 211 }, { dx: 1, dy: 2, frame: 212 }, { dx: 2, dy: 2, frame: 213 }], // 3x3
    [{ dx: 0, dy: 0, frame: 175 }, { dx: 1, dy: 0, frame: 176 }, { dx: 2, dy: 0, frame: 177 }, { dx: 0, dy: 1, frame: 196 }, { dx: 1, dy: 1, frame: 197 }, { dx: 2, dy: 1, frame: 198 }, { dx: 0, dy: 2, frame: 217 }, { dx: 1, dy: 2, frame: 218 }, { dx: 2, dy: 2, frame: 219 }], // 3x3
    [{ dx: 0, dy: 0, frame: 178 }, { dx: 1, dy: 0, frame: 179 }, { dx: 0, dy: 1, frame: 199 }, { dx: 1, dy: 1, frame: 200 }, { dx: 0, dy: 2, frame: 220 }, { dx: 1, dy: 2, frame: 221 }], // 2x3
    [{ dx: 0, dy: 0, frame: 180 }, { dx: 1, dy: 0, frame: 181 }, { dx: 0, dy: 1, frame: 201 }, { dx: 1, dy: 1, frame: 202 }], // 2x2
    [{ dx: 0, dy: 0, frame: 182 }, { dx: 1, dy: 0, frame: 183 }, { dx: 0, dy: 1, frame: 203 }, { dx: 1, dy: 1, frame: 204 }], // 2x2
    [{ dx: 0, dy: 0, frame: 184 }, { dx: 1, dy: 0, frame: 185 }, { dx: 0, dy: 1, frame: 205 }, { dx: 1, dy: 1, frame: 206 }], // 2x2
    [{ dx: 0, dy: 0, frame: 193 }, { dx: 1, dy: 0, frame: 194 }, { dx: 2, dy: 0, frame: 195 }, { dx: 0, dy: 1, frame: 214 }, { dx: 1, dy: 1, frame: 215 }, { dx: 2, dy: 1, frame: 216 }], // 3x2
    [{ dx: 0, dy: 0, frame: 222 }, { dx: 1, dy: 0, frame: 223 }, { dx: 0, dy: 1, frame: 243 }, { dx: 1, dy: 1, frame: 244 }], // 2x2
    [{ dx: 0, dy: 0, frame: 224 }, { dx: 1, dy: 0, frame: 225 }, { dx: 0, dy: 1, frame: 245 }, { dx: 1, dy: 1, frame: 246 }], // 2x2
    [{ dx: 0, dy: 0, frame: 226 }, { dx: 1, dy: 0, frame: 227 }, { dx: 0, dy: 1, frame: 247 }, { dx: 1, dy: 1, frame: 248 }], // 2x2
    [{ dx: 0, dy: 0, frame: 232 }, { dx: 1, dy: 0, frame: 233 }, { dx: 2, dy: 0, frame: 234 }, { dx: 0, dy: 1, frame: 253 }, { dx: 1, dy: 1, frame: 254 }, { dx: 2, dy: 1, frame: 255 }], // 3x2
    [{ dx: 0, dy: 0, frame: 235 }, { dx: 1, dy: 0, frame: 236 }, { dx: 0, dy: 1, frame: 256 }, { dx: 1, dy: 1, frame: 257 }], // 2x2
    [{ dx: 0, dy: 0, frame: 237 }, { dx: 1, dy: 0, frame: 238 }, { dx: 0, dy: 1, frame: 258 }, { dx: 1, dy: 1, frame: 259 }], // 2x2
    [{ dx: 0, dy: 0, frame: 239 }, { dx: 1, dy: 0, frame: 240 }, { dx: 0, dy: 1, frame: 260 }, { dx: 1, dy: 1, frame: 261 }], // 2x2
    [{ dx: 0, dy: 0, frame: 241 }, { dx: 1, dy: 0, frame: 242 }, { dx: 0, dy: 1, frame: 262 }, { dx: 1, dy: 1, frame: 263 }], // 2x2
    [{ dx: 0, dy: 0, frame: 264 }, { dx: 1, dy: 0, frame: 265 }], // 2x1
    [{ dx: 0, dy: 0, frame: 266 }, { dx: 1, dy: 0, frame: 267 }], // 2x1
    [{ dx: 0, dy: 0, frame: 268 }], // 1x1
    [{ dx: 0, dy: 0, frame: 269 }], // 1x1
    [{ dx: 0, dy: 0, frame: 274 }, { dx: 1, dy: 0, frame: 275 }, { dx: 0, dy: 1, frame: 295 }, { dx: 1, dy: 1, frame: 296 }], // 2x2
    [{ dx: 0, dy: 0, frame: 276 }, { dx: 1, dy: 0, frame: 277 }, { dx: 0, dy: 1, frame: 297 }, { dx: 1, dy: 1, frame: 298 }], // 2x2
    [{ dx: 0, dy: 0, frame: 278 }, { dx: 1, dy: 0, frame: 279 }, { dx: 2, dy: 0, frame: 280 }, { dx: 0, dy: 1, frame: 299 }, { dx: 1, dy: 1, frame: 300 }, { dx: 2, dy: 1, frame: 301 }], // 3x2
    [{ dx: 0, dy: 0, frame: 281 }, { dx: 1, dy: 0, frame: 282 }, { dx: 0, dy: 1, frame: 302 }, { dx: 1, dy: 1, frame: 303 }], // 2x2
    [{ dx: 0, dy: 0, frame: 284 }, { dx: 1, dy: 0, frame: 285 }, { dx: 2, dy: 0, frame: 286 }, { dx: 0, dy: 1, frame: 305 }, { dx: 1, dy: 1, frame: 306 }, { dx: 2, dy: 1, frame: 307 }], // 3x2
    [{ dx: 0, dy: 0, frame: 287 }, { dx: 1, dy: 0, frame: 288 }, { dx: 0, dy: 1, frame: 308 }, { dx: 1, dy: 1, frame: 309 }], // 2x2
    [{ dx: 0, dy: 0, frame: 289 }, { dx: 1, dy: 0, frame: 290 }, { dx: 0, dy: 1, frame: 310 }, { dx: 1, dy: 1, frame: 311 }], // 2x2
    [{ dx: 0, dy: 0, frame: 316 }, { dx: 0, dy: 1, frame: 337 }], // 1x2
    [{ dx: 0, dy: 0, frame: 317 }, { dx: 1, dy: 0, frame: 318 }, { dx: 0, dy: 1, frame: 338 }, { dx: 1, dy: 1, frame: 339 }], // 2x2
    [{ dx: 0, dy: 0, frame: 319 }, { dx: 1, dy: 0, frame: 320 }, { dx: 0, dy: 1, frame: 340 }, { dx: 1, dy: 1, frame: 341 }], // 2x2
    [{ dx: 0, dy: 0, frame: 321 }, { dx: 0, dy: 1, frame: 342 }], // 1x2
    [{ dx: 0, dy: 0, frame: 322 }, { dx: 1, dy: 0, frame: 323 }, { dx: 0, dy: 1, frame: 343 }, { dx: 1, dy: 1, frame: 344 }], // 2x2
    [{ dx: 0, dy: 0, frame: 324 }, { dx: 0, dy: 1, frame: 345 }], // 1x2
    [{ dx: 0, dy: 0, frame: 325 }, { dx: 1, dy: 0, frame: 326 }, { dx: 0, dy: 1, frame: 346 }, { dx: 1, dy: 1, frame: 347 }], // 2x2
    [{ dx: 0, dy: 0, frame: 327 }, { dx: 0, dy: 1, frame: 348 }], // 1x2
    [{ dx: 0, dy: 0, frame: 328 }], // 1x1
    [{ dx: 0, dy: 0, frame: 329 }], // 1x1
  ],
  obstacleArt: {
    tall: AssetKeys.obstacleTreeGrass1,
    low: AssetKeys.obstacleRockGrass1,
  },
};

const THEMES: Record<string, TerrainTheme> = { forest: FOREST_THEME };

/** The terrain theme for a level id; falls back to the forest theme for an unknown id. */
export function terrainThemeForLevel(levelId: string): TerrainTheme {
  return THEMES[levelId] ?? FOREST_THEME;
}
