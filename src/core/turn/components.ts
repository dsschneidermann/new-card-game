import { defineComponent, type ComponentType } from '../ecs/component';
import type { EntityId } from '../ecs/entity';

/** Whose turn it is within a round (ADR-005: a round is a player turn then an enemy turn). */
export type Phase = 'player' | 'enemy';

/** Global turn cursor (a singleton component, held by the player entity). */
export interface TurnStateData {
  phase: Phase;
  round: number;
  /** The actor currently taking its turn (the player, during the player phase). */
  activeActor?: EntityId;
}

/**
 * The player's two action resources (ADR-005). Energy (cards) refills to max
 * each player turn and does NOT carry; mana (spells) regenerates a capped amount
 * each turn and DOES carry. All values are data, never hardcoded.
 */
export interface ResourcePoolData {
  energy: number;
  energyMax: number;
  mana: number;
  manaMax: number;
  manaRegen: number;
}

/** Tiles the actor may still move this turn (ADR-006), refilled to max each turn. */
export interface MovementBudgetData {
  remaining: number;
  max: number;
}

export const TurnState: ComponentType<TurnStateData> = defineComponent<TurnStateData>('TurnState');
export const ResourcePool: ComponentType<ResourcePoolData> =
  defineComponent<ResourcePoolData>('ResourcePool');
export const MovementBudget: ComponentType<MovementBudgetData> =
  defineComponent<MovementBudgetData>('MovementBudget');
