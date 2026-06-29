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

// Procedural-terrain ALGORITHM helpers (level-agnostic; levels compose them — grass/dirt live in the forest).
export type { WarpOptions, OverlayTile, EdgeNeighbours, DecalShape, DecalShapeTile, ScatterOptions } from './terrain/terrain';
export { hash01, valueNoise, warpedNoise, opened2x2, overlayFor, scatterDecal } from './terrain/terrain';

// Levels: shared content-placement types + the pure level seam — the active-level component, the level ids
// + selection, and each level's pure terrain + procedural generators. The renderer pairs these with frames/art.
export type { EnemySpawn, ObstacleSpawn, ChestSpawn, LevelStateData, ForestTerrainKind, ForestTerrainTile, ForestTerrainOverlay } from './levels';
export {
  LevelState,
  FOREST_ID,
  selectLevelId,
  forestTerrainKind,
  forestTerrainTile,
  forestOverlay,
  forestLeaf,
  FOREST_COLS,
  FOREST_ROWS,
  forestStartHex,
  generateForestObstacles,
  generateForestChests,
  forestMimicIndex,
  forestPropFacing,
  FOREST_CHEST_MIN,
  FOREST_CHEST_MAX,
} from './levels';

// Obstacles: kinds + their move/sight rules, the persisted Obstacle component, and the grid-flag appliers
// (applyObstacles for a placement list, applyObstacleEntities for the restored entities on resume).
export type { ObstacleKind, ObstacleRule, ObstacleData } from './obstacles';
export { OBSTACLE_RULES, Obstacle, applyObstacles, applyObstacleEntities } from './obstacles';

// Character sprite animation helpers
export type { Facing } from './sprite';
export { facingFromIntent } from './sprite';

// Actor tags (player + enemy markers)
export type { PlayerData, EnemyData } from './actors';
export { Player, Enemy } from './actors';

// Combat & enemy archetypes: data-driven archetypes, the deterministic damage resolver, attack targeting
// (hex range + line of sight), the enemy spawn factory, and the shared Health/CombatStats/Attack/Archetype
// components (ADR-007). The scene animates off the emitted DamageDealt / AttackResolved / EntityDied events.
export type {
  AttackProfile,
  EnemyDef,
  DamageResult,
  HealthData,
  CombatStatsData,
  AttackData,
  ArchetypeData,
} from './combat';
export {
  ARCHETYPES,
  Health,
  CombatStats,
  Attack,
  Archetype,
  computeDamage,
  applyDamage,
  resolveAttack,
  inAttackRange,
  hasAttackLineOfSight,
  spawnEnemy,
} from './combat';

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

// Chests: reward pickups placed on the map (the Chest component, the card + item pools, the open-time mixed
// reward roll rolled once + persisted, and the apply). Mimics: disguised enemies that share the interact
// approach and reveal on it. The Approach-Interact Core System that drives both lives in interact.ts (below).
export type { ChestData, ChestOfferData, OfferedItemData } from './chest';
export {
  Chest,
  ChestOffer,
  OfferedItem,
  CHEST_CARD_POOL,
  CHEST_ITEM_POOL,
  CHEST_OFFER_SIZE,
  rollChestOffer,
  rollChestRewardOffer,
  spawnChest,
  chestAt,
  unopenedChestAt,
  takeChestReward,
} from './chest';
export type { MimicData } from './mimic';
export { Mimic, MIMIC_ART, spawnMimic, disguisedMimicAt, revealMimic } from './mimic';

// Approach-Interact Core System (interact.ts): the shared approach/arrive/resolve loop for interactable
// props (chests + disguised mimics), its pending-travel marker, and the stop-hex helper.
export type { PendingInteractionData } from './interact';
export { PendingInteraction, interactStopHex, makeInteractSystem } from './interact';

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
