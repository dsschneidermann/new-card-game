/**
 * Pure, engine-agnostic game core (ADR-002).
 *
 * Nothing in `src/core` imports `phaser` or touches the DOM (enforced by
 * `corePurity.test.ts`). This barrel re-exports the ECS & Game Loop substrate,
 * the screen-flow state machine, and the asset manifest/validation.
 */

// Entity Component System & Game Loop (feature 02)
export type { EntityId } from './ecs/entity';
export type { Component, ComponentType, ComponentStore, ComponentOptions } from './ecs/component';
export { defineComponent, componentByName } from './ecs/component';
export type { SeededRNG } from './ecs/rng';
export { makeRng } from './ecs/rng';
export type { Command } from './ecs/commands';
export type { GameEvent } from './ecs/events';
export { CommandQueue, EventBus } from './ecs/queue';
export type { World, System, StepContext, WorldSnapshot } from './ecs/world';
export { createWorld, advance, serializeWorld, restoreWorld } from './ecs/world';

// Persistence & save foundation (feature 06)
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

// Screen-flow state machine (feature 04)
export type { ScreenState, ScreenEvent, FlowContext, FlowResult, SavePresence } from './flow/screenFlow';
export { transition, INITIAL_SCREEN } from './flow/screenFlow';

// Asset manifest & validation (feature 03)
export type { AssetDescriptor, ManifestEntry, ValidationReport } from './assets/manifest';
export { AssetManifest, frameConfig, assetScale, spriteOffset } from './assets/manifest';
export type { AssetKey } from './assets/registry';
export { GAME_ASSETS, manifest, AssetKeys, USED_ASSET_KEYS, resolveKey, validateManifest } from './assets/registry';

// Hex grid, pathfinding & movement (feature 05)
export type { Hex } from './hex/hex';
export { hexKey, hexEquals, hexAdd, neighbors, hexDistance, HEX_DIRECTIONS } from './hex/hex';
export type { HexLayout, Offset } from './hex/layout';
export { hexToPixel, pixelToHex, axialToOffset, offsetToAxial } from './hex/layout';
export { HexGrid } from './hex/grid';
export { findPath } from './hex/path';
export { hexLine, hexesWithinRange } from './hex/range';
export type { HexPositionData, MovePathData, FacingData } from './hex/movement';
export { HexPosition, MovePath, FacingState, makeMovementSystem, facingToward } from './hex/movement';

// Character sprite animation helpers (feature 14)
export type { Facing } from './sprite';
export { facingFromIntent } from './sprite';

// Actor tags (feature 06 player marker; feature 07 enemy marker)
export type { PlayerData, EnemyData } from './actors';
export { Player, Enemy } from './actors';

// Turn Engine: phases, resource economy, enemy-turn runner (feature 07)
export type {
  Phase,
  TurnStateData,
  ResourcePoolData,
  MovementBudgetData,
  TurnHooks,
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

// Cards: definitions, targeting, the card-entity deck cycle, and stat effects (feature 09 + Card
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
  STARTER_COLLECTION,
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

// Display settings: viewport, resolution & the manual pixel-scale (browser pixel clarity)
export type { ViewportMode, ResolutionTier, DisplaySettings } from './display';
export {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_KEY,
  DESKTOP_SCALE,
  BASE_WIDTH,
  BASE_HEIGHT,
  scaleFactorFor,
  setScaleFactor,
  s,
  viewportScaleMode,
  serializeDisplaySettings,
  parseDisplaySettings,
} from './display';
