// Shared per-level content-placement types (generators produce them; the renderer Level spawns entities).
export type { EnemySpawn, ObstacleSpawn, ChestSpawn } from './levels';

// The active-level component (persisted) + the pure level-selection seam.
export type { LevelStateData } from './levelState';
export { LevelState } from './levelState';
export { FOREST_ID, selectLevelId } from './select';

// Forest level — pure terrain + procedural placement (the renderer pairs these with its frames/art).
export type { ForestTerrainKind, ForestTerrainTile, ForestTerrainOverlay } from './forest/terrain';
export {
  forestTerrainKind,
  forestTerrainTile,
  forestOverlay,
  forestLeaf,
  forestHexTerrainClass,
  FOREST_TILE_W,
  FOREST_TILE_H,
} from './forest/terrain';
// Forest object registry: the declarative list of placeable obstruction props + their placement rules.
export type { ForestObjectTerrain, ForestObjectPlacement, ForestObjectDef } from './forest/objects';
export { FOREST_OBJECTS, forestObjectDef } from './forest/objects';
export {
  FOREST_COLS,
  FOREST_ROWS,
  forestStartHex,
  generateForestObstacles,
  generateForestChests,
  generateForestEnemies,
  forestMimicIndex,
  forestPropFacing,
  forestObjectVariantIndex,
  forestObjectFlipped,
  FOREST_CHEST_MIN,
  FOREST_CHEST_MAX,
  FOREST_ENEMY_MIN,
  FOREST_ENEMY_MAX,
} from './forest/forest';
