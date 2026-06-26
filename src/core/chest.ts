import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { SeededRNG } from './ecs/rng';
import type { World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import { HexPosition } from './hex/movement';
import { DeckState, buildCardInstances } from './cards';

/**
 * Treasure chests on the map (Card, Item & Spell Pickups). The player opens a chest by TARGETING it with
 * a move — a zero movement-point INTERACT: the move stops on the hex immediately preceding the chest
 * (paying only for that travel) and the chest opens (the scene's requestChestInteract drives this).
 * A chest is never a normal stand-on move destination, but it does NOT block movement — it can be passed
 * through or landed on. The player chooses one of three card rewards. A chest OWNS three card-instance
 * entities (its `offered`), rolled once at world-build
 * from the chest card pool via world.rng; choosing one moves that instance to the player's discard pile,
 * the two unchosen cards are destroyed, and the chest is marked `opened` (it is NOT destroyed — it stays
 * on the map as a purely-visual looted chest that no longer triggers). Persisted: the chest entity, its
 * `offered` ids, the `opened` flag, and each offered instance's Card component round-trip with the save.
 * Pure and Phaser-free (ADR-002) — the scene drives the UI choice, this owns the data + the mutation.
 */
export interface ChestData {
  /** The three card-instance entities the chest offers (each carries a Card { defId }); emptied once opened. */
  offered: EntityId[];
  /** Once taken from, the chest is purely visual: it shows the opened-chest sprite and no longer triggers. */
  opened?: boolean;
}
export const Chest: ComponentType<ChestData> = defineComponent<ChestData>('Chest');

/** The cards a chest can offer: the non-basic cards (the basics come from the starting items). */
export const CHEST_CARD_POOL: readonly string[] = ['longstrike', 'quickdraw', 'sharpen', 'whirlwind', 'recall'];

/** How many card choices a chest presents. */
export const CHEST_OFFER_SIZE = 3;

/**
 * Roll `n` DISTINCT card def ids from `pool` using the seeded rng (a partial Fisher–Yates over a copy).
 * Clamped to the pool size, so a pool smaller than `n` yields the whole pool (still no duplicates).
 * Deterministic for a given rng state, so chest contents are reproducible and unit-testable.
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

/**
 * Spawn a chest at `hex`: roll its offered card defs, instantiate each as a Card entity the chest owns,
 * and attach Chest{offered} + HexPosition. Returns the chest entity id. Uses world.rng so the offered
 * cards are deterministic and persisted.
 */
export function spawnChest(
  world: World,
  hex: Hex,
  pool: readonly string[] = CHEST_CARD_POOL,
  n: number = CHEST_OFFER_SIZE,
): EntityId {
  const offered = buildCardInstances(world, rollChestOffer(world.rng, pool, n));
  const chest = world.createEntity();
  world.store(Chest).add(chest, { offered });
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
 * with a move (a zero-cost interact resolved in the scene); it is distinct from chestAt, which also
 * matches opened chests at the hex.
 */
export function unopenedChestAt(world: World, hex: Hex): EntityId | undefined {
  const chest = chestAt(world, hex);
  if (chest === undefined) return undefined;
  return world.store(Chest).get(chest)?.opened ? undefined : chest;
}

/**
 * Take `chosen` (one of the chest's offered instances) into `owner`'s discard pile and destroy the two
 * unchosen offered instances. The chest entity is NOT destroyed: it is marked `opened` and its `offered`
 * list cleared, leaving it on the map as a purely-visual looted chest that no longer triggers. Defensive:
 * if `chosen` is not one of the chest's offered cards, nothing is taken and the chest is left intact
 * (the caller passed a stale id).
 */
export function takeChestCard(world: World, owner: EntityId, chest: EntityId, chosen: EntityId): void {
  const data = world.store(Chest).get(chest);
  if (data === undefined || !data.offered.includes(chosen)) return;
  const deck = world.store(DeckState).get(owner);
  for (const inst of data.offered) {
    if (inst === chosen && deck !== undefined) deck.discardPile.push(inst);
    else world.destroyEntity(inst); // unchosen cards (and the chosen one if there is no deck) are discarded
  }
  data.offered = [];
  data.opened = true;
}
