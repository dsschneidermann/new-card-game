import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { SeededRNG } from './ecs/rng';
import type { System, World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import type { HexGrid } from './hex/grid';
import { findPath, hexesReachable } from './hex/path';
import { HexPosition } from './hex/movement';
import { DeckState, buildCardInstances } from './cards';

/**
 * Treasure chests on the map (Card, Item & Spell Pickups). The player opens a chest by TARGETING it with
 * a move — a zero movement-point INTERACT: the move stops on the hex immediately preceding the chest
 * (paying only for that travel) and the chest opens (makeChestSystem drives this).
 * A chest is never a normal stand-on move destination, but it does NOT block movement — it can be passed
 * through or landed on. The interaction RULES (stop hex, arrival, applying the pick) live in makeChestSystem
 * below; the scene only maps input and shows the picker. The player chooses one of three card rewards. A
 * chest OWNS three card-instance entities (its `offered`), rolled once at world-build
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

/**
 * Transient marker on an entity travelling to a chest it targeted: the chest it will open and the exact hex
 * it is heading to (the tile before the chest). NOT persisted (decision Q2) — autosave only checkpoints at
 * turn boundaries, so a mid-move chest interaction is never the saved state; this keeps SAVE_VERSION at 9.
 * makeChestSystem adds it when a travel move is issued and clears it when the entity arrives (or doesn't).
 */
export interface PendingChestInteractionData {
  /** The chest being approached. */
  chest: EntityId;
  /** The hex the mover stops on (the tile before the chest); arriving exactly here opens the chest. */
  stopHex: Hex;
}
export const PendingChestInteraction: ComponentType<PendingChestInteractionData> =
  defineComponent<PendingChestInteractionData>('PendingChestInteraction', { persistent: false });

/**
 * The hex a mover at `from` stops on to interact with the chest at `chestHex`: the hex immediately preceding
 * the chest on the shortest path (the chest's own last step is free), or `from` itself when the mover is
 * already adjacent to (or standing on) the chest. Also returns `from` for an UNREACHABLE chest, so a caller
 * that has not already gated on reachability must check findPath separately. The single source of the
 * "stop before the chest" rule, shared by makeChestSystem and the move planner's route numbering.
 */
export function chestStopHex(grid: HexGrid, from: Hex, chestHex: Hex): Hex {
  const path = findPath(grid, from, chestHex);
  if (path.length < 2) return from; // unreachable, standing on it, or adjacent: no travel hex before it
  return path[path.length - 2] as Hex;
}

/**
 * The hexes a move from `from` with `budget` movement points can TARGET: every hex reachable within the
 * budget, PLUS any unopened chest exactly one ring beyond it. A chest is a zero-cost interact — the move
 * stops on the hex before it — so a chest whose preceding hex is reachable (i.e. it sits at budget+1) is a
 * valid target even though a normal move could not end there. We expand the BFS by one ring and keep only
 * the chests it adds, so non-chest budget+1 hexes never become stand-on destinations. (With 0 budget the +1
 * ring is the neighbours, so an adjacent chest is still targetable.) Shared by the move planner's overlay /
 * commit gate, keyed by hexKey like hexesReachable so the planner can paint and test membership directly.
 */
export function chestInteractTargets(grid: HexGrid, world: World, from: Hex, budget: number): Map<string, Hex> {
  const reachable = hexesReachable(grid, from, budget);
  const expanded = hexesReachable(grid, from, budget + 1);
  for (const [key, hex] of expanded) {
    if (!reachable.has(key) && unopenedChestAt(world, hex) !== undefined) reachable.set(key, hex);
  }
  return reachable;
}

/**
 * Chest Interaction Core System (ADR-002): owns the chest pickup RULES so the scene keeps only input and
 * presentation. Registered BEFORE the turn system, so a RequestMove it submits for an interact is validated
 * and executed by the turn + movement systems the SAME step (commands submitted by a later system would be
 * dropped at step end). Each step, in order:
 *   1. Resolve arrivals: for every entity carrying a PendingChestInteraction, if its position is exactly the
 *      stop hex emit ChestInteractReady and clear the marker; if it ended anywhere else (move rejected, or a
 *      future trap/status interrupted it) clear the marker WITHOUT emitting — the chest stays closed.
 *   2. RequestChestInteract: validate the chest is unopened and reachable; if already adjacent emit
 *      ChestInteractReady at once, else submit RequestMove(stopHex) and add the pending marker.
 *   3. TakeChestCard: apply takeChestCard, then emit ChestOpened if the chest is now opened.
 * Arrivals are resolved FIRST so a marker added THIS step is only checked from the next step — by which time
 * the same-step move has committed the entity's HexPosition to the stop hex.
 */
export function makeChestSystem(grid: HexGrid): System {
  return (world) => {
    const positions = world.store(HexPosition);
    const chests = world.store(Chest);
    const pending = world.store(PendingChestInteraction);

    // 1. Resolve arrivals queued by earlier steps (snapshot — we remove markers while iterating).
    for (const [entity, marker] of [...pending.entries()]) {
      const here = positions.get(entity)?.hex;
      const arrived = here !== undefined && hexEquals(here, marker.stopHex);
      pending.remove(entity);
      const data = chests.get(marker.chest);
      if (arrived && data !== undefined && data.opened !== true) {
        world.emit({ kind: 'ChestInteractReady', entity, chest: marker.chest });
      }
    }

    // 2 & 3. Handle this step's commands (snapshot — we submit a RequestMove during the loop).
    for (const cmd of [...world.commands()]) {
      if (cmd.kind === 'RequestChestInteract') {
        const from = positions.get(cmd.entity)?.hex;
        const chestHex = positions.get(cmd.chest)?.hex;
        if (from === undefined || chestHex === undefined) continue; // missing entity/chest (defensive)
        if (chests.get(cmd.chest)?.opened === true) continue; // opened chests are not interact targets
        if (findPath(grid, from, chestHex).length === 0) continue; // unreachable (defensive)
        const stop = chestStopHex(grid, from, chestHex);
        if (hexEquals(stop, from)) {
          world.emit({ kind: 'ChestInteractReady', entity: cmd.entity, chest: cmd.chest }); // already adjacent
          continue;
        }
        world.submit({ kind: 'RequestMove', entity: cmd.entity, q: stop.q, r: stop.r });
        pending.add(cmd.entity, { chest: cmd.chest, stopHex: stop });
      } else if (cmd.kind === 'TakeChestCard') {
        takeChestCard(world, cmd.owner, cmd.chest, cmd.chosen);
        if (chests.get(cmd.chest)?.opened === true) world.emit({ kind: 'ChestOpened', chest: cmd.chest });
      }
    }
  };
}
