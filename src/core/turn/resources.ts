import type { ResourcePoolData } from './components';

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
