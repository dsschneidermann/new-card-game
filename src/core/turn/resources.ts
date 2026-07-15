import type { ResourcePoolData } from './components';

/**
 * The player's INTRINSIC base resource maxima (ADR-005), before any equipped-item bonuses. A SINGLE source of
 * truth for both the WorldScene player spawn and the equip recompute (recomputeResourceMaxes /
 * recomputeMovementMax in items/equipment.ts), so the spawned maxima and the recomputed maxima can never
 * drift. Item stat bonuses (an amulet's manaBonus/movementBonus/energyBonus) are summed ON TOP of these.
 */
export const PLAYER_BASE_ENERGY_MAX = 3;
export const PLAYER_BASE_MANA_MAX = 5;
export const PLAYER_BASE_MANA_REGEN = 1;
export const PLAYER_BASE_MOVEMENT = 5;

/**
 * Pure mutators over a ResourcePool (ADR-005 economy). Energy refills fully each
 * player turn with no carry; mana regenerates a capped amount and carries over.
 * They mutate the passed pool in place (components are mutable data records).
 */

/** Refill energy to its max (no carry-over of unspent energy). */
export function refillEnergy(pool: ResourcePoolData): void {
  pool.energy = pool.energyMax;
}

/** Regenerate mana by manaRegen, capped at manaMax (unspent mana carries over). */
export function regenMana(pool: ResourcePoolData): void {
  pool.mana = Math.min(pool.manaMax, pool.mana + pool.manaRegen);
}

export function canAffordEnergy(pool: ResourcePoolData, cost: number): boolean {
  return cost <= pool.energy;
}

export function canAffordMana(pool: ResourcePoolData, cost: number): boolean {
  return cost <= pool.mana;
}

export function spendEnergy(pool: ResourcePoolData, cost: number): void {
  pool.energy -= cost;
}

export function spendMana(pool: ResourcePoolData, cost: number): void {
  pool.mana -= cost;
}
