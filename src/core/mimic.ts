import { defineComponent, type ComponentType } from './ecs/component';
import type { EntityId } from './ecs/entity';
import type { World } from './ecs/world';
import { hexEquals, type Hex } from './hex/hex';
import { HexPosition } from './hex/movement';
import { Enemy } from './actors';

/**
 * Mimic enemies (Chest Rewards feature): a monster that DISGUISES itself as a closed chest on the map and
 * only REVEALS when the player approaches it like a chest. A mimic is a normal Enemy (art 'enemy_mimic_1')
 * carrying a Mimic component; while `revealed` is false it is rendered as the static chest-disguise frame
 * and is a valid chest-style interact target, and approaching it wakes it to its idle-monster animation
 * (the interact system flips `revealed` and emits MimicRevealed). There is no wake-combat yet — that lands
 * with the enemy archetype / AI features. Pure and Phaser-free (ADR-002): the data + the reveal mutation
 * live here; the scene only swaps the sprite on the event.
 */
export interface MimicData {
  /** Once revealed (approached), the mimic shows its monster animation and is no longer an interact target. */
  revealed?: boolean;
}
export const Mimic: ComponentType<MimicData> = defineComponent<MimicData>('Mimic');

/** The roster art base for the mimic enemy (the renderer draws `${MIMIC_ART}.unopened` disguised, `${MIMIC_ART}.idle` revealed). */
export const MIMIC_ART = 'enemy_mimic_1';

/**
 * Spawn a disguised mimic at `hex`: an Enemy (so future combat/AI iterate it) carrying a Mimic component
 * (revealed unset = disguised) + HexPosition. Returns the mimic entity id. The renderer draws it as the
 * closed-chest disguise until it is revealed.
 */
export function spawnMimic(world: World, hex: Hex): EntityId {
  const mimic = world.createEntity();
  world.store(Enemy).add(mimic, { isEnemy: true, art: MIMIC_ART });
  world.store(Mimic).add(mimic, {});
  world.store(HexPosition).add(mimic, { hex });
  return mimic;
}

/**
 * The DISGUISED (un-revealed) mimic standing EXACTLY on `hex`, or undefined if none. A revealed mimic is a
 * plain enemy and not an interact target, so it is skipped. This is the mimic the player can "open" by
 * targeting `hex` with a move — the chest-style interact that wakes it (interactTargetAt pairs it with
 * unopenedChestAt so a chest and a disguised mimic are targeted identically).
 */
export function disguisedMimicAt(world: World, hex: Hex): EntityId | undefined {
  for (const [mimic, data] of world.store(Mimic).entries()) {
    if (data.revealed === true) continue;
    const at = world.store(HexPosition).get(mimic);
    if (at !== undefined && hexEquals(at.hex, hex)) return mimic;
  }
  return undefined;
}

/** Reveal a mimic: it wakes from its disguise to its monster form (the renderer swaps to the idle animation). */
export function revealMimic(world: World, mimic: EntityId): void {
  const data = world.store(Mimic).get(mimic);
  if (data !== undefined) data.revealed = true;
}
