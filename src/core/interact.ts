import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { System, World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import type { HexGrid } from './hex/grid';
import { findPath } from './hex/path';
import { HexPosition } from './hex/movement';
import { Chest, ChestOffer, rollChestRewardOffer, takeChestReward } from './chest';
import { Mimic, revealMimic } from './mimic';

/**
 * Approach-Interact core system (ADR-002): the shared "walk up to a prop and act on it" loop for the map's
 * interactable props — unopened chests and disguised mimics. A prop is targeted by a move (RequestInteract);
 * the mover travels to the hex BEFORE it (the prop's own last step is free, so it never blocks movement and
 * is never a stand-on destination), and on arrival the prop resolves: a chest rolls its reward offer and
 * emits ChestInteractReady, a disguised mimic wakes and emits MimicRevealed. The reward DATA + roll live in
 * chest.ts and the mimic data in mimic.ts; this module owns only the approach/arrive/resolve orchestration
 * common to both. Pure and Phaser-free — the scene maps input to RequestInteract/TakeChestReward and
 * presents the result.
 */

/**
 * Transient marker on an entity travelling to an interact target it targeted: the target (chest or
 * disguised mimic) and the exact hex it is heading to (the tile before the target). NOT persisted —
 * autosave only checkpoints at turn boundaries, so a mid-move interaction is never the saved state.
 * makeInteractSystem adds it when a travel move is issued and clears it when the entity arrives (or doesn't).
 */
export interface PendingInteractionData {
  /** The interact target being approached (an unopened chest or a disguised mimic). */
  target: EntityId;
  /** The hex the mover stops on (the tile before the target); arriving exactly here resolves the interact. */
  stopHex: Hex;
}
export const PendingInteraction: ComponentType<PendingInteractionData> =
  defineComponent<PendingInteractionData>('PendingInteraction', { persistent: false });

/**
 * The hex a mover at `from` stops on to interact with the prop at `targetHex`: the hex immediately preceding
 * it on the shortest path (the prop's own last step is free), or `from` itself when the mover is already
 * adjacent to (or standing on) it. Also returns `from` for an UNREACHABLE target, so a caller that has not
 * already gated on reachability must check findPath separately. The single source of the "stop before the
 * prop" rule, shared by makeInteractSystem and the move planner's route numbering.
 */
export function interactStopHex(grid: HexGrid, from: Hex, targetHex: Hex): Hex {
  const path = findPath(grid, from, targetHex);
  if (path.length < 2) return from; // unreachable, standing on it, or adjacent: no travel hex before it
  return path[path.length - 2] as Hex;
}

/** True when `target` is still a live interact target: an unopened chest or a disguised mimic. */
function isInteractable(world: World, target: EntityId): boolean {
  const chest = world.store(Chest).get(target);
  if (chest !== undefined) return chest.opened !== true;
  const mimic = world.store(Mimic).get(target);
  if (mimic !== undefined) return mimic.revealed !== true;
  return false;
}

/**
 * Resolve a reached interact target: an unopened chest rolls its reward offer and emits ChestInteractReady
 * (the scene plays the opening beat then shows the picker); a disguised mimic is revealed and emits
 * MimicRevealed (the scene swaps it to its monster animation).
 */
function resolveInteract(world: World, owner: EntityId, target: EntityId): void {
  const chest = world.store(Chest).get(target);
  if (chest !== undefined && chest.opened !== true) {
    // Roll the reward only on the FIRST open; a re-approach (the player dismissed the picker earlier, or
    // resumed a save) reuses the persisted offer so it presents the same choices. The offer is NOT
    // re-validated against current equipment after the first roll — "same rewards" is the contract.
    if (world.store(ChestOffer).get(target) === undefined) rollChestRewardOffer(world, owner, target);
    world.emit({ kind: 'ChestInteractReady', entity: owner, chest: target });
    return;
  }
  const mimic = world.store(Mimic).get(target);
  if (mimic !== undefined && mimic.revealed !== true) {
    revealMimic(world, target);
    world.emit({ kind: 'MimicRevealed', mimic: target });
  }
}

/**
 * Approach-Interact Core System (ADR-002): owns the chest/mimic interact RULES so the scene keeps only input
 * and presentation. Registered BEFORE the turn system, so a RequestMove it submits for an interact is
 * validated and executed by the turn + movement systems the SAME step (commands submitted by a later system
 * would be dropped at step end). Each step, in order:
 *   1. Resolve arrivals: for every entity carrying a PendingInteraction, if its position is exactly the stop
 *      hex resolve the interact (roll the chest offer + emit ChestInteractReady, or reveal the mimic + emit
 *      MimicRevealed) and clear the marker; if it ended anywhere else clear the marker WITHOUT resolving.
 *   2. RequestInteract: validate the target is interactable and reachable; if already adjacent resolve at
 *      once, else submit RequestMove(stopHex) and add the pending marker.
 *   3. TakeChestReward: apply takeChestReward, then emit ChestOpened if the chest is now opened.
 * Dismissing the picker needs no command — the rolled offer is kept so a later approach re-opens it.
 * Arrivals are resolved FIRST so a marker added THIS step is only checked from the next step — by which time
 * the same-step move has committed the entity's HexPosition to the stop hex.
 */
export function makeInteractSystem(grid: HexGrid): System {
  return (world) => {
    const positions = world.store(HexPosition);
    const pending = world.store(PendingInteraction);

    // 1. Resolve arrivals queued by earlier steps (snapshot — we remove markers while iterating).
    for (const [entity, marker] of [...pending.entries()]) {
      const here = positions.get(entity)?.hex;
      const arrived = here !== undefined && hexEquals(here, marker.stopHex);
      pending.remove(entity);
      if (arrived && isInteractable(world, marker.target)) resolveInteract(world, entity, marker.target);
    }

    // 2–4. Handle this step's commands (snapshot — we submit a RequestMove during the loop).
    for (const cmd of [...world.commands()]) {
      if (cmd.kind === 'RequestInteract') {
        const from = positions.get(cmd.entity)?.hex;
        const targetHex = positions.get(cmd.target)?.hex;
        if (from === undefined || targetHex === undefined) continue; // missing entity/target (defensive)
        if (!isInteractable(world, cmd.target)) continue; // opened chest / revealed mimic: not a target
        if (findPath(grid, from, targetHex).length === 0) continue; // unreachable (defensive)
        const stop = interactStopHex(grid, from, targetHex);
        if (hexEquals(stop, from)) {
          resolveInteract(world, cmd.entity, cmd.target); // already adjacent
          continue;
        }
        world.submit({ kind: 'RequestMove', entity: cmd.entity, q: stop.q, r: stop.r });
        pending.add(cmd.entity, { target: cmd.target, stopHex: stop });
      } else if (cmd.kind === 'TakeChestReward') {
        takeChestReward(world, cmd.entity, cmd.chest, cmd.chosen);
        if (world.store(Chest).get(cmd.chest)?.opened === true) world.emit({ kind: 'ChestOpened', chest: cmd.chest });
      }
    }
  };
}
