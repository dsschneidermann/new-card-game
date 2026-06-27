import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { SeededRNG } from './ecs/rng';
import type { World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import { HexPosition } from './hex/movement';
import { DeckState, buildCardInstances } from './cards';
import { Equipment, equipItem } from './items';

/**
 * Treasure chests on the map (Chest Rewards feature). The player opens a chest by TARGETING it with a move
 * — a zero movement-point INTERACT: the move stops on the hex immediately preceding the chest (paying only
 * for that travel) and the chest opens (the makeInteractSystem in interact.ts drives this). A chest is never
 * a normal stand-on move destination, but it does NOT block movement — it can be passed through or landed on.
 * The interaction RULES (stop hex, arrival) live in interact.ts; this module owns the chest DATA + the reward
 * roll/apply (the interact system calls into it), and the scene maps input and shows the picker.
 *
 * The reward is a pick-one-of-three of ITEMS and/or CARDS, rolled at OPEN time (not at spawn) so it can
 * read current equipment and never offer an already-equipped item. The roll builds a ChestOffer of OPTION
 * ENTITIES — a card option is a real Card instance, an item option is an OfferedItem entity — which the
 * scene renders as faces. Choosing one applies it (a card to the player's discard pile, an item via
 * equipItem), the unchosen options are destroyed, and the chest is marked `opened` (kept on the map as a
 * purely-visual looted chest that no longer triggers). The offer is rolled ONCE, the first time the chest
 * is opened, and then PERSISTS — dismissing the picker keeps it, so re-approaching the same un-taken chest
 * presents the identical choices (and it survives save/load). Persisted: the chest + its `opened` flag,
 * plus the rolled offer (ChestOffer + its OfferedItem option entities) until it is taken. Pure and
 * Phaser-free (ADR-002) — the scene drives the UI choice, this owns the data + the mutation.
 */
export interface ChestData {
  /** Once taken from, the chest is purely visual: it shows the opened-chest sprite and no longer triggers. */
  opened?: boolean;
}
export const Chest: ComponentType<ChestData> = defineComponent<ChestData>('Chest');

/**
 * The rolled reward options a chest is currently offering: OPTION ENTITY ids (a Card instance for a card
 * option, an OfferedItem entity for an item option). Rolled at OPEN time by rollChestRewardOffer and cleared
 * only when the pick is TAKEN. PERSISTENT: the offer is rolled once and kept, so re-opening an un-taken chest
 * presents the same rewards and the choices survive save/load.
 */
export interface ChestOfferData {
  options: EntityId[];
}
export const ChestOffer: ComponentType<ChestOfferData> = defineComponent<ChestOfferData>('ChestOffer');

/**
 * An item OPTION inside a chest offer: a small entity that names the item def it would equip, so a mixed
 * card/item offer can be a uniform list of option entities the picker returns by id. PERSISTENT (like the
 * ChestOffer that references it) — created at roll, destroyed when the offer is taken.
 */
export interface OfferedItemData {
  defId: string;
}
export const OfferedItem: ComponentType<OfferedItemData> = defineComponent<OfferedItemData>('OfferedItem');

/** The cards a chest can offer: the non-basic cards (the basics come from the starting items). */
export const CHEST_CARD_POOL: readonly string[] = ['longstrike', 'quickdraw', 'sharpen', 'whirlwind', 'recall'];

/** The items a chest can offer: the non-starter items (the four basics are the player's starting equipment). */
export const CHEST_ITEM_POOL: readonly string[] = [
  'rusty_dagger',
  'leather_cap',
  'leather_tunic',
  'travelers_cape',
  'plain_amulet',
  'apprentice_spellbook',
];

/** How many reward choices a chest presents. */
export const CHEST_OFFER_SIZE = 3;

/**
 * Roll `n` DISTINCT ids from `pool` using the seeded rng (a partial Fisher–Yates over a copy).
 * Clamped to the pool size, so a pool smaller than `n` yields the whole pool (still no duplicates).
 * Deterministic for a given rng state, so a roll is reproducible and unit-testable.
 */
export function rollChestOffer(rng: SeededRNG, pool: readonly string[], n: number = CHEST_OFFER_SIZE): string[] {
  const bag = [...pool];
  const count = Math.min(n, bag.length);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const j = i + rng.int(bag.length - i); // pick from the not-yet-chosen tail [i, end)
    const tmp = bag[i] as string;
    bag[i] = bag[j] as string;
    bag[j] = tmp;
    out.push(bag[i] as string);
  }
  return out;
}

/** In-place Fisher–Yates shuffle using the seeded rng, so a mixed offer's options interleave deterministically. */
function shuffleInPlace<T>(arr: T[], rng: SeededRNG): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
}

/** The set of item def ids currently equipped on `owner` (so the chest never offers one the player has). */
function equippedItemDefIds(world: World, owner: EntityId): Set<string> {
  const ids = new Set<string>();
  const equipment = world.store(Equipment).get(owner);
  if (equipment === undefined) return ids;
  for (const slot of Object.values(equipment.slots)) {
    if (slot !== undefined) ids.add(slot.defId);
  }
  return ids;
}

/**
 * Spawn a chest at `hex`: attach Chest{} + HexPosition. Returns the chest entity id. The reward is NOT
 * rolled here — it is rolled at OPEN time by rollChestRewardOffer, so it can exclude already-equipped items.
 */
export function spawnChest(world: World, hex: Hex): EntityId {
  const chest = world.createEntity();
  world.store(Chest).add(chest, {});
  world.store(HexPosition).add(chest, { hex });
  return chest;
}

/** The chest standing on `hex`, or undefined if none (opened or not — a position query). */
export function chestAt(world: World, hex: Hex): EntityId | undefined {
  for (const chest of world.entitiesWith(Chest, HexPosition)) {
    const at = world.store(HexPosition).get(chest);
    if (at !== undefined && hexEquals(at.hex, hex)) return chest;
  }
  return undefined;
}

/**
 * The UNOPENED chest standing EXACTLY on `hex`, or undefined if none. An opened chest is purely visual
 * and not an interact target, so it is skipped. This is the chest the player opens by targeting `hex`
 * with a move; it is distinct from chestAt, which also matches opened chests at the hex.
 */
export function unopenedChestAt(world: World, hex: Hex): EntityId | undefined {
  const chest = chestAt(world, hex);
  if (chest === undefined) return undefined;
  return world.store(Chest).get(chest)?.opened ? undefined : chest;
}

/**
 * Roll a chest's reward offer at OPEN time and store it as option entities on the chest. The offer is a
 * guaranteed MIX: when both pools have eligible entries it includes at least one card AND at least one item
 * (item count 1..2, clamped to availability; the rest cards); if one pool is empty it fills all
 * CHEST_OFFER_SIZE from the other. Eligible items exclude any def already equipped on `owner`. A card option
 * becomes a real Card instance (so the picker shows a card face and a chosen card moves straight to the
 * discard pile); an item option becomes an OfferedItem entity. Replaces any existing offer cleanly
 * (destroying its option entities first), but the chest lifecycle (resolveInteract) only rolls on the FIRST
 * open — a re-approach reuses the kept offer rather than re-rolling, so the choices stay the same. Uses
 * world.rng, so the offer is deterministic for the rng state at the first open.
 */
export function rollChestRewardOffer(world: World, owner: EntityId, chest: EntityId): void {
  // Clear a stale offer (e.g. the player approached, cancelled, and approached again) so nothing leaks.
  const existing = world.store(ChestOffer).get(chest);
  if (existing !== undefined) {
    for (const opt of existing.options) world.destroyEntity(opt);
    world.store(ChestOffer).remove(chest);
  }

  const equipped = equippedItemDefIds(world, owner);
  const eligibleItems = CHEST_ITEM_POOL.filter((id) => !equipped.has(id));
  const eligibleCards = [...CHEST_CARD_POOL];

  let itemCount: number;
  let cardCount: number;
  if (eligibleItems.length === 0) {
    itemCount = 0;
    cardCount = Math.min(CHEST_OFFER_SIZE, eligibleCards.length);
  } else if (eligibleCards.length === 0) {
    itemCount = Math.min(CHEST_OFFER_SIZE, eligibleItems.length);
    cardCount = 0;
  } else {
    // Both pools available: guarantee at least one of each, leaving at least one slot for a card.
    const maxItems = Math.min(CHEST_OFFER_SIZE - 1, eligibleItems.length);
    itemCount = 1 + world.rng.int(maxItems); // 1..maxItems
    cardCount = CHEST_OFFER_SIZE - itemCount;
    if (cardCount > eligibleCards.length) {
      cardCount = eligibleCards.length;
      itemCount = CHEST_OFFER_SIZE - cardCount;
    }
  }

  const options: EntityId[] = [];
  // Card options are real Card instances; a chosen card moves straight to the discard pile.
  for (const inst of buildCardInstances(world, rollChestOffer(world.rng, eligibleCards, cardCount))) {
    options.push(inst);
  }
  // Item options are throwaway OfferedItem entities naming the def they would equip.
  for (const defId of rollChestOffer(world.rng, eligibleItems, itemCount)) {
    const option = world.createEntity();
    world.store(OfferedItem).add(option, { defId });
    options.push(option);
  }
  shuffleInPlace(options, world.rng); // interleave cards + items for the picker
  world.store(ChestOffer).add(chest, { options });
}

/**
 * Apply the player's pick from a chest's offer. `chosen` must be one of the chest's offered option
 * entities. A CARD option moves to `owner`'s discard pile (the instance is kept); an ITEM option is equipped
 * via equipItem (replacing any same-kind item) and its OfferedItem placeholder destroyed. Every UNCHOSEN
 * option entity is destroyed. The chest is marked `opened`, its offer cleared, and the entity kept as a
 * purely-visual looted chest. Defensive: if `chosen` is not one of the offered options, nothing happens.
 */
export function takeChestReward(world: World, owner: EntityId, chest: EntityId, chosen: EntityId): void {
  const offer = world.store(ChestOffer).get(chest);
  const chestData = world.store(Chest).get(chest);
  if (offer === undefined || chestData === undefined || !offer.options.includes(chosen)) return;
  const deck = world.store(DeckState).get(owner);
  for (const option of offer.options) {
    if (option === chosen) {
      const item = world.store(OfferedItem).get(option);
      if (item !== undefined) {
        equipItem(world, owner, item.defId); // equip the chosen item (replaces same-kind, grants its cards)
        world.destroyEntity(option); // the OfferedItem placeholder is consumed
      } else if (deck !== undefined) {
        deck.discardPile.push(option); // a chosen Card instance cycles in via the discard pile
      } else {
        world.destroyEntity(option); // no deck (defensive): discard the card instance
      }
    } else {
      world.destroyEntity(option); // unchosen options (cards + item placeholders) are destroyed
    }
  }
  world.store(ChestOffer).remove(chest);
  chestData.opened = true;
}
