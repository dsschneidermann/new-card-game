// Shared per-level content-placement types (generators produce them; the renderer Level spawns entities).
export type { EnemySpawn, ObstacleSpawn, ChestSpawn } from './levels';

// The active-level component (persisted) + the pure level-selection seam.
export type { LevelStateData } from './levelState';
export { LevelState } from './levelState';
export { FOREST_ID, SPACE_ID, selectLevelId } from './select';

// Forest level — pure terrain + procedural placement (the renderer pairs these with its frames/art).
export type { TerrainKind, TerrainTile, TerrainOverlay } from './forest/terrain';
export { forestTerrainKind, forestTerrainTile, forestOverlay, forestLeaf } from './forest/terrain';
export { FOREST_COLS, FOREST_ROWS, forestStartHex, generateForestObstacles, generateForestChests } from './forest/forest';

// Space level (TEMPORARY) — pure asteroid placement + void dims.
export { SPACE_COLS, SPACE_ROWS, spaceStartHex, generateSpaceObstacles } from './space/space';
