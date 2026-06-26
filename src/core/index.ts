/**
 * Pure, engine-agnostic game core (ADR-002).
 *
 * Nothing in `src/core` imports `phaser` or touches the DOM (enforced by
 * `corePurity.test.ts`). This barrel re-exports the ECS & Game Loop substrate,
 * the screen-flow state machine, and the asset manifest/validation.
 */

// Entity Component System & Game Loop
export type { EntityId } from './ecs/entity';
export type { Component, ComponentType, ComponentStore, ComponentOptions } from './ecs/component';
export { defineComponent, componentByName } from './ecs/component';
export type { SeededRNG } from './ecs/rng';
export { makeRng } from './ecs/rng';
export type { Command } from './ecs/commands';
export type { GameEvent } from './ecs/events';
export { CommandQueue, EventBus } from './ecs/queue';
export type { World, System, WorldSnapshot } from './ecs/world';
export { createWorld, advance, serializeWorld, restoreWorld } from './ecs/world';

// Persistence & save foundation
export type { StorageAdapter, SaveStateV1, LoadResult } from './save';
export {
  InMemoryStorageAdapter,
  SAVE_KEY,
  SAVE_VERSION,
  serializeSave,
  applySave,
  saveRun,
  loadRun,
  clearRun,
  hasSave,
} from './save';

// Screen-flow state machine
export type { ScreenState, ScreenEvent, FlowContext, FlowResult, SavePresence } from './flow/screenFlow';
export { transition, INITIAL_SCREEN } from './flow/screenFlow';

// Asset manifest & validation
export type { AssetDescriptor, ManifestEntry, ValidationReport } from './assets/manifest';
export { AssetManifest, frameConfig, assetScale, spriteOffset, frameRowOffsetY } from './assets/manifest';
export type { AssetKey } from './assets/registry';
export { GAME_ASSETS, manifest, AssetKeys, USED_ASSET_KEYS, resolveKey, validateManifest } from './assets/registry';

// Hex grid, pathfinding & movement
export type { Hex } from './hex/hex';
export { hexKey, hexEquals, hexAdd, neighbors, hexDistance, HEX_DIRECTIONS } from './hex/hex';
export type { HexLayout, Offset, WorldPixelBounds } from './hex/layout';
export { hexToPixel, pixelToHex, axialToOffset, offsetToAxial, worldPixelBounds } from './hex/layout';
export { HexGrid } from './hex/grid';
export { findPath, hexesReachable } from './hex/path';
export { hexLine, hexesWithinRange } from './hex/range';
export type { LineOfSightResult } from './hex/los';
export { hasLineOfSight, lineOfSightPath } from './hex/los';
export type { HexPositionData, FacingData } from './hex/movement';
export { HexPosition, FacingState, makeMovementSystem, facingToward } from './hex/movement';

// Procedural ground terrain (its own square background grid; the hexes render on top)
export type { TerrainKind, TerrainTile, TerrainOverlay, GrassNeighbours, LeafShape, LeafShapeTile } from './terrain/terrain';
export { terrainTile, terrainKind, terrainOverlay, overlayFor, terrainLeaf, valueNoise } from './terrain/terrain';

// Levels: pure per-level definitions (size, start hex, enemy spawns, obstacles, terrain seed). The
// renderer pairs each with a terrain theme by id (src/render/terrainTheme.ts); the seed feeds the pure terrain fns.
export type { EnemySpawn, ObstacleSpawn, LevelDef } from './levels';
export { FOREST_LEVEL } from './levels';

// Obstacles: kinds + their move/sight rules, the persisted Obstacle component, and applyObstacles (grid flags).
export type { ObstacleKind, ObstacleRule, ObstacleData } from './obstacles';
export { OBSTACLE_RULES, Obstacle, applyObstacles } from './obstacles';

// Character sprite animation helpers
export type { Facing } from './sprite';
export { facingFromIntent } from './sprite';

// Actor tags (player + enemy markers)
export type { PlayerData, EnemyData } from './actors';
export { Player, Enemy } from './actors';

// Turn Engine: phases, resource economy, enemy-turn runner
export type {
  Phase,
  TurnStateData,
  ResourcePoolData,
  MovementBudgetData,
  Validation,
} from './turn';
export {
  TurnState,
  ResourcePool,
  MovementBudget,
  refillEnergy,
  regenMana,
  spendEnergy,
  spendMana,
  canAffordEnergy,
  canAffordMana,
  makeTurnSystem,
  turnActor,
  canMove,
  canPlayCard,
  canPlaySpell,
} from './turn';

// Cards: definitions, targeting, the card-entity deck cycle, and stat effects (Card
// Entities, Deck Cycle & Stat Effects)
export type {
  CardDef,
  SpellDef,
  TargetSpec,
  Highlight,
  CardEffect,
  CardPick,
  DeckStateData,
  CardData,
  CardModsData,
  TempCardModsData,
} from './cards';
export {
  DeckState,
  Card,
  CardMods,
  TempCardMods,
  effectiveCost,
  buildCardInstances,
  reshuffle,
  drawOne,
  drawUpTo,
  CARD_DEFS,
  SPELL_DEFS,
  cardDef,
  spellDef,
  isAttackCard,
  isHeavyAttack,
  resolveTargeting,
  targetMaxRange,
  makeCardSystem,
  cardEffectiveCost,
  isTempFree,
  sortPileForDisplay,
  pickCandidates,
} from './cards';

// Items & equipment: ItemDef/EquipKind, the content registry, the Equipment component + equip ops
export type { EquipKind, ItemDef, EquippedItem, EquipmentData } from './items';
export {
  EQUIP_KINDS,
  ITEM_DEFS,
  STARTER_EQUIPMENT,
  itemDef,
  Equipment,
  equipItem,
  unequipItem,
  equipStartingItems,
} from './items';

// Chests: reward pickups placed on the map (the Chest component, the card pool, roll/spawn/query/take)
export type { ChestData } from './chest';
export {
  Chest,
  CHEST_CARD_POOL,
  CHEST_OFFER_SIZE,
  rollChestOffer,
  spawnChest,
  chestAt,
  unopenedChestAt,
  takeChestCard,
} from './chest';

// Display settings: viewport, resolution & the manual pixel-scale (browser pixel clarity)
export type { ViewportMode, ResolutionTier, DisplaySettings } from './display';
export {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_KEY,
  IPAD_SCALE,
  BASE_WIDTH,
  BASE_HEIGHT,
  scaleFactorFor,
  setScaleFactor,
  s,
  viewportScaleMode,
  serializeDisplaySettings,
  parseDisplaySettings,
} from './display';
