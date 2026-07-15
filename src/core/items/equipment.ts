import { defineComponent, type ComponentType } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { World } from '../ecs/world';
import { DeckState, buildCardInstances, type DeckStateData } from '../cards/deck';
import { CombatStats } from '../combat/components';
import { ResourcePool, MovementBudget } from '../turn/components';
import { PLAYER_BASE_ENERGY_MAX, PLAYER_BASE_MANA_MAX, PLAYER_BASE_MOVEMENT } from '../turn/resources';
import { itemDef, STARTER_EQUIPMENT } from './content';
import type { EquipKind } from './types';

/**
 * Equipment & item-granted cards (Card, Item & Spell Pickups). An equipped item OWNS the card
 * instances it grants: equipItem creates one Card instance per entry in the item's grantsCards and
 * adds them to the draw pile, recording their ids on the slot; replacing or unequipping the same-kind
 * item destroys exactly those instances wherever they sit (draw / hand / discard). The starting deck is
 * therefore DERIVED from the player's starting items (equipStartingItems), not a static list. Pure and
 * Phaser-free (ADR-002): plain functions that mutate the World's DeckState + Equipment stores, the same
 * way the deck is built at world-create.
 */

/** One filled equipment slot: which item def, and the card-instance ids it granted (so they can be
 *  destroyed exactly when the item is later replaced / unequipped). */
export interface EquippedItem {
  defId: string;
  grantedCards: EntityId[];
}

/** The player's equipment: at most one item per kind. A persistent singleton on the player entity. */
export interface EquipmentData {
  slots: Partial<Record<EquipKind, EquippedItem>>;
}

export const Equipment: ComponentType<EquipmentData> = defineComponent<EquipmentData>('Equipment');

/**
 * The spells the player can currently cast (Core Gaps: spellbook-granted spells). DERIVED from the equipped
 * loadout, never instance-owned: recomputeKnownSpells rebuilds it from the union of every equipped item's
 * grantsSpells on each equip/unequip (mirroring recomputeArmor), so equipping a spellbook makes its spells
 * available and replacing the slot removes them. A persistent singleton on the player; the spell sidebar is
 * built from it (not from all SPELL_DEFS).
 */
export interface KnownSpellsData {
  spellIds: string[];
}

export const KnownSpells: ComponentType<KnownSpellsData> =
  defineComponent<KnownSpellsData>('KnownSpells');

/**
 * Recompute the owner's total armour FROM SCRATCH: their intrinsic baseArmor plus the armour of every
 * currently-equipped item. Called after any equip/unequip so CombatStats.armor is always derived from the
 * live loadout — never an accumulated +=/-= delta that could drift out of sync over a long run if the two
 * sides ever fall out of balance. Idempotent: running it twice yields the same total. No-op when the owner
 * is not a combatant (no CombatStats) — equipping never requires the player to be a full combatant.
 */
function recomputeArmor(world: World, owner: EntityId): void {
  const stats = world.store(CombatStats).get(owner);
  const equipment = world.store(Equipment).get(owner);
  if (stats === undefined || equipment === undefined) return;
  let total = stats.baseArmor;
  for (const slot of Object.values(equipment.slots)) {
    if (slot !== undefined) total += itemDef(slot.defId)?.armor ?? 0;
  }
  stats.armor = Math.max(0, total);
}

/**
 * Recompute the owner's KnownSpells FROM SCRATCH: the de-duped union of grantsSpells over every currently-
 * equipped item (today only a spellbook grants spells). Called after any equip/unequip so the available
 * spells are always derived from the live loadout — never an accumulated list that could drift. Creates the
 * KnownSpells component if the owner lacks it. No-op when the owner has no Equipment.
 */
function recomputeKnownSpells(world: World, owner: EntityId): void {
  const equipment = world.store(Equipment).get(owner);
  if (equipment === undefined) return;
  const ids = new Set<string>();
  for (const slot of Object.values(equipment.slots)) {
    if (slot === undefined) continue;
    for (const spellId of itemDef(slot.defId)?.grantsSpells ?? []) ids.add(spellId);
  }
  const known = world.store(KnownSpells).get(owner);
  if (known === undefined) world.store(KnownSpells).add(owner, { spellIds: [...ids] });
  else known.spellIds = [...ids];
}

/**
 * Recompute the owner's resource MAXIMA from scratch: the player's intrinsic base (PLAYER_BASE_*) plus the
 * sum of every equipped item's energyBonus / manaBonus (Amulet & Potion Items). Called after any equip/unequip
 * so ResourcePool.energyMax / manaMax are always DERIVED from the live loadout — the SAME recompute-from-base
 * discipline as recomputeArmor (never an accumulated +=/-= delta that could drift over a run). No-op when the
 * owner has no ResourcePool. Current energy/mana are left alone: the new max takes effect on the next
 * refill/regen, so equipping mid-turn does not retroactively top up the pool.
 */
function recomputeResourceMaxes(world: World, owner: EntityId): void {
  const pool = world.store(ResourcePool).get(owner);
  const equipment = world.store(Equipment).get(owner);
  if (pool === undefined || equipment === undefined) return;
  let energyBonus = 0;
  let manaBonus = 0;
  for (const slot of Object.values(equipment.slots)) {
    if (slot === undefined) continue;
    const def = itemDef(slot.defId);
    energyBonus += def?.energyBonus ?? 0;
    manaBonus += def?.manaBonus ?? 0;
  }
  pool.energyMax = PLAYER_BASE_ENERGY_MAX + energyBonus;
  pool.manaMax = PLAYER_BASE_MANA_MAX + manaBonus;
}

/**
 * Recompute the owner's movement MAX from scratch: the base movement budget plus the sum of every equipped
 * item's movementBonus (recompute-from-base, like recomputeArmor). No-op when the owner has no MovementBudget.
 * MovementBudget.remaining is untouched — the larger budget applies from the next turn's refill.
 */
function recomputeMovementMax(world: World, owner: EntityId): void {
  const budget = world.store(MovementBudget).get(owner);
  const equipment = world.store(Equipment).get(owner);
  if (budget === undefined || equipment === undefined) return;
  let bonus = 0;
  for (const slot of Object.values(equipment.slots)) {
    if (slot !== undefined) bonus += itemDef(slot.defId)?.movementBonus ?? 0;
  }
  budget.max = PLAYER_BASE_MOVEMENT + bonus;
}

/** Remove an instance id from whichever of the deck's three piles holds it (no-op if in none). */
function removeFromPiles(deck: DeckStateData, inst: EntityId): void {
  for (const pile of [deck.drawPile, deck.hand, deck.discardPile]) {
    const i = pile.indexOf(inst);
    if (i !== -1) {
      pile.splice(i, 1);
      return;
    }
  }
}

/**
 * Equip `itemDefId` on `owner`. If a different item already fills that item's kind it is unequipped
 * first (its granted cards destroyed). The item's grantsCards are instantiated as fresh Card entities,
 * pushed onto the draw pile, and recorded on the slot. No-op when the item id or the owner's Equipment
 * store is missing.
 */
export function equipItem(world: World, owner: EntityId, itemDefId: string): void {
  const def = itemDef(itemDefId);
  const equipment = world.store(Equipment).get(owner);
  if (def === undefined || equipment === undefined) return;
  if (equipment.slots[def.kind] !== undefined) unequipItem(world, owner, def.kind);
  const granted = buildCardInstances(world, def.grantsCards);
  const deck = world.store(DeckState).get(owner);
  if (deck !== undefined) deck.drawPile.push(...granted);
  equipment.slots[def.kind] = { defId: def.id, grantedCards: granted };
  recomputeArmor(world, owner); // re-derive total armour from the full loadout (never an incremental delta)
  recomputeKnownSpells(world, owner); // re-derive available spells (a spellbook grants them)
  recomputeResourceMaxes(world, owner); // re-derive energy/mana max from the full loadout (amulet bonuses)
  recomputeMovementMax(world, owner); // re-derive movement max from the full loadout (movement amulet)
}

/**
 * Unequip the item in `kind`'s slot: destroy exactly the card instances it granted (removing each from
 * whichever pile holds it, then destroying the entity) and clear the slot. No-op if the slot is empty.
 */
export function unequipItem(world: World, owner: EntityId, kind: EquipKind): void {
  const equipment = world.store(Equipment).get(owner);
  const slot = equipment?.slots[kind];
  if (equipment === undefined || slot === undefined) return;
  const deck = world.store(DeckState).get(owner);
  for (const inst of slot.grantedCards) {
    if (deck !== undefined) removeFromPiles(deck, inst);
    world.destroyEntity(inst);
  }
  delete equipment.slots[kind];
  recomputeArmor(world, owner); // re-derive total armour from the now-smaller loadout
  recomputeKnownSpells(world, owner); // re-derive available spells from the now-smaller loadout
  recomputeResourceMaxes(world, owner); // re-derive energy/mana max from the now-smaller loadout
  recomputeMovementMax(world, owner); // re-derive movement max from the now-smaller loadout
}

/**
 * Equip the player's starting items (STARTER_EQUIPMENT) in order, so the opening draw pile is exactly
 * their combined grants (the four basics -> 8 cards). The caller then shuffles + draws the opening hand.
 */
export function equipStartingItems(world: World, owner: EntityId): void {
  for (const id of STARTER_EQUIPMENT) equipItem(world, owner, id);
}
