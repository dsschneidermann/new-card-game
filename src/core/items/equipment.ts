import { defineComponent, type ComponentType } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { World } from '../ecs/world';
import { DeckState, buildCardInstances, type DeckStateData } from '../cards/deck';
import { CombatStats } from '../combat/components';
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

/** Add `delta` to the owner's flat armour (Defense & Shielding). No-op when the owner has no CombatStats
 *  (e.g. a deck-only test fixture), so equipping never requires the player to be a full combatant. */
function adjustArmor(world: World, owner: EntityId, delta: number): void {
  if (delta === 0) return;
  const stats = world.store(CombatStats).get(owner);
  if (stats !== undefined) stats.armor = Math.max(0, stats.armor + delta);
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
  adjustArmor(world, owner, def.armor ?? 0); // its flat armour bonus joins the player's CombatStats
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
  adjustArmor(world, owner, -(itemDef(slot.defId)?.armor ?? 0)); // take its armour bonus back off
  delete equipment.slots[kind];
}

/**
 * Equip the player's starting items (STARTER_EQUIPMENT) in order, so the opening draw pile is exactly
 * their combined grants (the four basics -> 8 cards). The caller then shuffles + draws the opening hand.
 */
export function equipStartingItems(world: World, owner: EntityId): void {
  for (const id of STARTER_EQUIPMENT) equipItem(world, owner, id);
}
